// Smoke plumes over burning ground: a pool of soft billboard puffs (one instanced draw, a few hundred at most) that rise from
// cells the vegetation texture marks as burning (B = 255), bend downwind, swell and fade. Lit like a volume: warm on the sun side,
// cool and dark on the shaded side, forward-scattered when seen against the sun, and glowing orange near the flames.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { NOISE_GLSL, SharedUniforms, clamp } from './common';

const MAX_PUFFS = 440;
const MAX_CELLS = 6000;

export class Smoke {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private aPos: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;

  // pool state (structure of arrays)
  private px = new Float32Array(MAX_PUFFS);
  private py = new Float32Array(MAX_PUFFS);
  private pz = new Float32Array(MAX_PUFFS);
  private vx = new Float32Array(MAX_PUFFS);
  private vy = new Float32Array(MAX_PUFFS);
  private vz = new Float32Array(MAX_PUFFS);
  private age = new Float32Array(MAX_PUFFS).fill(-1); // < 0 means dead
  private life = new Float32Array(MAX_PUFFS);
  private size0 = new Float32Array(MAX_PUFFS);
  private size1 = new Float32Array(MAX_PUFFS);
  private seed = new Float32Array(MAX_PUFFS);
  private heat = new Float32Array(MAX_PUFFS);
  private order = new Uint16Array(MAX_PUFFS);
  private keys = new Float32Array(MAX_PUFFS);

  private cells = new Int32Array(MAX_CELLS);
  private cellCount = 0;
  private burning = 0;
  private spawnAcc = 0;
  private rng = 12345;
  private live = 0;
  private cell: number;
  private n: number;

