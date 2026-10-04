"""Dynamics report for a batch run: are the populations regulated by predators, and do the cycles read?

Usage: .venv/Scripts/python tools/dynamics.py <batch-out-dir> [<batch-out-dir> ...] [--scenario baseline] [--skip-years 5]

Per run directory prints, as medians across seeds:
  persistence of each species
  births per bison per year, and what share of bison deaths are predation, starvation, old age
  year-to-year volatility of annual means (median |log change|), and CV of annual means
  wolf CV of annual means, and the lag (years) at which wolves best track bison (cross-correlation of annual means)
  open prairie (S1): presence (share of samples with the species alive), local extinctions per 1,000 years, years absent,
    immigrants and emigrants per century (imm_<key>, emig_<key> columns), and vagrant ravens (vagrants, vagrant_in, vagrant_out)
Annual means remove the seasonal birth-and-winter pulse, which sampled sparsely looks like jitter.
"""
import argparse
import csv
import glob
import math
import os
import statistics as st

from species_cols import species_from_files


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


def flow_presence(rows, rows_s, species, presence, ext_rate, absent, imm_c, emig_c, vag_mean, vag_max, vag_in_c, vag_out_c):
    """Per-seed presence and flow numbers (open prairie, S1). Columns that an older CSV lacks are skipped."""
    years_all = float(rows[-1]['year']) - float(rows[0]['year'])
    years_s = float(rows_s[-1]['year']) - float(rows_s[0]['year'])
    step = years_s / (len(rows_s) - 1) if len(rows_s) > 1 else 0.0
    for s in species:
        k = f'pop_{s}'
        if k not in rows[0] or float(rows[0][k]) <= 0:
            continue
        v = [float(r[k]) for r in rows_s]
        presence[s].append(sum(1 for x in v if x > 0) / len(v))
        blinks = sum(1 for a, b in zip(v, v[1:]) if a > 0 and b == 0)
        if years_s >= 1:
            ext_rate[s].append(blinks / years_s * 1000)
        absent[s].append(sum(1 for x in v if x == 0) * step)
        if years_all > 0 and f'imm_{s}' in rows[0]:
            imm_c[s].append(sum(float(r[f'imm_{s}'] or 0) for r in rows) / years_all * 100)
            emig_c[s].append(sum(float(r[f'emig_{s}'] or 0) for r in rows) / years_all * 100)
    if 'vagrants' in rows[0] and years_all > 0:
        vv = [float(r['vagrants'] or 0) for r in rows_s]
        vag_mean.append(st.mean(vv))
        vag_max.append(max(vv))
        vag_in_c.append(sum(float(r['vagrant_in'] or 0) for r in rows) / years_all * 100)
        vag_out_c.append(sum(float(r['vagrant_out'] or 0) for r in rows) / years_all * 100)


def report(d, scenario, skip):
    files = sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv')))
    if not files:
        print(f'{d}: no seed CSVs')
        return
    SPECIES = species_from_files(files)  # every pop_<key> column; species that never appear are not printed
    alive = {s: 0 for s in SPECIES}
    present = {s: 0 for s in SPECIES}
    bpc, kill_sh, starve_sh, old_sh = [], [], [], []
    vol_b, vol_p, cv_b, cv_w, lags, lagc = [], [], [], [], [], []
    presence = {s: [] for s in SPECIES}
    ext_rate = {s: [] for s in SPECIES}
    absent = {s: [] for s in SPECIES}
    imm_c = {s: [] for s in SPECIES}
    emig_c = {s: [] for s in SPECIES}
    vag_mean, vag_max, vag_in_c, vag_out_c = [], [], [], []
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
        flow_presence(rows, rows_s, SPECIES, presence, ext_rate, absent, imm_c, emig_c, vag_mean, vag_max, vag_in_c, vag_out_c)
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
    live = [s for s in SPECIES if presence[s]]
    print('  presence (share of samples alive): ' + ', '.join(f'{s} {med(presence[s]):.0%}' for s in live))
    print('  local extinctions per 1,000 yr (mean over seeds): ' + ', '.join(f'{s} {st.mean(ext_rate[s]):.1f}' for s in live if ext_rate[s]))
    print('  years absent (median over seeds): ' + ', '.join(f'{s} {med(absent[s]):.1f}' for s in live))
    flows = [s for s in live if imm_c[s] and (st.mean(imm_c[s]) > 0 or st.mean(emig_c[s]) > 0)]
    if flows:
        print('  immigrants / emigrants per century (mean over seeds): ' + ', '.join(f'{s} {st.mean(imm_c[s]):.1f} in, {st.mean(emig_c[s]):.1f} out' for s in flows))
    else:
        print('  immigrants / emigrants per century: none recorded (open prairie off, or older CSVs)')
    if vag_mean and (max(vag_max) > 0 or st.mean(vag_in_c) > 0):
        print(f'  vagrant ravens: mean {st.mean(vag_mean):.1f}, max {max(vag_max):.0f}; arrivals {st.mean(vag_in_c):.1f} and departures {st.mean(vag_out_c):.1f} per century')


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
