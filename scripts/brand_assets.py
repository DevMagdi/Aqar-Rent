#!/usr/bin/env python3
"""Generate every brand raster asset from the Mantiq palette.

Why this script exists
----------------------
The app icon, adaptive-icon foreground, splash mark, iOS AppIcon set and the
Android mipmaps are all *derived* from one geometry + one palette. Generating
them here means a palette change is a one-line edit, and CI can re-run the
generator to prove the shipped PNGs still match the identity (no leftover
terracotta: the old icons were flat #A93408).

Usage:  python3 scripts/brand_assets.py           (writes assets in place)
        python3 scripts/brand_assets.py --check   (verify, write nothing)

Requires: Pillow (already a backend dev dependency for image handling).
"""
from __future__ import annotations

import argparse
import io
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import json

REPO = Path(__file__).resolve().parent.parent
BRAND_DIR = REPO / "mobile" / "assets" / "brand"
IOS_ICONS = REPO / "mobile" / "ios" / "Runner" / "Assets.xcassets" / "AppIcon.appiconset"
IOS_LAUNCH = REPO / "mobile" / "ios" / "Runner" / "Assets.xcassets" / "LaunchImage.imageset"
ANDROID_RES = REPO / "mobile" / "android" / "app" / "src" / "main" / "res"

# ── The palette. Read from design/tokens.json — never hand-written here. ────
_TOKENS = json.loads((REPO / "design" / "tokens.json").read_text(encoding="utf-8"))


def _rgb(name: str, theme: str = "light") -> tuple[int, int, int]:
    """Resolve a design token to RGB. Raises loudly if someone renames one."""
    value = _TOKENS["color"][theme][name]["value"]
    if not value.startswith("#") or len(value) != 7:
        raise SystemExit(f"token {name!r} is not a solid hex colour: {value!r}")
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16))


NAVY = _rgb("brand")
NAVY_DEEP = _rgb("brand-deep")
NAVY_RAISED = _rgb("network")
GOLD = _rgb("gold")
GOLD_LIGHT = _rgb("gold-light")
GOLD_DARK = _rgb("gold-dark")
ON_DARK = _rgb("on-dark")

PALETTE = [NAVY, NAVY_DEEP, NAVY_RAISED, GOLD, GOLD_LIGHT, GOLD_DARK, ON_DARK]

SS = 4  # supersampling factor


def hexed(rgb: tuple[int, int, int]) -> str:
    return "#" + "".join(f"{c:02X}" for c in rgb)


# ── geometry helpers (all coordinates in the 48×48 logo space) ──────────────

def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _quad(p0, p1, p2, steps=24):
    return [_lerp(_lerp(p0, p1, t / steps), _lerp(p1, p2, t / steps), t / steps) for t in range(steps + 1)]


def stroke(draw: ImageDraw.ImageDraw, points, width, fill, scale, origin):
    """Round-capped, round-joined polyline stroke."""
    pts = [(origin[0] + x * scale, origin[1] + y * scale) for x, y in points]
    w = width * scale
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length * w / 2, dx / length * w / 2
        draw.polygon([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], fill=fill)
    for x, y in pts:
        draw.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fill)


def ellipse(draw, cx, cy, rx, ry, fill, scale, origin):
    x, y = origin[0] + cx * scale, origin[1] + cy * scale
    draw.ellipse([x - rx * scale, y - ry * scale, x + rx * scale, y + ry * scale], fill=fill)


def filled_shape(draw, points, fill, scale, origin):
    draw.polygon([(origin[0] + x * scale, origin[1] + y * scale) for x, y in points], fill=fill)


ROOF = [(11.5, 22.4), (24, 12.2), (36.5, 22.4)]
BODY = (
    [(15.1, 22.4), (15.1, 30.6)]
    + _quad((15.1, 30.6), (15.1, 35.7), (20.2, 35.7))[1:]
    + [(27.8, 35.7)]
    + _quad((27.8, 35.7), (32.9, 35.7), (32.9, 30.6))[1:]
    + [(32.9, 22.4)]
)


def draw_mark(img: Image.Image, origin, scale, gold=GOLD, gold_light=GOLD_LIGHT, gold_dark=GOLD_DARK):
    """Roof + house outline + gold keyhole. Rendered on a supersampled canvas."""
    draw = ImageDraw.Draw(img)
    # Two-tone gold: the roof catches the light, the body sits deeper.
    stroke(draw, ROOF, 2.7, gold_light, scale, origin)
    stroke(draw, BODY, 2.7, gold, scale, origin)
    # Keyhole: teardrop = circle + tapered triangle, gold-dark for depth.
    filled_shape(draw, [(24, 26.9), (26.2, 31.4), (21.8, 31.4)], gold_dark, scale, origin)
    ellipse(draw, 24, 30.6, 3.05, 3.05, gold, scale, origin)
    ellipse(draw, 24, 30.0, 1.1, 1.1, NAVY, scale, origin)


def _gradient(size: int, top, bottom) -> Image.Image:
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img.resize((size, size), Image.NEAREST)


