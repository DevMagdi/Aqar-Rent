"use client";
// Contract wizard: listing + template + both parties + all spec fields.
// Used for create (new) and draft edit (prefilled).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n, useToast } from "../Providers";
import type { Contract, ContractTerms } from "@/lib/contracts";

interface ListingOption {
  id: string;
  title: string;
  status: string;
  address_text: string;
  rent_monthly: number;
}

const TEMPLATES = ["residential_unfurnished", "residential_furnished", "commercial"] as const;

const EMPTY_TERMS: ContractTerms = {
  party_names: { owner: "", tenant: "" },
  unit_address: "",
  start_date: "",
  duration_months: 12,
  monthly_rent: 0,
  yearly_increase_pct: 0,
  deposit_amount: 0,
  deposit_refund_days: 30,
  payment_day: 1,
  utilities_responsibility: "",
  termination_terms: "",
  extra_notes: "",
};

export function ContractWizard({ editContract, onSaved }: { editContract?: Contract; onSaved?: (c: Contract) => void }) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [listings, setListings] = useState<ListingOption[]>([]);
  const [listingId, setListingId] = useState(editContract?.listing_id || "");
  const [template, setTemplate] = useState<string>(editContract?.template || TEMPLATES[0]);
  const [tenantPhone, setTenantPhone] = useState("");
  const [ownerNid, setOwnerNid] = useState("");
  const [tenantNid, setTenantNid] = useState("");
  const [terms, setTerms] = useState<ContractTerms>({ ...EMPTY_TERMS, ...(editContract?.terms as Partial<ContractTerms>) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0 listing/template, 1 parties+NIDs, 2 terms, 3 review

  useEffect(() => {
    if (editContract) return;
    api<ListingOption[]>("/me/listings")
      .then((rows) => {
        const usable = rows.filter((r) => ["approved", "active", "expired", "rejected"].includes(r.status));
        setListings(usable);
        if (usable[0]) {
          setListingId(usable[0].id);
          setTerms((prev) => ({ ...prev, unit_address: usable[0].address_text, monthly_rent: usable[0].rent_monthly }));
        }
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editContract]);

  // Prefill party names from the logged-in owner profile
  useEffect(() => {
    if (editContract) return;
    import("@/lib/api").then(({ readUser }) => {
      const u = readUser<{ full_name?: string | null }>();
      if (u?.full_name) setTerms((prev) => ({ ...prev, party_names: { ...prev.party_names, owner: u.full_name! } }));
    });
  }, [editContract]);

  function patch(p: Partial<ContractTerms>) {
    setTerms((prev) => ({ ...prev, ...p }));
  }

  function validate(s: number): string | null {
    if (s === 0 && !listingId) return t("choose_listing");
    if (s === 1) {
      if (terms.party_names.owner.trim().length < 3) return t("owner_name_f");
      if (terms.party_names.tenant.trim().length < 3) return t("tenant_name_f");
      if (!editContract && !/^01[0125]\d{8}$/.test(tenantPhone.replace(/\s/g, ""))) return t("tenant_phone");
      if (!editContract && (ownerNid.length < 6 || tenantNid.length < 6)) return t("owner_nid");
    }
    if (s === 2) {
      if (!terms.unit_address.trim()) return t("unit_address_f");
      if (!terms.start_date) return t("start_date_f");
      if (!(terms.monthly_rent > 0)) return t("monthly_rent_f");
      if (!(terms.duration_months >= 1)) return t("duration_f");
      if (!(terms.payment_day >= 1 && terms.payment_day <= 28)) return t("payment_day_f");
    }
    return null;
  }

  async function save(requestConfirmation: boolean) {
    setBusy(true);
    setErr(null);
    try {
      let contract: Contract;
      if (editContract) {
        contract = await api<Contract>(`/contracts/${editContract.id}`, {
          method: "PATCH",
          body: { terms, national_ids: ownerNid && tenantNid ? { owner: ownerNid, tenant: tenantNid } : undefined },
        });
        toast.show(t("saved"));
        if (requestConfirmation) {
          contract = await api<Contract>(`/contracts/${editContract.id}/request-confirmation`, { method: "POST" });
          toast.show(t("request_confirmation"));
        }
      } else {
        contract = await api<Contract>("/contracts", {
          method: "POST",
          body: {
            listing_id: listingId,
            template,
            tenant_phone: tenantPhone,
            national_ids: { owner: ownerNid, tenant: tenantNid },
            terms,
          },
        });
        toast.show(t("draft_contract"));
        if (requestConfirmation) {
          contract = await api<Contract>(`/contracts/${contract.id}/request-confirmation`, { method: "POST" });
          toast.show(t("request_confirmation"));
        }
      }
      onSaved?.(contract);
      if (!onSaved) router.push(`/${locale}/contracts/${contract.id}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-gold";
  const labelCls = "block text-sm font-semibold text-stone-700";
  const steps = [t("choose_template"), t("owner_name_f"), t("monthly_rent_f"), t("review_submit")];

  return (
    <div className="mx-auto max-w-3xl" data-testid="contract-wizard" data-step={step}>
      <ol className="mb-5 flex gap-1">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <div data-testid={`cstep-${i}`} className={`h-1.5 rounded-full ${i <= step ? "bg-gold" : "bg-stone-200"}`} />
            <p className={`mt-1 hidden text-[11px] sm:block ${i === step ? "font-bold text-ink" : "text-stone-400"}`}>{s}</p>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4" data-testid="cstep-listing">
            {!editContract && (
              <div>
                <label className={labelCls} htmlFor="c-listing">
                  {t("choose_listing")} *
                </label>
                <select
                  id="c-listing"
                  data-testid="select-listing"
                  className={inputCls}
                  value={listingId}
                  onChange={(e) => {
                    setListingId(e.target.value);
                    const l = listings.find((x) => x.id === e.target.value);
                    if (l) patch({ unit_address: l.address_text, monthly_rent: l.rent_monthly });
                  }}
                >
                  <option value="">—</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} ({l.status})
                    </option>
                  ))}
                </select>
                {listings.length === 0 && <p className="mt-2 text-xs text-stone-500">{t("listings_empty")}</p>}
              </div>
            )}
            <div>
              <label className={labelCls} htmlFor="c-template">
                {t("choose_template")} *
              </label>
              <select
                id="c-template"
                data-testid="select-template"
                className={inputCls}
                value={template}
                disabled={Boolean(editContract)}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {TEMPLATES.map((x) => (
                  <option key={x} value={x}>
                    {t(`tpl.${x}`)}
                  </option>
                ))}
              </select>
            </div>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800" data-testid="tpl-notice">
              ⚖️ {t("tpl_draft_notice")}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2" data-testid="cstep-parties">
            <div>
              <label className={labelCls} htmlFor="c-owner-name">
                {t("owner_name_f")} *
              </label>
              <input
                id="c-owner-name"
                data-testid="input-owner-name"
                className={inputCls}
                value={terms.party_names.owner}
                onChange={(e) => patch({ party_names: { ...terms.party_names, owner: e.target.value } })}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-tenant-name">
                {t("tenant_name_f")} *
              </label>
              <input
                id="c-tenant-name"
                data-testid="input-tenant-name"
                className={inputCls}
                value={terms.party_names.tenant}
                onChange={(e) => patch({ party_names: { ...terms.party_names, tenant: e.target.value } })}
              />
            </div>
            {!editContract && (
              <>
                <div>
                  <label className={labelCls} htmlFor="c-tenant-phone">
                    {t("tenant_phone")} *
                  </label>
                  <input
                    id="c-tenant-phone"
                    data-testid="input-tenant-phone"
                    dir="ltr"
                    inputMode="tel"
                    className={inputCls}
                    value={tenantPhone}
                    onChange={(e) => setTenantPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                  />
                  <p className="mt-1 text-[11px] text-stone-400">{t("login_sub")}</p>
                </div>
                <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="c-owner-nid">
                      {t("owner_nid")} *
                    </label>
                    <input
                      id="c-owner-nid"
                      data-testid="input-owner-nid"
                      dir="ltr"
                      className={inputCls}
                      value={ownerNid}
                      onChange={(e) => setOwnerNid(e.target.value.replace(/\D/g, ""))}
                      maxLength={15}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="c-tenant-nid">
                      {t("tenant_nid")} *
                    </label>
                    <input
                      id="c-tenant-nid"
                      data-testid="input-tenant-nid"
                      dir="ltr"
                      className={inputCls}
                      value={tenantNid}
                      onChange={(e) => setTenantNid(e.target.value.replace(/\D/g, ""))}
                      maxLength={15}
                    />
                  </div>
                </div>
              </>
            )}
            <p className="sm:col-span-2 rounded-xl bg-stone-50 p-3 text-[11px] text-stone-500">
              🔒 {locale === "ar" ? "تُخزَّن الأرقام الوطنية مشفَّرة ولا تظهر إلا للطرفين." : "National IDs are stored encrypted and visible only to the two parties."}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2" data-testid="cstep-terms">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="c-address">
                {t("unit_address_f")} *
              </label>
              <input id="c-address" data-testid="input-address" className={inputCls} value={terms.unit_address} onChange={(e) => patch({ unit_address: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-start">
                {t("start_date_f")} *
              </label>
              <input id="c-start" data-testid="input-start-date" type="date" className={inputCls} value={terms.start_date} onChange={(e) => patch({ start_date: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-duration">
                {t("duration_f")} *
              </label>
              <input id="c-duration" data-testid="input-duration" type="number" min={1} max={120} className={inputCls} value={terms.duration_months} onChange={(e) => patch({ duration_months: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-rent">
                {t("monthly_rent_f")} *
              </label>
              <input id="c-rent" data-testid="input-rent" type="number" min={1} className={inputCls} value={terms.monthly_rent} onChange={(e) => patch({ monthly_rent: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-increase">
                {t("increase_f")}
              </label>
              <input id="c-increase" data-testid="input-increase" type="number" min={0} max={100} step="0.5" className={inputCls} value={terms.yearly_increase_pct} onChange={(e) => patch({ yearly_increase_pct: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-deposit">
                {t("deposit_f")}
              </label>
              <input id="c-deposit" data-testid="input-deposit" type="number" min={0} className={inputCls} value={terms.deposit_amount} onChange={(e) => patch({ deposit_amount: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-deposit-days">
                {t("deposit_days_f")}
              </label>
              <input id="c-deposit-days" type="number" min={1} max={180} className={inputCls} value={terms.deposit_refund_days} onChange={(e) => patch({ deposit_refund_days: Number(e.target.value) })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="c-payday">
                {t("payment_day_f")}
              </label>
              <input id="c-payday" data-testid="input-payment-day" type="number" min={1} max={28} className={inputCls} value={terms.payment_day} onChange={(e) => patch({ payment_day: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="c-utilities">
                {t("utilities_f")}
              </label>
              <textarea id="c-utilities" rows={2} className={inputCls} value={terms.utilities_responsibility} onChange={(e) => patch({ utilities_responsibility: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="c-termination">
                {t("termination_f")}
              </label>
              <textarea id="c-termination" rows={2} className={inputCls} value={terms.termination_terms} onChange={(e) => patch({ termination_terms: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="c-notes">
                {t("notes_f")}
              </label>
              <textarea id="c-notes" rows={3} className={inputCls} value={terms.extra_notes} onChange={(e) => patch({ extra_notes: e.target.value })} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm" data-testid="cstep-review">
            <h2 className="text-lg font-bold text-stone-900">{t("review_submit")}</h2>
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {[
                [t("choose_listing"), listings.find((l) => l.id === listingId)?.title || editContract?.listing_title || "—"],
                [t("choose_template"), t(`tpl.${template}`)],
                [t("owner_name_f"), terms.party_names.owner],
                [t("tenant_name_f"), terms.party_names.tenant],
                [t("unit_address_f"), terms.unit_address],
                [t("start_date_f"), terms.start_date],
                [t("duration_f"), String(terms.duration_months)],
                [t("monthly_rent_f"), String(terms.monthly_rent)],
                [t("increase_f"), String(terms.yearly_increase_pct)],
                [t("deposit_f"), String(terms.deposit_amount)],
                [t("payment_day_f"), String(terms.payment_day)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-stone-100 py-1">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="truncate font-semibold text-stone-800">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">⚖️ {t("tpl_draft_notice")}</p>
            <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
              {locale === "ar" ? "بعد الحفظ سيُطلب تأكيد الطرفين برمز تحقق، وبعدها يصبح العقد نهائياً." : "After saving, both parties confirm with an OTP — then the contract becomes final."}
            </p>
          </div>
        )}

        {err && (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-600" data-testid="wizard-error">
            {err}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          data-testid="btn-cprev"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-40"
        >
          → {t("prev")}
        </button>
        {step < 3 ? (
          <button
            type="button"
            data-testid="btn-cnext"
            onClick={() => {
              const e = validate(step);
              if (e) {
                setErr(e);
                return;
              }
              setErr(null);
              setStep((s) => s + 1);
            }}
            className="rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-gold-text hover:bg-gold-dark"
          >
            {t("next")} ←
          </button>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" data-testid="btn-save-draft" disabled={busy} onClick={() => save(false)} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-60">
              {t("draft_contract")}
            </button>
            <button type="button" data-testid="btn-save-request" disabled={busy} onClick={() => save(true)} className="rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-gold-text hover:bg-gold-dark disabled:opacity-60">
              {t("request_confirmation")}
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center">
        <Link href={`/${locale}/contracts`} className="text-sm text-stone-500 hover:underline">
          ← {t("contracts")}
        </Link>
      </p>
    </div>
  );
}
