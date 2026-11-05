/**
 * The Aqar Rent brand mark — the brand-kit geometry, drawn once.
 *
 * Hexagon (`24,2 43,13 43,35 24,46 5,35 5,13` on a 48 viewBox) filled with the
 * gold gradient, with the house roof, the house body and the keyhole cut out of
 * it as **negative space**. That is exactly what
 * `brand/Aqar-Rent-Brand-Kit/01-Logo/SVG/aqar-mark-gold-gradient.svg` contains,
 * so the tab icon, the app icon, the social cards and the in-app header are one
 * drawing rather than four interpretations of one.
 *
 * The cut-out is a `mask`, not a differently-coloured path, which is why the
 * mark works on any surface: the house is whatever is behind the logo.
 * Palette values come from tokens.css only — no hex literal here.
 */

const HEX = "M24 2 43 13 43 35 24 46 5 35 5 13Z";
const ROOF = "M10.5 22.6 24 11.6 37.5 22.6";
const BODY = "M15.1 22.4v8.2a2.6 2.6 0 0 0 2.6 2.6h12.6a2.6 2.6 0 0 0 2.6-2.6v-8.2";
// Keyhole = a circle sitting on a tapered wedge. One stroke weight with the roof.
const KEYHOLE = "M24 25.4a2.55 2.55 0 0 1 1.65 4.5l.55 2.3h-4.4l.55-2.3A2.55 2.55 0 0 1 24 25.4Z";
const STROKE = 3.1;

/**
 * The bare mark. `id` must be unique per document (SVG ids are global).
 * `tone="gold"` (default) uses the brand gradient; `tone="mono"` inherits
 * `currentColor`; `tone="outline"` is line-only art for watermarks.
 */
export function MarkGlyph({
  id = "aqar-mark",
  tone = "gold",
  className,
  stroke = STROKE,
  title,
}: {
  id?: string;
  tone?: "gold" | "mono" | "outline";
  className?: string;
  stroke?: number;
  title?: string;
}) {
  const maskId = `${id}-cut`;
  const gradId = `${id}-grad`;
  const fill = tone === "mono" ? "currentColor" : `url(#${gradId})`;

  // Line ornament: no fill at all, just the hexagon edge and the house. Used as
  // watermark art (hero, empty states) where a solid gold hexagon would read as
  // a muddy grey blob once it is faded back.
  if (tone === "outline") {
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false" fill="none">
        <g stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d={HEX} />
          <path d={ROOF} />
          <path d={BODY} />
        </g>
        <path d={KEYHOLE} fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {tone === "gold" && (
        <defs>
          <linearGradient id={gradId} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--color-gold-light)" />
            <stop offset="0.5" stopColor="var(--color-gold)" />
            <stop offset="1" stopColor="var(--color-gold-dark)" />
          </linearGradient>
        </defs>
      )}
      <defs>
        <mask id={maskId}>
          <rect width="48" height="48" fill="#000" />
          <path d={HEX} fill="#fff" />
          <g fill="none" stroke="#000" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
            <path d={ROOF} />
            <path d={BODY} />
          </g>
          <path d={KEYHOLE} fill="#000" />
        </mask>
      </defs>
      <path d={HEX} fill={fill} mask={`url(#${maskId})`} />
    </svg>
  );
}

/**
 * Mark + wordmark lockup. The wordmark is text (with the self-hosted display
 * font); the mark is geometry. Layout mirrors the brand-kit horizontal lockups:
 * mark on the start side, Arabic wordmark, optional wide-tracked Latin line.
 */
export function BrandMark({
  wordmark,
  compact = false,
  subtitle,
  tone = "gold",
}: {
  wordmark?: string;
  compact?: boolean;
  subtitle?: string;
  tone?: "gold" | "mono";
}) {
  return (
    <span className="brand-lockup" aria-label="Aqar Rent">
      <MarkGlyph id="aqar-header-mark" className="brand-mark" tone={tone} />
      {!compact && wordmark && (
        <span className="brand-text">
          <span className="brand-wordmark">{wordmark}</span>
          {subtitle && <span className="brand-subtitle">{subtitle}</span>}
        </span>
      )}
    </span>
  );
}
