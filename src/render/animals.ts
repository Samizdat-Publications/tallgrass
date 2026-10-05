// AnimalLayer: instanced, vertex-animated animals driven by sim snapshots.
//
// One InstancedMesh per species. Per-instance matrix (position, yaw, terrain pitch/roll, scale) is built on the
// CPU; the gait, graze, rest, carcass and wing poses are evaluated in the vertex shader (see models/shader.ts)
// from three vec4 instance attributes. Snapshots arrive at 10 to 60 Hz; positions and headings are interpolated
// between the previous and current snapshot by id.
//
// Foot-lock: the leg cycle advances by (distance drawn this frame / stride), never by time, so a planted foot stands
// still on the ground at any sim rate or frame rate (the stride is the one the foot path uses, see models/legmath.ts gaitMix).
// Within 45 m of the camera the legs also read the ground under each foot (two-bone IK in the vertex shader) and the body
// height follows the mean height of the stance feet (stanceBodyDy below, eased here because a shader keeps no state).
import * as THREE from 'three';
import { AGENT_STRIDE, CARCASS_STRIDE, F_ALPHA, F_INFECTED, F_MIGRANT, SPECIES_COUNT, Sp, St } from '../sim/types';
import type { Snapshot } from '../sim/types';
import { SPECIES } from '../sim/species';
import { sampleHeight } from '../sim/world';
import type { World } from '../sim/world';
import { getModel } from './models';
import type { AnimParams, ModelDef } from './models';
import { IK_FAR, IK_NEAR, gaitMix, gaitStride, legRigOf, stanceBodyDy, timelapseGaitSpd, timelapseHz, timelapseK } from './models/legmath';
import type { LegRig } from './models/legmath';
import { ContactShadows } from './models/contact';
import { makeAnimalMaterials } from './models/shader';
import type { AnimalShared } from './models/shader';
import { Dust, KillSites, Markers, SceneLit } from './models/fx';
import { CanidState, newIn, newOut } from './canids';
import { sunHeight } from '../audio/mix';
import { injectTerrainShadow } from './common';
import type { SharedUniforms } from './common';

// Per-species render tables are authored by registry key and expanded to arrays indexed by species id, so a species added
// to SPECIES (src/sim/species.ts) gets a sane default here until it earns its own entry.
const byId = <T>(authored: Record<string, T>, fallback: (s: (typeof SPECIES)[number]) => T): T[] => SPECIES.map((s) => authored[s.key] ?? fallback(s));

const INITIAL_CAPACITY: number[] = byId({ bison: 2048, wolf: 512, raven: 512, pronghorn: 1024, rabbit: 1024, cougar: 128 }, () => 256);

/** Land hunters: the predators that pounce and are chased by the kill-site reactions (wolf, cougar; later coyote). Fliers hunt differently. */
const HUNTER: boolean[] = SPECIES.map((s) => (s.guild === 'predator' || s.guild === 'mesopredator') && !s.flies);
/** Fliers: drawn at their altitude, banked into turns, folded on the ground (raven; later eagle, hawk). */
const FLIES: boolean[] = SPECIES.map((s) => s.flies);
/** The canids (wolf, coyote): mange, and for the coyote the mousing leap, the dusk chorus and the wary glance (render/canids.ts). */
const CANID: boolean[] = SPECIES.map((s) => s.key === 'wolf' || s.key === 'coyote');
/** Prey a lunging hunter goes for: grazers that are neither fliers nor the small ones (rabbit, prairie dog, beaver). */
const SMALL_KEYS = new Set(['rabbit', 'prairiedog', 'beaver']);
const LUNGE_TARGET: boolean[] = SPECIES.map((s) => s.prey && !HUNTER[s.id] && !s.flies && !SMALL_KEYS.has(s.key));

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const wrapPi = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const hash01 = (n: number): number => (Math.imul(n | 0, 0x9e3779b1) >>> 8) / 16777216;

/**
 * Dust kicked up by fast movers: [min speed m/s, puffs per second per m/s over the minimum, start size m (before the
 * animal's own scale), alpha, min life s, max life s]. Wolves, pronghorn and cougars get a few short-lived round
 * puffs at the feet; only a bison herd makes a real dust cloud.
 */
const DUST: Array<[number, number, number, number, number, number] | null> = byId<[number, number, number, number, number, number] | null>(
  {
    bison: [4.5, 2.7, 3.3, 0.38, 1.5, 2.6], // a stampede kicks up a real cloud (R1 item 7)
    wolf: [5.5, 0.5, 0.75, 0.2, 0.7, 1.1],
    raven: null,
    pronghorn: [6, 0.4, 0.95, 0.2, 0.8, 1.2],
    rabbit: null,
    cougar: [5.5, 0.4, 0.8, 0.2, 0.7, 1.1],
    coyote: [5, 0.35, 0.6, 0.18, 0.6, 1.0],
  },
  () => null, // no dust until a species is given a table
);

/** On-screen metres per second of sim speed at 1x (DT 0.15 s of motion per tick, 10 ticks per second). */
const VIS_PER_SIM = 1.5;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The weight follower of one animal: where it is drawn, how fast, and where its (smoothed) sim path was last frame. */
export interface WeightState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  tx: number;
  tz: number;
}

/**
 * Weight: the drawn path (st.x, st.z) pursues the smoothed sim path (cx, cz) but may only pick its SPEED up at `cap` m/s^2 (braking
 * and turning are free, so it never overshoots). The shortfall shows as a lag behind the sim position; as the lag grows past
 * `lag0` the cap lifts smoothly (x13 by `lag1`) so the animal still catches the sim, and `hard` bounds the drift outright. A gap
 * wider than 4 x `hard` (a teleport) snaps. Returns the rate the drawn speed changed at (m/s^2, + speeding up, - braking).
 */
export function weightStep(st: WeightState, cx: number, cz: number, dt: number, cap: number, lag0: number, lag1: number, hard: number): number {
  const vsx = (cx - st.tx) / dt, vsz = (cz - st.tz) / dt;
  // the error is last frame's (where the target was against where the draw was), so a steady pursuit settles to zero lag
  const ex0 = st.tx - st.x, ez0 = st.tz - st.z;
  st.tx = cx;
  st.tz = cz;
  const g0 = Math.hypot(ex0, ez0);
  if (g0 > 4 * hard || Math.hypot(vsx, vsz) > 400) {
    st.x = cx; st.z = cz; st.vx = vsx; st.vz = vsz;
    return 0;
  }
  let vdx = vsx + 3 * ex0, vdz = vsz + 3 * ez0;
  // (catching up never runs more than 15% faster than the sim path itself, so the end of a lag is not a surge)
  const vmax = Math.hypot(vsx, vsz) * 1.15 + 0.4;
  let des = Math.hypot(vdx, vdz);
  if (des > vmax) {
    vdx *= vmax / des;
    vdz *= vmax / des;
    des = vmax;
  }
  const cur = Math.hypot(st.vx, st.vz);
  const aEff = cap * (1 + 12 * smoothstep(lag0, lag1, g0));
  const lim = cur + aEff * dt;
  if (des > lim) {
    const s = lim / des;
    vdx *= s;
    vdz *= s;
  }
  st.vx = vdx;
  st.vz = vdz;
  st.x += vdx * dt;
  st.z += vdz * dt;
  const ex = cx - st.x, ez = cz - st.z;
  const g = Math.hypot(ex, ez);
  if (g > hard) {
    st.x = cx - (ex / g) * hard;
    st.z = cz - (ez / g) * hard;
  }
  return (Math.hypot(st.vx, st.vz) - cur) / dt;
}

/**
 * Metres of ground covered per leg cycle at a gait pace (the pace the animal moves at in its own world, on-screen m/s at
 * 1x). Quadrupeds use the stride of the blended gait that the vertex shader's foot path uses (legmath.ts gaitMix), which is
 * what leaves a planted foot standing still on the ground; hoppers and birds interpolate their authored strides.
 */
function strideFor(p: AnimParams, gaitSpd: number): number {
  if (p.kind !== 0) {
    const u = clamp(gaitSpd / p.strideSpeedMax, 0, 1);
    return p.strideW + (p.strideG - p.strideW) * u * u * (3 - 2 * u);
  }
  return gaitStride(p, gaitSpd);
}

/**
 * The scale the vertex shader gives an animal of drawn scale `vs` at camera distance `camD` so it is never smaller than minPx pixels
 * (see the distance readability line at the end of tgAnimate). Its legs grow with it, so its stride does too.
 */
function legBoost(p: AnimParams, vs: number, camD: number, uPxK: number): number {
  const px = (p.boostLen * vs * uPxK) / Math.max(camD, 1);
  return clamp(p.minPx / Math.max(px, 0.01), 1, 7);
}

/**
 * Most leg cycles per second the cadence may reach (faster than this the legs alias on screen). It must never bind at 1x: the
 * fastest real gallop (a pronghorn in flight, a wolf closing at 25 m/s on screen) is about 4 to 6 Hz with the blended stride.
 * Only a time-lapse (10x and up, where the body covers ten times the ground per frame) can hit it, and then the feet slide.
 */
const MAX_CADENCE = 12;

/**
 * Time-lapse landing dust (the ground-contact cue of the bound at 4x and up, see timelapseK in models/legmath.ts): at most this many
 * puffs a frame across all animals, one per TL_TRAIL_M metres of ground a mover covers (times its drawn scale), only within
 * TL_DUST_RANGE m of the camera and only for animals actually travelling faster than TL_MIN_VIS m/s on screen.
 */
const TL_PUFFS_PER_FRAME = 40;
const TL_TRAIL_M = 4.5;
const TL_DUST_RANGE = 170;
const TL_MIN_VIS = 5;

/**
 * Render-side heading dynamics per species: natural frequency (rad/s) of the critically damped spring that chases the sim
 * heading, and the fastest the body may turn (rad/s). The sim re-aims instantly; the body does not, so an animal carries
 * its momentum through a turn and leans into it.
 */
const TURN: Array<[number, number]> = byId<[number, number]>(
  {
    bison: [3.0, 1.5], // heavy: a wide turning circle (about 4 m of radius at a trot, 7 m at a stampede)
    wolf: [7, 6],
    raven: [3.5, 2.6], // banks through wide circles
    pronghorn: [7, 6],
    rabbit: [9, 8],
    cougar: [7, 6],
  },
  (s) => (s.flies ? [3.5, 2.6] : [7, 6]),
);
/** Largest lean (rad) into a turn at speed. */
const BANK_MAX: number[] = byId({ bison: 0.2, wolf: 0.42, raven: 0.75, pronghorn: 0.42, rabbit: 0.3, cougar: 0.42 }, (s) => (s.flies ? 0.75 : 0.42));

/**
 * Weight (R1 item 7): the most the drawn speed may rise per second, in on-screen m/s^2 (0 = uncapped: fliers, the rabbit's
 * hops). The sim speeds up in a tick or two; the drawn animal picks its speed up at this rate instead (see `weightStep`), so a
 * bison lumbers into a run while a pronghorn is away at once. The drawn path stays within WEIGHT_LAG of the sim path.
 */
const ACCEL: number[] = byId({ bison: 2.5, pronghorn: 6, wolf: 5, coyote: 6, cougar: 6, raven: 0, rabbit: 0 }, (s) => (s.flies ? 0 : 5));
/** The drawn path may trail the sim path by up to this (m): the cap lifts smoothly from WEIGHT_LAG0 to WEIGHT_LAG (x12 by then), and nothing drifts further than WEIGHT_HARD. */
const WEIGHT_LAG0 = 0.45;
const WEIGHT_LAG = 1.5;
const WEIGHT_HARD = 2.0;
/** Body pitch (rad) while speeding up (nose down) and while braking (nose up), full strength at 1.6 x the species cap. */
const LEAN_UP = -(4 * Math.PI) / 180;
const LEAN_BRAKE = (5 * Math.PI) / 180;
/** The border fade (R1 item 9): migrants fade in and out between this many metres from the world edge (gone) and FADE_FULL (fully there). */
const FADE_GONE = 3;
const FADE_FULL = 15;
/** Cougar drag (R1 item 8): the carcass is hauled up to this far toward cover, from FALL_TIME + DRAG_WAIT after the kill, at DRAG_SPEED m/s. */
const DRAG_MAX = 3;
const DRAG_WAIT = 0.8;
const DRAG_SPEED = 0.85;

/** How the whole fall of a carcass plays out, in seconds. */
const FALL_TIME = 2.4;
/** The prey's struggle (shader.ts `strug`) ends this many seconds into its fall. */
const STRUGGLE_END = 1.2;
/** A predator within this many metres of a fresh kill (or arriving within it while the prey still struggles) lunges. */
const POUNCE_R = 9;
/** Takedown: the lunge springs on over POUNCE_SPRING s, the hold lasts until the prey's struggle ends, then the release takes POUNCE_RELEASE s. */
const POUNCE_TIME = 1.8;
const POUNCE_SPRING = 0.24 * POUNCE_TIME;
const POUNCE_RELEASE = POUNCE_TIME - STRUGGLE_END;
/** Seconds after a takedown ends before the same predator may lunge again. */
const POUNCE_COOL = 2.5;
/** Distance (m) between the lunging predator's centre and its contact point on the prey when the lunge connects (muzzle on the flank). */
const CONTACT_D = 1.75;
/** Contact points of a takedown along the prey's body (fraction of half its length, + toward the head): throat, flank, hindquarter, then in between. */
const CONTACT_AX = [0.78, 0, -0.78, 0.4, -0.4, 0.2, -0.2];
/** Furthest (m) a feeding predator is moved from its sim position to take its place round the carcass; a waiting subordinate lies further out. */
const SLOT_CAP = 2.5;
/** Least angle (rad) between two feeding slots round a carcass. */
const SLOT_SEP = 0.85;
const SUB_CAP = 6.5;
/** A feeding predator pulls, shakes and swallows once per cycle, every 2.5 to 4 s (its own period). */
const FEED_MIN = 2.5;
const FEED_VAR = 1.5;
/** A raven on the ground flutters back from a wolf that lunges or feeds within this many metres. */
const RAVEN_WOLF_R = 2;
/** A grounded raven takes off with a deep downstroke flare lasting this many seconds. */
const TAKEOFF_TIME = 1.1;

/** Carcass-pull signal of the feeding cycle (the shader's `pullW`): rises through the haul, then the meat tears free and it drops. */
const feedPull = (fp: number): number => smoothstep(0.16, 0.5, fp) * (1 - smoothstep(0.5, 0.56, fp));

