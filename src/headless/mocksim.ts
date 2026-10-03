// A fast stochastic toy ecosystem implementing SimLike, used to build and test the headless harness before (or
// without) the real simulation. NOT the game: a 5x5 patch metapopulation with logistic grass, bison (grazer),
// wolves (Holling type II predator with a prey refuge and territory cap), ravens (scavengers on carcasses) and
// rabbits (small prey). Pronghorn and cougar are unused (their pop columns stay zero). Deterministic from the seed.
//
// params (all optional, per-year rates unless noted): rg, bBirth, bDeath, bStarve, grazeB, killMax, killHalf,
// refuge (bison per patch hidden from wolves), wConv, wDeath, wCap (wolves per patch), wImm, rBirth, rDeath,
// rCap, rabBirth, rabDeath, rabCap, mig, bison0, wolf0 (initial totals).

import { SPECIES_COUNT, SPECIES_KEYS, Sp, YEAR_TICKS, type Intervention, type SimLike } from '../sim/types';

const NX = 5;
const NY = 5;
const NP = NX * NY;
const DT = 1 / YEAR_TICKS; // one tick in years
const MIG_EVERY = 8; // ticks between migration passes
const WORLD = 4000; // metres per side, only used to map intervention x/y onto a patch

const DEFAULTS: Record<string, number> = {
  rg: 4.0,
  bBirth: 0.55,
  bDeath: 0.1,
  bStarve: 0.9,
  grazeB: 0.016,
  killMax: 7.0,
  killHalf: 25,
  refuge: 8,
  wConv: 0.075,
  wDeath: 0.2,
  wCap: 7,
  wImm: 0.08,
  rBirth: 0.8,
  rDeath: 0.35,
  rCap: 14,
  rabBirth: 3.0,
  rabDeath: 1.0,
  rabCap: 40,
  mig: 0.6,
  bison0: 500,
  wolf0: 24,
};

export function createMockSim(opts: { seed: number; params?: Record<string, number> }): SimLike {
  return new MockSim(opts.seed, opts.params ?? {});
}

class MockSim implements SimLike {
  tick = 0;
  private P: Record<string, number>;
  // sfc32 state
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private spare = NaN;

  private G = new Float64Array(NP);
  private B = new Float64Array(NP);
  private W = new Float64Array(NP);
  private R = new Float64Array(NP);
  private Q = new Float64Array(NP); // rabbits
  private C = new Float64Array(NP); // carcass pool (animal-equivalents)
  private dB = new Float64Array(NP);
  private dW = new Float64Array(NP);
  private dR = new Float64Array(NP);
  private dQ = new Float64Array(NP);
  private neigh: Int32Array; // 4 entries per patch, -1 when off-grid

  private droughtUntil = -1;
  private droughtSev = 0;
  private rainUntil = -1;

  private killsTotal = 0;
  private birthsBison = 0;
  private gen = 0;
  private pressure = 0.2; // EMA of kills per bison-year
  private speedBison = 1;
  private speedWolf = 1;
  private sizeBison = 1;

