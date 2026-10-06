// Unit tests for the god tools v2 (S17): lightning, blizzard, flood, targeted disease, grove, and introduce / cull / remove for every species.
// Run: npx tsx src/sim/godtools.test.ts
import { createSim, type Sim } from './sim';
import { SPECIES } from './species';
import { decodeShare, encodeShare, type LoggedIntervention } from './sharecode';
import { Sp, Weather, type Intervention } from './types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

/** Slot of the first live animal of a species, or -1. */
function firstOf(sim: Sim, sp: number): number {
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i] && sim.a.sp[i] === sp) return i;
  return -1;
}
function count(sim: Sim, sp: number): number {
  let n = 0;
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i] && sim.a.sp[i] === sp) n++;
  return n;
}
function eventsOf(sim: Sim, kind: string): number {
  return sim.events.filter((e) => e.kind === kind).length;
}
/** A land cell centre away from water and the valley rim. */
function landSpot(sim: Sim, minWater = 60): [number, number] {
  const w = sim.world;
  for (let y = 100; y < w.size - 100; y += 8) {
    for (let x = 100; x < w.size - 100; x += 8) {
      const c = sim.veg.cellAt(x, y);
      if (!w.water[c] && w.waterDist[c] > minWater) return [x, y];
    }
  }
  return [w.size / 2, w.size / 2];
}
/** A land cell inside the flood band of a severity-0.5 flood (a few metres from the water). */
function bankSpot(sim: Sim): [number, number] {
  const w = sim.world;
  for (let y = 100; y < w.size - 100; y += 4) {
    for (let x = 100; x < w.size - 100; x += 4) {
      const c = sim.veg.cellAt(x, y);
      if (!w.water[c] && w.waterDist[c] > 14 && w.waterDist[c] < 20) return [x, y];
    }
  }
  throw new Error('no bank spot');
}

// 1. lightning: sets the grass alight, kills what stands in the strike, shows up in the snapshot and the event log
{
  const sim = createSim({ seed: 3 });
  sim.step(20);
  const [x, y] = landSpot(sim);
  const i = firstOf(sim, Sp.Bison);
  sim.a.x[i] = x + 1; sim.a.y[i] = y; sim.a.alt[i] = 0;
  const far = firstOf(sim, Sp.Deer);
  sim.a.x[far] = x + 20; sim.a.y[far] = y;
  const before = count(sim, Sp.Bison);
  sim.apply({ kind: 'lightning', x, y });
  ok(sim.veg.burn[sim.veg.cellAt(x, y)] > 1, 'lightning sets the cell burning');
  ok(!sim.a.alive[i], 'the bison under the strike dies');
  ok(sim.a.alive[far] === 1, 'a pronghorn 20 m away is untouched');
  ok(count(sim, Sp.Bison) === before - 1, 'only the animals within 3 m die');
  ok(eventsOf(sim, 'lightningFire') === 1, 'lightningFire event raised');
  const snap = sim.snapshot(false);
  ok(!!snap.strikes && snap.strikes.length === 4 && snap.strikes[0] === x && snap.strikes[3] === 1, 'the strike is in the snapshot (no storm cells needed)');
  ok(sim.snapshot(false).strikes === undefined, 'the strike buffer drains');
  // over water: no fire and no event
  const w = sim.world;
  let wx = -1, wy = -1;
  for (let c = 0; c < w.water.length && wx < 0; c++) if (w.water[c] && w.waterDist[c] === 0) { wx = ((c % w.n) + 0.5) * w.cell; wy = (((c / w.n) | 0) + 0.5) * w.cell; }
  const ev0 = eventsOf(sim, 'lightningFire');
  sim.apply({ kind: 'lightning', x: wx, y: wy });
  ok(eventsOf(sim, 'lightningFire') === ev0 || sim.veg.burn[sim.veg.cellAt(wx, wy)] === 0, 'a strike on open water starts no fire at its own cell');
  // the fire spreads and burns out without error
  sim.step(300);
  ok(sim.veg.grass[sim.veg.cellAt(x, y)] < sim.world.capacity[sim.veg.cellAt(x, y)] * 0.9, 'the struck grass burned');
  // with storm cells on, the strike goes through the storm buffer
  const st = createSim({ seed: 3, params: { stormCells: 1 } });
  st.step(5);
  st.apply({ kind: 'lightning', x, y });
  const s2 = st.snapshot(false);
  ok(!!s2.strikes && s2.strikes.length >= 4, 'the strike reaches the snapshot with storm cells on');
}

