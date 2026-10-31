import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, Copy, Trash2, BarChart3, Import } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg, money, ago, stamp } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { Section, Loading, ErrorNote, Empty, StatusLabel, Field, Why } from "@/components/Bits";
import { SetupDialog } from "@/components/SetupDialog";
import { TradeDialog } from "@/components/TradeDialog";

const Scorecard = ({ source, onClose }) => {
  const [d, setD] = useState(null);
  useEffect(() => { if (source) api.get(`/sources/${source.id}/scorecard`).then((r) => setD(r.data)).catch(() => setD(null)); }, [source]);
  const row = (l, v) => <div className="flex justify-between py-2"><span className="text-muted-foreground">{l}</span><span className="num">{v ?? "—"}</span></div>;
  return (
    <Dialog open={!!source} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="scorecard-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Evidence scorecard · {source?.name}</DialogTitle>
          <DialogDescription>{d?.note}</DialogDescription>
        </DialogHeader>
        {!d ? <Loading /> : (
          <div className="divide-y text-sm">
            {row("Setups you logged", d.logged_setups)}
            {row("With original link", d.with_link_pct != null ? `${d.with_link_pct}%` : null)}
            {row("With published timestamp", d.with_timestamp_pct != null ? `${d.with_timestamp_pct}%` : null)}
            {row("With documented entry", d.with_entry_pct != null ? `${d.with_entry_pct}%` : null)}
            {row("With documented exit/stop", d.with_exit_pct != null ? `${d.with_exit_pct}%` : null)}
            {row("Losing trades recorded", d.losing_trades_recorded)}
            {row("Median hours from post to log", d.median_hours_to_log)}
            {row("Evaluable setups", `${d.evaluable_setups} / ${d.min_for_stats} needed`)}
            <div className="pt-3" data-testid="scorecard-stats">
              {d.stats ? `Wins ${d.stats.wins} · Losses ${d.stats.losses} · Scratches ${d.stats.scratches} · Win rate ${d.stats.win_rate_pct}%`
                : "Not enough complete records for any performance stats. That's deliberate: partial records mislead."}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const AddSource = ({ open, onOpenChange, onSaved }) => {
  const [f, setF] = useState({ name: "", url: "", feed_url: "", region: "US" });
  const save = async () => {
    try { await api.post("/sources", f); toast.success("Source added"); onOpenChange(false); onSaved(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="add-source-dialog">
        <DialogHeader><DialogTitle className="font-heading">Add a candidate source</DialogTitle>
          <DialogDescription>Any public RSS or YouTube feed (youtube.com/feeds/videos.xml?channel_id=…).</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Name"><Input data-testid="source-name-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11" /></Field>
          <Field label="Website"><Input data-testid="source-url-input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className="h-11" /></Field>
          <Field label="Feed URL (optional)"><Input data-testid="source-feed-input" value={f.feed_url} onChange={(e) => setF({ ...f, feed_url: e.target.value })} className="h-11" /></Field>
          <Field label="Mainly covers">
            <select data-testid="source-region-select" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              <option value="US">US stocks</option><option value="AU">ASX stocks</option><option value="Global">Both</option>
            </select>
          </Field>
          <Button data-testid="source-save-button" disabled={!f.name || !f.url} onClick={save} className="h-11 w-full">Add source</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const SetupCard = ({ s, onCopy, onChanged }) => {
  const setOutcome = async (outcome) => { await api.patch(`/setups/${s.id}/outcome`, { outcome }); onChanged(); };
  const del = async () => { await api.delete(`/setups/${s.id}`); onChanged(); };
  return (
    <div className="tw-card space-y-3" data-testid={`setup-card-${s.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-lg font-semibold">{s.ticker}</span>
        <span className="text-xs uppercase text-muted-foreground">{s.market} · {s.direction}</span>
        <span className="ml-auto"><StatusLabel status={s.status} /></span>
      </div>
      <p className="text-sm">{s.reported_text}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {[["Entry", s.entry], ["Stop", s.stop], ["Target", s.target], ["Exit", s.exit]].map(([l, v]) => (
          <div key={l}><span className="text-muted-foreground">{l} </span><span className="num">{v ?? "not stated"}</span></div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        {s.strategy && <>Strategy: {s.strategy} · </>}Risks: {s.risks || "not stated"}
      </div>
      <div className="text-xs text-muted-foreground num">
        Latest {money(s.latest_price, s.currency)} {s.latest_price_at ? `at ${stamp(s.latest_price_at)}` : ""} · {s.status_reason}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{s.source_name} · published {s.published_at ? stamp(s.published_at) : "unknown"}</span>
        {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">Original <ExternalLink size={11} /></a>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" variant="secondary" className="h-10" data-testid={`copy-practice-${s.id}`} onClick={() => onCopy(s)}><Copy size={14} className="mr-1" /> Copy to Practice Journal</Button>
        <select aria-label="Recorded outcome" data-testid={`setup-outcome-${s.id}`} value={s.outcome} onChange={(e) => setOutcome(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-xs">
          <option value="unknown">Outcome: unknown</option><option value="win">Outcome: win</option><option value="loss">Outcome: loss</option><option value="scratch">Outcome: scratch</option>
        </select>
        <button data-testid={`delete-setup-${s.id}`} onClick={del} aria-label="Delete setup" className="ml-auto grid h-10 w-10 place-items-center rounded-md text-muted-foreground hover:text-down"><Trash2 size={16} /></button>
      </div>
    </div>
  );
};

const ImportPanel = ({ onPick }) => {
  const [platform, setPlatform] = useState("telegram");
  const [text, setText] = useState("");
  const [c, setC] = useState(null);
  const parse = async () => {
    try { setC((await api.post("/import/parse", { text, platform })).data.candidates); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="tw-card space-y-3" data-testid="import-panel">
      <p className="text-sm text-muted-foreground">Paste messages from a Telegram or Discord channel you can access. TradeWise only picks out what's explicitly written; you confirm each one.</p>
      <div className="flex gap-2">
        {["telegram", "discord"].map((p) => (
          <button key={p} data-testid={`import-platform-${p}`} onClick={() => setPlatform(p)}
            className={`h-10 rounded-full border px-4 text-sm capitalize ${platform === p ? "border-primary bg-primary/15" : "text-muted-foreground"}`}>{p}</button>
        ))}
      </div>
      <Textarea data-testid="import-text-input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"[2026-10-30 10:05] Long $TSLA entry 250 stop 245 target 262"} />
      <Button data-testid="import-parse-button" onClick={parse} disabled={text.trim().length < 3} className="h-11"><Import size={16} className="mr-1" /> Find setups</Button>
      {c && (c.length ? (
        <div className="space-y-2" data-testid="import-candidates">
          {c.map((x, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
              <span className="font-semibold">{x.ticker}</span>
              <span className="num text-xs text-muted-foreground">entry {x.entry ?? "?"} · stop {x.stop ?? "?"} · target {x.target ?? "?"}</span>
              {x.missing.length > 0 && <span className="text-xs text-warn">Missing: {x.missing.join(", ")}</span>}
              <Button size="sm" variant="outline" className="ml-auto h-10" data-testid={`import-review-${i}`} onClick={() => onPick(x)}>Review & log</Button>
            </div>
          ))}
        </div>
      ) : <Empty>No ticker with an explicit cashtag or "long/short TICKER" found.</Empty>)}
    </div>
  );
};

export default function Follow() {
  const { market } = useApp();
  const [sources, setSources] = useState([]);
  const [setups, setSetups] = useState(null);
  const [feed, setFeed] = useState(null);
  const [err, setErr] = useState(null);
  const [setupPrefill, setSetupPrefill] = useState(null);
  const [practice, setPractice] = useState(null);
  const [score, setScore] = useState(null);
  const [addSrc, setAddSrc] = useState(false);

  const loadSources = useCallback(() => api.get("/sources").then((r) => setSources(r.data)).catch((e) => setErr(errMsg(e))), []);
  const loadSetups = useCallback(() => api.get("/setups", { params: { market } }).then((r) => setSetups(r.data)).catch((e) => setErr(errMsg(e))), [market]);
  const loadFeed = useCallback(() => api.get("/feed").then((r) => setFeed(r.data)).catch((e) => setErr(errMsg(e))), []);
  useEffect(() => { loadSources(); loadFeed(); }, [loadSources, loadFeed]);
  useEffect(() => { loadSetups(); }, [loadSetups]);

  const toggle = async (s, v) => {
    await api.patch(`/sources/${s.id}`, null, { params: { followed: v } });
    await loadSources(); loadFeed();
  };
  const fromFeed = (it) => setSetupPrefill({ source_id: it.source_id, source_name: it.source_name, source_url: it.link, published_at: it.published, reported_text: it.title, ticker: it.cashtags[0] || "", origin: "feed", market: "US" });
  const fromImport = (x) => setSetupPrefill({ ticker: x.ticker, direction: x.direction, reported_text: x.reported_text, entry: x.entry ?? "", stop: x.stop ?? "", target: x.target ?? "", exit: x.exit ?? "", published_at: x.published_at, origin: x.platform, source_name: "" });
  const copy = (s) => setPractice({ kind: "simulated", ticker: s.ticker, market: s.market, direction: s.direction, entry_price: s.entry ?? s.latest_price ?? "", stop: s.stop ?? "", target: s.target ?? "", quantity: "", setup_id: s.id, notes: `Copied from ${s.source_name} setup` });

  return (
    <div className="space-y-10" data-testid="follow-page">
      <div>
        <div className="tw-eyebrow">Candidate sources, not verified profitable traders</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Follow</h1>
      </div>
      {err && <ErrorNote text={err} />}

      <Section title="Sources" testid="sources-section" action={<Button variant="outline" className="h-11" data-testid="add-source-button" onClick={() => setAddSrc(true)}><Plus size={16} className="mr-1" /> Add</Button>}>
        <div className="grid gap-3 md:grid-cols-3">
          {sources.map((s) => (
            <div key={s.id} className="tw-card flex flex-col gap-3" data-testid={`source-card-${s.slug}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-heading font-semibold">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.feed_type} feed · covers {s.region === "AU" ? "ASX" : s.region}</div>
                </div>
                <Switch data-testid={`follow-toggle-${s.slug}`} checked={s.followed} onCheckedChange={(v) => toggle(s, v)} aria-label={`Follow ${s.name}`} />
              </div>
              <div className="mt-auto flex gap-3 text-xs">
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">Website <ExternalLink size={11} /></a>
                <button data-testid={`scorecard-btn-${s.slug}`} onClick={() => setScore(s)} className="inline-flex items-center gap-1 text-primary"><BarChart3 size={12} /> Evidence scorecard</button>
              </div>
            </div>
          ))}
        </div>
        {market === "ASX" && <p className="mt-3 text-xs text-muted-foreground" data-testid="follow-asx-note">These sources mainly discuss US stocks. Their commentary isn't evidence about ASX stocks.</p>}
      </Section>

      <Section title={`Logged setups (${market})`} eyebrow="Freshness checked against latest delayed price" testid="setups-section"
        action={<Button className="h-11" data-testid="add-setup-button" onClick={() => setSetupPrefill({ origin: "manual" })}><Plus size={16} className="mr-1" /> Log setup</Button>}>
        {!setups ? <Loading /> : setups.length ? (
          <div className="grid gap-3 md:grid-cols-2">{setups.map((s) => <SetupCard key={s.id} s={s} onCopy={copy} onChanged={loadSetups} />)}</div>
        ) : <Empty testid="setups-empty">No {market} setups logged. Log one from the feed below, paste from Telegram/Discord, or enter it manually.</Empty>}
        <Why testid="why-status" text="Source verified = linked original + timestamp + price still near the reported levels, under 24h old. It is not a buy signal. Older or moved setups are relabelled automatically." />
      </Section>

      <Section title="Latest from your sources" eyebrow="Published videos and posts" testid="feed-section">
        {!feed ? <Loading text="Fetching feeds…" /> : (
          <>
            {feed.errors.map((e) => <ErrorNote key={e.source} text={`${e.source}: ${e.error}`} />)}
            {feed.items.length ? (
              <div className="divide-y rounded-xl border bg-card">
                {feed.items.slice(0, 15).map((it) => (
                  <div key={it.link} className="flex gap-3 p-3" data-testid="feed-item">
                    {it.thumbnail && <img src={it.thumbnail} alt="" className="hidden h-16 w-28 shrink-0 rounded-md object-cover sm:block" />}
                    <div className="min-w-0 flex-1">
                      <a href={it.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-medium hover:text-primary">{it.title}</a>
                      <div className="mt-1 text-xs text-muted-foreground">{it.source_name} · {ago(it.published)}{it.cashtags.length ? ` · mentions ${it.cashtags.map((c) => `$${c}`).join(" ")}` : ""}</div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-10 shrink-0" data-testid="feed-log-setup" onClick={() => fromFeed(it)}>Log setup</Button>
                  </div>
                ))}
              </div>
            ) : <Empty testid="feed-empty">No items. Follow at least one source with a feed.</Empty>}
            <p className="mt-2 text-xs text-muted-foreground">Feed items are commentary. They become setups only when you log what was explicitly stated.</p>
          </>
        )}
      </Section>

      <Section title="Import from Telegram / Discord" eyebrow="Optional" testid="import-section">
        <ImportPanel onPick={fromImport} />
      </Section>

      <SetupDialog open={!!setupPrefill} onOpenChange={(o) => !o && setSetupPrefill(null)} prefill={setupPrefill} sources={sources} onSaved={loadSetups} />
      <TradeDialog open={!!practice} onOpenChange={(o) => !o && setPractice(null)} prefill={practice} />
      <Scorecard source={score} onClose={() => setScore(null)} />
      <AddSource open={addSrc} onOpenChange={setAddSrc} onSaved={() => { loadSources(); loadFeed(); }} />
    </div>
  );
}
