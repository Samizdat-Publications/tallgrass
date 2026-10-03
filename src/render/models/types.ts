import type * as THREE from 'three';

/** Gait and pose constants for one species. Angles in radians, lengths in meters, speeds in m/s. */
export interface AnimParams {
  /** 0 quadruped, 1 hopper, 2 bird. */
  kind: 0 | 1 | 2;
  /** Height of the pivot used for body pitch. */
  comY: number;
  /** Hip pivot to ground (m) when standing; the stride of a planted foot scales with it. Defaults to comY. */
  legL?: number;
  /** Walk to trot blend range and trot to gallop blend range (m/s). */
  trot0: number;
  trot1: number;
  gal0: number;
  gal1: number;
  /** Hip swing amplitude per gait. */
  ampW: number;
  ampT: number;
  ampG: number;
  /** Knee/hock flexion peak per gait. */
  kneeW: number;
  kneeT: number;
  kneeG: number;
  /** Body bob (m) per gait. */
  bobW: number;
  bobT: number;
  bobG: number;
  /** Body pitch (rad) per gait. */
  pitchT: number;
  pitchG: number;
  /** Head nod (rad) walk / gallop. */
  nodW: number;
  nodG: number;
  /** Head pitch when grazing, drinking or feeding (rad, positive = down). */
  headDown: number;
  /** Idle head look-around yaw (rad). */
  lookYaw: number;
  /** Tail: lift at rest, lift when galloping, lateral sway (rad). */
  tailRest: number;
  tailRun: number;
  tailSway: number;
  /** Lying pose: body drop (m) and leg fold (hip, knee) for fore and hind legs. */
  lieDrop: number;
  lieHipF: number;
  lieKneeF: number;
  lieHipH: number;
  lieKneeH: number;
  /** Stalking crouch body drop (m). */
  crouchDrop: number;
  /** Carcass pose: roll, drop, stiff leg angles. */
  deadDrop: number;
  deadHipF: number;
  deadHipH: number;
  /** Hind-leg hock flexion scale (flexion for hind legs goes forward). */
  hockK: number;
  /** Gait offsets (cycle fractions) in order FL, FR, HL, HR. */
  offW: [number, number, number, number];
  offT: [number, number, number, number];
  offG: [number, number, number, number];
  /**
   * Stance fraction (share of each leg cycle a foot is on the ground) per gait, quadrupeds only. During stance the foot
   * sweeps back at a constant rate, so a leg cycle of `plantedStride()` metres leaves it exactly planted.
   */
  dutyW: number;
  dutyT: number;
  dutyG: number;
  /**
   * Metres per leg cycle at a walk and at a full gallop, and the speed at which the interpolation completes. Used for
   * hoppers and birds only: quadrupeds derive their stride from the hip amplitude and stance fraction (plantedStride).
   */
  strideW: number;
  strideG: number;
  strideSpeedMax: number;
  /** Wing beat frequency (Hz), birds only. */
  flapHz: number;
  /** Footprint for terrain alignment and picking. */
  length: number;
  height: number;
  /** Radius of the selection ring (m). */
  ring: number;
  /** Minimum on-screen length in pixels (on a 900 px tall viewport) before the animal is gently scaled up with distance. */
  minPx: number;
  /** Model length (m) used for that screen-size estimate. */
  boostLen: number;
}

/** A planted leg may lengthen at most this much (the shader's 1 / cos(hip) stretch that keeps the foot on the ground). */
export const STRETCH_CAP = 1.15;

/**
 * Foot offset ahead of the hip (in leg lengths) at hip angle `amp`, for a planted leg: tan(amp) while the leg can stay
 * on the ground by lengthening, sin(amp) * STRETCH_CAP once it hits the cap.
 */
export function footReach(amp: number): number {
  return amp <= Math.acos(1 / STRETCH_CAP) ? Math.tan(amp) : Math.sin(amp) * STRETCH_CAP;
}

/**
 * Metres a planted foot sweeps back per leg cycle for gait 0 walk, 1 trot, 2 gallop (quadrupeds): the foot travels
 * 2 * L * reach(hip amplitude) along the ground, spread over the stance fraction of the cycle. Run the cycle at
 * speed / stride Hz and the planted foot stands still on the ground.
 */
export function plantedStride(p: AnimParams, gait: 0 | 1 | 2): number {
  const amp = gait === 0 ? p.ampW : gait === 1 ? p.ampT : p.ampG;
  const duty = gait === 0 ? p.dutyW : gait === 1 ? p.dutyT : p.dutyG;
  return (2 * (p.legL ?? p.comY) * footReach(amp)) / duty;
}

export interface ModelDef {
  geometry: THREE.BufferGeometry;
  params: AnimParams;
  /** Linear RGB coat palette: pale end and dark end. */
  coatPale: [number, number, number];
  coatDark: [number, number, number];
  /** Carcass bone colour, linear. */
  bone: [number, number, number];
  roughness: number;
  /** Multiplier on the hemisphere (sky) fill light for this species. */
  fill: number;
  /** Tint of the neutralised sky fill (linear RGB, around 1). Warm for brown animals so shade stays brown, not grey-blue. */
  warm: [number, number, number];
  /** 0..1: how far the sky fill is pulled to a neutral grey (times `warm`) before it lights the coat. */
  neutral: number;
  /**
   * Distance readability, all fading in between about 140 and 400 m from the camera: the coat is scaled by `gain` (value
   * contrast against the grass), edges glow `rimCol` at `rim` strength, and by another `hunt` while the animal stalks,
   * chases or feeds.
   */
  far?: { gain: number; rim: number; hunt: number; rimCol: [number, number, number] };
  triangles: number;
}

export const DEFAULT_PARAMS: AnimParams = {
  kind: 0,
  comY: 1,
  trot0: 1.6,
  trot1: 2.4,
  gal0: 4.5,
  gal1: 6,
  ampW: 0.42,
  ampT: 0.55,
  ampG: 0.78,
  kneeW: 0.5,
  kneeT: 0.7,
  kneeG: 1.0,
  bobW: 0.02,
  bobT: 0.04,
  bobG: 0.1,
  pitchT: 0.02,
  pitchG: 0.1,
  nodW: 0.07,
  nodG: 0.1,
  headDown: 1.0,
  lookYaw: 0.35,
  tailRest: 0,
  tailRun: 0.6,
  tailSway: 0.25,
  lieDrop: 0.5,
  lieHipF: 1.2,
  lieKneeF: -2.2,
  lieHipH: -0.9,
  lieKneeH: 2.0,
  crouchDrop: 0.1,
  deadDrop: 0.5,
  deadHipF: 0.9,
  deadHipH: -0.5,
  hockK: 0.8,
  offW: [0.25, 0.75, 0.0, 0.5],
  offT: [0.0, 0.5, 0.5, 0.0],
  offG: [0.5, 0.58, 0.0, 0.08],
  dutyW: 0.62,
  dutyT: 0.5,
  dutyG: 0.42,
  strideW: 1.8,
  strideG: 5,
  strideSpeedMax: 12,
  flapHz: 4,
  length: 3,
  height: 1.8,
  ring: 2.2,
  minPx: 9,
  boostLen: 3,
};
