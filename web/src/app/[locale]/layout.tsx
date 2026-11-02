import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LOCALES, DEFAULT_LOCALE, dirOf } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { ConsentBanner } from "@/components/ConsentBanner";
import { Footer } from "@/components/Footer";
import "@/app/globals.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const title = l === "ar" ? "عقار ربنا — إيجار مباشر بدون وسطاء" : "Aqar Rent — direct rentals, no brokers";
  const desc =
    l === "ar"
      ? "سوق إيجار مصري مباشر بين المالك والمستأجر: ابحث، قارن، وتواصل — بدون عمولة وساطة."
      : "The Egyptian direct rental market between owners and tenants: search, compare, contact — no broker fees.";
  return {
    metadataBase: new URL(site),
    title: { default: title, template: `%s | ${l === "ar" ? "عقار ربنا" : "Aqar Rent"}` },
    description: desc,
    alternates: {
      canonical: `/${l}`,
      languages: { ar: "/ar", en: "/en", "x-default": "/ar" },
    },
    openGraph: {
      title,
      description: desc,
      siteName: l === "ar" ? "عقار ربنا" : "Aqar Rent",
      locale: l === "ar" ? "ar_EG" : "en_US",
      images: [{ url: "/og?title=Aqar%20Rent&sub=Broker-free%20rentals%20in%20Egypt", width: 1200, height: 630 }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!LOCALES.includes(locale as Locale)) notFound();
  const l = locale as Locale;
  return (
    <html lang={l} dir={dirOf(l)} suppressHydrationWarning>
      <body className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased">
        <Providers locale={l}>
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
          <Footer />
          <ConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
