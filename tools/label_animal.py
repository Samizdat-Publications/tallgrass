# Stage 2 of the a3 animal import (plain Python + numpy): retarget the legs of the stage-1 mesh onto our rig and label the parts.
#   python tools/label_animal.py tools/animals/bison.json
# Reads <work>/stage1.npz and the baked images (tools/import_animal.py), writes public/models/a3/<species>.bin + .json (+ textures) and a
# labelled preview npz (<work>/final.npz, part id per vertex) for tools/preview_animal.py. The rig numbers (hip, knee, foot of the front and
# hind leg, the neck pivot) come from the procedural near LOD in the species config, so legmath's gaits, strides and IK constants still fit.
import numpy as np, json, os, sys, math
from PIL import Image

cfg_path = sys.argv[1]
cfg = json.load(open(cfg_path))
ROOT = os.path.abspath(os.path.join(os.path.dirname(cfg_path), '..', '..'))
def P(p): return p if os.path.isabs(p) else os.path.join(ROOT, p)
work = P(cfg['work'])
sp = cfg['species']
d = np.load(os.path.join(work, 'stage1.npz'))
pos = d['pos'].astype(np.float64)
uv = d['uv'].astype(np.float32)
tris = d['tris'].astype(np.int64)
n = len(pos)

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

# ---- 1. global fit: x scale and shift, z shift (the source is not centred on its own axis)
xs, xo, zs = cfg.get('xscale', 1.0), cfg.get('xshift', 0.0), cfg.get('zshift', 0.0)
pos[:, 0] = pos[:, 0] * xs + xo
pos[:, 2] += zs
orig = pos.copy()
_t = cfg['tail']
tmask0 = (pos[:, 0] < _t['x0']) & (abs(pos[:, 2] - _t.get('z', 0.0)) < _t.get('half', 0.2)) & (pos[:, 1] > _t.get('ymin', 0.3))   # tail vertices: no leg takes them

# ---- 2. the four source legs: track each leg's axis up from the foot (x window around the previous slice), per slice y
xsplit = cfg['xsplit']
rig = cfg['rig']          # target: {"front": {hip:[x,y], knee:[x,y], foot:[x,y], z}, "hind": {...}}
LEG = {'FR': (True, +1), 'FL': (True, -1), 'HR': (False, +1), 'HL': (False, -1)}
PARTID = {'BODY': 0, 'FL': 1, 'FR': 2, 'HL': 3, 'HR': 4, 'HEAD': 5, 'TAIL': 6}
legs = {}
ys = np.arange(0.05, cfg.get('leg_top', 1.25), 0.05)
for name, (front, side) in LEG.items():
    m = ((pos[:, 0] > xsplit) == front) & ((pos[:, 2] * side > 0))
    q = pos[m]
    f = q[q[:, 1] < 0.08]
    xc, zc = f[:, 0].mean(), f[:, 2].mean()
    ax, az, hx, hz = [], [], [], []
    for y in ys:
        w = 0.16 + 0.12 * y
        s = q[(abs(q[:, 1] - y) < 0.05) & (abs(q[:, 0] - xc) < w) & (abs(q[:, 2] - zc) < 0.22 + 0.15 * y)]
        if len(s) < 3:
            ax.append(xc); az.append(zc); hx.append(0.1); hz.append(0.08); continue
        xc = 0.5 * xc + 0.5 * s[:, 0].mean(); zc = 0.5 * zc + 0.5 * s[:, 2].mean()
        ax.append(xc); az.append(zc)
        hx.append(max(0.08, 0.5 * (s[:, 0].max() - s[:, 0].min()) * 0.9)); hz.append(max(0.06, 0.5 * (s[:, 2].max() - s[:, 2].min()) * 0.9))
    legs[name] = dict(front=front, side=side, y=ys, ax=np.array(ax), az=np.array(az), hx=np.array(hx), hz=np.array(hz))
    legs[name]['foot_z'] = float(f[:, 2].mean())

def axis_at(L, y, key):
    return np.interp(y, L['y'], L[key])

# source skeleton per leg (x, y) at hip, knee and foot heights; the knee / hip heights come from the rig
for name, L in legs.items():
    R = rig['front' if L['front'] else 'hind']
    L['dst'] = np.array([R['hip'][:2], R['knee'][:2], R['foot'][:2]], np.float64)
    ky, hy = R['knee'][1], R['hip'][1]
    hxs = cfg.get('hip_src_x', {}).get('front' if L['front'] else 'hind')
    hxs = axis_at(L, hy, 'ax') if hxs is None else hxs * xs + xo
    L['src'] = np.array([[hxs, hy], [axis_at(L, ky, 'ax'), ky], [axis_at(L, 0.05, 'ax') * 1.0, 0.0]], np.float64)

