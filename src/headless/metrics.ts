// Stability metrics for headless batch runs. Everything here is pure (no I/O) so it can be unit-tested.
// Self-test: npx tsx src/headless/metrics.ts --selftest
//
// Conventions
//  - A "series" is parallel arrays: ticks[] (ascending sample ticks) and values[].
//  - Burn-in: the first BURN_IN_FRAC of the run is excluded from every statistic.
//  - Shock samples: the harness records a sample at the shock tick BEFORE applying the shock, so samples with
//    tick <= shock tick are "prior" and samples with tick > recovery-start tick are "post".
//  - Peaks and the dominant period are computed on the series smoothed with a one-year boxcar, so the annual
//    seasonal cycle does not swamp the multi-year predator-prey swings (the raw CV / near-zero stats are NOT smoothed).

import { SPECIES_KEYS, YEAR_TICKS } from '../sim/types';

export const BURN_IN_FRAC = 0.15;
export const NEAR_ZERO_FRAC = 0.1;
export const PEAK_PROMINENCE_FRAC = 0.25;
export const PRIOR_WINDOW_FRAC = 0.3;
export const RECOVERY_SMOOTH = 5;
export const RECOVERY_HOLD = 10;

/** Proposed acceptance thresholds (starting point from BRIEF.md). Tune here; the markdown report reads them. */
export const ACCEPT = {
  persistencePct: 80,
  /** median fraction of post-burn-in samples below 10% of the seed's mean */
  nearZeroFracMax: 0.05,
  /** median longest near-zero stretch, in years */
  longestNearZeroYearsMax: 2,
  /** median (max / mean): above this the trophic level "explodes" past its normal range */
  maxOverMeanMax: 4,
  /** median CV: below this the population is a flat line, which is also a failure */
  cvMin: 0.05,
  /** share of seeds that must return to their prior range after a shock */
  recoveredPct: 80,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// numeric helpers
// ---------------------------------------------------------------------------------------------------------------

export function mean(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population standard deviation. */
export function std(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/** Linear-interpolated percentile, p in [0, 100]. Sorts a copy. */
export function percentile(xs: readonly number[], p: number): number {
  if (!xs.length) return NaN;
  const a = xs.slice().sort((x, y) => x - y);
  const idx = (Math.min(100, Math.max(0, p)) / 100) * (a.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

export function median(xs: readonly number[]): number {
  return percentile(xs, 50);
}

/** Median of the non-null, finite entries; null when there are none. */
export function medianOf(xs: ReadonlyArray<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? median(v) : null;
}

export function meanOf(xs: ReadonlyArray<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? mean(v) : null;
}

/** Trailing moving average with a full window only: out[i] = NaN for i < w - 1. */
export function trailingMA(xs: readonly number[], w: number): number[] {
  const out = new Array<number>(xs.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= w) s -= xs[i - w];
    if (i >= w - 1) out[i] = s / w;
  }
  return out;
}

/** Centered moving average; windows shrink at the edges instead of producing NaN. */
export function centeredMA(xs: readonly number[], w: number): number[] {
  if (w <= 1) return xs.slice();
  const n = xs.length;
  const pre = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + xs[i];
  const half = Math.floor(w / 2);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + (w - 1 - half));
    out[i] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
  }
  return out;
}

/** Median spacing between consecutive sample ticks. */
export function sampleSpacing(ticks: readonly number[]): number {
  if (ticks.length < 2) return 1;
  const d: number[] = [];
  for (let i = 1; i < ticks.length; i++) d.push(ticks[i] - ticks[i - 1]);
  return median(d);
}

/**
 * Peak indices with topographic prominence >= minProm (same definition scipy uses: the drop to the higher of the
 * two bases, where each base is the lowest point between the peak and the next strictly higher sample, or the edge).
 * The first and last samples are never peaks.
 */
export function findPeaks(xs: readonly number[], minProm: number): number[] {
  const n = xs.length;
  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(xs[i] > xs[i - 1] && xs[i] >= xs[i + 1])) continue;
    const v = xs[i];
    let leftMin = v;
    for (let j = i - 1; j >= 0; j--) {
      if (xs[j] > v) break;
      if (xs[j] < leftMin) leftMin = xs[j];
    }
    let rightMin = v;
    for (let j = i + 1; j < n; j++) {
      if (xs[j] > v) break;
      if (xs[j] < rightMin) rightMin = xs[j];
    }
    const prom = v - Math.max(leftMin, rightMin);
    if (prom >= minProm && prom > 0) peaks.push(i);
  }
  return peaks;
}

/** Longest run of true flags: its length in samples and its start index. */
export function longestRun(flags: readonly boolean[]): { len: number; start: number } {
  let best = 0;
  let bestStart = -1;
  let cur = 0;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) {
      cur++;
      if (cur > best) {
        best = cur;
        bestStart = i - cur + 1;
      }
    } else cur = 0;
  }
  return { len: best, start: bestStart };
}

