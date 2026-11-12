"""Chart the trophic cascade: Yellowstone return vs Island of plenty (same seeds)."""
import csv, glob, sys, pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

d = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "review/stability/cascade")
def load(p):
    r = list(csv.DictReader(open(p)))
    return {k: [float(x[k]) for x in r] for k in r[0]}
fig, axes = plt.subplots(1, 3, figsize=(15, 4.6), dpi=150)
plt.rcParams.update({"font.size": 10})
colors = {"yellowstone": "#3d6fb6", "island": "#c9752e"}
labels = {"yellowstone": "Yellowstone return: 12 wolves arrive in year 3", "island": "Island of plenty: no predators"}
for sc in ("island", "yellowstone"):
    files = sorted(d.glob(f"{sc}_seed*.csv"))
    for i, f in enumerate(files):
        s = load(f)
        kw = dict(color=colors[sc], alpha=0.85 if i == 0 else 0.45, lw=1.6 if i == 0 else 1.0, label=labels[sc] if i == 0 else None)
        axes[0].plot(s["year"], s["bison"], **kw)
        axes[1].plot(s["year"], s["wolf"], **kw)
        # smooth grass over a year to remove the seasonal wiggle
        g = s["grass"]; w = 10
        gs = [sum(g[max(0, j - w):j + 1]) / len(g[max(0, j - w):j + 1]) for j in range(len(g))]
        axes[2].plot(s["year"], gs, **kw)
for ax, t, yl in zip(axes, ["Bison", "Wolves", "Grass (mean biomass, 1-year smoothing)"], ["animals alive", "animals alive", "biomass 0 to 1"]):
    ax.set_title(t, loc="left", fontweight="bold")
    ax.set_xlabel("years (1 year = 2400 ticks)")
    ax.set_ylabel(yl)
    ax.axvline(3, color="#888", ls="--", lw=1)
    ax.grid(alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)
axes[0].legend(loc="upper left", frameon=False, fontsize=8.5)
fig.suptitle("Trophic cascade: bringing wolves back holds the herd down and lets the grass recover (3 seeds each)", x=0.01, ha="left", fontsize=12, fontweight="bold")
fig.tight_layout(rect=(0, 0, 1, 0.94))
fig.savefig(d / "trophic_cascade.png")
print("saved", d / "trophic_cascade.png")
