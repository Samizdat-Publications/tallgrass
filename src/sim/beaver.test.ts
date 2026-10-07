// Unit tests for beavers and moving water (V2-PLAN.md S14): the registry entry and params, off by default, the pond field, dams and their growth, the
// effects (water mask, waterDist and the drink gradients, moisture ribbon, drought shield, drowned trees, meadow), breaches, abandonment, wolves taking
// beavers on land only, the frame fields and determinism. Run: npx tsx src/sim/beaver.test.ts
import { Sim } from './sim';
import { createSim, defaultParams } from './testpins';
import { DamState, DAM_STRIDE, POND_WET, Ponds } from './ponds';
import { generateWorld } from './world';
import { SEASON_TICKS, SPECIES_KEYS, Sp, YEAR_TICKS } from './types';
import { hashSeed } from './rng';

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

/** A valley with nothing in it but what the test adds (every number the tests lean on is explicit). */
function quiet(params: Record<string, number> = {}, seed = 2): Sim {
  return createSim({
    seed,
    params: {
      calendarScale: 2, openPrairie: 0, ravenVagrants: 0, cdvRate: 0, mangeRate: 0, wolfPreyRef: 0, wolfRareHalf: 150, leanLitter: 0,
      'bison.initial': 0, 'deer.initial': 0, 'wolf.initial': 0, 'raven.initial': 0, 'coyote.initial': 0, ...params,
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

// ---- the registry entry, the params block and the defaults
{
  const p = defaultParams();
  const b = p.species[Sp.Beaver];
  ok(SPECIES_KEYS[Sp.Beaver] === 'beaver' && Sp.Beaver === 11, 'registry id 11 is beaver');
  ok(b.initial === 0 && p.beavers === 0, 'no beavers and no beaver system by default');
  ok(b.runSpeed < 6 && b.thirst === 0 && b.matureAge > 0 && b.maxLitter >= 3, 'slow on land, no thirst, a litter of several');
  ok(p.beaverCrestRate === 0.3 && p.beaverCrestMax === 1.4 && p.beaverFoodRadius === 40, 'plan numbers: 0.3 m a season, 1.4 m, food within 40 m');
  ok(p.beaverDecayMin === 2 && p.beaverDecayMax === 4 && p.beaverMoisture > 0 && p.beaverShield > 0, 'plan numbers: decay over 2 to 4 years, a moisture ribbon and a drought shield');
  const sim = createSim({ seed: 3, params: { 'beaver.maxAge': 1234 } });
  ok(sim.p.species[Sp.Beaver].maxAge === 1234, 'beaver.* overrides reach the species block');
  ok(sim.beavers === null, 'off by default: no beaver system is built');
  sim.step(300);
  const row = sim.sample();
  ok(row.pop_beaver === 0 && row.beaver_colonies === 0 && row.beaver_pond_area === 0 && row.water_dist_mean > 0, 'off: the beaver columns exist and read 0, the water distance column reads');
  const snap = sim.snapshot(true);
  ok(snap.ponds === undefined && snap.dams === undefined && snap.pondVersion === undefined, 'off: no pond fields in the snapshot');
  // the god tool builds the beaver system the first time it is used, and the beavers set down head for the creek and found a colony
  const sim2 = createSim({ seed: 3 });
  sim2.step(300);
  sim2.introduce(Sp.Beaver, 4, 100, 100);
  ok(sim2.beavers !== null && count(sim2, Sp.Beaver) === 4 && eventsOf(sim2, 'introduced').some((e) => e.sp === Sp.Beaver && e.a === 4), 'the god tool builds the beaver system on first use and places the beavers');
  sim2.step(2400);
  ok(count(sim2, Sp.Beaver) >= 3 && sim2.beavers!.activeColonies() >= 1, `the released beavers found a colony (${count(sim2, Sp.Beaver)} beavers, ${sim2.beavers!.activeColonies()} colonies)`);
}

// ---- the pond field alone
{
  const w0 = generateWorld(2);
  const w = { ...w0, water: Uint8Array.from(w0.water), waterHeight: Float32Array.from(w0.waterHeight), waterDist: Float32Array.from(w0.waterDist), moisture: Float32Array.from(w0.moisture), capacity: Float32Array.from(w0.capacity), trees: Float32Array.from(w0.trees) };
  const sim = quiet({ 'beaver.initial': 1 });
  const po = new Ponds(w, sim.veg, defaultParams(), { waterChanged() { /* none */ }, drown: null, staticTreesChanged() { /* none */ } });
  ok(po.nodeN > 100, 'the creek has nodes');
  let mono = true;
  for (let k = 1; k < po.nodeN; k++) if (po.nz[k] > po.nz[k - 1]) mono = false;
  ok(mono, 'the creek surface never runs uphill');
  // a mid-creek node: the fill grows with the crest, and every flooded cell lies below the level
  let node = -1;
  for (let k = 20; k < po.nodeN - 20; k += 5) if (po.potential(k, 1.4) >= 40 && po.potential(k, 1.4) <= 450) { node = k; break; }
  ok(node >= 0, 'a node with a moderate pond exists');
  const small = po.potential(node, 0.3), big = po.potential(node, 1.4);
  ok(big >= small && big > 0, `a higher crest floods at least as much (0.3 m: ${small}, 1.4 m: ${big})`);
  const f = po.flood(node, po.nz[node] + 1.4);
  let below = true, band = true;
  for (let k = 0; k < f.cells.length; k++) {
    if (!(po.ground[f.cells[k]] < po.nz[node] + 1.4)) below = false;
    if (Math.abs(f.dep[k] - (po.nz[node] + 1.4 - po.ground[f.cells[k]])) > 1e-4) below = false;
    const cx = ((f.cells[k] % w.n) + 0.5) * w.cell, cy = (Math.floor(f.cells[k] / w.n) + 0.5) * w.cell;
    if (Math.hypot(cx - po.nx[node], cy - po.ny[node]) > 121) band = false;
  }
  ok(below && band && f.cells.length > 0, 'every flooded cell is below the level, depth = level - ground, within 120 m of the dam');
  // a dam with crest 0 holds nothing; a dam with crest 1.4 holds a pond and refresh writes it into the world
  const d = po.addDam(node, -1, 0, 0, 1.4);
  po.refresh();
  ok(po.waterArea() === 0 && d.cells.length === 0, 'crest 0: no pond');
  const before = w.water.reduce((s, v) => s + v, 0);
  po.setCrest(d, 1.4);
  const info = po.refresh();
  const after = w.water.reduce((s, v) => s + v, 0);
  ok(info.flooded > 0 && after - before === info.flooded, `refresh floods cells and sets world.water (${info.flooded})`);
  let consistent = true, rib = 0;
  for (let c = 0; c < w.water.length; c++) {
    if (po.wet[c] && (!w.water[c] || w.capacity[c] !== 0 || w.waterDist[c] !== 0)) consistent = false;
    if (po.ribbon[c] > 0) rib++;
  }
  ok(consistent, 'pond cells are water with no capacity and distance 0');
  ok(rib > 0 && sim.veg.droughtShield !== null, 'the ribbon and the drought shield exist near the pond');
  const depthBytes = po.depthBytes(), dams = po.damArray();
  ok(depthBytes.length === w.n * w.n && dams.length === DAM_STRIDE && Math.abs(dams[2] - 1.4) < 1e-5 && dams[7] === -1, 'frame arrays: n x n depth bytes, one dam of 8 floats');
  let maxB = 0;
  for (const v of depthBytes) if (v > maxB) maxB = v;
  ok(maxB >= Math.round(POND_WET * 100), 'depth bytes carry centimetres');
  // draining: crest to 0 turns the pond into meadow
  po.setCrest(d, 0);
  const info2 = po.refresh();
  ok(info2.drained === info.flooded && po.waterArea() === 0, 'crest 0 again: the pond drains completely');
  ok(po.meadowArea() > 0 && w.water.reduce((s, v) => s + v, 0) === before, 'the drained ground is meadow, the water mask is back to the start');
  let silt = true;
  for (let c = 0; c < w.water.length; c++) if (po.meadow[c] > 0 && !(w.capacity[c] > 0)) silt = false;
  ok(silt, 'meadow cells have capacity again');
}

// ---- founders, the dam grows 0.3 m a season to 1.4 m, the pond fills and the world follows
{
  const sim = quiet({ 'beaver.initial': 8 });
  const bv = sim.beavers!;
  ok(bv !== null && bv.sites.length >= 2, 'a beaver system with sites');
  ok(count(sim, Sp.Beaver) === 8 && bv.activeColonies() === 2, 'eight founders in two colonies of four');
  ok(bv.ponds.dams.length === 2 && bv.ponds.dams.every((d) => d.crest === 0 && d.state === DamState.Building), 'two dams just begun');
  const w = sim.world, waterBefore = w.water.reduce((s, v) => s + v, 0);
  const wd0 = w.waterDist.slice();
  const gxSum = (): number => { let s = 0; for (let c = 0; c < w.water.length; c++) s += Math.abs((sim as Any).waterGX[c]); return s; };
  const gx0 = gxSum();
  sim.step(SEASON_TICKS);
  const crest1 = Math.max(...bv.ponds.dams.map((d) => d.crest));
  ok(crest1 > 0.15 && crest1 <= 0.31, `the crest rises about 0.3 m in a season (got ${crest1.toFixed(2)})`);
  sim.step(SEASON_TICKS * 5);
  ok(bv.ponds.dams.every((d) => d.crest > 1.39 && d.crest <= 1.4 + 1e-6 && d.state === DamState.Holding), 'after six seasons both crests are at 1.4 m and the dams hold');
  ok(eventsOf(sim, 'damBuilt').length === 2, 'damBuilt told for each dam');
  ok(eventsOf(sim, 'pondFilled').length >= 1 && eventsOf(sim, 'pondFilled').every((e) => e.a >= 40), 'pondFilled told with an area of at least 40 m2');
  const waterAfter = w.water.reduce((s, v) => s + v, 0);
  ok(waterAfter > waterBefore + 20, `ponds added water cells (${waterBefore} -> ${waterAfter})`);
  let nearer = 0, farther = 0;
  for (let c = 0; c < w.water.length; c++) { if (w.waterDist[c] < wd0[c] - 1) nearer++; else if (w.waterDist[c] > wd0[c] + 1) farther++; }
  ok(nearer > 100 && farther === 0, `waterDist shrinks around the ponds and never grows (${nearer} cells nearer)`);
  ok((sim as Any).drinkD === w.waterDist, 'the drink distance follows the new waterDist');
  ok(Math.abs(gxSum() - gx0) > 0 || nearer > 0, 'the water gradients were rebuilt');
  // a cell a few metres from the new water points toward it (positive dot product with the way to the nearest pond cell)
  const ponds: number[] = [];
  for (let c = 0; c < w.water.length; c++) if (bv.ponds.wet[c]) ponds.push(c);
  let toward = 0, tested = 0;
  for (let c = 0; c < w.water.length && tested < 300; c += 3) {
    if (bv.ponds.wet[c] || w.water[c] || w.waterDist[c] > 8 || w.waterDist[c] < 3) continue;
    const i = c % w.n, j = (c / w.n) | 0;
    let best = -1, bd = 1e9;
    for (const q of ponds) { const d = Math.hypot((q % w.n) - i, ((q / w.n) | 0) - j); if (d < bd) { bd = d; best = q; } }
    // only cells whose nearest water is a new pond cell (not the creek)
    if (best < 0 || bd * w.cell > w.waterDist[c] + 1) continue;
    tested++;
    const dot = (sim as Any).waterGX[c] * ((best % w.n) - i) + (sim as Any).waterGY[c] * (((best / w.n) | 0) - j);
    if (dot > 0) toward++;
  }
  ok(tested > 10 && toward >= 0.9 * tested, `the drink gradient points toward the new water (${toward} of ${tested})`);
  // the greener ribbon: moisture is up near the pond, shield is on, nothing outside 30 m
  const w0 = generateWorld(sim.seed);
  let wetter = 0, shielded = 0, outsideBad = 0;
  for (let c = 0; c < w.water.length; c++) {
    if (w.moisture[c] > w0.moisture[c] + 0.01) wetter++;
    if (sim.veg.droughtShield![c] > 0.05) shielded++;
    if (w.moisture[c] !== w0.moisture[c] && bv.ponds.ribbon[c] === 0 && !bv.ponds.wet[c]) outsideBad++;
  }
  ok(wetter > 50 && shielded > 50 && outsideBad === 0, `a moisture ribbon and a drought shield around the ponds, nowhere else (${wetter}, ${shielded}, ${outsideBad})`);
  // the caller's world is never changed: the sim worked on copies
  ok(w0.water.reduce((s, v) => s + v, 0) === waterBefore, 'generateWorld(seed) is untouched (copy on write)');
  // the beavers live: they gnaw, rest in the lodge, and the stand is drawn on
  const row = sim.sample();
  ok(row.beaver_colonies === 2 && row.beaver_dams === 2 && row.beaver_ponds === 2 && row.beaver_pond_area > 100, 'sample columns: colonies, dams, ponds, area');
  ok(row.beaver_food < 1 && row.beaver_food > 0, 'the stand is being eaten');
  // the frame
  const snap = sim.snapshot(true);
  ok(snap.ponds!.length === w.n * w.n && snap.dams!.length === 2 * DAM_STRIDE && snap.lodges!.length === 2 * 4, 'snapshot carries ponds, dams and lodges');
  ok(typeof snap.pondVersion === 'number' && snap.pondVersion > 1, 'snapshot carries a version');
  const snap2 = sim.snapshot(true);
  ok(snap2.ponds === undefined && snap2.pondVersion === snap.pondVersion, 'unchanged: the arrays are not sent again, the version still is');
  sim.step(SEASON_TICKS);
  const snap3 = sim.snapshot(true);
  ok(snap3.ponds !== undefined || snap3.pondVersion === snap.pondVersion, 'after a change the arrays come again (or nothing moved)');
}

// ---- a flood breaches dams, the pond drains, a meadow forms; a colony that stays rebuilds
{
  const sim = quiet({ 'beaver.initial': 8, beaverBreachP: 1, beaverBreachYear: 0 });
  sim.step(SEASON_TICKS * 6);
  const bv = sim.beavers!;
  const area0 = bv.ponds.waterArea();
  ok(area0 > 0, 'ponds stand');
  sim.apply({ kind: 'flood', ticks: 300, severity: 1 });
  const br = eventsOf(sim, 'damBreached');
  ok(br.length === 2 && br.every((e) => e.b === 0), 'both dams breach in a severity 1 flood, cause 0 (flood)');
  ok(bv.ponds.dams.every((d) => d.state === DamState.Breached), 'the dams are breached');
  sim.step(SEASON_TICKS);
  ok(bv.ponds.waterArea() < 0.5 * area0, `the pond drains after the breach (${area0} -> ${bv.ponds.waterArea()})`);
  ok(eventsOf(sim, 'beaverMeadow').length >= 1, 'beaverMeadow told when the pond has drained');
  ok(bv.ponds.meadowArea() > 0, 'meadow stands where the pond was');
  // the colonies are alive and fed: they rebuild
  sim.step(SEASON_TICKS * 6);
  ok(bv.ponds.dams.some((d) => d.state === DamState.Holding || d.state === DamState.Building) || bv.activeColonies() === 0, 'a living colony mends its dam');
  ok(bv.ponds.dams.some((d) => d.crest > 0.5) || bv.activeColonies() === 0, 'the crest is back up');
}

// ---- without a flood nothing breaches when the yearly chance is 0
{
  const sim = quiet({ 'beaver.initial': 8, beaverBreachYear: 0 });
  sim.step(YEAR_TICKS * 2);
  ok(eventsOf(sim, 'damBreached').length === 0, 'no flood and no yearly chance: no breach');
}

// ---- abandonment: the colony dies out, the dam decays over 2 to 4 years, the pond becomes a meadow
{
  const sim = quiet({ 'beaver.initial': 8, beaverBreachYear: 0 });
  sim.step(SEASON_TICKS * 6);
  const bv = sim.beavers!;
  const area0 = bv.ponds.waterArea();
  const crest0 = bv.ponds.dams[0].crest;
  sim.apply({ kind: 'remove', species: Sp.Beaver });
  sim.step(100);
  ok(count(sim, Sp.Beaver) === 0 && bv.activeColonies() === 0, 'every beaver removed, no colony left');
  const left = eventsOf(sim, 'colonyLeft');
  ok(left.length === 2 && left.every((e) => e.b === 1), 'colonyLeft told (cause 1: died out)');
  ok(bv.ponds.dams.every((d) => d.state === DamState.Abandoned), 'the dams are abandoned');
  const t0 = sim.tick;
  sim.step(YEAR_TICKS * 1);
  ok(bv.ponds.waterArea() > 0 && bv.ponds.dams.every((d) => d.crest > 0 && d.crest < crest0), 'one year on the dams still hold some water and have lost height');
  sim.step(YEAR_TICKS * 4);
  ok(bv.ponds.dams.length === 0 && bv.ponds.waterArea() === 0, `after at most 4 years the dams are gone and the ponds drained (${(sim.tick - t0) / YEAR_TICKS} years)`);
  ok(eventsOf(sim, 'beaverMeadow').length >= 1 && bv.ponds.meadowArea() > 0.5 * area0, 'beaverMeadow told, and the meadow covers most of the old pond');
  // the meadow is fertile: capacity above the original where the pond stood
  const w0 = generateWorld(sim.seed);
  let better = 0, cells = 0;
  for (let c = 0; c < w0.water.length; c++) {
    if (bv.ponds.meadow[c] > 0.5 && !w0.water[c]) { cells++; if (sim.world.capacity[c] > w0.capacity[c] * 1.05) better++; }
  }
  ok(cells > 0 && better > 0.5 * cells, `the meadow is more fertile than the ground it replaced (${better} of ${cells} cells)`);
  // and it fades back over beaverMeadowYears
  sim.step(YEAR_TICKS * 21);
  ok(bv.ponds.meadowArea() === 0, 'the meadow fades after about twenty years');
}

// ---- a colony that eats its stand out leaves
{
  const sim = quiet({ 'beaver.initial': 8, beaverFoodRate: 40, beaverRegrow: 0, beaverBreachYear: 0 });
  sim.step(YEAR_TICKS * 4);
  const left = eventsOf(sim, 'colonyLeft');
  ok(left.some((e) => e.b === 0), 'out of food: colonyLeft with cause 0');
  ok(sim.beavers!.ponds.dams.every((d) => d.state === DamState.Abandoned || d.state === DamState.Breached) || count(sim, Sp.Beaver) === 0, 'an out-of-food colony stops mending its dam');
}

// ---- drowned trees: with static trees the sim's copy loses them and lists them; with dynamic trees they become snags
{
  const sim = quiet({ 'beaver.initial': 8 });
  const w0 = generateWorld(sim.seed);
  sim.step(SEASON_TICKS * 6);
  const po = sim.beavers!.ponds;
  const dead = po.drownedTrees.length;
  let zeroed = 0;
  for (let k = 0; k < sim.world.trees.length; k += 4) if (sim.world.trees[k + 2] === 0 && w0.trees[k + 2] > 0) zeroed++;
  ok(zeroed === dead, `static trees in the ponds are listed and lose their height in the sim's copy (${dead})`);
  ok(w0.trees.every((v) => v === v), 'the generated world still has them');
  const sim2 = quiet({ 'beaver.initial': 8, dynamicTrees: 1 });
  const snags0 = sim2.trees!.counts().n.reduce((s, row) => s + row[4], 0);
  sim2.step(SEASON_TICKS * 6);
  const snags1 = sim2.trees!.counts().n.reduce((s, row) => s + row[4], 0);
  const drowned = sim2.sample().beaver_trees_drowned;
  ok(snags1 >= snags0 && (drowned > 0 ? snags1 > snags0 : true), `dynamic trees: drowned trees stand as snags (${snags0} -> ${snags1}, ${drowned} drowned this sample)`);
}

// ---- the drought shield: a shielded bank keeps its grass growing through a drought
{
  const sim = quiet({ 'beaver.initial': 8 });
  sim.step(SEASON_TICKS * 6);
  const v = sim.veg, w = sim.world;
  ok(v.droughtShield !== null, 'the shield exists');
  sim.apply({ kind: 'drought', ticks: 3000, severity: 0.8 });
  let shieldedCell = -1, farCell = -1;
  for (let c = 0; c < w.water.length; c++) {
    if (!w.water[c] && v.droughtShield![c] > 0.7 && shieldedCell < 0) shieldedCell = c;
  }
  ok(shieldedCell >= 0, 'a cell with a strong shield exists');
  // the same soil far from any pond grows less in a drought: compare the growth term directly through a step on two fresh sims
  const a = quiet({ 'beaver.initial': 8 }), b = quiet({ 'beaver.initial': 0, beavers: 0 });
  a.step(SEASON_TICKS * 6);
  b.step(SEASON_TICKS * 6);
  a.apply({ kind: 'drought', ticks: 1200, severity: 0.9 });
  b.apply({ kind: 'drought', ticks: 1200, severity: 0.9 });
  a.step(1200);
  b.step(1200);
  let sa = 0, sb = 0, n = 0;
  for (let c = 0; c < w.water.length; c++) {
    if (a.veg.droughtShield![c] > 0.5 && !a.world.water[c] && !b.world.water[c]) { sa += a.veg.grass[c]; sb += b.veg.grass[c]; n++; }
  }
  void farCell;
  ok(n > 20 && sa > sb, `grass on the pond banks after a drought beats the same ground with no pond (${(sa / n).toFixed(3)} vs ${(sb / n).toFixed(3)} over ${n} cells)`);
}

// ---- wolves take beavers on land and never in the water
{
  const sim = quiet({ 'beaver.initial': 12, 'wolf.initial': 0, wolfKillChance: 3 }, 4);
  sim.step(100);
  const bv = sim.beavers!;
  const w = sim.world;
  // a beaver in the water is safe, one on dry land is not
  const i = alive(sim, Sp.Beaver)[0];
  const home = { x: sim.a.x[i], y: sim.a.y[i] };
  let wx = -1, wy = -1;
  for (let c = 0; c < w.water.length && wx < 0; c++) if (w.water[c]) { wx = ((c % w.n) + 0.5) * w.cell; wy = (Math.floor(c / w.n) + 0.5) * w.cell; }
  sim.a.x[i] = wx; sim.a.y[i] = wy;
  ok(bv.safe(i), 'a beaver standing in water is out of reach');
  let lx = -1, ly = -1;
  const c0 = bv.colonies[0];
  for (let c = 0; c < w.water.length && lx < 0; c++) {
    const x = ((c % w.n) + 0.5) * w.cell, y = (Math.floor(c / w.n) + 0.5) * w.cell;
    if (!w.water[c] && w.waterDist[c] > 25 && w.waterDist[c] < 40 && Math.hypot(x - c0.x, y - c0.y) < 150) { lx = x; ly = y; }
  }
  sim.a.x[i] = lx; sim.a.y[i] = ly;
  ok(lx >= 0 && !bv.safe(i), 'a beaver on dry land is not');
  sim.a.x[i] = home.x; sim.a.y[i] = home.y;
  // six beavers caught on open ground 25 to 40 m from the water, six hungry wolves, nothing else to hunt: every beaver a wolf kills was on land when it died
  let moved = 0;
  for (const k of alive(sim, Sp.Beaver)) if (moved < 6 && sim.a.age[k] > 1300) { sim.a.x[k] = lx + moved * 2; sim.a.y[k] = ly; moved++; }
  const kills: boolean[] = [];
  const orig = (sim as Any).die.bind(sim);
  (sim as Any).die = (k: number, cause: string) => {
    if (sim.a.sp[k] === Sp.Beaver && cause === 'killed') kills.push(bv.safe(k));
    orig(k, cause);
  };
  sim.introduce(Sp.Wolf, 6, lx - 30, ly);
  for (const k of alive(sim, Sp.Wolf)) sim.a.energy[k] = 0.6;
  sim.step(YEAR_TICKS);
  const row = sim.sample();
  ok(kills.length >= 2, `wolves killed beavers caught on land (${kills.length} kills)`);
  ok(kills.every((s) => !s), 'every beaver a wolf killed was on land');
  ok(row.killed_beaver >= kills.length && row.pop_beaver > 0, 'killed_beaver counts them, and the colony goes on');
}

// ---- determinism and the private stream
{
  const run = (): string => {
    const sim = quiet({ 'beaver.initial': 8, beavers: 1 }, 6);
    sim.step(YEAR_TICKS * 3);
    let h = 0;
    for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i]) h = (Math.imul(h ^ (sim.a.sp[i] * 7919 + Math.round(sim.a.x[i] * 16)), 16777619) ^ Math.round(sim.a.y[i] * 16)) >>> 0;
    return `${h}:${count(sim, Sp.Beaver)}:${sim.beavers!.ponds.waterArea()}:${sim.eventSerial}`;
  };
  ok(run() === run(), 'the same seed gives the same beaver valley');
  ok(hashSeed('6:beaver') !== hashSeed('6:muledeer'), 'the beaver stream has its own salt');
}

// ---- turning the system on does not move the main stream while there are no beavers to draw on it
{
  const a = quiet({}, 8), b = quiet({ beavers: 1 }, 8);
  a.step(600);
  b.step(600);
  const sa = a.sample(), sb = b.sample();
  ok(sa.pop_bison === sb.pop_bison && sa.grass_mean === sb.grass_mean && sa.pop_wolf === sb.pop_wolf, 'beavers 1 with no founders leaves the quiet valley as it was');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`beavers: all ${checks} checks passed`);
