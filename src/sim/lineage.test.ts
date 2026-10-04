// Unit tests for lineage records and pack dynasties (S15). Run: npx tsx src/sim/lineage.test.ts
import { Agents } from './agents';
import { DEATH_CAUSES, Lineage, LineageNode, PackView } from './lineage';
import { createSim } from './sim';
import { Sp } from './types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

function packView(n = 4): PackView {
  return { alive: new Uint8Array(n), serial: new Int32Array(n), alphaF: new Int32Array(n).fill(-1), alphaM: new Int32Array(n).fill(-1) };
}

/** Spawn a bare animal with the given parents and child count. */
function make(a: Agents, parentA: number, parentB: number, children: number, male = 0): number {
  const i = a.spawn();
  a.parentA[i] = parentA;
  a.parentB[i] = parentB;
  a.children[i] = children;
  a.male[i] = male;
  a.sp[i] = Sp.Bison;
  return i;
}

// 1. qualification rule
{
  const a = new Agents(16);
  const lin = new Lineage(a, packView(), 100, 10);
  const barren = make(a, 0, 0, 0);
  const mother = make(a, 0, 0, 2);
  const sire = make(a, 0, 0, 0, 1);
  const followed = make(a, 0, 0, 0);
  const bystander = make(a, 0, 0, 0);
  lin.onMate(sire);
  lin.follow(a.id[followed]);
  const ids = [barren, mother, sire, followed, bystander].map((i) => a.id[i]);
  for (const i of [barren, mother, sire, followed, bystander]) { lin.onDeath(i, 2, 500); a.kill(i); }
  ok(!lin.hasRecord(ids[0]), 'childless unfollowed animal is not recorded');
  ok(lin.hasRecord(ids[1]), 'animal with children is recorded');
  ok(lin.hasRecord(ids[2]), 'male that mated is recorded');
  ok(lin.hasRecord(ids[3]), 'followed animal is recorded without children');
  ok(!lin.hasRecord(ids[4]), 'bystander is not recorded');
  ok(lin.count === 3 && lin.written === 3, 'three records written');
  const t = lin.query(ids[1]);
  ok(t !== null && t.self.died === 500 && t.self.cause === 2 && !t.self.alive && t.self.children === 2, 'record carries death tick, cause and child count');
  ok(lin.query(ids[0]) === null, 'unknown id queries to null');
  // a follow made after the slot is reused must not match the new occupant
  const slot = make(a, 0, 0, 0);
  ok(!lin.hasRecord(a.id[slot]), 'new occupant of a reused slot is not recorded');
  lin.onDeath(slot, 0, 600);
  ok(!lin.hasRecord(a.id[slot]), 'stale sire mark does not leak to a reused slot');
  ok(DEATH_CAUSES.indexOf('disease') === 7 && DEATH_CAUSES.indexOf('starve') === 0, 'cause codes match die()');
}

// 2. ring overwrite and id map consistency
{
  const cap = 1000, total = 7321;
  const a = new Agents(64);
  const lin = new Lineage(a, packView(), cap, 10);
  const ids: number[] = [];
  for (let k = 0; k < total; k++) {
    const i = make(a, 0, 0, 1);
    ids.push(a.id[i]);
    lin.onDeath(i, k % 8, k);
    a.kill(i);
  }
  ok(lin.count === cap && lin.written === total, 'ring holds exactly cap records after overflow');
  let held = 0, stale = 0, missing = 0, wrong = 0;
  for (let k = 0; k < total; k++) {
    const has = lin.hasRecord(ids[k]);
    if (k >= total - cap) { if (has) held++; else missing++; } else if (has) stale++;
  }
  ok(held === cap && missing === 0, 'every record still in the ring is indexed');
  ok(stale === 0, 'overwritten records are gone from the index');
  for (let k = total - cap; k < total; k += 37) {
    const t = lin.query(ids[k]);
    if (!t || t.self.id !== ids[k] || t.self.died !== k || t.self.cause !== k % 8) wrong++;
  }
  ok(wrong === 0, 'index resolves each id to its own record after wrap-around');
  // parent links to an overwritten record come back null, not stale data
  const kid = make(a, ids[0], ids[total - 1], 0);
  const t = lin.query(a.id[kid]);
  ok(t !== null && t.up[0][0] === null && t.up[0][1] !== null && t.up[0][1].id === ids[total - 1], 'overwritten parent is null, retained parent resolves');
}

