// Vertex-shader animation for the instanced animals. No skeletons: every vertex knows which part of the
// body it belongs to (aPart.x) and its pivots, and the gait, graze, rest and carcass poses are computed here.
//
// Per-instance inputs (InstancedBufferAttribute, vec4):
//   aGait = (gait phase 0..1, speed m/s [-1 marks a carcass], head-down weight | flap amount | carcass remaining, lie weight)
//   aLook = (coat 0..1, per-animal seed 0..1, crouch | wing fold, selected + sick: floor() = selected 0/1, fract() = sickness 0..0.98)
//   aFx   = (feeding tug weight 0..1, altitude above ground in m (birds) | body-height offset in model metres (quadrupeds: the
//            mean height of the ground under the stance feet above the body's ground plane), hunting weight 0..1, pounce envelope 0..1 |
//            for a carcass: how far it has fallen over, 0 standing .. 1 down)
//   A carcass (aGait.y < 0) carries its flank dent in the slots a body that is down does not use: the pull strength 0..1 in aFx.x,
//   and the point it pulls from, in the body frame (m), in aFx.y (along the body) and aGait.w (across it).
//   R5 raptors (RAPTOR) reuse two slots a bird does not need: aGait.w is how upright it sits on its perch (0..1), aFx.w the stoop (0..1).
//   aFx2  = (only for hunters and birds, #define FX2) a predator: (hold on the prey 0..1, feeding cycle phase 0..1, leap 0..1: the
//            spring onto the prey, which falls away as the hold takes over); a raven: (hop
//            0..1 or -1, walk phase 0..1 or -1, seconds into a takeoff or -1, flutter 0..1)
import * as THREE from 'three';
import { IK_CAP, footReach, plantedStride } from './types';
import type { AnimParams, ModelDef } from './types';
import { HEIGHT_GLSL } from '../common';
import { IK_FAR, IK_NEAR, LEG_FLEX, LIFT_K, legLength, legRigOf } from './legmath';

const f = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(6)));
const v4 = (a: number[]): string => `vec4(${a.map(f).join(',')})`;
const v2 = (a: number[]): string => `vec2(${f(a[0])},${f(a[1])})`;

/** The R5 raptor constants as defines (`RAPTOR 0` and nothing else for every other species, so their shaders are unchanged). */
function raptorDefines(p: AnimParams): string[] {
  const r = p.raptor;
  if (p.kind !== 2 || !r) return ['#define RAPTOR 0'];
  return [
    '#define RAPTOR 1',
    `#define FINGERS ${Math.min(7, r.fingers)}`,
    `#define HAND_ROOT vec3(${r.handRoot.map(f).join(',')})`,
    `#define FINGER_SPREAD ${f(r.spread)}`, `#define FINGER_CURL ${f(r.curl)}`,
    `#define DIH_IN ${f(r.dihIn)}`, `#define DIH_OUT ${f(r.dihOut)}`, `#define FLAP_IN ${f(r.flapIn)}`, `#define FLAP_OUT ${f(r.flapOut)}`,
    `#define SWEEP_FAST ${f(r.sweepFast)}`,
    `#define STOOP_DIH ${f(r.stoopDih)}`, `#define STOOP_SWEEP ${f(r.stoopSweep)}`, `#define STOOP_CMP ${f(r.stoopCmp)}`,
    `#define FOLD_CMP ${f(r.foldCmp)}`, `#define FOLD_DROOP ${f(r.foldDroop)}`,
    `#define PERCH_PITCH ${f(r.perchPitch)}`, `#define PERCH_HIP vec2(${r.perchHip.map(f).join(',')})`,
    `#define TAIL_FAN ${f(r.tailFan)}`,
  ];
}

function defines(p: AnimParams, far: ModelDef['far'] | undefined, geometry: ModelDef['geometry']): string {
  // rest-pose bones of the front and hind leg (read from the mesh): the leg solver in tgSolveLeg aims the foot point
  const rig = p.kind === 0 ? legRigOf(geometry) : { front: { hip: [0, 0], knee: [0, 0], foot: [0, 0] }, hind: { hip: [0, 0], knee: [0, 0], foot: [0, 0] } };
  return [
    `#define KIND ${p.kind}`,
    `#define COM_Y ${f(p.comY)}`,
    `#define TROT0 ${f(p.trot0)}`, `#define TROT1 ${f(p.trot1)}`, `#define GAL0 ${f(p.gal0)}`, `#define GAL1 ${f(p.gal1)}`,
    `#define AMP_W ${f(p.ampW)}`, `#define AMP_T ${f(p.ampT)}`, `#define AMP_G ${f(p.ampG)}`,
    `#define KNEE_W ${f(p.kneeW)}`, `#define KNEE_T ${f(p.kneeT)}`, `#define KNEE_G ${f(p.kneeG)}`,
    `#define BOB_W ${f(p.bobW)}`, `#define BOB_T ${f(p.bobT)}`, `#define BOB_G ${f(p.bobG)}`,
    `#define PITCH_T ${f(p.pitchT)}`, `#define PITCH_G ${f(p.pitchG)}`,
    `#define NOD_W ${f(p.nodW)}`, `#define NOD_G ${f(p.nodG)}`,
    `#define HEAD_DN ${f(p.headDown)}`, `#define LOOK_YAW ${f(p.lookYaw)}`,
    `#define TAIL_REST ${f(p.tailRest)}`, `#define TAIL_RUN ${f(p.tailRun)}`, `#define TAIL_SWAY ${f(p.tailSway)}`,
    `#define LIE_DROP ${f(p.lieDrop)}`,
    `#define LIE_HIP_F ${f(p.lieHipF)}`, `#define LIE_KNEE_F ${f(p.lieKneeF)}`,
    `#define LIE_HIP_H ${f(p.lieHipH)}`, `#define LIE_KNEE_H ${f(p.lieKneeH)}`,
    `#define CROUCH_DROP ${f(p.crouchDrop)}`,
    `#define DEAD_DROP ${f(p.deadDrop)}`, `#define DEAD_HIP_F ${f(p.deadHipF)}`, `#define DEAD_HIP_H ${f(p.deadHipH)}`,
    `#define HOCK_K ${f(p.hockK)}`,
    `#define OFF_W ${v4(p.offW)}`, `#define OFF_T ${v4(p.offT)}`, `#define OFF_G ${v4(p.offG)}`,
    `#define DUTY_W ${f(p.dutyW)}`, `#define DUTY_T ${f(p.dutyT)}`, `#define DUTY_G ${f(p.dutyG)}`,
    `#define DUTY_GF ${f(p.dutyGF ?? p.dutyG)}`, `#define FAST0 ${f(p.fast0 ?? p.gal1)}`, `#define FAST1 ${f(p.fast1 ?? p.gal1 * 2.2)}`,
    // leg length, the stride (m per leg cycle) of walk and trot, and the reach of the gallop stride (it also depends on speed)
    `#define LEGL ${f(legLength(p))}`, `#define LIFT_K ${f(LIFT_K)}`, `#define FLEX ${v4([LEG_FLEX[0], LEG_FLEX[1], LEG_FLEX[2], 0])}`,
    `#define STRIDE_W ${f(p.kind === 0 ? plantedStride(p, 0) : 1)}`, `#define STRIDE_T ${f(p.kind === 0 ? plantedStride(p, 1) : 1)}`, `#define REACH_G ${f(footReach(p.ampG))}`,
    `#define IK_CAP ${f(IK_CAP)}`, `#define IK_NEAR ${f(IK_NEAR)}`, `#define IK_FAR ${f(IK_FAR)}`,
    `#define FRONT_HIP ${v2(rig.front.hip)}`, `#define FRONT_KNEE ${v2(rig.front.knee)}`, `#define FRONT_FOOT ${v2(rig.front.foot)}`,
    `#define HIND_HIP ${v2(rig.hind.hip)}`, `#define HIND_KNEE ${v2(rig.hind.knee)}`, `#define HIND_FOOT ${v2(rig.hind.foot)}`,
    `#define CURL ${f(p.curl ?? 0)}`, `#define CURL_ANG ${f(p.curlAng ?? 1.3)}`, `#define CURL_X0 ${f(p.curlX ?? 0.1)}`, `#define CURL_LEN ${f(p.curlLen ?? 1.1)}`,
    `#define LEG_CALM ${f(far?.calm ?? 0)}`, `#define WIDEN ${f(far?.widen ?? 0)}`,
    `#define FLAP_HZ ${f(p.flapHz)}`,
    ...raptorDefines(p),
    `#define MIN_PX ${f(p.minPx)}`,
    `#define FAR_NEAR ${f(far?.d0 ?? 140)}`, `#define FAR_FAR ${f(far?.d1 ?? 400)}`,
    `#define ANIM_NEAR 20.0`, `#define ANIM_FAR 110.0`,
    `#define BODY_LEN ${f(p.boostLen)}`,
    `#define FX2 ${p.hunts || p.kind === 2 ? 1 : 0}`,
    `#define CLASP ${f(p.clasp ?? 0)}`,
    `#define MANGE ${p.hunts && p.kind === 0 ? 1 : 0}`, // canids can have mange: a patchy coat (the fragment stage mottles it)
  ].join('\n');
}

