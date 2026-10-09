// Unit tests for Rare sightings: the patience rules, the detectors, the staged sky's schedule, the store and the controller.
// Run: npx tsx src/ui/rare.test.ts
import { AGENT_STRIDE, DAY_TICKS, Sp, St, Weather, YEAR_TICKS } from '../sim/types';
import type { EnvState } from '../sim/types';
import type { SimEvent, SimEventKind } from '../sim/sim';
import {
  BAND_MIN, COMET_TICKS, IDLE_SECONDS, MOB_MIN, RAVENS_MIN, RareSightings, RareStore, SIGHTINGS, SIGHTING_COUNT, STAGE_COOLDOWN_MS, TIER_SECONDS,
  TreeIndex, cometState, cometWindow, deepNight, fmtDuration, framedAim, isPackRecord, patienceCounts, rareMode, scanAgents, scanEvents, seasonName,
  skyToWorld, stormWindow, tierUnlocked, windowStrength, type Hit, type RareFrame, type RareHooks, type RareSkyState, type Tier,
} from './rare';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}
const g = globalThis as unknown as { window?: { localStorage?: Storage } };
g.window = { localStorage: fakeStorage() };

const env = (over: Partial<EnvState> = {}): EnvState => ({
  tick: 0, year: 3, season: 1, dayFrac: 0.5, weather: Weather.Clear, rain: 0, windDir: 0, windStrength: 0.4, warmth: 0.7, ...over,
});
const ev = (kind: SimEventKind, over: Partial<SimEvent> = {}): SimEvent => ({ tick: 1000, kind, sp: -1, x: 100, y: 100, a: 0, b: 0, ...over });

// ---- the list
ok(SIGHTING_COUNT === 13 && new Set(SIGHTINGS.map((s) => s.id)).size === 13, 'thirteen distinct sightings');
const perTier = (t: Tier): number => SIGHTINGS.filter((s) => s.tier === t).length;
ok(perTier(1) === 4 && perTier(2) === 4 && perTier(3) === 3 && perTier(4) === 2, 'four, four, three and two sightings by tier');
ok(SIGHTINGS.every((s) => s.title.length > 4 && s.cue.length > 10 && s.line().length > 30), 'each sighting has a title, a cue and a line');
ok(SIGHTINGS.every((s) => !new RegExp(String.fromCharCode(0x2014)).test(s.title + s.cue + s.line('wet') + s.line('megadrought'))), 'no em dashes in the words');
ok(SIGHTINGS.find((s) => s.id === 'climateTurn')!.line('wet') !== SIGHTINGS.find((s) => s.id === 'climateTurn')!.line('megadrought'), 'the climate line differs by kind');
ok(TIER_SECONDS[1] === 600 && TIER_SECONDS[2] === 3600 && TIER_SECONDS[3] === 14400 && TIER_SECONDS[4] === 43200, 'tiers: 10 minutes, 1 hour, 4 hours, 12 hours');

// ---- patience
const base = { visible: true, speed: 1, idleSec: 60, filming: false };
ok(patienceCounts(base), 'visible, 1x, idle for a minute: counts');
ok(!patienceCounts({ ...base, visible: false }), 'a hidden tab does not count');
ok(!patienceCounts({ ...base, speed: 0 }), 'paused does not count');
ok(!patienceCounts({ ...base, speed: 10 }) && !patienceCounts({ ...base, speed: 100 }), '10x and 100x do not count');
ok(!patienceCounts({ ...base, idleSec: IDLE_SECONDS - 1 }), 'touched 29 s ago: does not count');
ok(patienceCounts({ ...base, idleSec: IDLE_SECONDS }), 'untouched for 30 s: counts');
ok(patienceCounts({ ...base, idleSec: 0, filming: true }), 'the documentary camera has the shot: counts without idling');
ok(!patienceCounts({ ...base, idleSec: 0, filming: true, speed: 10 }), 'the documentary camera at 10x still does not count');
ok(!tierUnlocked(599, 1) && tierUnlocked(600, 1) && !tierUnlocked(3599, 2) && tierUnlocked(3600, 2), 'tier thresholds are exact');
ok(!tierUnlocked(14399, 3) && tierUnlocked(14400, 3) && !tierUnlocked(43199, 4) && tierUnlocked(43200, 4), 'tier 3 and 4 thresholds are exact');
ok(fmtDuration(0) === 'no time at all' && fmtDuration(30) === 'under a minute' && fmtDuration(540) === '9 min' && fmtDuration(4800) === '1 h 20 min' && fmtDuration(43200) === '12 h', 'durations read well');
ok(seasonName(0.2) === 'spring' && seasonName(1.5) === 'summer' && seasonName(2.99) === 'autumn' && seasonName(3.4) === 'winter' && seasonName(4.1) === 'spring', 'season names');
ok(rareMode('?rare=all') === 'all' && rareMode('?rare=reset') === 'reset' && rareMode('?x=1') === null && rareMode('') === null, 'the debug modes');

