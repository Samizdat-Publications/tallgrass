// The Tallgrass simulation core. Deterministic from the seed, renderer-independent.
import { Agents, G_BOLD, G_COAT, G_HERD, G_LITTER, G_SIGHT, G_SIZE, G_SPEED, NG, GENE_NAMES } from './agents';
import { COYOTE_GROUP_BASE, Disease, IS_CANID } from './disease';
import { Environment } from './env';
import { DEATH_CAUSES, Lineage } from './lineage';
import { BucketGrid } from './grid';
import { applyOverrides, defaultParams, Params, SpeciesParams } from './params';
import { hashSeed, Rng } from './rng';
import { StormCells } from './storms';
import { DustStorms, DUST_STEP } from './dust';
import { Hoppers } from './hoppers';
import { SpringFloods, FLOOD_STEP } from './springflood';
import { Trees, TREE_STEP } from './trees';
import { RegionalPool } from './region';
import { SmallPrey, TAKE_KINDS } from './smallprey';
import { Coyotes } from './sp/coyote';
import { MuleDeer } from './sp/muledeer';
import { Beavers, emptyBeaverRow } from './sp/beaver';
import { flightStep, Raptors } from './sp/raptor';
import { AGENT_STRIDE, CARCASS_STRIDE, F_ALPHA, F_INFECTED, F_JUVENILE, F_MALE, F_MANGE, F_MIGRANT, F_PREGNANT, F_STOT, Intervention, SimLike, Snapshot, SPECIES_COUNT, SPECIES_KEYS, Sp, St, YEAR_TICKS, SEASON_TICKS, BASE_YEAR_TICKS, setCalendarScale } from './types';
import { COAT_BASE, COAT_RANGE, DIET, IS_PREY, isGrazer, REACT, SPECIES, THREAT } from './species';
import { STRIDE, Vegetation } from './vegetation';
import { Winter, WINTER_STEP } from './winter';
import { distanceTransform, generateWorld, World } from './world';

const DT = 0.15; // seconds of motion per tick (1x is a gentle 1.5x time-lapse)
const BUCKET = 16;
const MAX_PACKS = 64;
/** Energy drain multiplier while a blizzard god tool is blowing (S17). */
const BLIZZARD_COLD = 1.6;
const MAX_GROVES = 24;
/** CSV column parts for the tree counts (S13): kind (cottonwood, juniper, bur oak) and stage (seedling .. snag). */
const TREE_KIND_KEYS = ['cw', 'jun', 'oak'];
const TREE_STAGE_KEYS = ['seedling', 'sapling', 'young', 'mature', 'snag'];

export type SimEventKind =
  | 'packFounded' | 'packLost' | 'drought' | 'droughtEnd' | 'outbreak' | 'stampede' | 'extinct'
  | 'introduced' | 'removed' | 'culled' | 'fire' | 'record' | 'elder' | 'firstKill' | 'plague' | 'rain'
  | 'immigrated' | 'emigrated' | 'recolonized' | 'distemper' | 'mange' | 'townFounded' | 'townLost' | 'sylvaticPlague'
  | 'hareBoom' | 'hareCrash' | 'coyotePups' | 'mesoRelease' | 'storm' | 'lightningFire' | 'eaglesArrive' | 'hawksReturn'
  | 'blizzard' | 'hardWinter' | 'flood' | 'grovePlanted' | 'dustStorm' | 'grasshopperOutbreak' | 'springFlood' | 'encroachment'
  | 'damBuilt' | 'pondFilled' | 'damBreached' | 'beaverMeadow' | 'colonyLeft';

export interface SimEvent {
  tick: number;
  kind: SimEventKind;
  sp: number;
  x: number;
  y: number;
  /** Free-form numbers (count, age, pack id...). */
  a: number;
  b: number;
}

/** A moment in the followed animal's life, for the documentary inspector. */
export interface StoryEntry {
  tick: number;
  kind: 'fled' | 'chase' | 'kill' | 'birth' | 'infected' | 'recovered' | 'dispersed' | 'died';
  /** kind-specific: species involved, litter size, or death cause code (0 starve, 1 thirst, 2 old, 3 killed, 4 culled, 5 removed, 6 emigrated, 7 disease). */
  a: number;
}

export interface SimOptions {
  seed: number;
  params?: Record<string, number>;
  world?: World;
}

/** Ground brightness of a season's ripe grass, for coat camouflage. */
function grassBrightness(season: number): number {
  const s = season % 4;
  // spring green (mid), summer-autumn gold (bright), winter straw/snow (brightest)
  const table = [0.42, 0.66, 0.6, 0.8, 0.42];
  const i = Math.floor(s), f = s - i;
  return table[i] + (table[i + 1] - table[i]) * f;
}

export const DBG: Record<string, number> = {};
const dbg = (k: string) => { DBG[k] = (DBG[k] ?? 0) + 1; };

export class Sim implements SimLike {
  tick = 0;
  readonly seed: number;
  readonly world: World;
  readonly p: Params;
  readonly rng: Rng;
  readonly env: Environment;
  readonly veg: Vegetation;
  readonly a: Agents;
  /** Canid disease (distemper, mange); inert unless cdvRate or mangeRate is set. */
  readonly dis: Disease;
  /** Coyotes (S5): pairs, dens, the think and live logic. Inert (never called) while no coyote lives in the valley. */
  readonly coyotes: Coyotes;
  /** Golden eagles and red-tailed hawks (S7): seasonal arrivals, the hunt, nests. Its think and live logic run for every raptor that exists. */
  readonly raptors: Raptors;
  /** Mule deer (S8): the habitat map and founder groups. Inert (never read) while no mule deer lives in the valley. */
  readonly mule: MuleDeer;
  /** Beavers (S14): colonies, dams, ponds and their effects. Null unless `beavers` or `beaver.initial` is above 0. */
  beavers: Beavers | null = null;
  private beaversSent = 0;
  readonly prey: BucketGrid;
  readonly pred: BucketGrid;
  private preyList = new Int32Array(4096);
  private predList = new Int32Array(1024);
  private preyN = 0;
  private predN = 0;
  /** Unit vectors pointing downhill in water distance (toward water), per cell. */
  private waterGX: Float32Array;
  private waterGY: Float32Array;
  /** Distance (m) to a place to drink: the shore itself, or with drinkSpots only some stretches of it. */
  private drinkD: Float32Array;

  // carcasses (small SoA pool)
  cN = 0;
  cX = new Float32Array(256);
  cY = new Float32Array(256);
  cMeat = new Float32Array(256);
  cMeat0 = new Float32Array(256);
  cSp = new Uint8Array(256);
  cAge = new Int32Array(256);
  /** 1 when the carcass is a predator kill (wolves only feed on kills). */
  cKill = new Uint8Array(256);

  // wolf packs
  packAlive = new Uint8Array(MAX_PACKS);
  packDenX = new Float32Array(MAX_PACKS);
  packDenY = new Float32Array(MAX_PACKS);
  packTarget = new Int32Array(MAX_PACKS).fill(-1);
  packTargetId = new Uint32Array(MAX_PACKS);
  packStore = new Float32Array(MAX_PACKS);
  packSize = new Int32Array(MAX_PACKS);
  packAlphaF = new Int32Array(MAX_PACKS).fill(-1);
  packAlphaM = new Int32Array(MAX_PACKS).fill(-1);
  packFounded = new Int32Array(MAX_PACKS);
  packSerial = new Int32Array(MAX_PACKS);
  /** Where the pack's nose says the prey is (best prey bucket in range). */
  packHuntX = new Float32Array(MAX_PACKS);
  packHuntY = new Float32Array(MAX_PACKS);
  /** 1 when the last sniff picked up any prey herd at all. */
  packScentHit = new Uint8Array(MAX_PACKS);
  private packEnergy = new Float32Array(MAX_PACKS);
  /** Search image: how keen each pack is on each prey species (learned from recent kills). */
  packPref = new Float32Array(MAX_PACKS * SPECIES_COUNT);
  /** Coat search image (S9, coatSearch): per pack and prey species, the coat darkness it last killed, drifting toward each new kill; -1 = none yet. */
  packCoat = new Float32Array(MAX_PACKS * SPECIES_COUNT).fill(-1);
  private packCandF = new Int32Array(MAX_PACKS);
  private packCandM = new Int32Array(MAX_PACKS);
  private packCx = new Float32Array(MAX_PACKS);
  private packCy = new Float32Array(MAX_PACKS);
  private nextPackSerial = 1;
  /** Coarse 16 m map of grass and browse (bucket means) for herd migration; refreshed every 50 ticks. */
  coarseGrass = new Float32Array(32 * 32);
  coarseBrowse = new Float32Array(32 * 32);

  events: SimEvent[] = [];
  /** Total events ever emitted. events[0] has serial eventSerial - events.length, so consumers survive trimming. */
  eventSerial = 0;
  /** Life story of one followed animal (set trackedId to start a fresh story). */
  trackedId = 0;
  /** Records of dead parents and followed animals, and pack alpha dynasties (S15). */
  readonly lineage: Lineage;
  story: StoryEntry[] = [];
  private storyLast: Record<string, number> = {};
  /** Counters since the last sample() call. */
  private cKills = 0;
  private cKillsDeer = 0;
  private cKillsCougar = 0;
  /** Cougar kills by prey species since the last sample() call (S8). */
  private cCougarKills = new Int32Array(SPECIES_COUNT);
  private cStrife = 0;
  private cChases = 0;
  private cGiveUps = 0;
  private cBirths = new Int32Array(SPECIES_COUNT);
  private cStarve = new Int32Array(SPECIES_COUNT);
  private cOld = new Int32Array(SPECIES_COUNT);
  private cKilled = new Int32Array(SPECIES_COUNT);
  private cThirst = new Int32Array(SPECIES_COUNT);
  private cStarveJuv = 0;
  totalKills = 0;
  private pop = new Int32Array(SPECIES_COUNT);
  /** Open prairie (S1): the regional gene pool, null unless openPrairie or ravenVagrants is on. */
  region: RegionalPool | null = null;
  /** Small-prey web (S4): jackrabbit and prairie dog fields, plague. Null unless smallPrey is on (then rabbits are not agents). */
  small: SmallPrey | null = null;
  /** Immigrants and emigrants per species since the last sample() call. */
  private cImm = new Int32Array(SPECIES_COUNT);
  private cEmig = new Int32Array(SPECIES_COUNT);
  private cVagIn = 0;
  private cVagOut = 0;
  /** Vagrant ravens alive (counted at the top of each tick). */
  private vagrants = 0;
  /** Year-smoothed carrion for food-linked raven nesting (ravenNestFood); -1 until the first sample. */
  private carrionEma = -1;
  private everPresent = new Uint8Array(SPECIES_COUNT);
  /** Mule deer and cougars have lived in this valley (and have not been removed by a god tool): the open-prairie rescues only ever refill, never found, a species (S8). */
  private muleSeen = false;
  private cougarSeen = false;
  private lastStampede = -99999;
  private lastOutbreak = -99999;
  private wasDrought = false;
  private groundB = 0.6;
  private firstKillLogged = false;
  /** Storm cells and lightning (params.stormCells; null when off). */
  storms: StormCells | null = null;
  private cLightning = 0;
  /** Snow depth, drift and melt (params.snowDepth; null when off). */
  winter: Winter | null = null;
  /** God tools v2 (S17). A running flood (null when none): ticks left, severity, flooded band width (m) and the cell mask. */
  flood: { left: number; sev: number; radius: number; mask: Uint8Array; silt: number } | null = null;
  /** Dust storms (S12; params.dustStorms, null when off), grasshoppers (params.grasshoppers) and natural spring floods (params.springFloods). */
  dust: DustStorms | null = null;
  hoppers: Hoppers | null = null;
  springFloods: SpringFloods | null = null;
  /** Dynamic trees (S13; params.dynamicTrees, null when off): the sim's own tree list, stages, recruitment, fire and browse. */
  trees: Trees | null = null;
  private treesSent = 0;
  /** The multiplier on every animal's sight this tick: 1, less while a dust storm blows. */
  visMul = 1;
  private cSpringFloods = 0;
  private cFawnsDrowned = 0;
  /** Ticks left of a blizzard god tool: every animal pays a cold drain (BLIZZARD_COLD) while it blows. */
  private blizzardLeft = 0;
  /** Strikes made by the lightning tool while no storm cells exist (drained by snapshot()). */
  private godStrikes: number[] = [];
  /** The grove generator (own stream, made on the first grove) and where the player's trees start in world.trees. */
  private groveRng: Rng | null = null;
  private groveBase = -1;
  private groveCount = 0;

