// Storm visuals (V2-PLAN R4). The sim (S6) sends up to four cells and every lightning strike since the last post; this module
// turns them into: cumulonimbus masses (instanced soft billboards, dark bases, lit tops, an anvil on strong cells), rain shafts
// (two translucent open cylinders per cell), forked lightning bolts with restrikes, a scene flash, an ember flare where a strike
// starts a fire, gust bands for the grass, a rainbow after the rain, and the numbers the sky, the ground shade and the grade pass
// read (StormUniforms). The fire's smoke column is the existing smoke.ts, which starts by itself from the burning cells.
//
// Coordinates: sim (x, y) metres -> three (x, height, y). Cells are eased between snapshots; a cell that is not matched in a
// new snapshot fades out. Cells with kind 1 (the blizzard look) are ignored here: the snow pass owns that.
import * as THREE from 'three';
import { HEIGHT_GLSL, NOISE_GLSL, SKY_GLSL, clamp, fbm2, smoothstep, type SharedUniforms, type U } from './common';
import { STORM_STRIDE, STRIKE_STRIDE } from '../sim/storms';
import type { World } from '../sim/world';

const MAX_CELLS = 4;
/** Cloud base above the ground under a cell, and the tower's height at full strength (m). */
const BASE_H = 75;
const TOWER_H = 230;
const MAX_PUFFS = MAX_CELLS * 76;
const MAX_BOLTS = 4;
const SEG_CAP = 96;
const MAX_EMBERS = 8;
const SPEED_OF_SOUND = 343;

// ------------------------------------------------------------------ shared uniforms

/**
 * Grass gust bands: up to four cells as (x, z, radius m, strength 0..1), packed to the front (the first unused slot has w = 0).
 * grass.ts reads this singleton in its blade vertex shader through STORM_GUST_GLSL, so it needs no plumbing.
 */
export const stormGustUniform: U<THREE.Vector4[]> = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)) };

/** GLSL for the blade shader: `tgStormWind(p, wd)` is 0..1 under a cell and in its outflow ahead of it (p world xz, wd unit wind direction). */
export const STORM_GUST_GLSL = /* glsl */ `
uniform vec4 uStorm[4];
float tgStormWind(vec2 p, vec2 wd) {
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 c = uStorm[i];
    if (c.w <= 0.001) break;
    vec2 d = p - c.xy;
    if (dot(d, d) > 9.0 * c.z * c.z) continue;   // beyond three radii there is nothing to add
    float along = dot(d, wd);
    float across = dot(d, vec2(-wd.y, wd.x));
    float under = 1.0 - smoothstep(0.5 * c.z, 1.35 * c.z, length(d));
    float ahead = exp(-pow(across / (1.15 * c.z), 2.0)) * smoothstep(-0.1 * c.z, 0.7 * c.z, along) * (1.0 - smoothstep(0.9 * c.z, 2.8 * c.z, along));
    s = max(s, max(under, 0.85 * ahead) * c.w);
  }
  return s;
}
`;

/**
 * Sky gloom, shared by the dome and the distance haze so the horizon meets the terrain: needs uStormSkyA / uStormSkyB.
 * tgStormGloom(d) is 0..1 toward the cells; tgStormTint darkens and cools a colour by it.
 */
export const STORM_SKY_GLSL = /* glsl */ `
uniform vec4 uStormSkyA[4];
uniform vec4 uStormSkyB[4];
float tgStormGloom(vec3 d) {
  float sd = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 a = uStormSkyA[i];
    if (a.w <= 0.001) break;
    vec4 b = uStormSkyB[i];
    sd = max(sd, a.w * smoothstep(b.x, b.y, dot(d, a.xyz)));
  }
  return sd;
}
vec3 tgStormTint(vec3 col, float sd) {
  vec3 gloom = vec3(dot(col, vec3(0.3333))) * vec3(0.3, 0.36, 0.47);
  return mix(col, gloom, sd * 0.93);
}
`;

/** What the sky dome, the fog pass (ground shade) and the grade pass (flash) read. The Storms object owns and fills them. */
export interface StormUniforms {
  /** 1 while any cell is visible: the passes skip their storm code otherwise. */
  on: U<number>;
  /** Ground shade discs, packed to the front: x, z, radius m, strength 0..1 (fog pass). */
  shade: U<THREE.Vector4[]>;
  /** Sky gloom toward each cell: (unit direction from the camera, weight) and (cos outer, cos inner, 0, 0). */
  skyA: U<THREE.Vector4[]>;
  skyB: U<THREE.Vector4[]>;
  /** 0..1 rainbow strength (sky dome). */
  rainbow: U<number>;
  /** 0..1 scene flash (grade pass), and the same with the direction of the strike for the dome (xyz, amount). */
  flash: U<number>;
  flashSky: U<THREE.Vector4>;
}

export function createStormUniforms(): StormUniforms {
  const arr = () => ({ value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, 0)) });
  return {
    on: { value: 0 }, shade: arr(), skyA: arr(), skyB: arr(), rainbow: { value: 0 }, flash: { value: 0 },
    flashSky: { value: new THREE.Vector4(0, 1, 0, 0) },
  };
}

