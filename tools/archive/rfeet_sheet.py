# Combine the frames of tools/rfeet_leap.mjs into one contact sheet (8 fps, left to right and down).
#   python tools/rfeet_sheet.py review/wip/r-feet/leap after [cols]
import glob, sys
from PIL import Image
d, tag = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
fs = sorted(glob.glob(f'{d}/{tag}_leap_[0-9][0-9].jpg'))
ims = [Image.open(f).resize((480, 346)) for f in fs]
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (480 * cols, 346 * rows), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * 480, (i // cols) * 346))
sheet.save(f'{d}/{tag}_leap_strip.jpg', quality=90)
print('wrote', f'{d}/{tag}_leap_strip.jpg', len(ims))
