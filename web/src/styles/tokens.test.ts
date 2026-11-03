/** Unified palette contract: CSS owns web/admin colors; mobile mirrors those values. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOKENS, TOKENS_DARK } from "./tokenValues";

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

function rgb(value: string): [number, number, number] {
  const normalized = value.trim();
  if (normalized.startsWith("#")) {
    const digits = normalized.slice(1);
    return [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16)) as [number, number, number];
  }
  const values = normalized.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!values || values.length !== 3) throw new Error(`Unsupported palette value: ${value}`);
  return values as [number, number, number];
}

function luminance(color: string): number {
  const channels = rgb(color).map((channel) => channel / 255).map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
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

  it("uses navy text on gold and preserves WCAG AA contrast for core text pairs", () => {
    expect(light["color-gold-text"]).toBe(light["color-brand"]);
    expect(contrast(resolveToken(light["color-gold-text"]!, light), resolveToken(light["color-gold"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-ink"]!, light), resolveToken(light["color-bg"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-brand"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-success-fill"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-on-dark"]!, light), resolveToken(light["color-danger-fill"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(light["color-gold-text"]!, light), resolveToken(light["color-whatsapp"]!, light))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(resolveToken(dark["color-ink"]!, dark), resolveToken(dark["color-bg"]!, dark))).toBeGreaterThanOrEqual(4.5);
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

  it("never puts white text on a gold surface", () => {
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      for (const [index, line] of fs.readFileSync(file, "utf8").split("\n").entries()) {
        if (/bg-gold\b/.test(line) && /text-white/.test(line)) offenders.push(`${path.basename(file)}:${index + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
