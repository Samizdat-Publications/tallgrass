# Combine the frames of the mousing leap (tools/r3_coyote_stills.mjs --only leap) into one contact sheet.
#   python tools/leapstrip.py review/wip/R3/coyote c
import glob, sys
from PIL import Image
d, tag = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(f'{d}/{tag}_02_leap_t*.jpg'))
ims = [Image.open(f).resize((600, 420)) for f in fs]
cols = 4
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (600 * cols, 420 * rows), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * 600, (i // cols) * 420))
sheet.save(f'{d}/{tag}_02_leap_strip.jpg', quality=90)
