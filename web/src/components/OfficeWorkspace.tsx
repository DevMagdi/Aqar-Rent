"use client";
// Office/agency workspace: team, listing assignments, CRM-lite pipeline,
// follow-ups and a performance dashboard. No mock data — every call hits the API.
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n, useToast } from "./Providers";
import { CardSkeleton, EmptyState, ErrorState, StatusBadge } from "./ui";

interface Office {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  verification_status: string;
  trust: { label_ar: string; label_en: string } | null;
}
interface Member {
  id: string;
  invited_phone: string;
  display_name: string | null;
  role: string;
  status: string;
}
interface Lead {
  id: string;
  tenant_name: string;
  tenant_phone: string;
  budget_egp: number | null;
  stage: string;
  note: string;
  commission_egp: number | null;
  next_follow_up_at: string | null;
}
interface Dashboard {
  leads_total: number;
  leads_by_stage: Record<string, number>;
  won: number;
  conversion_pct: number;
  follow_ups_due: number;
  listings_total: number;
  views_total: number;
  agents: { agent_user_id: string | null; leads: number; won: number }[];
}

const STAGES = ["new", "contacted", "viewing", "offer", "won", "lost"];

export function OfficeWorkspace() {
  const { locale } = useI18n();
  const toast = useToast();
  const ar = locale === "ar";
  const [office, setOffice] = useState<Office | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name_ar: "",
    name_en: "",
    commercial_register: "",
    city: "",
    public_phone: "",
  });
  const [invite, setInvite] = useState({ invited_phone: "", display_name: "", role: "agent" });
  const [lead, setLead] = useState({ tenant_name: "", tenant_phone: "", budget_egp: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const o = await api<Office>("/offices/me");
      setOffice(o);
      const [m, ls, d] = await Promise.all([
        api<Member[]>(`/offices/${o.id}/members`),
        api<Lead[]>(`/offices/${o.id}/leads`),
        api<Dashboard>(`/offices/${o.id}/dashboard`),
      ]);
      setMembers(m);
      setLeads(ls);
      setDash(d);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setOffice(null);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createOffice(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/offices", { method: "POST", body: form });
      toast.show(ar ? "تم إنشاء صفحة المكتب" : "Office created");
      await load();
    } catch (err) {
      toast.show((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite(e: FormEvent) {
    e.preventDefault();
    if (!office) return;
    setBusy(true);
    try {
      await api(`/offices/${office.id}/members`, { method: "POST", body: invite });
      setInvite({ invited_phone: "", display_name: "", role: "agent" });
      toast.show(ar ? "تمت دعوة الوسيط" : "Agent invited");
      await load();
    } catch (err) {
      toast.show((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function submitLead(e: FormEvent) {
    e.preventDefault();
    if (!office) return;
    setBusy(true);
    try {
      await api(`/offices/${office.id}/leads`, {
        method: "POST",
        body: {
          ...lead,
          budget_egp: lead.budget_egp ? Number(lead.budget_egp) : undefined,
        },
      });
      setLead({ tenant_name: "", tenant_phone: "", budget_egp: "", note: "" });
      toast.show(ar ? "أُضيف العميل للمسار" : "Lead added to pipeline");
      await load();
    } catch (err) {
      toast.show((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function moveStage(id: string, stage: string) {
    if (!office) return;
    try {
      await api(`/offices/${office.id}/leads/${id}`, { method: "PATCH", body: { stage } });
      await load();
    } catch (err) {
      toast.show((err as Error).message, "err");
    }
  }

  if (loading) return <CardSkeleton n={4} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  if (!office) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-3xl bg-gradient-to-br from-stone-900 to-stone-700 p-6 text-white">
          <h1 className="text-2xl font-extrabold">
            {ar ? "أنشئ صفحة مكتبك العقاري" : "Create your office profile"}
          </h1>
          <p className="mt-2 text-sm text-stone-300">
            {ar
              ? "فريق بحسابات مستقلة، وحدات الملاك، مسار عملاء، متابعات ولوحة أداء — بديل عملي عن واتساب وإكسل."
              : "Individual team logins, owner units, a lead pipeline, follow-ups and a dashboard — a practical replacement for WhatsApp and Excel."}
          </p>
        </div>
        <form onSubmit={createOffice} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
          {(
            [
              ["name_ar", ar ? "اسم المكتب (عربي) *" : "Office name (Arabic) *"],
              ["name_en", ar ? "اسم المكتب (إنجليزي)" : "Office name (English)"],
              ["commercial_register", ar ? "رقم السجل التجاري" : "Commercial register no."],
              ["city", ar ? "المدينة" : "City"],
              ["public_phone", ar ? "هاتف المكتب" : "Office phone"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="font-semibold text-stone-700">{label}</span>
              <input
                required={key === "name_ar"}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-brand-500"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gold px-5 py-3 text-sm font-bold text-gold-text disabled:opacity-60"
          >
            {busy ? "…" : ar ? "إنشاء المكتب" : "Create office"}
          </button>
          <p className="text-center text-xs text-stone-500">
            <Link className="text-ink underline" href={`/${locale}/pricing`}>
              {ar ? "اطّلع على باقات المكاتب" : "See office plans"}
            </Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8" dir={ar ? "rtl" : "ltr"}>
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-br from-brand-50 to-white p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink">
            {ar ? "لوحة المكتب العقاري" : "Office workspace"}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-stone-900">
            {ar ? office.name_ar : office.name_en}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={office.verification_status} />
            <Link className="text-ink underline" href={`/offices/${office.slug}`}>
              {ar ? "الصفحة العامة" : "Public page"}
            </Link>
          </div>
        </div>
        {office.verification_status !== "verified" && (
          <button
            type="button"
            onClick={async () => {
              try {
                await api(`/offices/${office.id}/verification-request`, { method: "POST" });
                toast.show(ar ? "أُرسل طلب المراجعة" : "Review requested");
                await load();
              } catch (err) {
                toast.show((err as Error).message, "err");
              }
            }}
            className="rounded-xl border border-brand-600 px-4 py-2 text-sm font-bold text-ink"
          >
            {ar ? "طلب توثيق المكتب" : "Request verification"}
          </button>
        )}
      </header>

      {dash && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [ar ? "العملاء المحتملون" : "Leads", dash.leads_total],
            [ar ? "صفقات مغلقة" : "Won", dash.won],
            [ar ? "نسبة التحويل" : "Conversion", `${dash.conversion_pct}%`],
            [ar ? "متابعات مستحقة" : "Follow-ups due", dash.follow_ups_due],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-xs text-stone-500">{label}</p>
              <p className="mt-1 text-2xl font-extrabold text-stone-900">{value}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-bold text-stone-600">{ar ? "مسار العملاء" : "Pipeline"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <span key={s} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                  {s}: {dash.leads_by_stage[s] ?? 0}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-stone-500">
              {ar ? "الوحدات المُدارة" : "Managed units"}: {dash.listings_total} ·{" "}
              {ar ? "إجمالي المشاهدات" : "Total views"}: {dash.views_total}
            </p>
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        {/* team */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-bold text-stone-900">{ar ? "الفريق" : "Team"}</h2>
          {members.length === 0 ? (
            <div className="mt-3"><EmptyState title={ar ? "لا يوجد أعضاء" : "No members yet"} /></div>
          ) : (
            <ul className="mt-3 space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-xl border border-stone-100 px-3 py-2 text-sm">
                  <span>
                    {m.display_name || m.invited_phone} · <span dir="ltr">{m.invited_phone}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <StatusBadge status={m.status} />
                    <span className="text-stone-500">{m.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submitInvite} className="mt-4 grid gap-2 sm:grid-cols-3">
            <input
              required
              placeholder={ar ? "رقم هاتف الوسيط" : "Agent phone"}
              value={invite.invited_phone}
              onChange={(e) => setInvite({ ...invite, invited_phone: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              placeholder={ar ? "الاسم" : "Name"}
              value={invite.display_name}
              onChange={(e) => setInvite({ ...invite, display_name: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {ar ? "دعوة" : "Invite"}
            </button>
          </form>
        </div>

        {/* new lead */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-bold text-stone-900">{ar ? "عميل محتمل جديد" : "New lead"}</h2>
          <form onSubmit={submitLead} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              required
              placeholder={ar ? "اسم العميل" : "Tenant name"}
              value={lead.tenant_name}
              onChange={(e) => setLead({ ...lead, tenant_name: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              required
              placeholder={ar ? "رقم الهاتف" : "Phone"}
              value={lead.tenant_phone}
              onChange={(e) => setLead({ ...lead, tenant_phone: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              inputMode="numeric"
              placeholder={ar ? "الميزانية (ج.م)" : "Budget (EGP)"}
              value={lead.budget_egp}
              onChange={(e) => setLead({ ...lead, budget_egp: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <input
              placeholder={ar ? "ملاحظة" : "Note"}
              value={lead.note}
              onChange={(e) => setLead({ ...lead, note: e.target.value })}
              className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-gold-text sm:col-span-2 disabled:opacity-60"
            >
              {ar ? "إضافة للمسار" : "Add to pipeline"}
            </button>
          </form>
          <p className="mt-2 text-[11px] text-stone-500">
            {ar
              ? "العمولة بين المكتب والمالك اتفاق خاص؛ المنصة لا تحصّلها ولا تتوسط فيها."
              : "Any office↔owner commission is private; the platform never collects it."}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="font-bold text-stone-900">{ar ? "مسار العملاء" : "Lead pipeline"}</h2>
        {leads.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title={ar ? "لا يوجد عملاء بعد" : "No leads yet"}
              hint={ar ? "أضف أول عميل من النموذج بالأعلى." : "Add your first lead using the form above."}
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="text-start">{ar ? "العميل" : "Tenant"}</th>
                  <th className="text-start">{ar ? "الميزانية" : "Budget"}</th>
                  <th className="text-start">{ar ? "المرحلة" : "Stage"}</th>
                  <th className="text-start">{ar ? "نقل إلى" : "Move to"}</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((x) => (
                  <tr key={x.id} className="border-t border-stone-100">
                    <td className="py-2.5">
                      <p className="font-semibold text-stone-800">{x.tenant_name}</p>
                      <p className="text-xs text-stone-500" dir="ltr">{x.tenant_phone}</p>
                    </td>
                    <td>{x.budget_egp ? `${x.budget_egp.toLocaleString()} ${ar ? "ج.م" : "EGP"}` : "—"}</td>
                    <td><StatusBadge status={x.stage} /></td>
                    <td>
                      <select
                        value={x.stage}
                        onChange={(e) => void moveStage(x.id, e.target.value)}
                        className="rounded-lg border border-stone-300 px-2 py-1 text-xs"
                      >
                        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-xs text-stone-500">
        <Link className="text-ink underline" href={`/${locale}/pricing`}>
          {ar ? "ترقية باقة المكتب لحدود ومقاعد أعلى" : "Upgrade your office plan for higher limits and seats"}
        </Link>
      </p>
    </div>
  );
}