// ---- trees
const trees = new TreeIndex(new Float32Array([100, 100, 8, 3, 104, 100, 8, 3, 300, 300, 8, 3]), 4);
ok(trees.size === 3 && trees.anyWithin(101, 100, 5) && !trees.anyWithin(200, 200, 50) && trees.countWithin(102, 100, 10) === 2, 'tree index: any, count');
const dyn = new TreeIndex(new Float32Array([10, 10, 5, 2, 0, 3, 50, 50, 5, 2, 0, 5]), 6, 5);
ok(dyn.size === 1 && dyn.anyWithin(10, 10, 3) && !dyn.anyWithin(50, 50, 3), 'trees marked gone (stage 5) are left out');
ok(new TreeIndex(new Float32Array(0), 4).size === 0, 'an empty tree list');

// ---- event detectors
const fire = (x: number, y: number, tick = 1000): SimEvent => ev('lightningFire', { x, y, tick });
ok(scanEvents([ev('stampede', { a: 199, sp: Sp.Bison })], 1000, null).length === 0, 'a stampede of 199 is not a sighting');
ok(scanEvents([ev('stampede', { a: 200, sp: Sp.Bison })], 1000, null)[0]?.id === 'stampede200', 'a stampede of 200 is');
ok(scanEvents([ev('elder', { sp: Sp.Bison })], 1000, null)[0]?.id === 'elder', 'the elder event');
ok(scanEvents([ev('immigrated', { sp: Sp.Wolf })], 1000, null)[0]?.id === 'wolfWalkIn', 'a wolf immigrates');
ok(scanEvents([ev('immigrated', { sp: Sp.Deer }), ev('immigrated', { sp: Sp.Cougar })], 1000, null).length === 0, 'other immigrants are not the wolf sighting');
ok(scanEvents([fire(100.5, 100)], 1000, trees)[0]?.id === 'lightningTree', 'lightning beside a lone tree');
ok(scanEvents([fire(200, 200)], 1000, trees).length === 0, 'lightning on bare grass is not');
ok(scanEvents([fire(100.5, 100)], 1000, null).length === 0, 'no tree list: no lightning sighting');
const grove: number[] = [];
for (let i = 0; i < 12; i++) grove.push(500 + i * 2, 500, 8, 3);
ok(scanEvents([fire(500, 500)], 1000, new TreeIndex(new Float32Array(grove), 4)).length === 0, 'lightning in a grove does not strike a lone tree');
ok(scanEvents([ev('megadrought')], 1000, null)[0]?.variant === 'megadrought', 'megadrought');
ok(scanEvents([ev('climateWet')], 1000, null)[0]?.variant === 'wet' && scanEvents([ev('climateDry')], 1000, null)[0]?.variant === 'dry', 'wet and dry runs');
ok(scanEvents([ev('climateMild')], 1000, null).length === 0, 'a return to ordinary years is not news');
ok(scanEvents([ev('elder', { tick: 100 })], 1000, null).length === 0, 'an event from long ago (a fast run) is history');

