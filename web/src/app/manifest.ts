import type { MetadataRoute } from "next";
import { serverTokenColor } from "@/lib/serverColor";

/**
 * Installable-web-app manifest in the Aqar identity (navy + gold). Arabic-first, so the
 * name/description follow the default locale; colours come from tokens.css.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "عقار رينت · Aqar Rent",
    short_name: "عقار رينت",
    description:
      "سوق إيجار مصري مباشر بين المالك والمستأجر: ابحث، قارن، وتواصل بدون عمولة وساطة.",
    lang: "ar",
    dir: "rtl",
    start_url: "/ar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: serverTokenColor("brand-deep"),
    theme_color: serverTokenColor("brand"),
    categories: ["business", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "ابحث عن وحدة", short_name: "بحث", url: "/ar/search" },
      { name: "انشر إعلانك", short_name: "انشر", url: "/ar/owner/new" },
    ],
  };
}