def map_leg(L, P2):
    """Map (x, y) points of a source leg onto the target skeleton: per bone a rigid frame, blended over the knee."""
    S, D = L['src'], L['dst']
    out = []
    for i in range(2):
        a = S[i + 1] - S[i]; la = np.linalg.norm(a); u = a / la; nr = np.array([-u[1], u[0]])
        b = D[i + 1] - D[i]; lb = np.linalg.norm(b); v = b / lb; nb = np.array([-v[1], v[0]])
        rel = P2 - S[i]
        t = rel @ u; w = rel @ nr
        out.append(D[i] + np.outer(t * (lb / la), v) + np.outer(w, nb))
    ky = S[1][1]
    wl = smooth(ky + 0.1, ky - 0.1, P2[:, 1])
    return out[0] * (1 - wl)[:, None] + out[1] * wl[:, None]

# per-vertex leg membership: inside the leg's elliptical envelope (x and z half widths tracked per slice), fading out beyond it
memb = np.zeros((n, 4))
hip_y = {k: rig['front' if v[0] else 'hind']['hip'][1] for k, v in LEG.items()}
names = list(LEG)
for j, name in enumerate(names):
    L = legs[name]
    y = np.clip(pos[:, 1], 0.05, ys[-1])
    cx, cz = axis_at(L, y, 'ax'), axis_at(L, y, 'az')
    rx = np.minimum(axis_at(L, y, 'hx'), cfg.get('leg_rx_max', 0.2)) + cfg.get('leg_pad', 0.04)
    rz = np.minimum(axis_at(L, y, 'hz'), cfg.get('leg_rz_max', 0.16)) + cfg.get('leg_pad', 0.04)
    dd = np.sqrt(((pos[:, 0] - cx) / rx) ** 2 + ((pos[:, 2] - cz) / rz) ** 2)
    m = 1 - smooth(0.9, 1.4, dd)
    m *= 1 - smooth(hip_y[name] + 0.05, hip_y[name] + cfg.get('leg_fade', 0.35), pos[:, 1])
    # a leg only owns the vertices on its own side of the body and its own end
    front = L['front']
    m *= ((pos[:, 0] > xsplit) == front) | (abs(pos[:, 0] - xsplit) < 0.25)
    m *= (pos[:, 2] * L['side'] > -0.12)
    if _t.get('first'):
        m *= ~tmask0
    memb[:, j] = m

# retarget displacement (x, y only; z keeps the source's stance)
disp = np.zeros((n, 3))
for j, name in enumerate(names):
    m = memb[:, j]
    idx = np.nonzero(m > 0.003)[0]
    if len(idx) == 0:
        continue
    T = map_leg(legs[name], pos[idx, :2])
    d2 = T - pos[idx, :2]
    disp[idx, 0] += m[idx] * d2[:, 0]
    disp[idx, 1] += m[idx] * d2[:, 1]
tot = memb.sum(1)
disp /= np.maximum(1.0, tot)[:, None]   # two legs never both pull one vertex further than one displacement
pos = pos + disp
# the feet stand on the ground exactly
pos[:, 1] -= pos[:, 1].min()
foot_y_rig = rig['front']['foot'][1]

# ---- 3. labels: part id, joint weight (aPart.y), coat influence (aPart.z), skin blend (aPart.w), pivots
part = np.zeros(n, np.int64)
w1 = np.zeros(n)
wb = np.zeros(n)
piv = np.zeros((n, 3))
piv2 = np.zeros((n, 3))
neck = np.array(cfg['neck'], np.float64)           # neck pivot (x, y, 0)
hw0, hw1 = cfg['head_w']                            # head rotation weight ramps from 0 at x = hw0 to 1 at x = hw1
tail = cfg['tail']                                  # {"pivot": [x, y, 0], "x0": ..., "x1": ...}
tpiv = np.array(tail['pivot'], np.float64)
headw = smooth(hw0, hw1, pos[:, 0])
if 'neck_low' in cfg:
    # the neck ramp only takes vertices above a line through the throat (the chest and dewlap stay with the body); the head proper (x past
    # head_x) takes everything
    nx, ny, slope, soft = cfg['neck_low']
    above = smooth(-soft, soft, pos[:, 1] - (ny - slope * (pos[:, 0] - nx)))
    hx0, hx1 = cfg['head_x']
    headw = np.maximum(headw * above, smooth(hx0, hx1, pos[:, 0]))