// ---- agent detectors
interface A { sp: number; x: number; y: number; st?: number; coat?: number; alt?: number }
function pack(list: A[]): { agents: Float32Array; count: number } {
  const agents = new Float32Array(list.length * AGENT_STRIDE);
  list.forEach((a, k) => {
    const o = k * AGENT_STRIDE;
    agents[o] = a.sp; agents[o + 1] = a.x; agents[o + 2] = a.y; agents[o + 5] = 1; agents[o + 6] = a.coat ?? 0.8; agents[o + 7] = a.st ?? St.Idle; agents[o + 9] = a.alt ?? 0;
  });
  return { agents, count: list.length };
}
const none = new Float32Array(0);
function scan(list: A[], carcasses: number[] = [], tr: TreeIndex | null = trees, packs: number[] = []): ReturnType<typeof scanAgents> {
  const p = pack(list);
  return scanAgents({ ...p, carcasses: new Float32Array(carcasses), carcassCount: carcasses.length / 4, packs: packs.length ? new Float32Array(packs) : none, trees: tr });
}
const crowd = (n: number, a: Omit<A, 'x' | 'y'>, cx = 200, cy = 200, gap = 2): A[] => Array.from({ length: n }, (_, i) => ({ ...a, x: cx + (i % 5) * gap, y: cy + Math.floor(i / 5) * gap }));
const ids = (r: { hits: Hit[] }): string[] => r.hits.map((x) => x.id);

ok(ids(scan(crowd(MOB_MIN, { sp: Sp.Wolf, st: St.Walk }))).includes('wolfMob'), 'ten wolves walking together: a mob');
ok(ids(scan(crowd(MOB_MIN - 1, { sp: Sp.Wolf, st: St.Walk }))).length === 0, 'nine are not');
ok(ids(scan(crowd(MOB_MIN + 2, { sp: Sp.Wolf, st: St.Rest }))).length === 0, 'a dozen wolves asleep are not on the move');
ok(ids(scan([...crowd(6, { sp: Sp.Wolf, st: St.Walk }, 100, 100), ...crowd(6, { sp: Sp.Wolf, st: St.Walk }, 400, 400)])).length === 0, 'two groups of six far apart are not a mob');
ok(ids(scan([...crowd(5, { sp: Sp.Wolf, st: St.Run }, 200, 200), ...crowd(5, { sp: Sp.Wolf, st: St.Chase }, 230, 205)])).includes('wolfMob'), 'a mob can be split across neighbouring cells');
const mobHit = scan(crowd(MOB_MIN, { sp: Sp.Wolf, st: St.Walk })).hits[0];
ok(Math.abs(mobHit.x - 204) < 12 && Math.abs(mobHit.y - 202) < 12, 'the mob hit is at its centre');

const carcass = [300, 300, 0.8, Sp.Bison];
ok(ids(scan(crowd(RAVENS_MIN, { sp: Sp.Raven, st: St.Eat, alt: 0 }, 298, 298), carcass)).includes('ravenFeast'), 'thirty ravens on one carcass');
ok(ids(scan(crowd(RAVENS_MIN - 1, { sp: Sp.Raven, st: St.Eat, alt: 0 }, 298, 298), carcass)).length === 0, 'twenty-nine are not');
ok(ids(scan(crowd(RAVENS_MIN, { sp: Sp.Raven, st: St.Fly, alt: 12 }, 298, 298), carcass)).length === 0, 'thirty ravens circling overhead are not at the carcass');
ok(ids(scan(crowd(RAVENS_MIN, { sp: Sp.Raven, st: St.Eat, alt: 0 }, 100, 100), carcass)).length === 0, 'thirty ravens far from the carcass are not');
ok(ids(scan(crowd(RAVENS_MIN, { sp: Sp.Raven, st: St.Eat, alt: 0 }, 298, 298), [300, 300, 0, Sp.Bison])).length === 0, 'a carcass picked clean is not a feast');

