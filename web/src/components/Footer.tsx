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
    { href: `/${locale}/pricing`, label: t("pricing") },
    { href: `/${locale}/content-rules`, label: t("content_rules") },
    { href: `/${locale}/support`, label: t("support") },
  ];
  return (
    <footer className="border-t border-gold/35 bg-brand-deep text-on-dark" data-theme-surface>
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <p className="font-display text-lg font-bold text-on-dark">{t("brand")}</p>
          <p className="mt-1 text-sm text-on-dark/75">{t("tagline")}</p>
          <p className="mt-3 text-xs leading-relaxed text-on-dark/70">{t("home_contract_notice")}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-on-dark/80" aria-label="footer">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="link-underline hover:text-gold-light">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
