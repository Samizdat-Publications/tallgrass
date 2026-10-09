// Sky dome + the atmosphere model: EnvState (day, season, weather) -> sun/moon direction, light color,
// sky palette, ambient, exposure, haze. The same palette drives the dome, the water reflections and the
// aerial-perspective haze so everything meets cleanly at the horizon.
import * as THREE from 'three';
import { CLOUD_GLSL, NOISE_GLSL, SKY_GLSL, SharedUniforms, clamp, lerp, smoothstep } from './common';
import { STORM_SKY_GLSL, type StormUniforms } from './storms';
import { DAY_TICKS } from '../sim/types';
import { START_DAY } from '../sim/env';

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
/** Starlight fill on a moonless night: intensity (about a fifth of a full moon's), colour, and the direction it comes from. */
const STAR_I = 0.95;
const STAR_COLOR = C('#a8bcff');
const STAR_DIR = new THREE.Vector3(0.25, 0.9, -0.35).normalize();
/** Angular radius of the drawn moon (radians): a little over five times the real one, so the maria read. */
const MOON_RADIUS = 0.0245;

// ------------------------------------------------------------------ the night sky (V2-PLAN R9)

/** One lunar cycle takes this many valley days; the first evening of a new valley is a young waxing crescent. */
export const LUNAR_DAYS = 8;
const MOON_C0 = 0.04;
/** The valley sits at about 41 degrees north (the stars turn about the pole at this height). */
const LAT = 41 * Math.PI / 180;
/** Season (0 spring equinox, 1 summer solstice ...) of the August meteor shower: the Perseids, about 52 days after the solstice. */
const SHOWER_SEASON = 1.57;
/** Chance that a deep-winter night has an aurora (autumn and spring shoulders get a fraction of it). */
export const AURORA_P_WINTER = 0.5;

/** Galactic frame in equatorial coordinates (J2000): the centre (RA 266.405, Dec -28.936) and the north pole (RA 192.860, Dec 27.128). */
function equ(raDeg: number, decDeg: number): THREE.Vector3 {
  const ra = raDeg * Math.PI / 180, de = decDeg * Math.PI / 180;
  return new THREE.Vector3(Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de));
}
const GAL_C = equ(266.405, -28.936);
const GAL_N = equ(192.8595, 27.1283);
const GAL_Y = new THREE.Vector3().crossVectors(GAL_N, GAL_C);
/** Perseid radiant in equatorial coordinates (RA 3h06, Dec +58). */
const RADIANT_EQ = equ(46.5, 58);

/**
 * Night sky state, shared by the dome and the water (the moon's glint). computeAtmosphere writes it every frame; the dome and the
 * water hold references to these objects. `debug` overrides are for stills and benches (NaN = off).
 */
export const NIGHT = {
  /** World direction -> equatorial direction (rotates with the local sidereal time). */
  skyRot: { value: new THREE.Matrix3() },
  /** The meteor shower's radiant in world space. */
  radiant: { value: new THREE.Vector3(0, 0.7, 0.7) },
  /** 0..1 how bright the moon's light is right now: phase (illuminated fraction ^ 1.7) times its height above the horizon, before cloud. */
  moonK: { value: 0 },
  /** Linear radiance of the moon as a glint source on water (colour times intensity; zero when it is down, new, or daylight). */
  moonCol: { value: new THREE.Color(0, 0, 0) },
  /** 0..1 aurora strength, 0 on almost every night. */
  aurora: { value: 0 },
  /** 0..1 how strongly the meteor shower runs (1 at its peak). */
  shower: { value: 0 },
  /** 0..1 dust and damp: dims the stars. */
  haze: { value: 0 },
  /** Debug: >= 0 forces a meteor in flight, seeded by the value. -1 normal. */
  meteorT: { value: -1 },
  /** Debug: where a forced meteor starts. */
  meteorAim: { value: new THREE.Vector3(0, 0.6, 0.8) },
  mw: { value: null as THREE.Texture | null },
  debug: { moonCycle: NaN, aurora: NaN, shower: NaN },
  /** Read-outs for tools and the UI: lunar cycle 0..1 (0 new, 0.5 full), lit fraction, moon height. */
  info: { cycle: 0, illum: 0, moonEl: 0, aurora: 0, shower: 0, bakeMs: 0 },
};

/** Phase name for a lunar cycle value (0 new, 0.5 full). */
export function moonPhaseName(c: number): string {
  const i = Math.floor(((c % 1 + 1) % 1) * 8 + 0.5) % 8;
  return ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'][i];
}

