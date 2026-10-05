// Canid disease (V2-PLAN.md S2): distemper (CDV) and sarcoptic mange. Both are off unless cdvRate / mangeRate > 0.
//
// Determinism: every draw here comes from a private generator seeded with hashSeed(seed + ':disease'), never from the
// main sim stream, and every hook in sim.ts is a plain boolean test when the feature is off. So with the defaults the
// golden hash is untouched.
//
// State lives in two Agents fields that are only meaningful for canids: `cdv` (ticks of distemper left, 0 = healthy)
// and `mange` (severity 0..1). Immunity after distemper reuses `immune`, which vitals() already counts down.
//
// Hooks in sim.ts: Disease.step() once per tick, tickCdv() from vitals(), metabMult() from metabolism(),
// packSpread() from thinkWolf(), onFeed() from liveWolf()'s feeding branch, mangeSpeed() on the hunting speed, and
// maybeSeedMangeOnImmigrant() from whatever spawns immigrants (S1).
import { Agents } from './agents';
import { Environment } from './env';
import { Params } from './params';
import { hashSeed, Rng } from './rng';
import { SPECIES, SPECIES_BY_KEY } from './species';
import { BASE_YEAR_TICKS, DAY_TICKS, SEASON_TICKS } from './types';

/** Which registry species are canids. Wolves and coyotes share distemper and mange. */
export const CANID_KEYS: string[] = ['wolf', 'coyote'];
export const IS_CANID: Uint8Array = (() => {
  const t = new Uint8Array(SPECIES.length);
  for (const k of CANID_KEYS) {
    const d = SPECIES_BY_KEY[k];
    if (d) t[d.id] = 1;
  }
  return t;
})();
export function isCanid(sp: number): boolean {
  return IS_CANID[sp] === 1;
}

/** Coyote families get group keys from here up, so they never collide with a wolf pack id (0..63). */
export const COYOTE_GROUP_BASE = 1000;

/** Energy drain multiplier while distemper-sick. */
export const CDV_DRAIN = 1.5;
/** Per think, per susceptible packmate, from an infected pack member. */
export const CDV_PACK_CHANCE = 0.02;
/** A carcass site stays infectious this many ticks after an infected canid last fed there. */
export const CDV_SITE_TICKS = 40;
/** Chance a susceptible canid catches distemper at an infectious site (rolled at most once per site window). */
export const CDV_SITE_CHANCE = 0.3;
/** Hunting speed is multiplied by (1 - MANGE_SPEED * severity). */
export const MANGE_SPEED = 0.1;
/** Severity of a fresh mange case. */
export const MANGE_START = 0.05;
/** The mange scan (growth, recovery, spread) runs every this many ticks. */
const SCAN = 20;
/** Valley-year positions of the yearly checks (in seasons). */
const CDV_SEASON = 1.2;
const MANGE_SEASON = 2.2;
const SITE_RADIUS2 = 36;
const MAX_SITES = 64;

export interface DiseaseHost {
  readonly tick: number;
  event(kind: 'distemper' | 'mange', sp: number, x: number, y: number, a: number, b: number): void;
  /** Kill animal i with the cause 'disease'. */
  kill(i: number): void;
  story(i: number, kind: 'infected' | 'recovered'): void;
  packSerial(pk: number): number;
  /** The group canid i spreads disease inside: its wolf pack id, or a coyote family key (always >= COYOTE_GROUP_BASE), or -1 for a loner. */
  group(i: number): number;
}

export class Disease {
  readonly rng: Rng;
  cdvOn: boolean;
  readonly mangeOn: boolean;
  on: boolean;

  // distemper outbreak bookkeeping
  private cdvActive = false;
  private lastActive = -1e9;
  private obSp = 1;
  private obX = 0;
  private obY = 0;
  private obPups = 0;
  private obAdults = 0;
  private rollLast = new Int32Array(0);
  private siteX = new Float32Array(MAX_SITES);
  private siteY = new Float32Array(MAX_SITES);
  private siteT = new Int32Array(MAX_SITES).fill(-1e9);
  private siteN = 0;

