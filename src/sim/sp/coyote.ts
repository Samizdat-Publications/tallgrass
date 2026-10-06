// Coyotes (V2-PLAN.md S5): a small, smart mesopredator that lives on hares, prairie dogs, carrion and pronghorn fawns, in pairs
// that hold a den and a range, and that wolves keep down.
//
// Thinking (every 3 ticks), in priority order (water and a pup's keeping to its mother come in between, see think()):
//   1. Danger. A wolf on the move within 40 m means flee (a wolf lying up, feeding or drinking only within 16 m). A coyote at a
//      carcass holds on until the wolf is within 25 m, a starving one (energy under 0.3) until it is within 8 m.
//   2. Carrion within sight and the range of the den, unless any wolf is within 30 m. Not older than 500 ticks.
//   3. Fawns. A hidden pronghorn fawn within 40 m may be found (limited by its coat against the ground), then stalked and pounced on.
//   4. Small prey, below coyoteHuntHunger. Scan the coarse hare-plus-dog cells around, climb to the best (inside the range of the
//      den); St.Stalk standing still is "mousing", one SmallPrey.take attempt per tick, and after 150 ticks without a catch it moves on.
//      With the small-prey web off, mousing is the flat trickle the wolf's mousing uses (coyoteSmallGame).
//   5. Otherwise lie up at the den, or now and then patrol the range.
//
// Pairs and dens. An adult with no mate looks for the nearest unpaired adult of the other sex within 300 m, walks to it, and pairs
// when they are within 40 m. A pair needs a den: a spot at least coyoteDenSpacing from every coyote den and at least coyoteWolfAvoid
// from every wolf den. Pairs breed at the wolves' spring tick (Sim.stepOne calls step()).
//   litter = round(coyote.litter / calendarScale x foodIndex x the female's litter gene)
// where foodIndex is the female's intake over the last valley year (an exponential average of the energy she took in per tick,
// counted before the cap at full, so a rich year counts for more than a merely adequate one) in units of coyoteFoodRef x metabolism,
// clamped to 0.4..1.4. Carrion counts only coyoteCarrionShare of its energy (0 by default), so the litters follow the live prey (hares,
// prairie dogs) and not the carcasses the wolves leave. A boom or crash in the hares shows up in the litters a year later: the lag that
// makes coyotes follow hares. (Calibration, S5 screens: with carrion counted in full, or with hares worth a quarter of the energy bar,
// the coyotes lived on carrion and fawns and the hares never felt them; see smallprey.ts GAIN.coyote and params coyote*.)
// Pups follow their mother until coyotePupDenAge and draw energy from her and her mate (half of what they take is charged to the parent).
//
// Pup dispersal (documented decision): at one valley year of age a pup leaves its parents. It takes a random free spot (the den rules
// above) anywhere in the valley and becomes a settler who seeks a mate. With no free spot it emigrates through the nearest corridor
// when openPrairie is on, and otherwise stays as a floater (no den, no breeding, scavenging and mousing wherever it is; it still looks
// for a den every 30 ticks). Floaters older than coyoteOutAfter base years leave when openPrairie is on. A den that ends up within
// coyoteWolfAvoid of a (new) wolf den is moved when a free spot exists within 200 m, and given up otherwise (at the spring tick).
//
// Open prairie. With openPrairie and coyoteInRate > 0 a pair walks in from the nearest corridor to a free den spot (every 100 ticks,
// at coyoteInRate per base year scaled by how rich the hares are against their five-year mean, tripled while under 4 coyotes live),
// but only once coyotes have lived in the valley (Coyotes.seen), so a default valley never grows coyotes out of nothing.
//
// Wolves. A wolf within 3 m of a coyote kills it with chance coyoteKilledByWolf per 20 ticks (wolfKillCheck, called from the sim's
// liveWolf every tick as the equivalent per-tick hazard), when the coyote is at a carcass or inside the wolf's core (within 0.5 x
// wolfTerritory of its den). The dead coyote leaves a carcass for the ravens (and for other coyotes) but not for wolves.
//
// Determinism: every draw made here comes from a private generator, new Rng(hashSeed(seed + ':coyote')), except the births and
// gene mixing inside the sim's birth(), which use the main stream and only run when coyotes exist. Nothing forks the main stream.
// Per-animal state lives in slot-indexed arrays here, reset when the slot's id changes, so nothing is added to Agents.
import { G_COAT, G_LITTER, G_SIGHT, G_SIZE, G_SPEED, NG, type Agents } from '../agents';
import { COYOTE_GROUP_BASE, type Disease } from '../disease';
import type { Environment } from '../env';
import type { BucketGrid } from '../grid';
import type { Params, SpeciesParams } from '../params';
import { hashSeed, Rng } from '../rng';
import type { SimEventKind } from '../sim';
import type { Hoppers } from '../hoppers';
import { PREF, type SmallPrey } from '../smallprey';
import { BASE_YEAR_TICKS, Sp, St, YEAR_TICKS } from '../types';

/** The food index is clamped to this range. */
export const FOOD_MIN = 0.4;
export const FOOD_MAX = 1.4;
/** Largest litter. */
export const LITTER_MAX = 8;
/** How far (m) a coyote looks for a hidden fawn, and for a mate. */
const FAWN_RANGE = 40;
/** A fawn chase is given up after this many ticks (the fawn runs with its herd), or when it has led the coyote this far (x territory) from its den;
 *  after a failed chase the coyote does not look for another fawn for FAWN_COOL ticks. */
const FAWN_CHASE_MAX = 90;
const FAWN_LEASH = 1.5;
const FAWN_COOL = 240;
/** Small prey: how many coarse cells around it a coyote scans, the least density (hares plus dogs per cell) worth standing for, and the
 *  ticks it mouses in one spot without a catch before it moves on. */
