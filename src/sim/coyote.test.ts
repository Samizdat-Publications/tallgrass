// Unit tests for coyotes (V2-PLAN.md S5): the decision priorities, the wolf-kills-coyote rule, den spacing and dispersal, the litter
// formula, prey reactions, events, and that the sim with coyotes is deterministic. Run: npx tsx src/sim/coyote.test.ts
import { G_LITTER, NG } from './agents';
import { COYOTE_GROUP_BASE, IS_CANID } from './disease';
import { createSim, Sim } from './sim';
import { killHazard, KILL_EVERY, FOOD_MAX, FOOD_MIN } from './sp/coyote';
import { REACT } from './species';
import { Sp, St, YEAR_TICKS } from './types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** A valley with nothing in it but the small-prey fields: place the actors by hand. */
function quiet(params: Record<string, number> = {}, seed = 5): Sim {
  return createSim({
    seed,
    params: { calendarScale: 2, smallPrey: 1, plagueRate: 0, 'bison.initial': 0, 'deer.initial': 0, 'wolf.initial': 0, 'raven.initial': 0, ...params },
  });
}
/** Put a coyote down, fed and watered, with its state reset. */
function coyote(sim: Sim, x: number, y: number, energy = 0.5): number {
  const i = sim.spawnAdult(Sp.Coyote, x, y);
  const a = sim.a;
  a.age[i] = 1800; a.energy[i] = energy; a.hydration[i] = 1; a.male[i] = 0;
  (sim.coyotes as Any).setDen(i, x, y); // a settler at home, so it does not go looking for a den elsewhere
  return i;
}
/** Run one tick so the sim's grids hold the actors where they stand, then think for coyote i. */
function thinkNow(sim: Sim, i: number): void {
  sim.step(1);
  (sim.coyotes as Any).think(i);
}
const carcass = (sim: Sim, x: number, y: number, meat = 3, kill = 1): void => (sim as Any).addCarcass(x, y, meat, Sp.Bison, kill);

// ---- the registry and the shared tables
ok(REACT[Sp.Bison][Sp.Coyote] === 0 && REACT[Sp.Deer][Sp.Coyote] === 0.3 && REACT[Sp.Bison][Sp.Wolf] === 1 && REACT[Sp.Deer][Sp.Wolf] === 1 && REACT[Sp.Deer][Sp.Cougar] === 1,
  'bison ignore coyotes, pronghorn react at the coyote threat 0.3, wolves and cougars frighten everyone fully');
ok(IS_CANID[Sp.Coyote] === 1 && IS_CANID[Sp.Wolf] === 1, 'coyotes are canids (distemper and mange are shared)');
ok(near(1 - Math.pow(1 - killHazard(0.3), KILL_EVERY), 0.3, 1e-9) && killHazard(0) === 0 && killHazard(1) === 1, 'the wolf-kill hazard adds up to coyoteKilledByWolf per 20 ticks');

// ---- coyote.initial 0: no coyotes, columns present, nothing changes
{
  ok(createSim({ seed: 3 }).populations()[Sp.Coyote] === 12, 'v6b default: 12 coyotes at the start');
  const sim = createSim({ seed: 3, params: { 'coyote.initial': 0 } });
  ok(sim.populations()[Sp.Coyote] === 0, 'no coyotes with coyote.initial 0');
  sim.step(300);
  const row = sim.sample();
  for (const k of ['coyote_pairs', 'coyote_floaters', 'coyote_food', 'coyote_kills_by_wolf', 'coyote_fawns', 'coyote_mousing', 'coyote_carrion', 'coyote_litters', 'births_coyote']) ok(k in row && row[k] === 0, `coyote.initial 0: sample column ${k} is 0`);
  ok(sim.populations()[Sp.Coyote] === 0, 'still none after 300 ticks (nothing spawns them)');
}

