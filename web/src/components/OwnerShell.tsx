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
  active: (p: string) => boolean;
}

export function OwnerShell({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const pathname = usePathname() || "/";

  const items: Item[] = [
    { href: `/${locale}/owner`, label: t("dashboard_title"), testid: "side-dashboard", active: (p) => p === `/${locale}/owner` },
    { href: `/${locale}/owner/new`, label: t("add_listing"), testid: "side-new", active: (p) => p === `/${locale}/owner/new` || new RegExp(`^/${locale}/owner/[0-9a-f-]+/edit$`).test(p) },
    { href: `/${locale}/owner/verification`, label: t("verification"), testid: "side-verification", active: (p) => p.startsWith(`/${locale}/owner/verification`) },
    { href: `/${locale}/owner/orders`, label: t("orders_title"), testid: "side-orders", active: (p) => p.startsWith(`/${locale}/owner/orders`) },
    { href: `/${locale}/contracts`, label: t("contracts"), testid: "side-contracts", active: (p) => p.startsWith(`/${locale}/contracts`) },
    { href: `/${locale}/favorites`, label: t("favorites_title"), testid: "side-favorites", active: (p) => p.startsWith(`/${locale}/favorites`) },
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
              className={`relative rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "bg-sidebar-active-bg text-sidebar-active"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
              }`}
            >
              {active && (
                <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-gold" data-testid="side-indicator" />
              )}
              {it.label}
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
                className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 pe-3 ps-4 text-xs font-semibold transition-colors duration-150 ${
                  active ? "bg-sidebar-active-bg text-sidebar-active" : "text-sidebar-muted"
                }`}
              >
                {active && <span aria-hidden className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-gold" />}
                {it.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}
