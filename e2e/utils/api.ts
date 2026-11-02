// Shared API helpers: fast setup for UI-focused specs (OTP login, admin 2FA,
// full "make an active listing" lifecycle straight through the public API).
import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";
import { totp } from "./totp";
import { settleMockPayment } from "./mockpay";

/** Unique per run — suffix titles/promos so specs stay independent. */
export const RUN = Date.now().toString(36).toUpperCase();

export const PHONES = {
  journeyOwner: "01005556677", // owner journey (UI wizard)
  lifecycleOwner: "01005556688", // reject → edit → resubmit spec
  paymentsOwner: "01005556699", // payments spec
  tenant1: "01009998877", // journey tenant
  tenant2: "01009998866", // favorites / report tenant
  banTarget: "01007776655", // admin ban/unban spec
  contractOwner: "01005556690", // contract & handover spec
  contractTenant: "01009998860",
} as const;

export const ADMIN = {
  email: "admin@aqar-rent.dev",
  password: "ChangeMeAdmin!2026",
  totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
} as const;

const FIX = (name: string) => path.join(__dirname, "..", "fixtures", name);

export async function otpLogin(request: APIRequestContext, phone: string): Promise<string> {
  const req = await request.post("/api/v1/auth/otp/request", { data: { phone } });
  expect(req.ok(), `otp request for ${phone}`).toBeTruthy();
  const { dev_code } = await req.json();
  expect(dev_code, "DEBUG=true must expose dev_code").toBeTruthy();
  const res = await request.post("/api/v1/auth/otp/verify", {
    data: { phone, code: dev_code, platform: "web" },
  });
  expect(res.ok(), `otp verify for ${phone} → ${await res.text()}`).toBeTruthy();
  return (await res.json()).tokens.access_token as string;
}

export async function adminLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/v1/admin/auth/login", {
    data: { email: ADMIN.email, password: ADMIN.password, totp_code: totp(ADMIN.totpSecret) },
  });
  expect(res.ok(), `admin login → ${await res.text()}`).toBeTruthy();
  return (await res.json()).access_token as string;
}

async function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

let adminTokenCache: string | null = null;

/** BR-6: a listing can only be approved once the owner's proof is approved. */
async function ensureVerificationApproved(request: APIRequestContext, phone: string): Promise<void> {
  if (!adminTokenCache) adminTokenCache = await adminLogin(request);
  const rows = (await (
    await request.get("/api/v1/admin/verifications?status=pending&limit=100", {
      headers: await auth(adminTokenCache),
    })
  ).json()) as { id: string; phone: string }[];
  const row = rows.find((r) => r.phone.includes(phone.replace(/^0/, "")) || r.phone.includes(phone));
  if (!row) return; // already approved earlier in this run
  const res = await request.post(`/api/v1/admin/verifications/${row.id}/decision`, {
    headers: await auth(adminTokenCache),
    data: { decision: "approve", reason: null },
  });
  expect(res.ok(), `verification approve → ${await res.text()}`).toBeTruthy();
}

export async function uploadVerification(
  request: APIRequestContext,
  token: string,
  photo: string,
  phone?: string,
): Promise<void> {
  const res = await request.post("/api/v1/me/verification", {
    headers: await auth(token),
    multipart: { doc_type: "electricity_bill", file: filePart(photo) },
  });
  expect(res.ok(), `verification upload → ${await res.text()}`).toBeTruthy();
  if (phone) await ensureVerificationApproved(request, phone);
}

function filePart(name: string) {
  const file = FIX(name);
  return { name: path.basename(file), mimeType: "image/jpeg", buffer: fs.readFileSync(file) };
}

export interface ListingSpec {
  title: string;
  rent?: number;
  bedrooms?: number;
  area?: number;
  /** fixture set prefix: "photo" | "apiA" | "apiB" | "apiC" (3 images each) */
  photoSet: string;
}

let locCache: { gov: string; city: string } | null = null;

async function locations(request: APIRequestContext) {
  if (locCache) return locCache;
  const govs = await (await request.get("/api/v1/locations?level=governorate")).json();
  const cities = await (await request.get(`/api/v1/locations?parent_id=${govs[0].id}`)).json();
  locCache = { gov: govs[0].id, city: cities[0].id };
  return locCache!;
}

