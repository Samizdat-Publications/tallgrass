// Pure audio policy for Tallgrass: what the ambience beds and the random spot sounds should do for a given world state.
// No Web Audio in here, so it is unit-testable under node (see mix.test.ts) and cheap to call every frame.
import { Weather } from '../sim/types';
import type { EnvState } from '../sim/types';

// ---------------------------------------------------------------------------------------------------- small math

/** Clamp to 0..1. NaN becomes 0. */
export const clamp01 = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth 0..1 ramp between e0 and e1 (e0 < e1). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Sun height proxy, -1 (midnight) .. +1 (noon). dayFrac 0 = midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
export const sunHeight = (dayFrac: number): number => Math.sin((dayFrac - 0.25) * Math.PI * 2);

/** 0..1, how deep into winter. season is 0..4: 0 spring start, 1 summer, 2 autumn, 3 winter. Fades over late autumn and early spring. */
export function winterWeight(season: number): number {
  const u = ((season % 4) + 4) % 4;
  let d = Math.abs(u - 3.5); // distance from the middle of winter
  d = Math.min(d, 4 - d);
  return 1 - smoothstep(0.45, 0.9, d);
}

/** Season wrapped into 0..4 (0 spring start, 1 summer, 2 autumn, 3 winter). */
export const season01 = (season: number): number => (((Number.isFinite(season) ? season : 0) % 4) + 4) % 4;

// ---------------------------------------------------------------------------------------------------- beds

export type BedName = 'wind' | 'birds' | 'crickets' | 'rain' | 'winter' | 'creek' | 'blizzard' | 'grasshopper';
export const BED_NAMES: readonly BedName[] = ['wind', 'birds', 'crickets', 'rain', 'winter', 'creek', 'blizzard', 'grasshopper'];
export type BedMix = Record<BedName, number>;

/** The slice of EnvState the mix needs (so tests and the demo page can pass partial objects). */
export type MixEnv = Pick<EnvState, 'season' | 'dayFrac' | 'weather' | 'rain' | 'windStrength' | 'warmth'>;

/**
 * Target gain (0..1) for every ambience bed.
 *  wind     grass wind bed, always the foundation by day; follows windStrength; fades out in winter
 *  birds    distant songbirds: dawn, day and dusk, not at night, not in winter, not in rain
 *  crickets dusk to dawn, none in winter, fewer when it is cool
 *  rain     steady rain bed once rain passes about 0.2 (never for snow)
 *  winter   cold hollow wind, replaces the grass wind in winter
 *  creek    water trickle by proximity (nearWater 0..1), thinner in winter and drought
 * Camera height: the higher the camera the more wind and the less creature, insect and water detail.
 */
