// Beaver ponds (V2-PLAN.md S14): the water-depth field, the dams that make it, and what standing water does to the valley.
//
// ---- The field --------------------------------------------------------------------------------------------------------------------
// `depth` is a Float32Array on the world's own 256 x 256 grid (2 m cells, row-major by y then x), in metres of extra water above the ground.
// A dam sits on a creek node (world.creek is a polyline, a node every 4 m). The creek's water surface at each node is read from the world's
// own creek cells (monotone downstream). A dam with crest c holds the water at `level = surface(node) + c`, and every cell upstream of the dam
// whose ground is below that level and which connects to the dam through such cells (4-connected, in the upstream half-plane of the dam,
// within MAX_R = 120 m of the dam and within BAND = 20 m of the creek centreline) is under water, `depth = level - ground`. Several dams combine by taking the deepest water in each cell.
// A cell counts as water for the rest of the sim (world.water = 1) once its depth is at least POND_WET (0.12 m). Cells that are creek or
// pond water in the world as generated stay water whatever happens.
//
// ---- What a change does -----------------------------------------------------------------------------------------------------------
// `refresh()` rebuilds the fills of the dams whose crest moved, combines them and then, for the cells that changed state:
//   flooded: world.water = 1, waterHeight = the surface, capacity 0, the grass, browse and fire on it are gone; trees standing in water
//            deeper than POND_DROWN (0.25 m) die and stand as snags (S13's list when dynamicTrees is on, else the static list: the tree's height
//            in the sim's copy of world.trees becomes 0 and its index goes to `drownedTrees`, for the renderer).
//   drained: world.water = 0, the soil takes a silt bump, the grass starts again from a little, and the cell becomes beaver meadow
//            (`meadow` 1, decaying to 0 over beaverMeadowYears; meanwhile capacity x (1 + beaverMeadowCap x meadow)).
// then, for the whole grid: `world.waterDist` is recomputed with distanceTransform (the whole grid: about a millisecond; a regional
// update would save nothing worth the risk), the host rebuilds the sim's water gradients and drink spots, and the greener ribbon is
// redrawn: land within RIBBON_M (30 m) of beaver water gets moisture + beaverMoisture x (1 - d / 30) (this raises the grass
// growth and capacity there, and wets the ground against fire) and a drought shield (beaverShield x the same ramp) that exempts it from
// the drought's cut in growth and its dieback in Vegetation.step, so a pond keeps a green bank through a drought.
//
// ---- For the frame (Track R) -------------------------------------------------------------------------------------------------------
//   depthBytes(): n x n bytes, depth in centimetres (0 = none, 255 = 2.55 m or more), the water surface of a cell is the terrain height there
//                 (the renderer's own heights are the same) plus depth / 100. Includes the deepened creek, not only new water.
//   damArray():   DAM_STRIDE (8) floats per dam: x, y (m, on the creek), crest (m, 0 to 1.4), state (0 building, 1 holding, 2 breached and
//                 draining, 3 abandoned and decaying), angle (rad, the direction of the dam wall: across the creek), length (m), level (the pond
//                 surface elevation in absolute metres, the same scale as world.height), colony id (-1 none).
//   `version` is bumped whenever any of those changed.
//
// ---- Determinism ------------------------------------------------------------------------------------------------------------------
// Nothing in here draws a random number: the fills, the ribbon and the meadow are functions of the dams' crests.
import type { Params } from './params';
import { SEASON_TICKS, YEAR_TICKS } from './types';
import type { Vegetation } from './vegetation';
import { distanceTransform, sampleHeight, type World } from './world';

/** A cell with at least this much extra water (m) is water. */
export const POND_WET = 0.12;
/** Trees standing in water this deep (m) drown. */
export const POND_DROWN = 0.25;
/** Land within this many metres of a pond gets the moisture ribbon. */
export const RIBBON_M = 30;
const MAX_R = 120;
const MAX_CELLS = 1200;
/** A pond reaches at most this far (m) from the creek centreline: a dam floods the creek's floor, not every basin that happens to lie below its level. */
const BAND = 20;
export const DAM_STRIDE = 8;

