// Tenant search UX: OTP login extras (resend timer, back), filter results,
// sort ordering, no-results + clear, and the shared map (price pin).
import { expect, test } from "@playwright/test";
import { PHONES, RUN, makeActiveListing } from "../utils/api";

test.describe.configure({ mode: "serial" });

test("tenant: login extras, filters, sort, empty state, map pin", async ({ page, request }) => {
  test.setTimeout(300_000);

  // one cheap active listing of our own (rent 3500 → cheapest for price_asc)
  const cheapId = await makeActiveListing(request, PHONES.journeyOwner, "apiD", `إيجار منخفض ${RUN}`, 3500);

  await test.step("OTP login UI: resend timer + back navigation", async () => {
    await page.goto("/ar/login");
    await page.getByTestId("input-phone").fill(PHONES.tenant2);
    await page.getByTestId("btn-send-code").click();
    await expect(page.getByTestId("otp-form")).toBeVisible();
    // resend starts disabled with a countdown
    await expect(page.getByTestId("btn-resend")).toBeDisabled();
    await expect(page.getByTestId("btn-resend")).toContainText(/الإرسال بعد|Resend in|بعد/);
    await page.getByTestId("btn-back-phone").click();
    await expect(page.getByTestId("login-form")).toBeVisible();

    // complete login
    await page.getByTestId("input-phone").fill(PHONES.tenant2);
    await page.getByTestId("btn-send-code").click();
    const code = (await page.getByTestId("dev-code-value").innerText()).trim();
    expect(code).toMatch(/^\d{6}$/);
    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("btn-verify").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();
    await expect(page.getByTestId("logout")).toBeVisible();
  });

  await test.step("filters narrow the results and clear restores them", async () => {
    await page.goto("/ar/search");
    await expect(page.getByTestId("results-count")).toBeVisible();

    // impossible filter → empty state with clear button
    await page.getByTestId("filter-min-price").fill("999999");
    await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("clear-filters")).toBeVisible();

    await page.getByTestId("clear-filters").click();
    await expect(page.getByTestId("empty-state")).toHaveCount(0, { timeout: 20_000 });

    // a real filter matches our cheap listing
    await page.getByTestId("filter-max-price").fill("5000");
    const card = page.locator(`[data-listing-id="${cheapId}"]`).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("results-count")).not.toContainText("0 ");
  });

  await test.step("sort by price ascending puts the cheapest first", async () => {
    await page.goto("/ar/search?sort=price_asc");
    await expect(page.getByTestId("filter-sort")).toHaveValue("price_asc");
    const firstCard = page.locator("[data-testid='listing-card']").first();
    await expect(firstCard).toHaveAttribute("data-listing-id", cheapId, { timeout: 20_000 });
  });

  await test.step("map shares the filtered results (price pin for our listing)", async () => {
    await page.goto(`/ar/search?max_price=5000`);
    await expect(
      page.locator(`[data-testid="price-pin"][data-listing-id="${cheapId}"]`),
    ).toBeAttached({ timeout: 40_000 });
    await expect(page.getByTestId("maplibre")).toBeVisible();
  });

  await test.step("detail contact works for the logged-in tenant", async () => {
    await page.goto(`/ar/search?q=${encodeURIComponent(`إيجار منخفض ${RUN}`)}`);
    const card = page.locator(`[data-listing-id="${cheapId}"]`).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.locator("a").click();
    await expect(page.getByTestId("listing-detail")).toBeVisible();
    await page.getByTestId("btn-call").click();
    await expect(page.getByTestId("contact-revealed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("owner-phone")).toContainText(PHONES.journeyOwner);
  });
});
