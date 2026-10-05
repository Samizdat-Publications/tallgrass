// Unit tests for the family tree layout (pedigree and pack dynasty). Run: npx tsx src/ui/familytree.test.ts
import type { DynastyEntry, LineageDescendant, LineageNode, LineageTree } from '../sim/lineage';
import { YEAR_TICKS } from '../sim/types';
import { yearStartTick } from './describe';
import { MAX_SLOTS, causeText, layoutDynasty, layoutPedigree, lifeText, nodeName, traitChips, upX, type PedLayout } from './familytree';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

let nextId = 1000;
function node(over: Partial<LineageNode> = {}): LineageNode {
  const id = over.id ?? nextId++;
  return {
    id, sp: 0, male: false, born: 100, died: -1, cause: -1, gen: 2, children: 0, kills: 0, alive: true, pack: -1, alpha: false,
    parentA: 1, parentB: 2, ...over,
  };
}

/** A tree with every ancestor present: 2, 4 and 8 of them, and `kids` children with `grand` grandchildren each. */
function fullTree(kids = 0, grand = 0): LineageTree {
  const mk = (): LineageNode => node({ alive: false, died: 500, cause: 2 });
  const up0 = [mk(), mk()];
  const up1 = [mk(), mk(), mk(), mk()];
  const up2 = Array.from({ length: 8 }, mk);
  const self = node({ parentA: up0[0].id, parentB: up0[1].id, children: kids });
  const down: LineageDescendant[] = [];
  for (let k = 0; k < kids; k++) {
    const kid = node({ parentA: self.id, born: 300 + k, children: grand });
    down.push({ node: kid, children: Array.from({ length: grand }, (_, g) => node({ parentA: kid.id, born: 400 + g })) });
  }
  return { self, up: [up0, up1, up2], down };
}

function noOverlap(lay: PedLayout, label: string): void {
  const byTier = new Map<number, number[]>();
  for (const n of lay.nodes) byTier.set(n.tier, [...(byTier.get(n.tier) ?? []), n.x]);
  for (const [tier, xs] of byTier) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) ok(xs[i] - xs[i - 1] >= 0.999, `${label}: nodes in tier ${tier} are at least one slot apart (${xs[i - 1]} then ${xs[i]})`);
    for (const x of xs) ok(x >= 0.5 - 1e-9 && x <= lay.width - 0.5 + 1e-9, `${label}: node at ${x} sits inside the width ${lay.width}`);
  }
}

function linksValid(lay: PedLayout, label: string): void {
  const keys = new Set(lay.nodes.map((n) => n.key));
  ok(keys.size === lay.nodes.length, `${label}: node keys are unique`);
  for (const l of lay.links) {
    ok(keys.has(l.from) && keys.has(l.to), `${label}: link ${l.from} to ${l.to} joins two drawn nodes`);
    const a = lay.nodes.find((n) => n.key === l.from)!;
    const b = lay.nodes.find((n) => n.key === l.to)!;
    ok(a.tier !== b.tier, `${label}: a link joins two different rows`);
  }
}

// ---- a complete tree ---------------------------------------------------------------------------------------------
{
  const lay = layoutPedigree(fullTree(3, 2));
  const up = lay.nodes.filter((n) => n.kind === 'up');
  ok(up.length === 14, `full tree draws 14 ancestors (got ${up.length})`);
  ok(lay.nodes.filter((n) => n.row === 4).length === 3, 'three children drawn');
  ok(lay.nodes.filter((n) => n.row === 5).length === 6, 'two grandchildren under each of three children');
  ok(lay.tiers === 6, `six rows (got ${lay.tiers})`);
  ok(lay.width === 8, `eight slots wide (got ${lay.width})`);
  const self = lay.nodes.find((n) => n.key === lay.selfKey)!;
  ok(self.x === lay.width / 2, 'the animal sits in the middle');
  ok(self.tier === 3, 'the animal is on the fourth row');
  // every parent is centred over its two parents' mean
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 2 << k; i++) {
      const p = lay.nodes.find((n) => n.key === `u${k}:${i}`)!;
      const a = lay.nodes.find((n) => n.key === `u${k + 1}:${2 * i}`)!;
      const b = lay.nodes.find((n) => n.key === `u${k + 1}:${2 * i + 1}`)!;
      ok(Math.abs(p.x - (a.x + b.x) / 2) < 1e-9, `u${k}:${i} is centred over its parents`);
    }
  }
  ok(upX(0, 0) === 2 && upX(0, 1) === 6, 'the two parents sit at 2 and 6 on the 8 wide grid');
  ok(lay.hiddenKids === 0, 'no young hidden');
  noOverlap(lay, 'full');
  linksValid(lay, 'full');
  // mother (first of a pair) is left of father
  const m = lay.nodes.find((n) => n.key === 'u0:0')!;
  const f = lay.nodes.find((n) => n.key === 'u0:1')!;
  ok(m.x < f.x, 'mother left of father');
  ok(lay.links.filter((l) => l.to === 'self').length === 2, 'two links into the animal from its parents');
}

