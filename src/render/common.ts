// Shared render contract: uniforms every layer can reference, GLSL snippets, and the terrain-shadow
// injector that other materials (grass, animals) can use so they receive hill shadows too.
import * as THREE from 'three';

export interface U<T> { value: T }

/**
 * Values shared by every material. Reference the objects (not copies) in your own ShaderMaterial uniforms,
 * e.g. `uniforms: { uTime: engine.uniforms.time, uSunDir: engine.uniforms.sunDir }`.
 */
export interface SharedUniforms {
  /** Seconds since start (real time, not sim time). */
  time: U<number>;
  /** 0..1 day fraction from EnvState. */
  dayFrac: U<number>;
  /** 0..4 continuous season from EnvState. */
  season: U<number>;
  /** Unit vector pointing toward the sun (world space, y up). Below the horizon at night. */
  sunDir: U<THREE.Vector3>;
  /** Unit vector pointing toward the moon (opposite the sun). */
  moonDir: U<THREE.Vector3>;
  /** Unit vector toward the active key light (sun by day, moon at night, blended through twilight). */
  lightDir: U<THREE.Vector3>;
  /** Linear radiance of the key light: color times intensity. Values can exceed 1. */
  lightColor: U<THREE.Color>;
  /** Wind: x, y = unit direction the wind blows toward on the ground plane (x, z), z = strength 0..1. */
  wind: U<THREE.Vector3>;
  // sky palette (linear)
  skyZenith: U<THREE.Color>;
  skyMid: U<THREE.Color>;
  skyHorizon: U<THREE.Color>;
  sunGlow: U<THREE.Color>;
  sunDiskColor: U<THREE.Color>;
  /** 0 day .. 1 deep night (stars, moon). */
  night: U<number>;
  cloud: U<number>;
  overcast: U<number>;
  // ground / season state
  greenHigh: U<number>;
  greenLow: U<number>;
  grassLush: U<THREE.Color>;
  grassCured: U<THREE.Color>;
  stubble: U<THREE.Color>;
  soil: U<THREE.Color>;
  rock: U<THREE.Color>;
  /** Fraction of leaves on deciduous trees, 0 bare .. 1 full. */
  leafAmount: U<number>;
  leafColorA: U<THREE.Color>;
  leafColorB: U<THREE.Color>;
  frost: U<number>;
  snow: U<number>;
  /** S11 snow depth field: a 32 x 32 single-channel texture (world square, linear filtered), 1 while the sim sends it (snowDepth param on), else 0. */
  snowDepthTex: U<THREE.Texture | null>;
  snowDepthOn: U<number>;
  /** Snow amount (0..1) a falling snowfall alone contributes where the field is on (0.35 x the eased snowfall), so a blizzard still shows. */
  snowDepthFall: U<number>;
  wet: U<number>;
  /** 0..1 visible rain intensity right now (eased; 0 for snow and dry weather). */
  rain: U<number>;
  /** 0..1 strength of the fear-map debug overlay on the terrain. */
  fearOverlay: U<number>;
  /** Mid-tone of living grass and of cured grass right now (linear), and how cured the field is 0..1. Same source as the grass blades. */
  grassGreen: U<THREE.Color>;
  grassDry: U<THREE.Color>;
  cure: U<number>;
  /** 0..1 drought severity, the engine's eased weather === 2 value (the same one that feeds the aerial haze's dust). Ground and blade shaders bleach to straw with it. */
  drought: U<number>;
  /** Canopy occlusion fade: camera position, the focus point being watched, and (inner radius, outer radius, strength). */
  occCam: U<THREE.Vector3>;
  occFocus: U<THREE.Vector3>;
  occParams: U<THREE.Vector3>;
  // terrain data
  worldSize: U<number>;
  /** Hill shadow map for the active light: R = visibility 0..1, covers the 512 m world, 1 m texels. */
  terrainShadow: U<THREE.Texture | null>;
  /** Coarser hill shadow map for the far ring: covers the square (x0, z0) .. (x0 + size, z0 + size) in farRect (x0, z0, size). */
  terrainShadowFar: U<THREE.Texture | null>;
  farRect: U<THREE.Vector3>;
  /** Terrain heights, R32F 257 x 257, nearest filtered (use tgHeightAt in GLSL). */
  heightTex: U<THREE.Texture | null>;
  vegTex: U<THREE.Texture | null>;
  /** Where herds have grazed and trampled recently: R8 n x n, 0 untouched .. 1 well-trodden (decays slowly). */
  trailTex: U<THREE.Texture | null>;
  /** Mean grass biomass and mean moisture over the playable valley: the far ring is tinted to match so the border never shows. */
  farStats: U<THREE.Vector2>;
  staticTex: U<THREE.Texture | null>;
  /** Cloud shadow mask (cloudshadow.ts): R = 0 clear .. 1 in the shade of a cloud, over the square (x0, z0) .. (x0 + size, z0 + size) in cloudRect (x0, z0, size). */
  cloudShadow: U<THREE.Texture | null>;
  cloudRect: U<THREE.Vector3>;
  /** Fraction of the direct sun a cloud shadow removes right now: 0 at night, under overcast and at the horizon, about 0.55 on a fair day. */
  cloudK: U<number>;
}

