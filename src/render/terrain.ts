// Terrain: a heightfield mesh over the 512 m world plus a coarse far-field ring out to the horizon, one
// MeshStandardMaterial extended with a ground-color shader driven by the vegetation texture and static data,
// and a GPU horizon-shadow pass so hills shade valleys at golden hour at any distance.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { World } from '../sim/world';
import { sampleHeight } from '../sim/world';
import {
  HEIGHT_GLSL, NOISE_GLSL, SharedUniforms, clamp, fbm2, injectSafeOutput, injectTerrainShadow, smoothstep, vnoise2,
} from './common';

const SHADOW_RES = 256;
const FAR_RES = 512;
const EXT_CELL = 4;
const FAR_ORIGIN = -768;
const FAR_SIZE = 2048;

/**
 * Render heights: the sim's creek bed profile ignores the terrain beside it, so the creek can sit above lowland
 * next to it and its cell-based water mask is jagged. Reshape a corridor around the creek centerline into a smooth
 * channel (circular cross-section, water half-width 4.6 m) with a low bank that blends back into the sim terrain.
 * Ponds are untouched. Differences from sim heights stay inside ~14 m of the creek.
 */
function shapeCreek(world: World): { height: Float32Array; creekDist: Float32Array } {
  const { n, hn, cell, creek } = world;
  const out = Float32Array.from(world.height);
  const nc = creek.length / 2;
  const R = 15;
  // cumulative arc length along the centerline, so width and bank height can vary with distance downstream
  const arc = new Float32Array(nc);
  for (let k = 1; k < nc; k++) arc[k] = arc[k - 1] + Math.hypot(creek[2 * k] - creek[2 * k - 2], creek[2 * k + 1] - creek[2 * k - 1]);
  const arcAt = new Float32Array(hn * hn);
  const dC = new Float32Array(hn * hn).fill(1e9);
  const px = new Float32Array(hn * hn);
  const pz = new Float32Array(hn * hn);
  for (let k = 0; k < nc - 1; k++) {
    const ax = creek[2 * k], az = creek[2 * k + 1], bx = creek[2 * k + 2], bz = creek[2 * k + 3];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) / cell)), i1 = Math.min(hn - 1, Math.ceil((Math.max(ax, bx) + R) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R) / cell)), j1 = Math.min(hn - 1, Math.ceil((Math.max(az, bz) + R) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * cell, z = j * cell;
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t, qz = az + dz * t;
        const d = Math.hypot(x - qx, z - qz);
        const v = j * hn + i;
        if (d < dC[v]) { dC[v] = d; px[v] = qx; pz[v] = qz; arcAt[v] = arc[k] + t * Math.sqrt(l2); }
      }
    }
  }
  // surface height of the water at the nearest centerline point
  const surfAt = (x: number, z: number): number => {
    const ci = Math.min(n - 1, Math.max(0, Math.floor(x / cell))), cj = Math.min(n - 1, Math.max(0, Math.floor(z / cell)));
    let best = NaN, bd = 1e9;
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const ii = ci + di, jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const c = jj * n + ii;
        if (!world.water[c]) continue;
        const d = Math.hypot(di, dj);
        if (d < bd) { bd = d; best = world.waterHeight[c]; }
      }
    }
    return best;
  };
  for (let v = 0; v < hn * hn; v++) {
    const d = dC[v];
    if (d > R) continue;
    const sv = surfAt(px[v], pz[v]);
    if (Number.isNaN(sv)) continue;
    const sim = world.height[v];
    let h: number;
    const along = arcAt[v];
    // channel half-width wanders 3.0 to 5.6 m and the bank height varies, so the creek never reads as a straight canal
    const W = 3.0 + 2.6 * vnoise2(along * 0.028, 3.7, 5);
    const bankH = 0.28 + 0.42 * vnoise2(along * 0.06 + 9.0, 1.3, 9);
    if (d < W) {
      const u = d / W;
      h = sv - 0.5 * (1 - u * u);
    } else {
      const hb = sv + bankH * smoothstep(W, W + 3.0, d);
      const j = smoothstep(W + 3.0, R, d);
      h = hb * (1 - j) + sim * j;
    }
    out[v] = h;
  }
  return { height: out, creekDist: dC };
}

/** Separable box blur on a square grid (edge clamped). */
function boxBlur(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  const pre = new Float64Array(n + 1);
  for (let j = 0; j < n; j++) {
    pre[0] = 0;
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[j * n + i];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - r), b = Math.min(n - 1, i + r);
      tmp[j * n + i] = (pre[b + 1] - pre[a]) / (b - a + 1);
    }
  }
  for (let i = 0; i < n; i++) {
    pre[0] = 0;
    for (let j = 0; j < n; j++) pre[j + 1] = pre[j] + tmp[j * n + i];
    for (let j = 0; j < n; j++) {
      const a = Math.max(0, j - r), b = Math.min(n - 1, j + r);
      out[j * n + i] = (pre[b + 1] - pre[a]) / (b - a + 1);
    }
  }
  return out;
}