export interface PeriodResult {
  periodTicks: number | null;
  /** autocorrelation value at the chosen lag (0..1), null when no period was found */
  strength: number | null;
}

/**
 * Dominant period from the autocorrelation function: after removing the mean and linear trend, take the first
 * autocorrelation peak that follows the first zero crossing and is at least 0.15 high (and within 60% of the tallest
 * such peak). Long series are block-averaged to <= maxPoints first so this stays O(maxPoints^2). Returns null when
 * the series is flat or has no repeating structure.
 */
export function dominantPeriod(xs: readonly number[], dtTicks: number, maxPoints = 2048): PeriodResult {
  const none: PeriodResult = { periodTicks: null, strength: null };
  if (xs.length < 16) return none;
  let ys = xs.slice();
  let dt = dtTicks;
  if (ys.length > maxPoints) {
    const f = Math.ceil(ys.length / maxPoints);
    const m = Math.floor(ys.length / f);
    const d: number[] = [];
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let k = 0; k < f; k++) s += ys[i * f + k];
      d.push(s / f);
    }
    ys = d;
    dt = dtTicks * f;
  }
  const n = ys.length;
  // remove mean and least-squares linear trend
  const tm = (n - 1) / 2;
  const ym = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - tm) * (ys[i] - ym);
    sxx += (i - tm) * (i - tm);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  for (let i = 0; i < n; i++) ys[i] = ys[i] - ym - slope * (i - tm);
  let var0 = 0;
  for (let i = 0; i < n; i++) var0 += ys[i] * ys[i];
  if (!(var0 > 1e-12 * n)) return none;
  const maxLag = Math.floor(n / 2);
  const r = new Array<number>(maxLag + 1);
  for (let k = 0; k <= maxLag; k++) {
    let s = 0;
    for (let i = 0; i + k < n; i++) s += ys[i] * ys[i + k];
    r[k] = s / var0;
  }
  let k0 = -1;
  for (let k = 1; k <= maxLag; k++) {
    if (r[k] < 0) {
      k0 = k;
      break;
    }
  }
  if (k0 < 0) return none;
  const cand: Array<{ k: number; r: number }> = [];
  for (let k = k0 + 1; k < maxLag; k++) {
    if (r[k] > r[k - 1] && r[k] >= r[k + 1] && r[k] >= 0.15) cand.push({ k, r: r[k] });
  }
  if (!cand.length) return none;
  const top = Math.max(...cand.map((c) => c.r));
  const pick = cand.find((c) => c.r >= 0.6 * top)!;
  return { periodTicks: pick.k * dt, strength: pick.r };
}

// ---------------------------------------------------------------------------------------------------------------
// shock recovery
// ---------------------------------------------------------------------------------------------------------------

export interface ShockInfo {
  /** Tick whose preceding window defines the prior range (the first shock). */
  priorEndTick: number;
  /** Tick from which recovery time is measured (the shock itself; the reintroduction for wolfwipe). */
  recoveryStartTick: number;
  label?: string;
}

export interface PriorRange {
  lo: number;
  hi: number;
  median: number;
  samples: number;
  startTick: number;
  endTick: number;
}

export interface Recovery {
  /** did the 5-sample moving average ever sit outside the prior range after the shock */
  leftRange: boolean;
  /** ticks from the shock to re-entering the range and staying 10 samples; 0 if never left; null if never */
  recoveryTicks: number | null;
  /** lowest / highest 5-sample moving average after the shock, as a multiple of the prior median */
  minRel: number | null;
  maxRel: number | null;
}

/** Prior range: 10th to 90th percentile over the window (priorWindowFrac of the run) ending at the shock. */
export function priorRange(
  ticks: readonly number[],
  values: readonly number[],
  priorEndTick: number,
  totalTicks: number,
  burnInTick: number,
  windowFrac = PRIOR_WINDOW_FRAC,
): PriorRange | null {
  const startTick = Math.max(burnInTick, priorEndTick - windowFrac * totalTicks);
  const win: number[] = [];
  for (let i = 0; i < ticks.length; i++) if (ticks[i] >= startTick && ticks[i] <= priorEndTick) win.push(values[i]);
  if (win.length < 3) return null;
  return {
    lo: percentile(win, 10),
    hi: percentile(win, 90),
    median: median(win),
    samples: win.length,
    startTick,
    endTick: priorEndTick,
  };
}

/**
 * Recovery after a shock. Moving averages use only post-shock samples (no pre-shock leakage), so the earliest
 * possible answer is RECOVERY_SMOOTH samples after the shock. Recovery counts from the first time the average LEAVES
 * the prior range: the time at which it re-enters and then stays inside for `hold` consecutive samples.
 */
