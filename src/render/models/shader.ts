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
//   R7 near/far LOD (quadrupeds with `nearGeometry`): two meshes share the animal layer's per-instance data. The far mesh draws every
//   instance; the near mesh draws only those within the near range (a copy of their rows). aLook.w carries 32 * (this instance has a near
//   copy) on top of the flags above. Within the fade range (ModelDef.lod) the two cross-fade by a complementary dithered discard.
//   R6 mule deer (STOT): aFx2 = (antler growth 0..1, stotting weight 0..1, velvet 0..1, winter coat 0..1). A cougar (STALK) reads the freeze before
//            the rush (0..1) from aFx2.y while it is not feeding.
//   aFx2  = (only for hunters and birds, #define FX2) a predator: (hold on the prey 0..1, feeding cycle phase 0..1, leap 0..1: the
//            spring onto the prey, which falls away as the hold takes over); a raven: (hop
//            0..1 or -1, walk phase 0..1 or -1, seconds into a takeoff or -1, flutter 0..1)
//   R8 behaviour library. A bison (BEHAV) has no use for the crouch (aLook.z) or the hunting weight (aFx.z), and carries seven weights in them
//            in 6-bit steps (the animal layer's packBison; a bison has no aFx2 either, and a second instance attribute is a cost the herd views
//            feel): aLook.z = snow dig + 64 wallow roll + 4096 rub on a tree + 262144 air (0..15: the legs follow the body in the air of a calf's
//            hop), aFx.z = bellow + 64 calf play + 4096 spar shove + 262144 (1 for the bull that shoves half a cycle later). A pronghorn (FLARE)
//            reads aFx.w, which it never uses for a pounce, as the rump flare. A perched raptor reads aFx2.w as the preen weight. A canid's pack
//            (aFx2.w) also carries the scent mark.
import * as THREE from 'three';
import { IK_CAP, footReach, plantedStride, stotStride } from './types';
import type { AnimParams, ModelDef } from './types';
import { HEIGHT_GLSL } from '../common';
import { IK_FAR, IK_NEAR, LEG_FLEX, LIFT_K, LNCOSH1, SPINE_K, SPINE_PHASE, SPINE_TROT, legLength, legRigOf } from './legmath';

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

type Variant = 'single' | 'near' | 'far';

/**
 * R8 switch (a benchmark and debugging hook): off, the bison and pronghorn programs are compiled without the behaviour poses and the rump flare
 * (which makes them the programs of before R8, give or take the canids' scent mark). Flip it, then set `needsUpdate` on the materials (the animal layer's
 * `r8` setter does both); the program cache key carries it, so the two programs are each compiled once.
 */
export const R8_SHADER = { on: true, bison: true, flare: true };

/**
 * r-idle switch (a benchmark and debugging hook): off, the quadruped programs are compiled without the idle layer (`?idle=0` on the page URL sets it
 * before the programs are built). The idle layer is ALU only and keyed off the per-instance data the shader already reads, so it adds no attribute.
 */
export const IDLE_SHADER = { on: typeof location === 'undefined' || new URLSearchParams(location.search).get('idle') !== '0' };

/** R6 mule deer: the antler anchor and the growth at which the forks and the second tines come out (defaults for every other model). */
function seasonDefines(def?: ModelDef, variant: Variant = 'single'): string {
  const s = def?.seasonal;
  const sh = variant === 'near' && def?.a3?.antlerShift ? def.a3.antlerShift : [0, 0, 0]; // (an authored head: the antlers sit elsewhere)
  return [
    `#define ANT_BASE vec3(${(s?.antlerBase ?? [0, 0, 0]).map((x, k) => f(x + sh[k])).join(',')})`,
    `#define ANT_FORK ${f(s?.forkAt ?? 0.3)}`, `#define ANT_TINE ${f(s?.tineAt ?? 0.7)}`,
  ].join('\n');
}

/** R6 stotting constants as defines (`STOT 0` and nothing else for every species that does not stot). */
function stotDefines(p: AnimParams): string[] {
  const s = p.stot;
  if (p.kind !== 0 || !s) return ['#define STOT 0'];
  return [
    '#define STOT 1',
    `#define STOT_DUTY ${f(s.duty)}`, `#define STOT_STRIDE ${f(stotStride(p))}`, `#define STOT_LIFT ${f(LIFT_K * legLength(p) * s.knee)}`,
    `#define STOT_BOB ${f(s.bob)}`, `#define STOT_SINK ${f(s.sink)}`, `#define STOT_PITCH ${f(s.pitch)}`, `#define STOT_OFF ${v4(s.off)}`,
  ];
}

/** R7 constants as defines: which LOD this program draws, the cross-fade range, and the fur and shell shading. */
function lodDefines(def: ModelDef | undefined, variant: Variant): string[] {
  const fur = def?.fur;
  const lod = def?.lod ?? { d0: 50, d1: 70 };
  const sh = fur?.shell;
  return [
    `#define NEARLOD ${variant === 'near' ? 1 : 0}`, `#define FARLOD ${variant === 'far' ? 1 : 0}`,
    `#define LOD0 ${f(lod.d0)}`, `#define LOD1 ${f(lod.d1)}`,
    `#define FUR ${fur ? 1 : 0}`,
    `#define FUR_SHEEN ${f(fur?.sheen ?? 0)}`, `#define FUR_SHEEN_POW ${f(fur?.sheenPow ?? 40)}`,
    `#define FUR_SHEEN_TINT vec3(${(fur?.sheenTint ?? [1, 1, 1]).map(f).join(',')})`,
    `#define FUR_RIM ${f(fur?.rim ?? 0)}`,
    `#define FUR_DORSAL ${f(fur?.dorsal ?? 0)}`, `#define FUR_BELLY ${f(fur?.belly ?? 0)}`,
    `#define FUR_STREAK ${f(fur?.streak ?? 0)}`, `#define FUR_MOTTLE ${f(fur?.mottle ?? 0)}`, `#define FUR_MOTTLE_SCALE ${f(fur?.mottleScale ?? 7)}`, `#define FUR_INDIV ${f(fur?.indiv ?? 0)}`,
    `#define A3SKIN ${variant === 'near' && def?.a3 ? 1 : 0}`,
    // r-feet: how much of the leg's net swing the foot is turned back by (1 = a level sole), and the foot's height range (fractions of the leg length) over which that fades out
    `#define A3_ANKLE ${f(variant === 'near' ? def?.a3?.ankle ?? 1 : 0)}`, `#define A3_FOOT_Y0 ${f(def?.a3?.footY?.[0] ?? 0.07)}`, `#define A3_FOOT_Y1 ${f(def?.a3?.footY?.[1] ?? 0.2)}`,
    // a3 graze: the head angle multiplier, the forebody pitch down and the neck drop (m) while grazing (an authored head is shorter than the procedural one)
    `#define A3_SPINE ${f(variant === 'near' ? def?.a3?.spineK ?? 1 : 1)}`, `#define A3_DN ${f(variant === 'near' ? def?.a3?.grazeK ?? 1 : 1)}`, `#define A3_PITCH ${f(variant === 'near' ? def?.a3?.grazePitch ?? 0 : 0)}`, `#define A3_DROP ${f(variant === 'near' ? def?.a3?.grazeDrop ?? 0 : 0)}`,
    // r-idle: the ear region of an authored head (see ModelDef.a3.ear): base, tip, radius
    `#define A3_EAR ${variant === 'near' && def?.a3?.ear ? 1 : 0}`, `#define A3_EAR_B vec3(${(def?.a3?.ear ?? [0, 0, 0]).slice(0, 3).map(f).join(',')})`,
    `#define A3_EAR_T vec3(${(def?.a3?.ear ?? [0, 0, 0]).slice(3, 6).map(f).join(',')})`, `#define A3_EAR_R ${f(def?.a3?.ear?.[6] ?? 0.05)}`,
    `#define SHELL ${variant === 'near' && sh ? 1 : 0}`,
    `#define SHELL_SCALE ${f(sh?.scale ?? 30)}`, `#define SHELL_ALONG ${f(sh?.along ?? 0.5)}`, `#define SHELL_SPARSE ${f(sh?.sparse ?? 0.4)}`,
    `#define SHELL_D0 ${f(sh?.d0 ?? 30)}`, `#define SHELL_D1 ${f(sh?.d1 ?? 50)}`,
    `#define SHELL_TONE vec2(${(sh?.tone ?? [0.8, 1.04]).map(f).join(',')})`,
  ];
}

