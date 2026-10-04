// The "evolution" view of the expanded population graph: the arms race (mean speed of wolves, bison and pronghorn
// against the founders) as the hero chart, then a row of small multiples for size and coat darkness.
import { YEAR_TICKS } from '../sim/types';
import { niceStep, niceStepInt, roundRect } from './chartutil';
import { PAPER_DIM, SANS, SERIF, SPECIES_COLORS } from './palette';
import { yearOfTick, yearStartTick } from './describe';
import { TRAITS, coatColor, traitIndex } from './traits';

export interface EvoData {
  ticks: number[];
  /** One array per trait (see TRAITS), parallel to ticks, NaN when the species is absent. */
  series: number[][];
}

/** Hero lines in the order the legend lists them. */
export const HERO = [
  { index: traitIndex(1, 'speed'), name: 'Wolf', sp: 1 },
  { index: traitIndex(0, 'speed'), name: 'Bison', sp: 0 },
  { index: traitIndex(3, 'speed'), name: 'Pronghorn', sp: 3 },
];

const pct = (v: number): number => (v - 1) * 100;
export const fmtPct = (p: number): string => `${p >= 0 ? '+' : '-'}${Math.abs(p).toFixed(Math.abs(p) >= 10 ? 0 : 1)}%`;

function hasData(d: EvoData, index: number): boolean {
  const s = d.series[index];
  if (!s) return false;
  for (let i = 0; i < s.length; i++) if (Number.isFinite(s[i])) return true;
  return false;
}

/** Latest finite value of a trait, or NaN. */
export function latest(d: EvoData, index: number): number {
  const s = d.series[index];
  if (!s) return NaN;
  for (let i = s.length - 1; i >= 0; i--) if (Number.isFinite(s[i])) return s[i];
  return NaN;
}

export function anyTraits(d: EvoData): boolean {
  return TRAITS.some((t) => hasData(d, t.index));
}

interface Panel {
  title: string;
  /** Trait indices drawn in this panel. */
  indices: number[];
  coatSp?: number;
}

function panelsFor(d: EvoData): Panel[] {
  const all: Panel[] = [
    { title: 'Size', indices: [traitIndex(0, 'size'), traitIndex(1, 'size')] },
    { title: 'Bison coat', indices: [traitIndex(0, 'coat')], coatSp: 0 },
    { title: 'Wolf coat', indices: [traitIndex(1, 'coat')], coatSp: 1 },
    { title: 'Pronghorn coat', indices: [traitIndex(3, 'coat')], coatSp: 3 },
  ];
  return all.map((p) => ({ ...p, indices: p.indices.filter((i) => hasData(d, i)) })).filter((p) => p.indices.length > 0);
}

export interface EvoLayout {
  L: number;
  R: number;
  heroT: number;
  heroB: number;
  rowT: number;
  rowB: number;
}

export function evoLayout(w: number, h: number, u: number): EvoLayout {
  const T = 8 * u, B = 6 * u;
  const avail = h - T - B;
  const rowH = Math.min(avail * 0.36, 86 * u);
  const gap = 28 * u;
  return { L: 40 * u, R: 54 * u, heroT: T, heroB: T + avail - rowH - gap, rowT: T + avail - rowH, rowB: T + avail };
}

/** Draw a polyline that breaks at NaN values. `step` downsamples. */
function strokeSeries(
  g: CanvasRenderingContext2D,
  ticks: number[],
  vals: number[],
  X: (t: number) => number,
  Y: (v: number) => number,
  step: number,
): void {
  const n = ticks.length;
  g.beginPath();
  let pen = false;
  for (let i = 0; i < n; i += step) {
    const v = vals[i];
    if (!Number.isFinite(v)) { pen = false; continue; }
    const x = X(ticks[i]), y = Y(v);
    if (pen) g.lineTo(x, y); else g.moveTo(x, y);
    pen = true;
  }
  const lv = vals[n - 1];
  if (Number.isFinite(lv)) {
    if (pen) g.lineTo(X(ticks[n - 1]), Y(lv)); else g.moveTo(X(ticks[n - 1]), Y(lv));
  }
}

