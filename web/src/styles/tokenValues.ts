/**
 * CSS-variable references for consumers that need palette values.
 * tokens.css remains the sole source of the actual web/admin colors.
 */
export const TOKENS = {
  brand: "var(--color-brand)",
  brandDeep: "var(--color-brand-deep)",
  network: "var(--color-network)",
  gold: "var(--color-gold)",
  goldLight: "var(--color-gold-light)",
  goldDark: "var(--color-gold-dark)",
  onDark: "var(--color-on-dark)",
  teal: "var(--color-teal)",
  tealInk: "var(--color-teal-ink)",
  tealBg: "var(--color-teal-bg)",
  tealOnDark: "var(--color-teal-on-dark)",
  bg: "var(--color-bg)",
  surface: "var(--color-surface)",
  muted: "var(--color-muted)",
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
  teal: "var(--color-teal)",
  tealInk: "var(--color-teal-ink)",
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
