// Listing card — cinematic (premium):16:10 hero image with gradient price
// band, dominant price → title → location/meta hierarchy, premium badges,
// hover lift + image zoom (RTL-safe, isomorphic: takes `locale` as a prop).
import Image from "next/image";
import Link from "next/link";
import { buildListingPath, formatMoney, locationName } from "@/lib/utils";
import { makeT } from "@/lib/i18n";
import type { Locale, Location, SearchItem } from "@/lib/types";

/** Premium trust/featured badge — gradient chip, never a flat pill. */
export function BadgeFeatured({ label, tone = "gold" }: { label: string; tone?: "gold" | "teal" }) {
  return (
    <span
      data-testid="badge-premium"
      className={`inline-flex items-center gap-1 rounded-full border border-on-dark/20 bg-brand-deep/70 px-2.5 py-1 text-[11px] font-bold text-gold-light shadow backdrop-blur ${
        tone === "gold" ? "" : "text-on-dark"
      }`}
    >
      {tone === "gold" ? "✦" : "✓"} {label}
    </span>
  );
}

export function ListingCard({
  item,
  locale,
  places,
  eager = false,
}: {
  item: SearchItem;
  locale: Locale;
  places?: Record<string, Location>;
  eager?: boolean;
}) {
  const t = makeT(locale);
  const gov = places?.[item.governorate_id];
  const city = places?.[item.city_id];
  const govSlug = locationName(gov, locale) || item.governorate_id;
  const citySlug = locationName(city, locale) || item.city_id;
  const href = buildListingPath(locale, govSlug, citySlug, item.id, item.title);
  const availableNow = !item.available_from;

  return (
    <article
      data-testid="listing-card"
      data-listing-id={item.id}
      className="card-lift group relative overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card will-change-transform"
    >
      <Link href={href} className="block focus-visible:outline-none">
        {/* ── hero image:16:10, zoom on hover, gradient price band ── */}
        <div className="relative h-[170px] w-full overflow-hidden bg-track">
          {item.thumb_url ? (
            <Image
              src={item.thumb_url}
              alt={item.title}
              fill
              priority={eager}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="image-loaded object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
              style={{ viewTransitionName: `listing-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}` }}
            />
          ) : (
            <div className="grid h-full place-items-center text-4xl text-muted/50">🏙</div>
          )}
          {/* readability gradient (bottom → transparent) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/30 to-transparent"
          />
          {/* dominant price, ON the image */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
            <p className="font-display text-2xl font-extrabold leading-none text-on-dark listing-price-text">
              {formatMoney(item.rent_monthly, locale)}
              <span className="ms-1 text-xs font-semibold text-on-dark/85">{t("per_month")}</span>
            </p>
            {availableNow && <BadgeFeatured label={t("available_now")} />}
          </div>
          {item.verified_owner ? (
            <span
              data-testid="trust-badge"
              title={locale === "ar" ? item.trust_label_ar || "" : "Verified owner"}
              className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-full border border-on-dark/20 bg-brand-deep/70 px-2.5 py-1 text-[11px] font-bold text-gold-light shadow backdrop-blur"
            >
              ✓ {t("trust_verified")}
            </span>
          ) : null}
        </div>

        {/* ── content: title → location → refined meta row ── */}
        <div className="space-y-2 p-4 pb-4">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink transition-colors duration-150 group-hover:text-ink-strong sm:text-base">
            {item.title}
          </h3>
          <p className="flex items-center gap-1.5 truncate text-sm text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="shrink-0">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="truncate">{[locationName(city, locale), locationName(gov, locale)].filter(Boolean).join("، ") || item.address_text}</span>
          </p>
          {item.office_name_ar ? (
            <p className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-teal-bg px-2.5 py-1 text-xs font-semibold text-teal-ink">✓ {item.office_name_ar}</p>
          ) : null}
          <div className="flex items-center gap-2 border-t border-track pt-2.5 text-xs font-medium text-muted" dir={locale === "ar" ? "rtl" : "ltr"}>
            <span className="rounded-full bg-track px-2 py-0.5 tabular-nums">{item.area_m2.toFixed(0)} م²</span>
            <span className="rounded-full bg-track px-2 py-0.5 tabular-nums">
              🛏 {item.bedrooms}
            </span>
            <span className="rounded-full bg-track px-2 py-0.5 tabular-nums">
              🛁 {item.bathrooms}
            </span>
            <span className="rounded-full bg-track px-2 py-0.5">{t(`spec.${item.furnished}`)}</span>
            {item.is_featured && <span className="rounded-full bg-gold-tint-14 px-2 py-0.5 text-ink">★ {t("trust_featured")}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