// ---- children are centred under the animal, grandchildren under their parent ------------------------------------
{
  const lay = layoutPedigree(fullTree(2, 2));
  const self = lay.nodes.find((n) => n.key === lay.selfKey)!;
  const kids = lay.nodes.filter((n) => n.row === 4);
  const mean = kids.reduce((s, n) => s + n.x, 0) / kids.length;
  ok(Math.abs(mean - self.x) < 1e-9, 'the young are centred under the animal');
  for (const kid of kids) {
    const g = lay.nodes.filter((n) => n.row === 5 && lay.links.some((l) => l.from === kid.key && l.to === n.key));
    const gm = g.reduce((s, n) => s + n.x, 0) / g.length;
    ok(g.length === 2 && Math.abs(gm - kid.x) < 1e-9, 'each child is centred over its own young');
  }
  noOverlap(lay, 'young');
  linksValid(lay, 'young');
}

// ---- a founder: nothing above it, and no placeholders ------------------------------------------------------------
{
  const self = node({ gen: 0, parentA: 0, parentB: 0, born: 0 });
  const lay = layoutPedigree({ self, up: [[null, null], [null, null, null, null], Array(8).fill(null)], down: [] });
  ok(lay.nodes.length === 1 && lay.tiers === 1, 'a founder with no young is one card');
  ok(lay.width === 1, `its chart is one slot wide (got ${lay.width})`);
  ok(lay.links.length === 0, 'no links');
}

// ---- unknown ancestors become soft placeholders, and their own ancestors stay off the chart ---------------------------
{
  const mum = node({ parentA: 5, parentB: 6 });
  const self = node({ parentA: mum.id, parentB: 0 }); // the sire is not known
  const lay = layoutPedigree({ self, up: [[mum, null], [null, null, null, null], Array(8).fill(null)], down: [] });
  const ph = lay.nodes.filter((n) => !n.node);
  // the sire (parentB 0) is a placeholder; the mother's own parents (ids 5 and 6) are recorded ids with no record: placeholders too
  ok(ph.length === 3, `three placeholders (sire, and the mother's two missing parents), got ${ph.length}`);
  ok(ph.some((n) => n.hole === 'sire' && n.role === 'Father'), 'the unknown sire is flagged "sire"');
  ok(ph.filter((n) => n.hole === 'lost').length === 2, 'the missing records are flagged "lost"');
  ok(lay.nodes.every((n) => n.node || n.row >= 1), 'placeholders only ever hang off a drawn animal');
  ok(lay.nodes.filter((n) => n.row === 0).length === 0, 'nothing is drawn above an unknown grandparent');
  noOverlap(lay, 'holes');
  linksValid(lay, 'holes');
}
{
  // the parent ids are recorded but the records are gone: two placeholders, nothing above them
  const self = node({ parentA: 77, parentB: 88 });
  const lay = layoutPedigree({ self, up: [[null, null], [null, null, null, null], Array(8).fill(null)], down: [] });
  ok(lay.nodes.length === 3, 'self and two placeholders');
  ok(lay.tiers === 2, 'two rows');
}

