// Payments: promo discount at checkout, failure → retry → success (card +
// signed mock webhook), bank transfer with receipt + finance approval, and a
// full refund from the admin panel.
import { expect, test } from "@playwright/test";
import { totp } from "../utils/totp";
import { ADMIN, PHONES, RUN, adminLogin, createSubmittedListing, otpLogin, uploadVerification } from "../utils/api";

const ADMIN_URL = "http://localhost:5180";
const PROMO = `E2E${RUN}`; // percent, 10% — created below via the admin API

test.describe.configure({ mode: "serial" });

test("checkout: promo, failure+retry, bank transfer approval, refund", async ({ page, request }) => {
  test.setTimeout(300_000);

  const ownerToken = await otpLogin(request, PHONES.paymentsOwner);
  await uploadVerification(request, ownerToken, "apiB1.jpg", PHONES.paymentsOwner);
  const listingId = await createSubmittedListing(request, ownerToken, {
    title: `اختبار الدفع ${RUN}`,
    photoSet: "apiB",
    rent: 8000,
  });
  const admin = await adminLogin(request);

  await test.step("admin creates a 10% promo code", async () => {
    const res = await request.post("/api/v1/admin/promo-codes", {
      headers: { Authorization: `Bearer ${admin}` },
      data: { code: PROMO, type: "percent", value: 10 },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    // listing must be approved before checkout (BR-5)
    const approve = await request.post(`/api/v1/admin/listings/${listingId}/approve`, {
      headers: { Authorization: `Bearer ${admin}` },
    });
    expect(approve.ok()).toBeTruthy();
  });

  // UI: owner logs in and drives checkout
  await page.goto("/ar/login");
    await page.getByTestId("input-phone").fill(PHONES.paymentsOwner);
  await page.getByTestId("btn-send-code").click();
  await expect(page.getByTestId("otp-form")).toBeVisible();
  const code = (await page.getByTestId("dev-code-value").innerText()).trim();
  await page.getByTestId("input-code").fill(code);
  await page.getByTestId("btn-verify").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

  await test.step("checkout with promo: live totals (1000 − 100 = 900)", async () => {
    await page.goto("/ar/owner");
    const row = page.locator(`[data-testid="owner-listing"][data-listing-id="${listingId}"]`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-status", "approved");
    await row.getByTestId("btn-renew").click();

    await expect(page.getByTestId("checkout-form")).toBeVisible();
    await page.getByTestId("weeks-2").click(); // 2 × 500 = 1000 EGP
    await page.getByTestId("input-promo").fill(PROMO);
    await page.getByTestId("btn-apply-promo").click();
    await expect(page.getByTestId("promo-applied")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("checkout-subtotal")).toContainText("1,000");
    await expect(page.getByTestId("checkout-discount")).toContainText("100");
    await expect(page.getByTestId("checkout-total")).toContainText("900");
    await page.getByTestId("method-card").click();
    await page.getByTestId("btn-create-order").click();
    await expect(page.getByTestId("order-pending")).toBeVisible({ timeout: 30_000 });
  });

  await test.step("failed payment → failed screen → retry succeeds", async () => {
    await expect(page.getByTestId("mock-panel")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("btn-simulate-failure").click();
    await expect(page.getByTestId("payment-failed")).toBeVisible({ timeout: 40_000 });

    await page.getByTestId("btn-retry-payment").click();
    await expect(page.getByTestId("checkout-form")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("weeks-2").click();
    await page.getByTestId("input-promo").fill(PROMO);
    await page.getByTestId("btn-apply-promo").click();
    await expect(page.getByTestId("promo-applied")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("btn-create-order").click();
    await expect(page.getByTestId("order-pending")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mock-panel")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("btn-simulate-success").click();
    await expect(page.getByTestId("payment-success")).toBeVisible({ timeout: 40_000 });
  });

  await test.step("paid order stored with the promo discount (BR-3)", async () => {
    const orders = await (
      await request.get("/api/v1/me/orders?limit=50", { headers: { Authorization: `Bearer ${ownerToken}` } })
    ).json();
    const paid = orders.items.filter((o: { status: string }) => o.status === "paid");
    expect(paid.length).toBeGreaterThanOrEqual(1);
    const discounted = paid.find((o: { discount: number; total: number }) => o.discount > 0);
    expect(discounted, "a paid order with discount").toBeTruthy();
    expect(discounted.total).toBe(900);
    expect(discounted.weeks).toBe(2);
  });

  await test.step("bank transfer renewal: instructions, receipt upload, finance approval", async () => {
    await page.goto("/ar/owner");
    const row = page.locator(`[data-testid="owner-listing"][data-listing-id="${listingId}"]`);
    await expect(row).toHaveAttribute("data-status", "active", { timeout: 20_000 });
    await row.getByTestId("btn-renew").click();
    await expect(page.getByTestId("checkout-form")).toBeVisible();
    await page.getByTestId("weeks-1").click();
    await page.getByTestId("method-bank_transfer").click();
    await page.getByTestId("btn-create-order").click();

    await expect(page.getByTestId("bank-panel")).toBeVisible({ timeout: 30_000 });
    const ref = await page.getByTestId("bank-reference").innerText();
    expect(ref.trim().length).toBeGreaterThan(4);
    await page.getByTestId("input-receipt").setInputFiles("fixtures/apiB2.jpg");
    await expect(page.getByTestId("receipt-status")).toBeVisible({ timeout: 30_000 });

    // finance approves → order settles
    const orders = await (
      await request.get("/api/v1/me/orders?limit=50", { headers: { Authorization: `Bearer ${ownerToken}` } })
    ).json();
    const bankOrder = orders.items.find((o: { method: string; status: string }) => o.method === "bank_transfer" && o.status === "pending");
    expect(bankOrder).toBeTruthy();

    // admin session is per-origin: log in to the console UI first
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByTestId("input-password").fill(ADMIN.password);
    await page.getByTestId("input-totp").fill(totp(ADMIN.totpSecret));
    await page.getByTestId("btn-login").click();
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 20_000 });

    await page.goto(`${ADMIN_URL}/bank-transfers`);
    await expect(page.getByTestId("bank-page")).toBeVisible();
    const tRow = page.locator('[data-testid="transfer-row"]', { hasText: ref.trim() }).first();
    await expect(tRow).toBeVisible({ timeout: 20_000 });
    await tRow.getByTestId("btn-open-transfer").click();
    await page.getByTestId("btn-transfer-approve").click();
    await expect(page.getByTestId("transfer-row").filter({ hasText: ref.trim() })).toHaveCount(0, { timeout: 20_000 });

    const after = await (
      await request.get(`/api/v1/orders/${bankOrder.id}`, { headers: { Authorization: `Bearer ${ownerToken}` } })
    ).json();
    expect(after.status).toBe("paid");
  });

  await test.step("admin refunds the card payment (full, BR-8)", async () => {
    const paidOrder = (
      await (await request.get("/api/v1/me/orders?limit=50", { headers: { Authorization: `Bearer ${ownerToken}` } })).json()
    ).items.find((o: { method: string; status: string }) => o.method === "card" && o.status === "paid");
    expect(paidOrder).toBeTruthy();
    const orderPrefix = paidOrder.id.slice(0, 8);

    await page.goto(`${ADMIN_URL}/payments`);
    await expect(page.getByTestId("payments-page")).toBeVisible();
    await expect(page.getByTestId("revenue-total")).toBeVisible();
    const pRow = page.locator('[data-testid="payment-row"]', { hasText: orderPrefix }).first();
    await expect(pRow).toBeVisible({ timeout: 20_000 });
    await pRow.getByTestId("btn-refund").click();
    await page.getByTestId("btn-refund-confirm").click(); // empty amount = full refund
    await expect(
      page.locator('[data-testid="payment-row"]', { hasText: orderPrefix }).first(),
    ).toContainText("refunded", { timeout: 20_000 });

    const after = await (
      await request.get(`/api/v1/orders/${paidOrder.id}`, { headers: { Authorization: `Bearer ${ownerToken}` } })
    ).json();
    expect(after.status).toBe("refunded");
  });

});
