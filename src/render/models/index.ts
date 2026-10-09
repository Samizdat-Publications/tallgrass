import { SPECIES } from '../../sim/species';
import { buildBison } from './bison';
import { buildWolf } from './wolf';
import { buildRaven } from './raven';
import { buildPronghorn } from './pronghorn';
import { buildRabbit } from './rabbit';
import { buildCougar } from './cougar';
import { buildCoyote } from './coyote';
import { buildEagle } from './eagle';
import { buildHawk } from './hawk';
import { buildMuleDeer } from './muledeer';
import { buildBeaver } from './beaver';
import type { ModelDef } from './types';
import { A3_TUNE, getA3 } from './a3';

export type { ModelDef, AnimParams } from './types';

/** Model builders by registry key. A species with no entry here has no model and is not drawn (no crash, no placeholder). */
const BUILDERS: Record<string, () => ModelDef> = {
  bison: buildBison,
  wolf: buildWolf,
  raven: buildRaven,
  pronghorn: buildPronghorn,
  rabbit: buildRabbit,
  cougar: buildCougar,
  coyote: buildCoyote,
  eagle: buildEagle,
  hawk: buildHawk,
  muledeer: buildMuleDeer,
  beaver: buildBeaver,
};

const cache = new Map<number, ModelDef>();

/** Procedural model for a species id, built once and cached, or null when the species has no model yet. */
export function getModel(sp: number): ModelDef | null {
  let m = cache.get(sp);
  if (!m) {
    const key = SPECIES[sp]?.key;
    const build = key !== undefined ? BUILDERS[key] : undefined;
    if (!build) return null;
    m = build();
    // a3 spike (?a3=1): the authored mesh replaces the procedural near LOD of the species that have one
    const a3 = key !== undefined ? getA3(key) : null;
    if (a3) {
      m.nearGeometry = a3.geometry;
      m.a3 = { map: a3.map, normalMap: a3.normalMap ?? undefined, ...A3_TUNE[key!] };
      tintFarTo(m, a3.avg);
    }
    cache.set(sp, m);
  }
  return m;
}

/**
 * The near and far LODs cross-fade by a dither, so their average colour has to match or the switch pops. The far mesh is the procedural one,
 * coloured by its paint and the species coat; scale its vertex colours so its mean (at a middling coat) equals the authored mesh's mean albedo.
 */
function tintFarTo(m: ModelDef, avg: [number, number, number]): void {
  const col = m.geometry.getAttribute('aColor');
  const part = m.geometry.getAttribute('aPart');
  const mid = [0, 1, 2].map((k) => 0.5 * (m.coatPale[k] + m.coatDark[k]));
  const far = [0, 0, 0];
  const n = col.count;
  for (let v = 0; v < n; v++) {
    const c = part.getZ(v);
    for (let k = 0; k < 3; k++) far[k] += col.getComponent(v, k) * (1 - c + c * mid[k]);
  }
  const ratio = [0, 1, 2].map((k) => Math.min(2.5, Math.max(0.4, Math.pow(avg[k] / Math.max(1e-4, far[k] / n), 0.65))));
  for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) col.setComponent(v, k, col.getComponent(v, k) * ratio[k]);
  col.needsUpdate = true;
}
