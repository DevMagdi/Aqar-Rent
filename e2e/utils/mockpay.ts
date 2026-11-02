// MockProvider webhook helper: signs the raw body with WEBHOOK_SECRET and
// POSTs to the backend — mirrors what tests POST (see payments/mock.py).
import { createHmac } from "node:crypto";

export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "e2e-webhook-secret-change-me";
const BACKEND = process.env.BACKEND_URL || "http://localhost:8010";

export async function settleMockPayment(opts: {
  orderRef: string;
  amountCents: number;
  event?: "success" | "failure";
}): Promise<number> {
  const payload = JSON.stringify({
    provider: "mock",
    event: opts.event ?? "success",
    txn_id: `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    order_ref: opts.orderRef,
    amount_cents: opts.amountCents,
  });
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
  const res = await fetch(`${BACKEND}/api/v1/payments/webhook?sig=${sig}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  return res.status;
}
