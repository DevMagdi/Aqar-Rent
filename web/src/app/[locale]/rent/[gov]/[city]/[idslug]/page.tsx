import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactBox } from "@/components/ContactBox";
import { MobileContactDock } from "@/components/MobileContactDock";
import { Reveal, Stagger } from "@/components/motion";
import { DetailMap } from "@/components/DetailMap";
import { Gallery } from "@/components/Gallery";
import { Icon } from "@/components/Icon";
import { ListingCard } from "@/components/ListingCard";
import { FavoriteButton, ReportButton, ShareButton } from "@/components/ListingActions";
import { Pill } from "@/components/ui";
import { makeT } from "@/lib/i18n";
import { ServerApiError, fetchServer } from "@/lib/server";
import { AMENITY_LABEL_KEY, formatDate, formatMoney, locationName, parseIdSlug } from "@/lib/utils";
import type { Locale, Location, ListingDetail, SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { locale: string; gov: string; city: string; idslug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, gov, city, idslug } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const { id, slug } = parseIdSlug(idslug);
  try {
    const d = await fetchServer<ListingDetail>(`/listings/${id}`);
    const canonical = `/${l}/rent/${encodeURIComponent(gov)}/${encodeURIComponent(city)}/${id}${slug ? `-${slug}` : ""}`;
    return {
      title: d.title,
      description: `${formatMoney(d.rent_monthly, l)} ${l === "ar" ? "جنيه/شهر" : "EGP/month"} · ${d.area_m2} m² · ${d.bedrooms} bd · ${d.address_text}`,
      alternates: {
        canonical,
        languages: { ar: `/ar/rent/${gov}/${city}/${idslug}`, en: `/en/rent/${gov}/${city}/${idslug}`, "x-default": `/ar/rent/${gov}/${city}/${idslug}` },
      },
      openGraph: {
        title: d.title,
        description: d.address_text,
        images: [
          {
            url: `/og?title=${encodeURIComponent("Aqar Rent listing")}&sub=${encodeURIComponent(
              `${formatMoney(d.rent_monthly, "en")} EGP/month · ${d.area_m2} m² · ${d.bedrooms} bd · ${city}`,
            )}`,
            width: 1200,
            height: 630,
          },
        ],
        type: "website",
      },
      twitter: { card: "summary_large_image" },
    };
  } catch {
    return { title: "Aqar Rent" };
  }
}

