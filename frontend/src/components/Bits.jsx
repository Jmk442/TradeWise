import { useState } from "react";
import { ChevronDown, Loader2, AlertTriangle } from "lucide-react";

export const Section = ({ title, eyebrow, action, children, testid, delay = 0 }) => (
  <section className="rise" style={{ animationDelay: `${delay}ms` }} data-testid={testid}>
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="tw-eyebrow">{eyebrow}</div>}
        <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const Why = ({ text, label = "Why?", testid }) => {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div>
      <button type="button" data-testid={testid} onClick={() => setOpen(!open)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        {label} <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
    </div>
  );
};

export const Loading = ({ text = "Loading…", testid }) => (
  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" data-testid={testid}>
    <Loader2 size={16} className="animate-spin text-primary" /> {text}
  </div>
);

export const ErrorNote = ({ text, testid = "error-note" }) => (
  <div className="flex items-start gap-2 rounded-lg border border-down/40 bg-down/10 p-3 text-sm" data-testid={testid}>
    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-down" /> <span>{text}</span>
  </div>
);

export const Empty = ({ children, testid }) => (
  <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground" data-testid={testid}>{children}</div>
);

export const DelayedBadge = ({ asOf }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 px-2 py-0.5 text-[11px] font-medium text-warn" data-testid="delayed-badge">
    Delayed{asOf ? ` · ${new Date(asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" })} Syd` : ""}
  </span>
);

const KIND = {
  actual: "bg-primary/15 text-primary border-primary/40",
  simulated: "bg-sky-500/10 text-sky-500 border-sky-500/40",
  hypothetical: "bg-warn/10 text-warn border-warn/40",
};

export const KindBadge = ({ kind }) => (
  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND[kind]}`} data-testid={`kind-badge-${kind}`}>
    {kind === "simulated" ? "Practice" : kind}
  </span>
);

const STATUS = {
  "Source verified": "text-up border-up/40 bg-up/10",
  "Awaiting current market data": "text-sky-500 border-sky-500/40 bg-sky-500/10",
  "Original conditions no longer observed": "text-down border-down/40 bg-down/10",
  "Setup requires review": "text-warn border-warn/40 bg-warn/10",
  "Historical example only": "text-muted-foreground border-border bg-secondary",
};

export const StatusLabel = ({ status }) => (
  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS[status] || STATUS["Historical example only"]}`} data-testid="setup-status-label">
    {status}
  </span>
);

export const Field = ({ label, children, hint }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
  </label>
);
