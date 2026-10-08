// Water contact effects for the animal layer: a splash (a few droplet sprites thrown up and a ring ripple) where a running animal's feet go
// into water, and a small wake ring for a wading animal. Two instanced draws on ring buffers (no per-frame allocation: emitting writes into
// preallocated typed arrays), near the camera only (the animal layer checks the range), lit from the scene's lights like the dust (SceneLit).
import * as THREE from 'three';
import type { SceneLit } from './fx';

const DROP_CAP = 384;
const RING_CAP = 160;
const G = 9.8;

const COMMON = /* glsl */ `
uniform float uNow;
uniform vec3 uAmb;
uniform vec3 uSun;
`;

export class Splash {
  readonly drops: THREE.Mesh;
  readonly rings: THREE.Mesh;
  /** Splash clock: real seconds, frozen while the sim is paused. */
  now = 0;
  private uNow = { value: 0 };
  private uAmb = { value: new THREE.Vector3(0.3, 0.3, 0.3) };
  private uSun = { value: new THREE.Vector3(0.5, 0.45, 0.35) };
  private dP = new Float32Array(DROP_CAP * 4); // x, y, z, birth
  private dV = new Float32Array(DROP_CAP * 4); // vx, vy, vz, size
  private dQ = new Float32Array(DROP_CAP * 4); // life, seed, alpha, spare
  private rP = new Float32Array(RING_CAP * 4); // x, y, z, birth
  private rQ = new Float32Array(RING_CAP * 4); // life, radius at birth, radius at death, alpha
  private attrs: THREE.InstancedBufferAttribute[] = [];
  private dHead = 0;
  private rHead = 0;
  private dirtyD = false;
  private dirtyR = false;
  /** The clock time after which nothing emitted so far is still alive (the meshes hide themselves after it). */
  private busyUntil = 0;
  private dGeo: THREE.InstancedBufferGeometry;
  private rGeo: THREE.InstancedBufferGeometry;
  private lit: SceneLit;

  constructor(lit: SceneLit) {
    this.lit = lit;
    const quad = new THREE.PlaneGeometry(1, 1);
    const mk = (cap: number, a: Float32Array, b: Float32Array, nameB: string, c?: Float32Array): THREE.InstancedBufferGeometry => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', quad.getAttribute('position'));
      g.setIndex(quad.getIndex());
      const aa = new THREE.InstancedBufferAttribute(a, 4);
      const bb = new THREE.InstancedBufferAttribute(b, 4);
      for (const at of [aa, bb]) { at.setUsage(THREE.DynamicDrawUsage); this.attrs.push(at); }
      g.setAttribute('aP', aa);
      g.setAttribute(nameB, bb);
      if (c) {
        const cc = new THREE.InstancedBufferAttribute(c, 4);
        cc.setUsage(THREE.DynamicDrawUsage);
        this.attrs.push(cc);
        g.setAttribute('aQ', cc);
      }
      g.instanceCount = cap;
      return g;
    };
    for (let i = 0; i < DROP_CAP; i++) { this.dP[i * 4 + 3] = -1e4; this.dQ[i * 4] = 1; }
    for (let i = 0; i < RING_CAP; i++) { this.rP[i * 4 + 3] = -1e4; this.rQ[i * 4] = 1; }
    this.dGeo = mk(DROP_CAP, this.dP, this.dV, 'aV', this.dQ);
    this.rGeo = mk(RING_CAP, this.rP, this.rQ, 'aQ');
    const uniforms = { uNow: this.uNow, uAmb: this.uAmb, uSun: this.uSun };

