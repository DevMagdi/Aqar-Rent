/**
 * Unified palette + artifact contract.
 *
 * This test is the guard rail for the Mantiq identity: navy + gold only, no
 * other brand hue on any primary surface, no hard-coded hex but the token
 * authorities, web↔admin byte-identical tokens, web↔Flutter value alignment,
 * AA contrast for every semantic pair, and — crucially — the same "no legacy
 * colour" rule applied to the *binary and markup* brand assets (svg/xml/png/
 * storyboard), which is where the old terracotta survived before.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, DERIVED, MOTION, TOKENS, TOKENS_DARK } from "./tokenValues";

const WEB_SRC = path.resolve(__dirname, "..");
const WEB_ROOT = path.resolve(WEB_SRC, "..");
const REPO = path.resolve(WEB_ROOT, "..");
const ADMIN_SRC = path.resolve(REPO, "admin/src");
const MOBILE = path.resolve(REPO, "mobile");
const MOBILE_LIB = path.resolve(MOBILE, "lib");
const TOKENS_CSS = path.resolve(__dirname, "tokens.css");
const ADMIN_TOKENS_CSS = path.resolve(ADMIN_SRC, "styles", "tokens.css");
const MOBILE_THEME = path.resolve(MOBILE_LIB, "core/theme.dart");

function walk(dir: string, match: (name: string) => boolean, skipDirs: string[] = []): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      out.push(...walk(full, match, skipDirs));
    } else if (match(entry.name)) out.push(full);
  }
  return out;
}

const sourceFiles = (dir: string) => walk(dir, (name) => /\.(ts|tsx|dart)$/.test(name));

function declarations(block: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) map[match[1]!] = match[2]!.trim();
  return map;
}

function blockAt(source: string, open: number, values: Record<string, string> = {}) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return values;
    }
    if (source[index] === "-" && source[index + 1] === "-") {
      const match = /^--([a-z0-9-]+):\s*([^;]+);/.exec(source.slice(index));
      if (match) values[match[1]!] = match[2]!.trim();
    }
  }
  return values;
}

function cssTokens(): { source: string; light: Record<string, string>; dark: Record<string, string> } {
  const source = fs.readFileSync(TOKENS_CSS, "utf8");
  const light = blockAt(source, source.indexOf(":root {"));
  const darkOpen = source.search(/\.dark,\s*\n:root\[data-theme="dark"\]\s*\{/);
  const dark = darkOpen >= 0 ? blockAt(source, source.indexOf("{", darkOpen)) : {};
  return { source, light, dark };
}

function toDartColor(value: string): string {
  const digits = value.startsWith("#") ? value.slice(1) : "";
  return `0xFF${digits.toUpperCase()}`;
}

function resolveToken(value: string, values: Record<string, string>): string {
  const match = value.match(/^var\(--([a-z0-9-]+)\)$/);
  if (!match) return value;
  const resolved = values[match[1]!];
  if (!resolved || resolved === value) throw new Error(`Unresolved palette reference: ${value}`);
  return resolveToken(resolved, values);
}

type RGBA = [number, number, number, number];

function rgba(value: string): RGBA {
  const normalized = value.trim();
  if (normalized.startsWith("#")) {
    const digits = normalized.slice(1);
    const size = digits.length === 8 ? 2 : 0;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16));
    return [...channels, size ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1] as RGBA;
  }
  const values = normalized.match(/[\d.]+/g)?.slice(0, 4).map(Number);
  if (!values || values.length < 3) throw new Error(`Unsupported palette value: ${value}`);
  return [values[0]!, values[1]!, values[2]!, values[3] ?? 1];
}

function composite(foreground: RGBA, background: RGBA): RGBA {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (!alpha) return [0, 0, 0, 0];
  return [0, 1, 2].map((index) => (foreground[index]! * foreground[3] + background[index]! * background[3] * (1 - foreground[3])) / alpha).concat(alpha) as RGBA;
}

function luminance(color: RGBA): number {
  const channels = color.slice(0, 3).map((channel) => channel / 255).map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string, backdrop = "#FFFFFF"): number {
  const resolvedBackdrop = rgba(backdrop);
  const resolvedBackground = composite(rgba(background), resolvedBackdrop);
  const resolvedForeground = composite(rgba(foreground), resolvedBackground);
  const values = [luminance(resolvedForeground), luminance(resolvedBackground)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("unified design tokens", () => {
  const { source, light, dark } = cssTokens();

  it("keeps the CSS files identical and tokens.css is the only web/admin palette", () => {
    const admin = fs.readFileSync(ADMIN_TOKENS_CSS, "utf8");
    expect(admin).toBe(source);
    for (const [, value] of Object.entries({ ...TOKENS, ...TOKENS_DARK })) {
      expect(value).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
      const cssName = value.slice(6, -1);
      expect(source).toContain(`--${cssName}:`);
    }
  });

  it("uses the exact Mantiq navy + gold values, and only documented derived steps", () => {
    expect(light["color-brand"]?.toUpperCase()).toBe(BRAND.navy);
    expect(light["color-brand-deep"]?.toUpperCase()).toBe(BRAND.navyDeep);
    expect(light["color-gold"]?.toUpperCase()).toBe(BRAND.gold);
    expect(light["color-gold-text"]?.toUpperCase()).toBe(BRAND.navyDeep);
    expect(light["color-gold-dark"]?.toUpperCase()).toBe(DERIVED.goldDark);
    expect(light["color-gold-light"]?.toUpperCase()).toBe(DERIVED.goldLight);
    expect(light["color-on-dark"]?.toUpperCase()).toBe(DERIVED.onDark);
    expect(light["color-bg"]?.toUpperCase()).toBe(DERIVED.bg);
    expect(light["color-muted"]?.toUpperCase()).toBe(DERIVED.muted);

    // Every literal colour in the light block must be one of the documented
    // brand/derived values, a functional status colour, or an rgba() of them.
    const allowed = new Set<string>([
      ...Object.values(BRAND),
      ...Object.values(DERIVED),
      "#1B5E3A", "#1B5E3A", "#EAF3ED", // success
      "#8A5A12", "#FBF3E4", // warning
      "#A32A22", "#FBEEED", // danger
      "#1E4A7A", "#ECF1F8", // info
      "#4A5666", "#EEF1F4", // neutral
      "#25D366", // whatsapp (official)
      "#FFFFFF", // pure white surface
    ].map((value) => value.toUpperCase()));
    const stray: string[] = [];
    for (const [name, value] of Object.entries(light)) {
      if (/^var\(/.test(value)) continue;
      for (const hex of value.match(/#[0-9a-fA-F]{3,8}/g) || []) {
        if (!allowed.has(hex.toUpperCase())) stray.push(`--${name}: ${hex}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it("keeps navy + gold as the only brand hues on every surface", () => {
    // The token set itself may not declare a second brand hue…
    expect(source.toLowerCase()).not.toMatch(/--color-teal/);
    // …and no component/style may reference one.
    const offenders: string[] = [];
    const surfaces = [
      ...walk(WEB_SRC, (name) => /\.(tsx|ts|css)$/.test(name) && !name.endsWith(".test.ts")),
      ...walk(ADMIN_SRC, (name) => /\.(tsx|ts|css)$/.test(name)),
    ];
    for (const file of surfaces) {
      const content = fs.readFileSync(file, "utf8");
      content.split("\n").forEach((line, index) => {
        if (/\bteal\b/i.test(line)) offenders.push(`${path.relative(REPO, file)}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
    // Flutter: no secondary-hue constants; the verified mark is gold.
    const dartFiles = sourceFiles(MOBILE_LIB).filter((file) => file.endsWith(".dart"));
    const dartOffenders = dartFiles.filter((file) => /\bteal\b|Teal\b/.test(fs.readFileSync(file, "utf8"))).map((file) => path.relative(REPO, file));
    expect(dartOffenders).toEqual([]);
  });

  it("keeps the verified mark gold, not teal, on web and mobile", () => {
    const verified = resolveToken(light["color-verified"]!, light).toUpperCase();
    expect(verified).toBe(DERIVED.goldDark);
    expect(contrast(verified, light["color-surface"]!), "verified label on white").toBeGreaterThanOrEqual(4.5);
    const pill = composite(rgba(light["color-verified-bg"]!), rgba(light["color-surface"]!));
    const pillHex = `#${pill.slice(0, 3).map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
    expect(contrast(light["color-verified-strong"]!, pillHex), "navy on gold pill").toBeGreaterThanOrEqual(4.5);
    const dart = fs.readFileSync(MOBILE_THEME, "utf8");
    expect(dart).toContain(toDartColor(DERIVED.goldDark));
    expect(dart).toMatch(/verified/i);
  });

  it("keeps mobile light and dark palettes aligned with the CSS source", () => {
    const dart = fs.readFileSync(MOBILE_THEME, "utf8");
    const lightNames: Record<string, string> = {
      brand: "color-brand", brandDeep: "color-brand-deep", network: "color-network",
      gold: "color-gold", goldLight: "color-gold-light", goldDark: "color-gold-dark",
      onDark: "color-on-dark", bg: "color-bg", surface: "color-surface", muted: "color-muted",
      success: "color-success", warn: "color-warn", danger: "color-danger",
      info: "color-info", neutral: "color-neutral", whatsapp: "color-whatsapp",
    };
    const darkNames: Record<string, string> = {
      darkBg: "color-bg", darkSurface: "color-surface", darkSurface2: "color-surface-2",
      darkInk: "color-ink", darkInkStrong: "color-ink-strong", darkMuted: "color-muted",
    };
    for (const [, cssName] of Object.entries(lightNames)) {
      const value = light[cssName];
      if (value?.startsWith("#")) expect(dart, cssName).toContain(toDartColor(value));
    }
    for (const [dartName, cssName] of Object.entries(darkNames)) {
      const value = dark[cssName];
      if (value?.startsWith("#")) expect(dart, `${dartName} ← ${cssName}`).toContain(toDartColor(value));
    }
  });

  it("keeps the shared motion contract aligned with CSS and Flutter", () => {
    const expected: Record<string, string> = {
      "ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      "ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      "ease-spring": "cubic-bezier(0.34, 1.3, 0.64, 1)",
      "dur-instant": "80ms",
      "dur-fast": "160ms",
      "dur-base": "280ms",
      "dur-slow": "480ms",
      "dur-hero": "900ms",
      stagger: "60ms",
      rise: "16px",
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(source).toContain(`--${name}: ${value};`);
      const propertyName = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const aliases: Record<string, string> = { durInstant: "instant", durFast: "fast", durBase: "base", durSlow: "slow", durHero: "hero" };
      const motionName = aliases[propertyName] || propertyName;
      expect(MOTION).toHaveProperty(motionName, `var(--${name})`);
    }
    const dart = fs.readFileSync(MOBILE_THEME, "utf8");
    for (const dartValue of [
      "instant = Duration(milliseconds: 80)", "fast = Duration(milliseconds: 160)",
      "base = Duration(milliseconds: 280)", "slow = Duration(milliseconds: 480)",
      "hero = Duration(milliseconds: 900)", "stagger = Duration(milliseconds: 60)",
      "rise = 16", "easeOut = Cubic(0.22, 1, 0.36, 1)",
      "easeInOut = Cubic(0.65, 0, 0.35, 1)", "easeSpring = Cubic(0.34, 1.3, 0.64, 1)",
    ]) expect(dart).toContain(dartValue);
    expect(fs.readFileSync(ADMIN_TOKENS_CSS, "utf8")).toBe(source);
  });

  it("uses navy text on gold and preserves WCAG AA contrast for core text pairs", () => {
    expect(light["color-gold-text"]).toBe(light["color-brand-deep"]);
    expect(contrast(resolveToken(light["color-gold-text"]!, light), resolveToken(light["color-gold"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-ink"]!, light), resolveToken(light["color-bg"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-muted"]!, light), resolveToken(light["color-surface"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-muted"]!, light), resolveToken(light["color-surface-2"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-brand"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-sidebar-hover"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-success-fill"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-danger-fill"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-gold-text"]!, light), resolveToken(light["color-whatsapp"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-gold-dark"]!, light), resolveToken(light["color-surface"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-focus"]!, light), resolveToken(light["color-surface"]!, light))).toBeGreaterThanOrEqual(3);
    expect(contrast(resolveToken(dark["color-ink"]!, dark), resolveToken(dark["color-bg"]!, dark))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(dark["color-muted"]!, dark), resolveToken(dark["color-surface"]!, dark))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(dark["color-gold"]!, dark), resolveToken(dark["color-surface"]!, dark))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(dark["color-focus"]!, dark), resolveToken(dark["color-bg"]!, dark))).toBeGreaterThanOrEqual(3);
    for (const [text, bg] of [["color-success", "color-success-bg"], ["color-warn", "color-warn-bg"], ["color-danger", "color-danger-bg"], ["color-info", "color-info-bg"], ["color-neutral", "color-neutral-bg"]]) {
      expect(contrast(resolveToken(light[text]!, light), resolveToken(light[bg]!, light)), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(resolveToken(dark[text]!, dark), resolveToken(dark[bg]!, dark), resolveToken(dark["color-surface"]!, dark)), `dark ${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("honors reduced motion across shared web/admin and Flutter primitives", () => {
    const webCss = fs.readFileSync(path.resolve(WEB_SRC, "app", "globals.css"), "utf8");
    const adminCss = fs.readFileSync(path.resolve(ADMIN_SRC, "index.css"), "utf8");
    const motion = fs.readFileSync(path.resolve(WEB_SRC, "components", "motion", "index.tsx"), "utf8");
    const flutterFiles = [
      path.resolve(MOBILE_LIB, "core", "widgets.dart"),
      path.resolve(MOBILE_LIB, "core", "theme.dart"),
      path.resolve(MOBILE_LIB, "widgets", "listing_card.dart"),
      path.resolve(MOBILE_LIB, "features", "onboarding", "onboarding_screen.dart"),
      path.resolve(MOBILE_LIB, "main.dart"),
    ];
    expect(webCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(adminCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(motion).toContain("prefers-reduced-motion: reduce");
    expect(motion).toContain("reduced || !(\"IntersectionObserver\" in window)");
    for (const file of flutterFiles) expect(fs.readFileSync(file, "utf8"), file).toContain("disableAnimations");
  });

  it("contains no inline hex colors outside the CSS/Dart token authorities", () => {
    const allowed = [TOKENS_CSS, ADMIN_TOKENS_CSS, MOBILE_THEME];
    const offenders: string[] = [];
    for (const file of [...sourceFiles(WEB_SRC), ...sourceFiles(ADMIN_SRC), ...sourceFiles(MOBILE_LIB)]) {
      if (allowed.includes(file) || file.endsWith(".test.ts") || file.endsWith("tokenValues.ts")) continue;
      const content = fs.readFileSync(file, "utf8");
      for (const [index, line] of content.split("\n").entries()) {
        if (/#[\da-f]{6}\b/i.test(line)) offenders.push(`${path.relative(REPO, file)}:${index + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("migrates legacy palette utilities out of web and admin TSX", () => {
    const legacy = /(?:text|bg|border|ring|from|to|via|divide|fill|stroke)-(?:stone|emerald|amber|red|blue|gray|slate|zinc|neutral|yellow|green|orange|rose|sky|indigo|teal)-(?:\d+|ink|bg)\b/;
    const offenders: string[] = [];
    for (const file of [...sourceFiles(WEB_SRC), ...sourceFiles(ADMIN_SRC)].filter((item) => item.endsWith(".tsx"))) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => { if (legacy.test(line)) offenders.push(`${path.relative(REPO, file)}:${index + 1}: ${line.trim()}`); });
    }
    expect(offenders).toEqual([]);
  });

  it("never puts white text on a gold surface", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(WEB_SRC), ...sourceFiles(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      for (const [index, line] of lines.entries()) {
        if (/bg-gold\b/.test(line) && /text-white/.test(line)) offenders.push(`${path.basename(file)}:${index + 1}`);
      }
    }
    for (const file of sourceFiles(MOBILE_LIB).filter((item) => item.endsWith(".dart"))) {
      const content = fs.readFileSync(file, "utf8");
      const goldWhite = /(?:backgroundColor|color)\s*:\s*AppColors\.gold\b[\s\S]{0,320}?TextStyle\([\s\S]{0,140}?color\s*:\s*Colors\.white\b/g;
      if (goldWhite.test(content)) offenders.push(path.relative(MOBILE_LIB, file));
    }
    expect(offenders).toEqual([]);
  });

  /* ── Brand artifacts: the place legacy colours used to hide ───────────── */

  const LEGACY_HEXES = ["A93408", "FFA93408", "FAFAF9", "0F1C2E", "C9A86C", "0B1220", "E7D6AF", "9C814E", "0D9488", "2DD4BF", "0B726A"];

  it("keeps brand markup and mobile assets free of legacy palette colours", () => {
    const markup = [
      ...walk(WEB_ROOT, (name) => /\.(svg|xml|webmanifest|json|ts|tsx|css)$/.test(name), ["node_modules", ".next", "dist"]),
      ...walk(path.resolve(MOBILE, "android"), (name) => /\.(xml|json|dart)$/.test(name), ["build", ".gradle"]),
      ...walk(path.resolve(MOBILE, "ios"), (name) => /\.(storyboard|json|plist|xib)$/.test(name), ["Pods", "build"]),
    ].filter((file) => !file.endsWith("tokenValues.ts") && !file.endsWith("tokens.css") && !file.endsWith(".test.ts"));

    const offenders: string[] = [];
    for (const file of markup) {
      const content = fs.readFileSync(file, "utf8");
      for (const hex of LEGACY_HEXES) {
        if (new RegExp(`#${hex}\\b`, "i").test(content)) offenders.push(`${path.relative(REPO, file)} → #${hex}`);
      }
      if (/systemBackgroundColor/.test(content)) offenders.push(`${path.relative(REPO, file)} → system background (white) launch screen`);
    }
    expect(offenders).toEqual([]);
  });

  it("ships brand PNGs generated from the Mantiq palette only", () => {
    // PNGs cannot be greped, so the contract is: every brand image decodes to
    // pixels from the navy/gold ramp (+ antialiasing blends of them).
    const brandPngs = walk(path.resolve(MOBILE, "assets", "brand"), (name) => name.endsWith(".png"));
    expect(brandPngs.length).toBeGreaterThanOrEqual(3);
    const allowed: [number, number, number][] = [
      [0x16, 0x27, 0x3B], [0x0E, 0x17, 0x28], [0xBD, 0xA7, 0x7E], [0xD8, 0xC7, 0xA4], [0x86, 0x69, 0x3C], [0x1E, 0x33, 0x49],
    ];
    // The icon manifest (assets/brand/palette.txt) is written by the generator.
    const manifest = fs.readFileSync(path.resolve(MOBILE, "assets", "brand", "palette.txt"), "utf8");
    for (const [r, g, b] of allowed) {
      const hex = `#${[r, g, b].map((v) => v.toString(16).toUpperCase().padStart(2, "0")).join("")}`;
      expect(manifest).toContain(hex);
    }
    expect(manifest.toLowerCase()).not.toContain("a93408");
  });
});
