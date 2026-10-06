// Dynamic trees (V2-PLAN.md S13). With params.dynamicTrees on, the sim owns a mutable tree list instead of the world's static one.
//
// ---- The list ---------------------------------------------------------------------------------------------------------------------
// One slot per tree, in struct-of-arrays form. Slots 0 .. N0-1 are the world's own trees in the same order (so a tree's index is the same in the
// renderer's static world.trees); new trees take a free slot or are appended. A tree has a kind (cottonwood, juniper, bur oak) and a stage:
//   0 seedling   1 sapling   2 young   3 mature   4 snag (dead, standing, no crown)   5 gone (the slot is free)
// Stages come from the tree's age in base years (2,400 ticks; per-kind thresholds in KINDS) and its height follows (age / ageMature) ^ exp
// of its full height. Seedlings and saplings grow slower under browsing (deer), seedlings die back to hazards (drought, thick grass, browsing),
// and every tree dies of old age at its own lifespan (a snag, which falls some years later). The initial trees are mature, aged at random.
//
// ---- New trees --------------------------------------------------------------------------------------------------------------------
// Cottonwoods (start of summer): on riparian ground (within 30 m of water, moist) that is bare (grass under 0.2 of capacity), not shaded
// (cover under 0.45) and has a seed source (mature and young cottonwoods within about 64 m), fading as the established cottonwoods approach treeCwCap. A flood (S12 natural or the S17 tool) scours its
// band bare and wet: for 1.5 valley years (YEAR_TICKS) the cells it covered count as bare and recruit at (1 + treeFloodBoost x severity) times the rate.
// A pulse of treeGroveMin or more flood seedlings raises a `grovePlanted` event with sp -2 (the one grove event: sp -1 is the player's grove).
// Junipers (autumn): on the ridges (the upper 40% of the land by height, 30 m or more from water), at treeJunRecruit x seed source plus
// treeJunBg long-distance seeds, scaled by years since the cell last burned (zero on a burn, full after treeFireFree years), by open ground, and by
// room under treeJunCap trees. `encroachment` is raised when junipers hold treeEncroach of the ridge cells (and again after the share has
// fallen back under half of it).
//
// ---- Fire and browsing ------------------------------------------------------------------------------------------------------------
// A tree standing in a burning cell rolls once per fire: seedlings and saplings die with treeFireSmall (0.9), young trees with treeFireYoung (0.4),
// mature trees with treeFireMature (0.1; they stand on as snags, the others are gone). Cells that burn are remembered (lastFire) for the junipers.
// Mule deer (1.0) and pronghorn (0.3) in a tree's 16 m cell slow a seedling or sapling's growth by up to treeBrowse x their density share (3 animals
// saturate) and add a death hazard.
//
// ---- Cover ------------------------------------------------------------------------------------------------------------------------
// Every season the cover field is rebuilt from the list (the static shrub cover plus each live tree's crown disc, amount 0.9 x (height share)^0.8,
// the same disc as the world's own generator), and the cells that changed take their capacity and browse capacity with it. Cougars, mule deer,
// the raptors' perches and the hawks' nests read the new field (the host is told through `changed`).
//
// ---- Determinism ------------------------------------------------------------------------------------------------------------------
// All randomness is new Rng(hashSeed(seed + ':trees')); nothing touches the main stream. The sim only builds this object when params.dynamicTrees is on.
import type { Agents } from './agents';
import type { Environment } from './env';
import type { Params } from './params';
import { hashSeed, Rng } from './rng';
import type { SimEventKind } from './sim';
import { Sp, BASE_YEAR_TICKS, YEAR_TICKS } from './types';
import { COARSE_N, type World } from './world';
import type { Vegetation } from './vegetation';

/** The list is stepped every this many ticks. */
export const TREE_STEP = 24;
/** Floats per tree in the snapshot array: x, y, height m, crown radius m, kind, stage. */
export const TREE_STRIDE = 6;
export const Kind = { Cottonwood: 0, Juniper: 1, Oak: 2 } as const;
export const Stage = { Seedling: 0, Sapling: 1, Young: 2, Mature: 3, Snag: 4, Gone: 5 } as const;

