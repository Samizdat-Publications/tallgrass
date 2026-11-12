"""Winter table (V2-PLAN.md S11): snow and winter starvation from batch screens.

    python tools/winter.py W0=scratch/screens/W0 W1=scratch/screens/W1 ... [--scenario baseline] [--burn 0.1]
                           [--year-ticks 1200] [--offset 540]

Samples are cut by the season their window ends in. The sim opens in late summer (season 1.8), so with --sample 600 on the default
2-year calendar (1,200 ticks per valley year) every sample ends at season 3.8 (its 600-tick window covers the autumn and the winter up to
3.8) or at season 1.8 (the rest of winter, the spring and the summer). The first kind is the "winter" sample: starved_* in it is the
winter starvation. --year-ticks and --offset (the tick-0 position in the year, 1.8 x 300 = 540) describe the calendar.

Per screen, over its seeds (samples after the burn-in share of the run), medians across seeds unless said:
  winter samples   starved per valley year for bison, pronghorn, wolf, coyote and mule deer in the winter samples, then in the other samples,
                   and the winter share of all starvation deaths
  snow             mean of snow_peak (highest mean depth between samples) in the winter samples, and the share of those samples with snow_peak > 0.05
  events           blizzards and hard winters per 100 valley years (columns blizzards, hard_winters; 0 when snow is off)
Needs the S11 columns (snow_peak, blizzards, hard_winters) for the snow lines; starvation reads from any batch.
"""
import argparse
import csv
import glob
import os
import statistics as st

SPECIES = ['bison', 'pronghorn', 'wolf', 'coyote', 'muledeer']


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def season_end(tick, year_ticks, offset):
    return ((tick + offset) % year_ticks) / (year_ticks / 4)


def seed_stats(path, burn, year_ticks, offset):
    with open(path, newline='') as f:
        rows = list(csv.DictReader(f))
    if len(rows) < 4:
        return None
    rows = rows[int(len(rows) * burn):]
    yrs = (num(rows[-1]['tick']) - num(rows[0]['tick'])) / year_ticks or 1.0
    win, oth = [], []
    for r in rows:
        s = season_end(num(r['tick']), year_ticks, offset)
        (win if 3.0 < s <= 4.0 else oth).append(r)
    out = {'win_n': len(win), 'oth_n': len(oth), 'years': yrs}
    tot_w = tot_o = 0.0
    for sp in SPECIES:
        col = f'starved_{sp}'
        w = sum(num(r.get(col)) for r in win)
        o = sum(num(r.get(col)) for r in oth)
        out['w_' + sp] = w / yrs
        out['o_' + sp] = o / yrs
        tot_w += w
        tot_o += o
    out['share'] = tot_w / (tot_w + tot_o) if tot_w + tot_o else float('nan')
    has = 'snow_peak' in rows[0]
    out['has_snow'] = has
    if has:
        peaks = [num(r['snow_peak']) for r in win]
        out['peak'] = sum(peaks) / len(peaks) if peaks else 0.0
        out['snowy'] = sum(p > 0.05 for p in peaks) / len(peaks) if peaks else 0.0
        out['blz'] = 100.0 * sum(num(r['blizzards']) for r in rows) / yrs
        out['hard'] = 100.0 * sum(num(r['hard_winters']) for r in rows) / yrs
    return out


def med(v):
    v = [x for x in v if x == x]
    return st.median(v) if v else float('nan')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('screens', nargs='+', help='NAME=dir')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--burn', type=float, default=0.1)
    ap.add_argument('--year-ticks', type=int, default=1200)
    ap.add_argument('--offset', type=int, default=540)
    a = ap.parse_args()
    for item in a.screens:
        name, _, d = item.partition('=')
        files = sorted(glob.glob(os.path.join(d, a.scenario, 'seed_*.csv')))
        stats = [s for s in (seed_stats(f, a.burn, a.year_ticks, a.offset) for f in files) if s]
        if not stats:
            print(f'{name}: no CSVs in {d}/{a.scenario}')
            continue
        print(f'\n{name}  ({len(stats)} seeds, {med([s["years"] for s in stats]):.0f} valley years after burn-in)')
        print('  starved per valley year       winter samples      other samples')
        for sp in SPECIES:
            w = med([s['w_' + sp] for s in stats])
            o = med([s['o_' + sp] for s in stats])
            print(f'    {sp:<12}                {w:9.2f}           {o:9.2f}')
        print(f'  winter share of all starvation (median)  {med([s["share"] for s in stats]):.2f}')
        if stats[0]['has_snow']:
            print(f'  snow_peak in winter samples: mean {st.mean(s["peak"] for s in stats):.3f}, samples with snow {st.mean(s["snowy"] for s in stats):.2f}')
            print(f'  blizzards per 100 years: {st.mean(s["blz"] for s in stats):.1f}   hard winters per 100 years: {st.mean(s["hard"] for s in stats):.1f}')
        else:
            print('  (no snow columns in this screen)')


if __name__ == '__main__':
    main()