export default async function ListingPage({ params }: { params: Promise<Params> }) {
  const { locale, idslug } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const t = makeT(l);
  const { id } = parseIdSlug(idslug);
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) notFound();

  let d: ListingDetail;
  let places: Record<string, Location> = {};
  let similar: SearchResult = { items: [], next_cursor: null, limit: 6 };
  try {
    const [detail, govs, cities] = await Promise.all([
      fetchServer<ListingDetail>(`/listings/${id}`),
      fetchServer<Location[]>("/locations?level=governorate"),
      fetchServer<Location[]>("/locations?level=city"),
    ]);
    d = detail;
    places = Object.fromEntries([...govs, ...cities].map((x) => [x.id, x]));
    similar = await fetchServer<SearchResult>(`/listings?city_id=${d.city_id}&limit=6`);
    similar = { ...similar, items: similar.items.filter((i) => i.id !== d.id) };
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) notFound();
    throw e;
  }

  const gov = places[d.governorate_id];
  const city = places[d.city_id];
  const specs: [string, string][] = [
    [t("property_type"), t(`spec.${d.property_type}`)],
    [t("rental_type"), t(`spec.${d.rental_type}`)],
    [t("furnished"), t(`spec.${d.furnished}`)],
    [t("area_m2"), `${d.area_m2} م²`],
    [t("bedrooms"), String(d.bedrooms)],
    [t("bathrooms"), String(d.bathrooms)],
    ...(d.floor !== null ? ([[t("floor"), String(d.floor)]] as [string, string][]) : []),
    [t("elevator"), d.has_elevator ? t("yes") : t("no")],
    ...(d.finishing ? ([[t("finishing"), d.finishing.replace(/_/g, " ")]] as [string, string][]) : []),
    ...(d.building_age !== null ? ([[t("building_age"), `${d.building_age} ${t("year")}`]] as [string, string][]) : []),
    [t("min_term"), `${d.min_term_months} ${t("month_s")}`],
    ...(d.available_from ? ([[t("available_from_l"), formatDate(d.available_from, l)]] as [string, string][]) : []),
  ];
  const amenityEntries = Object.entries(d.amenities || {}).filter(([, v]) => v === true);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: d.title,
    description: d.description?.slice(0, 300),
    address: {
      "@type": "PostalAddress",
      addressLocality: locationName(city, l),
      addressRegion: locationName(gov, l),
      streetAddress: d.address_text,
      addressCountry: "EG",
    },
    geo: { "@type": "GeoCoordinates", latitude: d.geo.latitude, longitude: d.geo.longitude },
    floorSize: { "@type": "QuantitativeValue", value: d.area_m2, unitCode: "MTK" },
    numberOfRooms: d.bedrooms,
    numberOfBathroomsTotal: d.bathrooms,
    image: d.media.map((m) => m.url),
    offers: {
      "@type": "Offer",
      price: d.rent_monthly,
      priceCurrency: "EGP",
      availability: "https://schema.org/InStock",
      eligibleTransactionType: "https://schema.org/RentAction",
    },
  };

  return (
    <div className="space-y-8" data-testid="listing-detail" data-listing-id={d.id}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Reveal className="listing-gallery-reveal"><Gallery media={d.media} title={d.title} listingId={d.id} /></Reveal>

          <Reveal as="section" className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-ink-strong sm:text-2xl" data-testid="listing-title">
                  {d.title}
                </h1>
                <p className="mt-1 text-sm text-muted">
                  📍 {d.address_text} · {locationName(city, l)} {locationName(gov, l) ? `· ${locationName(gov, l)}` : ""}
                </p>
              </div>
              <p className="font-display text-2xl font-extrabold text-verified tabular-nums" data-testid="listing-price">
                {formatMoney(d.rent_monthly, l)} <span className="text-sm font-semibold">{t("per_month")}</span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>
                {t("deposit")}: {d.deposit_months} {t("month_s")}
              </Pill>
              <Pill>
                {d.area_m2} م² · {d.bedrooms} {t("bedrooms")} · {d.bathrooms} {t("bathrooms")}
              </Pill>
              {d.verified_badge && (
                <span data-testid="verified-badge" className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-bold text-success">
                  <Icon name="check" size={12} strokeWidth={2.8} />
                  {t("verified_owner")}
                </span>
              )}
              {d.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-bold text-warn">
                  <Icon name="star" size={12} />
                  {l === "ar" ? "إعلان مميز" : "Featured"}
                </span>
              )}
              {d.office && (
                <Link
                  href={`/${l}/offices/${d.office.slug}`}
                  className="inline-flex items-center gap-1 rounded-full bg-gold-tint-14 px-2.5 py-0.5 text-xs font-bold text-ink hover:underline"
                >
                  <Icon name="building" size={13} />
                  {l === "ar" ? d.office.name_ar : d.office.name_en}
                </Link>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FavoriteButton listingId={d.id} />
              <ShareButton title={d.title} />
            </div>
          </Reveal>

          {d.trust && (
            <Reveal className="surface-card bg-success-bg p-5" data-testid="trust-panel">
              <h2 className="text-sm font-bold text-success">
                {l === "ar" ? "مستوى توثيق المالك" : "Owner trust level"}
              </h2>
              <p className="mt-1 text-lg font-extrabold text-success" dir={l === "ar" ? "rtl" : "ltr"}>
                {l === "ar" ? d.trust.label_ar : d.trust.label_en}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {d.trust.badges.map((b) => (
                  <li key={b.code} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-success">
                    <Icon name="check" size={11} strokeWidth={2.8} />
                    {l === "ar" ? b.label_ar : b.label_en}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-success">
                {l === "ar" ? d.trust.note_ar : d.trust.note_en}
              </p>
              {d.agent && (
                <p className="mt-2 text-xs text-success">
                  {l === "ar" ? "الوسيط المسؤول" : "Responsible agent"}: {d.agent.full_name}
                </p>
              )}
            </Reveal>
          )}

          <Reveal as="section" className="surface-card p-5">
            <h2 className="text-lg font-bold text-ink-strong">{t("details")}</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {specs.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5 text-sm">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal as="section" className="surface-card p-5">
            <h2 className="text-lg font-bold text-ink-strong">{t("description")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink" data-testid="listing-description">
              {d.description || t("empty")}
            </p>
          </Reveal>

          <Reveal as="section" className="surface-card p-5">
            <h2 className="text-lg font-bold text-ink-strong">{t("amenities")}</h2>
            {amenityEntries.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("amenities_none")}</p>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="amenities">
                {amenityEntries.map(([k]) => (
                  <li key={k} className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2 text-sm text-ink">
                    <Icon name="check" size={13} strokeWidth={2.8} className="text-success" />{" "}
                    {AMENITY_LABEL_KEY[k] ? t(AMENITY_LABEL_KEY[k]) : k.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            )}
          </Reveal>

          <ReportButton listingId={d.id} />
        </div>

        <Reveal as="aside" className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden rounded-2xl border border-border bg-surface p-4 lg:block">
            <h2 className="mb-3 text-base font-bold text-ink-strong">{t("contact_owner")}</h2>
            <ContactBox listingId={d.id} ownerName={d.owner_name} />
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>
                {t("owner")}: {d.owner_name || t("empty")}
              </span>
              <span>
                {t("views")}: {d.view_count ?? 0}
              </span>
            </div>
          </div>
          <DetailMap geo={d.geo} address={d.address_text} listingId={d.id} />
        </Reveal>
      </div>

      <MobileContactDock price={formatMoney(d.rent_monthly, l)} perMonth={t("per_month")} label={t("contact_owner")}>
        <ContactBox listingId={d.id} ownerName={d.owner_name} variant="dock" />
      </MobileContactDock>

      {similar.items.length > 0 && (
        <Reveal as="section" aria-labelledby="sim-h">
          <h2 id="sim-h" className="mb-4 text-xl font-bold text-ink-strong">
            {t("similar")}
          </h2>
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similar.items.slice(0, 6).map((item) => (
              <ListingCard key={item.id} item={item} locale={l} places={places} />
            ))}
          </Stagger>
        </Reveal>
      )}
    </div>
  );
}
