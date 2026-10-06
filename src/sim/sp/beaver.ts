// Beavers (V2-PLAN.md S14): colonies on the creek that dam it, flood the ground behind the dam, drown the trees there, green the banks, and leave a
// meadow when they go. The water itself (the depth field, the dams' hydrology, moisture, meadows, drought shield) is src/sim/ponds.ts; this module is
// the animals and the colony life.
//
// ---- The system is off unless asked for ---------------------------------------------------------------------------------------------
// `beavers` 0 and `beaver.initial` 0 (the defaults) mean the sim never builds any of this. With `beaver.initial` above 0 the founders are placed at once
// (colonies of beaverColonySize, a breeding pair and yearlings, on the best free sites); with `beavers` above 0 and none placed, colonies arrive on their
// own (a pair every few years from outside the valley, needs openPrairie; or the god tool releases some).
//
// ---- Sites and food ---------------------------------------------------------------------------------------------------------------
// A site is a creek node (world.creek, every 4 m) chosen at the start: the food index there (trees within beaverFoodRadius = 40 m count 1, shrub clumps
// 0.35, trees under 3 m do not count) must be at least beaverFoodMin, the pond a full dam would hold between 12 and 450 cells (48 to 1,800 m2), sites are picked greedily by food
// and pond and kept at least 0.65 x beaverSpacing apart, and none lies within 25 m of the border. A colony may only be founded where no other colony or
// dam lies within beaverSpacing (90 m).
// Food is a share (0..1) of the stand around a site. A gnawing beaver takes beaverFoodRate trees' worth per base year of its feeding (cut per tick
// = rate / index / 216, because a well fed beaver gnaws 9% of the time), the stand grows back at beaverRegrow x (1 - share) per base year, and the
// beaver's gain per gnawing tick is 0.01 x min(1, share / 0.3): below 30% of the stand the colony goes hungry. A colony whose share stays under
// beaverFoodLeave (15%) for a season leaves: its members become dispersers, the dam is abandoned (it decays over 2 to 4 valley years, the pond drains
// into a meadow) and the site's stand then regrows. Kits at the lodge draw 0.0009 energy a tick from the colony's stand.
//
// ---- The animals -------------------------------------------------------------------------------------------------------------------
// States (St): resting in the lodge St.Rest (the lodge stands in the water 8 m above the dam), moving in water St.Swim, on land St.Walk (St.Run when
// fleeing), working on the dam St.Build, gnawing at a tree or shrub St.Graze, a disperser on the creek St.Swim or St.Walk, a beaver in its lodge St.Rest.
// Beavers keep a night schedule (night and the two twilights, about 55% of the day); by day the adults rest in the lodge unless they are hungry.
// Jobs of an adult out of the lodge, one at a time: BUILD (swim to the dam wall, work 60 to 120 ticks), FORAGE (walk to a tree or shrub spot within
// beaverRange of the lodge, then GNAW 40 to 90 ticks), HOME. Kits stay in the lodge. A predator (wolf, cougar, coyote) within 30 m of a beaver on
// land sends it running to the nearest water (waterGX/waterGY) and then home; in the water it dives to the lodge. `safe(i)` is true for a beaver in water,
// and wolves ignore those (sim.ts thinkWolf): they only take beavers on land, with the usual kill roll (toughness 0.9).
// Dispersers (yearlings pushed out of a crowded colony, the members of a colony that left, arrivals, god-tool releases) walk to the creek, follow it
// to the best free site (value = food index x share + pond / 2 - distance / 10), and found a colony there when a disperser of the other sex is there too.
// A disperser that finds nothing for 1,500 ticks leaves the valley.
//
// ---- The dam and the pond ------------------------------------------------------------------------------------------------------------
// A new colony starts a dam at its creek node. While the colony is active and the dam is Building the crest rises beaverCrestRate (0.3 m) per season
// (SEASON_TICKS) x min(1, adults / 2), up to beaverCrestMax (1.4 m), then the dam is Holding. Events (sp 11): damBuilt (the crest first reaches 0.3 m;
// a = dam id, b = colony id), pondFilled (the crest reaches its maximum; a = new pond area in m2, b = dam id; told only when the pond is at least 40 m2),
// damBreached (a = crest lost, b = 0 in a flood, 1 on its own), beaverMeadow (the pond has drained to a quarter of its area or less; a = the area lost in m2,
// b = dam id), colonyLeft (a = colony id, b = 0 out of food, 1 all its beavers died).
// Breach: when a flood starts (S12 spring flood or the S17 tool) every dam with crest >= 0.3 breaches with chance beaverBreachP x severity x crest / max;
// on its own a dam breaches with chance beaverBreachYear per valley year (x 1 + 3 x rain). A breached dam loses its crest over a third of a season; a colony
// still living there (and fed) rebuilds from the stump, the pond drains in between.
//
// ---- Births and numbers ------------------------------------------------------------------------------------------------------------
// Once a year in spring (season 0.5) the oldest adult pair of a colony with at least 25% of its stand left has round(litter / calendarScale x
// (0.5 + share) x (0.8 to 1.2)) kits (1 to 5) at the lodge; at the same time up to two non-breeding adults leave a colony of more than beaverColonySize.
// Every year in spring, with `beavers` on and openPrairie on, with chance beaverArrival / calendarScale a pair arrives at one end of the creek and heads for
// the best free site. Beavers never die of thirst; they starve, grow old (5 valley years), or are eaten.
//
// ---- Determinism and the main stream -----------------------------------------------------------------------------------------------
// Every draw comes from a private generator, new Rng(hashSeed(seed + ':beaver')). Kits are spawned here with the parents' genes copied and no mutation
// (beavers carry no traits), so nothing here touches the main stream; the sim's shared vitals() draws the old-age hazard from it, only for beavers.
import type { Agents } from '../agents';
import { G_COAT, NG } from '../agents';
import type { Environment } from '../env';
import type { BucketGrid } from '../grid';
import type { Params } from '../params';
import { DamState, Ponds, type Dam, type PondHost } from '../ponds';
import { hashSeed, Rng } from '../rng';
import type { SimEventKind } from '../sim';
import { BASE_YEAR_TICKS, SEASON_TICKS, Sp, St, YEAR_TICKS } from '../types';
import type { Vegetation } from '../vegetation';
import type { World } from '../world';

