"""Herd-shape table (V2-PLAN.md S10): the ring and spacing measures from batch screens.

    python tools/herdshape.py D0=scratch/screens/D0 D7=scratch/screens/D7 ... [--scenario baseline] [--burn 0.1]

Per screen, over its seeds (samples after the burn-in share of the run):
  ring_bison        share of the bison within 30 m of water that stand in the bank band (3 to 12 m from the water, so not drinking),
                    pooled over samples and weighted by how many bison were near water; also the median over seeds of each seed's pooled value.
                    A uniform spread gives about 0.3; a ring around a pond reads higher.
  near_bison        mean number of bison within 30 m of water per sample
  nn_graze_bison    mean distance (m, each capped at 30) from a grazing bison to its nearest neighbour; median over seeds, with the quartiles
Needs the ring_bison, near_bison and nn_graze_bison columns (S10); older CSVs are skipped.
"""
import argparse
import csv
import glob
import math
import os
import statistics as st


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float('nan')


def seed_stats(path, burn):
    with open(path, newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows or 'ring_bison' not in rows[0]:
        return None
    rows = rows[int(len(rows) * burn):]
    ring_w = ring_n = near_sum = 0.0
    nn = []
    for r in rows:
        near, ring, g = num(r['near_bison']), num(r['ring_bison']), num(r['nn_graze_bison'])
        if near > 0 and not math.isnan(ring):
            ring_w += ring * near
            ring_n += near
        near_sum += near if not math.isnan(near) else 0
        if not math.isnan(g):
            nn.append(g)
    return {
        'ring_w': ring_w, 'ring_n': ring_n,
        'ring': ring_w / ring_n if ring_n else float('nan'),
        'near': near_sum / max(1, len(rows)),
        'nn': sum(nn) / len(nn) if nn else float('nan'),
    }


def quart(xs):
    xs = sorted(x for x in xs if not math.isnan(x))
    if not xs:
        return float('nan'), float('nan'), float('nan')
    q = st.quantiles(xs, n=4) if len(xs) >= 2 else [xs[0]] * 3
    return q[0], st.median(xs), q[2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('screens', nargs='+', help='NAME=dir')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--burn', type=float, default=0.1)
    a = ap.parse_args()
    print(f"{'screen':<8}{'seeds':>6}{'ring pooled':>13}{'ring med':>10}{'near/sample':>13}{'nn med (m)':>12}{'nn q1-q3':>14}")
    for spec in a.screens:
        name, d = spec.split('=', 1)
        files = sorted(glob.glob(os.path.join(d, a.scenario, 'seed_*.csv')))
        ss = [s for s in (seed_stats(f, a.burn) for f in files) if s]
        if not ss:
            print(f'{name:<8}{len(files):>6}  (no herd shape columns)')
            continue
        w = sum(s['ring_w'] for s in ss)
        n = sum(s['ring_n'] for s in ss)
        pooled = w / n if n else float('nan')
        rmed = st.median([s['ring'] for s in ss if not math.isnan(s['ring'])] or [float('nan')])
        near = st.mean(s['near'] for s in ss)
        q1, m, q3 = quart([s['nn'] for s in ss])
        print(f'{name:<8}{len(ss):>6}{pooled:>13.3f}{rmed:>10.3f}{near:>13.1f}{m:>12.2f}{q1:>8.2f}-{q3:.2f}')


if __name__ == '__main__':
    main()
