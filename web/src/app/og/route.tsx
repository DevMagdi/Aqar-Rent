import { ImageResponse } from "next/og";
import { TOKENS } from "../../styles/tokenValues";

export const runtime = "nodejs";
export const alt = "Aqar Rent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Satori/fontkit cannot parse some GSUB lookups in Amiri (the Arabic font),
 *  so OG cards render Latin-only text (digits/latin city names) — Arabic UI
 *  text itself renders fine everywhere else via the bundled font. */
function ascii(s: string | null, fallback: string): string {
  const cleaned = (s || "").replace(/[^\x20-\x7E]/g, "").trim();
  return (cleaned || fallback).slice(0, 90);
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const title = ascii(searchParams.get("title"), "Aqar Rent — direct rentals, no brokers");
  const sub = ascii(searchParams.get("sub"), "Egypt's broker-free rental marketplace · Search, compare, contact owners");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${TOKENS.goldLight} 0%, ${TOKENS.surface} 100%)`,
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: TOKENS.brand,
              color: TOKENS.onDark,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              fontWeight: 700,
            }}
          >
            AR
          </div>
          <div style={{ fontSize: 44, color: TOKENS.goldDark, fontWeight: 700 }}>Aqar Rent</div>
        </div>
        <div style={{ marginTop: 44, fontSize: 58, color: TOKENS.brand, fontWeight: 700 }}>{title}</div>
        <div style={{ marginTop: 20, fontSize: 32, color: TOKENS.muted }}>{sub}</div>
      </div>
    ),
    { width: size.width, height: size.height },
  );
}
