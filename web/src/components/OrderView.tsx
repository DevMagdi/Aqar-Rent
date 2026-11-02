"use client";
// Order detail / payment: card+Fawry+Vodafone (gateway link or dev simulate),
// bank transfer (instructions + reference copy + receipt upload), result screens.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { uploadWithProgress } from "@/lib/upload";
import { ErrorState, StatusBadge } from "./ui";
import { useAuth, useI18n, useToast } from "./Providers";
import { formatDateTime, formatMoney } from "@/lib/utils";
import type { BankReceipt, Locale, Order } from "@/lib/types";

const MOCK_PAY = process.env.NEXT_PUBLIC_MOCK_PAY === "true";

export function OrderView({ locale, orderId }: { locale: Locale; orderId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [bankStatus, setBankStatus] = useState<string | null>(null);
  const pollRef = useRef<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<Order>(`/orders/${orderId}`)
      .then(setOrder)
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
  }, [orderId, t]);

  useEffect(load, [load]);

  // Mint checkout details for pending gateway orders.
  useEffect(() => {
    if (!order || order.status !== "pending" || order.method === "bank_transfer") return;
    if (order.checkout_url) {
      setCheckoutUrl(order.checkout_url);
      return;
    }
    api<{ checkout_url: string | null; payment_reference: string | null }>(`/orders/${orderId}/checkout`, { method: "POST" })
      .then((c) => setCheckoutUrl(c.checkout_url))
      .catch(() => {});
  }, [order, orderId]);

  // Poll status briefly after a payment attempt.
  function startPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let tries = 0;
    pollRef.current = window.setInterval(() => {
      tries += 1;
      api<Order>(`/orders/${orderId}`)
        .then((o) => setOrder(o))
        .catch(() => {});
      if (tries > 10 && pollRef.current) window.clearInterval(pollRef.current);
    }, 2000);
  }
  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  const mockRef = checkoutUrl?.startsWith("mock://") ? checkoutUrl.split("/").pop() || null : null;

  async function simulate(event: "success" | "failure") {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dev/simulate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ref: mockRef, amount_cents: Math.round(order.total * 100), event }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "failed");
      toast.show(event === "success" ? t("checkout_success") : t("checkout_failed"), event === "success" ? "ok" : "err");
      const o = await api<Order>(`/orders/${orderId}`);
      setOrder(o);
      startPolling();
    } catch (e) {
      toast.show((e as Error).message || t("error_generic"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(file: File) {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const { promise } = uploadWithProgress(`/orders/${orderId}/bank-receipt`, fd, setProgress);
      const r = (await promise) as BankReceipt;
      setBankStatus(r.status);
      toast.show(t("receipt_uploaded"));
      const o = await api<Order>(`/orders/${orderId}`);
      setOrder(o);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : (e as Error).message || t("error_generic"), "err");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!order) return <div className="mx-auto h-80 max-w-2xl animate-pulse rounded-3xl bg-stone-200" />;

  // ── result screens ──────────────────────────────────────────────────
  if (order.status === "paid") {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center" data-testid="payment-success">
        <p className="text-4xl">🎉</p>
        <h1 className="mt-3 text-2xl font-bold text-emerald-900">{t("checkout_success")}</h1>
        <p className="mt-2 text-sm text-emerald-700">{t("checkout_success_sub")}</p>
        <p className="mt-3 text-xs text-emerald-600">
          {t("order_ref")}: <b data-testid="order-total">{formatMoney(order.total, locale)}</b>
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/${locale}/owner`} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
            {t("dashboard_title")}
          </Link>
          <Link href={`/${locale}/owner/orders`} className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700">
            {t("view_orders")}
          </Link>
        </div>
      </div>
    );
  }

  if (order.status === "failed") {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-red-50 p-8 text-center" data-testid="payment-failed">
        <p className="text-4xl">⚠️</p>
        <h1 className="mt-3 text-2xl font-bold text-red-900">{t("checkout_failed")}</h1>
        <p className="mt-2 text-sm text-red-700">{t("checkout_failed_sub")}</p>
        <Link
          href={`/${locale}/owner/checkout?listing=${order.listing_id}`}
          data-testid="btn-retry-payment"
          className="mt-6 inline-block rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
        >
          {t("try_again")}
        </Link>
      </div>
    );
  }

  if (order.status === "expired" || order.status === "refunded") {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-stone-200 bg-white p-8 text-center">
        <StatusBadge status={order.status} label={t(`ostatus.${order.status}`) !== `ostatus.${order.status}` ? t(`ostatus.${order.status}`) : order.status} />
        <Link href={`/${locale}/owner/orders`} className="mt-6 block text-sm font-semibold text-ink">
          ← {t("orders_title")}
        </Link>
      </div>
    );
  }

  // pending ────────────────────────────────────────────────────────────
  const isBank = order.method === "bank_transfer";
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${label}: ${t("copied")}`);
    } catch {
      toast.show(text);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5" data-testid="order-pending">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">{t("checkout_pending")}</h1>
          <p className="text-sm text-stone-500">{t("checkout_pending_sub")}</p>
        </div>
        <StatusBadge status="pending" label={t("ostatus.pending")} />
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">{t("order_ref")}</dt>
            <dd className="font-mono text-xs" data-testid="order-id">
              {order.id.slice(0, 8)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">{t("weeks")}</dt>
            <dd>
              {order.weeks} {t("week")}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">{t("method_card")}</dt>
            <dd data-testid="order-method">{t(`method_${order.method}`)}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>{t("total")}</dt>
            <dd>{formatMoney(order.total, locale)}</dd>
          </div>
          {order.expires_at && (
            <div className="flex justify-between">
              <dt className="text-stone-500">{t("expires")}</dt>
              <dd>{formatDateTime(order.expires_at, locale)}</dd>
            </div>
          )}
        </dl>
      </section>

      {!isBank ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5" data-testid="gateway-panel">
          {order.method === "card" && checkoutUrl && !checkoutUrl.startsWith("mock://") && (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="link-gateway"
              className="block w-full rounded-xl bg-gold py-3 text-center font-bold text-brand-deep hover:bg-gold-dark"
            >
              {t("pay_now")}
            </a>
          )}
          {order.method === "fawry" && order.payment_reference && (
            <div className="rounded-xl bg-amber-50 p-4 text-sm">
              <p className="font-semibold text-amber-800">{t("fawry_ref")}</p>
              <p className="mt-1 font-mono text-lg font-bold text-amber-900" data-testid="fawry-ref">
                {order.payment_reference}
              </p>
            </div>
          )}
          {order.method === "vodafone_cash" && order.payment_reference && (
            <div className="rounded-xl bg-red-50 p-4 text-sm">
              <p className="font-semibold text-red-800">{t("method_vodafone_cash")}</p>
              <p className="mt-1 font-mono text-lg font-bold" data-testid="vcash-ref">
                {order.payment_reference}
              </p>
            </div>
          )}

          {MOCK_PAY && mockRef && (
            <div className="mt-4 space-y-2 rounded-xl border border-dashed border-stone-300 p-4" data-testid="mock-panel">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">MockProvider</p>
              <button
                type="button"
                data-testid="btn-simulate-success"
                disabled={busy}
                onClick={() => simulate("success")}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {t("simulate_pay")}
              </button>
              <button
                type="button"
                data-testid="btn-simulate-failure"
                disabled={busy}
                onClick={() => simulate("failure")}
                className="w-full rounded-xl border border-red-300 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {t("simulate_fail")}
              </button>
            </div>
          )}
          <button type="button" data-testid="btn-refresh-order" onClick={load} className="mt-4 w-full rounded-xl border border-stone-300 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50">
            ↻
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white p-5" data-testid="bank-panel">
          <h2 className="text-sm font-bold text-stone-800">{t("bank_details")}</h2>
          {order.bank_instructions ? (
            <dl className="mt-3 space-y-2 text-sm">
              {(
                [
                  ["bank_name", t("bank_name"), order.bank_instructions.bank_name],
                  ["account_name", t("bank_account_name"), order.bank_instructions.account_name],
                  ["account_number", t("account_number"), order.bank_instructions.account_number],
                  ["iban", t("iban"), order.bank_instructions.iban],
                  ["swift", t("swift"), order.bank_instructions.swift],
                ] as [string, string, string][]
              ).map(([key, label, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 border-b border-stone-100 py-1.5">
                  <dt className="text-stone-500">{label}</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-xs" dir="ltr">
                      {value}
                    </span>
                    <button type="button" aria-label={t("copy")} onClick={() => copy(value, label)} className="rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-500">
                      {t("copy")}
                    </button>
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-2.5">
                <dt className="text-xs font-bold text-ink-strong">{t("bank_reference")}</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-ink-strong" data-testid="bank-reference">
                    {order.bank_instructions.reference}
                  </span>
                  <button
                    type="button"
                    data-testid="btn-copy-reference"
                    onClick={() => copy(order.bank_instructions!.reference, t("bank_reference"))}
                    className="rounded bg-gold px-2 py-1 text-[10px] font-bold text-brand-deep"
                  >
                    {t("copy")}
                  </button>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-stone-500">{t("loading")}</p>
          )}

          <div className="mt-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              data-testid="input-receipt"
              className="block w-full text-sm text-stone-600 file:me-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadReceipt(f);
              }}
            />
            {progress !== null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="h-full bg-gold transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            {(bankStatus || null) && (
              <p className="mt-2 text-xs font-semibold text-amber-700" data-testid="receipt-status">
                {t("receipt_uploaded")} ({bankStatus})
              </p>
            )}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-stone-400">
        <Link href={`/${locale}/owner/orders`} className="hover:underline">
          ← {t("orders_title")}
        </Link>
      </p>
    </div>
  );
}
