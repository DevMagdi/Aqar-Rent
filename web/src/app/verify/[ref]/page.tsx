import type { Metadata } from "next";
import { fetchServer } from "@/lib/server";
import { TOKENS } from "@/styles/tokenValues";

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
      <body style={{ fontFamily: '"IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, sans-serif', background: TOKENS.bg, margin: 0, color: TOKENS.brand }}>
        <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px", color: TOKENS.brand }}>
          <div style={{ background: TOKENS.surface, borderRadius: 18, border: `1px solid rgba(22,39,59,0.10)`, padding: 28, boxShadow: "0 1px 2px rgba(14,23,40,0.06)" }}>
            <p style={{ color: TOKENS.goldDark, fontWeight: 700, margin: 0 }}>عقار رينت · Aqar Rent</p>
            <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>التحقق من العقد / Contract verification</h1>
            <p style={{ color: TOKENS.muted, fontSize: 13, margin: 0 }} dir="ltr">
              /verify/{ref}
            </p>

            {backendDown ? (
              <p role="alert" style={{ marginTop: 20, color: TOKENS.danger }}>
                تعذّر الاتصال بالخادم / Service unavailable
              </p>
            ) : data?.valid ? (
              <div data-testid="verify-valid" style={{ marginTop: 20 }}>
                <p style={{ fontSize: 30, margin: 0 }}>✅</p>
                <p style={{ fontWeight: 700, color: TOKENS.success, fontSize: 18, margin: "6px 0" }}>عقد صحيح ومؤكد · Valid confirmed contract</p>
                <dl style={{ fontSize: 14, color: TOKENS.brand, lineHeight: 2 }}>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline", color: TOKENS.brandDeep }}>المرجع / Ref: </dt>
                    <dd style={{ display: "inline", margin: 0 }} dir="ltr">
                      {data.reference_no}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline", color: TOKENS.brandDeep }}>تاريخ الإنشاء / Created: </dt>
                    <dd style={{ display: "inline", margin: 0 }}>{data.created_at?.slice(0, 10)}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline", color: TOKENS.brandDeep }}>الأطراف / Parties: </dt>
                    <dd style={{ display: "inline", margin: 0 }}>{data.parties_masked.join(" · ")}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div data-testid="verify-invalid" style={{ marginTop: 20 }}>
                <p style={{ fontSize: 30, margin: 0 }}>⛔</p>
                <p style={{ fontWeight: 700, color: TOKENS.danger, fontSize: 18, margin: "6px 0" }}>غير موجود أو غير مؤكد بعد · Not found or not confirmed</p>
              </div>
            )}

            <p style={{ marginTop: 24, fontSize: 12, color: TOKENS.muted, borderTop: "1px solid rgba(22,39,59,0.10)", paddingTop: 12 }}>
              هذا «اتفاق خاص» بين الطرفين؛ ليس عقداً موثّقاً ولا مسجّلاً رسمياً، وليس سنداً تنفيذياً، ولا يُغني عن التسجيل أو التوثيق الرسمي. التحقق يفيد بسلامة السجل فقط. / This is a PRIVATE AGREEMENT: not notarized, not officially registered, not an executive instrument, and no substitute for official registration or notarization. Verification only proves record integrity.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
