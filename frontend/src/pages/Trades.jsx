import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg, money, pct, tone, stamp, signedMoney, num } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { Section, Loading, ErrorNote, Empty, KindBadge, Field } from "@/components/Bits";
import { TradeDialog } from "@/components/TradeDialog";

const GROUPS = [
  ["actual", "Actual trades", "Placed with your broker"],
  ["simulated", "Practice journal", "Simulated, no real money"],
  ["hypothetical", "Hypothetical", "Ideas and 'what if' checks you're tracking"],
];

const CloseDialog = ({ trade, onClose, onDone }) => {
  const [p, setP] = useState("");
  const [t, setT] = useState("");
  const save = async () => {
    try { await api.patch(`/trades/${trade.id}`, { status: "closed", exit_price: num(p), exit_time: t }); toast.success("Trade closed"); onClose(); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={!!trade} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="close-trade-dialog">
        <DialogHeader><DialogTitle className="font-heading">Close {trade?.ticker}</DialogTitle>
          <DialogDescription>Enter the actual exit from your broker. Realised P&L is only calculated from a recorded exit.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Exit price"><Input data-testid="close-exit-price-input" type="number" step="any" value={p} onChange={(e) => setP(e.target.value)} className="h-11" /></Field>
          <Field label="Exit time"><Input data-testid="close-exit-time-input" type="datetime-local" value={t} onChange={(e) => setT(e.target.value)} className="h-11" /></Field>
        </div>
        <Button data-testid="close-trade-save" disabled={!p || !t} onClick={save} className="h-11">Save exit</Button>
      </DialogContent>
    </Dialog>
  );
};

const TradeRow = ({ t, onCloseTrade, onChanged }) => {
  const del = async () => { await api.delete(`/trades/${t.id}`); onChanged(); };
  const pl = t.status === "open" ? t.unrealised_pnl : t.realised_pnl;
  return (
    <div className="tw-card space-y-2" data-testid={`trade-row-${t.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-lg font-semibold">{t.ticker}</span>
        <span className="text-xs text-muted-foreground">{t.exchange || t.market} · {t.direction}</span>
        <KindBadge kind={t.kind} />
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.status === "open" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>{t.status}</span>
        <span className="ml-auto text-right">
          <span className={`num block text-lg font-semibold ${tone(pl)}`} data-testid={`trade-pnl-${t.id}`}>{signedMoney(pl, t.currency)}</span>
          <span className="block text-[11px] text-muted-foreground">{t.status === "open" ? "unrealised (est.)" : t.realised_pnl != null ? "realised" : "no exit recorded"}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4 num">
        <div><span className="text-muted-foreground">Entry </span>{money(t.entry_price, t.currency)} × {t.quantity}</div>
        <div><span className="text-muted-foreground">At </span>{t.entry_time ? stamp(t.entry_time) : "not recorded"}</div>
        {t.status === "open"
          ? <div><span className="text-muted-foreground">Latest </span>{money(t.latest_price, t.currency)} {t.latest_price_at ? `(${stamp(t.latest_price_at)})` : ""}</div>
          : <div><span className="text-muted-foreground">Exit </span>{money(t.exit_price, t.currency)} at {stamp(t.exit_time)}</div>}
        <div><span className="text-muted-foreground">Stop/target </span>{t.stop ?? "—"} / {t.target ?? "—"}</div>
      </div>
      {t.assessment && (
        <div className="rounded-lg bg-secondary p-3 text-xs" data-testid={`trade-assessment-${t.id}`}>
          <span className="font-medium">Original assessment</span> ({stamp(t.assessment.created_at)}, {money(t.assessment.price, t.currency)}):{" "}
          {t.assessment.bottom_line}{" "}
          {t.assessment.change_since_pct !== undefined && <span className={`num font-medium ${tone(t.assessment.change_since_pct)}`}>Change since: {pct(t.assessment.change_since_pct)}</span>}
        </div>
      )}
      {t.needs_review.map((f) => <div key={f} className="flex items-center gap-1 text-xs text-warn"><AlertTriangle size={12} /> {f}</div>)}
      {t.notes && <div className="text-xs text-muted-foreground">{t.notes}</div>}
      <div className="flex gap-2 border-t pt-2">
        {t.status === "open" && <Button size="sm" variant="secondary" className="h-10" data-testid={`close-trade-${t.id}`} onClick={() => onCloseTrade(t)}>Record exit</Button>}
        <button data-testid={`delete-trade-${t.id}`} aria-label="Delete trade" onClick={del} className="ml-auto grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:text-down"><Trash2 size={16} /></button>
      </div>
    </div>
  );
};

const Summary = ({ list, cur }) => {
  const un = list.reduce((a, t) => a + (t.unrealised_pnl || 0), 0);
  const re = list.reduce((a, t) => a + (t.realised_pnl || 0), 0);
  return (
    <span className="num text-xs text-muted-foreground">
      Open est. <span className={tone(un)}>{signedMoney(Math.round(un * 100) / 100, cur)}</span> · Realised <span className={tone(re)}>{signedMoney(Math.round(re * 100) / 100, cur)}</span>
    </span>
  );
};

export default function Trades() {
  const { market } = useApp();
  const [trades, setTrades] = useState(null);
  const [err, setErr] = useState(null);
  const [add, setAdd] = useState(null);
  const [closing, setClosing] = useState(null);
  const load = useCallback(() => api.get("/trades", { params: { market } }).then((r) => setTrades(r.data)).catch((e) => setErr(errMsg(e))), [market]);
  useEffect(() => {
    setTrades(null); load();
    const id = setInterval(load, 120000);
    return () => clearInterval(id);
  }, [load]);
  const cur = market === "ASX" ? "AUD" : "USD";

  return (
    <div className="space-y-10" data-testid="trades-page">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="tw-eyebrow">{market} · prices refresh every 2 minutes (delayed)</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">My Trades</h1>
        </div>
        <Button data-testid="add-trade-button" className="h-11" onClick={() => setAdd({ kind: "actual" })}><Plus size={16} className="mr-1" /> Record trade</Button>
      </div>
      {err && <ErrorNote text={err} />}
      {!trades && !err && <Loading />}
      {trades && GROUPS.map(([kind, title, sub]) => {
        const list = trades.filter((t) => t.kind === kind);
        return (
          <Section key={kind} title={title} eyebrow={sub} testid={`trades-group-${kind}`} action={list.length ? <Summary list={list} cur={cur} /> : null}>
            {list.length ? <div className="space-y-3">{list.map((t) => <TradeRow key={t.id} t={t} onCloseTrade={setClosing} onChanged={load} />)}</div>
              : <Empty testid={`trades-empty-${kind}`}>None recorded. <button className="text-primary" onClick={() => setAdd({ kind })}>Add one</button></Empty>}
          </Section>
        );
      })}
      <TradeDialog open={!!add} onOpenChange={(o) => !o && setAdd(null)} prefill={add} onSaved={load} />
      <CloseDialog trade={closing} onClose={() => setClosing(null)} onDone={load} />
    </div>
  );
}
