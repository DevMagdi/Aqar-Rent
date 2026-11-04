// Shared admin UI primitives: token surfaces, calm entrance, and accessible micro-interactions.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatedPresence, CountUp, Reveal } from "@/components/motion";
import { Icon } from "./Icon";

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  const value = status || "";
  const cls = /paid|approved|active|resolved|ok/.test(value)
    ? "bg-success-bg text-success"
    : /pending|submitted|open|reviewing/.test(value)
      ? "bg-warn-bg text-warn"
      : /rejected|failed|banned|removed/.test(value)
        ? "bg-danger-bg text-danger"
        : "bg-surface-2 text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors duration-150 ${cls}`}>{children ?? status}</span>;
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Reveal as="section" className="surface-card card-lift p-5">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </Reveal>
  );
}

export function Stat({ label, value, hint, testid }: { label: string; value: number; hint?: string; testid?: string }) {
  return (
    <Reveal className="kpi-stat rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card" data-testid={testid || "kpi"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink-strong" data-testid="kpi-value" data-kpi-value>
        <CountUp value={value} locale="en" />
      </p>
      {hint && <p className="kpi-hint mt-0.5 text-xs text-muted">{hint}</p>}
    </Reveal>
  );
}

/** Lightweight SVG chart; no charting runtime dependency. */
export function AreaChart({ data, testId }: { data: [string, number][]; testId?: string }) {
  const lineRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(600);
  useEffect(() => {
    const path = lineRef.current;
    if (path) setLength(path.getTotalLength());
  }, [data]);
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
        <path className="chart-area" d={area} fill="url(#listing-area-fill)" />
        <path ref={lineRef} className="chart-line" d={line} fill="none" stroke="var(--color-gold-dark)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ "--chart-length": length } as React.CSSProperties} />
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
  const max = Math.max(1, ...data.map(([, value]) => value));
  return (
    <div className="space-y-2" data-testid={testId}>
      {data.length === 0 && <p className="text-sm text-muted">—</p>}
      {data.map(([key, value], index) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs font-semibold text-muted">{key.replace(/_/g, " ")}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-track">
            <div className="chart-bar h-full rounded bg-gold" style={{ width: `${(value / max) * 100}%`, "--i": Math.min(index, 7) } as React.CSSProperties} />
          </div>
          <span className="w-10 text-end text-xs font-bold tabular-nums text-ink">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), reduced ? 0 : 150);
  }, []);
  useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
      if (event.key !== "Tab") return;
      const nodes = focusable();
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [requestClose]);
  return (
    <AnimatedPresence present={!closing}>
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-brand-deep/45 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={requestClose}
        onClickCapture={(event) => {
          const target = event.target instanceof Element ? event.target.closest("[data-modal-dismiss='true']") : null;
          if (target) { event.preventDefault(); event.stopPropagation(); requestClose(); }
        }}
      >
        <div ref={dialogRef} tabIndex={-1} className="surface-card w-full max-w-lg p-5 shadow-pop" onClick={(event) => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink-strong">{title}</h3>
            <button type="button" aria-label="close" onClick={requestClose} className="press grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-track">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">{children}</div>
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </div>
      </div>
    </AnimatedPresence>
  );
}

export function Empty({ text = "Nothing here" }: { text?: string }) {
  return (
    <Reveal className="empty-state mx-auto max-w-sm rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-10 text-center shadow-card" data-testid="empty">
      <svg width="88" height="64" viewBox="0 0 88 64" fill="none" aria-hidden className="empty-illustration mx-auto mb-4">
        <rect x="6" y="12" width="58" height="40" rx="11" stroke="var(--color-brand)" strokeOpacity="0.5" strokeWidth="2" />
        <rect x="18" y="20" width="58" height="40" rx="11" fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth="2" />
        <circle cx="66" cy="15" r="6.5" fill="var(--color-gold)" />
        <path d="M30 41h32" stroke="var(--color-gold-dark)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      </svg>
      <p className="text-sm font-semibold text-ink">{text}</p>
    </Reveal>
  );
}

export function Spinner() {
  return <div className="skeleton mx-auto h-8 w-28" role="status" aria-label="Loading" data-testid="loading" />;
}

export const inputCls = "focus-ring w-full rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors duration-150 focus:border-gold-dark disabled:bg-surface-2";
export const btnPrimary = "press rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-gold-text transition-colors duration-150 hover:bg-gold-light disabled:opacity-50";
export const btnGhost = "press rounded-xl border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-2 disabled:opacity-50";
export const btnDanger = "press rounded-xl border border-danger/30 bg-surface px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-bg disabled:opacity-50";