const hash01 = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Moon position and brightness, the sky's rotation, the meteor shower and the aurora. Writes u.moonDir and NIGHT. */
function updateNightSky(env: EnvLike, season: number, u: SharedUniforms): { k: number; illum: number } {
  const dayNum = env.tick !== undefined ? env.tick / DAY_TICKS + START_DAY : env.dayFrac;
  let cyc = (((dayNum / LUNAR_DAYS + MOON_C0) % 1) + 1) % 1;
  if (!Number.isNaN(NIGHT.debug.moonCycle)) cyc = ((NIGHT.debug.moonCycle % 1) + 1) % 1;
  // the moon rises later each night by one cycle's share of the day: its own clock lags the sun's by the cycle (waxing: east of the sun)
  const mDay = warpDay(env.dayFrac - cyc);
  const mElDeg = sunElMax(season + 4 * cyc) * Math.sin(2 * Math.PI * (mDay - 0.25));
  const mEl = mElDeg * Math.PI / 180;
  const mAz = 2 * Math.PI * mDay;
  const md = u.moonDir.value.set(Math.sin(mAz) * Math.cos(mEl), Math.sin(mEl), Math.cos(mAz) * Math.cos(mEl));
  const illum = 0.5 - 0.5 * md.dot(u.sunDir.value);
  const k = Math.pow(clamp(illum, 0, 1), 1.7) * smoothstep(-0.03, 0.3, md.y);
  NIGHT.moonK.value = k;
  NIGHT.info.cycle = cyc; NIGHT.info.illum = illum; NIGHT.info.moonEl = mElDeg;

  // the stars turn about the celestial pole: local sidereal time = the sun's right ascension + its hour angle
  const lst = season * (Math.PI / 2) + 2 * Math.PI * (env.dayFrac - 0.5);
  const sL = Math.sin(lst), cL = Math.cos(lst), sP = Math.sin(LAT), cP = Math.cos(LAT);
  NIGHT.skyRot.value.set(-sL, cL * cP, -cL * sP, cL, sL * cP, -sL * sP, 0, sP, cP);
  // the radiant, back in world space (the rotation is orthonormal: its transpose is its inverse)
  const r = RADIANT_EQ;
  NIGHT.radiant.value.set(
    -sL * r.x + cL * r.y,
    cL * cP * r.x + sL * cP * r.y + sP * r.z,
    -cL * sP * r.x - sL * sP * r.y + cP * r.z,
  );
  const sd = Math.abs(season - SHOWER_SEASON);
  const shower = Number.isNaN(NIGHT.debug.shower) ? Math.exp(-(sd * sd) / (2 * 0.09 * 0.09)) : NIGHT.debug.shower;
  NIGHT.shower.value = shower;
  NIGHT.info.shower = shower;

  // aurora: decided per night from the night's number, so the same tick always shows the same sky
  const night = Math.floor(dayNum + 0.5);   // a night runs from dusk to dawn around the midnight at dayNum == night
  const wd = Math.abs(season - 3);
  const winterK = 1 - smoothstep(0.55, 1.45, Math.min(wd, 4 - wd));
  const pA = 0.03 + (AURORA_P_WINTER - 0.03) * winterK;
  let aur = 0;
  if (hash01(night * 1.713 + 4.1) < pA) {
    const amp = 0.55 + 0.45 * hash01(night * 3.31 + 9.2);
    const centre = night + (hash01(night * 5.37 + 2.2) - 0.5) * 0.1;
    const width = 0.075 + 0.05 * hash01(night * 11.7 + 1.3);
    const x = (dayNum - centre) / width;
    aur = amp * Math.exp(-x * x);
  }
  if (!Number.isNaN(NIGHT.debug.aurora)) aur = NIGHT.debug.aurora;
  NIGHT.info.aurora = aur;
  return { k, illum };
}

// ---- Milky Way: a baked band in galactic coordinates (l round, b -35 to +35 degrees), R glow, G dust, B star density, A warmth

function ihash(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = ihash(ix, iy, iz), b = ihash(ix + 1, iy, iz), c = ihash(ix, iy + 1, iz), d = ihash(ix + 1, iy + 1, iz);
  const e = ihash(ix, iy, iz + 1), f = ihash(ix + 1, iy, iz + 1), g = ihash(ix, iy + 1, iz + 1), h = ihash(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * ux, x1 = c + (d - c) * ux, x2 = e + (f - e) * ux, x3 = g + (h - g) * ux;
  const y0 = x0 + (x1 - x0) * uy, y1 = x2 + (x3 - x2) * uy;
  return y0 + (y1 - y0) * uz;
}
function fbm3(x: number, y: number, z: number, oct: number): number {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x, y, z); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; z = z * 2.03 + 3.3; a *= 0.5; }
  return s / n;
}

