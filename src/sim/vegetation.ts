// Grass, soil, fear and fire on the 256 x 256 cell grid. Updated in strided row passes.
import { Environment } from './env';
import { Params } from './params';
import { Rng } from './rng';
import { World } from './world';

/** Rows are updated in STRIDE interleaved passes, so each cell advances by dt = STRIDE ticks. */
export const STRIDE = 16;

export class Vegetation {
  readonly n: number;
  readonly cell: number;
  grass: Float32Array;
  /** Forbs and shrub browse (pronghorn food), 0..~0.8. */
  browse: Float32Array;
  browseK: Float32Array;
  soil: Float32Array;
  fear: Float32Array;
  /** 0 none; (0, 1] ash fading; > 1 burning (value - 1 = remaining burn fraction). */
  burn: Float32Array;
  burningCells = 0;
  private landCells: number;

  constructor(private w: World, private p: Params, private env: Environment, private rng: Rng) {
    this.n = w.n;
    this.cell = w.cell;
    const N2 = w.n * w.n;
    this.grass = new Float32Array(N2);
    this.browse = new Float32Array(N2);
    this.browseK = new Float32Array(N2);
    this.soil = new Float32Array(N2);
    this.fear = new Float32Array(N2);
    this.burn = new Float32Array(N2);
    let land = 0;
    for (let c = 0; c < N2; c++) {
      this.soil[c] = w.soilBase[c];
      this.grass[c] = w.capacity[c] * p.grassInit;
      this.browseK[c] = w.water[c] ? 0 : 0.4 * w.capacity[c] / Math.max(0.3, 1 - 0.45 * w.cover[c]) + 0.6 * w.cover[c];
      this.browse[c] = this.browseK[c] * 0.8;
      if (!w.water[c]) land++;
    }
    this.landCells = land;
  }

  cellAt(x: number, y: number): number {
    const n = this.n;
    let i = (x / this.cell) | 0, j = (y / this.cell) | 0;
    if (i < 0) i = 0; else if (i >= n) i = n - 1;
    if (j < 0) j = 0; else if (j >= n) j = n - 1;
    return j * n + i;
  }

  /** Effective carrying capacity of a cell right now (before season). */
  capacityOf(c: number): number {
    const sb = this.w.soilBase[c];
    let f = this.soil[c] / (sb > 0.15 ? sb : 0.15);
    f = f < 0.35 ? 0.35 : f > 1.5 ? 1.5 : f;
    return this.w.capacity[c] * f;
  }

  step(tick: number): void {
    const { n, grass, soil, fear, burn, p, w } = this;
    const dt = STRIDE;
    const gf = this.env.growthFactor();
    const season = this.env.state.season;
    const dormant = gf < 0.12;
    const drought = this.env.droughtTicks > 0;
    const rGrow = p.grassGrowth * gf;
    // drought refuges (off at 0): the growth the season would give without the drought, for the wettest cells
    const refuge = drought ? p.droughtRefuge : 0;
    const rFree = refuge > 0 ? rGrow / Math.max(0.05, 1 - this.env.droughtSeverity) : rGrow;
    const seed = p.grassSeedFloor * gf;
    const fearKeep = 1 - p.fearDecay * dt;
    const windDir = this.env.state.windDir, windS = this.env.state.windStrength;
    const wx = Math.cos(windDir), wy = Math.sin(windDir);
    // fire is much likelier late summer and autumn, and nearly impossible in the rain
    const si = Math.floor(season) % 4;
    const seasonDry = [0.35, 1.0, 0.9, 0.25][si] * (drought ? 1.6 : 1) * (1 - 0.9 * this.env.state.rain);
    // heavy rain stops fire spreading (only with storm cells on, so the default sim is unchanged)
    const rainStop = p.stormCells > 0 && this.env.state.rain > 0.5;
    let burning = 0;
    for (let j = tick % STRIDE; j < n; j += STRIDE) {
      const row = j * n;
      for (let i = 0; i < n; i++) {
        const c = row + i;
        if (w.water[c]) continue;
        let g = grass[c];
        const K = this.capacityOf(c);
        const b = burn[c];
        if (b > 1) {
          // burning: consume grass, spread, then turn to ash
          burning++;
          g *= 0.35;
          soil[c] = Math.min(1.2, soil[c] + 0.004);
          fear[c] = 1;
          const nb = b - dt / 48;
          burn[c] = nb <= 1 ? 1 : nb;
          if (b > 1.15 && !rainStop) this.spreadFire(i, j, seasonDry, wx, wy, windS);
        } else if (b > 0) {
          burn[c] = Math.max(0, b - dt / 2400);
        }
        const moist = 0.55 + 0.9 * w.moisture[c];
        let rg = rGrow, dieF = 0.7;
        if (refuge > 0) {
          // 0 on the uplands, up to the refuge share on the wettest ground by the water
          const m = w.moisture[c];
          const wet = refuge * (m <= 0.55 ? 0 : m >= 0.85 ? 1 : ((m - 0.55) / 0.3) * ((m - 0.55) / 0.3) * (3 - 2 * ((m - 0.55) / 0.3)));
          rg = rGrow + (rFree - rGrow) * wet;
          dieF = 0.7 * (1 - wet);
        }
        g += dt * (rg * moist * g * (1 - g / (K + 1e-6)) + seed * K);
        if (dormant) g -= dt * p.winterDieback * g;
        if (drought) g -= dt * p.winterDieback * dieF * g;
        if (g > K) g -= (g - K) * 0.004 * dt;
        if (g < 0) g = 0;
        grass[c] = g;
        // forbs and browse regrow more slowly and burn with the grass
        let bw = this.browse[c];
        const BK = this.browseK[c];
        if (b > 1) bw *= 0.5;
        bw += dt * (rg * 0.85 * moist * bw * (1 - bw / (BK + 1e-6)) + seed * BK);
        if (dormant) bw -= dt * p.winterDieback * 0.5 * bw;
        this.browse[c] = bw < 0 ? 0 : bw;
        // overgrazing wears soil down; healthy grass slowly restores it
        if (g < 0.08 * K + 0.01) soil[c] = Math.max(0.12, soil[c] - p.soilDegrade * dt);
        else soil[c] += (w.soilBase[c] - soil[c]) * p.soilRecover * dt;
        fear[c] *= fearKeep;
      }
    }
    this.burningCells = burning * STRIDE; // estimate of burning cells overall
  }

