// Bank transfer approvals: view receipt, approve (ad goes live) / reject.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Empty, Modal, Spinner, btnDanger, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface Row {
  id: string;
  order_id: string;
  listing_id: string | null;
  owner_phone: string | null;
  amount: number;
  status: string;
  reference: string | null;
  receipt_url: string | null;
  reject_reason: string | null;
  created_at: string | null;
}

export function BankTransfers() {
  const { toast } = useShell();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    api<Row[]>(`/admin/bank-transfers?status=${status}&limit=100`)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  }, [status, toast]);
  useEffect(load, [load]);

  async function approve() {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/admin/bank-transfers/${target.id}/approve`, { method: "POST" });
      toast("Transfer approved — ad live");
      setTarget(null);
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/admin/bank-transfers/${target.id}/reject`, { method: "POST", body: { reason } });
      toast("Transfer rejected");
      setTarget(null);
      setReason("");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="bank-page">
      <h1 className="text-lg font-extrabold text-ink-strong">Bank transfers</h1>
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
          <Empty text="No transfers in this queue" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} data-testid="transfer-row" className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-strong">
                    {r.amount.toLocaleString()} EGP · ref <span className="font-mono">{r.reference || "—"}</span>
                  </p>
                  <p className="text-xs text-muted" dir="ltr">
                    {r.owner_phone || "—"} · order {r.order_id.slice(0, 8)} · {r.created_at?.slice(0, 16).replace("T", " ")}
                  </p>
                  {r.reject_reason && <p className="text-xs text-danger">{r.reject_reason}</p>}
                </div>
                <Badge status={r.status}>{r.status}</Badge>
                <div className="flex gap-2">
                  {r.receipt_url && (
                    <a href={r.receipt_url} target="_blank" rel="noreferrer" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-bold text-muted hover:bg-bg">
                      Receipt
                    </a>
                  )}
                  {r.status === "pending" && (
                    <button
                      type="button"
                      data-testid="btn-open-transfer"
                      onClick={() => setTarget(r)}
                      className="rounded-lg bg-brand-deep px-3 py-1.5 text-xs font-bold text-on-dark hover:bg-brand-deep"
                    >
                      Review
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {target && (
        <Modal
          title="Review bank transfer"
          onClose={() => setTarget(null)}
          footer={
            <>
              <button type="button" data-testid="btn-transfer-reject" className={btnDanger} disabled={busy} onClick={reject}>
                Reject
              </button>
              <button type="button" data-testid="btn-transfer-approve" className={btnPrimary} disabled={busy} onClick={approve}>
                Approve → ad goes live
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <p>
              {target.amount.toLocaleString()} EGP · reference <b className="font-mono">{target.reference}</b>
            </p>
            {target.receipt_url &&
              (target.receipt_url.toLowerCase().endsWith(".pdf") ? (
                <iframe title="receipt" src={target.receipt_url} sandbox="allow-same-origin" className="h-80 w-full rounded-xl border" />
              ) : (
                <img src={target.receipt_url} alt="receipt" className="max-h-80 w-full rounded-xl border object-contain" />
              ))}
            <label className="block font-semibold text-ink" htmlFor="breject">
              Reject reason
            </label>
            <input id="breject" data-testid="input-transfer-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted">Approval settles the order as paid and activates the ad period (BR-4/BR-5).</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
