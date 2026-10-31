import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/Bits";
import { api, errMsg, num } from "@/lib/api";
import { useApp } from "@/context/AppContext";

const blank = { source_id: "", source_name: "", ticker: "", direction: "long", reported_text: "", entry: "", stop: "", target: "", exit: "", strategy: "", risks: "", source_url: "", published_at: "", origin: "manual" };

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const SetupDialog = ({ open, onOpenChange, prefill, sources = [], onSaved }) => {
  const { market } = useApp();
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF({ ...blank, market, ...(prefill || {}), published_at: toLocalInput(prefill?.published_at) });
  }, [open, prefill, market]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pickSource = (e) => {
    const s = sources.find((x) => x.id === e.target.value);
    setF({ ...f, source_id: s?.id || "", source_name: s?.name || "" });
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...f, source_id: f.source_id || null, entry: num(f.entry), stop: num(f.stop), target: num(f.target), exit: num(f.exit),
        published_at: f.published_at ? new Date(f.published_at).toISOString() : null, source_url: f.source_url || null,
      };
      const { data } = await api.post("/setups", body);
      toast.success(`Setup logged: ${data.status}`, data.market !== market ? { description: `Saved under ${data.market} setups. Switch to ${data.market} to see it.` } : undefined);
      onOpenChange(false);
      onSaved?.(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const cls = "h-11";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="setup-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Log a published setup</DialogTitle>
          <DialogDescription>Record only what the trader actually published. Leave anything they didn't state blank.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <select data-testid="setup-source-select" value={f.source_id} onChange={pickSource} className={`${cls} w-full rounded-md border bg-background px-3 text-sm`}>
              <option value="">Other / unlisted</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Source name"><Input data-testid="setup-source-name-input" value={f.source_name} onChange={set("source_name")} className={cls} /></Field>
          <Field label="Ticker"><Input data-testid="setup-ticker-input" value={f.ticker} onChange={set("ticker")} className={`${cls} uppercase`} /></Field>
          <Field label="Market">
            <select data-testid="setup-market-select" value={f.market} onChange={set("market")} className={`${cls} w-full rounded-md border bg-background px-3 text-sm`}>
              <option value="ASX">ASX</option><option value="US">US</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="What they reported"><Textarea data-testid="setup-reported-input" value={f.reported_text} onChange={set("reported_text")} rows={3} /></Field>
          </div>
          <Field label="Direction">
            <select data-testid="setup-direction-select" value={f.direction} onChange={set("direction")} className={`${cls} w-full rounded-md border bg-background px-3 text-sm`}>
              <option value="long">Long</option><option value="short">Short</option>
            </select>
          </Field>
          <Field label="Reported entry"><Input data-testid="setup-entry-input" type="number" step="any" value={f.entry} onChange={set("entry")} className={cls} /></Field>
          <Field label="Reported stop"><Input data-testid="setup-stop-input" type="number" step="any" value={f.stop} onChange={set("stop")} className={cls} /></Field>
          <Field label="Reported target"><Input data-testid="setup-target-input" type="number" step="any" value={f.target} onChange={set("target")} className={cls} /></Field>
          <Field label="Reported exit"><Input data-testid="setup-exit-input" type="number" step="any" value={f.exit} onChange={set("exit")} className={cls} /></Field>
          <Field label="Strategy"><Input data-testid="setup-strategy-input" value={f.strategy} onChange={set("strategy")} placeholder="e.g. opening range break" className={cls} /></Field>
          <div className="col-span-2"><Field label="Stated risks"><Input data-testid="setup-risks-input" value={f.risks} onChange={set("risks")} className={cls} /></Field></div>
          <div className="col-span-2"><Field label="Original link" hint="Needed for 'Source verified'"><Input data-testid="setup-url-input" value={f.source_url} onChange={set("source_url")} placeholder="https://" className={cls} /></Field></div>
          <div className="col-span-2"><Field label="Published at (your local time)"><Input data-testid="setup-published-input" type="datetime-local" value={f.published_at} onChange={set("published_at")} className={cls} /></Field></div>
        </div>
        <Button data-testid="setup-save-button" onClick={save} disabled={busy || !f.ticker || !f.source_name || !f.reported_text} className="h-11 w-full">
          {busy ? "Saving…" : "Log setup"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
