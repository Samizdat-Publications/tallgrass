// Unit tests for the small-prey web (V2-PLAN.md S4): the catch rule, diffusion, prairie dog towns, sylvatic plague, hare booms and
// crashes, rescues, god tools, founders, the snapshot texture. Run: npx tsx src/sim/smallprey.test.ts
import { Rng } from './rng';
import { createSim, Sim, SimEvent } from './sim';
import { A, CELLS, GAIN, HANDLE, PREF, SMALL_SCALE, STEP_TICKS, SmallPrey, TAKE_KINDS } from './smallprey';
import { BASE_YEAR_TICKS, Sp, St, YEAR_TICKS } from './types';
import { COARSE_N, generateWorld } from './world';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** A sim with the web on and the plague, the pulse and the open prairie quiet unless a test asks for them. */
function web(params: Record<string, number> = {}, seed = 3): { sim: Sim; sp: SmallPrey } {
  const sim = createSim({ seed, params: { smallPrey: 1, plagueRate: 0, ...params } });
  return { sim, sp: sim.small! };
}
/** Run the web alone for `steps` steps from tick `t0`, in a fixed season (the sim itself is not stepped). Returns the next tick. */
function runWeb(sim: Sim, sp: SmallPrey, t0: number, steps: number, season: number): number {
  let t = t0;
  for (let k = 0; k < steps; k++) {
    sim.env.state.season = season;
    sp.step(t);
    t += STEP_TICKS;
  }
  return t;
}
const eventsOf = (sim: Sim, kind: string, from = 0): SimEvent[] => sim.events.filter((e) => e.kind === kind && e.tick >= from);
/** A group of `n` mutually adjacent suitable cells (a town site), or null. */
function townSite(sp: SmallPrey, n: number, avoid: Set<number> = new Set()): number[] | null {
  for (let c = 0; c < CELLS; c++) {
    if (sp.kd[c] <= 0 || avoid.has(c)) continue;
    const cells = [c];
    const x = c % COARSE_N, y = (c / COARSE_N) | 0;
    for (let d = 1; d < 4 && cells.length < n; d++) {
      const nx = x + (d & 1), ny = y + (d >> 1);
      if (nx >= COARSE_N || ny >= COARSE_N) continue;
      const q = ny * COARSE_N + nx;
      if (sp.kd[q] > 0 && !avoid.has(q)) cells.push(q);
    }
    if (cells.length === n) return cells;
  }
  return null;
}

// ---- dogCap: flat, dry, open ground, no draws
{
  const w = generateWorld(3), w2 = generateWorld(3);
  ok(w.dogCap.length === CELLS && w.dogCap.every((v, i) => v === w2.dogCap[i]), 'dogCap is 32 x 32 and deterministic');
  let nz = 0, bad = 0;
  const n = w.n, r = n / COARSE_N;
  for (let k = 0; k < CELLS; k++) {
    if (w.dogCap[k] < 0 || w.dogCap[k] > 1) bad++;
    if (w.dogCap[k] > 0) nz++;
    // no water and no steep ground in a suitable cell
    if (w.dogCap[k] > 0) {
      const x0 = (k % COARSE_N) * r, y0 = ((k / COARSE_N) | 0) * r;
      let water = 0, slope = 0;
      for (let j = y0; j < y0 + r; j++) for (let i = x0; i < x0 + r; i++) { water += w.water[j * n + i]; slope += w.slope[j * n + i]; }
      if (water / (r * r) > 0.05 || slope / (r * r) > 0.35) bad++;
    }
  }
  ok(bad === 0, 'dogCap is in 0..1, with no water or steep ground in a suitable cell');
  ok(nz >= 100 && nz <= 450, `a fifth to a third of the valley can hold a town (${nz} of ${CELLS} cells)`);
}