export const DamState = { Building: 0, Holding: 1, Breached: 2, Abandoned: 3 } as const;

export interface Dam {
  id: number;
  /** Creek node the dam stands on (index into the node arrays). */
  node: number;
  x: number;
  y: number;
  /** Direction of the dam wall (across the creek), radians. */
  ang: number;
  /** Wall length in metres (follows the width of the pond at the dam). */
  len: number;
  crest: number;
  maxCrest: number;
  /** Pond surface elevation, absolute metres. */
  level: number;
  state: number;
  colony: number;
  /** Tick the dam was begun. */
  born: number;
  /** The cells under water behind the dam, and their depth. */
  cells: Int32Array;
  dep: Float32Array;
  /** The crest the fill was computed at (a negative number: the fill is stale). */
  fillCrest: number;
  /** Cells of new water (not the creek as generated) now and at the most. */
  area: number;
  peakArea: number;
  /** Crest lost per tick while the dam is breached or abandoned. */
  fall: number;
  /** Events already told for this dam. */
  built: boolean;
  filled: boolean;
  meadowTold: boolean;
}

export interface PondHost {
  /** The water mask and waterDist changed: rebuild the gradients, drink spots and the habitat maps. */
  waterChanged(): void;
  /** Drown the live trees in the cells deeper than POND_DROWN (S13's list). Null when dynamicTrees is off (the static list is used). */
  drown: ((depth: Float32Array) => number) | null;
  /** Static trees were removed (dynamicTrees off): `live` has one flag per tree of world.trees. */
  staticTreesChanged(live: Uint8Array): void;
}

export interface RefreshInfo {
  flooded: number;
  drained: number;
  drowned: number;
}

export class Ponds {
  readonly n: number;
  readonly cell: number;
  readonly ground: Float32Array;
  /** Creek nodes: position, surface elevation and the unit tangent pointing downstream. */
  readonly nodeN: number;
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly ntx: Float32Array;
  readonly nty: Float32Array;
  /** Extra water depth (m) now. */
  readonly depth: Float32Array;
  /** 1 where a pond cell is water now (new water only). */
  readonly wet: Uint8Array;
  /** Fertile beaver meadow 0..1 (decays). */
  readonly meadow: Float32Array;
  /** Moisture ribbon 0..1. */
  readonly ribbon: Float32Array;
  readonly dams: Dam[] = [];
  /** Bumped whenever the depth field, a dam or a lodge-relevant thing changed. */
  version = 1;
  /** Static trees drowned (indices into world.trees / 4), in the order they went under. */
  readonly drownedTrees: number[] = [];
  private nextDam = 0;
  private readonly water0: Uint8Array;
  private readonly moisture0: Float32Array;
  /** The multiplier on capacity this module has put on a land cell (ribbon moisture and meadow). */
  private readonly capMul: Float32Array;
  private readonly treeLive: Uint8Array;
  /** Distance (m) from each cell to the creek centreline. */
  private readonly creekD: Float32Array;
  private stamp: Int32Array;
  private stampN = 0;
  private queue: Int32Array;
  private meadowCount = 0;
  private lastMeadowTick = 0;
  /** Cells flooded, drained and trees drowned since the last drainSample(). */
  private cFlooded = 0;
  private cDrained = 0;
  private cDrowned = 0;
  private dirty = true;

