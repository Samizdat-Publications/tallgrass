// Headless: in the default valley, for every wolf at a fresh kill, count over the next 130 ticks (about 20 s at 1x) how often it drops out of
// eating while the kill still has meat, how far it ends up from the carcass at most, and how far its sim heading turns.
// Usage: npx tsx tools/settlewatch.ts <feedSettle 0|1> [seed] [years]
import { createSim } from '../src/sim/sim';
import { Sp, St, YEAR_TICKS } from '../src/sim/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
const settle = Number(process.argv[2] ?? 0), seed = Number(process.argv[3] ?? 3), years = Number(process.argv[4] ?? 4);
const sim = createSim({ seed, params: { feedSettle: settle } });
const S = sim as any, a = sim.a;
sim.step(YEAR_TICKS * 2);
interface W { i: number; x: number; y: number; t0: number; flips: number; maxD: number; turn: number; lastSt: number; lastH: number }
const live: W[] = [];
const done: W[] = [];
const seen = new Set<string>();
for (let t = 0; t < years * YEAR_TICKS; t++) {
  sim.step(1);
  for (let k = 0; k < S.cN; k++) {
    if (!S.cKill[k] || S.cAge[k] !== 1) continue;
    const key = `${S.cX[k].toFixed(2)},${S.cY[k].toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Wolf) continue;
      if (Math.hypot(a.x[i] - S.cX[k], a.y[i] - S.cY[k]) < 10) live.push({ i, x: S.cX[k], y: S.cY[k], t0: t, flips: 0, maxD: 0, turn: 0, lastSt: a.state[i], lastH: a.heading[i] });
    }
  }
  for (let w = live.length - 1; w >= 0; w--) {
    const W = live[w], i = W.i;
    if (!a.alive[i]) { live.splice(w, 1); continue; }
    const st = a.state[i];
    if (W.lastSt === St.Eat && st !== St.Eat && st !== St.Rest) W.flips++;
    W.lastSt = st;
    let dh = a.heading[i] - W.lastH;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    W.turn += Math.abs(dh); W.lastH = a.heading[i];
    if (t - W.t0 > 8) W.maxD = Math.max(W.maxD, Math.hypot(a.x[i] - W.x, a.y[i] - W.y));
    if (t - W.t0 >= 130) { done.push(W); live.splice(w, 1); }
  }
}
const mean = (f: (w: W) => number) => done.reduce((s, w) => s + f(w), 0) / Math.max(1, done.length);
const share = (f: (w: W) => boolean) => done.filter(f).length / Math.max(1, done.length);
console.log(`feedSettle ${settle}: ${done.length} wolves at fresh kills; drops out of eating ${mean((w) => w.flips).toFixed(2)} times each (${(100 * share((w) => w.flips >= 2)).toFixed(0)}% twice or more), strays up to ${mean((w) => w.maxD).toFixed(1)} m from the carcass, sim heading turns ${(mean((w) => w.turn) * 180 / Math.PI).toFixed(0)} deg in 130 ticks`);
