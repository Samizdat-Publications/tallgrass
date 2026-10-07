// Unit tests for the raptors (V2-PLAN.md S7): golden eagles and red-tailed hawks. Run: npx tsx src/sim/raptor.test.ts
import { Sim } from './sim';
import { createSim, defaultParams } from './testpins';
import { flightStep, FLEDGE_AGE, Mode, NEST_TREE_MIN, PERCH_FRAC } from './sp/raptor';
import { GAIN, TAKE_KINDS } from './smallprey';
import { AGENT_STRIDE, F_JUVENILE, F_MIGRANT, SEASON_TICKS, Sp, St, YEAR_TICKS } from './types';

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

/** A valley with nothing in it but the small-prey fields. */
function quiet(params: Record<string, number> = {}, seed = 5): Sim {
  return createSim({
    seed,
    params: { calendarScale: 2, smallPrey: 1, plagueRate: 0, ravenVagrants: 0, cdvRate: 0, mangeRate: 0, 'bison.initial': 0, 'deer.initial': 0, 'wolf.initial': 0, 'raven.initial': 0, 'coyote.initial': 0, ...params },
  });
}
/** Hold the time of day (0.5 = noon, 0.9 = night) whatever the tick. */
function pinDay(sim: Sim, f: number): void {
  const env = sim.env as Any;
  const upd = env.update.bind(env);
  env.update = (t: number): void => { upd(t); env.state.dayFrac = f; };
}
const R = (sim: Sim): Any => sim.raptors as Any;
const count = (sim: Sim, sp: number): number => sim.populations()[sp];
const eventsOf = (sim: Sim, kind: string) => sim.events.filter((e) => e.kind === kind);
function place(sim: Sim, sp: number, x: number, y: number, energy: number, alt = 30): number {
  const i = sim.spawnAdult(sp, x, y);
  const a = sim.a;
  a.age[i] = 2000; a.energy[i] = energy; a.hydration[i] = 1; a.alt[i] = alt; a.state[i] = St.Fly;
  return i;
}
/** Make a coarse cell rich in hares (and clear the rest of the fields). */
function richCell(sim: Sim, x: number, y: number, hares = 30): void {
  const sm = sim.small!;
  sm.hare.fill(0);
  sm.dog.fill(0);
  sm.hare[sm.cellOf(x, y)] = hares;
}
/** Tick of the first year in which yearTick is yt (the sim opens at season 1.8, so tick 0 is yearTick 1.8 x SEASON_TICKS). */
const tickAtYt = (yt: number, year = 0): number => ((yt - Math.round(1.8 * SEASON_TICKS) + YEAR_TICKS) % YEAR_TICKS) + year * YEAR_TICKS;

// ---- the shared flight integrator is the raven's, unchanged
{
  const sim = quiet();
  const a = sim.a;
  const i = place(sim, Sp.Raven, 100, 100, 0.8, 10);
  a.vx[i] = 2; a.vy[i] = -1; a.dvx[i] = 6; a.dvy[i] = 3; a.heading[i] = 0;
  flightStep(a, i, 0.15, 512, 30, 0.03, 0.08);
  ok(near(a.alt[i], 10 + (30 - 10) * 0.03, 1e-6), 'flightStep eases the height by altGain');
  ok(near(a.vx[i], 2 + (6 - 2) * 0.08, 1e-6) && near(a.vy[i], -1 + (3 + 1) * 0.08, 1e-6), 'flightStep eases the velocity by velGain');
  ok(near(a.x[i], 100 + a.vx[i] * 0.15, 1e-4) && near(a.heading[i], Math.atan2(a.vy[i], a.vx[i]), 1e-6), 'flightStep moves and faces the way it goes');
}

// ---- defaults: no raptors, columns present at 0, no events
{
  const sim = createSim({ seed: 3 });
  sim.step(300);
  const row = sim.sample();
  ok(count(sim, Sp.Eagle) === 0 && count(sim, Sp.Hawk) === 0, 'no raptors by default');
  for (const k of ['pop_eagle', 'pop_hawk', 'hawk_nests', 'hawk_fledged', 'eagle_carcass_ticks', 'raptor_yields', 'raptor_takes_hare', 'raptor_takes_dog', 'births_hawk']) ok(k in row && row[k] === 0, `default sample column ${k} is 0`);
  for (const kind of TAKE_KINDS) ok(`takes_hare_${kind}` in row && `takes_dog_${kind}` in row, `takes columns for ${kind}`);
  ok(eventsOf(sim, 'eaglesArrive').length === 0 && eventsOf(sim, 'hawksReturn').length === 0, 'no raptor events by default');
}

