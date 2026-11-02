"use client";
// Owner dashboard: listings, stats (views / contacts / days left), actions.
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { CardSkeleton, EmptyState, ErrorState, StatusBadge } from "./ui";
import { useAuth, useI18n, useToast } from "./Providers";
import { formatDate, formatMoney } from "@/lib/utils";
import type { MeListing } from "@/lib/types";

export function OwnerDashboard() {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<MeListing[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<MeListing[]>("/me/listings")
      .then(setItems)
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
  }, [t]);
  useEffect(load, [load]);

  async function markRented(id: string) {
    setBusyId(id);
    try {
      await api(`/listings/${id}/mark-rented`, { method: "POST" });
      toast.show(t("saved"));
      load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    } finally {
      setBusyId(null);
    }
  }

  const statusLabel = (s: string) => (t(`st.${s}`) !== `st.${s}` ? t(`st.${s}`) : s);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900">{t("dashboard_title")}</h1>
          <p className="text-sm text-stone-500">{t("dashboard_sub")}</p>
          {user && <p className="text-xs text-stone-400">{user.phone}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/${locale}/owner/verification`} data-testid="link-verification" className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            {t("verification")}
          </Link>
          <Link href={`/${locale}/owner/orders`} data-testid="link-orders" className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            {t("orders_title")}
          </Link>
          <Link href={`/${locale}/owner/new`} data-testid="btn-add-listing" className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-brand-deep hover:bg-gold-dark">
            + {t("add_listing")}
          </Link>
        </div>
      </div>

      <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{t("cap_hint")}</p>

      {items === null && !err ? (
        <CardSkeleton n={3} />
      ) : err ? (
        <ErrorState message={err} onRetry={load} />
      ) : items && items.length === 0 ? (
        <EmptyState
          title={t("listings_empty")}
          action={
            <Link href={`/${locale}/owner/new`} className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-brand-deep">
              + {t("add_listing")}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4" data-testid="owner-listings">
          {items?.map((l) => (
            <li key={l.id} data-testid="owner-listing" data-listing-id={l.id} data-status={l.status} className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                  {l.thumb_url ? (
                    <Image src={l.thumb_url} alt="" fill sizes="96px" className="object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-muted">🏙</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-bold text-stone-900 sm:text-base">{l.title}</h2>
                    <StatusBadge status={l.status} label={statusLabel(l.status)} />
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {formatMoney(l.rent_monthly, locale)} {t("per_month")} · {l.governorate_name || ""} {l.city_name ? `· ${l.city_name}` : ""} · {formatDate(l.created_at, locale)}
                  </p>
                  {l.reject_reason && (
                    <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700" data-testid="reject-reason">
                      {t("rejected_reason")}: {l.reject_reason.replace(/_/g, " ")}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-600">
                    <span>
                      👁 {t("views")}: <b data-testid="stat-views">{l.stats.view_count}</b>
                    </span>
                    <span>
                      ☎ {t("contacts")}: <b data-testid="stat-contacts">{l.stats.contact_count}</b>
                    </span>
                    <span>
                      ⏳ {t("days_left")}: <b data-testid="stat-days-left">{l.stats.days_left ?? "—"}</b>
                    </span>
                  </div>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Link
                    href={`/${locale}/owner/${l.id}/edit`}
                    data-testid="btn-edit-listing"
                    className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                  >
                    {t("edit")}
                  </Link>
                  {["approved", "active", "expired", "rejected"].includes(l.status) && (
                    <Link
                      href={`/${locale}/owner/checkout?listing=${l.id}`}
                      data-testid="btn-renew"
                      className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-brand-deep hover:bg-gold-dark"
                    >
                      {t("renew")}
                    </Link>
                  )}
                  {l.status === "active" && (
                    <button
                      type="button"
                      data-testid="btn-mark-rented"
                      disabled={busyId === l.id}
                      onClick={() => markRented(l.id)}
                      className="rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      {t("mark_rented")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