// ---- a birth recorded with the mother in both seats (ravens): the father seat is an unknown sire, not a copy of the mother ----
{
  const gm = node({ parentA: 91, parentB: 91, alive: false, died: 400, cause: 2 });
  const mum = node({ parentA: gm.id, parentB: gm.id, alive: false, died: 600, cause: 2 });
  const self = node({ parentA: mum.id, parentB: mum.id });
  const lay = layoutPedigree({ self, up: [[mum, mum], [gm, gm, null, null], Array(8).fill(null)], down: [] });
  const drawn = lay.nodes.filter((n) => n.node).map((n) => n.node!.id);
  ok(new Set(drawn).size === drawn.length, `no animal is drawn twice (${drawn.join(',')})`);
  const sires = lay.nodes.filter((n) => n.hole === 'sire' && n.role === 'Father');
  ok(sires.length >= 2, 'the repeated father seats become unknown sires');
  ok(lay.nodes.some((n) => n.node === mum) && lay.nodes.some((n) => n.node === gm), 'the mother line is still drawn');
  noOverlap(lay, 'same parent');
  linksValid(lay, 'same parent');
}

// ---- empty rows are squeezed out and the width is trimmed (still symmetric) ---------------------------------------
{
  const t = fullTree(0, 0);
  t.up[2] = Array(8).fill(null); // no great-grandparents known
  for (const n of t.up[1]) { n!.parentA = 0; n!.parentB = 0; } // and the grandparents are founders: no placeholders either
  const lay = layoutPedigree(t);
  ok(lay.tiers === 3, `grandparents, parents, self (got ${lay.tiers})`);
  ok(lay.width === 4, `four slots wide (got ${lay.width})`);
  const tiers = [...new Set(lay.nodes.map((n) => n.tier))].sort();
  ok(tiers.join(',') === '0,1,2', 'tiers are consecutive from the top');
  const self = lay.nodes.find((n) => n.key === lay.selfKey)!;
  ok(self.x === 2, 'the animal is still in the middle');
  noOverlap(lay, 'squeezed');
}

// ---- more young than fit: capped at the slot budget, the rest counted -------------------------------------------------
{
  const t = fullTree(12, 0);
  // make three of them dead so the preference for the living is visible
  for (let i = 0; i < 3; i++) t.down[i].node.alive = false;
  const lay = layoutPedigree(t);
  const kids = lay.nodes.filter((n) => n.row === 4);
  ok(kids.length === MAX_SLOTS, `${MAX_SLOTS} young drawn (got ${kids.length})`);
  ok(lay.hiddenKids === 4, `four young not drawn (got ${lay.hiddenKids})`);
  ok(kids.filter((n) => n.node!.alive).length === MAX_SLOTS, 'the living are drawn before the dead');
  const xs = kids.map((n) => n.x).sort((a, b) => a - b);
  ok(xs.every((x, i) => i === 0 || x > xs[i - 1]), 'the young are in birth order left to right');
  noOverlap(lay, 'many young');
}
{
  // grandchildren cap per child, with the rest counted on the child
  const lay = layoutPedigree(fullTree(3, 5));
  const g = lay.nodes.filter((n) => n.row === 5);
  ok(g.length === 6, `two grandchildren per child drawn (got ${g.length})`);
  const kids = lay.nodes.filter((n) => n.row === 4);
  ok(kids.every((k) => k.hiddenKids === 3), 'three more under each child are counted');
  noOverlap(lay, 'many grandchildren');
}
{
  // a tree that has more young than were ever recorded (the sim keeps the count) reports the difference
  const t = fullTree(2, 0);
  t.self.children = 5;
  ok(layoutPedigree(t).hiddenKids === 3, 'young the record does not hold are counted as hidden');
}

