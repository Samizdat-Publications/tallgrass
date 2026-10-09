// Rare sightings: a journal of rare, memorable moments that unlock while the valley runs patiently at 1x.
//
// Nothing here touches the simulation. Every sighting is either detected on the main thread from what the worker already sends
// (the agent snapshot, the events, the pack list) or staged by the renderer alone (the comet and the great aurora storm are a pure
// function of the valley's tick, so a replay shows the same sky). The rules the player meets are in three places:
//   patience  : a "time watched at 1x" counter grows only while the tab is visible, the sim runs at exactly 1x and the page has had no
//               input for 30 s (or the documentary camera has the shot). A sighting's tier needs that much watched time before it
//               can be recorded at all: 10 minutes, 1 hour, 4 hours, 12 hours.
//   detectors : plain functions of one frame (scanEvents, scanAgents) that name what happened and where.
//   the record: each sighting is kept once per browser (title, valley year and season, real date, a line of text and a small
//               photograph in IndexedDB); a second sighting of the same kind only bumps a counter.
// The counter, the records and the thumbnails live in browser storage, always inside try/catch: the game works with none.
import { AGENT_STRIDE, DAY_TICKS, Sp, St, YEAR_TICKS, type EnvState } from '../sim/types';
import type { SimEvent } from '../sim/sim';
import { h, setText } from './dom';
import { ModalPanel } from './panel';
import { readJson, writeJson } from './store';

// ------------------------------------------------------------------------------------------------------------------ tiers

export type Tier = 1 | 2 | 3 | 4;
/** Seconds of watched time a tier needs before its sightings can be recorded: 10 minutes, 1 hour, 4 hours, 12 hours. */
export const TIER_SECONDS: Record<Tier, number> = { 1: 600, 2: 3600, 3: 14400, 4: 43200 };
export const TIER_LABEL: Record<Tier, string> = { 1: '10 minutes', 2: '1 hour', 3: '4 hours', 4: '12 hours' };
/** The page must have had no input for this long for the watched counter to run (unless the documentary camera has the shot). */
export const IDLE_SECONDS = 30;
/** A sim step this long or longer in real seconds is a stall (a throttled tab waking up), not time watched. */
export const MAX_STEP_SECONDS = 1;
/** A comet or an aurora storm is staged at most once per this many real milliseconds (three hours). */
export const STAGE_COOLDOWN_MS = 3 * 3600 * 1000;

/** What the patience counter needs to know about this moment. */
export interface PatienceInput {
  /** The tab is visible. */
  visible: boolean;
  /** The sim speed now: 0 paused, 1, 10, 100. Only 1 counts. */
  speed: number;
  /** Seconds since the last keypress, click, scroll or pointer move. */
  idleSec: number;
  /** The documentary camera (or cinematic mode) has the shot. */
  filming: boolean;
}

/** Does this moment count as time watched? Visible, running at 1x, and left alone (or filmed by the documentary camera). */
export function patienceCounts(i: PatienceInput): boolean {
  return i.visible && i.speed === 1 && (i.idleSec >= IDLE_SECONDS || i.filming);
}

/** Has `watched` seconds unlocked this tier? */
export function tierUnlocked(watched: number, tier: Tier): boolean {
  return watched >= TIER_SECONDS[tier];
}

