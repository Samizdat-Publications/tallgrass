/**
 * Landform snow field: where the valley's large-scale shape lets snow lie, baked once per world for the ground and blade shaders.
 *
 * The old snow potential leaned on noise that varies over 40 to 150 m, so a thin pack read from the drone as big camouflage blobs
 * that had nothing to do with the hills. This field is built from the heights instead:
 *   - hollows: the ground against its own smoothed self at two radii (about 18 m and 55 m); a basin or a swale collects snow, a
 *     knoll or a ridge crest is scoured. Each is normalised by its own spread, so the result does not depend on how rough the seed is.
 *   - aspect: the slope of the smoothed ground (about 18 m), so whole hillsides hold or shed snow together: the sheltered faces keep
 *     it and the faces the low winter sun reaches are bare. (Same sign as the shaders' per-pixel aspect: normal.z above zero holds.)
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

export function buildSnowLand(world: World): Uint8Array {
  const { n, hn, cell } = world;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      h[j * n + i] = 0.25 * (world.height[j * hn + i] + world.height[j * hn + i + 1] + world.height[(j + 1) * hn + i] + world.height[(j + 1) * hn + i + 1]);
    }
  }
  const rS = Math.max(1, Math.round(10 / cell)), rL = Math.max(2, Math.round(30 / cell));
  const bS = smooth(h, n, rS), bL = smooth(h, n, rL);
  const tS = new Float32Array(n * n), tL = new Float32Array(n * n);
  let vS = 0, vL = 0;
  for (let k = 0; k < n * n; k++) {
    tS[k] = h[k] - bS[k];
    tL[k] = h[k] - bL[k];
    vS += tS[k] * tS[k];
    vL += tL[k] * tL[k];
  }
  const sS = Math.sqrt(vS / (n * n)) + 1e-4, sL = Math.sqrt(vL / (n * n)) + 1e-4;
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      // low ground against its surroundings (negative departure) collects snow
      const hol = Math.max(-1, Math.min(1, -(0.4 * tS[k] / sS + 0.6 * tL[k] / sL) / 1.7));
      // slope of the smoothed ground toward +z; normal.z = -dh/dz, so a face that looks toward +z (downhill toward +z) holds snow
      const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const dz = (bS[j1 * n + i] - bS[j0 * n + i]) / ((j1 - j0) * cell);
      const asp = Math.max(-1, Math.min(1, -dz * 7));
      const f = Math.max(-1, Math.min(1, 0.68 * hol + 0.32 * asp));
      out[k] = Math.round((0.5 + 0.5 * f) * 255);
    }
  }
  return out;
}
