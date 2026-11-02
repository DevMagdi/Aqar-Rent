"use client";
// Search page experience: filters + results list + map sharing one state,
// URL-synced (shareable/deep-linkable), infinite scroll 20/page, map bbox flow.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListingCard } from "./ListingCard";
import { MapSection } from "./MapSection";
import { EmptyState, ErrorState, CardSkeleton } from "./ui";
import { useI18n, useToast } from "./Providers";
import { api, ApiError } from "@/lib/api";
import { EMPTY_FILTERS, filtersToQuery, type Filters } from "@/lib/filters";
import { AMENITY_KEYS, AMENITY_LABEL_KEY, locationName } from "@/lib/utils";
import type { Locale, Location, SearchResult, SearchItem } from "@/lib/types";


function buildPath(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.governorate_id) p.set("governorate_id", f.governorate_id);
  if (f.city_id) p.set("city_id", f.city_id);
  if (f.district_id) p.set("district_id", f.district_id);
  if (f.min_price) p.set("min_price", f.min_price);
  if (f.max_price) p.set("max_price", f.max_price);
  if (f.property_type) p.set("property_type", f.property_type);
  if (f.rental_type) p.set("rental_type", f.rental_type);
  if (f.furnished) p.set("furnished", f.furnished);
  if (f.bedrooms) p.set("bedrooms", f.bedrooms);
  if (f.bathrooms) p.set("bathrooms", f.bathrooms);
  if (f.min_area) p.set("min_area", f.min_area);
  if (f.max_area) p.set("max_area", f.max_area);
  if (f.floor) p.set("floor", f.floor);
  if (f.available_from) p.set("available_from", f.available_from);
  if (f.bbox) p.set("bbox", f.bbox);
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  f.amenities.forEach((a) => p.append("amenities", a));
  const qs = p.toString();
  return `/listings?limit=20${qs ? `&${qs}` : ""}`;
}

const PROPERTY_TYPES = ["apartment", "studio", "villa", "room", "shop", "office", "clinic"];
const FURNISHED = ["furnished", "unfurnished", "semi"];