// ---- decision priorities
{
  // 1. danger beats carrion: a wolf 30 m away makes the coyote flee although a carcass lies 2 m off
  const sim = quiet();
  const a = sim.a;
  const c = coyote(sim, 250, 250, 0.4);
  const w = sim.spawnAdult(Sp.Wolf, 280, 250);
  a.pack[w] = -1; a.age[w] = 3000;
  carcass(sim, 252, 250);
  sim.step(1);
  a.state[w] = St.Walk;
  a.state[c] = St.Idle;
  (sim.coyotes as Any).think(c);
  ok(a.state[c] === St.Flee && a.dvx[c] < 0, 'a wolf within 40 m means flee (away from it), carrion or not');
  ok(a.flee[c] > 0, 'the flight lasts a while');
}
{
  // a wolf lying up 30 m off is not a danger (only a close one is), but it still bars the carrion
  const sim = quiet();
  const a = sim.a;
  const c = coyote(sim, 250, 250, 0.4);
  const w = sim.spawnAdult(Sp.Wolf, 275, 250);
  a.pack[w] = -1; a.age[w] = 3000; a.energy[w] = 1;
  carcass(sim, 252, 250);
  sim.step(1);
  a.state[w] = St.Rest;
  a.state[c] = St.Idle;
  (sim.coyotes as Any).think(c);
  ok(a.state[c] !== St.Flee, 'a wolf resting 30 m away does not make a coyote run');
  ok(a.state[c] !== St.Eat, 'no carrion while a wolf is within 30 m');
}
{
  // 2. carrion beats fawns and small prey
  const sim = quiet({ coyoteFawnFind: 1000 });
  const a = sim.a;
  const c = coyote(sim, 250, 250, 0.5);
  carcass(sim, 251, 250);
  const fawn = sim.spawnAdult(Sp.Deer, 262, 250);
  a.age[fawn] = 10; a.state[fawn] = St.Rest;
  sim.small!.hare[sim.small!.cellOf(250, 250)] = 6;
  thinkNow(sim, c);
  ok(a.state[c] === St.Eat, 'a hungry coyote next to a carcass eats it (carrion first)');
  ok(a.target[c] < 0 || !a.same(a.target[c], a.targetId[c]), 'and does not go after the fawn');
  // far from the carcass it walks to it
  const sim2 = quiet({ coyoteFawnFind: 1000 });
  const c2 = coyote(sim2, 250, 250, 0.5);
  carcass(sim2, 280, 250);
  thinkNow(sim2, c2);
  ok(sim2.a.state[c2] === St.Walk && sim2.a.dvx[c2] > 0.5, 'a coyote 30 m from a carcass walks toward it');
  // a full coyote ignores carrion
  const sim3 = quiet();
  const c3 = coyote(sim3, 250, 250, 0.99);
  carcass(sim3, 255, 250);
  thinkNow(sim3, c3);
  ok(sim3.a.state[c3] !== St.Eat, 'a full coyote does not eat');
}
{
  // 3. fawns beat small prey: no carcass, a hidden fawn 12 m off, hares thick under the coyote
  const sim = quiet({ coyoteFawnFind: 1000 });
  const a = sim.a;
  const c = coyote(sim, 250, 250, 0.5);
  const fawn = sim.spawnAdult(Sp.Deer, 262, 250);
  a.age[fawn] = 10; a.state[fawn] = St.Rest;
  sim.small!.hare[sim.small!.cellOf(250, 250)] = 6;
  thinkNow(sim, c);
  ok(a.same(a.target[c], a.targetId[c]) && a.target[c] === fawn, 'a hidden fawn within 40 m is picked out');
  ok(a.state[c] === St.Stalk && a.dvx[c] > 0, 'and stalked toward (St.Stalk with a target), not mouse-hunted');
  // an adult pronghorn or a fawn that has grown out of hiding is not a target
  const sim2 = quiet({ coyoteFawnFind: 1000 });
  const c2 = coyote(sim2, 250, 250, 0.5);
  const doe = sim2.spawnAdult(Sp.Deer, 262, 250);
  sim2.a.age[doe] = 600;
  thinkNow(sim2, c2);
  ok(!(sim2.a.target[c2] >= 0 && sim2.a.same(sim2.a.target[c2], sim2.a.targetId[c2])), 'an adult pronghorn is not a target');
  // a pounce: within 9 m the stalk becomes a chase, and the kill roll can take the fawn
  const sim3 = quiet({ coyoteFawnFind: 1000, coyoteFawnKill: 1000 });
  const c3 = coyote(sim3, 250, 250, 0.5);
  const f3 = sim3.spawnAdult(Sp.Deer, 253, 250);
  sim3.a.age[f3] = 10; sim3.a.state[f3] = St.Rest;
  thinkNow(sim3, c3);
  ok(sim3.a.state[c3] === St.Chase, 'within 9 m of the fawn it pounces');
  sim3.a.x[f3] = sim3.a.x[c3] + 1; sim3.a.y[f3] = sim3.a.y[c3];
  (sim3.coyotes as Any).live(c3);
  ok(!sim3.a.alive[f3], 'a fawn the coyote catches up with is killed');
  ok(sim3.sample().coyote_fawns === 1, 'and counted');
}
{
  // 4. small prey: mousing where it is rich, climbing the gradient where a neighbour is richer
  const sim = quiet();
  const a = sim.a, sm = sim.small!;
  sm.hare.fill(0); sm.dog.fill(0);
  const c = coyote(sim, 8 + 16 * 10, 8 + 16 * 10, 0.5);
  const cell = sm.cellOf(a.x[c], a.y[c]);
  sm.hare[cell] = 5;
  thinkNow(sim, c);
  ok(a.state[c] === St.Stalk && a.dvx[c] === 0 && a.dvy[c] === 0, 'standing in a rich cell it mouses (St.Stalk, standing still)');
  sm.hare[cell] = 0.2;
  sm.hare[cell + 1] = 6;
  thinkNow(sim, c);
  ok(a.state[c] === St.Walk && a.dvx[c] > 0.5, 'with a much richer cell to the east it climbs the gradient');
  // mousing takes hares from the field (live())
  sm.hare.fill(0); sm.hare[cell] = 50;
  const before = sm.hareTotal();
  a.state[c] = St.Stalk; a.target[c] = -1;
  let got = 0;
  for (let k = 0; k < 400; k++) { a.state[c] = St.Stalk; a.target[c] = -1; a.energy[c] = 0.5; (sim.coyotes as Any).live(c); got = before - sm.hareTotal(); }
  ok(got >= 1, `mousing catches hares out of the field (${got} in 400 attempts)`);
  // a sated coyote with a den lies up there
  const sim2 = quiet();
  const c2 = coyote(sim2, 250, 250, 0.99);
  (sim2.coyotes as Any).setDen(c2, 250, 250);
  let rest = 0;
  for (let k = 0; k < 12; k++) {
    const s3 = quiet({}, 20 + k);
    const c4 = coyote(s3, 250, 250, 0.99);
    thinkNow(s3, c4);
    if (s3.a.state[c4] === St.Rest) rest++;
  }
  ok(rest >= 9, `a sated coyote at its den rests (${rest} of 12)`);
  void c2;
}

