"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatedPresence } from "./motion";
import { useAuth, useI18n, useToast } from "./Providers";
import { ThemeToggle } from "./ThemeToggle";
import { BrandMark } from "./BrandMark";

export function Header() {
  const { locale, t, otherLocale, otherHref } = useI18n();
  const { user, ready, logout } = useAuth();
  const pathname = usePathname() || "/";
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const desktopNavRef = useRef<HTMLElement | null>(null);
  const [navIndicator, setNavIndicator] = useState({ offset: 0, width: 0, visible: false, rtl: false });

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const navElement = desktopNavRef.current;
    if (!navElement) return;
    const update = () => {
      const active = navElement.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) { setNavIndicator((current) => ({ ...current, visible: false })); return; }
      const navRect = navElement.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const rtl = getComputedStyle(navElement).direction === "rtl";
      const offset = rtl ? navRect.right - activeRect.right : activeRect.left - navRect.left;
      setNavIndicator({ offset: rtl ? -offset : offset, width: activeRect.width, visible: true, rtl });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(navElement);
    return () => observer.disconnect();
  }, [pathname, locale, user, unread]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
    { href: `/${locale}/search`, label: t("nav_search") },
    { href: `/${locale}/office`, label: t("nav_agencies") },
    { href: `/${locale}/pricing`, label: t("nav_pricing") },
    { href: `/${locale}/contracts`, label: t("contracts") },
  ];
  const authNav = user
    ? [
        { href: `/${locale}/owner`, label: t("nav_dashboard") },
        { href: `/${locale}/favorites`, label: t("nav_favorites") },
        { href: `/${locale}/notifications`, label: unread ? `${t("nav_notifications")} (${unread})` : t("nav_notifications") },
        { href: `/${locale}/office`, label: t("nav_offices") },
        { href: `/${locale}/account`, label: t("nav_account") },
      ]
    : [];

  return (
    <header className={`site-header sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur${scrolled ? " is-scrolled" : ""}`}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-bold text-ink" data-testid="brand" aria-label={t("brand")}>
          <BrandMark wordmark={t("brand")} />
        </Link>

        <nav ref={desktopNavRef} className="site-main-nav relative hidden items-center gap-1 min-[900px]:flex" aria-label="main">
          <span aria-hidden className={`nav-sliding-indicator${navIndicator.rtl ? " is-rtl" : ""}`} style={{ "--nav-offset": `${navIndicator.offset}px`, "--nav-width": `${navIndicator.width}px`, opacity: navIndicator.visible ? 1 : 0 } as CSSProperties} />
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={`site-nav-link relative rounded-xl px-3 py-2.5 pe-3 ps-4 text-sm font-medium transition-colors duration-150 ${
                pathname === n.href
                  ? "bg-gold-tint-14 font-semibold text-ink"
                  : "text-muted hover:bg-track hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
          {authNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={`site-nav-link relative rounded-xl px-3 py-2.5 pe-3 ps-4 text-sm font-medium transition-colors duration-150 ${
                pathname === n.href
                  ? "bg-gold-tint-14 font-semibold text-ink"
                  : "text-muted hover:bg-track hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={otherHref}
            hrefLang={otherLocale}
            className="btn-ghost px-3 py-2 text-sm"
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
                className="btn-ghost hidden px-4 py-2 text-sm sm:inline-flex"
              >
                {t("nav_logout")}
              </button>
            ) : (
              <Link
                href={`/${locale}/login`}
                data-testid="login-link"
                className="btn-ghost px-4 py-2 text-sm max-[640px]:hidden"
              >
                {t("nav_login")}
              </Link>
            ))}
          <Link href={`/${locale}/owner/new`} className="btn-primary hidden px-4 py-2 text-sm sm:inline-flex" data-testid="add-listing-cta">
            {t("nav_add")}
          </Link>
          <button
            type="button"
            aria-label="menu"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            className="press grid h-11 w-11 place-items-center rounded-lg border border-border-strong min-[900px]:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
      <AnimatedPresence present={open} className="mobile-menu-presence min-[900px]:hidden">
        <button type="button" className="mobile-nav-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
        <nav id="mobile-navigation" className="mobile-nav-drawer absolute inset-inline-0 border-t border-border bg-surface px-4 py-2 shadow-pop min-[900px]:hidden" aria-label="mobile">
          {[...nav, ...authNav].map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="mobile-nav-item link-underline block min-h-11 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-track">
              {n.label}
            </Link>
          ))}
          {!user && <Link href={`/${locale}/login`} onClick={() => setOpen(false)} className="mobile-nav-item link-underline block min-h-11 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-track">{t("nav_login")}</Link>}
          <Link href={`/${locale}/owner/new`} onClick={() => setOpen(false)} className="mobile-nav-cta btn-primary mt-2 flex min-h-11 justify-center">{t("nav_add")}</Link>
        </nav>
      </AnimatedPresence>
    </header>
  );
}
