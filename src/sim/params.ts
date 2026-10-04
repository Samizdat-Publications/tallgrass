// Every tunable number in the simulation lives here. Overrides arrive as a flat
// Record<string, number> (e.g. from the batch harness: {"bison.metabolism": 0.0009}).
import { Sp, SPECIES_COUNT } from './types';

export interface SpeciesParams {
  /** Maximum age in ticks (senescence hazard rises from 60% of this). */
  maxAge: number;
  matureAge: number;
  gestation: number;
  /** Ticks after giving birth before the next conception. */
  birthCooldown: number;
  /** Mean litter size before the litter gene. */
  litter: number;
  walkSpeed: number;
  runSpeed: number;
  /** Ticks of full sprint from fresh. */
  stamina: number;
  sight: number;
  /** Energy per tick at rest for an average-size animal (energy is 0..1). */
  metabolism: number;
  /** Hydration loss per tick. 0 = never needs water. */
  thirst: number;
  /** Grass biomass removed per tick while grazing (herbivores). */
  bite: number;
  /** Energy gained per unit of grass biomass. */
  foodValue: number;
  /** Meat units in an adult carcass (1 meat unit fills one wolf stomach). */
  meat: number;
  /** How hard it is to bring down (predator kill roll divisor). */
  toughness: number;
  /** Starting population. */
  initial: number;
  /** Social radius for herd/pack cohesion in meters. */
  herdRadius: number;
  /** How far (fraction of sight) a non-hunting predator may come before this prey bolts. */
  wariness: number;
  /** Kill-resistance added per healthy adult herd-mate nearby. */
  defense: number;
  /** 0..1 how much coat camouflage matters for being spotted. */
  camo: number;
  /** 0 = grazer (grass only), 1 = browser (forbs and shrubs first, grass at half value). */
  diet: number;
  /** Juveniles younger than this lie hidden in the grass while their mother grazes nearby (0 = never). */
  hideAge: number;
  /** Most young per birth, however the litter gene evolves (bison almost never twin). */
  maxLitter: number;
}

const base = (o: Partial<SpeciesParams>): SpeciesParams => ({
  maxAge: 3000, matureAge: 500, gestation: 150, birthCooldown: 400, litter: 1,
  walkSpeed: 1.4, runSpeed: 9, stamina: 120, sight: 35, metabolism: 1 / 1200, thirst: 1 / 900,
  bite: 0.006, foodValue: 0.42, meat: 1, toughness: 1, initial: 0, herdRadius: 12,
  wariness: 0.4, defense: 0, camo: 0.5, diet: 0, hideAge: 0, maxLitter: 99,
  ...o,
});

