"""Scorecard: drift against the accepted baseline, a concept score against the reference art, and a contact sheet (H2).

Usage:
  .venv/Scripts/python tools/scorecard.py <run_dir> [--accept] [--fail-on-drift] [--baseline-dir reference/baseline]
                                          [--no-history] [--out-root artifacts/score] [--selftest]

<run_dir> holds one image per shot named <id>.png (or .jpg). Shot ids and their reference images come from tools/shots.json
when it exists (fields: id, optional reference, optional tags); ids it does not list, or every id when it is absent, use
reference/shots/<id>.jpg if that file exists.

For each shot:
  drift    sha256 of the image file against baseline.json (next to the baseline dir). Same hash, or same decoded pixels:
           identical. No baseline: new. Otherwise the pixels are compared with the baseline: mean absolute difference
           (0 to 255), share of pixels whose largest channel difference is over 8, and the most changed cell of a 4 by 4 grid
           (r1c1 is top left). The comparison uses the lossless local copy <baseline_dir>/local/<id>.png when it exists and
           its pixels match baseline.json: noise when mean <= NOISE_MEAN_MAX and share over 8 <= NOISE_SHARE_OVER_8_MAX (the
           cross-load noise thresholds of tools/shots.mjs --verify), else drifted. Without it (baselines are GPU-specific, so
           the local copy is not committed) the baseline JPEG is used with looser thresholds: noise (jpeg) or drifted.
  concept  only for shots with a reference. Band statistics from tools/look_stats.py (sky, far, mid, near, all: mean L*,
           chroma, hue, contrast, warm share) plus the 5th and 95th percentile of L* and a detail measure (standard deviation
           of L* minus a Gaussian blur of L* at sigma 2 px). Both images are resized to the same 800 px wide size first.
           distance = sum of weight * |difference| over every band and term; score = max(0, 100 - distance).

Writes <out_root>/<stamp>/summary.md, summary.json and sheet.jpg, appends one entry to reference/score_history.json unless
--no-history, and prints the stamp folder as the last line. --accept then writes the current images as the new baseline
(<id>.jpg, baseline.json, and the lossless <baseline_dir>/local/<id>.png). --fail-on-drift exits 1 when any shot is drifted
(identical, noise, noise (jpeg) and new all pass).
"""
import argparse
import datetime
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import look_stats  # noqa: E402  (band statistics: BANDS, srgb_to_lab, stats)

# ---------------------------------------------------------------------------------------------------------------------
# Concept score weights. Each term costs TERM_WEIGHTS[term] * BAND_WEIGHTS[band] * |capture - reference| points.
# Calibrated on 2026-11-11 against scratch/fable-audit/look/lk_01_concept.jpg (the old capture of the golden concept view),
# which lands near 50: room to move both ways.
TERM_WEIGHTS = {
    "L": 0.30,       # mean L* (0 to 100): about 3 L* units cost a point; exposure matters but is the easiest thing to fix.
    "C": 0.35,       # mean chroma: colourfulness drives the golden look, so a little dearer than lightness.
    "h": 0.12,       # hue angle in degrees, scaled down by chroma (below): 8 degrees cost a point; gold vs olive vs purple.
    "sd": 0.50,      # L* standard deviation: contrast within the band; flat, low-contrast bands are a known weakness.
    "warm": 10.0,    # warm share (0 to 1): a 10% swing in gold pixels costs a point.
    "p5": 0.40,      # 5th percentile L*: haze lifts the shadow floor, so the floor gets its own term.
    "p95": 0.20,     # 95th percentile L*: highlight ceiling; cheaper because sky glare and sun position vary per frame.
    "detail": 3.00,  # std of L* minus its sigma-2 blur (typically 1 to 5): grass and shading texture, the thing captures
                     # most often lose; small in raw units, so a large weight (one L* unit of lost detail costs 3 points).
}
BAND_WEIGHTS = {
    "sky": 0.6,   # the sky is a small, simple part of the frame and the concept sky is a soft gradient.
    "far": 1.0,   # far hills and haze carry the depth read.
    "mid": 1.0,   # the herd, creek and groves.
    "near": 1.0,  # foreground grass, where detail shows.
    "all": 0.5,   # whole frame, a guard against shifts every band shares; half weight since it repeats the bands.
}
HUE_CHROMA_FULL = 15.0  # the hue term counts fully once both images have mean chroma >= this; hue of a grey band means little.
TERMS = list(TERM_WEIGHTS)
BAND_NAMES = [b[0] for b in look_stats.BANDS]
COMPARE_W = 800
BLUR_SIGMA = 2.0
DRIFT_PIXEL_THRESHOLD = 8
# Cross-load noise thresholds, measured 2026-11-12 (two page loads, all 14 shots: mean <= 0.17, share over 8 <= 0.10%).
# Same values as NOISE_MEAN_MAX and NOISE_SHARE_OVER_8_MAX in tools/shots.mjs. Used against the lossless local baseline.
NOISE_MEAN_MAX = 0.5
NOISE_SHARE_OVER_8_MAX = 0.0025
# Looser thresholds for the fallback against the JPEG q92 baseline, whose compression error adds to the cross-load noise.
JPEG_NOISE_MEAN_MAX = 2.0
JPEG_NOISE_SHARE_OVER_8_MAX = 0.03
LOCAL_DIRNAME = "local"
DRIFT_STATUSES = ["identical", "noise", "noise (jpeg)", "drifted", "new"]
GRID = 4
SHEET_MAX_W = 2400
IMAGE_EXTS = (".png", ".jpg", ".jpeg")


