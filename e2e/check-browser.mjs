// One-shot browser sanity check: inflate libs + launch + load the local site.
// (Also validates the exact launch options used by playwright.config.ts.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chromiumPkg, { inflate } from "@sparticuz/chromium";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureBrowser() {
  if (!fs.existsSync("/tmp/al2023/lib/libnss3.so")) {
    const br = path.join(__dirname, "node_modules/@sparticuz/chromium/bin/al2023.tar.br");
    console.log("inflating", br);
    await inflate(br); // inflate takes a file path (string), not a Buffer
  }
  const exe = await chromiumPkg.executablePath();
  console.log("exe:", exe, "libs:", fs.existsSync("/tmp/al2023/lib/libnss3.so"));
  return exe;
}

const exe = await ensureBrowser();
const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: chromiumPkg.args,
  env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "ar-EG" });
await page.goto("http://localhost:3000/ar", { waitUntil: "domcontentloaded" });
console.log("home title:", await page.title());
console.log("brand text:", await page.locator('[data-testid="brand"]').first().innerText().catch(() => "n/a"));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
console.log("admin root count:", await page.locator("#root").count());
await browser.close();
console.log("BROWSER SMOKE OK");
