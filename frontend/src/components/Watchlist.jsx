import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, BellRing, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, errMsg, money, pct, tone, stamp, num } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { Empty, Loading } from "@/components/Bits";

const LevelInput = ({ value, onSave, label, testid }) => {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  return (
    <Input aria-label={label} placeholder={label} data-testid={testid} type="number" step="any" value={v} onChange={(e) => setV(e.target.value)}
      onBlur={async () => { if (String(v) !== String(value ?? "") && !(await onSave(v))) setV(value ?? ""); }} className="h-10 w-28 text-xs" />
  );
};

const WatchRow = ({ w, onChanged }) => {
  const nav = useNavigate();
  const save = (field) => async (v) => {
    try {
      const body = v === "" ? { [`clear_${field}`]: true } : { [`alert_${field}`]: num(v) };
      await api.patch(`/watchlist/${w.id}`, body);
      toast.success(v === "" ? "Alert cleared" : `Alert set for ${w.ticker}`);
      onChanged();
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  };
  const del = async () => {
    try { await api.delete(`/watchlist/${w.id}`); } catch (e) { toast.error(errMsg(e)); }
    onChanged();
  };
  return (
    <div className="flex flex-wrap items-center gap-3 p-3" data-testid={`watch-row-${w.ticker}`}>
      <button onClick={() => nav(`/analyse?ticker=${w.ticker}`)} className="w-20 text-left font-heading font-semibold hover:text-primary" data-testid={`watch-analyse-${w.ticker}`}>{w.ticker}</button>
      <div className="min-w-[120px] flex-1">
        <div className="num text-sm">{money(w.price, w.currency)} <span className={tone(w.change_pct)}>{pct(w.change_pct)}</span></div>
        <div className="text-xs text-muted-foreground">{w.next_event ? `${w.next_event.title} · ${w.next_event.date.slice(0, 10)}` : "No upcoming company event found"}</div>
      </div>
      <BellRing size={14} className={w.alert_above || w.alert_below ? "text-warn" : "text-muted-foreground"} />
      <LevelInput label="Rises to" value={w.alert_above} onSave={save("above")} testid={`watch-above-${w.ticker}`} />
      <LevelInput label="Falls to" value={w.alert_below} onSave={save("below")} testid={`watch-below-${w.ticker}`} />
      <button aria-label="Remove" data-testid={`watch-remove-${w.ticker}`} onClick={del} className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:text-down"><Trash2 size={16} /></button>
    </div>
  );
};

export const Watchlist = ({ onChanged }) => {
  const { market } = useApp();
  const [items, setItems] = useState(null);
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/watchlist", { params: { market } }).then((r) => setItems(r.data)).catch(() => setItems([])), [market]);
  useEffect(() => { setItems(null); load(); }, [load]);
  const changed = () => { load(); onChanged?.(); };
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.post("/watchlist", { ticker: t, market }); setT(""); toast.success("Added to watchlist"); changed(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border bg-card" data-testid="watchlist">
      <form onSubmit={add} className="flex gap-2 border-b p-3">
        <Input data-testid="watch-add-input" value={t} onChange={(e) => setT(e.target.value)} placeholder={`Add ${market === "ASX" ? "an ASX" : "a US"} stock, e.g. ${market === "ASX" ? "WES" : "MSFT"}`} className="h-11 uppercase placeholder:normal-case" />
        <Button data-testid="watch-add-button" type="submit" disabled={busy || !t.trim()} className="h-11"><Plus size={16} className="mr-1" />Add</Button>
      </form>
      {!items ? <Loading /> : items.length ? <div className="divide-y">{items.map((w) => <WatchRow key={w.id} w={w} onChanged={changed} />)}</div>
        : <div className="p-4 text-sm text-muted-foreground" data-testid="watch-empty">Your watchlist is empty. Add the stocks you want to keep an eye on.</div>}
      <p className="border-t p-3 text-[11px] text-muted-foreground">Alerts are checked every 2 minutes on delayed prices and show in the bell at the top.</p>
    </div>
  );
};

const IMPACT = { High: "text-down border-down/40", Medium: "text-warn border-warn/40", Holiday: "text-muted-foreground border-border" };
const sydDay = (iso) => new Date(iso).toLocaleString([], { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const CalendarPanel = ({ refresh }) => {
  const { market } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api.get("/calendar", { params: { market } }).then((r) => setD(r.data)).catch(() => setD({ error: true })); }, [market, refresh]);
  if (!d) return <Loading text="Loading calendar…" />;
  if (d.error) return <Empty>Calendar unavailable right now.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="calendar-panel">
      <div className="tw-card">
        <div className="mb-2 flex items-center gap-2 font-heading font-semibold"><CalendarDays size={16} className="text-primary" /> Your stocks</div>
        {d.company.length ? d.company.map((e, i) => (
          <div key={i} className="flex justify-between gap-2 border-b py-2 text-sm last:border-0" data-testid="calendar-company-event">
            <span><span className="font-semibold">{e.ticker}</span> · {e.title}{e.estimate ? ` (EPS est. ${e.estimate})` : ""}</span>
            <span className="num shrink-0 text-xs text-muted-foreground">{e.date.slice(0, 10)}</span>
          </div>
        )) : <p className="text-sm text-muted-foreground">{d.company_coverage ? "No earnings or dividend dates in the next 45 days for your watchlist and open trades." : "Add stocks to your watchlist to see their earnings and dividend dates."}</p>}
        {d.holidays.map((h) => <div key={h.date} className="mt-2 text-xs text-muted-foreground">Exchange: {h.date} {h.event}</div>)}
        {market === "ASX" && <p className="mt-2 text-[11px] text-muted-foreground" data-testid="asx-calendar-note">ASX company dates from the free source usually appear only close to reporting season (Feb and Aug). Check the company's ASX announcements for confirmed dates.</p>}
      </div>
      <div className="tw-card">
        <div className="mb-2 font-heading font-semibold">Economic events (Sydney time)</div>
        {!d.economic_available && <p className="text-sm text-down">Economic calendar unavailable right now.</p>}
        {d.economic_available && !d.economic.length && <p className="text-sm text-muted-foreground">No remaining medium/high-impact {market === "ASX" ? "AUD (or major US/China)" : "USD"} events this week. The free feed covers the current week only.</p>}
        {d.economic.slice(0, 10).map((e, i) => (
          <div key={i} className="border-b py-2 text-sm last:border-0" data-testid="calendar-economic-event">
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-1.5 text-[10px] font-semibold ${IMPACT[e.impact]}`}>{e.impact}</span>
              <span className="text-xs font-semibold">{e.country}</span>
              <span className="flex-1">{e.title}</span>
              <span className="num shrink-0 text-xs text-muted-foreground">{sydDay(e.date)}</span>
            </div>
            {(e.forecast || e.previous) && <div className="num text-xs text-muted-foreground">Forecast {e.forecast ?? "—"} · Previous {e.previous ?? "—"}</div>}
            {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
          </div>
        ))}
        <p className="mt-2 text-[11px] text-muted-foreground">{d.sources} Updated {stamp(d.fetched_at)}.</p>
      </div>
    </div>
  );
};
