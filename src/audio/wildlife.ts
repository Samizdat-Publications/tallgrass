// Pure audio policy for the R3 wildlife sounds: coyote choruses and howls, the meadowlark, the close thunder crack, and where a
// sound should sit (positional, with the camera low, or a plain distance-filtered one from up high). No Web Audio in here, so it is
// unit-testable under node (see wildlife.test.ts) and cheap to call every frame. audio.ts owns the audio graph.
import { clamp01, lerp, smoothstep, sunHeight, winterWeight } from './mix';
import type { MixEnv, SpotRule } from './mix';
import { Weather } from '../sim/types';

/** Below this camera height (m) a sound with a place in the world is panned and attenuated by a PannerNode at that place. */
export const POSITIONAL_MAX_HEIGHT = 60;

/** The clips these sounds use, by the names audio.ts loads them under. */
export type WildClip = 'coyoteChorus1' | 'coyoteChorus2' | 'coyoteHowl' | 'dogAlarm' | 'dogYip' | 'crack1' | 'crack2' | 'lark';

/** File names (without .mp3) in public/audio. */
export const WILD_FILES: Record<WildClip, string> = {
  coyoteChorus1: 'coyote_chorus_1',
  coyoteChorus2: 'coyote_chorus_2',
  coyoteHowl: 'coyote_howl',
  dogAlarm: 'prairiedog_alarm',
  dogYip: 'prairiedog_yip',
  crack1: 'thunder_crack_1',
  crack2: 'thunder_crack_2',
  lark: 'meadowlark',
};

const OFF: SpotRule = { mean: Infinity, gain: 0, distance: 1 };

export interface WildPlan {
  coyote: SpotRule;
  lark: SpotRule;
}

/**
 * Which of the new spot sounds are eligible and how often.
 * coyote  yips and howls at dusk and through the night, only while a coyote is within earshot (`coyotes` counts those near the camera);
 *         more of them make it more frequent and closer
 * lark    a meadowlark sings on spring and summer mornings (and the first hours of the day), only with the camera down in the grass
 * At speed >= 10 both thin out (a quarter as often, a little quieter); speed 0 (paused) is silent.
 */
export function wildPlan(env: MixEnv, camHeight: number, coyotes: number, speed: number): WildPlan {
  if (!(speed > 0)) return { coyote: OFF, lark: OFF };
  const thin = speed >= 10 ? 4 : 1;
  const quiet = speed >= 10 ? 0.75 : 1;
  const sun = sunHeight(env.dayFrac);
  const winter = winterWeight(env.season);
  const rain = clamp01(env.rain);
  const h = Number.isFinite(camHeight) ? Math.max(0, camHeight) : 0;
  const detail = 1 - smoothstep(30, 300, h);

  let coyote = OFF;
  const dusk = 1 - smoothstep(-0.1, 0.35, sun);
  if (dusk > 0.45 && coyotes > 0) {
    const near = clamp01(coyotes / 6);
    coyote = {
      mean: lerp(70, 32, near) * thin * lerp(1, 0.75, winter),
      gain: clamp01((0.3 + 0.2 * near) * (0.35 + 0.65 * detail) * (1 - 0.6 * rain) * quiet),
      distance: lerp(0.5, 0.25, near),
    };
  }

  let lark = OFF;
  // spring and summer (season 0 to about 1.9, fading out into autumn), the morning hours (sunrise at dayFrac 0.25, gone by about 0.5)
  const u = ((env.season % 4) + 4) % 4;
  const warmSeason = 1 - smoothstep(1.7, 2.1, u);
  const morning = smoothstep(0.2, 0.27, env.dayFrac) * (1 - smoothstep(0.42, 0.52, env.dayFrac));
  const low = 1 - smoothstep(20, 60, h);
  const calm = 1 - 0.7 * smoothstep(0.5, 0.9, clamp01(env.windStrength));
  if (warmSeason > 0.3 && morning > 0.25 && low > 0.05 && rain < 0.3 && env.weather !== Weather.Storm && env.weather !== Weather.Snow) {
    lark = {
      mean: (20 / (warmSeason * (0.4 + 0.6 * morning))) * thin,
      gain: clamp01(0.4 * low * calm * quiet),
      distance: 0.2,
    };
  }
  return { coyote, lark };
}