interface KindDef {
  /** Age (base years) at which a tree becomes a sapling, young, mature. */
  sap: number; young: number; mature: number;
  /** Height share = (age / mature) ^ exp. */
  exp: number;
  /** Mean lifespan (years; each tree is 0.75 to 1.25 of it). */
  life: number;
  /** Full height range (m) of a new tree, and crown radius as a share of height. */
  hLo: number; hHi: number; rLo: number; rHi: number;
  /** Years a snag stands. */
  fallLo: number; fallHi: number;
}
const KINDS: KindDef[] = [
  { sap: 1, young: 5, mature: 18, exp: 0.75, life: 130, hLo: 11, hHi: 17, rLo: 0.38, rHi: 0.5, fallLo: 3, fallHi: 10 },
  { sap: 3, young: 14, mature: 40, exp: 0.8, life: 250, hLo: 4, hHi: 8, rLo: 0.3, rHi: 0.38, fallLo: 5, fallHi: 15 },
  { sap: 5, young: 25, mature: 70, exp: 0.75, life: 300, hLo: 9, hHi: 14, rLo: 0.38, rHi: 0.5, fallLo: 5, fallHi: 15 },
];
const MIN_H = 0.3;
const MAX_TREES = 8000;
/** A tree in a cell burning at this tick rolls again no sooner than this many ticks later. */
const FIRE_GAP = 400;
const SHADE_MAX = 0.45;
/** Self-thinning: the yearly death hazard of a sapling or young tree grows by this much per unit of cover above 0.5 (crowded stands thin themselves). */
const CROWD = 0.1;

export interface TreeHost {
  event(kind: SimEventKind, sp: number, x: number, y: number, a: number, b: number): void;
  /** The seasonal pass rebuilt the cover field and the tree arrays (the sim refreshes the habitat map and the raptors' perch table). */
  changed(): void;
}

export interface TreeCounts {
  /** [kind][stage 0..4] */
  n: number[][];
  total: number;
}

export class Trees {
  readonly rng: Rng;
  count = 0;
  /** The number of trees the world started with (slots 0 .. initial-1). */
  readonly initial: number;
  x: Float32Array; y: Float32Array; h: Float32Array; hMax: Float32Array; rr: Float32Array; age: Float32Array; life: Float32Array;
  kind: Uint8Array; stage: Uint8Array; lastRoll: Int32Array;
  private free: number[] = [];
  /** Bumped whenever the list a consumer sees (world.trees, the snapshot array) was rebuilt. */
  version = 1;
  /** 1 where a tree is alive (stages 0 to 3), for the raptors. Same indices as the list. */
  live: Uint8Array;
  /** Which tree owns a cell (index + 1), 0 when none. */
  private occ: Uint32Array;
  private shrubCov: Float32Array;
  private rip: Int32Array;
  private ridge: Int32Array;
  /** The tick each cell last burned (-1e9: never). */
  readonly lastFire: Int32Array;
  private fireSeen = false;
  /** The coarse deer-use map (mule deer + 0.3 pronghorn per 16 m cell), refreshed every step. */
  private deer = new Float32Array(COARSE_N * COARSE_N);
  private seedCw = new Float32Array(COARSE_N * COARSE_N);
  private seedJun = new Float32Array(COARSE_N * COARSE_N);
  private lastSeason = -1;
  /** The last flood: the cells it covered, its severity and when it ended (-1e9: none). */
  private floodMask: Uint8Array | null = null;
  private floodSev = 0;
  private floodEnd = -1e9;
  private encroached = false;
  // counters since the last sample
  private cRecCw = 0; private cRecJun = 0; private cFireSmall = 0; private cFireMature = 0; private cOld = 0; private cHazard = 0; private cPlanted = 0; private cEncroach = 0;
  /** The browse growth slowdown (mean over saplings and seedlings), for the sample. */
  private slowSum = 0; private slowN = 0;

