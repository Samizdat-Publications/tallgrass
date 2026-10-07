// Unit tests for the mule deer (V2-PLAN.md S8): habitat, founder groups, browsing, hidden fawns, the stotting flag, the open-prairie rescue,
// and the cougar's preference. Run: npx tsx src/sim/muledeer.test.ts
import { Sim } from './sim';
import { createSim, defaultParams } from './testpins';
import { DIET } from './species';
import { F_STOT, SEASON_TICKS, SPECIES_KEYS, Sp, St, YEAR_TICKS, AGENT_STRIDE } from './types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/** A valley with no other animal in it. */
function quiet(params: Record<string, number> = {}, seed = 5): Sim {
  return createSim({
    seed,
    params: {
      // everything the tests lean on is explicit, so a change of the default world (a new adopted checkpoint) cannot move them
      calendarScale: 2, openPrairie: 0, ravenVagrants: 0, cdvRate: 0, mangeRate: 0, wolfPreyRef: 0, wolfRareHalf: 150, leanLitter: 0,
      'bison.initial': 0, 'deer.initial': 0, 'wolf.initial': 0, 'raven.initial': 0, ...params,
    },
  });
}
const count = (sim: Sim, sp: number): number => sim.populations()[sp];
const eventsOf = (sim: Sim, kind: string) => sim.events.filter((e) => e.kind === kind);
function alive(sim: Sim, sp: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i] && sim.a.sp[i] === sp) out.push(i);
  return out;
}
const habAt = (sim: Sim, x: number, y: number): number => sim.mule.hab[sim.veg.cellAt(x, y)];
/** Tick of the first year in which yearTick is yt (the sim opens at season 1.8). */
const tickAtYt = (yt: number, year = 0): number => ((yt - Math.round(1.8 * SEASON_TICKS) + YEAR_TICKS) % YEAR_TICKS) + year * YEAR_TICKS;

// ---- the registry entry and the params block
{
  const p = defaultParams();
  const md = p.species[Sp.MuleDeer], pg = p.species[Sp.Deer];
  ok(SPECIES_KEYS[Sp.MuleDeer] === 'muledeer' && Sp.MuleDeer === 10, 'registry id 10 is muledeer');
  ok(md.initial === 0, 'no mule deer founders by default');
  ok(Math.abs(md.maxAge - pg.maxAge) / pg.maxAge < 0.2, 'lifespan is about the pronghorn');
  ok(md.hideAge > 0 && md.diet > 0 && md.maxLitter === 2 && md.litter > 1 && md.litter < 2, 'hides its fawns, browses, one or two fawns');
  ok(p.muledeerCover === 0.25 && p.muledeerGroupMin === 3 && p.muledeerGroupMax === 10, 'plan numbers: cover 0.25, groups of 3 to 10');
  const sim = createSim({ seed: 3, params: { 'muledeer.maxAge': 1234 } });
  ok(sim.p.species[Sp.MuleDeer].maxAge === 1234, 'muledeer.* overrides reach the species block');
}

// ---- defaults: no mule deer, the cougar-kill columns exist at 0
{
  const sim = createSim({ seed: 3 });
  sim.step(300);
  const row = sim.sample();
  ok(count(sim, Sp.MuleDeer) === 0 && row.pop_muledeer === 0, 'no mule deer by default');
  for (const k of ['cougar_kills_muledeer', 'cougar_kills_pronghorn', 'cougar_kills_bison', 'births_muledeer', 'killed_muledeer', 'starved_muledeer']) {
    ok(k in row && row[k] === 0, `default sample column ${k} is 0`);
  }
}

// ---- habitat: cover above 0.25 and the draws along the water, nothing else
{
  const sim = quiet();
  const w = sim.world, hab = sim.mule.hab, p = sim.p;
  let land = 0, full = 0, badOpen = 0, badWater = 0, missedCover = 0;
  for (let c = 0; c < w.n * w.n; c++) {
    if (w.water[c]) { if (hab[c] !== 0) badWater++; continue; }
    land++;
    if (hab[c] >= 0.99) full++;
    if (w.cover[c] >= p.muledeerCover && hab[c] < 0.99) missedCover++;
    if (w.cover[c] < p.muledeerCover - 0.15 && w.waterDist[c] > p.muledeerDrawDist + 15 && hab[c] > 0) badOpen++;
  }
  ok(badWater === 0, 'water cells are never habitat');
  ok(badOpen === 0, 'open ground away from the water is never habitat');
  ok(missedCover === 0, 'every cell with cover above the threshold is habitat');
  ok(full / land > 0.1 && full / land < 0.45, `habitat is a part of the valley, not all of it (${(full / land).toFixed(2)})`);
  const rand = sim.mule.spot();
  ok(rand !== null && habAt(sim, rand[0], rand[1]) >= 0.99, 'spot() gives a habitat spot');
}