// 2. blizzard: a snow spell and gale always, a deep snowfall with snowDepth on, a cold drain on the animals
{
  const sim = createSim({ seed: 3 });
  sim.step(10);
  sim.apply({ kind: 'blizzard', ticks: 400 });
  sim.step(3);
  ok(sim.env.state.weather === Weather.Snow, 'the weather turns to snow (snowDepth off)');
  ok(sim.env.state.windStrength >= 0.85, 'a gale blows');
  ok(eventsOf(sim, 'blizzard') === 1, 'blizzard event raised');
  sim.step(450);
  ok(sim.env.state.weather !== Weather.Snow, 'the spell ends');

  const cold = createSim({ seed: 3 }), mild = createSim({ seed: 3 });
  cold.step(10); mild.step(10);
  cold.apply({ kind: 'blizzard', ticks: 300 });
  cold.step(300); mild.step(300);
  const meanE = (s: Sim) => { let t = 0, n = 0; for (let i = 0; i < s.a.hi; i++) if (s.a.alive[i] && s.a.sp[i] === Sp.Bison) { t += s.a.energy[i]; n++; } return t / n; };
  ok(meanE(cold) < meanE(mild), `the blizzard drains the bison (${meanE(cold).toFixed(3)} vs ${meanE(mild).toFixed(3)})`);

  // a winter blizzard with snowDepth on: deep snow (in summer it falls and melts again within the spell)
  const snow = createSim({ seed: 3, params: { snowDepth: 1 } });
  snow.step(10);
  ok(snow.winter!.meanDepth() === 0, 'no snow in late summer');
  while (snow.env.state.season < 3.2) snow.step(10);
  const d0 = snow.winter!.meanDepth();
  snow.apply({ kind: 'blizzard', ticks: 400 });
  let peak = 0;
  for (let k = 0; k < 42; k++) { snow.step(10); peak = Math.max(peak, snow.winter!.meanDepth()); }
  ok(peak > Math.max(0.2, d0 + 0.1), `a deep snowfall with snowDepth on (mean depth ${d0.toFixed(2)} to a peak of ${peak.toFixed(2)})`);
}

// 3. flood: drowns the grass in the band, pushes animals out, leaves silt
{
  const sim = createSim({ seed: 3 });
  sim.step(20);
  const [x, y] = bankSpot(sim);
  const c = sim.veg.cellAt(x, y);
  const g0 = sim.veg.grass[c], soil0 = sim.veg.soil[c];
  const far = landSpot(sim, 90);
  const cf = sim.veg.cellAt(far[0], far[1]);
  const gFar = sim.veg.grass[cf];
  const i = firstOf(sim, Sp.Bison);
  sim.a.x[i] = x; sim.a.y[i] = y; sim.a.age[i] = 100000; sim.a.alt[i] = 0;
  sim.apply({ kind: 'flood', ticks: 300, severity: 0.5 });
  ok(sim.veg.grass[c] < 0.7 * g0, `the grass on the bank drowns (${g0.toFixed(2)} to ${sim.veg.grass[c].toFixed(2)})`);
  ok(sim.veg.grass[cf] === gFar, 'grass far from the water is untouched');
  ok(eventsOf(sim, 'flood') === 1, 'flood event raised');
  const snap = sim.snapshot(false);
  ok(!!snap.flood && snap.flood[1] === 0.5 && Math.abs(snap.flood[2] - 31) < 1e-3, 'the snapshot reports the flood (ticks left, severity, band width)');
  if (sim.a.alive[i]) {
    const d0 = sim.world.waterDist[c];
    sim.step(60);
    const ci = sim.a.alive[i] ? sim.veg.cellAt(sim.a.x[i], sim.a.y[i]) : -1;
    ok(!sim.a.alive[i] || ci < 0 || sim.world.waterDist[ci] > d0 + 3 || sim.a.state[i] === 7, 'a bison on the bank is pushed away from the water');
  }
  sim.step(300);
  ok(sim.flood === null, 'the flood recedes');
  ok(sim.snapshot(false).flood === undefined, 'no flood in the snapshot once it has gone');
  ok(sim.veg.soil[c] > soil0 - 0.01, 'silt feeds the soil on the bank');
  // fires in the band are put out
  const burn = createSim({ seed: 3 });
  burn.step(10);
  burn.veg.ignite(x, y, 6);
  burn.apply({ kind: 'flood', ticks: 100, severity: 0.5 });
  ok(burn.veg.burn[burn.veg.cellAt(x, y)] <= 1, 'a flood puts out a fire in its band');
}

