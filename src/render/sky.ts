// Sky dome + the atmosphere model: EnvState (day, season, weather) -> sun/moon direction, light color,
// sky palette, ambient, exposure, haze. The same palette drives the dome, the water reflections and the
// aerial-perspective haze so everything meets cleanly at the horizon.
import * as THREE from 'three';
import { CLOUD_GLSL, NOISE_GLSL, SKY_GLSL, SharedUniforms, clamp, lerp, smoothstep } from './common';
import { STORM_SKY_GLSL, type StormUniforms } from './storms';

const C = (hex: string) => new THREE.Color(hex);

interface Key {
  el: number; // sun elevation, degrees
  zen: THREE.Color; mid: THREE.Color; hor: THREE.Color; glow: THREE.Color;
  sun: THREE.Color; sunI: number;
  hSky: THREE.Color; hGnd: THREE.Color; hI: number;
  expo: number; haze: number;
}

// Authored in sRGB, converted to linear by three. Elevation keyframes, interpolated in linear space.
// Night is a documentary "day for night": silver-blue, readable, never black (see MOON_I, hemi at el <= -14).
const KEYS: Key[] = [
  { el: -40, zen: C('#17163e'), mid: C('#2a3470'), hor: C('#5a5084'), glow: C('#c2682c'), sun: C('#000000'), sunI: 0,
    hSky: C('#6f98dc'), hGnd: C('#2e3f66'), hI: 0.66, expo: 1.42, haze: 0.5 },
  { el: -14, zen: C('#191a46'), mid: C('#2d3a78'), hor: C('#62588c'), glow: C('#c2682c'), sun: C('#000000'), sunI: 0,
    hSky: C('#6f98dc'), hGnd: C('#2e3f66'), hI: 0.7, expo: 1.42, haze: 0.6 },
  { el: -11, zen: C('#18286a'), mid: C('#384c88'), hor: C('#855a86'), glow: C('#ff7a50'), sun: C('#c8483c'), sunI: 0.1,
    hSky: C('#7088cc'), hGnd: C('#4c4050'), hI: 1.1, expo: 1.65, haze: 0.5 },
  { el: -7, zen: C('#1c326c'), mid: C('#4a5c94'), hor: C('#b07a8a'), glow: C('#ff9a60'), sun: C('#ff7038'), sunI: 0.85,
    hSky: C('#7e98d4'), hGnd: C('#6a5248'), hI: 1.35, expo: 1.7, haze: 0.5 },
  { el: -1.5, zen: C('#31529a'), mid: C('#7a8cba'), hor: C('#dca880'), glow: C('#ff9a55'), sun: C('#ffc29a'), sunI: 2.2,
    hSky: C('#8eaae2'), hGnd: C('#a88060'), hI: 1.7, expo: 1.5, haze: 0.6 },
  { el: 3, zen: C('#3a66aa'), mid: C('#8fa8c8'), hor: C('#efc796'), glow: C('#ffb060'), sun: C('#ffcb9a'), sunI: 3.7,
    hSky: C('#8eaae0'), hGnd: C('#b08850'), hI: 1.5, expo: 1.1, haze: 0.9 },
  { el: 9, zen: C('#4a7ac0'), mid: C('#a8c0d8'), hor: C('#f0d6aa'), glow: C('#ffc070'), sun: C('#ffddb0'), sunI: 5.3,
    hSky: C('#92b0e2'), hGnd: C('#b88f50'), hI: 1.3, expo: 1.0, haze: 0.9 },
  { el: 18, zen: C('#5287cc'), mid: C('#aac6dd'), hor: C('#ecdab4'), glow: C('#ffd08a'), sun: C('#ffe6c8'), sunI: 5.2,
    hSky: C('#94b4e4'), hGnd: C('#b8944f'), hI: 1.2, expo: 0.95, haze: 0.85 },
  { el: 34, zen: C('#4a86d4'), mid: C('#a4c8e6'), hor: C('#e2e4d6'), glow: C('#ffe2b0'), sun: C('#fff0dc'), sunI: 4.8,
    hSky: C('#98b8ea'), hGnd: C('#b09560'), hI: 1.2, expo: 0.9, haze: 0.8 },
  { el: 65, zen: C('#3d7fd6'), mid: C('#9cc6ea'), hor: C('#d6e4ee'), glow: C('#fff0d0'), sun: C('#fff8ec'), sunI: 4.5,
    hSky: C('#9cc2f0'), hGnd: C('#a89060'), hI: 1.15, expo: 0.85, haze: 0.75 },
];