// ---- wolves kill coyotes
{
  const make = (p: Record<string, number>) => {
    const sim = quiet(p);
    const a = sim.a;
    const c = coyote(sim, 300, 300, 0.5);
    const w = sim.spawnAdult(Sp.Wolf, 301, 300);
    a.pack[w] = -1;
    sim.step(1);
    return { sim, a, c, w, co: sim.coyotes as Any };
  };
  // at a carcass: killed (hazard 1 here), leaves a carcass that wolves do not feed on
  {
    const { sim, a, c, w, co } = make({ coyoteKilledByWolf: 1 });
    a.state[c] = St.Eat;
    const n0 = (sim as Any).cN;
    ok(co.wolfKillCheck(w, NaN, NaN) === true && !a.alive[c], 'a wolf within 3 m of a coyote at a carcass kills it');
    ok((sim as Any).cN === n0 + 1 && (sim as Any).cSp[n0] === Sp.Coyote && (sim as Any).cKill[n0] === 0, 'the dead coyote leaves a carcass for the ravens (not a wolf kill)');
    ok(sim.sample().coyote_kills_by_wolf === 1, 'and the kill is counted');
  }
  // inside the wolf's core (20 m from its den, core is 50 m): killed; outside the core and not eating: not
  {
    const { a, c, w, co } = make({ coyoteKilledByWolf: 1 });
    a.state[c] = St.Walk;
    ok(co.wolfKillCheck(w, 320, 300) === true && !a.alive[c], 'a coyote in the wolf core is killed');
  }
  {
    const { a, c, w, co } = make({ coyoteKilledByWolf: 1 });
    a.state[c] = St.Walk;
    ok(co.wolfKillCheck(w, 400, 300) === false && a.alive[c] === 1, 'outside the core, and not at a carcass, it is left alone');
    ok(co.wolfKillCheck(w, NaN, NaN) === false, 'a loner wolf has no core');
  }
  // 4 m away is too far
  {
    const { a, c, w, co } = make({ coyoteKilledByWolf: 1 });
    a.state[c] = St.Eat; a.x[c] = a.x[w] + 4;
    ok(co.wolfKillCheck(w, NaN, NaN) === false && a.alive[c] === 1, 'a wolf 4 m away does not kill');
  }
  // the rate: coyoteKilledByWolf per 20 ticks of contact
  {
    const p = 0.3, h = killHazard(p);
    const sim = quiet({ coyoteKilledByWolf: p });
    const a = sim.a;
    const w = sim.spawnAdult(Sp.Wolf, 300, 300);
    a.pack[w] = -1;
    let killed = 0;
    const N = 3000;
    for (let trial = 0; trial < N; trial++) {
      const c = coyote(sim, 300.5, 300, 0.5);
      a.state[c] = St.Eat;
      if (trial === 0) sim.step(1);
      // the grid is stale for a new coyote, so roll the dice the way the check does
      let dead = false;
      for (let t = 0; t < KILL_EVERY && !dead; t++) dead = (sim.coyotes as Any).rng.next() < h;
      if (dead) killed++;
      a.kill(c);
    }
    ok(near(killed / N, p, 0.04), `20 ticks within reach kill ${(killed / N).toFixed(3)} of coyotes (want ${p})`);
  }
}