interface FallInfo {
  /** Seconds since the animal began to go down (large for carcasses that were already lying there). */
  t: number;
  /** Seconds since the carcass appeared in the snapshots (never stops), its map key, species, and the share of meat left. */
  age: number;
  key: number;
  sp: number;
  rem: number;
  /** Where the body is drawn (the sim carcass position plus the skid), updated each frame: takedown contacts and feeding slots are measured from it. */
  cx: number;
  cz: number;
  /** Predators that took part, in arrival order (animal ids), and the carcass age at each arrival. */
  crew: number[];
  crewAt: number[];
  /** The angle (carcass frame) of each crew member's slot round the carcass, NaN until it is chosen. */
  slotTh: number[];
  /** The side of the prey each took in the takedown (+1 right, -1 left). */
  crewSide: number[];
  /** The subordinate that lies out 4 to 6 m and waits (animal id, 0 = not chosen) and the angle of the first feeding slot. */
  sub: number;
  th0: number;
  /** The strongest pull this frame (0..1), where it pulls from (carcass frame, m), and the same eased: the shader dents the flank there. */
  pbest: number;
  pdx: number;
  pdz: number;
  pull: number;
  pcx: number;
  pcz: number;
  /** Heading and on-screen speed of the animal that died here, its drawn scale, and its leg cycle phase when it went down. */
  h: number;
  v: number;
  vs: number;
  ph: number;
  /** Pace of the stumble, decaying from `v` as the animal loses its footing. */
  pace: number;
  /** Where the body was drawn when it fell, relative to where the sim puts the carcass (the drawn path lags the sim a little). */
  ox: number;
  oz: number;
  /** Snapshot generation that last saw this carcass (so stale entries can be dropped). */
  g: number;
  /**
   * Cougar drag (R1 item 8): the cougar that took this kill (animal id, 0 = none), the unit direction of the haul and its full
   * length (m, 0 = not dragged), the carcass ages at which it starts and ends, and how far the body has been hauled so far
   * (a display offset from the sim position, world xz).
   */
  dragger: number;
  /** The heading the animal fell with (fi.h swings round while it is hauled; the skid of its fall keeps this direction). */
  h0: number;
  dux: number;
  duz: number;
  dlen: number;
  dt0: number;
  dt1: number;
  dgx: number;
  dgz: number;
}

/** Where a feeding predator should stand round its carcass, and what it does there (planFeeder). */
interface FeederPlan {
  /** False when no carcass is close enough to plan for. */
  on: boolean;
  /** The slot (world xz), how far from the sim position it may be, and the heading that faces the carcass from it. */
  tx: number;
  tz: number;
  cap: number;
  face: number;
  /** Lying out and waiting its turn (a subordinate), or feeding now. Neither: standing at its slot, head up, waiting for the alpha. */
  lie: boolean;
  feed: boolean;
  fi: FallInfo | null;
  /** Angle of the slot in the carcass frame. */
  th: number;
  /** A cougar hauling its kill toward cover: walking ahead of the body, head down on the neck. */
  drag: boolean;
}

/** What a raven at a carcass does now: where it wanders to (world xz), whether it is hopping (1) or walking (2) and how far along, and which way it faces. */
interface RavenPlan {
  on: boolean;
  px: number;
  pz: number;
  mode: number;
  u: number;
  hx: number;
  hz: number;
  /** Centre of the carcass it is at. */
  cx: number;
  cz: number;
}

/** Per species draw batch (one InstancedMesh, rebuilt when it must grow). */
class Batch {
  readonly sp: number;
  readonly def: ModelDef;
  readonly material: THREE.MeshStandardMaterial;
  readonly depth: THREE.MeshDepthMaterial;
  capacity = 0;
  count = 0; // instances written this frame: living first, then carcasses
  alive = 0; // living instances (pickable)
  mesh!: THREE.InstancedMesh;
  geometry!: THREE.BufferGeometry;
  gait!: THREE.InstancedBufferAttribute;
  look!: THREE.InstancedBufferAttribute;
  fx!: THREE.InstancedBufferAttribute;
  fx2!: THREE.InstancedBufferAttribute;
  ids = new Uint32Array(0);
  /** x, y, z, radius per instance, world space, for picking. */
  centers = new Float32Array(0);

  private shared: AnimalShared;

  constructor(sp: number, def: ModelDef, material: THREE.MeshStandardMaterial, depth: THREE.MeshDepthMaterial, parent: THREE.Object3D, cap: number, shared: AnimalShared) {
    this.shared = shared;
    this.sp = sp;
    this.def = def;
    this.material = material;
    this.depth = depth;
    this.build(cap, parent);
  }

  build(cap: number, parent: THREE.Object3D): void {
    if (this.mesh) {
      parent.remove(this.mesh);
      this.mesh.dispose();
      this.geometry.dispose();
    }
    const g = new THREE.BufferGeometry();
    const src = this.def.geometry;
    for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.getAttribute(name));
    g.setIndex(src.getIndex());
    this.gait = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.fx2 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.gait.setUsage(THREE.DynamicDrawUsage);
    this.look.setUsage(THREE.DynamicDrawUsage);
    this.fx.setUsage(THREE.DynamicDrawUsage);
    this.fx2.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aGait', this.gait);
    g.setAttribute('aLook', this.look);
    g.setAttribute('aFx', this.fx);
    g.setAttribute('aFx2', this.fx2);
    const mesh = new THREE.InstancedMesh(g, this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = this.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = 'animals-' + this.sp;
    const sh = this.shared;
    mesh.onBeforeRender = (_r, _s, camera) => {
      const expo = (_r as THREE.WebGLRenderer).toneMappingExposure ?? 1;
      // the min-screen-size boost in the vertex shader needs the viewing camera (not the shadow camera)
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        sh.probe?.(_s, expo);
        sh.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
        sh.uPxK.value = 900 / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
      }
    };
    this.geometry = g;
    this.mesh = mesh;
    this.capacity = cap;
    this.ids = new Uint32Array(cap);
    this.centers = new Float32Array(cap * 4);
    parent.add(mesh);
  }

  ensure(n: number, parent: THREE.Object3D): void {
    if (n <= this.capacity) return;
    let cap = this.capacity;
    while (cap < n) cap *= 2;
    this.build(cap, parent);
  }
}

/** Persistent per-animal animation state, indexed by slot. */
class Slots {
  cap = 4096;
  phase = new Float32Array(this.cap);
  spd = new Float32Array(this.cap);
  /** Smoothed on-screen ground speed (m per real second), from the distance actually drawn each frame. */
  vis = new Float32Array(this.cap);
  /** Where the animal was drawn last frame (the foot-lock measures the distance covered from this) and the velocity of the drawn path. */
  px = new Float32Array(this.cap);
  pz = new Float32Array(this.cap);
  /** Terrain height under the body last frame (the foot-lock measures the distance along the ground from it) and the eased body-height offset (m, model units). */
  pgy = new Float32Array(this.cap);
  bdy = new Float32Array(this.cap);
  svx = new Float32Array(this.cap);
  svz = new Float32Array(this.cap);
  /** Weight follower (weightStep): where the animal is drawn (before display offsets), its velocity, where the smoothed sim path was last frame, and whether it is running. */
  wx = new Float32Array(this.cap);
  wz = new Float32Array(this.cap);
  wvx = new Float32Array(this.cap);
  wvz = new Float32Array(this.cap);
  wtx = new Float32Array(this.cap);
  wtz = new Float32Array(this.cap);
  wset = new Uint8Array(this.cap);
  /** Rate its drawn speed is changing at (m/s^2, eased) and the body pitch that comes of it (rad). */
  acc = new Float32Array(this.cap);
  lean = new Float32Array(this.cap);
  /** Feeding tug and hunting weights, eased. */
  tug = new Float32Array(this.cap);
  hunt = new Float32Array(this.cap);
  /** Drawn heading (rad) and its angular velocity: a critically damped follower of the sim heading. */
  hs = new Float32Array(this.cap);
  hw = new Float32Array(this.cap);
  /** Seconds since a pounce began (negative = not pouncing), and what it is aimed at: a live animal id, or a fixed point. */
  pounce = new Float32Array(this.cap).fill(-1);
  ptid = new Uint32Array(this.cap);
  ptx = new Float32Array(this.cap);
  ptz = new Float32Array(this.cap);
  /** Takedown: the carcass it is aimed at (map key, -1 = a live animal or a fixed point), its contact point (index into CONTACT_AX) and when the hold ends (s into the pounce). */
  pkey = new Int32Array(this.cap).fill(-1);
  pcon = new Uint8Array(this.cap);
  /** Which side of the prey it takes (+1 its right, -1 its left). */
  pside = new Int8Array(this.cap).fill(1);
  pstop = new Float32Array(this.cap).fill(STRUGGLE_END);
  /** The display offset from the sim position (m, world xz) applied last frame: a feeder at its slot round the carcass, a raven wandering about it. */
  fox = new Float32Array(this.cap);
  foz = new Float32Array(this.cap);
  /** Feeding cycle phase 0..1. */
  fph = new Float32Array(this.cap);
  /** Raven on the ground: how far it has settled into its wander (0..1), the flutter-back push (m) and its weight, the time that flutter may next start, the walk phase (cycles), the movement gate (hopping or walking), seconds since it took off (negative: not taking off), and whether it was grounded last frame. */
  rgw = new Float32Array(this.cap);
  stx = new Float32Array(this.cap);
  stz = new Float32Array(this.cap);
  stw = new Float32Array(this.cap);
  stt = new Float32Array(this.cap);
  rph = new Float32Array(this.cap);
  mv = new Float32Array(this.cap);
  rtk = new Float32Array(this.cap).fill(-1);
  wasG = new Uint8Array(this.cap);
  hdn = new Float32Array(this.cap);
  lie = new Float32Array(this.cap);
  crouch = new Float32Array(this.cap);
  flap = new Float32Array(this.cap);
  bank = new Float32Array(this.cap);
  pitch = new Float32Array(this.cap);
  sick = new Float32Array(this.cap);
  dust = new Float32Array(this.cap);
  /** Distance travelled (in trail spacings) since the last time-lapse dust puff. */
  tdust = new Float32Array(this.cap);
  fresh = new Uint8Array(this.cap);
  stamp = new Uint32Array(this.cap);
  map = new Map<number, number>();
  free: number[] = [];
  next = 0;

  alloc(): number {
    if (this.free.length) return this.free.pop()!;
    if (this.next >= this.cap) this.grow();
    return this.next++;
  }
  private grow(): void {
    const n = this.cap * 2;
    const g = <T extends Float32Array | Uint8Array | Uint32Array>(a: T, C: new (n: number) => T): T => {
      const b = new C(n);
      b.set(a);
      return b;
    };
    this.phase = g(this.phase, Float32Array);
    this.spd = g(this.spd, Float32Array);
    this.vis = g(this.vis, Float32Array);
    this.px = g(this.px, Float32Array);
    this.pz = g(this.pz, Float32Array);
    this.pgy = g(this.pgy, Float32Array);
    this.bdy = g(this.bdy, Float32Array);
    this.svx = g(this.svx, Float32Array);
    this.svz = g(this.svz, Float32Array);
    this.wx = g(this.wx, Float32Array);
    this.wz = g(this.wz, Float32Array);
    this.wvx = g(this.wvx, Float32Array);
    this.wvz = g(this.wvz, Float32Array);
    this.wtx = g(this.wtx, Float32Array);
    this.wtz = g(this.wtz, Float32Array);
    this.wset = g(this.wset, Uint8Array);
    this.acc = g(this.acc, Float32Array);
    this.lean = g(this.lean, Float32Array);
    this.tug = g(this.tug, Float32Array);
    this.hunt = g(this.hunt, Float32Array);
    this.hs = g(this.hs, Float32Array);
    this.hw = g(this.hw, Float32Array);
    { const b = new Float32Array(n).fill(-1); b.set(this.pounce); this.pounce = b; }
    this.ptid = g(this.ptid, Uint32Array);
    this.ptx = g(this.ptx, Float32Array);
    this.ptz = g(this.ptz, Float32Array);
    { const b = new Int32Array(n).fill(-1); b.set(this.pkey); this.pkey = b; }
    this.pcon = g(this.pcon, Uint8Array);
    { const b = new Int8Array(n).fill(1); b.set(this.pside); this.pside = b; }
    { const b = new Float32Array(n).fill(STRUGGLE_END); b.set(this.pstop); this.pstop = b; }
    this.fox = g(this.fox, Float32Array);
    this.foz = g(this.foz, Float32Array);
    this.fph = g(this.fph, Float32Array);
    this.rgw = g(this.rgw, Float32Array);
    this.stx = g(this.stx, Float32Array);
    this.stz = g(this.stz, Float32Array);
    this.stw = g(this.stw, Float32Array);
    this.stt = g(this.stt, Float32Array);
    this.rph = g(this.rph, Float32Array);
    this.mv = g(this.mv, Float32Array);
    { const b = new Float32Array(n).fill(-1); b.set(this.rtk); this.rtk = b; }
    this.wasG = g(this.wasG, Uint8Array);
    this.hdn = g(this.hdn, Float32Array);
    this.lie = g(this.lie, Float32Array);
    this.crouch = g(this.crouch, Float32Array);
    this.flap = g(this.flap, Float32Array);
    this.bank = g(this.bank, Float32Array);
    this.pitch = g(this.pitch, Float32Array);
    this.sick = g(this.sick, Float32Array);
    this.dust = g(this.dust, Float32Array);
    this.tdust = g(this.tdust, Float32Array);
    this.fresh = g(this.fresh, Uint8Array);
    this.stamp = g(this.stamp, Uint32Array);
    this.cap = n;
  }
}

export class AnimalLayer {
  readonly object3D = new THREE.Group();
  /** Sim speed multiplier (1 = real time, 0 = paused). Scales gait frequency so legs match visible speed. */
  timeScale = 1;
  /** Per species visual size multiplier by species id (readability boost for small animals: wolf 1.35 (the concept art wolves read at ~0.65 of a bison), raven 1.7 (circling ravens are the "kill here" tell), rabbit 1.2, cougar 1.05). */
  readonly speciesScale: number[] = byId({ bison: 1, wolf: 1.35, raven: 1.7, pronghorn: 1, rabbit: 1.2, cougar: 1.05, coyote: 1.35 }, () => 1);

  private world: World;
  /** Draw batch by species id; null for a species with no model (it is simply not drawn). */
  private batches: Array<Batch | null> = [];
  /** The non-null batches, for loops over every drawn species. */
  private live: Batch[] = [];
  private uTime = { value: 0 };
  private shared: AnimalShared & { uTL: { value: number }; uNightK: { value: number } } = {
    uTime: this.uTime, uCamPos: { value: new THREE.Vector3(256, 400, 256) }, uPxK: { value: 900 / (2 * Math.tan((45 * Math.PI) / 360)) },
    tHeight: { value: null }, uCell: { value: 1 }, uHN: { value: 2 },
    uLow: { value: 0 },
    uTL: { value: 0 },
    uNightK: { value: 1 },
    uAmb: { value: new THREE.Vector3(0.6, 0.55, 0.45) },
    probe: (scene, exposure) => {
      this.lit.probe(scene);
      this.bindTerrainShadow(scene);
      const v = this.lit.value;
      this.shared.uAmb.value.copy(v);
      // dark scene: little light reaches the animals, or the camera has opened up (exposure rises at dusk and night, which is
      // what makes bright coat areas glow against the dark ground)
      this.shared.uLow.value = Math.max(1 - clamp((v.x + v.y + v.z) / 3 / 0.7, 0, 1), smoothstep(1.05, 1.5, exposure));
    },
  };
  private lit = new SceneLit();
  /** The engine's shared uniforms (scene.userData.tgUniforms), found on the first main-view draw; feeds the hill-shadow lookup. */
  private tg: SharedUniforms | null = null;
  /** A species material compiled before `tg` was known (it has no hill shadow until it is rebuilt). */
  private tgMissed = false;
  /** Terrain heights as a texture for the vertex shader (the legs read the ground under their feet within 45 m). */
  private heightTex: THREE.DataTexture;
  /** Rest-pose leg bones by species (quadrupeds only), read from the meshes. */
  private rigs: Array<LegRig | null> = [];
  /** Leg cycles per second of the time-lapse bound by species id (see timelapseHz). */
  private tlHz: number[] = [];
  private dust: Dust;
  /** Soft contact shadow under every ground animal (see models/contact.ts). */
  readonly contact: ContactShadows;
  private kills: KillSites;
  private markers: Markers;
  private slots = new Slots();
  /** Canid extras (R3): mange, the mousing leap, the chorus pose, migrant columns. */
  private cn = new CanidState();
  private cnIn = newIn();
  private cnOut = newOut();
  /** Called when a coyote near the camera starts a mousing leap (x, z): the field notes. */
  onMousingLeap: ((x: number, z: number) => void) | null = null;
  private ws: WeightState = { x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0 };
  private gen = 0;

