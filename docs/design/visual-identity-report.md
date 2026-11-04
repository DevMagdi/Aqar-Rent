# Aqar Rent — visual identity & code review (final report)

**Date:** 2026-11-05 · **Branch:** `arena/fc917d7b-aqar-rent` · **Base:** `main@faa05db`

Scope delivered: brand identity (Navy + Gold), logo, design tokens, web
(Next.js), admin console + owner dashboard, Flutter Android app + iOS icon,
full code review, and this report. Business rules (BR-1…BR-12), API contracts
and the backend schema are untouched.

---

## 1. Phase 0 — diagnosis (what was wrong)

| Area | Finding |
|---|---|
| Palette | Three competing palettes in the tree: shipped tokens (`#16273B`/`#BDA77E`), a leftover "premium" proposal (`#0F1C2E`/`#C9A86C`/`#F8F7F4`) and, in places, a teal trust colour (`#0D9488`) plus terracotta leftovers from mobile. `docs/design/premium-tokens.md` and `ASSUMPTIONS.md` still described the rejected values. |
| Tokens | Web and admin token files had drifted in comments but not values; **no test proved they were identical** and nothing rejected a stray hand-written hex in a component. |
| Icons | Emoji were used as UI icons in **~40 places** (web, admin, mobile): they cannot take a brand colour, fall back to the OS emoji font, and render as **tofu** in headless Chromium (proven in screenshots: 🎉 ✅ ⚠️ ⛔ 🏙 🛏 🛁 ⚖️ 📍 🔒 ☎ ⬇ 🔑 👤 🏠 ★ ✓ ✕). |
| Navigation | Admin sidebar had text-only links and no active-state rail; owner sidebar the same; the public header showed **10 nav items** when signed in, which overflowed and clipped labels ("لوحة المالك", "حسابي", "الإشعارات"). |
| Screens | Order success/failure, contract verify, checkout selection and the account page were built from ad-hoc classes, some with full-bleed coloured walls and emoji. |
| Gates | `npm run lint` **did not run at all** (eslint not installed, no config). `e2e/tests/design-system.spec.ts` asserted the legacy RGBs. |
| Numbers | Money/dates rendered as Arabic-Indic numerals (`١٬٠٠٠`), which is hard to scan and does not match the gateway/contract PDFs. |
| Accessibility | Several icon-only buttons had no accessible name; some list rows were below 44/48px; Dynamic Type was unbounded on Flutter (200% clipped). |

---

## 2. Phase 1 — identity, logo, tokens

**Palette (locked, exact Mantiq + explicitly-derived steps only):**

| Token | Value | Ratio evidence |
|---|---|---|
| `--color-brand` | `#16273B` | 15.14:1 on white |
| `--color-brand-deep` | `#0E1728` | 17.92:1 |
| `--color-network` *(derived)* | `#1E3349` | navy +1 step |
| `--color-gold` | `#BDA77E` | 6.48:1 on navy · 2.34:1 on white |
| `--color-gold-light` *(derived)* | `#D8C7A4` | 9.10:1 on navy |
| `--color-gold-dark` *(derived)* | `#86693C` | 5.12:1 on white |
| `--color-on-dark` *(derived)* | `#EDE9E0` | 12.49:1 on navy |
| `--color-bg` *(derived)* | `#FAF9F5` | warm canvas |
| `--color-muted` | `#5B6472` | 5.98:1 on white |
| dark: bg / surface / ink / muted / gold | `#0E1728` / `#17293F` / `#EDE9E0` / `#A3ADB9` / `#BDA77E` | 12.9:1 · 6.3:1 · 6.31:1 |

* **Teal removed** from every token file; the verified/trust mark is **gold**
  (`#86693C` on light, `#BDA77E` on dark). Status colours remain functional-only.
* Single source of truth: `web/src/styles/tokens.css` → `admin/src/styles/tokens.css`
  (byte-identical) → `mobile/lib/core/theme.dart`. **No component contains a
  hand-written hex** (grep-verified; `tokens.test.ts` fails on any `#RRGGBB`
  outside the token files and on every legacy value).
* Logo: geometry, not a glyph — navy tile, gold-light roof, gold body, gold dot
  with navy keyhole. Same object on web (`BrandMark`), Flutter (`AqarMark`,
  `CustomPainter`) and the generated icon/splash set (`scripts/brand_assets.py`,
  40 files in sync).
