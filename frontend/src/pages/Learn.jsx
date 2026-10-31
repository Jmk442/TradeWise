import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const TOPICS = [
  ["concepts", "Day trading concepts", [
    ["What day trading is", "Opening and closing a position within the same session. You're trading short-term price movement, not owning a business long-term. Most of the result comes down to entries, exits and position size."],
    ["The first hour", "The first 60 minutes after the open usually has the most volume and the widest swings. Spreads can be wide in the first few minutes. Many traders wait for an opening range to form before acting."],
    ["ASX vs US sessions", "The ASX trades 10:00–16:00 Sydney time with a staggered open. US markets trade 9:30–16:00 New York time, which is about 00:30–08:00 or 01:30–08:00 in Sydney depending on daylight saving. A US idea tells you nothing about an ASX stock unless there's a direct link."],
  ]],
  ["terms", "Terminology", [
    ["Long / short", "Long = you profit if the price rises. Short = you profit if it falls (needs a broker that allows it)."],
    ["Stop-loss", "A price where you've decided in advance to exit and take a small loss so it can't become a big one."],
    ["Target", "A price where you plan to take profit. It's a plan, not a prediction."],
    ["Spread & slippage", "Spread is the gap between buy and sell prices. Slippage is when you get filled at a worse price than expected. Both are real costs."],
    ["Delayed data", "Free quotes lag the live market by 15–20 minutes. Always check your broker's live price before you act."],
  ]],
  ["risk", "Understanding risk", [
    ["Risk per trade", "Decide how much you're willing to lose on one trade before entering. That's (entry − stop) × shares. Many traders keep it to a small slice of their account."],
    ["Risk vs reward", "If you risk $50 to make $50 you need to be right more than half the time after fees. Bigger reward relative to risk gives you more room to be wrong."],
    ["Losing streaks", "Even a good approach has runs of losses. Position size is what keeps a streak survivable."],
  ]],
  ["following", "Following experienced traders", [
    ["Commentary isn't a track record", "A video or post shows what someone is watching. It doesn't show whether they took the trade, their size, or their losses."],
    ["What good evidence looks like", "Timestamped entries and exits, published before the move, with losing trades shown too. TradeWise's scorecard only shows stats once records are complete."],
    ["Timing matters", "By the time you see a setup, price may have moved. That's why setups get relabelled as conditions change."],
  ]],
  ["charts", "Reading charts", [
    ["Support & resistance", "Prices where buying or selling showed up before. Recent highs and lows are the simplest version."],
    ["Moving averages", "The average close over N days. Price above a rising average suggests an uptrend, nothing more certain than that."],
    ["Volume", "Moves on heavy volume usually carry more weight than moves on light volume."],
  ]],
  ["why", "Why setups succeed or fail", [
    ["Conditions change", "News, the broader market or a big seller can break a pattern that looked clean."],
    ["Late entries", "Entering well after the trigger moves your stop further away and makes the trade worse."],
    ["No exit plan", "Most big losses come from not having a stop or moving it further away."],
  ]],
  ["review", "Evaluating past decisions", [
    ["Judge the process", "A good decision can lose and a bad one can win. Ask whether you followed your plan with the information you had at the time."],
    ["Avoid hindsight", "'What would have happened' only uses prices available at your decision time to describe the setup, then shows what followed."],
    ["Compare to your assessment", "Saved assessments let you see which scenario actually played out and what you missed."],
  ]],
];

export default function Learn() {
  return (
    <div className="space-y-8" data-testid="learn-page">
      <div>
        <div className="tw-eyebrow">Optional reading</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Learn</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">Short explanations you can dip into any time. Nothing here is required.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {TOPICS.map(([id, title, items]) => (
          <div key={id} className="tw-card" data-testid={`learn-topic-${id}`}>
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <Accordion type="single" collapsible>
              {items.map(([q, a], i) => (
                <AccordionItem key={q} value={q}>
                  <AccordionTrigger className="text-left text-sm" data-testid={`learn-${id}-${i}`}>{q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </div>
  );
}