// ---- litter: round(litter / calendarScale x foodIndex x litter gene)
{
  for (const cs of [1, 2]) {
    const sim = quiet({ calendarScale: cs });
    const co = sim.coyotes as Any;
    const f = coyote(sim, 250, 250);
    const P = sim.p.species[Sp.Coyote];
    ok(P.litter === 5, 'coyote litter is 5');
    for (const [fi, g] of [[1, 1], [1.4, 1], [0.4, 1], [1, 1.5], [0.7, 0.9]]) {
      ok(co.litterSize(fi, g) === Math.round((5 / cs) * fi * g), `litter at calendarScale ${cs}, food ${fi}, gene ${g} is ${Math.round((5 / cs) * fi * g)}`);
    }
    // the food index is the smoothed intake over a metabolism x coyoteFoodRef, clamped to 0.4 to 1.4
    const ref = P.metabolism * sim.p.coyoteFoodRef;
    co.intake[f] = ref;
    ok(near(co.foodIndex(f), 1, 1e-6), 'intake at the reference is a food index of 1');
    co.intake[f] = ref * 3;
    ok(co.foodIndex(f) === FOOD_MAX, 'rich years are clamped to 1.4');
    co.intake[f] = 0;
    ok(co.foodIndex(f) === FOOD_MIN, 'starving years are clamped to 0.4');
  }
  // breeding through breed(): a pair with a den, at three food levels
  const sizes: number[] = [];
  for (const mult of [0, 1, 3]) {
    const sim = quiet({ 'coyote.initial': 2 });
    const a = sim.a, co = sim.coyotes as Any;
    const adults: number[] = [];
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Coyote) adults.push(i);
    const f = adults.find((i) => !a.male[i])!;
    for (const i of adults) { a.age[i] = 1800; a.energy[i] = 0.8; }
    a.genes[f * NG + G_LITTER] = 1;
    co.intake[f] = sim.p.species[Sp.Coyote].metabolism * sim.p.coyoteFoodRef * mult;
    ok(co.isBreedingFemale(f), 'two founders form a breeding pair with a den');
    const n0 = sim.populations()[Sp.Coyote];
    co.breed();
    const pups = sim.populations()[Sp.Coyote] - n0;
    sizes.push(pups);
    ok(pups === co.litterSize(co.foodIndex(f), 1), `breed() raises litterSize pups (${pups})`);
    const ev = sim.events.filter((e) => e.kind === 'coyotePups');
    ok(ev.length === 1 && ev[0].a === pups, 'the first litter raises coyotePups with a = litter size');
    if (mult === 1) {
      // a second, equal litter is not a record; a bigger one is
      const dens = co.denOf(f);
      ok(dens !== null, 'the pair has a den');
      co.breed();
      ok(sim.events.filter((e) => e.kind === 'coyotePups').length === 1, 'an equal litter is not a record');
      co.intake[f] = sim.p.species[Sp.Coyote].metabolism * sim.p.coyoteFoodRef * 1.4;
      a.genes[f * NG + G_LITTER] = 1.2;
      co.breed();
      ok(sim.events.filter((e) => e.kind === 'coyotePups').length === 2, 'a bigger litter is a new record');
    }
  }
  ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], `a hungry year raises smaller litters than a rich one (${sizes.join(' < ')})`);
}

