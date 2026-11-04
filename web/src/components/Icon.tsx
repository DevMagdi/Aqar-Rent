// One inline SVG set for the whole app.
//
// Emoji are never used as UI icons: they render as tofu in headless/Linux
// Chromium, follow the OS emoji font (so they can't take a brand colour) and
// screen readers announce them inconsistently. These 1.7px stroke paths
// inherit `currentColor`, so every icon is token-driven and theme-aware.
export type IconName =
  | "pin"
  | "lock"
  | "key"
  | "user"
  | "home"
  | "building"
  | "link"
  | "flag"
  | "phone"
  | "scale"
  | "download"
  | "image"
  | "bed"
  | "bath"
  | "check"
  | "close"
  | "star"
  | "heart"
  | "warn"
  | "ban";

const PATHS: Record<IconName, string> = {
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.6a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z",
  lock: "M6.5 10.5h11v9h-11zM8.8 10.5V8a3.2 3.2 0 0 1 6.4 0v2.5",
  key: "M15.5 8.5a3.5 3.5 0 1 1-3.1 5.1L4 22H2v-3h2v-2h2v-2h2.4A3.5 3.5 0 0 1 15.5 8.5Z",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4.5 21a7.5 7.5 0 0 1 15 0",
  home: "M4 11.2 12 4l8 7.2V20h-5.4v-5.2H9.4V20H4z",
  building: "M4 3h10v18H4zM14 9h6v12h-6M7 7h4M7 11h4M7 15h4M17 13h1M17 17h1",
  link: "M9.4 14.6a3.5 3.5 0 0 1 0-4.9l2.6-2.6a3.5 3.5 0 0 1 4.9 4.9l-1.3 1.3M14.6 9.4a3.5 3.5 0 0 1 0 4.9l-2.6 2.6a3.5 3.5 0 0 1-4.9-4.9l1.3-1.3",
  flag: "M5.5 21V4M5.5 5h11l-1.6 3.5L16.5 12h-11",
  phone: "M6.2 3.5h3l1.5 4-2 1.4a11 11 0 0 0 5 5l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.2 5.7 2 2 0 0 1 6.2 3.5Z",
  scale: "M12 4v16M7 20h10M6 8h12M12 5.2 6 8l-2.6 5.2a3.4 3.4 0 0 0 6.8 0L6 8m12 0-3.6 5.2a3.4 3.4 0 0 0 6.8 0L18 8",
  download: "M12 4v11m0 0 4.2-4.2M12 15l-4.2-4.2M5 19h14",
  image: "M4 5h16v14H4zM4 15l4.5-4.2 3.4 3.1L15 11l5 4.6M15.5 8.6a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z",
  bed: "M3 18v-9m0 5h18v4M8.5 11.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM14 11V8.5h5.2A2.8 2.8 0 0 1 22 11v3",
  bath: "M4 12h15.5v2.6a5.4 5.4 0 0 1-5.4 5.4H9.4A5.4 5.4 0 0 1 4 14.6zM6.5 12V6.6a2.6 2.6 0 0 1 4.6-1.6M7 20l-1 1.5M17 20l1 1.5",
  check: "M4.5 12.5 9 17l10.5-10.5",
  close: "M6 6l12 12M18 6 6 18",
  star: "m12 4 2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8z",
  heart: "M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z",
  warn: "M12 4.5 21 19.5H3zM12 10v4.2M12 17v.1",
  ban: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM7.2 7.2l9.6 9.6",
};

export function Icon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
