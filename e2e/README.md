# Aqar Rent — end-to-end tests (Stage 3A acceptance)

One Playwright journey covering the full owner flow **and** the tenant flow
against the real backend (MockProvider) and the real admin console:

> register → ownership verification → 6-step listing wizard → admin 2FA
> approves verification + listing → checkout (weeks/promo/method) → **signed
> mock webhook payment** → listing live → tenant finds it **by filter** and
> **on the map** (price pin + “search this area”) → detail SEO/JSON-LD/verified
> badge → login-gated **contact** (event lands in owner stats).

## Run

```bash
npm install
npx playwright test            # or: npm test
```

The config starts a **hermetic stack** (fresh SQLite per run) so it never
touches the dev-preview servers:

| service | port | notes |
| --- | --- | --- |
| backend | 8010 | wipes `backend/data/e2e.db`, migrates, seeds, `PAYMENT_PROVIDER=mock` |
| web (Next) | 3010 | `BACKEND_URL=http://localhost:8010`, `.next-e2e` build dir, `NEXT_PUBLIC_MOCK_PAY=true` |
| admin (Vite) | 5180 | proxies `/api` → 8010 |

## How the sandbox browser works

Browser CDNs are unreachable here, so there is **no `playwright install`**:
`playwright-core` + `@sparticuz/chromium` ship the binary through npm.
`global-setup.ts` (re)inflates the Amazon-Linux shared libs to `/tmp/al2023/lib`
(`/tmp` does not persist between tool calls) and extracts `/tmp/chromium`;
launch options use the package's recommended args **minus**
`--single-process`/`--no-zygote`, which break localStorage isolation between
browser contexts (owner vs tenant sessions).

## Files

- `tests/owner-journey.spec.ts` — the acceptance journey (single serial test)
- `utils/totp.ts` — RFC-6238 TOTP for the seeded super-admin 2FA login
- `utils/mockpay.ts` — direct signed-webhook helper (the UI path uses
  `/api/dev/simulate-payment`, which signs server-side)
- `fixtures/` + `make_fixtures.py` — 3 distinct JPEGs regenerated **per run**
  (the backend's perceptual-hash guard rejects reused photos across listings)
- `check-browser.mjs` — one-shot browser sanity check