# ---------------------------------------------------------------------------------------------------------------------
# helpers

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_rgb(path):
    with Image.open(path) as im:
        return im.convert("RGB")


def pixels_sha256(im):
    return hashlib.sha256(im.tobytes()).hexdigest()


def git_commit():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True,
                              timeout=20).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def rel(path):
    try:
        return os.path.relpath(path, ROOT).replace("\\", "/")
    except ValueError:
        return path.replace("\\", "/")


def new_stamp_dir(out_root):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    d, n = os.path.join(out_root, stamp), 2
    while os.path.exists(d):
        d = os.path.join(out_root, f"{stamp}-{n}")
        n += 1
    os.makedirs(d)
    return os.path.basename(d), d


# ---------------------------------------------------------------------------------------------------------------------
# shot discovery

def load_shot_specs():
    """{id: {reference, tags}} from tools/shots.json, or {} when absent or unreadable. Accepts a list or {shots: [...]}."""
    p = os.path.join(ROOT, "tools", "shots.json")
    if not os.path.exists(p):
        return {}, False
    try:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:  # another tool may be mid-write; fall back to the folder convention
        print(f"warning: tools/shots.json unreadable ({e}); using reference/shots/<id>.jpg", file=sys.stderr)
        return {}, False
    items = data.get("shots", []) if isinstance(data, dict) else data
    specs = {}
    for it in items if isinstance(items, list) else []:
        if isinstance(it, dict) and it.get("id"):
            specs[it["id"]] = {"reference": it.get("reference"), "tags": it.get("tags", [])}
    return specs, True


def find_shots(run_dir, refs_override=None):
    files = {}
    for name in sorted(os.listdir(run_dir)):
        stem, ext = os.path.splitext(name)
        if ext.lower() in IMAGE_EXTS and os.path.isfile(os.path.join(run_dir, name)):
            if stem not in files or ext.lower() == ".png":  # prefer the lossless file when both exist
                files[stem] = os.path.join(run_dir, name)
    specs, have_json = ({}, False) if refs_override is not None else load_shot_specs()
    order = [i for i in specs if i in files] + [i for i in files if i not in specs]
    shots = []
    for sid in order:
        ref = None
        if refs_override is not None:
            ref = refs_override.get(sid)
        elif sid in specs:
            r = specs[sid]["reference"]
            if r:
                ref = r if os.path.isabs(r) else os.path.join(ROOT, r)
                if not os.path.exists(ref):
                    print(f"warning: {sid}: reference {r} not found; no concept score", file=sys.stderr)
                    ref = None
        else:
            cand = os.path.join(ROOT, "reference", "shots", f"{sid}.jpg")
            ref = cand if os.path.exists(cand) else None
        shots.append({"id": sid, "image": files[sid], "reference": ref,
                      "tags": specs.get(sid, {}).get("tags", [])})
    return shots, have_json


# ---------------------------------------------------------------------------------------------------------------------
# concept score

def gaussian_blur(a, sigma):
    r = int(math.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, ((0, 0), (r, r)), mode="reflect")
    a = sum(k[i] * p[:, i:i + a.shape[1]] for i in range(2 * r + 1))
    p = np.pad(a, ((r, r), (0, 0)), mode="reflect")
    return sum(k[i] * p[i:i + a.shape[0], :] for i in range(2 * r + 1))


