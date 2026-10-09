// Small helpers shared by the population and evolution charts.

/** A "nice" tick step (1, 2, 5, 10 times a power of ten) giving about `target` ticks across `max`. */
export function niceStep(max: number, target: number): number {
  const raw = Math.max(max, 1e-9) / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** Whole-year tick spacing: 1, 2, 5, 10, 20, 50, ... */
export function niceStepInt(spanYears: number, maxTicks: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  for (const s of steps) if (spanYears / s <= maxTicks) return s;
  return 10000;
}

/** "#RRGGBB" to "rgba(r,g,b,a)". */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Linear blend of two "#RRGGBB" colors, t in 0..1. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - k) + ((y >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Rounded rectangle path. */
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Stroke a line through points, drawing every segment that touches an "away" point (a visitor that is out of the valley for the
 * season) as a faint dashed stretch, and the rest solid. `faint` is the opacity of the dashed part.
 */
export function strokeWithGaps(g: CanvasRenderingContext2D, xs: number[], ys: number[], away: boolean[], color: string, width: number, dash: [number, number], faint = 0.4): void {
  const n = xs.length;
  if (n < 2) return;
  g.lineWidth = width;
  g.strokeStyle = color;
  g.setLineDash([]);
  g.beginPath();
  let pen = false;
  for (let i = 1; i < n; i++) {
    if (away[i - 1] || away[i]) { pen = false; continue; }
    if (!pen) g.moveTo(xs[i - 1], ys[i - 1]);
    g.lineTo(xs[i], ys[i]);
    pen = true;
  }
  g.stroke();
  if (!away.some(Boolean)) return;
  g.save();
  g.setLineDash(dash);
  g.globalAlpha *= faint;
  g.beginPath();
  for (let i = 1; i < n; i++) {
    if (!(away[i - 1] || away[i])) continue;
    g.moveTo(xs[i - 1], ys[i - 1]);
    g.lineTo(xs[i], ys[i]);
  }
  g.stroke();
  g.restore();
}

/** Fill the area under a line down to `baseY`, but only under the stretches that are not away (an away gap has nothing under it). */
export function fillSolidRuns(g: CanvasRenderingContext2D, xs: number[], ys: number[], away: boolean[], baseY: number, fill: string | CanvasGradient): void {
  const n = xs.length;
  g.fillStyle = fill;
  let i = 0;
  while (i < n) {
    if (away[i]) { i++; continue; }
    let j = i;
    while (j + 1 < n && !away[j + 1]) j++;
    if (j > i) {
      g.beginPath();
      g.moveTo(xs[i], baseY);
      for (let k = i; k <= j; k++) g.lineTo(xs[k], ys[k]);
      g.lineTo(xs[j], baseY);
      g.closePath();
      g.fill();
    }
    i = j + 1;
  }
}
