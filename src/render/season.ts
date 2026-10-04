/**
 * One source for the season curves the renderer shares. Season is a float in [0, 4): 0 = early spring, 1 = early summer,
 * 2 = early autumn, 3 = early winter. Anything that more than one file needs (the prairie cure curve, the winter ramp, the riparian
 * belt's season factors) lives here, as TS and as a GLSL chunk generated from the same constants, so the blade layer, the ground
 * shader and the CPU-side tints cannot drift apart.
 */

export type Keys = [number, number][];

/** How cured the prairie is across the year: [season, cure]. Shared by the blade layer, the ground tint and the terrain uniform. */
export const CURE_KEYS: Keys = [
  [0, 0.03], [0.6, 0.06], [1.0, 0.12], [1.25, 0.24], [1.5, 0.6], [1.8, 0.92], [2.0, 1.0], [3.5, 1.0], [3.8, 0.5], [4.0, 0.03],
];
/** Fraction of tall blades carrying a seed head. */
export const SEED_KEYS: Keys = [
  [0, 0.0], [0.9, 0.0], [1.3, 0.04], [1.8, 0.12], [2.2, 0.18], [3.0, 0.14], [3.6, 0.04], [4.0, 0.0],
];
/**
 * How copper-red the bluestem stems and blades are across the year: [season, amount]. Big and little bluestem stay green through the
 * summer, flush to bronze as the grass cures (the CURE_KEYS ramp, season 1.5 to 2.0), and hold a copper-red through autumn, then weather to a dull tan-bronze
 * through early winter (the red is gone by about season 3.5) and stay tan-grey under frost and snow. The blade layer multiplies it by each blade's dryness.
 */
export const COPPER_KEYS: Keys = [
  [0, 0.0], [1.5, 0.0], [1.9, 0.35], [2.3, 0.85], [2.7, 1.0], [3.0, 0.5], [3.3, 0.12], [3.6, 0.0], [4.0, 0.0],
];
/**
 * Cottonwood leaf cover across the year: [season, leaf amount]. Bare through winter and into early spring, buds and small leaves
 * by mid spring, full by early summer, thinning from mid autumn. The old table interpolated half-season keys around the year
 * wrap (late winter 0.1 to early spring 0.45), so crowns were already half green in late winter.
 */
export const LEAF_KEYS: Keys = [
  [0, 0.05], [0.3, 0.14], [0.55, 0.5], [0.8, 0.9], [1.05, 1.0], [1.5, 1.0], [2.0, 0.88], [2.5, 0.4], [3.0, 0.08], [3.6, 0.05], [4.0, 0.05],
];
/** Seasonal snowpack: [season, cover] (0..1 of the snow uniform). Builds from early winter, peaks mid winter, melts out by early spring. */
export const PACK_KEYS: Keys = [
  [0, 0], [3.1, 0], [3.35, 0.3], [3.5, 0.36], [3.7, 0.3], [3.9, 0.06], [4.0, 0],
];

