import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { SearchBar } from "@/components/SearchBar";
import { makeT } from "@/lib/i18n";
import { fetchServer } from "@/lib/server";
import { DEFAULT_LOCALE, dirOf, LOCALES } from "@/lib/i18n";
import type { Locale, Location, SearchResult } from "@/lib/types";

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  return {
    alternates: {
      canonical: `/${l}`,
      languages: { ar: "/ar", en: "/en", "x-default": "/ar" },
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const t = makeT(l);

  let latest: SearchResult = { items: [], next_cursor: null, limit: 12 };
  let places: Record<string, Location> = {};
  try {
    const [res, govs, cities] = await Promise.all([
      fetchServer<SearchResult>("/listings?sort=newest&limit=12"),
      fetchServer<Location[]>("/locations?level=governorate"),
      fetchServer<Location[]>("/locations?level=city"),
    ]);
    latest = res;
    places = Object.fromEntries([...govs, ...cities].map((x) => [x.id, x]));
  } catch {
    // Backend offline in build → render empty states (dev server still works).
  }

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-gradient-to-b from-brand-50 to-stone-50 p-4 sm:p-8" data-testid="hero">
        <SearchBar />
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-500">
          <Link href={`/${l}/how-it-works`} className="hover:text-ink">
            {t("how_it_works")} →
          </Link>
          <Link href={`/${l}/content-rules`} className="hover:text-ink">
            {t("content_rules")} →
          </Link>
        </div>
      </section>

      <section aria-labelledby="latest-h" data-testid="latest-listings">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="latest-h" className="text-xl font-bold text-stone-900">
            {t("latest_listings")}
          </h2>
          <Link href={`/${l}/search`} className="text-sm font-semibold text-ink hover:underline" data-testid="view-all">
            {t("view_all")} ←
          </Link>
        </div>
        {latest.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500" data-testid="empty-state">
            {t("no_results")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.items.map((item, i) => (
              <ListingCard key={item.id} item={item} locale={l} places={places} eager={i < 3} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
