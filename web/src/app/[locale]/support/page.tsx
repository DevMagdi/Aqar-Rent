import { StaticPage, staticMetadata } from "@/components/StaticPage";
import { SupportSections } from "@/components/StaticSections";
import type { Locale } from "@/lib/types";

const SLUG = "support";
const KEY = "support";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return staticMetadata(locale === "en" ? "en" : "ar", SLUG, KEY);
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  return (
    <StaticPage locale={l} titleKey={KEY}>
      <SupportSections l={l} />
    </StaticPage>
  );
}
