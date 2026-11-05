# Aqar Rent — visual identity & code review (final report)

**Date:** 2026-11-05 · **Branch:** `arena/12304b3c-aqar-rent` · **Base:** `main@abaa93c`

Scope delivered: brand identity (Navy + Gold), single-source design tokens,
the full brand kit, web (Next.js), admin console + owner dashboard, Flutter
Android app + iOS icon, full code review, and this report. Business rules
(BR-1…BR-12), API contracts and the backend schema are untouched.

**This pass (v3)** rebuilt the token layer from scratch as one JSON source with
six generated mirrors, rebuilt the logo as true brand-kit geometry on all six
surfaces, generated the complete `brand/Aqar-Rent-Brand-Kit/` (101 files), and
swept every legacy colour out of the tree. Sections 2–6 below are updated to
describe what actually ships.

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

### 2.1 Name, taglines, voice

**Aqar Rent / عقار رينت**, Arabic-first. Taglines: **«إيجارك مباشرة من المالك»**
and **"Rent direct. No brokers."** — now the actual hero line in both locales,
not a line buried in a doc. Voice: confident, simple, transparent about money,
short sentences, clear verbs (`انشر إعلانك`, `احفظ التغييرات`).

### 2.2 One source, six generated mirrors

`design/tokens.json` is the only file a human edits. `scripts/build-tokens.mjs`
writes **six** artefacts and `--check` byte-compares all of them:

| Artefact | Consumer |
|---|---|
| `web/src/styles/tokens.css` | Next.js app |
| `admin/src/styles/tokens.css` | Admin + owner console (byte-identical to web) |
| `web/src/styles/tokenValues.ts` | typed `var(--token)` map for TSX |
| `mobile/lib/core/theme_generated.dart` | Flutter `AppColors` / `AppMotion` / `AppShape` |
| `mobile/android/.../values/colors.xml` | Android light |
| `mobile/android/.../values-night/colors.xml` | Android dark |

Before this pass the palette was hand-copied into four places and had already
drifted: the app still carried a terracotta seed while the docs described a
rejected proposal, and `theme.dart` had a self-referential
`--color-verified-on-dark: var(--color-verified-on-dark)` in the CSS. There is
now one source, a schema (`design/tokens.schema.json`), a dependency-free
validator inside the generator (unknown keys, bare hexes on derived steps, px
where rem belongs) and a byte-equality test.

`mobile/lib/core/theme.dart` is a thin layer that imports and re-exports the
generated file and declares **no** colour, duration or radius.

### 2.3 Palette (exact values, measured)

| Token | Value | Ratio evidence |
|---|---|---|
| `--color-brand` | `#16273B` | 14.97:1 on white · 13.89 on canvas |
| `--color-brand-deep` | `#0E1728` | 17.9:1 on white |
| `--color-network` | `#243553` | raised dark surface / hover (one navy family) |
| `--color-gold` | `#BDA77E` | 6.48:1 on navy · **2.34:1 on white** |
| `--color-gold-light` | `#E3D2A8` | 10.13:1 on navy |
| `--color-gold-dark` | `#8F7A52` | 4.14:1 on white → large text / 3:1 UI only |
| `--color-gold-ink` | `#6F5D3A` | 6.36:1 on white (the gold-family **text** colour) |
| `--color-on-dark` | `#E8E2D4` | 11.72:1 on navy |
| `--color-bg-light` | `#F7F5F0` | warm canvas |
| `--color-surface-2` | `#EFEBE1` | inset panels |
| `--color-muted` | `#5B6472` | 5.98:1 on white |
| dark: bg / surface / surface-2 / ink / muted / gold | `#0E1728` / `#17293F` / `#1C3049` / `#E8E2D4` / `#A3ADB9` / `#BDA77E` | 11.41 · 6.48 · 6.31 |

Gradient `#E3D2A8 → #BDA77E → #8F7A52` at 135°. Full measured table:
[`premium-tokens.md`](./premium-tokens.md). Every pair above is asserted in
`tokens.test.ts`, including the status families and the composited dark pairs.

