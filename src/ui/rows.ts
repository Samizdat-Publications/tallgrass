// The expanded population view as small multiples: one row per species on a shared time axis, each scaled to its own
// range with its real numbers on the axis, so every species shows its swings. Grass gets a slim row of its own.
import { SPECIES_NAMES, YEAR_TICKS } from '../sim/types';
import { yearOfTick, yearStartTick, fmtInt } from './describe';
import { niceStep, niceStepInt, hexA } from './chartutil';
import { GOLD, GRASS_COLOR, PAPER_DIM, SANS, SERIF, SPECIES_COLORS } from './palette';

export interface RowsData {
  ticks: number[];
  /** Population per species, indexed by species id. */
  pops: number[][];
  /** Species rows to draw, top to bottom. */
  species: number[];
  grass: number[];
  grassMax: number;
  markers: { tick: number; major: boolean }[];
  /** Log scale inside each row (only where the row's range stays above zero). */
  log: boolean;
}

export function rowsPlot(w: number, h: number, u: number): { l: number; r: number; t: number; b: number } {
  return { l: 46 * u, r: w - 14 * u, t: 5 * u, b: h - 22 * u };
}

/** A round-number axis range around a series: [lo, hi]. */
function axisRange(lo: number, hi: number, minSpanFrac: number): [number, number] {
  let a = lo, b = hi;
  const minSpan = Math.max(Math.abs(b) * minSpanFrac, 4);
  if (b - a < minSpan) {
    const mid = (a + b) / 2;
    a = mid - minSpan / 2;
    b = mid + minSpan / 2;
  }
  const step = niceStep(b - a, 2);
  a = Math.max(0, Math.floor(a / step) * step);
  b = Math.ceil(b / step) * step;
  if (b <= a) b = a + step;
  return [a, b];
}

