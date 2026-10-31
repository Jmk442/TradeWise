import { useEffect, useState } from "react";
import { ExternalLink, ThumbsUp, ShieldAlert, Compass, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, money, pct, tone, stamp, signedMoney } from "@/lib/api";
import { Why, DelayedBadge } from "@/components/Bits";
import { PriceChart } from "@/components/PriceChart";
import { TradeDialog } from "@/components/TradeDialog";

const Block = ({ title, icon: Icon, items, accent, testid }) => (
  <div className="tw-card" data-testid={testid}>
    <div className={`mb-3 flex items-center gap-2 font-heading font-semibold ${accent}`}><Icon size={18} /> {title}</div>
    <ul className="space-y-3">
      {(items || []).map((it, i) => (
        <li key={i} className="text-sm">
          <div>{it.point}</div>
          <Why text={it.why} testid={`${testid}-why-${i}`} />
        </li>
      ))}
      {!items?.length && <li className="text-sm text-muted-foreground">Nothing clear from the available data.</li>}
    </ul>
  </div>
);

const SC = { bullish: "border-up/50", neutral: "border-border", bearish: "border-down/50" };

const Scenario = ({ s, cur, compare }) => (
  <div className={`tw-card border-t-4 ${SC[s.name] || ""}`} data-testid={`scenario-${s.name}`}>
    <div className="flex items-center justify-between">
      <span className="font-heading font-semibold capitalize">{s.name}</span>
      <span className="text-xs text-muted-foreground">{s.horizon}</span>
    </div>
    <div className="num mt-2 text-lg">
      {typeof s.price_low === "number" && typeof s.price_high === "number" ? `${money(s.price_low, cur)} – ${money(s.price_high, cur)}` : "No price range justified"}
    </div>
    {compare && <div className="mt-1 text-xs font-medium text-primary" data-testid={`scenario-compare-${s.name}`}>Now: {compare.position}</div>}
    <dl className="mt-3 space-y-2 text-sm">
      <div><dt className="text-xs text-muted-foreground">Assumes</dt><dd>{s.assumptions}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Wrong if</dt><dd>{s.invalidation}</dd></div>
    </dl>
    <Why text={`Evidence: ${s.evidence} Uncertainty: ${s.uncertainty}`} testid={`scenario-why-${s.name}`} />
  </div>
);

const Levels = ({ lv, cur }) => {
  const rows = [["20-day high", lv.high_20d], ["20-day low", lv.low_20d], ["20-day average", lv.sma_20], ["50-day average", lv.sma_50], ["Typical daily range (ATR 14)", lv.atr_14], ["1-month change", lv.change_1m_pct, true]];
  return (
    <div className="tw-card" data-testid="key-levels">
      <div className="mb-2 font-heading font-semibold">Important price levels</div>
      <div className="divide-y text-sm">
        {rows.map(([l, v, isPct]) => (
          <div key={l} className="flex justify-between py-2"><span className="text-muted-foreground">{l}</span><span className="num">{v == null ? "—" : isPct ? pct(v) : money(v, cur)}</span></div>
        ))}
      </div>
    </div>
  );
};