// ---- eagles: winter visitors through the open prairie
{
  const sim = quiet({ raptors: 1, openPrairie: 1 });
  const t0 = tickAtYt(Math.round(2.5 * SEASON_TICKS));
  sim.step(t0 + 5);
  const ev = eventsOf(sim, 'eaglesArrive');
  ok(ev.length === 1 && ev[0].tick === t0 && ev[0].sp === Sp.Eagle, 'eaglesArrive fires at season 2.5');
  const n = ev[0]?.a ?? 0;
  ok(n >= 2 && n <= 6 && count(sim, Sp.Eagle) === n, `a group of 2 to 6 eagles arrives and they are all alive (${n})`);
  const snap = sim.snapshot(false);
  let migrants = 0, eagles = 0;
  for (let k = 0; k < snap.count; k++) {
    const o = k * AGENT_STRIDE;
    if (snap.agents[o] !== Sp.Eagle) continue;
    eagles++;
    if ((snap.agents[o + 8] & F_MIGRANT) !== 0 && snap.agents[o + 7] === St.Migrate && snap.agents[o + 9] > 20) migrants++;
  }
  ok(eagles === n && migrants === n, 'the new eagles fly in from the border (St.Migrate, F_MIGRANT, high)');
  sim.step(400);
  const a = sim.a;
  let inside = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Eagle && a.state[i] !== St.Migrate && Math.min(a.x[i], a.y[i], 512 - a.x[i], 512 - a.y[i]) > 10) inside++;
  ok(inside === n, 'the eagles settle inside the valley');
  const row = sim.sample();
  ok(row.imm_eagle === n && row.pop_eagle === n, 'imm_eagle counts the arrival');
  // they leave at season 0.5 and are gone soon after
  sim.step(tickAtYt(Math.round(0.5 * SEASON_TICKS)) - sim.tick + 3);
  let leaving = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Eagle && a.state[i] === St.Migrate && a.target[i] === -2) leaving++;
  ok(leaving === count(sim, Sp.Eagle) && leaving > 0, 'at season 0.5 every eagle heads for the border');
  sim.step(500);
  ok(count(sim, Sp.Eagle) === 0, 'the eagles are gone from the valley by early summer');
  const outRow = sim.sample();
  ok(outRow.emig_eagle + outRow.starved_eagle === n && outRow.emig_eagle >= 1, `emig_eagle counts them out (${outRow.emig_eagle} left, ${outRow.starved_eagle} starved)`);
  ok(sim.events.filter((e) => e.kind === 'extinct').length === 0, 'seasonal absence is not an extinction event');
  // and they are back the next autumn
  sim.step(tickAtYt(Math.round(2.5 * SEASON_TICKS) + 5, 1) - sim.tick);
  ok(eventsOf(sim, 'eaglesArrive').length === 2 && count(sim, Sp.Eagle) >= 2, 'the eagles come again the next winter');
}
{
  // eagles need the open prairie
  const sim = quiet({ raptors: 1, openPrairie: 0 });
  sim.step(tickAtYt(Math.round(2.5 * SEASON_TICKS)) + 100);
  ok(count(sim, Sp.Eagle) === 0 && eventsOf(sim, 'eaglesArrive').length === 0, 'no eagles without openPrairie');
}