/** Draws the rows and returns the hovered index (-1 when the pointer is outside the plot). */
export function drawRows(g: CanvasRenderingContext2D, w: number, h: number, u: number, d: RowsData, hoverX: number): number {
  const n = d.ticks.length;
  const P = rowsPlot(w, h, u);
  const pw = P.r - P.l;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const t0 = d.ticks[0];
  let t1 = d.ticks[n - 1];
  if (t1 - t0 < YEAR_TICKS * 0.5) t1 = t0 + YEAR_TICKS * 0.5;
  const X = (t: number) => P.l + ((t - t0) / (t1 - t0)) * pw;
  const step = Math.max(1, Math.floor(n / (pw * 1.2)));

  const rows: ({ kind: 'sp'; sp: number } | { kind: 'grass' })[] = [...d.species.map((sp) => ({ kind: 'sp' as const, sp })), { kind: 'grass' as const }];
  const gap = 5 * u;
  // species rows share the height equally; the grass row is a little slimmer
  const GRASS_W = 0.62;
  const unitH = (P.b - P.t - gap * (rows.length - 1)) / (d.species.length + GRASS_W);
  const rowTop: number[] = [];
  const rowHs: number[] = [];
  let yy = P.t;
  for (const r of rows) {
    const hh = Math.max(16 * u, unitH * (r.kind === 'grass' ? GRASS_W : 1));
    rowTop.push(yy);
    rowHs.push(hh);
    yy += hh + gap;
  }
  const small = unitH < 40 * u;
  const axisFont = `500 ${(small ? 11 : 12) * u}px ${SANS}`;

  // year hairlines through every row, labelled once under the last row
  const spanYears = (t1 - t0) / YEAR_TICKS;
  const ystep = niceStepInt(spanYears, 8);
  const y0 = yearOfTick(t0), y1 = yearOfTick(t1);
  const yearX: number[] = [];
  for (let yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
    const x = X(yearStartTick(yr));
    if (x < P.l + 2 || x > P.r - 4 * u) continue;
    yearX.push(x);
  }

  // event hairlines behind the data
  for (const m of d.markers) {
    if (m.tick < t0 || m.tick > t1) continue;
    const x = Math.round(X(m.tick)) + 0.5;
    g.strokeStyle = m.major ? hexA(GOLD, 0.26) : 'rgba(239,230,208,0.1)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, P.t);
    g.lineTo(x, P.b);
    g.stroke();
  }

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

  rows.forEach((row, i) => {
    const top = rowTop[i];
    const bottom = top + rowHs[i];
    const py0 = top + 4 * u, py1 = bottom - 3 * u;
    const isGrass = row.kind === 'grass';
    const vals = isGrass ? d.grass : d.pops[row.sp];
    const color = isGrass ? GRASS_COLOR : SPECIES_COLORS[row.sp];

    // this row's own range
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < n; k++) {
      const v = vals[k];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    let aLo: number, aHi: number;
    if (isGrass) {
      aLo = 0;
      aHi = d.grassMax > 1.0001 ? Math.ceil(d.grassMax * 10) / 10 : 1;
    } else {
      [aLo, aHi] = axisRange(lo, hi, 0.18);
    }
    const useLog = d.log && !isGrass && aLo >= 1;
    const Y = useLog
      ? (v: number) => py1 - ((Math.log10(Math.max(v, aLo)) - Math.log10(aLo)) / (Math.log10(aHi) - Math.log10(aLo))) * (py1 - py0)
      : (v: number) => py1 - ((v - aLo) / (aHi - aLo)) * (py1 - py0);

    // row separator and the numbers on its axis
    g.strokeStyle = 'rgba(239,230,208,0.1)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(P.l, Math.round(bottom) + 0.5);
    g.lineTo(P.r, Math.round(bottom) + 0.5);
    g.stroke();
    g.font = axisFont;
    g.textAlign = 'right';
    g.fillStyle = PAPER_DIM;
    const fmtAxis = (v: number) => (isGrass ? String(Math.round(v * 100) / 100) : fmtInt(v));
    g.fillText(fmtAxis(aHi), P.l - 7 * u, py0 + 1 * u);
    g.fillText(fmtAxis(aLo), P.l - 7 * u, py1 - 1 * u);

    // year hairlines
    g.strokeStyle = 'rgba(239,230,208,0.05)';
    for (const x of yearX) {
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, top);
      g.lineTo(Math.round(x) + 0.5, bottom);
      g.stroke();
    }

    // area under the line and the line itself
    g.beginPath();
    g.moveTo(X(d.ticks[0]), py1);
    for (let k = 0; k < n; k += step) g.lineTo(X(d.ticks[k]), Y(vals[k]));
    g.lineTo(X(d.ticks[n - 1]), Y(vals[n - 1]));
    g.lineTo(X(d.ticks[n - 1]), py1);
    g.closePath();
    const grad = g.createLinearGradient(0, py0, 0, py1);
    grad.addColorStop(0, hexA(color, isGrass ? 0.2 : 0.22));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fill();
    g.beginPath();
    for (let k = 0; k < n; k += step) {
      const x = X(d.ticks[k]), y = Y(vals[k]);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineTo(X(d.ticks[n - 1]), Y(vals[n - 1]));
    g.lineWidth = (isGrass ? 1.3 : 1.7) * u;
    g.strokeStyle = isGrass ? hexA(color, 0.75) : color;
    g.stroke();
    g.beginPath();
    g.arc(X(d.ticks[n - 1]), Y(vals[n - 1]), 2.6 * u, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();

    // the row's name and its current value, with a soft halo so they hold over the line
    g.save();
    g.shadowColor = 'rgba(18,13,7,0.95)';
    g.shadowBlur = 4 * u;
    g.textAlign = 'left';
    g.font = `500 ${(small ? 11.5 : 12.5) * u}px ${SANS}`;
    g.fillStyle = color;
    g.fillText(isGrass ? 'Grass, 0 to 1' : SPECIES_NAMES[row.sp], P.l + 7 * u, top + 8.5 * u);
    if (!isGrass) {
      g.textAlign = 'right';
      g.font = `700 ${(small ? 11.5 : 12.5) * u}px ${SANS}`;
      g.fillStyle = '#EFE6D0';
      g.fillText(fmtInt(vals[n - 1]), P.r - 5 * u, top + 8.5 * u);
    }
    g.restore();

    if (hoverIdx >= 0) hoverDots.push({ x: X(d.ticks[hoverIdx]), y: Y(vals[hoverIdx]), color });
  });

  // x axis under the last row
  g.font = `500 ${12 * u}px ${SANS}`;
  g.textAlign = 'center';
  g.fillStyle = PAPER_DIM;
  for (let yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
    const x = X(yearStartTick(yr));
    if (x < P.l + 2 || x > P.r - 4 * u) continue;
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

  // marker glyphs on the axis, over the lines
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

  // hover crosshair through every row
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
      g.arc(dot.x, dot.y, 3.2 * u, 0, Math.PI * 2);
      g.fillStyle = dot.color;
      g.fill();
      g.strokeStyle = 'rgba(20,16,10,0.8)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
  return hoverIdx;
}
