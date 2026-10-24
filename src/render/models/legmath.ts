// CPU mirror of the quadruped leg math in models/shader.ts (tgAnimate, KIND 0). The vertex shader is ported from this file
// function by function (the GLSL names are given next to each one), so the foot-slip rig (dev/footslip.ts), the animal layer's
// phase and body-height code and the shader all agree on where a foot is.
//
// The model of a leg: the leg mesh is rigid above and below the knee (aPart.y weights the blend). The hip pivot rotates the whole
// leg, the knee pivot rotates the lower part. Angles are measured from straight down, positive = foot forward (+x).
//
//   1. gaitMix:   walk, trot and gallop parameters are BLENDED by speed (stance share, stride, lift, per-leg offsets) and a
//                 single foot path is evaluated, so a gait change never resets or splits the phase.
//   2. legWave:   the foot path along the body. During stance (u < beta) it slides back LINEARLY at exactly the body speed
//                 (stride S metres per cycle), so a planted foot stands still on the ground; the swing is an eased return.
//   3. solveLeg:  two-bone analytic IK (plus a final stretch of at most IK_CAP) puts the foot point on the target the path asks
//                 for, a point on the ground (read from the height texture within 45 m) raised by the swing lift.
//
// Units: model space metres (before the instance scale), x forward, y up.
import type { AnimParams } from './types';
import { IK_CAP, gallopDuty, plantedStride, stotStride } from './types';

export const TAU = Math.PI * 2;
/** Swing lift height as a share of the leg length per radian of the species' knee flexion parameter (kneeW/T/G). */
export const LIFT_K = 0.4;
/**
 * How far the body sinks while it moves, as a share of the leg length, at a walk, trot and gallop: the stance legs run with the
 * knees a little bent (as a real animal's do) instead of as straight rods, and the foot then reaches the ground at the ends of
 * its sweep without stretching. Faded in with the gait amplitude.
 */
export const LEG_FLEX = [0.035, 0.06, 0.09];
/** The IK fades out between these camera distances (m): beyond it a leg aims at flat ground (the cheap path). */
export const IK_NEAR = 40;
export const IK_FAR = 45;
/**
 * Fixed-point passes the body-motion compensation of a leg target takes (GLSL: one tgBodyFwd call each in the leg branch). One pass
 * leaves a planted foot sliding 15 to 25% of the body's travel once the distance cues of a gallop (bound, spine arch, pitch) are
 * big, three bring it under 8%.
 */
export const IK_PASSES = 3;

// ---------------------------------------------------------------------------------------------------------------------
// Slope response (GLSL: tgSlope in tgAnimate). Everything is derived from the instance's own terrain pitch and roll, which the animal
// layer writes into the instance matrix, so no instance attribute is needed. The body-frame pitch and roll below are applied in
// bodyFwd (not in the instance matrix), so the legs' IK takes them back out of the foot targets and a planted foot stays planted.

/** Share of the terrain pitch and roll added again at the drone view (smoothstep(25, 140, camera distance)): a herd rides the swells. */
export const FAR_TILT = 0.35;
/** Uphill the body leans in (steeper than the ground by this share of the slope) and strides shorten; downhill it sits back and braces. */
export const LEAN_IN = 0.18;
export const LEAN_BRACE = 0.12;
export const STRIDE_UP = 0.3;
export const STRIDE_DOWN = 0.1;
/** Share of the body's total pitch that the head cancels (the head stays nearer level than the body on a slope). */
export const HEAD_COUNTER = 0.3;