const HUNT_REACH = 4;
const MOUSE_MIN = 0.3;
const MOUSE_PATIENCE = 150;
/** A cell's grasshopper density counts this many hares-worth in the coyote's choice of where to mouse (S12). */
const HOP_PULL = 1.5;
const MATE_RANGE = 300;
/** Two unpaired adults this close pair up. */
const PAIR_DIST = 40;
/** A pup draws from a parent within this many metres; the parent pays this share of what the pup takes (the pup's body is smaller). */
const FEED_RANGE = 12;
const PUP_COST = 0.5;
/** Wolf proximity that triggers the kill roll (m), and the window (ticks) over which coyoteKilledByWolf is the chance of a kill. */
const KILL_RANGE = 3;
export const KILL_EVERY = 20;
/** Per-tick kill chance equivalent to "coyoteKilledByWolf per KILL_EVERY ticks" (a wolf rolls every tick it stands within reach). */
export function killHazard(perWindow: number): number {
  return perWindow <= 0 ? 0 : perWindow >= 1 ? 1 : 1 - Math.pow(1 - perWindow, 1 / KILL_EVERY);
}
/** Distance a free den spot is looked for from a pair that has lost its den (m). */
const RELOCATE_RANGE = 200;
const SETTLE_RANGE = 150;
/** Carrion hunger line, as for wolves; the oldest carcass (ticks) a coyote will feed on; how far from home (x territory) it will go for one. */
const CARRION_HUNGER = 0.93;
const CARRION_MAX_AGE = 500;
const CARRION_LEASH = 1.3;
/** How long (ticks) a coyote runs after seeing a wolf. */
const FLEE_TICKS = 14;
/** A coyote starts for the water when its hydration falls under this. */
const THIRSTY = 0.4;
/** A wolf that is resting, feeding or drinking frightens a coyote only within this share of the usual distance. */
const CALM_SHARE = 0.4;
/** Coyotes (and wolves) over their five-year means that count as a release, and the least spacing between events (valley years). */
const MESO_COYOTE_RATIO = 2;
const MESO_WOLF_RATIO = 0.5;
const MESO_MEAN_YEARS = 5;
const MESO_SPACING_YEARS = 10;

export interface CoyoteHost {
  readonly tick: number;
  readonly size: number;
  readonly pred: BucketGrid;
  readonly prey: BucketGrid;
  readonly predList: Int32Array;
  readonly predN: number;
  readonly pop: Int32Array;
  readonly groundB: number;
  readonly small: SmallPrey | null;
  /** Grasshoppers (S12), null unless params.grasshoppers is on: a mousing coyote eats them, and thick patches draw it. */
  readonly hoppers: Hoppers | null;
  /** Multiplier on sight this tick (1; less in a dust storm, S12). */
  readonly visMul: number;
  readonly dis: Disease;
  readonly cN: number;
  readonly cX: Float32Array;
  readonly cY: Float32Array;
  readonly cMeat: Float32Array;
  readonly packAlive: Uint8Array;
  readonly packDenX: Float32Array;
  readonly packDenY: Float32Array;
  readonly yearTick: number;
  /** Nearest carcass with meat left, within maxD and not older than maxAge ticks; -1 when none. */
  nearestCarcass(x: number, y: number, maxD: number, maxAge: number): number;
  isWater(x: number, y: number): boolean;
  grassAt(x: number, y: number): number;
  /** Fills out[0], out[1] with the unit vector toward the nearest water and out[2] with the distance to it (m). */
  water(x: number, y: number, out: Float32Array): void;
  /** Aging, hunger and thirst; false when the animal died. */
  vitals(i: number): boolean;
  birth(mother: number, father: number, x: number, y: number): number;
  /** A predator kill (the fawn leaves a carcass). */
  kill(i: number): void;
  /** Killed by a wolf: leaves a carcass that wolves do not feed on. */
  killedByWolf(i: number): void;
  beginEmigration(i: number): void;
  event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void;
  logStory(i: number, kind: 'birth' | 'dispersed' | 'chase' | 'kill' | 'fled', a?: number): void;
}

export class Coyotes {
  readonly rng: Rng;
  private readonly P: SpeciesParams;
  private readonly killP: number;
  // per-slot state (reset when the slot's animal id changes)
  private cap = 0;
  private sid = new Uint32Array(0);
  private partner = new Int32Array(0);
  private partnerId = new Uint32Array(0);
  private hasDen = new Uint8Array(0);
  private denX = new Float32Array(0);
  private denY = new Float32Array(0);
  /** Family key: shared by a pair and its pups until the pups disperse. 0 = none. */
  private fam = new Int32Array(0);
  /** 0 for a pup that has not yet left its parents. */
  private dispersed = new Uint8Array(0);
  /** Exponential average of the energy taken in per tick over a valley year. */
  private intake = new Float32Array(0);
  /** Ticks a coyote with no den has wandered. */
  private wand = new Int32Array(0);
  /** 1 while the coyote is walking toward a possible mate (a.tx, a.ty). */
  private seeking = new Uint8Array(0);
  /** Ticks spent mousing in one place since the last catch. */
  private mouseT = new Int32Array(0);
  /** Ticks the coyote has been after its current fawn, and the ticks before it will look for another (a failed chase wears it out). */
  private chaseT = new Int32Array(0);
  private fawnCool = new Int32Array(0);
  private famSerial = 0;
  // scratch for the den list
  private dxs = new Float32Array(256);
  private dys = new Float32Array(256);
  // counters since the last sample()
  private cWolfKills = 0;
  private cFawns = 0;
  private cMouse = 0;
  private cCarrion = 0;
  private cLitters = 0;
  private bestLitter = 0;
  // mesoRelease tracking
  /** The last five valley years of coyote and wolf counts, one sample per 50 ticks (a ring), for the five-year means. */
  private histCoy = new Float32Array(0);
  private histWolf = new Float32Array(0);
  private histN = 0;
  private histI = 0;
  /** The highest five-year wolf mean seen: the wolves' own mean falls to 0 once they have been gone five years, and a valley that lost its wolves still counts as released. */
  private wolfPeak = 0;
  private lastRelease = -1e9;
  // prey index (hares against their five-year mean)
  private hareEma = 0;
  /** True once a coyote has lived in the valley (arrivals from the prairie are only for a species that has been here). */
  seen = false;

