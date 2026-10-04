// AnimalLayer: instanced, vertex-animated animals driven by sim snapshots.
//
// One InstancedMesh per species. Per-instance matrix (position, yaw, terrain pitch/roll, scale) is built on the
// CPU; the gait, graze, rest, carcass and wing poses are evaluated in the vertex shader (see models/shader.ts)
// from three vec4 instance attributes. Snapshots arrive at 10 to 60 Hz; positions and headings are interpolated
// between the previous and current snapshot by id.
//
// Foot-lock: the leg cycle advances by (distance drawn this frame / stride), never by time, so a planted foot stands
// still on the ground at any sim rate or frame rate (the stride comes from the gait, see models/types.ts plantedStride).
import * as THREE from 'three';
import { AGENT_STRIDE, CARCASS_STRIDE, F_INFECTED, SPECIES_COUNT, Sp, St } from '../sim/types';
import type { Snapshot } from '../sim/types';
import { sampleHeight } from '../sim/world';
import type { World } from '../sim/world';
import { getModel } from './models';
import type { AnimParams, ModelDef } from './models';
import { plantedStride } from './models/types';
import { makeAnimalMaterials } from './models/shader';
import type { AnimalShared } from './models/shader';
import { Dust, KillSites, Markers, SceneLit } from './models/fx';

const INITIAL_CAPACITY = [2048, 512, 512, 1024, 1024, 128]; // by species id

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
const DUST: Array<[number, number, number, number, number, number] | null> = [
  [4.5, 1.5, 2.6, 0.3, 1.3, 2.1], // bison
  [5.5, 0.5, 0.75, 0.2, 0.7, 1.1], // wolf
  null, // raven
  [6, 0.4, 0.95, 0.2, 0.8, 1.2], // pronghorn
  null, // rabbit
  [5.5, 0.4, 0.8, 0.2, 0.7, 1.1], // cougar
];

/** On-screen metres per second of sim speed at 1x (DT 0.15 s of motion per tick, 10 ticks per second). */
const VIS_PER_SIM = 1.5;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Metres of ground covered per leg cycle at a gait pace (the pace the animal moves at in its own world, on-screen m/s at
 * 1x). The gait mix is the one the vertex shader uses. Quadrupeds use the stride that leaves a planted foot standing
 * still on the ground (see plantedStride); hoppers and birds interpolate their authored strides.
 */
function strideFor(p: AnimParams, gaitSpd: number): number {
  if (p.kind !== 0) {
    const u = clamp(gaitSpd / p.strideSpeedMax, 0, 1);
    return p.strideW + (p.strideG - p.strideW) * u * u * (3 - 2 * u);
  }
  const s1 = smoothstep(p.trot0, p.trot1, gaitSpd);
  const wG = smoothstep(p.gal0, p.gal1, gaitSpd);
  const wT = s1 * (1 - wG);
  const wW = smoothstep(0.08, 0.4, gaitSpd) * (1 - s1);
  const sum = wW + wT + wG;
  if (sum < 1e-3) return plantedStride(p, 0);
  return (wW * plantedStride(p, 0) + wT * plantedStride(p, 1) + wG * plantedStride(p, 2, gaitSpd)) / sum;
}

/**
 * Most leg cycles per second the cadence may reach (faster than this the legs alias on screen). Raised from 6: the fastest
 * gallops (a pronghorn in flight, a wolf closing at 25 m/s on screen) need about 5 to 6 Hz even with the long fast-gallop stride.
 */
const MAX_CADENCE = 7.5;

/**
 * Render-side heading dynamics per species: natural frequency (rad/s) of the critically damped spring that chases the sim
 * heading, and the fastest the body may turn (rad/s). The sim re-aims instantly; the body does not, so an animal carries
 * its momentum through a turn and leans into it.
 */
const TURN: Array<[number, number]> = [
  [4.2, 2.3], // bison
  [7, 6], // wolf
  [3.5, 2.6], // raven (banks through wide circles)
  [7, 6], // pronghorn
  [9, 8], // rabbit
  [7, 6], // cougar
];
/** Largest lean (rad) into a turn at speed. */
const BANK_MAX = [0.2, 0.42, 0.75, 0.42, 0.3, 0.42];

/** How the whole fall of a carcass plays out, in seconds. */
const FALL_TIME = 2.0;
/** A predator within this many metres of a fresh kill (and hunting) lunges. */
const POUNCE_R = 7;
const POUNCE_TIME = 1.15;
/** Distance (m) between the lunging predator's centre and the prey's centre when the lunge connects (muzzle on the flank). */
const CONTACT_D = 1.75;

