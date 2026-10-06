// Static world generation: terrain, creek, ponds, moisture, soil, cover, trees.
// Deterministic from the seed. Pure data, no rendering.
import { Rng } from './rng';
import { Noise2 } from './noise';

export interface World {
  seed: number;
  /** World edge length in meters. World spans [0, size] on x and y (y is "north" on the map). */
  size: number;
  /** Vegetation grid cells per side. */
  n: number;
  /** Meters per vegetation cell. */
  cell: number;
  /** Height samples per side (n + 1); sample (i, j) sits at x = i * cell, y = j * cell. */
  hn: number;
  /** Terrain height in meters, hn * hn, row-major by y then x. */
  height: Float32Array;
  /** 1 where the cell is water (creek or pond). n * n. */
  water: Uint8Array;
  /** Water surface elevation (m) for water cells, 0 elsewhere. n * n. */
  waterHeight: Float32Array;
  /** Distance (m) from cell center to nearest water cell. n * n. */
  waterDist: Float32Array;
  /** Static base moisture 0..1. n * n. */
  moisture: Float32Array;
  /** Base soil fertility 0..1. n * n. */
  soilBase: Float32Array;
  /** Tree and shrub cover 0..1. n * n. */
  cover: Float32Array;
  /** Terrain slope (rise over run). n * n. */
  slope: Float32Array;
  /** Grass carrying capacity 0..1 before season and weather. n * n. */
  capacity: Float32Array;
  /** Cottonwoods: stride 4 (x, y, height m, crown radius m). */
  trees: Float32Array;
  /** Shrub clumps: stride 3 (x, y, radius m). */
  shrubs: Float32Array;
  /** Creek centerline polyline: stride 2 (x, y), upstream to downstream. */
  creek: Float32Array;
  /** Ponds: stride 4 (x, y, radius m, surface height m). */
  ponds: Float32Array;
  /** Border entry points for the open prairie (V2-PLAN.md S1), stride 4: x, y on the border, inward unit normal (nx, ny).
   *  Eight of them: the creek inlet and outlet, and the lowest rim cell in each remaining eighth of the rim. */
  corridors: Float32Array;
  /** Prairie dog suitability per coarse cell (S4), COARSE_N x COARSE_N (16 m cells), 0..1: flat, dry, open ground. 0 where a town cannot sit
   *  (water, steep, wooded or wet). Computed from the finished terrain with no random draws. */
  dogCap: Float32Array;
}

/** Cells per side of the coarse grid shared by the herd map and the small-prey fields (V2-PLAN.md S4). */
export const COARSE_N = 32;

export const WORLD_SIZE = 512;
export const GRID_N = 256;

