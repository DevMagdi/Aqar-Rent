// Moderation queue + detail: approve / reject with preset reasons / request
// changes (reject+note → owner edits and resubmits).
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Empty, Modal, Spinner, btnDanger, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";
import { Icon } from "@/components/Icon";

/** Mirrors backend app/models/enums.py::REJECT_REASONS (no settings API — read-only). */
export const REJECT_REASONS: [string, string][] = [
  ["fake_photos", "Photos do not match the property or are not real"],
  ["phone_in_photos", "Phone numbers or watermarks visible in photos"],
  ["phone_in_description", "Phone numbers or contact details in the description"],
  ["wrong_location", "Wrong or misleading location"],
  ["price_misleading", "Price not monthly in EGP or misleading"],
  ["not_for_rent", "Listing is for sale or not actually for rent"],
  ["duplicate_listing", "Duplicate listing"],
  ["broker_suspected", "Suspected broker / agency activity"],
  ["not_owner", "Uploader does not appear to be the owner"],
  ["other", "Other (see note)"],
];

interface QueueItem {
  id: string;
  listing_id: string;
  title: string | null;
  status: string;
  owner_phone: string | null;
  owner_name: string | null;
  verification_status: string | null;
  report_count: number;
  rent_monthly: number | null;
  governorate_name: string | null;
  reject_reason: string | null;
  created_at: string | null;
}

interface Detail {
  id: string;
  title: string;
  status: string;
  reject_reason: string | null;
  rent_monthly: number;
  property_type: string;
  governorate_name: string | null;
  city_name: string | null;
  district_name: string | null;
  address_text: string;
  description: string;
  owner_id: string;
  owner_phone: string;
  owner_name: string | null;
  owner_verification_status: string;
  reports_count: number;
  media_urls: string[];
  created_at: string | null;
  published_at: string | null;
  view_count: number;
}

const STATUSES = ["submitted", "approved", "active", "rejected", "expired", "rented", "removed"];

