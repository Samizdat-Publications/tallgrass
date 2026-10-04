// The quadruped leg math as it was BEFORE the exact foot lock (R1), kept only so the foot-slip rig can print a before and after
// table. A CPU mirror of the old tgAnimate leg code: three gaits evaluated separately and their hip ANGLES blended, a
// sinusoid-free but angle-based planted leg (atan of the foot offset) lengthened by 1 / cos up to a 15% cap, the body's pitch
// cancelled in planted legs, offsets in the old convention (stance starts a quarter cycle in), MAX_CADENCE 7.5, stride from
// the hip amplitude. Not used by the game.
import type { AnimParams } from '../src/render/models/types';
import { gallopDuty } from '../src/render/models/types';
import { clamp, legLength, sstep, rotZ, gaitWeights } from '../src/render/models/legmath';
import type { LegRig } from '../src/render/models/legmath';

const OLD_CAP = 1.15;
const OLD_STRETCH_Y = Math.sqrt(OLD_CAP * OLD_CAP - 1);
export const LEGACY_MAX_CADENCE = 7.5;
/** The offsets every species had (none overrode them), in the old convention. */
export const LEGACY_OFF = {
  W: [0.25, 0.75, 0.0, 0.5],
  T: [0.0, 0.5, 0.5, 0.0],
  G: [0.5, 0.58, 0.0, 0.08],
};

const oldReach = (amp: number): number => (amp <= Math.acos(1 / OLD_CAP) ? Math.tan(amp) : Math.sin(amp) * OLD_CAP);

function oldPlantedStride(p: AnimParams, gait: 0 | 1 | 2, pace = 0): number {
  const amp = gait === 0 ? p.ampW : gait === 1 ? p.ampT : p.ampG;
  const duty = gait === 0 ? p.dutyW : gait === 1 ? p.dutyT : gallopDuty(p, pace);
  return (2 * legLength(p) * oldReach(amp)) / duty;
}

/** The old strideFor: per-gait strides weighted by the gait weights. */
export function legacyStride(p: AnimParams, spd: number): number {
  const { wW, wT, wG } = gaitWeights(p, spd);
  const sum = wW + wT + wG;
  if (sum < 1e-3) return oldPlantedStride(p, 0);
  return (wW * oldPlantedStride(p, 0) + wT * oldPlantedStride(p, 1) + wG * oldPlantedStride(p, 2, spd)) / sum;
}

function oldLegWave(u: number, beta: number): [number, number] {
  const v = (u - 0.25) - Math.floor(u - 0.25);
  if (v < beta) return [1 - (2 * v) / beta, 0];
  const s = (v - beta) / (1 - beta);
  const k = (1.2 * (1 - beta)) / beta;
  const h = s * s * (3 - 2 * s);
  const t1 = s * s * s * (1 - s);
  const t0 = s * (1 - s) * (1 - s) * (1 - s);
  return [-1 + 2 * h + k * (t1 - t0), Math.sin(Math.PI * s)];
}

function oldHipFor(y: number): number {
  const a = Math.abs(y);
  const h = a <= OLD_STRETCH_Y ? Math.atan(a) : Math.asin(Math.min(a / OLD_CAP, 1));
  return y < 0 ? -h : h;
}

export interface LegacyLeg {
  /** The foot point in the model frame before the body's own motion, and whether the foot is in stance. */
  foot: [number, number];
  stance: boolean;
}

/**
 * Foot point of leg i (0 FL, 1 FR, 2 HL, 3 HR) before the body's own motion (bob, pitch, cues are applied by the caller with
 * bodyFwd, with the body offset 0): the old tgAnimate leg branch for a living animal that is neither lying, crouching nor pouncing.
 * `bob` and `pitch` are the body's gait bob and pitch (the old planted leg cancelled the pitch and followed the bob).
 */
export function legacyLeg(p: AnimParams, rig: LegRig, spd: number, ph: number, i: number, bob: number, pitch: number): LegacyLeg {
  const { wW, wT, wG } = gaitWeights(p, spd);
  const front = i < 2;
  const b = front ? rig.front : rig.hind;
  const ow = LEGACY_OFF.W[i], ot = LEGACY_OFF.T[i], og = LEGACY_OFF.G[i];
  const dutyG = gallopDuty(p, spd);
  const lw = oldLegWave(ph + ow, p.dutyW), lt = oldLegWave(ph + ot, p.dutyT), lg = oldLegWave(ph + og, dutyG);
  let hip = wW * oldHipFor(lw[0] * oldReach(p.ampW)) + wT * oldHipFor(lt[0] * oldReach(p.ampT)) + wG * oldHipFor(lg[0] * oldReach(p.ampG));
  const lift = wW * p.kneeW * lw[1] + wT * p.kneeT * lt[1] + wG * p.kneeG * lg[1];
  const liftPeak = wW * p.kneeW + wT * p.kneeT + wG * p.kneeG;
  const stc = 1 - sstep(0, 0.3, lift / Math.max(liftPeak, 0.001));
  const hipGait = hip;
  hip -= pitch * stc;
  const knee = front ? -lift : lift * p.hockK;
  let [x, y] = rotZ(b.foot[0], b.foot[1], b.knee[0], b.knee[1], knee);
  [x, y] = rotZ(x, y, b.hip[0], b.hip[1], hip);
  const k = 1 + (clamp((1 + bob / p.comY) / Math.cos(hipGait), 0, OLD_CAP) - 1) * stc;
  x = b.hip[0] + (x - b.hip[0]) * k;
  y = b.hip[1] + (y - b.hip[1]) * k;
  // stance of the dominant gait (the rig only runs pure gaits)
  const dom = wG > wT && wG > wW ? 2 : wT > wW ? 1 : 0;
  const v = (a: number): number => (a - 0.25) - Math.floor(a - 0.25);
  const stance = dom === 0 ? v(ph + ow) < p.dutyW : dom === 1 ? v(ph + ot) < p.dutyT : v(ph + og) < dutyG;
  return { foot: [x, y], stance };
}
