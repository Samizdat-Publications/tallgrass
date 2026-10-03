// Vertex-shader animation for the instanced animals. No skeletons: every vertex knows which part of the
// body it belongs to (aPart.x) and its pivots, and the gait, graze, rest and carcass poses are computed here.
//
// Per-instance inputs (InstancedBufferAttribute, vec4):
//   aGait = (gait phase 0..1, speed m/s [-1 marks a carcass], head-down weight | flap amount | carcass remaining, lie weight)
//   aLook = (coat 0..1, per-animal seed 0..1, crouch | wing fold, selected + sick: floor() = selected 0/1, fract() = sickness 0..0.98)
import * as THREE from 'three';
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
    `#define FLAP_HZ ${f(p.flapHz)}`,
    `#define MIN_PX ${f(p.minPx)}`,
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

void tgAnimate(inout vec3 p, inout vec3 n) {
  int part = int(aPart.x + 0.5);
  float spd = aGait.y;
  bool dead = spd < -0.5;
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

  // gait weights from speed
  float s1 = smoothstep(TROT0, TROT1, spd);
  float wGal = smoothstep(GAL0, GAL1, spd);
  float wTrot = s1 * (1.0 - wGal);
  float wWalk = smoothstep(0.08, 0.4, spd) * (1.0 - s1);
  float moveK = dead ? 0.0 : (1.0 - lie);
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

  if (part >= 1 && part <= 4) {
    vec4 oW = OFF_W; vec4 oT = OFF_T; vec4 oG = OFF_G;
    float ow = part == 1 ? oW.x : (part == 2 ? oW.y : (part == 3 ? oW.z : oW.w));
    float ot = part == 1 ? oT.x : (part == 2 ? oT.y : (part == 3 ? oT.z : oT.w));
    float og = part == 1 ? oG.x : (part == 2 ? oG.y : (part == 3 ? oG.z : oG.w));
    bool front = part <= 2;
    float aw = TG_TAU * (ph + ow), at = TG_TAU * (ph + ot), ag = TG_TAU * (ph + og);
    float hip = wWalk * AMP_W * sin(aw) + wTrot * AMP_T * sin(at) + wGal * AMP_G * sin(ag);
    float lift = wWalk * KNEE_W * max(cos(aw), 0.0) + wTrot * KNEE_T * max(cos(at), 0.0) + wGal * KNEE_G * max(cos(ag), 0.0);
    float knee = front ? -lift : lift * HOCK_K;
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
      hip = front ? DEAD_HIP_F : DEAD_HIP_H;
      knee = 0.0;
    }
    tgRotZ(p, n, aPivot2, knee * aPart.y);
    tgRotZ(p, n, aPivot, hip);
  } else if (part == 5) {
    float graze = dead ? 0.0 : aGait.z;
#if KIND == 2
    graze *= aLook.z; // birds: head pecks only while perched (fold = 1)
#endif
    float raise = smoothstep(0.5, 0.85, sin(t * 0.37 + seed * 40.0));
    float dn = graze * (1.0 - 0.85 * raise);
    float nod = (wWalk + wTrot) * NOD_W * sin(2.0 * cyc + 1.0) + wGal * NOD_G * sin(cyc + 2.0);
    float chew = dn * 0.05 * sin(t * 7.0 + seed * 20.0);
    float yaw = LOOK_YAW * sin(t * 0.45 + seed * 13.0) * (1.0 - dn) * (1.0 - wGal) * (1.0 - lie * 0.5);
    float ang = -HEAD_DN * dn + nod + chew - 0.45 * crouchBody - 0.5 * sick * (1.0 - 0.5 * dn);
    ang = mix(ang, 0.15, lie * 0.7);
    if (dead) { ang = -0.55; yaw = 0.25; }
    tgRotY(p, n, aPivot, yaw);
    tgRotZ(p, n, aPivot, ang);
  } else if (part == 6) {
    float sway = TAIL_SWAY * sin(t * 2.1 + seed * 17.0) + wWalk * 0.15 * sin(cyc);
    float lift = mix(TAIL_REST, TAIL_RUN, clamp(wGal + 0.4 * wTrot, 0.0, 1.0)) + 0.05 * sin(t * 1.3 + seed * 9.0);
    if (dead) { lift = 0.0; sway = 0.0; }
    tgRotZ(p, n, aPivot, lift);
    tgRotY(p, n, aPivot, sway);
  } else if (part == 7 || part == 8) {
    float right = part == 8 ? 1.0 : -1.0;
    float fold = aLook.z;
    float flap = aGait.z * (1.0 - fold);
    float burst = smoothstep(0.55, 0.85, sin(t * 0.6 + seed * 50.0));
    float fl = clamp(flap + burst * 0.75, 0.0, 1.0);
    float fph = TG_TAU * (t * FLAP_HZ * (0.85 + 0.3 * fract(seed * 3.7)) + seed * 10.0);
    float inner = 0.17 + 0.05 * sin(t * 1.7 + seed * 9.0) + fl * 0.75 * sin(fph);
    float outer = 0.1 + fl * 0.6 * sin(fph - 1.1);
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

  p.y += bob + breathe - lie * LIE_DROP - crouchBody * CROUCH_DROP;
  tgRotZ(p, n, vec3(0.0, COM_Y, 0.0), pitch);

  if (dead) {
    float r = clamp(aGait.z, 0.0, 1.0);
    float roll = (fract(seed * 5.31) > 0.5 ? 1.0 : -1.0) * 1.45;
    tgRotX(p, n, vec3(0.0, COM_Y, 0.0), roll);
    p.y -= DEAD_DROP;
    float k = mix(0.4, 1.0, r);
    p.y = p.y * k;
    p.xz *= mix(0.8, 1.0, r);
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

void tgShade() {
  bool dead = aGait.y < -0.5;
  vec3 coat = mix(uCoatPale, uCoatDark, aLook.x);
  float c = aPart.z;
  vec3 col = aColor * ((1.0 - c) + c * coat);
  float v = 0.9 + 0.2 * fract(aLook.y * 7.31);
  col *= mix(1.0, v, c);
  if (dead) {
    float r = aGait.z;
    col *= 0.7;
    vec3 flesh = vec3(0.22, 0.035, 0.03);
    float fleshW = (1.0 - smoothstep(0.38, 0.62, r)) * 0.85;
    float boneW = (1.0 - smoothstep(0.06, 0.3, r));
    col = mix(mix(col, flesh, fleshW), uBone, boneW);
  }
  float sick = dead ? 0.0 : fract(aLook.w);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(luma * 1.1) * vec3(0.96, 0.97, 0.95) + vec3(0.015), 0.5 * sick);
  vTgColor = col;
  vTgSel = floor(aLook.w + 0.001);
}
`;

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
    material.userData.shader = shader; // exposed for live tuning from the console
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}\n${COMMON_DECL}\n${VERT_SHADE_DECL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>\n vec3 tgP = position;\n tgAnimate(tgP, objectNormal);\n tgShade();`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = tgP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTgColor;\nvarying float vTgSel;\nuniform float uFill;`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vTgColor;')
      // stronger sky fill so the shaded side keeps form instead of going black
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= uFill;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float tgRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.35) * vTgSel * (0.015 + 0.45 * tgRim);`,
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
      .replace('#include <begin_vertex>', `vec3 tgP = position;\n vec3 tgN = vec3(0.0, 1.0, 0.0);\n tgAnimate(tgP, tgN);\n vec3 transformed = tgP;`);
  };
  depth.customProgramCacheKey = () => `tg-animal-depth-${sp}`;
  return { material, depth };
}
