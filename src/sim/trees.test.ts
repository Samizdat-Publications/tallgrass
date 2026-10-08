// Unit tests for S13 (dynamic trees). Run: npx tsx src/sim/trees.test.ts
import { simHash as rawSimHash } from '../headless/hash';
import { applyOverrides } from './params';
import { Rng } from './rng';
import { Sim } from './sim';
import { V7C_OFF, createSim, defaultParams } from './testpins';
// tests written against the pre-v8b default world: hash with the v7c and v8b additions pinned off
const simHash = (seed: number, ticks: number, p: Record<string, number> = {}): string => rawSimHash(seed, ticks, { ...V7C_OFF, ...p });
import { Kind, Stage, TREE_STEP, TREE_STRIDE, Trees } from './trees';
import { Sp } from './types';
import { generateWorld } from './world';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

type Priv = {
  spawn(kind: number, x: number, y: number, age: number, rng: Rng): number;
  snag(i: number): void;
  seasonPass(tick: number, si: number): void;
  recruitCottonwood(tick: number): void;
  recruitJuniper(tick: number): void;
  checkEncroachment(): void;
  release(i: number): void;
  rip: Int32Array;
  ridge: Int32Array;
};
const priv = (t: Trees): Priv => t as unknown as Priv;
const tp = (extra: Record<string, number> = {}): Record<string, number> => ({ dynamicTrees: 1, ...extra });

/** A land cell centre at least `minWater` m from the water. */
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
const countStage = (t: Trees, stage: number, kind = -1): number => {
  let n = 0;
  for (let i = 0; i < t.count; i++) if (t.stage[i] === stage && (kind < 0 || t.kind[i] === kind)) n++;
  return n;
};

// 1. off by default: explicit zero reproduces the default hash, no module, no snapshot fields, the columns read 0 (cover_mean is always there)
{
  ok(defaultParams().dynamicTrees === 0, 'dynamicTrees is off by default');
  ok(applyOverrides(defaultParams(), { dynamicTrees: 1 }).dynamicTrees === 1, 'the switch takes an override');
  ok(simHash(3, 1800, { dynamicTrees: 0 }) === simHash(3, 1800), 'an explicit 0 reproduces the default hash');
  const sim = createSim({ seed: 3 });
  ok(sim.trees === null, 'no tree module while off');
  sim.step(30);
  const snap = sim.snapshot(true);
  ok(snap.trees === undefined && snap.treesVersion === undefined && snap.treeCover === undefined, 'no tree fields in the snapshot while off');
  const row = sim.sample();
  ok(row.tr_live === 0 && row.tr_cw_mature === 0 && row.tr_rec_cw === 0 && row.tr_fire_small === 0 && row.tr_jun_ridge === 0, 'the tree columns read 0 while off');
  ok(row.cover_mean > 0.01 && row.cover_mean < 0.2, `cover_mean is reported while off (${row.cover_mean.toFixed(3)})`);
}

// 2. on: the list starts as the world's trees, mature, in the same order; the caller's world is not changed; no main-stream draw
{
  const world = generateWorld(3);
  const cov0 = Float32Array.from(world.cover), cap0 = Float32Array.from(world.capacity), n0 = world.trees.length;
  const sim = new Sim({ seed: 3, params: tp(), world });
  const T = sim.trees!;
  ok(T !== null && T.count === n0 / 4 && T.initial === n0 / 4, `the list holds the world's ${n0 / 4} trees`);
  let same = true, mature = true;
  for (let i = 0; i < T.count; i++) {
    if (T.x[i] !== world.trees[i * 4] || T.y[i] !== world.trees[i * 4 + 1] || T.h[i] !== world.trees[i * 4 + 2]) same = false;
    if (T.stage[i] !== Stage.Mature) mature = false;
  }
  ok(same, 'slot i is the world tree i (position and height)');
  ok(mature, 'every starting tree is mature');
  ok(countStage(T, Stage.Mature, Kind.Cottonwood) > 100, 'most of the starting trees are cottonwoods (by the water)');
  sim.step(2500);
  let intact = world.trees.length === n0;
  for (let c = 0; c < cov0.length; c++) if (world.cover[c] !== cov0[c] || world.capacity[c] !== cap0[c]) { intact = false; break; }
  ok(intact, 'a world handed to the sim is not changed (the sim works on a copy)');
  const a = createSim({ seed: 5 }), b = createSim({ seed: 5, params: tp() });
  let eq = a.a.hi === b.a.hi;
  for (let i = 0; eq && i < a.a.hi; i++) if (a.a.x[i] !== b.a.x[i] || a.a.y[i] !== b.a.y[i]) eq = false;
  ok(eq, 'the same founders with trees on (no main-rng draw at construction)');
  const s1 = createSim({ seed: 9, params: tp({ stormCells: 1, springFloods: 1 }) }), s2 = createSim({ seed: 9, params: tp({ stormCells: 1, springFloods: 1 }) });
  s1.step(4000);
  s2.step(4000);
  ok(JSON.stringify(s1.sample()) === JSON.stringify(s2.sample()), 'two runs with the same seed and trees on agree');
}