ok(ids(scan([{ sp: Sp.Cougar, x: 200, y: 200, st: St.Walk }])).includes('cougarOpen'), 'a cougar 100 m from the nearest tree');
ok(ids(scan([{ sp: Sp.Cougar, x: 130, y: 100, st: St.Walk }])).length === 0, 'a cougar 26 m from a tree is not out in the open');
ok(ids(scan([{ sp: Sp.Cougar, x: 200, y: 200 }], [], null)).length === 0, 'no tree list: no cougar sighting');
ok(ids(scan([{ sp: Sp.Cougar, x: 200, y: 200 }], [], new TreeIndex(new Float32Array(0), 4))).length === 0, 'a map with no trees at all is not "open prairie"');

ok(ids(scan(crowd(BAND_MIN, { sp: Sp.Deer, st: St.Flee }, 200, 200))).includes('pronghornBand'), 'a hundred pronghorn in flight');
ok(ids(scan(crowd(BAND_MIN - 1, { sp: Sp.Deer, st: St.Flee }, 200, 200))).length === 0, 'ninety-nine are not');
ok(ids(scan(crowd(BAND_MIN + 20, { sp: Sp.Deer, st: St.Graze }, 200, 200))).length === 0, 'a grazing herd is not in flight');

const herd = (n: number, coat: number): A[] => crowd(n, { sp: Sp.Bison, coat, st: St.Graze }, 250, 250);
ok(ids(scan([...herd(30, 0.86), { sp: Sp.Bison, x: 300, y: 300, coat: 0.65 }])).includes('paleBison'), 'a pale bison in a dark herd');
ok(scan([...herd(30, 0.86), { sp: Sp.Bison, x: 300, y: 300, coat: 0.65 }]).hits.find((x) => x.id === 'paleBison')!.x === 300, 'the pale bison hit is at that bison');
ok(ids(scan(herd(40, 0.65))).length === 0, 'a whole herd that is pale has no pale one among it');
ok(ids(scan([...herd(30, 0.86), { sp: Sp.Bison, x: 300, y: 300, coat: 0.74 }])).length === 0, 'a coat of 0.74 is not far enough along');
ok(ids(scan([...herd(10, 0.86), { sp: Sp.Bison, x: 300, y: 300, coat: 0.65 }])).length === 0, 'a herd of eleven is too small to speak of a range');

ok(scan([], [], trees, [100, 100, 80, 7, 300, 300, 80, 12]).maxPack === 12, 'the largest pack is read from the pack list');
ok(isPackRecord(12, 9) && !isPackRecord(9, 9) && !isPackRecord(7, 4) && !isPackRecord(12, 0) && isPackRecord(12, 0, true), 'record size: bigger than ever seen, at least eight, with a baseline');