  // mange bookkeeping
  private mangePacks = new Set<number>();
  private cases = new Map<number, number>();
  private firstCase = new Map<number, number>();

  // counters
  outbreaks = 0;
  mangeEvents = 0;
  /** Course outcomes of distemper, for tests and charts. */
  pupDied = 0;
  pupSurvived = 0;
  adultDied = 0;
  adultSurvived = 0;
  private sampleOutbreaks = 0;
  private sampleDeaths = 0;
  private sampleMangeEvents = 0;

  constructor(
    private readonly a: Agents,
    private readonly p: Params,
    private readonly env: Environment,
    seed: number,
    private readonly host: DiseaseHost,
  ) {
    this.rng = new Rng(hashSeed(seed + ':disease'));
    this.cdvOn = p.cdvRate > 0;
    this.mangeOn = p.mangeRate > 0;
    this.on = this.cdvOn || this.mangeOn;
  }

  // ------------------------------------------------------------------ per-tick driver

  /** Call once per tick after the population counts are refreshed. wolves = current wolf count. */
  step(wolves: number): void {
    const t = this.host.tick;
    const yt = this.env.yearTick(t);
    if (this.cdvOn && yt === Math.round(CDV_SEASON * SEASON_TICKS)) this.maybeOutbreak(wolves);
    if (this.mangeOn && yt === Math.round(MANGE_SEASON * SEASON_TICKS)) this.maybeIntroduceMange(wolves);
    if (t % SCAN === 0) {
      if (this.mangeOn) this.mangeScan();
      if (this.cdvActive) this.cdvScan();
    }
  }

  // ------------------------------------------------------------------ distemper

  /** Outbreak chance this year for a given wolf count: cdvRate * (wolves / 60)^2, capped at 2x. */
  outbreakChance(wolves: number): number {
    const k = wolves / 60;
    return this.p.cdvRate * Math.min(2, k * k);
  }

  private maybeOutbreak(wolves: number): void {
    if (!this.rng.chance(this.outbreakChance(wolves))) return;
    this.startOutbreak(1 + this.rng.int(2));
  }

  /** The god tool needs distemper to run even at cdvRate 0: switch the illness on (outbreaks still only start by hand while the rate is 0). */
  forceOn(): void {
    this.cdvOn = true;
    this.on = true;
  }

  /** Infect up to n random susceptible canids (an outbreak starting), only of species `only` when given. Returns how many were infected. */
  startOutbreak(n: number, only = -1): number {
    const a = this.a;
    const cand: number[] = [];
    for (let i = 0; i < a.hi; i++) {
      if (a.alive[i] && IS_CANID[a.sp[i]] && (only < 0 || a.sp[i] === only) && a.cdv[i] === 0 && a.immune[i] === 0) cand.push(i);
    }
    let done = 0;
    while (done < n && cand.length > 0) {
      const k = this.rng.int(cand.length);
      this.infect(cand[k]);
      cand[k] = cand[cand.length - 1];
      cand.pop();
      done++;
    }
    return done;
  }

  /** Give canid i distemper (no checks on prior immunity: callers decide). */
  infect(i: number): void {
    const a = this.a;
    a.cdv[i] = Math.min(65535, Math.max(1, Math.round(this.p.cdvTicks)));
    if (!this.cdvActive) {
      this.cdvActive = true;
      this.obSp = a.sp[i];
      this.obX = a.x[i];
      this.obY = a.y[i];
      this.obPups = 0;
      this.obAdults = 0;
    }
    this.lastActive = this.host.tick;
    this.host.story(i, 'infected');
  }

