"""Look stats: compare captures with the concept image, band by band (DAY-PLAN.md, the free stand-in for the Gemini concept score).

Each image is split into four horizontal bands (sky 0-22%, far 22-42%, mid 42-68%, near 68-100% of the height) plus the whole
frame. Per band: mean lightness L* (0 to 100), chroma C* (colourfulness), hue angle h (degrees, 60 to 90 is gold), the contrast
(standard deviation of L*) and the warm share (pixels with hue 40 to 100 and C* > 15). The distance to the concept is a weighted
sum of the band differences; lower is closer.

Usage:
  .venv/Scripts/python tools/look_stats.py review/wip/day/baseline/lk_01_concept.jpg [more images ...]
  .venv/Scripts/python tools/look_stats.py --dir review/wip/day/baseline --glob "lk_0[12]*.jpg"
Writes nothing; prints a table. --ref picks another reference (default art/concept/00_prairie_golden_hour.jpg).
"""
import argparse
import glob
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANDS = [("sky", 0.0, 0.22), ("far", 0.22, 0.42), ("mid", 0.42, 0.68), ("near", 0.68, 1.0), ("all", 0.0, 1.0)]


def srgb_to_lab(rgb):
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return L, a, b


def stats(path):
    im = Image.open(path).convert("RGB")
    im = im.resize((480, int(480 * im.height / im.width)), Image.BILINEAR)
    L, a, b = srgb_to_lab(np.asarray(im))
    C = np.hypot(a, b)
    h = (np.degrees(np.arctan2(b, a)) + 360) % 360
    H = L.shape[0]
    out = {}
    for name, y0, y1 in BANDS:
        sl = slice(int(H * y0), max(int(H * y0) + 1, int(H * y1)))
        Lb, ab, bb, Cb, hb = L[sl], a[sl], b[sl], C[sl], h[sl]
        warm = np.mean((hb > 40) & (hb < 100) & (Cb > 15))
        out[name] = dict(L=float(Lb.mean()), C=float(Cb.mean()), h=float((math.degrees(math.atan2(bb.mean(), ab.mean())) + 360) % 360),
                         sd=float(Lb.std()), warm=float(warm))
    return out


def dist(s, r):
    d = 0.0
    for name, *_ in BANDS[:4]:
        x, y = s[name], r[name]
        dh = abs((x["h"] - y["h"] + 180) % 360 - 180)
        d += abs(x["L"] - y["L"]) / 10 + abs(x["C"] - y["C"]) / 8 + dh / 15 + abs(x["sd"] - y["sd"]) / 8 + abs(x["warm"] - y["warm"]) * 5
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="*")
    ap.add_argument("--dir")
    ap.add_argument("--glob", default="*.jpg")
    ap.add_argument("--ref", default=os.path.join(ROOT, "art", "concept", "00_prairie_golden_hour.jpg"))
    a = ap.parse_args()
    imgs = list(a.images)
    if a.dir:
        imgs += sorted(glob.glob(os.path.join(a.dir, a.glob)))
    if not imgs:
        sys.exit("no images")
    ref = stats(a.ref)
    rows = [("concept", ref, 0.0)] + [(os.path.relpath(p, ROOT), s, dist(s, ref)) for p in imgs for s in [stats(p)]]
    print(f"{'image':58s} {'dist':>5s} | " + " | ".join(f"{n:^25s}" for n, *_ in BANDS))
    print(f"{'':58s} {'':>5s} | " + " | ".join(f"{'L':>4s} {'C':>4s} {'h':>4s} {'sd':>4s} {'warm':>4s}" for _ in BANDS))
    for name, s, d in rows:
        cells = " | ".join(f"{s[b]['L']:4.0f} {s[b]['C']:4.0f} {s[b]['h']:4.0f} {s[b]['sd']:4.0f} {s[b]['warm']:4.2f}" for b, *_ in BANDS)
        print(f"{name[-58:]:58s} {d:5.1f} | {cells}")


if __name__ == "__main__":
    main()
