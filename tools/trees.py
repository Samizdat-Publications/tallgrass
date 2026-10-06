"""Tree table (V2-PLAN.md S13): dynamic trees from batch screens.

    python tools/trees.py T0=scratch/screens/s13_T0 T1=scratch/screens/s13_T1 ... [--scenario baseline] [--burn 0.1]

Per screen, over its seeds, from the tr_* columns and cover_mean (all 0 for tr_* in a screen with dynamicTrees off; cover_mean is always there):
  trees over time   mean over seeds of the live cottonwoods (all stages), the mature + young cottonwoods and oaks, the junipers, the snags and the mean cover of the
                    land, at the start of the run and at 25, 50, 75 and 100% of it (the mean of the samples in a 5% window around each point)
  persistence       seeds whose mature + young cottonwoods and oaks are still above 25% of their start at the end, and the lowest end / start ratio of any seed
  junipers          final count (mean, highest seed), the juniper share of the ridge cells at the end (mean, highest seed, and the highest of any sample:
                    the runaway check), and `encroachment` events per seed (mean; seeds with any)
  recruitment       cottonwood and juniper recruits per 100 valley years (tr_rec_cw, tr_rec_jun), pooled over seeds
  deaths            fire deaths of seedlings, saplings and young trees (tr_fire_small) and of mature trees (tr_fire_mature), old-age deaths (tr_old) and the
                    seedling and sapling hazard deaths (tr_hazard), per 100 valley years
  browse            mean browse slowdown of the seedlings and saplings (tr_browse_slow, 0 to 0.7)
Years are valley years (the `year` column). With dynamicTrees off the screen prints only the cover rows.
"""
import argparse
import csv
import glob
import os
import statistics as st


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def load(path):
    with open(path, newline='') as f:
        return list(csv.DictReader(f))


def col(rows, k):
    return [num(r.get(k)) for r in rows]


def cw_live(r):
    return sum(num(r.get('tr_cw_' + s)) for s in ('seedling', 'sapling', 'young', 'mature'))


def cw_old(r):
    return num(r.get('tr_cw_young')) + num(r.get('tr_cw_mature')) + num(r.get('tr_oak_young')) + num(r.get('tr_oak_mature'))


def jun_live(r):
    return sum(num(r.get('tr_jun_' + s)) for s in ('seedling', 'sapling', 'young', 'mature'))


def snags(r):
    return sum(num(r.get('tr_%s_snag' % k)) for k in ('cw', 'jun', 'oak'))


def window(rows, frac, fn):
    """Mean of fn over the samples within 2.5% of the run around `frac` (0 = first sample, 1 = last)."""
    n = len(rows)
    lo, hi = max(0, int(round((frac - 0.025) * (n - 1)))), min(n - 1, int(round((frac + 0.025) * (n - 1))))
    return st.mean(fn(r) for r in rows[lo:hi + 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('screens', nargs='+', help='NAME=dir')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--burn', type=float, default=0.1)
    a = ap.parse_args()
    for item in a.screens:
        name, _, d = item.partition('=')
        files = sorted(glob.glob(os.path.join(d, a.scenario, 'seed_*.csv')))
        runs = [r for r in (load(f) for f in files) if len(r) >= 8]
        if not runs:
            print(f'{name}: no CSVs in {d}/{a.scenario}')
            continue
        yrs = st.mean(num(r[-1]['year']) - num(r[0]['year']) for r in runs) or 1.0
        on = any(num(r.get('tr_live')) > 0 for rr in runs for r in rr[:3])
        print(f'\n{name}  ({len(runs)} seeds, {yrs:.0f} valley years)')
        pts = [0.0, 0.25, 0.5, 0.75, 1.0]
        print('  at                    ' + ''.join(f'{int(p * 100):>8d}%' for p in pts))
        rows_def = [('cover (mean of land)', lambda r: num(r.get('cover_mean')), '{:8.4f} ')]
        if on:
            rows_def = [
                ('cottonwoods, all', cw_live, '{:8.0f} '),
                ('cw+oak mature+young', cw_old, '{:8.0f} '),
                ('junipers, all', jun_live, '{:8.0f} '),
                ('snags', snags, '{:8.0f} '),
            ] + rows_def
        for label, fn, fmt in rows_def:
            vals = [st.mean(window(rr, p, fn) for rr in runs) for p in pts]
            print(f'  {label:<24}' + ''.join(fmt.format(v) for v in vals))
        if not on:
            print('  (dynamicTrees is off in this screen)')
            continue
        ratios = [window(rr, 1.0, cw_old) / max(1.0, window(rr, 0.0, cw_old)) for rr in runs]
        alive = sum(1 for rr in runs if window(rr, 1.0, cw_old) > 0.25 * window(rr, 0.0, cw_old))
        print(f'  cottonwood (and oak) persistence: {alive}/{len(runs)} seeds keep > 25% of their start; end/start ratio mean {st.mean(ratios):.2f}, lowest {min(ratios):.2f}, highest {max(ratios):.2f}')
        jf = [window(rr, 1.0, jun_live) for rr in runs]
        rs = [window(rr, 1.0, lambda r: num(r.get('tr_jun_ridge'))) for rr in runs]
        rmax = max(max(col(rr, 'tr_jun_ridge')) for rr in runs)
        enc = [sum(col(rr, 'tr_encroach')) for rr in runs]
        print(f'  junipers at the end: mean {st.mean(jf):.0f}, highest seed {max(jf):.0f}; ridge share mean {st.mean(rs):.4f}, highest seed {max(rs):.4f}, highest of any sample {rmax:.4f}')
        print(f'  encroachment events per seed: mean {st.mean(enc):.2f}; seeds with any {sum(1 for e in enc if e > 0)}/{len(runs)}')
        per100 = lambda k: 100.0 * st.mean(sum(col(rr, k)) for rr in runs) / yrs
        print(f'  recruits per 100 valley years: cottonwood {per100("tr_rec_cw"):.1f}, juniper {per100("tr_rec_jun"):.1f}')
        print(f'  deaths per 100 valley years: fire small {per100("tr_fire_small"):.1f}, fire mature {per100("tr_fire_mature"):.1f}, old age {per100("tr_old"):.1f}, seedling and sapling hazards {per100("tr_hazard"):.1f}')
        bs = [st.mean(col(rr, 'tr_browse_slow')) for rr in runs]
        print(f'  mean browse slowdown of seedlings and saplings: {st.mean(bs):.3f}')


if __name__ == '__main__':
    main()
