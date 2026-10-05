// Raptors (V2-PLAN.md S7): golden eagles, winter visitors that come in through the open prairie, and red-tailed hawks, summer
// residents that nest in a cottonwood and leave in autumn with their young.
//
// ---- For Track R (R5 renders these): what the snapshot says ----------------------------------------------------------------------
// Both species fly, so a.alt (snapshot field 9, metres above the ground) carries the height. The state (St) and altitude say what the bird is doing:
//   St.Fly   (9)  soar, glide or cruise. alt 20 to 95 m. Soaring is a slow wide circle (radius about 20 m) with now and then a straight leg;
//                 the height follows the midday thermal (eagles up to about 95 m, hawks about 60 m; low in the morning, in winter and at dusk).
//                 A bird gliding toward a prey cell holds 20 to 33 m and heads straight for it. A raptor on the way to a perch or a carcass
//                 is also St.Fly, descending.
//   St.Chase (5)  the stoop: a fast dive onto a prey cell, 6 to 40 ticks (about 1 to 6 s), alt falling from the starting height to about 0.8 m
//                 at the end, speed field up to runSpeed (eagle 22, hawk 17 m/s). The last tick is the catch roll. Fold the wings.
//   St.Eat   (6)  on the ground (alt 0 to 0.5 m): either mantling over a catch for 24 ticks right after a successful stoop, or feeding at a
//                 carcass (an eagle at a carcass sits on its centre; ravens within 3 m give way to it).
//   St.Idle  (0)  perched and alert (hunting from the perch). alt is the perch height: 0.92 x the tree's height (a cottonwood is 9 to 17 m;
//                 a hawk's nest tree is at least 11 m), or about 0.2 m when there is no tree within reach (it sits on the ground).
//   St.Rest  (8)  perched and settled: roosting at night, or sated. Same alt as Idle. Nestlings are St.Rest in the nest (alt = nest height,
//                 F_JUVENILE set, smaller body: the snapshot's growth factor).
//   St.Migrate (11) with F_MIGRANT: flying in from, or out to, a border corridor at about 36 to 46 m (arrival and the autumn / spring departures).
// Perch means a tree top only: there is no rock list in the world, so "rock tops" are not used.
// Juveniles (hawk young under matureAge 600 ticks) are F_JUVENILE. Nothing else in the snapshot is special: male flag alternates, coat is the
// species' base darkness (eagle dark, hawk mid), all genes are 1.
//
// ---- Who, when -------------------------------------------------------------------------------------------------------------------
// Everything is keyed on the season position (SEASON_TICKS = 600 / calendarScale; yt = env.yearTick):
//   eagles  arrive at season 2.5 as one loose group of eagleMin to eagleMax (default 2 to 6, richer hares draw more) through a random corridor
//           (needs openPrairie: they are visitors), and all leave at season 0.5 through the nearest corridor (St.Migrate outbound).
//           Event eaglesArrive (sp Eagle, x y the border point, a = how many).
//   hawks   return at season 0.3: hawkPairsMin to hawkPairsMax pairs (default 2 to 4), each to a tall cottonwood (height 11 m or more, nests at
//           least hawkNestSpacing = 140 m apart; the trees of last year's nests are used first), walking in from the corridor nearest the
//           tree. They hatch young at season 0.8 (with a parent at the nest; a pair still flying in hatches them up to half a season later): round(litter / calendarScale x (0.5 + the female's energy)) held to 1..maxLitter (3), so
//           1 to 3 young at the default calendar (litter 4 at calendarScale 2). Nestlings fledge at 200 ticks of age. Every hawk, young
//           included, leaves at season 2.4 (before the eagles arrive), so hawks are absent from late autumn to early spring and the next
//           year's pairs are fresh arrivals (the young do not come back as breeders). Event hawksReturn (sp Hawk, x y the border point,
//           a = pairs). With the open prairie off the pairs still return and leave by the same corridors (corridors are just border points;
//           only the regional gene pool is skipped, and raptors carry no traits).
//   A hawk start (tick 0) that falls inside the hawk season (the sim opens at season 1.8) seeds the pairs already on their nests, with their young
//   if the hatching is past. No event.
//   Departures are silent (no emigrated event): the chronicle gets the two arrival lines.
//
// ---- What they do ----------------------------------------------------------------------------------------------------------------
// Thinking every 4 ticks (the sim calls think), flying every tick (live), in priority order:
//   1. Carcass. An eagle below raptorCarrionHunger (0.5) goes to a carcass in sight (150 m) and eats at raptorEatRate per tick until nearly
//      full (0.97), then sits near it for a while (St.Rest on the ground). A hawk does so only when the small-prey web is off or it is
//      starving (below 0.2). Not at night. Ravens that would feed within 3 m of an eating eagle give way (sim.thinkRaven asks
//      eagleFeedingNear).
//   2. Hunt, when the small-prey web is on (hunting is off without it: with smallPrey off a raptor only scavenges, perches and soars, and a hawk
//      brood will mostly starve): below raptorHuntHunger (0.7), or with a hungry brood, in daylight, not in the pause after a miss. It
//      scores the coarse hare-plus-dog cells (PREF.eagle / PREF.hawk) within 150 m (hawk 100 m, and inside 160 m of its nest), glides to
//      the best (St.Fly at hunt height) and, within 55 m (hawk 40 m), stoops. A perched bird stoops straight from the perch when the
//      cell is within 90 m (hawk 70 m). The catch is one SmallPrey.take at the end of the stoop (effort 1, young 0.5): a hit makes it mantle on the
//      prey (St.Eat 24 ticks); a miss means a 15 to 35 tick pause while it climbs away (it keeps the stoop's speed and eases off). A hawk with young shares the catch: half goes to
//      the nestlings and fledglings (under 420 ticks of age) that are hungry, so a brood raises the pair's hunting.
//   3. Night: perch (St.Rest) in the tree nearest within 250 m, a hawk with a nest on the nest tree.
//   4. Sated: soar when the midday thermal is up, otherwise perch alert (St.Idle); either is held for a while before it is reconsidered.
//
// ---- Determinism and the main stream ---------------------------------------------------------------------------------------------
// Every random draw here comes from a private generator, new Rng(hashSeed(seed + ':raptor')). Spawning goes through the host's spawnRaptor (no
// genes drawn, no regional pool draw), so no raptor code touches the main or the regional stream, and with no other animal in the valley a run
// with raptors makes exactly the main-stream draws of one without. In a full valley the runs still part ways, because the raptors take agent
// slots and that shifts the (slot + tick) phases other species think on; there they change the valley through the hares, the prairie dogs, the
// carcasses and those slots. Per-animal state lives in slot arrays here, reset when the slot's id changes.
import type { Agents } from '../agents';
import type { Environment } from '../env';
import type { Params } from '../params';
import { hashSeed, Rng } from '../rng';
import type { SimEventKind } from '../sim';
import { PREF, type SmallPrey } from '../smallprey';
import { SEASON_TICKS, Sp, St, YEAR_TICKS } from '../types';
import { COARSE_N, type World } from '../world';