export interface SlopeResponse {
  /** Extra body-frame pitch and roll (rad) on top of the instance's terrain pitch and roll. */
  dp: number;
  dr: number;
  /** Stride multiplier (1 on the flat, 0.7 steep uphill, 0.9 steep downhill). */
  strideK: number;
  /** Head pitch correction (rad): added to the head angle, so it is negative when the body pitches up. */
  head: number;
}
/** Slope response for an instance at terrain pitch `ip` (+ = nose up, uphill) and roll `ir`, seen from camera distance `camD`. */
export function slopeResponse(ip: number, ir: number, camD: number, out?: SlopeResponse): SlopeResponse {
  const o = out ?? { dp: 0, dr: 0, strideK: 1, head: 0 };
  const fk = sstep(25, 140, camD);
  const up = sstep(0.12, 0.4, ip), dn = sstep(0.12, 0.4, -ip);
  o.dp = ip * FAR_TILT * fk + (ip > 0 ? LEAN_IN * ip * up : -LEAN_BRACE * ip * dn);
  o.dr = ir * FAR_TILT * fk;
  o.strideK = 1 - STRIDE_UP * up - STRIDE_DOWN * dn;
  o.head = -HEAD_COUNTER * (ip + o.dp);
  return o;
}
/** Stride multiplier of a terrain pitch (what the animal layer divides the distance by to advance the phase). */
export function slopeStrideK(ip: number): number {
  return 1 - STRIDE_UP * sstep(0.12, 0.4, ip) - STRIDE_DOWN * sstep(0.12, 0.4, -ip);
}

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const sstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (x: number): number => x - Math.floor(x);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------------------------------
// Leg geometry (read from the mesh)

/** One leg in the rest pose: hip pivot, knee (or hock) pivot and the lowest point of the paw, all (x, y) in model space. */
export interface LegBones {
  hip: [number, number];
  knee: [number, number];
  foot: [number, number];
  /** Distance of the hip pivot from the body's midline (m; the right legs are at +z, the left legs at -z), and of the paw. */
  z: number;
  footZ: number;
}
export interface LegRig {
  front: LegBones;
  hind: LegBones;
}

