import fs from "node:fs";
import path from "node:path";
import chromiumPkg, { inflate } from "@sparticuz/chromium";
import { chromium } from "playwright-core";
if (!fs.existsSync("/tmp/al2023/lib/libnss3.so")) await inflate(path.join(process.cwd(), "node_modules/@sparticuz/chromium/bin/al2023.tar.br"));
const exe = await chromiumPkg.executablePath();
const browser = await chromium.launch({ executablePath: exe, headless: true, args: chromiumPkg.args.filter(a=>!a.includes("single-process")&&!a.includes("no-zygote")), env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" } });
const routes = process.argv.slice(2);
for (const spec of routes) {
  const [url, name, w, h, theme] = spec.split("|");
  const ctx = await browser.newContext({ viewport: { width: Number(w||1280), height: Number(h||900) }, locale: "ar-EG", colorScheme: theme || "light" });
  await ctx.addInitScript((v) => localStorage.setItem("aqar.theme", v), theme || "light");
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" }).catch(()=>{});
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join("shots", `${name}.png`), fullPage: false });
  console.log("shot", name);
  await ctx.close();
}
await browser.close();