export function recoveryTime(
  ticks: readonly number[],
  values: readonly number[],
  range: PriorRange,
  recoveryStartTick: number,
  smooth = RECOVERY_SMOOTH,
  hold = RECOVERY_HOLD,
): Recovery {
  const idx: number[] = [];
  for (let i = 0; i < ticks.length; i++) if (ticks[i] > recoveryStartTick) idx.push(i);
  const post = idx.map((i) => values[i]);
  const ma = trailingMA(post, smooth);
  let mn = Infinity;
  let mx = -Infinity;
  const inRange: boolean[] = ma.map((v) => {
    if (Number.isNaN(v)) return true; // not enough post-shock samples yet: undefined, treated as "no departure"
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    return v >= range.lo && v <= range.hi;
  });
  const rel = (v: number) => (Number.isFinite(v) && range.median > 0 ? v / range.median : null);
  let depart = -1;
  for (let j = 0; j < ma.length; j++) {
    if (!Number.isNaN(ma[j]) && !inRange[j]) {
      depart = j;
      break;
    }
  }
  const base = { minRel: rel(mn), maxRel: rel(mx) };
  if (depart < 0) return { leftRange: false, recoveryTicks: 0, ...base };
  for (let k = depart + 1; k + hold - 1 < ma.length; k++) {
    let ok = true;
    for (let m = 0; m < hold; m++) {
      if (!inRange[k + m]) {
        ok = false;
        break;
      }
    }
    if (ok) return { leftRange: true, recoveryTicks: ticks[idx[k]] - recoveryStartTick, ...base };
  }
  return { leftRange: true, recoveryTicks: null, ...base };
}

// ---------------------------------------------------------------------------------------------------------------
// per-seed analysis
// ---------------------------------------------------------------------------------------------------------------

export interface SpeciesMetrics {
  key: string;
  /** population at the first sample (species with 0 here are skipped everywhere else) */
  initial: number;
  persisted: boolean;
  finalPop: number;
  /** start of the final zero stretch; null if alive at the end */
  extinctionTick: number | null;
  /** population hit zero at some sample (even if reintroduced later) */
  everZero: boolean;
  mean: number;
  min: number;
  max: number;
  cv: number | null;
  maxOverMean: number | null;
  nearZeroFrac: number;
  longestNearZeroTicks: number;
  peaks: number;
  periodTicks: number | null;
  periodStrength: number | null;
  prior: PriorRange | null;
  recovery: Recovery | null;
  /** share of post-burn-in samples with pop > 0 */
  presenceFrac: number;
  /** post-burn-in transitions from present to absent between consecutive samples */
  localExtinctions: number;
  /** localExtinctions per 1,000 years of post-burn-in run; null when the span is under a year */
  extinctionsPer1000y: number | null;
  /** years the species spent at zero after burn-in (zero samples x sample spacing) */
  yearsAbsent: number;
  /** arrivals and departures over the whole run, from the imm_<key> and emig_<key> columns; null when the run has no such columns */
  immigrants: number | null;
  emigrants: number | null;
  /** the same, per 100 valley years */
  immPerCentury: number | null;
  emigPerCentury: number | null;
}

export interface SeedMetrics {
  seed: number;
  samples: number;
  lastTick: number;
  totalTicks: number;
  burnInTick: number;
  sampleSpacing: number;
  species: Record<string, SpeciesMetrics>;
  maxGen: number | null;
  shock: ShockInfo | null;
}

export interface AnalyzeInput {
  seed: number;
  ticks: readonly number[];
  /** column name -> values; pop_<species key> columns are analyzed, gen_bison feeds maxGen */
  cols: Record<string, readonly number[]>;
  /** planned run length used for burn-in and the prior window; defaults to the last sample tick */
  totalTicks?: number;
  shock?: ShockInfo | null;
}

