// Audit log viewer (super admin): filter by entity/action, expand before/after.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Empty, Spinner, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface Row {
  id: string;
  staff_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  created_at: string | null;
}

export function AuditLog() {
  const { toast } = useShell();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    const p = new URLSearchParams({ limit: "100" });
    if (entity) p.set("entity", entity);
    if (action) p.set("action", action);
    api<Row[]>(`/admin/audit-logs?${p}`)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  }, [entity, action, toast]);
  useEffect(load, [load]);

  return (
    <div className="space-y-4" data-testid="audit-page">
      <div className="flex flex-wrap gap-2">
        <h1 className="me-auto text-lg font-extrabold text-stone-900">Audit log</h1>
        <input placeholder="entity (e.g. listing)" className={inputCls + " w-44"} value={entity} onChange={(e) => setEntity(e.target.value)} />
        <input placeholder="action (e.g. approve)" className={inputCls + " w-44"} value={action} onChange={(e) => setAction(e.target.value)} />
      </div>

      <Card>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No audit entries match" />
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.id} data-testid="audit-row" className="py-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="flex w-full flex-wrap items-center gap-3 text-start text-sm hover:bg-stone-50"
                >
                  <span className="font-mono text-xs text-stone-400">{r.created_at?.slice(0, 16).replace("T", " ")}</span>
                  <span className="rounded bg-stone-900 px-2 py-0.5 text-xs font-bold text-white">{r.action}</span>
                  <span className="text-stone-600">
                    {r.entity}
                    {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}
                  </span>
                  <span className="ms-auto font-mono text-[11px] text-stone-400">
                    {r.staff_id ? `staff ${r.staff_id.slice(0, 8)}` : "system"} {r.ip ? `· ${r.ip}` : ""}
                  </span>
                </button>
                {open === r.id && (
                  <div className="mt-2 grid gap-2 rounded-xl bg-stone-50 p-3 text-xs md:grid-cols-2">
                    <div>
                      <p className="mb-1 font-bold uppercase text-stone-400">before</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2">{JSON.stringify(r.before, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="mb-1 font-bold uppercase text-stone-400">after</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2">{JSON.stringify(r.after, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
