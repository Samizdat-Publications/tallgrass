// Plays a challenge headless with no interventions and reports how it ends. Used to tune challenge thresholds:
// a good challenge usually fails when left alone, but not instantly.
// Usage: npx tsx tools/challenge_check.ts --challenge knife [--seed 18] [--every 60] [--policy] [--params '{"calendarScale":2}']
// --policy plays a simple scripted player (rules below) to show the challenge can be won within its budget.
// Prints one JSON line: { challenge, seed, state, year, reason, minPop, maxPop, endPop, maxPacks }.
import { Sim } from '../src/sim/sim';
import { hashSeed } from '../src/sim/rng';
import { BASE_YEAR_TICKS, SPECIES_COUNT, Sp, YEAR_TICKS, type Intervention } from '../src/sim/types';
import { challengeById } from '../src/challenges';
import { scenarioById } from '../src/scenarios';

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ch = challengeById(arg('challenge') ?? null);
if (!ch) { console.error('unknown challenge'); process.exit(1); }
const seedStr = arg('seed', ch.seed)!;
const seed = /^\d+$/.test(seedStr) ? Number(seedStr) : hashSeed(seedStr);
const every = Number(arg('every', '60'));
const usePolicy = argv.includes('--policy');

/** A scripted player: returns an intervention to apply now, or null. Mirrors the game's tool definitions in src/main.ts.
 *  It reasons in 2,400-tick years (the years the challenges were tuned in), whatever the valley calendar. */
type Policy = (year: number, pop: number[], packs: number, sinceLast: number, sim: Sim, mem: Record<string, number>) => Intervention | null;
const ADD_BISON: Intervention = { kind: 'introduce', species: Sp.Bison, count: 40 };
const ADD_WOLVES: Intervention = { kind: 'introduce', species: Sp.Wolf, count: 6 };
const CULL: Intervention = { kind: 'cull', species: Sp.Bison, fraction: 0.7 };
const RAIN: Intervention = { kind: 'rain', ticks: 1600 };
const POLICIES: Record<string, Policy> = {
  herd: (y, p, _k, since) => (since > 1.5 && (p[Sp.Bison] < 250 || p[Sp.Deer] < 60) ? ADD_BISON : null),
  island: (y, p, _k, since) => (y > 0.2 && since > 2 && p[Sp.Wolf] < 10 ? ADD_WOLVES : since > 1 && p[Sp.Bison] > 2300 ? CULL : null),
  collapse: (y, p, _k, since) => (since > 2 && p[Sp.Wolf] < 12 ? ADD_WOLVES : null),
  homecoming: (y, p, k, since) => (y > 0.3 && since > 2 && k < 3 ? ADD_WOLVES : null),
  // break each drought soon after it starts (they come every four years from year 1)
  dry: (y, _p, _k, since) => (since > 3 && y % 4 > 1.1 && y % 4 < 1.4 ? RAIN : null),
  // S17. The wolves are trapped out in year 1.5: bring a pack back, then thin the coyotes whenever they run away, and give them distemper at the peak.
  meso: (y, p, _k, since, _sim, mem) => {
    if (y > 2 && !mem.wolves) { mem.wolves = 1; return { kind: 'introduce', species: Sp.Wolf, count: 12 }; }
    if (since < 0.7) return null;
    if (p[Sp.Coyote] > 70 && !mem.distemper) { mem.distemper = 1; return { kind: 'disease', disease: 'distemper', species: Sp.Coyote, fraction: 0.4 }; }
    return p[Sp.Coyote] > 40 ? { kind: 'cull', species: Sp.Coyote, fraction: 0.7 } : null;
  },
  // The plague wiped the towns at tick 700: plant three colonies in the best, most distant cells before year 2 (plague spreads between neighbouring
  // cells, so a second plague leaves the far ones), then top up if the town is ever down to a handful.
  town: (y, p, _k, since, sim, mem) => {
    const small = sim.small;
    const planted = mem.planted ?? 0;
    if (small && y > 0.4 && planted < 3 && since > 0.1) {
      // the best-suited cell that lies farthest from the colonies planted so far (the first goes to the best cell outright)
      const cs = small.cellSize;
      let best = -1, bestScore = -1;
      for (let c = 0; c < small.kd.length; c++) {
        if (small.kd[c] < 2) continue;
        const x = ((c % 32) + 0.5) * cs, yy = (Math.floor(c / 32) + 0.5) * cs;
        let far = planted === 0 ? 0 : 1e9;
        for (let q = 0; q < planted; q++) far = Math.min(far, Math.hypot(x - mem[`x${q}`], yy - mem[`y${q}`]));
        if (far + small.kd[c] > bestScore) { bestScore = far + small.kd[c]; best = c; }
      }
      if (best >= 0) {
        const x = ((best % 32) + 0.5) * cs, yy = (Math.floor(best / 32) + 0.5) * cs;
        mem[`x${planted}`] = x;
        mem[`y${planted}`] = yy;
        mem.planted = planted + 1;
        return { kind: 'introduce', species: Sp.PrairieDog, count: 30, x, y: yy };
      }
    }
    if (y > 2 && since > 1 && p[Sp.PrairieDog] > 0 && p[Sp.PrairieDog] < 25) return { kind: 'introduce', species: Sp.PrairieDog, count: 30 };
    return null;
  },
  // Dry lightning every late summer for five years, and five rains to spend: call each one just before the strikes, so the ground is wet and the fire cannot spread.
  storm: (y, _p, _k, since) => (y > 0.9 && y < 5.1 && y % 1 > 0.965 && since > 0.5 ? RAIN : null),
  // Keep the cats and the deer from running out: top up whichever is down to a few.
  cats: (y, p, _k, since) => {
    if (since < 0.3) return null;
    if (p[Sp.Cougar] < 3) return { kind: 'introduce', species: Sp.Cougar, count: 6 };
    if (p[Sp.MuleDeer] < 20) return { kind: 'introduce', species: Sp.MuleDeer, count: 40 };
    return null;
  },
};
const policy = usePolicy ? POLICIES[ch.id] : undefined;
let toolsUsed = 0, lastTool = -99;
const toolLog: string[] = [];
const mem: Record<string, number> = {};
const sc = scenarioById(ch.scenario);

