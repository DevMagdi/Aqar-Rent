// Public pricing page — every number comes from GET /api/v1/pricing (DB-backed).
import Link from "next/link";
import type { Metadata } from "next";
import { ErrorState } from "@/components/ui";
import { makeT } from "@/lib/i18n";
import { fetchServer } from "@/lib/server";
import type { Locale, Pricing } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  const t = makeT(l);
  return {
    title: `${t("pricing")} | ${t("brand")}`,
    alternates: {
      canonical: `/${l}/pricing`,
      languages: { ar: "/ar/pricing", en: "/en/pricing", "x-default": "/ar/pricing" },
    },
  };
}

const FEATURE_LABELS: Record<string, { ar: string; en: string }> = {
  analytics: { ar: "تقارير وأداء الإعلانات", en: "Listing analytics" },
  bulk_tools: { ar: "أدوات إدارة متعددة", en: "Bulk tools" },
  priority_support: { ar: "دعم أسرع", en: "Priority support" },
  team: { ar: "حسابات فريق متعددة", en: "Multi-user team" },
  leads: { ar: "إدارة العملاء المحتملين", en: "Leads pipeline" },
  branded_page: { ar: "صفحة مكتب بعلامتك", en: "Branded office page" },
  commission_tracking: { ar: "تسجيل العمولة الخاصة", en: "Private commission tracking" },
};

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  let pricing: Pricing | null = null;
  let error = "";
  try {
    pricing = await fetchServer<Pricing>("/pricing");
  } catch (e) {
    error = (e as Error).message;
  }

  const ar = l === "ar";
  if (!pricing) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <h1 className="text-2xl font-bold">{ar ? "الأسعار والباقات" : "Pricing & plans"}</h1>
        <div className="mt-6">
          <ErrorState message={error || (ar ? "تعذر تحميل الأسعار الآن" : "Prices could not be loaded")} />
        </div>
        <p className="mt-4 text-center text-sm">
          <Link className="text-ink underline" href={`/${l}/pricing`}>
            {ar ? "إعادة المحاولة" : "Retry"}
          </Link>
        </p>
      </div>
    );
  }

  const money = (n: number) => `${n.toLocaleString(ar ? "ar-EG" : "en-EG")} ${ar ? "ج.م" : "EGP"}`;
  const name = (arName: string, enName: string) => (ar ? arName : enName);

  return (
    <div className="space-y-10" dir={ar ? "rtl" : "ltr"}>
      <header className="rounded-3xl bg-gradient-to-br from-brand-50 via-white to-emerald-50 p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-widest text-ink">
          {ar ? "أسعار شفافة · بلا مفاجآت" : "Transparent pricing · no surprises"}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-stone-900 sm:text-4xl">
          {ar ? "ادفع مقابل الظهور والأدوات فقط" : "Pay only for visibility and tools"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600 sm:text-base">
          {ar
            ? "المنصة لا تحصّل الإيجار أو التأمين، ولا تتقاضى عمولة على الإيجار، ولا تحتفظ بأي مبالغ بين المالك والمستأجر. يمكنك النشر مباشرة أو عبر مكتب عقاري موثّق."
            : "The platform never collects rent or deposits, takes no rent commission and holds no money between owners and tenants. List directly or through a verified office."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ar ? "بدون عمولة على الإيجار" : "No rent commission",
            ar ? "لا نحتفظ بالتأمين" : "No deposits held",
            ar ? "الوسيط اختياري" : "Broker-optional",
            ar ? "أسعار من قاعدة البيانات" : "DB-backed prices",
          ].map((x) => (
            <span key={x} className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink">
              ✓ {x}
            </span>
          ))}
        </div>
      </header>

      {/* 1 — entry point */}
      <section aria-labelledby="weekly-h">
        <h2 id="weekly-h" className="text-xl font-bold text-stone-900">
          {ar ? "١. الإعلان الأسبوعي — نقطة البداية" : "1. Weekly ad — the entry point"}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-stone-500">{ar ? "إعلان واحد · ٧ أيام" : "One listing · 7 days"}</p>
            <p className="mt-2 text-3xl font-extrabold text-ink">{money(pricing.weekly_ad.price_egp)}</p>
            <p className="mt-3 text-sm text-stone-600">
              {ar
                ? "بعد مراجعة الإعلان والمستندات، تدفع مقابل مدة الظهور. لا توجد رسوم خفية أو عمولة عند إتمام الإيجار."
                : "After listing and document review, pay for visibility. No hidden fees and no commission when a deal closes."}
            </p>
            <Link
              href={`/${l}/owner/new`}
              className="mt-5 inline-flex rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-brand-deep hover:bg-gold-dark"
            >
              {ar ? "أضف إعلانك" : "Post a listing"}
            </Link>
          </article>
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
            <h3 className="font-bold text-emerald-900">
              {ar ? "مستويات التوثيق = ثقة أعلى" : "Trust levels = more confidence"}
            </h3>
            <ol className="mt-3 space-y-2 text-sm text-emerald-900">
              {[
                ar ? "هاتف موثّق برمز تحقق" : "OTP-verified phone",
                ar ? "مراجعة الهوية" : "Identity reviewed",
                ar ? "مراجعة مستندات الملكية" : "Ownership documents reviewed",
                ar ? "تحقق مميز اختياري (مدفوع)" : "Optional paid premium verification",
              ].map((x, i) => (
                <li key={x} className="flex gap-2">
                  <span className="font-bold">{i + 1}.</span> {x}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-emerald-800">
              {ar ? "مراجعة مستندات من فريقنا — ليست فحصاً حكومياً." : "Document review by our team — not a government check."}
            </p>
          </article>
        </div>
      </section>

      {/* 2 — packages */}
      <section aria-labelledby="packages-h">
        <h2 id="packages-h" className="text-xl font-bold text-stone-900">
          {ar ? "٢. باقات متعددة الأسابيع وأولوية الظهور" : "2. Multi-week packages & priority boosts"}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {ar ? "كلما زادت المدة، زاد الخصم، وارتفع ترتيب الإعلان في نتائج البحث." : "Longer runs cost less per week and rank higher in search."}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {pricing.packages.map((p) => (
            <article key={p.id} className="relative rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              {p.is_featured && (
                <span className="absolute -top-3 end-4 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-950">
                  ★ {ar ? "مميز" : "Featured"}
                </span>
              )}
              <h3 className="font-bold text-stone-900">{name(p.name_ar, p.name_en)}</h3>
              <p className="mt-1 text-xs text-stone-500">
                {p.weeks} {ar ? "أسابيع" : "weeks"} · {ar ? "خصم" : "discount"} {p.discount_pct}%
              </p>
              <p className="mt-3 text-2xl font-extrabold text-ink">{money(p.total)}</p>
              {p.discount > 0 && (
                <p className="text-xs text-stone-400 line-through">{money(p.subtotal)}</p>
              )}
              <p className="mt-3 text-xs text-stone-500">
                {ar ? `وزن الأولوية: ${p.priority_weight}` : `Priority weight: ${p.priority_weight}`}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 3 — subscriptions */}
      <section aria-labelledby="subs-h">
        <h2 id="subs-h" className="text-xl font-bold text-stone-900">
          {ar ? "٣. اشتراكات شهرية — للمالكين والمكاتب" : "3. Monthly subscriptions — owners & offices"}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {ar
            ? "حدود إعلانات أعلى، تحليلات، أدوات جماعية وفرق عمل. الاشتراك لا علاقة له بالإيجار أو التأمين."
            : "Higher listing caps, analytics, bulk tools and teams. Subscriptions never touch rent or deposits."}
        </p>
        <div className="mt-4 space-y-8">
          {(["individual", "office"] as const).map((audience) => (
            <div key={audience}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">
                {audience === "individual" ? (ar ? "للأفراد (٣ وحدات فأكثر)" : "For individual owners (3+ units)") : ar ? "للمكاتب العقارية والوسطاء" : "For real-estate offices & agents"}
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pricing.subscriptions.filter((s) => s.audience === audience).map((s) => (
                  <article key={s.id} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <h4 className="font-bold text-stone-900">{name(s.name_ar, s.name_en)}</h4>
                    <p className="mt-2 text-2xl font-extrabold text-ink">
                      {money(s.monthly_price_egp)}
                      <span className="text-sm font-normal text-stone-500"> / {ar ? "شهر" : "month"}</span>
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      {ar ? `حتى ${s.listing_limit} إعلان` : `Up to ${s.listing_limit} listings`} ·{" "}
                      {ar ? `${s.seats} مستخدم` : `${s.seats} seat(s)`}
                    </p>
                    <ul className="mt-3 flex-1 space-y-1.5 text-xs text-stone-600">
                      {Object.entries(s.features)
                        .filter(([, on]) => on)
                        .map(([key]) => (
                          <li key={key}>✓ {FEATURE_LABELS[key]?.[l] || key}</li>
                        ))}
                      {Object.keys(s.features).length === 0 && (
                        <li>{ar ? "المزايا الأساسية" : "Core features"}</li>
                      )}
                    </ul>
                    <Link
                      href={`/${l}/office`}
                      className="mt-4 rounded-xl border border-brand-600 px-4 py-2 text-center text-sm font-bold text-ink hover:bg-brand-50"
                    >
                      {ar ? "ابدأ" : "Get started"}
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — offices positioning */}
      <section className="rounded-3xl bg-stone-900 p-6 text-stone-100 sm:p-10">
        <h2 className="text-2xl font-extrabold">
          {ar ? "أفضل من واتساب + إكسل لإدارة الإيجار" : "Better than WhatsApp + Excel for rental management"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-stone-300">
          {ar
            ? "صفحة مكتب بعلامتك، فريق بحسابات مستقلة، ربط كل وحدة بوسيط مسؤول، مسار عملاء من «جديد» حتى «تم الإغلاق»، متابعات، ولوحة أداء. عمولتك مع المالك اتفاق خاص تسجّله اختيارياً — المنصة لا تحصّلها ولا تتوسط فيها."
            : "A branded office page, individual team logins, an agent on every unit, a lead pipeline from new to won, follow-ups and a performance dashboard. Your owner commission is a private agreement you may record — the platform never collects or intermediates it."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/${l}/office`} className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-stone-900">
            {ar ? "لوحة المكتب" : "Office workspace"}
          </Link>
          <Link href={`/${l}/how-it-works`} className="rounded-xl border border-stone-600 px-5 py-2.5 text-sm font-bold text-white">
            {ar ? "كيف يعمل" : "How it works"}
          </Link>
        </div>
      </section>

      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        ⚖️{" "}
        {ar
          ? "جميع المبالغ المعروضة مقابل خدمات المنصة فقط (إعلانات، باقات، اشتراكات، تحقق مميز اختياري، حزم عقود). لا تُعد المنصة طرفاً في عقد الإيجار، وعقودها اتفاقات خاصة ليست موثّقة ولا سندات تنفيذية ولا تُغني عن التسجيل الرسمي."
          : "All amounts are for platform services only (ads, packages, subscriptions, optional premium verification, contract packages). The platform is not a party to any lease; its contracts are private agreements — not notarized, not executive instruments, and no substitute for official registration."}
      </p>
    </div>
  );
}