/** Seconds of motion per tick (the sim's DT). */
const DT = 0.15;

/**
 * The raven flight integrator, shared with the raptors: ease the height toward targetAlt (altGain per tick) and the velocity toward the wanted
 * velocity a.dvx, a.dvy (velGain per tick), move, face the way it goes, and turn away at the border. The sim's liveRaven calls it with
 * (0.03, 0.08), the raptors with their own gains.
 */
export function flightStep(a: Agents, i: number, dt: number, size: number, targetAlt: number, altGain: number, velGain: number): void {
  a.alt[i] += (targetAlt - a.alt[i]) * altGain;
  a.vx[i] += (a.dvx[i] - a.vx[i]) * velGain;
  a.vy[i] += (a.dvy[i] - a.vy[i]) * velGain;
  a.x[i] = Math.max(2, Math.min(size - 2, a.x[i] + a.vx[i] * dt));
  a.y[i] = Math.max(2, Math.min(size - 2, a.y[i] + a.vy[i] * dt));
  const sp = Math.hypot(a.vx[i], a.vy[i]);
  if (sp > 0.1) a.heading[i] = Math.atan2(a.vy[i], a.vx[i]);
  if (a.x[i] <= 2 || a.x[i] >= size - 2 || a.y[i] <= 2 || a.y[i] >= size - 2) a.heading[i] += Math.PI * 0.5;
}

/** What a raptor is doing (private to the module; the snapshot only sees St and alt, see the header). */
export const Mode = { Soar: 0, Glide: 1, ToPerch: 2, Perch: 3, Stoop: 4, Feed: 5, Carrion: 6, Nestling: 7, Migrate: 8 } as const;
type Mode = (typeof Mode)[keyof typeof Mode];

// season positions (in seasons, 0..4)
export const EAGLE_ARRIVE = 2.5;
export const EAGLE_LEAVE = 0.5;
export const HAWK_RETURN = 0.3;
export const HAWK_HATCH = 0.8;
export const HAWK_LEAVE = 2.4;
/** A cottonwood this tall (m) can hold a nest. */
export const NEST_TREE_MIN = 11;
/** A perched bird sits at this share of the tree's height. */
export const PERCH_FRAC = 0.92;
/** Ticks of age at which a nestling fledges, and until which a young hawk is fed from its parents' catches. */
export const FLEDGE_AGE = 200;
export const DEP_AGE = 420;
/** A hawk with a nest hunts and roosts within this far (m) of it. */
const HAWK_RANGE = 160;
const MAX_NESTS = 8;
const KIDS = 4;
const THINK_EVERY = 4;
/** The least preference-weighted prey per coarse cell worth a stoop. */
const MIN_DENS = 0.12;
const FEED_TICKS = 24;
/** A hawk hunting live prey goes to a carcass only below this energy. */
const HAWK_STARVING = 0.2;

export interface RaptorHost {
  readonly tick: number;
  /** Alive counts by species for this tick (filled at the top of the sim's step). */
  readonly pop: Int32Array;
  readonly small: SmallPrey | null;
  readonly cN: number;
  readonly cX: Float32Array;
  readonly cY: Float32Array;
  readonly cMeat: Float32Array;
  /** Nearest carcass with meat left, within maxD and not older than maxAge ticks; -1 when none. */
  nearestCarcass(x: number, y: number, maxD: number, maxAge: number): number;
  /** Aging, hunger; false when the animal died. */
  vitals(i: number): boolean;
  beginEmigration(i: number): void;
  /** Put a flyer into St.Migrate: outbound to the border point (tx, ty), or inbound to the point it flies to. */
  beginMigrate(i: number, outbound: boolean, tx: number, ty: number): void;
  /** The corridor nearest to a point: [x, y on the border, inward normal nx, ny]. */
  corridorFor(x: number, y: number): [number, number, number, number];
  /** A new adult or young, no random draws: all genes 1, base coat. Returns the slot. */
  spawnRaptor(sp: number, x: number, y: number, age: number, male: number, energy: number, alt: number): number;
  noteArrivals(sp: number, n: number): void;
  noteBirths(sp: number, n: number): void;
  event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void;
}

export class Raptors {
  readonly rng: Rng;
  private readonly size: number;
  private readonly cs: number;
  // tallest tree per coarse cell (perches), and the trees tall enough to nest in
  private readonly ttH = new Float32Array(COARSE_N * COARSE_N);
  private readonly ttX = new Float32Array(COARSE_N * COARSE_N);
  private readonly ttY = new Float32Array(COARSE_N * COARSE_N);
  private readonly nestTrees: number[] = [];
  /** Tree indices (into world.trees / 4) of last year's nests. */
  private oldSites: number[] = [];
  // per-slot state (reset when the slot's animal id changes)
  private cap = 0;
  private sid = new Uint32Array(0);
  private mode = new Uint8Array(0);
  /** Thinks left before a sated bird reconsiders its perch or soar. */
  private hold = new Int16Array(0);
  /** Ticks left in the pause after a miss. */
  private cool = new Int16Array(0);
  /** Thinks left in a straight soaring leg. */
  private legT = new Int16Array(0);
  private eatT = new Int16Array(0);
  private stoopN = new Int16Array(0);
  /** Nest index, or -1. */
  private nestOf = new Int8Array(0);
  private tgtX = new Float32Array(0);
  private tgtY = new Float32Array(0);
  /** Height the bird is heading for or sitting at (perch height; the soaring height while soaring). */
  private tAlt = new Float32Array(0);
  // nests
  private readonly nAlive = new Uint8Array(MAX_NESTS);
  private readonly nHatched = new Uint8Array(MAX_NESTS);
  private readonly nX = new Float32Array(MAX_NESTS);
  private readonly nY = new Float32Array(MAX_NESTS);
  private readonly nH = new Float32Array(MAX_NESTS);
  private readonly nTree = new Int32Array(MAX_NESTS);
  private readonly nF = new Int32Array(MAX_NESTS).fill(-1);
  private readonly nFId = new Uint32Array(MAX_NESTS);
  private readonly nM = new Int32Array(MAX_NESTS).fill(-1);
  private readonly nMId = new Uint32Array(MAX_NESTS);
  private readonly nKid = new Int32Array(MAX_NESTS * KIDS).fill(-1);
  private readonly nKidId = new Uint32Array(MAX_NESTS * KIDS);
  // eagles alive this tick (rebuilt in step), for the ravens' give-way test
  private eagleSlots = new Int32Array(64);
  private eagleN = 0;
  // hare mean for the richness index
  private hareEma = 0;
  // counters since the last sample
  private cFledged = 0;
  private cEagleCarrion = 0;
  private cYield = 0;