// ---- hawks: summer residents nesting in tall cottonwoods
{
  const sim = quiet({ raptors: 1 });
  const a = sim.a;
  sim.step(1);
  const trees = sim.world.trees;
  const nests: [number, number, number][] = [];
  for (let k = 0; k < 8; k++) { const nst = R(sim).nestAt(k); if (nst) nests.push(nst); }
  ok(nests.length >= 2 && nests.length <= 4, `2 to 4 nests at the start (the sim opens in the hawk season): ${nests.length}`);
  ok(nests.every(([x, y, h]) => {
    for (let k = 0; k < trees.length; k += 4) if (trees[k] === x && trees[k + 1] === y && trees[k + 2] === h) return h >= NEST_TREE_MIN;
    return false;
  }), 'every nest is in a real cottonwood at least 11 m tall');
  let spaced = true;
  for (let p = 0; p < nests.length; p++) for (let q = p + 1; q < nests.length; q++) if (Math.hypot(nests[p][0] - nests[q][0], nests[p][1] - nests[q][1]) < defaultParams().hawkNestSpacing) spaced = false;
  ok(spaced, 'nests keep their spacing');
  let adults = 0, young = 0;
  const perNest: number[] = nests.map(() => 0);
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || a.sp[i] !== Sp.Hawk) continue;
    if (a.age[i] < sim.p.species[Sp.Hawk].matureAge) { young++; perNest[R(sim).nestIndexOf(i)]++; } else adults++;
  }
  ok(adults === 2 * nests.length, 'a pair on every nest');
  ok(young >= nests.length && perNest.every((c) => c >= 1 && c <= 3), `1 to 3 young per nest: ${perNest.join(',')}`);
  ok(eventsOf(sim, 'hawksReturn').length === 0, 'the opening pairs are not announced');
  // they leave at season 2.4, before the eagles come
  sim.step(tickAtYt(Math.round(2.4 * SEASON_TICKS)) + 3);
  let off = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Hawk && a.state[i] === St.Migrate && a.target[i] === -2) off++;
  ok(off === count(sim, Sp.Hawk) && off > 0, 'every hawk, young included, heads out at season 2.4');
  sim.step(450);
  ok(count(sim, Sp.Hawk) === 0, 'no hawks in winter');
  ok(R(sim).nestAt(0) === null, 'the nests are cleared');
  // they come back in spring: the event, 2 to 4 pairs, the same trees
  const first = nests.map((n) => `${n[0]},${n[1]}`);
  sim.step(tickAtYt(Math.round(0.3 * SEASON_TICKS)) - sim.tick + 3);
  const ev = eventsOf(sim, 'hawksReturn');
  ok(ev.length === 1 && ev[0].sp === Sp.Hawk && ev[0].a >= 2 && ev[0].a <= 4, 'hawksReturn announces 2 to 4 pairs at season 0.3');
  ok(count(sim, Sp.Hawk) === 2 * ev[0].a, 'both of every pair are alive and on their way in');
  const second: string[] = [];
  for (let k = 0; k < 8; k++) { const nst = R(sim).nestAt(k); if (nst) second.push(`${nst[0]},${nst[1]}`); }
  const small = first.length <= second.length ? first : second, big = first.length <= second.length ? second : first;
  ok(second.length === ev[0].a && small.every((s) => big.includes(s)), 'last year\'s nest trees are used first');
  // by the hatching the pairs are on their nests; the young hatch with a parent at the nest
  sim.step(tickAtYt(Math.round(0.8 * SEASON_TICKS)) - sim.tick + 60);
  let near160 = 0, adultsNow = 0;
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || a.sp[i] !== Sp.Hawk || a.age[i] < sim.p.species[Sp.Hawk].matureAge) continue;
    adultsNow++;
    const nst = R(sim).nestAt(R(sim).nestIndexOf(i));
    if (nst && Math.hypot(a.x[i] - nst[0], a.y[i] - nst[1]) < 170) near160++;
  }
  ok(adultsNow === 2 * ev[0].a && near160 === adultsNow, 'the adults keep to their nest range');
  const snap = sim.snapshot(false);
  let nestlings = 0, nestOk = 0;
  for (let k = 0; k < snap.count; k++) {
    const o = k * AGENT_STRIDE;
    if (snap.agents[o] !== Sp.Hawk || (snap.agents[o + 8] & F_JUVENILE) === 0) continue;
    nestlings++;
    if (snap.agents[o + 7] === St.Rest && snap.agents[o + 9] > NEST_TREE_MIN * PERCH_FRAC - 0.5 && snap.agents[o + 4] === 0) nestOk++;
  }
  ok(nestlings >= ev[0].a && nestlings <= 3 * ev[0].a && nestOk === nestlings, `nestlings sit in the nest (St.Rest, nest height, juvenile): ${nestlings}`);
  const hatched = sim.sample().births_hawk;
  sim.step(FLEDGE_AGE + 60);
  const row = sim.sample();
  ok(row.hawk_fledged >= 1 && row.hawk_fledged <= nestlings, `young hawks fledge (hawk_fledged ${row.hawk_fledged} of ${nestlings})`);
  ok(row.hawk_nests === ev[0].a, 'hawk_nests counts the nests with a parent');
  ok(hatched >= nestlings && hatched <= nestlings + 3 * ev[0].a, `births_hawk counts the young (${hatched} born, ${nestlings} nestlings now)`);
}