best = memb.argmax(1)
isleg = memb.max(1) > 0.04
for j, name in enumerate(names):
    sel = isleg & (best == j)
    L = legs[name]
    R = rig['front' if L['front'] else 'hind']
    part[sel] = {'FR': 2, 'FL': 1, 'HR': 4, 'HL': 3}[name]
    zl = L['foot_z']
    piv[sel] = [R['hip'][0], R['hip'][1], zl]
    piv2[sel] = [R['knee'][0], R['knee'][1], zl]
    ky = R['knee'][1]
    w1[sel] = smooth(ky + cfg.get('knee_w', 0.11), ky - cfg.get('knee_w', 0.11), pos[sel, 1])
    wb[sel] = smooth(R['hip'][1] - cfg.get('hip_blend', 0.4), R['hip'][1] + cfg.get('hip_blend_up', 0.12), pos[sel, 1])
# the tail: behind tail x0 and within its width of the axis
tmask = (pos[:, 0] < tail['x0']) & (tail.get('first', False) | ~isleg) & (abs(pos[:, 2] - tail.get('z', 0.0)) < tail.get('half', 0.2)) & (pos[:, 1] > tail.get('ymin', 0.3))
if tail.get('first'): isleg &= ~tmask   # (the tail wins over a leg envelope it hangs inside)
part[tmask] = 6
piv[tmask] = tpiv
piv2[tmask] = tpiv
wb[tmask] = smooth(tail['x0'] - tail.get('blend', 0.14), tail['x0'], pos[tmask, 0])
if tail.get('rot'):
    # the source tail is held out straight: let it hang as the procedural one does (rotate the tail about its root, positive = tip down)
    phi = tail['rot']
    dx = pos[tmask, 0] - tpiv[0]; dy = pos[tmask, 1] - tpiv[1]
    k = smooth(tail['x0'], tail['x0'] - 0.15, pos[tmask, 0])   # the root holds, the rest follows
    ang = phi * k
    pos[tmask, 0] = tpiv[0] + dx * np.cos(ang) - dy * np.sin(ang)
    pos[tmask, 1] = tpiv[1] + dx * np.sin(ang) + dy * np.cos(ang)
# the head: everything ahead of the neck ramp that is not a leg or tail
hmask = (~isleg) & (~tmask) & (headw > 0.002)
part[hmask] = 5
w1[hmask] = 1 - headw[hmask]
piv[hmask] = neck
piv2[hmask] = neck
body = (part == 0)
piv[body] = neck
piv2[body] = neck
coat = np.full(n, cfg.get('coat', 0.25))

# ---- 3b. every foot stands on the rig's foot height exactly. The leg retarget leaves a hoof or paw 1 to 2.5 cm off the ground on some legs (the lowest
# vertex of each leg is not at the same height), which shows as a leg that floats in stance while the rig's foot point is planted. Lower each leg's
# vertices by the gap, fading to nothing at the knee (a stretch of a couple of centimetres over the shin, which no one can see).
for pid in (1, 2, 3, 4):
    sel = part == pid
    if not sel.any():
        continue
    R_ = rig['front' if pid <= 2 else 'hind']
    lo_ = pos[sel, 1].min()
    gap = lo_ - R_['foot'][1]
    if abs(gap) > 1e-6:
        pos[sel, 1] -= gap * (1 - smooth(lo_ + 0.03, R_['knee'][1], pos[sel, 1]))
        print('lowered leg', pid, 'by', round(gap, 4))

# ---- 4. normals (smooth across uv seams: merge by position), baked ambient occlusion
key = np.round(pos * 1e4).astype(np.int64)
_, inv = np.unique(key, axis=0, return_inverse=True)
inv = inv.reshape(-1)
fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
nrm = np.zeros((inv.max() + 1, 3))
for k in range(3):
    np.add.at(nrm, inv[tris[:, k]], fn)
