#!/usr/bin/env node
/**
 * Aqar Rent — design-token generator.
 *
 * `design/tokens.json` is the ONLY source of colour/type/space/radius/shadow/
 * motion values. This script writes every consumer artefact from it:
 *
 *   web/src/styles/tokens.css        ┐ byte-identical
 *   admin/src/styles/tokens.css      ┘
 *   web/src/styles/tokenValues.ts
 *   mobile/lib/core/theme_generated.dart   (AppColors + AppMotion + AppShape)
 *   mobile/android/app/src/main/res/values/colors.xml
 *   mobile/android/app/src/main/res/values-night/colors.xml
 *
 * Usage:
 *   node scripts/build-tokens.mjs           # write
 *   node scripts/build-tokens.mjs --check   # verify artefacts are in sync (CI)
 *
 * Generation is deterministic (no timestamps, stable key order) so `--check`
 * is a plain byte comparison and `tokens.test.ts` can assert equality.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "design", "tokens.json");

const tokens = JSON.parse(fs.readFileSync(SRC, "utf8"));

/** Flutter/Dart identifiers: kebab → camelCase. */
const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Split an rgba()/hex value into Flutter's Color(0xAARRGGBB) form. */
function dartColor(value) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex) return `Color(0xFF${hex[1].toUpperCase()})`;
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgba) {
    const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map((v) => Math.round(Number(v)));
    const a = Math.round(Number(rgba[4] ?? 1) * 255);
    return `Color(0x${a.toString(16).toUpperCase().padStart(2, "0")}${[r, g, b]
      .map((v) => v.toString(16).toUpperCase().padStart(2, "0"))
      .join("")})`;
  }
  throw new Error(`cannot convert to a Dart colour: ${value}`);
}

/** Android res colours must be opaque #AARRGGBB; alpha is folded in. */
function androidColor(value) {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex) return `#FF${hex[1].toUpperCase()}`;
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (rgba) {
    const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map((v) => Math.round(Number(v)));
    const a = Math.round(Number(rgba[4] ?? 1) * 255);
    const h = (n) => n.toString(16).toUpperCase().padStart(2, "0");
    return `#${h(a)}${h(r)}${h(g)}${h(b)}`;
  }
  throw new Error(`cannot convert to an Android colour: ${value}`);
}

const BANNER_CSS = (extra = "") => `/* ============================================================================
 * Aqar Rent · design tokens — GENERATED FILE, DO NOT EDIT.
 * Source: design/tokens.json · Regenerate: node scripts/build-tokens.mjs
 * ----------------------------------------------------------------------------
 * Identity: Aqar Navy #16273B + Aqar Gold #BDA77E, and nothing else.
 * Every value here either comes from the brand kit or is an explicitly
 * derived step with the contrast reason recorded in design/tokens.json.
 * web/ and admin/ copies are byte-identical (enforced by tokens.test.ts).
${extra} * ==========================================================================*/`;