* **Teal is gone** from every token file; the verified mark is gold
  (`gold-ink` on light, `gold` on dark). Status colours stay functional-only.
* **Derived values are declared.** Every non-brand colour carries
  `derived: true` plus a `note`, and a test fails on any solid colour that is
  neither a brand value nor marked derived.
* **70/20/10** is stated once and enforced by the `bg-gold` + `text-white` scan.

### 2.4 Logo — one drawing, six surfaces

The mark is the brand-kit geometry: a **hexagon**
(`24,2 43,13 43,35 24,46 5,35 5,13`, 48 viewBox — the Mantiq hexagon exactly)
filled with the gold gradient, with the **house** (roof curve leaning like the
bowl of «ع», body, keyhole) carved out as negative space at one stroke weight
with rounded ends.

| Surface | Implementation |
|---|---|
| Brand kit | `brand/Aqar-Rent-Brand-Kit/` — `scripts/build-brand-kit.mjs` |
| Web | `web/src/components/BrandMark.tsx` → `MarkGlyph` (SVG `mask`) |
| Admin / owner console | `admin/src/components/BrandMark.tsx` (same mask geometry) |
| Flutter | `AqarMark` `CustomPainter` (`saveLayer` + `BlendMode.clear`) |
| Web tab icon | `web/src/app/icon.svg` — written by the brand-kit generator |
| Store icons / splash | `scripts/brand_assets.py` (palette read from `tokens.json`) |

The **wordmarks ship as outlines** (`design/wordmark-outlines.json`, produced by
`scripts/outline-wordmark.py` using HarfBuzz shaping and fontTools `BoundsPen`),
so no font is ever required to render the logo: Arabic «عقار رينت» (El Messiri
Bold), Latin `AQAR RENT` (+40 tracking), the wide-tracked `RENT DIRECT` line
(+220) and the Arabic tagline «إيجارك مباشرة من المالك».

### 2.5 Brand kit — 101 files, 71 PNG

```
01-Logo/SVG/                 horizontal | stacked | mark   ×  gold-gradient | gold | navy | white | black
                             + on-navy | on-gold | on-white lockups (paper included)
01-Logo/PNG-transparent/     same set at 1200 / 900 / 512 px
01-Logo/PNG-with-background/ on-navy | on-gold | on-white
01-Logo/Animated/            aqar-mark-draw.svg (SMIL, reduced-motion aware) + README
02-Social-Media/             LinkedIn 400² + 1584×396, Facebook 820×312, X 1500×500,
                             Instagram/WhatsApp 1080², Post 1080², Story 1080×1920
03-Favicon/                  16 32 48 64 180 192 512 + favicon.ico + favicon.svg + maskable
04-Email-Signature/          signature-light.html / signature-dark.html
05-Brand-Guide/              colors.txt + brand-guide.html (logo, colour, type, do/don't)
06-App-Icons/                ios/ (15 sizes + Contents.json) + android/ (mipmaps + splash)
```

* `npm run brand:build` regenerates everything from the SVGs; `brand:check`
  re-renders and byte-compares, including an orphan-file scan. Both green.
* Small favicons use a **heavier stroke (4.3 vs 3.1 units)**: at 16px the
  standard weight turns to mush, which is worse than a slightly softer shape.
* The 1024 marketing icon in the kit is **byte-identical** to the one the app
  ships (read from the iOS asset catalogue), so the store listing and the device
  cannot disagree.
* **Lottie declined**: an optional `.lottie.json` would add a ~500 KB runtime to
  the web bundle and a dependency to the app for one 1.6s stroke animation. The
  SMIL file is 1.5 KB and honours `prefers-reduced-motion` by itself.
* **No PNG noise texture**: the 3.5% grain and the hexagon lattice are inline
  SVG data-URIs in CSS — one line each, no request, nothing to keep in sync.

