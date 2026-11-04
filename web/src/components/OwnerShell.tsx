"use client";
// Mantiq owner-area shell: dark navy sidebar + gold active state with a
// 3px inline-start indicator (RTL-correct via start-*). Public pages keep the
// light header; owner/contracts areas sit inside this shell.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useI18n } from "./Providers";

interface Item {
  href: string;
  label: string;
  testid: string;
  icon: "grid" | "plus" | "badge" | "receipt" | "doc" | "heart";
  active: (p: string) => boolean;
}

/** Owner-area icons — 1.7px stroke on the current colour, no icon dependency. */
function OwnerIcon({ name }: { name: Item["icon"] }) {
  const paths: Record<Item["icon"], string> = {
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    plus: "M12 5v14M5 12h14",
    badge: "M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM8.5 13l-1 7L12 17.5 16.5 20l-1-7",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6",
    doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
    heart: "M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z",
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 opacity-90">
      <path d={paths[name]} />
    </svg>
  );
}

export function OwnerShell({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const pathname = usePathname() || "/";

  const items: Item[] = [
    { href: `/${locale}/owner`, label: t("dashboard_title"), testid: "side-dashboard", icon: "grid", active: (p) => p === `/${locale}/owner` },
    { href: `/${locale}/owner/new`, label: t("add_listing"), testid: "side-new", icon: "plus", active: (p) => p === `/${locale}/owner/new` || new RegExp(`^/${locale}/owner/[0-9a-f-]+/edit$`).test(p) },
    { href: `/${locale}/owner/verification`, label: t("verification"), testid: "side-verification", icon: "badge", active: (p) => p.startsWith(`/${locale}/owner/verification`) },
    { href: `/${locale}/owner/orders`, label: t("orders_title"), testid: "side-orders", icon: "receipt", active: (p) => p.startsWith(`/${locale}/owner/orders`) },
    { href: `/${locale}/contracts`, label: t("contracts"), testid: "side-contracts", icon: "doc", active: (p) => p.startsWith(`/${locale}/contracts`) },
    { href: `/${locale}/favorites`, label: t("favorites_title"), testid: "side-favorites", icon: "heart", active: (p) => p.startsWith(`/${locale}/favorites`) },
  ];

  return (
    <div className="flex gap-6" data-testid="owner-shell">
      <aside
        className="sticky top-20 hidden h-fit w-56 shrink-0 flex-col gap-1 self-start rounded-[var(--radius-card)] bg-sidebar p-3 text-sidebar-text shadow-card lg:flex"
        data-testid="owner-sidebar"
      >
        <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-widest text-sidebar-muted">{t("nav_dashboard")}</p>
        {items.map((it) => {
          const active = it.active(pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              data-testid={it.testid}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "bg-sidebar-active-bg text-sidebar-active"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
              }`}
            >
              {active && (
                <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-gold" data-testid="side-indicator" />
              )}
              <OwnerIcon name={it.icon} />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </aside>
      {/* mobile: horizontal scroll strip with the same active treatment */}
      <div className="min-w-0 flex-1">
        <nav className="mb-3 flex gap-1.5 overflow-x-auto rounded-[var(--radius-card)] bg-sidebar p-1.5 lg:hidden" aria-label="owner">
          {items.map((it) => {
            const active = it.active(pathname);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`relative flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 pe-3 ps-4 text-xs font-semibold transition-colors duration-150 ${
                  active ? "bg-sidebar-active-bg text-sidebar-active" : "text-sidebar-muted"
                }`}
              >
                {active && <span aria-hidden className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-gold" />}
                <OwnerIcon name={it.icon} />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}
