"""Contact sheet for the R6 stills and strips: python tools/r6_sheet.py out.jpg COLS CELL_W img1 img2 ...
Every image is scaled to CELL_W wide and laid out left to right in COLS columns; a label (the file name without extension) sits on each."""
import sys
from PIL import Image, ImageDraw

out, cols, cw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
paths = sys.argv[4:]
ims = []
for p in paths:
    im = Image.open(p).convert('RGB')
    h = round(im.height * cw / im.width)
    ims.append((p, im.resize((cw, h), Image.LANCZOS)))
rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
rh = [max(i[1].height for i in r) for r in rows]
sheet = Image.new('RGB', (cw * cols, sum(rh)), (18, 18, 18))
y = 0
for r, h in zip(rows, rh):
    for c, (p, im) in enumerate(r):
        sheet.paste(im, (c * cw, y))
        label = p.replace('\\', '/').split('/')[-1].rsplit('.', 1)[0]
        d = ImageDraw.Draw(sheet)
        d.rectangle((c * cw, y, c * cw + 8 + 7 * len(label), y + 16), fill=(0, 0, 0))
        d.text((c * cw + 4, y + 2), label, fill=(235, 235, 235))
    y += h
sheet.save(out, quality=90)
print('wrote', out, sheet.size)
