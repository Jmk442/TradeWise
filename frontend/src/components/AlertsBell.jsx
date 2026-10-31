import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { api, money, stamp } from "@/lib/api";

const notify = (a) => {
  if (localStorage.getItem("tw-browser-notify") === "1" && "Notification" in window && Notification.permission === "granted") {
    new Notification(`${a.ticker}: ${a.label}`, { body: `Price ${a.price} vs your level ${a.level} (delayed data)` });
  }
};

export const AlertsBell = () => {
  const [d, setD] = useState({ alerts: [], unseen: 0 });
  const [browser, setBrowser] = useState(localStorage.getItem("tw-browser-notify") === "1");
  const known = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/alerts");
      if (known.current) {
        data.alerts.filter((a) => !a.seen && !known.current.has(a.id)).forEach((a) => {
          toast.warning(`${a.ticker}: ${a.label}`, { description: `${money(a.price, a.currency)} vs level ${money(a.level, a.currency)} · delayed` });
          notify(a);
        });
      }
      known.current = new Set(data.alerts.map((a) => a.id));
      setD(data);
    } catch {
      /* keep last state */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const toggleBrowser = async (v) => {
    if (v && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return toast.error("Browser notifications were blocked.");
    }
    localStorage.setItem("tw-browser-notify", v ? "1" : "0");
    setBrowser(v);
  };

  const onOpen = async (open) => {
    if (!open && d.unseen) {
      await api.post("/alerts/seen");
      load();
    }
  };

  return (
    <Popover onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <button data-testid="alerts-bell" aria-label="Price alerts" className="relative grid h-11 w-11 place-items-center rounded-full border text-muted-foreground hover:text-foreground">
          <Bell size={18} />
          {d.unseen > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-warn px-1 text-[10px] font-bold text-black" data-testid="alerts-unseen-count">{d.unseen}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="alerts-panel">
        <div className="border-b p-3">
          <div className="font-heading font-semibold">Price alerts</div>
          <div className="text-xs text-muted-foreground">{d.note}</div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {d.alerts.length ? d.alerts.map((a) => (
            <div key={a.id} className={`border-b p-3 text-sm last:border-0 ${a.seen ? "" : "bg-warn/5"}`} data-testid={`alert-item-${a.id}`}>
              <div className="font-medium">{a.ticker} · {a.label}</div>
              <div className="num text-xs text-muted-foreground">{money(a.price, a.currency)} vs {money(a.level, a.currency)} · {stamp(a.triggered_at)}</div>
            </div>
          )) : <div className="p-4 text-sm text-muted-foreground">No alerts yet. Set stop/target on trades or alert levels on watchlist stocks.</div>}
        </div>
        <label className="flex items-center justify-between border-t p-3 text-xs">
          Browser notifications <Switch data-testid="browser-notify-toggle" checked={browser} onCheckedChange={toggleBrowser} />
        </label>
      </PopoverContent>
    </Popover>
  );
};
