// Unit tests for the pure web helpers (no DOM needed).
import { describe, expect, it } from "vitest";
import {
  buildListingPath,
  formatMoney,
  isValidEgPhone,
  normalizePhone,
  parseIdSlug,
  slugify,
  waHref,
} from "../utils";
import { EMPTY_FILTERS, filtersFromParams, filtersToQuery } from "../filters";
import { LOCALES, dictionaries, dirOf, makeT } from "../i18n";

describe("phone helpers", () => {
  it("normalizes Egyptian formats to 01…", () => {
    expect(normalizePhone("0100 111 2233")).toBe("01001112233");
    expect(normalizePhone("+201001112233")).toBe("01001112233");
    expect(normalizePhone("201001112233")).toBe("01001112233");
  });
  it("validates only real mobile prefixes", () => {
    expect(isValidEgPhone("01001112233")).toBe(true);
    expect(isValidEgPhone("01201112233")).toBe(true);
    expect(isValidEgPhone("01501112233")).toBe(true);
    expect(isValidEgPhone("01901112233")).toBe(false); // wrong prefix
    expect(isValidEgPhone("0100111223")).toBe(false); // too short
    expect(isValidEgPhone("hello")).toBe(false);
  });
});

describe("listing slugs", () => {
  const id = "87a47284-f506-44cc-9924-6f7cbd62ca2b";
  it("slugify keeps Arabic letters and strips junk", () => {
    expect(slugify("شقة تجريبية 3 غرف!")).toBe("شقة-تجريبية-3-غرف");
    expect(slugify("   spaced   out   ")).toBe("spaced-out");
    expect(slugify("!!!")).toBe("listing"); // fallback when nothing survives
  });
  it("round-trips {uuid}-{slug} even though uuids contain dashes", () => {
    const path = buildListingPath("ar", "القاهرة", "القاهرة", id, "شقة في المهندسين");
    const idslug = path.split("/").pop()!;
    const parsed = parseIdSlug(idslug);
    expect(parsed.id).toBe(id);
    expect(parsed.slug).toContain("شقة");
  });
  it("parses a bare id too", () => {
    expect(parseIdSlug(id)).toEqual({ id, slug: null });
  });
});

describe("filters ⇄ URL", () => {
  it("round-trips every field including multi-value amenities", () => {
    const f = {
      ...EMPTY_FILTERS,
      q: "مدينة نصر",
      governorate_id: "gov-1",
      min_price: "3000",
      max_price: "9000",
      property_type: "apartment",
      furnished: "semi",
      bedrooms: "2",
      amenities: ["parking", "elevator"],
      sort: "price_desc",
      bbox: "30.0,29.9,31.5,30.2",
    };
    const qs = filtersToQuery(f);
    const params = Object.fromEntries(new URLSearchParams(qs).entries());
    // amenities repeat — rebuild for the parser
    const amenities = new URLSearchParams(qs).getAll("amenities");
    const back = filtersFromParams({ ...params, amenities });
    expect(back).toEqual(f);
  });

  it("drops defaults from the query string", () => {
    const qs = filtersToQuery({ ...EMPTY_FILTERS, sort: "newest" });
    expect(qs).toBe("");
  });

  it("parses legacy comma-separated amenities too", () => {
    const back = filtersFromParams({ amenities: "parking,elevator" });
    expect(back.amenities).toEqual(["parking", "elevator"]);
  });

  it("ignores unknown/absent params", () => {
    expect(filtersFromParams({})).toEqual(EMPTY_FILTERS);
    expect(filtersFromParams({ bogus: "x" })).toEqual(EMPTY_FILTERS);
  });
});

describe("i18n", () => {
  it("ar and en dictionaries expose exactly the same keys", () => {
    const arKeys = Object.keys(dictionaries.ar).sort();
    const enKeys = Object.keys(dictionaries.en).sort();
    expect(enKeys).toEqual(arKeys);
  });

  it("every key has a non-empty value in both locales", () => {
    for (const locale of LOCALES) {
      for (const [k, v] of Object.entries(dictionaries[locale])) {
        expect(v.trim(), `${locale}.${k}`).not.toBe("");
      }
    }
  });

  it("makeT interpolates variables and falls back to ar then to the key", () => {
    const tAr = makeT("ar");
    const tEn = makeT("en");
    expect(tAr("step") + " " + tAr("of")).toBeTruthy();
    expect(tEn("brand")).toBe("Aqar Rent");
    // unknown key returns itself instead of crashing
    expect(tAr("definitely.missing.key")).toBe("definitely.missing.key");
    // no leftover {placeholders} in shipped copy
    for (const locale of LOCALES) {
      for (const [k, v] of Object.entries(dictionaries[locale])) {
        expect(v, `${locale}.${k}`).not.toMatch(/\{[a-z_]+\}/);
      }
    }
  });

  it("dirOf maps ar→rtl, en→ltr", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });
});

describe("formatting", () => {
  it("formats money with Arabic digits in Arabic and Latin digits in English", () => {
    expect(formatMoney(7500, "ar")).toBe("٧٬٥٠٠");
    expect(formatMoney(7500, "en")).toBe("7,500");
  });
  it("waHref builds an international wa.me link", () => {
    expect(waHref("01001112233", "hi there")).toBe("https://wa.me/201001112233?text=hi%20there");
  });
});