// ---- the staged sky is a pure function of the valley's clock
let cometTick = -1;
for (let t = 0; t < YEAR_TICKS * 60 && cometTick < 0; t += 200) if (cometWindow(7, t)) cometTick = t;
ok(cometTick >= 0, 'a comet comes within sixty valley years');
const w1 = cometWindow(7, cometTick)!;
ok(w1.end - w1.start === COMET_TICKS && JSON.stringify(cometWindow(7, cometTick)) === JSON.stringify(w1), 'the same seed and tick always give the same comet');
ok(cometWindow(7, w1.start - 1) === null || cometWindow(7, w1.start - 1)!.start !== w1.start, 'the window starts where it says');
ok(cometWindow(7, w1.end) === null || cometWindow(7, w1.end)!.start !== w1.start, 'and ends where it says');
let years = 0, withComet = 0;
for (let y = 0; y < 400; y++) { years++; if (cometWindow(11, y * YEAR_TICKS + 1200) || cometWindow(11, y * YEAR_TICKS)) withComet++; }
ok(withComet > 20 && withComet < 140, `about one valley year in eight has a comet in view (${withComet} of ${years} sampled)`);
ok(windowStrength(w1, w1.start) === 0 && windowStrength(w1, (w1.start + w1.end) / 2) === 1 && windowStrength(w1, w1.end - 1) < 0.01, 'a comet fades in, holds, fades out');
const cs = cometState(w1, w1.start + 500, 1.0);
const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
ok(Math.abs(Math.hypot(...cs.eq) - 1) < 1e-9 && Math.abs(Math.hypot(...cs.tail) - 1) < 1e-9 && Math.abs(dot(cs.eq, cs.tail)) < 1e-9, 'head and tail are unit vectors, the tail across the head');
const sunAt = (season: number): number[] => [Math.cos(season * Math.PI / 2), Math.sin(season * Math.PI / 2), 0];
ok(dot(cs.tail, sunAt(1.0)) < 0.2, 'the tail points away from the sun');
const cs2 = cometState(w1, w1.start + 500, 3.0);
ok(dot(cs.tail, cs2.tail) < 0.99, 'the tail swings round with the season');
ok(cometState(w1, w1.start + 400, 1).eq[2] > 0.7, 'the comet hangs high in the north (declination over 45 degrees)');
const ident = [1, 0, 0, 0, 1, 0, 0, 0, 1];
ok(skyToWorld(ident, [0.2, 0.3, 0.9])[1] === 0.3, 'sky to world with the identity');
const aim = framedAim([0, 1, 0.01]);
ok(Math.abs(Math.hypot(...aim) - 1) < 1e-9 && aim[1] <= Math.sin(50 * Math.PI / 180) + 1e-9, 'the photograph aims lower than a comet at the zenith');
ok(framedAim([0, 0.02, 1])[1] >= Math.sin(6 * Math.PI / 180) - 1e-9, 'and not lower than six degrees');
ok(deepNight(0.02) && deepNight(0.95) && !deepNight(0.3) && !deepNight(0.6), 'deep night');

let stormTick = -1;
for (let t = 0; t < YEAR_TICKS * 80 && stormTick < 0; t += 100) { const w = stormWindow(7, t); if (w && !cometWindow(7, w.start) && !cometWindow(7, w.start + 360) && !cometWindow(7, w.end)) stormTick = t; } // (one without a comet, which would take the three-hour gap first)
ok(stormTick >= 0, 'a storm comes within eighty valley years');
const sw = stormWindow(7, stormTick)!;
const mid = sw.start + 360; // the first midnight
ok(Math.round(((mid + Math.round(0.27 * DAY_TICKS)) % DAY_TICKS)) === 0, 'a storm is centred on a midnight');
ok(sw.end - sw.start === 360 + DAY_TICKS + 360, 'a storm runs over two midnights');
ok(windowStrength(sw, mid, 0.2) > 0.9 && windowStrength(sw, mid + DAY_TICKS, 0.2) > 0.9, 'and is at its height at both');

// ---- the store
g.window = { localStorage: fakeStorage() };
const st1 = new RareStore();
ok(st1.watched === 0 && st1.count === 0 && st1.maxPack === 0, 'a fresh store is empty');
st1.addWatched(125.5);
st1.setMaxPack(9);
st1.setLastStage(12345);
ok(st1.add({ id: 'elder', count: 1, year: 4, season: 'autumn', at: 1_700_000_000_000, text: 'An old one.', photo: false }), 'a sighting is added');
ok(!st1.add({ id: 'elder', count: 1, year: 9, season: 'spring', at: 1, text: 'again', photo: false }), 'a second add of the same sighting is refused');
ok(!st1.add({ id: 'nonsense', count: 1, year: 1, season: 'spring', at: 1, text: 'x', photo: false }), 'an unknown id is refused');
st1.bump('elder');
st1.bump('elder');
st1.flush();
const st2 = new RareStore();
ok(Math.abs(st2.watched - 125.5) < 1e-9 && st2.maxPack === 9 && st2.lastStageAt === 12345, 'the counters survive a reload');
ok(st2.get('elder')?.count === 3 && st2.get('elder')?.year === 4 && st2.get('elder')?.text === 'An old one.' && st2.count === 1, 'the sighting and its counter survive a reload');
st2.reset();
ok(new RareStore().count === 0 && new RareStore().watched === 0, '?rare=reset clears it for good');
g.window.localStorage!.setItem('tallgrass.rare.v1', '{not json');
ok(new RareStore().count === 0, 'a damaged value starts empty');
g.window.localStorage!.setItem('tallgrass.rare.v1', JSON.stringify({ v: 1, watched: 'lots', maxPack: -3, sightings: { elder: { year: 'x' }, comet: { year: 2, text: 'ok', count: 0, at: 5, season: 'winter' } } }));
const odd = new RareStore();
ok(odd.watched === 0 && odd.maxPack === 0 && !odd.has('elder') && odd.get('comet')?.count === 1, 'odd values are cleaned up, not trusted');
// storage that throws on every call: the game just forgets
g.window = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } } as unknown as Storage };
const dead = new RareStore();
dead.addWatched(10);
dead.add({ id: 'elder', count: 1, year: 1, season: 'spring', at: 1, text: 'x', photo: false });
dead.flush();
ok(dead.watched === 10 && dead.count === 1, 'with no storage the store still works for this visit');