// ---- take(): Holling type II
{
  const { sp } = web();
  const c = sp.cellOf(250, 250);
  const rng = new Rng(12345);
  const N = 60000;
  let allMatch = true;
  const rates: number[] = [];
  const dens = [0.5, 2, 8, 40, 400];
  for (const kind of ['coyote', 'wolf'] as const) {
    const effort = kind === 'wolf' ? 20 : 1;
    let prev = -1;
    for (const d of dens) {
      sp.dog[c] = 0;
      let hits = 0;
      for (let k = 0; k < N; k++) {
        sp.hare[c] = d / PREF[kind].hare; // dens = hare * PREF.hare = d
        if (sp.take(250, 250, kind, effort, rng) > 0) hits++;
      }
      const want = Math.min(1, (effort * (A[kind] * d)) / (1 + A[kind] * HANDLE[kind] * d));
      const got = hits / N;
      const sigma = Math.sqrt((want * (1 - want)) / N);
      if (Math.abs(got - want) > 4.5 * sigma + 1e-4) allMatch = false;
      if (kind === 'coyote') rates.push(got);
      ok(got >= prev - 4.5 * sigma, `${kind}: success rate does not fall as density rises (${d})`);
      prev = got;
    }
  }
  ok(allMatch, 'take() success rate matches effort x A x dens / (1 + A x HANDLE x dens) at every density');
  // saturation: the curve flattens toward effort / HANDLE, so a 10x density rise from 40 to 400 adds far less than 10x
  ok(rates[4] / rates[3] < 3 && rates[3] / rates[0] > 20 && rates[4] < 1 / HANDLE.coyote && rates[4] > 0.7 / HANDLE.coyote, 'success rises steeply at low density, then saturates below effort / HANDLE');
  ok(near(SmallPrey.successChance('coyote', 1e6, 1), 1 / HANDLE.coyote, 1e-3), 'the asymptote is effort / HANDLE');
  // which animal: hares and dogs in proportion to their preference-weighted share; the gain follows the animal
  sp.hare[c] = 3; sp.dog[c] = 3;
  const kind = 'eagle';
  const shareH = (3 * PREF[kind].hare) / (3 * PREF[kind].hare + 3 * PREF[kind].dog);
  let nh = 0, nd = 0, gh = true, gd = true;
  for (let k = 0; k < 20000; k++) {
    sp.hare[c] = 3; sp.dog[c] = 3;
    const h0 = sp.hare[c];
    const g = sp.take(250, 250, kind, 40, rng); // effort 40 turns almost every attempt into a catch
    if (g === 0) continue;
    if (sp.hare[c] < h0) { nh++; if (g !== GAIN[kind].hare) gh = false; }
    else { nd++; if (g !== GAIN[kind].dog) gd = false; }
  }
  ok(gh && gd && nh > 0 && nd > 0, 'a catch removes one animal from its own field and pays that animal\'s gain');
  ok(near(nh / (nh + nd), shareH, 0.02), `the hare share of catches follows the preference-weighted density (${(nh / (nh + nd)).toFixed(3)} vs ${shareH.toFixed(3)})`);
  // an empty cell costs nothing and draws nothing
  sp.hare[c] = 0.004; sp.dog[c] = 0;
  const before = rng.getState();
  ok(sp.take(250, 250, 'wolf', 1, rng) === 0 && rng.getState().every((v, i) => v === before[i]), 'under 0.01 animals: no catch and no random draw');
  ok(TAKE_KINDS.join() === 'wolf,coyote,eagle,hawk' && TAKE_KINDS.every((k) => A[k] > 0 && HANDLE[k] > 0 && GAIN[k].hare > 0 && PREF[k].hare > 0), 'tables cover wolf, coyote, eagle and hawk');
  // a catch never drives a field negative
  sp.hare[c] = 0.5; sp.dog[c] = 0;
  for (let k = 0; k < 2000 && sp.hare[c] > 0; k++) sp.take(250, 250, 'eagle', 40, rng);
  ok(sp.hare[c] === 0, 'a catch from a thin cell leaves it at zero, not negative');
}

// ---- diffusion conserves the population
{
  const { sp } = web();
  const rng = new Rng(99);
  for (let c = 0; c < CELLS; c++) sp.hare[c] = rng.next() < 0.6 ? rng.range(0, 6) : 0;
  const before = sp.hareTotal();
  for (let k = 0; k < 40; k++) sp.diffuseHares();
  ok(near(sp.hareTotal(), before, before * 1e-5), `hare diffusion keeps the total (${before.toFixed(3)} to ${sp.hareTotal().toFixed(3)})`);
  ok(sp.hare.every((v) => v >= 0), 'diffusion never goes negative');
  // a spike spreads to the neighbours that have land and loses 5% per step
  sp.hare.fill(0);
  let spike = -1;
  for (let c = COARSE_N + 1; c < CELLS - COARSE_N - 1; c++) {
    if (sp.land[c] > 0.9 && sp.land[c - 1] > 0.9 && sp.land[c + 1] > 0.9 && sp.land[c - COARSE_N] > 0.9 && sp.land[c + COARSE_N] > 0.9) { spike = c; break; }
  }
  sp.hare[spike] = 100;
  sp.diffuseHares();
  ok(near(sp.hare[spike], 95, 1e-3) && near(sp.hare[spike + 1], 1.25, 1e-3) && near(sp.hare[spike - COARSE_N], 1.25, 1e-3), 'a spike keeps 95% and sends 1.25 to each of four neighbours');
  // no hares enter water-only cells
  const wet = Array.from({ length: CELLS }, (_, c) => c).find((c) => sp.land[c] <= 0.05);
  if (wet !== undefined) {
    sp.hare.fill(5);
    sp.hare[wet] = 0;
    for (let k = 0; k < 5; k++) sp.diffuseHares();
    ok(sp.hare[wet] === 0, 'water cells receive no hares');
  }
}

// ---- hares: seasonal growth toward capacity, loss in autumn and winter, the floor
{
  const { sim, sp } = web();
  sim.step(1); // refresh the coarse maps
  const c = Array.from({ length: CELLS }, (_, k) => k).find((k) => k > 3 * COARSE_N && k < CELLS - 3 * COARSE_N && sp.land[k] > 0.95 && sp.hareCap(k) > 1)!;
  sp.hare.fill(0);
  sp.hare[c] = 0.3;
  runWeb(sim, sp, 50, 3, 0.5);
  ok(sp.hareTotal() > 0.3, `hares grow in the breeding season (${sp.hareTotal().toFixed(3)} from 0.3)`);
  sp.hare.fill(0.3);
  runWeb(sim, sp, 200, 600, 0.5);
  const total = sp.hareTotal();
  let capSum = 0;
  for (let k = 0; k < CELLS; k++) capSum += sp.hareCap(k);
  ok(total > 0.5 * capSum && total < 1.3 * capSum, `breeding-season growth is logistic and fills the valley to its capacity (${total.toFixed(0)} of ${capSum.toFixed(0)})`);
  const t0 = sp.hareTotal();
  runWeb(sim, sp, 20000, 20, 3);
  ok(sp.hareTotal() < 0.92 * t0, 'hares decline outside the breeding season');
  sp.hare.fill(0);
  sp.hare[c] = 0.001;
  runWeb(sim, sp, 40000, 1, 3);
  ok(sp.hare.every((v) => v === 0 || v >= 0.002), 'a cell with under 0.002 hares is empty');
}

