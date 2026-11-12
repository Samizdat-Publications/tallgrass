import csv, sys, statistics as st
from pathlib import Path
def load(p, ymax):
    with open(p, newline='') as f:
        r = csv.reader(f); h = next(r); idx = {}
        for i, k in enumerate(h): idx.setdefault(k, i)
        rows = [x for x in r if x]
    out = []
    for x in rows:
        y = float(x[idx['year']])
        if 60 <= y <= ymax: out.append({k: (float(x[idx[k]]) if x[idx[k]] not in ('', 'nan') else float('nan')) for k in idx})
    return out
keys = ['pop_bison','pop_wolf','pop_pronghorn','pop_muledeer','pop_coyote','pop_prairiedog','pop_cougar','pop_raven','near_bison','ring_bison','nn_graze_bison','thirst_bison']
def summ(folder, seeds, ymax):
    per = {k: [] for k in keys}; mins = {k: [] for k in keys}
    for s in seeds:
        rows = load(Path(folder)/f'seed_{s}.csv', ymax)
        for k in keys:
            v = [r[k] for r in rows if k in r and r[k] == r[k]]
            if v: per[k].append(st.mean(v)); mins[k].append(min(v))
    return per, mins
A, Am = summ('review/stability/v10b-1f3f658/baseline', range(1, 17), 400)
B, Bm = summ(sys.argv[1], range(1, 17), 400)
print(f"{'':16s} {'v10b':>9s} {'variant':>9s} {'diff':>7s}   (mean of per-seed means, years 60-400, 16 seeds; min = mean of per-seed minima)")
for k in keys:
    a, b = st.mean(A[k]) if A[k] else float('nan'), st.mean(B[k]) if B[k] else float('nan')
    print(f"{k:16s} {a:9.2f} {b:9.2f} {100*(b-a)/a if a else 0:+6.1f}%   min {st.mean(Am[k]) if Am[k] else 0:7.1f} {st.mean(Bm[k]) if Bm[k] else 0:7.1f}")