  private spreadFire(i: number, j: number, seasonDry: number, wx: number, wy: number, windS: number): void {
    const n = this.n;
    for (let k = 0; k < 8; k++) {
      const di = k === 0 ? 1 : k === 1 ? -1 : k === 2 ? 0 : k === 3 ? 0 : k === 4 ? 1 : k === 5 ? 1 : k === 6 ? -1 : -1;
      const dj = k === 0 ? 0 : k === 1 ? 0 : k === 2 ? 1 : k === 3 ? -1 : k === 4 ? 1 : k === 5 ? -1 : k === 6 ? 1 : -1;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const c = nj * n + ni;
      if (this.w.water[c] || this.burn[c] > 0.5) continue;
      const fuel = this.grass[c];
      if (fuel < 0.08) continue;
      const len = k < 4 ? 1 : Math.SQRT2;
      const align = (di * wx + dj * wy) / len;
      const dry = 1 - 0.6 * this.w.moisture[c];
      const pr = Math.min(0.95, this.p.fireSpread * 0.22 * (STRIDE / 8) * seasonDry * dry * Math.min(1, fuel * 1.6) * Math.max(0.15, 1 + 1.8 * windS * align) / len);
      if (this.rng.next() < pr) this.burn[c] = 2;
    }
  }

  /** Set the land cells within r of (x, y) burning. Returns how many caught. */
  ignite(x: number, y: number, r: number): number {
    const n = this.n, cell = this.cell;
    let lit = 0;
    const i0 = Math.max(0, Math.floor((x - r) / cell)), i1 = Math.min(n - 1, Math.floor((x + r) / cell));
    const j0 = Math.max(0, Math.floor((y - r) / cell)), j1 = Math.min(n - 1, Math.floor((y + r) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * n + i;
        if (!this.w.water[c] && Math.hypot((i + 0.5) * cell - x, (j + 0.5) * cell - y) <= r) { this.burn[c] = 2; lit++; }
      }
    }
    return lit;
  }

  /** Add to a field in a disc with linear falloff. */
  stamp(field: Float32Array, x: number, y: number, r: number, amt: number, max = 1): void {
    const n = this.n, cell = this.cell;
    const i0 = Math.max(0, Math.floor((x - r) / cell)), i1 = Math.min(n - 1, Math.floor((x + r) / cell));
    const j0 = Math.max(0, Math.floor((y - r) / cell)), j1 = Math.min(n - 1, Math.floor((y + r) / cell));
    for (let j = j0; j <= j1; j++) {
      const dy = (j + 0.5) * cell - y;
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) * cell - x;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r) {
          const c = j * n + i;
          const v = field[c] + amt * (1 - d / r);
          field[c] = v > max ? max : v;
        }
      }
    }
  }

  meanGrass(): number {
    let s = 0;
    const g = this.grass, wat = this.w.water;
    for (let c = 0; c < g.length; c++) if (!wat[c]) s += g[c];
    return s / this.landCells;
  }

  meanOf(field: Float32Array): number {
    let s = 0;
    const wat = this.w.water;
    for (let c = 0; c < field.length; c++) if (!wat[c]) s += field[c];
    return s / this.landCells;
  }

  /** RGBA8 texture data per types.ts: R grass, G soil, B burn, A fear. */
  fillTexture(out: Uint8Array): void {
    const { grass, soil, burn, fear } = this;
    for (let c = 0, o = 0; c < grass.length; c++, o += 4) {
      const g = grass[c] * 255;
      out[o] = g > 255 ? 255 : g;
      const s = soil[c] * 212;
      out[o + 1] = s > 255 ? 255 : s;
      const b = burn[c];
      out[o + 2] = b > 1 ? 255 : (b * 200) | 0;
      const f = fear[c] * 255;
      out[o + 3] = f > 255 ? 255 : f;
    }
  }
}
