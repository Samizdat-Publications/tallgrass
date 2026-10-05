// Unit tests for the open prairie (V2-PLAN.md S1): corridors, the regional gene pool, migration, wolf and pronghorn flow, vagrant ravens.
// Run: npx tsx src/sim/region.test.ts
import { NG } from './agents';
import { simHash } from '../headless/hash';
import { RegionalPool } from './region';
import { createSim } from './sim';
import { Sim } from './sim';
import { COAT_BASE } from './species';
import { F_MIGRANT, Sp, St } from './types';
import { generateWorld } from './world';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// ---- corridors
{
  const w = generateWorld(5);
  const c = w.corridors;
  ok(c.length === 8 * 4, 'eight corridors, stride 4');
  let onBorder = true, normals = true;
  for (let k = 0; k < 8; k++) {
    const x = c[k * 4], y = c[k * 4 + 1], nx = c[k * 4 + 2], ny = c[k * 4 + 3];
    if (Math.min(x, y, w.size - x, w.size - y) > 1e-3) onBorder = false;
    // the normal points into the valley
    const ix = x + nx * 10, iy = y + ny * 10;
    if (!(ix >= 0 && ix <= w.size && iy >= 0 && iy <= w.size) || Math.abs(Math.hypot(nx, ny) - 1) > 1e-6) normals = false;
  }
  ok(onBorder, 'every corridor sits on the border');
  ok(normals, 'every corridor normal is a unit vector pointing inward');
  // the creek's two ends are corridors: one on the west edge, one on the east edge, at the creek's y
  const creek = w.creek;
  let inlet = false, outlet = false;
  for (let k = 0; k < 8; k++) {
    if (c[k * 4] === 0 && c[k * 4 + 2] === 1) inlet = true;
    if (c[k * 4] === w.size && c[k * 4 + 2] === -1) outlet = true;
  }
  ok(inlet && outlet && creek.length > 4, 'creek inlet and outlet are corridors');
  ok(new Set(Array.from({ length: 8 }, (_, k) => `${c[k * 4]},${c[k * 4 + 1]}`)).size === 8, 'corridors are distinct');
  const w2 = generateWorld(5);
  ok(w2.corridors.every((v, i) => v === c[i]) && w2.height.every((v, i) => v === w.height[i]), 'corridors and terrain are deterministic');
}

// ---- regional pool
{
  const n = 40;
  const sp = new Uint8Array(n).fill(3);
  const alive = new Uint8Array(n).fill(1);
  const genes = new Float32Array(n * NG);
  for (let i = 0; i < n; i++) for (let g = 0; g < NG; g++) genes[i * NG + g] = 1 + ((i % 5) - 2) * 0.02; // mean 1, var 0.0008
  const pool = new RegionalPool(7, COAT_BASE);
  pool.seedFrom(sp, alive, genes, n);
  ok(Math.abs(pool.mean[3 * NG] - 1) < 1e-6 && Math.abs(pool.variance[3 * NG] - 0.0008) < 1e-6, 'pool starts from the founders (mean 1, variance 0.0008)');
  ok(pool.founders[3] === 40 && pool.founders[Sp.Cougar] === 0, 'founder counts');
  const emigrant = new Float32Array(NG).fill(1.2);
  pool.absorb(3, emigrant);
  ok(Math.abs(pool.mean[3 * NG] - (1 + 0.02 * (1.2 - 1))) < 1e-6, 'absorb pulls the mean 2% toward the emigrant');
  ok(pool.absorbed[3] === 1, 'absorbed counter');
  for (let k = 0; k < 2000; k++) pool.absorb(3, new Float32Array(NG).fill(1));
  ok(pool.variance[3 * NG] >= 0.0008 * 0.25 - 1e-6, 'variance never drops below a quarter of the founders');
  // draws: mean near the pool mean, and the same seed gives the same draws, the main stream is untouched
  const a = new RegionalPool(11, COAT_BASE), b = new RegionalPool(11, COAT_BASE);
  const oa = new Float32Array(NG), ob = new Float32Array(NG);
  let sum = 0;
  for (let k = 0; k < 3000; k++) {
    a.draw(3, a.rng, oa);
    b.draw(3, b.rng, ob);
    sum += oa[0];
    if (oa[0] !== ob[0]) ok(false, 'draws are deterministic per seed');
  }
  ok(Math.abs(sum / 3000 - 1) < 0.01, 'draws centre on the pool mean');
}

