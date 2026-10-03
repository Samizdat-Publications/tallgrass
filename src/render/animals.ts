// AnimalLayer: instanced, vertex-animated animals driven by sim snapshots.
//
// One InstancedMesh per species. Per-instance matrix (position, yaw, terrain pitch/roll, scale) is built on the
// CPU; the gait, graze, rest, carcass and wing poses are evaluated in the vertex shader (see models/shader.ts)
// from two vec4 instance attributes. Snapshots arrive at 10 to 60 Hz; positions and headings are interpolated
// between the previous and current snapshot by id.
import * as THREE from 'three';
import { AGENT_STRIDE, CARCASS_STRIDE, F_INFECTED, SPECIES_COUNT, Sp, St } from '../sim/types';
import type { Snapshot } from '../sim/types';
import { sampleHeight } from '../sim/world';
import type { World } from '../sim/world';
import { getModel } from './models';
import type { AnimParams, ModelDef } from './models';
import { makeAnimalMaterials } from './models/shader';
import type { AnimalShared } from './models/shader';
import { Dust, KillSites, SceneLit } from './models/fx';

const INITIAL_CAPACITY = [2048, 512, 512, 1024, 1024, 128]; // by species id

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const wrapPi = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const hash01 = (n: number): number => (Math.imul(n | 0, 0x9e3779b1) >>> 8) / 16777216;

/** Dust kicked up by fast movers: [min speed m/s, puffs per second per m/s over the minimum, puff size m, alpha]. */
const DUST: Array<[number, number, number, number] | null> = [
  [5, 0.9, 1.9, 0.2], // bison
  [5, 0.8, 1.1, 0.17], // wolf
  null, // raven
  [6, 0.5, 1.1, 0.16], // pronghorn
  null, // rabbit
  [5, 0.6, 1.1, 0.16], // cougar
];