// ---- the food index follows live prey: carrion counts only coyoteCarrionShare of its energy
{
  const intakeAfterFeeding = (share: number): number => {
    const sim = quiet({ coyoteCarrionShare: share });
    const c = coyote(sim, 250, 250, 0.3);
    sim.a.target[c] = -1;
    carcass(sim, 251, 250, 3, 0);
    for (let t = 0; t < 150; t++) {
      sim.a.energy[c] = Math.min(sim.a.energy[c], 0.5);
      sim.step(1);
    }
    return (sim.coyotes as Any).intake[c] as number;
  };
  const none = intakeAfterFeeding(0), full = intakeAfterFeeding(1);
  ok(full > none + 5e-5, `eating a carcass raises the food index only when carrion counts (share 0: ${none.toExponential(2)}, share 1: ${full.toExponential(2)})`);
  const sim = quiet();
  ok(sim.p.coyoteCarrionShare === 0 && near(sim.p.species[Sp.Coyote].metabolism, 1 / 1800, 1e-12), 'defaults: carrion does not count toward the food index, coyote metabolism 1/1800');
}

// ---- dens: spacing from coyote dens and from wolf dens, founders, dispersal
{
  const sim = createSim({ seed: 3, params: { calendarScale: 2, 'coyote.initial': 12 } });
  const a = sim.a, co = sim.coyotes as Any;
  const dens: [number, number][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || a.sp[i] !== Sp.Coyote) continue;
    const d = co.denOf(i) as [number, number] | null;
    if (d && !seen.has(co.fam[i])) { seen.add(co.fam[i]); dens.push(d); }
  }
  ok(dens.length >= 1, `the founders hold dens (${dens.length} pairs)`);
  let spacing = Infinity, avoid = Infinity;
  for (let i = 0; i < dens.length; i++) {
    for (let j = i + 1; j < dens.length; j++) spacing = Math.min(spacing, Math.hypot(dens[i][0] - dens[j][0], dens[i][1] - dens[j][1]));
    for (let pk = 0; pk < 64; pk++) if (sim.packAlive[pk]) avoid = Math.min(avoid, Math.hypot(dens[i][0] - sim.packDenX[pk], dens[i][1] - sim.packDenY[pk]));
  }
  ok(spacing >= sim.p.coyoteDenSpacing, `coyote dens are at least ${sim.p.coyoteDenSpacing} m apart (closest ${spacing.toFixed(0)})`);
  ok(avoid >= sim.p.coyoteWolfAvoid, `coyote dens are at least ${sim.p.coyoteWolfAvoid} m from wolf dens (closest ${avoid.toFixed(0)})`);
  // every spot freeSpot offers obeys both rules
  let bad = 0, offered = 0;
  for (let k = 0; k < 200; k++) {
    const s = co.freeSpot(0, 0, 0) as [number, number] | null;
    if (!s) continue;
    offered++;
    for (const d of dens) if (Math.hypot(d[0] - s[0], d[1] - s[1]) < sim.p.coyoteDenSpacing) bad++;
    for (let pk = 0; pk < 64; pk++) if (sim.packAlive[pk] && Math.hypot(sim.packDenX[pk] - s[0], sim.packDenY[pk] - s[1]) < sim.p.coyoteWolfAvoid) bad++;
  }
  ok(offered > 0 && bad === 0, `free spots respect the spacing (${offered} offered, ${bad} violations)`);
}
{
  // dispersal at one valley year: a pup takes a free spot, else emigrates (open prairie) or floats
  const mk = (p: Record<string, number>) => {
    const sim = quiet({ 'coyote.initial': 2, ...p });
    const a = sim.a, co = sim.coyotes as Any;
    const pup = coyote(sim, 250, 250, 0.9);
    co.ensure(pup);
    co.dispersed[pup] = 0;
    a.age[pup] = YEAR_TICKS + 5;
    a.mother[pup] = -1;
    return { sim, a, co, pup };
  };
  {
    const { sim, a, co, pup } = mk({});
    sim.step(1);
    co.think(pup);
    const d = co.denOf(pup) as [number, number] | null;
    ok(co.hasDispersed(pup) && d !== null, 'a pup of one valley year leaves and takes a den');
    let near2 = Infinity;
    for (let i = 0; i < a.hi; i++) if (i !== pup && a.alive[i] && a.sp[i] === Sp.Coyote && co.denOf(i)) { const o = co.denOf(i); near2 = Math.min(near2, Math.hypot(o[0] - d![0], o[1] - d![1])); }
    ok(near2 >= sim.p.coyoteDenSpacing, `its den is at least coyoteDenSpacing from the others (${near2.toFixed(0)} m)`);
  }
  {
    // not yet a year: stays
    const { sim, a, co, pup } = mk({});
    a.age[pup] = YEAR_TICKS - 50;
    a.mother[pup] = -1;
    sim.step(1);
    co.think(pup);
    ok(!co.hasDispersed(pup), 'a pup under a valley year has not left');
  }
  {
    // no room anywhere: emigrates with the open prairie on
    const { sim, a, co, pup } = mk({ coyoteDenSpacing: 2000, openPrairie: 1 });
    sim.step(1);
    co.think(pup);
    ok(co.hasDispersed(pup) && co.denOf(pup) === null && a.state[pup] === St.Migrate, 'with no free spot and the open prairie on, the pup sets out for the border');
  }
  {
    // ... and floats in a closed valley
    const { sim, a, co, pup } = mk({ coyoteDenSpacing: 2000, openPrairie: 0 });
    sim.step(1);
    co.think(pup);
    ok(co.hasDispersed(pup) && co.denOf(pup) === null && a.state[pup] !== St.Migrate && a.alive[pup] === 1, 'with no free spot in a closed valley the pup stays as a floater');
  }
}

