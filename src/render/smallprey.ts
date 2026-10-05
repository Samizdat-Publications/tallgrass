// SmallPreyLayer (R3 items 2 and 3): the render side of the small-prey web. The sim keeps jackrabbits and prairie dogs as density
// fields on the 32 x 32 coarse grid (16 m cells); this layer turns them into something you can watch.
//
//   * Prairie dog towns: instanced dirt mounds (about 12 x town per cell, placed by hash, they stay after a die-off and slowly
//     grass over), a bare ring round each, and short greener turf (terrain.ts reads the same texture, see smalltex.ts).
//   * Prairie dog puppets within 110 m of the camera (budget 400): each runs its own loop of forage, upright sentinel, jump-yip and
//     grooming. An alarm (a ground predator, or a raven, eagle or hawk below 25 m, within 40 m of a town cell) sweeps through the
//     town: every dog dives into its burrow at t = distance / 8 m/s, and comes back 6 to 15 s after the threat has gone.
//   * Jackrabbit puppets within 90 m (budget 250): graze, sit up with the ears high, and bound away in a zigzag from a predator
//     within 25 m. They use the rabbit model.
//
// Puppets are display-only: they never feed anything back to the sim, and a puppet's identity is its (cell, slot) pair, so it stays
// put while the camera moves about. Counts follow the fields (see DOG_PER and HARE_PER).
//
// Wiring (src/main.ts): setSmall(bytes) with each snapshot's `small`, setAgents(agents, count) with each new snapshot, update(...) every
// frame, and clipVeg(...) after Engine.setVeg. `onBark` tells the audio where a dog yips or an alarm starts.
import * as THREE from 'three';
import { AGENT_STRIDE, Sp, St } from '../sim/types';
import { SPECIES } from '../sim/species';
import { sampleHeight } from '../sim/world';
import type { World } from '../sim/world';
import { getModel } from './models';
import { buildPrairieDog } from './models/prairiedog';
import type { ModelDef } from './models';
import { SceneLit } from './models/fx';
import { makeAnimalMaterials } from './models/shader';
import type { AnimalShared } from './models/shader';
import { injectTerrainShadow } from './common';
import type { SharedUniforms } from './common';
import { SMALL_DATA, SMALL_N, uploadSmall } from './smalltex';

const CELLS = SMALL_N * SMALL_N;

// ---- tuning ------------------------------------------------------------------------------------------------------------------
/** Puppet budgets and draw radii (m), from the work package. */
export const DOG_BUDGET = 400;
export const HARE_BUDGET = 250;
const DOG_RADIUS = 110;
const HARE_RADIUS = 90;
/**
 * Puppets per modelled animal. The plan gave n = min(14, round(dog x 0.5)) and min(10, round(hare x 0.3)), written for denser fields;
 * with the shipped dogK 4 and hareK 3 a cell holds at most 4 dogs and 3 hares, so those factors would draw a town with one dog in
 * it. Here a dog is a puppet (1.0) and a puppet stands for two hares (0.5). The fractional part is dithered by a per-cell hash, so a
 * thin cell shows an animal now and then and a number that creeps up never makes a puppet pop in and out.
 */
const DOG_PER = 1.0;
const HARE_PER = 0.5;
const DOG_MAX_PER_CELL = 14;
const HARE_MAX_PER_CELL = 10;
/** Mounds per cell at full town, and the most mounds drawn at once. */
const MOUNDS_PER_CELL = 12;
const MOUND_CAP = 6000;
/** Biomass (0..255 of the vegetation texture's R) a town's clipped turf is cut to at most. */
const TURF_BIOMASS = 26;
/** Alarm: how close a threat must come to a town cell (m), how low a bird must fly (m), the wave speed (m/s), and how far the wave reaches (m). */
const ALARM_TOWN_R = 40;
const ALARM_ALT = 25;
const WAVE_SPEED = 8;
const WAVE_REACH = 42;
const ALARM_MERGE = 30;
/** Hares bound away from a predator closer than this (m) and settle once it is beyond HARE_CALM. */
const HARE_FLEE_R = 25;
const HARE_CALM = 40;

// ---- helpers -----------------------------------------------------------------------------------------------------------------
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapPi = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
/** Integer hash to [0, 1). */
function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const h2 = (a: number, b: number): number => hash(Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca6b));

/** Height of a mound above the ground at distance r from its centre (matches the mound mesh): a ring rim with a crater in the middle. */
function moundH(r: number): number {
  if (r >= 0.8) return 0;
  if (r >= 0.36) return 0.27 * smooth(0.8, 0.36, r);
  return 0.27 - 0.21 * smooth(0.36, 0.06, r);
}

// ---- puppets -----------------------------------------------------------------------------------------------------------------
const U_UP = 0;
const U_DIVING = 1;
const U_UNDER = 2;
const U_EMERGING = 3;

interface Dog {
  key: number;
  c: number;
  /** Burrow (the mound it lives at) and the spot beside it where it stands to watch. */
  hx: number;
  hz: number;
  /** Scale of its mound (the profile in moundH is for 1). */
  ms: number;
  sx: number;
  sz: number;
  /** Per-dog constants: hash, cycle length (s), forage direction and radius, and whether it does the jump-yip display. */
  h: number;
  L: number;
  fdir: number;
  fR: number;
  yipper: boolean;
  scale: number;
  /** Drawn state. */
  x: number;
  z: number;
  heading: number;
  pitch: number;
  dn: number;
  vis: number;
  phase: number;
  /** Burrow state machine and the cycle clock (the cycle starts at tStart; before it the dog stands watching). */
  u: number;
  uT: number;
  tStart: number;
  /** Sink 0 (on the surface) .. 1 (down the hole), the pose it is dressing for this frame, and whether it has yipped this cycle. */
  sink: number;
  yipped: boolean;
  dive: number;
  seen: boolean;
  /** Its cell no longer holds enough dogs for it: it goes down its burrow and is dropped there, instead of vanishing in view. */
  leaving: boolean;
  /** A new dog stays down its burrow until this time (the town comes up a few at a time, not all at once). */
  hold: number;
}

interface Hare {
  key: number;
  c: number;
  hx: number;
  hz: number;
  h: number;
  x: number;
  z: number;
  heading: number;
  pitch: number;
  dn: number;
  vis: number;
  phase: number;
  /** 0 graze, 1 sit up, 2 flee, 3 alert after a flight. */
  st: number;
  stT: number;
  stDur: number;
  away: number;
  scale: number;
  seen: boolean;
  /** Its cell no longer holds enough hares for it: it bounds off (away from the camera) and is dropped after leaveT seconds. */
  leaving: boolean;
  leaveT: number;
}

interface Alarm {
  x: number;
  z: number;
  t0: number;
  last: number;
  live: boolean;
}

