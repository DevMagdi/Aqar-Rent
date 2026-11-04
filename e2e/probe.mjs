import fs from "node:fs"; import path from "node:path";
import chromiumPkg, { inflate } from "@sparticuz/chromium";
import { chromium } from "playwright-core";
if (!fs.existsSync("/tmp/al2023/lib/libnss3.so")) await inflate(path.join(process.cwd(), "node_modules/@sparticuz/chromium/bin/al2023.tar.br"));
const browser = await chromium.launch({ executablePath: await chromiumPkg.executablePath(), headless: true, args: chromiumPkg.args.filter(a=>!a.includes("single-process")&&!a.includes("no-zygote")), env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" } });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar-EG" });
const page = await ctx.newPage();
await page.goto(process.argv[2], { waitUntil: "networkidle" }).catch(()=>{});
const out = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[aria-controls="mobile-navigation"]')];
  return btns.map((b) => ({ cls: b.className, display: getComputedStyle(b).display, rect: b.getBoundingClientRect().width }));
});
console.log(JSON.stringify(out, null, 1));
const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
console.log(overflow);
await browser.close();
