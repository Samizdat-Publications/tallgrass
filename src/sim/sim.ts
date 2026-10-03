// The Tallgrass simulation core. Deterministic from the seed, renderer-independent.
import { Agents, G_BOLD, G_COAT, G_HERD, G_LITTER, G_SIGHT, G_SIZE, G_SPEED, NG, GENE_NAMES } from './agents';
import { Environment } from './env';
import { BucketGrid } from './grid';
import { applyOverrides, defaultParams, Params, SpeciesParams } from './params';
import { Rng } from './rng';
import {
  AGENT_STRIDE, CARCASS_STRIDE, F_ALPHA, F_INFECTED, F_JUVENILE, F_MALE, F_PREGNANT, Intervention, SimLike, Snapshot,
  SPECIES_COUNT, SPECIES_KEYS, Sp, St, YEAR_TICKS,
} from './types';
import { STRIDE, Vegetation } from './vegetation';
import { generateWorld, World } from './world';

const DT = 0.15; // seconds of motion per tick (1x is a gentle 1.5x time-lapse)
const BUCKET = 16;
const MAX_PACKS = 64;

export type SimEventKind =
  | 'packFounded' | 'packLost' | 'drought' | 'droughtEnd' | 'outbreak' | 'stampede' | 'extinct'
  | 'introduced' | 'removed' | 'culled' | 'fire' | 'record' | 'elder' | 'firstKill' | 'plague' | 'rain';

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

export interface SimOptions {
  seed: number;
  params?: Record<string, number>;
  world?: World;
}

