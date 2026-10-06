// Grasshopper outbreaks (V2-PLAN.md S12): a density field on the 32 x 32 coarse grid (16 m cells, the same indexing as Sim.coarseGrass).
//
// d is the grasshopper density of a cell relative to a severe outbreak: 0 none, about 0.05 to 0.1 in an ordinary summer, up to the cell's
// capacity (0.45 to 1, higher where the grass is good) in a surge. The rate is a valley-year rate (a calendarScale-2 year is shorter in ticks
// but has the same summer), so outbreaks do not depend on the calendar.
//
// Growth runs in the summer window (season 0.5 to 2.3) at r = hopperR x (dryHot - hopperCrit), logistic toward the cell's capacity:
//   dryHot = hot x (1 - rain suppression) (+ 0.25 in a drought), with hot = clamp((warmth - 0.4) / 0.45) and the suppression 0 in a drought and
//   hopperRain x clamp(rain x 2) otherwise, plus a fixed draw per year of +-hopperYear (egg and nymph survival). Hot, dry weather pushes r above 0 (a surge); a rainy summer pushes it far below (a fungal die-off).
// Outside the window the adults die back at hopperDie per valley year, leaving a small carry-over (the eggs); every cell is topped back up to a
// small floor in the window (hatch from eggs and drift from the prairie), so a valley that crashed can surge again. A share walks to the
// neighbouring cells each step, so an outbreak spreads. Where they are thick they strip grass (and browse, half as hard): each step the
// grass of the fine cells in the coarse cell is cut by hopperEat x d x (step in valley years).
//
// Feeding: coyotes mousing, ravens grazing and hawks stooping can feed on them (see feed() and take()). Their intake does not dent the field
// (a coyote eats a few thousand a day out of millions), it is only counted.
//
// Events: grasshopperOutbreak, sp -1, (x, y) the density-weighted centre, a = cells above a quarter of a surge (d > 0.25), b = the valley mean density
// (0..1, two places). Fires once when the valley mean crosses hopperOutbreak upward; it re-arms when the mean falls below half of it.
//
// Determinism: the module owns a generator, new Rng(hashSeed(seed + ':hoppers')), used only for the hawk's stoop rolls and the outbreak
// centre jitter. It never touches the sim's main stream, and the sim only builds a Hoppers object when params.grasshoppers is on.
import type { Environment } from './env';
import type { Params } from './params';
import { hashSeed, Rng } from './rng';
import type { SimEventKind } from './sim';
import { YEAR_TICKS } from './types';
import { COARSE_N, type World } from './world';

export const HOP_CELLS = COARSE_N * COARSE_N;
/** The sim calls step() every this many ticks. */
export const HOP_STEP = 50;
export const HOP_SUMMER_START = 0.5;
export const HOP_SUMMER_END = 2.3;
/** Share of a cell's grasshoppers that walks to its four neighbours each step. */
const HOP_DIFFUSE = 0.06;
/** Capacity of a cell: this share even on bare ground, the rest from its grass (full at coarse grass 0.3). */
const CAP_MIN = 0.45;
const CAP_GRASS_FULL = 0.3;
/** A drought adds this much to the dry-heat index (the hottest, driest summers breed the most). */
const DROUGHT_BONUS = 0.25;
/** Hawk stoop on a grasshopper cell: attack rate, handling time, energy per catch. */
const HAWK_A = 1.2;
const HAWK_HANDLE = 2.5;
const HAWK_GAIN = 0.15;

export type HopFeeder = 'coyote' | 'raven' | 'hawk';
export const HOP_FEEDERS: readonly HopFeeder[] = ['coyote', 'raven', 'hawk'];

export interface HoppersHost {
  event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void;
}

/** Counters since the last drain (one row of the time series). */
export interface HoppersSample {
  outbreaks: number;
  /** Grass removed, in units of mean grass over the valley's land. */
  eaten: number;
  /** Energy fed to each kind of predator (HOP_FEEDERS order). */
  fed: number[];
}

const emptyDrain = (): HoppersSample => ({ outbreaks: 0, eaten: 0, fed: new Array(HOP_FEEDERS.length).fill(0) });

export class Hoppers {
  readonly rng: Rng;
  /** Density per coarse cell, 0..1 (see the header). */
  readonly d = new Float32Array(HOP_CELLS);
  /** Land share of each coarse cell (0 over open water). */
  readonly land = new Float32Array(HOP_CELLS);
  readonly cellSize: number;
  private readonly tmp = new Float32Array(HOP_CELLS);
  private armed = true;
  private qualityYear = -1;
  private quality = 0.5;
  private landCells = 0;
  private drain: HoppersSample = emptyDrain();