  private curr: Snapshot | null = null;
  private prev: Snapshot | null = null;
  private currMap = new Map<number, number>();
  private prevMap = new Map<number, number>();
  private currSlot = new Int32Array(0);
  private prevOf = new Int32Array(0);
  private counts = new Int32Array(SPECIES_COUNT);
  private carcassCounts = new Int32Array(SPECIES_COUNT);

  private falls = new Map<number, FallInfo>();
  /** Takedowns still in their struggle (fall time under STRUGGLE_END): a pack mate arriving within POUNCE_R of one lunges at it. Rebuilt each frame. */
  private activeFalls: FallInfo[] = [];
  /** Predators lunging or feeding hard this frame and last frame (x, z pairs): a raven within RAVEN_WOLF_R of one flutters back. */
  private hotCur = new Float32Array(128);
  private hotPrev = new Float32Array(128);
  private hotN = 0;
  private hotPrevN = 0;
  /** Slots of the animals that left the snapshot this time (id to slot), so a body that just died can keep its gait phase. */
  private goneSlot = new Map<number, number>();
  private tmpV = new THREE.Vector3();
  private timeSec = 0;
  /** Seconds of simulated time the layer has run (stops when the sim is paused): drives the raven wander and other display-only schedules. */
  private clock = 0;
  private feeder: FeederPlan = { on: false, tx: 0, tz: 0, cap: SLOT_CAP, face: 0, lie: false, feed: false, fi: null, th: 0, drag: false };
  private raven: RavenPlan = { on: false, px: 0, pz: 0, mode: 0, u: 0, hx: 1, hz: 0, cx: 0, cz: 0 };
  private lastSnapT = -1;
  private snapDt = 0.1;
  private lastAlpha = 1;

  private selectedId: number | null = null;
  private ring: THREE.Mesh;
  private ringGeo: THREE.PlaneGeometry;
  private ringBase: Float32Array;
  private ringMat: THREE.ShaderMaterial;
  private selInfo = { found: false, x: 0, y: 0, z: 0, r: 1 };

  private bindTerrainShadow(scene: THREE.Object3D): void {
    if (this.tg) return;
    const tu = scene.userData?.tgUniforms as SharedUniforms | undefined;
    if (!tu) return;
    this.tg = tu;
    if (this.tgMissed) for (const b of this.live) b.material.needsUpdate = true;
  }

