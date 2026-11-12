"""R17: compare two folders of look-set stills. python tools/r17_diff.py <dirA> <dirB> [--out <dir>]
Prints mean/max abs difference and the share of pixels differing by more than 8/255 per frame, and writes an amplified (x6) difference image per frame."""
import sys, os
import numpy as np
from PIL import Image
a, b = sys.argv[1], sys.argv[2]
out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
if out: os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(a)):
    if not f.endswith('.jpg') or not os.path.exists(os.path.join(b, f)): continue
    A = np.asarray(Image.open(os.path.join(a, f)).convert('RGB')).astype(np.int16)
    B = np.asarray(Image.open(os.path.join(b, f)).convert('RGB')).astype(np.int16)
    d = np.abs(A - B).max(axis=2)
    print('%-26s mean %.3f  max %3d  >8: %5.2f%%  >24: %5.2f%%' % (f, d.mean(), d.max(), 100 * (d > 8).mean(), 100 * (d > 24).mean()))
    if out: Image.fromarray(np.clip(d * 6, 0, 255).astype(np.uint8)).save(os.path.join(out, f.replace('.jpg', '_diff.png')))