  /** Count down animal i's illness. Returns true when it died of it (the host has already killed it). */
  tickCdv(i: number): boolean {
    const a = this.a;
    if (--a.cdv[i] > 0) return false;
    a.cdv[i] = 0;
    const pup = a.age[i] < this.p.species[a.sp[i]].matureAge;
    const p = pup ? this.p.cdvPupDeath : this.p.cdvAdultDeath;
    if (this.rng.chance(p)) {
      if (pup) { this.pupDied++; this.obPups++; } else { this.adultDied++; this.obAdults++; }
      this.sampleDeaths++;
      this.host.kill(i);
      return true;
    }
    if (pup) this.pupSurvived++; else this.adultSurvived++;
    a.immune[i] = Math.round(this.p.cdvImmuneYears * BASE_YEAR_TICKS);
    this.host.story(i, 'recovered');
    return false;
  }

  /** An infected pack member's think: each susceptible packmate has a small chance of catching it. */
  packSpread(i: number, list: Int32Array, n: number): void {
    const a = this.a;
    const pk = this.host.group(i);
    if (pk < 0) return;
    for (let k = 0; k < n; k++) {
      const j = list[k];
      if (j === i || !a.alive[j] || this.host.group(j) !== pk || !IS_CANID[a.sp[j]] || a.cdv[j] > 0 || a.immune[j] > 0) continue;
      if (this.rng.chance(CDV_PACK_CHANCE)) this.infect(j);
    }
  }

  /** Canid i is feeding at a carcass this tick: infected feeders contaminate the spot, susceptible ones may catch it. */
  onFeed(i: number): void {
    if (!this.cdvActive) return;
    const a = this.a;
    const t = this.host.tick;
    const x = a.x[i], y = a.y[i];
    if (a.cdv[i] > 0) {
      for (let s = 0; s < this.siteN; s++) {
        const dx = this.siteX[s] - x, dy = this.siteY[s] - y;
        if (dx * dx + dy * dy < SITE_RADIUS2) { this.siteT[s] = t; return; }
      }
      const s = this.siteN < MAX_SITES ? this.siteN++ : this.oldestSite();
      this.siteX[s] = x; this.siteY[s] = y; this.siteT[s] = t;
      return;
    }
    if (a.immune[i] > 0) return;
    if (this.rollLast.length < a.cap) {
      const n = new Int32Array(a.cap).fill(-1000);
      n.set(this.rollLast);
      this.rollLast = n;
    }
    if (t - this.rollLast[i] < CDV_SITE_TICKS) return;
    for (let s = 0; s < this.siteN; s++) {
      if (t - this.siteT[s] > CDV_SITE_TICKS) continue;
      const dx = this.siteX[s] - x, dy = this.siteY[s] - y;
      if (dx * dx + dy * dy < SITE_RADIUS2) {
        this.rollLast[i] = t;
        if (this.rng.chance(CDV_SITE_CHANCE)) this.infect(i);
        return;
      }
    }
  }

  private oldestSite(): number {
    let o = 0;
    for (let s = 1; s < this.siteN; s++) if (this.siteT[s] < this.siteT[o]) o = s;
    return o;
  }