/** Reads the rest-pose bones of the front and hind legs from a model geometry (aPart 1..4, aPivot, aPivot2, position). */
export function legRigOf(g: { getAttribute(n: string): { array: ArrayLike<number>; count: number } }): LegRig {
  const pos = g.getAttribute('position').array;
  const part = g.getAttribute('aPart').array;
  const piv = g.getAttribute('aPivot').array;
  const piv2 = g.getAttribute('aPivot2').array;
  const n = g.getAttribute('position').count;
  const bones = (a: number, b: number): LegBones => {
    let miny = Infinity, fx = 0, fz = 0, hx = 0, hy = 0, kx = 0, ky = 0, hz = 0;
    for (let i = 0; i < n; i++) {
      const pt = Math.round(part[i * 4]);
      if (pt !== a && pt !== b) continue;
      hx = piv[i * 3]; hy = piv[i * 3 + 1]; kx = piv2[i * 3]; ky = piv2[i * 3 + 1]; hz = Math.abs(piv[i * 3 + 2]);
      if (pos[i * 3 + 1] < miny) { miny = pos[i * 3 + 1]; fx = pos[i * 3]; fz = Math.abs(pos[i * 3 + 2]); }
    }
    return { hip: [hx, hy], knee: [kx, ky], foot: [fx, miny], z: hz, footZ: fz };
  };
  return { front: bones(1, 2), hind: bones(3, 4) };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Gait blend (GLSL: the gN / betaB / strideB / liftB / offB block at the top of the leg branch of tgAnimate)

export interface GaitMix {
  /** Raw gait weights before the rest/stagger fade (walk, trot, gallop) and their sum, 0 at a standstill. */
  w: [number, number, number];
  sum: number;
  /** The same weights normalised to sum to 1 (pure walk at a standstill). */
  n: [number, number, number];
  /** Gait amplitude 0..1 (fades the foot path in below walking pace). */
  amt: number;
  /** Stance share of the cycle. */
  beta: number;
  /** Metres of ground per leg cycle (model units; the animal layer multiplies by the drawn scale). */
  stride: number;
  /** Peak swing lift of the foot (m). */
  lift: number;
  /** How far the body sinks while moving so the knees stay bent (m, positive = down). */
  flex: number;
  /** Per-leg phase offsets FL, FR, HL, HR. */
  off: [number, number, number, number];
  /** r-prong: how far a swinging foot is drawn in toward the hip at mid swing (AnimParams.tuck, weighted by the gallop share). */
  tuck: number;
}

export const legLength = (p: AnimParams): number => p.legL ?? p.comY;

/** Gait weights by speed (m/s on screen at 1x), the same bands the shader uses. */
export function gaitWeights(p: AnimParams, spd: number): { wW: number; wT: number; wG: number; s1: number } {
  const s1 = sstep(p.trot0, p.trot1, spd);
  const wG = sstep(p.gal0, p.gal1, spd);
  return { wW: sstep(0.08, 0.4, spd) * (1 - s1), wT: s1 * (1 - wG), wG, s1 };
}

export function gaitMix(p: AnimParams, spd: number, stot = 0, strideK = 1): GaitMix {
  const { wW, wT, wG } = gaitWeights(p, spd);
  const sum = wW + wT + wG;
  const n: [number, number, number] = sum < 1e-3 ? [1, 0, 0] : [wW / sum, wT / sum, wG / sum];
  const L = legLength(p);
  const dutyG = gallopDuty(p, spd);
  let beta = n[0] * p.dutyW + n[1] * p.dutyT + n[2] * dutyG;
  let stride = n[0] * plantedStride(p, 0) + n[1] * plantedStride(p, 1) + n[2] * plantedStride(p, 2, spd);
  let lift = LIFT_K * L * (n[0] * p.kneeW + n[1] * p.kneeT + n[2] * p.kneeG);
  const flex = L * (n[0] * LEG_FLEX[0] + n[1] * LEG_FLEX[1] + n[2] * LEG_FLEX[2]) * Math.min(sum, 1);
  let off = [0, 1, 2, 3].map((i) => n[0] * p.offW[i] + n[1] * p.offT[i] + n[2] * p.offG[i]) as GaitMix['off'];
  if (stot > 0 && p.stot) {
    // R6 stotting: the foot path of the bounds (GLSL: the STOT block after the gait blend). One path, blended by the weight.
    const st = p.stot;
    beta = mix(beta, st.duty, stot);
    stride = mix(stride, stotStride(p), stot);
    lift = mix(lift, LIFT_K * L * st.knee, stot);
    off = off.map((o, i) => mix(o, st.off[i], stot)) as GaitMix['off'];
  }
  stride *= strideK; // slope: shorter steps uphill (see slopeResponse)
  return { w: [wW, wT, wG], sum, n, amt: Math.min(sum, 1), beta, stride, lift, flex, off, tuck: n[2] * (p.tuck ?? 0) };
}

/**
 * Metres of ground per leg cycle at a gait pace (the phase advances by distance / this, see AnimalLayer.update). The same number
 * as gaitMix(p, spd).stride, without allocating (it runs for every animal every frame).
 */
export function gaitStride(p: AnimParams, spd: number, stot = 0, strideK = 1): number {
  const s1 = sstep(p.trot0, p.trot1, spd);
  const wG = sstep(p.gal0, p.gal1, spd);
  const wT = s1 * (1 - wG);
  const wW = sstep(0.08, 0.4, spd) * (1 - s1);
  const sum = wW + wT + wG;
  const base = sum < 1e-3 ? plantedStride(p, 0) : (wW * plantedStride(p, 0) + wT * plantedStride(p, 1) + wG * plantedStride(p, 2, spd)) / sum;
  return (stot > 0 && p.stot ? mix(base, stotStride(p), stot) : base) * strideK;
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Foot path (GLSL: tgLegWave and the footX / footLift lines)

/**
 * u = leg phase 0..1, beta = stance share. Returns [W, arc]: W is the foot position along the stride (+1 front end .. -1 back
 * end), arc the 0..1 height profile of the lifted foot. Stance: W falls linearly from 1 to -1 over u in [0, beta], so the foot
 * moves back at a constant rate and (with the cycle run at speed / stride) stays put on the ground. Swing: an eased return
 * with a small retraction just before touchdown, so the foot lands already moving back.
 */
export function legWave(u: number, beta: number): [number, number] {
  const v = fract(u);
  if (v < beta) return [1 - (2 * v) / beta, 0];
  const s = (v - beta) / (1 - beta);
  const k = (1.2 * (1 - beta)) / beta;
  const h = s * s * (3 - 2 * s);
  const t1 = s * s * s * (1 - s);
  const t0 = s * (1 - s) * (1 - s) * (1 - s);
  return [-1 + 2 * h + k * (t1 - t0), Math.sin(Math.PI * s)];
}

/** Foot offset along the body from its rest position (m) and its lift (m) for leg i (0 FL, 1 FR, 2 HL, 3 HR). */
export function footPath(gm: GaitMix, ph: number, i: number, calmK = 1): { footX: number; lift: number; u: number; stance: boolean } {
  const u = fract(ph + gm.off[i]);
  const [W, arc] = legWave(u, gm.beta);
  const k = gm.amt * calmK;
  return { footX: 0.5 * gm.beta * gm.stride * W * (1 - gm.tuck * Math.sqrt(arc)) * k, lift: gm.lift * arc * k, u, stance: u < gm.beta };
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Two-bone IK (GLSL: tgSolveLeg)

export interface LegSolution {
  /** Hip rotation (about the hip pivot) and knee rotation (about the knee pivot, weighted by aPart.y), radians. */
  hip: number;
  knee: number;
  /** Uniform stretch of the whole leg about the hip, 1 .. IK_CAP. */
  stretch: number;
  /** True when the target was beyond what the stretch can reach (the foot falls short). */
  short: boolean;
}

/**
 * Puts the foot point of `b` at (tx, ty) (model space, before the body's own motion). The knee bends the way the leg is built:
 * forelegs fold the foot backward, hind legs forward (`front` picks the branch). If the target is further than the straight
 * leg the whole leg lengthens, at most IK_CAP.
 */
export function solveLeg(b: LegBones, front: boolean, tx: number, ty: number): LegSolution {
  const u1x = b.knee[0] - b.hip[0], u1y = b.knee[1] - b.hip[1];
  const u2x = b.foot[0] - b.knee[0], u2y = b.foot[1] - b.knee[1];
  const l1 = Math.hypot(u1x, u1y), l2 = Math.hypot(u2x, u2y);
  const a1 = Math.atan2(u1x, -u1y), a2 = Math.atan2(u2x, -u2y);
  const Tx = tx - b.hip[0], Ty = ty - b.hip[1];
  const d = Math.hypot(Tx, Ty);
  const dmax = l1 + l2, dmin = Math.abs(l1 - l2) + 0.002;
  const dc = clamp(d, dmin, dmax);
  const cg = clamp((l1 * l1 + l2 * l2 - dc * dc) / (2 * l1 * l2), -1, 1);
  const bend = Math.PI - Math.acos(cg); // 0 = straight
  const s = front ? -1 : 1;
  const alpha = Math.atan2(l2 * Math.sin(bend), l1 + l2 * Math.cos(bend));
  const phi = Math.atan2(Tx, -Ty); // direction to the target, from straight down
  const A1 = phi - s * alpha; // thigh direction
  const delta = s * bend; // knee: shin direction minus thigh direction
  const want = d / dmax;
  const stretch = clamp(want, 1, IK_CAP);
  return { hip: A1 - a1, knee: delta - (a2 - a1), stretch, short: want > IK_CAP + 1e-6 };
}

/** Applies a leg solution to a point of the leg mesh with knee weight w1: the vertex path of tgAnimate (rotate, rotate, stretch). */
export function poseLegPoint(b: LegBones, sol: { hip: number; knee: number; stretch: number }, p: [number, number], w1: number): [number, number] {
  let [x, y] = p;
  [x, y] = rotZ(x, y, b.knee[0], b.knee[1], sol.knee * w1);
  [x, y] = rotZ(x, y, b.hip[0], b.hip[1], sol.hip);
  return [b.hip[0] + (x - b.hip[0]) * sol.stretch, b.hip[1] + (y - b.hip[1]) * sol.stretch];
}

/** GLSL tgRotZ on (x, y). */
export function rotZ(x: number, y: number, cx: number, cy: number, a: number): [number, number] {
  const cs = Math.cos(a), sn = Math.sin(a);
  const dx = x - cx, dy = y - cy;
  return [cx + cs * dx - sn * dy, cy + sn * dx + cs * dy];
}

// ---------------------------------------------------------------------------------------------------------------------
// The body's own motion on top of the legs (GLSL: tgBodyFwd). Bob, pitch, the distance cues (which already start at 20 m) and the
// body-height offset from the terrain. The IK aims at a point and takes this motion back out, so the foot lands where asked.

export interface BodyMotion {
  /** Vertical offset of the body (bob + terrain offset, m) and its pitch (rad) about (0, comY), plus the slope's extra roll (rad, about the body axis). */
  yoff: number;
  pitch: number;
  roll: number;
  /** R6 stotting weight 0..1 (the whole-body cues of the gallop give way to the bounds' own bob and pitch). */
  stot: number;
  /** Distance cue strength 0..1 (smoothstep(20, 110, camera distance)), the body length used to size the cues, and gait weights. */
  farK: number;
  bl: number;
  w: [number, number, number];
  cyc: number;
  /** Rotary-gallop spine (AnimParams.spine): the signed back curvature (positive = arched) and the shoulder/hip twist now, 0 for a species without it. */
  spA: number;
  spR: number;
}

/** Spine motion: share of the gallop's flex at a trot, and the cycle phase (rad) at which the back is most arched (GLSL: SPINE_TROT, SPINE_PHASE). */
export const SPINE_TROT = 0.25;
export const SPINE_PHASE = 0.94;
/**
 * The curve of the back: the height offset at body x (as a share of the half length hl = boostLen * 0.55) is
 * 0.1 * hl * spA * (1 - lncosh(2 xc) / LNCOSH1), xc = clamp(x / hl, -0.8, 0.8): zero at x = +-0.5 hl (the shoulders and the hips stay
 * level, so the legs do not have to stretch), the middle of the back rises when arched and the head and tail ends dip. Its slope is
 * -SPINE_K * spA * tanh(2 xc) (the tilt of the normals, and what the head cancels).
 */
export const LNCOSH1 = Math.log(Math.cosh(1));
export const SPINE_K = 0.2 / LNCOSH1;
/** Height offset (m) of the spine curve at body x for a curvature spA. */
export function spineOffset(spA: number, hl: number, x: number): number {
  const xc = clamp(x / hl, -0.8, 0.8);
  return 0.1 * hl * spA * (1 - Math.log(Math.cosh(2 * xc)) / LNCOSH1);
}

/**
 * Bob, pitch and sink of the body for a gait (the faded weights gm.w, GLSL: bob, pitch and flex in tgAnimate), plus the vertical
 * body offset `dy` from the terrain.
 */
export function bodyMotion(p: AnimParams, gm: GaitMix, ph: number, farK: number, dy: number, stot = 0, dp = 0, dr = 0): BodyMotion {
  const w = gm.w;
  const cyc = TAU * ph;
  let bob = w[0] * p.bobW * Math.cos(2 * cyc) + w[1] * p.bobT * Math.cos(2 * cyc) + w[2] * p.bobG * Math.cos(cyc - 0.5);
  let pitch = w[1] * p.pitchT * Math.sin(2 * cyc + 0.5) + w[2] * p.pitchG * Math.sin(cyc + 1.0);
  const st = p.stot;
  if (stot > 0 && st) {
    // R6 stotting (GLSL: the STOT block after bob and pitch): in the stance the body sinks and pitches up from landing to take-off, in
    // the air it rises on a sine arc (the feet tuck up with it, see gaitMix) and pitches from nose up to nose down
    const u = ph - Math.floor(ph);
    let sb: number, sp: number;
    if (u < st.duty) {
      const a = u / st.duty;
      sb = -st.sink * Math.sin(Math.PI * a);
      sp = st.pitch * (2 * a - 1);
    } else {
      const s = (u - st.duty) / (1 - st.duty);
      sb = st.bob * Math.sin(Math.PI * s);
      sp = st.pitch * Math.cos(Math.PI * s);
    }
    bob = mix(bob, sb, stot);
    pitch = mix(pitch, sp, stot);
  }
  // rotary gallop spine: gathered phase (all four feet under the body, hind feet reaching forward and fore feet back) at phase 0.85 of the offG order,
  // so the back arches there and hollows half a cycle later, when the fore feet reach and the hind feet trail
  const sp = p.spine;
  const wSp = sp ? (w[1] * SPINE_TROT + w[2]) * (1 - stot) : 0;
  const spA = sp ? sp.flex * wSp * Math.cos(cyc + SPINE_PHASE) : 0;
  const spR = sp ? sp.twist * wSp * Math.sin(cyc + SPINE_PHASE - 0.04) : 0;
  return { yoff: bob - gm.flex + dy, pitch: pitch + dp, roll: dr, stot, farK, bl: p.boostLen, w, cyc, spA, spR };
}

/** Forward body transform of a model-space point (x, y, z). */
export function bodyFwd(p: AnimParams, m: BodyMotion, pt: [number, number, number], spineX?: number): [number, number, number] {
  let [x, y, z] = pt;
  y += m.yoff;
  [x, y] = rotZ(x, y, 0, p.comY, m.pitch);
  if (m.roll !== 0) {
    // the slope's roll (tgRotX about (0, comY)): the legs' y shift from it is taken back out by the IK, like the pitch
    const cs = Math.cos(m.roll), sn = Math.sin(m.roll);
    const dy = y - p.comY;
    [y, z] = [p.comY + cs * dy - sn * z, sn * dy + cs * z];
  }
  if (m.spA !== 0 || m.spR !== 0) {
    // the spine (GLSL: the SPINE block of tgBodyFwd): a hinge smoothed over the middle of the back (tanh tilt), nose-down shoulders and nose-up hips when arched, and the shoulders
    // and hips rolling against each other
    // (a leg is a rigid part that hangs from its hip: it is moved by the curve at its hip's x, `spineX`, and does not roll)
    const half = m.bl * 0.55;
    y += spineOffset(m.spA, half, spineX ?? x);
    if (m.spR !== 0 && spineX === undefined) {
      const rho = m.spR * clamp(x / half, -1.3, 1.3);
      const cs = Math.cos(rho), sn = Math.sin(rho);
      const dy = y - p.comY;
      [y, z] = [p.comY + cs * dy - sn * z, sn * dy + cs * z];
    }
  }
  if (m.farK > 0.001) {
    const k1 = 1 - m.stot; // (the bounds of a stot have their own rise and fall)
    const wW = m.w[0] * k1, wT = m.w[1] * k1, wG = m.w[2] * k1;
    const c = m.cyc, bl = m.bl;
    const gc = p.galCue ?? 1;
    const hop = wW * 0.03 * Math.cos(2 * c) + wT * 0.08 * Math.cos(2 * c) + wG * gc * 0.16 * Math.cos(c - 0.5);
    const xn = clamp(x / (bl * 0.55), -1.3, 1.3);
    const arch = (wT * 0.04 + wG * gc * 0.08) * Math.cos(c + 1.0) * (0.35 - xn * xn);
    const snake = (wW * 0.02 + wT * 0.036 + wG * 0.04) * Math.sin(c + 0.3) * xn;
    y += bl * m.farK * (hop + arch);
    z += bl * m.farK * snake;
    [x, y] = rotZ(x, y, 0, p.comY, m.farK * (wW * 0.03 * Math.sin(2 * c + 0.5) + wT * 0.09 * Math.sin(2 * c + 0.5) + wG * gc * 0.2 * Math.sin(c + 1.0)));
    // rolling from side to side (tgRotX about (0, comY))
    const a = m.farK * (wW * 0.03 + wT * 0.055 + wG * 0.06) * Math.sin(c + 0.9);
    const cs = Math.cos(a), sn = Math.sin(a);
    const dy = y - p.comY;
    [y, z] = [p.comY + cs * dy - sn * z, sn * dy + cs * z];
  }
  return [x, y, z];
}

// ---------------------------------------------------------------------------------------------------------------------
// One leg, end to end: the foot target and its solution (GLSL: the leg branch of tgAnimate)

export interface LegAim {
  /** Where the foot point is wanted in the final (post body motion) model frame, and the solution that puts it there. */
  target: [number, number, number];
  sol: LegSolution;
  path: { footX: number; lift: number; u: number; stance: boolean };
}

/**
 * `groundY` is the height of the ground under the foot in the model frame relative to the model's own ground plane (m); 0 for the
 * cheap flat path. The target is raised by the swing lift, and the body's own motion is taken back out with one correction step.
 */
export function aimLeg(
  p: AnimParams, rig: LegRig, gm: GaitMix, ph: number, leg: number, z: number, groundY: number, bm: BodyMotion, calmK = 1, passes = IK_PASSES,
): LegAim {
  const front = leg < 2;
  const b = front ? rig.front : rig.hind;
  const path = footPath(gm, ph, leg, calmK);
  const tx = b.foot[0] + path.footX;
  const target: [number, number, number] = [tx, b.foot[1] + groundY + path.lift, z];
  const f = bodyFwd(p, bm, target, b.hip[0]);
  let sx = target[0] - (f[0] - target[0]), sy = target[1] - (f[1] - target[1]);
  for (let it = 1; it < passes; it++) {
    // further fixed-point passes (GLSL: the extra tgBodyFwd calls in the leg branch): s <- s - (bodyFwd(s) - target)
    const g = bodyFwd(p, bm, [sx, sy, z], b.hip[0]);
    sx -= g[0] - target[0];
    sy -= g[1] - target[1];
  }
  const sol = solveLeg(b, front, sx, sy);
  return { target, sol, path };
}

/**
 * The foot point of a leg after the whole pipeline (leg pose, then the body's motion), model space. Used by the rig to measure
 * where the foot really ends up.
 */
export function footModel(p: AnimParams, rig: LegRig, leg: number, z: number, aim: LegAim, bm: BodyMotion): [number, number, number] {
  const b = leg < 2 ? rig.front : rig.hind;
  const [x, y] = poseLegPoint(b, aim.sol, b.foot, 1);
  // the stretch scales the leg about the hip pivot in z too (the paw sits a little off the pivot's z)
  const sg = Math.sign(z), zp = sg * b.z;
  return bodyFwd(p, bm, [x, y, zp + (sg * b.footZ - zp) * aim.sol.stretch], b.hip[0]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Body height from the ground under the stance feet (used by the animal layer; the shader offsets the whole body by it)

/** The pose of an instance as AnimalLayer.writeInstance builds it: position, heading as (cos, sin), terrain pitch and roll, scale. */
export interface InstancePose {
  x: number; y: number; z: number;
  ch: number; sh: number;
  pitch: number; roll: number;
  s: number;
}

/** Rotation of an instance (rows of R, as in AnimalLayer.writeInstance): [m00, m01, m02, m10, m11, m12, m20, m21, m22]. */
export function instanceRotation(q: InstancePose): number[] {
  const cp = Math.cos(q.pitch), sp = Math.sin(q.pitch), cr = Math.cos(q.roll), sr = Math.sin(q.roll);
  const cphi = q.ch, sphi = -q.sh;
  return [
    cphi * cp, -cphi * sp * cr + sphi * sr, cphi * sp * sr + sphi * cr,
    sp, cp * cr, -cp * sr,
    -sphi * cp, sphi * sp * cr + cphi * sr, -sphi * sp * sr + cphi * cr,
  ];
}

/** World position of a model-space point. */
export function instanceToWorld(q: InstancePose, R: number[], x: number, y: number, z: number): [number, number, number] {
  return [
    q.x + q.s * (R[0] * x + R[1] * y + R[2] * z),
    q.y + q.s * (R[3] * x + R[4] * y + R[5] * z),
    q.z + q.s * (R[6] * x + R[7] * y + R[8] * z),
  ];
}

/** Model-space height of a world point above the instance's own ground plane (GLSL: tgGroundModelY). */
export function worldToModelY(q: InstancePose, R: number[], wx: number, wy: number, wz: number): number {
  return (R[1] * (wx - q.x) + R[4] * (wy - q.y) + R[7] * (wz - q.z)) / q.s;
}

/** Model-space height of the ground under the foot at model position (tx, ty, zf), relative to the instance's ground plane. */
export function groundUnderFoot(q: InstancePose, R: number[], ground: (x: number, z: number) => number, tx: number, ty: number, zf: number): number {
  const w = instanceToWorld(q, R, tx, ty, zf);
  return worldToModelY(q, R, w[0], ground(w[0], w[2]), w[2]);
}

/**
 * Where the body should ride: the mean height (model metres) of the ground under the stance feet above the body's own ground
 * plane, so the body rises over a bump the feet are standing on and sinks into a dip. 0 on level ground. The animal layer eases
 * it over time (a foot entering or leaving stance moves the mean in a step).
 */
export function stanceBodyDy(p: AnimParams, rig: LegRig, gm: GaitMix, ph: number, q: InstancePose, ground: (x: number, z: number) => number, calmK = 1): number {
  const R = instanceRotation(q);
  let sum = 0, n = 0;
  for (let i = 0; i < 4; i++) {
    const path = footPath(gm, ph, i, calmK);
    if (!path.stance) continue;
    const b = i < 2 ? rig.front : rig.hind;
    sum += groundUnderFoot(q, R, ground, b.foot[0] + path.footX, b.foot[1], (i & 1 ? 1 : -1) * b.z);
    n++;
  }
  return n ? sum / n : 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Time-lapse gait (render only; the foot-lock rig is untouched at and below TL_LO x)
//
// At 10x and up the body covers ten times the ground per frame, so a planted foot cannot stand still: the cadence cap (12 Hz) is
// hit, the legs alias at video frame rates and read as detached from the motion ("hockey pucks"). From TL_LO to TL_HI x the gait
// is blended toward a time-lapse look: the pose follows the APPARENT speed (an animal covering 10 m/s is galloping, whatever its
// own pace), the stride is the long flying-gallop stride, and the cadence is a readable bound rate (timelapseHz) instead of a
// distance lock. The body also bounds (uTL in models/shader.ts) and the animal layer drops dust where it lands.

export const TL_LO = 3;
export const TL_HI = 8;
/** 0 at and below TL_LO x sim speed, 1 at and above TL_HI x. */
export const timelapseK = (ts: number): number => sstep(TL_LO, TL_HI, ts);
/** Share of the species' natural flat-out gallop cadence that the time-lapse bound runs at (slower than the real one reads clearer). */
export const TL_CADENCE_SHARE = 0.75;

/**
 * Leg cycles per second of the time-lapse bound for a quadruped: a share of its natural cadence at the top of its gallop band
 * (wolf about 3.7 Hz, bison about 2.2 Hz, cougar 4.1 Hz), so a heavy animal still bounds slower than a light one.
 */
export function timelapseHz(p: AnimParams): number {
  const top = Math.max(p.gal1, 1);
  return clamp((TL_CADENCE_SHARE * top) / gaitStride(p, top), 1.2, 4.5);
}

/**
 * The pace the gait pose is drawn at under time-lapse: the larger of the animal's own gait pace and its apparent ground speed,
 * capped where the gallop stride stops growing (fast1, the flying gallop), blended in by `tl`.
 */
export function timelapseGaitSpd(p: AnimParams, gaitSpd: number, apparent: number, tl: number): number {
  if (tl <= 0) return gaitSpd;
  const cap = p.fast1 ?? p.gal1 * 2.2;
  return gaitSpd + (Math.max(gaitSpd, Math.min(apparent * 0.9, cap)) - gaitSpd) * tl;
}