def band_stats(im, tmpdir, tag):
    """look_stats band statistics plus p5, p95 and detail. im is already at the common compare size."""
    p = os.path.join(tmpdir, f"{tag}.png")
    im.save(p)
    out = look_stats.stats(p)  # resizes to 480 wide internally; both images share a size, so they resize alike
    L, _, _ = look_stats.srgb_to_lab(np.asarray(im))
    hp = L - gaussian_blur(L, BLUR_SIGMA)
    H = L.shape[0]
    for name, y0, y1 in look_stats.BANDS:
        sl = slice(int(H * y0), max(int(H * y0) + 1, int(H * y1)))  # same band split as look_stats.stats
        Lb = L[sl]
        out[name]["p5"] = float(np.percentile(Lb, 5))
        out[name]["p95"] = float(np.percentile(Lb, 95))
        out[name]["detail"] = float(hp[sl].std())
    return out


def concept_compare(image_path, ref_path):
    cap = load_rgb(image_path)
    size = (COMPARE_W, max(1, round(COMPARE_W * cap.height / cap.width)))
    cap = cap.resize(size, Image.BILINEAR)
    ref = load_rgb(ref_path).resize(size, Image.BILINEAR)
    tmp = tempfile.mkdtemp(prefix="scorecard_")
    try:
        sc, sr = band_stats(cap, tmp, "cap"), band_stats(ref, tmp, "ref")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    contrib = {}
    for b in BAND_NAMES:
        x, y, bw = sc[b], sr[b], BAND_WEIGHTS[b]
        row = {}
        for t in TERMS:
            if t == "h":
                d = abs((x["h"] - y["h"] + 180) % 360 - 180) * min(1.0, min(x["C"], y["C"]) / HUE_CHROMA_FULL)
            else:
                d = abs(x[t] - y[t])
            row[t] = TERM_WEIGHTS[t] * bw * d
        contrib[b] = row
    distance = sum(v for row in contrib.values() for v in row.values())
    worst_b, worst_t = max(((b, t) for b in BAND_NAMES for t in TERMS), key=lambda bt: contrib[bt[0]][bt[1]])
    return {
        "score": round(max(0.0, 100.0 - distance), 1),
        "distance": round(distance, 2),
        "worst_term": f"{worst_b}.{worst_t}",
        "worst_cost": round(contrib[worst_b][worst_t], 2),
        "contributions": {b: {t: round(v, 3) for t, v in row.items()} for b, row in contrib.items()},
        "capture_stats": {b: {k: round(v, 3) for k, v in s.items()} for b, s in sc.items()},
        "reference_stats": {b: {k: round(v, 3) for k, v in s.items()} for b, s in sr.items()},
    }


