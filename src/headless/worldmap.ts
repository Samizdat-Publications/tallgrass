// Debug: render a top-down map of a generated world to a PPM (convert with ffmpeg).
import { writeFileSync } from 'node:fs';
import { generateWorld, sampleHeight } from '../sim/world';

const seed = Number(process.argv[2] ?? 1);
const out = process.argv[3] ?? `scratch/world_${seed}.ppm`;
const t0 = performance.now();
const w = generateWorld(seed);
const ms = performance.now() - t0;
const n = w.n;
const img = Buffer.alloc(n * n * 3);
let hmin = 1e9, hmax = -1e9;
for (const h of w.height) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const c = j * n + i;
  const row = n - 1 - j; // north up
  const o = (row * n + i) * 3;
  const x = (i + 0.5) * w.cell, y = (j + 0.5) * w.cell;
  const h = (sampleHeight(w.height, w.hn, w.cell, x, y) - hmin) / (hmax - hmin);
  const hx = sampleHeight(w.height, w.hn, w.cell, x + 1, y) - sampleHeight(w.height, w.hn, w.cell, x - 1, y);
  const shade = Math.max(0.4, Math.min(1.2, 0.85 - hx * 0.35));
  let r: number, g: number, b: number;
  if (w.water[c]) { r = 60; g = 110; b = 170; }
  else {
    const k = w.capacity[c];
    r = 150 + 60 * (1 - k); g = 120 + 70 * k; b = 60;
    r = r * (0.7 + 0.3 * h); g = g * (0.7 + 0.3 * h); b = b * (0.7 + 0.3 * h);
    if (w.cover[c] > 0.35) { r *= 0.55; g *= 0.75; b *= 0.55; }
  }
  img[o] = Math.min(255, r * shade); img[o + 1] = Math.min(255, g * shade); img[o + 2] = Math.min(255, b * shade);
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${n} ${n}\n255\n`), img]));
let waterCells = 0; for (const v of w.water) waterCells += v;
console.log(JSON.stringify({ seed, ms: Math.round(ms), hmin: hmin.toFixed(1), hmax: hmax.toFixed(1), waterCells,
  trees: w.trees.length / 4, shrubs: w.shrubs.length / 3, ponds: w.ponds.length / 4,
  meanCap: (w.capacity.reduce((a, b) => a + b, 0) / (n * n)).toFixed(3) }));