  constructor(
    seed: number,
    private readonly p: Params,
    private readonly env: Environment,
    private readonly world: World,
    private readonly veg: Vegetation,
    private readonly a: Agents,
    private readonly host: TreeHost,
  ) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:trees`));
    const t = world.trees, n0 = Math.floor(t.length / 4), n2 = world.n * world.n;
    this.initial = n0;
    const cap = Math.max(1024, 1 << Math.ceil(Math.log2(n0 + 512)));
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.h = new Float32Array(cap); this.hMax = new Float32Array(cap);
    this.rr = new Float32Array(cap); this.age = new Float32Array(cap); this.life = new Float32Array(cap);
    this.kind = new Uint8Array(cap); this.stage = new Uint8Array(cap).fill(Stage.Gone); this.lastRoll = new Int32Array(cap).fill(-1e9);
    this.live = new Uint8Array(cap);
    this.occ = new Uint32Array(n2);
    this.lastFire = new Int32Array(n2).fill(-1e9);
    // the static shrub cover, built as the world generator did
    this.shrubCov = new Float32Array(n2);
    const sh = world.shrubs;
    for (let k = 0; k + 2 < sh.length; k += 3) this.splat(this.shrubCov, sh[k], sh[k + 1], sh[k + 2] * 1.5, 0.6);
    // candidate cells
    const rip: number[] = [], ridge: number[] = [];
    const hn = world.hn, land: number[] = [];
    const el = new Float32Array(n2);
    for (let j = 0; j < world.n; j++) for (let i = 0; i < world.n; i++) {
      const c = j * world.n + i;
      el[c] = 0.25 * (world.height[j * hn + i] + world.height[j * hn + i + 1] + world.height[(j + 1) * hn + i] + world.height[(j + 1) * hn + i + 1]);
      if (!world.water[c]) land.push(el[c]);
    }
    land.sort((u, v) => u - v);
    const cut = land[Math.floor(land.length * 0.6)];
    for (let c = 0; c < n2; c++) {
      if (world.water[c]) continue;
      const wd = world.waterDist[c];
      if (wd >= 2.5 && wd <= 30 && world.moisture[c] > 0.5 && world.slope[c] < 0.45) rip.push(c);
      else if (wd >= 30 && el[c] >= cut && world.slope[c] < 0.6) ridge.push(c);
    }
    this.rip = Int32Array.from(rip);
    this.ridge = Int32Array.from(ridge);
    // the world's trees, mature and aged at random (the age spread is what makes the old ones die first)
    for (let k = 0; k < n0; k++) {
      const x = t[k * 4], y = t[k * 4 + 1], hh = t[k * 4 + 2], rad = t[k * 4 + 3];
      const c = this.cellOf(x, y);
      const kd = world.waterDist[c] < 26 ? Kind.Cottonwood : Kind.Oak;
      const D = KINDS[kd];
      const life = D.life * this.rng.range(0.75, 1.25);
      const i = this.alloc();
      this.x[i] = x; this.y[i] = y; this.h[i] = hh; this.hMax[i] = hh; this.rr[i] = rad / Math.max(0.1, hh);
      this.kind[i] = kd; this.stage[i] = Stage.Mature; this.life[i] = life;
      this.age[i] = this.rng.range(D.mature + 2, Math.max(D.mature + 3, 0.7 * life));
      this.live[i] = 1;
      if (!this.occ[c]) this.occ[c] = i + 1;
    }
    this.refreshSeeds();
    this.lastSeason = -1;
  }

  // ------------------------------------------------------------------ list plumbing

  private cellOf(x: number, y: number): number {
    const n = this.world.n, cell = this.world.cell;
    let i = (x / cell) | 0, j = (y / cell) | 0;
    if (i < 0) i = 0; else if (i >= n) i = n - 1;
    if (j < 0) j = 0; else if (j >= n) j = n - 1;
    return j * n + i;
  }

  private alloc(): number {
    let i = this.free.pop() ?? -1;
    if (i < 0) {
      if (this.count >= this.x.length) this.grow();
      i = this.count++;
    }
    return i;
  }

  private grow(): void {
    const cap = this.x.length * 2;
    const f = <T extends { set(a: ArrayLike<number>): void }>(C: new (n: number) => T, prev: T): T => { const o = new C(cap); o.set(prev as unknown as ArrayLike<number>); return o; };
    this.x = f(Float32Array, this.x); this.y = f(Float32Array, this.y); this.h = f(Float32Array, this.h); this.hMax = f(Float32Array, this.hMax);
    this.rr = f(Float32Array, this.rr); this.age = f(Float32Array, this.age); this.life = f(Float32Array, this.life);
    this.kind = f(Uint8Array, this.kind);
    const st = new Uint8Array(cap).fill(Stage.Gone); st.set(this.stage); this.stage = st;
    const lr = new Int32Array(cap).fill(-1e9); lr.set(this.lastRoll); this.lastRoll = lr;
    this.live = f(Uint8Array, this.live);
  }

  /** Make a tree. Returns its slot, or -1 when the list is full. */
  private spawn(kind: number, x: number, y: number, age: number, rng: Rng): number {
    if (this.count - this.free.length >= MAX_TREES) return -1;
    const D = KINDS[kind];
    const i = this.alloc();
    this.x[i] = x; this.y[i] = y;
    this.kind[i] = kind;
    this.hMax[i] = rng.range(D.hLo, D.hHi);
    this.rr[i] = rng.range(D.rLo, D.rHi);
    this.life[i] = D.life * rng.range(0.75, 1.25);
    this.age[i] = age;
    this.lastRoll[i] = -1e9;
    this.setStage(i);
    this.h[i] = this.heightOf(i);
    this.live[i] = 1;
    const c = this.cellOf(x, y);
    if (!this.occ[c]) this.occ[c] = i + 1;
    return i;
  }

  private heightOf(i: number): number {
    const D = KINDS[this.kind[i]];
    const f = Math.min(1, Math.pow(this.age[i] / D.mature, D.exp));
    return Math.max(MIN_H, this.hMax[i] * f);
  }

  private setStage(i: number): void {
    const D = KINDS[this.kind[i]], g = this.age[i];
    this.stage[i] = g < D.sap ? Stage.Seedling : g < D.young ? Stage.Sapling : g < D.mature ? Stage.Young : Stage.Mature;
  }

  private release(i: number): void {
    const c = this.cellOf(this.x[i], this.y[i]);
    if (this.occ[c] === i + 1) this.occ[c] = 0;
    this.stage[i] = Stage.Gone;
    this.live[i] = 0;
    this.h[i] = 0;
    this.free.push(i);
  }

  private snag(i: number): void {
    const D = KINDS[this.kind[i]];
    this.stage[i] = Stage.Snag;
    this.live[i] = 0;
    this.age[i] = 0;
    this.life[i] = this.rng.range(D.fallLo, D.fallHi);
  }

  // ------------------------------------------------------------------ cover

  private splat(field: Float32Array, x: number, y: number, r: number, amt: number): void {
    const n = this.world.n, cell = this.world.cell;
    const i0 = Math.max(0, Math.floor((x - r) / cell)), i1 = Math.min(n - 1, Math.floor((x + r) / cell));
    const j0 = Math.max(0, Math.floor((y - r) / cell)), j1 = Math.min(n - 1, Math.floor((y + r) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot((i + 0.5) * cell - x, (j + 0.5) * cell - y);
        if (d < r) field[j * n + i] += amt * (1 - d / r);
      }
    }
  }

  /** Rebuild world.cover from the shrubs and the live trees, and carry the change into capacity and browse capacity. */
  recomputeCover(): void {
    const w = this.world, v = this.veg, n2 = w.n * w.n;
    const tmp = new Float32Array(this.shrubCov);
    for (let i = 0; i < this.count; i++) {
      const s = this.stage[i];
      if (s >= Stage.Snag) continue;
      const f = Math.min(1, this.h[i] / this.hMax[i]);
      const amt = 0.9 * Math.pow(f, 0.8);
      const r = this.h[i] * this.rr[i] * 1.1;
      if (amt < 0.02 || r < 0.5) continue;
      this.splat(tmp, this.x[i], this.y[i], r, amt);
    }
    const cov = w.cover;
    for (let c = 0; c < n2; c++) {
      const now = tmp[c] > 1 ? 1 : tmp[c], old = cov[c];
      if (now === old) continue;
      cov[c] = now;
      if (w.water[c] || Math.abs(now - old) < 1e-5) continue;
      w.capacity[c] *= (1 - 0.45 * now) / (1 - 0.45 * old);
      v.browseK[c] = 0.4 * w.capacity[c] / Math.max(0.3, 1 - 0.45 * now) + 0.6 * now;
      if (now > old && v.browse[c] < 0.6 * v.browseK[c]) v.browse[c] = 0.6 * v.browseK[c];
    }
  }

  /** Copy the list into the sim's own world.trees (stride 4, same slot order; a gone tree has height 0) and bump the version. */
  private sync(): void {
    const t = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      if (this.stage[i] === Stage.Gone) continue;
      t[i * 4] = this.x[i]; t[i * 4 + 1] = this.y[i]; t[i * 4 + 2] = this.h[i]; t[i * 4 + 3] = this.h[i] * this.rr[i];
    }
    this.world.trees = t;
    this.version++;
  }

  // ------------------------------------------------------------------ the step

  /** Called by the sim every tick after the vegetation step: remembers that something burns. */
  noteBurning(burningCells: number): void {
    if (burningCells > 0) this.fireSeen = true;
  }

  /** Every TREE_STEP ticks (the sim calls this when tick % TREE_STEP === 0). */
  step(tick: number): void {
    const p = this.p, w = this.world, v = this.veg, dt = TREE_STEP / BASE_YEAR_TICKS;
    // fire: cells that burn are remembered, trees in them roll
    const burnOn = this.fireSeen;
    if (burnOn) {
      this.fireSeen = false;
      const b = v.burn;
      for (let c = 0; c < b.length; c++) if (b[c] > 1) this.lastFire[c] = tick;
    }
    // deer use per 16 m cell
    const a = this.a, cs = w.size / COARSE_N;
    this.deer.fill(0);
    for (let k = 0; k < a.hi; k++) {
      if (!a.alive[k]) continue;
      const s = a.sp[k];
      if (s !== Sp.MuleDeer && s !== Sp.Deer) continue;
      const ci = Math.min(COARSE_N - 1, Math.max(0, (a.x[k] / cs) | 0)), cj = Math.min(COARSE_N - 1, Math.max(0, (a.y[k] / cs) | 0));
      this.deer[cj * COARSE_N + ci] += s === Sp.MuleDeer ? 1 : 0.3;
    }
    const drought = this.env.droughtTicks > 0;
    const rng = this.rng, grow = p.treeGrowth * dt;
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      const st = this.stage[i];
      if (st === Stage.Gone) continue;
      if (st === Stage.Snag) {
        this.age[i] += dt;
        if (this.age[i] >= this.life[i]) { this.release(i); dirty = true; }
        continue;
      }
      const c = this.cellOf(this.x[i], this.y[i]);
      // fire
      if (burnOn && v.burn[c] > 1 && tick - this.lastRoll[i] > FIRE_GAP) {
        this.lastRoll[i] = tick;
        const pk = st <= Stage.Sapling ? p.treeFireSmall : st === Stage.Young ? p.treeFireYoung : p.treeFireMature;
        if (rng.next() < pk) {
          if (st === Stage.Mature) { this.snag(i); this.cFireMature++; } else { this.release(i); this.cFireSmall++; }
          dirty = true;
          continue;
        }
      }
      const small = st <= Stage.Sapling;
      let slow = 0, bf = 0;
      if (small) {
        const ci = Math.min(COARSE_N - 1, (this.x[i] / cs) | 0), cj = Math.min(COARSE_N - 1, (this.y[i] / cs) | 0);
        bf = Math.min(1, this.deer[cj * COARSE_N + ci] / 3);
        slow = p.treeBrowse * bf;
        this.slowSum += slow; this.slowN++;
      }
      // hazards (per base year)
      let hz = 0;
      if (st === Stage.Seedling) {
        const K = v.capacityOf(c);
        const gf = K > 0.02 ? Math.min(1.2, v.grass[c] / K) : 0;
        hz = p.treeSeedMort * (0.6 + 0.8 * gf) * (drought ? 2 : 1) + 0.5 * bf * p.treeBrowse;
      } else if (st === Stage.Sapling) hz = 0.06 * (drought ? 1.5 : 1) + 0.3 * bf * p.treeBrowse + CROWD * Math.max(0, w.cover[c] - 0.5);
      else if (st === Stage.Young) hz = 0.01 + CROWD * Math.max(0, w.cover[c] - 0.5);
      if (hz > 0 && rng.next() < hz * dt) { this.release(i); this.cHazard++; dirty = true; continue; }
      // growth and ageing
      this.age[i] += grow * (1 - slow);
      if (this.age[i] >= this.life[i]) { this.snag(i); this.cOld++; dirty = true; continue; }
      const before = this.stage[i];
      this.setStage(i);
      if (this.stage[i] !== before) dirty = true;
      this.h[i] = this.heightOf(i);
    }
    // deaths and stage changes show at the next season; fires show at once (a charred snag is the point)
    if (dirty && burnOn) this.sync();
    const si = Math.floor(this.env.state.season) % 4;
    if (this.lastSeason < 0) this.lastSeason = si;
    else if (si !== this.lastSeason) {
      this.lastSeason = si;
      this.seasonPass(tick, si);
    }
  }

  private seasonPass(tick: number, si: number): void {
    if (si === 1) this.recruitCottonwood(tick);
    else if (si === 2) this.recruitJuniper(tick);
    this.recomputeCover();
    this.sync();
    this.refreshSeeds();
    if (si === 2) this.checkEncroachment();
    this.host.changed();
  }

  /**
   * Beaver ponds (S14): every live tree standing in water at least `minDepth` deep drowns and stands as a snag. `depth` is the pond depth field on the cell grid.
   * Returns how many died. The cover is rebuilt and the list synced at once, so the snags show on the next snapshot.
   */
  drown(depth: Float32Array, minDepth = 0.25): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.stage[i] >= Stage.Snag) continue;
      if (depth[this.cellOf(this.x[i], this.y[i])] < minDepth) continue;
      this.snag(i);
      n++;
    }
    if (n > 0) {
      this.recomputeCover();
      this.sync();
      this.host.changed();
    }
    return n;
  }

  /** A flood ended: its cells are bare, wet ground for the next year and a half. */
  floodEnded(mask: Uint8Array, sev: number, tick: number): void {
    this.floodMask = mask;
    this.floodSev = sev;
    this.floodEnd = tick;
  }

  // ------------------------------------------------------------------ recruitment

  private refreshSeeds(): void {
    const w = this.world, cs = w.size / COARSE_N;
    const bearCw = new Float32Array(COARSE_N * COARSE_N), bearJ = new Float32Array(COARSE_N * COARSE_N);
    for (let i = 0; i < this.count; i++) {
      const s = this.stage[i];
      if (s !== Stage.Young && s !== Stage.Mature) continue;
      const ci = Math.min(COARSE_N - 1, (this.x[i] / cs) | 0), cj = Math.min(COARSE_N - 1, (this.y[i] / cs) | 0);
      const wt = s === Stage.Mature ? 1 : 0.4;
      if (this.kind[i] === Kind.Juniper) bearJ[cj * COARSE_N + ci] += wt;
      else if (this.kind[i] === Kind.Cottonwood) bearCw[cj * COARSE_N + ci] += wt;
    }
    this.blur(bearCw, this.seedCw, 4, 2.5);
    this.blur(bearJ, this.seedJun, 3, 1.5);
  }

  private blur(src: Float32Array, out: Float32Array, R: number, ref: number): void {
    const N = COARSE_N;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let dj = -R; dj <= R; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= N) continue;
          for (let di = -R; di <= R; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= N) continue;
            const d = Math.sqrt(di * di + dj * dj);
            if (d > R) continue;
            s += src[jj * N + ii] * (1 - d / (R + 1));
          }
        }
        out[j * N + i] = Math.min(1, s / ref);
      }
    }
  }

  private coarseOf(c: number): number {
    const n = this.world.n, r = n / COARSE_N;
    return (((c / n) | 0) / r | 0) * COARSE_N + (((c % n) / r) | 0);
  }

  private jitterPos(c: number, rng: Rng): [number, number] {
    const n = this.world.n, cell = this.world.cell;
    return [((c % n) + rng.next()) * cell, (((c / n) | 0) + rng.next()) * cell];
  }

  private recruitCottonwood(tick: number): void {
    const p = this.p, w = this.world, v = this.veg, rng = this.rng, cal = p.calendarScale > 0 ? p.calendarScale : 1;
    const flooded = this.floodMask !== null && tick - this.floodEnd < 1.5 * YEAR_TICKS;
    const fm = flooded ? this.floodMask! : null;
    let nFlood = 0, fx = 0, fy = 0;
    const pos: number[] = [];
    // room: the established cottonwoods (saplings and up) fill the bottomland toward treeCwCap, and recruitment fades as they do
    let est = 0;
    for (let i = 0; i < this.count; i++) if (this.kind[i] === Kind.Cottonwood && this.stage[i] >= Stage.Sapling && this.stage[i] <= Stage.Mature) est++;
    const room = Math.max(0, 1 - est / p.treeCwCap);
    if (room <= 0) return;
    for (let q = 0; q < this.rip.length; q++) {
      const c = this.rip[q];
      if (this.occ[c] || w.cover[c] > SHADE_MAX) continue;
      const s = this.seedCw[this.coarseOf(c)];
      if (s <= 0) continue;
      const K = v.capacityOf(c);
      const gf = K > 0.02 ? v.grass[c] / K : 1;
      let bare = Math.min(1, Math.max(0, (0.7 - gf) / 0.5));
      let boost = 1;
      const inFlood = fm !== null && fm[c] !== 0;
      if (inFlood) { bare = Math.max(bare, this.floodSev); boost = 1 + p.treeFloodBoost * this.floodSev; }
      const m = Math.min(1, Math.max(0, (w.moisture[c] - 0.5) / 0.3));
      const pr = p.treeCwRecruit * s * bare * m * boost * room / cal;
      if (rng.next() < pr) {
        const [x, y] = this.jitterPos(c, rng);
        if (this.spawn(Kind.Cottonwood, x, y, 0, rng) >= 0) {
          this.cRecCw++;
          if (inFlood) { nFlood++; fx += x; fy += y; pos.push(x, y); }
        }
      }
    }
    if (nFlood >= p.treeGroveMin) {
      const cx = fx / nFlood, cy = fy / nFlood;
      let r2 = 0;
      for (let k = 0; k < pos.length; k += 2) r2 += (pos[k] - cx) * (pos[k] - cx) + (pos[k + 1] - cy) * (pos[k + 1] - cy);
      this.host.event('grovePlanted', -2, cx, cy, Math.round(Math.sqrt(r2 / nFlood)), nFlood);
    }
  }

  private recruitJuniper(tick: number): void {
    const p = this.p, w = this.world, v = this.veg, rng = this.rng, cal = p.calendarScale > 0 ? p.calendarScale : 1;
    let J = 0;
    for (let i = 0; i < this.count; i++) if (this.kind[i] === Kind.Juniper && this.stage[i] < Stage.Snag) J++;
    const free = p.treeFireFree * BASE_YEAR_TICKS;
    for (let q = 0; q < this.ridge.length; q++) {
      const c = this.ridge[q];
      if (this.occ[c] || w.cover[c] > 0.5) continue;
      const ff = Math.min(1, (tick - this.lastFire[c]) / free);
      if (ff <= 0) continue;
      const room = 1 - J / p.treeJunCap;
      if (room <= 0) break;
      const K = v.capacityOf(c);
      const gf = K > 0.02 ? Math.min(1, v.grass[c] / K) : 0;
      const pr = (p.treeJunRecruit * this.seedJun[this.coarseOf(c)] + p.treeJunBg) * ff * (1 - 0.5 * gf) * room / cal;
      if (rng.next() < pr) {
        const [x, y] = this.jitterPos(c, rng);
        if (this.spawn(Kind.Juniper, x, y, 0, rng) >= 0) { this.cRecJun++; J++; }
      }
    }
  }

  private checkEncroachment(): void {
    let J = 0, sx = 0, sy = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.kind[i] === Kind.Juniper && this.stage[i] < Stage.Snag) { J++; sx += this.x[i]; sy += this.y[i]; }
    }
    const share = this.ridge.length > 0 ? J / this.ridge.length : 0;
    if (!this.encroached && share >= this.p.treeEncroach) {
      this.encroached = true;
      this.cEncroach++;
      this.host.event('encroachment', -1, sx / Math.max(1, J), sy / Math.max(1, J), J, Math.round(share * 1000) / 1000);
    } else if (this.encroached && share < 0.5 * this.p.treeEncroach) this.encroached = false;
  }

  // ------------------------------------------------------------------ the player's grove

  /** Plant young cottonwoods in a disc, all draws from the grove generator `g`. Returns how many were planted (trees in water are skipped). */
  plant(x: number, y: number, r: number, count: number, g: Rng): number {
    let made = 0;
    for (let k = 0; k < count; k++) {
      const ang = g.next() * Math.PI * 2, rad = r * 0.85 * Math.sqrt(g.next());
      const px = Math.min(this.world.size - 1, Math.max(1, x + Math.cos(ang) * rad)), py = Math.min(this.world.size - 1, Math.max(1, y + Math.sin(ang) * rad));
      if (this.world.water[this.cellOf(px, py)]) continue;
      const D = KINDS[Kind.Cottonwood];
      // the grove's own generator draws everything, so the main tree stream is not moved by the player's groves
      if (this.spawn(Kind.Cottonwood, px, py, D.mature * 0.75, g) < 0) break;
      made++;
    }
    this.cPlanted += made;
    this.recomputeCover();
    this.sync();
    this.refreshSeeds();
    this.host.changed();
    return made;
  }

  // ------------------------------------------------------------------ outputs

  /** The snapshot array: TREE_STRIDE floats per slot [x, y, height m, crown radius m, kind, stage]. Gone slots are stage 5 with height 0. */
  toArray(): Float32Array {
    const out = new Float32Array(this.count * TREE_STRIDE);
    for (let i = 0; i < this.count; i++) {
      const o = i * TREE_STRIDE, gone = this.stage[i] === Stage.Gone;
      out[o] = this.x[i]; out[o + 1] = this.y[i];
      out[o + 2] = gone ? 0 : this.h[i];
      out[o + 3] = gone ? 0 : this.h[i] * this.rr[i];
      out[o + 4] = this.kind[i];
      out[o + 5] = this.stage[i];
    }
    return out;
  }

  /** The cover field as bytes (cover x 255), n x n. */
  coverBytes(): Uint8Array {
    const c = this.world.cover, out = new Uint8Array(c.length);
    for (let k = 0; k < c.length; k++) out[k] = Math.min(255, Math.round(c[k] * 255));
    return out;
  }

  counts(): TreeCounts {
    const n = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    let total = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.stage[i];
      if (s === Stage.Gone) continue;
      n[this.kind[i]][s]++;
      if (s < Stage.Snag) total++;
    }
    return { n, total };
  }

  /** Fraction of the ridge cells that hold a live juniper. */
  ridgeShare(): number {
    let J = 0;
    for (let i = 0; i < this.count; i++) if (this.kind[i] === Kind.Juniper && this.stage[i] < Stage.Snag) J++;
    return this.ridge.length > 0 ? J / this.ridge.length : 0;
  }

  /** Counts since the last call (and reset). */
  drainSample(): { recCw: number; recJun: number; fireSmall: number; fireMature: number; old: number; hazard: number; planted: number; encroach: number; slow: number } {
    const o = {
      recCw: this.cRecCw, recJun: this.cRecJun, fireSmall: this.cFireSmall, fireMature: this.cFireMature, old: this.cOld, hazard: this.cHazard,
      planted: this.cPlanted, encroach: this.cEncroach, slow: this.slowN > 0 ? this.slowSum / this.slowN : 0,
    };
    this.cRecCw = this.cRecJun = this.cFireSmall = this.cFireMature = this.cOld = this.cHazard = this.cPlanted = this.cEncroach = 0;
    this.slowSum = 0; this.slowN = 0;
    return o;
  }
}
