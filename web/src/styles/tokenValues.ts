/**
 * CSS-variable references for consumers that need palette values.
 * tokens.css remains the sole source of the actual web/admin colours — this
 * module never carries a hex value, only `var(--…)` references.
 */
export const TOKENS = {
  brand: "var(--color-brand)",
  brandDeep: "var(--color-brand-deep)",
  network: "var(--color-network)",
  gold: "var(--color-gold)",
  goldLight: "var(--color-gold-light)",
  goldDark: "var(--color-gold-dark)",
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
  successBg: "var(--color-success-bg)",
  warn: "var(--color-warn)",
  warnBg: "var(--color-warn-bg)",
  danger: "var(--color-danger)",
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

/** The same CSS variables resolve to the dark palette when data-theme is dark. */
export const TOKENS_DARK = {
  bg: "var(--color-bg)",
  surface: "var(--color-surface)",
  ink: "var(--color-ink)",
  inkStrong: "var(--color-ink-strong)",
  muted: "var(--color-muted)",
  sidebar: "var(--color-sidebar)",
  network: "var(--color-network)",
  goldDark: "var(--color-gold-dark)",
  verified: "var(--color-verified)",
  success: "var(--color-success)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
  neutral: "var(--color-neutral)",
} as const;

/** Motion values are token references too; animations stay in CSS and Flutter's AppMotion. */
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

/**
 * The brand contract, in one place. tokens.css owns the CSS text; this is the
 * machine-checkable statement of "Mantiq navy + gold only", verified both
 * against tokens.css and against the Flutter mirror.
 */
export const BRAND = {
  navy: "#16273B",
  navyDeep: "#0E1728",
  gold: "#BDA77E",
} as const;

/** The only derived steps allowed, each with the reason it exists. */
export const DERIVED = {
  goldDark: "#86693C", // gold −1 step: 12–15px gold text / focus ring on light chrome
  goldLight: "#D8C7A4", // gold +1 step: gradients + gold on navy at hero sizes
  onDark: "#EDE9E0", // warm white for text on navy (12.49:1)
  bg: "#FAF9F5", // warm off-white canvas
  surface2: "#F3F0E9", // bg −1 step: chips, table headers
  muted: "#5B6472", // slate-navy secondary text (5.98:1 on white)
  network: "#1E3349", // navy +1: hover fill / raised navy surface
  darkSurface: "#17293F", // navy +1 on the dark canvas
  darkSurface2: "#1C3049",
  darkMuted: "#A3ADB9", // 6.48:1 on the dark surface
  info: "#1E4A7A", // navy-leaning blue: functional info only
  neutral: "#4A5666", // muted navy: functional neutral
} as const;