/** "9 min", "1 h 20 min", "12 h". */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return s < 10 ? 'no time at all' : 'under a minute';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const hr = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${hr} h` : `${hr} h ${rm} min`;
}

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
/** The season name for the sim's continuous season number (0 spring start, 1 summer, 2 autumn, 3 winter). */
export function seasonName(season: number): string {
  const k = Math.floor(((season % 4) + 4) % 4);
  return SEASONS[k];
}

// ------------------------------------------------------------------------------------------------------------------ the list

export type SightingId =
  | 'stampede200' | 'wolfMob' | 'ravenFeast' | 'elder'
  | 'cougarOpen' | 'wolfWalkIn' | 'pronghornBand' | 'lightningTree'
  | 'paleBison' | 'packRecord' | 'climateTurn'
  | 'comet' | 'auroraStorm';

/** What one detector found: the sighting, where (sim metres, 0 0 when it has no place) and a variant for texts that differ. */
export interface Hit {
  id: SightingId;
  x: number;
  y: number;
  /** Species of the subject, for the documentary camera (-1 when none). */
  sp?: number;
  variant?: string;
  /** A world direction (unit vector, three.js axes) the photograph should face, for the sky sightings. */
  aim?: [number, number, number];
}

export interface SightingDef {
  id: SightingId;
  tier: Tier;
  title: string;
  /** Shown dimmed while the sighting is locked or unseen: a cue, never the answer. */
  cue: string;
  /** The line the chronicle writes under the photograph. */
  line: (variant?: string) => string;
  /** The documentary camera's moment for it (see director.ts queueMoment), when it has a place on the ground. */
  moment?: string;
}

export const SIGHTINGS: SightingDef[] = [
  // tier 1: ten minutes of patience
  {
    id: 'stampede200', tier: 1, title: 'A thunder of hooves', moment: 'stampede',
    cue: 'A very large herd, all at once, with somewhere to be.',
    line: () => 'More than two hundred bison broke together, and for a minute the whole prairie ran.',
  },
  {
    id: 'wolfMob', tier: 1, title: 'The long line', moment: 'wolves',
    cue: 'Wolves, a great many of them, going somewhere together.',
    line: () => 'Ten wolves or more moved across the open ground as one animal, and nothing in the valley stood in their way.',
  },
  {
    id: 'ravenFeast', tier: 1, title: 'A parliament at the carcass', moment: 'kill',
    cue: 'Black wings, a great many, around one table.',
    line: () => 'Thirty ravens came down on a single carcass, and the quiet field turned loud with them.',
  },
  {
    id: 'elder', tier: 1, title: 'One of the old ones', moment: 'elder',
    cue: 'An animal that has outlived most of its neighbours.',
    line: () => 'An animal of great age walked the valley that day, older than most of the grass around it.',
  },
  // tier 2: one hour
  {
    id: 'cougarOpen', tier: 2, title: 'The ghost on open ground', moment: 'group',
    cue: 'A shy hunter, a long way from cover.',
    line: () => 'A cougar crossed the open prairie, far from any tree, and the whole valley seemed to hold its breath.',
  },
  {
    id: 'wolfWalkIn', tier: 2, title: 'A traveller from beyond', moment: 'wolves',
    cue: 'A stranger arrives at the edge of the valley.',
    line: () => 'A wolf came in over the edge of the valley, a long way from wherever it began.',
  },
  {
    id: 'pronghornBand', tier: 2, title: 'A hundred in flight', moment: 'migration',
    cue: 'The fastest runners in the valley, in their hundreds.',
    line: () => 'A hundred pronghorn ran as one, a pale tide over the prairie, faster than anything else alive here.',
  },
  {
    id: 'lightningTree', tier: 2, title: 'The cottonwood struck', moment: 'fire',
    cue: 'A storm picks out a single tree.',
    line: () => 'Lightning found a lone cottonwood standing by itself in the open, and set it alight.',
  },
  // tier 3: four hours
  {
    id: 'paleBison', tier: 3, title: 'The pale bison', moment: 'group',
    cue: 'One coat in the herd is not like the others.',
    line: () => 'Among the dark herd one bison wore a coat the colour of old straw. The others walked past as if it were nothing.',
  },
  {
    id: 'packRecord', tier: 3, title: 'A pack of record size', moment: 'wolves',
    cue: 'More wolves together than you have yet seen.',
    line: () => 'More wolves ran in one pack than you have seen in all your watching of this valley.',
  },
  {
    id: 'climateTurn', tier: 3, title: 'The years turn',
    cue: 'The weather changes, and does not change back for years.',
    line: (v) =>
      v === 'megadrought' ? 'The rains failed, and the valley\'s long dry began. The old grass says it will not be short.'
      : v === 'wet' ? 'A run of wet years began. The creek stayed full into the grass\'s second summer.'
      : 'A dry run of years settled over the valley, and the creek shrank back to its stones.',
  },
  // tier 4: twelve hours, staged in the sky by the renderer
  {
    id: 'comet', tier: 4, title: 'The long-tailed visitor',
    cue: 'Something new among the stars, for a few nights only.',
    line: () => 'A comet hung over the valley for a few nights, its tail turned away from the sun. The herds grazed on beneath it.',
  },
  {
    id: 'auroraStorm', tier: 4, title: 'A storm of light',
    cue: 'The northern sky, burning.',
    line: () => 'The aurora spread past the northern horizon and burned red overhead, and for a night the grass was lit from above.',
  },
];
export const SIGHTING_COUNT = SIGHTINGS.length;
const BY_ID = new Map<string, SightingDef>(SIGHTINGS.map((s) => [s.id, s]));
export function sightingDef(id: string): SightingDef | undefined {
  return BY_ID.get(id);
}

// ------------------------------------------------------------------------------------------------------------------ trees

/** The trees on the map, in a coarse grid, so "is there a tree within 80 m" costs a few cells. */
export class TreeIndex {
  private cells = new Map<number, number[]>();
  private n = 0;
  private static readonly CELL = 32;

  /** `stride` floats per tree, x and y first; with `stageCol` set, trees whose stage there is 5 (gone) are left out. */
  constructor(trees: ArrayLike<number>, stride = 4, stageCol = -1) {
    const len = Math.floor(trees.length / stride);
    for (let i = 0; i < len; i++) {
      const o = i * stride;
      if (stageCol >= 0 && trees[o + stageCol] >= 5) continue;
      const x = trees[o], y = trees[o + 1];
      if (!(x === x) || !(y === y)) continue;
      const k = this.key(x, y);
      const c = this.cells.get(k);
      if (c) c.push(x, y);
      else this.cells.set(k, [x, y]);
      this.n++;
    }
  }

  get size(): number {
    return this.n;
  }

  private key(x: number, y: number): number {
    return (Math.floor(y / TreeIndex.CELL) + 64) * 4096 + (Math.floor(x / TreeIndex.CELL) + 64);
  }

  /** How many trees stand within r metres of (x, y). */
  countWithin(x: number, y: number, r: number): number {
    const C = TreeIndex.CELL;
    const x0 = Math.floor((x - r) / C), x1 = Math.floor((x + r) / C);
    const y0 = Math.floor((y - r) / C), y1 = Math.floor((y + r) / C);
    const r2 = r * r;
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.cells.get((cy + 64) * 4096 + (cx + 64));
        if (!c) continue;
        for (let i = 0; i < c.length; i += 2) {
          const dx = c[i] - x, dy = c[i + 1] - y;
          if (dx * dx + dy * dy <= r2) n++;
        }
      }
    }
    return n;
  }

  anyWithin(x: number, y: number, r: number): boolean {
    return this.countWithin(x, y, r) > 0;
  }
}

// ------------------------------------------------------------------------------------------------------------------ detectors

/** An event older than this many ticks (against the snapshot that carries it) is history from a fast run, not news. */
export const EVENT_FRESH_TICKS = 300;
export const STAMPEDE_MIN = 200;
export const MOB_MIN = 10;
export const RAVENS_MIN = 30;
export const RAVEN_RADIUS = 14;
export const BAND_MIN = 100;
/** A cougar this far from every tree is "out on the open prairie". */
export const OPEN_PRAIRIE_M = 80;
/** Lightning counts as striking a tree when it lands this close to one. */
export const STRIKE_TREE_M = 6;
/** ... and the tree is "lone" when no more than this many other trees stand within LONE_RADIUS_M of it. */
export const LONE_OTHERS = 4;
export const LONE_RADIUS_M = 30;
/** A bison is pale when its coat is at most this, and at least PALE_GAP paler than the herd's middle. */
export const PALE_COAT = 0.7;
export const PALE_GAP = 0.1;
export const PALE_HERD_MIN = 20;
/** A pack must have at least this many wolves to be a record. */
export const RECORD_PACK_MIN = 8;

const MOVING = new Set<number>([St.Walk, St.Run, St.Chase, St.Stalk, St.Migrate]);

/** Hits from this frame's sim events. `trees` is the tree list for the lightning test (null: no lightning sightings). */
export function scanEvents(events: ArrayLike<SimEvent>, tick: number, trees: TreeIndex | null): Hit[] {
  const out: Hit[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (tick - e.tick > EVENT_FRESH_TICKS) continue;
    switch (e.kind) {
      case 'stampede':
        if (e.a >= STAMPEDE_MIN) out.push({ id: 'stampede200', x: e.x, y: e.y, sp: Sp.Bison });
        break;
      case 'elder':
        out.push({ id: 'elder', x: e.x, y: e.y, sp: e.sp });
        break;
      case 'immigrated':
        if (e.sp === Sp.Wolf) out.push({ id: 'wolfWalkIn', x: e.x, y: e.y, sp: Sp.Wolf });
        break;
      case 'lightningFire':
        if (trees && trees.size > 0 && trees.anyWithin(e.x, e.y, STRIKE_TREE_M) && trees.countWithin(e.x, e.y, LONE_RADIUS_M) - 1 <= LONE_OTHERS) {
          out.push({ id: 'lightningTree', x: e.x, y: e.y });
        }
        break;
      case 'megadrought':
        out.push({ id: 'climateTurn', x: 0, y: 0, variant: 'megadrought' });
        break;
      case 'climateWet':
        out.push({ id: 'climateTurn', x: 0, y: 0, variant: 'wet' });
        break;
      case 'climateDry':
        out.push({ id: 'climateTurn', x: 0, y: 0, variant: 'dry' });
        break;
      default:
        break;
    }
  }
  return out;
}

/** What the agent scan reads from a snapshot. */
export interface ScanData {
  agents: Float32Array;
  count: number;
  carcasses: Float32Array;
  carcassCount: number;
  /** Wolf packs, stride 4: den x, den y, territory radius, size. */
  packs: Float32Array;
  trees: TreeIndex | null;
}

/**
 * Hits from the animals on the map: a mob of wolves on the move, ravens at a carcass, a cougar on the open prairie, a pronghorn
 * band in flight, a pale bison. Also returns the largest wolf pack now, for the record-size test. Cheap enough for twice a second.
 */
export function scanAgents(d: ScanData): { hits: Hit[]; maxPack: number } {
  const hits: Hit[] = [];
  const A = d.agents;
  const cell = 60;
  const keyOf = (x: number, y: number): number => (Math.floor(y / cell) + 32) * 256 + (Math.floor(x / cell) + 32);
  const wolves = new Map<number, number>();
  const prong = new Map<number, number>();
  const wolfAt: number[] = [];
  const prongAt: number[] = [];
  const ravens: number[] = [];
  const coats: number[] = [];
  const bisonAt: number[] = [];
  let cougarHit: Hit | null = null;

  for (let k = 0; k < d.count; k++) {
    const o = k * AGENT_STRIDE;
    const sp = A[o];
    const x = A[o + 1], y = A[o + 2];
    const st = A[o + 7];
    if (sp === Sp.Wolf) {
      if (MOVING.has(st)) {
        const key = keyOf(x, y);
        wolves.set(key, (wolves.get(key) ?? 0) + 1);
        wolfAt.push(x, y);
      }
    } else if (sp === Sp.Deer) {
      if (st === St.Flee || st === St.Run) {
        const key = keyOf(x, y);
        prong.set(key, (prong.get(key) ?? 0) + 1);
        prongAt.push(x, y);
      }
    } else if (sp === Sp.Raven) {
      if (A[o + 9] < 4) ravens.push(x, y);
    } else if (sp === Sp.Bison) {
      coats.push(A[o + 6]);
      bisonAt.push(A[o + 6], x, y);
    } else if (sp === Sp.Cougar) {
      if (!cougarHit && d.trees && d.trees.size > 0 && !d.trees.anyWithin(x, y, OPEN_PRAIRIE_M)) {
        cougarHit = { id: 'cougarOpen', x, y, sp: Sp.Cougar };
      }
    }
  }

  // a mob: ten or more wolves on the move within one cell and its neighbours
  const crowd = (m: Map<number, number>, need: number): number => {
    for (const [key, n] of m) {
      if (n * 9 < need) continue; // a quick cut: the fullest cell of a crowd holds at least a ninth of it
      let sum = 0;
      const cx = (key % 256), cy = Math.floor(key / 256);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += m.get((cy + dy) * 256 + cx + dx) ?? 0;
      if (sum >= need) return key;
    }
    return -1;
  };
  const near = (pts: number[], key: number): { x: number; y: number } => {
    const cx = (key % 256 - 32 + 0.5) * cell, cy = (Math.floor(key / 256) - 32 + 0.5) * cell;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < pts.length; i += 2) {
      if (Math.abs(pts[i] - cx) <= cell * 1.5 && Math.abs(pts[i + 1] - cy) <= cell * 1.5) { sx += pts[i]; sy += pts[i + 1]; n++; }
    }
    return n ? { x: sx / n, y: sy / n } : { x: cx, y: cy };
  };
  const mob = crowd(wolves, MOB_MIN);
  if (mob >= 0) {
    const c = near(wolfAt, mob);
    hits.push({ id: 'wolfMob', x: c.x, y: c.y, sp: Sp.Wolf });
  }
  const band = crowd(prong, BAND_MIN);
  if (band >= 0) {
    const c = near(prongAt, band);
    hits.push({ id: 'pronghornBand', x: c.x, y: c.y, sp: Sp.Deer });
  }

  // ravens on the ground at one carcass
  if (ravens.length >= RAVENS_MIN * 2) {
    const r2 = RAVEN_RADIUS * RAVEN_RADIUS;
    for (let c = 0; c < d.carcassCount; c++) {
      const cx = d.carcasses[c * 4], cy = d.carcasses[c * 4 + 1];
      if (d.carcasses[c * 4 + 2] <= 0.02) continue;
      let n = 0;
      for (let i = 0; i < ravens.length; i += 2) {
        const dx = ravens[i] - cx, dy = ravens[i + 1] - cy;
        if (dx * dx + dy * dy <= r2) n++;
      }
      if (n >= RAVENS_MIN) {
        hits.push({ id: 'ravenFeast', x: cx, y: cy, sp: Sp.Raven });
        break;
      }
    }
  }

  if (cougarHit) hits.push(cougarHit);

  // a pale bison: in a herd of twenty or more, a coat at the far pale end of the herd's range
  if (coats.length >= PALE_HERD_MIN) {
    const sorted = coats.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const lo = sorted[0];
    if (lo <= PALE_COAT && lo <= median - PALE_GAP) {
      for (let i = 0; i < bisonAt.length; i += 3) {
        if (bisonAt[i] === lo) {
          hits.push({ id: 'paleBison', x: bisonAt[i + 1], y: bisonAt[i + 2], sp: Sp.Bison });
          break;
        }
      }
    }
  }

  let maxPack = 0;
  for (let i = 3; i < d.packs.length; i += 4) if (d.packs[i] > maxPack) maxPack = d.packs[i];
  return { hits, maxPack };
}

/** Is this the record-size pack? Strictly bigger than the biggest ever seen here (which must have been seen), and big in itself. */
export function isPackRecord(size: number, prevMax: number, all = false): boolean {
  return size > prevMax && size >= RECORD_PACK_MIN && (prevMax > 0 || all);
}

// ------------------------------------------------------------------------------------------------------------------ the staged sky

const hashU = (a: number, b: number): number => {
  let x = (Math.imul(Math.floor(a) | 0, 374761393) + Math.imul(Math.floor(b) | 0, 668265263) + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};

/** Chance that a given valley year has a comet, and that it has a great aurora storm. */
export const COMET_YEAR_P = 0.12;
export const STORM_YEAR_P = 0.1;
/** How long a comet hangs over the valley, in ticks (three and a half days, so three or four nights). */
export const COMET_TICKS = Math.round(3.5 * DAY_TICKS);
/** A great storm runs over two midnights. */
export const STORM_BEFORE = 360;
export const STORM_AFTER = DAY_TICKS + 360;
/** Midnight (dayFrac 0) falls on ticks congruent to this, mod DAY_TICKS (the sim starts at dayFrac 0.27). */
const MIDNIGHT_OFFSET = DAY_TICKS - Math.round(0.27 * DAY_TICKS);

export interface SkyWindow {
  start: number;
  end: number;
  /** Where the comet is, in the sky's own (equatorial) frame: right ascension and declination in radians at the start. */
  ra: number;
  dec: number;
}

const win = (a: number, b: number, ra = 0, dec = 0): SkyWindow => ({ start: a, end: b, ra, dec });

/** The comet window that holds this tick, or null. A pure function of (seed, tick): the same valley always shows the same sky. */
export function cometWindow(seed: number, tick: number): SkyWindow | null {
  const yt = YEAR_TICKS;
  const y1 = Math.floor(tick / yt);
  for (let y = y1; y >= y1 - 1; y--) {
    if (y < 0 || hashU(seed * 3 + 11, y) >= COMET_YEAR_P) continue;
    const start = y * yt + Math.floor(hashU(seed * 5 + 17, y) * yt);
    if (tick >= start && tick < start + COMET_TICKS) {
      // a comet well north: circumpolar-ish at this latitude, so it is up for much of every night
      return win(start, start + COMET_TICKS, hashU(seed * 7 + 23, y) * Math.PI * 2, (52 + 16 * hashU(seed * 9 + 29, y)) * Math.PI / 180);
    }
  }
  return null;
}

/** The great aurora storm window that holds this tick, or null: two midnights in the winter of a storm year. */
export function stormWindow(seed: number, tick: number): SkyWindow | null {
  const yt = YEAR_TICKS;
  const y1 = Math.floor(tick / yt);
  for (let y = y1; y >= y1 - 1; y--) {
    if (y < 0 || hashU(seed * 13 + 5, y) >= STORM_YEAR_P) continue;
    const winterAt = y * yt + Math.floor(0.86 * yt);
    const n = Math.round((winterAt - MIDNIGHT_OFFSET) / DAY_TICKS);
    const c = n * DAY_TICKS + MIDNIGHT_OFFSET; // the midnight nearest the heart of winter
    const w = win(c - STORM_BEFORE, c + STORM_AFTER);
    if (tick >= w.start && tick < w.end) return w;
  }
  return null;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0..1 across a window: a gentle rise, a long plateau and a gentle fall. */
export function windowStrength(w: SkyWindow, tick: number, ramp = 0.16): number {
  const p = (tick - w.start) / Math.max(1, w.end - w.start);
  return smooth(0, ramp, p) * smooth(0, ramp, 1 - p);
}

export interface CometState {
  strength: number;
  /** The head's direction in the sky's own frame (unit). */
  eq: [number, number, number];
  /** The tail's direction there (unit, tangent at the head, away from the sun). */
  tail: [number, number, number];
}

/** The comet's head and tail at `tick`. The sun sits at right ascension season x 90 degrees, so the tail points away from it. */
export function cometState(w: SkyWindow, tick: number, season: number): CometState {
  const p = (tick - w.start) / Math.max(1, w.end - w.start);
  const ra = w.ra + 0.08 * p; // it drifts about four and a half degrees across its stay
  const dec = w.dec - 0.03 * p;
  const cd = Math.cos(dec);
  const H: [number, number, number] = [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)];
  const a = season * Math.PI / 2;
  const S: [number, number, number] = [Math.cos(a), Math.sin(a), 0];
  const sh = S[0] * H[0] + S[1] * H[1] + S[2] * H[2];
  let t: [number, number, number] = [H[0] * sh - S[0], H[1] * sh - S[1], H[2] * sh - S[2]];
  const L = Math.hypot(t[0], t[1], t[2]);
  t = L > 1e-6 ? [t[0] / L, t[1] / L, t[2] / L] : [0, 0, 1];
  return { strength: windowStrength(w, tick, 0.2), eq: H, tail: t };
}

/** A direction in the sky's frame as a world direction. `rot` is the sky rotation matrix's elements (three.js Matrix3, column major). */
export function skyToWorld(rot: ArrayLike<number>, e: [number, number, number]): [number, number, number] {
  return [
    rot[0] * e[0] + rot[1] * e[1] + rot[2] * e[2],
    rot[3] * e[0] + rot[4] * e[1] + rot[5] * e[2],
    rot[6] * e[0] + rot[7] * e[1] + rot[8] * e[2],
  ];
}

/** Turn a world direction to frame it with room for the horizon: the same bearing, lowered 14 degrees, kept between 6 and 50. */
export function framedAim(d: [number, number, number]): [number, number, number] {
  const hl = Math.hypot(d[0], d[2]) || 1;
  const alt = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const a = Math.min(50 * Math.PI / 180, Math.max(6 * Math.PI / 180, alt - 14 * Math.PI / 180));
  return [(d[0] / hl) * Math.cos(a), Math.sin(a), (d[2] / hl) * Math.cos(a)];
}

/** Deep enough into the night for the sky to be dark (dayFrac 0 is midnight). */
export function deepNight(dayFrac: number): boolean {
  return dayFrac < 0.14 || dayFrac > 0.86;
}

/** What the sky draws for the rare sightings (render/sky.ts reads this through main.ts). */
export interface RareSkyState {
  comet: number;
  cometEq: [number, number, number];
  cometTail: [number, number, number];
  storm: number;
}
export const SKY_OFF: RareSkyState = { comet: 0, cometEq: [0, 0, 1], cometTail: [1, 0, 0], storm: 0 };

// ------------------------------------------------------------------------------------------------------------------ the record

export interface SightingRecord {
  id: string;
  /** How many times it has been seen in this browser (1 on the first). */
  count: number;
  /** The valley year the slate showed, and the season. */
  year: number;
  season: string;
  /** Real time of the first sighting (epoch ms). */
  at: number;
  /** The chronicle line, kept as written then. */
  text: string;
  /** True once a photograph is stored for it. */
  photo: boolean;
}

interface StoreData {
  v: 1;
  /** Seconds watched at 1x. */
  watched: number;
  /** The largest wolf pack seen at 1x in this browser. */
  maxPack: number;
  /** When a comet or storm was last staged (epoch ms). */
  lastStageAt: number;
  sightings: Record<string, SightingRecord>;
}

const STORE_KEY = 'tallgrass.rare.v1';
const DB_NAME = 'tallgrass-rare';
const DB_STORE = 'photos';
/** A thumbnail this small (as a data URL) may live in localStorage when IndexedDB is not there. */
const LS_PHOTO_MAX = 90_000;
const LS_PHOTO_KEY = 'tallgrass.rare.photo.';

/** Photographs: IndexedDB when it is there, else a small data URL in localStorage, else this page's memory. Every call resolves. */
export class RarePhotos {
  private db: Promise<IDBDatabase | null> | null = null;
  private mem = new Map<string, Blob>();

  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.db;
  }

  /** Keep a photograph. Resolves true when it will outlast this page. */
  async put(id: string, blob: Blob): Promise<boolean> {
    this.mem.set(id, blob);
    const db = await this.open();
    if (db) {
      try {
        const ok = await new Promise<boolean>((resolve) => {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(blob, id);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false); // a full disk lands here: the picture stays in memory for this visit
        });
        if (ok) return true;
      } catch {
        /* fall through to the small copy */
      }
    }
    try {
      if (blob.size <= LS_PHOTO_MAX * 0.74) {
        const url = await blobToDataUrl(blob);
        if (url.length <= LS_PHOTO_MAX) {
          window.localStorage.setItem(LS_PHOTO_KEY + id, url);
          return true;
        }
      }
    } catch {
      /* quota or no storage: memory only */
    }
    return false;
  }

  async get(id: string): Promise<Blob | null> {
    const m = this.mem.get(id);
    if (m) return m;
    const db = await this.open();
    if (db) {
      try {
        const b = await new Promise<Blob | null>((resolve) => {
          const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id);
          req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
          req.onerror = () => resolve(null);
        });
        if (b) return b;
      } catch {
        /* try the small copy */
      }
    }
    try {
      const url = window.localStorage.getItem(LS_PHOTO_KEY + id);
      if (url) return await (await fetch(url)).blob();
    } catch {
      /* nothing kept */
    }
    return null;
  }

  async clear(): Promise<void> {
    this.mem.clear();
    try {
      for (const d of SIGHTINGS) window.localStorage.removeItem(LS_PHOTO_KEY + d.id);
    } catch {
      /* nothing to do */
    }
    const db = await this.open();
    if (!db) return;
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      /* nothing to do */
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** What is kept between visits: the watched seconds, the biggest pack, the sightings. Saved as it changes, never throwing. */
export class RareStore {
  readonly photos = new RarePhotos();
  private data: StoreData = { v: 1, watched: 0, maxPack: 0, lastStageAt: 0, sightings: {} };
  private dirty = false;
  private lastSave = 0;
  /** Called whenever a sighting is added, bumped or changed, and when the store is cleared. */
  onChange: () => void = () => {};

  constructor(opts: { reset?: boolean } = {}) {
    if (opts.reset) this.reset();
    else this.load();
  }

  private load(): void {
    const d = readJson<Partial<StoreData> | null>(STORE_KEY, null);
    if (!d || typeof d !== 'object') return;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    this.data.watched = num(d.watched);
    this.data.maxPack = num(d.maxPack);
    this.data.lastStageAt = num(d.lastStageAt);
    for (const def of SIGHTINGS) {
      const r = d.sightings?.[def.id];
      if (r && typeof r === 'object' && Number.isFinite(r.year) && typeof r.text === 'string') {
        this.data.sightings[def.id] = {
          id: def.id, count: Math.max(1, Math.round(Number(r.count) || 1)), year: Math.max(1, Math.round(r.year)),
          season: typeof r.season === 'string' ? r.season : 'spring', at: Number(r.at) || 0, text: r.text, photo: !!r.photo,
        };
      }
    }
  }

  private save(force = false): void {
    if (!this.dirty) return;
    const now = Date.now();
    if (!force && now - this.lastSave < 8000) return;
    this.lastSave = now;
    if (writeJson(STORE_KEY, this.data)) this.dirty = false;
  }

  /** Save now if anything changed (the page is going away). */
  flush(): void {
    this.save(true);
  }

  /** ?rare=reset: forget everything, the photographs too. */
  reset(): void {
    this.data = { v: 1, watched: 0, maxPack: 0, lastStageAt: 0, sightings: {} };
    this.dirty = true;
    this.save(true);
    void this.photos.clear();
    this.onChange();
  }

  get watched(): number {
    return this.data.watched;
  }

  addWatched(sec: number): void {
    if (!(sec > 0)) return;
    this.data.watched += sec;
    this.dirty = true;
    this.save();
  }

  get maxPack(): number {
    return this.data.maxPack;
  }

  setMaxPack(n: number): void {
    if (n <= this.data.maxPack) return;
    this.data.maxPack = n;
    this.dirty = true;
    this.save();
  }

  get lastStageAt(): number {
    return this.data.lastStageAt;
  }

  setLastStage(at: number): void {
    this.data.lastStageAt = at;
    this.dirty = true;
    this.save(true);
  }

  get count(): number {
    return Object.keys(this.data.sightings).length;
  }

  has(id: string): boolean {
    return id in this.data.sightings;
  }

  get(id: string): SightingRecord | undefined {
    return this.data.sightings[id];
  }

  /** Record a first sighting. False if it was already there. */
  add(rec: SightingRecord): boolean {
    if (this.has(rec.id) || !BY_ID.has(rec.id)) return false;
    this.data.sightings[rec.id] = rec;
    this.dirty = true;
    this.save(true);
    this.onChange();
    return true;
  }

  /** A second sighting of the same kind only bumps the counter. */
  bump(id: string): void {
    const r = this.data.sightings[id];
    if (!r) return;
    r.count++;
    this.dirty = true;
    this.save();
    this.onChange();
  }

  /** Attach a photograph to a sighting (the picture itself goes to the photo store). */
  async setPhoto(id: string, blob: Blob): Promise<void> {
    const r = this.data.sightings[id];
    if (!r) return;
    await this.photos.put(id, blob); // (this visit keeps it in memory at least; storage makes it outlast the page)
    r.photo = true;
    this.dirty = true;
    this.save(true);
    this.onChange();
  }
}

// ------------------------------------------------------------------------------------------------------------------ debug modes

/** ?rare=all lets every detector fire at any speed with every tier unlocked; ?rare=reset clears the store. */
export function rareMode(search: string): 'all' | 'reset' | null {
  let v: string | null = null;
  try {
    v = new URLSearchParams(search).get('rare');
  } catch {
    v = null;
  }
  return v === 'all' ? 'all' : v === 'reset' ? 'reset' : null;
}

// ------------------------------------------------------------------------------------------------------------------ the controller

/** Ticks before the same sighting can bump its counter again (an ongoing stampede is one sighting, not forty). */
const EVENT_COOLDOWN = 1200;
const SCAN_COOLDOWN = 3000;
/** Real milliseconds between scans of the animals. */
const SCAN_EVERY_MS = 1500;
const SKY_EVERY_MS = 250;
/** How long a photograph may wait for the subject to come into frame before the frame is taken anyway. */
const SHOT_PATIENCE_MS = 25000;
/** When the documentary camera has been asked to frame it, give it this long to arrive. */
const SHOT_DIRECTOR_MS = 3500;

export interface RareFrame {
  /** Real clock in ms (performance.now). */
  nowMs: number;
  /** Real seconds since the last frame. */
  dt: number;
  visible: boolean;
  /** The sim speed now (0 paused, 1, 10, 100; -1 while skipping). */
  speed: number;
  /** The documentary camera or cinematic mode has the shot. */
  filming: boolean;
  tick: number;
  env: EnvState;
  events: ArrayLike<SimEvent>;
  agents: Float32Array;
  count: number;
  carcasses: Float32Array;
  carcassCount: number;
  packs: Float32Array;
}

export interface RareHooks {
  /** The quiet toast: "Rare sighting: <title>". */
  toast(title: string): void;
  /** Ask the documentary camera to frame a moment (it does nothing when it is off). */
  frame(moment: string, x: number, y: number, sp: number): void;
  directorOn(): boolean;
  /** Is the ground point (sim metres) inside the camera's view, near enough to read? */
  inView(x: number, y: number): boolean;
  /** Take the thumbnail: a JPEG blob of the frame as photo mode would grab it, facing `aim` (a world direction) when given. */
  grab(aim: [number, number, number] | null): Promise<Blob | null>;
  /** The sky rotation matrix elements (column major), to turn the comet's place in the stars into a direction. */
  skyRot(): ArrayLike<number> | null;
  /** Hand the renderer what to draw in the sky. */
  setSky(s: RareSkyState): void;
}

interface Shot {
  id: string;
  x: number;
  y: number;
  due: number;
  deadline: number;
  aim: [number, number, number] | null;
  ground: boolean;
}

/** Watches the frames, keeps the patience counter, records the sightings. One per game. */
export class RareSightings {
  readonly all: boolean;
  private lastInputMs: number;
  /** The real clock as of the last frame (ms), so shot times need no clock of their own. */
  private clockMs: number;
  private lastScan = -1e9;
  private lastSky = -1e9;
  private lastTick = -1;
  private lastHit = new Map<string, number>();
  private shots: Shot[] = [];
  private shooting = false;
  private skyLive = false;
  private forced: 'comet' | 'aurora' | null = null;
  private cometWin = -1;
  private cometShown = false;
  private stormWin = -1;
  private stormShown = false;
  private trees: TreeIndex | null = null;
  /** The last sky state sent, for tests and captures. */
  skyNow: RareSkyState = SKY_OFF;
  /** Sightings recorded for the first time since this page opened (tests read it). */
  recorded: string[] = [];

  constructor(private store: RareStore, private hooks: RareHooks, private seed: number, mode: 'all' | 'reset' | null = null, nowMs = 0) {
    this.all = mode === 'all';
    this.lastInputMs = nowMs;
    this.clockMs = nowMs;
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const on = (): void => this.noteInput(performance.now());
      for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, on, { passive: true });
      window.addEventListener('pagehide', () => this.store.flush());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.store.flush(); });
    }
  }

  /** Any input at all (the idle clock restarts). */
  noteInput(nowMs: number): void {
    this.lastInputMs = nowMs;
  }

  /** The tree list the lightning and cougar tests read. */
  setTrees(t: TreeIndex | null): void {
    this.trees = t;
  }

  get watched(): number {
    return this.store.watched;
  }

  /** Is this tier open right now? ?rare=all opens every tier. */
  unlocked(tier: Tier): boolean {
    return this.all || tierUnlocked(this.store.watched, tier);
  }

  private canRecord(tier: Tier, speed: number): boolean {
    return this.all || (speed === 1 && tierUnlocked(this.store.watched, tier));
  }

  /** Debug: show a comet or a storm now whatever the calendar says (null stops it). */
  force(kind: 'comet' | 'aurora' | null): void {
    this.forced = kind;
    this.lastSky = -1e9;
  }

  /** Debug: record a sighting now, as if it had been seen (no gates). */
  debugRecord(id: SightingId, env: EnvState, hit: Partial<Hit> = {}): boolean {
    return this.record({ id, x: 0, y: 0, ...hit }, env, true);
  }

  update(f: RareFrame): void {
    if (!(f.dt > 0)) return; // a photograph re-renders with dt 0: nothing happens in it
    this.clockMs = f.nowMs;
    if (this.lastTick >= 0 && f.tick < this.lastTick - 2000) { this.lastHit.clear(); this.cometWin = this.stormWin = -1; }
    this.lastTick = f.tick;

    // patience
    const idle = (f.nowMs - this.lastInputMs) / 1000;
    if (patienceCounts({ visible: f.visible, speed: f.speed, idleSec: idle, filming: f.filming })) this.store.addWatched(Math.min(f.dt, MAX_STEP_SECONDS));
    if (!f.visible && !this.all) return;

    // events: cheap, every frame there are any
    if (f.events.length && (this.all || (f.speed === 1 && this.store.watched >= TIER_SECONDS[1]))) {
      for (const hit of scanEvents(f.events, f.tick, this.trees)) this.hit(hit, f, EVENT_COOLDOWN);
    }

    // the animals: twice a second at most
    if (f.nowMs - this.lastScan >= SCAN_EVERY_MS && (this.all || f.speed === 1)) {
      this.lastScan = f.nowMs;
      if (this.all || this.store.watched >= TIER_SECONDS[1]) {
        const r = scanAgents({ agents: f.agents, count: f.count, carcasses: f.carcasses, carcassCount: f.carcassCount, packs: f.packs, trees: this.trees });
        for (const hit of r.hits) this.hit(hit, f, SCAN_COOLDOWN);
        if (r.maxPack > this.store.maxPack) {
          const prev = this.store.maxPack;
          this.store.setMaxPack(r.maxPack);
          if (isPackRecord(r.maxPack, prev, this.all)) this.hit({ id: 'packRecord', x: 0, y: 0, sp: Sp.Wolf }, f, SCAN_COOLDOWN);
        }
      }
    }

    // the sky
    if (f.nowMs - this.lastSky >= SKY_EVERY_MS) {
      this.lastSky = f.nowMs;
      this.sky(f);
    }

    this.runShots(f.nowMs);
  }

  /** A detector fired: check the gates and the cooldown, then record it or bump it. */
  private hit(h: Hit, f: RareFrame, cooldown: number): void {
    const def = BY_ID.get(h.id);
    if (!def || !this.canRecord(def.tier, f.speed)) return;
    const last = this.lastHit.get(h.id);
    if (last !== undefined && f.tick >= last && f.tick - last < cooldown) return;
    this.lastHit.set(h.id, f.tick);
    this.record(h, f.env, false);
  }

  /** Record a first sighting (toast, camera, photograph) or bump the counter of one already kept. */
  private record(h: Hit, env: EnvState, debug: boolean): boolean {
    const def = BY_ID.get(h.id);
    if (!def) return false;
    if (this.store.has(h.id)) {
      this.store.bump(h.id);
      return false;
    }
    const added = this.store.add({
      id: h.id, count: 1, year: env.year + 1, season: seasonName(env.season), at: Date.now(), text: def.line(h.variant), photo: false,
    });
    if (!added) return false;
    this.recorded.push(h.id);
    this.hooks.toast(def.title);
    let waitDirector = false;
    if (def.moment && (h.x !== 0 || h.y !== 0) && this.hooks.directorOn()) {
      this.hooks.frame(def.moment, h.x, h.y, h.sp ?? -1);
      waitDirector = true;
    }
    const ground = !h.aim && (h.x !== 0 || h.y !== 0);
    const now = this.clockMs;
    this.shots.push({
      id: h.id, x: h.x, y: h.y, aim: h.aim ?? null, ground,
      due: now + (waitDirector ? SHOT_DIRECTOR_MS : debug ? 0 : 400),
      deadline: now + SHOT_PATIENCE_MS,
    });
    return true;
  }

  /** Take the next waiting photograph once its subject is in the frame (or its patience is spent). One at a time. */
  private runShots(nowMs: number): void {
    if (this.shooting || !this.shots.length) return;
    const s = this.shots[0];
    if (nowMs < s.due) return;
    if (s.ground && nowMs < s.deadline && !this.hooks.inView(s.x, s.y)) return;
    this.shots.shift();
    this.shooting = true;
    void this.hooks.grab(s.aim).then(
      async (blob) => {
        if (blob) await this.store.setPhoto(s.id, blob);
      },
      () => undefined,
    ).finally(() => { this.shooting = false; });
  }

  // ---- the staged sky

  /** Is a stage allowed now: tier 4 open at 1x, and the last stage was long enough ago? */
  private stageGate(f: RareFrame): boolean {
    if (this.all) return true;
    if (!this.unlocked(4) || f.speed !== 1) return false;
    return Date.now() - this.store.lastStageAt >= STAGE_COOLDOWN_MS;
  }

  private sky(f: RareFrame): void {
    const season = f.env.season;
    let comet: CometState | null = null;
    let storm = 0;

    if (this.forced === 'comet') {
      comet = cometState(win(f.tick - 1000, f.tick + 1000, 1.2, 1.0), f.tick, season);
      comet.strength = 1;
    } else if (this.forced === 'aurora') {
      storm = 1;
    } else if (this.unlocked(4)) {
      const cw = cometWindow(this.seed, f.tick);
      if (cw) {
        if (this.cometWin !== cw.start) {
          this.cometWin = cw.start;
          this.cometShown = this.stageGate(f);
          if (this.cometShown && !this.all) this.store.setLastStage(Date.now());
        }
        if (this.cometShown) comet = cometState(cw, f.tick, season);
      } else {
        this.cometWin = -1;
        this.cometShown = false;
      }
      const sw = stormWindow(this.seed, f.tick);
      if (sw) {
        if (this.stormWin !== sw.start) {
          this.stormWin = sw.start;
          this.stormShown = this.stageGate(f);
          if (this.stormShown && !this.all) this.store.setLastStage(Date.now());
        }
        if (this.stormShown) storm = windowStrength(sw, f.tick, 0.2);
      } else {
        this.stormWin = -1;
        this.stormShown = false;
      }
    }

    // only worth drawing at night (the dome skips it by day anyway); during the day the state is zero
    const night = !(f.env.dayFrac > 0.2 && f.env.dayFrac < 0.8);
    const cs = comet && night ? comet.strength : 0;
    const ss = night ? storm : 0;
    if (cs > 0.002 || ss > 0.002 || this.skyLive) {
      this.skyNow = { comet: cs, cometEq: comet ? comet.eq : SKY_OFF.cometEq, cometTail: comet ? comet.tail : SKY_OFF.cometTail, storm: ss };
      this.hooks.setSky(this.skyNow);
      this.skyLive = cs > 0.002 || ss > 0.002;
    }

    // seen: dark, clear, strong, and (for the comet) above the horizon
    const clear = f.env.rain < 0.15 && f.env.weather !== 3 && f.env.weather !== 4;
    if (cs > 0.55 && deepNight(f.env.dayFrac) && clear && comet) {
      const rot = this.hooks.skyRot();
      const d = rot ? skyToWorld(rot, comet.eq) : null;
      if (d && d[1] > 0.26) this.hit({ id: 'comet', x: 0, y: 0, aim: framedAim(d) }, f, COMET_TICKS + 400); // (one stay is one sighting)
    }
    if (ss > 0.6 && night && clear) {
      this.hit({ id: 'auroraStorm', x: 0, y: 0, aim: framedAim([0, 0.5, 0.87]) }, f, STORM_BEFORE + STORM_AFTER + 400);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------ the journal page

const SILHOUETTE =
  '<svg class="tg-rare-sil" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
  '<path d="M0 66c18-9 30-6 44-12 10-4 20-14 34-14 16 0 22 12 38 16 14 3 28-2 44-8v42H0z" fill="currentColor" opacity=".22"/>' +
  '<path d="M0 74c22-6 36-2 52-6 14-4 24-10 40-8 20 2 30 10 68 4v26H0z" fill="currentColor" opacity=".32"/>' +
  '<circle cx="118" cy="28" r="9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 3" opacity=".6"/>' +
  '</svg>';

const fmtDate = (at: number): string => {
  try {
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

/** Menu > Rare sightings: the watched time, then every sighting by tier: a silhouette until it is seen, then the photograph and the line. */
export class RarePanel extends ModalPanel {
  private watchedEl: HTMLElement;
  private total: HTMLElement;
  private list: HTMLElement;
  private urls: string[] = [];
  private token = 0;

  constructor(private store: RareStore, private all: () => boolean, onClose: () => void) {
    super({
      title: 'Rare sightings',
      sub: 'The valley gives rare moments to the patient. Leave it running at 1x, hands off, and they will come.',
      wide: true,
      cls: 'tg-rare',
      onClose,
    });
    this.total = h('span', { class: 'tg-notes-count' });
    this.headExtra.append(this.total);
    this.watchedEl = h('p', { class: 'tg-rare-watched' });
    this.list = h('div', { class: 'tg-rare-list' });
    this.body.append(this.watchedEl, this.list);
    this.render();
  }

  protected override onShow(): void {
    this.render();
  }

  protected override onHide(): void {
    this.revoke();
  }

  /** Redraw after the store changed (a sighting recorded, a photograph attached). Cheap: thirteen cards. */
  refresh(): void {
    if (this.isOpen) this.render();
    else setText(this.total, `${this.store.count} of ${SIGHTING_COUNT}`);
  }

  private revoke(): void {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  private render(): void {
    this.revoke();
    const token = ++this.token;
    const watched = this.store.watched;
    setText(this.total, `${this.store.count} of ${SIGHTING_COUNT}`);
    setText(this.watchedEl, `Time watched at 1x: ${watched < 60 ? 'none yet' : fmtDuration(watched)}`);
    const all = this.all();
    const kids: HTMLElement[] = [];
    for (const tier of [1, 2, 3, 4] as Tier[]) {
      const open = all || tierUnlocked(watched, tier);
      kids.push(
        h(
          'h3',
          { class: 'tg-pane-h tg-rare-tier' },
          `Tier ${tier}`,
          h('span', { class: 'tg-rare-tierwhen', text: open ? `open (after ${TIER_LABEL[tier]} watched)` : `unlocks after ${TIER_LABEL[tier]} watched` }),
        ),
      );
      const grid = h('div', { class: 'tg-rare-grid' });
      for (const def of SIGHTINGS.filter((s) => s.tier === tier)) grid.append(this.card(def, open, watched, token));
      kids.push(grid);
    }
    this.list.replaceChildren(...kids);
  }

  private card(def: SightingDef, open: boolean, watched: number, token: number): HTMLElement {
    const rec = this.store.get(def.id);
    if (!rec) {
      const need = TIER_SECONDS[def.tier];
      return h(
        'article',
        { class: `tg-rare-card is-locked${open ? ' is-open' : ''}`, 'aria-label': `Locked sighting, tier ${def.tier}` },
        h('div', { class: 'tg-rare-photo', html: SILHOUETTE }),
        h('h4', { class: 'tg-rare-title is-hidden', text: 'Not yet seen' }),
        h('p', { class: 'tg-rare-line', text: def.cue }),
        h(
          'p',
          { class: 'tg-rare-when' },
          open
            ? 'Open to sightings. Keep watching.'
            : `Keep the valley running at 1x: unlocks after ${TIER_LABEL[def.tier]} watched (${fmtDuration(watched)} so far).`,
        ),
        open ? null : h('i', { class: 'tg-rare-bar', style: `--p:${Math.min(1, watched / need).toFixed(3)}`, 'aria-hidden': 'true' }),
      );
    }
    const img = h('img', { class: 'tg-rare-img', alt: `${def.title}, a photograph from the valley`, hidden: true });
    const none = h('span', { class: 'tg-rare-nophoto', text: 'No photograph kept' });
    const photo = h('div', { class: 'tg-rare-photo' }, img, none);
    if (rec.photo) {
      void this.store.photos.get(def.id).then((blob) => {
        if (!blob || token !== this.token) return;
        const u = URL.createObjectURL(blob);
        this.urls.push(u);
        img.src = u;
        img.hidden = false;
        none.hidden = true;
      });
    }
    return h(
      'article',
      { class: 'tg-rare-card is-seen' },
      photo,
      h('h4', { class: 'tg-rare-title' }, def.title, rec.count > 1 ? h('span', { class: 'tg-rare-times', text: `seen ${rec.count} times` }) : null),
      h('p', { class: 'tg-rare-line', text: rec.text }),
      h('p', { class: 'tg-rare-when', text: `Tallgrass, year ${rec.year}, ${rec.season}${rec.at ? ` · ${fmtDate(rec.at)}` : ''}` }),
    );
  }
}

/** The menu entry's words (menu.ts builds the row). */
export const RARE_MENU = { name: 'Rare sightings', blurb: 'Rare moments the valley gives to the patient.' };
