"""Generate 3 visually distinct JPEG fixtures for e2e uploads (run once)."""
import random
import sys

from PIL import Image, ImageDraw

random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 42)  # unique per run
SPECS = [
    ("fixtures/photo1.jpg", (200, 90, 60), [(50, 40, 300, 200)]),
    ("fixtures/photo2.jpg", (60, 140, 200), [(20, 20, 200, 180), (350, 250, 700, 550)]),
    ("fixtures/photo3.jpg", (90, 170, 90), [(400, 30, 760, 260), (60, 300, 260, 560)]),
]

for name, bg, rects in SPECS:
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
    img.save(name, "JPEG", quality=85)
    print("wrote", name)