// ── CSS ─────────────────────────────────────────────────────────────────────
function buildCss() {
  const L = tokens.color.light;
  const D = tokens.color.dark;
  const lines = [];
  const push = (s) => lines.push(s);

  push(BANNER_CSS());
  push("");
  push(":root {");
  push("  /* ── Brand: two hues only ─────────────────────────────────────────────── */");
  for (const k of ["brand", "brand-deep", "network", "gold", "gold-light", "gold-dark", "gold-ink", "on-dark"]) {
    push(`  --color-${k}: ${L[k].value};`);
  }
  push("");
  push("  /* ── Surfaces ─────────────────────────────────────────────────────────── */");
  for (const k of ["bg-light", "surface", "surface-2", "muted", "border", "border-strong", "track", "focus"]) {
    push(`  --color-${k}: ${L[k].value};`);
  }
  push("  --color-bg: var(--color-bg-light);   /* legacy alias — bg is the canvas */");
  push("  --color-ink: var(--color-brand);");
  push(`  --color-ink-strong: ${L["ink-strong"].value};   /* headings; alias of brand-deep on light */`);
  push("  --color-gold-text: " + L["gold-text"].value + ";   /* label ON a gold button */");
  push("");
  push("  /* ── Navy chrome (sidebar, footer, dark hero) ─────────────────────────── */");
  for (const k of ["sidebar", "sidebar-text", "sidebar-active", "sidebar-active-bg", "sidebar-hover", "sidebar-muted"]) {
    push(`  --color-${k}: ${L[k].value};`);
  }
  push("");
  push("  /* ── Gold tints: decoration only, never a text colour ─────────────────── */");
  for (const k of ["gold-tint-8", "gold-tint-12", "gold-tint-14"]) push(`  --color-${k}: ${L[k].value};`);
  push("");
  push("  /* ── Verified = the gold trust mark ───────────────────────────────────── */");
  for (const k of ["verified", "verified-strong", "verified-bg", "verified-border"]) push(`  --color-${k}: ${L[k].value};`);
  push("  --color-verified-on-dark: var(--color-gold);");
  push("");
  push("  /* ── Functional status colours (never brand meaning) ──────────────────── */");
  for (const k of [
    "success", "success-fill", "success-bg",
    "warn", "warn-bg",
    "danger", "danger-fill", "danger-bg",
    "info", "info-bg",
    "neutral", "neutral-bg", "whatsapp",
  ]) push(`  --color-${k}: ${L[k].value};`);
  push("");
  push("  /* ── Imagery scrims ───────────────────────────────────────────────────── */");
  push(`  --color-hero-chip-bg: ${L["hero-chip-bg"].value};`);
  push(`  --color-hero-chip-border: ${L["verified-border"].value};`);
  push(`  --color-scrim: ${L.scrim.value};`);
  push("");
  push("  /* ── Brand gradient (logo + hero sheen) ───────────────────────────────── */");
  const g = tokens.color.brandKit.gradient.value;
  push(`  --gradient-gold: linear-gradient(135deg, ${g[0]} 0%, ${g[1]} 50%, ${g[2]} 100%);`);
  push(`  --gradient-gold-soft: linear-gradient(135deg, ${g[0]} 0%, ${g[1]} 100%);`);
  push("");
  push("  /* ── Typography ───────────────────────────────────────────────────────── */");
  push(`  --font-display: ${tokens.font.display.stack};`);
  push(`  --font-sans: ${tokens.font.sans.stack};`);
  push(`  --font-mono: ${tokens.font.mono.stack};`);
  push(`  --text-base-size: ${tokens.fontSize.base.value};`);
  push(`  --text-base-line: ${tokens.lineHeight.arabic.value};`);
  push(`  --tracking-tight: ${tokens.letterSpacing.tight.value};`);
  push(`  --tracking-eyebrow: ${tokens.letterSpacing.wide.value};`);
  for (const [k, v] of Object.entries(tokens.fontSize)) push(`  --text-${k}: ${v.value};`);
  push(`  --leading-heading: ${tokens.lineHeight.heading.value};`);
  push(`  --leading-tight: ${tokens.lineHeight.tight.value};`);
  push("");
  push("  /* ── Geometry ─────────────────────────────────────────────────────────── */");
  for (const [k, v] of Object.entries(tokens.radius)) {
    push(`  --radius-${k}: ${v.value};${k === "field" ? "   /* inputs, selects */" : ""}`);
  }
  push("  --radius-shell: var(--radius-sheet);   /* legacy alias */");
  push(`  --tap-min: ${tokens.shape["tap-min"].value};`);
  push(`  --tap-min-mobile: ${tokens.shape["tap-min-mobile"].value}px;`);
  push(`  --icon-stroke: ${tokens.shape["border-width-icon"].value};`);
  push("");
  push("  /* ── Elevation (navy-tinted, layered — never grey) ────────────────────── */");
  for (const k of ["card", "pop", "elevate", "image-text"]) push(`  --shadow-${k}: ${tokens.shadow[k].value};`);
  push("");
  push("  /* ── Motion: transform/opacity only, reduced-motion aware ─────────────── */");
  for (const [k, v] of Object.entries(tokens.motion)) push(`  --${k}: ${v.value};`);
  push("  --ease-spring: cubic-bezier(0.34, 1.3, 0.64, 1);");
  push("  --dur-instant: 80ms;");
  push("  --dur-hero: 900ms;");
  push("  --transition-card: var(--dur-base);");
  push("  --transition-fast: var(--dur-fast);");
  push("");
  push("  /* ── Spacing rhythm ───────────────────────────────────────────────────── */");
  let i = 1;
  for (const k of ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]) {
    push(`  --space-${i++}: ${tokens.space[k].value};`);
  }
  push("}");

  // ── dark ──
  const darkBlock = (selector, closing = "}") => {
    const out = [`${selector} {`, "  color-scheme: dark;"];
    for (const k of ["brand", "brand-deep", "network", "gold", "gold-light", "gold-dark", "gold-ink", "on-dark"]) {
      out.push(`  --color-${k}: ${D[k].value};`);
    }
    out.push(`  --color-bg-light: ${D["bg-light"].value};`);
    for (const k of ["surface", "surface-2", "muted", "border", "border-strong", "track", "focus"]) {
      out.push(`  --color-${k}: ${D[k].value};`);
    }
    out.push("  --color-ink: var(--color-on-dark);");
    out.push(`  --color-ink-strong: ${D["ink-strong"].value};   /* on-dark lifted for headings */`);
    out.push(`  --color-gold-text: ${D["gold-text"].value};`);
    for (const k of ["sidebar", "sidebar-text", "sidebar-active", "sidebar-active-bg", "sidebar-hover", "sidebar-muted"]) {
      out.push(`  --color-${k}: ${D[k].value};`);
    }
    for (const k of ["gold-tint-8", "gold-tint-12", "gold-tint-14"]) out.push(`  --color-${k}: ${D[k].value};`);
    for (const k of ["verified", "verified-strong", "verified-bg", "verified-border"]) out.push(`  --color-${k}: ${D[k].value};`);
    out.push(`  --color-verified-on-dark: ${D.verified.value};`);
    for (const k of [
      "success", "success-fill", "success-bg",
      "warn", "warn-bg",
      "danger", "danger-fill", "danger-bg",
      "info", "info-bg",
      "neutral", "neutral-bg", "whatsapp",
    ]) out.push(`  --color-${k}: ${D[k].value};`);
    out.push(`  --color-hero-chip-bg: ${D["hero-chip-bg"].value};`);
    out.push(`  --color-scrim: ${D.scrim.value};`);
    for (const k of ["card", "pop", "elevate"]) out.push(`  --shadow-${k}: ${tokens.shadow[`dark-${k}`].value};`);
    out.push(closing);
    return out;
  };

  push("");
  push("/* Legacy .dark class stays supported; data-theme is the public contract. */");
  lines.push(...darkBlock('.dark,\n:root[data-theme="dark"]'));
  push("");
  push("/* System preference, unless the visitor explicitly picked a theme. */");
  push("@media (prefers-color-scheme: dark) {");
  lines.push(...darkBlock('  :root:not([data-theme="light"]):not(.light)', "  }"));
  push("}");
  push("");
  return lines.join("\n");
}

