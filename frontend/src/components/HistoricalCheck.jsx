import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, errMsg, money, pct, tone, stamp, signedMoney, num } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { Field, ErrorNote, Loading } from "@/components/Bits";
import { PriceChart } from "@/components/PriceChart";

const blank = { ticker: "", direction: "long", decision_at: "", entry_price: "", quantity: "100", stop: "", target: "", fees_per_side: "0", slippage_pct: "0.05", horizon: "same_day" };

const Stat = ({ l, v, cls = "" }) => (
  <div className="rounded-lg bg-secondary p-3"><div className="text-xs text-muted-foreground">{l}</div><div className={`num mt-1 font-semibold ${cls}`}>{v}</div></div>
);

export const HistoricalCheck = () => {
  const { market } = useApp();
  const [f, setF] = useState(blank);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = async () => {
    setBusy(true); setErr(null); setRes(null);
    try {
      const body = { ...f, market, entry_price: num(f.entry_price), quantity: num(f.quantity) || 1, stop: num(f.stop), target: num(f.target), fees_per_side: num(f.fees_per_side) || 0, slippage_pct: num(f.slippage_pct) || 0 };
      setRes((await api.post("/historical", body)).data);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const save = async () => {
    try {
      await api.post("/trades", { kind: "hypothetical", ticker: f.ticker, market, direction: f.direction, entry_price: res.entry, quantity: num(f.quantity) || 1,
        entry_time: res.decision_at, stop: num(f.stop), target: num(f.target), status: "closed", exit_price: res.exit_price, exit_time: res.exit_at, fees: Math.round((res.fees + res.slippage) * 100) / 100,
        notes: `From 'What would have happened'. Includes ${money(res.fees + res.slippage, res.currency)} fees + slippage.` });
      toast.success("Saved to My Trades as hypothetical");
    } catch (e) { toast.error(errMsg(e)); }
  };

  const cur = res?.currency;
  const cls = "h-11";
  return (
    <div className="space-y-6" data-testid="historical-check">
      <div className="tw-card grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label={`Ticker (${market})`}><Input data-testid="hist-ticker-input" value={f.ticker} onChange={set("ticker")} className={`${cls} uppercase`} /></Field>
        <Field label="Decision time" hint="Market local time"><Input data-testid="hist-time-input" type="datetime-local" value={f.decision_at} onChange={set("decision_at")} className={cls} /></Field>
        <Field label="Entry price (optional)"><Input data-testid="hist-entry-input" type="number" step="any" value={f.entry_price} onChange={set("entry_price")} className={cls} /></Field>
        <Field label="Quantity"><Input data-testid="hist-qty-input" type="number" step="any" value={f.quantity} onChange={set("quantity")} className={cls} /></Field>
        <Field label="Stop-loss"><Input data-testid="hist-stop-input" type="number" step="any" value={f.stop} onChange={set("stop")} className={cls} /></Field>
        <Field label="Target"><Input data-testid="hist-target-input" type="number" step="any" value={f.target} onChange={set("target")} className={cls} /></Field>
        <Field label="Fee per side ($)"><Input data-testid="hist-fees-input" type="number" step="any" value={f.fees_per_side} onChange={set("fees_per_side")} className={cls} /></Field>
        <Field label="Slippage (%)"><Input data-testid="hist-slippage-input" type="number" step="any" value={f.slippage_pct} onChange={set("slippage_pct")} className={cls} /></Field>
        <Field label="Direction">
          <select data-testid="hist-direction-select" value={f.direction} onChange={set("direction")} className={`${cls} w-full rounded-md border bg-background px-3 text-sm`}>
            <option value="long">Long</option><option value="short">Short</option>
          </select>
        </Field>
        <Field label="Look ahead">
          <select data-testid="hist-horizon-select" value={f.horizon} onChange={set("horizon")} className={`${cls} w-full rounded-md border bg-background px-3 text-sm`}>
            <option value="same_day">Rest of that day</option><option value="5d">5 trading days</option><option value="20d">20 trading days</option>
          </select>
        </Field>
        <div className="col-span-2 flex items-end">
          <Button data-testid="hist-run-button" onClick={run} disabled={busy || !f.ticker || !f.decision_at} className="h-11 w-full">{busy ? "Checking…" : "What would have happened?"}</Button>
        </div>
      </div>
      {busy && <Loading text="Pulling historical prices…" />}
      {err && <ErrorNote text={err} />}
      {res && (
        <div className="space-y-4 rise" data-testid="hist-result">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat l="Entry" v={money(res.entry, cur)} />
            <Stat l={`Exit (${res.exit_reason})`} v={money(res.exit_price, cur)} />
            <Stat l="High / low after" v={`${money(res.high, cur)} / ${money(res.low, cur)}`} />
            <Stat l="Move to end of window" v={pct(res.move_pct)} cls={tone(res.move_pct)} />
            <Stat l="Gross P&L" v={signedMoney(res.gross_pnl, cur)} cls={tone(res.gross_pnl)} />
            <Stat l="Fees + slippage" v={money(res.fees + res.slippage, cur)} />
            <Stat l="Net hypothetical P&L" v={signedMoney(res.net_pnl, cur)} cls={tone(res.net_pnl)} />
            <Stat l="Stop / target reached" v={`${res.stop_reached ? "Stop hit" : "Stop not hit"} · ${res.target_reached ? "Target hit" : "Target not hit"}`} />
          </div>
          <div className="tw-card">
            <PriceChart data={res.candles} intraday={f.horizon === "same_day"} testid="hist-chart" lines={[
              { y: res.entry, label: "Entry", kind: "entry" }, num(f.stop) && { y: num(f.stop), label: "Stop", kind: "stop" }, num(f.target) && { y: num(f.target), label: "Target", kind: "target" },
            ].filter(Boolean)} />
          </div>
          <div className="tw-card text-sm" data-testid="hist-known">
            <div className="mb-1 font-heading font-semibold">What you could have known at {stamp(res.decision_at)}</div>
            <div className="num text-muted-foreground">Prior close {money(res.known_at_decision.prior_close, cur)} · 20-day range {money(res.known_at_decision.low_20d, cur)}–{money(res.known_at_decision.high_20d, cur)} · 20-day avg {money(res.known_at_decision.sma_20, cur)}</div>
            <p className="mt-1 text-xs text-muted-foreground">{res.known_at_decision.note}</p>
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
          <Button data-testid="hist-save-button" variant="outline" className="h-11" onClick={save}>Save as hypothetical trade</Button>
        </div>
      )}
    </div>
  );
};