nrm = nrm[inv]
nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
# AO: every vertex is a small occluder sphere for the others (facing term as in builder.ts bakeAO), plus the ground under the belly
Rs = cfg.get('ao_r', 0.09)
occ = np.zeros(n)
uniq_idx = np.unique(inv, return_index=True)[1]
S = pos[uniq_idx]
for a in range(0, n, 512):
    pa = pos[a:a + 512]; na = nrm[a:a + 512]
    dv = S[None, :, :] - pa[:, None, :]
    d2 = (dv ** 2).sum(2)
    ok = (d2 < (cfg.get('ao_reach', 0.7)) ** 2) & (d2 > 1e-8)
    dl = np.sqrt(np.where(ok, d2, 1.0))
    facing = (dv * na[:, None, :]).sum(2) / dl
    contrib = np.where(ok & (facing > 0.12), np.minimum(1.0, Rs * Rs / np.maximum(d2, 1e-6)) * facing, 0.0)
    occ[a:a + 512] = contrib.sum(1)
ground = cfg.get('ground', 1.0)
dark = np.minimum(0.6, occ * cfg.get('ao_k', 0.05))
dark = dark + np.where(nrm[:, 1] < 0, 0.7 * -nrm[:, 1] * (1 - smooth(0, ground * 1.1, pos[:, 1])) * (1 - dark), 0.0)
dark = np.minimum(0.7, dark)

# ---- 5. write
# the coat tint: the shader multiplies the vertex colour by (1 - c) + c * coat, so a gain of 1 / that at a mid coat keeps the baked albedo as it is
# at a middling coat and lets the per-animal coat value (pale to dark) and the juvenile / mange tints move it
cm = np.array(cfg.get('coat_mid', [0.2, 0.2, 0.2]))
cc = cfg.get('coat', 0.25)
col = np.ones((n, 3)) * (1.0 / ((1 - cc) + cc * cm))[None, :]
col *= cfg.get('color', 1.0)
aPart = np.stack([part, w1, coat, wb], 1)
WP = cfg.get('white_patch')   # reserve a white texel strip (top right corner) for geometry that is added at load time (the mule deer's procedural antlers)
WS = 0.96
if WP:
    uv = (uv * WS).astype(np.float32)
shade = np.stack([dark, np.zeros(n), np.zeros(n)], 1)
out_dir = P('public/models/a3')
os.makedirs(out_dir, exist_ok=True)
arrays = [('position', pos, 3), ('normal', nrm, 3), ('uv', uv, 2), ('aColor', col, 3), ('aPart', aPart, 4), ('aPivot', piv, 3), ('aPivot2', piv2, 3), ('aShade', shade, 3)]
blob = b''
meta = []
for nm, a, c in arrays:
    a = np.asarray(a, np.float32).reshape(-1, c)
    meta.append({'name': nm, 'size': c, 'offset': len(blob)})
    blob += a.tobytes()
idx_off = len(blob)
blob += tris.astype(np.uint16).reshape(-1).tobytes()
open(os.path.join(out_dir, sp + '.bin'), 'wb').write(blob)

def paint_albedo(im, regions):
    """Paint white markings (cfg 'paint') into the albedo: a weight per vertex from its final position and normal, rasterised through the uv
    triangles (so the marking follows the surface). Used for the pronghorn's rump patch, belly and throat bands, which the source lacks."""
    sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
    w = np.zeros(n)
    for r in regions:
        k = r['kind']
        if k == 'rump':
            w = np.maximum(w, sm(r['x0'], r['x1'], x) * sm(r['y0'], r['y1'], y))
        elif k == 'belly':
            w = np.maximum(w, sm(r['y0'], r['y1'], y) * sm(r['xa0'], r['xa1'], x) * sm(r['xb0'], r['xb1'], x) * sm(r.get('yl0', -1), r.get('yl1', -0.9), y))
        elif k == 'band':
            ax, ay = r['axis']; px_, py_ = r['origin']
            t = (x - px_) * ax + (y - py_) * ay
            under = sm(r.get('n0', 0.45), r.get('n1', 0.0), nrm[:, 1])
            w = np.maximum(w, sm(r['t0'] - r['soft'], r['t0'], t) * sm(r['t1'] + r['soft'], r['t1'], t) * under)
    a = np.asarray(im, np.float32) / 255.0
    W_, H_ = im.size
    mask = np.zeros((H_, W_), np.float32)
    uvp = uv / WS if WP else uv
    for tri in tris:
        P = np.stack([uvp[tri, 0] * W_, (1 - uvp[tri, 1]) * H_], 1)
        x0, x1 = int(np.floor(P[:, 0].min())), int(np.ceil(P[:, 0].max()))
        y0, y1 = int(np.floor(P[:, 1].min())), int(np.ceil(P[:, 1].max()))
        if x1 <= x0 or y1 <= y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (P[1, 1] - P[2, 1]) * (P[0, 0] - P[2, 0]) + (P[2, 0] - P[1, 0]) * (P[0, 1] - P[2, 1])
        if abs(d) < 1e-9:
            continue
        l0 = ((P[1, 1] - P[2, 1]) * (xs - P[2, 0]) + (P[2, 0] - P[1, 0]) * (ys - P[2, 1])) / d
        l1 = ((P[2, 1] - P[0, 1]) * (xs - P[2, 0]) + (P[0, 0] - P[2, 0]) * (ys - P[2, 1])) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        val = l0 * w[tri[0]] + l1 * w[tri[1]] + l2 * w[tri[2]]
        xi = np.clip(xs.astype(int), 0, W_ - 1); yi = np.clip(ys.astype(int), 0, H_ - 1)
        cur = mask[yi, xi]
        mask[yi, xi] = np.where(inside, np.maximum(cur, val), cur)
    white = np.array([0.93, 0.91, 0.86], np.float32)
    a = a * (1 - mask[..., None] * 0.92) + white * (mask[..., None] * 0.92)
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))

