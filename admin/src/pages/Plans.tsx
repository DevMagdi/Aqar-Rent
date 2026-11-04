// Plans + promo codes CRUD (Super Admin).
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Empty, Modal, Spinner, btnDanger, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface Plan {
  id: string;
  name: string;
  price_egp: number;
  duration_days: number;
  priority_weight: number;
  active: boolean;
  created_at: string | null;
}
interface Promo {
  id: string;
  code: string;
  type: string;
  value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string | null;
}

export function Plans() {
  const { toast } = useShell();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [planModal, setPlanModal] = useState(false);
  const [promoModal, setPromoModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const [pf, setPf] = useState({ name: "", price_egp: "500", duration_days: "7", priority_weight: "0" });
  const [prf, setPrf] = useState({ code: "", type: "percent", value: "10", max_uses: "", expires_at: "" });

  const load = useCallback(() => {
    Promise.all([
      api<Plan[]>("/admin/plans"),
      api<Promo[]>("/admin/promo-codes"),
    ])
      .then(([p, pr]) => {
        setPlans(p);
        setPromos(pr);
      })
      .catch((e) => toast(e.message, "err"));
  }, [toast]);
  useEffect(load, [load]);

  async function savePlan() {
    setBusy(true);
    try {
      await api("/admin/plans", {
        method: "POST",
        body: {
          name: pf.name,
          price_egp: Number(pf.price_egp),
          duration_days: Number(pf.duration_days),
          priority_weight: Number(pf.priority_weight),
        },
      });
      toast("Plan created");
      setPlanModal(false);
      setPf({ name: "", price_egp: "500", duration_days: "7", priority_weight: "0" });
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function deactivatePlan(p: Plan) {
    try {
      await api(`/admin/plans/${p.id}`, { method: "DELETE" });
      toast("Plan deactivated");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function togglePlanActive(p: Plan) {
    try {
      await api(`/admin/plans/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      toast("Plan updated");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function savePromo() {
    setBusy(true);
    try {
      await api("/admin/promo-codes", {
        method: "POST",
        body: {
          code: prf.code.toUpperCase(),
          type: prf.type,
          value: Number(prf.value),
          max_uses: prf.max_uses ? Number(prf.max_uses) : null,
          expires_at: prf.expires_at ? new Date(prf.expires_at).toISOString() : null,
        },
      });
      toast("Promo created");
      setPromoModal(false);
      setPrf({ code: "", type: "percent", value: "10", max_uses: "", expires_at: "" });
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function togglePromo(p: Promo) {
    try {
      await api(`/admin/promo-codes/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      toast("Promo updated");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <div className="space-y-5" data-testid="plans-page">
      <Card
        title="Ad plans (backend = source of truth)"
        action={
          <button type="button" data-testid="btn-add-plan" onClick={() => setPlanModal(true)} className={btnPrimary}>
            + New plan
          </button>
        }
      >
        {!plans ? (
          <Spinner />
        ) : plans.length === 0 ? (
          <Empty text="No plans" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-muted">
                <th className="p-2 text-start">Name</th>
                <th className="p-2 text-start">Price</th>
                <th className="p-2 text-start">Duration</th>
                <th className="p-2 text-start">Priority</th>
                <th className="p-2 text-start">Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} data-testid="plan-row" className="border-b border-border">
                  <td className="p-2 font-semibold">{p.name}</td>
                  <td className="p-2">{p.price_egp} EGP</td>
                  <td className="p-2">{p.duration_days} days</td>
                  <td className="p-2">{p.priority_weight}</td>
                  <td className="p-2">
                    <Badge status={p.active ? "active" : "expired"}>{p.active ? "active" : "inactive"}</Badge>
                  </td>
                  <td className="p-2 text-end">
                    <button type="button" onClick={() => togglePlanActive(p)} className="me-2 rounded-lg border border-border-strong px-2.5 py-1 text-xs font-bold">
                      {p.active ? "Disable" : "Enable"}
                    </button>
                    <button type="button" data-testid="btn-delete-plan" onClick={() => deactivatePlan(p)} className="rounded-lg border border-danger/20 px-2.5 py-1 text-xs font-bold text-danger">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title="Promo codes"
        action={
          <button type="button" data-testid="btn-add-promo" onClick={() => setPromoModal(true)} className={btnPrimary}>
            + New promo
          </button>
        }
      >
        {!promos ? (
          <Spinner />
        ) : promos.length === 0 ? (
          <Empty text="No promo codes" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted">
                  <th className="p-2 text-start">Code</th>
                  <th className="p-2 text-start">Value</th>
                  <th className="p-2 text-start">Uses</th>
                  <th className="p-2 text-start">Expires</th>
                  <th className="p-2 text-start">Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id} data-testid="promo-row" className="border-b border-border">
                    <td className="p-2 font-mono font-bold">{p.code}</td>
                    <td className="p-2">
                      {p.type === "percent" ? `${p.value}%` : `${p.value} EGP`}
                    </td>
                    <td className="p-2">
                      {p.used_count}
                      {p.max_uses !== null && ` / ${p.max_uses}`}
                    </td>
                    <td className="p-2 text-xs">{p.expires_at?.slice(0, 10) || "—"}</td>
                    <td className="p-2">
                      <Badge status={p.active ? "active" : "expired"}>{p.active ? "active" : "inactive"}</Badge>
                    </td>
                    <td className="p-2 text-end">
                      <button type="button" data-testid="btn-toggle-promo" onClick={() => togglePromo(p)} className="rounded-lg border border-border-strong px-2.5 py-1 text-xs font-bold">
                        {p.active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {planModal && (
        <Modal
          title="New ad plan"
          onClose={() => setPlanModal(false)}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setPlanModal(false)}>
                Cancel
              </button>
              <button type="button" data-testid="btn-save-plan" className={btnPrimary} disabled={busy || !pf.name} onClick={savePlan}>
                Create
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <input placeholder="Name (e.g. Weekly)" data-testid="input-plan-name" className={inputCls} value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input type="number" placeholder="Price EGP" data-testid="input-plan-price" className={inputCls} value={pf.price_egp} onChange={(e) => setPf({ ...pf, price_egp: e.target.value })} />
              <input type="number" placeholder="Days" className={inputCls} value={pf.duration_days} onChange={(e) => setPf({ ...pf, duration_days: e.target.value })} />
              <input type="number" placeholder="Priority" className={inputCls} value={pf.priority_weight} onChange={(e) => setPf({ ...pf, priority_weight: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {promoModal && (
        <Modal
          title="New promo code"
          onClose={() => setPromoModal(false)}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setPromoModal(false)}>
                Cancel
              </button>
              <button type="button" data-testid="btn-save-promo" className={btnPrimary} disabled={busy || prf.code.length < 3} onClick={savePromo}>
                Create
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <input placeholder="CODE" data-testid="input-promo-code" className={inputCls + " font-mono uppercase"} value={prf.code} onChange={(e) => setPrf({ ...prf, code: e.target.value.toUpperCase() })} />
            <div className="grid grid-cols-2 gap-2">
              <select className={inputCls} value={prf.type} onChange={(e) => setPrf({ ...prf, type: e.target.value })}>
                <option value="percent">percent %</option>
                <option value="fixed">fixed EGP</option>
              </select>
              <input type="number" placeholder="Value" data-testid="input-promo-value" className={inputCls} value={prf.value} onChange={(e) => setPrf({ ...prf, value: e.target.value })} />
              <input type="number" placeholder="Max uses (∞)" className={inputCls} value={prf.max_uses} onChange={(e) => setPrf({ ...prf, max_uses: e.target.value })} />
              <input type="date" className={inputCls} value={prf.expires_at} onChange={(e) => setPrf({ ...prf, expires_at: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
