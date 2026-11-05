import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { serverTokenColor } from "@/lib/serverColor";

export const runtime = "nodejs";
export const alt = "Aqar Rent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social card in the Aqar identity: navy field, one gold rule, the real brand
 * mark, and real Arabic type.
 *
 * Arabic is rendered from the bundled El Messiri **WOFF** faces (Satori cannot
 * read WOFF2). The Arabic subset is registered as its own family *after* the
 * Latin one, so:
 *   · Latin words / "AQAR RENT" / "0%" use the Latin face,
 *   · Arabic words use the Arabic face,
 *   · symbol codepoints (✓ | ٪) that neither covers fall through to
 *     system-ui instead of rendering as tofu — the old card's failure mode.
 */
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const faces = [
  { name: "MessiriLatin", file: "el-messiri-latin-700.woff" },
  { name: "MessiriArabic", file: "el-messiri-arabic-700.woff" },
];

function fontBuffers(): { name: string; data: ArrayBuffer; style: "normal"; weight: 700 }[] {
  const out: { name: string; data: ArrayBuffer; style: "normal"; weight: 700 }[] = [];
  for (const face of faces) {
    try {
      const buffer = readFileSync(path.join(FONT_DIR, face.file));
      out.push({
        name: face.name,
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        style: "normal",
        weight: 700,
      });
    } catch {
      /* font missing in a stripped deploy → Latin/system fallback still renders */
    }
  }
  return out;
}

const AR_DEFAULT = {
  title: "إيجار مباشر بين المالك والمستأجر",
  sub: "بدون وسيط، وبدون عمولة على الإيجار، ابحث وقارن وتواصل",
};
const EN_DEFAULT = {
  title: "Direct rentals, no brokers",
  sub: "No rent commission · Search, compare, talk to the owner directly",
};

function clip(value: string | null, fallback: string, max: number): string {
  const cleaned = (value || "").replace(/[\u0000-\u001f<>]/g, "").trim();
  return (cleaned || fallback).slice(0, max);
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("lang") === "en" ? "en" : "ar";
  const defaults = locale === "ar" ? AR_DEFAULT : EN_DEFAULT;
  const title = clip(searchParams.get("title"), defaults.title, 96);
  const sub = clip(searchParams.get("sub"), defaults.sub, 130);
  const rtl = locale === "ar";

  const palette = {
    navy: serverTokenColor("brand"),
    navyDeep: serverTokenColor("brand-deep"),
    gold: serverTokenColor("gold"),
    goldLight: serverTokenColor("gold-light"),
    goldDark: serverTokenColor("gold-dark"),
    onDark: serverTokenColor("on-dark"),
    muted: "rgba(237, 233, 224, 0.74)",
  };
  const fonts = fontBuffers();
  const family = fonts.length ? "MessiriLatin, MessiriArabic" : "sans-serif";
  const wordmark = locale === "ar" ? "عقار رينت" : "Aqar Rent";
  const eyebrow = locale === "ar" ? "سوق الإيجار المصري" : "EGYPTIAN RENTAL MARKET";
  const chips =
    locale === "ar"
      ? ["توثيق على 4 مستويات", "بدون عمولة على الإيجار", "المنصة لا تحتفظ بالأموال"]
      : ["4-level verification", "No rent commission", "We never hold money"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: rtl ? "row-reverse" : "row",
          background: `linear-gradient(122deg, ${palette.navy} 0%, ${palette.navyDeep} 74%)`,
          fontFamily: family,
        }}
      >
        <div style={{ width: 10, height: "100%", display: "flex", background: `linear-gradient(180deg, ${palette.goldLight}, ${palette.gold} 55%, ${palette.goldDark})` }} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "66px 72px 58px 72px" }}>
          <div style={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 20 }}>
            <svg width="74" height="74" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12.5" fill={palette.navyDeep} stroke={palette.goldDark} strokeWidth="0.8" />
              <path d="M11.5 22.4 24 12.2l12.5 10.2" stroke={palette.goldLight} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15.1 22.2v10.9a2.6 2.6 0 0 0 2.6 2.6h12.6a2.6 2.6 0 0 0 2.6-2.6V22.2" stroke={palette.gold} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="30.5" r="3" fill={palette.gold} />
              <circle cx="24" cy="29.9" r="1.05" fill={palette.navyDeep} />
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 33, lineHeight: 1.2, color: palette.onDark }}>{wordmark}</div>
              <div style={{ fontSize: 15, lineHeight: 1.4, color: palette.gold, letterSpacing: 4 }}>AQAR RENT</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: rtl ? "flex-end" : "flex-start" }}>
            <div style={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
              <div style={{ width: 26, height: 3, display: "flex", background: palette.gold }} />
              <div style={{ fontSize: 19, color: palette.gold, letterSpacing: 1 }}>{eyebrow}</div>
            </div>
            <div style={{ marginTop: 18, fontSize: title.length > 44 ? 48 : 58, lineHeight: 1.24, color: palette.onDark, textAlign: rtl ? "right" : "left" }}>
              {title}
            </div>
            <div style={{ marginTop: 16, fontSize: 26, lineHeight: 1.5, color: palette.muted, textAlign: rtl ? "right" : "left" }}>
              {sub}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row", gap: 10, flexWrap: "wrap" }}>
            {chips.map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  border: `1px solid ${palette.goldDark}`,
                  borderRadius: 999,
                  padding: "8px 18px",
                  fontSize: 19,
                  color: palette.onDark,
                  background: "rgba(189, 167, 126, 0.10)",
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