/** Hermite smoothstep on a unit-clamped input. */
export function smooth01(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/** Piecewise smoothstep through [season, value] keys, wrapping the season into [0, 4). */
export function keyCurve(keys: Keys, s: number): number {
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

/** Winter ramp shared by the ground shader and the blade layer's riparian belt: smoothstep up over [on0, on1], down over [off0, off1]. */
export const WINTER = { on0: 2.5, on1: 3.0, off0: 3.6, off1: 3.95 } as const;

/** Winter amount 0..1 for a season (wraps the season into [0, 4)). The GLSL twin is `tgWinterK`. */
export function winterK(season: number): number {
  const ws = ((season % 4) + 4) % 4;
  return smooth01((ws - WINTER.on0) / (WINTER.on1 - WINTER.on0)) * (1 - smooth01((ws - WINTER.off0) / (WINTER.off1 - WINTER.off0)));
}

/**
 * Riparian belt season factors, shared by the blade layer and the ground shader. The belt is full strength in the green months
 * (cureFade: it loses that fraction of its strength at full cure), dull under winter (winterFade), and where drought or
 * grazing has cut the grass back (stubble) its dryness is capped at a low base that rises a little with cure.
 */
export const RIPARIAN = { cureFade: 0.2, winterFade: 0.9, dryBase: 0.02, dryCure: 0.12, dryStub: 0.4 } as const;

/**
 * Late-summer upland cure. Once the prairie is mostly cured (the CURE_KEYS peak, season about 1.6 to 2.2) every spot that is not in
 * the riparian belt is pulled toward fully dry, whatever its moisture, so the hills read as cured gold and green is left to the belt
 * and the swales (the ground shader's drain term). `floor` is the dryness reached at full cure; the pull ramps in over cure [from, to].
 */
export const UPLAND = { from: 0.55, to: 0.92, floor: 0.97 } as const;

/**
 * Sun-aspect banding of the dry ground. Slopes that face the sun go pale gold, slopes turned away go deeper ochre (saturated, never
 * grey and never green). Strength rides on dryness (living grass keeps its colour), is strongest with a low sun, and dies out on the flat.
 */
export const ASPECT = { sun: [1.14, 1.08, 0.82], shade: [0.86, 0.76, 0.5], base: 0.45, low: 0.55, slope0: 0.02, slope1: 0.3 } as const;

/**
 * Drought ground (weather 2, eased by the engine as `drought` 0..1): grass is forced toward dry, bleached to a pale straw that keeps
 * the same luminance and leans yellow (r above g above b, so never mauve or pink), and the riparian belt shrinks by `rip`.
 */
export const DROUGHT = { dry: 0.92, rip: 0.5, ripKeep: 0.6, straw: [1.28, 1.0, 0.52], lift: 1.1, amount: 0.62, dust: [0.5, 0.4, 0.26], soil: 0.7 } as const;

/** GLSL float literal ("3.0", "0.95"). */
function glf(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/**
 * GLSL chunk for the shared curves, built from the constants above. Include it once in any shader that needs them.
 *   tgWinterK(s)                          winter amount 0..1 (raw season, same as the TS winterK for s in [0, 4))
 *   tgRiparian(edge, cure, winterK)       belt strength: edge falloff x cure fade x winter fade
 *   tgRiparianDry(dry, cure, stub, rip)   dryness inside the belt (capped low, a little drier with cure and stubble)
 *   tgCuredFloor(dry, cure, rip)          late-summer pull of non-riparian ground toward fully dry
 *   tgDroughtRip(rip, drought)            the belt shrinks in a drought
 *   tgDroughtDry(dry, drought, rip)       drought forces dry grass (less so inside the belt)
 *   tgDroughtTint(color, drought, rip)    bleach to pale straw at constant luminance
 *   tgDroughtSoil(soil, drought)          dusty tan ground
 *   tgAspectBand(nrm, L)                 pale gold on sun-facing slopes, deeper ochre on shaded ones (vertex stage: rgb multiplier, a strength)
 *   tgAspectApply(band, amt)             the colour multiplier for a pixel of dryness amt
 *   tgAspectTint(nrm, L, amt)            both in one call
 */
export const SEASON_GLSL = /* glsl */ `
float tgWinterK(float s) {
  return smoothstep(${glf(WINTER.on0)}, ${glf(WINTER.on1)}, s) * (1.0 - smoothstep(${glf(WINTER.off0)}, ${glf(WINTER.off1)}, s));
}
float tgRiparian(float edge, float cure, float winterK) {
  return edge * mix(1.0, ${glf(1 - RIPARIAN.cureFade)}, cure) * (1.0 - ${glf(RIPARIAN.winterFade)} * winterK);
}
float tgRiparianDry(float dry, float cure, float stub, float rip) {
  return mix(dry, min(dry, ${glf(RIPARIAN.dryBase)} + ${glf(RIPARIAN.dryCure)} * cure + ${glf(RIPARIAN.dryStub)} * stub), rip);
}
float tgCuredFloor(float dry, float cure, float rip) {
  return max(dry, cure * smoothstep(${glf(UPLAND.from)}, ${glf(UPLAND.to)}, cure) * ${glf(UPLAND.floor)} * (1.0 - rip));
}
float tgDroughtRip(float rip, float drought) {
  return rip * (1.0 - ${glf(DROUGHT.rip)} * drought);
}
float tgDroughtDry(float dry, float drought, float rip) {
  return max(dry, drought * ${glf(DROUGHT.dry)} * (1.0 - ${glf(DROUGHT.ripKeep)} * rip));
}
vec3 tgDroughtTint(vec3 c, float drought, float rip) {
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 straw = vec3(lum * ${glf(DROUGHT.lift)}) * vec3(${DROUGHT.straw.map(glf).join(', ')});
  return mix(c, straw, ${glf(DROUGHT.amount)} * drought * (1.0 - ${glf(DROUGHT.ripKeep)} * rip));
}
vec3 tgDroughtSoil(vec3 soil, float drought) {
  return mix(soil, vec3(${DROUGHT.dust.map(glf).join(', ')}), ${glf(DROUGHT.soil)} * drought);
}
// The aspect band is geometry plus light only, so it can be evaluated per vertex (nrm: ground normal, L: unit direction toward the
// light): rgb = the colour multiplier at full strength, a = how strongly the light lets it show (a low sun shows it most).
vec4 tgAspectBand(vec3 nrm, vec3 L) {
  float sl = length(nrm.xz);
  float slopeK = smoothstep(${glf(ASPECT.slope0)}, ${glf(ASPECT.slope1)}, sl);
  float facing = dot(nrm.xz / max(sl, 1e-4), L.xz / max(length(L.xz), 1e-4)) * slopeK;
  float low = 1.0 - smoothstep(0.15, 0.75, L.y);
  vec3 sunC = vec3(${ASPECT.sun.map(glf).join(', ')});
  vec3 shadeC = vec3(${ASPECT.shade.map(glf).join(', ')});
  return vec4(mix(vec3(1.0), facing >= 0.0 ? sunC : shadeC, abs(facing)), ${glf(ASPECT.base)} + ${glf(ASPECT.low)} * low);
}
// amt: 0..1 strength per pixel (dryness of the ground, off at night and under living grass)
vec3 tgAspectApply(vec4 band, float amt) {
  return mix(vec3(1.0), band.rgb, clamp(amt, 0.0, 1.0) * band.a);
}
vec3 tgAspectTint(vec3 nrm, vec3 L, float amt) {
  return tgAspectApply(tgAspectBand(nrm, L), amt);
}
`;