// ---- prairie dogs: the spring pulse, expansion, towns
{
  const { sim, sp } = web({ dogR: 1 });
  const site = townSite(sp, 3)!;
  sp.dog.fill(0);
  sp.town.fill(0);
  const c = site[0];
  sp.dog[c] = 0.2 * sp.kd[c];
  // a pulse once per valley year: step through two years in a fixed season and count growth steps
  let jumps = 0, t = 0;
  let last = sp.dog[c];
  const yearSteps = YEAR_TICKS / STEP_TICKS;
  for (let k = 0; k < 2 * yearSteps; k++) {
    sim.env.state.season = 1.5;
    // the pulse follows the calendar (env.yearTick), not the fixed season used for plague and hares
    sp.step(t);
    t += STEP_TICKS;
    if (sp.dog[c] > last * 1.05) jumps++;
    last = sp.dog[c];
  }
  ok(jumps === 2, `one spring pulse per valley year (${jumps} in two years)`);
  const yearScale = YEAR_TICKS / BASE_YEAR_TICKS;
  const w = sp.dog.slice();
  ok(sp.kd[c] > 0 && w[c] > 0.2 * sp.kd[c] * (1 + 0.5 * yearScale) && w[c] <= sp.kd[c] * 1.0001, 'pulse growth is logistic and scaled to base years, staying under Kd');

  // a crowded cell sends two founders to a suitable neighbour
  sp.dog.fill(0);
  sp.town.fill(0);
  const site2 = townSite(sp, 2)!;
  sp.dog[site2[0]] = 0.95 * sp.kd[site2[0]];
  const total0 = sp.dogTotal();
  let moved = false;
  for (let k = 0; k < 200 && !moved; k++) {
    runWeb(sim, sp, 600, 1, 3); // tick 600 lies outside the spring pulse window on the 2x calendar
    for (let q = 0; q < CELLS; q++) if (q !== site2[0] && sp.dog[q] > 0) moved = true;
  }
  ok(moved, 'a cell above 0.8 Kd founds a neighbouring suitable cell');
  ok(near(sp.dogTotal(), total0, 1e-3), 'expansion moves dogs rather than making them');
  let onUnsuitable = 0;
  for (let k = 0; k < CELLS; k++) if (sp.dog[k] > 0 && sp.kd[k] <= 0) onUnsuitable++;
  ok(onUnsuitable === 0, 'dogs live only where dogCap is above zero');

  // town builds while a colony is there, and fades at 0.02 per base year when it is empty (a quiet web: no pulse, no expansion)
  const quiet = web({ dogR: 0 });
  const qs = townSite(quiet.sp, 2)!;
  quiet.sp.dog.fill(0);
  quiet.sp.town.fill(0);
  quiet.sp.dog[qs[0]] = 0.7 * quiet.sp.kd[qs[0]]; // above the town threshold, under the 0.8 Kd expansion line
  runWeb(quiet.sim, quiet.sp, 600, 100, 3);
  const yf = STEP_TICKS / BASE_YEAR_TICKS;
  ok(near(quiet.sp.town[qs[0]], 1 - Math.pow(1 - yf, 100), 1e-3), `a colony builds its town toward 1 at 1 per base year (${quiet.sp.town[qs[0]].toFixed(3)})`);
  const t1 = quiet.sp.town[qs[0]];
  quiet.sp.dog.fill(0);
  runWeb(quiet.sim, quiet.sp, 600, 60, 3);
  const dropped = t1 - quiet.sp.town[qs[0]];
  ok(near(dropped, 0.02 * 60 * yf, 1e-3), `an empty town fades 0.02 per base year (${dropped.toFixed(4)})`);
  ok(quiet.sp.town[qs[0]] > 0.7, 'old mounds stay visible');
}

