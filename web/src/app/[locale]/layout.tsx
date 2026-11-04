import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LOCALES, dirOf } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { themeInitScript } from "@/components/ThemeToggle";
import { PageTransition } from "@/components/PageTransition";
import { ConsentBanner } from "@/components/ConsentBanner";
import { Footer } from "@/components/Footer";
import { ScrollUtilities } from "@/components/ScrollUtilities";
import { serverTokenColor } from "@/lib/serverColor";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/** Browser chrome follows the identity: navy under the status bar, navy/gold
 *  on install, and a real icon/manifest set (Phase 1 finding #10). */
export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: serverTokenColor("brand") },
      { media: "(prefers-color-scheme: dark)", color: serverTokenColor("brand-deep") },
    ],
    colorScheme: "light dark",
  };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = (locale === "en" ? "en" : "ar") as Locale;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const title = l === "ar" ? "عقار رينت — إيجار مباشر بدون وسطاء" : "Aqar Rent — direct rentals, no brokers";
  const desc =
    l === "ar"
      ? "سوق إيجار مصري مباشر بين المالك والمستأجر: ابحث، قارن، وتواصل — بدون عمولة وساطة."
      : "The Egyptian direct rental market between owners and tenants: search, compare, contact — no broker fees.";
  const ogImage = l === "ar" ? "/og" : "/og?lang=en";
  return {
    metadataBase: new URL(site),
    applicationName: l === "ar" ? "عقار رينت" : "Aqar Rent",
    title: { default: title, template: `%s | ${l === "ar" ? "عقار رينت" : "Aqar Rent"}` },
    description: desc,
    manifest: "/manifest.webmanifest",
    alternates: {
      canonical: `/${l}`,
      languages: { ar: "/ar", en: "/en", "x-default": "/ar" },
    },
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
      shortcut: ["/icon.svg"],
    },
    appleWebApp: { capable: true, title: l === "ar" ? "عقار رينت" : "Aqar Rent", statusBarStyle: "black-translucent" },
    openGraph: {
      type: "website",
      title,
      description: desc,
      siteName: l === "ar" ? "عقار رينت" : "Aqar Rent",
      locale: l === "ar" ? "ar_EG" : "en_US",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [ogImage],
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
      <head>
        <link rel="preload" href={`/fonts/el-messiri-${l === "ar" ? "arabic" : "latin"}-700.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href={`/fonts/ibm-plex-${l === "ar" ? "arabic" : "latin"}-400.woff2`} as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-ink-strong antialiased">
        <a className="skip-link" href="#main">
          {l === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}
        </a>
        <Providers locale={l}>
          <Header />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6">
            <PageTransition>{children}</PageTransition>
          </main>
          <Footer />
          <ConsentBanner />
          <ScrollUtilities />
        </Providers>
      </body>
    </html>
  );
}
