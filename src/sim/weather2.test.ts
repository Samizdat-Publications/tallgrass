// Unit tests for S12 (dust storms, grasshopper outbreaks, spring floods). Run: npx tsx src/sim/weather2.test.ts
import { simHash } from '../headless/hash';
import { DustStorms, DUST_STEP } from './dust';
import { Environment } from './env';
import { Hoppers, HOP_STEP } from './hoppers';
import { applyOverrides, defaultParams } from './params';
import { Rng } from './rng';
import { createSim } from './sim';
import { FLOOD_STEP, SpringFloods } from './springflood';
import { BASE_YEAR_TICKS, SEASON_TICKS, setCalendarScale, Sp, YEAR_TICKS } from './types';
import { generateWorld } from './world';
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

const N2 = 256 * 256;
const fakeWorld = () => ({ water: new Uint8Array(N2), size: 512 });

// 1. everything is off by default; explicit zeros reproduce the default hash; the columns read 0 and no snapshot field appears
{
  const p = defaultParams();
  ok(p.dustStorms === 0 && p.grasshoppers === 0 && p.springFloods === 0, 'dustStorms, grasshoppers and springFloods are off by default');
  const q = applyOverrides(defaultParams(), { dustStorms: 1, grasshoppers: 1, springFloods: 1 });
  ok(q.dustStorms === 1 && q.grasshoppers === 1 && q.springFloods === 1, 'the three switches take overrides');
  const base = simHash(3, 1800);
  ok(simHash(3, 1800, { dustStorms: 0, grasshoppers: 0, springFloods: 0 }) === base, 'explicit zeros reproduce the default hash');
  const sim = createSim({ seed: 3 });
  ok(sim.dust === null && sim.hoppers === null && sim.springFloods === null, 'no modules while off');
  ok(sim.visMul === 1, 'sight multiplier is 1 while off');
  sim.step(10);
  const snap = sim.snapshot(true);
  ok(snap.dust === undefined && snap.hoppers === undefined && snap.flood === undefined, 'no dust, hoppers or flood fields in the snapshot while off');
  const row = sim.sample();
  ok(row.dust_storms === 0 && row.hop_total === 0 && row.hop_outbreaks === 0 && row.spring_floods === 0 && row.fawns_drowned === 0 && row.flood_now === 0, 'the S12 sample columns read 0 while off');
}

// 2. turning them on draws nothing from the main stream at construction; same seed and params give the same valley
{
  const P = { dustStorms: 1, grasshoppers: 1, springFloods: 1 };
  const a = createSim({ seed: 5 }), b = createSim({ seed: 5, params: P });
  let same = a.a.hi === b.a.hi;
  for (let i = 0; same && i < a.a.hi; i++) if (a.a.x[i] !== b.a.x[i] || a.a.y[i] !== b.a.y[i]) same = false;
  ok(same, 'the same founders with all three on (no main-rng draws)');
  ok(b.dust !== null && b.hoppers !== null && b.springFloods !== null, 'the modules exist when on');
  ok(simHash(7, 3000, P) === simHash(7, 3000, P), 'deterministic with all three on');
}