### 2.6 Typography & geometry, one language everywhere

* Scale in **rem** (0.8125 → 4), not px, so browser zoom and OS text size both
  work; Arabic body line-height 1.7, headings 1.25.
* Radii: cards **18**, fields **12**, buttons **pill**, sheets/modals **28** —
  identical on web, admin and Flutter (`AppShape.radiusCard` etc.).
* Shadows are navy-tinted and layered; dark mode uses a hairline border plus a
  very faint gold glow on the active element instead of a shadow.
* Tabular figures for every price and KPI (`font-variant-numeric: tabular-nums`,
  Flutter `FontFeature.tabularFigures()`).

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
* **Contrast**: gold trust labels/icons on dark surfaces use `AppColors.gold`
  (6.48:1 on navy); `gold-ink` is the light-surface text gold and would fail
  there, so it is never used on navy.
* **iOS icon**: 1024px master verified (opaque RGB, no alpha — required by App
  Store), navy tile + gold mark, and `flutter_launcher_icons` now documents the
  Navy Deep `#0E1728` seam that matches the mark.

## 6. Phase 5 — review, fixes, verification

### Issues found and fixed
1. **`--color-brand` was used as a surface.** `--color-brand` is the *ink*
   alias, and in dark mode it flips to the light text colour (`#E8E2D4`). The
   home hero painted `linear-gradient(126deg, var(--color-brand), var(--color-brand-deep))`
   and the toast painted `background: var(--color-brand)`; in dark mode that
   produced a grey-white haze across the hero — the exact "washed out" look the
   identity pass was meant to remove. Hero now uses the navy chrome steps
   (`network → sidebar`), the toast uses `sidebar`, `.btn-secondary` uses
   `network` + `border-strong`, and the `ContactBox` call buttons moved from
   `bg-brand` to `bg-network`. Rule: `--color-brand` is a **text** token; the
   only sanctioned surface token is `--color-sidebar`/`--color-network` (dark)
   and `--color-surface*` (light).
2. **Hero glow too large.** `.hero-glow` was a 58vw / 14%-gold circle covering a
   whole quadrant — at that size low-alpha gold reads as grey fog, not light.
   Reduced to `min(42vw, 460px)` at 8% and `.6` opacity in dark mode.
3. `npm run lint` was a no-op (eslint missing) → added ESLint 9 flat config with
   `eslint-config-next` + `typescript-eslint`, `--max-warnings=0`; then fixed
   every finding (13 unused imports/vars, a stray `eslint-disable`).
4. Owner edit page rendered the wizard **outside** the owner chrome
   (`OwnerShell` imported but unused) → wrapped.
5. `e2e/tests/design-system.spec.ts` asserted the legacy palette and a header
   indicator that no longer exists → rewritten against the shipped identity
   (adds a computed-style assertion that `--color-verified` is gold).
6. Admin active-rail geometry: the rail sat at the nav's inline-start instead of
   the active row's → `inset-inline-start: .5rem` + the e2e now measures against
   the active row (RTL-aware).
7. Theme-swap race in two e2e assertions (read mid-transition, 160ms) → poll.
8. Duplicate CSS: two `@keyframes aqar-page-in`, two `.card-lift` blocks and an
   extra reduced-motion block in `globals.css` → single canonical definitions.
9. Header overflow when signed in (10 items, clipped labels) → the split above;
   `login-link` is no longer hidden on phones (it was unreachable except via the
   drawer).
10. ~40 emoji used as icons → the shared icon set (this was also a real bug:
   they rendered as tofu in Chromium).
11. Money showed Arabic-Indic digits → Latin digits in both locales; unit test
   updated to encode the decision.
12. `data-testid="nav-indicator"` existed only in admin while the web spec looked
    for it in the header → test now targets the real active-state contract.
13. Icon-only close buttons (`✕`) had no accessible name in Gallery/ContractDetail
    /HandoverEditor/Modal → `Icon` + `aria-label` + `.icon-button` 44px targets.