// ---- the litter: round(litter / calendarScale x (0.5 + female energy)), 1 to maxLitter, none when the female is under 0.3
for (const [scale, e, want] of [[2, 0.8, 3], [2, 0.35, 2], [2, 0.2, 0], [1, 0.8, 3], [1, 0.35, 3], [4, 0.8, 1]] as [number, number, number][]) {
  const sim = quiet({ raptors: 1, calendarScale: scale });
  sim.step(1);
  const a = sim.a;
  const r = R(sim);
  // clear the opening broods and let nest 0 hatch again
  const kids: number[] = [];
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Hawk && a.age[i] < sim.p.species[Sp.Hawk].matureAge) kids.push(i);
  for (const i of kids) a.kill(i);
  for (let k = 0; k < 8; k++) r.nHatched[k] = 0;
  const f = r.nF[0];
  a.energy[f] = e;
  a.energy[r.nM[0]] = e;
  r.hatchAll(0);
  let n = 0;
  for (let q = 0; q < 4; q++) { const j = r.nKid[q]; if (j >= 0 && a.same(j, r.nKidId[q]) && a.alive[j]) n++; }
  ok(n === want, `litter at calendarScale ${scale}, female energy ${e}: ${want} (got ${n})`);
}

// ---- hunting: glide, stoop with fast height loss, the catch through SmallPrey.take
{
  const sim = quiet();
  pinDay(sim, 0.5);
  const a = sim.a;
  const sm = sim.small!;
  richCell(sim, 280, 250);
  const calls: [string, number][] = [];
  const real = sm.take.bind(sm);
  let force = false;
  (sm as Any).take = (x: number, y: number, kind: Any, eff: number, rng: Any) => { calls.push([kind, eff]); return force ? GAIN[kind as 'eagle'].hare : real(x, y, kind, eff, rng); };
  const i = place(sim, Sp.Eagle, 250, 250, 0.5, 30);
  const alts: number[] = [];
  const speeds: number[] = [];
  let stoopStart = -1;
  for (let t = 0; t < 300 && calls.length === 0; t++) {
    sim.step(1);
    if (a.state[i] === St.Chase) {
      if (stoopStart < 0) stoopStart = sim.tick;
      alts.push(a.alt[i]);
      speeds.push(Math.hypot(a.vx[i], a.vy[i]));
    }
  }
  ok(stoopStart > 0 && alts.length >= 6, `a hungry eagle over a rich cell stoops (St.Chase for ${alts.length} ticks)`);
  ok(alts.every((v, k) => k === 0 || v <= alts[k - 1] + 1e-6), 'the stoop only loses height');
  ok(alts[0] - alts[alts.length - 1] > 15 && alts[alts.length - 1] < 4, 'a stoop falls more than 15 m, to within 4 m of the ground');
  ok(alts.length <= 40, 'a stoop is over in 40 ticks');
  ok(Math.max(...speeds) <= sim.p.species[Sp.Eagle].runSpeed * 1.3 && Math.max(...speeds) > 8, `the stoop is fast, up to runSpeed (${Math.max(...speeds).toFixed(1)} m/s)`);
  sim.step(2);
  ok(calls.length === 1 && calls[0][0] === 'eagle' && calls[0][1] === 1, 'the stoop ends in one SmallPrey.take with kind eagle, effort 1');
  // a forced hit: energy rises by the gain, the bird mantles on the prey, then flies on
  force = true;
  sim.step(1);
  let hitSeen = false;
  for (let t = 0; t < 200 && !hitSeen; t++) {
    const before = a.energy[i];
    sim.step(1);
    if (a.state[i] === St.Eat) {
      hitSeen = true;
      ok(a.energy[i] > before + 0.3 && a.alt[i] < 1 && a.kills[i] >= 1, 'a catch feeds the eagle by the gain and it lands on the prey');
      let held = 1;
      while (a.state[i] === St.Eat && held < 60) { sim.step(1); held++; }
      ok(held >= 20 && held <= 30, `it mantles on the catch for about 24 ticks (${held})`);
    }
  }
  ok(hitSeen, 'a forced catch was seen');
  force = false;
  // the real take: refeed it so it keeps hunting, and prey is taken
  for (let t = 0; t < 1500; t++) {
    sim.step(1);
    if (t % 40 === 0) a.energy[i] = 0.5;
    if (t % 200 === 0) sm.hare[sm.cellOf(280, 250)] = 30;
  }
  const row = sim.sample();
  ok(row.takes_hare_eagle > 0 && row.raptor_takes_hare === row.takes_hare_eagle + row.takes_hare_hawk && row.hare_takes >= row.takes_hare_eagle, `eagle catches show in takes_hare_eagle and raptor_takes_hare (${row.takes_hare_eagle})`);
  ok(row.takes_hare_coyote === 0 && row.takes_hare_wolf === 0, 'the other kinds are counted apart');
}
{
  // no hunting without the small-prey web
  const sim = createSim({ seed: 5, params: { calendarScale: 2, smallPrey: 0, smallGameField: 0, 'bison.initial': 0, 'deer.initial': 0, 'wolf.initial': 0, 'raven.initial': 0, 'coyote.initial': 0 } });
  pinDay(sim, 0.5);
  const i = place(sim, Sp.Eagle, 250, 250, 0.55, 30);
  let stoops = 0;
  for (let t = 0; t < 400; t++) { sim.step(1); if (sim.a.state[i] === St.Chase) stoops++; }
  ok(stoops === 0, 'with smallPrey off a raptor never stoops');
}
{
  // a hungry brood drives the hunt even when the parent is full, and a catch is shared with the young
  const sim = quiet({ raptors: 1 });
  pinDay(sim, 0.5);
  sim.step(1);
  const a = sim.a, r = R(sim);
  const k = 0;
  const f = r.nF[k], nx = r.nX[k], ny = r.nY[k];
  const kid = r.nKid[k * 4];
  ok(kid >= 0 && a.alive[kid] === 1, 'the nest has a young hawk');
  richCell(sim, nx + 20, ny);
  a.energy[f] = 0.95;
  a.energy[kid] = 0.3;
  let stooped = false;
  for (let t = 0; t < 400 && !stooped; t++) { sim.step(1); a.energy[f] = Math.max(a.energy[f], 0.9); a.energy[kid] = Math.min(a.energy[kid], 0.3); if (a.state[f] === St.Chase) stooped = true; }
  ok(stooped, 'a full parent with a hungry young hawk goes hunting');
  const brood: number[] = [];
  for (let q = 0; q < 4; q++) if (r.nKid[k * 4 + q] >= 0) brood.push(r.nKid[k * 4 + q]);
  for (const j of brood) a.energy[j] = 0.96;
  a.energy[kid] = 0.4;
  const kept = r.provision(f, 0.18);
  ok(near(kept, 0.09, 1e-6) && near(a.energy[kid], 0.49, 1e-6), 'half of a catch goes to a hungry young hawk');
  for (const j of brood) a.energy[j] = 0.96;
  ok(near(r.provision(f, 0.18), 0.18, 1e-9), 'a fed brood takes nothing');
}