// ---- the dynasty timeline ----------------------------------------------------------------------------------------
{
  const y = (n: number): number => yearStartTick(n);
  const list: DynastyEntry[] = [
    { tick: y(2), f: 10, m: 11 },
    { tick: y(5), f: 10, m: 12 }, // the male changes, the female stays
    { tick: y(9), f: 0, m: 12 }, // the female seat falls empty
    { tick: y(11), f: 13, m: 14 },
  ];
  const lay = layoutDynasty(list, y(15));
  ok(lay.f.length === 3, `female lane has three bars (got ${lay.f.length})`);
  ok(lay.m.length === 3, `male lane has three bars (got ${lay.m.length})`);
  ok(lay.f[0].id === 10 && lay.f[0].from === y(2) && lay.f[0].to === y(9), 'alpha 10 holds the seat from year 2 to year 9 (merged across the male change)');
  ok(lay.f[1].vacant && lay.f[1].id === 0, 'the empty seat is a vacant bar');
  ok(lay.f[2].to === y(15), 'the last bar runs to now');
  ok(lay.f[0].x0 === 0 && Math.abs(lay.f[2].x1 - 1) < 1e-9, 'the lanes span the whole axis');
  for (const l of [lay.f, lay.m]) for (let i = 1; i < l.length; i++) ok(Math.abs(l[i].x0 - l[i - 1].x1) < 1e-9, 'bars are contiguous');
  ok(lay.changes === 4, `four changes of the guard (got ${lay.changes})`);
  ok(lay.ticks.length > 0 && lay.ticks.every((k) => k.x > 0 && k.x < 1), 'year ticks sit inside the axis');
  ok(lay.t0 === y(2) && lay.t1 === y(15), 'the axis is first entry to now');
}
{
  const lay = layoutDynasty([], 5000);
  ok(lay.f.length === 0 && lay.m.length === 0 && lay.ticks.length === 0, 'an empty dynasty lays out nothing');
  const one = layoutDynasty([{ tick: 100, f: 3, m: 4 }], 100);
  ok(one.f.length === 1 && one.t1 > one.t0, 'a pair recorded at the very moment of "now" still gets a bar');
  const sameTick = layoutDynasty([{ tick: 100, f: 3, m: 4 }, { tick: 100, f: 5, m: 4 }], 400);
  ok(sameTick.f.length === 1 && sameTick.f[0].id === 5, 'two changes in one tick leave only the later alpha');
}

// ---- words -----------------------------------------------------------------------------------------------------------
{
  const b = node({ sp: 1, id: 1042 });
  ok(nodeName(b) === 'Wolf #1042', `name is "Wolf #1042" (got ${nodeName(b)})`);
  ok(/^Year \d+ to now$/.test(lifeText(node({ born: YEAR_TICKS * 3 }))), 'a living animal reads "Year N to now"');
  const dead = lifeText(node({ born: YEAR_TICKS * 3, died: YEAR_TICKS * 6, alive: false }));
  ok(/^Year \d+ to \d+$/.test(dead), `a dead animal reads "Year N to M" (got ${dead})`);
  const brief = lifeText(node({ born: YEAR_TICKS * 3, died: YEAR_TICKS * 3 + 10, alive: false }));
  ok(/^Year \d+$/.test(brief), `a brief life reads "Year N" (got ${brief})`);
  ok(/^The start/.test(lifeText(node({ gen: 0, born: 0 }))), 'a founder starts at "The start"');
  ok(causeText(node({ alive: false, died: 10, cause: 2 })) === 'Died of old age', 'cause words come from the story');
  ok(causeText(node({ alive: false, died: 10, cause: 0 })) === 'Starved', 'starved');
  const chips = traitChips(0, { speed: 1.12, size: 0.9, coat: 0.95 });
  ok(chips[0] === 'speed +12%' && chips[1] === 'size -10%', `speed and size are percent against the founders (got ${chips.join(' | ')})`);
  ok(chips[2] === 'coat darker', `coat reads against the species' base (got ${chips[2]})`);
  ok(traitChips(0, {}).length === 0, 'no genes, no chips');
  const all = [...chips, nodeName(b), lifeText(b), causeText(node({ alive: false, died: 5, cause: 3 }))].join(' ');
  ok(!/—|&mdash;/.test(all), 'no em dashes in the words');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`familytree: ${checks} checks ok`);
