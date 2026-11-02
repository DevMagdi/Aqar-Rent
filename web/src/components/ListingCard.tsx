// Listing card — isomorphic (server + client), no hooks: takes `locale` prop.
import Image from "next/image";
import Link from "next/link";
import { buildListingPath, formatMoney, locationName } from "@/lib/utils";
import { makeT } from "@/lib/i18n";
import type { Locale, Location, SearchItem } from "@/lib/types";
import { Pill } from "./ui";

export interface PlaceMap {
  byId: Record<string, Location>;
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

  return (
    <article data-testid="listing-card" data-listing-id={item.id} className="group overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] w-full bg-stone-100">
          {item.thumb_url ? (
            <Image
              src={item.thumb_url}
              alt={item.title}
              fill
              priority={eager}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center text-3xl text-stone-300">🏙</div>
          )}
          <div className="absolute bottom-2 start-2 rounded-lg bg-black/70 px-2 py-1 text-sm font-bold text-white">
            {formatMoney(item.rent_monthly, locale)} {t("per_month")}
          </div>
        </div>
        <div className="space-y-2 p-4">
          <h3 className="line-clamp-2 min-h-11 text-sm font-semibold text-stone-900 group-hover:text-brand-600 sm:text-base">{item.title}</h3>
          <p className="truncate text-xs text-stone-500">
            {[locationName(city, locale), locationName(gov, locale)].filter(Boolean).join("، ") || item.address_text}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Pill>{t(`spec.${item.property_type}`)}</Pill>
            <Pill>
              {item.area_m2} م²
            </Pill>
            <Pill>
              {item.bedrooms} {t("bedrooms")}
            </Pill>
            <Pill>{t(`spec.${item.furnished}`)}</Pill>
          </div>
        </div>
      </Link>
    </article>
  );
}
