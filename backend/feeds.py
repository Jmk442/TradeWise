import re
import time
import xml.etree.ElementTree as ET

import httpx
from dateutil import parser as dparser

NS = {"a": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/", "yt": "http://www.youtube.com/xml/schemas/2015"}
CASHTAG = re.compile(r"\$([A-Z]{1,5}(?:\.AX)?)\b")
_cache = {}

DEFAULT_SOURCES = [
    {"slug": "tradertv-live", "name": "TraderTV Live", "url": "https://tradertv.live/", "region": "US",
     "feed_url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCn75vF3UxwWeWPAY4-5Z6HQ", "feed_type": "YouTube"},
    {"slug": "smb-capital", "name": "SMB Capital", "url": "https://www.youtube.com/@smbcapital", "region": "US",
     "feed_url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCg3B_joekBGJ1s_4fRjsMKA", "feed_type": "YouTube"},
    {"slug": "bear-bull-traders", "name": "Bear Bull Traders", "url": "https://bearbulltraders.com/", "region": "US",
     "feed_url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCfO2yCpx6_XU-xovhpJuaYw", "feed_type": "YouTube"},
]


def _parse(xml_text):
    root = ET.fromstring(xml_text)
    items = []
    entries = root.findall("a:entry", NS)
    if entries:
        for e in entries:
            link = e.find("a:link", NS)
            desc = e.find("media:group/media:description", NS)
            thumb = e.find("media:group/media:thumbnail", NS)
            items.append({
                "title": (e.findtext("a:title", "", NS) or "").strip(),
                "link": link.get("href") if link is not None else None,
                "published": e.findtext("a:published", None, NS),
                "summary": (desc.text or "")[:400] if desc is not None else "",
                "thumbnail": thumb.get("url") if thumb is not None else None,
            })
    else:
        for i in root.iter("item"):
            pub = i.findtext("pubDate")
            items.append({"title": (i.findtext("title") or "").strip(), "link": i.findtext("link"),
                          "published": dparser.parse(pub).isoformat() if pub else None,
                          "summary": re.sub("<[^>]+>", "", i.findtext("description") or "")[:400], "thumbnail": None})
    for it in items:
        it["cashtags"] = sorted(set(CASHTAG.findall(f"{it['title']} {it['summary']}")))
    return items


async def fetch_feed(feed_url):
    hit = _cache.get(feed_url)
    if hit and time.time() - hit[0] < 600:
        return hit[1], None
    try:
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True) as c:
            r = await c.get(feed_url)
        r.raise_for_status()
        items = _parse(r.text)
    except Exception as e:
        return [], f"Feed unavailable: {type(e).__name__}"
    _cache[feed_url] = (time.time(), items)
    return items, None


NUM = r"\$?(\d+(?:\.\d+)?)"
PATTERNS = {
    "entry": re.compile(rf"\b(?:entry|entered|buy|bought|long|in|add(?:ed)?)\b\s*(?:at|@|:)?\s*{NUM}", re.I),
    "stop": re.compile(rf"\b(?:stop|sl|stop[- ]loss)\b\s*(?:at|@|:)?\s*{NUM}", re.I),
    "target": re.compile(rf"\b(?:target|tp|pt|price target)\b\s*(?:at|@|:)?\s*{NUM}", re.I),
    "exit": re.compile(rf"\b(?:exit(?:ed)?|sold|closed|out)\b\s*(?:at|@|:)?\s*{NUM}", re.I),
}
DATE_PREFIX = re.compile(r"^\[?([0-9]{1,4}[./-][0-9]{1,2}[./-][0-9]{1,4}[ ,T]*[0-9:]*\s*(?:AM|PM)?)\]?", re.I)
BARE_TICKER = re.compile(r"\b(?:long|short|buy|sell|watching|on)\s+([A-Z]{1,5})\b")


def parse_messages(text, platform):
    blocks = [b.strip() for b in re.split(r"\n\s*\n|\n(?=\[?\d{1,4}[./-]\d{1,2}[./-]\d{1,4})", text) if b.strip()]
    out = []
    for b in blocks[:50]:
        tickers = CASHTAG.findall(b) or BARE_TICKER.findall(b)
        if not tickers:
            continue
        found = {k: (float(m.group(1)) if (m := p.search(b)) else None) for k, p in PATTERNS.items()}
        published = None
        m = DATE_PREFIX.match(b)
        if m:
            try:
                published = dparser.parse(m.group(1), dayfirst=False).isoformat()
            except (ValueError, OverflowError):
                published = None
        direction = "short" if re.search(r"\bshort\b", b, re.I) else "long"
        missing = [k for k in ("entry", "stop") if found[k] is None] + ([] if published else ["timestamp"])
        out.append({"ticker": tickers[0], "direction": direction, "reported_text": b[:600], "platform": platform,
                    "published_at": published, **found, "missing": missing})
    return out