function defines(p: AnimParams, far: ModelDef['far'] | undefined, geometry: ModelDef['geometry'], def?: ModelDef, variant: Variant = 'single'): string {
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
    `#define SPINE ${p.kind === 0 && p.spine ? 1 : 0}`, `#define SPINE_A ${f(p.spine?.flex ?? 0)}`, `#define SPINE_R ${f(p.spine?.twist ?? 0)}`, `#define SPINE_HEAD ${f(p.spine?.head ?? 0)}`,
    `#define SPINE_TROT ${f(SPINE_TROT)}`, `#define SPINE_PHASE ${f(SPINE_PHASE)}`, `#define SPINE_K ${f(SPINE_K)}`, `#define LNCOSH1 ${f(LNCOSH1)}`,
    `#define CURL ${f(p.curl ?? 0)}`, `#define CURL_ANG ${f(p.curlAng ?? 1.3)}`, `#define CURL_X0 ${f(p.curlX ?? 0.1)}`, `#define CURL_LEN ${f(p.curlLen ?? 1.1)}`,
    `#define LEG_CALM ${f(far?.calm ?? 0)}`, `#define WIDEN ${f(far?.widen ?? 0)}`,
    `#define FLAP_HZ ${f(p.flapHz)}`,
    ...raptorDefines(p),
    `#define MIN_PX ${f(p.minPx)}`,
    `#define FAR_NEAR ${f(far?.d0 ?? 140)}`, `#define FAR_FAR ${f(far?.d1 ?? 400)}`,
    `#define ANIM_NEAR 20.0`, `#define ANIM_FAR 110.0`,
    `#define BODY_LEN ${f(p.boostLen)}`,
    `#define FX2 ${p.hunts || p.kind === 2 || (p.kind === 0 && p.stot) ? 1 : 0}`,
    `#define BEHAV ${R8_SHADER.on && R8_SHADER.bison && p.kind === 0 && p.behave ? 1 : 0}`,
    `#define FLARE ${R8_SHADER.on && R8_SHADER.flare && p.kind === 0 && p.flare ? 1 : 0}`,
    `#define CLASP ${f(p.clasp ?? 0)}`,
    `#define STALK ${p.kind === 0 && p.stalk ? 1 : 0}`,
    `#define SWIM ${p.kind === 0 && p.swim ? 1 : 0}`, `#define SWIM_SINK ${f(p.swim?.sink ?? 0)}`, `#define SWIM_NOSE ${f(p.swim?.nose ?? 0)}`, `#define SWIM_WAKE ${f(p.swim?.wake ?? 1)}`,
    ...stotDefines(p),
    `#define MANGE ${p.hunts && p.kind === 0 ? 1 : 0}`, // canids can have mange: a patchy coat (the fragment stage mottles it)
    // r-idle: the idle layer (breath, weight shifts, looks, ears, tail) and the tail style: 0 a grazer's fly swats, 1 a canid's sway, 2 a cat's twitching tip
    `#define IDLE ${IDLE_SHADER.on && p.kind === 0 ? 1 : 0}`, `#define IDLE_STYLE ${p.stalk ? 2 : p.hunts ? 1 : 0}`,
    ...lodDefines(def, variant),
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
float tgFlagsOf() {
  float fl = floor(aLook.w + 0.001);
  return fl - 32.0 * floor(fl / 32.0);
}
float tgFadeOf() {
  float fl = tgFlagsOf();
  return 1.0 - floor(fl * 0.5) / 15.0;
}
// R7: 1 when the animal layer has put a copy of this instance in the near-LOD mesh (bit 32 of the flag word)
float tgNearCopy() {
  return floor(floor(aLook.w + 0.001) / 32.0);
}

// R3 canids: the animal layer packs three things into aFx2.w of a hunter (a quadruped with FX2): floor(w) = air + 16 * howl, each
// 0..15, and fract(w) = mange severity 0..0.99. air / 15 is how far a leap has taken it off the ground (the legs follow the body
// instead of reaching for the ground). howl 0..10 is the sit of a howl (haunches down, muzzle up) times ten, 11..15 the same sit
// with yips ((q - 10) / 5 of full strength). R8: floor(w) also carries 256 * mark (0..15), how far a hind leg is cocked to scent mark.
void tgUnpack(float w, out float air, out float howl, out float yip, out float mange, out float mark) {
  float wi = floor(w);
  float mk = floor(wi / 256.0);
  float rest = wi - 256.0 * mk;
  float hq = floor(rest / 16.0);
  float aq = rest - 16.0 * hq;
  air = aq / 15.0;
  howl = min(hq, 10.0) / 10.0;
  yip = max(hq - 10.0, 0.0) / 5.0;
  mange = fract(w);
  mark = mk / 15.0;
}
float tgMangeOf() {
#if FX2 && KIND == 0
  return aGait.y < -0.5 ? 0.0 : fract(aFx2.w);
#else
  return 0.0;
#endif
}

// R-marsh swimmer (SWIM): the stipple level of the wake vertices (1 = solid; the body is always 1) and 1 on a wake vertex (it casts no shadow)
float tgSwimFade = 1.0;
float tgIsWake = 0.0;

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
float tgRollB;  // the slope's extra roll (rad), body frame (legmath.ts slopeResponse)
float tgStrideK; // stride multiplier of the slope (shorter steps uphill)
#if SPINE
float tgSpA;    // rotary-gallop spine (legmath.ts bodyMotion spA, spR): the signed curvature of the back (+ arched) and the shoulder/hip twist
float tgSpR;
float tgSpHip;  // x of the hip a leg vertex hangs from (the curve is read there, so the leg moves as a rigid part); 1e9 for every other vertex
#endif
float tgHeadK;  // head pitch correction of the slope (rad)
float tgIdRoll; // r-idle: the weight shift of a standing animal (roll about the body axis, rad) and the sway of its haunches (yaw about the shoulders, rad)
float tgIdYaw;
// legmath.ts slopeResponse: the slope response is derived from the instance's own terrain pitch and roll (they are in the instance
// matrix), so it needs no instance attribute. The extra pitch and roll are body-frame motion (the legs' IK takes them back out of
// the foot targets, so planted feet stay planted); uphill the body leans in and the stride shortens, downhill it sits back and braces.
void tgSlope(float camD, out float dp, out float dr, out float strideK, out float head) {
  float isc0 = length(vec3(instanceMatrix[0]));
  float ip = asin(clamp(instanceMatrix[0].y / isc0, -1.0, 1.0));
  float ir = atan(-instanceMatrix[2].y, instanceMatrix[1].y);
  float fk = smoothstep(25.0, 140.0, camD);
  float up = smoothstep(0.12, 0.4, ip);
  float dn = smoothstep(0.12, 0.4, -ip);
  dp = ip * 0.35 * fk + (ip > 0.0 ? 0.18 * ip * up : -0.12 * ip * dn);
  dr = ir * 0.35 * fk;
  strideK = 1.0 - 0.3 * up - 0.1 * dn;
  head = -0.3 * (ip + dp);
}
#if BEHAV
float tgWallow;  // R8 bison: 0..1 wallowing (rolling on the ground) and the roll angle it is at (rad, about the body axis)
float tgRollA;
float tgRub;     // 0..1: rubbing against a tree: rocking along the trunk, leaning into it
float tgSpar;    // 0..1: sparring: shoving head to head, each bull in turn (tgSparPh is its phase offset 0..1)
float tgSparPh;
float tgBT;      // the animal's own clock and seed (the poses run on them)
float tgBSeed;
#endif
vec3 tgGW;
void tgBodyFwd(inout vec3 p, inout vec3 n) {
  p.y += tgYoff;
  tgRotZ(p, n, vec3(0.0, COM_Y, 0.0), tgPitchB);
  if (tgRollB != 0.0) tgRotX(p, n, vec3(0.0, COM_Y, 0.0), tgRollB);
  // r-idle: body motions, so (like the feeding haul) the leg IK takes them back out of the foot targets and the feet stay planted
  if (tgIdRoll != 0.0) tgRotX(p, n, vec3(0.0, COM_Y, 0.0), tgIdRoll);
  if (tgIdYaw != 0.0) tgRotY(p, n, vec3(0.3 * BODY_LEN, COM_Y, 0.0), tgIdYaw);
#if SPINE
  if (tgSpA != 0.0 || tgSpR != 0.0) {
    // legmath.ts bodyFwd, the spine: the back rises in the middle when arched (and drops when hollowed) and the head and tail ends dip the
    // other way, level at the shoulders and hips (so the leg IK has nothing to stretch for); the normals follow the tangent and the shoulders
    // and hips roll against each other. A leg is a rigid part: it is moved by the curve at its hip's x, with no tilt and no roll.
    bool leg = tgSpHip < 1e8;
    float hl = BODY_LEN * 0.55;
    float xr = leg ? tgSpHip : p.x;
    float xc = clamp(xr / hl, -0.8, 0.8);
    p.y += 0.1 * hl * tgSpA * (1.0 - log(cosh(2.0 * xc)) / LNCOSH1);
    if (!leg) {
      float th = -SPINE_K * tgSpA * tanh(2.0 * xc);
      float tc = cos(th), ts = sin(th);
      n = vec3(tc * n.x - ts * n.y, ts * n.x + tc * n.y, n.z);
      if (tgSpR != 0.0) tgRotX(p, n, vec3(p.x, COM_Y, 0.0), tgSpR * clamp(p.x / hl, -1.3, 1.3));
    }
  }
#endif
  if (tgFarK > 0.001) {
    // Whole-body gait cues sized as a fraction of the body length, so they stay readable at 15 to 40 px: a bound (the body
    // rises and falls once per stride in a gallop), the spine arching and stretching, a lateral snake, and the body pitching.
    float bl = BODY_LEN;
    float c = tgCyc;
    // (sized so that a wolf only 20 px long still visibly bounds: the gallop lifts the whole body about 16% of its length)
    float hop = tgGW.x * 0.03 * cos(2.0 * c) + tgGW.y * 0.08 * cos(2.0 * c) + tgGW.z * 0.16 * cos(c - 0.5);
    float xn = clamp(p.x / (bl * 0.55), -1.3, 1.3);
    float arch = (tgGW.y * 0.04 + tgGW.z * 0.08) * cos(c + 1.0) * (0.35 - xn * xn);
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
#if BEHAV
  // R8 bison. These are body motions, so (like the feeding haul) the leg IK takes them back out of the foot targets and the feet stay planted.
  if (tgRub + tgSpar + tgWallow > 0.001) {
  if (tgRub > 0.001) {
    // rubbing against a tree: the animal stands side-on to the trunk (the tree on its right), leans into it and rocks along the bark
    float rr = sin(tgBT * 2.5 + tgBSeed * 9.0);
    p.x += tgRub * 0.22 * rr;
    tgRotX(p, n, vec3(0.0, 0.3, 0.0), tgRub * (0.09 + 0.025 * sin(tgBT * 2.5 + tgBSeed * 9.0 + 1.0)));
  }
  if (tgSpar > 0.001) {
    // sparring: heads down and locked, the bulls shove in turn (the other is half a cycle behind), the forequarters dipping into the push
    float sw = sin(TG_TAU * (tgBT * 0.8 + tgSparPh));
    p.x += tgSpar * 0.3 * sw;
    tgRotZ(p, n, vec3(-0.5, COM_Y, 0.0), -tgSpar * (0.06 + 0.05 * sw));
  }
  if (tgWallow > 0.001) {
    // wallowing: lying down, the animal rocks over onto its side and back, on and off its hump, legs kicking (the leg code); the pivot is the
    // middle of the body at lying height, and the body rides up a little as it turns so the hump and the side do not sink into the ground
    tgRotX(p, n, vec3(0.0, COM_Y + tgYoff, 0.0), tgRollA);
    p.y += tgWallow * 0.12 * abs(sin(tgRollA));
  }
  }
#endif
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
  // Time-lapse (uTL, 3x to 8x and up): the bird crosses the sky ten times faster than it can glide, so its beat never lets go. A bird that held its wings
  // still for the 60 to 80% of the cycle it normally glides would hang in the picture like a kite while the land streams by below.
#if RAPTOR
  float tlBeat = 0.5 * uTL;
#else
  float tlBeat = 0.9 * uTL;
#endif
  return clamp(max(max(low, tlBeat), max(burstW * 0.95, effort)), 0.0, 1.0);
}
#endif

void tgAnimate(inout vec3 p, inout vec3 n) {
  int part = int(aPart.x + 0.5);
#if SPINE
  tgSpHip = (part >= 1 && part <= 4) ? aPivot.x : 1e9;
#endif
  float spd = aGait.y;
  bool dead = spd < -0.5;
#if SWIM
  if (aPart.w > 6.5) {
    // R-marsh: the V wake of a swimmer (vertices tagged 7 in aPart.w, authored lying along the surface behind the nose). It exists only
    // while swimming (collapsed to a point otherwise), grows with the pace, rides on the water plane and dissolves (stipple) along its length.
    float sw = dead ? 0.0 : clamp(aFx.w, 0.0, 1.0);
    tgIsWake = 1.0;
    n = vec3(0.0, 1.0, 0.0);
    if (sw < 0.01) { p = vec3(0.0); tgSwimFade = 0.0; return; }
    float k = sw * (0.4 + 0.6 * smoothstep(0.1, 0.9, spd));
    float along = clamp((SWIM_NOSE - p.x) / SWIM_WAKE, 0.0, 1.0);
    p.x = SWIM_NOSE + (p.x - SWIM_NOSE) * k;
    p.z *= 0.45 + 0.55 * k;
    p.y = SWIM_SINK + 0.004 + 0.003 * sin(uTime * 3.0 + along * 9.0 + aLook.y * 20.0);
    tgSwimFade = sw * (0.55 + 0.45 * k) * (1.0 - smoothstep(0.1, 1.0, along));
    return;
  }
#endif
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
  // R6 mule deer: how far into the stotting gait it is (the antlers, velvet and winter coat are read where they are used)
  float stotK = 0.0;
#if STOT
  stotK = dead ? 0.0 : clamp(fx2.y, 0.0, 1.0);
#endif
  float sick = dead ? 0.0 : fract(aLook.w);
  float lie = dead ? 0.0 : aGait.w;
  // R-marsh: a swimmer's weight rides in aFx.w (a beaver never pounces); swimming tucks the legs under it like lying does
  float swimW = 0.0;
#if SWIM
  swimW = dead ? 0.0 : clamp(aFx.w, 0.0, 1.0);
  lie = max(lie, swimW);
#endif
  // R5 raptors: a bird has no lie weight, so aGait.w carries how upright it sits on its perch (0..1) and aFx.w the stoop (0..1)
  float perchW = 0.0;
  float stoopW = 0.0;
#if RAPTOR
  perchW = lie;
  lie = 0.0;
  stoopW = dead ? 0.0 : clamp(aFx.w, 0.0, 1.0);
#endif
#if BEHAV
  float crouch = 0.0; // (R8: a bison's aLook.z is its snow dig weight)
#else
  float crouch = dead ? 0.0 : aLook.z;
#endif
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
#if RAPTOR || BEHAV || FLARE || SWIM
  pounce = 0.0; // (aFx.w is the stoop weight of a raptor, the rump flare of a pronghorn and the swim weight of a beaver)
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
#if STOT
  if (stotK > 0.001) {
    // (legmath.ts bodyMotion) stotting: in the stance the body sinks and pitches up from landing to take-off, in the air it rises on a
    // sine arc (the feet tuck up with it, see the foot path below) and pitches from nose up to nose down
    float us = fract(ph);
    float stB, stP;
    if (us < STOT_DUTY) {
      float sa = us / STOT_DUTY;
      stB = -STOT_SINK * sin(3.14159265 * sa);
      stP = STOT_PITCH * (2.0 * sa - 1.0);
    } else {
      float ss = (us - STOT_DUTY) / (1.0 - STOT_DUTY);
      stB = STOT_BOB * sin(3.14159265 * ss);
      stP = STOT_PITCH * cos(3.14159265 * ss);
    }
    bob = mix(bob, stB, stotK);
    pitch = mix(pitch, stP, stotK);
  }
#endif
  // gentle breathing and walk roll
  float breathe = 0.004 * sin(t * 1.9 + seed * 30.0) * COM_Y;
#if A3SKIN
  pitch -= A3_PITCH * (dead ? 0.0 : aGait.z) * (1.0 - lie); // grazing: the forebody dips (the leg IK keeps the feet down)
#endif

  // feeding at a carcass. Predators tear: the head hauls up and back slowly with the meat in its teeth, shakes it, then
  // snaps back down for the next bite, with the whole body heaving back a little. Ravens peck in quick bursts.
  float tug = dead ? 0.0 : aFx.x;
  // R6 cat stalk: the freeze before the rush rides in aFx2.y while the cat is not feeding (feeding keeps its cycle phase there)
  float frzW = 0.0;
#if STALK
  frzW = dead ? 0.0 : clamp(fx2.y, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.05, tug));
#endif
  float tugPull = 0.0, tugShake = 0.0, tugSwallow = 0.0, tugBite = 0.0, peck = 0.0, peckUp = 0.0;
  // takedown: the hold on the prey (0..1) and the head shaking it
  float holdW = 0.0, holdSh = 0.0;
  // the leap weight of a pounce (aFx2.z): the spring up at the prey, gone once the hold has taken over (the body pitch and the
  // reach of the legs follow it; pounce, the whole engagement, keeps the head driving onto the prey)
  float leapW = 0.0;
  // R3 canids (see tgUnpack): a mousing leap in the air, a howl (sitting) with its yips, mange severity
  float cnAir = 0.0, cnHowl = 0.0, cnYip = 0.0, cnMange = 0.0, cnMark = 0.0;
#if KIND == 0 && !STOT
  if (!dead) tgUnpack(fx2.w, cnAir, cnHowl, cnYip, cnMange, cnMark);
#if !BEHAV && !FLARE
  leapW = dead ? 0.0 : clamp(fx2.z, 0.0, 1.0);
  holdW = dead ? 0.0 : clamp(fx2.x, 0.0, 1.0);
  holdSh = holdW * sin(t * 21.0 + seed * 40.0);
  pitch += holdW * 0.04 * sin(t * 8.0 + seed * 5.0);
#endif
#endif
  // R8 behaviour weights of a bison (see the top of the file) and of a pronghorn's rump flare
  float wallowW = 0.0, rubW = 0.0, sparW = 0.0, digW = 0.0, bellowW = 0.0, playW = 0.0, flareW = 0.0;
#if BEHAV
  if (!dead) {
    // two floats carry seven weights in 6-bit steps (the animal layer's packBison): aLook.z = dig + 64 wallow + 4096 rub + 262144 air (0..15, the
    // legs follow the body in the air of a hop), aFx.z = bellow + 64 play + 4096 spar + 262144 (1 when this bull shoves half a cycle later)
    float pa = aLook.z, pb = aFx.z;
    if (pa + pb > 0.5) {
      float q = floor(pa / 262144.0);
      cnAir = max(cnAir, q / 15.0);
      pa -= q * 262144.0;
      q = floor(pa / 4096.0);
      rubW = q / 63.0;
      pa -= q * 4096.0;
      q = floor(pa / 64.0);
      // (the wallow weight waits for the animal to be down: the lie weight eases in first)
      wallowW = (q / 63.0) * smoothstep(0.7, 0.98, lie);
      digW = (pa - q * 64.0) / 63.0;
      q = floor(pb / 262144.0);
      tgSparPh = 0.5 * q;
      pb -= q * 262144.0;
      q = floor(pb / 4096.0);
      sparW = q / 63.0;
      pb -= q * 4096.0;
      q = floor(pb / 64.0);
      playW = q / 63.0;
      bellowW = (pb - q * 64.0) / 63.0;
    } else tgSparPh = 0.0;
  }
#endif
#if FLARE
  flareW = dead ? 0.0 : clamp(aFx.w, 0.0, 1.0); // (the pronghorn's pounce slot, which it never uses)
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

  // ---- r-idle. An animal that is not travelling is never still (round 26: "taxidermy"). Everything here is derived from the animal's own seed
  // (aLook.y) and the clock, so a herd never moves in step, and from the weights the shader already reads (lie, head-down, tug), so it adds no
  // attribute. Amplitudes are small; what runs depends on the state: a bedded animal breathes, flicks its ears and lifts its head now and then;
  // a grazer shifts its weight and swings its head between bites; an alert one (head up, watching) holds still but for breath and ears; one
  // standing about looks around, sniffs the ground and rests a foot. A feeding predator tugs and sways continuously.
  float idW = 0.0;        // 0..1: how much the layer runs (0 travelling, dead, swimming, or in a time-lapse)
  float idAlert = 0.0;    // 0..1: head up, watching something (the animal layer sends a head-down weight below 0)
  float idBr = 0.0;       // breath, about -1..1 (the chest and belly swell is applied to the rest pose, below)
  float idLook = 0.0;     // head yaw of a look about (rad)
  float idSniff = 0.0;    // 0..1: a sniff at the ground
  float idLiftHead = 0.0; // 0..1: a bedded animal lifts its head
  float idUnl = 0.0;      // 0..1: one leg is unloaded (rested on its toe)
  float idUnlPart = 0.0;  // which leg (part id 1..4)
  float idRl = 0.0, idYw = 0.0, idPt = 0.0; // body: weight shift roll, haunch sway yaw, pitch
  float idShuf = 0.0;     // 0..1: a feeding predator shuffles its forefeet
#if KIND == 0 && IDLE
  if (!dead) {
    float mvI = clamp(wWalk + wTrot + wGal, 0.0, 1.0);
    idW = (1.0 - mvI) * (1.0 - clamp(uTL * 2.0, 0.0, 1.0)) * (1.0 - stotK) * (1.0 - swimW);
    float hA = fract(seed * 13.17), hB = fract(seed * 7.91 + 0.31), hC = fract(seed * 29.3 + 0.7);
    idAlert = smoothstep(0.03, 0.25, -aGait.z) * (1.0 - lie);
    // breath: 3 to 5 s a cycle, a little slower out than in
    float brA = TG_TAU * t / (3.0 + 2.0 * hA) + seed * 40.0;
    idBr = sin(brA) + 0.25 * sin(2.0 * brA + 0.8);
    float standW = idW * (1.0 - lie);
    // weight shifts: the body rolls slowly from side to side and the haunches sway, a different beat for each animal
    idRl = standW * (1.0 - 0.7 * idAlert) * 0.02 * sin(t * (0.35 + 0.3 * hB) + seed * 23.0);
    idYw = standW * (1.0 - 0.7 * idAlert) * 0.022 * sin(t * (0.27 + 0.2 * hA) + seed * 11.0);
    idPt = standW * 0.01 * sin(t * (0.31 + 0.2 * hC) + seed * 5.0);
    // a leg is unloaded now and then (every 6 to 10 s, about a second and a half): the body leans off it and the foot rests on its toe
    float uT = t / (6.0 + 4.0 * hB) + hC;
    float uU = fract(uT);
    float uB = smoothstep(0.0, 0.05, uU) * (1.0 - smoothstep(0.18, 0.26, uU));
    float uPick = fract(sin(floor(uT) * 12.9898 + seed * 78.233) * 43758.5453);
    idUnlPart = uPick < 0.3 ? (uPick < 0.15 ? 1.0 : 2.0) : (uPick < 0.65 ? 3.0 : 4.0);
    idUnl = uB * standW * (1.0 - idAlert);
    idRl -= idUnl * (mod(idUnlPart, 2.0) > 0.5 ? 1.0 : -1.0) * 0.018;
    // head: a look to one side, back through the middle to the other, a sniff at the ground, then rest (9 to 16 s a round)
    float lkU = fract(t / (9.0 + 7.0 * hB) + hC);
    float sA = smoothstep(0.02, 0.1, lkU) * (1.0 - smoothstep(0.24, 0.32, lkU));
    float sB = smoothstep(0.36, 0.44, lkU) * (1.0 - smoothstep(0.54, 0.62, lkU));
    idLook = (sA * (0.55 + 0.45 * hA) - sB * (0.55 + 0.45 * hC)) * (0.35 + 0.5 * LOOK_YAW);
    idSniff = smoothstep(0.68, 0.74, lkU) * (1.0 - smoothstep(0.86, 0.92, lkU));
    // a bedded animal lifts its head for 2 to 4 s every 18 to 34 s
    idLiftHead = lie * idW * smoothstep(0.0, 0.025, fract(t / (18.0 + 16.0 * hA) + hB)) * (1.0 - smoothstep(0.1, 0.15, fract(t / (18.0 + 16.0 * hA) + hB)));
    // feeding: the body sways and twists with every tug, the forefeet shuffle
    idShuf = tug;
    idRl += tug * 0.025 * sin(t * 2.3 + seed * 5.0);
    idYw += tug * 0.035 * sin(t * 1.7 + seed * 9.0);
    idPt += tug * 0.015 * sin(t * 3.1 + seed * 13.0);
  }
#endif

#if KIND == 0
  // the body's motion state, read by tgBodyFwd (the legs aim through it, then every vertex is moved by it). aFx.y of a living
  // quadruped is the body-height offset the animal layer works out from the ground under the stance feet (m, model units).
  // (legmath.ts bodyMotion) the body also sinks a little while it moves, so the knees stay bent (flex)
  float flex = LEGL * dot(gN, FLEX.xyz) * gAmt * moveK;
  tgYoff = bob - flex + breathe - lie * LIE_DROP - crouchBody * CROUCH_DROP - sick * 0.035 * COM_Y + (dead ? 0.0 : aFx.y) - holdW * LEGL * (0.3 + 0.05 * CLASP); // a sick animal sags a little, a predator holding prey sits back on its haunches
#if STALK
  // the freeze before the rush: the belly goes right down and the shoulders sink forward, the haunches high and gathered
  tgYoff -= frzW * crouchBody * CROUCH_DROP * 0.14;
  pitch -= frzW * crouchBody * 0.1;
#endif
  {
    float sDp = 0.0, sDr = 0.0, sK = 1.0, sHd = 0.0;
    if (!dead) tgSlope(camD, sDp, sDr, sK, sHd);
    tgPitchB = pitch + idPt + sDp;
    tgRollB = sDr;
    tgIdRoll = idRl;
    tgIdYaw = idYw;
    tgStrideK = sK;
    tgHeadK = sHd;
  }
  tgFarK = dead ? 0.0 : farK;
  tgCyc = cyc;
  tgPounce = leapW;
  tgHold = holdW;
  tgFeedB = tugPull;
  tgHowl = cnHowl;
#if BEHAV
  tgWallow = wallowW;
  // the roll: rocking between one side and the other over the hump (a bias to the animal's own side), each at its own beat
  tgRollA = 0.0;
  if (wallowW > 0.001) tgRollA = wallowW * ((fract(seed * 5.3) > 0.5 ? 0.35 : -0.35) + 1.1 * sin(t * 1.7 + seed * 20.0));
  tgRub = rubW;
  tgSpar = sparW;
  tgBT = t;
  tgBSeed = seed;
#endif
  tgGW = vec3(wWalk, wTrot, wGal) * (1.0 - stotK);
#if SPINE
  {
    // (legmath.ts bodyMotion) flexion at the gathered phase, the hips and shoulders twisting half a beat later
    float wSp = tgGW.y * SPINE_TROT + tgGW.z;
    tgSpA = SPINE_A * A3_SPINE * wSp * cos(cyc + SPINE_PHASE);
    tgSpR = SPINE_R * A3_SPINE * wSp * sin(cyc + SPINE_PHASE - 0.04);
  }
#endif
#endif
#if FLARE
  if (flareW > 0.001 && (part == 0 || part == 6)) {
    // R8 rump flare: the hairs of the patch stand up, so it swells outward over the haunches (and the little tail patch with it)
    p += n * (0.05 * flareW * smoothstep(-0.02, -0.3, p.x));
  }
#endif
#if KIND == 0 && IDLE
  if (idW > 0.001) {
    // r-idle breath: the chest and belly swell (a soft window round the barrel just behind the shoulders, strongest on the underside and
    // deeper in a bedded animal). Applied to the rest pose of every part before the parts move, so the legs, neck and an authored mesh's
    // continuous skin all carry the same swell and nothing tears.
    float bx = (p.x - 0.1 * BODY_LEN) / (0.27 * BODY_LEN);
    float bw = exp(-bx * bx) * smoothstep(0.3 * COM_Y, 0.55 * COM_Y, p.y);
    p += n * (idBr * BODY_LEN * 0.010 * (1.0 + 0.5 * lie) * idW * bw * (0.75 - 0.35 * n.y));
  }
#endif
#if A3SKIN
  // the pose before any part moves it: an authored mesh is one continuous skin, so a vertex near a joint (aPart.w, 0 .. 1) follows its bone
  // only as far as its weight says and the rest of the way the body, like a skinned mesh (the procedural tubes hide their ends inside the body)
  vec3 a3p = p;
  vec3 a3n = n;
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
#if STOT
      // R6 stotting (legmath.ts gaitMix): the foot path of the bounds, blended in by the weight. The four feet stand and leave together.
      gBeta = mix(gBeta, STOT_DUTY, stotK);
      gStride = mix(gStride, STOT_STRIDE, stotK);
      gLift = mix(gLift, STOT_LIFT, stotK);
      oB = mix(oB, STOT_OFF, stotK);
#endif
      gStride *= tgStrideK; // legmath.ts gaitMix: shorter steps uphill
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
      // legmath.ts IK_PASSES = 3: two more fixed-point passes (s <- s - (bodyFwd(s) - target)) so the big distance cues of a gallop
      // (bound, spine arch, pitch) come out of the foot target exactly and a planted foot stays on the ground
      vec2 sTg = 2.0 * tg.xy - tq.xy;
      if (tgFarK > 0.001 || tgPitchB != 0.0 || tgIdRoll != 0.0 || tgIdYaw != 0.0) {
        for (int ip2 = 0; ip2 < 2; ip2++) {
          vec3 tq2 = vec3(sTg, zf);
          vec3 tn2 = vec3(0.0, 1.0, 0.0);
          tgBodyFwd(tq2, tn2);
          sTg -= tq2.xy - tg.xy;
        }
      }
      vec3 sol = tgSolveLeg(hipP, kneeP, footP, front ? -1.0 : 1.0, sTg);
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
    // R8 scent marking: one hind leg (the side is the animal's own) is cocked out to the side with the hock folded
    bool markLeg = cnMark > 0.001 && !front && ((part == 3) == (fract(seed * 5.9) > 0.5));
    if (markLeg) {
      hip = mix(hip, 0.1, cnMark);
      knee = mix(knee, 0.95 * HOCK_K, cnMark);
      stretch = mix(stretch, 1.0, cnMark);
    }
#endif
    float lieHip = front ? LIE_HIP_F : LIE_HIP_H;
    float lieKnee = front ? LIE_KNEE_F : LIE_KNEE_H;
    hip = mix(hip, lieHip, lie);
    knee = mix(knee, lieKnee, lie);
#if KIND == 0 && IDLE
    if (idUnl > 0.001 && float(part) == idUnlPart) {
      // r-idle: the unloaded leg rests on its toe (the hock or the knee gives a little and the foot comes back and up)
      hip += idUnl * (front ? 0.05 : -0.07);
      knee += idUnl * (front ? -0.3 : 0.28 * HOCK_K);
    }
    if (front && idShuf > 0.001) {
      // r-idle: a feeding predator shuffles its forefeet as it hauls
      float shf = sin(t * 1.9 + float(part) * 2.4 + seed * 7.0);
      hip += idShuf * 0.07 * shf;
      knee -= idShuf * 0.12 * max(shf, 0.0);
    }
#endif
#if BEHAV
    if (wallowW + digW > 0.001) {
    if (wallowW > 0.001) {
      // wallowing: the legs come out as the animal goes over onto its side (the roll angle past about 0.3 rad) and kick in the air, each at its own beat
      float ext = smoothstep(0.3, 0.85, abs(tgRollA)) * wallowW;
      float kk = sin(t * 5.3 + float(part) * 1.9 + seed * 8.0);
      float kh = front ? 0.35 + 0.5 * kk : -0.1 + 0.55 * kk;
      float kn = front ? -0.25 - 0.35 * (0.5 + 0.5 * kk) : (0.4 + 0.5 * (0.5 + 0.5 * kk)) * HOCK_K;
      hip = mix(hip, kh, ext);
      knee = mix(knee, kn, ext);
    }
    if (digW > 0.001 && front) {
      // pawing at the snow: one forefoot (they alternate) scrapes back now and then
      float pw = smoothstep(0.55, 0.9, sin(t * 1.15 + seed * 11.0 + float(part) * 3.14159265));
      hip += digW * pw * (0.25 + 0.3 * sin(t * 7.0 + float(part)));
      knee -= digW * pw * 0.85;
    }
    }
#endif
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
#if A3SKIN
    if (lie > 0.01 && !dead) {
      // lying: the folded lower leg is drawn in toward the knee, so an authored (continuous, un-hidden) leg tucks under the body instead of poking out
      vec3 a3k = aPivot2;
      vec3 a3d = vec3(0.0, 1.0, 0.0);
      tgRotZ(a3k, a3d, aPivot, hip);
      p = mix(p, a3k, 0.5 * lie * aPart.y);
    }
#endif
#if KIND == 0
    // holding the prey: the hind legs are planted wide apart for the haul (left leg out to the left, right to the right)
    if (!front && holdW > 0.001) tgRotX(p, n, aPivot, (part == 3 ? 1.0 : -1.0) * holdW * 0.3);
    if (markLeg) tgRotX(p, n, aPivot, (part == 3 ? 1.0 : -1.0) * cnMark * 1.05);
    // a straight leg that still falls short (steep or uneven ground) lengthens a little, at most IK_CAP
    p = aPivot + (p - aPivot) * stretch;
#endif
#if A3SKIN && KIND == 0
    if (!dead && lie < 0.99) {
      // r-feet: an ankle. The lower leg of the authored mesh swings with the leg (about 0.5 rad each way through a stride), and a rigid hoof or paw
      // on the end of it rocks, rolls its toe up and sinks its heel, so the drawn sole slides and floats while the rig's foot point is planted. The foot
      // (the region within a hand's breadth of the sole, fading out up the pastern) is turned back about the rig's foot point by the leg's net swing
      // plus the body's pitch, so the sole stays level (flat on the ground in stance, held level through the swing). The foot point itself is
      // where the leg solve put it, so nothing the stance lock does changes.
      float a3ank = (1.0 - lie) * (1.0 - cnAir) * (1.0 - cnMark) * (1.0 - clamp(holdW * 4.0, 0.0, 1.0));
      float a3fw = 1.0 - smoothstep(A3_FOOT_Y0 * LEGL, A3_FOOT_Y1 * LEGL, a3p.y - (front ? FRONT_FOOT.y : HIND_FOOT.y));
      if (a3ank * a3fw > 0.001) {
        vec3 a3f = vec3(front ? FRONT_FOOT : HIND_FOOT, aPivot.z);
        vec3 a3fd = vec3(0.0, 1.0, 0.0);
        tgRotZ(a3f, a3fd, aPivot2, knee);
        tgRotZ(a3f, a3fd, aPivot, hip);
        a3f = aPivot + (a3f - aPivot) * stretch;
        tgRotZ(p, n, a3f, -(hip + knee + tgPitchB) * A3_ANKLE * a3ank * a3fw);
      }
    }
#endif
  } else if (part == 5) {
    float graze = dead ? 0.0 : aGait.z;
    float preen = 0.0;
#if RAPTOR
    preen = dead ? 0.0 : clamp(fx2.w, 0.0, 1.0) * perchW; // (R8: a perched raptor's preen weight rides in the flutter slot of the second effects attribute)
#endif
    // aPart.y of a head vertex is 1 minus its weight on the head's rotation: a whole head part has 0 (full weight), the neck of a
    // continuous near-LOD loft ramps from 0 (still the body) to full, so the neck bends without a seam
    float hw = 1.0 - aPart.y;
#if STOT
    if (aPart.w > 0.5 && aPart.w < 3.5) {
      // R6 antlers (aPart.w: 1 main beam, 2 fork, 3 tine; aPivot2 = where the branch starts). They grow about the pedicle by the growth
      // weight (aFx2.x, 0 = none: a doe, a fawn, or a buck that has shed), the forks come out from ANT_FORK, the second tines from ANT_TINE.
      // (done before the head turns, so they ride on the head)
      float antK = clamp(fx2.x, 0.0, 1.0);
      float lvl = floor(aPart.w + 0.5);
      vec3 ab = vec3(ANT_BASE.x, ANT_BASE.y, ANT_BASE.z * (aPivot2.z < 0.0 ? -1.0 : 1.0));
      p += n * 0.004 * clamp(fx2.z, 0.0, 1.0); // velvet swells the beams
      float lv = 1.0;
      if (lvl > 1.5) {
        lv = lvl < 2.5 ? smoothstep(ANT_FORK - 0.18, ANT_FORK + 0.18, antK) : smoothstep(ANT_TINE - 0.18, ANT_TINE + 0.18, antK);
        p = aPivot2 + (p - aPivot2) * lv;
      }
      float as = smoothstep(0.0, 0.05, antK) * mix(0.3, 1.0, antK);
      p = ab + (p - ab) * as;
      // young antlers are short but stout (velvet knobs a couple of centimetres across), not hair-thin: a growing antler is inflated back to a
      // minimum girth; the branches that have not come out yet stay hidden
      p += n * 0.011 * smoothstep(0.0, 0.05, antK) * (1.0 - as) * lv;
    }
#endif
#if KIND == 0 && IDLE
    {
      // r-idle ears. A procedural model tags its ear vertices 4 in aPart.w and pivots them about aPivot2, the base of the ear; an authored head (a3) has
      // no tags, so the ear is the region of the head round the ear's axis (ModelDef.a3.ear) and it is moved by its weight in that region.
      // Each ear has its own schedule: it swivels slowly the whole time (listening), flicks in a short quick burst every 3.5 to 8.5 s, and a watching
      // animal keeps them forward and turns them to the sound; a bedded one flicks less. (Done before the head turns, so they ride on the head.)
      float earW = 0.0;
      vec3 earB = aPivot2;
      float eSide = aPivot2.z >= 0.0 ? 1.0 : -1.0;
      if (aPart.w > 3.5 && aPart.w < 4.5) earW = 1.0;
#if A3SKIN && A3_EAR
      if (aPart.w < 0.5) {
        eSide = p.z >= 0.0 ? 1.0 : -1.0;
        earB = vec3(A3_EAR_B.x, A3_EAR_B.y, A3_EAR_B.z * eSide);
        vec3 eAx = vec3(A3_EAR_T.x - A3_EAR_B.x, A3_EAR_T.y - A3_EAR_B.y, (A3_EAR_T.z - A3_EAR_B.z) * eSide);
        float eS = dot(p - earB, eAx) / dot(eAx, eAx);
        float eD = length(p - earB - eAx * clamp(eS, 0.0, 1.0));
        earW = (1.0 - smoothstep(0.5 * A3_EAR_R, A3_EAR_R, eD)) * smoothstep(-0.1, 0.45, eS);
      }
#endif
      if (earW > 0.001 && !dead) {
        float eH = fract(seed * 5.7 + (eSide > 0.0 ? 0.0 : 0.37));
        float eP = 3.5 + 5.0 * eH;
        float eU = fract(t / eP + fract(seed * 11.3 + (eSide > 0.0 ? 0.0 : 0.53)));
        float eB = smoothstep(0.0, 0.015, eU) * (1.0 - smoothstep(0.06, 0.1, eU)) * (1.0 - 0.6 * lie);
        float eFl = eB * sin(eU * eP * 40.0);
        float eSw = sin(t * (0.5 + 0.4 * eH) + seed * 17.0 + eSide * 1.7);
        float eSw2 = sin(t * 0.7 + seed * 5.0 - eSide * 0.9);
        float eCup = idAlert * 0.12 * sin(t * 1.1 + seed * 3.0 + eSide);
        vec3 eq = p;
        vec3 en = n;
        // outward tilt (+z ear: positive), fold back, swivel
        tgRotX(eq, en, earB, eSide * (0.55 * eFl + 0.16 * eSw + 0.1 * idAlert + eCup));
        tgRotZ(eq, en, earB, 0.3 * eB + 0.1 * eSw2 * (1.0 - 0.5 * idAlert));
        tgRotY(eq, en, earB, eSide * (0.1 * eSw2 + 0.12 * idAlert));
        p = mix(p, eq, earW);
        n = normalize(mix(n, en, earW));
      }
    }
#endif
#if KIND == 0
    if (cnMange > 0.01) {
      // mange: the ruff round the neck goes thin (inset along the normal where the neck meets the shoulders)
      float rf = 1.0 - smoothstep(0.28, 0.42, p.x / BODY_LEN);
      p -= n * BODY_LEN * 0.03 * cnMange * rf * hw;
    }
#endif
#if KIND == 2
    graze *= aLook.z; // birds: head pecks only while perched (fold = 1)
#endif
    // a head lift to look about: every 8 to 14 s (its own period and phase), about 2 s long
    float lper = 0.45 + 0.3 * fract(seed * 4.3);
    float raise = smoothstep(0.72, 0.93, sin(t * lper + seed * 40.0)) * (1.0 - 0.8 * tug); // a feeding animal keeps its head down
    raise *= 1.0 - clamp(wTrot + wGal, 0.0, 1.0); // (a stampede keeps its head low: the weight above is set by the animal layer)
    raise *= 1.0 - clamp(digW + sparW + rubW + bellowW, 0.0, 1.0); // (R8: busy with something: no look-about)
    float dn = graze * (1.0 - 0.85 * raise);
    // standing still: between bites the head comes up and goes down again (a slow cycle of 3 to 6 s), clearly enough that a
    // grazing animal reads as alive from 40 to 120 m (stronger with distance, where the head is a few pixels)
    float idleK = (1.0 - wWalk - wTrot - wGal) * (1.0 - lie);
    float bite = 0.5 + 0.5 * sin(t * (1.0 + 0.9 * fract(seed * 3.1)) + seed * 23.0);
    float biteUp = idleK * graze * (1.0 - raise) * smoothstep(0.55, 1.0, bite) * (0.4 + 0.35 * farK);
    float nod = (wWalk + wTrot) * NOD_W * sin(2.0 * cyc + 1.0) + wGal * NOD_G * sin(cyc + 2.0);
    float chew = dn * 0.05 * sin(t * 7.0 + seed * 20.0);
    float yaw = LOOK_YAW * sin(t * 0.45 + seed * 13.0) * (1.0 - dn) * (1.0 - wGal) * (1.0 - lie * 0.5);
    float ang = -HEAD_DN * A3_DN * dn + nod + chew - 0.45 * crouchBody - 0.5 * sick * (1.0 - 0.5 * dn);
    ang += tugPull * 0.75 + tugSwallow * 1.5 - tugBite * 0.3 - peck * 1.0 + peckUp + biteUp;
    yaw += tugShake * 0.55;
#if KIND == 0 && IDLE
    // r-idle: a feeding head never stops between the phases of the cycle: it worries the meat (quick small pulls and turns)
    ang += tug * 0.045 * sin(t * 8.5 + seed * 11.0);
    yaw += tug * (0.1 * sin(t * 5.3 + seed * 3.0) + 0.06 * sin(t * 11.0 + seed * 7.0));
#endif
    // holding the prey by the throat or flank: the head shakes it hard from side to side
    // (a cougar's head goes down onto the neck instead and shakes less)
    ang += holdW * ((0.5 + 0.2 * sin(t * 13.0 + seed * 5.0)) * (1.0 - CLASP) - CLASP * (0.55 - 0.08 * sin(t * 11.0 + seed * 5.0)));
    yaw += holdSh * (0.6 - 0.35 * CLASP);
    // after lifting the head it turns to look, then back
    yaw += idleK * raise * (fract(seed * 6.1) - 0.5) * 1.0 * sin(t * 0.9 + seed * 7.0);
#if KIND == 0 && IDLE
    {
      // r-idle head. Standing about (head not down grazing, not watching something): a look to either side and a sniff at the ground, on the
      // animal's own schedule. Grazing: the head swings slowly as it works along. Watching: it holds still (ears and breath only). Bedded: it lifts
      // now and then and looks about; the rest of the time it drifts a little with the breath.
      float dnI = clamp(dn, 0.0, 1.0);
      float hwI = idW * (1.0 - lie) * (1.0 - idAlert) * (1.0 - dnI);
      yaw *= 1.0 - 0.7 * idAlert;
      yaw += hwI * idLook;
      ang += hwI * (0.08 * abs(idLook) - idSniff * (0.3 + 0.3 * float(IDLE_STYLE > 0)) * (1.0 + 0.1 * sin(t * 13.0 + seed * 9.0)));
      yaw += idW * (1.0 - lie) * (1.0 - idAlert) * dnI * 0.26 * sin(t * 0.55 + seed * 19.0);
      ang += idW * lie * 0.02 * sin(TG_TAU * t / (3.0 + 2.0 * fract(seed * 13.17)) + seed * 40.0);
      yaw += idLiftHead * 0.6 * sin(t * 1.3 + seed * 5.0);
    }
#endif
    // from the drone view the head pumps harder so a trot or a gallop reads as a body moving, not sliding
#if SPINE
    // the neck takes the tilt of the spine at its root: the head cancels most of it, so it stays near level while the body flexes under it
    ang += SPINE_HEAD * SPINE_K * tgSpA * tanh(2.0 * clamp(aPivot.x / (BODY_LEN * 0.55), -0.8, 0.8)) * (1.0 - lie);
#endif
    float pump = farK * (wWalk * 0.1 * sin(2.0 * cyc + 1.0) + wTrot * 0.16 * sin(2.0 * cyc + 1.0) + wGal * 0.32 * sin(cyc + 2.0));
    ang += pump;
#if KIND == 0
    ang += tgHeadK; // legmath.ts slopeResponse: on a slope the head cancels part of the body's pitch (nearer level than the body)
#endif
#if RAPTOR
    ang -= perchW * PERCH_PITCH * 0.8; // the body sits upright on its perch: the head tips down to look ahead
    ang += stoopW * 0.55;              // in a stoop the head is held up out of the dive, eyes on the prey
    // R8 preening: the head dips and nibbles at the feathers (it is turned back over the shoulder by the roll at the end of the head code)
    ang -= preen * (0.55 + 0.22 * sin(t * 11.0 + seed * 5.0));
#endif
#if KIND == 2
    if (fx2.y >= 0.0) ang += 0.22 * sin(TG_TAU * 2.0 * fx2.y); // a walking raven's head pumps with each step
#endif
    ang -= pounce * 0.55; // the head drives forward and down onto the prey
#if BEHAV
    if (digW + sparW + rubW + bellowW + playW > 0.001) {
    if (digW > 0.001) {
      // cratering through snow: the head is down and swung from side to side like a plough, dipping into the snow at the end of each sweep
      yaw += digW * 0.8 * sin(t * 3.6 + seed * 7.0);
      ang += digW * (-0.12 + 0.12 * sin(t * 7.2 + seed * 7.0 + 1.0));
    }
    if (sparW > 0.001) {
      // sparring: the head goes low and the bulls push foreheads together, each twisting a little against the other
      ang -= sparW * 0.2;
      yaw += sparW * 0.14 * sin(t * 9.0 + seed * 3.0);
    }
    if (rubW > 0.001) {
      // rubbing: the head drops and turns in against the trunk (it stands with the tree on its right, so the nose goes right)
      ang -= rubW * 0.25;
      yaw -= rubW * (0.5 + 0.1 * sin(t * 2.5 + seed * 9.0));
    }
    if (bellowW > 0.001) {
      // the bellow: the muzzle goes up and the neck stretches out, a tremor in it
      ang += bellowW * (0.4 + 0.07 * sin(t * 1.7 + seed * 5.0)) + bellowW * 0.025 * sin(t * 19.0 + seed * 3.0);
      p.x += bellowW * 0.1 * hw;
      yaw *= 1.0 - 0.8 * bellowW;
    }
    if (playW > 0.001) {
      // calf play: the head tosses and swings
      ang += playW * 0.2 * sin(t * 6.5 + seed * 5.0);
      yaw += playW * 0.35 * sin(t * 4.1 + seed * 3.0);
    }
    }
#endif
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
    ang += idLiftHead * 0.4; // (r-idle: a bedded animal lifts its head)
#if SWIM
    ang += swimW * (0.2 + 0.03 * sin(t * 1.3 + seed * 9.0)); // swimming: the nose comes up out of the water
#endif
#if KIND == 0
    if (CURL > 0.0) {
      // curled rest: the head turns back toward the tail side and drops onto the paws
      float cside = fract(seed * 3.7) > 0.5 ? 1.0 : -1.0;
      float ck = lie * CURL * (dead ? 0.0 : 1.0) * (1.0 - idLiftHead); // (r-idle: lifting the head uncurls it)
      ang = mix(ang, -0.5 - 0.15 * sin(t * 0.4 + seed * 9.0), ck);
      yaw = mix(yaw, -cside * 0.95 + idW * 0.06 * sin(t * 0.33 + seed * 9.0), ck);
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
    tgRotY(p, n, aPivot, yaw * hw);
    tgRotZ(p, n, aPivot, ang * hw);
#if A3SKIN
    p.y -= A3_DROP * dn * hw;
#endif
#if RAPTOR
    // (the bird sits upright, so its body axis is the vertical: a roll about it swings the beak round over the shoulder)
    if (preen > 0.001) tgRotX(p, n, aPivot, (fract(seed * 4.7) > 0.5 ? 1.0 : -1.0) * preen * 2.2 * hw);
#endif
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
#if KIND == 0 && IDLE
    if (idW > 0.001) {
      // r-idle tail
#if IDLE_STYLE == 0
      // a grazer swats at flies: a burst of quick side to side with a lift, every 5 to 9 s, about a second long
      float swU = fract(t / (5.0 + 4.0 * fract(seed * 9.7)) + fract(seed * 3.9));
      float swB = smoothstep(0.0, 0.03, swU) * (1.0 - smoothstep(0.12, 0.17, swU));
      sway += idW * swB * 0.6 * sin(t * 15.0 + seed * 5.0);
      lift += idW * swB * 0.25;
#elif IDLE_STYLE == 1
      // a canid's tail sways slowly and rises and falls with its mood
      sway += idW * (0.1 * sin(t * 1.3 + seed * 8.0) + 0.04 * sin(t * 3.1 + seed * 3.0)) * (1.0 - 0.5 * lie);
      lift += idW * 0.05 * sin(t * 0.8 + seed * 6.0);
#else
      // a cat's tail drifts in a lazy curve (the tip twitches below)
      sway += idW * 0.12 * sin(t * 0.9 + seed * 8.0);
      lift += idW * 0.06 * sin(t * 0.6 + seed * 4.0);
#endif
    }
#endif
#if KIND == 0
    lift -= cnHowl * 1.05; // sitting: the body pitches up, so the tail comes up to lie along the ground behind it
#if BEHAV
    lift -= bellowW * 1.15 + playW * 1.15; // a bellowing bull and a playing calf carry the tail up
    if (playW > 0.001) sway += playW * 0.25 * sin(t * 6.0 + seed * 3.0);
#endif
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
#if STALK
    {
      // a stalking cat lowers the tail close to the ground, swaying slowly, and the tip twitches (the more so in the freeze)
      lift += crouchBody * 0.42;
      sway += crouchBody * 0.18 * sin(t * 1.7 + seed * 13.0);
      float tipK = smoothstep(0.35, 0.9, (aPivot.x - p.x) / (0.85 * BODY_LEN / 1.8));
      float twi = crouchBody * (0.25 + 0.55 * frzW) * sin(t * (4.2 + 5.0 * frzW) + seed * 7.0);
#if IDLE
      // r-idle: at rest the tip curls slowly and twitches in a short burst every 17 s or so
      twi += idW * (0.14 * sin(t * 1.1 + seed * 7.0) + 0.5 * smoothstep(0.82, 0.96, sin(t * 0.37 + seed * 21.0)) * sin(t * 9.0 + seed * 3.0));
#endif
      tgRotY(p, n, vec3(aPivot.x - 0.3, aPivot.y, 0.0), twi * tipK);
    }
#endif
#if SWIM
    // swimming: the paddle lies flat at the surface behind the animal and only trails a little side to side
    lift = mix(lift, -0.2, swimW);
    sway *= 1.0 - 0.6 * swimW;
    sway += swimW * 0.12 * sin(t * 2.3 + seed * 5.0);
#endif
    tgRotZ(p, n, aPivot, lift);
    tgRotY(p, n, aPivot, sway);
#if SWIM
    p.y += swimW * 0.075;
#endif
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

#if A3SKIN
  if (part >= 1 && part != 5 && aPart.w > 0.001) {
    p = mix(p, a3p, aPart.w);
    n = normalize(mix(n, a3n, aPart.w));
  }
#endif
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

#if STALK
  if (crouchBody > 0.001 && !dead && (part == 0 || part == 5 || part == 6)) {
    // R6 stalk: the shoulder blades ride up above the dropped back line (the forelegs are folded, elbows high), the back dips between them
    // and the hips, and in the freeze the haunches gather and wiggle from side to side
    float sx = (p.x - 0.34 * BODY_LEN / 1.8) / (0.17 * BODY_LEN / 1.8);
    float dx = (p.x + 0.08 * BODY_LEN / 1.8) / (0.26 * BODY_LEN / 1.8);
    p.y += crouchBody * COM_Y * (0.1 * exp(-sx * sx) - 0.03 * exp(-dx * dx));
    if (frzW > 0.001) {
      float rear = smoothstep(0.1, -0.45, p.x);
      tgRotY(p, n, vec3(0.1, 0.0, 0.0), frzW * rear * 0.075 * sin(t * 12.0 + seed * 9.0));
      p.y += frzW * rear * COM_Y * 0.07;
    }
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
#if STOT
uniform vec3 uWinterPale;
uniform vec3 uWinterDark;
uniform vec3 uVelvet;
#endif
varying vec3 vTgColor;
varying float vTgSel;
varying float vTgFar;
varying float vTgMid;
varying float vTgHunt;
varying float vTgUp;
varying float vTgFade;
#if MANGE
varying float vTgMg;
#endif
#if MANGE || FUR
varying vec3 vTgPos;
#endif
#if FUR
attribute vec3 aShade;
varying float vTgSeed;
varying float vTgCamD;
varying float vTgAO;
varying float vTgNy;
varying vec3 vTgTan;
#if SHELL
varying vec2 vTgShell;
#endif
#endif
#if NEARLOD || FARLOD
varying float vTgLod;
// 0 = this instance is drawn by the near-LOD mesh, 1 = by the far one, between = the dithered cross-fade
float tgLodOf() {
  float k = smoothstep(LOD0, LOD1, distance(uCamPos, vec3(instanceMatrix[3])));
#if FARLOD
  return tgNearCopy() > 0.5 ? k : 1.0; // an instance with no near copy is the far mesh's alone
#else
  return k;
#endif
}
#endif
uniform float uLegTone;

void tgShade(vec3 on) {
  bool dead = aGait.y < -0.5;
  vec3 coat = mix(uCoatPale, uCoatDark, aLook.x);
#if STOT
  // R6 the coat greys toward the winter coat (aFx2.w, from the season)
  coat = mix(coat, mix(uWinterPale, uWinterDark, aLook.x), clamp(aFx2.w, 0.0, 1.0));
#endif
  float c = aPart.z;
  vec3 col = aColor * ((1.0 - c) + c * coat);
#if STOT
  if (aPart.w > 0.5 && aPart.w < 3.5 && int(aPart.x + 0.5) == 5) {
    // antlers: hard bone-brown (the paint) or dark velvet (aFx2.z)
    col = mix(aColor, uVelvet * (0.7 + 0.6 * aColor.g * 3.0), clamp(aFx2.z, 0.0, 1.0));
  }
#endif
  float v = 0.9 + 0.2 * fract(aLook.y * 7.31);
  col *= mix(1.0, v, c);
#if FLARE
  {
    // R8 rump flare: the white patch spreads forward over the haunches and brightens (about 1.4 times the size and the value)
    float flr = dead ? 0.0 : clamp(aFx.w, 0.0, 1.0);
    int fpt = int(aPart.x + 0.5);
    if (flr > 0.001 && (fpt == 0 || fpt == 6)) {
      float ext = smoothstep(-0.02, -0.2, position.x);
      col = mix(col, vec3(0.64, 0.62, 0.58) * 1.45, flr * ext);
    }
  }
#endif
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
#if FUR
  // per-animal hue jitter (a warmer or cooler coat), on top of the brightness jitter above
  float tgJ = (fract(aLook.y * 13.7) - 0.5) * FUR_INDIV * c;
  col *= vec3(1.0 + tgJ, 1.0, 1.0 - tgJ);
#endif
  vTgColor = col;
  float tgFl = tgFlagsOf();
  vTgSel = tgFl - 2.0 * floor(tgFl * 0.5);
  vTgFade = dead ? 1.0 : tgFadeOf() * tgSwimFade;
  // distance readability: 0 close up, 1 from the wide view (see ModelDef.far)
  vTgFar = smoothstep(FAR_NEAR, FAR_FAR, distance(uCamPos, vec3(instanceMatrix[3])));
  vTgMid = smoothstep(6.0, 40.0, distance(uCamPos, vec3(instanceMatrix[3])));
#if BEHAV
  vTgHunt = 0.0; // (R8: a bison's aFx.z is its bellow weight)
#else
  vTgHunt = dead ? 0.0 : aFx.z;
#endif
  // how much this surface faces the sky (world space): the back of the animal, as the drone and map views see it
  vTgUp = clamp(normalize(mat3(instanceMatrix) * on).y, 0.0, 1.0);
  int tgPart = int(aPart.x + 0.5);
  if (tgPart >= 1 && tgPart <= 4 && !dead) vTgColor *= mix(1.0, uLegTone, vTgFar);
#if MANGE
  vTgMg = tgMangeOf();
#endif
#if MANGE || FUR
  vTgPos = position;
#endif
#if FUR
  vTgAO = 1.0 - aShade.x;
  vTgSeed = aLook.y;
  vTgNy = normal.y;
  // the direction the hair lies (along the body, backward and a little down; down the legs), in view space, for the sheen
  vec3 tgFd = (tgPart >= 1 && tgPart <= 4) ? vec3(0.0, -1.0, 0.0) : normalize(vec3(-1.0, -0.32, 0.0));
  vTgTan = mat3(modelViewMatrix) * (mat3(instanceMatrix) * tgFd);
  float tgCD = distance(uCamPos, vec3(instanceMatrix[3]));
  vTgCamD = tgCD;
#if SHELL
  vTgShell = vec2(aShade.y, 1.0 - smoothstep(SHELL_D0, SHELL_D1, tgCD));
#endif
#endif
}
`;

/** The animation GLSL (defines for a model, and the shared declarations with tgAnimate), for tools that run it outside three: dev/footslip-gpu.ts checks it against legmath.ts. */
export function animationShaderParts(def: ModelDef, variant?: 'near'): { defs: string; decl: string } {
  // variant 'near': the program of the authored near LOD (with the a3 skin blend), as defsOf builds it; the default is the plain procedural program
  if (variant === 'near') return { defs: defines(def.params, def.far, def.geometry, def, 'near') + '\n' + seasonDefines(def), decl: COMMON_DECL };
  return { defs: defines(def.params, def.far, def.geometry) + '\n' + seasonDefines(def), decl: COMMON_DECL };
}

/** Value noise shared by mange and fur (fragment side), and the position varying. */
const NOISE_DECL = /* glsl */ `
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
/** Mange, fragment side: declarations and the mottling applied after the coat colour (only models with MANGE). */
const MANGE_DECL = /* glsl */ `
varying float vTgMg;
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

/** R7 fur, fragment side: declarations, the near/far cross-fade, the shell tufts and the coat pattern (only models with `fur`). */
const FUR_DECL = /* glsl */ `
uniform sampler2D tTgNoise;
// cheap value noise for the fur: one fetch of a tiled random texture (bilinear), the third axis skews the lookup
float tgFN(vec3 q) { return texture2D(tTgNoise, q.xy * (1.0 / 64.0) + q.z * vec2(0.0089, 0.0111)).r; }
varying float vTgSeed;
varying float vTgCamD;
varying float vTgAO;
varying float vTgNy;
varying vec3 vTgTan;
#if SHELL
varying vec2 vTgShell;
#endif
`;
const LOD_DECL = /* glsl */ `
varying float vTgLod;
// the complementary dithered discard of the cross-fade: the near mesh keeps the pixels where the noise is above the fade level, the far
// mesh the ones below it, so together they cover every pixel exactly once (and the noise differs from the border fade's offset)
float tgLodNoise() {
  return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + 0.37));
}
bool tgLodDiscard() {
#if NEARLOD
  return tgLodNoise() < vTgLod;
#else
  return tgLodNoise() >= vTgLod;
#endif
}
`;
const SHELL_DECL = /* glsl */ `
// wool shells: the shell is cut into tufts by an elongated value noise (the hair hangs down); the outer layer and a far one are sparser
bool tgShellDiscard() {
  // cells elongated along the way the hair lies (back and down in the body's x, y plane), thin across it
  vec2 hu = vec2(-0.95, -0.31);
  vec3 q = vec3(dot(vTgPos.xy, hu) * SHELL_SCALE * SHELL_ALONG, dot(vTgPos.xy, vec2(-hu.y, hu.x)) * SHELL_SCALE, vTgPos.z * SHELL_SCALE * 0.8);
  float n = tgFN(q) * 0.62 + tgFN(q * 2.3 + 9.0) * 0.38;
  if (vTgShell.x < 0.01) return false;
  float thr = SHELL_SPARSE + 0.3 * vTgShell.x + (1.0 - vTgShell.y) * 0.45;
  return n < thr;
}
`;
const FUR_COLOR = /* glsl */ `
        {
          // coat pattern: a darker back and a paler belly (everywhere, so the two LODs match), and within 80 m tone mottling at two scales
          // (per animal, so no two coats are alike) and hair streaks running along the body
          float ftone = 1.0 - FUR_DORSAL * smoothstep(0.35, 0.95, vTgNy) + FUR_BELLY * smoothstep(-0.2, -0.8, vTgNy);
          if (vTgCamD < 80.0) {
            vec3 fq = vTgPos * FUR_MOTTLE_SCALE + vec3(aLookSeed * 31.7, aLookSeed * 17.3, aLookSeed * 9.1);
            float fnz = 0.55 * tgFN(fq) + 0.3 * tgFN(fq * 2.7 + 3.1) + 0.15 * tgFN(fq * 7.3 + 1.7);
            ftone *= 1.0 + FUR_MOTTLE * (fnz - 0.5) * 2.0 * (1.0 - smoothstep(35.0, 80.0, vTgCamD));
            float fnearD = 1.0 - smoothstep(10.0, 34.0, vTgCamD); // (finer than a pixel beyond that)
            float fst = 0.6 * tgFN(vTgPos * vec3(12.0, 80.0, 80.0) + 5.0) + 0.4 * tgFN(vTgPos * vec3(30.0, 190.0, 190.0) + 1.0);
            ftone *= 1.0 + FUR_STREAK * (fst - 0.5) * 2.0 * fnearD;
            // wool shells: darker at the root (the inner layer), paler at the tips (the outer one)
#if SHELL
            if (vTgShell.x > 0.01) ftone *= mix(SHELL_TONE.x, SHELL_TONE.y, vTgShell.x);
#endif
          }
          diffuseColor.rgb *= ftone;
        }`;
const FUR_LIGHT = /* glsl */ `
#if FUR
        {
          // baked AO on the direct light too (half strength: the sun still reaches a leg pit a little)
          reflectedLight.directDiffuse *= mix(1.0, vTgAO, 0.5);
          if (vTgCamD < 80.0) {
            vec3 fLd = directLight.direction;
            vec3 fVv = normalize(vViewPosition);
            float fnear = 1.0 - smoothstep(30.0, 80.0, vTgCamD);
            // hair sheen (Kajiya and Kay): a highlight that runs along the body axis, strongest where the hair is most sideways to the half vector
            vec3 fH = normalize(fLd + fVv);
            float fth = dot(normalize(vTgTan), fH);
            float fk = pow(sqrt(max(1.0 - fth * fth, 0.0)), FUR_SHEEN_POW);
            float flit = smoothstep(-0.05, 0.45, dot(normal, fLd));
            vec3 fcoat = mix(vec3(1.0), diffuseColor.rgb * 6.0, 0.5) * FUR_SHEEN_TINT;
            reflectedLight.directSpecular += directLight.color * fcoat * (fk * flit * FUR_SHEEN * 0.14 * fnear * (1.0 - 0.7 * uLow));
            // backlit rim of glowing hair in a low sun (near range only: the far rim and the night rim are separate)
            float fback = clamp(-dot(fLd, fVv), 0.0, 1.0);
            float fedge = pow(1.0 - clamp(dot(normal, fVv), 0.0, 1.0), 2.4);
            float fwrap = clamp(dot(normal, fLd) * 0.6 + 0.5, 0.0, 1.0);
            reflectedLight.directSpecular += directLight.color * fcoat * (fedge * fback * fwrap * FUR_RIM * 0.17 * fnear * (1.0 - uLow));
#if SHELL
            // hair of the shells, lit from behind, glows through (translucent): the sun shows through a fringe of tufts
            float fwrapS = clamp(dot(normal, fLd) * 0.5 + 0.5, 0.0, 1.0);
            reflectedLight.directSpecular += directLight.color * diffuseColor.rgb * (vTgShell.x * fback * fwrapS * 0.6 * fnear * (1.0 - uLow));
#endif
          }
        }
#endif`;

let noiseTex: THREE.DataTexture | null = null;
/** A 64 x 64 tiled random texture (bilinear, mipmapped) that the fur shading reads as value noise. */
function furNoise(): THREE.DataTexture {
  if (!noiseTex) {
    const n = 64, d = new Uint8Array(n * n * 4);
    let s = 0x2545f491;
    for (let i = 0; i < d.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = (s >>> 0) & 255; }
    noiseTex = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
    noiseTex.generateMipmaps = true;
    noiseTex.needsUpdate = true;
  }
  return noiseTex;
}

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
  /** How bright the season's grass is, 0.6 (spring green, winter) .. 1 (summer gold): scales the predators' darkening (R-readable). Optional: defaults to 0.8. */
  uGrassB?: { value: number };
  /** Ambient light of the scene as an rgb (0 night .. about 0.7 day), set by `probe`. */
  uAmb: { value: THREE.Vector3 };
  /** Reads the lights of the scene being rendered into `uLow` (called once per draw of the main view). */
  probe?: (scene: THREE.Object3D, exposure: number) => void;
}

/**
 * The materials of a species. `variant` picks the LOD this material draws: 'single' (one mesh, the default), 'far' (the far mesh of a
 * species that also has a near LOD: it hides the instances that the near mesh draws) or 'near'. The depth material is the same for all
 * (shadows use the far mesh everywhere).
 */
export function makeAnimalMaterials(sp: number, def: ModelDef, shared: AnimalShared, variant: Variant = 'single'): AnimalMaterials {
  shared.uTL ??= { value: 0 };
  shared.uNightK ??= { value: 1 };
  shared.uGrassB ??= { value: 0.8 };
  // (worked out when the program is compiled, so the R8 switch below can take effect on a recompile)
  const defsOf = (): string => defines(def.params, def.far, def.geometry, def, variant) + '\n' + seasonDefines(def);
  const defsDepthOf = (): string => defines(def.params, def.far, def.geometry) + '\n' + seasonDefines(def);
  // R3 mange (canids only): the fragment stage mottles the coat with dark bare skin in patches, more of it with severity (vTgMg).
  const hasMange = def.params.hunts === true && def.params.kind === 0;
  const hasFur = def.fur !== undefined && def.params.kind === 0;
  const lodOn = variant !== 'single';
  const hasShell = variant === 'near' && hasFur && def.fur?.shell !== undefined;
  const mangeDecl = (hasMange ? MANGE_DECL : '') + (hasMange || hasFur ? NOISE_DECL : '') + (hasFur ? FUR_DECL : '') + (lodOn ? LOD_DECL : '') + (hasShell ? SHELL_DECL : '');
  const lodDefs = lodDefines(def, variant).join('\n');
  const mangeFrag = (hasFur ? FUR_COLOR.replace(/aLookSeed/g, 'vTgSeed') : '') + (hasMange ? MANGE_FRAG : '');
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: def.roughness, metalness: 0 });
  if (variant === 'near' && def.a3) {
    // a3 spike: the authored near LOD is textured (the vertex colour is 1, so the coat tint, the fur pattern and the lighting all act on the albedo)
    material.map = def.a3.map;
    if (def.a3.normalMap) { material.normalMap = def.a3.normalMap; material.normalScale.set(1, 1); }
  }
  material.onBeforeCompile = (shader) => {
    const defs = defsOf();
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uPxK = shared.uPxK;
    shader.uniforms.tHeight = shared.tHeight;
    shader.uniforms.uCell = shared.uCell;
    shader.uniforms.uHN = shared.uHN;
    if (hasFur) shader.uniforms.tTgNoise = { value: furNoise() };
    shader.uniforms.uCoatPale = { value: new THREE.Vector3(...def.coatPale) };
    shader.uniforms.uCoatDark = { value: new THREE.Vector3(...def.coatDark) };
    shader.uniforms.uBone = { value: new THREE.Vector3(...def.bone) };
    shader.uniforms.uWinterPale = { value: new THREE.Vector3(...(def.seasonal?.winterPale ?? def.coatPale)) };
    shader.uniforms.uWinterDark = { value: new THREE.Vector3(...(def.seasonal?.winterDark ?? def.coatDark)) };
    shader.uniforms.uVelvet = { value: new THREE.Vector3(...(def.seasonal?.velvet ?? [0.1, 0.075, 0.055])) };
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
    shader.uniforms.uGrassB = shared.uGrassB!;
    shader.uniforms.uReadDark = { value: new THREE.Vector3(...(def.read?.dark ?? [1, 1, 1])) };
    shader.uniforms.uReadPale = { value: def.read?.pale ?? 0 };
    shader.uniforms.uReadRim = { value: new THREE.Vector4(...(def.read?.rim ?? [1, 1, 1, 0])) };
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
        lodOn
          // an instance the other LOD draws collapses to a point (a degenerate triangle: no fragments, no cost)
          ? `#include <beginnormal_vertex>\n vec3 tgP = position;\n float tgLod = tgLodOf();\n vTgLod = tgLod;\n#if NEARLOD\n if (tgLod < 0.999) {\n#else\n if (tgLod > 0.001) {\n#endif\n tgAnimate(tgP, objectNormal);\n tgShade(objectNormal);\n#if SHELL\n if (aShade.y > 0.0 && distance(uCamPos, vec3(instanceMatrix[3])) > SHELL_D1) tgP = vec3(0.0);\n#endif\n } else { tgP = vec3(0.0); }`
          : `#include <beginnormal_vertex>\n vec3 tgP = position;\n tgAnimate(tgP, objectNormal);\n tgShade(objectNormal);`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = tgP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n if (tgFadeDiscard(vTgFade)) discard;${lodOn ? '\n if (tgLodDiscard()) discard;' : ''}${hasShell ? '\n if (tgShellDiscard()) discard;' : ''}`)
      .replace('#include <common>', `#include <common>\n${lodDefs}\n${FADE_FRAG_DECL}\nvarying vec3 vTgColor;\nvarying float vTgSel;\nvarying float vTgFar;\nvarying float vTgMid;\nuniform vec3 uReadDark;\nuniform float uReadPale;\nuniform vec4 uReadRim;\nuniform float uGrassB;\nvarying float vTgHunt;\nuniform float uFill;\nuniform vec3 uWarm;\nuniform float uNeutral;\nuniform float uFarGain;\nuniform vec3 uRimCol;\nuniform float uRimK;\nuniform float uHuntK;\nuniform float uLow;\nuniform vec3 uAmb;\nuniform vec3 uFarTint;\nuniform float uFarMix;\nuniform float uFloor;\nuniform float uLowFill;\nvarying float vTgUp;\nuniform vec3 uTopCol;\nuniform float uTopMix;\nuniform float uSideDark;\nuniform float uNightK;${mangeDecl}`)
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
        // R-readable: value separation by guild at the default distances. A predator is darker and cooler (most against bright grass), a
        // grazer's pale markings (rump, belly) are lifted; both fade in from about 6 m, give way to the far-view tint, and fade with the dark.
        float tgMidK = vTgMid * (1.0 - 0.5 * vTgFar);
        diffuseColor.rgb *= mix(vec3(1.0), uReadDark, uGrassB * tgMidK);
        diffuseColor.rgb *= 1.0 + uReadPale * smoothstep(0.16, 0.42, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))) * tgMidK * (1.0 - uLow);
        // night lift: the coat reflects more of the little light there is, so the animals do not sink into the blue ground (the
        // far-view dimming above takes the coat down at night, this gives part of it back)
        // (pale coats, a pronghorn's white, get little of it: they already stand out against the dark ground)
        float tgNL = 1.0 - 0.7 * smoothstep(0.18, 0.5, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
        diffuseColor.rgb *= 1.0 + 0.55 * uLow * uNightK * tgNL;${mangeFrag}`)
      // sky fill: pull toward a warm neutral (so brown coats stay brown in blue shade), then boost it so the shaded side keeps form
      .replace(
        '#include <lights_fragment_end>',
        `irradiance = mix(irradiance, vec3(dot(irradiance, vec3(0.2126, 0.7152, 0.0722))) * uWarm, uNeutral) * uFill * (1.0 - uLowFill * uLow);\n${hasFur ? 'irradiance *= vTgAO;\n' : ''}#include <lights_fragment_end>${hasFur ? FUR_LIGHT : ''}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float tgRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
        // (the selection tint is a thin warm edge, not a wash: at a low camera the whole back of the animal faces the grazing view, so a wide rim frosts it)
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.35) * vTgSel * (0.006 + 0.2 * tgRim * tgRim);
        float tgEdge = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 1.6);
        // R-readable edge lift: a faint sky-coloured light along the silhouette (scales with the scene's ambient, so it never glows)
        float tgRd = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);
        // (it eases in with distance, about 15 percent at 20 m, half at 30 m, in full from 40 m: the default views keep the lift, a close follow does not frost the back)
        totalEmissiveRadiance += uReadRim.rgb * uReadRim.a * uAmb * tgRd * (0.55 + 0.45 * vTgUp) * (vTgMid * vTgMid) * (1.0 - 0.7 * uLow);
        totalEmissiveRadiance += uRimCol * vTgFar * (uRimK + vTgHunt * uHuntK) * tgEdge * (1.0 - 0.9 * uLow);
        // ambient floor: a share of the scene's own ambient light reaches the coat unshadowed, so a herd in shade or at dusk
        // keeps its value above the shadows; it scales with the light, so it dims with the scene and never glows
        totalEmissiveRadiance += diffuseColor.rgb * uAmb * uFloor * vTgFar * (1.0 - 0.75 * uLow);
        // Moonlight (night only, uLow near 1): a cool rim along every silhouette edge, strongest on the surfaces that face the sky,
        // plus a cool fill on the coat itself. Starker than the day lighting on purpose, so an animal reads against the dark ground
        // by its outline and by value, without the night looking like day.
        float tgNR = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.2);
        float tgNK = smoothstep(0.35, 0.88, uLow) * uNightK;
        totalEmissiveRadiance += vec3(0.52, 0.64, 0.9) * 0.46 * tgNR * (0.3 + 0.7 * vTgUp) * tgNK * (0.6 + 0.4 * vTgFar) * (0.72 + 0.28 * vTgMid) * tgNL;
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.085, 0.105, 0.17) * tgNK * (0.5 + 0.5 * vTgUp) * tgNL;`,
      );
  };
  material.customProgramCacheKey = () => `tg-animal-${sp}-${variant}-${R8_SHADER.on ? 1 : 0}${R8_SHADER.bison ? 1 : 0}${R8_SHADER.flare ? 1 : 0}`;

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    const defsDepth = defsDepthOf();
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uPxK = shared.uPxK;
    shader.uniforms.tHeight = shared.tHeight;
    shader.uniforms.uCell = shared.uCell;
    shader.uniforms.uHN = shared.uHN;
    shader.uniforms.uTL = shared.uTL!;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${defsDepth}\n${COMMON_DECL}\nvarying float vTgFade;`)
      // a bird in flight casts no shadow (collapse it to a point): at the boost the wide view needs, it would sweep a huge
      // blocky smudge across the ground. A raptor below 40 m and within 170 m of the camera does cast one (R5)
      .replace('#include <begin_vertex>', `vec3 tgP = position;\n vec3 tgN = vec3(0.0, 1.0, 0.0);\n tgAnimate(tgP, tgN);\n vTgFade = aGait.y < -0.5 ? 1.0 : tgFadeOf() * (1.0 - tgIsWake);\n#if KIND == 2\n#if RAPTOR\n if (aFx.y > 40.0 || distance(uCamPos, vec3(instanceMatrix[3])) > 170.0) tgP = vec3(0.0);\n#else\n if (aFx.y > 1.0) tgP = vec3(0.0);\n#endif\n#endif\n vec3 transformed = tgP;`);
    // the stippled border fade casts a stippled shadow too
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (tgFadeDiscard(vTgFade)) discard;')
      .replace('#include <common>', `#include <common>\n${FADE_FRAG_DECL}`);
  };
  depth.customProgramCacheKey = () => `tg-animal-depth-${sp}-${R8_SHADER.on ? 1 : 0}${R8_SHADER.bison ? 1 : 0}${R8_SHADER.flare ? 1 : 0}`;
  return { material, depth };
}
