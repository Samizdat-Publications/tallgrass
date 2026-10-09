// Which species a valley can have, so the population panel can give each one a fixed place from the first frame instead of
// slotting cards in as species turn up (which shuffled the ones already there). Pure: no DOM, so it runs under Node.
import type { Params } from '../sim/params';
import { SPECIES } from '../sim/species';

/** Species that always have a card, whatever the valley (the three founders every scenario starts with). */
const FOUNDERS = new Set(['bison', 'wolf', 'raven']);

/**
 * The species ids this valley can ever show, in registry order (the order the cards keep for good). A species is in when it has founders,
 * or when a system that brings it in is switched on: the small-prey web (jackrabbits, prairie dogs), the raptors (hawks, and eagles when
 * the prairie is open), beavers, and the open-valley arrivals (cougars, coyotes, mule deer). A species added later by a god tool is
 * not listed here; the panel still shows it, in its registry place, once it has been alive.
 */
export function expectedSpecies(p: Pick<Params, 'species' | 'smallPrey' | 'raptors' | 'openPrairie' | 'beavers' | 'cougarImmigration' | 'coyoteInRate' | 'muledeerRescue'>): number[] {
  const keys = new Set<string>(FOUNDERS);
  for (const def of SPECIES) if (def.repr === 'agent' && (p.species[def.id]?.initial ?? 0) > 0) keys.add(def.key);
  if (p.smallPrey > 0) {
    keys.add('rabbit');
    keys.add('prairiedog');
  }
  if (p.raptors > 0) {
    keys.add('hawk');
    if (p.openPrairie > 0) keys.add('eagle');
  }
  if (p.beavers > 0) keys.add('beaver');
  if (p.openPrairie > 0) {
    if (p.cougarImmigration > 0) keys.add('cougar');
    if (p.coyoteInRate > 0) keys.add('coyote');
    if (p.muledeerRescue > 0) keys.add('muledeer');
  }
  return SPECIES.filter((d) => keys.has(d.key)).map((d) => d.id);
}
