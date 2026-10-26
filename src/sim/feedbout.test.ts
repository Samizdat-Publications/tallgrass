// Feeding bout (feedBout, 2026-10-25): with it on, a pack holds its kill until it is eaten (feeds on it in long bites, lies up beside it once
// fed, does not hunt again while it lasts); with it off, nothing changes (the golden hashes cover that).
import { createSim, Sim } from './sim';
import { Sp, St } from './types';

let checks = 0, failures = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) { failures++; console.log(`FAIL ${msg}`); }
}
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const CX = 256, CY = 256;

/** A valley with a pack of four hungry wolves round a fresh kill (a pronghorn, or a bison), a pronghorn band 40 m off, and nothing else. */
function scene(params: Record<string, number>, prey: number, pups = 2): { sim: Sim; wolves: number[] } {
  const sim = createSim({
    seed: 9,
    params: {
      calendarScale: 2, plagueRate: 0, 'bison.initial': 0, 'deer.initial': 0, 'wolf.initial': 0, 'raven.initial': 0, 'coyote.initial': 0,
      'cougar.initial': 0, 'muledeer.initial': 0, 'eagle.initial': 0, 'hawk.initial': 0, 'beaver.initial': 0, wolfImmigration: 0, ...params,
    },
  });
  const S = sim as Any;
  const pk = S.newPack(CX - 30, CY - 30);
  const wolves: number[] = [];
  for (let q = 0; q < 4; q++) {
    const i = sim.spawnAdult(Sp.Wolf, CX + (q - 1.5) * 1.5, CY + 1);
    const a = sim.a;
    a.pack[i] = pk; a.male[i] = q % 2; a.age[i] = 2000; a.energy[i] = 0.35; a.hydration[i] = 1; a.stamina[i] = 1;
    wolves.push(i);
  }
  // pups at the den, 42 m off: they pull the pack's centre toward home, which is what walks fed wolves away from a kill without the bout
  for (let q = 0; q < pups; q++) {
    const i = sim.spawnAdult(Sp.Wolf, CX - 30 + q, CY - 30);
    sim.a.pack[i] = pk; sim.a.age[i] = 30; sim.a.energy[i] = 0.8; sim.a.hydration[i] = 1;
  }
  for (let q = 0; q < 8; q++) {
    const j = sim.spawnAdult(Sp.Deer, CX + 40 + (q % 4) * 2, CY + 6 + ((q / 4) | 0) * 2);
    sim.a.age[j] = 2000; sim.a.energy[j] = 0.8; sim.a.hydration[j] = 1;
  }
  S.addCarcass(CX, CY, prey === Sp.Bison ? 7 : 2.2, prey, 1);
  return { sim, wolves };
}

interface Run { near: number; chase: number; gone: number; rest: number; restRing: number }
/** Run until the kill is down to scraps (meat < 0.3) or `ticks`: share of wolf-ticks within 12 m of it, wolf-ticks spent chasing a target,
 *  the tick the meat ran out (-1 if it lasted), wolf-ticks resting and how many of those were 3.5 to 11 m from the kill. */
function run(params: Record<string, number>, prey: number, ticks: number): Run {
  const { sim, wolves } = scene(params, prey);
  const S = sim as Any, a = sim.a;
  let near = 0, total = 0, chase = 0, gone = -1, rest = 0, restRing = 0;
  for (let t = 0; t < ticks; t++) {
    sim.step(1);
    const k = S.nearestCarcass(CX, CY, 3, 1e9, false);
    if (k < 0 || S.cMeat[k] < 0.3) { gone = t; break; }
    for (const i of wolves) {
      if (!a.alive[i]) continue;
      total++;
      const d = Math.hypot(a.x[i] - CX, a.y[i] - CY);
      if (d < 12) near++;
      if ((a.state[i] === St.Chase || a.state[i] === St.Stalk) && a.target[i] >= 0) chase++;
      if (a.state[i] === St.Rest) { rest++; if (d > 3.5 && d < 11) restRing++; }
    }
  }
  return { near: near / Math.max(1, total), chase, gone, rest, restRing };
}
const show = (n: string, r: Run): void => console.log(`  ${n}: near ${(r.near * 100).toFixed(0)}%, chase ${r.chase}, meat gone at ${r.gone}, rest ${r.rest} (${r.restRing} in the ring)`);

// ---- a pronghorn: too small to fill four hungry wolves, so they eat it to the bone; the bout makes that a feed you can watch
{
  const off = run({ feedBout: 0 }, Sp.Deer, 2000), on = run({ feedBout: 1 }, Sp.Deer, 2000);
  show('pronghorn off', off); show('pronghorn on ', on);
  ok(on.near > 0.95, `with feedBout the pack stays at the pronghorn until it is eaten (${(on.near * 100).toFixed(0)}% of wolf-ticks within 12 m)`);
  ok(off.gone > 0 && on.gone >= 2 * off.gone, `the feed lasts at least twice as long (${on.gone} ticks against ${off.gone})`);
  ok(on.chase === 0, `no hunt starts while the pronghorn lasts (${on.chase} chase ticks)`);
}
// ---- a bison: enough to fill them, so they feed to full, lie up beside it, and come back to it; they do not wander off or hunt
{
  const off = run({ feedBout: 0 }, Sp.Bison, 3000), on = run({ feedBout: 1 }, Sp.Bison, 3000);
  show('bison off', off); show('bison on ', on);
  ok(on.near > 0.85, `with feedBout the pack holds the bison kill (${(on.near * 100).toFixed(0)}% of wolf-ticks within 12 m)`);
  // (in this small scene the wolves stay close either way; the walk-off shows in the full valley, see DECISIONS 2026-10-25 and scratch/killwatch.ts:
  // with the bout off the killers are gone a median 91 ticks after a kill with 60 to 80% of the meat left)
  ok(on.restRing > 5 * off.restRing + 50, `with the bout the fed wolves lie up round the kill (${on.restRing} rest ticks in the ring against ${off.restRing})`);
  ok(on.rest > 100 && on.restRing / on.rest > 0.8, `fed wolves lie up round the kill at their own spots (${on.rest} rest ticks, ${(100 * on.restRing / Math.max(1, on.rest)).toFixed(0)}% 3.5 to 11 m out)`);
  ok(on.chase === 0, `no hunt starts while the bison lasts (${on.chase} chase ticks)`);
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
