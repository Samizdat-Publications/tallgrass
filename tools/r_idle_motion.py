"""r-idle: measure how much each staged animal moves in a burst of clipped screenshots made by tools/r_idle_shots.mjs (run with ?grass=0 so the
only thing that changes between frames is the animals; the same run with ?idle=0 is the control).

Each scene folder holds frames f000.jpg.. with a time stamp each (meta.json). For every animal's box the mean absolute grey difference is taken between
frames about 0.5 s and about 2 s apart (pairs picked by their stamps), and "moves" counts the share of 0.5 s pairs that differ by more than a noise floor
(JPEG noise on a static scene is about 0.3). The result is the number the round-26 critic's eye is asking for: is anything in the box moving?

Usage: python tools/r_idle_motion.py <run dir> [<control run dir>]
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

NAMES = {0: 'bison', 1: 'wolf', 3: 'pronghorn', 5: 'cougar', 6: 'coyote', 10: 'muledeer'}
STATE = {0: 'stand', 1: 'graze', 6: 'feed', 8: 'rest'}
FLOOR = 0.6


def load(d, name, sc):
    fr = []
    for k in range(len(sc['stamps'])):
        im = Image.open(os.path.join(d, name, f'f{k:03d}.jpg')).convert('L')
        # high-pass: a cloud shadow or the sun's slow change moves the whole picture's brightness, not the animal's shape
        a = np.asarray(im, dtype=np.float32) - np.asarray(im.filter(ImageFilter.GaussianBlur(6)), dtype=np.float32)
        fr.append(a)
    return fr


def pairs(stamps, lag):
    out = []
    j = 0
    for i, t in enumerate(stamps):
        while j < len(stamps) and stamps[j] < t + lag:
            j += 1
        if j >= len(stamps):
            break
        out.append((i, j))
    return out


def run(d):
    meta = json.load(open(os.path.join(d, 'meta.json')))
    res = {}
    for name, sc in meta['scenes'].items():
        if not sc.get('stamps'):
            continue
        fr = load(d, name, sc)
        cl = sc['clip']
        rows = []
        for b in sc['boxes']:
            h = b['half']
            x0, x1 = int(b['x'] - h * 1.15 - cl['x']), int(b['x'] + h * 1.15 - cl['x'])
            y0, y1 = int(b['y'] - h * 0.85 - cl['y']), int(b['y'] + h * 0.85 - cl['y'])
            x0, y0 = max(0, x0), max(0, y0)
            cs = [f[y0:y1, x0:x1] for f in fr]
            out = []
            for lag in (0.5, 2.0):
                ds = [float(np.abs(cs[j] - cs[i]).mean()) for i, j in pairs(sc['stamps'], lag)]
                out.append((float(np.mean(ds)) if ds else 0.0, float(np.mean([d_ > FLOOR for d_ in ds])) if ds else 0.0))
            rows.append((NAMES.get(b['sp'], b['sp']), STATE.get(b['st'], b['st']), out))
        res[name] = (len(fr), sc['stamps'][-1] / max(1, len(fr) - 1), rows)
    return res


if __name__ == '__main__':
    runs = [run(d) for d in sys.argv[1:3]]
    tot = [[], []]
    for name in runs[0]:
        n, dt, rows = runs[0][name]
        print(f'== {name}  ({n} frames, {1 / dt:.1f} per second)')
        print(f'{"animal":10s} {"state":6s} {"d(0.5s)":>8s} {"moves":>6s} {"d(2s)":>8s}' + ('   | control: d(0.5s) moves  d(2s)   gain(0.5s)' if len(runs) > 1 else ''))
        for i, (a, st, o) in enumerate(rows):
            line = f'{a:10s} {st:6s} {o[0][0]:8.2f} {o[0][1]:6.0%} {o[1][0]:8.2f}'
            if len(runs) > 1 and name in runs[1] and i < len(runs[1][name][2]):
                c = runs[1][name][2][i][2]
                line += f'   | {c[0][0]:18.2f} {c[0][1]:5.0%} {c[1][0]:7.2f}   {o[0][0] / max(c[0][0], 0.05):6.1f}x'
                tot[0].append(o[0][1]); tot[1].append(c[0][1])
            print(line)
    if tot[0]:
        print(f'\nshare of 0.5 s pairs in which the animal visibly changed: idle on {np.mean(tot[0]):.0%}, idle off {np.mean(tot[1]):.0%}')