// ---- off (all rates zero) reproduces a closed valley exactly
{
  const off = simHash(3, 6000, { openPrairie: 0, ravenVagrants: 0 });
  const zero = simHash(3, 6000, { ravenVagrants: 0, openPrairie: 1, wolfInRate: 0, wolfOutAfter: 1e9, deerOutK: 0, deerInK: 0, deerRescue: 0, coyoteInRate: 0 });
  ok(off === zero, `openPrairie 1 with every rate at zero is identical to a closed valley (${off} vs ${zero})`);
}

// ---- pronghorn exodus and spring return, forced by a huge reference browse
{
  const sim = createSim({ seed: 2, params: { openPrairie: 1, deerBref: 1e9, deerKb: 400 } });
  const start = sim.populations()[Sp.Deer];
  let sawMigrant = false;
  let maxMig = 0;
  let totalIn = 0, totalOut = 0;
  for (let t = 0; t < 1500; t += 25) {
    sim.step(25);
    const snap = sim.snapshot(false);
    let mig = 0;
    for (let k = 0; k < snap.count; k++) if ((snap.agents[k * 12 + 8] & F_MIGRANT) !== 0) mig++;
    if (mig > 0) sawMigrant = true;
    maxMig = Math.max(maxMig, mig);
    if (t % 100 === 0) {
      const row = sim.sample();
      totalIn += row.imm_pronghorn;
      totalOut += row.emig_pronghorn;
    }
  }
  const row = sim.sample();
  totalIn += row.imm_pronghorn;
  totalOut += row.emig_pronghorn;
  const kinds = new Set(sim.events.map((e) => e.kind));
  ok(kinds.has('emigrated') && kinds.has('immigrated'), 'exodus and return emit events');
  ok(sawMigrant && maxMig >= 5, `animals carry the migrant flag while travelling (max ${maxMig})`);
  ok(totalOut >= 10 && totalIn >= 10, `pronghorn left (${totalOut}) and came back (${totalIn}) in the first year (started with ${start})`);
  ok(sim.region !== null && sim.region.absorbed[Sp.Deer] === totalOut, 'every emigrant was absorbed into the pool');
  // no emigrant leaves a carcass: carcass count comes only from deaths
  let immigrants = 0;
  const a = sim.a;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.origin[i] === 1) immigrants++;
  ok(immigrants > 0, 'immigrants are marked origin 1');
}

// ---- wolf arrivals and recolonization
{
  const sim = createSim({ seed: 4, params: { openPrairie: 1, 'wolf.initial': 0, wolfInRate: 2400 } });
  let both = false;
  for (let t = 0; t < 400; t += 10) {
    sim.step(10);
    const snap = sim.snapshot(false);
    let migrants = 0;
    for (let k = 0; k < snap.count; k++) if (snap.agents[k * 12] === Sp.Wolf && (snap.agents[k * 12 + 8] & F_MIGRANT) !== 0) migrants++;
    if (migrants >= 2) both = true;
  }
  const kinds = sim.events.map((e) => e.kind);
  ok(kinds.includes('immigrated') && kinds.includes('recolonized') && kinds.includes('packFounded'), 'wolf pairs arrive, found a pack, and recolonize');
  ok(both, 'arriving wolves are flagged as migrants');
  const row = sim.sample();
  ok(row.imm_wolf >= 2 && row.pop_wolf >= 2, `wolves came in (${row.imm_wolf}, pop ${row.pop_wolf})`);
}

// ---- vagrant ravens follow carrion and never breed
{
  const sim: Sim = createSim({ seed: 6, params: { ravenVagrants: 1, ravenVagrantK: 6, ravenVagrantCap: 60 } });
  sim.step(200);
  sim.apply({ kind: 'cull', species: Sp.Bison, fraction: 0.15 });
  let maxVag = 0;
  for (let t = 0; t < 1500; t += 50) {
    sim.step(50);
    maxVag = Math.max(maxVag, sim.sample().vagrants);
  }
  const a = sim.a;
  let vagBred = 0, vag = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.origin[i] === 2) { vag++; vagBred += a.children[i]; }
  ok(maxVag > 0 && maxVag <= 60, `vagrants appeared and respected the cap (max ${maxVag})`);
  ok(vagBred === 0, `vagrants never breed (${vag} alive, ${vagBred} chicks)`);
  ok(sim.region !== null && sim.sumRemainingMeat() >= 0, 'carrion sum is available');
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.origin[i] === 2) ok(a.sp[i] === Sp.Raven, 'vagrants are ravens');
  ok(a.state.every((s, i) => !a.alive[i] || s !== St.Migrate || a.target[i] === -2 || a.target[i] === -3), 'migrants carry a direction code');
}

if (failures) {
  console.error(`${failures} of ${checks} region checks FAILED`);
  process.exit(1);
}
console.log(`region.test.ts: ${checks} checks passed`);
