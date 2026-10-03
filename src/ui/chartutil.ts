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
