// The field guide: one page per species, each with a few behaviours to witness and a short note on its ecology. A behaviour
// counts when the camera's focus point is within 60 m of an animal of that species doing it (checked on a throttled
// interval from the latest snapshot). Photographs go to IndexedDB, and work with no storage at all.
//
// The pages come from the species registry (src/sim/species.ts): GUIDE holds the hand-written ones keyed by species key,
// and any other agent species gets a page from its guild's default behaviours, so later species slot in on their own.
import { SPECIES, type SpeciesDef } from '../sim/species';
import { St } from '../sim/types';
import { readJson, writeJson } from './store';

/** How close the camera's focus must be to an animal for the behaviour to count (metres). */
export const WITNESS_RADIUS = 60;

export interface Behaviour {
  id: string;
  /** What the player sees, written as a moment: "Watch a wolf stalk its prey". */
  label: string;
  /** Agent states (St.*) that count. */
  states: number[];
  /** At least this many animals in those states within the radius (default 1). */
  min?: number;
}

export interface GuideEntry {
  /** Two or three plain sentences of ecology. */
  note: string;
  behaviours: Behaviour[];
}

/** The hand-written pages, keyed by registry species key. */
export const GUIDE: Record<string, GuideEntry> = {
  bison: {
    note:
      'Bison are the prairie\'s great grazers. Their grazing and trampling keep the grass a patchwork of heights, which suits birds and insects as much as the herd. A herd moves on when the grass thins, and wolves test it for the old, the young and the sick.',
    behaviours: [
      { id: 'graze', label: 'Watch a bison graze', states: [St.Graze] },
      { id: 'rest', label: 'See a bison lie down to rest', states: [St.Rest] },
      { id: 'drink', label: 'Catch a bison drinking at the water', states: [St.Drink] },
      { id: 'herd', label: 'A herd on the move, ten or more walking together', states: [St.Walk], min: 10 },
      { id: 'flee', label: 'A bison running from a wolf', states: [St.Flee] },
    ],
  },
  wolf: {
    note:
      'Wolves hunt in packs built around a breeding pair and hold a territory around a den. Most chases fail, and a pack is far likelier to bring down a calf or an old animal than a healthy adult. Their kills feed ravens and many others for days, and the fear of them changes where herds graze.',
    behaviours: [
      { id: 'stalk', label: 'Watch a wolf stalk its prey', states: [St.Stalk] },
      { id: 'chase', label: 'A wolf in full chase', states: [St.Chase] },
      { id: 'eat', label: 'A wolf feeding at a kill', states: [St.Eat] },
      { id: 'drink', label: 'A wolf drinking at the creek', states: [St.Drink] },
      { id: 'rest', label: 'A wolf resting', states: [St.Rest] },
      { id: 'patrol', label: 'Two wolves trotting together', states: [St.Walk], min: 2 },
    ],
  },
  raven: {
    note:
      'Ravens are among the cleverest birds on the plains. They are known to follow wolves to a kill and wait at a safe distance to feed. Pairs hold nesting sites through the year, and winter flocks gather wherever food is.',
    behaviours: [
      { id: 'fly', label: 'A raven in flight', states: [St.Fly] },
      { id: 'flock', label: 'A flock of six or more ravens in the air', states: [St.Fly], min: 6 },
      { id: 'forage', label: 'A raven foraging on the ground', states: [St.Graze] },
      { id: 'feed', label: 'A raven feeding at a carcass', states: [St.Eat] },
      { id: 'gather', label: 'Three or more ravens at one carcass', states: [St.Eat], min: 3 },
    ],
  },
  pronghorn: {
    note:
      'Pronghorn are the fastest land animals in North America: about 55 miles an hour in a burst, and 30 for miles on end. That speed is likely a relic of ancient hunters such as the American cheetah. They keep to open ground where they can see trouble coming, and gather in larger bands in winter.',
    behaviours: [
      { id: 'graze', label: 'Watch a pronghorn graze', states: [St.Graze] },
      { id: 'flee', label: 'Pronghorn at full speed', states: [St.Flee] },
      { id: 'drink', label: 'A pronghorn drinking', states: [St.Drink] },
      { id: 'rest', label: 'A pronghorn lying down', states: [St.Rest] },
      { id: 'band', label: 'A band of eight or more together', states: [St.Graze, St.Walk, St.Rest], min: 8 },
    ],
  },
  cougar: {
    note:
      'Cougars are ambush hunters. They wait along creeks, groves and broken ground and spring from a few metres, rather than running prey down over distance. A cougar takes a deer-sized animal every week or two, and may cover the kill with brush to come back to it.',
    behaviours: [
      { id: 'stalk', label: 'A cougar lying in wait', states: [St.Stalk] },
      { id: 'chase', label: 'The sprint after an ambush', states: [St.Chase] },
      { id: 'eat', label: 'A cougar feeding at a kill', states: [St.Eat] },
      { id: 'rest', label: 'A cougar resting in cover', states: [St.Rest] },
      { id: 'drink', label: 'A cougar drinking', states: [St.Drink] },
    ],
  },
};

