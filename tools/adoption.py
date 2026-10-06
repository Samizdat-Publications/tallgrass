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

S8 (mule deer and cougars): when a screen has the pop_muledeer column, a second table follows, with the first screen as the control (no deer,
no cougars). Per screen it reports:
  mule deer present    seeds with mule deer present (pop > 0) in >= 90% of samples after burn-in
  cougar presence      pooled share of samples with a cougar alive after burn-in (the plan's bar is 0.80 over 200 years), the median seed,
                       and the seeds at or above 0.80
  others vs control    seeds where each of bison, wolf, raven and pronghorn persist (bison final count > 0; the rest present in >= 90% of samples),
                       and the largest drop against the control. With n seeds the plan's "within 1 of 32" is within max(1, round(n / 32)) seeds
  cougar kills         per century, by prey species (cougar_kills_<prey>)
"Adopt cougars" needs cougar presence >= 0.80, every other species within the tolerance of the control, and mule deer present in the screen.
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


def s8_stats(d, scenario, burn):
    """Mule deer and cougar numbers of one screen (S8). Returns None when the CSVs have no pop_muledeer column."""
    files = sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv')))
    n = len(files)
    out = {'n': n, 'md_present': 0, 'cg_shares': [], 'cg_any': False, 'md_any': False, 'persist': {}, 'kills': {}}
    cent = {'muledeer': [], 'pronghorn': [], 'bison': []}
    for sp in ('bison', 'wolf', 'raven', 'pronghorn'):
        out['persist'][sp] = 0
    for f in files:
        rows = list(csv.DictReader(open(f)))
        if not rows or 'pop_muledeer' not in rows[0]:
            return None
        y_end = float(rows[-1]['year'])
        rs = [r for r in rows if float(r['year']) >= burn * y_end] or rows
        col = lambda k: [float(r.get(k) or 0) for r in rs]
        md, cg = col('pop_muledeer'), col('pop_cougar')
        out['md_any'] |= max(float(r['pop_muledeer']) for r in rows) > 0
        out['cg_any'] |= max(float(r['pop_cougar']) for r in rows) > 0
        if sum(v > 0 for v in md) / len(md) >= 0.9:
            out['md_present'] += 1
        out['cg_shares'].append(sum(v > 0 for v in cg) / len(cg))
        out['persist']['bison'] += float(rows[-1]['pop_bison']) > 0
        for sp in ('wolf', 'raven', 'pronghorn'):
            v = [float(r.get(f'pop_{sp}') or 0) for r in rows]
            out['persist'][sp] += sum(x > 0 for x in v) / len(v) >= 0.9
        yrs = y_end - float(rows[0]['year']) or 1
        for k in cent:
            cent[k].append(sum(float(r.get(f'cougar_kills_{k}') or 0) for r in rows) / yrs * 100)
    out['kills'] = {k: (sum(v) / len(v) if v else 0.0) for k, v in cent.items()}
    return out


def s8_table(specs, scenario, burn):
    """The S8 table and recommendation. specs is [(name, dir)] with the control first."""
    stats = [(name, s8_stats(d, scenario, burn)) for name, d in specs]
    if not stats or any(s is None for _, s in stats):
        return
    ctl_name, ctl = stats[0]
    print('\nS8: mule deer and cougars (control = ' + ctl_name + ')')
    print('| Screen | Seeds | Mule deer present >= 90% | Cougar presence pooled / median / seeds >= 0.8 | Bison | Wolf | Raven | Pronghorn | Worst drop vs control | Cougar kills per century: mule deer / pronghorn / bison |')
    print('|---|---|---|---|---|---|---|---|---|---|')
    verdicts = []
    for name, s in stats:
        n = s['n']
        tol = max(1, round(n / 32))
        sh = sorted(s['cg_shares'])
        pooled = sum(sh) / len(sh) if sh else float('nan')
        med = st.median(sh) if sh else float('nan')
        ge = sum(x >= 0.8 for x in sh)
        drops = {sp: ctl['persist'][sp] - s['persist'][sp] for sp in s['persist']}
        worst = max(drops.values())
        k = s['kills']
        cg = f'{pooled:.2f} / {med:.2f} / {ge}/{n}' if s['cg_any'] else 'none'
        print(f"| {name} | {n} | {s['md_present']}/{n} | {cg} | " + ' | '.join(f"{s['persist'][sp]}/{n}" for sp in ('bison', 'wolf', 'raven', 'pronghorn'))
              + f" | {worst} (tolerance {tol}) | {k['muledeer']:.1f} / {k['pronghorn']:.1f} / {k['bison']:.1f} |")
        if name != ctl_name and s['cg_any']:
            verdicts.append((name, pooled >= 0.8 and worst <= tol and s['md_any'], pooled, worst, tol))
    if not verdicts:
        print('No screen has cougars, so there is no cougar adoption verdict.')
        return
    good = [v for v in verdicts if v[1]]
    if good:
        best = max(good, key=lambda v: v[2])
        print(f"Cougar adoption: {best[0]} qualifies (presence {best[2]:.2f} >= 0.80, others within {best[4]} of the control). Cougars join the default world.")
    else:
        print('Cougar adoption: no screen qualifies (' + '; '.join(f'{v[0]}: presence {v[2]:.2f}, worst drop {v[3]} vs tolerance {v[4]}' for v in verdicts)
              + "). Cougar country gets the deer instead.")


def s14_stats(d, scenario, burn):
    """Beaver and pond numbers of one screen (S14). Returns None when the CSVs have no pop_beaver column."""
    files = sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv')))
    n = len(files)
    out = {'n': n, 'bv_any': False, 'bv_present': 0, 'bv_end': 0, 'persist': {sp: 0 for sp in ('bison', 'wolf', 'raven', 'pronghorn')}}
    acc = {k: [] for k in ('pop', 'colonies', 'ponds', 'area', 'meadow_area', 'built', 'breached', 'meadows', 'left', 'founded', 'wolfkills', 'drowned', 'wdm')}
    for f in files:
        rows = list(csv.DictReader(open(f)))
        if not rows or 'pop_beaver' not in rows[0]:
            return None
        y_end = float(rows[-1]['year'])
        rs = [r for r in rows if float(r['year']) >= burn * y_end] or rows
        col = lambda k, rr=rs: [float(r.get(k) or 0) for r in rr]
        bv = col('pop_beaver')
        out['bv_any'] |= max(float(r['pop_beaver']) for r in rows) > 0
        out['bv_present'] += sum(v > 0 for v in bv) / len(bv) >= 0.9
        out['bv_end'] += float(rows[-1]['pop_beaver']) > 0
        out['persist']['bison'] += float(rows[-1]['pop_bison']) > 0
        for sp in ('wolf', 'raven', 'pronghorn'):
            v = [float(r.get(f'pop_{sp}') or 0) for r in rows]
            out['persist'][sp] += sum(x > 0 for x in v) / len(v) >= 0.9
        yrs = (float(rs[-1]['year']) - float(rs[0]['year'])) or 1
        mean = lambda k: sum(col(k)) / len(rs)
        per100 = lambda k: sum(col(k)) / yrs * 100
        acc['pop'].append(mean('pop_beaver')); acc['colonies'].append(mean('beaver_colonies')); acc['ponds'].append(mean('beaver_ponds'))
        acc['area'].append(mean('beaver_pond_area')); acc['meadow_area'].append(mean('beaver_meadow_area'))
        acc['built'].append(per100('beaver_dams_built')); acc['breached'].append(per100('beaver_dams_breached')); acc['meadows'].append(per100('beaver_meadows'))
        acc['left'].append(per100('beaver_left')); acc['founded'].append(per100('beaver_founded')); acc['wolfkills'].append(per100('killed_beaver'))
        acc['drowned'].append(per100('beaver_trees_drowned')); acc['wdm'].append(mean('water_dist_mean'))
    out['acc'] = {k: (sum(v) / len(v) if v else float('nan')) for k, v in acc.items()}
    return out


def s14_table(specs, scenario, burn):
    """The S14 table: beaver presence, ponds and meadows, and whether the core species still persist (control = the first screen)."""
    stats = [(name, s14_stats(d, scenario, burn)) for name, d in specs]
    if not stats or any(s is None for _, s in stats) or not any(s['bv_any'] for _, s in stats):
        return
    ctl_name, ctl = stats[0]
    print('\nS14: beavers and ponds (control = ' + ctl_name + ')')
    print('| Screen | Seeds | Beavers present >= 90% / alive at end | Mean beavers | Colonies | Ponds | Pond area m2 | Meadow m2 | Dams built / breached / meadows per century | Colonies founded / left per century | Wolf kills per century | Trees drowned per century | Mean water dist m | Bison | Wolf | Raven | Pronghorn | Worst drop vs control |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for name, s in stats:
        n, a = s['n'], s['acc']
        tol = max(1, round(n / 32))
        drops = {sp: ctl['persist'][sp] - s['persist'][sp] for sp in s['persist']}
        print(f"| {name} | {n} | {s['bv_present']}/{n} / {s['bv_end']}/{n} | {a['pop']:.1f} | {a['colonies']:.2f} | {a['ponds']:.2f} | {a['area']:.0f} | {a['meadow_area']:.0f} "
              f"| {a['built']:.1f} / {a['breached']:.1f} / {a['meadows']:.1f} | {a['founded']:.1f} / {a['left']:.1f} | {a['wolfkills']:.1f} | {a['drowned']:.1f} | {a['wdm']:.1f} | "
              + ' | '.join(f"{s['persist'][sp]}/{n}" for sp in ('bison', 'wolf', 'raven', 'pronghorn')) + f" | {max(drops.values())} (tolerance {tol}) |")


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
    specs = [(spec.partition('=')[0], spec.partition('=')[2]) if '=' in spec else (os.path.basename(spec.rstrip('/')), spec) for spec in a.screens]
    s8_table(specs, a.scenario, a.burn)
    s14_table(specs, a.scenario, a.burn)
    elig = [s for s in rows if s['eligible']]
    if not elig:
        print('\nNo screen meets every gate: keep the current default.')
        return
    best = max(s['cvw'] for s in elig)
    winner = next(s for s in elig if s['cvw'] >= best - 0.01)  # first listed = simplest within the tie band
    print(f"\nAdopt: {winner['name']} (wolf CV {winner['cvw']:.2f}; ties within 0.01 go to the simpler config)")


if __name__ == '__main__':
    main()