interface FallInfo {
  /** Seconds since the animal began to go down (large for carcasses that were already lying there). */
  t: number;
  /** Heading and on-screen speed of the animal that died here, its drawn scale, and its leg cycle phase when it went down. */
  h: number;
  v: number;
  vs: number;
  ph: number;
  /** Pace of the stumble, decaying from `v` as the animal loses its footing. */
  pace: number;
  /** Snapshot generation that last saw this carcass (so stale entries can be dropped). */
  g: number;
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
    this.gait.setUsage(THREE.DynamicDrawUsage);
    this.look.setUsage(THREE.DynamicDrawUsage);
    this.fx.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aGait', this.gait);
    g.setAttribute('aLook', this.look);
    g.setAttribute('aFx', this.fx);
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
  /** Where the animal was drawn last frame (the foot-lock measures the distance covered from this). */
  px = new Float32Array(this.cap);
  pz = new Float32Array(this.cap);
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
  hdn = new Float32Array(this.cap);
  lie = new Float32Array(this.cap);
  crouch = new Float32Array(this.cap);
  flap = new Float32Array(this.cap);
  bank = new Float32Array(this.cap);
  pitch = new Float32Array(this.cap);
  sick = new Float32Array(this.cap);
  dust = new Float32Array(this.cap);
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
    this.tug = g(this.tug, Float32Array);
    this.hunt = g(this.hunt, Float32Array);
    this.hs = g(this.hs, Float32Array);
    this.hw = g(this.hw, Float32Array);
    { const b = new Float32Array(n).fill(-1); b.set(this.pounce); this.pounce = b; }
    this.ptid = g(this.ptid, Uint32Array);
    this.ptx = g(this.ptx, Float32Array);
    this.ptz = g(this.ptz, Float32Array);
    this.hdn = g(this.hdn, Float32Array);
    this.lie = g(this.lie, Float32Array);
    this.crouch = g(this.crouch, Float32Array);
    this.flap = g(this.flap, Float32Array);
    this.bank = g(this.bank, Float32Array);
    this.pitch = g(this.pitch, Float32Array);
    this.sick = g(this.sick, Float32Array);
    this.dust = g(this.dust, Float32Array);
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
  readonly speciesScale: number[] = [1, 1.35, 1.7, 1, 1.2, 1.05];

  private world: World;
  private batches: Batch[] = [];
  private uTime = { value: 0 };
  private shared: AnimalShared = {
    uTime: this.uTime, uCamPos: { value: new THREE.Vector3(256, 400, 256) }, uPxK: { value: 900 / (2 * Math.tan((45 * Math.PI) / 360)) },
    uLow: { value: 0 },
    uAmb: { value: new THREE.Vector3(0.6, 0.55, 0.45) },
    probe: (scene, exposure) => {
      this.lit.probe(scene);
      const v = this.lit.value;
      this.shared.uAmb.value.copy(v);
      // dark scene: little light reaches the animals, or the camera has opened up (exposure rises at dusk and night, which is
      // what makes bright coat areas glow against the dark ground)
      this.shared.uLow.value = Math.max(1 - clamp((v.x + v.y + v.z) / 3 / 0.7, 0, 1), smoothstep(1.05, 1.5, exposure));
    },
  };
  private lit = new SceneLit();
  private dust: Dust;
  private kills: KillSites;
  private markers: Markers;
  private slots = new Slots();
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
  /** Slots of the animals that left the snapshot this time (id to slot), so a body that just died can keep its gait phase. */
  private goneSlot = new Map<number, number>();
  private tmpV = new THREE.Vector3();
  private timeSec = 0;
  private lastSnapT = -1;
  private snapDt = 0.1;
  private lastAlpha = 1;

  private selectedId: number | null = null;
  private ring: THREE.Mesh;
  private ringGeo: THREE.PlaneGeometry;
  private ringBase: Float32Array;
  private ringMat: THREE.ShaderMaterial;
  private selInfo = { found: false, x: 0, y: 0, z: 0, r: 1 };

