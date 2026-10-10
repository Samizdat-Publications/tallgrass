"""Land stats (r-land): numbers for the two things the wide golden frames are judged on.

  glare   share of pixels in the top 40% of the frame that are near white (min channel > 235), and the mean lightness there.
          A blown-out sun side is the first thing the eye goes to; the concept image has about none.
  ripple  mean absolute difference of the luminance band-pass of it (a 7 x 7 box minus a 25 x 25 box: ripples 10 to 50 px across), over the
          middle band (y 28% to 66%), as a ratio of the local mean luminance. A crumpled-paper, dune-ripple ground has a
          high number; calm rolling prairie has a lower one. (Relative: compare the same frame before and after.)
  hue     mean hue spread (std of the a* channel and of the b* channel) over the whole frame: how much colour variation
          the ground carries. Higher means more patchwork, up to a point.

Usage: python tools/land_stats.py a.jpg b.jpg ...   (prints one row per image; no files are written)
"""
import sys

import numpy as np
from PIL import Image


def box(a, r):
    k = 2 * r + 1
    p = np.pad(a, r, mode="edge")
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def lab_ab(rgb):
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2]), 116 * f[..., 1] - 16


def stats(path):
    im = np.asarray(Image.open(path).convert("RGB"))
    h, w, _ = im.shape
    top = im[: int(h * 0.4)]
    white = float((top.min(axis=2) > 235).mean())
    clip = float((top.max(axis=2) >= 252).mean())
    lum = (0.2126 * im[..., 0] + 0.7152 * im[..., 1] + 0.0722 * im[..., 2]).astype(np.float64)
    band = slice(int(h * 0.28), int(h * 0.66))
    hp = np.abs(box(lum, 3) - box(lum, 12))[band]
    ripple = float(hp.mean() / max(lum[band].mean(), 1.0))
    a, b, L = lab_ab(im)
    return white, clip, float(L[: int(h * 0.4)].mean()), ripple, float(a.std()), float(b.std())


if __name__ == "__main__":
    print(f"{'image':56s} {'white%':>7s} {'clip%':>7s} {'L*top':>6s} {'ripple':>7s} {'a_sd':>6s} {'b_sd':>6s}")
    for p in sys.argv[1:]:
        w, c, L, r, sa, sb = stats(p)
        print(f"{p[-56:]:56s} {w * 100:7.1f} {c * 100:7.1f} {L:6.1f} {r:7.4f} {sa:6.2f} {sb:6.2f}")
