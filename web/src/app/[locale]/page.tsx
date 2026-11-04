import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { CountUp, Reveal, Stagger } from "@/components/motion";
import { SearchBar } from "@/components/SearchBar";
import { makeT } from "@/lib/i18n";
import { fetchServer } from "@/lib/server";
import { LOCALES } from "@/lib/i18n";
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
  let governorates: Location[] = [];
  let cities: Location[] = [];
  try {
    const [res, govs, cityRows] = await Promise.all([
      fetchServer<SearchResult>("/listings?sort=newest&limit=12"),
      fetchServer<Location[]>("/locations?level=governorate"),
      fetchServer<Location[]>("/locations?level=city"),
    ]);
    latest = res;
    governorates = govs;
    cities = cityRows;
    places = Object.fromEntries([...govs, ...cityRows].map((x) => [x.id, x]));
  } catch {
    // Backend offline in build → render empty states (dev server still works).
  }

  const stats = [
    { value: 4, label: t("trust_stat_levels") },
    { value: 0, suffix: "%", label: t("trust_stat_commission") },
    { value: 3, label: t("trust_stat_tools") },
    { value: 24, label: t("trust_stat_review") },
  ];
  const steps = [t("how_step_one"), t("how_step_two"), t("how_step_three")];

  return (
    <div className="home-page space-y-12 sm:space-y-16">
      <section className="home-hero" data-testid="hero">
        <div className="home-hero-content">
          <p className="home-trust-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden className="shrink-0">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t("hero_trust_chip")}</span>
          </p>
          <h1 className="home-hero-title font-display">
            <span className="hero-title-line">{t("hero_title_start")}</span>{" "}
            <span className="hero-title-line hero-shimmer-word">{t("hero_title_gold")}</span>
          </h1>
          <p className="home-hero-subtitle">{t("hero_sub")}</p>
          <div className="hero-actions">
            <Link href={`/${l}/search`} className="hero-btn hero-btn-primary" data-testid="hero-browse">
              {t("nav_search")}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden className={l === "ar" ? "flip-rtl" : ""}>
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href={`/${l}/owner/new`} className="hero-btn hero-btn-ghost">
              {t("nav_add")}
            </Link>
          </div>
          <div className="hero-links">
            <Link href={`/${l}/how-it-works`} className="hero-link">{t("how_it_works")}</Link>
            <span aria-hidden className="hero-link-sep">·</span>
            <Link href={`/${l}/content-rules`} className="hero-link">{t("content_rules")}</Link>
          </div>
        </div>
        <div className="hero-glow" aria-hidden />
        <div className="hero-mark" aria-hidden>
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M11.5 22.4 24 12.2l12.5 10.2" stroke="var(--color-gold-light)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15.1 22.2v10.9a2.6 2.6 0 0 0 2.6 2.6h12.6a2.6 2.6 0 0 0 2.6-2.6V22.2" stroke="var(--color-gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="24" cy="30.5" r="2.4" fill="var(--color-gold)" />
          </svg>
        </div>
      </section>

      <div className="home-search-overlap">
        <SearchBar compact governorates={governorates} cities={cities} />
      </div>

      <Stagger as="section" aria-label={t("hero_trust_chip")} className="trust-strip">
        {stats.map((stat) => (
          <article key={stat.label} className="trust-stat-card">
            <strong className="trust-stat-value font-display"><CountUp value={stat.value} locale={l} suffix={"suffix" in stat ? stat.suffix : ""} /></strong>
            <span>{stat.label}</span>
          </article>
        ))}
      </Stagger>

      <section aria-labelledby="latest-h" data-testid="latest-listings">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{t("nav_search")}</p>
            <h2 id="latest-h" className="section-title font-display">{t("latest_listings")}</h2>
          </div>
          <Link href={`/${l}/search`} className="btn-ghost shrink-0 px-4 py-2 text-sm" data-testid="view-all">
            {l === "ar" ? "←" : "→"} {t("view_all")}
          </Link>
        </div>
        {latest.items.length === 0 ? (
          <Reveal as="p" className="empty-state rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-muted shadow-card" data-testid="empty-state">
            {t("no_results")}
          </Reveal>
        ) : (
          <Stagger className="listing-grid" key={`home-listings-${latest.items.length}`}>
            {latest.items.map((item, i) => (
              <ListingCard key={item.id} item={item} locale={l} places={places} eager={i < 3} />
            ))}
          </Stagger>
        )}
      </section>

      <Reveal as="section" aria-labelledby="how-home-title" className="home-how">
        <div className="mb-5">
          <p className="eyebrow">{t("how_it_works")}</p>
          <h2 id="how-home-title" className="section-title font-display">{t("how_it_works")}</h2>
        </div>
        <Stagger className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step} className="how-card surface-card">
              <span className="how-number font-display">{l === "ar" ? ["٠١", "٠٢", "٠٣"][index] : `0${index + 1}`}</span>
              <p>{step}</p>
            </article>
          ))}
        </Stagger>
      </Reveal>

      <Reveal as="section" className="home-cta" aria-label={t("cta_home_title")}>
        <div>
          <p className="eyebrow">{t("cta_home_sub")}</p>
          <h2 className="font-display text-2xl font-bold sm:text-3xl">{t("cta_home_title")}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-gold-text">{t("home_contract_notice")}</p>
        </div>
        <Link href={`/${l}/owner/new`} className="btn-secondary shrink-0">
          {t("nav_add")}
        </Link>
      </Reveal>
    </div>
  );
}
