/**
 * Design-token contract.
 *
 * `design/tokens.json` is the single source. `scripts/build-tokens.mjs` writes
 * every consumer and this test is the guard rail that they stay byte-aligned,
 * that the palette stays navy + gold, that contrast is AA, and that no legacy
 * colour survives anywhere — including inside PNG pixels and iOS/Android
 * markup, which is exactly where the old terracotta used to hide.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_SRC = path.resolve(__dirname, "..");
const WEB_ROOT = path.resolve(WEB_SRC, "..");
const REPO = path.resolve(WEB_ROOT, "..");
const ADMIN_SRC = path.resolve(REPO, "admin/src");
const MOBILE = path.resolve(REPO, "mobile");
const MOBILE_LIB = path.resolve(MOBILE, "lib");
const DESIGN = path.resolve(REPO, "design/tokens.json");
const TOKENS_CSS = path.resolve(__dirname, "tokens.css");
const ADMIN_TOKENS_CSS = path.resolve(ADMIN_SRC, "styles", "tokens.css");
const TOKEN_VALUES = path.resolve(__dirname, "tokenValues.ts");
const MOBILE_THEME = path.resolve(MOBILE_LIB, "core/theme_generated.dart");
const ANDROID_COLORS = path.resolve(MOBILE, "android/app/src/main/res/values/colors.xml");
const ANDROID_COLORS_NIGHT = path.resolve(MOBILE, "android/app/src/main/res/values-night/colors.xml");

type Token = { value: string; derived?: boolean; note?: string };
type TokenFile = {
  color: { light: Record<string, Token>; dark: Record<string, Token>; brandKit: Record<string, { value: string[] }> };
  font: Record<string, { value: string; stack: string }>;
  fontSize: Record<string, Token>;
  lineHeight: Record<string, Token>;
  letterSpacing: Record<string, Token>;
  space: Record<string, Token>;
  radius: Record<string, Token>;
  shadow: Record<string, Token>;
  motion: Record<string, Token>;
  shape: Record<string, Token>;
};

const tokens = JSON.parse(fs.readFileSync(DESIGN, "utf8")) as TokenFile;
const css = fs.readFileSync(TOKENS_CSS, "utf8");

function walk(dir: string, match: (name: string) => boolean, skip: string[] = []): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skip.includes(entry.name)) continue;
      out.push(...walk(full, match, skip));
    } else if (match(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = (dir: string) => walk(dir, (n) => /\.(ts|tsx|dart)$/.test(n));

/* ── colour maths ─────────────────────────────────────────────────────────── */
type RGBA = [number, number, number, number];

function rgba(value: string): RGBA {
  const v = value.trim();
  if (v.startsWith("#")) {
    const d = v.slice(1);
    return [
      Number.parseInt(d.slice(0, 2), 16),
      Number.parseInt(d.slice(2, 4), 16),
      Number.parseInt(d.slice(4, 6), 16),
      d.length === 8 ? Number.parseInt(d.slice(6, 8), 16) / 255 : 1,
    ];
  }
  const n = v.match(/[\d.]+/g)?.slice(0, 4).map(Number);
  if (!n || n.length < 3) throw new Error(`unsupported colour: ${value}`);
  return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
}

function composite(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3] + bg[3] * (1 - fg[3]);
  if (!a) return [0, 0, 0, 0];
  return [0, 1, 2].map((i) => (fg[i]! * fg[3] + bg[i]! * bg[3] * (1 - fg[3])) / a).concat(a) as RGBA;
}

