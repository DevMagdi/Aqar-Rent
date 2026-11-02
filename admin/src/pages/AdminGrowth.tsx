// Phase 5 admin surfaces: subscription plans, ad packages, office verification,
// verification appeals, premium trust grants, payment audit & reconciliation.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, Empty, Spinner, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { useShell } from "@/components/Shell";

interface SubPlan {
  id: string;
  code: string;
  audience: string;
  name_ar: string;
  name_en: string;
  monthly_price_egp: number;
  listing_limit: number;
  seats: number;
  priority_weight: number;
  features: Record<string, boolean>;
  active: boolean;
}
interface Package {
  id: string;
  code: string;
  name_en: string;
  weeks: number;
  discount_pct: number;
  subtotal: number;
  total: number;
  priority_weight: number;
  is_featured: boolean;
}
interface Office {
  id: string;
  slug: string;
  name_en: string;
  commercial_register: string | null;
  license_no: string | null;
  tax_id: string | null;
  verification_status: string;
}
interface Appeal {
  doc_id: string;
  user_id: string;
  doc_type: string;
  reject_reason: string | null;
  reject_reason_code: string | null;
  appeal_note: string | null;
  appeal_submitted_at: string | null;
}
interface PaymentEvent {
  id: string;
  event: string;
  provider: string | null;
  gateway_txn_id: string | null;
  amount: number | null;
  created_at: string;
}
interface Recon {
  consistent: boolean;
  paid_orders: number;
  captured_payments: number;
  gateway_webhooks: number;
  refunded_orders: number;
  total_paid_egp: number;
  mismatches: string[];
}

function useLoad<T>(path: string, deps: unknown[] = []) {
  const { toast } = useShell();
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setBusy(true);
    api<T>(path)
      .then(setData)
      .catch((e) => toast(e.message, "err"))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, toast, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, busy, load, toast, setData };
}