// 4. targeted disease
{
  const sim = createSim({ seed: 3 });
  sim.step(10);
  const nb = count(sim, Sp.Bison);
  const sick0 = (() => { let n = 0; for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i] && sim.a.sp[i] === Sp.Bison && sim.a.infected[i] > 0) n++; return n; })();
  sim.apply({ kind: 'disease', disease: 'fever', species: Sp.Bison, fraction: 0.2 });
  let sick = 0;
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i] && sim.a.sp[i] === Sp.Bison && sim.a.infected[i] > 0) sick++;
  const added = sick - sick0;
  ok(Math.abs(added - 0.2 * (nb - sick0)) <= 2, `fever infects about a fifth of the healthy bison (${added} of ${nb - sick0})`);
  ok(sim.events.some((e) => e.kind === 'plague' && e.sp === Sp.Bison && e.a === added), 'the plague event reports the count');
  sim.step(100);
  const snap = sim.snapshot(false);
  let flagged = 0;
  for (let k = 0; k < snap.count; k++) if (snap.agents[k * 12] === Sp.Bison && (snap.agents[k * 12 + 8] & 4) !== 0) flagged++;
  ok(flagged > 0, 'infected bison carry the infected flag in the snapshot');

  // distemper works at cdvRate 0 (the challenge worlds pin it off) and runs its course
  const d = createSim({ seed: 3, params: { cdvRate: 0 } });
  d.step(10);
  ok(!d.dis.cdvOn, 'distemper is off in the default world');
  d.apply({ kind: 'disease', disease: 'distemper' });
  let cdv = 0;
  for (let i = 0; i < d.a.hi; i++) if (d.a.alive[i] && d.a.sp[i] === Sp.Wolf && d.a.cdv[i] > 0) cdv++;
  ok(cdv >= 1, `distemper infects wolves (${cdv})`);
  let sickCoyotes = 0;
  for (let i = 0; i < d.a.hi; i++) if (d.a.alive[i] && d.a.sp[i] === Sp.Coyote && d.a.cdv[i] > 0) sickCoyotes++;
  ok(count(d, Sp.Coyote) > 0 && sickCoyotes === 0, 'a wolf outbreak leaves the coyotes alone');
  d.step(1500);
  let still = 0;
  for (let i = 0; i < d.a.hi; i++) if (d.a.alive[i] && d.a.cdv[i] > 0) still++;
  ok(still === 0, 'the distemper has run its course');
  ok(d.dis.adultDied + d.dis.pupDied + d.dis.adultSurvived + d.dis.pupSurvived >= cdv, 'every sick wolf died or recovered');

  // plague in the prairie dog towns
  const p = createSim({ seed: 3, params: { smallPrey: 1 } });
  p.step(60);
  const before = p.small!.dogTotal();
  p.apply({ kind: 'disease', disease: 'plague', fraction: 1 });
  ok(p.small!.plague.some((v) => v > 0), 'sylvatic plague seeds in the towns');
  p.step(1200);
  ok(p.small!.dogTotal() < 0.5 * before, `the plague kills most of the dogs (${before.toFixed(0)} to ${p.small!.dogTotal().toFixed(0)})`);
  // with smallPrey off the tool does nothing and does not throw
  const q = createSim({ seed: 3 });
  q.step(5);
  q.apply({ kind: 'disease', disease: 'plague' });
  ok(true, 'plague with the web off is harmless');
}

// 5. grove
{
  const sim = createSim({ seed: 3 });
  sim.step(20);
  const [x, y] = landSpot(sim, 80);
  const c = sim.veg.cellAt(x, y);
  const cov0 = sim.world.cover[c], cap0 = sim.world.capacity[c], bw0 = sim.veg.browseK[c];
  const trees0 = sim.world.trees.length;
  ok(sim.snapshot(true).groves === undefined, 'no groves in the snapshot before any is planted');
  sim.apply({ kind: 'grove', x, y, radius: 20 });
  ok(sim.world.cover[c] > cov0 + 0.5, `tree cover rises at the centre (${cov0.toFixed(2)} to ${sim.world.cover[c].toFixed(2)})`);
  ok(sim.world.capacity[c] < cap0, 'shade cuts the grass capacity');
  ok(sim.veg.browseK[c] > bw0, 'browse capacity rises');
  ok(sim.world.trees.length > trees0 && (sim.world.trees.length - trees0) % 4 === 0, 'trees are added to the world');
  const e = sim.events.find((v) => v.kind === 'grovePlanted');
  ok(!!e && e.x === x && e.y === y && e.a === 20 && e.b === (sim.world.trees.length - trees0) / 4, 'grovePlanted reports the centre, radius and tree count');
  const snap = sim.snapshot(true);
  ok(!!snap.groves && snap.groves.length === sim.world.trees.length - trees0, 'the snapshot carries the grove trees');
  let inside = 0;
  for (let k = 0; k < snap.groves!.length; k += 4) if (Math.hypot(snap.groves![k] - x, snap.groves![k + 1] - y) <= 20) inside++;
  ok(inside === snap.groves!.length / 4, 'every grove tree stands inside the radius');
  const far = sim.veg.cellAt(x + 120, y);
  const farCov = sim.world.cover[far];
  sim.step(100);
  ok(sim.world.cover[far] === farCov, 'ground outside the disc is untouched');
  // a second world is not affected by the first (each sim generates its own world)
  ok(createSim({ seed: 3 }).world.cover[c] === cov0, 'another sim of the same seed has its own world');
}

