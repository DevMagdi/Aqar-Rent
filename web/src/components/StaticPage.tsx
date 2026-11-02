// Shared template for the six static pages (i18n, RTL-safe, canonical SEO).
import type { Metadata } from "next";
import { makeT } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function staticMetadata(locale: Locale, slug: string, titleKey: string): Metadata {
  const t = makeT(locale);
  const title = t(titleKey);
  return {
    title,
    alternates: {
      canonical: `/${locale}/${slug}`,
      languages: { ar: `/ar/${slug}`, en: `/en/${slug}`, "x-default": `/ar/${slug}` },
    },
  };
}

export function StaticPage({
  locale,
  titleKey,
  children,
}: {
  locale: Locale;
  titleKey: string;
  children: React.ReactNode;
}) {
  const t = makeT(locale);
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">{t(titleKey)}</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-stone-700">{children}</div>
      <p className="mt-8 rounded-xl bg-brand-50 p-4 text-sm text-brand-700">{t("static_coming")}</p>
    </article>
  );
}
