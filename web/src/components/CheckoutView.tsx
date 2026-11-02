"use client";
// Checkout: weeks 1–4, promo code (live totals), 4 methods → POST /orders.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ErrorState } from "./ui";
import { useI18n, useToast } from "./Providers";
import { formatMoney } from "@/lib/utils";
import type { Locale, MeListing, Order, Plan, PromoValidate } from "@/lib/types";

const METHODS = ["card", "fawry", "vodafone_cash", "bank_transfer"] as const;

function CheckoutInner({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const listingId = sp.get("listing") || "";

  const [plan, setPlan] = useState<Plan | null>(null);
  const [listing, setListing] = useState<MeListing | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(1);
  const [promo, setPromo] = useState("");
  const [promoResult, setPromoResult] = useState<PromoValidate | null>(null);
  const [method, setMethod] = useState<string>("card");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(null);
    Promise.all([api<Plan[]>("/plans", { anonymous: true }), api<MeListing[]>("/me/listings")])
      .then(([plans, mine]) => {
        setPlan(plans[0] || null);
        setListing(mine.find((m) => m.id === listingId) || null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
  }, [listingId, t]);

  useEffect(() => {
    if (listingId) load();
    else setErr(t("required"));
  }, [listingId, load, t]);

  const subtotal = plan ? plan.price_egp * weeks : 0;
  const discount = promoResult?.valid ? promoResult.discount : 0;
  const total = promoResult?.valid ? promoResult.total : subtotal;

  async function applyPromo() {
    if (!promo.trim()) return;
    try {
      const r = await api<PromoValidate>("/promo/validate", { method: "POST", body: { code: promo.trim(), weeks } });
      setPromoResult(r);
      if (!r.valid) toast.show(r.message || t("error_generic"), "err");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    }
  }

  async function createOrder() {
    if (!listingId) return;
    setBusy(true);
    try {
      const order = await api<Order>("/orders", {
        method: "POST",
        body: {
          listing_id: listingId,
          weeks,
          promo_code: promoResult?.valid ? promoResult.code : null,
          method,
        },
      });
      localStorage.removeItem(`aqar.wizard.${listingId}`);
      router.push(`/${locale}/owner/orders/${order.id}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
      setBusy(false);
    }
  }

  if (err) return <ErrorState message={err} onRetry={load} />;

  const inputCls = "mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-gold";

  return (
    <div className="mx-auto max-w-2xl space-y-5" data-testid="checkout-form">
      <div>
        <h1 className="text-xl font-bold text-stone-900">{t("checkout_title")}</h1>
        {listing && (
          <p className="mt-1 text-sm text-stone-500">
            {t("checkout_for")}: <b className="text-stone-800" data-testid="checkout-listing-title">{listing.title}</b>
          </p>
        )}
      </div>

      {!plan ? (
        <div className="h-40 animate-pulse rounded-2xl bg-stone-200" />
      ) : (
        <>
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-bold text-stone-800">{t("weeks")}</h2>
            <div className="mt-3 flex gap-2" data-testid="weeks-picker">
              {[1, 2, 3, 4].map((w) => (
                <button
                  key={w}
                  type="button"
                  data-testid={`weeks-${w}`}
                  aria-pressed={weeks === w}
                  onClick={() => {
                    setWeeks(w);
                    setPromoResult(null);
                  }}
                  className={`flex-1 rounded-xl border px-3 py-3 text-sm font-bold ${
                    weeks === w ? "border-gold bg-brand-50 text-ink" : "border-stone-300 text-stone-600"
                  }`}
                >
                  {w} {t("week")}
                  <br />
                  <span className="text-xs font-semibold">{formatMoney(plan.price_egp * w, locale)}</span>
                </button>
              ))}
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-stone-700" htmlFor="promo">
                {t("promo")}
              </label>
              <div className="mt-1 flex gap-2">
                <input id="promo" data-testid="input-promo" className={inputCls} value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="SAVE10" />
                <button type="button" data-testid="btn-apply-promo" onClick={applyPromo} className="rounded-xl border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                  {t("apply")}
                </button>
              </div>
              {promoResult?.valid && (
                <p className="mt-2 text-xs font-semibold text-emerald-600" data-testid="promo-applied">
                  ✓ {promoResult.code} — {formatMoney(promoResult.discount, locale)}
                </p>
              )}
              {promoResult && !promoResult.valid && (
                <p className="mt-2 text-xs font-semibold text-red-600">{promoResult.message}</p>
              )}
            </div>

            <dl className="mt-5 space-y-1.5 border-t border-stone-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-stone-500">{t("subtotal")}</dt>
                <dd data-testid="checkout-subtotal">{formatMoney(subtotal, locale)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-500">{t("discount")}</dt>
                <dd data-testid="checkout-discount">{formatMoney(discount, locale)}</dd>
              </div>
              <div className="flex justify-between text-base font-bold text-stone-900">
                <dt>{t("total")}</dt>
                <dd data-testid="checkout-total">{formatMoney(total, locale)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-bold text-stone-800">{t("method_card")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="methods">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`method-${m}`}
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold text-start ${
                    method === m ? "border-gold bg-brand-50 text-ink" : "border-stone-300 text-stone-600"
                  }`}
                >
                  {t(`method_${m}`)}
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            data-testid="btn-create-order"
            disabled={busy}
            onClick={createOrder}
            className="w-full rounded-xl bg-gold py-3.5 font-bold text-brand-deep hover:bg-gold-dark disabled:opacity-60"
          >
            {busy ? t("loading") : `${t("continue_pay")} · ${formatMoney(total, locale)}`}
          </button>
          <p className="text-center text-xs text-stone-400">
            <Link href={`/${locale}/owner`} className="hover:underline">
              ← {t("dashboard_title")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

export function CheckoutView({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse rounded-3xl bg-stone-200" />}>
      <CheckoutInner locale={locale} />
    </Suspense>
  );
}
