/**
 * Design-system compliance (Mantiq / ADR-034) — runs in the normal vitest CI.
 *
 * 1. tokens.css is the single source of truth: tokenValues.ts must mirror it.
 * 2. Zero hard-coded hex colours in TS/TSX outside tokens.css/tokenValues.ts.
 * 3. No white text on gold surfaces (spec: text on gold = Deep Navy).
 * 4. No gold used as body text classes outside the dark-chrome allowlist.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOKENS } from "./tokenValues";

const WEB_SRC = path.resolve(__dirname, "..");
const ADMIN_SRC = path.resolve(WEB_SRC, "../../admin/src");
const TOKENS_CSS = path.resolve(__dirname, "tokens.css");

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function readTokensCss(): Record<string, string> {
  const css = fs.readFileSync(TOKENS_CSS, "utf8");
  const map: Record<string, string> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    map[m[1]!] = m[2]!.trim();
  }
  return map;
}

describe("Mantiq tokens", () => {
  it("tokenValues.ts mirrors tokens.css exactly (single source of truth)", () => {
    const css = readTokensCss();
    for (const [key, value] of Object.entries(TOKENS)) {
      const varName = `color-${kebab(key)}`;
      expect(css[varName], `tokens.css must define --${varName}`).toBe(value);
    }
    // canonical palette spot-checks straight from the spec
    expect(css["color-brand"]).toBe("#16273B");
    expect(css["color-brand-deep"]).toBe("#0E1728");
    expect(css["color-network"]).toBe("#243553");
    expect(css["color-gold"]).toBe("#BDA77E");
    expect(css["color-gold-light"]).toBe("#E3D2A8");
    expect(css["color-gold-dark"]).toBe("#8F7A52");
    expect(css["color-on-dark"]).toBe("#E8E2D4");
    expect(css["color-bg"]).toBe("#FAFBFC");
    expect(css["color-muted"]).toBe("#687380");
    expect(css["color-success"]).toBe("#1B5E3A");
    expect(css["color-danger"]).toBe("#A32A22");
    expect(css["font-sans"]).toContain("IBM Plex Sans Arabic");
    expect(css["radius-card"]).toBe("18px");
    expect(css["radius-field"]).toBe("12px");
  });

  it("admin tokens.css is byte-identical to web tokens.css", () => {
    const admin = fs.readFileSync(path.resolve(ADMIN_SRC, "styles", "tokens.css"), "utf8");
    const web = fs.readFileSync(TOKENS_CSS, "utf8");
    expect(admin, "admin/src/styles/tokens.css must mirror web tokens.css exactly").toBe(web);
  });

  it("text-gold-dark stays limited to WCAG large-text accents", () => {
    // #8F7A52 on white ≈4.1:1 → legal only for ≥24px bold text (the price);
    // normal-size text must use ink/navy, indicators on light use it as graphics.
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
    const allowed = [path.join(WEB_SRC, "styles", "tokenValues.ts")];
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)]) {
      if (allowed.includes(file) || file.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        // whatsapp green is permitted only via the bg-whatsapp utility (checked separately)
        if (/#[0-9a-fA-F]{6}\b/.test(line)) {
          offenders.push(`${path.relative(path.dirname(WEB_SRC), file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders, `move these hex values into tokens.css/tokenValues.ts:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no white text on gold surfaces (buttons flip to Deep Navy)", () => {
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

  it("legacy brand text classes are gone (links use gold-dark / ink)", () => {
    const offenders: string[] = [];
    for (const file of [...walk(WEB_SRC), ...walk(ADMIN_SRC)]) {
      if (file.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if (/text-brand-(500|600|700)\b/.test(line)) {
          offenders.push(`${path.basename(file)}:${i + 1}`);
        }
      }
    }
    expect(offenders, `use text-gold-dark (accent) or text-ink (body) instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