/** What a registry species gets when nobody has written its page yet: behaviours its guild can show. */
const GUILD_DEFAULT: Record<SpeciesDef['guild'], Behaviour[]> = {
  grazer: [
    { id: 'graze', label: 'Watch one graze', states: [St.Graze] },
    { id: 'rest', label: 'See one lie down to rest', states: [St.Rest] },
    { id: 'drink', label: 'Catch one drinking', states: [St.Drink] },
    { id: 'flee', label: 'One running from danger', states: [St.Flee] },
  ],
  browser: [
    { id: 'graze', label: 'Watch one feed', states: [St.Graze] },
    { id: 'rest', label: 'See one lie down to rest', states: [St.Rest] },
    { id: 'drink', label: 'Catch one drinking', states: [St.Drink] },
    { id: 'flee', label: 'One running from danger', states: [St.Flee] },
  ],
  predator: [
    { id: 'stalk', label: 'Watch one stalk its prey', states: [St.Stalk] },
    { id: 'chase', label: 'One in full chase', states: [St.Chase] },
    { id: 'eat', label: 'One feeding at a kill', states: [St.Eat] },
    { id: 'rest', label: 'One resting', states: [St.Rest] },
  ],
  mesopredator: [
    { id: 'stalk', label: 'Watch one stalk its prey', states: [St.Stalk] },
    { id: 'chase', label: 'One in full chase', states: [St.Chase] },
    { id: 'eat', label: 'One feeding', states: [St.Eat] },
    { id: 'rest', label: 'One resting', states: [St.Rest] },
  ],
  scavenger: [
    { id: 'fly', label: 'One in flight', states: [St.Fly] },
    { id: 'eat', label: 'One feeding at a carcass', states: [St.Eat] },
  ],
  raptor: [
    { id: 'fly', label: 'One in flight', states: [St.Fly] },
    { id: 'eat', label: 'One feeding on a kill', states: [St.Eat] },
    { id: 'stalk', label: 'One stooping on its prey', states: [St.Chase] },
  ],
  engineer: [
    { id: 'walk', label: 'One on the move', states: [St.Walk] },
    { id: 'rest', label: 'One at rest', states: [St.Rest] },
  ],
};

/** Species with no page: the rabbit has no starting population until it becomes a field species. */
const NO_PAGE = new Set(['rabbit']);

export interface GuidePage {
  sp: SpeciesDef;
  note: string;
  behaviours: Behaviour[];
}

/** One page per registry species that lives as individual animals, in registry order. */
export function guidePages(): GuidePage[] {
  const pages: GuidePage[] = [];
  for (const sp of SPECIES) {
    if (sp.repr !== 'agent' || NO_PAGE.has(sp.key)) continue;
    const g = GUIDE[sp.key];
    pages.push(g ? { sp, note: g.note, behaviours: g.behaviours } : { sp, note: 'Nobody has written this page yet. Watch what it does and make your own notes.', behaviours: GUILD_DEFAULT[sp.guild] });
  }
  return pages;
}

const keyOf = (species: string, behaviour: string): string => `${species}:${behaviour}`;

interface Saved {
  /** "wolf:stalk" -> the valley year it was first witnessed. */
  seen: Record<string, number>;
  /** "wolf:stalk" -> photographs taken of it. */
  shot: Record<string, number>;
}

export const GUIDE_KEY = 'tallgrass.fieldguide.v1';

/** What the camera is looking at, for one throttled check. Pure: takes the agent array in the snapshot's layout. */
export function scanFrame(agents: Float32Array, count: number, fx: number, fy: number, radius = WITNESS_RADIUS, inView?: (x: number, y: number) => boolean): { counts: Int32Array; inFrame: Set<number> } {
  const counts = new Int32Array(SPECIES.length * 16);
  const inFrame = new Set<number>();
  const r2 = radius * radius;
  for (let k = 0; k < count; k++) {
    const o = k * 12;
    const sp = agents[o] | 0;
    if (sp < 0 || sp >= SPECIES.length) continue;
    const dx = agents[o + 1] - fx, dy = agents[o + 2] - fy;
    if (dx * dx + dy * dy > r2) continue;
    // (near the focus is not enough: an animal behind the camera or off the edge of the picture was never seen)
    if (inView && !inView(agents[o + 1], agents[o + 2])) continue;
    inFrame.add(sp);
    const st = agents[o + 7] | 0;
    if (st >= 0 && st < 16) counts[sp * 16 + st]++;
  }
  return { counts, inFrame };
}

export class FieldGuide {
  readonly pages = guidePages();
  private saved: Saved;
  /** "species:behaviour" keys satisfied at the last check (a photograph is tagged with these). */
  matches = new Set<string>();
  /** Species with an animal within the radius at the last check. */
  inFrame = new Set<number>();
  /** The valley year now, kept up to date by the game. */
  yearNow = 1;
  onWitness: (page: GuidePage, b: Behaviour) => void = () => {};
  onChange: () => void = () => {};

