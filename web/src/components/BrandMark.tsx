export function BrandMark({ wordmark, compact = false }: { wordmark?: string; compact?: boolean }) {
  return (
    <span className="brand-lockup" aria-label="Aqar Rent">
      <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden focusable="false">
        <defs>
          <linearGradient id="aqar-gold-mark" x1="5" y1="2" x2="43" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--color-gold-light)" />
            <stop offset="1" stopColor="var(--color-gold-dark)" />
          </linearGradient>
        </defs>
        <polygon points="24,2 43,13 43,35 24,46 5,35 5,13" fill="url(#aqar-gold-mark)" />
        <text x="24" y="32" textAnchor="middle" fontFamily="var(--font-display)" fontSize="23" fontWeight="700" fill="var(--color-brand-deep)">ع</text>
      </svg>
      {!compact && wordmark && <span className="brand-wordmark">{wordmark}</span>}
    </span>
  );
}
