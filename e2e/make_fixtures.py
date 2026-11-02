"""Generate distinct JPEG fixtures for e2e uploads (run once per test run).

The backend's perceptual-hash guard rejects the same owner re-using photos
across listings, so every spec gets its own photo set and every run gets
fresh noise (seed = argv[1]).
"""
import random
import sys

from PIL import Image, ImageDraw

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 42

# set name -> list of (bg, rects) blueprints; noise is seeded per file
SETS = {
    "photo": [  # UI wizard (owner journey)
        ((200, 90, 60), [(50, 40, 300, 200)]),
        ((60, 140, 200), [(20, 20, 200, 180), (350, 250, 700, 550)]),
        ((90, 170, 90), [(400, 30, 760, 260), (60, 300, 260, 560)]),
    ],
    "apiA": [  # owner-lifecycle spec
        ((180, 60, 140), [(80, 60, 420, 300), (500, 350, 780, 580)]),
        ((50, 160, 150), [(30, 30, 770, 120)]),
        ((230, 200, 70), [(120, 200, 300, 580), (420, 80, 700, 300)]),
    ],
    "apiB": [  # payments spec
        ((70, 90, 210), [(60, 60, 240, 400), (320, 120, 760, 500)]),
        ((210, 130, 40), [(40, 400, 760, 560)]),
        ((120, 60, 180), [(200, 40, 600, 220), (80, 320, 500, 580)]),
    ],
    "apiC": [  # public/SEO spec
        ((40, 130, 90), [(100, 80, 700, 340)]),
        ((240, 160, 60), [(30, 30, 350, 560), (450, 220, 780, 480)]),
        ((60, 70, 160), [(520, 60, 780, 540), (40, 140, 460, 300)]),
    ],
    "apiD": [  # tenant favorites/report spec
        ((150, 40, 90), [(60, 60, 740, 240), (60, 320, 400, 560)]),
        ((30, 110, 200), [(240, 40, 760, 560)]),
        ((200, 220, 50), [(40, 40, 760, 160), (40, 220, 340, 560)]),
    ],
}


def make(path: str, bg, rects, seed: int) -> None:
    random.seed(seed)
    img = Image.new("RGB", (800, 600), bg)
    d = ImageDraw.Draw(img)
    for i, r in enumerate(rects):
        d.rectangle(r, fill=(240 - i * 40, 230 - i * 30, 210))
    px = img.load()
    for _ in range(20000):
        x, y = random.randrange(800), random.randrange(600)
        c = px[x, y]
        px[x, y] = (
            max(0, min(255, c[0] + random.randint(-40, 40))),
            max(0, min(255, c[1] + random.randint(-40, 40))),
            max(0, min(255, c[2] + random.randint(-40, 40))),
        )
    img.save(path, "JPEG", quality=85)


import os

os.makedirs("fixtures", exist_ok=True)

for set_name, blueprints in SETS.items():
    for i, (bg, rects) in enumerate(blueprints, start=1):
        out = f"fixtures/{set_name}{i}.jpg"
        make(out, bg, rects, SEED * 100 + i + hash(set_name) % 97)
        print("wrote", out)
