// Small shared UI pieces: loading skeletons, empty/error states, badges.
import type { ReactNode } from "react";
import { Reveal } from "./motion";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`shimmer rounded-xl ${className}`} aria-hidden />;
}

export function CardSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="loading-skeleton">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
          <div className="skeleton aspect-[16/10] w-full" />
          <div className="space-y-2.5 p-4">
            <div className="skeleton h-4 w-4/5 rounded-full" />
            <div className="skeleton h-3.5 w-3/5 rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Reveal className="empty-state mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-12 text-center shadow-card" data-testid="empty-state">
      {/* minimal geometric mark: navy frame + gold orbit */}
      <svg width="96" height="72" viewBox="0 0 96 72" fill="none" aria-hidden className="empty-illustration mx-auto mb-5">
        <rect x="8" y="14" width="62" height="44" rx="12" stroke="var(--color-brand)" strokeOpacity="0.55" strokeWidth="2" />
        <rect x="20" y="24" width="62" height="44" rx="12" fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth="2" />
        <circle cx="70" cy="18" r="7" fill="var(--color-gold)" />
        <path d="M34 46h34" stroke="var(--color-gold-dark)" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        <path d="M40 54h22" stroke="var(--color-brand)" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1.5 text-sm leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Reveal>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Reveal className="empty-state rounded-[var(--radius-card)] border border-danger/20 bg-danger-bg px-6 py-8 text-center" role="alert" data-testid="error-state">
      <p className="text-sm font-semibold text-danger">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-danger-fill px-4 py-2 text-sm font-medium text-on-dark hover:bg-danger-fill"
        >
          ↻
        </button>
      )}
    </Reveal>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-surface-2 text-ink",
  submitted: "bg-warn-bg text-warn",
  approved: "bg-success-bg text-success",
  active: "bg-success-bg text-success",
  paid: "bg-success-bg text-success",
  pending: "bg-warn-bg text-warn",
  rejected: "bg-danger-bg text-danger",
  failed: "bg-danger-bg text-danger",
  expired: "bg-track text-ink",
  rented: "bg-info-bg text-info",
  removed: "bg-track text-muted",
  refunded: "bg-info-bg text-info",
  unverified: "bg-surface-2 text-ink",
  open: "bg-warn-bg text-warn",
  resolved: "bg-success-bg text-success",
  dismissed: "bg-surface-2 text-muted",
  reviewing: "bg-info-bg text-info",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_COLORS[status] || "bg-surface-2 text-ink";
  return (
    <span data-testid={`status-${status}`} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label ?? status}
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink">{children}</span>;
}
