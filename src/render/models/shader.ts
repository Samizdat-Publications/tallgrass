// Vertex-shader animation for the instanced animals. No skeletons: every vertex knows which part of the
// body it belongs to (aPart.x) and its pivots, and the gait, graze, rest and carcass poses are computed here.
//
// Per-instance inputs (InstancedBufferAttribute, vec4):
//   aGait = (gait phase 0..1, speed m/s [-1 marks a carcass], head-down weight | flap amount | carcass remaining, lie weight)
//   aLook = (coat 0..1, per-animal seed 0..1, crouch | wing fold, selected + sick: floor() = selected 0/1, fract() = sickness 0..0.98)
//   aFx   = (feeding tug weight 0..1, altitude above ground in m (birds), hunting weight 0..1, pounce envelope 0..1 |
//            for a carcass: how far it has fallen over, 0 standing .. 1 down)
import * as THREE from 'three';
import { STRETCH_CAP, footReach } from './types';
import type { AnimParams, ModelDef } from './types';

const f = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(5)));
const v4 = (a: number[]): string => `vec4(${a.map(f).join(',')})`;

function defines(p: AnimParams): string {
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
    `#define REACH_W ${f(footReach(p.ampW))}`, `#define REACH_T ${f(footReach(p.ampT))}`, `#define REACH_G ${f(footReach(p.ampG))}`,
    `#define STRETCH_CAP ${f(STRETCH_CAP)}`, `#define STRETCH_Y ${f(Math.sqrt(STRETCH_CAP * STRETCH_CAP - 1))}`,
    `#define FLAP_HZ ${f(p.flapHz)}`,
    `#define MIN_PX ${f(p.minPx)}`,
    `#define FAR_NEAR 140.0`, `#define FAR_FAR 400.0`,
    `#define ANIM_NEAR 25.0`, `#define ANIM_FAR 150.0`,
    `#define BODY_LEN ${f(p.boostLen)}`,
  ].join('\n');
}

