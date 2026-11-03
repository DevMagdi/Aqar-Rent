/**
 * JS mirror of tokens.css for non-CSS consumers (OG image, MapLibre paints,
 * standalone /verify page, e2e assertions).
 * ENFORCED: tokens.test.ts asserts byte-level equality with tokens.css
 * (light + dark) and with mobile/lib/core/theme.dart — tokens.css remains
 * the single source of truth.
 */
export const TOKENS = {
  brand: "#0F1C2E",
  brandDeep: "#0B1220",
  network: "#1D2D45",
  gold: "#C9A86C",
  goldLight: "#E7D6AF",
  goldDark: "#9C814E",
  onDark: "#EAE7E0",
  teal: "#0D9488",
  tealInk: "#0B726A",
  tealBg: "#E6F5F3",
  tealOnDark: "#2DD4BF",
  bg: "#F8F7F4",
  surface: "#FFFFFF",
  muted: "#5C6570",
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
  whatsapp: "#25D366",
} as const;

/** Dark-mode overrides (tokens.css `.dark` block). */
export const TOKENS_DARK = {
  bg: "#0B1220",
  surface: "#141C2B",
  ink: "#E9EDF5",
  inkStrong: "#F5F8FC",
  muted: "#9AA4B4",
  sidebar: "#101A2C",
  network: "#223149",
  goldDark: "#D9BE87",
  teal: "#2DD4BF",
  tealInk: "#2DD4BF",
  success: "#5CD6A0",
  warn: "#E9B44C",
  danger: "#F28B82",
  info: "#8AB8EC",
  neutral: "#7FC9D6",
} as const;
