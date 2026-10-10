"""Tile the timestamped frames of tools/r_death_shots.mjs into a filmstrip at a fixed rate.
Usage: python tools/r_death_sheet.py <dir> <scene> <out.jpg> [t0=0] [t1=8] [fps=8] [cols=4] [w=480]
Frames are named <scene>_<ms>.jpg; for each sample time the nearest frame is used (labelled with its own time)."""
import sys, glob, os
from PIL import Image, ImageDraw
d, scene, out = sys.argv[1:4]
t0 = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
t1 = float(sys.argv[5]) if len(sys.argv) > 5 else 8.0
fps = float(sys.argv[6]) if len(sys.argv) > 6 else 8.0
cols = int(sys.argv[7]) if len(sys.argv) > 7 else 4
w = int(sys.argv[8]) if len(sys.argv) > 8 else 480
fr = sorted((int(os.path.basename(p).split('_')[-1][:-4]), p) for p in glob.glob(os.path.join(d, scene + '_*.jpg')))
if not fr:
    sys.exit('no frames')
ts = []
t = t0
while t <= t1 + 1e-6:
    ts.append(t); t += 1.0 / fps
tiles = []
for t in ts:
    ms, p = min(fr, key=lambda f: abs(f[0] - t * 1000))
    if abs(ms - t * 1000) > 400:
        continue
    im = Image.open(p).convert('RGB')
    h = int(im.height * w / im.width)
    im = im.resize((w, h))
    ImageDraw.Draw(im).text((6, 4), '%.2fs' % (ms / 1000), fill=(255, 255, 0))
    tiles.append(im)
rows = (len(tiles) + cols - 1) // cols
h = tiles[0].height
sheet = Image.new('RGB', (cols * w, rows * h))
for i, im in enumerate(tiles):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out, quality=88)
print(out, len(tiles), 'tiles')
