"""r-idle: per-animal filmstrips from the frame bursts of tools/r_idle_shots.mjs: one row per staged animal, columns at a fixed step in time.
Usage: python tools/r_idle_strips.py <run dir> <scene> <out.jpg> [columns=6] [step_s=0.6] [t0_s=1] [scale=2]"""
import json, os, sys
from PIL import Image

d, scene, outp = sys.argv[1:4]
n = int(sys.argv[4]) if len(sys.argv) > 4 else 6
step = float(sys.argv[5]) if len(sys.argv) > 5 else 0.6
t0 = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0
sc = json.load(open(os.path.join(d, 'meta.json')))['scenes'][scene]
cl, st = sc['clip'], sc['stamps']
idx = [min(range(len(st)), key=lambda i: abs(st[i] - (t0 + k * step))) for k in range(n)]
rows = []
for b in sc['boxes']:
    h = b['half']
    box = (max(0, int(b['x'] - h * 1.15 - cl['x'])), max(0, int(b['y'] - h * 0.85 - cl['y'])), int(b['x'] + h * 1.15 - cl['x']), int(b['y'] + h * 0.85 - cl['y']))
    rows.append([Image.open(os.path.join(d, scene, f'f{i:03d}.jpg')).convert('RGB').crop(box) for i in idx])
cw = max(c.size[0] for r in rows for c in r); ch = max(c.size[1] for r in rows for c in r)
sheet = Image.new('RGB', (cw * n, ch * len(rows)), (20, 20, 20))
for i, r in enumerate(rows):
    for k, c in enumerate(r):
        sheet.paste(c, (k * cw, i * ch))
sheet = sheet.resize((int(sheet.size[0] * scale), int(sheet.size[1] * scale)), Image.LANCZOS)
sheet.save(outp, quality=88)
print(outp, sheet.size)