const COMMON_DECL = /* glsl */ `
#define TG_TAU 6.28318530718
attribute vec4 aPart;
attribute vec3 aColor;
attribute vec3 aPivot;
attribute vec3 aPivot2;
attribute vec4 aGait;
attribute vec4 aLook;
attribute vec4 aFx;
uniform float uTime;
uniform vec3 uCamPos;
uniform float uPxK;

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

// Planted-foot leg cycle for quadrupeds. u = leg phase in cycles. The foot is on the ground for beta of the cycle,
// starting a quarter cycle in, and sweeps back at a constant rate (so it stays put on the ground while the body moves
// over it); the rest of the cycle is a swing forward with a small reach and retraction around touchdown, so the foot
// lands already moving back. Returns (W, arc): W is the foot position along the stride (+1 front .. -1 back), arc is
// the 0..1 height profile of the lifted foot.
// Hip angle that puts a planted foot y leg-lengths ahead of the hip, with the leg lengthening by 1 / cos up to STRETCH_CAP.
float tgHipFor(float y) {
  float a = abs(y);
  float h = a <= STRETCH_Y ? atan(a) : asin(min(a / STRETCH_CAP, 1.0));
  return y < 0.0 ? -h : h;
}

vec2 tgLegWave(float u, float beta) {
  float v = fract(u - 0.25);
  if (v < beta) return vec2(1.0 - 2.0 * v / beta, 0.0);
  float s = (v - beta) / (1.0 - beta);
  float k = 1.2 * (1.0 - beta) / beta;
  float h = s * s * (3.0 - 2.0 * s);
  float t1 = s * s * s * (1.0 - s);
  float t0 = s * (1.0 - s) * (1.0 - s) * (1.0 - s);
  return vec2(-1.0 + 2.0 * h + k * (t1 - t0), sin(3.14159265 * s));
}

void tgAnimate(inout vec3 p, inout vec3 n) {
  int part = int(aPart.x + 0.5);
  float spd = aGait.y;
  bool dead = spd < -0.5;
  // A body that has just been killed keeps the running pace it died at (aFx.z) while its legs go loose: the gait fades out
  // over the first part of the fall (aFx.w, 0 = just hit, 1 = down) instead of the animal freezing stiff and tipping over.
  float fallen = dead ? clamp(aFx.w, 0.0, 1.0) : 1.0;
  float stag = dead ? (1.0 - smoothstep(0.08, 0.5, fallen)) : 1.0;
  float spdG = dead ? aFx.z : spd;
  float seed = aLook.y;
  float sick = dead ? 0.0 : fract(aLook.w);
  float lie = dead ? 0.0 : aGait.w;
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
  float farK = smoothstep(ANIM_NEAR, ANIM_FAR, distance(uCamPos, vec3(instanceMatrix[3])));
  float pounce = dead ? 0.0 : aFx.w;

  // gait weights from speed
  float s1 = smoothstep(TROT0, TROT1, spdG);
  float wGal = smoothstep(GAL0, GAL1, spdG);
  float wTrot = s1 * (1.0 - wGal);
  float wWalk = smoothstep(0.08, 0.4, spdG) * (1.0 - s1);
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
  float tugPull = 0.0, tugShake = 0.0, peck = 0.0, peckUp = 0.0;
  if (tug > 0.001) {
#if KIND == 2
    // pecking comes in bursts: the head lifts a little, then stabs down, 1.6 to 2.4 times a second
    float burst = smoothstep(-0.2, 0.25, sin(t * 0.8 + seed * 31.0));
    float pk = 0.5 + 0.5 * sin(TG_TAU * (t * (1.6 + 0.8 * fract(seed * 3.1)) + seed * 9.0));
    peck = tug * burst * pk * pk;
    peckUp = tug * burst * 0.35;
    pitch -= peck * 0.22;
#else
    float tp = fract(t * (0.5 + 0.2 * fract(seed * 5.3)) + seed * 7.0);
    tugPull = tug * smoothstep(0.0, 0.62, tp) * (1.0 - smoothstep(0.62, 0.7, tp));
    tugShake = tug * smoothstep(0.3, 0.55, tp) * (1.0 - smoothstep(0.62, 0.7, tp)) * sin(t * 21.0 + seed * 40.0);
    pitch += tugPull * 0.05;
#endif
  }

  if (part >= 1 && part <= 4) {
    vec4 oW = OFF_W; vec4 oT = OFF_T; vec4 oG = OFF_G;
    float ow = part == 1 ? oW.x : (part == 2 ? oW.y : (part == 3 ? oW.z : oW.w));
    float ot = part == 1 ? oT.x : (part == 2 ? oT.y : (part == 3 ? oT.z : oT.w));
    float og = part == 1 ? oG.x : (part == 2 ? oG.y : (part == 3 ? oG.z : oG.w));
    bool front = part <= 2;
    float hip, lift;
    float stc = 0.0;
    float hipGait = 0.0; // the gait's hip angle in the world frame (before the body pitch is cancelled)
#if KIND == 0
    vec2 lw = tgLegWave(ph + ow, DUTY_W);
    vec2 lt = tgLegWave(ph + ot, DUTY_T);
    vec2 lg = tgLegWave(ph + og, mix(DUTY_G, DUTY_GF, smoothstep(FAST0, FAST1, spdG)));
    hip = wWalk * tgHipFor(lw.x * REACH_W) + wTrot * tgHipFor(lt.x * REACH_T) + wGal * tgHipFor(lg.x * REACH_G);
    lift = wWalk * KNEE_W * lw.y + wTrot * KNEE_T * lt.y + wGal * KNEE_G * lg.y;
    // how planted this foot is (1 on the ground, 0 mid swing), used to keep it from riding up with the body
    float liftPeak = wWalk * KNEE_W + wTrot * KNEE_T + wGal * KNEE_G;
    stc = (1.0 - smoothstep(0.0, 0.3, lift / max(liftPeak, 0.001))) * moveK;
    hipGait = hip;
    hip -= pitch * stc; // the body's pitch is cancelled in the planted leg (applied later to everything)
#else
    float aw = TG_TAU * (ph + ow), at = TG_TAU * (ph + ot), ag = TG_TAU * (ph + og);
    hip = wWalk * AMP_W * sin(aw) + wTrot * AMP_T * sin(at) + wGal * AMP_G * sin(ag);
    lift = wWalk * KNEE_W * max(cos(aw), 0.0) + wTrot * KNEE_T * max(cos(at), 0.0) + wGal * KNEE_G * max(cos(ag), 0.0);
#endif
    float knee = front ? -lift : lift * HOCK_K;
    // pounce: forelegs reach out ahead, hindlegs drive
    hip += pounce * (front ? 0.85 : -0.55);
    // stalking: bent legs
    hip += crouchBody * (front ? 0.25 : -0.2);
    float lieHip = front ? LIE_HIP_F : LIE_HIP_H;
    float lieKnee = front ? LIE_KNEE_F : LIE_KNEE_H;
    hip = mix(hip, lieHip, lie);
    knee = mix(knee, lieKnee, lie);
#if KIND == 2
    hip = -1.5 * (1.0 - aLook.z); // birds: legs tuck back in flight, hang when perched
    knee = 0.0;
#endif
    if (dead) {
      // A fallen animal lies on its side with the legs folded, not stiff spikes. Going down it first stumbles on (the gait it
      // died in fading out), the forelegs buckle ahead of the hind legs and every leg flops loose, then it folds up.
      float loose = sin(3.14159265 * clamp((fallen - 0.06) / 0.8, 0.0, 1.0));
      float flopH = loose * (0.55 * sin(fallen * 17.0 + float(part) * 1.9) + (front ? 0.35 : -0.15));
      float flopK = loose * 0.9 * (0.5 + 0.5 * sin(fallen * 13.0 + float(part) * 2.3)) * (front ? -1.0 : HOCK_K);
      float fh = front ? mix(DEAD_HIP_F, LIE_HIP_F, 0.7) : mix(DEAD_HIP_H, LIE_HIP_H, 0.7);
      float fk = (front ? LIE_KNEE_F : LIE_KNEE_H) * 0.7;
      float f2 = smoothstep(front ? 0.2 : 0.4, 1.0, fallen);
      hip = mix(hip, fh, f2) + flopH * (1.0 - f2);
      knee = mix(knee, fk, f2) + flopK * (1.0 - f2);
    }
    tgRotZ(p, n, aPivot2, knee * aPart.y);
    tgRotZ(p, n, aPivot, hip);
#if KIND == 0
    // a planted foot stays on the ground as the leg leans (the leg lengthens by 1 / cos, a little, never more than 15%)
    // and as the body bobs, so only its sweep over the ground is left
    p = aPivot + (p - aPivot) * mix(1.0, min((1.0 + bob / COM_Y) / cos(hipGait), STRETCH_CAP), stc);
#endif
  } else if (part == 5) {
    float graze = dead ? 0.0 : aGait.z;
#if KIND == 2
    graze *= aLook.z; // birds: head pecks only while perched (fold = 1)
#endif
    float raise = smoothstep(0.5, 0.85, sin(t * 0.37 + seed * 40.0)) * (1.0 - 0.8 * tug); // a feeding animal keeps its head down
    float dn = graze * (1.0 - 0.85 * raise);
    float nod = (wWalk + wTrot) * NOD_W * sin(2.0 * cyc + 1.0) + wGal * NOD_G * sin(cyc + 2.0);
    float chew = dn * 0.05 * sin(t * 7.0 + seed * 20.0);
    float yaw = LOOK_YAW * sin(t * 0.45 + seed * 13.0) * (1.0 - dn) * (1.0 - wGal) * (1.0 - lie * 0.5);
    float ang = -HEAD_DN * dn + nod + chew - 0.45 * crouchBody - 0.5 * sick * (1.0 - 0.5 * dn);
    ang += tugPull * 0.6 - peck * 1.0 + peckUp;
    yaw += tugShake * 0.3;
    // from the drone view the head pumps harder so a trot or a gallop reads as a body moving, not sliding
    float pump = farK * (wWalk * 0.1 * sin(2.0 * cyc + 1.0) + wTrot * 0.16 * sin(2.0 * cyc + 1.0) + wGal * 0.32 * sin(cyc + 2.0));
    ang += pump;
    ang -= pounce * 0.55; // the head drives forward and down onto the prey
    ang = mix(ang, 0.15, lie * 0.7);
    if (dead) {
      // the head drops as the animal goes, then lies slack
      ang = mix(ang, -0.8, smoothstep(0.0, 0.3, fallen));
      ang = mix(ang, -0.55, smoothstep(0.5, 1.0, fallen));
      yaw = 0.25 * fallen;
    }
    tgRotY(p, n, aPivot, yaw);
    tgRotZ(p, n, aPivot, ang);
  } else if (part == 6) {
    float sway = TAIL_SWAY * sin(t * 2.1 + seed * 17.0) + wWalk * 0.15 * sin(cyc);
    float lift = mix(TAIL_REST, TAIL_RUN, clamp(wGal + 0.4 * wTrot, 0.0, 1.0)) + 0.05 * sin(t * 1.3 + seed * 9.0);
    if (dead) { float lim = 1.0 - smoothstep(0.1, 0.6, fallen); lift *= lim; sway *= lim; }
    tgRotZ(p, n, aPivot, lift);
    tgRotY(p, n, aPivot, sway);
  } else if (part == 7 || part == 8) {
    float right = part == 8 ? 1.0 : -1.0;
    float fold = aLook.z;
    float flap = aGait.z * (1.0 - fold);
    float burst = smoothstep(0.55, 0.85, sin(t * 0.6 + seed * 50.0));
    float fl = clamp(flap + burst * 0.75, 0.0, 1.0);
    float fph = TG_TAU * (t * FLAP_HZ * (0.85 + 0.3 * fract(seed * 3.7)) + seed * 10.0);
    float wAmp = 1.0 + 0.6 * farK; // a deeper beat from the drone view, where a raven is a few pixels across
    float inner = 0.17 + 0.05 * sin(t * 1.7 + seed * 9.0) + fl * 0.75 * wAmp * sin(fph);
    float outer = 0.1 + fl * 0.6 * wAmp * sin(fph - 1.1);
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
  }

  p.y += bob + breathe - lie * LIE_DROP - crouchBody * CROUCH_DROP - sick * 0.035 * COM_Y; // a sick animal sags a little
  tgRotZ(p, n, vec3(0.0, COM_Y, 0.0), pitch);

#if KIND == 0
  if (!dead && farK > 0.001) {
    // Whole-body gait cues sized as a fraction of the body length, so they stay readable at 15 to 40 px: a bound (the body
    // rises and falls once per stride in a gallop), the spine arching and stretching, a lateral snake, and the body pitching.
    float bl = BODY_LEN;
    float hop = wWalk * 0.02 * cos(2.0 * cyc) + wTrot * 0.05 * cos(2.0 * cyc) + wGal * 0.1 * cos(cyc - 0.5);
    float xn = clamp(p.x / (bl * 0.55), -1.3, 1.3);
    float arch = (wTrot * 0.03 + wGal * 0.055) * cos(cyc + 1.0) * (xn * xn - 0.35);
    float snake = (wWalk * 0.018 + wTrot * 0.032 + wGal * 0.036) * sin(cyc + 0.3) * xn;
    p.y += bl * farK * (hop + arch);
    p.z += bl * farK * snake;
    tgRotZ(p, n, vec3(0.0, COM_Y, 0.0), farK * (wTrot * 0.05 * sin(2.0 * cyc + 0.5) + wGal * 0.13 * sin(cyc + 1.0)));
  }
#endif
#if KIND == 2
  if (!dead && farK > 0.001 && aGait.z > 0.3 && aLook.z < 0.5) {
    // wing beats lift and drop the whole bird a little
    float fph2 = TG_TAU * (t * FLAP_HZ * (0.85 + 0.3 * fract(seed * 3.7)) + seed * 10.0);
    p.y += BODY_LEN * farK * 0.06 * sin(fph2 - 0.4);
  }
#endif

  // the leap of a pounce: the forequarters rise about the hind end and the whole animal lifts
  if (pounce > 0.001) {
    p.y += pounce * COM_Y * 0.25;
    tgRotZ(p, n, vec3(-0.3 * BODY_LEN, COM_Y * 0.6, 0.0), pounce * 0.42);
  }

  if (dead) {
    float r = clamp(aGait.z, 0.0, 1.0);
    float side = (fract(seed * 5.31) > 0.5 ? 1.0 : -1.0);
    // the stumble: the nose dips as the forelegs buckle, then the body rolls onto its side
    float dip = sin(3.14159265 * smoothstep(0.0, 0.5, fallen)) * (1.0 - smoothstep(0.5, 0.75, fallen));
    tgRotZ(p, n, vec3(-0.25 * BODY_LEN, COM_Y, 0.0), -0.3 * dip);
    float roll = side * 1.45 * smoothstep(0.3, 1.0, fallen);
    tgRotX(p, n, vec3(0.0, COM_Y, 0.0), roll);
    p.y -= DEAD_DROP * smoothstep(0.3, 1.0, fallen);
    float f3 = smoothstep(0.3, 1.0, fallen);
    float k = mix(1.0, mix(0.4, 1.0, r), f3);
    p.y = p.y * k;
    p.xz *= mix(1.0, mix(0.8, 1.0, r), f3);
  }

  // distance readability: keep every animal at least MIN_PX pixels long (on a 900 px tall viewport), growing gently
  vec3 ip = vec3(instanceMatrix[3]);
  float isc = length(vec3(instanceMatrix[0]));
  float px = BODY_LEN * isc * uPxK / max(length(uCamPos - ip), 1.0);
  p *= clamp(MIN_PX / max(px, 0.01), 1.0, 7.0);
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

void tgShade() {
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
  }
  // Sickness: a duller, greyer, slightly darker coat (the head droop and the slower gait are in tgAnimate). Never a tint.
  float sick = dead ? 0.0 : fract(aLook.w);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(luma * 0.92) * vec3(0.97, 0.97, 0.96), 0.6 * sick) * (1.0 - 0.1 * sick);
  vTgColor = col;
  vTgSel = floor(aLook.w + 0.001);
  // distance readability: 0 close up, 1 from the wide view (see ModelDef.far)
  vTgFar = smoothstep(FAR_NEAR, FAR_FAR, distance(uCamPos, vec3(instanceMatrix[3])));
  vTgHunt = dead ? 0.0 : aFx.z;
}
`;