// 3. dust storm trigger and effects (module level, with a fake environment)
{
  const p = applyOverrides(defaultParams(), { dustStorms: 1 });
  const world = fakeWorld();
  const veg = { grass: new Float32Array(N2).fill(0.05), soil: new Float32Array(N2).fill(0.8) };
  const env = { state: { windStrength: 0.9, windDir: 1.0, warmth: 0.8, rain: 0, season: 1.5, tick: 0, year: 0, dayFrac: 0.5, weather: 2 }, droughtTicks: 5000 } as unknown as Environment;
  const events: { kind: string; a: number; b: number }[] = [];
  const d = new DustStorms(11, p, env, world, veg, { event: (kind, _sp, _x, _y, a, b) => events.push({ kind, a, b }) });
  ok(d.visionMul() === 1 && d.toArray() === null, 'no storm: sight x 1 and no snapshot array');
  const run = (steps: number, from: number): number => {
    let t = from;
    for (let k = 0; k < steps; k++, t += DUST_STEP) d.step(t);
    return t;
  };
  // each trigger condition on its own holds it back
  (env as unknown as { droughtTicks: number }).droughtTicks = 0;
  let t = run(200, 0);
  ok(events.length === 0, 'no drought, no dust storm');
  (env as unknown as { droughtTicks: number }).droughtTicks = 99999;
  env.state.windStrength = 0.4;
  t = run(200, t);
  ok(events.length === 0, 'wind under dustWind, no dust storm');
  env.state.windStrength = 0.9;
  veg.grass.fill(0.6);
  t = run(200, t);
  ok(events.length === 0, 'covered ground (no bare cells), no dust storm');
  veg.grass.fill(0.05);
  for (let c = 0; c < N2; c += 3) veg.grass[c] = 0.6; // a third of the land is covered, two thirds bare
  ok(Math.abs(d.bareShare() - 2 / 3) < 0.01, `bareShare reads the share under dustBareGrass (${d.bareShare().toFixed(3)})`);
  veg.grass.fill(0.05);
  for (let c = 0; c < N2; c++) if (c % 20 < 14) veg.grass[c] = 0.6; // 30% bare: under the 0.35 gate
  t = run(200, t);
  ok(events.length === 0 && d.lastBare < 0.35, `bare share ${d.lastBare.toFixed(2)} under 0.35, no dust storm`);
  veg.grass.fill(0.05);
  veg.soil.fill(0.8);
  // all three hold: a storm starts
  const t0 = t;
  t = run(10, t);
  ok(events.length === 1 && events[0].kind === 'dustStorm', 'drought + bare ground + wind starts a dust storm');
  ok(events[0].a >= 200 && events[0].a <= 450 && events[0].b >= 0.6 && events[0].b <= 1, `storm length ${events[0]?.a} ticks, peak ${events[0]?.b}`);
  ok(d.left > 0 && d.dir === 1.0, 'the storm blows the way the wind blew');
  const arr = d.toArray();
  ok(arr !== null && arr.length === 5 && arr[1] === 1.0, 'snapshot dust array: 5 floats, direction second');
  // sight falls to 1 - 0.4 x intensity, and bottoms at the peak
  let minVis = 1, steps = 0;
  const total = d.total;
  while (d.left > 0 && steps < 200) { d.step(t); t += DUST_STEP; steps++; minVis = Math.min(minVis, d.visionMul()); }
  ok(minVis < 0.9 && minVis >= 1 - 0.4 * d.peak - 1e-6, `sight dips to x${minVis.toFixed(2)} at the peak`);
  ok(d.left === 0 && d.visionMul() === 1 && d.toArray() === null, 'the storm ends and sight comes back');
  // the bare cells lost about dustSoil in all
  const lost = 0.8 - veg.soil[100];
  ok(Math.abs(lost - 0.02) < 0.004, `bare cells lost ${lost.toFixed(4)} soil over the storm (0.02)`);
  ok(total >= 200, 'storm length recorded');
  // the cooldown holds the next one back: dustCooldown 0.5 valley years
  const n1 = events.length;
  t = run(30, t);
  ok(events.length === n1, 'no second storm inside the cooldown');
  t = run(Math.ceil((0.5 * YEAR_TICKS) / DUST_STEP) + 20, t);
  ok(events.length > n1, 'a second storm after the cooldown');
  void t0;
  const dr = d.drainSample();
  ok(dr.storms >= 2 && dr.cellsScoured > 0, 'drainSample counts the storms and scoured cells');
  ok(d.drainSample().storms === 0, 'drainSample resets');
}