export function analyzeSpecies(
  key: string,
  ticks: readonly number[],
  values: readonly number[],
  totalTicks: number,
  shock: ShockInfo | null,
  flow: { imm?: readonly number[]; emig?: readonly number[] } = {},
): SpeciesMetrics | null {
  if (!ticks.length || !(values[0] > 0)) return null; // never started: not analyzed
  const spacing = sampleSpacing(ticks);
  const burnInTick = BURN_IN_FRAC * totalTicks;
  const post: number[] = [];
  const postTicks: number[] = [];
  for (let i = 0; i < ticks.length; i++) {
    if (ticks[i] >= burnInTick) {
      post.push(values[i]);
      postTicks.push(ticks[i]);
    }
  }
  const use = post.length ? post : values.slice();
  const m = mean(use);
  const s = std(use);
  const thr = NEAR_ZERO_FRAC * m;
  const flags = use.map((v) => v === 0 || v < thr);
  let nz = 0;
  for (const f of flags) if (f) nz++;
  const run = longestRun(flags);

  // presence: how much of the post-burn-in run the species was there at all, and how often it blinked out
  let present = 0;
  let zeroSamples = 0;
  let blinkOuts = 0;
  for (let i = 0; i < use.length; i++) {
    if (use[i] > 0) present++;
    else zeroSamples++;
    if (i > 0 && use[i - 1] > 0 && use[i] === 0) blinkOuts++;
  }
  const spanTicks = postTicks.length > 1 ? postTicks[postTicks.length - 1] - postTicks[0] : 0;
  const spanYears = spanTicks / YEAR_TICKS;
  const runYears = ticks[ticks.length - 1] / YEAR_TICKS;
  const sumOf = (xs: readonly number[] | undefined): number | null => {
    if (!xs || !xs.length) return null;
    let s = 0;
    for (const x of xs) if (Number.isFinite(x)) s += x;
    return s;
  };
  const immigrants = sumOf(flow.imm);
  const emigrants = sumOf(flow.emig);
  const perCentury = (n: number | null) => (n === null || runYears <= 0 ? null : (n / runYears) * 100);

  const last = values.length - 1;
  const finalPop = values[last];
  let everZero = false;
  for (const v of values) if (v === 0) everZero = true;
  let extinctionTick: number | null = null;
  if (finalPop === 0) {
    let k = last;
    while (k > 0 && values[k - 1] === 0) k--;
    extinctionTick = ticks[k];
  }

  // peaks and period on the one-year-smoothed post-burn-in series
  const yearSamples = Math.max(1, Math.round(YEAR_TICKS / spacing));
  const smooth = centeredMA(use, yearSamples);
  const peaks = findPeaks(smooth, PEAK_PROMINENCE_FRAC * m).length;
  const per = dominantPeriod(smooth, spacing);

  let prior: PriorRange | null = null;
  let recovery: Recovery | null = null;
  if (shock) {
    prior = priorRange(ticks, values, shock.priorEndTick, totalTicks, burnInTick);
    if (prior) recovery = recoveryTime(ticks, values, prior, shock.recoveryStartTick);
  }

  return {
    key,
    initial: values[0],
    persisted: finalPop > 0,
    finalPop,
    extinctionTick,
    everZero,
    mean: m,
    min: Math.min(...use),
    max: Math.max(...use),
    cv: m > 0 ? s / m : null,
    maxOverMean: m > 0 ? Math.max(...use) / m : null,
    nearZeroFrac: nz / use.length,
    longestNearZeroTicks: run.len * spacing,
    peaks,
    periodTicks: per.periodTicks,
    periodStrength: per.strength,
    prior,
    recovery,
    presenceFrac: present / use.length,
    localExtinctions: blinkOuts,
    extinctionsPer1000y: spanYears >= 1 ? (blinkOuts / spanYears) * 1000 : null,
    yearsAbsent: (zeroSamples * spacing) / YEAR_TICKS,
    immigrants,
    emigrants,
    immPerCentury: perCentury(immigrants),
    emigPerCentury: perCentury(emigrants),
  };
}