const NO_FAR = { gain: 1, rim: 0, hunt: 0, rimCol: [1, 1, 1] as [number, number, number] };

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
  /** How dark the scene is, 0 bright day .. 1 night (from the scene's lights); updated by `probe`. */
  uLow: { value: number };
  /** Reads the lights of the scene being rendered into `uLow` (called once per draw of the main view). */
  probe?: (scene: THREE.Object3D, exposure: number) => void;
}

export function makeAnimalMaterials(sp: number, def: ModelDef, shared: AnimalShared): AnimalMaterials {
  const defs = defines(def.params);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: def.roughness, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uPxK = shared.uPxK;
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
    material.userData.shader = shader; // exposed for live tuning from the console
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}\n${COMMON_DECL}\n${VERT_SHADE_DECL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>\n vec3 tgP = position;\n tgAnimate(tgP, objectNormal);\n tgShade();`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = tgP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTgColor;\nvarying float vTgSel;\nvarying float vTgFar;\nvarying float vTgHunt;\nuniform float uFill;\nuniform vec3 uWarm;\nuniform float uNeutral;\nuniform float uFarGain;\nuniform vec3 uRimCol;\nuniform float uRimK;\nuniform float uHuntK;\nuniform float uLow;`)
      // Bright parts of the coat (the white bands and rump) are pulled toward a mid value as the light drops, so they
      // darken with the scene instead of glowing against the dark herds at dusk and night.
      .replace('#include <color_fragment>', `vec3 tgC = vTgColor * mix(1.0, uFarGain, vTgFar);
        float tgL = dot(tgC, vec3(0.2126, 0.7152, 0.0722));
        tgC *= 1.0 - 0.8 * uLow * max(tgL - 0.16, 0.0) / max(tgL, 1e-3);
        diffuseColor.rgb *= tgC;`)
      // sky fill: pull toward a warm neutral (so brown coats stay brown in blue shade), then boost it so the shaded side keeps form
      .replace(
        '#include <lights_fragment_end>',
        `irradiance = mix(irradiance, vec3(dot(irradiance, vec3(0.2126, 0.7152, 0.0722))) * uWarm, uNeutral) * uFill * (1.0 - 0.3 * uLow);\n#include <lights_fragment_end>`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float tgRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.35) * vTgSel * (0.015 + 0.45 * tgRim);
        float tgEdge = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 1.6);
        totalEmissiveRadiance += uRimCol * vTgFar * (uRimK + vTgHunt * uHuntK) * tgEdge * (1.0 - 0.9 * uLow);`,
      );
  };
  material.customProgramCacheKey = () => `tg-animal-${sp}`;

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uPxK = shared.uPxK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}\n${COMMON_DECL}`)
      // a bird in flight casts no shadow (collapse it to a point): at the boost the wide view needs, it would sweep a huge
      // blocky smudge across the ground
      .replace('#include <begin_vertex>', `vec3 tgP = position;\n vec3 tgN = vec3(0.0, 1.0, 0.0);\n tgAnimate(tgP, tgN);\n#if KIND == 2\n if (aFx.y > 1.0) tgP = vec3(0.0);\n#endif\n vec3 transformed = tgP;`);
  };
  depth.customProgramCacheKey = () => `tg-animal-depth-${sp}`;
  return { material, depth };
}
