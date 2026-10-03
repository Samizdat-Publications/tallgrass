// Tallgrass renderer foundation. Owns the WebGL renderer, scene, camera, lights, sky, terrain, water, trees,
// post stack and the drone camera, and exposes shared uniforms other layers (grass, animals, FX) plug into.
//
//   const engine = new Engine(parentEl, world);
//   engine.setVeg(vegBytes);          // RGBA8 n*n: R biomass, G fertility, B burn, A fear
//   engine.setEnv(env);               // EnvState (partial ok): day/night, season, weather, wind
//   engine.onFrame((dt, t) => { ... });
//   engine.start();
//
// Coordinates: sim (x, y) meters -> three (x, height, y), Y up. Meshes modeled facing +X use rotation.y = -heading.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import type { World } from '../sim/world';
import type { EnvState } from '../sim/types';
import { SharedUniforms, clamp, createSharedUniforms, lerp, smoothstep } from './common';
import { Terrain } from './terrain';
import { Water } from './water';
import { Sky, computeAtmosphere, createLighting, Lighting, Smoothed } from './sky';
import { Trees } from './trees';
import { PostFX, Quality } from './post';
import { Smoke } from './smoke';
import { DroneCamera, CameraPreset } from './camera';
import { grassTint } from './grass';

export type { Quality } from './post';
export { injectTerrainShadow } from './common';
export type { SharedUniforms } from './common';

const DEFAULT_ENV: EnvState = {
  tick: 0, year: 0, season: 1.2, dayFrac: 0.3, weather: 0, rain: 0, windDir: 0.35, windStrength: 0.35, warmth: 0.7,
};

interface SeasonKey {
  s: number; lush: string; cured: string; stub: string; soil: string; gH: number; gL: number; leaf: number; lA: string; lB: string;
}
const SEASONS: SeasonKey[] = [
  { s: 0.0, lush: '#6f9138', cured: '#a99a5a', stub: '#8f7d4c', soil: '#5e4630', gH: 0.85, gL: 1.0, leaf: 0.45, lA: '#6e7f38', lB: '#8d9a42' },
  { s: 0.5, lush: '#63852f', cured: '#b09b52', stub: '#8f7d4c', soil: '#5e4630', gH: 0.9, gL: 1.0, leaf: 0.85, lA: '#55692c', lB: '#76863a' },
  { s: 1.0, lush: '#6f8a30', cured: '#c58b37', stub: '#8e7a46', soil: '#664a30', gH: 0.1, gL: 0.82, leaf: 1.0, lA: '#3d4d24', lB: '#667432' },
  { s: 1.5, lush: '#738833', cured: '#c58b37', stub: '#8e7a46', soil: '#664a30', gH: 0.06, gL: 0.66, leaf: 1.0, lA: '#43512a', lB: '#707c34' },
  { s: 2.0, lush: '#88863a', cured: '#b9772e', stub: '#8c7240', soil: '#5e4632', gH: 0.08, gL: 0.42, leaf: 0.9, lA: '#8f7a26', lB: '#b08424' },
  { s: 2.5, lush: '#8a7a35', cured: '#a8662a', stub: '#86683c', soil: '#5a4230', gH: 0.05, gL: 0.26, leaf: 0.42, lA: '#9a6a22', lB: '#8c5420' },
  { s: 3.0, lush: '#8d8a62', cured: '#b9a77c', stub: '#a89a74', soil: '#584a3c', gH: 0.05, gL: 0.16, leaf: 0.08, lA: '#6a5238', lB: '#7a6040' },
  { s: 3.5, lush: '#8d8f66', cured: '#b5a57e', stub: '#a59876', soil: '#584a3c', gH: 0.1, gL: 0.3, leaf: 0.1, lA: '#6a5238', lB: '#7a6040' },
];
const SEASON_COLORS = SEASONS.map((k) => ({
  lush: new THREE.Color(k.lush), cured: new THREE.Color(k.cured), stub: new THREE.Color(k.stub), soil: new THREE.Color(k.soil),
  lA: new THREE.Color(k.lA), lB: new THREE.Color(k.lB),
}));
const ROCK_COLOR = new THREE.Color('#8d7f6a');

