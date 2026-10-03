"""Dynamics report for a batch run: are the populations regulated by predators, and do the cycles read?

Usage: .venv/Scripts/python tools/dynamics.py <batch-out-dir> [<batch-out-dir> ...] [--scenario baseline] [--skip-years 5]

Per run directory prints, as medians across seeds:
  persistence of each species
  births per bison per year, and what share of bison deaths are predation, starvation, old age
  year-to-year volatility of annual means (median |log change|), and CV of annual means
  wolf CV of annual means, and the lag (years) at which wolves best track bison (cross-correlation of annual means)
Annual means remove the seasonal birth-and-winter pulse, which sampled sparsely looks like jitter.
"""
import argparse
import csv
import glob
import math
import os
import statistics as st

SPECIES = ['bison', 'wolf', 'raven', 'pronghorn', 'cougar']


def annual(rows, key):
    by = {}
    for r in rows:
        y = int(float(r['year']))
        by.setdefault(y, []).append(float(r[key]))
    ys = sorted(by)
    return ys, [st.mean(by[y]) for y in ys]


def xcorr_lag(a, b, max_lag=6):
    """Lag L (years) maximizing corr(a[t], b[t+L]); b follows a when L > 0."""
    best, best_l = -2.0, 0
    for lag in range(0, max_lag + 1):
        x = a[: len(a) - lag] if lag else a
        y = b[lag:]
        n = min(len(x), len(y))
        if n < 8:
            continue
        x, y = x[:n], y[:n]
        mx, my = st.mean(x), st.mean(y)
        sx = math.sqrt(sum((v - mx) ** 2 for v in x))
        sy = math.sqrt(sum((v - my) ** 2 for v in y))
        if sx == 0 or sy == 0:
            continue
        c = sum((p - mx) * (q - my) for p, q in zip(x, y)) / (sx * sy)
        if c > best:
            best, best_l = c, lag
    return best_l, best


def report(d, scenario, skip):
    files = sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv')))
    if not files:
        print(f'{d}: no seed CSVs')
        return
    alive = {s: 0 for s in SPECIES}
    present = {s: 0 for s in SPECIES}
    bpc, kill_sh, starve_sh, old_sh = [], [], [], []
    vol_b, vol_p, cv_b, cv_w, lags, lagc = [], [], [], [], [], []
    for f in files:
        rows = list(csv.DictReader(open(f)))
        rows_s = [r for r in rows if float(r['year']) >= skip]
        last = rows[-1]
        for s in SPECIES:
            k = f'pop_{s}'
            if k in last and float(rows[0][k]) + max(float(r[k]) for r in rows) > 0:
                present[s] += 1
                alive[s] += float(last[k]) > 0
        if not rows_s:
            continue
        g = lambda k: sum(float(r.get(k, 0) or 0) for r in rows_s)
        years = float(rows_s[-1]['year']) - float(rows_s[0]['year']) or 1
        _, bison = annual(rows_s, 'pop_bison')
        mean_b = st.mean(bison) or 1
        bpc.append(g('births_bison') / years / mean_b)
        deaths = g('killed_bison') + g('starved_bison') + g('starved_juv_bison') + g('old_bison') + g('thirst_bison')
        if deaths:
            kill_sh.append(g('killed_bison') / deaths)
            starve_sh.append((g('starved_bison') + g('starved_juv_bison')) / deaths)
            old_sh.append(g('old_bison') / deaths)
        _, wolf = annual(rows_s, 'pop_wolf')
        _, prong = annual(rows_s, 'pop_pronghorn')

        def vol(series):
            ch = [abs(math.log((b + 1) / (a + 1))) for a, b in zip(series, series[1:])]
            return st.median(ch) if ch else float('nan')

        vol_b.append(vol(bison))
        vol_p.append(vol(prong))
        cv_b.append(st.pstdev(bison) / mean_b)
        cv_w.append(st.pstdev(wolf) / (st.mean(wolf) or 1))
        lag, c = xcorr_lag(bison, wolf)
        lags.append(lag)
        lagc.append(c)
    n = len(files)
    med = lambda v: st.median(v) if v else float('nan')
    print(f'== {d} ({scenario}, {n} seeds, stats from year {skip})')
    print('  persistence: ' + ', '.join(f'{s} {alive[s]}/{present[s]}' for s in SPECIES if present[s]))
    print(f'  bison births per capita per year {med(bpc):.2f}; deaths: predation {med(kill_sh):.0%}, starvation {med(starve_sh):.0%}, old age {med(old_sh):.0%}')
    print(f'  annual means: bison CV {med(cv_b):.2f}, median year-to-year change bison {med(vol_b):.0%} pronghorn {med(vol_p):.0%}')
    print(f'  wolves: CV {med(cv_w):.2f}; best lag behind bison {med(lags):.0f} yr (median corr {med(lagc):.2f})')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dirs', nargs='+')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--skip-years', type=float, default=5)
    a = ap.parse_args()
    for d in a.dirs:
        report(d, a.scenario, a.skip_years)


if __name__ == '__main__':
    main()
