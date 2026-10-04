// Terrain: a heightfield mesh over the 512 m world plus a coarse far-field ring out to the horizon, one
// MeshStandardMaterial extended with a ground-color shader driven by the vegetation texture and static data,
// and a GPU horizon-shadow pass so hills shade valleys at golden hour at any distance.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { World } from '../sim/world';
import { sampleHeight } from '../sim/world';
import {
  HEIGHT_GLSL, NOISE_GLSL, POND_GLSL, SharedUniforms, clamp, fbm2, injectSafeOutput, injectTerrainShadow, makePondUniform, smoothstep, vnoise2,
} from './common';
import { SEASON_GLSL } from './season';

const SHADOW_RES = 512;
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
    // distance is tracked out to 50 m (the wall-removal weight needs it); only the inner R meters are reshaped below
    const RD = 50;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - RD) / cell)), i1 = Math.min(hn - 1, Math.ceil((Math.max(ax, bx) + RD) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - RD) / cell)), j1 = Math.min(hn - 1, Math.ceil((Math.max(az, bz) + RD) / cell));
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
    // channel half-width wanders 2.4 to 6.2 m and the bank height varies, so the creek never reads as a straight canal: long reaches
    // (about 80 m) swing between a narrow run and a broad pool (the water mesh reaches 7.5 m from the centerline, so 6.2 is the cap),
    // with a shorter wobble on top. water.ts measures the half-width from these heights, so its current and bars follow.
    const W = 2.4 + 2.8 * smoothstep(0.22, 0.78, vnoise2(along * 0.013, 3.7, 5)) + 1.0 * vnoise2(along * 0.045 + 20.0, 8.1, 11);
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
  // ponds: reshape each into a smooth round basin with a gently ragged shoreline, so the water meets the land along a natural
  // curve instead of the grid-aligned stair-steps the sim's coarse bowl leaves
  const ponds = world.ponds;
  for (let q = 0; q < ponds.length; q += 4) {
    const cx = ponds[q], cz = ponds[q + 1], r = ponds[q + 2], sf = ponds[q + 3];
    const R2 = r * 2.4;
    const i0 = Math.max(0, Math.floor((cx - R2) / cell)), i1 = Math.min(hn - 1, Math.ceil((cx + R2) / cell));
    const j0 = Math.max(0, Math.floor((cz - R2) / cell)), j1 = Math.min(hn - 1, Math.ceil((cz + R2) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * cell, z = j * cell;
        const dx = x - cx, dz = z - cz;
        const d = Math.hypot(dx, dz);
        if (d > R2) continue;
        const ang = Math.atan2(dz, dx);
        const rag = 1 + 0.16 * (vnoise2(Math.cos(ang) * 1.8 + 5 + q, Math.sin(ang) * 1.8 + 3, 17) - 0.5) + 0.07 * (vnoise2(Math.cos(ang) * 4.5 + q, Math.sin(ang) * 4.5, 23) - 0.5);
        const re = r * 0.98 * rag;
        const v = j * hn + i;
        const sim = world.height[v];
        let h: number;
        if (d < re) {
          const u = d / re;
          h = sf - 0.12 - 1.5 * (1 - u * u);
        } else {
          const bank = sf + 0.12 + 0.42 * smoothstep(re, re + 0.5 * r, d);
          const j2 = smoothstep(re + 0.5 * r, R2, d);
          h = bank * (1 - j2) + Math.max(sim, bank) * j2;
          if (d < re + 2.2) h = Math.min(h, sf + 0.05 + (d - re) * 0.35);
        }
        out[v] = h;
      }
    }
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
  /** Baked periodic macro-variation maps (see bakeMacro): R/G/B/A fields of tgGround, 2 m texels over a 4096 m repeating tile. */
  private macroRT: THREE.WebGLRenderTarget[] = [];
  private macroBaked = false;
  /** Small tileable random texture (4 independent channels) the ground shader samples for fine grain instead of evaluating hash noise. */
  private detailTex!: THREE.DataTexture;
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
  private rings: Array<{ s: number; d0: number; d1: number }> | null = null;

  constructor(world: World, private shared: SharedUniforms) {
    this.world = world;
    const { size, hn, cell } = world;

    // ---- render heights: smooth creek channel and banks (see shapeCreek)
    const shaped = shapeCreek(world);
    this.creekDist = shaped.creekDist;
    // The sim raises a 22 m bowl wall over the last 82 m of every edge (world.ts). Seen from above it frames the playable square
    // like a picture frame, so the render removes it entirely (except in the creek corridor, whose banks are already shaped); the
    // valley edge then simply continues as rolling ground into the far ring.
    for (let j = 0; j < hn; j++) {
      for (let i = 0; i < hn; i++) {
        const u = i / (hn - 1), v = j / (hn - 1);
        const edge = Math.min(u, 1 - u, v, 1 - v);
        if (edge >= 0.16) continue;
        const up = 22 * Math.pow((0.16 - edge) / 0.16, 2);
        // the sim's creek carve blends the wall back in as smoothstep(0, 46, distance to creek); the shaped channel (about 15 m) is untouched
        const cd = shaped.creekDist[j * hn + i];
        const wc = smoothstep(0, 46, cd) * smoothstep(8, 16, cd);
        shaped.height[j * hn + i] -= 0.97 * up * wc;
      }
    }
    // trend field: a wide blur of the ground (about 110 m). The far ring continues this smooth field outward and adds the
    // mirrored high-pass detail on top, so beyond the border the terrain has the same character as inside, with no streaks.
    const blurred = boxBlur(boxBlur(shaped.height, hn, 28), hn, 28);
    this.renderHeight = Float32Array.from(shaped.height);
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
    // Beyond the playable square the valley keeps rolling at its own level for a while, then a round basin wall rises into ridge
    // lines and bluffs and the ground keeps climbing and softening into haze. The wall is measured from a circle around the
    // valley centre, not from the square, so the world edge never reads as a rectangle from above.
    let rimSum = 0, rimCount = 0;
    for (let i = 0; i < hn; i++) {
      rimSum += blurred[i] + blurred[(hn - 1) * hn + i] + blurred[i * hn] + blurred[i * hn + hn - 1];
      rimCount += 4;
    }
    const rimBase = rimSum / rimCount;
    const L = 75;
    const bAt = (x: number, z: number) => sampleHeight(blurred, hn, cell, clamp(x, 0, S), clamp(z, 0, S));
    // the blurred border field continued outward by averaging it on a ring that widens with distance: smooth, and nothing extrudes
    // into long streaks perpendicular to the border (a plain gradient continuation does)
    const ringAvg = (x: number, z: number, d: number): number => {
      const rho = 0.55 * d + 1;
      let s = bAt(x, z);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI * 0.25 + 0.3;
        s += bAt(x + Math.cos(a) * rho, z + Math.sin(a) * rho);
      }
      return s / 9;
    };
    const mirror = (v: number): number => {
      let m = v;
      for (let k = 0; k < 3; k++) {
        if (m < 0) m = -m; else if (m > S) m = 2 * S - m; else break;
      }
      return clamp(m, 0, S);
    };
    // fold into the valley like a triangle wave (any distance), used for the rotated detail that takes over from the mirrored one
    const fold = (v: number): number => {
      const t = ((v / S) % 2 + 2) % 2;
      return (t > 1 ? 2 - t : t) * S;
    };
    const C0 = S * 0.5, R0 = S * 0.74;
    this.heightFn = (x: number, z: number) => {
      const cx = clamp(x, 0, S), cz = clamp(z, 0, S);
      const dx = x - cx, dz = z - cz;
      if (dx === 0 && dz === 0) return sampleHeight(rh, hn, cell, cx, cz);
      const d = Math.hypot(dx, dz);
      const trend = ringAvg(x, z, d);
      // Detail: the ground's own high-pass detail, mirrored across the border (so it joins seamlessly) and domain-warped; farther out
      // it is swapped for a rotated, folded copy so the far valley does not look like a mirror image of the near one
      const warp = smoothstep(0, 70, d);
      const wx = x + 34 * warp * (vnoise2(x * 0.011 + 3, z * 0.011 - 2, 17) - 0.5);
      const wz = z + 34 * warp * (vnoise2(x * 0.011 - 8, z * 0.011 + 5, 19) - 0.5);
      const mx = mirror(wx), mz = mirror(wz);
      const detailM = sampleHeight(rh, hn, cell, mx, mz) - sampleHeight(blurred, hn, cell, mx, mz);
      // the creek channel itself does not continue outside the world (it would read as a dry gully with cliff-like banks)
      const creekAt = (u: number, v: number) => {
        const ci = Math.min(hn - 1, Math.max(0, Math.round(u / cell))), cj = Math.min(hn - 1, Math.max(0, Math.round(v / cell)));
        return 1 - (1 - smoothstep(14, 46, shaped.creekDist[cj * hn + ci])) * smoothstep(0, 70, d);
      };
      let detail = detailM * creekAt(mx, mz);
      const rotW = smoothstep(70, 190, d);
      if (rotW > 0) {
        const ca = 0.62, sa = 0.78; // about 38 degrees
        const rx = fold(C0 + (wx - C0) * ca - (wz - C0) * sa + 91), rz = fold(C0 + (wx - C0) * sa + (wz - C0) * ca - 57);
        const detailR = (sampleHeight(rh, hn, cell, rx, rz) - sampleHeight(blurred, hn, cell, rx, rz)) * creekAt(rx, rz);
        detail += (detailR - detail) * rotW;
      }
      const inner = trend + detail * (1 - smoothstep(40, 330, d));
      // basin wall, from the circle around the valley centre
      const rc = Math.max(0, Math.hypot(x - C0, z - C0) - R0);
      const big = fbm2(x * 0.0021 + 7.3, z * 0.0021 - 3.1, 4, 11);
      const mid = fbm2(x * 0.0075 - 2.2, z * 0.0075 + 8.4, 3, 29);
      const near = fbm2(x * 0.02 + 1.7, z * 0.02 - 6.1, 3, 41);
      const azi = fbm2(x * 0.0016 - 13.7, z * 0.0016 + 4.2, 3, 53);        // slow variation of how high the rim stands around the valley
      const wallT = smoothstep(0, 380, rc);
      const gain = 0.2 * L * (1 - Math.exp(-rc / L));
      const rim = (rimBase + 8) + gain + (4 + 30 * azi) + 6 * big;
      // ridge lines: thin winding crests (ridged noise) that stand above the rim from about 250 m out, with saddles between them
      const rA = smoothstep(180, 620, d) * (1 - 0.55 * smoothstep(2400, 4200, d));
      const rn1 = 1 - Math.abs(2 * fbm2(x * 0.0038 + 21.3, z * 0.0038 - 9.1, 3, 71) - 1);
      const rn2 = 1 - Math.abs(2 * fbm2(x * 0.0094 - 5.5, z * 0.0094 + 33.7, 3, 83) - 1);
      const crest = rA * (34 * Math.pow(rn1, 2.2) * (0.35 + 0.9 * azi) + 12 * Math.pow(rn2, 2.0) * smoothstep(0.2, 0.7, mid));
      const midA = smoothstep(120, 400, d) * (1 - smoothstep(500, 900, d)) + smoothstep(0, 60, d) * (1 - smoothstep(60, 400, d)) * 0.45;
      const nearA = smoothstep(150, 260, d) * (1 - smoothstep(260, 420, d)) * 0.7;
      // rolling relief at the valley's own scale (hills 100 to 250 m across, 15 to 40 m high) all the way out, so the far field keeps
      // the light-and-shade structure of real prairie hills instead of flattening into a hazy plain; it grows in as the mirrored detail fades
      const rollA = smoothstep(90, 300, d) * (1 - 0.35 * smoothstep(1600, 3600, d));
      const roll1 = fbm2(x * 0.0052 + 41.7, z * 0.0052 - 17.3, 3, 91);
      const roll2 = fbm2(x * 0.0141 - 7.9, z * 0.0141 + 22.1, 3, 97);
      const rolling = rollA * (46 * (roll1 - 0.5) + 19 * (roll2 - 0.5) * (1 - 0.6 * smoothstep(900, 2400, d)));
      const far = smoothstep(150, 2600, d);
      return inner * (1 - wallT) + rim * wallT + crest + rolling + 16 * (mid - 0.5) * midA + 9 * (near - 0.5) * nearA + far * (20 + 90 * big) + d * 0.008;
    };

    for (let i = 0; i < 3; i++) {
      const rt = new THREE.WebGLRenderTarget(MACRO_RES, MACRO_RES, {
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.UnsignedByteType, generateMipmaps: true,
      });
      rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
      rt.texture.anisotropy = 4;
      rt.texture.name = 'terrain.macro' + (i + 1);
      this.macroRT.push(rt);
    }
    {
      const N = 256;
      const d = new Uint8Array(N * N * 4);
      let s = 0x9e3779b9;
      for (let i = 0; i < d.length; i++) {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        d[i] = s & 255;
      }
      this.detailTex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
      this.detailTex.wrapS = this.detailTex.wrapT = THREE.RepeatWrapping;
      this.detailTex.minFilter = this.detailTex.magFilter = THREE.LinearFilter;
      this.detailTex.generateMipmaps = false;
      this.detailTex.needsUpdate = true;
      this.detailTex.name = 'terrain.detail';
    }
    this.heightAt = (x: number, z: number) => (this.rings ? this.meshHeight(x, z) : this.heightFn(x, z));
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
            float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            float t = uT0 * (0.82 + 0.36 * jit);
            for (int i = 0; i < 64; i++) {
              vec2 p = xz + d2 * t;
              float hr = h0 + tanEl * t;
              float hit = blockerH(p, wStart) - hr;
              float w = 0.7 + t * uPen * 1.5;
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
    if (!this.macroBaked) this.bakeMacro(renderer);
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


  /**
   * Bake the ground shader's static macro noise once. Every field is periodic over MACRO_PERIOD (the lattice wraps), so the repeating
   * tile has no seam; the 2 m texels keep everything down to about 5 m wavelengths, and mipmaps stop it shimmering at distance.
   * R/G/B/A of map 1: ridge/dry modulation (about 20 m), regional (150 m), dirt patches (40 m), mid (120 m).
   * Map 2: thin winding draws, straw/olive/sage patches at three scales. Map 3: rock outcrops, snow drift, warp, far copses.
   */
  private bakeMacro(renderer: THREE.WebGLRenderer): void {
    this.macroBaked = true;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPass: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uPass;
        ${NOISE_GLSL}
        // value noise on a lattice that wraps every "cells" cells, so the field tiles seamlessly over the unit square
        float pn(vec2 p, float cells, float seed){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          vec2 i0 = mod(i, cells), i1 = mod(i + 1.0, cells);
          vec2 o = vec2(seed * 1.37, seed * 2.11);
          float a = tgHash21(i0 + o), b = tgHash21(vec2(i1.x, i0.y) + o);
          float c = tgHash21(vec2(i0.x, i1.y) + o), d = tgHash21(i1 + o);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        // periodic fbm (octaves double in frequency); shift is in base-lattice cells and must itself be periodic
        float pf(vec2 uv, vec2 shift, float cells, float seed, int oct){
          float a = 0.5, s = 0.0, n = 0.0, c = cells;
          for (int k = 0; k < 4; k++) {
            if (k >= oct) break;
            s += a * pn((uv * cells + shift) * exp2(float(k)), c, seed + float(k) * 7.3);
            n += a; a *= 0.5; c *= 2.0;
          }
          return s / n;
        }
        void main(){
          vec2 uv = vUv;
          vec4 o = vec4(0.0);
          if (uPass < 0.5) {
            o = vec4(pf(uv, vec2(0.0), 184.0, 11.0, 3), pf(uv, vec2(0.0), 27.0, 31.0, 4), pf(uv, vec2(0.0), 102.0, 77.0, 3), pf(uv, vec2(0.0), 35.0, 140.0, 4));
          } else if (uPass < 1.5) {
            float w = pn(uv * 16.0, 16.0, 3.0) * 1.8;
            float r = pf(uv, vec2(w, 0.0), 31.0, 40.0, 4);
            float draw = smoothstep(0.72, 0.96, 1.0 - abs(2.0 * r - 1.0));
            vec2 sw = 0.00977 * vec2(pn(uv * 25.0, 25.0, 1.0) - 0.5, pn(uv * 25.0, 25.0, 7.0) - 0.5);
            o = vec4(draw, pf(uv, sw * 45.0, 45.0, 50.0, 4), pf(uv, sw * 111.0, 111.0, 120.0, 3), pf(uv, sw * 16.0, 16.0, 200.0, 3));
          } else {
            o = vec4(pf(uv, vec2(0.0), 184.0, 90.0, 3), pf(uv, vec2(0.0), 205.0, 12.0, 3), pn(uv * 45.0, 45.0, 3.0), pf(uv, vec2(0.0), 58.0, 9.0, 2));
          }
          gl_FragColor = o;
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new FullScreenQuad(mat);
    const prev = renderer.getRenderTarget();
    for (let i = 0; i < 3; i++) {
      mat.uniforms.uPass.value = i;
      renderer.setRenderTarget(this.macroRT[i]);
      quad.render(renderer);
    }
    renderer.setRenderTarget(prev);
    quad.dispose();
    mat.dispose();
  }

  /**
   * Terrain mesh as concentric rectangular rings around the playable square instead of one stretched tensor grid. A tensor grid
   * that coarsens outward leaves the side strips with cells 100 m wide and 2 m tall, so every far-field attribute (height, normal,
   * curvature) streaked along the strip. Here the playable square keeps its 2 m cells and each ring outward doubles the spacing
   * (4, 8, 16 ... 256 m) in both axes, so cells stay square at every distance. A ring that borders a finer one splits the
   * edge cells into a three-triangle fan through the neighbour's midpoint vertex, so there are no cracks.
   */
  private ringLayout(): Array<{ s: number; d0: number; d1: number }> {
    const { size, cell } = this.world;
    const outerCells = [32, 80, 160, 320, 640, 1280, 2304];
    const rings: Array<{ s: number; d0: number; d1: number }> = [];
    let d0 = 0;
    for (let l = 1; l <= outerCells.length; l++) {
      const s = cell * Math.pow(2, l);
      const d1 = outerCells[l - 1] * cell;
      // every ring boundary must land on this ring's lattice, and the playable square must be a whole number of its cells
      if (size % s !== 0 || d1 % s !== 0 || d0 % s !== 0) break;
      rings.push({ s, d0, d1 });
      d0 = d1;
    }
    return rings;
  }

  /** Surface height at (x, z) exactly as the GPU interpolates the ring mesh (see ringLayout). */
  private meshHeight(x: number, z: number): number {
    const { size, hn, cell } = this.world;
    const rh = this.renderHeight;
    if (x >= 0 && z >= 0 && x <= size && z <= size) {
      const fx = Math.min(x / cell, hn - 1.0001), fz = Math.min(z / cell, hn - 1.0001);
      const i = Math.floor(fx), j = Math.floor(fz);
      const tx = fx - i, tz = fz - j;
      const a = rh[j * hn + i], b = rh[j * hn + i + 1], c = rh[(j + 1) * hn + i], d = rh[(j + 1) * hn + i + 1];
      return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    }
    const dOut = Math.max(-x, x - size, -z, z - size);
    const rings = this.rings!;
    let l = 0;
    while (l < rings.length && dOut > rings[l].d1) l++;
    if (l >= rings.length) return this.heightFn(x, z);
    const { s, d0, d1 } = rings[l];
    // which block of the ring (top and bottom take the full width, left and right fill between them)
    let bx0: number, bz0: number, side: 0 | 1 | 2 | 3;
    if (z < -d0) { bx0 = -d1; bz0 = -d1; side = 0; }
    else if (z > size + d0) { bx0 = -d1; bz0 = size + d0; side = 1; }
    else if (x < -d0) { bx0 = -d1; bz0 = -d0; side = 2; }
    else { bx0 = size + d0; bz0 = -d0; side = 3; }
    const cx = Math.floor((x - bx0) / s), cz = Math.floor((z - bz0) / s);
    const px = bx0 + cx * s, pz = bz0 + cz * s;
    const u = (x - px) / s, v = (z - pz) / s;
    const h = (xx: number, zz: number) => this.heightFn(xx, zz);
    const h00 = h(px, pz), h10 = h(px + s, pz), h01 = h(px, pz + s), h11 = h(px + s, pz + s);
    // is this a stitched cell (its edge toward the inner ring)?
    let stitch = -1; // 0 top (z = pz), 1 bottom (z = pz + s), 2 left (x = px), 3 right (x = px + s)
    {
      const inX = px >= -d0 && px + s <= size + d0;
      if (side === 0 && inX && Math.abs(pz + s + d0) < 1e-6) stitch = 1;
      else if (side === 1 && inX && Math.abs(pz - (size + d0)) < 1e-6) stitch = 0;
      else if (side === 2 && Math.abs(px + s + d0) < 1e-6) stitch = 3;
      else if (side === 3 && Math.abs(px - (size + d0)) < 1e-6) stitch = 2;
    }
    if (stitch < 0) return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    // fan: edge endpoints E0, E1 (with midpoint M) and the opposite corners O0, O1
    let e0: number, e1: number, o0: number, o1: number, eu: number, ev: number, mx: number, mz: number;
    if (stitch === 1) { e0 = h01; e1 = h11; o0 = h00; o1 = h10; mx = px + s * 0.5; mz = pz + s; }
    else if (stitch === 0) { e0 = h00; e1 = h10; o0 = h01; o1 = h11; mx = px + s * 0.5; mz = pz; }
    else if (stitch === 2) { e0 = h00; e1 = h01; o0 = h10; o1 = h11; mx = px; mz = pz + s * 0.5; }
    else { e0 = h10; e1 = h11; o0 = h00; o1 = h01; mx = px + s; mz = pz + s * 0.5; }
    const m = h(mx, mz);
    // work in a frame where the fine edge is the "bottom" (t along it, w = distance from it, both 0..1)
    if (stitch === 1) { eu = u; ev = 1 - v; }
    else if (stitch === 0) { eu = u; ev = v; }
    else if (stitch === 2) { eu = v; ev = u; }
    else { eu = v; ev = 1 - u; }
    // triangles in that frame: (E0, M, O0), (M, E1, O1), (M, O1, O0) with E0=(0,0), M=(.5,0), E1=(1,0), O0=(0,1), O1=(1,1)
    // barycentric in the left triangle (E0, M, O0)
    const bary = (ax: number, ay: number, bx: number, by: number, cx2: number, cy2: number, ha: number, hb: number, hc: number, qx: number, qy: number): number | null => {
      const det = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2);
      const l1 = ((by - cy2) * (qx - cx2) + (cx2 - bx) * (qy - cy2)) / det;
      const l2 = ((cy2 - ay) * (qx - cx2) + (ax - cx2) * (qy - cy2)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) return null;
      return l1 * ha + l2 * hb + l3 * hc;
    };
    return bary(0, 0, 0.5, 0, 0, 1, e0, m, o0, eu, ev)
      ?? bary(0.5, 0, 1, 0, 1, 1, m, e1, o1, eu, ev)
      ?? bary(0.5, 0, 1, 1, 0, 1, m, o1, o0, eu, ev)
      ?? m;
  }

  private buildMesh(): THREE.Mesh {
    const { size, hn, cell } = this.world;
    const rings = this.rings = this.ringLayout();
    const pos: number[] = [], nor: number[] = [], curv: number[] = [], idx: number[] = [];
    const cache = new Map<number, number>();
    const hf = this.heightFn;
    // one vertex per distinct position; normal and curvature use the spacing of the first ring that asks for it
    const vtx = (x: number, z: number, sp: number): number => {
      const key = Math.round(x * 4 + 40000) * 100003 + Math.round(z * 4 + 40000);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const id = pos.length / 3;
      const h = hf(x, z);
      const e = Math.max(sp, cell);
      const dhdx = (hf(x + e, z) - hf(x - e, z)) / (2 * e);
      const dhdz = (hf(x, z + e) - hf(x, z - e)) / (2 * e);
      const l = Math.hypot(dhdx, 1, dhdz);
      // Ridge and hollow signal: height excess over the average of the four neighbours about 16 m (or one cell) away, normalised so
      // +1 is a pronounced crest and -1 a pronounced draw. The ground shader turns it into dry pale ridges and deep olive draws.
      const R = Math.max(16, sp * 2.5); // wide enough that coarse far rings do not alias into block-sized tints
      const avg = 0.25 * (hf(x - R, z) + hf(x + R, z) + hf(x, z - R) + hf(x, z + R));
      pos.push(x, h, z);
      nor.push(-dhdx / l, 1 / l, -dhdz / l);
      curv.push(clamp((h - avg) / (R * 0.1), -1, 1));
      cache.set(key, id);
      return id;
    };
    const tri = (a: number, b: number, c: number) => {
      // wind so the normal points +Y
      const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2];
      const cross = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (cross > 0) idx.push(a, b, c); else idx.push(a, c, b);
    };
    // a regular block of nx by nz cells of size s starting at (x0, z0); stitchEdge: which edge borders a finer ring
    // (0 top, 1 bottom, 2 left, 3 right, -1 none), optionally only over cells whose span lies inside [lo, hi] along the edge
    const block = (x0: number, z0: number, nx: number, nz: number, s: number, stitchEdge: number, lo = -Infinity, hi = Infinity) => {
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const x = x0 + i * s, z = z0 + j * s;
          const a = vtx(x, z, s), b = vtx(x + s, z, s), c = vtx(x, z + s, s), d = vtx(x + s, z + s, s);
          let st = -1;
          if (stitchEdge === 1 && j === nz - 1 && x >= lo && x + s <= hi) st = 1;
          else if (stitchEdge === 0 && j === 0 && x >= lo && x + s <= hi) st = 0;
          else if (stitchEdge === 3 && i === nx - 1) st = 3;
          else if (stitchEdge === 2 && i === 0) st = 2;
          if (st < 0) { tri(a, c, b); tri(b, c, d); continue; }
          // fan through the midpoint of the fine edge
          let e0: number, e1: number, o0: number, o1: number, m: number;
          if (st === 1) { e0 = c; e1 = d; o0 = a; o1 = b; m = vtx(x + s * 0.5, z + s, s); }
          else if (st === 0) { e0 = a; e1 = b; o0 = c; o1 = d; m = vtx(x + s * 0.5, z, s); }
          else if (st === 2) { e0 = a; e1 = c; o0 = b; o1 = d; m = vtx(x, z + s * 0.5, s); }
          else { e0 = b; e1 = d; o0 = a; o1 = c; m = vtx(x + s, z + s * 0.5, s); }
          tri(e0, m, o0); tri(m, e1, o1); tri(m, o1, o0);
        }
      }
    };
    // the playable square at full resolution (the sim's own grid)
    block(0, 0, hn - 1, hn - 1, cell, -1);
    for (const { s, d0, d1 } of rings) {
      const wide = Math.round((size + 2 * d1) / s), band = Math.round((d1 - d0) / s), inner = Math.round((size + 2 * d0) / s);
      block(-d1, -d1, wide, band, s, 1, -d0, size + d0);                 // top: bottom row meets the inner ring
      block(-d1, size + d0, wide, band, s, 0, -d0, size + d0);                          // bottom: top row meets the inner ring
      block(-d1, -d0, band, inner, s, 3);                                                // left: right column
      block(size + d0, -d0, band, inner, s, 2);                                          // right: left column
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('aCurv', new THREE.BufferAttribute(new Float32Array(curv), 1));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(this.world.size / 2, 20, this.world.size / 2), 9000);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-5000, -20, -5000), new THREE.Vector3(5600, 600, 5600));

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const sh = this.shared;
    const pondU = makePondUniform(this.world.ponds);
    mat.onBeforeCompile = (shader) => {
      injectTerrainShadow(shader, sh);
      const u = shader.uniforms;
      u.uPonds = pondU;
      u.tVeg = sh.vegTex;
      u.tStatic = sh.staticTex;
      u.tTrail = sh.trailTex;
      u.uFarStats = sh.farStats;
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
      u.uDrought = sh.drought;
      u.uSeason = sh.season;
      u.uFrost = sh.frost;
      u.uSnow = sh.snow;
      u.uWet = sh.wet;
      u.uFear = sh.fearOverlay;
      u.uNight = sh.night;
      u.tMacro1 = { value: this.macroRT[0].texture };
      u.tMacro2 = { value: this.macroRT[1].texture };
      u.tMacro3 = { value: this.macroRT[2].texture };
      u.tDetail = { value: this.detailTex };
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float aCurv;\nvarying float vTgCurv;\nvarying vec3 vTgWorld;\nvarying vec3 vTgNormal;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTgNormal = normal;\nvTgCurv = aCurv;');
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
            // combed-grass relief from the height the ground shader computed, via screen derivatives (no extra noise taps)
            vec3 tgSx = dFdx( -vViewPosition ), tgSy = dFdy( -vViewPosition );
            vec3 tgR1 = cross( tgSy, normal ), tgR2 = cross( normal, tgSx );
            float tgDet = dot( tgSx, tgR1 );
            if ( abs( tgDet ) > 1e-10 ) {
              vec3 tgGrad = sign( tgDet ) * ( dFdx( gTgH ) * tgR1 + dFdy( gTgH ) * tgR2 );
              normal = normalize( abs( tgDet ) * normal - tgGrad );
            }
          }`,
        );
      shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
    };
    mat.customProgramCacheKey = () => 'tallgrass-terrain-v5';

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
    for (const rt of this.macroRT) rt.dispose();
    this.detailTex.dispose();
    this.shadowMat.dispose();
    this.shadowQuad.dispose();
  }
}

/** Edge of the repeating tile (m) the static macro-variation maps cover; the noise they bake is periodic over it, so it never shows a seam. */
const MACRO_PERIOD = 4096;
const MACRO_RES = 2048;

const GROUND_PARS = /* glsl */ `
uniform sampler2D tVeg;
uniform sampler2D tStatic;
uniform sampler2D tTrail;
uniform sampler2D tMacro1;
uniform sampler2D tMacro2;
uniform sampler2D tMacro3;
uniform sampler2D tDetail;
// fine grain from the baked random texture: one lattice cell per texel, so scale s metres per cell = coordinate xz / (s * 256)
// (cubic-eased between lattice points, so the slope is continuous: plain bilinear gives hard-edged facets in the bump lighting)
float tgDet(vec2 xz, float cellM, int ch, vec2 off){
  vec2 q = (xz / (cellM * 256.0) + off) * 256.0;
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  // explicit LOD 0: the eased coordinate jumps at cell borders, so an implicit mip level would turn every border into a grey line
  vec4 v = textureLod(tDetail, (i + f + 0.5) * (1.0 / 256.0), 0.0);
  return ch == 0 ? v.r : ch == 1 ? v.g : ch == 2 ? v.b : v.a;
}
uniform vec2 uFarStats;
uniform float uWorldSize;
uniform float uTime;
uniform vec3 uWind;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uGrassGreen;
uniform vec3 uGrassDry;
uniform float uCure;
uniform float uDrought;
uniform float uSeason;
uniform vec3 uStubble;
uniform vec3 uSoil;
uniform vec3 uRock;
uniform float uFrost;
uniform float uSnow;
uniform float uWet;
uniform float uFear;
uniform float uNight;
varying vec3 vTgWorld;
varying vec3 vTgNormal;
varying float vTgCurv;
${NOISE_GLSL}
${SEASON_GLSL}
${POND_GLSL}
float gTgRough = 0.95;
float gTgH = 0.0;
vec3 gTgEmis = vec3(0.0);
float gTgGrass = 1.0;

