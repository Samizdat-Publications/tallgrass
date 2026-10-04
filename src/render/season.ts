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

/** GLSL float literal ("3.0", "0.95"). */
function glf(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/**
 * GLSL chunk for the shared curves, built from the constants above. Include it once in any shader that needs them.
 *   tgWinterK(s)                          winter amount 0..1 (raw season, same as the TS winterK for s in [0, 4))
 *   tgRiparian(edge, cure, winterK)       belt strength: edge falloff x cure fade x winter fade
 *   tgRiparianDry(dry, cure, stub, rip)   dryness inside the belt (capped low, a little drier with cure and stubble)
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
`;
