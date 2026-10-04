"""S3 adoption table (V2-PLAN.md S3 step 2): compare batch screens and pick the one to adopt.

    python tools/adoption.py A=scratch/screens/A B=scratch/screens/B ... [--scenario baseline] [--burn 0.1]

Per screen, over its seeds:
  bison persist        seeds whose final bison count is > 0
  presence >= 90%      seeds where wolves, pronghorn and ravens are each present (pop > 0) in >= 90% of samples
  pronghorn starve     median share of pronghorn deaths that are starvation, after burn-in
                       (deaths = killed + starved + old + thirst; CSVs before the generic death columns have only
                       kills_pronghorn (wolf kills) and no old age, so their share reads high; emigrants are not deaths)
  wolf CV              median CV of annual mean wolf counts, after burn-in
  wolf-bison corr      median over seeds of the best correlation corr(bison[t], wolf[t+L]) for L in 1..3 years
Thresholds scale with the seed count: the plan's "30 of 32" and "29 of 32" become ceil(n * 30/32) and ceil(n * 29/32).
Eligible screens must meet all four gates; the winner is the eligible screen with the highest wolf CV, and a tie
(within 0.01) goes to the simpler config, which is the one listed first.
"""
import argparse
import csv
import glob
import math
import os
import statistics as st

import numpy as np


def annual(rows, key):
    by = {}
    for r in rows:
        by.setdefault(int(float(r['year'])), []).append(float(r.get(key) or 0))
    ys = sorted(by)
    return np.array([sum(by[y]) / len(by[y]) for y in ys])


def lag_corr(b, w, lags=(1, 2, 3)):
    best = float('nan')
    for L in lags:
        x, y = b[: len(b) - L], w[L:]
        if len(x) < 8 or x.std() == 0 or y.std() == 0:
            continue
        c = float(np.corrcoef(x, y)[0, 1])
        if math.isnan(best) or c > best:
            best = c
    return best


def screen_stats(d, scenario, burn):
    files = sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv')))
    n = len(files)
    persist = present_ok = 0
    starve, cvw, corr, years = [], [], [], []
    for f in files:
        rows = list(csv.DictReader(open(f)))
        if not rows:
            continue
        persist += float(rows[-1]['pop_bison']) > 0
        ok = True
        for sp in ('wolf', 'pronghorn', 'raven'):
            vals = [float(r.get(f'pop_{sp}') or 0) for r in rows]
            if sum(v > 0 for v in vals) / len(vals) < 0.9:
                ok = False
        present_ok += ok
        y_end = float(rows[-1]['year'])
        years.append(y_end)
        rs = [r for r in rows if float(r['year']) >= burn * y_end]
        if len(rs) < 2:
            continue
        g = lambda k: sum(float(r.get(k) or 0) for r in rs)
        # killed_pronghorn (every predator) when the CSV has it, else kills_pronghorn (wolf kills only, older CSVs)
        killed = g('killed_pronghorn') if 'killed_pronghorn' in rs[0] else g('kills_pronghorn')
        deaths = killed + g('starved_pronghorn') + g('old_pronghorn') + g('thirst_pronghorn')
        if deaths:
            starve.append(g('starved_pronghorn') / deaths)
        w = annual(rs, 'pop_wolf')
        b = annual(rs, 'pop_bison')
        if w.mean() > 0:
            cvw.append(float(w.std() / w.mean()))
        c = lag_corr(b, w)
        if not math.isnan(c):
            corr.append(c)
    med = lambda v: st.median(v) if v else float('nan')
    return {
        'n': n, 'years': med(years), 'persist': persist, 'present': present_ok,
        'starve': med(starve), 'cvw': med(cvw), 'corr': med(corr),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('screens', nargs='+', help='NAME=batch-out-dir, simplest config first')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--burn', type=float, default=0.1, help='burn-in fraction of each run (default 0.1)')
    a = ap.parse_args()
    rows = []
    for spec in a.screens:
        name, _, d = spec.partition('=')
        if not d:
            name, d = os.path.basename(spec.rstrip('/')), spec
        s = screen_stats(d, a.scenario, a.burn)
        n = s['n']
        need_p, need_pr = math.ceil(n * 30 / 32), math.ceil(n * 29 / 32)
        gates = {
            'persist': s['persist'] >= need_p,
            'present': s['present'] >= need_pr,
            'starve': s['starve'] <= 0.5,
            'corr': s['corr'] >= 0.4,
        }
        s.update(name=name, gates=gates, eligible=n > 0 and all(gates.values()), need_p=need_p, need_pr=need_pr)
        rows.append(s)

    mark = lambda ok: '' if ok else ' x'
    print('| Screen | Seeds | Years | Bison persist | Presence >= 90% | Pronghorn starve | Wolf CV | Wolf-bison corr (1-3 yr) | Eligible |')
    print('|---|---|---|---|---|---|---|---|---|')
    for s in rows:
        g = s['gates']
        print(f"| {s['name']} | {s['n']} | {s['years']:.0f} | {s['persist']}/{s['n']} (need {s['need_p']}){mark(g['persist'])} "
              f"| {s['present']}/{s['n']} (need {s['need_pr']}){mark(g['present'])} | {s['starve']:.0%}{mark(g['starve'])} "
              f"| {s['cvw']:.2f} | {s['corr']:.2f}{mark(g['corr'])} | {'yes' if s['eligible'] else 'no'} |")
    elig = [s for s in rows if s['eligible']]
    if not elig:
        print('\nNo screen meets every gate: keep the current default.')
        return
    best = max(s['cvw'] for s in elig)
    winner = next(s for s in elig if s['cvw'] >= best - 0.01)  # first listed = simplest within the tie band
    print(f"\nAdopt: {winner['name']} (wolf CV {winner['cvw']:.2f}; ties within 0.01 go to the simpler config)")


if __name__ == '__main__':
    main()
