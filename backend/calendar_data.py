import asyncio
import time
from datetime import datetime, timezone, timedelta

import httpx

UA = {"User-Agent": "Mozilla/5.0"}
FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
_cache = {}
_crumb = {"client": None, "crumb": None, "at": 0}


async def economic(market):
    hit = _cache.get("ff")
    if hit and time.time() - hit[0] < 3600:
        events = hit[1]
    else:
        try:
            async with httpx.AsyncClient(timeout=12, headers=UA) as c:
                r = await c.get(FF_URL)
            r.raise_for_status()
            events = r.json()
        except Exception:
            return None
        _cache["ff"] = (time.time(), events)
    now = datetime.now(timezone.utc) - timedelta(hours=2)
    out = []
    for e in events:
        try:
            d = datetime.fromisoformat(e["date"])
        except (KeyError, ValueError):
            continue
        if d < now or e.get("impact") not in ("High", "Medium", "Holiday"):
            continue
        cur = e.get("country")
        if market == "US" and cur != "USD":
            continue
        if market == "ASX" and not (cur == "AUD" or (cur == "USD" and e["impact"] == "High") or (cur == "CNY" and e["impact"] == "High")):
            continue
        note = None
        if market == "ASX" and cur != "AUD":
            note = f"{cur} event: can move ASX overnight via global sentiment, not a direct ASX event."
        out.append({"type": "economic", "title": e["title"], "country": cur, "date": d.astimezone(timezone.utc).isoformat(),
                    "impact": e["impact"], "forecast": e.get("forecast") or None, "previous": e.get("previous") or None, "note": note})
    return out


_lock = asyncio.Lock()


async def _yahoo_client():
    async with _lock:
        if _crumb["client"] and time.time() - _crumb["at"] < 3600 * 6:
            return _crumb["client"], _crumb["crumb"]
        if _crumb["client"]:
            await _crumb["client"].aclose()
            _crumb["client"] = None
        return await _new_client()


async def _new_client():
    c = httpx.AsyncClient(timeout=12, headers=UA, follow_redirects=True)
    try:
        await c.get("https://fc.yahoo.com")
    except httpx.HTTPError:
        pass
    r = await c.get("https://query1.finance.yahoo.com/v1/test/getcrumb")
    if r.status_code != 200 or not r.text or "<" in r.text:
        await c.aclose()
        raise RuntimeError("crumb unavailable")
    _crumb.update(client=c, crumb=r.text.strip(), at=time.time())
    return c, _crumb["crumb"]


async def company_events(symbol):
    hit = _cache.get(symbol)
    if hit and time.time() - hit[0] < 3600 * 12:
        return hit[1]
    try:
        c, crumb = await _yahoo_client()
        r = await c.get(f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
                        params={"modules": "calendarEvents", "crumb": crumb})
        cal = r.json()["quoteSummary"]["result"][0]["calendarEvents"]
    except Exception:
        _crumb["at"] = 0
        return None
    out = []
    earn = cal.get("earnings") or {}
    for d in earn.get("earningsDate") or []:
        out.append({"type": "earnings", "symbol": symbol, "date": datetime.fromtimestamp(d["raw"], tz=timezone.utc).isoformat(),
                    "title": "Earnings report" + (" (estimated date)" if earn.get("isEarningsDateEstimate") else ""),
                    "estimate": (earn.get("earningsAverage") or {}).get("fmt")})
        break
    for key, label in (("exDividendDate", "Ex-dividend date"), ("dividendDate", "Dividend payment")):
        v = cal.get(key)
        if v and v.get("raw"):
            out.append({"type": "dividend", "symbol": symbol, "date": datetime.fromtimestamp(v["raw"], tz=timezone.utc).isoformat(), "title": label})
    _cache[symbol] = (time.time(), out)
    return out
