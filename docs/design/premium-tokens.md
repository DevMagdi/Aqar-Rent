# Premium Visual Overhaul — exact token proposal (analysis → values → code)

> **SUPERSEDED (2026-11) — historical record only.**
>
> This was the pre-implementation proposal for the first premium pass. The
> delivered identity is **Mantiq Navy + Gold only** and is documented in
> [`brand-identity.md`](./brand-identity.md); the authoritative values live in
> `web/src/styles/tokens.css` (mirrored byte-for-byte in
> `admin/src/styles/tokens.css`). Two decisions made here were **reversed**:
>
> * the `#0F1C2E` / `#C9A86C` / `#F8F7F4` palette → exact Mantiq
>   `#16273B` / `#BDA77E` / warm `#FAF9F5`, with derived steps only;
> * the teal "trust" family (`--color-teal*`) → **removed**; the verified mark
>   is gold (`#86693C` on light, `#BDA77E` on dark).
>
> Everything else below (dark-mode structure, radial hairline rules, type and
> motion ramp, card anatomy) shipped. Kept for provenance.

> Written BEFORE implementation, per the execution order of the task.
> Validation: every pair below was computed against WCAG 2.1 AA (4.5:1 normal
> text, 3:1 large text / UI graphics) — see the ratios column.

## 0. Analysis of the current system

| Aspect | Today (Mantiq ADR-034) | Verdict |
|---|---|---|
| Primary | `#16273B` navy — good, slightly cold | Upgrade to warmer `#0F1C2E` (spec) |
| Accent | `#BDA77E` gold — muted, reads flat at small sizes | Refine to `#C9A86C` |
| Background | `#FAFBFC` clinical off-white | Warm `#F8F7F4` (spec) |
| Dark mode | **none** | Full dark `#0B1220` / `#141C2B` (spec) |
| Success/trust | green status only | Add teal `#0D9488` secondary (spec) |
| Cards | radius18, flat shadow, price pill over image | Cinematic: radius22, layered shadow, price dominant + gradient |
| Type | base14/22 | Slightly larger15/24, stronger hierarchy |
| Motion | none (static) | Page fade+slide, card lift/zoom, press scale, brand shimmer |
| Mobile | terracotta seed `#0xFFA93408` leftovers | Fully aligned `theme.dart` + dark |

## 1. Exact new values — light (`:root`)

| Token | Value | Ratio evidence | Source |
|---|---|---|---|
| `--color-brand` (ink/primary) | **#0F1C2E** | 15.99 on bg ·17.13 on surface | spec |
| `--color-brand-deep` (darkest) | **#0B1220** | = spec dark bg | spec |
| `--color-network` (sidebar hover) | **#1D2D45** | derived (same navy hue, +lum) | derived |
| `--color-gold` | **#C9A86C** | **7.59** on primary (button text) · 7.59 on sidebar | spec |
| `--color-gold-light` | **#E7D6AF** | decorative (logo gradient) | derived |
| `--color-gold-dark` (focus/hover/graphics) | **#9C814E** | **3.71** on white → large-text & ≥3:1 graphics only | derived |
| `--color-on-dark` | **#EAE7E0** | **13.87** on sidebar | derived |
| `--color-bg` | **#F8F7F4** | — | spec |
| `--color-surface` | **#FFFFFF** | — | spec |
| `--color-ink` / `--color-ink-strong` | = brand / brand-deep | — | spec |
| `--color-muted` | **#5C6570** | **5.52** on bg · 5.91 on surface | spec |
| `--color-border` / `-strong` / `track` | `rgba(15,28,46, .10 / .16 / .08)` | derived from new navy | derived |
| `--color-sidebar` | `= brand (#0F1C2E)` | elevated chrome in light | derived (spec: primary) |
| `--color-sidebar-hover` | = network | | derived |
| `--color-sidebar-active` | = gold | **7.59** · **5.94** on active composite | spec |
| `--color-sidebar-active-bg` | `rgba(201,168,108,.14)` | | derived |
| gold tints8/12/14 | `rgba(201,168,108, .08/.12/.14)` | ≤14% rule kept | derived |
| `--color-teal` (trust fills/icons) | **#0D9488** | **3.74** vs white → fills/graphics/large only | spec |
| `--color-teal-ink` (teal text) | **#0B726A** | **5.79** on white | derived |
| `--color-teal-bg` | **#E6F5F3** | soft teal panels | derived |
| `--color-teal-on-dark` | **#2DD4BF** | **9.17** on dark surface | derived |
| status success/warn/danger/info/neutral (+bg) | **unchanged** (`#1B5E3A/#EEF6F0`, `#8A5A12/#FDF6EA`, `#A32A22/#FDF0EF`, `#1F4E8C/#EDF2F9`, `#17565F/#ECF3F4`) |7.04 on bg ✓ | spec: keep functional colours |
| `--color-whatsapp` | `#25D366` | functional (official) | integration |

