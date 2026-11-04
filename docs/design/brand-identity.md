# Aqar Rent — brand identity

> **Authority:** `web/src/styles/tokens.css` (mirrored byte-for-byte into
> `admin/src/styles/tokens.css`, mirrored by hand into
> `mobile/lib/core/theme.dart`).
> **Enforced by:** `web/src/styles/tokens.test.ts` (unit, every hex + ratio),
> `e2e/tests/design-system.spec.ts` (real browser, light + dark, ar + en),
> `scripts/brand_assets.py --check` (40 generated icon/splash files).

## 1. The two hues

| Role | Token | Value | Evidence |
|---|---|---|---|
| Navy (ink, chrome, primary surface) | `--color-brand` | `#16273B` | 15.14:1 on white |
| Navy Deep (darkest) | `--color-brand-deep` | `#0E1728` | 17.92:1 on white |
| Network (derived: navy +1 step) | `--color-network` | `#1E3349` | hover / fills |
| **Gold (the only accent)** | `--color-gold` | `#BDA77E` | 6.48:1 on navy · **2.34:1 on white** |
| Gold Light (derived: +1 step) | `--color-gold-light` | `#D8C7A4` | 9.10:1 on navy |
| Gold Dark (derived: −1 step) | `--color-gold-dark` | `#86693C` | **5.12:1 on white** |
| On-dark (derived warm white) | `--color-on-dark` | `#EDE9E0` | 12.49:1 on navy |
| Canvas (derived warm off-white) | `--color-bg` | `#FAF9F5` | — |
| Muted | `--color-muted` | `#5B6472` | 5.98:1 on white |

**Rules**

1. Gold is **never** text on a light surface (2.34:1). Labels are ink; the
   gold *note* uses `--color-verified` (`#86693C`, 5.12:1) or
   `--color-gold-dark` at WCAG-large sizes only.
2. Buttons are gold with **navy** labels (`--color-gold-text` = `#0E1728`,
   8.79:1). White-on-gold is banned.
3. Status colours (success / warn / danger / info / neutral) are
   *functional only* — badges, alerts, validation. They never carry brand
   meaning and are tuned to sit quietly under navy + gold.
4. **The verified mark is gold.** There is no second brand hue; teal was
   removed (`--color-teal*` no longer exists in any token file).

## 2. Dark mode

| Role | Token | Value |
|---|---|---|
| Canvas | `--color-bg` | `#0E1728` |
| Surface (derived +1) | `--color-surface` | `#17293F` |
| Surface 2 | `--color-surface-2` | `#1C3049` |
| Ink | `--color-ink` | `#EDE9E0` (12.9:1) |
| Muted | `--color-muted` | `#A3ADB9` (6.3:1) |
| Gold | `--color-gold` | `#BDA77E` (6.31:1) |

Dark mode is **token overrides only** — there is no per-component dark code on
either web app. `<html class="dark">` is set by a pre-paint bootstrap script
from `aqar.theme` (falls back to `prefers-color-scheme`), so there is no flash.
Flutter follows the system theme with the same in-app toggle, persisted in
secure storage.

## 3. Logo

The mark is geometry, not a glyph (so it never depends on a font): a navy tile
with a 12.5/48 corner ratio, a gold-light roof stroke, a gold body with
rounded shoulders, and a gold dot with a navy keyhole centre. It is defined in
exactly three places and must stay identical:

| Surface | Implementation |
|---|---|
| Web / admin | `web/src/components/BrandMark.tsx` (also copied in admin via the shared atom) |
| Flutter | `AqarMark` / `AqarLockup` in `mobile/lib/core/widgets.dart` (`CustomPainter`) |
| Icons & splash | `scripts/brand_assets.py` → PNG masters consumed by the iOS/Android sets |

`AqarLockup` (mark + El Messiri wordmark) is the app-bar lockup on mobile; the
web header uses `BrandMark` with the wordmark.

## 4. Typography

* Display / titles: **El Messiri** (`font-display`) — warm, Egyptian, reads
  well at large sizes; used for the hero line, page titles, prices.
* Body / UI: **IBM Plex Sans Arabic** — full Arabic + Latin coverage, even
  rhythm at 13–16px.
* Numerals: **Latin digits in both languages** (amounts, dates, refs). Wording
  stays Arabic; the numerals are scannable at a glance and match the payment
  gateway and contract PDFs (`ar-EG-u-nu-latn`).
* Scale: base 15/24, titles 26/36, KPI 34/42; Arabic gets +1px line-height.

## 5. Motion

Motion must *show something changed* or *direct attention* — never decorate.

| Motion | Where | Timing |
|---|---|---|
| Page fade-up (`aqar-page-in`) | route enter | `--dur-base`, `--ease-out` |
| Reveal / stagger | section entrances | `--dur-slow`, ≤7 items, 60ms stagger |
| Card lift | listing cards, KPI cards | `translateY(-4px)` + `--shadow-elevate` |
| Press | every enabled button | `translateY(1px) scale(.985)`, 80ms |
| Theme swap | light ⇄ dark | 160ms colour-only transition |
| Toast | feedback | `translateY(14px) → 0`, 220ms |

Only `transform` and `opacity` animate (plus colour on the theme swap), so no
layout is ever thrashed. `prefers-reduced-motion: reduce` collapses every
duration to `0.01ms` and removes the transforms; on Flutter the equivalent is
`MediaQuery.disableAnimations` → `TickerMode(enabled: false)` + `HeroMode`.

## 6. Iconography

One inline SVG set, 1.7px strokes, `currentColor`, 24×24 viewBox:

* web: `web/src/components/Icon.tsx`
* admin: `admin/src/components/Icon.tsx` (same file)
* mobile: Material rounded/outlined icons at the same optical weight
  (`Icons.king_bed_outlined`, `Icons.bathtub_outlined`, …)

**No emoji in UI copy.** They fall back to a colour emoji font, so they cannot
take a brand colour, and they render as tofu on Linux/headless Chromium.
Navigation, badges, status seals and empty states all use the icon set.

## 7. Accessibility contract

* WCAG 2.1 AA on every text/background pair, verified numerically in
  `tokens.test.ts` and again in the browser by the design e2e.
* Visible focus ring on every interactive element (`--color-focus`, 2px, 2px
  offset), never `outline: none` without a replacement.
* Touch targets: 44×44 CSS px on web (`[data-tap-target]`, `.icon-button`),
  48dp on mobile (`AppShape.tapMin`, `minTileHeight`).
* Every icon-only control has an accessible name; every live region is
  `aria-live` (web) / `Semantics(liveRegion: true)` (Flutter).
* Dynamic Type / font scaling to 200%: the Flutter root clamps
  `textScaler` to `[1.0, 2.0]` and layouts reflow; web honours browser zoom
  because all type is in `rem`.
* Arabic-first (RTL) with logical properties everywhere
  (`margin-inline-start`, `inset-inline-end`, `ps-`/`pe-`, `start-`/`end-`).
  English is LTR and is tested in the same run.

## 8. Copy

Simple Egyptian Arabic, not stiff MSA (`انشر إعلانك`, `احفظ التغييرات`,
`جرّب تاني`), and plain English. Buttons are verbs. Empty states say what to do
next, not "no data".