  constructor(opts: SimOptions) {
    const self = this;
    this.seed = opts.seed >>> 0;
    this.p = applyOverrides(defaultParams(), opts.params);
    setCalendarScale(this.p.calendarScale);
    this.rng = new Rng(this.seed);
    // the sim owns its World object (a shallow copy): the fields that dynamic trees and beaver ponds rewrite are copied when those systems start, so a world handed
    // in by the caller (or the generator's) is never changed
    this.world = { ...(opts.world ?? generateWorld(this.seed)) };
    if (this.p.dynamicTrees > 0) this.copyCover();
    this.env = new Environment(this.rng.fork(11));
    this.env.climateAmp = this.p.climateAmp;
    this.env.greenUpShift = this.p.greenUpShift;
    this.env.droughtChance = this.p.summerDroughtP;
    this.veg = new Vegetation(this.world, this.p, this.env, this.rng.fork(12));
    if (this.p.stormCells > 0) this.storms = new StormCells(this.seed, this.world.size, this.p, DT);
    if (this.p.snowDepth > 0) this.winter = new Winter(this.seed, this.world, this.p, this.env, { event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b) });
    if (this.p.dustStorms > 0) this.dust = new DustStorms(this.seed, this.p, this.env, this.world, this.veg, { event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b) });
    if (this.p.grasshoppers > 0) this.hoppers = new Hoppers(this.seed, this.p, this.world, this.env, this.coarseGrass, this.veg, { event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b) });
    if (this.p.springFloods > 0) { const wn = this.winter; this.springFloods = new SpringFloods(this.seed, this.p, this.env, wn !== null ? () => wn.meanDepth() : null); }
    this.a = new Agents(4096);
    this.lineage = new Lineage(this.a, { alive: this.packAlive, serial: this.packSerial, alphaF: this.packAlphaF, alphaM: this.packAlphaM });
    this.dis = new Disease(this.a, this.p, this.env, this.seed, {
      get tick() { return self.tick; },
      event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b),
      kill: (i) => this.die(i, 'disease'),
      story: (i, kind) => this.logStory(i, kind),
      packSerial: (pk) => (pk >= COYOTE_GROUP_BASE ? pk : this.packSerial[pk]),
      group: (i) => (this.a.sp[i] === Sp.Coyote ? this.coyotes.groupOf(i) : this.a.pack[i]),
    });
    this.prey = new BucketGrid(this.world.size, BUCKET);
    this.pred = new BucketGrid(this.world.size, BUCKET);
    const n = this.world.n;
    this.waterGX = new Float32Array(n * n);
    this.waterGY = new Float32Array(n * n);
    this.drinkD = this.world.waterDist;
    this.buildWaterFields();
    this.coyotes = new Coyotes(this.a, this.p, this.env, this.seed, {
      get tick() { return self.tick; },
      get size() { return self.world.size; },
      get pred() { return self.pred; },
      get prey() { return self.prey; },
      get predList() { return self.predList; },
      get predN() { return self.predN; },
      get pop() { return self.pop; },
      get groundB() { return self.groundB; },
      get small() { return self.small; },
      get hoppers() { return self.hoppers; },
      get visMul() { return self.visMul; },
      get dis() { return self.dis; },
      get cN() { return self.cN; },
      get cX() { return self.cX; },
      get cY() { return self.cY; },
      get cMeat() { return self.cMeat; },
      get packAlive() { return self.packAlive; },
      get packDenX() { return self.packDenX; },
      get packDenY() { return self.packDenY; },
      get yearTick() { return self.env.yearTick(self.tick); },
      nearestCarcass: (x, y, maxD, maxAge) => this.nearestCarcass(x, y, maxD, maxAge),
      isWater: (x, y) => this.world.water[this.veg.cellAt(x, y)] !== 0,
      grassAt: (x, y) => this.veg.grass[this.veg.cellAt(x, y)],
      water: (x, y, out) => {
        const c = this.veg.cellAt(x, y);
        out[0] = this.waterGX[c]; out[1] = this.waterGY[c]; out[2] = this.world.waterDist[c];
      },
      vitals: (i) => this.vitals(i, this.p.species[Sp.Coyote]),
      birth: (mother, father, x, y) => this.birth(mother, father, Sp.Coyote, x, y),
      kill: (i) => this.die(i, 'killed'),
      killedByWolf: (i) => {
        const before = this.cN;
        this.die(i, 'killed');
        // a coyote is not wolf food: the carcass it leaves is for the ravens and the other scavengers
        if (this.cN > before) this.cKill[this.cN - 1] = 0;
      },
      beginEmigration: (i) => this.beginEmigration(i),
      event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b),
      logStory: (i, kind, a) => this.logStory(i, kind, a),
    });
    this.raptors = new Raptors(this.a, this.p, this.env, this.seed, this.world, {
      get tick() { return self.tick; },
      get pop() { return self.pop; },
      get small() { return self.small; },
      get hoppers() { return self.hoppers; },
      get cN() { return self.cN; },
      get cX() { return self.cX; },
      get cY() { return self.cY; },
      get cMeat() { return self.cMeat; },
      nearestCarcass: (x, y, maxD, maxAge) => this.nearestCarcass(x, y, maxD, maxAge),
      vitals: (i) => this.vitals(i, this.p.species[this.a.sp[i]]),
      beginEmigration: (i) => this.beginEmigration(i),
      beginMigrate: (i, outbound, tx, ty) => this.beginMigrate(i, outbound, tx, ty),
      corridorFor: (x, y) => {
        const c = this.world.corridors, k = this.nearestCorridor(x, y);
        return [c[k * 4], c[k * 4 + 1], c[k * 4 + 2], c[k * 4 + 3]];
      },
      // no random draws: a raptor has no traits, so its genes are all 1 and its coat the species' base
      spawnRaptor: (sp, x, y, age, male, energy, alt) => {
        const a = this.a, i = a.spawn();
        a.sp[i] = sp;
        a.x[i] = x;
        a.y[i] = y;
        a.male[i] = male;
        a.age[i] = age;
        a.born[i] = this.tick - age;
        a.energy[i] = energy;
        a.hydration[i] = 1;
        a.alt[i] = alt;
        a.state[i] = St.Fly;
        for (let g = 0; g < NG; g++) a.genes[i * NG + g] = g === G_COAT ? (COAT_BASE[sp] ?? 0.5) : 1;
        return i;
      },
      noteArrivals: (sp, n) => { this.cImm[sp] += n; },
      noteBirths: (sp, n) => { this.cBirths[sp] += n; },
      event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b),
    });
    this.mule = new MuleDeer(this.seed, this.world, this.p);
    if (this.p.dynamicTrees > 0) {
      this.trees = new Trees(this.seed, this.p, this.env, this.world, this.veg, this.a, {
        event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b),
        changed: () => {
          this.mule.invalidate();
          this.raptors.refreshTrees(this.trees!.live);
        },
      });
    }
    if (this.p.beavers > 0 || this.p.species[Sp.Beaver].initial > 0) this.startBeavers();
    this.populate();
    this.coyotes.seedFounders();
    this.beavers?.seedFounders();
    if (this.p.openPrairie > 0 || this.p.ravenVagrants > 0) {
      this.region = new RegionalPool(this.seed, COAT_BASE);
      this.region.seedFrom(this.a.sp, this.a.alive, this.a.genes, this.a.hi);
    }
    if (this.p.smallPrey > 0) {
      this.refreshCoarse(); // the fields start from the opening grass and browse
      this.small = new SmallPrey(this.seed, this.p, this.world, this.env, this.coarseGrass, this.coarseBrowse, this.veg, {
        event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b),
      });
    }
  }

  // ------------------------------------------------------------------ setup

  /** Cover, capacity and the tree list are rewritten by dynamic trees and drowned by beaver ponds: the sim works on its own copies. */
  private ownCover = false;
  private copyCover(): void {
    if (this.ownCover) return;
    this.ownCover = true;
    const w = this.world;
    w.cover = new Float32Array(w.cover);
    w.capacity = new Float32Array(w.capacity);
    w.trees = new Float32Array(w.trees);
  }

  /**
   * Build the beaver system (S14): at the start when `beavers` or `beaver.initial` is on, or the first time the god tool puts a beaver in the valley. It
   * copies the fields ponds rewrite (the water mask and surface, waterDist, moisture, and cover, capacity and trees for the drowned trees) and finds the sites.
   */
  private startBeavers(): Beavers {
    if (this.beavers !== null) return this.beavers;
    const w = this.world, self = this;
    this.copyCover();
    w.water = new Uint8Array(w.water);
    w.waterHeight = new Float32Array(w.waterHeight);
    w.waterDist = new Float32Array(w.waterDist);
    w.moisture = new Float32Array(w.moisture);
    if (this.p.drinkSpots <= 0) this.drinkD = w.waterDist; // the drink distance is the world's own waterDist unless drink spots thin it
    this.beavers = new Beavers(this.a, this.p, this.env, this.seed, this.world, this.veg, {
      get tick() { return self.tick; },
      get pred() { return self.pred; },
      get predList() { return self.predList; },
      get predN() { return self.predN; },
      vitals: (i) => this.vitals(i, this.p.species[Sp.Beaver]),
      water: (x, y, out) => {
        const c = this.veg.cellAt(x, y);
        out[0] = this.waterGX[c]; out[1] = this.waterGY[c]; out[2] = this.drinkD[c];
      },
      leave: (i) => this.leaveValley(i),
      noteBirths: (n) => { this.cBirths[Sp.Beaver] += n; },
      noteArrivals: (n) => { this.cImm[Sp.Beaver] += n; },
      markPresent: () => { this.everPresent[Sp.Beaver] = 1; },
      event: (kind, sp, x, y, a, b) => this.event(kind, sp, x, y, a, b),
    }, {
      waterChanged: () => { this.buildWaterFields(); this.mule.invalidate(); },
      drown: this.p.dynamicTrees > 0 ? (depth) => this.trees!.drown(depth) : null,
      staticTreesChanged: (live) => this.raptors.refreshTrees(live),
    });
    return this.beavers;
  }

  /** The unit vectors toward water and the distance to a place to drink; built at the start and again whenever beaver ponds change the water (S14). */
  private buildWaterFields(): void {
    const n = this.world.n;
    let wd = this.world.waterDist;
    if (this.p.drinkSpots > 0) {
      // keep the water cells in coarse 40 m blocks picked by a seeded hash (no rng draws), so each pond and the creek keep a few drinking places
      const w = this.world.water, src = new Uint8Array(n * n), blk = Math.max(1, Math.round(40 / this.world.cell));
      for (let k = 0; k < n * n; k++) {
        if (!w[k]) continue;
        const bi = ((k % n) / blk) | 0, bj = ((k / n / blk) | 0);
        let h = (bi * 73856093) ^ (bj * 19349663) ^ (this.seed * 83492791);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        if (((h >>> 8) & 0xffff) / 0x10000 < this.p.drinkSpots) src[k] = 1;
      }
      wd = distanceTransform(src, n, this.world.cell);
    }
    this.drinkD = wd;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = j * n + i;
        const gx = (i < n - 1 ? wd[c + 1] : wd[c]) - (i > 0 ? wd[c - 1] : wd[c]);
        const gy = (j < n - 1 ? wd[c + n] : wd[c]) - (j > 0 ? wd[c - n] : wd[c]);
        const l = Math.hypot(gx, gy) || 1;
        this.waterGX[c] = -gx / l;
        this.waterGY[c] = -gy / l;
      }
    }
  }

  private defaultGenes(sp: number, out: Float32Array, o: number): void {
    const r = this.rng;
    const j = () => 1 + (r.next() - 0.5) * 0.12;
    out[o + G_SPEED] = j();
    out[o + G_SIZE] = j();
    out[o + G_SIGHT] = j();
    out[o + G_BOLD] = j();
    out[o + G_HERD] = j();
    out[o + G_COAT] = (COAT_BASE[sp] ?? 0.5) + (r.next() - 0.5) * 0.12;
    out[o + G_LITTER] = j();
  }

  private goodSpot(minCap: number): [number, number] {
    const w = this.world;
    for (let k = 0; k < 400; k++) {
      const x = this.rng.range(30, w.size - 30), y = this.rng.range(30, w.size - 30);
      const c = this.veg.cellAt(x, y);
      if (!w.water[c] && w.capacity[c] >= minCap) return [x, y];
    }
    return [w.size / 2, w.size / 2];
  }

  private populate(): void {
    const P = this.p.species;
    // bison in a handful of herds
    const herds = 6;
    let left = P[Sp.Bison].initial;
    for (let h = 0; h < herds; h++) {
      const [hx, hy] = this.goodSpot(0.5);
      const count = h === herds - 1 ? left : Math.round(P[Sp.Bison].initial / herds);
      left -= count;
      for (let k = 0; k < count; k++) this.spawnAdult(Sp.Bison, hx + this.rng.range(-20, 20), hy + this.rng.range(-20, 20));
    }
    // pronghorn in small bands
    const bands = 5;
    let pl = P[Sp.Deer].initial;
    for (let h = 0; h < bands && pl > 0; h++) {
      const [hx, hy] = this.goodSpot(0.4);
      const count = h === bands - 1 ? pl : Math.round(P[Sp.Deer].initial / bands);
      pl -= count;
      for (let k = 0; k < count; k++) this.spawnAdult(Sp.Deer, hx + this.rng.range(-12, 12), hy + this.rng.range(-12, 12));
    }
    // wolves in packs
    const wolves = P[Sp.Wolf].initial;
    if (wolves > 0) {
      const packs = Math.max(1, Math.round(wolves / 7));
      for (let k = 0; k < packs; k++) {
        const den = this.findDenSite();
        if (!den) break;
        const pk = this.newPack(den[0], den[1]);
        const m = Math.round(wolves / packs);
        for (let q = 0; q < m; q++) {
          const i = this.spawnAdult(Sp.Wolf, den[0] + this.rng.range(-8, 8), den[1] + this.rng.range(-8, 8));
          this.a.pack[i] = pk;
          this.a.male[i] = q % 2;
        }
      }
    }
    // mule deer (S8): groups of 3 to 10 at habitat spots (creek corridor and groves); positions come from the mule deer's own generator
    for (const g of P[Sp.MuleDeer].initial > 0 ? this.mule.groupSizes(P[Sp.MuleDeer].initial) : []) {
      const [hx, hy] = this.mule.spot() ?? this.goodSpot(0.4);
      for (let k = 0; k < g; k++) {
        const r = this.mule.rng;
        this.spawnAdult(Sp.MuleDeer, hx + r.range(-8, 8), hy + r.range(-8, 8));
      }
    }
    for (let k = 0; k < P[Sp.Cougar].initial; k++) {
      const [x, y] = this.coverSpot();
      const i = this.spawnAdult(Sp.Cougar, x, y);
      this.a.male[i] = k % 2;
      this.a.fleeX[i] = x;
      this.a.fleeY[i] = y;
    }
    for (let k = 0; k < P[Sp.Raven].initial; k++) {
      const [x, y] = this.goodSpot(0.2);
      const i = this.spawnAdult(Sp.Raven, x, y);
      this.a.alt[i] = 25 + this.rng.next() * 15;
      this.a.state[i] = St.Fly;
    }
    // every other agent species with a starting population (`<key>.initial`, e.g. ?p=coyote.initial:12), registry-driven. The five
    // above keep their own layouts and draws. Species that live as density fields (prairie dogs, and the jackrabbit when smallPrey
    // is on) are seeded by SmallPrey instead; the jackrabbit is the one field species that still has an agent form (smallPrey off).
    for (const d of SPECIES) {
      if (d.id === Sp.Bison || d.id === Sp.Deer || d.id === Sp.Wolf || d.id === Sp.Cougar || d.id === Sp.Raven || d.id === Sp.MuleDeer || d.id === Sp.Beaver) continue;
      if (d.repr === 'field' && (this.p.smallPrey > 0 || d.id !== Sp.Rabbit)) continue;
      let left = P[d.id].initial;
      while (left > 0) {
        const group = Math.min(left, 12);
        const [hx, hy] = this.goodSpot(0.4);
        for (let k = 0; k < group; k++) {
          const i = this.spawnAdult(d.id, hx + this.rng.range(-12, 12), hy + this.rng.range(-12, 12));
          if (d.flies) { this.a.alt[i] = 25 + this.rng.next() * 15; this.a.state[i] = St.Fly; }
        }
        left -= group;
      }
    }
  }

  spawnAdult(sp: number, x: number, y: number): number {
    const a = this.a;
    const i = a.spawn();
    a.sp[i] = sp;
    a.x[i] = x;
    a.y[i] = y;
    a.heading[i] = this.rng.range(-Math.PI, Math.PI);
    a.male[i] = this.rng.next() < 0.5 ? 1 : 0;
    const P = this.p.species[sp];
    // founders span the whole adult range so they don't all grow old together
    a.age[i] = Math.round(this.rng.next() < 0.3 ? this.rng.next() * P.matureAge : P.matureAge + this.rng.next() * (P.maxAge * 0.75 - P.matureAge));
    a.born[i] = this.tick - a.age[i];
    a.energy[i] = 0.7 + this.rng.next() * 0.2;
    a.hydration[i] = 0.8 + this.rng.next() * 0.2;
    this.defaultGenes(sp, a.genes, i * NG);
    // founders mid-way through their breeding cycles, so the first calves don't all arrive in one pulse
    if (this.p.founderDesync > 0 && !a.male[i] && a.age[i] >= P.matureAge && P.gestation > 0) {
      if (this.rng.next() < 0.35) {
        a.pregnant[i] = 1 + this.rng.int(P.gestation);
        this.defaultGenes(sp, a.mateGenes, i * NG); // an unseen founder bull of the same stock
      } else a.cooldown[i] = this.rng.int(P.birthCooldown + 1);
    }
    this.everPresent[sp] = 1;
    if (sp === Sp.MuleDeer) this.muleSeen = true;
    else if (sp === Sp.Cougar) this.cougarSeen = true;
    return i;
  }

  /** A spot in tree or shrub cover, preferably near water (cougar country). */
  private coverSpot(): [number, number] {
    const w = this.world;
    let best: [number, number] = [w.size / 2, w.size / 2], bs = -1;
    for (let k = 0; k < 60; k++) {
      const x = this.rng.range(30, w.size - 30), y = this.rng.range(30, w.size - 30);
      const c = this.veg.cellAt(x, y);
      if (w.water[c]) continue;
      const s = w.cover[c] + (w.waterDist[c] < 40 ? 0.3 : 0) + this.rng.next() * 0.2;
      if (s > bs) { bs = s; best = [x, y]; }
    }
    return best;
  }

  /**
   * Can a grazer conceive now? By default any time outside winter. With matingWindow > 0, only in a window placed
   * so that, after this species' gestation, the young arrive in mid-spring (a yearly birth pulse).
   */
  private inMatingSeason(P: SpeciesParams): boolean {
    const s = this.env.state.season;
    const w = this.p.matingWindow;
    if (w <= 0) return s < 3;
    const centre = (0.45 - P.gestation / SEASON_TICKS + 4) % 4;
    let d = Math.abs(s - centre);
    if (d > 2) d = 4 - d;
    return d < w / 2;
  }

  // ------------------------------------------------------------------ packs

  /**
   * Prey-scaled wolf capacity: when prey is plentiful, dens sit closer and packs grow larger before splitting;
   * when it is scarce the valley holds fewer, smaller packs. 1 when wolfPreyRef is 0 (off).
   */
  private preyScale(): number {
    if (this.p.wolfPreyRef <= 0) return 1;
    const pop = this.tick === 0 ? this.populations() : this.pop; // counters fill on the first step
    const prey = pop[Sp.Bison] + 0.4 * pop[Sp.Deer];
    return Math.min(1.8, Math.max(0.5, prey / this.p.wolfPreyRef));
  }

  private packMaxNow(): number {
    return this.p.wolfPackMax * this.preyScale();
  }

  private findDenSite(nearX?: number, nearY?: number, relax = 1): [number, number] | null {
    const w = this.world;
    const minD = (this.p.wolfDenMinDist / Math.sqrt(this.preyScale())) * relax;
    for (let k = 0; k < 200; k++) {
      const x = nearX !== undefined ? nearX + this.rng.range(-30, 30) : this.rng.range(50, w.size - 50);
      const y = nearY !== undefined ? nearY + this.rng.range(-30, 30) : this.rng.range(50, w.size - 50);
      if (x < 30 || y < 30 || x > w.size - 30 || y > w.size - 30) continue;
      if (w.water[this.veg.cellAt(x, y)]) continue;
      let ok = true;
      for (let pk = 0; pk < MAX_PACKS; pk++) {
        if (this.packAlive[pk] && Math.hypot(this.packDenX[pk] - x, this.packDenY[pk] - y) < minD) { ok = false; break; }
      }
      if (ok) return [x, y];
      if (nearX !== undefined && k > 20) return null;
    }
    return null;
  }

  /** A pack kills prey of species `prey` with coat `coat`: its search image for that species moves toward it (the first kill sets it). */
  learnCoat(pk: number, prey: number, coat: number): void {
    const k = pk * SPECIES_COUNT + prey;
    this.packCoat[k] = this.packCoat[k] < 0 ? coat : this.packCoat[k] + this.p.coatSearchRate * (coat - this.packCoat[k]);
  }

  private newPack(x: number, y: number): number {
    for (let pk = 0; pk < MAX_PACKS; pk++) {
      if (!this.packAlive[pk]) {
        this.packAlive[pk] = 1;
        this.packDenX[pk] = x;
        this.packDenY[pk] = y;
        this.packTarget[pk] = -1;
        this.packStore[pk] = 0.5;
        this.packAlphaF[pk] = -1;
        this.packAlphaM[pk] = -1;
        this.packFounded[pk] = this.tick;
        this.packSerial[pk] = this.nextPackSerial++;
        this.packSize[pk] = 0;
        for (let s = 0; s < SPECIES_COUNT; s++) { this.packPref[pk * SPECIES_COUNT + s] = 0.7; this.packCoat[pk * SPECIES_COUNT + s] = -1; }
        if (this.tick > 0) this.event('packFounded', Sp.Wolf, x, y, this.packSerial[pk], 0);
        return pk;
      }
    }
    return -1;
  }

  // ------------------------------------------------------------------ main loop

  step(n = 1): void {
    for (let k = 0; k < n; k++) this.stepOne();
  }

  private stepOne(): void {
    const a = this.a;
    const t = this.tick;
    this.env.update(t);
    if (this.blizzardLeft > 0) this.blizzardLeft--;
    if (this.flood !== null) this.floodStep();
    if (this.storms) this.stepStorms(t);
    if (this.winter !== null && t % WINTER_STEP === 0) this.winter.step();
    if (this.dust !== null) {
      if (t % DUST_STEP === 0) this.dust.step(t);
      this.visMul = this.dust.visionMul();
    }
    if (this.springFloods !== null && t % FLOOD_STEP === 0) {
      const call = this.springFloods.step(this.flood !== null);
      if (call !== null) this.startFlood(call.ticks, call.severity, this.springFloods.rng);
    }
    this.veg.step(t);
    if (this.trees !== null) {
      this.trees.noteBurning(this.veg.burningCells);
      if (t % TREE_STEP === 0) this.trees.step(t);
    }
    this.groundB = grassBrightness(this.env.state.season);

    // lists, grids, pack bookkeeping
    this.preyN = 0;
    this.predN = 0;
    this.pop.fill(0);
    this.vagrants = 0;
    this.packSize.fill(0);
    this.packCandF.fill(-1);
    this.packCandM.fill(-1);
    this.packCx.fill(0);
    this.packCy.fill(0);
    this.packEnergy.fill(0);
    if (this.preyList.length < a.cap) this.preyList = new Int32Array(a.cap);
    if (this.predList.length < a.cap) this.predList = new Int32Array(a.cap);
    const P = this.p.species;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i]) continue;
      const s = a.sp[i];
      this.pop[s]++;
      if (a.origin[i] === 2 && s === Sp.Raven) this.vagrants++;
      if (s === Sp.MuleDeer) this.muleSeen = true;
      else if (s === Sp.Cougar) this.cougarSeen = true;
      if (IS_PREY[s]) this.preyList[this.preyN++] = i;
      else if (THREAT[s] > 0) {
        this.predList[this.predN++] = i;
        const pk = a.pack[i];
        if (pk >= 0) {
          this.packSize[pk]++;
          this.packCx[pk] += a.x[i];
          this.packCy[pk] += a.y[i];
          this.packEnergy[pk] += a.energy[i];
          if (a.age[i] >= P[s].matureAge) {
            if (a.male[i]) { if (this.packCandM[pk] < 0 || a.age[i] > a.age[this.packCandM[pk]]) this.packCandM[pk] = i; }
            else if (this.packCandF[pk] < 0 || a.age[i] > a.age[this.packCandF[pk]]) this.packCandF[pk] = i;
          }
        }
      }
    }
    if (t % 50 === 0) {
      this.refreshCoarse();
      if (this.small !== null) this.small.step(t); // the web reads the map just refreshed, so it is never stale
      if (this.hoppers !== null) this.hoppers.step(t);
      if (this.small !== null) this.coyotes.tickPrey(t);
      if (this.pop[Sp.MuleDeer] > 0) this.mule.refresh(this.veg.browse, this.veg.grass);
    }
    this.prey.build(this.preyList, this.preyN, a.x, a.y);
    this.pred.build(this.predList, this.predN, a.x, a.y);
    this.updatePacks();
    if (this.pop[Sp.Coyote] > 0) this.coyotes.step(t);
    if (this.beavers !== null) this.beavers.step(t);
    if (this.p.raptors > 0 || this.pop[Sp.Eagle] + this.pop[Sp.Hawk] > 0) this.raptors.step(t);
    if (this.region !== null) this.openPrairieStep(t);
    if (this.p.ravenNestFood > 0 && t % 50 === 0) {
      const c = this.sumRemainingMeat();
      this.carrionEma = this.carrionEma < 0 ? c : this.carrionEma + (c - this.carrionEma) * (50 / YEAR_TICKS);
    }
    if (this.dis.on) this.dis.step(this.pop[Sp.Wolf]);

    // agents
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i]) continue;
      const s = a.sp[i];
      if (a.state[i] === St.Migrate) { this.migrantTick(i, t, P[s]); continue; }
      if (isGrazer(s)) {
        if ((i + t) % 6 === 0) this.thinkHerbivore(i, P[s]);
        this.moveGround(i, P[s]);
        this.liveHerbivore(i, P[s]);
      } else if (s === Sp.Wolf) {
        if ((i + t) % 3 === 0) this.thinkWolf(i, P[s]);
        this.moveGround(i, P[s]);
        this.liveWolf(i, P[s]);
      } else if (s === Sp.Cougar) {
        if ((i + t) % 3 === 0) this.thinkCougar(i, P[s]);
        this.moveGround(i, P[s]);
        this.liveCougar(i, P[s]);
      } else if (s === Sp.Raven) {
        if ((i + t) % 6 === 0) this.thinkRaven(i, P[s]);
        this.liveRaven(i, P[s]);
      } else if (s === Sp.Coyote) {
        if ((i + t) % 3 === 0) this.coyotes.think(i);
        this.moveGround(i, P[s]);
        this.coyotes.live(i);
      } else if (s === Sp.Eagle || s === Sp.Hawk) {
        if ((i + t) % 4 === 0) this.raptors.think(i);
        this.raptors.live(i);
      } else if (s === Sp.Beaver && this.beavers !== null) {
        if ((i + t) % 4 === 0) this.beavers.think(i);
        this.beavers.live(i);
      }
    }

    this.updateCarcasses();
    this.checkEvents();
    if (this.p.wolfArrivalTick > 0 && t === this.p.wolfArrivalTick) this.introduce(Sp.Wolf, this.p.wolfArrivalCount);
    this.tick++;
  }

  private updatePacks(): void {
    const a = this.a;
    for (let pk = 0; pk < MAX_PACKS; pk++) {
      if (!this.packAlive[pk]) continue;
      // a pack budded earlier in this same loop has no members counted yet: leave it be until next tick
      if (this.packFounded[pk] === this.tick) continue;
      if (this.packSize[pk] === 0) {
        this.packAlive[pk] = 0;
        this.event('packLost', Sp.Wolf, this.packDenX[pk], this.packDenY[pk], this.packSerial[pk], this.tick - this.packFounded[pk]);
        continue;
      }
      this.packCx[pk] /= this.packSize[pk];
      this.packCy[pk] /= this.packSize[pk];
      const af = this.packAlphaF[pk];
      if (af < 0 || !a.alive[af] || a.pack[af] !== pk || a.sp[af] !== Sp.Wolf) this.packAlphaF[pk] = this.packCandF[pk];
      const am = this.packAlphaM[pk];
      if (am < 0 || !a.alive[am] || a.pack[am] !== pk || a.sp[am] !== Sp.Wolf) this.packAlphaM[pk] = this.packCandM[pk];
      if (!a.same(this.packTarget[pk], this.packTargetId[pk])) this.packTarget[pk] = -1;
      // the store slowly spoils; the search image slowly relaxes toward neutral
      this.packStore[pk] *= 0.9995;
      if ((this.tick & 63) === 0) for (let s = 0; s < SPECIES_COUNT; s++) { const k = pk * SPECIES_COUNT + s; this.packPref[k] += (0.7 - this.packPref[k]) * 0.01; }
      // every 20 ticks, sniff out the best prey concentration; range widens when the pack is hungry
      if ((this.tick + pk) % 20 === 0) {
        const hungry = this.packEnergy[pk] / this.packSize[pk] < 0.55;
        this.sniffPrey(pk, this.p.wolfTerritory * (hungry ? 1.5 : 1.2));
        if (this.packSize[pk] > this.packMaxNow() && this.packStore[pk] > 0.8) this.disperse(pk);
        else if (this.packSize[pk] <= 2 && (this.packAlphaF[pk] < 0 || this.packAlphaM[pk] < 0)) this.mergeRemnant(pk);
        else if (this.packAlphaF[pk] < 0) this.fillVacancy(pk, 0);
        else if (this.packAlphaM[pk] < 0) this.fillVacancy(pk, 1);
      }
    }
    this.lineage.syncAlphas(this.tick);
    // wolves breed once a year, at the start of spring
    if (this.env.yearTick(this.tick) === 0) {
      const P = this.p.species[Sp.Wolf];
      for (let pk = 0; pk < MAX_PACKS; pk++) {
        if (!this.packAlive[pk]) continue;
        const f = this.packAlphaF[pk], m = this.packAlphaM[pk];
        if (f < 0 || m < 0) continue;
        if (a.energy[f] < 0.3) continue;
        const crowd = this.packSize[pk] >= this.packMaxNow() + 3;
        if (crowd) continue;
        // a pack only raises pups on meat from real kills: no larder, no litter
        if (this.packStore[pk] < this.p.wolfBreedStore) continue;
        let litter = Math.round((P.litter / this.p.calendarScale) * a.genes[f * NG + G_LITTER] * (this.p.wolfLitterBase + this.p.wolfLitterSpan * Math.min(1, this.packStore[pk])) + (this.rng.next() - 0.5) * 2);
        litter = Math.max(1, Math.min(8, litter));
        for (let k = 0; k < litter; k++) {
          const c = this.birth(f, m, Sp.Wolf, this.packDenX[pk] + this.rng.range(-3, 3), this.packDenY[pk] + this.rng.range(-3, 3));
          a.pack[c] = pk;
          a.energy[c] = 0.42; // born lean: pups live on what the pack brings home from kills
        }
        this.logStory(f, 'birth', litter);
        // a big, well-fed pack can raise a second litter from another female
        if (this.packSize[pk] >= 6 && this.packStore[pk] > 3) {
          let f2 = -1;
          for (let k = 0; k < this.predN; k++) {
            const i = this.predList[k];
            if (a.alive[i] && a.pack[i] === pk && !a.male[i] && i !== f && a.age[i] >= P.matureAge && a.energy[i] > 0.5) { f2 = i; break; }
          }
          if (f2 >= 0) {
            const l2 = Math.max(1, Math.round(litter * 0.6));
            for (let k = 0; k < l2; k++) {
              const c = this.birth(f2, m, Sp.Wolf, this.packDenX[pk] + this.rng.range(-3, 3), this.packDenY[pk] + this.rng.range(-3, 3));
              a.pack[c] = pk;
              a.energy[c] = 0.42;
            }
          }
        }
      }
    }
    // rescue immigration (off by default): a pair walks in from outside the valley
    if (this.p.wolfImmigration > 0 && this.pop[Sp.Wolf] < 6 && this.rng.next() < this.p.wolfImmigration / BASE_YEAR_TICKS) {
      this.introduce(Sp.Wolf, 2);
    }
    // the valley holds only a few cougar ranges; when they empty, a pair of dispersers from the wider country moves in
    if (this.p.cougarImmigration > 0 && this.pop[Sp.Cougar] < 2 && this.rng.next() < this.p.cougarImmigration / BASE_YEAR_TICKS) {
      this.introduce(Sp.Cougar, 2);
    }
  }

  /** An oversized pack buds: a young breeding pair plus up to two yearlings found a pack near prey in open ground. */
  private disperse(pk: number): void {
    const a = this.a;
    const mature = this.p.species[Sp.Wolf].matureAge;
    let m = -1, f = -1;
    for (let k = 0; k < this.predN; k++) {
      const i = this.predList[k];
      if (!a.alive[i] || a.pack[i] !== pk || a.age[i] < mature) continue;
      if (i === this.packAlphaF[pk] || i === this.packAlphaM[pk]) continue;
      if (a.male[i]) { if (m < 0 || a.age[i] < a.age[m]) m = i; } else if (f < 0 || a.age[i] < a.age[f]) f = i;
    }
    if (m < 0 || f < 0) { dbg(m < 0 && f < 0 ? 'disp_noadults' : m < 0 ? 'disp_nomale' : 'disp_nofemale'); return; }
    const site = this.bestDenSite();
    if (!site) { dbg('disp_nosite'); return; }
    const np = this.newPack(site[0], site[1]);
    if (np < 0) return;
    dbg('disp_ok');
    const take = (i: number) => { a.pack[i] = np; a.target[i] = -1; a.energy[i] = Math.max(a.energy[i], 0.75); };
    take(m); take(f);
    this.logStory(m, 'dispersed'); this.logStory(f, 'dispersed');
    let extra = 0;
    for (let k = 0; k < this.predN && extra < 2; k++) {
      const i = this.predList[k];
      if (!a.alive[i] || a.pack[i] !== pk || i === this.packAlphaF[pk] || i === this.packAlphaM[pk]) continue;
      if (a.age[i] < mature * 0.6) continue;
      take(i);
      extra++;
    }
    this.packAlphaM[np] = m;
    this.packAlphaF[np] = f;
    this.packStore[np] = 0.6;
  }

  /** A pack without a breeder of one sex takes in a non-breeding adult of that sex from another pack. */
  private fillVacancy(pk: number, male: number): void {
    const a = this.a;
    const mature = this.p.species[Sp.Wolf].matureAge;
    let best = -1, bd = 1e9;
    for (let k = 0; k < this.predN; k++) {
      const i = this.predList[k];
      if (!a.alive[i] || a.sp[i] !== Sp.Wolf || a.male[i] !== male || a.age[i] < mature || a.state[i] === St.Migrate) continue;
      const q = a.pack[i];
      if (q === pk) continue;
      if (q >= 0 && (this.packAlphaF[q] === i || this.packAlphaM[q] === i)) continue;
      const d = Math.hypot(a.x[i] - this.packDenX[pk], a.y[i] - this.packDenY[pk]);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    dbg('vacancy_filled');
    a.pack[best] = pk;
    a.target[best] = -1;
    if (male) this.packAlphaM[pk] = best; else this.packAlphaF[pk] = best;
  }

  /** The free den site (spaced from other dens) with the most prey within a territory's reach. */
  private bestDenSite(): [number, number] | null {
    const g = this.prey, nb = g.nb, bs = g.bs;
    const R = this.p.wolfTerritory;
    let best: [number, number] | null = null, bestV = -1;
    for (let k = 0; k < 30; k++) {
      const site = this.findDenSite();
      if (!site) continue;
      const rb = Math.ceil(R / bs);
      const bx = (site[0] / bs) | 0, by = (site[1] / bs) | 0;
      let v = 0;
      for (let yy = by - rb; yy <= by + rb; yy++) {
        if (yy < 0 || yy >= nb) continue;
        for (let xx = bx - rb; xx <= bx + rb; xx++) if (xx >= 0 && xx < nb) v += g.counts[yy * nb + xx];
      }
      if (v > bestV) { bestV = v; best = site; }
    }
    return best;
  }

  /** A pack shrunk to one or two wolves with no breeding pair folds into the nearest pack with room. */
  private mergeRemnant(pk: number): void {
    const a = this.a;
    let best = -1, bd = 1e9;
    for (let q = 0; q < MAX_PACKS; q++) {
      if (q === pk || !this.packAlive[q] || this.packSize[q] >= this.packMaxNow()) continue;
      const d = Math.hypot(this.packDenX[q] - this.packDenX[pk], this.packDenY[q] - this.packDenY[pk]);
      if (d < bd) { bd = d; best = q; }
    }
    if (best < 0) return;
    dbg('merge');
    for (let k = 0; k < this.predN; k++) {
      const i = this.predList[k];
      if (a.alive[i] && a.pack[i] === pk) a.pack[i] = best;
    }
  }

  /** Healthy adult herd-mates within 8 m of a prey animal (for a calf: is its mother close and fit). */
  private guardsNear(t: number, isYoung: boolean): number {
    const a = this.a;
    // calves count their mother double: she stands over them
    let bonus = 0;
    if (isYoung) {
      const m = a.mother[t];
      bonus = a.same(m, a.motherId[t]) && Math.abs(a.x[m] - a.x[t]) < 5 && Math.abs(a.y[m] - a.y[t]) < 5 && a.energy[m] > 0.45 ? 1 : 0;
    }
    const g = this.prey, nb = g.nb, bs = g.bs;
    const x = a.x[t], y = a.y[t], s = a.sp[t];
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    let n = 0;
    for (let yy = by - 1; yy <= by + 1; yy++) {
      if (yy < 0 || yy >= nb) continue;
      for (let xx = bx - 1; xx <= bx + 1; xx++) {
        if (xx < 0 || xx >= nb) continue;
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          if (j === t || !a.alive[j] || a.sp[j] !== s || a.energy[j] < 0.45) continue;
          if (a.age[j] < this.p.species[s].matureAge) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y;
          if (dx * dx + dy * dy < 64) n++;
        }
      }
    }
    return n + bonus;
  }

  private refreshCoarse(): void {
    const n = this.world.n, B = 32, r = n / B;
    const g = this.veg.grass, b = this.veg.browse, wat = this.world.water;
    this.coarseGrass.fill(0);
    this.coarseBrowse.fill(0);
    for (let j = 0; j < n; j++) {
      const bj = ((j / r) | 0) * B;
      for (let i = 0; i < n; i++) {
        const c = j * n + i;
        if (wat[c]) continue;
        const k = bj + ((i / r) | 0);
        this.coarseGrass[k] += g[c];
        this.coarseBrowse[k] += b[c];
      }
    }
    const inv = 1 / (r * r);
    for (let k = 0; k < B * B; k++) { this.coarseGrass[k] *= inv; this.coarseBrowse[k] *= inv; }
  }

  private sniffPrey(pk: number, range: number): void {
    const g = this.prey, nb = g.nb, bs = g.bs;
    const dx0 = this.packDenX[pk], dy0 = this.packDenY[pk];
    const cx = this.packCx[pk], cy = this.packCy[pk];
    const rb = Math.ceil(range / bs);
    const bx = Math.min(nb - 1, Math.max(0, (dx0 / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (dy0 / bs) | 0));
    let best = 0, bxw = dx0, byw = dy0;
    for (let yy = by - rb; yy <= by + rb; yy++) {
      if (yy < 0 || yy >= nb) continue;
      for (let xx = bx - rb; xx <= bx + rb; xx++) {
        if (xx < 0 || xx >= nb) continue;
        const cnt = g.counts[yy * nb + xx];
        if (cnt === 0) continue;
        const wx = (xx + 0.5) * bs, wy = (yy + 0.5) * bs;
        if (Math.hypot(wx - dx0, wy - dy0) > range) continue;
        // big herds are easy to scent; a few scattered animals mostly go unnoticed (a refuge for sparse prey)
        if (this.rng.next() > 1 - Math.exp(-Math.pow(cnt / this.p.wolfScentHerd, this.p.wolfScentPow))) continue;
        const v = cnt / (Math.hypot(wx - cx, wy - cy) + 50);
        if (v > best) { best = v; bxw = wx; byw = wy; }
      }
    }
    this.packHuntX[pk] = bxw;
    this.packHuntY[pk] = byw;
    this.packScentHit[pk] = best > 0 ? 1 : 0;
  }

  /** Record a moment for the followed animal, with per-kind rate limits so it reads like a story. */
  private logStory(i: number, kind: StoryEntry['kind'], a = 0): void {
    if (this.trackedId === 0 || this.a.id[i] !== this.trackedId) return;
    const gap = kind === 'fled' ? 300 : kind === 'chase' ? 240 : 0;
    if (gap && this.tick - (this.storyLast[kind] ?? -1e9) < gap) return;
    this.storyLast[kind] = this.tick;
    this.story.push({ tick: this.tick, kind, a });
    if (this.story.length > 60) this.story.shift();
  }

  setTracked(id: number): void {
    this.trackedId = id;
    this.lineage.follow(id);
    this.story = [];
    this.storyLast = {};
  }

  // ------------------------------------------------------------------ births and deaths

  private birth(mother: number, fatherSlot: number, sp: number, x: number, y: number): number {
    const a = this.a;
    const c = a.spawn();
    a.sp[c] = sp;
    a.x[c] = x;
    a.y[c] = y;
    a.heading[c] = a.heading[mother];
    a.male[c] = this.rng.next() < 0.5 ? 1 : 0;
    a.born[c] = this.tick;
    a.energy[c] = 0.6;
    a.hydration[c] = 0.9;
    a.mother[c] = mother;
    a.motherId[c] = a.id[mother];
    const useMate = fatherSlot < 0;
    const fatherGen = useMate ? a.gen[mother] : a.gen[fatherSlot];
    a.gen[c] = Math.max(a.gen[mother], fatherGen) + 1;
    a.parentA[c] = a.id[mother];
    a.parentB[c] = useMate ? a.mateId[mother] : a.id[fatherSlot];
    const mut = this.p.mutation;
    for (let g = 0; g < NG; g++) {
      const mg = a.genes[mother * NG + g];
      const fg = useMate ? a.mateGenes[mother * NG + g] : a.genes[fatherSlot * NG + g];
      let v = this.rng.next() < 0.5 ? mg : fg;
      v += this.rng.normal() * mut * (g === G_COAT ? 0.7 : 1);
      a.genes[c * NG + g] = g === G_COAT ? clampCoat(sp, v) : clampGene(g, v);
    }
    a.children[mother]++;
    if (!useMate && fatherSlot >= 0) a.children[fatherSlot]++;
    this.cBirths[sp]++;
    return c;
  }

  private die(i: number, cause: 'starve' | 'thirst' | 'old' | 'killed' | 'culled' | 'removed' | 'emigrated' | 'disease'): void {
    const a = this.a;
    this.logStory(i, 'died', ['starve', 'thirst', 'old', 'killed', 'culled', 'removed', 'emigrated', 'disease'].indexOf(cause));
    const s = a.sp[i];
    if (cause === 'starve') { this.cStarve[s]++; if (s === Sp.Bison && a.age[i] < this.p.species[s].matureAge) this.cStarveJuv++; }
    else if (cause === 'thirst') this.cThirst[s]++;
    else if (cause === 'old') {
      this.cOld[s]++;
    } else if (cause === 'killed') this.cKilled[s]++;
    if (cause !== 'removed' && cause !== 'emigrated') {
      // species with no meat (ravens) leave nothing: the meat > 0.05 test below drops them
      const P = this.p.species[s];
      const juvenileF = a.age[i] < P.matureAge ? 0.25 + 0.75 * (a.age[i] / P.matureAge) : 1;
      const meat = P.meat * a.genes[i * NG + G_SIZE] * juvenileF * (cause === 'starve' ? 0.6 : 1) * (cause === 'culled' ? 0.5 : 1);
      if (meat > 0.05) this.addCarcass(a.x[i], a.y[i], meat * (cause === 'old' ? 0.6 : 1), s, cause === 'killed' ? 1 : 0);
    }
    this.lineage.onDeath(i, DEATH_CAUSES.indexOf(cause), this.tick);
    a.kill(i);
  }

  private addCarcass(x: number, y: number, meat: number, sp: number, kill: number): void {
    if (this.cN >= this.cX.length) {
      const grow = <T extends Float32Array | Int32Array | Uint8Array>(arr: T): T => {
        const n = new (arr.constructor as new (n: number) => T)(arr.length * 2);
        n.set(arr);
        return n;
      };
      this.cX = grow(this.cX); this.cY = grow(this.cY); this.cMeat = grow(this.cMeat);
      this.cMeat0 = grow(this.cMeat0); this.cSp = grow(this.cSp); this.cAge = grow(this.cAge); this.cKill = grow(this.cKill);
    }
    const k = this.cN++;
    this.cX[k] = x; this.cY[k] = y; this.cMeat[k] = meat; this.cMeat0[k] = meat; this.cSp[k] = sp; this.cAge[k] = 0; this.cKill[k] = kill;
  }

  private updateCarcasses(): void {
    const rot = this.p.carcassRot;
    for (let k = 0; k < this.cN; k++) {
      this.cAge[k]++;
      this.cMeat[k] -= rot * (0.5 + this.env.state.warmth) + this.cMeat[k] * 0.0006 * (0.4 + this.env.state.warmth);
      if (this.cMeat[k] <= 0 || this.cAge[k] > BASE_YEAR_TICKS) {
        // the remains feed the soil: kill sites green up
        this.veg.stamp(this.veg.soil, this.cX[k], this.cY[k], 7, this.p.carcassSoil * Math.min(4, this.cMeat0[k]), 1.4);
        const last = --this.cN;
        this.cX[k] = this.cX[last]; this.cY[k] = this.cY[last]; this.cMeat[k] = this.cMeat[last];
        this.cMeat0[k] = this.cMeat0[last]; this.cSp[k] = this.cSp[last]; this.cAge[k] = this.cAge[last]; this.cKill[k] = this.cKill[last];
        k--;
      }
    }
  }

  private nearestCarcass(x: number, y: number, maxD: number, maxAge = 1e9, killOnly = false): number {
    let best = -1, bd = maxD * maxD;
    for (let k = 0; k < this.cN; k++) {
      if (this.cMeat[k] < 0.05 || this.cAge[k] > maxAge || (killOnly && !this.cKill[k])) continue;
      const dx = this.cX[k] - x, dy = this.cY[k] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = k; }
    }
    return best;
  }

  // ------------------------------------------------------------------ movement and physiology

  private moveGround(i: number, P: SpeciesParams): void {
    const a = this.a;
    const st = a.state[i];
    const urgent = st === St.Flee || st === St.Chase || st === St.Stalk;
    const accel = urgent ? 0.3 : 0.15;
    // animals move where they face: speed eases toward the desired speed, and the body turns toward the
    // desired direction at a limited rate (no sideways sliding; nudges from herd-mates become turns)
    const dvx = a.dvx[i], dvy = a.dvy[i];
    const dsp = Math.sqrt(dvx * dvx + dvy * dvy);
    let sp = Math.sqrt(a.vx[i] * a.vx[i] + a.vy[i] * a.vy[i]);
    sp += (dsp - sp) * accel;
    if (dsp > 0.04) {
      let dh = Math.atan2(dvy, dvx) - a.heading[i];
      if (dh > Math.PI) dh -= Math.PI * 2; else if (dh < -Math.PI) dh += Math.PI * 2;
      // agile when it matters: a chasing wolf or a fleeing pronghorn can wheel hard
      // turn rate scales with speed so the turning circle stays a couple of body lengths (no orbiting a target)
      const maxTurn = Math.max(urgent ? 0.3 : 0.12, (sp * DT) / (urgent ? 1.5 : 2.2));
      a.heading[i] += dh > maxTurn ? maxTurn : dh < -maxTurn ? -maxTurn : dh;
      // you can't sprint around a hairpin
      if (dh > 1.3 || dh < -1.3) sp *= 0.9;
    }
    let vx = Math.cos(a.heading[i]) * sp;
    let vy = Math.sin(a.heading[i]) * sp;
    if (this.p.steerFree > 0 || (urgent && this.p.steerFreeUrgent > 0)) {
      // free steering (velocity eases straight toward the desired velocity)
      vx = a.vx[i] + (dvx - a.vx[i]) * accel;
      vy = a.vy[i] + (dvy - a.vy[i]) * accel;
    }
    // stamina: sprinting drains, everything else recovers
    const sprinting = sp > P.walkSpeed * 2.2;
    if (sprinting) {
      a.stamina[i] -= 1 / P.stamina;
      if (a.stamina[i] < 0) a.stamina[i] = 0;
    } else if (a.stamina[i] < 1) {
      a.stamina[i] += 1 / (P.stamina * 2.5);
    }
    const w = this.world;
    let x = a.x[i] + vx * DT, y = a.y[i] + vy * DT;
    const c = this.veg.cellAt(x, y);
    if (w.water[c] && a.state[i] !== St.Drink) {
      // wading: slow, and ponds push you back to shore
      vx *= 0.85; vy *= 0.85;
      x = a.x[i] + vx * DT * 0.5;
      y = a.y[i] + vy * DT * 0.5;
    }
    if (x < 2) { x = 2; vx = Math.abs(vx); } else if (x > w.size - 2) { x = w.size - 2; vx = -Math.abs(vx); }
    if (y < 2) { y = 2; vy = Math.abs(vy); } else if (y > w.size - 2) { y = w.size - 2; vy = -Math.abs(vy); }
    a.x[i] = x; a.y[i] = y; a.vx[i] = vx; a.vy[i] = vy;
    sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > 0.08 && (vx !== 0 || vy !== 0)) a.heading[i] = Math.atan2(vy, vx);
    // trampling wears the grass: stampede paths stay visible
    if (sp > 4) this.veg.grass[c] = Math.max(0, this.veg.grass[c] - this.p.trampleRun);
    else if (sp > 0.8) this.veg.grass[c] = Math.max(0, this.veg.grass[c] - this.p.trampleWalk);
  }

  private metabolism(i: number, P: SpeciesParams): number {
    const a = this.a;
    const o = i * NG;
    const size = a.genes[o + G_SIZE], spd = a.genes[o + G_SPEED], sight = a.genes[o + G_SIGHT];
    const v = Math.sqrt(a.vx[i] * a.vx[i] + a.vy[i] * a.vy[i]);
    // reserves scale with mass and burn with mass^0.75, so in normalized energy a big animal drains slower;
    // a fast build costs most while actually sprinting; keen sight costs a little all the time
    const running = v > P.walkSpeed * 2.2;
    const activity = a.state[i] === St.Rest ? 0.7 : running ? 1.8 : v > 0.3 ? 1.05 : 0.9;
    let m = P.metabolism * Math.pow(size, -0.25) * (0.98 + 0.02 * spd * spd) * activity;
    const sprintCost = P.sprintCost > 0 ? P.sprintCost : this.p.sprintCost;
    if (running && sprintCost > 0) m *= Math.max(0.3, 1 + sprintCost * (spd * spd - 1));
    // deep snow makes every step cost more (ground animals that are moving)
    if (this.winter !== null && v > 0.3 && !SPECIES[a.sp[i]].flies) m *= 1 + this.p.snowMove * this.winter.at(a.x[i], a.y[i]);
    if (a.infected[i] > 0) m *= this.p.diseaseMetab;
    if (this.blizzardLeft > 0) m *= BLIZZARD_COLD;
    if (this.dis.on && IS_CANID[a.sp[i]]) m *= this.dis.metabMult(i, this.env.state.warmth);
    if (a.age[i] < P.matureAge) m *= 0.75;
    // cold costs extra, much more for a small bird
    m *= 1 + (SPECIES[a.sp[i]].flies ? 0.5 : 0.25) * (1 - this.env.state.warmth);
    return m;
  }

  /** Shared aging, hydration, death checks. Returns false if the animal died. */
  private vitals(i: number, P: SpeciesParams): boolean {
    const a = this.a;
    a.energy[i] -= this.metabolism(i, P);
    if (P.thirst > 0) a.hydration[i] -= P.thirst * (0.7 + 0.6 * this.env.state.warmth);
    a.age[i]++;
    if (a.energy[i] <= 0) { this.die(i, 'starve'); return false; }
    if (a.hydration[i] <= 0) { this.die(i, 'thirst'); return false; }
    const af = a.age[i] / P.maxAge;
    if (af > 0.6) {
      const hz = 0.00025 * Math.exp((af - 0.6) * 9);
      if (this.rng.next() < hz) {
        if (af > 0.95 && this.rng.next() < 0.05) this.event('elder', a.sp[i], a.x[i], a.y[i], a.age[i], a.id[i]);
        this.die(i, 'old');
        return false;
      }
    }
    if (this.dis.cdvOn && a.cdv[i] > 0 && IS_CANID[a.sp[i]] && this.dis.tickCdv(i)) return false;
    if (a.infected[i] > 0) {
      if (--a.infected[i] === 0) { a.immune[i] = BASE_YEAR_TICKS; this.logStory(i, 'recovered'); }
    } else if (a.immune[i] > 0) a.immune[i]--;
    if (a.cooldown[i] > 0) a.cooldown[i]--;
    if (a.flee[i] > 0) a.flee[i]--;
    return true;
  }

  // ------------------------------------------------------------------ herbivores (bison)

  private thinkHerbivore(i: number, P: SpeciesParams): void {
    const a = this.a, p = this.p, rng = this.rng;
    const s = a.sp[i];
    const x = a.x[i], y = a.y[i];
    const o = i * NG;
    const juvenile = a.age[i] < P.matureAge;
    // a mule deer (S8) browses only in its habitat: tree and shrub cover and the draws along the water (null for every other species)
    const mh = s === Sp.MuleDeer ? this.mule.hab : null;
    const hr = P.herdRadius, hr2 = hr * hr;
    const spacing = p.herdSpacing, spacing2 = p.herdSepRange * p.herdSepRange, coh = p.herdCohesion;

    // --- herd scan (3x3 buckets)
    const g = this.prey, nb = g.nb, bs = g.bs;
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    // herdSpacingGraze: a second, wider separation sum used only while grazing (computed only when the param is on)
    const gm = p.herdSpacingGraze, gSpacing = spacing * gm, gSpacing2 = spacing2 * gm * gm;
    let gsepx = 0, gsepy = 0;
    let n = 0, cx = 0, cy = 0, avx = 0, avy = 0, sepx = 0, sepy = 0, alarm = 0, alx = 0, aly = 0, infNear = 0, maxFlee = 0;
    let mate = -1, mateD = 1e9;
    let nnx = 0, nny = 0, nnd2 = 1e9;
    const wantMate = !a.male[i] && !juvenile && a.pregnant[i] === 0 && a.cooldown[i] === 0 && a.energy[i] > p.conceiveEnergy;
    for (let yy = by - 1; yy <= by + 1; yy++) {
      if (yy < 0 || yy >= nb) continue;
      for (let xx = bx - 1; xx <= bx + 1; xx++) {
        if (xx < 0 || xx >= nb) continue;
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          if (j === i || !a.alive[j] || a.sp[j] !== s) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 > hr2) continue;
          // a herd animal tracks its nearest few dozen neighbors, not the whole crowd
          if (n >= 40 && d2 > 9) continue;
          n++;
          if (d2 < nnd2) { nnd2 = d2; nnx = dx; nny = dy; }
          cx += a.x[j]; cy += a.y[j];
          avx += a.vx[j]; avy += a.vy[j];
          if (d2 < spacing2) {
            // keep some personal space from the nearest herd-mates
            const d = Math.sqrt(d2) + 0.01;
            sepx -= dx / d * (spacing - d);
            sepy -= dy / d * (spacing - d);
          }
          if (gm > 0 && d2 < gSpacing2) {
            const d = Math.sqrt(d2) + 0.01;
            gsepx -= dx / d * (gSpacing - d);
            gsepy -= dy / d * (gSpacing - d);
          }
          if (a.flee[j] > 18) { alarm++; alx += a.fleeX[j]; aly += a.fleeY[j]; if (a.flee[j] > maxFlee) maxFlee = a.flee[j]; }
          if (a.infected[j] > 0 && d2 < 16) infNear++;
          if (wantMate && a.male[j] && a.age[j] >= P.matureAge && d2 < mateD) { mate = j; mateD = d2; }
        }
      }
    }

    a.nbr[i] = n > 255 ? 255 : n;

    // --- disease: density-dependent transmission plus rare sparks in crowded herds
    if (a.infected[i] === 0 && a.immune[i] === 0) {
      let pInf = 1 - Math.pow(1 - p.diseaseBeta, infNear);
      if (n > p.diseaseSparkDensity) pInf += p.diseaseSpark * (n - p.diseaseSparkDensity);
      if (pInf > 0 && rng.next() < pInf) {
        a.infected[i] = p.diseaseTicks;
        this.logStory(i, 'infected');
        if (infNear === 0 && this.tick - this.lastOutbreak > BASE_YEAR_TICKS / 2) {
          this.lastOutbreak = this.tick;
          this.event('outbreak', s, x, y, n, 0);
        }
      }
    }

    // --- reproduction
    if (mate >= 0 && this.inMatingSeason(P)) {
      a.pregnant[i] = P.gestation;
      a.mateId[i] = a.id[mate];
      this.lineage.onMate(mate);
      for (let k = 0; k < NG; k++) a.mateGenes[o + k] = a.genes[mate * NG + k];
    }

    const fearHere = this.veg.fear[this.veg.cellAt(x, y)];
    // --- predators: detection with vigilance (more eyes, earlier warning)
    const night = this.env.isNight();
    const sight = P.sight * a.genes[o + G_SIGHT] * (night ? 0.65 : 1) * this.visMul;
    const pg = this.pred;
    const rr = Math.ceil(sight / bs);
    let threat = -1, threatD = 1e9;
    for (let yy = by - rr; yy <= by + rr; yy++) {
      if (yy < 0 || yy >= nb) continue;
      for (let xx = bx - rr; xx <= bx + rr; xx++) {
        if (xx < 0 || xx >= nb) continue;
        const b = yy * nb + xx;
        for (let k = pg.start[b], e = pg.start[b + 1]; k < e; k++) {
          const j = pg.items[k];
          if (!a.alive[j]) continue;
          // how much this species reacts to that predator: wolves and cougars fully, coyotes weakly (bison not at all)
          const rx = REACT[s][a.sp[j]];
          if (rx === 0) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (rx < 1) {
            // a minor threat (the coyote): only the young, and a doe with a fawn at heel (calved within the hiding age), pay it any mind
            if (!juvenile && !(P.hideAge > 0 && a.cooldown[i] > P.birthCooldown - P.hideAge)) continue;
            // a hidden fawn lies still and does not break cover for a coyote until it is almost on top of it
            if (P.hideAge > 0 && a.age[i] < P.hideAge && a.state[i] === St.Rest && d > 4) continue;
          }
          // a predator's coat against the grass changes how far away it is noticed
          const contrast = Math.abs((1 - a.genes[j * NG + G_COAT]) * 0.75 + 0.1 - this.groundB);
          let eff = sight * (0.6 + 0.8 * contrast);
          // a cougar lying in cover is nearly invisible until it moves
          if (a.sp[j] === Sp.Cougar && a.state[j] !== St.Chase) eff *= 1 - 0.8 * this.world.cover[this.veg.cellAt(a.x[j], a.y[j])];
          const hunting = a.state[j] === St.Chase;
          const stalking = a.state[j] === St.Stalk;
          if (d > (hunting ? sight * 0.75 : eff)) continue;
          const bold = a.genes[o + G_BOLD];
          // big grazers stand their ground against wolves that aren't hunting unless they come very close
          if (!hunting && !stalking && d > eff * (P.wariness - 0.15 * bold)) continue;
          if (stalking && d > eff * 0.6) continue;
          // in risky ground (high fear) the herd is on edge and notices more
          let pd = hunting ? 0.95 : Math.min(0.95, p.detectBase * (1 - d / (eff + 1)) * (stalking ? 0.8 * (1 + p.fearVigilance * fearHere) : 1));
          if (rx < 1) pd *= rx;
          const vig = 1 - Math.pow(1 - pd, 1 + p.vigilancePerNeighbor * n * (p.herdEyes > 0 ? Math.max(0, 1 + p.herdEyes * (a.genes[o + G_HERD] - 1)) : 1));
          if (rng.next() < vig && d < threatD) { threat = j; threatD = d; }
        }
      }
    }
    if (threat >= 0 && a.hydration[i] < 0.2 && !(a.state[threat] === St.Chase && threatD < 12)) threat = -1;
    if (threat >= 0) {
      const dx = x - a.x[threat], dy = y - a.y[threat];
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const wasFleeing = a.flee[i] > 0;
      if (!wasFleeing) this.logStory(i, 'fled', a.sp[threat]);
      a.flee[i] = 24 + ((rng.next() * 16) | 0);
      const m = wasFleeing ? p.fleeMomentum : 0;
      if (m > 0) {
        // a running herd keeps its line: a renewed scare bends the flight rather than turning it around
        const fx = a.fleeX[i] * m + (dx / d) * (1 - m), fy = a.fleeY[i] * m + (dy / d) * (1 - m);
        const fl = Math.sqrt(fx * fx + fy * fy) + 1e-6;
        a.fleeX[i] = fx / fl;
        a.fleeY[i] = fy / fl;
      } else {
        a.fleeX[i] = dx / d;
        a.fleeY[i] = dy / d;
      }
    } else if (alarm > 0 && a.flee[i] === 0 && rng.next() < p.alarmContagion * Math.min(1.5, a.genes[o + G_HERD])) {
      const l = Math.sqrt(alx * alx + aly * aly) + 0.01;
      // the alarm weakens with every hop, so a panic wave runs out instead of feeding itself
      a.flee[i] = maxFlee - 16;
      a.fleeX[i] = alx / l;
      a.fleeY[i] = aly / l;
    }

    // --- choose desired velocity
    const spdGene = a.genes[o + G_SPEED] / Math.pow(a.genes[o + G_SIZE], 0.25);
    const walk = P.walkSpeed;
    let dvx = 0, dvy = 0;
    let state: number = St.Idle;
    // a mule deer group that has grown past muledeerGroupMax stops cohering and drifts apart, so the groups stay 3 to 10
    const herd = a.genes[o + G_HERD] * (mh !== null && n >= p.muledeerGroupMax ? -0.6 : 1);
    if (n > 0) { cx /= n; cy /= n; avx /= n; avy /= n; }
    const c = this.veg.cellAt(x, y);
    if (a.flee[i] > 0 && a.hydration[i] < 0.2 && threat < 0) a.flee[i] = 0;
    if (a.flee[i] > 0) {
      const run = P.runSpeed * spdGene * (a.stamina[i] > 0.08 ? 1 : 0.45) * (a.infected[i] > 0 ? 0.8 : 1) * (juvenile ? 0.85 : 1);
      dvx = a.fleeX[i] * run + sepx * 2;
      dvy = a.fleeY[i] * run + sepy * 2;
      state = St.Flee;
    } else if (a.hydration[i] < 0.3 || (a.state[i] === St.Drink && a.hydration[i] < 0.97)) {
      if (this.drinkD[c] < 3) {
        state = St.Drink;
        a.hydration[i] = Math.min(1, a.hydration[i] + 0.09);
      } else {
        const hurry = a.hydration[i] < 0.15 ? 2.2 : 1.4;
        dvx = this.waterGX[c] * walk * hurry + sepx;
        dvy = this.waterGY[c] * walk * hurry + sepy;
        state = St.Walk;
      }
    } else {
      const mother = a.mother[i];
      const followMom = juvenile && a.same(mother, a.motherId[i]);
      const hiding = P.hideAge > 0 && a.age[i] < P.hideAge && followMom && Math.hypot(a.x[mother] - x, a.y[mother] - y) < 35;
      const browser = P.diet > 0;
      // dogGrazeBonus (S4): grazers favour the edges of prairie dog towns, where the grass regrows short and sweet
      const gb = !browser && this.small !== null && this.p.dogGrazeBonus > 0 ? this.small.grazeBonus : null;
      // snow hides the food (winter, S11): the grazer sees the patch, the next steps and the far pastures through the depth
      const win = this.winter, sk = win !== null ? this.snowGrazeK(s) : 0;
      let gHere = (browser ? (this.veg.browse[c] > 0.03 ? this.veg.browse[c] * 1.6 + this.veg.grass[c] * 0.3 : 0) : this.veg.grass[c]) * (mh !== null ? mh[c] : 1);
      if (sk > 0) gHere *= 1 - sk * win!.at(x, y);
      if (hiding) {
        // a young fawn lies still in the grass while its mother grazes nearby
        state = St.Rest;
        dvx = 0; dvy = 0;
      } else if (followMom && Math.hypot(a.x[mother] - x, a.y[mother] - y) > 4) {
        const dx = a.x[mother] - x, dy = a.y[mother] - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const sp = Math.min(walk * 2.5, d * 0.4);
        dvx = (dx / d) * sp + sepx;
        dvy = (dy / d) * sp + sepy;
        state = St.Walk;
      } else if (a.energy[i] >= 0.97 || (this.env.isNight() && a.energy[i] > 0.8)) {
        state = St.Rest;
        dvx = sepx * 0.5;
        dvy = sepy * 0.5;
        if (n > 0) {
          if (p.herdNearest > 0) {
            const d = Math.sqrt(nnd2);
            if (d > p.herdNearest + 1) { dvx += (nnx / d) * 0.6 * herd; dvy += (nny / d) * 0.6 * herd; state = St.Walk; }
          } else {
            const dx = cx - x, dy = cy - y, d = Math.sqrt(dx * dx + dy * dy);
            if (d > coh + 1) { dvx += (dx / d) * 0.6 * herd; dvy += (dy / d) * 0.6 * herd; state = St.Walk; }
          }
        }
      } else {
        // graze while drifting toward better grass; walk on only when the patch is spent
        let bestS = -1e9, bdx = 0, bdy = 0;
        const hereS = gHere - p.fearWeight * fearHere;
        const base = a.heading[i];
        const grazing = gHere > p.grazeMin && fearHere < 0.8;
        const r0 = grazing ? 4 : 8, r1 = grazing ? 4 : 20;
        for (let k = 0; k < 8; k++) {
          const ang = base + (k / 8) * Math.PI * 2;
          const ux = Math.cos(ang), uy = Math.sin(ang);
          for (let r = r0; r <= r1; r += 12) {
            const sx = x + ux * r, sy = y + uy * r;
            if (sx < 3 || sy < 3 || sx > this.world.size - 3 || sy > this.world.size - 3) continue;
            const sc = this.veg.cellAt(sx, sy);
            if (this.world.water[sc]) continue;
            let food = (browser ? this.veg.browse[sc] * 1.6 + this.veg.grass[sc] * 0.35 : this.veg.grass[sc]) * (mh !== null ? mh[sc] : 1);
            if (sk > 0) food *= 1 - sk * win!.at(sx, sy);
            let score = food - p.fearWeight * this.veg.fear[sc] - 0.004 * this.prey.counts[this.prey.bucketOf(sx, sy)] + (k === 0 ? 0.03 : 0) + rng.next() * 0.02;
            if (gb !== null) score += gb[this.small!.cellOf(sx, sy)];
            if (score > bestS) { bestS = score; bdx = ux; bdy = uy; }
          }
        }
        if (grazing) {
          state = St.Graze;
          const v = bestS > hereS + 0.05 ? 0.35 : 0.12;
          // with herdSpacingGraze the personal space is wider and the pull back to the herd weaker by the same factor
          dvx = bdx * v + (gm > 0 ? gsepx : sepx) * 0.5;
          dvy = bdy * v + (gm > 0 ? gsepy : sepy) * 0.5;
          const gcoh = gm > 0 ? 0.3 / gm : 0.3;
          if (n > 0) {
            if (p.herdNearest > 0) {
              // stay within reach of the nearest herd-mate rather than the herd's centre: grazing fronts and strands, not rings
              const d = Math.sqrt(nnd2);
              if (d > p.herdNearest) { dvx += (nnx / d) * gcoh * herd; dvy += (nny / d) * gcoh * herd; }
            } else {
              const dx = cx - x, dy = cy - y, d = Math.sqrt(dx * dx + dy * dy);
              if (d > coh) { dvx += (dx / d) * gcoh * herd; dvy += (dy / d) * gcoh * herd; }
            }
          }
        } else {
          if (bestS < p.migrateBelow) {
            // the local patch is spent: head for the greenest pasture within reach (herd-mates see the same map)
            const B = 32, cs = this.world.size / B;
            const bx0 = Math.min(B - 1, (x / cs) | 0), by0 = Math.min(B - 1, (y / cs) | 0);
            const R = 8;
            let bv = -1e9, tx = x, ty = y;
            for (let yy = Math.max(0, by0 - R); yy <= Math.min(B - 1, by0 + R); yy++) {
              for (let xx = Math.max(0, bx0 - R); xx <= Math.min(B - 1, bx0 + R); xx++) {
                const k = yy * B + xx;
                const cx2 = (xx + 0.5) * cs, cy2 = (yy + 0.5) * cs;
                let food = mh !== null ? this.mule.coarse[k] : browser ? this.coarseBrowse[k] * 1.6 + this.coarseGrass[k] * 0.35 : this.coarseGrass[k];
                if (sk > 0) food *= 1 - sk * win!.depth[k];
                let v = food - 0.0012 * Math.hypot(cx2 - x, cy2 - y) - 0.004 * this.prey.counts[this.prey.bucketOf(cx2, cy2)];
                if (gb !== null) v += gb[k];
                if (v > bv) { bv = v; tx = cx2; ty = cy2; }
              }
            }
            const l = Math.hypot(tx - x, ty - y);
            if (l > 4) { bdx = (tx - x) / l; bdy = (ty - y) / l; }
          }
          dvx = bdx * walk + sepx;
          dvy = bdy * walk + sepy;
          if (n > 0) {
            const dx = cx - x, dy = cy - y, d = Math.sqrt(dx * dx + dy * dy);
            if (d > coh - 1) { dvx += (dx / d) * 0.7 * herd; dvy += (dy / d) * 0.7 * herd; }
            dvx += avx * 0.3 * herd;
            dvy += avy * 0.3 * herd;
          }
          state = St.Walk;
        }
      }
    }
    // drink spots: a grazer that has drunk its fill drifts back off the bank instead of lingering in a ring at the water
    if (p.drinkSpots > 0 && state !== St.Drink && state !== St.Flee && a.hydration[i] > 0.85 && this.drinkD[c] < 12) {
      dvx -= this.waterGX[c] * 0.5;
      dvy -= this.waterGY[c] * 0.5;
    }
    a.dvx[i] = dvx;
    a.dvy[i] = dvy;
    a.state[i] = state;
  }

  /** How hard snow cuts a grazer's food: the grazing multiplier is 1 - k x depth (winter, S11). */
  private snowGrazeK(sp: number): number {
    const p = this.p;
    return sp === Sp.Bison ? p.snowGrazeBison : sp === Sp.MuleDeer ? p.snowGrazeMule : p.snowGrazePronghorn;
  }

  private liveHerbivore(i: number, P: SpeciesParams): void {
    const a = this.a;
    if (a.state[i] === St.Graze) {
      const c = this.veg.cellAt(a.x[i], a.y[i]);
      const juvenile = a.age[i] < P.matureAge;
      const sz = a.genes[i * NG + G_SIZE];
      let want = P.bite * Math.pow(sz, 0.75) * (juvenile ? 0.55 : 1);
      if (this.winter !== null) {
        const sk = this.snowGrazeK(a.sp[i]);
        if (sk > 0) want *= 1 - sk * this.winter.at(a.x[i], a.y[i]);
      }
      const perMass = 1 / sz; // energy is normalized to body reserves
      if (P.diet > 0) {
        // browsers take forbs and shrubs first, then grass at half value
        const bw = this.veg.browse[c];
        const b1 = bw < want ? bw : want;
        this.veg.browse[c] = bw - b1;
        let gain = b1 * P.foodValue;
        if (b1 < want) {
          const g = this.veg.grass[c];
          const b2 = Math.min(g, want - b1);
          this.veg.grass[c] = g - b2;
          gain += b2 * P.foodValue * 0.6;
        }
        a.energy[i] = Math.min(1, a.energy[i] + gain * perMass);
      } else {
        const g = this.veg.grass[c];
        const bite = g < want ? g : want;
        this.veg.grass[c] = g - bite;
        a.energy[i] = Math.min(1, a.energy[i] + bite * P.foodValue * perMass);
      }
    }
    // calves nurse while close to their mother
    if (a.age[i] < P.matureAge * 0.5) {
      const m = a.mother[i];
      const reach = P.hideAge > 0 && a.age[i] < P.hideAge ? 35 : 5;
      if (a.same(m, a.motherId[i]) && Math.abs(a.x[m] - a.x[i]) < reach && Math.abs(a.y[m] - a.y[i]) < reach && a.energy[m] > 0.3) {
        // milk costs the mother a share of what she can eat, so small species aren't overdrawn by twins
        const milk = 0.26 * P.bite * P.foodValue;
        a.energy[i] = Math.min(1, a.energy[i] + milk * 0.9);
        a.energy[m] -= milk;
        a.hydration[i] = Math.min(1, a.hydration[i] + 0.001);
      }
    }
    if (!this.vitals(i, P)) return;
    if (a.pregnant[i] > 0 && --a.pregnant[i] === 0) {
      let litter = Math.min(P.maxLitter, Math.max(1, Math.round(P.litter * a.genes[i * NG + G_LITTER] + (this.rng.next() - 0.5) * 0.6)));
      if (this.p.leanLitter > 0) {
        // in lean times fewer young make it through their first days
        const cond = Math.min(1, Math.max(0, (a.energy[i] - 0.3) / 0.5));
        const lose = this.p.leanLitter * (1 - cond);
        let kept = 0;
        for (let k = 0; k < litter; k++) if (this.rng.next() >= lose) kept++;
        litter = kept;
      }
      for (let k = 0; k < litter; k++) this.birth(i, -1, a.sp[i], a.x[i] + this.rng.range(-1, 1), a.y[i] + this.rng.range(-1, 1));
      if (litter > 0) this.logStory(i, 'birth', litter);
      a.energy[i] -= 0.12 * litter;
      a.cooldown[i] = P.birthCooldown;
      if (a.energy[i] <= 0) this.die(i, 'starve');
    }
  }

  // ------------------------------------------------------------------ wolves

  private thinkWolf(i: number, P: SpeciesParams): void {
    const a = this.a, p = this.p, rng = this.rng;
    const x = a.x[i], y = a.y[i];
    const o = i * NG;
    const pk = a.pack[i];
    const juvenile = a.age[i] < P.matureAge;
    const spdGene = a.genes[o + G_SPEED] / Math.pow(a.genes[o + G_SIZE], 0.25);
    const run = P.runSpeed * spdGene * (a.stamina[i] > 0.05 ? 1 : 0.35) * (this.dis.mangeOn ? this.dis.mangeSpeed(i) : 1);
    const trot = P.walkSpeed * 1.6;
    const c = this.veg.cellAt(x, y);
    let dvx = 0, dvy = 0;
    let state: number = St.Idle;
    // landscape of fear: wolves leave scent wherever they go
    if (this.veg.fear[c] < 0.5) this.veg.fear[c] += p.fearPredatorStamp;

    const denX = pk >= 0 ? this.packDenX[pk] : x, denY = pk >= 0 ? this.packDenY[pk] : y;
    const toDen = Math.hypot(denX - x, denY - y);
    const pupAtDen = juvenile && a.age[i] < p.wolfPupDenAge && pk >= 0;
    if (a.cdv[i] > 0 && this.dis.cdvOn) this.dis.packSpread(i, this.predList, this.predN);

    if (pupAtDen) {
      // pups stay at the den and are fed from the pack's store
      if (toDen > 6) { dvx = (denX - x) / toDen * trot; dvy = (denY - y) / toDen * trot; state = St.Walk; }
      else { dvx = (rng.next() - 0.5) * 0.6; dvy = (rng.next() - 0.5) * 0.6; state = St.Idle; }
      a.dvx[i] = dvx; a.dvy[i] = dvy; a.state[i] = state;
      return;
    }

    // a wolf in an active chase stays committed: no water or carrion detours unless desperate
    const chasing = (a.state[i] === St.Chase || a.state[i] === St.Stalk) && a.same(a.target[i], a.targetId[i]) && a.stamina[i] > 0.05;


    // water comes first unless starving
    if (((a.hydration[i] < 0.3 && !chasing) || a.hydration[i] < 0.08) && a.energy[i] > 0.12 || (a.state[i] === St.Drink && a.hydration[i] < 0.97)) {
      if (this.drinkD[c] < 3) { state = St.Drink; a.hydration[i] = Math.min(1, a.hydration[i] + 0.06); }
      else { dvx = this.waterGX[c] * trot; dvy = this.waterGY[c] * trot; state = St.Walk; }
      a.dvx[i] = dvx; a.dvy[i] = dvy; a.state[i] = state;
      return;
    }

    // feeding at a fresh carcass
    if (a.energy[i] < 0.93 && !chasing) {
      const k = this.nearestCarcass(x, y, 45, 500, true);
      if (k >= 0) {
        const dx = this.cX[k] - x, dy = this.cY[k] - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2.2) { state = St.Eat; a.timer[i] = k; }
        else { const v = Math.min(run, trot * 1.5, 0.6 + d * 0.5); dvx = (dx / d) * v; dvy = (dy / d) * v; state = St.Walk; }
        a.dvx[i] = dvx; a.dvy[i] = dvy; a.state[i] = state;
        return;
      }
    }

    const night = this.env.isNight();
    const d = this.env.state.dayFrac;
    const crepuscular = (d > 0.2 && d < 0.32) || (d > 0.68 && d < 0.82);
    const hungerLine = p.wolfHuntHunger + (crepuscular ? 0.1 : 0) + (night ? 0.05 : 0);
    let tgt = -1;
    if (a.same(a.target[i], a.targetId[i])) tgt = a.target[i];
    else if (pk >= 0 && this.packTarget[pk] >= 0 && a.energy[i] < 0.9 && a.same(this.packTarget[pk], this.packTargetId[pk])) tgt = this.packTarget[pk];
    if (tgt >= 0 && a.sp[tgt] === Sp.Beaver && this.beavers !== null && this.beavers.safe(tgt)) {
      // the beaver reached the water: the hunt is off
      a.target[i] = -1;
      if (pk >= 0 && this.packTarget[pk] === tgt) this.packTarget[pk] = -1;
      tgt = -1;
    }
    const resting = a.timer[i] < 0; // negative timer = exhausted cooldown
    if (resting) a.timer[i] += 3;

    const opportunist = tgt < 0 && !resting && !juvenile && a.energy[i] >= hungerLine && rng.next() < p.wolfOpportunism;
    // hunts begin on herds the pack has scented; a wolf doesn't stumble onto scattered prey while mousing
    const scented = pk < 0 || this.packScentHit[pk] === 1 || this.p.huntNeedsScent === 0;
    if (tgt < 0 && (a.energy[i] < hungerLine || opportunist) && !resting && (scented || opportunist)) {
      // look for the most vulnerable prey in sight
      const sight = P.sight * a.genes[o + G_SIGHT] * (night ? 0.75 : 1) * this.visMul;
      const g = this.prey, nb = g.nb, bs = g.bs;
      const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
      // coat search image (S9): a matching coat is noticed from further off, so the scan reaches that far too
      const imgOn = p.coatSearch > 0 && pk >= 0;
      const reach = imgOn ? sight * Math.max(1, p.coatSearchBoost) : sight;
      const rr = Math.ceil(reach / bs);
      let best = -1, bestS = 0;
      for (let yy = by - rr; yy <= by + rr; yy++) {
        if (yy < 0 || yy >= nb) continue;
        for (let xx = bx - rr; xx <= bx + rr; xx++) {
          if (xx < 0 || xx >= nb) continue;
          const b = yy * nb + xx;
          const crowd = g.counts[b];
          for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
            const j = g.items[k];
            if (!a.alive[j]) continue;
            const dx = a.x[j] - x, dy = a.y[j] - y;
            const dd = Math.sqrt(dx * dx + dy * dy);
            if (dd > reach) continue;
            const dietW = DIET[Sp.Wolf][a.sp[j]];
            if (dietW <= 0) continue;
            // a beaver in the water is out of reach (S14): wolves take them on land only
            if (a.sp[j] === Sp.Beaver && this.beavers !== null && this.beavers.safe(j)) continue;
            const Pj = this.p.species[a.sp[j]];
            if (Pj.hideAge > 0 && a.age[j] < Pj.hideAge && a.state[j] === St.Rest && dd > 5) continue;
            const camo = Pj.camo;
            const contrast = Math.abs((1 - a.genes[j * NG + G_COAT]) * 0.75 + 0.1 - this.groundB);
            let seen = sight * (1 - camo * (1 - (0.6 + 0.8 * contrast)));
            // a coat the pack has been killing is noticed from further off and stands out among the herd (x boost on its score too)
            let imgW = 1;
            if (imgOn) {
              const img = this.packCoat[pk * SPECIES_COUNT + a.sp[j]];
              if (img >= 0 && Math.abs(a.genes[j * NG + G_COAT] - img) < p.coatSearchWindow) { seen *= p.coatSearchBoost; imgW = p.coatSearchBoost; }
            }
            if (dd > seen) continue;
            const young = a.age[j] < Pj.matureAge ? 2.6 : 1;
            const old = a.age[j] > Pj.maxAge * 0.7 ? 1.8 : 1;
            // a sated wolf only bothers with easy, close prey
            if (opportunist && (dd > 25 || (young === 1 && old === 1 && a.energy[j] > 0.35 && a.infected[j] === 0))) continue;
            const weak = 1.7 - a.energy[j] + (a.infected[j] > 0 ? 0.6 : 0);
            // the selfish herd: an animal on its own is the easy target, so staying with the herd pays
            const lone = 1 + 2.5 * Math.exp(-(p.loneIndividual > 0 ? a.nbr[j] : crowd) / 3);
            // can I actually catch it? fast prey only pays when it's young, sick or tired
            const preySpeed = Pj.runSpeed * a.genes[j * NG + G_SPEED] * (young > 1 ? 0.75 : 1) * (a.stamina[j] > 0.1 ? 1 : 0.5) * (a.infected[j] > 0 ? 0.8 : 1);
            const catchable = Math.min(1, (P.runSpeed * spdGene) / preySpeed);
            const pref = pk >= 0 ? this.packPref[pk * SPECIES_COUNT + a.sp[j]] : 0.7;
            // prey switching (type III): hunting effort follows the common prey, so a crashed species gets a refuge
            const np = this.pop[a.sp[j]];
            const rare = p.wolfRareHalf > 0 ? np / (np + p.wolfRareHalf) : 1;
            const score = (imgW * pref * dietW * young * old * weak * lone * catchable * catchable * rare) / (Pj.toughness * a.genes[j * NG + G_SIZE]) / (dd + 15);
            if (score > bestS) { bestS = score; best = j; }
          }
        }
      }
      if (best >= 0) {
        tgt = best;
        this.cChases++;
        this.logStory(i, 'chase', a.sp[best]);
        a.target[i] = best;
        a.targetId[i] = a.id[best];
        if (pk >= 0 && this.packTarget[pk] < 0) { this.packTarget[pk] = best; this.packTargetId[pk] = a.id[best]; }
      }
    }

    if (tgt >= 0 && !resting) {
      const tx = a.x[tgt], ty = a.y[tgt];
      const dx = tx - x, dy = ty - y, dd = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const fromDen = Math.hypot(tx - denX, ty - denY);
      if ((pk >= 0 && fromDen > p.wolfTerritory * (a.energy[i] < 0.5 ? 3 : 2)) || dd > 90) {
        dbg(dd > 90 ? 'end_far' : 'end_territory');
        // too far from home or lost the trail
        a.target[i] = -1;
        if (pk >= 0 && this.packTarget[pk] === tgt) this.packTarget[pk] = -1;
      } else if (a.stamina[i] < 0.03 && dd > 3) {
        // spent: give up and rest
        dbg('end_stamina');
        this.cGiveUps++;
        a.target[i] = -1;
        a.timer[i] = -90;
        if (pk >= 0 && this.packTarget[pk] === tgt) this.packTarget[pk] = -1;
      } else {
        const lead = Math.min(1.2, dd / (run + 0.1));
        const px = tx + a.vx[tgt] * lead - x, py = ty + a.vy[tgt] * lead - y;
        const pl = Math.sqrt(px * px + py * py) + 0.01;
        const stalking = dd > 28 && a.flee[tgt] === 0;
        const v = stalking ? trot * 1.2 : run;
        dvx = (px / pl) * v;
        dvy = (py / pl) * v;
        state = stalking ? St.Stalk : St.Chase;
        a.target[i] = tgt;
        a.targetId[i] = a.id[tgt];
      }
    }

    if (state === St.Idle) {
      // not hunting: keep with the pack, patrol the territory, rest when fed
      if (pk >= 0) {
        const pcx = this.packCx[pk], pcy = this.packCy[pk];
        const toC = Math.hypot(pcx - x, pcy - y);
        if (toDen > p.wolfTerritory * (a.energy[i] < 0.55 ? 2.8 : 1)) {
          dvx = (denX - x) / toDen * trot; dvy = (denY - y) / toDen * trot; state = St.Walk;
        } else if (a.energy[i] < hungerLine) {
          // search: follow the pack's nose toward the prey; when it finds nothing, hunt small game instead
          const hx = this.packHuntX[pk], hy = this.packHuntY[pk];
          const l = Math.hypot(hx - x, hy - y) + 0.01;
          if (this.packScentHit[pk] === 0 && this.veg.grass[c] > 0.15) { state = St.Stalk; a.timer[i] = -7; dvx = dvy = 0; }
          else if (l > 6) { dvx = (hx - x) / l * trot; dvy = (hy - y) / l * trot; }
          else { const ang = a.heading[i] + (rng.next() - 0.5) * 1.2; dvx = Math.cos(ang) * trot * 0.6; dvy = Math.sin(ang) * trot * 0.6; }
          if (state !== St.Stalk) {
            if (toC > 25) { dvx += (pcx - x) / toC * 1.2; dvy += (pcy - y) / toC * 1.2; }
            state = St.Walk;
          }
        } else if (toC > 10) {
          dvx = (pcx - x) / toC * P.walkSpeed; dvy = (pcy - y) / toC * P.walkSpeed; state = St.Walk;
        } else {
          state = St.Rest;
        }
      } else {
        // loner: roam, look for a mate and an empty territory, or a pack missing an alpha
        a.timer[i] += 3;
        const ang = a.heading[i] + (rng.next() - 0.5) * 0.8;
        dvx = Math.cos(ang) * trot; dvy = Math.sin(ang) * trot;
        state = St.Walk;
        this.lonerSocial(i);
        if (this.p.openPrairie > 0 && this.lonerWander(i, P)) state = St.Migrate;
      }
    }
    a.dvx[i] = dvx;
    a.dvy[i] = dvy;
    a.state[i] = state;
  }

  private lonerSocial(i: number): void {
    const a = this.a;
    if (a.age[i] < this.p.species[Sp.Wolf].matureAge) return;
    const x = a.x[i], y = a.y[i];
    // join a pack that lacks an alpha of my sex
    for (let pk = 0; pk < MAX_PACKS; pk++) {
      if (!this.packAlive[pk]) continue;
      if (Math.hypot(this.packDenX[pk] - x, this.packDenY[pk] - y) > this.p.wolfTerritory) continue;
      const lacks = a.male[i] ? this.packAlphaM[pk] < 0 : this.packAlphaF[pk] < 0;
      if (lacks && this.packSize[pk] < this.packMaxNow()) {
        a.pack[i] = pk;
        if (a.male[i]) this.packAlphaM[pk] = i; else this.packAlphaF[pk] = i;
        return;
      }
    }
    // find another loner of the opposite sex and found a pack
    const g = this.pred, nb = g.nb, bs = g.bs;
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    for (let yy = by - 2; yy <= by + 2; yy++) {
      if (yy < 0 || yy >= nb) continue;
      for (let xx = bx - 2; xx <= bx + 2; xx++) {
        if (xx < 0 || xx >= nb) continue;
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          if (j === i || !a.alive[j] || a.sp[j] !== Sp.Wolf || a.pack[j] >= 0 || a.male[j] === a.male[i] || a.state[j] === St.Migrate) continue;
          if (a.age[j] < this.p.species[Sp.Wolf].matureAge) continue;
          const site = this.findDenSite(x, y);
          if (!site) return;
          const pk = this.newPack(site[0], site[1]);
          if (pk < 0) return;
          a.pack[i] = pk; a.pack[j] = pk;
          if (a.male[i]) { this.packAlphaM[pk] = i; this.packAlphaF[pk] = j; } else { this.packAlphaF[pk] = i; this.packAlphaM[pk] = j; }
          return;
        }
      }
    }
  }

  private liveWolf(i: number, P: SpeciesParams): void {
    const a = this.a, p = this.p;
    const pk = a.pack[i];
    const st = a.state[i];
    if (st === St.Eat) {
      const k = a.timer[i];
      if (k >= 0 && k < this.cN && this.cMeat[k] > 0.02 && Math.abs(this.cX[k] - a.x[i]) < 3 && Math.abs(this.cY[k] - a.y[i]) < 3) {
        const take = Math.min(p.wolfEatRate, this.cMeat[k]);
        this.cMeat[k] -= take;
        a.energy[i] = Math.min(1, a.energy[i] + take);
        if (this.dis.cdvOn) this.dis.onFeed(i);
        if (pk >= 0) {
          const carry = Math.min(this.cMeat[k], take * p.wolfPackStoreShare);
          this.cMeat[k] -= carry;
          this.packStore[pk] = Math.min(4, this.packStore[pk] + carry);
        }
      }
      a.dvx[i] = 0; a.dvy[i] = 0;
    } else if (st === St.Stalk && a.target[i] < 0) {
      // mousing: voles and ground squirrels keep a wolf going but don't feed pups
      if (this.small !== null && p.smallGameField > 0) {
        // the catch comes from the local hares and prairie dogs (Holling type II), and takes one from the field
        const g = this.small.take(a.x[i], a.y[i], 'wolf', 1, this.small.rng);
        if (g > 0) a.energy[i] = Math.min(0.7, a.energy[i] + g);
      } else a.energy[i] = Math.min(0.7, a.energy[i] + P.metabolism * p.wolfSmallGame);
    } else if (st === St.Chase || st === St.Stalk) {
      const t = a.target[i];
      if (a.same(t, a.targetId[i])) {
        const dx = a.x[t] - a.x[i], dy = a.y[t] - a.y[i];
        if (dx * dx + dy * dy < 5) {
          // attack roll: packmates close by help, big healthy prey resists
          let helpers = 0;
          if (pk >= 0) {
            const g = this.pred;
            const b = g.bucketOf(a.x[i], a.y[i]);
            for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
              const j = g.items[k];
              if (j !== i && a.alive[j] && a.pack[j] === pk && a.state[j] === St.Chase) helpers++;
            }
          }
          const Pt = p.species[a.sp[t]];
          const isYoung = a.age[t] < Pt.matureAge;
          const young = isYoung ? 0.35 : 1;
          const et = a.energy[t];
          const condition = 0.4 + 1.2 * et * et;
          // herd defense: adults packed together stand their ground; a calf beside a healthy mother is shielded
          const guards = this.guardsNear(t, isYoung);
          // a herd that circles up around its calves protects them as well as its adults
          const defense = 1 + Pt.defense * Math.min(5, guards);
          const resist = Pt.toughness * a.genes[t * NG + G_SIZE] * young * condition * defense * (a.infected[t] > 0 ? 0.7 : 1);
          let pk2 = p.wolfKillChance * a.genes[i * NG + G_SIZE] * (1 + 0.45 * Math.min(4, helpers)) / resist;
          // prey floundering in snow is easier to pull down (winter, S11)
          if (this.winter !== null) pk2 *= 1 + p.snowKill * this.winter.at(a.x[t], a.y[t]);
          dbg('attack_roll');
          if (!isYoung && et > 0.5 && this.rng.next() < p.wolfTestGiveUp * Math.min(1, guards / 2 + 0.3)) {
            // tested a strong adult and thought better of it
            dbg('tested_gave_up');
            a.target[i] = -1;
            a.timer[i] = -30;
            if (pk >= 0 && this.packTarget[pk] === t) this.packTarget[pk] = -1;
          } else if (this.rng.next() < pk2) {
            a.kills[i]++;
            this.logStory(i, 'kill', a.sp[t]);
            this.cKills++;
            this.totalKills++;
            if (!this.firstKillLogged) { this.firstKillLogged = true; this.event('firstKill', Sp.Wolf, a.x[t], a.y[t], a.sp[t], 0); }
            this.veg.stamp(this.veg.fear, a.x[t], a.y[t], p.fearKillRadius, p.fearKill, 1);
            if (a.sp[t] === Sp.Deer) this.cKillsDeer++;
            if (pk >= 0) {
              if (p.coatSearch > 0) {
                // the coat search image drifts toward the coat just killed (the first kill sets it)
                this.learnCoat(pk, a.sp[t], a.genes[t * NG + G_COAT]);
              }
              // a successful kill sharpens the search image for that prey and dulls the others
              const o2 = pk * SPECIES_COUNT;
              for (let s = 0; s < SPECIES_COUNT; s++) {
                const v = this.packPref[o2 + s];
                this.packPref[o2 + s] = s === a.sp[t] ? Math.min(1, v + 0.12) : Math.max(0.25, v * 0.94);
              }
            }
            this.die(t, 'killed');
            a.target[i] = -1;
            if (pk >= 0) this.packTarget[pk] = -1;
          } else if (young === 1 && this.rng.next() < p.wolfInjuryChance * Pt.toughness) {
            // a kick from an adult bison
            a.energy[i] -= 0.12;
          }
        }
      }
    }
    // territorial strife: rival packs that meet fight, and the outnumbered side can lose a wolf
    if (pk >= 0 && (i + this.tick) % 8 === 0 && p.wolfStrife > 0) {
      const g = this.pred;
      const b = g.bucketOf(a.x[i], a.y[i]);
      for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
        const j = g.items[k];
        if (!a.alive[j] || a.sp[j] !== Sp.Wolf || a.pack[j] < 0 || a.pack[j] === pk) continue;
        const dx = a.x[j] - a.x[i], dy = a.y[j] - a.y[i];
        if (dx * dx + dy * dy > 100) continue;
        const mine = this.packSize[pk], theirs = this.packSize[a.pack[j]];
        // hungry wolves trespass and fight harder
        // trespassers (outside their own territory) take the brunt of it
        const home = Math.hypot(a.x[i] - this.packDenX[pk], a.y[i] - this.packDenY[pk]) < p.wolfTerritory;
        const pDie = p.wolfStrife * 8 * (theirs / (mine + theirs)) * (1.5 - a.energy[i]) * (home ? 0.25 : 1);
        if (this.rng.next() < pDie) { this.cStrife++; this.die(i, 'killed'); return; }
        break;
      }
    }
    // a coyote within 3 m at a carcass, or inside this wolf's core, may be killed (S5; coyoteKilledByWolf per 20 ticks as a per-tick hazard)
    if (this.pop[Sp.Coyote] > 0) {
      this.coyotes.wolfKillCheck(i, pk >= 0 ? this.packDenX[pk] : NaN, pk >= 0 ? this.packDenY[pk] : NaN);
    }
    // pups draw on the pack store
    if (pk >= 0 && a.age[i] < p.wolfPupDenAge && this.packStore[pk] > 0 && a.energy[i] < 0.95) {
      const take = Math.min(0.0035, this.packStore[pk]);
      this.packStore[pk] -= take;
      a.energy[i] += take;
    }
    this.vitals(i, P);
  }

  // ------------------------------------------------------------------ cougars

  private thinkCougar(i: number, P: SpeciesParams): void {
    const a = this.a, p = this.p, rng = this.rng;
    const x = a.x[i], y = a.y[i];
    const c = this.veg.cellAt(x, y);
    const o = i * NG;
    const juvenile = a.age[i] < P.matureAge;
    const spd = a.genes[o + G_SPEED] / Math.pow(a.genes[o + G_SIZE], 0.25);
    const run = P.runSpeed * spd * (a.stamina[i] > 0.05 ? 1 : 0.3);
    const walk = P.walkSpeed;
    let dvx = 0, dvy = 0;
    let state: number = St.Rest;
    const done = () => { a.dvx[i] = dvx; a.dvy[i] = dvy; a.state[i] = state; };
    if (a.fleeX[i] === 0 && a.fleeY[i] === 0) { a.fleeX[i] = x; a.fleeY[i] = y; }

    // kittens shadow their mother
    const m = a.mother[i];
    if (juvenile && a.same(m, a.motherId[i])) {
      const dx = a.x[m] - x, dy = a.y[m] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      if (d > 4) { const v = Math.min(walk * 2.2, 0.5 + d * 0.4); dvx = (dx / d) * v; dvy = (dy / d) * v; state = St.Walk; }
      return done();
    }
    // a young cougar that has just grown up needs a range of its own: no adult of its sex nearby, or it leaves the valley
    if (!juvenile && a.age[i] < P.matureAge + 4 && a.parentA[i] !== 0) {
      let home: [number, number] | null = null;
      for (let k = 0; k < 30 && !home; k++) {
        const [sx, sy] = this.coverSpot();
        let free = true;
        for (let q = 0; q < this.predN && free; q++) {
          const j = this.predList[q];
          if (j === i || !a.alive[j] || a.sp[j] !== Sp.Cougar || a.male[j] !== a.male[i] || a.age[j] < P.matureAge) continue;
          if (Math.hypot(a.fleeX[j] - sx, a.fleeY[j] - sy) < p.cougarRange) free = false;
        }
        if (free) home = [sx, sy];
      }
      if (!home) { this.die(i, 'removed'); return; }
      a.fleeX[i] = home[0];
      a.fleeY[i] = home[1];
    }
    const hx = a.fleeX[i], hy = a.fleeY[i];

    const chasing = a.state[i] === St.Chase && a.same(a.target[i], a.targetId[i]);
    // water
    if (!chasing && ((a.hydration[i] < 0.3 && a.energy[i] > 0.12) || (a.state[i] === St.Drink && a.hydration[i] < 0.97))) {
      if (this.drinkD[c] < 3) { state = St.Drink; a.hydration[i] = Math.min(1, a.hydration[i] + 0.06); }
      else { dvx = this.waterGX[c] * walk * 1.4; dvy = this.waterGY[c] * walk * 1.4; state = St.Walk; }
      return done();
    }
    // return to a cached kill
    if (a.energy[i] < 0.9 && !chasing) {
      const k = this.nearestCarcass(x, y, 35, 1100, true);
      if (k >= 0) {
        const dx = this.cX[k] - x, dy = this.cY[k] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        if (d < 2.2) { state = St.Eat; a.timer[i] = k; }
        else { const v = Math.min(walk * 1.6, 0.6 + d * 0.5); dvx = (dx / d) * v; dvy = (dy / d) * v; state = St.Walk; }
        return done();
      }
    }
    // the spring: short and explosive, abandoned quickly
    if (chasing) {
      const tg = a.target[i];
      const dx = a.x[tg] - x, dy = a.y[tg] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      if (a.stamina[i] < 0.05 || d > 45) {
        a.target[i] = -1;
        a.timer[i] = -120;
        state = St.Rest;
      } else {
        const lead = Math.min(0.5, d / (run + 0.1));
        const px = a.x[tg] + a.vx[tg] * lead - x, py = a.y[tg] + a.vy[tg] * lead - y;
        const pl = Math.sqrt(px * px + py * py) + 0.01;
        dvx = (px / pl) * run;
        dvy = (py / pl) * run;
        state = St.Chase;
      }
      return done();
    }
    const resting = a.timer[i] < 0;
    if (resting) a.timer[i] += 3;
    if (a.energy[i] < 0.75 && !resting) {
      if (a.state[i] === St.Stalk && a.flee[i] > 0) {
        // lying in wait: spring at the most vulnerable animal that wanders close
        const prey = this.preyWithin(i, p.cougarAmbushRadius);
        if (prey >= 0) {
          a.target[i] = prey;
          a.targetId[i] = a.id[prey];
          this.logStory(i, 'chase', a.sp[prey]);
          const dx = a.x[prey] - x, dy = a.y[prey] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
          dvx = (dx / d) * run;
          dvy = (dy / d) * run;
          state = St.Chase;
          return done();
        }
        state = St.Stalk;
        return done();
      }
      // pick a new ambush point: cover near water or prey, within the home range
      if (a.state[i] !== St.Walk || (a.tx[i] === 0 && a.ty[i] === 0) || a.flee[i] === 0) {
        let bs = -1e9;
        for (let k = 0; k < 10; k++) {
          const ang = rng.next() * Math.PI * 2, r = rng.next() * 90;
          const px = Math.min(this.world.size - 4, Math.max(4, hx + Math.cos(ang) * r));
          const py = Math.min(this.world.size - 4, Math.max(4, hy + Math.sin(ang) * r));
          const pc = this.veg.cellAt(px, py);
          if (this.world.water[pc]) continue;
          const wd = this.world.waterDist[pc];
          const s = this.world.cover[pc] * 0.5 + (wd > 3 && wd < 15 ? 0.6 : wd < 30 ? 0.2 : 0)
            + 0.025 * this.prey.counts[this.prey.bucketOf(px, py)] - Math.hypot(px - x, py - y) / 400;
          if (s > bs) { bs = s; a.tx[i] = px; a.ty[i] = py; }
        }
      }
      const dx = a.tx[i] - x, dy = a.ty[i] - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 3) {
        const v = walk * 1.2;
        dvx = (dx / d) * v;
        dvy = (dy / d) * v;
        state = St.Walk;
        a.flee[i] = 1; // keeps the destination until arrival
      } else {
        state = St.Stalk;
        a.flee[i] = 260 + rng.int(220); // patience before moving on
      }
      return done();
    }
    // fed: lie up in cover near home
    const dh = Math.hypot(hx - x, hy - y);
    if (dh > 50) { dvx = ((hx - x) / dh) * walk; dvy = ((hy - y) / dh) * walk; state = St.Walk; }
    else state = St.Rest;
    return done();
  }

  /** The most vulnerable herbivore within r meters (for an ambush). */
  private preyWithin(i: number, r: number): number {
    const a = this.a;
    const g = this.prey, nb = g.nb, bs = g.bs;
    const x = a.x[i], y = a.y[i];
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    let best = -1, bestS = 0;
    for (let yy = by - 1; yy <= by + 1; yy++) {
      if (yy < 0 || yy >= nb) continue;
      for (let xx = bx - 1; xx <= bx + 1; xx++) {
        if (xx < 0 || xx >= nb) continue;
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          if (!a.alive[j]) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > r) continue;
          const dietW = DIET[Sp.Cougar][a.sp[j]];
          if (dietW <= 0) continue;
          const Pj = this.p.species[a.sp[j]];
          const young = a.age[j] < Pj.matureAge ? 2.5 : 1;
          const sc = (dietW * young * (1.6 - a.energy[j])) / (Pj.toughness * a.genes[j * NG + G_SIZE]) / (d + 4);
          if (sc > bestS) { bestS = sc; best = j; }
        }
      }
    }
    return best;
  }

  private liveCougar(i: number, P: SpeciesParams): void {
    const a = this.a, p = this.p;
    const st = a.state[i];
    if (st === St.Eat) {
      const k = a.timer[i];
      if (k >= 0 && k < this.cN && this.cMeat[k] > 0.02 && Math.abs(this.cX[k] - a.x[i]) < 3 && Math.abs(this.cY[k] - a.y[i]) < 3) {
        const take = Math.min(0.011, this.cMeat[k]);
        this.cMeat[k] -= take;
        a.energy[i] = Math.min(1, a.energy[i] + take);
      }
      a.dvx[i] = 0;
      a.dvy[i] = 0;
    } else if (st === St.Chase) {
      const t = a.target[i];
      if (a.same(t, a.targetId[i])) {
        const dx = a.x[t] - a.x[i], dy = a.y[t] - a.y[i];
        if (dx * dx + dy * dy < 4.5) {
          const Pt = p.species[a.sp[t]];
          const isYoung = a.age[t] < Pt.matureAge;
          const et = a.energy[t];
          const guards = this.guardsNear(t, isYoung);
          const resist = Pt.toughness * a.genes[t * NG + G_SIZE] * (isYoung ? 0.35 : 1) * (0.4 + 1.2 * et * et) * (1 + Pt.defense * Math.min(5, guards));
          if (this.rng.next() < (p.cougarKillChance * a.genes[i * NG + G_SIZE]) / resist) {
            a.kills[i]++;
            this.cKills++;
            this.cKillsCougar++;
            this.cCougarKills[a.sp[t]]++;
            this.totalKills++;
            this.logStory(i, 'kill', a.sp[t]);
            this.veg.stamp(this.veg.fear, a.x[t], a.y[t], p.fearKillRadius, p.fearKill, 1);
            this.die(t, 'killed');
            a.target[i] = -1;
          }
        }
      }
    }
    // kittens eat at their mother's kill
    const m = a.mother[i];
    if (a.age[i] < P.matureAge && a.same(m, a.motherId[i]) && a.state[m] === St.Eat && a.energy[i] < 0.95) {
      const k = a.timer[m];
      if (k >= 0 && k < this.cN && this.cMeat[k] > 0.02 && Math.abs(this.cX[k] - a.x[i]) < 10 && Math.abs(this.cY[k] - a.y[i]) < 10) {
        this.cMeat[k] -= 0.006;
        a.energy[i] = Math.min(1, a.energy[i] + 0.006);
      }
    }
    if (!this.vitals(i, P)) return;
    // breeding: a well-fed female finds a male somewhere in the valley
    if (!a.male[i] && a.age[i] >= P.matureAge && a.pregnant[i] === 0 && a.cooldown[i] === 0 && a.energy[i] > 0.6 && (this.tick + i) % 30 === 0) {
      let mate = -1;
      for (let k = 0; k < this.predN; k++) {
        const j = this.predList[k];
        if (a.alive[j] && a.sp[j] === Sp.Cougar && a.male[j] && a.age[j] >= P.matureAge && Math.hypot(a.x[j] - a.x[i], a.y[j] - a.y[i]) < 260) { mate = j; break; }
      }
      if (mate >= 0) {
        a.pregnant[i] = P.gestation;
        a.mateId[i] = a.id[mate];
        this.lineage.onMate(mate);
        for (let g = 0; g < NG; g++) a.mateGenes[i * NG + g] = a.genes[mate * NG + g];
      }
    }
    if (a.pregnant[i] > 0 && --a.pregnant[i] === 0) {
      const litter = Math.max(1, Math.min(4, Math.round(P.litter * a.genes[i * NG + G_LITTER] + (this.rng.next() - 0.5))));
      for (let k = 0; k < litter; k++) {
        const c = this.birth(i, -1, Sp.Cougar, a.x[i] + this.rng.range(-1, 1), a.y[i] + this.rng.range(-1, 1));
        a.energy[c] = 0.6;
      }
      this.logStory(i, 'birth', litter);
      a.energy[i] -= 0.15;
      a.cooldown[i] = P.birthCooldown;
    }
  }

  // ------------------------------------------------------------------ ravens

  private thinkRaven(i: number, P: SpeciesParams): void {
    const a = this.a, rng = this.rng;
    const x = a.x[i], y = a.y[i];
    let dvx = 0, dvy = 0;
    let state: number = St.Fly;
    const k = this.nearestCarcass(x, y, P.sight);
    const fly = P.walkSpeed;
    // a hungry raven over a thick grasshopper patch drops in and feeds on it, unless a carcass is right there (S12)
    const hopGraze = this.hoppers !== null && a.energy[i] < 0.9 && this.hoppers.densAt(x, y) > 0.25
      && !(k >= 0 && Math.abs(this.cX[k] - x) + Math.abs(this.cY[k] - y) < 25);
    if (hopGraze) {
      state = St.Graze;
    } else if (k >= 0) {
      const dx = this.cX[k] - x, dy = this.cY[k] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      if (a.energy[i] < 0.9) {
        a.timer[i] = k;
        if (d < 2.5 && a.alt[i] < 1) {
          // an eagle feeding within 3 m: the raven gives way (S7), backing off the carcass and coming round again
          if (this.pop[Sp.Eagle] > 0 && this.raptors.eagleFeedingNear(x, y, 3)) {
            this.raptors.noteYield();
            dvx = -(dx / d) * fly; dvy = -(dy / d) * fly; state = St.Fly;
            a.timer[i] = -1;
          } else state = St.Eat;
        }
        else { dvx = (dx / d) * fly; dvy = (dy / d) * fly; state = St.Fly; }
      } else {
        // sated: circle above the kill (the classic tell)
        const ang = Math.atan2(y - this.cY[k], x - this.cX[k]) + 0.9;
        const r = 14 + (a.id[i] % 7) * 2;
        const tx = this.cX[k] + Math.cos(ang) * r, ty = this.cY[k] + Math.sin(ang) * r;
        const ddx = tx - x, ddy = ty - y, l = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01;
        dvx = (ddx / l) * fly * 0.8; dvy = (ddy / l) * fly * 0.8;
      }
    } else if (a.energy[i] < 0.6) {
      // forage for insects and seeds in the grass
      const c = this.veg.cellAt(x, y);
      if (this.veg.grass[c] > 0.25) { state = St.Graze; }
      else { const ang = a.heading[i] + (rng.next() - 0.5); dvx = Math.cos(ang) * fly; dvy = Math.sin(ang) * fly; }
    } else {
      // soar in wide loops
      const ang = a.heading[i] + 0.25 + (rng.next() - 0.5) * 0.3;
      dvx = Math.cos(ang) * fly; dvy = Math.sin(ang) * fly;
    }
    // reproduce in pairs
    if (a.energy[i] > 0.8 && a.age[i] > P.matureAge && a.cooldown[i] === 0 && !a.male[i] && this.env.state.season < 1.2
      && a.origin[i] !== 2 && rng.next() < 1 - (this.pop[Sp.Raven] - this.vagrants) / this.ravenSites()) {
      a.cooldown[i] = P.birthCooldown;
      a.energy[i] -= 0.3;
      const n = Math.max(1, Math.round(P.litter * a.genes[i * NG + G_LITTER] + (rng.next() - 0.5)));
      for (let q = 0; q < n; q++) {
        const c = this.birth(i, i, Sp.Raven, x, y);
        a.alt[c] = a.alt[i];
        a.state[c] = St.Fly;
      }
    }
    if (k < 0) a.timer[i] = -1;
    a.dvx[i] = dvx; a.dvy[i] = dvy; a.state[i] = state;
  }

  private liveRaven(i: number, P: SpeciesParams): void {
    const a = this.a;
    const st = a.state[i];
    if (st === St.Eat) {
      const k = a.timer[i];
      if (k >= 0 && k < this.cN && this.cMeat[k] > 0.01) {
        const take = Math.min(0.0015, this.cMeat[k]);
        this.cMeat[k] -= take;
        a.energy[i] = Math.min(1, a.energy[i] + take * 4);
      }
      a.vx[i] *= 0.5; a.vy[i] *= 0.5;
      a.alt[i] = Math.max(0, a.alt[i] - 0.5);
    } else if (st === St.Graze) {
      a.energy[i] = Math.min(1, a.energy[i] + P.metabolism * 1.15);
      if (this.hoppers !== null) a.energy[i] = Math.min(1, a.energy[i] + this.hoppers.feed(a.x[i], a.y[i], 'raven', P.metabolism));
      a.vx[i] *= 0.5; a.vy[i] *= 0.5;
      a.alt[i] = Math.max(0, a.alt[i] - 0.4);
    } else {
      // descend only onto the carcass chosen while thinking (no per-tick scan of every carcass)
      const k = a.energy[i] < 0.9 ? a.timer[i] : -1;
      const near = k >= 0 && k < this.cN && Math.abs(this.cX[k] - a.x[i]) < 4 && Math.abs(this.cY[k] - a.y[i]) < 4;
      const targetAlt = near ? 0 : 22 + (a.id[i] % 9) * 2.5;
      flightStep(a, i, DT, this.world.size, targetAlt, 0.03, 0.08);
    }
    this.vitals(i, P);
  }

  // ------------------------------------------------------------------ events

  private event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void {
    this.events.push({ tick: this.tick, kind, sp, x, y, a, b });
    this.eventSerial++;
    if (this.events.length > 4000) this.events.splice(0, 1000);
  }

  /** Storm cells drift over the valley; dry lightning in cured grass starts fires (own generator, see storms.ts). */
  private stepStorms(t: number): void {
    const st = this.storms!;
    const veg = this.veg, water = this.world.water, size = this.world.size;
    st.update(t, this.env.state, (x, y) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return 0;
      const c = veg.cellAt(x, y);
      return water[c] ? 0 : veg.grass[c];
    });
    for (let k = 0; k < st.starts.length; k += 3) this.event('storm', -1, st.starts[k], st.starts[k + 1], st.starts[k + 2], 0);
    for (let k = 0; k < st.fires.length; k += 2) {
      veg.ignite(st.fires[k], st.fires[k + 1], 4);
      this.cLightning++;
      this.event('lightningFire', -1, st.fires[k], st.fires[k + 1], 0, 0);
    }
  }

  private checkEvents(): void {
    const t = this.tick;
    const drought = this.env.droughtTicks > 0;
    if (drought && !this.wasDrought) this.event('drought', -1, 0, 0, this.env.droughtTicks, this.env.droughtSeverity);
    if (!drought && this.wasDrought) this.event('droughtEnd', -1, 0, 0, 0, 0);
    this.wasDrought = drought;
    if ((t & 15) === 0) {
      const a = this.a;
      let fleeing = 0, sx = 0, sy = 0;
      for (let k = 0; k < this.preyN; k++) {
        const i = this.preyList[k];
        if (a.alive[i] && a.flee[i] > 0 && a.sp[i] === Sp.Bison) { fleeing++; sx += a.x[i]; sy += a.y[i]; }
      }
      if (fleeing >= 45 && t - this.lastStampede > BASE_YEAR_TICKS) {
        this.lastStampede = t;
        this.event('stampede', Sp.Bison, sx / fleeing, sy / fleeing, fleeing, 0);
      }
      for (let s = 0; s < SPECIES_COUNT; s++) {
        if (this.everPresent[s] && this.pop[s] === 0) {
          this.everPresent[s] = 0;
          // the raptors come and go with the seasons: an empty valley is not an extinction
          if (SPECIES[s].guild !== 'raptor') this.event('extinct', s, 0, 0, 0, 0);
        }
      }
    }
  }

  // ------------------------------------------------------------------ interventions

  introduce(sp: number, count: number, x?: number, y?: number): void {
    if (this.isFieldSpecies(sp)) {
      // jackrabbits and prairie dogs live in the fields: the animals go into the cells around the point
      this.event('introduced', sp, x ?? 0, y ?? 0, this.small!.introduce(sp, count, x, y), 0);
      return;
    }
    if (sp === Sp.PrairieDog) {
      // no agent form: with smallPrey off there is nothing to place
      this.event('introduced', sp, x ?? 0, y ?? 0, 0, 0);
      return;
    }
    if (sp === Sp.Beaver) {
      // beavers (S14): set down at the point (or on the creek), they walk to the creek and look for the best free site (the first call builds the beaver system)
      const n = this.startBeavers().introduce(count, x, y);
      this.event('introduced', sp, x ?? 0, y ?? 0, n, 0);
      return;
    }
    if (sp === Sp.Wolf) {
      let left = count;
      while (left > 0) {
        // the god tool always finds the new pack a home: with every site taken it settles for a den half the usual distance from its neighbours
        const den = x !== undefined && y !== undefined ? (this.findDenSite(x, y) ?? [x, y]) : (this.findDenSite() ?? this.findDenSite(undefined, undefined, 0.5));
        if (!den) break;
        const pk = this.newPack(den[0], den[1]);
        const m = Math.min(left, 6);
        for (let q = 0; q < m; q++) {
          const i = this.spawnAdult(Sp.Wolf, den[0] + this.rng.range(-6, 6), den[1] + this.rng.range(-6, 6));
          this.a.pack[i] = pk;
          this.a.male[i] = q % 2;
          this.a.age[i] = Math.round(this.p.species[Sp.Wolf].matureAge * 1.3 + this.rng.next() * 600);
          this.a.energy[i] = 0.85;
        }
        left -= m;
      }
    } else {
      const [cx, cy] = x !== undefined && y !== undefined ? [x, y] : sp === Sp.MuleDeer ? (this.mule.spot() ?? this.goodSpot(0.4)) : this.goodSpot(0.4);
      for (let k = 0; k < count; k++) {
        const i = this.spawnAdult(sp, cx + this.rng.range(-15, 15), cy + this.rng.range(-15, 15));
        if (SPECIES[sp].flies) { this.a.alt[i] = 30; this.a.state[i] = St.Fly; }
      }
    }
    this.everPresent[sp] = 1;
    this.event('introduced', sp, x ?? 0, y ?? 0, count, 0);
  }

  /** Jackrabbits and prairie dogs are density fields (not agents) while smallPrey is on. */
  private isFieldSpecies(sp: number): boolean {
    return this.small !== null && (sp === Sp.Rabbit || sp === Sp.PrairieDog);
  }

  apply(iv: Intervention): void {
    const a = this.a;
    switch (iv.kind) {
      case 'cull': {
        if (this.isFieldSpecies(iv.species)) {
          this.event('culled', iv.species, 0, 0, Math.round(this.small!.cull(iv.species, iv.fraction)), iv.fraction);
          break;
        }
        let n = 0;
        for (let i = 0; i < a.hi; i++) {
          if (a.alive[i] && a.sp[i] === iv.species && this.rng.next() < iv.fraction) { this.die(i, 'culled'); n++; }
        }
        this.event('culled', iv.species, 0, 0, n, iv.fraction);
        break;
      }
      case 'remove': {
        if (this.isFieldSpecies(iv.species)) {
          this.event('removed', iv.species, 0, 0, Math.round(this.small!.remove(iv.species)), 0);
          break;
        }
        let n = 0;
        for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === iv.species) { this.die(i, 'removed'); n++; }
        if (iv.species === Sp.Wolf) for (let pk = 0; pk < MAX_PACKS; pk++) this.packAlive[pk] = 0;
        this.everPresent[iv.species] = 0;
        if (iv.species === Sp.MuleDeer) this.muleSeen = false;
        else if (iv.species === Sp.Cougar) this.cougarSeen = false;
        this.event('removed', iv.species, 0, 0, n, 0);
        break;
      }
      case 'introduce':
        this.introduce(iv.species, iv.count, iv.x, iv.y);
        break;
      case 'drought':
        this.env.droughtTicks = iv.ticks;
        this.env.droughtSeverity = iv.severity;
        break;
      case 'rain':
        this.env.rainTicks = iv.ticks;
        this.env.droughtTicks = 0;
        this.event('rain', -1, 0, 0, iv.ticks, 0);
        break;
      case 'fire':
        this.veg.ignite(iv.x, iv.y, 6);
        this.event('fire', -1, iv.x, iv.y, 0, 0);
        break;
      case 'lightning': this.lightning(iv.x, iv.y); break;
      case 'blizzard': this.blizzard(iv.ticks); break;
      case 'flood': this.startFlood(iv.ticks, iv.severity); break;
      case 'disease': this.applyDisease(iv.disease, iv.species, iv.fraction); break;
      case 'grove': this.plantGrove(iv.x, iv.y, iv.radius); break;
      case 'plague': {
        if (iv.species === Sp.PrairieDog && this.small !== null) {
          // sylvatic plague: seeds the outbreak in a share of the colony cells (the fields have no per-animal infection)
          this.event('plague', iv.species, 0, 0, this.small.seedPlague(this.tick, iv.fraction), 0);
          break;
        }
        let n = 0;
        for (let i = 0; i < a.hi; i++) {
          if (a.alive[i] && a.sp[i] === iv.species && this.rng.next() < iv.fraction) { a.infected[i] = this.p.diseaseTicks; n++; }
        }
        this.event('plague', iv.species, 0, 0, n, 0);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ god tools v2 (S17)
  // All of these run only when the player acts. They draw from the main stream (interventions are the player's own moments, and
  // a run that never calls them is untouched) or, for grove trees, from a generator of their own.

  /** Lightning at a point: grass catches (except over water) and every ground animal within 3 m dies. */
  private lightning(x: number, y: number): void {
    const a = this.a, size = this.world.size;
    x = Math.min(size - 0.01, Math.max(0, x));
    y = Math.min(size - 0.01, Math.max(0, y));
    const lit = this.veg.ignite(x, y, 4);
    let killed = 0;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.alt[i] > 3) continue;
      const dx = a.x[i] - x, dy = a.y[i] - y;
      if (dx * dx + dy * dy <= 9) { this.die(i, 'culled'); killed++; }
    }
    if (this.storms !== null) this.storms.pushStrike(x, y, this.tick, lit > 0 ? 1 : 0);
    else {
      this.godStrikes.push(x, y, this.tick, lit > 0 ? 1 : 0);
      if (this.godStrikes.length > 64 * 4) this.godStrikes.splice(0, this.godStrikes.length - 64 * 4);
    }
    if (lit > 0) {
      this.cLightning++;
      this.event('lightningFire', -1, x, y, killed, 1);
    }
  }

  /** A blizzard of `ticks`: snow weather and a gale, a deep snowfall when snowDepth is on, and a cold drain on every animal. */
  private blizzard(ticks: number): void {
    const t = Math.max(10, Math.round(ticks));
    const env = this.env;
    env.rainTicks = 0;
    env.droughtTicks = 0;
    env.snowTicks = t;
    env.state.windStrength = Math.max(env.state.windStrength, 0.9);
    this.blizzardLeft = t;
    if (this.winter !== null) this.winter.forceBlizzard(t);
    this.event('blizzard', -1, this.world.size / 2, this.world.size / 2, t, 1);
  }

  /**
   * Flood: for `ticks` the land within 12 + 38 x severity m of the creek and ponds is under water. At the start the grass there drowns
   * (down by 85% x severity), browse is hit half as hard, fires in the band go out, and young animals caught in it may drown (40% x
   * severity; adults 5% x severity; counted as culled). While it lasts, ground animals in the band are pushed away from the water
   * (drinkers are left alone). When it recedes the silt feeds the soil (+0.2 x severity).
   */
  private startFlood(ticks: number, severity: number, natural?: Rng): void {
    const w = this.world, v = this.veg, a = this.a, p = this.p;
    const sev = Math.min(1, Math.max(0.1, severity));
    // a natural spring flood (S12) is the same machinery with a narrower band, its own params and its own generator
    const radius = natural !== undefined ? p.floodBand : 12 + 38 * sev;
    const grassHit = natural !== undefined ? p.floodGrass : 0.85;
    const rng = natural ?? this.rng;
    if (this.beavers !== null) this.beavers.onFlood(sev);
    const mask = new Uint8Array(w.n * w.n);
    for (let c = 0; c < mask.length; c++) {
      if (!w.water[c] && w.waterDist[c] <= radius) {
        mask[c] = 1;
        v.grass[c] *= 1 - grassHit * sev;
        v.browse[c] *= 1 - 0.5 * sev;
        v.burn[c] = 0;
      }
    }
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || SPECIES[a.sp[i]].flies || a.state[i] === St.Migrate) continue;
      if (!mask[v.cellAt(a.x[i], a.y[i])]) continue;
      const young = a.age[i] < this.p.species[a.sp[i]].matureAge;
      if (rng.next() < (natural !== undefined ? (young ? p.floodYoung : p.floodAdult) : young ? 0.4 : 0.05) * sev) {
        if (young) this.cFawnsDrowned++;
        this.die(i, 'culled');
      }
    }
    this.flood = { left: Math.max(10, Math.round(ticks)), sev, radius, mask, silt: natural !== undefined ? p.floodSilt : 0.2 };
    if (natural !== undefined) this.cSpringFloods++;
    this.event(natural !== undefined ? 'springFlood' : 'flood', -1, w.size / 2, w.size / 2, this.flood.left, sev);
  }

  private floodStep(): void {
    const f = this.flood!;
    const w = this.world, v = this.veg, a = this.a, n = w.n, wd = w.waterDist;
    if (--f.left <= 0) {
      for (let c = 0; c < f.mask.length; c++) if (f.mask[c]) v.soil[c] = Math.min(1.4, v.soil[c] + f.silt * f.sev);
      if (this.trees !== null) this.trees.floodEnded(f.mask, f.sev, this.tick);
      this.flood = null;
      return;
    }
    if (this.tick % 5 !== 0) return;
    const half = w.size / 2;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || SPECIES[a.sp[i]].flies || a.state[i] === St.Migrate || a.state[i] === St.Drink) continue;
      const c = v.cellAt(a.x[i], a.y[i]);
      if (!f.mask[c]) continue;
      const ci = c % n, cj = (c / n) | 0;
      let gx = wd[cj * n + Math.min(n - 1, ci + 1)] - wd[cj * n + Math.max(0, ci - 1)];
      let gy = wd[Math.min(n - 1, cj + 1) * n + ci] - wd[Math.max(0, cj - 1) * n + ci];
      let g = Math.sqrt(gx * gx + gy * gy);
      if (g < 1e-6) { gx = half - a.x[i]; gy = half - a.y[i]; g = Math.sqrt(gx * gx + gy * gy) + 1e-6; }
      a.x[i] = Math.min(w.size - 1, Math.max(1, a.x[i] + (gx / g) * 2));
      a.y[i] = Math.min(w.size - 1, Math.max(1, a.y[i] + (gy / g) * 2));
    }
    // the water puts out any fire in the band
    for (let c = 0; c < f.mask.length; c++) if (f.mask[c] && v.burn[c] > 1) v.burn[c] = 1;
  }

  /** Targeted outbreaks. Every one reports with a 'plague' event at the start (the natural 'distemper' event still closes a distemper outbreak). */
  private applyDisease(disease: 'fever' | 'distemper' | 'plague', species?: number, fraction?: number): void {
    const a = this.a;
    if (disease === 'plague') {
      const n = this.small !== null ? this.small.seedPlague(this.tick, fraction ?? 0.5) : 0;
      this.event('plague', Sp.PrairieDog, 0, 0, n, 0);
      return;
    }
    const sp = species ?? (disease === 'distemper' ? Sp.Wolf : Sp.Bison);
    if (this.isFieldSpecies(sp)) { this.event('plague', sp, 0, 0, 0, 0); return; }
    const cand: number[] = [];
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === sp && a.infected[i] === 0 && a.immune[i] === 0) cand.push(i);
    const f = fraction ?? (disease === 'distemper' ? 0.1 : 0.15);
    const want = cand.length === 0 ? 0 : Math.max(1, Math.round(Math.min(1, Math.max(0, f)) * cand.length));
    let n = 0;
    if (disease === 'distemper') {
      if (IS_CANID[sp] && want > 0) { this.dis.forceOn(); n = this.dis.startOutbreak(want, sp); }
    } else {
      for (let q = 0; q < want; q++) {
        const k = this.rng.int(cand.length);
        a.infected[cand[k]] = this.p.diseaseTicks;
        this.logStory(cand[k], 'infected');
        cand[k] = cand[cand.length - 1];
        cand.pop();
        n++;
      }
    }
    this.event('plague', sp, 0, 0, n, 0);
  }

  /** A grove: tree cover and browse in a disc (radius 6..40 m) and a stand of cottonwoods appended to world.trees (the sim's world; the renderer's
   *  own copy does not have them, so snapshots carry `groves`). Shade cuts the grass there as the standing trees do. */
  private plantGrove(x: number, y: number, radius: number): void {
    const w = this.world, v = this.veg;
    if (this.groveCount >= MAX_GROVES) return;
    const r = Math.min(40, Math.max(6, radius));
    x = Math.min(w.size - 2, Math.max(2, x));
    y = Math.min(w.size - 2, Math.max(2, y));
    if (this.trees !== null) {
      // dynamic trees (S13): the grove is young cottonwoods in the tree list, and the cover is rebuilt from it
      this.groveRng ??= new Rng(hashSeed(this.seed + ':groves'));
      const made = this.trees.plant(x, y, r, Math.min(40, Math.max(3, Math.round((Math.PI * r * r) / 110))), this.groveRng);
      this.groveCount++;
      this.event('grovePlanted', -1, x, y, r, made);
      return;
    }
    const n = w.n, cell = w.cell;
    const i0 = Math.max(0, Math.floor((x - r) / cell)), i1 = Math.min(n - 1, Math.floor((x + r) / cell));
    const j0 = Math.max(0, Math.floor((y - r) / cell)), j1 = Math.min(n - 1, Math.floor((y + r) / cell));
    const before = new Float32Array((i1 - i0 + 1) * (j1 - j0 + 1));
    let q = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) before[q++] = w.cover[j * n + i];
    v.stamp(w.cover, x, y, r, 0.9, 1);
    q = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * n + i, old = before[q++], now = w.cover[c];
        if (w.water[c] || now <= old) continue;
        w.capacity[c] *= (1 - 0.45 * now) / (1 - 0.45 * old);
        v.browseK[c] = 0.4 * w.capacity[c] / Math.max(0.3, 1 - 0.45 * now) + 0.6 * now;
        if (v.browse[c] < 0.6 * v.browseK[c]) v.browse[c] = 0.6 * v.browseK[c];
      }
    }
    this.groveRng ??= new Rng(hashSeed(this.seed + ':groves'));
    const g = this.groveRng;
    if (this.groveBase < 0) this.groveBase = w.trees.length;
    const count = Math.min(40, Math.max(3, Math.round((Math.PI * r * r) / 110)));
    const add = new Float32Array(count * 4);
    for (let k = 0; k < count; k++) {
      const ang = g.next() * Math.PI * 2, rad = r * 0.85 * Math.sqrt(g.next());
      const th = g.range(9, 15);
      add.set([x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, th, th * g.range(0.38, 0.5)], k * 4);
    }
    const all = new Float32Array(w.trees.length + add.length);
    all.set(w.trees);
    all.set(add, w.trees.length);
    w.trees = all;
    this.groveCount++;
    this.event('grovePlanted', -1, x, y, r, count);
  }

  // ------------------------------------------------------------------ open prairie (S1)
  // Animals leave and enter the valley through the eight border corridors (world.corridors). Everything random in
  // here draws from the regional pool's own generator (region.rng), never from this.rng, so with the rates at zero a
  // run is identical to a closed valley. Only findDenSite() (wolf arrivals) touches the main stream, and only on a
  // successful arrival roll.
  //
  // A migrating animal is in St.Migrate and is driven by migrantTick instead of its species' think. a.target says
  // which way: -2 outbound (a.tx/ty is the border point it heads for), -3 inbound (a.tx/ty is the point it walks to,
  // or for a vagrant raven the carcass it flies to). a.mig is the migration clock in ticks.

  /** Distance (m) from a point to the nearest border of the valley. */
  private edgeDist(x: number, y: number): number {
    const s = this.world.size;
    return Math.min(x, y, s - x, s - y);
  }

  /** The border point nearest to (x, y) and its inward unit normal: [x, y, nx, ny]. */
  private nearestEdge(x: number, y: number): [number, number, number, number] {
    const s = this.world.size;
    const dW = x, dE = s - x, dS = y, dN = s - y;
    const m = Math.min(dW, dE, dS, dN);
    if (m === dW) return [0, y, 1, 0];
    if (m === dE) return [s, y, -1, 0];
    if (m === dS) return [x, 0, 0, 1];
    return [x, s, 0, -1];
  }

  /** Index of the corridor nearest to a point. */
  private nearestCorridor(x: number, y: number): number {
    const c = this.world.corridors;
    let best = 0, bd = 1e18;
    for (let k = 0; k < c.length / 4; k++) {
      const dx = c[k * 4] - x, dy = c[k * 4 + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = k; }
    }
    return best;
  }

  /** Total meat left on all carcasses, in cMeat units (the carrion the vagrant ravens follow). */
  sumRemainingMeat(): number {
    let s = 0;
    for (let k = 0; k < this.cN; k++) if (this.cMeat[k] > 0) s += this.cMeat[k];
    return s;
  }

  /** Browse summed over land cells (the numerator of browse per pronghorn). */
  private sumBrowse(): number {
    const b = this.veg.browse, wat = this.world.water;
    let s = 0;
    for (let c = 0; c < b.length; c++) if (!wat[c]) s += b[c];
    return s;
  }

  private vagrantCount(): number {
    const a = this.a;
    let n = 0;
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Raven && a.origin[i] === 2) n++;
    return n;
  }

  private meanGen(sp: number): number {
    const a = this.a;
    let s = 0, n = 0;
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === sp) { s += a.gen[i]; n++; }
    return n ? Math.round(s / n) : 0;
  }

  private openPrairieStep(t: number): void {
    const p = this.p;
    if (p.ravenVagrants > 0 && t % 50 === 0) this.vagrantRavens();
    if (p.openPrairie <= 0) return;
    if (t > 0 && t % 100 === 0) {
      this.wolfArrivals();
      if (p.coyoteInRate > 0 && this.coyotes.seen) this.coyoteArrivals();
      if (p.cougarInRate > 0 && this.cougarSeen && this.pop[Sp.Cougar] < 2) this.cougarArrivals();
    }
    const yt = this.env.yearTick(t);
    if (yt === Math.round(2.6 * SEASON_TICKS)) this.pronghornExodus();
    else if (yt === Math.round(0.25 * SEASON_TICKS)) this.pronghornReturn();
    else if (yt === Math.round(0.3 * SEASON_TICKS)) this.muleReturn();
  }

  /** Spring rescue (S8, season 0.3): a group of mule deer walks in to a habitat spot when too few remain (and some have lived here before). */
  private muleReturn(): void {
    const p = this.p;
    if (p.muledeerRescue <= 0 || !this.muleSeen || this.pop[Sp.MuleDeer] >= p.muledeerRescueBelow) return;
    const spot = this.mule.spot();
    if (!spot) return;
    const c = this.world.corridors, k = this.nearestCorridor(spot[0], spot[1]);
    const bx = c[k * 4], by = c[k * 4 + 1], nx = c[k * 4 + 2], ny = c[k * 4 + 3];
    const n = Math.round(p.muledeerRescue);
    this.spawnArrivals(Sp.MuleDeer, n, bx, by, nx, ny, spot[0], spot[1], 1, 8);
    this.event('immigrated', Sp.MuleDeer, bx, by, n, 0);
  }

  /** Every 100 ticks, with fewer than two cougars left (and some having lived here), a pair may walk in from the prairie to a cover spot (S8, cougarInRate). */
  private cougarArrivals(): void {
    const a = this.a, r = this.region!.rng;
    if (r.next() >= (this.p.cougarInRate * 100) / BASE_YEAR_TICKS) return;
    const [sx, sy] = this.coverSpot();
    const c = this.world.corridors, k = this.nearestCorridor(sx, sy);
    const bx = c[k * 4], by = c[k * 4 + 1], nx = c[k * 4 + 2], ny = c[k * 4 + 3];
    const slots = this.spawnArrivals(Sp.Cougar, 2, bx, by, nx, ny, sx, sy, 1, 5);
    for (const i of slots) { a.energy[i] = 0.8; a.fleeX[i] = sx; a.fleeY[i] = sy; }
    this.event('immigrated', Sp.Cougar, bx, by, 2, 0);
  }

  private beginMigrate(i: number, outbound: boolean, tx: number, ty: number): void {
    const a = this.a;
    a.state[i] = St.Migrate;
    a.target[i] = outbound ? -2 : -3;
    a.targetId[i] = 0;
    a.tx[i] = tx;
    a.ty[i] = ty;
    a.mig[i] = 0;
    a.flee[i] = 0;
  }

  /** Send an animal to the nearest corridor. */
  private beginEmigration(i: number): void {
    const a = this.a, c = this.world.corridors;
    const k = this.nearestCorridor(a.x[i], a.y[i]);
    this.beginMigrate(i, true, c[k * 4], c[k * 4 + 1]);
  }

  private endMigrate(i: number): void {
    const a = this.a;
    a.target[i] = -1;
    a.mig[i] = 0;
    a.state[i] = SPECIES[a.sp[i]].flies ? St.Fly : St.Idle;
  }

  /** The animal reached the border: it is gone. No carcass; the regional pool takes up its genes. */
  private leaveValley(i: number): void {
    const a = this.a, s = a.sp[i];
    if (a.origin[i] === 2) this.cVagOut++;
    else {
      this.cEmig[s]++;
      this.region?.absorb(s, a.genes, i * NG);
    }
    this.die(i, 'emigrated');
  }

  /** One think for a migrating animal: steer for the target at half run speed (flyers at flying speed). */
  private thinkMigrant(i: number, P: SpeciesParams): void {
    const a = this.a;
    const x = a.x[i], y = a.y[i];
    a.mig[i] = Math.min(65535, a.mig[i] + 6);
    const dx = a.tx[i] - x, dy = a.ty[i] - y;
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
    if (a.target[i] === -2) {
      // outbound: gone once within 4 m of the border (or after a year of trying, so nothing is stuck forever)
      if (this.edgeDist(x, y) < 4 || a.mig[i] > BASE_YEAR_TICKS) { this.leaveValley(i); return; }
    } else {
      // inbound: a vagrant raven is done once it is near its carcass, anything else once it is 30 m inside
      const arrived = a.origin[i] === 2 ? d < 40 : this.edgeDist(x, y) >= 30;
      if (arrived || a.mig[i] > 1200) { this.endMigrate(i); return; }
    }
    const v = SPECIES[a.sp[i]].flies ? P.walkSpeed : 0.5 * P.runSpeed;
    a.dvx[i] = (dx / d) * v;
    a.dvy[i] = (dy / d) * v;
    a.state[i] = St.Migrate;
  }

  /** A whole tick of a migrating animal: no species think, just steering, movement and the body's own upkeep. */
  private migrantTick(i: number, t: number, P: SpeciesParams): void {
    const a = this.a, s = a.sp[i];
    if ((i + t) % 6 === 0) {
      this.thinkMigrant(i, P);
      if (!a.alive[i]) return;
    }
    if (s === Sp.Eagle || s === Sp.Hawk) { this.raptors.live(i); return; }
    if (SPECIES[s].flies) { this.liveRaven(i, P); return; }
    this.moveGround(i, P);
    if (s === Sp.Wolf) this.liveWolf(i, P);
    else if (s === Sp.Cougar) this.liveCougar(i, P);
    else if (s === Sp.Coyote) this.coyotes.live(i);
    else this.liveHerbivore(i, P);
  }

  /** A pack-less wolf counts its wandering; past wolfOutAfter base years an adult heads for the border. Returns true when it sets off. */
  private lonerWander(i: number, P: SpeciesParams): boolean {
    const a = this.a;
    if (a.pack[i] >= 0) { a.mig[i] = 0; return false; }
    a.mig[i] = Math.min(65535, a.mig[i] + 3);
    if (a.age[i] < P.matureAge || a.mig[i] <= this.p.wolfOutAfter * BASE_YEAR_TICKS) return false;
    this.event('emigrated', Sp.Wolf, a.x[i], a.y[i], 1, 0);
    this.beginEmigration(i);
    return true;
  }

  /**
   * n adults of one species arrive as a loose group at the border point (bx, by), inward normal (nx, ny), walking (or for
   * a vagrant raven flying) to (tx, ty). Genes come from the regional pool. Returns their slots.
   */
  private spawnArrivals(sp: number, n: number, bx: number, by: number, nx: number, ny: number, tx: number, ty: number, origin: number, spread: number): number[] {
    const a = this.a, r = this.region!.rng, size = this.world.size;
    const P = this.p.species[sp];
    const gen = this.meanGen(sp);
    const slots: number[] = [];
    for (let q = 0; q < n; q++) {
      const off = (r.next() - 0.5) * 2 * spread;
      const dep = 4 + r.next() * spread * 0.5;
      const x = Math.min(size - 3, Math.max(3, bx + nx * dep - ny * off));
      const y = Math.min(size - 3, Math.max(3, by + ny * dep + nx * off));
      const i = a.spawn();
      a.sp[i] = sp;
      a.x[i] = x;
      a.y[i] = y;
      a.heading[i] = Math.atan2(ty - y, tx - x);
      a.male[i] = q % 2;
      // an adult in its prime years, not a founder-style spread over the whole life
      const lo = P.matureAge * 1.2;
      a.age[i] = Math.round(lo + r.next() * (P.maxAge * 0.5 - lo));
      a.born[i] = this.tick - a.age[i];
      a.energy[i] = 0.75 + r.next() * 0.15;
      a.hydration[i] = 0.8 + r.next() * 0.2;
      this.region!.draw(sp, r, a.genes, i * NG);
      for (let g = 0; g < NG; g++) a.genes[i * NG + g] = g === G_COAT ? clampCoat(sp, a.genes[i * NG + g]) : clampGene(g, a.genes[i * NG + g]);
      a.gen[i] = gen;
      a.origin[i] = origin;
      if (SPECIES[sp].flies) a.alt[i] = 30;
      this.beginMigrate(i, false, tx - ny * off, ty + nx * off);
      if (origin === 1) this.dis.maybeSeedMangeOnImmigrant(i); // some immigrants bring mange in (S2; disease rng only)
      slots.push(i);
    }
    if (n > 0) {
      if (origin === 2) this.cVagIn += n;
      else {
        this.cImm[sp] += n;
        if (!this.everPresent[sp]) this.event('recolonized', sp, bx, by, n, 0);
        this.everPresent[sp] = 1;
      }
    }
    return slots;
  }

  /** Every 100 ticks a wolf pair may arrive, if there is room for a den. They found a pack at the free site and walk in from the nearest corridor. */
  private wolfArrivals(): void {
    const a = this.a, r = this.region!.rng;
    if (r.next() >= (this.p.wolfInRate * 100) / BASE_YEAR_TICKS) return;
    const den = this.findDenSite();
    if (!den) return;
    const pk = this.newPack(den[0], den[1]);
    if (pk < 0) return;
    const c = this.world.corridors, k = this.nearestCorridor(den[0], den[1]);
    const bx = c[k * 4], by = c[k * 4 + 1], nx = c[k * 4 + 2], ny = c[k * 4 + 3];
    const slots = this.spawnArrivals(Sp.Wolf, 2, bx, by, nx, ny, bx + nx * 35, by + ny * 35, 1, 5);
    for (const i of slots) { a.pack[i] = pk; a.energy[i] = 0.85; }
    this.event('immigrated', Sp.Wolf, bx, by, 2, 0);
  }

  /**
   * Every 100 ticks a coyote pair may walk in from the prairie to a free den spot (S5; only after coyotes have lived here, and only
   * with coyoteInRate > 0). The chance follows how rich the hares are against their long mean, so the valley fills faster in a good
   * year. They found the pair at the spot at once and walk in from the nearest corridor. Draws from the regional generator.
   */
  private coyoteArrivals(): void {
    const a = this.a, r = this.region!.rng;
    const idx = this.coyotes.preyIndex();
    // a valley with almost no coyotes is refilled faster (the rescue effect of the open prairie)
    const rescue = this.pop[Sp.Coyote] < 4 ? 3 : 1;
    if (r.next() >= ((this.p.coyoteInRate * 100) / BASE_YEAR_TICKS) * idx * idx * rescue) return;
    const spot = this.coyotes.arrivalSpot();
    if (!spot) return;
    const c = this.world.corridors, k = this.nearestCorridor(spot[0], spot[1]);
    const bx = c[k * 4], by = c[k * 4 + 1], nx = c[k * 4 + 2], ny = c[k * 4 + 3];
    const slots = this.spawnArrivals(Sp.Coyote, 2, bx, by, nx, ny, spot[0], spot[1], 1, 5);
    this.coyotes.adoptPair(slots[0], slots[1], spot[0], spot[1]);
    for (const i of slots) a.energy[i] = 0.8;
    this.event('immigrated', Sp.Coyote, bx, by, 2, 0);
  }

  /** Pronghorn per unit of browse: summed browse over land cells divided by the pronghorn alive. */
  private browsePerPronghorn(pop: number): number {
    return pop > 0 ? this.sumBrowse() / pop : 0;
  }

  /**
   * Autumn exodus (season 2.6, once per valley year). A poor browse year (B below deerBref) sends a fraction
   * f = deerOutK x (1 - B / deerBref), at most half, of the adults to the nearest corridors. They leave in groups: a seed animal
   * and the herd-mates within 25 m, repeated until f of the adults is reached. Hidden fawns stay.
   */
  private pronghornExodus(): void {
    const a = this.a, p = this.p, r = this.region!.rng;
    const pop = this.pop[Sp.Deer];
    if (pop === 0) return;
    const B = this.browsePerPronghorn(pop);
    const f = Math.min(0.5, Math.max(0, p.deerOutK * (1 - B / p.deerBref)));
    if (f <= 0) return;
    const mature = p.species[Sp.Deer].matureAge;
    const adults: number[] = [];
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Deer && a.age[i] >= mature && a.state[i] !== St.Migrate) adults.push(i);
    let left = Math.round(f * adults.length), leaving = 0;
    let ex = 0, ey = 0;
    let pool = adults.slice();
    while (left > 0 && pool.length > 0) {
      const seed = pool[r.int(pool.length)];
      const sx = a.x[seed], sy = a.y[seed];
      if (leaving === 0) { ex = sx; ey = sy; }
      // the seed first, then herd-mates within 25 m in slot order, until the quota is met
      this.beginEmigration(seed);
      left--; leaving++;
      for (let q = 0; q < pool.length && left > 0; q++) {
        const j = pool[q];
        if (j === seed || a.state[j] === St.Migrate) continue;
        const dx = a.x[j] - sx, dy = a.y[j] - sy;
        if (dx * dx + dy * dy > 625) continue;
        this.beginEmigration(j);
        left--; leaving++;
      }
      pool = pool.filter((j) => a.state[j] !== St.Migrate);
    }
    if (leaving > 0) this.event('emigrated', Sp.Deer, ex, ey, leaving, f);
  }

  /** Spring return (season 0.25): a share deerInK of the gap to deerKb walks back in as one group, with a rescue group when the herd is nearly gone. */
  private pronghornReturn(): void {
    const p = this.p, r = this.region!.rng;
    const pop = this.pop[Sp.Deer];
    let n = Math.min(p.deerInMax, Math.max(0, Math.round(p.deerInK * (p.deerKb - pop))));
    if (pop < 20) n = Math.max(n, p.deerRescue);
    if (n <= 0) return;
    const c = this.world.corridors, k = r.int(c.length / 4);
    const bx = c[k * 4], by = c[k * 4 + 1], nx = c[k * 4 + 2], ny = c[k * 4 + 3];
    this.spawnArrivals(Sp.Deer, n, bx, by, nx, ny, bx + nx * 35, by + ny * 35, 1, 12);
    this.event('immigrated', Sp.Deer, bx, by, n, 0);
  }

  /**
   * Vagrant ravens: scavengers from outside the valley that follow carrion. Every 50 ticks the target number is
   * ravenVagrantK x carrion, raised by half in deep winter, capped at ravenVagrantCap. Below target a few (at most 8) appear at the
   * border nearest the richest carcass and fly to it. Once the carrion cannot support a fifth of those present, a twentieth
   * of them head for the nearest edge. Vagrants (origin 2) never breed.
   */
  /** Raven nest sites: fixed, or scaled by year-smoothed carrion when ravenNestFood is on. */
  private ravenSites(): number {
    const p = this.p;
    if (p.ravenNestFood <= 0 || this.carrionEma < 0) return p.ravenNestSites;
    const k = Math.pow(Math.max(1, this.carrionEma) / p.ravenNestCarrionRef, p.ravenNestFood);
    return p.ravenNestSites * Math.min(2, Math.max(0.4, k));
  }

  private vagrantRavens(): void {
    const a = this.a, p = this.p, r = this.region!.rng;
    const carrion = this.sumRemainingMeat();
    const winter = Math.max(0, Math.cos(((this.env.state.season - 3.5) / 4) * 2 * Math.PI));
    const target = Math.min(p.ravenVagrantCap, p.ravenVagrantK * carrion * (1 + 0.5 * winter));
    const vag = this.vagrants;
    if (vag < target) {
      let best = -1, bm = 0;
      for (let k = 0; k < this.cN; k++) if (this.cMeat[k] > bm) { bm = this.cMeat[k]; best = k; }
      if (best < 0) return;
      const n = Math.min(8, Math.ceil((target - vag) * 0.1));
      const cx = this.cX[best], cy = this.cY[best];
      const [bx, by, nx, ny] = this.nearestEdge(cx, cy);
      this.spawnArrivals(Sp.Raven, n, bx, by, nx, ny, cx, cy, 2, 40);
    } else if (p.ravenVagrantK * carrion < 0.2 * vag) {
      const cand: number[] = [];
      for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Raven && a.origin[i] === 2 && a.target[i] !== -2) cand.push(i);
      for (let q = Math.ceil(vag * 0.05); q > 0 && cand.length > 0; q--) {
        const i = cand.splice(r.int(cand.length), 1)[0];
        const [bx, by] = this.nearestEdge(a.x[i], a.y[i]);
        this.beginMigrate(i, true, bx, by);
      }
    }
  }

  // ------------------------------------------------------------------ output

  populations(): number[] {
    const out = new Array(SPECIES_COUNT).fill(0);
    const a = this.a;
    for (let i = 0; i < a.hi; i++) if (a.alive[i]) out[a.sp[i]]++;
    if (this.small !== null) {
      // field species report their totals, rounded
      out[Sp.Rabbit] = Math.round(this.small.hareTotal());
      out[Sp.PrairieDog] = Math.round(this.small.dogTotal());
    }
    return out;
  }

  /**
   * Herd shape (S10), read-only: no rng, no state. Columns, all about bison:
   *   near_bison       bison within 30 m of water
   *   ring_bison       share of those standing in the bank band (3 to 12 m from the water, so not drinking); a plain uniform spread gives about 0.3,
   *                    a ring around a pond more (NaN with fewer than 5 bison near water)
   *   nn_graze_bison   mean distance (m, each capped at 30) from a grazing bison to the nearest other bison (NaN with fewer than 2 grazers)
   */
  private herdShapeRow(row: Record<string, number>): void {
    const a = this.a, wd = this.world.waterDist;
    const idx: number[] = [];
    let near = 0, ring = 0;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Bison) continue;
      idx.push(i);
      const d = wd[this.veg.cellAt(a.x[i], a.y[i])];
      if (d < 30) { near++; if (d >= 3 && d < 12) ring++; }
    }
    row.near_bison = near;
    row.ring_bison = near >= 5 ? ring / near : NaN;
    // nearest neighbour by a sweep over the bison sorted on x
    idx.sort((p, q) => a.x[p] - a.x[q] || p - q);
    let sum = 0, cnt = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (a.state[i] !== St.Graze) continue;
      let best = 900;
      for (let m = k + 1; m < idx.length; m++) {
        const dx = a.x[idx[m]] - a.x[i];
        if (dx * dx >= best) break;
        const dy = a.y[idx[m]] - a.y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      for (let m = k - 1; m >= 0; m--) {
        const dx = a.x[idx[m]] - a.x[i];
        if (dx * dx >= best) break;
        const dy = a.y[idx[m]] - a.y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      sum += Math.sqrt(best);
      cnt++;
    }
    row.nn_graze_bison = cnt >= 2 ? sum / cnt : NaN;
  }

  sample(): Record<string, number> {
    const a = this.a;
    const pops = this.populations();
    const row: Record<string, number> = { tick: this.tick, year: this.tick / YEAR_TICKS };
    for (let s = 0; s < SPECIES_COUNT; s++) row['pop_' + SPECIES_KEYS[s]] = pops[s];
    row.grass_mean = this.veg.meanGrass();
    row.browse_mean = this.veg.meanOf(this.veg.browse);
    row.soil_mean = this.veg.meanOf(this.veg.soil);
    row.fear_mean = this.veg.meanOf(this.veg.fear);
    // generation depth and trait means
    const gsum = new Float64Array(SPECIES_COUNT);
    const tsum = new Float64Array(SPECIES_COUNT * NG);
    const csq = new Float64Array(SPECIES_COUNT);
    let juvBison = 0, infBison = 0, cdvWolf = 0, mangeWolf = 0, mangeSev = 0;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i]) continue;
      const s = a.sp[i];
      gsum[s] += a.gen[i];
      for (let g = 0; g < NG; g++) tsum[s * NG + g] += a.genes[i * NG + g];
      csq[s] += a.genes[i * NG + G_COAT] * a.genes[i * NG + G_COAT];
      if (a.cdv[i] > 0 && IS_CANID[s]) cdvWolf++;
      if (a.mange[i] > 0 && IS_CANID[s]) { mangeWolf++; mangeSev += a.mange[i]; }
      if (s === Sp.Bison) {
        if (a.age[i] < this.p.species[s].matureAge) juvBison++;
        if (a.infected[i] > 0) infBison++;
      }
    }
    for (const d of SPECIES) if (d.traits) row['gen_' + d.key] = pops[d.id] ? gsum[d.id] / pops[d.id] : 0;
    const traits: [number, number][] = [[Sp.Bison, G_SPEED], [Sp.Bison, G_SIZE], [Sp.Bison, G_COAT], [Sp.Bison, G_SIGHT], [Sp.Bison, G_HERD],
      [Sp.Wolf, G_SPEED], [Sp.Wolf, G_SIZE], [Sp.Wolf, G_COAT], [Sp.Wolf, G_SIGHT], [Sp.Deer, G_SPEED], [Sp.Deer, G_COAT],
      [Sp.Bison, G_LITTER], [Sp.Deer, G_LITTER]];
    for (const [s, g] of traits) {
      row[`trait_${SPECIES_KEYS[s]}_${GENE_NAMES[g]}`] = pops[s] ? tsum[s * NG + g] / pops[s] : NaN;
    }
    // coat variance per species (S9: does selection keep the colours varied?) and the wolves' mean bison coat search image
    for (const [s, key] of [[Sp.Bison, 'bison'], [Sp.Deer, 'pronghorn'], [Sp.Wolf, 'wolf']] as [number, string][]) {
      const n = pops[s], m = n ? tsum[s * NG + G_COAT] / n : 0;
      row['coatvar_' + key] = n > 1 ? Math.max(0, csq[s] / n - m * m) : NaN;
    }
    let imgSum = 0, imgN = 0;
    for (let pk = 0; pk < MAX_PACKS; pk++) {
      const v = this.packCoat[pk * SPECIES_COUNT + Sp.Bison];
      if (this.packAlive[pk] && v >= 0) { imgSum += v; imgN++; }
    }
    row.search_wolf = imgN ? imgSum / imgN : NaN;
    row.juv_bison = juvBison;
    this.herdShapeRow(row);
    row.infected_bison = infBison;
    // canid disease: wolves sick with distemper now, wolves with mange now (and their mean severity),
    // disease deaths, outbreaks closed and packs newly hit by mange since the last sample
    const dr = this.dis.drainSample();
    row.cdv_wolf = cdvWolf;
    row.mange_wolf = mangeWolf;
    row.mange_sev_wolf = mangeWolf ? mangeSev / mangeWolf : 0;
    row.cdv_deaths_wolf = dr.deaths;
    row.cdv_outbreaks = dr.outbreaks;
    row.mange_events = dr.mangeEvents;
    row.kills = this.cKills;
    row.kills_pronghorn = this.cKillsDeer;
    row.strife_wolf = this.cStrife;
    row.kills_cougar = this.cKillsCougar;
    // cougar kills by prey species since the last sample (S8)
    row.cougar_kills_muledeer = this.cCougarKills[Sp.MuleDeer];
    row.cougar_kills_pronghorn = this.cCougarKills[Sp.Deer];
    row.cougar_kills_bison = this.cCougarKills[Sp.Bison];
    row.births_pronghorn = this.cBirths[Sp.Deer];
    row.starved_pronghorn = this.cStarve[Sp.Deer];
    row.chases = this.cChases;
    row.giveups = this.cGiveUps;
    row.births_bison = this.cBirths[Sp.Bison];
    row.births_wolf = this.cBirths[Sp.Wolf];
    row.starved_bison = this.cStarve[Sp.Bison];
    row.starved_juv_bison = this.cStarveJuv;
    row.starved_wolf = this.cStarve[Sp.Wolf];
    row.old_bison = this.cOld[Sp.Bison];
    row.thirst_bison = this.cThirst[Sp.Bison];
    row.thirst_wolf = this.cThirst[Sp.Wolf];
    row.old_wolf = this.cOld[Sp.Wolf];
    row.killed_bison = this.cKilled[Sp.Bison];
    // the same death and birth counts for every agent species, where the columns above do not have them already, so the
    // tools can read any species' causes of death (killed counts every predator, not just wolves)
    for (const d of SPECIES) {
      if (d.repr !== 'agent') continue;
      const k = d.key;
      const cols: [string, number][] = [['births_', this.cBirths[d.id]], ['starved_', this.cStarve[d.id]], ['old_', this.cOld[d.id]], ['thirst_', this.cThirst[d.id]], ['killed_', this.cKilled[d.id]]];
      for (const [pre, v] of cols) if (!((pre + k) in row)) row[pre + k] = v;
    }
    let packs = 0;
    for (let pk = 0; pk < MAX_PACKS; pk++) packs += this.packAlive[pk];
    row.packs = packs;
    row.carcasses = this.cN;
    row.drought = this.env.droughtTicks > 0 ? 1 : 0;
    // open prairie (S1): arrivals and departures since the last sample, vagrant ravens, and the two calibration inputs
    for (let s = 0; s < SPECIES_COUNT; s++) {
      row['imm_' + SPECIES_KEYS[s]] = this.cImm[s];
      row['emig_' + SPECIES_KEYS[s]] = this.cEmig[s];
    }
    row.vagrants = this.vagrantCount();
    row.vagrant_in = this.cVagIn;
    row.vagrant_out = this.cVagOut;
    row.carrion = this.sumRemainingMeat();
    row.browse_pp = pops[Sp.Deer] > 0 ? this.sumBrowse() / pops[Sp.Deer] : NaN;
    // small-prey web (S4): unrounded field totals, towns and plague now, and the counts since the last sample (all 0 with smallPrey off)
    const sm = this.small;
    const sd = sm ? sm.drainSample() : null;
    row.hare_total = sm ? sm.hareTotal() : 0;
    row.dog_total = sm ? sm.dogTotal() : 0;
    row.towns = sm ? sm.townCount : 0;
    row.plague_cells = sm ? sm.plagueCells : 0;
    row.plague_events = sd ? sd.plagues : 0;
    row.town_founded = sd ? sd.townsFounded : 0;
    row.town_lost = sd ? sd.townsLost : 0;
    row.hare_boom = sd ? sd.booms : 0;
    row.hare_crash = sd ? sd.crashes : 0;
    row.hare_takes = sd ? sd.hareTakes : 0;
    row.dog_takes = sd ? sd.dogTakes : 0;
    if (sd) {
      row.imm_rabbit += sd.hareArrivals;
      row.imm_prairiedog += sd.dogArrivals;
    }
    this.coyotes.sampleRow(row);
    // who takes the hares and prairie dogs (S7): each predator kind's catches since the last sample, and the two raptors together
    const bk = sd ? sd.byKind : null;
    for (let k = 0; k < TAKE_KINDS.length; k++) {
      row[`takes_hare_${TAKE_KINDS[k]}`] = bk ? bk[k * 2] : 0;
      row[`takes_dog_${TAKE_KINDS[k]}`] = bk ? bk[k * 2 + 1] : 0;
    }
    row.raptor_takes_hare = row.takes_hare_eagle + row.takes_hare_hawk;
    row.raptor_takes_dog = row.takes_dog_eagle + row.takes_dog_hawk;
    this.raptors.sampleRow(row);
    // beaver ponds (S14): colonies, dams, ponds and meadows now and the counts since the last sample (all 0 with the beaver system off), and the mean
    // distance from a land cell to water (m), which a pond shortens
    if (this.beavers !== null) this.beavers.sampleRow(row); else emptyBeaverRow(row);
    {
      const wd = this.world.waterDist, wat = this.world.water;
      let s = 0, k = 0;
      for (let c = 0; c < wd.length; c++) if (!wat[c]) { s += wd[c]; k++; }
      row.water_dist_mean = k ? s / k : 0;
    }
    row.fires_lightning = this.cLightning;
    row.storm_cells = this.storms ? this.storms.cells.length : 0;
    // winter (S11): snow now (mean and deepest cell), the highest mean depth since the last sample, and blizzards and hard winters begun since then (all 0 with snowDepth off)
    const wn = this.winter;
    const wd = wn ? wn.drainSample() : null;
    row.snow_mean = wn ? wn.meanDepth() : 0;
    row.snow_max = wn ? wn.maxDepth() : 0;
    row.snow_peak = wd ? wd.peak : 0;
    row.blizzards = wd ? wd.blizzards : 0;
    row.hard_winters = wd ? wd.hardWinters : 0;
    // S12: dust storms begun, the bare share of the land (0 when dustStorms is off), grasshoppers (field total, densest cell, outbreaks begun, grass eaten as
    // mean-grass units, energy fed to coyotes, ravens and hawks), spring floods begun, flood now (0/1) and young animals drowned by any flood since the last sample
    const du = this.dust !== null ? this.dust.drainSample() : null;
    row.dust_storms = du ? du.storms : 0;
    row.dust_now = this.dust !== null ? this.dust.intensity() : 0;
    row.dust_bare = this.dust !== null ? this.dust.bareShare() : 0;
    const hd = this.hoppers !== null ? this.hoppers.drainSample() : null;
    row.hop_total = this.hoppers !== null ? this.hoppers.total() : 0;
    row.hop_peak = this.hoppers !== null ? this.hoppers.maxDensity() : 0;
    row.hop_outbreaks = hd ? hd.outbreaks : 0;
    row.hop_eaten = hd ? hd.eaten : 0;
    row.hop_fed_coyote = hd ? hd.fed[0] : 0;
    row.hop_fed_raven = hd ? hd.fed[1] : 0;
    row.hop_fed_hawk = hd ? hd.fed[2] : 0;
    row.spring_floods = this.cSpringFloods;
    row.flood_now = this.flood !== null ? 1 : 0;
    row.fawns_drowned = this.cFawnsDrowned;
    // S13: trees by kind and stage now (0 with dynamicTrees off), recruits, fire deaths, mean cover of the land (always), juniper share of the ridges
    const tc = this.trees !== null ? this.trees.counts() : null;
    const td = this.trees !== null ? this.trees.drainSample() : null;
    for (let k = 0; k < 3; k++) for (let s = 0; s < 5; s++) row[`tr_${TREE_KIND_KEYS[k]}_${TREE_STAGE_KEYS[s]}`] = tc ? tc.n[k][s] : 0;
    row.tr_live = tc ? tc.total : 0;
    row.tr_rec_cw = td ? td.recCw : 0;
    row.tr_rec_jun = td ? td.recJun : 0;
    row.tr_fire_small = td ? td.fireSmall : 0;
    row.tr_fire_mature = td ? td.fireMature : 0;
    row.tr_old = td ? td.old : 0;
    row.tr_hazard = td ? td.hazard : 0;
    row.tr_planted = td ? td.planted : 0;
    row.tr_encroach = td ? td.encroach : 0;
    row.tr_browse_slow = td ? td.slow : 0;
    row.tr_jun_ridge = this.trees !== null ? this.trees.ridgeShare() : 0;
    row.cover_mean = this.veg.meanOf(this.world.cover);
    this.cKills = 0;
    this.cKillsDeer = 0;
    this.cStrife = 0;
    this.cKillsCougar = 0;
    this.cCougarKills.fill(0);
    this.cChases = 0;
    this.cGiveUps = 0;
    this.cBirths.fill(0);
    this.cStarve.fill(0);
    this.cOld.fill(0);
    this.cKilled.fill(0);
    this.cThirst.fill(0);
    this.cStarveJuv = 0;
    this.cImm.fill(0);
    this.cEmig.fill(0);
    this.cVagIn = 0;
    this.cVagOut = 0;
    this.cLightning = 0;
    this.cSpringFloods = 0;
    this.cFawnsDrowned = 0;
    return row;
  }

  snapshot(withVeg: boolean, vegOut?: Uint8Array): Snapshot {
    const a = this.a;
    const count = a.count;
    const ids = new Uint32Array(count);
    const out = new Float32Array(count * AGENT_STRIDE);
    let k = 0;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i]) continue;
      const s = a.sp[i];
      const P = this.p.species[s];
      const o = k * AGENT_STRIDE;
      ids[k] = a.id[i];
      out[o] = s;
      out[o + 1] = a.x[i];
      out[o + 2] = a.y[i];
      out[o + 3] = a.heading[i];
      out[o + 4] = Math.sqrt(a.vx[i] * a.vx[i] + a.vy[i] * a.vy[i]);
      const grow = a.age[i] < P.matureAge ? 0.45 + 0.55 * (a.age[i] / P.matureAge) : 1;
      out[o + 5] = a.genes[i * NG + G_SIZE] * grow;
      out[o + 6] = a.genes[i * NG + G_COAT];
      out[o + 7] = a.state[i];
      let f = 0;
      if (a.age[i] < P.matureAge) f |= F_JUVENILE;
      if (a.pregnant[i] > 0) f |= F_PREGNANT;
      if (a.state[i] === St.Migrate) f |= F_MIGRANT;
      if (a.infected[i] > 0 || (a.cdv[i] > 0 && IS_CANID[s])) f |= F_INFECTED;
      if (a.mange[i] > 0) f |= F_MANGE;
      if (a.male[i]) f |= F_MALE;
      if (s === Sp.MuleDeer && a.state[i] === St.Flee) f |= F_STOT;
      const pk = a.pack[i];
      if (pk >= 0 && (this.packAlphaF[pk] === i || this.packAlphaM[pk] === i)) f |= F_ALPHA;
      out[o + 8] = f;
      out[o + 9] = a.alt[i];
      out[o + 10] = a.energy[i];
      out[o + 11] = a.age[i] / P.maxAge;
      k++;
    }
    const car = new Float32Array(this.cN * CARCASS_STRIDE);
    for (let q = 0; q < this.cN; q++) {
      car[q * 4] = this.cX[q];
      car[q * 4 + 1] = this.cY[q];
      car[q * 4 + 2] = Math.max(0, this.cMeat[q] / this.cMeat0[q]);
      car[q * 4 + 3] = this.cSp[q];
    }
    let veg: Uint8Array | undefined;
    if (withVeg) {
      veg = vegOut ?? new Uint8Array(this.world.n * this.world.n * 4);
      this.veg.fillTexture(veg);
    }
    let small: Uint8Array | undefined;
    if (withVeg && this.small !== null) {
      small = new Uint8Array(32 * 32 * 4);
      this.small.fillTexture(small);
    }
    const snap: Snapshot = {
      tick: this.tick, env: { ...this.env.state }, count: k, ids, agents: out, carcassCount: this.cN, carcasses: car, veg, small,
      pop: Int32Array.from(this.populations()),
    };
    if (withVeg && this.winter !== null) {
      snap.snow = new Uint8Array(32 * 32);
      this.winter.fillTexture(snap.snow);
    }
    if (this.storms) {
      snap.storms = this.storms.toArray(this.env.state, this.tick);
      snap.strikes = this.storms.drainStrikes();
    } else if (this.godStrikes.length > 0) {
      snap.strikes = Float32Array.from(this.godStrikes);
      this.godStrikes.length = 0;
    }
    if (this.flood !== null) snap.flood = Float32Array.of(this.flood.left, this.flood.sev, this.flood.radius);
    if (withVeg && this.groveBase >= 0 && this.trees === null) snap.groves = this.world.trees.slice(this.groveBase);
    if (this.trees !== null) {
      // dynamic trees (S13): the whole list, and the cover field it makes, whenever the list changed since the last snapshot that carried them
      snap.treesVersion = this.trees.version;
      if (withVeg && this.trees.version !== this.treesSent) {
        snap.trees = this.trees.toArray();
        snap.treeCover = this.trees.coverBytes();
        this.treesSent = this.trees.version;
      }
    }
    if (this.beavers !== null) {
      // beaver ponds (S14): the depth field, the dams and the lodges, whenever they changed since the last snapshot that carried them (with the vegetation texture)
      snap.pondVersion = this.beavers.ponds.version;
      if (withVeg && this.beavers.ponds.version !== this.beaversSent) {
        snap.ponds = this.beavers.ponds.depthBytes();
        snap.dams = this.beavers.ponds.damArray();
        snap.lodges = this.beavers.lodgeArray();
        snap.drownedTrees = Uint32Array.from(this.beavers.ponds.drownedTrees);
        this.beaversSent = this.beavers.ponds.version;
      }
    }
    if (this.dust !== null) { const d = this.dust.toArray(); if (d !== null) snap.dust = d; }
    if (withVeg && this.hoppers !== null) {
      snap.hoppers = new Uint8Array(32 * 32);
      this.hoppers.fillTexture(snap.hoppers);
    }
    return snap;
  }
}

/** Coat darkness stays within a species' believable range (bison stay dark, wolves stay pale); see COAT_RANGE in species.ts. */
function clampCoat(sp: number, v: number): number {
  const [lo, hi] = COAT_RANGE[sp] ?? [0, 1];
  return v < lo ? lo : v > hi ? hi : v;
}

function clampGene(g: number, v: number): number {
  switch (g) {
    case G_COAT: return v < 0 ? 0 : v > 1 ? 1 : v;
    case G_BOLD: case G_HERD: return v < 0 ? 0 : v > 2 ? 2 : v;
    case G_SIGHT: return v < 0.5 ? 0.5 : v > 2 ? 2 : v;
    case G_LITTER: return v < 0.3 ? 0.3 : v > 2.5 ? 2.5 : v;
    default: return v < 0.6 ? 0.6 : v > 1.6 ? 1.6 : v;
  }
}

export function createSim(opts: { seed: number; params?: Record<string, number> }): Sim {
  return new Sim(opts);
}

export { STRIDE };
