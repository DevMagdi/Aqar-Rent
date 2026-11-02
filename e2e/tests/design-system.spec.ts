/**
 * Design-system verification (Mantiq / ADR-034) — scripted "manual" checks of
 * the key screens in Arabic + English: computed styles, WCAG AA contrast for
 * critical pairs, focus visibility, RTL indicator placement, and that no
 * existing e2e selectors broke.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, PHONES, adminLogin, makeActiveListing } from "../utils/api";

const GOLD = "rgb(189, 167, 126)"; // #BDA77E
const GOLD_DARK = "rgb(143, 122, 82)"; // #8F7A52
const NAVY = "rgb(22, 39, 59)"; // #16273B
const NAVY_DEEP = "rgb(14, 23, 40)"; // #0E1728
const BG = "rgb(250, 251, 252)"; // #FAFBFC

function parseRgb(c: string): [number, number, number, number] {
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) throw new Error(`cannot parse color: ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}
function lum([r, g, b]: [number, number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const la = lum(parseRgb(a));
  const lb = lum(parseRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** composite rgba over solid */
function over(rgba: string, solid: string): string {
  const [r, g, b, a] = parseRgb(rgba);
  const [sr, sg, sb] = parseRgb(solid);
  const mix = (c: number, s: number) => Math.round(c * a + s * (1 - a));
  return `rgb(${mix(r, sr)}, ${mix(g, sg)}, ${mix(b, sb)})`;
}