// ---- town events
{
  const { sim, sp } = web();
  sp.dog.fill(0);
  sp.town.fill(0);
  runWeb(sim, sp, 0, 1, 3); // first call only records: no events
  ok(eventsOf(sim, 'townFounded').length === 0 && eventsOf(sim, 'townLost').length === 0, 'no town events from an empty valley');
  const site = townSite(sp, 3)!;
  for (const c of site) sp.dog[c] = 0.9 * sp.kd[c];
  const dogs = site.reduce((s, c) => s + sp.dog[c], 0);
  runWeb(sim, sp, 50, 1, 3);
  const f = eventsOf(sim, 'townFounded');
  ok(f.length === 1 && f[0].sp === Sp.PrairieDog && f[0].a === 3 && f[0].b === Math.round(dogs), 'townFounded: sp prairie dog, a = cells, b = dogs');
  ok(f.length === 1 && f[0].x > 0 && f[0].y > 0 && f[0].x < 512 && f[0].y < 512, 'townFounded carries the town centre');
  ok(sp.townCount === 1, 'one town');
  runWeb(sim, sp, 100, 5, 3);
  ok(eventsOf(sim, 'townFounded').length === 1, 'a standing town is not founded again');
  // a lone colony cell is not a town
  const lone = townSite(sp, 1, new Set(site.flatMap((c) => [c - COARSE_N - 1, c - COARSE_N, c - COARSE_N + 1, c - 1, c, c + 1, c + COARSE_N - 1, c + COARSE_N, c + COARSE_N + 1])))!;
  const foundedBefore = eventsOf(sim, 'townFounded').length;
  sp.dog[lone[0]] = 0.95 * sp.kd[lone[0]];
  const loneNeighbours = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => lone[0] + dy * COARSE_N + dx)).filter((q) => q !== lone[0] && q >= 0 && q < CELLS);
  for (const q of loneNeighbours) sp.dog[q] = 0;
  runWeb(sim, sp, 300, 1, 3);
  ok(eventsOf(sim, 'townFounded').length === foundedBefore, 'a single colony cell is not a town');
  sp.dog[lone[0]] = 0;
  // the town dies out
  for (const c of site) sp.dog[c] = 0;
  runWeb(sim, sp, 400, 1, 3);
  const l = eventsOf(sim, 'townLost');
  ok(l.length === 1 && l[0].sp === Sp.PrairieDog && l[0].a === 3, 'townLost: a = cells it covered');
  ok(sp.townCount === 0, 'town count follows');
}

// ---- sylvatic plague
{
  const quietWeb = (extra: Record<string, number> = {}, seed = 3) => {
    const w = web({ dogR: 0, ...extra }, seed);
    w.sp.dog.fill(0);
    w.sp.town.fill(0);
    return w;
  };
  // winter never starts one, even at a huge rate; summer does
  {
    const w = quietWeb({ plagueRate: 5000 });
    const ws = townSite(w.sp, 4)!;
    for (const c of ws) w.sp.dog[c] = w.sp.kd[c];
    runWeb(w.sim, w.sp, 0, 200, 3.2);
    ok(w.sp.plagueCells === 0 && eventsOf(w.sim, 'sylvaticPlague').length === 0, 'plague starts only in summer');
    runWeb(w.sim, w.sp, 20000, 2, 1.5);
    ok(w.sp.plagueCells >= 1, 'a crowded town catches plague in summer');
  }
  // no start without a rate
  {
    const w = quietWeb({ plagueRate: 0 });
    for (const c of townSite(w.sp, 4)!) w.sp.dog[c] = w.sp.kd[c];
    runWeb(w.sim, w.sp, 0, 300, 1.5);
    ok(w.sp.plagueCells === 0, 'no plague at plagueRate 0');
  }

  // one outbreak by hand: climb, spread, kill, fade, report
  const { sim, sp } = quietWeb();
  const site = townSite(sp, 4)!;
  const siteAll = new Set<number>();
  for (const c of site) for (const dy of [-2, -1, 0, 1, 2]) for (const dx of [-2, -1, 0, 1, 2]) siteAll.add(c + dy * COARSE_N + dx);
  const other = townSite(sp, 3, siteAll)!;
  const far = other.every((c) => Math.abs((c % COARSE_N) - (site[0] % COARSE_N)) > 3 || Math.abs(((c / COARSE_N) | 0) - ((site[0] / COARSE_N) | 0)) > 3);
  for (const c of site) sp.dog[c] = sp.kd[c];
  if (far) for (const c of other) sp.dog[c] = sp.kd[c];
  const dogsBefore = site.reduce((s, c) => s + sp.dog[c], 0);
  runWeb(sim, sp, 0, 2, 3);
  ok(sp.plagueCells === 0, 'no plague without a start');
  // fraction 0 still seeds one cell; aim it at the first town by emptying the other for the moment
  const otherDogs = other.map((c) => sp.dog[c]);
  for (const c of other) sp.dog[c] = 0;
  ok(sp.seedPlague(0, 0) === 1, 'the god tool seeds one cell at fraction 0');
  other.forEach((c, i) => { sp.dog[c] = otherDogs[i]; });
  const seeded = site.find((c) => sp.plague[c] > 0)!;
  let t = 100, peak = 0, spreadSeen = false, killed90 = false, ended = -1, otherHit = false;
  for (let k = 0; k < 400; k++) {
    sim.env.state.season = 3;
    sp.step(t);
    t += STEP_TICKS;
    if (site.filter((c) => sp.plague[c] > 0).length >= 2) spreadSeen = true;
    if (other.some((c) => sp.plague[c] > 0)) otherHit = true;
    for (const c of site) peak = Math.max(peak, sp.plague[c]);
    if (site.reduce((s, c) => s + sp.dog[c], 0) < 0.2 * dogsBefore) killed90 = true;
    if (sp.plagueCells === 0 && ended < 0) ended = k;
  }
  ok(peak > 0.9, `plague intensity climbs toward 1 (${peak.toFixed(2)})`);
  ok(spreadSeen, 'plague spreads to the neighbouring colony cells');
  ok(killed90, 'most of the town dies');
  const survivors = site.reduce((s, c) => s + sp.dog[c], 0);
  ok(survivors > 0.01 * dogsBefore && survivors < 0.15 * dogsBefore, `a few survive (${(100 * survivors / dogsBefore).toFixed(1)}% of ${dogsBefore.toFixed(1)})`);
  ok(ended >= 0 && ended * STEP_TICKS < BASE_YEAR_TICKS, `the outbreak fades within a base year (${ended * STEP_TICKS} ticks)`);
  ok(sp.plague.every((v) => v === 0), 'plague is gone from every cell');
  const ev = eventsOf(sim, 'sylvaticPlague');
  ok(ev.length === 1, 'one sylvaticPlague event when it has faded');
  ok(ev.length === 1 && ev[0].sp === Sp.PrairieDog && near(ev[0].a, dogsBefore - survivors, 1.5), `sylvaticPlague a = dogs lost (${ev[0]?.a} vs ${(dogsBefore - survivors).toFixed(1)})`);
  ok(ev.length === 1 && ev[0].b > 0 && ev[0].b < BASE_YEAR_TICKS && near(ev[0].x, ((seeded % COARSE_N) + 0.5) * 16, 0.01) && near(ev[0].y, (((seeded / COARSE_N) | 0) + 0.5) * 16, 0.01), 'sylvaticPlague b = duration in ticks, at the cell where it began');
  ok(eventsOf(sim, 'townLost').length >= 1, 'the town the plague emptied is lost');
  ok(!far || !otherHit, 'a town three cells away never catches the outbreak');
  // survivors regrow with the spring pulse
  const rec = web({ dogR: 1, plagueRate: 0 });
  rec.sp.dog.fill(0);
  for (const c of townSite(rec.sp, 2)!) rec.sp.dog[c] = 0.05 * rec.sp.kd[c];
  const before = rec.sp.dogTotal();
  runWeb(rec.sim, rec.sp, 0, 12 * (YEAR_TICKS / STEP_TICKS), 3);
  ok(rec.sp.dogTotal() > 2.5 * before, 'survivors regrow with the spring pulse');
}

