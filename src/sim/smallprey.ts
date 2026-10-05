// The small-prey web (V2-PLAN.md S4): jackrabbits and prairie dogs as density fields on the 32 x 32 coarse grid
// (16 m cells), with prairie dog towns, sylvatic plague and the predators' catch rule (Holling type II).
//
// Fields (Float32Array(1024), row-major by coarse y then x, the same indexing as Sim.coarseGrass):
//   hare   jackrabbits per cell
//   dog    prairie dogs per cell (only where world.dogCap > 0)
//   town   burrow infrastructure 0..1: builds while a cell holds a colony, fades slowly once it is empty (old mounds stay)
//   plague sylvatic plague intensity 0..1
//
// Everything runs from step(tick), which the sim calls every STEP_TICKS ticks right after it refreshes the coarse grass map.
// Rates are per base year (2,400 ticks), like v1's biology; the once-a-year dog pulse is scaled by YEAR_TICKS / BASE_YEAR_TICKS.
//
// Determinism: this module owns its generator, new Rng(hashSeed(seed + ':smallprey')), and never touches the sim's main stream.
// The sim only builds a SmallPrey when the smallPrey param is on, so a run with the feature off is untouched.
//
// Events (all through the host's event callback; fields are sp, x, y, a, b):
//   townFounded   sp PrairieDog, (x, y) the town's centre, a = cells in the town, b = prairie dogs in it
//   townLost      sp PrairieDog, (x, y) the old town's centre, a = cells it covered, b = the highest plague level (0..1) over those cells now
//   sylvaticPlague sp PrairieDog, (x, y) where the outbreak began, a = prairie dogs lost, b = duration in ticks. Fires when the outbreak has faded.
//   hareBoom      sp Rabbit, (x, y) the hare-weighted centre, a = valley total, b = its 10-year mean. Total passed 2x the mean.
//   hareCrash     sp Rabbit, (x, y) as above, a = valley total, b = 10-year mean. Total fell under 0.4x the mean.
//   immigrated    sp Rabbit or PrairieDog, only with openPrairie on: the rescue arrival (a = animals, b = 0).
// A town is a group of 8-connected cells (at least TOWN_MIN_CELLS) that each hold an active colony.
import type { Environment } from './env';
import type { Params } from './params';
import { hashSeed, Rng } from './rng';
import type { SimEventKind } from './sim';
import { BASE_YEAR_TICKS, SEASON_TICKS, Sp, YEAR_TICKS } from './types';
import { COARSE_N, type World } from './world';

export const CELLS = COARSE_N * COARSE_N;
/** The sim calls step() every this many ticks. */
export const STEP_TICKS = 50;
/** Metres per coarse cell is world.size / COARSE_N; take() and the snapshot index the grid the same way. */

/** Snapshot texture scale (see Snapshot.small): R = hare / hareK * HARE_FULL, G = dog / dogK * DOG_FULL, B = town * 255, A = plague * 255. */
export const SMALL_SCALE = { hareFull: 200, dogFull: 200 } as const;

// ---- catch rule: Holling type II -------------------------------------------------------------------------------------------
// take(x, y, kind, effort, rng): the local density dens = hare * PREF.hare + dog * PREF.dog (animals per cell). One attempt succeeds
// with probability  effort * A * dens / (1 + A * HANDLE * dens),  which rises with density and saturates at effort / HANDLE.
// The catch is a hare or a prairie dog in proportion to their preference-weighted shares, and removes one animal from that field.
// GAIN is the energy (0..1 of the predator's own scale) one animal is worth.
export type TakeKind = 'wolf' | 'coyote' | 'eagle' | 'hawk';
export const TAKE_KINDS: readonly TakeKind[] = ['wolf', 'coyote', 'eagle', 'hawk'];
export const PREF: Record<TakeKind, { hare: number; dog: number }> = {
  wolf: { hare: 1, dog: 0.6 }, // wolves mouse in the open; dogs dive into burrows
  coyote: { hare: 1, dog: 0.35 }, // S5: at 0.8 the coyotes camped on the towns and the prairie dogs were gone 60% of the time; 0.2 to 0.4 leaves them a refuge
  eagle: { hare: 1, dog: 0.9 }, // S7
  hawk: { hare: 0.4, dog: 0.7 }, // S7: takes leverets, dogs on the town edge
};
/** Attack rate per attempt per animal-per-cell. wolf and coyote: one attempt per tick while mousing; eagle and hawk are placeholders until S7. */
export const A: Record<TakeKind, number> = { wolf: 0.0025, coyote: 0.1, eagle: 0.02, hawk: 0.015 };
/** Handling time, in the units of 1 / effort. */
export const HANDLE: Record<TakeKind, number> = { wolf: 2, coyote: 1.5, eagle: 4, hawk: 3 };
export const GAIN: Record<TakeKind, { hare: number; dog: number }> = {
  wolf: { hare: 0.07, dog: 0.045 }, // at about 3 hares in the cell this matches the old flat trickle (metabolism x wolfSmallGame per tick)
  coyote: { hare: 0.1, dog: 0.1 }, // S5: a hare is a tenth of the coyote's energy bar, so a coyote on 1/1800 metabolism needs about 7 a valley year; at 0.25 the coyotes barely dented the hares (no coupling), at 0.04 to 0.06 they starved
  eagle: { hare: 0.4, dog: 0.25 },
  hawk: { hare: 0.2, dog: 0.15 },
};

