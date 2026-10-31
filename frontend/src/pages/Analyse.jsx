import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { api, errMsg, money, stamp, num } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { Field, ErrorNote, Loading, Empty } from "@/components/Bits";
import { AssessmentReport } from "@/components/AssessmentReport";
import { HistoricalCheck } from "@/components/HistoricalCheck";

const MODES = [["check", "Check my buy"], ["history", "What would have happened"], ["saved", "Saved assessments"]];
const blank = { direction: "long", entry_price: "", quantity: "", buy_time: "", stop: "", target: "", notes: "" };

const CheckBuy = ({ initialTicker }) => {
  const { market } = useApp();
  const [ticker, setTicker] = useState(initialTicker || "");
  const [f, setF] = useState(blank);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [a, setA] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null); setA(null);
    try {
      const body = { ...f, ticker, market, entry_price: num(f.entry_price), quantity: num(f.quantity), stop: num(f.stop), target: num(f.target), buy_time: f.buy_time || null };
      setA((await api.post("/assess", body)).data);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };

  const cls = "h-11";
  return (
    <div className="space-y-6">
      <form onSubmit={run} className="tw-card space-y-4" data-testid="check-buy-form">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input data-testid="analyse-ticker-input" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder={`Ticker on ${market}, e.g. ${market === "ASX" ? "BHP" : "NVDA"}`}
            className="h-14 flex-1 text-lg uppercase" aria-label="Ticker" />
          <Button data-testid="analyse-submit-button" type="submit" disabled={busy || !ticker.trim()} className="h-14 px-8 text-base">{busy ? "Assessing…" : "Check it"}</Button>
        </div>
        <button type="button" data-testid="analyse-more-toggle" onClick={() => setMore(!more)} className="inline-flex items-center gap-1 text-sm text-primary">
          Add my trade details (optional) <ChevronDown size={14} className={more ? "rotate-180" : ""} />
        </button>
        {more && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Direction">
              <select data-testid="analyse-direction-select" value={f.direction} onChange={set("direction")} className={`${cls} w-full rounded-md border bg-background px-3 text-sm`}>
                <option value="long">Long (buy)</option><option value="short">Short</option>
              </select>
            </Field>
            <Field label="Entry price"><Input data-testid="analyse-entry-input" type="number" step="any" value={f.entry_price} onChange={set("entry_price")} className={cls} /></Field>
            <Field label="Quantity"><Input data-testid="analyse-qty-input" type="number" step="any" value={f.quantity} onChange={set("quantity")} className={cls} /></Field>
            <Field label="Buy date/time"><Input data-testid="analyse-time-input" type="datetime-local" value={f.buy_time} onChange={set("buy_time")} className={cls} /></Field>
            <Field label="Stop-loss"><Input data-testid="analyse-stop-input" type="number" step="any" value={f.stop} onChange={set("stop")} className={cls} /></Field>
            <Field label="Target"><Input data-testid="analyse-target-input" type="number" step="any" value={f.target} onChange={set("target")} className={cls} /></Field>
            <div className="col-span-2"><Field label="Notes"><Textarea data-testid="analyse-notes-input" value={f.notes} onChange={set("notes")} rows={1} /></Field></div>
          </div>
        )}
      </form>
      {busy && <Loading text="Pulling delayed prices and news, then writing the assessment. This can take up to a minute…" testid="analyse-loading" />}
      {err && <ErrorNote text={err} testid="analyse-error" />}
      {a && <AssessmentReport a={a} />}
    </div>
  );
};

const Saved = () => {
  const { market } = useApp();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api.get("/assessments", { params: { market } }).then((r) => setList(r.data)).catch((e) => setErr(errMsg(e))); }, [market]);
  const show = useCallback(async (id) => {
    setOpen("loading");
    try { setOpen((await api.get(`/assessments/${id}`)).data); } catch (e) { setErr(errMsg(e)); setOpen(null); }
  }, []);
  if (err) return <ErrorNote text={err} />;
  if (!list) return <Loading />;
  if (open) return (
    <div className="space-y-4">
      <Button variant="outline" className="h-11" data-testid="saved-back-button" onClick={() => setOpen(null)}>Back to list</Button>
      {open === "loading" ? <Loading text="Comparing with the latest price…" /> : <AssessmentReport a={open} />}
    </div>
  );
  if (!list.length) return <Empty testid="saved-empty">No saved {market} assessments yet. Every check you run is saved automatically.</Empty>;
  return (
    <div className="divide-y rounded-xl border bg-card" data-testid="saved-list">
      {list.map((a) => (
        <button key={a.id} onClick={() => show(a.id)} data-testid={`saved-assessment-${a.id}`} className="flex w-full items-start gap-4 p-4 text-left hover:bg-secondary">
          <div className="w-20 font-heading font-semibold">{a.symbol}</div>
          <div className="min-w-0 flex-1"><div className="line-clamp-2 text-sm">{a.bottom_line}</div><div className="text-xs text-muted-foreground">{stamp(a.created_at)}</div></div>
          <div className="num text-sm">{money(a.price, a.currency)}</div>
        </button>
      ))}
    </div>
  );
};

export default function Analyse() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState("check");
  return (
    <div className="space-y-6" data-testid="analyse-page">
      <div>
        <div className="tw-eyebrow">Assess, don't guess</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Analyse</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {MODES.map(([v, l]) => (
          <button key={v} data-testid={`analyse-mode-${v}`} onClick={() => setMode(v)}
            className={`h-11 rounded-full border px-5 text-sm font-medium transition-colors ${mode === v ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>
      {mode === "check" && <CheckBuy initialTicker={params.get("ticker")} />}
      {mode === "history" && <HistoricalCheck />}
      {mode === "saved" && <Saved />}
    </div>
  );
}
