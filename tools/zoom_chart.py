"""100-year zoom of a batch stability run (round 32 item 5: the 1,200-year overview hides the cycles inside its bands).

One lane per species, three seeds overlaid, real counts (each lane's axis starts at zero), one sample per batch row.
Usage:
  .venv/Scripts/python tools/zoom_chart.py review/stability/v10b-1f3f658/baseline --from 600 --years 100 --seeds 1,7,13
Writes <folder>/../zoom_<from>_<to>.png.
"""
import argparse
import csv
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

LANES = [
    ("pop_bison", "Bison", "#7a4a2a"),
    ("pop_wolf", "Wolf", "#56606e"),
    ("pop_pronghorn", "Pronghorn", "#c98a3a"),
    ("pop_muledeer", "Mule deer", "#8a6a4a"),
    ("pop_coyote", "Coyote", "#b0894f"),
    ("pop_rabbit", "Jackrabbit", "#9a8f7a"),
    ("pop_raven", "Raven", "#2a2a33"),
]
SEED_ALPHA = [1.0, 0.55, 0.3]


def load(path: Path):
    with path.open(newline="") as f:
        r = csv.reader(f)
        head = next(r)
        idx: dict[str, int] = {}
        for i, k in enumerate(head):  # (the first of a repeated column wins: the batch writes 'tick' twice)
            idx.setdefault(k, i)
        rows = [row for row in r if row]
    year = [float(row[idx["year"]]) for row in rows]
    cols = {k: [float(row[idx[k]]) if row[idx[k]] not in ("", "nan") else float("nan") for row in rows] for k, _, _ in LANES if k in idx}
    return year, cols


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--from", dest="y0", type=float, default=600)
    ap.add_argument("--years", type=float, default=100)
    ap.add_argument("--seeds", default="1,7,13")
    a = ap.parse_args()
    folder = Path(a.folder)
    y1 = a.y0 + a.years
    seeds = [s.strip() for s in a.seeds.split(",") if s.strip()][:3]
    data = []
    for s in seeds:
        p = folder / f"seed_{s}.csv"
        if p.exists():
            data.append((s, *load(p)))
    if not data:
        print("no seed files found")
        return 1
    fig, axes = plt.subplots(len(LANES), 1, figsize=(11, 1.35 * len(LANES) + 1), sharex=True)
    for ax, (key, name, col) in zip(axes, LANES):
        top = 0.0
        for j, (s, year, cols) in enumerate(data):
            if key not in cols:
                continue
            xs = [y for y in year if a.y0 <= y <= y1]
            vs = [v for y, v in zip(year, cols[key]) if a.y0 <= y <= y1]
            ax.plot(xs, vs, color=col, alpha=SEED_ALPHA[j], lw=1.6 if j == 0 else 1.1, label=f"seed {s}")
            top = max([top] + [v for v in vs if v == v])
        ax.set_ylim(0, top * 1.08 if top > 0 else 1)
        ax.set_ylabel(name, rotation=0, ha="right", va="center", fontsize=9)
        ax.spines[["top", "right"]].set_visible(False)
        ax.tick_params(labelsize=8)
        ax.grid(axis="x", color="#ddd", lw=0.6)
    axes[0].legend(loc="upper right", fontsize=8, frameon=False, ncol=3)
    axes[-1].set_xlabel("valley year", fontsize=9)
    fig.suptitle(f"A 100-year window, years {a.y0:.0f} to {y1:.0f}: real counts, every axis from zero ({folder.parent.name})", fontsize=11, x=0.02, ha="left")
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    out = folder.parent / f"zoom_{a.y0:.0f}_{y1:.0f}.png"
    fig.savefig(out, dpi=110)
    print("saved", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