export function PlansPackages() {
  const plans = useLoad<SubPlan[]>("/admin/growth/subscription-plans");
  const packages = useLoad<Package[]>("/admin/growth/ad-packages");
  const [form, setForm] = useState({
    code: "",
    audience: "individual",
    name_ar: "",
    name_en: "",
    monthly_price_egp: "299",
    listing_limit: "15",
    seats: "1",
  });
  const [pkg, setPkg] = useState({
    code: "",
    name_ar: "",
    name_en: "",
    weeks: "4",
    discount_pct: "10",
    priority_weight: "1",
    is_featured: false,
  });

  async function createPlan() {
    try {
      await api("/admin/growth/subscription-plans", {
        method: "POST",
        body: {
          ...form,
          monthly_price_egp: Number(form.monthly_price_egp),
          listing_limit: Number(form.listing_limit),
          seats: Number(form.seats),
          features: { analytics: true },
        },
      });
      plans.toast("Subscription plan created ✓");
      plans.load();
    } catch (e) {
      plans.toast((e as Error).message, "err");
    }
  }
  async function createPackage() {
    try {
      await api("/admin/growth/ad-packages", {
        method: "POST",
        body: {
          ...pkg,
          weeks: Number(pkg.weeks),
          discount_pct: Number(pkg.discount_pct),
          priority_weight: Number(pkg.priority_weight),
        },
      });
      packages.toast("Ad package created ✓");
      packages.load();
    } catch (e) {
      packages.toast((e as Error).message, "err");
    }
  }

  return (
    <div className="space-y-4" data-testid="growth-plans-page">
      <h1 className="text-lg font-extrabold text-stone-900">Pricing · plans & packages</h1>
      <p className="text-xs text-stone-500">All prices are stored in the database and served to web/mobile from one public endpoint.</p>
      <Card title="Subscription tiers">
        {plans.busy || !plans.data ? <Spinner /> : plans.data.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-stone-500"><tr><th>Code</th><th>Audience</th><th>Name</th><th>EGP/mo</th><th>Listings</th><th>Seats</th><th>Status</th></tr></thead>
              <tbody>
                {plans.data.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="font-mono text-xs">{p.code}</td><td>{p.audience}</td><td>{p.name_en}</td>
                    <td>{p.monthly_price_egp}</td><td>{p.listing_limit}</td><td>{p.seats}</td>
                    <td><Badge status={p.active ? "active" : "expired"}>{p.active ? "active" : "off"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <input className={inputCls} placeholder="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <select className={inputCls} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
            <option value="individual">individual</option><option value="office">office</option>
          </select>
          <input className={inputCls} placeholder="Name (EN)" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          <input className={inputCls} placeholder="Name (AR)" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="EGP / month" value={form.monthly_price_egp} onChange={(e) => setForm({ ...form, monthly_price_egp: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="Listing limit" value={form.listing_limit} onChange={(e) => setForm({ ...form, listing_limit: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="Seats" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
          <button className={btnPrimary} type="button" onClick={() => void createPlan()}>Create plan</button>
        </div>
      </Card>
      <Card title="Multi-week packages">
        {packages.busy || !packages.data ? <Spinner /> : packages.data.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs text-stone-500"><tr><th>Code</th><th>Weeks</th><th>Discount</th><th>Price</th><th>Priority</th><th>Featured</th></tr></thead>
              <tbody>
                {packages.data.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="font-mono text-xs">{p.code}</td><td>{p.weeks}</td><td>{p.discount_pct}%</td>
                    <td>{p.total} EGP</td><td>{p.priority_weight}</td><td>{p.is_featured ? "★" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <input className={inputCls} placeholder="code" value={pkg.code} onChange={(e) => setPkg({ ...pkg, code: e.target.value })} />
          <input className={inputCls} placeholder="Name (EN)" value={pkg.name_en} onChange={(e) => setPkg({ ...pkg, name_en: e.target.value })} />
          <input className={inputCls} placeholder="Name (AR)" value={pkg.name_ar} onChange={(e) => setPkg({ ...pkg, name_ar: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="weeks" value={pkg.weeks} onChange={(e) => setPkg({ ...pkg, weeks: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="discount %" value={pkg.discount_pct} onChange={(e) => setPkg({ ...pkg, discount_pct: e.target.value })} />
          <input className={inputCls} inputMode="numeric" placeholder="priority" value={pkg.priority_weight} onChange={(e) => setPkg({ ...pkg, priority_weight: e.target.value })} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={pkg.is_featured} onChange={(e) => setPkg({ ...pkg, is_featured: e.target.checked })} /> Featured</label>
          <button className={btnPrimary} type="button" onClick={() => void createPackage()}>Create package</button>
        </div>
      </Card>
    </div>
  );
}

export function OfficesAdmin() {
  const { data, busy, load, toast } = useLoad<Office[]>("/admin/growth/offices");
  const [note, setNote] = useState("");

  async function decide(id: string, decision: string) {
    try {
      await api(`/admin/growth/offices/${id}/decision`, { method: "POST", body: { decision, note: note || undefined } });
      toast(`Office ${decision} ✓`);
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }
  return (
    <div className="space-y-4" data-testid="growth-offices-page">
      <h1 className="text-lg font-extrabold text-stone-900">Office verification queue</h1>
      <input className={`${inputCls} max-w-sm`} placeholder="Rejection / info request note" value={note} onChange={(e) => setNote(e.target.value)} />
      {busy || !data ? <Spinner /> : data.length === 0 ? <Empty text="No offices yet" /> : (
        <div className="space-y-2">
          {data.map((o) => (
            <Card key={o.id} title={`${o.name_en} · /${o.slug}`}>
              <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600">
                <Badge status={o.verification_status}>{o.verification_status}</Badge>
                <span>CR: {o.commercial_register || "—"}</span><span>Licence: {o.license_no || "—"}</span>
                <span>Tax ID: {o.tax_id || "—"}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button className={btnPrimary} type="button" onClick={() => void decide(o.id, "verify")}>Verify</button>
                <button className={btnGhost} type="button" onClick={() => void decide(o.id, "request_info")}>Request info</button>
                <button className={btnGhost} type="button" onClick={() => void decide(o.id, "reject")}>Reject</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppealsAdmin() {
  const { data, busy, load, toast } = useLoad<Appeal[]>("/admin/growth/appeals");
  const [note, setNote] = useState("");

  async function decide(docId: string, decision: string) {
    try {
      await api(`/admin/growth/appeals/${docId}/decision`, { method: "POST", body: { decision, note } });
      toast(decision === "approve" ? "Appeal accepted → document reopened ✓" : "Appeal rejected");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }
  return (
    <div className="space-y-4" data-testid="growth-appeals-page">
      <h1 className="text-lg font-extrabold text-stone-900">Verification appeals</h1>
      <p className="text-xs text-stone-500">One appeal per rejected document. Accepting reopens the document in the verification queue.</p>
      <input className={`${inputCls} max-w-sm`} placeholder="Decision note" value={note} onChange={(e) => setNote(e.target.value)} />
      {busy || !data ? <Spinner /> : data.length === 0 ? <Empty text="No pending appeals" /> : (
        <div className="space-y-2">
          {data.map((a) => (
            <Card key={a.doc_id} title={`${a.doc_type} · ${a.reject_reason_code || "reason"} `}>
              <p className="text-xs text-stone-600">Rejection: {a.reject_reason || "—"}</p>
              <p className="mt-1 text-xs font-semibold text-stone-800">Appeal: {a.appeal_note || "—"}</p>
              <div className="mt-3 flex gap-2">
                <button className={btnPrimary} type="button" onClick={() => void decide(a.doc_id, "approve")}>Reopen review</button>
                <button className={btnGhost} type="button" onClick={() => void decide(a.doc_id, "reject")}>Uphold rejection</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function Reconciliation() {
  const events = useLoad<PaymentEvent[]>("/admin/growth/payment-events?limit=100");
  const recon = useLoad<Recon>("/admin/growth/reconciliation");
  return (
    <div className="space-y-4" data-testid="growth-reconciliation-page">
      <h1 className="text-lg font-extrabold text-stone-900">Payment audit & reconciliation</h1>
      <Card title="Daily reconciliation">
        {recon.busy || !recon.data ? <Spinner /> : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-xs text-stone-500">Consistent</p><p className="text-lg font-bold">{recon.data.consistent ? "✓ yes" : "✗ NO"}</p></div>
            <div><p className="text-xs text-stone-500">Paid orders</p><p className="text-lg font-bold">{recon.data.paid_orders}</p></div>
            <div><p className="text-xs text-stone-500">Total paid</p><p className="text-lg font-bold">{recon.data.total_paid_egp} EGP</p></div>
            <div className="sm:col-span-3"><p className="text-xs text-stone-500">Captured payments / webhooks / refunds</p><p className="text-sm font-semibold">{recon.data.captured_payments} / {recon.data.gateway_webhooks} / {recon.data.refunded_orders}</p></div>
            {recon.data.mismatches.length > 0 && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 sm:col-span-3">
                {recon.data.mismatches.map((m) => <p key={m}>⚠ {m}</p>)}
              </div>
            )}
          </div>
        )}
      </Card>
      <Card title="Append-only event trail (SHA-256 payload hashes)" action={<button className={btnGhost} type="button" onClick={() => { events.load(); recon.load(); }}>Refresh</button>}>
        {events.busy || !events.data ? <Spinner /> : events.data.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-stone-500"><tr><th>Time (UTC)</th><th>Event</th><th>Provider</th><th>Gateway txn</th><th>Amount</th></tr></thead>
              <tbody>
                {events.data.map((e) => (
                  <tr key={e.id} className="border-t border-stone-100">
                    <td className="text-xs">{e.created_at?.slice(0, 19).replace("T", " ")}</td>
                    <td><Badge status={e.event.includes("fail") || e.event.includes("invalid") ? "rejected" : "paid"}>{e.event}</Badge></td>
                    <td>{e.provider || "—"}</td><td className="font-mono text-xs">{e.gateway_txn_id || "—"}</td><td>{e.amount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
