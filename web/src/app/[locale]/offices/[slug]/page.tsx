// Public branded office page — data comes from the backend, no hard-coded demo data.
import Link from "next/link";
import type { Metadata } from "next";
import { ErrorState } from "@/components/ui";
import { makeT } from "@/lib/i18n";
import { buildListingPath } from "@/lib/utils";
import { fetchServer } from "@/lib/server";
import type { Locale, OfficeProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

interface OfficeListing {
  id: string;
  title: string;
  rent_monthly: number;
  property_type: string;
  city_id: string;
  area_m2: number;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const l = locale === "en" ? "en" : "ar";
  let name = slug;
  try {
    const office = await fetchServer<OfficeProfile>(`/offices/slug/${encodeURIComponent(slug)}`);
    name = l === "ar" ? office.name_ar : office.name_en;
  } catch { /* offline build → fall back to slug */ }
  return {
    title: `${name} | ${makeT(l)("brand")}`,
    alternates: { canonical: `/${l}/offices/${slug}` },
  };
}

export default async function PublicOfficePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const ar = l === "ar";
  let office: OfficeProfile | null = null;
  let listings: OfficeListing[] = [];
  let error = "";
  try {
    [office, listings] = await Promise.all([
      fetchServer<OfficeProfile>(`/offices/slug/${encodeURIComponent(slug)}`),
      fetchServer<{ items: OfficeListing[] }>(`/offices/slug/${encodeURIComponent(slug)}/listings`)
        .then((r) => r.items)
        .catch(() => [] as OfficeListing[]),
    ]);
  } catch (e) {
    error = (e as Error).message;
  }
  if (!office) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <ErrorState message={error || (ar ? "المكتب غير موجود" : "Office not found")} />
        <p className="mt-4 text-center text-sm"><Link className="text-ink underline" href={`/${l}`}>{ar ? "العودة للرئيسية" : "Back home"}</Link></p>
      </div>
    );
  }
  return (
    <div className="space-y-8" dir={ar ? "rtl" : "ltr"}>
      <header className="rounded-3xl bg-gradient-to-br from-stone-900 to-stone-700 p-6 text-white sm:p-10">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-300">{ar ? "صفحة مكتب عقاري" : "Verified office page"}</p>
        <h1 className="mt-2 text-3xl font-extrabold">{ar ? office.name_ar : office.name_en}</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-300">{ar ? office.description_ar : office.description_en}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {office.verification_status === "verified" && <span className="rounded-full bg-emerald-500 px-3 py-1 font-bold">✓ {ar ? "بيانات السجل التجاري مراجَعة" : "Commercial register reviewed"}</span>}
          {office.city && <span className="rounded-full bg-white/10 px-3 py-1">📍 {office.city}</span>}
          {office.public_phone && <a className="rounded-full bg-white/10 px-3 py-1" dir="ltr" href={`tel:${office.public_phone}`}>{office.public_phone}</a>}
        </div>
      </header>
      <section>
        <h2 className="text-xl font-bold text-stone-900">{ar ? "الوحدات المتاحة" : "Available units"}</h2>
        {listings.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
            {ar ? "لا توجد وحدات نشطة حالياً لهذا المكتب." : "No active listings for this office right now."}
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((x) => (
              <Link key={x.id} href={buildListingPath(l, x.city_id, x.city_id, x.id, x.title)} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:border-brand-400">
                <h3 className="line-clamp-2 font-bold text-stone-900">{x.title}</h3>
                <p className="mt-2 text-ink font-extrabold">{x.rent_monthly.toLocaleString()} {ar ? "ج.م / شهر" : "EGP / month"}</p>
                <p className="mt-1 text-xs text-stone-500">{x.area_m2} م² · {x.property_type}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        ⚖️ {ar
          ? "مراجعة بيانات المكتب تتم بواسطة فريق المنصة وليست فحصاً حكومياً. أي عمولة بين المكتب والمالك اتفاق خاص لا تحصّله المنصة."
          : "Office data is reviewed by our team, not by a government authority. Any office↔owner commission is a private agreement the platform never collects."}
      </p>
    </div>
  );
}
