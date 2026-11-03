// Shared admin UI primitives (no component library — plain Tailwind).
import type { ReactNode } from "react";

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  const s = status || "";
  const cls =
    /paid|approved|active|resolved|ok/.test(s)
      ? "bg-emerald-100 text-emerald-800"
      : /pending|submitted|open|reviewing/.test(s)
        ? "bg-amber-100 text-amber-800"
        : /rejected|failed|banned|removed/.test(s)
          ? "bg-red-100 text-red-800"
          : "bg-stone-100 text-stone-700";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children ?? status}</span>;
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, testid }: { label: string; value: ReactNode; hint?: string; testid?: string }) {
  return (
    <div className="kpi-stat rounded-2xl border border-border bg-surface p-4 shadow-card" data-testid={testid || "kpi"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink-strong" data-testid="kpi-value">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

/** Horizontal bar chart (no chart lib needed). */
export function AreaChart({ data, testId }: { data: [string, number][]; testId?: string }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted" data-testid={testId}>—</p>;
  const max = Math.max(1, ...data.map(([, value]) => value));
  const points = data.map(([label, value], index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 82 - (value / max) * 62;
    return { x, y, label, value };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const area = `${line} L100,90 L0,90 Z`;
  return (
    <div data-testid={testId}>
      <svg viewBox="0 0 100 94" role="img" aria-label="Listing volume by status" className="h-48 w-full overflow-visible">
        <defs>
          <linearGradient id="listing-area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[25, 45, 65, 85].map((y) => <path key={y} d={`M0 ${y}H100`} stroke="var(--color-border)" strokeWidth="0.6" />)}
        <path d={area} fill="url(#listing-area-fill)" />
        <path d={line} fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="2.5" fill="var(--color-gold-dark)" stroke="var(--color-surface)" strokeWidth="1.2">
              <title>{point.label.replace(/_/g, " ")}: {point.value}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
        {points.map((point) => <span key={point.label}>{point.label.replace(/_/g, " ")}</span>)}
      </div>
    </div>
  );
}

export function BarChart({ data, testId }: { data: [string, number][]; testId?: string }) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  return (
    <div className="space-y-2" data-testid={testId}>
      {data.length === 0 && <p className="text-sm text-stone-400">—</p>}
      {data.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs font-semibold text-stone-600">{k.replace(/_/g, " ")}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-stone-100">
            <div className="h-full rounded bg-gold" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="w-10 text-end text-xs font-bold text-stone-800">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-stone-900">{title}</h3>
          <button type="button" aria-label="close" onClick={onClose} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ text = "Nothing here" }: { text?: string }) {
  return (
    <div
      className="mx-auto max-w-sm rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-10 text-center shadow-card"
      data-testid="empty"
    >
      <svg width="88" height="64" viewBox="0 0 88 64" fill="none" aria-hidden className="mx-auto mb-4">
        <rect x="6" y="12" width="58" height="40" rx="11" stroke="var(--color-brand)" strokeOpacity="0.5" strokeWidth="2" />
        <rect x="18" y="20" width="58" height="40" rx="11" fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth="2" />
        <circle cx="66" cy="15" r="6.5" fill="var(--color-gold)" />
        <path d="M30 41h32" stroke="var(--color-gold-dark)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      </svg>
      <p className="text-sm font-semibold text-ink">{text}</p>
    </div>
  );
}

export function Spinner() {
  return <p className="py-8 text-center text-sm text-stone-400" data-testid="loading">Loading…</p>;
}

export const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-gold disabled:bg-stone-50";
export const btnPrimary =
  "rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-gold-text hover:bg-gold-dark disabled:opacity-50";
export const btnGhost =
  "rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50";
export const btnDanger =
  "rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50";