def breakdown_text(sid, c):
    lines = [f"{sid}: score {c['score']:.1f} (distance {c['distance']:.2f}), worst {c['worst_term']} ({c['worst_cost']:.2f})",
             f"  {'band':6s}" + "".join(f"{t:>7s}" for t in TERMS) + f" | {'band':>6s}"]
    totals = {t: 0.0 for t in TERMS}
    for b in BAND_NAMES:
        row = c["contributions"][b]
        for t in TERMS:
            totals[t] += row[t]
        lines.append(f"  {b:6s}" + "".join(f"{row[t]:7.2f}" for t in TERMS) + f" | {sum(row.values()):6.2f}")
    lines.append(f"  {'term':6s}" + "".join(f"{totals[t]:7.2f}" for t in TERMS) + f" | {sum(totals.values()):6.2f}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------------------------------------
# drift

def baseline_json_path(baseline_dir):
    return os.path.join(os.path.dirname(os.path.abspath(baseline_dir)), "baseline.json")


def load_baseline(baseline_dir):
    p = baseline_json_path(baseline_dir)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {"commit": None, "date": None, "shots": {}}


def local_png_path(baseline_dir, sid):
    return os.path.join(baseline_dir, LOCAL_DIRNAME, f"{sid}.png")


def drift_for(shot, baseline, baseline_dir):
    sha = sha256_file(shot["image"])
    entry = baseline.get("shots", {}).get(shot["id"])
    base_img = os.path.join(baseline_dir, f"{shot['id']}.jpg")
    local_img = local_png_path(baseline_dir, shot["id"])
    res = {"sha256": sha, "baseline_image": base_img if os.path.exists(base_img) else None}
    if not entry or not (os.path.exists(base_img) or os.path.exists(local_img)):
        res["status"] = "new"
        return res, None
    cur = load_rgb(shot["image"])
    if entry.get("sha256") == sha or (entry.get("pixels_sha256") and entry["pixels_sha256"] == pixels_sha256(cur)):
        res["status"] = "identical"
        return res, None
    base, kind = None, None
    if os.path.exists(local_img):
        loc = load_rgb(local_img)
        # Only trust the local copy when it is the capture baseline.json describes (another machine may have accepted since).
        if not entry.get("pixels_sha256") or entry["pixels_sha256"] == pixels_sha256(loc):
            base, kind = loc, "lossless"
            res["baseline_image"] = local_img
        else:
            res["local_stale"] = True
    if base is None:
        if not os.path.exists(base_img):
            res["status"] = "new"  # only a stale local copy: nothing trustworthy to compare with
            return res, None
        base, kind = load_rgb(base_img), "jpeg"
    res["compared_with"] = kind
    res["size_changed"] = base.size != cur.size
    if base.size != cur.size:
        base = base.resize(cur.size, Image.BILINEAR)
    d = np.abs(np.asarray(cur, dtype=np.int16) - np.asarray(base, dtype=np.int16))
    dm = d.mean(axis=2)
    H, W = dm.shape
    cells = [[float(dm[H * r // GRID:H * (r + 1) // GRID, W * c // GRID:W * (c + 1) // GRID].mean()) for c in range(GRID)]
             for r in range(GRID)]
    r, c = max(((r, c) for r in range(GRID) for c in range(GRID)), key=lambda rc: cells[rc[0]][rc[1]])
    mad = float(d.mean())
    share = float(np.mean(d.max(axis=2) > DRIFT_PIXEL_THRESHOLD))
    if kind == "lossless":
        quiet = mad <= NOISE_MEAN_MAX and share <= NOISE_SHARE_OVER_8_MAX
        status = "noise" if quiet and not res["size_changed"] else "drifted"
    else:
        quiet = mad <= JPEG_NOISE_MEAN_MAX and share <= JPEG_NOISE_SHARE_OVER_8_MAX
        status = "noise (jpeg)" if quiet and not res["size_changed"] else "drifted"
    res.update(status=status, mad=round(mad, 3), share_over_8=round(share, 5), max_diff=int(d.max()),
               worst_cell=f"r{r + 1}c{c + 1}", worst_cell_mad=round(cells[r][c], 3),
               grid_mad=[[round(v, 2) for v in row] for row in cells])
    heat = Image.fromarray(np.clip(d * 4, 0, 255).astype(np.uint8), "RGB")
    return res, heat


def drift_text(dr):
    if dr["status"] in ("identical", "new"):
        return dr["status"]
    t = f"{dr['status']} mad {dr['mad']:.2f}, {dr['share_over_8'] * 100:.2f}% px>8"
    return t + f", most {dr['worst_cell']}" if dr["status"] == "drifted" else t


def status_counts(results):
    counts = {k: 0 for k in DRIFT_STATUSES}
    for r in results:
        counts[r["drift"]["status"]] = counts.get(r["drift"]["status"], 0) + 1
    return counts


def accept(shots, baseline, baseline_dir, commit):
    os.makedirs(baseline_dir, exist_ok=True)
    local_dir = os.path.join(baseline_dir, LOCAL_DIRNAME)  # lossless copies, GPU-specific, gitignored
    os.makedirs(local_dir, exist_ok=True)
    out = {"commit": commit, "date": datetime.datetime.now().isoformat(timespec="seconds"),
           "shots": dict(baseline.get("shots", {}))}  # keep ids this run did not capture
    for s in shots:
        im = load_rgb(s["image"])
        im.save(os.path.join(baseline_dir, f"{s['id']}.jpg"), quality=92)
        lp = local_png_path(baseline_dir, s["id"])
        if s["image"].lower().endswith(".png"):
            shutil.copyfile(s["image"], lp)  # the exact capture bytes
        else:
            im.save(lp)
        out["shots"][s["id"]] = {"sha256": sha256_file(s["image"]), "pixels_sha256": pixels_sha256(im)}
    with open(baseline_json_path(baseline_dir), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")


# ---------------------------------------------------------------------------------------------------------------------
# contact sheet

def font(size, bold=False):
    for name in (["arialbd.ttf", "segoeuib.ttf"] if bold else ["arial.ttf", "segoeui.ttf"]) + ["DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def contact_sheet(rows, path, title):
    """rows: list of dict(id, label2, cells=[(column_name, PIL image or None, blank_text)])."""
    cols, margin, gutter = 4, 16, 12
    cell_w = (SHEET_MAX_W - 2 * margin - (cols - 1) * gutter) // cols
    thumb_h = cell_w * 9 // 16
    f1, f2, ft = font(20, True), font(18), font(26, True)
    cap_h = 52
    head_h = 56
    row_h = cap_h + thumb_h + gutter
    W = 2 * margin + cols * cell_w + (cols - 1) * gutter
    H = head_h + len(rows) * row_h + margin
    sheet = Image.new("RGB", (W, H), (24, 24, 26))
    dr = ImageDraw.Draw(sheet)
    dr.text((margin, 14), title, font=ft, fill=(235, 235, 235))
    for ri, row in enumerate(rows):
        y0 = head_h + ri * row_h
        for ci, (colname, im, blank) in enumerate(row["cells"]):
            x0 = margin + ci * (cell_w + gutter)
            dr.text((x0 + 2, y0 + 2), f"{row['id']}  |  {colname}", font=f1, fill=(240, 240, 240))
            dr.text((x0 + 2, y0 + 27), row["label2"], font=f2, fill=(200, 200, 200))
            ty = y0 + cap_h
            dr.rectangle([x0, ty, x0 + cell_w - 1, ty + thumb_h - 1], fill=(40, 40, 44))
            if im is None:
                tw = dr.textlength(blank, font=f2)
                dr.text((x0 + (cell_w - tw) / 2, ty + thumb_h / 2 - 10), blank, font=f2, fill=(120, 120, 128))
                continue
            t = im.copy()
            t.thumbnail((cell_w, thumb_h), Image.LANCZOS)
            sheet.paste(t, (x0 + (cell_w - t.width) // 2, ty + (thumb_h - t.height) // 2))
    sheet.save(path, quality=88)
    return sheet.size


# ---------------------------------------------------------------------------------------------------------------------
# run

def run(run_dir, baseline_dir, out_root, history_path=None, do_accept=False, fail_on_drift=False, refs_override=None,
        quiet=False):
    say = (lambda *a: None) if quiet else print
    run_dir = os.path.abspath(run_dir)
    shots, have_json = find_shots(run_dir, refs_override)
    if not shots:
        raise SystemExit(f"no images (*.png, *.jpg) in {run_dir}")
    commit = git_commit()
    baseline = load_baseline(baseline_dir)
    stamp, out_dir = new_stamp_dir(out_root)
    results, heats = [], {}
    for s in shots:
        dr, heat = drift_for(s, baseline, baseline_dir)
        heats[s["id"]] = heat
        c = concept_compare(s["image"], s["reference"]) if s["reference"] else None
        results.append({"id": s["id"], "image": rel(s["image"]), "reference": rel(s["reference"]) if s["reference"] else None,
                        "tags": s["tags"], "drift": dr, "concept": c})
        if c:
            say(breakdown_text(s["id"], c))
    scored = [r["concept"]["score"] for r in results if r["concept"]]
    drifted = [r["id"] for r in results if r["drift"]["status"] == "drifted"]
    counts = status_counts(results)
    counts_text = ", ".join(f"{k} {v}" for k, v in counts.items())
    total = round(sum(scored) / len(scored), 1) if scored else None
    summary = {"stamp": stamp, "commit": commit, "run_dir": rel(run_dir), "baseline_dir": rel(os.path.abspath(baseline_dir)),
               "shot_list": "tools/shots.json" if have_json else "folder (reference/shots/<id>.jpg)",
               "weights": {"terms": TERM_WEIGHTS, "bands": BAND_WEIGHTS, "hue_chroma_full": HUE_CHROMA_FULL},
               "drift_thresholds": {"pixel": DRIFT_PIXEL_THRESHOLD,
                                    "lossless": {"mean_max": NOISE_MEAN_MAX, "share_over_8_max": NOISE_SHARE_OVER_8_MAX},
                                    "jpeg": {"mean_max": JPEG_NOISE_MEAN_MAX, "share_over_8_max": JPEG_NOISE_SHARE_OVER_8_MAX}},
               "total": {"mean_concept_score": total, "referenced": len(scored), "drifted_count": len(drifted),
                         "drifted": drifted, "drift_status_counts": counts, "shots": len(results)},
               "shots": results}
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")

    md = [f"# Scorecard {stamp}", "", f"- Run: `{rel(run_dir)}`, commit `{commit}`, baseline `{rel(os.path.abspath(baseline_dir))}`",
          f"- Mean concept score: **{total if total is not None else 'n/a'}** over {len(scored)} referenced shot(s); "
          f"drifted: **{len(drifted)}** of {len(results)}",
          f"- Drift status: {counts_text}", "",
          "| shot | concept score | worst term | drift |", "|---|---:|---|---|"]
    for r in results:
        c = r["concept"]
        md.append(f"| {r['id']} | {c['score']:.1f} | {c['worst_term']} ({c['worst_cost']:.2f}) | {drift_text(r['drift'])} |" if c
                  else f"| {r['id']} | - | - | {drift_text(r['drift'])} |")
    md += ["", "Worst term is `band.term` with its cost in points. Per-term breakdowns are in summary.json under `contributions`.",
           "Drift: mean absolute difference (0 to 255), share of pixels whose largest channel moved more than 8, and the most",
           "changed cell of a 4 by 4 grid (r1c1 is top left). Status: identical (same bytes or pixels); noise (against the",
           f"lossless local baseline, mean <= {NOISE_MEAN_MAX} and share over 8 <= {NOISE_SHARE_OVER_8_MAX * 100:.2f}%);",
           f"noise (jpeg) (no local baseline, against the JPEG: mean <= {JPEG_NOISE_MEAN_MAX} and share over 8 <=",
           f"{JPEG_NOISE_SHARE_OVER_8_MAX * 100:.0f}%); drifted (otherwise); new (no baseline).", ""]
    for r in results:
        if r["concept"]:
            md += ["```", breakdown_text(r["id"], r["concept"]), "```", ""]
    with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    rows = []
    for s, r in zip(shots, results):
        c = r["concept"]
        label2 = f"score {c['score']:.1f}  |  {drift_text(r['drift'])}" if c else f"score -  |  {drift_text(r['drift'])}"
        bimg = r["drift"].get("baseline_image")
        rows.append({"id": s["id"], "label2": label2, "cells": [
            ("reference", load_rgb(s["reference"]) if s["reference"] else None, "no reference"),
            ("current", load_rgb(s["image"]), ""),
            ("baseline", load_rgb(bimg) if bimg else None, "no baseline"),
            ("difference x4", heats[s["id"]], "no drift" if r["drift"]["status"] == "identical" else "-"),
        ]})
    n_noise = counts["noise"] + counts["noise (jpeg)"]
    title = (f"Scorecard {stamp}  |  commit {commit}  |  mean concept score {total if total is not None else 'n/a'}  |  "
             f"drifted {len(drifted)}, noise {n_noise}, identical {counts['identical']} of {len(results)}")
    sheet_size = contact_sheet(rows, os.path.join(out_dir, "sheet.jpg"), title)
    summary["sheet_size"] = list(sheet_size)

    if history_path:
        hist = []
        if os.path.exists(history_path):
            with open(history_path, encoding="utf-8") as f:
                hist = json.load(f)
        hist.append({"stamp": stamp, "commit": commit, "total": total,
                     "shots": {r["id"]: r["concept"]["score"] for r in results if r["concept"]}, "drifted": drifted})
        with open(history_path, "w", encoding="utf-8") as f:
            json.dump(hist, f, indent=2)
            f.write("\n")

    say("")
    say("\n".join(md[:2 + 4 + 2 + len(results)]))
    say("")
    say(f"drift: {counts_text}")
    if do_accept:
        accept(shots, baseline, baseline_dir, commit)
        say(f"accepted {len(shots)} shot(s) as baseline in {rel(os.path.abspath(baseline_dir))} "
            f"(lossless copies in {LOCAL_DIRNAME}/)")
    code = 0
    if fail_on_drift:
        bad = [r["id"] for r in results if r["drift"]["status"] == "drifted"]
        if bad:
            say(f"FAIL: drift in {', '.join(bad)}")
            code = 1
    return code, out_dir, summary


# ---------------------------------------------------------------------------------------------------------------------
# selftest

def synth(w=640, h=360, seed=7):
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    img = np.zeros((h, w, 3))
    sky = y < 0.3
    img[..., 0] = np.where(sky, 120 + 120 * y, 170 + 40 * np.sin(x * 30) * (y > 0.5))
    img[..., 1] = np.where(sky, 150 + 60 * y, 130 + 20 * np.cos(x * 50 + y * 20))
    img[..., 2] = np.where(sky, 210 - 80 * y, 60 + 0 * x)
    img[~sky[:, 0]] += rng.normal(0, 18, img[~sky[:, 0]].shape)  # grass texture
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def selftest():
    tmp = tempfile.mkdtemp(prefix="scorecard_selftest_")
    ok = []

    def check(cond, msg):
        print(("PASS " if cond else "FAIL ") + msg)
        ok.append(bool(cond))

    try:
        base = synth()
        refp = os.path.join(tmp, "ref.png")
        base.save(refp)
        run1 = os.path.join(tmp, "run1")
        os.makedirs(run1)
        base.save(os.path.join(run1, "orig.png"))
        hsv = np.asarray(base.convert("HSV")).copy()
        hsv[..., 0] = (hsv[..., 0].astype(int) + 40) % 256
        Image.fromarray(hsv, "HSV").convert("RGB").save(os.path.join(run1, "hue.png"))
        base.filter(ImageFilter.GaussianBlur(3)).save(os.path.join(run1, "blur.png"))
        refs = {"orig": refp, "hue": refp, "blur": refp}
        bdir, oroot = os.path.join(tmp, "baseline"), os.path.join(tmp, "out")
        hist = os.path.join(tmp, "history.json")

        code, out1, s1 = run(run1, bdir, oroot, hist, do_accept=True, refs_override=refs, quiet=True)
        st = {r["id"]: r for r in s1["shots"]}
        check(all(r["drift"]["status"] == "new" for r in s1["shots"]), "first run with no baseline: every shot is new")
        for f in ("summary.md", "summary.json", "sheet.jpg"):
            check(os.path.getsize(os.path.join(out1, f)) > 0, f"output written: {f}")
        check(s1["sheet_size"][0] <= SHEET_MAX_W, f"sheet width {s1['sheet_size'][0]} <= {SHEET_MAX_W}")
        check(os.path.exists(os.path.join(bdir, "orig.jpg")) and os.path.exists(baseline_json_path(bdir)), "--accept wrote baseline")
        with open(hist, encoding="utf-8") as f:
            check(len(json.load(f)) == 1, "history appended")
        so, sh, sb = st["orig"]["concept"]["score"], st["hue"]["concept"]["score"], st["blur"]["concept"]["score"]
        check(so >= 99.9, f"image against itself scores 100 (got {so})")
        check(sh < so, f"hue-shifted copy scores lower ({sh} < {so}); worst {st['hue']['concept']['worst_term']}")
        check(sb < so, f"blurred copy scores lower ({sb} < {so}); worst {st['blur']['concept']['worst_term']}")

        code, out2, s2 = run(run1, bdir, oroot, None, fail_on_drift=True, refs_override=refs, quiet=True)
        check(all(r["drift"]["status"] == "identical" for r in s2["shots"]), "same images again: every shot identical")
        check(code == 0, "--fail-on-drift exits 0 when everything is identical")
        same = all(a["concept"] == b["concept"] for a, b in zip(s1["shots"], s2["shots"]))
        check(same, "two runs on the same folder give the same concept numbers")

        run2 = os.path.join(tmp, "run2")
        shutil.copytree(run1, run2)
        arr = np.asarray(base).astype(int)
        arr[:90, 480:] += 60  # brighten the top right corner only (rows 0-89 of 360, columns 480-639 of 640)
        Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(run2, "orig.png"))
        code, out3, s3 = run(run2, bdir, oroot, None, fail_on_drift=True, refs_override=refs, quiet=True)
        d = {r["id"]: r["drift"] for r in s3["shots"]}
        check(d["orig"]["status"] == "drifted" and d["orig"]["worst_cell"] == "r1c4",
              f"changed image drifts, most changed cell r1c4 (got {d['orig'].get('worst_cell')}, mad {d['orig'].get('mad')})")
        check(d["hue"]["status"] == "identical", "unchanged images stay identical")
        check(code == 1, "--fail-on-drift exits 1 on drift")

        # noise: +1 on a third of the channel values plus 0.1% of pixels moved by 20 (mean about 0.35, share over 8 0.1%),
        # the shape of the measured cross-load noise.
        lp = local_png_path(bdir, "orig")
        check(os.path.exists(lp) and sha256_file(lp) == sha256_file(os.path.join(run1, "orig.png")),
              "--accept wrote the lossless local copy with the capture's exact bytes")
        rng = np.random.default_rng(3)
        arr = np.asarray(base).astype(int)
        arr += (rng.random(arr.shape) < 0.33).astype(int)
        hit = rng.random(arr.shape[:2]) < 0.001
        arr[hit] += 20
        noisy = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        run3 = os.path.join(tmp, "run3")
        shutil.copytree(run1, run3)
        noisy.save(os.path.join(run3, "orig.png"))
        code, out4, s4 = run(run3, bdir, oroot, None, fail_on_drift=True, refs_override=refs, quiet=True)
        d = {r["id"]: r["drift"] for r in s4["shots"]}
        check(d["orig"]["status"] == "noise" and d["orig"]["compared_with"] == "lossless",
              f"small noise against the local PNG is noise (got {d['orig']['status']}, mad {d['orig'].get('mad')}, "
              f"share over 8 {d['orig'].get('share_over_8')})")
        check(code == 0, "--fail-on-drift exits 0 when the only change is noise")
        with open(os.path.join(out4, "summary.md"), encoding="utf-8") as f:
            check("| noise mad" in f.read(), "summary.md shows the noise status")
        check(s4["total"]["drift_status_counts"]["noise"] == 1, "summary.json counts the noise shot")

        # the same noise just over the line is drifted: 0.4% of pixels moved by 20 (share over 8 > 0.25%).
        arr2 = np.asarray(base).astype(int)
        arr2[rng.random(arr2.shape[:2]) < 0.004] += 20
        Image.fromarray(np.clip(arr2, 0, 255).astype(np.uint8)).save(os.path.join(run3, "orig.png"))
        code, _, s5 = run(run3, bdir, oroot, None, fail_on_drift=True, refs_override=refs, quiet=True)
        d = {r["id"]: r["drift"] for r in s5["shots"]}
        check(d["orig"]["status"] == "drifted" and code == 1,
              f"0.4% of pixels over 8 is drifted (got {d['orig']['status']}, share {d['orig'].get('share_over_8')})")

        # no local PNG: fall back to the JPEG with looser thresholds.
        noisy.save(os.path.join(run3, "orig.png"))
        shutil.rmtree(os.path.join(bdir, LOCAL_DIRNAME))
        code, _, s6 = run(run3, bdir, oroot, None, fail_on_drift=True, refs_override=refs, quiet=True)
        d = {r["id"]: r["drift"] for r in s6["shots"]}
        check(d["orig"]["status"] in ("noise (jpeg)", "drifted") and d["orig"]["compared_with"] == "jpeg",
              f"without the local PNG the JPEG is used (got {d['orig']['status']}, mad {d['orig'].get('mad')}, "
              f"share over 8 {d['orig'].get('share_over_8')})")
        # a smooth image (JPEG error small) with the same noise reads as noise (jpeg); a real change still drifts.
        smooth = base.filter(ImageFilter.GaussianBlur(4))
        run4, bdir2 = os.path.join(tmp, "run4"), os.path.join(tmp, "baseline2")
        os.makedirs(run4)
        smooth.save(os.path.join(run4, "s.png"))
        run(run4, bdir2, oroot, None, do_accept=True, refs_override={}, quiet=True)
        shutil.rmtree(os.path.join(bdir2, LOCAL_DIRNAME))
        a3 = np.asarray(smooth).astype(int)
        a3 += (rng.random(a3.shape) < 0.33).astype(int)
        Image.fromarray(np.clip(a3, 0, 255).astype(np.uint8)).save(os.path.join(run4, "s.png"))
        code, _, s7 = run(run4, bdir2, oroot, None, fail_on_drift=True, refs_override={}, quiet=True)
        dj = s7["shots"][0]["drift"]
        check(dj["status"] == "noise (jpeg)" and code == 0,
              f"smooth image plus noise against the JPEG is noise (jpeg) and passes (got {dj['status']}, mad {dj.get('mad')}, "
              f"share over 8 {dj.get('share_over_8')})")
        a3[:90, 480:] += 60
        Image.fromarray(np.clip(a3, 0, 255).astype(np.uint8)).save(os.path.join(run4, "s.png"))
        code, _, s8 = run(run4, bdir2, oroot, None, fail_on_drift=True, refs_override={}, quiet=True)
        check(s8["shots"][0]["drift"]["status"] == "drifted" and code == 1, "a real change against the JPEG is drifted")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"selftest: {sum(ok)} of {len(ok)} checks passed")
    return 0 if all(ok) else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("run_dir", nargs="?")
    ap.add_argument("--accept", action="store_true", help="write the current images as the baseline after scoring")
    ap.add_argument("--fail-on-drift", action="store_true", help="exit 1 when any shot is drifted (noise passes)")
    ap.add_argument("--baseline-dir", default=os.path.join(ROOT, "reference", "baseline"))
    ap.add_argument("--no-history", action="store_true", help="do not append to reference/score_history.json")
    ap.add_argument("--out-root", default=os.path.join(ROOT, "artifacts", "score"))
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        sys.exit(selftest())
    if not a.run_dir:
        ap.error("run_dir is required")
    if not os.path.isdir(a.run_dir):
        ap.error(f"not a folder: {a.run_dir}")
    hist = None if a.no_history else os.path.join(ROOT, "reference", "score_history.json")
    code, out_dir, _ = run(a.run_dir, a.baseline_dir, a.out_root, hist, a.accept, a.fail_on_drift)
    print(os.path.normpath(out_dir))
    sys.exit(code)


if __name__ == "__main__":
    main()