const COMMON_DECL = /* glsl */ `
#define TG_TAU 6.28318530718
${HEIGHT_GLSL}
attribute vec4 aPart;
attribute vec3 aColor;
attribute vec3 aPivot;
attribute vec3 aPivot2;
attribute vec4 aGait;
attribute vec4 aLook;
attribute vec4 aFx;
#if FX2
attribute vec4 aFx2;
#endif
uniform float uTime;
uniform vec3 uCamPos;
uniform float uPxK;
// Time-lapse weight 0..1 (the animal layer, from 3x to 8x sim speed): the body bounds once per leg cycle (see the end of tgAnimate)
uniform float uTL;

// Border fade (animals with the migrant flag within 15 m of the world edge): the animal layer packs the fade into aLook.w as
// floor() = selected (0 or 1) + 2 * q, q = 0 (fully there) .. 15 (gone), fract() = sickness. A stippled discard in the fragment
// stage (the same pattern in the shadow pass) takes the animal in and out without a pop.
float tgFadeOf() {
  float fl = floor(aLook.w + 0.001);
  return 1.0 - floor(fl * 0.5) / 15.0;
}

// R3 canids: the animal layer packs three things into aFx2.w of a hunter (a quadruped with FX2): floor(w) = air + 16 * howl, each
// 0..15, and fract(w) = mange severity 0..0.99. air / 15 is how far a leap has taken it off the ground (the legs follow the body
// instead of reaching for the ground). howl 0..10 is the sit of a howl (haunches down, muzzle up) times ten, 11..15 the same sit
// with yips ((q - 10) / 5 of full strength).
void tgUnpack(float w, out float air, out float howl, out float yip, out float mange) {
  float wi = floor(w);
  float hq = floor(wi / 16.0);
  float aq = wi - 16.0 * hq;
  air = aq / 15.0;
  howl = min(hq, 10.0) / 10.0;
  yip = max(hq - 10.0, 0.0) / 5.0;
  mange = fract(w);
}
float tgMangeOf() {
#if FX2 && KIND == 0
  return aGait.y < -0.5 ? 0.0 : fract(aFx2.w);
#else
  return 0.0;
#endif
}

void tgRotZ(inout vec3 p, inout vec3 n, vec3 c, float a) {
  float cs = cos(a), sn = sin(a);
  vec3 d = p - c;
  p = c + vec3(cs * d.x - sn * d.y, sn * d.x + cs * d.y, d.z);
  n = vec3(cs * n.x - sn * n.y, sn * n.x + cs * n.y, n.z);
}
void tgRotX(inout vec3 p, inout vec3 n, vec3 c, float a) {
  float cs = cos(a), sn = sin(a);
  vec3 d = p - c;
  p = c + vec3(d.x, cs * d.y - sn * d.z, sn * d.y + cs * d.z);
  n = vec3(n.x, cs * n.y - sn * n.z, sn * n.y + cs * n.z);
}
void tgRotY(inout vec3 p, inout vec3 n, vec3 c, float a) {
  float cs = cos(a), sn = sin(a);
  vec3 d = p - c;
  p = c + vec3(cs * d.x + sn * d.z, d.y, -sn * d.x + cs * d.z);
  n = vec3(cs * n.x + sn * n.z, n.y, -sn * n.x + cs * n.z);
}

// ---- Quadruped legs. Everything in this block is a line-for-line port of src/render/models/legmath.ts (the names are given
// in the comments), which the foot-slip rig runs on the CPU. Model space, x forward, y up.
#if KIND == 0
// legmath.ts legWave. u = leg phase in cycles (0..1), beta = stance share. Stance: the foot slides back LINEARLY from +1 to -1
// over u in [0, beta], exactly at body speed, so with the cycle run at speed / stride it stands still on the ground. The rest of
// the cycle is an eased swing with a small retraction before touchdown. Returns (W, arc): W is the foot position along the
// stride (+1 front end .. -1 back end), arc the 0..1 height profile of the lifted foot.
vec2 tgLegWave(float u, float beta) {
  float v = fract(u);
  if (v < beta) return vec2(1.0 - 2.0 * v / beta, 0.0);
  float s = (v - beta) / (1.0 - beta);
  float k = 1.2 * (1.0 - beta) / beta;
  float h = s * s * (3.0 - 2.0 * s);
  float t1 = s * s * s * (1.0 - s);
  float t0 = s * (1.0 - s) * (1.0 - s) * (1.0 - s);
  return vec2(-1.0 + 2.0 * h + k * (t1 - t0), sin(3.14159265 * s));
}

// legmath.ts solveLeg: two-bone analytic IK. Returns (hip angle, knee angle, stretch) that put the foot point of a leg whose
// rest bones are hipP, kneeP, footP at the point tgt. s = -1 folds the foot backward (forelegs), +1 forward (hind legs).
vec3 tgSolveLeg(vec2 hipP, vec2 kneeP, vec2 footP, float s, vec2 tgt) {
  vec2 u1 = kneeP - hipP;
  vec2 u2 = footP - kneeP;
  float l1 = length(u1);
  float l2 = length(u2);
  float a1 = atan(u1.x, -u1.y);
  float a2 = atan(u2.x, -u2.y);
  vec2 T = tgt - hipP;
  float d = length(T);
  float dmax = l1 + l2;
  float dc = clamp(d, abs(l1 - l2) + 0.002, dmax);
  float cg = clamp((l1 * l1 + l2 * l2 - dc * dc) / (2.0 * l1 * l2), -1.0, 1.0);
  float bend = 3.14159265 - acos(cg);
  float alpha = atan(l2 * sin(bend), l1 + l2 * cos(bend));
  float phi = atan(T.x, -T.y);
  float A1 = phi - s * alpha;
  return vec3(A1 - a1, s * bend - (a2 - a1), clamp(d / dmax, 1.0, IK_CAP));
}

// Height of the ground under a foot at model position (tx, ty, zf), in the model frame (relative to the model's own ground plane).
// The foot's world xz comes from the instance matrix, the ground from the height texture, and the point goes back through the
// inverse of the (rotation x uniform scale) matrix.
float tgGroundModelY(float tx, float ty, float zf) {
  vec3 wp = (instanceMatrix * vec4(tx, ty, zf, 1.0)).xyz;
  float gw = tgHeightAt(wp.xz);
  mat3 R3 = mat3(instanceMatrix);
  vec3 d = vec3(wp.x, gw, wp.z) - vec3(instanceMatrix[3]);
  return dot(R3[1], d) / dot(R3[1], R3[1]);
}

// The body's own motion on top of the legs (legmath.ts bodyFwd): bob and terrain offset, pitch, the distance cues, the pounce
// leap. Set once per vertex in tgAnimate; the legs aim through it (the IK takes this motion back out of its target).
float tgYoff;
float tgPitchB;
float tgFarK;
float tgCyc;
float tgPounce;
float tgHold;   // 0..1: holding the prey (takedown), braced back on the hind feet
float tgFeedB;  // 0..1: the haul of the feeding cycle, the forequarters pulled back
float tgHowl;   // 0..1: sitting up to howl (R3): the body pitches up about the shoulders, the haunches drop
vec3 tgGW;
void tgBodyFwd(inout vec3 p, inout vec3 n) {
  p.y += tgYoff;
  tgRotZ(p, n, vec3(0.0, COM_Y, 0.0), tgPitchB);
  if (tgFarK > 0.001) {
    // Whole-body gait cues sized as a fraction of the body length, so they stay readable at 15 to 40 px: a bound (the body
    // rises and falls once per stride in a gallop), the spine arching and stretching, a lateral snake, and the body pitching.
    float bl = BODY_LEN;
    float c = tgCyc;
    // (sized so that a wolf only 20 px long still visibly bounds: the gallop lifts the whole body about 16% of its length)
    float hop = tgGW.x * 0.03 * cos(2.0 * c) + tgGW.y * 0.08 * cos(2.0 * c) + tgGW.z * 0.16 * cos(c - 0.5);
    float xn = clamp(p.x / (bl * 0.55), -1.3, 1.3);
    float arch = (tgGW.y * 0.04 + tgGW.z * 0.08) * cos(c + 1.0) * (xn * xn - 0.35);
    float snake = (tgGW.x * 0.02 + tgGW.y * 0.036 + tgGW.z * 0.04) * sin(c + 0.3) * xn;
    p.y += bl * tgFarK * (hop + arch);
    p.z += bl * tgFarK * snake;
    tgRotZ(p, n, vec3(0.0, COM_Y, 0.0), tgFarK * (tgGW.x * 0.03 * sin(2.0 * c + 0.5) + tgGW.y * 0.09 * sin(2.0 * c + 0.5) + tgGW.z * 0.2 * sin(c + 1.0)));
    // rolling from side to side with the stride (a walk sways, a trot rolls, a gallop rocks), and a little weight settling in the stance
    tgRotX(p, n, vec3(0.0, COM_Y, 0.0), tgFarK * (tgGW.x * 0.03 + tgGW.y * 0.055 + tgGW.z * 0.06) * sin(c + 0.9));
  }
  // the leap of a pounce: the forequarters rise about the hind end and the whole animal lifts (23 degrees nose-up at the peak);
  // once it has hold of the prey the airborne part settles (the hind feet are on the ground again)
  // (tgPounce is the LEAP weight here: the animal layer lets it fall away as the hold takes over, and it does not come back when the
  // hold lets go, so a wolf never rears up a second time while it settles)
  if (tgPounce > 0.001) {
    p.y += tgPounce * COM_Y * 0.25;
    tgRotZ(p, n, vec3(-0.3 * BODY_LEN, COM_Y * 0.6, 0.0), tgPounce * 0.4);
  }
  // holding the prey. A wolf hangs on with the forefeet on the ground (or pawing at the flank), sat back on bent, spread hind legs
  // (the body is lowered, tgYoff) and 13 degrees nose-up (bracing back on the planted hind feet, rocking a little with each haul);
  // a cougar clings with the forelegs round the shoulders and pitches up to about 33 degrees (CLASP)
  if (tgHold > 0.001) tgRotZ(p, n, vec3(HIND_FOOT.x, 0.0, 0.0), tgHold * (0.2 + 0.02 * sin(uTime * 8.0)) + tgHold * CLASP * 0.34);
  // feeding: the forequarters haul back with the neck (the forefeet stay planted, the leg IK takes this motion out)
  if (tgFeedB > 0.001) p.x -= tgFeedB * 0.11 * BODY_LEN * smoothstep(-0.1, 0.5, p.x);
  // sitting to howl: the rump drops about the shoulders (the forefeet stay planted, the hind legs fold up in the leg code)
  if (tgHowl > 0.001) tgRotZ(p, n, vec3(0.22 * BODY_LEN, COM_Y, 0.0), tgHowl * 0.62);
}
#endif

#if KIND == 2
// A bird's flapping weight 0..1 and wing phase. Each bird has its own rhythm: a burst of beats, then a glide on still wings
// (4 to 9 s per cycle, 22 to 44% of it flapping, its own beat rate), and it flaps steadily while climbing (effort) or near the
// ground (low). So a flock is never in step and no bird beats at a constant rate.
float tgBirdBeat(float t, float seed, float low, float effort, out float fph) {
#if RAPTOR
  // a raptor beats in short bursts (3 to 8 slow, deep strokes) with long glides between: 10 to 20 s per cycle, 9 to 22% of it flapping
  float per = 10.0 + 10.0 * fract(seed * 5.13);
  float cph = fract(t / per + seed * 3.0);
  float blen = 0.09 + 0.13 * fract(seed * 7.7);
#else
  float per = 4.0 + 5.0 * fract(seed * 5.13);
  float cph = fract(t / per + seed * 3.0);
  float blen = 0.22 + 0.22 * fract(seed * 7.7);
#endif
  float burstW = smoothstep(0.0, 0.04, cph) * (1.0 - smoothstep(blen - 0.07, blen, cph));
  float hz = FLAP_HZ * (0.75 + 0.55 * fract(seed * 3.7) + 0.35 * effort);
  fph = TG_TAU * (t * hz + seed * 10.0);
  return clamp(max(low, max(burstW * 0.95, effort)), 0.0, 1.0);
}
#endif

void tgAnimate(inout vec3 p, inout vec3 n) {
  int part = int(aPart.x + 0.5);
  float spd = aGait.y;
  bool dead = spd < -0.5;
  // aFx2 (see the top of the file); species without it get the "nothing happening" values, which the compiler folds away
#if FX2
  vec4 fx2 = aFx2;
#else
  vec4 fx2 = vec4(-1.0, -1.0, -1.0, 0.0);
#endif
  // A body that has just been killed keeps the running pace it died at (aFx.z) while its legs go loose: the gait fades out
  // over the first part of the fall (aFx.w, 0 = just hit, 1 = down) instead of the animal freezing stiff and tipping over.
  float fallen = dead ? clamp(aFx.w, 0.0, 1.0) : 1.0;
  float stag = dead ? (1.0 - smoothstep(0.05, 0.4, fallen)) : 1.0;
  // The takedown struggle (about 1.2 s of the 2.4 s fall): full strength from 0.1 s to 0.9 s, easing out as it gives way.
  float strug = dead ? smoothstep(0.0, 0.05, fallen) * (1.0 - smoothstep(0.38, 0.5, fallen)) : 0.0;
  // How far it has gone down (the roll, the drop and the leg fold happen after the struggle).
  float down = dead ? smoothstep(0.42, 1.0, fallen) : 1.0;
  float spdG = dead ? aFx.z : spd;
  float seed = aLook.y;
  float sick = dead ? 0.0 : fract(aLook.w);
  float lie = dead ? 0.0 : aGait.w;
  // R5 raptors: a bird has no lie weight, so aGait.w carries how upright it sits on its perch (0..1) and aFx.w the stoop (0..1)
  float perchW = 0.0;
  float stoopW = 0.0;
#if RAPTOR
  perchW = lie;
  lie = 0.0;
  stoopW = dead ? 0.0 : clamp(aFx.w, 0.0, 1.0);
#endif
  float crouch = dead ? 0.0 : aLook.z;
#if KIND == 2
  float crouchBody = 0.0; // birds reuse aLook.z as wing fold
#else
  float crouchBody = crouch;
#endif
  float ph = aGait.x;
  float cyc = TG_TAU * ph;
  float t = uTime * (1.0 - 0.5 * sick);
  // Distance cue strength: 0 up close (the animation stays subtle and anatomical), 1 from the drone view, where legs are
  // invisible and only whole-body motion (bounding, spine flex, head pumping, sway) tells walking from running.
  float camD = distance(uCamPos, vec3(instanceMatrix[3]));
  float farK = smoothstep(ANIM_NEAR, ANIM_FAR, camD);
  // at drone and map range the legs swing less: their splay makes a ragged outline that reads as crumpled paper
  float calmK = 1.0 - LEG_CALM * smoothstep(150.0, 380.0, camD);
  float pounce = dead ? 0.0 : aFx.w;
#if RAPTOR
  pounce = 0.0; // (aFx.w is the stoop weight of a raptor)
#endif

  // gait weights from speed
  float s1 = smoothstep(TROT0, TROT1, spdG);
  float wGal = smoothstep(GAL0, GAL1, spdG);
  float wTrot = s1 * (1.0 - wGal);
  float wWalk = smoothstep(0.08, 0.4, spdG) * (1.0 - s1);
  // the same weights normalised (pure walk at a standstill): quadrupeds blend the gait PARAMETERS by them (legmath.ts gaitMix)
  float gSum = wWalk + wTrot + wGal;
  vec3 gN = gSum < 1e-3 ? vec3(1.0, 0.0, 0.0) : vec3(wWalk, wTrot, wGal) / gSum;
  float gAmt = min(gSum, 1.0);
  float moveK = dead ? stag : (1.0 - lie);
  wWalk *= moveK; wTrot *= moveK; wGal *= moveK;

  // whole-body bob and pitch
  float bob, pitch;
#if KIND == 1
  float moving = wWalk + wTrot + wGal;
  float hop = max(sin(cyc), 0.0);
  bob = moving * BOB_G * hop;
  pitch = moving * PITCH_G * (0.6 * cos(cyc + 0.4) - 0.1);
#else
  bob = wWalk * BOB_W * cos(2.0 * cyc) + wTrot * BOB_T * cos(2.0 * cyc) + wGal * BOB_G * cos(cyc - 0.5);
  pitch = wTrot * PITCH_T * sin(2.0 * cyc + 0.5) + wGal * PITCH_G * sin(cyc + 1.0);
#endif
  // gentle breathing and walk roll
  float breathe = 0.004 * sin(t * 1.9 + seed * 30.0) * COM_Y;

  // feeding at a carcass. Predators tear: the head hauls up and back slowly with the meat in its teeth, shakes it, then
  // snaps back down for the next bite, with the whole body heaving back a little. Ravens peck in quick bursts.
  float tug = dead ? 0.0 : aFx.x;
  float tugPull = 0.0, tugShake = 0.0, tugSwallow = 0.0, tugBite = 0.0, peck = 0.0, peckUp = 0.0;
  // takedown: the hold on the prey (0..1) and the head shaking it
  float holdW = 0.0, holdSh = 0.0;
  // the leap weight of a pounce (aFx2.z): the spring up at the prey, gone once the hold has taken over (the body pitch and the
  // reach of the legs follow it; pounce, the whole engagement, keeps the head driving onto the prey)
  float leapW = 0.0;
  // R3 canids (see tgUnpack): a mousing leap in the air, a howl (sitting) with its yips, mange severity
  float cnAir = 0.0, cnHowl = 0.0, cnYip = 0.0, cnMange = 0.0;
#if KIND == 0
  if (!dead) tgUnpack(fx2.w, cnAir, cnHowl, cnYip, cnMange);
  leapW = dead ? 0.0 : clamp(fx2.z, 0.0, 1.0);
  holdW = dead ? 0.0 : clamp(fx2.x, 0.0, 1.0);
  holdSh = holdW * sin(t * 21.0 + seed * 40.0);
  pitch += holdW * 0.04 * sin(t * 8.0 + seed * 5.0);
#endif
#if KIND == 2
  if (fx2.x >= 0.0) pitch += 0.35 * sin(TG_TAU * fx2.x); // a hop: the beak comes up leaving the ground, down landing
#endif
  if (tug > 0.001) {
#if KIND == 2
    // pecking comes in bursts: the head lifts a little, then stabs down, 1.6 to 2.4 times a second
    float burst = smoothstep(-0.2, 0.25, sin(t * 0.8 + seed * 31.0));
    float pk = 0.5 + 0.5 * sin(TG_TAU * (t * (1.6 + 0.8 * fract(seed * 3.1)) + seed * 9.0));
    peck = tug * burst * pk * pk;
    peckUp = tug * burst * 0.35;
    pitch -= peck * 0.22;
#else
    // The feeding cycle, one per 2.5 to 4 s (fp is its phase 0..1, kept by the animal layer so the carcass dents in step):
    // bite (the head dips into the meat), haul (the neck and forequarters pull back and up, then the meat tears free),
    // shake (the head whips side to side with it), swallow (the head thrown up), and back down for the next bite.
    float fp = fx2.y;
    float shakeE = smoothstep(0.5, 0.56, fp) * (1.0 - smoothstep(0.7, 0.76, fp));
    tugPull = tug * smoothstep(0.16, 0.5, fp) * (1.0 - smoothstep(0.5, 0.56, fp));
    tugShake = tug * shakeE * sin(t * 23.0 + seed * 40.0);
    tugSwallow = tug * smoothstep(0.74, 0.8, fp) * (1.0 - smoothstep(0.9, 0.96, fp));
    tugBite = tug * sin(3.14159265 * clamp(fp / 0.2, 0.0, 1.0));
    pitch += tugPull * 0.05 - tugSwallow * 0.03;
#endif
  }

#if KIND == 0
  // the body's motion state, read by tgBodyFwd (the legs aim through it, then every vertex is moved by it). aFx.y of a living
  // quadruped is the body-height offset the animal layer works out from the ground under the stance feet (m, model units).
  // (legmath.ts bodyMotion) the body also sinks a little while it moves, so the knees stay bent (flex)
  float flex = LEGL * dot(gN, FLEX.xyz) * gAmt * moveK;
  tgYoff = bob - flex + breathe - lie * LIE_DROP - crouchBody * CROUCH_DROP - sick * 0.035 * COM_Y + (dead ? 0.0 : aFx.y) - holdW * LEGL * (0.3 + 0.05 * CLASP); // a sick animal sags a little, a predator holding prey sits back on its haunches
  tgPitchB = pitch;
  tgFarK = dead ? 0.0 : farK;
  tgCyc = cyc;
  tgPounce = leapW;
  tgHold = holdW;
  tgFeedB = tugPull;
  tgHowl = cnHowl;
  tgGW = vec3(wWalk, wTrot, wGal);
#endif
  if (part >= 1 && part <= 4) {
    bool front = part <= 2;
    float hip, knee;
    float stretch = 1.0;
#if KIND == 0
    {
      // legmath.ts gaitMix: the gait parameters are blended by speed and ONE foot path is evaluated, so a change of gait never
      // splits or resets the phase. u = fract(phase + leg offset), stance while u < beta.
      float dutyGal = mix(DUTY_G, DUTY_GF, smoothstep(FAST0, FAST1, spdG));
      float gBeta = gN.x * DUTY_W + gN.y * DUTY_T + gN.z * dutyGal;
      float gStride = gN.x * STRIDE_W + gN.y * STRIDE_T + gN.z * (2.0 * LEGL * REACH_G / dutyGal);
      float gLift = LIFT_K * LEGL * (gN.x * KNEE_W + gN.y * KNEE_T + gN.z * KNEE_G);
      vec4 oB = gN.x * OFF_W + gN.y * OFF_T + gN.z * OFF_G;
      float ofs = part == 1 ? oB.x : (part == 2 ? oB.y : (part == 3 ? oB.z : oB.w));
      // legmath.ts footPath: the foot's offset along the body from its rest position, and its swing lift
      vec2 lw = tgLegWave(ph + ofs, gBeta);
      float gk = gAmt * moveK * calmK;
      float footX = 0.5 * gBeta * gStride * lw.x * gk;
      float footLift = gLift * lw.y * gk;
      vec2 hipP = front ? FRONT_HIP : HIND_HIP;
      vec2 kneeP = front ? FRONT_KNEE : HIND_KNEE;
      vec2 footP = front ? FRONT_FOOT : HIND_FOOT;
      float tx = footP.x + footX;
      float zf = aPivot.z;
      // legmath.ts aimLeg: within 45 m the foot aims at the real ground under it (faded out 40 to 45 m, beyond it the ground is flat)
      float ikK = dead ? 0.0 : (1.0 - smoothstep(IK_NEAR, IK_FAR, camD)) * (1.0 - cnAir); // (in the air of a leap the legs follow the body)
      float gy = 0.0;
      if (ikK > 0.001) gy = ikK * tgGroundModelY(tx, footP.y, zf);
      vec3 tg = vec3(tx, footP.y + gy + footLift, zf);
      // the body's own motion (bob, pitch, cues) moves the foot after the leg is posed: take it back out of the target
      vec3 tq = tg;
      vec3 tqn = vec3(0.0, 1.0, 0.0);
      tgBodyFwd(tq, tqn);
      vec3 sol = tgSolveLeg(hipP, kneeP, footP, front ? -1.0 : 1.0, 2.0 * tg.xy - tq.xy);
      hip = sol.x;
      knee = sol.y;
      stretch = mix(1.0, sol.z, moveK);
    }
#else
    vec4 oW = OFF_W; vec4 oT = OFF_T; vec4 oG = OFF_G;
    float ow = part == 1 ? oW.x : (part == 2 ? oW.y : (part == 3 ? oW.z : oW.w));
    float ot = part == 1 ? oT.x : (part == 2 ? oT.y : (part == 3 ? oT.z : oT.w));
    float og = part == 1 ? oG.x : (part == 2 ? oG.y : (part == 3 ? oG.z : oG.w));
    float lift;
    float aw = TG_TAU * (ph + ow), at = TG_TAU * (ph + ot), ag = TG_TAU * (ph + og);
    hip = wWalk * AMP_W * sin(aw) + wTrot * AMP_T * sin(at) + wGal * AMP_G * sin(ag);
    lift = wWalk * KNEE_W * max(cos(aw), 0.0) + wTrot * KNEE_T * max(cos(at), 0.0) + wGal * KNEE_G * max(cos(ag), 0.0);
    hip *= calmK;
    lift *= calmK;
    knee = front ? -lift : lift * HOCK_K;
#endif
    // pounce: forelegs reach out ahead, hindlegs drive
    // (holding the prey, the hind legs are planted: the leg IK has put the feet on the ground, so they are left as solved)
    // (in the lunge the forelegs reach out; holding on, the IK has put the forefeet on the ground and they stay there, except that
    // one paws up at the prey's flank now and then. The cougar's forelegs wrap round the shoulders instead.)
    float pawPulse = 0.0;
#if KIND == 0
    if (front && holdW > 0.001) pawPulse = smoothstep(0.3, 0.85, sin(t * 3.7 + seed * 20.0 + float(part) * 3.1));
#endif
#if KIND == 0
    float reachW = leapW;
#else
    float reachW = pounce;
#endif
    hip += front ? 0.85 * reachW + pounce * holdW * (0.04 * sin(t * 9.0 + float(part) * 2.0) + 0.42 * pawPulse) : -0.55 * reachW * (1.0 - holdW);
    knee -= front ? holdW * pawPulse * 0.7 : 0.0;
#if KIND == 0
    if (CLASP > 0.0 && front && holdW > 0.001) {
      // clinging: the forelegs reach up and forward and wrap the shoulders (a flex now and then as the grip shifts)
      hip = mix(hip, 1.0 + 0.1 * sin(t * 9.0 + float(part) * 2.0), holdW * CLASP);
      knee = mix(knee, -0.6 - 0.15 * sin(t * 7.0 + float(part) * 1.7), holdW * CLASP);
    }
#endif
#if KIND != 0
    // stalking: bent legs (a quadruped's legs bend through the IK instead, as the body drops by CROUCH_DROP)
    hip += crouchBody * (front ? 0.25 : -0.2);
#endif
#if KIND == 0
    // R3 canids. In the air of a mousing leap the forelegs reach ahead and the hind legs trail; sitting to howl, the hind legs fold under.
    if (cnAir > 0.001) {
      hip = mix(hip, front ? 0.62 : -0.5, cnAir);
      knee = mix(knee, front ? -0.45 : 0.75 * HOCK_K, cnAir);
      stretch = mix(stretch, 1.0, cnAir);
    }
    if (cnHowl > 0.001 && !front) {
      hip = mix(hip, LIE_HIP_H, cnHowl);
      knee = mix(knee, LIE_KNEE_H, cnHowl);
      stretch = mix(stretch, 1.0, cnHowl);
    }
#endif
    float lieHip = front ? LIE_HIP_F : LIE_HIP_H;
    float lieKnee = front ? LIE_KNEE_F : LIE_KNEE_H;
    hip = mix(hip, lieHip, lie);
    knee = mix(knee, lieKnee, lie);
#if KIND == 2
    hip = -1.5 * (1.0 - aLook.z); // birds: legs tuck back in flight, hang when perched
    knee = 0.0;
    if (aLook.z > 0.5) {
      // on the ground at a carcass: a hop is both feet together (tucked in the air), a walk alternates them
      if (fx2.x >= 0.0) hip -= 0.9 * sin(3.14159265 * fx2.x);
      else if (fx2.y >= 0.0) hip += 0.55 * sin(TG_TAU * (fx2.y + (part == 1 ? 0.0 : 0.5)));
    }
#if RAPTOR
    {
      // legs trail back in flight, hang on a perch (counter-rotated against the body's upright pitch, so they stay vertical), and in the
      // last metres of a stoop swing forward with the talons out
      float strike = stoopW * (1.0 - smoothstep(1.4, 5.0, aFx.y));
      hip = mix(-1.3, 0.0, aLook.z);
      hip = mix(hip, 0.95, strike);
      hip -= perchW * PERCH_PITCH;
    }
#endif
#endif
    if (dead) {
      // A fallen animal lies on its side with the legs folded, not stiff spikes. Going down it first stumbles on (the gait it
      // died in fading out), the forelegs buckle ahead of the hind legs and every leg flops loose, then it folds up.
      float loose = sin(3.14159265 * clamp((fallen - 0.38) / 0.55, 0.0, 1.0));
      float flopH = loose * (0.55 * sin(fallen * 17.0 + float(part) * 1.9) + (front ? 0.35 : -0.15));
      float flopK = loose * 0.9 * (0.5 + 0.5 * sin(fallen * 13.0 + float(part) * 2.3)) * (front ? -1.0 : HOCK_K);
      float fh = front ? mix(DEAD_HIP_F, LIE_HIP_F, 0.7) : mix(DEAD_HIP_H, LIE_HIP_H, 0.7);
      float fk = (front ? LIE_KNEE_F : LIE_KNEE_H) * 0.7;
      float f2 = smoothstep(front ? 0.4 : 0.55, 1.0, fallen);
      // every leg settles at its own angle (a dead weight, not a posed statue)
      float lj = fract(sin(float(part) * 12.9898 + seed * 78.233) * 43758.5453) - 0.5;
      float lk = fract(lj * 7.31 + 0.37) - 0.5;
      hip = mix(hip, fh, f2) + flopH * (1.0 - f2) + lj * 0.9 * f2;
      knee = mix(knee, fk, f2) + flopK * (1.0 - f2) + lk * 0.7 * f2;
      // scrabbling: every leg paws and kicks fast and out of step (about 4.5 Hz), the forelegs braced out ahead, the hind legs
      // driving, while it fights the weight on its back
      float scr = sin(fallen * 70.0 + float(part) * 2.1 + seed * 5.0);
      hip += strug * (front ? 0.3 + 0.6 * scr : 0.7 * scr - 0.1);
      knee += strug * 0.8 * (0.5 + 0.5 * sin(fallen * 70.0 + float(part) * 1.3 + 1.0)) * (front ? -1.0 : HOCK_K);
    }
    tgRotZ(p, n, aPivot2, knee * aPart.y);
    tgRotZ(p, n, aPivot, hip);
#if KIND == 0
    // holding the prey: the hind legs are planted wide apart for the haul (left leg out to the left, right to the right)
    if (!front && holdW > 0.001) tgRotX(p, n, aPivot, (part == 3 ? 1.0 : -1.0) * holdW * 0.3);
    // a straight leg that still falls short (steep or uneven ground) lengthens a little, at most IK_CAP
    p = aPivot + (p - aPivot) * stretch;
#endif
  } else if (part == 5) {
    float graze = dead ? 0.0 : aGait.z;
#if KIND == 0
    if (cnMange > 0.01) {
      // mange: the ruff round the neck goes thin (inset along the normal where the neck meets the shoulders)
      float rf = 1.0 - smoothstep(0.28, 0.42, p.x / BODY_LEN);
      p -= n * BODY_LEN * 0.03 * cnMange * rf;
    }
#endif
#if KIND == 2
    graze *= aLook.z; // birds: head pecks only while perched (fold = 1)
#endif
    // a head lift to look about: every 8 to 14 s (its own period and phase), about 2 s long
    float lper = 0.45 + 0.3 * fract(seed * 4.3);
    float raise = smoothstep(0.72, 0.93, sin(t * lper + seed * 40.0)) * (1.0 - 0.8 * tug); // a feeding animal keeps its head down
    raise *= 1.0 - clamp(wTrot + wGal, 0.0, 1.0); // (a stampede keeps its head low: the weight above is set by the animal layer)
    float dn = graze * (1.0 - 0.85 * raise);
    // standing still: between bites the head comes up and goes down again (a slow cycle of 3 to 6 s), clearly enough that a
    // grazing animal reads as alive from 40 to 120 m (stronger with distance, where the head is a few pixels)
    float idleK = (1.0 - wWalk - wTrot - wGal) * (1.0 - lie);
    float bite = 0.5 + 0.5 * sin(t * (1.0 + 0.9 * fract(seed * 3.1)) + seed * 23.0);
    float biteUp = idleK * graze * (1.0 - raise) * smoothstep(0.55, 1.0, bite) * (0.4 + 0.35 * farK);
    float nod = (wWalk + wTrot) * NOD_W * sin(2.0 * cyc + 1.0) + wGal * NOD_G * sin(cyc + 2.0);
    float chew = dn * 0.05 * sin(t * 7.0 + seed * 20.0);
    float yaw = LOOK_YAW * sin(t * 0.45 + seed * 13.0) * (1.0 - dn) * (1.0 - wGal) * (1.0 - lie * 0.5);
    float ang = -HEAD_DN * dn + nod + chew - 0.45 * crouchBody - 0.5 * sick * (1.0 - 0.5 * dn);
    ang += tugPull * 0.75 + tugSwallow * 1.5 - tugBite * 0.3 - peck * 1.0 + peckUp + biteUp;
    yaw += tugShake * 0.55;
    // holding the prey by the throat or flank: the head shakes it hard from side to side
    // (a cougar's head goes down onto the neck instead and shakes less)
    ang += holdW * ((0.5 + 0.2 * sin(t * 13.0 + seed * 5.0)) * (1.0 - CLASP) - CLASP * (0.55 - 0.08 * sin(t * 11.0 + seed * 5.0)));
    yaw += holdSh * (0.6 - 0.35 * CLASP);
    // after lifting the head it turns to look, then back
    yaw += idleK * raise * (fract(seed * 6.1) - 0.5) * 1.0 * sin(t * 0.9 + seed * 7.0);
    // from the drone view the head pumps harder so a trot or a gallop reads as a body moving, not sliding
    float pump = farK * (wWalk * 0.1 * sin(2.0 * cyc + 1.0) + wTrot * 0.16 * sin(2.0 * cyc + 1.0) + wGal * 0.32 * sin(cyc + 2.0));
    ang += pump;
#if RAPTOR
    ang -= perchW * PERCH_PITCH * 0.8; // the body sits upright on its perch: the head tips down to look ahead
    ang += stoopW * 0.55;              // in a stoop the head is held up out of the dive, eyes on the prey
#endif
#if KIND == 2
    if (fx2.y >= 0.0) ang += 0.22 * sin(TG_TAU * 2.0 * fx2.y); // a walking raven's head pumps with each step
#endif
    ang -= pounce * 0.55; // the head drives forward and down onto the prey
#if KIND == 0
    if (cnHowl > 0.001) {
      // sitting to howl: the muzzle points up (the body is already pitched up about the shoulders), a slow tremor in the long note,
      // and in the yips quick jerks of the head up and back, each dog at its own beat
      ang += cnHowl * (0.5 + 0.05 * sin(t * 1.1 + seed * 9.0) + 0.012 * sin(t * 9.0 + seed * 5.0));
      ang += cnYip * 0.2 * max(sin(t * 14.0 + seed * 6.0), 0.0);
      yaw *= 1.0 - 0.85 * cnHowl;
    }
#endif
    ang = mix(ang, 0.15, lie * 0.7);
#if KIND == 0
    if (CURL > 0.0) {
      // curled rest: the head turns back toward the tail side and drops onto the paws
      float cside = fract(seed * 3.7) > 0.5 ? 1.0 : -1.0;
      float ck = lie * CURL * (dead ? 0.0 : 1.0);
      ang = mix(ang, -0.5 - 0.15 * sin(t * 0.4 + seed * 9.0), ck);
      yaw = mix(yaw, -cside * 0.95, ck);
    }
#endif
    if (dead) {
      // the head drops as the animal goes, then lies slack
      // the head is thrown up and about in strong tosses (4 in about 1.2 s), then drops as it gives way
      ang += strug * (0.6 * sin(fallen * 50.0 + seed * 3.0) + 0.2);
      ang = mix(ang, -0.8, smoothstep(0.38, 0.65, fallen));
      ang = mix(ang, -0.35 - 0.5 * fract(seed * 6.7), smoothstep(0.6, 1.0, fallen));
      yaw = (fract(seed * 9.1) - 0.5) * 1.2 * fallen + strug * 0.5 * sin(fallen * 37.0 + seed * 2.0);
    }
    tgRotY(p, n, aPivot, yaw);
    tgRotZ(p, n, aPivot, ang);
  } else if (part == 6) {
#if KIND == 0
    if (cnMange > 0.01) {
      // mange: the tail goes thin and rat-like as the hair falls out (the tube shrinks toward its own axis along its normals)
      float tl = clamp((aPivot.x - p.x) / (0.4 * BODY_LEN), 0.0, 1.0);
      float rr = BODY_LEN * 0.05 * (0.55 + 0.45 * sin(3.14159265 * min(tl * 1.2, 1.0)));
      p -= n * rr * 0.75 * cnMange * smoothstep(0.0, 0.12, tl);
    }
#endif
    float sway = TAIL_SWAY * sin(t * 2.1 + seed * 17.0) + wWalk * 0.15 * sin(cyc);
    float lift = mix(TAIL_REST, TAIL_RUN, clamp(wGal + 0.4 * wTrot, 0.0, 1.0)) + 0.05 * sin(t * 1.3 + seed * 9.0);
    // a flick now and then (flies): a quick burst of side to side with a lift, a few times a minute
    float flick = smoothstep(0.88, 0.98, sin(t * (0.38 + 0.2 * fract(seed * 2.7)) + seed * 31.0)) * (1.0 - lie * 0.7);
    sway += flick * (0.5 + 0.3 * farK) * sin(t * 17.0 + seed * 5.0);
    lift += flick * 0.3 * (0.5 + 0.5 * sin(t * 15.0));
#if KIND == 0
    lift -= cnHowl * 1.05; // sitting: the body pitches up, so the tail comes up to lie along the ground behind it
#endif
    if (dead) { float lim = 1.0 - smoothstep(0.1, 0.6, fallen); lift *= lim; sway *= lim; }
#if RAPTOR
    {
      // a soaring raptor spreads its tail wide to steer and hold height; a stooping one closes it and, at the strike, fans it to brake
      float fph0;
      float flT = tgBirdBeat(t, seed, aGait.z * (1.0 - aLook.z), clamp(aFx.z, 0.0, 1.0), fph0) * (1.0 - stoopW);
      float strikeT = stoopW * (1.0 - smoothstep(1.4, 5.0, aFx.y));
      float fan = 1.0 + TAIL_FAN * (1.0 - flT) * (1.0 - aLook.z) * (1.0 - stoopW) * (0.7 + 0.3 * sin(t * 0.7 + seed * 11.0));
      fan = mix(fan, 1.0 + TAIL_FAN * 1.1, strikeT);
      fan = mix(fan, 0.8, stoopW * (1.0 - strikeT));
      p.z = aPivot.z + (p.z - aPivot.z) * fan;
      lift += strikeT * 0.45 - stoopW * 0.12 * (1.0 - strikeT);
      sway *= 0.5 + 0.5 * (1.0 - aLook.z);
    }
#endif
    tgRotZ(p, n, aPivot, lift);
    tgRotY(p, n, aPivot, sway);
  } else if (part == 7 || part == 8) {
#if RAPTOR
    if (!dead) {
      // ---- R5 bird of prey. The wing is a chain: the primaries ("fingers", tagged in aPart.w) fan about HAND_ROOT, the hand turns about
      // the wrist (aPivot2, weighted by aPart.y along the wing), then the whole wing turns about the shoulder (aPivot): sweep back,
      // dihedral, and for a folded wing a droop. Every rotation is applied child first, so each joint stays attached.
      float right = part == 8 ? 1.0 : -1.0;
      float fold = aLook.z;
      float tkT = fx2.z;
      float tkW = tkT >= 0.0 ? 1.0 - smoothstep(0.7, 1.15, tkT) : 0.0;
      fold *= 1.0 - (tkT >= 0.0 ? smoothstep(0.0, 0.14, tkT) : 0.0); // leaving the perch: the wings come open
      float fph = 0.0;
      float fl = tgBirdBeat(t, seed, aGait.z * (1.0 - fold), clamp(aFx.z, 0.0, 1.0), fph);
      float strikeT = stoopW * (1.0 - smoothstep(1.4, 5.0, aFx.y));  // the last metres of a stoop: the wings are thrown open to brake
      float sE = stoopW * (1.0 - strikeT);                             // the drawn-in stoop pose
      fl = max(fl * (1.0 - sE) * (1.0 - fold), tkW * 0.7);
      float wAmp = 1.0 + 0.5 * farK;
      float glide = (1.0 - fl) * (1.0 - sE);
      float soar = 0.5 + 0.5 * sin(t * 0.23 + seed * 17.0);
      float tw1 = sin(t * 1.9 + seed * 9.0 + right * 1.3), tw2 = sin(t * 2.7 + seed * 5.0 + right);
      float spdK = smoothstep(9.0, 26.0, spd);
      // a soaring bird rocks its wings and trims them (each wing a little differently); a flapping one beats slowly and deeply
      float dIn = DIH_IN + glide * (0.05 * soar + 0.025 * tw1) + fl * FLAP_IN * wAmp * sin(fph);
      float dOut = DIH_OUT + glide * (0.06 * soar + 0.03 * tw2) + fl * FLAP_OUT * wAmp * sin(fph - 1.2);
      float sweep = 0.1 + SWEEP_FAST * spdK * glide + 0.12 * fl * (0.5 + 0.5 * cos(fph));
      float handBack = 0.12 * spdK * glide + 0.2 * fl * (0.5 - 0.5 * sin(fph));
      float spread = FINGER_SPREAD * glide * (1.0 - 0.6 * spdK);
      float curl = FINGER_CURL * (0.4 + 0.6 * glide) + 0.25 * fl * (0.5 + 0.5 * sin(fph - 1.5));
      float cmp = 1.0;
      // a deep first beat from the perch
      if (tkW > 0.001) {
        dIn = mix(dIn, 0.95 * cos(TG_TAU * tkT / 0.85), tkW);
        dOut = mix(dOut, 0.7 * cos(TG_TAU * (tkT - 0.09) / 0.85), tkW);
        spread = mix(spread, FINGER_SPREAD, tkW);
      }
      // the stoop: wings drawn in and swept hard back, the hand folded against the arm, the primaries closed
      dIn = mix(dIn, STOOP_DIH, sE);
      dOut = mix(dOut, -0.25, sE);
      sweep = mix(sweep, STOOP_SWEEP, sE);
      handBack = mix(handBack, 0.45, sE);
      spread = mix(spread, 0.0, sE);
      cmp = mix(cmp, 1.0 - STOOP_CMP, sE);
      // the strike: wings flung up and open
      dIn += strikeT * 0.85;
      dOut += strikeT * 0.3;
      spread = mix(spread, FINGER_SPREAD * 1.3, strikeT);
      // perched or on the ground: the wing folds against the flank, shorter, tips drooping behind
      dIn = mix(dIn, -1.28, fold);
      dOut = mix(dOut, 0.0, fold);
      sweep = mix(sweep, 1.22, fold);
      handBack = mix(handBack, 0.0, fold);
      spread = mix(spread, 0.0, fold);
      curl = mix(curl, 0.0, fold);
      cmp = mix(cmp, 1.0 - FOLD_CMP, fold);
      float w1 = aPart.y;
      vec3 hr = vec3(HAND_ROOT.x, HAND_ROOT.y, HAND_ROOT.z * right);
#if FINGERS > 0
      float fk = aPart.w;
      if (fk > 0.01) {
        float kk = floor(fk * 8.0 + 0.5) - 1.0;                // 0 (leading) .. FINGERS - 1 (trailing)
        float u = (kk + 0.5) / float(FINGERS) - 0.5;            // -0.5 .. 0.5
        tgRotY(p, n, hr, right * (-2.0 * u * spread));         // the leading feather swings forward, the trailing ones back: a fan
        tgRotX(p, n, hr, -right * curl * (0.35 + 1.3 * (u + 0.5)) * (1.0 + 0.6 * sin(t * 2.3 + seed * 7.0 + kk * 1.7) * glide * 0.3));
      }
#endif
      tgRotY(p, n, aPivot2, -right * handBack * w1);
      tgRotX(p, n, aPivot2, -right * dOut * w1);
      p.z = aPivot.z + (p.z - aPivot.z) * cmp;
      tgRotY(p, n, aPivot, -right * sweep);
      tgRotX(p, n, aPivot, -right * dIn);
      tgRotZ(p, n, aPivot, FOLD_DROOP * fold);
    }
#else
    float right = part == 8 ? 1.0 : -1.0;
    float fold = aLook.z;
    float fph = 0.0;
    float fl = 0.0;
    float tkT = -1.0, tkW = 0.0;
#if KIND == 2
    fl = tgBirdBeat(t, seed, aGait.z * (1.0 - fold), clamp(aFx.z, 0.0, 1.0), fph);
    // a hop flicks the wings half open, a startled raven flutters them, a takeoff throws them open in a deep downstroke flare
    tkT = fx2.z;
    tkW = tkT >= 0.0 ? 1.0 - smoothstep(0.55, 1.0, tkT) : 0.0;
    float flick = fx2.x >= 0.0 ? sin(3.14159265 * fx2.x) * 0.85 : 0.0;
    float opened = clamp(max(flick, max(fx2.w * 0.85, tkT >= 0.0 ? smoothstep(0.0, 0.12, tkT) : 0.0)), 0.0, 1.0);
    fold *= 1.0 - opened;
    if (fx2.w > 0.001) { fph = TG_TAU * t * 9.0; fl = max(fl, fx2.w); }
#endif
    float wAmp = 1.0 + 0.6 * farK; // a deeper beat from the drone view, where a raven is a few pixels across
    // gliding and soaring: with the wings still they are held out with a dihedral that drifts between a flat glide and a
    // raised soar, and the two wings tweak independently
    float glide = 1.0 - fl;
    float soar = 0.5 + 0.5 * sin(t * 0.23 + seed * 17.0);
    float inner = 0.17 + glide * (0.05 + 0.1 * soar) + 0.03 * glide * sin(t * 1.9 + seed * 9.0 + right * 1.3) + fl * 0.75 * wAmp * sin(fph);
    float outer = 0.1 + glide * (0.06 + 0.1 * soar) + 0.04 * glide * sin(t * 2.7 + seed * 5.0 + right) + fl * 0.6 * wAmp * sin(fph - 1.1);
#if KIND == 2
    if (tkW > 0.001) {
      // the first beat is deep and slow: wings up, then swept down hard (0.25 s), fading into the normal beat
      inner = mix(inner, 1.15 * cos(TG_TAU * tkT / 0.5), tkW);
      outer = mix(outer, 0.9 * cos(TG_TAU * (tkT - 0.06) / 0.5), tkW);
    }
#endif
    inner = mix(inner, 0.0, fold);
    float w1 = aPart.y;
    if (fold > 0.001) {
      // outer wing folds back on itself, whole wing sweeps along the body
      tgRotY(p, n, aPivot2, right * 2.4 * fold * w1);
      tgRotY(p, n, aPivot, -right * 1.3 * fold);
    }
    tgRotX(p, n, aPivot2, -right * outer * w1);
    tgRotX(p, n, aPivot, -right * inner);
    if (dead) { /* carcass wings stay as modelled */ }
#endif
  }

#if KIND == 0
  if (CURL > 0.0 && !dead && lie > 0.001) {
    // curled rest: bend the body behind its middle round to one side, a smooth yaw that grows with the distance behind the
    // pivot, so the rump, hind legs and tail wrap alongside the chest (the head is handled with the head part)
    float cside = fract(seed * 3.7) > 0.5 ? 1.0 : -1.0;
    float cd = max(CURL_X0 - p.x, 0.0);
    float ca = lie * CURL * CURL_ANG * smoothstep(0.0, CURL_LEN, cd) * cside;
    tgRotY(p, n, vec3(CURL_X0, 0.0, 0.0), ca);
  }
#endif

#if KIND == 0
  // the body's own motion on top of the legs (the same function the legs aimed through): bob and terrain offset, pitch, the
  // distance cues and the pounce leap
  tgBodyFwd(p, n);
  // Time-lapse bound (render only, not in the foot-lock rig): the whole animal leaves the ground once per leg cycle and lands again,
  // so at 10x and 100x a mover reads as bounding over the land (landing dust is thrown by the animal layer), not sliding on it.
  // The legs keep their solved pose (the feet leave the ground with the body); the arc is zero for the half of the cycle in contact.
  if (uTL > 0.001 && !dead) {
    float mvTL = clamp(tgGW.y * 0.6 + tgGW.z, 0.0, 1.0) * (1.0 - lie);
    float arcTL = max(sin(cyc + 1.2), 0.0);
    p.y += uTL * mvTL * BODY_LEN * 0.11 * arcTL;
  }
#else
  p.y += bob + breathe - lie * LIE_DROP - crouchBody * CROUCH_DROP - sick * 0.035 * COM_Y; // a sick animal sags a little
  tgRotZ(p, n, vec3(0.0, COM_Y, 0.0), pitch);
#endif
#if RAPTOR
  // sitting upright: the whole bird (the legs counter-rotate in their own code, so they stay vertical) tips nose up about the hip joint
  tgRotZ(p, n, vec3(PERCH_HIP, 0.0), perchW * PERCH_PITCH);
#endif
#if KIND == 2
  if (!dead && farK > 0.001 && aLook.z < 0.5) {
    // wing beats lift and drop the whole bird a little (only while it is actually beating)
    float fph2;
    float fl2 = tgBirdBeat(t, seed, aGait.z * (1.0 - aLook.z), clamp(aFx.z, 0.0, 1.0), fph2);
    p.y += BODY_LEN * farK * 0.06 * fl2 * sin(fph2 - 0.4);
  }
#endif
#if KIND != 0
  // the leap of a pounce: the forequarters rise about the hind end and the whole animal lifts
  if (pounce > 0.001) {
    p.y += pounce * COM_Y * 0.25;
    tgRotZ(p, n, vec3(-0.3 * BODY_LEN, COM_Y * 0.6, 0.0), pounce * 0.42);
  }
#endif

  if (dead) {
    float r = clamp(aGait.z, 0.0, 1.0);
    float side = (fract(seed * 5.31) > 0.5 ? 1.0 : -1.0);
    // the stumble: the nose dips as the forelegs buckle, then the body rolls onto its side
    float dip = sin(3.14159265 * clamp((fallen - 0.3) / 0.45, 0.0, 1.0));
    tgRotZ(p, n, vec3(-0.25 * BODY_LEN, COM_Y, 0.0), -0.35 * dip);
    float roll = side * 1.45 * down;
    // the takedown: it bucks, rears and twists against the weight on its back for about a second before it gives way
    roll += strug * 0.38 * sin(fallen * 44.0 + seed * 9.0);
    tgRotY(p, n, vec3(0.0, COM_Y, 0.0), strug * 0.18 * sin(fallen * 38.0 + 1.0));
    tgRotX(p, n, vec3(0.0, COM_Y, 0.0), roll);
    // each buck lifts the whole body and throws the forequarters up about the hind end
    p.y += strug * COM_Y * 0.14 * abs(sin(fallen * 25.0 + seed * 4.0));
    tgRotZ(p, n, vec3(-0.3 * BODY_LEN, COM_Y * 0.6, 0.0), strug * 0.24 * max(sin(fallen * 25.0 + seed * 4.0 + 1.5), 0.0));
    p.y -= DEAD_DROP * down;
    float f3 = down;
    float k = mix(1.0, mix(0.4, 0.9, r), f3);
    p.y = p.y * k;
    p.xz *= mix(1.0, mix(0.8, 1.0, r), f3);
#if KIND == 0
    if (aFx.x > 0.001) {
      // the flank gives with each pull of a feeding predator: the hide is drawn out toward it and tents up round the contact point
      // (a carcass lies flush with the ground, so pressing it down would only sink it out of sight)
      // (a carcass carries the pull strength in aFx.x and the contact point in the body frame in aFx.y and aGait.w, which a body
      // that is down does not otherwise use)
      float dR = 0.36 * BODY_LEN;
      vec2 dcp = vec2(aFx.y, aGait.w);
      vec2 dc = p.xz - dcp;
      float dg = exp(-dot(dc, dc) / (dR * dR)) * aFx.x;
      p.xz += (dcp / max(length(dcp), 1e-3)) * dg * 0.12 * BODY_LEN;
      p.y += dg * 0.05 * BODY_LEN;
      n.xz += dc * (2.0 * dg * 0.05 * BODY_LEN / (dR * dR));
      n = normalize(n);
    }
#endif
  }

#if KIND == 0
  if (WIDEN > 0.0 && !dead) p.z *= 1.0 + WIDEN * smoothstep(110.0, 380.0, camD);
#endif

  // distance readability: keep every animal at least MIN_PX pixels long (on a 900 px tall viewport), growing gently
  vec3 ip = vec3(instanceMatrix[3]);
  float isc = length(vec3(instanceMatrix[0]));
  float px = BODY_LEN * isc * uPxK / max(length(uCamPos - ip), 1.0);
  p *= clamp(MIN_PX / max(px, 0.01), 1.0, 7.0);
}
`;

