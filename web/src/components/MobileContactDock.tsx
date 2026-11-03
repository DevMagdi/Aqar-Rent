"use client";

import { useEffect, useState, type ReactNode } from "react";

export function MobileContactDock({ price, perMonth, label, children }: { price: string; perMonth: string; label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > Math.max(280, window.innerHeight * 0.6));
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="mobile-contact-dock" data-visible={visible} role="group" aria-label={label} aria-hidden={!visible} inert={!visible}>
      <div className="min-w-0 self-center">
        <p className="truncate font-display text-base font-bold tabular-nums text-ink-strong">{price}</p>
        <p className="text-[11px] text-muted">{perMonth}</p>
      </div>
      <div className="mobile-contact-actions">{children}</div>
    </div>
  );
}