export function bedMix(env: MixEnv, camHeight: number, nearWater: number): BedMix {
  const sun = sunHeight(env.dayFrac);
  const winter = winterWeight(env.season);
  const ws = clamp01(env.windStrength);
  const rain = clamp01(env.rain);
  const warmth = clamp01(env.warmth);
  const h = Number.isFinite(camHeight) ? Math.max(0, camHeight) : 0;
  const high = smoothstep(60, 350, h); // 0 near the ground .. 1 very high
  const detail = 1 - smoothstep(40, 300, h); // creature / insect / water detail
  const snow = env.weather === Weather.Snow ? 1 : 0;
  const storm = env.weather === Weather.Storm ? 1 : 0;
  const drought = env.weather === Weather.Drought ? 1 : 0;
  const wet = smoothstep(0.1, 0.5, rain);

  const night = 1 - smoothstep(-0.25, 0.12, sun); // 1 after dusk, 0 once the sun is up
  const dayLight = smoothstep(-0.2, 0.15, sun); // 0 at night, 1 by mid morning / late afternoon
  const golden = 1 - 0.45 * smoothstep(0.45, 0.95, sun); // birds peak at the golden hours, thinner at noon

  const wind = (0.2 + 0.7 * ws) * (1 - 0.9 * winter) * (1 - 0.2 * night) * (1 + 0.55 * high + 0.25 * storm) * (1 - 0.3 * snow);
  // blizzard: deep winter with a hard wind (or snow falling in a good blow); the plain winter bed gives way to it
  const blizzard = clamp01(Math.max(winter * smoothstep(0.55, 0.9, ws), snow * smoothstep(0.35, 0.75, ws)));
  const winterBed = winter * (0.35 + 0.65 * ws) * (1 + 0.4 * high) * (1 - 0.65 * blizzard);
  // grasshoppers: summer days, hot and dry, right down in the grass (they vanish once the camera lifts off)
  const hot = smoothstep(0.45, 0.8, warmth);
  const summerW = smoothstep(0.75, 1.2, season01(env.season)) * (1 - smoothstep(2.0, 2.4, season01(env.season)));
  const lowCam = 1 - smoothstep(8, 55, h);
  const grasshopper = 0.9 * summerW * smoothstep(0.1, 0.45, sun) * lerp(0.45, 1, hot) * (1 + 0.25 * drought) * (1 - 0.8 * wet) * (1 - 0.5 * ws) * lowCam;
  const birds = 0.85 * dayLight * golden * (1 - 0.9 * winter) * detail * (1 - 0.9 * wet);
  const crickets = 0.9 * night * (1 - winter) * lerp(0.25, 1, warmth) * detail * (1 - 0.85 * wet);
  const rainBed = (1 - snow) * 0.9 * smoothstep(0.1, 0.55, rain) * (1 - 0.3 * high);
  const creek = clamp01(nearWater) * 0.9 * detail * (1 - 0.6 * winter) * (1 + 0.2 * wet) * (1 - 0.35 * drought);

  return {
    wind: clamp01(wind),
    birds: clamp01(birds),
    crickets: clamp01(crickets),
    rain: clamp01(rainBed),
    winter: clamp01(winterBed),
    creek: clamp01(creek),
    blizzard: clamp01(blizzard * (0.6 + 0.4 * ws) * (1 + 0.3 * high)),
    grasshopper: clamp01(grasshopper),
  };
}

// ---------------------------------------------------------------------------------------------------- spot sounds

export interface Nearby {
  bison: number;
  wolf: number;
  raven: number;
  pronghorn: number;
  /** Coyotes near the camera (they only call while there are some). Left out by callers that predate coyotes: counts as 0. */
  coyote?: number;
}

/** How one kind of random spot sound should behave right now. mean = average seconds between sounds (Infinity = off). */
export interface SpotRule {
  mean: number;
  /** 0..1 loudness before per-play jitter. */
  gain: number;
  /** 0 close .. 1 far: drives the low-pass and extra attenuation. */
  distance: number;
}
export type SpotKey = 'wolf' | 'raven' | 'bison' | 'thunder' | 'rut' | 'crane';
export const SPOT_KEYS: readonly SpotKey[] = ['wolf', 'raven', 'bison', 'thunder', 'rut', 'crane'];
export type SpotPlan = Record<SpotKey, SpotRule>;

const OFF: SpotRule = { mean: Infinity, gain: 0, distance: 1 };

/**
 * Which spot sounds are eligible and how often.
 * wolf    howls at dusk and night; nearby wolves make them frequent and closer, otherwise rare and far
 * raven   calls by day when more than 3 ravens are near
 * bison   grunts and huffs when the camera is low (< 60) and more than 5 bison are near
 * thunder only in storms
 * At speed >= 10 everything thins out (a quarter as often, a little quieter); speed 0 (paused) is silent.
 */
