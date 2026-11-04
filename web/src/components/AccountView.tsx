"use client";
// Profile: name, language, delete account (with confirm).
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuth, useI18n, useToast } from "./Providers";
import { Icon } from "./Icon";

/** "+201000000101" → "01000000101". */
function localPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("20") ? `0${digits.slice(2)}` : digits;
}

export function AccountView() {
  const { locale, t } = useI18n();
  const { user, refreshUser, logout } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [lang, setLang] = useState(locale);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.full_name || "");
      setLang(user.language === "en" ? "en" : "ar");
    }
  }, [user]);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api<User>("/me", { method: "PATCH", body: { full_name: name.trim() || null, language: lang } });
      await refreshUser();
      toast.show(t("saved"));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    setBusy(true);
    try {
      await api("/me", { method: "DELETE" });
      await logout();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("error_generic"));
      setBusy(false);
    }
  }

  const inputCls =
  "mt-1 min-h-11 w-full rounded-[var(--radius-field)] border border-border-strong bg-surface px-4 py-3 text-sm text-ink outline-none transition-colors focus-visible:border-verified";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold text-lg font-bold text-gold-text" aria-hidden>
          {user?.full_name ? (
            user.full_name.slice(0, 1).toUpperCase()
          ) : (
            <Icon name="user" size={20} strokeWidth={2} />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-ink-strong">{user?.full_name || t("account_unnamed")}</p>
          <p className="text-xs text-muted" dir="ltr">{localPhone(user?.phone)}</p>
        </div>
      </header>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold text-ink-strong">{t("account_details")}</h2>
        <form onSubmit={save} className="mt-4 space-y-4" data-testid="account-form">
          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="acc-phone">
              {t("account_phone")}
            </label>
            <input id="acc-phone" dir="ltr" readOnly value={localPhone(user?.phone)} className={inputCls + " cursor-not-allowed bg-bg text-muted"} />
            <p className="mt-1 text-xs text-muted">{t("account_phone_hint")}</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="acc-name">
              {t("account_name")}
            </label>
            <input
              id="acc-name"
              data-testid="input-name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              placeholder={t("account_name_ph")}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="acc-lang">
              {t("account_language")}
            </label>
            <select id="acc-lang" data-testid="select-language" className={inputCls} value={lang} onChange={(e) => setLang(e.target.value as "ar" | "en")}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          {err && (
            <p role="alert" className="text-sm text-danger">
              {err}
            </p>
          )}
          <button type="submit" data-testid="btn-save-profile" disabled={busy} className="btn-primary min-h-11 w-full justify-center disabled:opacity-60">
            {t("save")}
          </button>
        </form>
      </section>

      <section className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-bg p-6">
        <h2 className="font-bold text-danger">{t("delete_account")}</h2>
        <p className="mt-1 text-sm text-danger">{t("delete_warning")}</p>
        {!confirming ? (
          <button
            type="button"
            data-testid="btn-delete-account"
            onClick={() => setConfirming(true)}
            className="mt-4 inline-flex min-h-10 items-center rounded-[var(--radius-field)] border border-danger/30 bg-surface px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg"
          >
            {t("delete_account")}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-semibold text-danger">{t("delete_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-[var(--radius-field)] border border-border-strong bg-surface py-2.5 text-sm font-semibold text-ink">
                {t("cancel")}
              </button>
              <button type="button" data-testid="btn-delete-confirm" disabled={busy} onClick={removeAccount} className="min-h-11 flex-1 rounded-[var(--radius-field)] bg-danger-fill py-2.5 text-sm font-semibold text-on-dark disabled:opacity-60">
                {t("confirm_ok")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