// ── tokenValues.ts ──────────────────────────────────────────────────────────
function buildTokenValues() {
  const L = tokens.color.light;
  const obj = (pairs) =>
    pairs.map(([key, cssVar]) => `  ${key}: "var(${cssVar})",`).join("\n");
  const colorKeys = [
    ["brand", "--color-brand"], ["brandDeep", "--color-brand-deep"], ["network", "--color-network"],
    ["gold", "--color-gold"], ["goldLight", "--color-gold-light"], ["goldDark", "--color-gold-dark"],
    ["goldInk", "--color-gold-ink"], ["goldText", "--color-gold-text"], ["onDark", "--color-on-dark"],
    ["focus", "--color-focus"], ["bg", "--color-bg"], ["surface", "--color-surface"],
    ["surface2", "--color-surface-2"], ["ink", "--color-ink"], ["inkStrong", "--color-ink-strong"],
    ["muted", "--color-muted"], ["border", "--color-border"], ["borderStrong", "--color-border-strong"],
    ["verified", "--color-verified"], ["verifiedStrong", "--color-verified-strong"],
    ["verifiedBg", "--color-verified-bg"], ["verifiedBorder", "--color-verified-border"],
    ["verifiedOnDark", "--color-verified-on-dark"],
    ["success", "--color-success"], ["successFill", "--color-success-fill"], ["successBg", "--color-success-bg"],
    ["warn", "--color-warn"], ["warnBg", "--color-warn-bg"],
    ["danger", "--color-danger"], ["dangerFill", "--color-danger-fill"], ["dangerBg", "--color-danger-bg"],
    ["info", "--color-info"], ["infoBg", "--color-info-bg"],
    ["neutral", "--color-neutral"], ["neutralBg", "--color-neutral-bg"],
    ["whatsapp", "--color-whatsapp"],
    ["sidebar", "--color-sidebar"], ["sidebarActive", "--color-sidebar-active"], ["scrim", "--color-scrim"],
  ];
  const motionKeys = [
    ["easeOut", "--ease-out"], ["easeInOut", "--ease-in-out"], ["easeSpring", "--ease-spring"],
    ["instant", "--dur-instant"], ["fast", "--dur-fast"], ["base", "--dur-base"],
    ["slow", "--dur-slow"], ["hero", "--dur-hero"], ["stagger", "--stagger"], ["rise", "--rise"],
  ];
  const derived = Object.entries(L)
    .filter(([, v]) => v.derived)
    .map(([k, v]) => `  ${camel(k)}: "${v.value}", // ${v.note ?? "derived"}`)
    .join("\n");

  return `/**
 * GENERATED FILE — do not edit. Source: design/tokens.json
 * Regenerate: node scripts/build-tokens.mjs
 *
 * CSS-variable references for consumers that need palette values. Never carries
 * a hex of its own; tokens.css owns the values.
 */
export const TOKENS = {
${obj(colorKeys)}
} as const;

/** The same variables resolve to the dark palette under [data-theme="dark"]. */
export const TOKENS_DARK = {
${obj([
    ["bg", "--color-bg"], ["surface", "--color-surface"], ["ink", "--color-ink"],
    ["inkStrong", "--color-ink-strong"], ["muted", "--color-muted"], ["sidebar", "--color-sidebar"],
    ["network", "--color-network"], ["gold", "--color-gold"], ["goldDark", "--color-gold-dark"],
    ["verified", "--color-verified"], ["success", "--color-success"], ["warn", "--color-warn"],
    ["danger", "--color-danger"], ["info", "--color-info"], ["neutral", "--color-neutral"],
  ])}
} as const;

/** Motion values are token references too. */
export const MOTION = {
${obj(motionKeys)}
} as const;

/** The brand contract: two hues. */
export const BRAND = {
  navy: "${L.brand.value}",
  navyDeep: "${L["brand-deep"].value}",
  gold: "${L.gold.value}",
} as const;

/** Every derived step, with its reason. Nothing else may be invented. */
export const DERIVED = {
${derived}
} as const;
`;
}