/** 1D box blur along x (axis 0) or z (axis 1) on a square grid (edge clamped). */
function boxBlur1(src: Float32Array, n: number, r: number, axis: 0 | 1): Float32Array {
  const out = new Float32Array(n * n);
  const pre = new Float64Array(n + 1);
  for (let a = 0; a < n; a++) {
    pre[0] = 0;
    for (let b = 0; b < n; b++) pre[b + 1] = pre[b] + (axis === 0 ? src[a * n + b] : src[b * n + a]);
    for (let b = 0; b < n; b++) {
      const lo = Math.max(0, b - r), hi = Math.min(n - 1, b + r);
      const v = (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
      if (axis === 0) out[a * n + b] = v; else out[b * n + a] = v;
    }
  }
  return out;
}

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  readonly heightTex: THREE.DataTexture;
  readonly staticTex: THREE.DataTexture;
  readonly shadowRT: THREE.WebGLRenderTarget;
  readonly shadowFarRT: THREE.WebGLRenderTarget;
  private extHeightTex!: THREE.DataTexture;
  private shadowQuad: FullScreenQuad;
  private shadowMat: THREE.ShaderMaterial;
  private lastLight = new THREE.Vector3(9, 9, 9);
  private lastLightFar = new THREE.Vector3(9, 9, 9);
  private world: World;
  /**
   * Height of the rendered terrain surface at any world position, including outside the playable 512 m square.
   * Matches the mesh triangulation exactly (within a few cm of the sim's bilinear heightAt inside the world).
   */
  readonly heightAt: (x: number, z: number) => number;
  /** Terrain heights as rendered (sim heights with creek banks lifted); hn * hn like world.height. */
  readonly renderHeight: Float32Array;
  /** Distance in meters from each height vertex to the creek centerline (large far from it). */
  readonly creekDist: Float32Array;
  private heightFn!: (x: number, z: number) => number;
  private axis: Float32Array | null = null;
  private hts: Float32Array | null = null;

  constructor(world: World, private shared: SharedUniforms) {
    this.world = world;
    const { size, hn, cell } = world;

    // ---- render heights: smooth creek channel and banks (see shapeCreek)
    const shaped = shapeCreek(world);
    this.creekDist = shaped.creekDist;
    // Near the border the ground is blurred along the border only (60 m window), so rim bumps and the creek notch do not extrude
    // outward as streaks, while the profile across the border (the rim slope) is untouched. The far ring then continues that profile.
    // The sim raises a 22 m bowl wall over the last 82 m of every edge (world.ts). Seen from above that wall frames the playable
    // square like a picture frame, so the render takes most of it back out (never near the creek, whose banks are already shaped).
    for (let j = 0; j < hn; j++) {
      for (let i = 0; i < hn; i++) {
        const u = i / (hn - 1), v = j / (hn - 1);
        const edge = Math.min(u, 1 - u, v, 1 - v);
        if (edge >= 0.16) continue;
        const up = 22 * Math.pow((0.16 - edge) / 0.16, 2);
        const wc = smoothstep(10, 34, shaped.creekDist[j * hn + i]);
        shaped.height[j * hn + i] -= 0.62 * up * wc;
      }
    }
    const blurred = boxBlur(boxBlur(shaped.height, hn, 20), hn, 20);
    const Lx = boxBlur1(shaped.height, hn, 45, 0);
    const Lz = boxBlur1(shaped.height, hn, 45, 1);
    this.renderHeight = Float32Array.from(shaped.height);
    for (let j = 0; j < hn; j++) {
      for (let i = 0; i < hn; i++) {
        const dX = Math.min(i, hn - 1 - i) * cell, dZ = Math.min(j, hn - 1 - j) * cell;
        const dE = Math.min(dX, dZ);
        const w = smoothstep(60, 0, dE);
        if (w <= 0) continue;
        // tangent of the nearest edge, blended continuously: left/right edges run along z (Lz), top/bottom along x (Lx)
        const wz = smoothstep(-30, 30, dZ - dX);
        const L = wz * Lz[j * hn + i] + (1 - wz) * Lx[j * hn + i];
        this.renderHeight[j * hn + i] = shaped.height[j * hn + i] * (1 - w) + L * w;
      }
    }
    const rh = this.renderHeight;

    // ---- data textures
    this.heightTex = new THREE.DataTexture(new Float32Array(rh), hn, hn, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.generateMipmaps = false;
    this.heightTex.needsUpdate = true;
    this.heightTex.name = 'terrain.height';

    const n = world.n;
    const st = new Uint8Array(n * n * 4);
    for (let k = 0; k < n * n; k++) {
      st[k * 4] = Math.round(clamp(world.moisture[k], 0, 1) * 255);
      st[k * 4 + 1] = Math.round(clamp(world.cover[k], 0, 1) * 255);
      st[k * 4 + 2] = Math.round(clamp(world.capacity[k], 0, 1) * 255);
      st[k * 4 + 3] = Math.round(clamp(world.waterDist[k] / 64, 0, 1) * 255);
    }
    this.staticTex = new THREE.DataTexture(st, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.staticTex.minFilter = this.staticTex.magFilter = THREE.LinearFilter;
    this.staticTex.wrapS = this.staticTex.wrapT = THREE.ClampToEdgeWrapping;
    this.staticTex.generateMipmaps = false;
    this.staticTex.needsUpdate = true;
    this.staticTex.name = 'terrain.static';

    shared.heightTex.value = this.heightTex;
    shared.staticTex.value = this.staticTex;

    // ---- height function with far-field extension
    const S = size;
    // Beyond the playable square the boundary profile (rim, creek gap) is blurred and faded into a rim baseline
    // so nothing gets extruded outward as a straight canyon, then the rim keeps rising and rolls into hazy hills.
    let rimSum = 0, rimCount = 0;
    for (let i = 0; i < hn; i++) {
      rimSum += blurred[i] + blurred[(hn - 1) * hn + i] + blurred[i * hn] + blurred[i * hn + hn - 1];
      rimCount += 4;
    }
    const rimBase = rimSum / rimCount;
    const L = 75;
    // Far ring: continues the border height with the rim's outward slope easing to zero (C1 at the border, no crease).
    const Lg = 50;
    const gClamp = (g: number) => clamp(g, -0.3, 0.85);
    // extension along x at row zc, then along z: each continues the border height with the slope easing out (C1 across every border
    // and corner, so no crease or crack along the extension of an edge)
    const extX = (x: number, zc: number): number => {
      const cx = clamp(x, 0, S);
      const hb = sampleHeight(rh, hn, cell, cx, zc);
      if (x === cx) return hb;
      const g = gClamp((hb - sampleHeight(rh, hn, cell, x < 0 ? 4 : S - 4, zc)) / 4);
      return hb + g * Lg * (1 - Math.exp(-Math.abs(x - cx) / Lg));
    };
    this.heightFn = (x: number, z: number) => {
      const cx = clamp(x, 0, S), cz = clamp(z, 0, S);
      const dx = x - cx, dz = z - cz;
      if (dx === 0 && dz === 0) return sampleHeight(rh, hn, cell, cx, cz);
      const d = Math.hypot(dx, dz);
      const e0 = extX(x, cz);
      let inner = e0;
      if (dz !== 0) {
        const gz = gClamp((e0 - extX(x, dz < 0 ? 4 : S - 4)) / 4);
        inner = e0 + gz * Lg * (1 - Math.exp(-Math.abs(dz) / Lg));
      }
      const t = smoothstep(0, 170, d);
      const gain = 0.2 * L * (1 - Math.exp(-d / L));
      const far = smoothstep(150, 2600, d);
      const big = fbm2(x * 0.0021 + 7.3, z * 0.0021 - 3.1, 4, 11);
      const mid = fbm2(x * 0.0075 - 2.2, z * 0.0075 + 8.4, 3, 29);
      const near = fbm2(x * 0.02 + 1.7, z * 0.02 - 6.1, 3, 41);
      // relief at the scales the valley itself has (about 130 m and 50 m hills) starts right at the border
      const midA = (1 - smoothstep(260, 620, d)) * smoothstep(0, 60, d);
      const nearA = (1 - smoothstep(60, 170, d)) * smoothstep(0, 26, d);
      const farBase = (rimBase + 5) + gain + (6 + 24 * big);
      return inner * (1 - t) + farBase * t + 16 * (mid - 0.5) * midA + 9 * (near - 0.5) * nearA + far * (20 + 90 * big) + d * 0.008;
    };

    this.heightAt = (x: number, z: number) => (this.axis ? this.meshHeight(x, z) : this.heightFn(x, z));
    this.mesh = this.buildMesh();
    this.mesh.name = 'terrain';
    this.material = this.mesh.material as THREE.MeshStandardMaterial;

    // ---- extended heights for hill shadows beyond the playable square (8 m cells over FAR_SIZE)
    {
      const en = FAR_SIZE / EXT_CELL;
      const ext = new Float32Array(en * en);
      for (let j = 0; j < en; j++) {
        for (let i = 0; i < en; i++) ext[j * en + i] = this.heightFn(FAR_ORIGIN + i * EXT_CELL, FAR_ORIGIN + j * EXT_CELL);
      }
      this.extHeightTex = new THREE.DataTexture(ext, en, en, THREE.RedFormat, THREE.FloatType);
      this.extHeightTex.minFilter = this.extHeightTex.magFilter = THREE.NearestFilter;
      this.extHeightTex.generateMipmaps = false;
      this.extHeightTex.needsUpdate = true;
      this.extHeightTex.name = 'terrain.extHeight';
    }

    // ---- horizon shadow passes: one at 2 m over the world, one at 8 m over the far ring, same blockers
    const mkRT = (res: number, name: string) => {
      const rt = new THREE.WebGLRenderTarget(res, res, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.UnsignedByteType,
      });
      rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
      rt.texture.name = name;
      return rt;
    };
    this.shadowRT = mkRT(SHADOW_RES, 'terrain.shadow');
    this.shadowFarRT = mkRT(FAR_RES, 'terrain.shadowFar');
    shared.terrainShadow.value = this.shadowRT.texture;
    shared.terrainShadowFar.value = this.shadowFarRT.texture;
    shared.farRect.value.set(FAR_ORIGIN, FAR_ORIGIN, FAR_SIZE);
    this.shadowMat = new THREE.ShaderMaterial({
      uniforms: {
        tHeight: { value: this.heightTex },
        tExt: { value: this.extHeightTex },
        uCell: { value: cell },
        uHN: { value: hn },
        uWorld: { value: size },
        uRect: { value: new THREE.Vector3(0, 0, size) },
        uT0: { value: 1.5 },
        uGrow: { value: 1.095 },
        uPen: { value: 0.035 },
        uBias: { value: 0 },
        uExtCell: { value: EXT_CELL },
        uExtN: { value: FAR_SIZE / EXT_CELL },
        uExtOrigin: { value: FAR_ORIGIN },
        uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uWorld;
        uniform vec3 uRect;
        uniform float uT0;
        uniform float uGrow;
        uniform float uPen;
        uniform float uBias;
        uniform vec3 uLightDir;
        uniform sampler2D tExt;
        uniform float uExtCell;
        uniform float uExtN;
        uniform float uExtOrigin;
        ${HEIGHT_GLSL}
        float extHeightAt(vec2 xz){
          vec2 f = clamp((xz - vec2(uExtOrigin)) / uExtCell, vec2(0.0), vec2(uExtN - 1.001));
          ivec2 i0 = ivec2(floor(f));
          vec2 t = f - vec2(i0);
          float a = texelFetch(tExt, i0, 0).r;
          float b = texelFetch(tExt, i0 + ivec2(1, 0), 0).r;
          float c = texelFetch(tExt, i0 + ivec2(0, 1), 0).r;
          float d = texelFetch(tExt, i0 + ivec2(1, 1), 0).r;
          return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
        }
        float outsideDist(vec2 p){
          vec2 q = max(vec2(0.0) - p, p - vec2(uWorld));
          return max(max(q.x, q.y), 0.0);
        }
        // Blockers: the valley rim and the first stretch of the far ring cast shadows into the valley; far hills only
        // shade other far terrain (a valley point sees the far ring as a skyline, never as a shadow caster).
        float blockerH(vec2 p, float wStart){
          bool inside = p.x >= 0.0 && p.y >= 0.0 && p.x <= uWorld && p.y <= uWorld;
          float hIn = tgHeightAt(p);
          float h = extHeightAt(p);
          float he = tgHeightAt(clamp(p, vec2(0.0), vec2(uWorld)));
          h = mix(h, he + (h - he) * 0.45, 1.0 - wStart);
          float cut = smoothstep(140.0, 260.0, outsideDist(p)) * (1.0 - wStart);
          float hOut = mix(h, -50.0, cut);
          return inside ? hIn : hOut;
        }
        void main(){
          vec2 xz = uRect.xy + vUv * uRect.z;
          float wStart = smoothstep(80.0, 260.0, outsideDist(xz));
          float h0 = blockerH(xz, 1.0) + 0.35 + uBias;
          vec2 d2 = uLightDir.xz;
          float len = length(d2);
          float vis = 1.0;
          if (len > 1e-4) {
            d2 /= len;
            float tanEl = uLightDir.y / len;
            float t = uT0;
            for (int i = 0; i < 64; i++) {
              vec2 p = xz + d2 * t;
              float hr = h0 + tanEl * t;
              float hit = blockerH(p, wStart) - hr;
              float w = 0.4 + t * uPen;
              vis = min(vis, clamp(0.5 - 0.5 * hit / w, 0.0, 1.0));
              t *= uGrow;
              if (t > 2600.0) break;
            }
          }
          gl_FragColor = vec4(vis, vis, vis, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.shadowQuad = new FullScreenQuad(this.shadowMat);
  }

  /** Recompute the horizon shadow maps when the key light direction moved enough. */
  updateShadow(renderer: THREE.WebGLRenderer, lightDir: THREE.Vector3, force = false): void {
    const u = this.shadowMat.uniforms;
    const prev = renderer.getRenderTarget();
    if (force || this.lastLight.distanceToSquared(lightDir) > 2e-6) {
      this.lastLight.copy(lightDir);
      (u.uLightDir.value as THREE.Vector3).copy(lightDir);
      (u.uRect.value as THREE.Vector3).set(0, 0, this.world.size);
      u.uT0.value = 1.5;
      u.uGrow.value = 1.095;
      u.uPen.value = 0.035;
      u.uBias.value = 0;
      renderer.setRenderTarget(this.shadowRT);
      this.shadowQuad.render(renderer);
    }
    // the far ring changes slowly on screen, so refresh it less often
    if (force || this.lastLightFar.distanceToSquared(lightDir) > 1.5e-5) {
      this.lastLightFar.copy(lightDir);
      (u.uLightDir.value as THREE.Vector3).copy(lightDir);
      (u.uRect.value as THREE.Vector3).set(FAR_ORIGIN, FAR_ORIGIN, FAR_SIZE);
      u.uT0.value = 3;
      u.uGrow.value = 1.1;
      u.uPen.value = 0.04;
      u.uBias.value = 2.2;
      renderer.setRenderTarget(this.shadowFarRT);
      this.shadowQuad.render(renderer);
      // restore the inner pass parameters for the next inner update
      (u.uRect.value as THREE.Vector3).set(0, 0, this.world.size);
      u.uT0.value = 1.5;
      u.uGrow.value = 1.095;
      u.uPen.value = 0.035;
    }
    renderer.setRenderTarget(prev);
  }

  /** Interpolate the mesh the way the GPU does (triangles (a,c,b) and (b,c,d)). */
  private meshHeight(x: number, z: number): number {
    const axis = this.axis!, hts = this.hts!;
    const M = axis.length;
    const find = (v: number): number => {
      if (v <= axis[0]) return 0;
      if (v >= axis[M - 1]) return M - 2;
      let lo = 0, hi = M - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (axis[mid] <= v) lo = mid; else hi = mid;
      }
      return lo;
    };
    const i = find(x), j = find(z);
    const tx = clamp((x - axis[i]) / (axis[i + 1] - axis[i]), 0, 1);
    const tz = clamp((z - axis[j]) / (axis[j + 1] - axis[j]), 0, 1);
    const a = hts[j * M + i], b = hts[j * M + i + 1], c = hts[(j + 1) * M + i], d = hts[(j + 1) * M + i + 1];
    return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  private buildAxis(): Float32Array {
    const { size, n, cell } = this.world;
    const outer = 4600, growth = 1.16, cap = 128;
    const left: number[] = [];
    let step = cell, x = 0;
    while (-x < outer) { x -= step; left.push(x); step = Math.min(step * growth, cap); }
    const right: number[] = [];
    step = cell; x = size;
    while (x - size < outer) { x += step; right.push(x); step = Math.min(step * growth, cap); }
    const axis = new Float32Array(left.length + n + 1 + right.length);
    let k = 0;
    for (let i = left.length - 1; i >= 0; i--) axis[k++] = left[i];
    for (let i = 0; i <= n; i++) axis[k++] = i * cell;
    for (let i = 0; i < right.length; i++) axis[k++] = right[i];
    return axis;
  }

  private buildMesh(): THREE.Mesh {
    const axis = this.buildAxis();
    const M = axis.length;
    const pos = new Float32Array(M * M * 3);
    const nor = new Float32Array(M * M * 3);
    const hts = new Float32Array(M * M);
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < M; i++) {
        const k = j * M + i;
        const h = this.heightFn(axis[i], axis[j]);
        hts[k] = h;
        pos[k * 3] = axis[i]; pos[k * 3 + 1] = h; pos[k * 3 + 2] = axis[j];
      }
    }
    for (let j = 0; j < M; j++) {
      const j0 = Math.max(0, j - 1), j1 = Math.min(M - 1, j + 1);
      for (let i = 0; i < M; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(M - 1, i + 1);
        const dhdx = (hts[j * M + i1] - hts[j * M + i0]) / (axis[i1] - axis[i0]);
        const dhdz = (hts[j1 * M + i] - hts[j0 * M + i]) / (axis[j1] - axis[j0]);
        const l = Math.hypot(dhdx, 1, dhdz);
        const k = (j * M + i) * 3;
        nor[k] = -dhdx / l; nor[k + 1] = 1 / l; nor[k + 2] = -dhdz / l;
      }
    }
    this.axis = axis;
    this.hts = hts;
    const idx = new Uint32Array((M - 1) * (M - 1) * 6);
    let p = 0;
    for (let j = 0; j < M - 1; j++) {
      for (let i = 0; i < M - 1; i++) {
        const a = j * M + i, b = a + 1, c = a + M, d = c + 1;
        // (a, c, b) and (b, c, d): normals point +Y
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(this.world.size / 2, 20, this.world.size / 2), 9000);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-5000, -20, -5000), new THREE.Vector3(5600, 400, 5600));

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const sh = this.shared;
    mat.onBeforeCompile = (shader) => {
      injectTerrainShadow(shader, sh);
      const u = shader.uniforms;
      u.tVeg = sh.vegTex;
      u.tStatic = sh.staticTex;
      u.uWorldSize = sh.worldSize;
      u.uTime = sh.time;
      u.uWind = sh.wind;
      u.uLightDir = sh.lightDir;
      u.uLightColor = sh.lightColor;
      u.uGrassLush = sh.grassLush;
      u.uGrassCured = sh.grassCured;
      u.uStubble = sh.stubble;
      u.uSoil = sh.soil;
      u.uRock = sh.rock;
      u.uGrassGreen = sh.grassGreen;
      u.uGrassDry = sh.grassDry;
      u.uCure = sh.cure;
      u.uFrost = sh.frost;
      u.uSnow = sh.snow;
      u.uWet = sh.wet;
      u.uFear = sh.fearOverlay;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vTgWorld;\nvarying vec3 vTgNormal;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTgNormal = normal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', GROUND_PARS + '\nvoid main() {')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            gTgShadow = tgSampleTerrainShadow();
            vec3 camToP = vTgWorld - cameraPosition;
            float camDist = length(camToP);
            diffuseColor.rgb = tgGround(vTgWorld, normalize(vTgNormal), camDist, camToP / camDist, gTgShadow);
          }`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gTgRough;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gTgEmis;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec3 tgv = vTgWorld - cameraPosition;
            float tgd = length(tgv);
            float tgGraze = smoothstep(0.04, 0.3, max(-tgv.y / tgd, 0.0));
            float k = (1.0 - smoothstep(25.0, 140.0, tgd)) * 0.16 * mix(0.2, 1.0, tgGraze);
            if (k > 0.001) {
              vec2 e = vec2(0.4, 0.0);
              float h0 = tgStreakH(vTgWorld.xz);
              float hx = tgStreakH(vTgWorld.xz + e.xy);
              float hz = tgStreakH(vTgWorld.xz + e.yx);
              vec3 g = vec3(h0 - hx, 0.0, h0 - hz) * k * gTgGrass;
              normal = normalize(normal + mat3(viewMatrix) * g);
            }
          }`,
        );
      shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
    };
    mat.customProgramCacheKey = () => 'tallgrass-terrain-v3';

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.heightTex.dispose();
    this.staticTex.dispose();
    this.shadowRT.dispose();
    this.shadowFarRT.dispose();
    this.extHeightTex.dispose();
    this.shadowMat.dispose();
    this.shadowQuad.dispose();
  }
}

const GROUND_PARS = /* glsl */ `
uniform sampler2D tVeg;
uniform sampler2D tStatic;
uniform float uWorldSize;
uniform float uTime;
uniform vec3 uWind;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uGrassGreen;
uniform vec3 uGrassDry;
uniform float uCure;
uniform vec3 uStubble;
uniform vec3 uSoil;
uniform vec3 uRock;
uniform float uFrost;
uniform float uSnow;
uniform float uWet;
uniform float uFear;
varying vec3 vTgWorld;
varying vec3 vTgNormal;
${NOISE_GLSL}
float gTgRough = 0.95;
vec3 gTgEmis = vec3(0.0);
float gTgGrass = 1.0;

float tgStreakH(vec2 xz){
  vec2 wd = uWind.xy;
  vec2 sp = vec2(dot(xz, wd), dot(xz, vec2(-wd.y, wd.x)));
  return tgNoise2(vec2(sp.x * 0.05, sp.y * 1.3)) * 0.6 + tgNoise2(vec2(sp.x * 0.11, sp.y * 3.1)) * 0.4;
}

vec3 tgGround(vec3 wp, vec3 nrm, float dist, vec3 rayDir, float ts){
  vec2 xz = wp.xz;
  vec2 cuv = clamp(xz / uWorldSize, 0.0, 1.0);
  // signed distance to the playable square (negative inside); the data-driven look dissolves into a continuing
  // far-field look across the edge so no rectangle shows from any angle
  vec2 qd = abs(xz - 0.5 * uWorldSize) - 0.5 * uWorldSize;
  float sd = max(qd.x, qd.y);
  float edgeW = smoothstep(-70.0, 70.0, sd);

  float lodFine = 1.0 - smoothstep(70.0, 320.0, dist);
  float lodMid = 1.0 - smoothstep(300.0, 1100.0, dist);
  float nA = mix(0.5, tgFbm2(xz * 0.33), lodMid);
  float nB = tgFbm2(xz * 0.045 + 11.0);
  float nC = mix(0.5, tgNoise2(xz * 1.9), lodFine);
  float nD = tgNoise2(xz * 0.011 + 3.0);
  float nE = tgFbm2(xz * 0.0065 + 31.0);

  vec4 veg = texture2D(tVeg, cuv);
  vec4 st = texture2D(tStatic, cuv);

  // ---- macro variation at three scales (about 40 m, 120 m, 400 m); all hash noise, so nothing tiles
  float nM1 = tgFbm2(xz * 0.025 + 77.0);
  float nM2 = tgFbm2(xz * 0.0085 + 140.0);
  vec2 dq = xz * 0.0075 + vec2(tgNoise2(xz * 0.004 + 3.0) * 1.8, 0.0);
  float draw = 1.0 - abs(2.0 * tgFbm2(dq + 40.0) - 1.0);           // ridged: thin winding draws and swales
  draw = smoothstep(0.72, 0.96, draw);
  float highGround = smoothstep(8.0, 70.0, wp.y);

  float farBio = 0.6 + 0.25 * (nE - 0.5) * 2.0;
  float bio = mix(veg.r, farBio, edgeW);
  // bare dirt patches: where the macro noise peaks the grass thins out (a little in the valley, a lot in the far field)
  float dirt = smoothstep(0.64, 0.8, nM1 + 0.1 * (nM2 - 0.5));
  bio *= 1.0 - dirt * mix(0.35, 0.8, edgeW);
  float fert = mix(veg.g, 0.6, edgeW);
  float burn = veg.b * (1.0 - edgeW);
  float fear = veg.a * (1.0 - edgeW);
  float farMoist = 0.46 + 0.22 * (nE - 0.5) + 0.2 * draw - 0.3 * highGround;
  float moist = mix(st.r, farMoist, edgeW);
  moist = clamp(moist + 0.28 * draw * (1.0 - edgeW) - 0.1 * highGround * (1.0 - edgeW), 0.0, 1.0);
  float cover = st.g * (1.0 - edgeW);
  float wd = mix(st.a * 64.0, 90.0, edgeW);

  float slopeG = sqrt(max(1.0 - nrm.y * nrm.y, 0.0)) / max(nrm.y, 0.05);

  // wind-combed texture along the wind (kept soft: it must read as grass from above, never as plough rows)
  vec2 wdir = uWind.xy;
  vec2 sp = vec2(dot(xz, wdir), dot(xz, vec2(-wdir.y, wdir.x)));
  sp.x += 26.0 * tgNoise2(xz * 0.013) + 12.0 * tgNoise2(xz * 0.04 + 5.0) + 6.0 * nD;
  sp.y += 9.0 * tgNoise2(xz * 0.03 + 9.0) + 4.0 * tgNoise2(xz * 0.11 + 2.0);
  float graze = smoothstep(0.04, 0.3, max(-rayDir.y, 0.0));
  float lodStreak = 1.0 - smoothstep(180.0, 700.0, dist);
  float streakMid = mix(0.5, tgNoise2(vec2(sp.x * 0.022, sp.y * 0.16)), lodStreak);
  float streakFar = tgNoise2(vec2(sp.x * 0.004, sp.y * 0.03) + nD * 2.0);
  float streakFine = mix(0.5, tgNoise2(vec2(sp.x * 0.1, sp.y * 0.3)), lodFine * (1.0 - 0.6 * graze));
  float streak = streakFine * 0.25 + streakMid * 0.4 + streakFar * 0.35;
  float wave = tgNoise2(vec2(sp.x * 0.026 - uTime * (0.07 + 0.15 * uWind.z), sp.y * 0.011));
  wave = wave * 0.65 + 0.35 * tgNoise2(vec2(sp.x * 0.06 - uTime * (0.1 + 0.2 * uWind.z), sp.y * 0.03));

  // grass color from the same palette and logic as the blade layer: lowland and moist spots stay green longer,
  // upland ridges cure first and go russet; short (grazed or thin) grass reads as dry stubble, not bare sand
  float f = clamp((bio - 0.06) / 0.36, 0.0, 1.0);
  float stubA = 1.0 - f * f * (3.0 - 2.0 * f);
  float um = clamp((moist - 0.4) / 0.26, 0.0, 1.0);
  float up = 1.0 - um * um * (3.0 - 2.0 * um);
  float riparian = 1.0 - smoothstep(6.0, 34.0, wd);
  float dry = clamp(uCure + (0.55 - moist) * 1.1 + stubA * 0.55 + 0.3 * up + (nB - 0.5) * 0.24 + (nM2 - 0.5) * 0.26 - 0.45 * riparian - mix(0.5, 0.3, edgeW) * draw * (0.4 + 0.6 * (1.0 - uCure)) - 0.2 * (nM1 - 0.5), 0.0, 1.0);
  vec3 grassCol = mix(uGrassGreen, uGrassDry, dry) * vec3(1.0 + 0.08 * up * dry, 1.0 - 0.07 * up * dry, 1.0 - 0.16 * up * dry);
  // the blades add their own shading; the far-field ground is the canopy average: slightly olive and a little less saturated
  grassCol *= vec3(1.04, 1.01, 0.86);
  grassCol = mix(vec3(dot(grassCol, vec3(0.3333))), grassCol, 0.8);
  grassCol *= 0.84 + 0.32 * nA;
  grassCol *= 1.0 + (streak - 0.5) * 0.55 * mix(0.3, 1.0, graze);
  grassCol *= 1.0 + (wave - 0.5) * 0.26 * (0.35 + uWind.z);
  // swaths of pale straw and deeper ochre so the dry prairie never reads as one flat color
  float swath = tgFbm2(xz * 0.016 + 21.0);
  grassCol = mix(grassCol, grassCol * vec3(1.12, 1.07, 0.88), dry * smoothstep(0.45, 0.72, swath));
  grassCol = mix(grassCol, grassCol * vec3(0.88, 0.8, 0.66), dry * smoothstep(0.58, 0.3, swath) * 0.8);

  // the far field stands in for blades seen from a distance: a touch darker and calmer than the sunlit blade tops
  grassCol *= mix(1.0, 0.88, edgeW);

  // honey, not orange: dry ridges go lighter and straw-gold, swales and draws go deeper olive-gold, and the redness is capped
  // (the light is already warm, so red ground under red light reads as wine at dusk)
  float dryAmt = dry * (1.0 - riparian);
  grassCol *= 1.0 + 0.24 * up * dryAmt * (0.6 + 0.8 * nM1);
  vec3 swaleC = vec3(0.34, 0.27, 0.07) * (0.8 + 0.4 * nA);
  grassCol = mix(grassCol, grassCol * vec3(0.84, 0.92, 0.7) * 0.92 + swaleC * 0.16, clamp(draw * 0.75 + (1.0 - up) * 0.14 * smoothstep(0.4, 0.8, nM2), 0.0, 1.0) * dryAmt);
  float lumG0 = dot(grassCol, vec3(0.2126, 0.7152, 0.0722));
  grassCol.r = min(grassCol.r, grassCol.g * 2.15 + 0.003);
  grassCol = mix(vec3(lumG0), grassCol, 0.95);

  // blade-scale speckle so ground the grass layer does not cover (beyond the world edge) reads as grass, not as a smooth plane
  float speck = tgNoise2(xz * 5.5) * 0.6 + tgNoise2(xz * 14.0) * 0.4;
  grassCol *= 1.0 + (speck - 0.5) * 0.5 * (1.0 - smoothstep(25.0, 110.0, dist)) * (0.35 + 0.65 * edgeW);

  // short grass: a little of the soil shows through, darker and earthier, never light sand
  float soilShow = smoothstep(0.1, 0.0, bio + (nC - 0.5) * 0.05) + dirt * 0.5 * edgeW;
  soilShow = clamp(soilShow, 0.0, 1.0);
  vec3 shortGrass = mix(grassCol, grassCol * vec3(0.9, 0.84, 0.74) + uSoil * 0.12, stubA * 0.5);
  vec3 col = mix(shortGrass, uSoil * (0.8 + 0.5 * nA), soilShow * 0.85);
  gTgGrass = 1.0 - soilShow;

  // rock only on truly steep faces, and only partly
  float outcrop = smoothstep(0.7, 0.8, tgFbm2(xz * 0.045 + 90.0)) * smoothstep(0.12, 0.45, slopeG);
  float rock = max(smoothstep(0.78, 1.25, slopeG + (nA - 0.5) * 0.3 + (nD - 0.5) * 0.25), outcrop * 0.85);
  vec3 rockCol = uRock * (0.7 + 0.6 * nC) * (0.85 + 0.3 * nB);
  col = mix(col, rockCol, rock * 0.7);

  // damp banks, mud at the waterline
  float damp = (1.0 - smoothstep(0.0, 9.0, wd)) * (0.6 + 0.4 * nA);
  col = mix(col, col * vec3(0.52, 0.47, 0.38), damp * 0.5);
  float mud = 1.0 - smoothstep(0.0, 3.4, wd + (nC - 0.5) * 1.6);
  col = mix(col, vec3(0.2, 0.16, 0.115) * (0.8 + 0.4 * nC), mud * 0.82);

  // under tree and shrub cover: cooler, darker, leaf litter
  col = mix(col, col * vec3(0.55, 0.58, 0.4) * (0.8 + 0.4 * nC), cover * 0.5);

  // ---- burn scar: ragged charcoal and ash grey-brown, a scorched halo, a glowing ember front, and regrowth
  // veg.b: 1.0 = burning now, then 0.78 fresh ash decaying to 0 over a year (the engine also fades it as grass regrows)
  float rag = tgNoise2(xz * 0.9) * 0.5 + tgNoise2(xz * 2.3 + 7.0) * 0.3 + tgNoise2(xz * 5.7 + 3.0) * 0.2;
  float bR = burn + (rag - 0.5) * 0.8 * smoothstep(0.0, 0.12, burn);
  float scar = smoothstep(0.12, 0.3, bR);
  float scorch = smoothstep(0.0, 0.16, bR) * (1.0 - scar);
  float fresh = smoothstep(0.3, 0.76, burn);
  vec3 charC = vec3(0.058, 0.046, 0.034);
  vec3 ashC = vec3(0.37, 0.325, 0.27);
  float ashPatch = smoothstep(0.35, 0.7, tgFbm2(xz * 0.35 + 19.0));
  float ashMix = clamp(ashPatch * (0.3 + 0.6 * (1.0 - fresh)) + 0.32 * (1.0 - fresh) + 0.1 * (nC - 0.5), 0.0, 1.0);
  vec3 scarCol = mix(charC, ashC, ashMix) * (0.72 + 0.5 * nC) * (0.85 + 0.3 * nA);
  scarCol = mix(scarCol, uSoil * 0.9 + vec3(0.03), (1.0 - fresh) * 0.55);
  col = mix(col, col * vec3(0.5, 0.4, 0.3), scorch * 0.7);
  col = mix(col, scarCol, scar);
  gTgGrass *= (1.0 - scar);
  float charAmt = scar;
  // flames: only cells that are burning right now (value 1.0) glow, flickering; the glow spills a little onto the ground around them
  float flick = 0.55 + 0.45 * tgNoise2(xz * 1.3 + uTime * 1.7) + 0.25 * tgNoise2(xz * 4.1 - uTime * 2.9);
  float burningNow = smoothstep(0.9, 0.99, burn);
  float ember = smoothstep(0.86, 1.0, bR) * burningNow * flick;
  float emberHalo = burningNow * (0.4 + 0.6 * flick);
  // smouldering: for a while after the flames pass (ash value 0.68 to 0.78) scattered embers still glow in the char and fade out
  float smold = smoothstep(0.66, 0.77, burn) * (1.0 - burningNow);
  float spots = smoothstep(0.72, 0.9, tgNoise2(xz * 2.6 + vec2(uTime * 0.12, 3.0)) * 0.6 + tgNoise2(xz * 7.0 - uTime * 0.2) * 0.4);
  float smolder = smold * spots * (0.5 + 0.5 * tgNoise2(xz * 3.0 + uTime * 1.1));

  // winter: frost is a thin cold bloom in the shade, never a snow blanket; snow only when it is snowing
  float shadeAmt = 1.0 - ts;
  float frost = uFrost * (0.1 + 0.3 * shadeAmt) * (1.0 - charAmt);
  col = mix(col, col * vec3(0.9, 0.97, 1.08) + vec3(0.035, 0.045, 0.06), frost);
  float snowAmt = uSnow * (1.0 - rock * 0.7) * (1.0 - charAmt * 0.6) * smoothstep(0.3, 0.9, nrm.y);
  // snow covers the flats first and softly; the sun colours it (warm at golden hour), the shade stays a gentle blue-grey
  vec3 snowC = vec3(0.88, 0.87, 0.855) * (0.94 + 0.06 * nC);
  float snowPatch = smoothstep(0.0, 1.0, snowAmt * (0.6 + 0.8 * tgFbm2(xz * 0.05 + 12.0)));
  col = mix(col, snowC, clamp(snowPatch, 0.0, 1.0) * 0.92);

  // rain darkens and glosses the ground
  col *= mix(1.0, 0.74, uWet * (1.0 - snowAmt));
  gTgRough = mix(0.95, 0.62, uWet);

  // looking toward a low sun makes standing grass glow: forward scattering through the blades
  float fwd = max(dot(rayDir, uLightDir), 0.0);
  float lowSun = 1.0 - smoothstep(0.1, 0.65, uLightDir.y);
  float glow = pow(fwd, 3.0) * (0.35 + 0.65 * lowSun) * gTgGrass * (1.0 - rock) * (1.0 - snowAmt) * ts * (1.0 - uWet);
  gTgEmis = col * uLightColor * glow * 0.1;
  gTgEmis += vec3(3.4, 0.95, 0.15) * ember + vec3(1.1, 0.22, 0.03) * emberHalo * 0.4 + vec3(1.6, 0.34, 0.05) * smolder;

  if (uFear > 0.001) {
    col = mix(col, vec3(0.85, 0.05, 0.04), fear * uFear * 0.7);
    gTgEmis += vec3(fear * uFear * 0.35, 0.0, 0.0);
  }
  return max(col, vec3(0.0));
}
`;
