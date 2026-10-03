// GPU-instanced grass field for Tallgrass.
//
// Design (all placement is procedural on the GPU, the CPU only picks which cells to draw):
//  - The world is cut into square "cells" at four LOD levels (4, 8, 16, 32 m). Each level has a fixed
//    number of blades per cell (a jittered grid, so the field never clumps or leaves holes) and its own blade
//    mesh (13, 7, 5, 3 vertices). Level L draws only blades whose distance to the camera falls inside its ring.
//  - One draw call per level. Instance id -> (cell slot, blade index); the cell slot indexes a small float
//    data texture the CPU refills every frame with the frustum-culled list of cells.
//  - Blade density is one smooth function of distance D(d). Every blade carries a stable random number and is kept
//    when it is below D(d) / levelMaxDensity, so density is continuous across ring borders and thinning is
//    stable (no shimmering). Thinned blades widen so coverage holds up, down to a clump-like tuft at 100+ m.
//  - Height, density, colour come from the engine's vegetation texture (R biomass, B burn), sampled with a
//    manual bilinear fetch so the field has no visible cell grid. Terrain height comes from a float texture.
//  - Wind: travelling gust bands (anisotropic noise advected downwind) bend blades along a length-preserving
//    arc; the bending changes normals, so the bands read as rolling light and dark. Plus per-blade flutter.
//  - Shading is custom: wrapped diffuse, a backlight translucency term (the golden hour glow), tip sheen,
//    fake base occlusion. Scene fog, scene shadows and the scene hemisphere light are honoured through
//    three's own chunks.
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { EnvState } from '../sim/types';

export interface GrassOptions {
  quality?: 'high' | 'medium';
  /**
   * The engine's hill-shadow uniform (engine.uniforms.terrainShadow: R = visibility 0..1 over the whole world).
   * Optional: if omitted, the field looks for it on the scene (the water material shares it) at runtime.
   */
  terrainShadow?: { value: THREE.Texture | null };
}

export interface GrassSun {
  /** Unit vector pointing FROM the scene TOWARD the sun. */
  dir: THREE.Vector3;
  /** Direct light radiance, i.e. light.color * light.intensity (same convention as a DirectionalLight). */
  color: THREE.Color;
}

/** Tunables, read every frame. */
export interface GrassParams {
  /** Multiplier on the sun color for grass only. */
  lightScale: number;
  /** Strength of the backlight translucency glow. */
  translucency: number;
  /** Tip specular sheen. */
  specular: number;
  /** How strongly gust bands brighten and darken the field. */
  gustLight: number;
  /** Full-lush blade height in meters. */
  maxHeight: number;
  /** Blade width at the base in meters (near LOD). */
  bladeWidth: number;
  /** Multiplier on the wind bend. */
  windGain: number;
  /** How much the base of the grass darkens (0 none, 1 strong). */
  baseOcclusion: number;
  /** Warm bounce fill from the surrounding sunlit field, as a fraction of the sun diffuse (lifts shadowed grass). */
  bounce: number;
  /** Color saturation of the grass (1 = as authored). Raise to compensate for desaturating tone mappers. */
  saturation: number;
  /** Debug view: 0 off, 1 albedo, 2 diffuse, 3 translucency, 4 ambient, 5 specular, 6 shadow, 7 gust, 8 combing noise, 9 LOD level colors. */
  debug: number;
}

// ---- LOD layout -------------------------------------------------------------------------------------------
const CELL_SIZE = [4, 8, 16, 32];
const RING_EDGE = [14, 40, 90, 175]; // outer edge (m) of each level, measured with the shared distance metric
const FADE_START = 120;
const FADE_END = 175;
const HALF_DIST = 18; // D(d) = D0 / (1 + (d / HALF_DIST)^2)^DENS_POW
const FLOWER_BASE = 0.012; // fraction of blades that are flowers at peak bloom, before stand clustering
const DENS_POW = 0.8; // below 1 keeps the mid and far field dense enough to read as a field, not stipple
const VERTEX_ROWS: number[][] = [
  [0, 0.18, 0.4, 0.62, 0.8, 0.9, 0.95],
  [0, 0.35, 0.7],
  [0, 0.55],
  [0],
];
const MAX_CELLS_PER_LEVEL = 512;

type Level = {
  cs: number; // cell size
  nc: number; // cells per side
  grid: number; // blades per cell side
  blades: number; // blades per cell
  maxDens: number; // blades per m^2 the level can supply
  geo: THREE.InstancedBufferGeometry;
  mesh: THREE.Mesh;
  hMin: Float32Array;
  hMax: Float32Array;
  allWater: Uint8Array;
  vegMax: Uint8Array;
  cells: number;
};

// ---- Season palettes (sRGB) ---------------------------------------------------------------------------------
// season 0 spring start, 1 summer, 2 autumn, 3 winter, wrapping at 4. Keys are placed at half seasons so early
// summer can be green, late summer golden and autumn russet. Each key holds base, mid, tip of the blade.
type PalKey = [number, number, number, number]; // season, base, mid, tip (sRGB hex)
// living grass: fresh spring green, blue-green summer tallgrass, olive late season, dull straw-green in winter
const GREEN_KEYS: PalKey[] = [
  [0.0, 0x2f5a1e, 0x6aa332, 0xa8d45a],
  [0.5, 0x2a5420, 0x5e9a38, 0x9cc860],
  [1.0, 0x234a2a, 0x4a8a4c, 0x88b87c],
  [1.5, 0x2a4a26, 0x587f40, 0x93b062],
  [2.0, 0x33452a, 0x66773a, 0x9aa05a],
  [2.5, 0x3a4528, 0x6d703a, 0x9c9a58],
  [3.0, 0x44482a, 0x74763e, 0x9c9a5c],
  [3.5, 0x44482a, 0x74763e, 0x9c9a5c],
  [4.0, 0x2f5a1e, 0x6aa332, 0xa8d45a],
];
// cured grass: thatch, early straw-gold, concept-art gold, amber, russet, pale winter straw
const DRY_KEYS: PalKey[] = [
  [0.0, 0x5a4a28, 0x8f7a4a, 0xbba46a],
  [0.5, 0x5e4c28, 0x97814a, 0xc2ab6e],
  [1.0, 0x5e4a20, 0xa08838, 0xcfb25a],
  [1.5, 0x6a4a1a, 0xbc8c34, 0xe6bc64],
  [1.9, 0x70501c, 0xc9923a, 0xf0c470],
  [2.3, 0x6a3c16, 0xb8742a, 0xe09a48],
  [2.7, 0x5a2c12, 0xa4562a, 0xd07e3c],
  [3.1, 0x80704a, 0xbfae7e, 0xdccfa2],
  [3.6, 0x80704a, 0xbfae7e, 0xdccfa2],
  [4.0, 0x5a4a28, 0x8f7a4a, 0xbba46a],
];
// how cured the grass is across the year: [season, cure]
const CURE_KEYS: [number, number][] = [
  [0, 0.03], [0.6, 0.06], [1.0, 0.12], [1.25, 0.24], [1.5, 0.6], [1.8, 0.92], [2.0, 1.0], [3.5, 1.0], [3.8, 0.5], [4.0, 0.03],
];
// fraction of tall blades carrying a seed head
const SEED_KEYS: [number, number][] = [
  [0, 0.0], [0.9, 0.0], [1.3, 0.04], [1.8, 0.12], [2.2, 0.18], [3.0, 0.14], [3.6, 0.04], [4.0, 0.0],
];

