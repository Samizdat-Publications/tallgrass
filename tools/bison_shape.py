# Reshapes the authored bison (public/models/a3/bison.bin) once, after tools/import_animal.py has made it:
#   * the horns: the source's are long cattle horns that sweep out and then forward. A bison's are short, thick at the base, and curve up and a
#     little inward from the side of the head, half lost in the wool. Each horn is the tube of surface within about 0.62 m (along the mesh) of
#     its tip; every vertex of it is re-skinned onto a shorter, upright centreline (same offset from the centreline, turned with it).
#   * the hump: the source's back is nearly flat; the shoulders are raised and the rump lowered a little so the silhouette has the bison's
#     high hump and sloping hindquarters.
# The result is written back over bison.bin, and bison.json gets "shaped": true so a second run refuses (re-run import_animal.py first).
#
#   python tools/bison_shape.py [public/models/a3] [--preview out.png]
import heapq
import json
import sys

import numpy as np
from scipy.interpolate import CubicSpline

root = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'public/models/a3'
meta_path, bin_path = f'{root}/bison.json', f'{root}/bison.bin'
meta = json.load(open(meta_path))
if meta.get('shaped'):
    sys.exit('bison.bin is already shaped (re-run tools/import_animal.py to start from the source mesh)')
buf = bytearray(open(bin_path, 'rb').read())
n = meta['vertices']
attr = {a['name']: a for a in meta['attributes']}
def view(name):
    a = attr[name]
    return np.frombuffer(buf, dtype='<f4', count=n * a['size'], offset=a['offset']).reshape(n, a['size'])
P, N, part = view('position'), view('normal'), view('aPart')
P0 = P.astype(np.float64).copy()
idx = np.frombuffer(buf, dtype='<u2', count=meta['triangles'] * 3, offset=meta['indexOffset']).reshape(-1, 3)

# welded surface graph (the UV seams duplicate vertices)
key, w = {}, np.zeros(n, int)
for i in range(n):
    w[i] = key.setdefault(tuple(np.round(P0[i], 4)), len(key))
adj = [dict() for _ in range(len(key))]
for a, b, c in idx:
    for u, v in ((a, b), (b, c), (c, a)):
        if w[u] != w[v]:
            d = float(np.linalg.norm(P0[u] - P0[v]))
            adj[w[u]][w[v]] = d
            adj[w[v]][w[u]] = d
def geodesic(src, lim):
    dist, pq = {src: 0.0}, [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        if d > lim:
            break
        for v, l in adj[u].items():
            if d + l < dist.get(v, 1e9):
                dist[v] = d + l
                heapq.heappush(pq, (d + l, v))
    return dist

smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))
head = part[:, 0] == 5
G_BASE = 0.62  # geodesic distance from the tip where the horn tube ends and the skull begins (the rings flare past it)
LEN = 0.88     # the new horn's length relative to the design polyline below
# new centreline offsets from the horn base: (forward, up, outward) at s = 0 (base) .. 1 (tip)
DESIGN_S = np.array([0, 0.2, 0.4, 0.6, 0.8, 1.0])
DESIGN = np.array([(0, 0, 0), (0.0, 0.03, 0.07), (0.0, 0.10, 0.12), (0.0, 0.19, 0.145), (0.0, 0.28, 0.145), (0.0, 0.36, 0.125)]) * LEN

def rot_between(a, b):
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v, c = np.cross(a, b), float(a @ b)
    if c < -0.999:
        return -np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)

horn_verts = {}
for name, tip_sel, sign in (('R', head & (P0[:, 2] > 0.4) & (P0[:, 0] > 1.2), 1.0), ('L', head & (P0[:, 2] < 0.1) & (P0[:, 0] > 1.65), -1.0)):
    cand = np.where(tip_sel)[0]
    tip = cand[np.argmax(P0[cand, 1])]
    d = geodesic(w[tip], G_BASE + 0.1)
    g = np.array([d.get(w[i], 9.0) for i in range(n)])
    sel = np.where(g <= G_BASE)[0]
    horn_verts[name] = sel
    # old centreline: ring centroids by geodesic distance, smoothed
    bins = np.arange(0, G_BASE + 0.001, 0.04)
    cs, gs = [], []
    for a in bins:
        m = (g >= a) & (g < a + 0.04)
        if m.sum() >= 3:
            cs.append(P0[m].mean(0)); gs.append(a + 0.02)
    cs, gs = np.array(cs), np.array(gs)
    s_old = 1 - gs / G_BASE  # 0 at the base .. 1 at the tip
    # a smooth centreline: a quartic per coordinate through the ring centroids (a spline through them wobbles; the rings of a bent tube are not flat)
    coef = [np.polyfit(s_old, cs[:, k], 4) for k in range(3)]
    c_old = lambda t, d=0: np.array([np.polyval(np.polyder(coef[k], d) if d else coef[k], t) for k in range(3)])
    base = c_old(0.0)
    # new centreline: the design offsets in the horn's frame (forward +x, up +y, outward +-z), from the same base point
    dz = DESIGN * np.array([1, 1, sign])
    c_new = CubicSpline(DESIGN_S, base + dz, bc_type='natural')
    # each vertex takes the point of the old centreline nearest to it (not the one at its geodesic distance: on a bent tube the geodesic rings
    # are not perpendicular to the axis), keeps its offset from that point, and turns it with the change of the axis direction
    grid = np.linspace(0, 1, 401)
    cg = np.array([c_old(t) for t in grid])
    for i in sel:
        k = int(np.argmin(np.linalg.norm(cg - P0[i], axis=1)))
        si = float(grid[k])
        t_old = c_old(si, 1); t_new = c_new(si, 1)
        R = rot_between(t_old, t_new)
        off = P0[i] - cg[k]
        thick = 1.0 + 0.18 * (1 - si)
        p_new = c_new(si) + R @ off * thick
        wgt = float(smooth(0.0, 0.22, si))
        P[i] = (1 - wgt) * P0[i] + wgt * p_new
        nn = (1 - wgt) * N[i] + wgt * (R @ N[i])
        N[i] = nn / np.linalg.norm(nn)
    print(name, 'tip', np.round(P0[tip], 2), 'verts', len(sel), 'base', np.round(base, 2), 'new tip', np.round(c_new(1.0), 2))

# hump and rump: a smooth displacement of the dorsal vertices
x, y = P0[:, 0], P0[:, 1]
dorsal = smooth(1.05, 1.7, y)
hump = np.exp(-(((x - 0.5) / 0.42) ** 2))
rump = smooth(0.15, -0.95, x)
shift = 0.17 * hump * dorsal - 0.11 * rump * dorsal
horn_all = np.concatenate(list(horn_verts.values()))
mask = np.ones(n, bool); mask[horn_all] = False
tail = part[:, 0] == 6
mask &= ~tail
P[mask, 1] += shift[mask].astype(np.float32)
P[horn_all, 1] += (shift[horn_all] * 0).astype(np.float32)  # (the horns sit on the head, above the hump's reach)

open(bin_path, 'wb').write(bytes(buf))
meta['shaped'] = True
json.dump(meta, open(meta_path, 'w'))
print('wrote', bin_path, 'bounds y', float(P[:, 1].min()), float(P[:, 1].max()))
