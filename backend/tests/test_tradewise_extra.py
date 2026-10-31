# TradeWise extra regression: Today watching (verified setup), feed unfollow, historical no-look-ahead window, timezone handling
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()


def test_verified_setup_shows_on_today_us():
    src = [s for s in S.get(f"{API}/sources").json() if s["followed"]][0]
    p = S.get(f"{API}/quote/AAPL", params={"market": "US"}).json()["price"]
    body = {"source_id": src["id"], "source_name": src["name"], "ticker": "AAPL", "market": "US", "reported_text": "TEST verified",
            "entry": p, "stop": round(p * 0.97, 2), "target": round(p * 1.04, 2), "source_url": "https://youtube.com/x",
            "published_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()}
    s = S.post(f"{API}/setups", json=body).json()
    try:
        assert s["status"] == "Source verified"
        today = S.get(f"{API}/today", params={"market": "US"}).json()
        assert any(w["id"] == s["id"] for w in today["watching"])
        assert any(r["ticker"] == "AAPL" for r in today["reviewing"])
        asx = S.get(f"{API}/today", params={"market": "ASX"}).json()
        assert not any(w["id"] == s["id"] for w in asx["watching"])
    finally:
        S.delete(f"{API}/setups/{s['id']}")


def test_future_published_setup_not_verified():
    src = S.get(f"{API}/sources").json()[0]
    p = S.get(f"{API}/quote/AAPL", params={"market": "US"}).json()["price"]
    s = S.post(f"{API}/setups", json={"source_id": src["id"], "source_name": src["name"], "ticker": "AAPL", "market": "US",
                                       "reported_text": "TEST future", "entry": p, "source_url": "https://x",
                                       "published_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}).json()
    S.delete(f"{API}/setups/{s['id']}")
    assert s["status"] != "Source verified", "future-dated setup was labelled Source verified"


def test_feed_respects_unfollow():
    src = [s for s in S.get(f"{API}/sources").json() if s["slug"] == "smb-capital"][0]
    S.patch(f"{API}/sources/{src['id']}", params={"followed": "false"})
    try:
        items = S.get(f"{API}/feed", timeout=40).json()["items"]
        assert not any(i["source_id"] == src["id"] for i in items)
    finally:
        S.patch(f"{API}/sources/{src['id']}", params={"followed": "true"})


def test_historical_intraday_stays_within_decision_day():
    d = datetime.now() - timedelta(days=10)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    r = S.post(f"{API}/historical", json={"ticker": "BHP", "market": "ASX", "decision_at": d.strftime("%Y-%m-%d 10:30")}, timeout=60)
    h = r.json()
    assert h["exit_at"][:10] == d.strftime("%Y-%m-%d"), f"exit_at {h['exit_at']} is outside decision day (live bar leaked in)"