const MW_W = 1024, MW_H = 200, MW_BMAX = 35;
/** Bright patches along the plane: [l degrees, strength, sigma l, sigma b]. The centre is in Sagittarius (l = 0). */
const MW_PATCHES: number[][] = [
  [0, 0.85, 20, 13], [357, 0.35, 7, 8], [27, 0.5, 7, 6], [45, 0.3, 9, 6], [78, 0.42, 10, 8], [118, 0.22, 11, 6],
  [140, 0.12, 10, 6], [175, 0.1, 14, 6], [205, 0.12, 14, 7], [265, 0.4, 12, 7], [288, 0.5, 8, 6], [302, 0.45, 8, 7], [330, 0.5, 14, 8],
];
/** Dark clouds off the plane (Ophiuchus, the Pipe, the Snake): [l, b, sigma degrees, depth]. */
const MW_DARK: number[][] = [[359, 5, 3, 0.85], [354, 15, 5, 0.7], [350, 3, 2.5, 0.75], [6, 11, 4, 0.55], [12, 6, 3, 0.5], [18, -2, 3, 0.55]];

function bakeMilkyWay(): THREE.DataTexture {
  const data = new Uint8Array(MW_W * MW_H * 4);
  const D = Math.PI / 180;
  const prof = (b: number, s: number) => 0.7 * Math.exp(-(b * b) / (s * s)) + 0.3 * Math.exp(-(b * b) / (2.4 * s * 2.4 * s));
  for (let y = 0; y < MW_H; y++) {
    const b = ((y + 0.5) / MW_H - 0.5) * 2 * MW_BMAX;   // degrees
    for (let x = 0; x < MW_W; x++) {
      const lDeg = ((x + 0.5) / MW_W) * 360;
      const lw = lDeg > 180 ? lDeg - 360 : lDeg;         // -180..180, 0 at the centre
      const l = lDeg * D;
      // the smooth brightness of the plane
      let g = 0.14 * prof(b, 5.0);
      for (const [l0, amp, sl, sb] of MW_PATCHES) {
        let dl = lDeg - l0; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
        g += amp * Math.exp(-(dl * dl) / (sl * sl)) * prof(b, sb * 0.75);
      }
      let dust = 0;
      if (Math.abs(b) < 24) {
        const cx = Math.cos(l), sx = Math.sin(l);
        // star clouds: the plane is patchy
        const patch = fbm3(cx * 2.6 + 5, sx * 2.6 + 5, b * 0.11, 4);
        g *= 0.45 + 1.2 * patch;
        // the Great Rift: a dark lane splitting the plane from the centre out through Aquila and Cygnus
        const rs = Math.exp(-Math.pow((lw * D - 0.62) / 0.75, 2));
        const bRift = 2.2 + 2.0 * Math.sin(lw * D * 3.1 + 0.7);
        const wRift = 2.2 + 1.0 * fbm3(cx * 5, sx * 5, 1.7, 2);
        const rn = fbm3(cx * 7 + 11, sx * 7 + 11, b * 0.25, 3);
        dust += rs * Math.exp(-Math.pow((b - bRift) / wRift, 2)) * (0.6 + 1.0 * rn);
        for (const [l0, b0, sg, depth] of MW_DARK) {
          let dl = lDeg - l0; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
          dust += depth * Math.exp(-((dl * dl) + (b - b0) * (b - b0)) / (sg * sg));
        }
        // filaments along the plane
        const fl = fbm3(cx * 4.5 + 3, sx * 4.5 + 3, b * 0.16, 4);
        const ridge = 1 - Math.abs(2 * fl - 1);
        dust += 0.55 * smoothstep(0.7, 0.92, ridge) * Math.exp(-Math.pow(b / 13, 2)) * (0.3 + 0.7 * Math.exp(-Math.pow(lw / 70, 2)));
      }
      dust = clamp(dust, 0, 0.96);
      const glow = clamp(g / 1.25, 0, 1);
      const warm = Math.exp(-Math.pow(lw / 42, 2)) * (0.25 + 0.75 * glow);
      const o = (y * MW_W + x) * 4;
      data[o] = Math.round(255 * glow * (1 - 0.92 * dust));
      data[o + 1] = Math.round(255 * dust);
      data[o + 2] = Math.round(255 * clamp(glow * (1 - 0.8 * dust) * 1.4, 0, 1));
      data[o + 3] = Math.round(255 * clamp(warm, 0, 1));
    }
  }
  const tex = new THREE.DataTexture(data, MW_W, MW_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** The baked Milky Way, made on first use (about 100 ms once). */
function milkyWayTexture(): THREE.Texture {
  if (!NIGHT.mw.value) {
    const t0 = performance.now();
    NIGHT.mw.value = bakeMilkyWay();
    NIGHT.info.bakeMs = performance.now() - t0;
  }
  return NIGHT.mw.value;
}

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
  /** Sim tick: gives the lunar cycle and the aurora nights a deterministic clock (optional; without it the moon holds one phase). */
  tick?: number;
}

export interface Smoothed {
  overcast: number;
  snow: number;
  wet: number;
  /** Dry-years look 0..1 (climate regimes, eased by the engine; absent or 0 otherwise): a hazier, warmer sky like a mild dry spell's. */
  dry?: number;
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
  u.night.value = smoothstep(-4, -16, elDeg);
  const moon = updateNightSky(env, season, u);

  const { k0, k1, t } = findKey(elDeg);
  const over = sm.overcast;
  const winter = smoothstep(2.35, 3.0, season) * (1 - smoothstep(3.6, 3.95, season)); // 0..1 at deep winter
  const autumn = smoothstep(1.7, 2.1, season) * (1 - smoothstep(2.6, 3.0, season));
  const dust = Math.max(env.weather === 2 ? 0.35 : 0, 0.3 * (sm.dry ?? 0));

  // sky palette
  mixKey(u.skyZenith.value, (k) => k.zen, k0, k1, t);
  mixKey(u.skyMid.value, (k) => k.mid, k0, k1, t);
  mixKey(u.skyHorizon.value, (k) => k.hor, k0, k1, t);
  mixKey(u.sunGlow.value, (k) => k.glow, k0, k1, t);
  const dayness = smoothstep(-6, 8, elDeg);
  // a moonless night is darker: the sky and the ambient light drop toward starlight (0 by day and under a bright moon)
  const dark = u.night.value * (1 - moon.k);
  u.skyZenith.value.multiplyScalar(1 - 0.34 * dark);
  u.skyMid.value.multiplyScalar(1 - 0.34 * dark);
  u.skyHorizon.value.multiplyScalar(1 - 0.24 * dark);
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
  const moonI = MOON_I * moonAmt * moon.k * (1 - over * 0.5);
  mixKey(_a, (k) => k.sun, k0, k1, t);
  // starlight: on a moonless night a faint cool fill from high in the sky keeps the land readable (and a new-moon night about half as bright as a full-moon one)
  const starI = STAR_I * u.night.value * (1 - moon.k) * (1 - over * 0.4);
  const total = sunI + moonI + starI;
  u.lightColor.value.setRGB(0, 0, 0);
  if (total > 1e-4) {
    // blend color by intensity, direction by intensity so it never jumps
    const wS = sunI / total, wM = moonI / total, wT = starI / total;
    const col = u.lightColor.value;
    col.setRGB(_a.r * wS + MOON_COLOR.r * wM + STAR_COLOR.r * wT, _a.g * wS + MOON_COLOR.g * wM + STAR_COLOR.g * wT, _a.b * wS + MOON_COLOR.b * wM + STAR_COLOR.b * wT);
    u.lightDir.value.set(
      u.sunDir.value.x * wS + u.moonDir.value.x * wM + STAR_DIR.x * wT,
      u.sunDir.value.y * wS + u.moonDir.value.y * wM + STAR_DIR.y * wT,
      u.sunDir.value.z * wS + u.moonDir.value.z * wM + STAR_DIR.z * wT,
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

  // ambient
  mixKey(L.hemiSky, (k) => k.hSky, k0, k1, t);
  mixKey(L.hemiGround, (k) => k.hGnd, k0, k1, t);
  L.hemiSky.multiply(_a.setRGB(lerp(1, 0.95, winter), lerp(1, 0.98, winter), lerp(1, 1.04, winter)));
  L.hemiIntensity = lerp(k0.hI, k1.hI, t) * (1 + over * 0.3) * (1 - 0.15 * dark);
  if (over > 0.001) {
    const l = (L.hemiSky.r + L.hemiSky.g + L.hemiSky.b) / 3;
    L.hemiSky.lerp(_b.setRGB(l, l, l * 1.05), over * 0.5);
    L.hemiGround.lerp(_b.setRGB(l * 0.7, l * 0.68, l * 0.62), over * 0.4);
  }
  L.exposure = lerp(k0.expo, k1.expo, t) * (1 + over * 0.2) * (1 + 0.22 * dark) * (1 + 0.08 * u.night.value);

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
  // (the night's contrast gain is kept modest: the power curve crushes everything under 0.18, which is the whole night scene)
  L.gradeContrast = 1.1 - 0.06 * over + 0.12 * nightG + 0.08 * twilight;
  L.vignette = 0.26 + 0.06 * nightG;
  L.bloom = 0.17 + 0.13 * golden + 0.06 * nightG;
  // shadow floor: a faint cool lift, plus more at night so nothing is ever pure black
  L.gradeLift.setRGB(0.0016 + 0.0048 * nightG, 0.0021 + 0.0078 * nightG, 0.0034 + 0.0135 * nightG);
  L.gradeLift.multiplyScalar(1 - 0.3 * dark);

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

  // the moon as a light on the water, the haze that dims the stars, and the aurora's strength tonight
  NIGHT.moonCol.value.copy(MOON_COLOR).multiplyScalar(moonI);
  NIGHT.haze.value = clamp(0.8 * u.drought.value + 0.3 * sm.wet, 0, 1);
  NIGHT.aurora.value = NIGHT.info.aurora;

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
// night sky (R9): the stars' rotation, the baked Milky Way, the moon's light, aurora, meteors, haze
uniform mat3 uSkyRot;
uniform sampler2D tMW;
uniform float uMoonK;
uniform float uAurora;
uniform float uShower;
uniform float uHaze;
uniform float uMeteorT;
uniform vec3 uRadiant;
uniform vec3 uMeteorAim;
${NOISE_GLSL}
${CLOUD_GLSL}
${SKY_GLSL}
${STORM_SKY_GLSL}

const float MOON_R = ${MOON_RADIUS.toFixed(5)};
const float STAR_N = 90.0;
const vec3 GAL_C = vec3(${GAL_C.x.toFixed(6)}, ${GAL_C.y.toFixed(6)}, ${GAL_C.z.toFixed(6)});
const vec3 GAL_Y = vec3(${GAL_Y.x.toFixed(6)}, ${GAL_Y.y.toFixed(6)}, ${GAL_Y.z.toFixed(6)});
const vec3 GAL_N = vec3(${GAL_N.x.toFixed(6)}, ${GAL_N.y.toFixed(6)}, ${GAL_N.z.toFixed(6)});

float tgMoonFbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * tgNoise3(p); p = p * 2.1 + vec3(3.1, 1.7, 5.3); a *= 0.5; }
  return s / 0.875;
}

// One meteor stream: a slot of slotLen seconds holds at most one meteor, thrown away from the shower's radiant on shower nights.
// Returns the streak's brightness at view direction d (a thin line with a long fading tail).
float tgMeteor(vec3 d, float t, float slotLen, float seed, float prob, float forced) {
  float slot = floor(t / slotLen);
  float lt = t - slot * slotLen;
  if (tgHash31(vec3(slot, seed, 0.5)) > prob && forced < 0.5) return 0.0;
  float t0 = 0.4 + (slotLen - 2.6) * tgHash31(vec3(slot, seed, 1.5));
  float dur = 0.5 + 0.7 * tgHash31(vec3(slot, seed, 2.5));
  float k = (lt - t0) / dur;
  if (forced > 0.5) k = 0.62;
  if (k < 0.0 || k > 1.5) return 0.0;
  float az = 6.2831853 * tgHash31(vec3(slot, seed, 3.5));
  float al = 0.4 + 0.9 * tgHash31(vec3(slot, seed, 4.5));
  vec3 P0 = vec3(sin(az) * cos(al), sin(al), cos(az) * cos(al));
  if (forced > 0.5) P0 = normalize(uMeteorAim);
  vec3 T;
  if (tgHash31(vec3(slot, seed, 5.5)) < uShower / (uShower + 0.25)) {
    T = P0 - uRadiant * dot(P0, uRadiant);
  } else {
    float ta = 6.2831853 * tgHash31(vec3(slot, seed, 6.5));
    vec3 A = normalize(cross(P0, vec3(0.0, 1.0, 0.0)));
    T = A * cos(ta) + cross(P0, A) * sin(ta);
  }
  T = normalize(T - P0 * dot(T, P0));
  float L = 0.2 + 0.3 * tgHash31(vec3(slot, seed, 7.5));
  float tail = 0.07 + 0.09 * tgHash31(vec3(slot, seed, 8.5));
  float sH = L * clamp(k, 0.0, 1.0);
  float perp = dot(d, cross(P0, T));
  if (abs(perp) > 0.012) return 0.0;
  float s = atan(dot(d, T), dot(d, P0));
  float along = (s - (sH - tail)) / tail;
  if (along < 0.0 || s > sH + 0.002) return 0.0;
  float trail = pow(clamp(along, 0.0, 1.0), 2.4);
  float w = mix(0.00085, 0.0017, trail);
  float line = exp(-perp * perp / (w * w));
  float fade = 1.0 - smoothstep(1.0, 1.5, k);
  float bright = 0.7 + 1.5 * tgHash31(vec3(slot, seed, 9.5));
  return line * (0.12 + 0.88 * trail) * fade * bright * (1.0 + 1.2 * smoothstep(0.93, 1.0, along));
}

// Aurora: green curtains in the north, a pink fringe on the high edge, rays that shimmer and sway.
vec3 tgAurora(vec3 d, float t) {
  float az = atan(d.x, d.z);
  float nw = smoothstep(1.5, 0.3, abs(az));
  if (nw <= 0.0) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float a = az * (1.0 + 0.25 * fi);
    float base = 0.11 + 0.05 * fi + 0.055 * sin(a * 2.1 + t * 0.06 + fi * 1.7) + 0.05 * (tgNoise2(vec2(a * 2.6 + fi * 9.0, t * 0.035)) - 0.5);
    float h = d.y - base;
    if (h > 0.0) {
      float rays = pow(tgNoise2(vec2(a * 16.0 + fi * 5.0 + t * 0.18, t * 0.05 + fi)), 1.8) * (0.6 + 0.8 * tgNoise2(vec2(a * 5.0 - t * 0.07, fi * 3.0)));
      float prof = smoothstep(0.0, 0.012, h) * exp(-h * (6.5 + 2.0 * fi));
      float hue = smoothstep(0.02, 0.28, h);
      vec3 c = mix(vec3(0.06, 1.0, 0.36), vec3(0.8, 0.16, 0.6), hue * hue);
      c += vec3(0.5, 0.25, 0.2) * exp(-h * 80.0) * 0.5;
      acc += c * rays * prof * (1.0 - 0.28 * fi);
    }
  }
  return acc * nw * (1.0 + 0.12 * sin(t * 0.9)) + vec3(0.02, 0.07, 0.04) * nw * exp(-max(d.y, 0.0) * 5.0);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = tgSkyBase(d);
  float up = d.y;
  float fwA = length(fwidth(d));                 // radians per pixel, taken before any branch
  float mm = dot(d, uMoonDir);

  // ---- stars, the Milky Way, airglow, aurora and meteors
  if (uNight > 0.01 && up > -0.02) {
    vec3 e = uSkyRot * d;
    float clearK = pow(clamp(1.0 - uOvercast, 0.0, 1.0), 2.0) * (1.0 - 0.6 * uHaze);
    // atmospheric extinction: stars and the galaxy fade toward the horizon
    float am = 1.0 / (max(up, 0.0) + 0.09);
    float ext = exp(-0.11 * (am - 1.0));
    float moonVeil = pow(max(mm, 0.0), 3.0);

    // the Milky Way: baked in galactic coordinates, with a little fine grain on top
    float mwGlow = 0.0, mwDust = 0.0, mwDens = 0.0;
    vec3 mwCol = vec3(0.0);
    vec3 gv = vec3(dot(e, GAL_C), dot(e, GAL_Y), dot(e, GAL_N));
    if (abs(gv.z) < 0.572) {
      vec2 muv = vec2(atan(gv.y, gv.x) * 0.15915494, asin(gv.z) / ${(2 * MW_BMAX * Math.PI / 180).toFixed(6)} + 0.5);
      // smooth (quintic) interpolation between texels, so the baked band has no bilinear grid in it
      vec2 mtx = muv * vec2(${MW_W}.0, ${MW_H}.0) - 0.5;
      vec2 mfl = floor(mtx), mfr = mtx - mfl;
      mfr = mfr * mfr * mfr * (mfr * (mfr * 6.0 - 15.0) + 10.0);
      vec4 mt = texture2D(tMW, (mfl + mfr + 0.5) / vec2(${MW_W}.0, ${MW_H}.0));
      float fine = tgNoise3(e * 70.0);
      float grain = (0.85 + 0.3 * fine) * (0.8 + 0.4 * tgNoise3(e * 230.0));
      mwGlow = pow(mt.r * grain, 1.35);
      mwDust = mt.g;
      mwDens = mt.b;
      mwCol = mix(vec3(0.5, 0.62, 1.0), vec3(1.0, 0.83, 0.6), mt.a);
      float mwVis = smoothstep(0.3, 1.0, uNight) * (1.0 - 0.9 * pow(uMoonK, 0.6)) * clearK * ext;
      col += mwCol * mwGlow * 0.15 * mwVis;
    }

    // the stars: an equal-angle cube grid in the sky's own frame (so they turn with it), a Pareto brightness distribution
    // (about 2.5 times as many stars per magnitude as the magnitude before), subpixel stars widened to a pixel at the same flux
    vec3 ae = abs(e);
    vec2 fuv; float face;
    if (ae.x >= ae.y && ae.x >= ae.z) { fuv = e.yz / e.x; face = e.x > 0.0 ? 0.0 : 1.0; }
    else if (ae.y >= ae.z) { fuv = e.xz / e.y; face = e.y > 0.0 ? 2.0 : 3.0; }
    else { fuv = e.xy / e.z; face = e.z > 0.0 ? 4.0 : 5.0; }
    vec2 g = (atan(fuv) * 0.63661977 + 0.5) * STAR_N;
    vec2 cell = floor(g);
    vec3 hs = vec3(cell, face);
    float pS = 0.5 * (1.0 + 1.5 * mwDens) * (1.0 - 0.8 * mwDust);
    if (tgHash31(hs) < pS) {
      vec2 sp = (vec2(tgHash31(hs + 7.7), tgHash31(hs + 13.1)) - 0.5) * 0.6;
      float u2 = max(tgHash31(hs + 29.9), 1e-4);
      float b = min(0.36 * pow(u2, -0.667), 12.0);
      float temp = tgHash31(hs + 41.3);
      vec3 sc = mix(vec3(1.0, 0.7, 0.5), vec3(0.62, 0.76, 1.0), temp);
      sc = mix(sc, vec3(1.0), 0.45);
      float ph = tgHash31(hs + 3.1);
      float sci = mix(0.06, 0.5, pow(1.0 - clamp(up * 1.6, 0.0, 1.0), 2.5));
      float tw = 1.0 + sci * (0.6 * sin(uTime * (4.0 + 5.0 * ph) + ph * 91.0) + 0.4 * sin(uTime * (9.0 + 6.0 * ph) + ph * 37.0));
      sc *= 1.0 + 0.5 * sci * vec3(sin(uTime * 7.1 + ph * 50.0), sin(uTime * 6.3 + ph * 20.0 + 2.0), sin(uTime * 5.3 + ph * 70.0 + 4.0));
      float cpp = fwA * STAR_N * 0.63661977;     // cells per pixel
      float s0 = 0.03;
      float sg = max(s0, 0.55 * cpp);
      float amp = (s0 * s0) / (sg * sg);
      // the star's own direction (the cube map's grid is not isotropic, so the distance is taken on the sphere)
      vec2 sgp = tan(((cell + 0.5 + sp) / STAR_N - 0.5) * 1.5707963);
      vec3 es = face < 1.5 ? vec3(1.0, sgp.x, sgp.y) : (face < 3.5 ? vec3(sgp.x, 1.0, sgp.y) : vec3(sgp.x, sgp.y, 1.0));
      es = normalize(es * (mod(face, 2.0) < 0.5 ? 1.0 : -1.0));
      float rc = length(e - es) * STAR_N * 0.63661977;
      float r2 = rc * rc;
      // the moon's glare lifts the sky and hides the faint ones; twilight shows the bright ones first
      float thr = uMoonK * (0.6 + 2.4 * moonVeil) + 30.0 * pow(1.0 - uNight, 2.0);
      float pk = max(b * ext * tw - thr, 0.0);
      float v = pk * amp * exp(-r2 / (2.0 * sg * sg));
      // bright stars carry a small soft halo
      v += max(pk - 2.0, 0.0) * 0.03 * exp(-sqrt(r2) / 0.07);
      col += sc * v * clearK * 1.0;
    }

    // airglow: a faint green band about ten degrees up, rippled by gravity waves
    float ag = exp(-pow((up - 0.17) / 0.14, 2.0));
    float aw = 0.7 + 0.6 * tgNoise2(vec2(atan(d.x, d.z) * 5.0, up * 20.0 + uTime * 0.02));
    col += vec3(0.2, 0.46, 0.3) * 0.022 * ag * aw * uNight * (1.0 - 0.8 * uMoonK) * clearK * smoothstep(0.0, 0.02, up);

    // aurora
    if (uAurora > 0.002) col += tgAurora(d, uTime) * uAurora * 0.26 * uNight * (1.0 - 0.55 * uMoonK) * pow(clamp(1.0 - uOvercast, 0.0, 1.0), 2.0) * smoothstep(0.0, 0.02, up);

    // meteors
    if (up > 0.0) {
      float mt0 = uMeteorT;
      float forced = mt0 >= 0.0 ? 1.0 : 0.0;
      float tm = forced > 0.5 ? mt0 * 5.7 : uTime;
      float pm = 0.1 * (1.0 + 6.0 * uShower);
      float ms = tgMeteor(d, tm, 5.7, 1.0, pm, forced);
      ms += tgMeteor(d, forced > 0.5 ? mt0 * 7.3 + 1.0 : uTime, 7.3, 2.0, pm, 0.0);
      col += vec3(0.85, 0.95, 1.0) * ms * 2.2 * uNight * (1.0 - 0.8 * pow(uMoonK, 0.7)) * clearK;
    }
  }

  // sun disk
  float mu = dot(d, uSunDir);
  float disk = smoothstep(0.99992, 0.999975, mu) * smoothstep(-0.015, 0.02, d.y);
  col += uSunDiskColor * disk * 16.0 * (1.0 - uOvercast * 0.85);

  // moon: a real disc with maria, lit by the sun's actual direction (so the phase, and the tilt of the horns, are exact), earthshine on
  // the dark limb, and a pale ghost of it in the afternoon or morning sky
  if (mm > 0.9975) {
    vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir) + vec3(1e-5));
    vec3 U = cross(uMoonDir, R);
    vec2 mp = vec2(dot(d, R), dot(d, U)) / MOON_R;
    float rr = length(mp);
    float aa = fwA / MOON_R * 1.3;
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rr);
    if (disc > 0.001) {
      float z = sqrt(max(1.0 - rr * rr, 0.0));
      vec3 n = R * mp.x + U * mp.y - uMoonDir * z;
      float lit = smoothstep(-0.03, 0.12, dot(n, uSunDir));
      vec3 sp = vec3(mp, z);
      float maria = smoothstep(0.44, 0.6, tgMoonFbm(sp * 1.9 + 3.7));
      float crat = tgMoonFbm(sp * 9.0 + 11.0);
      float alb = (1.0 - 0.5 * maria) * (0.86 + 0.28 * crat) * (0.82 + 0.18 * z);
      vec3 tint = mix(vec3(1.0, 0.84, 0.66), vec3(0.9, 0.94, 1.0), smoothstep(0.0, 0.45, uMoonDir.y));
      float bright = mix(1.15, 1.7, uNight);
      vec3 surf = alb * bright * tint * lit;
      float illum = 0.5 - 0.5 * dot(uMoonDir, uSunDir);
      surf += alb * vec3(0.55, 0.68, 1.0) * 1.7 * 0.06 * pow(1.0 - illum, 1.5) * uNight * (1.0 - lit);
      surf *= 1.0 - 0.75 * uOvercast;
      float alpha = disc * mix(lit * 0.78 * (1.0 - 0.85 * uOvercast), 1.0 - 0.6 * uOvercast, uNight);
      col = mix(col, surf, alpha);
    }
  }
  float mg = max(mm, 0.0);
  col += vec3(0.4, 0.5, 0.9) * (0.16 * pow(mg, 400.0) + 0.06 * pow(mg, 60.0) + 0.02 * pow(mg, 8.0)) * uMoonK * uNight * (1.0 - uOvercast * 0.5);
  // a faint warm band hugging the horizon, like the last of the dusk (thinner on a dark night)
  col += vec3(0.62, 0.3, 0.14) * 0.16 * uNight * (0.65 + 0.35 * uMoonK) * smoothstep(0.1, 0.0, up) * smoothstep(-0.02, 0.01, up) * (1.0 - uOvercast * 0.7);

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
    // night cloud is a dim blue-grey, silvered toward a bright moon
    cc = mix(cc, vec3(dot(cc, vec3(0.333))) * vec3(0.7, 0.8, 1.0) * (0.34 + 0.3 * uMoonK), 0.85 * uNight);
    cc += vec3(0.5, 0.62, 1.0) * uMoonK * uNight * (0.05 + 0.4 * pow(max(mm, 0.0), 6.0)) * (0.4 + 0.6 * lit);
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
        uSkyRot: NIGHT.skyRot,
        tMW: { value: milkyWayTexture() },
        uMoonK: NIGHT.moonK,
        uAurora: NIGHT.aurora,
        uShower: NIGHT.shower,
        uHaze: NIGHT.haze,
        uMeteorT: NIGHT.meteorT,
        uRadiant: NIGHT.radiant,
        uMeteorAim: NIGHT.meteorAim,
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