// 3. dynasty ring
{
  const a = new Agents(16);
  const pv = packView(2);
  const lin = new Lineage(a, pv, 100, 5);
  const f1 = make(a, 0, 0, 0), m1 = make(a, 0, 0, 0, 1), f2 = make(a, 0, 0, 0);
  pv.alive[0] = 1; pv.serial[0] = 7;
  lin.syncAlphas(10);
  ok(lin.dynasty(7).length === 0, 'a pack with no alphas logs nothing');
  pv.alphaF[0] = f1; pv.alphaM[0] = m1;
  lin.syncAlphas(11);
  lin.syncAlphas(12);
  ok(lin.dynasty(7).length === 1, 'an unchanged pair is logged once');
  pv.alphaF[0] = f2;
  lin.syncAlphas(40);
  const d = lin.dynasty(7);
  ok(d.length === 2 && d[0].tick === 11 && d[0].f === a.id[f1] && d[0].m === a.id[m1] && d[1].tick === 40 && d[1].f === a.id[f2] && d[1].m === a.id[m1], 'succession lists each pair in order');
  a.alive[m1] = 0; // widowed
  lin.syncAlphas(50);
  const d2 = lin.dynasty(7);
  ok(d2.length === 3 && d2[2].m === 0 && d2[2].f === a.id[f2], 'a vacant seat is logged as id 0');
  // alpha flag lands on the record at death
  lin.onDeath(f2, 2, 60);
  ok(lin.query(a.id[f2])!.self.alpha && lin.query(a.id[f2])!.self.pack === 7, 'alpha flag and pack serial recorded at death');
  // a pack slot reused with a new serial starts its own history
  pv.serial[0] = 8; pv.alphaF[0] = -1; pv.alphaM[0] = -1;
  lin.syncAlphas(70);
  ok(lin.dynasty(8).length === 0 && lin.dynasty(7).length === 3, 'new serial in a reused pack slot is a separate dynasty');
  for (let k = 0; k < 10; k++) { pv.alphaF[0] = f1; pv.alphaM[0] = -1; lin.syncAlphas(100 + k * 2); pv.alphaF[0] = f2; lin.syncAlphas(101 + k * 2); }
  ok(lin.dynCount === 5, 'dynasty ring is capped');
  const all = lin.dynasty(8);
  ok(all.length === 5 && all.every((e, k) => k === 0 || e.tick > all[k - 1].tick), 'dynasty ring stays in chronological order after wrapping');
}

