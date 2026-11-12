"""Before/after comparison strip: python tools/r_death_cmp.py <beforeDir> <afterDir> <scene> <out.jpg> <t1,t2,...> [crop x0,y0,x1,y1] [w=640]
Rows: before (top), after (bottom); one column per wall-clock time (seconds)."""
import sys, glob, os
from PIL import Image, ImageDraw
bd, ad, scene, out, ts = sys.argv[1:6]
crop = tuple(int(v) for v in sys.argv[6].split(',')) if len(sys.argv) > 6 else None
w = int(sys.argv[7]) if len(sys.argv) > 7 else 640
def pick(d, t):
    fr = [(int(os.path.basename(p).split('_')[-1][:-4]), p) for p in glob.glob(os.path.join(d, scene + '_*.jpg'))]
    ms, p = min(fr, key=lambda f: abs(f[0] - t * 1000))
    im = Image.open(p).convert('RGB')
    if crop: im = im.crop(crop)
    h = int(im.height * w / im.width)
    im = im.resize((w, h))
    ImageDraw.Draw(im).text((6, 4), '%.2fs' % (ms / 1000), fill=(255, 255, 0))
    return im
times = [float(v) for v in ts.split(',')]
rows = [[pick(d, t) for t in times] for d in (bd, ad)]
h = rows[0][0].height
sheet = Image.new('RGB', (w * len(times), h * 2 + 4), (255, 0, 0))
for r, row in enumerate(rows):
    for c, im in enumerate(row):
        sheet.paste(im, (c * w, r * (h + 4)))
sheet.save(out, quality=88)
print(out)