// 4. dust storm in the sim: sight multiplier, snapshot field, events, soil
{
  const sim = createSim({ seed: 3, params: { dustStorms: 1 } });
  sim.step(5);
  sim.dust!.start(300, 1, 0.5);
  sim.step(80);
  ok(sim.visMul < 1 && sim.visMul >= 0.6, `sim.visMul falls in a storm (${sim.visMul.toFixed(3)})`);
  const snap = sim.snapshot(false);
  ok(snap.dust !== undefined && snap.dust.length === 5, 'snapshot carries dust while it blows');
  const ev = sim.events.filter((e) => e.kind === 'dustStorm');
  ok(ev.length === 1 && ev[0].a === 300, 'a dustStorm event with the length in a');
  sim.step(60);
  ok(sim.visMul < 0.9 || sim.dust!.intensity() > 0, 'still blowing 60 ticks on');
  sim.step(300);
  ok(sim.visMul === 1 && sim.snapshot(false).dust === undefined, 'the storm passes and the field leaves the snapshot');
  const row = sim.sample();
  ok(row.dust_storms === 1, 'dust_storms counts the storm in the sample');
}

// 5. grasshoppers: a hot dry summer surges, a wet one does not, the cold season kills them back, they eat grass
{
  setCalendarScale(2);
  const mk = (over: Record<string, number> = {}) => {
    const p = applyOverrides(defaultParams(), { grasshoppers: 1, ...over });
    const world = generateWorld(3);
    const env = { state: { windStrength: 0.4, windDir: 0, warmth: 0.85, rain: 0, season: 1.0, tick: 0, year: 0, dayFrac: 0.5, weather: 0 }, droughtTicks: 0 } as unknown as Environment;
    const cg = new Float32Array(1024).fill(0.35);
    const veg = { grass: new Float32Array(world.n * world.n).fill(0.35), browse: new Float32Array(world.n * world.n).fill(0.3) };
    const events: { kind: string; a: number; b: number }[] = [];
    const h = new Hoppers(3, p, world, env, cg, veg, { event: (kind, _sp, _x, _y, a, b) => events.push({ kind, a, b }) });
    return { p, world, env, cg, veg, events, h };
  };
  // drought summer: surges and fires one outbreak event
  {
    const m = mk({ hopperYear: 0 });
    m.env.droughtTicks = 99999;
    const start = m.h.meanDensity();
    for (let t = 0; t < 2 * SEASON_TICKS; t += HOP_STEP) { m.env.state.season = 0.5 + t / SEASON_TICKS; m.h.step(t); }
    ok(m.h.meanDensity() > 0.3 && m.h.meanDensity() > 3 * start, `a drought summer surges (mean ${start.toFixed(2)} to ${m.h.meanDensity().toFixed(2)})`);
    ok(m.events.length === 1 && m.events[0].kind === 'grasshopperOutbreak', 'one grasshopperOutbreak event');
    ok(m.events[0].b >= 0.3 && m.events[0].a >= 0, `event carries the mean (${m.events[0]?.b}) and the cells above half (${m.events[0]?.a})`);
    ok(m.h.maxDensity() <= 1 + 1e-6 && Math.min(...m.h.d) >= 0, 'density stays in 0..1');
    // eating: grass was cut where they are thick
    const g = m.veg.grass.reduce((s, v) => s + v, 0) / m.veg.grass.length;
    ok(g < 0.30, `grass was cut by the outbreak (mean ${g.toFixed(3)} of 0.35)`);
    ok(m.h.drainSample().eaten > 0, 'eaten is tallied');
    // the texture
    const tex = new Uint8Array(1024);
    m.h.fillTexture(tex);
    let mx = 0;
    for (const v of tex) if (v > mx) mx = v;
    ok(mx > 100 && mx <= 255, `texture: densest cell ${mx}/255`);
    // the cold season kills them back, leaving the carry-over
    m.env.droughtTicks = 0;
    const peak = m.h.meanDensity();
    for (let t = 0; t < 2 * SEASON_TICKS; t += HOP_STEP) { m.env.state.season = 2.4 + t / SEASON_TICKS; m.h.step(t); }
    ok(m.h.meanDensity() < 0.2 * peak, `adults die back in the cold season (${peak.toFixed(2)} to ${m.h.meanDensity().toFixed(3)})`);
  }
  // a wet summer: no surge
  {
    const m = mk({ hopperYear: 0 });
    m.env.state.rain = 1;
    for (let t = 0; t < 2 * SEASON_TICKS; t += HOP_STEP) { m.env.state.season = 0.5 + t / SEASON_TICKS; m.h.step(t); }
    ok(m.h.meanDensity() < 0.15 && m.events.length === 0, `a wet summer does not surge (mean ${m.h.meanDensity().toFixed(3)})`);
  }
  // diffusion conserves the total
  {
    const m = mk();
    m.h.d.fill(0);
    m.h.d[16 * 32 + 16] = 0.9;
    const before = m.h.total();
    (m.h as unknown as { diffuse(): void }).diffuse();
    ok(Math.abs(m.h.total() - before) < 1e-5 && m.h.d[16 * 32 + 15] > 0 && m.h.d[16 * 32 + 17] > 0, 'diffusion spreads and conserves');
  }
  // feeding
  {
    const m = mk();
    m.h.d.fill(0);
    const c = m.h.cellOf(100, 100);
    m.h.d[c] = 0.8;
    ok(m.h.feed(100, 100, 'coyote', 1 / 1800) > 0 && m.h.feed(100, 100, 'raven', 1 / 1200) > 0, 'coyote and raven gain from a thick patch');
    ok(m.h.feed(400, 400, 'coyote', 1 / 1800) === 0, 'nothing where there are none');
    let got = 0;
    for (let k = 0; k < 400; k++) got += m.h.take(100, 100, 1) > 0 ? 1 : 0;
    ok(got > 40 && got < 360, `a hawk's stoops on a thick patch sometimes succeed (${got}/400)`);
    const d = m.h.drainSample();
    ok(d.fed[0] > 0 && d.fed[1] > 0 && d.fed[2] > 0, 'intake is tallied per predator');
    // hoppers' own generator: the same seed gives the same stoops
    const m2 = mk();
    m2.h.d.fill(0);
    m2.h.d[m2.h.cellOf(100, 100)] = 0.8;
    let got2 = 0;
    for (let k = 0; k < 400; k++) got2 += m2.h.take(100, 100, 1) > 0 ? 1 : 0;
    ok(got2 === got, 'the stoop rolls are deterministic');
  }
  // rate calibration: outbreaks every few years in the default weather, with no animals in the way (the grass is pinned)
  {
    let outs = 0;
    const years = 150;
    for (const seed of [1, 2, 3]) {
      const m = mk();
      const env = new Environment(new Rng(seed).fork(11));
      const p = m.p;
      env.droughtChance = p.summerDroughtP;
      let n = 0;
      const h = new Hoppers(seed, p, m.world, env, m.cg, m.veg, { event: () => { n++; } });
      for (let t = 0; t < years * YEAR_TICKS; t++) {
        env.update(t);
        if (t % HOP_STEP === 0) { m.veg.grass.fill(0.35); m.veg.browse.fill(0.3); h.step(t); }
      }
      outs += n;
    }
    const per100 = (outs / (3 * years)) * 100;
    ok(per100 >= 12 && per100 <= 45, `outbreaks come every few years: ${per100.toFixed(1)} per 100 valley years (target 12 to 45)`);
  }
  // in the sim: ravens and coyotes feed, the grass is cut, the events and columns appear
  {
    const sim = createSim({ seed: 3, params: { grasshoppers: 1 } });
    sim.step(60);
    sim.hoppers!.d.fill(0.7);
    sim.hoppers!.drainSample();
    sim.step(120);
    const row = sim.sample();
    ok(row.hop_total > 0 && row.hop_peak > 0.3, `hop_total and hop_peak are reported (${row.hop_total.toFixed(1)}, ${row.hop_peak.toFixed(2)})`);
    ok(row.hop_fed_raven > 0, `ravens feed on grasshoppers (${row.hop_fed_raven.toFixed(3)} energy)`);
    ok(row.hop_eaten > 0, 'the field takes grass');
    const snap = sim.snapshot(true);
    ok(snap.hoppers instanceof Uint8Array && snap.hoppers.length === 1024, 'snapshot hoppers texture is 32 x 32 bytes');
    ok(sim.snapshot(false).hoppers === undefined, 'no hoppers texture without veg');
  }
}

