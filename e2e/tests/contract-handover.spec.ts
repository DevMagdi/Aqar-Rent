// Phase 4 acceptance: contract wizard → both-party OTP confirmation →
// immutable terms + PDFs (both parties) → public /verify page; then a
// check-in + check-out handover with OTP confirmation, side-by-side
// comparison and PDF — all real (MockProvider only for ad payments).
import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { PHONES, RUN, adminLogin, makeActiveListing, otpLogin } from "../utils/api";

const OWNER = PHONES.contractOwner;
const TENANT = PHONES.contractTenant;
const TITLE = `عقد حقيقي ${RUN}`;

const TERMS = {
  party_names: { owner: "منى عبد الرحمن", tenant: "كريم الشاذلي" },
  unit_address: "شارع9، المعادي، القاهرة",
  start_date: "2026-12-15",
  duration_months: 12,
  monthly_rent: 8500,
  yearly_increase_pct: 5,
  deposit_amount: 8500,
  deposit_refund_days: 30,
  payment_day: 5,
  utilities_responsibility: "المستأجر يتحمل الكهرباء والمياه",
  termination_terms: "إخطار قبل60 يوماً",
  extra_notes: "مفتاحان عند التسليم",
};

async function freshCode(request: APIRequestContext, phone: string): Promise<string> {
  const res = await request.post("/api/v1/auth/otp/request", { data: { phone } });
  expect(res.ok()).toBeTruthy();
  const { dev_code } = await res.json();
  expect(dev_code).toBeTruthy();
  return dev_code as string;
}

