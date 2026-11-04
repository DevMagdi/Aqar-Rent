"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatedPresence } from "./motion";
import { useAuth, useI18n, useToast } from "./Providers";
import { ThemeToggle } from "./ThemeToggle";
import { BrandMark } from "./BrandMark";

type NavIconName = "search" | "building" | "tag" | "doc" | "grid" | "heart" | "bell" | "user" | "briefcase";

const NAV_PATHS: Record<NavIconName, string> = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
  building: "M4 3h10v18H4zM14 9h6v12h-6M7 7h4M7 11h4M7 15h4M17 13h1M17 17h1",
  tag: "M12 3H5v7l9 9 7-7-9-9ZM8 7.7v.1",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  heart: "M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z",
  bell: "M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6ZM10 20a2 2 0 0 0 4 0",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4.5 21a7.5 7.5 0 0 1 15 0",
  briefcase: "M4 8h16v12H4zM9 8V5h6v3M4 13h16",
};

/** "+201000000101" → "01000000101" (local Egyptian format, RTL-safe). */
function localPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return `0${digits.slice(2)}`;
  return digits;
}

function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d={NAV_PATHS[name]} />
    </svg>
  );
}

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
    { href: `/${locale}/search`, label: t("nav_search"), icon: "search" as NavIconName },
    { href: `/${locale}/offices`, label: t("nav_agencies"), icon: "building" as NavIconName },
    { href: `/${locale}/pricing`, label: t("nav_pricing"), icon: "tag" as NavIconName },
    { href: `/${locale}/contracts`, label: t("contracts"), icon: "doc" as NavIconName },
  ];
  // Signed in: dashboards + favourites are the primary destinations, so they
  // replace the public discovery links instead of being appended to them
  // (that was what pushed notifications/account off the screen).
  const authNav = user
    ? [
        { href: `/${locale}/owner`, label: t("nav_dashboard"), icon: "grid" as NavIconName },
        { href: `/${locale}/favorites`, label: t("nav_favorites"), icon: "heart" as NavIconName },
        { href: `/${locale}/offices`, label: t("nav_agencies"), icon: "building" as NavIconName },
        { href: `/${locale}/contracts`, label: t("contracts"), icon: "doc" as NavIconName },
      ]
    : [];
  const items = user ? authNav : nav;

  return (
    <header className={`site-header sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-xl${scrolled ? " is-scrolled" : ""}`}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-bold text-ink" data-testid="brand" aria-label={t("brand")}>
          <BrandMark wordmark={t("brand")} />
        </Link>

        <nav ref={desktopNavRef} className="site-main-nav relative hidden items-center gap-0.5 xl:flex" aria-label="main">
          <span aria-hidden className={`nav-sliding-indicator${navIndicator.rtl ? " is-rtl" : ""}`} style={{ "--nav-offset": `${navIndicator.offset}px`, "--nav-width": `${navIndicator.width}px`, opacity: navIndicator.visible ? 1 : 0 } as CSSProperties} />
          {items.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`site-nav-link relative flex items-center gap-1.5 whitespace-nowrap rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150 ${
                  active ? "bg-gold-tint-14 font-semibold text-ink" : "text-muted hover:bg-track hover:text-ink"
                }`}
              >
                <NavIcon name={n.icon} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ms-auto flex items-center gap-1.5">
          {user && (
            <Link
              href={`/${locale}/notifications`}
              data-testid="nav-notifications"
              aria-label={unread ? `${t("nav_notifications")} (${unread})` : t("nav_notifications")}
              className="icon-button relative rounded-[10px] text-muted transition-colors hover:bg-track hover:text-ink"
            >
              <NavIcon name="bell" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-verified px-1 text-[10px] font-bold text-on-dark">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
          <ThemeToggle />
          <Link
            href={otherHref}
            hrefLang={otherLocale}
            lang={otherLocale}
            aria-label={t("nav_language")}
            title={t("nav_language")}
            className="btn-ghost gap-1.5 px-3 py-2 text-sm"
            data-testid="lang-switch"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="shrink-0">
              <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" />
            </svg>
            <span className="hidden sm:inline">{t("lang_switch")}</span>
          </Link>
          {ready &&
            (user ? (
              <Link
                href={`/${locale}/account`}
                data-testid="nav-account"
                className="hidden items-center gap-2 rounded-pill border border-border-strong bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-verified lg:inline-flex"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gold text-[12px] font-bold text-gold-text" aria-hidden>
                  {user.full_name ? user.full_name.slice(0, 1).toUpperCase() : <NavIcon name="user" />}
                </span>
                <span className="max-w-[8rem] truncate tabular-nums" dir="auto">
                  {user.full_name || localPhone(user.phone) || t("nav_account")}
                </span>
              </Link>
            ) : (
              <Link
                href={`/${locale}/login`}
                data-testid="login-link"
                className="btn-ghost px-4 py-2 text-sm"
              >
                {t("nav_login")}
              </Link>
            ))}
          {user && (
            <button
              type="button"
              data-testid="logout"
              onClick={async () => {
                await logout();
                toast.show(t("nav_logout"));
              }}
              className="btn-ghost hidden px-3 py-2 text-sm xl:inline-flex"
            >
              {t("nav_logout")}
            </button>
          )}
          <Link href={`/${locale}/owner/new`} className="btn-primary hidden px-4 py-2 text-sm sm:inline-flex" data-testid="add-listing-cta">
            {t("nav_add")}
          </Link>
          <button
            type="button"
            aria-label={open ? t("nav_close_menu") : t("nav_menu")}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            data-tap-target
            className="press grid h-11 w-11 place-items-center rounded-[var(--radius-field)] border border-border-strong bg-surface text-ink min-[900px]:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>
      <AnimatedPresence present={open} className="mobile-menu-presence min-[900px]:hidden">
        <button type="button" className="mobile-nav-scrim" aria-label={t("nav_close_menu")} onClick={() => setOpen(false)} />
        <nav id="mobile-navigation" className="mobile-nav-drawer absolute inset-inline-0 max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-border bg-surface px-4 pb-5 pt-2 shadow-pop min-[900px]:hidden" aria-label="mobile">
          {items.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`mobile-nav-item flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                  active ? "bg-gold-tint-14 font-semibold text-ink" : "text-ink hover:bg-track"
                }`}
              >
                <NavIcon name={n.icon} />
                {n.label}
              </Link>
            );
          })}
          {user && (
            <Link href={`/${locale}/notifications`} onClick={() => setOpen(false)} className="mobile-nav-item flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-track">
              <NavIcon name="bell" />
              {t("nav_notifications")}
              {unread > 0 && <span className="ms-auto rounded-full bg-verified px-2 py-0.5 text-[11px] font-bold text-on-dark">{unread}</span>}
            </Link>
          )}
          {user && (
            <Link href={`/${locale}/office`} onClick={() => setOpen(false)} className="mobile-nav-item flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-track">
              <NavIcon name="briefcase" />
              {t("nav_offices")}
            </Link>
          )}
          {user && (
            <Link href={`/${locale}/account`} onClick={() => setOpen(false)} className="mobile-nav-item flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-track">
              <NavIcon name="user" />
              {t("nav_account")}
            </Link>
          )}
          {!user && (
            <Link href={`/${locale}/login`} onClick={() => setOpen(false)} className="mobile-nav-item flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-track">
              <NavIcon name="user" />
              {t("nav_login")}
            </Link>
          )}
          <Link href={`/${locale}/owner/new`} onClick={() => setOpen(false)} className="mobile-nav-cta btn-primary mt-3 flex min-h-12 justify-center">{t("nav_add")}</Link>
          {user && (
            <button
              type="button"
              onClick={async () => { setOpen(false); await logout(); toast.show(t("nav_logout")); }}
              className="mobile-nav-item mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border-strong text-sm font-semibold text-muted"
            >
              {t("nav_logout")}
            </button>
          )}
        </nav>
      </AnimatedPresence>
    </header>
  );
}
