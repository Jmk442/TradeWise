# TradeWise Round 2 regression tests: watchlist, alerts, calendar, live channels, today integration
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()
CREATED = {"watch": [], "trades": [], "channels": [], "alert_refs": set()}
STATE = {}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    # Remove leftovers from earlier runs
    for w in S.get(f"{API}/watchlist", params={"market": "ASX"}).json() + S.get(f"{API}/watchlist", params={"market": "US"}).json():
        if w["ticker"] in ("WES", "CBA", "MSFT"):
            S.delete(f"{API}/watchlist/{w['id']}")
    yield
    for w in CREATED["watch"]:
        S.delete(f"{API}/watchlist/{w}")
    for t in CREATED["trades"]:
        S.delete(f"{API}/trades/{t}")
    for c in CREATED["channels"]:
        S.delete(f"{API}/channels/{c}")


# ---- Watchlist ----
class TestWatchlist:
    def test_add_wes(self):
        r = S.post(f"{API}/watchlist", json={"ticker": "wes", "market": "ASX"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ticker"] == "WES" and d["symbol"] == "WES.AX" and d["market"] == "ASX"
        assert isinstance(d["id"], str)
        CREATED["watch"].append(d["id"])
        STATE["wes"] = d["id"]

    def test_duplicate_409(self):
        r = S.post(f"{API}/watchlist", json={"ticker": "WES", "market": "ASX"})
        assert r.status_code == 409
        assert "already" in r.json()["detail"]

    def test_invalid_ticker(self):
        r = S.post(f"{API}/watchlist", json={"ticker": "ZZZQXX", "market": "ASX"})
        assert r.status_code in (404, 422), r.text
        assert r.json().get("detail")

    def test_list_has_price_and_event(self):
        items = S.get(f"{API}/watchlist", params={"market": "ASX"}).json()
        w = next(i for i in items if i["ticker"] == "WES")
        assert w["price"] and w["price"] > 0
        assert "next_event" in w and w["currency"] == "AUD"
        STATE["wes_price"] = w["price"]

    def test_above_below_validation(self):
        wid, p = STATE["wes"], STATE["wes_price"]
        assert S.patch(f"{API}/watchlist/{wid}", json={"alert_above": round(p * 0.9, 2)}).status_code == 422
        assert S.patch(f"{API}/watchlist/{wid}", json={"alert_below": round(p * 1.1, 2)}).status_code == 422
        r = S.patch(f"{API}/watchlist/{wid}", json={"alert_above": round(p * 1.2, 2), "alert_below": round(p * 0.8, 2)})
        assert r.status_code == 200, r.text
        assert r.json()["alert_above"] == round(p * 1.2, 2)
        items = S.get(f"{API}/watchlist", params={"market": "ASX"}).json()
        w = next(i for i in items if i["ticker"] == "WES")
        assert w["alert_below"] == round(p * 0.8, 2)

    def test_clear_level(self):
        r = S.patch(f"{API}/watchlist/{STATE['wes']}", json={"clear_above": True})
        assert r.status_code == 200 and r.json()["alert_above"] is None and r.json()["alert_below"] is not None

    def test_us_list_separate(self):
        us = S.get(f"{API}/watchlist", params={"market": "US"}).json()
        assert all(i["market"] == "US" for i in us)
        assert not any(i["ticker"] == "WES" for i in us)

    def test_today_reviewing_watch_first(self):
        d = S.get(f"{API}/today", params={"market": "ASX"}).json()
        assert d["reviewing"][0]["ticker"] == "WES" and d["reviewing"][0].get("watch") is True

    def test_patch_delete_missing_404(self):
        assert S.patch(f"{API}/watchlist/000000000000000000000000", json={"note": "x"}).status_code == 404
        assert S.delete(f"{API}/watchlist/000000000000000000000000").status_code == 404


# ---- Alerts ----
class TestAlerts:
    def test_alert_created_once(self):
        p = STATE.get("wes_price") or 76.0
        # long simulated trade whose target is already below current price
        r = S.post(f"{API}/trades", json={"kind": "simulated", "ticker": "WES", "market": "ASX", "direction": "long",
                                          "entry_price": round(p * 0.8, 2), "quantity": 10, "target": round(p * 0.9, 2),
                                          "stop": round(p * 0.7, 2)})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        CREATED["trades"].append(tid)
        STATE["tid"] = tid
        c1 = S.post(f"{API}/alerts/check")
        assert c1.status_code == 200, c1.text
        al = S.get(f"{API}/alerts").json()
        mine = [a for a in al["alerts"] if a["ref_id"] == tid]
        assert len(mine) == 1, mine
        assert mine[0]["label"] == "Practice trade hit target" and mine[0]["seen"] is False
        assert al["unseen"] >= 1
        c2 = S.post(f"{API}/alerts/check")
        assert c2.status_code == 200
        al2 = S.get(f"{API}/alerts").json()
        assert len([a for a in al2["alerts"] if a["ref_id"] == tid]) == 1

    def test_short_stop_alert(self):
        p = STATE.get("wes_price") or 76.0
        r = S.post(f"{API}/trades", json={"kind": "simulated", "ticker": "WES", "market": "ASX", "direction": "short",
                                          "entry_price": round(p * 0.8, 2), "quantity": 5, "stop": round(p * 0.9, 2)})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        CREATED["trades"].append(tid)
        S.post(f"{API}/alerts/check")
        mine = [a for a in S.get(f"{API}/alerts").json()["alerts"] if a["ref_id"] == tid]
        assert len(mine) == 1 and mine[0]["label"] == "Practice trade hit stop-loss" and mine[0]["direction"] == "above"

    def test_mark_seen(self):
        assert S.post(f"{API}/alerts/seen").json()["ok"] is True
        assert S.get(f"{API}/alerts").json()["unseen"] == 0


# ---- Calendar ----
class TestCalendar:
    @pytest.mark.parametrize("market", ["ASX", "US"])
    def test_calendar_shape(self, market):
        r = S.get(f"{API}/calendar", params={"market": market})
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("economic", "economic_available", "company", "holidays", "company_coverage", "sources"):
            assert k in d
        assert isinstance(d["economic"], list) and isinstance(d["company"], list)
        if market == "ASX":
            assert d["company_coverage"] >= 1  # WES watchlist + open trade
            for e in d["company"]:
                assert e["ticker"] and e["date"] and e["type"] in ("earnings", "dividend")
        for e in d["economic"]:
            assert e["impact"] in ("High", "Medium", "Holiday")


# ---- Channels ----
class TestChannels:
    def test_tokens_not_configured(self):
        d = S.get(f"{API}/channels").json()
        assert d["tokens"] == {"telegram_bot": False, "discord_bot": False}

    def test_discord_and_tg_bot_422(self):
        r = S.post(f"{API}/channels", json={"platform": "discord", "handle": "123456789012345678", "name": "TEST_d", "market": "US"})
        assert r.status_code == 422 and "token" in r.json()["detail"]
        r = S.post(f"{API}/channels", json={"platform": "telegram", "mode": "bot", "handle": "@x_chan", "name": "TEST_t", "market": "ASX"})
        assert r.status_code == 422 and "token" in r.json()["detail"]

    def test_invalid_handle_422(self):
        r = S.post(f"{API}/channels", json={"platform": "telegram", "mode": "public", "handle": "a b!", "name": "TEST_bad", "market": "ASX"})
        assert r.status_code == 422
        r = S.post(f"{API}/channels", json={"platform": "telegram", "mode": "public", "handle": "zz_nonexistent_tw_chan_98765",
                                            "name": "TEST_none", "market": "ASX"})
        assert r.status_code == 422, r.text
        assert "public" in r.json()["detail"].lower()

    def test_connect_public(self):
        r = S.post(f"{API}/channels", json={"platform": "telegram", "mode": "public", "handle": "durov", "name": "TEST_Durov", "market": "US"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        CREATED["channels"].append(d["id"])
        STATE["cid"] = d["id"]
        assert d["sync"]["error"] is None and "imported" in d["sync"]
        assert d["last_message_id"] > 0 and d["source_id"]
        assert any(c["id"] == d["id"] for c in S.get(f"{API}/channels").json()["channels"])

    def test_sync_toggle_delete(self):
        cid = STATE["cid"]
        r = S.post(f"{API}/channels/{cid}/sync", timeout=60)
        assert r.status_code == 200 and r.json()["error"] is None
        assert r.json()["messages_checked"] == 0  # no new posts since connect
        assert S.patch(f"{API}/channels/{cid}", params={"active": "false"}).status_code == 200
        c = next(c for c in S.get(f"{API}/channels").json()["channels"] if c["id"] == cid)
        assert c["active"] is False
        assert S.delete(f"{API}/channels/{cid}").status_code == 200
        CREATED["channels"].remove(cid)
        assert S.delete(f"{API}/channels/{cid}").status_code == 404
        assert S.post(f"{API}/channels/{cid}/sync").status_code == 404

    def test_paste_parser(self):
        r = S.post(f"{API}/import/parse", json={"text": "$BHP long entry 45.20 stop 43.80 target 48", "platform": "telegram"})
        assert r.status_code == 200, r.text
        assert "BHP" in r.text
