import json
import os
import re
import uuid

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

SYSTEM = """You are TradeWise, a calm, direct assessment assistant for a teenage day trader who already has his own brokerage account.
You never execute or recommend placing orders, never say "buy" or "sell" as an instruction, never promise outcomes.
Use ONLY the market data, indicators and news supplied in the user message. If something is not in the data, say it is unknown.
Do NOT invent probabilities, percentages of likelihood, confidence scores, ratings or analyst targets.
Use plain language, short sentences, minimal jargon. Cite numbers from the supplied data when you make a point.
Return ONLY valid JSON, no markdown fences."""

SCHEMA = """{
 "bottom_line": "2-3 plain sentences summarising the situation without telling the user what to do",
 "positive": [{"point": "short", "why": "evidence from data"}],
 "risks": [{"point": "short", "why": "evidence from data"}],
 "next": [{"point": "what might happen next, conditional language", "why": "evidence"}],
 "checks": [{"point": "something to check before deciding", "why": "reason"}],
 "scenarios": [
   {"name": "bullish|neutral|bearish", "horizon": "e.g. rest of today / 1-5 trading days",
    "assumptions": "what must be true", "evidence": "supporting data points",
    "price_low": number or null, "price_high": number or null,
    "invalidation": "what price/event would make this scenario wrong", "uncertainty": "what is unknown"}
 ],
 "news_relevance": [{"title": "exact title from supplied news", "relevance": "one sentence"}],
 "uncertainties": ["missing or stale information"]
}
Give 2-4 items per list. Exactly three scenarios (bullish, neutral, bearish). Only give price_low/price_high when justified by supplied levels (e.g. 20-day range, ATR); otherwise null."""


def _extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])


async def run_assessment(context: dict) -> dict:
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"assess-{uuid.uuid4()}",
                   system_message=SYSTEM).with_model("openai", "gpt-5.5")
    prompt = f"Assess this possible or completed trade using only this data:\n{json.dumps(context, default=str)}\n\nRespond with JSON in this exact shape:\n{SCHEMA}"
    buf = []
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            buf.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return _extract_json("".join(buf))
