"use client";
// OTP login: phone → code (6 digits, resend timer) → session → redirect.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { isValidEgPhone, normalizePhone } from "@/lib/utils";
import type { AuthVerify, OtpRequest } from "@/lib/types";
import { useAuth, useI18n, useToast } from "@/components/Providers";

export function LoginView() {
  const { locale, t } = useI18n();
  const { setSession, user, ready } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || `/${locale}`;

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (!isValidEgPhone(phone)) {
      setErr(t("invalid_phone"));
      return;
    }
    setBusy(true);
    try {
      const res = await api<OtpRequest>("/auth/otp/request", {
        method: "POST",
        body: { phone: normalizePhone(phone) },
        anonymous: true,
      });
      setDevCode(res.dev_code || null);
      setResendIn(res.expires_in > 60 ? 60 : res.expires_in);
      setStep("code");
      toast.show(t("otp_sent"));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (!/^\d{6}$/.test(code)) {
      setErr(t("invalid_code"));
      return;
    }
    setBusy(true);
    try {
      const res = await api<AuthVerify>("/auth/otp/verify", {
        method: "POST",
        body: { phone: normalizePhone(phone), code, platform: "web" },
        anonymous: true,
      });
      setSession(res.tokens, res.user);
      toast.show(t("verify"));
      router.replace(next);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-xl border border-border-strong px-4 py-3 text-base outline-none focus:border-gold";

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        {step === "phone" ? (
          <form onSubmit={requestCode} data-testid="login-form">
            <h1 className="text-xl font-bold text-ink-strong">{t("login_title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("login_sub")}</p>
            <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="phone">
              {t("phone_label")}
            </label>
            <input
              id="phone"
              data-testid="input-phone"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t("phone_ph")}
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {err && (
              <p role="alert" className="mt-2 text-sm text-danger" data-testid="login-error">
                {err}
              </p>
            )}
            <button
              type="submit"
              data-testid="btn-send-code"
              disabled={busy}
              className="mt-5 w-full rounded-xl bg-gold py-3 font-semibold text-gold-text hover:bg-gold-dark disabled:opacity-60"
            >
              {busy ? t("loading") : t("send_code")}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} data-testid="otp-form">
            <h1 className="text-xl font-bold text-ink-strong">{t("otp_title")}</h1>
            <p className="mt-1 text-sm text-muted">
              {t("otp_sub")} <span dir="ltr" className="font-semibold">{phone}</span>
            </p>
            {devCode && (
              <p className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn" data-testid="dev-code">
                {t("dev_code_hint")} <b data-testid="dev-code-value">{devCode}</b>
              </p>
            )}
            <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="code">
              {t("code_label")}
            </label>
            <input
              id="code"
              data-testid="input-code"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={inputCls + " text-center text-2xl tracking-[0.5em]"}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {err && (
              <p role="alert" className="mt-2 text-sm text-danger" data-testid="otp-error">
                {err}
              </p>
            )}
            <button
              type="submit"
              data-testid="btn-verify"
              disabled={busy}
              className="mt-5 w-full rounded-xl bg-gold py-3 font-semibold text-gold-text hover:bg-gold-dark disabled:opacity-60"
            >
              {busy ? t("loading") : t("verify")}
            </button>
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                data-testid="btn-back-phone"
                onClick={() => setStep("phone")}
                className="text-muted hover:text-ink"
              >
                ← {t("back")}
              </button>
              <button
                type="button"
                data-testid="btn-resend"
                disabled={resendIn > 0 || busy}
                onClick={() => requestCode()}
                className="font-semibold text-ink disabled:opacity-50"
              >
                {resendIn > 0 ? `${t("resend_in")} ${resendIn}s` : t("resend")}
              </button>
            </div>
          </form>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        <Link href={`/${locale}/support`} className="hover:underline">
          {t("support")}
        </Link>
      </p>
    </div>
  );
}