/** Fragment side of the border fade: an interleaved-gradient-noise stipple against the fade level (1 = visible, 0 = gone). */
const FADE_FRAG_DECL = /* glsl */ `
varying float vTgFade;
bool tgFadeDiscard(float f) {
  if (f > 0.999) return false;
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return f <= n;
}
`;

const VERT_SHADE_DECL = /* glsl */ `
uniform vec3 uCoatPale;
uniform vec3 uCoatDark;
uniform vec3 uBone;
varying vec3 vTgColor;
varying float vTgSel;
varying float vTgFar;
varying float vTgHunt;
varying float vTgUp;
varying float vTgFade;
#if MANGE
varying float vTgMg;
varying vec3 vTgPos;
#endif
uniform float uLegTone;

void tgShade(vec3 on) {
  bool dead = aGait.y < -0.5;
  vec3 coat = mix(uCoatPale, uCoatDark, aLook.x);
  float c = aPart.z;
  vec3 col = aColor * ((1.0 - c) + c * coat);
  float v = 0.9 + 0.2 * fract(aLook.y * 7.31);
  col *= mix(1.0, v, c);
  if (dead) {
    float r = aGait.z;
    col *= 0.5; // a dead body reads darker than the living herd, so a kill is a dark mark in the grass
    // Exposed meat shows through the hide in patches as it is eaten: dark, dull maroon (not bright red), with the hide
    // left in between, and the bone only at the very end.
    vec3 flesh = vec3(0.1, 0.034, 0.028);
    float hh = fract(sin(dot(position * 5.3 + aLook.y * 17.0, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float fleshW = (1.0 - smoothstep(0.35, 0.7, r + (hh - 0.5) * 0.55)) * 0.8;
    float boneW = (1.0 - smoothstep(0.04, 0.22, r));
    col = mix(mix(col, flesh, fleshW), uBone * 0.85, boneW);
    // a downed animal shows its pale belly where the hide is still on (the underside lies toward the side once it has rolled over)
    float bel = smoothstep(-0.1, -0.65, normal.y) * smoothstep(0.3, 0.75, r) * (1.0 - fleshW);
    col = mix(col, vec3(0.3, 0.24, 0.18) * (0.7 + 0.5 * col.r * 4.0), 0.6 * bel);
  }
  // Sickness: a duller, greyer, slightly darker coat (the head droop and the slower gait are in tgAnimate). Never a tint.
  float sick = dead ? 0.0 : fract(aLook.w);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(luma * 0.92) * vec3(0.97, 0.97, 0.96), 0.6 * sick) * (1.0 - 0.1 * sick);
#if KIND != 2
  if (!dead) {
    // Grass occlusion: the lower leg stands in the grass, so it is darker and a little green (the blades shade and bounce light on it
    // and the ground under the animal gets none), fading out by the belly. Without it the feet are as bright as the back and the
    // animal looks pasted on top of the grass instead of standing in it.
    float occ = 1.0 - smoothstep(0.0, LEGL * 1.1 + 0.02, position.y);
    col *= mix(vec3(1.0), vec3(0.5, 0.6, 0.42), occ * occ * (3.0 - 2.0 * occ) * 0.85);
  }
#endif
  vTgColor = col;
  float tgFl = floor(aLook.w + 0.001);
  vTgSel = tgFl - 2.0 * floor(tgFl * 0.5);
  vTgFade = dead ? 1.0 : tgFadeOf();
  // distance readability: 0 close up, 1 from the wide view (see ModelDef.far)
  vTgFar = smoothstep(FAR_NEAR, FAR_FAR, distance(uCamPos, vec3(instanceMatrix[3])));
  vTgHunt = dead ? 0.0 : aFx.z;
  // how much this surface faces the sky (world space): the back of the animal, as the drone and map views see it
  vTgUp = clamp(normalize(mat3(instanceMatrix) * on).y, 0.0, 1.0);
  int tgPart = int(aPart.x + 0.5);
  if (tgPart >= 1 && tgPart <= 4 && !dead) vTgColor *= mix(1.0, uLegTone, vTgFar);
#if MANGE
  vTgMg = tgMangeOf();
  vTgPos = position;
#endif
}
`;

