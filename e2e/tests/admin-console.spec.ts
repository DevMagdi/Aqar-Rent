// Admin console: 2FA login (failure + success), dashboard, role menu, ban/unban
// with backend enforcement, audit trail, read-only settings/staff pages.
import { expect, test } from "@playwright/test";
import { totp } from "../utils/totp";
import { ADMIN, PHONES, otpLogin } from "../utils/api";

const ADMIN_URL = "http://localhost:5180";

test.describe.configure({ mode: "serial" });

test("admin console: 2FA, dashboard, user ban/unban, audit, presets", async ({ page, request }) => {
  test.setTimeout(240_000);

  // make sure the target user exists (fresh DB per run)
  await otpLogin(request, PHONES.banTarget);

  await test.step("login rejects bad credentials and bad 2FA codes", async () => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByTestId("input-password").fill("definitely-wrong-password");
    await page.getByTestId("input-totp").fill("000000");
    await page.getByTestId("btn-login").click();
    await expect(page.getByTestId("login-error")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/login/);

    await page.getByTestId("input-password").fill(ADMIN.password);
    // valid password + stale/incorrect code still fails
    await page.getByTestId("input-totp").fill("111111");
    await page.getByTestId("btn-login").click();
    await expect(page.getByTestId("login-error")).toBeVisible();
  });

  await test.step("correct TOTP opens the dashboard with KPIs and charts", async () => {
    await page.getByTestId("input-password").fill(ADMIN.password);
    await page.getByTestId("input-totp").fill(totp(ADMIN.totpSecret));
    await page.getByTestId("btn-login").click();
    await expect(page).toHaveURL(`${ADMIN_URL}/`);
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("kpi").first()).toBeVisible();
    await expect(page.getByTestId("chart-listings")).toBeVisible();
    await expect(page.getByTestId("admin-role")).toHaveText("super_admin");
    // super admin sees the full role-gated menu
    for (const nav of ["moderation", "verifications", "reports", "users", "payments", "bank-transfers", "plans", "staff", "audit", "settings"]) {
      await expect(page.getByTestId(`nav-${nav}`)).toBeVisible();
    }
  });

  await test.step("ban a user → backend rejects login; unban restores it", async () => {
    await page.getByTestId("nav-users").click();
    await expect(page.getByTestId("users-page")).toBeVisible();
    await page.getByTestId("users-search").fill(PHONES.banTarget);
    const row = page.locator('[data-testid="user-row"]', { hasText: PHONES.banTarget }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByTestId("btn-user-actions").click();
    await page.getByTestId("btn-ban-user").click();
    await expect(page.getByTestId("user-actions")).toBeHidden({ timeout: 20_000 });

    // banned users cannot complete login (request may still mint a code)
    const blocked = await request.post("/api/v1/auth/otp/request", { data: { phone: PHONES.banTarget } });
    if (blocked.ok()) {
      const { dev_code } = await blocked.json();
      const verify = await request.post("/api/v1/auth/otp/verify", {
        data: { phone: PHONES.banTarget, code: dev_code, platform: "web" },
      });
      expect(verify.status(), "banned verify must fail").toBeGreaterThanOrEqual(400);
      expect((await verify.json()).code).toBe("ACCOUNT_BANNED");
    } else {
      expect(blocked.status()).toBeGreaterThanOrEqual(400);
    }

    // unban from the same panel
    const row2 = page.locator('[data-testid="user-row"]', { hasText: PHONES.banTarget }).first();
    await row2.getByTestId("btn-user-actions").click();
    await page.getByTestId("btn-unban-user").click();
    await expect(page.getByTestId("user-actions")).toBeHidden({ timeout: 20_000 });

    // login works again after unban
    await otpLogin(request, PHONES.banTarget);
  });

  await test.step("audit log records the staff actions", async () => {
    await page.getByTestId("nav-audit").click();
    await expect(page.getByTestId("audit-page")).toBeVisible();
    await expect(page.getByTestId("audit-row").first()).toBeVisible({ timeout: 20_000 });
    // expand the newest entry → before/after diff appears
    await page.getByTestId("audit-row").first().click();
    await expect(page.getByText("before", { exact: true }).first()).toBeVisible();
  });

  await test.step("settings and staff pages render read-only presets", async () => {
    await page.getByTestId("nav-settings").click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByText("fake_photos")).toBeVisible();

    await page.getByTestId("nav-staff").click();
    await expect(page.getByTestId("staff-page")).toBeVisible();
    await expect(page.getByText("Approve / reject listings")).toBeVisible();
    await expect(page.getByText("Audit log viewer")).toBeVisible();
  });
});
