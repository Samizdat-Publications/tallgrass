// Unit tests for the field notes detectors and the notebook's storage. Run: npx tsx src/ui/fieldnotes.test.ts
import { Weather, YEAR_TICKS } from '../sim/types';
import type { EnvState } from '../sim/types';
import type { SimEvent, SimEventKind } from '../sim/sim';
import type { AnimalDetail } from '../sim/worker';
import { FieldNotes, NOTES, NOTE_COUNT, NoteTracker } from './fieldnotes';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// a fake window.localStorage, so persistence can be tested under Node
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

const env = (over: Partial<EnvState> = {}): EnvState => ({
  tick: 0, year: 0, season: 1, dayFrac: 0.5, weather: Weather.Clear, rain: 0, windDir: 0, windStrength: 0.4, warmth: 0.7, ...over,
});
const ev = (kind: SimEventKind, over: Partial<SimEvent> = {}): SimEvent => ({ tick: 1000, kind, sp: -1, x: 10, y: 10, a: 0, b: 0, ...over });
const frame = (over: Partial<Parameters<NoteTracker['update']>[0]> = {}): Parameters<NoteTracker['update']>[0] => ({
  tick: 1000, env: env(), pop: [600, 40, 80, 200, 0, 0], events: [], selected: null, following: null, speed: 1, ...over,
});
const ctx = { memorial: false, challengeWon: false };
const wolf = (state: number): AnimalDetail => ({ id: 7, sp: 1, state } as unknown as AnimalDetail);

// ---- the list itself
ok(NOTE_COUNT === 18 && new Set(NOTES.map((n) => n.id)).size === 18, 'eighteen distinct notes');
ok(NOTES.every((n) => n.title.length > 3 && n.hint.length > 10), 'each note has a title and a hint');

// ---- detectors, one at a time, on a fresh notebook each time
function run(setup: (t: NoteTracker, n: FieldNotes) => void): FieldNotes {
  g.window = { localStorage: fakeStorage() };
  const n = new FieldNotes();
  setup(new NoteTracker(n), n);
  return n;
}
const earnedBy = (events: SimEvent[], f: Partial<Parameters<NoteTracker['update']>[0]> = {}, c = ctx): string[] => {
  const n = run((t) => t.update(frame({ events, ...f }), c));
  return NOTES.filter((x) => n.has(x.id)).map((x) => x.id);
};
ok(earnedBy([ev('firstKill')]).join() === 'firstKill', 'firstKill');
ok(earnedBy([ev('stampede', { a: 99 })]).length === 0, 'a stampede of 99 is not a hundred');
ok(earnedBy([ev('stampede', { a: 100 })]).join() === 'stampede100', 'a stampede of 100');
ok(earnedBy([ev('packFounded', { a: 3 })]).join() === 'packFounded', 'packFounded');
ok(earnedBy([ev('packLost', { a: 3, b: 5000 })]).join() === 'packLost', 'packLost after a real life');
ok(earnedBy([ev('packFounded', { a: 4 }), ev('packLost', { a: 4, b: 100 })]).length === 0, 'a pack founded and lost in a blink earns nothing');
ok(earnedBy([ev('drought')]).join() === 'drought' && earnedBy([ev('droughtEnd')]).join() === 'droughtBreaks', 'drought and its end');
ok(earnedBy([ev('outbreak')]).join() === 'outbreak', 'outbreak');
ok(earnedBy([ev('fire')]).join() === 'fire', 'fire');
ok(earnedBy([ev('elder', { sp: 0 })]).join() === 'elder', 'elder');
ok(earnedBy([ev('introduced', { sp: 1, a: 6 })]).join() === 'wolvesReturn', 'wolves introduced');
ok(earnedBy([ev('introduced', { sp: 0, a: 40 })]).length === 0, 'bison introduced earns nothing');