/** Seconds of motion per tick (the sim's DT). */
const DT = 0.15;
/** The colony and dam bookkeeping runs every this many ticks. */
export const BEAVER_STEP = 25;
const MAX_COLONIES = 30000;
/** Energy a beaver gains per gnawing tick from a full stand, and a kit draws per tick at the lodge. */
const GAIN = 0.01;
const KIT_GAIN = 0.0009;
/** What a disperser finds to eat along the way, per tick (about two thirds of what it burns). */
const DISPERSER_GAIN = 0.0006;
/** A well fed beaver gnaws this share of the time: the stand's consumption per gnawing tick is foodRate / index / (BASE_YEAR_TICKS x GNAW_DUTY). */
const GNAW_DUTY = 0.09;
const FLEE_R = 30;
const SPOTS = 48;
/** Jobs. */
const REST = 0, BUILD = 1, FORAGE = 2, GNAW = 3, HOME = 4, FLEE = 5, DISPERSE = 6;

export interface Site {
  node: number;
  x: number;
  y: number;
  /** Food index (trees within the radius). */
  f0: number;
  /** New pond cells a full dam would hold. */
  pot: number;
  /** Share of the stand left (0..1). */
  food: number;
  /** Colony living here, or -1. */
  colony: number;
  /** Tree and shrub spots within beaverRange of the lodge: x, y pairs. */
  spots: Float32Array;
  score: number;
}

export interface Colony {
  id: number;
  site: number;
  /** Lodge position (in the water above the dam). */
  x: number;
  y: number;
  dam: Dam;
  /** 0 active, 1 left or empty (the dam decays). */
  state: number;
  born: number;
  members: number;
  adults: number;
  /** Ticks the stand has been under the leaving line. */
  hungry: number;
}

export interface BeaverHost {
  readonly tick: number;
  readonly pred: BucketGrid;
  readonly predList: Int32Array;
  readonly predN: number;
  /** Shared aging, hunger and old age of the sim; false when the animal died. */
  vitals(i: number): boolean;
  /** Unit vector toward the nearest water at a point (out[0], out[1]) and the distance to it (out[2]). */
  water(x: number, y: number, out: Float32Array): void;
  /** The animal walks out of the valley (counts as an emigrant). */
  leave(i: number): void;
  noteBirths(n: number): void;
  noteArrivals(n: number): void;
  markPresent(): void;
  event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void;
}

export class Beavers {
  readonly rng: Rng;
  readonly ponds: Ponds;
  readonly sites: Site[] = [];
  readonly colonies: Colony[] = [];
  private readonly P: Params['species'][number];
  // per-slot state, reset when the slot's id changes
  private cap = 0;
  private sid = new Uint32Array(0);
  private col = new Int16Array(0);
  private job = new Uint8Array(0);
  private jt = new Int16Array(0);
  private wx = new Float32Array(0);
  private wy = new Float32Array(0);
  /** A disperser's target site, or -1. */
  private tsite = new Int16Array(0);
  private nextColony = 0;
  private lastYear = -1;
  private wbuf = new Float32Array(3);
  private readonly cell: number;
  private readonly n: number;
  // counters since the last sample
  private cBuilt = 0;
  private cBreached = 0;
  private cMeadows = 0;
  private cLeft = 0;
  private cFounded = 0;
  private cKits = 0;
  private cDispersed = 0;