  constructor(world: World) {
    this.world = world;
    this.object3D.name = 'AnimalLayer';
    this.heightTex = new THREE.DataTexture(new Float32Array(world.height), world.hn, world.hn, THREE.RedFormat, THREE.FloatType);
    this.heightTex.needsUpdate = true;
    this.shared.tHeight.value = this.heightTex;
    this.shared.uCell.value = world.cell;
    this.shared.uHN.value = world.hn;
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      const def = getModel(sp);
      if (!def) {
        this.batches.push(null);
        this.rigs.push(null);
        continue;
      }
      this.rigs.push(def.params.kind === 0 ? legRigOf(def.geometry) : null);
      this.tlHz[sp] = def.params.kind === 0 ? timelapseHz(def.params) : 2.6;
      const { material, depth } = makeAnimalMaterials(sp, def, this.shared);
      // animals sit in hill shadow like the terrain and trees do (the depth material casts only, so it needs nothing)
      const baseCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        baseCompile.call(material, shader, renderer);
        if (this.tg) injectTerrainShadow(shader, this.tg);
        else this.tgMissed = true;
      };
      const batch = new Batch(sp, def, material, depth, this.object3D, INITIAL_CAPACITY[sp] ?? 256, this.shared);
      this.batches.push(batch);
      this.live.push(batch);
    }
    this.kills = new KillSites(world, this.lit);
    this.dust = new Dust(this.lit);
    this.markers = new Markers(world.size);
    this.contact = new ContactShadows(this.shared);
    this.object3D.add(this.kills.mesh, this.contact.mesh, this.dust.mesh, this.markers.mesh, this.markers.pingMesh);

    // Selection ring: a crisp thin cream ring with a dark edge on both sides (so it reads on gold grass, snow and dusk alike),
    // hugging the terrain under the selected animal. Its line stays about 2.5 px wide at any camera distance.
    const N = 24;
    this.ringGeo = new THREE.PlaneGeometry(2, 2, N, N);
    this.ringGeo.rotateX(-Math.PI / 2);
    const pos = this.ringGeo.getAttribute('position') as THREE.BufferAttribute;
    this.ringBase = new Float32Array(pos.array as Float32Array);
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          float fw = max(fwidth(r), 1e-4);
          float hw = max(0.028, 1.25 * fw);                // half width of the bright line (uv units, at least ~2.5 px wide)
          float edge = hw + max(0.02, 1.1 * fw);           // outer edge of the dark outline
          float d = abs(r - 0.86);
          float line = 1.0 - smoothstep(hw - fw, hw + fw, d);
          float dark = 1.0 - smoothstep(edge - fw, edge + fw, d);
          float a = max(dark * 0.62, line);
          if (a < 0.01) discard;
          vec3 col = mix(vec3(0.04, 0.025, 0.012), vec3(1.5, 1.32, 0.95), line);
          gl_FragColor = vec4(col, a * uOpacity);
        }`,
    });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 50;
    this.ring.visible = false;
    this.ring.name = 'selection-ring';
    this.ring.onBeforeRender = (_r, scene) => { if (scene.overrideMaterial) this.ringGeo.setDrawRange(0, 0); };
    this.ring.onAfterRender = () => this.ringGeo.setDrawRange(0, Infinity);
    this.object3D.add(this.ring);
  }

  // ---------------------------------------------------------------------------------------------------------
  setSnapshot(snap: Snapshot): void {
    if (snap === this.curr) return;
    // timing between snapshots (render seconds), used for turn rates
    if (this.lastSnapT >= 0 && this.timeSec - this.lastSnapT > 1e-3) {
      this.snapDt += (clamp(this.timeSec - this.lastSnapT, 0.01, 1) - this.snapDt) * 0.3;
    }
    this.lastSnapT = this.timeSec;

    this.prev = this.curr;
    const t = this.prevMap;
    this.prevMap = this.currMap;
    this.currMap = t;
    this.currMap.clear();
    this.curr = snap;

    const n = snap.count;
    if (this.currSlot.length < n) {
      this.currSlot = new Int32Array(Math.max(n, this.currSlot.length * 2));
      this.prevOf = new Int32Array(this.currSlot.length);
    }
    const S = this.slots;
    this.gen++;
    this.counts.fill(0);
    this.carcassCounts.fill(0);
    const ag = snap.agents;
    for (let i = 0; i < n; i++) {
      const id = snap.ids[i];
      this.currMap.set(id, i);
      let slot = S.map.get(id);
      if (slot === undefined) {
        slot = S.alloc();
        S.map.set(id, slot);
        S.fresh[slot] = 1;
        S.phase[slot] = hash01(id * 7 + 3);
        S.sick[slot] = 0;
        S.dust[slot] = 0;
        S.pounce[slot] = -1;
        S.pkey[slot] = -1;
        S.pstop[slot] = STRUGGLE_END;
        S.fox[slot] = 0;
        S.foz[slot] = 0;
        S.fph[slot] = 0.9;
        S.rgw[slot] = 0;
        S.stw[slot] = 0;
        S.stt[slot] = 0;
        S.rph[slot] = 0;
        S.mv[slot] = 0;
        S.rtk[slot] = -1;
        S.wset[slot] = 0;
        S.acc[slot] = 0;
        S.lean[slot] = 0;
        this.cn.reset(slot);
      }
      S.stamp[slot] = this.gen;
      this.currSlot[i] = slot;
      const j = this.prevMap.get(id);
      this.prevOf[i] = j === undefined ? -1 : j;
      const sp = ag[i * AGENT_STRIDE] | 0;
      if (sp >= 0 && sp < SPECIES_COUNT) this.counts[sp]++;
    }
    // migrants that travel together are drawn in a short file (display offsets, R3)
    this.cn.planColumns(ag, n, this.currSlot, (sp) => (this.batches[sp]?.def.params.length ?? 1.5) * this.speciesScale[sp], (sp) => FLIES[sp]);
    // free the slots of animals that are gone
    this.goneSlot.clear();
    for (const [id, slot] of S.map) {
      if (S.stamp[slot] !== this.gen) {
        S.map.delete(id);
        S.free.push(slot);
        this.goneSlot.set(id, slot);
      }
    }
    for (let k = 0; k < snap.carcassCount; k++) {
      const sp = Math.round(snap.carcasses[k * CARCASS_STRIDE + 3]);
      if (sp >= 0 && sp < SPECIES_COUNT) this.carcassCounts[sp]++;
    }
    for (let sp = 0; sp < SPECIES_COUNT; sp++) this.batches[sp]?.ensure(this.counts[sp] + this.carcassCounts[sp], this.object3D);
    this.kills.setSnapshot(snap);
    this.trackFalls(snap, this.prev === null);
    this.lungeScan(snap);
  }

  /**
   * New carcasses are animals that just went down. Find the animal that died (in the previous snapshot) so the body keeps
   * its heading and speed while it stumbles and topples, and set the predators that were on it lunging.
   */
  private trackFalls(snap: Snapshot, first: boolean): void {
    const gen = this.gen;
    const fast = this.timeScale > 3 || first;
    let budget = 6; // at most this many kill reactions per snapshot (a cull can drop dozens of animals at once)
    const P = this.prev ? this.prev.agents : null;
    const pn = this.prev ? this.prev.count : 0;
    for (let k = 0; k < snap.carcassCount; k++) {
      const o = k * CARCASS_STRIDE;
      const cx = snap.carcasses[o], cz = snap.carcasses[o + 1];
      const key = Math.floor(cx * 8) * 65536 + Math.floor(cz * 8);
      let fi = this.falls.get(key);
      if (!fi) {
        const sp = Math.round(snap.carcasses[o + 3]);
        const hseed = hash01((Math.floor(cx * 13) * 73856093) ^ (Math.floor(cz * 13) * 19349663));
        fi = {
          t: 1e3, age: 0, key, sp, rem: snap.carcasses[o + 2], cx, cz, crew: [], crewAt: [], slotTh: [], crewSide: [], sub: 0, th0: hash01(Math.floor(hseed * 4096) + 53) * Math.PI * 2,
          pbest: 0, pdx: 0, pdz: 0, pull: 0, pcx: 0, pcz: 0,
          h: hseed * Math.PI * 2, v: 0, vs: 1, ph: 0, pace: 0, ox: 0, oz: 0, g: gen,
          dragger: 0, h0: 0, dux: 1, duz: 0, dlen: 0, dt0: 0, dt1: 0, dgx: 0, dgz: 0,
        };
        this.falls.set(key, fi);
        if (!fast && P) {
          let bj = -1, bd = 36;
          for (let j = 0; j < pn; j++) {
            const q = j * AGENT_STRIDE;
            if ((P[q] | 0) !== sp) continue;
            const dx = P[q + 1] - cx, dz = P[q + 2] - cz;
            const d = dx * dx + dz * dz;
            if (d < bd) { bd = d; bj = j; }
          }
          if (bj >= 0) {
            const q = bj * AGENT_STRIDE;
            fi.h = P[q + 3]; fi.v = P[q + 4] * VIS_PER_SIM; fi.pace = fi.v;
            fi.vs = P[q + 5] * this.speciesScale[sp];
            const gs = this.goneSlot.get(this.prev!.ids[bj]);
            if (gs !== undefined) {
              fi.ph = this.slots.phase[gs];
              const ox = this.slots.px[gs] - cx, oz = this.slots.pz[gs] - cz;
              if (ox * ox + oz * oz < 25) { fi.ox = ox; fi.oz = oz; }
            }
          }
          fi.t = 0;
          fi.h0 = fi.h;
          if (budget-- > 0) this.killBurst(snap, cx, cz, sp, fi);
        } else fi.h0 = fi.h;
      }
      fi.g = gen;
    }
    for (const [key, fi] of this.falls) if (fi.g !== gen) this.falls.delete(key);
  }

  /** 0..1: how dry the ground at (x, z) is. Damp near water and in the moist hollows, where the soil does not lift. */
  private groundDry(x: number, z: number): number {
    const w = this.world;
    const ci = Math.min(w.n - 1, Math.max(0, Math.floor(x / w.cell))), cj = Math.min(w.n - 1, Math.max(0, Math.floor(z / w.cell)));
    const c = cj * w.n + ci;
    return smoothstep(2, 16, w.waterDist[c]) * (1 - 0.7 * smoothstep(0.55, 0.9, w.moisture[c]));
  }

  /** A small puff of dust where a mousing coyote lands (R3). */
  private landingPuff(x: number, z: number, vs: number): void {
    const w = this.world;
    const dryK = this.dust.dryness * this.groundDry(x, z);
    const n = Math.round(5 * dryK);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.4 * vs;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      this.dust.emit(
        px, sampleHeight(w.height, w.hn, w.cell, px, pz) + 0.1, pz,
        Math.cos(a) * 0.9, 0.3 + Math.random() * 0.4, Math.sin(a) * 0.9,
        (0.35 + Math.random() * 0.3) * vs, 0.6 + Math.random() * 0.5, 0.25 + Math.random() * 0.15, Math.random(), dryK,
      );
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // The coyote chorus (R3). The audio picks a place for a call with chorusSite(), plays the clip there and reports it with startChorus,
  // so the resting coyotes there sit up and sing for exactly as long as the sound lasts. With no audio running (muted, no click yet)
  // the layer makes a chorus of its own at dusk.

  /** The place of a resting coyote within about 300 m of the camera, for a call to come from; null when none is resting. */
  chorusSite(): { x: number; z: number } | null {
    const snap = this.curr;
    if (!snap) return null;
    const A = snap.agents, cp = this.shared.uCamPos.value;
    const near: number[] = [];
    for (let i = 0; i < snap.count; i++) {
      const o = i * AGENT_STRIDE;
      if ((A[o] | 0) !== Sp.Coyote) continue;
      const st = A[o + 7] | 0;
      if ((st !== St.Rest && st !== St.Idle) || A[o + 4] >= 0.3) continue;
      if (Math.hypot(A[o + 1] - cp.x, A[o + 2] - cp.z) > 300) continue;
      near.push(i);
    }
    if (near.length === 0) return null;
    const i = near[Math.floor(Math.random() * near.length)];
    return { x: A[i * AGENT_STRIDE + 1], z: A[i * AGENT_STRIDE + 2] };
  }

  /** A call began at (x, z) and lasts `seconds`: the resting coyotes round it sit up and sing (see canids.ts). */
  startChorus(x: number, z: number, seconds: number): void {
    this.cn.startChorus(x, z, seconds, this.clock, true);
  }

  /** Capture and dev hook: a chorus now at the resting coyote nearest the camera (or at (x, z)). Returns where, or null. */
  debugChorus(seconds = 9, x?: number, z?: number): { x: number; z: number } | null {
    let site: { x: number; z: number } | null = x !== undefined && z !== undefined ? { x, z } : null;
    if (!site) site = this.chorusSite();
    if (site) this.cn.startChorus(site.x, site.z, seconds, this.clock, true);
    return site;
  }

  /** True while a chorus is on. */
  get chorusOn(): boolean {
    return this.cn.choirOn(this.clock);
  }

  /** A kill: a puff of dust from the site, and every hunting predator close by pounces. */
  private killBurst(snap: Snapshot, cx: number, cz: number, sp: number, fi: FallInfo): void {
    const w = this.world;
    const big = sp === Sp.Bison ? 1.6 : sp === Sp.Wolf ? 0.9 : 1;
    // a kill on wet ground, under snow or in the rain raises little or no dust
    const dryK = this.dust.dryness * this.groundDry(cx, cz);
    const n = Math.round((sp === Sp.Bison ? 16 : 10) * dryK);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2 * big;
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      const sp2 = (1.4 + Math.random() * 2.2) * big;
      this.dust.emit(
        px, sampleHeight(w.height, w.hn, w.cell, px, pz) + 0.2, pz,
        Math.cos(a) * sp2 + Math.cos(fi.h) * fi.v * 0.12, 0.4 + Math.random() * 0.9, Math.sin(a) * sp2 + Math.sin(fi.h) * fi.v * 0.12,
        (1.2 + Math.random() * 1.0) * big, 0.9 + Math.random() * 0.9, 0.4 + Math.random() * 0.25, Math.random(), dryK,
      );
    }
    // Every hunter close by lunges, the nearest first (it takes the throat, the next the flank, the next the hindquarter, ...).
    const A = snap.agents, S = this.slots;
    const who: Array<[number, number]> = []; // [distance squared, agent index]
    for (let i = 0; i < snap.count; i++) {
      const o = i * AGENT_STRIDE;
      const s = A[o] | 0;
      if (!HUNTER[s]) continue;
      const st = A[o + 7] | 0;
      if (st !== St.Chase && st !== St.Stalk && st !== St.Eat && !((st === St.Walk || st === St.Run) && A[o + 4] > 0.5)) continue;
      const dx = A[o + 1] - cx, dz = A[o + 2] - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > POUNCE_R * POUNCE_R) continue;
      who.push([d2, i]);
    }
    who.sort((p, q) => p[0] - q[0]);
    for (const [, i] of who) this.joinTakedown(fi, snap.ids[i], this.currSlot[i], 0, A[i * AGENT_STRIDE + 1], A[i * AGENT_STRIDE + 2], A[i * AGENT_STRIDE] | 0);
  }

  /**
   * Where a cougar hauls its kill (R1 item 8): toward the nearest cover within 30 m (a tree's crown, a shrub clump), or else up the
   * steepest ground round it, at most DRAG_MAX m. Pure function of the carcass and the world, so it is the same on every run.
   * Sets fi.dux, duz, dlen (0 = none) and the ages the haul starts and ends.
   */
  private pickDrag(fi: FallInfo): void {
    const w = this.world;
    const x = fi.cx, z = fi.cz;
    fi.dlen = 0;
    let best = Infinity, bx = 0, bz = 0, bleft = 0;
    const T = w.trees, Sh = w.shrubs;
    for (let k = 0; k < T.length; k += 4) {
      const dx = T[k] - x, dz = T[k + 1] - z;
      const d = Math.hypot(dx, dz);
      const left = d - T[k + 3] * 0.6 - 1.2; // metres to get in under the crown
      if (d < 30 && left < best) { best = left; bx = dx / d; bz = dz / d; bleft = left; }
    }
    for (let k = 0; k < Sh.length; k += 3) {
      const dx = Sh[k] - x, dz = Sh[k + 1] - z;
      const d = Math.hypot(dx, dz);
      const left = d - Sh[k + 2] * 0.5 - 1.0;
      if (d < 30 && left < best) { best = left; bx = dx / d; bz = dz / d; bleft = left; }
    }
    let len = 0;
    if (best < Infinity && bleft > 0.3) len = Math.min(DRAG_MAX, bleft);
    else if (best === Infinity) {
      // no cover about: up the steepest ground within 6 m, if there is any worth the effort
      const h0 = sampleHeight(w.height, w.hn, w.cell, x, z);
      let bc = 0.25;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
        const climb = sampleHeight(w.height, w.hn, w.cell, x + ux * 6, z + uz * 6) - h0;
        if (climb > bc) { bc = climb; bx = ux; bz = uz; len = Math.min(DRAG_MAX, 1.2 + 4 * climb); }
      }
    }
    if (len < 0.3) return;
    fi.dux = bx;
    fi.duz = bz;
    fi.dlen = len;
    fi.dt0 = FALL_TIME + DRAG_WAIT;
    fi.dt1 = fi.dt0 + len / DRAG_SPEED;
  }

  /**
   * A predator joins the takedown of `fi` (the prey is going down): it lunges at its own contact point, by arrival order, and
   * holds on until the prey's struggle ends (`fallT` s into the fall now; a late arrival holds for what is left of it).
   */
  private joinTakedown(fi: FallInfo, id: number, slot: number, fallT: number, x: number, z: number, sp: number): void {
    const S = this.slots;
    const p = S.pounce[slot];
    const ending = S.pstop[slot] + POUNCE_RELEASE;
    if (p >= 0 && p <= ending && p >= 0.35 * POUNCE_TIME) return; // already holding on to something
    let idx = fi.crew.indexOf(id);
    if (idx < 0) {
      idx = fi.crew.length;
      fi.crew.push(id);
      fi.crewAt.push(fi.age);
    }
    // the side of the prey it takes: the one it is on (it must not run through the animal), unless two have that side already
    const lz = -Math.sin(fi.h) * (x - fi.cx) + Math.cos(fi.h) * (z - fi.cz);
    let side = lz >= 0 ? 1 : -1;
    let same = 0;
    for (let k = 0; k < idx; k++) if (fi.crewSide[k] === side) same++;
    if (same >= 2 && Math.abs(lz) < 2.5) side = -side;
    fi.crewSide[idx] = side;
    S.pside[slot] = side;
    S.pounce[slot] = 0;
    S.pkey[slot] = fi.key;
    S.pcon[slot] = idx % CONTACT_AX.length;
    S.pstop[slot] = Math.max(POUNCE_SPRING + 0.35, STRUGGLE_END - fallT);
    if (sp === Sp.Cougar) {
      // a cougar goes for the shoulders and the neck (the throat contact) and its hold is short; the first to take the kill drags it off
      S.pcon[slot] = 0;
      S.pstop[slot] = Math.max(POUNCE_SPRING + 0.35, Math.min(1.0, STRUGGLE_END - fallT));
      if (fi.dragger === 0 && fi.t < 1e2) {
        fi.dragger = id;
        this.pickDrag(fi);
      }
    }
    S.ptid[slot] = 0;
    S.ptx[slot] = fi.cx;
    S.ptz[slot] = fi.cz;
  }

  /** A predator in a chase that has caught up with something lunges at it. */
  private lungeScan(snap: Snapshot): void {
    if (this.timeScale <= 0 || this.timeScale > 3) return;
    const A = snap.agents, S = this.slots, n = snap.count;
    for (let i = 0; i < n; i++) {
      const o = i * AGENT_STRIDE;
      const sp = A[o] | 0;
      if (!HUNTER[sp] || (A[o + 7] | 0) !== St.Chase) continue;
      const slot = this.currSlot[i];
      if (S.pounce[slot] >= 0) continue; // already lunging or cooling down
      const x = A[o + 1], z = A[o + 2], hx = Math.cos(A[o + 3]), hz = Math.sin(A[o + 3]);
      for (let j = 0; j < n; j++) {
        const q = j * AGENT_STRIDE;
        const s2 = A[q] | 0;
        if (!LUNGE_TARGET[s2]) continue;
        const dx = A[q + 1] - x, dz = A[q + 2] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 3.6 * 3.6 || d2 < 0.2) continue;
        if (dx * hx + dz * hz < 0.4 * Math.sqrt(d2)) continue; // only prey ahead of it
        S.pounce[slot] = 0;
        S.pkey[slot] = -1;
        S.pcon[slot] = 1; // a flank bite: the contact point of a lunge at live prey is its middle
        S.pstop[slot] = POUNCE_SPRING + 0.4;
        S.ptid[slot] = snap.ids[j];
        S.ptx[slot] = A[q + 1];
        S.ptz[slot] = A[q + 2];
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  /** Index of the carcass nearest (x, z) within r metres in the current snapshot, or -1. */
  private carcassNear(x: number, z: number, r: number): number {
    const snap = this.curr;
    if (!snap) return -1;
    const C = snap.carcasses;
    let best = -1, bd = r * r;
    for (let k = 0; k < snap.carcassCount; k++) {
      const dx = C[k * CARCASS_STRIDE] - x, dz = C[k * CARCASS_STRIDE + 1] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  private fallOfCarcass(k: number): FallInfo | undefined {
    const C = this.curr!.carcasses, o = k * CARCASS_STRIDE;
    return this.falls.get(Math.floor(C[o] * 8) * 65536 + Math.floor(C[o + 1] * 8));
  }

  /** Radii (m) of a carcass's footprint ellipse along its body and across it, as it lies now (it shrinks as it is eaten). */
  private carcassRadii(fi: FallInfo, out: { a: number; b: number }): void {
    const p = this.batches[fi.sp]?.def.params;
    const k = 0.8 + 0.2 * clamp(fi.rem, 0, 1);
    out.a = (p ? 0.5 * p.length : 0.7) * k;
    out.b = (p ? 0.45 * p.height : 0.5) * k;
  }
  private radii = { a: 1, b: 1 };

  /**
   * The slot angle of crew member `idx` (chosen once, in the order they settle at the carcass). The sim stops a predator within 2.2 m
   * of the carcass on whichever side it came from, so they pile up on one side; the display offset is capped, so a slot has to
   * be within reach of the sim position. Each takes the free slot nearest its own bearing, at least SLOT_SEP radians from the
   * slots already taken (fewer if the carcass is crowded), alternating the side it gives way to by id.
   */
  private slotAngle(fi: FallInfo, idx: number, x: number, z: number): number {
    const have = fi.slotTh[idx];
    if (have !== undefined && !Number.isNaN(have)) return have;
    this.carcassRadii(fi, this.radii);
    const ch = Math.cos(fi.h), sh = Math.sin(fi.h);
    const dx = x - fi.cx, dz = z - fi.cz;
    const bearing = Math.atan2(-sh * dx + ch * dz, ch * dx + sh * dz);
    const ra = this.radii.a + 0.8, rb = this.radii.b + 0.8;
    const taken: number[] = [];
    for (let k = 0; k < fi.slotTh.length; k++) if (k !== idx && fi.slotTh[k] !== undefined && !Number.isNaN(fi.slotTh[k])) taken.push(fi.slotTh[k]);
    const sepOf = (th: number): number => {
      let m = 9;
      for (const t of taken) m = Math.min(m, Math.abs(wrapPi(th - t)));
      return m;
    };
    const side = hash01(fi.crew[idx] * 7 + 3) > 0.5 ? 1 : -1;
    let best = bearing, bestScore = -1e9;
    for (let s = 0; s < 40; s++) {
      const off = Math.ceil(s / 2) * 0.2 * (s & 1 ? side : -side);
      const th = bearing + off;
      const lx = Math.cos(th) * ra, lz = Math.sin(th) * rb;
      const wx = fi.cx + ch * lx - sh * lz, wz = fi.cz + sh * lx + ch * lz;
      const reach = Math.hypot(wx - x, wz - z);
      const sep = Math.min(sepOf(th), SLOT_SEP);
      // enough room and within reach wins; else the best compromise (room first, then the shortest walk)
      const score = sep * 10 - Math.max(0, reach - SLOT_CAP) * 6 - Math.abs(off);
      if (score > bestScore) { bestScore = score; best = th; }
      if (sep >= SLOT_SEP && reach <= SLOT_CAP) { best = th; break; }
    }
    while (fi.slotTh.length <= idx) fi.slotTh.push(NaN);
    fi.slotTh[idx] = best;
    return best;
  }

  /**
   * A predator in the Eat state next to a carcass. It takes a radial slot round the body by arrival order (a place on the
   * footprint ellipse at a golden-angle step per arrival, so the slots stay put as more arrive), facing the carcass; the display
   * offset from the sim position is capped at SLOT_CAP. The alpha (or the first to arrive) eats first, the others wait their
   * turn standing at their slot, and one subordinate, chosen by an id hash, lies 4 to 6 m out for 5 to 15 s before it joins.
   */
  private planFeeder(id: number, flags: number, x: number, z: number, out: FeederPlan): void {
    out.on = false; out.lie = false; out.feed = false; out.fi = null; out.drag = false;
    const ci = this.carcassNear(x, z, 3.6);
    if (ci < 0) return;
    const fi = this.fallOfCarcass(ci);
    if (!fi) return;
    if (fi.dragger === id && fi.dlen > 0 && fi.age < fi.dt1 + 0.3) {
      // the cougar hauls its kill toward cover: it walks ahead of the body, facing the way it goes, head down on the neck
      this.carcassRadii(fi, this.radii);
      const lead = this.radii.a * 0.85 + 0.35;
      out.tx = fi.cx + fi.dux * lead;
      out.tz = fi.cz + fi.duz * lead;
      out.cap = SLOT_CAP + fi.dlen + 1.5;
      out.face = Math.atan2(fi.duz, fi.dux);
      out.fi = fi;
      out.th = 0;
      out.drag = true;
      out.on = true;
      return;
    }
    let idx = fi.crew.indexOf(id);
    if (idx < 0) {
      // while the prey is still fighting a newcomer lunges instead (update: the arrival scan)
      if (fi.t > 0 && fi.t < STRUGGLE_END - 0.2) return;
      idx = fi.crew.length;
      fi.crew.push(id);
      fi.crewAt.push(fi.age);
    }
    const arrive = fi.crewAt[idx];
    const alpha = (flags & F_ALPHA) !== 0;
    const hs = hash01(id * 17 + 5);
    if (fi.sub === 0 && !alpha && idx > 0 && hs > 0.4) fi.sub = id;
    const fresh = fi.t < 1e2; // seen going down, not lying there before the layer started
    // when it starts to eat: the lead after the prey is down, the rest in turn, a late arrival soon after it gets there
    const lead = alpha || idx === 0;
    let start = fresh ? (lead ? FALL_TIME + 0.4 : FALL_TIME + 1.4 + 0.9 * Math.min(idx, 5) + 2 * hs) : arrive + 0.4 + (lead ? 0 : 0.8 + hs);
    if (fi.dlen > 0 && fresh) start = Math.max(start, fi.dt1 + 0.5); // nobody feeds until the cougar has hauled the kill into cover
    let far = false;
    if (id === fi.sub) {
      // lies out and waits 5 to 15 s from when it got there (never before the prey is down)
      const t0 = fresh ? Math.max(arrive, STRUGGLE_END + 1.2) : arrive;
      const joinAt = t0 + 5 + 10 * hash01(id * 29 + 1);
      if (fi.age < joinAt) far = true;
      start = Math.max(start, joinAt);
    }
    this.carcassRadii(fi, this.radii);
    const th = this.slotAngle(fi, idx, x, z);
    const ct = Math.cos(th), st = Math.sin(th);
    let lx: number, lz: number;
    if (far) {
      const R = 4 + 2 * hash01(id * 13 + 9);
      lx = ct * R; lz = st * R;
    } else {
      lx = ct * (this.radii.a + 0.8); lz = st * (this.radii.b + 0.8);
    }
    const ch = Math.cos(fi.h), sh = Math.sin(fi.h);
    out.tx = fi.cx + ch * lx - sh * lz;
    out.tz = fi.cz + sh * lx + ch * lz;
    out.cap = (far ? SUB_CAP : SLOT_CAP) + (fi.dlen > 0 ? fi.dlen + 1 : 0); // (the body may have been hauled up to DRAG_MAX m from where the sim has it)
    out.face = Math.atan2(fi.cz - out.tz, fi.cx - out.tx);
    out.lie = far;
    out.feed = !far && fi.age >= start;
    out.fi = fi;
    out.th = th;
    out.on = true;
  }

  /**
   * A raven on the ground at a carcass wanders about it: it stands and pecks, then moves on, by a two-footed hop (short moves, the
   * wings flicked) or a few walking steps (longer ones). A schedule of waypoints round the carcass, deterministic in the layer clock
   * and the raven's id (no state), so nothing needs storing between frames.
   */
  private planRaven(id: number, x: number, z: number, out: RavenPlan): void {
    out.on = false;
    const ci = this.carcassNear(x, z, 4.5);
    if (ci < 0) return;
    const fi = this.fallOfCarcass(ci);
    if (!fi) return;
    this.carcassRadii(fi, this.radii);
    const segLen = 3.2 + 1.6 * hash01(id * 3 + 1);
    const tt = this.clock + hash01(id * 5 + 2) * segLen * 40;
    const s = Math.floor(tt / segLen), tau = tt - s * segLen;
    const R = this.radii;
    const spot = (n: number, o: number[]): void => {
      const a = 6.2832 * hash01(id * 17 + 5) + 1.1 * Math.sin(0.7 * n + 6 * hash01(id * 29 + 3));
      const ca = Math.cos(a), sa = Math.sin(a);
      const rs = 1 / Math.sqrt((ca / (R.a + 0.3)) ** 2 + (sa / (R.b + 0.3)) ** 2);
      const r = rs + 0.5 + hash01(Math.imul(n, 7919) + id * 131 + 11);
      o[0] = ca * r; o[1] = sa * r;
    };
    const w0 = this.rvA, w1 = this.rvB;
    spot(s - 1, w0);
    spot(s, w1);
    const dx = w1[0] - w0[0], dz = w1[1] - w0[1];
    const dist = Math.hypot(dx, dz);
    const hop = dist < 1.4 && hash01(Math.imul(s, 104729) + id * 7 + 3) > 0.25;
    const dur = hop ? 0.28 + 0.12 * dist : Math.min(segLen * 0.72, dist / 0.6);
    const u = clamp(tau / dur, 0, 1);
    const e = hop ? u * u * (3 - 2 * u) : u;
    const lx = w0[0] + dx * e, lz = w0[1] + dz * e;
    const ch = Math.cos(fi.h), sh = Math.sin(fi.h);
    out.cx = fi.cx; out.cz = fi.cz;
    out.px = fi.cx + ch * lx - sh * lz;
    out.pz = fi.cz + sh * lx + ch * lz;
    out.mode = tau < dur ? (hop ? 1 : 2) : 0;
    out.u = u;
    const l = dist || 1;
    out.hx = ch * (dx / l) - sh * (dz / l);
    out.hz = sh * (dx / l) + ch * (dz / l);
    out.on = true;
  }
  private rvA = [0, 0];
  private rvB = [0, 0];

  // ---------------------------------------------------------------------------------------------------------
  update(dt: number, alpha: number, timeSec: number): void {
    this.timeSec = timeSec;
    this.uTime.value = timeSec % 4096;
    dt = clamp(dt, 0, 0.1);
    alpha = clamp(alpha, 0, 1);
    this.lastAlpha = alpha;
    const snap = this.curr;
    if (!snap) return;
    const prev = this.prev;
    const A = snap.agents;
    const P = prev ? prev.agents : null;
    const S = this.slots;
    const world = this.world;
    const H = world.height, hn = world.hn, cell = world.cell;
    const k8 = 1 - Math.exp(-dt * 8);
    const kHead = 1 - Math.exp(-dt / 0.3);
    const kLie = 1 - Math.exp(-dt / 0.9);
    const kCrouch = 1 - Math.exp(-dt / 0.5);
    const kBank = 1 - Math.exp(-dt * 3);
    const snapDt = this.snapDt;
    const sel = this.selectedId;
    this.selInfo.found = false;
    const kSick = 1 - Math.exp(-dt / 2.5);
    const kBdy = 1 - Math.exp(-dt / 0.12);
    const groundAt = (gx: number, gz: number): number => sampleHeight(H, hn, cell, gx, gz);
    const running = this.timeScale > 0 ? dt : 0;
    this.dust.update(running);
    this.markers.begin();
    const dustRate = Math.min(this.timeScale, 3);
    // time-lapse (see timelapseK in models/legmath.ts): 0 up to 3x, 1 from 8x. Drives the bound pose, the cadence and the landing dust.
    const tl = timelapseK(this.timeScale);
    this.shared.uTL.value = tl;
    let tlBudget = tl > 0.05 ? TL_PUFFS_PER_FRAME : 0;
    this.contact.begin();
    this.clock += running;
    const clock = this.clock;
    // at dusk, with no audio calling for a while, the coyotes sing now and then on their own (render/canids.ts)
    this.cn.maybeSelfChorus(clock, sunHeight(snap.env.dayFrac) < 0.12, this.timeScale, () => this.chorusSite());
    for (const fi of this.falls.values()) fi.pbest = 0;
    {
      const t = this.hotPrev;
      this.hotPrev = this.hotCur;
      this.hotCur = t;
      this.hotPrevN = this.hotN;
      this.hotN = 0;
    }

    for (const b of this.live) {
      b.count = 0;
      b.alive = 0;
    }

    const n = snap.count;
    for (let i = 0; i < n; i++) {
      const o = i * AGENT_STRIDE;
      const sp = A[o] | 0;
      if (sp < 0 || sp >= SPECIES_COUNT) continue;
      const b = this.batches[sp];
      if (!b) continue; // no model for this species: not drawn
      const pr = b.def.params;
      const id = snap.ids[i];
      const slot = this.currSlot[i];
      const x1 = A[o + 1], z1 = A[o + 2], h1 = A[o + 3];
      const spd1 = A[o + 4], sc1 = A[o + 5], coat = A[o + 6];
      const state = A[o + 7] | 0, alt1 = A[o + 9];

      // interpolate against the previous snapshot
      let x = x1, z = z1, h = h1, alt = alt1, sc = sc1, climb = 0;
      const j = this.prevOf[i];
      if (j >= 0 && P) {
        const q = j * AGENT_STRIDE;
        const dx = x1 - P[q + 1], dz = z1 - P[q + 2];
        if (dx * dx + dz * dz < 900) {
          x = P[q + 1] + dx * alpha;
          z = P[q + 2] + dz * alpha;
        }
        const dh = wrapPi(h1 - P[q + 3]);
        h = P[q + 3] + dh * alpha;
        alt = P[q + 9] + (alt1 - P[q + 9]) * alpha;
        climb = (alt1 - P[q + 9]) / snapDt;
        sc = P[q + 5] + (sc1 - P[q + 5]) * alpha;
      }

      // The drawn path is a critically damped follower of the interpolated one (about 70 ms behind). Snapshots arrive in uneven
      // bursts, so the raw path surges and stalls from frame to frame (the displayed speed of a sprinting wolf varied by
      // 40% frame to frame); the legs, locked to the distance drawn, then lurch with it and read as sliding. Smoothed, the
      // body travels at a steady pace and the stride follows it.
      // (S.px is where it was drawn, display offset included, so the offset applied last frame is taken out first)
      if (!S.fresh[slot]) {
        const om = 22 * Math.min(12, Math.max(1, this.timeScale));
        // (an animal on the weight follower below springs from where this smoothing left it last frame, not from where the follower drew it)
        const own = ACCEL[sp] > 0 && S.wset[slot] === 1;
        const ax = (own ? S.wtx[slot] : S.px[slot] - S.fox[slot] - this.cn.appliedX(slot)) - x, az = (own ? S.wtz[slot] : S.pz[slot] - S.foz[slot] - this.cn.appliedZ(slot)) - z;
        if (ax * ax + az * az < 900) {
          const bx = S.svx[slot] + om * ax, bz = S.svz[slot] + om * az;
          const e = Math.exp(-om * dt);
          S.svx[slot] = (S.svx[slot] - om * bx * dt) * e;
          S.svz[slot] = (S.svz[slot] - om * bz * dt) * e;
          x += (ax + bx * dt) * e;
          z += (az + bz * dt) * e;
        } else { S.svx[slot] = 0; S.svz[slot] = 0; }
      }

      // Weight (R1 item 7): the smoothed path above is what the sim says; the animal is drawn on a follower that may only pick its
      // speed up at the species' acceleration cap, so it lumbers (a bison) or springs (a pronghorn) into a run and leans into it.
      // It trails the sim path by at most WEIGHT_HARD m and catches up as the lag grows. Paused and in a time-lapse the cap is off.
      const accCap = ACCEL[sp];
      if (accCap > 0) {
        const ts = this.timeScale;
        if (dt < 1e-4 && S.wset[slot] === 1 && !S.fresh[slot] && ts > 0 && ts <= 2.5) {
          // a redraw with no time passing (a capture): keep the follower where it is
          x = S.wx[slot];
          z = S.wz[slot];
        } else if (S.wset[slot] === 0 || S.fresh[slot] || ts <= 0 || ts > 2.5 || dt < 1e-4) {
          S.wx[slot] = x; S.wz[slot] = z; S.wtx[slot] = x; S.wtz[slot] = z; S.wvx[slot] = 0; S.wvz[slot] = 0;
          S.wset[slot] = ts > 0 && ts <= 2.5 && !S.fresh[slot] ? 1 : 0;
          S.acc[slot] *= Math.exp(-dt * 4);
        } else {
          const ws = this.ws;
          ws.x = S.wx[slot]; ws.z = S.wz[slot]; ws.vx = S.wvx[slot]; ws.vz = S.wvz[slot]; ws.tx = S.wtx[slot]; ws.tz = S.wtz[slot];
          const lsc = Math.max(1, ts);
          const rate = weightStep(ws, x, z, dt, accCap * ts * ts, WEIGHT_LAG0 * lsc, WEIGHT_LAG * lsc, WEIGHT_HARD * lsc);
          S.wx[slot] = ws.x; S.wz[slot] = ws.z; S.wvx[slot] = ws.vx; S.wvz[slot] = ws.vz; S.wtx[slot] = ws.tx; S.wtz[slot] = ws.tz;
          S.acc[slot] += (rate / (ts * ts) - S.acc[slot]) * (1 - Math.exp(-dt / 0.18));
          x = ws.x;
          z = ws.z;
        }
      }

      // Display offsets from the sim position (render side only; the sim never sees them): a predator at a carcass takes its slot
      // round it, a raven wanders about it and flutters back from a wolf that lunges or feeds close by.
      const hunter = HUNTER[sp], flier = FLIES[sp];
      const groundedBird = flier && alt < 0.3 && state !== St.Fly;
      const fd = this.feeder, rv = this.raven;
      fd.on = false;
      fd.drag = false;
      rv.on = false;
      let wantX = 0, wantZ = 0, capOff = SLOT_CAP, direct = false, rvFlut = 0;
      if (hunter && state === St.Eat && !(S.pounce[slot] >= 0 && S.pounce[slot] < S.pstop[slot] + POUNCE_RELEASE)) {
        this.planFeeder(id, A[o + 8] | 0, x, z, fd);
        if (fd.on) { wantX = fd.tx - x; wantZ = fd.tz - z; capOff = fd.cap; }
      } else if (groundedBird && state === St.Eat) {
        this.planRaven(id, x, z, rv);
        if (rv.on) {
          S.rgw[slot] += (1 - S.rgw[slot]) * (1 - Math.exp(-running / 1.4));
          if (clock >= S.stt[slot] && this.hotPrevN > 0 && S.rgw[slot] > 0.5) {
            // a wolf lunging or feeding within 2 m: flutter back 1 to 2 m, away from it, and keep clear for a few seconds
            const rx = S.px[slot], rz = S.pz[slot];
            for (let q = 0; q < this.hotPrevN; q++) {
              const ddx = rx - this.hotPrev[q * 2], ddz = rz - this.hotPrev[q * 2 + 1];
              const dd = Math.hypot(ddx, ddz);
              if (dd >= RAVEN_WOLF_R) continue;
              const mag = 1 + hash01(id * 43 + Math.floor(clock * 3));
              const ang = dd > 0.05 ? Math.atan2(ddz, ddx) : hash01(id * 61 + 7) * Math.PI * 2;
              S.stx[slot] = Math.cos(ang) * mag;
              S.stz[slot] = Math.sin(ang) * mag;
              S.stt[slot] = clock + 3 + 2 * hash01(id * 47 + Math.floor(clock));
              break;
            }
          }
          const scared = clock < S.stt[slot];
          S.stw[slot] += ((scared ? 1 : 0) - S.stw[slot]) * (1 - Math.exp(-running * (scared ? 6 : 0.7)));
          rvFlut = scared ? clamp((1 - S.stw[slot]) * 2.5, 0, 1) : 0;
          wantX = S.rgw[slot] * (rv.px - x) + S.stw[slot] * S.stx[slot];
          wantZ = S.rgw[slot] * (rv.pz - z) + S.stw[slot] * S.stz[slot];
          direct = true;
        }
      }
      if (!rv.on) { S.rgw[slot] *= Math.exp(-running * 2); S.stw[slot] *= Math.exp(-running * 2); }
      let offX = wantX, offZ = wantZ, offSpd = 0, offRem = 0;
      if (direct) {
        offX = clamp(offX, -6, 6);
        offZ = clamp(offZ, -6, 6);
      } else {
        const wl = Math.hypot(wantX, wantZ);
        if (wl > capOff) { wantX *= capOff / wl; wantZ *= capOff / wl; }
        // walk to it at a walking pace (a predator), or return quickly when there is nothing to do there any more
        const dx = wantX - S.fox[slot], dz = wantZ - S.foz[slot];
        const dl = Math.hypot(dx, dz);
        const step = Math.min(dl, (fd.drag ? Math.min(2.4, 0.9 + dl * 2.5) : hunter ? Math.min(1.9, 0.5 + dl * 1.2) : 3) * running);
        if (dl > 1e-5) { offX = S.fox[slot] + (dx / dl) * step; offZ = S.foz[slot] + (dz / dl) * step; } else { offX = S.fox[slot]; offZ = S.foz[slot]; }
        offSpd = running > 0 ? step / running : 0;
        offRem = dl - step;
      }
      S.fox[slot] = offX;
      S.foz[slot] = offZ;
      x += offX;
      z += offZ;
      // Canids (R3): mange, the coyote's mousing leap and chorus pose, and the file of a migrating group (display offsets)
      const cnO = this.cnOut;
      let cnOn = false;
      if (CANID[sp] || (!flier && ((A[o + 8] | 0) & F_MIGRANT) !== 0)) {
        const ci = this.cnIn;
        ci.slot = slot; ci.id = id; ci.sp = sp; ci.state = state; ci.spd = spd1; ci.flags = A[o + 8] | 0; ci.energy = A[o + 10];
        ci.x = x; ci.z = z; ci.h = h; ci.dt = dt; ci.running = running; ci.timeScale = this.timeScale; ci.clock = clock; ci.vs = sc * this.speciesScale[sp];
        this.cn.step(ci, cnO);
        x += cnO.ox;
        z += cnO.oz;
        cnOn = true;
        if (cnO.leapStarted && this.onMousingLeap) {
          const cpn = this.shared.uCamPos.value;
          if (Math.hypot(x - cpn.x, z - cpn.z) < 140) this.onMousingLeap(x, z);
        }
        if (cnO.landed && dt > 0) this.landingPuff(x, z, sc * this.speciesScale[sp]);
      } else cnO.pack = cnO.howl = cnO.air = cnO.lift = cnO.pitch = cnO.spd = 0;
      if (fd.on) h = fd.face; // it faces the carcass from its slot
      else if (rv.on) h = rv.mode > 0 ? Math.atan2(rv.hz, rv.hx) : Math.atan2(rv.cz - z, rv.cx - x);

      // the terrain under the drawn position: the leg cycle runs on the distance along the ground, and the pose below uses it
      const g0 = sampleHeight(H, hn, cell, x, z);

      // animation state targets
      // gait style follows the animal's own pace (walk, trot, gallop), not the time-lapse factor
      // (a predator walking to its slot round a carcass moves at the pace of that walk)
      const spdT = this.timeScale > 0 ? Math.max(spd1 * VIS_PER_SIM, hunter ? offSpd : 0, cnO.spd) : 0;
      let hdT = 0, lieT = 0, crT = 0;
      let flapT = 0;
      if (state === St.Graze || state === St.Eat || state === St.Drink) hdT = 1;
      if (state === St.Rest) lieT = 1;
      if (state === St.Stalk) crT = 1;
      // a stampede runs head-low (R1 item 7)
      if (sp === Sp.Bison && (state === St.Flee || state === St.Run)) hdT = 0.55 * smoothstep(5.5, 9, spdT);
      if (fd.on) {
        // waiting its turn at its slot: head up, watching; the subordinate lies down once it has reached its place 4 to 6 m out
        hdT = fd.feed ? 1 : fd.drag ? 0.9 : 0; // (hauling a kill: the head down, the neck in its jaws)
        lieT = fd.lie && offRem < 0.3 ? 1 : 0;
      }
      // a coyote at a carcass looks up warily every 2 to 3 s (and stops the bite while it does); one singing sits up
      const gl = sp === Sp.Coyote && state === St.Eat ? this.cn.glance(id, clock) : 0;
      if (gl > 0.001) hdT *= 1 - gl;
      if (cnOn && (cnO.howlWant || cnO.howl > 0.4)) { lieT = 0; hdT = 0; }
      if (flier) {
        const grounded = groundedBird;
        crT = grounded ? 1 : 0; // wing fold
        hdT = grounded && state === St.Eat ? 1 : 0;
        flapT = grounded ? 0 : alt < 6 ? 1 : 0.1;
        lieT = 0;
      }
      if (S.fresh[slot]) {
        S.wasG[slot] = groundedBird ? 1 : 0;
        S.fresh[slot] = 0;
        S.px[slot] = x;
        S.pz[slot] = z;
        S.pgy[slot] = g0;
        S.bdy[slot] = 0;
        S.hs[slot] = h;
        S.hw[slot] = 0;
        S.spd[slot] = spdT;
        S.vis[slot] = 0;
        S.hdn[slot] = hdT;
        S.lie[slot] = lieT;
        S.crouch[slot] = crT;
        S.flap[slot] = flapT;
        S.tug[slot] = 0;
        S.hunt[slot] = 0;
      }
      // The distance actually drawn since the last frame. The legs are locked to it (cadence = distance / stride), so a
      // planted foot stands still on the ground whatever the sim rate, time scale or snapshot jitter.
      let ds = Math.hypot(x - S.px[slot], z - S.pz[slot]);
      if (ds > 30) ds = 0; // a teleport (respawn, new world), not a step
      // on a slope the body travels further along the ground than its shadow does (1 / cos(20 deg) = +6%): the feet move by that
      const dsGround = pr.kind === 0 && ds > 0 ? Math.hypot(ds, g0 - S.pgy[slot]) : ds;
      S.px[slot] = x;
      S.pz[slot] = z;
      S.pgy[slot] = g0;
      const visT = dt > 1e-4 ? ds / dt : 0;
      // a predator at a carcass whose turn has not come (or that waits out of the way) is not eating yet
      const feeding = state === St.Eat && ((hunter && (!fd.on || fd.feed)) || (flier && hdT > 0)) && this.timeScale > 0 && gl < 0.5;
      const hunting = HUNTER[sp] && this.timeScale > 0 ? (state === St.Chase || state === St.Stalk ? 1 : state === St.Eat ? 0.6 : 0) : 0;
      S.tug[slot] += ((feeding ? 1 : 0) - S.tug[slot]) * kHead;
      // predators: how hard it is hunting; ravens: how hard they are climbing (they flap steadily then, glide otherwise)
      const huntT = FLIES[sp] ? (alt > 0.3 ? clamp(climb / 1.2, 0, 1) : 0) : hunting;
      S.hunt[slot] += (huntT - S.hunt[slot]) * kHead;
      S.spd[slot] += (spdT - S.spd[slot]) * k8;
      S.vis[slot] += (visT - S.vis[slot]) * k8;
      S.hdn[slot] += (hdT - S.hdn[slot]) * kHead;
      S.lie[slot] += (lieT - S.lie[slot]) * kLie;
      S.crouch[slot] += (crT - S.crouch[slot]) * kCrouch;
      S.flap[slot] += (flapT - S.flap[slot]) * kHead;
      const sickT = (A[o + 8] | 0) & F_INFECTED ? 0.98 : 0;
      S.sick[slot] += (sickT - S.sick[slot]) * kSick;
      const sickK = S.sick[slot];
      const spdS = S.spd[slot];

      // Feeding cycle (bite, pull back, shake, swallow with the head up), once per 2.5 to 4 s; the carcass flank dents with each pull.
      let holdE = 0;
      if (hunter) {
        if (feeding) S.fph[slot] = (S.fph[slot] + running / (FEED_MIN + FEED_VAR * hash01(id * 11 + 5))) % 1;
        if (fd.on && fd.fi && feeding && S.tug[slot] > 0.4) {
          const pull = feedPull(S.fph[slot]) * S.tug[slot];
          const fi = fd.fi;
          if (pull > fi.pbest) {
            // the hide stretches toward the feeder: the pull is at the footprint edge in the direction of its slot
            this.carcassRadii(fi, this.radii);
            fi.pbest = pull;
            fi.pdx = Math.cos(fd.th) * this.radii.a * 0.8;
            fi.pdz = Math.sin(fd.th) * this.radii.b * 0.8;
          }
        }
      }

      // Takedown: the predator springs onto the prey (over POUNCE_SPRING), holds on until the prey's struggle ends, then lets go.
      // `pounceE` is the whole envelope (the leap), `holdE` the part where it has hold and shakes it. Then a short cooldown.
      let pounceE = 0, leapE = 0;
      if (S.pounce[slot] >= 0) {
        S.pounce[slot] += running;
        const p = S.pounce[slot], ps = S.pstop[slot];
        if (p < ps + POUNCE_RELEASE) {
          pounceE = smoothstep(0, POUNCE_SPRING, p) * (1 - smoothstep(ps, ps + POUNCE_RELEASE, p));
          holdE = smoothstep(POUNCE_SPRING * 0.8, POUNCE_SPRING * 1.25, p) * (1 - smoothstep(ps - 0.2, ps, p));
          // the leap itself (the rear-up and the reach of the forelegs) is only the spring onto the prey: it falls away as the hold
          // takes over and never returns when the hold lets go
          leapE = smoothstep(0, POUNCE_SPRING, p) * (1 - smoothstep(POUNCE_SPRING, POUNCE_SPRING + 0.35, p));
        }
        if (p > ps + POUNCE_RELEASE + POUNCE_COOL) S.pounce[slot] = -1;
      }
      if (hunter && this.activeFalls.length > 0 && (S.pounce[slot] < 0 || S.pounce[slot] > S.pstop[slot] + POUNCE_RELEASE)
        && (state === St.Chase || state === St.Stalk || state === St.Eat || ((state === St.Walk || state === St.Run) && spd1 > 0.5))) {
        // a pack mate arriving while the prey is still fighting lunges at it too, at a contact point of its own
        for (const fa of this.activeFalls) {
          const dx = fa.cx - x, dz = fa.cz - z;
          if (dx * dx + dz * dz < POUNCE_R * POUNCE_R && fa.crew.indexOf(id) < 0) { this.joinTakedown(fa, id, slot, fa.t, x, z, sp); break; }
        }
      }
      if (pounceE > 0.001) {
        // The lunge connects: the predator is carried to its contact point on the prey and turned onto it, so it ends with its
        // forelegs on the shoulder or flank instead of beside it (the sim only keeps it within a couple of metres).
        let tx = S.ptx[slot], tz = S.ptz[slot], fcx = 0, fcz = 0, stand = false;
        const pf =S.pkey[slot] >= 0 ? this.falls.get(S.pkey[slot]) : undefined;
        if (pf) {
          // on the fallen animal: a point along its body (throat, flank, hindquarter, ...) in its own frame
          const pp = this.batches[pf.sp]?.def.params;
          const fl = clamp(pf.t / FALL_TIME, 0, 1);
          const pls = pf.t < 1e2 ? pf.vs * (1 - fl) + fl : 1;
          // (spread at least a wolf's body length apart even on a calf, or the pack mates stack up on one spot)
          const ci = S.pcon[slot] % CONTACT_AX.length;
          const cougar = sp === Sp.Cougar;
          const along = cougar ? 0.5 * 0.5 * (pp ? pp.length : 1.5) * pls : CONTACT_AX[ci] * Math.max(0.5 * (pp ? pp.length : 1.5) * pls, 1.5);
          // it stands beside the prey on its side (the throat from the front quarter), muzzle on the contact point
          // (a cougar stands close in at the shoulder, forelegs up on it, head down on the neck)
          const side = S.pside[slot];
          const sx = cougar ? along - 0.15 : along + (ci === 0 ? 0.6 : 0);
          const sz = side * (cougar ? 0.18 * (pp ? pp.height : 1) * pls + 0.6 : (ci === 0 ? 0.55 : 1) * (0.3 * (pp ? pp.height : 1) * pls) + (ci === 0 ? 0.8 : 1.0));
          const pch = Math.cos(pf.h), psh = Math.sin(pf.h);
          tx = pf.cx + pch * sx - psh * sz;
          tz = pf.cz + psh * sx + pch * sz;
          fcx = pf.cx + pch * along; fcz = pf.cz + psh * along;
          stand = true;
        } else if (S.ptid[slot] !== 0 && this.getPosition(S.ptid[slot], this.tmpV)) { tx = this.tmpV.x; tz = this.tmpV.z; S.ptx[slot] = tx; S.ptz[slot] = tz; }
        const ddx = tx - x, ddz = tz - z, dd = Math.hypot(ddx, ddz);
        if (dd > 0.05 && dd < 14) {
          const pull = (stand ? dd : Math.max(0, dd - CONTACT_D * (sp === Sp.Cougar ? 1.1 : 1))) * pounceE;
          x += (ddx / dd) * pull;
          z += (ddz / dd) * pull;
          const fx0 = stand ? fcx - x : ddx, fz0 = stand ? fcz - z : ddz;
          h += wrapPi(Math.atan2(fz0, fx0) - h) * Math.min(1, pounceE * 1.1);
        }
      }
      if (hunter && this.hotN < 63 && (pounceE > 0.3 || (feeding && S.tug[slot] > 0.5))) {
        this.hotCur[this.hotN * 2] = x;
        this.hotCur[this.hotN * 2 + 1] = z;
        this.hotN++;
      }

      // Ravens at a carcass: a two-footed hop (wings flicked) or a few walking steps between pecks (the plan sets the moves; the
      // feet follow the distance drawn), and a takeoff starts with a deep downstroke flare.
      let rvHopU = -1, rvWalk = -1, rvLift = 0, takeoffK = 0;
      if (flier) {
        if (S.wasG[slot] === 1 && !groundedBird) S.rtk[slot] = 0;
        S.wasG[slot] = groundedBird ? 1 : 0;
        if (S.rtk[slot] >= 0) {
          S.rtk[slot] += running;
          if (S.rtk[slot] > TAKEOFF_TIME) S.rtk[slot] = -1;
          else takeoffK = 1 - smoothstep(0.3, TAKEOFF_TIME, S.rtk[slot]);
        }
        const hopping = rv.on && rv.mode === 1;
        const moving = hopping || (rv.on && visT > 0.12);
        S.mv[slot] += ((moving ? 1 : 0) - S.mv[slot]) * k8;
        if (hopping) {
          rvHopU = rv.u;
          rvLift = 0.22 * 4 * rv.u * (1 - rv.u);
        } else if (rv.on && visT > 0.12) {
          S.rph[slot] = (S.rph[slot] + ds / 0.26) % 1;
          rvWalk = S.rph[slot];
        }
        if (rvFlut > 0) rvLift += 0.3 * 4 * rvFlut * (1 - rvFlut);
      }
      // a creature that is not actually going anywhere (blocked, turning on the spot) stands rather than marching in place
      const gaitSpd1 = Math.min(spdS, S.vis[slot] * 1.6 + 0.15);
      // time-lapse: the pose follows the apparent speed (blended in from 3x to 8x), see timelapseGaitSpd
      const tlK = pr.kind <= 1 ? tl : 0;
      const gaitSpd = tlK > 0 ? timelapseGaitSpd(pr, gaitSpd1, S.vis[slot], tlK) : gaitSpd1;
      // the model is drawn scaled (species readability boost, age, size), and its stride scales with it
      const vs = sc * this.speciesScale[sp];
      // the vertex shader scales an animal that would be a few pixels long (distance readability, ModelDef.minPx): its stride
      // grows with it, so the legs run at the matching slower cadence
      const camP = this.shared.uCamPos.value;
      const camD = Math.hypot(x - camP.x, g0 - camP.y, z - camP.z);
      const sizeBoost = pr.kind === 0 ? legBoost(pr, vs, camD, this.shared.uPxK.value) : 1;
      let dph = Math.min(dsGround / (strideFor(pr, gaitSpd) * vs * sizeBoost), MAX_CADENCE * dt);
      if (tlK > 0) {
        // the bound rate replaces the distance lock as the time-lapse takes over: a readable few Hz (each animal a little off the
        // others so a herd does not bound in step) that runs only while the animal is actually travelling
        const hz = this.tlHz[sp] * (0.88 + 0.24 * hash01(id * 7 + 3));
        dph += (hz * dt * smoothstep(1.5, 5, S.vis[slot]) - dph) * tlK;
      }
      S.phase[slot] = (S.phase[slot] + dph) % 1;

      // The drawn heading is a critically damped follower of the sim heading, rate limited, so a turn is a curve with some
      // momentum behind it rather than a snap on a central pivot.
      {
        const tn = TURN[sp];
        const om = tn[0];
        const steps = Math.max(1, Math.ceil(dt / 0.02)), sdt = dt / steps;
        let hs = S.hs[slot], hw = S.hw[slot];
        for (let s = 0; s < steps; s++) {
          hw += (om * om * wrapPi(h - hs) - 2 * om * hw) * sdt;
          hw = clamp(hw, -tn[1], tn[1]);
          hs += hw * sdt;
        }
        S.hs[slot] = wrapPi(hs);
        S.hw[slot] = hw;
      }
      const hd = S.hs[slot];
      const turnRate = S.hw[slot];

      // pose on the terrain
      const ch = Math.cos(hd), sh = Math.sin(hd);
      const ground = g0;
      let pitch = 0, roll = 0, y = ground;
      if (FLIES[sp]) {
        y = ground + alt;
        const v = Math.max(spdT, 0.5);
        const bankT = clamp(Math.atan((v * turnRate) / 9.81), -BANK_MAX[sp], BANK_MAX[sp]);
        S.bank[slot] += (bankT - S.bank[slot]) * kBank;
        roll = S.bank[slot];
        const pT = clamp(Math.atan2(climb, v), -0.5, 0.5);
        S.pitch[slot] += (pT - S.pitch[slot]) * kBank;
        pitch = alt > 0.3 ? S.pitch[slot] : 0;
        if (alt <= 0.3) {
          pitch = 0;
          roll = 0;
        } else if (alt > 2) {
          // a bird aloft never holds a line: it rides thermals, rocks and trims, each at its own slow rhythm
          const wv = hash01(id) * 40, aloft = Math.min(1, alt / 6);
          y += Math.sin(this.timeSec * 0.31 + wv) * Math.min(1.2, alt * 0.15);
          roll += 0.07 * aloft * Math.sin(this.timeSec * 0.53 + wv * 1.7);
          pitch += 0.05 * aloft * Math.sin(this.timeSec * 0.41 + wv * 2.3);
        }
        y += rvLift * vs;
        pitch += takeoffK * 0.45; // the beak comes up with the first beats
      } else {
        const hl = pr.length * 0.3 * vs, hw = 0.12 * Math.max(pr.length, 1) * vs + 0.05;
        const hF = sampleHeight(H, hn, cell, x + ch * hl, z + sh * hl);
        const hB = sampleHeight(H, hn, cell, x - ch * hl, z - sh * hl);
        pitch = Math.atan2(hF - hB, 2 * hl);
        const hR = sampleHeight(H, hn, cell, x - sh * hw, z + ch * hw);
        const hL = sampleHeight(H, hn, cell, x + sh * hw, z - ch * hw);
        roll = -Math.atan2(hR - hL, 2 * hw);
        y = (hF + hB + hR + hL) * 0.25 * 0.5 + ground * 0.5; // sit between the footprint average and the centre
        // from the drone view the body follows the ground more emphatically (up to +60%), so a herd visibly rides the swells
        // and dips of the land even when its legs are two pixels tall
        const cpv = this.shared.uCamPos.value;
        const fkT = smoothstep(25, 140, Math.hypot(x - cpv.x, ground - cpv.y, z - cpv.z));
        pitch *= 1 + 0.6 * fkT;
        roll *= 1 + 0.6 * fkT;
        // lean into the turn like a rider on a bend (tan = v * omega / g), only once it is actually running
        const vv = S.vis[slot];
        const lean = clamp(Math.atan((vv * turnRate) / 9.81) * 0.85, -BANK_MAX[sp], BANK_MAX[sp]) * smoothstep(1.5, 5, vv);
        S.bank[slot] += (lean - S.bank[slot]) * kBank;
        roll += S.bank[slot];
        // weight: the body dips 4 degrees as it picks up speed and rocks back 5 as it brakes (full at 1.6 x the cap)
        if (accCap > 0) {
          const accRef = accCap * 1.6;
          const a = S.acc[slot];
          const leanP = a > 0 ? LEAN_UP * Math.min(1, a / accRef) : LEAN_BRAKE * Math.min(1, -a / accRef) * smoothstep(0.3, 1.5, vv);
          S.lean[slot] += (leanP - S.lean[slot]) * kBank;
          pitch += S.lean[slot];
        }
        // a predator on its prey keeps its terrain pitch small: the body pose (shader) already pitches it up
        if (pounceE > 0.3) {
          pitch = clamp(pitch, -0.12, 0.12);
          roll = clamp(roll, -0.15, 0.15);
        }
      }
      if (cnO.lift > 0 || cnO.pitch !== 0) {
        // the mousing leap: lifted off the ground, nose up at the spring and down at the landing; the end that dips is kept above the
        // ground (the forefeet land first, the rump stays high over the pin)
        const sn = Math.sin(cnO.pitch), fl = pr.length * vs;
        y += cnO.lift + 0.26 * fl * Math.max(0, -sn) + 0.3 * fl * Math.max(0, sn);
        pitch += cnO.pitch;
      }
      // wading: in a water cell the animal stands on the bed while the water is shallower than its belly; in deeper
      // water it rides with the belly at the surface (a gentle bob, level pose) instead of looking like it stands on it
      if (!FLIES[sp] || alt <= 0.3) {
        const wc = Math.min(world.n - 1, Math.max(0, Math.floor(z / cell))) * world.n + Math.min(world.n - 1, Math.max(0, Math.floor(x / cell)));
        if (world.water[wc]) {
          const surf = world.waterHeight[wc];
          const belly = pr.height * 0.36 * vs;
          if (surf - ground > belly) {
            y = surf - belly + 0.04 * Math.sin(this.timeSec * 1.7 + hash01(id) * 40);
            pitch *= 0.25;
            roll *= 0.25;
          }
        }
      }
      this.writeInstance(b, x, y, z, ch, sh, pitch, roll, vs);
      // Body height: the body rides at the mean height of the ground under the stance feet (within 45 m of the camera, where the
      // legs reach for the real ground; eased to 0 beyond, and while lying). The shader raises the whole body by it.
      if (pr.kind === 0) {
        const ikK = 1 - smoothstep(IK_NEAR, IK_FAR, camD);
        let bT = 0;
        if (ikK > 0.001 && S.lie[slot] < 0.98) {
          bT = stanceBodyDy(pr, this.rigs[sp]!, gaitMix(pr, gaitSpd), S.phase[slot], { x, y, z, ch, sh, pitch, roll, s: vs }, groundAt) * ikK * (1 - S.lie[slot]) * (1 - cnO.air) * (1 - cnO.howl);
        }
        S.bdy[slot] += (bT - S.bdy[slot]) * kBdy;
      }

      // Border fade (R1 item 9): a migrant (the F_MIGRANT flag) arriving or leaving fades in or out over the last 15 m before the edge
      // of the world (a stippled discard in the shader, 0 = there .. 15 = gone), so it never pops in or out.
      let fadeQ = 0;
      if (((A[o + 8] | 0) & F_MIGRANT) !== 0) {
        const edge = Math.min(x, z, world.size - x, world.size - z);
        fadeQ = Math.round((1 - smoothstep(FADE_GONE, FADE_FULL, edge)) * 15);
      }
      // Contact shadow: a soft blob at knee height under every ground animal (models/contact.ts). It is as long as the body, a
      // little wider, and grows with the distance readability boost so a herd seen from afar keeps its grounding.
      if (pr.kind <= 1 && camD < 150 && fadeQ < 8) {
        const cw = sampleHeight(H, hn, cell, x, z);
        const wcell = Math.min(world.n - 1, Math.max(0, Math.floor(z / cell))) * world.n + Math.min(world.n - 1, Math.max(0, Math.floor(x / cell)));
        if (!world.water[wcell]) {
          const bl = pr.length * vs * sizeBoost;
          const bw = (0.12 * Math.max(pr.length, 1) * vs + 0.05) * sizeBoost;
          // (lying animals cast a rounder, slightly wider shadow; the blob lies at knee height: the canopy of the grass, not the soil)
          const lyK = S.lie[slot];
          this.contact.add(x, cw, z, ch, sh, pitch, roll, Math.min(0.32, 0.22 * pr.height * vs) * Math.min(1.5, sizeBoost), 0.55 * bl * (1 - 0.2 * lyK), (1.15 + 0.35 * lyK) * bw + 0.1 * vs, 0.5);
        }
      }
      if (fadeQ < 8) this.markers.add(sp, x, y + (FLIES[sp] ? 0.3 : pr.height * 0.6 * vs), z, pr.boostLen, vs);
      // from the wide view, a faint ripple where a predator is actually chasing
      if (state === St.Chase && HUNTER[sp]) this.markers.addPing(sp, x, y + 0.3, z);

      // dust kicked up by fast movers
      const dp = DUST[sp];
      if (dp && dustRate > 0 && spdS > dp[0] && (state === St.Run || state === St.Flee || state === St.Chase)) {
        // from the drone view a herd on the run has to leave a visible trail: fewer, bigger, longer-lived puffs with distance
        const cp = this.shared.uCamPos.value;
        const cd = Math.hypot(x - cp.x, y - cp.y, z - cp.z);
        const dsK = 1 + clamp((cd - 60) / 140, 0, 1) * 1.7;
        const gd = this.groundDry(x, z) * this.dust.dryness; // damp ground, rain and snow raise little or no dust
        S.dust[slot] += (dt * dp[1] * (spdS - dp[0]) * dustRate * (gd > 0.03 ? 0.3 + 0.7 * gd : 0)) / Math.sqrt(dsK);
        let guard = 2;
        while (S.dust[slot] >= 1 && guard-- > 0) {
          S.dust[slot] -= 1;
          const ci = Math.min(world.n - 1, Math.max(0, Math.floor(x / cell))), cj = Math.min(world.n - 1, Math.max(0, Math.floor(z / cell)));
          if (world.water[cj * world.n + ci]) continue;
          const back = -0.3 * pr.length * vs * (1 + 0.6 * (dsK - 1)), side = (Math.random() - 0.5) * 0.35 * pr.length * vs;
          const px = x + ch * back - sh * side, pz = z + sh * back + ch * side;
          const drift = -0.1 * spdS;
          this.dust.emit(
            px, sampleHeight(H, hn, cell, px, pz) + 0.15, pz,
            ch * drift * 0.6 + (Math.random() - 0.5) * 0.6, 0.15 + Math.random() * 0.3, sh * drift * 0.6 + (Math.random() - 0.5) * 0.6,
            dp[2] * vs * (0.8 + 0.4 * Math.random()) * Math.pow(dsK, 0.6), (dp[4] + Math.random() * (dp[5] - dp[4])) * (1 + 0.3 * (dsK - 1)), Math.min(0.4, dp[3] * (0.75 + 0.5 * Math.random()) * (1 + 0.1 * (dsK - 1))), Math.random(), gd,
          );
        }
        if (S.dust[slot] > 1) S.dust[slot] = 1;
      }

      // Time-lapse ground contact (the cue that the bound is touching down, see timelapseK): one small puff per few metres of ground a
      // fast mover covers, thrown behind it along its path. A herd running at 10x or 100x leaves a faint trail instead of floating.
      if (tlK > 0.25 && tlBudget > 0 && S.vis[slot] > TL_MIN_VIS && camD < TL_DUST_RANGE && pr.kind <= 1 && S.lie[slot] < 0.5) {
        S.tdust[slot] += ds / (TL_TRAIL_M * vs);
        let guard = 2;
        while (S.tdust[slot] >= 1 && guard-- > 0 && tlBudget > 0) {
          S.tdust[slot] -= 1;
          const gd = this.groundDry(x, z) * this.dust.dryness;
          if (gd <= 0.03) continue;
          const wci = Math.min(world.n - 1, Math.max(0, Math.floor(x / cell))), wcj = Math.min(world.n - 1, Math.max(0, Math.floor(z / cell)));
          if (world.water[wcj * world.n + wci]) continue;
          const back = -Math.random() * Math.max(ds, 0.5 * vs), side = (Math.random() - 0.5) * 0.4 * pr.length * vs;
          const px = x + ch * back - sh * side, pz = z + sh * back + ch * side;
          const sz = 0.5 * vs * Math.sqrt(pr.length) * (0.8 + 0.4 * Math.random());
          this.dust.emit(px, sampleHeight(H, hn, cell, px, pz) + 0.12, pz, (Math.random() - 0.5) * 0.5, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.5, sz, 0.7 + Math.random() * 0.5, 0.17 * Math.min(1, tlK * 1.3), Math.random(), gd);
          tlBudget--;
        }
        if (S.tdust[slot] > 2) S.tdust[slot] = 0;
      } else if (S.tdust[slot] > 0) S.tdust[slot] = 0;

      const k = b.count - 1;
      b.ids[k] = id;
      const gp = k * 4;
      const gait = b.gait.array as Float32Array;
      const look = b.look.array as Float32Array;
      gait[gp] = S.phase[slot];
      gait[gp + 1] = gaitSpd;
      gait[gp + 2] = FLIES[sp] ? (S.hdn[slot] > 0.5 ? 1 : S.flap[slot]) : S.hdn[slot];
      gait[gp + 3] = S.lie[slot];
      // feeding tug (head hauls and shakes, ravens peck), altitude (a bird in flight casts no shadow), hunting weight
      const fx = b.fx.array as Float32Array;
      fx[gp] = flier ? S.tug[slot] * (1 - S.mv[slot]) : S.tug[slot]; // a raven stops pecking while it hops or walks
      fx[gp + 1] = FLIES[sp] ? alt : pr.kind === 0 ? S.bdy[slot] : 0;
      fx[gp + 2] = S.hunt[slot];
      fx[gp + 3] = pounceE;
      // aFx2: a quadruped (hold on the prey 0..1, feeding cycle phase), a raven (hop 0..1 or -1, walk phase or -1, seconds into a
      // takeoff or -1, flutter 0..1)
      const fx2 = b.fx2.array as Float32Array;
      if (flier) {
        fx2[gp] = rvHopU; fx2[gp + 1] = rvWalk; fx2[gp + 2] = takeoffK > 0 ? S.rtk[slot] : -1; fx2[gp + 3] = rvFlut;
      } else {
        fx2[gp] = holdE; fx2[gp + 1] = S.fph[slot]; fx2[gp + 2] = leapE; fx2[gp + 3] = cnO.pack; // (canids: leap in the air, sitting to howl, mange; see tgUnpack)
      }
      look[gp] = clamp(coat, 0, 1);
      look[gp + 1] = hash01(id);
      look[gp + 2] = S.crouch[slot];
      look[gp + 3] = (id === sel ? 1 : 0) + 2 * fadeQ + sickK;
      // pick sphere
      const c = k * 4;
      const cy = y + (FLIES[sp] ? 0.15 * vs : pr.height * 0.5 * vs);
      b.centers[c] = x;
      b.centers[c + 1] = cy;
      b.centers[c + 2] = z;
      b.centers[c + 3] = Math.max(0.3, pr.length * 0.42 * vs);
      b.alive = b.count;
      if (id === sel) {
        this.selInfo.found = true;
        this.selInfo.x = x;
        this.selInfo.y = y;
        this.selInfo.z = z;
        this.selInfo.r = Math.max(0.8, pr.ring * vs);
      }
    }

    // carcasses: a lying body that shrinks and goes to bone as it is eaten
    this.activeFalls.length = 0;
    for (let c = 0; c < snap.carcassCount; c++) {
      const o = c * CARCASS_STRIDE;
      const sp = Math.round(snap.carcasses[o + 3]);
      if (sp < 0 || sp >= SPECIES_COUNT) continue;
      const b = this.batches[sp];
      if (!b) continue;
      const x = snap.carcasses[o], z = snap.carcasses[o + 1], rem = snap.carcasses[o + 2];
      const seed = hash01((Math.floor(x * 13) * 73856093) ^ (Math.floor(z * 13) * 19349663));
      const fi = this.falls.get(Math.floor(x * 8) * 65536 + Math.floor(z * 8));
      if (fi && fi.t < FALL_TIME + 2) fi.t += running;
      if (fi && fi.dlen > 0) {
        // the cougar's haul: the body slides toward cover (an eased 0..dlen m, display only) and swings round to trail behind the cougar
        const u = clamp((fi.age - fi.dt0) / Math.max(fi.dt1 - fi.dt0, 0.1), 0, 1);
        const e = u * u * (3 - 2 * u);
        fi.dgx = fi.dux * fi.dlen * e;
        fi.dgz = fi.duz * fi.dlen * e;
        if (u > 0 && running > 0) fi.h += wrapPi(Math.atan2(fi.duz, fi.dux) - fi.h) * (1 - Math.exp(-dt * 2.2));
      }
      const h = fi ? fi.h : seed * Math.PI * 2;
      const fall = fi ? clamp(fi.t / FALL_TIME, 0, 1) : 1;
      // the struggle: earth and dust kicked up round the animal while it fights the takedown (about the first 0.7 s)
      if (fi && fi.t > 0.05 && fi.t < 1.3 && running > 0 && Math.random() < 0.55) {
        const dryS = this.dust.dryness * this.groundDry(x, z);
        if (dryS > 0.08) {
          const bigS = sp === Sp.Bison ? 1.5 : 0.85;
          const a = Math.random() * Math.PI * 2, rr = (0.3 + Math.random() * 0.9) * bigS;
          const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
          const v = (1.0 + Math.random() * 1.6) * bigS;
          this.dust.emit(
            px, sampleHeight(H, hn, cell, px, pz) + 0.25, pz,
            Math.cos(a) * v * 0.5, 0.9 + Math.random() * 1.3, Math.sin(a) * v * 0.5,
            (0.55 + Math.random() * 0.6) * bigS, 0.6 + Math.random() * 0.6, 0.3 + Math.random() * 0.15, Math.random(), dryS,
          );
        }
      }
      // the stumble: the pace it died at decays as it loses its footing, and the legs keep cycling at that pace
      let stumblePh = 0, stumblePace = 0;
      if (fi && fall < 0.55) {
        fi.pace = fi.v * Math.exp(-fi.t * 2.2);
        const pr0 = b.def.params;
        if (pr0.kind === 0 && fi.pace > 0.3) fi.ph = (fi.ph + running * Math.min(fi.pace / (strideFor(pr0, fi.pace) * fi.vs), MAX_CADENCE)) % 1;
        stumblePh = fi.ph;
        stumblePace = fi.pace;
      }
      const ch = Math.cos(h), sh = Math.sin(h);
      // the animal skids on a little in the direction it was running as it goes down
      const slide = fi && fi.t < 1e2 ? Math.min(fi.v * 0.1, 1.4) * (1 - Math.exp(-fi.t * 3.2)) : 0;
      // it falls where it was drawn, and settles onto the sim's position as it goes down
      const off = fi && fi.t < 1e2 ? Math.exp(-fi.t * 4) : 0;
      const cx = x + (fi ? Math.cos(fi.h0) : ch) * slide + (fi ? fi.ox * off + fi.dgx : 0), cz = z + (fi ? Math.sin(fi.h0) : sh) * slide + (fi ? fi.oz * off + fi.dgz : 0);
      if (fi) {
        // where the body is drawn, for takedown contacts and feeding slots; a takedown in its struggle is open to pack mates arriving
        fi.cx = cx; fi.cz = cz; fi.rem = rem; fi.age += running;
        if (fi.t < STRUGGLE_END - 0.15) this.activeFalls.push(fi);
        if (fi.pbest > 0.01) {
          // the pull: the dent follows whoever pulls hardest, its contact point sliding over rather than jumping
          if (fi.pull < 0.02) { fi.pcx = fi.pdx; fi.pcz = fi.pdz; }
          else { const kp = 1 - Math.exp(-dt * 14); fi.pcx += (fi.pdx - fi.pcx) * kp; fi.pcz += (fi.pdz - fi.pcz) * kp; }
          fi.pull = fi.pbest;
        } else fi.pull *= Math.exp(-dt * 10);
      }
      const ground = sampleHeight(H, hn, cell, cx, cz);
      // lies on the ground, not over it: pitch from the slope along the body, roll from the slope across it, and the body rests
      // at the mean height of its footprint. A small per-body lean makes it look settled, like dead weight, not placed.
      const hl = b.def.params.length * 0.4, hw = Math.max(0.3, b.def.params.height * 0.4);
      const hF = sampleHeight(H, hn, cell, cx + ch * hl, cz + sh * hl);
      const hB = sampleHeight(H, hn, cell, cx - ch * hl, cz - sh * hl);
      const hR = sampleHeight(H, hn, cell, cx - sh * hw, cz + ch * hw);
      const hL = sampleHeight(H, hn, cell, cx + sh * hw, cz - ch * hw);
      const settle = fall >= 1 ? 1 : fall;
      const pitch = Math.atan2(hF - hB, 2 * hl) + (hash01(Math.floor(seed * 4096) + 11) - 0.5) * 0.14 * settle;
      const roll = -Math.atan2(hR - hL, 2 * hw) + (hash01(Math.floor(seed * 4096) + 29) - 0.5) * 0.16 * settle;
      let cy = (hF + hB + hR + hL) * 0.25 * 0.6 + ground * 0.4 + 0.22;
      const wc = Math.min(world.n - 1, Math.max(0, Math.floor(cz / cell))) * world.n + Math.min(world.n - 1, Math.max(0, Math.floor(cx / cell)));
      if (world.water[wc]) cy = Math.max(cy, world.waterHeight[wc] - 0.3); // a carcass in a pond floats at the surface
      // while it is still going down the body is the full-size living animal, so no ground lift
      if (fall < 1) cy = (cy - 0.22) + 0.22 * fall;
      this.writeInstance(b, cx, cy, cz, ch, sh, pitch, roll, fall < 1 && fi ? fi.vs * (1 - fall) + fall : 1);
      const k = b.count - 1;
      const gp = k * 4;
      const gait = b.gait.array as Float32Array;
      const look = b.look.array as Float32Array;
      gait[gp] = stumblePh;
      gait[gp + 1] = -1;
      gait[gp + 2] = clamp(rem, 0, 1);
      gait[gp + 3] = 0;
      look[gp] = seed;
      look[gp + 1] = seed;
      look[gp + 2] = 0;
      look[gp + 3] = 0;
      const fxc = b.fx.array as Float32Array;
      fxc[gp] = 0; fxc[gp + 1] = 0; fxc[gp + 2] = stumblePace; fxc[gp + 3] = fall;
      // the flank dent of the feeding cycle: pull strength and where it pulls from, in the carcass frame
      // (a carcass has no use for the lie weight or the body-height offset, so the dent rides in those: pull in aFx.x, contact x
      // in aFx.y, contact z in aGait.w)
      fxc[gp] = fi ? fi.pull : 0; fxc[gp + 1] = fi ? fi.pcx : 0; gait[gp + 3] = fi ? fi.pcz : 0;
      const fxc2 = b.fx2.array as Float32Array;
      fxc2[gp] = 0; fxc2[gp + 1] = 0; fxc2[gp + 2] = 0; fxc2[gp + 3] = 0;
      b.ids[k] = 0;
      b.centers[k * 4 + 3] = 0; // not pickable
    }

    for (const b of this.live) {
      const m = b.mesh;
      m.count = b.count;
      m.visible = b.count > 0;
      const used = b.count;
      const attrs: THREE.BufferAttribute[] = [m.instanceMatrix, b.gait, b.look, b.fx, b.fx2];
      for (const a of attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, used * a.itemSize);
        a.needsUpdate = true;
      }
    }
    this.markers.end();
    this.contact.end();
    this.updateRing();
  }

  /** Append one instance to a batch and write its matrix. Matrix = Ry(-heading) * Rz(pitch) * Rx(roll) * scale. */
  private writeInstance(b: Batch, x: number, y: number, z: number, ch: number, sh: number, pitch: number, roll: number, s: number): void {
    const k = b.count++;
    const te = b.mesh.instanceMatrix.array as Float32Array;
    const o = k * 16;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const cphi = ch, sphi = -sh; // phi = -heading
    // rows of R
    const m00 = cphi * cp, m01 = -cphi * sp * cr + sphi * sr, m02 = cphi * sp * sr + sphi * cr;
    const m10 = sp, m11 = cp * cr, m12 = -cp * sr;
    const m20 = -sphi * cp, m21 = sphi * sp * cr + cphi * sr, m22 = -sphi * sp * sr + cphi * cr;
    te[o] = m00 * s; te[o + 1] = m10 * s; te[o + 2] = m20 * s; te[o + 3] = 0;
    te[o + 4] = m01 * s; te[o + 5] = m11 * s; te[o + 6] = m21 * s; te[o + 7] = 0;
    te[o + 8] = m02 * s; te[o + 9] = m12 * s; te[o + 10] = m22 * s; te[o + 11] = 0;
    te[o + 12] = x; te[o + 13] = y; te[o + 14] = z; te[o + 15] = 1;
  }

  private updateRing(): void {
    const si = this.selInfo;
    if (this.selectedId === null || !si.found) {
      this.ring.visible = false;
      return;
    }
    const w = this.world;
    // wide enough that the ring is never smaller than about 10 px across on screen
    const cp = this.shared.uCamPos.value;
    const cd = Math.hypot(si.x - cp.x, si.y - cp.y, si.z - cp.z);
    const R = Math.max(si.r, cd * 0.0085) * (1 + 0.03 * Math.sin(this.timeSec * 3));
    const pos = this.ringGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const wx = si.x + this.ringBase[i] * R, wz = si.z + this.ringBase[i + 2] * R;
      arr[i] = wx;
      arr[i + 1] = sampleHeight(w.height, w.hn, w.cell, wx, wz) + 0.18;
      arr[i + 2] = wz;
    }
    pos.needsUpdate = true;
    this.ringGeo.computeBoundingSphere();
    this.ringMat.uniforms.uOpacity.value = 0.88 + 0.12 * Math.sin(this.timeSec * 4);
    this.ring.visible = true;
  }

  // ---------------------------------------------------------------------------------------------------------
  /** Id of the animal under the ray (approximate: bounding spheres, inflated with distance so far animals stay clickable). */
  pick(raycaster: THREE.Raycaster): number | null {
    const ray = raycaster.ray;
    const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
    const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    let best = Infinity;
    let bestId: number | null = null;
    for (const b of this.live) {
      const C = b.centers;
      for (let k = 0; k < b.alive; k++) {
        const c = k * 4;
        const px = C[c] - ox, py = C[c + 1] - oy, pz = C[c + 2] - oz;
        const t = px * dx + py * dy + pz * dz;
        if (t < 0) continue;
        const d2 = px * px + py * py + pz * pz - t * t;
        const r = Math.max(C[c + 3], 0.012 * t);
        if (d2 < r * r) {
          const dist = t - Math.sqrt(r * r - d2);
          if (dist < best) {
            best = dist;
            bestId = b.ids[k];
          }
        }
      }
    }
    return bestId;
  }

  setSelected(id: number | null): void {
    this.selectedId = id;
    if (id === null) this.ring.visible = false;
  }

  /** Interpolated world position of an animal (three.js coordinates, on the terrain or at its flight altitude). */
  getPosition(id: number, out: THREE.Vector3): boolean {
    const snap = this.curr;
    if (!snap) return false;
    const i = this.currMap.get(id);
    if (i === undefined) return false;
    const A = snap.agents;
    const o = i * AGENT_STRIDE;
    let x = A[o + 1], z = A[o + 2], alt = A[o + 9];
    const j = this.prevOf[i];
    if (j >= 0 && this.prev) {
      const P = this.prev.agents, q = j * AGENT_STRIDE;
      const dx = x - P[q + 1], dz = z - P[q + 2];
      if (dx * dx + dz * dz < 900) {
        x = P[q + 1] + dx * this.lastAlpha;
        z = P[q + 2] + dz * this.lastAlpha;
      }
      alt = P[q + 9] + (alt - P[q + 9]) * this.lastAlpha;
    }
    const w = this.world;
    // the drawn position (smoothed), so a camera following the animal does not fight its own smoothing
    const slot = this.slots.map.get(id);
    if (slot !== undefined && !this.slots.fresh[slot]) { x = this.slots.px[slot]; z = this.slots.pz[slot]; }
    out.set(x, sampleHeight(w.height, w.hn, w.cell, x, z) + alt, z);
    return true;
  }

  /** Species of a living animal in the current snapshot, or -1. */
  getSpecies(id: number): number {
    const i = this.currMap.get(id);
    return i === undefined || !this.curr ? -1 : this.curr.agents[i * AGENT_STRIDE] | 0;
  }

  /** Total triangles currently submitted (for stats). */
  get triangleCount(): number {
    let t = 0;
    for (const b of this.live) t += b.count * b.def.triangles;
    return t;
  }

  dispose(): void {
    for (const b of this.live) {
      b.mesh.dispose();
      b.geometry.dispose();
      b.material.dispose();
      b.depth.dispose();
    }
    this.heightTex.dispose();
    this.markers.dispose();
    this.dust.dispose();
    this.contact.dispose();
    this.kills.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
  }
}
