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
import { SEASON_TICKS, type EnvState } from '../sim/types';
import { SharedUniforms, clamp, createSharedUniforms, lerp, smoothstep } from './common';
import { Terrain } from './terrain';
import { CloudShadow } from './cloudshadow';
import { TgSunShadow } from './sunshadow';
import { Water } from './water';
import { Sky, computeAtmosphere, createLighting, Lighting, Smoothed } from './sky';
import { Trees } from './trees';
import { PostFX, Quality } from './post';
import { CutFx } from './cutfx';
import { Smoke } from './smoke';
import { Fireflies, fireflyAmount } from './fireflies';
import { Storms } from './storms';
import { DroneCamera, CameraPreset } from './camera';
import { CLIMATE_GRADE, grassTint } from './grass';
import { CURE_KEYS, LAPSE_SEASON, LAPSE_SNOW, LAPSE_SWING, LEAF_KEYS, PACK_KEYS, SPRING, keyCurve, springK, winterK } from './season';
import { SnowDepth } from './snowdepth';
import { Flood } from './flood';
import { DustStorm } from './dust';
import { Hoppers } from './hoppers';
import { BeaverWorks } from './beaverworks';
import { mark, frameMs } from '../startmarks';

export type { Quality } from './post';
export { injectTerrainShadow } from './common';
export type { SharedUniforms } from './common';

/** Fixed steps for the shadow range and the camera near plane (see updateEnvState). */
const SHADOW_RANGES = [140, 190, 260, 360, 500, 700, 900];
const NEAR_STEPS = [0.25, 0.4, 0.65, 1, 1.6, 2.5, 4, 5];

/** Bark albedo scale now that trunks no longer pass through the (zeroing) AO pass; see the Engine constructor. */
const BARK_ALBEDO = 0.34;

/** The steady key-light direction a fast-forward settles on (see updateEnvState): south-south-west, 40 degrees up. */
const HOLD_AZ = 200 * Math.PI / 180;
const HOLD_EL = 40 * Math.PI / 180;
const HOLD_DIR = new THREE.Vector3();
/** The time of day (0..1, 0.25 = sunrise, 0.5 = noon) the light settles on while time flies: a warm, fairly high mid-morning. */
const LAPSE_DAY = 0.42;
/** The season-driven uniforms the time-lapse damping blends toward the steady growing season (engine.applySeason). */
const LAPSE_COLS = ['grassLush', 'grassCured', 'stubble', 'soil', 'leafColorA', 'leafColorB', 'grassGreen', 'grassDry'] as const;
const LAPSE_NUMS = ['greenHigh', 'greenLow', 'leafAmount', 'cure'] as const;

const DEFAULT_ENV: EnvState = {
  tick: 0, year: 0, season: 1.2, dayFrac: 0.3, weather: 0, rain: 0, windDir: 0.35, windStrength: 0.35, warmth: 0.7,
};

interface SeasonKey {
  s: number; lush: string; cured: string; stub: string; soil: string; gH: number; gL: number; leaf: number; lA: string; lB: string;
}
/** Scratch colour for applyDustStorm. */
const DUST_TMP = new THREE.Color();
const SEASONS: SeasonKey[] = [
  { s: 0.0, lush: '#6f9138', cured: '#a99a5a', stub: '#8f7d4c', soil: '#5e4630', gH: 0.85, gL: 1.0, leaf: 0.45, lA: '#6e7f38', lB: '#8d9a42' },
  { s: 0.5, lush: '#63852f', cured: '#b09b52', stub: '#8f7d4c', soil: '#5e4630', gH: 0.9, gL: 1.0, leaf: 0.85, lA: '#55692c', lB: '#76863a' },
  { s: 1.0, lush: '#6f8a30', cured: '#c58b37', stub: '#8e7a46', soil: '#664a30', gH: 0.1, gL: 0.82, leaf: 1.0, lA: '#3d4d24', lB: '#667432' },
  { s: 1.5, lush: '#738833', cured: '#c58b37', stub: '#8e7a46', soil: '#664a30', gH: 0.06, gL: 0.66, leaf: 1.0, lA: '#43512a', lB: '#707c34' },
  { s: 2.0, lush: '#88863a', cured: '#b9772e', stub: '#8c7240', soil: '#5e4632', gH: 0.08, gL: 0.42, leaf: 0.9, lA: '#77702e', lB: '#a98230' },
  { s: 2.5, lush: '#8a7a35', cured: '#a8662a', stub: '#86683c', soil: '#5a4230', gH: 0.05, gL: 0.26, leaf: 0.42, lA: '#8a6a2a', lB: '#a07830' },
  { s: 3.0, lush: '#8d8a62', cured: '#b9a77c', stub: '#a89a74', soil: '#584a3c', gH: 0.05, gL: 0.16, leaf: 0.08, lA: '#6a5238', lB: '#7a6040' },
  { s: 3.5, lush: '#8d8f66', cured: '#b5a57e', stub: '#a59876', soil: '#584a3c', gH: 0.1, gL: 0.3, leaf: 0.1, lA: '#6a5238', lB: '#7a6040' },
];
const SEASON_COLORS = SEASONS.map((k) => ({
  lush: new THREE.Color(k.lush), cured: new THREE.Color(k.cured), stub: new THREE.Color(k.stub), soil: new THREE.Color(k.soil),
  lA: new THREE.Color(k.lA), lB: new THREE.Color(k.lB),
}));
const ROCK_COLOR = new THREE.Color('#8d7f6a');

// the cure, leaf, snowpack and seed curves (and keyCurve) live in season.ts, shared with the blade layer and the ground shader

/**
 * Sun shadow filter. three's PCF takes 5 rotated taps with one UV offset for both axes, but the two cascades sit side by side in one
 * atlas (twice as wide as tall), so the kernel came out half as tall as wide in texels and, with only 5 binary-ish taps, it dithered
 * into jagged, flickering edges as shadows moved. This keeps the same Vogel disk rotated per pixel but works in true texels on
 * both axes and takes 8 taps, so penumbrae are round, smoother and steadier. Patched once at module load, before any program compiles.
 */
function patchShadowFilter(): void {
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunk.shadowmap_pars_fragment;
  if (!src || src.includes('tgShadowTaps')) return;
  const a = src.indexOf('float radius = shadowRadius * texelSize.x;');
  const b = src.indexOf(') * 0.2;', a);
  if (a < 0 || b < 0) { console.warn('tallgrass: shadow filter patch skipped (three chunk layout changed)'); return; }
  const body = `vec2 radius = shadowRadius * texelSize;
				// tgShadowTaps: Vogel disk, rotated per pixel
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = 0.0;
				for ( int i = 0; i < 8; i ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 8, phi ) * radius, shadowCoord.z ) );
				}
				shadow *= 0.125;`;
  chunk.shadowmap_pars_fragment = src.slice(0, a) + body + src.slice(b + ') * 0.2;'.length);
}
patchShadowFilter();

export interface EngineOptions {
  quality?: Quality;
  /** 'agx' | 'aces' | 'neutral' tone mapping; default aces. */
  toneMapping?: 'agx' | 'aces' | 'neutral';
  exposure?: number;
  /** Start compiling the scene's shaders at the end of the constructor (default on; main.ts turns it off with ?prime=0). */
  earlyCompile?: boolean;
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
  /** Grazing and trampling memory (R8), derived from how fast biomass drops; fades over a few sim minutes. */
  readonly trailTexture: THREE.DataTexture;
  private prevBio: Uint8Array;
  private trail: Uint8Array;
  readonly sun: SunLight;
  readonly hemi: THREE.HemisphereLight;
  readonly terrain: Terrain;
  readonly water: Water;
  readonly trees: Trees;
  readonly sky: Sky;
  readonly cloudShadow: CloudShadow;
  readonly smoke: Smoke;
  readonly fireflies: Fireflies;
  /** S12 dust storm (blowing dust, eased storm level) and grasshopper swarm; both idle and invisible unless the sim sends their fields. */
  readonly dustStorm: DustStorm;
  readonly hoppers: Hoppers;
  /** Beaver dams and lodges (S14); empty until the sim sends the pond field. */
  readonly beaverWorks: BeaverWorks;
  /** Storm visuals (R4): cloud masses, rain shafts, lightning, rainbow. Fed by setStorms(). */
  readonly storms: Storms;
  readonly post: PostFX;
  readonly lighting: Lighting = createLighting();

