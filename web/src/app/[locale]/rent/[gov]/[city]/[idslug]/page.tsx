import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactBox } from "@/components/ContactBox";
import { DetailMap } from "@/components/DetailMap";
import { Gallery } from "@/components/Gallery";
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
          <Gallery media={d.media} title={d.title} />

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-stone-900 sm:text-2xl" data-testid="listing-title">
                  {d.title}
                </h1>
                <p className="mt-1 text-sm text-stone-500">
                  📍 {d.address_text} · {locationName(city, l)} {locationName(gov, l) ? `· ${locationName(gov, l)}` : ""}
                </p>
              </div>
              <p className="text-2xl font-extrabold text-gold-dark" data-testid="listing-price">
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
                <span data-testid="verified-badge" className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  ✓ {t("verified_owner")}
                </span>
              )}
              {d.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  ★ {l === "ar" ? "إعلان مميز" : "Featured"}
                </span>
              )}
              {d.office && (
                <Link
                  href={`/${l}/offices/${d.office.slug}`}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-ink hover:underline"
                >
                  🏢 {l === "ar" ? d.office.name_ar : d.office.name_en}
                </Link>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FavoriteButton listingId={d.id} />
              <ShareButton title={d.title} />
            </div>
          </div>

          {d.trust && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5" data-testid="trust-panel">
              <h2 className="text-sm font-bold text-emerald-900">
                {l === "ar" ? "مستوى توثيق المالك" : "Owner trust level"}
              </h2>
              <p className="mt-1 text-lg font-extrabold text-emerald-800" dir={l === "ar" ? "rtl" : "ltr"}>
                {l === "ar" ? d.trust.label_ar : d.trust.label_en}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {d.trust.badges.map((b) => (
                  <li key={b.code} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    ✓ {l === "ar" ? b.label_ar : b.label_en}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-emerald-800">
                {l === "ar" ? d.trust.note_ar : d.trust.note_en}
              </p>
              {d.agent && (
                <p className="mt-2 text-xs text-emerald-900">
                  {l === "ar" ? "الوسيط المسؤول" : "Responsible agent"}: {d.agent.full_name}
                </p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-bold text-stone-900">{t("details")}</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {specs.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-stone-100 py-1.5 text-sm">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="font-semibold text-stone-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-bold text-stone-900">{t("description")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700" data-testid="listing-description">
              {d.description || t("empty")}
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-bold text-stone-900">{t("amenities")}</h2>
            {amenityEntries.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">{t("amenities_none")}</p>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="amenities">
                {amenityEntries.map(([k]) => (
                  <li key={k} className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">
                    <span className="text-emerald-600">✓</span>{" "}
                    {AMENITY_LABEL_KEY[k] ? t(AMENITY_LABEL_KEY[k]) : k.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ReportButton listingId={d.id} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="mb-3 text-base font-bold text-stone-900">{t("contact_owner")}</h2>
            <ContactBox listingId={d.id} ownerName={d.owner_name} />
            <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
              <span>
                {t("owner")}: {d.owner_name || t("empty")}
              </span>
              <span>
                {t("views")}: {d.view_count ?? 0}
              </span>
            </div>
          </div>
          <DetailMap geo={d.geo} address={d.address_text} listingId={d.id} />
        </aside>
      </div>

      {similar.items.length > 0 && (
        <section aria-labelledby="sim-h">
          <h2 id="sim-h" className="mb-4 text-xl font-bold text-stone-900">
            {t("similar")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similar.items.slice(0, 6).map((item) => (
              <ListingCard key={item.id} item={item} locale={l} places={places} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
