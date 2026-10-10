"""r-idle: measure how much each staged animal moves in a recording made by tools/r_idle_shots.mjs.

For every scene window the video is cut into frames at 8 fps (what the round-26 critic saw), and for every animal's screen box the mean absolute
grey difference is taken between each frame and the frame 0.5 s and 2 s earlier. A box with the grass swaying and nothing else scores low; an animal
that breathes, turns its head or flicks an ear scores higher. A reference box on bare grass away from the animals gives the wind floor.

Usage: python tools/r_idle_motion.py scratch/r_idle/on [scratch/r_idle/off]    (prints a table; with two runs, a side by side with the ratio)
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

FPS = 8
NAMES = {0: 'bison', 1: 'wolf', 3: 'pronghorn', 5: 'cougar', 6: 'coyote', 10: 'muledeer'}
STATE = {0: 'stand', 1: 'graze', 6: 'feed', 8: 'rest'}


def frames(video, t0, secs, tmp):
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t0:.3f}', '-t', f'{secs:.3f}', '-i', video, '-vf', f'fps={FPS}', os.path.join(tmp, 'f%04d.png')], check=True)
    fs = sorted(os.listdir(tmp))
    return [np.asarray(Image.open(os.path.join(tmp, f)).convert('L'), dtype=np.float32) for f in fs]


def crop(a, x, y, hx, hy):
    h, w = a.shape
    x0, x1 = int(max(0, x - hx)), int(min(w, x + hx))
    y0, y1 = int(max(0, y - hy)), int(min(h, y + hy))
    return a[y0:y1, x0:x1]


def score(fr, x, y, half):
    hx, hy = half * 1.15, half * 0.8
    cs = [crop(a, x, y, hx, hy) for a in fr]
    lag = lambda k: float(np.mean([np.abs(cs[i + k] - cs[i]).mean() for i in range(len(cs) - k)]))
    peak = float(max(np.abs(c - cs[0]).mean() for c in cs))
    return lag(1), lag(4), lag(FPS * 2 - 1) if len(cs) > FPS * 2 else peak, peak


def run(d):
    meta = json.load(open(os.path.join(d, 'meta.json')))
    video = os.path.join(d, 'run.webm')
    res = {}
    with tempfile.TemporaryDirectory() as tmp:
        for name, sc in meta['scenes'].items():
            fr = frames(video, sc['tStart'], sc['tEnd'] - sc['tStart'], tmp)
            W, H = meta['size']
            ref = [crop(a, W * 0.5, H * 0.93, 60, 14) for a in fr]  # bare grass near the bottom edge, no animal there
            wind = float(np.mean([np.abs(ref[i + 1] - ref[i]).mean() for i in range(len(ref) - 1)])) if len(ref) > 1 else 0.0
            rows = []
            for b in sc['boxes']:
                s = score(fr, b['x'], b['y'], b['half'])
                rows.append((NAMES.get(b['sp'], b['sp']), STATE.get(b['st'], b['st']), s))
            res[name] = (wind, rows, len(fr))
    return res


if __name__ == '__main__':
    runs = [run(d) for d in sys.argv[1:3]]
    for name in runs[0]:
        wind, rows, n = runs[0][name]
        print(f'== {name}  ({n} frames at {FPS} fps, grass-only reference box lag-1 diff {wind:.2f})')
        print(f'{"animal":10s} {"state":6s} {"lag0.125s":>10s} {"lag0.5s":>9s} {"lag2s":>8s} {"peak":>7s}' + ('   | idle off: lag0.5s  lag2s   ratio(0.5s)' if len(runs) > 1 else ''))
        for i, (a, st, s) in enumerate(rows):
            line = f'{a:10s} {st:6s} {s[0]:10.2f} {s[1]:9.2f} {s[2]:8.2f} {s[3]:7.2f}'
            if len(runs) > 1 and name in runs[1] and i < len(runs[1][name][1]):
                o = runs[1][name][1][i][2]
                line += f'   | {o[1]:19.2f} {o[2]:7.2f}   {s[1] / max(o[1], 1e-6):6.2f}x'
            print(line)