* Docs: new `docs/design/brand-identity.md`; the superseded proposal is marked
  as historical with the reversal recorded; `ASSUMPTIONS.md` §116 corrected.

---

## 3. Phase 2 — web

* **Header rebuilt.** Signed-in users now get a purpose-built set
  (لوحة المالك · المفضلة · المكتبات · العقود) with 1.7px stroke icons, a bell
  with a gold unread count, a profile chip with the initial avatar (local
  `01000000101` formatting, `dir="auto"`), the language and theme controls, and
  a logout that only appears where there is room (`xl`). The mobile drawer got
  12px rows, icons, an active tint, the notifications count, office/account
  entries and the primary CTA — nothing clips at any width.
* **Hero** art moved from under the copy to the inline-end edge with a gentler
  opacity; the primary CTA stays the only gold button above the fold.
* **Status screens** (order success/failed, public contract verify) rebuilt as a
  token seal (gold `verified` / `danger`) inside a `bg-surface shadow-card`
  panel — no emoji, no full-bleed colour walls.
* **Checkout** week/payment selection uses `border-verified` +
  `bg-gold-tint-8` + `shadow-card`; `brand-50` retired.
* **Account** page: identity header (initial avatar + name + local phone),
  read-only phone with an explanatory hint, 44px inputs and buttons.
* **Icons**: one inline `Icon` set (`web/src/components/Icon.tsx`, 21 shapes) now
  covers listing cards (bed/bath/star/check/building), gallery, lightbox,
  contact box, detail map, listing actions (heart/link/flag), pricing,
  office page, contract detail/wizard/handover, verify page and the wizard.
  **0 emoji left in `web/src`.**
* **Numerals**: money/date/counters render Latin digits in Arabic
  (`ar-EG-u-nu-latn`); copy stays Arabic.

## 4. Phase 3 — admin console + owner dashboard