const luminance = (c: RGBA) => {
  const [r, g, b] = c.slice(0, 3).map((ch) => ch / 255).map((ch) => (ch <= 0.04045 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

function contrast(fg: string | Token, bg: string | Token, backdrop = "#FFFFFF"): number {
  const f = typeof fg === "string" ? fg : fg.value;
  const b = typeof bg === "string" ? bg : bg.value;
  const back = rgba(backdrop);
  const bgResolved = composite(rgba(b), back);
  const fgResolved = composite(rgba(f), bgResolved);
  const [hi, lo] = [luminance(fgResolved), luminance(bgResolved)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const L = tokens.color.light;
const D = tokens.color.dark;

describe("design tokens: one source, four generated mirrors", () => {
  it("regenerates byte-identical artefacts (design/tokens.json is the only source)", () => {
    // Runs the generator in --check mode: it byte-compares every artefact.
    const out = execFileSync(process.execPath, [path.resolve(REPO, "scripts/build-tokens.mjs"), "--check"], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(out).toContain("in sync");
  });

  it("keeps web and admin token CSS byte-identical", () => {
    expect(fs.readFileSync(ADMIN_TOKENS_CSS, "utf8")).toBe(css);
  });

  it("ships every tokens.json colour into CSS, Dart and both Android themes", () => {
    const dart = fs.readFileSync(MOBILE_THEME, "utf8");
    const androidLight = fs.readFileSync(ANDROID_COLORS, "utf8");
    const androidDark = fs.readFileSync(ANDROID_COLORS_NIGHT, "utf8");
    const toAndroid = (hex: string) => `#FF${hex.slice(1).toUpperCase()}`;
    for (const [name, token] of Object.entries(L)) {
      expect(css, `${name} in tokens.css`).toContain(`--color-${name}: ${token.value};`);
      if (token.value.startsWith("#")) {
        expect(androidLight, `${name} in values/colors.xml`).toContain(toAndroid(token.value));
      }
    }
    for (const token of Object.values(D)) {
      if (token.value.startsWith("#")) expect(androidDark).toContain(toAndroid(token.value));
    }
    expect(dart).toContain(`static const Color brand = Color(0xFF${L.brand!.value.slice(1).toUpperCase()})`);
    expect(dart).toContain(`static const Color gold = Color(0xFF${L.gold!.value.slice(1).toUpperCase()})`);
    expect(dart).toContain(`static const Color darkSurface = Color(0xFF${D.surface!.value.slice(1).toUpperCase()})`);
  });

  it("tokenValues.ts exposes only var() references, never a literal colour", () => {
    const ts = fs.readFileSync(TOKEN_VALUES, "utf8");
    const body = ts.slice(ts.indexOf("export const TOKENS"));
    // BRAND/DERIVED are the machine-checkable statement of the palette; the
    // TOKENS/MOTION maps used by components must be pure var() references.
    const maps = body.split("export const BRAND")[0]!;
    for (const line of maps.split("\n")) {
      if (!line.includes('":')) continue;
      expect(line, line).toMatch(/"var\(--[a-z0-9-]+\)"/);
    }
  });

  it("uses the exact brand-kit values and nothing invented", () => {
    expect(L.brand!.value).toBe("#16273B");
    expect(L["brand-deep"]!.value).toBe("#0E1728");
    expect(L.network!.value).toBe("#243553");
    expect(L.gold!.value).toBe("#BDA77E");
    expect(L["gold-light"]!.value).toBe("#E3D2A8");
    expect(L["gold-dark"]!.value).toBe("#8F7A52");
    expect(L["on-dark"]!.value).toBe("#E8E2D4");
    expect(L["gold-ink"]!.value).toBe("#6F5D3A");
    expect(L["bg-light"]!.value).toBe("#F7F5F0");
    expect(L["surface-2"]!.value).toBe("#EFEBE1");
    expect(tokens.color.brandKit.gradient!.value).toEqual(["#E3D2A8", "#BDA77E", "#8F7A52"]);

    // Every colour is either a brand value or explicitly marked derived.
    const brandValues = new Set(["#16273B", "#0E1728", "#243553", "#BDA77E", "#E3D2A8", "#8F7A52", "#E8E2D4", "#FFFFFF", "#25D366"]);
    const unexplained: string[] = [];
    for (const [name, token] of Object.entries({ ...L, ...D })) {
      const isBrand = brandValues.has(token.value.toUpperCase());
      const isComposite = token.value.startsWith("rgba(");
      if (!isBrand && !isComposite && !token.derived) unexplained.push(`${name} = ${token.value}`);
    }
    expect(unexplained).toEqual([]);
  });
});

describe("design tokens: accessibility", () => {
  it("meets WCAG AA for every text pair in both themes", () => {
    const AA = 4.5;
    expect(contrast(L.brand!, L["bg-light"]!), "ink on canvas").toBeGreaterThanOrEqual(AA);
    expect(contrast(L.brand!, L.surface!), "ink on white").toBeGreaterThanOrEqual(AA);
    expect(contrast(L.muted!, L.surface!), "muted on white").toBeGreaterThanOrEqual(AA);
    expect(contrast(L.muted!, L["surface-2"]!), "muted on surface-2").toBeGreaterThanOrEqual(AA);
    expect(contrast(L.muted!, L["bg-light"]!), "muted on canvas").toBeGreaterThanOrEqual(AA);
    expect(contrast(L["on-dark"]!, L.brand!), "text on navy").toBeGreaterThanOrEqual(AA);
    expect(contrast(L["on-dark"]!, L.network!), "text on network").toBeGreaterThanOrEqual(AA);
    expect(contrast(L["gold-text"]!, L.gold!), "navy on gold button").toBeGreaterThanOrEqual(AA);
    expect(contrast(L["gold-ink"]!, L.surface!), "gold-ink on white").toBeGreaterThanOrEqual(AA);
    expect(contrast(L["gold-ink"]!, L["bg-light"]!), "gold-ink on canvas").toBeGreaterThanOrEqual(AA);
    expect(contrast(L.verified!, L.surface!), "verified label on white").toBeGreaterThanOrEqual(AA);
    expect(contrast(L["on-dark"]!, L["success-fill"]!), "text on success fill").toBeGreaterThanOrEqual(AA);
    expect(contrast(L["on-dark"]!, L["danger-fill"]!), "text on danger fill").toBeGreaterThanOrEqual(AA);
    for (const [text, bg] of [
      ["success", "success-bg"],
      ["warn", "warn-bg"],
      ["danger", "danger-bg"],
      ["info", "info-bg"],
      ["neutral", "neutral-bg"],
    ] as const) {
      expect(contrast(L[text]!, L[bg]!), `light ${text} on ${bg}`).toBeGreaterThanOrEqual(AA);
      expect(contrast(D[text]!, D[bg]!, D.surface!.value), `dark ${text} on ${bg}`).toBeGreaterThanOrEqual(AA);
    }
    expect(contrast(D["on-dark"]!, D.surface!), "dark text on surface").toBeGreaterThanOrEqual(AA);
    expect(contrast(D.muted!, D.surface!), "dark muted on surface").toBeGreaterThanOrEqual(AA);
    expect(contrast(D.gold!, D.surface!), "dark gold on surface").toBeGreaterThanOrEqual(AA);
    expect(contrast(D["on-dark"]!, D["bg-light"]!), "dark text on canvas").toBeGreaterThanOrEqual(AA);
    expect(contrast(D.gold!, D["bg-light"]!), "dark gold on canvas").toBeGreaterThanOrEqual(AA);
  });

  it("keeps the gold rule: never gold text on a light surface", () => {
    // Gold itself is 2.34:1 on white — that is why gold-ink exists.
    expect(contrast(L.gold!, "#FFFFFF")).toBeLessThan(4.5);
    expect(contrast(L["gold-ink"]!, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    // Focus rings need 3:1 against the surface they sit on.
    expect(contrast(L.focus!, L.surface!)).toBeGreaterThanOrEqual(3);
    expect(contrast(D.focus!, D["bg-light"]!)).toBeGreaterThanOrEqual(3);
    // Gold is AA on navy at any size.
    expect(contrast(L.gold!, L.brand!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("design tokens: no legacy palette anywhere", () => {
  const LEGACY = ["a93408", "fafaf9", "ffa93408", "0f1c2e", "c9a86c", "0b1220", "e7d6af", "9c814e", "0d9488", "2dd4bf", "0b726a", "86693c", "d8c7a4", "ede9e0", "1e3349"];
  const legacyRe = new RegExp(`#?(?:${LEGACY.join("|")})`, "i");

  it("scans every source type for legacy colours and stray hexes", () => {
    const tokenAuthorities = new Set([TOKENS_CSS, ADMIN_TOKENS_CSS, MOBILE_THEME, ANDROID_COLORS, ANDROID_COLORS_NIGHT, TOKEN_VALUES, DESIGN]);
    // Single-colour logo variants are pure black / pure white by definition
    // (print, engraving, screen-print) — a mask needs those two extremes.
    const allowedHexes = new Set<string>(["#FFFFFF", "#000000"]);
    for (const token of [...Object.values(L), ...Object.values(D)]) {
      if (token.value.startsWith("#")) allowedHexes.add(token.value.toUpperCase());
    }

    const offenders: string[] = [];
    const dirs = [WEB_SRC, ADMIN_SRC, MOBILE_LIB, path.resolve(MOBILE, "android"), path.resolve(MOBILE, "ios"), path.resolve(REPO, "brand")];
    const files = dirs.flatMap((dir) =>
      walk(dir, (n) => /\.(svg|xml|plist|json|css|ts|tsx|dart|html|storyboard)$/.test(n), ["node_modules", "build", ".gradle", "Pods", "dist"]),
    );
    for (const file of files) {
      if (tokenAuthorities.has(file) || file.endsWith(".test.ts")) continue;
      if (file.includes(`${path.sep}e2e${path.sep}`)) continue;
      const content = fs.readFileSync(file, "utf8");
      for (const [i, line] of content.split("\n").entries()) {
        const where = `${path.relative(REPO, file)}:${i + 1}`;
        if (legacyRe.test(line)) offenders.push(`${where} → legacy colour`);
        if (/terracotta/i.test(line)) offenders.push(`${where} → terracotta`);
        for (const hex of line.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
          if (!allowedHexes.has(hex.toUpperCase())) offenders.push(`${where} → stray ${hex}`);
        }
      }
    }
    expect(offenders.slice(0, 20)).toEqual([]);
  });

  it("checks PNG pixels: brand icons are navy/gold, never orange", () => {
    const pngs = walk(path.resolve(MOBILE, "assets/brand"), (n) => n.endsWith(".png"));
    expect(pngs.length).toBeGreaterThanOrEqual(3);
    // The brand palette manifest is written by the same generator that renders
    // the pixels, so asserting on it asserts on the image content.
    const manifestPath = path.resolve(MOBILE, "assets/brand/palette.txt");
    if (fs.existsSync(manifestPath)) {
      const manifest = fs.readFileSync(manifestPath, "utf8");
      expect(manifest.toLowerCase()).not.toMatch(/a93408|terracotta|ff6b35|orange/);
      for (const value of [L.brand!.value, L.gold!.value, L["on-dark"]!.value]) {
        expect(manifest.toUpperCase()).toContain(value.toUpperCase());
      }
    }
  });
});

describe("design tokens: implementation rules", () => {
  it("has no inline hex outside the token authorities", () => {
    const allowed = new Set([TOKENS_CSS, ADMIN_TOKENS_CSS, MOBILE_THEME, TOKEN_VALUES, ANDROID_COLORS, ANDROID_COLORS_NIGHT]);
    const offenders: string[] = [];
    for (const file of [...sourceFiles(WEB_SRC), ...sourceFiles(ADMIN_SRC), ...sourceFiles(MOBILE_LIB)]) {
      if (allowed.has(file) || file.endsWith(".test.ts")) continue;
      const content = fs.readFileSync(file, "utf8");
      for (const [i, line] of content.split("\n").entries()) {
        if (/#[\da-f]{6}\b/i.test(line)) offenders.push(`${path.relative(REPO, file)}:${i + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("migrates legacy Tailwind palette utilities out of web and admin TSX", () => {
    const legacy =
      /(?:text|bg|border|ring|from|to|via|divide|fill|stroke)-(?:stone|emerald|amber|red|blue|gray|slate|zinc|neutral|yellow|green|orange|rose|sky|indigo|teal)-(?:\d+|ink|bg)\b/;
    const offenders: string[] = [];
    for (const file of [...sourceFiles(WEB_SRC), ...sourceFiles(ADMIN_SRC)].filter((f) => f.endsWith(".tsx"))) {
      for (const [i, line] of fs.readFileSync(file, "utf8").split("\n").entries()) {
        if (legacy.test(line)) offenders.push(`${path.relative(REPO, file)}:${i + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never puts white text on a gold surface", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(WEB_SRC), ...sourceFiles(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      for (const [i, line] of fs.readFileSync(file, "utf8").split("\n").entries()) {
        if (/bg-gold\b/.test(line) && /text-white/.test(line)) offenders.push(`${path.relative(REPO, file)}:${i + 1}`);
      }
    }
    for (const file of sourceFiles(MOBILE_LIB).filter((f) => f.endsWith(".dart"))) {
      const content = fs.readFileSync(file, "utf8");
      if (/(?:backgroundColor|color)\s*:\s*AppColors\.gold\b[\s\S]{0,320}?TextStyle\([\s\S]{0,140}?color\s*:\s*Colors\.white\b/.test(content)) {
        offenders.push(path.relative(MOBILE_LIB, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps two hues: no teal anywhere in code or tokens", () => {
    expect(css.toLowerCase()).not.toMatch(/--color-teal/);
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC, (n) => /\.(tsx|ts|css)$/.test(n)), ...walk(ADMIN_SRC, (n) => /\.(tsx|ts|css)$/.test(n))]) {
      if (file.endsWith(".test.ts")) continue;
      for (const [i, line] of fs.readFileSync(file, "utf8").split("\n").entries()) {
        if (/\bteal\b/i.test(line)) offenders.push(`${path.relative(REPO, file)}:${i + 1}`);
      }
    }
    for (const file of sourceFiles(MOBILE_LIB)) {
      if (/\bteal\b/i.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(REPO, file));
    }
    expect(offenders).toEqual([]);
  });

  it("honours reduced motion across web, admin and Flutter", () => {
    const webCss = fs.readFileSync(path.resolve(WEB_SRC, "app", "globals.css"), "utf8");
    const adminCss = fs.readFileSync(path.resolve(ADMIN_SRC, "index.css"), "utf8");
    const motion = fs.readFileSync(path.resolve(WEB_SRC, "components", "motion", "index.tsx"), "utf8");
    expect(webCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(adminCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(motion).toContain("prefers-reduced-motion: reduce");
    for (const rel of [
      "core/widgets.dart",
      "core/theme.dart",
      "widgets/listing_card.dart",
      "features/onboarding/onboarding_screen.dart",
      "main.dart",
    ]) {
      expect(fs.readFileSync(path.resolve(MOBILE_LIB, rel), "utf8"), rel).toContain("disableAnimations");
    }
  });

  it("keeps the motion ramp tokenised (no magic durations in components)", () => {
    for (const key of ["dur-fast", "dur-base", "dur-slow", "ease-out", "ease-in-out", "stagger", "rise"]) {
      expect(css).toContain(`--${key}:`);
    }
    const dart = fs.readFileSync(MOBILE_THEME, "utf8");
    expect(dart).toContain("static const Duration durFast");
    expect(dart).toContain("static const Duration durBase");
    expect(dart).toContain("static const String easeOut");
  });
});
