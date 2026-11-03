"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ScrollUtilities() {
  const pathname = usePathname() || "/";
  const progressRef = useRef<HTMLDivElement>(null);
  const [backVisible, setBackVisible] = useState(false);
  const progressPage = /\/(pricing|rent\/|terms|privacy|about|content-rules|how-it-works)/.test(pathname);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = document.documentElement;
        const max = root.scrollHeight - window.innerHeight;
        const amount = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
        if (progressRef.current) {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          progressRef.current.style.transform = reduce ? "none" : `scaleX(${amount})`;
        }
        setBackVisible(window.scrollY > 600);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  return (
    <>
      {progressPage && <div ref={progressRef} className="scroll-progress" aria-hidden />}
      <button
        type="button"
        className="back-to-top press grid h-11 w-11 place-items-center rounded-full border border-border bg-surface text-ink shadow-pop focus-ring"
        data-visible={backVisible}
        aria-label={pathname.startsWith("/ar") ? "العودة إلى الأعلى" : "Back to top"}
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 14 6-6 6 6" />
          <path d="M12 8v12" />
        </svg>
      </button>
    </>
  );
}
