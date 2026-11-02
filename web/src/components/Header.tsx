"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useI18n, useToast } from "./Providers";

export function Header() {
  const { locale, t, otherLocale, otherHref } = useI18n();
  const { user, ready, logout } = useAuth();
  const pathname = usePathname() || "/";
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    import("@/lib/api")
      .then(({ api }) => api<{ unread_count: number }>("/notifications?limit=1"))
      .then((p) => alive && setUnread(p.unread_count || 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, pathname]);

  const nav = [
    { href: `/${locale}`, label: t("nav_home") },
    { href: `/${locale}/search`, label: t("nav_search") },
    { href: `/${locale}/owner/new`, label: t("nav_add") },
    { href: `/${locale}/pricing`, label: t("nav_pricing") },
  ];
  const authNav = user
    ? [
        { href: `/${locale}/owner`, label: t("nav_dashboard") },
        { href: `/${locale}/favorites`, label: t("nav_favorites") },
        { href: `/${locale}/notifications`, label: unread ? `${t("nav_notifications")} (${unread})` : t("nav_notifications") },
        { href: `/${locale}/contracts`, label: t("contracts") },
        { href: `/${locale}/office`, label: t("nav_offices") },
        { href: `/${locale}/account`, label: t("nav_account") },
      ]
    : [];

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-bold text-brand-600" data-testid="brand">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">ع</span>
          <span>{t("brand")}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="main">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-100 ${
                pathname === n.href ? "text-brand-600" : "text-stone-700"
              }`}
            >
              {n.label}
            </Link>
          ))}
          {authNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-100 ${
                pathname === n.href ? "text-brand-600" : "text-stone-700"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <Link
            href={otherHref}
            hrefLang={otherLocale}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
            data-testid="lang-switch"
          >
            {t("lang_switch")}
          </Link>
          {ready &&
            (user ? (
              <button
                type="button"
                data-testid="logout"
                onClick={async () => {
                  await logout();
                  toast.show(t("nav_logout"));
                }}
                className="hidden rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 sm:block"
              >
                {t("nav_logout")}
              </button>
            ) : (
              <Link
                href={`/${locale}/login`}
                data-testid="login-link"
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                {t("nav_login")}
              </Link>
            ))}
          <button
            type="button"
            className="rounded-lg border border-stone-300 p-2 md:hidden"
            aria-label="menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-stone-200 bg-white px-4 py-2 md:hidden" aria-label="mobile">
          {[...nav, ...authNav].map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-lg px-2 py-2.5 text-sm text-stone-800 hover:bg-stone-100">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
