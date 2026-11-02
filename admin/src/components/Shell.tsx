// Admin shell: sidebar with role-based menu, topbar, toast host.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, clearSession, getRole } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";

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
          className="fixed inset-y-0 start-0 z-40 flex w-56 flex-col border-e border-sidebar-hover bg-sidebar text-sidebar-text max-lg:hidden"
          data-testid="admin-sidebar"
        >
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-hover px-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-gold to-gold-light text-sm font-bold text-brand-deep">
              A
            </span>
            <div>
              <p className="text-sm font-bold text-sidebar-text">Aqar Rent</p>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-muted">Admin</p>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="admin">
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
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-gold"
                        data-testid="nav-indicator"
                      />
                    )}
                    {n.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-sidebar-hover p-3">
            <p className="truncate text-xs text-sidebar-muted" data-testid="admin-email">
              {me?.email || "…"}
            </p>
            <p className="text-[11px] font-bold uppercase text-sidebar-active" data-testid="admin-role">
              {role}
            </p>
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

        <div className="flex-1 lg:ps-56">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4">
            <p className="text-sm font-bold text-ink-strong">Operations console</p>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <span className="hidden rounded-full bg-gold-tint-12 px-2.5 py-1 text-xs font-bold uppercase text-ink sm:block">{role}</span>
            </div>
          </header>
          <main className="p-4 sm:p-6">{children}</main>
        </div>

        {/* mobile nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-border bg-surface p-1.5 lg:hidden">
          {NAV.filter((n) => n.roles.includes(role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `relative whitespace-nowrap rounded-lg px-3 py-1.5 pe-3 ps-4 text-xs font-semibold transition-colors duration-150 ${
                  isActive
                    ? "bg-gold-tint-14 text-ink"
                    : "text-muted hover:bg-track hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span aria-hidden className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-gold" />
                  )}
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="fixed bottom-16 start-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 lg:bottom-5">
          {items.map((i) => (
            <div
              key={i.id}
              data-testid="toast"
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg ${
                i.kind === "ok" ? "bg-emerald-600" : "bg-red-600"
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
