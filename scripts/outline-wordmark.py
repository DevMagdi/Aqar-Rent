#!/usr/bin/env python3
"""Convert the Aqar Rent wordmarks into pure SVG outlines.

Why: the brand kit must not depend on a font being installed or loaded. The
logo ships as geometry only, so it renders identically in a browser, in a
PDF, in Figma and in an SVG rasteriser.

* Arabic wordmark  «عقار رينت» — El Messiri Bold (mobile/assets/fonts)
* English wordmark «Aqar Rent» — IBM Plex Sans Arabic Bold (same weight feel)

Shaping is done with HarfBuzz so the Arabic comes out with real ligatures and
contextual forms (no broken letter forms from naive codepoint concatenation).

Output: design/wordmark-outlines.json  (consumed by scripts/build-brand-kit.mjs)

Usage (needs a venv with fonttools + uharfbuzz; see .venv in the repo):
    .venv/bin/python scripts/outline-wordmark.py
"""
from __future__ import annotations

import json
import pathlib
import sys

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "design" / "wordmark-outlines.json"

FONTS = {
    # key: (path, text, language, script, tracking-in-font-units)
    "ar": (ROOT / "mobile/assets/fonts/ElMessiriArabic-700.ttf", "عقار رينت", "ar", "Arab", 0),
    "en": (ROOT / "mobile/assets/fonts/IBMPlexSansArabic-Bold.ttf", "Aqar Rent", "en", "Latn", 0),
    # Latin caps lockup line and the wide-tracked tagline, both outlined for the
    # same reason: the logo must never ask the viewer to have a font installed.
    "enCaps": (ROOT / "mobile/assets/fonts/IBMPlexSansArabic-Bold.ttf", "AQAR RENT", "en", "Latn", 40),
    "tagline": (ROOT / "mobile/assets/fonts/IBMPlexSansArabic-SemiBold.ttf", "RENT DIRECT", "en", "Latn", 220),
    "arTagline": (ROOT / "mobile/assets/fonts/ElMessiriArabic-600.ttf", "إيجارك مباشرة من المالك", "ar", "Arab", 0),
}


def shape(font_path: pathlib.Path, text: str, lang: str, script: str, tracking: float = 0.0):
    tt = TTFont(str(font_path), fontNumber=0)
    upem = tt["head"].unitsPerEm
    glyph_set = tt.getGlyphSet()
    glyph_order = tt.getGlyphOrder()

    blob = hb.Blob.from_file_path(str(font_path))
    face = hb.Face(blob)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    buf.direction = "rtl" if script == "Arab" else "ltr"
    buf.script = script
    buf.language = lang
    hb.shape(font, buf, {"kern": True, "liga": True, "calt": True})

    pen = SVGPathPen(glyph_set, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    bounds = BoundsPen(glyph_set)
    x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = glyph_order[info.codepoint] if info.codepoint < len(glyph_order) else None
        if name and name != ".notdef" and pos.x_advance != 0:
            # SVG is y-down: flip the glyph and drop it onto the baseline.
            t = TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, pos.y_offset))
            glyph_set[name].draw(t)
            # bounds measured by the pen itself — never by re-parsing the path
            glyph_set[name].draw(TransformPen(bounds, (1, 0, 0, -1, x + pos.x_offset, pos.y_offset)))
        x += pos.x_advance
        if pos.x_advance:
            x += tracking
    return pen.getCommands(), bounds.bounds, upem, x


def main() -> int:
    out: dict[str, dict] = {}
    for key, (path, text, lang, script, tracking) in FONTS.items():
        if not path.exists():
            print(f"missing font: {path}", file=sys.stderr)
            return 1
        d, bbox, upem, advance = shape(path, text, lang, script, tracking)
        if not bbox:
            print(f"empty outline for {key}", file=sys.stderr)
            return 1
        x0, y0, x1, y1 = bbox
        pad = upem * 0.02
        vb = (round(x0 - pad, 1), round(y0 - pad, 1), round(x1 - x0 + 2 * pad, 1), round(y1 - y0 + 2 * pad, 1))
        # Normalise to a 1000-unit-ish height so both languages share a scale.
        scale = 1000.0 / vb[3]
        out[key] = {
            "text": text,
            "font": path.name,
            "unitsPerEm": upem,
            "advance": advance,
            "tracking": tracking,
            "path": d,
            "viewBox": [round(v, 2) for v in vb],
            # how to place the outline inside the lockup canvas
            "scale": round(scale, 5),
            "width": round(vb[2] * scale, 2),
            "height": round(vb[3] * scale, 2),
        }
        print(f"{key}: {text!r} glyphs ok, advance={advance:.1f}, bbox={vb}, wordmark={out[key]['width']}x{out[key]['height']}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
