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
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" data-testid={testid || "kpi"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-stone-900" data-testid="kpi-value">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

/** Horizontal bar chart (no chart lib needed). */
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
    <p className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500" data-testid="empty">
      {text}
    </p>
  );
}

export function Spinner() {
  return <p className="py-8 text-center text-sm text-stone-400" data-testid="loading">Loading…</p>;
}

export const inputCls =
  "w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-gold disabled:bg-stone-50";
export const btnPrimary =
  "rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-brand-deep hover:bg-gold-dark disabled:opacity-50";
export const btnGhost =
  "rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50";
export const btnDanger =
  "rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50";
