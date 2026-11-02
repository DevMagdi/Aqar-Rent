// Public surface: home, static pages, locales/RTL, SEO artifacts, search SSR,
// and detail-page JSON-LD/verified badge on an API-created active listing.
import { expect, test } from "@playwright/test";
import { PHONES, RUN, makeActiveListing } from "../utils/api";

const STATIC = ["about", "how-it-works", "terms", "privacy", "content-rules", "support"];

test.describe.configure({ mode: "serial" });

test("public pages, locales and SEO artifacts", async ({ page, request }) => {
  test.setTimeout(240_000);

  await test.step("home renders (ar default, RTL)", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("hero")).toBeVisible();
    await expect(page.getByTestId("search-input")).toBeVisible();
    await expect(page.getByTestId("latest-listings").or(page.getByTestId("empty-state")).first()).toBeVisible();
  });

  await test.step("language switch keeps the path and flips direction", async () => {
    await page.getByTestId("lang-switch").click();
    await expect(page).toHaveURL(/\/en/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByTestId("brand")).toContainText("Aqar Rent");
  });

  await test.step("six static pages render in both locales", async () => {
    for (const locale of ["ar", "en"]) {
      for (const slug of STATIC) {
        const res = await page.goto(`/${locale}/${slug}`);
        expect(res?.status(), `${locale}/${slug}`).toBe(200);
        await expect(page.locator("h1")).toBeVisible();
        // canonical + hreflang point at this exact page
        const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
        expect(canonical, `${locale}/${slug} canonical`).toContain(`/${locale}/${slug}`);
        const hreflang = await page.locator('link[rel="alternate"][hreflang="ar"]').getAttribute("href");
        expect(hreflang).toContain(`/ar/${slug}`);
      }
    }
  });

  await test.step("robots.txt and sitemap.xml", async () => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("sitemap.xml");
    expect(robots.toLowerCase()).toContain("disallow: /owner");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/ar</loc>");
    expect(sitemap).toContain("/en</loc>");
    expect(sitemap).toContain("/ar/search");
    expect(sitemap).toContain("hreflang");
  });

  await test.step("unknown route → 404", async () => {
    const res = await page.goto("/ar/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  await test.step("OG image renders", async () => {
    const res = await request.get("/og?title=Aqar%20Rent&sub=egypt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image");
    expect((await res.body()).length).toBeGreaterThan(5_000);
  });

  await test.step("search page SSRs filters + results chrome", async () => {
    await page.goto("/ar/search?property_type=apartment&sort=price_asc");
    await expect(page.getByTestId("filters")).toBeVisible();
    await expect(page.getByTestId("filter-property-type")).toHaveValue("apartment");
    await expect(page.getByTestId("filter-sort")).toHaveValue("price_asc");
    await expect(page.getByTestId("results-count")).toBeVisible();
    await expect(page.getByTestId("clear-filters")).toBeVisible();
  });

  await test.step("active listing detail: JSON-LD, verified badge, hreflang", async () => {
    const title = `إعلان تحقق سيو ${RUN}`;
    const id = await makeActiveListing(request, PHONES.journeyOwner, "apiC", title);

    await page.goto(`/ar/search?q=${encodeURIComponent(title)}`);
    const card = page.locator(`[data-listing-id="${id}"]`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const detailHref = await card.locator("a").getAttribute("href");
    expect(detailHref).toContain(id);
    await page.goto(detailHref!); // full navigation keeps <head> clean
    await expect(page).toHaveURL(new RegExp(id));
    await expect(page.getByTestId("listing-detail")).toBeVisible();
    await expect(page.getByTestId("listing-title")).toContainText(title);
    await expect(page.getByTestId("verified-badge")).toBeVisible();

    const ldText = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(ldText).toBeTruthy();
    const ld = JSON.parse(ldText!);
    expect(ld["@type"]).toBe("Residence");
    expect(ld.offers["@type"]).toBe("Offer");
    expect(ld.offers.priceCurrency).toBe("EGP");
    expect(ld.image.length).toBeGreaterThanOrEqual(3);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toContain(id);
    const enHref = await page.locator('link[rel="alternate"][hreflang="en"]').getAttribute("href");
    expect(enHref).toContain(`/en/rent/`);

    // sitemap picks up the new listing in both locales
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(id);
  });
});
