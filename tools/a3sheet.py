# a3 spike: contact sheets of the before/after stills made by tools/a3shots.mjs: one sheet per species and distance, rows = poses,
# left = procedural near LOD (off), right = authored mesh (a3). Crops to the animal.
#   python tools/a3sheet.py review/wip/a3-spike/lab review/wip/a3-spike
import sys, os
from PIL import Image, ImageDraw
src, dst = sys.argv[1], sys.argv[2]
poses = ['idle', 'walk', 'run', 'graze', 'rest']
for sp in ['bison', 'wolf']:
    for d in [8, 20, 45]:
        rows = []
        for pose in poses:
            a = os.path.join(src, f'{sp}_{pose}_{d:02d}m_off.jpg'); b = os.path.join(src, f'{sp}_{pose}_{d:02d}m_a3.jpg')
            if os.path.exists(a) and os.path.exists(b):
                rows.append((pose, Image.open(a).convert('RGB'), Image.open(b).convert('RGB')))
        if not rows:
            continue
        w, h = rows[0][1].size
        # crop around the centre (the camera follows the animal): a window sized by the distance
        cw, ch = int(w * (0.62 if d <= 8 else 0.5 if d <= 20 else 0.34)), int(h * (0.62 if d <= 8 else 0.5 if d <= 20 else 0.34))
        box = ((w - cw) // 2, (h - ch) // 2 + int(h * 0.03), (w + cw) // 2, (h + ch) // 2 + int(h * 0.03))
        S = 1.0 if cw <= 720 else 720 / cw
        tw, th = int(cw * S), int(ch * S)
        sheet = Image.new('RGB', (tw * 2, th * len(rows)))
        dr = ImageDraw.Draw(sheet)
        for r, (pose, a, b) in enumerate(rows):
            sheet.paste(a.crop(box).resize((tw, th)), (0, r * th)); sheet.paste(b.crop(box).resize((tw, th)), (tw, r * th))
            dr.text((6, r * th + 6), f'{sp} {pose} {d} m: procedural', fill=(255, 255, 255)); dr.text((tw + 6, r * th + 6), f'{sp} {pose} {d} m: a3', fill=(255, 255, 255))
        sheet.save(os.path.join(dst, f'sheet_{sp}_{d:02d}m.jpg'), quality=90)
        print('saved', f'sheet_{sp}_{d:02d}m.jpg')
