import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Annotated, Any, List, Literal, Optional
from zoneinfo import ZoneInfo

from bson import ObjectId
from dateutil import parser as dparser
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import market as mk  # noqa: E402
import feeds  # noqa: E402
from ai_assess import run_assessment  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
app = FastAPI()
api = APIRouter(prefix="/api")
logger = logging.getLogger("tradewise")
logging.basicConfig(level=logging.INFO)

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]
Market = Literal["US", "ASX"]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc):
        return cls.model_validate(doc) if doc else None

    def to_mongo(self):
        d = self.model_dump(by_alias=True, exclude={"id"})
        d.pop("_id", None)
        return d

    def out(self):
        return self.model_dump()


def oid(s):
    if not ObjectId.is_valid(s):
        raise HTTPException(404, "Not found")
    return ObjectId(s)


def data_error(e):
    raise HTTPException(422, str(e))


# ---------- Models ----------
class Source(BaseDocument):
    slug: str
    name: str
    url: str
    region: str = "US"
    feed_url: Optional[str] = None
    feed_type: str = "RSS"
    followed: bool = True
    note: str = "Candidate source. Not a verified profitable trader."
    created_at: str = Field(default_factory=now_iso)


class SourceIn(BaseModel):
    name: str
    url: str
    region: Literal["US", "AU", "Global"] = "US"
    feed_url: Optional[str] = None


class SetupIn(BaseModel):
    source_id: Optional[str] = None
    source_name: str
    ticker: str
    market: Market = "ASX"
    direction: Literal["long", "short"] = "long"
    reported_text: str
    entry: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[float] = None
    exit: Optional[float] = None
    strategy: Optional[str] = None
    risks: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[str] = None
    origin: Literal["manual", "feed", "telegram", "discord"] = "manual"
    outcome: Literal["unknown", "win", "loss", "scratch"] = "unknown"


class Setup(BaseDocument, SetupIn):
    created_at: str = Field(default_factory=now_iso)


class OutcomeIn(BaseModel):
    outcome: Literal["unknown", "win", "loss", "scratch"]
    exit: Optional[float] = None


class TradeIn(BaseModel):
    kind: Literal["actual", "simulated", "hypothetical"]
    ticker: str
    market: Market = "ASX"
    direction: Literal["long", "short"] = "long"
    entry_price: float = Field(gt=0)
    entry_time: Optional[str] = None
    quantity: float = Field(gt=0)
    stop: Optional[float] = Field(default=None, gt=0)
    target: Optional[float] = Field(default=None, gt=0)
    status: Literal["open", "closed"] = "open"
    exit_price: Optional[float] = Field(default=None, gt=0)
    exit_time: Optional[str] = None
    notes: Optional[str] = None
    assessment_id: Optional[str] = None
    setup_id: Optional[str] = None
    fees: float = Field(default=0, ge=0)


class Trade(BaseDocument, TradeIn):
    symbol: str
    exchange: Optional[str] = None
    currency: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class TradeUpdate(BaseModel):
    status: Optional[Literal["open", "closed"]] = None
    exit_price: Optional[float] = Field(default=None, gt=0)
    exit_time: Optional[str] = None
    stop: Optional[float] = Field(default=None, gt=0)
    target: Optional[float] = Field(default=None, gt=0)
    notes: Optional[str] = None


class AssessIn(BaseModel):
    ticker: str
    market: Market = "ASX"
    direction: Literal["long", "short"] = "long"
    entry_price: Optional[float] = Field(default=None, gt=0)
    quantity: Optional[float] = Field(default=None, gt=0)
    buy_time: Optional[str] = None
    stop: Optional[float] = Field(default=None, gt=0)
    target: Optional[float] = Field(default=None, gt=0)
    notes: Optional[str] = None


class Assessment(BaseDocument):
    input: dict
    symbol: str
    quote: dict
    levels: dict
    news: list
    result: dict
    pnl_scenarios: list
    created_at: str = Field(default_factory=now_iso)


