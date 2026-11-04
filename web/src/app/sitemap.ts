import type { MetadataRoute } from "next";
import { fetchServer } from "@/lib/server";
import { buildListingPath, locationName } from "@/lib/utils";
import type { Location, SearchResult } from "@/lib/types";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const LOCALES = ["ar", "en"] as const;
const STATIC = ["about", "how-it-works", "terms", "privacy", "content-rules", "support"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];

  for (const l of LOCALES) {
    out.push({ url: `${SITE}/${l}`, lastModified: new Date(), alternates: { languages: { ar: `${SITE}/ar`, en: `${SITE}/en` } } });
    for (const s of STATIC) {
      out.push({
        url: `${SITE}/${l}/${s}`,
        lastModified: new Date(),
        alternates: { languages: { ar: `${SITE}/ar/${s}`, en: `${SITE}/en/${s}` } },
      });
    }
    out.push({ url: `${SITE}/${l}/search` });
  }

  try {
    const [res, govs, cities] = await Promise.all([
      fetchServer<SearchResult>("/listings?sort=newest&limit=50"),
      fetchServer<Location[]>("/locations?level=governorate"),
      fetchServer<Location[]>("/locations?level=city"),
    ]);
    const places = Object.fromEntries([...govs, ...cities].map((x) => [x.id, x]));
    for (const item of res.items) {
      for (const l of LOCALES) {
        const gov = places[item.governorate_id];
        const city = places[item.city_id];
        out.push({
          url: `${SITE}${buildListingPath(l, locationName(gov, l) || "eg", locationName(city, l) || "city", item.id, item.title)}`,
          lastModified: item.created_at ? new Date(item.created_at) : new Date(),
          changeFrequency: "daily",
          priority: 0.8,
          alternates: {
            languages: Object.fromEntries(LOCALES.map((x) => [x, `${SITE}${buildListingPath(x, locationName(places[item.governorate_id], x) || "eg", locationName(places[item.city_id], x) || "city", item.id, item.title)}`])),
          },
        });
      }
    }
  } catch {
    // backend offline at build time — static entries above still emitted
  }

  return out;
}
