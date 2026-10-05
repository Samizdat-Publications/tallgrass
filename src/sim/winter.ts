// Winter (V2-PLAN.md S11): a snow depth field on the 32 x 32 coarse grid (16 m cells, the same indexing as Sim.coarseGrass).
//
// Snow falls in episodes during the winter window (season 2.9 to 4, thinning out to 0.3 of the next spring) and on any natural
// snow day. The wind drifts it downwind: sheltered hollows (coarse cells lower than their neighbours) keep their snow and take
// the drift, exposed ridges are scoured. Warmth melts it. Each winter may be a hard one, and a share of the snowfalls are blizzards.
//
// Depth is 0..1 (1 = deep). It slows and tires animals and covers the food (the sim applies the effects, see sim.ts):
//   pronghorn grazing x (1 - snowGrazePronghorn x depth)   bison and mule deer x (1 - snowGrazeBison x depth)
//   movement cost x (1 + snowMove x depth)                 wolf kill chance x (1 + snowKill x depth)
//
// Determinism: the module owns a generator seeded from `${seed}:winter`. It never touches the main sim stream, the environment
// stream or any fork, and the sim only builds a Winter object when params.snowDepth > 0. Everything is timed against the season
// length (SEASON_TICKS), so a shorter calendar gives the same winter in fewer ticks.
import { Environment } from './env';
import { Params } from './params';
import { hashSeed, Rng } from './rng';
import { SEASON_TICKS, Weather } from './types';
import { COARSE_N, type World } from './world';

export const SNOW_CELLS = COARSE_N * COARSE_N;
/** The sim steps the snow every this many ticks. */
export const WINTER_STEP = 10;
/** Season at which winter snowfalls begin (late autumn). */
export const WINTER_START = 2.9;
/** Metres a cell must sit below the mean of its neighbours to count as a full hollow (hollow = 1). */
export const HOLLOW_SCALE = 2;
/** The valley bowl puts the median cell a little below its neighbours' mean; this much is not counted as a hollow. */
const HOLLOW_BIAS = 0.3;
/** Warmth below which nothing melts. */
const MELT_WARMTH = 0.14;
/** A hard winter: more snowfalls, deeper ones, and slower melt. */
const HARD_STORMS = 1.8;
const HARD_FALL = 1.4;
const HARD_MELT = 0.6;

export interface WinterEvents {
  event(kind: 'blizzard' | 'hardWinter', sp: number, x: number, y: number, a: number, b: number): void;
}

export class Winter {
  readonly rng: Rng;
  /** Snow depth per coarse cell, 0..1. */
  readonly depth = new Float32Array(SNOW_CELLS);
  /** Per coarse cell, -1 (exposed ridge) .. 1 (sheltered hollow): how much lower the cell sits than its neighbours. */
  readonly hollow = new Float32Array(SNOW_CELLS);
  private tmp = new Float32Array(SNOW_CELLS);
  readonly cellSize: number;
  /** This winter is a hard one. */
  hard = false;
  /** A blizzard is blowing. */
  blizzard = false;
  private prevSeason = -1;
  private left = 0;
  private total = 1;
  private intensity = 0;
  private cBlizzards = 0;
  private cHard = 0;
  private peakMean = 0;

  constructor(seed: number, private world: World, private p: Params, private env: Environment, private cb: WinterEvents) {
    this.rng = new Rng(hashSeed(`${seed}:winter`));
    this.cellSize = world.size / COARSE_N;
    this.buildHollows();
  }