const MOON_COLOR = C('#bccdff');
const MOON_I = 4.3;

const _a = new THREE.Color();
const _b = new THREE.Color();

function findKey(el: number): { k0: Key; k1: Key; t: number } {
  if (el <= KEYS[0].el) return { k0: KEYS[0], k1: KEYS[0], t: 0 };
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (el < KEYS[i + 1].el) {
      const t = (el - KEYS[i].el) / (KEYS[i + 1].el - KEYS[i].el);
      return { k0: KEYS[i], k1: KEYS[i + 1], t: t * t * (3 - 2 * t) };
    }
  }
  const k = KEYS[KEYS.length - 1];
  return { k0: k, k1: k, t: 0 };
}

export interface EnvLike {
  dayFrac: number;
  season: number;
  weather: number;
  rain: number;
  windDir: number;
  windStrength: number;
  warmth: number;
}

export interface Smoothed {
  overcast: number;
  snow: number;
  wet: number;
}

/** Non-uniform outputs the engine applies to lights, exposure and post. */
export interface Lighting {
  sunElDeg: number;
  lightIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  exposure: number;
  hazeDensity: number;
  mistDensity: number;
  gradeShadow: THREE.Color;
  gradeHighlight: THREE.Color;
  gradeSat: number;
  gradeContrast: number;
  vignette: number;
  bloom: number;
  /** Additive linear lift (before exposure) so shadows never crush to black; strongest at night. */
  gradeLift: THREE.Color;
  /** 0..1 visible rain intensity (set by the engine; drives the rain streak layer in the grade pass). */
  rain: number;
  /** 0..1 how strongly the night tint (silver-blue, desaturated) is applied by the grade. */
  gradeNight: number;
}

export function createLighting(): Lighting {
  return {
    sunElDeg: 20, lightIntensity: 3, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 1,
    exposure: 1, hazeDensity: 0.0007, mistDensity: 0, gradeShadow: new THREE.Color(1, 1, 1), gradeHighlight: new THREE.Color(1, 1, 1),
    gradeSat: 1, gradeContrast: 1, vignette: 0.25, bloom: 0.3, gradeLift: new THREE.Color(0, 0, 0), gradeNight: 0, rain: 0,
  };
}

function mixKey(out: THREE.Color, f: (k: Key) => THREE.Color, k0: Key, k1: Key, t: number) {
  out.copy(f(k0)).lerp(f(k1), t);
}

/** Maximum sun elevation (degrees) by season: low in winter, high in summer, kept modest so light stays golden. */
export function sunElMax(season: number): number {
  return 34 + 12 * Math.sin(season * Math.PI / 2);
}

/** Art direction: the visual sun lingers near sunrise and sunset (about twice as long) and hurries through noon and midnight. */
export const GOLDEN_LINGER = 0.55;
export function warpDay(dayFrac: number): number {
  return dayFrac - (GOLDEN_LINGER / (4 * Math.PI)) * Math.sin(4 * Math.PI * (dayFrac - 0.25));
}

export function sunDirection(dayFrac: number, season: number, out: THREE.Vector3): number {
  dayFrac = warpDay(dayFrac);
  const elDeg = sunElMax(season) * Math.sin(2 * Math.PI * (dayFrac - 0.25));
  const el = elDeg * Math.PI / 180;
  const az = 2 * Math.PI * dayFrac; // compass: 0 north (+z), 0.25 east (+x), 0.5 south (-z)
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  return elDeg;
}

/**
 * Compute the full atmosphere for an env and write it to the shared uniforms. Cheap enough for every frame.
 * Weather ints: 0 clear, 1 rain, 2 drought, 3 storm, 4 snow.
 */