class HistoricalIn(BaseModel):
    ticker: str
    market: Market = "ASX"
    direction: Literal["long", "short"] = "long"
    decision_at: str
    entry_price: Optional[float] = Field(default=None, gt=0)
    quantity: float = Field(default=1, gt=0)
    stop: Optional[float] = Field(default=None, gt=0)
    target: Optional[float] = Field(default=None, gt=0)
    fees_per_side: float = Field(default=0, ge=0)
    slippage_pct: float = Field(default=0.05, ge=0, le=5)
    horizon: Literal["same_day", "5d", "20d"] = "same_day"


class ImportIn(BaseModel):
    text: str = Field(min_length=3, max_length=20000)
    platform: Literal["telegram", "discord"]


# ---------- Helpers ----------
def pnl(direction, entry, price, qty):
    if entry is None or price is None or qty is None:
        return None
    diff = (price - entry) if direction == "long" else (entry - price)
    return round(diff * qty, 2)


async def quotes_for(symbols):
    uniq = list(set(symbols))
    res = await asyncio.gather(*(mk.safe_quote(s) for s in uniq))
    return dict(zip(uniq, res))


def parse_dt(s, market):
    if not s:
        return None
    try:
        d = dparser.parse(s)
    except (ValueError, OverflowError):
        raise HTTPException(422, f"Could not read the date/time '{s}'.")
    if d.tzinfo is None:
        d = d.replace(tzinfo=ZoneInfo(mk.MARKETS[market]["tz"]))
    return d


def check_levels(direction, entry, stop, target):
    if not entry:
        return
    long = direction == "long"
    if stop and ((stop >= entry) if long else (stop <= entry)):
        raise HTTPException(422, f"For a {direction} trade the stop-loss should be {'below' if long else 'above'} the entry price.")
    if target and ((target <= entry) if long else (target >= entry)):
        raise HTTPException(422, f"For a {direction} trade the target should be {'above' if long else 'below'} the entry price.")


def iso_in_market(s, market):
    d = parse_dt(s, market)
    return d.isoformat() if d else None


# ---------- Market ----------
@api.get("/")
async def root():
    return {"app": "TradeWise", "orders": "TradeWise never executes orders."}


@api.get("/market/overview")
async def market_overview(market: Market = "ASX"):
    cfg = mk.MARKETS[market]
    status = mk.market_status(market)
    index = await mk.safe_quote(cfg["index"])
    try:
        _, intraday = await mk.chart(cfg["index"], "5d", "5m")
        fh = mk.first_hour(intraday, market)
    except mk.DataError:
        fh = None
    return {"status": status, "index": index, "index_name": cfg["index_name"], "fetched_at": now_iso(),
            "session": mk.session_info(market), "first_hour": fh,
            "events_note": "Only exchange holidays and early closes are shown. Economic and earnings calendars are not connected (no free, key-less source)."}


@api.get("/sessions")
async def sessions():
    return [{**mk.session_info(m), "state": mk.market_status(m)["state"], "reason": mk.market_status(m)["reason"]} for m in ("ASX", "US")]


@api.get("/quote/{ticker}")
async def get_quote(ticker: str, market: Market = "ASX"):
    try:
        return await mk.quote(mk.normalize(ticker, market))
    except mk.DataError as e:
        data_error(e)


@api.get("/chart/{ticker}")
async def get_chart(ticker: str, market: Market = "ASX", range: str = "3mo", interval: str = "1d"):
    if range not in {"1d", "5d", "1mo", "3mo", "6mo", "1y"} or interval not in {"5m", "15m", "1h", "1d"}:
        raise HTTPException(422, "Unsupported range/interval")
    try:
        meta, candles = await mk.chart(mk.normalize(ticker, market), range, interval)
    except mk.DataError as e:
        data_error(e)
    return {"currency": meta.get("currency"), "candles": candles, "source": mk.SOURCE_LABEL}


