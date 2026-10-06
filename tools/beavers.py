"""S14 beaver screens: pond and colony dynamics over time, and drought recovery with beavers against without.

    python tools/beavers.py dynamics NAME=dir [NAME=dir ...] [--scenario baseline] [--bin 20]
    python tools/beavers.py drought  CONTROL=dir BEAVERS=dir [--scenario drought] [--pre 20] [--window 60]

dynamics: for each screen, the mean over seeds of the beaver columns in bins of `--bin` valley years (default 20): beavers, colonies, ponds, pond area (m2),
          meadow area (m2), dams built and breached, meadows and colonies left per bin, and wolf kills of beavers; the share of seeds with beavers alive.
drought:  both dirs come from `batch.ts --scenario drought` (same seeds and ticks). The drought tick is read from summary.json (else 40% of the run). For bison and
          pronghorn it reports, per seed and then as medians and a paired comparison (beavers minus control):
            pre     mean population over the `--pre` valley years before the drought
            depth   lowest 5-sample average after the drought starts, as a share of pre
            recover valley years from the drought's start until the 5-sample average is back to 90% of pre after its low (censored at `--window` years)
          and for the water: the mean distance from a land cell to water (water_dist_mean) and the grass (grass_mean) during the drought and the
          four years after it, the pond area (beaver_pond_area) at the start of the drought and its lowest during it.
"""
import argparse
import csv
import glob
import json
import os
import statistics as st

import numpy as np


def load(d, scenario):
    out = {}
    for f in sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv'))):
        seed = int(os.path.basename(f)[5:-4])
        rows = list(csv.DictReader(open(f)))
        if not rows:
            continue
        cols = {}
        for k in rows[0]:
            try:
                cols[k] = np.array([float(r[k]) if r[k] not in ('', 'NaN') else np.nan for r in rows])
            except ValueError:
                pass
        out[seed] = cols
    return out


def event_ticks(d, scenario):
    try:
        s = json.load(open(os.path.join(d, scenario, 'summary.json')))
        return {x['seed']: x['events'][0]['tick'] for x in s['seeds'] if x.get('events')}
    except Exception:
        return {}


def dynamics(args):
    keys = [('pop_beaver', 'beavers', False), ('beaver_colonies', 'colonies', False), ('beaver_ponds', 'ponds', False), ('beaver_pond_area', 'pond m2', False),
            ('beaver_meadow_area', 'meadow m2', False), ('beaver_dams_built', 'dams built', True), ('beaver_dams_breached', 'breached', True),
            ('beaver_meadows', 'meadows', True), ('beaver_left', 'colonies left', True), ('killed_beaver', 'wolf kills', True)]
    for spec in args.screens:
        name, _, d = spec.partition('=')
        data = load(d, args.scenario)
        if not data:
            print(f'{name}: no data in {d}')
            continue
        n = len(data)
        ymax = max(float(c['year'][-1]) for c in data.values())
        print(f'\n{name}: {n} seeds, {ymax:.0f} valley years, bins of {args.bin} years (mean over seeds; the dams, meadows, left and kills are totals per bin)')
        print('| Years | ' + ' | '.join(k[1] for k in keys) + ' | seeds with beavers |')
        print('|---|' + '---|' * (len(keys) + 1))
        lo = 0.0
        while lo < ymax:
            hi = lo + args.bin
            cells = []
            for col, _, total in keys:
                vals = []
                for c in data.values():
                    m = (c['year'] >= lo) & (c['year'] < hi)
                    if m.any() and col in c:
                        vals.append(float(np.nansum(c[col][m])) if total else float(np.nanmean(c[col][m])))
                cells.append(f'{np.mean(vals):.1f}' if vals else '-')
            alive = sum(1 for c in data.values() if ((c['year'] >= lo) & (c['year'] < hi)).any() and np.nanmean(c['pop_beaver'][(c['year'] >= lo) & (c['year'] < hi)]) > 0)
            print(f'| {lo:.0f}-{min(hi, ymax):.0f} | ' + ' | '.join(cells) + f' | {alive}/{n} |')
            lo = hi


def ma(v, k=5):
    out = np.full(len(v), np.nan)
    for i in range(len(v)):
        lo = max(0, i - k + 1)
        out[i] = np.nanmean(v[lo:i + 1])
    return out


def drought_seed(c, ev_tick, sp, pre_y, win_y):
    year = c['year']
    ev_y = ev_tick / (c['tick'][-1] / year[-1]) if year[-1] else 0
    pop = c[f'pop_{sp}']
    pre_m = (year >= ev_y - pre_y) & (year < ev_y)
    pre = float(np.nanmean(pop[pre_m])) if pre_m.any() else float('nan')
    post_m = (year >= ev_y) & (year <= ev_y + win_y)
    if not post_m.any() or not pre or np.isnan(pre):
        return pre, float('nan'), float('nan')
    idx = np.where(post_m)[0]
    m = ma(pop)[idx]
    k = int(np.nanargmin(m))
    depth = float(m[k] / pre)
    rec = float('nan')
    for j in range(k, len(idx)):
        if m[j] >= 0.9 * pre:
            rec = float(year[idx[j]] - ev_y)
            break
    return pre, depth, rec