// ---- perching and roosting
{
  const sim = quiet({ raptors: 1 });
  pinDay(sim, 0.9);
  sim.step(1);
  const a = sim.a, r = R(sim);
  const k = 0;
  let h = -1;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Hawk && r.nestIndexOf(i) === k && a.age[i] >= 900) { h = i; break; }
  ok(h >= 0, 'found a nest parent');
  const nst = r.nestAt(k);
  a.x[h] = nst[0] + 70; a.y[h] = nst[1] - 40; a.alt[h] = 25; a.state[h] = St.Fly; r.mode[h] = Mode.Soar;
  sim.step(130); // (the hawks leave at tick 180)
  ok(r.modeOf(h) === Mode.Perch && Math.hypot(a.x[h] - nst[0], a.y[h] - nst[1]) < 1 && near(a.alt[h], nst[2] * PERCH_FRAC, 0.5) && a.state[h] === St.Rest, 'a hawk roosts on its nest tree at night (St.Rest at the tree top)');
}
{
  // an eagle with no nest finds a tree top within 250 m
  const sim = quiet({ raptors: 1 });
  pinDay(sim, 0.9);
  const a = sim.a, r = R(sim);
  const e = place(sim, Sp.Eagle, 256, 256, 0.9, 25);
  sim.step(200);
  const perch = r.perchNear(a.x[e], a.y[e], 5);
  ok(r.modeOf(e) === Mode.Perch && perch !== null && near(a.alt[e], perch[2] * PERCH_FRAC, 0.6) && a.state[e] === St.Rest, 'an eagle roosts on a tree top at night');
  ok(a.vx[e] === 0 && a.vy[e] === 0, 'a perched bird is still');
}
{
  // sated at midday over open ground: it soars, high, in loops; in the morning it is lower
  const sim = quiet();
  pinDay(sim, 0.55);
  const i = place(sim, Sp.Eagle, 256, 256, 0.95, 20);
  let maxAlt = 0, flying = 0;
  const headings: number[] = [];
  for (let t = 0; t < 600; t++) {
    sim.step(1);
    sim.a.energy[i] = 0.95; // stays sated
    maxAlt = Math.max(maxAlt, sim.a.alt[i]);
    if (sim.a.state[i] === St.Fly) flying++;
    if (t % 20 === 0) headings.push(sim.a.heading[i]);
  }
  ok(maxAlt > 40 && maxAlt < 100, `a sated eagle soars high at midday (${maxAlt.toFixed(0)} m)`);
  ok(flying > 450, 'and spends the time flying (St.Fly)');
  let turned = 0;
  for (let k = 1; k < headings.length; k++) turned += Math.abs(Math.atan2(Math.sin(headings[k] - headings[k - 1]), Math.cos(headings[k] - headings[k - 1])));
  ok(turned > 3, `soaring circles (the heading keeps turning: ${turned.toFixed(1)} rad)`);
}

