"""Build the compact ground detail set (public/textures/ground) from Poly Haven 1K scans (CC0).

Usage: python tools/build_ground_textures.py <srcDir>
  srcDir holds <id>_diff.jpg and <id>_nor.jpg (Poly Haven 1k jpg, nor_gl) for every id in MATERIALS.
  See CREDITS.md for the sources. Output per material: <name>.jpg (512 x 512, RGB, one texture fetch in the shader).

<name>.jpg is not an albedo. B is the HIGH-PASS luminance ratio of the scan (albedo / its own blurred self), log encoded
(v = 0.5 + 0.25 * log2(ratio)), so the ground shader (terrain.ts, tgGdSample) multiplies the existing palette by it and the
scan only adds value structure, never a new colour or a tile-sized blotch. R and G are the surface slope of the GL tangent
normal (dx, dy over the unit step, with the low-frequency tilt removed), encoded as v = 0.5 + slope / (2 * SLOPE_MAX).
"""
import sys, os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

SIZE = 512
SLOPE_MAX = 1.5
# name -> (poly haven id, luminance contrast gain, chroma keep, blur sigma px, normal gain)
MATERIALS = {
    'litter': ('withered_grass', 1.0, 0.55, 44, 1.0),
    'soil':   ('brown_mud_dry', 1.0, 0.5, 44, 1.0),
    'stony':  ('grass_path_2', 1.0, 0.45, 44, 1.0),
    'mud':    ('brown_mud_03', 1.0, 0.5, 44, 1.0),
    'ash':    ('burned_ground_01', 0.9, 0.35, 44, 1.0),
    'snow':   ('snow_02', 1.0, 0.0, 44, 1.0),
}

def load_rgb(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0

def resize(a, n):
    out = [np.asarray(Image.fromarray(a[..., c]).resize((n, n), Image.LANCZOS), dtype=np.float32) for c in range(a.shape[2])]
    return np.stack(out, -1)

def seamless(a, border=0.5):
    """Make a crop tile: cross-fade with itself shifted by half a tile, weight 1 at the centre, 0 at the seams."""
    h, w = a.shape[:2]
    sh = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]
    x = np.abs(np.linspace(-1, 1, w))[None, :]
    wgt = (1 - np.maximum(x, y))
    wgt = np.clip(wgt / border, 0, 1)
    wgt = wgt * wgt * (3 - 2 * wgt)
    return a * wgt[..., None] + sh * (1 - wgt[..., None])

def build(name, spec, src, out):
    pid, gain, chroma, sig, ngain = spec
    d = load_rgb(os.path.join(src, pid + '_diff.jpg'))
    n = load_rgb(os.path.join(src, pid + '_nor.jpg')) * 2 - 1
    if name == 'snow':
        # the scan has a few boot prints and footprints: take the cleanest quadrant region and make it tile
        y0, x0, s = 240, 176, 512
        d = d[y0:y0 + s, x0:x0 + s]
        n = n[y0:y0 + s, x0:x0 + s]
        d = seamless(d)
        n = seamless(n)
    d = resize(d, SIZE)
    n = resize(n, SIZE)
    lin = np.power(np.clip(d, 0, 1), 2.2)
    blur = np.stack([gaussian_filter(lin[..., c], sig, mode='wrap') for c in range(3)], -1)
    lr = np.log2(np.maximum(lin, 0.01) / np.maximum(blur, 0.01))
    ll = lr.mean(-1, keepdims=True)
    lr = ll * gain + (lr - ll) * chroma
    lr -= lr.mean((0, 1), keepdims=True)   # the mean of the log ratio is 0, so the far mips (and any distance) leave the palette alone
    if name == 'snow':
        lr = np.clip(lr, -0.25, 0.4)
        lr -= lr.mean((0, 1), keepdims=True)
    luma = lr.mean(-1) if chroma <= 0 else lr[..., 0] * 0.2126 + lr[..., 1] * 0.7152 + lr[..., 2] * 0.0722
    luma -= luma.mean()
    v = np.clip(0.5 + 0.25 * luma, 0, 1)
    # normal: slope field minus its low-frequency part
    nz = np.maximum(n[..., 2:3], 0.2)
    sl = n[..., :2] / nz
    sl = sl - np.stack([gaussian_filter(sl[..., c], sig, mode='wrap') for c in range(2)], -1)
    sl *= ngain
    if name == 'snow':
        # soften the few footprints left in the crop into wind ripples
        m = np.linalg.norm(sl, axis=-1, keepdims=True)
        sl = sl / np.maximum(1.0, m / 0.16)
    sl = np.clip(sl, -SLOPE_MAX, SLOPE_MAX)
    img = np.concatenate([0.5 + sl / (2 * SLOPE_MAX), v[..., None]], -1)
    Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, name + '.jpg'), quality=92, subsampling=0)
    print(name, pid, 'ok', 'luma std %.3f' % luma.std(), 'slope std %.3f' % sl.std())

if __name__ == '__main__':
    src = sys.argv[1]
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'textures', 'ground')
    os.makedirs(out, exist_ok=True)
    for k, v in MATERIALS.items():
        build(k, v, src, out)