// Oriented value noise: streaks that run along one of four fixed directions, blended by weights ow (so the pattern never shears
// when the flow direction changes). across / along are frequencies perpendicular to and along the streak. Directions with no
// weight are skipped.
float tgCombN(vec2 q, vec4 ow, float across, float along, float seed){
  float n = 0.0;
  if (ow.x > 0.0) n += ow.x * tgNoise2(vec2(q.x * along, q.y * across) + seed);
  if (ow.y > 0.0) n += ow.y * tgNoise2(vec2((q.x + q.y) * 0.7071 * along, (q.y - q.x) * 0.7071 * across) + seed + 3.1);
  if (ow.z > 0.0) n += ow.z * tgNoise2(vec2(q.y * along, q.x * across) + seed + 6.7);
  if (ow.w > 0.0) n += ow.w * tgNoise2(vec2((q.y - q.x) * 0.7071 * along, (q.x + q.y) * 0.7071 * across) + seed + 9.3);
  return n;
}

vec3 tgGround(vec3 wp, vec3 nrm, float dist, vec3 rayDir, float ts){
  vec2 xz = wp.xz;
  vec2 cuvR = xz / uWorldSize;
  vec2 cuv = clamp(cuvR, 0.0, 1.0);
  // beyond the border the valley's own data continues as a reflection (a triangle wave), so nothing stretches into streaks
  vec2 cuvM = 1.0 - abs(fract(cuvR * 0.5) * 2.0 - 1.0);
  // signed distance to the playable square (negative inside); the data-driven look dissolves into a continuing
  // far-field look across the edge so no rectangle shows from any angle
  vec2 qd = abs(xz - 0.5 * uWorldSize) - 0.5 * uWorldSize;
  float sd = max(qd.x, qd.y);
  float edgeW = smoothstep(-110.0, 150.0, sd);
  // 1 inside the playable square, 0 a few metres outside: for data that must not repeat (trails, burn, fear, canopy, water distance)
  float inS = 1.0 - smoothstep(0.0, 16.0, sd);

  // macro mottling (patch tints, dirt, dry-noise) halves from about 60 m out to 220 m: broad bands carry the far hills, not blotches
  float mot = 1.0 - 0.5 * smoothstep(60.0, 220.0, dist);
  float lodFine = 1.0 - smoothstep(70.0, 320.0, dist);
  float lodMid = 1.0 - smoothstep(300.0, 1100.0, dist);
  float nA = 0.5;
  if (lodMid > 0.002) nA = mix(0.5, tgDet(xz, 3.0, 1, vec2(0.0)) * 0.62 + tgDet(xz, 1.08, 2, vec2(0.31)) * 0.38, lodMid);
  float nC = 0.5;
  if (lodFine > 0.002) nC = mix(0.5, tgDet(xz, 0.53, 0, vec2(0.17)), lodFine);

  vec4 veg = texture2D(tVeg, cuvM);
  vec4 st = texture2D(tStatic, cuvM);
  float trod = texture2D(tTrail, cuv).r * inS;
  // ---- macro variation (about 40 m, 120 m and 400 m patches, draws, outcrops, drifts): static hash noise baked once into three
  // periodic maps (see Terrain.bakeMacro), so the pixel shader pays three fetches instead of a dozen fbm evaluations
  vec2 muv = xz * (1.0 / ${MACRO_PERIOD}.0);
  vec4 m1 = texture2D(tMacro1, muv);
  vec4 m2 = texture2D(tMacro2, muv);
  vec4 m3 = texture2D(tMacro3, muv);
  float nB = m1.r, nE = m1.g, nM1 = m1.b, nM2 = m1.a;
  float draw = m2.r, p1 = m2.g, p2 = m2.b, p3 = m2.a;      // draw: thin winding draws and swales
  float outN = m3.r, driftLow = m3.g, nD = m3.b, groveN = m3.a;
  float highGround = smoothstep(8.0, 70.0, wp.y);

  float farBio = uFarStats.x + 0.3 * (nE - 0.5);
  float bio = mix(veg.r, farBio, edgeW);
  // bare dirt patches: where the macro noise peaks the grass thins out (a little in the valley, a lot in the far field)
  float dirt = smoothstep(0.64, 0.8, nM1 + 0.1 * (nM2 - 0.5));
  dirt *= mot;
  bio *= 1.0 - dirt * mix(0.4, 0.5, edgeW);
  float fert = mix(veg.g, 0.6, edgeW);
  float burn = veg.b * inS;
  float fear = veg.a * inS;
  float farMoist = uFarStats.y + 0.22 * (nE - 0.5) + 0.2 * draw - 0.3 * highGround;
  float moist = mix(st.r, farMoist, edgeW);
  moist = clamp(moist + 0.28 * draw * (1.0 - edgeW) - 0.1 * highGround * (1.0 - edgeW), 0.0, 1.0);
  float cover = st.g * inS;
  float wd = mix(90.0, st.a * 64.0, inS);

  float slopeG = sqrt(max(1.0 - nrm.y * nrm.y, 0.0)) / max(nrm.y, 0.05);
  float winterK = tgWinterK(uSeason);
  float autumnK = smoothstep(1.8, 2.2, uSeason) * (1.0 - smoothstep(2.6, 3.0, uSeason));
  float curv = vTgCurv;
  float ridgeK = smoothstep(0.04, 0.7, curv);
  float hollowK = smoothstep(0.04, 0.7, -curv);
  moist = clamp(moist + 0.22 * hollowK - 0.14 * ridgeK, 0.0, 1.0);
  float farK = smoothstep(90.0, 420.0, dist);

  // ---- combed grass: the streaks follow the fall line on slopes and the wind on flats, and bend with a slow domain warp
  vec2 wv = uWind.xy;
  vec2 fall = nrm.xz;
  float fl = length(fall);
  vec2 fv = fl > 1e-4 ? fall / fl : wv;
  float slopeW = smoothstep(0.03, 0.2, slopeG);
  vec2 c2 = mix(vec2(wv.x * wv.x - wv.y * wv.y, 2.0 * wv.x * wv.y), vec2(fv.x * fv.x - fv.y * fv.y, 2.0 * fv.x * fv.y), slopeW);
  c2 /= max(length(c2), 1e-3);
  vec4 ow = vec4(0.5 + 0.5 * c2.x, 0.5 + 0.5 * c2.y, 0.5 - 0.5 * c2.x, 0.5 - 0.5 * c2.y);
  ow *= ow;
  ow = max(ow - 0.06, 0.0);                        // drop the weak directions (smoothly): fewer noise taps per pixel
  ow /= (ow.x + ow.y + ow.z + ow.w);
  vec2 wq = xz + 18.0 * vec2(nD - 0.5, tgNoise2(xz * 0.011 + 9.0) - 0.5);
  float fp = dist * 0.0011;                       // metres covered by one pixel
  float f1 = 1.0 - smoothstep(0.25, 0.6, fp);      // blade-scale strokes fade out beyond about 250 to 550 m
  float f2 = 1.0 - smoothstep(0.45, 1.3, fp);
  float f3 = 1.0 - smoothstep(1.2, 3.5, fp);
  float s1 = 0.5, s2 = 0.5, s3 = 0.5;
  if (f1 > 0.002) s1 = tgCombN(wq, ow, 0.6, 0.11, 1.0);
  if (f2 > 0.002 || uSnow > 0.04) s2 = tgCombN(wq, ow, 0.2, 0.027, 2.0);
  if (f3 > 0.002) s3 = tgCombN(wq, ow, 0.05, 0.012, 3.0);
  float s4 = tgNoise2(wq * 0.0065 + 4.0);
  // crisp strokes, not mush: push the mid-scale noise through a contrast curve so hills show distinct combed lines
  float c2s = smoothstep(0.3, 0.7, s2), c3s = smoothstep(0.32, 0.68, s3);
  // long strokes read as smeared brush work, not grass, once they are a few pixels wide: fade them out with distance and let the
  // footprint-sized grain below carry the far field instead
  float calm2 = 1.0 - 0.6 * smoothstep(70.0, 260.0, dist);
  float calm3 = 1.0 - 0.7 * smoothstep(120.0, 480.0, dist);
  float farCalm = calm3;
  float streakTone = (s1 - 0.5) * 0.4 * f1 + (c2s - 0.5) * 0.7 * f2 * calm2 + (c3s - 0.5) * 0.4 * f3 * calm3 + (s4 - 0.5) * 0.12;
  float graze = smoothstep(0.04, 0.3, max(-rayDir.y, 0.0));
  // looking straight down (map view) combed strokes read as fur or smear, so thin them out; they belong to oblique views
  float topK = smoothstep(0.7, 0.96, -rayDir.y);
  streakTone *= mix(1.0, 0.3, topK);
  gTgH = ((s1 - 0.5) * 0.1 * f1 + (s2 - 0.5) * 0.22 * f2 * calm2 + (s3 - 0.5) * 0.55 * f3 * farCalm) * mix(0.5, 1.0, graze) * (0.4 + 0.6 * farK) * mix(1.0, 0.3, topK);
  // rolling wind waves of light and dark
  vec2 sp = vec2(dot(xz, wv), dot(xz, vec2(-wv.y, wv.x)));
  sp.x += 26.0 * tgNoise2(xz * 0.013) + 6.0 * nD;
  float wave = tgNoise2(vec2(sp.x * 0.026 - uTime * (0.07 + 0.15 * uWind.z), sp.y * 0.011));
  wave = wave * 0.65 + 0.35 * tgNoise2(vec2(sp.x * 0.06 - uTime * (0.1 + 0.2 * uWind.z), sp.y * 0.03));

  // grass color from the same palette and logic as the blade layer: lowland and moist spots stay green longer,
  // upland ridges cure first and go russet; short (grazed or thin) grass reads as dry stubble, not bare sand
  // the grazed-to-tall boundary comes from a cell-sized data texture: ragged it with noise so it is a feathered, patchy edge and
  // not a mown-lawn line
  float f = clamp((bio + (nA - 0.5) * 0.14 + (nM1 - 0.5) * 0.1 - 0.06) / 0.36, 0.0, 1.0);
  float stubA = 1.0 - f * f * (3.0 - 2.0 * f);
  float um = clamp((moist - 0.4) / 0.26, 0.0, 1.0);
  float up = 1.0 - um * um * (3.0 - 2.0 * um);
  // riparian ribbon: a belt of living grass along the creek and round the ponds. Its width wanders from about 10 to 35 m on low-frequency
  // noise (so it swells in places and pinches in others, never a constant tube), the outer edge is feathered and ragged, and the
  // season shapes it: full in the green months, still greener than the uplands through the cure, dull under winter, and drier where
  // drought or grazing has cut the grass back (the stubble term). The blade layer (grass.ts) runs the same function, so near and far field agree.
  float riparian = 0.0;
  if (wd < 58.0) {   // the belt never reaches past about 57 m (the distance texture holds 64), so the open prairie skips the noise
    float ripBroad = tgNoise2(xz * 0.011 + vec2(31.7, 12.3)) * 0.6 + tgNoise2(xz * 0.027 + vec2(7.3, 55.1)) * 0.4;
    float ripW = mix(20.0, 50.0, smoothstep(0.22, 0.66, ripBroad)) * (0.85 + 0.3 * tgNoise2(xz * 0.07 + vec2(3.1, 91.7)));
    riparian = tgRiparian(1.0 - smoothstep(0.3 * ripW, ripW, wd), uCure, winterK);
    riparian = tgDroughtRip(riparian, uDrought);
  }
  float dry = clamp(uCure + (0.55 - moist) * 1.1 + stubA * 0.55 + 0.3 * up + ((nB - 0.5) * 0.24 + (nM2 - 0.5) * 0.26 - 0.2 * (nM1 - 0.5)) * mot - mix(0.5, 0.3, edgeW) * draw * (0.4 + 0.6 * (1.0 - uCure)), 0.0, 1.0);
  dry = tgCuredFloor(dry, uCure, riparian);     // late summer: the uplands cure to gold, green is left to the belt and the swales
  dry = tgDroughtDry(dry, uDrought, riparian);  // drought: dry grass everywhere but a thinned belt
  dry = tgRiparianDry(dry, uCure, stubA, riparian);
  vec3 grassCol = mix(uGrassGreen, uGrassDry, dry) * vec3(1.0 + 0.08 * up * dry, 1.0 - 0.07 * up * dry, 1.0 - 0.16 * up * dry);
  // the blades add their own shading; the far-field ground is the canopy average: slightly olive and a little less saturated
  grassCol *= vec3(1.04, 1.01, 0.86);
  grassCol = mix(vec3(dot(grassCol, vec3(0.3333))), grassCol, 0.8);
  grassCol *= 0.86 + 0.28 * nA;
  grassCol *= clamp(1.0 + streakTone * 0.7, 0.6, 1.4);
  grassCol *= 1.0 + (wave - 0.5) * 0.22 * (0.35 + uWind.z) * (1.0 - 0.75 * uNight);
  // tonal patches the way real prairie goes: straw, olive, sage and russet in swaths 40 to 250 m across
  vec3 tOl = vec3(0.76, 0.9, 0.56);
  vec3 tSt = vec3(1.1, 1.1, 0.84);
  vec3 tSg = vec3(0.84, 0.97, 0.8);
  vec3 tRu = vec3(1.0, 0.92, 0.76);
  vec3 tint = mix(mix(tOl, tSt, smoothstep(0.38, 0.62, p1)), mix(tSg, tRu, smoothstep(0.4, 0.62, p2)), smoothstep(0.35, 0.65, p3));
  grassCol *= mix(vec3(1.0), tint, mix(0.6, 1.0, farK) * mot * (1.0 - 0.75 * winterK));
  // broad tonal bands by aspect: sun-facing slopes pale gold, shaded slopes deeper ochre (the blade layer runs the same function)
  grassCol *= tgAspectTint(nrm, uLightDir, dry * (1.0 - riparian) * (1.0 - uNight) * (1.0 - 0.6 * winterK));
  // sunlit ridges go pale and dry, draws and hollows go deep olive
  grassCol *= 1.0 + 0.26 * ridgeK * (0.5 + 0.5 * dry) - 0.22 * hollowK;
  grassCol = mix(grassCol, grassCol * vec3(0.76, 0.92, 0.56), hollowK * 0.4 * (1.0 - 0.75 * winterK));
  grassCol = mix(grassCol, grassCol * vec3(1.12, 1.05, 0.8), ridgeK * 0.5 * dry);

  // the far field stands in for blades seen from a distance: a touch darker and calmer than the sunlit blade tops
  grassCol *= mix(1.0, 0.97, edgeW);

  // greener drainages: draws, hollows and moist bottoms hold a sage-olive green through the cured season, so a golden hill is
  // threaded with living grass the way a real prairie is
  float drainK = clamp(draw * 0.9 + hollowK * 0.55 + (1.0 - up) * 0.15, 0.0, 1.0) * (1.0 - ridgeK);
  vec3 drainCol = mix(uGrassGreen, uGrassDry, 0.22) * vec3(0.84, 0.98, 0.62) * (0.85 + 0.3 * nA);
  grassCol = mix(grassCol, drainCol, drainK * smoothstep(0.25, 0.85, uCure) * mix(0.44, 0.26, winterK));
  // the riparian belt itself: sage to fresh green, olive-leaning and never lime, a little richer than the upland drains
  vec3 ripCol = mix(uGrassGreen, uGrassDry, 0.08 + 0.1 * uCure) * vec3(0.94, 1.12, 0.72) * (1.16 + 0.26 * nA);
  grassCol = mix(grassCol, ripCol, riparian * 0.9);

  // honey, not orange: dry ridges go lighter and straw-gold, swales and draws go deeper olive-gold, and the redness is capped
  // (the light is already warm, so red ground under red light reads as wine at dusk)
  float dryAmt = dry * (1.0 - riparian);
  grassCol *= 1.0 + 0.24 * up * dryAmt * (0.6 + 0.8 * nM1);
  vec3 swaleC = vec3(0.34, 0.27, 0.07) * (0.8 + 0.4 * nA);
  grassCol = mix(grassCol, grassCol * vec3(0.84, 0.92, 0.7) * 0.92 + swaleC * 0.16, clamp(draw * 0.5 + (1.0 - up) * 0.14 * smoothstep(0.4, 0.8, nM2), 0.0, 1.0) * dryAmt);
  float lumG0 = dot(grassCol, vec3(0.2126, 0.7152, 0.0722));
  grassCol.r = min(grassCol.r, grassCol.g * mix(2.15, 1.7, autumnK) + 0.003);
  grassCol = mix(vec3(lumG0), grassCol, mix(0.95, 0.88, smoothstep(150.0, 900.0, dist)));   // the aerial haze (FogPass) greys the far hills; the ground itself stays golden
  // far cured ground stands in for the golden blades seen from afar, so it keeps their ochre and chroma instead of greying to tan
  // (autumn is already russet and winter is deliberately dull, so both are left alone)
  {
    float ochreK = smoothstep(60.0, 250.0, dist) * dryAmt * (1.0 - autumnK) * (1.0 - winterK) * (1.0 - uNight) * (1.0 - uDrought);
    float lumO = dot(grassCol, vec3(0.2126, 0.7152, 0.0722));
    grassCol = mix(vec3(lumO), grassCol, 1.0 + 0.2 * ochreK) * mix(vec3(1.0), vec3(1.04, 1.0, 0.86), 0.5 * ochreK);
  }
  // drought: bleached pale straw (same luminance, leaning yellow, so never mauve), thinned in the belt
  grassCol = tgDroughtTint(grassCol, uDrought, riparian);

  // distance grain: tufts and clumps whose size follows the pixel footprint (two to eight pixels across), so a far hill keeps a
  // grassy stipple of olive and straw instead of a smooth dune; far copses of trees are dark dotted patches along the draws
  float grain = 0.5;
  float grW = smoothstep(35.0, 200.0, dist);
  if (grW > 0.01) {
    float gk = log2(max(fp * 2.2, 0.35)) + 1.0;
    float gb = floor(gk);
    float gf = gk - gb;
    float gs = exp2(gb);
    float ga = tgDet(xz, gs, 0, vec2(0.05)), gb2 = tgDet(xz, gs * 2.0, 1, vec2(0.62));
    // crossfade the octave pair as the footprint grows so tufts never pop; the coarse term comes from the baked patch map
    float fine = mix(ga, gb2, gf), mid2 = fine, coarse = nM1;
    // contrast restore: a crossfade of two noises is flatter than either alone (about 0.7 at the midpoint)
    fine = 0.5 + (fine - 0.5) * (1.0 + 0.42 * (1.0 - abs(2.0 * gf - 1.0)));
    grain = fine * 0.65 + coarse * 0.35;
    float amp = mix(0.62, 0.3, topK) * grW * (1.0 - 0.8 * uNight) * (1.0 - 0.25 * smoothstep(150.0, 500.0, dist));   // at night the stipple reads as ripples on water: keep only a trace
    grassCol *= 1.0 + (grain - 0.5) * amp + (fine - 0.5) * 0.3 * grW * (1.0 - topK);
    grassCol = mix(grassCol, grassCol * vec3(0.88, 1.05, 0.78), (fine - 0.5) * 0.6 * grW * (1.0 - 0.8 * uNight));
    // pale seed heads and dry tufts catch the sun: sparse bright flecks in the finest octave
    grassCol += grassCol * 0.5 * smoothstep(0.78, 0.95, fine) * grW * ts * (1.0 - topK) * (1.0 - winterK) * (1.0 - uNight);
  }
  float groveAmt = smoothstep(0.62, 0.74, groveN + 0.12 * (draw - 0.2) - 0.07 * highGround) * edgeW * smoothstep(120.0, 480.0, dist) * smoothstep(0.18, 0.5, grain) * (1.0 - topK);
  grassCol = mix(grassCol, grassCol * vec3(0.46, 0.62, 0.4), groveAmt * 0.85 * (1.0 - 0.55 * winterK));

  // blade-scale speckle so ground the grass layer does not cover (beyond the world edge) reads as grass, not as a smooth plane
  if (dist < 110.0) {
    float speck = tgDet(xz, 0.18, 3, vec2(0.0)) * 0.6 + tgDet(xz, 0.071, 2, vec2(0.5)) * 0.4;
    grassCol *= 1.0 + (speck - 0.5) * 0.5 * (1.0 - smoothstep(25.0, 110.0, dist)) * (0.2 + 0.8 * edgeW);
  }
  // close range: grass grows in tussocks about a metre across with darker gaps of shade and soil between them, and the blades combed
  // along the wind, instead of a fuzzy even carpet. Brightness stays balanced (clumps a touch lighter, gaps a touch darker).
  float closeK = 1.0 - smoothstep(14.0, 85.0, dist);
  if (closeK > 0.01) {
    float clLow = tgDet(vec2(xz.x * 1.1 + xz.y * 0.35, xz.y * 1.1 - xz.x * 0.35), 1.0, 2, vec2(0.23));
    float cl = clLow * 0.65 + tgDet(xz, 0.18, 3, vec2(0.0)) * 0.35;
    float tuss = smoothstep(0.2, 0.8, cl);
    grassCol *= mix(1.0, mix(0.74, 1.12, tuss), closeK * 0.85);
    grassCol = mix(grassCol, grassCol * vec3(0.92, 0.88, 0.8) + uSoil * 0.04, (1.0 - tuss) * 0.22 * closeK * (0.4 + 0.6 * stubA));
    // fine combed blade lines inside the clumps (the blade layer carries them nearer; this keeps the ground from going flat between)
    grassCol *= 1.0 + (s1 - 0.5) * 0.22 * closeK * (1.0 - topK * 0.5);
    // blade-scale structure for a low camera: dark gaps between standing blades and pale blade bodies, stretched along the wind and
    // tilted with the view, so the ground under and between the blades is a detailed sward, not a soft smear
    float lowK = (1.0 - smoothstep(0.35, 0.8, -rayDir.y)) * (1.0 - smoothstep(10.0, 70.0, dist));
    if (lowK > 0.01) {
      vec2 wq2 = vec2(dot(xz, wv), dot(xz, vec2(-wv.y, wv.x)));
      float bl1 = tgDet(vec2(wq2.x * 0.16, wq2.y * 2.1), 1.0, 1, vec2(0.37));
      float bl2 = tgDet(vec2(wq2.x * 0.3, wq2.y * 4.6), 1.0, 0, vec2(0.81));
      float blade = bl1 * 0.6 + bl2 * 0.4;
      grassCol *= 1.0 + (blade - 0.5) * 0.7 * lowK;
      grassCol = mix(grassCol, grassCol * vec3(1.1, 1.06, 0.88), smoothstep(0.66, 0.9, bl2) * 0.45 * lowK);
    }
    gTgH += (clLow - 0.5) * 0.1 * closeK;   // metres: a few centimetres of relief over a metre, so the normal tilts a few degrees, not 45
  }

  // winter ground is dull grey-brown straw under the snow, not warm sand
  float lumW = dot(grassCol, vec3(0.2126, 0.7152, 0.0722));
  grassCol = mix(grassCol, vec3(lumW) * vec3(1.0, 0.94, 0.86) * 0.9, 0.38 * winterK);

  // short grass: a little of the soil shows through, darker and earthier, never light sand
  float soilShow = smoothstep(0.1, 0.0, bio + (nC - 0.5) * 0.05) + dirt * 0.25 * edgeW;
  soilShow = clamp(soilShow * (1.0 - 0.45 * riparian), 0.0, 1.0);   // bare shore is partly grassed over where the riparian belt is
  soilShow = clamp(soilShow + uDrought * 0.14 * (0.4 + 0.6 * nM1) * (1.0 - riparian), 0.0, 1.0);   // a drought thins the sward: more ground shows
  // the bare apron on the shaded side of a pond (common.ts): trampled, dusty ground between the waterline and the grass
  float apron = tgPondApron(xz, wd);
  soilShow = max(soilShow, apron);
  vec3 shortGrass = mix(grassCol, grassCol * vec3(0.9, 0.84, 0.74) + uSoil * 0.12, stubA * 0.5);
  // grazed ground is stubble, not a smooth plane: short blade flecks (dark gaps, pale cut ends) at close and middle range
  if (stubA > 0.05 && dist < 220.0) {
    float sb = tgDet(xz, 0.16, 1, vec2(0.41)) * 0.55 + tgDet(xz, 0.44, 0, vec2(0.13)) * 0.45;
    float sbk = stubA * (1.0 - smoothstep(60.0, 220.0, dist));
    shortGrass *= 1.0 + (sb - 0.5) * 0.5 * sbk;
    shortGrass = mix(shortGrass, shortGrass * vec3(1.14, 1.06, 0.84), smoothstep(0.62, 0.9, sb) * 0.5 * sbk);
  }
  // drought soil is dry dusty tan, not dark earth
  vec3 soilCol = tgDroughtSoil(uSoil, uDrought);
  vec3 col = mix(shortGrass, soilCol * (0.8 + 0.5 * nA), soilShow * 0.85);
  // the apron is dry, pale, dusty earth (lighter than the damp mud at the waterline, which the wet line below darkens again)
  if (apron > 0.003) {
    float ag = tgNoise2(xz * 2.3 + 5.0) * 0.6 + tgNoise2(xz * 7.1 + 1.0) * 0.4;
    vec3 dust = vec3(0.33, 0.25, 0.15) * (0.72 + 0.5 * nA) * (0.8 + 0.4 * ag);
    // sparse hoof pits and cracked-mud flecks near the camera
    dust *= 1.0 - 0.3 * smoothstep(0.6, 0.85, tgNoise2(xz * 3.7 + 11.0)) * (1.0 - smoothstep(30.0, 140.0, dist));
    col = mix(col, dust, apron * 0.82);
  }
  gTgGrass = 1.0 - soilShow;

  // rock only on truly steep faces, and only partly
  float outcrop = smoothstep(0.7, 0.8, outN) * smoothstep(0.12, 0.45, slopeG);
  float rock = max(smoothstep(0.78, 1.25, slopeG + (nA - 0.5) * 0.3 + (nD - 0.5) * 0.25), outcrop * 0.85);
  vec3 rockCol = uRock * (0.7 + 0.6 * nC) * (0.85 + 0.3 * nB);
  col = mix(col, rockCol, rock * 0.7);

  // herd trails: grass that animals have grazed down and trampled goes darker, browner and flatter, and the ground shows
  // through as churned earth with small hoof-scale pits near the camera
  float trodK = smoothstep(0.07, 0.55, trod);
  if (trodK > 0.003) {
    col = mix(col, col * vec3(0.7, 0.62, 0.5) + uSoil * 0.08, trodK * 0.6);
    if (dist < 150.0) {
      float hoof = smoothstep(0.55, 0.78, tgNoise2(xz * 2.3 + 3.0) * 0.6 + tgNoise2(xz * 5.9 + 11.0) * 0.4);
      col *= 1.0 - trodK * hoof * 0.35 * (1.0 - smoothstep(25.0, 150.0, dist));
    }
    gTgGrass *= 1.0 - 0.45 * trodK;
  }

  // water's edge: a thin wet line at the waterline, a faint damp band, and a narrow mud lip that is ragged and broken (some stretches of
  // bank run straight from the water to green grass), so from above the riparian green frames the water and not a dark ring
  float damp = (1.0 - smoothstep(0.0, 5.5, wd)) * (0.6 + 0.4 * nA);
  col = mix(col, col * vec3(0.8, 0.76, 0.66), damp * 0.22);
  float wetLine = 1.0 - smoothstep(0.0, 1.1, wd);
  col = mix(col, col * vec3(0.62, 0.57, 0.48), wetLine * 0.4);
  if (wd < 3.0) {
    float lipN = tgNoise2(xz * 0.31 + vec2(5.3, 17.9)) * 0.6 + tgNoise2(xz * 0.9 + vec2(41.0, 3.3)) * 0.4;
    lipN = mix(0.5, lipN, 1.0 - smoothstep(120.0, 420.0, dist));
    float lipW = 0.3 + 1.6 * smoothstep(0.38, 0.72, lipN);
    float mud = 1.0 - smoothstep(0.0, lipW, wd + (nC - 0.5) * 0.9);
    // from the drone the mud lip reads as a pale dirt bank (dry cut bank and sand), as in the concept, not a dark ring
    vec3 mudC = mix(vec3(0.22, 0.175, 0.125), vec3(0.46, 0.37, 0.25), smoothstep(70.0, 180.0, dist) * (1.0 - riparian * 0.4));
    col = mix(col, mudC * (0.8 + 0.4 * nC), mud * 0.62);
  }

  // under tree and shrub cover: cooler, darker, leaf litter
  col = mix(col, col * vec3(0.55, 0.58, 0.4) * (0.8 + 0.4 * nC), cover * 0.5);

  // ---- burn scar: ragged charcoal and ash grey-brown, a scorched halo, a glowing ember front, and regrowth
  // veg.b: 1.0 = burning now, then 0.78 fresh ash decaying to 0 over a year (the engine also fades it as grass regrows)
  float charAmt = 0.0;
  float scar = 0.0;
  float ember = 0.0, emberHalo = 0.0, smolder = 0.0;
  if (burn > 0.002) {
    float rag = tgNoise2(xz * 0.9) * 0.5 + tgNoise2(xz * 2.3 + 7.0) * 0.3 + tgNoise2(xz * 5.7 + 3.0) * 0.2;
    float bR = burn + (rag - 0.5) * 0.8 * smoothstep(0.0, 0.12, burn);
    scar = smoothstep(0.12, 0.3, bR);
    float scorch = smoothstep(0.0, 0.16, bR) * (1.0 - scar);
    float fresh = smoothstep(0.3, 0.76, burn);
    vec3 charC = vec3(0.058, 0.046, 0.034);
    vec3 ashC = vec3(0.37, 0.325, 0.27);
    float ashPatch = smoothstep(0.35, 0.7, tgNoise2(xz * 0.35 + 19.0) * 0.6 + tgNoise2(xz * 0.9 + 3.0) * 0.4);
    float ashMix = clamp(ashPatch * (0.3 + 0.6 * (1.0 - fresh)) + 0.32 * (1.0 - fresh) + 0.1 * (nC - 0.5), 0.0, 1.0);
    vec3 scarCol = mix(charC, ashC, ashMix) * (0.72 + 0.5 * nC) * (0.85 + 0.3 * nA);
    scarCol = mix(scarCol, uSoil * 0.9 + vec3(0.03), (1.0 - fresh) * 0.55);
    col = mix(col, col * vec3(0.5, 0.4, 0.3), scorch * 0.7);
    col = mix(col, scarCol, scar);
    gTgGrass *= (1.0 - scar);
    charAmt = scar;
    // flames: only cells that are burning right now (value 1.0) glow, flickering; the glow spills a little onto the ground around them
    float flick = 0.55 + 0.45 * tgNoise2(xz * 1.3 + uTime * 1.7) + 0.25 * tgNoise2(xz * 4.1 - uTime * 2.9);
    float burningNow = smoothstep(0.9, 0.99, burn);
    ember = smoothstep(0.86, 1.0, bR) * burningNow * flick;
    emberHalo = burningNow * (0.4 + 0.6 * flick);
    // smouldering: for a while after the flames pass (ash value 0.68 to 0.78) scattered embers still glow in the char and fade out
    float smold = smoothstep(0.66, 0.77, burn) * (1.0 - burningNow);
    float spots = smoothstep(0.72, 0.9, tgNoise2(xz * 2.6 + vec2(uTime * 0.12, 3.0)) * 0.6 + tgNoise2(xz * 7.0 - uTime * 0.2) * 0.4);
    smolder = smold * spots * (0.5 + 0.5 * tgNoise2(xz * 3.0 + uTime * 1.1));
  }

  // winter: frost is a thin cold bloom in the shade, never a snow blanket; snow only when it is snowing
  float shadeAmt = 1.0 - ts;
  float frost = uFrost * (0.1 + 0.3 * shadeAmt) * (1.0 - charAmt);
  col = mix(col, col * vec3(0.88, 0.96, 1.1) + vec3(0.07, 0.085, 0.11), clamp(frost * 1.5, 0.0, 0.62));
  // snow lands on flats and in hollows first, is blown off convex ridges and steep faces, and builds up patchily as it keeps
  // snowing; the ground shows through grass tips, ridges and rock until it is deep
  float snowCover = 0.0;
  float spark = 0.0;
  if (uSnow > 0.04) {
    float flatK = smoothstep(0.58, 0.93, nrm.y);
    float dHi = 0.5;
    if (lodMid > 0.002) dHi = mix(0.5, tgNoise2(xz * 0.31 + 4.0) * 0.65 + tgNoise2(xz * 0.8 + 9.0) * 0.35, lodMid);
    float drift = driftLow * 0.6 + dHi * 0.4;
    // aspect: the low winter sun (south, toward -z) melts and blows snow off south faces; north faces hold it. Broad 40 to 120 m
    // patches (the baked macro maps) make a partial pack read as drifts and bare ground, not an even blanket; herd trails stay thin.
    float aspect = clamp(nrm.z * 3.5, -1.0, 1.0) * slopeW;
    float patchy = (nB - 0.5) * 0.55 + (nM1 - 0.5) * 0.4;
    float pot = flatK * 0.62 + drift * 0.5 + hollowK * 0.28 - ridgeK * 0.34 - rock * 0.5 - charAmt * 0.6 + 0.1 * gTgGrass
              + 0.22 * aspect + patchy - trodK * 0.5;
    // The threshold starts above the highest possible potential (about 1.5), so a trace of leftover snow (the eased value never
    // reaches exactly zero) cannot show as isolated white patches on the flattest, wettest spots: nothing settles until there is real snow.
    float sn1 = clamp(uSnow, 0.0, 1.0);
    float Tsn = 1.78 - 1.74 * pow(sn1, 0.66);
    // The edge of a patch is jittered by two scales of noise (about 1.5 m and 40 cm) and ramps over a wide band of the potential, so a
    // patch fades out through grass-flecked snow instead of ending on a cut line; a thin pack is also never fully opaque.
    float edgeN = (tgDet(xz, 1.5, 2, vec2(0.7)) - 0.5) * 0.5 + (tgDet(xz, 0.4, 3, vec2(0.2)) - 0.5) * 0.36;
    float edgeW2 = mix(0.19, 0.12, smoothstep(0.2, 0.8, uSnow));
    float snowAmt = smoothstep(Tsn - 0.2 - edgeW2, Tsn + 0.06 + edgeW2, pot + edgeN * (1.0 - 0.5 * smoothstep(60.0, 400.0, dist))) * smoothstep(0.05, 0.16, uSnow);
    float tipsPoke = (0.3 * gTgGrass * smoothstep(0.45, 0.8, s2 + 0.2 * edgeN)) * (1.0 - smoothstep(0.4, 0.9, uSnow));
    float packCap = mix(0.86, 0.96, smoothstep(0.1, 0.7, uSnow));
    snowCover = clamp(snowAmt * (packCap - tipsPoke), 0.0, 1.0);
    // Snow stays white and takes the sky in its shade, even under warm sun: the albedo is rebalanced against the key light's
    // colour (a golden sun then lights it cream, not sand), and shadowed or sheltered snow turns cool blue.
    vec3 lc = max(uLightColor, vec3(1e-3));
    vec3 warmth = lc / max(dot(lc, vec3(0.3333)), 1e-3);
    vec3 snowAlb = vec3(0.97, 0.955, 0.935) / mix(vec3(1.0), warmth, 0.1);
    snowAlb = min(snowAlb / max(snowAlb.r, max(snowAlb.g, snowAlb.b)), vec3(1.0)) * 0.97;
    float cool = clamp((1.0 - ts) * 0.7 + hollowK * 0.15 + (1.0 - nrm.y) * 0.25, 0.0, 1.0);
    vec3 snowC = snowAlb * mix(vec3(1.0), vec3(0.95, 0.98, 1.03), cool);
    // fine mottling and wind ripples so it is a surface, not a flat white fill
    snowC *= (0.94 + 0.08 * nC + 0.05 * (nA - 0.5) + streakTone * 0.12) * (1.0 - 0.45 * uNight);   // moonlit snow is grey-blue, not a floodlit white
    snowC = mix(snowC, col * 2.0 + vec3(0.05), 0.07 * (1.0 - snowCover * 0.5));
    col = mix(col, snowC, snowCover);
    col = mix(col, col * vec3(0.76, 0.76, 0.78), trodK * snowCover * 0.55);
    // sastrugi-like relief: soft drifts and wind-combed ripples take the light, the grass relief underneath is buried
    gTgH = mix(gTgH, ((s2 - 0.5) * 0.1 * f2 + (s3 - 0.5) * 0.3 * f3 + (nA - 0.5) * 0.05 * lodFine) * mix(0.6, 1.0, graze), snowCover * 0.8);
    // glints: sparse ice crystals that flash when their facet lines up with the half vector, near the camera, sunlit snow only
    if (snowCover > 0.3 && dist < 80.0 && uLightDir.y > 0.02) {
      vec2 gc = xz * 34.0;
      vec2 gi = floor(gc);
      float gh = tgHash21(gi);
      if (gh > 0.9) {
        vec3 fnr = vec3(tgHash21(gi + 3.1), tgHash21(gi + 7.7), tgHash21(gi + 1.3)) - 0.5;
        vec3 fn = normalize(nrm + fnr * 1.9);
        vec3 hv = normalize(uLightDir - rayDir);
        float gd = length(fract(gc) - 0.5);
        spark = pow(max(dot(fn, hv), 0.0), 140.0) * smoothstep(0.5, 0.15, gd) * snowCover * ts * (1.0 - smoothstep(30.0, 80.0, dist));
      }
    }
  }

  // moonlit meadow: grass stays grass, cooler and darker, and the combed strokes stay readable
  if (uNight > 0.02) {
    // swaths of darker and lighter grass (the baked patch maps) and a fine tuft grain, so the ground keeps grass texture and value
    // structure instead of one wavy teal sheet; the long combed bands that read as waves at night are damped
    float nSwath = 0.8 + 0.55 * (p1 - 0.5) + 0.4 * (nM1 - 0.5) + 0.3 * (p2 - 0.5);
    float nTuft = 1.0;
    vec3 nCol = col * vec3(0.8, 0.95, 0.97) * 0.74 * nSwath * nTuft * (0.9 + streakTone * 0.3);
    gTgH *= 1.0 - 0.5 * uNight * smoothstep(40.0, 300.0, dist);
    col = mix(col, nCol, uNight * (1.0 - snowCover) * (1.0 - 0.6 * rock));
  }

  // rain darkens and glosses the ground
  col *= mix(1.0, 0.74, uWet * (1.0 - snowCover));
  // wet ground is darker and a little glossier near the camera, but a low sun on a wet slope at grazing angles reflects as a pale
  // sheen that reads as snow or mist: keep the far ground rough so it never goes whiter than dry grass
  gTgRough = mix(mix(0.95, 0.66, uWet), 1.0, smoothstep(90.0, 420.0, dist) * (0.4 + 0.6 * uWet));

  // looking toward a low sun makes standing grass glow: forward scattering through the blades
  float fwd = max(dot(rayDir, uLightDir), 0.0);
  float lowSun = 1.0 - smoothstep(0.1, 0.65, uLightDir.y);
  float glow = pow(fwd, 3.0) * (0.35 + 0.65 * lowSun) * gTgGrass * (1.0 - rock) * (1.0 - snowCover) * ts * (1.0 - uWet);
  gTgEmis = col * uLightColor * glow * 0.1;
  gTgEmis += vec3(3.4, 0.95, 0.15) * ember + vec3(1.1, 0.22, 0.03) * emberHalo * 0.4 + vec3(1.6, 0.34, 0.05) * smolder;
  gTgEmis += uLightColor * (spark * 2.2);
  // snow scatters the sky light into its own shade: a faint cool glow so shadowed snow stays white-blue and never goes grey or beige
  gTgEmis += col * vec3(0.036, 0.038, 0.042) * snowCover * (1.0 - 0.9 * uNight);

  if (uFear > 0.001) {
    col = mix(col, vec3(0.85, 0.05, 0.04), fear * uFear * 0.7);
    gTgEmis += vec3(fear * uFear * 0.35, 0.0, 0.0);
  }
  return max(col, vec3(0.0));
}
`;
