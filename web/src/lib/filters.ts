// Shared filter state <-> URL helpers (importable from server + client).
export interface Filters {
  q: string;
  governorate_id: string;
  city_id: string;
  district_id: string;
  min_price: string;
  max_price: string;
  property_type: string;
  rental_type: string;
  furnished: string;
  bedrooms: string;
  bathrooms: string;
  min_area: string;
  max_area: string;
  floor: string;
  amenities: string[];
  available_from: string;
  sort: string;
  bbox: string;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  governorate_id: "",
  city_id: "",
  district_id: "",
  min_price: "",
  max_price: "",
  property_type: "",
  rental_type: "",
  furnished: "",
  bedrooms: "",
  bathrooms: "",
  min_area: "",
  max_area: "",
  floor: "",
  amenities: [],
  available_from: "",
  sort: "newest",
  bbox: "",
};

export function filtersFromParams(sp: Record<string, string | string[] | undefined>): Filters {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] || "" : v || "";
  };
  const amen = sp.amenities;
  return {
    ...EMPTY_FILTERS,
    q: get("q"),
    governorate_id: get("governorate_id"),
    city_id: get("city_id"),
    district_id: get("district_id"),
    min_price: get("min_price"),
    max_price: get("max_price"),
    property_type: get("property_type"),
    rental_type: get("rental_type"),
    furnished: get("furnished"),
    bedrooms: get("bedrooms"),
    bathrooms: get("bathrooms"),
    min_area: get("min_area"),
    max_area: get("max_area"),
    floor: get("floor"),
    amenities: Array.isArray(amen) ? amen : amen ? amen.split(",").filter(Boolean) : [],
    available_from: get("available_from"),
    sort: get("sort") || "newest",
    bbox: get("bbox"),
  };
}

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).forEach((k) => {
    const v = f[k];
    if (k === "amenities") {
      (v as string[]).forEach((a) => p.append("amenities", a));
    } else if (k !== "sort" && v && v !== EMPTY_FILTERS[k]) {
      p.set(k, String(v));
    }
  });
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  return p.toString();
}