// ------------------------------------------------------------------ helpers

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Four 128 px puff silhouettes in a 2 x 2 atlas: R density (lumpy, ragged edge), G and B the baked view-space normal xy. */
function makePuffTexture(): THREE.DataTexture {
  const T = 128, N = T * 2;
  const data = new Uint8Array(N * N * 4);
  const rng = mulberry32(0xC10D5);
  const dens = new Float32Array(T * T);
  for (let tile = 0; tile < 4; tile++) {
    const blobs: Array<{ x: number; y: number; r: number }> = [];
    for (let b = 0; b < 7; b++) blobs.push({ x: (rng() - 0.5) * 0.95, y: (rng() - 0.5) * 0.7 + 0.1, r: 0.3 + 0.3 * rng() });
    for (let j = 0; j < T; j++) {
      for (let i = 0; i < T; i++) {
        const u = ((i + 0.5) / T) * 2 - 1, v = ((j + 0.5) / T) * 2 - 1;
        let d = 0;
        for (const b of blobs) {
          const q = Math.hypot(u - b.x, v - b.y) / b.r;
          d = Math.max(d, Math.sqrt(Math.max(0, 1 - q * q)));
        }
        const n = fbm2(u * 3.4 + tile * 7.3, v * 3.4 - tile * 3.1, 5, 11 + tile);
        const n2 = fbm2(u * 9 + tile * 2.7, v * 9 + tile * 5.9, 3, 31 + tile);
        d = d * (0.3 + 1.15 * n) - 0.12 + 0.18 * (n2 - 0.5);
        const edge = 1 - smoothstep(0.7, 1.0, Math.hypot(u, v));
        dens[j * T + i] = smoothstep(0.0, 0.75, d) * edge;
      }
    }
    const tx = (tile % 2) * T, ty = (tile >> 1) * T;
    for (let j = 0; j < T; j++) {
      for (let i = 0; i < T; i++) {
        const u = ((i + 0.5) / T) * 2 - 1, v = ((j + 0.5) / T) * 2 - 1;
        const at = (a: number, b: number) => dens[clamp(b, 0, T - 1) * T + clamp(a, 0, T - 1)];
        const gx = (at(i + 2, j) - at(i - 2, j)) * 0.25, gy = (at(i, j + 2) - at(i, j - 2)) * 0.25;
        let nx = u * 0.62 - gx * 5, ny = v * 0.62 - gy * 5;
        const l = Math.hypot(nx, ny);
        if (l > 1) { nx /= l; ny /= l; }
        const o = ((ty + j) * N + tx + i) * 4;
        data[o] = Math.round(dens[j * T + i] * 255);
        data[o + 1] = Math.round((nx * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round((ny * 0.5 + 0.5) * 255);
        data[o + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'storm.puffs';
  return tex;
}

interface Puff {
  /** Across and along (in cell radii, along = downwind). */
  ox: number; oz: number;
  /** Height as a fraction of the tower (0 base .. 1 top). */
  oy: number;
  /** Billboard width as a fraction of the cloud diameter, and height / width. */
  size: number; squash: number;
  /** Lit-top factor 0 dark base .. 1 bright top. */
  hf: number;
  tile: number; flip: number;
  /** 0 base deck, 1 tower, 2 anvil. */
  kind: number;
}

function makePuffs(seed: number): Puff[] {
  const rng = mulberry32(seed);
  const out: Puff[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.95;
    out.push({ ox: Math.cos(a) * r, oz: Math.sin(a) * r, oy: rng() * 0.06, size: 0.42 + 0.3 * rng(), squash: 0.5, hf: rng() * 0.1, tile: (rng() * 4) | 0, flip: rng() < 0.5 ? 1 : 0, kind: 0 });
  }
  for (let i = 0; i < 44; i++) {
    const f = 0.06 + 0.94 * Math.pow(rng(), 0.85);
    const a = rng() * Math.PI * 2, r = (0.74 - 0.42 * f) * (0.3 + 0.7 * Math.sqrt(rng()));
    out.push({
      ox: Math.cos(a) * r, oz: Math.sin(a) * r, oy: f, size: (0.56 - 0.26 * f) * (0.7 + 0.6 * rng()), squash: 0.82 + 0.15 * rng(),
      hf: clamp(f * (0.6 + 0.4 * rng()) + 0.05, 0, 1), tile: (rng() * 4) | 0, flip: rng() < 0.5 ? 1 : 0, kind: 1,
    });
  }
  for (let i = 0; i < 14; i++) {
    const along = -0.15 + 2.1 * Math.pow(rng(), 0.8), across = (rng() - 0.5) * (0.9 + 0.5 * along);
    out.push({
      ox: across, oz: along, oy: 0.98 + (rng() - 0.5) * 0.06, size: 0.5 + 0.3 * rng() + 0.1 * along, squash: 0.26 + 0.08 * rng(),
      hf: 0.82 + 0.18 * rng(), tile: (rng() * 4) | 0, flip: rng() < 0.5 ? 1 : 0, kind: 2,
    });
  }
  return out;
}

type V3 = [number, number, number];

/** Midpoint displacement: the jagged line from a to b (both ends fixed). */
function jagged(rng: () => number, a: V3, b: V3, levels: number, amp: number): V3[] {
  let pts: V3[] = [a, b];
  for (let l = 0; l < levels; l++) {
    const next: V3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const o = len * amp;
      next.push(p, [(p[0] + q[0]) / 2 + (rng() - 0.5) * 2 * o, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + (rng() - 0.5) * 2 * o]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

// ------------------------------------------------------------------ the module

interface VCell {
  x: number; z: number; r: number; I: number;
  tx: number; tz: number; tr: number; tI: number;
  fade: number; alive: boolean; matched: boolean;
  baseY: number;
  puffs: Puff[];
  serial: number;
}

interface Pulse { t0: number; amp: number; dur: number }

interface Bolt {
  geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  active: boolean;
  t: number;
  main: number;
  pulses: Pulse[];
  total: number;
  /** Distance factor for the scene flash and the strike's place for the sky flash. */
  distAmp: number;
  x: number; y: number; z: number;
}

/** A ground glow at a strike: kind 0 an ember (orange, seconds, where a fire started), kind 1 the impact flash (white-blue, a few tenths). */
interface Ember { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; active: boolean; kind: number; amp: number }

export interface StormFrameEnv { windDir: number }

export class Storms {
  /** Everything drawable; the engine adds it to the scene. Hidden while there is nothing to show. */
  readonly group = new THREE.Group();
  /** Every mesh, for the ambient-occlusion exclude list. */
  readonly meshes: THREE.Mesh[] = [];
  readonly uniforms: StormUniforms = createStormUniforms();
  /**
   * Called once per strike with the distance in metres from the camera to the strike and the delay in seconds before the
   * thunder should be heard (distance / 343 at 1x, 0 at 10x and above). x, y are the strike's sim position.
   */
  onThunder: ((distance: number, delay: number, x: number, y: number, ignited: boolean) => void) | null = null;
  /** Called once per strike: sim position and whether it started a fire. */
  onStrike: ((x: number, y: number, ignited: boolean) => void) | null = null;
  /** 0..1 scene flash right now (hemisphere light boost reads this). */
  flash = 0;
  /** Sim speed multiplier of the latest snapshot (1 at 1x; the thunder delay and the flash scale follow it). */
  simSpeed = 1;
  /** Any cell visible right now. */
  get active(): boolean { return this.cells.length > 0; }
  get cellCount(): number { return this.cells.length; }

  private cells: VCell[] = [];
  private serial = 0;
  private time = 0;
  private lastFlashAt = -10;
  private strikeSeed = 1;

  // clouds
  private cloudGeo: THREE.InstancedBufferGeometry;
  private cloudMat: THREE.ShaderMaterial;
  private cloudMesh: THREE.Mesh;
  private aPos: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;
  private puffTex: THREE.DataTexture;
  private px = new Float32Array(MAX_PUFFS * 3);
  private pw = new Float32Array(MAX_PUFFS * 2);
  private pd = new Float32Array(MAX_PUFFS * 4);
  private pkey = new Float32Array(MAX_PUFFS);
  private pidx: number[] = [];
  private psort = (a: number, b: number) => this.pkey[b] - this.pkey[a];

  // rain shafts: two cylinders per cell slot
  private shafts: Array<{ mesh: THREE.Mesh; mat: THREE.ShaderMaterial; layer: number }> = [];

  private bolts: Bolt[] = [];
  private embers: Ember[] = [];
  private boltUniform = { value: new THREE.Vector4(0, -1000, 0, 0) };

  // rainbow
  private shaftAbove = 1;
  private bowCharge = 0;
  private bowNow = 0;
  private lastWeather = 0;

  constructor(world: Pick<World, 'cell' | 'hn'>, private shared: SharedUniforms, private heightAt: (x: number, z: number) => number) {
    this.group.name = 'storms';
    this.group.visible = false;
    this.puffTex = makePuffTexture();

    // ---- clouds
    const quad = new THREE.PlaneGeometry(1, 1);
    this.cloudGeo = new THREE.InstancedBufferGeometry();
    this.cloudGeo.index = quad.index;
    this.cloudGeo.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.cloudGeo.setAttribute('aPos', this.aPos);
    this.cloudGeo.setAttribute('aSize', this.aSize);
    this.cloudGeo.setAttribute('aData', this.aData);
    this.cloudGeo.instanceCount = 0;
    this.cloudGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        tPuff: { value: this.puffTex },
        uSunDir: shared.sunDir,
        uSkyZenith: shared.skyZenith, uSkyMid: shared.skyMid, uSkyHorizon: shared.skyHorizon, uSunGlow: shared.sunGlow,
        uSunDiskColor: shared.sunDiskColor,
        uLightColor: shared.lightColor,
        uBolt: this.boltUniform,
        uNight: shared.night,
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPos;
        attribute vec2 aSize;
        attribute vec4 aData; // hf, tile, alpha, flip
        varying vec2 vTex;
        varying vec4 vD;
        varying vec3 vWorld;
        varying float vFlip;
        void main() {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float sg = aData.w > 0.5 ? -1.0 : 1.0;
          vec3 wp = aPos + right * position.x * aSize.x + up * position.y * aSize.y;
          float tile = aData.y;
          vec2 tc = vec2(mod(tile, 2.0), floor(tile / 2.0));
          vTex = (tc + vec2(0.5 + position.x * sg, 0.5 + position.y)) * 0.5;
          float dc = distance(aPos, cameraPosition);
          vD = vec4(aData.x, 0.0, aData.z * smoothstep(0.25 * aSize.x, 1.0 * aSize.x, dc), 0.0);
          vWorld = wp;
          vFlip = sg;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vTex;
        varying vec4 vD;
        varying vec3 vWorld;
        varying float vFlip;
        uniform sampler2D tPuff;
        uniform vec3 uSunDiskColor;
        uniform vec3 uLightColor;
        uniform vec4 uBolt;
        uniform float uNight;
        ${SKY_GLSL}
        void main() {
          vec4 t = texture2D(tPuff, vTex);
          float alpha = t.r * vD.z;
          if (alpha < 0.008) discard;
          vec3 n = vec3((t.g * 2.0 - 1.0) * vFlip, t.b * 2.0 - 1.0, 0.0);
          n.z = sqrt(max(1.0 - dot(n.xy, n.xy), 0.06));
          vec3 Lv = normalize(mat3(viewMatrix) * uSunDir);
          float lit = clamp(dot(n, Lv) * 0.5 + 0.5, 0.0, 1.0);
          float hf = vD.x;
          float sunUp = smoothstep(-0.08, 0.3, uSunDir.y);
          // tops catch the sun even under a stormy sky; bases are slate
          vec3 topCol = (uSunDiskColor * 0.5 + uSkyHorizon * 0.7 + vec3(0.16)) * (0.3 + 0.7 * sunUp);
          vec3 baseCol = (uSkyMid * 0.55 + vec3(0.012, 0.018, 0.026)) * 0.27;
          float k = clamp(pow(hf, 1.25) * 1.15 + (lit - 0.5) * 0.42, 0.0, 1.0);
          k = k * k * (3.0 - 2.0 * k);
          vec3 col = mix(baseCol, topCol, k);
          col += uSunGlow * pow(lit, 3.0) * 0.22 * hf * sunUp;
          col *= 0.78 + 0.34 * t.r;
          // thin edges pass light: lighter and a touch warmer than the dense core
          col = mix(col, topCol * 0.55 + baseCol, (1.0 - t.r) * 0.24 * (0.3 + 0.7 * sunUp) * (0.35 + 0.65 * hf));
          // lightning lights the cloud from inside: strongest near the bolt, and on the dark underside
          vec3 tb = vWorld - uBolt.xyz;
          float glow = uBolt.w / (1.0 + dot(tb, tb) / 14000.0);
          col += vec3(0.5, 0.6, 1.0) * glow * (1.5 + 2.0 * (1.0 - hf));
          gl_FragColor = vec4(min(col, vec3(32.0)), alpha);
        }`,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
    this.cloudMesh = new THREE.Mesh(this.cloudGeo, this.cloudMat);
    this.cloudMesh.name = 'storm-clouds';
    this.cloudMesh.frustumCulled = false;
    this.cloudMesh.renderOrder = 4;
    this.group.add(this.cloudMesh);
    this.meshes.push(this.cloudMesh);

    // ---- rain shafts
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 36, 1, true);
    for (let k = 0; k < MAX_CELLS; k++) {
      for (let layer = 0; layer < 2; layer++) {
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uSkyMid: shared.skyMid, uSkyHorizon: shared.skyHorizon, uTime: shared.time,
            uI: { value: 0 }, uSeed: { value: k * 13.7 + layer * 5.1 }, uLayer: { value: layer }, uBolt: this.boltUniform,
            uWind: shared.wind, uLightColor: shared.lightColor,
            tHeight: shared.heightTex, uCell: { value: world.cell }, uHN: { value: world.hn },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying vec3 vWorld;
            varying vec3 vNw;
            void main() {
              vUv = uv;
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorld = wp.xyz;
              vNw = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
          fragmentShader: /* glsl */ `
            precision highp float;
            varying vec2 vUv;
            varying vec3 vWorld;
            varying vec3 vNw;
            uniform vec3 uSkyMid;
            uniform vec3 uSkyHorizon;
            uniform vec3 uLightColor;
            uniform vec3 uWind;
            uniform float uTime;
            uniform float uI;
            uniform float uSeed;
            uniform float uLayer;
            uniform vec4 uBolt;
            ${NOISE_GLSL}
            ${HEIGHT_GLSL}
            void main() {
              float dist = distance(vWorld, cameraPosition);
              // the screen rain streaks take over close in
              float camFade = smoothstep(22.0, 95.0, dist);
              float u = vUv.x, v = vUv.y;
              float slant = (1.0 - v) * 0.012 * (1.0 + uLayer);
              // broad shafts: noise around the ring that drifts slowly and varies with height
              float shafts = tgNoise2(vec2((u + slant) * (9.0 + 7.0 * uLayer) + uSeed, v * 1.6 - uTime * 0.04 + uSeed));
              float shafts2 = tgNoise2(vec2((u + slant) * (23.0 + 11.0 * uLayer) - uSeed * 2.0, v * 3.0 + uTime * 0.07));
              float clump = smoothstep(0.36, 0.66, 0.62 * shafts + 0.38 * shafts2);
              // fine falling streaks, only where they can resolve
              float fineFade = 1.0 - smoothstep(140.0, 420.0, dist);
              vec2 q = vec2(u * (520.0 + 160.0 * uLayer), vWorld.y * 0.05 + uTime * 2.6 + uSeed);
              vec2 id = floor(q);
              float h = tgHash21(id + uSeed);
              float line = smoothstep(0.5, 0.12, abs(fract(q.x) - 0.5));
              float streak = smoothstep(0.35, 0.95, h) * line;
              float detail = mix(0.85, 0.45 + 0.9 * streak, fineFade);
              float topFade = mix(0.55, 1.0, v);
              float edge = smoothstep(0.0, 0.06, v);
              // a column is densest through its middle: fade toward the silhouette, and thin the foot into ground mist
              float facing = smoothstep(0.0, 0.8, abs(dot(normalize(vNw), normalize(cameraPosition - vWorld))));
              float foot = smoothstep(0.0, 30.0, vWorld.y - tgHeightAt(vWorld.xz));
              float a = clump * detail * topFade * edge * facing * foot * uI * camFade * (0.62 + 0.2 * uLayer);
              if (a < 0.004) discard;
              vec3 col = mix(uSkyMid, uSkyHorizon, 0.4) * 0.6 + uLightColor * 0.01 + vec3(0.008, 0.012, 0.018);
              vec3 tb = vWorld - uBolt.xyz;
              col += vec3(0.5, 0.6, 1.0) * uBolt.w / (1.0 + dot(tb, tb) / 20000.0) * 1.2;
              gl_FragColor = vec4(min(col, vec3(32.0)), a);
            }`,
          transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
        });
        const mesh = new THREE.Mesh(cyl, mat);
        mesh.name = 'storm-shaft';
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        mesh.visible = false;
        this.group.add(mesh);
        this.meshes.push(mesh);
        this.shafts.push({ mesh, mat, layer });
      }
    }

    // ---- lightning bolts
    const idx: number[] = [];
    for (let s = 0; s < SEG_CAP; s++) { const b = s * 4; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
    for (let k = 0; k < MAX_BOLTS; k++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG_CAP * 4 * 3), 3));
      geo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(SEG_CAP * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(SEG_CAP * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const corner = new Float32Array(SEG_CAP * 4 * 2);
      for (let s = 0; s < SEG_CAP; s++) corner.set([0, -1, 0, 1, 1, -1, 1, 1], s * 8);
      geo.setAttribute('aC', new THREE.BufferAttribute(corner, 2));
      geo.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(SEG_CAP * 4), 1).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(idx);
      geo.setDrawRange(0, 0);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uInt: { value: 0 }, uTopY: { value: 1000 } },
        vertexShader: /* glsl */ `
          attribute vec3 aA;
          attribute vec3 aB;
          attribute vec2 aC;
          attribute float aW;
          uniform float uTopY;
          varying float vSide;
          varying float vTop;
          void main() {
            vec3 p = mix(aA, aB, aC.x);
            vec3 dir = normalize(aB - aA + vec3(1e-5));
            vec3 toCam = cameraPosition - p;
            float dist = length(toCam);
            vec3 side = normalize(cross(dir, toCam / max(dist, 1e-3)) + vec3(1e-6));
            float w = aW + dist * 0.0013;
            p += side * aC.y * w * 3.4;
            vSide = aC.y;
            // the upper end is inside the cloud: fade it
            vTop = smoothstep(uTopY, uTopY - 55.0, p.y);
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying float vSide;
          varying float vTop;
          uniform float uInt;
          void main() {
            float s = abs(vSide) * 3.4;
            float core = exp(-s * s * 1.6);
            float halo = exp(-s * s * 0.28) * 0.1;
            vec3 col = vec3(1.0, 0.97, 0.94) * core * 14.0 + vec3(0.55, 0.68, 1.0) * (core * 3.0 + halo * 5.0);
            gl_FragColor = vec4(col * uInt * vTop, 1.0);
          }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'storm-bolt';
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.visible = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.bolts.push({ geo, mesh, mat, active: false, t: 0, main: 0.15, pulses: [], total: 0.5, distAmp: 1, x: 0, y: 0, z: 0 });
    }

    // ---- ember flares where a strike starts a fire
    const pq = new THREE.PlaneGeometry(1, 1);
    for (let k = 0; k < MAX_EMBERS; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uPos: { value: new THREE.Vector3() }, uInt: { value: 0 }, uSize: { value: 9 }, uColor: { value: new THREE.Color(1.7, 0.62, 0.14) } },
        vertexShader: /* glsl */ `
          uniform vec3 uPos;
          uniform float uSize;
          varying vec2 vUv;
          void main() {
            vUv = position.xy * 2.0;
            vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            vec3 wp = uPos + (right * position.x + up * position.y) * uSize;
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform float uInt;
          uniform vec3 uColor;
          void main() {
            float r2 = dot(vUv, vUv);
            float g = (exp(-r2 * 7.0) + 0.25 * exp(-r2 * 1.6)) * (1.0 - smoothstep(0.5, 1.0, sqrt(r2)));
            gl_FragColor = vec4(uColor * g * uInt, 1.0);
          }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
      });
      const mesh = new THREE.Mesh(pq, mat);
      mesh.name = 'storm-ember';
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.visible = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.embers.push({ mesh, mat, t: 0, active: false, kind: 0, amp: 1 });
    }
  }

  // ------------------------------------------------------------ snapshot in

  /**
   * Feed the latest snapshot's storms and strikes (either may be undefined: undefined leaves things as they are, an empty
   * array means "no cells"). `speed` is the sim speed multiplier of that snapshot (<= 0 paused or skipping: ignored).
   */
  setSnapshot(storms: Float32Array | undefined, strikes: Float32Array | undefined, speed = 1): void {
    if (speed > 0) this.simSpeed = speed;
    if (storms) {
      for (const c of this.cells) c.matched = false;
      const n = Math.floor(storms.length / STORM_STRIDE);
      for (let k = 0; k < n; k++) {
        const o = k * STORM_STRIDE;
        if (storms[o + 4] >= 0.5) continue; // blizzard look: the snow pass owns it
        const x = storms[o], z = storms[o + 1], r = storms[o + 2], I = storms[o + 3];
        let best: VCell | null = null, bd = 250;
        for (const c of this.cells) {
          if (c.matched || !c.alive) continue;
          const d = Math.hypot(c.tx - x, c.tz - z);
          if (d < bd) { bd = d; best = c; }
        }
        if (best) {
          best.tx = x; best.tz = z; best.tr = r; best.tI = I; best.matched = true;
        } else if (this.cells.length < MAX_CELLS + 2) {
          this.cells.push({
            x, z, r, I, tx: x, tz: z, tr: r, tI: I, fade: 0, alive: true, matched: true, baseY: this.heightAt(x, z) + BASE_H,
            puffs: makePuffs(0x5701 + this.serial * 7919), serial: this.serial++,
          });
        }
      }
      for (const c of this.cells) if (!c.matched) c.alive = false;
    }
    if (strikes) {
      const n = Math.floor(strikes.length / STRIKE_STRIDE);
      // at very high speed a post can carry dozens: show a few, the rest still count in the sim
      const from = Math.max(0, n - 3);
      for (let k = from; k < n; k++) {
        const o = k * STRIKE_STRIDE;
        this.addStrike(strikes[o], strikes[o + 1], strikes[o + 3] > 0.5);
      }
    }
  }

  /** Debug and tests: replace the cells with these (sim metres), shown at once. */
  debugCells(list: Array<{ x: number; y: number; r?: number; I?: number }>): void {
    const arr = new Float32Array(list.length * STORM_STRIDE);
    list.forEach((c, k) => arr.set([c.x, c.y, c.r ?? 90, c.I ?? 0.9, 0, 100], k * STORM_STRIDE));
    this.cells.length = 0;
    this.setSnapshot(arr, undefined);
    for (const c of this.cells) { c.fade = 1; c.x = c.tx; c.z = c.tz; c.r = c.tr; c.I = c.tI; c.baseY = this.heightAt(c.x, c.z) + BASE_H; }
  }

  /** Debug and tests: a strike at sim (x, y). */
  debugStrike(x: number, y: number, ignited = false): void { this.addStrike(x, y, ignited); }

  // ------------------------------------------------------------ strikes

  private addStrike(sx: number, sy: number, ignited: boolean): void {
    const gy = this.heightAt(sx, sy);
    // a free bolt slot, else the oldest
    let b = this.bolts.find((q) => !q.active);
    if (!b) { b = this.bolts.reduce((a, q) => (q.t > a.t ? q : a)); }
    // the cloud base above the strike: the nearest cell's, else a default
    let top = gy + BASE_H, bd = 1e9;
    for (const c of this.cells) {
      const d = Math.hypot(c.x - sx, c.z - sy);
      if (d < bd) { bd = d; top = c.baseY; }
    }
    const rng = mulberry32((this.strikeSeed++ * 2654435761) >>> 0);
    const start: V3 = [sx + (rng() - 0.5) * 30, top + 18, sy + (rng() - 0.5) * 30];
    const end: V3 = [sx, gy, sy];
    const main = jagged(rng, start, end, 5, 0.26);
    const pos: number[] = [];
    const wid: number[] = [];
    const push = (a: V3, c: V3, w: number) => { pos.push(a[0], a[1], a[2], c[0], c[1], c[2]); wid.push(w); };
    for (let i = 0; i < main.length - 1; i++) push(main[i], main[i + 1], 0.55);
    const nb = 3 + ((rng() * 4) | 0);
    for (let k = 0; k < nb; k++) {
      const i0 = 3 + ((rng() * (main.length - 12)) | 0);
      const p = main[i0];
      const ang = rng() * Math.PI * 2;
      const ld = Math.max(10, (p[1] - gy) * (0.25 + 0.3 * rng()));
      const lh = ld * (0.4 + 0.5 * rng());
      const e: V3 = [p[0] + Math.cos(ang) * lh, p[1] - ld, p[2] + Math.sin(ang) * lh];
      if (e[1] < gy) e[1] = gy;
      const br = jagged(rng, p, e, 3, 0.3);
      for (let i = 0; i < br.length - 1; i++) push(br[i], br[i + 1], 0.26);
    }
    const nSeg = Math.min(SEG_CAP, pos.length / 6);
    const A = b.geo.getAttribute('aA') as THREE.BufferAttribute, B = b.geo.getAttribute('aB') as THREE.BufferAttribute;
    const W = b.geo.getAttribute('aW') as THREE.BufferAttribute;
    for (let s = 0; s < nSeg; s++) {
      for (let v = 0; v < 4; v++) {
        const o = (s * 4 + v) * 3;
        A.array[o] = pos[s * 6]; A.array[o + 1] = pos[s * 6 + 1]; A.array[o + 2] = pos[s * 6 + 2];
        B.array[o] = pos[s * 6 + 3]; B.array[o + 1] = pos[s * 6 + 4]; B.array[o + 2] = pos[s * 6 + 5];
        W.array[s * 4 + v] = wid[s];
      }
    }
    A.needsUpdate = B.needsUpdate = W.needsUpdate = true;
    b.geo.setDrawRange(0, nSeg * 6);
    b.mat.uniforms.uTopY.value = top + 25;
    // timeline: the main stroke 0.12 to 0.2 s, then one or two restrikes
    const mainDur = 0.12 + 0.08 * rng();
    const pulses: Pulse[] = [{ t0: 0, amp: 1, dur: mainDur }];
    const nr = 1 + (rng() < 0.45 ? 1 : 0);
    let t = mainDur * (0.5 + 0.3 * rng()) + 0.05;
    for (let r = 0; r < nr; r++) {
      const dur = 0.05 + 0.04 * rng();
      pulses.push({ t0: t, amp: 0.6 + 0.35 * rng(), dur });
      t += dur + 0.04 + 0.05 * rng();
    }
    b.pulses = pulses;
    b.main = mainDur;
    b.total = t + 0.05;
    b.t = 0;
    b.active = true;
    b.mesh.visible = true;
    b.x = sx; b.y = gy + (top - gy) * 0.45; b.z = sy;

    // distance to the camera drives the flash and the thunder
    // (the camera is read in update(); here only the amplitude and the callback need it, so they use the last known position)
    const cp = this.camPos;
    const dist = Math.hypot(cp.x - sx, cp.y - gy, cp.z - sy);
    b.distAmp = 0.3 + 0.7 / (1 + (dist / 260) * (dist / 260));
    const fast = this.simSpeed >= 10;
    const delay = fast ? 0 : dist / SPEED_OF_SOUND;
    this.onThunder?.(dist, delay, sx, sy, ignited);
    this.onStrike?.(sx, sy, ignited);
    // a second flash right after another is softer, and fast-forward flashes are softer still
    const since = this.time - this.lastFlashAt;
    b.distAmp *= (since < 0.3 ? 0.4 : 1) * (this.simSpeed >= 30 ? 0.5 : this.simSpeed >= 10 ? 0.75 : 1);
    this.lastFlashAt = this.time;
    this.startFlare(sx, gy, sy, 1, b.distAmp);
    if (ignited) this.startFlare(sx, gy, sy, 0, 1);
  }

  private camPos = new THREE.Vector3(256, 100, 256);

  private startFlare(x: number, gy: number, z: number, kind: number, amp: number): void {
    const e = this.embers.find((q) => !q.active) ?? this.embers[0];
    e.mat.uniforms.uPos.value.set(x, gy + (kind === 0 ? 1.2 : 2.5), z);
    const col = e.mat.uniforms.uColor.value as THREE.Color;
    if (kind === 0) col.setRGB(1.7, 0.62, 0.14); else col.setRGB(0.8, 0.9, 1.4);
    e.kind = kind; e.amp = amp;
    e.t = 0;
    e.active = true;
    e.mesh.visible = true;
  }

  // ------------------------------------------------------------ per frame

  /** Advance the visuals and write every uniform. Call once per frame, before the sky and post read them. */
  update(dt: number, camera: THREE.Camera, env: StormFrameEnv): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.camPos.copy(camera.position);
    const u = this.uniforms;
    const wdx = Math.cos(env.windDir), wdz = Math.sin(env.windDir);

    // cells: ease toward the snapshot, fade in and out
    const kPos = 1 - Math.exp(-dt / 0.14);
    for (const c of this.cells) {
      c.x += (c.tx - c.x) * kPos; c.z += (c.tz - c.z) * kPos;
      c.r += (c.tr - c.r) * kPos; c.I += (c.tI - c.I) * kPos;
      const by = this.heightAt(c.x, c.z) + BASE_H;
      c.baseY += (by - c.baseY) * kPos;
      c.fade = clamp(c.fade + (c.alive ? dt : -dt) / 1.6, 0, 1);
    }
    for (let k = this.cells.length - 1; k >= 0; k--) if (!this.cells[k].alive && this.cells[k].fade <= 0) this.cells.splice(k, 1);

    const any = this.cells.length > 0;
    this.group.visible = any || this.bolts.some((b) => b.active) || this.embers.some((e) => e.active);
    u.on.value = any ? 1 : 0;

    // strongest cells first: the gust, shade and sky slots hold the nearest few
    const order = this.cells.slice().sort((a, b) => Math.hypot(a.x - camera.position.x, a.z - camera.position.z) - Math.hypot(b.x - camera.position.x, b.z - camera.position.z));
    const sunY = this.shared.sunDir.value.y;
    const dayK = 0.25 + 0.75 * smoothstep(-6 * Math.PI / 180, 14 * Math.PI / 180, Math.asin(clamp(sunY, -1, 1)));
    const sdir = this.shared.lightDir.value;
    for (let k = 0; k < MAX_CELLS; k++) {
      const c = order[k];
      const g = stormGustUniform.value[k], sh = u.shade.value[k], sa = u.skyA.value[k], sb = u.skyB.value[k];
      if (!c) { g.w = 0; sh.w = 0; sa.w = 0; continue; }
      const R = this.cloudRadius(c);
      const vis = c.fade * smoothstep(0.02, 0.22, c.I);
      g.set(c.x, c.z, R, vis * clamp(c.I * 1.2, 0, 1));
      // the cell's shadow falls away from the light, shifted by up to most of a radius; under cloud it is mostly gloom
      let ox = 0, oz = 0;
      if (sdir.y > 0.05) { ox = -(sdir.x / sdir.y) * BASE_H; oz = -(sdir.z / sdir.y) * BASE_H; }
      const ol = Math.hypot(ox, oz);
      if (ol > 0.8 * R) { ox *= 0.8 * R / ol; oz *= 0.8 * R / ol; }
      sh.set(c.x + ox, c.z + oz, R * 1.15, vis * clamp(c.I * 1.1, 0, 1) * 0.6 * dayK);
      // sky gloom: toward the cloud's middle from the camera
      const cx = c.x - camera.position.x, cy = c.baseY + 0.4 * TOWER_H * (0.55 + 0.45 * clamp(c.I / 0.9, 0, 1)) - camera.position.y, cz = c.z - camera.position.z;
      const dist = Math.hypot(cx, cy, cz) || 1;
      const ang = clamp(Math.atan((R * 1.7) / dist), 0.14, 1.2);
      sa.set(cx / dist, cy / dist, cz / dist, vis * clamp(c.I * 1.3, 0, 1) * 0.85);
      sb.set(Math.cos(Math.min(ang * 2.7, 1.5)), Math.cos(ang * 0.35), 0, 0);
    }
    // keep sorted active slots at the front: slots past the last cell have w = 0 (already set above)

    this.shaftAbove = 1 - 0.7 * smoothstep(230, 430, camera.position.y - this.heightAt(camera.position.x, camera.position.z));
    if (any) {
      this.writeClouds(camera, wdx, wdz);
      this.writeShafts();
    } else {
      this.cloudGeo.instanceCount = 0;
      for (const s of this.shafts) s.mesh.visible = false;
    }

    // bolts and the scene flash
    let flash = 0, bx = 0, by = 0, bz = 0, bw = 0;
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += dt;
      if (b.t >= b.total) { b.active = false; b.mesh.visible = false; continue; }
      let v = 0;
      const t = b.t;
      for (let i = 0; i < b.pulses.length; i++) {
        const p = b.pulses[i];
        const d = t - p.t0;
        if (d < 0) continue;
        if (d < p.dur) {
          const flick = 0.78 + 0.22 * Math.sin(t * 190 + i * 2.1);
          v = Math.max(v, p.amp * (d < 0.01 ? d / 0.01 : 1) * (1 - 0.4 * d / p.dur) * flick);
        } else if (d < p.dur + 0.035) v = Math.max(v, p.amp * 0.5 * (1 - (d - p.dur) / 0.035));
        // the scene flash is short: a few frames
        flash += p.amp * Math.exp(-d / 0.03) * (d < 0.006 ? d / 0.006 : 1) * b.distAmp;
      }
      b.mat.uniforms.uInt.value = v;
      if (flash > bw) { bw = flash; bx = b.x; by = b.y; bz = b.z; }
    }
    this.flash = clamp(flash, 0, 1);
    u.flash.value = this.flash;
    this.boltUniform.value.set(bx, by, bz, this.flash);
    if (this.flash > 0.002) {
      const dx = bx - camera.position.x, dy = by - camera.position.y, dz = bz - camera.position.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      u.flashSky.value.set(dx / dl, dy / dl, dz / dl, this.flash);
    } else u.flashSky.value.w = 0;

    for (const e of this.embers) {
      if (!e.active) continue;
      e.t += dt;
      if (e.kind === 1) {
        // the impact flash: a hard white bloom on the ground that is gone in a few tenths
        if (e.t > 0.5) { e.active = false; e.mesh.visible = false; continue; }
        e.mat.uniforms.uInt.value = (e.t < 0.015 ? e.t / 0.015 : 1) * Math.exp(-e.t / 0.09) * 3.2 * e.amp;
        e.mat.uniforms.uSize.value = 16 + 26 * smoothstep(0, 0.25, e.t);
        continue;
      }
      if (e.t > 7) { e.active = false; e.mesh.visible = false; continue; }
      const fl = 0.8 + 0.2 * Math.sin(e.t * 23 + e.t * e.t * 3);
      e.mat.uniforms.uInt.value = smoothstep(0.0, 0.06, e.t) * Math.exp(-e.t / 2.4) * fl * 1.3;
      e.mat.uniforms.uSize.value = 7 + 5 * smoothstep(0, 0.4, e.t);
    }
  }

  /** The cloud's radius (m) for a cell: wider than the strike disc, and swelling with its strength. */
  private cloudRadius(c: VCell): number {
    return c.r * 1.45 * (0.55 + 0.45 * clamp(c.I / 0.8, 0, 1));
  }

  private writeClouds(camera: THREE.Camera, wdx: number, wdz: number): void {
    const cp = camera.position;
    let n = 0;
    // seen from the map view the cloud thins to a ghost, so the valley under it stays readable
    const above = 1 - 0.9 * smoothstep(230, 430, cp.y - this.heightAt(cp.x, cp.z));
    for (const c of this.cells) {
      const vis = c.fade * smoothstep(0.02, 0.22, c.I) * above;
      if (vis < 0.004) continue;
      const R = this.cloudRadius(c);
      const grow = 0.55 + 0.45 * clamp(c.I / 0.9, 0, 1);
      const Ht = TOWER_H * grow;
      const anvil = smoothstep(0.42, 0.78, c.I);
      // from the map view only every other puff is drawn (a ghost needs little overdraw)
      const thin = above < 0.5;
      for (let pi = 0; pi < c.puffs.length; pi++) {
        const p = c.puffs[pi];
        if (n >= MAX_PUFFS) break;
        if (thin && (pi & 1) === 1) continue;
        let a = vis * (thin ? 1.1 : 0.92);
        if (p.kind === 2) { a *= anvil; if (a < 0.01) continue; }
        const along = p.oz * R, across = p.ox * R;
        const x = c.x + wdx * along - wdz * across;
        const z = c.z + wdz * along + wdx * across;
        const y = c.baseY + p.oy * Ht + (p.kind === 0 ? 4 : 0);
        const w = p.size * R * 2 * (p.kind === 2 ? 0.85 + 0.15 * anvil : 1);
        this.px[n * 3] = x; this.px[n * 3 + 1] = y; this.px[n * 3 + 2] = z;
        this.pw[n * 2] = w; this.pw[n * 2 + 1] = w * p.squash;
        this.pd[n * 4] = p.hf; this.pd[n * 4 + 1] = p.tile; this.pd[n * 4 + 2] = a; this.pd[n * 4 + 3] = p.flip;
        const dx = x - cp.x, dy = y - cp.y, dz = z - cp.z;
        this.pkey[n] = dx * dx + dy * dy + dz * dz;
        n++;
      }
    }
    // back to front
    const idx = this.pidx;
    idx.length = n;
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort(this.psort);
    const pa = this.aPos.array as Float32Array, ps = this.aSize.array as Float32Array, pdA = this.aData.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      pa[k * 3] = this.px[i * 3]; pa[k * 3 + 1] = this.px[i * 3 + 1]; pa[k * 3 + 2] = this.px[i * 3 + 2];
      ps[k * 2] = this.pw[i * 2]; ps[k * 2 + 1] = this.pw[i * 2 + 1];
      pdA[k * 4] = this.pd[i * 4]; pdA[k * 4 + 1] = this.pd[i * 4 + 1]; pdA[k * 4 + 2] = this.pd[i * 4 + 2]; pdA[k * 4 + 3] = this.pd[i * 4 + 3];
    }
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aData.needsUpdate = true;
    this.cloudGeo.instanceCount = n;
    this.cloudMesh.visible = n > 0;
  }

  private writeShafts(): void {
    for (let k = 0; k < MAX_CELLS; k++) {
      const c = this.cells[k];
      for (let layer = 0; layer < 2; layer++) {
        const s = this.shafts[k * 2 + layer];
        if (!c) { s.mesh.visible = false; continue; }
        const vis = c.fade * smoothstep(0.1, 0.4, c.I) * this.shaftAbove;
        if (vis < 0.01) { s.mesh.visible = false; continue; }
        const R = this.cloudRadius(c);
        const rad = R * (layer === 0 ? 0.42 : 0.74);
        // reach the lowest ground under the shaft, so its foot is never in the air
        let low = this.heightAt(c.x, c.z);
        for (let q = 0; q < 4; q++) low = Math.min(low, this.heightAt(c.x + Math.cos(q * 1.571) * rad, c.z + Math.sin(q * 1.571) * rad));
        const bottom = low - 8, top = c.baseY + 14;
        s.mesh.position.set(c.x, (top + bottom) / 2, c.z);
        s.mesh.scale.set(rad, top - bottom, rad);
        s.mat.uniforms.uI.value = vis * (0.55 + 0.45 * clamp(c.I, 0, 1));
        s.mesh.visible = true;
      }
    }
  }

  // ------------------------------------------------------------ the rainbow

  /**
   * Called by the engine each frame after the rain is eased. `rainVisible` is the engine's eased 0..1 rain; `simTicks` the sim time
   * since the last frame. The bow charges while it rains hard, then shows as the rain clears and fades with the last of it.
   */
  updateRainbow(rainVisible: number, simTicks: number, weather: number): void {
    this.lastWeather = weather;
    if (rainVisible > 0.7) this.bowCharge = 1;
    else this.bowCharge = Math.max(0, this.bowCharge - simTicks / 900);
    const clearing = 1 - smoothstep(0.12, 0.62, rainVisible);
    // not while it snows, and not in the thick of it
    const target = weather === 4 ? 0 : this.bowCharge * clearing;
    this.bowNow += (target - this.bowNow) * (simTicks > 400 ? 1 : 1 - Math.exp(-Math.max(simTicks, 0.05) / 25));
    if (target === 0 && this.bowNow < 0.004) this.bowNow = 0;
    this.uniforms.rainbow.value = this.bowNow;
  }

  dispose(): void {
    this.cloudGeo.dispose(); this.cloudMat.dispose(); this.puffTex.dispose();
    for (const s of this.shafts) s.mat.dispose();
    this.shafts[0]?.mesh.geometry.dispose();
    for (const b of this.bolts) { b.geo.dispose(); b.mat.dispose(); }
    for (const e of this.embers) e.mat.dispose();
    this.embers[0]?.mesh.geometry.dispose();
  }
}