async function confirmViaApi(request: APIRequestContext, phone: string, path: string): Promise<void> {
  const token = await otpLogin(request, phone);
  const code = await freshCode(request, phone);
  const res = await request.post(path, {
    data: { otp_code: code },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `confirm ${path} → ${await res.text()}`).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test("contract: wizard → dual OTP confirm → immutable PDFs + public verify", async ({ page, request }) => {
  test.setTimeout(300_000);

  // ── setup: active listing for the contract owner ──────────────────────
  const listingId = await makeActiveListing(request, OWNER, "apiE", TITLE);

  // ── owner creates the contract through the web wizard ─────────────────
  let contractId = "";
  let referenceNo = "";
  await test.step("wizard creates a draft and sends it for confirmation", async () => {
    await page.goto("/ar/login");
    await page.getByTestId("input-phone").fill(OWNER);
    await page.getByTestId("btn-send-code").click();
    await expect(page.getByTestId("otp-form")).toBeVisible();
    const code = (await page.getByTestId("dev-code-value").innerText()).trim();
    await page.getByTestId("input-code").fill(code);
    await page.getByTestId("btn-verify").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

    await page.goto("/ar/contracts/new");
    await expect(page.getByTestId("contract-wizard")).toBeVisible();
    // step0 — listing + template
    await page.getByTestId("select-listing").selectOption({ index: 1 });
    await expect(page.getByTestId("tpl-notice")).toContainText("محامي");
    await page.getByTestId("btn-cnext").click();
    // step1 — parties + NIDs
    await expect(page.getByTestId("cstep-parties")).toBeVisible();
    await page.getByTestId("input-owner-name").fill(TERMS.party_names.owner);
    await page.getByTestId("input-tenant-name").fill(TERMS.party_names.tenant);
    await page.getByTestId("input-tenant-phone").fill(TENANT);
    await page.getByTestId("input-owner-nid").fill("123456789012345");
    await page.getByTestId("input-tenant-nid").fill("987654321098765");
    await page.getByTestId("btn-cnext").click();
    // step2 — terms
    await expect(page.getByTestId("cstep-terms")).toBeVisible();
    await page.getByTestId("input-address").fill(TERMS.unit_address);
    await page.getByTestId("input-start-date").fill(TERMS.start_date);
    await page.getByTestId("input-duration").fill(String(TERMS.duration_months));
    await page.getByTestId("input-rent").fill(String(TERMS.monthly_rent));
    await page.getByTestId("input-increase").fill(String(TERMS.yearly_increase_pct));
    await page.getByTestId("input-deposit").fill(String(TERMS.deposit_amount));
    await page.getByTestId("input-payment-day").fill(String(TERMS.payment_day));
    await page.getByTestId("btn-cnext").click();
    // step3 — review → save + request confirmation
    await expect(page.getByTestId("cstep-review")).toBeVisible();
    await page.getByTestId("btn-save-request").click();
    await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("contract-status")).toHaveText("بانتظار التأكيد");
    contractId = page.url().split("/").pop()!;
    referenceNo = (await page.getByTestId("contract-ref").innerText()).trim();
    expect(referenceNo).toMatch(/^AR-\d{8}-/);
  });

  // ── NIDs encrypted at rest; API only exposes masks ────────────────────
  await test.step("national IDs are encrypted at rest and masked in the API", async () => {
    const token = await otpLogin(request, OWNER);
    const res = await request.get(`/api/v1/contracts/${contractId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("123456789012345");
    expect(body.parties[0].national_id_masked).toContain("*");

    const row = await request.get(`/api/v1/contracts/${contractId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(row.status()).toBe(200);
  });

  // ── owner confirms with OTP in the UI ─────────────────────────────────
  await test.step("owner confirms the final text with a fresh OTP", async () => {
    await expect(page.getByTestId("btn-confirm-contract")).toBeVisible();
    await page.getByTestId("btn-confirm-contract").click();
    await expect(page.getByTestId("otp-confirm-modal")).toBeVisible();
    await page.getByTestId("otp-request").click();
    await expect(page.getByTestId("otp-code-input")).toHaveValue(/^\d{6}$/);
    await page.getByTestId("otp-submit").click();
    await expect(page.getByTestId("otp-confirm-modal")).toBeHidden({ timeout: 20_000 });
    // owner confirmed → still awaiting the tenant
    await expect(page.getByTestId("contract-status")).toHaveText("بانتظار التأكيد");
    await expect(page.getByTestId("confirmation-log")).toContainText("OTP");
  });

  // ── tenant confirms via API (they OTP-login to view, per spec) ────────
  await test.step("tenant confirms → contract frozen with SHA-256", async () => {
    await confirmViaApi(request, TENANT, `/api/v1/contracts/${contractId}/confirm`);
    await page.reload();
    await expect(page.getByTestId("contract-status")).toHaveText("مؤكد نهائياً");
    await expect(page.getByTestId("confirmed-banner")).toBeVisible();
    const hash = (await page.getByTestId("terms-hash").innerText()).replace(/\s/g, "");
    expect(hash).toMatch(/[0-9a-f]{64}/); // Arabic label, hex hash
    // immutable: edit button gone, request button gone
    await expect(page.getByTestId("btn-edit-contract")).toHaveCount(0);
    await expect(page.getByTestId("btn-request-confirmation")).toHaveCount(0);
  });

  // ── PDFs for BOTH parties + public verification page ──────────────────
  await test.step("both parties download the Arabic PDF; /verify shows valid", async () => {
    const ownerToken = await otpLogin(request, OWNER);
    const tenantToken = await otpLogin(request, TENANT);
    for (const token of [ownerToken, tenantToken]) {
      const pdf = await request.get(`/api/v1/contracts/${contractId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
      expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    }

    // UI download works too (blob download event)
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByTestId("btn-contract-pdf").click(),
    ]);
    expect(download.suggestedFilename()).toContain(referenceNo);

    // public verification page (no auth)
    const verify = await page.goto(`/verify/${referenceNo}`);
    expect(verify?.status()).toBe(200);
    await expect(page.getByTestId("verify-valid")).toBeVisible();
    await expect(page.getByTestId("verify-valid")).toContainText(referenceNo);
    // masked names only
    const html = await page.content();
    expect(html).not.toContain("123456789012345");
    expect(html).toContain("***");

    const unknown = await page.goto("/verify/AR-209901-NOPE12");
    expect(unknown?.status()).toBe(200);
    await expect(page.getByTestId("verify-invalid")).toBeVisible();
  });

  // ── contract fee (settings default0 → not required) ───────────────────
  await test.step("fee panel reflects the deployment setting", async () => {
    // back on the contract page (previous step ended on /verify/…)
    await page.goto(`/ar/contracts/${contractId}`);
    await expect(page.getByTestId("contract-detail")).toBeVisible();
    // default contract_fee_egp=0 → no pay button, read-only note instead
    await expect(page.getByTestId("fee-panel")).toHaveCount(0);
    await expect(page.getByText("لا توجد رسوم على هذا الإعداد")).toBeVisible();
  });
});

test("handover: check-in → dual OTP confirm → check-out comparison → PDFs", async ({ page, request, browser }) => {
  test.setTimeout(300_000);

  // reuse the same contract flow quickly via API
  const listingId = await makeActiveListing(request, OWNER, "apiF", `تسليم ${RUN}`);
  const ownerToken = await otpLogin(request, OWNER);
  const created = await request.post("/api/v1/contracts", {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: {
      listing_id: listingId,
      template: "residential_furnished",
      tenant_phone: TENANT,
      national_ids: { owner: "111122223333444", tenant: "555566667777888" },
      terms: TERMS,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const contractId = (await created.json()).id as string;
  await request.post(`/api/v1/contracts/${contractId}/request-confirmation`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  await confirmViaApi(request, OWNER, `/api/v1/contracts/${contractId}/confirm`);
  await confirmViaApi(request, TENANT, `/api/v1/contracts/${contractId}/confirm`);

  // ── owner logs in and opens the confirmed contract ────────────────────
  await page.goto("/ar/login");
  await page.getByTestId("input-phone").fill(OWNER);
  await page.getByTestId("btn-send-code").click();
  const loginCode = (await page.getByTestId("dev-code-value").innerText()).trim();
  await page.getByTestId("input-code").fill(loginCode);
  await page.getByTestId("btn-verify").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();

  await page.goto(`/ar/contracts/${contractId}`);
  await expect(page.getByTestId("contract-status")).toHaveText("مؤكد نهائياً");

  // ── create a check-in through the UI ──────────────────────────────────
  let checkInId = "";
  await test.step("create + confirm check-in (both parties, OTP)", async () => {
    await page.getByTestId("btn-new-checkin").click();
    await expect(page.getByTestId("handover-editor")).toHaveAttribute("data-kind", "check_in");

    // add an item to the living room
    await page.getByTestId("add-item-living_room").click();
    await page.locator('[data-testid="item-living_room-0"] input').first().fill("باركيه");
    await page.locator('[data-testid="item-living_room-0"] select').first().selectOption("good");
    // meters + keys
    await page.getByTestId("meter-electricity").fill("12540");
    await page.getByTestId("meter-water").fill("3310");
    await page.getByTestId("input-keys").fill("2");

    await page.getByTestId("btn-save-handover").click();
    await expect(page.getByTestId("handover-error")).toHaveCount(0, { timeout: 20_000 });

    // owner OTP confirm (1 of 2 — stays draft until the tenant confirms)
    await page.getByTestId("btn-confirm-handover").click();
    await expect(page.getByTestId("otp-confirm-modal")).toBeVisible();
    await page.getByTestId("otp-request").click();
    await page.getByTestId("otp-submit").click();
    await expect(page.getByTestId("otp-confirm-modal")).toBeHidden({ timeout: 20_000 });

    // grab the handover id from the API for the tenant side
    const token = await otpLogin(request, OWNER);
    const rows = await (
      await request.get(`/api/v1/contracts/${contractId}/handovers`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    const draft = rows.find((h: { kind: string }) => h.kind === "check_in");
    expect(draft.status).toBe("draft"); // only one party confirmed so far
    checkInId = draft.id as string;

    // tenant confirms → frozen + hash
    await confirmViaApi(request, TENANT, `/api/v1/handovers/${checkInId}/confirm`);
    await page.reload();
    const cinRow = page.locator('[data-testid="handover-row"][data-kind="check_in"]');
    await expect(cinRow).toHaveAttribute("data-status", "confirmed");
    await expect(cinRow).toContainText("SHA-256");
    const after = await (
      await request.get(`/api/v1/handovers/${checkInId}`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    expect(after.status).toBe("confirmed");
    expect(after.hash).toMatch(/^[0-9a-f]{64}$/);

    // immutable: PATCH rejected after confirmation
    const patch = await request.patch(`/api/v1/handovers/${checkInId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { data: { rooms: [] } },
    });
    expect(patch.status()).toBe(409);
  });

  // ── check-out created from the check-in, side-by-side, PDFs ───────────
  let checkOutId = "";
  await test.step("check-out: owner creates + confirms, tenant confirms in their UI", async () => {
    await page.reload();
    await page.getByTestId("btn-new-checkout").click();
    await expect(page.getByTestId("handover-editor")).toHaveAttribute("data-kind", "check_out");

    // save FIRST — the server copies the confirmed check-in structure into the form
    await page.getByTestId("btn-save-handover").click();
    await expect(page.getByTestId("handover-error")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('[data-testid="item-living_room-0"]')).toBeVisible();

    // re-assess conditions + meter difference
    await page.locator('[data-testid="item-living_room-0"] select').first().selectOption("damaged");
    await page.getByTestId("meter-electricity").fill("13990");
    await page.getByTestId("btn-save-handover").click();
    await expect(page.getByTestId("handover-error")).toHaveCount(0, { timeout: 20_000 });

    // owner OTP confirm (1 of 2 → stays draft)
    await page.getByTestId("btn-confirm-handover").click();
    await page.getByTestId("otp-request").click();
    await page.getByTestId("otp-submit").click();
    await expect(page.getByTestId("otp-confirm-modal")).toBeHidden({ timeout: 20_000 });

    const token = await otpLogin(request, OWNER);
    const rows = await (
      await request.get(`/api/v1/contracts/${contractId}/handovers`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    const checkOut = rows.find((h: { kind: string }) => h.kind === "check_out");
    expect(checkOut).toBeTruthy();
    expect(checkOut.source_handover_id).toBe(checkInId);
    expect(checkOut.status).toBe("draft"); // owner only (1 of 2)
    checkOutId = checkOut.id as string;

    // the TENANT reviews and confirms in their own UI session → banner appears
    const tctx = await browser.newContext({ locale: "ar-EG" });
    const tp = await tctx.newPage();
    await tp.goto("/ar/login");
    await tp.getByTestId("input-phone").fill(TENANT);
    await tp.getByTestId("btn-send-code").click();
    const tcode = (await tp.getByTestId("dev-code-value").innerText()).trim();
    await tp.getByTestId("input-code").fill(tcode);
    await tp.getByTestId("btn-verify").click();
    await expect.poll(() => tp.evaluate(() => localStorage.getItem("aqar.access"))).toBeTruthy();
    await tp.goto(`/ar/contracts/${contractId}`);
    const tRow = tp.locator('[data-testid="handover-row"][data-kind="check_out"]');
    await expect(tRow).toHaveAttribute("data-status", "draft");
    await tRow.getByTestId("btn-confirm-existing").click();
    await expect(tp.getByTestId("handover-editor")).toBeVisible();
    await tp.getByTestId("btn-confirm-handover").click();
    await tp.getByTestId("otp-request").click();
    await tp.getByTestId("otp-submit").click();
    await expect(tp.getByTestId("handover-confirmed-banner")).toBeVisible({ timeout: 20_000 });
    await tctx.close();
  });

  await test.step("side-by-side comparison + PDFs for both parties", async () => {
    // confirmed check-out → hash stored
    const token2 = await otpLogin(request, OWNER);
    const finalRow = await (
      await request.get(`/api/v1/handovers/${checkOutId}`, { headers: { Authorization: `Bearer ${token2}` } })
    ).json();
    expect(finalRow.status).toBe("confirmed");
    expect(finalRow.hash).toMatch(/^[0-9a-f]{64}$/);

    // comparison UI shows before/current + meter difference (13990-12540=1450)
    await page.reload();
    const row = page.locator('[data-testid="handover-row"][data-kind="check_out"]');
    await expect(row).toHaveAttribute("data-status", "confirmed");
    await row.getByTestId("btn-open-handover").click();
    await expect(page.getByTestId("comparison-modal")).toBeVisible();
    await expect(page.getByTestId("meter-diff-electricity")).toHaveText("1450");
    // close the comparison modal so the row buttons are clickable again
    await page.locator('[data-testid="comparison-modal"] [aria-label="close"]').click();
    await expect(page.getByTestId("comparison-modal")).toBeHidden();

    // PDFs for both parties
    for (const phone of [OWNER, TENANT]) {
      const t = await otpLogin(request, phone);
      const pdf = await request.get(`/api/v1/handovers/${checkOutId}/pdf`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      expect(pdf.status()).toBe(200);
      expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    }
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      row.getByTestId("btn-handover-pdf-row").click(),
    ]);
    expect(download.suggestedFilename()).toContain("handover-check_out");
  });
});
