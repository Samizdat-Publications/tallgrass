// The regional pool (V2-PLAN.md S1): the wider prairie beyond the valley, seen only as gene statistics.
// Per species it keeps a running mean and variance for every gene, starting from the founders.
// An emigrant pulls the pool toward its genes (absorb); an immigrant's genes are drawn from the pool (draw).
// That is gene flow in both directions, and it costs no agents: the world outside the valley is not simulated.
//
// Determinism: the pool owns its own generator (hashSeed(seed + ':region')) and never touches the sim's main
// stream, so building one, absorbing into it and drawing from it leave a run with the feature off untouched.
import { NG } from './agents';
import { hashSeed, Rng } from './rng';
import { SPECIES_COUNT } from './types';

/** How far one emigrant pulls the pool toward its own genes. */
export const ABSORB_RATE = 0.02;
/** The variance never shrinks below this share of the founders' variance, so the pool cannot collapse to a point. */
const VAR_FLOOR_FRAC = 0.25;
/** Variance used for a species that has no founders in the valley (jitter of +/-0.06 around 1). */
const DEFAULT_VAR = 0.0012;

export class RegionalPool {
  /** Own stream for everything the open prairie decides (rolls, positions, ages, genes). */
  readonly rng: Rng;
  /** SPECIES_COUNT x NG running means and variances (index sp * NG + gene). */
  readonly mean = new Float64Array(SPECIES_COUNT * NG);
  readonly variance = new Float64Array(SPECIES_COUNT * NG);
  private readonly floor = new Float64Array(SPECIES_COUNT * NG);
  /** Founders seen per species (0 = the pool holds the default stock). */
  readonly founders = new Int32Array(SPECIES_COUNT);
  /** Emigrants absorbed since the start, per species. */
  readonly absorbed = new Int32Array(SPECIES_COUNT);

  constructor(seed: number, coatBase: number[]) {
    this.rng = new Rng(hashSeed(`${seed >>> 0}:region`));
    for (let s = 0; s < SPECIES_COUNT; s++) {
      for (let g = 0; g < NG; g++) {
        const k = s * NG + g;
        // gene index 5 is the coat (0 pale .. 1 dark); every other gene is a multiplier around 1
        this.mean[k] = g === 5 ? (coatBase[s] ?? 0.5) : 1;
        this.variance[k] = DEFAULT_VAR;
        this.floor[k] = DEFAULT_VAR * VAR_FLOOR_FRAC;
      }
    }
  }

  /** Start the pool from the founders: the mean and variance of every living animal's genes, per species. */
  seedFrom(sp: Uint8Array, alive: Uint8Array, genes: Float32Array, hi: number): void {
    const n = new Int32Array(SPECIES_COUNT);
    const sum = new Float64Array(SPECIES_COUNT * NG);
    const sq = new Float64Array(SPECIES_COUNT * NG);
    for (let i = 0; i < hi; i++) {
      if (!alive[i]) continue;
      const s = sp[i];
      n[s]++;
      for (let g = 0; g < NG; g++) {
        const v = genes[i * NG + g];
        sum[s * NG + g] += v;
        sq[s * NG + g] += v * v;
      }
    }
    for (let s = 0; s < SPECIES_COUNT; s++) {
      this.founders[s] = n[s];
      if (n[s] < 2) continue;
      for (let g = 0; g < NG; g++) {
        const k = s * NG + g;
        const m = sum[k] / n[s];
        this.mean[k] = m;
        this.variance[k] = Math.max(1e-6, sq[k] / n[s] - m * m);
        this.floor[k] = this.variance[k] * VAR_FLOOR_FRAC;
      }
    }
  }

  /** An emigrant leaves with genes at offset o of `genes`: the pool moves 2% of the way toward them. */
  absorb(sp: number, genes: ArrayLike<number>, o = 0): void {
    for (let g = 0; g < NG; g++) {
      const k = sp * NG + g;
      const d = genes[o + g] - this.mean[k];
      this.mean[k] += ABSORB_RATE * d;
      this.variance[k] = Math.max(this.floor[k], this.variance[k] + ABSORB_RATE * (d * d - this.variance[k]));
    }
    this.absorbed[sp]++;
  }

  /** Genes for an immigrant: one normal draw per gene around the pool mean. Written to out[o..o+NG), unclamped. */
  draw(sp: number, rng: Rng, out: Float32Array, o = 0): void {
    for (let g = 0; g < NG; g++) {
      const k = sp * NG + g;
      out[o + g] = this.mean[k] + Math.sqrt(this.variance[k]) * rng.normal();
    }
  }
}