* **Admin shell**: 15 hand-drawn stroke icons in the sidebar, `min-h-10` rows
  with `gap-2.5`, a live green dot + `font-display` page title in the header,
  and a 3px gold active rail pinned to the active row (the rail was previously
  pinned to the nav's outer edge — fixed and now asserted by geometry in e2e).
* Sidebar/console detail: KPI cards, tables, row hover and the staggered row
  entrance all moved onto tokens; `✕` (a tofu candidate) replaced by the icon set.
* **Owner dashboard**: icon-led stats row (`views · contacts · days left`) as a
  semantic `<dl>` with tabular numbers, a proper building-icon thumbnail
  fallback, 36px action buttons on `--radius-field`, and a `--radius-card`
  card shadow. Header shows the local-format phone.
* **Owner shell**: six stroke icons, gold inline-start active rail, 40px desktop
  rows and 44px mobile strip rows.
* Verified light **and** dark for dashboard, moderation, verifications and
  payments (`e2e/shots/c-admin-*.png`).

## 5. Phase 4 — Flutter Android + iOS icon

* New `AqarMark` / `AqarLockup` (CustomPainter, no asset, no font dependency) —
  the same mark as web, used in the app bar and the home hero.
* Home hero: navy card with a gold hairline, mark + wordmark + gold verified
  tick, a labelled search affordance (`search_hint`, new i18n key) with a
  visible 48dp target, and a rebuilt trust card (gold-tinted seal, direction-aware
  chevron, `minTileHeight: 48`).
* **Icons**: every emoji in `mobile/lib` replaced by Material icons (listing card
  bed/bath/star/check/apartment, legal balance, contract verified seal,
  handover lock). **0 emoji left in `mobile/lib`.**
* **Dynamic Type**: `MediaQuery.textScaler` clamped to `[1.0, 2.0]` at the app
  root — 200% reflows instead of clipping; `TickerMode`/`HeroMode` already honour
  `disableAnimations`.
* **Contrast**: gold trust labels/icons on dark surfaces switch to `AppColors.gold`
  (6.31:1) instead of `verified` (#86693C, too dark on navy).
* **iOS icon**: 1024px master verified (opaque RGB, no alpha — required by App
  Store), navy tile + gold mark, and `flutter_launcher_icons` now documents the
  Navy Deep `#0E1728` seam that matches the mark.

## 6. Phase 5 — review, fixes, verification

### Issues found and fixed
1. `npm run lint` was a no-op (eslint missing) → added ESLint 9 flat config with
   `eslint-config-next` + `typescript-eslint`, `--max-warnings=0`; then fixed
   every finding (13 unused imports/vars, a stray `eslint-disable`).
2. Owner edit page rendered the wizard **outside** the owner chrome
   (`OwnerShell` imported but unused) → wrapped.
3. `e2e/tests/design-system.spec.ts` asserted the legacy palette and a header
   indicator that no longer exists → rewritten against the shipped identity
   (adds a computed-style assertion that `--color-verified` is gold).
4. Admin active-rail geometry: the rail sat at the nav's inline-start instead of
   the active row's → `inset-inline-start: .5rem` + the e2e now measures against
   the active row (RTL-aware).
5. Theme-swap race in two e2e assertions (read mid-transition, 160ms) → poll.
6. Duplicate CSS: two `@keyframes aqar-page-in`, two `.card-lift` blocks and an
   extra reduced-motion block in `globals.css` → single canonical definitions.
7. Header overflow when signed in (10 items, clipped labels) → the split above;
   `login-link` is no longer hidden on phones (it was unreachable except via the
   drawer).
8. ~40 emoji used as icons → the shared icon set (this was also a real bug:
   they rendered as tofu in Chromium).
9. Money showed Arabic-Indic digits → Latin digits in both locales; unit test
   updated to encode the decision.
10. `data-testid="nav-indicator"` existed only in admin while the web spec looked
    for it in the header → test now targets the real active-state contract.
11. Icon-only close buttons (`✕`) had no accessible name in Gallery/ContractDetail
    /HandoverEditor/Modal → `Icon` + `aria-label` + `.icon-button` 44px targets.
12. Docs/mobile config still carried the rejected palette → corrected.

### Gate results (all run on this branch)

| Command | Result |
|---|---|
| `web` `npx tsc --noEmit` | **0 errors** |
| `web` `npm run lint` (`--max-warnings=0`) | **0 errors / 0 warnings** |
| `web` `npx vitest run` | **28 passed** (2 files) |
| `web` `npm run build` | **success** (static + SSG + dynamic summary) |
| `admin` `npx tsc --noEmit` | **0 errors** |
| `admin` `npm run build` | **✓ built** (356 kB js / 103 kB gzip) |
| `backend` `pytest -q` | **162 passed** |
| `mobile` `scripts/check_mobile.py` | **OK** — 37 files, 0 syntax errors, 110 i18n keys, 14 routes, 113 API paths |
| `scripts/brand_assets.py --check` | **40 files in sync** |
| `e2e` `playwright test` | **12/12 passed** |

Environment limitations (not failures): no Flutter SDK/dart in this sandbox, so
`flutter pub get` / `analyze` / `test` and the mobile widget tests cannot run
here — `check_mobile.py` (tree-sitter Dart parse + i18n/route/API budget audit)
is the substitute and it is green. `npm ci` from a cold cache cannot be exercised
inside this job; `npm install` state is committed via `package-lock.json`.

### Bundle

Web first-load JS is unchanged in kind (no new runtime dependency was added to
the app: the icon set is inline SVG, the lint packages are dev-only). Admin's
production bundle is 103 kB gzip total. The only dependency added is
ESLint + its Next/TS presets, **dev-only**.

## 7. Decisions worth knowing

* **Latin digits in Arabic** — scannability of prices/refs and parity with the
  payment gateway and contract PDFs. Wording remains Arabic.
* **No icon library** — 21 paths inline + 15 admin paths cost ~2 kB and avoid a
  runtime dependency; they inherit `currentColor`, so icons are token-driven.
* **Gold is never text on light** — the verified note uses `#86693C` (5.12:1).
* **"Show, don't decorate" motion** — only transform/opacity, gated by
  `prefers-reduced-motion` / `disableAnimations` on both platforms.

## 8. Known follow-ups (deliberately out of scope)

* React Compiler strictness rules (`set-state-in-effect`, `refs`,
  `immutability`) are disabled in lint with a comment: the affected components
  are SSR-safe reveal/dirty-tracking state machines. Enabling the compiler
  later should be a dedicated change with visual regression coverage.
* `/ar/offices` resolves through the `[slug]` route only; a dedicated index page
  would be a routing change, not a design change.
* Flutter widget tests and `flutter analyze` need an SDK-equipped CI runner.