export function createSharedUniforms(worldSize: number): SharedUniforms {
  const c = () => ({ value: new THREE.Color() });
  return {
    time: { value: 0 },
    dayFrac: { value: 0.3 },
    season: { value: 1 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    lightDir: { value: new THREE.Vector3(0, 1, 0) },
    lightColor: c(),
    wind: { value: new THREE.Vector3(1, 0, 0.3) },
    skyZenith: c(), skyMid: c(), skyHorizon: c(), sunGlow: c(), sunDiskColor: c(),
    night: { value: 0 },
    cloud: { value: 0.3 },
    overcast: { value: 0 },
    greenHigh: { value: 0.3 },
    greenLow: { value: 0.8 },
    grassLush: c(), grassCured: c(), stubble: c(), soil: c(), rock: c(),
    leafAmount: { value: 1 },
    leafColorA: c(), leafColorB: c(),
    frost: { value: 0 },
    snow: { value: 0 },
    snowDepthTex: { value: null },
    snowDepthOn: { value: 0 },
    snowDepthFall: { value: 0 },
    wet: { value: 0 },
    rain: { value: 0 },
    fearOverlay: { value: 0 },
    grassGreen: c(), grassDry: c(), cure: { value: 0 }, drought: { value: 0 },
    occCam: { value: new THREE.Vector3() },
    occFocus: { value: new THREE.Vector3() },
    occParams: { value: new THREE.Vector3(2, 6, 0) },
    worldSize: { value: worldSize },
    terrainShadow: { value: null },
    terrainShadowFar: { value: null },
    farRect: { value: new THREE.Vector3(-768, -768, 2048) },
    heightTex: { value: null },
    vegTex: { value: null },
    trailTex: { value: null },
    farStats: { value: new THREE.Vector2(0.6, 0.46) },
    staticTex: { value: null },
    cloudShadow: { value: null },
    cloudRect: { value: new THREE.Vector3(-768, -768, 2048) },
    cloudK: { value: 0 },
  };
}

/**
 * The cloud layer's shape, shared by the sky dome (sky.ts) and the ground cloud-shadow mask (cloudshadow.ts) so the shadows are
 * cut from the same fbm, drifted by the same wind, with the same coverage threshold. Needs NOISE_GLSL (tgFbm2).
 *   tgCloudCp(d):         the sky's layer coordinate for a view direction d (y up)
 *   tgCloudQ(cp, drift):  fbm domain for a layer coordinate
 *   tgCloudDrift(w, t):   fbm-domain offset that carries the pattern DOWNWIND (w = the uWind uniform, xy = unit direction the wind
 *                         blows toward; the domain moves the opposite way, so the sign is negative), t = real seconds
 *   tgCloudThresh(c, tw): density threshold for cloudiness c (uCloud), tw = twilight lift (0 for the ground mask)
 */
export const CLOUD_GLSL = /* glsl */ `
vec2 tgCloudCp(vec3 d){ return d.xz / (d.y * 0.9 + 0.22); }
vec2 tgCloudQ(vec2 cp, vec2 drift){ return cp * vec2(0.5, 0.8) + drift; }
vec2 tgCloudDrift(vec3 w, float t){ return -w.xy * t * 0.006; }
float tgCloudThresh(float c, float tw){ return mix(0.64, 0.30, clamp(c, 0.0, 1.0)) - 0.1 * tw; }
`;

/**
 * Reading the cloud shadow mask (a plain lookup, nothing to compute): declares tTgCloud, uTgCloudRect (x0, z0, size), uTgCloudK and
 * tgCloudShadowAt(xz) = the multiplier on direct sun, 1 in the open .. 1 - K under a cloud. Used by injectTerrainShadow (terrain, trees,
 * animals) and, per blade root, by the grass vertex shader.
 */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform sampler2D tTgCloud;
uniform vec3 uTgCloudRect;
uniform float uTgCloudK;
float tgCloudShadowAt(vec2 xz){
  if (uTgCloudK < 0.002) return 1.0;
  return 1.0 - uTgCloudK * texture2D(tTgCloud, clamp((xz - uTgCloudRect.xy) / uTgCloudRect.z, 0.0, 1.0)).r;
}
`;

/** The uniforms CLOUD_SHADOW_GLSL reads, by reference from the shared set. */
export function cloudShadowUniforms(shared: Pick<SharedUniforms, 'cloudShadow' | 'cloudRect' | 'cloudK'>): Record<string, U<any>> {
  return { tTgCloud: shared.cloudShadow, uTgCloudRect: shared.cloudRect, uTgCloudK: shared.cloudK };
}

/** Hash + value noise helpers (prefixed tg to avoid clashing with three's chunks). */
export const NOISE_GLSL = /* glsl */ `
float tgHash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tgHash31(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 tgHash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float tgNoise2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = tgHash21(i), b = tgHash21(i + vec2(1.0, 0.0));
  float c = tgHash21(i + vec2(0.0, 1.0)), d = tgHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float tgNoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = tgHash31(i), n100 = tgHash31(i + vec3(1,0,0));
  float n010 = tgHash31(i + vec3(0,1,0)), n110 = tgHash31(i + vec3(1,1,0));
  float n001 = tgHash31(i + vec3(0,0,1)), n101 = tgHash31(i + vec3(1,0,1));
  float n011 = tgHash31(i + vec3(0,1,1)), n111 = tgHash31(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float tgFbm2(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * tgNoise2(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return s / 0.9375;
}
`;

/**
 * Canopy occlusion fade. Returns 1 away from the watched line of sight and fades to 0 inside a tube around the segment from
 * the camera to the focus point (only for fragments between them). Needs uniforms uOccCam, uOccFocus, uOccParams.
 */
export const OCCLUDE_GLSL = /* glsl */ `
uniform vec3 uOccCam;
uniform vec3 uOccFocus;
uniform vec3 uOccParams;
float tgOcclusionFade(vec3 wp){
  // last line of defence for the camera: foliage and bark within a few metres of the lens dissolve (the camera keeps clear of the
  // crowns, see camcollide.ts, but a lump that still reaches the lens would show the hollow shell). Always on, whatever the occlusion fade does.
  float nearK = smoothstep(1.0, 3.0, length(wp - uOccCam));
  if (uOccParams.z <= 0.001) return nearK;
  vec3 ab = uOccFocus - uOccCam;
  float l2 = max(dot(ab, ab), 1e-3);
  float t = dot(wp - uOccCam, ab) / l2;
  float between = smoothstep(-0.02, 0.0, t) * (1.0 - smoothstep(0.93, 0.995, t));
  vec3 q = uOccCam + ab * clamp(t, 0.0, 1.0);
  float d = length(wp - q);
  float hole = 1.0 - smoothstep(uOccParams.x, uOccParams.y, d);
  return (1.0 - hole * between * uOccParams.z) * nearK;
}
`;

/**
 * Bare apron on the shaded side of each pond. Cattle and wildlife trample the bank where the trees shade it and the grass gives out,
 * so one side of every pond (a fixed direction near north, wandering a little per pond, so it is the side the noon sun leaves in
 * shade) has a ragged band of bare, dusty ground between the waterline and the grass. The ground shader (terrain.ts) paints it and
 * the blade layer (grass.ts) thins its blades from the same function, so near and far field agree.
 *   uPonds[i] = (x, z, radius, direction of the apron in radians as atan(z, x));   tgPondApron(p, wd): 0..1, wd = distance to water (m)
 */
export const POND_GLSL = /* glsl */ `
uniform vec4 uPonds[3];
float tgPondH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tgPondN(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tgPondH(i), tgPondH(i + vec2(1.0, 0.0)), f.x), mix(tgPondH(i + vec2(0.0, 1.0)), tgPondH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float tgPondApron(vec2 p, float wd){
  if (wd > 8.0) return 0.0;
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 q = uPonds[i];
    vec2 d = p - q.xy;
    float rr = length(d);
    if (q.z < 1.0 || rr > q.z + 14.0) continue;
    float cw = dot(d / max(rr, 1e-3), vec2(cos(q.w), sin(q.w)));
    float n = tgPondN(p * 0.33 + q.xy * 0.017);
    float wedge = smoothstep(0.0, 0.6, cw + (n - 0.5) * 0.5);
    float width = (1.2 + 4.6 * wedge) * (0.7 + 0.6 * tgPondN(p * 0.19 + 3.0));
    a = max(a, wedge * (1.0 - smoothstep(0.4 * width, width, wd + (tgPondN(p * 0.9 + 7.0) - 0.5) * 1.4)));
  }
  return a;
}
`;

/** Pond data for POND_GLSL: x, z, radius and the apron's direction (north, wandering up to about 40 degrees per pond). Unused slots are zero. */
export function makePondUniform(ponds: ArrayLike<number>): { value: THREE.Vector4[] } {
  const v = [0, 1, 2].map(() => new THREE.Vector4(0, 0, 0, 0));
  for (let k = 0; k < 3 && k * 4 + 3 < ponds.length; k++) {
    const x = ponds[k * 4], z = ponds[k * 4 + 1];
    const wander = hash2(Math.round(x), Math.round(z), 41) - 0.5;
    v[k].set(x, z, ponds[k * 4 + 2], Math.PI / 2 + wander * 1.4);
  }
  return { value: v };
}

/** Sky gradient shared by the dome, water reflections and distance haze. Needs the sky uniforms in scope. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform vec3 uSunGlow;
vec3 tgSkyBase(vec3 d){
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uSkyMid, uSkyZenith, smoothstep(0.03, 0.9, up));
  float mu = clamp(dot(d, uSunDir), 0.0, 1.0);
  // the horizon is warm toward the sun and cooler (lavender-blue) away from it, like the belt of Venus at dusk
  vec3 horC = mix(uSkyHorizon, uSkyMid * 1.08 + vec3(0.015), 0.36 * (1.0 - clamp(mu * 1.7, 0.0, 1.0)));
  col = mix(horC, col, smoothstep(0.0, 0.40, up));
  float h = 1.0 - up;
  float glow = 0.22 * pow(mu, 3.0) + 0.5 * pow(mu, 14.0) + 1.1 * pow(mu, 90.0);
  col += uSunGlow * glow * (0.35 + 0.65 * h * h);
  // low sun: a wide warm band along the horizon, strongest on the sun's side and fading around the sky, so a dusk shot with the
  // sun out of frame still has a glowing horizon
  float lowS = smoothstep(0.55, 0.06, uSunDir.y) * smoothstep(-0.3, -0.04, uSunDir.y);
  vec2 shd = normalize(uSunDir.xz + vec2(1e-4)), dhd = normalize(d.xz + vec2(1e-4));
  float az = 0.5 + 0.5 * dot(shd, dhd);
  col += uSunGlow * lowS * (0.46 * pow(az, 3.0) + 0.2) * exp(-up * 5.2);
  return col;
}
`;

/** Terrain height lookup from the R32F height texture, triangulated exactly like the mesh. Needs tHeight, uCell, uHN. */
export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D tHeight;
uniform float uCell;
uniform float uHN;
float tgHeightAt(vec2 xz){
  vec2 f = clamp(xz / uCell, vec2(0.0), vec2(uHN - 1.001));
  ivec2 i0 = ivec2(floor(f));
  vec2 t = f - vec2(i0);
  float a = texelFetch(tHeight, i0, 0).r;
  float b = texelFetch(tHeight, i0 + ivec2(1, 0), 0).r;
  float c = texelFetch(tHeight, i0 + ivec2(0, 1), 0).r;
  float d = texelFetch(tHeight, i0 + ivec2(1, 1), 0).r;
  // same triangulation as the terrain mesh: (a, c, b) and (b, c, d)
  return (t.x + t.y <= 1.0) ? a + (b - a) * t.x + (c - a) * t.y
                            : d + (c - d) * (1.0 - t.x) + (b - d) * (1.0 - t.y);
}
`;

/**
 * Make a lit three material receive hill shadows from the horizon map (and be darkened where the active light
 * is blocked by terrain). Call inside onBeforeCompile. Works for MeshStandard/Lambert/Phong/Physical materials,
 * instanced or not. Requires `shared.terrainShadow` to be set (the Engine does this).
 */
export function injectTerrainShadow(
  shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, any> },
  shared: SharedUniforms,
): void {
  shader.uniforms.tTgShadow = shared.terrainShadow;
  shader.uniforms.tTgShadowFar = shared.terrainShadowFar;
  shader.uniforms.uTgFarRect = shared.farRect;
  shader.uniforms.uTgWorld = shared.worldSize;
  shader.uniforms.uTgOver = shared.overcast;
  Object.assign(shader.uniforms, cloudShadowUniforms(shared));
  if (!shader.vertexShader.includes('vTgShadowXZ')) {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vTgShadowXZ;\nvoid main() {')
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vTgShadowXZ = ( cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz ).xz;`,
      );
  }
  shader.fragmentShader = shader.fragmentShader
    .replace(
      'void main() {',
      `uniform sampler2D tTgShadow;
      uniform sampler2D tTgShadowFar;
      uniform vec3 uTgFarRect;
      uniform float uTgWorld;
      uniform float uTgOver;
      ${CLOUD_SHADOW_GLSL}
      varying vec2 vTgShadowXZ;
      float gTgShadow = 1.0;
      float tgSampleTerrainShadow(){
        vec2 uv = vTgShadowXZ / uTgWorld;
        vec2 qd = abs(vTgShadowXZ - 0.5 * uTgWorld) - 0.5 * uTgWorld;
        float sd = max(qd.x, qd.y);
        // blend the two maps across the border so there is no seam at the edge of the playable square
        float wIn = 1.0 - smoothstep(-20.0, 30.0, sd);
        vec2 fuv = (vTgShadowXZ - uTgFarRect.xy) / uTgFarRect.z;
        float far = texture2D(tTgShadowFar, clamp(fuv, 0.0, 1.0)).r;
        // an overcast sky has no hard hill shadows: the horizon map fades out as the cloud thickens
        float hill = mix(mix(far, texture2D(tTgShadow, clamp(uv, 0.0, 1.0)).r, wIn), 1.0, 0.85 * uTgOver);
        // drifting cloud shadows dim the direct sun on top of the hill shadows (ambient is untouched, so they never go black)
        return hill * tgCloudShadowAt(vTgShadowXZ);
      }
      void main() {`,
    )
    .replace(
      '#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin
        .replace(/getSunLightInfo\( sunLight, directLight \);/g, 'getSunLightInfo( sunLight, directLight ); directLight.color *= gTgShadow;')
        .replace(/getDirectionalLightInfo\( directionalLight, directLight \);/g, 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= gTgShadow;')
        .replace(/^/, 'gTgShadow = tgSampleTerrainShadow();\n'),
    );
}

/**
 * Final-output scrub for lit materials: a NaN or Inf in one HDR pixel spreads through bloom and blacks out the whole frame
 * (varyings interpolated outside thin triangles under MSAA are the usual cause). Call on the fragment source in onBeforeCompile.
 */
export function injectSafeOutput(fragmentShader: string): string {
  return fragmentShader
    .replace('void main() {', `vec3 tgSafeOut( vec3 c ) {
  // min/max return the non-NaN operand on the GPU, so this also turns a stray NaN into 0 (isnan() is folded away by the compiler)
  return min( max( c, vec3( 0.0 ) ), vec3( 64.0 ) );
}
void main() {`)
    .replace('#include <opaque_fragment>', `outgoingLight = tgSafeOut( outgoingLight );
#include <opaque_fragment>`);
}

export function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Cheap deterministic hash noise for CPU-side generation (value noise, not tied to the sim Rng). */
export function hash2(ix: number, iy: number, seed = 0): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function fbm2(x: number, y: number, oct = 4, seed = 0): number {
  let a = 0.5, s = 0, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise2(x, y, seed + o * 31);
    n += a;
    x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; a *= 0.5;
  }
  return s / n;
}