  constructor() {
    const raw = readJson<Partial<Saved>>(GUIDE_KEY, {});
    this.saved = { seen: { ...(raw.seen ?? {}) }, shot: { ...(raw.shot ?? {}) } };
  }

  /** Check the latest snapshot against the camera focus (sim metres). Returns the behaviours newly witnessed. */
  observe(agents: Float32Array, count: number, fx: number, fy: number, quiet = false, inView?: (x: number, y: number) => boolean): Behaviour[] {
    const { counts, inFrame } = scanFrame(agents, count, fx, fy, WITNESS_RADIUS, inView);
    this.inFrame = inFrame;
    this.matches = new Set();
    const fresh: Behaviour[] = [];
    for (const page of this.pages) {
      for (const b of page.behaviours) {
        let n = 0;
        for (const s of b.states) n += counts[page.sp.id * 16 + s];
        if (n < (b.min ?? 1)) continue;
        const k = keyOf(page.sp.key, b.id);
        this.matches.add(k);
        if (this.saved.seen[k] === undefined) {
          this.saved.seen[k] = this.yearNow;
          fresh.push(b);
          if (!quiet) this.onWitness(page, b);
        }
      }
    }
    if (fresh.length) {
      this.persist();
      this.onChange();
    }
    return fresh;
  }

  seen(speciesKey: string, behaviourId: string): boolean {
    return this.saved.seen[keyOf(speciesKey, behaviourId)] !== undefined;
  }

  seenYear(speciesKey: string, behaviourId: string): number | undefined {
    return this.saved.seen[keyOf(speciesKey, behaviourId)];
  }

  photographed(speciesKey: string, behaviourId: string): number {
    return this.saved.shot[keyOf(speciesKey, behaviourId)] ?? 0;
  }

  /** Behaviours witnessed and in the book for one species page. */
  progress(page: GuidePage): { seen: number; total: number } {
    let seen = 0;
    for (const b of page.behaviours) if (this.seen(page.sp.key, b.id)) seen++;
    return { seen, total: page.behaviours.length };
  }

  total(): { seen: number; total: number } {
    let seen = 0, total = 0;
    for (const p of this.pages) {
      const g = this.progress(p);
      seen += g.seen;
      total += g.total;
    }
    return { seen, total };
  }

  /** The tags a photograph taken right now carries: species in frame and behaviours being shown. */
  tagsNow(): { species: number[]; behaviours: string[] } {
    return { species: [...this.inFrame], behaviours: [...this.matches] };
  }

  /** A photograph was taken showing these behaviours: they count as photographed (and as witnessed). */
  notePhotograph(behaviours: string[]): void {
    for (const k of behaviours) this.saved.shot[k] = (this.saved.shot[k] ?? 0) + 1;
    this.persist();
    this.onChange();
  }

  clear(): void {
    this.saved = { seen: {}, shot: {} };
    this.persist();
    this.onChange();
  }

  private persist(): void {
    writeJson(GUIDE_KEY, this.saved);
  }
}

// ---- photographs ----------------------------------------------------------------------------------------------------

export interface PhotoMeta {
  id: number;
  at: number;
  seed: string;
  year: number;
  species: number[];
  behaviours: string[];
}
export interface Photo extends PhotoMeta {
  blob: Blob;
}

const DB_NAME = 'tallgrass';
const STORE = 'photos';
/** Older photographs are dropped past this many, so the book never grows without bound. */
export const MAX_PHOTOS = 48;

/** Photographs in IndexedDB. Every call resolves (never rejects): with no storage `available` is false and lists are empty. */
export class PhotoStore {
  private db: Promise<IDBDatabase | null> | null = null;
  available = true;

  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          this.available = false;
          resolve(null);
        };
        req.onblocked = () => {
          this.available = false;
          resolve(null);
        };
      } catch {
        this.available = false;
        resolve(null);
      }
    });
    return this.db;
  }

  /** Save a photograph. Resolves with its id, or null when nothing could be stored. */
  async add(blob: Blob, meta: Omit<PhotoMeta, 'id'>): Promise<number | null> {
    const db = await this.open();
    if (!db) return null;
    try {
      const id = await new Promise<number | null>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).add({ ...meta, blob });
        req.onsuccess = () => resolve(Number(req.result));
        req.onerror = () => resolve(null);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      });
      if (id !== null) void this.trim(db);
      return id;
    } catch {
      return null;
    }
  }

  /** All photographs, newest first. */
  async list(): Promise<Photo[]> {
    const db = await this.open();
    if (!db) return [];
    try {
      return await new Promise<Photo[]>((resolve) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as Photo[]).sort((a, b) => b.at - a.at));
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async remove(id: number): Promise<void> {
    const db = await this.open();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      /* nothing to do */
    }
  }

  async clear(): Promise<void> {
    const db = await this.open();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      /* nothing to do */
    }
  }

  private async trim(db: IDBDatabase): Promise<void> {
    const all = await this.list();
    for (const p of all.slice(MAX_PHOTOS)) await this.remove(p.id);
    void db;
  }
}
