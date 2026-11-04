/**
 * Visual evidence capture (not a test): screenshots of the redesigned web,
 * admin and owner surfaces in AR (RTL) + EN (LTR), light + dark, desktop +
 * mobile. Writes PNGs to e2e/shots/ for manual review.
 *
 *   npx tsx screenshot.ts            # against the hermetic stack on :3010/:5180
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chromiumPkg, { inflate } from "@sparticuz/chromium";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.SHOT_WEB || "http://localhost:3010";
const ADMIN = process.env.SHOT_ADMIN || "http://localhost:5180";
const OUT = path.join(__dirname, "shots");

async function browserExecutable() {
  if (!fs.existsSync("/tmp/al2023/lib/libnss3.so")) await inflate(path.join(__dirname, "node_modules/@sparticuz/chromium/bin/al2023.tar.br"));
  return chromiumPkg.executablePath();
}

async function shoot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log("shot", name);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: await browserExecutable(),
    headless: true,
    args: chromiumPkg.args.filter((a) => !a.includes("single-process") && !a.includes("no-zygote")),
    env: { ...process.env, LD_LIBRARY_PATH: "/tmp/al2023/lib" },
  });

  for (const [locale, dir] of [["ar", "rtl"], ["en", "ltr"]]) {
    for (const theme of ["light", "dark"]) {
      for (const [label, viewport] of Object.entries({ desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } })) {
        const context = await browser.newContext({ viewport, locale: locale === "ar" ? "ar-EG" : "en-US", colorScheme: theme });
        await context.addInitScript((value) => {
          try {
            localStorage.setItem("aqar.theme", value);
          } catch {
            /* ignore */
          }
        }, theme);
        const page = await context.newPage();
        for (const [route, slug] of [["", "home"], ["/search", "search"], ["/pricing", "pricing"]]) {
          await page.goto(`${WEB}/${locale}${route}`, { waitUntil: "networkidle" }).catch(() => {});
          await shoot(page, `${slug}-${locale}-${theme}-${label}-${dir}`);
        }
        await context.close();
      }
    }
  }

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${ADMIN}/login`, { waitUntil: "networkidle" }).catch(() => {});
  await shoot(adminPage, "admin-login-light");
  await adminPage.emulateMedia({ colorScheme: "dark" });
  await shoot(adminPage, "admin-login-dark");
  await adminContext.close();

  await browser.close();
}

await main();
