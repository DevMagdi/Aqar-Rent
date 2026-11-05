/**
 * GENERATED FILE — do not edit. Source: design/tokens.json
 * Regenerate: node scripts/build-tokens.mjs
 *
 * CSS-variable references for consumers that need palette values. Never carries
 * a hex of its own; tokens.css owns the values.
 */
export const TOKENS = {
  brand: "var(--color-brand)",
  brandDeep: "var(--color-brand-deep)",
  network: "var(--color-network)",
  gold: "var(--color-gold)",
  goldLight: "var(--color-gold-light)",
  goldDark: "var(--color-gold-dark)",
  goldInk: "var(--color-gold-ink)",
  goldText: "var(--color-gold-text)",
  onDark: "var(--color-on-dark)",
  focus: "var(--color-focus)",
  bg: "var(--color-bg)",
  surface: "var(--color-surface)",
  surface2: "var(--color-surface-2)",
  ink: "var(--color-ink)",
  inkStrong: "var(--color-ink-strong)",
  muted: "var(--color-muted)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  verified: "var(--color-verified)",
  verifiedStrong: "var(--color-verified-strong)",
  verifiedBg: "var(--color-verified-bg)",
  verifiedBorder: "var(--color-verified-border)",
  verifiedOnDark: "var(--color-verified-on-dark)",
  success: "var(--color-success)",
  successFill: "var(--color-success-fill)",
  successBg: "var(--color-success-bg)",
  warn: "var(--color-warn)",
  warnBg: "var(--color-warn-bg)",
  danger: "var(--color-danger)",
  dangerFill: "var(--color-danger-fill)",
  dangerBg: "var(--color-danger-bg)",
  info: "var(--color-info)",
  infoBg: "var(--color-info-bg)",
  neutral: "var(--color-neutral)",
  neutralBg: "var(--color-neutral-bg)",
  whatsapp: "var(--color-whatsapp)",
  sidebar: "var(--color-sidebar)",
  sidebarActive: "var(--color-sidebar-active)",
  scrim: "var(--color-scrim)",
} as const;

/** The same variables resolve to the dark palette under [data-theme="dark"]. */
export const TOKENS_DARK = {
  bg: "var(--color-bg)",
  surface: "var(--color-surface)",
  ink: "var(--color-ink)",
  inkStrong: "var(--color-ink-strong)",
  muted: "var(--color-muted)",
  sidebar: "var(--color-sidebar)",
  network: "var(--color-network)",
  gold: "var(--color-gold)",
  goldDark: "var(--color-gold-dark)",
  verified: "var(--color-verified)",
  success: "var(--color-success)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
  neutral: "var(--color-neutral)",
} as const;

/** Motion values are token references too. */
export const MOTION = {
  easeOut: "var(--ease-out)",
  easeInOut: "var(--ease-in-out)",
  easeSpring: "var(--ease-spring)",
  instant: "var(--dur-instant)",
  fast: "var(--dur-fast)",
  base: "var(--dur-base)",
  slow: "var(--dur-slow)",
  hero: "var(--dur-hero)",
  stagger: "var(--stagger)",
  rise: "var(--rise)",
} as const;

/** The brand contract: two hues. */
export const BRAND = {
  navy: "#16273B",
  navyDeep: "#0E1728",
  gold: "#BDA77E",
} as const;

/** Every derived step, with its reason. Nothing else may be invented. */
export const DERIVED = {
  goldInk: "#6F5D3A", // DERIVED (contrast only): gold that is readable as text on light = 5.96:1 on #FFFFFF, 5.62:1 on bg-light
  bgLight: "#F7F5F0", // DERIVED from #E8E2D4: warm page canvas
  surface2: "#EFEBE1", // DERIVED from #E8E2D4: chips, table headers, inset panels
  inkStrong: "#0E1728", // alias of brand-deep — headings on light
  muted: "#5B6472", // DERIVED (contrast only): slate-navy secondary text = 5.98:1 on white, 5.62:1 on bg-light
  border: "rgba(22, 39, 59, 0.10)", // DERIVED: Navy at 10%
  borderStrong: "rgba(22, 39, 59, 0.16)", // DERIVED: Navy at 16%
  track: "rgba(22, 39, 59, 0.07)", // DERIVED: Navy at 7% — skeletons and progress tracks
  focus: "#6F5D3A", // DERIVED: = gold-ink, 5.96:1 ring on light chrome
  verified: "#6F5D3A", // DERIVED: the trust mark is gold, readable on light (5.96:1)
  verifiedBg: "rgba(189, 167, 126, 0.18)", // DERIVED: Gold at 18%, decoration only
  verifiedBorder: "rgba(111, 93, 58, 0.42)", // DERIVED: gold-ink at 42%
  sidebarActiveBg: "rgba(189, 167, 126, 0.14)", // DERIVED: Gold at 14%
  sidebarMuted: "rgba(232, 226, 212, 0.64)", // DERIVED: on-dark at 64%
  goldTint8: "rgba(189, 167, 126, 0.08)", // derived
  goldTint12: "rgba(189, 167, 126, 0.12)", // derived
  goldTint14: "rgba(189, 167, 126, 0.14)", // derived
  successBg: "#EAF3ED", // functional tint
  warnBg: "#FBF3E4", // derived
  dangerBg: "#FBEEED", // derived
  infoBg: "#ECF1F8", // derived
  neutralBg: "#EEF1F4", // derived
  whatsapp: "#25D366", // INTEGRATION: official WhatsApp green, used on that button only
  heroChipBg: "rgba(14, 23, 40, 0.42)", // scrim over hero imagery
  scrim: "rgba(14, 23, 40, 0.58)", // image overlay that guarantees text contrast
} as const;
