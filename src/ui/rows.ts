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
  /** Log scale inside each row: every species row runs from 1 up to a round number at the top (a count of zero sits on the floor). */
  log: boolean;
  /** Draw the slim grass row under the species rows (default true). A two-column chart gives it to the second column only. */
  grassRow?: boolean;
}

/** Room left of the plot for the row's name (in its colour) and its axis numbers, and right of it for the current value. */
const GUTTER_L = 136;
const GUTTER_R = 46;

export function rowsPlot(w: number, h: number, u: number): { l: number; r: number; t: number; b: number } {
  return { l: GUTTER_L * u, r: w - GUTTER_R * u, t: 5 * u, b: h - 22 * u };
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
export function drawRows(g: CanvasRenderingContext2D, w: number, h: number, u: number, d: RowsData, hoverX: number, markerHit: number = -1): number {
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

  const withGrass = d.grassRow !== false;
  const rows: ({ kind: 'sp'; sp: number } | { kind: 'grass' })[] = [...d.species.map((sp) => ({ kind: 'sp' as const, sp })), ...(withGrass ? [{ kind: 'grass' as const }] : [])];
  const gap = 5 * u;
  // species rows share the height equally; the grass row is a little slimmer
  const GRASS_W = 0.86;
  const unitH = (P.b - P.t - gap * (rows.length - 1)) / (d.species.length + (withGrass ? GRASS_W : 0));
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
    const py0 = top + 6 * u, py1 = bottom - 4 * u;
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
      // grass is a fraction of full cover; its band is scaled to its own range so the seasonal wave shows
      const span = Math.max(hi - lo, 0.08);
      const mid = (hi + lo) / 2;
      aLo = Math.max(0, Math.floor((mid - span * 0.62) * 20) / 20);
      aHi = Math.min(Math.max(1, d.grassMax), Math.ceil((mid + span * 0.62) * 20) / 20);
      if (aHi - aLo < 0.1) aHi = aLo + 0.1;
    } else {
      [aLo, aHi] = axisRange(lo, hi, 0.18);
    }
    // log: the floor is 1 (zero cannot be drawn on a log axis, so a count of zero sits on the floor), the top a round number
    const useLog = d.log && !isGrass;
    if (useLog) {
      aLo = Math.max(1, aLo);
      if (aHi < aLo * 1.5) aHi = aLo * 2;
    }
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
    const fmtAxis = (v: number) => (isGrass ? v.toFixed(2).replace(/0$/, '') : fmtInt(v));
    const tall = bottom - top >= 28 * u;
    // the row's numbers wear its colour, high at the top of the row and low at its foot, in the gutter beside the plot (never over a line)
    g.fillStyle = hexA(color, 0.92);
    g.fillText(fmtAxis(aHi), P.l - 7 * u, top + (tall ? 7 : 8) * u);
    if (tall) {
      // the low number is quieter, so a row's floor and the next row's ceiling never read as one column of figures
      g.fillStyle = hexA(color, 0.5);
      g.fillText(fmtAxis(aLo), P.l - 7 * u, bottom - 7 * u);
    }

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

    // the row's name sits in the left gutter and its current value in the right one, so no line ever runs through a word
    const nameSize = (small ? 11.5 : 12.5) * u;
    const label = isGrass ? 'Grass cover' : SPECIES_NAMES[row.sp];
    g.font = axisFont;
    const room = P.l - 7 * u - g.measureText(fmtAxis(aHi)).width - 8 * u - 3 * u;
    g.save();
    g.textAlign = 'left';
    let size = nameSize;
    g.font = `500 ${size}px ${SANS}`;
    for (let tries = 0; tries < 6 && g.measureText(label).width > room && size > 9 * u; tries++) {
      size -= 0.75 * u;
      g.font = `500 ${size}px ${SANS}`;
    }
    g.fillStyle = color;
    g.fillText(label, 3 * u, (py0 + py1) / 2 + (tall ? 0 : 1 * u));
    const lastV = vals[n - 1];
    const endY = Math.max(top + 8 * u, Math.min(bottom - 8 * u, Y(lastV)));
    g.font = `700 ${nameSize}px ${SANS}`;
    g.fillStyle = '#EFE6D0';
    g.fillText(isGrass ? `${Math.round((lastV / (d.grassMax > 1.0001 ? d.grassMax : 1)) * 100)}%` : fmtInt(lastV), P.r + 7 * u, endY);
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
  for (let i = 0; i < d.markers.length; i++) {
    const m = d.markers[i];
    if (m.tick < t0 || m.tick > t1) continue;
    const x = X(m.tick);
    if (i === markerHit) {
      // the marker under the pointer: a larger diamond in a ring, so it is clear which event the tooltip is reading
      const r = 5.6 * u;
      g.beginPath();
      g.moveTo(x, P.b - r);
      g.lineTo(x + r, P.b);
      g.lineTo(x, P.b + r);
      g.lineTo(x - r, P.b);
      g.closePath();
      g.fillStyle = m.major ? GOLD : '#EFE6D0';
      g.fill();
      g.strokeStyle = 'rgba(20,16,10,0.85)';
      g.lineWidth = 1.4;
      g.stroke();
    } else if (m.major) {
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