export function computeAtmosphere(env: EnvLike, sm: Smoothed, u: SharedUniforms, L: Lighting): void {
  const season = ((env.season % 4) + 4) % 4;
  u.dayFrac.value = env.dayFrac;
  u.season.value = season;

  const elDeg = sunDirection(env.dayFrac, season, u.sunDir.value);
  L.sunElDeg = elDeg;
  u.moonDir.value.set(-u.sunDir.value.x, -u.sunDir.value.y, -u.sunDir.value.z);

  const { k0, k1, t } = findKey(elDeg);
  const over = sm.overcast;
  const winter = smoothstep(2.35, 3.0, season) * (1 - smoothstep(3.6, 3.95, season)); // 0..1 at deep winter
  const autumn = smoothstep(1.7, 2.1, season) * (1 - smoothstep(2.6, 3.0, season));
  const dust = env.weather === 2 ? 0.35 : 0;

  // sky palette
  mixKey(u.skyZenith.value, (k) => k.zen, k0, k1, t);
  mixKey(u.skyMid.value, (k) => k.mid, k0, k1, t);
  mixKey(u.skyHorizon.value, (k) => k.hor, k0, k1, t);
  mixKey(u.sunGlow.value, (k) => k.glow, k0, k1, t);
  const dayness = smoothstep(-6, 8, elDeg);
  // season tints
  u.skyZenith.value.multiply(_a.setRGB(lerp(1, 0.95, winter), lerp(1, 0.98, winter), lerp(1, 1.05, winter)));
  u.skyHorizon.value.lerp(_b.set('#cfd8e6'), 0.3 * winter * dayness);
  u.skyHorizon.value.multiply(_a.setRGB(1 + 0.06 * autumn, 1 - 0.02 * autumn, 1 - 0.12 * autumn));
  u.skyHorizon.value.lerp(_b.set('#d8b070'), dust * dayness);
  // overcast: pull everything toward a flat grey that tracks the daylight level
  if (over > 0.001) {
    const lum = (u.skyHorizon.value.r + u.skyHorizon.value.g + u.skyHorizon.value.b) / 3;
    _b.setRGB(lum * 0.78, lum * 0.82, lum * 0.9);
    u.skyHorizon.value.lerp(_b, over * 0.85);
    u.skyMid.value.lerp(_b.multiplyScalar(0.82), over * 0.9);
    u.skyZenith.value.lerp(_b.multiplyScalar(0.8), over * 0.9);
    u.sunGlow.value.multiplyScalar(1 - over * 0.9);
  }
  u.sunDiskColor.value.copy(k0.sun).lerp(k1.sun, t);

  // key light: sun by day, moon at night, continuous through twilight
  const sunI = lerp(k0.sunI, k1.sunI, t) * (1 - over * 0.86);
  const moonAmt = smoothstep(-6, -15, elDeg);
  const moonI = MOON_I * moonAmt * (1 - over * 0.5);
  mixKey(_a, (k) => k.sun, k0, k1, t);
  const total = sunI + moonI;
  u.lightColor.value.setRGB(0, 0, 0);
  if (total > 1e-4) {
    // blend color by intensity, direction by intensity so it never jumps
    const wS = sunI / total, wM = moonI / total;
    const col = u.lightColor.value;
    col.setRGB(_a.r * wS + MOON_COLOR.r * wM, _a.g * wS + MOON_COLOR.g * wM, _a.b * wS + MOON_COLOR.b * wM);
    u.lightDir.value.set(
      u.sunDir.value.x * wS + u.moonDir.value.x * wM,
      u.sunDir.value.y * wS + u.moonDir.value.y * wM,
      u.sunDir.value.z * wS + u.moonDir.value.z * wM,
    ).normalize();
    if (u.lightDir.value.y < 0.02) u.lightDir.value.y = 0.02, u.lightDir.value.normalize();
    // season tint on light color
    col.multiply(_b.setRGB(lerp(1, 0.985, winter), lerp(1, 0.99, winter), lerp(1, 1.02, winter)));
    L.lightIntensity = total;
    col.multiplyScalar(total);
  } else {
    L.lightIntensity = 0;
    u.lightDir.value.copy(u.sunDir.value);
    if (u.lightDir.value.y < 0.02) u.lightDir.value.y = 0.02;
    u.lightDir.value.normalize();
  }
  u.night.value = smoothstep(-4, -16, elDeg);

  // ambient
  mixKey(L.hemiSky, (k) => k.hSky, k0, k1, t);
  mixKey(L.hemiGround, (k) => k.hGnd, k0, k1, t);
  L.hemiSky.multiply(_a.setRGB(lerp(1, 0.95, winter), lerp(1, 0.98, winter), lerp(1, 1.04, winter)));
  L.hemiIntensity = lerp(k0.hI, k1.hI, t) * (1 + over * 0.3);
  if (over > 0.001) {
    const l = (L.hemiSky.r + L.hemiSky.g + L.hemiSky.b) / 3;
    L.hemiSky.lerp(_b.setRGB(l, l, l * 1.05), over * 0.5);
    L.hemiGround.lerp(_b.setRGB(l * 0.7, l * 0.68, l * 0.62), over * 0.4);
  }
  L.exposure = lerp(k0.expo, k1.expo, t) * (1 + over * 0.2);

  // distance haze: a light near-field term (scaled down with camera altitude in the post pass) plus a fixed far term;
  // slightly heavier at dawn/dusk, in drought dust and in overcast
  const hazeKey = lerp(k0.haze, k1.haze, t);
  L.hazeDensity = 0.0002 * hazeKey * (1 + over * 0.45 + dust * 0.6 + winter * 0.1);
  // valley mist: dawn hours, more in the cool seasons and when humid. Atmospheric, never opaque.
  const dawn = Math.exp(-Math.pow((env.dayFrac - 0.255) / 0.05, 2));
  const dusk = Math.exp(-Math.pow((env.dayFrac - 0.77) / 0.035, 2));
  const coolSeason = 0.45 + 0.35 * autumn + 0.45 * smoothstep(3.3, 3.9, season) + 0.4 * (1 - smoothstep(0.0, 0.7, season)) * (season < 2 ? 1 : 0);
  L.mistDensity = 0.0009 * (dawn * coolSeason + dusk * 0.1) + 0.0002 * over + 0.0001;

  // cloud cover
  u.overcast.value = over;
  u.cloud.value = clamp(0.26 + over * 0.9 + (env.weather === 3 ? 0.2 : 0), 0, 1);

  // grade: warm highlights / cool shadows, stronger around golden hour
  const golden = smoothstep(-4, 3, elDeg) * (1 - smoothstep(14, 32, elDeg));
  const night = u.night.value;
  // twilight keeps a little of the night grade so the handoff never dips dark
  const twilight = smoothstep(-12, -4, elDeg) * (1 - smoothstep(-1, 3, elDeg));
  const nightG = Math.max(night, 0.28 * smoothstep(-3, -10, elDeg));
  L.gradeNight = nightG;
  L.gradeHighlight.setRGB(1.0 + 0.08 * golden - 0.1 * nightG, 1.0 + 0.0 * golden + 0.02 * nightG, 1.0 - 0.1 * golden + 0.14 * nightG);
  L.gradeShadow.setRGB(1.0 - 0.14 * golden - 0.2 * nightG, 1.0 + 0.0 * golden + 0.0 * nightG, 1.0 + 0.24 * golden + 0.26 * nightG);
  L.gradeSat = 1.1 - 0.1 * golden + 0.06 * twilight - 0.1 * nightG - 0.12 * over - 0.04 * winter;
  L.gradeContrast = 1.1 - 0.06 * over + 0.2 * nightG + 0.08 * twilight;
  L.vignette = 0.26 + 0.06 * nightG;
  L.bloom = 0.17 + 0.13 * golden + 0.06 * nightG;
  // shadow floor: a faint cool lift, plus more at night so nothing is ever pure black
  L.gradeLift.setRGB(0.0016 + 0.003 * nightG, 0.0021 + 0.0048 * nightG, 0.0034 + 0.0085 * nightG);

  // russet ground under red dusk light compounds into wine: in autumn the low sun gives up some of its red
  if (autumn > 0.01) {
    const lowSun = (1 - smoothstep(4, 16, elDeg)) * smoothstep(-6, 0, elDeg);
    const k = autumn * lowSun;
    u.lightColor.value.multiply(_b.setRGB(1 - 0.07 * k, 1 + 0.03 * k, 1 + 0.0 * k));
    L.hemiGround.multiply(_b.setRGB(1 - 0.14 * k, 1 + 0.05 * k, 1 - 0.05 * k));
    L.gradeSat -= 0.06 * k;
    // keep the cool-shadow grade from turning shaded russet ground olive-grey
    L.gradeShadow.lerp(_b.setRGB(1.02, 1.0, 0.98), 0.6 * k);
  }

  // wind
  const wd = env.windDir;
  u.wind.value.set(Math.cos(wd), Math.sin(wd), clamp(env.windStrength, 0, 1));
}