export interface Params {
  species: SpeciesParams[];
  // vegetation
  grassGrowth: number;
  /** Starting grass as a fraction of capacity (the world opens already grazed). */
  grassInit: number;
  grassSeedFloor: number;
  winterDieback: number;
  droughtGrowth: number;
  rainGrowth: number;
  soilDegrade: number;
  soilRecover: number;
  trampleRun: number;
  trampleWalk: number;
  grazeMin: number;
  /** Body condition a female needs before she will conceive. */
  conceiveEnergy: number;
  migrateBelow: number;
  /** Herbivore personal space (m) and the distance from the local herd centre beyond which an animal drifts back (m). */
  herdSpacing: number;
  /** Neighbors closer than this (m) push apart toward herdSpacing. */
  herdSepRange: number;
  herdCohesion: number;
  /** Type III prey switching: wolves weight a prey species by N / (N + this). 0 = off. */
  wolfRareHalf: number;
  /** 1 = founders start part-way through pregnancy or cooldown instead of all ready to breed. 0 = off. */
  founderDesync: number;
  /** A pack needs at least this much meat stored from kills to breed (0 = any). */
  wolfBreedStore: number;
  /** Litter size factor = base + span x (larder fill, 0..1). v4: 0.6 + 0.5. */
  wolfLitterBase: number;
  wolfLitterSpan: number;
  /** Prey count (bison + 0.4 x pronghorn) at which wolf den spacing and pack size are nominal; 0 = fixed capacity. */
  wolfPreyRef: number;
  /** 1 = wolves judge how alone a target is by its own herd-mates nearby, not by the crowd in its grid cell. */
  loneIndividual: number;
  /** Width in seasons of the yearly conception window that puts births in mid-spring (0 = conceive any time outside winter). */
  matingWindow: number;
  /** If > 0, grazing and resting herbivores keep within this many metres of their nearest herd-mate instead of drifting to the herd centre (0 = centre). */
  herdNearest: number;
  /** Amplitude of the slow climate cycle on grass growth (0 = off; 0.3 = +/-30%). */
  climateAmp: number;
  /** Rate per year at which a pair of cougars wanders in while fewer than two live in the valley (0 = closed valley). */
  cougarImmigration: number;
  // fear
  fearKill: number;
  fearKillRadius: number;
  fearPredatorStamp: number;
  fearDecay: number;
  fearWeight: number;
  // vigilance
  detectBase: number;
  vigilancePerNeighbor: number;
  alarmContagion: number;
  fearVigilance: number;
  // predators
  wolfHuntHunger: number;
  wolfKillChance: number;
  wolfEatRate: number;
  wolfPackStoreShare: number;
  wolfPackMax: number;
  wolfDenMinDist: number;
  wolfTerritory: number;
  wolfPupDenAge: number;
  wolfInjuryChance: number;
  wolfImmigration: number;
  /** If > 0, wolves are absent at first and this many arrive at wolfArrivalTick (a natural recolonization). */
  wolfArrivalTick: number;
  wolfArrivalCount: number;
  cougarKillChance: number;
  cougarAmbushRadius: number;
  /** Same-sex adults keep their home ranges at least this far apart (m). */
  cougarRange: number;
  wolfOpportunism: number;
  wolfTestGiveUp: number;
  wolfStrife: number;
  wolfScentHerd: number;
  wolfScentPow: number;
  wolfSmallGame: number;
  ravenNestSites: number;
  // carcasses
  carcassRot: number;
  carcassSoil: number;
  // disease
  diseaseBeta: number;
  diseaseSparkDensity: number;
  diseaseSpark: number;
  diseaseTicks: number;
  diseaseMetab: number;
  // genetics
  mutation: number;
  // misc
  maxAgents: number;
  /** 1 = old free steering for every animal; steerFreeUrgent = free steering only in chases and flights. */
  steerFree: number;
  steerFreeUrgent: number;
  huntNeedsScent: number;
}