/** Value range of some series, padded, with a floor on the span. Optionally forced to include 0. */
function range(d: EvoData, indices: number[], f: (v: number) => number, includeZero: boolean, minSpan: number): [number, number] {
  let lo = includeZero ? 0 : Infinity, hi = includeZero ? 0 : -Infinity;
  for (const k of indices) {
    const s = d.series[k];
    for (let i = 0; i < s.length; i++) {
      if (!Number.isFinite(s[i])) continue;
      const v = f(s[i]);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, minSpan];
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  return [lo, hi];
}

export function drawEvolution(g: CanvasRenderingContext2D, w: number, h: number, u: number, d: EvoData, hoverX: number): number {
  const n = d.ticks.length;
  g.textBaseline = 'middle';
  if (n < 2 || !anyTraits(d)) {
    g.font = `500 ${12 * u}px ${SANS}`;
    g.fillStyle = PAPER_DIM;
    g.textAlign = 'center';
    g.fillText('Evolution fills in as the generations turn.', w / 2, h / 2);
    return -1;
  }
  const Lo = evoLayout(w, h, u);
  const pw = w - Lo.L - Lo.R;
  const t0 = d.ticks[0];
  let t1 = d.ticks[n - 1];
  if (t1 - t0 < YEAR_TICKS * 0.5) t1 = t0 + YEAR_TICKS * 0.5;
  const X = (t: number) => Lo.L + ((t - t0) / (t1 - t0)) * pw;
  const step = Math.max(1, Math.floor(n / (pw * 1.2)));

  // ---- hero: speed against the founders, in percent --------------------------------------------------------------
  const heroIdx = HERO.map((x) => x.index).filter((i) => hasData(d, i));
  const [rLo, rHi] = range(d, heroIdx, pct, true, 6);
  const stepY = niceStep(rHi - rLo, 3);
  const yLo = Math.floor(rLo / stepY) * stepY;
  const yHi = Math.ceil((rHi + (rHi - rLo) * 0.2) / stepY) * stepY;
  const HY = (p: number) => Lo.heroB - ((p - yLo) / (yHi - yLo)) * (Lo.heroB - Lo.heroT);

  g.font = `500 ${12 * u}px ${SANS}`;
  g.textAlign = 'right';
  g.lineWidth = 1;
  for (let v = yLo; v <= yHi + 1e-9; v += stepY) {
    const y = Math.round(HY(v)) + 0.5;
    g.strokeStyle = Math.abs(v) < 1e-9 ? 'rgba(239,230,208,0.3)' : 'rgba(239,230,208,0.08)';
    if (Math.abs(v) < 1e-9) g.setLineDash([4 * u, 3 * u]);
    g.beginPath();
    g.moveTo(Lo.L, y);
    g.lineTo(Lo.L + pw, y);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = PAPER_DIM;
    g.fillText(Math.abs(v) < 1e-9 ? '0%' : fmtPct(v).replace('.0', ''), Lo.L - 8 * u, y);
  }
  g.font = `italic 400 ${13 * u}px ${SERIF}`;
  g.fillStyle = PAPER_DIM;
  g.textAlign = 'right';
  // keep the label on the side of the baseline the lines are not on
  const endVals = heroIdx.map((i) => latest(d, i)).filter((v) => Number.isFinite(v)).map(pct);
  const endMean = endVals.length ? endVals.reduce((a, b) => a + b, 0) / endVals.length : 0;
  g.fillText('founders', Lo.L + pw - 4 * u, HY(0) + (endMean >= 0 ? 9 * u : -9 * u));
  g.textAlign = 'left';
  g.fillText('Mean speed, against the founders', Lo.L + 6 * u, Lo.heroT + 8 * u);

  // x axis: years
  g.font = `500 ${12 * u}px ${SANS}`;
  g.textAlign = 'center';
  g.fillStyle = PAPER_DIM;
  const spanYears = (t1 - t0) / YEAR_TICKS;
  const ystep = niceStepInt(spanYears, 8);
  const y0 = yearOfTick(t0), y1 = yearOfTick(t1);
  const yearLines: number[] = [];
  for (let yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
    const x = X(yearStartTick(yr));
    if (x < Lo.L + 2 || x > Lo.L + pw - 4 * u) continue;
    yearLines.push(x);
    g.strokeStyle = 'rgba(239,230,208,0.22)';
    g.beginPath();
    g.moveTo(Math.round(x) + 0.5, Lo.heroB);
    g.lineTo(Math.round(x) + 0.5, Lo.heroB + 4 * u);
    g.stroke();
    g.fillText(String(yr), x, Lo.heroB + 13 * u);
  }
  g.textAlign = 'left';
  g.font = `italic 400 ${13 * u}px ${SERIF}`;
  g.fillText('year', 2, Lo.heroB + 13 * u);
  g.strokeStyle = 'rgba(239,230,208,0.22)';
  g.beginPath();
  g.moveTo(Lo.L, Math.round(Lo.heroB) + 0.5);
  g.lineTo(Lo.L + pw, Math.round(Lo.heroB) + 0.5);
  g.stroke();

  // the three speed lines
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const ends: { y: number; text: string; color: string; x: number }[] = [];
  for (const hh of HERO) {
    if (!hasData(d, hh.index)) continue;
    const vals = d.series[hh.index];
    strokeSeries(g, d.ticks, vals, X, (v) => HY(pct(v)), step);
    g.lineWidth = 2 * u;
    g.strokeStyle = SPECIES_COLORS[hh.sp];
    g.stroke();
    const last = latest(d, hh.index);
    // find the x of the last finite point
    let li = n - 1;
    while (li > 0 && !Number.isFinite(vals[li])) li--;
    const ex = X(d.ticks[li]), ey = HY(pct(last));
    g.beginPath();
    g.arc(ex, ey, 3 * u, 0, Math.PI * 2);
    g.fillStyle = SPECIES_COLORS[hh.sp];
    g.fill();
    ends.push({ y: ey, x: ex, text: fmtPct(pct(last)), color: SPECIES_COLORS[hh.sp] });
  }
  // end labels, nudged apart so they never overlap
  ends.sort((a, b) => a.y - b.y);
  const gapY = 14 * u;
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gapY) ends[i].y = ends[i - 1].y + gapY;
  g.font = `700 ${13 * u}px ${SANS}`;
  g.textAlign = 'left';
  for (const e of ends) {
    g.fillStyle = e.color;
    g.fillText(e.text, Lo.L + pw + 9 * u, e.y);
  }

  // ---- small multiples: size and coat darkness -------------------------------------------------------------------
  const panels = panelsFor(d);
  const cols = Math.max(1, panels.length);
  const gutter = 10 * u;
  const rowL = Lo.L - 30 * u;
  const rowW = Lo.L + pw + Lo.R - 8 * u - rowL;
  const colW = (rowW - gutter * (cols - 1)) / cols;
  const panelH = Lo.rowB - Lo.rowT;
  let hoverIdx = -1;
  const hoverTick = hoverX >= Lo.L && hoverX <= Lo.L + pw ? t0 + ((hoverX - Lo.L) / pw) * (t1 - t0) : NaN;
  if (Number.isFinite(hoverTick)) {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (d.ticks[mid] < hoverTick) lo = mid + 1; else hi = mid;
    }
    hoverIdx = Math.max(0, Math.min(n - 1, lo > 0 && hoverTick - d.ticks[lo - 1] < (d.ticks[lo] ?? Infinity) - hoverTick ? lo - 1 : lo));
  }

  panels.forEach((p, ci) => {
    const x0 = rowL + ci * (colW + gutter);
    const x1 = x0 + colW;
    roundRect(g, x0, Lo.rowT, colW, panelH, 7 * u);
    g.fillStyle = 'rgba(239,230,208,0.045)';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(239,230,208,0.09)';
    g.stroke();

    const isCoat = p.coatSp !== undefined;
    const keyW = isCoat ? 8 * u : 0;
    const px0 = x0 + 9 * u + (isCoat ? keyW + 5 * u : 0);
    const px1 = x1 - 9 * u;
    const py0 = Lo.rowT + 24 * u, py1 = Lo.rowB - 9 * u;
    const PX = (t: number) => px0 + ((t - t0) / (t1 - t0)) * (px1 - px0);

    // title and latest value(s)
    g.font = `500 ${12 * u}px ${SANS}`;
    g.textAlign = 'left';
    g.fillStyle = PAPER_DIM;
    g.fillText(p.title, x0 + 9 * u, Lo.rowT + 12 * u);
    g.textAlign = 'right';
    g.font = `700 ${12 * u}px ${SANS}`;
    if (isCoat) {
      const v = latest(d, p.indices[0]);
      g.fillStyle = '#EFE6D0';
      g.fillText(v.toFixed(2), x1 - 9 * u, Lo.rowT + 12 * u);
    } else {
      let cx = x1 - 9 * u;
      for (const k of [...p.indices].reverse()) {
        const tdef = TRAITS[k];
        const txt = fmtPct(pct(latest(d, k)));
        g.fillStyle = SPECIES_COLORS[tdef.sp];
        g.fillText(txt, cx, Lo.rowT + 12 * u);
        cx -= g.measureText(txt).width + 8 * u;
      }
    }

    // y mapping
    let PY: (v: number) => number;
    if (isCoat) {
      const [lo, hi] = range(d, p.indices, (v) => v, false, 0.24);
      let a = lo - 0.04, b = hi + 0.04;
      if (a < 0) { b -= a; a = 0; }
      if (b > 1) { a -= b - 1; b = 1; }
      a = Math.max(0, a);
      PY = (v) => py1 - ((v - a) / (b - a)) * (py1 - py0);
      // the colour key: what the coat looks like from the top of the range to the bottom
      const grad = g.createLinearGradient(0, py0, 0, py1);
      grad.addColorStop(0, coatColor(p.coatSp!, b));
      grad.addColorStop(1, coatColor(p.coatSp!, a));
      roundRect(g, x0 + 9 * u, py0, keyW, py1 - py0, 3 * u);
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = 'rgba(239,230,208,0.35)';
      g.lineWidth = 1;
      g.stroke();
    } else {
      const [lo, hi] = range(d, p.indices, pct, true, 4);
      const padv = (hi - lo) * 0.12;
      PY = (v) => py1 - ((pct(v) - (lo - padv)) / (hi - lo + 2 * padv)) * (py1 - py0);
      // 0% line
      const yz = Math.round(py1 - ((0 - (lo - padv)) / (hi - lo + 2 * padv)) * (py1 - py0)) + 0.5;
      g.strokeStyle = 'rgba(239,230,208,0.28)';
      g.setLineDash([3 * u, 3 * u]);
      g.beginPath();
      g.moveTo(px0, yz);
      g.lineTo(px1, yz);
      g.stroke();
      g.setLineDash([]);
    }

    // year hairlines
    g.strokeStyle = 'rgba(239,230,208,0.06)';
    g.lineWidth = 1;
    for (const yx of yearLines) {
      const x = Math.round(px0 + ((yx - Lo.L) / pw) * (px1 - px0)) + 0.5;
      g.beginPath();
      g.moveTo(x, py0);
      g.lineTo(x, py1);
      g.stroke();
    }

    const pstep = Math.max(1, Math.floor(n / ((px1 - px0) * 1.2)));
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (isCoat) {
      // the line is drawn in the coat colour it implies, cased in light so dark coats stay visible on dark glass
      const vals = d.series[p.indices[0]];
      const seg = (from: number, to: number) => {
        g.beginPath();
        g.moveTo(PX(d.ticks[from]), PY(vals[from]));
        g.lineTo(PX(d.ticks[to]), PY(vals[to]));
      };
      const pts: number[] = [];
      for (let i = 0; i < n; i += pstep) if (Number.isFinite(vals[i])) pts.push(i);
      if (Number.isFinite(vals[n - 1]) && pts[pts.length - 1] !== n - 1) pts.push(n - 1);
      g.strokeStyle = 'rgba(239,230,208,0.6)';
      g.lineWidth = 5 * u;
      g.beginPath();
      pts.forEach((i, k) => {
        if (k === 0 || i - pts[k - 1] > pstep * 3) g.moveTo(PX(d.ticks[i]), PY(vals[i]));
        else g.lineTo(PX(d.ticks[i]), PY(vals[i]));
      });
      g.stroke();
      g.lineWidth = 3.4 * u;
      for (let k = 1; k < pts.length; k++) {
        if (pts[k] - pts[k - 1] > pstep * 3) continue;
        g.strokeStyle = coatColor(p.coatSp!, (vals[pts[k]] + vals[pts[k - 1]]) / 2);
        seg(pts[k - 1], pts[k]);
        g.stroke();
      }
      const li = pts[pts.length - 1];
      g.beginPath();
      g.arc(PX(d.ticks[li]), PY(vals[li]), 3.4 * u, 0, Math.PI * 2);
      g.fillStyle = coatColor(p.coatSp!, vals[li]);
      g.fill();
      g.strokeStyle = 'rgba(239,230,208,0.85)';
      g.lineWidth = 1.3 * u;
      g.stroke();
    } else {
      for (const k of p.indices) {
        strokeSeries(g, d.ticks, d.series[k], PX, PY, pstep);
        g.lineWidth = 1.8 * u;
        g.strokeStyle = SPECIES_COLORS[TRAITS[k].sp];
        g.stroke();
      }
    }
  });

  // ---- hover crosshair --------------------------------------------------------------------------------------------
  if (hoverIdx >= 0) {
    const x = Math.round(X(d.ticks[hoverIdx])) + 0.5;
    g.strokeStyle = 'rgba(239,230,208,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, Lo.heroT);
    g.lineTo(x, Lo.heroB);
    g.stroke();
    for (const hh of HERO) {
      const v = d.series[hh.index]?.[hoverIdx];
      if (!Number.isFinite(v)) continue;
      g.beginPath();
      g.arc(x, HY(pct(v)), 3.4 * u, 0, Math.PI * 2);
      g.fillStyle = SPECIES_COLORS[hh.sp];
      g.fill();
      g.strokeStyle = 'rgba(20,16,10,0.8)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
  return hoverIdx;
}

/** Tooltip rows for a hover index: [color, label, value]. */
export function evoTipRows(d: EvoData, idx: number): { color: string; label: string; value: string }[] {
  const rows: { color: string; label: string; value: string }[] = [];
  for (const t of TRAITS) {
    const v = d.series[t.index]?.[idx];
    if (!Number.isFinite(v)) continue;
    rows.push({
      color: SPECIES_COLORS[t.sp],
      label: t.label.replace(' coat darkness', ' coat'),
      value: t.kind === 'coat' ? v.toFixed(2) : fmtPct(pct(v)),
    });
  }
  return rows;
}
