"use client";
// Route transition: subtle fade + slide-up on every navigation (App Router
// has no native transitions — keyed wrapper re-triggers the CSS animation).
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [shownPath, setShownPath] = useState(pathname);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (pathname !== shownPath) {
      setShownPath(pathname);
      setEntering(true);
      const id = window.setTimeout(() => setEntering(false), 300);
      return () => window.clearTimeout(id);
    }
  }, [pathname, shownPath]);

  return (
    <div key={shownPath} className={entering ? "page-enter" : undefined}>
      {children}
    </div>
  );
}
