// Stage 3A acceptance: the full owner journey end-to-end against the real
// backend (MockProvider) + the React admin, then the tenant journey.
//
//   register → verify identity → submit listing (wizard) → admin approves
//   → pay (signed mock webhook) → listing live → tenant finds it by filter
//   AND on the map → tenant logs in → contacts owner (event logged).
//
// Run:  cd e2e && npx playwright test
// (webServer boots a hermetic stack: backend:8010 fresh SQLite, web:3010, admin:5180)
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import { totp } from "../utils/totp";

const OWNER_PHONE = "01005556677";
const TENANT_PHONE = "01009998877";
const ADMIN_EMAIL = "admin@aqar-rent.dev";
const ADMIN_PASSWORD = "ChangeMeAdmin!2026";
const ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const ADMIN_URL = "http://localhost:5180";

const FIXTURES = [
  path.join(__dirname, "..", "fixtures", "photo1.jpg"),
  path.join(__dirname, "..", "fixtures", "photo2.jpg"),
  path.join(__dirname, "..", "fixtures", "photo3.jpg"),
];

const TITLE = "شقة تجريبية 3 غرف مدينة نصر";
const RENT = "7500";

async function otpLogin(request: APIRequestContext, phone: string): Promise<string> {
  const req = await request.post("/api/v1/auth/otp/request", { data: { phone } });
  expect(req.ok()).toBeTruthy();
  const { dev_code } = await req.json();
  expect(dev_code, "DEBUG=true must expose dev_code").toBeTruthy();
  const res = await request.post("/api/v1/auth/otp/verify", {
    data: { phone, code: dev_code, platform: "web" },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.tokens.access_token as string;
}


async function uiLogin(page: Page, phone: string, nextPath?: string) {
  if (nextPath) await page.goto(nextPath);
  else if (!page.url().includes("/login")) await page.goto("/ar/login");
  await page.getByTestId("input-phone").fill(phone);
  await page.getByTestId("btn-send-code").click();
  await expect(page.getByTestId("otp-form")).toBeVisible();
  const code = ((await page.getByTestId("dev-code-value").innerText()) || "").trim();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByTestId("input-code").fill(code);
  await page.getByTestId("btn-verify").click();
  // session lands in localStorage
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem("aqar.access")))
    .toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test("full owner journey: register → verify → submit → admin approve → pay → live → tenant finds & contacts", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(280_000);

  // ── 1. owner registers via OTP (web) ───────────────────────────────────
  await test.step("owner registers / logs in", async () => {
    await uiLogin(page, OWNER_PHONE);
    await expect(page.getByTestId("logout")).toBeVisible();
  });

  // ── 2. owner uploads ownership proof ───────────────────────────────────
  await test.step("owner uploads verification document", async () => {
    await page.goto("/ar/owner/verification");
    await page.getByTestId("select-doc-type").selectOption("electricity_bill");
    await page.getByTestId("input-doc-file").setInputFiles(FIXTURES[0]!);
    await page.getByTestId("btn-upload-doc").click();
    await expect(page.getByTestId("verification-list")).toBeVisible();
    await expect(page.getByTestId("verification-list").getByRole("listitem").first()).toBeVisible();
  });

  // ── 3. owner creates the listing through the wizard ────────────────────
  let listingId = "";
  await test.step("owner submits listing via 6-step wizard", async () => {
    await page.goto("/ar/owner/new");
    await expect(page.getByTestId("listing-wizard")).toBeVisible();

    // step 1 — basics
    await expect(page.getByTestId("step-basics")).toBeVisible();
    await page.getByTestId("input-title").fill(TITLE);
    await page.getByTestId("input-rent").fill(RENT);
    await page.getByTestId("select-property-type").selectOption("apartment");
    await page.getByTestId("select-furnished").selectOption("unfurnished");
    await page.getByTestId("btn-next").click();

    // step 2 — specs
    await expect(page.getByTestId("step-specs")).toBeVisible();
    await page.getByTestId("input-area").fill("95");
    await page.getByTestId("input-bedrooms").fill("3");
    await page.getByTestId("btn-next").click();

    // step 3 — location (governorate → city → address → manual pin inputs)
    await expect(page.getByTestId("step-location")).toBeVisible();
    await page.getByTestId("select-governorate").waitFor();
    await page.getByTestId("select-governorate").selectOption({ index: 1 });
    await expect
      .poll(async () => page.getByTestId("select-city").locator("option").count(), { timeout: 15_000 })
      .toBeGreaterThan(1);
    await page.getByTestId("select-city").selectOption({ index: 1 });
    await page.getByTestId("input-address").fill("شارع مصطفى النحاس، مدينة نصر، القاهرة");
    await page.getByTestId("input-latitude").fill("30.082500");
    await page.getByTestId("input-longitude").fill("31.246500");
    await page.getByTestId("btn-next").click(); // creates the draft on the backend

    // step 4 — photos (3 required, client-compressed, uploaded on next)
    await expect(page.getByTestId("step-photos")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("input-photos").setInputFiles(FIXTURES);
    await expect.poll(async () => page.getByTestId("photo-count").innerText(), { timeout: 30_000 }).toContain("3/15");
    await page.getByTestId("btn-next").click();

    // step 5 — description
    await expect(page.getByTestId("step-description")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("input-description").fill(
      "شقة مكونة من 3 غرف نوم وصالة، تشطيب حديث، قريبة من محطة المترو، متاحة للسكن الفوري.",
    );
    await page.getByTestId("btn-next").click();

    // step 6 — review & submit for moderation
    await expect(page.getByTestId("step-review")).toBeVisible();
    await page.getByTestId("btn-submit-listing").click();
    await expect(page.getByTestId("wizard-submitted")).toBeVisible({ timeout: 30_000 });

    // capture the new listing id from the owner dashboard
    await page.goto("/ar/owner");
    const row = page.locator('[data-testid="owner-listing"]', { hasText: TITLE }).first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-status", "submitted");
    listingId = (await row.getAttribute("data-listing-id")) || "";
    expect(listingId).toMatch(/^[0-9a-f-]{36}$/);
  });

  // ── 4. admin approves verification + listing ───────────────────────────
  await test.step("admin (2FA) approves verification and listing", async () => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByTestId("input-email").fill(ADMIN_EMAIL);
    await page.getByTestId("input-password").fill(ADMIN_PASSWORD);
    await page.getByTestId("input-totp").fill(totp(ADMIN_TOTP_SECRET));
    await page.getByTestId("btn-login").click();
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 20_000 });

    // verification queue → approve owner's document
    await page.getByTestId("nav-verifications").click();
    await expect(page.getByTestId("verifications-page")).toBeVisible();
    const vRow = page.locator('[data-testid="verification-row"]', { hasText: OWNER_PHONE }).first();
    await expect(vRow).toBeVisible();
    await vRow.getByTestId("btn-view-doc").click();
    await expect(page.getByTestId("doc-viewer")).toBeVisible();
    await page.getByTestId("btn-approve-doc").click();
    await expect(page.getByTestId("doc-viewer")).toBeHidden({ timeout: 20_000 });

    // moderation queue → approve our listing
    await page.getByTestId("nav-moderation").click();
    await expect(page.getByTestId("moderation-page")).toBeVisible();
    await page.getByTestId("moderation-search").fill(OWNER_PHONE);
    const qRow = page.locator('[data-testid="queue-row"]', { hasText: TITLE }).first();
    await expect(qRow).toBeVisible({ timeout: 20_000 });
    await qRow.getByTestId("btn-open-detail").click();
    await expect(page.getByTestId("moderation-detail")).toBeVisible();
    await page.getByTestId("btn-approve").click();
    await expect(page.getByTestId("moderation-detail")).toBeHidden();
  });

  // ── 5. owner pays (MockProvider signed webhook) → listing goes live ────
  await test.step("owner checks out and pays with the signed mock webhook", async () => {
    await page.goto("/ar/owner");
    const row = page.locator(`[data-testid="owner-listing"][data-listing-id="${listingId}"]`);
    await expect(row).toHaveAttribute("data-status", "approved", { timeout: 20_000 });

    await row.getByTestId("btn-renew").click(); // checkout for an approved listing
    await expect(page.getByTestId("checkout-form")).toBeVisible();
    await page.getByTestId("weeks-1").click();
    await page.getByTestId("method-card").click();
    await expect(page.getByTestId("checkout-total")).toContainText("500");
    await page.getByTestId("btn-create-order").click();

    await expect(page.getByTestId("order-pending")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mock-panel")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("btn-simulate-success").click();
    await expect(page.getByTestId("payment-success")).toBeVisible({ timeout: 40_000 });

    // listing is now active with days left on the ad period
    await page.goto("/ar/owner");
    const liveRow = page.locator(`[data-testid="owner-listing"][data-listing-id="${listingId}"]`);
    await expect(liveRow).toHaveAttribute("data-status", "active", { timeout: 20_000 });
    await expect(liveRow.getByTestId("stat-days-left")).not.toHaveText("—");
  });

  // ── 6. tenant finds it (filters + map) in a fresh session ──────────────
  const tenantContext = await browser.newContext({ locale: "ar-EG", timezoneId: "Africa/Cairo" });
  const tenantPage = await tenantContext.newPage();
  await test.step("tenant finds the listing by filter and by map", async () => {
    await tenantPage.goto("/ar/search?property_type=apartment&min_price=5000&max_price=10000&bedrooms=3");
    const card = tenantPage.locator(`[data-listing-id="${listingId}"]`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    // map shares the same filtered result set — price pin for our listing
    await expect(
      tenantPage.locator(`[data-testid="price-pin"][data-listing-id="${listingId}"]`),
    ).toBeAttached({ timeout: 40_000 });

    // "search this area" flow: bbox in URL ≠ current map bounds → button → refetch
    await tenantPage.goto("/ar/search?property_type=apartment&min_price=5000&max_price=10000&bedrooms=3&bbox=24.0,21.5,36.5,31.5");
    const areaBtn = tenantPage.getByTestId("search-area");
    try {
      await expect(areaBtn).toBeVisible({ timeout: 8_000 });
    } catch {
      // no moveend yet (no tiles loaded) — nudge the map to trigger one
      const canvas = tenantPage.locator('[data-testid="maplibre"]');
      const box = await canvas.boundingBox();
      if (box) {
        await tenantPage.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.75);
        await tenantPage.mouse.down();
        await tenantPage.mouse.move(box.x + box.width * 0.2 + 70, box.y + box.height * 0.75 + 45, { steps: 10 });
        await tenantPage.mouse.up();
      }
      await expect(areaBtn).toBeVisible({ timeout: 15_000 });
    }
    await areaBtn.click();
    await expect(tenantPage).toHaveURL(/bbox=/);
    await expect(tenantPage.locator(`[data-listing-id="${listingId}"]`).first()).toBeVisible({ timeout: 30_000 });
  });

  await test.step("tenant opens detail (SEO + verified badge) and logs in to contact", async () => {
    const href = await tenantPage.locator(`[data-listing-id="${listingId}"]`).first().locator("a").getAttribute("href");
    expect(href).toContain(listingId);
    await tenantPage.goto(href!);

    await expect(tenantPage.getByTestId("listing-detail")).toBeVisible();
    await expect(tenantPage.getByTestId("listing-title")).toContainText("3 غرف");
    await expect(tenantPage.getByTestId("verified-badge")).toBeVisible(); // admin approved the proof
    // JSON-LD Residence + Offer
    const ld = await tenantPage.locator('script[type="application/ld+json"]').first().textContent();
    expect(ld).toContain("Residence");
    expect(ld).toContain("EGP");

    // login-gated contact: logged-out users see the login gate, not the buttons
    await expect(tenantPage.getByTestId("login-for-contact")).toBeVisible();
    await expect(tenantPage.getByTestId("btn-call")).toHaveCount(0);
    await tenantPage.getByTestId("login-for-contact").click();
    await expect(tenantPage.getByTestId("login-form")).toBeVisible();
    await uiLogin(tenantPage, TENANT_PHONE);
    await expect(tenantPage).toHaveURL(new RegExp(listingId), { timeout: 20_000 });

    await tenantPage.getByTestId("btn-call").click();
    await expect(tenantPage.getByTestId("contact-revealed")).toBeVisible({ timeout: 20_000 });
    await expect(tenantPage.getByTestId("owner-phone")).toContainText(OWNER_PHONE);

    // the contact event was logged for the owner's stats
    const ownerToken = await otpLogin(request, OWNER_PHONE);
    const statsRes = await request.get("/api/v1/me/listings", { headers: { Authorization: `Bearer ${ownerToken}` } });
    const mine = (await statsRes.json()) as { id: string; stats: { contact_count: number } }[];
    const stats = mine.find((m) => m.id === listingId);
    expect(stats).toBeTruthy();
    expect(stats!.stats.contact_count).toBeGreaterThanOrEqual(1);
  });

  await tenantContext.close();
});