def boot(v, n=4000):
    """Mean of a paired difference and its 95% bootstrap interval (fixed seed, so the table is reproducible)."""
    v = np.array([x for x in v if not np.isnan(x)])
    if len(v) < 3:
        return float('nan'), float('nan'), float('nan')
    rng = np.random.default_rng(1)
    m = rng.choice(v, size=(n, len(v)), replace=True).mean(axis=1)
    return float(v.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def drought(args):
    (cn, _, cd), (bn, _, bd) = [s.partition('=') for s in args.screens]
    ctl, bvs = load(cd, args.scenario), load(bd, args.scenario)
    ev_c, ev_b = event_ticks(cd, args.scenario), event_ticks(bd, args.scenario)
    seeds = sorted(set(ctl) & set(bvs))
    print(f'{len(seeds)} paired seeds. Drought tick from summary.json (else 40% of the run); pre window {args.pre} yr, recovery window {args.window} yr.')
    for sp in ('bison', 'pronghorn'):
        rows = []
        for s in seeds:
            c0, c1 = ctl[s], bvs[s]
            t0 = ev_c.get(s, 0.4 * c0['tick'][-1])
            t1 = ev_b.get(s, 0.4 * c1['tick'][-1])
            rows.append((drought_seed(c0, t0, sp, args.pre, args.window), drought_seed(c1, t1, sp, args.pre, args.window)))
        f = lambda sel, i: [r[sel][i] for r in rows if not np.isnan(r[sel][i])]
        med = lambda v: float(np.median(v)) if len(v) else float('nan')
        print(f'\n{sp}')
        print('| | pre mean | depth (low / pre) | recovery yr (median of recovered) | recovered in window |')
        print('|---|---|---|---|---|')
        for nm, sel in ((cn, 0), (bn, 1)):
            rec = f(sel, 2)
            print(f'| {nm} | {med(f(sel, 0)):.0f} | {med(f(sel, 1)):.2f} | {med(rec):.1f} | {len(rec)}/{len(rows)} |')
        dd = [r[1][1] - r[0][1] for r in rows if not (np.isnan(r[1][1]) or np.isnan(r[0][1]))]
        dr = [(r[1][2] if not np.isnan(r[1][2]) else args.window) - (r[0][2] if not np.isnan(r[0][2]) else args.window) for r in rows]
        print(f'paired (beavers minus control): depth {med(dd):+.3f} (better in {sum(x > 0 for x in dd)}/{len(dd)} seeds); recovery {med(dr):+.1f} yr (shorter in {sum(x < 0 for x in dr)}/{len(dr)}, longer in {sum(x > 0 for x in dr)}/{len(dr)}; unrecovered counted as the window)')
        bd, bl, bh = boot(dd)
        rd, rl, rh = boot(dr)
        print(f'  means with 95% bootstrap intervals: depth {bd:+.3f} [{bl:+.3f}, {bh:+.3f}], recovery {rd:+.1f} yr [{rl:+.1f}, {rh:+.1f}]')
    # water and grass
    print('\nwater and grass (median over seeds; drought = the 4 valley years from its start, after = the 4 years following)')
    print('| | pond m2 at start | pond m2 lowest in drought | water dist m (drought) | grass_mean pre | grass_mean drought | grass_mean after |')
    print('|---|---|---|---|---|---|---|')
    res = {}
    for nm, data, ev in ((cn, ctl, ev_c), (bn, bvs, ev_b)):
        a = {k: [] for k in ('p0', 'pmin', 'wd', 'g0', 'g1', 'g2')}
        for s in seeds:
            c = data[s]
            ev_y = ev.get(s, 0.4 * c['tick'][-1]) / (c['tick'][-1] / c['year'][-1])
            y = c['year']
            dm, pm, am = (y >= ev_y) & (y < ev_y + 4), (y >= ev_y - 8) & (y < ev_y), (y >= ev_y + 4) & (y < ev_y + 8)
            if not dm.any() or not pm.any():
                continue
            a['p0'].append(c['beaver_pond_area'][np.where(y >= ev_y)[0][0]] if 'beaver_pond_area' in c else 0)
            a['pmin'].append(float(np.nanmin(c['beaver_pond_area'][dm])) if 'beaver_pond_area' in c else 0)
            a['wd'].append(float(np.nanmean(c['water_dist_mean'][dm])) if 'water_dist_mean' in c else float('nan'))
            a['g0'].append(float(np.nanmean(c['grass_mean'][pm])))
            a['g1'].append(float(np.nanmean(c['grass_mean'][dm])))
            a['g2'].append(float(np.nanmean(c['grass_mean'][am])) if am.any() else float('nan'))
        m = lambda k: float(np.nanmedian(a[k])) if a[k] else float('nan')
        print(f"| {nm} | {m('p0'):.0f} | {m('pmin'):.0f} | {m('wd'):.1f} | {m('g0'):.3f} | {m('g1'):.3f} | {m('g2'):.3f} |")
        res[nm] = a
    # paired grass difference (seeds appear in the same order in both)
    (c_name, c), (b_name, b) = list(res.items())
    n = min(len(c['g1']), len(b['g1']))
    for key, label in (('g1', 'grass_mean during the drought'), ('g2', 'grass_mean in the four years after')):
        m, lo, hi = boot([b[key][k] - c[key][k] for k in range(n)])
        print(f'paired {label} (beavers minus control): {m:+.4f} [{lo:+.4f}, {hi:+.4f}]')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    d = sub.add_parser('dynamics')
    d.add_argument('screens', nargs='+')
    d.add_argument('--scenario', default='baseline')
    d.add_argument('--bin', type=float, default=20)
    r = sub.add_parser('drought')
    r.add_argument('screens', nargs=2)
    r.add_argument('--scenario', default='drought')
    r.add_argument('--pre', type=float, default=20)
    r.add_argument('--window', type=float, default=60)
    a = ap.parse_args()
    dynamics(a) if a.cmd == 'dynamics' else drought(a)


if __name__ == '__main__':
    main()
