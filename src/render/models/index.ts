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
import { getA3 } from './a3';

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
      m.a3 = { map: a3.map, normalMap: a3.normalMap ?? undefined };
    }
    cache.set(sp, m);
  }
  return m;
}