export function defaultParams(): Params {
  const species: SpeciesParams[] = new Array(SPECIES_COUNT);
  species[Sp.Bison] = base({
    // v5: one calf about every 1,450 ticks and a longer life, so the herd can't outbreed a crash in a season
    maxAge: 8000, matureAge: 600, gestation: 200, birthCooldown: 1250, litter: 1.0,
    walkSpeed: 1.5, runSpeed: 10, stamina: 140, sight: 38, metabolism: 1 / 1300, thirst: 1 / 1500,
    bite: 0.0065, foodValue: 0.55, meat: 7, toughness: 3.6, initial: 800, herdRadius: 14,
    wariness: 0.4, defense: 0.6, camo: 0.25,
  });
  species[Sp.Wolf] = base({
    maxAge: 9600, matureAge: 1200, gestation: 0, birthCooldown: 0, litter: 4.5,
    walkSpeed: 2.2, runSpeed: 12.5, stamina: 150, sight: 60, metabolism: 1 / 950, thirst: 1 / 1600,
    meat: 1.5, toughness: 1.4, initial: 32, herdRadius: 18,
  });
  species[Sp.Raven] = base({
    maxAge: 7200, matureAge: 600, gestation: 120, birthCooldown: 1400, litter: 2,
    walkSpeed: 7, runSpeed: 11, stamina: 1e9, sight: 130, metabolism: 1 / 900, thirst: 0,
    meat: 0, toughness: 0.2, initial: 30, herdRadius: 40,
  });
  // pronghorn: fast, wary, light, fecund; outruns a healthy wolf, so wolves take fawns, the sick and the tired
  species[Sp.Deer] = base({
    maxAge: 4500, matureAge: 420, gestation: 150, birthCooldown: 1000, litter: 1.4,
    walkSpeed: 1.7, runSpeed: 15.5, stamina: 90, sight: 55, metabolism: 1 / 1300, thirst: 1 / 2200,
    bite: 0.0052, foodValue: 0.55, meat: 2.2, toughness: 0.75, initial: 350, herdRadius: 12,
    wariness: 0.85, defense: 0.08, camo: 0.6, diet: 1, hideAge: 170,
  });
  species[Sp.Rabbit] = base({ initial: 0 });
  // cougar: solitary ambush hunter; waits in cover near water and springs a short, explosive sprint
  species[Sp.Cougar] = base({
    maxAge: 8400, matureAge: 1300, gestation: 300, birthCooldown: 2600, litter: 2.2,
    walkSpeed: 1.6, runSpeed: 18, stamina: 45, sight: 45, metabolism: 1 / 1050, thirst: 1 / 1700,
    meat: 2.5, toughness: 1.6, initial: 0, herdRadius: 0, camo: 0.8,
  });
  return {
    species,
    grassGrowth: 0.0016,
    grassInit: 0.45,
    grassSeedFloor: 0.00003,
    winterDieback: 0.00012,
    droughtGrowth: 0.3,
    rainGrowth: 1.35,
    soilDegrade: 0.00004,
    soilRecover: 0.00002,
    trampleRun: 0.0015,
    trampleWalk: 0.0002,
    grazeMin: 0.12,
    conceiveEnergy: 0.6,
    migrateBelow: 0.2,
    herdSpacing: 2.7,
    herdSepRange: Math.sqrt(7),
    herdCohesion: 6,
    wolfRareHalf: 150,
    founderDesync: 1,
    wolfBreedStore: 0,
    wolfLitterBase: 0.6,
    wolfLitterSpan: 0.5,
    wolfPreyRef: 0,
    loneIndividual: 0,
    matingWindow: 0,
    herdNearest: 0,
    climateAmp: 0,
    cougarImmigration: 0,
    fearKill: 0.7,
    fearKillRadius: 22,
    fearPredatorStamp: 0.0008,
    fearDecay: 0.00035,
    fearWeight: 0.9,
    detectBase: 0.35,
    vigilancePerNeighbor: 0.12,
    alarmContagion: 0.75,
    fearVigilance: 2.5,
    wolfHuntHunger: 0.62,
    wolfKillChance: 0.3,
    wolfEatRate: 0.012,
    wolfPackStoreShare: 0.45,
    wolfPackMax: 7,
    wolfDenMinDist: 200,
    wolfTerritory: 100,
    wolfPupDenAge: 450,
    wolfInjuryChance: 0.01,
    wolfImmigration: 0,
    wolfArrivalTick: 0,
    wolfArrivalCount: 12,
    cougarKillChance: 0.6,
    cougarAmbushRadius: 18,
    cougarRange: 120,
    wolfOpportunism: 0.25,
    wolfTestGiveUp: 0.05,
    wolfStrife: 0.002,
    wolfScentHerd: 12,
    wolfScentPow: 1,
    wolfSmallGame: 0.5,
    ravenNestSites: 320,
    carcassRot: 0.0009,
    carcassSoil: 0.05,
    diseaseBeta: 0.03,
    diseaseSparkDensity: 26,
    diseaseSpark: 0.0004,
    diseaseTicks: 450,
    diseaseMetab: 1.7,
    mutation: 0.035,
    maxAgents: 20000,
    steerFree: 0,
    steerFreeUrgent: 0,
    huntNeedsScent: 0,
  };
}

const SPECIES_PREFIX = ['bison', 'wolf', 'raven', 'deer', 'rabbit', 'cougar'];

/** Apply flat overrides like {"grassGrowth": 0.002, "bison.metabolism": 0.0008}. Unknown keys throw. */
export function applyOverrides(p: Params, o: Record<string, number> | undefined): Params {
  if (!o) return p;
  for (const [k, v] of Object.entries(o)) {
    const dot = k.indexOf('.');
    if (dot > 0) {
      const si = SPECIES_PREFIX.indexOf(k.slice(0, dot));
      const field = k.slice(dot + 1) as keyof SpeciesParams;
      if (si < 0 || !(field in p.species[si])) throw new Error(`unknown param ${k}`);
      (p.species[si] as unknown as Record<string, number>)[field] = v;
    } else {
      if (!(k in p) || k === 'species') throw new Error(`unknown param ${k}`);
      (p as unknown as Record<string, number>)[k] = v;
    }
  }
  return p;
}