// ---- the controller
g.window = { localStorage: fakeStorage() };
interface Rig { r: RareSightings; store: RareStore; toasts: string[]; framed: string[]; grabs: Array<[number, number, number] | null>; skies: RareSkyState[]; directorOn: boolean; view: boolean }
function rig(mode: 'all' | null = null, seed = 7): Rig {
  g.window = { localStorage: fakeStorage() };
  const store = new RareStore();
  const o: Rig = { r: null as unknown as RareSightings, store, toasts: [], framed: [], grabs: [], skies: [], directorOn: false, view: true };
  const hooks: RareHooks = {
    toast: (t) => o.toasts.push(t),
    frame: (m) => o.framed.push(m),
    directorOn: () => o.directorOn,
    inView: () => o.view,
    grab: (a) => { o.grabs.push(a); return Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' })); },
    skyRot: () => [1, 0, 0, 0, 0, 1, 0, 1, 0], // (sky frame z, the pole, is world up in this test)
    setSky: (s) => o.skies.push(s),
  };
  o.r = new RareSightings(store, hooks, seed, mode, 0);
  return o;
}
let clock = 0;
const frame = (over: Partial<RareFrame> = {}): RareFrame => ({
  nowMs: clock, dt: 0.1, visible: true, speed: 1, filming: false, tick: 5000, env: env(), events: [], agents: none, count: 0, carcasses: none, carcassCount: 0, packs: none, ...over,
});
/** Run `sec` seconds of frames at 10 per second, `over` applied to each. */
function run(o: Rig, sec: number, over: Partial<RareFrame> = {}): void {
  for (let i = 0; i < sec * 10; i++) {
    clock += 100;
    o.r.update(frame({ ...over, nowMs: clock, tick: (over.tick ?? 5000) + i }));
  }
}

// patience through the controller
let o = rig();
run(o, 20); // touched at 0, so the first 30 s do not count
ok(o.store.watched === 0, 'in the first 30 s after an input nothing is counted');
run(o, 20, {}); // now idle 40 s
ok(o.store.watched > 8 && o.store.watched < 12, `after that it counts ${o.store.watched.toFixed(1)} s of 20`);
o.r.noteInput(clock);
const before = o.store.watched;
run(o, 10);
ok(o.store.watched === before, 'an input restarts the idle clock');
run(o, 40);
const w40 = o.store.watched;
run(o, 20, { speed: 10 });
ok(o.store.watched === w40, 'at 10x it does not count');
run(o, 20, { speed: 0 });
ok(o.store.watched === w40, 'paused it does not count');
run(o, 20, { visible: false });
ok(o.store.watched === w40, 'in a hidden tab it does not count');
o.r.noteInput(clock);
run(o, 10, { filming: true });
ok(o.store.watched > w40 + 9.5, 'with the documentary camera filming it counts at once');
o.r.update(frame({ dt: 5, nowMs: clock + 100 }));
o.r.noteInput(0);
o.r.update(frame({ dt: 5, nowMs: clock + 40000 }));
ok(o.store.watched < w40 + 12.5, 'one long stall is capped at a second');

// gating: tier 1 needs ten minutes
const stampede = (): SimEvent[] => [ev('stampede', { a: 250, sp: Sp.Bison, x: 200, y: 200, tick: 5000 })];
o = rig();
run(o, 60, { events: stampede() });
ok(!o.store.has('stampede200') && o.toasts.length === 0, 'a stampede in the first minutes is not recorded');
o.store.addWatched(TIER_SECONDS[1]);
o.r.noteInput(0);
run(o, 1, { events: stampede(), speed: 10 });
ok(!o.store.has('stampede200'), 'a stampede at 10x is not recorded even after ten minutes');
run(o, 1, { events: stampede(), speed: 1 });
ok(o.store.has('stampede200') && o.toasts.length === 1 && o.toasts[0] === 'A thunder of hooves', 'after ten minutes at 1x it is recorded, with a toast');
const rec = o.store.get('stampede200')!;
ok(rec.year === 4 && rec.season === 'summer' && rec.count === 1 && rec.text.includes('two hundred') && rec.at > 0, 'the record has the valley year, the season, the date and the line');
ok(o.framed.length === 0, 'the documentary camera is not asked while it is off');
// a second sighting of the same kind only bumps the counter
run(o, 1, { events: stampede(), tick: 5000 });
ok(o.store.get('stampede200')!.count === 1, 'the same stampede again right away is the same sighting');
run(o, 1, { events: [ev('stampede', { a: 250, sp: Sp.Bison, tick: 9000 })], tick: 9000 });
ok(o.store.get('stampede200')!.count === 2 && o.toasts.length === 1, 'a later stampede bumps the counter, with no second toast');
// tier 2 is shut until an hour
run(o, 1, { events: [ev('elder', { tick: 9100 }), ev('immigrated', { sp: Sp.Wolf, tick: 9100 })], tick: 9100 });
ok(o.store.has('elder') && !o.store.has('wolfWalkIn'), 'tier 1 is open at ten minutes and tier 2 is not');
o.store.addWatched(TIER_SECONDS[2]);
run(o, 1, { events: [ev('immigrated', { sp: Sp.Wolf, tick: 9300 })], tick: 9300 });
ok(o.store.has('wolfWalkIn'), 'tier 2 opens at an hour');
// the photograph (taken in a later task, once the subject is in frame)
await new Promise((r) => setTimeout(r, 30));
ok(o.grabs.length >= 1 && o.store.get('stampede200')!.photo === true, 'a photograph is taken and kept for a new sighting');
ok(o.grabs.every((a) => a === null), 'a sighting on the ground is photographed with the camera where it is');
after();

function after(): void {
  // director: asked to frame it when it is on
  let o2 = rig();
  o2.store.addWatched(TIER_SECONDS[1]);
  o2.r.noteInput(0);
  o2.directorOn = true;
  run(o2, 1, { events: stampede() });
  ok(o2.framed.join() === 'stampede', 'with the documentary camera on, the director is asked for the stampede');
  // ?rare=all
  o2 = rig('all');
  run(o2, 1, { events: [ev('megadrought', { tick: 5000 })], speed: 100 });
  ok(o2.store.has('climateTurn') && o2.store.get('climateTurn')!.text.includes('rains failed'), '?rare=all records at 100x with nothing watched');
  ok(o2.r.unlocked(4), '?rare=all opens every tier');
  const o3 = rig();
  ok(!o3.r.unlocked(1), 'normally nothing is open at the start');
  // the scan: a mob of wolves found in the frame, then the record pack
  o3.store.addWatched(TIER_SECONDS[3]);
  o3.r.noteInput(0);
  const wolves = pack(crowd(MOB_MIN, { sp: Sp.Wolf, st: St.Walk }));
  clock += 5000;
  run(o3, 2, { agents: wolves.agents, count: wolves.count, packs: new Float32Array([100, 100, 80, 6]) });
  ok(o3.store.has('wolfMob') && o3.store.maxPack === 6 && !o3.store.has('packRecord'), 'a mob is seen; the first pack size seen is a baseline, not a record');
  run(o3, 2, { agents: wolves.agents, count: wolves.count, packs: new Float32Array([100, 100, 80, 10]), tick: 20000 });
  ok(o3.store.has('packRecord') && o3.store.maxPack === 10, 'a bigger pack than any seen, of at least eight, is a record');
  // the sky
  skyTests();
}

function skyTests(): void {
  const cw = cometWindow(7, cometTick)!;
  const tickMid = Math.floor((cw.start + cw.end) / 2);
  const night = env({ dayFrac: 0.02, season: 1, tick: tickMid });
  let o4 = rig();
  run(o4, 2, { tick: tickMid, env: night });
  ok(!o4.skies.some((s) => s.comet > 0), 'tier 4 locked: no comet is staged');
  o4.store.addWatched(TIER_SECONDS[4]);
  o4.r.noteInput(0);
  run(o4, 2, { tick: tickMid, env: night });
  ok(o4.skies.some((s) => s.comet > 0.9), 'tier 4 open: the comet is staged in its window, at night');
  ok(o4.store.lastStageAt > 0, 'the stage is stamped, for the three-hour gap');
  ok(o4.store.has('comet') && o4.toasts.includes('The long-tailed visitor'), 'the comet is recorded once it is up and the sky is dark');
  ok(o4.r.skyNow.comet > 0.9, 'the sky state is readable');
  const day = env({ dayFrac: 0.5, tick: tickMid });
  o4.skies.length = 0;
  run(o4, 1, { tick: tickMid, env: day });
  ok(o4.skies.length > 0 && o4.skies[o4.skies.length - 1].comet === 0, 'by day the comet is switched off again');
  // a second window within three hours is not staged
  o4 = rig();
  o4.store.addWatched(TIER_SECONDS[4]);
  o4.store.setLastStage(Date.now() - 1000);
  o4.r.noteInput(0);
  run(o4, 2, { tick: tickMid, env: night });
  ok(!o4.skies.some((s) => s.comet > 0), 'a comet staged under three hours ago blocks the next one');
  o4.store.setLastStage(Date.now() - STAGE_COOLDOWN_MS - 1000);
  o4.r.noteInput(0);
  run(o4, 2, { tick: tickMid + 2, env: night });
  ok(!o4.skies.some((s) => s.comet > 0), 'the window that was refused stays refused (it was decided at its start)');
  // not at 10x
  o4 = rig();
  o4.store.addWatched(TIER_SECONDS[4]);
  o4.r.noteInput(0);
  run(o4, 2, { tick: tickMid, env: night, speed: 10 });
  ok(!o4.skies.some((s) => s.comet > 0), 'a comet is not staged while time races');
  // forced, for captures
  o4 = rig('all');
  o4.r.force('comet');
  run(o4, 2, { tick: 100, env: env({ dayFrac: 0.02 }) });
  ok(o4.r.skyNow.comet === 1, 'force("comet") shows it at once');
  o4.r.force('aurora');
  run(o4, 2, { tick: 100, env: env({ dayFrac: 0.02 }) });
  ok(o4.r.skyNow.storm === 1 && o4.store.has('auroraStorm'), 'force("aurora") shows the storm and records it');
  o4.r.force(null);
  run(o4, 2, { tick: 100, env: env({ dayFrac: 0.02 }) });
  ok(o4.r.skyNow.storm === 0 && o4.r.skyNow.comet === 0, 'and force(null) puts the sky back');
  // storm in its window
  o4 = rig();
  o4.store.addWatched(TIER_SECONDS[4]);
  o4.r.noteInput(0);
  const sTick = sw.start + 360;
  run(o4, 2, { tick: sTick, env: env({ dayFrac: 0.0, season: 3.4, tick: sTick }) });
  ok(o4.skies.some((s) => s.storm > 0.9) && o4.store.has('auroraStorm'), 'a great storm in its window, at 1x, is staged and recorded');

  if (failures) {
    console.error(`${failures} of ${checks} checks failed`);
    process.exit(1);
  }
  console.log(`rare.test.ts: ${checks} checks passed`);
}