// ---- founders: groups of 3 to 10 at habitat spots
{
  const sim = quiet({ 'muledeer.initial': 47 });
  ok(count(sim, Sp.MuleDeer) === 47, 'muledeer.initial puts that many in the valley');
  const sizes = sim.mule.groupSizes(47);
  ok(sizes.reduce((s, v) => s + v, 0) === 47, 'group sizes sum to the founders');
  ok(sizes.every((g) => g >= 3), 'every founder group has at least 3');
  ok(sizes.every((g) => g <= 12), 'founder groups stay near the 10 maximum');
  const ids = alive(sim, Sp.MuleDeer);
  let inHab = 0;
  for (const i of ids) if (habAt(sim, sim.a.x[i], sim.a.y[i]) > 0.3) inHab++;
  ok(inHab / ids.length > 0.5, `founders start in or beside the habitat (${inHab}/${ids.length})`);
  // the same seed gives the same valley
  const sim2 = quiet({ 'muledeer.initial': 47 });
  const i2 = alive(sim2, Sp.MuleDeer);
  ok(ids.length === i2.length && ids.every((i, k) => sim.a.x[i] === sim2.a.x[i2[k]] && sim.a.y[i] === sim2.a.y[i2[k]]), 'founders are deterministic');
}

// ---- browsing: a mule deer grazes only in its habitat
{
  const sim = quiet({ 'muledeer.initial': 40 });
  let graze = 0, grazeIn = 0, rows = 0;
  for (let t = 0; t < 1800; t += 30) {
    sim.step(30);
    for (const i of alive(sim, Sp.MuleDeer)) {
      if (sim.a.state[i] !== St.Graze) continue;
      graze++;
      if (habAt(sim, sim.a.x[i], sim.a.y[i]) > 0.3) grazeIn++;
    }
    rows++;
  }
  ok(rows > 0 && graze > 100, `the deer graze (${graze} samples)`);
  ok(grazeIn / graze > 0.9, `at least 90% of grazing is in habitat (${grazeIn}/${graze})`);
  ok(count(sim, Sp.MuleDeer) > 20, 'a herd of 40 does not collapse in 1,500 ticks of a quiet valley');
  // the same herd of pronghorn is not held to the habitat
  const ctl = quiet({ 'deer.initial': 40 });
  let g2 = 0, g2in = 0;
  for (let t = 0; t < 1800; t += 30) {
    ctl.step(30);
    for (const i of alive(ctl, Sp.Deer)) {
      if (ctl.a.state[i] !== St.Graze) continue;
      g2++;
      if (habAt(ctl, ctl.a.x[i], ctl.a.y[i]) > 0.3) g2in++;
    }
  }
  ok(g2 > 100 && g2in / g2 < grazeIn / graze, 'pronghorn graze outside the habitat far more than mule deer do');
}

// ---- groups: they stay in groups of about 3 to 10, not one big herd or singles
{
  const sim = quiet({ 'muledeer.initial': 60 });
  sim.step(600);
  const ids = alive(sim, Sp.MuleDeer);
  // each animal's group is the deer within 20 m of it (itself included)
  const local = ids.map((i) => ids.filter((j) => Math.hypot(sim.a.x[i] - sim.a.x[j], sim.a.y[i] - sim.a.y[j]) < 20).length).sort((x, y) => x - y);
  const median = local[Math.floor(local.length / 2)];
  ok(ids.length >= 40, `the herd persists (${ids.length})`);
  ok(median >= 3 && median <= 12, `median group size is about 3 to 10 (${median})`);
  ok(local[Math.floor(local.length * 0.1)] >= 2, 'few deer are alone');
  ok(local[Math.floor(local.length * 0.9)] <= 20, 'no giant herd forms');
}

