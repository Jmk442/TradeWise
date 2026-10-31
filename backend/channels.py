import os
import re
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

UA = {"User-Agent": "Mozilla/5.0"}


class ChannelError(Exception):
    pass


def tokens_status():
    return {"telegram_bot": bool(os.environ.get("TELEGRAM_BOT_TOKEN")), "discord_bot": bool(os.environ.get("DISCORD_BOT_TOKEN"))}


async def telegram_public(handle):
    handle = handle.lstrip("@").split("/")[-1]
    if not re.match(r"^[A-Za-z0-9_]{4,64}$", handle):
        raise ChannelError("Telegram channel names are letters, numbers and underscores.")
    try:
        async with httpx.AsyncClient(timeout=15, headers=UA, follow_redirects=True) as c:
            r = await c.get(f"https://t.me/s/{handle}")
    except httpx.HTTPError:
        raise ChannelError("Telegram could not be reached.")
    soup = BeautifulSoup(r.text, "html.parser")
    msgs = soup.select("div.tgme_widget_message[data-post]")
    if r.status_code != 200 or (not msgs and "tgme_channel_info" not in r.text):
        raise ChannelError("Not a public Telegram channel with a web preview. Private channels need a bot token.")
    out = []
    for m in msgs:
        post = m["data-post"]
        txt = m.select_one(".tgme_widget_message_text")
        t = m.select_one("time[datetime]")
        if not txt:
            continue
        out.append({"id": int(post.split("/")[-1]), "text": txt.get_text("\n", strip=True),
                    "published_at": t["datetime"] if t else None, "link": f"https://t.me/{post}"})
    return out


async def telegram_bot(chat_id, offset):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise ChannelError("TELEGRAM_BOT_TOKEN not configured.")
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"https://api.telegram.org/bot{token}/getUpdates",
                            params={"offset": offset, "allowed_updates": '["channel_post","message"]'})
    except httpx.HTTPError:
        raise ChannelError("Telegram API could not be reached.")
    data = r.json()
    if not data.get("ok"):
        raise ChannelError(f"Telegram API: {data.get('description', 'error')}")
    out, last = [], offset
    for u in data["result"]:
        last = max(last, u["update_id"] + 1)
        m = u.get("channel_post") or u.get("message")
        if not m or str(m["chat"]["id"]) != str(chat_id) and m["chat"].get("username", "").lower() != str(chat_id).lstrip("@").lower():
            continue
        cid = str(m["chat"]["id"]).replace("-100", "")
        out.append({"id": m["message_id"], "text": m.get("text") or m.get("caption") or "",
                    "published_at": datetime.fromtimestamp(m["date"], tz=timezone.utc).isoformat(),
                    "link": f"https://t.me/c/{cid}/{m['message_id']}"})
    return out, last


async def discord_messages(channel_id, after=None):
    token = os.environ.get("DISCORD_BOT_TOKEN")
    if not token:
        raise ChannelError("DISCORD_BOT_TOKEN not configured.")
    if not re.match(r"^\d{15,22}$", str(channel_id)):
        raise ChannelError("Discord channel ID should be a long number (enable Developer Mode → Copy Channel ID).")
    h = {"Authorization": f"Bot {token}", **UA}
    try:
        async with httpx.AsyncClient(timeout=15, headers=h) as c:
            ch = await c.get(f"https://discord.com/api/v10/channels/{channel_id}")
            if ch.status_code >= 400:
                raise ChannelError(f"Discord: bot can't see that channel ({ch.status_code}). Has it been invited?")
            guild = ch.json().get("guild_id", "@me")
            params = {"limit": 50, **({"after": after} if after else {})}
            r = await c.get(f"https://discord.com/api/v10/channels/{channel_id}/messages", params=params)
    except httpx.HTTPError:
        raise ChannelError("Discord could not be reached.")
    if r.status_code >= 400:
        raise ChannelError(f"Discord: can't read messages ({r.status_code}). Check Read Message History permission.")
    return [{"id": int(m["id"]), "text": m.get("content", ""), "published_at": m["timestamp"],
             "link": f"https://discord.com/channels/{guild}/{channel_id}/{m['id']}"} for m in r.json()]
