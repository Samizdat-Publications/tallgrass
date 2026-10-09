// Climate regimes (v10, param climate2; 0 = off): the valley's slow breath. A seeded index runs from -1 (the driest
// run of years) to +1 (the wettest), built per valley year from three slow swells with random periods around
// climatePeriod, a little year-to-year red noise, and now and then a megadrought: a few years pinned near the dry end.
// Wet decades raise the grass the land can carry and how fast it regrows, and favour cottonwood seedlings; dry decades
// lower both, bring more summer dry spells, and let lightning start more fires. The sim reads value(tick); the
// renderer and the chronicle get it through the env state (EnvState.climate) and the climateWet / climateDry /
// megadrought events.
//
// It owns its random stream (seeded from the world seed), so it never draws from the sim's main generator.
import { Rng, hashSeed } from './rng';
import { YEAR_TICKS } from './types';

export interface ClimateParams {
  /** Typical length of one wet-and-dry swell, in valley years. */
  climatePeriod: number;
  /** Chance per valley year, while the swell is on its dry side, that a megadrought begins. */
  climateMegaP: number;
}

export class ClimateRegime {
  private readonly rng: Rng;
  private readonly per: number[] = [];
  private readonly ph: number[] = [];
  private readonly amp = [0.5, 0.32, 0.18];
  /** Index for each valley year, filled in order so the stream never depends on who asks when. */
  private readonly years: number[] = [];
  /** 1 for the years a megadrought holds (same indexing as years). */
  readonly megaYears: number[] = [];
  private red = 0;
  private megaLeft = 0;

  constructor(seed: number, private readonly p: ClimateParams) {
    this.rng = new Rng(hashSeed(seed + ':climate'));
    const P = Math.max(4, p.climatePeriod);
    const spans: [number, number][] = [[0.55, 0.8], [0.95, 1.25], [1.8, 2.6]];
    for (const [lo, hi] of spans) {
      this.per.push(P * this.rng.range(lo, hi));
      this.ph.push(this.rng.next() * Math.PI * 2);
    }
  }

  private fill(y: number): void {
    while (this.years.length <= y) {
      const k = this.years.length;
      let s = 0;
      for (let i = 0; i < 3; i++) s += this.amp[i] * Math.sin((k / this.per[i]) * Math.PI * 2 + this.ph[i]);
      // red noise: a wet or dry year leans the next one the same way
      this.red = 0.6 * this.red + 0.22 * this.rng.normal();
      let v = s * 1.15 + this.red;
      let mega = 0;
      if (this.megaLeft > 0) {
        this.megaLeft--;
        mega = 1;
      } else if (s < -0.1 && this.rng.next() < this.p.climateMegaP) {
        this.megaLeft = 2 + this.rng.int(4); // 3 to 6 years in all, counting this one
        mega = 1;
      }
      if (mega) v = Math.min(v, -0.85 - 0.1 * this.rng.next());
      // soft clip to -1..1
      v = v / Math.sqrt(1 + v * v * 0.6);
      this.years.push(v < -1 ? -1 : v > 1 ? 1 : v);
      this.megaYears.push(mega);
    }
  }

  /** The index for valley year y. */
  yearValue(y: number): number {
    const yi = y < 0 ? 0 : y | 0;
    this.fill(yi);
    return this.years[yi];
  }

  /** The index at a tick: eased between this valley year's value and the next, so growth never jumps at new year. */
  value(tick: number): number {
    const yf = tick / YEAR_TICKS;
    const y = Math.floor(yf);
    const f = yf - y;
    const a = this.yearValue(y);
    const b = this.yearValue(y + 1);
    const e = f * f * (3 - 2 * f);
    return a + (b - a) * e;
  }

  /** True while a megadrought holds (by valley year). */
  inMegadrought(tick: number): boolean {
    const y = Math.floor(tick / YEAR_TICKS);
    this.fill(y);
    return this.megaYears[y] === 1;
  }
}