export function SearchExperience({
  locale,
  places,
  initial,
  initialFilters,
}: {
  locale: Locale;
  places: Record<string, Location>;
  initial: SearchResult;
  initialFilters: Filters;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [items, setItems] = useState<SearchItem[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.next_cursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapBbox, setMapBbox] = useState<[number, number, number, number] | null>(
    initialFilters.bbox ? (initialFilters.bbox.split(",").map(Number) as [number, number, number, number]) : null,
  );
  const [mobileMap, setMobileMap] = useState(false);
  const [focus, setFocus] = useState<SearchItem | null>(null);
  const [districts, setDistricts] = useState<Location[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const seqRef = useRef(0);

  const cities = useMemo(
    () =>
      Object.values(places).filter(
        (p) => p.level === "city" && (!filters.governorate_id || (p as Location & { parent_id?: string }).parent_id === filters.governorate_id),
      ),
    [places, filters.governorate_id],
  );

  const runSearch = useCallback(
    async (f: Filters, append = false, from = 0) => {
      const seq = ++seqRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api<SearchResult>(buildPath(f), { anonymous: true });
        if (seq !== seqRef.current) return;
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setCursor(res.next_cursor);
      } catch (e) {
        if (seq !== seqRef.current) return;
        setError(e instanceof ApiError ? e.message : t("error_generic"));
      } finally {
        if (seq === seqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [t],
  );

  // Apply filters → fetch + sync URL (replaceState: no server roundtrip per keystroke-apply).
  const applyFilters = useCallback(
    (next: Filters) => {
      setFilters(next);
      setFocus(null);
      const qs = filtersToQuery(next);
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      window.history.replaceState(null, "", url);
      runSearch(next);
    },
    [runSearch],
  );

  // Load districts when a city is picked (filter dropdown).
  useEffect(() => {
    if (!filters.city_id) {
      setDistricts([]);
      return;
    }
    let alive = true;
    api<Location[]>(`/locations?parent_id=${filters.city_id}`, { anonymous: true })
      .then((d) => alive && setDistricts(d))
      .catch(() => alive && setDistricts([]));
    return () => {
      alive = false;
    };
  }, [filters.city_id]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore && !loading) runSearch(filters, true);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loading, loadingMore, items]);

  // Pin click → navigate to listing detail (client event from MapView).
  useEffect(() => {
    const handler = (ev: Event) => {
      const id = (ev as CustomEvent<{ id: string }>).detail?.id;
      const item = items.find((i) => i.id === id);
      if (!item) return;
      const gov = places[item.governorate_id];
      const city = places[item.city_id];
      router.push(
        `/${locale}/rent/${encodeURIComponent(locationName(gov, locale) || "eg")}/${encodeURIComponent(
          locationName(city, locale) || "city",
        )}/${item.id}`,
      );
    };
    window.addEventListener("aqar:pin-click", handler);
    return () => window.removeEventListener("aqar:pin-click", handler);
  }, [items, places, locale, router]);

  const set = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    const freeText = ["q", "min_price", "max_price", "bedrooms", "bathrooms", "min_area", "max_area", "floor"];
    const isText = Object.keys(patch).some((k) => freeText.includes(k));
    if (isText) {
      // Debounce keystroke-y fields; apply selects/dates immediately.
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      setFilters(next);
      debounceRef.current = window.setTimeout(() => applyFilters(next), 350);
      return;
    }
    applyFilters(next);
  };

  const toggleAmenity = (key: string) =>
    applyFilters({
      ...filters,
      amenities: filters.amenities.includes(key) ? filters.amenities.filter((a) => a !== key) : [...filters.amenities, key],
    });

  const anyFilter =
    (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).some((k) => k !== "sort" && k !== "amenities" && String(filters[k] || "") !== "") ||
    filters.amenities.length > 0;

  const bboxChanged =
    mapBbox &&
    filters.bbox &&
    mapBbox.map((n) => n.toFixed(3)).join(",") !== filters.bbox.split(",").map((n) => Number(n).toFixed(3)).join(",");
  const showAreaBtn = Boolean(bboxChanged);

  const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const labelCls = "mb-1 block text-xs font-semibold text-stone-600";

  return (
    <div className="space-y-4">
      {/* ── Filters ─────────────────────────────────────────────── */}
      <details open className="group rounded-2xl border border-stone-200 bg-white p-4" data-testid="filters">
        <summary className="cursor-pointer list-none text-sm font-bold text-stone-800">
          {t("filters")} <span className="text-ink">▾</span>
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <label className={labelCls} htmlFor="f-q">
              {t("search_placeholder")}
            </label>
            <input id="f-q" data-testid="filter-q" className={inputCls} value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          </div>

          <div>
            <label className={labelCls} htmlFor="f-gov">
              {t("gov_label")}
            </label>
            <select
              id="f-gov"
              data-testid="filter-governorate"
              className={inputCls}
              value={filters.governorate_id}
              onChange={(e) => set({ governorate_id: e.target.value, city_id: "", district_id: "" })}
            >
              <option value="">—</option>
              {Object.values(places)
                .filter((p) => p.level === "governorate")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {locationName(p, locale)}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="f-city">
              {t("city_label")}
            </label>
            <select
              id="f-city"
              data-testid="filter-city"
              className={inputCls}
              value={filters.city_id}
              onChange={(e) => set({ city_id: e.target.value, district_id: "" })}
            >
              <option value="">—</option>
              {cities.map((p) => (
                <option key={p.id} value={p.id}>
                  {locationName(p, locale)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="f-min">
              {t("min")}
            </label>
            <input id="f-min" data-testid="filter-min-price" type="number" min={0} className={inputCls} value={filters.min_price} onChange={(e) => set({ min_price: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-max">
              {t("max")}
            </label>
            <input id="f-max" data-testid="filter-max-price" type="number" min={0} className={inputCls} value={filters.max_price} onChange={(e) => set({ max_price: e.target.value })} />
          </div>

          <div>
            <label className={labelCls} htmlFor="f-type">
              {t("property_type")}
            </label>
            <select id="f-type" data-testid="filter-property-type" className={inputCls} value={filters.property_type} onChange={(e) => set({ property_type: e.target.value })}>
              <option value="">—</option>
              {PROPERTY_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`spec.${x}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="f-rent">
              {t("rental_type")}
            </label>
            <select id="f-rent" className={inputCls} value={filters.rental_type} onChange={(e) => set({ rental_type: e.target.value })}>
              <option value="">—</option>
              <option value="residential">{t("spec.residential")}</option>
              <option value="commercial">{t("spec.commercial")}</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="f-furn">
              {t("furnished")}
            </label>
            <select id="f-furn" data-testid="filter-furnished" className={inputCls} value={filters.furnished} onChange={(e) => set({ furnished: e.target.value })}>
              <option value="">—</option>
              {FURNISHED.map((x) => (
                <option key={x} value={x}>
                  {t(`spec.${x}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="f-bed">
              {t("bedrooms")}
            </label>
            <input id="f-bed" data-testid="filter-bedrooms" type="number" min={0} max={30} className={inputCls} value={filters.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-bath">
              {t("bathrooms")}
            </label>
            <input id="f-bath" type="number" min={0} max={30} className={inputCls} value={filters.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-minarea">
              {t("min")} ({t("area_m2")})
            </label>
            <input id="f-minarea" type="number" min={0} className={inputCls} value={filters.min_area} onChange={(e) => set({ min_area: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-maxarea">
              {t("max")} ({t("area_m2")})
            </label>
            <input id="f-maxarea" type="number" min={0} className={inputCls} value={filters.max_area} onChange={(e) => set({ max_area: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-floor">
              {t("floor")}
            </label>
            <input id="f-floor" type="number" className={inputCls} value={filters.floor} onChange={(e) => set({ floor: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-from">
              {t("available_from")}
            </label>
            <input id="f-from" data-testid="filter-available-from" type="date" className={inputCls} value={filters.available_from} onChange={(e) => set({ available_from: e.target.value })} />
          </div>
          {districts.length > 0 && (
            <div>
              <label className={labelCls} htmlFor="f-district">
                {t("district_label")}
              </label>
              <select id="f-district" className={inputCls} value={filters.district_id} onChange={(e) => set({ district_id: e.target.value })}>
                <option value="">—</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {locationName(d, locale)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <span className={labelCls}>{t("amenities")}</span>
            <div className="flex flex-wrap gap-2" data-testid="filter-amenities">
              {AMENITY_KEYS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAmenity(a)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    filters.amenities.includes(a) ? "border-gold bg-brand-50 text-ink" : "border-stone-300 text-stone-600"
                  }`}
                >
                  {t(AMENITY_LABEL_KEY[a] || a)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-3">
          <div className="flex items-center gap-2">
            <label className={labelCls + " mb-0"} htmlFor="f-sort">
              {t("sort")}
            </label>
            <select
              id="f-sort"
              data-testid="filter-sort"
              className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
              value={filters.sort}
              onChange={(e) => set({ sort: e.target.value })}
            >
              <option value="newest">{t("sort_newest")}</option>
              <option value="price_asc">{t("sort_price_asc")}</option>
              <option value="price_desc">{t("sort_price_desc")}</option>
              <option value="area">{t("sort_area")}</option>
            </select>
          </div>
          {anyFilter && (
            <button
              type="button"
              data-testid="clear-filters"
              onClick={() => applyFilters({ ...EMPTY_FILTERS })}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              {t("clear_filters")}
            </button>
          )}
        </div>
      </details>

      {/* ── Mobile list/map toggle ──────────────────────────────── */}
      <div className="flex gap-2 lg:hidden">
        <button
          type="button"
          data-testid="tab-list"
          onClick={() => setMobileMap(false)}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${!mobileMap ? "bg-stone-900 text-white" : "bg-white text-stone-700 border border-stone-300"}`}
        >
          {t("list")}
        </button>
        <button
          type="button"
          data-testid="tab-map"
          onClick={() => setMobileMap(true)}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${mobileMap ? "bg-stone-900 text-white" : "bg-white text-stone-700 border border-stone-300"}`}
        >
          {t("map")}
        </button>
      </div>

      <p className="text-sm text-stone-500" data-testid="results-count">
        {items.length}
        {cursor ? "+" : ""} {t("results_count")}
      </p>

      {/* ── Results + map (shared state) ───────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={mobileMap ? "hidden lg:block" : "block"} aria-label={t("list")}>
          {loading ? (
            <CardSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={() => runSearch(filters)} />
          ) : items.length === 0 ? (
            <EmptyState title={t("no_results")} hint={t("no_results_hint")} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {items.map((item) => (
                <ListingCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  places={places}
                  eager={false}
                />
              ))}
            </div>
          )}
          {cursor && !loading && (
            <div ref={sentinelRef} className="py-6 text-center">
              <button
                type="button"
                data-testid="load-more"
                onClick={() => runSearch(filters, true)}
                className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                {loadingMore ? t("loading") : "↓"}
              </button>
            </div>
          )}
        </section>

        <section className={`relative ${mobileMap ? "block" : "hidden lg:block"}`} aria-label={t("map")}>
          <MapSection
            items={items}
            locale={locale}
            focus={focus}
            onBbox={(b) => setMapBbox(b)}
            heightClass="h-[65vh] lg:sticky lg:top-20"
          />
          {showAreaBtn && (
            <button
              type="button"
              data-testid="search-area"
              onClick={() => applyFilters({ ...filters, bbox: (mapBbox as [number, number, number, number]).map((n) => n.toFixed(5)).join(",") })}
              className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-lg ring-1 ring-stone-200 hover:bg-brand-50"
            >
              ↖ {t("search_this_area")}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
