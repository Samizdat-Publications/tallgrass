import type * as THREE from 'three';

/** Gait and pose constants for one species. Angles in radians, lengths in meters, speeds in m/s. */
export interface AnimParams {
  /** 0 quadruped, 1 hopper, 2 bird. */
  kind: 0 | 1 | 2;
  /** Height of the pivot used for body pitch. */
  comY: number;
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
  /** Metres travelled per leg cycle at a walk and at a full gallop (drives stride frequency on the CPU). */
  strideW: number;
  strideG: number;
  /** Speed (m/s) at which the walk to gallop stride interpolation completes. */
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
