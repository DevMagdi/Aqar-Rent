import { StaticPage, staticMetadata } from "@/components/StaticPage";
import type { Locale } from "@/lib/types";

const SLUG = "about";
const KEY = "about";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return staticMetadata(locale === "en" ? "en" : "ar", SLUG, KEY);
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  return (
    <StaticPage locale={l} titleKey={KEY}>
      <p>
        {l === "ar"
          ? "عقار ربنا سوق إيجار مباشر يربط المالك بالمستأجر بدون وساطة. رسمنا ثابتة تُدفع مقابل نشر الإعلان فقط."
          : "Aqar Rent is a direct rental marketplace connecting owners with tenants, broker-free. Our only fee is the listing ad."}
      </p>
      <p>
        {l === "ar"
          ? "نلتزم بقواعد محتوى واضحة: صور حقيقية، أسعار شهرية بالجنيه المصري، ومواقع صحيحة — وأي مخالفة يؤدي لرفض الإعلان."
          : "We enforce clear content rules: real photos, monthly prices in EGP, accurate locations — violations lead to rejection."}
      </p>
      <p>
        {l === "ar"
          ? "بياناتك الشخصية محمية ولا تُشارك مع أي طرف ثالث عدا المتطلبات القانونية. يمكنك حذف حسابك في أي وقت من صفحة حسابي."
          : "Your personal data is protected and never shared with third parties except where legally required. You can delete your account anytime from My Account."}
      </p>
    </StaticPage>
  );
}
