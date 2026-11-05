/**
 * Admin / owner-console brand mark — the same geometry as the public web mark
 * and the brand kit (hexagon + house negative space + keyhole), drawn from
 * tokens only. The login screen adds its own draw-on hooks in index.css.
 */
export function MarkGlyph({ id = "admin-mark", className }: { id?: string; className?: string }) {
  const maskId = `${id}-cut`;
  const gradId = `${id}-grad`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradId} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-gold-light)" />
          <stop offset="0.5" stopColor="var(--color-gold)" />
          <stop offset="1" stopColor="var(--color-gold-dark)" />
        </linearGradient>
        <mask id={maskId}>
          <rect width="48" height="48" fill="#000" />
          <path d="M24 2 43 13 43 35 24 46 5 35 5 13Z" fill="#fff" />
          <g fill="none" stroke="#000" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.5 22.6 24 11.6 37.5 22.6" />
            <path d="M15.1 22.4v8.2a2.6 2.6 0 0 0 2.6 2.6h12.6a2.6 2.6 0 0 0 2.6-2.6v-8.2" />
          </g>
          <path d="M24 25.4a2.55 2.55 0 0 1 1.65 4.5l.55 2.3h-4.4l.55-2.3A2.55 2.55 0 0 1 24 25.4Z" fill="#000" />
        </mask>
      </defs>
      <path d="M24 2 43 13 43 35 24 46 5 35 5 13Z" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
    </svg>
  );
}

export function BrandMark({ compact = false, wordmark = "عقار رينت" }: { compact?: boolean; wordmark?: string }) {
  return (
    <span className="brand-lockup" aria-label="Aqar Rent">
      <MarkGlyph className="brand-mark" />
      {!compact && <span className="brand-wordmark">{wordmark}</span>}
    </span>
  );
}
