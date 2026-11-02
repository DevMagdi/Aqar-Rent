// Shared template for the public information pages (i18n, RTL-safe, canonical SEO).
// No "coming soon" placeholders: every page ships complete, honest content.
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
      <div className="mt-6 space-y-4 leading-relaxed text-stone-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-stone-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:ps-6">
        {children}
      </div>
      <p className="mt-8 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-800">
        {t("static_contact_note")}{" "}
        <a className="font-bold underline underline-offset-2" href={`/${locale}/support`}>
          {t("nav_support")}
        </a>
      </p>
    </article>
  );
}
