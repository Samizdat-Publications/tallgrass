// The expanded graph's "Pair" view: two species on one chart over the same time window, each scaled to its own range, with a left axis in
// the first species' colour and a right axis in the second's. Laid on top of each other like this the lag of a predator behind its prey
// can be read, which eleven strips with eleven axes of their own cannot show. Pure drawing, no DOM.
import { SPECIES_NAMES, YEAR_TICKS } from '../sim/types';
import { yearOfTick, yearStartTick, fmtInt, seasonOfTick } from './describe';
import { niceStepInt, hexA, strokeWithGaps, fillSolidRuns } from './chartutil';
import { awayRows, holdAway, isMigrant } from './away';
import { drawClimateBand } from './rows';
import { GOLD, PAPER_DIM, SANS, SERIF, SPECIES_COLORS } from './palette';

export interface PairData {
  ticks: number[];
  /** Population per species, indexed by species id. */
  pops: number[][];
  /** The species on the left axis and the species on the right axis. */
  a: number;
  b: number;
  markers: { tick: number; major: boolean }[];
  climate?: number[];
  mega?: number[];
}

export interface PairAxis {
  lo: number;
  hi: number;
  step: number;
}

/**
 * A round-number axis for a series that runs from `lo` to `hi`: always four equal steps from `lo` to `hi` (so two axes of the pair share
 * five gridlines), the floor never below zero, and never narrower than about a third of the series' top (a wolf count of 18 to 17 stays
 * a quiet line and does not fill the chart).
 */
export function pairAxis(lo: number, hi: number): PairAxis {
  let a = Number.isFinite(lo) ? lo : 0;
  let b = Number.isFinite(hi) ? hi : 0;
  const minSpan = Math.max(Math.abs(b) * 0.3, 4);
  if (b - a < minSpan) {
    const mid = (a + b) / 2;
    a = mid - minSpan / 2;
    b = mid + minSpan / 2;
  }
  if (a < 0) { b -= a; a = 0; }
  const span = b - a;
  const p = Math.pow(10, Math.floor(Math.log10(span / 4)));
  for (const k of [1, 2, 2.5, 5, 10, 20, 25, 50, 100]) {
    const step = k * p;
    if (!Number.isInteger(step) || step * 4 < span - 1e-9) continue;
    const aLo = Math.max(0, Math.floor(a / step + 1e-9) * step);
    if (aLo + step * 4 >= b - 1e-9) return { lo: aLo, hi: aLo + step * 4, step };
  }
  const step = Math.ceil(span / 4);
  return { lo: Math.max(0, Math.floor(a)), hi: Math.max(0, Math.floor(a)) + step * 4, step };
}

/** Room left of the plot for the left axis and right of it for the right axis; room above for the two axis titles. */
const GUTTER = 54;

export function pairPlot(w: number, h: number, u: number): { l: number; r: number; t: number; b: number } {
  return { l: GUTTER * u, r: w - GUTTER * u, t: 26 * u, b: h - 22 * u };
}

/** The series as drawn: a visitor's away stretch is held level (and drawn faint and dashed) so it never reads as a crash. */
function seriesOf(d: PairData, sp: number): { vals: number[]; away: boolean[] | null } {
  const raw = d.pops[sp] ?? [];
  const away = isMigrant(sp) ? awayRows(sp, raw, (k) => seasonOfTick(d.ticks[k])) : null;
  return { vals: away ? holdAway(raw, away) : raw, away };
}

