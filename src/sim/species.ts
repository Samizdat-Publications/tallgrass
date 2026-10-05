// Species registry: the one place that says what each species is. The sim, the worker and the headless
// harness ask this table (who is a grazer, who is prey, who hunts whom, how threatening) instead of
// switching on species ids. Per-species biology that is genuinely unique (wolf packs, the cougar's
// ambush) stays keyed on `Sp` in sim.ts. This file imports nothing, so types.ts can derive from it.
//
// Fixed ids, shared by both tracks: Bison 0, Wolf 1, Raven 2, Pronghorn 3, Rabbit 4 (the jackrabbit), Cougar 5,
// Coyote 6, PrairieDog 7, Eagle 8, Hawk 9 (S7). Later work packages append MuleDeer 10, Beaver 11.

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
  // The jackrabbit (S4). The key stays 'rabbit' for compatibility (CSV columns, params, saved share codes). It is a field
  // species on the 32 x 32 coarse grid when the smallPrey param is on (src/sim/smallprey.ts); with smallPrey off it is
  // still the old individual-agent grazer, with no starting population, so the golden hashes do not move.
  { id: 4, key: 'rabbit', name: 'Jackrabbit', plural: 'Jackrabbits', repr: 'field', guild: 'grazer', prey: true, threat: 0, flies: false, traits: false, core: false, color: '#E9E4D4' },
  { id: 5, key: 'cougar', name: 'Cougar', plural: 'Cougars', repr: 'agent', guild: 'predator', prey: false, threat: 1, flies: false, traits: false, core: false, color: '#D27A8C' },
  // Coyote (S4 registers it, S5 gives it behaviour): a small, smart mesopredator that hunts the hares and dogs.
  { id: 6, key: 'coyote', name: 'Coyote', plural: 'Coyotes', repr: 'agent', guild: 'mesopredator', prey: false, threat: 0.3, flies: false, traits: false, core: false, color: '#D9AE4B' },
  // Prairie dog (S4): a field species, never an agent. Towns of burrows on flat, dry, open ground.
  { id: 7, key: 'prairiedog', name: 'Prairie dog', plural: 'Prairie dogs', repr: 'field', guild: 'grazer', prey: false, threat: 0, flies: false, traits: false, core: false, color: '#C8A778' },
  // Golden eagle (S7): a winter visitor that comes in through the open prairie (src/sim/sp/raptor.ts). Flies, hunts the small-prey fields,
  // feeds at carcasses. Not a threat to the grazers (threat 0, so it is not in the predator grid) and not a core species.
  { id: 8, key: 'eagle', name: 'Golden eagle', plural: 'Golden eagles', repr: 'agent', guild: 'raptor', prey: false, threat: 0, flies: true, traits: false, core: false, color: '#C44536' },
  // Red-tailed hawk (S7): a summer resident that nests in a cottonwood and leaves in autumn with its young.
  { id: 9, key: 'hawk', name: 'Red-tailed hawk', plural: 'Red-tailed hawks', repr: 'agent', guild: 'raptor', prey: false, threat: 0, flies: true, traits: false, core: false, color: '#2E8B57' },
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

/**
 * REACT[prey][predator] = how strongly a grazer reacts to a predator in the predator grid: a multiplier on its detection chance
 * (0 = ignores it). Wolves, cougars and everything else frighten every grazer fully (1). Coyotes are a minor threat: bison ignore
 * them, and the rest react at the coyote's registry threat (0.3), but in thinkHerbivore only the young and a doe with a fawn at heel
 * do so at all (the pronghorn herd as a whole is not harassed by coyotes). Rows and columns are indexed by species id.
 */
export const REACT: number[][] = (() => {
  const r: number[][] = SPECIES.map(() => SPECIES.map(() => 1));
  const coy = SPECIES.findIndex((s) => s.key === 'coyote');
  const bison = SPECIES.findIndex((s) => s.key === 'bison');
  for (let prey = 0; prey < SPECIES.length; prey++) r[prey][coy] = prey === bison ? 0 : SPECIES[coy].threat;
  return r;
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
export const COAT_BASE: number[] = [0.85, 0.3, 0.97, 0.5, 0.5, 0.5, 0.45, 0.5, 0.8, 0.55];
/** Coat darkness stays within a species' believable range (bison stay dark, wolves stay pale). Unlisted species use [0, 1]. */
export const COAT_RANGE: [number, number][] = [[0.62, 1], [0.05, 0.65], [0.85, 1], [0.2, 0.8], [0.2, 0.8], [0.15, 0.6], [0.25, 0.7], [0.2, 0.8], [0.6, 1], [0.3, 0.8]];

/** Prefix used for per-species param overrides ("bison.metabolism"). Pronghorn keeps its v1 prefix "deer". */
export const PARAM_PREFIX: string[] = SPECIES.map((s) => (s.key === 'pronghorn' ? 'deer' : s.key));
