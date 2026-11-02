/**
 * JS mirror of tokens.css for contexts that cannot resolve CSS variables
 * (server-rendered OG images, standalone /verify page, MapLibre paint props).
 * ENFORCED: `tokens.test.ts` asserts every value here equals tokens.css —
 * tokens.css remains the single source of truth.
 */
export const TOKENS = {
  brand: "#16273B",
  brandDeep: "#0E1728",
  network: "#243553",
  gold: "#BDA77E",
  goldLight: "#E3D2A8",
  goldDark: "#8F7A52",
  onDark: "#E8E2D4",
  bg: "#FAFBFC",
  surface: "#FFFFFF",
  muted: "#687380",
  success: "#1B5E3A",
  successBg: "#EEF6F0",
  warn: "#8A5A12",
  warnBg: "#FDF6EA",
  danger: "#A32A22",
  dangerBg: "#FDF0EF",
  info: "#1F4E8C",
  infoBg: "#EDF2F9",
  neutral: "#17565F",
  neutralBg: "#ECF3F4",
  /** Functional integration colour (WhatsApp brand — not a Mantiq brand colour). */
  whatsapp: "#25D366",
} as const;
