// The natural spring flood (V2-PLAN.md S12): when snowmelt and rain fill the creek, the bottomland within floodBand (15 m) of the water goes under
// for part of a season. The flood itself is the S17 machinery in sim.ts (startFlood / floodStep: the grass in the band drowns, animals are pushed
// out, young that are caught may drown, the silt feeds the soil afterwards); this module only decides when one starts and how big it is.
//
// The wet index `wet` collects water in the late-winter and spring window (season 3.6 to 0.8) and drains away with a half-season time constant:
//   snowmelt   with snowDepth on: the mean snow depth the valley lost since the last check, x floodMelt
//              with snowDepth off: a thaw proxy, (warmth - 0.25) x how snowy the winter was (the share of it with snow weather, 0..1) x floodMelt x 0.5
//              per season, so the flood is rarer without a real snowpack
//   rain       the weather's rain (0..1) x floodRain per season
// A flood starts when `wet` reaches floodThresh, at most once in two seasons and not while another flood runs. Severity grows with how far past the
// threshold the index went (0.25 to 0.9); the length is floodSeasons seasons (x 0.6 to 1.4).
//
// Determinism: the module owns a generator, new Rng(hashSeed(seed + ':flood')), drawn only when a flood starts (severity and length jitter) and
// handed to the sim for the drowning rolls. The sim only builds a SpringFloods object when params.springFloods is on.
import type { Environment } from './env';
import type { Params } from './params';
import { hashSeed, Rng } from './rng';
import { SEASON_TICKS, Weather } from './types';

/** The sim steps the module every this many ticks. */
export const FLOOD_STEP = 25;
/** Window of the year in which a spring flood can start (season, wrapping through 0). */
export const FLOOD_WINDOW_START = 3.6;
export const FLOOD_WINDOW_END = 0.8;
/** The winter's snow weather is counted from this season. */
const WINTER_FROM = 2.9;

export interface FloodCall {
  /** Ticks the flood lasts. */
  ticks: number;
  /** 0.25 .. 0.9 */
  severity: number;
}

export class SpringFloods {
  readonly rng: Rng;
  /** The wet index (see the header). */
  wet = 0;
  /** How snowy the winter has been, in seasons of snow weather since the autumn (the proxy used when snowDepth is off). */
  snowSeasons = 0;
  private prevSeason = -1;
  private prevMean = -1;
  private lastTick = -1e9;

  constructor(seed: number, private readonly p: Params, private readonly env: Environment, private readonly snowMean: (() => number) | null) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:flood`));
  }

  /** Is the calendar inside the spring flood window? */
  static inWindow(season: number): boolean {
    return season >= FLOOD_WINDOW_START || season < FLOOD_WINDOW_END;
  }

  /** Advance FLOOD_STEP ticks. Returns the flood to start now, or null. `busy` is true while any flood runs. */
  step(busy: boolean): FloodCall | null {
    const s = this.env.state, p = this.p, dt = FLOOD_STEP;
    const season = s.season;
    const inWin = SpringFloods.inWindow(season);
    // the winter's snow weather, counted from the autumn
    if (this.prevSeason >= 0 && this.prevSeason < WINTER_FROM && season >= WINTER_FROM) this.snowSeasons = 0;
    this.prevSeason = season;
    if ((season >= WINTER_FROM || season < 0.5) && s.weather === Weather.Snow) this.snowSeasons += dt / SEASON_TICKS;
    // the snow the valley lost since the last check (a rise, a new snowfall, counts for nothing)
    let melt = 0;
    if (this.snowMean !== null) {
      const m = this.snowMean();
      if (this.prevMean >= 0 && m < this.prevMean) melt = this.prevMean - m;
      this.prevMean = m;
    }
    this.wet *= Math.exp(-dt / (0.5 * SEASON_TICKS));
    if (!inWin) return null;
    const perSeason = dt / SEASON_TICKS;
    if (this.snowMean !== null) this.wet += melt * p.floodMelt;
    else this.wet += Math.max(0, s.warmth - 0.25) * Math.min(1, this.snowSeasons / 0.4) * p.floodMelt * 0.5 * perSeason;
    this.wet += s.rain * p.floodRain * perSeason;
    if (busy || this.wet < p.floodThresh || s.tick - this.lastTick < 2 * SEASON_TICKS) return null;
    this.lastTick = s.tick;
    const over = this.wet / p.floodThresh - 1;
    const severity = Math.max(0.25, Math.min(0.9, (0.25 + 0.5 * over) * this.rng.range(0.85, 1.15)));
    const ticks = Math.max(30, Math.round(SEASON_TICKS * p.floodSeasons * this.rng.range(0.6, 1.4)));
    this.wet *= 0.3;
    return { ticks, severity };
  }
}
