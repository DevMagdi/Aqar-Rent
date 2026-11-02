import type { Metadata } from "next";
import { fetchServer } from "@/lib/server";

// Public contract verification page — /verify/{reference_no} (spec path).
// Shows ONLY validity, creation date and masked party names.

interface VerifyResult {
  valid: boolean;
  reference_no: string | null;
  created_at: string | null;
  parties_masked: string[];
  status: string | null;
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }): Promise<Metadata> {
  const { ref } = await params;
  return {
    title: `Verify ${ref}`,
    robots: { index: false },
    alternates: { canonical: `/verify/${ref}` },
  };
}

export default async function VerifyPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  let data: VerifyResult | null = null;
  let backendDown = false;
  try {
    data = await fetchServer<VerifyResult>(`/verify/${encodeURIComponent(ref)}`);
  } catch {
    backendDown = true;
  }
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "Segoe UI, Tahoma, sans-serif", background: "#fafaf9", margin: 0 }}>
        <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px" }}>
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e7e5e4", padding: 28 }}>
            <p style={{ color: "#a93408", fontWeight: 700, margin: 0 }}>عقار ربنا · Aqar Rent</p>
            <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>التحقق من العقد / Contract verification</h1>
            <p style={{ color: "#78716c", fontSize: 13, margin: 0 }} dir="ltr">
              /verify/{ref}
            </p>

            {backendDown ? (
              <p role="alert" style={{ marginTop: 20, color: "#b91c1c" }}>
                تعذّر الاتصال بالخادم / Service unavailable
              </p>
            ) : data?.valid ? (
              <div data-testid="verify-valid" style={{ marginTop: 20 }}>
                <p style={{ fontSize: 30, margin: 0 }}>✅</p>
                <p style={{ fontWeight: 700, color: "#047857", fontSize: 18, margin: "6px 0" }}>عقد صحيح ومؤكد · Valid confirmed contract</p>
                <dl style={{ fontSize: 14, color: "#44403c", lineHeight: 2 }}>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline" }}>المرجع / Ref: </dt>
                    <dd style={{ display: "inline", margin: 0 }} dir="ltr">
                      {data.reference_no}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline" }}>تاريخ الإنشاء / Created: </dt>
                    <dd style={{ display: "inline", margin: 0 }}>{data.created_at?.slice(0, 10)}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline" }}>الأطراف / Parties: </dt>
                    <dd style={{ display: "inline", margin: 0 }}>{data.parties_masked.join(" · ")}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div data-testid="verify-invalid" style={{ marginTop: 20 }}>
                <p style={{ fontSize: 30, margin: 0 }}>⛔</p>
                <p style={{ fontWeight: 700, color: "#b91c1c", fontSize: 18, margin: "6px 0" }}>غير موجود أو غير مؤكد بعد · Not found or not confirmed</p>
              </div>
            )}

            <p style={{ marginTop: 24, fontSize: 12, color: "#a8a29e", borderTop: "1px solid #f5f5f4", paddingTop: 12 }}>
              هذا اتفاق خاص ولا يحل محل التسجيل الرسمي أو التوثيق. / This is a private agreement template and does not replace official registration or notarization.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
