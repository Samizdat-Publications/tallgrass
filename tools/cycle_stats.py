"""Cycle length and recovery time of a batch run, in valley years (from the CSV 'year' column).

    .venv/Scripts/python tools/cycle_stats.py <batch-out-dir> [<batch-out-dir> ...] [--burn 0.2]

For each surviving seed, after the burn-in fraction of the run:
  half-cycle    years between successive crossings of the seed's own mean (annual means)
  recovery      years from a trough below 60% of the mean back to 90% of it
  wolf lag      years by which wolves best track bison (cross-correlation of annual means, 0 to 6 years)
Medians across seeds. Persistence counts are over all seeds.
"""
import argparse
import csv
import glob
import os
import statistics as st

import numpy as np

SPECIES = ("bison", "wolf", "pronghorn")


def annual(rows, key):
    by = {}
    for r in rows:
        y = int(float(r["year"]))
        by.setdefault(y, []).append(float(r[key]))
    ys = sorted(by)
    return np.array(ys), np.array([sum(by[y]) / len(by[y]) for y in ys])


def half_cycle(a):
    m = a.mean()
    s = np.sign(a - m)
    s = s[s != 0]
    cross = np.count_nonzero(s[1:] != s[:-1])
    return len(a) / cross if cross else float("nan")


def recoveries(a):
    m = a.mean()
    out, k = [], 0
    while k < len(a):
        if a[k] < 0.6 * m:
            j = k
            while j < len(a) and a[j] < 0.9 * m:
                j += 1
            if j < len(a):
                out.append(j - k)
            k = j + 1
        else:
            k += 1
    return out


def lag(b, w, max_lag=6):
    best, bl = -2.0, 0
    for L in range(0, max_lag + 1):
        x, y = b[: len(b) - L], w[L:]
        if len(x) < 8 or x.std() == 0 or y.std() == 0:
            continue
        c = float(np.corrcoef(x, y)[0, 1])
        if c > best:
            best, bl = c, L
    return bl, best


def report(d, burn):
    files = sorted(glob.glob(os.path.join(d, "baseline", "seed_*.csv")) or glob.glob(os.path.join(d, "seed_*.csv")))
    alive = {k: 0 for k in SPECIES}
    hc = {k: [] for k in SPECIES}
    rec = {k: [] for k in SPECIES}
    lags, cors, yrs = [], [], []
    for f in files:
        rows = list(csv.DictReader(open(f)))
        last = rows[-1]
        for k in SPECIES:
            alive[k] += float(last[f"pop_{k}"]) > 0
        if any(float(last[f"pop_{k}"]) == 0 for k in SPECIES):
            continue
        t_end = float(rows[-1]["tick"])
        rows = [r for r in rows if float(r["tick"]) >= burn * t_end]
        yrs.append(float(rows[-1]["year"]) - float(rows[0]["year"]))
        series = {}
        for k in SPECIES:
            _, a = annual(rows, f"pop_{k}")
            series[k] = a
            hc[k].append(half_cycle(a))
            rec[k].extend(recoveries(a))
        L, c = lag(series["bison"], series["wolf"])
        lags.append(L)
        cors.append(c)
    n = len(files)
    med = lambda v: st.median(v) if v else float("nan")
    print(f"== {d}: {n} seeds, stats over the last {1 - burn:.0%} of each run (about {med(yrs):.0f} years)")
    print("  persisted " + ", ".join(f"{k} {alive[k]}/{n}" for k in SPECIES))
    print("  half-cycle (years) " + ", ".join(f"{k} {med(hc[k]):.1f}" for k in SPECIES))
    print("  recovery from <60% to 90% of mean (years) " + ", ".join(f"{k} {med(rec[k]):.1f} (n={len(rec[k])})" for k in SPECIES))
    print(f"  wolves follow bison by {med(lags):.0f} years (median corr {med(cors):.2f})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("--burn", type=float, default=0.2)
    a = ap.parse_args()
    for d in a.dirs:
        report(d, a.burn)


if __name__ == "__main__":
    main()