/** One instanced batch of an animal model drawn with the shared animation shader. */
class PuppetBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly gait: THREE.InstancedBufferAttribute;
  readonly look: THREE.InstancedBufferAttribute;
  readonly fx: THREE.InstancedBufferAttribute;
  count = 0;

  constructor(readonly sp: number, readonly def: ModelDef, readonly cap: number, material: THREE.Material, depth: THREE.Material, shared: AnimalShared, castShadow: boolean) {
    const g = new THREE.BufferGeometry();
    const src = def.geometry;
    for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.getAttribute(name));
    g.setIndex(src.getIndex());
    this.gait = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.gait, this.look, this.fx]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aGait', this.gait);
    g.setAttribute('aLook', this.look);
    g.setAttribute('aFx', this.fx);
    const mesh = new THREE.InstancedMesh(g, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = depth as THREE.MeshDepthMaterial;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = 'smallprey-' + sp;
    mesh.onBeforeRender = (r, s, camera) => {
      if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
      const expo = (r as THREE.WebGLRenderer).toneMappingExposure ?? 1;
      shared.probe?.(s, expo);
      shared.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      shared.uPxK.value = 900 / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
    };
    this.mesh = mesh;
  }

  begin(): void {
    this.count = 0;
  }

  /** Append one instance: Ry(-heading) Rz(pitch) Rx(roll) scale, with the pivot (model x = pivX) held at the given world point. */
  add(x: number, y: number, z: number, heading: number, pitch: number, roll: number, s: number, pivX: number): number {
    const k = this.count++;
    const te = this.mesh.instanceMatrix.array as Float32Array;
    const o = k * 16;
    const ch = Math.cos(heading), sh = Math.sin(heading);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const cphi = ch, sphi = -sh;
    const m00 = cphi * cp, m01 = -cphi * sp * cr + sphi * sr, m02 = cphi * sp * sr + sphi * cr;
    const m10 = sp, m11 = cp * cr, m12 = -cp * sr;
    const m20 = -sphi * cp, m21 = sphi * sp * cr + cphi * sr, m22 = -sphi * sp * sr + cphi * cr;
    te[o] = m00 * s; te[o + 1] = m10 * s; te[o + 2] = m20 * s; te[o + 3] = 0;
    te[o + 4] = m01 * s; te[o + 5] = m11 * s; te[o + 6] = m21 * s; te[o + 7] = 0;
    te[o + 8] = m02 * s; te[o + 9] = m12 * s; te[o + 10] = m22 * s; te[o + 11] = 0;
    te[o + 12] = x - s * pivX * m00; te[o + 13] = y - s * pivX * m10; te[o + 14] = z - s * pivX * m20; te[o + 15] = 1;
    return k;
  }

  setAnim(k: number, phase: number, spd: number, graze: number, lie: number, coat: number, seed: number, crouch: number, sick: number): void {
    const g = this.gait.array as Float32Array, l = this.look.array as Float32Array, f = this.fx.array as Float32Array;
    const p = k * 4;
    g[p] = phase; g[p + 1] = spd; g[p + 2] = graze; g[p + 3] = lie;
    l[p] = coat; l[p + 1] = seed; l[p + 2] = crouch; l[p + 3] = sick;
    f[p] = 0; f[p + 1] = 0; f[p + 2] = 0; f[p + 3] = 0;
  }

  end(): void {
    const m = this.mesh;
    m.count = this.count;
    m.visible = this.count > 0;
    for (const a of [m.instanceMatrix, this.gait, this.look, this.fx] as THREE.BufferAttribute[]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

/** How far a leg cycle carries a hopper at a pace (the same curve animals.ts uses for hoppers). */
function strideFor(def: ModelDef, spd: number): number {
  const p = def.params;
  const u = clamp(spd / p.strideSpeedMax, 0, 1);
  return p.strideW + (p.strideG - p.strideW) * u * u * (3 - 2 * u);
}

export interface SmallPreyOptions {
  /** Capacity params the sim ran with (the texture stores density as a share of them). */
  hareK?: number;
  dogK?: number;
  /** The engine's shared uniforms, for the hill-shadow lookup (optional: puppets then sit in the light). */
  shared?: SharedUniforms;
}

/** Where a dog yipped or an alarm began, in three coordinates (x, height, z). */
export type BarkCallback = (kind: 'alarm' | 'yip', x: number, y: number, z: number) => void;

export class SmallPreyLayer {
  readonly object3D = new THREE.Group();
  /** Sim speed multiplier (0 = paused): puppets freeze with the sim and never run faster than real time. */
  timeScale = 1;
  /** Told where a dog yips or an alarm wave starts. */
  onBark: BarkCallback | null = null;
  /** False hides the whole layer and skips its per-frame work (the performance bench compares on and off). */
  enabled = true;
  /** Alarm waves started so far (field notes and tests). */
  alarmsStarted = 0;
  /** Ignore the snapshot's predators and birds (capture scripts that want a calm town); injected threats still count. */
  ignoreThreats = false;

  private world: World;
  private hareK: number;
  private dogK: number;
  private clock = 0;
  private hasSmall = false;

  // fields, decoded from the texture
  private hare = new Float32Array(CELLS);
  private dog = new Float32Array(CELLS);
  private town = new Float32Array(CELLS);
  private plague = new Float32Array(CELLS);
  /** Metres from each cell's centre to the nearest town cell centre (Infinity when there is no town). */
  private tdist = new Float32Array(CELLS).fill(Infinity);
  private townN = 0;

  // mounds
  private moundMesh: THREE.InstancedMesh;
  private ringMesh: THREE.InstancedMesh;
  private moundN = 0;
  /** Mound positions by cell, for the dogs (x, z pairs; count per cell). */
  private cellMounds = new Float32Array(CELLS * MOUNDS_PER_CELL * 3);
  private cellMoundN = new Uint8Array(CELLS);
  private moundDirty = true;
  private moundTint = new THREE.Color();

  // puppets
  private shared: AnimalShared;
  private lit = new SceneLit();
  private dogDef: ModelDef;
  private hareDef: ModelDef;
  private dogBatch: PuppetBatch;
  private hareBatch: PuppetBatch;
  private dogs = new Map<number, Dog>();
  private hares = new Map<number, Hare>();
  private dogPool: Dog[] = [];
  private harePool: Hare[] = [];
  private dogCand: number[] = [];
  private hareCand: number[] = [];
  private refreshIn = 0;
  private tg: SharedUniforms | null = null;
  private tgMissed = false;
  private tgSource: SharedUniforms | null;
  private matSet: THREE.Material[] = [];

  // threats, from the latest snapshot
  private thrX = new Float32Array(256);
  private thrZ = new Float32Array(256);
  private thrAir = new Uint8Array(256);
  private thrN = 0;
  /** Threats from the snapshot, before the made-up ones (injectThreat) are appended. */
  private realN = 0;
  private fakes: Array<{ x: number; z: number; air: boolean; until: number }> = [];
  private alarms: Alarm[] = [];
  private lastAlarmBark = -99;
  private lastYipBark = -99;

  // fine vegetation texture clip weights
  private clipN = 0;
  private clipW = new Float32Array(0);
  private clipAny = false;

  private camX = 256;
  private camZ = 256;
  private camY = 100;
  private focX = 256;
  private focZ = 256;

  constructor(world: World, opts: SmallPreyOptions = {}) {
    this.world = world;
    this.hareK = opts.hareK ?? 3;
    this.dogK = opts.dogK ?? 4;
    this.tgSource = opts.shared ?? null;
    this.object3D.name = 'SmallPreyLayer';

    // ---- mounds
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    this.moundMesh = this.makeInstanced(buildMoundGeometry(), mat, MOUND_CAP, false);
    const ringMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.ringMesh = this.makeInstanced(buildRingGeometry(), ringMat, MOUND_CAP, false);
    this.ringMesh.renderOrder = 1;
    this.matSet.push(mat, ringMat);
    this.object3D.add(this.ringMesh, this.moundMesh);

    // ---- puppets
    const heightTex = new THREE.DataTexture(new Float32Array(world.height), world.hn, world.hn, THREE.RedFormat, THREE.FloatType);
    heightTex.needsUpdate = true;
    this.shared = {
      uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3(256, 400, 256) }, uPxK: { value: 900 / (2 * Math.tan((45 * Math.PI) / 360)) },
      tHeight: { value: heightTex }, uCell: { value: world.cell }, uHN: { value: world.hn },
      uLow: { value: 0 }, uAmb: { value: new THREE.Vector3(0.6, 0.55, 0.45) },
      probe: (scene, exposure) => {
        this.lit.probe(scene);
        this.bindTerrainShadow(scene);
        const v = this.lit.value;
        this.shared.uAmb.value.copy(v);
        this.shared.uLow.value = Math.max(1 - clamp((v.x + v.y + v.z) / 3 / 0.7, 0, 1), smooth(1.05, 1.5, exposure));
      },
    };
    this.dogDef = buildPrairieDog();
    this.hareDef = getModel(Sp.Rabbit) ?? buildPrairieDog();
    const dm = makeAnimalMaterials(Sp.PrairieDog, this.dogDef, this.shared);
    const hm = makeAnimalMaterials(Sp.Rabbit, this.hareDef, this.shared);
    for (const m of [dm.material, hm.material]) {
      const base = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        base.call(m, shader, renderer);
        if (this.tg) injectTerrainShadow(shader, this.tg);
        else this.tgMissed = true;
      };
      this.matSet.push(m);
    }
    this.dogBatch = new PuppetBatch(Sp.PrairieDog, this.dogDef, DOG_BUDGET, dm.material, dm.depth, this.shared, true);
    this.hareBatch = new PuppetBatch(Sp.Rabbit, this.hareDef, HARE_BUDGET, hm.material, hm.depth, this.shared, true);
    this.object3D.add(this.dogBatch.mesh, this.hareBatch.mesh);
    this.object3D.visible = true;
  }

  private bindTerrainShadow(scene: THREE.Object3D): void {
    if (this.tg) return;
    const tu = this.tgSource ?? (scene.userData?.tgUniforms as SharedUniforms | undefined);
    if (!tu) return;
    this.tg = tu;
    if (this.tgMissed) for (const m of this.matSet) m.needsUpdate = true;
  }

  private makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, castShadow: boolean): THREE.InstancedMesh {
    const base = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      base.call(mat, shader, renderer);
      if (this.tg) injectTerrainShadow(shader, this.tg);
      else this.tgMissed = true;
    };
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.onBeforeRender = (r, s) => {
      this.lit.probe(s);
      this.bindTerrainShadow(s);
    };
    return mesh;
  }

  // ------------------------------------------------------------------------------------------------------------------ data in

  /** A new small-prey texture (32 x 32 RGBA bytes, see Snapshot.small). */
  setSmall(bytes: Uint8Array): void {
    uploadSmall(bytes);
    this.hasSmall = true;
    const d = SMALL_DATA;
    const hk = this.hareK / 200, dk = this.dogK / 200;
    let townN = 0;
    for (let c = 0, o = 0; c < CELLS; c++, o += 4) {
      this.hare[c] = d[o] * hk;
      this.dog[c] = d[o + 1] * dk;
      this.town[c] = d[o + 2] / 255;
      this.plague[c] = d[o + 3] / 255;
      if (this.town[c] > 0.3) townN++;
    }
    this.townN = townN;
    // distance to the nearest town cell, for the alarm test
    const cs = this.world.size / SMALL_N;
    const tl: number[] = [];
    for (let c = 0; c < CELLS; c++) if (this.town[c] > 0.3) tl.push(c);
    for (let c = 0; c < CELLS; c++) {
      if (tl.length === 0) { this.tdist[c] = Infinity; continue; }
      const cx = c % SMALL_N, cy = (c / SMALL_N) | 0;
      let best = Infinity;
      for (const t of tl) {
        const dx = (t % SMALL_N) - cx, dy = ((t / SMALL_N) | 0) - cy;
        const dd = dx * dx + dy * dy;
        if (dd < best) best = dd;
      }
      this.tdist[c] = Math.sqrt(best) * cs;
    }
    this.moundDirty = true;
    this.buildClipWeights();
  }

  /** The agents of the latest snapshot (stride AGENT_STRIDE): collects the threats that set off alarms and send hares running. */
  setAgents(agents: Float32Array, count: number): void {
    let n = 0;
    for (let i = 0; i < count && n < 255 && !this.ignoreThreats; i++) {
      const o = i * AGENT_STRIDE;
      const def = SPECIES[agents[o] | 0];
      if (!def) continue;
      const ground = !def.flies && (def.guild === 'predator' || def.guild === 'mesopredator');
      // a bird counts while it is flying below ALARM_ALT (one standing at a carcass is no threat to a town)
      const air = def.flies && (def.guild === 'raptor' || def.key === 'raven') && agents[o + 7] === St.Fly && agents[o + 9] < ALARM_ALT;
      if (!ground && !air) continue;
      this.thrX[n] = agents[o + 1];
      this.thrZ[n] = agents[o + 2];
      this.thrAir[n] = ground ? 0 : 1;
      n++;
    }
    this.thrN = n;
    this.realN = n;
  }

  /** A made-up threat (a predator or a low bird) at a ground point for `seconds`: capture scripts and tests. */
  injectThreat(x: number, z: number, seconds = 8, air = false): void {
    this.fakes.push({ x, z, air, until: this.clock + seconds });
  }

  private mergeFakes(): void {
    let n = this.realN;
    for (let i = this.fakes.length - 1; i >= 0; i--) if (this.fakes[i].until < this.clock) this.fakes.splice(i, 1);
    for (const f of this.fakes) {
      if (n >= 255) break;
      this.thrX[n] = f.x; this.thrZ[n] = f.z; this.thrAir[n] = f.air ? 1 : 0;
      n++;
    }
    this.thrN = n;
  }

  // ------------------------------------------------------------------------------------------------------------------ grass clip

  /** Fine-texture weights (0..1) of the town turf: where the vegetation texture's biomass is cut down to a clipped lawn. */
  private buildClipWeights(): void {
    // the fine texture is world.n x world.n (the same grid the sim's vegetation uses)
    const n = this.world.n;
    if (this.clipN !== n) {
      this.clipN = n;
      this.clipW = new Float32Array(n * n);
    }
    const w = this.clipW;
    w.fill(0);
    this.clipAny = false;
    const per = n / SMALL_N;
    const T = this.town;
    for (let cy = 0; cy < SMALL_N; cy++) {
      for (let cx = 0; cx < SMALL_N; cx++) {
        let mx = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= SMALL_N || y >= SMALL_N) continue;
          mx = Math.max(mx, T[y * SMALL_N + x]);
        }
        if (mx < 0.1) continue;
        this.clipAny = true;
        const i0 = Math.floor(cx * per), i1 = Math.ceil((cx + 1) * per), j0 = Math.floor(cy * per), j1 = Math.ceil((cy + 1) * per);
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            // bilinear read of the coarse town field at this texel's centre (cell centres sit at half-integers)
            const fx = (i + 0.5) / per - 0.5, fy = (j + 0.5) / per - 0.5;
            const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
            const g = (x: number, y: number): number => T[clamp(y, 0, SMALL_N - 1) * SMALL_N + clamp(x, 0, SMALL_N - 1)];
            const t = (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
            w[j * n + i] = smooth(0.12, 0.6, t);
          }
        }
      }
    }
  }

  /**
   * Cut the biomass (R) of the render copy of the vegetation texture down to a clipped lawn (TURF_BIOMASS) inside towns, so the blade layer and the terrain both
   * show a clipped lawn. Call right after Engine.setVeg(...) with Engine.vegTexture.image.data, and set the texture's needsUpdate
   * again. Works on the texture only: the engine's trail memory and the smoke have already read the unclipped values.
   * (When grass.ts reads `tSmall` (smalltex.ts) itself, stop calling this.)
   */
  clipVeg(dst: Uint8Array): boolean {
    if (!this.hasSmall || !this.clipAny) return false;
    const n = this.clipN;
    if (dst.length < n * n * 4) return false;
    const w = this.clipW;
    for (let k = 0, o = 0; k < n * n; k++, o += 4) {
      const t = w[k];
      if (t > 0.001) {
        // the blade layer never goes shorter than 0.3 of full height above a biomass of 0.16, so the lawn is a biomass of at most 0.1
        const r = dst[o];
        dst[o] = (r + (Math.min(r, TURF_BIOMASS) - r) * t) | 0;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------------------------------------------------------ mounds

  private rebuildMounds(): void {
    this.moundDirty = false;
    const w = this.world;
    const cs = w.size / SMALL_N;
    const H = w.height;
    const te = this.moundMesh.instanceMatrix.array as Float32Array;
    const re = this.ringMesh.instanceMatrix.array as Float32Array;
    const col = this.moundMesh.instanceColor!.array as Float32Array;
    const rcol = this.ringMesh.instanceColor!.array as Float32Array;
    let n = 0;
    this.cellMoundN.fill(0);
    const order: number[] = [];
    for (let c = 0; c < CELLS; c++) if (this.town[c] >= 0.04) order.push(c);
    // nearest first when a huge town would overflow the instance buffer (the camera focus decides)
    if (order.length * MOUNDS_PER_CELL > MOUND_CAP) {
      order.sort((a, b) => this.cellDist(a, this.focX, this.focZ) - this.cellDist(b, this.focX, this.focZ));
    }
    const tint = this.moundTint;
    for (const c of order) {
      const t = this.town[c];
      const cx = c % SMALL_N, cy = (c / SMALL_N) | 0;
      const active = this.dog[c] > 0.3;
      // an abandoned town grasses over: the mounds go green-brown as the town fades (town falls 0.02 per base year with no colony)
      const grassed = active ? 0 : smooth(0, 0.6, 1 - t) * 0.8 + 0.12;
      for (let k = 0; k < MOUNDS_PER_CELL; k++) {
        const hk = hash(c * 131 + k * 17 + 7);
        if (t <= hk) continue;
        const x = (cx + 0.08 + 0.84 * hash(c * 977 + k * 31 + 1)) * cs;
        const z = (cy + 0.08 + 0.84 * hash(c * 613 + k * 53 + 2)) * cs;
        const wc = Math.min(w.n - 1, Math.max(0, Math.floor(z / w.cell))) * w.n + Math.min(w.n - 1, Math.max(0, Math.floor(x / w.cell)));
        if (w.water[wc]) continue;
        const nk = this.cellMoundN[c];
        const s = 0.62 + 0.3 * hash(c * 211 + k * 19 + 5);
        if (nk < MOUNDS_PER_CELL) {
          const q = (c * MOUNDS_PER_CELL + nk) * 3;
          this.cellMounds[q] = x;
          this.cellMounds[q + 1] = z;
          this.cellMounds[q + 2] = s;
          this.cellMoundN[c] = nk + 1;
        }
        if (n >= MOUND_CAP) continue;
        const y = sampleHeight(H, w.hn, w.cell, x, z);
        const a = hash(c * 331 + k * 23 + 9) * Math.PI * 2;
        const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
        const o = n * 16;
        te[o] = ca; te[o + 1] = 0; te[o + 2] = -sa; te[o + 3] = 0;
        te[o + 4] = 0; te[o + 5] = s; te[o + 6] = 0; te[o + 7] = 0;
        te[o + 8] = sa; te[o + 9] = 0; te[o + 10] = ca; te[o + 11] = 0;
        te[o + 12] = x; te[o + 13] = y - 0.02; te[o + 14] = z; te[o + 15] = 1;
        for (let q = 0; q < 16; q++) re[o + q] = te[o + q];
        re[o + 13] = y + 0.07;
        const j = 0.88 + 0.24 * hash(c * 419 + k * 29 + 3);
        tint.setRGB(j * (1 - 0.3 * grassed), j * (1 - 0.06 * grassed), j * (1 - 0.5 * grassed));
        col[n * 3] = tint.r; col[n * 3 + 1] = tint.g; col[n * 3 + 2] = tint.b;
        rcol[n * 3] = tint.r; rcol[n * 3 + 1] = tint.g; rcol[n * 3 + 2] = tint.b;
        // a grassed-over ring is thinner: shrink it in the plane
        n++;
        if (grassed > 0.5) { re[o] *= 1 - 0.5 * grassed; re[o + 2] *= 1 - 0.5 * grassed; re[o + 8] *= 1 - 0.5 * grassed; re[o + 10] *= 1 - 0.5 * grassed; }
      }
    }
    this.moundN = n;
    for (const m of [this.moundMesh, this.ringMesh]) {
      m.count = n;
      m.visible = n > 0;
      for (const a of [m.instanceMatrix, m.instanceColor!] as THREE.BufferAttribute[]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }

  private cellDist(c: number, x: number, z: number): number {
    const cs = this.world.size / SMALL_N;
    return Math.hypot(((c % SMALL_N) + 0.5) * cs - x, (((c / SMALL_N) | 0) + 0.5) * cs - z);
  }

  // ------------------------------------------------------------------------------------------------------------------ puppets: membership

  private refresh(): void {
    const cs = this.world.size / SMALL_N;
    const half = cs * 0.75;
    // ---- prairie dogs
    const dc = this.dogCand;
    dc.length = 0;
    const hc = this.hareCand;
    hc.length = 0;
    for (let c = 0; c < CELLS; c++) {
      const dg = this.dog[c], hr = this.hare[c];
      if (dg < 0.2 && hr < 0.2) continue;
      const cx = ((c % SMALL_N) + 0.5) * cs, cz = (((c / SMALL_N) | 0) + 0.5) * cs;
      const dist = Math.min(Math.hypot(cx - this.camX, cz - this.camZ), Math.hypot(cx - this.focX, cz - this.focZ)) - half;
      if (dg >= 0.2 && this.town[c] >= 0.05 && this.cellMoundN[c] > 0 && dist < DOG_RADIUS) {
        const n = Math.min(DOG_MAX_PER_CELL, Math.floor(dg * DOG_PER + hash(c * 7 + 3)));
        for (let i = 0; i < n; i++) dc.push(dist, c * 32 + i);
      }
      if (hr >= 0.2 && dist < HARE_RADIUS) {
        const n = Math.min(HARE_MAX_PER_CELL, Math.floor(hr * HARE_PER + hash(c * 11 + 5)));
        for (let i = 0; i < n; i++) hc.push(dist, c * 32 + i);
      }
    }
    this.reconcileDogs(dc);
    this.reconcileHares(hc);
  }

  /** Sort (distance, key) pairs, keep the nearest `budget`, and return the keys. */
  private nearest(cand: number[], budget: number): number[] {
    const m = cand.length / 2;
    const idx: number[] = [];
    for (let i = 0; i < m; i++) idx.push(i);
    if (m > budget) {
      idx.sort((a, b) => cand[a * 2] - cand[b * 2]);
      idx.length = budget;
    }
    return idx.map((i) => cand[i * 2 + 1]);
  }

  private reconcileDogs(cand: number[]): void {
    const keys = this.nearest(cand, DOG_BUDGET);
    for (const d of this.dogs.values()) d.seen = false;
    for (const key of keys) {
      const have = this.dogs.get(key);
      if (have) { have.seen = true; continue; }
      const nd = this.spawnDog(key);
      if (nd) { nd.seen = true; this.dogs.set(key, nd); }
    }
    for (const [key, d] of this.dogs) {
      if (d.seen) { d.leaving = false; continue; }
      // out of the set: far from the camera or already down its hole, it is simply dropped; in view it goes down first
      const far = Math.hypot(d.x - this.camX, d.z - this.camZ) > DOG_RADIUS * 0.8 && Math.hypot(d.x - this.focX, d.z - this.focZ) > DOG_RADIUS * 0.8;
      if (d.u === U_UNDER || far) { this.dogs.delete(key); this.dogPool.push(d); }
      else d.leaving = true;
    }
  }

  private spawnDog(key: number): Dog | null {
    const c = key >> 5, i = key & 31;
    const mn = this.cellMoundN[c];
    if (mn === 0) return null;
    const mi = Math.min(mn - 1, Math.floor(h2(c, i * 5 + 1) * mn));
    const mq = (c * MOUNDS_PER_CELL + mi) * 3;
    const hx = this.cellMounds[mq], hz = this.cellMounds[mq + 1];
    const h = h2(c * 64 + i, 77);
    const fdir = h2(c, i + 100) * Math.PI * 2;
    const d: Dog = this.dogPool.pop() ?? {
      key: 0, c: 0, hx: 0, hz: 0, ms: 1, sx: 0, sz: 0, h: 0, L: 24, fdir: 0, fR: 2, yipper: false, scale: 1.2, x: 0, z: 0, heading: 0, pitch: 0, dn: 0, vis: 0, phase: 0,
      u: U_UP, uT: 0, tStart: 0, sink: 0, yipped: false, dive: 0, seen: true, leaving: false, hold: 0,
    };
    d.key = key; d.c = c; d.hx = hx; d.hz = hz; d.h = h;
    d.L = 22 + 14 * h2(c, i + 200);
    d.fdir = fdir;
    d.fR = 1.4 + 1.8 * h2(c, i + 300);
    d.yipper = h > 0.45;
    d.scale = 1.2 * (0.92 + 0.16 * h2(c, i + 400));
    const sa = h2(c, i + 500) * Math.PI * 2;
    d.ms = this.cellMounds[mq + 2];
    d.sx = hx + Math.cos(sa) * 0.5 * d.ms;
    d.sz = hz + Math.sin(sa) * 0.5 * d.ms;
    d.x = d.sx; d.z = d.sz;
    d.heading = sa;
    d.pitch = 0; d.dn = 0.9; d.vis = 0; d.phase = h2(c, i + 600);
    // a new dog joins its day part-way through, or is already down the hole if a wave is passing
    d.tStart = this.clock - h2(c, i + 700) * d.L;
    d.yipped = false;
    d.sink = 0;
    d.dive = 0;
    d.uT = 0;
    // it comes up out of its burrow (a few at a time) rather than appearing on the surface
    d.leaving = false;
    d.hold = this.clock + 0.2 + 1.8 * h2(c, i + 750);
    if (this.timeScale > 0) {
      d.u = U_UNDER;
      d.sink = 1;
    } else {
      // paused: time is frozen, so nothing could come up; the dogs are simply there (or down their holes if a wave is passing)
      d.u = this.wantUnder(d) ? U_UNDER : U_UP;
      d.sink = d.u === U_UNDER ? 1 : 0;
      d.hold = this.clock;
    }
    return d;
  }

  private reconcileHares(cand: number[]): void {
    const keys = this.nearest(cand, HARE_BUDGET);
    for (const d of this.hares.values()) d.seen = false;
    for (const key of keys) {
      let d = this.hares.get(key);
      if (d) { d.seen = true; continue; }
      d = this.spawnHare(key);
      d.seen = true;
      this.hares.set(key, d);
    }
    for (const [key, d] of this.hares) {
      if (d.seen) { d.leaving = false; continue; }
      const far = Math.hypot(d.x - this.camX, d.z - this.camZ) > HARE_RADIUS * 0.8 && Math.hypot(d.x - this.focX, d.z - this.focZ) > HARE_RADIUS * 0.8;
      if (far) { this.hares.delete(key); this.harePool.push(d); }
      else if (!d.leaving) {
        d.leaving = true;
        d.leaveT = 0;
        d.st = 2; d.stT = 0; d.stDur = 99;
        d.away = Math.atan2(d.z - this.focZ, d.x - this.focX) + (d.h - 0.5) * 1.2;
      }
    }
  }

  private spawnHare(key: number): Hare {
    const c = key >> 5, i = key & 31;
    const cs = this.world.size / SMALL_N;
    const x = ((c % SMALL_N) + 0.1 + 0.8 * h2(c, i * 3 + 1)) * cs, z = (((c / SMALL_N) | 0) + 0.1 + 0.8 * h2(c, i * 3 + 2)) * cs;
    const h = h2(c, i + 900);
    const d: Hare = this.harePool.pop() ?? { key: 0, c: 0, hx: 0, hz: 0, h: 0, x: 0, z: 0, heading: 0, pitch: 0, dn: 0, vis: 0, phase: 0, st: 0, stT: 0, stDur: 6, away: 0, scale: 1.5, seen: true, leaving: false, leaveT: 0 };
    d.key = key; d.c = c; d.hx = x; d.hz = z; d.h = h;
    d.x = x; d.z = z;
    d.heading = h * Math.PI * 2;
    d.pitch = 0; d.dn = 1; d.vis = 0; d.phase = h;
    d.st = h > 0.7 ? 1 : 0;
    d.stT = h2(c, i + 950) * 8;
    d.stDur = 5 + 10 * h2(c, i + 960);
    d.away = 0;
    d.leaving = false;
    d.leaveT = 0;
    d.scale = 1.5 * (0.92 + 0.16 * h2(c, i + 970));
    return d;
  }

  // ------------------------------------------------------------------------------------------------------------------ alarms

  /** The threats of the latest snapshot start or extend alarms in towns. */
  private scanAlarms(): void {
    const cs = this.world.size / SMALL_N;
    for (let k = 0; k < this.thrN; k++) {
      const x = this.thrX[k], z = this.thrZ[k];
      const cx = Math.min(SMALL_N - 1, Math.max(0, Math.floor(x / cs))), cy = Math.min(SMALL_N - 1, Math.max(0, Math.floor(z / cs)));
      // within ALARM_TOWN_R of a town cell (the cell's own half width counts as inside it)
      if (this.tdist[cy * SMALL_N + cx] - cs * 0.5 > ALARM_TOWN_R) continue;
      this.alarmAt(x, z);
    }
  }

  private alarmAt(x: number, z: number): void {
    let free: Alarm | null = null;
    for (const a of this.alarms) {
      if (!a.live) { free = a; continue; }
      if (Math.hypot(a.x - x, a.z - z) < ALARM_MERGE) { a.last = this.clock; return; }
    }
    const a = free ?? (this.alarms.length < 12 ? (this.alarms[this.alarms.push({ x: 0, z: 0, t0: 0, last: 0, live: false }) - 1]) : null);
    if (!a) return;
    a.x = x; a.z = z; a.t0 = this.clock; a.last = this.clock; a.live = true;
    this.alarmsStarted++;
    if (this.onBark && this.clock - this.lastAlarmBark > 5) {
      const d = Math.hypot(x - this.camX, z - this.camZ);
      if (d < 170) {
        this.lastAlarmBark = this.clock;
        this.onBark('alarm', x, this.groundAt(x, z), z);
      }
    }
  }

  /** Make the valley calm at once: ignore the snapshot's threats from now on, end every alarm and drop made-up threats (capture scripts, the bench). */
  calm(): void {
    this.ignoreThreats = true;
    this.thrN = this.realN = 0;
    this.fakes.length = 0;
    for (const a of this.alarms) a.live = false;
  }

  /** Start an alarm wave at a point by hand (capture scripts, tests). */
  forceAlarm(x: number, z: number): void {
    this.alarmAt(x, z);
  }

  private groundAt(x: number, z: number): number {
    const w = this.world;
    return sampleHeight(w.height, w.hn, w.cell, x, z);
  }

  /** Should this dog be down its hole right now? (A wave has reached it and the threat has not yet been gone long enough.) */
  private wantUnder(d: Dog): boolean {
    if (d.leaving) return true;
    const now = this.clock;
    const reappear = 6 + 9 * h2(d.c, (d.key & 31) + 800);
    for (const a of this.alarms) {
      if (!a.live) continue;
      const dist = Math.hypot(d.hx - a.x, d.hz - a.z);
      if (dist > WAVE_REACH) continue;
      if (now >= a.t0 + dist / WAVE_SPEED && now < a.last + reappear) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------------------------------ frame

  /**
   * Once per frame. `focus` is the camera's ground focus (puppets near it count as near the camera). Real seconds in `dt`;
   * the puppets keep their own time (frozen while paused, never faster than real time).
   */
  update(dt: number, camera: THREE.Camera, focus?: { x: number; z: number }): void {
    if (!this.hasSmall || !this.enabled) {
      this.object3D.visible = false;
      return;
    }
    this.object3D.visible = true;
    const run = this.timeScale > 0 ? Math.min(dt, 0.1) : 0;
    this.clock += run;
    this.shared.uTime.value += dt;
    this.camX = camera.position.x; this.camY = camera.position.y; this.camZ = camera.position.z;
    if (focus) { this.focX = focus.x; this.focZ = focus.z; } else { this.focX = this.camX; this.focZ = this.camZ; }

    if (this.moundDirty) this.rebuildMounds();
    this.mergeFakes();
    this.scanAlarms();
    for (const a of this.alarms) {
      // an alarm is over once even the slowest dog (15 s) has had its time back
      if (a.live && this.clock > a.last + 16) a.live = false;
    }
    this.refreshIn -= dt;
    if (this.refreshIn <= 0) {
      this.refreshIn = 0.3;
      this.refresh();
    }
    this.drawDogs(run);
    this.drawHares(run);
  }

  private drawDogs(dt: number): void {
    const B = this.dogBatch;
    B.begin();
    const now = this.clock;
    const kEase = 1 - Math.exp(-dt * 9);
    const kTurn = 1 - Math.exp(-dt * 6);
    const w = this.world;
    for (const d of this.dogs.values()) {
      // ---- burrow state machine
      const want = this.wantUnder(d);
      if (d.u === U_UP && want) {
        d.u = U_DIVING; d.uT = 0;
        d.dive = this.rngDiveBark(d);
      } else if (d.u === U_UNDER && !want && now >= d.hold) {
        d.u = U_EMERGING; d.uT = 0;
      } else if (d.u === U_EMERGING && want) {
        d.u = U_DIVING; d.uT = 0; d.dive = 0;
      }
      d.uT += dt;
      // ---- where it is and what it is doing
      let tx = d.x, tz = d.z, pitchT = 0, dnT = 0.9, yHop = 0, yawT = d.heading, moving = false;
      let sink = 0;
      if (d.u === U_UP || d.u === U_EMERGING) {
        const u = (now - d.tStart) / d.L;
        if (u >= 1) { d.tStart += d.L; d.yipped = false; }
        if (u < 0) { // watching after a scare
          tx = d.sx; tz = d.sz; pitchT = 1.12; dnT = 0.35;
        } else if (u < 0.46) { // forage: out and back along a loop that starts and ends at the watching spot
          const s = u / 0.46;
          const ca = Math.cos(d.fdir), sa = Math.sin(d.fdir);
          const along = d.fR * Math.sin(Math.PI * s), across = d.fR * 0.45 * Math.sin(2 * Math.PI * s);
          tx = d.sx + ca * along - sa * across;
          tz = d.sz + sa * along + ca * across;
          const dAlong = d.fR * Math.PI * Math.cos(Math.PI * s), dAcross = d.fR * 0.9 * Math.PI * Math.cos(2 * Math.PI * s);
          yawT = Math.atan2(sa * dAlong + ca * dAcross, ca * dAlong - sa * dAcross);
          if (s < 0.5 && dAlong < 0) yawT = d.fdir;
          pitchT = 0; dnT = 0.95; moving = true;
        } else if (u < 0.8) { // upright, watching
          tx = d.sx; tz = d.sz; pitchT = 1.12 + 0.03 * Math.sin(now * 1.3 + d.h * 20); dnT = 0.35 + 0.1 * Math.sin(now * 0.7 + d.h * 9);
          yawT = d.heading;
          if (d.yipper) {
            const tj = (u - 0.6) * d.L;
            if (tj >= 0 && tj < 1.15) {
              const q = tj / 1.15;
              yHop = 0.2 * Math.sin(Math.PI * q);
              pitchT = 1.35; dnT = -0.55;
              if (!d.yipped && q > 0.3) {
                d.yipped = true;
                this.yipBark(d);
              }
            }
          }
        } else { // grooming: sits hunched and works at its face
          tx = d.sx; tz = d.sz; pitchT = 0.85; dnT = 1.0 + 0.18 * Math.sin(now * 9 + d.h * 30);
        }
      } else {
        // diving or hidden: run to the burrow, then drop down it
        tx = d.hx; tz = d.hz;
        if (d.u === U_DIVING) {
          const yelp = d.dive > 0 && d.uT < 0.3;
          pitchT = yelp ? 1.3 : 0.2; dnT = yelp ? -0.3 : 0.9; moving = !yelp;
          const t = d.uT - (d.dive > 0 ? 0.3 : 0);
          if (d.uT >= (d.dive > 0 ? 0.3 : 0) + 0.45) { d.u = U_UNDER; d.uT = 0; }
          sink = smooth(0.3, 0.45, t);
        } else sink = 1;
        if (d.u === U_UNDER) sink = 1;
      }
      if (d.u === U_EMERGING) {
        sink = 1 - smooth(0.05, 0.6, d.uT);
        tx = d.hx + (d.sx - d.hx) * smooth(0.3, 1.0, d.uT);
        tz = d.hz + (d.sz - d.hz) * smooth(0.3, 1.0, d.uT);
        pitchT = 1.12; dnT = 0.35;
        if (d.uT >= 1.0) { d.u = U_UP; d.tStart = now + 3 + 5 * h2(d.c, (d.key & 31) + 850); }
      }
      d.sink = sink;
      if (d.u === U_UNDER && sink >= 1) {
        // a dog that was leaving is gone for good once it is down its hole
        if (d.leaving) { this.dogs.delete(d.key); this.dogPool.push(d); }
        continue; // nothing to draw
      }

      // ---- move toward the target (a loop point is already where it should be: ease anyway to hide the handover)
      const px = d.x, pz = d.z;
      if (d.u === U_DIVING || (d.u === U_EMERGING)) {
        const kk = 1 - Math.exp(-dt * 10);
        d.x += (tx - d.x) * kk; d.z += (tz - d.z) * kk;
      } else {
        const kk = 1 - Math.exp(-dt * 16);
        d.x += (tx - d.x) * kk; d.z += (tz - d.z) * kk;
      }
      const dist = Math.hypot(d.x - px, d.z - pz);
      const spd = dt > 1e-4 ? dist / dt : 0;
      d.vis += (spd - d.vis) * 0.35;
      const vShow = moving || spd > 0.05 ? d.vis : 0;
      if (dist > 0.002 && (moving || d.u !== U_UP)) yawT = Math.atan2(d.z - pz, d.x - px);
      d.heading += wrapPi(yawT - d.heading) * kTurn;
      d.pitch += (pitchT - d.pitch) * kEase;
      d.dn += (dnT - d.dn) * kEase;
      d.phase = (d.phase + dist / (strideFor(this.dogDef, d.vis) * d.scale)) % 1;

      // ---- place it on the ground (a mound under it lifts it)
      const g = sampleHeight(w.height, w.hn, w.cell, d.x, d.z);
      const rm = Math.hypot(d.x - d.hx, d.z - d.hz);
      const y = g + moundH(rm / d.ms) * d.ms * 0.95 + yHop * d.scale - sink * 0.42;
      const k = B.add(d.x, y, d.z, d.heading, d.pitch, 0, d.scale, -0.03);
      const sick = clamp(this.plague[d.c], 0, 0.95);
      B.setAnim(k, d.phase, vShow, clamp(d.dn, -1, 1.2), 0, 0.5 + 0.4 * (d.h - 0.5), d.h, 0, sick > 0.1 ? sick : 0);
      if (B.count >= DOG_BUDGET) break;
    }
    B.end();
  }

  /** A dog about to dive barks with some probability when it is near the camera; the first dogs of a wave are the sentinels. */
  private rngDiveBark(d: Dog): number {
    const u = (this.clock - d.tStart) / d.L;
    const sentinel = u >= 0.46 && u < 0.8;
    return sentinel || d.h > 0.8 ? 1 : 0;
  }

  private yipBark(d: Dog): void {
    if (!this.onBark || this.clock - this.lastYipBark < 1.4) return;
    const dist = Math.hypot(d.x - this.camX, d.z - this.camZ);
    if (dist > 90) return;
    this.lastYipBark = this.clock;
    this.onBark('yip', d.x, this.groundAt(d.x, d.z) + 0.3, d.z);
  }

  private drawHares(dt: number): void {
    const B = this.hareBatch;
    B.begin();
    const now = this.clock;
    const w = this.world;
    const size = w.size;
    const kEase = 1 - Math.exp(-dt * 9);
    for (const d of this.hares.values()) {
      // ---- the nearest predator
      let thr = -1, best = HARE_CALM * HARE_CALM;
      for (let k = 0; k < this.thrN; k++) {
        if (this.thrAir[k]) continue;
        const dx = this.thrX[k] - d.x, dz = this.thrZ[k] - d.z;
        const q = dx * dx + dz * dz;
        if (q < best) { best = q; thr = k; }
      }
      if (d.leaving) {
        // bounding off for good: a few seconds of zigzag, then it is gone
        d.leaveT += dt;
        if (d.leaveT > 3) { this.hares.delete(d.key); this.harePool.push(d); continue; }
        thr = -1;
      }
      const near = thr >= 0 && best < HARE_FLEE_R * HARE_FLEE_R;
      if (d.st !== 2 && near) {
        d.st = 2; d.stT = 0; d.stDur = 2.2 + 1.2 * d.h;
        d.away = Math.atan2(d.z - this.thrZ[thr], d.x - this.thrX[thr]);
      } else if (d.st === 2 && thr >= 0 && !d.leaving) {
        d.away = Math.atan2(d.z - this.thrZ[thr], d.x - this.thrX[thr]);
        if (best < HARE_FLEE_R * HARE_FLEE_R * 1.3) d.stT = Math.min(d.stT, d.stDur - 1.4); // keep running while it is still close
      }
      d.stT += dt;
      let speed = 0, pitchT = 0, dnT = 1, yaw = d.heading, hop = false;
      if (d.st === 2) {
        // bound away in a zigzag: the heading swings 0.7 rad to either side of the line away from it every 0.5 to 0.7 s
        const period = 0.5 + 0.2 * d.h;
        const side = Math.sin((now / period + d.h * 7) * Math.PI) >= 0 ? 1 : -1;
        yaw = d.away + side * 0.7;
        speed = 8.5; pitchT = 0.05; dnT = 0.3; hop = true;
        if (d.stT >= d.stDur) { d.st = 3; d.stT = 0; d.stDur = 3 + 3 * d.h; }
      } else if (d.st === 3) {
        // alert: sat up, ears high, watching where it came from
        pitchT = 0.85; dnT = 0.0;
        if (d.stT >= d.stDur) { d.st = 0; d.stT = 0; d.stDur = 6 + 12 * d.h; }
      } else if (d.st === 1) {
        pitchT = 0.8; dnT = 0.05;
        if (d.stT >= d.stDur) { d.st = 0; d.stT = 0; d.stDur = 8 + 14 * d.h; }
      } else {
        // graze: a few slow hops, a pause, a few more, drifting about; head down; drawn back toward its home if it has been scared far off
        const home = Math.hypot(d.hx - d.x, d.hz - d.z);
        const wander = Math.sin(now * 0.37 + d.h * 40) + 0.6 * Math.sin(now * 0.91 + d.h * 13);
        const goHome = home > 14;
        yaw = goHome ? Math.atan2(d.hz - d.z, d.hx - d.x) : d.heading + wander * 0.02;
        const stepping = Math.sin(now * 0.8 + d.h * 31) > 0.25;
        speed = goHome ? 1.2 : stepping ? 0.28 : 0;
        hop = goHome;
        pitchT = 0.0; dnT = speed > 0 ? 0.9 : 1.0;
        if (d.stT >= d.stDur) { d.st = 1; d.stT = 0; d.stDur = 3 + 5 * d.h; }
      }
      // ---- move
      const px = d.x, pz = d.z;
      d.heading += wrapPi(yaw - d.heading) * (1 - Math.exp(-dt * (d.st === 2 ? 14 : 5)));
      d.x = clamp(d.x + Math.cos(d.heading) * speed * dt, 4, size - 4);
      d.z = clamp(d.z + Math.sin(d.heading) * speed * dt, 4, size - 4);
      const dist = Math.hypot(d.x - px, d.z - pz);
      d.vis += ((dt > 1e-4 ? dist / dt : 0) - d.vis) * 0.4;
      const gs = hop && d.st === 2 ? d.vis : Math.min(d.vis, 0.6);
      d.pitch += (pitchT - d.pitch) * kEase;
      d.dn += (dnT - d.dn) * kEase;
      // a bounding hare covers about 3 m a bound at full speed (the model's own stride is a cottontail's)
      const stride = strideFor(this.hareDef, gs) * d.scale * (d.st === 2 ? 1.6 : 1);
      d.phase = (d.phase + dist / stride) % 1;
      const g = sampleHeight(w.height, w.hn, w.cell, d.x, d.z);
      const k = B.add(d.x, g, d.z, d.heading, d.pitch, 0, d.scale, -0.05);
      B.setAnim(k, d.phase, gs, clamp(d.dn, 0, 1.1), 0, 0.45 + 0.3 * (d.h - 0.5), d.h, 0, 0);
      if (B.count >= HARE_BUDGET) break;
    }
    B.end();
  }

  // ------------------------------------------------------------------------------------------------------------------ misc

  /** Counts for debug displays and the performance bench. */
  debug(): { dogs: number; hares: number; mounds: number; towns: number; alarms: number; alarmsStarted: number; dogsUnder: number } {
    let under = 0;
    for (const d of this.dogs.values()) if (d.u === U_UNDER) under++;
    let alarms = 0;
    for (const a of this.alarms) if (a.live) alarms++;
    return { dogs: this.dogBatch.count, hares: this.hareBatch.count, mounds: this.moundN, towns: this.townN, alarms, alarmsStarted: this.alarmsStarted, dogsUnder: under };
  }

  /** Where the dogs that are up are standing, with what they are doing (0 forage, 1 watching, 2 yip, 3 groom): capture scripts aim at them. */
  visibleDogs(): Array<{ x: number; z: number; pose: number; u: number }> {
    const out: Array<{ x: number; z: number; pose: number; u: number }> = [];
    for (const d of this.dogs.values()) {
      if (d.u !== U_UP) continue;
      const u = (this.clock - d.tStart) / d.L;
      out.push({ x: d.x, z: d.z, u, pose: u < 0 ? 1 : u < 0.46 ? 0 : u < 0.8 ? (d.yipper && u > 0.6 && u < 0.6 + 1.15 / d.L ? 2 : 1) : 3 });
    }
    return out;
  }

  /** Where the hares are, with what they are doing (0 graze, 1 sit up, 2 bounding, 3 alert): capture scripts aim at them. */
  visibleHares(): Array<{ x: number; z: number; st: number }> {
    const out: Array<{ x: number; z: number; st: number }> = [];
    for (const d of this.hares.values()) if (!d.leaving) out.push({ x: d.x, z: d.z, st: d.st });
    return out;
  }

  /** Cell centres (x, z) of the biggest prairie dog town in the field, or null: capture scripts aim the camera at it. */
  biggestTown(): { x: number; z: number; cells: number } | null {
    let best = -1, bestV = 0;
    for (let c = 0; c < CELLS; c++) {
      const v = this.dog[c] + this.town[c] * 2;
      if (this.town[c] > 0.3 && v > bestV) { bestV = v; best = c; }
    }
    if (best < 0) return null;
    const cs = this.world.size / SMALL_N;
    // average the dog-weighted position of its 3 x 3 neighbourhood
    let sx = 0, sz = 0, sw = 0, cells = 0;
    const bx = best % SMALL_N, by = (best / SMALL_N) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = bx + dx, y = by + dy;
        if (x < 0 || y < 0 || x >= SMALL_N || y >= SMALL_N) continue;
        const c = y * SMALL_N + x;
        const wgt = this.dog[c] * this.town[c];
        if (this.town[c] > 0.3) cells++;
        sx += (x + 0.5) * cs * wgt; sz += (y + 0.5) * cs * wgt; sw += wgt;
      }
    }
    return sw > 0 ? { x: sx / sw, z: sz / sw, cells } : { x: (bx + 0.5) * cs, z: (by + 0.5) * cs, cells };
  }

  /** The field value of one species at a ground point (dogs or hares per cell), for the inspector and tests. */
  density(sp: number, x: number, z: number): number {
    const cs = this.world.size / SMALL_N;
    const c = Math.min(SMALL_N - 1, Math.max(0, Math.floor(z / cs))) * SMALL_N + Math.min(SMALL_N - 1, Math.max(0, Math.floor(x / cs)));
    return sp === Sp.PrairieDog ? this.dog[c] : sp === Sp.Rabbit ? this.hare[c] : 0;
  }

  dispose(): void {
    for (const m of [this.moundMesh, this.ringMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.dogBatch.mesh.geometry.dispose();
    this.hareBatch.mesh.geometry.dispose();
  }
}

// ---- geometry ---------------------------------------------------------------------------------------------------------------

/** A volcano-shaped dirt mound: a rim ring with a dark crater, base radius 0.8 m, rim 0.27 m, 14 segments. */
function buildMoundGeometry(): THREE.BufferGeometry {
  // (radius, height, r, g, b) from the outer foot inward; colours are linear
  const prof: Array<[number, number, number, number, number]> = [
    [0.82, 0.0, 0.2, 0.15, 0.1],
    [0.62, 0.1, 0.25, 0.185, 0.12],
    [0.46, 0.22, 0.29, 0.21, 0.14],
    [0.36, 0.27, 0.27, 0.2, 0.13],
    [0.24, 0.19, 0.19, 0.14, 0.09],
    [0.14, 0.09, 0.13, 0.095, 0.065],
    [0.05, 0.03, 0.05, 0.04, 0.03],
    [0.0, 0.025, 0.04, 0.03, 0.02],
  ];
  const seg = 14;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i < prof.length; i++) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      // slightly lopsided so a field of them does not look stamped
      const rr = prof[i][0] * (1 + 0.08 * Math.sin(a * 3 + 1));
      pos.push(Math.cos(a) * rr, prof[i][1], Math.sin(a) * rr);
      col.push(prof[i][2], prof[i][3], prof[i][4]);
    }
  }
  for (let i = 0; i < prof.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s, b = i * seg + ((s + 1) % seg), c = (i + 1) * seg + s, d = (i + 1) * seg + ((s + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The bare trodden ring round a burrow: a flat annulus of pale dust that fades into the turf at its outer edge. */
function buildRingGeometry(): THREE.BufferGeometry {
  const rings: Array<[number, number]> = [[0.55, 0.0], [0.8, 0.85], [1.1, 0.8], [1.5, 0.4], [1.9, 0.0]];
  const seg = 16;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i < rings.length; i++) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const rr = rings[i][0] * (1 + 0.14 * Math.sin(a * 4 + 2) + 0.07 * Math.sin(a * 7));
      pos.push(Math.cos(a) * rr, 0.0, Math.sin(a) * rr);
      col.push(0.33, 0.25, 0.16, rings[i][1] * 0.9);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s, b = i * seg + ((s + 1) % seg), c = (i + 1) * seg + s, d = (i + 1) * seg + ((s + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}
