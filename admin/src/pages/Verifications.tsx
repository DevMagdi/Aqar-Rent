// Verification queue with secure document viewer (signed short-lived URLs).
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Empty, Modal, Spinner, btnDanger, btnPrimary, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface Row {
  id: string;
  user_id: string;
  phone: string;
  full_name: string | null;
  doc_type: string;
  status: string;
  file_url: string | null;
  reject_reason: string | null;
  reject_reason_code?: string | null;
  appeal_status?: string;
  appeal_note?: string | null;
  created_at: string | null;
}

export function Verifications() {
  const { toast } = useShell();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [viewer, setViewer] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasons, setReasons] = useState<Record<string, { en: string; ar: string }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    api<Row[]>(`/admin/verifications?status=${status}&limit=100`)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  }, [status, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    api<{ reasons: Record<string, { en: string; ar: string }> }>("/trust/reject-reasons")
      .then((r) => setReasons(r.reasons))
      .catch(() => {});
  }, []);

  async function decide(decision: "approve" | "reject") {
    if (!viewer) return;
    if (decision === "reject" && !reason.trim() && !reasonCode) {
      toast("Rejection reason required", "err");
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/verifications/${viewer.id}/decision`, {
        method: "POST",
        body: { decision, reason: reason.trim() || null, reason_code: reasonCode || null },
      });
      toast(decision === "approve" ? "Verification approved ✓" : "Verification rejected");
      setViewer(null);
      setReason("");
      setReasonCode("");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="verifications-page">
      <h1 className="text-lg font-extrabold text-ink-strong">Verification queue</h1>
      <div className="flex gap-1.5">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`tab-${s}`}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === s ? "bg-brand-deep text-on-dark" : "border border-border-strong bg-surface text-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <Card>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No documents in this queue" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} data-testid="verification-row" className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-strong">
                    {r.full_name || "—"} <span className="font-mono text-xs text-muted" dir="ltr">{r.phone}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {r.doc_type.replace(/_/g, " ")} · {r.created_at?.slice(0, 16).replace("T", " ")}
                  </p>
                  {r.reject_reason && <p className="text-xs text-danger">{r.reject_reason}</p>}
                  {r.appeal_status && r.appeal_status !== "none" && (
                    <p className="text-xs text-warn">Appeal: {r.appeal_status} — {r.appeal_note || ""}</p>
                  )}
                </div>
                <Badge status={r.status}>{r.status}</Badge>
                <button
                  type="button"
                  data-testid="btn-view-doc"
                  onClick={() => setViewer(r)}
                  className="rounded-lg bg-brand-deep px-3 py-1.5 text-xs font-bold text-on-dark hover:bg-brand-deep"
                >
                  View document
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {viewer && (
        <Modal
          title={`Document — ${viewer.doc_type.replace(/_/g, " ")}`}
          onClose={() => {
            setViewer(null);
            setReason("");
            setReasonCode("");
          }}
          footer={
            <>
              <button
                type="button"
                data-testid="btn-reject-doc"
                className={btnDanger}
                disabled={busy}
                onClick={() => decide("reject")}
              >
                Reject
              </button>
              <button
                type="button"
                data-testid="btn-approve-doc"
                className={btnPrimary}
                disabled={busy}
                onClick={() => decide("approve")}
              >
                Approve
              </button>
            </>
          }
        >
          <div data-testid="doc-viewer">
            {viewer.file_url ? (
              viewer.file_url.toLowerCase().endsWith(".pdf") ? (
                <iframe title="document" src={viewer.file_url} sandbox="allow-same-origin" className="h-96 w-full rounded-xl border border-border" />
              ) : (
                <img src={viewer.file_url} alt="verification document" className="max-h-96 w-full rounded-xl border border-border object-contain" />
              )
            ) : (
              <Empty text="File URL unavailable (signed link expired)" />
            )}
          </div>
          <label className="mt-3 block text-sm font-semibold text-ink" htmlFor="vreason">
            Reject reason (required for reject)
          </label>
          <select
            id="vreasoncode"
            aria-label="Structured rejection reason"
            className={`${inputCls} mb-2`}
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          >
            <option value="">Structured reason (optional)</option>
            {Object.entries(reasons).map(([code, labels]) => (
              <option key={code} value={code}>{code} — {labels.en}</option>
            ))}
          </select>
          <input id="vreason" data-testid="input-reject-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          <p className="mt-2 text-xs text-muted">Document opens via short-lived signed URL — never stored client-side.</p>
        </Modal>
      )}
    </div>
  );
}
