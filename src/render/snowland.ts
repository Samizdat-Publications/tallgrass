/**
 * Landform snow field: where the valley's shape lets snow lie, baked once per world for the ground and blade shaders.
 *
 * The old snow potential leaned on noise that varies over 40 to 150 m, so a thin pack read from the drone as big camouflage blobs
 * that had nothing to do with the hills. This field is built from the heights instead, at four scales so that no one patch size
 * dominates (r-snow: reviewers read a single scale as a uniform cow print):
 *   - hollows: the ground against its own smoothed self at radii of about 5, 14, 40 and 100 m. A swale, a basin or a whole valley
 *     floor collects snow; a hummock, a knoll or a broad ridge is scoured. Each scale is normalised by its own spread, so the result
 *     does not depend on how rough the seed is, and the scales are mixed with a contrast curve: a clear hollow is nearly full, a clear
 *     crest nearly bare, and the ground between (the windward flanks) sits near the threshold where the shader scatters thin patches.
 *   - aspect: the slope of the smoothed ground at about 14 m and 40 m, so whole hillsides hold or shed snow together: the sheltered
 *     faces keep it and the faces the low winter sun reaches are bare. (Same sign as the shaders' per-pixel aspect: normal.z above
 *     zero holds.)
 * Output is one byte per cell, 128 = neutral, above it favours snow, below it sheds it. The shaders read it as `(b - 0.5) * 2`.
 * Pure function of the world's heights, so the ground and the blade layer (each with its own copy of the texture) always agree.
 */
import type { World } from '../sim/world';

/** Separable box blur on an n x n field, edge clamped. */
function blur(src: Float32Array, n: number, r: number): Float32Array {
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

/** Two box passes: close to a Gaussian of about the same radius. */
function smooth(src: Float32Array, n: number, r: number): Float32Array {
  return blur(blur(src, n, r), n, r);
}

/** Radii (metres) of the hollow scales and their weights: fine swales, small basins, hillside bowls, valley floors. */
export const HOLLOW_R = [5, 14, 40, 100];
const HOLLOW_W = [0.17, 0.27, 0.31, 0.25];

export function buildSnowLand(world: World): Uint8Array {
  const { n, hn, cell } = world;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      h[j * n + i] = 0.25 * (world.height[j * hn + i] + world.height[j * hn + i + 1] + world.height[(j + 1) * hn + i] + world.height[(j + 1) * hn + i + 1]);
    }
  }
  // departure of the ground from its smoothed self at each scale, normalised by its own spread
  const blurs: Float32Array[] = [];
  const dep: Float32Array[] = [];
  for (const r of HOLLOW_R) {
    const b = smooth(h, n, Math.max(1, Math.round(r / cell)));
    blurs.push(b);
    const t = new Float32Array(n * n);
    let v = 0;
    for (let k = 0; k < n * n; k++) { t[k] = h[k] - b[k]; v += t[k] * t[k]; }
    const sd = Math.sqrt(v / (n * n)) + 1e-4;
    for (let k = 0; k < n * n; k++) t[k] /= sd;
    dep.push(t);
  }
  const bS = blurs[1], bL = blurs[2];
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      // low ground against its surroundings (negative departure) collects snow
      let d = 0;
      for (let s = 0; s < HOLLOW_R.length; s++) d -= HOLLOW_W[s] * dep[s][k];
      // contrast: a clear hollow is nearly full and a clear crest nearly bare; the ground between stays near neutral
      const dc = Math.max(-1.6, Math.min(1.6, d / 0.8));
      const hol = Math.sign(dc) * (1 - Math.pow(1 - Math.min(1, Math.abs(dc) / 1.6), 1.7));
      // slope of the smoothed ground toward +z; normal.z = -dh/dz, so a face that looks toward +z (downhill toward +z) holds snow
      const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const dzS = (bS[j1 * n + i] - bS[j0 * n + i]) / ((j1 - j0) * cell);
      const dzL = (bL[j1 * n + i] - bL[j0 * n + i]) / ((j1 - j0) * cell);
      const asp = Math.max(-1, Math.min(1, -(0.55 * dzS + 0.45 * dzL) * 7));
      const f = Math.max(-1, Math.min(1, 0.68 * hol + 0.32 * asp));
      out[k] = Math.round((0.5 + 0.5 * f) * 255);
    }
  }
  return out;
}
