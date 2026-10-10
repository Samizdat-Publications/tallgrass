// Ecology effects owned by the animal layer: dust puffs behind running animals and trampled kill-site patches
// under carcasses. Both are lit from whatever lights the host scene has (found in onBeforeRender), so they
// follow day, dusk and night without needing the engine's uniforms.
import * as THREE from 'three';
import { CARCASS_STRIDE, SPECIES_COUNT } from '../../sim/types';
import { SPECIES } from '../../sim/species';
import type { Snapshot } from '../../sim/types';
import { sampleHeight } from '../../sim/world';
import type { World } from '../../sim/world';

/** Radius (m) of the trampled kill-site patch by species id: bison 3.8, pronghorn and cougar 2.0, wolf 1.8, everything else 1.0. */
const KILL_R_BY_KEY: Record<string, number> = { bison: 3.8, pronghorn: 2.0, cougar: 2.0, wolf: 1.8 };
const KILL_R: number[] = SPECIES.map((s) => KILL_R_BY_KEY[s.key] ?? 1.0);

/** Finds the scene's key light and hemisphere light and boils them down to one ambient-ish RGB for unlit sprites. */
export class SceneLit {
  readonly value = new THREE.Vector3(0.6, 0.55, 0.45);
  /** The hemisphere (sky and ground bounce) share of the light, and the key light's share at its current height. */
  readonly ambient = new THREE.Vector3(0.3, 0.3, 0.3);
  readonly sunE = new THREE.Vector3(0.5, 0.45, 0.35);
  private sun: (THREE.Light & { target?: THREE.Object3D }) | null = null;
  private hemi: THREE.HemisphereLight | null = null;
  private tmp = new THREE.Vector3();