// ---- fawns hide
{
  const sim = quiet();
  const P = sim.p.species[Sp.MuleDeer];
  const doe = sim.spawnAdult(Sp.MuleDeer, 200, 200);
  sim.a.male[doe] = 0; sim.a.age[doe] = P.matureAge * 2; sim.a.energy[doe] = 0.9; sim.a.pregnant[doe] = 2; sim.a.cooldown[doe] = 0;
  sim.step(8);
  const fawns = alive(sim, Sp.MuleDeer).filter((i) => i !== doe);
  ok(fawns.length >= 1 && fawns.length <= 2, `the doe has one or two fawns (${fawns.length})`);
  sim.step(40);
  const hidden = fawns.filter((i) => sim.a.alive[i] && sim.a.state[i] === St.Rest).length;
  ok(hidden === fawns.filter((i) => sim.a.alive[i]).length && hidden >= 1, 'her fawns lie hidden (St.Rest) while she browses nearby');
  ok(fawns.every((i) => sim.a.age[i] < P.hideAge), 'a fawn is younger than the hiding age');
}

// ---- stotting: the flag is set while a mule deer flees, and only then
{
  const sim = quiet();
  const a = sim.a;
  const d1 = sim.spawnAdult(Sp.MuleDeer, 150, 150);
  const d2 = sim.spawnAdult(Sp.MuleDeer, 300, 300);
  const pr = sim.spawnAdult(Sp.Deer, 150, 300);
  for (const i of [d1, d2, pr]) { a.age[i] = 2000; a.energy[i] = 0.9; a.hydration[i] = 1; }
  a.flee[d1] = 40; a.fleeX[d1] = 1; a.fleeY[d1] = 0;
  a.flee[pr] = 40; a.fleeX[pr] = 1; a.fleeY[pr] = 0;
  sim.step(12);
  const snap = sim.snapshot(false);
  const flagOf = (id: number): number => {
    for (let k = 0; k < snap.count; k++) if (snap.ids[k] === a.id[id]) return snap.agents[k * AGENT_STRIDE + 8];
    return -1;
  };
  ok(a.state[d1] === St.Flee && (flagOf(d1) & F_STOT) !== 0, 'a fleeing mule deer carries F_STOT');
  ok(a.state[d2] !== St.Flee && (flagOf(d2) & F_STOT) === 0, 'a calm mule deer does not');
  ok(a.state[pr] === St.Flee && (flagOf(pr) & F_STOT) === 0, 'a fleeing pronghorn does not');
}

// ---- the open-prairie rescue
{
  const t0 = tickAtYt(Math.round(0.3 * SEASON_TICKS), 0);
  const sim = quiet({ openPrairie: 1, wolfInRate: 0, deerInK: 0, deerRescue: 0, muledeerRescueBelow: 60, 'muledeer.initial': 5 });
  sim.step(t0 - 2);
  const before = count(sim, Sp.MuleDeer);
  sim.step(8);
  const ev = eventsOf(sim, 'immigrated').filter((e) => e.sp === Sp.MuleDeer);
  ok(before < 60, `the herd is below the rescue threshold (${before})`);
  ok(ev.length === 1 && ev[0].a === sim.p.muledeerRescue, 'a group of muledeerRescue walks in at season 0.3');
  ok(count(sim, Sp.MuleDeer) >= before + 4, 'and the herd grows');
  const arrivals = alive(sim, Sp.MuleDeer).filter((i) => sim.a.origin[i] === 1);
  ok(arrivals.length === ev[0].a && arrivals.every((i) => sim.a.state[i] === St.Migrate), 'the arrivals are walking in from the border');

  // no rescue with the open prairie off, with no mule deer ever, with a full herd, or after a removal
  const closed = quiet({ 'muledeer.initial': 5 });
  closed.step(t0 + 8);
  ok(eventsOf(closed, 'immigrated').length === 0, 'closed valley: no rescue');
  const none = quiet({ openPrairie: 1, wolfInRate: 0 });
  none.step(t0 + 8);
  ok(count(none, Sp.MuleDeer) === 0 && eventsOf(none, 'immigrated').filter((e) => e.sp === Sp.MuleDeer).length === 0, 'no mule deer ever: none arrive');
  const full = quiet({ openPrairie: 1, wolfInRate: 0, deerInK: 0, deerRescue: 0, 'muledeer.initial': 30 });
  full.step(t0 + 8);
  ok(eventsOf(full, 'immigrated').filter((e) => e.sp === Sp.MuleDeer).length === 0, 'a herd above the threshold is left alone');
  const gone = quiet({ openPrairie: 1, wolfInRate: 0, deerInK: 0, deerRescue: 0, 'muledeer.initial': 5 });
  gone.apply({ kind: 'remove', species: Sp.MuleDeer });
  gone.step(t0 + 8);
  ok(count(gone, Sp.MuleDeer) === 0, 'a removed species stays removed');
  const off = quiet({ openPrairie: 1, wolfInRate: 0, deerInK: 0, deerRescue: 0, 'muledeer.initial': 5, muledeerRescue: 0 });
  off.step(t0 + 8);
  ok(count(off, Sp.MuleDeer) <= 5, 'muledeerRescue 0 switches the rescue off');
}

