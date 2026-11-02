/**
 * Design-system compliance (premium tokens) — runs in the normal vitest CI.
 *
 * 1. tokens.css is the single source of truth: tokenValues.ts mirrors light+dark.
 * 2. admin tokens.css is byte-identical to web tokens.css.
 * 3. mobile theme.dart carries the SAME core colours (unified identity).
 * 4. Zero hard-coded hex in TS/TSX/Dart outside the token files.
 * 5. No white text on gold · gold-dark limited to large text/graphics.
 * 6. Locked palette values (spec) + AA-critical spot checks.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOKENS, TOKENS_DARK } from "./tokenValues";

const WEB_SRC = path.resolve(__dirname, "..");
const ADMIN_SRC = path.resolve(WEB_SRC, "../../admin/src");
const MOBILE_LIB = path.resolve(WEB_SRC, "../../mobile/lib");
const TOKENS_CSS = path.resolve(__dirname, "tokens.css");
const MOBILE_THEME = path.resolve(MOBILE_LIB, "core/theme.dart");

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

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

function readBlocks(): { light: Record<string, string>; dark: Record<string, string> } {
  const css = fs.readFileSync(TOKENS_CSS, "utf8");
  const parse = (block: string) => {
    const map: Record<string, string> = {};
    for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) map[m[1]!] = m[2]!.trim();
    return map;
  };
  const darkIdx = css.indexOf(".dark {");
  if (darkIdx < 0) throw new Error("tokens.css must contain a .dark block");
  return { light: parse(css.slice(0, darkIdx)), dark: parse(css.slice(darkIdx)) };
}

describe("premium Mantiq tokens", () => {
  const { light, dark } = readBlocks();

  it("locked palette (spec) — light", () => {
    expect(light["color-brand"]).toBe("#0F1C2E");
    expect(light["color-brand-deep"]).toBe("#0B1220");
    expect(light["color-gold"]).toBe("#C9A86C");
    expect(light["color-teal"]).toBe("#0D9488");
    expect(light["color-bg"]).toBe("#F8F7F4");
    expect(light["color-surface"]).toBe("#FFFFFF");
    expect(light["color-muted"]).toBe("#5C6570");
    expect(light["font-sans"]).toContain("IBM Plex Sans Arabic");
    expect(light["text-base-size"]).toBe("15px");
    expect(light["radius-card"]).toBe("22px");
    expect(light["radius-field"]).toBe("14px");
    expect(light["radius-pill"]).toBe("999px");
  });

  it("locked palette (spec) — dark", () => {
    expect(dark["color-bg"]).toBe("#0B1220");
    expect(dark["color-surface"]).toBe("#141C2B");
  });

  it("tokenValues.ts mirrors light tokens exactly", () => {
    for (const [key, value] of Object.entries(TOKENS)) {
      const varName = `color-${kebab(key)}`;
      expect(light[varName], `tokens.css must define --${varName}`).toBe(value);
    }
  });

  it("TOKENS_DARK mirrors the .dark block exactly", () => {
    for (const [key, value] of Object.entries(TOKENS_DARK)) {
      const varName = `color-${kebab(key)}`;
      expect(dark[varName], `.dark must define --${varName}`).toBe(value);
    }
  });

  it("admin tokens.css is byte-identical to web tokens.css", () => {
    const admin = fs.readFileSync(path.resolve(ADMIN_SRC, "styles", "tokens.css"), "utf8");
    expect(admin, "admin/src/styles/tokens.css must mirror web tokens.css").toBe(fs.readFileSync(TOKENS_CSS, "utf8"));
  });

  it("mobile theme.dart carries the same unified identity colours", () => {
    const dart = fs.readFileSync(MOBILE_THEME, "utf8");
    const toDart = (hex: string) => `0xFF${hex.replace("#", "").toUpperCase()}`;
    for (const [label, value] of Object.entries({
      brand: TOKENS.brand,
      brandDeep: TOKENS.brandDeep,
      gold: TOKENS.gold,
      bg: TOKENS.bg,
      surface: TOKENS.surface,
      muted: TOKENS.muted,
      teal: TOKENS.teal,
      darkBg: TOKENS_DARK.bg,
      darkSurface: TOKENS_DARK.surface,
    })) {
      expect(dart, `theme.dart must define ${label} = ${value}`).toContain(toDart(value));
    }
    // no terracotta / old orange anywhere in mobile
    const offenders = walk(MOBILE_LIB)
      .filter((f) => !f.endsWith("theme.dart"))
      .filter((f) => /0xFF(A93408|C2410C|8A2A06|E76F51)/i.test(fs.readFileSync(f, "utf8")));
    expect(offenders, `old terracotta/orange left in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("text-gold-dark stays limited to WCAG large-text accents", () => {
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if (/text-gold-dark/.test(line) && !line.includes("listing-price")) {
          offenders.push(`${path.basename(file)}:${i + 1}`);
        }
      }
    }
    expect(offenders, `text-gold-dark at normal size (fails AA on white):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("zero hard-coded hex colours outside the token files", () => {
    const allowed = [
      path.join(WEB_SRC, "styles", "tokenValues.ts"),
      path.join(WEB_SRC, "styles", "tokens.css"),
      path.join(ADMIN_SRC, "styles", "tokens.css"),
      MOBILE_THEME,
    ];
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC), ...walk(MOBILE_LIB)]) {
      if (allowed.includes(file) || file.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if (/#[0-9a-fA-F]{6}\b/.test(line) || /\b0xFF[0-9A-F]{6}\b/.test(line)) {
          offenders.push(`${path.relative(path.dirname(WEB_SRC), file)}:${i + 1}`);
        }
      }
    }
    expect(offenders, `move these into a token file:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no white text on gold surfaces", () => {
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if ((/bg-gold\b|bg-brand-600|bg-brand-700/.test(line)) && /text-white/.test(line)) {
          offenders.push(`${path.basename(file)}:${i + 1}`);
        }
      }
    }
    expect(offenders, `gold surfaces with white text:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("legacy brand text classes are gone", () => {
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if (/text-brand-(500|600|700)\b/.test(line)) offenders.push(`${path.basename(file)}:${i + 1}`);
      }
    }
    expect(offenders, `use text-ink / text-gold-dark(large only):\n${offenders.join("\n")}`).toEqual([]);
  });
});