function strideFreq(p: AnimParams, spd: number): number {
  if (spd < 0.05) return 0;
  const u = clamp(spd / p.strideSpeedMax, 0, 1);
  const s = u * u * (3 - 2 * u);
  const stride = p.strideW + (p.strideG - p.strideW) * s;
  return Math.min(6, spd / stride);
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
    this.gait.setUsage(THREE.DynamicDrawUsage);
    this.look.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aGait', this.gait);
    g.setAttribute('aLook', this.look);
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
      // the min-screen-size boost in the vertex shader needs the viewing camera (not the shadow camera)
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
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
  private shared: AnimalShared = { uTime: this.uTime, uCamPos: { value: new THREE.Vector3(256, 400, 256) }, uPxK: { value: 900 / (2 * Math.tan((45 * Math.PI) / 360)) } };
  private lit = new SceneLit();
  private dust: Dust;
  private kills: KillSites;
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

  private timeSec = 0;
  private lastSnapT = -1;
  private snapDt = 0.1;
  private lastAlpha = 1;

  private selectedId: number | null = null;
  private ring: THREE.Mesh;
  private ringGeo: THREE.PlaneGeometry;
  private ringBase: Float32Array;
  private ringMat: THREE.MeshBasicMaterial;
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
    this.object3D.add(this.kills.mesh, this.dust.mesh);

    // Selection ring: a soft glowing ring that hugs the terrain under the selected animal.
    const N = 24;
    this.ringGeo = new THREE.PlaneGeometry(2, 2, N, N);
    this.ringGeo.rotateX(-Math.PI / 2);
    const pos = this.ringGeo.getAttribute('position') as THREE.BufferAttribute;
    this.ringBase = new Float32Array(pos.array as Float32Array);
    const tex = makeRingTexture();
    this.ringMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      color: 0xffd98a, fog: false, toneMapped: false,
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
      }
      S.stamp[slot] = this.gen;
      this.currSlot[i] = slot;
      const j = this.prevMap.get(id);
      this.prevOf[i] = j === undefined ? -1 : j;
      const sp = ag[i * AGENT_STRIDE] | 0;
      if (sp >= 0 && sp < SPECIES_COUNT) this.counts[sp]++;
    }
    // free the slots of animals that are gone
    for (const [id, slot] of S.map) {
      if (S.stamp[slot] !== this.gen) {
        S.map.delete(id);
        S.free.push(slot);
      }
    }
    for (let k = 0; k < snap.carcassCount; k++) {
      const sp = Math.round(snap.carcasses[k * CARCASS_STRIDE + 3]);
      if (sp >= 0 && sp < SPECIES_COUNT) this.carcassCounts[sp]++;
    }
    for (let sp = 0; sp < SPECIES_COUNT; sp++) this.batches[sp].ensure(this.counts[sp] + this.carcassCounts[sp], this.object3D);
    this.kills.setSnapshot(snap);
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
      let x = x1, z = z1, h = h1, alt = alt1, sc = sc1, turn = 0, climb = 0;
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
        turn = dh / snapDt;
        alt = P[q + 9] + (alt1 - P[q + 9]) * alpha;
        climb = (alt1 - P[q + 9]) / snapDt;
        sc = P[q + 5] + (sc1 - P[q + 5]) * alpha;
      }

      // animation state targets
      const spdT = spd1 * this.timeScale;
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
        S.spd[slot] = spdT;
        S.hdn[slot] = hdT;
        S.lie[slot] = lieT;
        S.crouch[slot] = crT;
        S.flap[slot] = flapT;
      }
      S.spd[slot] += (spdT - S.spd[slot]) * k8;
      S.hdn[slot] += (hdT - S.hdn[slot]) * kHead;
      S.lie[slot] += (lieT - S.lie[slot]) * kLie;
      S.crouch[slot] += (crT - S.crouch[slot]) * kCrouch;
      S.flap[slot] += (flapT - S.flap[slot]) * kHead;
      const sickT = (A[o + 8] | 0) & F_INFECTED ? 0.98 : 0;
      S.sick[slot] += (sickT - S.sick[slot]) * kSick;
      const sickK = S.sick[slot];
      const spdS = S.spd[slot];
      S.phase[slot] = (S.phase[slot] + dt * strideFreq(pr, spdS) * (1 - 0.3 * sickK)) % 1;

      // pose on the terrain
      const vs = sc * this.speciesScale[sp];
      const ch = Math.cos(h), sh = Math.sin(h);
      const ground = sampleHeight(H, hn, cell, x, z);
      let pitch = 0, roll = 0, y = ground;
      if (sp === Sp.Raven) {
        y = ground + alt;
        const v = Math.max(spdT, 0.5);
        const bankT = clamp(Math.atan((v * turn) / 9.81), -0.75, 0.75);
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
        const lean = clamp(spdT * turn * 0.03, -0.12, 0.12);
        S.bank[slot] += (lean - S.bank[slot]) * kBank;
        roll += S.bank[slot];
      }
      this.writeInstance(b, x, y, z, ch, sh, pitch, roll, vs);

      // dust kicked up by fast movers
      const dp = DUST[sp];
      if (dp && dustRate > 0 && spdS > dp[0] && (state === St.Run || state === St.Flee || state === St.Chase)) {
        S.dust[slot] += dt * dp[1] * (spdS - dp[0]) * dustRate;
        let guard = 2;
        while (S.dust[slot] >= 1 && guard-- > 0) {
          S.dust[slot] -= 1;
          const ci = Math.min(world.n - 1, Math.max(0, Math.floor(x / cell))), cj = Math.min(world.n - 1, Math.max(0, Math.floor(z / cell)));
          if (world.water[cj * world.n + ci]) continue;
          const back = -0.3 * pr.length * vs, side = (Math.random() - 0.5) * 0.35 * pr.length * vs;
          const px = x + ch * back - sh * side, pz = z + sh * back + ch * side;
          const drift = -0.1 * spdS;
          this.dust.emit(
            px, sampleHeight(H, hn, cell, px, pz) + 0.15, pz,
            ch * drift + (Math.random() - 0.5) * 0.9, 0.3 + Math.random() * 0.5, sh * drift + (Math.random() - 0.5) * 0.9,
            dp[2] * vs * (0.75 + 0.5 * Math.random()), 1.3 + Math.random() * 1.0, dp[3] * (0.7 + 0.6 * Math.random()), Math.random(),
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
      gait[gp + 1] = spdS;
      gait[gp + 2] = sp === Sp.Raven ? (S.hdn[slot] > 0.5 ? 1 : S.flap[slot]) : S.hdn[slot];
      gait[gp + 3] = S.lie[slot];
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
      const h = seed * Math.PI * 2;
      const ch = Math.cos(h), sh = Math.sin(h);
      const ground = sampleHeight(H, hn, cell, x, z);
      const hl = b.def.params.length * 0.3;
      const hF = sampleHeight(H, hn, cell, x + ch * hl, z + sh * hl);
      const hB = sampleHeight(H, hn, cell, x - ch * hl, z - sh * hl);
      const pitch = Math.atan2(hF - hB, 2 * hl);
      this.writeInstance(b, x, ground, z, ch, sh, pitch, 0, 1);
      const k = b.count - 1;
      const gp = k * 4;
      const gait = b.gait.array as Float32Array;
      const look = b.look.array as Float32Array;
      gait[gp] = 0;
      gait[gp + 1] = -1;
      gait[gp + 2] = clamp(rem, 0, 1);
      gait[gp + 3] = 0;
      look[gp] = seed;
      look[gp + 1] = seed;
      look[gp + 2] = 0;
      look[gp + 3] = 0;
      b.ids[k] = 0;
      b.centers[k * 4 + 3] = 0; // not pickable
    }

    for (const b of this.batches) {
      const m = b.mesh;
      m.count = b.count;
      m.visible = b.count > 0;
      const used = b.count;
      const attrs: THREE.BufferAttribute[] = [m.instanceMatrix, b.gait, b.look];
      for (const a of attrs) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, used * a.itemSize);
        a.needsUpdate = true;
      }
    }
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
    const R = si.r * (1 + 0.04 * Math.sin(this.timeSec * 3));
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
    this.ringMat.opacity = 0.75 + 0.25 * Math.sin(this.timeSec * 4);
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
    this.dust.dispose();
    this.kills.dispose();
    this.ringGeo.dispose();
    this.ringMat.map?.dispose();
    this.ringMat.dispose();
  }
}

function makeRingTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2;
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0.0, 'rgba(255,230,160,0.06)');
  grad.addColorStop(0.55, 'rgba(255,230,160,0.10)');
  grad.addColorStop(0.68, 'rgba(255,240,190,0.55)');
  grad.addColorStop(0.78, 'rgba(255,245,210,1.0)');
  grad.addColorStop(0.86, 'rgba(255,230,160,0.45)');
  grad.addColorStop(0.96, 'rgba(255,220,140,0.0)');
  grad.addColorStop(1.0, 'rgba(255,220,140,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
