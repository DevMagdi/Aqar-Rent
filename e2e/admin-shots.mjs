import fs from "node:fs"; import path from "node:path";
import { createHmac } from "node:crypto";
import chromiumPkg, { inflate } from "@sparticuz/chromium";
import { chromium } from "playwright-core";

function totp(secret) {
  const key = Buffer.from(secret.replace(/=+$/, ""), "base64").subarray(0, 20);
  const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += b32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0); msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}

const login = await fetch("http://localhost:8000/api/v1/admin/auth/login", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@aqar-rent.dev", password: "ChangeMeAdmin!2026", totp_code: totp("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP") }),
});
const session = await login.json();
if (!login.ok) { console.log("LOGIN FAILED", session); process.exit(1); }
console.log("admin token ok, role", session.role);

if (!fs.existsSync("/tmp/al2023/lib/libnss3.so")) await inflate(path.join(process.cwd(), "node_modules/@sparticuz/chromium/bin/al2023.tar.br"));
const browser = await chromium.launch({ executablePath: await chromiumPkg.executablePath(), headless: true, args: chromiumPkg.args.filter(a=>!a.includes("single-process")&&!a.includes("no-zygote")), env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" } });
for (const theme of ["light", "dark"]) {
  for (const [route, name] of [["/", "dashboard"], ["/moderation", "moderation"], ["/payments", "payments"], ["/verifications", "verifications"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: theme });
    await ctx.addInitScript(([t, th]) => { localStorage.setItem("aqar.admin.token", t); localStorage.setItem("aqar.admin.role", "super_admin"); localStorage.setItem("aqar.theme", th); }, [session.access_token, theme]);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:5173${route}`, { waitUntil: "networkidle" }).catch(()=>{});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join("shots", `c-admin-${name}-${theme}.png`) });
    console.log("shot", `c-admin-${name}-${theme}`);
    await ctx.close();
  }
}
await browser.close();
