"use client";
// Profile: name, language, delete account (with confirm).
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuth, useI18n, useToast } from "./Providers";

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

  const inputCls = "mt-1 w-full rounded-xl border border-border-strong px-4 py-3 text-sm outline-none focus:border-gold";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <section className="rounded-3xl border border-border bg-surface p-6">
        <h1 className="text-xl font-bold text-ink-strong">{t("account_title")}</h1>
        <form onSubmit={save} className="mt-4 space-y-4" data-testid="account-form">
          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="acc-phone">
              {t("account_phone")}
            </label>
            <input id="acc-phone" dir="ltr" readOnly value={user?.phone || ""} className={inputCls + " bg-bg text-muted"} />
          </div>
          <div>
            <label className="text-sm font-semibold text-ink" htmlFor="acc-name">
              {t("account_name")}
            </label>
            <input id="acc-name" data-testid="input-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
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
          <button type="submit" data-testid="btn-save-profile" disabled={busy} className="w-full rounded-xl bg-gold py-3 font-semibold text-gold-text hover:bg-gold-dark disabled:opacity-60">
            {t("save")}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-danger/20 bg-danger-bg p-6">
        <h2 className="font-bold text-danger">{t("delete_account")}</h2>
        <p className="mt-1 text-sm text-danger">{t("delete_warning")}</p>
        {!confirming ? (
          <button
            type="button"
            data-testid="btn-delete-account"
            onClick={() => setConfirming(true)}
            className="mt-4 rounded-xl border border-danger/20 bg-surface px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-bg"
          >
            {t("delete_account")}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-semibold text-danger">{t("delete_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-xl border border-border-strong bg-surface py-2.5 text-sm font-semibold text-ink">
                {t("cancel")}
              </button>
              <button type="button" data-testid="btn-delete-confirm" disabled={busy} onClick={removeAccount} className="flex-1 rounded-xl bg-danger-fill py-2.5 text-sm font-semibold text-on-dark hover:bg-danger-fill disabled:opacity-60">
                {t("confirm_ok")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
