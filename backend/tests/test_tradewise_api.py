# TradeWise API regression tests (market, sessions, assess, historical, sources/feeds, setups, trades, import)
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()
CREATED = {"trades": [], "setups": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup():
    yield
    for t in CREATED["trades"]:
        S.delete(f"{API}/trades/{t}")
    for s in CREATED["setups"]:
        S.delete(f"{API}/setups/{s}")


# ---- Market / Today ----
class TestMarket:
    def test_root(self):
        r = S.get(f"{API}/")
        assert r.status_code == 200 and r.json()["app"] == "TradeWise"

    def test_sessions_both_markets_sydney(self):
        r = S.get(f"{API}/sessions")
        assert r.status_code == 200
        d = r.json()
        assert [x["market"] for x in d] == ["ASX", "US"]
        for x in d:
            assert x["open_sydney"] and x["first_hour_end_sydney"] and x["state"] in ("open", "closed", "pre-open")

    @pytest.mark.parametrize("m,cur", [("ASX", "AUD"), ("US", "USD")])
    def test_today(self, m, cur):
        t0 = time.time()
        r = S.get(f"{API}/today", params={"market": m}, timeout=30)
        assert r.status_code == 200
        assert time.time() - t0 < 15
        d = r.json()
        assert d["overview"]["status"]["currency"] == cur
        assert d["overview"]["session"]["market"] == m
        for k in ("watching", "reviewing", "positions", "needs_review"):
            assert isinstance(d[k], list)
        assert (d["us_sources_note"] is not None) == (m == "ASX")

    def test_quote_asx_suffix(self):
        r = S.get(f"{API}/quote/BHP", params={"market": "ASX"})
        assert r.status_code == 200
        assert r.json()["symbol"] == "BHP.AX" and r.json()["currency"] == "AUD"

    def test_quote_invalid(self):
        r = S.get(f"{API}/quote/ZZZZZQ", params={"market": "US"})
        assert r.status_code == 422 and "detail" in r.json()

    def test_chart_bad_range(self):
        assert S.get(f"{API}/chart/BHP", params={"range": "10y"}).status_code == 422


# ---- Analyse ----
class TestAssess:
    def test_assess_invalid_ticker(self):
        r = S.post(f"{API}/assess", json={"ticker": "ZZZZZQ", "market": "US"}, timeout=60)
        assert r.status_code == 422
        assert "ticker" in r.json()["detail"].lower() or "data" in r.json()["detail"].lower()

    def test_assess_stop_above_entry(self):
        r = S.post(f"{API}/assess", json={"ticker": "BHP", "market": "ASX", "entry_price": 40, "stop": 41}, timeout=60)
        assert r.status_code == 422

    def test_assess_full_and_persisted(self):
        q = S.get(f"{API}/quote/CBA", params={"market": "ASX"}).json()
        p = q["price"]
        body = {"ticker": "CBA", "market": "ASX", "entry_price": p, "quantity": 10,
                "stop": round(p * 0.97, 2), "target": round(p * 1.05, 2), "notes": "TEST"}
        r = S.post(f"{API}/assess", json=body, timeout=150)
        assert r.status_code == 200, r.text
        a = r.json()
        res = a["result"]
        assert a["symbol"] == "CBA.AX" and a["id"]
        assert res.get("bottom_line")
        names = [s["name"].lower() for s in res.get("scenarios", [])]
        assert {"bullish", "neutral", "bearish"} <= set(names), names
        assert any(x["label"] == "At stop-loss" for x in a["pnl_scenarios"])
        g = S.get(f"{API}/assessments/{a['id']}", timeout=30)
        assert g.status_code == 200
        assert g.json()["comparison"]["price_then"] == a["quote"]["price"]
        lst = S.get(f"{API}/assessments").json()
        assert any(x["id"] == a["id"] for x in lst)
        pytest.assessment_id = a["id"]

    def test_assessment_404(self):
        assert S.get(f"{API}/assessments/abc").status_code == 404


# ---- Historical ----
class TestHistorical:
    def test_future_date(self):
        fut = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        r = S.post(f"{API}/historical", json={"ticker": "BHP", "market": "ASX", "decision_at": fut})
        assert r.status_code == 422 and "future" in r.json()["detail"].lower()

    def test_historical_intraday(self):
        d = datetime.now() - timedelta(days=10)
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        r = S.post(f"{API}/historical", json={"ticker": "BHP", "market": "ASX",
                                              "decision_at": d.strftime("%Y-%m-%d 10:30"), "fees_per_side": 10,
                                              "slippage_pct": 0.1, "quantity": 100}, timeout=60)
        assert r.status_code == 200, r.text
        h = r.json()
        assert h["fees"] == 20
        assert h["net_pnl"] == round(h["gross_pnl"] - h["fees"] - h["slippage"], 2)
        assert h["candles"] and h["candles"][0]["t"] >= datetime.fromisoformat(h["decision_at"]).timestamp() - 1

    def test_historical_5d(self):
        d = datetime.now() - timedelta(days=120)
        r = S.post(f"{API}/historical", json={"ticker": "AAPL", "market": "US", "decision_at": d.strftime("%Y-%m-%d 09:00"),
                                              "horizon": "5d"}, timeout=60)
        assert r.status_code == 200, r.text
        assert len(r.json()["candles"]) <= 5


# ---- Sources / feed / import ----
class TestSources:
    def test_default_sources(self):
        d = S.get(f"{API}/sources").json()
        names = {s["name"] for s in d}
        assert {"TraderTV Live", "SMB Capital", "Bear Bull Traders"} <= names
        pytest.source = d[0]

    def test_toggle_follow(self):
        s = pytest.source
        assert S.patch(f"{API}/sources/{s['id']}", params={"followed": "false"}).status_code == 200
        assert not [x for x in S.get(f"{API}/sources").json() if x["id"] == s["id"]][0]["followed"]
        S.patch(f"{API}/sources/{s['id']}", params={"followed": "true"})
        assert [x for x in S.get(f"{API}/sources").json() if x["id"] == s["id"]][0]["followed"]

    def test_scorecard_no_stats(self):
        r = S.get(f"{API}/sources/{pytest.source['id']}/scorecard")
        assert r.status_code == 200
        assert r.json()["min_for_stats"] == 5

    def test_feed(self):
        d = S.get(f"{API}/feed", timeout=40).json()
        assert isinstance(d["items"], list) and len(d["items"]) > 0
        assert d["items"][0]["link"].startswith("https://www.youtube.com")

    def test_import_parse(self):
        r = S.post(f"{API}/import/parse", json={"platform": "telegram",
                                                 "text": "[2026-10-30 10:05] Long $TSLA entry 250 stop 245 target 262"})
        c = r.json()["candidates"][0]
        assert c["ticker"] == "TSLA" and c["entry"] == 250 and c["stop"] == 245 and c["target"] == 262
        assert c["published_at"].startswith("2026-10-30T10:05") and c["missing"] == []


# ---- Setups ----
class TestSetups:
    def test_setup_crud(self):
        body = {"source_id": pytest.source["id"], "source_name": pytest.source["name"], "ticker": "$aapl", "market": "US",
                "reported_text": "TEST setup", "entry": 100, "stop": 95, "source_url": "https://x.com/a",
                "published_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()}
        r = S.post(f"{API}/setups", json=body, timeout=30)
        assert r.status_code == 200, r.text
        s = r.json()
        CREATED["setups"].append(s["id"])
        assert s["ticker"] == "AAPL" and s["status"] == "Historical example only"
        assert S.patch(f"{API}/setups/{s['id']}/outcome", json={"outcome": "win", "exit": 110}).status_code == 200
        got = [x for x in S.get(f"{API}/setups", params={"market": "US"}).json() if x["id"] == s["id"]][0]
        assert got["outcome"] == "win" and got["exit"] == 110
        assert S.delete(f"{API}/setups/{s['id']}").status_code == 200
        assert not [x for x in S.get(f"{API}/setups").json() if x["id"] == s["id"]]

    def test_setup_missing_link_requires_review(self):
        r = S.post(f"{API}/setups", json={"source_name": "X", "ticker": "BHP", "market": "ASX", "reported_text": "TEST"})
        s = r.json()
        CREATED["setups"].append(s["id"])
        assert s["status"] == "Setup requires review"


# ---- Trades ----
class TestTrades:
    def test_closed_requires_exit(self):
        r = S.post(f"{API}/trades", json={"kind": "actual", "ticker": "BHP", "entry_price": 40, "quantity": 10, "status": "closed"})
        assert r.status_code == 422

    def test_invalid_ticker_trade(self):
        r = S.post(f"{API}/trades", json={"kind": "simulated", "ticker": "ZZZZZQ", "market": "US", "entry_price": 4, "quantity": 1})
        assert r.status_code == 422

    def test_trade_lifecycle(self):
        r = S.post(f"{API}/trades", json={"kind": "actual", "ticker": "BHP", "market": "ASX", "entry_price": 30,
                                           "quantity": 10, "notes": "TEST",
                                           "assessment_id": getattr(pytest, "assessment_id", None)}, timeout=30)
        assert r.status_code == 200, r.text
        t = r.json()
        CREATED["trades"].append(t["id"])
        assert t["symbol"] == "BHP.AX" and t["currency"] == "AUD"
        assert t["unrealised_pnl"] is not None and t["realised_pnl"] is None
        assert "Entry time not recorded." in t["needs_review"]
        # close without exit -> 422
        assert S.patch(f"{API}/trades/{t['id']}", json={"status": "closed"}).status_code == 422
        u = S.patch(f"{API}/trades/{t['id']}", json={"status": "closed", "exit_price": 32, "exit_time": "2026-10-30 15:00"})
        assert u.status_code == 200
        assert u.json()["realised_pnl"] == 20 and u.json()["unrealised_pnl"] is None
        lst = S.get(f"{API}/trades", params={"kind": "actual"}).json()
        assert any(x["id"] == t["id"] and x["status"] == "closed" for x in lst)
        S.delete(f"{API}/trades/{t['id']}")
        assert not any(x["id"] == t["id"] for x in S.get(f"{API}/trades").json())

    def test_trade_negative_qty(self):
        r = S.post(f"{API}/trades", json={"kind": "hypothetical", "ticker": "BHP", "entry_price": 30, "quantity": -1})
        assert r.status_code == 422