// ---- cougar prey preference: mule deer, then pronghorn, then bison calves
{
  ok(DIET[Sp.Cougar][Sp.MuleDeer] > DIET[Sp.Cougar][Sp.Deer] && DIET[Sp.Cougar][Sp.Deer] > DIET[Sp.Cougar][Sp.Bison], 'DIET weights order the prey');
  const build = (withDeer: boolean, withPronghorn: boolean): { sim: Sim; cougar: number; ids: Record<string, number> } => {
    const sim = quiet({ 'cougar.initial': 0 });
    const a = sim.a;
    const ids: Record<string, number> = {};
    const cougar = sim.spawnAdult(Sp.Cougar, 250, 250);
    const put = (name: string, sp: number, x: number, y: number, young: boolean): void => {
      const i = sim.spawnAdult(sp, x, y);
      a.age[i] = young ? 100 : 2000; a.energy[i] = 0.7; a.hydration[i] = 1;
      ids[name] = i;
    };
    if (withDeer) put('deer', Sp.MuleDeer, 262, 250, false);
    if (withPronghorn) put('pronghorn', Sp.Deer, 250, 262, false);
    put('calf', Sp.Bison, 238, 250, true);
    sim.step(1); // builds the prey grid
    return { sim, cougar, ids };
  };
  const pick = (b: ReturnType<typeof build>): number => (b.sim as Any).preyWithin(b.cougar, 30);
  const all = build(true, true);
  ok(pick(all) === all.ids.deer, 'with all three in reach the cougar takes the mule deer');
  const noDeer = build(false, true);
  ok(pick(noDeer) === noDeer.ids.pronghorn, 'without the deer it takes the pronghorn over the calf');
  const calfOnly = build(false, false);
  ok(pick(calfOnly) === calfOnly.ids.calf, 'with only a calf in reach it takes the calf');
}

// ---- cougar kills are counted by prey species
{
  const sim = quiet({ cougarKillChance: 1000, 'cougar.initial': 0 });
  const a = sim.a;
  const cougar = sim.spawnAdult(Sp.Cougar, 250, 250);
  const prey = sim.spawnAdult(Sp.MuleDeer, 251, 250);
  a.age[prey] = 2000; a.energy[prey] = 0.5;
  a.state[cougar] = St.Chase; a.target[cougar] = prey; a.targetId[cougar] = a.id[prey];
  (sim as Any).liveCougar(cougar, sim.p.species[Sp.Cougar]);
  const row = sim.sample();
  ok(!a.alive[prey], 'the cougar made its kill');
  ok(row.cougar_kills_muledeer === 1 && row.cougar_kills_pronghorn === 0 && row.cougar_kills_bison === 0, 'cougar_kills_muledeer counts it');
  ok(row.killed_muledeer === 1 && row.kills_cougar === 1, 'killed_muledeer and kills_cougar agree');
  ok(sim.sample().cougar_kills_muledeer === 0, 'the counter resets after a sample');
}

// ---- the cougar rescue (cougarInRate): a pair walks in once cougars have lived here
{
  const t0 = tickAtYt(400, 1);
  const mk = (extra: Record<string, number>): Sim => quiet({ openPrairie: 1, wolfInRate: 0, deerInK: 0, deerRescue: 0, cougarInRate: 200, 'cougar.initial': 2, ...extra });
  const sim = mk({});
  sim.apply({ kind: 'cull', species: Sp.Cougar, fraction: 1 });
  sim.step(300);
  ok(count(sim, Sp.Cougar) >= 2, 'with cougarInRate, a pair walks in when the cats are gone');
  ok(eventsOf(sim, 'immigrated').some((e) => e.sp === Sp.Cougar), 'and the chronicle gets an immigrated event');
  const never = quiet({ openPrairie: 1, wolfInRate: 0, deerInK: 0, deerRescue: 0, cougarInRate: 200 });
  never.step(t0);
  ok(count(never, Sp.Cougar) === 0, 'cougars that never lived here are not rescued');
  const off = mk({ cougarInRate: 0 });
  off.apply({ kind: 'cull', species: Sp.Cougar, fraction: 1 });
  off.step(300);
  ok(count(off, Sp.Cougar) === 0, 'cougarInRate 0 means no rescue');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`mule deer: all ${checks} checks passed`);
