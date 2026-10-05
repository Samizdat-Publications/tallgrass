"""Dynamics report for a batch run: are the populations regulated by predators, and do the cycles read?

Usage: .venv/Scripts/python tools/dynamics.py <batch-out-dir> [<batch-out-dir> ...] [--scenario baseline] [--skip-years 5]

Per run directory prints, as medians across seeds:
  persistence of each species
  births per bison per year, and what share of bison deaths are predation, starvation, old age
  year-to-year volatility of annual means (median |log change|), and CV of annual means
  wolf CV of annual means, and the lag (years) at which wolves best track bison (cross-correlation of annual means)
  open prairie (S1): presence (share of samples with the species alive), local extinctions per 1,000 years, years absent,
    immigrants and emigrants per century (imm_<key>, emig_<key> columns), and vagrant ravens (vagrants, vagrant_in, vagrant_out)
  coyotes (S5): CV of the coyote series (raw samples and annual means), the hare CV, and how well the coyotes follow the hares:
    corr(hare_total at t, pop_coyote at t + lag) on half-year means at lags of 0.5, 1, 1.5 and 2 years (best of those; the plan's gate is
    0.4) and on annual means at 1 and 2 years, plus coyote kills by wolves, fawns taken, pairs and births per year
Annual means remove the seasonal birth-and-winter pulse, which sampled sparsely looks like jitter.
"""
import argparse
import csv
import glob
import json
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


def block_means(rows, key, per_year):
    """Means of the samples in each 1/per_year-year block (blocks with no sample are dropped)."""
    by = {}
    for r in rows:
        by.setdefault(int(float(r['year']) * per_year), []).append(float(r[key]))
    return [st.mean(by[b]) for b in sorted(by)][:-1]  # the last block is usually partial


def lag_corr(lead, follow, lag):
    """corr(lead[t], follow[t + lag]); None when the series are too short or flat."""
    x, y = lead[: len(lead) - lag], follow[lag:]
    n = min(len(x), len(y))
    if n < 6:
        return None
    x, y = x[:n], y[:n]
    mx, my = st.mean(x), st.mean(y)
    sx = math.sqrt(sum((v - mx) ** 2 for v in x))
    sy = math.sqrt(sum((v - my) ** 2 for v in y))
    if sx < 1e-9 or sy < 1e-9:
        return None
    return sum((p - mx) * (q - my) for p, q in zip(x, y)) / (sx * sy)


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
    meso = {'cv_raw': [], 'cv_ann': [], 'hare_cv_raw': [], 'hare_cv_ann': [], 'best_r': [], 'best_lag': [], 'ann_r': [], 'wolf_kills': [],
            'fawns': [], 'pairs': [], 'births': [], 'mean': []}
    web = {'cv_a': {'rabbit': [], 'prairiedog': []}, 'cv_s': {'rabbit': [], 'prairiedog': []}, 'plague': [], 'towns': [], 'founded': [], 'boom': [], 'crash': []}
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
        if 'hare_total' in rows[0] and max(float(r['hare_total']) for r in rows) > 0:
            # small-prey web (S4): CV of the annual means and of the raw samples, plague per 100 years, towns
            for sp in ('rabbit', 'prairiedog'):
                if f'pop_{sp}' not in rows[0]:
                    continue
                _, ann = annual(rows_s, f'pop_{sp}')
                raw = [float(r[f'pop_{sp}']) for r in rows_s]
                web['cv_a'][sp].append(st.pstdev(ann) / (st.mean(ann) or 1))
                web['cv_s'][sp].append(st.pstdev(raw) / (st.mean(raw) or 1))
            yrs_all = float(rows[-1]['year']) - float(rows[0]['year']) or 1
            web['plague'].append(sum(float(r.get('plague_events', 0) or 0) for r in rows) / yrs_all * 100)
            web['founded'].append(sum(float(r.get('town_founded', 0) or 0) for r in rows) / yrs_all * 100)
            web['boom'].append(sum(float(r.get('hare_boom', 0) or 0) for r in rows) / yrs_all * 100)
            web['crash'].append(sum(float(r.get('hare_crash', 0) or 0) for r in rows) / yrs_all * 100)
            web['towns'].append(st.mean(float(r.get('towns', 0) or 0) for r in rows_s))
        years = float(rows_s[-1]['year']) - float(rows_s[0]['year']) or 1
        if 'pop_coyote' in rows[0] and 'hare_total' in rows[0] and float(rows[0]['pop_coyote']) > 0:
            cr = [float(r['pop_coyote']) for r in rows_s]
            hr = [float(r['hare_total']) for r in rows_s]
            _, ca = annual(rows_s, 'pop_coyote')
            _, ha = annual(rows_s, 'hare_total')
            meso['mean'].append(st.mean(cr))
            meso['cv_raw'].append(st.pstdev(cr) / (st.mean(cr) or 1))
            meso['cv_ann'].append(st.pstdev(ca) / (st.mean(ca) or 1))
            meso['hare_cv_raw'].append(st.pstdev(hr) / (st.mean(hr) or 1))
            meso['hare_cv_ann'].append(st.pstdev(ha) / (st.mean(ha) or 1))
            hh, ch = block_means(rows_s, 'hare_total', 2), block_means(rows_s, 'pop_coyote', 2)
            cand = [(lag / 2, lag_corr(hh, ch, lag)) for lag in (1, 2, 3, 4)]
            cand = [(l, c) for l, c in cand if c is not None]
            if cand:
                lag_b, r_b = max(cand, key=lambda t: t[1])
                meso['best_r'].append(r_b)
                meso['best_lag'].append(lag_b)
            ann = [lag_corr(ha, ca, k) for k in (1, 2)]
            ann = [c for c in ann if c is not None]
            if ann:
                meso['ann_r'].append(max(ann))
            if 'coyote_kills_by_wolf' in rows[0]:
                meso['wolf_kills'].append(sum(float(r['coyote_kills_by_wolf'] or 0) for r in rows) / years)
                meso['fawns'].append(sum(float(r['coyote_fawns'] or 0) for r in rows) / years)
                meso['pairs'].append(st.mean(float(r['coyote_pairs'] or 0) for r in rows_s))
                meso['births'].append(sum(float(r['births_coyote'] or 0) for r in rows) / years)
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
    if web['plague']:
        print('  small-prey web (S4): CV of annual means / of samples: ' + ', '.join(f"{sp} {med(web['cv_a'][sp]):.2f} / {med(web['cv_s'][sp]):.2f}" for sp in ('rabbit', 'prairiedog') if web['cv_a'][sp]))
        print(f"  plagues per 100 yr: median {med(web['plague']):.1f} (per seed {', '.join(f'{v:.1f}' for v in web['plague'])}); mean towns {st.mean(web['towns']):.1f}; towns founded per 100 yr {med(web['founded']):.1f}; hare booms {med(web['boom']):.1f} and crashes {med(web['crash']):.1f} per 100 yr")
    if meso['cv_raw']:
        ok_r = sum(1 for r in meso['best_r'] if r >= 0.4)
        print(f"  coyotes (S5): mean {med(meso['mean']):.1f}, CV of samples {med(meso['cv_raw']):.2f}, of annual means {med(meso['cv_ann']):.2f}; hare CV {med(meso['hare_cv_raw']):.2f} (annual means {med(meso['hare_cv_ann']):.2f})")
        if meso['best_r']:
            print(f"    coyotes follow hares: best corr on half-year means at 0.5 to 2 yr median {med(meso['best_r']):.2f} (lag {med(meso['best_lag']):.1f} yr; {ok_r}/{len(meso['best_r'])} seeds at 0.4 or more); annual means {med(meso['ann_r']) if meso['ann_r'] else float('nan'):.2f}")
        if meso['wolf_kills']:
            print(f"    per year: pairs with a den (mean) {med(meso['pairs']):.1f}, births {med(meso['births']):.1f}, fawns taken {med(meso['fawns']):.1f}, killed by wolves {med(meso['wolf_kills']):.2f}")
    if vag_mean and (max(vag_max) > 0 or st.mean(vag_in_c) > 0):
        print(f'  vagrant ravens: mean {st.mean(vag_mean):.1f}, max {max(vag_max):.0f}; arrivals {st.mean(vag_in_c):.1f} and departures {st.mean(vag_out_c):.1f} per century')