// ---- greenUp: a valley year after the first fire
{
  g.window = { localStorage: fakeStorage() };
  const n = new FieldNotes();
  const t = new NoteTracker(n);
  t.update(frame({ tick: 5000, events: [ev('fire', { tick: 5000 })] }), ctx);
  t.update(frame({ tick: 5000 + YEAR_TICKS - 1 }), ctx);
  ok(!n.has('greenUp'), 'not yet a year after the fire');
  t.update(frame({ tick: 5000 + YEAR_TICKS }), ctx);
  ok(n.has('greenUp'), 'greenUp a valley year after the fire');
  // a new world forgets the pending fire
  const n2 = new FieldNotes();
  n2.clear();
  const t2 = new NoteTracker(n2);
  t2.update(frame({ tick: 100, events: [ev('fire', { tick: 100 })] }), ctx);
  t2.reset();
  t2.update(frame({ tick: 100 + 2 * YEAR_TICKS }), ctx);
  ok(!n2.has('greenUp'), 'a reset world does not owe the green-up');
}

// ---- following a hunt, the life story, a century, snow, a challenge
ok(earnedBy([], { selected: wolf(5), following: 7 }).join() === 'followHunt', 'following a chasing wolf');
ok(earnedBy([], { selected: wolf(5), following: null }).length === 0, 'selecting (not following) a chasing wolf is not riding along');
ok(earnedBy([], { selected: wolf(1), following: 7 }).length === 0, 'following a grazing wolf is not a hunt');
ok(earnedBy([], {}, { memorial: true, challengeWon: false }).join() === 'lifeStory', 'an In memoriam card');
ok(earnedBy([], { env: env({ year: 98 }) }).length === 0 && earnedBy([], { env: env({ year: 99 }) }).join() === 'century', 'year 100');
ok(earnedBy([], { env: env({ weather: Weather.Snow }), speed: 1 }).join() === 'winter', 'snow at 1x');
ok(earnedBy([], { env: env({ weather: Weather.Snow }), speed: 10 }).join() === 'winter', 'snow at 10x');
ok(earnedBy([], { env: env({ weather: Weather.Snow }), speed: 100 }).length === 0, 'snow at 100x does not count');
ok(earnedBy([], {}, { memorial: false, challengeWon: true }).join() === 'challenge', 'a challenge won');

// ---- pulled back from the brink
{
  g.window = { localStorage: fakeStorage() };
  const n = new FieldNotes();
  const t = new NoteTracker(n);
  const at = (bison: number) => t.update(frame({ pop: [bison, 40, 80, 200, 0, 0] }), ctx);
  at(600);
  at(15);
  ok(!n.has('extinctionAverted'), 'below twenty is not yet a recovery');
  at(90);
  ok(!n.has('extinctionAverted'), 'ninety is not above a hundred');
  at(120);
  ok(n.has('extinctionAverted'), 'below twenty, then above a hundred');
  // a species that merely started small does not count
  g.window = { localStorage: fakeStorage() };
  const n2 = new FieldNotes();
  const t2 = new NoteTracker(n2);
  t2.update(frame({ pop: [600, 40, 80, 200, 0, 6] }), ctx);
  t2.update(frame({ pop: [600, 40, 80, 200, 0, 140] }), ctx);
  ok(!n2.has('extinctionAverted'), 'cougars that started at six and grew do not count');
}

// ---- the notebook: first time only, years, persistence, clearing, and a missing storage
{
  g.window = { localStorage: fakeStorage() };
  const store = g.window.localStorage as Storage;
  const n = new FieldNotes();
  let earns = 0;
  n.onEarn = () => earns++;
  ok(n.earn('fire', 12) && !n.earn('fire', 13), 'a note is earned once');
  ok(earns === 1 && n.count === 1 && n.get('fire')?.year === 12, 'the year it was earned in is kept');
  ok(!n.earn('no_such_note', 3), 'an unknown id is ignored');
  ok(store.getItem('tallgrass.fieldnotes.v1')?.includes('"fire"') === true, 'it is saved');
  const again = new FieldNotes();
  ok(again.has('fire') && again.get('fire')?.year === 12, 'it is remembered by the next visit');
  again.clear();
  ok(again.count === 0 && !new FieldNotes().has('fire'), 'clearing empties the notebook and its storage');
  store.setItem('tallgrass.fieldnotes.v1', '{ not json');
  ok(new FieldNotes().count === 0, 'a damaged value is ignored');
  // no storage at all: it still works for the page's lifetime
  g.window = {};
  const bare = new FieldNotes();
  ok(bare.earn('elder', 5) && bare.has('elder'), 'works without storage');
  g.window = { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage };
  const denied = new FieldNotes();
  ok(denied.earn('outbreak', 2) && denied.count === 1, 'works when storage throws');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`field notes: all ${checks} checks passed`);
