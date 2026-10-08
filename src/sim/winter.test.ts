// Unit tests for winter (S11): snow depth, drift, melt, its effects on grazers, the blizzard and hardWinter events, the snapshot field,
// and the delayed spring green-up. Run: npx tsx src/sim/winter.test.ts
import { simHash as rawSimHash } from '../headless/hash';
import { Environment } from './env';
import { applyOverrides } from './params';
import { Rng } from './rng';
import { V7C_OFF, createSim, defaultParams } from './testpins';
// tests written against the pre-v8b default world: hash with the v7c and v8b additions pinned off
const simHash = (seed: number, ticks: number, p: Record<string, number> = {}): string => rawSimHash(seed, ticks, { ...V7C_OFF, ...p });
import { Sp } from './types';
import { Winter, WINTER_STEP } from './winter';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// 1. everything is off by default, and explicit zeros reproduce the default hash
{
  const p = defaultParams();
  ok(p.snowDepth === 0 && p.greenUpShift === 0, 'snowDepth and greenUpShift are off by default');
  const q = applyOverrides(defaultParams(), { snowDepth: 1, greenUpShift: 0.5 });
  ok(q.snowDepth === 1 && q.greenUpShift === 0.5, 'both params take overrides');
  const base = simHash(3, 1800);
  ok(simHash(3, 1800, { snowDepth: 0, greenUpShift: 0 }) === base, 'explicit zeros reproduce the default hash');
  const sim = createSim({ seed: 3 });
  ok(sim.winter === null, 'no winter object while snowDepth is 0');
  sim.step(10);
  const snap = sim.snapshot(true);
  ok(snap.snow === undefined, 'no snow field in the snapshot while off');
  const row = sim.sample();
  ok(row.snow_mean === 0 && row.snow_max === 0 && row.blizzards === 0 && row.hard_winters === 0, 'the snow sample columns read 0 while off');
}

// 2. turning it on draws nothing from the main stream at construction: the founders stand where they stood
{
  const a = createSim({ seed: 5 }), b = createSim({ seed: 5, params: { snowDepth: 1 } });
  let same = a.a.hi === b.a.hi;
  for (let i = 0; same && i < a.a.hi; i++) if (a.a.x[i] !== b.a.x[i] || a.a.y[i] !== b.a.y[i]) same = false;
  ok(same, 'the same founders with snow on (no main-rng draws)');
  ok(b.winter !== null && b.winter.depth.length === 1024, 'winter holds a 32 x 32 depth field');
  let lo = 0, hi = 0;
  for (const h of b.winter!.hollow) { if (h < -0.3) lo++; if (h > 0.3) hi++; }
  ok(lo > 20 && hi > 20, `the terrain has both ridges (${lo} cells) and hollows (${hi} cells)`);
}

// 3. snow builds in winter, melts in spring, and is gone by summer; drifts leave the hollows deeper than the ridges
{
  const sim = createSim({ seed: 3, params: { snowDepth: 1 } });
  const w = sim.winter!;
  let peak = 0, summerSnow = 0, endWinter = -1, maxCell = 0;
  let hollowSum = 0, hollowN = 0, ridgeSum = 0, ridgeN = 0;
  for (let t = 0; t < 3 * 1200; t += 20) {
    sim.step(20);
    const s = sim.env.state.season;
    const m = w.meanDepth();
    if (m > peak) peak = m;
    maxCell = Math.max(maxCell, w.maxDepth());
    if (s >= 1 && s < 2.8) summerSnow = Math.max(summerSnow, w.maxDepth());
    if (s >= 3.7 && s < 3.9) {
      for (let k = 0; k < 1024; k++) {
        if (w.hollow[k] > 0.3) { hollowSum += w.depth[k]; hollowN++; } else if (w.hollow[k] < -0.3) { ridgeSum += w.depth[k]; ridgeN++; }
      }
      endWinter = m;
    }
  }
  ok(peak > 0.2, `snow builds in winter (peak mean depth ${peak.toFixed(2)})`);
  ok(maxCell <= 1 + 1e-6, 'depth never exceeds 1');
  ok(summerSnow === 0, `no snow in summer or autumn (${summerSnow})`);
  ok(endWinter >= 0 && hollowN > 0 && ridgeN > 0 && hollowSum / hollowN > 1.2 * (ridgeSum / ridgeN), `late winter: hollows (${(hollowSum / hollowN).toFixed(2)}) are deeper than ridges (${(ridgeSum / ridgeN).toFixed(2)})`);
  const row = sim.sample();
  ok(row.snow_peak > 0.2 && row.blizzards >= 0, 'snow_peak is reported');
}