/** Draws the chart and returns the hovered history index (-1 when the pointer is outside the plot). */
export function drawPair(g: CanvasRenderingContext2D, w: number, h: number, u: number, d: PairData, hoverX: number): number {
  const n = d.ticks.length;
  const P = pairPlot(w, h, u);
  const pw = P.r - P.l, ph = P.b - P.t;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const t0 = d.ticks[0];
  let t1 = d.ticks[n - 1];
  if (t1 - t0 < YEAR_TICKS * 0.5) t1 = t0 + YEAR_TICKS * 0.5;
  const X = (t: number) => P.l + ((t - t0) / (t1 - t0)) * pw;
  const step = Math.max(1, Math.floor(n / (pw * 1.2)));

  // the wet and dry decades, softly, behind everything else
  if (d.climate) drawClimateBand(g, d, P, t0, t1);

  const axes = [d.a, d.b].map((sp) => {
    const s = seriesOf(d, sp);
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < n; k++) {
      if (s.away && s.away[k]) continue;
      const v = s.vals[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo > hi) { lo = 0; hi = 0; }
    return { sp, color: SPECIES_COLORS[sp] ?? PAPER_DIM, s, ax: pairAxis(lo, hi) };
  });

  // year hairlines, then four gridlines (the same height for both axes)
  const spanYears = (t1 - t0) / YEAR_TICKS;
  const ystep = niceStepInt(spanYears, 10);
  const y0 = yearOfTick(t0), y1 = yearOfTick(t1);
  const yearsAt: number[] = [];
  for (let yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
    const x = X(yearStartTick(yr));
    if (x < P.l + 2 || x > P.r - 4 * u) continue;
    yearsAt.push(yr);
  }
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(239,230,208,0.05)';
  for (const yr of yearsAt) {
    const x = Math.round(X(yearStartTick(yr))) + 0.5;
    g.beginPath();
    g.moveTo(x, P.t);
    g.lineTo(x, P.b);
    g.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const y = Math.round(P.b - (ph * i) / 4) + 0.5;
    g.strokeStyle = i === 0 ? 'rgba(239,230,208,0.22)' : 'rgba(239,230,208,0.09)';
    g.beginPath();
    g.moveTo(P.l, y);
    g.lineTo(P.r, y);
    g.stroke();
  }
  // event hairlines behind the data
  for (const m of d.markers) {
    if (m.tick < t0 || m.tick > t1) continue;
    const x = Math.round(X(m.tick)) + 0.5;
    g.strokeStyle = m.major ? hexA(GOLD, 0.24) : 'rgba(239,230,208,0.08)';
    g.beginPath();
    g.moveTo(x, P.t);
    g.lineTo(x, P.b);
    g.stroke();
  }

  // the axes: numbers in each species' colour, a thin line of its colour down its side, and its name over it
  const axFont = `500 ${12 * u}px ${SANS}`;
  axes.forEach((A, i) => {
    const right = i === 1;
    const ex = right ? P.r : P.l;
    g.strokeStyle = hexA(A.color, 0.55);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(Math.round(ex) + 0.5, P.t);
    g.lineTo(Math.round(ex) + 0.5, P.b);
    g.stroke();
    g.font = axFont;
    g.textAlign = right ? 'left' : 'right';
    g.fillStyle = hexA(A.color, 0.95);
    for (let k = 0; k <= 4; k++) {
      const v = A.ax.lo + A.ax.step * k;
      g.fillText(fmtInt(v), right ? ex + 7 * u : ex - 7 * u, P.b - (ph * k) / 4);
    }
    g.textBaseline = 'alphabetic';
    g.textAlign = right ? 'right' : 'left';
    g.font = `700 ${13 * u}px ${SANS}`;
    g.fillStyle = A.color;
    const name = SPECIES_NAMES[A.sp] ?? '';
    const nameW = g.measureText(name).width;
    const tx = right ? w - 2 * u : 2 * u;
    g.fillText(name, tx, 12 * u);
    g.font = `italic 400 ${12 * u}px ${SERIF}`;
    g.fillStyle = PAPER_DIM;
    g.fillText(right ? 'right axis' : 'left axis', tx + (right ? -(nameW + 6 * u) : nameW + 6 * u), 12 * u);
    g.textBaseline = 'middle';
  });

  // the two lines, each across the full height of its own axis
  const hoverTick = hoverX >= P.l && hoverX <= P.r ? t0 + ((hoverX - P.l) / pw) * (t1 - t0) : NaN;
  let hoverIdx = -1;
  if (Number.isFinite(hoverTick)) {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (d.ticks[mid] < hoverTick) lo = mid + 1; else hi = mid;
    }
    hoverIdx = Math.max(0, Math.min(n - 1, lo > 0 && hoverTick - d.ticks[lo - 1] < (d.ticks[lo] ?? Infinity) - hoverTick ? lo - 1 : lo));
  }
  const hoverDots: { x: number; y: number; color: string }[] = [];
  axes.forEach((A) => {
    const Y = (v: number) => P.b - ((v - A.ax.lo) / (A.ax.hi - A.ax.lo)) * ph;
    const xs: number[] = [], ys: number[] = [], aw: boolean[] = [];
    const isAway = (k: number): boolean => (A.s.away ? A.s.away[k] : false);
    for (let k = 0; k < n; k += step) { xs.push(X(d.ticks[k])); ys.push(Y(A.s.vals[k])); aw.push(isAway(k)); }
    if ((n - 1) % step !== 0) { xs.push(X(d.ticks[n - 1])); ys.push(Y(A.s.vals[n - 1])); aw.push(isAway(n - 1)); }
    const grad = g.createLinearGradient(0, P.t, 0, P.b);
    grad.addColorStop(0, hexA(A.color, 0.16));
    grad.addColorStop(1, hexA(A.color, 0));
    fillSolidRuns(g, xs, ys, aw, P.b, grad);
    strokeWithGaps(g, xs, ys, aw, A.color, 2 * u, [3 * u, 3.5 * u], 0.5);
    g.beginPath();
    g.arc(X(d.ticks[n - 1]), Y(A.s.vals[n - 1]), 2.8 * u, 0, Math.PI * 2);
    if (isAway(n - 1)) {
      g.lineWidth = 1.2 * u;
      g.strokeStyle = hexA(A.color, 0.55);
      g.setLineDash([]);
      g.stroke();
    } else {
      g.fillStyle = A.color;
      g.fill();
    }
    if (hoverIdx >= 0 && !isAway(hoverIdx)) hoverDots.push({ x: X(d.ticks[hoverIdx]), y: Y(A.s.vals[hoverIdx]), color: A.color });
  });

  // x axis labels
  g.font = axFont;
  g.textAlign = 'center';
  g.fillStyle = PAPER_DIM;
  for (const yr of yearsAt) {
    const x = X(yearStartTick(yr));
    g.strokeStyle = 'rgba(239,230,208,0.22)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(Math.round(x) + 0.5, P.b);
    g.lineTo(Math.round(x) + 0.5, P.b + 4 * u);
    g.stroke();
    g.fillText(String(yr), x, P.b + 13 * u);
  }
  g.textAlign = 'left';
  g.font = `italic 400 ${13 * u}px ${SERIF}`;
  g.fillText('year', 2, P.b + 13 * u);

  // event markers on the axis, over the lines
  for (const m of d.markers) {
    if (m.tick < t0 || m.tick > t1) continue;
    const x = X(m.tick);
    if (m.major) {
      const r = 3.6 * u;
      g.beginPath();
      g.moveTo(x, P.b - r);
      g.lineTo(x + r, P.b);
      g.lineTo(x, P.b + r);
      g.lineTo(x - r, P.b);
      g.closePath();
      g.fillStyle = GOLD;
      g.fill();
    } else {
      g.beginPath();
      g.arc(x, P.b, 2 * u, 0, Math.PI * 2);
      g.fillStyle = 'rgba(239,230,208,0.55)';
      g.fill();
    }
  }

  // hover crosshair and a dot on each line
  if (hoverIdx >= 0) {
    const x = Math.round(X(d.ticks[hoverIdx])) + 0.5;
    g.strokeStyle = 'rgba(239,230,208,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, P.t);
    g.lineTo(x, P.b);
    g.stroke();
    for (const dot of hoverDots) {
      g.beginPath();
      g.arc(dot.x, dot.y, 3.4 * u, 0, Math.PI * 2);
      g.fillStyle = dot.color;
      g.fill();
      g.strokeStyle = 'rgba(20,16,10,0.8)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
  return hoverIdx;
}

/** Pixel x of a history tick in the pair chart (same mapping as drawPair), for placing the tooltip. */
export function pairX(w: number, u: number, tick: number, ticks: number[]): number {
  const P = pairPlot(w, 0, u);
  const t0 = ticks[0];
  const t1 = Math.max(ticks[ticks.length - 1], t0 + YEAR_TICKS * 0.5);
  return P.l + ((tick - t0) / (t1 - t0)) * (P.r - P.l);
}