def render_icon(size: int, *, transparent: bool = False, mark_ratio: float = 0.68) -> Image.Image:
    """Store/launcher icon: navy gradient canvas + gold mark, no rounded corners."""
    big = size * SS
    if transparent:
        img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    else:
        img = _gradient(big, NAVY_DEEP, NAVY).convert("RGBA")
    mark = mark_ratio * big
    origin = ((big - mark) / 2, (big - mark) / 2 + big * 0.005)
    draw_mark(img, origin, mark / 48)
    return img.resize((size, size), Image.LANCZOS)


def render_tile(size: int, radius_ratio: float = 0.225) -> Image.Image:
    """Legacy launcher icon: rounded navy tile (adaptive icons mask themselves)."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * radius_ratio), fill=255)
    img.paste(_gradient(big, NAVY_DEEP, NAVY).convert("RGBA"), (0, 0), mask)
    mark = 0.66 * big
    draw_mark(img, ((big - mark) / 2, (big - mark) / 2), mark / 48)
    return img.resize((size, size), Image.LANCZOS)


def render_mark(size: int) -> Image.Image:
    """Splash mark: transparent canvas, full-bleed geometry."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw_mark(img, (0, 0), big / 48)
    return img.resize((size, size), Image.LANCZOS)


def png_bytes(img: Image.Image, *, opaque: bool = False) -> bytes:
    buf = io.BytesIO()
    (img.convert("RGB") if opaque else img).save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def targets() -> list[tuple[Path, bytes]]:
    out: list[tuple[Path, bytes]] = []
    web_icons = REPO / "web" / "public" / "icons"

    # Master assets (source of truth for docs/store submissions)
    out.append((BRAND_DIR / "app_icon.png", png_bytes(render_icon(1024), opaque=True)))
    out.append((BRAND_DIR / "app_icon_foreground.png", png_bytes(render_icon(1024, transparent=True, mark_ratio=0.5))))
    out.append((BRAND_DIR / "splash_logo.png", png_bytes(render_mark(512))))
    out.append((BRAND_DIR / "play_store_icon.png", png_bytes(render_icon(512), opaque=True)))

    # Web install icons (manifest + apple-touch-icon)
    out.append((web_icons / "icon-192.png", png_bytes(render_icon(192), opaque=True)))
    out.append((web_icons / "icon-512.png", png_bytes(render_icon(512), opaque=True)))
    out.append((web_icons / "apple-touch-icon.png", png_bytes(render_icon(180), opaque=True)))
    # Maskable: mark inside the 80% safe circle on a full-bleed navy field.
    out.append((web_icons / "maskable-512.png", png_bytes(render_icon(512, mark_ratio=0.52), opaque=True)))

    # iOS AppIcon: opaque (App Store rejects alpha) — reuse the shared sizes.
    ios_sizes = {
        "Icon-App-40x40pt.png": 40, "Icon-App-58x58pt.png": 58, "Icon-App-60x60pt.png": 60,
        "Icon-App-76x76pt.png": 76, "Icon-App-80x80pt.png": 80, "Icon-App-87x87pt.png": 87,
        "Icon-App-114x114pt.png": 114, "Icon-App-120x120pt.png": 120, "Icon-App-128x128pt.png": 128,
        "Icon-App-152x152pt.png": 152, "Icon-App-167x167pt.png": 167, "Icon-App-180x180pt.png": 180,
        "Icon-App-256x256pt.png": 256, "Icon-App-512x512pt.png": 512, "Icon-App-1024x1024pt.png": 1024,
    }
    master = render_icon(1024)
    for name, px in ios_sizes.items():
        out.append((IOS_ICONS / name, png_bytes(master.resize((px, px), Image.LANCZOS), opaque=True)))
    out.append((IOS_LAUNCH / "LaunchImage.png", png_bytes(render_mark(512))))

    # Android densities
    legacy = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    foreground = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    splash = {"mdpi": 72, "hdpi": 108, "xhdpi": 144, "xxhdpi": 216, "xxxhdpi": 288}
    for bucket, px in legacy.items():
        out.append((ANDROID_RES / f"mipmap-{bucket}" / "ic_launcher.png", png_bytes(render_tile(px))))
    for bucket, px in foreground.items():
        out.append((ANDROID_RES / f"mipmap-{bucket}" / "ic_launcher_foreground.png", png_bytes(render_icon(px, transparent=True, mark_ratio=0.5))))
    for bucket, px in splash.items():
        out.append((ANDROID_RES / f"mipmap-{bucket}" / "splash_logo.png", png_bytes(render_mark(px))))

    manifest = "\n".join(
        [
            "# Generated by scripts/brand_assets.py — do not hand-edit.",
            "# Aqar Rent identity: navy + gold only, values from design/tokens.json.",
            *[hexed(c) for c in PALETTE],
            "",
        ]
    ).encode()
    out.append((BRAND_DIR / "palette.txt", manifest))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify without writing")
    args = parser.parse_args()

    drifted: list[str] = []
    for path, data in targets():
        if args.check:
            if not path.exists() or path.read_bytes() != data:
                drifted.append(str(path.relative_to(REPO)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    if args.check:
        if drifted:
            print("Brand assets out of date (run scripts/brand_assets.py):")
            for item in drifted:
                print(f"  · {item}")
            return 1
        print(f"Brand assets in sync: {len(targets())} files")
        return 0

    print(f"Wrote {len(targets())} brand assets.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
