// Dev-only: sign & forward a MockProvider payment webhook to the backend.
// Enabled when NEXT_PUBLIC_MOCK_PAY=true (dev/demo environments only).
import { createHmac } from "node:crypto";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_MOCK_PAY !== "true") {
    return Response.json({ message: "Simulation disabled" }, { status: 403 });
  }
  const secret = process.env.WEBHOOK_SECRET || process.env.SECRET_KEY;
  if (!secret) {
    return Response.json({ message: "WEBHOOK_SECRET not configured" }, { status: 500 });
  }
  let body: { order_ref?: string; amount_cents?: number; event?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const order_ref = String(body.order_ref || "").trim();
  if (!order_ref) return Response.json({ message: "order_ref required" }, { status: 400 });

  const event = body.event === "failure" ? "failure" : "success";
  const payload = JSON.stringify({
    provider: "mock",
    event,
    txn_id: `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    order_ref,
    amount_cents: Math.round(Number(body.amount_cents || 0)),
  });
  const sig = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    const res = await fetch(`${BACKEND}/api/v1/payments/webhook?sig=${sig}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    const text = await res.text();
    return new Response(text || "{}", {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return Response.json({ message: `Backend unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
