"use client";
// Client providers: locale (i18n) + auth session + toasts.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_LOCALE, dirOf, makeT } from "@/lib/i18n";
import type { Locale, User } from "@/lib/types";
import { clearTokens, readUser, saveTokens, saveUser } from "@/lib/api";

interface LocaleCtx {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: string, vars?: Record<string, string | number>) => string;
  otherLocale: Locale;
  otherHref: string;
}
const Ctx = createContext<LocaleCtx | null>(null);

export function useI18n(): LocaleCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside provider");
  return v;
}

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const pathname = usePathname() || "/";
  const t = useMemo(() => makeT(locale), [locale]);
  const otherLocale: Locale = locale === "ar" ? "en" : "ar";
  const otherHref = pathname.replace(`/${locale}/`, `/${otherLocale}/`).replace(`/${locale}`, `/${otherLocale}`) || `/${otherLocale}`;
  const value = useMemo<LocaleCtx>(
    () => ({ locale, dir: dirOf(locale), t, otherLocale, otherHref }),
    [locale, t, otherLocale, otherHref],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

interface AuthCtx {
  user: User | null;
  ready: boolean;
  setSession: (tokens: { access_token: string; refresh_token: string; token_type: string; expires_in: number }, user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
const AuthCtxt = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(AuthCtxt);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setUser(readUser<User>());
    setReady(true);
  }, []);

  const setSession = useCallback<AuthCtx["setSession"]>((tokens, u) => {
    saveTokens(tokens);
    saveUser(u);
    setUser(u);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { api } = await import("@/lib/api");
      const u = await api<User>("/me");
      saveUser(u);
      setUser(u);
    } catch {
      /* keep cached user on network errors */
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const { api, getRefresh } = await import("@/lib/api");
      const refresh_token = getRefresh();
      if (refresh_token) await api("/auth/logout", { method: "POST", body: { refresh_token }, anonymous: true });
    } catch {
      /* ignore */
    }
    clearTokens();
    setUser(null);
    router.push("/");
  }, [router]);

  return <AuthCtxt.Provider value={{ user, ready, setSession, logout, refreshUser }}>{children}</AuthCtxt.Provider>;
}

// ── Toasts ───────────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  text: string;
  kind: "ok" | "err";
}
interface ToastCtx {
  show: (text: string, kind?: "ok" | "err") => void;
}
const ToastCtxt = createContext<ToastCtx>({ show: () => {} });
export function useToast() {
  return useContext(ToastCtxt);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <ToastCtxt.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            role="status"
            data-testid="toast"
            className={`toast-in pointer-events-auto max-w-md rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-pop ${
              i.kind === "ok" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtxt.Provider>
  );
}

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <LocaleProvider locale={locale}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
