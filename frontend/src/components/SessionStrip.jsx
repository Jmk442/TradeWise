import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";

export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

export const countdown = (iso, now) => {
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
};

const label = (s, now) => {
  if (s.phase === "first_hour") return `1st hr · ${countdown(s.first_hour_end, now)} left`;
  if (s.is_open) return `Open · to ${s.close_sydney}`;
  return `Closed · ${s.open_sydney}`;
};

export const SessionStrip = () => {
  const { market, setMarket } = useApp();
  const [sessions, setSessions] = useState([]);
  const now = useNow(1000);
  useEffect(() => {
    const load = () => api.get("/sessions").then((r) => setSessions(r.data)).catch(() => setSessions([]));
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);
  if (!sessions.length) return null;
  return (
    <div className="border-b bg-card/60" data-testid="session-strip">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <span className="tw-eyebrow hidden shrink-0 sm:inline">Sydney time</span>
        {sessions.map((s) => (
          <button key={s.market} onClick={() => setMarket(s.market)} data-testid={`session-pill-${s.market.toLowerCase()}`}
            className={`flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${market === s.market ? "border-primary/60 bg-primary/10" : "hover:bg-secondary"}`}>
            <span className={`h-2 w-2 rounded-full ${s.is_open ? "bg-up" : "bg-muted-foreground/50"} ${s.phase === "first_hour" ? "animate-pulse" : ""}`} />
            <span className="font-semibold">{s.market}</span>
            <span className="num text-muted-foreground">{label(s, now)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
