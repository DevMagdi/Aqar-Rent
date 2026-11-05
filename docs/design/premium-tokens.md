# Premium token set — the measured, single-source palette

> **Authoritative.** This document describes the palette that ships today.
> The values live in [`design/tokens.json`](../../design/tokens.json) and nowhere
> else; every consumer file is generated from it. If this page and the JSON ever
> disagree, the JSON wins and this page is the bug.
>
> Regenerate: `npm run tokens:build` · Verify: `npm run tokens:check` ·
> Contrast audit: `web/src/styles/tokens.test.ts` (runs in CI).
>
> Superseded history: the earlier `#0F1C2E` / `#C9A86C` proposal and the teal
> "trust" family are **gone**. Teal is not part of this identity at all.

## 1. One source, six generated mirrors

`design/tokens.json` is the only file a human edits. `scripts/build-tokens.mjs`
writes:

| Artefact | Consumer |
|---|---|
| `web/src/styles/tokens.css` | Next.js app (CSS custom properties) |
| `admin/src/styles/tokens.css` | Admin + owner console (byte-identical to web) |
| `web/src/styles/tokenValues.ts` | Typed `var(--token)` map for TSX |
| `mobile/lib/core/theme_generated.dart` | Flutter `AppColors`, `AppMotion`, `AppShape` |
| `mobile/android/.../values/colors.xml` | Android light resources |
| `mobile/android/.../values-night/colors.xml` | Android dark resources |

`mobile/lib/core/theme.dart` is a thin hand-written layer that imports and
re-exports the generated file (`export ... show AppColors, AppMotion, AppShape`)
and adds nothing that a colour, a duration or a radius could live in.

Why a generator instead of "just be careful": the previous pass had the same
palette written out in four places (web CSS, admin CSS, Dart, Android XML) and
they had already started to drift — the app still carried a terracotta seed and
the docs described a rejected palette. A single source plus a byte-equality test
is the only version of this rule that survives contact with a deadline.

**Test enforcement** (`web/src/styles/tokens.test.ts`):
1. `build-tokens.mjs --check` must report every artefact in sync.
2. Every colour in `tokens.json` must appear in the CSS, the Dart file and both
   Android theme files.
3. `tokenValues.ts` may only contain `var(--…)` references — no literals.
4. No hex outside the token authorities, scanned across
   `svg, xml, plist, json, css, ts, tsx, dart, html`.
5. No `#a93408`, `#fafaf9`, no `terracotta` string, no `teal` hue anywhere.

## 2. Brand values (the brand kit, unchanged from Mantiq)

| Name | Token | Hex | Role |
|---|---|---|---|
| Aqar Navy | `--color-brand` | `#16273B` | primary surface, sidebar, dark chrome |
| Deep Navy | `--color-brand-deep` | `#0E1728` | dark-mode canvas, icon gradient end |
| Network Blue | `--color-network` | `#243553` | raised dark surface, hover |
| Aqar Gold | `--color-gold` | `#BDA77E` | the 10%: CTA edges, verified, active |
| Gold Light | `--color-gold-light` | `#E3D2A8` | gradient start, on-navy highlight |
| Gold Dark | `--color-gold-dark` | `#8F7A52` | gradient end, hairlines |
| Text on Dark | `--color-on-dark` | `#E8E2D4` | body text on navy |

Gold gradient: `#E3D2A8 → #BDA77E → #8F7A52`, 135° (top-inline-start →
bottom-inline-end), stops 0/50/100%.

## 3. Derived steps — each one justified

Derived values exist for exactly two reasons: **contrast** and **one-step
surface elevation**. Nothing else is allowed to invent a colour, and every
derived token carries a `note` in `tokens.json` saying which reason applies.

| Name | Token | Hex | Why |
|---|---|---|---|
| Gold Ink | `--color-gold-ink` | `#6F5D3A` | gold-family **text** on light. Raw gold is 2.34:1 on white; this is 6.36:1. Also the light-mode focus ring (6.36:1 on white, ≥3:1 for UI). |
| Background Light | `--color-bg-light` | `#F7F5F0` | warm page canvas (a cold white next to navy reads cheap) |
| Surface 2 | `--color-surface-2` | `#EFEBE1` | inset panels, table stripes, skeletons |
| Border / Border-strong | `--color-border` | navy 10% / 16% | hairlines; alpha so they work on every surface |
| Ink strong (dark) | `--color-ink-strong` | `#F7F4EE` | headings on dark, one step above body text |
| Muted | `--color-muted` | `#5B6472` | secondary text — 5.98:1 on white |
| Dark surfaces | `--color-surface`, `--color-surface-2` | `#17293F`, `#1C3049` | elevation above Deep Navy by **hue-preserving** lightness only |
| Dark muted | `--color-muted` (dark) | `#A3ADB9` | 6.48:1 on dark surface |
| Status | `success #1B5E3A`, `warn #8A5A12`, `danger #A32A22`, `info #1E4A7A`, `neutral #4A5666` | | functional only, all tuned under navy. Dark-theme equivalents are lightness-lifted, not new hues. |

## 4. Measured ratios (WCAG 2.1)

Computed with the sRGB relative-luminance formula, alpha composited over the
stated backdrop. Every pair below is asserted in `tokens.test.ts`.

### Light theme

