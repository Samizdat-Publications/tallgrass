import { Sp } from '../../sim/types';
import { buildBison } from './bison';
import { buildWolf } from './wolf';
import { buildRaven } from './raven';
import { buildPronghorn } from './pronghorn';
import { buildRabbit } from './rabbit';
import { buildCougar } from './cougar';
import type { ModelDef } from './types';

export type { ModelDef, AnimParams } from './types';

const cache = new Map<number, ModelDef>();

/** Procedural model for a species id (Sp.*). Built once and cached. */
export function getModel(sp: number): ModelDef {
  let m = cache.get(sp);
  if (!m) {
    switch (sp) {
      case Sp.Bison: m = buildBison(); break;
      case Sp.Wolf: m = buildWolf(); break;
      case Sp.Raven: m = buildRaven(); break;
      case Sp.Deer: m = buildPronghorn(); break;
      case Sp.Rabbit: m = buildRabbit(); break;
      case Sp.Cougar: m = buildCougar(); break;
      default: throw new Error('unknown species ' + sp);
    }
    cache.set(sp, m);
  }
  return m;
}