// ---- scavenging: eagles at carcasses, ravens give way within 3 m
{
  const run = (withEagle: boolean) => {
    const sim = quiet();
    pinDay(sim, 0.5);
    const a = sim.a;
    (sim as Any).addCarcass(250, 250, 5, Sp.Bison, 1);
    let e = -1;
    if (withEagle) {
      e = place(sim, Sp.Eagle, 270, 250, 0.1, 20);
      for (let t = 0; t < 300 && a.state[e] !== St.Eat; t++) sim.step(1);
    }
    const eating = withEagle && a.state[e] === St.Eat && R(sim).modeOf(e) === Mode.Carrion;
    const rv = place(sim, Sp.Raven, 252, 250, 0.5, 0);
    let eatTicks = 0, eagleEatTicks = 0, ravenWhileEagle = 0;
    for (let t = 0; t < 60; t++) {
      sim.step(1);
      if (a.state[rv] === St.Eat) eatTicks++;
      if (withEagle && a.state[e] === St.Eat) {
        eagleEatTicks++;
        if (a.state[rv] === St.Eat && Math.hypot(a.x[rv] - a.x[e], a.y[rv] - a.y[e]) < 3) ravenWhileEagle++;
      }
    }
    return { sim, a, e, rv, eatTicks, eagleEatTicks, ravenWhileEagle, eating };
  };
  const w = run(true);
  ok(w.eating, 'a hungry eagle lands on the carcass and feeds (St.Eat, carrion mode)');
  ok(w.eagleEatTicks >= 30 && w.ravenWhileEagle === 0, `a raven within 3 m of an eating eagle does not feed (${w.ravenWhileEagle} of ${w.eagleEatTicks} ticks)`);
  const row = w.sim.sample();
  ok(row.raptor_yields > 0 && row.eagle_carcass_ticks >= 30, 'raptor_yields and eagle_carcass_ticks count it');
  const c = run(false);
  ok(c.eatTicks > 20, `the same raven feeds when no eagle is there (${c.eatTicks} ticks)`);
  // the eagle eats until full, then sits by the carcass
  const sim = w.sim, a = w.a;
  sim.step(60);
  ok(a.energy[w.e] >= 0.9 && (sim as Any).cMeat[0] < 5 - 0.1, `the eagle fed to full on the carcass (${(5 - (sim as Any).cMeat[0]).toFixed(2)} meat eaten)`);
  ok(R(sim).modeOf(w.e) === Mode.Perch && a.state[w.e] === St.Rest && a.alt[w.e] < 1 && Math.hypot(a.x[w.e] - 250, a.y[w.e] - 250) < 3, 'and then sits by the carcass');
}
{
  // a hawk that has live prey to hunt leaves carrion alone unless it is starving
  const sim = quiet();
  pinDay(sim, 0.5);
  (sim as Any).addCarcass(250, 250, 5, Sp.Bison, 1);
  const h = place(sim, Sp.Hawk, 262, 250, 0.4, 10);
  let carrion = 0;
  for (let t = 0; t < 200; t++) { sim.step(1); if (R(sim).modeOf(h) === Mode.Carrion) carrion++; sim.a.energy[h] = Math.max(sim.a.energy[h], 0.4); }
  ok(carrion === 0, 'a hawk at 0.4 energy with the small-prey web on does not scavenge');
  sim.a.energy[h] = 0.1;
  for (let t = 0; t < 30; t++) sim.step(1);
  ok(R(sim).modeOf(h) === Mode.Carrion, 'a starving hawk goes to the carcass');
}

