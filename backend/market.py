import re
import time
from datetime import datetime, timezone, timedelta, date, time as dtime
from zoneinfo import ZoneInfo

import httpx

UA = {"User-Agent": "Mozilla/5.0"}
HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]
SOURCE_LABEL = "Yahoo Finance (free, delayed)"

MARKETS = {
    "US": {
        "tz": "America/New_York", "open": dtime(9, 30), "close": dtime(16, 0), "early": dtime(13, 0),
        "currency": "USD", "index": "^GSPC", "index_name": "S&P 500", "suffix": "", "region": "US",
        "delay_note": "Free Yahoo Finance data. US quotes may be delayed up to 15 minutes.",
        "holidays": {
            "2026-01-01": "New Year's Day", "2026-01-19": "Martin Luther King Jr. Day", "2026-02-16": "Presidents' Day",
            "2026-04-03": "Good Friday", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth",
            "2026-07-03": "Independence Day (observed)", "2026-09-07": "Labor Day", "2026-11-26": "Thanksgiving",
            "2026-12-25": "Christmas Day", "2027-01-01": "New Year's Day", "2027-01-18": "Martin Luther King Jr. Day",
            "2027-02-15": "Presidents' Day", "2027-03-26": "Good Friday", "2027-05-31": "Memorial Day",
            "2027-06-18": "Juneteenth (observed)", "2027-07-05": "Independence Day (observed)",
            "2027-09-06": "Labor Day", "2027-11-25": "Thanksgiving", "2027-12-24": "Christmas (observed)",
        },
        "early_close": {"2026-11-27": "Day after Thanksgiving", "2026-12-24": "Christmas Eve", "2027-11-26": "Day after Thanksgiving"},
    },
    "ASX": {
        "tz": "Australia/Sydney", "open": dtime(10, 0), "close": dtime(16, 0), "early": dtime(14, 10),
        "currency": "AUD", "index": "^AXJO", "index_name": "S&P/ASX 200", "suffix": ".AX", "region": "AU",
        "delay_note": "Free Yahoo Finance data. ASX quotes are typically delayed about 20 minutes.",
        "holidays": {
            "2026-01-01": "New Year's Day", "2026-01-26": "Australia Day", "2026-04-03": "Good Friday",
            "2026-04-06": "Easter Monday", "2026-06-08": "King's Birthday", "2026-12-25": "Christmas Day",
            "2026-12-28": "Boxing Day (observed)", "2027-01-01": "New Year's Day", "2027-01-26": "Australia Day",
            "2027-03-26": "Good Friday", "2027-03-29": "Easter Monday", "2027-06-14": "King's Birthday",
            "2027-12-27": "Christmas (observed)", "2027-12-28": "Boxing Day (observed)",
        },
        "early_close": {"2026-12-24": "Christmas Eve", "2026-12-31": "New Year's Eve", "2027-12-24": "Christmas Eve", "2027-12-31": "New Year's Eve"},
    },
}

TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,9}$")
_cache = {}


class DataError(Exception):
    pass


def normalize(symbol: str, market: str) -> str:
    s = (symbol or "").strip().upper().lstrip("$")
    if not TICKER_RE.match(s):
        raise DataError(f"'{symbol}' is not a valid ticker format.")
    if market == "ASX" and not s.endswith(".AX"):
        s += ".AX"
    if market == "US" and s.endswith(".AX"):
        raise DataError("That looks like an ASX ticker. Switch the market to ASX.")
    return s


async def _get(path, params, ttl=60):
    key = path + str(sorted(params.items()))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=12, headers=UA) as c:
            for host in HOSTS:
                r = await c.get(host + path, params=params)
                if r.status_code != 429:
                    break
    except httpx.HTTPError:
        raise DataError("Market data provider could not be reached. Try again shortly.")
    if r.status_code == 429:
        raise DataError("Market data provider is rate-limiting requests. Try again in a minute.")
    if r.status_code == 404:
        raise DataError("No market data found for that ticker. Check the symbol and market.")
    if r.status_code >= 400:
        raise DataError(f"Market data provider returned an error ({r.status_code}).")
    data = r.json()
    _cache[key] = (time.time(), data)
    return data


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None


