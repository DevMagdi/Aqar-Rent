// Admin shell: sidebar with role-based menu, topbar, toast host.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, clearSession, getRole } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { AnimatedPresence } from "./motion";
import { BrandMark } from "./BrandMark";

interface NavItem {
  to: string;
  label: string;
  roles: string[];
}
export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", roles: ["super_admin", "finance", "moderator"] },
  { to: "/moderation", label: "Moderation", roles: ["super_admin", "moderator"] },
  { to: "/verifications", label: "Verifications", roles: ["super_admin", "moderator"] },
  { to: "/reports", label: "Reports", roles: ["super_admin", "moderator"] },
  { to: "/users", label: "Users", roles: ["super_admin", "moderator"] },
  { to: "/payments", label: "Payments", roles: ["super_admin", "finance"] },
  { to: "/bank-transfers", label: "Bank transfers", roles: ["super_admin", "finance"] },
  { to: "/plans", label: "Plans & promos", roles: ["super_admin"] },
  { to: "/growth-plans", label: "Subscriptions & packages", roles: ["super_admin"] },
  { to: "/growth-offices", label: "Offices", roles: ["super_admin", "moderator"] },
  { to: "/growth-appeals", label: "Appeals", roles: ["super_admin", "moderator"] },
  { to: "/growth-reconciliation", label: "Reconciliation", roles: ["super_admin", "finance"] },
  { to: "/staff", label: "Staff & roles", roles: ["super_admin"] },
  { to: "/audit", label: "Audit log", roles: ["super_admin"] },
  { to: "/settings", label: "Settings", roles: ["super_admin", "moderator", "finance"] },
];

interface Ctx {
  toast: (text: string, kind?: "ok" | "err") => void;
  role: string;
}
const ShellCtx = createContext<Ctx>({ toast: () => {}, role: "" });
export function useShell() {
  return useContext(ShellCtx);
}

export function Shell({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string; kind: "ok" | "err" }[]>([]);
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);
  const role = getRole() || me?.role || "";
  const nav = useNavigate();
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState({ top: 0, height: 0, visible: false });
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const element = navRef.current;
    if (!element) return;
    const update = () => {
      const active = element.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) { setIndicator((current) => ({ ...current, visible: false })); return; }
      setIndicator({ top: active.offsetTop, height: active.offsetHeight, visible: true });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [location.pathname, role]);

  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = document.getElementById("admin-mobile-navigation");
    const focusable = () => drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = [...focusable()];
      if (!elements.length) return;
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      mobileMenuTriggerRef.current?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, text, kind }]);
    setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), 4000);
  }, []);

  useEffect(() => {
    api<{ email: string; role: string }>("/admin/auth/me")
      .then(setMe)
      .catch(() => {});
  }, []);

  const ctx = useMemo(() => ({ toast, role }), [toast, role]);

  return (
    <ShellCtx.Provider value={ctx}>
      <div className="flex min-h-screen bg-bg">
        <aside
          className="admin-sidebar fixed inset-y-0 start-0 z-40 flex w-[250px] flex-col border-e border-sidebar-hover bg-sidebar text-sidebar-text max-lg:hidden"
          data-testid="admin-sidebar"
        >
          <div className="flex h-[72px] items-center border-b border-sidebar-hover px-5">
            <BrandMark />
          </div>
          <nav ref={navRef} className="admin-nav relative flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="admin">
            <span
              aria-hidden
              className="nav-shared-indicator"
              data-testid="nav-indicator"
              style={{ "--indicator-y": `${indicator.top}px`, "--indicator-height": `${indicator.height}px`, opacity: indicator.visible ? 1 : 0 } as CSSProperties}
            />
            {NAV.filter((n) => n.roles.includes(role)).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={`nav-${n.to.replace(/\//g, "") || "dashboard"}`}
                className={({ isActive }) =>
                  `relative block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-sidebar-active-bg text-sidebar-active"
                      : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-sidebar-hover p-4">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-sidebar-hover/60 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-light to-gold-dark font-display text-lg font-bold text-gold-text">
                {(me?.email || role || "A").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-sidebar-muted" data-testid="admin-email">
                  {me?.email || "…"}
                </p>
                <p className="text-[11px] font-bold uppercase text-sidebar-active" data-testid="admin-role">
                  {role}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="btn-logout"
              onClick={() => {
                clearSession();
                nav("/login");
              }}
              className="mt-2 w-full rounded-xl border border-sidebar-hover py-1.5 text-xs font-semibold text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-text"
            >
              Log out
            </button>
          </div>
        </aside>

        <div className="flex-1 lg:ps-[250px]">
          <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-border bg-surface px-5 sm:px-[30px]">
            <div className="flex items-center gap-3">
              <button
                ref={mobileMenuTriggerRef}
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileOpen}
                aria-controls="admin-mobile-navigation"
                data-testid="admin-mobile-menu"
                className="press grid h-11 w-11 place-items-center rounded-xl border border-border-strong text-ink lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-bold text-ink-strong">Operations console</h2>
                <p className="text-xs text-muted">{new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(new Date())}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <span className="hidden rounded-full bg-gold-tint-12 px-3 py-1.5 text-xs font-bold uppercase text-ink sm:block">{role}</span>
            </div>
          </header>
          <main className="space-y-5 p-5 sm:p-[30px]"><div key={location.pathname} className="page-enter">{children}</div></main>
        </div>

        <AnimatedPresence present={mobileOpen} className="admin-mobile-presence lg:hidden">
          <>
            <button type="button" className="admin-mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
            <aside id="admin-mobile-navigation" className="admin-mobile-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation">
              <div className="flex h-[72px] items-center justify-between border-b border-sidebar-hover px-5">
                <BrandMark />
                <button type="button" aria-label="Close navigation" className="press grid h-11 w-11 place-items-center rounded-xl border border-sidebar-hover" onClick={() => setMobileOpen(false)}>
                  <span aria-hidden>×</span>
                </button>
              </div>
              <nav className="admin-mobile-nav flex-1 space-y-1 overflow-y-auto p-3" aria-label="admin mobile">
                {NAV.filter((n) => n.roles.includes(role)).map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => `admin-mobile-nav-item block rounded-xl px-4 py-3 text-sm font-semibold ${isActive ? "bg-sidebar-active-bg text-sidebar-active" : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"}`}
                  >
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <button
                type="button"
                data-testid="btn-logout-mobile"
                onClick={() => { clearSession(); setMobileOpen(false); nav("/login"); }}
                className="m-4 min-h-11 rounded-xl border border-sidebar-hover text-sm font-semibold text-sidebar-muted"
              >
                Log out
              </button>
            </aside>
          </>
        </AnimatedPresence>

        <div className="fixed bottom-5 start-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
          {items.map((i) => (
            <div
              key={i.id}
              data-testid="toast"
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-on-dark shadow-lg ${
                i.kind === "ok" ? "bg-success-fill" : "bg-danger-fill"
              }`}
            >
              {i.text}
            </div>
          ))}
        </div>
      </div>
    </ShellCtx.Provider>
  );
}
