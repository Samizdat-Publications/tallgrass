"""Find seeds with remarkable histories in a batch run, to pick named worlds (src/seeds.ts).

Usage: .venv/Scripts/python tools/mine_seeds.py <batch-out-dir> [--scenario baseline] [--skip-years 3] [--max-years 80]

For each seed prints min and max of each species after the opening years, how many droughts it had, and
flags the extremes: lowest bison (knife's edge), highest bison (thunder herd), richest valley, driest world,
fewest wolves (wolf winter), lowest pronghorn that still survived (last stand), calmest (lowest bison CV).
"""
import argparse
import csv
import glob
import os
import statistics as st

from species_cols import species_from_files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dir')
    ap.add_argument('--scenario', default='baseline')
    ap.add_argument('--skip-years', type=float, default=3)
    ap.add_argument('--max-years', type=float, default=1e9, help='only look at the first N valley years (what a player watches)')
    a = ap.parse_args()
    rows_by_seed = {}
    for f in glob.glob(os.path.join(a.dir, a.scenario, 'seed_*.csv')):
        seed = int(os.path.basename(f)[5:-4])
        rows_by_seed[seed] = [r for r in csv.DictReader(open(f)) if float(r['year']) <= a.max_years]
    stats = {}
    # a world survives when every species it started with is still alive (species list read from the CSV header)
    files = glob.glob(os.path.join(a.dir, a.scenario, 'seed_*.csv'))
    started = [k for k in species_from_files(files) if any(rows and float(rows[0][f'pop_{k}']) > 0 for rows in rows_by_seed.values())]
    for seed, rows in sorted(rows_by_seed.items()):
        rs = [r for r in rows if float(r['year']) >= a.skip_years]
        last = rows[-1]
        alive = all(float(last[f'pop_{k}']) > 0 for k in started)
        col = lambda k: [float(r[k]) for r in rs]
        b, w, p = col('pop_bison'), col('pop_wolf'), col('pop_pronghorn')
        droughts = sum(1 for x, y in zip(rows, rows[1:]) if float(y.get('drought', 0) or 0) > 0 and float(x.get('drought', 0) or 0) == 0)
        stats[seed] = dict(alive=alive, bmin=min(b), bmax=max(b), bmean=st.mean(b), bcv=st.pstdev(b) / (st.mean(b) or 1),
                           wmin=min(w), wmax=max(w), pmin=min(p), pmax=max(p), pmean=st.mean(p), droughts=droughts)
    print('seed alive  bison min/mean/max (cv)   wolves min/max  pronghorn min/mean/max  droughts')
    for s, v in stats.items():
        print(f"{s:4} {'yes ' if v['alive'] else 'NO  '}  {v['bmin']:5.0f}/{v['bmean']:5.0f}/{v['bmax']:5.0f} ({v['bcv']:.2f})   {v['wmin']:4.0f}/{v['wmax']:4.0f}   {v['pmin']:5.0f}/{v['pmean']:5.0f}/{v['pmax']:5.0f}   {v['droughts']}")
    ok = {s: v for s, v in stats.items() if v['alive']}
    pick = lambda key, rev=False: sorted(ok, key=lambda s: ok[s][key], reverse=rev)[:3]
    print('\ncandidates (surviving worlds only, best three each):')
    print("  knife's edge (lowest bison):", pick('bmin'))
    print('  thunder herd (highest bison):', pick('bmax', True))
    print('  golden plenty (richest, bison + pronghorn mean):', sorted(ok, key=lambda s: -(ok[s]['bmean'] + ok[s]['pmean']))[:3])
    print('  the dry years (most droughts):', pick('droughts', True))
    print('  wolf winter (fewest wolves):', pick('wmin'))
    print("  pronghorn's last stand (lowest pronghorn):", pick('pmin'))
    print('  steady valley (calmest bison):', pick('bcv'))


if __name__ == '__main__':
    main()