**Forbidden (unchanged rule):** gold `#C9A86C` as text on white = **2.26** ✗ —
accents on light chrome use gold-dark at large sizes/graphics only; button
labels are `#0F1C2E` on gold (7.59 ✓).

## 2. Exact new values — dark (`:root:where(.dark, [data-theme="dark"])`)

| Token | Value | Ratio evidence | Source |
|---|---|---|---|
| `--color-bg` | **#0B1220** | — | spec |
| `--color-surface` | **#141C2B** | — | spec |
| `--color-ink` | **#E9EDF5** | **14.54** on surface ·15.96 on bg | derived |
| `--color-ink-strong` | **#F5F8FC** | **16.02** on surface | derived |
| `--color-muted` | **#9AA4B4** | **6.78** on surface ·7.44 on bg | derived |
| border/strong/track | `rgba(233,237,244, .12 / .20 / .08)` | derived | derived |
| `--color-sidebar` | **#101A2C** | on-dark14.1 · gold7.71 ✓ | derived |
| `--color-network` (hover) | **#223149** | derived | derived |
| `--color-gold` | `#C9A86C` | **7.56** on surface ·8.29 on bg | spec |
| `--color-gold-dark` (price/focus on dark) | **#D9BE87** | **9.48** on surface | derived |
| `--color-on-dark` | `#EAE7E0` |14.1 on sidebar | derived |
| `--color-teal` / `teal-ink` / `teal-on-dark` | `#2DD4BF` / `#2DD4BF` / `#2DD4BF` |9.17 ✓ (soft bg variant for panels) | derived |
| status colours | success `#5CD6A0` · warn `#E9B44C` · danger `#F28B82` · info `#8AB8EC` · neutral `#7FC9D6` (+ `rgba(...,.16)` bgs) |9.4 /9.0 /7.1 /8.2 /9.1 on surface ✓ | derived |
| button on gold | text stays **#0F1C2E** |7.59 ✓ | spec |

Aliases (`stone-*`, `emerald/red/…` families) point at the same vars → dark
mode flips automatically (they are `var()` references, verified by test).

## 3. Type & geometry upgrades

| Token | Was | New |
|---|---|---|
| `--text-base` |14/22 | **15/24** |
| `--text-sm` |13/20 | **14/21** |
| `--text-2xl` (page title) |24/32 | **26/36** |
| `--text-3xl` (KPI) |30/36 | **34/42** |
| `--radius-card` (2xl) |18 | **22** (spec20–24) |
| `--radius-3xl` (shells) |18 | **24** |
| `--radius-field` (xl = buttons/fields) |12 | **14** (spec14–16) |
| `--radius-lg` (chips/nav pills) |8 | **10** |
| `--shadow-card` | flat1-layer | **layered:** `0 1px 2px rgba(11,18,32,.05), 0 10px 28px -14px rgba(11,18,32,.12)` |
| `--shadow-pop` | `0 12px 32px rgba(14,23,40,.12)` | `0 12px 32px rgba(11,18,32,.16)` |
| `--shadow-elevate` (NEW, card hover) | — | **`0 20px 48px -20px rgba(11,18,32,.32)`** |

## 4. Motion plan (CSS-first, `prefers-reduced-motion` respected)

- Page transition: fade +8px slide,250ms on route change (client wrapper)
- Card hover: `scale(1.02)` + `shadow-elevate` + image `scale(1.06)` zoom
- Button `:active`: `scale(.98)` +1px lift (global, disabled excluded)
- Skeleton: brand shimmer (`track → gold-tint → track`), card-shaped
- Toasts: slide-up + `shadow-pop`
- Flutter: `PageTransitionsTheme` (fade-up180ms), card press `AnimatedScale`,
  `Hero` on listing images

## 5. Enforcement

- Existing compliance tests extended: web↔admin byte-identical tokens,
  hex-free (now also scanning `mobile/lib` with `theme.dart` as the only
  allowed file), web↔mobile colour alignment assert, no white-on-gold,
  gold-dark large-text-only, dark values AA-checked in the design e2e spec
  (toggle → computed styles → ratios).
