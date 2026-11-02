"use client";
// Notifications center: list, unread badge, mark-all-read.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, ErrorState } from "./ui";
import { useI18n } from "./Providers";
import { formatDateTime } from "@/lib/utils";
import type { NotificationsPage as Page } from "@/lib/types";

export function NotificationsView() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api<Page>("/notifications?limit=50")
      .then(setData)
      .catch(() => setErr(t("error_generic")))
      .finally(() => setLoading(false));
  }, [t]);
  useEffect(load, [load]);

  async function markAll() {
    try {
      await api("/notifications/read", { method: "POST", body: { ids: [] } });
      load();
    } catch {
      setErr(t("error_generic"));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-900">
          {t("notifications_title")}
          {data && data.unread_count > 0 && (
            <span className="ms-2 rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-brand-deep">{data.unread_count}</span>
          )}
        </h1>
        {data && data.unread_count > 0 && (
          <button type="button" data-testid="mark-all-read" onClick={markAll} className="text-sm font-semibold text-ink hover:underline">
            {t("mark_all_read")}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-200" />
          ))}
        </div>
      ) : err ? (
        <ErrorState message={err} onRetry={load} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={t("notifications_empty")} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((n) => (
            <li
              key={n.id}
              data-testid="notification-item"
              className={`rounded-2xl border p-4 ${n.read_at ? "border-stone-200 bg-white" : "border-brand-100 bg-brand-50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-stone-900">{n.title}</p>
                {!n.read_at && <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-brand-deep">{t("unread")}</span>}
              </div>
              <p className="mt-1 text-sm text-stone-600">{n.body}</p>
              <p className="mt-2 text-xs text-stone-400">{formatDateTime(n.created_at, locale)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
