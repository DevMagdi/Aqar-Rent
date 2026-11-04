"use client";
// Home search surface: UI values are mapped to the existing search URL filters.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useI18n } from "./Providers";
import type { Location } from "@/lib/types";

export function SearchBar({
  compact = false,
  governorates = [],
  cities = [],
}: {
  compact?: boolean;
  governorates?: Location[];
  cities?: Location[];
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [governorate, setGovernorate] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const cityOptions = useMemo(() => {
    const linked = cities.some((item) => Boolean((item as Location & { parent_id?: string }).parent_id));
    return !governorate || !linked
      ? cities
      : cities.filter((item) => (item as Location & { parent_id?: string }).parent_id === governorate);
  }, [cities, governorate]);

  function submit(e?: React.FormEvent, quickType?: string) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (governorate) params.set("governorate_id", governorate);
    if (city) params.set("city_id", city);
    if (quickType || type) params.set("property_type", quickType || type);
    if (minPrice) params.set("min_price", minPrice);
    if (maxPrice) params.set("max_price", maxPrice);
    const query = params.toString();
    router.push(`/${locale}/search${query ? `?${query}` : ""}`);
  }

  const chips = ["apartment", "studio", "villa", "room", "shop"];
  const field = "w-full min-h-12 rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-sm font-semibold text-ink outline-none transition focus:border-gold focus:bg-surface";
  const label = "mb-1 block text-[11px] font-semibold text-muted";

  return (
    <div className={compact ? "" : "rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-card sm:p-7"}>
      {!compact && (
        <>
          <h1 className="font-display text-2xl font-bold text-ink-strong sm:text-3xl">{t("hero_title")}</h1>
          <p className="mt-1.5 text-sm text-muted sm:text-base">{t("hero_sub")}</p>
        </>
      )}
      <form onSubmit={(e) => submit(e)} role="search" className="hero-search-grid mt-0 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
        <div>
          <label className={label} htmlFor="home-governorate">{t("gov_label")}</label>
          <select
            id="home-governorate"
            data-testid="search-input"
            className={field}
            value={governorate}
            onChange={(e) => { setGovernorate(e.target.value); setCity(""); }}
          >
            <option value="">{t("all_governorates")}</option>
            {governorates.map((item) => <option key={item.id} value={item.id}>{locale === "ar" ? item.name_ar : item.name_en}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="home-city">{t("city_label")}</label>
          <select id="home-city" className={field} value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{t("all_cities")}</option>
            {cityOptions.map((item) => <option key={item.id} value={item.id}>{locale === "ar" ? item.name_ar : item.name_en}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="home-type">{t("property_type")}</label>
          <select id="home-type" className={field} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("all_types")}</option>
            {chips.map((item) => <option key={item} value={item}>{t(`spec.${item}`)}</option>)}
          </select>
        </div>
        <fieldset className="min-w-0">
          <legend className={label}>{t("budget")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label={t("min")} type="number" min={0} inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder={t("min")} className={field} />
            <input aria-label={t("max")} type="number" min={0} inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder={t("max")} className={field} />
          </div>
        </fieldset>
        <button type="submit" data-testid="search-submit" className="btn-primary min-h-12 w-full gap-2 self-end whitespace-nowrap px-6 text-base lg:w-auto">
          {t("nav_search")}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">{t("quick_filters")}</span>
        {chips.map((item) => {
          const active = type === item;
          return (
            <button
              key={item}
              type="button"
              data-testid={`quick-${item}`}
              aria-pressed={active}
              onClick={() => { setType(item); submit(undefined, item); }}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-brand-deep bg-brand-deep text-gold-light"
                  : "border-border-strong bg-surface text-ink hover:border-verified hover:bg-gold-tint-8"
              }`}
            >
              {t(`spec.${item}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