// 3. growth: stages by age, heights follow, a planted grove matures
{
  const sim = createSim({ seed: 3, params: tp({ treeGrowth: 30 }) });
  const T = sim.trees!, P = priv(T);
  const [x, y] = landSpot(sim, 80);
  const rng = new Rng(1);
  const s = P.spawn(Kind.Cottonwood, x, y, 0, rng);
  ok(T.stage[s] === Stage.Seedling && T.h[s] <= 0.31, 'a new tree is a seedling about 0.3 m tall');
  T.age[s] = 2;
  const sap = P.spawn(Kind.Cottonwood, x + 6, y, 2, rng);
  const young = P.spawn(Kind.Cottonwood, x + 12, y, 8, rng);
  const mat = P.spawn(Kind.Cottonwood, x + 18, y, 40, rng);
  ok(T.stage[sap] === Stage.Sapling && T.stage[young] === Stage.Young && T.stage[mat] === Stage.Mature, 'ages 2, 8 and 40 are sapling, young and mature');
  ok(T.h[sap] < T.h[young] && T.h[young] < T.h[mat] && Math.abs(T.h[mat] - T.hMax[mat]) < 1e-5, 'height rises with stage to the full height');
  const j = P.spawn(Kind.Juniper, x, y + 6, 40, rng);
  ok(T.stage[j] === Stage.Mature && T.hMax[j] <= 8.01 && T.hMax[j] >= 4, 'a juniper is mature at 40 and tops out at 4 to 8 m');
  // let it grow
  P.release(s);
  const q = P.spawn(Kind.Cottonwood, x, y + 12, 0, rng);
  for (let t = 24; t <= 2400; t += 24) T.step(t);
  ok(T.stage[q] >= Stage.Young || T.stage[q] === Stage.Gone, `a seedling grows up (or dies) at 30x speed (stage ${T.stage[q]})`);
  ok(T.age[mat] > 40, 'the mature tree keeps ageing');
}

// 4. old age: a tree past its lifespan becomes a snag, which falls later and frees the slot
{
  const sim = createSim({ seed: 3, params: tp() });
  const T = sim.trees!, P = priv(T);
  const [x, y] = landSpot(sim, 80);
  const i = P.spawn(Kind.Cottonwood, x, y, 50, new Rng(2));
  T.life[i] = 50.01;
  let t = 24;
  for (; t < 200 && T.stage[i] !== Stage.Snag; t += 24) T.step(t);
  ok(T.stage[i] === Stage.Snag && T.live[i] === 0, 'a tree that reaches its lifespan becomes a snag');
  ok(T.drainSample().old >= 1, 'the old-age death is counted');
  T.life[i] = 0.05;
  for (; t < 1200 && T.stage[i] === Stage.Snag; t += 24) T.step(t);
  ok(T.stage[i] === Stage.Gone, 'the snag falls and the slot is free');
  const k = P.spawn(Kind.Juniper, x, y, 0, new Rng(3));
  ok(k === i, 'a free slot is reused by the next new tree');
}

