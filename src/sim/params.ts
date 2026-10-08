// Every tunable number in the simulation lives here. Overrides arrive as a flat
// Record<string, number> (e.g. from the batch harness: {"bison.metabolism": 0.0009}).
import { PARAM_PREFIX } from './species';
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
  /** Extra metabolism while running for a fast build (0 = off), for this species: x (1 + sprintCost * (speed^2 - 1)).
   *  Where this is 0 the global `sprintCost` below applies (S9). */
  sprintCost: number;
}

const base = (o: Partial<SpeciesParams>): SpeciesParams => ({
  maxAge: 3000, matureAge: 500, gestation: 150, birthCooldown: 400, litter: 1,
  walkSpeed: 1.4, runSpeed: 9, stamina: 120, sight: 35, metabolism: 1 / 1200, thirst: 1 / 900,
  bite: 0.006, foodValue: 0.42, meat: 1, toughness: 1, initial: 0, herdRadius: 12,
  wariness: 0.4, defense: 0, camo: 0.5, diet: 0, hideAge: 0, maxLitter: 99, sprintCost: 0,
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
  /** If > 0, only this share of the shore (0.6 to 0.8 are the screened values) is a drinking place, in seeded 40 m blocks, so thirsty grazers gather at a few spots
   *  instead of ringing every pond; a grazer that has drunk its fill also drifts back off the bank. 0 = off: any shore is a drinking place. */
  drinkSpots: number;
  /** If > 0, personal space while grazing: a grazing herbivore keeps this multiple of the usual separation (spacing and range) from herd-mates,
   *  and its cohesion pull is divided by the same factor, so the herd spreads out over the patch (1.6 is the screened value). 0 = off (1 would match the old spacing). */
  herdSpacingGraze: number;
  /** Amplitude of the slow climate cycle on grass growth (0 = off; 0.3 = +/-30%). */
  climateAmp: number;
  /** Shortens the valley year k-fold (1 = 2,400-tick years). Biology per tick is unchanged, so animals live k times as
   *  many valley-years and booms and recoveries take k times as many years; only the seasons turn faster. Wolf litters
   *  are divided by k because wolves breed once a year. Timers that aren't seasons (carcass life, immunity, outbreak
   *  spacing, drought length, immigration) stay fixed in ticks. */
  calendarScale: number;
  /** Drought refuges (0 = off): how much of a drought's cut in growth, and its dieback, the wettest ground along the
   *  creek and ponds escapes. Riparian strips stay green through a drought, so herds have somewhere to go. */
  droughtRefuge: number;
  /** Extra metabolism while running for a fast build (0 = off): x (1 + sprintCost * (speed^2 - 1)), so a fast gene pays in
   *  every chase and a slow one saves. Meant to stop speed running to its limit within a century. */
  sprintCost: number;
  /** Master switch for Evolution v2 (S9; 0 = off). When 1, every evolution param below that the caller did not set takes
   *  the plan's value: per-species sprintCost (bison 0.2, pronghorn 0.05, wolf 0.15, coyote 0.1), bison maxLitter 1,
   *  herdEyes 1.5 and the wolf coat search image (coatSearch 1). Explicit overrides win, so single parts can be screened. */
  evolution2: number;
  /** Wolf coat search image (S9; 0 = off). Each pack keeps, for every prey species, an image of the coat it last killed. */
  coatSearch: number;
  /** How far the image moves toward the coat of each kill: image += rate x (coat - image). The first kill sets it. */
  coatSearchRate: number;
  /** A prey animal whose coat is within coatSearchWindow of its pack's image is noticed from coatSearchBoost x as far. */
  coatSearchBoost: number;
  coatSearchWindow: number;
  /** Herd-minded animals heed their neighbours' alarm more (0 = off): the many-eyes vigilance from neighbours is scaled by
   *  1 + herdEyes * (herding gene - 1), so herding pays against wolves instead of fading. */
  herdEyes: number;
  /** Lean-times births (0 = off): each newborn grazer is lost with a chance of leanLitter x (1 - mother's condition), where
   *  condition runs from 0 at energy 0.3 to 1 at 0.8, so a crowded, hungry herd raises fewer young before it starves. */
  leanLitter: number;
  /** Rate per year at which a pair of cougars wanders in while fewer than two live in the valley (0 = closed valley). */
  cougarImmigration: number;
  /** When an already-fleeing grazer is scared again, how much of its current flight line it keeps (0 = turn straight away from the new threat). */
  fleeMomentum: number;
  // open prairie (S1): animals come and go through the border corridors. Rates are per base year (2,400 ticks).
  /** Master switch (0 = closed valley). The vagrant ravens below have their own switch. */
  openPrairie: number;
  /** Wolf pairs arriving per base year, rolled every 100 ticks, when a den site is free. */
  wolfInRate: number;
  /** Base years a pack-less adult wolf wanders before it leaves the valley. */
  wolfOutAfter: number;
  /** Pronghorn autumn exodus: fraction leaving = deerOutK x (1 - browse per pronghorn / deerBref), clamped to 0..0.5. */
  deerOutK: number;
  /** Pronghorn spring return: share of the gap to deerKb that walks back in. */
  deerInK: number;
  /** Most pronghorn that return in one spring. */
  deerInMax: number;
  /** A group of this many walks in each spring when fewer than 20 pronghorn remain. */
  deerRescue: number;
  /** Browse per pronghorn (summed browse over land cells / pronghorn) in autumn (season 2.6) that sends nobody away. Measured. */
  deerBref: number;
  /** Pronghorn equilibrium population the spring return refills toward. Measured. */
  deerKb: number;
  /** Vagrant ravens (0 = off): scavengers from outside that follow carrion into the valley and never breed. */
  ravenVagrants: number;
  /** Vagrants wanted per unit of remaining carcass meat (the unit of cMeat). Measured. */
  ravenVagrantK: number;
  /** Vagrant ceiling. */
  ravenVagrantCap: number;
  // small-prey web (S4, src/sim/smallprey.ts): jackrabbits and prairie dogs as density fields on the 32 x 32 coarse grid.
  // Rates are per base year (2,400 ticks). Everything is off at smallPrey 0.
  /** Master switch (0 = rabbits stay the old individual agents with no founders, and prairie dogs do not exist). */
  smallPrey: number;
  /** Jackrabbits per coarse cell (16 m) at full food. */
  hareK: number;
  /** Jackrabbit growth per base year in the breeding season (spring and summer). */
  hareR: number;
  /** Jackrabbit loss per base year outside the breeding season. */
  hareWinterLoss: number;
  /** Weather: each valley year draws a quality 1 +- hareYearVar that multiplies the hares' growth and (reversed) their winter loss (0 = off, every year alike). */
  hareYearVar: number;
  /** Prairie dogs per suitable coarse cell (scaled by the cell's dogCap and soil). */
  dogK: number;
  /** Prairie dog growth per base year, applied as one spring pulse each valley year. */
  dogR: number;
  /** Sylvatic plague starts per base year per large town in summer. */
  plagueRate: number;
  /** 1 = wolf mousing success comes from SmallPrey.take on the local hare and dog density (needs smallPrey), 0 = the flat wolfSmallGame trickle. */
  smallGameField: number;
  /** Multiplier on the eagles' and hawks' preference for prairie dogs, in where they hunt and what they catch (v7b). 1 = the S7 tables. */
  raptorDogPref: number;
  /** Open prairie (S1): base years between prairie dog colonies arriving from outside while the valley has no town (was the constant RESCUE_DOG_YEARS 20). */
  dogRescueYears: number;
  /** Grass in prairie dog towns is clipped short: the share of grass above the clip height removed per 50 ticks in a full town (0 = off). */
  dogClip: number;
  /** Bison migration and grazing prefer the edges of towns by this much grass-equivalent (0 = off). */
  dogGrazeBonus: number;
  // coyotes (S5, src/sim/sp/coyote.ts): they exist only when `coyote.initial` (or a god tool) puts some in the valley.
  /** Radius (m) of the range a pair hunts around its den. */
  coyoteTerritory: number;
  /** Coyote dens sit at least this far (m) from each other. */
  coyoteDenSpacing: number;
  /** A new coyote den keeps at least this far (m) from every wolf den. */
  coyoteWolfAvoid: number;
  /** Chance, rolled once per 20 ticks per wolf, that a wolf within 3 m of a coyote kills it (when the coyote is at a carcass or in the wolf's core). */
  coyoteKilledByWolf: number;
  /** A coyote hunts small prey (mousing) below this energy. */
  coyoteHuntHunger: number;
  /** Carcass meat a coyote eats per tick. */
  coyoteEatRate: number;
  /** Mousing trickle (x metabolism per tick) when the small-prey web is off. */
  coyoteSmallGame: number;
  /** Per think (3 ticks) chance of spotting a hidden fawn within 40 m at perfect contrast. */
  coyoteFawnFind: number;
  /** Per tick chance of killing a fawn it has caught up with, before the fawn's toughness and its mother's guard. */
  coyoteFawnKill: number;
  /** Intake over the last valley year, in units of metabolism per tick, that counts as a food index of 1. */
  coyoteFoodRef: number;
  /** Share of the energy a coyote takes from carcasses that counts toward its food index (live prey counts in full): the lower, the more the litters follow the hares. */
  coyoteCarrionShare: number;
  /** Pups younger than this (ticks) shadow their mother and draw energy from her. */
  coyotePupDenAge: number;
  /** Energy per tick a pup draws from its mother. */
  coyotePupFeed: number;
  /** Base years a coyote with no den wanders before it leaves the valley (needs openPrairie). */
  coyoteOutAfter: number;
  /** Rate per base year at which a coyote pair walks in from the wider prairie while fewer than 4 live in the valley (needs openPrairie; 0 = never). */
  coyoteInRate: number;
  // raptors (S7, src/sim/sp/raptor.ts): golden eagles (winter visitors) and red-tailed hawks (summer residents). Off at raptors 0.
  /** Master switch (0 = no seasonal arrivals; an eagle or hawk put in by a god tool still lives and hunts). Eagles also need openPrairie to arrive. */
  raptors: number;
  /** Eagles that arrive together each winter: min and max (the count follows how rich the hares are). */
  eagleMin: number;
  eagleMax: number;
  /** Hawk pairs that return to nest each spring: min and max (fewer when the valley has too few tall cottonwoods). */
  hawkPairsMin: number;
  hawkPairsMax: number;
  /** A raptor hunts small prey (or has a hungry brood) below this energy. Low on purpose: a catch is worth 0.2 to 0.4 of the bar and a full bar wastes it. */
  raptorHuntHunger: number;
  /** A raptor goes to a carcass below this energy (eagles; a hawk only when the web is off or it is starving). */
  raptorCarrionHunger: number;
  /** Carcass meat a raptor eats per tick, and the energy a unit of meat is worth to it. */
  raptorEatRate: number;
  raptorMeatEnergy: number;
  /** Hawk nests keep at least this far (m) from each other. */
  hawkNestSpacing: number;
  // mule deer (S8, src/sim/sp/muledeer.ts): they exist only when `muledeer.initial` (or a god tool) puts some in the valley.
  /** A mule deer browses only where tree and shrub cover is above this, or in the draws (below). */
  muledeerCover: number;
  /** The draws: ground within this many metres of the creek or a pond counts as habitat however open it is. */
  muledeerDrawDist: number;
  /** Founder groups hold muledeerGroupMin to muledeerGroupMax animals; a group that grows past the maximum stops cohering. */
  muledeerGroupMin: number;
  muledeerGroupMax: number;
  /** With openPrairie on, each spring a group of this many walks in when fewer than muledeerRescueBelow mule deer live here (0 = never). */
  muledeerRescue: number;
  muledeerRescueBelow: number;
  // beavers (S14, src/sim/sp/beaver.ts and src/sim/ponds.ts): the whole system is off unless `beavers` is above 0 or `beaver.initial` puts founders in the valley.
  /** Master switch (0 = off). On, new colonies can found themselves on free creek reaches (the founders' dispersers; with openPrairie also pairs arriving from outside) and the god tool works. */
  beavers: number;
  /** Colony site: willow or cottonwood food within this many metres of the dam (the food index counts trees within it, shrubs at 0.35). */
  beaverFoodRadius: number;
  /** A colony is founded only where the food index is at least this (about this many trees within the radius). */
  beaverFoodMin: number;
  /** Colonies and dams keep at least this far (m) apart along the creek. */
  beaverSpacing: number;
  /** Founders per colony when `beaver.initial` places them: a breeding pair and yearlings (2 to 6). */
  beaverColonySize: number;
  /** The dam crest rises this many metres per season (SEASON_TICKS) while a colony works on it, up to beaverCrestMax. */
  beaverCrestRate: number;
  beaverCrestMax: number;
  /** Food: trees a beaver fells per base year (2,400 ticks), the share of the gap to the full stand that grows back per base year, and the share of the stand left below which the colony moves on. */
  beaverFoodRate: number;
  beaverRegrow: number;
  beaverFoodLeave: number;
  /** A dam breaches in a flood with chance beaverBreachP x severity x (crest / max crest), and on its own with this chance per valley year. */
  beaverBreachP: number;
  beaverBreachYear: number;
  /** An abandoned dam decays over a random 2 to 4 valley years (min and max) back to nothing, and the pond drains into the meadow. */
  beaverDecayMin: number;
  beaverDecayMax: number;
  /** Greener ribbon: moisture added at the pond's edge (fades to 0 at 30 m), the share of a drought's cut in growth it escapes there, and the meadow's capacity bonus and how many valley years it lasts. */
  beaverMoisture: number;
  beaverShield: number;
  beaverMeadowCap: number;
  beaverMeadowYears: number;
  /** Chance per base year that a pair of beavers arrives from outside the valley (needs openPrairie and a free site). */
  beaverArrival: number;
  /** Swimming speed (m/s) and how far (m) a beaver wanders from the water to gnaw. */
  beaverSwim: number;
  beaverRange: number;
  /** Rate per base year at which a pair of cougars walks in from the wider prairie while fewer than two live here, once cougars have lived here (needs openPrairie; 0 = never). */
  cougarInRate: number;
  /** Storm cells and lightning (0 = off). On, thunderstorm days send cells across the valley; dry lightning can start
   *  fires, and heavy rain (above 0.5) stops fire spreading. See storms.ts. */
  stormCells: number;
  /** Strike chance per tick per storm cell at full intensity. */
  lightningRate: number;
  /** Chance a strike in dry, cured grass (season 1.4 to 3.1, grass above 0.3, rain below 0.35) starts a fire. */
  lightningIgnite: number;
  /** How readily a grass fire spreads to its neighbours, as a multiple of the screened rate (1 = as before; S17 Storm season uses 3 to 4). */
  fireSpread: number;
  /** Winter (S11, winter.ts; 0 = off). On, snow builds a depth field on the coarse grid (it drifts into hollows and melts with warmth),
   *  the grazers lose food to it, moving costs more and wolves kill more easily; `blizzard` and `hardWinter` events fire. The value
   *  scales how much snow falls (1 = the screened amount). */
  snowDepth: number;
  /** Snowfalls per winter, on average (a hard winter has 1.8 times as many). */
  snowStorms: number;
  /** Depth added by one full-strength snowfall (before snowDepth; the field is 0..1). */
  snowFall: number;
  /** Wind drift: share of a cell's snow moved one cell downwind per season at wind strength 1 on level ground. */
  snowDrift: number;
  /** Melt per season of warmth above 0.14 (depth units; hollows melt a little slower). */
  snowMelt: number;
  /** Chance a winter is a hard one (more and deeper snowfalls, slow melt). */
  hardWinterP: number;
  /** Share of snowfalls that are blizzards (deeper, shorter, wind at 0.85 or more). */
  blizzardP: number;
  /** Grazing multiplier is 1 - k x depth: pronghorn, bison, and mule deer (they browse above the snow). */
  snowGrazePronghorn: number;
  snowGrazeBison: number;
  snowGrazeMule: number;
  /** Movement cost multiplier is 1 + snowMove x depth (ground animals that are moving). */
  snowMove: number;
  /** Wolf kill chance multiplier is 1 + snowKill x depth at the prey. */
  snowKill: number;
  /** Spring green-up delay in seasons (0 = off; 0.5 = the rise from dormancy begins half a season later, the late-spring peak stays). */
  greenUpShift: number;
  /** Chance per day, in summer, that a natural dry spell starts (0.1 = as screened; 0 = none, S17 Storm season). */
  summerDroughtP: number;
  /** Dust storms (S12, dust.ts; 0 = off). In a drought, with the wind above dustWind and at least dustBare of the land under dustBareGrass of grass,
   *  a storm starts (the plan's 0.6 wind and 0.3 grass never met in a drought: the valley's wind is a slow N(0.45, 0.07), so 0.6 is 2% of the time and 0.5 is a quarter of it;
   *  grass under 0.35 is about 40% of the land in a drought, under 0.3 only 34%) (chance dustP per 10-tick check, at least dustCooldown valley years apart). It lasts 200 to 450 ticks; the bare cells lose dustSoil
   *  of soil fertility over it, and every animal's sight is multiplied by 1 - (1 - dustVision) x intensity. */
  dustStorms: number;
  dustWind: number;
  dustBare: number;
  dustBareGrass: number;
  dustSoil: number;
  dustVision: number;
  dustP: number;
  dustCooldown: number;
  /** Grasshopper outbreaks (S12, hoppers.ts; 0 = off). A density field on the coarse grid that grows in the summer at hopperR x (dryHot - hopperCrit)
   *  per valley year (hot dry weather surges, rain suppresses it by hopperRain), dies back at hopperDie in the cold season, is topped up to hopperSeed
   *  of the cell in summer, and strips grass at hopperEat. `grasshopperOutbreak` fires when the valley mean passes hopperOutbreak. Coyotes (mousing),
   *  ravens (foraging) and hawks (stooping) feed on it at hopperCoyote, hopperRaven and hopperHawk. */
  grasshoppers: number;
  hopperR: number;
  hopperCrit: number;
  hopperRain: number;
  /** Year-to-year swing (+- of the dry-heat index) in egg and nymph survival, a fixed draw per valley year. */
  hopperYear: number;
  hopperDie: number;
  hopperSeed: number;
  hopperEat: number;
  hopperOutbreak: number;
  hopperCoyote: number;
  hopperRaven: number;
  hopperHawk: number;
  /** Spring floods (S12, springflood.ts; 0 = off). Snowmelt (floodMelt) and rain (floodRain) fill a wet index in late winter and spring; at floodThresh the
   *  land within floodBand m of the water floods for floodSeasons seasons: grass drowns (floodGrass x severity), animals are pushed out, young caught in the
   *  band drown (floodYoung x severity; adults floodAdult x severity), and the silt adds floodSilt x severity to the soil. */
  springFloods: number;
  floodBand: number;
  floodMelt: number;
  floodRain: number;
  floodThresh: number;
  floodSeasons: number;
  floodSilt: number;
  floodGrass: number;
  floodYoung: number;
  floodAdult: number;
  /** Dynamic trees (S13, trees.ts; 0 = off: the world's static tree list). The sim owns a tree list with stages (seedling, sapling, young, mature, snag), growth
   *  by age in base years (x treeGrowth), a lifespan, and a cover field rebuilt every season from the list. Cottonwoods recruit at the start of summer on moist,
   *  bare, unshaded ground within 30 m of water, at treeCwRecruit per cell per year x the seed source x bareness, x (1 + treeFloodBoost x severity) in the cells a
   *  flood covered in the last 1.5 years (a pulse of treeGroveMin or more seedlings raises a grove event). Junipers recruit in autumn on the ridges at
   *  treeJunRecruit x the seed source + treeJunBg, scaled by years since fire (zero on a burn, full after treeFireFree years) and room under treeJunCap trees;
   *  `encroachment` is raised when they hold treeEncroach of the ridge cells. Fire kills seedlings and saplings (treeFireSmall), young trees (treeFireYoung) and
   *  mature trees (treeFireMature, they stand on as snags). Deer in a 16 m cell slow seedlings and saplings by up to treeBrowse (x their density share). Seedlings
   *  die at treeSeedMort per year (more in drought, in thick grass and under browsing). */
  dynamicTrees: number;
  treeGrowth: number;
  treeCwRecruit: number;
  treeFloodBoost: number;
  /** Established cottonwoods (saplings and up) at which cottonwood recruitment has faded to nothing (linear room). */
  treeCwCap: number;
  treeGroveMin: number;
  treeJunRecruit: number;
  treeJunBg: number;
  treeJunCap: number;
  treeFireFree: number;
  treeFireSmall: number;
  treeFireYoung: number;
  treeFireMature: number;
  treeBrowse: number;
  treeSeedMort: number;
  treeEncroach: number;
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
  // canid disease (src/sim/disease.ts); cdvRate and mangeRate default to 0 = off
  /** Yearly distemper outbreak chance at 60 wolves; scales with (wolves / 60)^2, capped at 2x. */
  cdvRate: number;
  cdvPupDeath: number;
  cdvAdultDeath: number;
  /** Course of the illness in ticks. */
  cdvTicks: number;
  /** Immunity after recovery, in base years. */
  cdvImmuneYears: number;
  /** Yearly chance a case of mange arrives while there are more than 30 wolves. */
  mangeRate: number;
  /** Per day, per infected packmate. */
  mangeSpread: number;
  /** Severity gained per base year. */
  mangeGrowth: number;
  /** Winter cold cost is multiplied by (1 + mangeColdK * severity). */
  mangeColdK: number;
  /** Recovery chance per base year while energy > 0.7. */
  mangeRecover: number;
  /** Share of immigrants that carry mange (used when mangeRate > 0). */
  mangeImmigrantShare: number;
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
  // jackrabbit: a density field when smallPrey is on (hareK, hareR); these only matter for the old agent rabbit
  species[Sp.Rabbit] = base({ initial: 0 });
  // cougar: solitary ambush hunter; waits in cover near water and springs a short, explosive sprint
  species[Sp.Cougar] = base({
    maxAge: 8400, matureAge: 1300, gestation: 300, birthCooldown: 2600, litter: 2.2,
    walkSpeed: 1.6, runSpeed: 18, stamina: 45, sight: 45, metabolism: 1 / 1430, thirst: 1 / 1700,
    meat: 2.5, toughness: 1.6, initial: 6, herdRadius: 0, camo: 0.8, // v7c: initial 6 (was 0)
  });
  // coyote (S5; the plan's table): wolf-like yearly breeding at the spring tick (gestation and cooldown unused), smaller body, no founders by default.
  // The den, territory, wolf-avoidance and wolf-kill numbers are top-level params (coyoteTerritory...), like the wolf's.
  species[Sp.Coyote] = base({
    maxAge: 4800, matureAge: 900, gestation: 0, birthCooldown: 0, litter: 5,
    walkSpeed: 1.3, runSpeed: 11, stamina: 130, sight: 60, metabolism: 1 / 1800, thirst: 1 / 5000,
    meat: 0.8, toughness: 0.8, initial: 12, herdRadius: 12, // v6b: six pairs (was 0)
  });
  // prairie dog: a field species. Only initial (0 = the default colonies) and the smallPrey params apply; the rest keeps the
  // lookup safe for any code that indexes the species table by id
  species[Sp.PrairieDog] = base({ initial: 0, herdRadius: 0 });
  // golden eagle (S7): a winter visitor, no founders. walkSpeed is the cruise and soaring speed, runSpeed the stoop speed (m/s), sight how far a
  // carcass is noticed. Metabolism is low (a bird of prey fasts well); a hare is worth 0.4 of the bar (GAIN.eagle in smallprey.ts). No meat, no thirst.
  species[Sp.Eagle] = base({
    maxAge: 12000, matureAge: 1500, gestation: 0, birthCooldown: 0, litter: 0,
    walkSpeed: 8, runSpeed: 22, stamina: 1e9, sight: 150, metabolism: 1 / 900, thirst: 0,
    meat: 0, toughness: 1, initial: 0, herdRadius: 0,
  });
  // red-tailed hawk (S7): a summer resident that nests in a cottonwood. litter is divided by calendarScale and scaled by the female's condition
  // (0.5 to 1.5), then held to maxLitter: 1 to 3 young at the default calendar.
  species[Sp.Hawk] = base({
    maxAge: 12000, matureAge: 600, gestation: 0, birthCooldown: 0, litter: 4,
    walkSpeed: 7, runSpeed: 17, stamina: 1e9, sight: 110, metabolism: 1 / 1000, thirst: 0,
    meat: 0, toughness: 1, initial: 0, herdRadius: 0, maxLitter: 3,
  });
  // mule deer (S8): a browser of the creek corridor and the groves. Lifespan about the pronghorn's, twins about half the time, a fawn that
  // hides for 160 ticks, a body a little bigger and a flight a little slower than the pronghorn's (and short-winded: stotting is costly).
  // Where it browses and how its groups form are the muledeer* params; initial 0 keeps the default valley as it was.
  species[Sp.MuleDeer] = base({
    maxAge: 4800, matureAge: 450, gestation: 150, birthCooldown: 1000, litter: 1.5,
    walkSpeed: 1.6, runSpeed: 12.5, stamina: 75, sight: 50, metabolism: 1 / 1300, thirst: 1 / 2000,
    bite: 0.009, foodValue: 0.55, meat: 3, toughness: 0.9, initial: 60, herdRadius: 20, // v7c: initial 60 (was 0)
    wariness: 0.75, defense: 0.1, camo: 0.55, diet: 1, hideAge: 160, maxLitter: 2,
  });
  // beaver (S14): the founders and all the colony rules are the beaver* params. A kit is weaned and working at 1,200 ticks (a year); one litter a year, divided by
  // calendarScale like the wolf's; slow on land (runSpeed 4.5, a wolf runs 12.5) and quick in the water (beaverSwim 3.0); no thirst. Eaten by wolves on land only.
  species[Sp.Beaver] = base({
    maxAge: 7200, matureAge: 1200, gestation: 0, birthCooldown: 0, litter: 4.5,
    walkSpeed: 1.8, runSpeed: 4.5, stamina: 60, sight: 35, metabolism: 1 / 1500, thirst: 0,
    bite: 0, foodValue: 0.55, meat: 1.4, toughness: 0.9, initial: 0, herdRadius: 0,
    wariness: 0.5, defense: 0, camo: 0.4, maxLitter: 5,
  });
  // a species id added to the registry before it has a block here gets the defaults, so nothing indexes undefined
  for (let s = 0; s < SPECIES_COUNT; s++) species[s] ??= base({});
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
    wolfRareHalf: 400, // v6 (was 150)
    founderDesync: 1,
    wolfBreedStore: 0,
    wolfLitterBase: 0.6,
    wolfLitterSpan: 0.5,
    wolfPreyRef: 1000, // v6 (was 0)
    loneIndividual: 0,
    matingWindow: 0,
    herdNearest: 0,
    drinkSpots: 0,
    herdSpacingGraze: 1.6, // v7c (was 0)
    climateAmp: 0,
    calendarScale: 2,
    droughtRefuge: 0,
    sprintCost: 0,
    herdEyes: 0,
    evolution2: 0,
    coatSearch: 0,
    coatSearchRate: 0.15,
    coatSearchBoost: 1.3,
    coatSearchWindow: 0.1,
    leanLitter: 0.8, // v6 (was 0)
    cougarImmigration: 0,
    fleeMomentum: 0,
    openPrairie: 1, // v6 (was 0)
    smallPrey: 1, // v6b (was 0)
    hareK: 3,
    hareR: 2.2,
    hareWinterLoss: 0.6,
    hareYearVar: 0.9,
    dogK: 4,
    dogR: 1.0,
    plagueRate: 0.08,
    smallGameField: 1, // v6b (was 0)
    raptorDogPref: 0.1, // v7c (was 1)
    dogRescueYears: 8, // v8b (was 20)
    dogClip: 0,
    dogGrazeBonus: 0,
    wolfInRate: 0.2,
    wolfOutAfter: 1.0,
    deerOutK: 0.6,
    deerInK: 0.5,
    deerInMax: 60,
    deerRescue: 12,
    deerBref: 35,
    deerKb: 367,
    ravenVagrants: 1, // v6 (was 0)
    ravenVagrantK: 0.16,
    ravenVagrantCap: 400,
    coyoteTerritory: 75,
    coyoteDenSpacing: 60,
    coyoteWolfAvoid: 75,
    coyoteKilledByWolf: 0.3,
    coyoteHuntHunger: 0.97,
    coyoteEatRate: 0.01,
    coyoteSmallGame: 0.5,
    coyoteFawnFind: 0.3,
    coyoteFawnKill: 0.15,
    coyoteFoodRef: 0.5,
    coyoteCarrionShare: 0,
    coyotePupDenAge: 450,
    coyotePupFeed: 0.0025,
    coyoteOutAfter: 1.0,
    coyoteInRate: 1,
    muledeerCover: 0.25,
    muledeerDrawDist: 40,
    muledeerGroupMin: 3,
    muledeerGroupMax: 10,
    muledeerRescue: 6,
    muledeerRescueBelow: 12,
    beavers: 0,
    beaverFoodRadius: 40,
    beaverFoodMin: 8,
    beaverSpacing: 90,
    beaverColonySize: 4,
    beaverCrestRate: 0.3,
    beaverCrestMax: 1.4,
    beaverFoodRate: 3,
    beaverRegrow: 0.35,
    beaverFoodLeave: 0.15,
    beaverBreachP: 0.5,
    beaverBreachYear: 0.03,
    beaverDecayMin: 2,
    beaverDecayMax: 4,
    beaverMoisture: 0.25,
    beaverShield: 0.85,
    beaverMeadowCap: 0.45,
    beaverMeadowYears: 20,
    beaverArrival: 0.4,
    beaverSwim: 3,
    beaverRange: 40,
    cougarInRate: 1,
    raptors: 1, // v7c (was 0)
    eagleMin: 2,
    eagleMax: 6,
    hawkPairsMin: 2,
    hawkPairsMax: 4,
    raptorHuntHunger: 0.7,
    raptorCarrionHunger: 0.5,
    raptorEatRate: 0.004,
    raptorMeatEnergy: 3.5,
    hawkNestSpacing: 140,
    stormCells: 1, // v7c (was 0)
    lightningRate: 0.05,
    lightningIgnite: 0.5,
    fireSpread: 1,
    snowDepth: 1, // v8b (was 0)
    snowStorms: 4,
    snowFall: 0.2,
    snowDrift: 10,
    snowMelt: 24,
    hardWinterP: 0.15,
    blizzardP: 0.25,
    snowGrazePronghorn: 0.6,
    snowGrazeBison: 0.3,
    snowGrazeMule: 0.3,
    snowMove: 1,
    snowKill: 0.3,
    greenUpShift: 0,
    summerDroughtP: 0.1,
    dustStorms: 0,
    dustWind: 0.5,
    dustBare: 0.35,
    dustBareGrass: 0.35,
    dustSoil: 0.02,
    dustVision: 0.6,
    dustP: 0.5,
    dustCooldown: 0.5,
    grasshoppers: 0,
    hopperR: 45,
    hopperCrit: 0.79,
    hopperRain: 0.9,
    hopperYear: 0.1,
    hopperDie: 5,
    hopperSeed: 0.03,
    hopperEat: 1.2,
    hopperOutbreak: 0.3,
    hopperCoyote: 3,
    hopperRaven: 4,
    hopperHawk: 0.6,
    springFloods: 0,
    floodBand: 15,
    floodMelt: 6,
    floodRain: 1,
    floodThresh: 0.7,
    floodSeasons: 0.5,
    floodSilt: 0.25,
    floodGrass: 0.5,
    floodYoung: 0.3,
    floodAdult: 0.02,
    dynamicTrees: 1, // v8b (was 0)
    treeGrowth: 1,
    treeCwRecruit: 0.003, // v8b (was 0.0015)
    treeFloodBoost: 40,
    treeCwCap: 400,
    treeGroveMin: 12,
    treeJunRecruit: 0.03,
    treeJunBg: 0.0005,
    treeJunCap: 1500,
    treeFireFree: 12,
    treeFireSmall: 0.9,
    treeFireYoung: 0.4,
    treeFireMature: 0.1,
    treeBrowse: 0.7,
    treeSeedMort: 0.35,
    treeEncroach: 0.03,
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
    cougarKillChance: 0.9,
    cougarAmbushRadius: 26,
    cougarRange: 200,
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
    cdvRate: 0.3, // v6 (was 0)
    cdvPupDeath: 0.6,
    cdvAdultDeath: 0.1,
    cdvTicks: 300,
    cdvImmuneYears: 5,
    mangeRate: 0.06, // v6 (was 0)
    mangeSpread: 0.02,
    mangeGrowth: 0.5,
    mangeColdK: 1.5,
    mangeRecover: 0.3,
    mangeImmigrantShare: 0.05,
    mutation: 0.035,
    maxAgents: 20000,
    steerFree: 0,
    steerFreeUrgent: 0,
    huntNeedsScent: 0,
  };
}