/** The animation GLSL (defines for a model, and the shared declarations with tgAnimate), for tools that run it outside three: dev/footslip-gpu.ts checks it against legmath.ts. */
export function animationShaderParts(def: ModelDef): { defs: string; decl: string } {
  return { defs: defines(def.params, def.far, def.geometry), decl: COMMON_DECL };
}

/** Mange, fragment side: declarations and the mottling applied after the coat colour (only models with MANGE). */
const MANGE_DECL = /* glsl */ `
varying float vTgMg;
varying vec3 vTgPos;
float tgH3(vec3 q) { return fract(sin(dot(q, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float tgVN(vec3 q) {
  vec3 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(tgH3(i), tgH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(tgH3(i + vec3(0.0, 1.0, 0.0)), tgH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(tgH3(i + vec3(0.0, 0.0, 1.0)), tgH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(tgH3(i + vec3(0.0, 1.0, 1.0)), tgH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;
const MANGE_FRAG = /* glsl */ `
        if (vTgMg > 0.01) {
          // patchy hair loss: dark mottled skin shows through in blotches (about 10 to 20 cm), over the haunches and tail root first,
          // with thinning hair (a darker, flatter coat) round the edge of each bare patch
          vec3 mq = vTgPos * 27.0;
          float mnz = 0.5 * tgVN(mq) + 0.3 * tgVN(mq * 2.3 + 7.1) + 0.2 * tgVN(mq * 0.37 + 2.0);
          float mrear = smoothstep(0.2, -0.5, vTgPos.x);
          float mthr = 1.0 - vTgMg * 0.3 - 0.3 * mrear;
          float mloss = smoothstep(mthr, mthr + 0.09, mnz);
          float medge = smoothstep(mthr - 0.14, mthr, mnz) * (1.0 - mloss);
          vec3 mskin = vec3(0.075, 0.05, 0.042) * (0.55 + 0.9 * tgVN(mq * 3.7 + 3.0));
          diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.16 * medge), mix(diffuseColor.rgb * 0.5, mskin, 0.45), mloss * 0.72);
        }