@api.get("/news/{ticker}")
async def get_news(ticker: str, market: Market = "ASX"):
    try:
        return await mk.news(mk.normalize(ticker, market))
    except mk.DataError as e:
        data_error(e)


# ---------- Analyse ----------
@api.post("/assess")
async def assess(body: AssessIn):
    check_levels(body.direction, body.entry_price, body.stop, body.target)
    try:
        symbol = mk.normalize(body.ticker, body.market)
        q = await mk.quote(symbol)
        _, daily = await mk.chart(symbol, "6mo", "1d", ttl=600)
    except mk.DataError as e:
        data_error(e)
    if q.get("instrument_type") not in (None, "EQUITY", "ETF"):
        raise HTTPException(422, f"{symbol} is not an equity ({q.get('instrument_type')}). TradeWise covers equities only.")
    levels = mk.indicators(daily)
    news = await mk.news(symbol)
    context = {
        "market": body.market, "symbol": symbol, "name": q["name"], "currency": q["currency"],
        "latest_quote": {k: q[k] for k in ("price", "previous_close", "change_pct", "day_high", "day_low", "volume", "as_of")},
        "data_note": "Delayed free data; may lag the live market.",
        "indicators_6mo_daily": levels, "last_10_daily_closes": [c["c"] for c in daily[-10:]],
        "news": news, "user_trade": body.model_dump(),
        "market_context": "ASX stock: do not apply US trader commentary without evidence." if body.market == "ASX" else "US equity.",
    }
    try:
        result = await run_assessment(context)
    except Exception as e:
        logger.exception("AI assessment failed")
        raise HTTPException(502, f"AI assessment unavailable right now ({type(e).__name__}). Market data was retrieved; try again.")
    entry = body.entry_price or q["price"]
    qty = body.quantity
    pnl_rows = []
    if qty:
        for label, price in (("At stop-loss", body.stop), ("At target", body.target)):
            if price:
                pnl_rows.append({"label": label, "price": price, "pnl": pnl(body.direction, entry, price, qty)})
        for s in result.get("scenarios", []):
            for edge in ("price_low", "price_high"):
                if isinstance(s.get(edge), (int, float)):
                    pnl_rows.append({"label": f"{s['name'].title()} {edge.split('_')[1]}", "price": s[edge],
                                     "pnl": pnl(body.direction, entry, s[edge], qty)})
    a = Assessment(input={**body.model_dump(), "entry_used": entry}, symbol=symbol,
                   quote={k: v for k, v in q.items() if k != "spark"}, levels=levels, news=news, result=result,
                   pnl_scenarios=pnl_rows)
    r = await db.assessments.insert_one(a.to_mongo())
    a.id = str(r.inserted_id)
    return a.out()


def compare_scenarios(a: dict, current):
    if not current:
        return None
    base = a["quote"]["price"]
    rows = []
    for s in a["result"].get("scenarios", []):
        lo, hi = s.get("price_low"), s.get("price_high")
        if isinstance(lo, (int, float)) and isinstance(hi, (int, float)):
            pos = "within range" if lo <= current["price"] <= hi else ("above range" if current["price"] > hi else "below range")
        else:
            pos = "no price range was given"
        rows.append({"name": s.get("name"), "position": pos})
    return {"price_then": base, "price_now": current["price"], "as_of": current["as_of"],
            "change_pct": round((current["price"] / base - 1) * 100, 2), "scenarios": rows}


@api.get("/assessments")
async def list_assessments(market: Optional[Market] = None):
    q = {"input.market": market} if market else {}
    docs = await db.assessments.find(q).sort("created_at", -1).to_list(50)
    return [{"id": str(d["_id"]), "symbol": d["symbol"], "created_at": d["created_at"], "price": d["quote"]["price"],
             "currency": d["quote"].get("currency"), "bottom_line": d["result"].get("bottom_line"),
             "market": d["input"].get("market")} for d in docs]