  constructor(
    private readonly a: Agents,
    private readonly p: Params,
    private readonly env: Environment,
    seed: number,
    private readonly world: World,
    private readonly veg: Vegetation,
    private readonly h: BeaverHost,
    pondHost: PondHost,
  ) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:beaver`));
    this.P = p.species[Sp.Beaver];
    this.cell = world.cell;
    this.n = world.n;
    this.ponds = new Ponds(world, veg, p, pondHost);
    this.buildSites();
  }

  // ------------------------------------------------------------------ sites

  /** Food index around a point: trees of 3 m and more within the radius count 1, shrub clumps 0.35. */
  foodAround(x: number, y: number): number {
    const r = this.p.beaverFoodRadius, r2 = r * r, w = this.world;
    let f = 0;
    const t = w.trees;
    for (let k = 0; k + 3 < t.length; k += 4) {
      if (t[k + 2] < 3) continue;
      const dx = t[k] - x, dy = t[k + 1] - y;
      if (dx * dx + dy * dy <= r2) f += 1;
    }
    const s = w.shrubs;
    for (let k = 0; k + 2 < s.length; k += 3) {
      const dx = s[k] - x, dy = s[k + 1] - y;
      if (dx * dx + dy * dy <= r2) f += 0.35;
    }
    return f;
  }

  /** Tree and shrub spots within the foraging range of a point, up to SPOTS of them (the ones nearest first). */
  private spotsAround(x: number, y: number): Float32Array {
    const r = this.p.beaverRange, r2 = r * r, w = this.world;
    const found: [number, number, number][] = [];
    const t = w.trees;
    for (let k = 0; k + 3 < t.length; k += 4) {
      if (t[k + 2] < 3) continue;
      const dx = t[k] - x, dy = t[k + 1] - y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) found.push([d2, t[k], t[k + 1]]);
    }
    const s = w.shrubs;
    for (let k = 0; k + 2 < s.length; k += 3) {
      const dx = s[k] - x, dy = s[k + 1] - y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) found.push([d2, s[k], s[k + 1]]);
    }
    found.sort((u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2]);
    const out = new Float32Array(Math.min(SPOTS, found.length) * 2);
    for (let k = 0; k < out.length / 2; k++) { out[2 * k] = found[k][1]; out[2 * k + 1] = found[k][2]; }
    return out;
  }

  private buildSites(): void {
    const po = this.ponds, p = this.p, size = this.world.size;
    const cand: Site[] = [];
    for (let k = 0; k < po.nodeN; k++) {
      const x = po.nx[k], y = po.ny[k];
      if (x < 25 || y < 25 || x > size - 25 || y > size - 25) continue;
      const f0 = this.foodAround(x, y);
      if (f0 < p.beaverFoodMin) continue;
      const pot = po.potential(k, p.beaverCrestMax);
      // a reach that would drown a whole flat basin (over 450 cells, 1,800 m2) is too broad for a beaver dam
      if (pot < 12 || pot > 450) continue;
      cand.push({ node: k, x, y, f0, pot, food: 1, colony: -1, spots: new Float32Array(0), score: f0 + 0.1 * Math.min(pot, 200) });
    }
    cand.sort((u, v) => v.score - u.score || u.node - v.node);
    const gap = p.beaverSpacing * 0.65;
    for (const c of cand) {
      let ok = true;
      for (const s of this.sites) if (Math.hypot(s.x - c.x, s.y - c.y) < gap) { ok = false; break; }
      if (!ok) continue;
      // the lodge stands 8 m above the dam; spots are measured from it
      const lk = Math.max(0, c.node - 2);
      c.spots = this.spotsAround(po.nx[lk], po.ny[lk]);
      this.sites.push(c);
    }
  }

  /** Is the site free for a colony: none within beaverSpacing, no dam still standing there, and the stand has grown back to half. */
  private siteFree(s: Site): boolean {
    if (s.colony >= 0 || s.food < 0.5) return false;
    const sp = this.p.beaverSpacing;
    for (const o of this.sites) if (o !== s && o.colony >= 0 && Math.hypot(o.x - s.x, o.y - s.y) < sp) return false;
    for (const d of this.ponds.dams) if (Math.hypot(d.x - s.x, d.y - s.y) < sp) return false;
    return true;
  }

  private bestFree(x: number, y: number): number {
    let best = -1, bv = -1e9;
    for (let k = 0; k < this.sites.length; k++) {
      const s = this.sites[k];
      if (!this.siteFree(s)) continue;
      const v = s.f0 * s.food + 0.05 * Math.min(s.pot, 200) - Math.hypot(s.x - x, s.y - y) / 10;
      if (v > bv) { bv = v; best = k; }
    }
    return best;
  }

  // ------------------------------------------------------------------ slots

  private ensure(): void {
    const cap = this.a.cap;
    if (cap <= this.cap) return;
    const g = <T extends { set(a: ArrayLike<number>): void }>(C: new (n: number) => T, prev: T): T => {
      const o = new C(cap);
      o.set(prev as unknown as ArrayLike<number>);
      return o;
    };
    this.sid = g(Uint32Array, this.sid);
    this.col = g(Int16Array, this.col);
    this.job = g(Uint8Array, this.job);
    this.jt = g(Int16Array, this.jt);
    this.wx = g(Float32Array, this.wx);
    this.wy = g(Float32Array, this.wy);
    this.tsite = g(Int16Array, this.tsite);
    this.cap = cap;
  }

  private slot(i: number): void {
    this.ensure();
    if (this.sid[i] !== this.a.id[i]) {
      this.sid[i] = this.a.id[i];
      this.col[i] = -1;
      this.job[i] = REST;
      this.jt[i] = 0;
      this.tsite[i] = -1;
    }
  }

  private colonyOf(i: number): Colony | null {
    const c = this.col[i];
    return c >= 0 && c < this.colonies.length && this.colonies[c].state === 0 ? this.colonies[c] : null;
  }

  private spawn(x: number, y: number, age: number, male: number, energy: number, col: number, job: number): number {
    const a = this.a, i = a.spawn();
    this.ensure();
    a.sp[i] = Sp.Beaver;
    a.x[i] = x;
    a.y[i] = y;
    a.heading[i] = this.rng.range(-Math.PI, Math.PI);
    a.male[i] = male;
    a.age[i] = age;
    a.born[i] = this.h.tick - age;
    a.energy[i] = energy;
    a.hydration[i] = 1;
    a.state[i] = St.Rest;
    for (let g = 0; g < NG; g++) a.genes[i * NG + g] = g === G_COAT ? this.coat() : 1;
    this.sid[i] = a.id[i];
    this.col[i] = col;
    this.job[i] = job;
    this.jt[i] = 0;
    this.tsite[i] = -1;
    this.h.markPresent();
    return i;
  }

  private coat(): number {
    const c = 0.7 + (this.rng.next() - 0.5) * 0.2;
    return c < 0.45 ? 0.45 : c > 0.9 ? 0.9 : c;
  }

  // ------------------------------------------------------------------ colonies

  /** Found a colony at a site with the given animals (already spawned or dispersers). Returns it, or null when no slot is free. */
  private found(si: number, members: number[]): Colony | null {
    if (this.colonies.length >= MAX_COLONIES) return null;
    const s = this.sites[si], po = this.ponds, a = this.a;
    const lk = Math.max(0, s.node - 2);
    const dam = po.addDam(s.node, this.nextColony, this.h.tick, 0, this.p.beaverCrestMax);
    const c: Colony = { id: this.nextColony++, site: si, x: po.nx[lk], y: po.ny[lk], dam, state: 0, born: this.h.tick, members: members.length, adults: 0, hungry: 0 };
    this.colonies.push(c);
    s.colony = c.id;
    this.cFounded++;
    for (const i of members) {
      this.slot(i);
      this.col[i] = c.id;
      this.job[i] = HOME;
      this.tsite[i] = -1;
      this.wx[i] = c.x;
      this.wy[i] = c.y;
      if (a.age[i] >= this.P.matureAge) c.adults++;
    }
    return c;
  }

  /** The sim calls this once after the world is populated: `beaver.initial` founders in colonies of beaverColonySize on the best free sites. */
  seedFounders(): void {
    let left = Math.round(this.P.initial);
    const size = Math.max(2, Math.min(6, Math.round(this.p.beaverColonySize)));
    const r = this.rng;
    while (left > 0) {
      const si = this.bestFree(this.world.size / 2, this.world.size / 2);
      if (si < 0) break;
      const s = this.sites[si];
      const m = Math.min(left, size);
      const slots: number[] = [];
      const lk = Math.max(0, s.node - 2);
      for (let q = 0; q < m; q++) {
        // the first two are the breeding pair (adults), the rest yearlings and young adults
        const age = q < 2 ? Math.round(this.P.matureAge * (1.1 + r.next() * 1.3)) : Math.round(this.P.matureAge * (0.3 + r.next() * 1.3));
        const i = this.spawn(this.ponds.nx[lk] + r.range(-3, 3), this.ponds.ny[lk] + r.range(-3, 3), age, q === 0 ? 1 : q === 1 ? 0 : r.next() < 0.5 ? 1 : 0, 0.75 + r.next() * 0.2, -1, HOME);
        slots.push(i);
      }
      this.found(si, slots);
      left -= m;
    }
  }

  // ------------------------------------------------------------------ per tick

  /** Called every tick while any beaver, colony or dam exists. */
  step(t: number): void {
    if (t % BEAVER_STEP !== 0) return;
    this.ponds.stepMeadow(t);
    this.census();
    const yt = this.env.yearTick(t);
    const yr = Math.floor(t / YEAR_TICKS);
    if (yr !== this.lastYear && yt >= Math.round(0.5 * SEASON_TICKS) && yt < Math.round(1.5 * SEASON_TICKS)) {
      this.lastYear = yr;
      this.yearly();
    }
    this.colonyStep(t);
    this.floaters(t);
    this.damStep();
  }

  /** Count the members of each colony. */
  private census(): void {
    const a = this.a;
    for (const c of this.colonies) { c.members = 0; c.adults = 0; }
    this.ensure();
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Beaver) continue;
      if (this.sid[i] !== a.id[i]) this.slot(i);
      const k = this.col[i];
      if (k < 0 || k >= this.colonies.length) continue;
      const c = this.colonies[k];
      c.members++;
      if (a.age[i] >= this.P.matureAge) c.adults++;
    }
  }

  /** Stand, leaving and dying out. */
  private colonyStep(t: number): void {
    const p = this.p, dt = BEAVER_STEP / BASE_YEAR_TICKS;
    // every stand grows back (the consumption is taken as the animals gnaw)
    for (const s of this.sites) if (s.food < 1) s.food = Math.min(1, s.food + p.beaverRegrow * (1 - s.food) * dt);
    for (const c of this.colonies) {
      if (c.state !== 0) continue;
      const s = this.sites[c.site];
      if (c.members === 0 && t - c.born > BEAVER_STEP * 2) { this.abandon(c, 1); continue; }
      if (s.food < p.beaverFoodLeave) c.hungry += BEAVER_STEP; else c.hungry = Math.max(0, c.hungry - BEAVER_STEP);
      if (c.hungry >= SEASON_TICKS) this.abandon(c, 0);
    }
  }

  /** A colony ends: why 0 = out of food (the members leave), 1 = all of them died. */
  private abandon(c: Colony, why: number): void {
    const a = this.a, po = this.ponds;
    c.state = 1;
    this.sites[c.site].colony = -1;
    this.cLeft++;
    this.h.event('colonyLeft', Sp.Beaver, c.x, c.y, c.id, why);
    // the dam is no longer kept up: it decays over 2 to 4 valley years
    const d = c.dam;
    if (d.state !== DamState.Abandoned) {
      po.setState(d, DamState.Abandoned);
      d.fall = Math.max(d.crest, 0.2) / (YEAR_TICKS * (this.p.beaverDecayMin + this.rng.next() * (this.p.beaverDecayMax - this.p.beaverDecayMin)));
    }
    if (why === 1) return;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Beaver || this.col[i] !== c.id) continue;
      this.col[i] = -1;
      this.job[i] = DISPERSE;
      this.tsite[i] = -1;
      this.jt[i] = 0;
      this.cDispersed++;
    }
  }

  /** Spring: kits, crowded colonies push their extra adults out, and a pair may arrive from outside. */
  private yearly(): void {
    const a = this.a, p = this.p, P = this.P, r = this.rng;
    const cal = p.calendarScale > 0 ? p.calendarScale : 1;
    const oldM: number[] = new Array(this.colonies.length).fill(-1), oldF: number[] = new Array(this.colonies.length).fill(-1);
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Beaver || a.age[i] < P.matureAge) continue;
      const k = this.col[i];
      if (k < 0 || k >= this.colonies.length || this.colonies[k].state !== 0) continue;
      const arr = a.male[i] ? oldM : oldF;
      if (arr[k] < 0 || a.age[i] > a.age[arr[k]]) arr[k] = i;
    }
    for (const c of this.colonies) {
      if (c.state !== 0) continue;
      let m = oldM[c.id], f = oldF[c.id];
      const s = this.sites[c.site];
      // a colony with only one sex among its adults takes in a lone disperser of the other sex (within 150 m), so a widowed beaver can breed again
      if ((m < 0) !== (f < 0)) {
        const need = m < 0 ? 1 : 0;
        let best = -1, bd = 150 * 150;
        for (let i = 0; i < a.hi; i++) {
          if (!a.alive[i] || a.sp[i] !== Sp.Beaver || this.col[i] >= 0 || a.male[i] !== need || a.age[i] < P.matureAge) continue;
          const dx = a.x[i] - c.x, dy = a.y[i] - c.y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = i; }
        }
        if (best >= 0) { this.col[best] = c.id; this.job[best] = HOME; this.tsite[best] = -1; if (need === 1) m = best; else f = best; }
      }
      if (m >= 0 && f >= 0 && a.energy[f] > 0.4 && s.food >= 0.25) {
        const n = Math.max(1, Math.min(P.maxLitter, Math.round((P.litter / cal) * (0.5 + s.food) * r.range(0.8, 1.2))));
        for (let q = 0; q < n; q++) {
          const kit = this.spawn(c.x + r.range(-2, 2), c.y + r.range(-2, 2), 0, r.next() < 0.5 ? 1 : 0, 0.55, c.id, REST);
          a.mother[kit] = f;
          a.motherId[kit] = a.id[f];
          a.parentA[kit] = a.id[f];
          a.parentB[kit] = a.id[m];
          a.gen[kit] = Math.max(a.gen[f], a.gen[m]) + 1;
          a.children[f]++;
          a.children[m]++;
        }
        this.cKits += n;
        this.h.noteBirths(n);
      }
      // crowding: the non-breeding adults go
      if (c.members > p.beaverColonySize) {
        let sent = 0;
        for (let i = 0; i < a.hi && sent < 2; i++) {
          if (!a.alive[i] || a.sp[i] !== Sp.Beaver || this.col[i] !== c.id || a.age[i] < P.matureAge || i === m || i === f) continue;
          this.col[i] = -1;
          this.job[i] = DISPERSE;
          this.tsite[i] = -1;
          this.jt[i] = 0;
          this.cDispersed++;
          sent++;
        }
      }
    }
    // a pair from outside
    if (p.beavers > 0 && p.openPrairie > 0 && r.next() < p.beaverArrival / cal) {
      const si = this.bestFree(0, this.world.size / 2);
      if (si >= 0) {
        const po = this.ponds, k0 = r.next() < 0.5 ? 0 : po.nodeN - 1;
        for (let q = 0; q < 2; q++) {
          const i = this.spawn(po.nx[k0] + r.range(-2, 2), po.ny[k0] + r.range(-2, 2), Math.round(P.matureAge * r.range(1.1, 2.2)), q, 0.85, -1, DISPERSE);
          this.tsite[i] = si;
        }
        this.h.noteArrivals(2);
        this.h.event('immigrated', Sp.Beaver, po.nx[k0], po.ny[k0], 2, 0);
      }
    }
  }

  /** Dispersers that have arrived settle: two of the opposite sex near the same free site found a colony. */
  private floaters(t: number): void {
    const a = this.a;
    let any = false;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Beaver || this.col[i] >= 0 || this.job[i] !== DISPERSE) continue;
      any = true;
      break;
    }
    if (!any) return;
    const near: number[][] = this.sites.map(() => []);
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Beaver || this.col[i] >= 0 || this.job[i] !== DISPERSE) continue;
      let si = this.tsite[i];
      if (si < 0 || !this.siteFree(this.sites[si])) {
        si = this.bestFree(a.x[i], a.y[i]);
        this.tsite[i] = si;
      }
      if (si < 0) {
        this.jt[i] += BEAVER_STEP;
        if (this.jt[i] > 1500) this.h.leave(i);
        continue;
      }
      const s = this.sites[si];
      if (Math.hypot(a.x[i] - s.x, a.y[i] - s.y) < 30) near[si].push(i); // a young one may go with the pair
    }
    void t;
    for (let si = 0; si < near.length; si++) {
      const list = near[si];
      if (list.length < 2) continue;
      const m = list.findIndex((i) => a.male[i] === 1 && a.age[i] >= this.P.matureAge), f = list.findIndex((i) => a.male[i] === 0 && a.age[i] >= this.P.matureAge);
      if (m < 0 || f < 0 || !this.siteFree(this.sites[si])) continue;
      this.found(si, list.slice(0, 6));
    }
  }

  /** The dams: crests rise and fall, the pond is redrawn when it moved enough, and the events are told. */
  private damStep(): void {
    const p = this.p, po = this.ponds;
    const rise = (p.beaverCrestRate / SEASON_TICKS) * BEAVER_STEP;
    const rain = this.env.state.rain;
    const todo: Dam[] = [];
    for (const d of po.dams.slice()) {
      const c = d.colony >= 0 ? this.colonies[d.colony] : null;
      const alive = c !== null && c.state === 0;
      if (d.state === DamState.Building || d.state === DamState.Holding) {
        // a dam can fail on its own, more often in heavy rain
        if (d.crest >= 0.4 && p.beaverBreachYear > 0 && this.rng.next() < ((p.beaverBreachYear * (1 + 3 * rain)) * BEAVER_STEP) / YEAR_TICKS) { this.breach(d, 1); continue; }
        if (d.state === DamState.Building && alive) {
          po.setCrest(d, Math.min(d.maxCrest, d.crest + rise * Math.min(1, c!.adults / 2)));
          if (!d.built && d.crest >= 0.3) { d.built = true; this.cBuilt++; this.h.event('damBuilt', Sp.Beaver, d.x, d.y, d.id, c!.id); }
          if (d.crest >= d.maxCrest) { po.setState(d, DamState.Holding); todo.push(d); }
        }
      } else if (d.state === DamState.Breached) {
        po.setCrest(d, Math.max(0, d.crest - d.fall * BEAVER_STEP));
        if (d.crest <= 0.12) {
          if (alive && this.sites[c!.site].food >= p.beaverFoodLeave) { po.setState(d, DamState.Building); d.filled = false; }
          else { po.setState(d, DamState.Abandoned); d.fall = Math.max(0.2, d.maxCrest) / (YEAR_TICKS * (p.beaverDecayMin + this.rng.next() * (p.beaverDecayMax - p.beaverDecayMin))); }
        }
      } else {
        po.setCrest(d, Math.max(0, d.crest - d.fall * BEAVER_STEP));
      }
    }
    if (po.needsRefresh || todo.length > 0) {
      po.refresh();
      this.afterRefresh(todo);
    }
    // finished dams go (their water was drawn away in the refresh above)
    for (const d of po.dams.slice()) if (d.state === DamState.Abandoned && d.crest <= 0 && d.cells.length === 0) po.removeDam(d);
  }

  /** After the water was redrawn: pondFilled for dams that just reached full height, beaverMeadow for ponds that drained. */
  private afterRefresh(filled: Dam[]): void {
    for (const d of filled) {
      if (d.filled) continue;
      d.filled = true;
      const m2 = d.area * this.cell * this.cell;
      if (m2 >= 40) this.h.event('pondFilled', Sp.Beaver, d.x, d.y, Math.round(m2), d.id);
    }
    for (const d of this.ponds.dams) {
      if (d.peakArea > 0 && d.area <= 0.25 * d.peakArea && !d.meadowTold && (d.state === DamState.Breached || d.state === DamState.Abandoned) && d.peakArea * this.cell * this.cell >= 40) {
        d.meadowTold = true;
        this.cMeadows++;
        this.h.event('beaverMeadow', Sp.Beaver, d.x, d.y, Math.round((d.peakArea - d.area) * this.cell * this.cell), d.id);
      } else if (d.meadowTold && d.area > 0.5 * d.peakArea) {
        d.meadowTold = false;
      }
    }
  }

  private breach(d: Dam, cause: number): void {
    const po = this.ponds;
    po.setState(d, DamState.Breached);
    d.fall = d.crest / (SEASON_TICKS / 3);
    d.meadowTold = false;
    this.cBreached++;
    this.h.event('damBreached', Sp.Beaver, d.x, d.y, Math.round(d.crest * 100) / 100, cause);
  }

  /** A flood begins (S12 or the S17 tool): dams may fail. Own generator. */
  onFlood(severity: number): void {
    const p = this.p;
    for (const d of this.ponds.dams.slice()) {
      if ((d.state !== DamState.Building && d.state !== DamState.Holding) || d.crest < 0.3) continue;
      if (this.rng.next() < p.beaverBreachP * Math.min(1, severity) * Math.min(1, d.crest / d.maxCrest)) this.breach(d, 0);
    }
  }

  // ------------------------------------------------------------------ the animals

  /** Out of a wolf's reach: in the water (the pond, the creek, or the lodge in it). */
  safe(i: number): boolean {
    const w = this.world, c = Math.min(this.n - 1, Math.max(0, (this.a.y[i] / this.cell) | 0)) * this.n + Math.min(this.n - 1, Math.max(0, (this.a.x[i] / this.cell) | 0));
    return w.water[c] !== 0;
  }

  private inWater(x: number, y: number): boolean {
    const n = this.n, cell = this.cell;
    const c = Math.min(n - 1, Math.max(0, (y / cell) | 0)) * n + Math.min(n - 1, Math.max(0, (x / cell) | 0));
    return this.world.water[c] !== 0;
  }

  /** Nearest threat within `r` metres (wolf or cougar), or -1. */
  private threat(x: number, y: number, r: number): number {
    const a = this.a, g = this.h.pred, nb = g.nb, bs = g.bs;
    const rb = Math.ceil(r / bs);
    const bx = Math.min(nb - 1, Math.max(0, (x / bs) | 0)), by = Math.min(nb - 1, Math.max(0, (y / bs) | 0));
    let best = -1, bd = r * r;
    for (let yy = by - rb; yy <= by + rb; yy++) {
      if (yy < 0 || yy >= nb) continue;
      for (let xx = bx - rb; xx <= bx + rb; xx++) {
        if (xx < 0 || xx >= nb) continue;
        const b = yy * nb + xx;
        for (let k = g.start[b], e = g.start[b + 1]; k < e; k++) {
          const j = g.items[k];
          // a coyote is no danger to a grown beaver: only wolves and cougars send it running
          if (!a.alive[j] || (a.sp[j] !== Sp.Wolf && a.sp[j] !== Sp.Cougar)) continue;
          const dx = a.x[j] - x, dy = a.y[j] - y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = j; }
        }
      }
    }
    return best;
  }

  /** One think (the sim calls it every 4 ticks): choose the job and the wanted velocity. */
  think(i: number): void {
    const a = this.a, P = this.P, r = this.rng;
    this.slot(i);
    const x = a.x[i], y = a.y[i];
    const inW = this.inWater(x, y);
    const walk = P.walkSpeed, run = P.runSpeed, swim = this.p.beaverSwim;
    const c = this.colonyOf(i);
    let job = this.job[i];
    const kit = a.age[i] < P.matureAge;
    // predators: only on land (a beaver in the water is out of reach and goes about its business)
    const th = inW ? -1 : this.threat(x, y, FLEE_R);
    if (th >= 0 && job !== DISPERSE) {
      if (job !== FLEE) { job = FLEE; this.job[i] = FLEE; }
      a.flee[i] = 60;
    } else if (th >= 0) {
      a.flee[i] = 40;
    }
    let dvx = 0, dvy = 0, state: number = St.Idle;
    const go = (tx: number, ty: number, sp: number): number => {
      const dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
      dvx = (dx / d) * sp;
      dvy = (dy / d) * sp;
      return d;
    };
    const spd = (fast: boolean): number => (inW ? swim : fast ? run : walk);
    const d0 = this.env.state.dayFrac;
    const active = this.env.isNight() || (d0 > 0.2 && d0 < 0.32) || (d0 > 0.68 && d0 < 0.82);
    if (job === FLEE) {
      if (inW || (a.flee[i] <= 0 && th < 0)) { job = HOME; this.job[i] = HOME; }
      else {
        this.h.water(x, y, this.wbuf);
        dvx = this.wbuf[0] * run;
        dvy = this.wbuf[1] * run;
        state = St.Run;
      }
    } else if (job === DISPERSE) {
      state = this.dispersing(i, inW, go, spd);
    } else if (c === null) {
      // a beaver whose colony is gone and that is not dispersing yet
      this.job[i] = DISPERSE;
      this.jt[i] = 0;
    } else if (kit) {
      // kits stay at the lodge, fed from the stand
      const d = go(c.x, c.y, spd(false));
      if (d < 4) { dvx = dvy = 0; state = St.Rest; } else state = inW ? St.Swim : St.Walk;
    } else if (job === REST) {
      const d = go(c.x, c.y, spd(false));
      if (d > 6) { state = inW ? St.Swim : St.Walk; }
      else {
        dvx = dvy = 0;
        state = St.Rest;
        if (this.jt[i] > 0) this.jt[i] -= 4;
        else if (active || a.energy[i] < 0.4) {
          const dam = c.dam;
          const needsDam = dam.state === DamState.Building || dam.state === DamState.Breached;
          if (needsDam && a.age[i] >= P.matureAge && r.next() < 0.5) {
            job = BUILD;
            const off = r.range(-0.5, 0.5) * dam.len;
            this.wx[i] = dam.x + Math.cos(dam.ang) * off;
            this.wy[i] = dam.y + Math.sin(dam.ang) * off;
            this.jt[i] = Math.round(r.range(60, 120));
          } else if (a.energy[i] < 0.75 || r.next() < 0.2) {
            const sp = this.sites[c.site].spots;
            if (sp.length >= 2) {
              // the nearer trees first (the spots are sorted by distance from the lodge)
              const k = r.int(Math.min(16, sp.length / 2));
              this.wx[i] = sp[2 * k];
              this.wy[i] = sp[2 * k + 1];
              // not while a wolf or a cougar is about the tree, unless it is hungry enough to risk it
              if (a.energy[i] > 0.25 && this.threat(this.wx[i], this.wy[i], 40) >= 0) this.jt[i] = 120;
              else { job = FORAGE; this.jt[i] = Math.round(r.range(40, 90)); }
            } else this.jt[i] = 200;
          } else this.jt[i] = Math.round(r.range(60, 200));
          this.job[i] = job;
        } else this.jt[i] = 40;
      }
    }
    if (job === BUILD) {
      const d = go(this.wx[i], this.wy[i], spd(false));
      if (d < 3) { dvx = dvy = 0; state = St.Build; this.jt[i] -= 4; if (this.jt[i] <= 0) this.job[i] = HOME; } else state = inW ? St.Swim : St.Walk;
    } else if (job === FORAGE) {
      const d = go(this.wx[i], this.wy[i], spd(false));
      if (d < 2) { this.job[i] = GNAW; state = St.Graze; dvx = dvy = 0; } else state = inW ? St.Swim : St.Walk;
      if (a.flee[i] > 0) this.job[i] = HOME;
    } else if (job === GNAW) {
      dvx = dvy = 0;
      state = St.Graze;
      this.jt[i] -= 4;
      if (this.jt[i] <= 0 || a.energy[i] > 0.97) { this.job[i] = HOME; this.jt[i] = Math.round(r.range(40, 160)); }
    } else if (job === HOME && c !== null) {
      const d = go(c.x, c.y, spd(false));
      if (d < 5) { this.job[i] = REST; dvx = dvy = 0; state = St.Rest; } else state = inW ? St.Swim : St.Walk;
    }
    a.dvx[i] = dvx;
    a.dvy[i] = dvy;
    a.state[i] = state;
    if (a.flee[i] > 0 && state !== St.Run && inW) a.state[i] = St.Swim;
  }

  /** A disperser: walk to the creek, follow it to the target site. Returns the state. */
  private dispersing(i: number, inW: boolean, go: (tx: number, ty: number, sp: number) => number, spd: (fast: boolean) => number): number {
    const a = this.a, po = this.ponds;
    const x = a.x[i], y = a.y[i];
    let si = this.tsite[i];
    if (si < 0 || !this.siteFree(this.sites[si])) {
      si = this.bestFree(x, y);
      this.tsite[i] = si;
    }
    if (si < 0) {
      // nothing free: stay near the water and wait (floaters() sends it away in the end)
      return inW ? St.Swim : St.Idle;
    }
    const s = this.sites[si];
    const cur = po.nearestNode(x, y);
    const dc = Math.hypot(po.nx[cur] - x, po.ny[cur] - y);
    if (dc > 6) { go(po.nx[cur], po.ny[cur], spd(false)); return inW ? St.Swim : St.Walk; }
    const lk = Math.max(0, s.node - 2);
    let next = cur;
    if (cur < lk) next = Math.min(lk, cur + 2);
    else if (cur > lk) next = Math.max(lk, cur - 2);
    if (next === cur) {
      const d = go(s.x, s.y, spd(false));
      if (d < 6) { go(s.x, s.y, 0); return St.Swim; }
    } else go(po.nx[next], po.ny[next], spd(false));
    return inW ? St.Swim : St.Walk;
  }

  /** Every tick: eat or draw on the stand, move, and the body's upkeep. */
  live(i: number): void {
    const a = this.a, P = this.P, p = this.p;
    this.slot(i);
    const st = a.state[i];
    const job = this.job[i];
    // food
    if (st === St.Graze && job === GNAW) {
      const c = this.colonyOf(i);
      if (c !== null) {
        const s = this.sites[c.site];
        const eff = Math.min(1, s.food / 0.3);
        a.energy[i] = Math.min(1, a.energy[i] + GAIN * eff);
        s.food = Math.max(0, s.food - p.beaverFoodRate / (Math.max(8, s.f0) * BASE_YEAR_TICKS * GNAW_DUTY));
        const cc = this.veg.cellAt(a.x[i], a.y[i]);
        if (this.veg.browse[cc] > 0.01) this.veg.browse[cc] -= 0.0012;
      }
    } else if (job === DISPERSE) {
      // a disperser browses the banks as it goes (no stand of its own to draw on)
      a.energy[i] = Math.min(1, a.energy[i] + DISPERSER_GAIN);
    } else if (a.age[i] < P.matureAge && job === REST) {
      const c = this.colonyOf(i);
      if (c !== null) {
        const s = this.sites[c.site];
        a.energy[i] = Math.min(1, a.energy[i] + KIT_GAIN * Math.min(1, s.food / 0.3));
        s.food = Math.max(0, s.food - (KIT_GAIN * p.beaverFoodRate) / (GAIN * Math.max(8, s.f0) * BASE_YEAR_TICKS * GNAW_DUTY));
      }
    }
    this.move(i);
    this.h.vitals(i);
  }

  private move(i: number): void {
    const a = this.a, w = this.world;
    const dvx = a.dvx[i], dvy = a.dvy[i];
    const dsp = Math.sqrt(dvx * dvx + dvy * dvy);
    let vx = a.vx[i], vy = a.vy[i];
    vx += (dvx - vx) * 0.2;
    vy += (dvy - vy) * 0.2;
    if (dsp < 0.02 && vx * vx + vy * vy < 0.0004) { vx = 0; vy = 0; }
    let x = a.x[i] + vx * DT, y = a.y[i] + vy * DT;
    if (x < 1) { x = 1; vx = Math.abs(vx); } else if (x > w.size - 1) { x = w.size - 1; vx = -Math.abs(vx); }
    if (y < 1) { y = 1; vy = Math.abs(vy); } else if (y > w.size - 1) { y = w.size - 1; vy = -Math.abs(vy); }
    a.x[i] = x;
    a.y[i] = y;
    a.vx[i] = vx;
    a.vy[i] = vy;
    if (vx * vx + vy * vy > 0.0025) a.heading[i] = Math.atan2(vy, vx);
    // a swimming animal reads as swimming whatever its think said last
    if (a.state[i] === St.Walk && this.inWater(x, y)) a.state[i] = St.Swim;
  }

  // ------------------------------------------------------------------ god tool

  /** The god tool: `count` beavers (alternating sex) set down at (x, y) (default: the middle of the creek); they head for the creek and the best free site nearby. Returns how many. */
  introduce(count: number, x?: number, y?: number): number {
    const r = this.rng, P = this.P;
    if (x === undefined || y === undefined) {
      const mid = this.ponds.nodeN >> 1;
      x = this.ponds.nx[mid];
      y = this.ponds.ny[mid];
    }
    const si = this.bestFree(x, y);
    let n = 0;
    for (let q = 0; q < count; q++) {
      const i = this.spawn(x + r.range(-4, 4), y + r.range(-4, 4), Math.round(P.matureAge * r.range(1.1, 2.2)), q % 2, 0.85, -1, DISPERSE);
      this.tsite[i] = si;
      n++;
    }
    return n;
  }

  // ------------------------------------------------------------------ readings

  activeColonies(): number {
    let n = 0;
    for (const c of this.colonies) if (c.state === 0) n++;
    return n;
  }

  /** Lodges for the frame: x, y, size (0..1, how many live there / 8), 1 if the colony is active. Stride 4. */
  lodgeArray(): Float32Array {
    const live = this.colonies.filter((c) => c.state === 0 || c.dam.crest > 0.1);
    const out = new Float32Array(live.length * 4);
    live.forEach((c, k) => out.set([c.x, c.y, Math.min(1, c.members / 8), c.state === 0 ? 1 : 0], k * 4));
    return out;
  }

  sampleRow(row: Record<string, number>): void {
    const po = this.ponds;
    let ponds = 0, dams = 0;
    for (const d of po.dams) { if (d.crest >= 0.3) dams++; if (d.area > 0) ponds++; }
    let food = 0, fn = 0;
    for (const c of this.colonies) if (c.state === 0) { food += this.sites[c.site].food; fn++; }
    const dr = po.drainSample();
    row.beaver_colonies = this.activeColonies();
    row.beaver_dams = dams;
    row.beaver_ponds = ponds;
    row.beaver_pond_area = po.waterArea();
    row.beaver_meadow_area = po.meadowArea();
    row.beaver_food = fn ? food / fn : NaN;
    row.beaver_dams_built = this.cBuilt;
    row.beaver_dams_breached = this.cBreached;
    row.beaver_meadows = this.cMeadows;
    row.beaver_left = this.cLeft;
    row.beaver_founded = this.cFounded;
    row.beaver_kits = this.cKits;
    row.beaver_dispersed = this.cDispersed;
    row.beaver_trees_drowned = dr.drowned;
    this.cBuilt = this.cBreached = this.cMeadows = this.cLeft = this.cFounded = this.cKits = this.cDispersed = 0;
  }
}

/** Zero row for a sim with beavers off (same columns, so every CSV has them). */
export function emptyBeaverRow(row: Record<string, number>): void {
  row.beaver_colonies = 0;
  row.beaver_dams = 0;
  row.beaver_ponds = 0;
  row.beaver_pond_area = 0;
  row.beaver_meadow_area = 0;
  row.beaver_food = NaN;
  row.beaver_dams_built = 0;
  row.beaver_dams_breached = 0;
  row.beaver_meadows = 0;
  row.beaver_left = 0;
  row.beaver_founded = 0;
  row.beaver_kits = 0;
  row.beaver_dispersed = 0;
  row.beaver_trees_drowned = 0;
}

