// Unit tests for canid disease (S2). Run: npx tsx src/sim/disease.test.ts
import { createSim, Sim } from './sim';
import { IS_CANID } from './disease';
import { F_INFECTED, F_MANGE, Sp, AGENT_STRIDE } from './types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

/** Keep wolves fed and watered so only the disease can kill them. */
function pamper(sim: Sim): void {
  const a = sim.a;
  for (let i = 0; i < a.hi; i++) {
    if (a.alive[i] && a.sp[i] === Sp.Wolf) { a.energy[i] = 1; a.hydration[i] = 1; }
  }
}

ok(IS_CANID[Sp.Wolf] === 1 && IS_CANID[Sp.Bison] === 0, 'wolves are canids, bison are not');

// 1. defaults are off: no disease object activity, no flags
{
  const sim = createSim({ seed: 5, params: { cdvRate: 0, mangeRate: 0 } });
  ok(!sim.dis.on && !sim.dis.cdvOn && !sim.dis.mangeOn, 'disease is off at rates 0 (v6 turns it on by default)');
  for (let k = 0; k < 400; k++) sim.step();
  const snap = sim.snapshot(false);
  let flagged = 0;
  for (let k = 0; k < snap.count; k++) if (snap.agents[k * AGENT_STRIDE + 8] & (F_MANGE)) flagged++;
  ok(flagged === 0 && sim.dis.outbreaks === 0, 'no mange flags or outbreaks with defaults');
}

// 2. a forced outbreak: death rates match the params
{
  const sim = createSim({ seed: 11, params: { cdvRate: 0.1 } });
  const a = sim.a;
  // a big population of pups and adults, all sick at once
  for (let k = 0; k < 700; k++) {
    const i = sim.spawnAdult(Sp.Wolf, 150 + (k % 28) * 8, 150 + Math.floor(k / 28) * 8);
    a.pack[i] = -1;
    a.age[i] = k % 2 === 0 ? 0 : sim.p.species[Sp.Wolf].matureAge + 200;
  }
  let sick = 0;
  for (let i = 0; i < a.hi; i++) {
    if (a.alive[i] && a.sp[i] === Sp.Wolf) { sim.dis.infect(i); sick++; }
  }
  ok(sick >= 700, `infected the whole population (${sick})`);
  const maxTicks = sim.p.cdvTicks + 400;
  for (let k = 0; k < maxTicks; k++) {
    pamper(sim);
    sim.step();
    let any = false;
    for (let i = 0; i < a.hi && !any; i++) if (a.alive[i] && a.cdv[i] > 0) any = true;
    if (!any && k > 5) break;
  }
  const d = sim.dis;
  const pups = d.pupDied + d.pupSurvived, adults = d.adultDied + d.adultSurvived;
  const pupRate = d.pupDied / pups, adultRate = d.adultDied / adults;
  console.log(`forced outbreak: pups ${d.pupDied}/${pups} = ${pupRate.toFixed(3)} (param ${sim.p.cdvPupDeath}), adults ${d.adultDied}/${adults} = ${adultRate.toFixed(3)} (param ${sim.p.cdvAdultDeath})`);
  ok(pups >= 300 && adults >= 300, `enough animals resolved (${pups} pups, ${adults} adults)`);
  ok(Math.abs(pupRate - sim.p.cdvPupDeath) <= 0.1, `pup death rate ${pupRate.toFixed(3)} within 0.1 of ${sim.p.cdvPupDeath}`);
  ok(Math.abs(adultRate - sim.p.cdvAdultDeath) <= 0.1, `adult death rate ${adultRate.toFixed(3)} within 0.1 of ${sim.p.cdvAdultDeath}`);
  // survivors are immune for years and healthy again
  let immune = 0, sickLeft = 0;
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || a.sp[i] !== Sp.Wolf) continue;
    if (a.immune[i] > 0) immune++;
    if (a.cdv[i] > 0) sickLeft++;
  }
  ok(sickLeft === 0, 'nobody is still sick after the course');
  ok(immune > 0, 'survivors are immune');
  // the outbreak closes with a distemper event carrying pups and adults lost
  for (let k = 0; k < 120; k++) { pamper(sim); sim.step(); }
  const ev = sim.events.filter((e) => e.kind === 'distemper');
  ok(ev.length === 1, `one distemper event (${ev.length})`);
  if (ev.length === 1) ok(ev[0].a === d.pupDied && ev[0].b === d.adultDied, `event carries pups ${ev[0].a} and adults ${ev[0].b} lost`);
}