// 4. a real run: 3 up, 2 down
{
  const sim = createSim({ seed: 3 });
  const twin = createSim({ seed: 3 });
  for (let k = 0; k < 20000; k++) {
    sim.step();
    if (k % 2500 === 0) sim.lineage.query(sim.a.id[0]); // queries must not disturb the run
  }
  twin.step(20000);
  let same = sim.a.count === twin.a.count && sim.a.hi === twin.a.hi;
  for (let i = 0; same && i < sim.a.hi; i++) if (sim.a.x[i] !== twin.a.x[i] || sim.a.energy[i] !== twin.a.energy[i]) same = false;
  ok(same, 'queries and lineage bookkeeping leave the run unchanged (same state as a run without queries)');

  const a = sim.a;
  ok(sim.lineage.written > 100, `deaths with offspring were recorded (${sim.lineage.written})`);
  let pick = -1;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.gen[i] >= 3 && (pick < 0 || a.gen[i] > a.gen[pick])) pick = i;
  ok(pick >= 0, 'a living animal of generation 3 or more exists after 20000 ticks');
  if (pick >= 0) {
    const t = sim.lineage.query(a.id[pick])!;
    ok(t !== null && t.self.id === a.id[pick] && t.self.alive && t.self.gen === a.gen[pick], 'self node matches the agent arrays');
    ok(t.self.born === a.born[pick] && t.self.parentA === a.parentA[pick] && t.self.parentB === a.parentB[pick], 'self parents and birth match');
    ok(t.up[0].length === 2 && t.up[1].length === 4 && t.up[2].length === 8, 'up rows have 2, 4 and 8 slots');
    ok(t.up[0][0] !== null && t.up[0][0]!.id === a.parentA[pick], 'mother resolves to her id');
    // follow the line of highest generation: each step must resolve down to the founders
    let depth = 0;
    // walk by rows: at each row take the parent pair of the previous pick with the higher generation
    let at = 0; // index into the previous row
    let prev: LineageNode = t.self;
    for (let row = 0; row < 3; row++) {
      const pair = [t.up[row][at * 2] ?? null, t.up[row][at * 2 + 1] ?? null];
      let best = -1;
      for (let k = 0; k < 2; k++) if (pair[k] && (best < 0 || pair[k]!.gen > pair[best]!.gen)) best = k;
      if (prev.gen === 0) break;
      ok(best >= 0 && pair[best]!.gen === prev.gen - 1, `row ${row}: the ancestor one generation back resolves (gen ${prev.gen} -> ${pair[best]?.gen})`);
      if (best < 0) break;
      prev = pair[best]!;
      at = at * 2 + best;
      depth++;
    }
    ok(depth === 3, 'a generation 3 animal has a resolved line back through three ancestors');
    // down: the mother's tree lists this animal among her children
    const mt = sim.lineage.query(a.parentA[pick])!;
    ok(mt !== null, 'mother has a tree');
    const me = mt.down.find((d) => d.node.id === a.id[pick]);
    ok(!!me, 'the mother lists this animal as a child');
    ok(mt.down.every((d) => d.node.parentA === mt.self.id || d.node.parentB === mt.self.id), 'every listed child names the queried animal as a parent');
    ok(mt.down.every((d) => d.children.every((g) => g.parentA === d.node.id || g.parentB === d.node.id)), 'every listed grandchild names its parent');
    const grandmother = sim.lineage.query(mt.self.parentA);
    if (grandmother) {
      const via = grandmother.down.find((d) => d.node.id === mt.self.id);
      ok(!!via && via.children.some((g) => g.id === a.id[pick]), 'grandmother lists this animal as a grandchild through the mother');
    }
    ok(mt.down.every((d, k) => k === 0 || d.node.born >= mt.down[k - 1].node.born), 'children are sorted by birth tick');
  }
  // dynasty: the current alpha pair is the latest entry for each live pack
  sim.lineage.syncAlphas(sim.tick);
  let packs = 0, matched = 0;
  for (let pk = 0; pk < sim.packAlive.length; pk++) {
    if (!sim.packAlive[pk]) continue;
    packs++;
    const list = sim.lineage.dynasty(sim.packSerial[pk]);
    const last = list[list.length - 1];
    const fi = sim.packAlphaF[pk], mi = sim.packAlphaM[pk];
    const f = fi >= 0 && a.alive[fi] ? a.id[fi] : 0, m = mi >= 0 && a.alive[mi] ? a.id[mi] : 0;
    if ((f === 0 && m === 0 && !last) || (last && last.f === f && last.m === m)) matched++;
  }
  ok(packs > 0, `wolf packs exist after 20000 ticks (${packs})`);
  ok(matched === packs, 'the latest dynasty entry of every live pack is its current alpha pair');
}

if (failures) {
  console.error(`${failures} of ${checks} lineage checks failed`);
  process.exit(1);
}
console.log(`lineage: all ${checks} checks passed`);