  constructor(private readonly world: World, private readonly veg: Vegetation, private readonly p: Params, private readonly host: PondHost) {
    const n = world.n, hn = world.hn, cell = world.cell, N2 = n * n;
    this.n = n;
    this.cell = cell;
    this.ground = new Float32Array(N2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.ground[j * n + i] = sampleHeight(world.height, hn, cell, (i + 0.5) * cell, (j + 0.5) * cell);
    this.depth = new Float32Array(N2);
    this.wet = new Uint8Array(N2);
    this.meadow = new Float32Array(N2);
    this.ribbon = new Float32Array(N2);
    this.water0 = Uint8Array.from(world.water);
    this.moisture0 = Float32Array.from(world.moisture);
    this.capMul = new Float32Array(N2).fill(1);
    this.treeLive = new Uint8Array(Math.floor(world.trees.length / 4)).fill(1);
    this.stamp = new Int32Array(N2);
    this.queue = new Int32Array(N2);
    // creek nodes inside the map, with the surface read from the generated creek cells (water cells carry the bed's surface; a node whose
    // cell is not water takes its neighbours' value), then made monotone so the water never runs uphill
    const cr = world.creek, total = cr.length / 2;
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    for (let k = 0; k < total; k++) {
      const x = cr[2 * k], y = cr[2 * k + 1];
      if (x < 0 || y < 0 || x >= world.size || y >= world.size) continue;
      const c = this.cellAt(x, y);
      xs.push(x); ys.push(y); zs.push(world.water[c] ? world.waterHeight[c] : NaN);
    }
    const m = xs.length;
    for (let k = 0; k < m; k++) {
      if (!Number.isNaN(zs[k])) continue;
      let lo = k - 1, hi = k + 1;
      while (lo >= 0 && Number.isNaN(zs[lo])) lo--;
      while (hi < m && Number.isNaN(zs[hi])) hi++;
      zs[k] = lo >= 0 && hi < m ? zs[lo] + (zs[hi] - zs[lo]) * ((k - lo) / (hi - lo)) : lo >= 0 ? zs[lo] : hi < m ? zs[hi] : 0;
    }
    for (let k = 1; k < m; k++) if (zs[k] > zs[k - 1]) zs[k] = zs[k - 1];
    // the creek centreline on the grid, for the band limit
    const line = new Uint8Array(N2);
    for (let k = 0; k + 1 < m; k++) {
      const dx = xs[k + 1] - xs[k], dy = ys[k + 1] - ys[k], steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (cell * 0.5)));
      for (let s = 0; s <= steps; s++) line[this.cellAt(xs[k] + (dx * s) / steps, ys[k] + (dy * s) / steps)] = 1;
    }
    this.creekD = distanceTransform(line, n, cell);
    this.nodeN = m;
    this.nx = Float32Array.from(xs);
    this.ny = Float32Array.from(ys);
    this.nz = Float32Array.from(zs);
    this.ntx = new Float32Array(m);
    this.nty = new Float32Array(m);
    for (let k = 0; k < m; k++) {
      const a = Math.max(0, k - 2), b = Math.min(m - 1, k + 2);
      const dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1;
      this.ntx[k] = dx / l;
      this.nty[k] = dy / l;
    }
  }

  private cellAt(x: number, y: number): number {
    const n = this.n;
    let i = (x / this.cell) | 0, j = (y / this.cell) | 0;
    if (i < 0) i = 0; else if (i >= n) i = n - 1;
    if (j < 0) j = 0; else if (j >= n) j = n - 1;
    return j * n + i;
  }

  /** The creek node nearest to a point. */
  nearestNode(x: number, y: number): number {
    let best = 0, bd = 1e18;
    for (let k = 0; k < this.nodeN; k++) {
      const dx = this.nx[k] - x, dy = this.ny[k] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // ------------------------------------------------------------------ hydrology

  /**
   * The cells a dam at `node` floods when its water stands at `level` (absolute metres). Fills `cells` and `dep` (new arrays) and
   * returns the widest half-width of the water within 14 m above the dam (for the wall length).
   */
  flood(node: number, level: number): { cells: Int32Array; dep: Float32Array; half: number } {
    const n = this.n, cell = this.cell, g = this.ground;
    const x0 = this.nx[node], y0 = this.ny[node], tx = this.ntx[node], ty = this.nty[node];
    const st = ++this.stampN, q = this.queue, mark = this.stamp;
    const cells: number[] = [], dep: number[] = [];
    let half = 0;
    // seed: the creek cell just above the dam
    let seed = this.cellAt(x0 - tx * 2.5, y0 - ty * 2.5);
    if (g[seed] >= level - 0.02) seed = this.cellAt(x0, y0);
    if (g[seed] >= level - 0.02) return { cells: new Int32Array(0), dep: new Float32Array(0), half: 0 };
    let qh = 0, qt = 0;
    q[qt++] = seed;
    mark[seed] = st;
    const R2 = MAX_R * MAX_R;
    while (qh < qt && cells.length < MAX_CELLS) {
      const c = q[qh++];
      cells.push(c);
      dep.push(level - g[c]);
      const ci = c % n, cj = (c / n) | 0;
      const cx = (ci + 0.5) * cell - x0, cy = (cj + 0.5) * cell - y0;
      const along = cx * tx + cy * ty;
      if (along > -14) {
        const perp = Math.abs(-cx * ty + cy * tx);
        if (perp > half) half = perp;
      }
      for (let d = 0; d < 4; d++) {
        const ni = d === 0 ? ci + 1 : d === 1 ? ci - 1 : ci, nj = d === 2 ? cj + 1 : d === 3 ? cj - 1 : cj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nc = nj * n + ni;
        if (mark[nc] === st || g[nc] >= level - 0.02 || this.creekD[nc] > BAND) continue;
        const ex = (ni + 0.5) * cell - x0, ey = (nj + 0.5) * cell - y0;
        if (ex * tx + ey * ty > 2 || ex * ex + ey * ey > R2) continue;
        mark[nc] = st;
        q[qt++] = nc;
      }
    }
    return { cells: Int32Array.from(cells), dep: Float32Array.from(dep), half };
  }

  /** New-water cells (not the creek as generated) a dam at `node` would hold with its crest at `crest`: a measure of the site. */
  potential(node: number, crest: number): number {
    const f = this.flood(node, this.nz[node] + crest);
    let n = 0;
    for (let k = 0; k < f.cells.length; k++) if (f.dep[k] >= POND_WET && !this.water0[f.cells[k]]) n++;
    return n;
  }

  // ------------------------------------------------------------------ dams

  addDam(node: number, colony: number, tick: number, crest = 0, maxCrest = 1.4): Dam {
    const d: Dam = {
      id: this.nextDam++, node, x: this.nx[node], y: this.ny[node], ang: Math.atan2(this.nty[node], this.ntx[node]) + Math.PI / 2, len: 10,
      crest, maxCrest, level: this.nz[node] + crest, state: DamState.Building, colony, born: tick, cells: new Int32Array(0), dep: new Float32Array(0),
      fillCrest: -1, area: 0, peakArea: 0, fall: 0, built: false, filled: false, meadowTold: false,
    };
    this.dams.push(d);
    this.dirty = true;
    this.version++;
    return d;
  }

  /** Set a dam's crest (the fill is rebuilt at the next refresh when it moved enough). */
  setCrest(d: Dam, crest: number): void {
    d.crest = crest < 0 ? 0 : crest;
    d.level = this.nz[d.node] + d.crest;
  }

  setState(d: Dam, state: number): void {
    if (d.state !== state) {
      d.state = state;
      // a dam that has just reached its full height gets its final pond
      if (state === DamState.Holding) d.fillCrest = -1;
      this.version++;
    }
  }

  removeDam(d: Dam): void {
    const k = this.dams.indexOf(d);
    if (k >= 0) { this.dams.splice(k, 1); this.dirty = true; this.version++; }
  }

  /** Mark the combined field stale (a dam moved by more than the refresh threshold, or went). */
  invalidate(): void {
    this.dirty = true;
  }

  get needsRefresh(): boolean {
    if (this.dirty) return true;
    for (const d of this.dams) if (d.fillCrest < 0 || Math.abs(d.crest - d.fillCrest) >= 0.04 || (d.crest <= 0 && d.fillCrest > 0)) return true;
    return false;
  }

  // ------------------------------------------------------------------ refresh

  /** Rebuild the fills that moved, combine them, and carry the changes into the world. */
  refresh(): RefreshInfo {
    const w = this.world, v = this.veg, n = this.n, N2 = n * n, depth = this.depth;
    for (const d of this.dams) {
      const stale = d.fillCrest < 0 || Math.abs(d.crest - d.fillCrest) >= 0.04 || (d.crest <= 0 && d.fillCrest > 0);
      if (!stale) continue;
      if (d.crest < 0.05) {
        d.cells = new Int32Array(0);
        d.dep = new Float32Array(0);
        d.len = 10;
        d.area = 0;
      } else {
        const f = this.flood(d.node, d.level);
        d.cells = f.cells;
        d.dep = f.dep;
        d.len = Math.max(10, Math.min(48, 2 * f.half + 4));
        let area = 0;
        for (let k = 0; k < f.cells.length; k++) if (f.dep[k] >= POND_WET && !this.water0[f.cells[k]]) area++;
        d.area = area;
        if (area > d.peakArea) d.peakArea = area;
      }
      d.fillCrest = d.crest;
    }
    depth.fill(0);
    for (const d of this.dams) for (let k = 0; k < d.cells.length; k++) {
      const c = d.cells[k];
      if (d.dep[k] > depth[c]) depth[c] = d.dep[k];
    }
    // transitions
    let flooded = 0, drained = 0;
    const wet = this.wet;
    for (let c = 0; c < N2; c++) {
      if (this.water0[c]) continue;
      const now = depth[c] >= POND_WET ? 1 : 0;
      if (now === wet[c]) {
        if (now) w.waterHeight[c] = this.ground[c] + depth[c];
        continue;
      }
      wet[c] = now;
      if (now) {
        flooded++;
        w.water[c] = 1;
        w.waterHeight[c] = this.ground[c] + depth[c];
        w.capacity[c] = 0;
        this.capMul[c] = 1;
        v.grass[c] = 0;
        v.browse[c] = 0;
        v.browseK[c] = 0;
        v.burn[c] = 0;
        w.moisture[c] = this.moisture0[c];
        if (v.droughtShield !== null) v.droughtShield[c] = 0;
        if (this.meadow[c] > 0) { this.meadow[c] = 0; this.meadowCount--; }
      } else {
        drained++;
        w.water[c] = 0;
        w.waterHeight[c] = 0;
        w.moisture[c] = this.moisture0[c];
        const mf = 0.35 + 0.65 * Math.min(1, this.moisture0[c] / 0.7);
        const cap0 = w.soilBase[c] * mf * (1 - 0.45 * w.cover[c]) * (1 - Math.min(0.6, w.slope[c] * 0.8));
        w.capacity[c] = cap0 < 0 ? 0 : cap0 > 1 ? 1 : cap0;
        this.capMul[c] = 1;
        v.grass[c] = 0.04;
        v.browseK[c] = 0.4 * w.capacity[c] / Math.max(0.3, 1 - 0.45 * w.cover[c]) + 0.6 * w.cover[c];
        v.browse[c] = 0.15 * v.browseK[c];
        v.soil[c] = Math.min(1.4, v.soil[c] + 0.3);
        if (this.meadow[c] === 0) this.meadowCount++;
        this.meadow[c] = 1;
      }
    }
    // trees: any cell deeper than POND_DROWN drowns what stands in it (checked on the flooded cells and whenever the water got deeper)
    const drowned = this.host.drown !== null ? this.host.drown(depth) : this.drownStatic();
    if (flooded > 0 || drained > 0 || this.dirty) {
      w.waterDist.set(distanceTransform(w.water, n, this.cell));
      this.host.waterChanged();
    }
    this.updateRibbon();
    v.recountLand();
    this.dirty = false;
    this.version++;
    this.cFlooded += flooded;
    this.cDrained += drained;
    this.cDrowned += drowned;
    return { flooded, drained, drowned };
  }

  /** Static trees (dynamicTrees off): trees in deep water lose their height in the sim's copy and are listed for the renderer. */
  private drownStatic(): number {
    const t = this.world.trees;
    let dead = 0;
    for (let k = 0; k + 3 < t.length; k += 4) {
      const idx = k / 4;
      if (!this.treeLive[idx] || t[k + 2] <= 0) continue;
      const c = this.cellAt(t[k], t[k + 1]);
      if (this.depth[c] < POND_DROWN) continue;
      this.treeLive[idx] = 0;
      t[k + 2] = 0;
      t[k + 3] = 0;
      this.drownedTrees.push(idx);
      dead++;
    }
    if (dead > 0) this.host.staticTreesChanged(this.treeLive);
    return dead;
  }

  /** The ribbon follows the pond: moisture, capacity and the drought shield, for the cells whose ribbon value changed. */
  private updateRibbon(): void {
    const w = this.world, v = this.veg, n = this.n, N2 = n * n, p = this.p;
    let any = false;
    for (let c = 0; c < N2; c++) if (this.wet[c]) { any = true; break; }
    let pd: Float32Array | null = null;
    if (any) pd = distanceTransform(this.wet, n, this.cell);
    const bonus = p.beaverMoisture, shield = p.beaverShield, cap = p.beaverMeadowCap;
    if (v.droughtShield === null && any && shield > 0) v.droughtShield = new Float32Array(N2);
    for (let c = 0; c < N2; c++) {
      let r = 0;
      if (pd !== null && !w.water[c]) { const d = pd[c]; r = d < RIBBON_M ? 1 - d / RIBBON_M : 0; }
      if (r === this.ribbon[c]) continue;
      this.ribbon[c] = r;
      if (this.water0[c] || w.water[c]) continue;
      w.moisture[c] = Math.min(1, this.moisture0[c] + bonus * r);
      if (v.droughtShield !== null) v.droughtShield[c] = shield * r;
      this.applyCap(c, cap);
    }
  }

  /** Put the capacity multiplier of a land cell in step with its moisture and meadow. */
  private applyCap(c: number, meadowCap: number): void {
    const w = this.world;
    if (w.water[c]) return;
    const mf0 = 0.35 + 0.65 * Math.min(1, this.moisture0[c] / 0.7);
    const mf1 = 0.35 + 0.65 * Math.min(1, w.moisture[c] / 0.7);
    const mul = (mf1 / mf0) * (1 + meadowCap * this.meadow[c]);
    w.capacity[c] *= mul / this.capMul[c];
    if (w.capacity[c] > 1) w.capacity[c] = 1;
    this.capMul[c] = mul;
  }

  /** The meadow fades (called every tick by the colony step; acts once a season). */
  stepMeadow(tick: number): void {
    if (this.meadowCount <= 0 || tick - this.lastMeadowTick < SEASON_TICKS) return;
    const dt = tick - this.lastMeadowTick;
    this.lastMeadowTick = tick;
    const dec = dt / (this.p.beaverMeadowYears * YEAR_TICKS), cap = this.p.beaverMeadowCap;
    const N2 = this.n * this.n;
    for (let c = 0; c < N2; c++) {
      const m = this.meadow[c];
      if (m <= 0) continue;
      const nm = m - dec;
      if (nm <= 0) { this.meadow[c] = 0; this.meadowCount--; } else this.meadow[c] = nm;
      this.applyCap(c, cap);
    }
  }

  // ------------------------------------------------------------------ readings

  /** Metres squared of new pond water now. */
  waterArea(): number {
    let n = 0;
    for (let c = 0; c < this.wet.length; c++) n += this.wet[c];
    return n * this.cell * this.cell;
  }

  meadowArea(): number {
    return this.meadowCount * this.cell * this.cell;
  }

  /** Depth in centimetres, one byte per cell (see the header). */
  depthBytes(): Uint8Array {
    const out = new Uint8Array(this.depth.length);
    for (let c = 0; c < out.length; c++) {
      const d = this.depth[c] * 100;
      out[c] = d <= 0 ? 0 : d >= 255 ? 255 : Math.max(1, Math.round(d));
    }
    return out;
  }

  /** The dams, DAM_STRIDE floats each (see the header). */
  damArray(): Float32Array {
    const out = new Float32Array(this.dams.length * DAM_STRIDE);
    this.dams.forEach((d, k) => {
      out.set([d.x, d.y, d.crest, d.state, d.ang, d.len, d.level, d.colony], k * DAM_STRIDE);
    });
    return out;
  }

  drainSample(): { flooded: number; drained: number; drowned: number } {
    const r = { flooded: this.cFlooded, drained: this.cDrained, drowned: this.cDrowned };
    this.cFlooded = this.cDrained = this.cDrowned = 0;
    return r;
  }
}
