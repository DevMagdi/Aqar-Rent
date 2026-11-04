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
      <body style={{ fontFamily: "var(--font-sans)", background: "var(--color-bg)", margin: 0, color: "var(--color-ink)" }}>
        <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px", color: "var(--color-ink)" }}>
          <div style={{ background: "var(--color-surface)", borderRadius: "var(--radius-card)", border: "1px solid var(--color-border)", padding: 28, boxShadow: "var(--shadow-card)" }}>
            <p style={{ color: "var(--color-gold-dark)", fontWeight: 700, margin: 0 }}>عقار رينت · Aqar Rent</p>
            <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>التحقق من العقد / Contract verification</h1>
            <p style={{ color: "var(--color-muted)", fontSize: 13, margin: 0 }} dir="ltr">
              /verify/{ref}
            </p>

            {backendDown ? (
              <p role="alert" style={{ marginTop: 20, color: "var(--color-danger)" }}>
                تعذّر الاتصال بالخادم / Service unavailable
              </p>
            ) : data?.valid ? (
              <div data-testid="verify-valid" style={{ marginTop: 20 }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-verified)" strokeWidth="1.6" aria-hidden style={{ margin: "0 auto" }}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p style={{ fontWeight: 700, color: "var(--color-success)", fontSize: 18, margin: "6px 0" }}>عقد صحيح ومؤكد · Valid confirmed contract</p>
                <dl style={{ fontSize: 14, color: "var(--color-ink)", lineHeight: 2 }}>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline", color: "var(--color-ink-strong)" }}>المرجع / Ref: </dt>
                    <dd style={{ display: "inline", margin: 0 }} dir="ltr">
                      {data.reference_no}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline", color: "var(--color-ink-strong)" }}>تاريخ الإنشاء / Created: </dt>
                    <dd style={{ display: "inline", margin: 0 }}>{data.created_at?.slice(0, 10)}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, display: "inline", color: "var(--color-ink-strong)" }}>الأطراف / Parties: </dt>
                    <dd style={{ display: "inline", margin: 0 }}>{data.parties_masked.join(" · ")}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div data-testid="verify-invalid" style={{ marginTop: 20 }}>
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M7.5 7.5l9 9" />
                </svg>
                <p style={{ fontWeight: 700, color: "var(--color-danger)", fontSize: 18, margin: "6px 0" }}>غير موجود أو غير مؤكد بعد · Not found or not confirmed</p>
              </div>
            )}

            <p style={{ marginTop: 24, fontSize: 12, color: "var(--color-muted)", borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
              هذا «اتفاق خاص» بين الطرفين؛ ليس عقداً موثّقاً ولا مسجّلاً رسمياً، وليس سنداً تنفيذياً، ولا يُغني عن التسجيل أو التوثيق الرسمي. التحقق يفيد بسلامة السجل فقط. / This is a PRIVATE AGREEMENT: not notarized, not officially registered, not an executive instrument, and no substitute for official registration or notarization. Verification only proves record integrity.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
