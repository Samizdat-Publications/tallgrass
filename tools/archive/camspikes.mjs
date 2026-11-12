// (frames at and just after a cut are left out) Lists the biggest frame-to-frame camera acceleration spikes of a saved camera log (tools/camlog.mjs format).
// node tools/camspikes.mjs review/wip/cam/before-v2.json [count=25] [angular]   (angular: the biggest view direction turn rates instead)
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const L = j.log ?? j, S = j.stride ?? 9, n = L.length / S, top = Number(process.argv[3] ?? 25);
const rows = [];
const ang = process.argv[4] === 'angular';
const dirAt = (i) => { const o = i * S; const dx = L[o + 5] - L[o + 2], dy = L[o + 6] - L[o + 3], dz = L[o + 7] - L[o + 4], l = Math.hypot(dx, dy, dz) || 1; return [dx / l, dy / l, dz / l]; };
for (let i = 2; i < n; i++) {
  const o = i * S, dt = L[o + 1];
  const pos = (k) => [L[(i - k) * S + 2], L[(i - k) * S + 3], L[(i - k) * S + 4]];
  const a = pos(0), b = pos(1), c = pos(2);
  const v1 = a.map((x, k) => (x - b[k]) / dt), v0 = b.map((x, k) => (x - c[k]) / L[(i - 1) * S + 1]);
  const acc = Math.hypot(...v1.map((x, k) => x - v0[k])) / dt;
  let nearCut = false;
  for (let k = 0; k < 4; k++) if (i - k - 1 >= 0 && L[(i - k) * S + 8] !== L[(i - k - 1) * S + 8]) nearCut = true;
  if (nearCut) continue;
  if (ang) { const a = dirAt(i), b = dirAt(i - 1); const w = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / dt; rows.push({ t: +L[o].toFixed(2), i, rateRadPerS: +w.toFixed(2), dist: +Math.hypot(L[o + 5] - L[o + 2], L[o + 6] - L[o + 3], L[o + 7] - L[o + 4]).toFixed(1), acc: Math.round(w * 1000) }); continue; }
  rows.push({ t: +L[o].toFixed(2), i, dtMs: Math.round(dt * 1000), speed: +Math.hypot(...v1).toFixed(1), acc: Math.round(acc), cuts: L[o + 8] });
}
rows.sort((x, y) => y.acc - x.acc);
console.log(rows.slice(0, top).map((r) => JSON.stringify(r)).join('\n'));
