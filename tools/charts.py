"""Charts for a headless batch stability run (output of src/headless/batch.ts).

    .venv/Scripts/python tools/charts.py review/stability/<name> [--log]

<name> is either the run folder (with one sub-folder per scenario) or a single scenario folder.
Each scenario folder gets, at 150 dpi:
    seeds_grid.png          (a) small multiples, one panel per seed, every species + grass
    species_overlay.png     (b) per species: all seeds, median line, interquartile band, shock + prior range
    phase_bison_wolf.png    (c) bison vs wolf phase portrait for 4 seeds (one-year smoothed)
    traits.png              (d) trait_* means over time (median across seeds, interquartile band)
    stability_overview.png  (f) one page a human can read at a glance
and the run folder gets a combined stability_overview.png (scenarios x species).
With --log the population charts use a symmetric-log axis and the files get a _log suffix.
Time is shown in years (1 year = 2400 ticks unless meta.json records another yearTicks); big charts add a ticks axis on top.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import warnings
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Patch  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

YEAR = 2400.0
SPECIES = ["bison", "wolf", "raven", "pronghorn", "rabbit", "cougar"]
LABEL = {"bison": "Bison", "wolf": "Wolf", "raven": "Raven", "pronghorn": "Pronghorn", "rabbit": "Rabbit", "cougar": "Cougar"}
COLOR = {
    "bison": "#4a2f1e",      # dark brown
    "wolf": "#5b7083",       # slate blue-grey
    "raven": "#161616",      # black
    "pronghorn": "#e0872c",  # tan-orange
    "rabbit": "#9a8878",     # grey-brown
    "cougar": "#c79a1a",     # ochre
}
GRASS = "#6fae5a"
SHOCK = "#b5422b"
PRIOR = "#5d86b0"
BG = "#fbfaf7"
INK = "#2b2b2b"
MUTED = "#6b6b6b"
GRID = "#e4e1da"
PASS_BG = "#d4ebd0"
FAIL_BG = "#f4cdc6"
NA_BG = "#ececec"

plt.rcParams.update(
    {
        "figure.facecolor": BG,
        "savefig.facecolor": BG,
        "axes.facecolor": "#ffffff",
        "axes.edgecolor": "#b9b5ab",
        "axes.labelcolor": INK,
        "axes.titleweight": "bold",
        "axes.titlesize": 11,
        "axes.labelsize": 9.5,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linewidth": 0.7,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "xtick.labelsize": 8.5,
        "ytick.labelsize": 8.5,
        "text.color": INK,
        "font.family": ["Segoe UI", "DejaVu Sans"],
        "legend.frameon": False,
        "legend.fontsize": 9,
        "figure.dpi": 100,
        "savefig.dpi": 150,
    }
)

THOUSANDS = FuncFormatter(lambda v, _: f"{v:,.0f}")
KTICKS = FuncFormatter(lambda v, _: f"{v / 1000:,.0f}k" if abs(v) >= 1000 else f"{v:,.0f}")


# ------------------------------------------------------------------------------------------------------------
# loading
# ------------------------------------------------------------------------------------------------------------


class Scenario:
    def __init__(self, name: str, folder: Path):
        self.name = name
        self.folder = folder
        self.summary: dict = {}
        sp = folder / "summary.json"
        if sp.exists():
            self.summary = json.loads(sp.read_text(encoding="utf8"))
        self.seeds: list[int] = []
        self.ticks: dict[int, np.ndarray] = {}
        self.cols: dict[int, dict[str, np.ndarray]] = {}
        files = sorted(folder.glob("seed_*.csv"), key=lambda p: int(re.findall(r"\d+", p.stem)[0]))
        for f in files:
            seed = int(re.findall(r"\d+", f.stem)[0])
            arr = np.genfromtxt(f, delimiter=",", names=True)
            arr = np.atleast_1d(arr)
            names = list(arr.dtype.names or [])
            self.seeds.append(seed)
            self.ticks[seed] = np.asarray(arr["tick"], dtype=float)
            self.cols[seed] = {n: np.asarray(arr[n], dtype=float) for n in names if n != "tick"}
        self.seed_info = {s["seed"]: s for s in self.summary.get("seeds", [])}
        self.species = [k for k in SPECIES if any(f"pop_{k}" in c and c[f"pop_{k}"][0] > 0 for c in self.cols.values())]
        cols0 = next(iter(self.cols.values()), {})
        self.trait_cols = [c for c in cols0 if c.startswith("trait_")]

    @property
    def n(self) -> int:
        return len(self.seeds)

    @property
    def title_extra(self) -> str:
        bits = [f"{self.n} seeds"]
        if self.seeds:
            ends = [self.ticks[s][-1] for s in self.seeds]
            span, short = max(ends), min(ends)
            if span - short > YEAR * 5:
                # generation-target runs stop when each world reaches its target, so they end at different years
                bits.append(f"each world runs until its bison pass the generation target: {short / YEAR:,.0f} to {span / YEAR:,.0f} years")
            else:
                bits.append(f"{span / YEAR:,.0f} years ({span:,.0f} ticks)")
        return ", ".join(bits)

    # ---- aligned matrices ----
    def grid_ticks(self) -> np.ndarray:
        longest = max(self.seeds, key=lambda s: len(self.ticks[s]))
        return self.ticks[longest]

    def matrix(self, col: str) -> np.ndarray:
        """seeds x time, padded with NaN (or 0 for populations after total extinction)."""
        t = self.grid_ticks()
        m = np.full((self.n, len(t)), np.nan)
        for i, s in enumerate(self.seeds):
            v = self.cols[s].get(col)
            if v is None:
                continue
            m[i, : len(v)] = v
            if col.startswith("pop_") and self.seed_info.get(s, {}).get("endReason") == "all_extinct":
                m[i, len(v):] = 0.0
        return m

    def events(self) -> list[tuple[str, float]]:
        """(label, median tick across seeds) for each shock that fired."""
        defs = self.summary.get("events", [])
        out = []
        for i, d in enumerate(defs):
            ticks = [
                info["events"][i]["tick"]
                for info in self.seed_info.values()
                if len(info.get("events", [])) > i and info["events"][i].get("applied") and info["events"][i].get("tick") is not None
            ]
            if ticks:
                out.append((d["label"], float(np.median(ticks))))
        return out

    def prior_band(self, key: str) -> tuple[float, float] | None:
        lo, hi = [], []
        for info in self.seed_info.values():
            sm = (info.get("metrics") or {}).get("species", {}).get(key)
            pr = sm.get("prior") if sm else None
            if pr:
                lo.append(pr["lo"])
                hi.append(pr["hi"])
        if not lo:
            return None
        return float(np.median(lo)), float(np.median(hi))

    def persisted(self, key: str) -> tuple[int, int]:
        started = ok = 0
        for s in self.seeds:
            v = self.cols[s].get(f"pop_{key}")
            if v is None or v[0] <= 0:
                continue
            started += 1
            ok += 1 if v[-1] > 0 else 0
        return ok, started

    def extinct_species(self, seed: int) -> list[str]:
        out = []
        for k in self.species:
            v = self.cols[seed].get(f"pop_{k}")
            if v is not None and v[0] > 0 and v[-1] == 0:
                out.append(k)
        return out


def find_scenarios(root: Path) -> list[Scenario]:
    if list(root.glob("seed_*.csv")):
        return [Scenario(root.name, root)]
    out = []
    for sub in sorted(p for p in root.iterdir() if p.is_dir()):
        if list(sub.glob("seed_*.csv")):
            out.append(Scenario(sub.name, sub))
    order = ["baseline", "cull70", "drought", "wolfwipe"]
    out.sort(key=lambda s: (order.index(s.name) if s.name in order else 99, s.name))
    return out


def load_meta(root: Path) -> dict:
    for p in (root / "meta.json", root.parent / "meta.json"):
        if p.exists():
            return json.loads(p.read_text(encoding="utf8"))
    return {}


# ------------------------------------------------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------------------------------------------------


def stats(m: np.ndarray):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        return (
            np.nanmedian(m, axis=0),
            np.nanpercentile(m, 25, axis=0),
            np.nanpercentile(m, 75, axis=0),
        )


def pop_scale(ax, log: bool):
    if log:
        ax.set_yscale("symlog", linthresh=1, linscale=0.6)
        ax.set_ylim(bottom=0)
    else:
        ax.set_ylim(bottom=0)
    ax.yaxis.set_major_formatter(THOUSANDS)


def add_ticks_axis(ax, label=True):
    sec = ax.secondary_xaxis("top", functions=(lambda y: y * YEAR, lambda t: t / YEAR))
    sec.xaxis.set_major_formatter(KTICKS)
    sec.tick_params(labelsize=8, colors=MUTED)
    sec.spines["top"].set_color("#b9b5ab")
    if label:
        sec.set_xlabel("ticks", fontsize=8.5, color=MUTED, labelpad=2)
    return sec


def xlabel_years(ax):
    ax.set_xlabel(f"time (years; 1 year = {YEAR:,.0f} ticks)")


def label_bottom_axes(axes):
    """Put the time label and tick labels on the lowest visible panel of every column (sharex hides them otherwise)."""
    nrows = len(axes)
    ncols = len(axes[0])
    for c in range(ncols):
        for r in range(nrows):
            ax = axes[r][c]
            if ax.get_visible() and (r == nrows - 1 or not axes[r + 1][c].get_visible()):
                xlabel_years(ax)
                ax.tick_params(labelbottom=True)


def draw_events(ax, sc: Scenario, label_y: float = 0.98, text=True):
    for lab, tick in sc.events():
        ax.axvline(tick / YEAR, color=SHOCK, ls="--", lw=1.2, alpha=0.9, zorder=2)
        if text:
            ax.text(tick / YEAR, label_y, " " + lab, transform=ax.get_xaxis_transform(), color=SHOCK, fontsize=8, va="top", ha="left", rotation=0, clip_on=True)


def draw_prior(ax, sc: Scenario, key: str, xmax: float):
    pb = sc.prior_band(key)
    if pb:
        ax.axhspan(pb[0], pb[1], color=PRIOR, alpha=0.13, lw=0, zorder=0)
    return pb


def save(fig, path: Path, saved: list[Path]):
    fig.savefig(path, dpi=150)
    plt.close(fig)
    saved.append(path)


def suffix(log: bool) -> str:
    return "_log" if log else ""


def smooth_year(v: np.ndarray, spacing: float, min_w: int = 1) -> np.ndarray:
    w = max(min_w, int(round(YEAR / spacing)))
    if w <= 1 or len(v) < w:
        return v
    k = np.ones(w) / w
    pad = np.pad(v, (w // 2, w - 1 - w // 2), mode="edge")
    return np.convolve(pad, k, mode="valid")


def legend_handles(sc: Scenario, grass=False, shock=False, prior=False):
    h = [Line2D([0], [0], color=COLOR[k], lw=2.2, label=LABEL[k]) for k in sc.species]
    if grass:
        h.append(Line2D([0], [0], color=GRASS, lw=2, alpha=0.6, label="grass cover, 1-year mean (0 to 1 scaled to panel height)"))
    if shock and sc.events():
        h.append(Line2D([0], [0], color=SHOCK, lw=1.4, ls="--", label="shock"))
    if prior and sc.events():
        h.append(Patch(facecolor=PRIOR, alpha=0.25, label="prior range (10th-90th pct before shock)"))
    return h


def header(fig, title: str, subtitle: str, handles=None, ncol=None) -> float:
    """Title, subtitle and an optional legend row at the top of the figure. Returns the top of the plotting area
    (figure fraction) for tight_layout(rect=(0, 0, 1, top))."""
    h = fig.get_figheight()
    fig.text(0.01, 1 - 0.12 / h, title, fontsize=14, fontweight="bold", ha="left", va="top")
    fig.text(0.01, 1 - 0.50 / h, subtitle, fontsize=9.5, color=MUTED, ha="left", va="top")
    top_in = 0.9
    if handles:
        fig.legend(handles=handles, loc="upper left", ncol=ncol or len(handles), bbox_to_anchor=(0.005, 1 - 0.80 / h), fontsize=9)
        top_in = 1.35
    return 1 - top_in / h


# ------------------------------------------------------------------------------------------------------------
# (a) small multiples
# ------------------------------------------------------------------------------------------------------------


def chart_seeds_grid(sc: Scenario, log: bool, saved: list[Path]):
    n = sc.n
    ncols = min(5, max(2, int(np.ceil(np.sqrt(n * 1.6)))))
    nrows = int(np.ceil(n / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(3.4 * ncols + 0.8, 2.35 * nrows + 1.3), sharex=True, sharey=True, squeeze=False)
    xmax = max(sc.ticks[s][-1] for s in sc.seeds) / YEAR
    for idx, s in enumerate(sc.seeds):
        ax = axes[idx // ncols][idx % ncols]
        t = sc.ticks[s] / YEAR
        spy = float(np.median(np.diff(sc.ticks[s]))) if len(t) > 1 else 500.0
        for k in sc.species:
            raw = sc.cols[s][f"pop_{k}"]
            # faint raw samples (the seasonal birth pulse and winter losses) under a bold 1-year mean (the real cycle)
            ax.plot(t, raw, color=COLOR[k], lw=0.6, alpha=0.28, zorder=2)
            ax.plot(t, smooth_year(raw, spy, 3), color=COLOR[k], lw=1.3, zorder=3)
        pop_scale(ax, log)
        ax.set_xlim(0, xmax)
        gcol = sc.cols[s].get("grass_mean")
        if gcol is not None:
            g = ax.twinx()
            sp = float(np.median(np.diff(sc.ticks[s]))) if len(t) > 1 else 500.0
            g.plot(t, smooth_year(gcol, sp), color=GRASS, lw=1.0, alpha=0.55, zorder=1)
            g.set_ylim(0, 1.05)
            g.grid(False)
            g.spines["right"].set_visible(False)
            g.spines["top"].set_visible(False)
            g.tick_params(length=0, labelright=False)
        draw_events(ax, sc, text=False)
        ext = sc.extinct_species(s)
        title = f"seed {s}"
        ax.set_title(title, fontsize=10, loc="left")
        if ext:
            ax.text(0.98, 0.95, "extinct: " + ", ".join(ext), transform=ax.transAxes, ha="right", va="top", fontsize=8.5, color=SHOCK, fontweight="bold")
    for idx in range(n, nrows * ncols):
        axes[idx // ncols][idx % ncols].set_visible(False)
    for r in range(nrows):
        axes[r][0].set_ylabel("animals alive")
    label_bottom_axes(axes)
    top = header(
        fig,
        f"{sc.name}: population of every species over time, one panel per seed",
        f"{sc.summary.get('description', '')}  ({sc.title_extra})  Bold = running mean over max(1 year, 3 samples), faint = raw samples.{'  [log scale]' if log else ''}",
        legend_handles(sc, grass=True, shock=True),
    )
    fig.tight_layout(rect=(0, 0, 1, top))
    save(fig, sc.folder / f"seeds_grid{suffix(log)}.png", saved)


# ------------------------------------------------------------------------------------------------------------
# (b) per-species overlay
# ------------------------------------------------------------------------------------------------------------


def draw_overlay(ax, sc: Scenario, key: str, t: np.ndarray, m: np.ndarray, log: bool, lw_med=2.0, seed_alpha=0.22):
    col = COLOR[key]
    draw_prior(ax, sc, key, t[-1])
    for row in m:
        ax.plot(t, row, color=col, lw=0.6, alpha=seed_alpha, zorder=2)
    med, q1, q3 = stats(m)
    ax.fill_between(t, q1, q3, color=col, alpha=0.22, lw=0, zorder=3)
    ax.plot(t, med, color=col, lw=lw_med, zorder=4)
    pop_scale(ax, log)
    ax.set_xlim(0, t[-1])


def chart_cycles(sc: Scenario, saved: list[Path]):
    """A closer look: 60 years in four worlds, annual means, each species relative to its own average there.
    On a 700-year axis a 5-year cycle is texture; here the booms, crashes and any predator lag are readable."""
    if sc.n == 0:
        return
    seeds = [s for s in sc.seeds if all(sc.cols[s][f"pop_{k}"][-1] > 0 for k in sc.species)][:4] or sc.seeds[:4]
    # the window comes from the worlds shown, so one early collapse elsewhere doesn't pull it back to the opening years
    span = min(sc.ticks[s][-1] for s in seeds) / YEAR
    w0 = 100.0 if span > 180 else max(5.0, span * 0.25)
    w1 = min(span, w0 + 60)
    if w1 - w0 < 15:
        return
    fig, axes = plt.subplots(len(seeds), 1, figsize=(13, 2.5 * len(seeds) + 1.4), sharex=True, squeeze=False)
    for ax, s in zip(axes[:, 0], seeds):
        t = sc.ticks[s] / YEAR
        yrs = np.arange(int(w0), int(w1))
        for k in sc.species:
            v = sc.cols[s][f"pop_{k}"]
            # years with no sample (runs sampled more sparsely than once a year) are interpolated from their neighbours
            ann = np.array([v[(t >= y) & (t < y + 1)].mean() if np.any((t >= y) & (t < y + 1)) else float(np.interp(y + 0.5, t, v)) for y in yrs])
            m = np.nanmean(ann)
            if not np.isfinite(m) or m <= 0:
                continue
            ax.plot(yrs + 0.5, 100 * ann / m, color=COLOR[k], lw=2.0 if k != "raven" else 1.2, label=k, zorder=3)
        ax.axhline(100, color=MUTED, lw=0.8, ls=":")
        ax.set_ylabel("% of own average")
        ax.set_title(f"seed {s}", fontsize=10, loc="left")
        ax.set_xlim(w0, w1)
    axes[-1][0].set_xlabel("time (years; annual means)")
    top = header(
        fig,
        f"{sc.name}: a closer look, {w1 - w0:.0f} years in {len(seeds)} worlds",
        "Each line is one species' annual mean relative to its own average over this window, so booms, crashes and lags line up.",
        legend_handles(sc, grass=False, shock=False),
    )
    fig.tight_layout(rect=(0, 0, 1, top))
    save(fig, sc.folder / "cycles.png", saved)


def chart_species_overlay(sc: Scenario, log: bool, saved: list[Path]):
    keys = sc.species
    t = sc.grid_ticks() / YEAR
    ncols = 2 if len(keys) > 1 else 1
    nrows = int(np.ceil(len(keys) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(7.4 * ncols, 3.3 * nrows + 1.3), sharex=True, squeeze=False)
    for i, k in enumerate(keys):
        ax = axes[i // ncols][i % ncols]
        m = sc.matrix(f"pop_{k}")
        draw_overlay(ax, sc, k, t, m, log)
        draw_events(ax, sc)
        ok, started = sc.persisted(k)
        ax.set_title(f"{LABEL[k]}: persisted in {ok} of {started} seeds", loc="left", color=COLOR[k] if k != "raven" else INK)
        ax.set_ylabel("animals alive")
    for j in range(len(keys), nrows * ncols):
        axes[j // ncols][j % ncols].set_visible(False)
    label_bottom_axes(axes)
    handles = [
        Line2D([0], [0], color=INK, lw=0.7, alpha=0.4, label="each seed"),
        Line2D([0], [0], color=INK, lw=2.2, label="median"),
        Patch(facecolor=INK, alpha=0.22, label="interquartile band (25th-75th pct)"),
    ]
    if sc.events():
        handles += [Line2D([0], [0], color=SHOCK, ls="--", lw=1.4, label="shock"), Patch(facecolor=PRIOR, alpha=0.25, label="prior range (10th-90th pct, median of seeds)")]
    top = header(
        fig,
        f"{sc.name}: every seed overlaid per species, with median and interquartile band",
        f"{sc.title_extra}{'  [log scale]' if log else ''}",
        handles,
    )
    fig.tight_layout(rect=(0, 0, 1, top))
    save(fig, sc.folder / f"species_overlay{suffix(log)}.png", saved)


# ------------------------------------------------------------------------------------------------------------
# (c) phase portrait
# ------------------------------------------------------------------------------------------------------------


def chart_phase(sc: Scenario, log: bool, saved: list[Path]):
    if "bison" not in sc.species or "wolf" not in sc.species:
        return
    pick_idx = sorted(set(np.round(np.linspace(0, sc.n - 1, min(4, sc.n))).astype(int).tolist()))
    picks = [sc.seeds[i] for i in pick_idx]
    ncols = 2 if len(picks) > 1 else 1
    nrows = int(np.ceil(len(picks) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(6.2 * ncols + 0.6, 5.2 * nrows + 1.3), squeeze=False)
    cmap = matplotlib.colormaps["viridis"]
    xmax = max(sc.ticks[s][-1] for s in picks) / YEAR
    norm = plt.Normalize(0, xmax)
    allb = np.concatenate([smooth_year(sc.cols[s]["pop_bison"], 500) for s in picks])
    allw = np.concatenate([smooth_year(sc.cols[s]["pop_wolf"], 500) for s in picks])
    for i, s in enumerate(picks):
        ax = axes[i // ncols][i % ncols]
        tick = sc.ticks[s]
        spacing = float(np.median(np.diff(tick))) if len(tick) > 1 else 500.0
        b = smooth_year(sc.cols[s]["pop_bison"], spacing)
        w = smooth_year(sc.cols[s]["pop_wolf"], spacing)
        pts = np.column_stack([b, w])
        segs = np.stack([pts[:-1], pts[1:]], axis=1)
        lc = LineCollection(segs, cmap=cmap, norm=norm, linewidths=1.5)
        lc.set_array((tick[:-1] + tick[1:]) / 2 / YEAR)
        ax.add_collection(lc)
        ax.plot(b[0], w[0], "o", color="white", mec=INK, ms=8, zorder=5)
        ax.plot(b[-1], w[-1], "s", color=INK, ms=7, zorder=5)
        for lab, et in sc.events():
            j = int(np.argmin(np.abs(tick - et)))
            ax.plot(b[j], w[j], "X", color=SHOCK, ms=10, mec="white", zorder=6)
        ax.set_title(f"seed {s}", loc="left")
        ax.set_xlabel("bison alive")
        ax.set_ylabel("wolves alive")
        if log:
            ax.set_xscale("symlog", linthresh=1)
            ax.set_yscale("symlog", linthresh=1)
        ax.set_xlim(0 if not log else 0, float(allb.max()) * 1.06)
        ax.set_ylim(0 if not log else 0, max(float(allw.max()) * 1.1, 1))
        ax.xaxis.set_major_formatter(THOUSANDS)
        ax.yaxis.set_major_formatter(THOUSANDS)
    for j in range(len(picks), nrows * ncols):
        axes[j // ncols][j % ncols].set_visible(False)
    handles = [
        Line2D([0], [0], marker="o", color="none", mfc="white", mec=INK, ms=8, label="start"),
        Line2D([0], [0], marker="s", color="none", mfc=INK, mec=INK, ms=7, label="end"),
    ]
    if sc.events():
        handles.append(Line2D([0], [0], marker="X", color="none", mfc=SHOCK, mec="white", ms=10, label="shock"))
    top = header(
        fig,
        f"{sc.name}: bison vs wolf phase portrait",
        f"each loop is a predator-prey cycle; colour = time; both series smoothed over one year{'  [log scale]' if log else ''}",
        handles,
    )
    fig.tight_layout(rect=(0, 0, 0.93, top))
    cax = fig.add_axes((0.945, 0.12, 0.014, top - 0.17))
    sm = plt.cm.ScalarMappable(norm=norm, cmap=cmap)
    cb = fig.colorbar(sm, cax=cax)
    cb.set_label("time (years)")
    save(fig, sc.folder / f"phase_bison_wolf{suffix(log)}.png", saved)


# ------------------------------------------------------------------------------------------------------------
# (d) traits
# ------------------------------------------------------------------------------------------------------------


def chart_traits(sc: Scenario, saved: list[Path]):
    cols = []
    for c in sc.trait_cols:
        m = sc.matrix(c)
        if np.isfinite(m).any() and np.nanmax(np.abs(m)) > 0:
            cols.append(c)
    if not cols:
        return
    note = ""
    if len(cols) > 24:
        note = f"  (first 24 of {len(cols)} traits shown)"
        cols = cols[:24]
    t = sc.grid_ticks() / YEAR
    ncols = 3 if len(cols) > 4 else min(2, len(cols))
    nrows = int(np.ceil(len(cols) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(5.1 * ncols + 0.4, 2.9 * nrows + 1.0), sharex=True, squeeze=False)
    for i, c in enumerate(cols):
        ax = axes[i // ncols][i % ncols]
        sp = next((k for k in SPECIES if c.startswith(f"trait_{k}_")), None)
        col = COLOR.get(sp, INK)
        m = sc.matrix(c)
        for row in m:
            ax.plot(t, row, color=col, lw=0.5, alpha=0.18, zorder=2)
        med, q1, q3 = stats(m)
        # when only a few worlds are still running (generation-target runs end at different times) the median jumps:
        # end the median and band where fewer than 5 worlds (or a quarter of them) remain
        thin = np.sum(np.isfinite(m), axis=0) < max(5, 0.25 * m.shape[0])
        med, q1, q3 = (np.where(thin, np.nan, a) for a in (med, q1, q3))
        ax.fill_between(t, q1, q3, color=col, alpha=0.22, lw=0, zorder=3)
        ax.plot(t, med, color=col, lw=1.9, zorder=4)
        draw_events(ax, sc, text=False)
        nice = c.replace("trait_", "").replace("_", " ")
        ax.set_title(nice, loc="left", fontsize=10)
        ax.set_xlim(0, t[-1])
        ax.set_ylabel("population mean")
        ax.margins(y=0.12)
    for j in range(len(cols), nrows * ncols):
        axes[j // ncols][j % ncols].set_visible(False)
    label_bottom_axes(axes)
    top = header(
        fig,
        f"{sc.name}: how heritable traits drift over generations",
        f"mean trait value of living animals; bold line = median across seeds, band = 25th-75th percentile, faint lines = seeds{note}",
    )
    fig.tight_layout(rect=(0, 0, 1, top))
    save(fig, sc.folder / "traits.png", saved)


# ------------------------------------------------------------------------------------------------------------
# (f) overview
# ------------------------------------------------------------------------------------------------------------


def fmt_years(ticks):
    return "n/a" if ticks is None else f"{ticks / YEAR:.1f}"


def chart_overview(sc: Scenario, meta: dict, log: bool, saved: list[Path]):
    keys = sc.species
    agg = sc.summary.get("aggregate", {}).get("species", {})
    ver = sc.summary.get("verdict", {})
    t = sc.grid_ticks() / YEAR
    has_gen = any("gen_bison" in c for c in sc.cols.values())
    nrows = len(keys) + (1 if has_gen else 0)
    fig = plt.figure(figsize=(16, 2.15 * nrows + 2.3))
    gs = fig.add_gridspec(nrows, 2, width_ratios=[3.1, 1.5], hspace=0.38, wspace=0.12, left=0.06, right=0.985, top=0.855, bottom=0.07)
    left_axes = []
    for i, k in enumerate(keys):
        ax = fig.add_subplot(gs[i, 0], sharex=left_axes[0] if left_axes else None)
        left_axes.append(ax)
        m = sc.matrix(f"pop_{k}")
        draw_overlay(ax, sc, k, t, m, log, seed_alpha=0.18)
        draw_events(ax, sc, text=(i == 0))
        ax.set_ylabel(LABEL[k], fontsize=10.5, fontweight="bold", color=COLOR[k] if k != "raven" else INK)
        if i < nrows - 1:
            ax.tick_params(labelbottom=False)
    if has_gen:
        ax = fig.add_subplot(gs[len(keys), 0], sharex=left_axes[0])
        left_axes.append(ax)
        m = sc.matrix("gen_bison")
        for row in m:
            ax.plot(t, row, color=COLOR["bison"], lw=0.5, alpha=0.2)
        med, q1, q3 = stats(m)
        ax.fill_between(t, q1, q3, color=COLOR["bison"], alpha=0.2, lw=0)
        ax.plot(t, med, color=COLOR["bison"], lw=2)
        draw_events(ax, sc, text=False)
        ax.set_ylabel("Bison\ngeneration", fontsize=10, fontweight="bold", color=COLOR["bison"])
        ax.set_ylim(bottom=0)
        ax.yaxis.set_major_formatter(THOUSANDS)
    left_axes[0].set_xlim(0, t[-1])
    xlabel_years(left_axes[-1])
    add_ticks_axis(left_axes[0])

    # right column: persistence bars on top, verdict table below
    n_top = max(1, int(round(nrows * 0.42)))
    axp = fig.add_subplot(gs[:n_top, 1])
    pcts = [agg.get(k, {}).get("persistencePct", 100.0 * sc.persisted(k)[0] / max(1, sc.persisted(k)[1])) for k in keys]
    y = np.arange(len(keys))[::-1]
    axp.barh(y, pcts, color=[COLOR[k] for k in keys], height=0.5, zorder=3)
    axp.axvline(80, color=MUTED, ls=":", lw=1.2, zorder=4)
    axp.text(80, len(keys) - 0.45, " 80% target", color=MUTED, fontsize=8.5, va="bottom", ha="left")
    for yy, k, p in zip(y, keys, pcts):
        ok, started = sc.persisted(k)
        axp.text(min(p, 100) - 2 if p > 30 else p + 2, yy, f"{ok}/{started}", va="center", ha="right" if p > 30 else "left", color="white" if p > 30 else INK, fontsize=9.5, fontweight="bold", zorder=5)
    axp.set_yticks(y, [LABEL[k] for k in keys])
    axp.set_xlim(0, 100)
    axp.set_title("Persistence: % of seeds still alive at the end", loc="left")
    axp.grid(axis="y", visible=False)

    axt = fig.add_subplot(gs[n_top:, 1])
    axt.axis("off")
    axt.set_title("Stability metrics (median across seeds)", loc="left", pad=30)
    has_shock = bool(sc.events())
    head = ["species", "CV", "near-zero", "longest\nnear-zero", "peaks"]
    if has_shock:
        head += ["recovered", "recovery\n(yr)"]
    head += ["verdict"]
    rows, colors = [], []
    for k in keys:
        a = agg.get(k)
        v = ver.get(k, {})
        if not a:
            rows.append([LABEL[k]] + ["n/a"] * (len(head) - 1))
            colors.append([NA_BG] * len(head))
            continue
        r = [
            LABEL[k],
            "n/a" if a.get("medianCv") is None else f"{a['medianCv']:.2f}",
            "n/a" if a.get("medianNearZeroFrac") is None else f"{100 * a['medianNearZeroFrac']:.1f}%",
            f"{fmt_years(a.get('medianLongestNearZeroTicks'))} yr",
            "n/a" if a.get("medianPeaks") is None else f"{a['medianPeaks']:.0f}",
        ]
        cl = [
            "white",
            PASS_BG if v.get("notFlat") in (True, None) else FAIL_BG,
            PASS_BG if v.get("nearZero") in (True, None) else FAIL_BG,
            PASS_BG if v.get("longestStretch") in (True, None) else FAIL_BG,
            "white",
        ]
        if has_shock:
            rp = a.get("recoveredPct")
            r += ["n/a" if rp is None else f"{rp:.0f}%", fmt_years(a.get("medianRecoveryTicks"))]
            cl += [PASS_BG if v.get("recovered") in (True, None) else FAIL_BG, "white"]
        r += ["PASS" if v.get("all") else "FAIL"]
        cl += [PASS_BG if v.get("all") else FAIL_BG]
        rows.append(r)
        colors.append(cl)
    tbl = axt.table(cellText=rows, colLabels=head, cellColours=colors, colColours=["#ece9e1"] * len(head), loc="upper center", cellLoc="center", bbox=(0.0, 0.0, 1.0, 0.92))
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(9)
    for (r, c), cell in tbl.get_celld().items():
        cell.set_edgecolor("#d9d5cb")
        if r == 0:
            cell.set_text_props(fontweight="bold", fontsize=8.5)
        if c == 0 and r > 0:
            cell.set_text_props(fontweight="bold", ha="left")
            cell.get_text().set_color(COLOR[keys[r - 1]] if keys[r - 1] != "raven" else INK)

    gmax = (sc.summary.get("aggregate") or {}).get("maxGen")
    gtxt = f"   max bison generation {gmax:,.0f}" if gmax else ""
    fig.suptitle(f"{sc.name}: stability overview", fontsize=17, fontweight="bold", x=0.01, ha="left", y=0.985)
    sub = sc.summary.get("description", "")
    commit = meta.get("commit", "")
    mock = "  MOCK SIM" if meta.get("args", {}).get("mock") else ""
    fig.text(0.01, 0.945, f"{sub}   {sc.title_extra}{gtxt}   commit {commit}{mock}{'   [log scale]' if log else ''}", fontsize=10, color=MUTED, ha="left", va="top")
    fig.legend(
        handles=[
            Line2D([0], [0], color=INK, lw=0.7, alpha=0.4, label="each seed"),
            Line2D([0], [0], color=INK, lw=2.2, label="median"),
            Patch(facecolor=INK, alpha=0.22, label="interquartile band"),
        ]
        + ([Line2D([0], [0], color=SHOCK, ls="--", lw=1.4, label="shock"), Patch(facecolor=PRIOR, alpha=0.25, label="prior range")] if sc.events() else []),
        loc="upper left",
        ncol=5,
        bbox_to_anchor=(0.052, 0.918),
        fontsize=9,
    )
    save(fig, sc.folder / f"stability_overview{suffix(log)}.png", saved)


def chart_combined(scs: list[Scenario], meta: dict, root: Path, log: bool, saved: list[Path]):
    keys = [k for k in SPECIES if any(k in s.species for s in scs)]
    nr, nc = len(scs), len(keys)
    fig, axes = plt.subplots(nr, nc, figsize=(3.9 * nc + 1.5, 2.55 * nr + 2.0), sharex=False, squeeze=False)
    for r, sc in enumerate(scs):
        t = sc.grid_ticks() / YEAR
        for c, k in enumerate(keys):
            ax = axes[r][c]
            if k not in sc.species:
                ax.set_visible(False)
                continue
            m = sc.matrix(f"pop_{k}")
            draw_overlay(ax, sc, k, t, m, log, lw_med=1.8, seed_alpha=0.16)
            draw_events(ax, sc, text=False)
            ok, started = sc.persisted(k)
            ver = sc.summary.get("verdict", {}).get(k, {})
            good = ok / max(1, started) >= 0.8
            ax.text(0.98, 0.96, f"{ok}/{started} persist", transform=ax.transAxes, ha="right", va="top", fontsize=9, fontweight="bold", color="#2f7d32" if good else SHOCK,
                    bbox=dict(facecolor="white", alpha=0.82, edgecolor="none", pad=1.5), zorder=20)
            if r == 0:
                ax.set_title(LABEL[k], fontsize=12.5, color=COLOR[k] if k != "raven" else INK)
            if r == nr - 1:
                xlabel_years(ax)
            if c == 0:
                ax.set_ylabel(f"{sc.name}\nanimals alive", fontsize=10, fontweight="bold")
            ax.tick_params(labelsize=8)
    fig.suptitle("Stability overview: every scenario, every species", fontsize=17, fontweight="bold", x=0.01, ha="left", y=0.992)
    seeds = scs[0].n
    commit = meta.get("commit", "")
    mock = "  MOCK SIM" if meta.get("args", {}).get("mock") else ""
    fig.text(0.01, 0.945, f"{seeds} seeds per scenario; thin lines = seeds, bold = median, band = interquartile; dashed red = shock, blue band = prior range; commit {commit}{mock}{'  [log scale]' if log else ''}", fontsize=10, color=MUTED, ha="left", va="top")
    fig.tight_layout(rect=(0, 0, 1, 0.925))
    save(fig, root / f"stability_overview{suffix(log)}.png", saved)


# ------------------------------------------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description="Charts for a headless batch stability run.")
    ap.add_argument("folder", help="run folder (scenario sub-folders) or a single scenario folder")
    ap.add_argument("--log", action="store_true", help="symmetric-log population axes; files get a _log suffix")
    args = ap.parse_args()
    root = Path(args.folder)
    if not root.is_dir():
        print(f"not a folder: {root}", file=sys.stderr)
        return 2
    # runs from a re-scaled calendar record their own year length (in each scenario's summary.json)
    global YEAR
    for sj in [root / "summary.json", *sorted(root.glob("*/summary.json"))]:
        if sj.exists():
            YEAR = float(json.loads(sj.read_text(encoding="utf-8")).get("mode", {}).get("yearTicks", YEAR))
            break
    scs = find_scenarios(root)
    if not scs:
        print(f"no seed_*.csv files found under {root}", file=sys.stderr)
        return 2
    meta = load_meta(root)
    saved: list[Path] = []
    for sc in scs:
        if sc.n == 0 or not sc.species:
            print(f"skipping {sc.name}: no data", file=sys.stderr)
            continue
        chart_seeds_grid(sc, args.log, saved)
        chart_cycles(sc, saved)
        chart_species_overlay(sc, args.log, saved)
        chart_phase(sc, args.log, saved)
        chart_traits(sc, saved)
        chart_overview(sc, meta, args.log, saved)
    if (root / "meta.json").exists() or len(scs) > 1:
        chart_combined([s for s in scs if s.n and s.species], meta, root, args.log, saved)
    print(f"wrote {len(saved)} charts:")
    for p in saved:
        print(f"  {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