// ---- plague rate: a large town catches it, in proportion to plagueRate, and only above 0.7 Kd
{
  let starts = 0;
  const trials = 40;
  for (let s = 0; s < trials; s++) {
    const { sim, sp } = web({ dogR: 0, plagueRate: 2 }, 100 + s);
    sp.dog.fill(0);
    const site = townSite(sp, 4)!;
    for (const c of site) sp.dog[c] = sp.kd[c];
    runWeb(sim, sp, 0, 1, 1.5);
    runWeb(sim, sp, 50, 1, 1.5);
    if (sp.plagueCells > 0) starts++;
  }
  // p per step = plagueRate x yf x 4 = 2 x 0.0208 x 4 = 0.167; the first call only records, so one start roll per sim
  ok(starts >= 2 && starts <= 16, `plague start chance per step follows plagueRate (${starts} of ${trials}, expect about ${(trials * 0.167).toFixed(0)})`);
  const { sim, sp } = web({ dogR: 0, plagueRate: 5000 });
  sp.dog.fill(0);
  const site = townSite(sp, 4)!;
  for (const c of site) sp.dog[c] = 0.5 * sp.kd[c];
  runWeb(sim, sp, 0, 20, 1.5);
  ok(sp.plagueCells === 0, 'a town below 0.7 Kd does not catch plague');
}

// ---- hare booms and crashes
{
  const { sim, sp } = web();
  sim.step(1);
  const t0 = 11 * YEAR_TICKS;
  runWeb(sim, sp, t0, 1, 0.5); // records the mean
  const mean = sp.hareTotal();
  for (let c = 0; c < CELLS; c++) sp.hare[c] *= 3;
  runWeb(sim, sp, t0 + 50, 1, 0.5);
  const boom = eventsOf(sim, 'hareBoom');
  ok(boom.length === 1 && boom[0].sp === Sp.Rabbit && boom[0].a > 2 * boom[0].b && near(boom[0].b, mean, mean * 0.02), 'hareBoom: a = valley total, b = 10-year mean, total over twice the mean');
  runWeb(sim, sp, t0 + 100, 1, 0.5);
  ok(eventsOf(sim, 'hareBoom').length === 1, 'at most one boom per 5 valley years');
  for (let c = 0; c < CELLS; c++) sp.hare[c] *= 0.05;
  runWeb(sim, sp, t0 + 150, 1, 0.5);
  const crash = eventsOf(sim, 'hareCrash');
  ok(crash.length === 1 && crash[0].sp === Sp.Rabbit && crash[0].a < 0.4 * crash[0].b, 'hareCrash: total under 0.4 x the mean (its own spacing clock)');
  runWeb(sim, sp, t0 + 200, 1, 0.5);
  ok(eventsOf(sim, 'hareCrash').length === 1, 'no second crash inside 5 years');
  for (let c = 0; c < CELLS; c++) sp.hare[c] = 0.2;
  runWeb(sim, sp, t0 + 5 * YEAR_TICKS + 250, 1, 0.5);
  ok(eventsOf(sim, 'hareCrash').length === 2, 'a crash can fire again after 5 years');
  // no events in the first 10 valley years
  const early = web();
  early.sim.step(1);
  runWeb(early.sim, early.sp, 0, 1, 0.5);
  for (let c = 0; c < CELLS; c++) early.sp.hare[c] *= 4;
  runWeb(early.sim, early.sp, 50, 1, 0.5);
  ok(eventsOf(early.sim, 'hareBoom').length === 0, 'no boom during the first 10 years (the opening is not a boom)');
}