`;

const NO_FAR: NonNullable<ModelDef['far']> = { gain: 1, rim: 0, hunt: 0, rimCol: [1, 1, 1] };

export interface AnimalMaterials {
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
}

/** Uniform objects shared by every species material (and the depth materials). */
export interface AnimalShared {
  uTime: { value: number };
  /** Main camera position (world), updated from onBeforeRender. */
  uCamPos: { value: THREE.Vector3 };
  /** Pixels per meter at 1 m distance for a 900 px tall viewport. */
  uPxK: { value: number };
  /** Terrain heights as drawn (R32F, hn x hn, nearest filtered), cell size and vertex count per side: legs read the ground under their feet (HEIGHT_GLSL). */
  tHeight: { value: THREE.Texture | null };
  uCell: { value: number };
  uHN: { value: number };
  /** How dark the scene is, 0 bright day .. 1 night (from the scene's lights); updated by `probe`. */
  uLow: { value: number };
  /** Time-lapse weight 0..1 (the bound of the body at 10x and up). Optional: a layer that does not set it (small prey) gets 0. */
  uTL?: { value: number };
  /** Strength of the night lift (moon rim, albedo and fill) 0..1, 1 = on; a tuning and A/B hook. Optional: defaults to 1. */
  uNightK?: { value: number };
  /** Ambient light of the scene as an rgb (0 night .. about 0.7 day), set by `probe`. */
  uAmb: { value: THREE.Vector3 };
  /** Reads the lights of the scene being rendered into `uLow` (called once per draw of the main view). */
  probe?: (scene: THREE.Object3D, exposure: number) => void;
}

export function makeAnimalMaterials(sp: number, def: ModelDef, shared: AnimalShared): AnimalMaterials {
  shared.uTL ??= { value: 0 };
  shared.uNightK ??= { value: 1 };
  const defs = defines(def.params, def.far, def.geometry);
  // R3 mange (canids only): the fragment stage mottles the coat with dark bare skin in patches, more of it with severity (vTgMg).
  const hasMange = def.params.hunts === true && def.params.kind === 0;
  const mangeDecl = hasMange ? MANGE_DECL : '';
  const mangeFrag = hasMange ? MANGE_FRAG : '';
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: def.roughness, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uPxK = shared.uPxK;
    shader.uniforms.tHeight = shared.tHeight;
    shader.uniforms.uCell = shared.uCell;
    shader.uniforms.uHN = shared.uHN;
    shader.uniforms.uCoatPale = { value: new THREE.Vector3(...def.coatPale) };
    shader.uniforms.uCoatDark = { value: new THREE.Vector3(...def.coatDark) };
    shader.uniforms.uBone = { value: new THREE.Vector3(...def.bone) };
    shader.uniforms.uFill = { value: def.fill };
    shader.uniforms.uWarm = { value: new THREE.Vector3(...def.warm) };
    shader.uniforms.uNeutral = { value: def.neutral };
    const far = def.far ?? NO_FAR;
    shader.uniforms.uFarGain = { value: far.gain };
    shader.uniforms.uRimCol = { value: new THREE.Vector3(...far.rimCol) };
    shader.uniforms.uRimK = { value: far.rim };
    shader.uniforms.uHuntK = { value: far.hunt };
    shader.uniforms.uLow = shared.uLow;
    shader.uniforms.uTL = shared.uTL!;
    shader.uniforms.uNightK = shared.uNightK!;
    shader.uniforms.uAmb = shared.uAmb;
    shader.uniforms.uFarTint = { value: new THREE.Vector3(...(far.tint ?? [1, 1, 1])) };
    shader.uniforms.uFarMix = { value: far.tint ? far.mix ?? 0.5 : 0 };
    shader.uniforms.uFloor = { value: far.floor ?? 0 };
    shader.uniforms.uLowFill = { value: far.lowFill ?? 0 };
    shader.uniforms.uLegTone = { value: far.legs ?? 1 };
    shader.uniforms.uTopCol = { value: new THREE.Vector3(...(far.top ?? [1, 1, 1])) };
    shader.uniforms.uTopMix = { value: far.top ? far.topMix ?? 0.4 : 0 };
    shader.uniforms.uSideDark = { value: far.side ?? 0 };
    material.userData.shader = shader; // exposed for live tuning from the console
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}\n${COMMON_DECL}\n${VERT_SHADE_DECL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>\n vec3 tgP = position;\n tgAnimate(tgP, objectNormal);\n tgShade(objectNormal);`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = tgP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (tgFadeDiscard(vTgFade)) discard;')
      .replace('#include <common>', `#include <common>\n${FADE_FRAG_DECL}\nvarying vec3 vTgColor;\nvarying float vTgSel;\nvarying float vTgFar;\nvarying float vTgHunt;\nuniform float uFill;\nuniform vec3 uWarm;\nuniform float uNeutral;\nuniform float uFarGain;\nuniform vec3 uRimCol;\nuniform float uRimK;\nuniform float uHuntK;\nuniform float uLow;\nuniform vec3 uAmb;\nuniform vec3 uFarTint;\nuniform float uFarMix;\nuniform float uFloor;\nuniform float uLowFill;\nvarying float vTgUp;\nuniform vec3 uTopCol;\nuniform float uTopMix;\nuniform float uSideDark;\nuniform float uNightK;${mangeDecl}`)
      // Bright parts of the coat (the white bands and rump) are pulled toward a mid value as the light drops, so they
      // darken with the scene instead of glowing against the dark herds at dusk and night.
      .replace('#include <color_fragment>', `vec3 tgC = vTgColor * mix(1.0, uFarGain, vTgFar);
        // at range the coat is pulled toward its species colour (see ModelDef.far), keeping part of its own shading
        // (in a dim scene the lift is mostly withdrawn: at dusk and in the rain a herd stays darker than the ground it is on)
        float tgDim = 1.0 - 0.7 * uLow;
        tgC = mix(tgC, uFarTint * (0.75 + 0.5 * clamp(dot(vTgColor, vec3(0.2126, 0.7152, 0.0722)) * 6.0, 0.0, 1.0)), uFarMix * vTgFar * tgDim);
        // silhouette at range: a pale back on an oval, darker flanks (see ModelDef.far)
        float tgTop = smoothstep(0.62, 0.96, vTgUp);
        float tgLum0 = dot(vTgColor, vec3(0.2126, 0.7152, 0.0722));
        float tgKeep = 1.0 - smoothstep(0.2, 0.42, tgLum0); // bright markings (a white rump) stay as they are
        tgC = mix(tgC, uTopCol * (0.75 + 0.5 * clamp(tgLum0 * 6.0, 0.0, 1.0)), uTopMix * tgTop * vTgFar * tgKeep * (1.0 - 0.8 * uLow));
        tgC *= 1.0 - uSideDark * vTgFar * (1.0 - smoothstep(0.1, 0.6, vTgUp));
        float tgL = dot(tgC, vec3(0.2126, 0.7152, 0.0722));
        tgC = mix(tgC, vec3(tgL), 0.3 * uLow * vTgFar);
        tgC *= 1.0 - 0.8 * uLow * max(tgL - 0.16, 0.0) / max(tgL, 1e-3);
        diffuseColor.rgb *= tgC;
        // night lift: the coat reflects more of the little light there is, so the animals do not sink into the blue ground (the
        // far-view dimming above takes the coat down at night, this gives part of it back)
        // (pale coats, a pronghorn's white, get little of it: they already stand out against the dark ground)
        float tgNL = 1.0 - 0.7 * smoothstep(0.18, 0.5, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
        diffuseColor.rgb *= 1.0 + 0.35 * uLow * uNightK * tgNL;${mangeFrag}`)
      // sky fill: pull toward a warm neutral (so brown coats stay brown in blue shade), then boost it so the shaded side keeps form
      .replace(
        '#include <lights_fragment_end>',
        `irradiance = mix(irradiance, vec3(dot(irradiance, vec3(0.2126, 0.7152, 0.0722))) * uWarm, uNeutral) * uFill * (1.0 - uLowFill * uLow);\n#include <lights_fragment_end>`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float tgRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.35) * vTgSel * (0.015 + 0.45 * tgRim);
        float tgEdge = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 1.6);
        totalEmissiveRadiance += uRimCol * vTgFar * (uRimK + vTgHunt * uHuntK) * tgEdge * (1.0 - 0.9 * uLow);
        // ambient floor: a share of the scene's own ambient light reaches the coat unshadowed, so a herd in shade or at dusk
        // keeps its value above the shadows; it scales with the light, so it dims with the scene and never glows
        totalEmissiveRadiance += diffuseColor.rgb * uAmb * uFloor * vTgFar * (1.0 - 0.75 * uLow);
        // Moonlight (night only, uLow near 1): a cool rim along every silhouette edge, strongest on the surfaces that face the sky,
        // plus a cool fill on the coat itself. Starker than the day lighting on purpose, so an animal reads against the dark ground
        // by its outline and by value, without the night looking like day.
        float tgNR = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.8);
        float tgNK = smoothstep(0.25, 0.85, uLow) * uNightK;
        totalEmissiveRadiance += vec3(0.5, 0.64, 0.95) * 0.4 * tgNR * (0.3 + 0.7 * vTgUp) * tgNK * (0.6 + 0.4 * vTgFar) * tgNL;
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.045, 0.06, 0.11) * tgNK * (0.5 + 0.5 * vTgUp) * tgNL;`,
      );
  };
  material.customProgramCacheKey = () => `tg-animal-${sp}`;

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uPxK = shared.uPxK;
    shader.uniforms.tHeight = shared.tHeight;
    shader.uniforms.uCell = shared.uCell;
    shader.uniforms.uHN = shared.uHN;
    shader.uniforms.uTL = shared.uTL!;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}\n${COMMON_DECL}\nvarying float vTgFade;`)
      // a bird in flight casts no shadow (collapse it to a point): at the boost the wide view needs, it would sweep a huge
      // blocky smudge across the ground. A raptor below 40 m and within 170 m of the camera does cast one (R5)
      .replace('#include <begin_vertex>', `vec3 tgP = position;\n vec3 tgN = vec3(0.0, 1.0, 0.0);\n tgAnimate(tgP, tgN);\n vTgFade = aGait.y < -0.5 ? 1.0 : tgFadeOf();\n#if KIND == 2\n#if RAPTOR\n if (aFx.y > 40.0 || distance(uCamPos, vec3(instanceMatrix[3])) > 170.0) tgP = vec3(0.0);\n#else\n if (aFx.y > 1.0) tgP = vec3(0.0);\n#endif\n#endif\n vec3 transformed = tgP;`);
    // the stippled border fade casts a stippled shadow too
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (tgFadeDiscard(vTgFade)) discard;')
      .replace('#include <common>', `#include <common>\n${FADE_FRAG_DECL}`);
  };
  depth.customProgramCacheKey = () => `tg-animal-depth-${sp}`;
  return { material, depth };
}
