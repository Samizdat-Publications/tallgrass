// Unit test for the landform snow field (r-snow): it must carry structure at several scales, hold hollows and shed crests.
// Run: npx tsx src/render/snowland.test.ts
import { generateWorld } from '../sim/world';
import { buildSnowLand } from './snowland';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}

for (const seed of [1, 7, 42]) {
  const w = generateWorld(seed);
  const f = buildSnowLand(w);
  const n = w.n;
  let lo = 255, hi = 0, sum = 0;
  for (let k = 0; k < f.length; k++) { lo = Math.min(lo, f[k]); hi = Math.max(hi, f[k]); sum += f[k]; }
  const mean = sum / f.length;
  let v = 0;
  for (let k = 0; k < f.length; k++) v += (f[k] - mean) * (f[k] - mean);
  const sd = Math.sqrt(v / f.length);
  console.log(`seed ${seed}: mean ${mean.toFixed(1)} sd ${sd.toFixed(1)} range ${lo}..${hi}`);
  ok(sd > 30, `seed ${seed}: the field has real spread (sd ${sd.toFixed(1)})`);
  ok(lo < 50 && hi > 205, `seed ${seed}: it reaches both bare crests and full hollows (${lo}..${hi})`);
  ok(Math.abs(mean - 128) < 28, `seed ${seed}: it is roughly balanced about neutral (mean ${mean.toFixed(1)})`);
  // several scales: the field correlates at short lags and the correlation decays over longer ones
  const cell = w.cell;
  const lag = (m: number): number => {
    const d = Math.max(1, Math.round(m / cell));
    let a = 0, c = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i + d < n; i++) { a += (f[j * n + i] - mean) * (f[j * n + i + d] - mean); c++; }
    return a / c / (sd * sd);
  };
  const r4 = lag(4), r16 = lag(16), r64 = lag(64);
  console.log(`  lag correlation 4 m ${r4.toFixed(2)}, 16 m ${r16.toFixed(2)}, 64 m ${r64.toFixed(2)}`);
  ok(r4 > 0.5 && r16 < r4 && r64 < r16, `seed ${seed}: structure decays with distance across scales (${r4.toFixed(2)}, ${r16.toFixed(2)}, ${r64.toFixed(2)})`);
  // a hollow holds more than a crest: the lowest 5 percent of the ground vs the highest 5 percent
  const hs: number[] = [];
  for (let k = 0; k < f.length; k++) hs.push(w.height[Math.floor(k / n) * w.hn + (k % n)]);
  const order = hs.map((_, k) => k).sort((a, b) => hs[a] - hs[b]);
  const m = Math.floor(order.length * 0.05);
  let low = 0, high = 0;
  for (let q = 0; q < m; q++) { low += f[order[q]]; high += f[order[order.length - 1 - q]]; }
  ok(low / m > high / m, `seed ${seed}: lowest ground holds more snow than the highest (${(low / m).toFixed(0)} vs ${(high / m).toFixed(0)})`);
}
if (failures) { console.error(failures + ' failures'); process.exit(1); }
console.log('snowland: ok');