  constructor(world: World, private shared: SharedUniforms, private heightAt: (x: number, z: number) => number) {
    this.cell = world.cell;
    this.n = world.n;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('uv', quad.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aData', this.aData);
    this.geo.instanceCount = 0;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(world.size / 2, 30, world.size / 2), world.size);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uLightDir: shared.lightDir,
        uLightColor: shared.lightColor,
        uSkyMid: shared.skyMid,
        uSkyHorizon: shared.skyHorizon,
        uTime: shared.time,
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPos;
        attribute vec4 aData; // x: age 0..1, y: size (m), z: seed, w: heat 0..1
        varying vec2 vUv;
        varying vec4 vData;
        varying vec3 vWorld;
        void main() {
          vUv = position.xy * 2.0;
          vData = aData;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float rot = aData.z * 6.2831 + aData.x * (aData.z - 0.5) * 1.6;
          float cs = cos(rot), sn = sin(rot);
          vec2 q = vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs);
          vec3 wp = aPos + (right * q.x + up * q.y) * aData.y;
          vWorld = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        varying vec4 vData;
        varying vec3 vWorld;
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        uniform float uTime;
        ${NOISE_GLSL}
        void main() {
          float r2 = dot(vUv, vUv);
          if (r2 >= 1.0) discard;
          float age = vData.x;
          // ragged edge: a few octaves of noise eat into the disc so every puff is a different cloud
          vec2 nuv = vUv * 1.6 + vec2(vData.z * 17.0, vData.z * 9.0) + vec2(0.0, -age * 0.8);
          float n = tgFbm2(nuv);
          float body = clamp(1.0 - r2, 0.0, 1.0);
          float dens = smoothstep(0.0, 0.55, body * (0.55 + 0.9 * n) - 0.12);
          // fade in fast (it leaves the flames), thin out as it rises
          float fadeIn = smoothstep(0.0, 0.07, age);
          float fadeOut = pow(1.0 - age, 1.6);
          float alpha = dens * fadeIn * fadeOut * 0.62;
          if (alpha < 0.004) discard;

          // lit like a little volume: a disc normal against the light (view space), forward scattering against the sun
          vec3 nrm = vec3(vUv, sqrt(max(1.0 - r2, 0.0)));
          vec3 Lv = normalize(mat3(viewMatrix) * uLightDir);
          float wrap = clamp(dot(nrm, Lv) * 0.5 + 0.5, 0.0, 1.0);
          vec3 V = normalize(cameraPosition - vWorld);
          float fwd = pow(max(dot(-V, uLightDir), 0.0), 3.0);
          vec3 amb = (uSkyMid * 0.75 + uSkyHorizon * 0.25) * 0.9 + vec3(0.012);
          vec3 albedo = mix(vec3(0.20, 0.185, 0.17), vec3(0.42, 0.40, 0.38), age) * (0.8 + 0.5 * n);
          vec3 col = albedo * (amb + uLightColor * (0.16 + 0.5 * wrap * wrap) + uLightColor * fwd * 0.5);
          // flames light the young smoke from below
          float glow = vData.w * smoothstep(0.32, 0.0, age);
          col += vec3(2.2, 0.62, 0.12) * glow * (0.35 + 0.65 * n) * (0.5 + 0.5 * (1.0 - vUv.y));
          gl_FragColor = vec4(min(max(col, vec3(0.0)), vec3(32.0)), alpha);
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'smoke';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** Feed the latest vegetation bytes (RGBA8, n x n): collects the cells that are burning right now (B = 255). */
  setVeg(data: Uint8Array): void {
    const N2 = this.n * this.n;
    let k = 0, total = 0;
    for (let c = 0, o = 2; c < N2; c++, o += 4) {
      if (data[o] === 255) {
        total++;
        if (k < MAX_CELLS) this.cells[k++] = c;
        else {
          // reservoir sampling keeps the list representative when a huge fire exceeds the cap
          const r = (this.rand() * total) | 0;
          if (r < MAX_CELLS) this.cells[r] = c;
        }
      }
    }
    this.cellCount = k;
    this.burning = total;
  }

  get burningCells(): number { return this.burning; }

  private rand(): number {
    // xorshift32, deterministic and cheap
    let x = this.rng | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rng = x;
    return ((x >>> 0) % 1000003) / 1000003;
  }

  private spawn(): void {
    // find a dead slot
    let slot = -1;
    for (let i = 0; i < MAX_PUFFS; i++) if (this.age[i] < 0) { slot = i; break; }
    if (slot < 0 || this.cellCount === 0) return;
    const c = this.cells[(this.rand() * this.cellCount) | 0];
    const ci = c % this.n, cj = (c / this.n) | 0;
    const x = (ci + this.rand()) * this.cell, z = (cj + this.rand()) * this.cell;
    this.px[slot] = x;
    this.pz[slot] = z;
    this.py[slot] = this.heightAt(x, z) + 0.6;
    const w = this.shared.wind.value;
    this.vx[slot] = w.x * 0.4;
    this.vz[slot] = w.y * 0.4;
    this.vy[slot] = 2.0 + this.rand() * 2.2;
    this.age[slot] = 0;
    this.life[slot] = 8 + this.rand() * 5;
    this.size0[slot] = 2.4 + this.rand() * 1.6;
    this.size1[slot] = 9 + this.rand() * 6;
    this.seed[slot] = this.rand();
    this.heat[slot] = 0.7 + 0.3 * this.rand();
  }

  update(dt: number, camera: THREE.Camera): void {
    dt = Math.min(dt, 0.1);
    const w = this.shared.wind.value;
    const windSpeed = 1.2 + 6.5 * clamp(w.z, 0, 1);
    // spawn rate scales with the burning area (soft cap so a huge fire does not eat the pool)
    if (this.cellCount > 0) {
      const rate = Math.min(58, 3 + this.burning * 0.45);
      this.spawnAcc += rate * dt;
      while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.spawn(); }
    } else this.spawnAcc = 0;

    const kRel = 1 - Math.exp(-dt / 2.4);
    const decay = Math.exp(-dt * 0.1);
    let live = 0;
    const cam = camera.position;
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.age[i] < 0) continue;
      this.age[i] += dt / this.life[i];
      if (this.age[i] >= 1) { this.age[i] = -1; continue; }
      this.vx[i] += (w.x * windSpeed - this.vx[i]) * kRel;
      this.vz[i] += (w.y * windSpeed - this.vz[i]) * kRel;
      this.vy[i] *= decay;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const dx = this.px[i] - cam.x, dy = this.py[i] - cam.y, dz = this.pz[i] - cam.z;
      this.keys[live] = dx * dx + dy * dy + dz * dz;
      this.order[live++] = i;
    }
    this.live = live;
    // back to front
    const idx: number[] = new Array(live);
    for (let k = 0; k < live; k++) idx[k] = k;
    idx.sort((a, b) => this.keys[b] - this.keys[a]);
    const pa = this.aPos.array as Float32Array, da = this.aData.array as Float32Array;
    for (let k = 0; k < live; k++) {
      const i = this.order[idx[k]];
      pa[k * 3] = this.px[i]; pa[k * 3 + 1] = this.py[i]; pa[k * 3 + 2] = this.pz[i];
      const a = this.age[i];
      // grows fast at first then slows (puffs billow out, then drift)
      const g = 1 - Math.pow(1 - a, 2.2);
      da[k * 4] = a;
      da[k * 4 + 1] = this.size0[i] + (this.size1[i] - this.size0[i]) * g;
      da[k * 4 + 2] = this.seed[i];
      da[k * 4 + 3] = this.heat[i];
    }
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
    this.geo.instanceCount = live;
    this.mesh.visible = live > 0;
  }

  get liveCount(): number { return this.live; }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
