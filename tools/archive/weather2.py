"""Weather table (V2-PLAN.md S12): dust storms, grasshopper outbreaks and spring floods from batch screens.

    python tools/weather2.py X0=scratch/screens/X0 X1=scratch/screens/X1 ... [--scenario baseline] [--burn 0.1]

Per screen, over its seeds (samples after the burn-in share of the run). Frequencies are events per 100 valley years, pooled over seeds,
then the min and max seed; "(seeds with any)" counts the seeds that saw at least one.
  dust storms      columns dust_storms (begun since the last sample), drought (1 when a drought runs at the sample), dust_bare (bare share of the
                   land at the sample). Also the storms per 100 drought-years (the drought share of samples x the run length).
  grasshoppers     hop_outbreaks per 100 years, the share of valley years with an outbreak, mean and highest hop_peak, hop_eaten (grass removed,
                   in mean-grass units) per valley year, and the energy fed to coyotes, ravens and hawks per valley year.
  spring floods    spring_floods per 100 years, fawns_drowned per 100 years (young drowned by any flood), and drowned per flood.
Needs the S12 columns; a screen with the features off reads 0 everywhere.
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


def seed_stats(path, burn):
    with open(path, newline='') as f:
        rows = list(csv.DictReader(f))
    if len(rows) < 4:
        return None
    rows = rows[int(len(rows) * burn):]
    yrs = (num(rows[-1]['year']) - num(rows[0]['year'])) or 1.0
    # each row is one sample window; its length in valley years
    step = yrs / max(1, len(rows) - 1)
    col = lambda k: [num(r.get(k)) for r in rows]
    out = {'years': yrs, 'has': 'dust_storms' in rows[0]}
    if not out['has']:
        return out
    dust = sum(col('dust_storms'))
    dsamples = sum(1 for v in col('drought') if v > 0)
    out['dust'] = 100.0 * dust / yrs
    out['dust_n'] = dust
    out['drought_yrs'] = dsamples * step
    out['drought_share'] = dsamples / len(rows)
    out['dust_per_dyr'] = 100.0 * dust / (dsamples * step) if dsamples else float('nan')
    out['bare_drought'] = st.mean([num(r['dust_bare']) for r in rows if num(r.get('drought')) > 0] or [float('nan')])
    hop = col('hop_outbreaks')
    out['hop'] = 100.0 * sum(hop) / yrs
    out['hop_n'] = sum(hop)
    by = {}
    for r in rows:
        by.setdefault(int(num(r['year'])), 0.0)
        by[int(num(r['year']))] += num(r.get('hop_outbreaks'))
    out['hop_years'] = sum(1 for v in by.values() if v > 0) / max(1, len(by))
    out['hop_peak_mean'] = st.mean(col('hop_peak'))
    out['hop_peak_max'] = max(col('hop_peak'))
    out['hop_eaten'] = sum(col('hop_eaten')) / yrs
    for k in ('coyote', 'raven', 'hawk'):
        out['fed_' + k] = sum(col('hop_fed_' + k)) / yrs
    fl = sum(col('spring_floods'))
    out['flood'] = 100.0 * fl / yrs
    out['flood_n'] = fl
    dr = sum(col('fawns_drowned'))
    out['drown'] = 100.0 * dr / yrs
    out['drown_per'] = dr / fl if fl else float('nan')
    return out


def pooled(stats, key):
    return st.mean(s[key] for s in stats)


def rng(stats, key):
    v = [s[key] for s in stats]
    return f'{min(v):.1f} to {max(v):.1f}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('screens', nargs='+', help='NAME=dir')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--burn', type=float, default=0.1)
    a = ap.parse_args()
    for item in a.screens:
        name, _, d = item.partition('=')
        files = sorted(glob.glob(os.path.join(d, a.scenario, 'seed_*.csv')))
        stats = [s for s in (seed_stats(f, a.burn) for f in files) if s]
        if not stats:
            print(f'{name}: no CSVs in {d}/{a.scenario}')
            continue
        print(f'\n{name}  ({len(stats)} seeds, {st.mean(s["years"] for s in stats):.0f} valley years after burn-in)')
        if not stats[0]['has']:
            print('  (no S12 columns in this screen)')
            continue
        print(f'  dust storms per 100 years: {pooled(stats, "dust"):.1f}  (seeds {rng(stats, "dust")}; seeds with any {sum(s["dust_n"] > 0 for s in stats)}/{len(stats)})')
        dd = [s['dust_per_dyr'] for s in stats if s['dust_per_dyr'] == s['dust_per_dyr']]
        print(f'    drought share of samples {pooled(stats, "drought_share"):.3f}; storms per 100 drought-years {st.mean(dd) if dd else float("nan"):.1f}; mean bare share in drought samples {st.mean(s["bare_drought"] for s in stats if s["bare_drought"] == s["bare_drought"]) if any(s["bare_drought"] == s["bare_drought"] for s in stats) else float("nan"):.2f}')
        print(f'  grasshopper outbreaks per 100 years: {pooled(stats, "hop"):.1f}  (seeds {rng(stats, "hop")}); years with an outbreak {pooled(stats, "hop_years"):.2f}')
        print(f'    hop_peak mean {pooled(stats, "hop_peak_mean"):.3f}, highest {max(s["hop_peak_max"] for s in stats):.2f}; grass eaten {pooled(stats, "hop_eaten"):.3f} per valley year (mean-grass units)')
        print(f'    energy fed per valley year: coyote {pooled(stats, "fed_coyote"):.3f}, raven {pooled(stats, "fed_raven"):.3f}, hawk {pooled(stats, "fed_hawk"):.3f}')
        dp = [s['drown_per'] for s in stats if s['drown_per'] == s['drown_per']]
        print(f'  spring floods per 100 years: {pooled(stats, "flood"):.1f}  (seeds {rng(stats, "flood")}); young drowned per 100 years {pooled(stats, "drown"):.1f}, per flood {st.mean(dp) if dp else float("nan"):.2f}')


if __name__ == '__main__':
    main()
