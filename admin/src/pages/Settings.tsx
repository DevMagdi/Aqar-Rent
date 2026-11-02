// Settings: read-only view of backend-owned limits and preset reason lists.
// The API exposes no settings-write endpoint — values mirror enums.py / BRs.
import { Card } from "@/components/ui";
import { REJECT_REASONS } from "@/pages/Moderation";

const LIMITS: [string, string][] = [
  ["Active listings per owner (BR-7)", "5 (drafts + submitted + approved + active count)"],
  ["Photos per listing", "3–15, each compressed ≤ 1.5 MB client-side"],
  ["Ad weeks per order (BR-2)", "1–4 consecutive weeks"],
  ["Ad period default", "Plan-driven (Weekly plan: 500 EGP / 7 days)"],
  ["Exact-location reveals per user", "120 / hour"],
  ["Contact reveals per user", "Rate-limited server-side (per hour)"],
  ["Report reasons", "fraud, broker, duplicate, wrong_info, scam, inappropriate, other"],
  ["Report actions", "dismiss · resolve · remove_listing · to_moderation"],
];

export function Settings() {
  return (
    <div className="space-y-5" data-testid="settings-page">
      <h1 className="text-lg font-extrabold text-stone-900">Settings (read-only)</h1>

      <Card title="Platform limits & presets (sourced from backend enums)">
        <dl className="divide-y divide-stone-100 text-sm">
          {LIMITS.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 py-2">
              <dt className="font-semibold text-stone-700">{k}</dt>
              <dd className="text-stone-500">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-stone-400">
          These are authoritative in the backend (<code>app/models/enums.py</code>, migrations and the plans table). No settings-write API
          exists, so this page documents them instead of inventing endpoints.
        </p>
      </Card>

      <Card title="Rejection preset reasons (admin reject modal)">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {REJECT_REASONS.map(([k, v]) => (
            <li key={k} className="rounded-xl bg-stone-50 px-3 py-2">
              <code className="text-xs font-bold text-ink">{k}</code>
              <p className="text-stone-600">{v}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