const isHerbivore = (s: number) => s === Sp.Bison || s === Sp.Deer || s === Sp.Rabbit;
const isPredator = (s: number) => s === Sp.Wolf || s === Sp.Cougar;

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
  readonly prey: BucketGrid;
  readonly pred: BucketGrid;
  private preyList = new Int32Array(4096);
  private predList = new Int32Array(1024);
  private preyN = 0;
  private predN = 0;
  /** Unit vectors pointing downhill in water distance (toward water), per cell. */
  private waterGX: Float32Array;
  private waterGY: Float32Array;

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
  private packCandF = new Int32Array(MAX_PACKS);
  private packCandM = new Int32Array(MAX_PACKS);
  private packCx = new Float32Array(MAX_PACKS);
  private packCy = new Float32Array(MAX_PACKS);
  private nextPackSerial = 1;
  /** Coarse 16 m map of grass and browse (bucket means) for herd migration; refreshed every 50 ticks. */
  coarseGrass = new Float32Array(32 * 32);
  coarseBrowse = new Float32Array(32 * 32);

  events: SimEvent[] = [];
  /** Counters since the last sample() call. */
  private cKills = 0;
  private cKillsDeer = 0;
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
  private everPresent = new Uint8Array(SPECIES_COUNT);
  private lastStampede = -99999;
  private lastOutbreak = -99999;
  private wasDrought = false;
  private groundB = 0.6;
  private firstKillLogged = false;

  constructor(opts: SimOptions) {
    this.seed = opts.seed >>> 0;
    this.p = applyOverrides(defaultParams(), opts.params);
    this.rng = new Rng(this.seed);
    this.world = opts.world ?? generateWorld(this.seed);
    this.env = new Environment(this.rng.fork(11));
    this.veg = new Vegetation(this.world, this.p, this.env, this.rng.fork(12));
    this.a = new Agents(4096);
    this.prey = new BucketGrid(this.world.size, BUCKET);
    this.pred = new BucketGrid(this.world.size, BUCKET);
    const n = this.world.n;
    this.waterGX = new Float32Array(n * n);
    this.waterGY = new Float32Array(n * n);
    const wd = this.world.waterDist;
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
    this.populate();
  }

  // ------------------------------------------------------------------ setup

  private defaultGenes(sp: number, out: Float32Array, o: number): void {
    const r = this.rng;
    const j = () => 1 + (r.next() - 0.5) * 0.12;
    out[o + G_SPEED] = j();
    out[o + G_SIZE] = j();
    out[o + G_SIGHT] = j();
    out[o + G_BOLD] = j();
    out[o + G_HERD] = j();
    out[o + G_COAT] = (sp === Sp.Bison ? 0.85 : sp === Sp.Wolf ? 0.3 : sp === Sp.Raven ? 0.97 : 0.5) + (r.next() - 0.5) * 0.12;
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
    for (let k = 0; k < P[Sp.Raven].initial; k++) {
      const [x, y] = this.goodSpot(0.2);
      const i = this.spawnAdult(Sp.Raven, x, y);
      this.a.alt[i] = 25 + this.rng.next() * 15;
      this.a.state[i] = St.Fly;
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
    this.everPresent[sp] = 1;
    return i;
  }

  // ------------------------------------------------------------------ packs

  private findDenSite(nearX?: number, nearY?: number): [number, number] | null {
    const w = this.world;
    const minD = this.p.wolfDenMinDist;
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
        for (let s = 0; s < SPECIES_COUNT; s++) this.packPref[pk * SPECIES_COUNT + s] = 0.7;
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
    this.veg.step(t);
    this.groundB = grassBrightness(this.env.state.season);

    // lists, grids, pack bookkeeping
    this.preyN = 0;
    this.predN = 0;
    this.pop.fill(0);
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
      if (isHerbivore(s)) this.preyList[this.preyN++] = i;
      else if (isPredator(s)) {
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
    if (t % 50 === 0) this.refreshCoarse();
    this.prey.build(this.preyList, this.preyN, a.x, a.y);
    this.pred.build(this.predList, this.predN, a.x, a.y);
    this.updatePacks();

    // agents
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i]) continue;
      const s = a.sp[i];
      if (s === Sp.Bison || s === Sp.Deer) {
        if (((i + t) & 3) === 0) this.thinkHerbivore(i, P[s]);
        this.moveGround(i, P[s]);
        this.liveHerbivore(i, P[s]);
      } else if (s === Sp.Wolf) {
        if ((i + t) % 3 === 0) this.thinkWolf(i, P[s]);
        this.moveGround(i, P[s]);
        this.liveWolf(i, P[s]);
      } else if (s === Sp.Raven) {
        if ((i + t) % 6 === 0) this.thinkRaven(i, P[s]);
        this.liveRaven(i, P[s]);
      }
    }

    this.updateCarcasses();
    this.checkEvents();
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
        if (this.packSize[pk] > this.p.wolfPackMax && this.packStore[pk] > 0.8) this.disperse(pk);
        else if (this.packSize[pk] <= 2 && (this.packAlphaF[pk] < 0 || this.packAlphaM[pk] < 0)) this.mergeRemnant(pk);
        else if (this.packAlphaF[pk] < 0) this.fillVacancy(pk, 0);
        else if (this.packAlphaM[pk] < 0) this.fillVacancy(pk, 1);
      }
    }
    // wolves breed once a year, at the start of spring
    if (this.env.yearTick(this.tick) === 0) {
      const P = this.p.species[Sp.Wolf];
      for (let pk = 0; pk < MAX_PACKS; pk++) {
        if (!this.packAlive[pk]) continue;
        const f = this.packAlphaF[pk], m = this.packAlphaM[pk];
        if (f < 0 || m < 0) continue;
        if (a.energy[f] < 0.3) continue;
        const crowd = this.packSize[pk] >= this.p.wolfPackMax + 3;
        if (crowd) continue;
        let litter = Math.round(P.litter * a.genes[f * NG + G_LITTER] * (0.6 + 0.5 * Math.min(1, this.packStore[pk])) + (this.rng.next() - 0.5) * 2);
        litter = Math.max(1, Math.min(8, litter));
        for (let k = 0; k < litter; k++) {
          const c = this.birth(f, m, Sp.Wolf, this.packDenX[pk] + this.rng.range(-3, 3), this.packDenY[pk] + this.rng.range(-3, 3));
          a.pack[c] = pk;
          a.energy[c] = 0.8;
        }
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
              a.energy[c] = 0.8;
            }
          }
        }
      }
    }
    // rescue immigration (off by default): a pair walks in from outside the valley
    if (this.p.wolfImmigration > 0 && this.pop[Sp.Wolf] < 6 && this.rng.next() < this.p.wolfImmigration / YEAR_TICKS) {
      this.introduce(Sp.Wolf, 2);
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
      if (!a.alive[i] || a.sp[i] !== Sp.Wolf || a.male[i] !== male || a.age[i] < mature) continue;
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
      if (q === pk || !this.packAlive[q] || this.packSize[q] >= this.p.wolfPackMax) continue;
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
    if (isYoung) {
      const m = a.mother[t];
      return a.same(m, a.motherId[t]) && Math.abs(a.x[m] - a.x[t]) < 5 && Math.abs(a.y[m] - a.y[t]) < 5 && a.energy[m] > 0.45 ? 1 : 0;
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
    return n;
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
        if (this.rng.next() > 1 - Math.exp(-cnt / this.p.wolfScentHerd)) continue;
        const v = cnt / (Math.hypot(wx - cx, wy - cy) + 50);
        if (v > best) { best = v; bxw = wx; byw = wy; }
      }
    }
    this.packHuntX[pk] = bxw;
    this.packHuntY[pk] = byw;
    this.packScentHit[pk] = best > 0 ? 1 : 0;
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
      a.genes[c * NG + g] = clampGene(g, v);
    }
    a.children[mother]++;
    if (!useMate && fatherSlot >= 0) a.children[fatherSlot]++;
    this.cBirths[sp]++;
    return c;
  }

  private die(i: number, cause: 'starve' | 'thirst' | 'old' | 'killed' | 'culled' | 'removed'): void {
    const a = this.a;
    const s = a.sp[i];
    if (cause === 'starve') { this.cStarve[s]++; if (s === Sp.Bison && a.age[i] < this.p.species[s].matureAge) this.cStarveJuv++; }
    else if (cause === 'thirst') this.cThirst[s]++;
    else if (cause === 'old') {
      this.cOld[s]++;
    } else if (cause === 'killed') this.cKilled[s]++;
    if (cause !== 'removed' && s !== Sp.Raven) {
      const P = this.p.species[s];
      const juvenileF = a.age[i] < P.matureAge ? 0.25 + 0.75 * (a.age[i] / P.matureAge) : 1;
      const meat = P.meat * a.genes[i * NG + G_SIZE] * juvenileF * (cause === 'starve' ? 0.6 : 1) * (cause === 'culled' ? 0.5 : 1);
      if (meat > 0.05) this.addCarcass(a.x[i], a.y[i], meat * (cause === 'old' ? 0.6 : 1), s, cause === 'killed' ? 1 : 0);
    }
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
      if (this.cMeat[k] <= 0 || this.cAge[k] > YEAR_TICKS) {
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
    const accel = a.state[i] === St.Flee || a.state[i] === St.Chase ? 0.3 : 0.15;
    let vx = a.vx[i] + (a.dvx[i] - a.vx[i]) * accel;
    let vy = a.vy[i] + (a.dvy[i] - a.vy[i]) * accel;
    let sp = Math.sqrt(vx * vx + vy * vy);
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
    if (sp > 0.08) a.heading[i] = Math.atan2(vy, vx);
    // trampling wears the grass: stampede paths stay visible
    if (sp > 4) this.veg.grass[c] = Math.max(0, this.veg.grass[c] - this.p.trampleRun);
    else if (sp > 0.8) this.veg.grass[c] = Math.max(0, this.veg.grass[c] - this.p.trampleWalk);
  }

  private metabolism(i: number, P: SpeciesParams): number {
    const a = this.a;
    const o = i * NG;
    const size = a.genes[o + G_SIZE], spd = a.genes[o + G_SPEED], sight = a.genes[o + G_SIGHT];
    const v = Math.sqrt(a.vx[i] * a.vx[i] + a.vy[i] * a.vy[i]);
    const activity = a.state[i] === St.Rest ? 0.7 : v > P.walkSpeed * 2.2 ? 1.8 : v > 0.3 ? 1.05 : 0.9;
    let m = P.metabolism * Math.pow(size, 0.75) * (0.75 + 0.25 * spd * spd) * (0.9 + 0.1 * sight) * activity;
    if (a.infected[i] > 0) m *= this.p.diseaseMetab;
    if (a.age[i] < P.matureAge) m *= 0.75;
    // cold costs extra
    m *= 1 + 0.25 * (1 - this.env.state.warmth);
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
    if (a.infected[i] > 0) {
      if (--a.infected[i] === 0) a.immune[i] = YEAR_TICKS;
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
    const hr = P.herdRadius, hr2 = hr * hr;

    // --- herd scan (3x3 buckets)
    const g = this.prey, nb = g.nb, bs = g.bs;
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    let n = 0, cx = 0, cy = 0, avx = 0, avy = 0, sepx = 0, sepy = 0, alarm = 0, alx = 0, aly = 0, infNear = 0, maxFlee = 0;
    let mate = -1, mateD = 1e9;
    const wantMate = !a.male[i] && !juvenile && a.pregnant[i] === 0 && a.cooldown[i] === 0 && a.energy[i] > 0.6;
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
          n++;
          cx += a.x[j]; cy += a.y[j];
          avx += a.vx[j]; avy += a.vy[j];
          if (d2 < 5) {
            const d = Math.sqrt(d2) + 0.01;
            sepx -= dx / d * (2.3 - d);
            sepy -= dy / d * (2.3 - d);
          }
          if (a.flee[j] > 18) { alarm++; alx += a.fleeX[j]; aly += a.fleeY[j]; if (a.flee[j] > maxFlee) maxFlee = a.flee[j]; }
          if (a.infected[j] > 0 && d2 < 16) infNear++;
          if (wantMate && a.male[j] && a.age[j] >= P.matureAge && d2 < mateD) { mate = j; mateD = d2; }
        }
      }
    }

    // --- disease: density-dependent transmission plus rare sparks in crowded herds
    if (a.infected[i] === 0 && a.immune[i] === 0) {
      let pInf = 1 - Math.pow(1 - p.diseaseBeta, infNear);
      if (n > p.diseaseSparkDensity) pInf += p.diseaseSpark * (n - p.diseaseSparkDensity);
      if (pInf > 0 && rng.next() < pInf) {
        a.infected[i] = p.diseaseTicks;
        if (infNear === 0 && this.tick - this.lastOutbreak > YEAR_TICKS / 2) {
          this.lastOutbreak = this.tick;
          this.event('outbreak', s, x, y, n, 0);
        }
      }
    }

    // --- reproduction
    if (mate >= 0 && this.env.state.season < 3) {
      a.pregnant[i] = P.gestation;
      a.mateId[i] = a.id[mate];
      for (let k = 0; k < NG; k++) a.mateGenes[o + k] = a.genes[mate * NG + k];
    }

    const fearHere = this.veg.fear[this.veg.cellAt(x, y)];
    // --- predators: detection with vigilance (more eyes, earlier warning)
    const night = this.env.isNight();
    const sight = P.sight * a.genes[o + G_SIGHT] * (night ? 0.65 : 1);
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
          const dx = a.x[j] - x, dy = a.y[j] - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          // a predator's coat against the grass changes how far away it is noticed
          const contrast = Math.abs((1 - a.genes[j * NG + G_COAT]) * 0.75 + 0.1 - this.groundB);
          const eff = sight * (0.6 + 0.8 * contrast);
          const hunting = a.state[j] === St.Chase;
          const stalking = a.state[j] === St.Stalk;
          if (d > (hunting ? sight * 0.75 : eff)) continue;
          const bold = a.genes[o + G_BOLD];
          // big grazers stand their ground against wolves that aren't hunting unless they come very close
          if (!hunting && !stalking && d > eff * (P.wariness - 0.15 * bold)) continue;
          if (stalking && d > eff * 0.6) continue;
          // in risky ground (high fear) the herd is on edge and notices more
          const pd = hunting ? 0.95 : Math.min(0.95, p.detectBase * (1 - d / (eff + 1)) * (stalking ? 0.8 * (1 + p.fearVigilance * fearHere) : 1));
          const vig = 1 - Math.pow(1 - pd, 1 + p.vigilancePerNeighbor * n);
          if (rng.next() < vig && d < threatD) { threat = j; threatD = d; }
        }
      }
    }
    if (threat >= 0 && a.hydration[i] < 0.2 && !(a.state[threat] === St.Chase && threatD < 12)) threat = -1;
    if (threat >= 0) {
      const dx = x - a.x[threat], dy = y - a.y[threat];
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      a.flee[i] = 24 + ((rng.next() * 16) | 0);
      a.fleeX[i] = dx / d;
      a.fleeY[i] = dy / d;
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
    const herd = a.genes[o + G_HERD];
    if (n > 0) { cx /= n; cy /= n; avx /= n; avy /= n; }
    const c = this.veg.cellAt(x, y);
    if (a.flee[i] > 0 && a.hydration[i] < 0.2 && threat < 0) a.flee[i] = 0;
    if (a.flee[i] > 0) {
      const run = P.runSpeed * spdGene * (a.stamina[i] > 0.08 ? 1 : 0.45) * (a.infected[i] > 0 ? 0.8 : 1) * (juvenile ? 0.85 : 1);
      dvx = a.fleeX[i] * run + sepx * 2;
      dvy = a.fleeY[i] * run + sepy * 2;
      state = St.Flee;
    } else if (a.hydration[i] < 0.3 || (a.state[i] === St.Drink && a.hydration[i] < 0.97)) {
      if (this.world.waterDist[c] < 3) {
        state = St.Drink;
        a.hydration[i] = Math.min(1, a.hydration[i] + 0.06);
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
      const gHere = browser ? (this.veg.browse[c] > 0.03 ? this.veg.browse[c] * 1.6 + this.veg.grass[c] * 0.3 : 0) : this.veg.grass[c];
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
          const dx = cx - x, dy = cy - y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > 7) { dvx += (dx / d) * 0.6 * herd; dvy += (dy / d) * 0.6 * herd; state = St.Walk; }
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
            const food = browser ? this.veg.browse[sc] * 1.6 + this.veg.grass[sc] * 0.35 : this.veg.grass[sc];
            const score = food - p.fearWeight * this.veg.fear[sc] - 0.004 * this.prey.counts[this.prey.bucketOf(sx, sy)] + (k === 0 ? 0.03 : 0) + rng.next() * 0.02;
            if (score > bestS) { bestS = score; bdx = ux; bdy = uy; }
          }
        }
        if (grazing) {
          state = St.Graze;
          const v = bestS > hereS + 0.05 ? 0.35 : 0.12;
          dvx = bdx * v + sepx * 0.5;
          dvy = bdy * v + sepy * 0.5;
          if (n > 0) {
            const dx = cx - x, dy = cy - y, d = Math.sqrt(dx * dx + dy * dy);
            if (d > 6) { dvx += (dx / d) * 0.3 * herd; dvy += (dy / d) * 0.3 * herd; }
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
                const food = browser ? this.coarseBrowse[k] * 1.6 + this.coarseGrass[k] * 0.35 : this.coarseGrass[k];
                const v = food - 0.0012 * Math.hypot(cx2 - x, cy2 - y) - 0.004 * this.prey.counts[this.prey.bucketOf(cx2, cy2)];
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
            if (d > 5) { dvx += (dx / d) * 0.7 * herd; dvy += (dy / d) * 0.7 * herd; }
            dvx += avx * 0.3 * herd;
            dvy += avy * 0.3 * herd;
          }
          state = St.Walk;
        }
      }
    }
    a.dvx[i] = dvx;
    a.dvy[i] = dvy;
    a.state[i] = state;
  }

  private liveHerbivore(i: number, P: SpeciesParams): void {
    const a = this.a;
    if (a.state[i] === St.Graze) {
      const c = this.veg.cellAt(a.x[i], a.y[i]);
      const juvenile = a.age[i] < P.matureAge;
      const want = P.bite * Math.sqrt(a.genes[i * NG + G_SIZE]) * (juvenile ? 0.55 : 1);
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
        a.energy[i] = Math.min(1, a.energy[i] + gain);
      } else {
        const g = this.veg.grass[c];
        const bite = g < want ? g : want;
        this.veg.grass[c] = g - bite;
        a.energy[i] = Math.min(1, a.energy[i] + bite * P.foodValue);
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
      const litter = Math.max(1, Math.round(P.litter * a.genes[i * NG + G_LITTER] + (this.rng.next() - 0.5) * 0.6));
      for (let k = 0; k < litter; k++) this.birth(i, -1, a.sp[i], a.x[i] + this.rng.range(-1, 1), a.y[i] + this.rng.range(-1, 1));
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
    const run = P.runSpeed * spdGene * (a.stamina[i] > 0.05 ? 1 : 0.35);
    const trot = P.walkSpeed * 1.6;
    const c = this.veg.cellAt(x, y);
    let dvx = 0, dvy = 0;
    let state: number = St.Idle;
    // landscape of fear: wolves leave scent wherever they go
    if (this.veg.fear[c] < 0.5) this.veg.fear[c] += p.fearPredatorStamp;

    const denX = pk >= 0 ? this.packDenX[pk] : x, denY = pk >= 0 ? this.packDenY[pk] : y;
    const toDen = Math.hypot(denX - x, denY - y);
    const pupAtDen = juvenile && a.age[i] < p.wolfPupDenAge && pk >= 0;

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
      if (this.world.waterDist[c] < 3) { state = St.Drink; a.hydration[i] = Math.min(1, a.hydration[i] + 0.06); }
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
        else { dvx = (dx / d) * Math.min(run, trot * 1.5); dvy = (dy / d) * Math.min(run, trot * 1.5); state = St.Walk; }
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
    const resting = a.timer[i] < 0; // negative timer = exhausted cooldown
    if (resting) a.timer[i] += 3;

    const opportunist = tgt < 0 && !resting && !juvenile && a.energy[i] >= hungerLine && rng.next() < p.wolfOpportunism;
    if (tgt < 0 && (a.energy[i] < hungerLine || opportunist) && !resting) {
      // look for the most vulnerable prey in sight
      const sight = P.sight * a.genes[o + G_SIGHT] * (night ? 0.75 : 1);
      const g = this.prey, nb = g.nb, bs = g.bs;
      const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
      const rr = Math.ceil(sight / bs);
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
            if (dd > sight) continue;
            const Pj = this.p.species[a.sp[j]];
            if (Pj.hideAge > 0 && a.age[j] < Pj.hideAge && a.state[j] === St.Rest && dd > 5) continue;
            const camo = Pj.camo;
            const contrast = Math.abs((1 - a.genes[j * NG + G_COAT]) * 0.75 + 0.1 - this.groundB);
            if (dd > sight * (1 - camo * (1 - (0.6 + 0.8 * contrast)))) continue;
            const young = a.age[j] < Pj.matureAge ? 2.6 : 1;
            const old = a.age[j] > Pj.maxAge * 0.7 ? 1.8 : 1;
            // a sated wolf only bothers with easy, close prey
            if (opportunist && (dd > 25 || (young === 1 && old === 1 && a.energy[j] > 0.35 && a.infected[j] === 0))) continue;
            const weak = 1.7 - a.energy[j] + (a.infected[j] > 0 ? 0.6 : 0);
            const lone = 1.6 / (1 + 0.12 * crowd);
            // can I actually catch it? fast prey only pays when it's young, sick or tired
            const preySpeed = Pj.runSpeed * a.genes[j * NG + G_SPEED] * (young > 1 ? 0.75 : 1) * (a.stamina[j] > 0.1 ? 1 : 0.5) * (a.infected[j] > 0 ? 0.8 : 1);
            const catchable = Math.min(1, (P.runSpeed * spdGene) / preySpeed);
            const pref = pk >= 0 ? this.packPref[pk * SPECIES_COUNT + a.sp[j]] : 0.7;
            const score = (pref * young * old * weak * lone * catchable * catchable) / (Pj.toughness * a.genes[j * NG + G_SIZE]) / (dd + 15);
            if (score > bestS) { bestS = score; best = j; }
          }
        }
      }
      if (best >= 0) {
        tgt = best;
        this.cChases++;
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
      if (lacks && this.packSize[pk] < this.p.wolfPackMax) {
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
          if (j === i || !a.alive[j] || a.sp[j] !== Sp.Wolf || a.pack[j] >= 0 || a.male[j] === a.male[i]) continue;
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
        if (pk >= 0) {
          const carry = Math.min(this.cMeat[k], take * p.wolfPackStoreShare);
          this.cMeat[k] -= carry;
          this.packStore[pk] = Math.min(4, this.packStore[pk] + carry);
        }
      }
      a.dvx[i] = 0; a.dvy[i] = 0;
    } else if (st === St.Stalk && a.target[i] < 0) {
      // mousing: voles and ground squirrels keep a wolf going but don't feed pups
      a.energy[i] = Math.min(0.7, a.energy[i] + P.metabolism * p.wolfSmallGame);
    } else if (st === St.Chase || st === St.Stalk) {
      const t = a.target[i];
      if (a.same(t, a.targetId[i])) {
        const dx = a.x[t] - a.x[i], dy = a.y[t] - a.y[i];
        if (dx * dx + dy * dy < 3.6) {
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
          const defense = isYoung ? (guards > 0 ? 1 + Pt.defense : 1) : 1 + Pt.defense * Math.min(5, guards);
          const resist = Pt.toughness * a.genes[t * NG + G_SIZE] * young * condition * defense * (a.infected[t] > 0 ? 0.7 : 1);
          const pk2 = p.wolfKillChance * a.genes[i * NG + G_SIZE] * (1 + 0.45 * Math.min(4, helpers)) / resist;
          dbg('attack_roll');
          if (!isYoung && et > 0.5 && this.rng.next() < p.wolfTestGiveUp * Math.min(1, guards / 2 + 0.3)) {
            // tested a strong adult and thought better of it
            dbg('tested_gave_up');
            a.target[i] = -1;
            a.timer[i] = -30;
            if (pk >= 0 && this.packTarget[pk] === t) this.packTarget[pk] = -1;
          } else if (this.rng.next() < pk2) {
            a.kills[i]++;
            this.cKills++;
            this.totalKills++;
            if (!this.firstKillLogged) { this.firstKillLogged = true; this.event('firstKill', Sp.Wolf, a.x[t], a.y[t], a.sp[t], 0); }
            this.veg.stamp(this.veg.fear, a.x[t], a.y[t], p.fearKillRadius, p.fearKill, 1);
            if (a.sp[t] === Sp.Deer) this.cKillsDeer++;
            if (pk >= 0) {
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
    // pups draw on the pack store
    if (pk >= 0 && a.age[i] < p.wolfPupDenAge && this.packStore[pk] > 0 && a.energy[i] < 0.95) {
      const take = Math.min(0.0035, this.packStore[pk]);
      this.packStore[pk] -= take;
      a.energy[i] += take;
    }
    this.vitals(i, P);
  }

  // ------------------------------------------------------------------ ravens

  private thinkRaven(i: number, P: SpeciesParams): void {
    const a = this.a, rng = this.rng;
    const x = a.x[i], y = a.y[i];
    let dvx = 0, dvy = 0;
    let state: number = St.Fly;
    const k = this.nearestCarcass(x, y, P.sight);
    const fly = P.walkSpeed;
    if (k >= 0) {
      const dx = this.cX[k] - x, dy = this.cY[k] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      if (a.energy[i] < 0.9) {
        a.timer[i] = k;
        if (d < 2.5 && a.alt[i] < 1) { state = St.Eat; }
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
      && rng.next() < 1 - this.pop[Sp.Raven] / this.p.ravenNestSites) {
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
      a.vx[i] *= 0.5; a.vy[i] *= 0.5;
      a.alt[i] = Math.max(0, a.alt[i] - 0.4);
    } else {
      // descend only onto the carcass chosen while thinking (no per-tick scan of every carcass)
      const k = a.energy[i] < 0.9 ? a.timer[i] : -1;
      const near = k >= 0 && k < this.cN && Math.abs(this.cX[k] - a.x[i]) < 4 && Math.abs(this.cY[k] - a.y[i]) < 4;
      const targetAlt = near ? 0 : 22 + (a.id[i] % 9) * 2.5;
      a.alt[i] += (targetAlt - a.alt[i]) * 0.03;
      a.vx[i] += (a.dvx[i] - a.vx[i]) * 0.08;
      a.vy[i] += (a.dvy[i] - a.vy[i]) * 0.08;
      a.x[i] = Math.max(2, Math.min(this.world.size - 2, a.x[i] + a.vx[i] * DT));
      a.y[i] = Math.max(2, Math.min(this.world.size - 2, a.y[i] + a.vy[i] * DT));
      const sp = Math.hypot(a.vx[i], a.vy[i]);
      if (sp > 0.1) a.heading[i] = Math.atan2(a.vy[i], a.vx[i]);
      if (a.x[i] <= 2 || a.x[i] >= this.world.size - 2 || a.y[i] <= 2 || a.y[i] >= this.world.size - 2) a.heading[i] += Math.PI * 0.5;
    }
    this.vitals(i, P);
  }

  // ------------------------------------------------------------------ events

  private event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void {
    this.events.push({ tick: this.tick, kind, sp, x, y, a, b });
    if (this.events.length > 4000) this.events.splice(0, 1000);
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
      if (fleeing >= 45 && t - this.lastStampede > YEAR_TICKS) {
        this.lastStampede = t;
        this.event('stampede', Sp.Bison, sx / fleeing, sy / fleeing, fleeing, 0);
      }
      for (let s = 0; s < SPECIES_COUNT; s++) {
        if (this.everPresent[s] && this.pop[s] === 0) {
          this.everPresent[s] = 0;
          this.event('extinct', s, 0, 0, 0, 0);
        }
      }
    }
  }

  // ------------------------------------------------------------------ interventions

  introduce(sp: number, count: number, x?: number, y?: number): void {
    if (sp === Sp.Wolf) {
      let left = count;
      while (left > 0) {
        const den = x !== undefined && y !== undefined ? (this.findDenSite(x, y) ?? [x, y]) : this.findDenSite();
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
      const [cx, cy] = x !== undefined && y !== undefined ? [x, y] : this.goodSpot(0.4);
      for (let k = 0; k < count; k++) {
        const i = this.spawnAdult(sp, cx + this.rng.range(-15, 15), cy + this.rng.range(-15, 15));
        if (sp === Sp.Raven) { this.a.alt[i] = 30; this.a.state[i] = St.Fly; }
      }
    }
    this.everPresent[sp] = 1;
    this.event('introduced', sp, x ?? 0, y ?? 0, count, 0);
  }

  apply(iv: Intervention): void {
    const a = this.a;
    switch (iv.kind) {
      case 'cull': {
        let n = 0;
        for (let i = 0; i < a.hi; i++) {
          if (a.alive[i] && a.sp[i] === iv.species && this.rng.next() < iv.fraction) { this.die(i, 'culled'); n++; }
        }
        this.event('culled', iv.species, 0, 0, n, iv.fraction);
        break;
      }
      case 'remove': {
        let n = 0;
        for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === iv.species) { this.die(i, 'removed'); n++; }
        if (iv.species === Sp.Wolf) for (let pk = 0; pk < MAX_PACKS; pk++) this.packAlive[pk] = 0;
        this.everPresent[iv.species] = 0;
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
      case 'plague': {
        let n = 0;
        for (let i = 0; i < a.hi; i++) {
          if (a.alive[i] && a.sp[i] === iv.species && this.rng.next() < iv.fraction) { a.infected[i] = this.p.diseaseTicks; n++; }
        }
        this.event('plague', iv.species, 0, 0, n, 0);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ output

  populations(): number[] {
    const out = new Array(SPECIES_COUNT).fill(0);
    const a = this.a;
    for (let i = 0; i < a.hi; i++) if (a.alive[i]) out[a.sp[i]]++;
    return out;
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
    let juvBison = 0, infBison = 0;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i]) continue;
      const s = a.sp[i];
      gsum[s] += a.gen[i];
      for (let g = 0; g < NG; g++) tsum[s * NG + g] += a.genes[i * NG + g];
      if (s === Sp.Bison) {
        if (a.age[i] < this.p.species[s].matureAge) juvBison++;
        if (a.infected[i] > 0) infBison++;
      }
    }
    row.gen_bison = pops[Sp.Bison] ? gsum[Sp.Bison] / pops[Sp.Bison] : 0;
    row.gen_wolf = pops[Sp.Wolf] ? gsum[Sp.Wolf] / pops[Sp.Wolf] : 0;
    row.gen_pronghorn = pops[Sp.Deer] ? gsum[Sp.Deer] / pops[Sp.Deer] : 0;
    const traits: [number, number][] = [[Sp.Bison, G_SPEED], [Sp.Bison, G_SIZE], [Sp.Bison, G_COAT], [Sp.Bison, G_SIGHT], [Sp.Bison, G_HERD],
      [Sp.Wolf, G_SPEED], [Sp.Wolf, G_SIZE], [Sp.Wolf, G_COAT], [Sp.Wolf, G_SIGHT], [Sp.Deer, G_SPEED], [Sp.Deer, G_COAT]];
    for (const [s, g] of traits) {
      row[`trait_${SPECIES_KEYS[s]}_${GENE_NAMES[g]}`] = pops[s] ? tsum[s * NG + g] / pops[s] : NaN;
    }
    row.juv_bison = juvBison;
    row.infected_bison = infBison;
    row.kills = this.cKills;
    row.kills_pronghorn = this.cKillsDeer;
    row.strife_wolf = this.cStrife;
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
    let packs = 0;
    for (let pk = 0; pk < MAX_PACKS; pk++) packs += this.packAlive[pk];
    row.packs = packs;
    row.carcasses = this.cN;
    row.drought = this.env.droughtTicks > 0 ? 1 : 0;
    this.cKills = 0;
    this.cKillsDeer = 0;
    this.cStrife = 0;
    this.cChases = 0;
    this.cGiveUps = 0;
    this.cBirths.fill(0);
    this.cStarve.fill(0);
    this.cOld.fill(0);
    this.cKilled.fill(0);
    this.cThirst.fill(0);
    this.cStarveJuv = 0;
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
      if (a.infected[i] > 0) f |= F_INFECTED;
      if (a.male[i]) f |= F_MALE;
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
    return {
      tick: this.tick, env: { ...this.env.state }, count: k, ids, agents: out, carcassCount: this.cN, carcasses: car, veg,
      pop: Int32Array.from(this.populations()),
    };
  }
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