/** Apply flat overrides like {"grassGrowth": 0.002, "bison.metabolism": 0.0008}. Unknown keys throw. */
export function applyOverrides(p: Params, o: Record<string, number> | undefined): Params {
  if (!o) return p;
  for (const [k, v] of Object.entries(o)) {
    const dot = k.indexOf('.');
    if (dot > 0) {
      const si = PARAM_PREFIX.indexOf(k.slice(0, dot));
      const field = k.slice(dot + 1) as keyof SpeciesParams;
      if (si < 0 || !(field in p.species[si])) throw new Error(`unknown param ${k}`);
      (p.species[si] as unknown as Record<string, number>)[field] = v;
    } else {
      if (!(k in p) || k === 'species') throw new Error(`unknown param ${k}`);
      (p as unknown as Record<string, number>)[k] = v;
    }
  }
  if (p.evolution2 > 0) applyEvolution2(p, o);
  return p;
}

/** The Evolution v2 values (S9). Anything the caller set explicitly (even to 0) is left alone. */
function applyEvolution2(p: Params, o: Record<string, number>): void {
  const sprint: [number, number][] = [[Sp.Bison, 0.2], [Sp.Deer, 0.05], [Sp.Wolf, 0.15], [Sp.Coyote, 0.1]];
  for (const [si, v] of sprint) if (!(`${PARAM_PREFIX[si]}.sprintCost` in o)) p.species[si].sprintCost = v;
  if (!(`${PARAM_PREFIX[Sp.Bison]}.maxLitter` in o)) p.species[Sp.Bison].maxLitter = 1;
  if (!('herdEyes' in o)) p.herdEyes = 1.5;
  if (!('coatSearch' in o)) p.coatSearch = 1;
}
