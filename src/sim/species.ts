// Species registry: the one place that says what each species is. The sim, the worker and the headless
// harness ask this table (who is a grazer, who is prey, who hunts whom, how threatening) instead of
// switching on species ids. Per-species biology that is genuinely unique (wolf packs, the cougar's
// ambush) stays keyed on `Sp` in sim.ts. This file imports nothing, so types.ts can derive from it.
//
// Fixed ids, shared by both tracks: Bison 0, Wolf 1, Raven 2, Pronghorn 3, Rabbit 4, Cougar 5.
// Later work packages append Coyote 6, PrairieDog 7, Eagle 8, Hawk 9, MuleDeer 10, Beaver 11.

export interface SpeciesDef {
  id: number;
  /** Lower-case key used in CSV columns (pop_<key>) and param prefixes. */
  key: string;
  name: string;
  plural: string;
  /** 'agent' = individual animals in the agent pool; 'field' = a density field (later work packages). */
  repr: 'agent' | 'field';
  guild: 'grazer' | 'browser' | 'predator' | 'mesopredator' | 'scavenger' | 'raptor' | 'engineer';
  /** Goes in the prey grid; who may target it is the DIET table. */
  prey: boolean;
  /** 0..1 how hard grazers react to it (wolf 1, cougar 1, coyote 0.3, others 0). Above 0 means it goes in the predator grid. */
  threat: number;
  flies: boolean;
  /** Heritable traits are recorded in history rows and CSV columns. */
  traits: boolean;
  /** Counts in the persistence gate ("all core species persist"). */
  core: boolean;
  /** UI colour (same values as src/ui/palette.ts SPECIES_COLORS). */
  color: string;
}

export const SPECIES: SpeciesDef[] = [
  { id: 0, key: 'bison', name: 'Bison', plural: 'Bison', repr: 'agent', guild: 'grazer', prey: true, threat: 0, flies: false, traits: true, core: true, color: '#CF8B4E' },
  { id: 1, key: 'wolf', name: 'Wolf', plural: 'Wolves', repr: 'agent', guild: 'predator', prey: false, threat: 1, flies: false, traits: true, core: true, color: '#6FA4EA' },
  { id: 2, key: 'raven', name: 'Raven', plural: 'Ravens', repr: 'agent', guild: 'scavenger', prey: false, threat: 0, flies: true, traits: false, core: true, color: '#B48CE6' },
  { id: 3, key: 'pronghorn', name: 'Pronghorn', plural: 'Pronghorn', repr: 'agent', guild: 'browser', prey: true, threat: 0, flies: false, traits: true, core: true, color: '#4FC4BC' },
  // rabbit stays an individual-agent species with no starting population until it becomes a field species
  { id: 4, key: 'rabbit', name: 'Rabbit', plural: 'Rabbits', repr: 'agent', guild: 'grazer', prey: true, threat: 0, flies: false, traits: false, core: false, color: '#E9E4D4' },
  { id: 5, key: 'cougar', name: 'Cougar', plural: 'Cougars', repr: 'agent', guild: 'predator', prey: false, threat: 1, flies: false, traits: false, core: false, color: '#D27A8C' },
];

/** Number of species ids in play. */
export const REGISTRY_COUNT = SPECIES.length;

/**
 * DIET[predator][prey] = hunting weight (0 = never a target). Wolves and cougars take every grazer in the prey grid.
 * Rows and columns are indexed by species id and are always REGISTRY_COUNT wide.
 */
export const DIET: number[][] = (() => {
  const d: number[][] = SPECIES.map(() => SPECIES.map(() => 0));
  const hunts = (pred: number, prey: number[], w = 1): void => { for (const p of prey) d[pred][p] = w; };
  hunts(1, [0, 3, 4]); // wolf: bison, pronghorn, rabbit
  hunts(5, [0, 3, 4]); // cougar: bison, pronghorn, rabbit
  return d;
})();

export const SPECIES_BY_KEY: Record<string, SpeciesDef> = Object.fromEntries(SPECIES.map((s) => [s.key, s]));

/** Per-id lookup tables for hot loops. */
export const IS_PREY: Uint8Array = Uint8Array.from(SPECIES, (s) => (s.prey ? 1 : 0));
export const THREAT: Float32Array = Float32Array.from(SPECIES, (s) => s.threat);

export function isGrazer(sp: number): boolean {
  const g = SPECIES[sp]?.guild;
  return g === 'grazer' || g === 'browser';
}
export function isPredator(sp: number): boolean {
  const g = SPECIES[sp]?.guild;
  return g === 'predator' || g === 'mesopredator' || g === 'raptor';
}
export function isPrey(sp: number): boolean {
  return IS_PREY[sp] === 1;
}
/** Does this species frighten grazers (goes in the predator grid)? */
export function isThreat(sp: number): boolean {
  return THREAT[sp] > 0;
}
export function canHunt(predator: number, prey: number): boolean {
  return (DIET[predator]?.[prey] ?? 0) > 0;
}

/** Base coat darkness of a new founder, by species id (0 pale .. 1 dark). Species not listed use 0.5. */
export const COAT_BASE: number[] = [0.85, 0.3, 0.97, 0.5, 0.5, 0.5];
/** Coat darkness stays within a species' believable range (bison stay dark, wolves stay pale). Unlisted species use [0, 1]. */
export const COAT_RANGE: [number, number][] = [[0.62, 1], [0.05, 0.65], [0.85, 1], [0.2, 0.8], [0.2, 0.8], [0.15, 0.6]];

/** Prefix used for per-species param overrides ("bison.metabolism"). Pronghorn keeps its v1 prefix "deer". */
export const PARAM_PREFIX: string[] = SPECIES.map((s) => (s.key === 'pronghorn' ? 'deer' : s.key));
