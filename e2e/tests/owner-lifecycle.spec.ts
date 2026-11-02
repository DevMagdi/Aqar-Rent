// Owner lifecycle: reject with preset reason → owner sees it → edits & resubmits
// → admin approves → payment → live → owner notification (read it, clear it).
// Also: tenant favorites + report → admin reports queue action.
import { expect, test } from "@playwright/test";
import { totp } from "../utils/totp";
import {
  ADMIN,
  PHONES,
  RUN,
  adminLogin,
  createSubmittedListing,
  otpLogin,
  payForListing,
  rejectListing,
  approveListing,
  uploadVerification,
} from "../utils/api";

const TITLE = `إعادة اختبار الرفض والتعديل ${RUN}`;

test.describe.configure({ mode: "serial" });

test("reject → edit → resubmit → approve → pay → live + notifications; favorites & reports", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(300_000);

  // ── API setup: submitted listing for the lifecycle owner ───────────────
  const ownerToken = await otpLogin(request, PHONES.lifecycleOwner);
  await uploadVerification(request, ownerToken, "apiA1.jpg", PHONES.lifecycleOwner);
  const listingId = await createSubmittedListing(request, ownerToken, { title: TITLE, photoSet: "apiA" });
  const admin = await adminLogin(request);

  // ── admin rejects with a preset reason (UI) ────────────────────────────
  await test.step("admin rejects the listing with a preset reason", async () => {
    await page.goto("http://localhost:5180/login");
    await page.getByTestId("input-password").fill(ADMIN.password);
    await page.getByTestId("input-totp").fill(totp(ADMIN.totpSecret));
    await page.getByTestId("btn-login").click();
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("nav-moderation").click();
    await page.getByTestId("moderation-search").fill(PHONES.lifecycleOwner);
    const row = page.locator('[data-testid="queue-row"]', { hasText: TITLE }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByTestId("btn-open-detail").click();
    await expect(page.getByTestId("moderation-detail")).toBeVisible();
    await page.getByTestId("btn-reject").click();
    await page.getByTestId("select-reason").selectOption("phone_in_description");
    await page.getByTestId("input-note").fill("أزل رقم الهاتف من الوصف من فضلك");
    await page.getByTestId("btn-reject-confirm").click();
    await expect(page.getByTestId("moderation-detail")).toBeHidden({ timeout: 20_000 });
  });

  // ── owner sees the rejection, edits, resubmits (UI) ────────────────────
  await test.step("owner sees reject reason, edits and resubmits", async () => {
    // login through the API, then drive the UI (session persists per context)
    const ctx = await browser.newContext({ locale: "ar-EG" });
    const p = await ctx.newPage();
        await p.goto("/ar/login");
    await p.getByTestId("input-phone").fill(PHONES.lifecycleOwner);
    await p.getByTestId("btn-send-code").click();
    await expect(p.getByTestId("otp-form")).toBeVisible();
    const code = (await p.getByTestId("dev-code-value").innerText()).trim();
    await p.getByTestId("input-code").fill(code);
    await p.getByTestId("btn-verify").click();
    await expect.poll(() => p.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

    await p.goto("/ar/owner");
    const row = p.locator(`[data-testid="owner-listing"][data-listing-id="${listingId}"]`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-status", "rejected");
    await expect(row.getByTestId("reject-reason")).toContainText("Phone numbers or contact details");

    // edit the description via the wizard's edit mode and resubmit
    await row.getByTestId("btn-edit-listing").click();
    await expect(p.getByTestId("listing-wizard")).toBeVisible({ timeout: 30_000 });
    // jump to description step (step 5) using next buttons
    for (let i = 0; i < 4; i++) await p.getByTestId("btn-next").click();
    await expect(p.getByTestId("step-description")).toBeVisible({ timeout: 30_000 });
    await p.getByTestId("input-description").fill(
      "وصف معدّل بعد ملاحظة المشرف — بدون أرقام هاتف، بالكامل بالعربية ومفصل.",
    );
    await p.getByTestId("btn-next").click();
    await expect(p.getByTestId("step-review")).toBeVisible();
    await p.getByTestId("btn-submit-listing").click();
    await expect(p.getByTestId("wizard-submitted")).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });

  // ── admin approves (API) + owner pays (API) ────────────────────────────
  await test.step("approve and pay → active", async () => {
    await approveListing(request, admin, listingId);
    const { status } = await payForListing(request, ownerToken, listingId);
    expect(status).toBe("paid");
    const detail = await (
      await request.get(`/api/v1/listings/${listingId}`, { headers: { Authorization: `Bearer ${ownerToken}` } })
    ).json();
    expect(detail.status).toBe("active");
  });

  // ── owner notification center (UI) ─────────────────────────────────────
  await test.step("owner has unread notifications and can mark them read", async () => {
    const ctx = await browser.newContext({ locale: "ar-EG" });
    const p = await ctx.newPage();
        await p.goto("/ar/login");
    await p.getByTestId("input-phone").fill(PHONES.lifecycleOwner);
    await p.getByTestId("btn-send-code").click();
    await expect(p.getByTestId("otp-form")).toBeVisible();
    const code = (await p.getByTestId("dev-code-value").innerText()).trim();
    await p.getByTestId("input-code").fill(code);
    await p.getByTestId("btn-verify").click();
    await expect.poll(() => p.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

    await p.goto("/ar/notifications");
    await expect(p.getByTestId("notification-item").first()).toBeVisible({ timeout: 20_000 });
    const unreadBadge = p.getByTestId("mark-all-read");
    await expect(unreadBadge).toBeVisible();
    await unreadBadge.click();
    await expect(unreadBadge).toHaveCount(0, { timeout: 20_000 });
    await ctx.close();
  });

  // ── tenant favorites + reports (UI), admin acts on the report (UI) ─────
  await test.step("tenant favorites the listing and files a report", async () => {
    const ctx = await browser.newContext({ locale: "ar-EG" });
    const p = await ctx.newPage();
        await p.goto("/ar/login");
    await p.getByTestId("input-phone").fill(PHONES.tenant2);
    await p.getByTestId("btn-send-code").click();
    await expect(p.getByTestId("otp-form")).toBeVisible();
    const code = (await p.getByTestId("dev-code-value").innerText()).trim();
    await p.getByTestId("input-code").fill(code);
    await p.getByTestId("btn-verify").click();
    await expect.poll(() => p.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

    await p.goto(`/ar/search?q=${encodeURIComponent(TITLE)}`);
    const card = p.locator(`[data-listing-id="${listingId}"]`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.locator("a").click();
    await expect(p.getByTestId("listing-detail")).toBeVisible();

    await p.getByTestId("btn-favorite").click();
    await expect(p.getByTestId("btn-favorite")).toHaveAttribute("aria-pressed", "true");

    await p.goto("/ar/favorites");
    await expect(p.getByTestId("favorite-item").first()).toContainText(TITLE.slice(0, 12), { timeout: 20_000 });

    // report from the detail page (navigate back to the search result first)
    await p.goto(`/ar/search?q=${encodeURIComponent(TITLE)}`);
    const card2 = p.locator(`[data-listing-id="${listingId}"]`).first();
    await expect(card2).toBeVisible({ timeout: 30_000 });
    await card2.locator("a").click();
    await expect(p.getByTestId("listing-detail")).toBeVisible();
    await p.getByTestId("btn-report").click();
    await expect(p.getByTestId("report-modal")).toBeVisible();
    await p.getByTestId("report-reason").selectOption("wrong_info");
    await p.getByTestId("report-note").fill("العنوان لا يطابق الموقع");
    await p.getByTestId("report-submit").click();
    await expect(p.getByTestId("report-modal")).toBeHidden({ timeout: 20_000 });
    await ctx.close();
  });

  await test.step("admin dismisses the report", async () => {
    await page.goto("http://localhost:5180/reports");
    const row = page.locator('[data-testid="report-row"]', { hasText: TITLE }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByTestId("btn-report-action").click();
    await page.getByTestId("action-dismiss").click();
    await expect(page.getByTestId("report-row").filter({ hasText: TITLE })).toHaveCount(0, { timeout: 20_000 });
  });
});
