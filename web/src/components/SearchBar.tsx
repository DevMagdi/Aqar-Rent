"use client";
// Hero search bar + quick filters (home page).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "./Providers";

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (type) params.set("property_type", type);
    router.push(`/${locale}/search?${params.toString()}`);
  }

  const chips = ["apartment", "studio", "villa", "room", "shop"];

  return (
    <div className={compact ? "" : "rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7"}>
      {!compact && (
        <>
          <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">{t("hero_title")}</h1>
          <p className="mt-1.5 text-sm text-stone-600 sm:text-base">{t("hero_sub")}</p>
        </>
      )}
      <form onSubmit={submit} role="search" className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="home-q">
          {t("search_placeholder")}
        </label>
        <input
          id="home-q"
          data-testid="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search_placeholder")}
          className="w-full flex-1 rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-base outline-none focus:border-brand-500 focus:bg-white"
        />
        <button
          type="submit"
          data-testid="search-submit"
          className="rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white hover:bg-brand-700"
        >
          {t("nav_search")}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-stone-500">{t("quick_filters")}:</span>
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            data-testid={`quick-${c}`}
            onClick={() => {
              setType(c);
              const params = new URLSearchParams();
              params.set("property_type", c);
              if (q.trim()) params.set("q", q.trim());
              router.push(`/${locale}/search?${params.toString()}`);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              type === c ? "border-brand-600 bg-brand-50 text-brand-700" : "border-stone-300 bg-white text-stone-700 hover:border-brand-500"
            }`}
          >
            {t(`spec.${c}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
