// Staff & roles: the backend exposes no staff CRUD API, so this page shows the
// role matrix + per-staff activity from the audit log (super admin).
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Spinner } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface AuditRow {
  id: string;
  staff_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string | null;
}

const MATRIX: { capability: string; super_admin: boolean; finance: boolean; moderator: boolean }[] = [
  { capability: "Approve / reject listings", super_admin: true, finance: false, moderator: true },
  { capability: "Verification decisions", super_admin: true, finance: false, moderator: true },
  { capability: "Report actions", super_admin: true, finance: false, moderator: true },
  { capability: "Ban / unban users", super_admin: true, finance: false, moderator: true },
  { capability: "Payments + refunds", super_admin: true, finance: true, moderator: false },
  { capability: "Bank transfer approvals", super_admin: true, finance: true, moderator: false },
  { capability: "Plans & promo codes", super_admin: true, finance: false, moderator: false },
  { capability: "Audit log viewer", super_admin: true, finance: false, moderator: false },
];

export function StaffPage() {
  const { toast } = useShell();
  const [logs, setLogs] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    api<AuditRow[]>("/admin/audit-logs?limit=200")
      .then(setLogs)
      .catch((e) => toast(e.message, "err"));
  }, [toast]);

  const byStaff = (logs || []).reduce<Record<string, number>>((acc, l) => {
    if (l.staff_id) acc[l.staff_id] = (acc[l.staff_id] || 0) + 1;
    return acc;
  }, {});
  const staffIds = Object.keys(byStaff);

  return (
    <div className="space-y-5" data-testid="staff-page">
      <Card title="Role matrix (StaffRole — enforced by the API)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs uppercase text-stone-400">
                <th className="p-2 text-start">Capability</th>
                <th className="p-2 text-center">Super Admin</th>
                <th className="p-2 text-center">Finance</th>
                <th className="p-2 text-center">Moderator</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((m) => (
                <tr key={m.capability} className="border-b border-stone-100">
                  <td className="p-2 font-semibold text-stone-800">{m.capability}</td>
                  {[m.super_admin, m.finance, m.moderator].map((v, i) => (
                    <td key={i} className="p-2 text-center">
                      {v ? <span className="text-emerald-600">✓</span> : <span className="text-stone-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone-400">
          Staff provisioning runs through the backend seed/config (<code>STAFF_SUPER_ADMIN_*</code>) — the API exposes no staff CRUD, so
          accounts are managed there (documented gap, no invented endpoints).
        </p>
      </Card>

      <Card title="Activity by staff (from audit log)">
        {!logs ? (
          <Spinner />
        ) : staffIds.length === 0 ? (
          <p className="text-sm text-stone-400">No staff activity recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {staffIds.map((sid) => (
              <li key={sid} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                <span className="font-mono text-xs">{sid.slice(0, 8)}…</span>
                <Badge status="active">{byStaff[sid]} actions</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