async def chart(symbol, range_="1d", interval="5m", period1=None, period2=None, ttl=60):
    params = {"interval": interval, "includePrePost": "false"}
    if period1:
        params.update({"period1": int(period1), "period2": int(period2)})
    else:
        params["range"] = range_
    data = await _get(f"/v8/finance/chart/{symbol}", params, ttl)
    res = (data.get("chart") or {}).get("result")
    if not res:
        raise DataError("No market data found for that ticker. Check the symbol and market.")
    r = res[0]
    q = ((r.get("indicators") or {}).get("quote") or [{}])[0]
    candles = []
    for i, t in enumerate(r.get("timestamp") or []):
        o, h, l, c, v = (q.get(k, [None])[i] if q.get(k) else None for k in ("open", "high", "low", "close", "volume"))
        if None in (o, h, l, c):
            continue
        candles.append({"t": t, "o": round(o, 4), "h": round(h, 4), "l": round(l, 4), "c": round(c, 4), "v": v or 0})
    return r.get("meta") or {}, candles


async def quote(symbol):
    meta, candles = await chart(symbol, "1d", "5m")
    price = meta.get("regularMarketPrice")
    if price is None:
        raise DataError("Price currently unavailable for this ticker.")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    change = round(price - prev, 4) if prev else None
    return {
        "symbol": symbol, "name": meta.get("longName") or meta.get("shortName") or symbol,
        "price": price, "previous_close": prev, "change": change,
        "change_pct": round(change / prev * 100, 2) if prev else None,
        "currency": meta.get("currency"), "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
        "instrument_type": meta.get("instrumentType"), "as_of": _iso(meta.get("regularMarketTime")),
        "day_high": meta.get("regularMarketDayHigh"), "day_low": meta.get("regularMarketDayLow"),
        "volume": meta.get("regularMarketVolume"), "delayed": True, "source": SOURCE_LABEL,
        "spark": [{"t": c["t"], "c": c["c"]} for c in candles],
    }


async def safe_quote(symbol):
    try:
        return await quote(symbol)
    except DataError:
        return None


async def news(symbol, count=6):
    try:
        data = await _get("/v1/finance/search", {"q": symbol, "newsCount": count, "quotesCount": 0}, 600)
    except DataError:
        return []
    return [{"title": n.get("title"), "publisher": n.get("publisher"), "published": _iso(n.get("providerPublishTime")),
             "link": n.get("link")} for n in data.get("news", [])]


async def trending(market):
    cfg = MARKETS[market]
    try:
        data = await _get(f"/v1/finance/trending/{cfg['region']}", {"count": 20}, 600)
    except DataError:
        return []
    res = (data.get("finance") or {}).get("result") or [{}]
    syms = [q["symbol"] for q in res[0].get("quotes", [])]
    out = []
    for s in syms:
        if any(ch in s for ch in "^=") or s.endswith("-USD"):
            continue
        if market == "ASX" and not s.endswith(".AX"):
            continue
        if market == "US" and "." in s:
            continue
        out.append(s)
    return out[:6]


def market_status(market):
    cfg = MARKETS[market]
    tz = ZoneInfo(cfg["tz"])
    now = datetime.now(tz)
    today = now.date().isoformat()
    close = cfg["early"] if today in cfg["early_close"] else cfg["close"]
    if now.weekday() >= 5:
        state, reason = "closed", "Weekend"
    elif today in cfg["holidays"]:
        state, reason = "closed", f"Holiday: {cfg['holidays'][today]}"
    elif now.time() < cfg["open"]:
        state, reason = "pre-open", f"Opens {cfg['open'].strftime('%H:%M')} local time"
    elif now.time() >= close:
        state, reason = "closed", f"Closed at {close.strftime('%H:%M')} local time"
    else:
        state, reason = "open", f"Closes {close.strftime('%H:%M')} local time"
        if today in cfg["early_close"]:
            reason += f" (early close: {cfg['early_close'][today]})"
    upcoming = []
    for d, name in sorted({**cfg["holidays"], **{k: f"Early close: {v}" for k, v in cfg["early_close"].items()}}.items()):
        dd = date.fromisoformat(d)
        if now.date() <= dd <= now.date() + timedelta(days=21):
            upcoming.append({"date": d, "event": name})
    return {"market": market, "state": state, "reason": reason, "local_time": now.isoformat(), "timezone": cfg["tz"],
            "hours": f"{cfg['open'].strftime('%H:%M')}–{cfg['close'].strftime('%H:%M')} {cfg['tz']}",
            "currency": cfg["currency"], "delay_note": cfg["delay_note"], "upcoming": upcoming}