| Foreground | Backdrop | Ratio | Requirement |
|---|---|---|---|
| navy `#16273B` | bg `#F7F5F0` | **13.89** | AA text ✓ |
| navy | white | **14.97** | AA ✓ |
| muted `#5B6472` | white | **5.98** | AA ✓ |
| muted | bg | **5.49** | AA ✓ |
| muted | surface-2 | **5.02** | AA ✓ |
| on-dark `#E8E2D4` | navy | **11.72** | AA ✓ |
| on-dark | network | **9.51** | AA ✓ |
| gold `#BDA77E` | navy | **6.48** | AA text on navy ✓ |
| gold | deep navy | **7.67** | AA ✓ |
| gold-light | navy | **10.13** | AA ✓ |
| deep navy (label) | gold (button fill) | **7.67** | AA ✓ |
| gold-ink `#6F5D3A` | white | **6.36** | AA ✓ |
| gold-ink | bg | **5.84** | AA ✓ |
| gold-dark `#8F7A52` | white | **4.14** | large text / 3:1 UI only |
| gold `#BDA77E` | white | **2.34** | ✗ — gold is never text on light |
| success on success-bg | `#EAF3ED` | **6.84** | AA ✓ |
| warn on warn-bg | `#FBF3E4` | **5.36** | AA ✓ |
| danger on danger-bg | `#FBEEED` | **6.37** | AA ✓ |
| info on info-bg | `#ECF1F8` | **7.99** | AA ✓ |
| neutral on neutral-bg | `#EEF1F4` | **6.58** | AA ✓ |
| on-dark on success-fill | `#1B5E3A` | **6.00** | AA ✓ (button labels) |
| on-dark on danger-fill | `#A32A22` | **5.58** | AA ✓ |

### Dark theme

| Foreground | Backdrop | Ratio |
|---|---|---|
| on-dark on surface `#17293F` | | **11.41** |
| muted `#A3ADB9` on surface | | **6.48** |
| gold on surface | | **6.31** |
| gold-light on bg `#0E1728` | | **11.99** |
| success / warn / danger / info on surface | | **8.08 / 7.61 / 6.54 / 7.03** |

### The gold rule, stated once

Gold `#BDA77E` is a **surface and graphic** colour on light, and a **text**
colour on navy. When gold-family text must sit on a light background it is
`gold-ink #6F5D3A`. This is enforced by a test that fails on `bg-gold` +
`text-white` and on any Dart `AppColors.gold` background paired with white text.

## 5. 70/20/10

* **70%** navy, deep navy, `bg-light`, white, `surface-2` — surfaces.
* **20%** ink, muted, borders — structure and text.
* **10%** gold — buttons' edges, the verified badge, the active nav item, the
  focus ring, the app icon. Gold is **never** a large background, never a
  gradient across a whole page, and never behind body text.

## 6. Type scale

| Token | rem | px @16 | Use |
|---|---|---|---|
| `--text-2xs` | 0.8125 | 13 | captions, table labels |
| `--text-xs` | 0.9375 | 15 | secondary UI |
| `--text-base` | 1 | 16 | body |
| `--text-md` | 1.125 | 18 | lead paragraph |
| `--text-lg` | 1.375 | 22 | section heading |
| `--text-xl` | 1.75 | 28 | page title |
| `--text-2xl` | 2.25 | 36 | hero |
| `--text-3xl` | 3 | 48 | KPI |
| `--text-4xl` | 4 | 64 | cover / marketing |

Line heights: Arabic body **1.7** (`--text-base-line`), headings **1.25**
(`--leading-heading`), tight **1.15**.
Fonts: El Messiri 700 (display, prices, KPIs), IBM Plex Sans Arabic 400/600
(body, Arabic), IBM Plex Sans (Latin). Self-hosted, `font-display: swap`, only
the critical Latin + Arabic `woff2` are preloaded.

Numbers: **Western digits (0–9)** for prices and KPIs everywhere, tabular
figures in tables. Arabic-Indic digits appear only through the OS locale
setting in the app (Flutter `NumberFormat` inherits the locale); the web does
not switch digit systems, so a price reads the same in both languages.

## 7. Geometry & motion

| Token | Value | Note |
|---|---|---|
| `radius.card` | 18 | cards, tiles |
| `radius.field` | 12 | inputs, selects, textareas |
| `radius.button` | pill | buttons, chips, filter pills |
| `radius.sheet` | 28 | modals, bottom sheets, drawers |
| `radius.mark` | 12.5 | the favicon/logo tile corner, matching the hexagon |
| `dur-fast` / `dur-base` / `dur-slow` | 120 / 220 / 420 ms | |
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | entrances |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | state changes |
| `stagger` | 60 ms | list reveals, capped at 6 items |
| `rise` / `lift` / `press-scale` | 10 px / −4 px / 0.985 | the only three motion primitives |
| `shadow.card` | `0 1px 2px rgba(22,39,59,.06), 0 10px 26px -14px rgba(22,39,59,.18)` | navy-tinted, never grey |
| `tap-min` / `tap-min-mobile` | 44 px / 48 dp | touch targets |
| `border-width-icon` | 1.75 px | the one icon stroke weight |

Motion is allowed to do two things: show **what changed** and **where to look**.
Everything animates `transform`/`opacity` only. `prefers-reduced-motion`
(web/admin) and `MediaQuery.disableAnimations` (Flutter) are honoured at every
animated site — a test greps the call sites to keep it that way. Dark-mode
active elements use a hairline gold border plus a very faint gold glow
(`gold-tint-12`) instead of a shadow.

## 8. Why there is no noise-file asset

The 3–4% noise on dark hero surfaces is a **CSS-only** SVG `feTurbulence` data
URI (one line, no request, no asset to keep in sync), and the faint hexagon
pattern is a `repeating-conic-gradient`. Adding two PNG textures would cost
~40 KB for no visual gain on top of `backdrop-filter` costs. Same reasoning
rejected the optional Lottie mark: 1.5 KB of SMIL beats a 500 KB runtime.