// ── Flutter ─────────────────────────────────────────────────────────────────
function buildFlutter() {
  const L = tokens.color.light;
  const D = tokens.color.dark;
  const hex = (v, obj) => dartColor(obj[v].value);

  // Explicit name map: the Dart constant name → the token key. Written out so
  // the generated mirror is stable, greppable and collision-free (a blanket
  // kebab→camel dump produced duplicate `darkBorder`/`onDark` identifiers).
  const LIGHT = [
    ["brand", "brand"], ["brandDeep", "brand-deep"], ["network", "network"],
    ["gold", "gold"], ["goldLight", "gold-light"], ["goldDark", "gold-dark"],
    ["goldInk", "gold-ink"], ["onDark", "on-dark"], ["goldText", "gold-text"],
    ["bg", "bg-light"], ["surface", "surface"], ["surface2", "surface-2"],
    ["muted", "muted"], ["border", "border"], ["borderStrong", "border-strong"],
    ["track", "track"], ["focus", "focus"],
    ["verified", "verified"], ["verifiedStrong", "verified-strong"],
    ["verifiedBg", "verified-bg"], ["verifiedBorder", "verified-border"],
    ["sidebar", "sidebar"], ["sidebarText", "sidebar-text"], ["sidebarActive", "sidebar-active"],
    ["sidebarActiveBg", "sidebar-active-bg"], ["sidebarHover", "sidebar-hover"], ["sidebarMuted", "sidebar-muted"],
    ["goldTint8", "gold-tint-8"], ["goldTint12", "gold-tint-12"], ["goldTint14", "gold-tint-14"],
    ["success", "success"], ["successFill", "success-fill"], ["successBg", "success-bg"],
    ["warn", "warn"], ["warnBg", "warn-bg"],
    ["danger", "danger"], ["dangerFill", "danger-fill"], ["dangerBg", "danger-bg"],
    ["info", "info"], ["infoBg", "info-bg"], ["neutral", "neutral"], ["neutralBg", "neutral-bg"],
    ["whatsapp", "whatsapp"], ["heroChipBg", "hero-chip-bg"], ["scrim", "scrim"],
  ];
  const DARK = [
    ["darkBrand", "brand"], ["darkBrandDeep", "brand-deep"], ["darkNetwork", "network"],
    ["darkGold", "gold"], ["darkGoldLight", "gold-light"], ["darkGoldInk", "gold-ink"],
    ["darkBg", "bg-light"], ["darkSurface", "surface"], ["darkSurface2", "surface-2"],
    ["darkMuted", "muted"], ["darkBorder", "border"], ["darkBorderStrong", "border-strong"],
    ["darkTrack", "track"], ["darkFocus", "focus"],
    ["darkVerified", "verified"], ["darkVerifiedBg", "verified-bg"], ["darkVerifiedBorder", "verified-border"],
    ["darkSidebar", "sidebar"], ["darkSidebarActive", "sidebar-active"],
    ["darkGoldTint8", "gold-tint-8"], ["darkGoldTint12", "gold-tint-12"], ["darkGoldTint14", "gold-tint-14"],
    ["darkSuccess", "success"], ["darkSuccessFill", "success-fill"], ["darkSuccessBg", "success-bg"],
    ["darkWarn", "warn"], ["darkWarnBg", "warn-bg"],
    ["darkDanger", "danger"], ["darkDangerFill", "danger-fill"], ["darkDangerBg", "danger-bg"],
    ["darkInfo", "info"], ["darkInfoBg", "info-bg"], ["darkNeutral", "neutral"], ["darkNeutralBg", "neutral-bg"],
    ["darkScrim", "scrim"],
  ];

  const rows = (pairs, src, prefix = "") =>
    pairs.map(([name, key]) => `  static const Color ${name} = ${hex(key, src)};`).join("\n");

  const motionRows = Object.entries(tokens.motion)
    .map(([k, v]) => {
      if (v.value.endsWith("ms")) return `  static const Duration ${camel(k)} = Duration(milliseconds: ${parseInt(v.value, 10)});`;
      if (/^-?[\d.]+px$/.test(v.value)) return `  static const double ${camel(k)} = ${parseFloat(v.value)};`;
      return `  static const String ${camel(k)} = "${v.value}";`;
    })
    .join("\n");

  const radiusRows = Object.entries(tokens.radius)
    .map(([k, v]) => `  static const double radius${camel(k)[0].toUpperCase()}${camel(k).slice(1)} = ${parseFloat(v.value)};`)
    .join("\n");

  return `// GENERATED FILE — do not edit. Source: design/tokens.json
// Regenerate: node scripts/build-tokens.mjs
//
// The Flutter mirror of the web palette: identical values, identical token
// names. Every derived step is documented in design/tokens.json with the
// contrast reason it exists.

import 'dart:ui' show Color;

/// Palette — light values first, then the dark set (same token names).
class AppColors {
  AppColors._();

  // ── light ──
${rows(LIGHT, L)}

  // ── dark ──
${rows(DARK, D)}

  /// Brand gradient: light → gold → dark, top-inline-start → bottom-inline-end.
  static const List<Color> goldGradient = <Color>[
    Color(0xFF${tokens.color.brandKit.gradient.value[0].slice(1)}),
    Color(0xFF${tokens.color.brandKit.gradient.value[1].slice(1)}),
    Color(0xFF${tokens.color.brandKit.gradient.value[2].slice(1)}),
  ];

  // ── aliases used across screens (each is a token, never a new colour) ──
  static const Color ink = brand;
  static const Color inkStrong = brandDeep;
  static const Color darkInk = onDark;
  static const Color darkInkStrong = Color(0xFFF7F4EE); // on-dark lifted for headings
  static const Color darkGoldText = gold;
  static const Color darkGoldTint = darkGoldTint14;
  static const Color scrimColor = scrim;
  static const Color overlayScrim = Color(0xBF0E1728);
  static const Color overlayMid = Color(0x660E1728);
  static const Color shadowSoft = Color(0x330E1728); // navy-tinted, never grey
}

/// Motion — meaning-driven, transform/opacity only.
class AppMotion {
  AppMotion._();

${motionRows}

  static const Curve easeOutCurve = Cubic(0.22, 1, 0.36, 1);
  static const Curve easeInOutCurve = Cubic(0.65, 0, 0.35, 1);
  static const Curve easeSpringCurve = Cubic(0.34, 1.3, 0.64, 1);
  static const Duration instant = Duration(milliseconds: 80);
  static const Duration hero = Duration(milliseconds: 900);
}

/// Geometry — one radius language across web, admin and mobile.
class AppShape {
  AppShape._();

${radiusRows}

  static const double markRadius = ${parseFloat(tokens.radius.mark.value)};
  static const double tapMin = ${tokens.shape["tap-min-mobile"].value}; // Material minimum
  static const double iconStroke = ${tokens.shape["border-width-icon"].value};
  static const double gutter = 16;
}
`;
}

