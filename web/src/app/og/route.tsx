import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const alt = "Aqar Rent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || "عقار ربنا").slice(0, 90);
  const sub = (searchParams.get("sub") || "سوق إيجار مباشر بدون وسطاء").slice(0, 120);
  let font: ArrayBuffer | null = null;
  try {
    const buf = await readFile(path.join(process.cwd(), "public/fonts/Amiri-Regular.ttf"));
    font = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    /* fallback to default font */
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fdf6ee 0%, #f9e8d4 100%)",
          padding: 80,
          fontFamily: "Amiri",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "#a93408",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
            }}
          >
            ع
          </div>
          <div style={{ fontSize: 44, color: "#8a2a06", fontWeight: 700 }}>عقار ربنا · Aqar Rent</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 64, color: "#1c1917", fontWeight: 700 }}>{title}</div>
        <div style={{ marginTop: 20, fontSize: 34, color: "#57534e" }}>{sub}</div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
      fonts: font ? [{ name: "Amiri", data: font, style: "normal", weight: 400 }] : undefined,
    },
  );
}