  constructor(world: World) {
    this.world = world;
    this.object3D.name = 'AnimalLayer';
    for (let sp = 0; sp < SPECIES_COUNT; sp++) {
      const def = getModel(sp);
      const { material, depth } = makeAnimalMaterials(sp, def, this.shared);
      this.batches.push(new Batch(sp, def, material, depth, this.object3D, INITIAL_CAPACITY[sp], this.shared));
    }
    this.kills = new KillSites(world, this.lit);
    this.dust = new Dust(this.lit);
    this.markers = new Markers(world.size);
    this.object3D.add(this.kills.mesh, this.dust.mesh, this.markers.mesh, this.markers.pingMesh);

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
      }
      S.stamp[slot] = this.gen;
      this.currSlot[i] = slot;
      const j = this.prevMap.get(id);
      this.prevOf[i] = j === undefined ? -1 : j;
      const sp = ag[i * AGENT_STRIDE] | 0;
      if (sp >= 0 && sp < SPECIES_COUNT) this.counts[sp]++;
    }
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
    for (let sp = 0; sp < SPECIES_COUNT; sp++) this.batches[sp].ensure(this.counts[sp] + this.carcassCounts[sp], this.object3D);
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
        fi = { t: 1e3, h: hash01((Math.floor(cx * 13) * 73856093) ^ (Math.floor(cz * 13) * 19349663)) * Math.PI * 2, v: 0, vs: 1, ph: 0, pace: 0, g: gen };
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
            if (gs !== undefined) fi.ph = this.slots.phase[gs];
          }
          fi.t = 0;
          if (budget-- > 0) this.killBurst(snap, cx, cz, sp, fi);
        }
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
    const A = snap.agents, S = this.slots;
    for (let i = 0; i < snap.count; i++) {
      const o = i * AGENT_STRIDE;
      const s = A[o] | 0;
      if (s !== Sp.Wolf && s !== Sp.Cougar) continue;
      const st = A[o + 7] | 0;
      if (st !== St.Chase && st !== St.Stalk && st !== St.Eat) continue;
      const dx = A[o + 1] - cx, dz = A[o + 2] - cz;
      if (dx * dx + dz * dz > POUNCE_R * POUNCE_R) continue;
      const slot = this.currSlot[i];
      if (S.pounce[slot] < 0.35 * POUNCE_TIME || S.pounce[slot] > POUNCE_TIME) S.pounce[slot] = 0;
      // the lunge ends on the fallen animal: aimed at where it is going down
      const sl = Math.min(fi.v * 0.1, 1.4) * 0.6;
      S.ptid[slot] = 0;
      S.ptx[slot] = cx + Math.cos(fi.h) * sl;
      S.ptz[slot] = cz + Math.sin(fi.h) * sl;
    }
  }

  /** A predator in a chase that has caught up with something lunges at it. */
  private lungeScan(snap: Snapshot): void {
    if (this.timeScale <= 0 || this.timeScale > 3) return;
    const A = snap.agents, S = this.slots, n = snap.count;
    for (let i = 0; i < n; i++) {
      const o = i * AGENT_STRIDE;
      const sp = A[o] | 0;
      if ((sp !== Sp.Wolf && sp !== Sp.Cougar) || (A[o + 7] | 0) !== St.Chase) continue;
      const slot = this.currSlot[i];
      if (S.pounce[slot] >= 0) continue; // already lunging or cooling down
      const x = A[o + 1], z = A[o + 2], hx = Math.cos(A[o + 3]), hz = Math.sin(A[o + 3]);
      for (let j = 0; j < n; j++) {
        const q = j * AGENT_STRIDE;
        const s2 = A[q] | 0;
        if (s2 === Sp.Wolf || s2 === Sp.Cougar || s2 === Sp.Raven || s2 === Sp.Rabbit) continue;
        const dx = A[q + 1] - x, dz = A[q + 2] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 3.6 * 3.6 || d2 < 0.2) continue;
        if (dx * hx + dz * hz < 0.4 * Math.sqrt(d2)) continue; // only prey ahead of it
        S.pounce[slot] = 0;
        S.ptid[slot] = snap.ids[j];
        S.ptx[slot] = A[q + 1];
        S.ptz[slot] = A[q + 2];
        break;
      }
    }
  }

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
    const running = this.timeScale > 0 ? dt : 0;
    this.dust.update(running);
    this.markers.begin();
    const dustRate = Math.min(this.timeScale, 3);

    for (const b of this.batches) {
      b.count = 0;
      b.alive = 0;
    }

    const n = snap.count;
    for (let i = 0; i < n; i++) {
      const o = i * AGENT_STRIDE;
      const sp = A[o] | 0;
      if (sp < 0 || sp >= SPECIES_COUNT) continue;
      const b = this.batches[sp];
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

      // animation state targets
      // gait style follows the animal's own pace (walk, trot, gallop), not the time-lapse factor
      const spdT = this.timeScale > 0 ? spd1 * VIS_PER_SIM : 0;
      let hdT = 0, lieT = 0, crT = 0;
      let flapT = 0;
      if (state === St.Graze || state === St.Eat || state === St.Drink) hdT = 1;
      if (state === St.Rest) lieT = 1;
      if (state === St.Stalk) crT = 1;
      if (sp === Sp.Raven) {
        const grounded = alt < 0.3 && state !== St.Fly;
        crT = grounded ? 1 : 0; // wing fold
        hdT = grounded && state === St.Eat ? 1 : 0;
        flapT = grounded ? 0 : alt < 6 ? 1 : 0.1;
        lieT = 0;
      }
      if (S.fresh[slot]) {
        S.fresh[slot] = 0;
        S.px[slot] = x;
        S.pz[slot] = z;
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
      S.px[slot] = x;
      S.pz[slot] = z;
      const visT = dt > 1e-4 ? ds / dt : 0;
      const feeding = state === St.Eat && (sp === Sp.Wolf || sp === Sp.Cougar || (sp === Sp.Raven && hdT > 0)) && this.timeScale > 0;
      const hunting = (sp === Sp.Wolf || sp === Sp.Cougar) && this.timeScale > 0 ? (state === St.Chase || state === St.Stalk ? 1 : state === St.Eat ? 0.6 : 0) : 0;
      S.tug[slot] += ((feeding ? 1 : 0) - S.tug[slot]) * kHead;
      S.hunt[slot] += (hunting - S.hunt[slot]) * kHead;
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
      // pounce: a lunge that lifts the forequarters and drives the head, then a short cooldown
      let pounceE = 0;
      if (S.pounce[slot] >= 0) {
        S.pounce[slot] += running;
        const u = S.pounce[slot] / POUNCE_TIME;
        // spring on over a quarter of the lunge, hold on the prey, then let go
        if (u < 1) pounceE = u < 0.24 ? smoothstep(0, 0.24, u) : u < 0.58 ? 1 : 1 - smoothstep(0.58, 1, u);
        if (S.pounce[slot] > POUNCE_TIME * 2.4) S.pounce[slot] = -1;
      }
      if (pounceE > 0.001) {
        // The lunge connects: the predator is carried to the prey and turned onto it, so it ends with its forelegs on the
        // shoulder or flank instead of beside it (the sim only keeps it within a couple of metres).
        let tx = S.ptx[slot], tz = S.ptz[slot];
        if (S.ptid[slot] !== 0 && this.getPosition(S.ptid[slot], this.tmpV)) { tx = this.tmpV.x; tz = this.tmpV.z; S.ptx[slot] = tx; S.ptz[slot] = tz; }
        const ddx = tx - x, ddz = tz - z, dd = Math.hypot(ddx, ddz);
        if (dd > 0.05 && dd < 9) {
          const pull = Math.max(0, dd - CONTACT_D * (sp === Sp.Cougar ? 1.1 : 1)) * pounceE;
          x += (ddx / dd) * pull;
          z += (ddz / dd) * pull;
          h += wrapPi(Math.atan2(ddz, ddx) - h) * Math.min(1, pounceE * 1.1);
        }
      }
      // a creature that is not actually going anywhere (blocked, turning on the spot) stands rather than marching in place
      const gaitSpd = Math.min(spdS, S.vis[slot] * 1.6 + 0.15);
      // the model is drawn scaled (species readability boost, age, size), and its stride scales with it
      const vs = sc * this.speciesScale[sp];
      S.phase[slot] = (S.phase[slot] + Math.min(ds / (strideFor(pr, gaitSpd) * vs), MAX_CADENCE * dt)) % 1;

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
      const ground = sampleHeight(H, hn, cell, x, z);
      let pitch = 0, roll = 0, y = ground;
      if (sp === Sp.Raven) {
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
        }
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
      }
      // wading: in a water cell the animal stands on the bed while the water is shallower than its belly; in deeper
      // water it rides with the belly at the surface (a gentle bob, level pose) instead of looking like it stands on it
      if (sp !== Sp.Raven || alt <= 0.3) {
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

      this.markers.add(sp, x, y + (sp === Sp.Raven ? 0.3 : pr.height * 0.6 * vs), z, pr.boostLen, vs);
      // from the wide view, a faint ripple where a predator is actually chasing
      if (state === St.Chase && (sp === Sp.Wolf || sp === Sp.Cougar)) this.markers.addPing(sp, x, y + 0.3, z);

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
            dp[2] * vs * (0.8 + 0.4 * Math.random()) * Math.pow(dsK, 0.6), (dp[4] + Math.random() * (dp[5] - dp[4])) * (1 + 0.3 * (dsK - 1)), Math.min(0.34, dp[3] * (0.75 + 0.5 * Math.random()) * (1 + 0.1 * (dsK - 1))), Math.random(), gd,
          );
        }
        if (S.dust[slot] > 1) S.dust[slot] = 1;
      }

      const k = b.count - 1;
      b.ids[k] = id;
      const gp = k * 4;
      const gait = b.gait.array as Float32Array;
      const look = b.look.array as Float32Array;
      gait[gp] = S.phase[slot];
      gait[gp + 1] = gaitSpd;
      gait[gp + 2] = sp === Sp.Raven ? (S.hdn[slot] > 0.5 ? 1 : S.flap[slot]) : S.hdn[slot];
      gait[gp + 3] = S.lie[slot];
      // feeding tug (head hauls and shakes, ravens peck), altitude (a bird in flight casts no shadow), hunting weight
      const fx = b.fx.array as Float32Array;
      fx[gp] = S.tug[slot];
      fx[gp + 1] = sp === Sp.Raven ? alt : 0;
      fx[gp + 2] = S.hunt[slot];
      fx[gp + 3] = pounceE;
      look[gp] = clamp(coat, 0, 1);
      look[gp + 1] = hash01(id);
      look[gp + 2] = S.crouch[slot];
      look[gp + 3] = (id === sel ? 1 : 0) + sickK;
      // pick sphere
      const c = k * 4;
      const cy = y + (sp === Sp.Raven ? 0.15 * vs : pr.height * 0.5 * vs);
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
    for (let c = 0; c < snap.carcassCount; c++) {
      const o = c * CARCASS_STRIDE;
      const sp = Math.round(snap.carcasses[o + 3]);
      if (sp < 0 || sp >= SPECIES_COUNT) continue;
      const b = this.batches[sp];
      const x = snap.carcasses[o], z = snap.carcasses[o + 1], rem = snap.carcasses[o + 2];
      const seed = hash01((Math.floor(x * 13) * 73856093) ^ (Math.floor(z * 13) * 19349663));
      const fi = this.falls.get(Math.floor(x * 8) * 65536 + Math.floor(z * 8));
      if (fi && fi.t < FALL_TIME + 2) fi.t += running;
      const h = fi ? fi.h : seed * Math.PI * 2;
      const fall = fi ? clamp(fi.t / FALL_TIME, 0, 1) : 1;
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
      const cx = x + ch * slide, cz = z + sh * slide;
      const ground = sampleHeight(H, hn, cell, cx, cz);
      const hl = b.def.params.length * 0.3;
      const hF = sampleHeight(H, hn, cell, cx + ch * hl, cz + sh * hl);
      const hB = sampleHeight(H, hn, cell, cx - ch * hl, cz - sh * hl);
      const pitch = Math.atan2(hF - hB, 2 * hl);
      let cy = ground + 0.22;
      const wc = Math.min(world.n - 1, Math.max(0, Math.floor(cz / cell))) * world.n + Math.min(world.n - 1, Math.max(0, Math.floor(cx / cell)));
      if (world.water[wc]) cy = Math.max(cy, world.waterHeight[wc] - 0.3); // a carcass in a pond floats at the surface
      // while it is still going down the body is the full-size living animal, so no ground lift
      if (fall < 1) cy = ground + 0.22 * fall;
      this.writeInstance(b, cx, cy, cz, ch, sh, pitch, 0, fall < 1 && fi ? fi.vs * (1 - fall) + fall : 1);
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
      b.ids[k] = 0;
      b.centers[k * 4 + 3] = 0; // not pickable
    }

    for (const b of this.batches) {
      const m = b.mesh;
      m.count = b.count;
      m.visible = b.count > 0;
      const used = b.count;
      const attrs: THREE.BufferAttribute[] = [m.instanceMatrix, b.gait, b.look, b.fx];
      for (const a of attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, used * a.itemSize);
        a.needsUpdate = true;
      }
    }
    this.markers.end();
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
    for (const b of this.batches) {
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
    for (const b of this.batches) t += b.count * b.def.triangles;
    return t;
  }

  dispose(): void {
    for (const b of this.batches) {
      b.mesh.dispose();
      b.geometry.dispose();
      b.material.dispose();
      b.depth.dispose();
    }
    this.markers.dispose();
    this.dust.dispose();
    this.kills.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
  }
}
