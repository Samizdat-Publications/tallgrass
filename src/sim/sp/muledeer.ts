// Mule deer (V2-PLAN.md S8): browsers of the creek corridor and the groves, distinct from the pronghorn of the open flats.
//
// What this module owns is the habitat. The deer think and live through the shared herbivore code in sim.ts (thinkHerbivore, liveHerbivore),
// which asks `hab` where a mule deer may browse and `coarse` where to go when the local patch is spent.
//
// ---- Habitat ----------------------------------------------------------------------------------------------------------------------
// A mule deer browses only where the ground is covered (tree and shrub cover above muledeerCover, 0.25) or in the draws: the low, moist
// ground along the creek and around the ponds, within muledeerDrawDist (30 m) of water. Everywhere else its browse is worth nothing to it,
// so it does not graze there, and when its patch is spent it walks to the richest habitat on the 32 x 32 coarse map (`coarse`), not the
// greenest pasture. `hab` is 1 inside the habitat and ramps to 0 over 15 m of distance (or 0.15 of cover) at its edge, 0 in water.
//
// ---- Groups -----------------------------------------------------------------------------------------------------------------------
// Founders arrive in groups of muledeerGroupMin to muledeerGroupMax (3 to 10) at habitat spots. The herd code keeps them together; a group
// that grows past muledeerGroupMax (counted within the species' herdRadius) stops cohering and drifts apart, so groups stay small.
// Does hide their fawns (hideAge) like pronghorn does, and the births follow the matingWindow param through inMatingSeason.
//
// ---- Flight -----------------------------------------------------------------------------------------------------------------------
// While a mule deer is fleeing (St.Flee) the snapshot sets F_STOT (types.ts, 128) so the renderer can draw the stotting gait: all four feet
// bouncing together. Nothing else in the sim changes for it.
//
// ---- Open prairie -----------------------------------------------------------------------------------------------------------------
// With openPrairie on, a mule deer population that has fallen below muledeerRescueBelow (and has lived here before) is topped up each spring
// (season 0.3) by a group of muledeerRescue that walks in from the nearest corridor to a habitat spot. Mule deer do not leave in autumn.
//
// ---- Determinism and the main stream ----------------------------------------------------------------------------------------------
// Positions and group sizes come from a private generator, new Rng(hashSeed(seed + ':muledeer')). Nothing here touches the main stream, and
// the habitat map is built lazily on first use, so a run with no mule deer is unchanged.
import { hashSeed, Rng } from '../rng';
import type { Params } from '../params';
import type { World } from '../world';

const B = 32;

export class MuleDeer {
  readonly rng: Rng;
  private habMap: Float32Array | null = null;
  /** Habitat food per 16 m coarse cell (32 x 32): hab x (browse x 1.6 + grass x 0.35), a mean over the cell's land. Refreshed with refresh(). */
  readonly coarse = new Float32Array(B * B);

  constructor(seed: number, private readonly world: World, private readonly p: Params) {
    this.rng = new Rng(hashSeed(seed + ':muledeer'));
  }

  /** The cover field changed (dynamic trees, S13): the habitat map is built again on next use. */
  invalidate(): void {
    this.habMap = null;
  }

  /** Habitat suitability 0..1 per vegetation cell (n x n, row-major y then x). Built on first use. */
  get hab(): Float32Array {
    if (this.habMap === null) this.habMap = this.buildHabitat();
    return this.habMap;
  }

  private buildHabitat(): Float32Array {
    const w = this.world, p = this.p;
    const N2 = w.n * w.n;
    const out = new Float32Array(N2);
    const c0 = p.muledeerCover, d0 = p.muledeerDrawDist;
    for (let c = 0; c < N2; c++) {
      if (w.water[c]) continue;
      const cov = Math.min(1, Math.max(0, (w.cover[c] - (c0 - 0.15)) / 0.15));
      const dr = Math.min(1, Math.max(0, (d0 + 15 - w.waterDist[c]) / 15));
      out[c] = cov > dr ? cov : dr;
    }
    return out;
  }

  /** Recompute the coarse habitat-food map from the live browse and grass (the sim calls this every 50 ticks while any mule deer lives). */
  refresh(browse: Float32Array, grass: Float32Array): void {
    const n = this.world.n, r = n / B, hab = this.hab;
    this.coarse.fill(0);
    for (let j = 0; j < n; j++) {
      const bj = ((j / r) | 0) * B;
      for (let i = 0; i < n; i++) {
        const c = j * n + i;
        const h = hab[c];
        if (h === 0) continue;
        this.coarse[bj + ((i / r) | 0)] += h * (browse[c] * 1.6 + grass[c] * 0.35);
      }
    }
    const inv = 1 / (r * r);
    for (let k = 0; k < B * B; k++) this.coarse[k] *= inv;
  }

  /** A random habitat spot (full suitability) at least 20 m from the map edge, or null when the world has none. */
  spot(): [number, number] | null {
    const w = this.world, hab = this.hab, rng = this.rng;
    for (let k = 0; k < 600; k++) {
      const x = rng.range(20, w.size - 20), y = rng.range(20, w.size - 20);
      const c = Math.min(w.n - 1, Math.floor(y / w.cell)) * w.n + Math.min(w.n - 1, Math.floor(x / w.cell));
      if (hab[c] >= 0.99) return [x, y];
    }
    return null;
  }

  /** Split n founders into groups of muledeerGroupMin to muledeerGroupMax (a short last group joins the one before it). */
  groupSizes(n: number): number[] {
    const lo = Math.max(1, Math.round(this.p.muledeerGroupMin)), hi = Math.max(lo, Math.round(this.p.muledeerGroupMax));
    const out: number[] = [];
    let left = n;
    while (left > 0) {
      const g = Math.min(left, lo + this.rng.int(hi - lo + 1));
      out.push(g);
      left -= g;
    }
    if (out.length > 1 && out[out.length - 1] < lo) {
      const last = out.pop()!;
      out[out.length - 1] += last;
    }
    return out;
  }
}