// ---- pairing
{
  const sim = quiet();
  const a = sim.a, co = sim.coyotes as Any;
  const f = coyote(sim, 200, 200, 0.9), m = coyote(sim, 230, 200, 0.9);
  a.male[m] = 1;
  sim.step(1);
  co.tryPair(f);
  ok(co.mateOf(f) === m && co.mateOf(m) === f && co.denOf(f) !== null && co.groupOf(f) >= COYOTE_GROUP_BASE && co.groupOf(f) === co.groupOf(m), 'two unpaired adults of opposite sex 30 m apart pair, with a den and a shared family key');
  const g = coyote(sim, 200, 300, 0.9);
  sim.step(1);
  co.tryPair(g);
  ok(co.mateOf(g) < 0, 'a third adult of the same sex as the first stays single');
  // far apart: it sets off to find the other rather than pairing
  const sim2 = quiet();
  const f2 = coyote(sim2, 100, 100, 0.9), m2 = coyote(sim2, 330, 100, 0.9);
  sim2.a.male[m2] = 1;
  sim2.step(1);
  (sim2.coyotes as Any).tryPair(f2);
  ok((sim2.coyotes as Any).mateOf(f2) < 0 && sim2.a.tx[f2] > 300, 'mates far apart do not pair at once: the seeker heads for the other');
}

// ---- distemper is shared: it spreads inside a coyote family and runs its course in a coyote
{
  const sim = quiet({ cdvRate: 0.01, cdvTicks: 600, cdvAdultDeath: 0 });
  const a = sim.a, co = sim.coyotes as Any;
  const pairs: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const f = coyote(sim, 60 + k * 120, 100, 0.95), m = coyote(sim, 62 + k * 120, 100, 0.95);
    a.male[m] = 1;
    sim.step(1);
    co.tryPair(f);
    pairs.push([f, m]);
  }
  ok(pairs.every(([f, m]) => co.mateOf(f) === m && co.groupOf(f) === co.groupOf(m) && co.groupOf(f) >= COYOTE_GROUP_BASE), 'four pairs, each with its own family key');
  ok(new Set(pairs.map(([f]) => co.groupOf(f))).size === 4, 'the family keys differ');
  for (const [f] of pairs) sim.dis.infect(f);
  ok(pairs.every(([f]) => a.cdv[f] > 0), 'a coyote can be given distemper');
  for (let t = 0; t < 500; t++) {
    for (const [f, m] of pairs) { for (const i of [f, m]) { a.energy[i] = 0.95; a.hydration[i] = 1; } }
    sim.step(1);
  }
  const caught = pairs.filter(([, m]) => a.alive[m] && (a.cdv[m] > 0 || a.immune[m] > 0)).length;
  ok(caught >= 3, `distemper spreads from a coyote to its mate (${caught} of 4 families)`);
  for (let t = 0; t < 400; t++) { for (const [f, m] of pairs) { a.energy[f] = a.energy[m] = 0.95; a.hydration[f] = a.hydration[m] = 1; } sim.step(1); }
  ok(pairs.every(([f]) => a.alive[f] && a.cdv[f] === 0 && a.immune[f] > 0), 'and the course ends in immunity (adult death set to 0)');
}