// ── Android ─────────────────────────────────────────────────────────────────
function buildAndroid(dark = false) {
  const src = dark ? tokens.color.dark : tokens.color.light;
  const rows = Object.entries(src)
    .map(([k, v]) => `  <color name="${k.replace(/-/g, "_")}">${androidColor(v.value)}</color>`)
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED FILE — do not edit. Source: design/tokens.json
     Regenerate: node scripts/build-tokens.mjs -->
<resources>
${rows}
</resources>
`;
}

// ── write / check ───────────────────────────────────────────────────────────
const ARTEFACTS = [
  ["web/src/styles/tokens.css", buildCss()],
  ["admin/src/styles/tokens.css", buildCss()],
  ["web/src/styles/tokenValues.ts", buildTokenValues()],
  ["mobile/lib/core/theme_generated.dart", buildFlutter()],
  ["mobile/android/app/src/main/res/values/colors.xml", buildAndroid(false)],
  ["mobile/android/app/src/main/res/values-night/colors.xml", buildAndroid(true)],
];

const check = process.argv.includes("--check");
let drift = 0;
for (const [rel, content] of ARTEFACTS) {
  const abs = path.join(ROOT, rel);
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (check) {
    if (current !== content) {
      console.error(`✗ out of sync: ${rel}`);
      drift += 1;
    }
  } else if (current !== content) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    console.log(`✓ ${rel}`);
  } else {
    console.log(`= ${rel} (unchanged)`);
  }
}

if (check) {
  if (drift) {
    console.error(`\n${drift} artefact(s) out of date — run: node scripts/build-tokens.mjs`);
    process.exit(1);
  }
  console.log(`✓ all ${ARTEFACTS.length} token artefacts in sync`);
}