// 3. snapshot flags and metabolism
{
  const sim = createSim({ seed: 3, params: { cdvRate: 0.1, mangeRate: 0.1 } });
  const a = sim.a;
  let w = -1;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf) { w = i; break; }
  let w2 = -1;
  for (let i = w + 1; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf) { w2 = i; break; }
  sim.dis.infect(w);
  a.mange[w2] = 0.8;
  const snap = sim.snapshot(false);
  let inf = 0, mg = 0;
  for (let k = 0; k < snap.count; k++) {
    const f = snap.agents[k * AGENT_STRIDE + 8];
    if (f & F_INFECTED) inf++;
    if (f & F_MANGE) mg++;
  }
  ok(inf === 1 && mg === 1, `snapshot flags one sick and one mangy wolf (${inf}, ${mg})`);
  ok(Math.abs(sim.dis.metabMult(w, 0.5) - 1.5) < 1e-9, 'distemper drains 1.5x');
  ok(sim.dis.metabMult(w2, 0) > 1.2 && sim.dis.metabMult(w2, 1) === 1, 'mange costs more in the cold, nothing in the warm');
  ok(Math.abs(sim.dis.mangeSpeed(w2) - 0.92) < 1e-6, 'mange slows the hunt by 10% x severity');
}

// 4. mange: grows, spreads in the pack, raises one event per pack, recovers when well fed
{
  const sim = createSim({ seed: 9, params: { mangeRate: 0.1, mangeSpread: 0.9, mangeRecover: 0.3 } });
  const a = sim.a;
  let w = -1;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf && a.pack[i] >= 0) { w = i; break; }
  const pk = a.pack[w];
  a.mange[w] = 0.05;
  for (let k = 0; k < 1500; k++) {
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf) { a.energy[i] = 0.5; a.hydration[i] = 1; }
    sim.step();
  }
  let inPack = 0, packSize = 0;
  for (let i = 0; i < a.hi; i++) {
    if (a.alive[i] && a.sp[i] === Sp.Wolf && a.pack[i] === pk) { packSize++; if (a.mange[i] > 0) inPack++; }
  }
  ok(inPack >= 2, `mange spread inside the pack (${inPack} of ${packSize})`);
  const ev = sim.events.filter((e) => e.kind === 'mange');
  ok(ev.length >= 1, `a mange event was raised (${ev.length})`);
  // well-fed wolves shake it off over a few years
  sim.p.mangeRecover = 40; // read at use time: make recovery quick so the test stays short
  for (let k = 0; k < 400; k++) {
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf) { a.energy[i] = 1; a.hydration[i] = 1; }
    sim.step();
  }
  let still = 0;
  for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Wolf && a.mange[i] > 0) still++;
  ok(still === 0, `fed wolves recover from mange (${still} still mangy)`);
}

// 5. immigrant hook and outbreak scaling
{
  const sim = createSim({ seed: 2, params: { cdvRate: 0.2, mangeRate: 0.1, mangeImmigrantShare: 1 } });
  const i = sim.spawnAdult(Sp.Wolf, 100, 100);
  ok(sim.dis.maybeSeedMangeOnImmigrant(i) && sim.a.mange[i] > 0, 'immigrant hook seeds mange at share 1');
  const r = sim.spawnAdult(Sp.Raven, 100, 100);
  ok(!sim.dis.maybeSeedMangeOnImmigrant(r) && sim.a.mange[r] === 0, 'immigrant hook ignores non-canids');
  ok(Math.abs(sim.dis.outbreakChance(60) - 0.2) < 1e-9, 'outbreak chance 0.2 at 60 wolves');
  ok(Math.abs(sim.dis.outbreakChance(30) - 0.05) < 1e-9, 'outbreak chance scales with the square');
  ok(Math.abs(sim.dis.outbreakChance(500) - 0.4) < 1e-9, 'outbreak chance capped at 2x');
}

if (failures) {
  console.error(`${failures} of ${checks} disease checks failed`);
  process.exit(1);
}
console.log(`canid disease: all ${checks} checks passed`);