// 4. drift moves snow downwind and loses none, melt needs warmth, and a sheltered hollow keeps more than a ridge
{
  const sim = createSim({ seed: 3, params: { snowDepth: 1, snowStorms: 0 } });
  const w = sim.winter!, s = sim.env.state;
  s.season = 1; // outside the snowfall window
  s.warmth = 0; // nothing melts
  s.windDir = 0; // blowing toward +x
  s.windStrength = 1;
  const N = 32;
  // two interior cells in one row, one a ridge and one a hollow
  w.depth.fill(0);
  let ridge = -1, hollow = -1;
  for (let j = 4; j < 28 && (ridge < 0 || hollow < 0); j++) {
    for (let i = 4; i < 28; i++) {
      const k = j * N + i;
      // keep the two cells and their east and west neighbours apart
      if (ridge < 0 && w.hollow[k] < -0.8 && Math.abs(w.hollow[k + 1]) < 1.01) ridge = k;
      else if (hollow < 0 && w.hollow[k] > 0.8 && ridge >= 0 && Math.abs(k - ridge) > 3) hollow = k;
    }
  }
  ok(ridge >= 0 && hollow >= 0, 'found a ridge cell and a hollow cell');
  w.depth[ridge] = 0.8;
  w.depth[hollow] = 0.8;
  w.step();
  ok(w.depth[ridge] < 0.8 - 1e-4 && w.depth[hollow] < 0.8 - 1e-4, 'drift takes snow off both cells');
  ok(0.8 - w.depth[ridge] > 2 * (0.8 - w.depth[hollow]), `the ridge is scoured harder (${(0.8 - w.depth[ridge]).toFixed(3)}) than the hollow (${(0.8 - w.depth[hollow]).toFixed(3)})`);
  ok(w.depth[ridge + 1] > 0 && w.depth[ridge - 1] === 0, 'the snow lands downwind (+x), nothing upwind');
  let total = 0;
  for (let k = 0; k < 1024; k++) total += w.depth[k];
  ok(Math.abs(total - 1.6) < 1e-4, `drift keeps the total snow (${total.toFixed(5)})`);
  // melt: warm days take snow, cold ones do not
  w.depth.fill(0.5);
  s.windStrength = 0;
  w.step();
  ok(Math.abs(w.meanDepth() - 0.5) < 1e-6, 'no melt at warmth 0');
  s.warmth = 0.6;
  w.step();
  ok(w.meanDepth() < 0.5, `warmth melts snow (${w.meanDepth().toFixed(3)})`);
  w.depth.fill(0.5);
  s.warmth = 0.2;
  for (let k = 0; k < 3; k++) w.step();
  const before = w.meanDepth();
  w.step();
  ok(w.meanDepth() < before, 'melt keeps going while it stays warm');
  ok(WINTER_STEP === 10, 'the snow steps every 10 ticks');
  // at() reads the cell under a point
  w.depth.fill(0);
  w.depth[5 * N + 7] = 0.6;
  ok(Math.abs(w.at(7.5 * 16, 5.5 * 16) - 0.6) < 1e-6 && w.at(0, 0) === 0, 'at(x, y) reads the 16 m cell');
  ok(Math.abs(w.at(-5, 9999) - w.depth[31 * N]) < 1e-9, 'at() clamps to the map');
}

// 5. depth costs the grazers: deep snow everywhere lowers pronghorn and bison energy, same seed, same start
{
  const run = (snow: number) => {
    const sim = createSim({ seed: 7, params: { snowDepth: 1, snowStorms: 0, snowMelt: 0, snowDrift: 0 } });
    sim.winter!.depth.fill(snow);
    sim.step(1200);
    const a = sim.a;
    const e: Record<number, [number, number]> = { [Sp.Bison]: [0, 0], [Sp.Deer]: [0, 0] };
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || !(a.sp[i] in e)) continue;
      e[a.sp[i]][0] += a.energy[i];
      e[a.sp[i]][1]++;
    }
    const pop = sim.populations();
    return { bison: e[Sp.Bison][0] / Math.max(1, e[Sp.Bison][1]), deer: e[Sp.Deer][0] / Math.max(1, e[Sp.Deer][1]), pb: pop[Sp.Bison], pd: pop[Sp.Deer] };
  };
  const clear = run(0), deep = run(1);
  ok(deep.deer < clear.deer - 0.02, `pronghorn energy falls under deep snow (${deep.deer.toFixed(3)} vs ${clear.deer.toFixed(3)})`);
  ok(deep.bison < clear.bison - 0.01, `bison energy falls under deep snow (${deep.bison.toFixed(3)} vs ${clear.bison.toFixed(3)})`);
  // the hit is bigger on the pronghorn than on the bison (0.6 against 0.3)
  ok(clear.deer - deep.deer > clear.bison - deep.bison, `pronghorn lose more than bison (${(clear.deer - deep.deer).toFixed(3)} vs ${(clear.bison - deep.bison).toFixed(3)})`);
}