export const AssessmentReport = ({ a, onRecorded }) => {
  const [chart, setChart] = useState([]);
  const [rec, setRec] = useState(null);
  const q = a.quote, r = a.result, inp = a.input, cur = q.currency;
  const market = inp.market;
  useEffect(() => {
    api.get(`/chart/${inp.ticker}`, { params: { market, range: "3mo", interval: "1d" } }).then((x) => setChart(x.data.candles)).catch(() => setChart([]));
  }, [inp.ticker, market]);
  const lines = [
    inp.entry_price && { y: inp.entry_price, label: "Entry", kind: "entry" },
    inp.stop && { y: inp.stop, label: "Stop", kind: "stop" },
    inp.target && { y: inp.target, label: "Target", kind: "target" },
  ].filter(Boolean);
  const cmp = a.comparison;
  const prefill = (kind) => ({ kind, ticker: inp.ticker, market, direction: inp.direction, entry_price: inp.entry_used, quantity: inp.quantity || "", stop: inp.stop || "", target: inp.target || "", entry_time: inp.buy_time || "", assessment_id: a.id });

  return (
    <div className="space-y-6 rise" data-testid="assessment-report">
      <div className="tw-card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-2xl font-bold">{a.symbol}</span>
          <span className="text-sm text-muted-foreground">{q.name} · {q.exchange}</span>
          <DelayedBadge asOf={q.as_of} />
          <span className="ml-auto text-xs text-muted-foreground" data-testid="assessment-saved-at">Saved {stamp(a.created_at)}</span>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="num text-3xl font-semibold" data-testid="assessment-price">{money(q.price, cur)}</span>
          <span className={`num ${tone(q.change_pct)}`}>{pct(q.change_pct)}</span>
        </div>
        <div className="mt-4 rounded-lg bg-secondary p-4" data-testid="bottom-line">
          <div className="tw-eyebrow mb-1">Bottom line</div>
          <p className="text-base">{r.bottom_line}</p>
        </div>
        {cmp && (
          <div className="mt-3 rounded-lg border border-primary/40 p-3 text-sm" data-testid="assessment-comparison">
            Since this assessment: {money(cmp.price_then, cur)} → <span className="num">{money(cmp.price_now, cur)}</span>{" "}
            <span className={`num ${tone(cmp.change_pct)}`}>({pct(cmp.change_pct)})</span> as of {stamp(cmp.as_of)}
          </div>
        )}
        <div className="mt-4"><PriceChart data={chart} lines={lines} testid="assessment-chart" /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="What looks positive" icon={ThumbsUp} items={r.positive} accent="text-up" testid="block-positive" />
        <Block title="What could go wrong" icon={ShieldAlert} items={r.risks} accent="text-down" testid="block-risks" />
        <Block title="What might happen next" icon={Compass} items={r.next} accent="text-primary" testid="block-next" />
        <Block title="What to check before deciding" icon={ListChecks} items={r.checks} accent="text-warn" testid="block-checks" />
      </div>

      <div>
        <h3 className="mb-3 font-heading text-lg font-semibold">Scenarios</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {(r.scenarios || []).map((s) => <Scenario key={s.name} s={s} cur={cur} compare={cmp?.scenarios.find((c) => c.name === s.name)} />)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">No probabilities are given because the data can't support them.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="tw-card" data-testid="pnl-scenarios">
          <div className="mb-2 font-heading font-semibold">Potential gain / loss</div>
          {a.pnl_scenarios.length ? (
            <div className="divide-y text-sm">
              {a.pnl_scenarios.map((p) => (
                <div key={p.label} className="flex justify-between py-2">
                  <span className="text-muted-foreground">{p.label} <span className="num">({money(p.price, cur)})</span></span>
                  <span className={`num font-medium ${tone(p.pnl)}`}>{signedMoney(p.pnl, cur)}</span>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">Before fees and slippage. Entry used: {money(inp.entry_used, cur)}.</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">Add a quantity to see dollar outcomes.</p>}
        </div>
        <Levels lv={a.levels} cur={cur} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="tw-card" data-testid="news-list">
          <div className="mb-2 font-heading font-semibold">Relevant news</div>
          {a.news.length ? a.news.map((n) => {
            const rel = r.news_relevance?.find((x) => x.title === n.title);
            return (
              <a key={n.link} href={n.link} target="_blank" rel="noreferrer" className="block border-b py-2 last:border-0 hover:text-primary">
                <div className="text-sm">{n.title} <ExternalLink size={11} className="inline" /></div>
                <div className="text-xs text-muted-foreground">{n.publisher} · {stamp(n.published)}{rel ? ` · ${rel.relevance}` : ""}</div>
              </a>
            );
          }) : <p className="text-sm text-muted-foreground">No recent news found in the free feed.</p>}
        </div>
        <div className="tw-card" data-testid="uncertainties">
          <div className="mb-2 font-heading font-semibold">Uncertainty & missing info</div>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(r.uncertainties || []).map((u, i) => <li key={i}>{u}</li>)}
            <li>Prices are delayed free data, not your broker's live quote.</li>
          </ul>
        </div>
      </div>

      <div className="tw-card flex flex-wrap items-center gap-3" data-testid="record-decision">
        <span className="mr-auto text-sm font-medium">Record your decision</span>
        <Button data-testid="record-actual-btn" className="h-11" onClick={() => setRec(prefill("actual"))}>I bought it (actual)</Button>
        <Button data-testid="record-simulated-btn" variant="secondary" className="h-11" onClick={() => setRec(prefill("simulated"))}>Practice trade</Button>
        <Button data-testid="record-hypothetical-btn" variant="outline" className="h-11" onClick={() => setRec(prefill("hypothetical"))}>Just tracking</Button>
      </div>
      <TradeDialog open={!!rec} onOpenChange={(o) => !o && setRec(null)} prefill={rec} onSaved={onRecorded} />
    </div>
  );
};