/** Create + upload 3 photos + submit a listing (draft → submitted). */
export async function createSubmittedListing(
  request: APIRequestContext,
  token: string,
  spec: ListingSpec,
): Promise<string> {
  const loc = await locations(request);
  const create = await request.post("/api/v1/listings", {
    headers: await auth(token),
    data: {
      title: spec.title,
      property_type: "apartment",
      rental_type: "residential",
      furnished: "unfurnished",
      rent_monthly: spec.rent ?? 7000,
      deposit_months: 1,
      area_m2: spec.area ?? 90,
      bedrooms: spec.bedrooms ?? 3,
      bathrooms: 1,
      floor: 4,
      has_elevator: true,
      amenities: { air_conditioning: true, parking: true },
      description: "Listing created by the e2e API helper — full description for moderation.",
      governorate_id: loc.gov,
      city_id: loc.city,
      address_text: "شارع الاختبار، مدينة نصر، القاهرة",
      latitude: 30.09,
      longitude: 31.24,
      min_term_months: 1,
    },
  });
  expect(create.ok(), `create listing → ${await create.text()}`).toBeTruthy();
  const id = ((await create.json()) as { id: string }).id;

  for (let i = 1; i <= 3; i++) {
    const up = await request.post(`/api/v1/listings/${id}/media`, {
      headers: await auth(token),
      multipart: { file: filePart(`${spec.photoSet}${i}.jpg`), media_type: "photo" },
    });
    expect(up.ok(), `upload photo ${i} → ${await up.text()}`).toBeTruthy();
  }

  const submit = await request.post(`/api/v1/listings/${id}/submit`, { headers: await auth(token) });
  expect(submit.ok(), `submit → ${await submit.text()}`).toBeTruthy();
  return id;
}

export async function approveListing(request: APIRequestContext, adminToken: string, listingId: string): Promise<void> {
  const res = await request.post(`/api/v1/admin/listings/${listingId}/approve`, {
    headers: await auth(adminToken),
  });
  expect(res.ok(), `approve → ${await res.text()}`).toBeTruthy();
}

export async function rejectListing(
  request: APIRequestContext,
  adminToken: string,
  listingId: string,
  reasonCode = "other",
  note?: string,
): Promise<void> {
  const res = await request.post(`/api/v1/admin/listings/${listingId}/reject`, {
    headers: await auth(adminToken),
    data: { reason_code: reasonCode, note: note ?? null },
  });
  expect(res.ok(), `reject → ${await res.text()}`).toBeTruthy();
}

/** Create an order for an approved listing and settle it via the signed mock webhook. */
export async function payForListing(
  request: APIRequestContext,
  token: string,
  listingId: string,
  opts: { weeks?: number; method?: string; promo?: string; event?: "success" | "failure" } = {},
): Promise<{ orderId: string; status: string }> {
  const create = await request.post("/api/v1/orders", {
    headers: await auth(token),
    data: {
      listing_id: listingId,
      weeks: opts.weeks ?? 1,
      method: opts.method ?? "card",
      promo_code: opts.promo ?? null,
    },
  });
  expect(create.ok(), `create order → ${await create.text()}`).toBeTruthy();
  const order = (await create.json()) as { id: string; total: number };

  if ((opts.method ?? "card") !== "bank_transfer") {
    const checkout = await request.post(`/api/v1/orders/${order.id}/checkout`, {
      headers: await auth(token),
    });
    expect(checkout.ok(), `checkout → ${await checkout.text()}`).toBeTruthy();
    const { checkout_url } = (await checkout.json()) as { checkout_url: string };
    expect(checkout_url).toMatch(/^mock:\/\//);
    const orderRef = checkout_url.split("/").pop()!;
    const code = await settleMockPayment({
      orderRef,
      amountCents: Math.round(order.total * 100),
      event: opts.event ?? "success",
    });
    expect(code, "webhook accepted").toBe(200);
  }

  const after = await request.get(`/api/v1/orders/${order.id}`, { headers: await auth(token) });
  const status = ((await after.json()) as { status: string }).status;
  return { orderId: order.id, status };
}

/**
 * Full happy path used by public/tenant/payment specs:
 * verification → submitted → approved → paid → **active**.
 */
export async function makeActiveListing(
  request: APIRequestContext,
  ownerPhone: string,
  photoSet: string,
  title: string,
  rent?: number,
): Promise<string> {
  const owner = await otpLogin(request, ownerPhone);
  await uploadVerification(request, owner, `${photoSet}1.jpg`, ownerPhone);
  const id = await createSubmittedListing(request, owner, { title, photoSet, rent });
  const admin = await adminLogin(request);
  await approveListing(request, admin, id);
  const { status } = await payForListing(request, owner, id);
  expect(status, "order must be paid").toBe("paid");
  return id;
}