  constructor(
    private readonly a: Agents,
    private readonly p: Params,
    private readonly env: Environment,
    seed: number,
    private readonly h: CoyoteHost,
    private readonly sp: number = Sp.Coyote,
  ) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:coyote`));
    this.P = p.species[sp];
    this.killP = killHazard(p.coyoteKilledByWolf);
  }

  // ------------------------------------------------------------------ per-slot state

  private grow(cap: number): void {
    const g = <T extends { set(a: ArrayLike<number>): void }>(C: new (n: number) => T, prev: T): T => {
      const n = new C(cap);
      n.set(prev as unknown as ArrayLike<number>);
      return n;
    };
    this.sid = g(Uint32Array, this.sid);
    this.partner = g(Int32Array, this.partner);
    this.partnerId = g(Uint32Array, this.partnerId);
    this.hasDen = g(Uint8Array, this.hasDen);
    this.denX = g(Float32Array, this.denX);
    this.denY = g(Float32Array, this.denY);
    this.fam = g(Int32Array, this.fam);
    this.dispersed = g(Uint8Array, this.dispersed);
    this.intake = g(Float32Array, this.intake);
    this.wand = g(Int32Array, this.wand);
    this.seeking = g(Uint8Array, this.seeking);
    this.mouseT = g(Int32Array, this.mouseT);
    this.chaseT = g(Int32Array, this.chaseT);
    this.fawnCool = g(Int32Array, this.fawnCool);
    this.cap = cap;
  }

  /** Make sure slot i's state belongs to the animal that is in it now. A fresh coyote is an adult with no mate, no den and a food index of 1. */
  private ensure(i: number): void {
    if (i >= this.cap) this.grow(Math.max(this.a.cap, i + 1));
    if (this.sid[i] === this.a.id[i]) return;
    this.sid[i] = this.a.id[i];
    this.partner[i] = -1;
    this.partnerId[i] = 0;
    this.hasDen[i] = 0;
    this.fam[i] = 0;
    this.dispersed[i] = 1;
    this.intake[i] = this.P.metabolism * this.p.coyoteFoodRef;
    this.wand[i] = 0;
    this.seeking[i] = 0;
    this.mouseT[i] = 0;
    this.chaseT[i] = 0;
    this.fawnCool[i] = 0;
  }

  /** The coyote's mate (slot), or -1. */
  /** The slot of i's mate, or -1 (public for the inspector's Pair chip). */
  mateOf(i: number): number {
    const m = this.partner[i];
    const a = this.a;
    if (m < 0 || !a.same(m, this.partnerId[i]) || a.sp[m] !== this.sp) return -1;
    return m;
  }

  /** Disease group: the coyote's family, offset so it never collides with a wolf pack. -1 for a coyote with no family. */
  groupOf(i: number): number {
    this.ensure(i);
    return this.fam[i] > 0 ? COYOTE_GROUP_BASE + this.fam[i] : -1;
  }

  /** Food index of coyote i (0.4 to 1.4): the smoothed intake over the last valley year against coyoteFoodRef x metabolism. */
  foodIndex(i: number): number {
    this.ensure(i);
    const f = this.intake[i] / (this.P.metabolism * this.p.coyoteFoodRef);
    return f < FOOD_MIN ? FOOD_MIN : f > FOOD_MAX ? FOOD_MAX : f;
  }

  /** Litter size for a female with food index fi and litter gene g: round(litter / calendarScale x fi x g), 0 to LITTER_MAX. */
  litterSize(fi: number, gene: number): number {
    const n = Math.round((this.P.litter / this.p.calendarScale) * fi * gene);
    return n < 0 ? 0 : n > LITTER_MAX ? LITTER_MAX : n;
  }

  // ------------------------------------------------------------------ dens and spots

  /** Distance from (x, y) to the nearest living wolf den. Infinity with no wolf packs. */
  wolfDenDist(x: number, y: number): number {
    const h = this.h;
    let best = Infinity;
    for (let pk = 0; pk < h.packAlive.length; pk++) {
      if (!h.packAlive[pk]) continue;
      const d = Math.hypot(h.packDenX[pk] - x, h.packDenY[pk] - y);
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * A free den spot: at least coyoteDenSpacing from every coyote den (except those of family `ownFam`) and at least coyoteWolfAvoid
   * from every wolf den, on dry land inside the valley. Looks within radius R of (cx, cy), or anywhere when R <= 0. Null when 40 tries find none.
   */
  freeSpot(cx: number, cy: number, R: number, ownFam = 0): [number, number] | null {
    const a = this.a, h = this.h, p = this.p, rng = this.rng;
    let n = 0;
    for (let j = 0; j < a.hi; j++) {
      if (!a.alive[j] || a.sp[j] !== this.sp) continue;
      this.ensure(j);
      if (!this.hasDen[j] || (ownFam > 0 && this.fam[j] === ownFam)) continue;
      if (n >= this.dxs.length) {
        const nx = new Float32Array(this.dxs.length * 2), ny = new Float32Array(this.dys.length * 2);
        nx.set(this.dxs); ny.set(this.dys);
        this.dxs = nx; this.dys = ny;
      }
      this.dxs[n] = this.denX[j];
      this.dys[n] = this.denY[j];
      n++;
    }
    const size = h.size, margin = 30;
    const s2 = p.coyoteDenSpacing * p.coyoteDenSpacing, w2 = p.coyoteWolfAvoid * p.coyoteWolfAvoid;
    for (let t = 0; t < 40; t++) {
      let x: number, y: number;
      if (R > 0) {
        const ang = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * R;
        x = cx + Math.cos(ang) * r;
        y = cy + Math.sin(ang) * r;
      } else {
        x = rng.range(margin, size - margin);
        y = rng.range(margin, size - margin);
      }
      if (x < margin || y < margin || x > size - margin || y > size - margin) continue;
      if (h.isWater(x, y)) continue;
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        const dx = this.dxs[k] - x, dy = this.dys[k] - y;
        if (dx * dx + dy * dy < s2) ok = false;
      }
      if (!ok) continue;
      for (let pk = 0; pk < h.packAlive.length && ok; pk++) {
        if (!h.packAlive[pk]) continue;
        const dx = h.packDenX[pk] - x, dy = h.packDenY[pk] - y;
        if (dx * dx + dy * dy < w2) ok = false;
      }
      if (ok) return [x, y];
    }
    return null;
  }

  /** Give coyote i (and its mate) the den at (x, y). */
  private setDen(i: number, x: number, y: number): void {
    this.ensure(i);
    this.hasDen[i] = 1;
    this.denX[i] = x;
    this.denY[i] = y;
    this.wand[i] = 0;
    const m = this.mateOf(i);
    if (m >= 0) {
      this.hasDen[m] = 1;
      this.denX[m] = x;
      this.denY[m] = y;
      this.wand[m] = 0;
      this.fam[m] = this.fam[i];
    }
  }

  private clearDen(i: number): void {
    this.ensure(i);
    this.hasDen[i] = 0;
    const m = this.mateOf(i);
    if (m >= 0) this.hasDen[m] = 0;
  }

  /**
   * An unpaired adult looks for the nearest unpaired adult of the other sex within MATE_RANGE. Within PAIR_DIST they pair, taking the
   * female's den, else the male's, else a new free spot near them; farther off, the coyote sets off toward the other (a.tx, a.ty), so
   * mates whose dens lie a few hundred metres apart still find each other.
   */
  private tryPair(i: number): void {
    const a = this.a;
    const x = a.x[i], y = a.y[i];
    let best = -1, bd = MATE_RANGE * MATE_RANGE;
    for (let j = 0; j < a.hi; j++) {
      if (j === i || !a.alive[j] || a.sp[j] !== this.sp || a.male[j] === a.male[i] || a.age[j] < this.P.matureAge) continue;
      if (a.state[j] === St.Migrate) continue;
      const dx = a.x[j] - x, dy = a.y[j] - y, d2 = dx * dx + dy * dy;
      if (d2 >= bd) continue;
      this.ensure(j);
      if (!this.dispersed[j] || this.mateOf(j) >= 0) continue;
      bd = d2; best = j;
    }
    if (best < 0) return;
    if (bd > PAIR_DIST * PAIR_DIST) {
      a.tx[i] = a.x[best]; a.ty[i] = a.y[best];
      this.seeking[i] = 1;
      return;
    }
    const f = a.male[i] ? best : i, m = a.male[i] ? i : best;
    let den: [number, number] | null = null;
    if (this.hasDen[f]) den = [this.denX[f], this.denY[f]];
    else if (this.hasDen[m]) den = [this.denX[m], this.denY[m]];
    else den = this.freeSpot((a.x[i] + a.x[best]) / 2, (a.y[i] + a.y[best]) / 2, 60);
    if (den === null) return; // no room to raise pups: they stay apart
    this.partner[i] = best; this.partnerId[i] = a.id[best];
    this.partner[best] = i; this.partnerId[best] = a.id[i];
    this.fam[i] = this.fam[best] = ++this.famSerial;
    this.seeking[i] = this.seeking[best] = 0;
    a.tx[i] = a.ty[i] = a.tx[best] = a.ty[best] = 0;
    this.setDen(i, den[0], den[1]);
  }

  /** A coyote with no den looks for a free spot within SETTLE_RANGE and takes it (with its mate). */
  private settle(i: number): void {
    const a = this.a;
    const spot = this.freeSpot(a.x[i], a.y[i], SETTLE_RANGE);
    if (spot !== null) {
      if (this.fam[i] === 0) this.fam[i] = ++this.famSerial;
      this.setDen(i, spot[0], spot[1]);
    }
  }

  /** A pup reaches a valley year: it leaves its parents for a free spot, or emigrates, or floats. */
  private disperse(i: number): void {
    const h = this.h;
    this.dispersed[i] = 1;
    this.hasDen[i] = 0;
    this.fam[i] = 0;
    this.partner[i] = -1;
    this.partnerId[i] = 0;
    h.logStory(i, 'dispersed');
    const spot = this.freeSpot(0, 0, 0);
    if (spot !== null) {
      this.fam[i] = ++this.famSerial;
      this.hasDen[i] = 1;
      this.denX[i] = spot[0];
      this.denY[i] = spot[1];
      return;
    }
    if (this.p.openPrairie > 0) h.beginEmigration(i);
    // otherwise a floater: wanders, scavenges and mouses, and may find a den later (settle)
  }

  // ------------------------------------------------------------------ spring: breeding and moving out of the wolves' way

  /** The wolves' spring tick: pairs breed, and dens that have ended up beside a wolf den are moved. Call once per valley year. */
  breed(): void {
    const a = this.a, h = this.h, p = this.p, P = this.P;
    // 1. wolves may have budded a pack next door: move the den or give it up
    const moved = new Set<number>();
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== this.sp) continue;
      this.ensure(i);
      if (!this.hasDen[i] || !this.dispersed[i] || a.age[i] < P.matureAge || moved.has(this.fam[i])) continue;
      if (this.wolfDenDist(this.denX[i], this.denY[i]) >= p.coyoteWolfAvoid) continue;
      moved.add(this.fam[i]);
      const spot = this.freeSpot(this.denX[i], this.denY[i], RELOCATE_RANGE, this.fam[i]);
      if (spot !== null) this.setDen(i, spot[0], spot[1]);
      else this.clearDen(i);
    }
    // 2. pairs with a den breed
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== this.sp || a.male[i] || a.age[i] < P.matureAge || a.state[i] === St.Migrate) continue;
      this.ensure(i);
      const m = this.mateOf(i);
      if (m < 0 || !this.hasDen[i] || !this.dispersed[i] || a.energy[i] < 0.3) continue;
      const litter = this.litterSize(this.foodIndex(i), a.genes[i * NG + G_LITTER]);
      if (litter <= 0) continue;
      const dx = this.denX[i], dy = this.denY[i];
      for (let k = 0; k < litter; k++) {
        const c = h.birth(i, m, dx + this.rng.range(-2, 2), dy + this.rng.range(-2, 2));
        this.ensure(c);
        this.dispersed[c] = 0;
        this.hasDen[c] = 1;
        this.denX[c] = dx;
        this.denY[c] = dy;
        this.fam[c] = this.fam[i];
        a.energy[c] = 0.55;
      }
      this.cLitters++;
      h.logStory(i, 'birth', litter);
      if (litter > this.bestLitter) {
        this.bestLitter = litter;
        h.event('coyotePups', this.sp, dx, dy, litter, 0);
      }
    }
  }

  /** Once per 50 ticks: coyotes at twice their five-year mean while wolves are at half theirs raise mesoRelease (at most once per 10 years). */
  trackRelease(t: number): void {
    const h = this.h;
    const coy = h.pop[this.sp], wolf = h.pop[Sp.Wolf];
    const len = Math.max(1, Math.round((MESO_MEAN_YEARS * YEAR_TICKS) / 50));
    if (this.histCoy.length !== len) {
      this.histCoy = new Float32Array(len);
      this.histWolf = new Float32Array(len);
      this.histN = 0;
      this.histI = 0;
    }
    // the five-year means are over the samples before this one; the window must be full before anything can be raised
    let mc = 0, mw = 0;
    const full = this.histN === len;
    if (full) {
      for (let k = 0; k < len; k++) { mc += this.histCoy[k]; mw += this.histWolf[k]; }
      mc /= len;
      mw /= len;
    }
    this.histCoy[this.histI] = coy;
    this.histWolf[this.histI] = wolf;
    this.histI = (this.histI + 1) % len;
    if (this.histN < len) this.histN++;
    if (mw > this.wolfPeak) this.wolfPeak = mw;
    if (!full || t - this.lastRelease < MESO_SPACING_YEARS * YEAR_TICKS) return;
    if (mc < 4 || this.wolfPeak < 1) return;
    if (coy >= MESO_COYOTE_RATIO * mc && wolf <= MESO_WOLF_RATIO * Math.max(mw, this.wolfPeak)) {
      this.lastRelease = t;
      const a = this.a;
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === this.sp) { sx += a.x[i]; sy += a.y[i]; n++; }
      h.event('mesoRelease', this.sp, n ? sx / n : 0, n ? sy / n : 0, coy, wolf);
    }
  }

  /** Per-tick driver, called by the sim while coyotes exist (after the wolves' own bookkeeping). */
  step(t: number): void {
    this.seen = true;
    if (this.h.yearTick === 0) this.breed();
    if (t % 50 === 0) this.trackRelease(t);
  }

  /** Hares now against their five-year mean, 0.25 to 2 (1 when the small-prey web is off). Kept up to date by tickPrey(). */
  preyIndex(): number {
    const sm = this.h.small;
    if (sm === null || this.hareEma <= 0) return 1;
    const r = sm.hareTotal() / this.hareEma;
    return r < 0.25 ? 0.25 : r > 2 ? 2 : r;
  }

  /** Once per 50 ticks (every tick it is called is fine): move the hare average. Runs whether or not coyotes live, so arrivals see a settled mean. */
  tickPrey(t: number): void {
    const sm = this.h.small;
    if (sm === null || t % 50 !== 0) return;
    const hares = sm.hareTotal();
    if (this.hareEma <= 0) this.hareEma = hares;
    else this.hareEma += (hares - this.hareEma) * (50 / (MESO_MEAN_YEARS * YEAR_TICKS));
  }

  /** A free spot for a pair walking in from the prairie, or null when the valley has no room (the den rules). */
  arrivalSpot(): [number, number] | null {
    return this.freeSpot(0, 0, 0);
  }

  /** Make the two arrivals f (female) and m (male) a pair on the den at (x, y). */
  adoptPair(f: number, m: number, x: number, y: number): void {
    const a = this.a;
    this.ensure(f);
    this.ensure(m);
    a.male[f] = 0;
    a.male[m] = 1;
    this.partner[f] = m; this.partnerId[f] = a.id[m];
    this.partner[m] = f; this.partnerId[m] = a.id[f];
    this.fam[f] = this.fam[m] = ++this.famSerial;
    this.setDen(f, x, y);
    this.seen = true;
  }

  // ------------------------------------------------------------------ wolves

  /**
   * The nearest living wolf that counts as a danger at (x, y), or -1. A wolf on the move counts within maxD; a wolf lying up, feeding
   * or drinking only within CALM_SHARE x maxD (coyotes keep a respectful distance from a sleeping pack, but do not run from it).
   */
  private readonly wbuf = new Float32Array(3);
  private nearestWolf(x: number, y: number, maxD: number, calm = CALM_SHARE): number {
    const a = this.a, g = this.h.pred, nb = g.nb, bs = g.bs;
    const rr = Math.ceil(maxD / bs);
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    let best = -1, bd = maxD * maxD;
    const calm2 = calm * calm * maxD * maxD;
    for (let yy = Math.max(0, by - rr); yy <= Math.min(nb - 1, by + rr); yy++) {
      for (let xx = Math.max(0, bx - rr); xx <= Math.min(nb - 1, bx + rr); xx++) {
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          if (!a.alive[j] || a.sp[j] !== Sp.Wolf) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y, d2 = dx * dx + dy * dy;
          if (d2 >= bd) continue;
          const sj = a.state[j];
          if ((sj === St.Rest || sj === St.Eat || sj === St.Drink || sj === St.Idle) && d2 > calm2) continue;
          bd = d2; best = j;
        }
      }
    }
    return best;
  }

  /**
   * Wolf w rolls for any coyote within 3 m (call every tick for every wolf). The chance is coyoteKilledByWolf per 20 ticks spent within
   * reach, as a per-tick hazard (the plan's "once per 20 ticks" roll made equivalent, so a short meeting is not missed by the timer).
   * It applies when the coyote is eating at a carcass or the wolf is inside its own core (within 0.5 x wolfTerritory of its den;
   * `denX/denY` is the wolf pack's den, or NaN for a loner). Returns true when a coyote was killed.
   */
  wolfKillCheck(w: number, denX: number, denY: number): boolean {
    const a = this.a, g = this.h.pred, nb = g.nb, bs = g.bs;
    const x = a.x[w], y = a.y[w];
    const inCore = Number.isFinite(denX) && Math.hypot(x - denX, y - denY) <= 0.5 * this.p.wolfTerritory;
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    for (let yy = Math.max(0, by - 1); yy <= Math.min(nb - 1, by + 1); yy++) {
      for (let xx = Math.max(0, bx - 1); xx <= Math.min(nb - 1, bx + 1); xx++) {
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          if (!a.alive[j] || a.sp[j] !== this.sp) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y;
          if (dx * dx + dy * dy > KILL_RANGE * KILL_RANGE) continue;
          if (!inCore && a.state[j] !== St.Eat) continue;
          if (this.rng.next() < this.killP) {
            this.cWolfKills++;
            this.h.killedByWolf(j);
            return true;
          }
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ thinking

  think(i: number): void {
    const a = this.a, p = this.p, P = this.P, h = this.h, rng = this.rng;
    this.ensure(i);
    const x = a.x[i], y = a.y[i], o = i * NG;
    const juvenile = a.age[i] < P.matureAge;
    const spdGene = a.genes[o + G_SPEED] / Math.pow(a.genes[o + G_SIZE], 0.25);
    const run = P.runSpeed * spdGene * (a.stamina[i] > 0.05 ? 1 : 0.35) * (h.dis.mangeOn ? h.dis.mangeSpeed(i) : 1);
    const walk = P.walkSpeed, trot = walk * 1.6;
    const energy = a.energy[i];
    const eating = a.state[i] === St.Eat;
    let dvx = 0, dvy = 0;
    let state: number = St.Idle;
    const done = (): void => { a.dvx[i] = dvx; a.dvy[i] = dvy; a.state[i] = state; };

    if (a.cdv[i] > 0 && h.dis.cdvOn) h.dis.packSpread(i, h.predList, h.predN);

    // 1. danger: a wolf within 40 m means flee; an eating coyote holds on to 25 m, a starving one to 8 m
    const dangerD = eating ? (energy < 0.3 ? 8 : 25) : 40;
    const w = this.nearestWolf(x, y, dangerD);
    if (w >= 0) {
      const dx = x - a.x[w], dy = y - a.y[w], d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      if (a.flee[i] === 0) h.logStory(i, 'fled', Sp.Wolf);
      a.fleeX[i] = dx / d;
      a.fleeY[i] = dy / d;
      a.flee[i] = FLEE_TICKS;
      a.target[i] = -1;
    }
    if (a.flee[i] > 0) {
      dvx = a.fleeX[i] * run;
      dvy = a.fleeY[i] * run;
      state = St.Flee;
      return done();
    }

    // water comes before anything else but fleeing, unless starving
    if ((a.hydration[i] < THIRSTY && energy > 0.12) || (a.state[i] === St.Drink && a.hydration[i] < 0.97)) {
      h.water(x, y, this.wbuf);
      if (this.wbuf[2] < 3) { state = St.Drink; a.hydration[i] = Math.min(1, a.hydration[i] + 0.06); } else {
        // a small animal with a slow walk starts for the water early, and trots harder when it is dry
        const v = a.hydration[i] < 0.2 ? run * 0.45 : trot * 1.3;
        dvx = this.wbuf[0] * v; dvy = this.wbuf[1] * v; state = St.Walk;
      }
      return done();
    }

    // a pup keeps to its mother (and draws on her; see live())
    const pup = a.age[i] < p.coyotePupDenAge;
    if (pup) {
      const m = a.mother[i];
      if (a.same(m, a.motherId[i]) && a.sp[m] === this.sp) {
        const dx = a.x[m] - x, dy = a.y[m] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        if (d < 60) {
          if (d > 4) { const v = Math.min(walk * 2.2, 0.5 + d * 0.4); dvx = (dx / d) * v; dvy = (dy / d) * v; state = St.Walk; } else state = St.Rest;
          return done();
        }
      }
    }

    // dispersal at one valley year, and the adults' search for a mate and a den
    if (!this.dispersed[i] && a.age[i] >= YEAR_TICKS) {
      this.disperse(i);
      if (a.state[i] === St.Migrate) return;
    }
    if (!juvenile && this.dispersed[i]) {
      if (this.mateOf(i) < 0 && (i + h.tick) % 15 === 0) this.tryPair(i);
      if (!this.hasDen[i]) {
        if ((i + h.tick) % 30 === 0) this.settle(i);
        this.wand[i] += 3;
        if (!this.hasDen[i] && p.openPrairie > 0 && this.wand[i] > p.coyoteOutAfter * BASE_YEAR_TICKS) {
          h.beginEmigration(i);
          return;
        }
      }
    }
    const hasDen = this.hasDen[i] === 1;
    const hx = hasDen ? this.denX[i] : x, hy = hasDen ? this.denY[i] : y;
    const toHome = hasDen ? Math.hypot(hx - x, hy - y) : 0;
    const night = this.env.isNight();
    const sight = P.sight * a.genes[o + G_SIGHT] * (night ? 0.75 : 1) * h.visMul;

    // committed to a fawn: keep after it
    if (a.same(a.target[i], a.targetId[i]) && a.target[i] >= 0) {
      if (this.pursue(i, run, walk)) return;
    }

    // 2. carrion, unless a wolf is within 30 m
    if (energy < CARRION_HUNGER && this.nearestWolf(x, y, 30, 1) < 0) {
      const k = h.nearestCarcass(x, y, sight, CARRION_MAX_AGE);
      if (k >= 0 && (!hasDen || Math.hypot(h.cX[k] - hx, h.cY[k] - hy) <= p.coyoteTerritory * CARRION_LEASH)) {
        const dx = h.cX[k] - x, dy = h.cY[k] - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2.2) { state = St.Eat; a.timer[i] = k; } else { const v = Math.min(run, trot * 1.5, 0.6 + d * 0.5); dvx = (dx / d) * v; dvy = (dy / d) * v; state = St.Walk; }
        return done();
      }
    }

    // 3. fawns: a hidden fawn within 40 m, found by luck against its camouflage
    if (this.fawnCool[i] > 0) this.fawnCool[i] = Math.max(0, this.fawnCool[i] - 3);
    if (energy < 0.95 && !pup && this.fawnCool[i] === 0) {
      const f = this.findFawn(x, y);
      if (f >= 0) {
        a.target[i] = f;
        a.targetId[i] = a.id[f];
        this.chaseT[i] = 0;
        h.logStory(i, 'chase', a.sp[f]);
        if (this.pursue(i, run, walk)) return;
      }
    }

    // 3b. an unpaired adult that has picked out a possible mate goes to find it (unless it is starving)
    if (this.seeking[i]) {
      if (this.mateOf(i) >= 0 || (a.tx[i] === 0 && a.ty[i] === 0)) this.seeking[i] = 0;
      else if (energy > 0.5) {
        const dx = a.tx[i] - x, dy = a.ty[i] - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 8) { dvx = (dx / d) * trot; dvy = (dy / d) * trot; state = St.Walk; return done(); }
        this.seeking[i] = 0;
        a.tx[i] = 0; a.ty[i] = 0;
      }
    }

    // 4. small prey: climb the hare-and-dog gradient inside the range, and mouse where it is rich
    if (energy < p.coyoteHuntHunger) {
      const r = this.hunt(i, x, y, hx, hy, hasDen, walk, trot);
      dvx = r[0]; dvy = r[1]; state = r[2];
      a.target[i] = -1;
      return done();
    }

    // 5. lie up at the den, or patrol the range now and then; a coyote with no den ambles
    if (hasDen) {
      if (a.tx[i] !== 0 || a.ty[i] !== 0) {
        const dx = a.tx[i] - x, dy = a.ty[i] - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 4) { dvx = (dx / d) * walk; dvy = (dy / d) * walk; state = St.Walk; } else { a.tx[i] = 0; a.ty[i] = 0; state = St.Rest; }
      } else if (toHome > 14) {
        dvx = ((hx - x) / toHome) * walk; dvy = ((hy - y) / toHome) * walk; state = St.Walk;
      } else if (!pup && rng.next() < 0.03) {
        const ang = rng.next() * Math.PI * 2, r = (0.3 + 0.6 * rng.next()) * p.coyoteTerritory;
        a.tx[i] = hx + Math.cos(ang) * r; a.ty[i] = hy + Math.sin(ang) * r;
        state = St.Walk;
      } else state = St.Rest;
    } else {
      const ang = a.heading[i] + (rng.next() - 0.5) * 0.8;
      dvx = Math.cos(ang) * walk; dvy = Math.sin(ang) * walk;
      state = St.Walk;
    }
    done();
  }

  /** The best-hidden-fawn-in-reach roll: returns the nearest fawn that is spotted, or -1. */
  private findFawn(x: number, y: number): number {
    const a = this.a, p = this.p, h = this.h, rng = this.rng;
    const g = h.prey, nb = g.nb, bs = g.bs;
    const rr = Math.ceil(FAWN_RANGE / bs);
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    let best = -1, bd = FAWN_RANGE * FAWN_RANGE;
    for (let yy = Math.max(0, by - rr); yy <= Math.min(nb - 1, by + rr); yy++) {
      for (let xx = Math.max(0, bx - rr); xx <= Math.min(nb - 1, bx + rr); xx++) {
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          if (!a.alive[j]) continue;
          const Pj = p.species[a.sp[j]];
          if (Pj.hideAge <= 0 || a.age[j] >= Pj.hideAge) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y, d2 = dx * dx + dy * dy;
          if (d2 >= bd) continue;
          // the fawn's coat against the ground sets how well it hides
          const contrast = Math.abs((1 - a.genes[j * NG + G_COAT]) * 0.75 + 0.1 - h.groundB);
          const seen = Math.max(0.1, 1 - Pj.camo * (1 - (0.6 + 0.8 * contrast)));
          const pf = p.coyoteFawnFind * seen * (1 - Math.sqrt(d2) / (FAWN_RANGE + 5));
          if (rng.next() < pf) { bd = d2; best = j; }
        }
      }
    }
    return best;
  }

  /** Go after the fawn in a.target: sneak up, then pounce. Returns false (target cleared) when the chase is off. */
  private pursue(i: number, run: number, walk: number): boolean {
    const a = this.a;
    const t = a.target[i];
    if (!a.same(t, a.targetId[i])) { a.target[i] = -1; return false; }
    const dx = a.x[t] - a.x[i], dy = a.y[t] - a.y[i], dd = Math.sqrt(dx * dx + dy * dy) + 0.01;
    this.chaseT[i] += 3;
    const far = this.hasDen[i] === 1 && Math.hypot(a.x[i] - this.denX[i], a.y[i] - this.denY[i]) > this.p.coyoteTerritory * FAWN_LEASH;
    if (dd > FAWN_RANGE + 20 || a.stamina[i] < 0.05 || this.chaseT[i] > FAWN_CHASE_MAX || far) {
      a.target[i] = -1;
      this.fawnCool[i] = FAWN_COOL;
      return false;
    }
    const pounce = dd < 9;
    const v = pounce ? run : walk * 2.2;
    a.dvx[i] = (dx / dd) * v;
    a.dvy[i] = (dy / dd) * v;
    a.state[i] = pounce ? St.Chase : St.Stalk;
    return true;
  }

  /**
   * Small prey: returns [dvx, dvy, state]. With the web on, the coyote looks over the coarse cells within HUNT_REACH cells (and, with a
   * den, within the range around it), scores each by its hare-plus-dog density with a small penalty for the walk, and either mouses
   * where it stands (the cell is rich enough and it has not stood there long without a catch) or trots to the best cell. With the web
   * off it mouses on grass, or roams.
   */
  private hunt(i: number, x: number, y: number, hx: number, hy: number, leash: boolean, walk: number, trot: number): [number, number, number] {
    const h = this.h, p = this.p, rng = this.rng;
    const sm = h.small;
    if (sm !== null) {
      const N = sm.cells, cs = sm.cellSize;
      const c = sm.cellOf(x, y), cx = c % N, cy = (c / N) | 0;
      const hop = h.hoppers;
      const dens = (cc: number): number => sm.hare[cc] * PREF.coyote.hare + sm.dog[cc] * PREF.coyote.dog + (hop !== null ? hop.d[cc] * HOP_PULL : 0);
      const here = dens(c);
      const patient = this.mouseT[i] < MOUSE_PATIENCE;
      let best = -1, bestV = patient && here >= MOUSE_MIN ? here * 1.3 + 0.1 : 0.05;
      for (let dy = -HUNT_REACH; dy <= HUNT_REACH; dy++) {
        for (let dx = -HUNT_REACH; dx <= HUNT_REACH; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const ccx = (nx + 0.5) * cs, ccy = (ny + 0.5) * cs;
          if (leash && Math.hypot(ccx - hx, ccy - hy) > p.coyoteTerritory) continue;
          const nc = ny * N + nx;
          const v = dens(nc) / (1 + 0.12 * Math.max(Math.abs(dx), Math.abs(dy)));
          if (v > bestV) { bestV = v; best = nc; }
        }
      }
      if (best >= 0) {
        // a new patch: the patience clock starts again when it gets there
        this.mouseT[i] = 0;
        const tx = ((best % N) + 0.5) * cs - x, ty = (((best / N) | 0) + 0.5) * cs - y, l = Math.sqrt(tx * tx + ty * ty) + 0.01;
        return [(tx / l) * trot, (ty / l) * trot, St.Walk];
      }
      if (here >= MOUSE_MIN && patient) return [0, 0, St.Stalk];
    } else if (h.grassAt(x, y) > 0.15 && this.mouseT[i] < MOUSE_PATIENCE) return [0, 0, St.Stalk];
    // nothing worth mousing here: roam the range (back toward the den when strayed)
    this.mouseT[i] = 0;
    if (leash) {
      const d = Math.hypot(hx - x, hy - y);
      if (d > p.coyoteTerritory * 0.9) return [((hx - x) / d) * walk, ((hy - y) / d) * walk, St.Walk];
    }
    const ang = rng.next() * Math.PI * 2;
    return [Math.cos(ang) * trot, Math.sin(ang) * trot, St.Walk];
  }

  // ------------------------------------------------------------------ living

  /** What the coyote does with this tick's state: eat, mouse, pounce, suckle; then the body's upkeep (aging, hunger) and the intake average. */
  live(i: number): void {
    const a = this.a, p = this.p, P = this.P, h = this.h;
    this.ensure(i);
    let gain = 0;
    const st = a.state[i];
    if (st === St.Migrate) {
      h.vitals(i);
      return;
    }
    if (st === St.Eat) {
      const k = a.timer[i];
      if (k >= 0 && k < h.cN && h.cMeat[k] > 0.02 && Math.abs(h.cX[k] - a.x[i]) < 3 && Math.abs(h.cY[k] - a.y[i]) < 3) {
        const take = Math.min(p.coyoteEatRate, h.cMeat[k]);
        h.cMeat[k] -= take;
        a.energy[i] = Math.min(1, a.energy[i] + take);
        gain += take * p.coyoteCarrionShare;
        this.cCarrion += take;
        if (h.dis.cdvOn) h.dis.onFeed(i);
      }
      a.dvx[i] = 0; a.dvy[i] = 0;
    } else if (st === St.Stalk && !a.same(a.target[i], a.targetId[i])) {
      // mousing
      if (h.small !== null) {
        const g = h.small.take(a.x[i], a.y[i], 'coyote', 1, this.rng);
        if (g > 0) { a.energy[i] = Math.min(1, a.energy[i] + g); gain += g; this.cMouse++; this.mouseT[i] = 0; } else this.mouseT[i]++;
        if (h.hoppers !== null) {
          // a grasshopper surge feeds a mousing coyote (S12)
          const gh = h.hoppers.feed(a.x[i], a.y[i], 'coyote', P.metabolism);
          if (gh > 0) { a.energy[i] = Math.min(1, a.energy[i] + gh); gain += gh; }
        }
      } else {
        const g = P.metabolism * p.coyoteSmallGame;
        a.energy[i] = Math.min(0.7, a.energy[i] + g);
        gain += g;
        this.mouseT[i]++;
      }
    } else if (st === St.Chase || st === St.Stalk) {
      const t = a.target[i];
      if (a.same(t, a.targetId[i])) {
        const dx = a.x[t] - a.x[i], dy = a.y[t] - a.y[i];
        if (dx * dx + dy * dy < 6.25) {
          const Pt = p.species[a.sp[t]];
          const m = a.mother[t];
          const doe = a.same(m, a.motherId[t]) && a.energy[m] > 0.3 && Math.abs(a.x[m] - a.x[t]) < 25 && Math.abs(a.y[m] - a.y[t]) < 25 ? 1 : 0;
          const resist = Pt.toughness * a.genes[t * NG + G_SIZE] * (1 + 0.8 * doe);
          if (this.rng.next() < p.coyoteFawnKill / resist) {
            a.kills[i]++;
            this.cFawns++;
            h.logStory(i, 'kill', a.sp[t]);
            h.kill(t);
            a.target[i] = -1;
          }
        }
      }
    }
    // pups draw on a parent close by (the mother, else her mate), who pays PUP_COST of what the pup takes
    if (a.age[i] < p.coyotePupDenAge && a.energy[i] < 0.95) {
      const m = a.mother[i];
      if (a.same(m, a.motherId[i]) && a.sp[m] === this.sp) {
        let par = m;
        const f = this.mateOf(m);
        if (f >= 0 && a.energy[f] > a.energy[m] && Math.abs(a.x[f] - a.x[i]) < FEED_RANGE && Math.abs(a.y[f] - a.y[i]) < FEED_RANGE) par = f;
        if (a.energy[par] > 0.4 && Math.abs(a.x[par] - a.x[i]) < FEED_RANGE && Math.abs(a.y[par] - a.y[i]) < FEED_RANGE) {
          const take = Math.min(p.coyotePupFeed, 0.95 - a.energy[i]);
          a.energy[i] += take;
          a.energy[par] -= take * PUP_COST;
          gain += take;
        }
      }
    }
    if (!h.vitals(i)) return;
    this.intake[i] += (gain - this.intake[i]) / YEAR_TICKS;
  }

  // ------------------------------------------------------------------ founders and the sample

  /**
   * Lay the founders out as pairs on dens spread over the valley (free spots by the den rules); an odd one out, or a pair that
   * finds no spot, floats. Call once after the sim has spawned `coyote.initial` adults. Changes only coyote slots.
   */
  seedFounders(): void {
    const a = this.a;
    const slots: number[] = [];
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === this.sp) { this.ensure(i); slots.push(i); }
    for (let q = 0; q + 1 < slots.length; q += 2) {
      const f = slots[q], m = slots[q + 1];
      a.male[f] = 0;
      a.male[m] = 1;
      const spot = this.freeSpot(0, 0, 0);
      if (spot === null) continue;
      a.x[f] = spot[0] + this.rng.range(-4, 4); a.y[f] = spot[1] + this.rng.range(-4, 4);
      a.x[m] = spot[0] + this.rng.range(-4, 4); a.y[m] = spot[1] + this.rng.range(-4, 4);
      this.partner[f] = m; this.partnerId[f] = a.id[m];
      this.partner[m] = f; this.partnerId[m] = a.id[f];
      this.fam[f] = this.fam[m] = ++this.famSerial;
      this.setDen(f, spot[0], spot[1]);
    }
  }

  /** Is the pair of the female in slot f paired, with a den? (for tests and the sample) */
  isBreedingFemale(f: number): boolean {
    this.ensure(f);
    return this.a.alive[f] === 1 && this.a.sp[f] === this.sp && !this.a.male[f] && this.mateOf(f) >= 0 && this.hasDen[f] === 1;
  }

  /** Den of coyote i, or null. */
  denOf(i: number): [number, number] | null {
    this.ensure(i);
    return this.hasDen[i] ? [this.denX[i], this.denY[i]] : null;
  }

  /** Test hook: has pup i left its parents? */
  hasDispersed(i: number): boolean {
    this.ensure(i);
    return this.dispersed[i] === 1;
  }

  /** The coyote columns of the time series; counters since the last call are cleared. */
  sampleRow(row: Record<string, number>): void {
    const a = this.a;
    let pairs = 0, floaters = 0, foodSum = 0, foodN = 0;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== this.sp) continue;
      this.ensure(i);
      if (a.age[i] < this.P.matureAge) continue;
      if (!this.hasDen[i]) floaters++;
      if (!a.male[i]) {
        if (this.mateOf(i) >= 0 && this.hasDen[i]) pairs++;
        foodSum += this.foodIndex(i);
        foodN++;
      }
    }
    row.coyote_pairs = pairs;
    row.coyote_floaters = floaters;
    row.coyote_food = foodN ? foodSum / foodN : 0;
    row.coyote_kills_by_wolf = this.cWolfKills;
    row.coyote_fawns = this.cFawns;
    row.coyote_mousing = this.cMouse;
    row.coyote_carrion = this.cCarrion;
    row.coyote_litters = this.cLitters;
    this.cWolfKills = 0;
    this.cFawns = 0;
    this.cMouse = 0;
    this.cCarrion = 0;
    this.cLitters = 0;
  }
}