// 5. fire: kills 90% of seedlings and saplings and 10% of mature trees (default params), young in between
{
  const sim = createSim({ seed: 3, params: tp() });
  const T = sim.trees!, P = priv(T), v = sim.veg, w = sim.world;
  const rng = new Rng(4);
  // 60 saplings, 60 young trees on open land, one per 6 m
  const small: number[] = [], yng: number[] = [];
  let k = 0;
  for (let y = 40; y < w.size - 40 && small.length < 60; y += 6) {
    for (let x = 40; x < w.size - 40 && small.length < 60; x += 24) {
      const c = sim.veg.cellAt(x, y);
      if (w.water[c] || w.waterDist[c] < 30 || w.cover[c] > 0.05) continue;
      small.push(P.spawn(Kind.Juniper, x, y, 4, rng));
      yng.push(P.spawn(Kind.Juniper, x + 4, y, 20, rng));
      k++;
    }
  }
  ok(small.length === 60, `test set-up: 60 saplings (${small.length})`);
  ok(T.stage[small[0]] === Stage.Sapling && T.stage[yng[0]] === Stage.Young, 'juniper at 4 and 20 years: sapling and young');
  const matureAll: number[] = [];
  for (let i = 0; i < T.initial; i++) matureAll.push(i);
  for (const i of [...small, ...yng, ...matureAll]) v.burn[v.cellAt(T.x[i], T.y[i])] = 2;
  T.noteBurning(1);
  T.step(24);
  const deadSmall = small.filter((i) => T.stage[i] === Stage.Gone).length;
  const deadYoung = yng.filter((i) => T.stage[i] === Stage.Gone).length;
  const snags = matureAll.filter((i) => T.stage[i] === Stage.Snag).length;
  ok(deadSmall >= 45, `fire kills about 90% of saplings (${deadSmall} of 60)`);
  ok(deadYoung >= 12 && deadYoung <= 36, `fire kills about 40% of young trees (${deadYoung} of 60)`);
  ok(snags >= 5 && snags <= 45, `fire kills about 10% of mature trees, which stand on as snags (${snags} of ${matureAll.length})`);
  ok(matureAll.every((i) => T.stage[i] === Stage.Snag || T.stage[i] === Stage.Mature), 'a fire never turns a mature tree into a seedling or removes it');
  const d = T.drainSample();
  ok(d.fireSmall === deadSmall + deadYoung && d.fireMature === snags, 'the fire deaths are counted');
  ok(T.lastFire[v.cellAt(T.x[0], T.y[0])] === 24, 'the burnt cells remember when they burned');
  // one roll per fire: another step in the same fire kills no more
  const before = countStage(T, Stage.Snag);
  T.step(48);
  ok(countStage(T, Stage.Snag) === before, 'a tree rolls once per fire');
  // the fire shows at once in the snapshot version
  ok(sim.snapshot(true).trees !== undefined, 'the fire deaths reach the snapshot');
}

// 6. browsing: deer in the 16 m cell slow a sapling
{
  const sim = createSim({ seed: 3, params: tp() });
  const T = sim.trees!, P = priv(T), a = sim.a;
  const [x, y] = landSpot(sim, 80);
  sim.apply({ kind: 'introduce', species: Sp.MuleDeer, count: 4, x, y });
  let di = -1;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.MuleDeer) { di = i; break; }
  ok(di >= 0, 'test set-up: a mule deer');
  const rng = new Rng(6);
  // keep the deer together on the sapling's cell
  let n = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.MuleDeer && n++ < 4) { a.x[i] = x; a.y[i] = y; }
  const near = P.spawn(Kind.Cottonwood, x, y, 2, rng);
  const far = P.spawn(Kind.Cottonwood, x + 150, y + 150, 2, rng);
  const a0n = T.age[near], a0f = T.age[far];
  T.step(24);
  const gn = T.age[near] - a0n, gf = T.age[far] - a0f;
  ok(gn > 0 && gf > 0 && gn < 0.5 * gf, `a sapling among the deer grows less than half as fast (${gn.toFixed(5)} vs ${gf.toFixed(5)})`);
  ok(T.drainSample().slow > 0.3, 'the mean browse slowdown is reported');
  const old = P.spawn(Kind.Cottonwood, x, y + 2, 40, rng);
  const ao = T.age[old];
  T.step(48);
  ok(Math.abs(T.age[old] - ao - 24 / 2400) < 1e-4, 'a mature tree is not slowed by the deer');
}

