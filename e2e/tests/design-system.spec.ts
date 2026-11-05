/**
 * Design-system verification (Aqar identity / ADR-034) — scripted "manual" checks of
 * the key screens in Arabic + English: computed styles, WCAG AA contrast for
 * critical pairs, focus visibility, RTL indicator placement, and that no
 * existing e2e selectors broke.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, PHONES, adminLogin, makeActiveListing } from "../utils/api";

// Exact identity values — mirrors design/tokens.json (the single source).
const GOLD = "rgb(189, 167, 126)"; // #BDA77E Aqar Gold
const GOLD_LIGHT = "rgb(227, 210, 168)"; // #E3D2A8 gradient start
const GOLD_DARK = "rgb(143, 122, 82)"; // #8F7A52 gradient end (large text / 3:1 UI)
const GOLD_INK = "rgb(111, 93, 58)"; // #6F5D3A gold-family TEXT on light (6.36:1)
const NAVY = "rgb(22, 39, 59)"; // #16273B Aqar Navy
const NAVY_DEEP = "rgb(14, 23, 40)"; // #0E1728 Deep Navy
const BG = "rgb(247, 245, 240)"; // #F7F5F0 warm canvas
const DARK_BG = "rgb(14, 23, 40)"; // #0E1728
const DARK_SURFACE = "rgb(23, 41, 63)"; // #17293F dark surface
const DARK_INK = "rgb(232, 226, 212)"; // #E8E2D4 text on dark

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

test("design system: public web (ar + en)", async ({ page, request }) => {
  // ── Home AR ─────────────────────────────────────────────────────────────
  await page.goto("/ar");
  await assertFonts(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  let bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(bodyColor).toBe(NAVY);

  // primary CTA: gold fill (a two-stop gradient, so the *image* is checked
  // rather than backgroundColor) + deep-navy text + AA contrast
  const submit = page.getByTestId("search-submit");
  await expect(submit).toBeVisible();
  const btnBg = await submit.evaluate((el) => getComputedStyle(el).backgroundImage);
  const btnFg = await submit.evaluate((el) => getComputedStyle(el).color);
  expect(btnBg, "primary button = gold gradient").toContain("227, 210, 168");
  expect(btnBg, "primary button = gold gradient").toContain("189, 167, 126");
  expect(btnFg, "text on gold = Deep Navy").toBe(NAVY_DEEP);
  expect(contrast(btnFg, GOLD), "AA on primary button").toBeGreaterThanOrEqual(4.5);
  // buttons are pills, 44px+ tall
  expect(await submit.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("999px");
  const btnBox = await submit.boundingBox();
  expect(btnBox!.height, "44px touch target").toBeGreaterThanOrEqual(44);

  // focus ring = gold-ink (6.36:1 on white), visible
  await page.getByTestId("search-input").focus();
  const outline = await page.getByTestId("search-input").evaluate((el) => getComputedStyle(el).outlineColor);
  expect(outline, "focus ring = gold-ink").toBe(GOLD_INK);

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

  // ── Active nav state (header) — gold tint + navy label, AA ──────────────
  const activeNav = page.locator('.site-main-nav a[aria-current="page"]').first();
  await expect(activeNav).toBeVisible();
  const navFg = await activeNav.evaluate((el) => getComputedStyle(el).color);
  const navBg = await activeNav.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(contrast(navFg, over(navBg, "rgb(255, 255, 255)"))).toBeGreaterThanOrEqual(4.5);

  // ── Verified mark is GOLD everywhere (never a second hue) ──────────────
  const verifiedCss = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-verified").trim(),
  );
  expect(verifiedCss.toUpperCase()).toBe("#6F5D3A");

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
  expect(priceColor, "price uses the gold-family text colour").toBe(GOLD_INK);
  // gold-ink is 6.36:1 on white — AA for normal text, not just large text
  expect(contrast(priceColor, "rgb(255, 255, 255)"), "AA on price").toBeGreaterThanOrEqual(4.5);
  // prices line up in a column: tabular figures
  expect(await page.getByTestId("listing-price").evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain("tabular-nums");

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
  expect(sbBg, "owner sidebar = primary navy").toBe(NAVY);
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
  const ctaBg = await addBtn.evaluate((el) => getComputedStyle(el).backgroundImage);
  const ctaFg = await addBtn.evaluate((el) => getComputedStyle(el).color);
  expect(ctaBg).toContain("189, 167, 126");
  expect(ctaFg).toBe(NAVY_DEEP);
  expect(contrast(ctaFg, GOLD)).toBeGreaterThanOrEqual(4.5);
});

test("design system: checkout + admin console", async ({ page, request }) => {
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
  const bg = await createBtn.evaluate((el) => getComputedStyle(el).backgroundImage);
  const fg = await createBtn.evaluate((el) => getComputedStyle(el).color);
  expect(bg).toContain("189, 167, 126");
  expect(fg).toBe(NAVY_DEEP);
  expect(contrast(fg, GOLD)).toBeGreaterThanOrEqual(4.5);

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
  expect(await adminSidebar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(NAVY);

  // active dashboard item: gold label + soft-gold bg + indicator
  const dashNav = page.locator('[data-testid="admin-sidebar"] a[aria-current="page"]').first();
  await expect(dashNav).toHaveAttribute("aria-current", "page");
  const dashColor = await dashNav.evaluate((el) => getComputedStyle(el).color);
  expect(dashColor).toBe(GOLD);
  const dashBg = await dashNav.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(contrast(dashColor, over(dashBg, NAVY))).toBeGreaterThanOrEqual(4.5);
  const adminInd = page.locator('[data-testid="admin-sidebar"] [data-testid="nav-indicator"]');
  await expect(adminInd).toBeVisible();
  expect(await adminInd.evaluate((el) => getComputedStyle(el).width)).toBe("3px");
  // the rail is a single shared element translated to the active row; it must
  // sit on that row's inline-start edge (LTR: left)
  const geo = await adminInd.evaluate((el) => {
    const ind = el.getBoundingClientRect();
    const link = document.querySelector('[data-testid="admin-sidebar"] a[aria-current="page"]')!.getBoundingClientRect();
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    return { gap: rtl ? link.right - ind.right : ind.left - link.left };
  });
  expect(geo.gap, "indicator flush to the active row's inline-start").toBeLessThan(2);

  // moderation queue renders with the same selectors
  await page.getByTestId("nav-moderation").click();
  await expect(page.getByTestId("moderation-page")).toBeVisible();
  await expect(page.getByTestId("moderation-search")).toBeVisible();
  const modInd = page.locator('[data-testid="admin-sidebar"] [data-testid="nav-indicator"]');
  await expect(modInd).toHaveCount(1); // now on moderation (single active)
  await expect(page.locator('[data-testid="admin-sidebar"] a[aria-current="page"]')).toHaveCount(1);
});

test("dark mode: full support (persisted, AA)", async ({ page }) => {
  await page.goto("/ar");
  // explicit dark choice persists across reloads (no flash: init script runs pre-paint)
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  // theme swap animates for ~160ms: wait for the canvas colour to settle
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(DARK_BG);
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bodyFg = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(bodyBg, "dark canvas #0E1728").toBe(DARK_BG);
  expect(contrast(bodyFg, bodyBg), "AA: ink on dark bg").toBeGreaterThanOrEqual(4.5);
  await expect(page.getByTestId("search-submit")).toBeVisible();
  const btnBg = await page.getByTestId("search-submit").evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(btnBg, "gold buttons unchanged in dark").toContain("189, 167, 126");
  const btnFg = await page.getByTestId("search-submit").evaluate((el) => getComputedStyle(el).color);
  expect(contrast(btnFg, GOLD)).toBeGreaterThanOrEqual(4.5);

  await page.reload();
  await expect(page.locator("html"), "preference persisted").toHaveClass(/dark/);

  // surface token on a card
  await page.goto("/ar/search");
  const card = page.locator('[data-testid="listing-card"]').first();
  if ((await card.count()) > 0) {
    const surface = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(surface).toBe(DARK_SURFACE);
  }

  // back to light
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  // let the light swap (and its transition) finish before leaving the origin
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(BG);

  // admin mirrors the same dark system
  await page.goto("http://localhost:5180/");
  const adminDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  // fresh origin may default to system (headless = light) → toggle explicitly
  if (!adminDark) await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  // the console animates the theme swap (~160ms) — wait for the colour to land
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(DARK_BG);
  const adminBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const adminFg = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(contrast(adminFg, adminBg)).toBeGreaterThanOrEqual(4.5);
  await page.getByTestId("theme-toggle").click();
});

test("premium ListingCard: cinematic layout + motion hooks", async ({ page, request }) => {
  const id = await makeActiveListing(request, PHONES.designOwner, "apiH", `كارد ${Date.now().toString(36)}`);
  await page.goto(`/ar/search?q=${encodeURIComponent("كارد")}`);
  const card = page.locator(`[data-listing-id="${id}"]`).first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  // structure:16:10 media + gradient overlay + dominant price + meta row
  const media = card.locator(".relative").first();
  const box = await media.boundingBox();
  expect(box!.width / box!.height).toBeGreaterThan(1.5); // ≈16:10
  await expect(card.getByTestId("badge-premium")).toBeVisible(); // "متاح الآن" gradient badge
  const price = card.locator("p.text-2xl").first();
  await expect(price).toBeVisible();
  // price sits ON the image gradient: warm on-dark (#E8E2D4), AA against the scrim
  expect(await price.evaluate((el) => getComputedStyle(el).color)).toBe(DARK_INK);
  // hover lift (card-lift class → scale + elevate)
  await expect(card).toHaveClass(/card-lift/);
  await card.hover();
  const transform = await card.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe("none"); // scale transition applied
  // skeleton matches the card shape (delay the client fetch to observe it)
  await page.goto("/ar/login");
  await page.getByTestId("input-phone").fill(PHONES.designOwner);
  await page.getByTestId("btn-send-code").click();
  await expect(page.getByTestId("otp-form")).toBeVisible();
  await page.getByTestId("input-code").fill((await page.getByTestId("dev-code-value").innerText()).trim());
  await page.getByTestId("btn-verify").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

  await page.route("**/api/v1/favorites*", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.goto("/ar/favorites");
  await expect(page.getByTestId("loading-skeleton").first().locator(".skeleton").first()).toBeAttached({
    timeout: 10_000,
  });
  await page.unroute("**/api/v1/favorites*");
  // empty state: illustration + warm microcopy (favorites are empty for this user)
  await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("empty-state").locator("svg")).toBeVisible();
});