/** Copy of the blade layer's cure curve (grass.ts CURE_KEYS): how cured the prairie is across the year. */
const CURE_KEYS: [number, number][] = [
  [0, 0.03], [0.6, 0.06], [1.0, 0.12], [1.25, 0.24], [1.5, 0.6], [1.8, 0.92], [2.0, 1.0], [3.5, 1.0], [3.8, 0.5], [4.0, 0.03],
];
function keyCurve(keys: [number, number][], s: number): number {
  const t = ((s % 4) + 4) % 4;
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i];
    const [b, vb] = keys[i + 1];
    if (t >= a && t <= b) {
      const f = (t - a) / (b - a);
      return va + (vb - va) * f * f * (3 - 2 * f);
    }
  }
  return keys[keys.length - 1][1];
}

export interface EngineOptions {
  quality?: Quality;
  /** 'agx' | 'aces' | 'neutral' tone mapping; default aces. */
  toneMapping?: 'agx' | 'aces' | 'neutral';
  exposure?: number;
}

export class Engine {
  readonly world: World;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** The drone camera controller (flyTo, follow, setCinematic, preset). */
  readonly cam: DroneCamera;
  readonly uniforms: SharedUniforms;
  /** RGBA8 n x n vegetation texture other layers can sample: R biomass, G fertility, B burn, A fear. */
  readonly vegTexture: THREE.DataTexture;
  readonly sun: SunLight;
  readonly hemi: THREE.HemisphereLight;
  readonly terrain: Terrain;
  readonly water: Water;
  readonly trees: Trees;
  readonly sky: Sky;
  readonly smoke: Smoke;
  readonly post: PostFX;
  readonly lighting: Lighting = createLighting();

  env: EnvState = { ...DEFAULT_ENV };
  quality: Quality = 'high';
  exposure = 1;
  /** Real seconds since the engine started rendering. */
  time = 0;

  private parent: HTMLElement;
  private frameCbs: Array<(dt: number, t: number) => void> = [];
  private running = false;
  private raf = 0;
  private last = 0;
  private sm: Smoothed = { overcast: 0, snow: 0, wet: 0 };
  private resizeObs: ResizeObserver | null = null;
  private lastNear = 0;
  private shadowRange = 300;
  private firstFrame = true;
  private lastTick = 0;
  private frostSm = 0;
  private lastTickF = 0;
  private _focus = new THREE.Vector3();
  /** Fade tree canopies and trunks out of the line between the camera and the point it watches (default on). */
  occlusionFade = true;