// ---- the main stream and the regional stream are never drawn from by raptor code
{
  // with nothing else living in the valley, a run with raptors makes exactly the main-stream draws of one without (none at all)
  const mk = (raptors: number) => quiet({ raptors, openPrairie: 0 }, 11);
  const a = mk(1), b = mk(0);
  a.step(2 * YEAR_TICKS);
  b.step(2 * YEAR_TICKS);
  ok(eventsOf(a, 'hawksReturn').length === 2, 'the run with raptors has hawks');
  ok(a.rng.getState().join() === b.rng.getState().join(), 'raptors draw nothing from the main stream');
}
{
  // eagles and hawks arriving through the corridors draw nothing from the regional generator
  const mk = (raptors: number) => quiet({ raptors, openPrairie: 1 }, 11);
  const a = mk(1), b = mk(0);
  a.step(2 * YEAR_TICKS);
  b.step(2 * YEAR_TICKS);
  ok(eventsOf(a, 'eaglesArrive').length >= 1, 'eagles came in the run with raptors');
  ok(a.region!.rng.getState().join() === b.region!.rng.getState().join(), 'raptors draw nothing from the regional stream');
}

// ---- determinism
{
  const run = () => {
    const sim = quiet({ raptors: 1, openPrairie: 1, smallGameField: 1, 'coyote.initial': 6 }, 7);
    sim.step(2500);
    const pops = sim.populations().join();
    const a = sim.a;
    let h = 0;
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && (a.sp[i] === Sp.Eagle || a.sp[i] === Sp.Hawk)) h = (Math.imul(h, 31) + Math.round(a.x[i] * 100) + Math.round(a.y[i] * 100) + Math.round(a.alt[i] * 10)) | 0;
    return pops + '|' + h + '|' + sim.eventSerial;
  };
  ok(run() === run(), 'the same seed gives the same raptors');
}

// ---- a raptor put in by a god tool lives with raptors off, and its seasonal absence is not an extinction
{
  const sim = quiet({ raptors: 0 });
  pinDay(sim, 0.5);
  sim.introduce(Sp.Eagle, 2, 250, 250);
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i] && sim.a.sp[i] === Sp.Eagle) { sim.a.age[i] = 2000; sim.a.energy[i] = 0.9; }
  sim.step(300);
  ok(count(sim, Sp.Eagle) === 2, 'introduced eagles live with raptors off');
  const i = (() => { for (let k = 0; k < sim.a.hi; k++) if (sim.a.alive[k] && sim.a.sp[k] === Sp.Eagle) return k; return -1; })();
  ok(sim.a.state[i] === St.Fly || sim.a.state[i] === St.Idle || sim.a.state[i] === St.Rest || sim.a.state[i] === St.Chase || sim.a.state[i] === St.Eat, 'and they act');
  sim.apply({ kind: 'remove', species: Sp.Eagle });
  sim.step(20);
  ok(sim.events.filter((e) => e.kind === 'extinct' && e.sp === Sp.Eagle).length === 0, 'no extinction event for a raptor');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`raptors: all ${checks} checks passed`);