// ---- constants of the web ---------------------------------------------------------------------------------------------------
/** A cell with fewer than this many animals is empty (a five-hundredth of a hare: low enough that a thin cell can still seed its neighbours). */
const HARE_FLOOR = 0.002;
const DOG_FLOOR = 0.02;
/** Share of a cell's hares that wander to the four neighbours each step. */
const HARE_DIFFUSE = 0.05;
/** Prairie dog spring pulse: season 0.3, once per valley year. */
const DOG_PULSE_SEASON = 0.3;
/** Per-step chance that a cell above 0.8 Kd sends founders to a neighbouring suitable cell, and how many (at most). */
const DOG_EXPAND_P = 0.1;
const DOG_FOUNDERS = 2;
/** A colony cell counts as a town cell above min(TOWN_ON, TOWN_ON_FRAC x Kd); it is lost again below half of that. */
const TOWN_ON = 3;
const TOWN_ON_FRAC = 0.6;
/** Town build rate per base year (toward 1) while a colony is there, and fade per base year once the cell is empty. */
const TOWN_BUILD = 1.0;
const TOWN_DECAY = 0.02;
/** A town is at least this many connected colony cells. */
const TOWN_MIN_CELLS = 3;
/** Plague: a town this many cells wide or more is "large" and gets the full start rate. */
const PLAGUE_LARGE_TOWN = 4;
/** A town only catches plague where a cell holds more than this share of Kd. */
const PLAGUE_START_DENSITY = 0.7;
/** Years (base) for the intensity to climb toward 1 (e-folding time), and the years it climbs before the outbreak fades. */
const PLAGUE_RISE_TAU = 0.07;
const PLAGUE_RISE_YEARS = 0.25;
/** Fade rate per base year after the climb: gone (under 0.02) in about 0.33 years, so an outbreak lasts about half a year. */
const PLAGUE_FADE = 12;
/** Mortality rate per base year at full intensity, integrated over the outbreak (0.26 intensity-years): about 88% of a cell's dogs die within a season and 96% overall. */
const PLAGUE_KILL = 12;
/** Per step, chance of passing to a neighbouring colony cell = PLAGUE_SPREAD x source intensity x (neighbour dogs / Kd). */
const PLAGUE_SPREAD = 0.4;
/** A cell must carry at least this much intensity to pass the plague on, and a neighbour at least this many dogs to catch it. */
const PLAGUE_SPREAD_MIN = 0.2;
const PLAGUE_CATCH_DOGS = 0.3;
/** Booms and crashes: window of the mean (valley years), thresholds, the minimum spacing per kind (valley years), warm-up (valley years). */
const BOOM_WINDOW_YEARS = 10;
const BOOM_RATIO = 2;
const CRASH_RATIO = 0.4;
const BOOM_SPACING_YEARS = 5;
/** Rescue: hares arrive when the valley holds fewer than RESCUE_HARE_BELOW; a dog colony once per RESCUE_DOG_YEARS base years with no town. */
const RESCUE_HARE_BELOW = 20;
const RESCUE_HARE_COUNT = 10;
const RESCUE_DOG_YEARS = 20;
/** Grass height prairie dogs keep their towns clipped to. */
const CLIP_HEIGHT = 0.12;
/** Number of starting colonies when prairiedog.initial is 0, and the minimum spacing between them (coarse cells). */
const START_COLONIES = 4;
const START_SPACING = 6;

export interface SmallPreyHost {
  event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void;
}

interface TownInfo {
  cx: number;
  cy: number;
  cells: number;
  dogs: number;
  members: number[];
  /** A cell holds more than PLAGUE_START_DENSITY x Kd and is not infected. */
  hasCandidate: boolean;
}

interface Outbreak {
  x: number;
  y: number;
  start: number;
  lost: number;
}

const DX8 = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY8 = [-1, -1, -1, 0, 0, 1, 1, 1];

/** Counters since the last drain (one row of the time series). */
export interface SmallPreySample {
  plagues: number;
  townsFounded: number;
  townsLost: number;
  booms: number;
  crashes: number;
  hareTakes: number;
  dogTakes: number;
  hareArrivals: number;
  dogArrivals: number;
}

export class SmallPrey {
  readonly rng: Rng;
  readonly hare = new Float32Array(CELLS);
  readonly dog = new Float32Array(CELLS);
  readonly town = new Float32Array(CELLS);
  readonly plague = new Float32Array(CELLS);
  /** Static per-cell data: land share, mean soil fertility, prairie dog capacity Kd (dogK x dogCap x (0.5 + 0.5 x fertility)). */
  readonly land = new Float32Array(CELLS);
  readonly fert = new Float32Array(CELLS);
  readonly kd = new Float32Array(CELLS);
  /** Grass-equivalent bonus bison get at town edges (0 unless dogGrazeBonus is on). */
  readonly grazeBonus = new Float32Array(CELLS);
  /** Cells per side, metres per cell. */
  readonly cells = COARSE_N;
  readonly cellSize: number;