  probe(scene: THREE.Object3D): void {
    if (!this.sun || !this.hemi) {
      for (const c of scene.children) {
        const l = c as THREE.Light & { isSunLight?: boolean; isDirectionalLight?: boolean; target?: THREE.Object3D };
        // the engine uses three's SunLight (no target, direction = position); a plain DirectionalLight works too
        if ((l.isSunLight || l.isDirectionalLight) && !this.sun) this.sun = l;
        if ((c as THREE.HemisphereLight).isHemisphereLight && !this.hemi) this.hemi = c as THREE.HemisphereLight;
      }
    }
    const v = this.value.set(0, 0, 0);
    this.ambient.set(0, 0, 0);
    this.sunE.set(0, 0, 0);
    if (this.sun) {
      const d = this.tmp.copy(this.sun.position);
      if (this.sun.target) d.sub(this.sun.target.position);
      d.normalize();
      const el = Math.min(1, Math.max(0.12, d.y * 1.3));
      const k = this.sun.intensity * el * 0.1;
      v.x += this.sun.color.r * k;
      v.y += this.sun.color.g * k;
      v.z += this.sun.color.b * k;
      const ke = this.sun.intensity * el * 0.5;
      this.sunE.set(this.sun.color.r * ke, this.sun.color.g * ke, this.sun.color.b * ke);
    }
    if (this.hemi) {
      const k = this.hemi.intensity * 0.7;
      const hx = (this.hemi.color.r * 0.6 + this.hemi.groundColor.r * 0.4) * k;
      const hy = (this.hemi.color.g * 0.6 + this.hemi.groundColor.g * 0.4) * k;
      const hz = (this.hemi.color.b * 0.6 + this.hemi.groundColor.b * 0.4) * k;
      v.x += hx; v.y += hy; v.z += hz;
      this.ambient.set(hx, hy, hz);
    }
    v.x = Math.min(1.8, v.x); v.y = Math.min(1.8, v.y); v.z = Math.min(1.8, v.z);
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
  /**
   * Dust is the dry ground's own fines: a desaturated khaki taken from the soil and cured-grass tones, lit like the ground
   * around it (ambient everywhere, plus the sun where the hill-shadow map says the ground is sunlit), so a puff is never
   * whiter or brighter than the ground it sits over. Wet ground, snow and overcast skies raise no dust at all.
   */
  private uAlbedo = { value: new THREE.Vector3(0.24, 0.16, 0.1) };
  private uAmb = { value: new THREE.Vector3(0.3, 0.3, 0.3) };
  private uSun = { value: new THREE.Vector3(0.5, 0.45, 0.35) };
  private uDry = { value: 1 };
  private uWorld = { value: 512 };
  private uHasShadow = { value: 0 };
  private tShadow: { value: THREE.Texture | null } = { value: null };
  private whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  private tgU: {
    wet?: { value: number }; snow?: { value: number }; overcast?: { value: number };
    soil?: { value: THREE.Color }; grassDry?: { value: THREE.Color };
    terrainShadow?: { value: THREE.Texture | null }; worldSize?: { value: number };
  } | null = null;
  private tgTry = 0;
  /** 0 when the ground is wet, under snow or under a heavy overcast, 1 on dry ground in clear weather. Read by the emitters. */
  dryness = 1;
  /** R8: how much snow lies on the ground now, 0 none .. 1 a full pack (the engine's snow uniform), for the bison that crater through it. */
  snow = 0;
  private lit: SceneLit;

  constructor(lit: SceneLit) {
    this.lit = lit;
    this.whiteTex.needsUpdate = true;
    this.tShadow.value = this.whiteTex;
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
    for (let i = 0; i < DUST_CAP; i++) { this.a[i * 4 + 3] = -1e4; this.q[i * 4] = 1; this.q[i * 4 + 3] = 1; }

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      uniforms: {
        uNow: this.uNow, uAlbedo: this.uAlbedo, uAmb: this.uAmb, uSun: this.uSun, uDry: this.uDry, uWorld: this.uWorld,
        uHasShadow: this.uHasShadow, tShadow: this.tShadow,
      },
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aV; attribute vec4 aQ;
        uniform float uNow; uniform float uDry;
        varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vPos;
        void main() {
          float age = uNow - aP.w;
          float u = age / aQ.x;
          if (u < 0.0 || u > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; vUv = vec2(0.0); vSeed = 0.0; vPos = vec3(0.0); return; }
          float drag = 1.0 - 0.45 * u;
          vec3 pos = aP.xyz + aV.xyz * age * drag;
          pos.y += 0.3 * age * (1.0 - 0.6 * u);
          float size = aV.w * (0.6 + 0.95 * pow(u, 0.6));
          size *= clamp(distance(cameraPosition, pos) / 130.0, 1.0, 2.4); // stay readable from the wide view
          vec4 mv = viewMatrix * vec4(pos, 1.0);
          float c = cos(aQ.y * 6.2831 + u * 0.8), s = sin(aQ.y * 6.2831 + u * 0.8);
          vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
          mv.xy += q * size;
          gl_Position = projectionMatrix * mv;
          vUv = position.xy * 2.0;
          vSeed = aQ.y;
          vPos = pos;
          // fewer, fainter puffs on damp ground (aQ.w, set where the puff was raised) and none as the weather turns wet;
          // and fainter at drone range, where a herd must not wear a pale halo
          float far = 1.0 - 0.5 * smoothstep(150.0, 420.0, distance(cameraPosition, pos));
          vAlpha = aQ.z * aQ.w * uDry * far * smoothstep(0.0, 0.1, u) * pow(1.0 - u, 1.7);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uAlbedo; uniform vec3 uAmb; uniform vec3 uSun; uniform float uWorld; uniform float uHasShadow;
        uniform sampler2D tShadow;
        varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vPos;
        void main() {
          float r = length(vUv);
          float ang = atan(vUv.y, vUv.x);
          r *= 1.0 + 0.12 * sin(ang * 3.0 + vSeed * 40.0) + 0.07 * sin(ang * 5.0 - vSeed * 17.0);
          float a = 1.0 - smoothstep(0.0, 1.0, r);
          a = a * a * (0.6 + 0.4 * a);
          if (a * vAlpha < 0.002) discard;
          // lit like the ground under it: ambient everywhere, the sun only where the hills leave the ground in the light
          float vis = uHasShadow > 0.5 ? texture2D(tShadow, clamp(vPos.xz / uWorld, 0.0, 1.0)).r : 1.0;
          vec3 col = uAlbedo * (uAmb + uSun * vis) * 1.45 * (0.9 + 0.2 * (1.0 - r)); // 1.45: airborne fines catch the light a little better than the ground under them
          gl_FragColor = vec4(col, a * vAlpha);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = 'dust';
    this.mesh.onBeforeRender = (_r, scene) => {
      this.lit.probe(scene);
      this.sync(scene);
      // the ambient-occlusion G-buffer pass renders the scene with an override material: keep sprites out of it
      if (scene.overrideMaterial) g.instanceCount = 0;
    };
    this.mesh.onAfterRender = () => { g.instanceCount = DUST_CAP; };
  }

  /** Pull the weather, ground tones and hill shadows from the engine's shared uniforms (found on the scene) and the light. */
  private sync(scene: THREE.Object3D): void {
    if (!this.tgU && (this.tgTry++ & 15) === 0) this.tgU = (scene.userData?.tgUniforms as typeof this.tgU) ?? null;
    const u = this.tgU;
    if (u) {
      const wet = u.wet?.value ?? 0, snow = u.snow?.value ?? 0, over = u.overcast?.value ?? 0;
      const sm = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      this.dryness = (1 - 0.95 * sm(0.1, 0.6, wet)) * (1 - sm(0.04, 0.25, snow)) * (1 - 0.45 * over);
      this.snow = snow;
      if (u.soil && u.grassDry) {
        const s = u.soil.value, g = u.grassDry.value;
        // 55% soil, 45% cured grass, then half the colour taken out: khaki, not orange
        const r0 = s.r * 0.55 + g.r * 0.45, g0 = s.g * 0.55 + g.g * 0.45, b0 = s.b * 0.55 + g.b * 0.45;
        const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
        this.uAlbedo.value.set(r0 * 0.5 + l * 0.5, g0 * 0.5 + l * 0.5, b0 * 0.5 + l * 0.5);
      }
      const tex = u.terrainShadow?.value ?? null;
      this.tShadow.value = tex ?? this.whiteTex;
      this.uHasShadow.value = tex ? 1 : 0;
      if (u.worldSize) this.uWorld.value = u.worldSize.value;
    }
    this.uDry.value = this.dryness;
    this.uAmb.value.copy(this.lit.ambient);
    this.uSun.value.copy(this.lit.sunE);
  }

  /** Spawn a puff. (x, y, z) world, (vx, vz) drift, size in metres. `dry` 0..1: how dry the ground it was raised from is. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, alpha: number, seed: number, dry = 1): void {
    const i = this.head;
    this.head = (this.head + 1) % DUST_CAP;
    const o = i * 4;
    this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; this.a[o + 3] = this.now;
    this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz; this.v[o + 3] = size;
    this.q[o] = life; this.q[o + 1] = seed; this.q[o + 2] = alpha; this.q[o + 3] = dry;
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
 * A dark, ragged, trampled patch of ground under each carcass (a multiply, so it darkens whatever it lies on). One merged mesh, rebuilt when the set of
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
  private uSnow = { value: 0 };
  private snowU: { value: number } | null = null;
  private snowTry = 0;

  constructor(world: World, lit: SceneLit) {
    this.world = world;
    this.lit = lit;
    this.geo = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      // out = patch colour * ground colour, set explicitly (three's MultiplyBlending needs premultipliedAlpha and paints white without it)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uSnow: this.uSnow },
      vertexShader: /* glsl */ `
        attribute vec4 aInfo; // uv.xy (-1..1), remaining, seed
        attribute vec4 aCen;  // patch centre xyz, radius
        varying vec4 vInfo;
        varying float vFar;
        varying float vR;
        void main() {
          vInfo = aInfo;
          vR = aCen.w;
          // the patch grows with camera distance (up to 1.8x) so a kill is still a mark from the wide view
          float k = clamp(distance(cameraPosition, aCen.xyz) / 200.0, 1.0, 1.8);
          vFar = (k - 1.0) / 0.8;
          vec3 p = vec3(aCen.x + (position.x - aCen.x) * k, position.y, aCen.z + (position.z - aCen.z) * k);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uSnow;
        varying vec4 vInfo;
        varying float vFar;
        varying float vR;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        void main() {
          vec2 uv = vInfo.xy;
          float r = length(uv);
          float n = vn(uv * 3.2 + vInfo.w * 31.0) * 0.6 + vn(uv * 8.0 + vInfo.w * 7.0) * 0.4;
          float edge = r + (n - 0.5) * 0.65;
          float a = 1.0 - smoothstep(0.45, 1.0, edge);
          a *= smoothstep(0.12, 0.4, r); // leave the carcass itself clear
          float rem = vInfo.z;
          a *= (0.7 + 0.3 * rem) * (1.0 + 0.25 * vFar);
          // The patch MULTIPLIES whatever ground is there: a dark stain in the middle, trampled dirt toward the rim. Because it
          // scales the ground instead of painting a fixed dark colour over it, it reads as damp, trampled earth on gold
          // grass and as a rusty-grey stain on snow, never as a black ink blot.
          vec3 stain = vec3(0.36, 0.28, 0.24);
          vec3 dirt = vec3(0.7, 0.6, 0.5);
          vec3 tint = mix(stain, dirt, smoothstep(0.1, 0.8, edge) * 0.9);
          // on bright snow the same multiply would read as an ink blot: keep only a faint trampled-slush mark
          tint = mix(tint, vec3(0.86, 0.84, 0.86), 0.7 * clamp(uSnow, 0.0, 1.0));
          vec3 base = mix(vec3(1.0), tint, min(a * 0.9, 0.85));
          // r-idle: a fresh kill (most of the meat still on it) has blood on the ground, but as a few small irregular stains of different
          // strength round and under the body, not one flat red disc. A cell grid in metres (so a bison's are bigger than a wolf's); each
          // cell may hold one blob with its own radius and strength, its edge roughened by noise. The stains MULTIPLY the ground like the
          // patch (a dark red-brown, so snow and grass light them as they light themselves) and fade as the carcass is eaten.
          float fresh = smoothstep(0.55, 0.97, rem);
          float cs = 0.16 + 0.09 * vR;
          vec2 q = uv * vR;
          vec2 cid = floor(q / cs);
          float spot = 0.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 id = cid + vec2(float(i), float(j)) + vInfo.w * 17.0;
              if (h21(id) < 0.3) continue;
              vec2 cc = (cid + vec2(float(i), float(j)) + 0.2 + 0.6 * vec2(h21(id + 3.1), h21(id + 7.7))) * cs;
              float rad = cs * (0.22 + 0.38 * h21(id + 11.3));
              float dd = length(q - cc) + (vn(q * 11.0 + vInfo.w * 5.0) - 0.5) * cs * 0.4;
              spot = max(spot, (1.0 - smoothstep(rad * 0.5, rad, dd)) * (0.45 + 0.55 * h21(id + 19.9)));
            }
          }
          spot *= 1.0 - smoothstep(0.16, 0.36, r); // round and under the body, none out in the grass
          vec3 blood = mix(vec3(1.0), vec3(0.34, 0.12, 0.1), clamp(spot * fresh, 0.0, 0.92));
          if (a < 0.003 && spot * fresh < 0.01) discard;
          gl_FragColor = vec4(base * blood, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'kill-sites';
    this.mesh.onBeforeRender = (_r, scene) => {
      this.lit.probe(scene);
      if (!this.snowU && (this.snowTry++ & 15) === 0) {
        const tu = scene.userData?.tgUniforms as { snow?: { value: number } } | undefined;
        if (tu?.snow) this.snowU = tu.snow;
      }
      this.uSnow.value = this.snowU?.value ?? 0;
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
        this.geo.setAttribute('aCen', new THREE.BufferAttribute(new Float32Array(this.cap * V * 4), 4).setUsage(THREE.DynamicDrawUsage));
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
      const cen = this.geo.getAttribute('aCen') as THREE.BufferAttribute;
      const P = pos.array as Float32Array, I = info.array as Float32Array, C = cen.array as Float32Array;
      for (let c = 0; c < n; c++) {
        const cx = snap.carcasses[c * CARCASS_STRIDE], cz = snap.carcasses[c * CARCASS_STRIDE + 1];
        const sp = Math.round(snap.carcasses[c * CARCASS_STRIDE + 3]);
        const R = KILL_R[sp] ?? 1.0;
        const seed = (Math.abs(Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1);
        for (let j = 0; j <= G; j++) {
          for (let i = 0; i <= G; i++) {
            const u = (i / G) * 2 - 1, v = (j / G) * 2 - 1;
            const o = (c * V + j * (G + 1) + i) * 3;
            const x = cx + u * R, z = cz + v * R;
            P[o] = x;
            P[o + 1] = sampleHeight(w.height, w.hn, w.cell, x, z) + 0.5; // rides on the grass canopy so it is visible from above
            P[o + 2] = z;
            const q = (c * V + j * (G + 1) + i) * 4;
            I[q] = u; I[q + 1] = v; I[q + 3] = seed;
            C[q] = cx; C[q + 1] = 0; C[q + 2] = cz; C[q + 3] = R;
          }
        }
      }
      pos.needsUpdate = true;
      cen.needsUpdate = true;
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

// ---------------------------------------------------------------------------------------------------------
// Distance markers

/**
 * [r, g, b, size in px on a 900 px tall viewport, max alpha, solo] per species id. Only the predators have one: a faint
 * soft glint around the animal from about 170 m out (a pack of wolves is 2 to 3% of the animals, so without it they are
 * lost in a wide shot). The herds need none: their boosted bodies already read, and the coat is lifted for range in the
 * shader (see ModelDef.far).
 */
const MARKER: Array<[number, number, number, number, number, boolean] | null> = SPECIES.map((s) => {
  switch (s.key) {
    case 'wolf': return [0.82, 0.83, 0.85, 12, 0.05, true]; // a faint neutral glint under the grey body
    case 'cougar': return [0.95, 0.8, 0.55, 18, 0.08, true]; // a warm one
    default: return null; // every other species (including ones with no entry yet) gets no marker
  }
});

/** A marker is only drawn when at least this many of the same species share a ~24 m neighbourhood: herds and packs, never loners. */
const CLUSTER_MIN = 3;
const CLUSTER_CELL = 24;
/** Markers are fully off inside this camera distance, and fade in over the next FADE_LEN meters. */
const NEAR_OFF = 170;
const FADE_LEN = 130;
/** Chase ripples are for the wide view only: gone inside 200 m, full strength by about 330 m. */
const PING_NEAR = 200;
const PING_FAR = 330;
/** Ripple tint per predator species id (linear-ish rgb) and strength: cool slate for wolves, warm umber for cougars. */
const PING_TINT: Record<number, [number, number, number, number]> = Object.fromEntries(
  SPECIES.flatMap((s): Array<[number, [number, number, number, number]]> =>
    s.key === 'wolf' ? [[s.id, [0.7, 0.71, 0.74, 0.24]]] : s.key === 'cougar' ? [[s.id, [0.82, 0.6, 0.36, 0.28]]] : [],
  ),
);
/** Ripple tint for a hunter with no tint of its own: the wolf's. */
const PING_TINT_DEFAULT: [number, number, number, number] = [0.7, 0.71, 0.74, 0.24];
const PING_CELL = 14;
const PING_CAP = 256;
/** An animal this many pixels long (without the minimum-size boost) is already readable: no marker. */
const PX_SHOW = 4.5;
const PX_HIDE = 6.5;

/**
 * Quiet readability aids for the high drone view, all hidden up close:
 *  - a very faint small glint under each predator (wolf, cougar) from about 170 m out, fully in by 300 m (see MARKER);
 *  - a slow, thin, species-tinted ripple on the ground around a predator that is chasing (from about 200 m), so the hunt
 *    is where the eye goes.
 */
export class Markers {
  /** The dots (depth tested, so a ridge hides them). */
  readonly mesh: THREE.Mesh;
  /** The hunt ripples: rings lying on the ground, drawn over the scene. */
  readonly pingMesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pingGeo: THREE.InstancedBufferGeometry;
  private cap = 4096;
  private p = new Float32Array(this.cap * 4); // x, y, z, size px
  private c = new Float32Array(this.cap * 4); // r, g, b, max alpha
  // staging for the cluster test: species, x, y, z, natural px length, scale
  private st = new Float32Array(this.cap * 8);
  // hunt ripples: staged (x, y, z, strength), de-duplicated per ~14 m cell, then written as instances
  private ping = new Float32Array(PING_CAP * 4);
  private pingSeen = new Set<number>();
  private pingN = 0;
  private pingP = new Float32Array(PING_CAP * 4); // x, y, z, size px
  private pingC = new Float32Array(PING_CAP * 4); // r, g, b, max alpha
  private pingK = new Float32Array(PING_CAP * 4); // seed, spare
  private attrP: THREE.InstancedBufferAttribute;
  private attrC: THREE.InstancedBufferAttribute;
  private attrPP: THREE.InstancedBufferAttribute;
  private attrPC: THREE.InstancedBufferAttribute;
  private attrPK: THREE.InstancedBufferAttribute;
  private n = 0; // dots drawn
  private m = 0; // dots staged
  private uView = { value: new THREE.Vector2(1600, 900) };
  private uNear = { value: NEAR_OFF };
  private uFar = { value: NEAR_OFF + FADE_LEN };
  private uBright = { value: 1 };
  private uNow = { value: 0 };
  private uPxK = { value: 1086 };
  private lit = new SceneLit();
  private tmpV = new THREE.Vector2();
  // camera state cached from the last render, for CPU-side culling
  private cam = new THREE.Vector3(256, 400, 256);
  private pxK = 1086; // pixels per meter at 1 m on a 900 px tall viewport
  private grid: Int32Array;
  private gridN: number;

  constructor(worldSize = 512) {
    this.gridN = Math.ceil(worldSize / CLUSTER_CELL) + 2;
    this.grid = new Int32Array(SPECIES_COUNT * this.gridN * this.gridN);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setIndex(quad.getIndex());
    this.attrP = new THREE.InstancedBufferAttribute(this.p, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrC = new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aP', this.attrP);
    this.geo.setAttribute('aC', this.attrC);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      uniforms: { uView: this.uView, uNear: this.uNear, uFar: this.uFar, uBright: this.uBright },
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aC;
        uniform vec2 uView; uniform float uNear; uniform float uFar;
        varying vec2 vUv; varying vec4 vCol;
        uniform float uBright;
        void main() {
          float dist = distance(cameraPosition, aP.xyz);
          float fade = smoothstep(uNear, uFar, dist);
          vUv = position.xy * 2.0;
          vCol = vec4(aC.rgb * uBright, aC.a * fade);
          vec4 clip = projectionMatrix * viewMatrix * vec4(aP.xyz + vec3(0.0, 0.6, 0.0), 1.0);
          float px = aP.w * uView.y / 900.0;
          clip.xy += position.xy * px * 2.0 / uView * clip.w;
          if (fade <= 0.001) clip = vec4(2.0, 2.0, 2.0, 1.0);
          gl_Position = clip;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          float r = length(vUv);
          // a small soft glint, brightest just off the animal's centre so it halos the body without veiling it
          float a = smoothstep(0.0, 0.35, r) * (1.0 - smoothstep(0.35, 1.0, r));
          a *= a;
          if (a * vCol.a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb, a * vCol.a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    this.mesh.name = 'markers';
    this.mesh.onBeforeRender = (r, scene, camera) => {
      const s = r.getDrawingBufferSize(this.tmpV);
      this.uView.value.copy(s);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        this.cam.setFromMatrixPosition(camera.matrixWorld);
        this.pxK = 900 / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
        this.uPxK.value = this.pxK;
      }
      this.uNow.value = (performance.now() / 1000) % 1000;
      this.lit.probe(scene);
      const lv = this.lit.value;
      this.uBright.value = Math.min(1, Math.max(0.3, 0.3 + 0.7 * ((lv.x + lv.y + lv.z) / 3 / 0.7)));
      if (scene.overrideMaterial) this.geo.instanceCount = 0;
      else this.geo.instanceCount = this.n;
    };
    this.mesh.onAfterRender = () => { this.geo.instanceCount = this.n; };

    // ---- hunt ripples: a ring lying on the ground that keeps its size on screen, growing and fading out slowly
    this.pingGeo = new THREE.InstancedBufferGeometry();
    this.pingGeo.setAttribute('position', quad.getAttribute('position'));
    this.pingGeo.setIndex(quad.getIndex());
    this.attrPP = new THREE.InstancedBufferAttribute(this.pingP, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrPC = new THREE.InstancedBufferAttribute(this.pingC, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrPK = new THREE.InstancedBufferAttribute(this.pingK, 4).setUsage(THREE.DynamicDrawUsage);
    this.pingGeo.setAttribute('aP', this.attrPP);
    this.pingGeo.setAttribute('aC', this.attrPC);
    this.pingGeo.setAttribute('aK', this.attrPK);
    this.pingGeo.instanceCount = 0;
    const pingMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide,
      uniforms: { uView: this.uView, uNow: this.uNow, uPxK: this.uPxK, uBright: this.uBright },
      vertexShader: /* glsl */ `
        attribute vec4 aP; attribute vec4 aC; attribute vec4 aK;
        uniform vec2 uView; uniform float uNow; uniform float uPxK; uniform float uBright;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          float dist = distance(cameraPosition, aP.xyz);
          float fade = smoothstep(${PING_NEAR.toFixed(1)}, ${PING_FAR.toFixed(1)}, dist);
          // a slow ripple: from a small circle to about three times that while it fades out
          float ph = fract(uNow * 0.4 + aK.x);
          float size = aP.w * (0.45 + 1.15 * ph);
          // seen from straight above (the map view) the rings crowd the herds, so they thin out there
          float steep = smoothstep(0.72, 0.95, (cameraPosition.y - aP.y) / dist);
          float a = aC.a * fade * (1.0 - 0.65 * steep) * pow(1.0 - ph, 1.4) * smoothstep(0.0, 0.12, ph);
          // metres across so that it keeps its size in pixels, lying flat just above the ground
          float world = size * (uView.y / 900.0) * dist / uPxK;
          vec3 wp = aP.xyz + vec3(position.x * world, 1.0, position.y * world);
          vUv = position.xy * 2.0;
          vCol = vec4(aC.rgb * uBright, a);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          if (fade <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          float r = length(vUv);
          float a = smoothstep(0.8, 0.88, r) * (1.0 - smoothstep(0.92, 0.98, r));
          if (a * vCol.a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb, a * vCol.a);
        }`,
    });
    this.pingMesh = new THREE.Mesh(this.pingGeo, pingMat);
    this.pingMesh.frustumCulled = false;
    this.pingMesh.renderOrder = 26;
    this.pingMesh.name = 'hunt-ripples';
    this.pingMesh.onBeforeRender = (_r, scene) => {
      if (scene.overrideMaterial) this.pingGeo.instanceCount = 0;
      else this.pingGeo.instanceCount = this.pingN;
    };
    this.pingMesh.onAfterRender = () => { this.pingGeo.instanceCount = this.pingN; };
  }

  begin(): void {
    this.m = 0;
    this.n = 0;
    this.pingN = 0;
    this.pingSeen.clear();
  }

  /** Stage a marker candidate. `length` is the animal's true length in meters (before any screen-size boost). */
  add(sp: number, x: number, y: number, z: number, length: number, scale: number): void {
    const mk = MARKER[sp];
    if (!mk) return;
    const dx = x - this.cam.x, dy = y - this.cam.y, dz = z - this.cam.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < NEAR_OFF * NEAR_OFF) return; // fully faded: skip the work
    const px = (length * scale * this.pxK) / Math.sqrt(d2);
    if (px > PX_HIDE && !mk[5]) return;
    if (this.m >= this.cap) this.grow();
    const o = this.m++ * 8;
    const st = this.st;
    st[o] = sp; st[o + 1] = x; st[o + 2] = y; st[o + 3] = z; st[o + 4] = px; st[o + 5] = scale;
  }

  /** A chase ripple at (x, y, z) for predator species sp: one per ~14 m neighbourhood however many animals are in it. */
  addPing(sp: number, x: number, y: number, z: number): void {
    if (this.pingN >= PING_CAP) return;
    const dx = x - this.cam.x, dy = y - this.cam.y, dz = z - this.cam.z;
    if (dx * dx + dy * dy + dz * dz < PING_NEAR * PING_NEAR) return;
    const key = Math.floor(x / PING_CELL) * 4099 + Math.floor(z / PING_CELL);
    if (this.pingSeen.has(key)) return;
    this.pingSeen.add(key);
    const o = this.pingN++ * 4;
    this.ping[o] = x; this.ping[o + 1] = y; this.ping[o + 2] = z; this.ping[o + 3] = sp;
  }

  /** Run the cluster test and write the surviving markers. */
  end(): void {
    const G = this.gridN, st = this.st;
    let n = 0;
    if (this.m > 0) {
      this.grid.fill(0);
      const cellOf = (v: number) => Math.min(G - 1, Math.max(0, Math.floor(v / CLUSTER_CELL)));
      for (let k = 0; k < this.m; k++) {
        const o = k * 8;
        this.grid[(st[o] * G + cellOf(st[o + 3])) * G + cellOf(st[o + 1])]++;
      }
      for (let k = 0; k < this.m; k++) {
        const o = k * 8;
        const sp = st[o];
        const mk = MARKER[sp];
        if (!mk) continue;
        const gi = cellOf(st[o + 1]), gj = cellOf(st[o + 3]);
        // count this cell plus its 4 neighbours so a herd straddling a cell edge still counts as a herd
        let cnt = this.grid[(sp * G + gj) * G + gi];
        if (gi > 0) cnt += this.grid[(sp * G + gj) * G + gi - 1];
        if (gi < G - 1) cnt += this.grid[(sp * G + gj) * G + gi + 1];
        if (gj > 0) cnt += this.grid[(sp * G + gj - 1) * G + gi];
        if (gj < G - 1) cnt += this.grid[(sp * G + gj + 1) * G + gi];
        if (cnt < CLUSTER_MIN && !mk[5]) continue;
        const px = st[o + 4];
        const readable = mk[5] ? 1 : 1 - Math.min(1, Math.max(0, (px - PX_SHOW) / (PX_HIDE - PX_SHOW)));
        const dense = mk[5] ? 1 : Math.min(1, (cnt - CLUSTER_MIN + 1) / 5);
        const a = mk[4] * readable * (0.45 + 0.55 * dense);
        if (a < 0.02) continue;
        const q = n++ * 4;
        this.p[q] = st[o + 1]; this.p[q + 1] = st[o + 2]; this.p[q + 2] = st[o + 3];
        this.p[q + 3] = mk[3] * Math.sqrt(Math.min(1.4, Math.max(0.5, st[o + 5])));
        this.c[q] = mk[0]; this.c[q + 1] = mk[1]; this.c[q + 2] = mk[2]; this.c[q + 3] = a;
      }
    }
    this.n = n;
    this.geo.instanceCount = this.n;
    for (const a of [this.attrP, this.attrC]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * 4); a.needsUpdate = true; }

    for (let i = 0; i < this.pingN; i++) {
      const o = i * 4;
      const seed = (Math.abs(Math.sin(this.ping[o] * 12.9898 + this.ping[o + 2] * 78.233) * 43758.5453) % 1);
      const tint = PING_TINT[this.ping[o + 3]] ?? PING_TINT_DEFAULT;
      this.pingP[o] = this.ping[o]; this.pingP[o + 1] = this.ping[o + 1]; this.pingP[o + 2] = this.ping[o + 2]; this.pingP[o + 3] = 22;
      this.pingC[o] = tint[0]; this.pingC[o + 1] = tint[1]; this.pingC[o + 2] = tint[2]; this.pingC[o + 3] = tint[3];
      this.pingK[o] = seed; this.pingK[o + 1] = 0; this.pingK[o + 2] = 0; this.pingK[o + 3] = 0;
    }
    this.pingGeo.instanceCount = this.pingN;
    for (const a of [this.attrPP, this.attrPC, this.attrPK]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.pingN * 4); a.needsUpdate = true; }
  }

  private grow(): void {
    const cap = this.cap * 2;
    const p = new Float32Array(cap * 4); p.set(this.p);
    const c = new Float32Array(cap * 4); c.set(this.c);
    const st = new Float32Array(cap * 8); st.set(this.st);
    this.p = p; this.c = c; this.st = st; this.cap = cap;
    this.attrP = new THREE.InstancedBufferAttribute(p, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrC = new THREE.InstancedBufferAttribute(c, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aP', this.attrP);
    this.geo.setAttribute('aC', this.attrC);
  }

  /** Distance range (m) over which dots fade in. */
  setRange(near: number, far: number): void { this.uNear.value = near; this.uFar.value = far; }

  dispose(): void {
    this.geo.dispose();
    this.pingGeo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.pingMesh.material as THREE.Material).dispose();
  }
}