// 6. spring flood trigger: snowmelt and rain fill the wet index; rarer without snow
{
  setCalendarScale(2);
  const count = (snow: boolean, seed: number, years: number): { floods: number; ticks: number[]; sev: number[] } => {
    const p = applyOverrides(defaultParams(), { springFloods: 1, snowDepth: snow ? 1 : 0 });
    const env = new Environment(new Rng(seed).fork(11));
    const world = generateWorld(seed);
    const winter = snow ? new Winter(seed, world, p, env, { event: () => undefined }) : null;
    const sf = new SpringFloods(seed, p, env, winter !== null ? () => winter.meanDepth() : null);
    const out = { floods: 0, ticks: [] as number[], sev: [] as number[] };
    let left = 0;
    for (let t = 0; t < years * YEAR_TICKS; t++) {
      env.update(t);
      if (winter !== null && t % WINTER_STEP === 0) winter.step();
      if (left > 0) left--;
      if (t % FLOOD_STEP === 0) {
        const c = sf.step(left > 0);
        if (c !== null) { out.floods++; out.ticks.push(c.ticks); out.sev.push(c.severity); left = c.ticks; }
      }
    }
    return out;
  };
  const yrs = 100;
  let withSnow = 0, noSnow = 0;
  const ticks: number[] = [], sev: number[] = [];
  for (const seed of [1, 2]) {
    const a = count(true, seed, yrs), b = count(false, seed, yrs);
    withSnow += a.floods;
    noSnow += b.floods;
    ticks.push(...a.ticks, ...b.ticks);
    sev.push(...a.sev, ...b.sev);
  }
  const w100 = (withSnow / (2 * yrs)) * 100, n100 = (noSnow / (2 * yrs)) * 100;
  ok(w100 >= 40 && w100 <= 100, `with snowmelt, spring floods come most years (${w100.toFixed(0)} per 100 valley years)`);
  ok(n100 > 0 && n100 < 0.7 * w100, `without snowmelt they are rarer (${n100.toFixed(0)} vs ${w100.toFixed(0)})`);
  ok(ticks.every((t) => t >= 30 && t <= SEASON_TICKS * 0.5 * 1.4 + 1), 'flood lengths are about half a season');
  ok(sev.every((s) => s >= 0.25 - 1e-9 && s <= 0.9 + 1e-9), 'severities stay in 0.25 to 0.9');
  // a flood needs the window: wetness out of season does nothing
  const p = applyOverrides(defaultParams(), { springFloods: 1 });
  const env = { state: { warmth: 0.8, rain: 1, season: 1.5, tick: 5000, year: 4, weather: 1 } } as unknown as Environment;
  const sf = new SpringFloods(1, p, env, () => 0);
  let any = false;
  for (let k = 0; k < 400; k++) if (sf.step(false) !== null) any = true;
  ok(!any, 'no spring flood in the summer, whatever the rain');
  ok(SpringFloods.inWindow(3.7) && SpringFloods.inWindow(0.5) && !SpringFloods.inWindow(1.5) && !SpringFloods.inWindow(2.5), 'the window is late winter to mid spring');
}