export function generateWorld(seed: number, size = WORLD_SIZE, n = GRID_N): World {
  const rng = new Rng(seed ^ 0x5eed);
  const noise = new Noise2(rng.fork(1));
  const noise2 = new Noise2(rng.fork(2));
  const cell = size / n;
  const hn = n + 1;
  const height = new Float32Array(hn * hn);

  // 1. Base rolling hills, framed by higher ground at the edges (a valley bowl).
  for (let j = 0; j < hn; j++) {
    for (let i = 0; i < hn; i++) {
      const x = i * cell, y = j * cell;
      const u = x / size, v = y / size;
      let h = 14 * noise.fbm(u * 2.2, v * 2.2, 5);
      h += 5 * noise2.fbm(u * 6, v * 6, 3);
      const ridge = noise2.ridged(u * 3.1 + 7, v * 3.1 - 3, 4);
      h += 9 * Math.max(0, ridge - 0.55) * 2.2;
      const ex = Math.min(u, 1 - u), ey = Math.min(v, 1 - v);
      const edge = Math.min(ex, ey);
      h += 22 * Math.pow(Math.max(0, 0.16 - edge) / 0.16, 2);
      height[j * hn + i] = h;
    }
  }

  // 2. Creek: meander across the map from the west edge to the east edge.
  const creekPts: number[] = [];
  {
    let x = -10;
    let y = size * rng.range(0.35, 0.65);
    let ang = rng.range(-0.3, 0.3);
    const step = 4;
    while (x < size + 10) {
      creekPts.push(x, y);
      const t = x / size;
      const wander = noise.get(t * 4.2 + 11, 4.2) * 1.5 + 0.5 * noise2.get(t * 11 + 3, 7.7);
      const pullToMid = (size * 0.5 - y) / size;
      ang = ang * 0.86 + 0.14 * (wander + pullToMid * 2.2);
      ang = Math.max(-1.15, Math.min(1.15, ang));
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
    }
  }
  const creek = new Float32Array(creekPts);
  const nc = creek.length / 2;
  // cumulative length along the creek, for a monotonic downhill bed profile
  const along = new Float32Array(nc);
  for (let k = 1; k < nc; k++) {
    along[k] = along[k - 1] + Math.hypot(creek[2 * k] - creek[2 * k - 2], creek[2 * k + 1] - creek[2 * k - 1]);
  }
  const totalLen = along[nc - 1];
  // Bed starts a little above the median valley height and drops 4 m over the course.
  const sortedH = Float32Array.from(height).sort();
  const medianH = sortedH[(sortedH.length * 0.3) | 0];
  const bedStart = medianH - 1.0;
  const bedDrop = 4.0;
  const bedAt = (t: number) => bedStart - bedDrop * t;

  const nearestOnCreek = (x: number, y: number) => {
    let best = 1e9, bestT = 0;
    for (let k = 0; k < nc - 1; k++) {
      const ax = creek[2 * k], ay = creek[2 * k + 1];
      const bx = creek[2 * k + 2], by = creek[2 * k + 3];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let s = ((x - ax) * dx + (y - ay) * dy) / len2;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const px = ax + dx * s, py = ay + dy * s;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < best) {
        best = d2;
        bestT = (along[k] + s * Math.sqrt(len2)) / totalLen;
      }
    }
    return { d: Math.sqrt(best), t: bestT };
  };

  const valleyHalfWidth = 46;
  const channelHalfWidth = 3.2;
  const creekT = new Float32Array(hn * hn);
  const creekD = new Float32Array(hn * hn);
  for (let j = 0; j < hn; j++) {
    for (let i = 0; i < hn; i++) {
      const idx = j * hn + i;
      const { d, t } = nearestOnCreek(i * cell, j * cell);
      creekD[idx] = d;
      creekT[idx] = t;
      const bed = bedAt(t);
      const floor = bed + 1.1; // floodplain sits just above the water
      const h0 = height[idx];
      if (d < valleyHalfWidth) {
        const s = d / valleyHalfWidth;
        const blend = s * s * (3 - 2 * s);
        let h = floor + (Math.max(h0, floor) - floor) * blend;
        if (d < channelHalfWidth + 2.5) {
          const c = Math.max(0, 1 - Math.max(0, d - channelHalfWidth) / 2.5);
          h = h + (bed - 0.6 - h) * c;
        }
        height[idx] = Math.min(h0 + 0.5, h);
      }
    }
  }

  // 3. Ponds in open ground away from the creek.
  const ponds: number[] = [];
  const nPonds = 3;
  for (let attempt = 0; attempt < 200 && ponds.length < nPonds * 4; attempt++) {
    const px = rng.range(size * 0.18, size * 0.82);
    const py = rng.range(size * 0.18, size * 0.82);
    const r = rng.range(10, 18);
    const ci = Math.round(px / cell), cj = Math.round(py / cell);
    if (creekD[cj * hn + ci] < 70) continue;
    let ok = true;
    for (let p = 0; p < ponds.length; p += 4) {
      if (Math.hypot(ponds[p] - px, ponds[p + 1] - py) < 110) ok = false;
    }
    if (!ok) continue;
    // surface sits a bit below the average ground around the rim
    let rim = 0, cnt = 0;
    for (let a = 0; a < 16; a++) {
      const ax = px + Math.cos((a / 16) * Math.PI * 2) * r;
      const ay = py + Math.sin((a / 16) * Math.PI * 2) * r;
      rim += sampleHeight(height, hn, cell, ax, ay);
      cnt++;
    }
    const surface = rim / cnt - 0.5;
    ponds.push(px, py, r, surface);
    const R = r * 2.2;
    for (let j = Math.max(0, Math.floor((py - R) / cell)); j <= Math.min(hn - 1, Math.ceil((py + R) / cell)); j++) {
      for (let i = Math.max(0, Math.floor((px - R) / cell)); i <= Math.min(hn - 1, Math.ceil((px + R) / cell)); i++) {
        const d = Math.hypot(i * cell - px, j * cell - py);
        if (d > R) continue;
        const idx = j * hn + i;
        if (d < r) {
          const depth = 1.8 * (1 - (d / r) * (d / r)) + 0.4;
          height[idx] = Math.min(height[idx], surface - depth);
        } else {
          // gentle bowl blending out to the surrounding ground
          const s = (d - r) / (R - r);
          const target = surface + 0.25 + (height[idx] - surface - 0.25) * s * s;
          height[idx] = Math.min(height[idx], Math.max(target, surface + 0.15));
        }
      }
    }
  }

  // 4. Per-cell fields.
  const N2 = n * n;
  const water = new Uint8Array(N2);
  const waterHeight = new Float32Array(N2);
  const slope = new Float32Array(N2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i;
      const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
      const h = sampleHeight(height, hn, cell, x, y);
      const hx = sampleHeight(height, hn, cell, x + cell, y) - sampleHeight(height, hn, cell, x - cell, y);
      const hy = sampleHeight(height, hn, cell, x, y + cell) - sampleHeight(height, hn, cell, x, y - cell);
      slope[c] = Math.hypot(hx, hy) / (2 * cell);
      // creek
      const vi = Math.min(hn - 1, Math.round(x / cell)), vj = Math.min(hn - 1, Math.round(y / cell));
      const vidx = vj * hn + vi;
      const surf = bedAt(creekT[vidx]) - 0.05;
      if (creekD[vidx] < channelHalfWidth + 1.5 && h < surf) {
        water[c] = 1;
        waterHeight[c] = surf;
      }
      for (let p = 0; p < ponds.length; p += 4) {
        if (Math.hypot(x - ponds[p], y - ponds[p + 1]) < ponds[p + 2] * 1.3 && h < ponds[p + 3]) {
          water[c] = 1;
          waterHeight[c] = ponds[p + 3];
        }
      }
    }
  }

  const waterDist = distanceTransform(water, n, cell);

  // 5. Moisture, soil, trees, shrubs, cover, capacity.
  const moisture = new Float32Array(N2);
  const soilBase = new Float32Array(N2);
  const cover = new Float32Array(N2);
  const capacity = new Float32Array(N2);
  let hmin = 1e9, hmax = -1e9;
  for (let k = 0; k < height.length; k++) {
    hmin = Math.min(hmin, height[k]);
    hmax = Math.max(hmax, height[k]);
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i;
      const x = (i + 0.5) * cell, y = (j + 0.5) * cell;
      const h = sampleHeight(height, hn, cell, x, y);
      const low = 1 - (h - hmin) / (hmax - hmin + 1e-6);
      const near = Math.exp(-waterDist[c] / 55);
      moisture[c] = clamp01(0.25 + 0.45 * near + 0.3 * low + 0.12 * noise2.fbm(x / 90, y / 90, 3));
      soilBase[c] = clamp01(0.72 + 0.22 * noise.fbm(x / 70 + 40, y / 70 - 12, 4) - 0.9 * Math.max(0, slope[c] - 0.25));
    }
  }

  const trees: number[] = [];
  const shrubs: number[] = [];
  // cottonwood groves hug the water; scattered bur oaks in sheltered draws
  for (let k = 0; k < 2600 && trees.length < 4 * 340; k++) {
    const x = rng.range(4, size - 4), y = rng.range(4, size - 4);
    const c = cellIndex(x, y, n, cell);
    if (water[c]) continue;
    const wd = waterDist[c];
    const grove = noise.fbm(x / 45 + 100, y / 45 + 100, 3);
    // trees hug the water like the concept art; the open prairie stays open
    let p = 0;
    if (wd > 3 && wd < 26) p = 0.55 + grove;
    else if (wd < 55) p = 0.06 * (grove - 0.15) * 4 * moisture[c];
    else p = 0.012 * Math.max(0, grove - 0.4) * 6 * moisture[c];
    if (slope[c] > 0.45) p *= 0.2;
    if (rng.next() < p) {
      const th = rng.range(9, 17) * (wd < 26 ? 1 : 0.75);
      trees.push(x, y, th, th * rng.range(0.38, 0.5));
    }
  }
  for (let k = 0; k < 4000 && shrubs.length < 3 * 900; k++) {
    const x = rng.range(4, size - 4), y = rng.range(4, size - 4);
    const c = cellIndex(x, y, n, cell);
    if (water[c]) continue;
    const s = noise2.fbm(x / 35 - 50, y / 35 + 20, 3);
    // brush gathers in draws, on steep ground and near water rather than dotting the open plain
    let p = 0.12 * Math.max(0, s - 0.05) * 3;
    if (waterDist[c] < 30) p += 0.3;
    if (slope[c] > 0.3) p += 0.25;
    if (rng.next() < p * 0.5) shrubs.push(x, y, rng.range(1.2, 2.6));
  }
  const splat = (x: number, y: number, r: number, amt: number) => {
    const i0 = Math.max(0, Math.floor((x - r) / cell)), i1 = Math.min(n - 1, Math.floor((x + r) / cell));
    const j0 = Math.max(0, Math.floor((y - r) / cell)), j1 = Math.min(n - 1, Math.floor((y + r) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot((i + 0.5) * cell - x, (j + 0.5) * cell - y);
        if (d < r) cover[j * n + i] = Math.min(1, cover[j * n + i] + amt * (1 - d / r));
      }
    }
  };
  for (let k = 0; k < trees.length; k += 4) splat(trees[k], trees[k + 1], trees[k + 3] * 1.1, 0.9);
  for (let k = 0; k < shrubs.length; k += 3) splat(shrubs[k], shrubs[k + 1], shrubs[k + 2] * 1.5, 0.6);

  for (let c = 0; c < N2; c++) {
    if (water[c]) { capacity[c] = 0; continue; }
    const m = moisture[c];
    const moistFactor = 0.35 + 0.65 * Math.min(1, m / 0.7);
    capacity[c] = clamp01(soilBase[c] * moistFactor * (1 - 0.45 * cover[c]) * (1 - Math.min(0.6, slope[c] * 0.8)));
  }

  return {
    seed, size, n, cell, hn, height, water, waterHeight, waterDist, moisture, soilBase, cover, slope, capacity,
    trees: new Float32Array(trees), shrubs: new Float32Array(shrubs), creek, ponds: new Float32Array(ponds),
    corridors: findCorridors(height, hn, size, cell, creek),
    dogCap: findDogCap(n, water, slope, cover, waterDist, moisture),
  };
}