function smooth01(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function keyCurve(keys: [number, number][], s: number): number {
  const t = ((s % 4) + 4) % 4;
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i];
    const [b, vb] = keys[i + 1];
    if (t >= a && t <= b) {
      const f = (t - a) / (b - a);
      const e = f * f * (3 - 2 * f);
      return va + (vb - va) * e;
    }
  }
  return keys[keys.length - 1][1];
}

const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
function seasonColor(keys: PalKey[], season: number, slot: number, out: THREE.Color): void {
  const t = ((season % 4) + 4) % 4;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  const f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  const e = f * f * (3 - 2 * f);
  _c0.setHex(a[slot + 1]);
  _c1.setHex(b[slot + 1]);
  out.copy(_c0).lerp(_c1, e);
}

const _gt = new THREE.Color();
/**
 * Mid-tone color of the grass at a spot (linear working space), using the same season, moisture and upland logic
 * as the blade shader. Use it for the terrain under and beyond the blades so the ground matches them: ridges and
 * upper slopes (low moisture) come out drier and more russet. bio is 0..1 biomass (R of the veg texture).
 */
export function grassTint(season: number, moisture: number, bio: number, out: THREE.Color): THREE.Color {
  const cure = keyCurve(CURE_KEYS, season);
  const f = Math.max(0, Math.min(1, (bio - 0.06) / 0.36));
  const stub = 1 - f * f * (3 - 2 * f);
  const um = Math.max(0, Math.min(1, (moisture - 0.4) / 0.26));
  const up = 1 - um * um * (3 - 2 * um);
  const dry = Math.max(0, Math.min(1, cure + (0.55 - moisture) * 1.1 + stub * 0.55 + 0.3 * up));
  seasonColor(GREEN_KEYS, season, 1, out);
  seasonColor(DRY_KEYS, season, 1, _gt);
  out.lerp(_gt, dry);
  // ridge grass (little bluestem) turns russet
  out.r *= 1 + 0.08 * up * dry;
  out.g *= 1 - 0.07 * up * dry;
  out.b *= 1 - 0.16 * up * dry;
  return out;
}

// ---- Wind / patch noise texture ------------------------------------------------------------------------------
type NoiseLayers = [number, number][][];
// small tile: gust bands, flutter and blade-scale clumps (period of one tile is short, so never use it for large features)
const SMALL_LAYERS: NoiseLayers = [
  [[4, 0.5], [8, 0.3], [16, 0.2]],
  [[6, 0.5], [12, 0.3], [24, 0.2]],
  [[3, 0.6], [6, 0.3], [12, 0.1]],
  [[10, 0.5], [20, 0.3], [40, 0.2]],
];
// big tile: one period is the whole 512 m world, so patches, swaths and flower stands never visibly repeat
const BIG_LAYERS: NoiseLayers = [
  [[3, 0.55], [6, 0.3], [12, 0.15]],
  [[8, 0.5], [16, 0.3], [32, 0.2]],
  [[16, 0.5], [32, 0.3], [64, 0.2]],
  [[24, 0.5], [48, 0.3], [96, 0.2]],
];

