/**
 * Admin brand mark — identical geometry to the public web mark (same logo,
 * same tokens), plus the login draw-on animation hooks used by index.css.
 */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup" aria-label="Aqar Rent">
      <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden focusable="false">
        <defs>
          <linearGradient id="admin-gold-mark" x1="7" y1="3" x2="41" y2="45" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--color-gold-light)" />
            <stop offset="0.55" stopColor="var(--color-gold)" />
            <stop offset="1" stopColor="var(--color-gold-dark)" />
          </linearGradient>
        </defs>
        <rect className="brand-mark-fill" width="48" height="48" rx="12.5" fill="var(--color-brand-deep)" />
        <path
          className="brand-mark-outline"
          d="M11.5 22.4 24 12.2l12.5 10.2"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M15.1 22.2v10.9a2.6 2.6 0 0 0 2.6 2.6h12.6a2.6 2.6 0 0 0 2.6-2.6V22.2" fill="none" stroke="url(#admin-gold-mark)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
        <path className="brand-mark-keyhole" d="M24 27.4c1.95 2.4 3.05 3.9 3.05 5.05a3.05 3.05 0 0 1-6.1 0c0-1.15 1.1-2.65 3.05-5.05Z" fill="var(--color-gold)" />
      </svg>
      {!compact && <span className="brand-wordmark">Aqar Rent</span>}
    </span>
  );
}