/** Coarse cells below this mean suitability hold no prairie dog town at all. */
const DOG_CAP_MIN = 0.35;

/**
 * Prairie dog suitability on the coarse grid: each land cell scores flat x open x dry (slope under 0.12 is fully flat and over 0.30
 * not at all; no cover is fully open and 0.25 cover not at all; dry means 38 m or more from water, nothing at 8 m or less, and a
 * moisture under 0.53 counts fully, over 0.78 not at all), a coarse cell takes the mean over its fine cells, and anything under DOG_CAP_MIN, or with more than 5% water,
 * is 0. Roughly a quarter of the valley qualifies. No random draws.
 */
function findDogCap(n: number, water: Uint8Array, slope: Float32Array, cover: Float32Array, waterDist: Float32Array, moisture: Float32Array): Float32Array {
  const B = COARSE_N, r = n / B;
  const cap = new Float32Array(B * B);
  const wet = new Float32Array(B * B);
  for (let j = 0; j < n; j++) {
    const bj = Math.floor(j / r) * B;
    for (let i = 0; i < n; i++) {
      const c = j * n + i, k = bj + Math.floor(i / r);
      if (water[c]) { wet[k] += 1; continue; }
      const flat = clamp01((0.3 - slope[c]) / 0.18);
      const open = clamp01(1 - cover[c] / 0.25);
      const dry = clamp01((waterDist[c] - 8) / 30) * clamp01((0.78 - moisture[c]) / 0.25);
      cap[k] += flat * open * dry;
    }
  }
  const inv = 1 / (r * r);
  for (let k = 0; k < B * B; k++) {
    const v = cap[k] * inv;
    cap[k] = wet[k] * inv > 0.05 || v < DOG_CAP_MIN ? 0 : Math.min(1, v);
  }
  return cap;
}