// 7. cover is rebuilt from the list each season; capacity and browse capacity follow; the habitat map and raptor tables are refreshed
{
  const sim = createSim({ seed: 3, params: tp() });
  const T = sim.trees!, P = priv(T), w = sim.world, v = sim.veg;
  const m0 = v.meanOf(w.cover);
  P.seasonPass(24, 0);
  const m1 = v.meanOf(w.cover);
  ok(Math.abs(m1 - m0) < 0.1 * m0, `the first rebuild reproduces the world's cover (mean ${m0.toFixed(4)} to ${m1.toFixed(4)})`);
  // kill a mature tree: its crown cover goes at the next season
  let best = -1;
  for (let i = 0; i < T.initial; i++) if (w.cover[v.cellAt(T.x[i], T.y[i])] > 0.7 && T.stage[i] === Stage.Mature) { best = i; break; }
  ok(best >= 0, 'test set-up: a tree in thick cover');
  const c = v.cellAt(T.x[best], T.y[best]);
  const cov = w.cover[c], cap = w.capacity[c], bk = v.browseK[c];
  // remove every tree around it
  for (let i = 0; i < T.initial; i++) if (Math.hypot(T.x[i] - T.x[best], T.y[i] - T.y[best]) < 14) P.snag(i);
  ok(w.cover[c] === cov, 'the cover waits for the season (nothing changes mid-season)');
  const ver = T.version;
  P.seasonPass(48, 1);
  ok(w.cover[c] < cov - 0.3, `a stand that died leaves open ground at the next season (${cov.toFixed(2)} to ${w.cover[c].toFixed(2)})`);
  ok(w.capacity[c] > cap && v.browseK[c] < bk, 'the grass capacity rises and the browse capacity falls with it');
  ok(T.version > ver, 'the version moves when the list is rebuilt');
  // the sim's own world.trees follows the list (gone and snag heights)
  ok(w.trees.length === T.count * 4 && w.trees[best * 4 + 2] === T.h[best], 'world.trees is the list in the same slot order');
  // mule deer habitat map is rebuilt from the new cover (it caches the field)
  const mh = (sim.mule as unknown as { habMap: Float32Array | null });
  void sim.mule.hab;
  ok(mh.habMap !== null, 'the habitat map exists');
  P.seasonPass(72, 2);
  ok(mh.habMap === null, 'a season change drops the cached habitat map');
}

// 8. raptors: a snag is no nest tree, and the perch table follows the list
{
  const sim = createSim({ seed: 3, params: tp() });
  const T = sim.trees!, P = priv(T);
  const R = sim.raptors as unknown as { nestTrees: number[]; ttH: Float32Array; liveTrees: Uint8Array | null };
  ok(R.nestTrees.length > 5 && R.liveTrees === null, 'test set-up: the raptors have nest trees');
  const t0 = R.nestTrees[0];
  P.snag(t0);
  P.seasonPass(24, 0);
  ok(R.liveTrees !== null && !R.nestTrees.includes(t0) && R.nestTrees.length > 3, 'a dead tree is dropped from the nest trees');
  const tall = Math.max(...R.ttH);
  ok(tall >= 11, 'the perch table is rebuilt (the tallest perch is still a tree)');
}

