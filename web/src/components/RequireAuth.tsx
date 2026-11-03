"use client";
// Client-side auth gate (session lives in localStorage, so SSR can't know it).
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth, useI18n } from "./Providers";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (ready && !user) {
      router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, user, locale, pathname, router]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-3xl space-y-3" data-testid="auth-redirect">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-track" />
        <div className="h-40 animate-pulse rounded-2xl bg-track" />
        <p className="text-center text-sm text-muted">{t("login_required")}</p>
      </div>
    );
  }
  return <>{children}</>;
}
