"use client";
// Orders & receipts list with PDF download (auth-aware blob fetch).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getAccess } from "@/lib/api";
import { EmptyState, ErrorState, StatusBadge } from "./ui";
import { useI18n, useToast } from "./Providers";
import { formatDate, formatMoney } from "@/lib/utils";
import type { Locale, OrdersPage as Page } from "@/lib/types";
import { Icon } from "./Icon";

export function OrdersListView({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<Page | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dlId, setDlId] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<Page>("/me/orders?limit=50")
      .then(setData)
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
  }, [t]);
  useEffect(load, [load]);

  async function downloadReceipt(orderId: string) {
    setDlId(orderId);
    try {
      const token = getAccess();
      const res = await fetch(`/api/v1/orders/${orderId}/receipt`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${orderId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.show((e as Error).message || t("error_generic"), "err");
    } finally {
      setDlId(null);
    }
  }

  const statusLabel = (s: string) => (t(`ostatus.${s}`) !== `ostatus.${s}` ? t(`ostatus.${s}`) : s);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-strong">{t("orders_title")}</h1>
        <Link href={`/${locale}/owner`} className="text-sm font-semibold text-ink hover:underline">
          ← {t("dashboard_title")}
        </Link>
      </div>

      {err ? (
        <ErrorState message={err} onRetry={load} />
      ) : !data ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-track" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState title={t("receipt_none")} />
      ) : (
        <ul className="space-y-3" data-testid="orders-list">
          {data.items.map((o) => (
            <li key={o.id} data-testid="order-row" data-status={o.status} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/${locale}/owner/orders/${o.id}`} className="text-sm font-bold text-ink-strong hover:text-ink">
                    {t("order_ref")}: <span className="font-mono">{o.id.slice(0, 8)}</span>
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(o.created_at, locale)} · {o.weeks} {t("week")} · {t(`method_${o.method}`)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-ink">{formatMoney(o.total, locale)}</span>
                  <StatusBadge status={o.status} label={statusLabel(o.status)} />
                </div>
              </div>
              {o.status === "paid" && (
                <button
                  type="button"
                  data-testid="btn-download-receipt"
                  disabled={dlId === o.id}
                  onClick={() => downloadReceipt(o.id)}
                  className="mt-3 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-bg disabled:opacity-60"
                >
                  {dlId === o.id ? (
                "…"
              ) : (
                <>
                  <Icon name="download" size={14} />
                  {t("download_receipt")}
                </>
              )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