def indicators(candles):
    closes = [c["c"] for c in candles]
    if len(closes) < 5:
        return {}
    last = closes[-1]
    win20 = candles[-20:]
    trs = []
    for i in range(max(1, len(candles) - 14), len(candles)):
        c, p = candles[i], candles[i - 1]["c"]
        trs.append(max(c["h"] - c["l"], abs(c["h"] - p), abs(c["l"] - p)))
    vols = [c["v"] for c in candles[-21:-1] if c["v"]]
    out = {
        "last_close": last,
        "high_20d": max(c["h"] for c in win20), "low_20d": min(c["l"] for c in win20),
        "sma_20": round(sum(closes[-20:]) / len(closes[-20:]), 4),
        "sma_50": round(sum(closes[-50:]) / len(closes[-50:]), 4) if len(closes) >= 50 else None,
        "atr_14": round(sum(trs) / len(trs), 4) if trs else None,
        "avg_volume_20d": int(sum(vols) / len(vols)) if vols else None,
        "last_volume": candles[-1]["v"],
        "change_1m_pct": round((last / closes[-22] - 1) * 100, 2) if len(closes) >= 22 else None,
        "high_period": max(c["h"] for c in candles), "low_period": min(c["l"] for c in candles),
    }
    return out


SYD = ZoneInfo("Australia/Sydney")


def _close_for(cfg, d):
    return cfg["early"] if d.isoformat() in cfg["early_close"] else cfg["close"]


def session_info(market):
    cfg = MARKETS[market]
    tz = ZoneInfo(cfg["tz"])
    now = datetime.now(tz)
    for i in range(14):
        day = now.date() + timedelta(days=i)
        if day.weekday() >= 5 or day.isoformat() in cfg["holidays"]:
            continue
        o = datetime.combine(day, cfg["open"], tz)
        c = datetime.combine(day, _close_for(cfg, day), tz)
        if now < c:
            break
    fh = o + timedelta(minutes=60)
    if now < o:
        phase = "before_open"
    elif now < fh:
        phase = "first_hour"
    else:
        phase = "after_first_hour"
    fmt = "%a %H:%M"
    return {"market": market, "phase": phase, "is_open": o <= now < c, "open_at": o.isoformat(), "close_at": c.isoformat(),
            "first_hour_end": fh.isoformat(), "open_sydney": o.astimezone(SYD).strftime(fmt),
            "close_sydney": c.astimezone(SYD).strftime(fmt), "first_hour_end_sydney": fh.astimezone(SYD).strftime(fmt),
            "now": now.isoformat()}


def first_hour(candles, market):
    """Movement over the first 60 minutes of the latest session in 5m candles."""
    if not candles:
        return None
    tz = ZoneInfo(MARKETS[market]["tz"])
    last_day = datetime.fromtimestamp(candles[-1]["t"], tz).date()
    day = [c for c in candles if datetime.fromtimestamp(c["t"], tz).date() == last_day]
    win = day[:12]
    if not win:
        return None
    o, e = win[0]["o"], win[-1]["c"]
    return {"session_date": last_day.isoformat(), "open": o, "price_at_end": e, "change_pct": round((e / o - 1) * 100, 2),
            "high": max(c["h"] for c in win), "low": min(c["l"] for c in win), "complete": len(win) >= 12,
            "minutes_covered": len(win) * 5}