export function Moderation() {
  const { toast } = useShell();
  const [status, setStatus] = useState("submitted");
  const [rows, setRows] = useState<QueueItem[] | null>(null);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState(REJECT_REASONS[0]![0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    const params = new URLSearchParams({ status, limit: "100" });
    if (q.trim()) params.set("q", q.trim());
    api<QueueItem[]>(`/admin/listings?${params}`)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  }, [status, q, toast]);

  useEffect(load, [load]);

  async function openDetail(id: string) {
    try {
      setDetail(await api<Detail>(`/admin/listings/${id}`));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function approve() {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/admin/listings/${detail.id}/approve`, { method: "POST" });
      toast("Listing approved");
      setDetail(null);
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/admin/listings/${detail.id}/reject`, { method: "POST", body: { reason_code: reasonCode, note: note || null } });
      toast("Rejected — owner can edit & resubmit");
      setRejectOpen(false);
      setNote("");
      setDetail(null);
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="moderation-page">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto text-lg font-extrabold text-ink-strong">Moderation queue</h1>
        <input
          data-testid="moderation-search"
          placeholder="Owner phone / user id"
          className={inputCls + " w-52"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`tab-${s}`}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              status === s ? "bg-brand-deep text-on-dark" : "border border-border-strong bg-surface text-muted hover:bg-bg"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <Card>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="Queue is empty. Nothing is waiting for review." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted">
                  <th className="p-2 text-start">Listing</th>
                  <th className="p-2 text-start">Owner</th>
                  <th className="p-2 text-start">Price</th>
                  <th className="p-2 text-start">Verify</th>
                  <th className="p-2 text-start">Reports</th>
                  <th className="p-2 text-start">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid="queue-row" className="border-b border-border hover:bg-bg">
                    <td className="max-w-56 p-2">
                      <p className="truncate font-semibold text-ink-strong">{r.title || r.listing_id.slice(0, 8)}</p>
                      <p className="text-xs text-muted">{r.governorate_name || ""}</p>
                    </td>
                    <td className="p-2 text-xs" dir="ltr">
                      {r.owner_phone || "—"}
                      {r.owner_name && <p className="text-muted">{r.owner_name}</p>}
                    </td>
                    <td className="p-2 font-semibold">{r.rent_monthly?.toLocaleString() ?? "—"}</td>
                    <td className="p-2">
                      <Badge status={r.verification_status || ""}>{r.verification_status || "—"}</Badge>
                    </td>
                    <td className="p-2">{r.report_count > 0 ? <Badge status="rejected">{r.report_count}</Badge> : "0"}</td>
                    <td className="p-2">
                      <Badge status={r.status}>{r.status}</Badge>
                      {r.reject_reason && <p className="text-[10px] text-danger">{r.reject_reason}</p>}
                    </td>
                    <td className="p-2 text-end">
                      <button
                        type="button"
                        data-testid="btn-open-detail"
                        onClick={() => openDetail(r.listing_id)}
                        className="rounded-lg bg-brand-deep px-3 py-1.5 text-xs font-bold text-on-dark hover:bg-brand-deep"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <Modal
          title="Listing review"
          onClose={() => setDetail(null)}
          footer={
            <>
              <button type="button" data-modal-dismiss="true" className={btnGhost} onClick={() => setDetail(null)}>
                Close
              </button>
              <button type="button" data-testid="btn-reject" className={btnDanger} onClick={() => setRejectOpen(true)}>
                Reject / request changes
              </button>
              <button type="button" data-testid="btn-approve" className={btnPrimary} disabled={busy} onClick={approve}>
                Approve
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm" data-testid="moderation-detail">
            <div className="grid grid-cols-4 gap-2">
              {detail.media_urls.slice(0, 8).map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-surface-2">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
            <h4 className="font-bold text-ink-strong">{detail.title}</h4>
            <p className="font-semibold text-ink">{detail.rent_monthly.toLocaleString()} EGP/month · {detail.property_type.replace(/_/g, " ")}</p>
            <p className="flex items-center gap-1.5 text-muted"><Icon name="pin" size={13} /> {detail.address_text}, {detail.district_name || ""} {detail.city_name || ""} {detail.governorate_name || ""}</p>
            <p className="whitespace-pre-line rounded-xl bg-bg p-3 text-ink">{detail.description}</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-bg p-3">
              <p>
                Owner: <b>{detail.owner_name || "—"}</b>
              </p>
              <p dir="ltr">{detail.owner_phone}</p>
              <p>
                Verification: <Badge status={detail.owner_verification_status}>{detail.owner_verification_status}</Badge>
              </p>
              <p>
                Reports: <b>{detail.reports_count}</b> · Views: <b>{detail.view_count}</b>
              </p>
              <p>
                Status: <Badge status={detail.status}>{detail.status}</Badge>
              </p>
              <p className="text-xs text-muted">{detail.created_at?.slice(0, 16).replace("T", " ")}</p>
            </div>
          </div>
        </Modal>
      )}

      {rejectOpen && detail && (
        <Modal
          title="Reject / request changes"
          onClose={() => setRejectOpen(false)}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setRejectOpen(false)}>
                Cancel
              </button>
              <button type="button" data-testid="btn-reject-confirm" className={btnDanger} disabled={busy} onClick={reject}>
                Confirm reject
              </button>
            </>
          }
        >
          <label className="block text-sm font-semibold text-ink" htmlFor="reason">
            Preset reason
          </label>
          <select id="reason" data-testid="select-reason" className={inputCls} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {REJECT_REASONS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-sm font-semibold text-ink" htmlFor="note">
            Note to owner (optional)
          </label>
          <textarea id="note" data-testid="input-note" rows={3} maxLength={1000} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="mt-2 text-xs text-muted">
            The listing returns to <b>rejected</b>: the owner can edit it and resubmit (this is how “request changes” works in the backend).
          </p>
        </Modal>
      )}
    </div>
  );
}