  constructor(
    private readonly seed: number,
    private readonly p: Params,
    private readonly world: World,
    private readonly env: Environment,
    private readonly coarseGrass: Float32Array,
    private readonly veg: { grass: Float32Array; browse: Float32Array },
    private readonly host: HoppersHost,
  ) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:hoppers`));
    this.cellSize = world.size / COARSE_N;
    const n = world.n, r = n / COARSE_N;
    const landN = new Float32Array(HOP_CELLS);
    let land = 0;
    for (let j = 0; j < n; j++) {
      const bj = Math.floor(j / r) * COARSE_N;
      for (let i = 0; i < n; i++) {
        if (world.water[j * n + i]) continue;
        landN[bj + Math.floor(i / r)] += 1;
        land++;
      }
    }
    this.landCells = land;
    for (let k = 0; k < HOP_CELLS; k++) {
      this.land[k] = landN[k] / (r * r);
      this.d[k] = 0.1 * this.land[k];
    }
  }

  /** Index of the coarse cell holding (x, y). */
  cellOf(x: number, y: number): number {
    let i = Math.floor(x / this.cellSize), j = Math.floor(y / this.cellSize);
    if (i < 0) i = 0; else if (i >= COARSE_N) i = COARSE_N - 1;
    if (j < 0) j = 0; else if (j >= COARSE_N) j = COARSE_N - 1;
    return j * COARSE_N + i;
  }

  /** Density 0..1 at a point. */
  densAt(x: number, y: number): number {
    return this.d[this.cellOf(x, y)];
  }

  /** Sum of the cell densities (the "grasshopper total" of the samples). */
  total(): number {
    let s = 0;
    for (let k = 0; k < HOP_CELLS; k++) s += this.d[k];
    return s;
  }

  /** Mean density over the cells that have land, weighted by land share. */
  meanDensity(): number {
    let s = 0, w = 0;
    for (let k = 0; k < HOP_CELLS; k++) { s += this.d[k]; w += this.land[k]; }
    return w > 0 ? s / w : 0;
  }

  maxDensity(): number {
    let m = 0;
    for (let k = 0; k < HOP_CELLS; k++) if (this.d[k] > m) m = this.d[k];
    return m;
  }

  /** Cell capacity right now. */
  private cap(k: number): number {
    const g = this.coarseGrass[k] / CAP_GRASS_FULL;
    return this.land[k] * (CAP_MIN + (1 - CAP_MIN) * (g > 1 ? 1 : g < 0 ? 0 : g));
  }

  /** Growth rate per valley year for the weather right now (negative when it is cool or wet). */
  growthRate(tick = this.env.state.tick): number {
    const s = this.env.state, p = this.p;
    const hot = Math.max(0, Math.min(1, (s.warmth - 0.4) / 0.45));
    const wet = Math.max(0, Math.min(1, s.rain * 2));
    const drought = this.env.droughtTicks > 0;
    const supp = drought ? 0 : p.hopperRain * wet;
    return p.hopperR * (hot * (1 - supp) + (drought ? DROUGHT_BONUS : 0) + p.hopperYear * (2 * this.yearQuality(tick) - 1) - p.hopperCrit);
  }

  /**
   * How good this valley year is for the eggs and the nymphs (parasites, the cold snap in the spring), 0..1. A fixed draw per year from a hash of
   * the seed and the year number, not from any generator, so it costs no random numbers. Most summers have no rain at all in this calendar, so the
   * weather alone cannot tell a surge year from an ordinary one.
   */
  private yearQuality(tick: number): number {
    const y = Math.floor(tick / YEAR_TICKS);
    if (y !== this.qualityYear) {
      this.qualityYear = y;
      this.quality = hashSeed(`${this.seed >>> 0}:hopyear:${y}`) / 4294967296;
    }
    return this.quality;
  }

  // ------------------------------------------------------------------ the step

  /** One step. Call every HOP_STEP ticks, right after the sim refreshes the coarse grass map. */
  step(tick: number): void {
    const p = this.p, d = this.d;
    const yv = HOP_STEP / YEAR_TICKS;
    const season = this.env.state.season;
    const summer = season >= HOP_SUMMER_START && season < HOP_SUMMER_END;
    if (summer) {
      const r = this.growthRate(tick);
      const floor = p.hopperSeed;
      for (let k = 0; k < HOP_CELLS; k++) {
        const K = this.cap(k);
        if (K <= 0) { d[k] = 0; continue; }
        let v = d[k];
        v += v * r * yv * (1 - v / K);
        if (v < floor * this.land[k]) v = floor * this.land[k];
        if (v > K) v = K;
        d[k] = v;
      }
    } else {
      const keep = Math.exp(-p.hopperDie * yv);
      for (let k = 0; k < HOP_CELLS; k++) d[k] *= keep;
    }
    this.diffuse();
    this.eat(yv);
    this.track();
  }

  /** A share of every cell's grasshoppers walks to its four neighbours that have land (the total is conserved). */
  private diffuse(): void {
    const d = this.d, t = this.tmp, N = COARSE_N;
    t.fill(0);
    for (let c = 0; c < HOP_CELLS; c++) {
      const n = d[c];
      if (n <= 0) continue;
      const x = c % N, y = (c / N) | 0;
      let cnt = 0;
      const ok = [false, false, false, false];
      if (x > 0 && this.land[c - 1] > 0.05) { ok[0] = true; cnt++; }
      if (x < N - 1 && this.land[c + 1] > 0.05) { ok[1] = true; cnt++; }
      if (y > 0 && this.land[c - N] > 0.05) { ok[2] = true; cnt++; }
      if (y < N - 1 && this.land[c + N] > 0.05) { ok[3] = true; cnt++; }
      if (cnt === 0) continue;
      const out = HOP_DIFFUSE * n, each = out / cnt;
      t[c] -= out;
      if (ok[0]) t[c - 1] += each;
      if (ok[1]) t[c + 1] += each;
      if (ok[2]) t[c - N] += each;
      if (ok[3]) t[c + N] += each;
    }
    for (let c = 0; c < HOP_CELLS; c++) {
      const v = d[c] + t[c];
      d[c] = v > 0 ? v : 0;
    }
  }

  /** Where they are thick they strip the grass (browse half as hard). */
  private eat(yv: number): void {
    const p = this.p, d = this.d, g = this.veg.grass, b = this.veg.browse, wat = this.world.water;
    const n = this.world.n, r = n / COARSE_N;
    let eaten = 0;
    for (let c = 0; c < HOP_CELLS; c++) {
      const e = p.hopperEat * d[c] * yv;
      if (e < 0.0005) continue;
      const f = e > 0.5 ? 0.5 : e;
      const x0 = (c % COARSE_N) * r, y0 = ((c / COARSE_N) | 0) * r;
      for (let j = y0; j < y0 + r; j++) {
        for (let i = x0; i < x0 + r; i++) {
          const q = j * n + i;
          if (wat[q]) continue;
          const cut = g[q] * f;
          g[q] -= cut;
          b[q] -= b[q] * f * 0.5;
          eaten += cut;
        }
      }
    }
    this.drain.eaten += eaten / Math.max(1, this.landCells);
  }

  /** Fire grasshopperOutbreak when the valley mean crosses the threshold from below. */
  private track(): void {
    const m = this.meanDensity(), thr = this.p.hopperOutbreak;
    if (this.armed && m >= thr) {
      this.armed = false;
      let sx = 0, sy = 0, w = 0, big = 0;
      for (let c = 0; c < HOP_CELLS; c++) {
        const v = this.d[c];
        sx += v * ((c % COARSE_N) + 0.5);
        sy += v * (((c / COARSE_N) | 0) + 0.5);
        w += v;
        if (v > 0.25) big++;
      }
      const x = w > 0 ? (sx / w) * this.cellSize : this.world.size / 2, y = w > 0 ? (sy / w) * this.cellSize : this.world.size / 2;
      this.drain.outbreaks++;
      this.host.event('grasshopperOutbreak', -1, x, y, big, Math.round(m * 100) / 100);
    } else if (!this.armed && m < 0.5 * thr) this.armed = true;
  }

  // ------------------------------------------------------------------ feeding

  /**
   * Energy a continuous feeder gains this tick at (x, y): metabolism x hopperFeed(kind) x density. A coyote counts only while it is mousing,
   * a raven while it is foraging in the grass (the sim calls this from those states). The intake is tallied.
   */
  feed(x: number, y: number, kind: 'coyote' | 'raven', metabolism: number): number {
    const dens = this.d[this.cellOf(x, y)];
    if (dens < 0.02) return 0;
    const g = metabolism * (kind === 'coyote' ? this.p.hopperCoyote : this.p.hopperRaven) * dens;
    this.drain.fed[kind === 'coyote' ? 0 : 1] += g;
    return g;
  }

  /** A hawk's stoop on a grasshopper cell: the Holling type II catch rule; returns the energy gained (0 on a miss). */
  take(x: number, y: number, effort: number): number {
    const dens = this.d[this.cellOf(x, y)] * this.p.hopperHawk;
    if (dens < 0.01) return 0;
    const ch = (effort * HAWK_A * dens) / (1 + HAWK_A * HAWK_HANDLE * dens);
    if (this.rng.next() >= ch) return 0;
    this.drain.fed[2] += HAWK_GAIN;
    return HAWK_GAIN;
  }

  // ------------------------------------------------------------------ output

  /** The snapshot texture: COARSE_N x COARSE_N bytes, row-major by y then x, byte = density x 255 (clamped). */
  fillTexture(out: Uint8Array): void {
    for (let c = 0; c < HOP_CELLS; c++) {
      const v = Math.round(this.d[c] * 255);
      out[c] = v > 255 ? 255 : v;
    }
  }

  /** Counters since the last drain (and reset them). */
  drainSample(): HoppersSample {
    const d = this.drain;
    this.drain = emptyDrain();
    return d;
  }

  /** The god-tool style knock-back: a fraction of the grasshoppers die (tests, tools). */
  cull(fraction: number): void {
    const k = 1 - Math.max(0, Math.min(1, fraction));
    for (let c = 0; c < HOP_CELLS; c++) this.d[c] *= k;
  }
}
