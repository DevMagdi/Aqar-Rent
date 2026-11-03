// Reports queue: dismiss / resolve / remove listing / send to moderation.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge, Card, Empty, Modal, Spinner, btnDanger, btnGhost, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface Row {
  id: string;
  listing_id: string;
  listing_title: string;
  reporter_phone: string;
  reason: string;
  note: string | null;
  status: string;
  listing_status: string;
  created_at: string | null;
}

const ACTIONS: { key: string; label: string; danger?: boolean }[] = [
  { key: "dismiss", label: "Dismiss" },
  { key: "resolve", label: "Resolve" },
  { key: "remove_listing", label: "Remove listing", danger: true },
  { key: "to_moderation", label: "Send to moderation" },
];

export function Reports() {
  const { toast } = useShell();
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    api<Row[]>(`/admin/reports?status=${status}&limit=100`)
      .then(setRows)
      .catch((e) => toast(e.message, "err"));
  }, [status, toast]);
  useEffect(load, [load]);

  async function act(action: string) {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/admin/reports/${target.id}/action`, { method: "POST", body: { action, note: note || null } });
      toast(`Report ${action.replace(/_/g, " ")} ✓`);
      setTarget(null);
      setNote("");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="reports-page">
      <h1 className="text-lg font-extrabold text-ink-strong">Reports queue</h1>
      <div className="flex gap-1.5">
        {["open", "reviewing", "resolved", "dismissed"].map((s) => (
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
          <Empty text="No reports in this queue" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} data-testid="report-row" className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-strong">{r.listing_title}</p>
                    <p className="text-xs text-muted">
                      reason: <b className="text-danger">{r.reason}</b> · reporter <span dir="ltr">{r.reporter_phone}</span> · listing status{" "}
                      <Badge status={r.listing_status}>{r.listing_status}</Badge>
                    </p>
                    {r.note && <p className="mt-0.5 text-xs text-muted">“{r.note}”</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={r.status}>{r.status}</Badge>
                    <Link
                      to={`/moderation`}
                      className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-bg"
                    >
                      Listing
                    </Link>
                    <button
                      type="button"
                      data-testid="btn-report-action"
                      onClick={() => setTarget(r)}
                      className="rounded-lg bg-brand-deep px-3 py-1.5 text-xs font-bold text-on-dark hover:bg-brand-deep"
                    >
                      Act
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {target && (
        <Modal
          title="Act on report"
          onClose={() => setTarget(null)}
          footer={
            <button type="button" data-modal-dismiss="true" className={btnGhost} onClick={() => setTarget(null)}>
              Cancel
            </button>
          }
        >
          <p className="text-sm text-muted">
            <b>{target.listing_title}</b> — {target.reason}
          </p>
          <label className="mt-3 block text-sm font-semibold text-ink" htmlFor="rnote">
            Note (optional)
          </label>
          <input id="rnote" data-testid="input-report-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                data-testid={`action-${a.key}`}
                disabled={busy}
                onClick={() => act(a.key)}
                className={a.danger ? btnDanger : btnGhost}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
