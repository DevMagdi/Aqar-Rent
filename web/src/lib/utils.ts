import type { Locale } from "./types";

/** Egyptian phone: accept 01xxxxxxxxx / +201… / 201… → normalizes like backend. */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-().]/g, "");
  if (p.startsWith("+20")) p = "0" + p.slice(3);
  else if (p.startsWith("20")) p = "0" + p.slice(2);
  return p;
}
export function isValidEgPhone(raw: string): boolean {
  return /^01[0125][0-9]{8}$/.test(normalizePhone(raw));
}

// Money, dates and references use LATIN digits in both locales.
// Decision (design lead): Arabic-Indic numerals (١٬٠٠٠) hurt scanability of
// prices in apartment listings — the amounts are compared at a glance and
// screenshots/contracts must match the payment gateway. Wording stays Arabic.
const NUMERIC_LOCALE: Record<Locale, string> = { ar: "ar-EG-u-nu-latn", en: "en-EG" };

export function formatMoney(n: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMERIC_LOCALE[locale], {
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** URL slug: keep Arabic letters, dash everything else. */
export function slugify(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "listing";
}

export function locationName(l: { name_ar: string; name_en: string } | null | undefined, locale: Locale): string {
  if (!l) return "";
  return locale === "ar" ? l.name_ar : l.name_en;
}

/** Parse `{uuid}-{slug}` back into parts (uuid itself contains dashes). */
export function parseIdSlug(idslug: string): { id: string; slug: string | null } {
  const m = idslug.match(
    /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:-(.*))?$/,
  );
  if (m) return { id: m[1], slug: m[2] ?? null };
  const idx = idslug.indexOf("-");
  if (idx > 0) return { id: idslug.slice(0, idx), slug: idslug.slice(idx + 1) };
  return { id: idslug, slug: null };
}

export function buildListingPath(locale: Locale, govSlug: string, citySlug: string, id: string, title: string): string {
  return `/${locale}/rent/${encodeURIComponent(govSlug)}/${encodeURIComponent(citySlug)}/${id}-${slugify(title)}`;
}

export function waHref(phone: string, text: string): string {
  const p = normalizePhone(phone).replace(/^0/, "20");
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export function telHref(phone: string): string {
  return `tel:${normalizePhone(phone)}`;
}

export const AMENITY_KEYS = [
  "air_conditioning",
  "heating",
  "parking",
  "balcony",
  "elevator",
  "generator",
  "security",
  "furnished",
  "internet",
  "water_heater",
] as const;

export const AMENITY_LABEL_KEY: Record<string, string> = {
  air_conditioning: "amenity_ac",
  heating: "amenity_heating",
  parking: "amenity_parking",
  balcony: "amenity_balcony",
  elevator: "amenity_lift",
  generator: "amenity_generator",
  security: "amenity_security",
  furnished: "amenity_furnished",
  internet: "amenity_internet",
  water_heater: "amenity_water_heater",
};