// ------------------------------------------------------------------ the dome

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position * 500.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uSunDiskColor;
uniform float uNight;
uniform float uCloud;
uniform float uOvercast;
uniform vec3 uWind;
// storms (R4): gloom toward each cell, the lightning flash and the rainbow
uniform float uStormOn;
uniform vec4 uFlashSky;
uniform float uRainbow;
${NOISE_GLSL}
${CLOUD_GLSL}
${SKY_GLSL}
${STORM_SKY_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = tgSkyBase(d);
  float up = d.y;

  // stars + faint galactic band
  if (uNight > 0.01 && up > 0.0) {
    vec3 p = d * 150.0;
    vec3 ip = floor(p);
    vec3 fp = fract(p) - 0.5;
    float h = tgHash31(ip);
    vec3 jit = vec3(tgHash31(ip + 7.1), tgHash31(ip + 13.7), tgHash31(ip + 29.3)) - 0.5;
    float dd = length(fp - jit * 0.55);
    float star = smoothstep(0.14, 0.0, dd) * step(0.975, h) * (0.6 + 2.6 * tgHash31(ip + 3.3));
    star *= 0.75 + 0.25 * sin(uTime * 2.5 + h * 80.0);
    float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.75, 0.55))) * 3.2, 2.0));
    float mw = band * (0.015 + 0.035 * tgNoise3(d * 7.0));
    float vis = uNight * smoothstep(0.0, 0.12, up) * (1.0 - uOvercast);
    col += (vec3(star) * vec3(0.9, 0.95, 1.2) + vec3(0.5, 0.6, 1.0) * mw) * vis;
  }

  // sun disk
  float mu = dot(d, uSunDir);
  float disk = smoothstep(0.99992, 0.999975, mu) * smoothstep(-0.015, 0.02, d.y);
  col += uSunDiskColor * disk * 16.0 * (1.0 - uOvercast * 0.85);

  // moon
  float mm = dot(d, uMoonDir);
  float moonVis = smoothstep(-0.02, 0.05, uMoonDir.y) * uNight;
  float mdisk = smoothstep(0.99965, 0.99978, mm);
  col += vec3(0.84, 0.9, 1.0) * mdisk * 4.2 * moonVis * (1.0 - uOvercast * 0.8);
  col += vec3(0.4, 0.5, 0.9) * (0.16 * pow(max(mm, 0.0), 400.0) + 0.06 * pow(max(mm, 0.0), 60.0) + 0.02 * pow(max(mm, 0.0), 8.0)) * moonVis;
  // a faint warm band hugging the horizon all night, like the last of the dusk
  col += vec3(0.62, 0.3, 0.14) * 0.16 * uNight * smoothstep(0.1, 0.0, up) * smoothstep(-0.02, 0.01, up) * (1.0 - uOvercast * 0.7);

  // clouds: projected layer, lit from the sun side, golden edges at dusk and dawn
  if (up > 0.0) {
    vec2 cp = tgCloudCp(d);
    vec2 drift = tgCloudDrift(uWind, uTime);
    // twilight: the sun is low or just set, so the cloud deck is lit from below
    float tw = smoothstep(0.42, 0.04, uSunDir.y) * smoothstep(-0.26, -0.03, uSunDir.y);
    vec2 q = tgCloudQ(cp, drift);
    float cn = tgFbm2(q);
    float cn2 = tgFbm2(q + uSunDir.xz * 0.12);
    float th = tgCloudThresh(uCloud, tw);
    float dens = smoothstep(th, th + 0.2, cn) * smoothstep(0.0, 0.16, up);
    float lit = clamp(0.55 + (cn - cn2) * 5.0, 0.0, 1.0);
    vec3 shade = uSkyMid * 0.75 + uSkyHorizon * 0.15;
    vec3 sunlit = uSkyHorizon * 0.9 + uSunGlow * 0.55 + 0.12;
    vec3 cc = mix(shade, sunlit, lit);
    cc = mix(cc, vec3(dot(cc, vec3(0.333))) * vec3(0.8, 0.84, 0.92), uOvercast * 0.7);
    // underlit by the low sun: gold on the sun's side of the sky, rose on the far side, brightest along the cloud's lit edges
    float sunSide = 0.5 + 0.5 * dot(normalize(uSunDir.xz + vec2(1e-4)), normalize(d.xz + vec2(1e-4)));
    vec3 under = mix(vec3(0.95, 0.5, 0.4), uSunGlow * 1.1 + vec3(0.1, 0.05, 0.0), sunSide);
    cc = mix(cc, under * (0.5 + 0.75 * lit) * (0.55 + 0.6 * sunSide), tw * 0.8 * (1.0 - uOvercast));
    // thin cloud lets the sky through; thick cloud is opaque
    col = mix(col, cc, dens * (0.55 + 0.4 * uCloud + 0.15 * tw));
    // high cirrus: long, thin streaks across the sky, catching the low sun's colour at dusk and dawn
    float ci = tgFbm2(vec2(cp.x * 0.15 + drift.x * 0.6, cp.y * 1.2 + drift.y * 0.6) + 31.0);
    float cir = smoothstep(0.5, 0.75, ci) * smoothstep(0.04, 0.3, up) * (1.0 - uOvercast) * mix(0.32, 0.7, tw);
    vec3 cirC = mix(uSkyHorizon * 0.9 + vec3(0.08), under * (0.6 + 0.5 * sunSide), tw);
    col = mix(col, cirC, cir * 0.7);
  }

  // storm gloom: the sky darkens and cools toward each cell (the distance haze takes the same tint, see post.ts)
  if (uStormOn > 0.5) col = tgStormTint(col, tgStormGloom(d));
  // rainbow: an arc 40 to 42.4 degrees around the antisolar point, violet inside and red outside, with a faint secondary bow
  if (uRainbow > 0.002 && up > -0.02) {
    float ang = degrees(acos(clamp(dot(d, -uSunDir), -1.0, 1.0)));
    float t1 = (ang - 39.6) / 3.0;
    float t2 = (ang - 50.5) / 3.6;
    float b1 = smoothstep(-0.3, 0.1, t1) * smoothstep(1.3, 0.9, t1);
    float b2 = smoothstep(-0.3, 0.1, t2) * smoothstep(1.3, 0.9, t2) * 0.28;
    if (b1 + b2 > 0.002) {
      float hue = clamp(1.0 - clamp(t1, 0.0, 1.0), 0.0, 1.0) * 0.76;
      float hue2 = clamp(clamp(t2, 0.0, 1.0), 0.0, 1.0) * 0.76;
      vec3 c1 = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      vec3 c2 = clamp(abs(mod(hue2 * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      float sunVis = smoothstep(0.0, 0.1, uSunDir.y);
      col += (c1 * b1 + c2 * b2) * uRainbow * sunVis * smoothstep(-0.02, 0.05, up) * (1.0 - 0.55 * uOvercast) * (0.14 + 0.3 * (1.0 - dot(col, vec3(0.3333))));
    }
  }
  // lightning flash: the whole dome brightens, most toward the strike
  if (uFlashSky.w > 0.002) col += vec3(0.62, 0.7, 1.0) * uFlashSky.w * (0.3 + 0.9 * pow(max(dot(d, uFlashSky.xyz), 0.0), 3.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(shared: SharedUniforms, storm: StormUniforms) {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: shared.time,
        uSunDir: shared.sunDir,
        uMoonDir: shared.moonDir,
        uSkyZenith: shared.skyZenith,
        uSkyMid: shared.skyMid,
        uSkyHorizon: shared.skyHorizon,
        uSunGlow: shared.sunGlow,
        uSunDiskColor: shared.sunDiskColor,
        uNight: shared.night,
        uCloud: shared.cloud,
        uOvercast: shared.overcast,
        uWind: shared.wind,
        uStormOn: storm.on,
        uStormSkyA: storm.skyA,
        uStormSkyB: storm.skyB,
        uFlashSky: storm.flashSky,
        uRainbow: storm.rainbow,
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  /** Keep the dome centered on the camera so it never parallaxes. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
    const s = camera instanceof THREE.PerspectiveCamera ? camera.far * 0.9 : 1000;
    this.mesh.scale.setScalar(s);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
