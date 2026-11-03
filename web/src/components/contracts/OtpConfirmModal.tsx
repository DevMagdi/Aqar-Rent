"use client";
// OTP confirmation modal used by contract + handover confirmations:
// (1) request a fresh code for MY phone, (2) submit it to the caller.
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n, useToast } from "../Providers";

export function OtpConfirmModal({
  title,
  submitLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  submitLabel: string;
  onClose: () => void;
  onConfirm: (otpCode: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (resendIn <= 0) return;
    timer.current = window.setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(timer.current);
  }, [resendIn]);

  async function requestOtp() {
    setErr(null);
    try {
      const { readUser } = await import("@/lib/api");
      const user = readUser<{ phone: string }>();
      if (!user?.phone) throw new Error(t("login_required"));
      const res = await api<{ dev_code?: string | null; expires_in: number }>("/auth/otp/request", {
        method: "POST",
        body: { phone: user.phone },
        anonymous: true,
      });
      setSent(true);
      setResendIn(Math.min(res.expires_in, 60));
      // dev convenience: prefill when the backend exposes the code
      if (res.dev_code) setCode(res.dev_code);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("error_generic"));
    }
  }

  async function submit() {
    if (!/^\d{6}$/.test(code)) {
      setErr(t("invalid_code"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(code);
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : (e as Error).message || t("error_generic"));
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="otp-confirm-modal"
      className="fixed inset-0 z-[900] grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-stone-900">{title}</h2>
        <p className="mt-1 text-sm text-stone-500">{t("otp_modal_sub")}</p>

        {!sent ? (
          <button
            type="button"
            data-testid="otp-request"
            onClick={requestOtp}
            className="mt-4 w-full rounded-xl bg-gold py-3 text-sm font-bold text-gold-text hover:bg-gold-dark"
          >
            {t("send_otp")}
          </button>
        ) : (
          <>
            <label className="mt-4 block text-sm font-semibold text-stone-700" htmlFor="otp-code">
              {t("code_label")}
            </label>
            <input
              id="otp-code"
              data-testid="otp-code-input"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-gold"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button
              type="button"
              data-testid="otp-resend"
              disabled={resendIn > 0}
              onClick={requestOtp}
              className="mt-2 text-xs font-semibold text-ink disabled:opacity-50"
            >
              {resendIn > 0 ? `${t("resend_in")} ${resendIn}s` : t("resend")}
            </button>
          </>
        )}

        {err && (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-600" data-testid="otp-modal-error">
            {err}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100">
            {t("cancel")}
          </button>
          <button
            type="button"
            data-testid="otp-submit"
            disabled={busy || !sent}
            onClick={submit}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
