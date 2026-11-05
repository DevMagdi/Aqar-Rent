"use client";
// Favorites list (client-fetched; status greys out expired/rented).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, CardSkeleton, ErrorState, StatusBadge } from "./ui";
import { useI18n } from "./Providers";
import { buildListingPath, formatMoney, locationName } from "@/lib/utils";
import type { FavoritesOutShape } from "./fav-types";
import type { Location, Locale } from "@/lib/types";

export function FavoritesView({ locale, places }: { locale: Locale; places: Record<string, Location> }) {
  const { t } = useI18n();
  const [items, setItems] = useState<FavoritesOutShape["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api<FavoritesOutShape>("/favorites?limit=50")
      .then((p) => setItems(p.items))
      .catch((e) => setErr(e?.message || t("error_generic")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 text-xl font-bold text-ink-strong">{t("favorites_title")}</h1>
      {loading ? (
        <CardSkeleton n={4} />
      ) : err ? (
        <ErrorState message={err} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("favorites_empty")}
          action={
            <Link href={`/${locale}/search`} className="px-5 py-2.5 text-sm font-semibold btn-primary">
              {t("browse_listings")}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const gov = places[item.governorate_id];
            const city = places[item.city_id];
            const href = buildListingPath(
              locale,
              locationName(gov, locale) || "eg",
              locationName(city, locale) || "city",
              item.id,
              item.title,
            );
            const dead = ["expired", "rented", "removed"].includes(item.status);
            return (
              <li key={item.id}>
                <Link
                  href={href}
                  className={`flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 hover:shadow-sm ${dead ? "opacity-60" : ""}`}
                  data-testid="favorite-item"
                >
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.thumb_url && <img src={item.thumb_url} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-strong">{item.title}</p>
                    <p className="text-sm font-bold text-ink">
                      {formatMoney(item.rent_monthly, locale)} {t("per_month")}
                    </p>
                  </div>
                  <StatusBadge status={item.status} label={t(`st.${item.status}`) !== `st.${item.status}` ? t(`st.${item.status}`) : item.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
