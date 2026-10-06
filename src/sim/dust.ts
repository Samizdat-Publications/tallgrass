// Dust storms (V2-PLAN.md S12): in a drought, when the ground is bare and the wind is up, a wall of dust sweeps the valley.
//
// Trigger, checked every DUST_STEP ticks: a drought is running (env.droughtTicks > 0), the wind is above dustWind (0.5), at least dustBare (0.35)
// of the land has grass below dustBareGrass (0.35), no storm is running and the last one ended dustCooldown valley years ago. Then a storm starts
// with chance dustP per check (own generator).
//
// A storm lasts 200 to 450 ticks (a part of one day, whatever the calendar), swelling for the first quarter, holding, fading over the last
// quarter, blowing the way the wind blew when it began. While it runs:
//   - the bare cells (grass below dustBareGrass) lose dustSoil (0.02) of soil fertility over the whole storm
//   - every animal's sight is multiplied by 1 - (1 - dustVision) x intensity (dustVision 0.6 at full intensity); the sim reads `visionMul()`
// Event dustStorm: sp -1, (x, y) the valley centre, a = length in ticks, b = peak intensity 0..1.
//
// Snapshot (Sim.snapshot -> `dust`, Float32Array of DUST_STRIDE, present only while a storm runs): [intensity 0..1, wind direction (rad, the way
// the dust travels), ticks left, front 0..1 (how far the leading wall has crossed the valley along the direction: 0 at the start, 1 once
// across, reached in the first quarter of the storm), peak intensity].
//
// Determinism: the module owns a generator, new Rng(hashSeed(seed + ':dust')), drawn only when the trigger conditions hold. It never touches
// the sim's main stream, and the sim only builds a DustStorms object when params.dustStorms is on.
import type { Environment } from './env';
import type { Params } from './params';
import { hashSeed, Rng } from './rng';
import type { SimEventKind } from './sim';
import { YEAR_TICKS } from './types';

/** The sim steps the module every this many ticks. */
export const DUST_STEP = 10;
export const DUST_STRIDE = 5;
const MIN_LEN = 200;
const MAX_LEN = 450;
/** Soil never falls below this (the vegetation module's own floor). */
const SOIL_FLOOR = 0.12;

export interface DustHost {
  event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void;
}

export interface DustSample {
  storms: number;
  /** Cells that lost soil, summed over the storms since the last drain (a cell hit by two storms counts twice). */
  cellsScoured: number;
}

export class DustStorms {
  readonly rng: Rng;
  /** Ticks left of the running storm (0 = none), its length, peak and direction. */
  left = 0;
  total = 0;
  peak = 0;
  dir = 0;
  private endedAt = -1e9;
  private cStorms = 0;
  private cScoured = 0;
  /** The bare share of the land at the last check that looked (NaN until one did). */
  lastBare = NaN;

  constructor(
    seed: number,
    private readonly p: Params,
    private readonly env: Environment,
    private readonly world: { water: Uint8Array; size: number },
    private readonly veg: { grass: Float32Array; soil: Float32Array },
    private readonly host: DustHost,
  ) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:dust`));
  }

  /** Intensity 0..1 now: swell over the first quarter of the storm, hold, fade over the last quarter. */
  intensity(): number {
    if (this.left <= 0 || this.total <= 0) return 0;
    const u = 1 - this.left / this.total;
    const e = u < 0.25 ? u / 0.25 : u > 0.75 ? (1 - u) / 0.25 : 1;
    return this.peak * e;
  }

  /** The multiplier on every animal's sight now (1 when there is no storm). */
  visionMul(): number {
    return this.left > 0 ? 1 - (1 - this.p.dustVision) * this.intensity() : 1;
  }

  /** The share of the land with grass below dustBareGrass. */
  bareShare(): number {
    const g = this.veg.grass, wat = this.world.water, th = this.p.dustBareGrass;
    let bare = 0, land = 0;
    for (let c = 0; c < g.length; c++) {
      if (wat[c]) continue;
      land++;
      if (g[c] < th) bare++;
    }
    return land > 0 ? bare / land : 0;
  }

  /** Advance DUST_STEP ticks (the sim calls this when tick % DUST_STEP === 0, after the environment has updated). */
  step(tick: number): void {
    const p = this.p, env = this.env, s = env.state;
    if (this.left > 0) {
      this.left -= DUST_STEP;
      this.scour();
      if (this.left <= 0) {
        this.left = 0;
        this.endedAt = tick;
      }
      return;
    }
    if (env.droughtTicks <= 0 || s.windStrength <= p.dustWind) return;
    if (tick - this.endedAt < p.dustCooldown * YEAR_TICKS) return;
    const bare = this.bareShare();
    this.lastBare = bare;
    if (bare < p.dustBare) return;
    if (this.rng.next() >= p.dustP) return;
    this.start(this.rng.range(MIN_LEN, MAX_LEN), this.rng.range(0.6, 1), s.windDir);
  }

  /** Begin a storm (the trigger above, or a test). */
  start(len: number, peak: number, dir: number): void {
    this.total = Math.max(DUST_STEP, Math.round(len));
    this.left = this.total;
    this.peak = Math.max(0, Math.min(1, peak));
    this.dir = dir;
    this.cStorms++;
    const half = this.world.size / 2;
    this.host.event('dustStorm', -1, half, half, this.total, Math.round(this.peak * 100) / 100);
  }

  /** Bare ground loses soil: dustSoil x peak over the whole storm, in DUST_STEP slices (more in the middle, where the wind is strongest). */
  private scour(): void {
    const g = this.veg.grass, soil = this.veg.soil, wat = this.world.water, th = this.p.dustBareGrass;
    // the envelope integrates to 0.75 of the length, so the slices add up to dustSoil over the storm
    const k = (this.p.dustSoil * (this.intensity() / Math.max(0.01, this.peak)) * DUST_STEP) / (0.75 * this.total);
    if (k <= 0) return;
    let n = 0;
    for (let c = 0; c < g.length; c++) {
      if (wat[c] || g[c] >= th) continue;
      const v = soil[c] - k;
      soil[c] = v > SOIL_FLOOR ? v : SOIL_FLOOR;
      n++;
    }
    this.cScoured += n;
  }

  /** Snapshot array while a storm runs, else null. */
  toArray(): Float32Array | null {
    if (this.left <= 0) return null;
    const u = 1 - this.left / this.total;
    return Float32Array.of(this.intensity(), this.dir, this.left, Math.min(1, u / 0.25), this.peak);
  }

  /** Storms begun and cells scoured since the last call. */
  drainSample(): DustSample {
    const d = { storms: this.cStorms, cellsScoured: this.cScoured };
    this.cStorms = 0;
    this.cScoured = 0;
    return d;
  }
}
