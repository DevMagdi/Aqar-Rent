import fs from "node:fs"; import path from "node:path";
import chromiumPkg, { inflate } from "@sparticuz/chromium";
import { chromium } from "playwright-core";
const PHONE = process.argv[2] || "01000000101";
const r = await fetch("http://localhost:8000/api/v1/auth/otp/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: PHONE }) });
const { dev_code } = await r.json();
const v = await fetch("http://localhost:8000/api/v1/auth/otp/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: PHONE, code: dev_code, platform: "web" }) });
const session = await v.json();
if (!v.ok) { console.log("OTP FAIL", session); process.exit(1); }
if (!fs.existsSync("/tmp/al2023/lib/libnss3.so")) await inflate(path.join(process.cwd(), "node_modules/@sparticuz/chromium/bin/al2023.tar.br"));
const browser = await chromium.launch({ executablePath: await chromiumPkg.executablePath(), headless: true, args: chromiumPkg.args.filter(a=>!a.includes("single-process")&&!a.includes("no-zygote")), env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" } });
for (const [route, name] of [["owner", "owner-dashboard"], ["owner/orders", "owner-orders"], ["account", "account"], ["contracts", "contracts"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar-EG" });
  const me = await (await fetch("http://localhost:8000/api/v1/me", { headers: { Authorization: `Bearer ${session.tokens.access_token}` } })).json();
  await ctx.addInitScript(([t, rt, u]) => { localStorage.setItem("aqar.access", t); localStorage.setItem("aqar.refresh", rt); localStorage.setItem("aqar.user", JSON.stringify(u)); localStorage.setItem("aqar.theme", "light"); }, [session.tokens.access_token, session.tokens.refresh_token, me]);
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3000/ar/${route}`, { waitUntil: "networkidle" }).catch(()=>{});
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join("shots", `d-${name}.png`) });
  console.log("shot", name);
  await ctx.close();
}
await browser.close();
