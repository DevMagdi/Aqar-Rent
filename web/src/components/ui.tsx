// Small shared UI pieces: loading skeletons, empty/error states, badges.
import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-stone-200 ${className}`} aria-hidden />;
}

export function CardSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="loading-skeleton">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center" data-testid="empty-state">
      <p className="text-base font-semibold text-stone-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-stone-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center" role="alert" data-testid="error-state">
      <p className="text-sm font-semibold text-red-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          ↻
        </button>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  active: "bg-emerald-100 text-emerald-800",
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
  failed: "bg-red-100 text-red-800",
  expired: "bg-stone-200 text-stone-700",
  rented: "bg-sky-100 text-sky-800",
  removed: "bg-stone-200 text-stone-600",
  refunded: "bg-violet-100 text-violet-800",
  unverified: "bg-stone-100 text-stone-700",
  open: "bg-amber-100 text-amber-800",
  resolved: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-stone-100 text-stone-600",
  reviewing: "bg-sky-100 text-sky-800",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_COLORS[status] || "bg-stone-100 text-stone-700";
  return (
    <span data-testid={`status-${status}`} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label ?? status}
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">{children}</span>;
}
