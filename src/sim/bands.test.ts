// Unit tests for bison herd bands (param herdBands): off by default and bit-identical when off, founders split into bands,
// calves join their mother's band, strays join the nearest band, split and merge, determinism, and the sample columns.
// Run: npx tsx src/sim/bands.test.ts
import { applyOverrides } from './params';
import { createSim, defaultParams, V7C_OFF } from './testpins';
import { simHash } from '../headless/hash';
import { Sp } from './types';

const V6 = { ...V7C_OFF, smallPrey: 0, smallGameField: 0, 'coyote.initial': 0 };

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

function bandSizes(sim: ReturnType<typeof createSim>): Map<number, number> {
  const a = sim.a, m = new Map<number, number>();
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Bison) m.set(a.band[i], (m.get(a.band[i]) ?? 0) + 1);
  return m;
}

// 1. off by default; an explicit zero reproduces the default hash; no bands, no columns
{
  const p = defaultParams();
  ok(p.herdBands === 0, 'herdBands is off by default');
  const q = applyOverrides(defaultParams(), { herdBands: 1, bandSize: 20, bandGap: 30, bandCheck: 150, bandMax: 40, bandMin: 4, bandPush: 0.3 });
  ok(q.herdBands === 1 && q.bandSize === 20 && q.bandGap === 30 && q.bandCheck === 150 && q.bandMax === 40 && q.bandMin === 4 && q.bandPush === 0.3, 'the band params take overrides');
  ok(simHash(3, 1200, { ...V6, herdBands: 0 }) === simHash(3, 1200, V6), 'explicit herdBands 0 reproduces the default hash');
  const sim = createSim({ seed: 3, params: V6 });
  sim.step(600);
  const row = sim.sample();
  ok(!('bands_bison' in row), 'no band columns with the param off');
  let none = true;
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i] && sim.a.band[i] !== -1) none = false;
  ok(none, 'every band id is -1 with the param off');
}

// 2. founders: bands of about bandSize, every bison has one, other species have none
{
  const sim = createSim({ seed: 3, params: { ...V6, herdBands: 1 } });
  const a = sim.a;
  let bison = 0, banded = 0, other = 0;
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i]) continue;
    if (a.sp[i] === Sp.Bison) { bison++; if (a.band[i] >= 0) banded++; } else if (a.band[i] !== -1) other++;
  }
  ok(bison > 0 && banded === bison, `every founding bison has a band (${banded} of ${bison})`);
  ok(other === 0, 'no other species has a band');
  const sizes = bandSizes(sim);
  const want = Math.round(bison / 30);
  ok(sizes.size === want, `about bison / bandSize bands (${sizes.size} vs ${want})`);
  const mean = bison / sizes.size;
  ok(mean > 20 && mean < 45, `mean founding band size is near bandSize (${mean.toFixed(1)})`);
}

// 3. a calf joins its mother's band; a stray joins the nearest band; the columns appear and are sane
{
  const sim = createSim({ seed: 3, params: { ...V6, herdBands: 1 } });
  sim.step(2400);
  const a = sim.a;
  let calves = 0, same = 0;
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || a.sp[i] !== Sp.Bison || a.born[i] <= 0) continue;
    const m = a.mother[i];
    if (!a.same(m, a.motherId[i])) continue;
    calves++;
    // the calf kept the band it was born into unless a split or merge has since moved it, which moves mother and calf together except across a split line
    if (a.band[i] === a.band[m]) same++;
  }
  ok(calves > 0 && same / calves > 0.8, `calves stay with their mothers' bands (${same} of ${calves})`);
  const row = sim.sample();
  ok(row.bands_bison >= 1 && row.band_mean_bison > 0, `band columns exist (${row.bands_bison} bands, mean ${row.band_mean_bison})`);
  ok(Number.isNaN(row.band_gap_bison) || row.band_gap_bison > 0, 'band_gap_bison is a distance');
  // introduce 12 bison far from every band: they start a band (or join one in reach) rather than staying at -1
  const before = row.bands_bison;
  sim.introduce(Sp.Bison, 12, 40, 40);
  sim.step(60);
  let unassigned = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Bison && a.band[i] < 0) unassigned++;
  ok(unassigned === 0, 'introduced bison are given a band');
  ok(sim.sample().bands_bison >= before, 'introduced bison do not remove bands');
}

// 4. split and merge: tiny bandMax splits the founders further, huge bandMin merges them down
{
  const split = createSim({ seed: 3, params: { ...V6, herdBands: 1, bandMax: 12, bandMin: 1, bandCheck: 150 } });
  const n0 = bandSizes(split).size;
  split.step(600);
  const n1 = bandSizes(split).size;
  ok(n1 > n0, `bandMax splits big bands (${n0} to ${n1})`);
  const merge = createSim({ seed: 3, params: { ...V6, herdBands: 1, bandMax: 5000, bandMin: 400, bandCheck: 150 } });
  const m0 = bandSizes(merge).size;
  merge.step(600);
  const m1 = bandSizes(merge).size;
  ok(m1 < m0, `bandMin merges small bands (${m0} to ${m1})`);
}

// 5. on changes the run, deterministically
{
  const base = simHash(3, 1800, V6);
  const on = simHash(3, 1800, { ...V6, herdBands: 1 });
  ok(on !== base, 'herdBands 1 changes the run');
  ok(simHash(3, 1800, { ...V6, herdBands: 1 }) === on, 'and is deterministic');
  const a = createSim({ seed: 3, params: { ...V6, herdBands: 1 } }), b = createSim({ seed: 3, params: { ...V6, herdBands: 1 } });
  a.step(1200); b.step(1200);
  a.sample(); a.sample();
  a.step(600); b.step(600);
  let same = a.a.hi === b.a.hi;
  for (let i = 0; same && i < a.a.hi; i++) same = a.a.x[i] === b.a.x[i] && a.a.band[i] === b.a.band[i];
  ok(same, 'sample() does not change a banded run');
}

console.log(`bands.test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