14. Docs/mobile config still carried the rejected palette → corrected.

### Gate results (all run on this branch)

| Command | Result |
|---|---|
| `node scripts/build-tokens.mjs --check` | **6/6 artefacts in sync** |
| `node scripts/build-brand-kit.mjs --check` | **101 files in sync** (71 PNG) |
| `web` `npx tsc --noEmit` | **0 errors** |
| `web` `npm run lint` (`--max-warnings=0`) | **0 errors / 0 warnings** |
| `web` `npx vitest run` | **30 passed** (2 files) |
| `web` `npm run build` | **success** (static + SSG + dynamic summary) |
| `admin` `npx tsc --noEmit` | **0 errors** |
| `admin` `npm run build` | **✓ built** (357 kB js / 103 kB gzip) |
| `backend` `pytest -q` | **162 passed** |
| `mobile` `scripts/check_mobile.py` | **OK** — 38 Dart files, 0 syntax errors, 110 i18n keys, 14 routes, 113 API paths |
| `scripts/brand_assets.py --check` | **40 files in sync** |
| `e2e` `playwright test` | **12/12 passed** |

Environment limitations (not failures): no Flutter SDK/dart in this sandbox, so
`flutter pub get` / `analyze` / `test` and the mobile widget tests cannot run
here — `check_mobile.py` (Dart parse + i18n/route/API budget audit) is the
substitute and it is green. Map tiles (`tile.openstreetmap.org`) are blocked in
the sandbox, which the map tests already tolerate.

### Bundle

No runtime dependency was added for the visual work: the icon set is inline
SVG, the grain/lattice are CSS data-URIs, the animation is SMIL. The only new
dependency in the repo is `@resvg/resvg-js`, **dev-only**, in the brand-kit
generator. Admin's production bundle is 103 kB gzip total; web first-load JS is
unchanged in kind.

## 7. Decisions worth knowing

* **Latin digits in Arabic** — scannability of prices/refs and parity with the
  payment gateway and contract PDFs. Wording remains Arabic; the app can follow
  the OS locale if a user wants Arabic-Indic digits.
* **No icon library** — 21 paths inline + 15 admin paths cost ~2 kB and avoid a
  runtime dependency; they inherit `currentColor`, so icons are token-driven.
* **Gold is never text on light** — gold-family text on light is `gold-ink`
  `#6F5D3A` (6.36:1); raw gold (2.34:1) is a surface/graphic colour only, and
  `gold-dark` (4.14:1) is limited to large text and ≥3:1 graphics.
* **"Show, don't decorate" motion** — only transform/opacity, gated by
  `prefers-reduced-motion` / `disableAnimations` on both platforms.
* **The logo is geometry with a mask, not a stack of coloured paths.** That is
  what lets one file serve a navy header, a gold cover and a white print sheet
  without a single variant-specific colour patch.
* **Lottie and PNG textures declined** — 1.5 KB of SMIL and two CSS data-URIs
  beat a 500 KB runtime and 40 KB of noise files.
* **`theme.dart` may not hold design values.** It is the compatibility seam for
  screens, not a second source. Anything a designer can change lives in JSON.
* **Everything that used to be "just be careful" is now a test**: byte equality
  of six artefacts, AA ratios in both themes, no stray hex in nine file types,
  no teal, no white-on-gold, no legacy Tailwind hue, reduced motion honoured at
  every animated call site, brand kit re-renders byte-identically.

## 8. Known follow-ups (deliberately out of scope)

* React Compiler strictness rules (`set-state-in-effect`, `refs`,
  `immutability`) are disabled in lint with a comment: the affected components
  are SSR-safe reveal/dirty-tracking state machines. Enabling the compiler
  later should be a dedicated change with visual regression coverage.
* `/ar/offices` resolves through the `[slug]` route only; a dedicated index page
  would be a routing change, not a design change.
* Flutter widget tests and `flutter analyze` need an SDK-equipped CI runner.
