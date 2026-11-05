// Dashboard: KPIs + charts (listings by status, orders by status, revenue,
// contacts, top areas derived from active listings queue).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Stagger } from "@/components/motion";
import { AreaChart, BarChart, Card, Empty, Spinner, Stat } from "@/components/ui";

interface Funnel {
  users_registered: number;
  listings_submitted_or_beyond: number;
  listings_approved_or_beyond: number;
  orders_paid: number;
  contact_events: number;
  conversion_pct: number;
}

interface Dash {
  users_total: number;
  users_banned: number;
  listings_by_status: Record<string, number>;
  reports_open: number;
  verifications_pending: number;
  orders_by_status: Record<string, number>;
  revenue_egp: number;
  contact_events_total: number;
  active_ad_periods: number;
}

interface QueueRow {
  id: string;
  listing_id: string;
  title: string | null;
  status: string;
  governorate_name: string | null;
}

export function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [active, setActive] = useState<QueueRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Dash>("/admin/dashboard"),
      api<QueueRow[]>("/admin/listings?status=active&limit=200").catch(() => [] as QueueRow[]),
      api<Funnel>("/admin/analytics/funnel").catch(() => null),
    ])
      .then(([dash, rows, f]) => {
        setD(dash);
        setActive(rows);
        setFunnel(f);
      })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="text-sm text-danger" role="alert">{err}</p>;
  if (!d) return <Spinner />;

  const byGov = Object.entries(
    active.reduce<Record<string, number>>((acc, r) => {
      const k = r.governorate_name || "—";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const listingsTotal = Object.values(d.listings_by_status).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6" data-testid="dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Platform overview</p>
          <h1 className="font-display text-2xl font-bold text-ink-strong sm:text-3xl">Dashboard</h1>
        </div>
        <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted">Live operational data</span>
      </div>
      <Stagger as="div" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={d.users_total} hint={`${d.users_banned} banned`} />
        <Stat label="Active ad periods" value={d.active_ad_periods} hint={`${listingsTotal} listings total`} />
        <Stat label="Revenue (EGP)" value={d.revenue_egp} hint="paid − refunded" testid="revenue" />
        <Stat label="Contact events" value={d.contact_events_total} hint="call / whatsapp reveals" />
      </Stagger>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Reports open" value={d.reports_open} />
        <Stat label="Verifications pending" value={d.verifications_pending} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="New / active listings by status">
          <AreaChart data={Object.entries(d.listings_by_status)} testId="chart-listings" />
        </Card>
        <Card title="Orders by status (ads sold)">
          <BarChart data={Object.entries(d.orders_by_status)} testId="chart-orders" />
        </Card>
        <Card title="Top areas (active listings)">
          {byGov.length ? <BarChart data={byGov} testId="chart-top-areas" /> : <Empty text="No active listings yet" />}
        </Card>
        <Card title="Conversion funnel (registered → paid)">
          {funnel ? (
            <BarChart
              testId="chart-funnel"
              data={[
                ["registered", funnel.users_registered],
                ["submitted+", funnel.listings_submitted_or_beyond],
                ["approved+", funnel.listings_approved_or_beyond],
                ["paid orders", funnel.orders_paid],
                ["contacts", funnel.contact_events],
              ]}
            />
          ) : (
            <Empty text="—" />
          )}
          <p className="mt-2 text-xs text-muted">conversion: {funnel?.conversion_pct ?? 0}%</p>
        </Card>
        <Card title="Quick actions">
          <div className="flex flex-wrap gap-2">
            <Link to="/moderation" className="px-4 py-2 text-sm font-semibold btn-primary">
              Moderation queue
            </Link>
            <Link to="/verifications" className="rounded-xl border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-bg">
              Verifications
            </Link>
            <Link to="/bank-transfers" className="rounded-xl border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-bg">
              Bank transfers
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