@api.get("/assessments/{aid}")
async def get_assessment(aid: str):
    a = Assessment.from_mongo(await db.assessments.find_one({"_id": oid(aid)}))
    if not a:
        raise HTTPException(404, "Assessment not found")
    out = a.out()
    out["comparison"] = compare_scenarios(out, await mk.safe_quote(a.symbol))
    return out


@api.post("/historical")
async def historical(body: HistoricalIn):
    try:
        symbol = mk.normalize(body.ticker, body.market)
    except mk.DataError as e:
        data_error(e)
    cfg = mk.MARKETS[body.market]
    tz = ZoneInfo(cfg["tz"])
    dt = parse_dt(body.decision_at, body.market).astimezone(tz)
    now = datetime.now(tz)
    if dt > now:
        raise HTTPException(422, "Decision time is in the future. Use Analyse for future scenarios.")
    if dt < now - timedelta(days=730):
        raise HTTPException(422, "Only the last two years are supported.")
    notes = []
    try:
        _, before = await mk.chart(symbol, interval="1d", period1=(dt - timedelta(days=60)).timestamp(), period2=dt.timestamp(), ttl=3600)
        intraday = body.horizon == "same_day" and (now - dt).days <= 55
        if intraday:
            day_close = dt.replace(hour=cfg["close"].hour, minute=cfg["close"].minute, second=0)
            _, after = await mk.chart(symbol, interval="5m", period1=dt.timestamp(), period2=day_close.timestamp() + 60, ttl=3600)
            after = [c for c in after if dt.timestamp() - 1 <= c["t"] <= day_close.timestamp()]
            notes.append("Intraday 5-minute bars from the decision time to that day's close.")
        else:
            days = {"same_day": 1, "5d": 5, "20d": 20}[body.horizon]
            _, after = await mk.chart(symbol, interval="1d", period1=(dt - timedelta(days=1)).timestamp(),
                                       period2=(dt + timedelta(days=days * 2 + 4)).timestamp(), ttl=3600)
            after_open = dt.time() > cfg["open"]
            after = [c for c in after if (datetime.fromtimestamp(c["t"], tz).date() > dt.date()) or
                     (not after_open and datetime.fromtimestamp(c["t"], tz).date() == dt.date())][:days]
            if body.horizon == "same_day":
                notes.append("Intraday bars are only available for the last ~55 days, so daily bars were used.")
            notes.append("Daily bars: the path within each day is unknown." + (" Decision was after the open, so evaluation starts next session." if after_open else ""))
    except mk.DataError as e:
        data_error(e)
    if not after:
        raise HTTPException(422, "No price data after that time (market closed, holiday or no coverage).")
    entry = body.entry_price or after[0]["o"]
    if not body.entry_price:
        notes.append("No entry price given: used the first available open after the decision time.")
    hit, exit_price, exit_t = None, after[-1]["c"], after[-1]["t"]
    long = body.direction == "long"
    for c in after:
        s_hit = body.stop and ((c["l"] <= body.stop) if long else (c["h"] >= body.stop))
        t_hit = body.target and ((c["h"] >= body.target) if long else (c["l"] <= body.target))
        if s_hit or t_hit:
            if s_hit and t_hit:
                notes.append("Stop and target were both inside the same bar; order is unknown, so the stop was assumed first (conservative).")
            hit = "stop" if s_hit else "target"
            exit_price, exit_t = (body.stop if s_hit else body.target), c["t"]
            break
    gross = pnl(body.direction, entry, exit_price, body.quantity)
    fees = round(body.fees_per_side * 2, 2)
    slippage = round((entry + exit_price) * body.quantity * body.slippage_pct / 100, 2)
    info = mk.indicators(before) if before else {}
    return {
        "symbol": symbol, "currency": cfg["currency"], "decision_at": dt.isoformat(), "entry": entry,
        "exit_price": exit_price, "exit_at": datetime.fromtimestamp(exit_t, tz).isoformat(), "exit_reason": hit or "end of window",
        "high": max(c["h"] for c in after), "low": min(c["l"] for c in after),
        "move_pct": round((after[-1]["c"] / entry - 1) * 100, 2),
        "gross_pnl": gross, "fees": fees, "slippage": slippage, "net_pnl": round(gross - fees - slippage, 2),
        "stop_reached": hit == "stop", "target_reached": hit == "target",
        "known_at_decision": {"prior_close": info.get("last_close"), "high_20d": info.get("high_20d"),
                              "low_20d": info.get("low_20d"), "sma_20": info.get("sma_20"),
                              "note": "Only data dated before the decision time is used here (no look-ahead)."},
        "candles": after, "notes": notes, "source": mk.SOURCE_LABEL,
    }


