// Shared contract between the sim core, the worker, the renderer and the headless harness.
import { SPECIES } from './species';

export const Sp = {
  Bison: 0,
  Wolf: 1,
  Raven: 2,
  Deer: 3,
  Rabbit: 4,
  Cougar: 5,
  Coyote: 6,
  PrairieDog: 7,
  Eagle: 8,
  Hawk: 9,
  MuleDeer: 10,
} as const;
export type Sp = (typeof Sp)[keyof typeof Sp];
// Derived from the registry in species.ts. Keep the `Sp` ids above in step with SPECIES[].id.
export const SPECIES_COUNT: number = SPECIES.length;
export const SPECIES_NAMES: string[] = SPECIES.map((s) => s.name);
export const SPECIES_KEYS: string[] = SPECIES.map((s) => s.key);

/** Behavior state shown to the renderer and inspector. */
export const St = {
  Idle: 0,
  Graze: 1,
  Walk: 2,
  Run: 3,
  Flee: 4,
  Chase: 5,
  Eat: 6,
  Drink: 7,
  Rest: 8,
  Fly: 9,
  Stalk: 10,
  Migrate: 11,
} as const;
export type St = (typeof St)[keyof typeof St];
export const STATE_NAMES = ['idle', 'grazing', 'walking', 'running', 'fleeing', 'chasing', 'feeding', 'drinking', 'resting', 'flying', 'stalking', 'migrating'];

/** Flag bits in the agent snapshot. */
export const F_JUVENILE = 1;
export const F_PREGNANT = 2;
export const F_INFECTED = 4;
export const F_MALE = 8;
export const F_ALPHA = 16;
export const F_MANGE = 32;
export const F_MIGRANT = 64;
/** Set while a mule deer is fleeing: the renderer draws the stotting gait (all four feet bouncing together). */
export const F_STOT = 128;

/**
 * Agent snapshot record, Float32, AGENT_STRIDE floats per alive agent:
 * 0 species, 1 x (m), 2 y (m), 3 heading (rad, 0 = +x, CCW toward +y),
 * 4 speed (m/s, actual), 5 body scale (1 = adult of average size),
 * 6 coat (0 pale .. 1 dark), 7 state (St), 8 flags (bits above),
 * 9 altitude above ground (m, ravens in flight), 10 energy (0..1), 11 age fraction of max age (0..1)
 */
export const AGENT_STRIDE = 12;

/** Carcass record, Float32 stride 4: x, y, remaining fraction (0..1), species. */
export const CARCASS_STRIDE = 4;

export const Weather = {
  Clear: 0,
  Rain: 1,
  Drought: 2,
  Storm: 3,
  Snow: 4,
} as const;
export type Weather = (typeof Weather)[keyof typeof Weather];
export const WEATHER_NAMES = ['clear', 'rain', 'drought', 'storm', 'snow'];

export interface EnvState {
  tick: number;
  year: number;
  /** 0..4 continuous: 0 spring start, 1 summer, 2 autumn, 3 winter. */
  season: number;
  /** 0..1 position in the day/night cycle; 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
  dayFrac: number;
  weather: Weather;
  /** 0..1 how wet it currently is (rain intensity). */
  rain: number;
  /** Wind direction (radians) and strength 0..1. */
  windDir: number;
  windStrength: number;
  /** Temperature proxy 0 (frost) .. 1 (hot). */
  warmth: number;
}

/** Vegetation texture layout: RGBA8, n * n, row-major by y then x. */
// R = grass biomass (0..255), G = soil fertility, B = burn (255 = burning now, decays as ash), A = fear (0..255)
export const VEG_CHANNELS = 4;