for kind in ('albedo', 'normal'):
    src = os.path.join(work, f'{sp}_{kind}.png')
    im = Image.open(src).convert('RGB')
    if kind == 'albedo' and cfg.get('paint'):
        im = paint_albedo(im, cfg['paint'])
    if kind == 'albedo' and cfg.get('grade'):
        # a mild colour grade of the baked albedo (saturation toward the luminance, a gain): tames a painted source to our coat palette
        g = cfg['grade']
        a = np.asarray(im, np.float32) / 255.0
        lum = (a * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(2, keepdims=True)
        a = lum + (a - lum) * g.get('sat', 1.0)
        a = np.clip(a * np.array(g.get('gain', [1, 1, 1]), np.float32), 0, 1)
        im = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
    if kind == 'albedo':
        # mean colour (linear) of the albedo over the mesh, sampled at the vertices: the far LOD is tinted toward it (src/render/models/index.ts)
        a8 = np.asarray(im, np.float32) / 255.0
        W_, H_ = im.size
        uvs_ = uv / WS if WP else uv
        px = np.clip((uvs_[:, 0] * W_).astype(int), 0, W_ - 1); py = np.clip(((1 - uvs_[:, 1]) * H_).astype(int), 0, H_ - 1)
        smp = a8[py, px]
        lin = np.where(smp <= 0.04045, smp / 12.92, ((smp + 0.055) / 1.055) ** 2.4)
        avg_lin = lin.mean(0).tolist()
    if WP:
        w_, h_ = im.size
        canvas = Image.new('RGB', (w_, h_), (255, 255, 255) if kind == 'albedo' else (128, 128, 255))
        canvas.paste(im.resize((int(w_ * WS), int(h_ * WS)), Image.LANCZOS), (0, h_ - int(h_ * WS)))
        im = canvas
    if kind == 'albedo':
        im.save(os.path.join(out_dir, f'{sp}_{kind}.jpg'), quality=90)
    else:
        im.save(os.path.join(out_dir, f'{sp}_{kind}.png'), optimize=True)
json.dump({'species': sp, 'vertices': n, 'triangles': len(tris), 'attributes': meta, 'indexOffset': idx_off, 'albedo': f'{sp}_albedo.jpg', 'normal': f'{sp}_normal.png', 'avg': avg_lin, 'coat': cc, 'whiteUV': [0.985, 0.985] if WP else None},
          open(os.path.join(out_dir, sp + '.json'), 'w'))
np.savez(os.path.join(work, 'final.npz'), pos=pos.astype(np.float32), uv=uv, tris=tris, part=part, w1=w1, wb=wb, dark=dark)
print('wrote', sp, 'verts', n, 'tris', len(tris), 'bytes', len(blob))
cnt = {k: int((part == v).sum()) for k, v in PARTID.items()}
print('parts', cnt)
for name in names:
    L = legs[name]
    print(name, 'src', np.round(L['src'], 3).tolist(), 'dst', np.round(L['dst'], 3).tolist(), 'foot_z', round(L['foot_z'], 3))
