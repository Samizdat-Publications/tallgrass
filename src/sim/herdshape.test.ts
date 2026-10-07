// Unit tests for herd shape (S10): drink spots, grazing spacing and the ring / nearest-neighbour sample columns.
// Run: npx tsx src/sim/herdshape.test.ts
import { applyOverrides } from './params';
import { createSim, defaultParams, V7C_OFF } from './testpins';
import { simHash } from '../headless/hash';

// pin the v6 base so the checks do not depend on later default changes (v6b turns small prey and coyotes on)
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

// 1. both params are off by default, and an explicit zero reproduces the default run
{
  const p = defaultParams();
  ok(p.drinkSpots === 0 && p.herdSpacingGraze === 0, 'drinkSpots and herdSpacingGraze are off by default');
  const q = applyOverrides(defaultParams(), { drinkSpots: 0.7, herdSpacingGraze: 1.6 });
  ok(q.drinkSpots === 0.7 && q.herdSpacingGraze === 1.6, 'both params take overrides');
  const base = simHash(3, 1800, V6);
  ok(simHash(3, 1800, { ...V6, drinkSpots: 0, herdSpacingGraze: 0 }) === base, 'explicit zeros reproduce the default hash');
}

// 2. drink spots: off keeps the shore, on keeps only some of it (never nearer than the real shore)
{
  const off = createSim({ seed: 3, params: V6 });
  const on = createSim({ seed: 3, params: { ...V6, drinkSpots: 0.6 } });
  const dOff = (off as unknown as { drinkD: Float32Array }).drinkD;
  const dOn = (on as unknown as { drinkD: Float32Array }).drinkD;
  ok(dOff === off.world.waterDist, 'off: the drinking distance is the plain water distance');
  let farther = 0, never = 0, shore = 0;
  for (let k = 0; k < dOn.length; k++) {
    if (dOn[k] < off.world.waterDist[k] - 1e-3) never++;
    if (off.world.waterDist[k] < 3) {
      shore++;
      if (dOn[k] >= 3) farther++;
    }
  }
  ok(never === 0, 'on: no cell is nearer to a drinking place than to water');
  ok(shore > 0 && farther > 0 && farther < shore, `on: some but not all shore cells stop being drinking places (${farther} of ${shore})`);
  const lo = createSim({ seed: 3, params: { ...V6, drinkSpots: 0.3 } });
  const dLo = (lo as unknown as { drinkD: Float32Array }).drinkD;
  let nLo = 0, nOn = 0;
  for (let k = 0; k < dOn.length; k++) { if (dLo[k] < 3) nLo++; if (dOn[k] < 3) nOn++; }
  ok(nLo <= nOn, 'a smaller share gives no more drinking ground');
}

// 3. the sample columns exist with sane values, with the params off and on
{
  for (const params of [V6, { ...V6, drinkSpots: 0.7, herdSpacingGraze: 1.6 }]) {
    const sim = createSim({ seed: 3, params });
    sim.step(2400);
    const row = sim.sample();
    ok('ring_bison' in row && 'nn_graze_bison' in row && 'near_bison' in row, 'herd shape columns exist');
    ok(Number.isNaN(row.ring_bison) || (row.ring_bison >= 0 && row.ring_bison <= 1), `ring_bison is a share (${row.ring_bison})`);
    ok(Number.isNaN(row.nn_graze_bison) || (row.nn_graze_bison > 0 && row.nn_graze_bison <= 30), `nn_graze_bison is a distance (${row.nn_graze_bison})`);
    ok(row.near_bison >= 0, 'near_bison is a count');
  }
}

// 4. grazing spacing changes the run and is deterministic; sampling does not disturb the sim
{
  const base = simHash(3, 1800, V6);
  const sp = simHash(3, 1800, { ...V6, herdSpacingGraze: 1.6 });
  ok(sp !== base, 'herdSpacingGraze 1.6 changes the run');
  ok(simHash(3, 1800, { ...V6, herdSpacingGraze: 1.6 }) === sp, 'and is deterministic');
  const dr = simHash(3, 1800, { ...V6, drinkSpots: 0.7 });
  ok(dr !== base, 'drinkSpots 0.7 changes the run');
  ok(simHash(3, 1800, { ...V6, drinkSpots: 0.7 }) === dr, 'and is deterministic');
  const a = createSim({ seed: 3, params: V6 }), b = createSim({ seed: 3, params: V6 });
  a.step(1200); b.step(1200);
  a.sample(); a.sample();
  a.step(600); b.step(600);
  let same = a.a.hi === b.a.hi;
  for (let i = 0; same && i < a.a.hi; i++) same = a.a.x[i] === b.a.x[i] && a.a.energy[i] === b.a.energy[i];
  ok(same, 'sample() does not change the run');
}

console.log(`herdshape.test: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
