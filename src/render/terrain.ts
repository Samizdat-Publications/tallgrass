// Terrain: a heightfield mesh over the 512 m world plus a coarse far-field ring out to the horizon, one
// MeshStandardMaterial extended with a ground-color shader driven by the vegetation texture and static data,
// and a GPU horizon-shadow pass so hills shade valleys at golden hour at any distance.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { World } from '../sim/world';
import { sampleHeight } from '../sim/world';
import {
  HEIGHT_GLSL, NOISE_GLSL, SharedUniforms, clamp, fbm2, injectTerrainShadow, smoothstep,
} from './common';

const SHADOW_RES = 256;

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
  const R = 15, W = 4.6;
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
        if (d < dC[v]) { dC[v] = d; px[v] = qx; pz[v] = qz; }
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
    if (d < W) {
      const u = d / W;
      h = sv - 0.55 * (1 - u * u);
    } else {
      const hb = sv + 0.5 * smoothstep(W, W + 2.2, d);
      const j = smoothstep(W + 2.2, R, d);
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

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  readonly heightTex: THREE.DataTexture;
  readonly staticTex: THREE.DataTexture;
  readonly shadowRT: THREE.WebGLRenderTarget;
  private shadowQuad: FullScreenQuad;
  private shadowMat: THREE.ShaderMaterial;
  private lastLight = new THREE.Vector3(9, 9, 9);
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
    this.renderHeight = shaped.height;
    this.creekDist = shaped.creekDist;
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
    const blurred = boxBlur(boxBlur(rh, hn, 20), hn, 20);
    let rimSum = 0, rimCount = 0;
    for (let i = 0; i < hn; i++) {
      rimSum += blurred[i] + blurred[(hn - 1) * hn + i] + blurred[i * hn] + blurred[i * hn + hn - 1];
      rimCount += 4;
    }
    const rimBase = rimSum / rimCount;
    const L = 75;
    this.heightFn = (x: number, z: number) => {
      const cx = clamp(x, 0, S), cz = clamp(z, 0, S);
      const h = sampleHeight(rh, hn, cell, cx, cz);
      const dx = x - cx, dz = z - cz;
      if (dx === 0 && dz === 0) return h;
      const d = Math.hypot(dx, dz);
      const hb = sampleHeight(blurred, hn, cell, cx, cz);
      const m = smoothstep(0, 220, d);
      const base = hb * (1 - m) + (rimBase + 5) * m + (h - hb) * Math.exp(-d / 14);
      const gain = 0.2 * L * (1 - Math.exp(-d / L));
      const ramp = smoothstep(0, 220, d);
      const far = smoothstep(150, 2600, d);
      // detail fades with distance because the far mesh is coarse: avoids aliased ridges between vertex rows
      const big = fbm2(x * 0.0021 + 7.3, z * 0.0021 - 3.1, 4, 11);
      const mid = fbm2(x * 0.0075 - 2.2, z * 0.0075 + 8.4, 3, 29);
      const near = fbm2(x * 0.02 + 1.7, z * 0.02 - 6.1, 3, 41);
      const midA = 1 - smoothstep(220, 520, d);
      const nearA = 1 - smoothstep(40, 130, d);
      return base + gain + ramp * (6 + 24 * big + 12 * mid * midA + 5 * near * nearA) + far * (20 + 90 * big) + d * 0.008;
    };

    this.heightAt = (x: number, z: number) => (this.axis ? this.meshHeight(x, z) : this.heightFn(x, z));
    this.mesh = this.buildMesh();
    this.mesh.name = 'terrain';
    this.material = this.mesh.material as THREE.MeshStandardMaterial;

    // ---- horizon shadow pass
    this.shadowRT = new THREE.WebGLRenderTarget(SHADOW_RES, SHADOW_RES, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.UnsignedByteType,
    });
    this.shadowRT.texture.wrapS = this.shadowRT.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.shadowRT.texture.name = 'terrain.shadow';
    shared.terrainShadow.value = this.shadowRT.texture;
    this.shadowMat = new THREE.ShaderMaterial({
      uniforms: {
        tHeight: { value: this.heightTex },
        uCell: { value: cell },
        uHN: { value: hn },
        uWorld: { value: size },
        uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uWorld;
        uniform vec3 uLightDir;
        ${HEIGHT_GLSL}
        void main(){
          vec2 xz = vUv * uWorld;
          float h0 = tgHeightAt(xz) + 0.35;
          vec2 d2 = uLightDir.xz;
          float len = length(d2);
          float vis = 1.0;
          if (len > 1e-4) {
            d2 /= len;
            float tanEl = uLightDir.y / len;
            float t = 1.5;
            for (int i = 0; i < 64; i++) {
              vec2 p = xz + d2 * t;
              if (p.x < 0.0 || p.y < 0.0 || p.x > uWorld || p.y > uWorld) break;
              float hr = h0 + tanEl * t;
              float hit = tgHeightAt(p) - hr;
              float w = 0.4 + t * 0.035;
              vis = min(vis, clamp(0.5 - 0.5 * hit / w, 0.0, 1.0));
              t *= 1.095;
            }
          }
          gl_FragColor = vec4(vis, vis, vis, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.shadowQuad = new FullScreenQuad(this.shadowMat);
  }

  /** Recompute the horizon shadow map when the key light direction moved enough. */
  updateShadow(renderer: THREE.WebGLRenderer, lightDir: THREE.Vector3, force = false): void {
    if (!force && this.lastLight.distanceToSquared(lightDir) < 2e-6) return;
    this.lastLight.copy(lightDir);
    (this.shadowMat.uniforms.uLightDir.value as THREE.Vector3).copy(lightDir);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.shadowRT);
    this.shadowQuad.render(renderer);
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
      u.uGreenHigh = sh.greenHigh;
      u.uGreenLow = sh.greenLow;
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
            float k = (1.0 - smoothstep(25.0, 170.0, tgd)) * 0.34 * mix(0.2, 1.0, tgGraze);
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
    };
    mat.customProgramCacheKey = () => 'tallgrass-terrain-v1';

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
uniform vec3 uGrassLush;
uniform vec3 uGrassCured;
uniform vec3 uStubble;
uniform vec3 uSoil;
uniform vec3 uRock;
uniform float uGreenHigh;
uniform float uGreenLow;
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
  vec2 outv = xz - clamp(xz, vec2(0.0), vec2(uWorldSize));
  float fo = smoothstep(0.0, 80.0, length(outv));
  vec4 veg = texture2D(tVeg, cuv);
  vec4 st = texture2D(tStatic, cuv);
  float bio = mix(veg.r, 0.62, fo);
  float fert = mix(veg.g, 0.6, fo);
  float burn = veg.b * (1.0 - fo);
  float fear = veg.a * (1.0 - fo);
  float moist = mix(st.r, 0.34, fo);
  float cover = st.g * (1.0 - fo);
  float wd = mix(st.a * 64.0, 90.0, smoothstep(0.0, 8.0, length(outv)));

  float slopeG = sqrt(max(1.0 - nrm.y * nrm.y, 0.0)) / max(nrm.y, 0.05);

  float lodFine = 1.0 - smoothstep(70.0, 320.0, dist);
  float lodMid = 1.0 - smoothstep(300.0, 1100.0, dist);
  float nA = mix(0.5, tgFbm2(xz * 0.33), lodMid);
  float nB = tgFbm2(xz * 0.045 + 11.0);
  float nC = mix(0.5, tgNoise2(xz * 1.9), lodFine);
  float nD = tgNoise2(xz * 0.011 + 3.0);

  // wind-combed streaks that flow along the wind, bending with a slow domain warp
  vec2 wdir = uWind.xy;
  vec2 sp = vec2(dot(xz, wdir), dot(xz, vec2(-wdir.y, wdir.x)));
  sp.x += 22.0 * tgNoise2(xz * 0.013) + 10.0 * tgNoise2(xz * 0.04 + 5.0) + 6.0 * nD;
  sp.y += 5.0 * tgNoise2(xz * 0.03 + 9.0);
  // streaks read as combed grass from above but as ploughed rows at grazing angles, so fade them near the horizon
  float graze = smoothstep(0.04, 0.3, max(-rayDir.y, 0.0));
  float lodStreak = 1.0 - smoothstep(180.0, 700.0, dist);
  float streakFine = mix(0.5, tgNoise2(vec2(sp.x * 0.05, sp.y * 0.95)), lodFine);
  float streakMid = mix(0.5, tgNoise2(vec2(sp.x * 0.022, sp.y * 0.24)), lodStreak);
  float streakFar = tgNoise2(vec2(sp.x * 0.004, sp.y * 0.03) + nD * 2.0);
  float streakUltra = mix(0.5, tgNoise2(vec2(sp.x * 0.32, sp.y * 5.0)) * 0.6 + tgNoise2(vec2(sp.x * 0.9, sp.y * 11.0)) * 0.4, 1.0 - smoothstep(6.0, 45.0, dist));
  float streak = streakFine * 0.26 + streakMid * 0.36 + streakFar * 0.28 + (streakUltra - 0.5) * 0.5 + 0.1;
  // rolling wind waves of light and dark
  float wave = tgNoise2(vec2(sp.x * 0.026 - uTime * (0.07 + 0.15 * uWind.z), sp.y * 0.011));
  wave = wave * 0.65 + 0.35 * tgNoise2(vec2(sp.x * 0.06 - uTime * (0.1 + 0.2 * uWind.z), sp.y * 0.03));

  float riparian = 1.0 - smoothstep(6.0, 34.0, wd);
  float lowland = smoothstep(0.5, 0.85, moist * 0.7 + 0.75 * riparian + 0.15 * (fert - 0.5) + (nB - 0.5) * 0.3);
  float green = clamp(mix(uGreenHigh, uGreenLow, lowland) + (nB - 0.5) * 0.25, 0.0, 1.0);

  float cov = smoothstep(0.05, 0.5, bio + (nA - 0.5) * 0.24 + (nC - 0.5) * 0.08);
  gTgGrass = cov;

  vec3 grassCol = mix(uGrassCured, uGrassLush, green);
  grassCol *= 0.8 + 0.42 * nA;
  grassCol *= 1.0 + (streak - 0.5) * 1.1 * mix(0.25, 1.0, graze);
  grassCol *= 1.0 + (wave - 0.5) * 0.32 * (0.35 + uWind.z) * cov;
  // swaths of pale straw, ochre and sage so the dry prairie never reads as one flat color
  float swath = tgFbm2(xz * 0.016 + 21.0);
  grassCol = mix(grassCol, grassCol * vec3(1.22, 1.12, 0.8), (1.0 - green) * smoothstep(0.45, 0.72, swath));
  grassCol = mix(grassCol, grassCol * vec3(0.84, 0.72, 0.52), (1.0 - green) * smoothstep(0.58, 0.3, swath) * 0.9);
  grassCol = mix(grassCol, uGrassLush * vec3(1.05, 1.0, 0.85) * (0.75 + 0.5 * nA), smoothstep(0.66, 0.86, tgFbm2(xz * 0.03 + 55.0)) * 0.55 * cov);

  vec3 stub = mix(uSoil, uStubble * (0.78 + 0.45 * nA), smoothstep(0.0, 0.07, bio + (nC - 0.5) * 0.04));
  vec3 col = mix(stub, grassCol, cov);

  // rock outcrops on steep ground
  float rock = smoothstep(0.46, 0.9, slopeG + (nA - 0.5) * 0.32 + (nD - 0.5) * 0.25);
  vec3 rockCol = uRock * (0.7 + 0.6 * nC) * (0.85 + 0.3 * nB);
  col = mix(col, rockCol, rock * 0.92);

  // damp banks, mud at the waterline
  float damp = (1.0 - smoothstep(0.0, 7.0, wd)) * (0.6 + 0.4 * nA);
  col = mix(col, col * vec3(0.5, 0.45, 0.38), damp * 0.55);
  float mud = 1.0 - smoothstep(0.0, 2.6, wd);
  col = mix(col, vec3(0.18, 0.14, 0.10) * (0.8 + 0.4 * nC), mud * 0.8);

  // under tree and shrub cover: cooler, darker, leaf litter
  col = mix(col, col * vec3(0.5, 0.55, 0.38) * (0.8 + 0.4 * nC), cover * 0.55);

  // burn: charcoal, ash, live embers
  float charAmt = smoothstep(0.1, 0.34, burn);
  float ashAmt = smoothstep(0.0, 0.08, burn) * (1.0 - charAmt);
  col = mix(col, vec3(0.5, 0.49, 0.47) * (0.8 + 0.4 * nA), ashAmt * 0.65);
  col = mix(col, vec3(0.022, 0.02, 0.018) * (0.7 + 0.9 * nA), charAmt * 0.95);
  float ember = smoothstep(0.78, 1.0, burn) * (0.35 + 0.65 * tgNoise2(xz * 0.8 + uTime * 0.4));

  // winter: frost lingers in shade, snow whitens everything flat
  float shadeAmt = 1.0 - ts;
  col = mix(col, vec3(0.74, 0.8, 0.88), uFrost * (0.18 + 0.4 * shadeAmt) * (1.0 - charAmt));
  float snowAmt = uSnow * (1.0 - rock * 0.7) * (1.0 - charAmt * 0.6) * smoothstep(0.3, 0.9, nrm.y);
  col = mix(col, vec3(0.9, 0.93, 0.98) * (0.94 + 0.06 * nC), snowAmt);

  // rain darkens and glosses the ground
  col *= mix(1.0, 0.74, uWet * (1.0 - snowAmt));
  gTgRough = mix(0.95, 0.62, uWet);

  // looking toward a low sun makes standing grass glow: forward scattering through the blades
  float fwd = max(dot(rayDir, uLightDir), 0.0);
  float lowSun = 1.0 - smoothstep(0.1, 0.65, uLightDir.y);
  float glow = pow(fwd, 3.0) * (0.35 + 0.65 * lowSun) * cov * (1.0 - rock) * (1.0 - snowAmt) * ts * (1.0 - uWet);
  gTgEmis = col * uLightColor * glow * 0.1;
  gTgEmis += vec3(2.4, 0.7, 0.12) * ember * charAmt;

  if (uFear > 0.001) {
    col = mix(col, vec3(0.85, 0.05, 0.04), fear * uFear * 0.7);
    gTgEmis += vec3(fear * uFear * 0.35, 0.0, 0.0);
  }
  return max(col, vec3(0.0));
}
`;