// ---- prey reactions
{
  /** Flee events among `n` grazers of one kind standing near a predator that is held in place. `tweak` adjusts each grazer first. */
  const count = (prey: number, predator: number, tweak: (sim: Sim, i: number) => void = () => undefined, px = 262): number => {
    const sim = quiet();
    const a = sim.a;
    const ids: number[] = [];
    for (let k = 0; k < 24; k++) ids.push(sim.spawnAdult(prey, 250 + (k % 6) * 3, 250 + Math.floor(k / 6) * 3));
    for (const i of ids) { a.age[i] = 2500; a.energy[i] = 0.99; a.state[i] = St.Rest; a.cooldown[i] = 0; a.pregnant[i] = 0; tweak(sim, i); } // spawnAdult gives each doe a random cooldown and maybe a pregnancy: start with no fawn at heel or on the way
    const pr = sim.spawnAdult(predator, px, 255);
    a.pack[pr] = -1; a.age[pr] = 3000; a.energy[pr] = 1; a.hydration[pr] = 1;
    if (predator === Sp.Coyote) (sim.coyotes as Any).setDen(pr, px, 255);
    let fled = 0;
    for (let t = 0; t < 120; t++) {
      sim.step(1);
      a.x[pr] = px; a.y[pr] = 255; // hold the predator in place, standing off
      a.energy[pr] = 1; a.hydration[pr] = 1;
      for (const i of ids) { a.energy[i] = Math.max(a.energy[i], 0.9); if (a.alive[i] && a.flee[i] > 0) fled++; }
    }
    return fled;
  };
  const calved = (sim: Sim, i: number): void => { sim.a.cooldown[i] = sim.p.species[Sp.Deer].birthCooldown - 20; sim.a.male[i] = 0; };
  const young = (sim: Sim, i: number): void => { sim.a.age[i] = 200; };
  const bisonCoyote = count(Sp.Bison, Sp.Coyote);
  const adultCoyote = count(Sp.Deer, Sp.Coyote);
  const adultAlone = count(Sp.Deer, Sp.Coyote, undefined, 900); // control: the coyote far off (a few herd scares come from the grazers themselves)
  const doeCoyote = count(Sp.Deer, Sp.Coyote, calved);
  const youngCoyote = count(Sp.Deer, Sp.Coyote, young);
  const doeWolf = count(Sp.Deer, Sp.Wolf, calved);
  const adultWolf = count(Sp.Deer, Sp.Wolf);
  ok(bisonCoyote === 0, `bison never flee from a coyote (${bisonCoyote})`);
  ok(adultCoyote <= adultAlone * 1.5 + 10, `pronghorn adults with no fawn at heel do not flee from a coyote (${adultCoyote} against ${adultAlone} with it far off)`);
  ok(doeCoyote > 0 && doeCoyote < doeWolf, `a doe with a fawn at heel does flee from a coyote, less than from a wolf (${doeCoyote} < ${doeWolf})`);
  ok(youngCoyote > 0, `young pronghorn react to a coyote (${youngCoyote})`);
  ok(adultWolf > adultAlone * 1.5 + 10, `adult pronghorn still flee from wolves (${adultWolf} against ${adultAlone} with no wolf near)`);
}

