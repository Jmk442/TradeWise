import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LineChart, Users, NotebookPen, RefreshCw, ExternalLink, AlertTriangle, Timer } from "lucide-react";
import { api, errMsg, money, pct, tone, ago, stamp, signedMoney } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { Section, Loading, ErrorNote, Empty, DelayedBadge, StatusLabel, Why } from "@/components/Bits";
import { PriceChart } from "@/components/PriceChart";
import { useNow, countdown } from "@/components/SessionStrip";

const OpenWindow = ({ session, fh, market }) => {
  const now = useNow(1000);
  const phase = session.phase;
  const title = phase === "before_open" ? "Until the open" : phase === "first_hour" ? "First hour · time left" : session.is_open ? "Past the first hour" : "Session ended";
  const target = phase === "before_open" ? session.open_at : phase === "first_hour" ? session.first_hour_end : null;
  return (
    <div className={`tw-card order-1 lg:order-2 ${phase === "first_hour" ? "border-primary/60" : ""}`} data-testid="open-window-card">
      <div className="tw-eyebrow flex items-center gap-1.5"><Timer size={12} /> {market} open window (Sydney time)</div>
      <div className="mt-2 text-sm text-muted-foreground">{title}</div>
      <div className="num mt-1 text-3xl font-semibold" data-testid="open-window-countdown">{target ? countdown(target, now) : "—"}</div>
      <div className="mt-2 text-xs text-muted-foreground num">
        Opens {session.open_sydney} · first hour ends {session.first_hour_end_sydney} · closes {session.close_sydney}
      </div>
      {fh && (
        <div className="mt-4 border-t pt-3" data-testid="first-hour-move">
          <div className="text-xs text-muted-foreground">Index first hour {fh.complete ? "" : `(${fh.minutes_covered} min so far)`} · session {fh.session_date}</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={`num text-xl font-semibold ${tone(fh.change_pct)}`}>{pct(fh.change_pct)}</span>
            <span className="num text-xs text-muted-foreground">range {fh.low.toFixed(1)}–{fh.high.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const MarketCard = ({ o }) => {
  const idx = o.index;
  const st = o.status;
  return (
    <div className="tw-card order-2 lg:order-1 lg:col-span-2" data-testid="market-status-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.state === "open" ? "bg-up/15 text-up" : "bg-secondary text-muted-foreground"}`} data-testid="market-state">
          {st.state === "open" ? "Market open" : st.state === "pre-open" ? "Pre-open" : "Market closed"}
        </span>
        <span className="text-xs text-muted-foreground">{st.reason}</span>
        <span className="ml-auto"><DelayedBadge asOf={idx?.as_of} /></span>
      </div>
      {idx ? (
        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
          <div>
            <div className="text-xs text-muted-foreground">{o.index_name}</div>
            <div className="num text-3xl font-semibold" data-testid="index-price">{idx.price.toLocaleString()}</div>
          </div>
          <div className={`num pb-1 text-lg font-medium ${tone(idx.change_pct)}`} data-testid="index-change">{pct(idx.change_pct)}</div>
        </div>
      ) : (
        <div className="mt-4"><ErrorNote text="Index price unavailable from the free data source right now." /></div>
      )}
      {idx?.spark?.length > 0 && <div className="mt-2"><PriceChart data={idx.spark} height={120} intraday testid="index-spark" /></div>}
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div>Last update {stamp(o.fetched_at)} · data as of {stamp(idx?.as_of)}</div>
        <div>{st.delay_note}</div>
        <div data-testid="scheduled-events">
          {st.upcoming.length ? `Upcoming: ${st.upcoming.map((u) => `${u.date} ${u.event}`).join(" · ")}` : "No exchange holidays in the next 3 weeks."} {o.events_note}
        </div>
      </div>
    </div>
  );
};

const QuickActions = () => (
  <div className="grid grid-cols-3 gap-3" data-testid="quick-actions">
    {[
      ["/analyse", "Analyse my buy", LineChart, "qa-analyse"],
      ["/follow", "Follow traders", Users, "qa-follow"],
      ["/trades", "Track my trades", NotebookPen, "qa-trades"],
    ].map(([to, l, Icon, id]) => (
      <Link key={to} to={to} data-testid={id}
        className="group flex min-h-[72px] flex-col justify-between rounded-xl border bg-card p-3 transition-colors hover:border-primary/60 hover:bg-secondary sm:flex-row sm:items-center">
        <Icon size={20} className="text-primary" />
        <span className="text-sm font-semibold">{l}</span>
      </Link>
    ))}
  </div>
);

const SetupMini = ({ s }) => (
  <div className="tw-card space-y-2" data-testid={`watching-setup-${s.id}`}>
    <div className="flex items-center gap-2">
      <span className="font-heading text-lg font-semibold">{s.ticker}</span>
      <span className="text-xs text-muted-foreground">{s.source_name}</span>
      <span className="ml-auto"><StatusLabel status={s.status} /></span>
    </div>
    <p className="text-sm">{s.reported_text}</p>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div><span className="text-muted-foreground">Key price </span><span className="num">{s.entry ? `entry ${s.entry}` : "not stated"}{s.stop ? ` · stop ${s.stop}` : ""}</span></div>
      <div><span className="text-muted-foreground">Now </span><span className="num">{money(s.latest_price, s.currency)}</span></div>
    </div>
    <div className="text-xs text-muted-foreground"><AlertTriangle size={12} className="mr-1 inline text-warn" />{s.risks || "Risk not stated by source. Treat as unknown."}</div>
    <a href={s.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      Original · {ago(s.published_at)} <ExternalLink size={11} />
    </a>
  </div>
);

const Reviewing = ({ items, market }) => {
  const nav = useNavigate();
  if (!items.length) return <Empty testid="reviewing-empty">Nothing worth flagging right now. TradeWise won't invent a daily opportunity.</Empty>;
  return (
    <div className="divide-y rounded-xl border bg-card">
      {items.map((r) => (
        <button key={r.ticker} onClick={() => nav(`/analyse?ticker=${r.ticker}`)} data-testid={`review-stock-${r.ticker}`}
          className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-secondary">
          <div className="w-16 shrink-0 font-heading font-semibold">{r.ticker}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm">{r.why}</div>
            <div className="text-xs text-muted-foreground">{r.uncertainty} · data {ago(r.freshness)}</div>
          </div>
          <div className="text-right">
            <div className="num text-sm">{money(r.price, market === "ASX" ? "AUD" : "USD")}</div>
            {r.change_pct !== undefined && <div className={`num text-xs ${tone(r.change_pct)}`}>{pct(r.change_pct)}</div>}
          </div>
        </button>
      ))}
    </div>
  );
};

const Positions = ({ items }) => {
  if (!items.length) return <Empty testid="positions-empty">No open actual positions recorded. <Link to="/trades" className="text-primary">Record one</Link> after you trade with your broker.</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((t) => (
        <div key={t.id} className="tw-card" data-testid={`position-${t.id}`}>
          <div className="flex items-center justify-between">
            <span className="font-heading text-lg font-semibold">{t.ticker}</span>
            <span className={`num font-semibold ${tone(t.unrealised_pnl)}`}>{signedMoney(t.unrealised_pnl, t.currency)}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground num">
            {t.quantity} @ {money(t.entry_price, t.currency)} → {money(t.latest_price, t.currency)} (est., delayed)
          </div>
          {t.assessment?.change_since_pct !== undefined && (
            <div className="mt-1 text-xs">Since assessment: <span className={`num ${tone(t.assessment.change_since_pct)}`}>{pct(t.assessment.change_since_pct)}</span></div>
          )}
        </div>
      ))}
    </div>
  );
};

export default function Today() {
  const { market } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      setD((await api.get("/today", { params: { market } })).data);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [market]);
  useEffect(() => { setD(null); load(); }, [load]);

  return (
    <div className="space-y-10" data-testid="today-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="tw-eyebrow">{market === "ASX" ? "ASX · AUD" : "US equities · USD"}</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Today</h1>
        </div>
        <button onClick={load} data-testid="today-refresh" className="flex h-11 items-center gap-2 rounded-full border px-4 text-sm text-muted-foreground hover:text-foreground">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      {err && <ErrorNote text={err} />}
      {!d && !err && <Loading text="Getting delayed market data…" testid="today-loading" />}
      {d && (
        <>
          <div className="grid gap-4 lg:grid-cols-3 rise">
            <MarketCard o={d.overview} />
            <OpenWindow session={d.overview.session} fh={d.overview.first_hour} market={market} />
          </div>
          <QuickActions />
          {d.needs_review.length > 0 && (
            <Section title="Trades needing review" eyebrow="Follow-up" testid="needs-review-section">
              <div className="space-y-2">
                {d.needs_review.map((t) => (
                  <Link to="/trades" key={t.id} className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/5 p-3" data-testid={`review-trade-${t.id}`}>
                    <AlertTriangle size={16} className="mt-0.5 text-warn" />
                    <div className="text-sm"><span className="font-semibold">{t.ticker}</span> ({t.kind}) · {t.needs_review.join(" ")}</div>
                  </Link>
                ))}
              </div>
            </Section>
          )}
          <Section title="What traders are watching" eyebrow="From sources you follow" testid="watching-section" delay={80}>
            {d.us_sources_note && <p className="mb-3 text-xs text-muted-foreground" data-testid="asx-sources-note">{d.us_sources_note}</p>}
            {d.watching.length ? (
              <div className="grid gap-3 md:grid-cols-3">{d.watching.map((s) => <SetupMini key={s.id} s={s} />)}</div>
            ) : (
              <Empty testid="watching-empty">
                No verified setups right now for {market}. A setup appears here only when it's linked to an original post, recently published and still near its reported levels.{" "}
                <Link to="/follow" className="text-primary">See latest from your sources</Link>
              </Empty>
            )}
            <Why testid="why-watching" text="TradeWise lists published ideas from candidate sources. It doesn't know if these traders are profitable, and an idea isn't a recommendation." />
          </Section>
          <Section title="Stocks worth reviewing" eyebrow="Not guaranteed opportunities" testid="reviewing-section" delay={140}>
            <Reviewing items={d.reviewing} market={market} />
          </Section>
          <Section title="My positions" eyebrow="Actual trades you recorded" testid="positions-section" delay={200}>
            <Positions items={d.positions} />
          </Section>
        </>
      )}
    </div>
  );
}