# ---------- Sources & Feeds ----------
async def ensure_sources():
    for s in feeds.DEFAULT_SOURCES:
        if not await db.sources.find_one({"slug": s["slug"]}):
            await db.sources.insert_one(Source(**s).to_mongo())


@api.get("/sources")
async def list_sources():
    docs = await db.sources.find().sort("created_at", 1).to_list(100)
    return [Source.from_mongo(d).out() for d in docs]


@api.post("/sources")
async def add_source(body: SourceIn):
    slug = "".join(ch if ch.isalnum() else "-" for ch in body.name.lower()).strip("-")
    if await db.sources.find_one({"slug": slug}):
        raise HTTPException(409, "A source with that name already exists.")
    s = Source(slug=slug, name=body.name, url=body.url, region=body.region, feed_url=body.feed_url or None)
    r = await db.sources.insert_one(s.to_mongo())
    s.id = str(r.inserted_id)
    return s.out()


@api.patch("/sources/{sid}")
async def toggle_source(sid: str, followed: bool):
    r = await db.sources.update_one({"_id": oid(sid)}, {"$set": {"followed": followed}})
    if not r.matched_count:
        raise HTTPException(404, "Source not found")
    return {"ok": True}


@api.get("/feed")
async def feed():
    sources = [Source.from_mongo(d) for d in await db.sources.find({"followed": True, "feed_url": {"$ne": None}}).to_list(100)]
    results = await asyncio.gather(*(feeds.fetch_feed(s.feed_url) for s in sources))
    items, errors = [], []
    for s, (its, err) in zip(sources, results):
        if err:
            errors.append({"source": s.name, "error": err})
        for it in its[:8]:
            items.append({**it, "source_id": s.id, "source_name": s.name, "feed_type": s.feed_type, "region": s.region})
    items.sort(key=lambda x: x.get("published") or "", reverse=True)
    return {"items": items, "errors": errors, "fetched_at": now_iso()}


@api.post("/import/parse")
async def import_parse(body: ImportIn):
    return {"candidates": feeds.parse_messages(body.text, body.platform)}


# ---------- Setups & Freshness ----------
def freshness(s: dict, q):
    now = datetime.now(timezone.utc)
    pub = None
    if s.get("published_at"):
        try:
            pub = dparser.parse(s["published_at"])
            pub = pub if pub.tzinfo else pub.replace(tzinfo=timezone.utc)
        except (ValueError, OverflowError):
            pub = None
    if not pub or not s.get("source_url"):
        return "Setup requires review", "Missing original link or published time."
    if pub > now + timedelta(minutes=5):
        return "Setup requires review", "Published time is in the future. Check the timestamp."
    age_h = (now - pub).total_seconds() / 3600
    if age_h > 72:
        return "Historical example only", f"Published {int(age_h // 24)} days ago."
    if not q:
        return "Awaiting current market data", "Latest price unavailable."
    p, long = q["price"], s.get("direction", "long") == "long"
    stop, target, entry = s.get("stop"), s.get("target"), s.get("entry")
    if stop and ((p <= stop) if long else (p >= stop)):
        return "Original conditions no longer observed", "Price is through the reported stop."
    if target and ((p >= target) if long else (p <= target)):
        return "Original conditions no longer observed", "Price already reached the reported target."
    if entry and abs(p / entry - 1) > 0.05:
        return "Original conditions no longer observed", "Price has moved more than 5% from the reported entry."
    if age_h > 24:
        return "Setup requires review", "Older than one trading day; conditions may have changed."
    return "Source verified", "Linked to the original post with a timestamp; price still near reported levels."