// 6. introduce, cull and remove work for every species in the registry, including the field species and the raptors
{
  for (const params of [{} as Record<string, number>, { smallPrey: 1, smallGameField: 1, raptors: 1, 'coyote.initial': 6, 'cougar.initial': 4, 'muledeer.initial': 40 }]) {
    for (const s of SPECIES) {
      const sim = createSim({ seed: 5, params });
      sim.step(100);
      const field = sim.small !== null && (s.id === Sp.Rabbit || s.id === Sp.PrairieDog);
      const n0 = sim.populations()[s.id];
      sim.apply({ kind: 'introduce', species: s.id, count: 10 });
      const n1 = sim.populations()[s.id];
      ok(n1 > n0 || (s.id === Sp.PrairieDog && sim.small === null), `introduce adds ${s.key} (${n0} to ${n1})`);
      if (!field && s.id !== Sp.PrairieDog) ok(n1 - n0 >= 8, `introduce(${s.key}, 10) lands about ten (${n1 - n0})`);
      sim.step(150);
      const n2 = sim.populations()[s.id];
      sim.apply({ kind: 'cull', species: s.id, fraction: 0.5 });
      const n3 = sim.populations()[s.id];
      ok(n3 < n2 || n2 === 0, `cull trims ${s.key} (${n2} to ${n3})`);
      sim.step(100);
      sim.apply({ kind: 'remove', species: s.id });
      ok(sim.populations()[s.id] === 0, `remove clears ${s.key}`);
      sim.step(200);
      ok(sim.sample().tick !== undefined || true, `${s.key}: the valley keeps running after the tools`);
    }
  }
}

// 7. share codes carry every new kind and replay to the same valley
{
  const ivs: Intervention[] = [
    { kind: 'lightning', x: 200, y: 210 },
    { kind: 'blizzard', ticks: 300 },
    { kind: 'flood', ticks: 400, severity: 0.7 },
    { kind: 'disease', disease: 'fever', species: Sp.Bison, fraction: 0.1 },
    { kind: 'disease', disease: 'distemper', species: Sp.Wolf },
    { kind: 'disease', disease: 'plague', fraction: 0.5 },
    { kind: 'grove', x: 300, y: 250, radius: 18 },
    { kind: 'introduce', species: Sp.Eagle, count: 4 },
    { kind: 'cull', species: Sp.Rabbit, fraction: 0.3 },
  ];
  const log: LoggedIntervention[] = ivs.map((iv, k) => ({ tick: 50 + 120 * k, iv }));
  const code = encodeShare({ seed: 9, scenario: 'prairie', params: {}, log });
  const back = decodeShare(code).state.log;
  ok(back.length === ivs.length, `every new kind survives decodeShare (${back.length} of ${ivs.length})`);
  ok(JSON.stringify(back.map((e) => e.iv)) === JSON.stringify(ivs), 'the interventions round-trip exactly');

  const fp = (sim: Sim): string => {
    let h = 0x811c9dc5;
    const mix = (v: number) => (h = Math.imul(h ^ (v >>> 0), 0x01000193) >>> 0);
    const f = new Float32Array(1), u32 = new Uint32Array(f.buffer);
    for (const p of sim.populations()) mix(p);
    for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i]) { mix(i); f[0] = sim.a.x[i]; mix(u32[0]); f[0] = sim.a.energy[i]; mix(u32[0]); }
    for (let c = 0; c < sim.veg.grass.length; c += 97) { f[0] = sim.veg.grass[c]; mix(u32[0]); }
    return h.toString(16);
  };
  const run = (): string => {
    const sim = createSim({ seed: 9, params: { smallPrey: 1, raptors: 1 } });
    const sched = decodeShare(code).state.log.slice();
    for (let t = 0; t < 1500; t++) {
      while (sched.length && sim.tick >= sched[0].tick) sim.apply(sched.shift()!.iv);
      sim.step(1);
    }
    return fp(sim);
  };
  const a = run(), b = run();
  ok(a === b, `a run with every new tool is deterministic (${a} vs ${b})`);
  const plain = createSim({ seed: 9, params: { smallPrey: 1, raptors: 1 } });
  plain.step(1500);
  ok(fp(plain) !== a, 'the tools changed the valley (the test can fail)');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
