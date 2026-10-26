// Headless: in the default valley, follow every wolf kill for 600 ticks and measure whether the killers stay with it.
// Usage: npx tsx tools/killwatch.ts <feedBout 0|1> [seed] [years]
import { createSim } from '../src/sim/sim';
import { Sp, St, STATE_NAMES, YEAR_TICKS } from '../src/sim/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const bout = Number(process.argv[2] ?? 0), seed = Number(process.argv[3] ?? 3), years = Number(process.argv[4] ?? 8);
const sim = createSim({ seed, params: { feedBout: bout } });
const S = sim as any, a = sim.a;
interface Watch { x: number; y: number; t0: number; prey: number; meat0: number; wolves: number[]; nearTicks: number; total: number; leftAt: number; meatAtLeave: number; away: Record<string, number> }
const watches: Watch[] = [];
const done: Watch[] = [];
let seen = new Set<string>();
const burn = YEAR_TICKS * 2;
sim.step(burn);
for (let t = 0; t < years * YEAR_TICKS; t++) {
  sim.step(1);
  // new kill carcasses
  for (let k = 0; k < S.cN; k++) {
    if (!S.cKill[k] || S.cAge[k] !== 1) continue;
    const key = `${S.cX[k].toFixed(2)},${S.cY[k].toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const wolves: number[] = [];
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf && Math.hypot(a.x[i] - S.cX[k], a.y[i] - S.cY[k]) < 8) wolves.push(i);
    if (wolves.length) watches.push({ x: S.cX[k], y: S.cY[k], t0: t, prey: S.cSp[k], meat0: S.cMeat[k], wolves, nearTicks: 0, total: 0, leftAt: -1, meatAtLeave: -1, away: {} });
  }
  for (let w = watches.length - 1; w >= 0; w--) {
    const W = watches[w];
    let near = 0, alive = 0;
    for (const i of W.wolves) {
      if (!a.alive[i]) continue;
      alive++;
      const d = Math.hypot(a.x[i] - W.x, a.y[i] - W.y);
      if (d < 12) near++;
      else { const s = STATE_NAMES[a.state[i]]; W.away[s] = (W.away[s] ?? 0) + 1; }
    }
    W.nearTicks += near; W.total += alive;
    let meat = 0;
    for (let k = 0; k < S.cN; k++) if (Math.abs(S.cX[k] - W.x) < 0.01 && Math.abs(S.cY[k] - W.y) < 0.01) meat = S.cMeat[k];
    if (W.leftAt < 0 && near === 0) { W.leftAt = t - W.t0; W.meatAtLeave = meat; }
    if (t - W.t0 >= 600) { done.push(W); watches.splice(w, 1); }
  }
  if (seen.size > 4000) seen = new Set();
}
const pr = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '-');
const by = (sp: number) => done.filter((W) => W.prey === sp);
for (const [name, sp] of [['pronghorn', Sp.Deer], ['bison', Sp.Bison], ['mule deer', Sp.MuleDeer]] as const) {
  const L = by(sp);
  if (!L.length) continue;
  const near = L.reduce((s, W) => s + W.nearTicks / Math.max(1, W.total), 0) / L.length;
  const left = L.filter((W) => W.leftAt >= 0);
  const medLeft = left.map((W) => W.leftAt).sort((p, q) => p - q)[left.length >> 1] ?? -1;
  const meatShare = left.length ? left.reduce((s, W) => s + W.meatAtLeave / W.meat0, 0) / left.length : NaN;
  const away: Record<string, number> = {};
  for (const W of L) for (const k in W.away) away[k] = (away[k] ?? 0) + W.away[k];
  const tot = Object.values(away).reduce((s, v) => s + v, 0) || 1;
  const awayTxt = Object.entries(away).sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', ');
  console.log(`feedBout ${bout} ${name}: ${L.length} kills, killers within 12 m ${pr(near * 100)}% of the 600 ticks, all gone by tick ${medLeft} (median, ${left.length}/${L.length} left), meat left when the last left ${pr(meatShare * 100)}%, away doing: ${awayTxt}`);
}
