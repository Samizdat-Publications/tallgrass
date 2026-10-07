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
import { lin } from './builder';
import type { ModelDef } from './types';

export type { ModelDef, AnimParams } from './types';

/**
 * Beaver (S14): no model of its own yet, so it borrows the rabbit's (the closest small animal on four legs) in a dark chestnut coat;
 * the animal layer draws it twice the rabbit's size (speciesScale in animals.ts). The paddle tail and the swimming pose are still to do.
 */
function buildBeaver(): ModelDef {
  return { ...buildRabbit(), coatPale: lin(0x6a4a2d), coatDark: lin(0x2f2217) };
}

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
    cache.set(sp, m);
  }
  return m;
}