function makeNoiseTexture(S: number, layers: NoiseLayers, seed0: number): THREE.DataTexture {
  const data = new Uint8Array(S * S * 4);
  let seed = seed0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const periodic = (L: number) => {
    const lat = new Float32Array(L * L);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    return (x: number, y: number) => {
      const fx = x * L, fy = y * L;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
      const x0 = ((ix % L) + L) % L, x1 = (x0 + 1) % L;
      const y0 = ((iy % L) + L) % L, y1 = (y0 + 1) % L;
      const a = lat[y0 * L + x0], b = lat[y0 * L + x1], c = lat[y1 * L + x0], d = lat[y1 * L + x1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
  };
  for (let ch = 0; ch < 4; ch++) {
    const octs = layers[ch].map(([L, w]) => ({ f: periodic(L), w }));
    const vals = new Float32Array(S * S);
    let sum = 0, sum2 = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let v = 0;
        for (const o of octs) v += o.w * o.f(x / S, y / S);
        vals[y * S + x] = v;
        sum += v;
        sum2 += v * v;
      }
    }
    // normalize so the channel spans the byte range: mean 0.5, plus or minus 2.2 standard deviations
    const mean = sum / (S * S);
    const sd = Math.sqrt(Math.max(1e-9, sum2 / (S * S) - mean * mean));
    for (let i = 0; i < S * S; i++) {
      const t = 0.5 + (vals[i] - mean) / (sd * 4.4);
      data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(t * 255)));
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---- Shaders -------------------------------------------------------------------------------------------------
const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>

uniform sampler2D uCells;
uniform sampler2D uHeightTex;
uniform sampler2D uVeg;
uniform sampler2D uStat0;
uniform sampler2D uStat1;
uniform sampler2D uWind;
uniform sampler2D uBig;
uniform vec4 uFlower;
uniform sampler2D uTgShadow;
uniform vec4 uWorld;   // size, n, cell, hn
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStr;
uniform vec3 uCam;
uniform float uCamDy;
uniform vec4 uRing;
uniform vec4 uDens;    // D0, halfDist, fadeStart, fadeEnd
uniform float uPixW;
uniform float uMaxH;
uniform float uBladeW;
uniform float uCure;
uniform float uSeedFrac;
uniform float uMoistK;
uniform float uWindGain;

varying vec2 vUv;
varying vec3 vN;
varying vec3 vNg;
varying vec3 vWP;
varying vec4 vP0;
varying vec4 vP1;
varying vec4 vP2;
varying float vTS;
varying vec4 vP3;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float u01(uint h) { return float(h) * (1.0 / 4294967296.0); }

float terrainH(vec2 p) {
  vec2 f = clamp(p / uWorld.z, vec2(0.0), vec2(uWorld.w - 1.001));
  ivec2 i = ivec2(f);
  vec2 t = f - vec2(i);
  float a = texelFetch(uHeightTex, i, 0).r;
  float b = texelFetch(uHeightTex, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeightTex, i + ivec2(0, 1), 0).r;
  float d = texelFetch(uHeightTex, i + ivec2(1, 1), 0).r;
  // same triangulation as the terrain mesh ((a, c, b) and (b, c, d)) so blades sit exactly on the drawn surface
  return (t.x + t.y <= 1.0) ? a + (b - a) * t.x + (c - a) * t.y
                            : d + (c - d) * (1.0 - t.x) + (b - d) * (1.0 - t.y);
}

vec4 vegAt(vec2 p) {
  float n = uWorld.y;
  vec2 f = p / uWorld.z - 0.5;
  vec2 fl = floor(f);
  vec2 t = f - fl;
  ivec2 i0 = ivec2(clamp(fl, vec2(0.0), vec2(n - 1.0)));
  ivec2 i1 = ivec2(clamp(fl + 1.0, vec2(0.0), vec2(n - 1.0)));
  vec4 a = texelFetch(uVeg, ivec2(i0.x, i0.y), 0);
  vec4 b = texelFetch(uVeg, ivec2(i1.x, i0.y), 0);
  vec4 c = texelFetch(uVeg, ivec2(i0.x, i1.y), 0);
  vec4 d = texelFetch(uVeg, ivec2(i1.x, i1.y), 0);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

void cullBlade() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vUv = vec2(0.0); vN = vec3(0.0, 1.0, 0.0); vNg = vec3(0.0, 1.0, 0.0); vWP = vec3(0.0);
  vP0 = vec4(0.0); vP1 = vec4(0.0); vP2 = vec4(0.0); vP3 = vec4(0.0); vTS = 1.0;
}

void main() {
  int slot = gl_InstanceID / NBLADE;
  int bi = gl_InstanceID - slot * NBLADE;
  vec4 cell = texelFetch(uCells, ivec2(slot, LEVEL), 0);
  uint cid = uint(cell.z + 0.5) * 1664525u + uint(LEVEL) * 1013904223u + 12345u;
  uint h1 = pcg(cid + uint(bi) * 2654435761u);
  uint h2 = pcg(h1 + 0x9E3779B9u);
  uint h3 = pcg(h2 + 0x85EBCA6Bu);
  uint h4 = pcg(h3 + 0xC2B2AE35u);
  uint h5 = pcg(h4 + 0x27D4EB2Fu);
  uint h6 = pcg(h5 + 0x165667B1u);
  vec2 jit = vec2(u01(h1), u01(h2));
  float rThin = u01(h3);

  int gx = bi % GRID;
  int gz = bi / GRID;
  vec2 p = cell.xy + (vec2(float(gx), float(gz)) + jit) * (CELLSZ / float(GRID));

  // shared distance metric (CPU uses the same one for ring and cell selection)
  float dh = length(p - uCam.xz);
  float dist = sqrt(dh * dh + uCamDy * uCamDy);
#if LEVEL == 0
  float ringLo = 0.0;
#else
  float ringLo = uRing[LEVEL - 1];
#endif
  float ringHi = uRing[LEVEL];
  float dens = uDens.x / pow(1.0 + (dist / uDens.y) * (dist / uDens.y), DENSPOW);
  dens *= 1.0 - smoothstep(uDens.z, uDens.w, dist);
  float keepD = dens / MAXDENS;
  if (dist < ringLo || dist >= ringHi || rThin >= keepD) { cullBlade(); return; }

  vec2 fuv = p / uWorld.x;
  vec4 veg = vegAt(p);
  vec4 st0 = texture(uStat0, fuv);
  vec4 st1 = texture(uStat1, fuv);

  // ---- organic structure. All of it comes from the big noise tile whose period is the whole world (nothing
  // repeats), through a domain warp and a slowly wandering flow angle, so there are no fixed rows or grids.
  vec2 pn = p * (1.0 / 512.0);
  float patch1 = texture(uBig, pn + 0.37).g;  // 16 to 64 m patches
  vec2 pw = p + (vec2(texture(uBig, pn + 0.11).r, texture(uBig, pn + 0.58).r) - 0.5) * 70.0;
  float flowAng = (texture(uBig, pw * (1.0 / 512.0) + 0.77).r - 0.5) * 4.4;
  vec2 wd = uWindDir;
  float windAng = atan(wd.y, wd.x);
  vec2 fd = vec2(cos(windAng + flowAng), sin(windAng + flowAng));
  vec2 pq = vec2(dot(pw, fd), dot(pw, vec2(-fd.y, fd.x)));
  float streak = texture(uBig, vec2(pq.x * 0.0025, pq.y * 0.0045) + 0.2).b;  // swaths about 2:1, 4 to 15 m wide
  float sFade = 1.0 - 0.72 * smoothstep(22.0, 95.0, dist);
  float swath = 0.5 + (streak - 0.5) * sFade;
  vec2 pt = vec2(pw.x * 0.8 + pw.y * 0.6, pw.y * 0.8 - pw.x * 0.6);
  float tus = texture(uWind, pt * (1.0 / 34.0) + 0.5).a;  // tussocks, 1 to 3 m
  float tusC = 0.5 + (tus - 0.5) * (1.0 - 0.6 * smoothstep(40.0, 120.0, dist));

  float bio = clamp(veg.r * (0.9 + 0.2 * texture(uBig, pn * 1.7 + 0.5).a), 0.0, 1.0);
  float burn = smoothstep(0.04, 0.55, veg.b);
  float bioEff = max(bio, burn * 0.12);
  float cover = st0.b;
  float water = st0.a;
  float moist = st1.r;
  // ridges and upper slopes: short, drier, russet, but still a continuous sward rather than sand
  float slopeM = length(st0.rg * 2.0 - 1.0);
  float ridge = max(1.0 - smoothstep(0.40, 0.66, moist), 0.8 * smoothstep(0.22, 0.5, slopeM));
  float pres = smoothstep(0.015, 0.14, bioEff) * (1.0 - 0.72 * cover) * (1.0 - smoothstep(0.3, 0.7, water)) * (1.0 - 0.5 * burn);
  pres *= mix(0.55, 1.0, smoothstep(0.28, 0.62, tusC)) * (1.0 - 0.18 * ridge);
  if (rThin >= keepD * pres) { cullBlade(); return; }

  float gy = terrainH(p);
  // hill shadow from the engine's horizon map (R = visibility), sampled once per blade at its root
  vTS = texture(uTgShadow, clamp(p / uWorld.x, vec2(0.0), vec2(1.0))).r;
  vec3 root = vec3(p.x, gy - 0.03, p.y);

  float rA = u01(h4), rB = u01(h5), rC = u01(h6);
  float rD = u01(pcg(h6 + 1u)), rE = u01(pcg(h6 + 2u)), rF = u01(pcg(h6 + 3u));

  // ---- wildflowers: a few percent of blades, in stands, by season (uFlower = coneflower, yarrow, goldenrod, amount)
  float fType = 0.0;
  float fTone = 0.8 + 0.4 * u01(pcg(h6 + 5u));
#if LEVEL < 3
  {
    float fAmt = uFlower.w * (1.0 - smoothstep(55.0, 115.0, dist)) * (1.0 - burn) * smoothstep(0.2, 0.5, bio);
    if (fAmt > 0.0) {
      float fPatch = texture(uBig, pn * 1.3 + 0.83).g;
      float fMask = 0.12 + 1.9 * smoothstep(0.52, 0.8, fPatch);
      float pF = FLOWERBASE * fAmt * fMask * (1.0 - 0.6 * ridge);
      if (u01(pcg(h6 + 4u)) < pF) {
        float tot = uFlower.x + uFlower.y + uFlower.z;
        float tsel = fract(texture(uBig, pn * 1.1 + 0.29).r * 3.1 + 0.3 * u01(pcg(h6 + 6u))) * tot;
        fType = tsel < uFlower.x ? 1.0 : (tsel < uFlower.x + uFlower.y ? 2.0 : 3.0);
      }
    }
  }
#endif

  // ---- size
  float hfrac = 0.07 + 0.93 * smoothstep(0.0, 0.85, bioEff);
  hfrac = max(hfrac, 0.3 * smoothstep(0.02, 0.16, bioEff));
  hfrac *= 1.0 - 0.32 * ridge;
  float H = uMaxH * hfrac * (0.70 + 0.55 * rA) * (0.88 + 0.24 * patch1) * (0.85 + 0.3 * tusC) * (1.0 - 0.38 * cover);
  H = mix(H, 0.05 + 0.07 * rA, burn);
  H *= 1.0 - 0.85 * smoothstep(uDens.w * 0.8, uDens.w, dist);
  float seedFlag = 0.0;
#if LEVEL == 0
  seedFlag = step(rB, uSeedFrac) * step(0.45, bio) * (1.0 - burn) * step(fType, 0.5);
#endif
  H *= 1.0 + 0.14 * seedFlag;
  if (fType > 0.5) H *= 1.08 + 0.22 * rD;
  float wScale = min(pow(max(1.0, uDens.x / max(dens, 1e-3)), 0.8), 36.0);
  float Wd = uBladeW * (0.75 + 0.5 * rC) * wScale;
  Wd = max(Wd, dist * uPixW);

  // ---- wind: advected anisotropic noise in the wind frame (the traveling gust bands)
  vec2 wp = vec2(dot(p, wd), dot(p, vec2(-wd.y, wd.x)));
  float g1 = texture(uWind, vec2(wp.x * 0.022 - uTime * 0.16, wp.y * 0.0075 + 0.37)).r;
  float g2 = texture(uWind, vec2(wp.x * 0.061 - uTime * 0.34, wp.y * 0.021 + 0.71)).g;
  float g0 = texture(uWind, vec2(wp.x * 0.0071 - uTime * 0.05, wp.y * 0.0031 + 0.13)).r;
  float gust = smoothstep(0.3, 0.7, 0.5 * g1 + 0.3 * g2 + 0.2 * g0);

  float ws = uWindStr * uWindGain;
  float wsc = clamp(ws, 0.0, 1.0);
  float stiff = 0.75 + 0.5 * rD;
  float restLean = (0.05 + 0.3 * rE * rE) * mix(1.0, 0.35, smoothstep(30.0, 100.0, dist));
  // resting lean follows the wandering flow angle, much more so when the air is calm
  float yaw = windAng + flowAng * 0.55 * (1.0 - 0.6 * wsc) + (rF - 0.5) * 3.14159265 * (2.0 - 1.5 * wsc);
  vec2 restDir = vec2(cos(yaw), sin(yaw));
  float phiWind = (0.2 + 0.75 * gust) * ws * 1.5 / stiff * (0.8 + 0.5 * swath);
  float fl = sin(uTime * (2.3 + 3.2 * rD) + rA * 6.2831853 + wp.x * 0.9);
  float fl2 = sin(uTime * (3.1 + 2.7 * rE) + rB * 6.2831853 + wp.y * 0.7);
  vec2 lean = restDir * restLean + wd * (phiWind + fl * (0.025 + 0.11 * gust) * ws)
            + vec2(-wd.y, wd.x) * fl2 * (0.02 + 0.05 * gust) * ws;
  if (fType > 0.5) lean *= 0.8;
  float phi = max(length(lean), 1e-4);
  vec2 dir = lean / phi;

  // ---- blade centerline: length preserving arc
  float vg = position.y;
  float v = vg;
#if LEVEL == 0
  // coneflower and yarrow: squeeze the top rows together so the head is a compact disc at the stem tip
  if (fType > 0.5 && fType < 2.5) v = vg <= 0.62 ? vg * 1.4435 : (vg <= 0.8 ? 0.895 + (vg - 0.62) * 0.1389 : 0.92 + (vg - 0.8) * 0.4);
#endif
  float side = position.x;
  float s = phi * v;
  float arcH = phi > 0.002 ? (1.0 - cos(s)) / phi : 0.5 * phi * v * v;
  float arcY = phi > 0.002 ? sin(s) / phi : v;
  vec3 centre = root + vec3(dir.x * arcH * H, arcY * H, dir.y * arcH * H);
  vec3 tang = normalize(vec3(dir.x * sin(s), cos(s), dir.y * sin(s)));
  vec3 Wf = vec3(-dir.y, 0.0, dir.x);

  float prof = pow(clamp((1.0 - vg) * 1.8, 0.0, 1.0), 0.75);
#if LEVEL == 0
  if (seedFlag > 0.5) prof = mix(0.3, 1.5, smoothstep(0.82, 0.9, vg)) * (1.0 - step(0.95, vg));
#endif
  float wv = Wd * prof;
  if (fType > 0.5) {
#if LEVEL == 0
    float headW = fType < 1.5 ? 0.1 : (fType < 2.5 ? 0.11 : 0.07);
    float hK = fType > 2.5 ? smoothstep(0.62, 0.8, vg) * (1.0 - 0.55 * smoothstep(0.85, 0.95, vg)) : step(0.79, vg);
    hK *= 1.0 - step(0.99, vg);
    wv = (0.0075 + headW * hK) * min(wScale, 3.0);
#else
    wv = Wd * prof * 1.5;
#endif
  }

  // edge-on blades: widen in screen space so they do not vanish
  vec2 vdir = normalize(root.xz - uCam.xz + vec2(1e-4));
  float facing = abs(dot(dir, vdir));
  float edgeOn = 1.0 - smoothstep(0.08, 0.7, facing);
  vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(1e-5));
  // flower heads turn to face the camera (flat quads would vanish edge-on)
  vec3 Wr = Wf;
  if (fType > 0.5) Wr = normalize(mix(Wf, camRight, 0.92 * smoothstep(0.55, 0.8, vg)));

  vec3 wp3 = centre + Wr * (side * 0.5 * wv) + camRight * (side * 0.5 * wv * 0.9 * edgeOn * (fType > 0.5 ? 0.0 : 1.0));

  vec3 Nb = normalize(cross(tang, Wr));
  Nb = normalize(Nb + Wr * (side * 0.4));

  vec3 Ng = normalize(vec3(-(st0.r * 2.0 - 1.0), 1.0, -(st0.g * 2.0 - 1.0)));

  float stub = 1.0 - smoothstep(0.06, 0.42, bio);
  float dry = uCure + (0.55 - moist) * uMoistK - st1.g * 0.28 + (patch1 - 0.5) * 0.3 + (rC - 0.5) * 0.22 + stub * 0.55 + 0.3 * ridge;

  vUv = vec2(side, vg);
  vN = Nb;
  vNg = Ng;
  vWP = wp3;
  vP0 = vec4(clamp(dry, 0.0, 1.0), rD, rE, seedFlag);
  vP1 = vec4(bio, gust, burn, stub);
  vP2 = vec4(rA, dist, swath, patch1);
  vP3 = vec4(fType, fTone, tusC, ridge);

  vec4 mvPosition = viewMatrix * vec4(wp3, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vec4 worldPosition = vec4(wp3 + vec3(0.0, 0.3, 0.0), 1.0);
  vec3 transformedNormal = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  #include <shadowmap_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTrans;
uniform float uSpec;
uniform float uGustLight;
uniform float uWindStr;
uniform float uAO;
uniform float uDebug;
uniform float uSat;
uniform float uBounce;
uniform vec3 uGreenB;
uniform vec3 uGreenM;
uniform vec3 uGreenT;
uniform vec3 uDryB;
uniform vec3 uDryM;
uniform vec3 uDryT;
uniform vec3 uSeedCol;
uniform vec3 uFlCone;
uniform vec3 uFlConeC;
uniform vec3 uFlYarrow;
uniform vec3 uFlGold;
uniform vec3 uAsh;
uniform vec3 uStubble;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;

varying vec2 vUv;
varying vec3 vN;
varying vec3 vNg;
varying vec3 vWP;
varying vec4 vP0;
varying vec4 vP1;
varying vec4 vP2;
varying float vTS;
varying vec4 vP3;

// Never let a zero-length or NaN input escape: every normalize in this shader goes through here.
vec3 sn(vec3 v) { return v * inversesqrt(max(dot(v, v), 1e-12)); }

vec3 grad3(vec3 b, vec3 m, vec3 t, float v) {
  return mix(mix(b, m, smoothstep(0.0, 0.5, v)), t, smoothstep(0.4, 1.0, v));
}

void main() {
  vec3 V = sn(cameraPosition - vWP);
  vec3 Nb = sn(vN);
  vec3 Nf = dot(Nb, V) >= 0.0 ? Nb : -Nb;
  vec3 Ng = sn(vNg);
  // MSAA interpolates at the pixel centre, which can sit outside a sliver of a blade: v and side leave their ranges
  // (pow of a negative number was the NaN that blacked out the whole HDR frame), so clamp them.
  float v = clamp(vUv.y, 0.0, 1.0);
  float sideX = clamp(vUv.x, -1.0, 1.0);
  float dry = vP0.x;
  float bright = vP0.y;
  float hue = vP0.z;
  float seed = vP0.w;
  float bio = vP1.x;
  float gust = vP1.y;
  float burn = vP1.z;
  float stub = vP1.w;

  // ---- albedo
  float fType = vP3.x;
  float tusC = vP3.z;
  float ridge = vP3.w;
  vec3 aGreen = grad3(uGreenB, uGreenM, uGreenT, v);
  vec3 aDry = grad3(uDryB, uDryM, uDryT, v);
  vec3 albedo = mix(aGreen, aDry, dry);
  albedo *= 0.8 + 0.4 * bright;
  // broad swaths (already faded out with distance), patches and tussocks: gentle, never a regular pattern
  albedo *= 1.0 + 0.55 * (vP2.z - 0.5);
  albedo *= 0.9 + 0.2 * vP2.w;
  albedo *= 0.9 + 0.2 * smoothstep(0.2, 0.8, tusC);
  // ridge grass reads russet and a little paler (little bluestem)
  albedo *= mix(vec3(1.0), vec3(1.07, 0.93, 0.8), ridge * dry * 0.75);
  albedo *= 1.0 + 0.1 * smoothstep(0.15, 0.0, abs(sideX)) - 0.12 * smoothstep(0.6, 1.0, abs(sideX));
  albedo *= vec3(1.0 + 0.14 * (hue - 0.5), 1.0, 1.0 - 0.3 * (hue - 0.5));
  albedo = mix(albedo, uStubble * (0.7 + 0.6 * bright), 0.85 * stub);
  // seed heads: pale green-straw while the grass is green, tan once it has cured
  float seedTip = seed * smoothstep(0.82, 0.9, v);
  vec3 seedC = mix(aGreen * 1.35 + vec3(0.02, 0.02, 0.0), uSeedCol * (0.8 + 0.4 * bright), smoothstep(0.25, 0.7, dry));
  albedo = mix(albedo, seedC, seedTip * 0.85);
  if (fType > 0.5) {
    float tone = vP3.y;
#if LEVEL == 0
    if (fType < 2.5) {
      // coneflower and yarrow heads: carve a round flower out of the head quad (rows .8 to .95)
      if (v < 0.79) {
        // the calyx funnel between stem and head: keep only a thin stem down the middle
        float wvm = 0.0075 + (fType < 1.5 ? 0.1 : 0.11) * clamp((v - 0.62) / 0.18, 0.0, 1.0);
        if (abs(sideX) * wvm * 0.5 > 0.0042) discard;
      } else {
        vec2 e = vec2(sideX, ((v - 0.8) / 0.15 - 0.5) * 2.0);
        float r = length(e);
        float a = atan(e.y, e.x);
        if (fType < 1.5) {
          if (r > 0.9 + 0.1 * cos(a * 9.0)) discard;
          float cone = 1.0 - smoothstep(0.3, 0.4, r);
          vec3 petal = mix(uFlCone * 0.8, uFlCone * 1.15, smoothstep(0.35, 0.9, r));
          albedo = mix(petal, uFlConeC * (0.8 + 0.5 * (e.y * -0.5 + 0.5)), cone) * tone;
        } else {
          if (r > 0.86 + 0.1 * sin(a * 7.0 + 1.3) + 0.06 * sin(a * 13.0)) discard;
          float dots = 0.94 + 0.06 * sin(e.x * 21.0 + e.y * 7.0) * sin(e.y * 19.0 - e.x * 5.0);
          albedo = mix(uFlYarrow, uFlYarrow * vec3(1.0, 0.96, 0.78), smoothstep(0.1, 0.0, r)) * dots * tone;
        }
      }
    } else if (v > 0.62) {
      // goldenrod: a narrow, lumpy plume
      float y = (v - 0.62) / 0.38;
      float hw = (0.25 + 0.75 * smoothstep(0.0, 0.25, y)) * (1.0 - smoothstep(0.5, 1.0, y)) * (0.78 + 0.22 * sin(y * 34.0 + sideX * 3.0));
      if (abs(sideX) > hw) discard;
      albedo = mix(uFlGold * 0.75, uFlGold * 1.1, smoothstep(0.0, 0.6, y)) * tone;
    }
#else
    albedo = mix(albedo, (fType < 1.5 ? uFlCone : (fType < 2.5 ? uFlYarrow : uFlGold)) * tone, smoothstep(0.3, 0.7, v));
#endif
  }
  albedo = mix(albedo, uAsh, burn);

  // ---- lighting
  vec3 L = sn(uSunDir);
  float shadow = getShadowMask() * clamp(vTS, 0.0, 1.0);
  // a slope turned away from the sun shades the blades standing on it (they are only a metre tall), which the
  // horizon map does not cover
  shadow *= smoothstep(-0.12, 0.12, dot(Ng, L));
  vec3 Nl = sn(mix(Nf, Ng, 0.4));
  float ndl = dot(Nl, L);
  float wrap = saturate(ndl * 0.8 + 0.2);
  vec3 diffuse = albedo * uSunColor * wrap * RECIPROCAL_PI * shadow;

  float canopyT = mix(0.35, 1.0, smoothstep(0.0, 0.8, vP2.x));
  float backFace = saturate(dot(-Nf, L));
  float fwd = pow(clamp(dot(-V, L), 0.0, 1.0), 3.0);
  float transK = pow(max(backFace, 0.0), 1.5) * (0.2 + 0.8 * fwd) * (0.12 + 0.88 * pow(max(v, 0.0), 1.3)) * (0.55 + 0.9 * max(bright, 0.0));
  vec3 trans = pow(max(albedo, vec3(0.0)), vec3(0.8)) * uSunColor * transK * uTrans * shadow * RECIPROCAL_PI;
  trans *= mix(1.0, canopyT, 0.8);

  vec3 Namb = sn(mix(Nf, vec3(0.0, 1.0, 0.0), 0.6));
  vec3 irr = ambientLightColor;
#if NUM_HEMI_LIGHTS > 0
  vec3 Nv = sn((viewMatrix * vec4(Namb, 0.0)).xyz);
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
    irr += getHemisphereLightIrradiance(hemisphereLights[i], Nv);
  }
  #pragma unroll_loop_end
#else
  irr += mix(uAmbGround, uAmbSky, 0.5 * Namb.y + 0.5);
#endif
  float aoDist = 1.0 - smoothstep(12.0, 75.0, vP2.y);
  float ao = mix(uAO, 1.0, smoothstep(0.0, 0.7, v));
  ao = mix(1.0, ao, (0.4 + 0.6 * bio) * aoDist);
  // shorter blades sit under taller ones: darker overall, which gives the field its light and dark structure
  float canopy = mix(1.0, mix(0.45, 1.0, smoothstep(0.0, 0.75, vP2.x)), 0.25 + 0.6 * aoDist);
  ao *= canopy;
  irr += uSunColor * uBounce * (0.5 + 0.5 * clamp(L.y, 0.0, 1.0));
  vec3 ambient = albedo * irr * RECIPROCAL_PI * ao;

  vec3 Hh = sn(L + V);
  vec3 Ns = sn(mix(Nf, Ng, 0.25));
  float nh = clamp(dot(Ns, Hh), 0.0, 1.0);
  float sp = pow(nh, 48.0) * 0.55 + pow(nh, 8.0) * 0.08;
  vec3 spec = uSunColor * sp * uSpec * smoothstep(0.3, 1.0, v) * shadow * RECIPROCAL_PI * 1.6 * (1.0 - smoothstep(15.0, 90.0, vP2.y));

  vec3 col = ambient + (diffuse + trans) * mix(1.0, ao, 0.75) + spec * canopy;
  col *= 1.0 + uGustLight * (gust - 0.4) * (0.35 + 0.65 * uWindStr);

  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSat);
  if (uDebug > 0.5) {
    if (uDebug < 1.5) col = albedo;
    else if (uDebug < 2.5) col = diffuse;
    else if (uDebug < 3.5) col = trans;
    else if (uDebug < 4.5) col = ambient;
    else if (uDebug < 5.5) col = spec;
    else if (uDebug < 6.5) col = vec3(shadow);
    else if (uDebug < 7.5) col = vec3(gust);
    else if (uDebug < 8.5) col = vec3(vP2.z);
    else if (uDebug > 9.5) col = vec3(seed, fType / 3.0, dry);
    else col = (LEVEL == 0 ? vec3(1.0, 0.1, 0.1) : LEVEL == 1 ? vec3(0.1, 1.0, 0.1) : LEVEL == 2 ? vec3(0.1, 0.3, 1.0) : vec3(1.0, 1.0, 0.1)) * (0.4 + 0.6 * v);
  }
  // belt and braces: the scene target is half float and bloom smears any NaN or Inf over the whole frame.
  // min/max drop a NaN operand on D3D, so this also scrubs NaN.
  col = min(max(col, vec3(0.0)), vec3(64.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// ---- GrassField ----------------------------------------------------------------------------------------------
export class GrassField {
  readonly object3D = new THREE.Group();
  readonly params: GrassParams = {
    lightScale: 1,
    translucency: 1.2,
    specular: 1,
    gustLight: 1.2,
    maxHeight: 1.05,
    bladeWidth: 0.014,
    windGain: 1,
    baseOcclusion: 0.22,
    bounce: 0.07,
    saturation: 1,
    debug: 0,
  };
  /** Frame stats for debugging: cells and instances submitted last frame, per level and total. */
  readonly stats = { cells: [0, 0, 0, 0], instances: 0, vertices: 0, expectedBlades: 0 };
  /** Fallback ambient light colors, used only when the scene has no hemisphere light. Updated in update(). */
  readonly ambientSky = new THREE.Color(0.6, 0.72, 0.95);
  readonly ambientGround = new THREE.Color(0.3, 0.24, 0.16);
  /** Viewport height in device pixels; used for the minimum blade width. Set from the renderer size. */
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight * (window.devicePixelRatio || 1) : 900;

  private world: World;
  private veg: THREE.DataTexture;
  private levels: Level[] = [];
  private uniforms: Record<string, THREE.IUniform>;
  private cellTex: THREE.DataTexture;
  private cellData: Float32Array;
  private heightTex: THREE.DataTexture;
  private stat0: THREE.DataTexture;
  private stat1: THREE.DataTexture;
  private noiseTex: THREE.DataTexture;
  private bigNoiseTex: THREE.DataTexture;
  private terrainShadowU: { value: THREE.Texture | null } | null = null;
  private whiteTex: THREE.DataTexture;
  private frameNo = 0;
  private vegVersion = -1;
  private lastVegRebuild = -1e9;
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private box = new THREE.Box3();
  private camPos = new THREE.Vector3();
  private d0: number;

  constructor(world: World, vegTexture: THREE.DataTexture, opts: GrassOptions = {}) {
    this.world = world;
    this.veg = vegTexture;
    const quality = opts.quality ?? 'high';
    this.d0 = quality === 'high' ? 300 : 150;

    this.heightTex = this.makeHeightTexture();
    [this.stat0, this.stat1] = this.makeStaticTextures();
    this.noiseTex = makeNoiseTexture(256, SMALL_LAYERS, 0x1234abcd);
    this.bigNoiseTex = makeNoiseTexture(512, BIG_LAYERS, 0x5eed1e55);
    this.whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.whiteTex.needsUpdate = true;
    this.terrainShadowU = opts.terrainShadow ?? null;
    this.cellData = new Float32Array(MAX_CELLS_PER_LEVEL * 4 * 4);
    this.cellTex = new THREE.DataTexture(this.cellData, MAX_CELLS_PER_LEVEL, 4, THREE.RGBAFormat, THREE.FloatType);
    this.cellTex.minFilter = this.cellTex.magFilter = THREE.NearestFilter;
    this.cellTex.generateMipmaps = false;
    this.cellTex.needsUpdate = true;

    const mine: Record<string, THREE.IUniform> = {
      uCells: { value: this.cellTex },
      uHeightTex: { value: this.heightTex },
      uVeg: { value: this.veg },
      uStat0: { value: this.stat0 },
      uStat1: { value: this.stat1 },
      uWind: { value: this.noiseTex },
      uBig: { value: this.bigNoiseTex },
      uFlower: { value: new THREE.Vector4(0, 0, 0, 0) },
      uTgShadow: { value: this.whiteTex },
      uWorld: { value: new THREE.Vector4(world.size, world.n, world.cell, world.hn) },
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(1, 0) },
      uWindStr: { value: 0.5 },
      uCam: { value: new THREE.Vector3() },
      uCamDy: { value: 2 },
      uRing: { value: new THREE.Vector4(...RING_EDGE) },
      uDens: { value: new THREE.Vector4(this.d0, HALF_DIST, FADE_START, FADE_END) },
      uPixW: { value: 0.0012 },
      uMaxH: { value: 1.05 },
      uBladeW: { value: 0.014 },
      uCure: { value: 0.5 },
      uSeedFrac: { value: 0.1 },
      uMoistK: { value: 1.1 },
      uWindGain: { value: 1 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.5).normalize() },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uTrans: { value: 1.2 },
      uSpec: { value: 1 },
      uGustLight: { value: 1.2 },
      uAO: { value: 0.22 },
      uDebug: { value: 0 },
      uSat: { value: 1 },
      uBounce: { value: 0.07 },
      uGreenB: { value: new THREE.Color() },
      uGreenM: { value: new THREE.Color() },
      uGreenT: { value: new THREE.Color() },
      uDryB: { value: new THREE.Color() },
      uDryM: { value: new THREE.Color() },
      uDryT: { value: new THREE.Color() },
      uSeedCol: { value: new THREE.Color(0xd9b46a) },
      uFlCone: { value: new THREE.Color(0xb8559a) },
      uFlConeC: { value: new THREE.Color(0x8a3d14) },
      uFlYarrow: { value: new THREE.Color(0xf0eadb) },
      uFlGold: { value: new THREE.Color(0xf0b81c) },
      uAsh: { value: new THREE.Color(0x0b0a09) },
      uStubble: { value: new THREE.Color(0x6a4e2c) },
      uAmbSky: { value: this.ambientSky },
      uAmbGround: { value: this.ambientGround },
    };
    this.uniforms = Object.assign({}, THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights]), mine);

    for (let l = 0; l < 4; l++) this.levels.push(this.makeLevel(l));
    this.rebuildStatics();
    this.object3D.name = 'GrassField';
  }

  // ---- construction helpers
  private makeHeightTexture(): THREE.DataTexture {
    const w = this.world;
    const tex = new THREE.DataTexture(new Float32Array(w.height), w.hn, w.hn, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  private makeStaticTextures(): [THREE.DataTexture, THREE.DataTexture] {
    const w = this.world;
    const n = w.n;
    const a = new Uint8Array(n * n * 4);
    const b = new Uint8Array(n * n * 4);
    const hn = w.hn;
    const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = j * n + i;
        const h00 = w.height[j * hn + i], h10 = w.height[j * hn + i + 1];
        const h01 = w.height[(j + 1) * hn + i], h11 = w.height[(j + 1) * hn + i + 1];
        const sx = (h10 + h11 - h00 - h01) / (2 * w.cell);
        const sz = (h01 + h11 - h00 - h10) / (2 * w.cell);
        a[c * 4 + 0] = clamp8((Math.max(-1, Math.min(1, sx)) * 0.5 + 0.5) * 255);
        a[c * 4 + 1] = clamp8((Math.max(-1, Math.min(1, sz)) * 0.5 + 0.5) * 255);
        a[c * 4 + 2] = clamp8(w.cover[c] * 255);
        a[c * 4 + 3] = w.water[c] ? 255 : 0;
        b[c * 4 + 0] = clamp8(w.moisture[c] * 255);
        b[c * 4 + 1] = clamp8(Math.exp(-w.waterDist[c] / 16) * 255);
        b[c * 4 + 2] = clamp8(w.soilBase[c] * 255);
        b[c * 4 + 3] = 255;
      }
    }
    const mk = (d: Uint8Array) => {
      const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    return [mk(a), mk(b)];
  }

  private makeLevel(l: number): Level {
    const w = this.world;
    const cs = CELL_SIZE[l];
    const nc = Math.round(w.size / cs);
    const innerD = l === 0 ? 0 : RING_EDGE[l - 1];
    const demand = this.d0 / (1 + (innerD / HALF_DIST) ** 2) ** DENS_POW;
    const grid = Math.ceil(Math.sqrt(demand * cs * cs));
    const blades = grid * grid;
    const maxDens = blades / (cs * cs);

    const rows = VERTEX_ROWS[l];
    const pos: number[] = [];
    for (const v of rows) pos.push(-1, v, 0, 1, v, 0);
    pos.push(0, 1, 0);
    const idx: number[] = [];
    for (let r = 0; r < rows.length - 1; r++) {
      const a = 2 * r, b = 2 * r + 1, c = 2 * r + 2, d = 2 * r + 3;
      idx.push(a, b, c, b, d, c);
    }
    const last = 2 * (rows.length - 1);
    idx.push(last, last + 1, 2 * rows.length);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    geo.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      fog: true,
      lights: true,
      defines: {
        LEVEL: l,
        GRID: grid,
        NBLADE: blades,
        CELLSZ: cs.toFixed(1),
        MAXDENS: maxDens.toFixed(3),
        DENSPOW: DENS_POW.toFixed(2),
        FLOWERBASE: FLOWER_BASE.toFixed(4),
        HAS_NORMAL: '',
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = 1 + l;
    mesh.visible = false;
    this.object3D.add(mesh);

    // static per-cell terrain ranges for frustum culling, and all-water flags
    const hMin = new Float32Array(nc * nc).fill(1e9);
    const hMax = new Float32Array(nc * nc).fill(-1e9);
    const allWater = new Uint8Array(nc * nc);
    const hn = w.hn;
    for (let cz = 0; cz < nc; cz++) {
      for (let cx = 0; cx < nc; cx++) {
        const i0 = Math.floor((cx * cs) / w.cell), i1 = Math.min(hn - 1, Math.ceil(((cx + 1) * cs) / w.cell));
        const j0 = Math.floor((cz * cs) / w.cell), j1 = Math.min(hn - 1, Math.ceil(((cz + 1) * cs) / w.cell));
        let mn = 1e9, mx = -1e9;
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const h = w.height[j * hn + i];
            if (h < mn) mn = h;
            if (h > mx) mx = h;
          }
        }
        hMin[cz * nc + cx] = mn;
        hMax[cz * nc + cx] = mx;
        let wet = 1;
        const vi0 = Math.floor((cx * cs) / w.cell), vi1 = Math.min(w.n - 1, Math.ceil(((cx + 1) * cs) / w.cell) - 1);
        const vj0 = Math.floor((cz * cs) / w.cell), vj1 = Math.min(w.n - 1, Math.ceil(((cz + 1) * cs) / w.cell) - 1);
        for (let j = vj0; j <= vj1 && wet; j++) for (let i = vi0; i <= vi1; i++) if (!w.water[j * w.n + i]) { wet = 0; break; }
        allWater[cz * nc + cx] = wet;
      }
    }
    return { cs, nc, grid, blades, maxDens, geo, mesh, hMin, hMax, allWater, vegMax: new Uint8Array(nc * nc).fill(255), cells: 0 };
  }

  /** Per-level max of (biomass, burn) over the vegetation cells a grass cell touches. Cheap to redo. */
  private rebuildVegMax(): void {
    const data = this.veg.image?.data as ArrayLike<number> | undefined;
    const w = this.world;
    const n = w.n;
    if (!data || data.length < n * n * 4) {
      for (const L of this.levels) L.vegMax.fill(255);
      return;
    }
    const m = new Uint8Array(n * n);
    for (let c = 0; c < n * n; c++) {
      const r = data[c * 4], b = data[c * 4 + 2];
      m[c] = Math.max(r, b >> 1);
    }
    for (const L of this.levels) {
      const per = Math.max(1, Math.round(L.cs / w.cell));
      for (let cz = 0; cz < L.nc; cz++) {
        for (let cx = 0; cx < L.nc; cx++) {
          const i0 = Math.max(0, cx * per - 1), i1 = Math.min(n - 1, (cx + 1) * per);
          const j0 = Math.max(0, cz * per - 1), j1 = Math.min(n - 1, (cz + 1) * per);
          let mx = 0;
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (m[j * n + i] > mx) mx = m[j * n + i];
          L.vegMax[cz * L.nc + cx] = mx;
        }
      }
    }
  }

  private rebuildStatics(): void {
    this.rebuildVegMax();
    this.vegVersion = this.veg.version;
  }

  private groundAt(x: number, z: number): number {
    const w = this.world;
    let fx = x / w.cell, fy = z / w.cell;
    const max = w.hn - 1.001;
    fx = fx < 0 ? 0 : fx > max ? max : fx;
    fy = fy < 0 ? 0 : fy > max ? max : fy;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const hn = w.hn, h = w.height;
    const a = h[j * hn + i], b = h[j * hn + i + 1], c = h[(j + 1) * hn + i], d = h[(j + 1) * hn + i + 1];
    return tx + ty <= 1 ? a + (b - a) * tx + (c - a) * ty : d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
  }

  // ---- per frame
  update(camera: THREE.Camera, timeSec: number, env: EnvState, sun: GrassSun): void {
    const u = this.uniforms;
    const P = this.params;
    // the engine refreshes the vegetation texture a few times per second; rebuild the cell culling data at most 4x/s
    if (this.veg.version !== this.vegVersion && timeSec - this.lastVegRebuild > 0.25) {
      this.rebuildStatics();
      this.lastVegRebuild = timeSec;
    }

    camera.updateMatrixWorld();
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    const cam = this.camPos;
    const ground = this.groundAt(cam.x, cam.z);
    const camDy = Math.max(0, cam.y - ground);

    // palettes and season-driven scalars
    seasonColor(GREEN_KEYS, env.season, 0, u.uGreenB.value);
    seasonColor(GREEN_KEYS, env.season, 1, u.uGreenM.value);
    seasonColor(GREEN_KEYS, env.season, 2, u.uGreenT.value);
    seasonColor(DRY_KEYS, env.season, 0, u.uDryB.value);
    seasonColor(DRY_KEYS, env.season, 1, u.uDryM.value);
    seasonColor(DRY_KEYS, env.season, 2, u.uDryT.value);
    u.uCure.value = keyCurve(CURE_KEYS, env.season);
    u.uSeedFrac.value = keyCurve(SEED_KEYS, env.season);
    {
      const sn = ((env.season % 4) + 4) % 4;
      const bump = (a: number, b: number, c: number) => (sn <= a || sn >= c ? 0 : sn < b ? smooth01((sn - a) / (b - a)) : smooth01((c - sn) / (c - b)));
      const cone = bump(0.55, 1.1, 1.75), yarrow = bump(0.45, 1.0, 1.65), gold = bump(1.35, 1.9, 2.7);
      const fv = u.uFlower.value as THREE.Vector4;
      fv.set(cone, yarrow, gold, Math.min(1, Math.max(cone, yarrow, gold)));
    }

    // hill shadows: use the engine's horizon map when it exists, plain white (no shadow) otherwise
    if (!this.terrainShadowU && (this.frameNo++ & 31) === 0) this.terrainShadowU = this.findTerrainShadow();
    u.uTgShadow.value = this.terrainShadowU?.value ?? this.whiteTex;

    u.uTime.value = timeSec;
    u.uWindDir.value.set(Math.cos(env.windDir), Math.sin(env.windDir));
    u.uWindStr.value = env.windStrength;
    u.uWindGain.value = P.windGain;
    u.uCam.value.copy(cam);
    u.uCamDy.value = camDy;
    u.uMaxH.value = P.maxHeight;
    u.uBladeW.value = P.bladeWidth;
    u.uTrans.value = P.translucency;
    u.uSpec.value = P.specular;
    u.uGustLight.value = P.gustLight;
    u.uAO.value = 1 - P.baseOcclusion;
    u.uDebug.value = P.debug;
    u.uSat.value = P.saturation;
    u.uBounce.value = P.bounce;

    u.uSunDir.value.copy(sun.dir).normalize();
    u.uSunColor.value.copy(sun.color).multiplyScalar(P.lightScale);

    // fallback ambient from sun elevation (only used if the scene has no hemisphere light)
    const el = Math.max(-0.2, Math.min(1, sun.dir.y));
    const day = Math.max(0, Math.min(1, (el + 0.05) / 0.35));
    const golden = Math.max(0, 1 - Math.abs(el - 0.12) / 0.25);
    this.ambientSky.setRGB(0.18 + 0.5 * day + 0.25 * golden, 0.22 + 0.55 * day + 0.12 * golden, 0.4 + 0.65 * day - 0.1 * golden);
    this.ambientGround.setRGB(0.1 + 0.25 * day, 0.08 + 0.2 * day, 0.05 + 0.12 * day);

    // minimum pixel width (about 1.3 px)
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const fov = (camera as THREE.PerspectiveCamera).fov;
      u.uPixW.value = (1.3 * 2 * Math.tan((fov * Math.PI) / 360)) / Math.max(1, this.viewportHeight);
    }

    // frustum
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);

    let inst = 0, verts = 0, expected = 0;
    for (let l = 0; l < 4; l++) {
      const L = this.levels[l];
      const n = this.selectCells(l, cam, camDy);
      L.cells = n;
      this.stats.cells[l] = n;
      const count = n * L.blades;
      L.geo.instanceCount = count;
      L.mesh.visible = n > 0;
      inst += count;
      verts += count * (VERTEX_ROWS[l].length * 2 + 1);
    }
    // expected kept blades if the whole ring were visible (rough, for debugging)
    expected = inst;
    this.stats.instances = inst;
    this.stats.vertices = verts;
    this.stats.expectedBlades = expected;
    this.cellTex.needsUpdate = true;
  }

  /** Share the horizon-shadow uniform with the rest of the scene (the water material holds the same object). */
  private findTerrainShadow(): { value: THREE.Texture | null } | null {
    let root: THREE.Object3D = this.object3D;
    while (root.parent) root = root.parent;
    let found: { value: THREE.Texture | null } | null = null;
    root.traverse((o) => {
      if (found) return;
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      const t = m && !Array.isArray(m) ? m.uniforms?.tShadow : undefined;
      if (t && t.value && (t.value as THREE.Texture).name === 'terrain.shadow') found = t as { value: THREE.Texture | null };
    });
    return found;
  }

  /** Point the field at the engine's terrain shadow uniform explicitly (engine.uniforms.terrainShadow). */
  setTerrainShadow(u: { value: THREE.Texture | null } | null): void {
    this.terrainShadowU = u;
  }

  private selectCells(l: number, cam: THREE.Vector3, camDy: number): number {
    const L = this.levels[l];
    const cs = L.cs, nc = L.nc;
    const lo = l === 0 ? 0 : RING_EDGE[l - 1];
    const hi = RING_EDGE[l];
    const dy2 = camDy * camDy;
    // horizontal reach of the ring
    const reach = Math.sqrt(Math.max(0, hi * hi - dy2)) + cs;
    const cx0 = Math.max(0, Math.floor((cam.x - reach) / cs)), cx1 = Math.min(nc - 1, Math.floor((cam.x + reach) / cs));
    const cz0 = Math.max(0, Math.floor((cam.z - reach) / cs)), cz1 = Math.min(nc - 1, Math.floor((cam.z + reach) / cs));
    const data = this.cellData;
    const rowBase = l * MAX_CELLS_PER_LEVEL * 4;
    let count = 0;
    const box = this.box;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const ci = cz * nc + cx;
        if (L.allWater[ci]) continue;
        if (L.vegMax[ci] < 4) continue;
        const x0 = cx * cs, z0 = cz * cs;
        const dxN = Math.max(x0 - cam.x, 0, cam.x - (x0 + cs));
        const dzN = Math.max(z0 - cam.z, 0, cam.z - (z0 + cs));
        const dxF = Math.max(Math.abs(x0 - cam.x), Math.abs(x0 + cs - cam.x));
        const dzF = Math.max(Math.abs(z0 - cam.z), Math.abs(z0 + cs - cam.z));
        const dMin2 = dxN * dxN + dzN * dzN + dy2;
        const dMax2 = dxF * dxF + dzF * dzF + dy2;
        if (dMin2 >= hi * hi || dMax2 < lo * lo) continue;
        box.min.set(x0 - 1.4, L.hMin[ci] - 0.3, z0 - 1.4);
        box.max.set(x0 + cs + 1.4, L.hMax[ci] + 1.9, z0 + cs + 1.4);
        if (!this.frustum.intersectsBox(box)) continue;
        if (count >= MAX_CELLS_PER_LEVEL) break;
        const o = rowBase + count * 4;
        data[o] = x0;
        data[o + 1] = z0;
        data[o + 2] = cz * 256 + cx;
        data[o + 3] = 0;
        count++;
      }
    }
    return count;
  }

  dispose(): void {
    for (const L of this.levels) {
      L.geo.dispose();
      (L.mesh.material as THREE.Material).dispose();
    }
    this.heightTex.dispose();
    this.stat0.dispose();
    this.stat1.dispose();
    this.noiseTex.dispose();
    this.bigNoiseTex.dispose();
    this.cellTex.dispose();
    this.whiteTex.dispose();
  }
}