export function spotPlan(env: MixEnv, camHeight: number, nearby: Nearby, speed: number): SpotPlan {
  if (!(speed > 0)) return { wolf: OFF, raven: OFF, bison: OFF, thunder: OFF, rut: OFF, crane: OFF };
  const thin = speed >= 10 ? 4 : 1;
  const quiet = speed >= 10 ? 0.75 : 1;
  const sun = sunHeight(env.dayFrac);
  const winter = winterWeight(env.season);
  const rain = clamp01(env.rain);
  const h = Number.isFinite(camHeight) ? Math.max(0, camHeight) : 0;
  const detail = 1 - smoothstep(30, 300, h);
  const rule = (mean: number, gain: number, distance: number): SpotRule => ({
    mean: mean * thin,
    gain: clamp01(gain * quiet),
    distance: clamp01(distance),
  });

  // wolves: dusk and night
  let wolf = OFF;
  const dusk = 1 - smoothstep(-0.1, 0.35, sun);
  if (dusk > 0.45) {
    const near = clamp01(nearby.wolf / 8);
    const base = nearby.wolf > 0 ? rule(lerp(55, 28, near), 0.22 + 0.2 * near, lerp(0.55, 0.2, near)) : rule(110, 0.22, 0.85);
    wolf = {
      mean: base.mean * lerp(1, 0.7, winter),
      gain: clamp01(base.gain * (0.35 + 0.65 * detail) * (1 - 0.6 * rain)),
      distance: base.distance,
    };
  }

  // ravens: by day, more than 3 around
  let raven = OFF;
  const dayLight = smoothstep(-0.05, 0.25, sun);
  if (nearby.raven > 3 && dayLight > 0.3 && rain < 0.6) {
    const crowd = clamp01((nearby.raven - 3) / 20);
    raven = rule(lerp(30, 9, crowd), (0.35 + 0.4 * clamp01(nearby.raven / 15)) * (0.15 + 0.85 * detail), lerp(0.55, 0.3, crowd));
  }

  // bison: only when the camera is down among them
  let bison = OFF;
  if (h < 60 && nearby.bison > 5) {
    const herd = clamp01((nearby.bison - 5) / 40);
    bison = rule(lerp(26, 9, herd), (0.4 + 0.5 * clamp01(nearby.bison / 40)) * (1 - 0.6 * (h / 60)), lerp(0.4, 0.15, herd));
  }

  // thunder: storms only, more often as the rain builds
  let thunder = OFF;
  if (env.weather === Weather.Storm && rain > 0.3) {
    thunder = rule(lerp(70, 30, rain), 0.5, 0.5);
  }

  // rut: bulls bellow in late summer and early autumn when the camera is down among the herd
  let rut = OFF;
  const rutW = rutWeight(env.season);
  if (rutW > 0.25 && h < 120 && nearby.bison > 3 && rain < 0.7) {
    const herd = clamp01((nearby.bison - 3) / 30);
    rut = rule(lerp(42, 15, herd) / (0.4 + 0.6 * rutW), (0.35 + 0.35 * herd) * (1 - 0.5 * smoothstep(40, 120, h)), lerp(0.45, 0.2, herd));
  }

  // cranes: spring and autumn flyovers by day, anywhere on the map (they are high up)
  let crane = OFF;
  const craneW = craneWeight(env.season);
  const crDay = smoothstep(-0.05, 0.3, sun);
  if (craneW > 0.25 && crDay > 0.3 && rain < 0.5 && env.weather !== Weather.Storm && env.weather !== Weather.Snow) {
    crane = rule(lerp(110, 45, craneW), 0.42, 0.5);
  }
  return { wolf, raven, bison, thunder, rut, crane };
}

/** 0..1, how deep into the bison rut (peaks late summer, gone by mid autumn). season 0..4. */
export function rutWeight(season: number): number {
  const u = season01(season);
  return smoothstep(1.45, 1.7, u) * (1 - smoothstep(2.0, 2.3, u));
}

/** 0..1, how deep into a sandhill crane migration (spring: late winter to early spring; autumn: early to mid autumn). */
export function craneWeight(season: number): number {
  const u = season01(season);
  const d = u < 2 ? u + 4 : u; // spring straddles the year wrap
  const spring = smoothstep(3.85, 3.98, d) * (1 - smoothstep(4.35, 4.6, d));
  const autumn = smoothstep(2.0, 2.15, u) * (1 - smoothstep(2.55, 2.8, u));
  return Math.max(spring, autumn);
}

