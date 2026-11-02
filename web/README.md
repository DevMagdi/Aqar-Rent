# Aqar Rent — /web (Next.js)

Public SSR/SEO site + tenant & owner flows for the broker-free Egyptian rental
marketplace. Arabic-first (RTL), English secondary at `/en/…`.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack dev) + **Tailwind CSS 4**
- **MapLibre GL JS** with an inline raster style — tile URL comes from
  `NEXT_PUBLIC_MAP_TILES_URL` (no paid key required, defaults to OSM)
- Amiri Arabic webfont bundled in `public/fonts/` (no external font CDN)

## Run

```bash
npm install
# backend must be running on :8000 (MockProvider, DEBUG=true for dev OTP codes)
BACKEND_URL=http://localhost:8000 NEXT_PUBLIC_MOCK_PAY=true npm run dev   # :3000
```

Env (see `.env.example`): `BACKEND_URL` (server-side SSR origin + `/api` proxy),
`NEXT_PUBLIC_MAP_TILES_URL`, `NEXT_PUBLIC_MOCK_PAY`, `NEXT_PUBLIC_SITE_URL` (canonical/OG).

## Architecture notes

- **Same-origin API**: the browser only ever calls `/api/v1/*`; Next `rewrites`
  proxy to `BACKEND_URL` (CORS-free behind any preview host). SSR fetches go
  straight to `BACKEND_URL`.
- **Auth**: OTP login (phone → 6-digit code, resend timer). Tokens live in
  `localStorage`; the API helper refreshes once on 401 and retries.
- **URLs**: `/{locale}/…`; listing permalinks follow the spec —
  `/{locale}/rent/{governorate}/{city}/{uuid}-{slug}` (Arabic-safe slug).
- **Search** (`/search`): one filter state shared by list **and** map (price,
  type, rental type, furnished, bedrooms, bathrooms, area, floor, amenities,
  available-from, bbox, sort), URL-synced, infinite scroll 20/page, map
  bbox → “search this area” button. Filters and results are client-fetchable;
  the first page is SSR'd for SEO.
- **Map**: price pins are HTML markers, clusters are GeoJSON circles (no glyph
  server needed), tiles degrade gracefully offline.
- **SEO**: canonical + hreflang, `sitemap.xml`, `robots.txt`, OpenGraph image
  route (`/og`, Amiri-rendered), JSON-LD `Residence` + `Offer` on detail pages,
  `next/image` thumbnails.
- **Wizard**: 6 steps (basics → specs → location → photos → description →
  review), draft autosave (localStorage until the backend draft exists, then
  debounced `PATCH`), photos client-compressed ≤ 1.5 MB with upload
  progress/retry/reorder, Arabic validation messages.
- **Checkout**: weeks 1–4, promo validation with live totals, four methods
  (card / Fawry / Vodafone Cash / bank transfer with reference + receipt
  upload). When `checkout_url` is `mock://` and `NEXT_PUBLIC_MOCK_PAY=true`,
  dev-only “simulate success/failure” buttons sign the webhook server-side via
  `/api/dev/simulate-payment`.

## Structure

```
src/app/[locale]/      home, search, rent/{gov}/{city}/{idslug}, login, account,
                       favorites, notifications, owner/* (dashboard, new, [id]/edit,
                       verification, checkout, orders, orders/[id]), static pages
src/app/               root redirect, sitemap.ts, robots.ts, og/route.tsx
src/components/        header/footer, SearchExperience, MapView, ListingWizard,
                       Checkout/Order views, ContactBox, Gallery, …
src/lib/               api (client+refresh), server fetch, i18n dictionaries,
                       filters ⇄ URL helpers, utils (slug, phone, formatting)
```
