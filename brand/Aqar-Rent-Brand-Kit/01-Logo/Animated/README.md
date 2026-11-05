# Animated mark

`aqar-mark-draw.svg` is self-contained SMIL: the hexagon draws, then the house
and keyhole appear. It honours `prefers-reduced-motion` through an inline media
query, so it can be embedded with `<img>` or `<object>` with no JavaScript.

It is **not** shipped as a Lottie file: Lottie would add a ~500 KB runtime to the
web bundle and a dependency to the app for one 1.6 s stroke animation. The SVG is
1.5 KB and runs natively in every target. (Design spec: “optional lottie” —
declined for bundle budget; see docs/design/visual-identity-report.md.)
