// Payments: list + revenue charts + refunds + CSV export.
import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { Badge, BarChart, Card, Empty, Modal, Spinner, btnDanger, btnGhost, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface Row {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  status: string;
  gateway: string | null;
  gateway_txn_id: string | null;
  owner_phone: string | null;
  listing_id: string | null;
  created_at: string | null;
}

interface Revenue {
  total_paid_egp: number;
  total_refunded_egp: number;
  net_egp: number;
  count_paid: number;
  daily: { bucket: string; total_egp: number }[];
  monthly: { bucket: string; total_egp: number }[];
  by_method: { method: string; total_egp: number }[];
}

export function Payments() {
  const { toast } = useShell();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rev, setRev] = useState<Revenue | null>(null);
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [target, setTarget] = useState<Row | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    const p = new URLSearchParams({ limit: "100" });
    if (status) p.set("status", status);
    if (method) p.set("method", method);
    Promise.all([api<Row[]>(`/admin/payments?${p}`), api<Revenue>("/admin/payments/revenue")])
      .then(([list, r]) => {
        setRows(list);
        setRev(r);
      })
      .catch((e) => toast(e.message, "err"));
  }, [status, method, toast]);
  useEffect(load, [load]);

  async function refund() {
    if (!target) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { reason: reason || "" };
      if (amount.trim()) body.amount = Number(amount);
      await api(`/admin/payments/${target.id}/refund`, { method: "POST", body });
      toast("Refund issued ✓");
      setTarget(null);
      setAmount("");
      setReason("");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (method) p.set("method", method);
      const res = await fetch(`/api/v1/admin/payments/export?${p}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payments.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4" data-testid="payments-page">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto text-lg font-extrabold text-stone-900">Payments & refunds</h1>
        <select data-testid="filter-status" className={inputCls + " w-36"} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="paid">paid</option>
          <option value="failed">failed</option>
          <option value="refunded">refunded</option>
        </select>
        <select data-testid="filter-method" className={inputCls + " w-40"} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>
          <option value="card">card</option>
          <option value="fawry">fawry</option>
          <option value="vodafone_cash">vodafone_cash</option>
          <option value="bank_transfer">bank_transfer</option>
        </select>
        <button type="button" data-testid="btn-export" onClick={exportCsv} className={btnGhost}>
          Export CSV
        </button>
      </div>

      {rev && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-4" data-testid="revenue-total">
            <p className="text-xs font-semibold uppercase text-stone-400">Total paid</p>
            <p className="text-xl font-extrabold text-stone-900">{rev.total_paid_egp.toLocaleString()} EGP</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-stone-400">Refunded</p>
            <p className="text-xl font-extrabold text-red-700">{rev.total_refunded_egp.toLocaleString()} EGP</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-stone-400">Net revenue</p>
            <p className="text-xl font-extrabold text-emerald-700">{rev.net_egp.toLocaleString()} EGP</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-stone-400">Paid orders</p>
            <p className="text-xl font-extrabold text-stone-900">{rev.count_paid}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Last 14 days (EGP)">
          {rev ? <BarChart data={rev.daily.slice(-14).map((d) => [d.bucket.slice(5), Math.round(d.total_egp)] as [string, number])} /> : <Spinner />}
        </Card>
        <Card title="By month">
          {rev ? <BarChart data={rev.monthly.map((m) => [m.bucket, Math.round(m.total_egp)] as [string, number])} /> : <Spinner />}
        </Card>
        <Card title="By method">
          {rev ? <BarChart data={rev.by_method.map((m) => [m.method, Math.round(m.total_egp)] as [string, number])} /> : <Spinner />}
        </Card>
      </div>

      <Card title="Transactions">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No payments match the filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-400">
                  <th className="p-2 text-start">Order</th>
                  <th className="p-2 text-start">Owner</th>
                  <th className="p-2 text-start">Method</th>
                  <th className="p-2 text-start">Amount</th>
                  <th className="p-2 text-start">Status</th>
                  <th className="p-2 text-start">Gateway txn</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid="payment-row" className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="p-2 font-mono text-xs">{r.order_id.slice(0, 8)}</td>
                    <td className="p-2 text-xs" dir="ltr">
                      {r.owner_phone || "—"}
                    </td>
                    <td className="p-2">{r.method}</td>
                    <td className="p-2 font-semibold">{r.amount.toLocaleString()}</td>
                    <td className="p-2">
                      <Badge status={r.status}>{r.status}</Badge>
                    </td>
                    <td className="p-2 font-mono text-xs text-stone-400">{r.gateway_txn_id || "—"}</td>
                    <td className="p-2 text-end">
                      {r.status === "paid" && (
                        <button
                          type="button"
                          data-testid="btn-refund"
                          onClick={() => setTarget(r)}
                          className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {target && (
        <Modal
          title="Issue refund"
          onClose={() => setTarget(null)}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setTarget(null)}>
                Cancel
              </button>
              <button type="button" data-testid="btn-refund-confirm" className={btnDanger} disabled={busy} onClick={refund}>
                {amount.trim() ? "Refund amount" : "Full refund (BR-8)"}
              </button>
            </>
          }
        >
          <p className="text-sm text-stone-600">
            Order <b className="font-mono">{target.order_id.slice(0, 8)}</b> · {target.amount.toLocaleString()} EGP · {target.method}
          </p>
          <label className="mt-3 block text-sm font-semibold text-stone-700" htmlFor="ramt">
            Partial amount (empty = full refund)
          </label>
          <input id="ramt" data-testid="input-refund-amount" type="number" min="1" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label className="mt-3 block text-sm font-semibold text-stone-700" htmlFor="rreason">
            Reason
          </label>
          <input id="rreason" data-testid="input-refund-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Modal>
      )}
    </div>
  );
}