async def enrich_setups(docs):
    setups = [Setup.from_mongo(d).out() for d in docs]
    syms = {}
    for s in setups:
        try:
            syms[s["id"]] = mk.normalize(s["ticker"], s["market"])
        except mk.DataError:
            syms[s["id"]] = None
    qs = await quotes_for([v for v in syms.values() if v])
    for s in setups:
        q = qs.get(syms[s["id"]]) if syms[s["id"]] else None
        s["latest_price"] = q["price"] if q else None
        s["latest_price_at"] = q["as_of"] if q else None
        s["currency"] = q["currency"] if q else None
        s["status"], s["status_reason"] = freshness(s, q)
    return setups


@api.get("/setups")
async def list_setups(market: Optional[Market] = None, source_id: Optional[str] = None):
    q = {}
    if market:
        q["market"] = market
    if source_id:
        q["source_id"] = source_id
    docs = await db.setups.find(q).sort("created_at", -1).to_list(100)
    return await enrich_setups(docs)


@api.post("/setups")
async def create_setup(body: SetupIn):
    try:
        mk.normalize(body.ticker, body.market)
    except mk.DataError as e:
        data_error(e)
    if body.published_at:
        p = parse_dt(body.published_at, body.market)
        if p > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise HTTPException(422, "Published time can't be in the future.")
    s = Setup(**body.model_dump())
    s.ticker = s.ticker.upper().lstrip("$")
    r = await db.setups.insert_one(s.to_mongo())
    return (await enrich_setups([await db.setups.find_one({"_id": r.inserted_id})]))[0]


@api.patch("/setups/{sid}/outcome")
async def setup_outcome(sid: str, body: OutcomeIn):
    r = await db.setups.update_one({"_id": oid(sid)}, {"$set": body.model_dump(exclude_none=True)})
    if not r.matched_count:
        raise HTTPException(404, "Setup not found")
    return {"ok": True}


@api.delete("/setups/{sid}")
async def delete_setup(sid: str):
    r = await db.setups.delete_one({"_id": oid(sid)})
    if not r.deleted_count:
        raise HTTPException(404, "Setup not found")
    return {"ok": True}