// 9. the player's grove goes through the list as young cottonwoods
{
  const sim = createSim({ seed: 3, params: tp() });
  const T = sim.trees!, w = sim.world, v = sim.veg;
  sim.step(20);
  const [x, y] = landSpot(sim, 80);
  const c = v.cellAt(x, y);
  const disc: number[] = [];
  for (let k = 0; k < w.cover.length; k++) {
    if (!w.water[k] && Math.hypot(((k % w.n) + 0.5) * w.cell - x, (((k / w.n) | 0) + 0.5) * w.cell - y) < 15) disc.push(k);
  }
  const mean = (f: Float32Array): number => disc.reduce((s, k) => s + f[k], 0) / disc.length;
  const cov0 = mean(w.cover), cap0 = mean(w.capacity), bk0 = mean(v.browseK), n0 = T.count;
  ok(sim.snapshot(true).groves === undefined, 'no groves field before a grove is planted');
  sim.apply({ kind: 'grove', x, y, radius: 20 });
  ok(T.count > n0 + 8, `the grove adds trees to the list (${T.count - n0})`);
  ok(mean(w.cover) > cov0 + 0.15, `its cover appears at once (mean ${cov0.toFixed(2)} to ${mean(w.cover).toFixed(2)})`);
  ok(mean(w.capacity) < cap0 && mean(v.browseK) > bk0, 'shade cuts the grass capacity and raises the browse capacity');
  const e = sim.events.find((q) => q.kind === 'grovePlanted');
  let young = 0, inside = 0;
  for (let i = n0; i < T.count; i++) {
    if (T.stage[i] === Stage.Young && T.kind[i] === Kind.Cottonwood) young++;
    if (Math.hypot(T.x[i] - x, T.y[i] - y) <= 20) inside++;
  }
  ok(!!e && e.sp === -1 && e.x === x && e.y === y && e.a === 20 && e.b === young, 'grovePlanted (sp -1) reports the centre, radius and tree count');
  ok(young === T.count - n0 && inside === young, 'the grove is young cottonwoods inside the radius');
  const snap = sim.snapshot(true);
  ok(snap.groves === undefined, 'the grove trees come in the tree list, not as a separate groves field');
  ok(!!snap.trees && snap.trees.length === T.count * TREE_STRIDE, 'the snapshot carries the whole list, TREE_STRIDE floats per tree');
  const o = n0 * TREE_STRIDE;
  ok(snap.trees![o] === T.x[n0] && snap.trees![o + 2] === T.h[n0] && snap.trees![o + 4] === Kind.Cottonwood && snap.trees![o + 5] === Stage.Young, 'a planted tree reads [x, y, h, r, kind, stage]');
  ok(!!snap.treeCover && snap.treeCover.length === w.n * w.n && snap.treeCover[c] === Math.round(w.cover[c] * 255), 'the cover field comes with the list');
  ok(snap.treesVersion === T.version, 'treesVersion is the list version');
  const snap2 = sim.snapshot(true);
  ok(snap2.trees === undefined && snap2.treesVersion === T.version, 'the list is not sent again until it changes');
  ok(sim.snapshot(false).trees === undefined, 'a snapshot without the vegetation texture carries no list');
  // a grove in the water: the trees in water cells are skipped
  const ground = sim.snapshot(true);
  void ground;
  let wx = -1, wy = -1;
  for (let k = 0; k < w.water.length && wx < 0; k++) if (w.water[k] && w.waterDist[k] === 0) { wx = ((k % w.n) + 0.5) * w.cell; wy = (((k / w.n) | 0) + 0.5) * w.cell; }
  const before = T.count;
  sim.apply({ kind: 'grove', x: wx, y: wy, radius: 6 });
  let wet = 0;
  for (let i = before; i < T.count; i++) if (w.water[v.cellAt(T.x[i], T.y[i])]) wet++;
  ok(wet === 0, 'no planted tree stands in the water');
  // the planted grove grows: young at 13.5 years, mature after 4.5 more
  const tree = n0;
  const h0 = T.h[tree];
  for (let t = 24; t <= 24 * 200; t += 24) T.step(t);
  ok(T.h[tree] > h0 + 0.4, `a planted tree grows (${h0.toFixed(1)} to ${T.h[tree].toFixed(1)} m in 2 years)`);
}

// 10. cottonwoods recruit on bare, wet ground, and far more after a flood; the pulse is a grove event
{
  const mk = () => {
    const sim = createSim({ seed: 3, params: tp({ treeCwRecruit: 0.01 }) });
    sim.veg.grass.fill(0);
    return sim;
  };
  const a = mk(), b = mk();
  priv(a.trees!).recruitCottonwood(100);
  const ra = a.trees!.drainSample().recCw;
  // a flood over the whole riparian band, severity 1
  const T = b.trees!;
  const mask = new Uint8Array(b.world.n * b.world.n);
  for (let c = 0; c < mask.length; c++) if (!b.world.water[c] && b.world.waterDist[c] < 30) mask[c] = 1;
  T.floodEnded(mask, 1, 50);
  priv(T).recruitCottonwood(100);
  const rb = T.drainSample().recCw;
  ok(ra >= 0 && rb > Math.max(10, 5 * ra), `a flood multiplies the cottonwood recruits (${ra} without, ${rb} after a flood)`);
  const e = b.events.find((q) => q.kind === 'grovePlanted' && q.sp === -2);
  ok(!!e && e.b >= 12 && e.a > 5, 'a pulse of flood seedlings raises a natural grove event (sp -2)');
  ok(!a.events.some((q) => q.kind === 'grovePlanted'), 'no grove event without a flood');
  // the new trees are seedlings on moist ground near water, not under a crown
  let good = true;
  for (let i = T.initial; i < T.count; i++) {
    const c = b.veg.cellAt(T.x[i], T.y[i]);
    if (T.stage[i] !== Stage.Seedling || b.world.waterDist[c] > 30.5 || b.world.water[c]) good = false;
  }
  ok(good, 'recruits are seedlings within 30 m of the water, never in it');
  // no seeds, no recruits: with every cottonwood gone the pulse finds nothing
  const d = mk();
  for (let i = 0; i < d.trees!.count; i++) priv(d.trees!).release(i);
  (d.trees as unknown as { refreshSeeds(): void }).refreshSeeds();
  priv(d.trees!).recruitCottonwood(100);
  ok(d.trees!.drainSample().recCw === 0, 'with no seed source there are no recruits');
  // a flooded real run: the S17 flood tool feeds the pulse
  const sim = createSim({ seed: 3, params: tp({ treeCwRecruit: 0.01 }) });
  sim.step(100);
  sim.apply({ kind: 'flood', ticks: 50, severity: 0.8 });
  sim.step(60);
  ok(sim.flood === null, 'the tool flood ended');
  const T2 = sim.trees as unknown as { floodMask: Uint8Array | null; floodSev: number };
  ok(T2.floodMask !== null && Math.abs(T2.floodSev - 0.8) < 1e-6, 'the end of a flood is passed to the trees');
}

