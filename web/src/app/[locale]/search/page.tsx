import type { Metadata } from "next";
import { SearchExperience } from "@/components/SearchExperience";
import { filtersFromParams } from "@/lib/filters";
import { makeT } from "@/lib/i18n";
import { fetchServer } from "@/lib/server";
import type { Locale, Location, SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function qsFrom(sp: SP, forList = false): string {
  const p = new URLSearchParams();
  if (forList) p.set("limit", "20");
  const multi = new Set(["amenities"]);
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (multi.has(k)) {
      (Array.isArray(v) ? v : v.split(",")).filter(Boolean).forEach((x) => p.append(k, x));
    } else if (Array.isArray(v)) {
      if (v[0]) p.set(k, v[0]);
    } else if (v !== "") p.set(k, v);
  }
  return p.toString();
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const t = makeT(l);
  return {
    title: t("nav_search"),
    alternates: {
      canonical: `/${l}/search`,
      languages: { ar: "/ar/search", en: "/en/search", "x-default": "/ar/search" },
    },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const filters = filtersFromParams(sp);

  let initial: SearchResult = { items: [], next_cursor: null, limit: 20 };
  let places: Record<string, Location> = {};
  try {
    const [res, govs, cities] = await Promise.all([
      fetchServer<SearchResult>(`/listings?${qsFrom(sp, true)}`),
      fetchServer<Location[]>("/locations?level=governorate"),
      fetchServer<Location[]>("/locations?level=city"),
    ]);
    initial = res;
    places = Object.fromEntries([...govs, ...cities].map((x) => [x.id, x]));
  } catch {
    /* backend offline — client will surface the error state */
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-ink-strong">{makeT(l)("nav_search")}</h1>
      <SearchExperience locale={l} places={places} initial={initial} initialFilters={filters} />
    </div>
  );
}
