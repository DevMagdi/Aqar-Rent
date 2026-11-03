"use client";
// Light/dark toggle: class strategy on <html>, persisted, system-aware.
import { useEffect, useState } from "react";
import { useI18n } from "./Providers";

type Mode = "light" | "dark";

function currentMode(): Mode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" || document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    setMode(currentMode());
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("aqar.theme", next);
    } catch {
      /* private mode */
    }
    setMode(next);
  }

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggle}
      aria-label={mode === "dark" ? `Switch to light mode (${t("brand")})` : `Switch to dark mode (${t("brand")})`}
      title={mode === "dark" ? "Light" : "Dark"}
      className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-ink transition duration-150 hover:bg-track active:scale-[0.96]"
    >
      {mode === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
        </svg>
      )}
    </button>
  );
}

/** Inline bootstrap: apply persisted/system theme before first paint (no flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('aqar.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