def wipe_report(d, scenario):
    """Mesopredator release after the wolfwipe shock (S5): coyotes in the 10 valley years after the wolves are removed against the 10
    years before (annual means). The plan's gate is a peak of at least 1.5x the pre-shock mean."""
    files = sorted(glob.glob(os.path.join(d, scenario, 'seed_*.csv')))
    sj = os.path.join(d, scenario, 'summary.json')
    if not files or not os.path.exists(sj) or scenario != 'wolfwipe':
        return
    summary = json.load(open(sj))
    seeds = summary.get('seeds') or summary.get('perSeed') or []
    ticks = {}
    for sd in seeds:
        evs = sd.get('events') or (sd.get('shocks') or [])
        if evs:
            ticks[int(sd['seed'])] = evs[0]['tick']
    if not ticks:
        evs = summary.get('events') or []
        print('  wolfwipe release: no shock ticks in summary.json')
        return
    ratios, pre_l, peak_l = [], [], []
    for f in files:
        seed = int(os.path.basename(f)[5:-4])
        if seed not in ticks:
            continue
        rows = list(csv.DictReader(open(f)))
        if 'pop_coyote' not in rows[0]:
            continue
        yr0 = ticks[seed] / (float(rows[1]['tick']) / float(rows[1]['year'])) if float(rows[1]['year']) else 0
        pre = [float(r['pop_coyote']) for r in rows if yr0 - 10 <= float(r['year']) <= yr0]
        post = [r for r in rows if yr0 < float(r['year']) <= yr0 + 10]
        if len(pre) < 4 or len(post) < 4:
            continue
        _, ann = annual(post, 'pop_coyote')
        pre_m = st.mean(pre)
        peak = max(ann)
        pre_l.append(pre_m)
        peak_l.append(peak)
        ratios.append(peak / pre_m if pre_m > 0 else float('inf'))
    if not ratios:
        print('  wolfwipe release: no usable seeds')
        return
    ok15 = sum(1 for r in ratios if r >= 1.5)
    print(f"  wolfwipe release (coyotes): pre-shock mean {st.median(pre_l):.1f}, peak annual mean in the next 10 yr {st.median(peak_l):.1f}, ratio median {st.median(ratios):.2f}; {ok15}/{len(ratios)} seeds reach 1.5x (per seed {', '.join(f'{r:.1f}' for r in ratios)})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dirs', nargs='+')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--skip-years', type=float, default=5)
    a = ap.parse_args()
    for d in a.dirs:
        report(d, a.scenario, a.skip_years)
        wipe_report(d, a.scenario)


if __name__ == '__main__':
    main()