// 7. the natural flood in the sim: the S17 machinery with a 15 m band, silt, drowned young
{
  setCalendarScale(2);
  const sim = createSim({ seed: 3, params: { springFloods: 1, floodYoung: 1 } });
  const w = sim.world, v = sim.veg, a = sim.a;
  sim.step(30);
  // a young animal standing on the bank
  let bank = -1;
  for (let c = 0; c < w.water.length; c++) if (!w.water[c] && w.waterDist[c] > 3 && w.waterDist[c] < 8) { bank = c; break; }
  let calf = -1, farAdult = -1;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Bison) { if (calf < 0) calf = i; else { farAdult = i; break; } }
  ok(bank >= 0 && calf >= 0 && farAdult >= 0, 'test set-up: a bank cell, a calf and an adult');
  a.x[calf] = ((bank % w.n) + 0.5) * w.cell;
  a.y[calf] = (((bank / w.n) | 0) + 0.5) * w.cell;
  a.age[calf] = 0;
  const calfId = a.id[calf];
  let far = -1;
  for (let c = 0; c < w.water.length; c++) if (!w.water[c] && w.waterDist[c] > 40) { far = c; break; }
  a.x[farAdult] = ((far % w.n) + 0.5) * w.cell;
  a.y[farAdult] = (((far / w.n) | 0) + 0.5) * w.cell;
  const farId = a.id[farAdult];
  const grassNear = v.grass[bank], soilNear = v.soil[bank];
  const grassFar = v.grass[far];
  (sim as unknown as { startFlood(t: number, s: number, r: Rng): void }).startFlood(120, 1, sim.springFloods!.rng);
  ok(sim.flood !== null && sim.flood.radius === 15, 'the natural flood has a 15 m band');
  ok(sim.events.some((e) => e.kind === 'springFlood' && e.a === 120 && Math.abs(e.b - 1) < 1e-6), 'a springFlood event carries the length and severity');
  ok(!sim.events.some((e) => e.kind === 'flood'), 'it is not the player flood event');
  ok(!(a.alive[calf] !== 0 && a.id[calf] === calfId), 'with floodYoung 1 the calf on the bank drowned');
  ok(a.alive[farAdult] !== 0 && a.id[farAdult] === farId, 'an animal far from the water is untouched');
  ok(v.grass[bank] < grassNear * 0.7, `the bank grass drowned (${grassNear.toFixed(2)} to ${v.grass[bank].toFixed(2)})`);
  ok(Math.abs(v.grass[far] - grassFar) < 1e-6, 'the far grass is untouched');
  const snap = sim.snapshot(false);
  ok(snap.flood !== undefined && snap.flood.length === 3 && snap.flood[2] === 15 && Math.abs(snap.flood[1] - 1) < 1e-6, 'the snapshot flood field is [ticks left, severity, 15]');
  sim.step(125);
  ok(sim.flood === null, 'the flood recedes');
  const row = sim.sample();
  ok(row.spring_floods === 1 && row.fawns_drowned >= 1, `the samples count the flood and the drowned young (${row.spring_floods}, ${row.fawns_drowned})`);
  ok(v.soil[bank] > soilNear || soilNear >= 1.4, 'silt raised the bank soil');
  // the player's flood is unchanged: wider band, its own event
  const sim2 = createSim({ seed: 3 });
  sim2.apply({ kind: 'flood', ticks: 100, severity: 0.5 });
  ok(sim2.flood !== null && sim2.flood.radius === 12 + 38 * 0.5 && sim2.events.some((e) => e.kind === 'flood'), "the player's flood keeps its band and its event");
}

// 8. all three in a real run: determinism and no crash
{
  const P = { dustStorms: 1, grasshoppers: 1, springFloods: 1, snowDepth: 1, stormCells: 1 };
  const s1 = createSim({ seed: 9, params: P }), s2 = createSim({ seed: 9, params: P });
  s1.step(4000);
  s2.step(4000);
  ok(JSON.stringify(s1.sample()) === JSON.stringify(s2.sample()), 'two runs with the same seed and all features on agree');
  ok(BASE_YEAR_TICKS === 2400, 'base year unchanged');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