  constructor(seed: number, params: Record<string, number>) {
    this.P = { ...DEFAULTS, ...params };
    let s = (seed >>> 0) ^ 0x9e3779b9;
    const mix = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
    this.a = mix();
    this.b = mix();
    this.c = mix();
    this.d = mix();
    for (let i = 0; i < 20; i++) this.u();

    this.neigh = new Int32Array(NP * 4).fill(-1);
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const p = y * NX + x;
        if (x > 0) this.neigh[p * 4] = p - 1;
        if (x < NX - 1) this.neigh[p * 4 + 1] = p + 1;
        if (y > 0) this.neigh[p * 4 + 2] = p - NX;
        if (y < NY - 1) this.neigh[p * 4 + 3] = p + NX;
      }
    }

    // initial conditions, jittered by seed
    const bPer = this.P.bison0 / NP;
    for (let p = 0; p < NP; p++) {
      this.G[p] = 0.55 + 0.3 * this.u();
      this.B[p] = Math.round(bPer * (0.6 + 0.8 * this.u()));
      this.R[p] = Math.round(2 + 6 * this.u());
      this.Q[p] = Math.round(10 + 20 * this.u());
    }
    for (let i = 0; i < this.P.wolf0; i++) this.W[this.int(NP)]++;
    this.speedBison = 1 + 0.05 * this.gauss();
    this.speedWolf = 1 + 0.05 * this.gauss();
    this.sizeBison = 1 + 0.03 * this.gauss();
  }

  // ---- rng -------------------------------------------------------------------------------------------------------
  private u(): number {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return (t >>> 0) / 4294967296;
  }

  private int(n: number): number {
    return Math.floor(this.u() * n);
  }

  private gauss(): number {
    if (!Number.isNaN(this.spare)) {
      const v = this.spare;
      this.spare = NaN;
      return v;
    }
    let u = this.u();
    if (u < 1e-12) u = 1e-12;
    const v = this.u();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  private pois(l: number): number {
    if (!(l > 0)) return 0;
    if (l < 0.1) return this.u() < l ? 1 : 0;
    if (l < 24) {
      const L = Math.exp(-l);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.u();
      } while (p > L);
      return k - 1;
    }
    const x = Math.round(l + Math.sqrt(l) * this.gauss());
    return x < 0 ? 0 : x;
  }

  private binom(n: number, f: number): number {
    if (n <= 0 || f <= 0) return 0;
    if (f >= 1) return n;
    let k = 0;
    for (let i = 0; i < n; i++) if (this.u() < f) k++;
    return k;
  }

  // ---- dynamics --------------------------------------------------------------------------------------------------
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.once();
  }

  private once(): void {
    const P = this.P;
    const { G, B, W, R, Q, C } = this;
    const t = this.tick;
    const yf = (t % YEAR_TICKS) / YEAR_TICKS;
    const season = 0.6 + 0.4 * Math.cos(2 * Math.PI * (yf - 0.4));
    let weather = 1;
    if (t < this.droughtUntil) weather = Math.max(0.05, 1 - this.droughtSev);
    else if (t < this.rainUntil) weather = 1.6;
    const rgT = P.rg * season * weather;
    let killsTick = 0;
    let birthsB = 0;
    let bTot = 0;

    for (let p = 0; p < NP; p++) {
      const g = G[p];
      const b = B[p];
      const w = W[p];
      const r = R[p];
      const q = Q[p];
      const fb = g / (g + 0.25);

      // grass
      const growth = rgT * (g * (1 - g) + 0.02 * (1 - g));
      const graze = P.grazeB * b * fb + 0.004 * q * fb;
      let g2 = g + DT * (growth - graze);
      g2 = g2 < 0.001 ? 0.001 : g2 > 1 ? 1 : g2;
      G[p] = g2;

      // bison
      const crowd = 1 - b / 120;
      const births = this.pois(DT * P.bBirth * b * fb * (crowd > 0 ? crowd : 0));
      let deaths = this.pois(DT * b * (P.bDeath + P.bStarve * (1 - fb) * (1 - fb) * (1 - fb)));
      const beff = b > P.refuge ? b - P.refuge : 0;
      let kills = w > 0 ? this.pois(DT * w * P.killMax * (beff / (beff + P.killHalf))) : 0;
      if (deaths + kills > b + births) {
        // cannot remove more animals than exist: shrink deaths first, then kills
        deaths = Math.min(deaths, b + births);
        kills = Math.min(kills, b + births - deaths);
      }
      B[p] = b + births - deaths - kills;
      bTot += B[p];
      birthsB += births;
      killsTick += kills;

      // rabbits
      const rc = 1 - q / P.rabCap;
      const qBirth = this.pois(DT * P.rabBirth * q * fb * (rc > 0 ? rc : 0));
      let qDeath = this.pois(DT * q * P.rabDeath);
      let qKill = w > 0 ? this.pois(DT * w * 4 * (q / (q + 15))) : 0;
      if (qDeath + qKill > q + qBirth) {
        qDeath = Math.min(qDeath, q + qBirth);
        qKill = Math.min(qKill, q + qBirth - qDeath);
      }
      Q[p] = q + qBirth - qDeath - qKill;

      // wolves: births follow kills, deaths rise with density (territoriality), tiny immigration
      const wBirth = this.pois(P.wConv * kills + 0.02 * qKill) + (w === 0 ? 0 : 0);
      const wd = DT * w * P.wDeath * (1 + (w / P.wCap) * (w / P.wCap));
      let wDeath = this.pois(wd);
      if (wDeath > w + wBirth) wDeath = w + wBirth;
      const wImm = this.u() < DT * P.wImm ? 1 : 0;
      W[p] = w + wBirth - wDeath + wImm;

      // carcasses and ravens
      let cp = C[p] + deaths + kills + wDeath * 0.5;
      const eat = cp > 0 && r > 0 ? Math.min(cp, DT * r * 3 * (cp / (cp + 4))) : 0;
      cp = (cp - eat) * (1 - DT * 8);
      C[p] = cp;
      const foodRate = r > 0 ? eat / (DT * r) : 0;
      const ff = foodRate / (foodRate + 0.4);
      const rcrowd = 1 - r / (P.rCap * 2);
      const rBirth = this.pois(DT * P.rBirth * r * (0.3 + 0.7 * ff) * (rcrowd > 0 ? rcrowd : 0));
      let rDeath = this.pois(DT * r * P.rDeath * (1 + (r / P.rCap) * (r / P.rCap)));
      if (rDeath > r + rBirth) rDeath = r + rBirth;
      const rImm = this.u() < DT * 0.4 ? 1 : 0;
      R[p] = r + rBirth - rDeath + rImm;
    }

    if ((t + 1) % MIG_EVERY === 0) this.migrate();

    // bookkeeping: generation depth, kills, fake traits
    this.killsTotal += killsTick;
    this.birthsBison += birthsB;
    this.gen += birthsB / (bTot + 1);
    const inst = killsTick / (bTot + 1) / DT;
    this.pressure += (inst - this.pressure) * (DT / 0.5);
    const sq = Math.sqrt(DT);
    this.speedBison += DT * (0.4 * (this.pressure - 0.12) - 0.15 * (this.speedBison - 1)) + 0.03 * sq * this.gauss();
    this.speedWolf += DT * 0.5 * (this.speedBison - this.speedWolf) + 0.02 * sq * this.gauss();
    this.sizeBison += DT * (0.1 * (1 - this.pressure * 2) * 0.3 - 0.1 * (this.sizeBison - 1)) + 0.02 * sq * this.gauss();
    this.speedBison = Math.min(2, Math.max(0.5, this.speedBison));
    this.speedWolf = Math.min(2, Math.max(0.5, this.speedWolf));
    this.sizeBison = Math.min(1.6, Math.max(0.6, this.sizeBison));

    this.tick++;
  }

  private migrate(): void {
    const rates = [this.P.mig * 0.7, this.P.mig * 0.3, this.P.mig * 2, this.P.mig * 1]; // bison, wolf, raven, rabbit
    const arrs = [this.B, this.W, this.R, this.Q];
    const deltas = [this.dB, this.dW, this.dR, this.dQ];
    for (let s = 0; s < 4; s++) {
      const A = arrs[s];
      const D = deltas[s];
      D.fill(0);
      for (let p = 0; p < NP; p++) {
        const n = A[p];
        if (n <= 0) continue;
        let movers = this.pois(n * rates[s] * DT * MIG_EVERY);
        if (movers > n) movers = n;
        for (let m = 0; m < movers; m++) {
          let dest = this.neigh[p * 4 + this.int(4)];
          if (s === 0) {
            // bison drift toward greener patches: take the greener of two random neighbours
            const alt = this.neigh[p * 4 + this.int(4)];
            if (dest < 0 || (alt >= 0 && this.G[alt] > this.G[dest])) dest = alt;
          }
          if (dest < 0) continue;
          D[p]--;
          D[dest]++;
        }
      }
      for (let p = 0; p < NP; p++) A[p] += D[p];
    }
  }

  // ---- SimLike ---------------------------------------------------------------------------------------------------
  populations(): number[] {
    const out = new Array<number>(SPECIES_COUNT).fill(0);
    for (let p = 0; p < NP; p++) {
      out[Sp.Bison] += this.B[p];
      out[Sp.Wolf] += this.W[p];
      out[Sp.Raven] += this.R[p];
      out[Sp.Rabbit] += this.Q[p];
    }
    return out;
  }

  sample(): Record<string, number> {
    const pops = this.populations();
    const row: Record<string, number> = {};
    for (let i = 0; i < SPECIES_COUNT; i++) row[`pop_${SPECIES_KEYS[i]}`] = pops[i];
    let g = 0;
    let c = 0;
    for (let p = 0; p < NP; p++) {
      g += this.G[p];
      c += this.C[p];
    }
    row.grass_mean = g / NP;
    row.carcasses = c;
    row.gen_bison = this.gen;
    row.kills = this.killsTotal;
    row.births_bison = this.birthsBison;
    row.trait_bison_speed = this.speedBison;
    row.trait_bison_size = this.sizeBison;
    row.trait_wolf_speed = this.speedWolf;
    return row;
  }

  // ---- interventions ---------------------------------------------------------------------------------------------
  private arrOf(species: number): Float64Array | null {
    switch (species) {
      case Sp.Bison:
        return this.B;
      case Sp.Wolf:
        return this.W;
      case Sp.Raven:
        return this.R;
      case Sp.Rabbit:
        return this.Q;
      default:
        return null; // unused species in the mock
    }
  }

  private patchAt(x?: number, y?: number): number {
    if (x === undefined || y === undefined) return this.int(NP);
    const px = Math.min(NX - 1, Math.max(0, Math.floor((x / WORLD) * NX)));
    const py = Math.min(NY - 1, Math.max(0, Math.floor((y / WORLD) * NY)));
    return py * NX + px;
  }

  apply(iv: Intervention): void {
    switch (iv.kind) {
      case 'cull':
      case 'plague': {
        const A = this.arrOf(iv.species);
        if (!A) return;
        for (let p = 0; p < NP; p++) {
          const k = this.binom(A[p], iv.fraction);
          A[p] -= k;
          this.C[p] += k;
        }
        break;
      }
      case 'remove': {
        const A = this.arrOf(iv.species);
        if (A) A.fill(0);
        break;
      }
      case 'introduce': {
        const A = this.arrOf(iv.species);
        if (!A) return;
        A[this.patchAt(iv.x, iv.y)] += iv.count;
        break;
      }
      case 'drought':
        this.droughtUntil = this.tick + iv.ticks;
        this.droughtSev = Math.min(1, Math.max(0, iv.severity));
        for (let p = 0; p < NP; p++) this.G[p] = Math.max(0.001, this.G[p] * (1 - 0.3 * this.droughtSev));
        break;
      case 'rain':
        this.rainUntil = this.tick + iv.ticks;
        break;
      case 'fire': {
        const p0 = this.patchAt(iv.x, iv.y);
        const hit = [p0];
        for (let d = 0; d < 4; d++) if (this.neigh[p0 * 4 + d] >= 0) hit.push(this.neigh[p0 * 4 + d]);
        for (const p of hit) {
          this.G[p] = 0.02;
          for (const A of [this.B, this.R, this.Q]) {
            const k = this.binom(A[p], 0.3);
            A[p] -= k;
            this.C[p] += k;
          }
        }
        break;
      }
    }
  }
}
