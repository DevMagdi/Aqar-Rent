"use client";
// Privacy consent gate (Phase 4C): shown once until accepted, links to the
// privacy page. Stores the consent version so policy updates re-prompt.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "./Providers";

const CONSENT_VERSION = "2026-11-01";
const KEY = "aqar.consent";

export function ConsentBanner() {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(KEY) !== CONSENT_VERSION);
    } catch {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={t("privacy")}
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-[950] border-t border-stone-200 bg-white/98 p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-stone-600">
          {locale === "ar" ? (
            <>
              نستخدم بياناتك لتشغيل حسابك وعرض إعلاناتك فقط — راجع{" "}
              <Link href={`/${locale}/privacy`} className="font-semibold text-brand-600 underline">
                {t("privacy")}
              </Link>
              .
            </>
          ) : (
            <>
              We use your data only to run your account and listings — see our{" "}
              <Link href={`/${locale}/privacy`} className="font-semibold text-brand-600 underline">
                {t("privacy")}
              </Link>
              .
            </>
          )}
        </p>
        <button
          type="button"
          data-testid="consent-accept"
          onClick={() => {
            try {
              localStorage.setItem(KEY, CONSENT_VERSION);
            } catch {
              /* private mode */
            }
            setOpen(false);
          }}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          {locale === "ar" ? "موافق" : "Accept"}
        </button>
      </div>
    </div>
  );
}
