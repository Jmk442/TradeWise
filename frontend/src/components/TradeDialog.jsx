import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/Bits";
import { api, errMsg, num } from "@/lib/api";
import { useApp } from "@/context/AppContext";

const blank = { kind: "actual", ticker: "", direction: "long", entry_price: "", entry_time: "", quantity: "", stop: "", target: "", status: "open", exit_price: "", exit_time: "", notes: "" };

const Seg = ({ value, options, onChange, testid }) => (
  <div className="flex flex-wrap gap-1 rounded-lg border bg-secondary p-1">
    {options.map(([v, l]) => (
      <button type="button" key={v} data-testid={`${testid}-${v}`} onClick={() => onChange(v)}
        className={`h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>{l}</button>
    ))}
  </div>
);

export const TradeDialog = ({ open, onOpenChange, prefill, onSaved }) => {
  const { market } = useApp();
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ ...blank, ...(prefill || {}) }); }, [open, prefill]);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...f, market: f.market || market, entry_price: num(f.entry_price), quantity: num(f.quantity), stop: num(f.stop), target: num(f.target),
        exit_price: num(f.exit_price), entry_time: f.entry_time || null, exit_time: f.exit_time || null,
      };
      const { data } = await api.post("/trades", body);
      toast.success(`${data.ticker} recorded as ${data.kind === "simulated" ? "practice" : data.kind} trade`);
      onOpenChange(false);
      onSaved?.(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="trade-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Record a trade</DialogTitle>
          <DialogDescription>Only record "Actual" if you really placed it with your broker. TradeWise never places orders.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Seg value={f.kind} onChange={set("kind")} testid="trade-kind" options={[["actual", "Actual"], ["simulated", "Practice"], ["hypothetical", "Hypothetical"]]} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Ticker (${f.market || market})`}><Input data-testid="trade-ticker-input" value={f.ticker} onChange={set("ticker")} placeholder={market === "ASX" ? "BHP" : "AAPL"} className="h-11 uppercase" /></Field>
            <Field label="Direction"><Seg value={f.direction} onChange={set("direction")} testid="trade-direction" options={[["long", "Long"], ["short", "Short"]]} /></Field>
            <Field label="Entry price"><Input data-testid="trade-entry-input" type="number" step="any" value={f.entry_price} onChange={set("entry_price")} className="h-11" /></Field>
            <Field label="Quantity (required)"><Input data-testid="trade-qty-input" type="number" step="any" value={f.quantity} onChange={set("quantity")} className="h-11" /></Field>
            <Field label="Entry time" hint="Market local time"><Input data-testid="trade-entry-time-input" type="datetime-local" value={f.entry_time} onChange={set("entry_time")} className="h-11" /></Field>
            <Field label="Status"><Seg value={f.status} onChange={set("status")} testid="trade-status" options={[["open", "Open"], ["closed", "Closed"]]} /></Field>
            <Field label="Stop-loss"><Input data-testid="trade-stop-input" type="number" step="any" value={f.stop} onChange={set("stop")} className="h-11" /></Field>
            <Field label="Target"><Input data-testid="trade-target-input" type="number" step="any" value={f.target} onChange={set("target")} className="h-11" /></Field>
            {f.status === "closed" && (
              <>
                <Field label="Actual exit price"><Input data-testid="trade-exit-price-input" type="number" step="any" value={f.exit_price} onChange={set("exit_price")} className="h-11" /></Field>
                <Field label="Exit time"><Input data-testid="trade-exit-time-input" type="datetime-local" value={f.exit_time} onChange={set("exit_time")} className="h-11" /></Field>
              </>
            )}
          </div>
          <Field label="Notes"><Textarea data-testid="trade-notes-input" value={f.notes} onChange={set("notes")} rows={2} /></Field>
          <Button data-testid="trade-save-button" onClick={save} disabled={busy || !f.ticker || !f.entry_price || !f.quantity} className="h-11 w-full">
            {busy ? "Saving…" : "Save trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