    const dropMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false, uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aV; attribute vec4 aQ;
        ${COMMON}
        varying vec2 vUv; varying float vAlpha;
        void main() {
          float age = uNow - aP.w;
          float u = age / aQ.x;
          if (u < 0.0 || u > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vUv = vec2(0.0); return; }
          vec3 pos = aP.xyz + aV.xyz * age;
          pos.y -= 0.5 * ${G.toFixed(1)} * age * age;
          // stay readable from further out: a droplet is a few centimetres across
          float size = aV.w * clamp(distance(cameraPosition, pos) / 14.0, 1.0, 5.0) * (1.0 - 0.3 * u);
          vec4 mv = viewMatrix * vec4(pos, 1.0);
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy * 2.0;
          vAlpha = aQ.z * smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.7, 1.0, u));
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${COMMON}
        varying vec2 vUv; varying float vAlpha;
        void main() {
          float r = length(vUv);
          float a = (1.0 - smoothstep(0.35, 1.0, r)) * vAlpha;
          if (a < 0.01) discard;
          vec3 col = vec3(0.86, 0.93, 1.0) * (uAmb * 1.5 + uSun * 0.8);
          gl_FragColor = vec4(min(col, vec3(2.5)), a);
        }`,
    });
    this.drops = new THREE.Mesh(this.dGeo, dropMat);

    const ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false, uniforms,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aQ;
        ${COMMON}
        varying vec2 vUv; varying float vAlpha;
        void main() {
          float age = uNow - aP.w;
          float u = age / aQ.x;
          if (u < 0.0 || u > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vUv = vec2(0.0); return; }
          float rad = mix(aQ.y, aQ.z, 1.0 - (1.0 - u) * (1.0 - u));
          // keep it visible from the wide views: the ring widens with distance (a ripple a metre across is a pixel at 100 m)
          rad *= clamp(distance(cameraPosition, aP.xyz) / 40.0, 1.0, 2.5);
          vec3 pos = aP.xyz + vec3(position.x, 0.0, -position.y) * rad * 2.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
          vUv = position.xy * 2.0;
          vAlpha = aQ.w * smoothstep(0.0, 0.08, u) * pow(1.0 - u, 1.4);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${COMMON}
        varying vec2 vUv; varying float vAlpha;
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          // an outer crest and a fainter inner one
          float ring = smoothstep(0.62, 0.86, r) * (1.0 - smoothstep(0.88, 1.0, r));
          float inner = smoothstep(0.28, 0.42, r) * (1.0 - smoothstep(0.44, 0.58, r)) * 0.45;
          float a = (ring + inner) * vAlpha;
          if (a < 0.01) discard;
          vec3 col = vec3(0.82, 0.9, 0.97) * (uAmb * 1.15 + uSun * 0.3);
          gl_FragColor = vec4(min(col, vec3(2.0)), a);
        }`,
    });
    this.rings = new THREE.Mesh(this.rGeo, ringMat);

    for (const [m, name, order, g, cap] of [[this.drops, 'splash-drops', 21, this.dGeo, DROP_CAP], [this.rings, 'splash-rings', 21, this.rGeo, RING_CAP]] as Array<[THREE.Mesh, string, number, THREE.InstancedBufferGeometry, number]>) {
      m.frustumCulled = false;
      m.renderOrder = order;
      m.name = name;
      m.visible = false;
      m.onBeforeRender = (_r, scene) => {
        this.lit.probe(scene);
        this.uAmb.value.copy(this.lit.ambient);
        this.uSun.value.copy(this.lit.sunE);
        // the ambient-occlusion G-buffer pass renders the scene with an override material: keep sprites out of it
        if (scene.overrideMaterial) g.instanceCount = 0;
      };
      m.onAfterRender = () => { g.instanceCount = cap; };
    }
  }

  /**
   * A splash where feet go into water: `n` droplets thrown up and out, and a ring. (x, y, z) world, y the water surface; `power` 0..1+ scales the
   * height and spread (a gallop is 1); `size` is the animal's size scale (1 for a wolf); (dx, dz) is the direction it travels (unit), which
   * the spray leans into.
   */
  splash(x: number, y: number, z: number, power: number, size: number, dx: number, dz: number, seed: number, n = 5): void {
    const t = this.now;
    for (let i = 0; i < n; i++) {
      const o = this.dHead * 4;
      this.dHead = (this.dHead + 1) % DROP_CAP;
      const a = (seed * 17.31 + i * 2.399) % (Math.PI * 2);
      const r = 0.06 + 0.1 * size * ((seed * 7.7 + i * 0.37) % 1);
      const sp = (0.5 + 1.6 * power) * (0.5 + ((seed * 3.1 + i * 0.61) % 1));
      const vy = (1.6 + 2.6 * power) * (0.6 + 0.8 * ((seed * 5.9 + i * 0.83) % 1)) * Math.sqrt(size);
      this.dP[o] = x + Math.cos(a) * r; this.dP[o + 1] = y + 0.04; this.dP[o + 2] = z + Math.sin(a) * r; this.dP[o + 3] = t;
      this.dV[o] = Math.cos(a) * sp * 0.6 + dx * sp * 0.7; this.dV[o + 1] = vy; this.dV[o + 2] = Math.sin(a) * sp * 0.6 + dz * sp * 0.7;
      this.dV[o + 3] = 0.022 + 0.02 * size * ((seed * 2.3 + i * 0.29) % 1);
      const life = (2 * vy) / G;
      this.dQ[o] = life; this.dQ[o + 1] = seed; this.dQ[o + 2] = 0.8; this.dQ[o + 3] = 0;
      this.busyUntil = Math.max(this.busyUntil, t + life);
    }
    this.ring(x, y, z, 0.25 * size, (0.9 + 0.9 * power) * size, 1.0 + 0.4 * power, 0.45);
    this.dirtyD = true;
  }

  /** A ripple ring on the surface: radius from `r0` to `r1` metres over `life` seconds. */
  ring(x: number, y: number, z: number, r0: number, r1: number, life: number, alpha: number): void {
    const o = this.rHead * 4;
    this.rHead = (this.rHead + 1) % RING_CAP;
    this.rP[o] = x; this.rP[o + 1] = y + 0.03; this.rP[o + 2] = z; this.rP[o + 3] = this.now;
    this.rQ[o] = life; this.rQ[o + 1] = r0; this.rQ[o + 2] = r1; this.rQ[o + 3] = alpha;
    this.busyUntil = Math.max(this.busyUntil, this.now + life);
    this.dirtyR = true;
  }

  /** Advance the clock (pass dt = 0 while paused) and upload any new particles. */
  update(dt: number): void {
    this.now += dt;
    this.uNow.value = this.now;
    if (this.dirtyD) { this.attrs[0].needsUpdate = true; this.attrs[1].needsUpdate = true; this.attrs[2].needsUpdate = true; this.dirtyD = false; }
    if (this.dirtyR) { this.attrs[3].needsUpdate = true; this.attrs[4].needsUpdate = true; this.dirtyR = false; }
    const live = this.now < this.busyUntil;
    this.drops.visible = live;
    this.rings.visible = live;
  }

  dispose(): void {
    this.dGeo.dispose();
    this.rGeo.dispose();
    (this.drops.material as THREE.Material).dispose();
    (this.rings.material as THREE.Material).dispose();
  }
}