// ---- rescues need the open prairie
{
  const closed = web();
  closed.sp.hare.fill(0);
  runWeb(closed.sim, closed.sp, 0, 3, 0.5);
  ok(closed.sp.hareTotal() === 0, 'closed valley: no hare rescue');
  const open = web({ openPrairie: 1 });
  open.sim.step(1);
  open.sp.hare.fill(0);
  runWeb(open.sim, open.sp, 100, 1, 0.5);
  ok(near(open.sp.hareTotal(), 10, 0.5), 'open prairie: 10 hares arrive when the valley holds fewer than 20');
  const im = eventsOf(open.sim, 'immigrated').filter((e) => e.sp === Sp.Rabbit);
  ok(im.length === 1 && im[0].a === 10, 'immigrated event for the hare rescue');
  const edge = im[0];
  ok(Math.min(edge.x, edge.y, 512 - edge.x, 512 - edge.y) < 100, 'the hares arrive near the border');
  // dogs: once per 20 base years with no town
  open.sp.dog.fill(0);
  open.sp.town.fill(0);
  runWeb(open.sim, open.sp, 1000, 2, 0.5);
  ok(open.sp.dogTotal() === 0, 'no dog colony before 20 base years');
  runWeb(open.sim, open.sp, 20 * BASE_YEAR_TICKS, 2, 0.5);
  ok(open.sp.dogTotal() > 2, 'a founding colony arrives once 20 base years have passed with no town');
  const dogIm = eventsOf(open.sim, 'immigrated').filter((e) => e.sp === Sp.PrairieDog);
  ok(dogIm.length === 1 && dogIm[0].a > 0, 'immigrated event for the dog colony');
  runWeb(open.sim, open.sp, 20 * BASE_YEAR_TICKS + 200, 1, 0.5);
  ok(open.sp.townCount >= 1 && eventsOf(open.sim, 'townFounded').length >= 1, 'the colony is a town');
  const t = open.sp.dogTotal();
  runWeb(open.sim, open.sp, 20 * BASE_YEAR_TICKS + 400, 3, 0.5);
  ok(eventsOf(open.sim, 'immigrated').filter((e) => e.sp === Sp.PrairieDog).length === 1 && open.sp.dogTotal() >= t * 0.9, 'no second colony while a town stands');
}

// ---- sim integration: populations, god tools, founders
{
  const off = createSim({ seed: 3 });
  ok(off.small === null, 'smallPrey off: no web');
  const popsOff = off.populations();
  ok(popsOff.length === 8 && popsOff[Sp.Rabbit] === 0 && popsOff[Sp.PrairieDog] === 0 && popsOff[Sp.Coyote] === 0, 'off: no rabbits, dogs or coyotes at the start');
  const row = off.sample();
  ok(row.hare_total === 0 && row.dog_total === 0 && row.towns === 0 && row.plague_events === 0 && 'pop_prairiedog' in row && 'pop_coyote' in row, 'off: web columns are present and zero');
  off.introduce(Sp.Rabbit, 5, 200, 200);
  ok(off.populations()[Sp.Rabbit] === 5, 'off: a god-tool rabbit is an agent, as before');
  off.introduce(Sp.PrairieDog, 5, 200, 200);
  ok(off.populations()[Sp.PrairieDog] === 0, 'off: prairie dogs have no agent form');

  const { sim, sp } = web();
  const p0 = sim.populations();
  ok(p0[Sp.Rabbit] === Math.round(sp.hareTotal()) && p0[Sp.Rabbit] > 500, `on: populations() reports the hare field (${p0[Sp.Rabbit]})`);
  ok(p0[Sp.PrairieDog] === Math.round(sp.dogTotal()) && p0[Sp.PrairieDog] > 10, `on: and the dog field (${p0[Sp.PrairieDog]})`);
  ok(sim.a.count === p0[Sp.Bison] + p0[Sp.Wolf] + p0[Sp.Raven] + p0[Sp.Deer] + p0[Sp.Cougar], 'on: no rabbit agents');
  const site = townSite(sp, 3)!;
  const cx = ((site[0] % COARSE_N) + 0.5) * 16, cy = (((site[0] / COARSE_N) | 0) + 0.5) * 16;
  const h0 = sp.hareTotal(), d0 = sp.dogTotal();
  sim.apply({ kind: 'introduce', species: Sp.Rabbit, count: 40, x: cx, y: cy });
  sim.apply({ kind: 'introduce', species: Sp.PrairieDog, count: 12, x: cx, y: cy });
  ok(near(sp.hareTotal() - h0, 40, 0.01) && near(sp.dogTotal() - d0, 12, 0.01), 'introduce adds to the fields around the point');
  ok(sim.a.count === p0[Sp.Bison] + p0[Sp.Wolf] + p0[Sp.Raven] + p0[Sp.Deer] + p0[Sp.Cougar], 'introduce spawns no agents');
  const intro = sim.events.filter((e) => e.kind === 'introduced');
  ok(intro.length === 2 && intro[0].sp === Sp.Rabbit && intro[0].a === 40, 'introduced events');
  sim.apply({ kind: 'cull', species: Sp.Rabbit, fraction: 0.5 });
  ok(near(sp.hareTotal(), (h0 + 40) * 0.5, 0.1), 'cull acts on the field');
  const cull = sim.events.filter((e) => e.kind === 'culled');
  ok(cull.length === 1 && near(cull[0].a, (h0 + 40) * 0.5, 1), 'culled event counts the animals');
  sim.apply({ kind: 'remove', species: Sp.PrairieDog });
  ok(sp.dogTotal() === 0 && sim.populations()[Sp.PrairieDog] === 0, 'remove empties a field');
  sim.apply({ kind: 'remove', species: Sp.Rabbit });
  ok(sim.populations()[Sp.Rabbit] === 0, 'remove empties the hares');
  // a dog dropped on unsuitable ground goes to the nearest suitable neighbour, or nowhere
  const bad = Array.from({ length: CELLS }, (_, k) => k).find((k) => sp.kd[k] <= 0 && [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => {
    const x = (k % COARSE_N) + dx, y = ((k / COARSE_N) | 0) + dy;
    return x < 0 || y < 0 || x >= COARSE_N || y >= COARSE_N || sp.kd[y * COARSE_N + x] <= 0;
  })))!;
  const placed = sp.introduce(Sp.PrairieDog, 5, ((bad % COARSE_N) + 0.5) * 16, (((bad / COARSE_N) | 0) + 0.5) * 16);
  ok(placed === 0 && sp.dogTotal() === 0, 'prairie dogs cannot be placed where no town can sit');

  // founders: registry driven
  const r20 = createSim({ seed: 3, params: { 'rabbit.initial': 20 } });
  ok(r20.populations()[Sp.Rabbit] === 20 && r20.a.count === off.a.count + 20 - 5 - 0, 'rabbit.initial spawns agents with smallPrey off');
  const c12 = createSim({ seed: 3, params: { 'coyote.initial': 12 } });
  ok(c12.populations()[Sp.Coyote] === 12, 'coyote.initial spawns coyote founders');
  const f20 = createSim({ seed: 3, params: { smallPrey: 1, 'rabbit.initial': 200, 'prairiedog.initial': 60 } });
  ok(near(f20.small!.hareTotal(), 200, 0.01) && near(f20.small!.dogTotal(), 60, 0.01) && f20.a.count === web().sim.a.count, 'with smallPrey on, initial seeds the fields and spawns no agents');
  ok(web({}, 3).sim.a.count === createSim({ seed: 3 }).a.count, 'the web adds no agents');
  // the other species are laid out exactly as before: same founders, same positions
  const base = createSim({ seed: 3 });
  const withC = createSim({ seed: 3, params: { 'coyote.initial': 12 } });
  let same = true;
  for (let i = 0; i < base.a.hi; i++) if (base.a.x[i] !== withC.a.x[i] || base.a.y[i] !== withC.a.y[i] || base.a.sp[i] !== withC.a.sp[i]) same = false;
  ok(same, 'generic founders come after the existing species and leave their layout alone');
}

