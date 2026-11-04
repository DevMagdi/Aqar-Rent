"use client";
// Contract detail: status timeline, terms, OTP confirmation, PDF download,
// optional fee payment, and the handover section (check-in/out + comparison).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth, useI18n, useToast } from "../Providers";
import { OtpConfirmModal } from "./OtpConfirmModal";
import { HandoverEditor } from "./HandoverEditor";
import { downloadAuthed, type Contract, type Handover } from "@/lib/contracts";
import { Icon } from "@/components/Icon";

const METHODS = ["card", "fawry", "vodafone_cash", "bank_transfer"] as const;

export function ContractDetail({ contractId }: { contractId: string }) {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [contract, setContract] = useState<Contract | null>(null);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [otpFor, setOtpFor] = useState<"contract" | null>(null);
  const [editor, setEditor] = useState<{ kind: "check_in" | "check_out"; source?: string; existing?: Handover } | null>(null);
  const [feeMethod, setFeeMethod] = useState<string>("card");
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<Handover | null>(null); // check-in shown next to its check-out

  const load = useCallback(() => {
    setErr(null);
    api<Contract>(`/contracts/${contractId}`)
      .then((c) => {
        setContract(c);
        return api<Handover[]>(`/contracts/${contractId}/handovers`).catch(() => [] as Handover[]);
      })
      .then((hs) => setHandovers(hs || []))
      .catch((e) => setErr(e instanceof ApiError ? (e.status === 404 ? t("not_party") : e.message) : t("error_generic")));
  }, [contractId, t]);

  useEffect(load, [load]);

  async function requestConfirmation() {
    setBusy(true);
    try {
      const c = await api<Contract>(`/contracts/${contractId}/request-confirmation`, { method: "POST" });
      setContract(c);
      toast.show(t("request_confirmation"));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function confirmContract(code: string) {
    const c = await api<Contract>(`/contracts/${contractId}/confirm`, { method: "POST", body: { otp_code: code } });
    setContract(c);
    toast.show(t("contract_confirmed_banner"));
    load();
  }

  async function payFee() {
    setBusy(true);
    try {
      const res = await api<{ order_id: string }>(`/contracts/${contractId}/fee-order`, {
        method: "POST",
        body: { method: feeMethod },
      });
      router.push(`/${locale}/owner/orders/${res.order_id}`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
      setBusy(false);
    }
  }

  async function downloadPdf() {
    try {
      await downloadAuthed(`/contracts/${contractId}/pdf`, `contract-${contract?.reference_no}.pdf`);
    } catch (e) {
      toast.show((e as Error).message, "err");
    }
  }

  if (err) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-danger/20 bg-danger-bg p-6 text-center text-sm text-danger" role="alert" data-testid="contract-error">
        {err}
        <div className="mt-3">
          <Link href={`/${locale}/contracts`} className="font-semibold text-ink">
            ← {t("contracts")}
          </Link>
        </div>
      </div>
    );
  }
  if (!contract) return <div className="mx-auto h-80 max-w-2xl animate-pulse rounded-3xl bg-track" />;

  const myRole = user ? contract.parties.find((p) => p.id === user.id)?.role : undefined;
  const checkIns = handovers.filter((h) => h.kind === "check_in");
  const checkOuts = handovers.filter((h) => h.kind === "check_out");
  const canCreateCheckIn = contract.status === "confirmed" && !checkIns.some((c) => c.status === "draft");
  const confirmedCheckIns = checkIns.filter((c) => c.status === "confirmed");

  return (
    <div className="mx-auto max-w-3xl space-y-5" data-testid="contract-detail" data-status={contract.status}>
      {/* header */}
      <div className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("contract_ref")}</p>
            <h1 className="text-xl font-extrabold text-ink-strong" data-testid="contract-ref">
              {contract.reference_no}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              {t(`tpl.${contract.template}`)} · {contract.listing_title || contract.listing_id.slice(0, 8)}
            </p>
          </div>
          <span
            data-testid="contract-status"
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              contract.status === "confirmed"
                ? "bg-success-bg text-success"
                : contract.status === "pending_confirmation"
                  ? "bg-warn-bg text-warn"
                  : "bg-surface-2 text-ink"
            }`}
          >
            {t(`cstatus.${contract.status}`)}
          </span>
        </div>

        {contract.status === "confirmed" && (
          <div className="mt-4 rounded-xl bg-success-bg p-3 text-sm font-semibold text-success" data-testid="confirmed-banner">
            <Icon name="check" size={14} strokeWidth={2.8} className="me-1.5 inline-block align-[-2px]" />
            {t("contract_confirmed_banner")}
            <p className="mt-1 break-all font-mono text-[11px] font-normal" data-testid="terms-hash">
              {t("terms_hash")}: {contract.terms_hash}
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {contract.parties.map((p) => (
            <div key={p.id} className="rounded-xl bg-bg p-3 text-sm">
              <p className="font-bold text-ink">
                <Icon name={p.role === "owner" ? "user" : "home"} size={14} className="me-1.5 inline-block align-[-2px] text-muted" />
                {p.role === "owner" ? t("party_owner") : t("party_tenant")}{" "}
                <span className="font-normal text-muted">
                  {(contract.confirmations_log || []).some((e) => e.user_id === p.id) ? "✓✓" : "…"}
                </span>
              </p>
              <p className="mt-1 text-muted">{p.full_name}</p>
              <p className="text-xs text-muted" dir="ltr">
                {p.phone}
              </p>
              <p className="text-xs text-muted">
                {t("masked_nid")}: <span dir="ltr">{p.national_id_masked}</span>
              </p>
            </div>
          ))}
        </div>

        {/* actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {contract.can_edit && (
            <Link
              href={`/${locale}/contracts/${contract.id}/edit`}
              data-testid="btn-edit-contract"
              className="rounded-xl border border-border-strong px-4 py-2.5 text-sm font-semibold text-ink"
            >
              {t("edit")}
            </Link>
          )}
          {contract.status === "draft" && myRole === "owner" && (
            <button
              type="button"
              data-testid="btn-request-confirmation"
              disabled={busy}
              onClick={requestConfirmation}
              className="rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-gold-text hover:bg-gold-dark disabled:opacity-60"
            >
              {t("request_confirmation")}
            </button>
          )}
          {contract.can_confirm && (
            <button
              type="button"
              data-testid="btn-confirm-contract"
              onClick={() => setOtpFor("contract")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-field)] bg-success-fill px-4 text-sm font-bold text-on-dark"
            >
              <Icon name="key" size={15} />
              {t("confirm_with_otp")}
            </button>
          )}
          {contract.status === "confirmed" && (
            <button
              type="button"
              data-testid="btn-contract-pdf"
              onClick={downloadPdf}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-field)] border border-gold px-4 text-sm font-bold text-ink transition-colors hover:bg-gold-tint-8"
            >
              <Icon name="download" size={15} />
              {t("download_pdf")}
            </button>
          )}
        </div>

        {/* confirmation log */}
        {contract.confirmations_log.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-bold text-ink">{t("confirmation_log")}</h2>
            <ul className="mt-1 space-y-1" data-testid="confirmation-log">
              {contract.confirmations_log.map((e, i) => (
                <li key={i} className="rounded-lg bg-bg px-3 py-1.5 text-xs text-muted">
                  <b>{e.party === "owner" ? t("party_owner") : t("party_tenant")}</b> · {e.at.slice(0, 19).replace("T", " ")} · {e.ip || "-"} ·{" "}
                  <span className="text-muted">{(e.device || "-").slice(0, 40)}</span> · OTP <Icon name="check" size={11} strokeWidth={2.8} className="inline-block align-[-1px] text-success" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* fee */}
      {contract.fee_required && contract.fee_order_status !== "paid" && (
        <div className="rounded-3xl border border-border bg-surface p-5" data-testid="fee-panel">
          <h2 className="text-sm font-bold text-ink">
            {t("fee_title")} — {contract.fee_amount} EGP
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select aria-label={t("fee_title")} className="rounded-xl border border-border-strong px-3 py-2 text-sm" value={feeMethod} onChange={(e) => setFeeMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`method_${m}`)}
                </option>
              ))}
            </select>
            <button type="button" data-testid="btn-pay-fee" disabled={busy} onClick={payFee} className="rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-gold-text hover:bg-gold-dark disabled:opacity-60">
              {t("pay_fee")}
            </button>
          </div>
        </div>
      )}
      {contract.fee_required && contract.fee_order_status === "paid" && (
        <p className="rounded-xl bg-success-bg p-3 text-sm font-semibold text-success" data-testid="fee-paid">
          <Icon name="check" size={14} strokeWidth={2.8} className="me-1.5 inline-block align-[-2px]" />
          {t("fee_title")} — {t("paid")}
        </p>
      )}
      {!contract.fee_required && (
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">{t("fee_free")}</p>
      )}

      {/* terms */}
      <div className="rounded-3xl border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-ink-strong">{t("details")}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {[
            [t("unit_address_f"), contract.terms.unit_address],
            [t("start_date_f"), contract.terms.start_date],
            [t("duration_f"), String(contract.terms.duration_months ?? "—")],
            [t("monthly_rent_f"), String(contract.terms.monthly_rent ?? "—")],
            [t("increase_f"), String(contract.terms.yearly_increase_pct ?? "—")],
            [t("deposit_f"), String(contract.terms.deposit_amount ?? "—")],
            [t("deposit_days_f"), String(contract.terms.deposit_refund_days ?? "—")],
            [t("payment_day_f"), String(contract.terms.payment_day ?? "—")],
            [t("utilities_f"), contract.terms.utilities_responsibility],
            [t("termination_f"), contract.terms.termination_terms],
            [t("notes_f"), contract.terms.extra_notes],
          ]
            .filter(([, v]) => v && v !== "—")
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-border py-1">
                <dt className="text-muted">{k}</dt>
                <dd className="max-w-[60%] text-end font-semibold text-ink">{v}</dd>
              </div>
            ))}
        </dl>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-bg p-3 text-[11px] text-warn">
          <Icon name="scale" size={14} className="mt-0.5 shrink-0" />
          <span>{t("tpl_draft_notice")}</span>
        </p>
      </div>

      {/* handovers */}
      <div className="rounded-3xl border border-border bg-surface p-5" data-testid="handover-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink-strong">{t("handovers")}</h2>
          <div className="flex gap-2">
            {contract.status === "confirmed" && canCreateCheckIn && myRole && (
              <button
                type="button"
                data-testid="btn-new-checkin"
                onClick={() => setEditor({ kind: "check_in" })}
                className="rounded-xl bg-gold px-3 py-2 text-xs font-bold text-gold-text hover:bg-gold-dark"
              >
                + {t("new_checkin")}
              </button>
            )}
            {confirmedCheckIns.length > 0 && checkOuts.length === 0 && (
              <button
                type="button"
                data-testid="btn-new-checkout"
                onClick={() => setEditor({ kind: "check_out", source: confirmedCheckIns[0]!.id })}
                className="rounded-xl border border-gold px-3 py-2 text-xs font-bold text-ink hover:bg-brand-50"
              >
                + {t("new_checkout")}
              </button>
            )}
          </div>
        </div>

        {handovers.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {handovers.map((h) => (
              <li key={h.id} data-testid="handover-row" data-kind={h.kind} data-status={h.status} className="rounded-xl border border-border bg-bg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-ink">
                    {t(`hkind.${h.kind}`)} · {h.data.occurred_at || h.created_at?.slice(0, 10)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${h.status === "confirmed" ? "bg-success-bg text-success" : "bg-warn-bg text-warn"}`}>
                    {t(`hstatus.${h.status}`)}
                  </span>
                </div>
                {h.hash && <p className="mt-1 break-all font-mono text-[10px] text-muted">SHA-256: {h.hash.slice(0, 24)}…</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="btn-open-handover"
                    onClick={() => (h.status === "confirmed" && h.kind === "check_out" ? setCompare(h) : setEditor({ kind: h.kind, existing: h }))}
                    className="rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
                  >
                    {h.status === "confirmed" && h.kind === "check_out" ? t("side_by_side") : t("edit")}
                  </button>
                  {h.can_confirm && (
                    <button
                      type="button"
                      data-testid="btn-confirm-existing"
                      onClick={() => setEditor({ kind: h.kind, existing: h })}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-field)] bg-success-fill px-3 text-xs font-bold text-on-dark"
                    >
                      <Icon name="key" size={13} className="me-1 inline-block align-[-2px]" />
                      {t("confirm_with_otp")}
                    </button>
                  )}
                  {h.status === "confirmed" && (
                    <button
                      type="button"
                      data-testid="btn-handover-pdf-row"
                      onClick={() => void downloadAuthed(`/handovers/${h.id}/pdf`, `handover-${h.kind}.pdf`)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-field)] border border-gold px-3 text-xs font-bold text-ink transition-colors hover:bg-gold-tint-8"
                    >
                      <Icon name="download" size={13} className="me-1 inline-block align-[-2px]" />
                      PDF
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* editor */}
      {editor && (
        <HandoverEditor
          contractId={contractId}
          kind={editor.kind}
          existing={editor.existing ?? null}
          sourceCheckInId={editor.source ?? editor.existing?.source_handover_id ?? null}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}

      {/* contract OTP confirm */}
      {otpFor === "contract" && (
        <OtpConfirmModal title={t("otp_modal_title")} submitLabel={t("confirm_ok")} onClose={() => setOtpFor(null)} onConfirm={confirmContract} />
      )}

      {/* side-by-side comparison for a check-out */}
      {compare && <ComparisonModal pair={compare} handovers={handovers} onClose={() => setCompare(null)} />}
    </div>
  );
}