/**
 * Eight border entry points, computed from the finished terrain with no random draws (so the world generator's
 * stream is untouched). The rim (4 sides, going round from the south-west corner) is split into eighths. Each eighth
 * gets its lowest rim sample, keeping 8 cells clear of the corners; the creek inlet (west edge) and outlet (east edge)
 * take over the eighths they sit in. Returned in rim order, stride 4: x, y, inward normal.
 */
function findCorridors(height: Float32Array, hn: number, size: number, cell: number, creek: Float32Array): Float32Array {
  const n = hn - 1;
  const margin = 8;
  const out = new Float32Array(8 * 4);
  const best = new Float32Array(8).fill(1e9);
  const rimPoint = (p: number): { i: number; j: number; nx: number; ny: number; k: number } => {
    const side = Math.floor(p / n), k = p % n;
    if (side === 0) return { i: k, j: 0, nx: 0, ny: 1, k };
    if (side === 1) return { i: n, j: k, nx: -1, ny: 0, k };
    if (side === 2) return { i: n - k, j: n, nx: 0, ny: -1, k };
    return { i: 0, j: n - k, nx: 1, ny: 0, k };
  };
  for (let p = 0; p < 4 * n; p++) {
    const r = rimPoint(p);
    if (r.k < margin || r.k > n - margin) continue;
    const e = Math.min(7, Math.floor(p / (n / 2)));
    const h = height[r.j * hn + r.i];
    if (h < best[e]) {
      best[e] = h;
      out.set([r.i * cell, r.j * cell, r.nx, r.ny], e * 4);
    }
  }
  // creek inlet and outlet: where the centerline crosses x = 0 and x = size
  const nc = creek.length / 2;
  const cross = (target: number): number => {
    for (let k = 0; k < nc - 1; k++) {
      const x0 = creek[2 * k], x1 = creek[2 * k + 2];
      if ((x0 - target) * (x1 - target) <= 0 && x0 !== x1) {
        const s = (target - x0) / (x1 - x0);
        return creek[2 * k + 1] + (creek[2 * k + 3] - creek[2 * k + 1]) * s;
      }
    }
    return size / 2;
  };
  const clampY = (y: number) => Math.min(size - margin * cell, Math.max(margin * cell, y));
  const inletY = clampY(cross(0)), outletY = clampY(cross(size));
  // west edge is side 3 (p = 3n + n - j), east edge is side 1 (p = n + j)
  const inP = 3 * n + (n - Math.round(inletY / cell)), outP = n + Math.round(outletY / cell);
  out.set([0, inletY, 1, 0], Math.min(7, Math.floor(inP / (n / 2))) * 4);
  out.set([size, outletY, -1, 0], Math.min(7, Math.floor(outP / (n / 2))) * 4);
  return out;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function cellIndex(x: number, y: number, n: number, cell: number): number {
  let i = Math.floor(x / cell), j = Math.floor(y / cell);
  if (i < 0) i = 0; else if (i >= n) i = n - 1;
  if (j < 0) j = 0; else if (j >= n) j = n - 1;
  return j * n + i;
}

/** Bilinear terrain height at world position (x, y). */
export function sampleHeight(height: Float32Array, hn: number, cell: number, x: number, y: number): number {
  let fx = x / cell, fy = y / cell;
  const max = hn - 1.001;
  fx = fx < 0 ? 0 : fx > max ? max : fx;
  fy = fy < 0 ? 0 : fy > max ? max : fy;
  const i = Math.floor(fx), j = Math.floor(fy);
  const tx = fx - i, ty = fy - j;
  const a = height[j * hn + i], b = height[j * hn + i + 1];
  const c = height[(j + 1) * hn + i], d = height[(j + 1) * hn + i + 1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

export function heightAt(w: World, x: number, y: number): number {
  return sampleHeight(w.height, w.hn, w.cell, x, y);
}

/** Two-pass chamfer distance transform (meters) from cells where src != 0. */
export function distanceTransform(src: Uint8Array, n: number, cell: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) d[k] = src[k] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - n] + a);
        if (i > 0) v = Math.min(v, d[k - n - 1] + b);
        if (i < n - 1) v = Math.min(v, d[k - n + 1] + b);
      }
      d[k] = v;
    }
  }
  for (let j = n - 1; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      let v = d[k];
      if (i < n - 1) v = Math.min(v, d[k + 1] + a);
      if (j < n - 1) {
        v = Math.min(v, d[k + n] + a);
        if (i < n - 1) v = Math.min(v, d[k + n + 1] + b);
        if (i > 0) v = Math.min(v, d[k + n - 1] + b);
      }
      d[k] = v;
    }
  }
  for (let k = 0; k < n * n; k++) d[k] *= cell;
  return d;
}
