/** Unified palette contract: CSS owns web/admin colors; mobile mirrors those values. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOTION, TOKENS, TOKENS_DARK } from "./tokenValues";

const WEB_SRC = path.resolve(__dirname, "..");
const ADMIN_SRC = path.resolve(WEB_SRC, "../../admin/src");
const MOBILE_LIB = path.resolve(WEB_SRC, "../../mobile/lib");
const TOKENS_CSS = path.resolve(__dirname, "tokens.css");
const MOBILE_THEME = path.resolve(MOBILE_LIB, "core/theme.dart");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|dart)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function declarations(block: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) map[match[1]!] = match[2]!.trim();
  return map;
}

function cssTokens(): { source: string; light: Record<string, string>; dark: Record<string, string> } {
  const source = fs.readFileSync(TOKENS_CSS, "utf8");
  const rootStart = source.indexOf(":root {");
  const rootEnd = source.indexOf("\n}", rootStart);
  const darkStart = source.indexOf(":root[data-theme=\"dark\"]");
  const darkOpen = source.indexOf("{", darkStart);
  const darkEnd = source.indexOf("\n}", darkOpen);
  return {
    source,
    light: declarations(source.slice(rootStart, rootEnd)),
    dark: declarations(source.slice(darkOpen + 1, darkEnd)),
  };
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
    const admin = fs.readFileSync(path.resolve(ADMIN_SRC, "styles", "tokens.css"), "utf8");
    expect(admin).toBe(source);
    for (const [name, value] of Object.entries({ ...TOKENS, ...TOKENS_DARK })) {
      expect(value).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
      const cssName = value.slice(6, -1);
      expect(source).toContain(`--${cssName}:`);
      expect(name).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("keeps mobile light and dark palettes aligned with the CSS source", () => {
    const dart = fs.readFileSync(MOBILE_THEME, "utf8");
    const lightNames: Record<string, string> = {
      brand: "color-brand", brandDeep: "color-brand-deep", network: "color-network",
      gold: "color-gold", goldLight: "color-gold-light", goldDark: "color-gold-dark",
      onDark: "color-on-dark", teal: "color-teal", tealInk: "color-teal-ink",
      bg: "color-bg", surface: "color-surface", muted: "color-muted",
      success: "color-success", warn: "color-warn", danger: "color-danger",
      info: "color-info", neutral: "color-neutral", whatsapp: "color-whatsapp",
    };
    const darkNames: Record<string, string> = {
      darkBg: "color-bg", darkSurface: "color-surface", darkSurface2: "color-surface-2",
      darkInk: "color-ink", darkInkStrong: "color-ink-strong", darkMuted: "color-muted",
      darkTeal: "color-teal",
    };
    for (const [, cssName] of Object.entries(lightNames)) {
      const value = light[cssName];
      if (value?.startsWith("#")) expect(dart).toContain(toDartColor(value));
    }
    for (const [dartName, cssName] of Object.entries(darkNames)) {
      const value = dark[cssName];
      if (value?.startsWith("#")) expect(dart, dartName).toContain(toDartColor(value));
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
    expect(fs.readFileSync(path.resolve(ADMIN_SRC, "styles", "tokens.css"), "utf8")).toBe(source);
  });

  it("uses navy text on gold and preserves WCAG AA contrast for core text pairs", () => {
    expect(light["color-gold-text"]).toBe(light["color-brand"]);
    expect(contrast(resolveToken(light["color-gold-text"]!, light), resolveToken(light["color-gold"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-ink"]!, light), resolveToken(light["color-bg"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-brand"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-success-fill"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-danger-fill"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-gold-text"]!, light), resolveToken(light["color-whatsapp"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(dark["color-ink"]!, dark), resolveToken(dark["color-bg"]!, dark))).toBeGreaterThanOrEqual(4.5);
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
    const allowed = [TOKENS_CSS, path.resolve(ADMIN_SRC, "styles", "tokens.css"), MOBILE_THEME];
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC), ...walk(MOBILE_LIB)]) {
      if (allowed.includes(file) || file.endsWith(".test.ts")) continue;
      const content = fs.readFileSync(file, "utf8");
      for (const [index, line] of content.split("\n").entries()) {
        if (/#[\da-f]{6}\b/i.test(line)) offenders.push(`${path.relative(path.dirname(WEB_SRC), file)}:${index + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("migrates legacy palette utilities out of web and admin TSX", () => {
    const legacy = /(?:text|bg|border|ring|from|to|via|divide|fill|stroke)-(?:stone|emerald|amber|red|blue|gray|slate|zinc|neutral|yellow|green|orange|rose|sky|indigo)-\d+/;
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)].filter((item) => item.endsWith(".tsx"))) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => { if (legacy.test(line)) offenders.push(`${path.relative(path.dirname(WEB_SRC), file)}:${index + 1}: ${line.trim()}`); });
    }
    expect(offenders).toEqual([]);
  });

  it("never puts white text on a gold surface", () => {
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      for (const [index, line] of lines.entries()) {
        if (/bg-gold\b/.test(line) && /text-white/.test(line)) offenders.push(`${path.basename(file)}:${index + 1}`);
      }
    }
    for (const file of walk(MOBILE_LIB).filter((item) => item.endsWith(".dart"))) {
      const content = fs.readFileSync(file, "utf8");
      const goldWhite = /(?:backgroundColor|color)\s*:\s*AppColors\.gold\b[\s\S]{0,320}?TextStyle\([\s\S]{0,140}?color\s*:\s*Colors\.white\b/g;
      if (goldWhite.test(content)) offenders.push(path.relative(MOBILE_LIB, file));
    }
    expect(offenders).toEqual([]);
  });
});