export interface Snapshot {
  tick: number;
  env: EnvState;
  count: number;
  /** Unique ids, count entries, parallel to agents. */
  ids: Uint32Array;
  agents: Float32Array;
  carcassCount: number;
  carcasses: Float32Array;
  /** Present when the vegetation texture was refreshed in this snapshot. */
  veg?: Uint8Array;
  /** Population counts by species. */
  pop: Int32Array;
  /**
   * Small-prey fields (S4), 32 x 32 coarse cells (16 m), RGBA bytes row-major by y then x. Present only when the smallPrey
   * param is on and the snapshot carries the vegetation texture. R = jackrabbits (hare / hareK * 200), G = prairie dogs
   * (dog / dogK * 200), B = town (burrow infrastructure 0..1 * 255), A = sylvatic plague (0..1 * 255). R and G saturate at 255
   * (1.275 x capacity); see SMALL_SCALE in smallprey.ts.
   */
  small?: Uint8Array;
  /** Storm cells (params.stormCells), up to 4, STORM_STRIDE (6) floats each: x, y, radius m, intensity 0..1, kind (0 thunderstorm, 1 blizzard), age ticks. */
  storms?: Float32Array;
  /** Lightning strikes since the last snapshot, STRIKE_STRIDE (4) floats each: x, y, tick, ignited (0 or 1). */
  strikes?: Float32Array;
  /** Snow depth (S11, params.snowDepth), 32 x 32 coarse cells (16 m) like `small`, bytes row-major by y then x: 0..255 = depth 0..1.
   *  Present only when snowDepth is on and the snapshot carries the vegetation texture. */
  snow?: Uint8Array;
  /** Flood (S17 god tool): present only while a flood is running. [ticks left, severity 0..1, flooded band width in m]: every land cell whose
   *  `world.waterDist` is within the band width is under water. */
  flood?: Float32Array;
  /** Grove trees planted by the player (S17), stride 4 like `world.trees` (x, y, height m, crown radius m), all of them, in planting order.
   *  Present on snapshots that carry the vegetation texture, once at least one grove exists. They are NOT in the renderer's own world.trees. */
  groves?: Float32Array;
}

/** Ticks per second of real time at 1x speed. */
export const TICKS_PER_SECOND = 10;
export const DAY_TICKS = 800;
/** Ticks per season and per valley year. Live bindings: setCalendarScale(k) shortens the year k-fold (params.calendarScale);
 *  the default is a 2,400-tick year. Read them at use time, never copy them into a module-level constant. */
export let SEASON_TICKS = 600;
export let YEAR_TICKS = 2400;
/** The original year length, for timers that stay fixed in ticks whatever the calendar (carcass life, immunity...). */
export const BASE_YEAR_TICKS = 2400;
/** Set the valley calendar (call before anything reads YEAR_TICKS: the sim does it on construction, the game at startup). */
export function setCalendarScale(k: number): void {
  SEASON_TICKS = Math.round(600 / (k > 0 ? k : 1));
  YEAR_TICKS = SEASON_TICKS * 4;
}

/** Shocks and god tools. Applied through SimLike.apply. */
export type Intervention =
  | { kind: 'cull'; species: number; fraction: number }
  | { kind: 'remove'; species: number }
  | { kind: 'introduce'; species: number; count: number; x?: number; y?: number }
  | { kind: 'drought'; ticks: number; severity: number }
  | { kind: 'rain'; ticks: number }
  | { kind: 'fire'; x: number; y: number }
  | { kind: 'plague'; species: number; fraction: number }
  /** God tools v2 (S17). A lightning bolt at a point: sets the grass alight (not over water) and kills what stands within 3 m. */
  | { kind: 'lightning'; x: number; y: number }
  /** A blizzard for `ticks` (a deep snowfall when snowDepth is on, always a snow spell, high wind and a cold drain on every animal). */
  | { kind: 'blizzard'; ticks: number }
  /** The creek and ponds flood for `ticks`: the banks within 12 + 38 x severity m of water drown their grass, animals are pushed out, silt feeds the soil after. */
  | { kind: 'flood'; ticks: number; severity: number }
  /** A targeted outbreak: 'fever' infects a fraction of `species` (default bison), 'distemper' a fraction of wolves or coyotes (default wolves), 'plague' is sylvatic plague in the prairie dog towns. */
  | { kind: 'disease'; disease: 'fever' | 'distemper' | 'plague'; species?: number; fraction?: number }
  /** Plant a grove: tree cover, browse and trees in a disc (radius clamped to 6..40 m). */
  | { kind: 'grove'; x: number; y: number; radius: number };

/**
 * What the headless harness needs from a simulation. src/sim/sim.ts exports
 * `createSim(opts: { seed: number; params?: Record<string, number> }): SimLike`.
 */
export interface SimLike {
  readonly tick: number;
  /** Advance n ticks (default 1). */
  step(n?: number): void;
  /** Alive counts indexed by species (length SPECIES_COUNT). */
  populations(): number[];
  /**
   * One flat row of numeric metrics for the time series, e.g.
   * pop_bison, pop_wolf, grass_mean, gen_bison (mean generation depth of living bison),
   * trait_bison_speed, trait_wolf_speed, kills, births_bison ... Column set is stable for a run.
   */
  sample(): Record<string, number>;
  apply(intervention: Intervention): void;
}