  constructor(
    private readonly a: Agents,
    private readonly p: Params,
    private readonly env: Environment,
    seed: number,
    private readonly world: World,
    private readonly h: RaptorHost,
  ) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:raptor`));
    this.size = world.size;
    this.cs = world.size / COARSE_N;
    const t = world.trees;
    for (let k = 0; k + 3 < t.length; k += 4) {
      const c = this.coarse(t[k], t[k + 1]);
      if (t[k + 2] > this.ttH[c]) { this.ttH[c] = t[k + 2]; this.ttX[c] = t[k]; this.ttY[c] = t[k + 1]; }
      if (t[k + 2] >= NEST_TREE_MIN) this.nestTrees.push(k / 4);
    }
    this.nTree.fill(-1);
  }

  private coarse(x: number, y: number): number {
    let i = Math.floor(x / this.cs), j = Math.floor(y / this.cs);
    if (i < 0) i = 0; else if (i >= COARSE_N) i = COARSE_N - 1;
    if (j < 0) j = 0; else if (j >= COARSE_N) j = COARSE_N - 1;
    return j * COARSE_N + i;
  }

  // ------------------------------------------------------------------ per-slot state

  private grow(cap: number): void {
    const g = <T extends { set(a: ArrayLike<number>): void }>(C: new (n: number) => T, prev: T): T => {
      const n = new C(cap);
      n.set(prev as unknown as ArrayLike<number>);
      return n;
    };
    this.sid = g(Uint32Array, this.sid);
    this.mode = g(Uint8Array, this.mode);
    this.hold = g(Int16Array, this.hold);
    this.cool = g(Int16Array, this.cool);
    this.legT = g(Int16Array, this.legT);
    this.eatT = g(Int16Array, this.eatT);
    this.stoopN = g(Int16Array, this.stoopN);
    this.nestOf = g(Int8Array, this.nestOf);
    this.tgtX = g(Float32Array, this.tgtX);
    this.tgtY = g(Float32Array, this.tgtY);
    this.tAlt = g(Float32Array, this.tAlt);
    this.cap = cap;
  }

  private ensure(i: number): void {
    if (i >= this.cap) this.grow(Math.max(this.a.cap, i + 1));
    if (this.sid[i] === this.a.id[i]) return;
    this.sid[i] = this.a.id[i];
    this.mode[i] = Mode.Soar;
    this.hold[i] = 0;
    this.cool[i] = 0;
    this.legT[i] = 0;
    this.eatT[i] = 0;
    this.stoopN[i] = 0;
    this.nestOf[i] = -1;
    this.tgtX[i] = 0;
    this.tgtY[i] = 0;
    this.tAlt[i] = 0;
  }

  /** Test hook: the private mode of slot i. */
  modeOf(i: number): Mode {
    this.ensure(i);
    return this.mode[i] as Mode;
  }
  /** Test hook: the nest index of slot i, or -1. */
  nestIndexOf(i: number): number {
    this.ensure(i);
    return this.nestOf[i];
  }
  /** Test hook: nest k as [x, y, height], or null when it is not in use. */
  nestAt(k: number): [number, number, number] | null {
    return this.nAlive[k] ? [this.nX[k], this.nY[k], this.nH[k]] : null;
  }

  // ------------------------------------------------------------------ seasons

  /** Hares against their five-year mean, rescaled to 0..1 (0.5 with the web off). */
  richness(): number {
    const sm = this.h.small;
    if (sm === null || this.hareEma <= 0) return 0.5;
    const r = sm.hareTotal() / this.hareEma;
    const c = r < 0.25 ? 0.25 : r > 2 ? 2 : r;
    return (c - 0.25) / 1.75;
  }

  /** Once per tick, when raptors are on or any live. Keeps the eagle list and the hare mean; fires the seasonal arrivals and departures. */
  step(t: number): void {
    const a = this.a, p = this.p;
    const sm = this.h.small;
    if (sm !== null && t % 50 === 0) {
      const hares = sm.hareTotal();
      if (this.hareEma <= 0) this.hareEma = hares;
      else this.hareEma += (hares - this.hareEma) * (50 / (5 * YEAR_TICKS));
    }
    // the eagles alive now (the ravens ask about the ones feeding)
    this.eagleN = 0;
    for (let i = 0; this.h.pop[Sp.Eagle] > 0 && i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Eagle) continue;
      if (this.eagleN >= this.eagleSlots.length) {
        const n = new Int32Array(this.eagleSlots.length * 2);
        n.set(this.eagleSlots);
        this.eagleSlots = n;
      }
      this.eagleSlots[this.eagleN++] = i;
    }
    if (p.raptors <= 0) return;
    const S = SEASON_TICKS;
    const yt = this.env.yearTick(t);
    if (t === 0) this.seedStart(yt);
    if (yt === Math.round(EAGLE_LEAVE * S)) this.sendAway(Sp.Eagle);
    if (yt === Math.round(HAWK_LEAVE * S)) { this.sendAway(Sp.Hawk); this.endNests(); }
    if (yt === Math.round(HAWK_RETURN * S) && t > 0) this.hawksReturn(false);
    // the hatching, and for half a season after it every 20 ticks for any nest whose pair was still on the way in
    const hatch = Math.round(HAWK_HATCH * S);
    if (yt === hatch || (yt > hatch && yt < hatch + Math.round(0.5 * S) && yt % 20 === 0)) this.hatchAll(0);
    if (yt === Math.round(EAGLE_ARRIVE * S) && t > 0 && p.openPrairie > 0) this.eaglesArrive();
  }

  /** At tick 0, a start inside the hawk season finds the pairs already on their nests (and the young, if the hatching is past). */
  private seedStart(yt: number): void {
    const S = SEASON_TICKS;
    if (yt < Math.round(HAWK_RETURN * S) || yt >= Math.round(HAWK_LEAVE * S)) return;
    this.hawksReturn(true);
    const hatch = Math.round(HAWK_HATCH * S);
    if (yt >= hatch) this.hatchAll(yt - hatch);
  }

  /** Every living bird of the species heads for the border (a silent departure). */
  private sendAway(sp: number): void {
    const a = this.a;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== sp || a.state[i] === St.Migrate) continue;
      this.ensure(i);
      this.mode[i] = Mode.Migrate;
      this.h.beginEmigration(i);
    }
  }

  private endNests(): void {
    for (let k = 0; k < MAX_NESTS; k++) {
      this.nAlive[k] = 0;
      this.nHatched[k] = 0;
      this.nF[k] = -1;
      this.nM[k] = -1;
      for (let q = 0; q < KIDS; q++) this.nKid[k * KIDS + q] = -1;
    }
  }

  /** Where the eagles come from: a random corridor, as one group. */
  private eaglesArrive(): void {
    const a = this.a, p = this.p, r = this.rng, h = this.h;
    const corr = this.world.corridors;
    const k = r.int(corr.length / 4);
    const bx = corr[k * 4], by = corr[k * 4 + 1], nx = corr[k * 4 + 2], ny = corr[k * 4 + 3];
    const span = Math.max(0, p.eagleMax - p.eagleMin);
    const n = Math.max(p.eagleMin, Math.min(p.eagleMax, Math.round(p.eagleMin + span * (0.5 * r.next() + 0.5 * this.richness()))));
    if (n <= 0) return;
    const P = p.species[Sp.Eagle];
    const spread = 40;
    for (let q = 0; q < n; q++) {
      const off = (r.next() - 0.5) * 2 * spread;
      const dep = 4 + r.next() * spread * 0.5;
      const x = Math.min(this.size - 3, Math.max(3, bx + nx * dep - ny * off));
      const y = Math.min(this.size - 3, Math.max(3, by + ny * dep + nx * off));
      const lo = P.matureAge * 1.2;
      const age = Math.round(lo + r.next() * (P.maxAge * 0.4 - lo));
      const i = h.spawnRaptor(Sp.Eagle, x, y, age, q % 2, 0.75 + r.next() * 0.15, 36 + r.next() * 10);
      this.ensure(i);
      a.origin[i] = 1;
      a.heading[i] = Math.atan2(ny, nx);
      this.mode[i] = Mode.Migrate;
      h.beginMigrate(i, false, bx + nx * 90 - ny * off, by + ny * 90 + nx * off);
    }
    h.noteArrivals(Sp.Eagle, n);
    h.event('eaglesArrive', Sp.Eagle, bx, by, n, 0);
  }

  /** Choose up to n nest trees: last year's first, then random tall cottonwoods, all hawkNestSpacing apart. Tree indices. */
  private pickSites(n: number): number[] {
    const w = this.world.trees, r = this.rng, sp2 = this.p.hawkNestSpacing * this.p.hawkNestSpacing;
    const chosen: number[] = [];
    const ok = (ti: number): boolean => {
      for (const c of chosen) {
        const dx = w[c * 4] - w[ti * 4], dy = w[c * 4 + 1] - w[ti * 4 + 1];
        if (dx * dx + dy * dy < sp2) return false;
      }
      return true;
    };
    for (const ti of this.oldSites) if (chosen.length < n && ok(ti)) chosen.push(ti);
    for (let tries = 0; tries < 120 && chosen.length < n && this.nestTrees.length > 0; tries++) {
      const ti = this.nestTrees[r.int(this.nestTrees.length)];
      if (ok(ti)) chosen.push(ti);
    }
    this.oldSites = chosen.slice();
    return chosen;
  }

  /**
   * The pairs come back. `inPlace` puts them straight on their nests (the start of a run inside the season); otherwise each pair walks in from
   * the corridor nearest its tree and settles when it arrives.
   */
  private hawksReturn(inPlace: boolean): void {
    const a = this.a, p = this.p, r = this.rng, h = this.h;
    if (this.nestTrees.length === 0) return;
    const span = Math.max(0, p.hawkPairsMax - p.hawkPairsMin);
    const want = Math.max(p.hawkPairsMin, Math.min(p.hawkPairsMax, Math.round(p.hawkPairsMin + span * (0.5 * r.next() + 0.5 * this.richness()))));
    const sites = this.pickSites(Math.min(want, MAX_NESTS));
    if (sites.length === 0) return;
    const P = p.species[Sp.Hawk];
    const t = this.world.trees;
    let ex = 0, ey = 0, made = 0;
    for (const ti of sites) {
      let k = -1;
      for (let q = 0; q < MAX_NESTS; q++) if (!this.nAlive[q]) { k = q; break; }
      if (k < 0) break;
      const tx = t[ti * 4], ty = t[ti * 4 + 1], th = t[ti * 4 + 2];
      this.nAlive[k] = 1;
      this.nHatched[k] = 0;
      this.nX[k] = tx; this.nY[k] = ty; this.nH[k] = th; this.nTree[k] = ti;
      for (let q = 0; q < KIDS; q++) this.nKid[k * KIDS + q] = -1;
      const [bx, by, nx, ny] = h.corridorFor(tx, ty);
      if (made === 0) { ex = bx; ey = by; }
      for (let sex = 0; sex < 2; sex++) {
        const lo = P.matureAge * 1.2;
        const age = Math.round(lo + r.next() * (P.maxAge * 0.4 - lo));
        const energy = 0.8 + r.next() * 0.12;
        const off = (r.next() - 0.5) * 12;
        let i: number;
        if (inPlace) {
          i = h.spawnRaptor(Sp.Hawk, tx + (r.next() - 0.5) * 6, ty + (r.next() - 0.5) * 6, age, sex, energy, th * PERCH_FRAC);
          this.ensure(i);
          this.mode[i] = Mode.Perch;
          this.tAlt[i] = th * PERCH_FRAC;
          this.tgtX[i] = tx; this.tgtY[i] = ty;
          a.state[i] = St.Idle;
        } else {
          const x = Math.min(this.size - 3, Math.max(3, bx + nx * 6 - ny * off));
          const y = Math.min(this.size - 3, Math.max(3, by + ny * 6 + nx * off));
          i = h.spawnRaptor(Sp.Hawk, x, y, age, sex, energy, 36 + r.next() * 8);
          this.ensure(i);
          a.origin[i] = 1;
          a.heading[i] = Math.atan2(ty - y, tx - x);
          this.mode[i] = Mode.Migrate;
          h.beginMigrate(i, false, tx + (r.next() - 0.5) * 20, ty + (r.next() - 0.5) * 20);
        }
        this.nestOf[i] = k;
        if (sex === 0) { this.nF[k] = i; this.nFId[k] = a.id[i]; } else { this.nM[k] = i; this.nMId[k] = a.id[i]; }
      }
      made++;
    }
    if (made > 0) {
      if (!inPlace) {
        h.noteArrivals(Sp.Hawk, made * 2);
        h.event('hawksReturn', Sp.Hawk, ex, ey, made, 0);
      }
    }
  }

  /** The hatching: every nest with a living parent gets its young (age0 ticks old: a run that starts after the hatch). */
  private hatchAll(age0: number): void {
    const a = this.a, p = this.p, r = this.rng, h = this.h;
    const P = p.species[Sp.Hawk];
    for (let k = 0; k < MAX_NESTS; k++) {
      if (!this.nAlive[k] || this.nHatched[k]) continue;
      // a parent has to be at the nest (a pair still flying in hatches the young a little later, see step)
      const at = (q: number, id: number): boolean => a.same(q, id) && Math.abs(a.x[q] - this.nX[k]) < HAWK_RANGE && Math.abs(a.y[q] - this.nY[k]) < HAWK_RANGE;
      const f = at(this.nF[k], this.nFId[k]) ? this.nF[k] : at(this.nM[k], this.nMId[k]) ? this.nM[k] : -1;
      if (f < 0) continue;
      this.nHatched[k] = 1;
      const e = a.energy[f];
      if (e < 0.3) continue;
      const idx = 0.5 + e;
      const n = Math.max(1, Math.min(P.maxLitter, Math.round((P.litter / p.calendarScale) * idx)));
      const alt = this.nH[k] * PERCH_FRAC;
      for (let q = 0; q < n && q < KIDS; q++) {
        const i = h.spawnRaptor(Sp.Hawk, this.nX[k] + (r.next() - 0.5) * 1.2, this.nY[k] + (r.next() - 0.5) * 1.2, age0, r.next() < 0.5 ? 1 : 0, 0.85, alt);
        this.ensure(i);
        this.nestOf[i] = k;
        this.tgtX[i] = this.nX[k]; this.tgtY[i] = this.nY[k]; this.tAlt[i] = alt;
        this.nKid[k * KIDS + q] = i;
        this.nKidId[k * KIDS + q] = a.id[i];
        if (age0 >= FLEDGE_AGE) { this.mode[i] = Mode.Soar; a.state[i] = St.Fly; } else { this.mode[i] = Mode.Nestling; a.state[i] = St.Rest; }
      }
      h.noteBirths(Sp.Hawk, Math.min(n, KIDS));
    }
  }

  // ------------------------------------------------------------------ the ravens' give-way

  /** Is an eagle eating at a carcass within r metres of (x, y)? */
  eagleFeedingNear(x: number, y: number, r: number): boolean {
    const a = this.a, r2 = r * r;
    for (let q = 0; q < this.eagleN; q++) {
      const i = this.eagleSlots[q];
      if (!a.alive[i] || a.state[i] !== St.Eat || this.mode[i] !== Mode.Carrion) continue;
      const dx = a.x[i] - x, dy = a.y[i] - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }
  /** A raven gave way to an eagle (for the sample). */
  noteYield(): void {
    this.cYield++;
  }

  // ------------------------------------------------------------------ helpers

  /** Best tree top within maxD of (x, y): tall and near. [x, y, height] or null. */
  perchNear(x: number, y: number, maxD: number): [number, number, number] | null {
    const N = COARSE_N, cs = this.cs;
    const c = this.coarse(x, y), cx = c % N, cy = (c / N) | 0;
    const rc = Math.ceil(maxD / cs);
    let best = -1, bestV = -1e9;
    for (let dy = -rc; dy <= rc; dy++) {
      for (let dx = -rc; dx <= rc; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const nc = ny * N + nx;
        const hh = this.ttH[nc];
        if (hh <= 0) continue;
        const d = Math.hypot(this.ttX[nc] - x, this.ttY[nc] - y);
        if (d > maxD) continue;
        const v = hh - 0.08 * d;
        if (v > bestV) { bestV = v; best = nc; }
      }
    }
    return best < 0 ? null : [this.ttX[best], this.ttY[best], this.ttH[best]];
  }

  /** The midday thermal, 0..1: peaks just after noon, weaker in the cold. */
  private thermal(): number {
    const s = this.env.state;
    const t = 1 - Math.abs(s.dayFrac - 0.55) / 0.22;
    return t <= 0 ? 0 : t * (0.4 + 0.6 * s.warmth);
  }

  private hungryKids(nest: number): boolean {
    const a = this.a;
    for (let q = 0; q < KIDS; q++) {
      const j = this.nKid[nest * KIDS + q];
      if (j >= 0 && a.same(j, this.nKidId[nest * KIDS + q]) && a.age[j] < DEP_AGE && a.energy[j] < 0.6) return true;
    }
    return false;
  }

  /** A hawk's catch of energy g: with hungry young about, half goes to them. Returns what the hunter keeps. */
  private provision(i: number, g: number): number {
    const a = this.a;
    const k = this.nestOf[i];
    if (k < 0 || !this.nAlive[k] || a.age[i] < this.p.species[Sp.Hawk].matureAge) return g;
    const kids: number[] = [];
    for (let q = 0; q < KIDS; q++) {
      const j = this.nKid[k * KIDS + q];
      if (j >= 0 && a.same(j, this.nKidId[k * KIDS + q]) && a.age[j] < DEP_AGE && a.energy[j] < 0.95) kids.push(j);
    }
    if (kids.length === 0) return g;
    const share = (g * 0.5) / kids.length;
    let used = 0;
    for (const j of kids) {
      const give = Math.min(share, 0.95 - a.energy[j]);
      a.energy[j] += give;
      used += give;
    }
    return g - used;
  }

  // ------------------------------------------------------------------ thinking

  /** One think (the sim calls it every 4 ticks per bird). Sets the state, the wanted velocity and the mode; live() does the moving. */
  think(i: number): void {
    const a = this.a, h = this.h, p = this.p, r = this.rng;
    this.ensure(i);
    if (a.state[i] === St.Migrate) return;
    let m: Mode = this.mode[i] as Mode;
    if (m === Mode.Migrate) m = this.mode[i] = Mode.Soar; // arrived
    if (m === Mode.Stoop || m === Mode.Feed) return;
    const hawk = a.sp[i] === Sp.Hawk;
    const P = p.species[a.sp[i]];
    const x = a.x[i], y = a.y[i], e = a.energy[i];
    const env = this.env.state;
    const night = env.dayFrac < 0.21 || env.dayFrac > 0.8;
    const young = a.age[i] < P.matureAge;
    if (m === Mode.Nestling) {
      if (a.age[i] < FLEDGE_AGE) return;
      this.cFledged++;
      m = this.mode[i] = Mode.Soar; // out of the nest
      a.state[i] = St.Fly;
    }
    if (this.hold[i] > 0) this.hold[i]--;
    if (this.cool[i] > 0) this.cool[i] -= THINK_EVERY;
    const nest = this.nestOf[i];
    const home = nest >= 0 && this.nAlive[nest] === 1;
    const hx = home ? this.nX[nest] : x, hy = home ? this.nY[nest] : y;
    const small = h.small;
    const cruise = P.walkSpeed;

    // 1. carcass (eagles; a hawk when there is no small-prey web or when starving, below 0.2)
    const wantCarrion = !night && (hawk ? (small === null ? e < p.raptorCarrionHunger : e < HAWK_STARVING) : e < p.raptorCarrionHunger);
    if (m === Mode.Carrion && e < 0.97 || wantCarrion) {
      const k = h.nearestCarcass(x, y, P.sight, 800);
      if (k >= 0 && (!home || Math.hypot(h.cX[k] - hx, h.cY[k] - hy) < HAWK_RANGE * 1.5)) {
        const dx = h.cX[k] - x, dy = h.cY[k] - y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        this.mode[i] = Mode.Carrion;
        a.timer[i] = k;
        this.tgtX[i] = h.cX[k]; this.tgtY[i] = h.cY[k];
        if (d < 2.5 && a.alt[i] < 1.2) {
          a.state[i] = St.Eat;
          a.dvx[i] = 0; a.dvy[i] = 0;
        } else {
          const sp = d > 30 ? cruise : Math.max(1.5, cruise * 0.6);
          a.dvx[i] = (dx / d) * sp; a.dvy[i] = (dy / d) * sp;
          a.state[i] = St.Fly;
        }
        return;
      }
    }
    if (m === Mode.Carrion) m = this.mode[i] = Mode.Soar; // the carcass is gone, or the bird is full

    // 2. hunt small prey
    if (small !== null && !night && this.cool[i] <= 0 && (e < p.raptorHuntHunger || (home && this.hungryKids(nest)))) {
      if (this.huntNext(i, hawk, P.walkSpeed, small, x, y, home, hx, hy, m)) return;
    }

    // 3. night: roost
    if (night) { this.goPerch(i, home, hx, hy, 250); return; }

    // 4. sated (or nothing to hunt): soar in the thermal, or perch
    if (this.hold[i] > 0 && (m === Mode.Perch || m === Mode.ToPerch)) {
      if (m === Mode.ToPerch) this.goPerch(i, home, hx, hy, 250);
      else a.state[i] = e >= 0.9 ? St.Rest : St.Idle;
      return;
    }
    if (this.hold[i] > 0 && m === Mode.Soar) { this.soar(i, hawk, cruise, home, hx, hy); return; }
    const hungry = e < p.raptorHuntHunger;
    if (this.thermal() > 0.25 || (hungry && !night)) {
      this.hold[i] = 15 + r.int(40);
      this.soar(i, hawk, cruise, home, hx, hy);
    } else {
      this.hold[i] = 20 + r.int(60);
      this.goPerch(i, home, hx, hy, 250);
    }
  }

  /** Soar: circle with the odd straight leg, keep inside the range (hawks) and the valley; the height follows the thermal. */
  private soar(i: number, hawk: boolean, cruise: number, home: boolean, hx: number, hy: number): void {
    const a = this.a, r = this.rng;
    this.mode[i] = Mode.Soar;
    a.state[i] = St.Fly;
    const x = a.x[i], y = a.y[i];
    let turn: number;
    if (this.legT[i] > 0) { this.legT[i]--; turn = (r.next() - 0.5) * 0.08; }
    else {
      turn = (a.id[i] & 1 ? 1 : -1) * 0.2 + (r.next() - 0.5) * 0.12;
      if (r.next() < 0.05) this.legT[i] = 6 + r.int(8);
    }
    let ang = a.heading[i] + turn;
    const toward = (tx: number, ty: number): number => Math.atan2(ty - y, tx - x);
    const edge = Math.min(x, y, this.size - x, this.size - y);
    if (edge < 45) ang = toward(this.size / 2, this.size / 2) + (r.next() - 0.5) * 0.3;
    else if (home && Math.hypot(hx - x, hy - y) > HAWK_RANGE * 0.8) ang = toward(hx, hy) + (r.next() - 0.5) * 0.4;
    const sp = cruise * (hawk ? 0.8 : 0.85);
    a.dvx[i] = Math.cos(ang) * sp;
    a.dvy[i] = Math.sin(ang) * sp;
    const wn = this.world.n, wc = this.size / wn;
    const gi = Math.max(0, Math.min(wn - 1, Math.floor(x / wc))), gj = Math.max(0, Math.min(wn - 1, Math.floor(y / wc)));
    const open = 1 - Math.min(1, this.world.cover[gj * wn + gi]);
    const base = hawk ? 22 : 30, span = hawk ? 38 : 60;
    this.tAlt[i] = base + span * this.thermal() * (0.5 + 0.5 * open) + (a.id[i] % 7) * 2.5;
  }

  /** Head for a perch (the nest tree for a hawk with a nest, otherwise the best tree within maxD, otherwise the ground here). */
  private goPerch(i: number, home: boolean, hx: number, hy: number, maxD: number): void {
    const a = this.a;
    if (this.mode[i] === Mode.Perch) {
      const env = this.env.state;
      a.state[i] = env.dayFrac < 0.21 || env.dayFrac > 0.8 || a.energy[i] >= 0.9 ? St.Rest : St.Idle;
      return;
    }
    if (this.mode[i] !== Mode.ToPerch) {
      // choose the spot once
      if (home) {
        const nest = this.nestOf[i];
        this.tgtX[i] = hx; this.tgtY[i] = hy; this.tAlt[i] = this.nH[nest] * PERCH_FRAC;
      } else {
        const pt = this.perchNear(a.x[i], a.y[i], maxD);
        if (pt !== null) { this.tgtX[i] = pt[0]; this.tgtY[i] = pt[1]; this.tAlt[i] = pt[2] * PERCH_FRAC; }
        else { this.tgtX[i] = a.x[i]; this.tgtY[i] = a.y[i]; this.tAlt[i] = 0.2; }
      }
      this.mode[i] = Mode.ToPerch;
    }
    const cruise = this.p.species[a.sp[i]].walkSpeed;
    const dx = this.tgtX[i] - a.x[i], dy = this.tgtY[i] - a.y[i], d = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const sp = Math.min(cruise, Math.max(1.5, d * 0.4));
    a.dvx[i] = (dx / d) * sp;
    a.dvy[i] = (dy / d) * sp;
    a.state[i] = St.Fly;
  }

  /**
   * Pick the best prey cell and either start the stoop or glide toward it. Returns false when no cell is worth the trip (the caller then soars
   * or perches).
   */
  private huntNext(i: number, hawk: boolean, cruise: number, sm: SmallPrey, x: number, y: number, home: boolean, hx: number, hy: number, m: Mode): boolean {
    const a = this.a, r = this.rng;
    const N = sm.cells, cs = sm.cellSize;
    const reach = hawk ? 100 : 150;
    const pref = hawk ? PREF.hawk : PREF.eagle;
    const rc = Math.ceil(reach / cs);
    const c = sm.cellOf(x, y), cx = c % N, cy = (c / N) | 0;
    let best = -1, bestV = MIN_DENS;
    for (let dy = -rc; dy <= rc; dy++) {
      for (let dx = -rc; dx <= rc; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ccx = (nx + 0.5) * cs, ccy = (ny + 0.5) * cs;
        const d = Math.hypot(ccx - x, ccy - y);
        if (d > reach) continue;
        if (home && Math.hypot(ccx - hx, ccy - hy) > HAWK_RANGE) continue;
        const nc = ny * N + nx;
        const v = (sm.hare[nc] * pref.hare + sm.dog[nc] * pref.dog) / (1 + d / 100);
        if (v > bestV) { bestV = v; best = nc; }
      }
    }
    if (best < 0) return false;
    const bx = ((best % N) + 0.5) * cs, by = (((best / N) | 0) + 0.5) * cs;
    const d = Math.hypot(bx - x, by - y);
    const perched = m === Mode.Perch;
    const stoopReach = perched ? (hawk ? 70 : 90) : (hawk ? 40 : 55);
    if (d <= stoopReach) {
      this.startStoop(i, hawk, bx + (r.next() - 0.5) * cs * 0.7, by + (r.next() - 0.5) * cs * 0.7);
      return true;
    }
    // glide to the cell at hunting height
    this.mode[i] = Mode.Glide;
    a.state[i] = St.Fly;
    this.tgtX[i] = bx; this.tgtY[i] = by;
    a.dvx[i] = ((bx - x) / d) * cruise;
    a.dvy[i] = ((by - y) / d) * cruise;
    this.tAlt[i] = (hawk ? 20 : 28) + (a.id[i] % 5);
    return true;
  }

  private startStoop(i: number, hawk: boolean, tx: number, ty: number): void {
    const a = this.a;
    const P = this.p.species[hawk ? Sp.Hawk : Sp.Eagle];
    const perTick = P.runSpeed * DT;
    const d = Math.hypot(tx - a.x[i], ty - a.y[i]);
    const n = Math.max(6, Math.min(40, Math.ceil(Math.max(d / perTick, a.alt[i] / (perTick * 0.75)))));
    this.mode[i] = Mode.Stoop;
    this.stoopN[i] = n;
    this.tgtX[i] = tx; this.tgtY[i] = ty;
    a.state[i] = St.Chase;
    a.heading[i] = Math.atan2(ty - a.y[i], tx - a.x[i]);
  }

  // ------------------------------------------------------------------ living

  /** Every tick: fly, stoop, perch, eat; then the body's upkeep. */
  live(i: number): void {
    const a = this.a, h = this.h, p = this.p;
    this.ensure(i);
    const P = p.species[a.sp[i]];
    if (a.state[i] === St.Migrate) {
      this.mode[i] = Mode.Migrate;
      flightStep(a, i, DT, this.size, 36 + (a.id[i] % 5) * 3, 0.03, 0.08);
      h.vitals(i);
      return;
    }
    if (this.mode[i] === Mode.Migrate) this.mode[i] = Mode.Soar;
    switch (this.mode[i] as Mode) {
      case Mode.Perch:
      case Mode.Nestling: {
        a.vx[i] = 0; a.vy[i] = 0; a.dvx[i] = 0; a.dvy[i] = 0;
        a.alt[i] += (this.tAlt[i] - a.alt[i]) * 0.2;
        break;
      }
      case Mode.ToPerch: {
        const dx = this.tgtX[i] - a.x[i], dy = this.tgtY[i] - a.y[i];
        const d = Math.sqrt(dx * dx + dy * dy);
        const target = d > 40 ? Math.max(this.tAlt[i], 18) : this.tAlt[i];
        flightStep(a, i, DT, this.size, target, 0.06, 0.08);
        if (d < 3.5 && Math.abs(a.alt[i] - this.tAlt[i]) < 5) {
          a.x[i] = this.tgtX[i]; a.y[i] = this.tgtY[i]; a.alt[i] = this.tAlt[i];
          a.vx[i] = 0; a.vy[i] = 0; a.dvx[i] = 0; a.dvy[i] = 0;
          this.mode[i] = Mode.Perch;
          a.state[i] = St.Idle;
        }
        break;
      }
      case Mode.Stoop: this.liveStoop(i, P); break;
      case Mode.Feed: {
        a.vx[i] *= 0.5; a.vy[i] *= 0.5;
        a.alt[i] = Math.max(0, a.alt[i] - 0.3);
        a.state[i] = St.Eat;
        if (--this.eatT[i] <= 0) { this.mode[i] = Mode.Soar; a.state[i] = St.Fly; this.tAlt[i] = 20; this.hold[i] = 0; }
        break;
      }
      case Mode.Carrion: {
        if (a.state[i] === St.Eat) {
          const k = a.timer[i];
          if (k >= 0 && k < h.cN && h.cMeat[k] > 0.01 && Math.abs(h.cX[k] - this.tgtX[i]) < 1 && Math.abs(h.cY[k] - this.tgtY[i]) < 1) {
            const take = Math.min(p.raptorEatRate, h.cMeat[k]);
            h.cMeat[k] -= take;
            a.energy[i] = Math.min(1, a.energy[i] + take * p.raptorMeatEnergy);
            if (a.sp[i] === Sp.Eagle) this.cEagleCarrion++;
            a.x[i] += (this.tgtX[i] - a.x[i]) * 0.3;
            a.y[i] += (this.tgtY[i] - a.y[i]) * 0.3;
            a.vx[i] = 0; a.vy[i] = 0;
            a.alt[i] = Math.max(0, a.alt[i] - 0.5);
            if (a.energy[i] >= 0.97) {
              // full: sit by the carcass a while
              this.mode[i] = Mode.Perch;
              this.tAlt[i] = 0.2;
              this.tgtX[i] = a.x[i]; this.tgtY[i] = a.y[i];
              this.hold[i] = 30 + this.rng.int(30);
              a.state[i] = St.Rest;
            }
          } else {
            this.mode[i] = Mode.Soar; // the carcass is gone
            a.state[i] = St.Fly;
          }
        } else {
          const dx = this.tgtX[i] - a.x[i], dy = this.tgtY[i] - a.y[i];
          const d = Math.sqrt(dx * dx + dy * dy);
          flightStep(a, i, DT, this.size, d < 25 ? 0 : 20, d < 25 ? 0.1 : 0.04, 0.08);
        }
        break;
      }
      default: {
        // soar or glide
        const gliding = this.mode[i] === Mode.Glide;
        flightStep(a, i, DT, this.size, this.tAlt[i], gliding ? 0.05 : 0.02, 0.08);
        break;
      }
    }
    h.vitals(i);
  }

  /** One tick of a stoop: home in on the target point, losing height fast; on the last tick roll the catch. */
  private liveStoop(i: number, P: { runSpeed: number; matureAge: number }): void {
    const a = this.a, h = this.h;
    const r = this.stoopN[i];
    if (r > 1) {
      const dx = this.tgtX[i] - a.x[i], dy = this.tgtY[i] - a.y[i];
      const nx = a.x[i] + dx / r, ny = a.y[i] + dy / r;
      a.vx[i] = (nx - a.x[i]) / DT;
      a.vy[i] = (ny - a.y[i]) / DT;
      a.x[i] = nx; a.y[i] = ny;
      a.alt[i] = Math.max(0.8, a.alt[i] - (a.alt[i] - 0.8) / r);
      if (Math.abs(dx) + Math.abs(dy) > 0.5) a.heading[i] = Math.atan2(dy, dx);
      a.dvx[i] = a.vx[i]; a.dvy[i] = a.vy[i];
      this.stoopN[i] = r - 1;
      return;
    }
    // the strike
    const hawk = a.sp[i] === Sp.Hawk;
    const sm = h.small;
    const eff = a.age[i] < P.matureAge ? 0.5 : 1;
    const g = sm !== null ? sm.take(this.tgtX[i], this.tgtY[i], hawk ? 'hawk' : 'eagle', eff, this.rng) : 0;
    a.x[i] = this.tgtX[i]; a.y[i] = this.tgtY[i];
    a.alt[i] = 0.8;
    if (g > 0) {
      const kept = hawk ? this.provision(i, g) : g;
      a.energy[i] = Math.min(1, a.energy[i] + kept);
      a.kills[i]++;
      this.mode[i] = Mode.Feed;
      this.eatT[i] = FEED_TICKS;
      a.state[i] = St.Eat;
      a.alt[i] = 0.3;
      a.vx[i] = 0; a.vy[i] = 0;
    } else {
      this.mode[i] = Mode.Soar;
      this.cool[i] = 15 + this.rng.int(20);
      this.hold[i] = 0;
      a.state[i] = St.Fly;
      const ang = a.heading[i];
      const cruise = this.p.species[a.sp[i]].walkSpeed;
      a.dvx[i] = Math.cos(ang) * cruise * 0.8; a.dvy[i] = Math.sin(ang) * cruise * 0.8;
      this.tAlt[i] = 25; // the stoop's speed is kept and eases off as it climbs away
    }
  }

  // ------------------------------------------------------------------ the sample

  /** The raptor columns of the time series (counters since the last call are cleared). */
  sampleRow(row: Record<string, number>): void {
    const a = this.a;
    let nests = 0;
    for (let k = 0; k < MAX_NESTS; k++) {
      if (!this.nAlive[k]) continue;
      if (a.same(this.nF[k], this.nFId[k]) || a.same(this.nM[k], this.nMId[k])) nests++;
    }
    row.hawk_nests = nests;
    row.hawk_fledged = this.cFledged;
    row.eagle_carcass_ticks = this.cEagleCarrion;
    row.raptor_yields = this.cYield;
    this.cFledged = 0;
    this.cEagleCarrion = 0;
    this.cYield = 0;
  }
}
