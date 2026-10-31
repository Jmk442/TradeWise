import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, errMsg, stamp } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { Field } from "@/components/Bits";

const Pill = ({ on, children, onClick, testid }) => (
  <button type="button" data-testid={testid} onClick={onClick}
    className={`h-10 rounded-full border px-4 text-sm ${on ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>{children}</button>
);

const ChannelRow = ({ c, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/channels/${c.id}/sync`);
      data.error ? toast.error(data.error) : toast.success(`Checked ${data.messages_checked} new messages · ${data.imported} setups imported`);
      onChanged(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const act = (fn) => async (...args) => {
    try { await fn(...args); } catch (e) { toast.error(errMsg(e)); }
    onChanged();
  };
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 text-sm" data-testid={`channel-row-${c.id}`}>
      <Radio size={16} className={c.active && !c.last_error ? "text-up" : "text-muted-foreground"} />
      <div className="min-w-[160px] flex-1">
        <div className="font-medium">{c.name} <span className="text-xs text-muted-foreground">· {c.platform} {c.mode === "bot" ? "(bot)" : "(public)"} · {c.market}</span></div>
        <div className="text-xs text-muted-foreground">
          {c.imported_count} setups imported · last checked {c.last_checked ? stamp(c.last_checked) : "never"}
        </div>
        {c.last_error && <div className="text-xs text-down" data-testid="channel-error">{c.last_error}</div>}
      </div>
      <Switch aria-label="Active" data-testid={`channel-active-${c.id}`} checked={c.active}
        onCheckedChange={act((v) => api.patch(`/channels/${c.id}`, null, { params: { active: v } }))} />
      <Button size="sm" variant="outline" className="h-10" disabled={busy} onClick={sync} data-testid={`channel-sync-${c.id}`}>
        <RefreshCw size={14} className={`mr-1 ${busy ? "animate-spin" : ""}`} /> Check now
      </Button>
      <button aria-label="Remove channel" data-testid={`channel-delete-${c.id}`} onClick={act(() => api.delete(`/channels/${c.id}`))}
        className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:text-down"><Trash2 size={16} /></button>
    </div>
  );
};

export const ChannelsPanel = ({ onImported }) => {
  const { market } = useApp();
  const [d, setD] = useState({ channels: [], tokens: {} });
  const [f, setF] = useState({ platform: "telegram", mode: "public", handle: "", name: "", market });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/channels").then((r) => setD(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => setF((x) => ({ ...x, market })), [market]);
  const changed = (imported) => { load(); if (imported) onImported?.(); };

  const add = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/channels", f);
      toast.success(`Connected ${data.name}: ${data.sync.imported} setups imported`);
      setF({ ...f, handle: "", name: "" });
      changed(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const needsToken = (f.platform === "discord" && !d.tokens.discord_bot) || (f.platform === "telegram" && f.mode === "bot" && !d.tokens.telegram_bot);
  const handleLabel = f.platform === "discord" ? "Discord channel ID" : f.mode === "public" ? "Public channel name (t.me/…)" : "Chat ID or @username";

  return (
    <div className="tw-card space-y-4" data-testid="channels-panel">
      <p className="text-sm text-muted-foreground">
        Connected channels are checked every 2 minutes. Messages with an explicit ticker ($TICKER or "long TICKER") become setups automatically, with a link back to the original message. Nothing is guessed.
      </p>
      <div className="flex flex-wrap gap-2">
        <Pill testid="channel-platform-telegram" on={f.platform === "telegram"} onClick={() => setF({ ...f, platform: "telegram" })}>Telegram</Pill>
        <Pill testid="channel-platform-discord" on={f.platform === "discord"} onClick={() => setF({ ...f, platform: "discord", mode: "bot" })}>Discord</Pill>
        {f.platform === "telegram" && (
          <>
            <span className="mx-1 self-center text-xs text-muted-foreground">·</span>
            <Pill testid="channel-mode-public" on={f.mode === "public"} onClick={() => setF({ ...f, mode: "public" })}>Public channel</Pill>
            <Pill testid="channel-mode-bot" on={f.mode === "bot"} onClick={() => setF({ ...f, mode: "bot" })}>Private (bot)</Pill>
          </>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={handleLabel}><Input data-testid="channel-handle-input" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} className="h-11" /></Field>
        <Field label="Display name"><Input data-testid="channel-name-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11" /></Field>
        <Field label="Setups apply to">
          <div className="flex gap-2">
            {["ASX", "US"].map((m) => <Pill key={m} testid={`channel-market-${m.toLowerCase()}`} on={f.market === m} onClick={() => setF({ ...f, market: m })}>{m}</Pill>)}
          </div>
        </Field>
        <div className="flex items-end">
          <Button data-testid="channel-connect-button" onClick={add} disabled={busy || needsToken || !f.handle || !f.name} className="h-11 w-full">{busy ? "Connecting…" : "Connect"}</Button>
        </div>
      </div>
      {needsToken && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs" data-testid="channel-token-needed">
          {f.platform === "discord"
            ? "Discord needs a bot token, and a server admin has to invite the bot to the server. Ask for it to be set up in TradeWise settings."
            : "Private Telegram channels need a bot token, and the bot must be added to the channel. Public channels work without one."}
        </p>
      )}
      {d.channels.length > 0 && <div className="divide-y rounded-lg border">{d.channels.map((c) => <ChannelRow key={c.id} c={c} onChanged={changed} />)}</div>}
    </div>
  );
};