// ---- samples and the snapshot texture
{
  const { sim, sp } = web({ plagueRate: 0 });
  sim.step(60);
  const row = sim.sample();
  ok(row.pop_rabbit === Math.round(row.hare_total) && row.pop_prairiedog === Math.round(row.dog_total), 'pop_rabbit and pop_prairiedog are the rounded field totals');
  ok(row.towns >= 1 && row.hare_total > 500, 'sample: towns and hare_total');
  for (const k of ['plague_cells', 'plague_events', 'town_founded', 'town_lost', 'hare_boom', 'hare_crash', 'hare_takes', 'dog_takes']) ok(k in row, `sample column ${k}`);
  ok(sim.snapshot(false).small === undefined, 'no texture without the vegetation refresh');
  sp.hare.fill(0); sp.dog.fill(0); sp.town.fill(0); sp.plague.fill(0);
  const c = 5 * COARSE_N + 7;
  sp.hare[c] = sim.p.hareK; sp.dog[c] = sim.p.dogK; sp.town[c] = 1; sp.plague[c] = 0.5;
  const snap = sim.snapshot(true);
  const tex = snap.small!;
  ok(tex.length === COARSE_N * COARSE_N * 4, 'texture is 32 x 32 RGBA');
  ok(tex[c * 4] === SMALL_SCALE.hareFull && tex[c * 4 + 1] === SMALL_SCALE.dogFull && tex[c * 4 + 2] === 255 && tex[c * 4 + 3] === 128, 'texture scale: R hare/hareK x 200, G dog/dogK x 200, B town x 255, A plague x 255');
  sp.hare[c] = 10 * sim.p.hareK;
  const sat = new Uint8Array(CELLS * 4);
  sp.fillTexture(sat);
  ok(sat[c * 4] === 255 && sat[c * 4 + 1] === SMALL_SCALE.dogFull && sat[(c + 1) * 4] === 0, 'R saturates at 255 and empty cells are 0');
  ok(createSim({ seed: 3 }).snapshot(true).small === undefined, 'off: no texture');
}

