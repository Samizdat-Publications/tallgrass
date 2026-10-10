"""r-idle: per-animal filmstrips from a recording of tools/r_idle_shots.mjs: for a scene, each staged animal's crop at a few instants, one row per animal.
Usage: python tools/r_idle_strips.py <run dir> <scene> <out.jpg> [frames=6] [step_s=0.5] [t0_s=1]"""
import json, os, subprocess, sys, tempfile
from PIL import Image

d, scene, outp = sys.argv[1:4]
n = int(sys.argv[4]) if len(sys.argv) > 4 else 6
step = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
t0 = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
m = json.load(open(os.path.join(d, 'meta.json')))
sc = m['scenes'][scene]
rows = []
with tempfile.TemporaryDirectory() as tmp:
    for k in range(n):
        p = os.path.join(tmp, f'f{k}.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-ss', f"{sc['tStart'] + t0 + k * step:.3f}", '-i', os.path.join(d, 'run.webm'), '-frames:v', '1', p], check=True)
    ims = [Image.open(os.path.join(tmp, f'f{k}.png')).convert('RGB') for k in range(n)]
    for b in sc['boxes']:
        h = b['half']
        box = (int(b['x'] - h * 1.15), int(b['y'] - h * 0.85), int(b['x'] + h * 1.15), int(b['y'] + h * 0.85))
        rows.append([im.crop(box) for im in ims])
cw = max(c.size[0] for r in rows for c in r); ch = max(c.size[1] for r in rows for c in r)
sheet = Image.new('RGB', (cw * n, ch * len(rows)), (20, 20, 20))
for i, r in enumerate(rows):
    for k, c in enumerate(r):
        sheet.paste(c, (k * cw, i * ch))
sheet.save(outp, quality=88)
print(outp, sheet.size)
