"use client";
import Link from "next/link";
import { useI18n } from "./Providers";

export function Footer() {
  const { locale, t } = useI18n();
  const links = [
    { href: `/${locale}/about`, label: t("about") },
    { href: `/${locale}/how-it-works`, label: t("how_it_works") },
    { href: `/${locale}/terms`, label: t("terms") },
    { href: `/${locale}/privacy`, label: t("privacy") },
    { href: `/${locale}/content-rules`, label: t("content_rules") },
    { href: `/${locale}/support`, label: t("support") },
  ];
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-bold text-brand-600">{t("brand")}</p>
          <p className="text-sm text-stone-500">{t("tagline")}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600" aria-label="footer">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-brand-600">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
