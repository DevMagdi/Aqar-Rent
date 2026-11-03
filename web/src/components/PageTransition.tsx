"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

type TransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const locale = pathname.split("/")[1];
  const previousLocale = useRef(locale);
  const languageChange = previousLocale.current !== locale;
  previousLocale.current = locale;

  const onDocumentClick = useCallback((event: globalThis.MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(target instanceof HTMLAnchorElement) || target.target || target.hasAttribute("download")) return;
    const next = new URL(target.href, window.location.href);
    if (next.origin !== window.location.origin || (next.pathname === pathname && next.search === window.location.search && !next.hash)) return;
    const doc = document as TransitionDocument;
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      event.preventDefault();
      doc.startViewTransition(() => router.push(`${next.pathname}${next.search}${next.hash}`));
    }
  }, [pathname, router]);

  useEffect(() => {
    // Capture all internal anchors, including the persistent header, footer, and consent dialog.
    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [onDocumentClick]);

  // The keyed element animates on the initial render and on every route change.
  // It never holds or delays input; reduced motion is a CSS no-op.
  return <div key={pathname} className={`page-enter${languageChange ? " page-language-enter" : ""}`} data-page-root>{children}</div>;
}
