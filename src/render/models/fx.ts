// Ecology effects owned by the animal layer: dust puffs behind running animals and trampled kill-site patches
// under carcasses. Both are lit from whatever lights the host scene has (found in onBeforeRender), so they
// follow day, dusk and night without needing the engine's uniforms.
import * as THREE from 'three';
import { CARCASS_STRIDE } from '../../sim/types';
import type { Snapshot } from '../../sim/types';
import { sampleHeight } from '../../sim/world';
import type { World } from '../../sim/world';

/** Finds the scene's key light and hemisphere light and boils them down to one ambient-ish RGB for unlit sprites. */
export class SceneLit {
  readonly value = new THREE.Vector3(0.6, 0.55, 0.45);
  private sun: THREE.DirectionalLight | null = null;
  private hemi: THREE.HemisphereLight | null = null;
  private tmp = new THREE.Vector3();

  probe(scene: THREE.Object3D): void {
    if (!this.sun || !this.hemi) {
      for (const c of scene.children) {
        if ((c as THREE.DirectionalLight).isDirectionalLight && !this.sun) this.sun = c as THREE.DirectionalLight;
        if ((c as THREE.HemisphereLight).isHemisphereLight && !this.hemi) this.hemi = c as THREE.HemisphereLight;
      }
    }
    const v = this.value.set(0, 0, 0);
    if (this.sun) {
      const d = this.tmp.copy(this.sun.position).sub(this.sun.target.position).normalize();
      const k = this.sun.intensity * Math.min(1, Math.max(0.12, d.y * 1.3)) * 0.16;
      v.x += this.sun.color.r * k;
      v.y += this.sun.color.g * k;
      v.z += this.sun.color.b * k;
    }
    if (this.hemi) {
      const k = this.hemi.intensity * 0.3;
      v.x += (this.hemi.color.r * 0.6 + this.hemi.groundColor.r * 0.4) * k;
      v.y += (this.hemi.color.g * 0.6 + this.hemi.groundColor.g * 0.4) * k;
      v.z += (this.hemi.color.b * 0.6 + this.hemi.groundColor.b * 0.4) * k;
    }
    v.x = Math.min(1.6, v.x); v.y = Math.min(1.6, v.y); v.z = Math.min(1.6, v.z);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Dust

const DUST_CAP = 7000;

/** Camera-facing puffs from a ring buffer. The vertex shader integrates position and size from the birth time. */
export class Dust {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private a = new Float32Array(DUST_CAP * 4); // x, y, z, birth
  private v = new Float32Array(DUST_CAP * 4); // vx, vy, vz, size
  private q = new Float32Array(DUST_CAP * 4); // life, seed, alpha, spare
  private attrA: THREE.InstancedBufferAttribute;
  private attrV: THREE.InstancedBufferAttribute;
  private attrQ: THREE.InstancedBufferAttribute;
  private head = 0;
  private dirty = false;
  /** Dust clock: real seconds, frozen while the sim is paused. */
  now = 0;
  private uNow = { value: 0 };
  private uColor = { value: new THREE.Vector3(0.66, 0.52, 0.36) };
  private lit: SceneLit;

  constructor(lit: SceneLit) {
    this.lit = lit;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', quad.getAttribute('position'));
    g.setIndex(quad.getIndex());
    this.attrA = new THREE.InstancedBufferAttribute(this.a, 4);
    this.attrV = new THREE.InstancedBufferAttribute(this.v, 4);
    this.attrQ = new THREE.InstancedBufferAttribute(this.q, 4);
    for (const at of [this.attrA, this.attrV, this.attrQ]) at.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.attrA);
    g.setAttribute('aV', this.attrV);
    g.setAttribute('aQ', this.attrQ);
    g.instanceCount = DUST_CAP;
    this.geo = g;
    // park every particle in the past so nothing shows until emitted
    for (let i = 0; i < DUST_CAP; i++) { this.a[i * 4 + 3] = -1e4; this.q[i * 4] = 1; }

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      uniforms: { uNow: this.uNow, uColor: this.uColor, uLit: lit as unknown as { value: THREE.Vector3 } },
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aV; attribute vec4 aQ;
        uniform float uNow;
        varying vec2 vUv; varying float vAlpha; varying float vSeed;
        void main() {
          float age = uNow - aP.w;
          float u = age / aQ.x;
          if (u < 0.0 || u > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vUv = vec2(0.0); vSeed = 0.0; return; }
          float drag = 1.0 - 0.45 * u;
          vec3 pos = aP.xyz + aV.xyz * age * drag;
          pos.y += 0.55 * age * (1.0 - 0.6 * u);
          float size = aV.w * (0.55 + 1.7 * pow(u, 0.55));
          size *= clamp(distance(cameraPosition, pos) / 130.0, 1.0, 3.2); // stay readable from the wide view
          vec4 mv = viewMatrix * vec4(pos, 1.0);
          float c = cos(aQ.y * 6.2831 + u * 0.8), s = sin(aQ.y * 6.2831 + u * 0.8);
          vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
          mv.xy += q * size;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy * 2.0;
          vSeed = aQ.y;
          vAlpha = aQ.z * smoothstep(0.0, 0.1, u) * pow(1.0 - u, 1.6);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uColor; uniform vec3 uLit;
        varying vec2 vUv; varying float vAlpha; varying float vSeed;
        void main() {
          float r = length(vUv);
          float ang = atan(vUv.y, vUv.x);
          r *= 1.0 + 0.22 * sin(ang * 3.0 + vSeed * 40.0) + 0.12 * sin(ang * 5.0 - vSeed * 17.0);
          float a = 1.0 - smoothstep(0.15, 1.0, r);
          a *= a;
          if (a * vAlpha < 0.002) discard;
          vec3 col = uColor * uLit * (0.85 + 0.3 * (1.0 - r));
          gl_FragColor = vec4(col, a * vAlpha);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = 'dust';
    this.mesh.onBeforeRender = (_r, scene) => {
      this.lit.probe(scene);
      // the ambient-occlusion G-buffer pass renders the scene with an override material: keep sprites out of it
      if (scene.overrideMaterial) g.instanceCount = 0;
    };
    this.mesh.onAfterRender = () => { g.instanceCount = DUST_CAP; };
  }

  /** Spawn a puff. (x, y, z) world, (vx, vz) drift, size in metres. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, alpha: number, seed: number): void {
    const i = this.head;
    this.head = (this.head + 1) % DUST_CAP;
    const o = i * 4;
    this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; this.a[o + 3] = this.now;
    this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz; this.v[o + 3] = size;
    this.q[o] = life; this.q[o + 1] = seed; this.q[o + 2] = alpha; this.q[o + 3] = 0;
    this.dirty = true;
  }

  /** Advance the dust clock (pass dt = 0 while paused) and upload any new particles. */
  update(dt: number): void {
    this.now += dt;
    this.uNow.value = this.now;
    if (this.dirty) {
      this.attrA.needsUpdate = true;
      this.attrV.needsUpdate = true;
      this.attrQ.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Kill sites

const PATCH_G = 8; // grid cells per side

/**
 * A dark, ragged, trampled patch of ground under each carcass. One merged mesh, rebuilt when the set of
 * carcasses changes. The patch fades slowly as the carcass is eaten so an old kill still leaves a mark.
 */
export class KillSites {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private sig = '';
  private world: World;
  private lit: SceneLit;
  private cap = 0;
  private drawCount = 0;

  constructor(world: World, lit: SceneLit) {
    this.world = world;
    this.lit = lit;
    this.geo = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uLit: lit as unknown as { value: THREE.Vector3 } },
      vertexShader: /* glsl */ `
        attribute vec4 aInfo; // uv.xy (-1..1), remaining, seed
        varying vec4 vInfo;
        void main() {
          vInfo = aInfo;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uLit;
        varying vec4 vInfo;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        void main() {
          vec2 uv = vInfo.xy;
          float r = length(uv);
          float n = vn(uv * 3.2 + vInfo.w * 31.0) * 0.6 + vn(uv * 8.0 + vInfo.w * 7.0) * 0.4;
          float edge = r + (n - 0.5) * 0.65;
          float a = 1.0 - smoothstep(0.45, 1.0, edge);
          float rem = vInfo.z;
          a *= 0.55 + 0.4 * rem;
          if (a < 0.003) discard;
          // dark stain in the middle, trampled dirt toward the rim, a few pale bone flecks late in the carcass's life
          vec3 stain = vec3(0.075, 0.032, 0.022);
          vec3 dirt = vec3(0.17, 0.115, 0.07);
          vec3 col = mix(stain, dirt, smoothstep(0.1, 0.8, edge) * 0.9);
          float fleck = step(0.93, h21(floor(uv * 14.0 + vInfo.w * 50.0))) * (1.0 - smoothstep(0.1, 0.5, rem)) * (1.0 - smoothstep(0.2, 0.7, r));
          col = mix(col, vec3(0.45, 0.42, 0.36), fleck);
          gl_FragColor = vec4(col * uLit * 1.4, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'kill-sites';
    this.mesh.onBeforeRender = (_r, scene) => {
      this.lit.probe(scene);
      if (scene.overrideMaterial) this.geo.setDrawRange(0, 0); // keep out of the AO G-buffer pass
    };
    this.mesh.onAfterRender = () => this.geo.setDrawRange(0, this.drawCount);
    this.mesh.visible = false;
  }

  setSnapshot(snap: Snapshot): void {
    const n = snap.carcassCount;
    // geometry depends on carcass positions only; the remaining fraction goes in an attribute updated every snapshot
    let sig = String(n);
    for (let k = 0; k < n; k++) sig += ',' + snap.carcasses[k * CARCASS_STRIDE].toFixed(1) + ':' + snap.carcasses[k * CARCASS_STRIDE + 1].toFixed(1);
    const w = this.world;
    const G = PATCH_G, V = (G + 1) * (G + 1);
    if (n === 0) {
      this.sig = sig;
      this.mesh.visible = false;
      return;
    }
    if (sig !== this.sig) {
      this.sig = sig;
      if (n > this.cap || !this.geo.getAttribute('position')) {
        this.cap = Math.max(16, n * 2);
        this.geo.dispose();
        this.geo = new THREE.BufferGeometry();
        this.mesh.geometry = this.geo;
        this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.cap * V * 3), 3).setUsage(THREE.DynamicDrawUsage));
        this.geo.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(this.cap * V * 4), 4).setUsage(THREE.DynamicDrawUsage));
        const idx = new Uint32Array(this.cap * G * G * 6);
        for (let c = 0; c < this.cap; c++) {
          let t = c * G * G * 6;
          for (let j = 0; j < G; j++) {
            for (let i = 0; i < G; i++) {
              const a = c * V + j * (G + 1) + i, b = a + 1, d = a + G + 1, e = d + 1;
              idx[t++] = a; idx[t++] = d; idx[t++] = b;
              idx[t++] = b; idx[t++] = d; idx[t++] = e;
            }
          }
        }
        this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
      const info = this.geo.getAttribute('aInfo') as THREE.BufferAttribute;
      const P = pos.array as Float32Array, I = info.array as Float32Array;
      for (let c = 0; c < n; c++) {
        const cx = snap.carcasses[c * CARCASS_STRIDE], cz = snap.carcasses[c * CARCASS_STRIDE + 1];
        const sp = Math.round(snap.carcasses[c * CARCASS_STRIDE + 3]);
        const R = sp === 0 ? 4.6 : sp === 3 || sp === 5 ? 2.8 : sp === 1 ? 2.4 : 1.4;
        const seed = (Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1);
        for (let j = 0; j <= G; j++) {
          for (let i = 0; i <= G; i++) {
            const u = (i / G) * 2 - 1, v = (j / G) * 2 - 1;
            const o = (c * V + j * (G + 1) + i) * 3;
            const x = cx + u * R, z = cz + v * R;
            P[o] = x;
            P[o + 1] = sampleHeight(w.height, w.hn, w.cell, x, z) + 0.12;
            P[o + 2] = z;
            const q = (c * V + j * (G + 1) + i) * 4;
            I[q] = u; I[q + 1] = v; I[q + 3] = seed;
          }
        }
      }
      pos.needsUpdate = true;
      this.drawCount = n * G * G * 6;
      this.geo.setDrawRange(0, this.drawCount);
    }
    // remaining fraction every snapshot
    if (n > 0) {
      const info = this.geo.getAttribute('aInfo') as THREE.BufferAttribute;
      const I = info.array as Float32Array;
      for (let c = 0; c < n; c++) {
        const rem = snap.carcasses[c * CARCASS_STRIDE + 2];
        for (let k = 0; k < V; k++) I[(c * V + k) * 4 + 2] = rem;
      }
      info.needsUpdate = true;
    }
    this.mesh.visible = n > 0;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