  /** Every SCAN ticks while an outbreak is open: close it once nobody is sick and the carcass sites have gone quiet. */
  private cdvScan(): void {
    const a = this.a;
    const t = this.host.tick;
    let sick = 0;
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && IS_CANID[a.sp[i]] && a.cdv[i] > 0) sick++;
    if (sick > 0) { this.lastActive = t; return; }
    if (t - this.lastActive <= CDV_SITE_TICKS) return;
    this.cdvActive = false;
    this.siteN = 0;
    this.outbreaks++;
    this.sampleOutbreaks++;
    this.host.event('distemper', this.obSp, this.obX, this.obY, this.obPups, this.obAdults);
  }

  /** Energy drain multiplier and winter cold cost for canid i. Call only when `on`. */
  metabMult(i: number, warmth: number): number {
    const a = this.a;
    let m = 1;
    if (a.cdv[i] > 0) m *= CDV_DRAIN;
    const sev = a.mange[i];
    if (sev > 0) {
      // the cold term of metabolism is 0.25 * (1 - warmth): mange multiplies that part only
      const cold = 0.25 * (1 - warmth);
      m *= (1 + cold * (1 + this.p.mangeColdK * sev)) / (1 + cold);
    }
    return m;
  }

  // ------------------------------------------------------------------ mange

  /** Hunting speed factor for canid i (exactly 1 when healthy). */
  mangeSpeed(i: number): number {
    return 1 - MANGE_SPEED * this.a.mange[i];
  }

  /** Yearly: with chance mangeRate a case arrives in the valley when there are more than 30 wolves. */
  private maybeIntroduceMange(wolves: number): void {
    if (wolves <= 30) return;
    if (!this.rng.chance(this.p.mangeRate)) return;
    const a = this.a;
    const cand: number[] = [];
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && IS_CANID[a.sp[i]] && a.mange[i] === 0) cand.push(i);
    if (cand.length === 0) return;
    a.mange[cand[this.rng.int(cand.length)]] = MANGE_START;
  }

  /** Hook for immigrant spawns (S1): call with the new immigrant's slot. Returns true when it carries mange. */
  maybeSeedMangeOnImmigrant(i: number): boolean {
    if (!this.mangeOn || !IS_CANID[this.a.sp[i]]) return false;
    if (!this.rng.chance(this.p.mangeImmigrantShare)) return false;
    this.a.mange[i] = MANGE_START;
    return true;
  }

  /** Every SCAN ticks: severity grows, some recover, mange spreads inside packs, and new packs raise the event. */
  private mangeScan(): void {
    const a = this.a, p = this.p;
    const yr = SCAN / BASE_YEAR_TICKS;
    const cases = this.cases, first = this.firstCase;
    cases.clear();
    first.clear();
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || !IS_CANID[a.sp[i]] || a.mange[i] <= 0) continue;
      if (a.energy[i] > 0.7 && this.rng.chance(p.mangeRecover * yr)) { a.mange[i] = 0; continue; }
      a.mange[i] = Math.min(1, a.mange[i] + p.mangeGrowth * yr);
      const pk = this.host.group(i);
      if (pk >= 0) {
        cases.set(pk, (cases.get(pk) ?? 0) + 1);
        if (!first.has(pk)) first.set(pk, i);
      }
    }
    if (cases.size === 0) { this.mangePacks.clear(); return; }
    // spread: per day, per sick packmate
    const day = SCAN / DAY_TICKS;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || !IS_CANID[a.sp[i]] || a.mange[i] > 0) continue;
      const c = cases.get(this.host.group(i));
      if (!c) continue;
      if (this.rng.chance(1 - Math.pow(1 - p.mangeSpread, c * day))) a.mange[i] = MANGE_START;
    }
    // the first case in a pack raises the event; a pack that has cleared the disease can raise it again later
    const live = new Set<number>();
    for (const [pk, i] of first) {
      const serial = this.host.packSerial(pk);
      live.add(serial);
      if (!this.mangePacks.has(serial)) {
        this.mangePacks.add(serial);
        this.mangeEvents++;
        this.sampleMangeEvents++;
        this.host.event('mange', a.sp[i], a.x[i], a.y[i], serial, 0);
      }
    }
    for (const s of this.mangePacks) if (!live.has(s)) this.mangePacks.delete(s);
  }

  // ------------------------------------------------------------------ reporting

  /** Counters since the last call, for sample(). */
  drainSample(): { outbreaks: number; deaths: number; mangeEvents: number } {
    const r = { outbreaks: this.sampleOutbreaks, deaths: this.sampleDeaths, mangeEvents: this.sampleMangeEvents };
    this.sampleOutbreaks = 0;
    this.sampleDeaths = 0;
    this.sampleMangeEvents = 0;
    return r;
  }
}