  /** Coarse elevation (mean of the cell's height samples), then how far each cell sits below the mean of its 8 neighbours. */
  private buildHollows(): void {
    const w = this.world, N = COARSE_N, r = w.n / N, hn = w.hn;
    const elev = new Float32Array(SNOW_CELLS);
    for (let cj = 0; cj < N; cj++) {
      for (let ci = 0; ci < N; ci++) {
        let s = 0;
        for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) s += w.height[(cj * r + j) * hn + ci * r + i];
        elev[cj * N + ci] = s / (r * r);
      }
    }
    for (let cj = 0; cj < N; cj++) {
      for (let ci = 0; ci < N; ci++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const x = ci + di, y = cj + dj;
            if (x < 0 || y < 0 || x >= N || y >= N) continue;
            s += elev[y * N + x];
            n++;
          }
        }
        const lap = s / n - elev[cj * N + ci];
        const h = (lap - HOLLOW_BIAS) / HOLLOW_SCALE;
        this.hollow[cj * N + ci] = h < -1 ? -1 : h > 1 ? 1 : h;
      }
    }
  }

  /** Index of the coarse cell holding (x, y). */
  cellOf(x: number, y: number): number {
    const N = COARSE_N, cs = this.cellSize;
    let i = (x / cs) | 0, j = (y / cs) | 0;
    if (i < 0) i = 0; else if (i >= N) i = N - 1;
    if (j < 0) j = 0; else if (j >= N) j = N - 1;
    return j * N + i;
  }

  /** Snow depth 0..1 at a point. */
  at(x: number, y: number): number {
    return this.depth[this.cellOf(x, y)];
  }

  meanDepth(): number {
    let s = 0;
    for (let k = 0; k < SNOW_CELLS; k++) s += this.depth[k];
    return s / SNOW_CELLS;
  }

  maxDepth(): number {
    let m = 0;
    for (let k = 0; k < SNOW_CELLS; k++) if (this.depth[k] > m) m = this.depth[k];
    return m;
  }

  /** Blizzards and hard winters begun, and the highest mean depth seen, since the last call. */
  drainSample(): { blizzards: number; hardWinters: number; peak: number } {
    const out = { blizzards: this.cBlizzards, hardWinters: this.cHard, peak: Math.max(this.peakMean, this.meanDepth()) };
    this.cBlizzards = 0;
    this.cHard = 0;
    this.peakMean = 0;
    return out;
  }

  /** Bytes for the snapshot: depth 0..1 as 0..255, COARSE_N x COARSE_N, row-major by y then x. */
  fillTexture(out: Uint8Array): void {
    for (let k = 0; k < SNOW_CELLS; k++) {
      const v = Math.round(this.depth[k] * 255);
      out[k] = v > 255 ? 255 : v;
    }
  }

  /**
   * Advance WINTER_STEP ticks (the sim calls this when tick % WINTER_STEP === 0, after the environment has updated).
   * Draws only from the module's own generator, and only while a snowfall could start.
   */
  step(): void {
    const env = this.env, s = env.state, p = this.p, dt = WINTER_STEP;
    const season = s.season;
    if (this.prevSeason >= 0 && this.prevSeason < WINTER_START && season >= WINTER_START) {
      this.hard = this.rng.next() < p.hardWinterP;
      if (this.hard) {
        this.cHard++;
        this.cb.event('hardWinter', -1, this.world.size / 2, this.world.size / 2, s.year, 0);
      }
    }
    this.prevSeason = season;

    // a new snowfall: about snowStorms of them in a winter
    if (this.left <= 0) {
      const wgt = season >= WINTER_START ? 1 : season < 0.3 ? 0.5 : 0;
      if (wgt > 0 && env.snowTicks <= 0 && s.weather !== Weather.Snow) {
        const per = (p.snowStorms * wgt * (this.hard ? HARD_STORMS : 1) * dt) / (1.1 * SEASON_TICKS);
        if (this.rng.next() < per) this.startFall();
      }
    }

    // snowfall
    let fall = 0;
    if (this.left > 0) {
      const used = Math.min(dt, this.left);
      fall = (this.intensity * p.snowFall * p.snowDepth * used) / this.total;
      this.left -= dt;
      if (this.left <= 0) this.blizzard = false;
    } else if (s.weather === Weather.Snow && env.snowTicks <= 0) {
      // a natural snow day (these last a day or more, up to a whole winter at the default calendar): flurries, half a storm's depth per season of them
      fall = (0.5 * p.snowFall * p.snowDepth * dt) / SEASON_TICKS;
    }
    const d = this.depth;
    if (fall > 0) for (let k = 0; k < SNOW_CELLS; k++) d[k] = Math.min(1, d[k] + fall);

    // the wind drifts it downwind: hollows hold their snow, ridges give it up
    const wind = this.blizzard ? Math.max(s.windStrength, 0.85) : s.windStrength;
    this.drift(wind, s.windDir, (p.snowDrift * wind * dt) / SEASON_TICKS);

    // warmth melts it (a hollow's drift lasts longer)
    const melt = (p.snowMelt * Math.max(0, s.warmth - MELT_WARMTH) * dt) / SEASON_TICKS * (this.hard ? HARD_MELT : 1);
    if (melt > 0) {
      const h = this.hollow;
      for (let k = 0; k < SNOW_CELLS; k++) {
        if (d[k] <= 0) continue;
        const v = d[k] - melt * (1.2 - 0.4 * h[k]);
        d[k] = v > 0.002 ? v : 0;
      }
    }
    const m = this.meanDepth();
    if (m > this.peakMean) this.peakMean = m;
  }

  private startFall(): void {
    const rng = this.rng, p = this.p;
    const blizzard = rng.next() < p.blizzardP * (this.hard ? 1.5 : 1);
    const dur = Math.max(WINTER_STEP, SEASON_TICKS * rng.range(0.04, 0.1) * (blizzard ? 0.7 : 1));
    this.intensity = rng.range(0.5, 1) * (blizzard ? 1.6 : 1) * (this.hard ? HARD_FALL : 1);
    this.total = dur;
    this.left = dur;
    this.blizzard = blizzard;
    this.env.snowTicks = Math.ceil(dur);
    if (blizzard) {
      this.cBlizzards++;
      this.cb.event('blizzard', -1, this.world.size / 2, this.world.size / 2, Math.round(dur), this.intensity);
    }
  }

  /** Move a share of each cell's snow one cell downwind, more from exposed cells and less from sheltered ones. */
  private drift(wind: number, dir: number, base: number): void {
    const N = COARSE_N, d = this.depth, out = this.tmp, h = this.hollow;
    const wx = Math.cos(dir), wy = Math.sin(dir);
    const sx = wx >= 0 ? 1 : -1, sy = wy >= 0 ? 1 : -1;
    const ax = Math.abs(wx) / (Math.abs(wx) + Math.abs(wy) + 1e-9), ay = 1 - ax;
    if (base <= 0 || wind <= 0) return;
    out.set(d);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const v = d[k];
        if (v <= 0.002) continue;
        let f = base * (1 - 0.8 * h[k]);
        if (f > 0.5) f = 0.5; else if (f < 0.01) f = 0.01;
        const m = v * f;
        const nx = i + sx, ny = j + sy;
        let moved = 0;
        if (nx >= 0 && nx < N) { out[k + sx] += m * ax; moved += m * ax; }
        if (ny >= 0 && ny < N) { out[k + sy * N] += m * ay; moved += m * ay; }
        out[k] -= moved;
      }
    }
    for (let k = 0; k < SNOW_CELLS; k++) d[k] = out[k] > 1 ? 1 : out[k];
  }
}