  constructor(parent: HTMLElement, world: World, opts: EngineOptions = {}) {
    this.world = world;
    this.parent = parent;
    const renderer = new THREE.WebGLRenderer({
      antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true,
    });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const tm = opts.toneMapping ?? 'aces';
    renderer.toneMapping = tm === 'agx' ? THREE.AgXToneMapping : tm === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    this.exposure = opts.exposure ?? 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    parent.appendChild(renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 9000);
    this.uniforms = createSharedUniforms(world.size);

    // vegetation texture: start from capacity so the world looks grassy before the sim sends data
    const n = world.n;
    const veg = new Uint8Array(n * n * 4);
    for (let k = 0; k < n * n; k++) {
      veg[k * 4] = Math.round(clamp(world.capacity[k] * 0.9, 0, 1) * 255);
      veg[k * 4 + 1] = Math.round(clamp(world.soilBase[k], 0, 1) * 255);
    }
    this.vegTexture = new THREE.DataTexture(veg, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.vegTexture.minFilter = this.vegTexture.magFilter = THREE.LinearFilter;
    this.vegTexture.wrapS = this.vegTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.vegTexture.generateMipmaps = false;
    this.vegTexture.needsUpdate = true;
    this.vegTexture.name = 'veg';
    this.uniforms.vegTex.value = this.vegTexture;

    this.terrain = new Terrain(world, this.uniforms);
    this.water = new Water(world, this.uniforms, this.terrain.creekDist);
    this.trees = new Trees(world, this.uniforms, this.terrain.heightAt);
    this.sky = new Sky(this.uniforms);
    this.smoke = new Smoke(world, this.uniforms, this.terrain.heightAt);

    this.sun = new SunLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = this.shadowRange;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.25;
    this.sun.shadow.radius = 2;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1);

    this.scene.add(this.sky.mesh, this.terrain.mesh, this.water.mesh, this.trees.group, this.smoke.mesh, this.sun, this.hemi);

    this.post = new PostFX(renderer, this.scene, this.camera, this.uniforms);
    this.post.aoExclude.push(this.sky.mesh, this.water.mesh, this.smoke.mesh);
    let hmin = 1e9;
    for (let i = 0; i < world.height.length; i++) hmin = Math.min(hmin, world.height[i]);
    this.post.setMistBase(hmin);

    // 'low' preset: open grassland (no trees or water within 22 m, gentle slope) near the middle of the valley
    let lowAnchor = { x: world.size / 2, z: world.size / 2 };
    {
      const tr = world.trees, sh = world.shrubs;
      let best = 1e18;
      const c0 = world.size / 2;
      for (let x = 48; x < world.size - 48; x += 12) {
        for (let z = 48; z < world.size - 48; z += 12) {
          const ci = Math.floor(x / world.cell), cj = Math.floor(z / world.cell), c = cj * world.n + ci;
          if (world.water[c] || world.slope[c] > 0.12 || world.waterDist[c] < 14 || world.waterDist[c] > 90) continue;
          let ok = true;
          for (let i = 0; i < tr.length && ok; i += 4) if (Math.hypot(tr[i] - x, tr[i + 1] - z) < 24) ok = false;
          for (let i = 0; i < sh.length && ok; i += 3) if (Math.hypot(sh[i] - x, sh[i + 1] - z) < 7) ok = false;
          if (!ok) continue;
          const score = Math.hypot(x - c0, z - c0) + world.waterDist[c] * 0.6 - world.capacity[c] * 40;
          if (score < best) { best = score; lowAnchor = { x, z }; }
        }
      }
    }
    this.cam = new DroneCamera(this.camera, renderer.domElement, {
      ground: this.terrain.heightAt,
      worldSize: world.size,
      sunAzimuth: () => Math.atan2(this.uniforms.lightDir.value.x, this.uniforms.lightDir.value.z),
      lowAnchor,
    });

    this.setQuality(opts.quality ?? 'high');
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(parent);
    }
    this.updateEnvState(0);
    this.terrain.updateShadow(renderer, this.uniforms.lightDir.value, true);
  }

  // ------------------------------------------------------------ public API

  /**
   * Upload the vegetation texture (RGBA8, n*n, row-major by y then x). The burn channel is scrubbed on the way in: ash fades as
   * grass regrows (so burned ground greens up in both the terrain and the blade layer), while burning cells (B = 255) are kept
   * and handed to the smoke system.
   */
  setVeg(data: Uint8Array): void {
    const dst = this.vegTexture.image.data as Uint8Array;
    dst.set(data);
    for (let o = 0; o < dst.length; o += 4) {
      const b = dst[o + 2];
      if (b > 0 && b < 250) {
        const r = dst[o] / 255;
        const t = clamp((r - 0.06) / 0.39, 0, 1);
        dst[o + 2] = (b * (1 - t * t * (3 - 2 * t))) | 0;
      }
    }
    this.vegTexture.needsUpdate = true;
    this.smoke.setVeg(dst);
  }

  /** Set the environment (partial updates allowed). Lighting, sky, season palette and haze all follow. */
  setEnv(env: Partial<EnvState>): void {
    Object.assign(this.env, env);
  }

  /** Apply the current env immediately without smoothing (call right after setEnv, before the first frame). */
  applyEnvNow(): void {
    this.firstFrame = true;
    this.updateEnvState(0);
    this.firstFrame = false;
    this.terrain.updateShadow(this.renderer, this.uniforms.lightDir.value, true);
  }

  /** Register a per-frame callback. Returns an unsubscribe function. */
  onFrame(cb: (dt: number, t: number) => void): () => void {
    this.frameCbs.push(cb);
    return () => { this.frameCbs = this.frameCbs.filter((f) => f !== cb); };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.renderOnce(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Advance time, run callbacks and render one frame. */
  renderOnce(dt: number): void {
    this.time += dt;
    this.uniforms.time.value = this.time;
    this.cam.update(dt);
    for (const cb of this.frameCbs) cb(dt, this.time);
    this.smoke.update(dt, this.camera);
    this.updateEnvState(dt);
    this.post.render(dt);
    this.firstFrame = false;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const high = q === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
    const map = high ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== map) {
      this.sun.shadow.mapSize.set(map, map);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as never;
    }
    this.post.setQuality(q);
    this.resize();
  }

  /** Terrain height (m) at sim position (x, y); valid outside the playable square too. */
  groundHeight(x: number, y: number): number {
    return this.terrain.heightAt(x, y);
  }

  /** Hide an object while the ambient-occlusion depth/normal pre-pass runs (use for grass, fx, sprites). */
  excludeFromAO(obj: THREE.Object3D): void {
    if (!this.post.aoExclude.includes(obj)) this.post.aoExclude.push(obj);
  }

  setCameraPreset(name: CameraPreset): void { this.cam.preset(name); }
  setFearOverlay(v: number): void { this.uniforms.fearOverlay.value = clamp(v, 0, 1); }
  setToneMapping(tm: 'agx' | 'aces' | 'neutral'): void {
    this.renderer.toneMapping = tm === 'agx' ? THREE.AgXToneMapping : tm === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  }

  resize(): void {
    const w = Math.max(2, this.parent.clientWidth || 800);
    const h = Math.max(2, this.parent.clientHeight || 450);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
  }

  dispose(): void {
    this.stop();
    this.resizeObs?.disconnect();
    this.cam.dispose();
    this.post.dispose();
    this.terrain.dispose();
    this.water.dispose();
    this.trees.dispose();
    this.sky.dispose();
    this.smoke.dispose();
    this.vegTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------ per-frame state

  private updateEnvState(dt: number): void {
    const env = this.env;
    const u = this.uniforms;
    const sm = this.sm;

    // Weather-driven state eases in and out over sim time, so snow settles and melts over tens of seconds at 1x (a few at
    // 10x or 100x) instead of popping when the weather flips. Sim time comes from env.tick (10 ticks per second at 1x);
    // pages that never advance the tick (dev pages) fall back to real time. Paused sim = frozen weather state.
    const w = env.weather;
    const overTarget = w === 3 ? 0.9 : w === 1 ? 0.45 + 0.4 * env.rain : w === 4 ? 0.38 : 0;
    const snowTarget = w === 4 ? 1 : 0;
    const wetTarget = w === 1 || w === 3 ? clamp(0.3 + env.rain, 0, 1) : w === 4 ? 0.2 : 0;
    let simTicks: number;
    if (this.firstFrame) simTicks = 1e6;
    else if (env.tick === 0) simTicks = dt * 10;
    else {
      const d = env.tick - this.lastTick;
      simTicks = d > 0 && d < 5000 ? Math.min(d, 14) : d >= 5000 ? 14 : 0;
    }
    this.lastTick = env.tick;
    const ease = (cur: number, target: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-simTicks / tau));
    sm.overcast = ease(sm.overcast, overTarget, 160);
    sm.snow = ease(sm.snow, snowTarget, snowTarget > sm.snow ? 320 : 220);
    sm.wet = ease(sm.wet, wetTarget, 200);

    computeAtmosphere(env, sm, u, this.lighting);
    this.applySeason(env.season);
    const winter = smoothstep(2.4, 3.1, u.season.value) * (1 - smoothstep(3.55, 3.95, u.season.value));
    const frostTime = 1 - smoothstep(0.36, 0.5, env.dayFrac) * (1 - smoothstep(0.62, 0.74, env.dayFrac));
    const frostTarget = winter * frostTime * (1 - 0.6 * env.warmth);
    this.frostSm = this.firstFrame ? frostTarget : this.frostSm + (frostTarget - this.frostSm) * (1 - Math.exp(-(env.tick === 0 ? dt * 10 : Math.min(14, Math.max(0, env.tick - this.lastTickF))) / 90));
    this.lastTickF = env.tick;
    u.frost.value = this.frostSm;
    u.snow.value = sm.snow;
    u.wet.value = sm.wet;
    u.rock.value.copy(ROCK_COLOR);

    const L = this.lighting;
    // lights
    this.sun.position.copy(u.lightDir.value);
    this.sun.color.copy(u.lightColor.value);
    this.sun.intensity = 1;
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiIntensity;
    this.renderer.toneMappingExposure = L.exposure * this.exposure;

    // shadow range follows how far the camera looks: tight when low and close, whole valley when high
    const range = clamp(this.cam.distance * 1.7 + 80, 140, 900);
    if (Math.abs(range - this.shadowRange) > 2) {
      this.shadowRange = range;
      this.sun.shadow.camera.far = range;
    }

    // dynamic near plane keeps depth precision good from ground level to the wide view
    const camY = this.camera.position.y;
    const aboveGround = Math.max(0, camY - this.terrain.heightAt(this.camera.position.x, this.camera.position.z));
    const near = clamp(0.25 + aboveGround * 0.02, 0.25, 5);
    if (Math.abs(near - this.lastNear) / near > 0.08) {
      this.lastNear = near;
      this.camera.near = near;
      this.camera.far = 9000;
      this.camera.updateProjectionMatrix();
    }
    this.sky.follow(this.camera);
    this.trees.update(this.camera.position);

    // canopy occlusion fade: keep the watched point visible when close in (follow cam, herd framing, low views)
    {
      const dist = this.cam.distance;
      const focus = this.cam.getFocus(this._focus);
      u.occCam.value.copy(this.camera.position);
      u.occFocus.value.set(focus.x, focus.y + 0.5, focus.z);
      const r = clamp(dist * 0.065, 1.8, 7);
      u.occParams.value.set(r * 0.6, r * 1.7, this.occlusionFade ? 1 - smoothstep(110, 175, dist) : 0);
    }

    this.terrain.updateShadow(this.renderer, u.lightDir.value);
    this.post.apply(L);
  }

  private applySeason(season: number): void {
    const u = this.uniforms;
    const s = ((season % 4) + 4) % 4;
    const f = s / 0.5;
    const i0 = Math.floor(f) % 8, i1 = (i0 + 1) % 8;
    const t = f - Math.floor(f);
    const a = SEASONS[i0], b = SEASONS[i1];
    const ca = SEASON_COLORS[i0], cb = SEASON_COLORS[i1];
    u.grassLush.value.copy(ca.lush).lerp(cb.lush, t);
    u.grassCured.value.copy(ca.cured).lerp(cb.cured, t);
    u.stubble.value.copy(ca.stub).lerp(cb.stub, t);
    u.soil.value.copy(ca.soil).lerp(cb.soil, t);
    u.leafColorA.value.copy(ca.lA).lerp(cb.lA, t);
    u.leafColorB.value.copy(ca.lB).lerp(cb.lB, t);
    u.greenHigh.value = lerp(a.gH, b.gH, t);
    u.greenLow.value = lerp(a.gL, b.gL, t);
    u.leafAmount.value = lerp(a.leaf, b.leaf, t);

    // terrain grass color = the blade layer's own palette (probes into grassTint, see grass.ts), so ground and blades match
    const cure = keyCurve(CURE_KEYS, s);
    u.cure.value = cure;
    grassTint(s, 1.5, 1.0, u.grassGreen.value);
    grassTint(s, 0.0, 0.0, u.grassDry.value);
    // undo the ridge tint that grassTint bakes into the dry probe (the terrain shader re-applies it per fragment)
    u.grassDry.value.r /= 1.08; u.grassDry.value.g /= 0.93; u.grassDry.value.b /= 0.84;
  }
}