  env: EnvState = { ...DEFAULT_ENV };
  quality: Quality = 'high';
  exposure = 1;
  /** Real seconds since the engine started rendering. */
  time = 0;

  private parent: HTMLElement;
  private frameCbs: Array<(dt: number, t: number) => void> = [];
  private preRenderCbs: Array<() => void> = [];
  private running = false;
  private raf = 0;
  private last = 0;
  private sm: Smoothed = { overcast: 0, snow: 0, wet: 0 };
  private resizeObs: ResizeObserver | null = null;
  private lastNear = 0;
  private nearIdx = 0;
  private rangeIdx = 3;
  private shadowRange = 360;
  private firstFrame = true;
  private lastTick = 0;
  private frostSm = 0;
  private rainSm = 0;
  /** Sim tick a sim-announced blizzard event ends (-1 = none), and the eased 0..1 share of the gale wind it lays over the weather. */
  private blizzardUntil = -1;
  private bzWindSm = 0;
  private bzLastTick = 0;
  /** Scratch colour for applyRain. */
  private readonly rainTmp = new THREE.Color();
  private dustSm = 0;
  /**
   * Climate regimes (v10): the sim's wet and dry index as drawn, eased over a few real seconds so a time-lapse breathes instead of
   * popping (-1 driest .. 1 wettest; 0 with climate2 off), the eased megadrought flag, and the two looks they drive. dryLook rides the
   * drought path (ground and blade straw bleach, dusty soil, haze); wetLook deepens the living green and the cured gold (grass.ts).
   */
  private climSm = 0;
  private megaSm = 0;
  private dryLook = 0;
  /** r-spring-v1: the share of the dry-years dust haze left after rain and winter (0..1), and the winter amount it used (lapse-damped). */
  private dryAir = 1;
  private winterNow = 0;
  private wetLook = 0;
  /** True while a megadrought holds (the page sets it from the worker's snapshot, or the ?clim=mega override). */
  megadrought = false;
  /** Falling-snow intensity 0..1: eased faster than the snowpack (flakes start and stop within seconds of the weather). */
  private snowfallSm = 0;
  /** The seasonal snowpack (PACK_KEYS) as drawn: eased in real seconds, so a time-lapse through early winter fades the snow in instead of popping it. */
  private packSm = 0;
  /** S11 per-cell snow depth (fed by setSnowDepth, only when the sim runs with snowDepth on). */
  readonly snowDepth: SnowDepth;
  /** Floodwater over the band along the creek (S17 flood tool, S12 spring floods); hidden while no flood runs. */
  readonly flood: Flood;
  private readonly rainDir = new THREE.Vector3();
  /**
   * Fast-forward softening of the sun. At 10x and 100x the sun laps the sky several times a second, and a hard shadow whipping across
   * the ground reads as strobing. `simSpeed` is the sim speed of the latest snapshot (see setStorms), `fastSm` the eased 0..1 amount
   * of softening (0 at 1x: the lighting is then exactly the unsoftened one), `dayDisp` the clock the sun is drawn from, which is
   * low-passed per frame while fast so the sun glides instead of stepping once per snapshot.
   */
  private simSpeed = 1;
  private fastSm = 0;
  private dayDisp = NaN;
  /**
   * Trial (off by default, `?sunhold=1`): while the documentary camera films at 1x, the sun is held for the length of a shot (creeping at
   * a slow rate) and catches up at the cut, which the dip already hides. A valley day lasts about 80 s at 1x, so the light otherwise sweeps
   * visibly while the animals walk at real speed (Gemini rounds 34 and 38 read that as sliding). The sim's own clock is unchanged.
   */
  sunHold = false;
  private shotSun = NaN;
  /**
   * Time-lapse daylight (r-breath): from about 30x the valley's days lap faster than the eye can follow (a day every 0.8 s at 100x), and
   * the day and night strobe drowns the slow breathing of the wet and dry years. Above that speed the light is eased to one steady
   * mid-morning (LAPSE_DAY) while the seasons carry on; holdSm is the eased 0..1 amount, so the change of light is never a pop.
   */
  private holdSm = 0;
  /** Latched once the sim sends a non-zero climate index (climate2 on). The time-lapse light is part of that mode: with the param off the light behaves as it always did. */
  private climateOn = false;
  /**
   * Time-lapse seasons (r-lapse): same gate as the daylight hold (from about 30x, climate regimes on), eased in real time. lapseSm is the eased
   * 0..1 amount; at 1 the seasonal look keeps LAPSE_SWING of its swing around a steady growing season and the snowpack shrinks to LAPSE_SNOW.
   * The climate (wet and dry) looks are untouched. `?lapse=0` turns it off (lapseEnabled), for comparison captures.
   */
  private lapseSm = 0;
  lapseEnabled = typeof location === 'undefined' || new URLSearchParams(location.search).get('lapse') !== '0';
  /** The dip at the documentary camera's cuts (the director drives it). `?cuts=0` turns it and the eye adaptation off, `?dip=0` or `?adapt=0` one of them. */
  readonly cutFx = new CutFx();
  private readonly lapseSnap = { cols: [] as THREE.Color[], nums: [] as number[] };
  private readonly envDisp: EnvState = { ...DEFAULT_ENV };
  private tickPool = 0;
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
    this.snowDepth = new SnowDepth(world.size);
    this.uniforms.snowDepthTex.value = this.snowDepth.tex;

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
    {
      let sm = 0, sb = 0, cnt = 0;
      for (let k = 0; k < n * n; k++) if (!world.water[k]) { sm += world.moisture[k]; sb += veg[k * 4]; cnt++; }
      this.uniforms.farStats.value.set(sb / Math.max(1, cnt) / 255, sm / Math.max(1, cnt));
    }
    this.prevBio = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) this.prevBio[k] = veg[k * 4];
    this.trail = new Uint8Array(n * n);
    this.trailTexture = new THREE.DataTexture(this.trail, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    this.trailTexture.minFilter = this.trailTexture.magFilter = THREE.LinearFilter;
    this.trailTexture.wrapS = this.trailTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.trailTexture.generateMipmaps = false;
    this.trailTexture.needsUpdate = true;
    this.trailTexture.name = 'trail';
    this.uniforms.trailTex.value = this.trailTexture;

    // the lights come first: a shader program is made for the lights in the scene, and the terrain's starts compiling the moment it exists
    this.sun = new SunLight(0xffffff, 1);
    // two cascades with a wide blend band, so the drop in shadow resolution fades in instead of showing as a line (see sunshadow.ts)
    this.sun.shadow = new TgSunShadow();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = this.shadowRange;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.25;
    this.sun.shadow.radius = 1.8;
    this.sun.shadow.intensity = 0.92;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1);
    this.scene.add(this.sun, this.hemi);
    mark('eng_pre_terrain');
    this.terrain = new Terrain(world, this.uniforms);
    mark('eng_terrain');
    if (opts.earlyCompile !== false) this.compileEarly(this.terrain.mesh);
    // r-perf: the ground is shaded after the grass, trees and animals (all opaque), so the depth test rejects every ground pixel they cover before the ground shader runs
    this.terrain.mesh.renderOrder = 5;
    this.water = new Water(world, this.uniforms, this.terrain.creekDist);
    if (opts.earlyCompile !== false) this.compileEarly(this.water.mesh);
    mark('eng_water');
    this.trees = new Trees(world, this.uniforms, this.terrain.heightAt);
    if (opts.earlyCompile !== false) this.compileEarly(this.trees.group);
    mark('eng_trees');
    this.flood = new Flood(world, this.uniforms);
    this.storms = new Storms(world, this.uniforms, this.terrain.heightAt);
    this.sky = new Sky(this.uniforms, this.storms.uniforms);
    this.cloudShadow = new CloudShadow(this.uniforms, world.size);
    this.smoke = new Smoke(world, this.uniforms, this.terrain.heightAt);
    this.fireflies = new Fireflies(world, this.uniforms.time, this.terrain.heightAt);
    this.dustStorm = new DustStorm(world.size, this.uniforms, world.hn, world.cell);
    this.hoppers = new Hoppers(world.size, this.uniforms, world.hn, world.cell);
    this.beaverWorks = new BeaverWorks(world, this.uniforms, this.terrain.heightAt);

    mark('eng_misc');

    this.scene.userData.tgUniforms = this.uniforms;
    this.scene.add(this.sky.mesh, this.terrain.mesh, this.water.mesh, this.flood.mesh, this.trees.group, this.beaverWorks.group, this.smoke.mesh, this.fireflies.mesh, this.dustStorm.mesh, this.hoppers.mesh, this.storms.group);

    mark('eng_pre_post');
    this.post = new PostFX(renderer, this.scene, this.camera, this.uniforms, this.storms.uniforms);
    mark('eng_post');
    {
      const qs = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
      const all = qs.get('cuts') !== '0';
      this.cutFx.enabled = all && qs.get('dip') !== '0';
      this.post.setAdapt(all && qs.get('adapt') !== '0' ? 0.65 : 0);
    }
    this.post.aoExclude.push(this.sky.mesh, this.water.mesh, this.flood.mesh, this.smoke.mesh, this.fireflies.mesh, this.dustStorm.mesh, this.hoppers.mesh, ...this.storms.meshes);
    // GTAO renders its own normal/depth pass with an override material that ignores alpha cut-outs, so a sparse canopy would occlude
    // the sky behind its gaps and show as grey smoke. Keep alpha-cut foliage (crowns and shrubs) out of that pass.
    for (const m of this.trees.meshes) if (m.name.startsWith('cottonwood-crown') || m.name.startsWith('shrubs')) this.post.aoExclude.push(m);
    // Bark stays out of the AO pass too: GTAO resolves every cottonwood trunk and limb to zero occlusion (the AO buffer is solid black
    // on bark whatever the radius, thickness or scale), so a trunk beside the camera, seen against a low sun, was a full-height black
    // slab at the frame edge. The trunks keep their own lit and fill shading, and the ground around them still gets its occlusion.
    // The bark's brightness was tuned under that zero AO (it multiplied every trunk by about a tenth), so un-crushed it reads cream
    // white: take its albedo down to a dark weathered grey-brown instead (one shared material, scaled once).
    {
      const seen = new Set<THREE.Material>();
      for (const m of this.trees.meshes) {
        if (!m.name.startsWith('cottonwood-bark')) continue;
        this.post.aoExclude.push(m);
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!seen.has(mat)) { seen.add(mat); mat.color.multiplyScalar(BARK_ALBEDO); }
      }
    }
    let hmin = 1e9;
    for (let i = 0; i < world.height.length; i++) hmin = Math.min(hmin, world.height[i]);
    this.post.setMistBase(hmin);
    this.post.setPoolMap(world.size, this.terrain.heightAt);

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
    this.cam.setObstacles(this.trees); // the camera keeps out of crowns, trunks and hills (camcollide.ts)

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
    this.trees.setBurn(dst, this.world.n); // R11: cottonwoods caught in a fire stand on as charred snags
    // trail memory: a quick drop in biomass (grazing, trampling) marks the cell; slow seasonal die-back does not
    const tr = this.trail, pb = this.prevBio;
    for (let k = 0, o = 0; k < tr.length; k++, o += 4) {
      const cur = dst[o];
      const drop = pb[k] - cur;
      let t = tr[k] * 0.9965;
      if (drop >= 2 && cur < 200) t += Math.min(70, drop * 5);
      tr[k] = t > 255 ? 255 : t;
      pb[k] = cur;
    }
    this.trailTexture.needsUpdate = true;
    // keep the far ring's stand-in grass at the valley's own average biomass (smoothed), so the border does not show
    {
      let sb = 0, cnt = 0;
      for (let k = 0, o = 0; k < tr.length; k += 7, o += 28) { sb += dst[o]; cnt++; }
      const m = sb / Math.max(1, cnt) / 255;
      const fs = this.uniforms.farStats.value;
      fs.x += (m - fs.x) * 0.35;
    }
  }

  /** Set the environment (partial updates allowed). Lighting, sky, season palette and haze all follow. */
  setEnv(env: Partial<EnvState>): void {
    Object.assign(this.env, env);
  }

  /** What is on screen right now (the same eased values that drive the precipitation, dust and flood passes), for the status line. */
  skyNow(out: { snow: number; blizzard: number; rain: number; drought: number; dustStorm: number; flood: number; overcast: number; climate?: number; megadrought?: boolean; lapse?: boolean }): void {
    out.snow = this.snowfallSm;
    out.blizzard = this.post.blizzard;
    out.rain = this.rainSm;
    out.drought = this.dustSm;
    out.dustStorm = this.dustStorm.amount;
    out.flood = this.flood.level;
    out.overcast = this.sm.overcast;
    out.climate = this.climSm;
    out.megadrought = this.megaSm > 0.5;
    out.lapse = this.holdSm > 0.5;
  }

  /** A new snow depth frame from the sim (Snapshot.snow: 32 x 32 bytes, depth x 255, row-major by y then x). Eased toward over about a second. */
  setSnowDepth(bytes: Uint8Array): void {
    this.snowDepth.setTarget(bytes);
  }

  /** The running flood (Snapshot.flood: [ticks left, severity, band width m]) or undefined when none runs. Send every snapshot. */
  setFlood(f: Float32Array | undefined): void {
    this.flood.setFrame(f);
  }

  /** The running dust storm (Snapshot.dust: [intensity, direction rad, ticks left, front, peak]) or undefined when none runs. Send every snapshot. */
  setDust(d: Float32Array | undefined): void {
    this.dustStorm.setFrame(d);
  }

  /** The grasshopper density field (Snapshot.hoppers, 32 x 32 bytes); undefined on frames without the vegetation texture (the last field stays). */
  setHoppers(h: Uint8Array | undefined): void {
    this.hoppers.setField(h);
  }

  /**
   * Beaver ponds (S14): Snapshot.ponds (n x n bytes, extra depth in cm), dams, lodges, drownedTrees and pondVersion. Call with every snapshot;
   * the fields come with the vegetation texture and only when the version changed, so this is a no-op on every other frame. A change redraws
   * the pond water (Water.setPonds), the dams and lodges, and stands the newly drowned static trees as snags.
   */
  setBeavers(f: { ponds?: Uint8Array; dams?: Float32Array; lodges?: Float32Array; drownedTrees?: Uint32Array; pondVersion?: number }): void {
    if (f.pondVersion === undefined || !f.ponds || f.pondVersion === this.pondVersion) return;
    this.pondVersion = f.pondVersion;
    this.water.setPonds(f.ponds);
    this.terrain.setPondField(f.ponds);
    this.beaverWorks.setField(f.ponds, f.dams, f.lodges, f.pondVersion);
    this.trees.setDrowned(f.drownedTrees);
  }
  private pondVersion = -1;

  /** The player's planted groves (Snapshot.groves, stride 4: x, y, height, crown radius), the whole list; new trees are appended. */
  setGroves(g: Float32Array | undefined): void {
    this.trees.setGroves(g);
  }

  /**
   * Dynamic trees (S13): Snapshot.trees / treesVersion / treeCover. Call with every snapshot (treesVersion is on all of them while the
   * sim param is on); the list and the cover field only come when the version changed, so this is a no-op the rest of the time. The tree
   * cover also reaches the terrain shade here (one texture upload per version); the grass layer takes it through Grass.setCover.
   */
  setDynamicTrees(trees: Float32Array | undefined, version: number | undefined, cover: Uint8Array | undefined): void {
    if (version === undefined) return;
    this.trees.setDynamic(trees, version);
    if (cover) this.terrain.setCover(cover);
  }

  /** Apply the current env immediately without smoothing (call right after setEnv, before the first frame). */
  applyEnvNow(): void {
    this.firstFrame = true;
    this.updateEnvState(0);
    this.firstFrame = false;
    this.terrain.updateShadow(this.renderer, this.uniforms.lightDir.value, true);
  }

  /**
   * A blizzard event from the sim (kind 'blizzard': its tick plus its duration `a` is `untilTick`). The sim raises the event for a natural
   * blizzard without raising the weather's wind value past its usual mild one, so the renderer lays a gale over the snowfall itself while
   * the event runs (eased in real time, so it builds and clears smoothly at any speed).
   */
  noteBlizzard(untilTick: number, replace = false): void {
    if (replace || untilTick > this.blizzardUntil) this.blizzardUntil = untilTick;
  }

  /**
   * Feed the storm cells and strikes of a sim snapshot (undefined leaves the visuals as they are; an empty array clears the cells).
   * `speed` is the sim speed multiplier: thunder arrives after distance / 343 s at 1x and at once from 10x.
   */
  setStorms(storms: Float32Array | undefined, strikes: Float32Array | undefined, speed = 1): void {
    this.storms.setSnapshot(storms, strikes, speed);
    // -1 is the worker's "skipping to the next event" (flat out, far past 100x)
    this.simSpeed = speed < 0 ? 100 : speed;
  }

  /** Register a per-frame callback. Returns an unsubscribe function. */
  onFrame(cb: (dt: number, t: number) => void): () => void {
    this.frameCbs.push(cb);
    return () => { this.frameCbs = this.frameCbs.filter((f) => f !== cb); };
  }

  /** Register a callback that runs once per frame after every camera move and before the scene is drawn (r-perf: per-instance culling). */
  onPreRender(cb: () => void): () => void {
    this.preRenderCbs.push(cb);
    return () => { this.preRenderCbs = this.preRenderCbs.filter((f) => f !== cb); };
  }

  /**
   * Build every shader program in one burst and wait for the GPU driver to finish them, before the first real frame (r-startup).
   * Three links a program the first time something that needs it is drawn, and ANGLE on D3D11 compiles one program at a time in
   * the GPU process in that order: a cold start took 30 to 70 s. With KHR_parallel_shader_compile enabled and all the links issued
   * before any draw, the driver compiles them on its worker threads at once. Two steps: `compile` covers every material in the
   * scene (also the ones whose instances do not exist yet), then one dry frame (draw calls replaced by no-ops) creates what only
   * a frame creates: the shadow depth programs, the ambient occlusion, fog, grade and output passes. Then the programs are polled
   * until linked, so the page stays responsive (the title card) while the driver works. Nothing is drawn and no sim state is read.
   */
  async prime(maxWaitMs = 90000): Promise<void> {
    const r = this.renderer;
    const gl = r.getContext() as WebGL2RenderingContext;
    gl.getExtension('KHR_parallel_shader_compile');
    mark('prime_start');
    this.compileScene();
    mark('prime_compiled');
    // wait for the big batch first (the main thread stays free), so the dry frame below only meets programs that are already done
    await this.programsReady(maxWaitMs);
    mark('prime_compiled_ready');
    const draws = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'] as const;
    const noop = (): void => {};
    for (const n of draws) (gl as unknown as Record<string, unknown>)[n] = noop;
    try {
      if (new URLSearchParams(location.search).get('dryframe') !== '0') this.post.render(0);
    } finally {
      for (const n of draws) delete (gl as unknown as Record<string, unknown>)[n];
    }
    this.post.grade.resetAdapt(); // (the dry frame metered a blank picture)
    r.setRenderTarget(null);
    mark('prime_issued');
    await this.programsReady(maxWaitMs);
    mark('prime_done');
  }

  /** Start the driver compiling one object's programs now (the HDR scene target stands in for the real one: any render target gives the same programs). */
  compileEarly(obj: THREE.Object3D): void {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.renderer.setRenderTarget(rt);
    this.renderer.compile(obj, this.camera, this.scene);
    this.renderer.setRenderTarget(null);
    rt.dispose();
  }

  /**
   * Create the programs of every material in the scene without drawing (and so without waiting for any of them), in the state the
   * frame will draw them in (the HDR scene target), plus the programs of the custom shadow depth materials: three only makes those
   * inside the shadow pass, one at a time. Safe to call again after more layers are added: programs that exist are reused.
   */
  compileScene(): void {
    const r = this.renderer;
    r.setRenderTarget(this.post.scenePass.rt);
    r.compile(this.scene, this.camera);
    // A shadow caster is drawn with its depth material, which three first gives the caster's own material's side (flipped), alpha map,
    // alpha test and map (WebGLShadowMap.getDepthMaterial). Do the same here, then compile that mesh with the depth material swapped in
    // (same geometry, same instancing), once per distinct combination, so the program that gets made is the one the shadow pass wants.
    const seen = new Set<string>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      const d = m.isMesh && m.castShadow ? m.customDepthMaterial : undefined;
      if (!d) return;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial | undefined;
      if (!mat) return;
      const inst = m as THREE.InstancedMesh;
      const shadowSide = mat.shadowSide ?? (mat.side === THREE.FrontSide ? THREE.BackSide : mat.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
      const alphaTest = mat.alphaToCoverage ? 0.5 : mat.alphaTest;
      const sig = `${d.uuid}|${shadowSide}|${alphaTest > 0}|${!!mat.map}|${!!mat.alphaMap}|${inst.isInstancedMesh ? (inst.instanceColor ? 2 : 1) : 0}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      const dm = d as THREE.MeshDepthMaterial;
      dm.visible = mat.visible; dm.side = shadowSide; dm.alphaMap = mat.alphaMap; dm.alphaTest = alphaTest; dm.map = mat.map;
      const own = m.material;
      m.material = d;
      try { r.compile(m, this.camera, this.scene); } finally { m.material = own; }
    });
    r.setRenderTarget(null);
  }

  /** Resolves when every shader program built so far has finished linking in the driver (or after maxWaitMs). */
  private async programsReady(maxWaitMs: number): Promise<void> {
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const poll = (): void => {
        let pending = 0;
        for (const p of this.renderer.info.programs ?? []) if (!(p as unknown as { isReady(): boolean }).isReady()) pending++;
        if (pending === 0 || performance.now() - t0 > maxWaitMs) resolve();
        else setTimeout(poll, 20);
      };
      poll();
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.startedAt = this.last;
    const loop = (now: number) => {
      if (!this.running) return;
      // (the first callback's timestamp can be older than the performance.now() in start() when the main thread was busy just before,
      // as after prime(): a negative dt sent the eased weather state to NaN and the first frames black)
      const ms = Math.max(0, now - this.last);
      if (frameMs.length < 120) frameMs.push(Math.round(ms));
      this.adaptScale(ms, now);
      const dt = Math.min(0.1, ms / 1000);
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
    this.cutFx.update(dt); // (after the director, which may have just started a dip)
    this.post.setDip(this.cutFx.level);
    this.smoke.update(dt, this.camera);
    this.storms.update(dt, this.camera, this.env);
    this.updateEnvState(dt);
    this.fireflies.update(fireflyAmount(this.env.season, this.lighting.sunElDeg, this.rainSm, this.sm.overcast, this.env.warmth), this.renderer.domElement.height, this.camera.fov);
    this.camera.updateMatrixWorld();
    for (const cb of this.preRenderCbs) cb();
    this.post.render(dt);
    this.firstFrame = false;
  }

  /** Hold 60 fps on big or high-DPI screens: the render scale steps down when frames run long and creeps back up. */
  autoScale = true;
  /** Called once when the render scale is at its floor and frames still run long on High quality (the game drops to Medium). */
  onStruggle: (() => void) | null = null;
  private startedAt = 0;
  private renderScale = 1;
  private basePixelRatio = 1;
  private slowMs = 0;
  private fastMs = 0;
  private lastScaleT = 0;
  private ceilingScale = 1;

  private adaptScale(frameMs: number, now: number): void {
    if (!this.autoScale || frameMs > 250 || (typeof document !== 'undefined' && document.hidden)) return;
    if (frameMs > 19.5) { this.slowMs += frameMs; this.fastMs = 0; }
    else { this.fastMs += frameMs; this.slowMs = Math.max(0, this.slowMs - frameMs * 0.5); }
    if (now - this.lastScaleT < 3000) return;
    // already at the lowest render scale and still slow for a good while: the picture quality itself has to come down (once)
    // (not in the first 40 s: the opening frames upload textures and settle the herds, and are slow on any machine)
    if (this.slowMs > 6000 && this.renderScale <= 0.6 + 1e-3 && this.quality === 'high' && this.onStruggle && now - this.startedAt > 40000) {
      const cb = this.onStruggle;
      this.onStruggle = null;
      this.slowMs = 0;
      this.lastScaleT = now;
      cb();
      return;
    }
    if (this.slowMs > 2000 && this.renderScale > 0.6) {
      // remember where it struggled, so it doesn't bounce straight back up into the same wall
      this.ceilingScale = this.renderScale;
      this.setRenderScale(Math.max(0.6, this.renderScale - 0.1), now);
    } else if (this.fastMs > 15000 && this.renderScale < 1) {
      if (this.renderScale + 0.1 <= this.ceilingScale - 1e-3 || this.fastMs > 60000) this.setRenderScale(Math.min(1, this.renderScale + 0.1), now);
    }
  }

  private setRenderScale(s: number, now: number): void {
    this.renderScale = s;
    this.lastScaleT = now;
    this.slowMs = 0;
    this.fastMs = 0;
    this.renderer.setPixelRatio(this.basePixelRatio * s);
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const high = q === 'high';
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25);
    this.renderer.setPixelRatio(this.basePixelRatio * this.renderScale);
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
    this.flood.dispose();
    this.trees.dispose();
    this.sky.dispose();
    this.cloudShadow.dispose();
    this.smoke.dispose();
    this.fireflies.dispose();
    this.dustStorm.dispose();
    this.hoppers.dispose();
    this.beaverWorks.dispose();
    this.storms.dispose();
    this.vegTexture.dispose();
    this.snowDepth.dispose();
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
    const overTarget = w === 3 ? 0.95 : w === 1 ? 0.8 + 0.15 * env.rain : w === 4 ? 0.55 + 0.35 * this.post.blizzard : 0; // (snow falls from a grey sky; a blizzard closes the sky right over: a flat white overcast)
    // visible rain (streaks in the grade pass): rain and storm only, building at once rather than with the sim's slow rain value
    const rainTarget = w === 3 ? 1 : w === 1 ? 0.55 + 0.45 * env.rain : 0;
    const snowTarget = w === 4 ? 1 : 0;
    const wetTarget = w === 1 || w === 3 ? clamp(0.55 + env.rain, 0, 1) : w === 4 ? 0.2 : 0;
    let simTicks: number;
    if (this.firstFrame) simTicks = 1e6;
    else if (env.tick === 0) simTicks = dt * 10;
    else {
      const d = env.tick - this.lastTick;
      if (d >= 5000) { this.tickPool = 0; simTicks = 1e6; }
      else if (d < 0) { this.tickPool = 0; simTicks = 0; }
      else {
        // the worker delivers ticks in chunks: spread each chunk over about a tenth of a second instead of capping it,
        // so the weather state never falls behind the valley's calendar at a low frame rate or at 100x
        this.tickPool += d;
        simTicks = this.tickPool * (1 - Math.exp(-dt / 0.1));
        this.tickPool -= simTicks;
      }
    }
    this.lastTick = env.tick;
    // sim-time easing, but never faster than a floor in real seconds, so 10x or 100x fast-forward still shows snow settling
    // and melting instead of snapping
    // the easing times are tuned for 600-tick seasons; a shorter valley year (calendarScale) shortens them alike
    const cal = SEASON_TICKS / 600;
    const ease = (cur: number, target: number, tau: number, minReal = 0) => {
      const kSim = simTicks / (tau * cal);
      // the real-time floor keeps 10x from snapping, but at 100x it must not let snow trail its season by months:
      // cap the floor so the lag never exceeds about 200 ticks of valley time
      const floor = minReal > 0 && simTicks > 0 ? Math.min(minReal, (200 * cal * dt) / simTicks) : minReal;
      const kReal = floor > 0 && !this.firstFrame ? dt / floor : Infinity;
      return cur + (target - cur) * (1 - Math.exp(-Math.min(kSim, kReal)));
    };
    const overPrev = sm.overcast, rainPrev = this.rainSm;
    sm.overcast = ease(sm.overcast, overTarget, overTarget > sm.overcast ? 60 : 160);
    // (the real-time floors keep a fast-forward, where the weather turns every few seconds, from blinking the rain, its haze and the wet look on and off)
    this.rainSm = ease(this.rainSm, rainTarget, rainTarget > this.rainSm ? 25 : 70, rainTarget > this.rainSm ? 1.5 : 3);
    // slew limit in real time (a full swing takes 2.5 s at the fastest): at 10x and 100x, where the weather turns every second or so, the sky,
    // the rain and its haze follow it as a swell and not a flicker. Never binding at 1x (the eases above are slower than this).
    if (!this.firstFrame && dt > 0) {
      const lim = (cur: number, prev: number, rate: number): number => prev + clamp(cur - prev, -rate * dt, rate * dt);
      sm.overcast = lim(sm.overcast, overPrev, 0.4);
      this.rainSm = lim(this.rainSm, rainPrev, 0.4);
    }
    if (rainTarget === 0 && this.rainSm < 0.02) this.rainSm = 0;
    this.storms.updateRainbow(this.rainSm, simTicks, w);
    // drought dust for the aerial haze (weather 2), eased slowly so the valley hazes over and clears with the dry spell
    this.dustSm = ease(this.dustSm, w === 2 ? 1 : 0, 120);
    if (w !== 2 && this.dustSm < 0.02) this.dustSm = 0;
    // S12 dust storm: the eased storm level at the camera (0 and untouched without the sim's dust field)
    const focus0 = this.cam.getFocus(this._focus);
    this.dustStorm.update(dt, focus0.x, focus0.z, this.cam.distance, clamp(1.2 / Math.max(1, this.simSpeed / 2), 0.25, 1.2), this.firstFrame);
    const storm = this.dustStorm.amount;
    // the slow climate: eased in real seconds (about 2.5 s, 3 s for a megadrought), so a century at 100x swells and ebbs without a pop
    {
      const cTarget = clamp(env.climate ?? 0, -1, 1);
      const mTarget = this.megadrought && cTarget < 0 ? 1 : 0;
      if (cTarget !== 0) this.climateOn = true;
      this.climSm = this.firstFrame ? cTarget : this.climSm + (cTarget - this.climSm) * (1 - Math.exp(-dt / 2.5));
      this.megaSm = this.firstFrame ? mTarget : this.megaSm + (mTarget - this.megaSm) * (1 - Math.exp(-dt / 3));
      if (cTarget === 0 && Math.abs(this.climSm) < 0.002) this.climSm = 0;
      if (mTarget === 0 && this.megaSm < 0.01) this.megaSm = 0;
      // quiet inside |index| < 0.2 (and nearly so up to 0.3), full at 0.9; a megadrought pushes the dry look on to its limit
      this.dryLook = Math.min(1, 0.8 * smoothstep(0.2, 0.9, -this.climSm) + 0.25 * this.megaSm);
      this.wetLook = smoothstep(0.2, 0.9, this.climSm);
      // (r-spring-v1: rain washes the dust out of the air, and a dormant winter ground has no dust to raise: the dry-years haze stands down in both)
      const winterNow = winterK(env.season) * (1 - this.lapseSm * (1 - LAPSE_SWING));
      this.dryAir = (1 - 0.9 * this.rainSm) * (1 - SPRING.winter * winterNow);
      this.winterNow = winterNow;
      sm.dry = this.dryLook * this.dryAir;
    }
    this.post.dust = Math.max(this.dustSm, 0.85 * storm, (0.5 * this.dryLook + 0.12 * this.megaSm) * this.dryAir);
    this.post.dustStorm = storm;
    u.drought.value = Math.max(this.dustSm, this.dryLook);   // (the ground and blade shaders' straw bleach, season.ts DROUGHT; a dry run of years rides it too; eased for the season right after applySeason below)
    CLIMATE_GRADE.wet = this.wetLook;
    CLIMATE_GRADE.dry = this.dryLook;
    CLIMATE_GRADE.mega = this.megaSm;
    u.wetYears.value = this.wetLook;
    sm.snow = ease(sm.snow, snowTarget, snowTarget > sm.snow ? 320 : 220, snowTarget > sm.snow ? 7 : 9);
    sm.wet = ease(sm.wet, wetTarget, wetTarget > sm.wet ? 90 : 200);
    // R2 falling snow and dawn fog: flakes follow the weather quickly; the dawn mist reads the night just past from the env
    {
      const prev = this.snowfallSm;
      this.snowfallSm = ease(this.snowfallSm, snowTarget, snowTarget > this.snowfallSm ? 20 : 45, 3);
      if (!this.firstFrame && dt > 0) this.snowfallSm = prev + clamp(this.snowfallSm - prev, -0.4 * dt, 0.4 * dt);   // (the same real-time slew limit as the rain)
    }
    if (snowTarget === 0 && this.snowfallSm < 0.02) this.snowfallSm = 0;
    this.post.trackNight(env, simTicks, this.rainSm);
    // the eased values only approach their targets asymptotically: snap the last trace to zero so no ghost snow or frost lingers
    if (snowTarget === 0 && sm.snow < 0.03) sm.snow = 0;
    if (wetTarget === 0 && sm.wet < 0.02) sm.wet = 0;

    // fast-forward softening: eases in over about a third of a second above 10x and back out within a second at 1x
    const fastTarget = 0.7 * smoothstep(4, 9, this.simSpeed) + 0.3 * smoothstep(40, 90, this.simSpeed);
    if (this.firstFrame) this.fastSm = fastTarget;
    else this.fastSm += (fastTarget - this.fastSm) * (1 - Math.exp(-dt / (fastTarget > this.fastSm ? 0.3 : 0.25)));
    if (fastTarget === 0 && this.fastSm < 0.01) this.fastSm = 0;
    const fast = this.fastSm;
    // the sun's clock: the snapshot's dayFrac steps once per snapshot, which at 100x is a few degrees of sun per step. While fast it is
    // low-passed per frame (around the day's wrap), and it hands back to the exact clock as the softening fades out
    let atmoEnv: EnvState = env;
    if (fast > 0 || !Number.isNaN(this.dayDisp)) {
      let d = this.dayDisp;
      const diff = Number.isNaN(d) ? 0 : ((env.dayFrac - d + 1.5) % 1) - 0.5;
      if (Number.isNaN(d) || this.firstFrame || fast === 0 || Math.abs(diff) > 0.3) d = env.dayFrac;
      else d += diff * (1 - Math.exp(-dt / (0.02 + 0.1 * Math.min(1, fast * 1.5))));
      d = ((d % 1) + 1) % 1;
      this.dayDisp = fast === 0 ? NaN : d;
      if (fast > 0) {
        Object.assign(this.envDisp, env);
        // time-lapse: settle the light on LAPSE_DAY (the short way round the clock), eased in real time
        const hold = this.climateOn ? smoothstep(30, 70, this.simSpeed) : 0;
        this.holdSm = this.firstFrame ? hold : this.holdSm + (hold - this.holdSm) * (1 - Math.exp(-dt / 0.7));
        if (hold === 0 && this.holdSm < 0.005) this.holdSm = 0;
        this.envDisp.dayFrac = this.holdSm > 0 ? ((((d + (((LAPSE_DAY - d + 1.5) % 1) - 0.5) * this.holdSm) % 1) + 1) % 1) : d;
        atmoEnv = this.envDisp;
      }
    }
    if (this.sunHold && fast === 0) {
      const diff = Number.isNaN(this.shotSun) ? 0 : ((env.dayFrac - this.shotSun + 1.5) % 1) - 0.5;
      // a new shot (the cut's dark), the first frame, or a jump (a skip to an event) takes the true clock; otherwise creep toward it
      if (Number.isNaN(this.shotSun) || this.firstFrame || this.cutFx.dark || Math.abs(diff) > 0.35) this.shotSun = env.dayFrac;
      else this.shotSun = (((this.shotSun + diff * (1 - Math.exp(-dt / 25))) % 1) + 1) % 1;
      Object.assign(this.envDisp, env);
      this.envDisp.dayFrac = this.shotSun;
      atmoEnv = this.envDisp;
    } else this.shotSun = NaN;
    computeAtmosphere(atmoEnv, sm, u, this.lighting);
    if (storm > 0.002) this.applyDustStorm(storm);
    const bzK = this.post.blizzard;
    if (bzK > 0.002) this.applyBlizzard(bzK);
    // a downpour: the share of the rain above a light one's, so a light rain is drawn exactly as it was
    const heavyRain = smoothstep(0.62, 1.0, this.rainSm);
    // (r-spring-v1: any real rain, not only a downpour, cools the sky and the haze to grey-blue: a light rain under a warm morning sky read brown-olive)
    const coolRain = smoothstep(0.1, 0.7, this.rainSm);
    if (heavyRain > 0.002 || coolRain > 0.002) this.applyRain(heavyRain, coolRain);
    if (fast > 0) {
      // the key light's direction is the harshest part of a fast-forward: it laps the sky (and swings through the zenith where the
      // moon takes over) faster than a shadow can read. The sky and the sun disc keep their true motion; the light that casts the
      // shadows settles toward a steady, fairly high afternoon direction as the speed rises.
      HOLD_DIR.set(Math.sin(HOLD_AZ) * Math.cos(HOLD_EL), Math.sin(HOLD_EL), Math.cos(HOLD_AZ) * Math.cos(HOLD_EL));
      u.lightDir.value.lerp(HOLD_DIR, 0.88 * fast).normalize();
    }
    // r-lapse: the share of the seasonal swing kept (1 at 1x and 10x) and of the snowpack (1 likewise); eased in real time, outside the fast block so it can never go stale
    const lapseT = this.climateOn && this.lapseEnabled ? smoothstep(30, 70, this.simSpeed) : 0;
    this.lapseSm = this.firstFrame ? lapseT : this.lapseSm + (lapseT - this.lapseSm) * (1 - Math.exp(-dt / 0.9));
    if (lapseT === 0 && this.lapseSm < 0.004) this.lapseSm = 0;
    const swingK = 1 - this.lapseSm * (1 - LAPSE_SWING);
    const snowK = 1 - this.lapseSm * (1 - LAPSE_SNOW);
    u.seasonKeep.value = swingK;
    this.applySeason(env.season);
    // the dry-years ground bleach eases off in spring (the prairie still greens up in a dry year, the straw comes with the cure).
    // u.cure is the lapse-damped cure applySeason just wrote.
    u.drought.value = Math.max(this.dustSm, this.dryLook * (1 - SPRING.drought * springK(u.cure.value)));
    const winter =smoothstep(2.4, 3.1, u.season.value) * (1 - smoothstep(3.55, 3.95, u.season.value));
    const frostTime = 1 - smoothstep(0.36, 0.5, env.dayFrac) * (1 - smoothstep(0.62, 0.74, env.dayFrac));
    const frostTarget = winter * frostTime * (1 - 0.6 * env.warmth) * swingK;
    this.frostSm = this.firstFrame ? frostTarget : this.frostSm + (frostTarget - this.frostSm) * (1 - Math.exp(-simTicks / (90 * cal)));
    if (frostTarget === 0 && this.frostSm < 0.01) this.frostSm = 0;
    u.frost.value = this.frostSm;
    // effective snow: the weather's own snowfall, or the seasonal pack that lies on a deep-winter valley even when it is not snowing
    // (the pack follows the calendar directly; it is a slow curve, so it needs no easing of its own)
    // (the calendar's pack curve is slow at 1x but at 10x and 100x it crosses 0 to 0.3 in a second or less: it is eased with a real-time floor of
    // about 0.9 s per e-fold, so the cover arrives over two to three seconds whatever the speed; it follows the calendar's own pace when that is slower)
    const packTarget = keyCurve(PACK_KEYS, u.season.value);
    this.packSm = ease(this.packSm, packTarget, 1, 0.9);
    if (packTarget === 0 && this.packSm < 0.004) this.packSm = 0;
    u.snow.value = Math.max(sm.snow, this.packSm) * snowK;
    // S11: with the sim's per-cell depth field the shaders read the local depth instead (the seasonal pack is the sim's own now);
    // a falling snowfall still contributes a floor so a blizzard shows before the depth has built
    this.snowDepth.update(dt);
    this.flood.update(dt);
    u.snowDepthOn.value = this.snowDepth.on ? 1 : 0;
    this.snowDepth.gain = snowK;
    u.snowDepthFall.value = 0.35 * this.snowfallSm * snowK;
    u.rain.value = this.rainSm;
    // the streak volume (rain.ts) reads as rain from a side-on view; looking steeply down (the map view) it would be a scatter of
    // dashes in front of the lens, so it fades out there and the wet ground carries the rain alone (it also thins with altitude)
    const down = -this.camera.getWorldDirection(this.rainDir).y;
    this.lighting.rain = this.rainSm * (1 - smoothstep(0.62, 0.9, down));
    u.wet.value = sm.wet;
    u.rock.value.copy(ROCK_COLOR);

    const L = this.lighting;
    // lights
    // under cloud the sun is a soft glow: shadows lose their edge and most of their depth
    // fast-forward: a softer, more diffuse rig. The key light gives up a share to the sky (so every shadow, hill, cloud or tree, loses
    // contrast alike), the shadow map's edge widens and its depth drops. All of it is exactly zero at 1x.
    const softKey = 1 - 0.38 * fast;
    u.lightColor.value.multiplyScalar(softKey);
    this.sun.shadow.intensity = 0.92 * (1 - 0.82 * sm.overcast) * (1 - 0.55 * fast) * (1 - 0.7 * storm) * (1 - 0.6 * bzK);
    this.sun.shadow.radius = 1.8 + 2.4 * sm.overcast + 3.2 * fast + 3 * storm;
    this.sun.position.copy(u.lightDir.value);
    this.sun.color.copy(u.lightColor.value);
    this.sun.intensity = 1;
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    // a lightning flash lifts the ambient for a few frames
    this.hemi.intensity = L.hemiIntensity * (1 + 2.2 * this.storms.flash) * (1 + 0.4 * fast);
    this.renderer.toneMappingExposure = L.exposure * this.exposure;

    // Shadow range follows how far the camera looks: tight when low and close, whole valley when high. The cascade split and
    // texel size depend on the range and on the camera's near plane, so a value that creeps with every frame makes every shadow
    // texel swim. Both snap to a few fixed steps (with hysteresis), so shadows hold still while the camera moves and re-fit
    // only when it really changes scale.
    const rawRange = clamp(this.cam.distance * 1.7 + 80, 140, 900);
    {
      let i = this.rangeIdx;
      while (i < SHADOW_RANGES.length - 1 && rawRange > SHADOW_RANGES[i]) i++;
      while (i > 0 && rawRange < SHADOW_RANGES[i - 1] * 0.9) i--;
      this.rangeIdx = i;
      const range = SHADOW_RANGES[i];
      if (range !== this.shadowRange) {
        this.shadowRange = range;
        this.sun.shadow.camera.far = range;
      }
    }

    // dynamic near plane keeps depth precision good from ground level to the wide view (stepped, same reason)
    const camY = this.camera.position.y;
    const aboveGround = Math.max(0, camY - this.terrain.heightAt(this.camera.position.x, this.camera.position.z));
    const rawNear = clamp(0.25 + aboveGround * 0.02, 0.25, 5);
    {
      let i = this.nearIdx;
      while (i < NEAR_STEPS.length - 1 && rawNear > NEAR_STEPS[i + 1] * 1.15) i++;
      while (i > 0 && rawNear < NEAR_STEPS[i] * 0.85) i--;
      this.nearIdx = i;
      const near = NEAR_STEPS[i];
      if (near !== this.lastNear) {
        this.lastNear = near;
        this.camera.near = near;
        this.camera.far = 9000;
        this.camera.updateProjectionMatrix();
      }
    }
    this.sky.follow(this.camera);
    this.trees.setShadowRange(this.shadowRange); // R11: far trees stop casting shadows past the sun-shadow range
    this.trees.update(this.camera.position);

    // canopy occlusion fade: keep the watched point visible when close in (follow cam, herd framing, low views)
    {
      const dist = this.cam.distance;
      const focus = this.cam.getFocus(this._focus);
      u.occCam.value.copy(this.camera.position);
      u.occFocus.value.set(focus.x, focus.y + 0.5, focus.z);
      // (the porthole through the canopy to the watched point was a pinhole at the usual 20 to 40 m shots; a wider one reads as a clearing)
      // (r-regress: the 0.06 / 2.2 to 7 version with a tight 0.5 to 1.35 falloff read as a round black window in the canopy from 40 to 60 m,
      // a "giant black sphere" in the round-18 video review. Back near the old size with a small clear core and a long soft falloff: the
      // leaves thin out toward the watched line instead of ending at a hard ring.)
      const r = clamp(dist * 0.048, 1.8, 5.5);
      u.occParams.value.set(r * 0.35, r * 2.0, this.occlusionFade ? 1 - smoothstep(110, 175, dist) : 0);
    }

    this.terrain.updateShadow(this.renderer, u.lightDir.value);
    this.cloudShadow.update(this.renderer, dt, this.firstFrame);
    this.hoppers.update(dt, focus0.x, focus0.z, this.camera.position.x, camY, this.camera.position.z, camY - aboveGround, this.renderer.domElement.height, this.camera.fov);
    // a sim-announced blizzard lays a gale over the snowfall (see noteBlizzard); it eases in about 2 s and out about 5 s of real time
    if (env.tick < this.bzLastTick - 1) this.blizzardUntil = -1;   // the calendar went backward (a new valley, a reload): the old event is over
    this.bzLastTick = env.tick;
    const bzTarget = env.weather === 4 && env.tick < this.blizzardUntil ? 1 : 0;
    this.bzWindSm = this.firstFrame ? bzTarget : this.bzWindSm + (bzTarget - this.bzWindSm) * (1 - Math.exp(-dt / (bzTarget > this.bzWindSm ? 2 : 5)));
    if (bzTarget === 0 && this.bzWindSm < 0.004) this.bzWindSm = 0;
    if (env.tick >= this.blizzardUntil) this.blizzardUntil = -1;
    const wsNow = clamp(env.windStrength, 0, 1);
    this.post.updateSnow(dt, this.snowfallSm * snowK, env, aboveGround, L, wsNow + (Math.max(wsNow, 0.88) - wsNow) * this.bzWindSm);
    this.post.updateRain(dt, L.rain, env, aboveGround, L, heavyRain);
    this.post.apply(L);
  }

  /**
   * A dust storm at strength `a` (0..1 at the camera): the sky and the haze go brown-ochre at about the brightness they had, the sun is
   * dimmed and turned red-orange (a disc seen through dust), the ambient light follows, and the sun disc and glow fade. The fog's own
   * density and colour are in the post pass (post.dustStorm). Called right after computeAtmosphere, so it only ever lays over that frame.
   */
  private applyDustStorm(a: number): void {
    const u = this.uniforms, L = this.lighting;
    const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const k = Math.min(1, a * 1.15);
    const tint = (c: THREE.Color, r: number, g: number, b: number, dim: number): void => {
      const o = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      c.lerp(DUST_TMP.setRGB(r, g, b).multiplyScalar(lum(c) * dim / o), k);
    };
    // ochre, normalised below to the luminance of the colour it replaces
    tint(u.skyHorizon.value, 0.62, 0.40, 0.2, 0.74);
    tint(u.skyMid.value, 0.5, 0.33, 0.18, 0.62);
    tint(u.skyZenith.value, 0.4, 0.27, 0.16, 0.52);
    tint(u.sunGlow.value, 0.7, 0.42, 0.18, 0.7);
    u.sunDiskColor.value.multiplyScalar(1 - 0.8 * k);
    tint(L.hemiSky, 0.55, 0.4, 0.24, 0.9);
    tint(L.hemiGround, 0.5, 0.36, 0.2, 0.9);
    L.hemiIntensity *= 1 - 0.18 * k;
    // the key light: dimmed hard and reddened
    u.lightColor.value.multiply(DUST_TMP.setRGB(1 - 0.6 * k, 1 - 0.72 * k, 1 - 0.84 * k));
    L.exposure *= 1 + 0.18 * k;   // the eye adapts: not as dark as the light meter says
    L.gradeSat -= 0.1 * k;
    L.gradeContrast -= 0.08 * k;
  }

  /**
   * A blizzard at strength `a` (0..1): the light goes flat. The key light is dimmed (the sun is a faint disc behind the snow, its shadows
   * nearly gone, see the sun's shadow intensity), the sky light carries a little more of the picture, and the grade loses some contrast and
   * colour, so the white of the air and the snow close to the same value. The fog's density and colour and the streaks are in the post pass.
   */
  private applyBlizzard(a: number): void {
    const u = this.uniforms, L = this.lighting;
    u.lightColor.value.multiplyScalar(1 - 0.55 * a);
    u.sunDiskColor.value.multiplyScalar(1 - 0.85 * a);
    L.hemiIntensity *= 1 + 0.22 * a;
    L.exposure *= 1 + 0.1 * a;
    L.gradeSat -= 0.1 * a;
    L.gradeContrast -= 0.1 * a;
  }

  /**
   * A downpour at strength `a` (0..1, the share of the rain above a light one's): the sky and the ambient light darken and go grey-blue, the
   * sun disc and glow go out, the grade loses colour (the eye adapts a little, so it is dim and not black). Milder at night, which is
   * dark already. The haze and the streaks are in the post pass. Called right after computeAtmosphere, so it only ever lays over that frame.
   */
  private applyRain(a: number, cool = a): void {
    const u = this.uniforms, L = this.lighting, t = this.rainTmp;
    const day = smoothstep(-8, 10, L.sunElDeg);
    const k = a * (0.5 + 0.5 * day);
    // the cool share (sky, haze and ambient colour) rides the lighter rain too; the dimming below stays with the downpour
    const kc = Math.max(k, cool * (0.65 + 0.35 * day));
    const grey = (c: THREE.Color, dim: number): void => {
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      c.lerp(t.setRGB(0.92, 0.97, 1.08).multiplyScalar(lum * dim), 0.8 * kc);
    };
    grey(u.skyHorizon.value, 0.8);
    grey(u.skyMid.value, 0.7);
    grey(u.skyZenith.value, 0.62);
    u.sunGlow.value.multiplyScalar(1 - 0.9 * k);
    u.sunDiskColor.value.multiplyScalar(1 - 0.9 * k);
    u.lightColor.value.multiplyScalar(1 - 0.35 * k);
    L.hemiIntensity *= 1 - 0.42 * k;
    L.hemiSky.lerp(t.setRGB(0.55, 0.62, 0.74), 0.25 * kc);
    L.exposure *= 1 + 0.08 * k;
    L.gradeSat -= 0.26 * k;
    L.gradeContrast -= 0.04 * k;
  }

  private applySeason(season: number): void {
    this.writeSeason(season);
    const u = this.uniforms;
    if (this.lapseSm > 0.002) {
      // time-lapse (r-lapse): write the steady growing-season look, then pull it toward the real season by the kept share of the swing
      const sw = u.seasonKeep.value, snap = this.lapseSnap;
      LAPSE_COLS.forEach((k, i) => { (snap.cols[i] ??= new THREE.Color()).copy(u[k].value); });
      LAPSE_NUMS.forEach((k, i) => { snap.nums[i] = u[k].value; });
      this.writeSeason(LAPSE_SEASON);
      // (the crowns' autumn gold is the most vivid thing in the valley and blinks the loudest, so the leaf colours keep a smaller share)
      LAPSE_COLS.forEach((k, i) => { u[k].value.lerp(snap.cols[i], k.startsWith('leafColor') ? sw * 0.6 : sw); });
      LAPSE_NUMS.forEach((k, i) => { u[k].value = lerp(u[k].value, snap.nums[i], sw); });
    }
    if (this.dryLook > 0) {
      // a dry run of years: cottonwood crowns thin a little (the crown colour is left alone: the tree shader reads the leaf colour's red-to-green ratio as the season)
      u.leafAmount.value *= 1 - 0.2 * this.dryLook;
    }
    this.trees.setLeafAmount(u.leafAmount.value);
  }

  private writeSeason(season: number): void {
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
    u.leafAmount.value = keyCurve(LEAF_KEYS, s);

    // terrain grass color = the blade layer's own palette (probes into grassTint, see grass.ts), so ground and blades match
    const cure = keyCurve(CURE_KEYS, s);
    u.cure.value = cure;
    grassTint(s, 1.5, 1.0, u.grassGreen.value);
    grassTint(s, 0.0, 0.0, u.grassDry.value);
    // undo the ridge tint that grassTint bakes into the dry probe (the terrain shader re-applies it per fragment)
    u.grassDry.value.r /= 1.08; u.grassDry.value.g /= 0.93; u.grassDry.value.b /= 0.84;
  }
}
