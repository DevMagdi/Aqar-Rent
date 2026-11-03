// Users: search, activity summary, ban/unban account, listing cap.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Empty, Modal, Spinner, btnDanger, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface Row {
  id: string;
  phone: string;
  full_name: string | null;
  email: string | null;
  status: string;
  verification_status: string;
  listing_cap: number | null;
  listings_count: number;
  created_at: string | null;
}

export function Users() {
  const { toast } = useShell();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    const p = new URLSearchParams({ limit: "100" });
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    api<Row[]>(`/admin/users?${p}`)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  }, [q, status, toast]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  async function patch(body: Record<string, unknown>, label: string) {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/admin/users/${target.id}`, { method: "PATCH", body });
      toast(`${label} ✓`);
      setTarget(null);
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto text-lg font-extrabold text-ink-strong">Users</h1>
        <input data-testid="users-search" placeholder="Phone / name / id" className={inputCls + " w-56"} value={q} onChange={(e) => setQ(e.target.value)} />
        <select data-testid="users-status-filter" className={inputCls + " w-36"} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">active</option>
          <option value="banned">banned</option>
        </select>
      </div>

      <Card>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No users found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th className="p-2 text-start">User</th>
                  <th className="p-2 text-start">Status</th>
                  <th className="p-2 text-start">Verification</th>
                  <th className="p-2 text-start">Listings</th>
                  <th className="p-2 text-start">Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid="user-row" className="border-b border-border hover:bg-bg">
                    <td className="p-2">
                      <p className="font-semibold text-ink-strong">{r.full_name || "—"}</p>
                      <p className="text-xs text-muted" dir="ltr">
                        {r.phone}
                      </p>
                    </td>
                    <td className="p-2">
                      <Badge status={r.status}>{r.status}</Badge>
                    </td>
                    <td className="p-2">
                      <Badge status={r.verification_status}>{r.verification_status}</Badge>
                    </td>
                    <td className="p-2">
                      {r.listings_count}
                      {r.listing_cap !== null && <span className="text-xs text-muted"> / cap {r.listing_cap}</span>}
                    </td>
                    <td className="p-2 text-xs text-muted">{r.created_at?.slice(0, 10)}</td>
                    <td className="p-2 text-end">
                      <button
                        type="button"
                        data-testid="btn-user-actions"
                        onClick={() => setTarget(r)}
                        className="rounded-lg bg-brand-deep px-3 py-1.5 text-xs font-bold text-on-dark hover:bg-brand-deep"
                      >
                        Manage
                      </button>
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
          title={`Manage — ${target.full_name || target.phone}`}
          onClose={() => setTarget(null)}
          footer={
            <button type="button" data-modal-dismiss="true" className={btnGhost} onClick={() => setTarget(null)}>
              Close
            </button>
          }
        >
          <div className="space-y-3 text-sm" data-testid="user-actions">
            <div className="rounded-xl bg-bg p-3">
              <p>
                Status: <Badge status={target.status}>{target.status}</Badge> · Listings: <b>{target.listings_count}</b> · Cap:{" "}
                <b>{target.listing_cap ?? "default (5)"}</b>
              </p>
              <p className="text-xs text-muted">Joined {target.created_at?.slice(0, 10)} · verification {target.verification_status}</p>
            </div>
            {target.status === "active" ? (
              <button
                type="button"
                data-testid="btn-ban-user"
                disabled={busy}
                onClick={() => patch({ status: "banned" }, "User banned")}
                className={`w-full ${btnDanger}`}
              >
                Ban account (blocks login + listing contact)
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-unban-user"
                disabled={busy}
                onClick={() => patch({ status: "active" }, "User unbanned")}
                className={`w-full ${btnPrimary}`}
              >
                Unban account
              </button>
            )}
            <button
              type="button"
              data-testid="btn-raise-cap"
              disabled={busy}
              onClick={() => patch({ listing_cap: (target.listing_cap ?? 5) + 5 }, "Listing cap raised")}
              className={`w-full ${btnGhost}`}
            >
              Raise listing cap by +5
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