const extra: Record<string, number> = arg('params') ? JSON.parse(arg('params')!) : {};
const sim = new Sim({ seed, params: { ...sc.params, ...(ch.params ?? {}), ...extra } });
const schedule = sc.schedule.slice().sort((a, b) => a.tick - b.tick);
const check = ch.makeCheck();
const N = SPECIES_COUNT;
const minPop = new Array(N).fill(Infinity), maxPop = new Array(N).fill(0);
let maxPacks = 0;
const yearly: number[][] = [];
let status = check({ year: 0, pop: Array.from(sim.populations()), packs: 0, toolsUsed: 0 });
const endTick = Math.ceil(ch.years * YEAR_TICKS) + every;
while (status.state === 'running' && sim.tick < endTick) {
  while (schedule.length && sim.tick >= schedule[0].tick) sim.apply(schedule.shift()!.iv);
  sim.step();
  if (sim.tick % every !== 0) continue;
  const pop = Array.from(sim.populations());
  let packs = 0;
  for (let k = 0; k < sim.packAlive.length; k++) if (sim.packAlive[k]) packs++;
  maxPacks = Math.max(maxPacks, packs);
  if (sim.tick % YEAR_TICKS === 0) yearly.push(pop.slice(0, N));
  for (let s = 0; s < N; s++) {
    if (sim.tick > YEAR_TICKS) minPop[s] = Math.min(minPop[s], pop[s]);
    maxPop[s] = Math.max(maxPop[s], pop[s]);
  }
  const year = sim.tick / YEAR_TICKS;
  const baseYear = sim.tick / BASE_YEAR_TICKS;
  if (policy && (ch.maxTools === null || toolsUsed < ch.maxTools)) {
    const iv = policy(baseYear, pop, packs, baseYear - lastTool, sim, mem);
    if (iv) { sim.apply(iv); toolsUsed++; lastTool = baseYear; toolLog.push(`${year.toFixed(1)}:${iv.kind}${'species' in iv ? iv.species : ''}`); }
  }
  status = check({ year, pop, packs, toolsUsed });
}
const endPop = Array.from(sim.populations()).slice(0, N);
console.log(JSON.stringify({
  challenge: ch.id, seed: seedStr, policy: usePolicy, toolsUsed, toolLog, state: status.state, year: +(sim.tick / YEAR_TICKS).toFixed(1), reason: status.reason ?? status.progress,
  minPop: minPop.map((v) => (v === Infinity ? null : v)), maxPop, endPop, maxPacks, yearly,
}));