@api.get("/sources/{sid}/scorecard")
async def scorecard(sid: str):
    src = Source.from_mongo(await db.sources.find_one({"_id": oid(sid)}))
    if not src:
        raise HTTPException(404, "Source not found")
    setups = [Setup.from_mongo(d) for d in await db.setups.find({"source_id": sid}).to_list(1000)]
    n = len(setups)

    def pct(cond):
        return round(sum(1 for s in setups if cond(s)) / n * 100) if n else None

    evaluable = [s for s in setups if s.entry and (s.exit or s.stop) and s.published_at and s.source_url and s.outcome != "unknown"]
    delays = []
    for s in setups:
        if s.published_at:
            try:
                p = dparser.parse(s.published_at)
                p = p if p.tzinfo else p.replace(tzinfo=timezone.utc)
                delays.append((dparser.parse(s.created_at) - p).total_seconds() / 3600)
            except (ValueError, OverflowError):
                pass
    stats = None
    if len(evaluable) >= 5:
        wins = sum(1 for s in evaluable if s.outcome == "win")
        losses = sum(1 for s in evaluable if s.outcome == "loss")
        stats = {"wins": wins, "losses": losses, "scratches": len(evaluable) - wins - losses,
                 "win_rate_pct": round(wins / len(evaluable) * 100)}
    return {
        "source": src.out(), "logged_setups": n, "evaluable_setups": len(evaluable), "min_for_stats": 5,
        "with_link_pct": pct(lambda s: bool(s.source_url)), "with_timestamp_pct": pct(lambda s: bool(s.published_at)),
        "with_entry_pct": pct(lambda s: s.entry is not None),
        "with_exit_pct": pct(lambda s: s.exit is not None or s.stop is not None),
        "losing_trades_recorded": sum(1 for s in setups if s.outcome == "loss"),
        "median_hours_to_log": round(sorted(delays)[len(delays) // 2], 1) if delays else None,
        "stats": stats,
        "note": "Based only on setups you logged. Not ranked by self-reported profit or popularity.",
    }


# ---------- Trades ----------
async def enrich_trades(docs):
    trades = [Trade.from_mongo(d).out() for d in docs]
    qs = await quotes_for([t["symbol"] for t in trades if t["status"] == "open"])
    aids = [ObjectId(t["assessment_id"]) for t in trades if t.get("assessment_id") and ObjectId.is_valid(t["assessment_id"])]
    amap = {str(a["_id"]): a for a in await db.assessments.find({"_id": {"$in": aids}}).to_list(500)}
    for t in trades:
        q = qs.get(t["symbol"]) if t["status"] == "open" else None
        t["latest_price"] = q["price"] if q else None
        t["latest_price_at"] = q["as_of"] if q else None
        t["unrealised_pnl"] = pnl(t["direction"], t["entry_price"], t["latest_price"], t["quantity"]) if t["status"] == "open" else None
        gross = pnl(t["direction"], t["entry_price"], t["exit_price"], t["quantity"]) if t["status"] == "closed" and t["exit_price"] else None
        t["realised_pnl"] = round(gross - (t.get("fees") or 0), 2) if gross is not None else None
        flags = []
        if t["status"] == "open" and q:
            long = t["direction"] == "long"
            if t.get("stop") and ((q["price"] <= t["stop"]) if long else (q["price"] >= t["stop"])):
                flags.append("Price is at or through your stop-loss.")
            if t.get("target") and ((q["price"] >= t["target"]) if long else (q["price"] <= t["target"])):
                flags.append("Price has reached your target.")
        if t["status"] == "open" and not q:
            flags.append("Latest price unavailable.")
        if t["kind"] == "actual" and not t.get("entry_time"):
            flags.append("Entry time not recorded.")
        a = amap.get(t.get("assessment_id") or "")
        if a:
            t["assessment"] = {"id": str(a["_id"]), "created_at": a["created_at"], "price": a["quote"]["price"],
                               "bottom_line": a["result"].get("bottom_line")}
            ref = q["price"] if q else t.get("exit_price")
            if ref:
                t["assessment"]["change_since_pct"] = round((ref / a["quote"]["price"] - 1) * 100, 2)
                if abs(t["assessment"]["change_since_pct"]) >= 5 and t["status"] == "open":
                    flags.append(f"Moved {t['assessment']['change_since_pct']}% since your assessment.")
        t["needs_review"] = flags
    return trades


@api.get("/trades")
async def list_trades(market: Optional[Market] = None, kind: Optional[str] = None):
    q = {}
    if market:
        q["market"] = market
    if kind:
        q["kind"] = kind
    return await enrich_trades(await db.trades.find(q).sort("created_at", -1).to_list(500))


@api.post("/trades")
async def create_trade(body: TradeIn):
    if body.status == "closed" and not (body.exit_price and body.exit_time):
        raise HTTPException(422, "A closed trade needs an actual exit price and exit time.")
    check_levels(body.direction, body.entry_price, body.stop, body.target)
    body.entry_time = iso_in_market(body.entry_time, body.market)
    body.exit_time = iso_in_market(body.exit_time, body.market)
    try:
        symbol = mk.normalize(body.ticker, body.market)
    except mk.DataError as e:
        data_error(e)
    q = await mk.safe_quote(symbol)
    if q is None:
        try:
            await mk.quote(symbol)
        except mk.DataError as e:
            if "No market data" in str(e):
                data_error(e)
    t = Trade(**body.model_dump(), symbol=symbol, exchange=q["exchange"] if q else None,
              currency=q["currency"] if q else mk.MARKETS[body.market]["currency"])
    t.ticker = t.ticker.upper().lstrip("$")
    r = await db.trades.insert_one(t.to_mongo())
    return (await enrich_trades([await db.trades.find_one({"_id": r.inserted_id})]))[0]


@api.patch("/trades/{tid}")
async def update_trade(tid: str, body: TradeUpdate):
    cur = await db.trades.find_one({"_id": oid(tid)})
    if not cur:
        raise HTTPException(404, "Trade not found")
    upd = body.model_dump(exclude_none=True)
    if "exit_time" in upd:
        upd["exit_time"] = iso_in_market(upd["exit_time"], cur.get("market", "ASX"))
    merged = {**cur, **upd}
    if merged.get("status") == "closed" and not (merged.get("exit_price") and merged.get("exit_time")):
        raise HTTPException(422, "Closing a trade needs the actual exit price and exit time.")
    await db.trades.update_one({"_id": cur["_id"]}, {"$set": upd})
    return (await enrich_trades([await db.trades.find_one({"_id": cur["_id"]})]))[0]


@api.delete("/trades/{tid}")
async def delete_trade(tid: str):
    r = await db.trades.delete_one({"_id": oid(tid)})
    if not r.deleted_count:
        raise HTTPException(404, "Trade not found")
    return {"ok": True}


# ---------- Today ----------
@api.get("/today")
async def today(market: Market = "ASX"):
    overview, setups, trades, trend = await asyncio.gather(
        market_overview(market), list_setups(market=market), list_trades(market=market), mk.trending(market))
    followed = {str(d["_id"]) for d in await db.sources.find({"followed": True}).to_list(100)}
    watching = [s for s in setups if s["status"] == "Source verified" and (not s.get("source_id") or s["source_id"] in followed)][:3]
    positions = [t for t in trades if t["kind"] == "actual" and t["status"] == "open"]
    review = [t for t in trades if t["needs_review"]]
    reviewing = []
    seen = set()
    for s in watching:
        if s["ticker"] not in seen:
            seen.add(s["ticker"])
            reviewing.append({"ticker": s["ticker"], "why": f"Mentioned in a {s['source_name']} setup", "freshness": s["published_at"],
                              "uncertainty": "A trader's setup is an idea, not a confirmed opportunity.", "price": s["latest_price"]})
    tq = await quotes_for([mk.normalize(t, market) for t in trend])
    for t in trend:
        sym = mk.normalize(t, market)
        tk = sym.replace(".AX", "")
        q = tq.get(sym)
        if tk in seen or not q or q.get("instrument_type") not in ("EQUITY", "ETF"):
            continue
        seen.add(tk)
        reviewing.append({"ticker": tk, "why": "Trending in Yahoo Finance searches (attention, not quality)",
                          "freshness": q["as_of"], "price": q["price"], "change_pct": q["change_pct"],
                          "uncertainty": "Search popularity says nothing about direction. Check news before acting."})
    return {"overview": overview, "watching": watching, "reviewing": reviewing[:5], "positions": positions,
            "needs_review": review, "us_sources_note": "Your current sources mainly cover US stocks. Their commentary is not shown as applicable to ASX." if market == "ASX" else None}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await ensure_sources()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