// 6. blizzards and hard winters are events; a hard winter fires once per winter
{
  const sim = createSim({ seed: 11, params: { snowDepth: 1, hardWinterP: 1, blizzardP: 1 } });
  sim.step(3600); // three valley years: winters begin at ticks 330, 1530 and 2730
  const hard = sim.events.filter((e) => e.kind === 'hardWinter');
  const blz = sim.events.filter((e) => e.kind === 'blizzard');
  ok(hard.length === 3, `a hard winter event each winter (${hard.length})`);
  ok(blz.length >= 3, `blizzards happen when every snowfall is one (${blz.length})`);
  ok(blz.every((e) => e.a > 0 && e.b > 0), 'a blizzard event carries its duration (a) and strength (b)');
  const row = sim.sample();
  ok(row.hard_winters === 3 && row.blizzards === blz.length, 'the sample counts the events');
  const none = createSim({ seed: 11, params: { snowDepth: 1, hardWinterP: 0, blizzardP: 0 } });
  none.step(3600);
  ok(none.events.every((e) => e.kind !== 'hardWinter' && e.kind !== 'blizzard'), 'no events when their chances are 0');
  ok(none.sample().snow_peak > 0, 'ordinary snowfalls still build snow');
}

// 7. weather: a snowfall shows as snow weather, and the sim is deterministic
{
  const a = createSim({ seed: 3, params: { snowDepth: 1 } }), b = createSim({ seed: 3, params: { snowDepth: 1 } });
  let snowy = 0;
  for (let t = 0; t < 1500; t += 10) {
    a.step(10);
    b.step(10);
    if (a.env.state.weather === 4) snowy++;
  }
  let same = true;
  for (let k = 0; k < 1024; k++) if (a.winter!.depth[k] !== b.winter!.depth[k]) same = false;
  ok(same, 'two runs of one seed give the same snow');
  ok(snowy > 0, 'a snowfall sets the weather to snow');
}

// 8. the snapshot carries depth as bytes with the vegetation texture, and not without it
{
  const sim = createSim({ seed: 3, params: { snowDepth: 1 } });
  sim.step(560);
  const snap = sim.snapshot(true);
  ok(snap.snow instanceof Uint8Array && snap.snow.length === 1024, 'snapshot.snow is 32 x 32 bytes');
  let good = true, any = false;
  for (let k = 0; k < 1024; k++) {
    if (snap.snow![k] !== Math.round(sim.winter!.depth[k] * 255)) good = false;
    if (snap.snow![k] > 0) any = true;
  }
  ok(good, 'a byte is round(depth x 255)');
  ok(any, 'there is snow in the first winter');
  ok(sim.snapshot(false).snow === undefined, 'no snow field without the vegetation texture');
}

// 9. spring green-up: a shift delays the onset, keeps the peak and the rest of the year, and 0 is the old curve
{
  const growth = (shift: number, season: number): number => {
    const env = new Environment(new Rng(1));
    env.greenUpShift = shift;
    env.state.season = season;
    return env.growthFactor();
  };
  const old = (s: number): number => 0.04 + 0.96 * Math.pow(Math.max(0, Math.cos(((s - 0.7) / 4) * Math.PI * 2)), 1.3);
  let exact = true;
  for (let s = 0; s < 4; s += 0.01) if (growth(0, s) !== old(s)) exact = false;
  ok(exact, 'shift 0 reproduces the old growth curve exactly');
  ok(growth(0.5, 3.8) === 0.04 && growth(0.5, 0.1) === 0.04, 'shift 0.5: still dormant at season 3.8 and 0.1');
  ok(growth(0, 3.8) > 0.1 && growth(0, 0.1) > 0.3, 'the old curve was already growing then');
  ok(growth(0.5, 0.2) === 0.04 || Math.abs(growth(0.5, 0.2) - 0.04) < 1e-9, 'growth starts at season 0.2 with a shift of 0.5');
  ok(growth(0.5, 0.4) > growth(0.5, 0.2) && growth(0.5, 0.6) > growth(0.5, 0.4), 'growth rises from the delayed onset');
  ok(Math.abs(growth(0.5, 0.7) - growth(0, 0.7)) < 1e-9, 'the late-spring peak is unchanged');
  let tail = true;
  for (let s = 0.7; s < 3.7; s += 0.05) if (Math.abs(growth(0.5, s) - growth(0, s)) > 1e-9) tail = false;
  ok(tail, 'summer and autumn are unchanged');
  let never = true;
  for (let s = 0; s < 4; s += 0.01) if (growth(0.5, s) > growth(0, s) + 1e-9) never = false;
  ok(never, 'a shift never raises growth');
  // wired through the sim
  const sim = createSim({ seed: 3, params: { greenUpShift: 0.5 } });
  ok(sim.env.greenUpShift === 0.5, 'the sim passes greenUpShift to the environment');
}

// 10. a Winter built by hand needs no sim
{
  const sim = createSim({ seed: 3 });
  const w = new Winter(3, sim.world, applyOverrides(defaultParams(), { snowDepth: 1 }), sim.env, { event: () => {} });
  ok(w.meanDepth() === 0 && w.maxDepth() === 0, 'a new field is empty');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