  // internal state
  private readonly plagueAge = new Float32Array(CELLS);
  private readonly plagueId = new Int32Array(CELLS);
  private readonly outbreaks = new Map<number, Outbreak>();
  private nextOutbreak = 1;
  private readonly active = new Uint8Array(CELLS);
  private label = new Int16Array(CELLS);
  private prevLabel = new Int16Array(CELLS);
  private prevCount = 0;
  private prevInfo: { cx: number; cy: number; cells: number }[] = [];
  private townsReady = false;
  /** Towns now (groups of at least TOWN_MIN_CELLS colony cells), for sample(). */
  townCount = 0;
  /** Cells with plague > 0 now. */
  plagueCells = 0;
  private townInfo: TownInfo[] = [];
  private readonly tmp = new Float32Array(CELLS);
  private ema = 0;
  private emaReady = false;
  private qualityYear = -1;
  private quality = 1;
  private lastBoom = -1e9;
  private lastCrash = -1e9;
  private lastDogArrival = 0;
  private drain: SmallPreySample = { plagues: 0, townsFounded: 0, townsLost: 0, booms: 0, crashes: 0, hareTakes: 0, dogTakes: 0, hareArrivals: 0, dogArrivals: 0 };

  constructor(
    private readonly seed: number,
    private readonly p: Params,
    private readonly world: World,
    private readonly env: Environment,
    private readonly coarseGrass: Float32Array,
    private readonly coarseBrowse: Float32Array,
    private readonly veg: { grass: Float32Array },
    private readonly host: SmallPreyHost,
  ) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:smallprey`));
    this.cellSize = world.size / COARSE_N;
    const n = world.n, r = n / COARSE_N;
    const landN = new Float32Array(CELLS);
    for (let j = 0; j < n; j++) {
      const bj = Math.floor(j / r) * COARSE_N;
      for (let i = 0; i < n; i++) {
        const c = j * n + i;
        if (world.water[c]) continue;
        const k = bj + Math.floor(i / r);
        landN[k] += 1;
        this.fert[k] += world.soilBase[c];
      }
    }
    for (let k = 0; k < CELLS; k++) {
      this.land[k] = landN[k] / (r * r);
      this.fert[k] = landN[k] > 0 ? this.fert[k] / landN[k] : 0;
      this.kd[k] = p.dogK * world.dogCap[k] * (0.5 + 0.5 * this.fert[k]);
    }
    this.seedFields();
  }

  // ------------------------------------------------------------------ setup

  /** Capacity of hares in a cell right now. */
  hareCap(c: number): number {
    const food = 0.7 * clamp01(this.coarseGrass[c] / 0.5) + 0.3 * clamp01(this.coarseBrowse[c] / 0.4);
    return this.p.hareK * this.land[c] * (0.25 + 0.75 * food);
  }

  /**
   * Starting fields. Hares: rabbit.initial spread in proportion to capacity, or (0) 70% of capacity everywhere. Prairie dogs:
   * START_COLONIES colonies on well-suited ground (a seed cell at 0.9 Kd and its suitable neighbours at 0.7 Kd), or prairiedog.initial dogs spread
   * over those same colonies. All draws are from this module's own generator.
   */
  private seedFields(): void {
    const P = this.p.species;
    let capSum = 0;
    for (let c = 0; c < CELLS; c++) capSum += this.hareCap(c);
    const hareInit = P[Sp.Rabbit].initial;
    for (let c = 0; c < CELLS; c++) {
      const cap = this.hareCap(c);
      this.hare[c] = hareInit > 0 ? (capSum > 0 ? (hareInit * cap) / capSum : 0) : 0.7 * cap;
      if (hareInit <= 0 && this.hare[c] < HARE_FLOOR) this.hare[c] = 0;
    }
    // colonies: random picks among the best suited cells, kept apart
    const best: number[] = [];
    for (let c = 0; c < CELLS; c++) if (this.world.dogCap[c] >= 0.6) best.push(c);
    const seeds: number[] = [];
    for (let tries = 0; tries < 200 && seeds.length < START_COLONIES && best.length > 0; tries++) {
      const c = best[this.rng.int(best.length)];
      const cx = c % COARSE_N, cy = (c / COARSE_N) | 0;
      let ok = true;
      for (const s of seeds) {
        if (Math.max(Math.abs((s % COARSE_N) - cx), Math.abs(((s / COARSE_N) | 0) - cy)) < START_SPACING) { ok = false; break; }
      }
      if (ok) seeds.push(c);
    }
    for (const c of seeds) this.plantColony(c, 0.9, 0.7);
    const dogInit = P[Sp.PrairieDog].initial;
    if (dogInit > 0) {
      const total = this.dogTotal();
      if (total > 0) { const k = dogInit / total; for (let c = 0; c < CELLS; c++) this.dog[c] *= k; }
    }
  }

  /** A colony: the cell at `centre` x Kd and its suitable neighbours at `edge` x Kd, with towns already part-built. */
  private plantColony(c: number, centre: number, edge: number): void {
    this.dog[c] = Math.max(this.dog[c], centre * this.kd[c]);
    this.town[c] = Math.max(this.town[c], 0.5);
    const cx = c % COARSE_N, cy = (c / COARSE_N) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX8[d], ny = cy + DY8[d];
      if (nx < 0 || ny < 0 || nx >= COARSE_N || ny >= COARSE_N) continue;
      const n = ny * COARSE_N + nx;
      if (this.kd[n] <= 0) continue;
      this.dog[n] = Math.max(this.dog[n], edge * this.kd[n]);
      this.town[n] = Math.max(this.town[n], 0.3);
    }
  }

  // ------------------------------------------------------------------ lookups

  /** Coarse cell index of a world position. */
  cellOf(x: number, y: number): number {
    let i = Math.floor(x / this.cellSize), j = Math.floor(y / this.cellSize);
    if (i < 0) i = 0; else if (i >= COARSE_N) i = COARSE_N - 1;
    if (j < 0) j = 0; else if (j >= COARSE_N) j = COARSE_N - 1;
    return j * COARSE_N + i;
  }

  hareTotal(): number {
    let s = 0;
    for (let c = 0; c < CELLS; c++) s += this.hare[c];
    return s;
  }

  dogTotal(): number {
    let s = 0;
    for (let c = 0; c < CELLS; c++) s += this.dog[c];
    return s;
  }

  // ------------------------------------------------------------------ the catch rule

  /** Probability that one attempt in a cell with preference-weighted density `dens` succeeds (the Holling II curve). */
  static successChance(kind: TakeKind, dens: number, effort: number): number {
    return (effort * (A[kind] * dens)) / (1 + A[kind] * HANDLE[kind] * dens);
  }

  /**
   * A predator's catch attempt at (x, y). Returns the energy gained (0 on a miss) and removes one animal from the field it came from.
   * The rolls come from `rng` (the caller passes this module's own generator or one of its own).
   */
  take(x: number, y: number, kind: TakeKind, effort: number, rng: Rng): number {
    const c = this.cellOf(x, y);
    const H = this.hare[c] * PREF[kind].hare, D = this.dog[c] * PREF[kind].dog, dens = H + D;
    if (dens < 0.01) return 0;
    if (rng.next() >= SmallPrey.successChance(kind, dens, effort)) return 0;
    if (rng.next() * dens < H) {
      this.hare[c] = Math.max(0, this.hare[c] - 1);
      this.drain.hareTakes++;
      return GAIN[kind].hare;
    }
    this.dog[c] = Math.max(0, this.dog[c] - 1);
    this.drain.dogTakes++;
    return GAIN[kind].dog;
  }

  // ------------------------------------------------------------------ the step

  /** One step of the web. Call every STEP_TICKS ticks, after the sim has refreshed coarseGrass and coarseBrowse. */
  step(tick: number): void {
    const p = this.p;
    const yf = STEP_TICKS / BASE_YEAR_TICKS;
    const season = this.env.state.season;
    const breeding = season < 2 ? 1 : 0.15;
    this.growHares(yf, breeding, this.yearQuality(tick));
    this.diffuseHares();
    this.floorHares();
    this.stepDogs(tick, yf);
    this.trackTowns();
    this.stepPlague(tick, yf, season);
    if (p.dogClip > 0) this.clipGrass();
    if (p.dogGrazeBonus > 0) this.updateGrazeBonus();
    this.trackHares(tick);
    if (p.openPrairie > 0) this.rescues(tick);
  }

  /**
   * How good this valley year is for hares, 1 +- hareYearVar (1 when the param is 0). A fixed draw per year from a hash of the seed and the
   * year number, not from any generator, so it costs no random numbers. Growth is multiplied by it and the winter loss by (2 - it): a
   * mild year lifts the hares, a hard one cuts them, whatever the predators are doing (weather the coyotes then have to follow).
   */
  private yearQuality(tick: number): number {
    const v = this.p.hareYearVar;
    if (v <= 0) return 1;
    const y = Math.floor(tick / YEAR_TICKS);
    if (y !== this.qualityYear) {
      this.qualityYear = y;
      this.quality = 1 + v * (2 * (hashSeed(`${this.seed >>> 0}:hareyear:${y}`) / 4294967296) - 1);
    }
    return this.quality;
  }

  private growHares(yf: number, breeding: number, quality = 1): void {
    const p = this.p, h = this.hare;
    const grow = p.hareR * breeding * yf * quality, lose = p.hareWinterLoss * (1 - breeding) * yf * (2 - quality);
    for (let c = 0; c < CELLS; c++) {
      const n = h[c];
      if (n <= 0) continue;
      const K = this.hareCap(c);
      const v = n + grow * n * (1 - n / Math.max(0.1, K)) - lose * n;
      h[c] = v > 0 ? v : 0;
    }
  }

  /** A cell with under HARE_FLOOR hares is empty: no ghost populations, so the valley can in principle lose its hares. */
  private floorHares(): void {
    const h = this.hare;
    for (let c = 0; c < CELLS; c++) if (h[c] < HARE_FLOOR) h[c] = 0;
  }

  /** A share of every cell's hares walks to its four neighbours (those with land). Conserves the total exactly (up to float rounding). */
  diffuseHares(): void {
    const h = this.hare, t = this.tmp;
    t.fill(0);
    for (let c = 0; c < CELLS; c++) {
      const n = h[c];
      if (n <= 0) continue;
      const x = c % COARSE_N, y = (c / COARSE_N) | 0;
      let cnt = 0;
      const ok = [false, false, false, false];
      if (x > 0 && this.land[c - 1] > 0.05) { ok[0] = true; cnt++; }
      if (x < COARSE_N - 1 && this.land[c + 1] > 0.05) { ok[1] = true; cnt++; }
      if (y > 0 && this.land[c - COARSE_N] > 0.05) { ok[2] = true; cnt++; }
      if (y < COARSE_N - 1 && this.land[c + COARSE_N] > 0.05) { ok[3] = true; cnt++; }
      if (cnt === 0) continue;
      const out = HARE_DIFFUSE * n, each = out / cnt;
      t[c] -= out;
      if (ok[0]) t[c - 1] += each;
      if (ok[1]) t[c + 1] += each;
      if (ok[2]) t[c - COARSE_N] += each;
      if (ok[3]) t[c + COARSE_N] += each;
    }
    for (let c = 0; c < CELLS; c++) h[c] += t[c];
  }

  private townOn(c: number): number {
    return Math.min(TOWN_ON, TOWN_ON_FRAC * this.kd[c]);
  }

  private stepDogs(tick: number, yf: number): void {
    const p = this.p, dog = this.dog, kd = this.kd, town = this.town;
    const yt = this.env.yearTick(tick);
    const pulseTick = Math.round(DOG_PULSE_SEASON * SEASON_TICKS);
    const pulse = (((yt - pulseTick) % YEAR_TICKS) + YEAR_TICKS) % YEAR_TICKS < STEP_TICKS;
    const yearScale = YEAR_TICKS / BASE_YEAR_TICKS;
    for (let c = 0; c < CELLS; c++) {
      const K = kd[c];
      if (K <= 0) continue;
      let d = dog[c];
      if (pulse && d > 0) d *= Math.max(0.25, 1 + p.dogR * yearScale * (1 - d / K));
      d = d < DOG_FLOOR ? 0 : d;
      dog[c] = d;
      if (d > this.townOn(c)) town[c] += (1 - town[c]) * Math.min(1, TOWN_BUILD * yf);
      else if (d < 0.15 * K) town[c] = Math.max(0, town[c] - TOWN_DECAY * yf);
    }
    // a crowded cell sends founders to a suitable neighbour
    for (let c = 0; c < CELLS; c++) {
      const K = kd[c];
      if (K <= 0 || dog[c] <= 0.8 * K) continue;
      if (this.rng.next() >= DOG_EXPAND_P) continue;
      const x = c % COARSE_N, y = (c / COARSE_N) | 0;
      const cand: number[] = [];
      for (let d = 0; d < 8; d++) {
        const nx = x + DX8[d], ny = y + DY8[d];
        if (nx < 0 || ny < 0 || nx >= COARSE_N || ny >= COARSE_N) continue;
        const n = ny * COARSE_N + nx;
        if (kd[n] > 0 && dog[n] <= 0.8 * kd[n]) cand.push(n);
      }
      if (cand.length === 0) continue;
      const n = cand[this.rng.int(cand.length)];
      const move = Math.min(DOG_FOUNDERS, 0.4 * dog[c]);
      dog[c] -= move;
      dog[n] += move;
    }
  }

  /**
   * Group the colony cells into towns (8-connected, at least TOWN_MIN_CELLS) and emit townFounded for a group that overlaps no town of
   * the last step and townLost for a last-step town none of whose cells is still part of a town (it died out or shrank below
   * TOWN_MIN_CELLS). The first call only records.
   */
  private trackTowns(): void {
    const dog = this.dog, active = this.active, label = this.label;
    for (let c = 0; c < CELLS; c++) {
      if (this.kd[c] <= 0) { active[c] = 0; continue; }
      const on = this.townOn(c);
      if (dog[c] > on) active[c] = 1;
      else if (dog[c] < 0.5 * on) active[c] = 0;
    }
    label.fill(0);
    const info: TownInfo[] = [];
    const stack: number[] = [];
    let count = 0;
    for (let c0 = 0; c0 < CELLS; c0++) {
      if (!active[c0] || label[c0] !== 0) continue;
      // flood fill one group (labels are tentative until the size is known)
      const members: number[] = [];
      stack.length = 0;
      stack.push(c0);
      label[c0] = -1;
      while (stack.length) {
        const c = stack.pop()!;
        members.push(c);
        const x = c % COARSE_N, y = (c / COARSE_N) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = x + DX8[d], ny = y + DY8[d];
          if (nx < 0 || ny < 0 || nx >= COARSE_N || ny >= COARSE_N) continue;
          const n = ny * COARSE_N + nx;
          if (active[n] && label[n] === 0) { label[n] = -1; stack.push(n); }
        }
      }
      if (members.length < TOWN_MIN_CELLS) {
        for (const c of members) label[c] = -2; // too small to be a town; keep it out of the fill
        continue;
      }
      count++;
      let sx = 0, sy = 0, dogs = 0, cand = false;
      for (const c of members) {
        label[c] = count;
        sx += (c % COARSE_N) + 0.5;
        sy += ((c / COARSE_N) | 0) + 0.5;
        dogs += dog[c];
        if (dog[c] > PLAGUE_START_DENSITY * this.kd[c] && this.plague[c] === 0) cand = true;
      }
      info.push({ cx: (sx / members.length) * this.cellSize, cy: (sy / members.length) * this.cellSize, cells: members.length, dogs, members, hasCandidate: cand });
    }
    for (let c = 0; c < CELLS; c++) if (label[c] < 0) label[c] = 0;

    if (this.townsReady) {
      for (let k = 1; k <= count; k++) {
        let overlap = false;
        for (let c = 0; c < CELLS && !overlap; c++) if (label[c] === k && this.prevLabel[c] > 0) overlap = true;
        if (!overlap) {
          const t = info[k - 1];
          this.host.event('townFounded', Sp.PrairieDog, t.cx, t.cy, t.cells, Math.round(t.dogs));
          this.drain.townsFounded++;
        }
      }
      for (let j = 1; j <= this.prevCount; j++) {
        let still = false, peak = 0;
        for (let c = 0; c < CELLS; c++) {
          if (this.prevLabel[c] !== j) continue;
          if (label[c] > 0) still = true;
          if (this.plague[c] > peak) peak = this.plague[c];
        }
        if (!still) {
          const t = this.prevInfo[j - 1];
          this.host.event('townLost', Sp.PrairieDog, t.cx, t.cy, t.cells, Math.round(peak * 100) / 100);
          this.drain.townsLost++;
        }
      }
    }
    // keep this step's grouping for the next comparison
    const swap = this.prevLabel;
    this.prevLabel = this.label;
    this.label = swap;
    this.prevCount = count;
    this.prevInfo = info.map((t) => ({ cx: t.cx, cy: t.cy, cells: t.cells }));
    this.townInfo = info;
    this.townsReady = true;
    this.townCount = count;
  }

  private stepPlague(tick: number, yf: number, season: number): void {
    const dog = this.dog, plague = this.plague, age = this.plagueAge, kd = this.kd;
    // 1. the running outbreaks climb, then fade, and kill as they go
    const rise = Math.min(1, yf / PLAGUE_RISE_TAU), fade = Math.exp(-PLAGUE_FADE * yf);
    for (let c = 0; c < CELLS; c++) {
      if (plague[c] <= 0) continue;
      age[c] += yf;
      if (age[c] < PLAGUE_RISE_YEARS) plague[c] += (1 - plague[c]) * rise;
      else plague[c] *= fade;
      if (dog[c] > 0) {
        const loss = dog[c] * (1 - Math.exp(-PLAGUE_KILL * plague[c] * yf));
        dog[c] -= loss;
        const ob = this.outbreaks.get(this.plagueId[c]);
        if (ob) ob.lost += loss;
        if (dog[c] < DOG_FLOOR) dog[c] = 0;
      }
      if (age[c] >= PLAGUE_RISE_YEARS && plague[c] < 0.02) {
        plague[c] = 0;
        age[c] = 0;
        this.plagueId[c] = 0;
      }
    }
    // 2. spread to neighbouring colony cells, in proportion to the source's intensity and the neighbour's crowding
    const infect: number[] = [];
    const infectId: number[] = [];
    for (let c = 0; c < CELLS; c++) {
      if (plague[c] < PLAGUE_SPREAD_MIN) continue;
      const x = c % COARSE_N, y = (c / COARSE_N) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX8[d], ny = y + DY8[d];
        if (nx < 0 || ny < 0 || nx >= COARSE_N || ny >= COARSE_N) continue;
        const n = ny * COARSE_N + nx;
        if (kd[n] <= 0 || plague[n] > 0 || dog[n] < PLAGUE_CATCH_DOGS) continue;
        if (this.rng.next() < PLAGUE_SPREAD * plague[c] * Math.min(1, dog[n] / kd[n]) && infect.indexOf(n) < 0) {
          infect.push(n);
          infectId.push(this.plagueId[c]);
        }
      }
    }
    for (let q = 0; q < infect.length; q++) {
      plague[infect[q]] = 0.05;
      age[infect[q]] = 0;
      this.plagueId[infect[q]] = infectId[q];
    }
    // 3. a new outbreak: only in summer, in a town with a crowded cell; larger towns are likelier (plagueRate per base year for a large town)
    if (season >= 1 && season < 2 && this.p.plagueRate > 0) {
      const perStep = this.p.plagueRate * yf * 4; // the summer window is a quarter of the year
      for (const t of this.townInfo) {
        if (!t.hasCandidate) continue;
        if (this.rng.next() >= perStep * Math.min(1, t.cells / PLAGUE_LARGE_TOWN)) continue;
        this.startPlague(tick, t);
      }
    }
    // 4. outbreaks with no infected cell left are over
    let cells = 0;
    const alive = new Set<number>();
    for (let c = 0; c < CELLS; c++) if (plague[c] > 0) { cells++; alive.add(this.plagueId[c]); }
    this.plagueCells = cells;
    for (const [id, ob] of this.outbreaks) {
      if (alive.has(id)) continue;
      this.outbreaks.delete(id);
      this.host.event('sylvaticPlague', Sp.PrairieDog, ob.x, ob.y, Math.round(ob.lost), tick - ob.start);
      this.drain.plagues++;
    }
  }

  /** Begin an outbreak in the most crowded un-infected cell of a town (one that holds more than PLAGUE_START_DENSITY x Kd). */
  private startPlague(tick: number, t: TownInfo): void {
    let target = -1, bestFill = PLAGUE_START_DENSITY;
    for (const c of t.members) {
      if (this.plague[c] > 0) continue;
      const fill = this.dog[c] / Math.max(1e-6, this.kd[c]);
      if (fill > bestFill) { bestFill = fill; target = c; }
    }
    if (target < 0) return;
    const id = this.nextOutbreak++;
    this.plague[target] = 0.05;
    this.plagueAge[target] = 0;
    this.plagueId[target] = id;
    this.outbreaks.set(id, { x: ((target % COARSE_N) + 0.5) * this.cellSize, y: (((target / COARSE_N) | 0) + 0.5) * this.cellSize, start: tick, lost: 0 });
  }

  /** Prairie dogs keep the grass in their towns short: clip the fine cells of a colony cell toward CLIP_HEIGHT. */
  private clipGrass(): void {
    const g = this.veg.grass, n = this.world.n, r = n / COARSE_N;
    for (let c = 0; c < CELLS; c++) {
      const K = this.kd[c];
      if (K <= 0 || this.town[c] < 0.2 || this.dog[c] <= 0) continue;
      const k = this.p.dogClip * this.town[c] * Math.min(1, this.dog[c] / (TOWN_ON_FRAC * K));
      const x0 = (c % COARSE_N) * r, y0 = ((c / COARSE_N) | 0) * r;
      for (let j = y0; j < y0 + r; j++) {
        for (let i = x0; i < x0 + r; i++) {
          const q = j * n + i;
          if (g[q] > CLIP_HEIGHT) g[q] -= (g[q] - CLIP_HEIGHT) * k;
        }
      }
    }
  }

  /** The edge of a town (a cell beside the town but not deep in it) grazes best for bison: bonus = dogGrazeBonus x neighbouring town x (1 - own town). */
  private updateGrazeBonus(): void {
    const b = this.grazeBonus, town = this.town, bonus = this.p.dogGrazeBonus;
    for (let c = 0; c < CELLS; c++) {
      const x = c % COARSE_N, y = (c / COARSE_N) | 0;
      let nb = 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX8[d], ny = y + DY8[d];
        if (nx < 0 || ny < 0 || nx >= COARSE_N || ny >= COARSE_N) continue;
        const t = town[ny * COARSE_N + nx];
        if (t > nb) nb = t;
      }
      b[c] = this.land[c] > 0.5 ? bonus * nb * (1 - town[c]) : 0;
    }
  }

  /** Track the valley's hare total against its 10-year mean; fire hareBoom and hareCrash (each at most once per 5 valley years). */
  private trackHares(tick: number): void {
    const total = this.hareTotal();
    if (!this.emaReady) { this.ema = total; this.emaReady = true; return; }
    this.ema += (total - this.ema) * (STEP_TICKS / (BOOM_WINDOW_YEARS * YEAR_TICKS));
    if (tick < BOOM_WINDOW_YEARS * YEAR_TICKS) return;
    const spacing = BOOM_SPACING_YEARS * YEAR_TICKS;
    const boom = total > BOOM_RATIO * this.ema && tick - this.lastBoom >= spacing;
    const crash = total < CRASH_RATIO * this.ema && tick - this.lastCrash >= spacing;
    if (!boom && !crash) return;
    let sx = 0, sy = 0;
    for (let c = 0; c < CELLS; c++) {
      sx += this.hare[c] * ((c % COARSE_N) + 0.5);
      sy += this.hare[c] * (((c / COARSE_N) | 0) + 0.5);
    }
    const x = total > 0 ? (sx / total) * this.cellSize : this.world.size / 2, y = total > 0 ? (sy / total) * this.cellSize : this.world.size / 2;
    if (boom) { this.lastBoom = tick; this.drain.booms++; this.host.event('hareBoom', Sp.Rabbit, x, y, Math.round(total), Math.round(this.ema)); }
    if (crash) { this.lastCrash = tick; this.drain.crashes++; this.host.event('hareCrash', Sp.Rabbit, x, y, Math.round(total), Math.round(this.ema)); }
  }

  /** Open prairie (S1) rescues: 10 hares at an edge cell when the valley holds fewer than 20; a dog colony once per 20 base years with no town. */
  private rescues(tick: number): void {
    const corr = this.world.corridors, r = this.rng;
    if (this.hareTotal() < RESCUE_HARE_BELOW && corr.length >= 4) {
      const k = r.int(corr.length / 4);
      // walk inward from the corridor to the first cell with enough land
      let x = corr[k * 4], y = corr[k * 4 + 1];
      const nx = corr[k * 4 + 2], ny = corr[k * 4 + 3];
      let c = this.cellOf(x, y);
      for (let s = 0; s < 6 && this.land[c] < 0.5; s++) { x += nx * this.cellSize; y += ny * this.cellSize; c = this.cellOf(x, y); }
      this.hare[c] += RESCUE_HARE_COUNT;
      this.drain.hareArrivals += RESCUE_HARE_COUNT;
      this.host.event('immigrated', Sp.Rabbit, x, y, RESCUE_HARE_COUNT, 0);
    }
    if (this.townCount === 0 && tick - this.lastDogArrival >= RESCUE_DOG_YEARS * BASE_YEAR_TICKS) {
      const edge: number[] = [], any: number[] = [];
      for (let c = 0; c < CELLS; c++) {
        if (this.world.dogCap[c] < 0.5) continue;
        const cx = c % COARSE_N, cy = (c / COARSE_N) | 0;
        // room for a town: at least two suitable neighbours
        let room = 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DX8[d], ny = cy + DY8[d];
          if (nx >= 0 && ny >= 0 && nx < COARSE_N && ny < COARSE_N && this.kd[ny * COARSE_N + nx] > 0) room++;
        }
        if (room < 2) continue;
        any.push(c);
        if (Math.min(cx, cy, COARSE_N - 1 - cx, COARSE_N - 1 - cy) <= 5) edge.push(c);
      }
      const pool = edge.length > 0 ? edge : any;
      this.lastDogArrival = tick;
      if (pool.length === 0) return;
      const c = pool[r.int(pool.length)];
      const before = this.dogTotal();
      this.plantColony(c, 1, 0.75);
      const added = Math.round(this.dogTotal() - before);
      this.drain.dogArrivals += added;
      this.host.event('immigrated', Sp.PrairieDog, ((c % COARSE_N) + 0.5) * this.cellSize, (((c / COARSE_N) | 0) + 0.5) * this.cellSize, added, 0);
    }
  }

  // ------------------------------------------------------------------ god tools

  /** Add `count` animals of species 4 (jackrabbit) or 7 (prairie dog) around (x, y), or at a random place. Returns how many were placed. */
  introduce(sp: number, count: number, x?: number, y?: number): number {
    const isDog = sp === Sp.PrairieDog;
    let c: number;
    if (x !== undefined && y !== undefined) c = this.cellOf(x, y);
    else if (isDog) {
      const cand: number[] = [];
      for (let k = 0; k < CELLS; k++) if (this.kd[k] > 0) cand.push(k);
      if (cand.length === 0) return 0;
      c = cand[this.rng.int(cand.length)];
    } else {
      const cand: number[] = [];
      for (let k = 0; k < CELLS; k++) if (this.land[k] > 0.5) cand.push(k);
      c = cand.length ? cand[this.rng.int(cand.length)] : this.cellOf(this.world.size / 2, this.world.size / 2);
    }
    // the cell and its eight neighbours that can hold them, the centre taking a double share
    const cx = c % COARSE_N, cy = (c / COARSE_N) | 0;
    const cells: number[] = [], w: number[] = [];
    let wsum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COARSE_N || ny >= COARSE_N) continue;
        const n = ny * COARSE_N + nx;
        if (isDog ? this.kd[n] <= 0 : this.land[n] < 0.3) continue;
        const wt = dx === 0 && dy === 0 ? 2 : 1;
        cells.push(n); w.push(wt); wsum += wt;
      }
    }
    if (cells.length === 0) return 0;
    const field = isDog ? this.dog : this.hare;
    for (let q = 0; q < cells.length; q++) field[cells[q]] += (count * w[q]) / wsum;
    return count;
  }

  /** Remove a fraction of a field species. Returns the animals removed. */
  cull(sp: number, fraction: number): number {
    const f = clamp01(fraction);
    const field = sp === Sp.PrairieDog ? this.dog : this.hare;
    let n = 0;
    for (let c = 0; c < CELLS; c++) { n += field[c] * f; field[c] *= 1 - f; if (field[c] < (sp === Sp.PrairieDog ? DOG_FLOOR : HARE_FLOOR)) field[c] = 0; }
    return n;
  }

  /** Remove a field species altogether. Returns the animals removed. */
  remove(sp: number): number {
    const field = sp === Sp.PrairieDog ? this.dog : this.hare;
    let n = 0;
    for (let c = 0; c < CELLS; c++) { n += field[c]; field[c] = 0; }
    if (sp === Sp.PrairieDog) { this.plague.fill(0); this.plagueAge.fill(0); this.plagueId.fill(0); }
    return n;
  }

  /** The god tool "plague" on prairie dogs: seed sylvatic plague in a fraction of the colony cells. Returns the cells infected. */
  seedPlague(tick: number, fraction: number): number {
    const cand: number[] = [];
    for (let c = 0; c < CELLS; c++) if (this.dog[c] > 0.3 && this.plague[c] === 0) cand.push(c);
    let n = 0;
    const want = Math.max(cand.length > 0 ? 1 : 0, Math.round(clamp01(fraction) * cand.length));
    for (let q = 0; q < want; q++) {
      const c = cand.splice(this.rng.int(cand.length), 1)[0];
      const id = this.nextOutbreak++;
      this.plague[c] = 0.05;
      this.plagueAge[c] = 0;
      this.plagueId[c] = id;
      this.outbreaks.set(id, { x: ((c % COARSE_N) + 0.5) * this.cellSize, y: (((c / COARSE_N) | 0) + 0.5) * this.cellSize, start: tick, lost: 0 });
      n++;
    }
    return n;
  }

  // ------------------------------------------------------------------ output

  /** The snapshot texture: COARSE_N x COARSE_N RGBA bytes, scaled as in SMALL_SCALE. */
  fillTexture(out: Uint8Array): void {
    const hk = Math.max(1e-6, this.p.hareK), dk = Math.max(1e-6, this.p.dogK);
    for (let c = 0, o = 0; c < CELLS; c++, o += 4) {
      out[o] = byte((this.hare[c] / hk) * SMALL_SCALE.hareFull);
      out[o + 1] = byte((this.dog[c] / dk) * SMALL_SCALE.dogFull);
      out[o + 2] = byte(this.town[c] * 255);
      out[o + 3] = byte(this.plague[c] * 255);
    }
  }

  /** Counters since the last drain (and reset them). */
  drainSample(): SmallPreySample {
    const d = this.drain;
    this.drain = { plagues: 0, townsFounded: 0, townsLost: 0, booms: 0, crashes: 0, hareTakes: 0, dogTakes: 0, hareArrivals: 0, dogArrivals: 0 };
    return d;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function byte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}