// 11. junipers: fire-free years, room, and the encroachment event
{
  const mk = (extra: Record<string, number> = {}) => {
    const sim = createSim({ seed: 3, params: tp({ treeJunBg: 0.02, ...extra }) });
    sim.veg.grass.fill(0);
    return sim;
  };
  const free = mk(), burnt = mk(), half = mk();
  priv(free.trees!).recruitJuniper(10000);
  const nFree = free.trees!.drainSample().recJun;
  burnt.trees!.lastFire.fill(10000);
  priv(burnt.trees!).recruitJuniper(10000);
  const nBurnt = burnt.trees!.drainSample().recJun;
  half.trees!.lastFire.fill(10000 - 6 * 2400);
  priv(half.trees!).recruitJuniper(10000);
  const nHalf = half.trees!.drainSample().recJun;
  ok(nFree > 100, `junipers spread over the ridges when nothing burns (${nFree})`);
  ok(nBurnt === 0, 'no juniper takes root on ground that just burned');
  ok(nHalf > 0.3 * nFree && nHalf < 0.7 * nFree, `half the fire-free interval gives about half the recruits (${nHalf} of ${nFree})`);
  let onRidge = true;
  const T = free.trees!, w = free.world;
  for (let i = T.initial; i < T.count; i++) if (T.kind[i] !== Kind.Juniper || w.waterDist[free.veg.cellAt(T.x[i], T.y[i])] < 30) onRidge = false;
  ok(onRidge, 'junipers recruit only on the ridges, 30 m or more from the water');
  // room: the cap stops them
  const capped = mk({ treeJunCap: 50 });
  priv(capped.trees!).recruitJuniper(10000);
  ok(capped.trees!.drainSample().recJun <= 55, 'treeJunCap limits the junipers');
  // encroachment: once past the threshold, once, then again after a fire clears the ridges
  const e = mk({ treeEncroach: 0.005, treeJunCap: 5000 });
  const E = e.trees!;
  priv(E).recruitJuniper(10000);
  priv(E).checkEncroachment();
  priv(E).checkEncroachment();
  const ev = e.events.filter((q) => q.kind === 'encroachment');
  ok(ev.length === 1 && ev[0].a > 100 && ev[0].b >= 0.005 && ev[0].b < 0.2, `encroachment is raised once when junipers pass the threshold (${ev.length}, a ${ev[0]?.a}, b ${ev[0]?.b})`);
  for (let i = E.initial; i < E.count; i++) priv(E).release(i);
  priv(E).checkEncroachment();
  priv(E).recruitJuniper(10001);
  priv(E).checkEncroachment();
  ok(e.events.filter((q) => q.kind === 'encroachment').length === 2, 'it fires again after the junipers were cleared and came back');
  ok(E.drainSample().encroach === 2, 'the encroachment events are counted');
}

// 12. the sample columns and the whole thing in a run
{
  const sim = createSim({ seed: 3, params: tp() });
  sim.step(3000);
  const row = sim.sample();
  const T = sim.trees!;
  const c = T.counts();
  ok(row.tr_live === c.total && row.tr_cw_mature + row.tr_cw_young + row.tr_cw_sapling + row.tr_cw_seedling + row.tr_jun_seedling + row.tr_jun_sapling + row.tr_jun_young + row.tr_jun_mature + row.tr_oak_mature + row.tr_oak_young + row.tr_oak_sapling + row.tr_oak_seedling === c.total, 'the stage columns add up to the live trees');
  ok(row.tr_cw_mature > 100 && row.cover_mean > 0.01, 'a cottonwood stand and a cover mean are reported');
  ok(TREE_STEP === 24 && TREE_STRIDE === 6, 'step and stride constants');
  // a fire and a flood in a real run
  sim.apply({ kind: 'fire', x: T.x[0], y: T.y[0] });
  sim.step(200);
  ok(sim.veg.burningCells >= 0 && T.counts().n[0][Stage.Snag] + T.counts().n[2][Stage.Snag] >= 0, 'a fire in a real run does not crash');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
