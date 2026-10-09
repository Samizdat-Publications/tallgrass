// Calendar, day/night, weather. Deterministic from the sim RNG.
import { ClimateRegime } from './climate';
import { Rng } from './rng';
import { BASE_YEAR_TICKS, DAY_TICKS, EnvState, SEASON_TICKS, Weather, YEAR_TICKS } from './types';

/** The world opens on a late-summer morning: golden grass, low sun. */
export const START_SEASON = 1.8;
export const START_DAY = 0.27;

export class Environment {
  state: EnvState = {
    tick: 0, year: 0, season: START_SEASON, dayFrac: START_DAY, weather: Weather.Clear,
    rain: 0, windDir: 0.6, windStrength: 0.45, warmth: 0.7, climate: 0,
  };
  /** Ticks left on a forced drought (from an intervention or a dry year). */
  droughtTicks = 0;
  droughtSeverity = 0;
  rainTicks = 0;
  /** Ticks left on a forced snowfall (set by the winter module; 0 otherwise). */
  snowTicks = 0;
  /** Spring green-up delay in seasons (0 = off): the rise from dormancy to the late-spring peak starts this much later. */
  greenUpShift = 0;
  /** Chance per day, in summer, that a natural dry spell starts. */
  droughtChance = 0.1;
  private weatherTimer = 0;
  private storm = false;
  /** Slow climate swing in grass growth (0 = off): wet and dry runs of years from two incommensurate cycles. */
  climateAmp = 0;
  private climatePhase = -1;
  /** Climate regimes (v10; null = off): the seeded wet and dry decades (climate.ts). */
  regime: ClimateRegime | null = null;
  /** How far the regime moves grass growth and the land's carrying capacity: x (1 + climate2 x index). */
  climate2 = 0;
  /** How much a dry run of years raises the chance of a summer dry spell (and a wet run lowers it). */
  climateDrought = 0;
  /** Multiplier on every cell's grass capacity (1 = off; set each tick from the regime). */
  capMul = 1;
  /** The regime index now (-1..1; 0 when off). Mirrored into state.climate for the renderer. */
  climateNow = 0;

  /** -1 (driest) .. 1 (wettest) on the slow climate cycle; 0 when the cycle is off. */
  climate(): number {
    if (this.climateAmp <= 0) return 0;
    if (this.climatePhase < 0) this.climatePhase = this.rng.next() * Math.PI * 2;
    const y = this.state.tick / BASE_YEAR_TICKS;
    return 0.6 * Math.sin((y / 11) * Math.PI * 2 + this.climatePhase) + 0.4 * Math.sin((y / 17.3) * Math.PI * 2 + this.climatePhase * 1.7);
  }

  constructor(private rng: Rng) {}

  /** Absolute calendar position in ticks, offset so tick 0 is late summer. */
  yearTick(tick: number): number {
    return (tick + Math.round(START_SEASON * SEASON_TICKS)) % YEAR_TICKS;
  }

  update(tick: number): void {
    const s = this.state;
    s.tick = tick;
    const yt = this.yearTick(tick);
    s.year = Math.floor((tick + Math.round(START_SEASON * SEASON_TICKS)) / YEAR_TICKS);
    s.season = yt / SEASON_TICKS;
    s.dayFrac = ((tick + Math.round(START_DAY * DAY_TICKS)) % DAY_TICKS) / DAY_TICKS;
    // warmth: peak mid-summer, low mid-winter, plus a small day swing
    const seasonal = 0.5 + 0.5 * Math.cos(((s.season - 1.4) / 4) * Math.PI * 2);
    const daily = 0.08 * Math.sin((s.dayFrac - 0.3) * Math.PI * 2);
    s.warmth = Math.max(0, Math.min(1, seasonal + daily));

    // wind: slow drift
    s.windDir += (this.rng.next() - 0.5) * 0.004;
    s.windStrength += (this.rng.next() - 0.5) * 0.01 + (0.45 - s.windStrength) * 0.0008;
    s.windStrength = Math.max(0.1, Math.min(1, s.windStrength));

    if (this.droughtTicks > 0) this.droughtTicks--;
    if (this.rainTicks > 0) this.rainTicks--;
    if (this.snowTicks > 0) this.snowTicks--;
    if (this.regime !== null) {
      const c = this.regime.value(tick);
      s.climate = c;
      this.climateNow = c;
      this.capMul = 1 + this.climate2 * c;
    }

    // weather rolls once per day
    if (--this.weatherTimer <= 0) {
      this.weatherTimer = DAY_TICKS;
      this.rollWeather(s.season);
    }
    if (this.droughtTicks > 0) s.weather = Weather.Drought;
    else if (this.snowTicks > 0) s.weather = Weather.Snow;
    else if (this.rainTicks > 0) s.weather = s.season >= 3 ? Weather.Snow : this.storm ? Weather.Storm : Weather.Rain;
    else s.weather = Weather.Clear;
    const targetRain = s.weather === Weather.Rain || s.weather === Weather.Storm ? 1 : s.weather === Weather.Snow ? 0.6 : 0;
    s.rain += (targetRain - s.rain) * 0.01;
  }

  private rollWeather(season: number): void {
    if (this.droughtTicks > 0) return;
    const r = this.rng.next();
    const si = Math.floor(season) % 4;
    // natural dry spells: mostly summer
    let dc = this.droughtChance;
    if (this.regime !== null) dc *= Math.max(0.15, 1 - this.climateDrought * this.climateNow) * (this.regime.inMegadrought(this.state.tick) ? 2 : 1);
    if (si === 1 && r < dc) {
      this.droughtTicks = Math.round((BASE_YEAR_TICKS / 4) * (1 + this.rng.next() * 1.5));
      this.droughtSeverity = 0.6 + 0.3 * this.rng.next();
      return;
    }
    const pRain = [0.4, 0.18, 0.25, 0.3][si];
    if (this.rainTicks <= 0 && this.rng.next() < pRain) {
      this.rainTicks = Math.round(DAY_TICKS * (0.3 + this.rng.next() * 0.8));
      this.storm = si !== 3 && this.rng.next() < 0.2;
    }
  }

  /** Grass growth multiplier for the current season and weather (0 in deep winter). */
  growthFactor(): number {
    const s = this.state.season;
    // peak in late spring, weak in autumn, dormant in winter
    let g = Math.max(0, Math.cos(((s - 0.7) / 4) * Math.PI * 2));
    if (this.greenUpShift > 0) {
      // the rise runs from dormancy (season 3.7) to the peak (0.7); with a shift it starts that many seasons later and reaches the same peak
      const u = (s + 0.3) % 4;
      if (u < 1) {
        const v = (u - Math.min(0.95, this.greenUpShift)) / (1 - Math.min(0.95, this.greenUpShift));
        g = v <= 0 ? 0 : Math.cos(((v - 1) * Math.PI) / 2);
      }
    }
    let f = 0.04 + 0.96 * Math.pow(g, 1.3);
    if (this.droughtTicks > 0) f *= 1 - this.droughtSeverity;
    if (this.state.rain > 0.3 && s < 3) f *= 1 + 0.35 * this.state.rain;
    if (this.climateAmp > 0) f *= 1 + this.climateAmp * this.climate();
    if (this.regime !== null) f *= this.capMul;
    return f;
  }

  isNight(): boolean {
    const d = this.state.dayFrac;
    return d < 0.22 || d > 0.8;
  }
}