/** Which coyote clip to play: mostly a chorus, now and then a single howl. u1 and u2 are uniform [0, 1) samples. */
export function pickCoyoteClip(u1: number): WildClip {
  return u1 < 0.4 ? 'coyoteChorus1' : u1 < 0.8 ? 'coyoteChorus2' : 'coyoteHowl';
}

/**
 * A close lightning strike's thunder. `distance` is how far away the strike was (m). Within 1.2 km the crack plays (two takes),
 * louder and sharper the closer it is; beyond it only the rolling rumble of the old distant-thunder clip does. The crack's low-pass
 * opens with nearness. Gain is 0..1 before the master bus.
 */
export function thunderPlan(distance: number, u: number): { clip: 'crack1' | 'crack2' | 'rumble'; gain: number; cutoffD01: number; rate: number } {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : 600;
  if (d > 1200) return { clip: 'rumble', gain: clamp01(0.55 * (1 - smoothstep(1200, 4000, d)) + 0.1), cutoffD01: 0.7, rate: 0.9 + 0.1 * u };
  return {
    clip: u < 0.5 ? 'crack1' : 'crack2',
    gain: clamp01(1.0 / (1 + d / 450)),
    // the very close ones are not softened at all
    cutoffD01: clamp01(d / 2200),
    rate: 0.96 + 0.08 * u,
  };
}

/**
 * Where a positional sound goes. With the camera low (under POSITIONAL_MAX_HEIGHT) it is placed at the source (`positional`);
 * from up high it is a plain sound with a distance from the camera (`distance01`, 0 close .. 1 far) and no panning.
 */
export function placement(camHeight: number, groundDist: number): { positional: boolean; distance01: number } {
  const h = Number.isFinite(camHeight) ? Math.max(0, camHeight) : 0;
  return { positional: h < POSITIONAL_MAX_HEIGHT, distance01: clamp01(groundDist / 500) };
}

/** A random spot for a bird near the camera: a ring 20 to 70 m out, at angle `a` (rad) and radius fraction `r` (0..1). */
export function larkSpot(camX: number, camZ: number, a: number, r: number): { x: number; z: number } {
  const d = lerp(20, 70, clamp01(r));
  return { x: camX + Math.cos(a) * d, z: camZ + Math.sin(a) * d };
}

// ---- R5 raptors: the red-tailed hawk's scream and the golden eagle's call. The animal layer says when a raptor calls (now and then while one is in
// earshot, and a scream as a stoop begins); this picks the clip, how loud, and how it is pitched.

/** The raptor clips, by the names audio.ts loads them under (file names without .mp3, in public/audio). */
export type RaptorClip = 'hawkScream1' | 'hawkScream2' | 'eagleCall';
export const RAPTOR_FILES: Record<RaptorClip, string> = {
  hawkScream1: 'hawk_scream_1',
  hawkScream2: 'hawk_scream_2',
  eagleCall: 'eagle_call_2',
};

/** Least real seconds between two raptor sounds (a flock of them, or a stoop in a run of stoops, must not machine-gun the same scream). */
export const RAPTOR_GAP = 3.5;

/**
 * One raptor sound. `species` is 'hawk' or 'eagle'; `scream` is the cry of a stoop beginning (sharper, a little higher and louder than the idle calls).
 * u1 and u2 are uniform [0, 1) samples. The eagle's clip is played lower than it was recorded: an eagle is a bigger bird and its voice should not be the
 * hawk's. The returned `gain` is 0..1 before the master bus.
 */
export function raptorCall(species: 'hawk' | 'eagle', scream: boolean, u1: number, u2: number): { clip: RaptorClip; gain: number; rate: number } {
  if (species === 'hawk') {
    return {
      clip: u1 < 0.5 ? 'hawkScream1' : 'hawkScream2',
      gain: scream ? 0.95 : 0.7,
      rate: scream ? 1.1 + 0.1 * u2 : 0.94 + 0.14 * u2,
    };
  }
  return { clip: 'eagleCall', gain: scream ? 0.9 : 0.62, rate: scream ? 0.92 + 0.08 * u2 : 0.78 + 0.1 * u2 };
}
