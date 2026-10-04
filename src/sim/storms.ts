// Storm cells and lightning (V2-PLAN.md S6). Rain stays global in env.ts, so the weather sequence is untouched;
// this adds travelling cells that throw lightning, and dry lightning starts grass fires.
//
// Determinism: the cells own a generator seeded from `${seed}:storms`. They never touch the main sim stream, the
// environment stream or any fork, and the sim only builds a StormCells object when params.stormCells > 0.
import { EnvState, Weather } from './types';
import { hashSeed, Rng } from './rng';

export const MAX_STORM_CELLS = 4;
/** Floats per cell in the snapshot's `storms`: x, y, radius (m), intensity 0..1, kind (0 thunderstorm, 1 blizzard), age (ticks). */
export const STORM_STRIDE = 6;
/** Floats per strike in the snapshot's `strikes`: x, y, tick, ignited (0 or 1). */
export const STRIKE_STRIDE = 4;
/** Strikes kept for the renderer when nobody drains them (headless runs never take a snapshot). */
const MAX_STRIKE_FLOATS = 64 * STRIKE_STRIDE;
/** A cell is dropped once it is this far past the valley centre along its track (m). */
export const STORM_EXIT_M = 400;

export interface StormParams {
  /** Strike chance per tick per cell at full intensity. */
  lightningRate: number;
  /** Chance a strike in dry, cured grass starts a fire. */
  lightningIgnite: number;
}

export interface StormCell {
  x: number;
  y: number;
  /** Metres per tick. */
  vx: number;
  vy: number;
  r: number;
  /** Peak intensity 0..1 (the cell swells and fades over its life). */
  peak: number;
  age: number;
  /** Ticks the cell lives; counts down. */
  life: number;
  total: number;
}

export class StormCells {
  readonly rng: Rng;
  readonly cells: StormCell[] = [];
  /** Strikes since the last drain: x, y, tick, ignited. */
  private strikes: number[] = [];
  /** Filled by update(), cleared at the start of the next one: fires as x, y pairs; storm starts as x, y, cells. */
  fires: number[] = [];
  starts: number[] = [];
  private prevStorm = false;

  constructor(seed: number, readonly size: number, private p: StormParams, private dt = 0.15) {
    this.rng = new Rng(hashSeed(`${seed}:storms`));
  }

  /** Current intensity 0..1 of a cell: a smooth swell and fade over its life. */
  intensity(c: StormCell): number {
    return c.peak * Math.sin(Math.PI * Math.min(1, c.age / c.total));
  }

  /** Add a cell by hand (tests, tools). */
  spawn(x: number, y: number, vx: number, vy: number, r: number, peak: number, life: number): void {
    if (this.cells.length >= MAX_STORM_CELLS) return;
    this.cells.push({ x, y, vx, vy, r, peak, age: 0, life, total: life });
  }

  /** A storm day begins: one cell, sometimes a second, upwind of the valley. */
  private spawnStorm(windDir: number): void {
    const rng = this.rng;
    const dx = Math.cos(windDir), dy = Math.sin(windDir);
    const half = this.size / 2;
    const extent = half * (Math.abs(dx) + Math.abs(dy));
    const n = 1 + (rng.next() < 0.4 ? 1 : 0);
    let sx = 0, sy = 0;
    for (let k = 0; k < n; k++) {
      const off = rng.range(150, 250);
      const side = rng.range(-0.45, 0.45) * this.size;
      const r = rng.range(60, 120);
      const speed = rng.range(2.5, 5);
      const x = half - dx * (extent + off) - dy * side;
      const y = half - dy * (extent + off) + dx * side;
      const peak = rng.range(0.6, 1);
      const step = speed * this.dt;
      // ticks to cross from the spawn point to the exit line
      const life = Math.ceil((extent + off + STORM_EXIT_M) / step);
      if (k === 0) { sx = x; sy = y; }
      this.spawn(x, y, dx * step, dy * step, r, peak, life);
    }
    this.starts.push(sx, sy, n);
  }

  /**
   * Advance one tick. `fuelAt(x, y)` is the grass at a point, 0 over water, and 0 outside the valley.
   * New fires land in `fires`, new storms in `starts`.
   */
  update(tick: number, env: EnvState, fuelAt: (x: number, y: number) => number): void {
    this.fires.length = 0;
    this.starts.length = 0;
    const stormNow = env.weather === Weather.Storm;
    if (stormNow && !this.prevStorm) this.spawnStorm(env.windDir);
    this.prevStorm = stormNow;
    const cs = this.cells;
    if (cs.length === 0) return;
    const half = this.size / 2;
    const rng = this.rng;
    const lit = env.season >= 1.4 && env.season <= 3.1 && env.rain < 0.35;
    for (let k = cs.length - 1; k >= 0; k--) {
      const c = cs[k];
      c.x += c.vx;
      c.y += c.vy;
      c.age++;
      c.life--;
      const vl = Math.hypot(c.vx, c.vy) || 1;
      const past = ((c.x - half) * c.vx + (c.y - half) * c.vy) / vl;
      if (c.life <= 0 || past > STORM_EXIT_M) {
        cs.splice(k, 1);
        continue;
      }
      const inten = this.intensity(c);
      if (rng.next() < this.p.lightningRate * inten) {
        const ang = rng.next() * Math.PI * 2;
        const rad = c.r * Math.sqrt(rng.next());
        const x = c.x + Math.cos(ang) * rad, y = c.y + Math.sin(ang) * rad;
        let ignited = 0;
        if (lit && x >= 0 && y >= 0 && x < this.size && y < this.size && fuelAt(x, y) > 0.3 && rng.next() < this.p.lightningIgnite) {
          ignited = 1;
          this.fires.push(x, y);
        }
        this.strikes.push(x, y, tick, ignited);
        if (this.strikes.length > MAX_STRIKE_FLOATS) this.strikes.splice(0, this.strikes.length - MAX_STRIKE_FLOATS);
      }
    }
  }

  /** Strikes since the last call, as a Float32Array (STRIKE_STRIDE floats each); clears the buffer. */
  drainStrikes(): Float32Array {
    const out = Float32Array.from(this.strikes);
    this.strikes.length = 0;
    return out;
  }

  /**
   * Cells for the snapshot (STORM_STRIDE floats each). When it is snowing hard and no cell is out, one big blizzard
   * cell sits over the valley: a look only, built from the weather with no random draws.
   */
  toArray(env: EnvState, tick: number): Float32Array {
    const blizzard = env.weather === Weather.Snow && env.windStrength > 0.6;
    if (this.cells.length === 0 && !blizzard) return new Float32Array(0);
    const out = new Float32Array(Math.max(1, this.cells.length) * STORM_STRIDE);
    if (this.cells.length === 0) {
      out.set([this.size / 2, this.size / 2, this.size * 0.7, Math.min(1, env.windStrength), 1, tick]);
      return out;
    }
    for (let k = 0; k < this.cells.length; k++) {
      const c = this.cells[k];
      out.set([c.x, c.y, c.r, this.intensity(c), blizzard ? 1 : 0, c.age], k * STORM_STRIDE);
    }
    return out;
  }
}