// ---- smallGameField: wolf mousing draws on the fields
{
  const run = (field: number, mousing: boolean) => {
    const { sim, sp } = web({ smallGameField: field });
    sim.step(1);
    const a = sim.a;
    let w = -1;
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf) { w = i; break; }
    // park the wolf in a cell holding hares and let it mouse
    const c = Array.from({ length: CELLS }, (_, k) => k).find((k) => sp.hare[k] > 1.5)!;
    a.x[w] = ((c % COARSE_N) + 0.5) * 16;
    a.y[w] = (((c / COARSE_N) | 0) + 0.5) * 16;
    let gained = 0;
    const live = (sim as unknown as { liveWolf(i: number, P: unknown): void }).liveWolf.bind(sim);
    const P = sim.p.species[Sp.Wolf];
    sp.drainSample();
    for (let k = 0; k < 6000; k++) {
      a.state[w] = mousing ? St.Stalk : St.Rest;
      a.target[w] = -1;
      a.energy[w] = 0.3;
      sp.hare[c] = 3; // keep the cell stocked at 3 hares so the rate is the rate
      live(w, P);
      gained += a.energy[w] - 0.3;
    }
    return { gained, takes: sp.drainSample().hareTakes };
  };
  const rest = run(0, false);
  const flat = run(0, true);
  const field = run(1, true);
  ok(flat.takes === 0 && flat.gained - rest.gained > 0, 'smallGameField off: the flat trickle, no catches from the field');
  ok(field.takes > 10, `smallGameField on: catches come from the field (${field.takes})`);
  // both runs sit in the same state, so the body's own upkeep cancels: what the field adds is takes x the gain per hare
  const P = web().sim.p.species[Sp.Wolf];
  const trickle = 6000 * P.metabolism * 0.5;
  const paid = field.gained - (flat.gained - trickle);
  ok(near(paid, field.takes * GAIN.wolf.hare, 0.01), 'each catch pays GAIN.wolf.hare');
  ok(paid > 0.7 * trickle && paid < 1.4 * trickle, `at 3 hares a cell the field pays about the old trickle (${paid.toFixed(2)} vs ${trickle.toFixed(2)})`);
  void rest;
}

// ---- dogClip and dogGrazeBonus
{
  const mk = (params: Record<string, number>) => {
    const { sim, sp } = web(params);
    sim.step(1);
    sp.dog.fill(0);
    sp.town.fill(0);
    const site = townSite(sp, 3)!;
    for (const c of site) { sp.dog[c] = 0.9 * sp.kd[c]; sp.town[c] = 1; }
    return { sim, sp, site };
  };
  const grassIn = (sim: Sim, c: number): number => {
    const n = sim.world.n, r = n / COARSE_N;
    const x0 = (c % COARSE_N) * r, y0 = ((c / COARSE_N) | 0) * r;
    let s = 0;
    for (let j = y0; j < y0 + r; j++) for (let i = x0; i < x0 + r; i++) s += sim.veg.grass[j * n + i];
    return s / (r * r);
  };
  const clip = mk({ dogClip: 0.5 }), plain = mk({ dogClip: 0 });
  for (const m of [clip, plain]) {
    const n = m.sim.world.n, r = n / COARSE_N;
    const c = m.site[0];
    const x0 = (c % COARSE_N) * r, y0 = ((c / COARSE_N) | 0) * r;
    for (let j = y0; j < y0 + r; j++) for (let i = x0; i < x0 + r; i++) m.sim.veg.grass[j * n + i] = 0.6;
  }
  runWeb(clip.sim, clip.sp, 50, 12, 3);
  runWeb(plain.sim, plain.sp, 50, 12, 3);
  ok(grassIn(clip.sim, clip.site[0]) < 0.2 && near(grassIn(plain.sim, plain.site[0]), 0.6, 1e-5), `dogClip: grass in a town is clipped short (${grassIn(clip.sim, clip.site[0]).toFixed(2)}); off, untouched`);
  const outside = Array.from({ length: CELLS }, (_, k) => k).find((k) => clip.sp.kd[k] > 0 && !clip.site.includes(k) && clip.sp.dog[k] === 0)!;
  ok(outside !== undefined && grassIn(clip.sim, outside) === grassIn(plain.sim, outside), 'dogClip leaves ground outside the towns alone');

  const bonus = mk({ dogGrazeBonus: 0.2 });
  runWeb(bonus.sim, bonus.sp, 50, 1, 3);
  const edge = (() => {
    for (const c of bonus.site) {
      const x = c % COARSE_N, y = (c / COARSE_N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COARSE_N || ny >= COARSE_N) continue;
        const q = ny * COARSE_N + nx;
        if (!bonus.site.includes(q) && bonus.sp.land[q] > 0.5) return q;
      }
    }
    return -1;
  })();
  ok(edge >= 0 && near(bonus.sp.grazeBonus[edge], 0.2, 1e-4) && bonus.site.every((c) => bonus.sp.grazeBonus[c] === 0), 'dogGrazeBonus: the edge cell gets the bonus, the town itself none');
  const none = mk({});
  runWeb(none.sim, none.sp, 50, 1, 3);
  ok(none.sp.grazeBonus.every((v) => v === 0), 'dogGrazeBonus off: no bonus');
}

// ---- determinism and a short on-run
{
  const sig = (seed: number): string => {
    const { sim, sp } = web({ plagueRate: 0.5 }, seed);
    sim.step(2400);
    return [sp.hareTotal().toFixed(4), sp.dogTotal().toFixed(4), sp.townCount, sim.events.length].join('|');
  };
  ok(sig(5) === sig(5), 'the same seed gives the same fields');
  ok(sig(5) !== sig(6), 'a different seed gives a different valley');
  const { sim } = web();
  sim.step(1200);
  ok(sim.populations().every((v) => Number.isFinite(v) && v >= 0), 'a year runs clean');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`small-prey web: all ${checks} checks passed`);
