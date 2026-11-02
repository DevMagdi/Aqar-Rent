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
  created_at: string | null;
}

export function Verifications() {
  const { toast } = useShell();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [viewer, setViewer] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    api<Row[]>(`/admin/verifications?status=${status}&limit=100`)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  }, [status, toast]);
  useEffect(load, [load]);

  async function decide(decision: "approve" | "reject") {
    if (!viewer) return;
    if (decision === "reject" && !reason.trim()) {
      toast("Rejection reason required", "err");
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/verifications/${viewer.id}/decision`, {
        method: "POST",
        body: { decision, reason: reason.trim() || null },
      });
      toast(decision === "approve" ? "Verification approved ✓" : "Verification rejected");
      setViewer(null);
      setReason("");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="verifications-page">
      <h1 className="text-lg font-extrabold text-stone-900">Verification queue</h1>
      <div className="flex gap-1.5">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`tab-${s}`}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === s ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-600"}`}
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
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.id} data-testid="verification-row" className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-stone-900">
                    {r.full_name || "—"} <span className="font-mono text-xs text-stone-400" dir="ltr">{r.phone}</span>
                  </p>
                  <p className="text-xs text-stone-500">
                    {r.doc_type.replace(/_/g, " ")} · {r.created_at?.slice(0, 16).replace("T", " ")}
                  </p>
                  {r.reject_reason && <p className="text-xs text-red-600">{r.reject_reason}</p>}
                </div>
                <Badge status={r.status}>{r.status}</Badge>
                <button
                  type="button"
                  data-testid="btn-view-doc"
                  onClick={() => setViewer(r)}
                  className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-stone-700"
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
                <iframe title="document" src={viewer.file_url} sandbox="allow-same-origin" className="h-96 w-full rounded-xl border border-stone-200" />
              ) : (
                <img src={viewer.file_url} alt="verification document" className="max-h-96 w-full rounded-xl border border-stone-200 object-contain" />
              )
            ) : (
              <Empty text="File URL unavailable (signed link expired)" />
            )}
          </div>
          <label className="mt-3 block text-sm font-semibold text-stone-700" htmlFor="vreason">
            Reject reason (required for reject)
          </label>
          <input id="vreason" data-testid="input-reject-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          <p className="mt-2 text-xs text-stone-400">Document opens via short-lived signed URL — never stored client-side.</p>
        </Modal>
      )}
    </div>
  );
}
