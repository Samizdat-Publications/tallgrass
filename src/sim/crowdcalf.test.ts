// Crowded-herd calf loss (bisonCrowdCalf, 2026-10-27): above bisonCrowdRef bison, each newborn calf is lost with a chance that grows with the
// herd, whatever the mother's condition; below it, or with it off, every calf is born as before (the golden hashes cover off).
import { createSim } from './sim';
import { Sp } from './types';

let checks = 0, failures = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) { failures++; console.log(`FAIL ${msg}`); }
}

/** A valley of 40 well-fed adult bison, the 20 cows all due to calve next tick, and nothing else. Returns the calves born. */
function calves(params: Record<string, number>): number {
  const sim = createSim({
    seed: 5,
    params: {
      calendarScale: 2, plagueRate: 0, 'bison.initial': 0, 'deer.initial': 0, 'wolf.initial': 0, 'raven.initial': 0, 'coyote.initial': 0,
      'cougar.initial': 0, 'muledeer.initial': 0, 'eagle.initial': 0, 'hawk.initial': 0, 'beaver.initial': 0, wolfImmigration: 0, leanLitter: 0,
      ...params,
    },
  });
  const a = sim.a;
  const herd: number[] = [];
  for (let q = 0; q < 40; q++) {
    const i = sim.spawnAdult(Sp.Bison, 256 + (q % 8) * 3, 256 + Math.floor(q / 8) * 3);
    a.male[i] = q % 2; a.age[i] = 6000; a.energy[i] = 0.95; a.hydration[i] = 1;
    if (!a.male[i]) a.pregnant[i] = 2;
    herd.push(i);
  }
  const before = new Set(herd);
  sim.step(4);
  let n = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Bison && !before.has(i)) n++;
  return n;
}

const off = calves({ bisonCrowdCalf: 0 });
const roomy = calves({ bisonCrowdCalf: 1, bisonCrowdRef: 400 });
const crowded = calves({ bisonCrowdCalf: 1, bisonCrowdRef: 10 });
const half = calves({ bisonCrowdCalf: 0.5, bisonCrowdRef: 10 });
console.log(`calves: off ${off}, herd under the ref ${roomy}, crowded (strength 1) ${crowded}, crowded (strength 0.5) ${half}`);
ok(off >= 18, `with the brake off the due cows calve (${off} of 20)`);
ok(roomy === off, `a herd under bisonCrowdRef loses no calves (${roomy} against ${off})`);
ok(crowded === 0, `a herd at four times the ref with strength 1 loses every calf (${crowded})`);
ok(half > 2 && half < off - 2, `strength caps the loss: at 0.5 about half the calves live (${half} of ${off})`);

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