/** Random wait with a floor: mean * (0.4 + exponential(0.6)), capped at 4x the mean. u is a uniform [0,1) sample. */
export function nextDelay(mean: number, u: number): number {
  if (!Number.isFinite(mean)) return Infinity;
  const e = -Math.log(1 - Math.min(Math.max(u, 0), 0.999999));
  return Math.min(mean * (0.4 + 0.6 * e), mean * 4);
}

// ---------------------------------------------------------------------------------------------------- distance

/** Event distances arrive in metres (the world is 512 m square, an orbit camera can sit 700 m out). */
export const FAR_DISTANCE = 700;
export const eventDistance01 = (distance: number): number => clamp01(distance / FAR_DISTANCE);
/** Loudness falloff for one-shot events. Never fully silent: a stampede anywhere on the map is faintly audible. */
export const eventAttenuation = (distance: number): number => Math.max(0.12, 1 / (1 + Math.max(0, distance) / 150));
/** Low-pass cutoff in Hz for a 0..1 distance: 16 kHz close, 700 Hz far (log curve). */
export const distanceCutoff = (d01: number): number => 16000 * Math.pow(700 / 16000, Math.pow(clamp01(d01), 0.8));
/** Extra loudness cut for a 0..1 distance. */
export const distanceGain = (d01: number): number => 1 - 0.85 * Math.pow(clamp01(d01), 0.75);

// ---------------------------------------------------------------------------------------------------- clip segmentation

export interface Segment {
  start: number;
  end: number;
}

/**
 * Split a clip into separate sounds (calls, grunts) by finding silences between them on a 10 ms RMS envelope.
 * Returns [{0, duration}] if fewer than 2 sounds are found. Times in seconds.
 */
export function segmentClip(
  data: ArrayLike<number>,
  sampleRate: number,
  opts: { hopSec?: number; relDb?: number; floorDb?: number; minGap?: number; minLen?: number; pad?: number } = {},
): Segment[] {
  const hop = Math.max(1, Math.round((opts.hopSec ?? 0.01) * sampleRate));
  const total = data.length / sampleRate;
  const n = Math.floor(data.length / hop);
  if (n < 4) return [{ start: 0, end: total }];
  const env = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < hop; j++) {
      const v = data[i * hop + j];
      s += v * v;
    }
    env[i] = Math.sqrt(s / hop);
    if (env[i] > peak) peak = env[i];
  }
  if (peak < 1e-5) return [{ start: 0, end: total }];
  const thr = Math.max(peak * Math.pow(10, -(opts.relDb ?? 20) / 20), Math.pow(10, (opts.floorDb ?? -55) / 20));
  const hopSec = hop / sampleRate;
  const minGap = Math.round((opts.minGap ?? 0.12) / hopSec);
  const minLen = Math.round((opts.minLen ?? 0.15) / hopSec);
  const pad = opts.pad ?? 0.04;

  // active runs, bridging gaps shorter than minGap
  const runs: Array<[number, number]> = [];
  let i = 0;
  while (i < n) {
    if (env[i] < thr) {
      i++;
      continue;
    }
    let j = i;
    let last = i;
    while (j < n && j - last <= minGap) {
      if (env[j] >= thr) last = j;
      j++;
    }
    runs.push([i, last]);
    i = last + 1;
  }
  const segs: Segment[] = [];
  for (const [a, b] of runs) {
    if (b - a + 1 < minLen) continue;
    segs.push({ start: Math.max(0, a * hopSec - pad), end: Math.min(total, (b + 1) * hopSec + pad) });
  }
  return segs.length >= 2 ? segs : [{ start: 0, end: total }];
}

/** A random window inside a clip, for long continuous clips (bison huffs) that have no clean gaps. u1, u2 uniform [0,1). */
export function randomWindow(total: number, minLen: number, maxLen: number, u1: number, u2: number): Segment {
  const len = Math.min(total, lerp(minLen, maxLen, clamp01(u1)));
  const start = clamp01(u2) * Math.max(0, total - len);
  return { start, end: start + len };
}