async function assertFonts(page: Page, locale: "ar" | "en") {
  const ff = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(ff, "IBM Plex Sans Arabic must be the first family").toContain("IBM Plex Sans Arabic");
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

test.describe.configure({ mode: "serial" });

test("Mantiq design system: public web (ar + en)", async ({ page, request }) => {
  // ── Home AR ─────────────────────────────────────────────────────────────
  await page.goto("/ar");
  await assertFonts(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  let bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(bodyColor).toBe(NAVY);

  // primary CTA: gold bg + deep-navy text + AA contrast
  const submit = page.getByTestId("search-submit");
  await expect(submit).toBeVisible();
  const btnBg = await submit.evaluate((el) => getComputedStyle(el).backgroundColor);
  const btnFg = await submit.evaluate((el) => getComputedStyle(el).color);
  expect(btnBg, "primary button = Mantiq Gold").toBe(GOLD);
  expect(btnFg, "text on gold = Deep Navy").toBe(NAVY_DEEP);
  expect(contrast(btnFg, btnBg), "AA on primary button").toBeGreaterThanOrEqual(4.5);

  // focus ring = gold-dark, visible
  await page.getByTestId("search-input").focus();
  const outline = await page.getByTestId("search-input").evaluate((el) => getComputedStyle(el).outlineColor);
  expect(outline, "focus ring = gold-dark").toBe(GOLD_DARK);

  // body contrast AA (ink on bg)
  expect(contrast(bodyColor, BG)).toBeGreaterThanOrEqual(4.5);

  // ── Home EN (same system, ltr) ─────────────────────────────────────────
  await page.goto("/en");
  await assertFonts(page, "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  // ── Search results + map: selectors intact + navy text ─────────────────
  await page.goto("/ar/search");
  await expect(page.getByTestId("filters")).toBeVisible();
  await expect(page.getByTestId("results-count")).toBeVisible();
  await expect(page.getByTestId("maplibre")).toBeAttached();

  // ── Active nav indicator (header) — inline-start, gold,3px ─────────────
  const ind = page.getByTestId("nav-indicator").first();
  await expect(ind).toBeVisible();
  const indBg = await ind.evaluate((el) => getComputedStyle(el).backgroundColor);
  // light-chrome header: indicator = gold-dark (gold on white is only2.1:1 —
  // graphics need3:1; the gold label rule applies to dark chrome sidebars)
  expect(indBg).toBe(GOLD_DARK);
  const indW = await ind.evaluate((el) => getComputedStyle(el).width);
  expect(indW).toBe("3px");
  const indStart = await ind.evaluate((el) => getComputedStyle(el).insetInlineStart);
  expect(["0px", "auto", "auto 0px"].some((v) => indStart === v) || parseFloat(indStart || "0") === 0).toBeTruthy();

  // ── Listing detail (created for real) ─────────────────────────────────
  const detailId = await makeActiveListing(request, PHONES.journeyOwner, "apiG", `ديزاين ${Date.now().toString(36)}`);
  await page.goto(`/ar/search?q=${encodeURIComponent("ديزاين")}`);
  const card = page.locator(`[data-listing-id="${detailId}"]`).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await page.goto(`/ar/search?q=${encodeURIComponent("ديزاين")}`);
  const href = await card.locator("a").getAttribute("href");
  await page.goto(href!);
  await expect(page.getByTestId("listing-detail")).toBeVisible();
  await assertFonts(page, "ar");
  const priceColor = await page.getByTestId("listing-price").evaluate((el) => getComputedStyle(el).color);
  expect(priceColor, "accent text on white = gold-dark").toBe(GOLD_DARK);
  // price is24px extrabold → WCAG "large text" threshold is3:1 (spec keeps
  // gold-dark for large accents; normal-size text never uses gold on white)
  expect(contrast(priceColor, "rgb(255, 255, 255)"), "AA-large on price").toBeGreaterThanOrEqual(3);

  // ── Owner dashboard: navy sidebar + gold active + indicator ────────────
  const designOwner = PHONES.designOwner;
  await page.goto("/ar/login");
  await page.getByTestId("input-phone").fill(designOwner);
  await page.getByTestId("btn-send-code").click();
  await expect(page.getByTestId("otp-form")).toBeVisible();
  const devCode = (await page.getByTestId("dev-code-value").innerText()).trim();
  await page.getByTestId("input-code").fill(devCode);
  await page.getByTestId("btn-verify").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

  await page.goto("/ar/owner");
  await expect(page.getByTestId("owner-shell")).toBeVisible();
  const sidebar = page.getByTestId("owner-sidebar");
  await expect(sidebar).toBeVisible();
  const sbBg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(sbBg, "owner sidebar = Deep Navy").toBe(NAVY_DEEP);
  const active = page.getByTestId("side-dashboard");
  await expect(active).toHaveAttribute("aria-current", "page");
  const activeColor = await active.evaluate((el) => getComputedStyle(el).color);
  expect(activeColor, "active nav label = Gold").toBe(GOLD);
  const activeBg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
  // soft gold (14%) over navy sidebar → composited contrast for the gold label
  const composite = over(activeBg, NAVY_DEEP);
  expect(contrast(activeColor, composite), "AA: gold label on soft-gold/navy").toBeGreaterThanOrEqual(4.5);
  const sideInd = page.getByTestId("side-indicator");
  await expect(sideInd).toBeVisible();
  expect(await sideInd.evaluate((el) => getComputedStyle(el).width)).toBe("3px");

  // primary owner CTA
  const addBtn = page.getByTestId("btn-add-listing");
  await expect(addBtn).toBeVisible();
  const ctaBg = await addBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  const ctaFg = await addBtn.evaluate((el) => getComputedStyle(el).color);
  expect(ctaBg).toBe(GOLD);
  expect(ctaFg).toBe(NAVY_DEEP);
  expect(contrast(ctaFg, ctaBg)).toBeGreaterThanOrEqual(4.5);
});

test("Mantiq design system: checkout + admin console", async ({ page, request }) => {
  // ── Checkout (owner area, after sidebar) ───────────────────────────────
  const designOwner = PHONES.designOwner;
  await makeActiveListing(request, designOwner, "apiG", `تشيك اوت ${Date.now().toString(36)}`);
  await page.goto("/ar/login");
  await page.getByTestId("input-phone").fill(designOwner);
  await page.getByTestId("btn-send-code").click();
  await expect(page.getByTestId("otp-form")).toBeVisible();
  const devCode = (await page.getByTestId("dev-code-value").innerText()).trim();
  await page.getByTestId("input-code").fill(devCode);
  await page.getByTestId("btn-verify").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

  const mine = await request.get("/api/v1/me/listings", {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("aqar.access"))}` },
  });
  const rows = (await mine.json()) as { id: string; status: string }[];
  const target = rows.find((r) => r.status === "active")!;
  await page.goto(`/ar/owner/checkout?listing=${target.id}`);
  await expect(page.getByTestId("checkout-form")).toBeVisible();
  await expect(page.getByTestId("owner-sidebar")).toBeVisible();
  const createBtn = page.getByTestId("btn-create-order");
  const bg = await createBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  const fg = await createBtn.evaluate((el) => getComputedStyle(el).color);
  expect(bg).toBe(GOLD);
  expect(fg).toBe(NAVY_DEEP);
  expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);

  // ── Admin: login → sidebar/dashboard → moderation queue ────────────────
  await page.goto("http://localhost:5180/login");
  await page.getByTestId("input-password").fill(ADMIN.password);
  await page.getByTestId("input-totp").fill(
    (await import("../utils/totp")).totp(ADMIN.totpSecret),
  );
  await page.getByTestId("btn-login").click();
  await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 20_000 });

  const adminSidebar = page.getByTestId("admin-sidebar");
  await expect(adminSidebar).toBeVisible();
  expect(await adminSidebar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(NAVY_DEEP);

  // active dashboard item: gold label + soft-gold bg + indicator
  const dashNav = page.getByTestId("nav-dashboard");
  await expect(dashNav).toHaveAttribute("aria-current", "page");
  const dashColor = await dashNav.evaluate((el) => getComputedStyle(el).color);
  expect(dashColor).toBe(GOLD);
  const dashBg = await dashNav.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(contrast(dashColor, over(dashBg, NAVY_DEEP))).toBeGreaterThanOrEqual(4.5);
  const adminInd = page.locator('[data-testid="admin-sidebar"] [data-testid="nav-indicator"]');
  await expect(adminInd).toBeVisible();
  expect(await adminInd.evaluate((el) => getComputedStyle(el).width)).toBe("3px");
  // indicator sits on the inline-start edge (LTR: left)
  const geo = await adminInd.evaluate((el) => {
    const ind = el.getBoundingClientRect();
    const link = el.closest("a")!.getBoundingClientRect();
    return { gap: ind.left - link.left };
  });
  // indicator flush with the ACTIVE ITEM's inline-start edge (RTL uses right)
  expect(geo.gap, "indicator flush to item inline-start").toBeLessThan(2);

  // moderation queue renders with the same selectors
  await page.getByTestId("nav-moderation").click();
  await expect(page.getByTestId("moderation-page")).toBeVisible();
  await expect(page.getByTestId("moderation-search")).toBeVisible();
  const modInd = page.locator('[data-testid="admin-sidebar"] [data-testid="nav-indicator"]');
  await expect(modInd).toHaveCount(1); // now on moderation (single active)
  await expect(page.getByTestId("nav-moderation")).toHaveAttribute("aria-current", "page");
});