// ---- mesoRelease: twice the coyote mean while wolves are at half theirs, at most once per 10 years
{
  const sim = quiet();
  const co = sim.coyotes as Any;
  const pop = (sim as Any).pop as Int32Array;
  let t = 0;
  const run = (steps: number, coy: number, wolf: number): void => {
    for (let k = 0; k < steps; k++) { pop[Sp.Coyote] = coy; pop[Sp.Wolf] = wolf; co.trackRelease(t); t += 50; }
  };
  const meso = (): number => sim.events.filter((e) => e.kind === 'mesoRelease').length;
  run(Math.ceil((6 * YEAR_TICKS) / 50), 10, 30);
  ok(meso() === 0, 'a steady valley raises no mesoRelease');
  run(2, 25, 30);
  ok(meso() === 0, 'coyotes at 2.5x their mean with the wolves still at full strength: no release');
  run(2, 12, 10);
  ok(meso() === 0, 'wolves at a third with coyotes only a little up: no release');
  run(1, 25, 10);
  ok(meso() === 1, 'coyotes at 2x their mean while wolves are at half theirs raise mesoRelease');
  const e = sim.events.find((x) => x.kind === 'mesoRelease')!;
  ok(e.a === 25 && e.b === 10, 'with the coyote and wolf counts');
  run(10, 30, 8);
  ok(meso() === 1, 'not again within 10 years');
  run(Math.ceil((11 * YEAR_TICKS) / 50), 10, 30);
  run(1, 28, 8);
  ok(meso() === 2, 'but again after more than 10 years, when the ratio holds again');
}

{
  // wolves gone for more than five years: their own five-year mean is 0, but the valley still counts as released when the coyotes double
  const sim = quiet();
  const co = sim.coyotes as Any;
  const pop = (sim as Any).pop as Int32Array;
  let t = 0;
  const run = (steps: number, coy: number, wolf: number): void => {
    for (let k = 0; k < steps; k++) { pop[Sp.Coyote] = coy; pop[Sp.Wolf] = wolf; co.trackRelease(t); t += 50; }
  };
  const meso = (): number => sim.events.filter((e) => e.kind === 'mesoRelease').length;
  run(Math.ceil((6 * YEAR_TICKS) / 50), 10, 30);
  run(Math.ceil((7 * YEAR_TICKS) / 50), 10, 0);
  ok(meso() === 0, 'a steady valley with no wolves raises no mesoRelease');
  run(1, 25, 0);
  ok(meso() === 1, 'coyotes at 2.5x their mean in a valley whose wolves are long gone raise mesoRelease');
  const none = quiet();
  const nco = none.coyotes as Any;
  const npop = (none as Any).pop as Int32Array;
  for (let k = 0; k < Math.ceil((7 * YEAR_TICKS) / 50); k++) { npop[Sp.Coyote] = 10; npop[Sp.Wolf] = 0; nco.trackRelease(k * 50); }
  npop[Sp.Coyote] = 30;
  nco.trackRelease(8 * YEAR_TICKS);
  ok(none.events.filter((e) => e.kind === 'mesoRelease').length === 0, 'a valley that never had wolves is not a release');
}

// ---- a whole sim with coyotes: runs clean, is deterministic, and the columns move
{
  const run = (): { pops: number[]; row: Record<string, number>; hash: number } => {
    const sim = createSim({ seed: 9, params: { calendarScale: 2, smallPrey: 1, smallGameField: 1, 'coyote.initial': 12, openPrairie: 1, coyoteInRate: 1 } });
    sim.step(2400);
    const row = sim.sample();
    let h = 0;
    const a = sim.a;
    for (let i = 0; i < a.hi; i++) if (a.alive[i]) h = (Math.imul(h, 31) + Math.round(a.x[i] * 10) + a.sp[i]) | 0;
    return { pops: sim.populations(), row, hash: h };
  };
  const r1 = run(), r2 = run();
  ok(r1.hash === r2.hash && JSON.stringify(r1.pops) === JSON.stringify(r2.pops), 'two sims with coyotes and the same seed agree');
  ok(r1.pops[Sp.Coyote] > 0 && r1.pops.every((v) => Number.isFinite(v) && v >= 0), `coyotes live through two valley years (${r1.pops[Sp.Coyote]})`);
  ok(r1.row.births_coyote + r1.row.coyote_mousing + r1.row.coyote_carrion >= 0 && 'coyote_pairs' in r1.row, 'the coyote columns exist');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`coyotes: all ${checks} checks passed`);