export function analyzeSeed(input: AnalyzeInput): SeedMetrics {
  const { seed, ticks, cols } = input;
  const lastTick = ticks.length ? ticks[ticks.length - 1] : 0;
  const totalTicks = input.totalTicks && input.totalTicks > 0 ? input.totalTicks : lastTick;
  const shock = input.shock ?? null;
  const species: Record<string, SpeciesMetrics> = {};
  for (const key of SPECIES_KEYS) {
    const col = cols[`pop_${key}`];
    if (!col) continue;
    const sm = analyzeSpecies(key, ticks, col, totalTicks, shock, { imm: cols[`imm_${key}`], emig: cols[`emig_${key}`] });
    if (sm) species[key] = sm;
  }
  const gen = cols['gen_bison'];
  let maxGen: number | null = null;
  if (gen && gen.length) {
    maxGen = -Infinity;
    for (const g of gen) if (g > maxGen) maxGen = g;
    if (!Number.isFinite(maxGen)) maxGen = null;
  }
  return {
    seed,
    samples: ticks.length,
    lastTick,
    totalTicks,
    burnInTick: BURN_IN_FRAC * totalTicks,
    sampleSpacing: sampleSpacing(ticks),
    species,
    maxGen,
    shock,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// aggregate across seeds
// ---------------------------------------------------------------------------------------------------------------

export interface SpeciesAggregate {
  key: string;
  seedsStarted: number;
  persistedCount: number;
  persistencePct: number;
  medianMean: number | null;
  meanOfMeans: number | null;
  medianCv: number | null;
  medianMaxOverMean: number | null;
  medianNearZeroFrac: number | null;
  medianLongestNearZeroTicks: number | null;
  medianPeaks: number | null;
  meanPeaks: number | null;
  medianPeriodTicks: number | null;
  /** seeds in which a period was detected */
  periodSeeds: number;
  /** shock scenarios only */
  shockSeeds: number;
  leftRangePct: number | null;
  recoveredPct: number | null;
  medianRecoveryTicks: number | null;
  meanRecoveryTicks: number | null;
  /** open prairie: share of post-burn-in samples with the species present (median over seeds) */
  medianPresence: number | null;
  /** local extinctions per 1,000 years (mean over seeds) */
  meanExtinctionsPer1000y: number | null;
  /** years at zero after burn-in (median over seeds) */
  medianYearsAbsent: number | null;
  /** arrivals and departures per 100 valley years (mean over the seeds that recorded them) */
  meanImmPerCentury: number | null;
  meanEmigPerCentury: number | null;
}

export interface Aggregate {
  seeds: number;
  species: Record<string, SpeciesAggregate>;
  maxGen: number | null;
  medianGen: number | null;
}

export function aggregate(seeds: readonly SeedMetrics[]): Aggregate {
  const keys: string[] = [];
  for (const sd of seeds) for (const k of Object.keys(sd.species)) if (!keys.includes(k)) keys.push(k);
  keys.sort((a, b) => SPECIES_KEYS.indexOf(a as never) - SPECIES_KEYS.indexOf(b as never));
  const species: Record<string, SpeciesAggregate> = {};
  for (const k of keys) {
    const sms = seeds.map((sd) => sd.species[k]).filter((x): x is SpeciesMetrics => !!x);
    const n = sms.length;
    const persisted = sms.filter((x) => x.persisted).length;
    const withRec = sms.filter((x) => x.recovery);
    const rec = withRec.map((x) => x.recovery!);
    const periods = sms.map((x) => x.periodTicks).filter((x): x is number => x !== null);
    species[k] = {
      key: k,
      seedsStarted: n,
      persistedCount: persisted,
      persistencePct: n ? (100 * persisted) / n : 0,
      medianMean: medianOf(sms.map((x) => x.mean)),
      meanOfMeans: meanOf(sms.map((x) => x.mean)),
      medianCv: medianOf(sms.map((x) => x.cv)),
      medianMaxOverMean: medianOf(sms.map((x) => x.maxOverMean)),
      medianNearZeroFrac: medianOf(sms.map((x) => x.nearZeroFrac)),
      medianLongestNearZeroTicks: medianOf(sms.map((x) => x.longestNearZeroTicks)),
      medianPeaks: medianOf(sms.map((x) => x.peaks)),
      meanPeaks: meanOf(sms.map((x) => x.peaks)),
      medianPeriodTicks: medianOf(periods),
      periodSeeds: periods.length,
      shockSeeds: rec.length,
      leftRangePct: rec.length ? (100 * rec.filter((r) => r.leftRange).length) / rec.length : null,
      recoveredPct: rec.length ? (100 * rec.filter((r) => r.recoveryTicks !== null).length) / rec.length : null,
      medianRecoveryTicks: medianOf(rec.map((r) => r.recoveryTicks)),
      meanRecoveryTicks: meanOf(rec.map((r) => r.recoveryTicks)),
      medianPresence: medianOf(sms.map((x) => x.presenceFrac)),
      meanExtinctionsPer1000y: meanOf(sms.map((x) => x.extinctionsPer1000y)),
      medianYearsAbsent: medianOf(sms.map((x) => x.yearsAbsent)),
      meanImmPerCentury: meanOf(sms.map((x) => x.immPerCentury)),
      meanEmigPerCentury: meanOf(sms.map((x) => x.emigPerCentury)),
    };
  }
  const gens = seeds.map((s) => s.maxGen);
  const gv = gens.filter((g): g is number => g !== null);
  return { seeds: seeds.length, species, maxGen: gv.length ? Math.max(...gv) : null, medianGen: medianOf(gens) };
}

/** Per-species pass/fail against ACCEPT. A criterion that does not apply is null. */
export interface Verdict {
  persistence: boolean;
  nearZero: boolean | null;
  longestStretch: boolean | null;
  noExplosion: boolean | null;
  notFlat: boolean | null;
  recovered: boolean | null;
  all: boolean;
}

export function verdict(a: SpeciesAggregate): Verdict {
  const persistence = a.persistencePct >= ACCEPT.persistencePct;
  const nearZero = a.medianNearZeroFrac === null ? null : a.medianNearZeroFrac <= ACCEPT.nearZeroFracMax;
  const longestStretch =
    a.medianLongestNearZeroTicks === null ? null : a.medianLongestNearZeroTicks / YEAR_TICKS <= ACCEPT.longestNearZeroYearsMax;
  const noExplosion = a.medianMaxOverMean === null ? null : a.medianMaxOverMean <= ACCEPT.maxOverMeanMax;
  const notFlat = a.medianCv === null ? null : a.medianCv >= ACCEPT.cvMin;
  const recovered = a.recoveredPct === null ? null : a.recoveredPct >= ACCEPT.recoveredPct;
  const all = [persistence, nearZero, longestStretch, noExplosion, notFlat, recovered].every((x) => x === null || x === true);
  return { persistence, nearZero, longestStretch, noExplosion, notFlat, recovered, all };
}

// ---------------------------------------------------------------------------------------------------------------
// markdown
// ---------------------------------------------------------------------------------------------------------------

const yr = (t: number | null, d = 1) => (t === null ? 'n/a' : (t / YEAR_TICKS).toFixed(d));
const num = (x: number | null, d = 1) => (x === null || !Number.isFinite(x) ? 'n/a' : x.toFixed(d));
const pct = (x: number | null, d = 1) => (x === null || !Number.isFinite(x) ? 'n/a' : (100 * x).toFixed(d) + '%');
const ok = (b: boolean | null) => (b === null ? '-' : b ? 'PASS' : 'FAIL');

export interface MarkdownMeta {
  title: string;
  lines: string[];
  hasShock: boolean;
}

export function renderMarkdown(meta: MarkdownMeta, seeds: readonly SeedMetrics[], agg: Aggregate): string {
  const out: string[] = [];
  out.push(`# ${meta.title}`, '');
  for (const l of meta.lines) out.push(`- ${l}`);
  out.push('', `Years are 1 year = ${YEAR_TICKS} ticks. Statistics exclude the first ${Math.round(BURN_IN_FRAC * 100)}% of each run (burn-in).`);
  out.push(`Near-zero = below ${Math.round(NEAR_ZERO_FRAC * 100)}% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.`, '');

  const keys = Object.keys(agg.species);
  out.push('## Per species, across seeds', '');
  const head = ['species', 'persisted', 'mean pop (median)', 'CV', 'near-zero', 'longest near-zero (yr)', 'max/mean', 'peaks', 'period (yr)'];
  if (meta.hasShock) head.push('left range', 'recovered', 'recovery median (yr)');
  out.push(`| ${head.join(' | ')} |`, `| ${head.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);
  for (const k of keys) {
    const a = agg.species[k];
    const row = [
      k,
      `${a.persistedCount}/${a.seedsStarted} (${a.persistencePct.toFixed(0)}%)`,
      num(a.medianMean, 0),
      num(a.medianCv, 2),
      pct(a.medianNearZeroFrac),
      yr(a.medianLongestNearZeroTicks),
      num(a.medianMaxOverMean, 2),
      num(a.medianPeaks, 0),
      a.medianPeriodTicks === null ? 'none' : `${yr(a.medianPeriodTicks)} (${a.periodSeeds} seeds)`,
    ];
    if (meta.hasShock) {
      row.push(
        a.leftRangePct === null ? 'n/a' : `${a.leftRangePct.toFixed(0)}%`,
        a.recoveredPct === null ? 'n/a' : `${a.recoveredPct.toFixed(0)}%`,
        yr(a.medianRecoveryTicks),
      );
    }
    out.push(`| ${row.join(' | ')} |`);
  }
  out.push('');
  out.push(`Max bison generation depth reached: ${num(agg.maxGen, 1)} (median across seeds ${num(agg.medianGen, 1)}).`, '');

  out.push('## Presence and flow', '');
  out.push(
    'Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).',
    '',
  );
  const fh = ['species', 'presence', 'local extinctions / 1000 yr', 'years absent (median)', 'immigrants / century', 'emigrants / century'];
  out.push(`| ${fh.join(' | ')} |`, `| ${fh.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);
  for (const k of keys) {
    const a = agg.species[k];
    out.push(`| ${[k, pct(a.medianPresence), num(a.meanExtinctionsPer1000y, 1), num(a.medianYearsAbsent, 1), num(a.meanImmPerCentury, 1), num(a.meanEmigPerCentury, 1)].join(' | ')} |`);
  }
  out.push('');

  out.push('## Proposed acceptance (thresholds live in metrics.ts ACCEPT)', '');
  const ah = ['species', `persist >= ${ACCEPT.persistencePct}%`, `near-zero <= ${ACCEPT.nearZeroFracMax * 100}%`, `stretch <= ${ACCEPT.longestNearZeroYearsMax} yr`, `max/mean <= ${ACCEPT.maxOverMeanMax}`, `CV >= ${ACCEPT.cvMin}`];
  if (meta.hasShock) ah.push(`recovered >= ${ACCEPT.recoveredPct}%`);
  ah.push('overall');
  out.push(`| ${ah.join(' | ')} |`, `| ${ah.map((_, i) => (i === 0 ? '---' : ':---:')).join(' | ')} |`);
  for (const k of keys) {
    const v = verdict(agg.species[k]);
    const row = [k, ok(v.persistence), ok(v.nearZero), ok(v.longestStretch), ok(v.noExplosion), ok(v.notFlat)];
    if (meta.hasShock) row.push(ok(v.recovered));
    row.push(v.all ? 'PASS' : 'FAIL');
    out.push(`| ${row.join(' | ')} |`);
  }
  out.push('');

  out.push('## Per seed', '');
  const sh = ['seed', 'end tick', 'gen', ...keys.map((k) => `${k}: mean / CV / near-zero`)];
  if (meta.hasShock) sh.push('shock recovery (yr) by species');
  out.push(`| ${sh.join(' | ')} |`, `| ${sh.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);
  for (const sd of seeds) {
    const cells = keys.map((k) => {
      const s = sd.species[k];
      if (!s) return 'n/a';
      const tag = s.persisted ? '' : ` EXTINCT@${yr(s.extinctionTick)}yr`;
      return `${num(s.mean, 0)} / ${num(s.cv, 2)} / ${pct(s.nearZeroFrac, 0)}${tag}`;
    });
    const row = [String(sd.seed), String(sd.lastTick), num(sd.maxGen, 1), ...cells];
    if (meta.hasShock) {
      row.push(
        keys
          .map((k) => {
            const r = sd.species[k]?.recovery;
            if (!r) return `${k} n/a`;
            return `${k} ${r.recoveryTicks === null ? 'never' : r.leftRange ? yr(r.recoveryTicks) : 'unaffected'}`;
          })
          .join(', '),
      );
    }
    out.push(`| ${row.join(' | ')} |`);
  }
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// self-test
// ---------------------------------------------------------------------------------------------------------------

function selfTest(): boolean {
  let failed = 0;
  const check = (name: string, cond: boolean, detail = '') => {
    if (!cond) failed++;
    console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  };
  const near = (a: number | null, b: number, tol: number) => a !== null && Math.abs(a - b) <= tol;

  check('percentile 10/50/90 of 0..100', near(percentile(Array.from({ length: 101 }, (_, i) => i), 10), 10, 1e-9) && near(median([1, 2, 3, 4]), 2.5, 1e-9));
  const tma = trailingMA([1, 2, 3, 4], 2);
  check('trailingMA', Number.isNaN(tma[0]) && tma[1] === 1.5 && tma[3] === 3.5);

  const dt = 500;
  const N = 800; // 400k ticks
  const ticks = Array.from({ length: N + 1 }, (_, i) => i * dt);
  const total = N * dt;

  // 1. sine, period 24 samples = 12000 ticks = 5 years, mean 100, amplitude 40
  const sine = ticks.map((_, i) => 100 + 40 * Math.sin((2 * Math.PI * i) / 24));
  const s1 = analyzeSpecies('bison', ticks, sine, total, null)!;
  check('sine: persisted', s1.persisted && s1.extinctionTick === null);
  check('sine: period ~12000 ticks', near(s1.periodTicks, 12000, 600), `got ${s1.periodTicks}`);
  check('sine: CV ~0.28', near(s1.cv, 40 / Math.SQRT2 / 100, 0.03), `got ${s1.cv}`);
  const expectPeaks = Math.floor((N * 0.85) / 24);
  check('sine: peak count', Math.abs(s1.peaks - expectPeaks) <= 1, `got ${s1.peaks}, expected ~${expectPeaks}`);
  check('sine: no near-zero', s1.nearZeroFrac === 0 && s1.longestNearZeroTicks === 0);

  // 2. flat line
  const flat = ticks.map(() => 50);
  const s2 = analyzeSpecies('bison', ticks, flat, total, null)!;
  check('flat: CV 0, no period, no peaks', s2.cv === 0 && s2.periodTicks === null && s2.peaks === 0, `period ${s2.periodTicks}`);

  // 3. extinction at sample 600 (tick 300000)
  const dying = ticks.map((_, i) => (i < 600 ? 80 + 10 * Math.sin(i / 3) : 0));
  const s3 = analyzeSpecies('wolf', ticks, dying, total, null)!;
  check('extinct: flags', !s3.persisted && s3.extinctionTick === 600 * dt && s3.everZero, `tick ${s3.extinctionTick}`);
  const expectNz = (N + 1 - 600) / (N + 1 - Math.ceil(0.15 * N));
  check('extinct: near-zero fraction', near(s3.nearZeroFrac, expectNz, 0.01), `got ${s3.nearZeroFrac.toFixed(3)} want ${expectNz.toFixed(3)}`);
  check('extinct: longest stretch', s3.longestNearZeroTicks === (N + 1 - 600) * dt, `got ${s3.longestNearZeroTicks}`);

  // 4. species that never started is skipped
  check('unused species skipped', analyzeSpecies('cougar', ticks, ticks.map(() => 0), total, null) === null);

  // 5. shock recovery: stable at 100 (+/-5 wiggle), cull at sample 320 to 30, linear ramp back to 100 over 40 samples
  const shockIdx = 320;
  const wiggle = (i: number) => 5 * Math.sin(i * 1.7);
  const shocked = ticks.map((_, i) => {
    if (i <= shockIdx) return 100 + wiggle(i);
    const k = i - shockIdx;
    if (k <= 40) return 30 + (70 * k) / 40 + wiggle(i);
    return 100 + wiggle(i);
  });
  const shock: ShockInfo = { priorEndTick: shockIdx * dt, recoveryStartTick: shockIdx * dt };
  const s5 = analyzeSpecies('bison', ticks, shocked, total, shock)!;
  check('shock: prior range around 100', !!s5.prior && s5.prior.lo > 92 && s5.prior.hi < 108, `${s5.prior?.lo.toFixed(1)}..${s5.prior?.hi.toFixed(1)}`);
  const rec = s5.recovery!;
  // the MA(5) enters [~94,~106] around k ~ 38 (+2 lag), then must hold 10 samples
  const recSamples = rec.recoveryTicks === null ? -1 : rec.recoveryTicks / dt;
  check('shock: left range and recovered', rec.leftRange && rec.recoveryTicks !== null, JSON.stringify(rec));
  check('shock: recovery time plausible (36..46 samples)', recSamples >= 36 && recSamples <= 46, `got ${recSamples} samples`);
  check('shock: minRel < 0.5', rec.minRel !== null && rec.minRel < 0.5, `minRel ${rec.minRel}`);

  // 6. never recovers
  const never = ticks.map((_, i) => (i <= shockIdx ? 100 + wiggle(i) : 30 + wiggle(i)));
  const s6 = analyzeSpecies('bison', ticks, never, total, shock)!;
  check('shock: never recovers -> null', s6.recovery!.leftRange && s6.recovery!.recoveryTicks === null);

  // 7. unaffected series reports leftRange=false, recovery 0 (no false recovery from pre-shock leakage)
  const calm = ticks.map((_, i) => 100 + wiggle(i));
  const s7 = analyzeSpecies('raven', ticks, calm, total, shock)!;
  check('shock: unaffected -> leftRange false', !s7.recovery!.leftRange && s7.recovery!.recoveryTicks === 0);

  // 7b. presence and flow: present for 3/4 of the post-burn-in run in two stretches, 7 immigrants and 4 emigrants
  const blink = ticks.map((_, i) => (i >= 300 && i < 400 ? 0 : i >= 600 && i < 650 ? 0 : 20));
  const imm = ticks.map((_, i) => (i % 100 === 0 && i > 0 && i <= 700 ? 1 : 0));
  const emi = ticks.map((_, i) => (i % 200 === 0 && i > 0 && i <= 800 ? 1 : 0));
  const sf = analyzeSpecies('bison', ticks, blink, total, null, { imm, emig: emi })!;
  const nPost = N + 1 - Math.ceil(0.15 * N);
  check('flow: presence fraction', near(sf.presenceFrac, (nPost - 150) / nPost, 1e-9), `got ${sf.presenceFrac.toFixed(4)}`);
  check('flow: two local extinctions', sf.localExtinctions === 2, `got ${sf.localExtinctions}`);
  check('flow: years absent', near(sf.yearsAbsent, (150 * dt) / YEAR_TICKS, 1e-9), `got ${sf.yearsAbsent}`);
  check('flow: immigrants 7, emigrants 4', sf.immigrants === 7 && sf.emigrants === 4, `got ${sf.immigrants}/${sf.emigrants}`);
  check('flow: per century', near(sf.immPerCentury, 7 / (total / YEAR_TICKS) * 100, 1e-6), `got ${sf.immPerCentury}`);
  check('flow: columns absent -> null', s1.immigrants === null && s1.immPerCentury === null);

  // 8. peaks: prominence filter
  check('findPeaks prominence', JSON.stringify(findPeaks([0, 5, 4.9, 5.2, 0, 3, 0], 1)) === JSON.stringify([3, 5]) && findPeaks([0, 5, 4.9, 5.2, 0, 3, 0], 4).length === 1);

  // 9. aggregate + markdown smoke
  const seedsM = [1, 2, 3].map((seed) => analyzeSeed({ seed, ticks, cols: { pop_bison: seed === 3 ? dying : sine, pop_wolf: seed === 3 ? dying : sine, gen_bison: ticks.map((t) => t / 8000) }, totalTicks: total }));
  const agg = aggregate(seedsM);
  check('aggregate persistence 2/3', near(agg.species.bison.persistencePct, 66.666, 0.1) && agg.maxGen !== null && near(agg.maxGen, total / 8000, 1e-9));
  const md = renderMarkdown({ title: 'selftest', lines: ['a'], hasShock: false }, seedsM, agg);
  check('markdown renders', md.includes('## Per species') && md.includes('bison') && !md.includes(String.fromCharCode(0x2014)));

  console.log(failed ? `\n${failed} self-test check(s) FAILED` : '\nall self-tests passed');
  return failed === 0;
}

const isMain = typeof process !== 'undefined' && /metrics\.ts$/.test(process.argv[1] ?? '');
if (isMain && process.argv.includes('--selftest')) {
  process.exit(selfTest() ? 0 : 1);
}