function ComparisonModal({ pair, handovers, onClose }: { pair: Handover; handovers: Handover[]; onClose: () => void }) {
  const { t } = useI18n();
  const source = handovers.find((h) => h.id === pair.source_handover_id) || null;
  const cond = (c: string | null | undefined) => (c ? t(`cond.${c}`) : "—");

  return (
    <div className="fixed inset-0 z-[800] overflow-y-auto bg-brand-deep/50 p-3 sm:p-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="mx-auto max-w-4xl rounded-3xl bg-surface p-5" onClick={(e) => e.stopPropagation()} data-testid="comparison-modal">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-strong">{t("side_by_side")}</h2>
          <button type="button" onClick={onClose} aria-label="close" className="icon-button rounded-lg text-muted hover:bg-surface-2">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* rooms table */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs uppercase text-muted">
                <th className="p-2 text-start">{t("item_label")}</th>
                <th className="p-2 text-start">{t("before")}</th>
                <th className="p-2 text-start">{t("current")}</th>
              </tr>
            </thead>
            <tbody>
              {(pair.data.rooms || []).map((room) =>
                room.items.map((item, ii) => {
                  const before = source?.data.rooms.find((r) => r.name === room.name)?.items.find((i) => i.label === item.label);
                  return (
                    <tr key={`${room.name}-${ii}`} className="border-b border-border">
                      <td className="p-2 text-muted">
                        <span className="text-[11px] text-muted">{room.name.replace(/_/g, " ")}</span> · {item.label}
                      </td>
                      <td className="p-2">{cond(before?.condition)}</td>
                      <td className={`p-2 font-semibold ${before && before.condition !== item.condition ? "text-danger" : "text-ink"}`}>{cond(item.condition)}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>

        {/* meters diff */}
        <h3 className="mt-4 text-sm font-bold text-ink">{t("meters")}</h3>
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted">
              <th className="p-2 text-start">{t("meters")}</th>
              <th className="p-2 text-start">{t("before")}</th>
              <th className="p-2 text-start">{t("current")}</th>
              <th className="p-2 text-start">{t("difference")}</th>
            </tr>
          </thead>
          <tbody>
            {["electricity", "water", "gas"].map((m) => {
              const before = Number(source?.data.meters?.[m]?.value || 0);
              const now = Number(pair.data.meters?.[m]?.value || 0);
              return (
                <tr key={m} className="border-b border-border">
                  <td className="p-2 text-muted">{t(`meter_${m}`)}</td>
                  <td className="p-2">{source?.data.meters?.[m]?.value || "—"}</td>
                  <td className="p-2">{pair.data.meters?.[m]?.value || "—"}</td>
                  <td className="p-2 font-bold text-ink" data-testid={`meter-diff-${m}`}>
                    {source && pair.data.meters?.[m]?.value ? (isNaN(now - before) ? "—" : String(now - before)) : "—"}
                  </td>
                </tr>
              );
            })}
            <tr className="border-b border-border">
              <td className="p-2 text-muted">{t("keys_count")}</td>
              <td className="p-2">{source?.data.keys_count ?? "—"}</td>
              <td className="p-2">{pair.data.keys_count ?? "—"}</td>
              <td className="p-2">—</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-muted">
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
