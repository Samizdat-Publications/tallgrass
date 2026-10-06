// Unit tests for the species registry and the event serial. Run: npx tsx src/sim/species.test.ts
import { AGENT_STRIDE, F_MANGE, F_MIGRANT, F_STOT, SPECIES_COUNT, SPECIES_KEYS, SPECIES_NAMES, STATE_NAMES, Sp, St } from './types';
import { COAT_BASE, COAT_RANGE, DIET, PARAM_PREFIX, SPECIES, SPECIES_BY_KEY, canHunt, isGrazer, isPredator, isPrey, isThreat } from './species';
import { Agents } from './agents';
import { createSim } from './sim';
import { defaultParams } from './params';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// ids are positions, and the Sp constants agree with the registry
ok(SPECIES.every((d, i) => d.id === i), 'registry ids are array positions');
ok(SPECIES_COUNT === SPECIES.length && SPECIES_COUNT === 12, 'SPECIES_COUNT is 12 after S14');
ok(SPECIES_KEYS.join() === 'bison,wolf,raven,pronghorn,rabbit,cougar,coyote,prairiedog,eagle,hawk,muledeer,beaver', 'SPECIES_KEYS order');
ok(SPECIES_NAMES.join() === 'Bison,Wolf,Raven,Pronghorn,Jackrabbit,Cougar,Coyote,Prairie dog,Golden eagle,Red-tailed hawk,Mule deer,Beaver', 'SPECIES_NAMES order');
ok(SPECIES_BY_KEY.bison.id === Sp.Bison && SPECIES_BY_KEY.wolf.id === Sp.Wolf && SPECIES_BY_KEY.raven.id === Sp.Raven, 'Sp ids match keys (1)');
ok(SPECIES_BY_KEY.pronghorn.id === Sp.Deer && SPECIES_BY_KEY.rabbit.id === Sp.Rabbit && SPECIES_BY_KEY.cougar.id === Sp.Cougar, 'Sp ids match keys (2)');
ok(SPECIES_BY_KEY.coyote.id === Sp.Coyote && SPECIES_BY_KEY.prairiedog.id === Sp.PrairieDog && Sp.Coyote === 6 && Sp.PrairieDog === 7, 'Sp ids match keys (3)');
ok(SPECIES_BY_KEY.eagle.id === Sp.Eagle && SPECIES_BY_KEY.hawk.id === Sp.Hawk && Sp.Eagle === 8 && Sp.Hawk === 9, 'Sp ids match keys (4)');
ok(SPECIES_BY_KEY.muledeer.id === Sp.MuleDeer && Sp.MuleDeer === 10, 'Sp ids match keys (5)');
ok(SPECIES_BY_KEY.beaver.id === Sp.Beaver && Sp.Beaver === 11, 'Sp ids match keys (6)');
ok(SPECIES[Sp.Beaver].guild === 'engineer' && SPECIES[Sp.Beaver].prey && SPECIES[Sp.Beaver].threat === 0 && SPECIES[Sp.Beaver].repr === 'agent' && !SPECIES[Sp.Beaver].core && !SPECIES[Sp.Beaver].flies, 'beaver registry entry');
ok(isPrey(Sp.Beaver) && !isGrazer(Sp.Beaver) && !isPredator(Sp.Beaver) && !isThreat(Sp.Beaver), 'beaver is prey and nothing else');
ok(canHunt(Sp.Wolf, Sp.Beaver) && !canHunt(Sp.Cougar, Sp.Beaver) && !canHunt(Sp.Coyote, Sp.Beaver), 'wolves hunt beavers (on land: sim.ts), nobody else does');
ok(SPECIES[Sp.MuleDeer].guild === 'browser' && SPECIES[Sp.MuleDeer].prey && SPECIES[Sp.MuleDeer].threat === 0 && SPECIES[Sp.MuleDeer].repr === 'agent' && !SPECIES[Sp.MuleDeer].core, 'mule deer registry entry');
ok(isGrazer(Sp.MuleDeer) && isPrey(Sp.MuleDeer) && !isPredator(Sp.MuleDeer) && !isThreat(Sp.MuleDeer), 'mule deer is a browsing prey animal');
ok(canHunt(Sp.Wolf, Sp.MuleDeer) && canHunt(Sp.Cougar, Sp.MuleDeer) && !canHunt(Sp.Coyote, Sp.MuleDeer), 'wolves and cougars hunt mule deer');
ok(DIET[Sp.Cougar][Sp.MuleDeer] > DIET[Sp.Cougar][Sp.Deer] && DIET[Sp.Cougar][Sp.Deer] > DIET[Sp.Cougar][Sp.Bison] && DIET[Sp.Cougar][Sp.Bison] > 0, 'cougar prefers mule deer, then pronghorn, then bison calves');
ok([Sp.Eagle, Sp.Hawk].every((s) => SPECIES[s].repr === 'agent' && SPECIES[s].guild === 'raptor' && SPECIES[s].flies && SPECIES[s].threat === 0 && !SPECIES[s].prey && !SPECIES[s].core), 'eagle and hawk: flying raptor agents, no threat to grazers, not core');
ok([Sp.Eagle, Sp.Hawk].every((s) => isPredator(s) && !isThreat(s) && !isGrazer(s) && !isPrey(s)), 'raptors are predators in the registry but not in the predator grid');
ok(SPECIES_BY_KEY.rabbit.repr === 'field' && SPECIES_BY_KEY.prairiedog.repr === 'field' && SPECIES_BY_KEY.coyote.repr === 'agent', 'field and agent species');
ok(SPECIES_BY_KEY.coyote.guild === 'mesopredator' && SPECIES_BY_KEY.coyote.threat === 0.3 && !SPECIES_BY_KEY.coyote.flies, 'coyote registry entry');
ok(isPredator(Sp.Coyote) && isThreat(Sp.Coyote) && !isGrazer(Sp.Coyote), 'coyote is a mesopredator threat');
ok(new Set(SPECIES.map((d) => d.key)).size === SPECIES.length, 'keys are unique');
ok(SPECIES.every((d) => /^#[0-9A-Fa-f]{6}$/.test(d.color)), 'colours are hex');
ok(DIET.length === SPECIES_COUNT && DIET.every((r) => r.length === SPECIES_COUNT), 'DIET is square');
ok(COAT_BASE.length >= SPECIES_COUNT && COAT_RANGE.length >= SPECIES_COUNT, 'coat tables cover every species');
ok(PARAM_PREFIX.join() === 'bison,wolf,raven,deer,rabbit,cougar,coyote,prairiedog,eagle,hawk,muledeer,beaver', 'param prefixes keep the v1 names');
const params = defaultParams();
ok(params.species.length === SPECIES_COUNT, 'default params cover every species');
ok(params.species.every((s) => s !== undefined && s.matureAge > 0), 'every species id has a params block (no matureAge of undefined)');
ok(params.species[Sp.Coyote].maxAge === 4800 && params.species[Sp.Coyote].initial === 12 && params.species[Sp.PrairieDog].initial === 0, 'v6b: 12 coyote founders, prairie dogs start empty (their founders are the web fields)');
ok(params.raptors === 0 && params.species[Sp.Eagle].initial === 0 && params.species[Sp.Hawk].initial === 0, 'S7 params are off by default and no raptor founders');
ok(params.smallPrey === 1 && params.smallGameField === 1 && params.dogClip === 0 && params.dogGrazeBonus === 0, 'v6b: smallPrey and smallGameField are on by default, dogClip and dogGrazeBonus stay off');

// roles
ok([Sp.Bison, Sp.Deer, Sp.Rabbit].every((s) => isGrazer(s) && isPrey(s)), 'grazers are prey');
ok([Sp.Wolf, Sp.Cougar].every((s) => isPredator(s) && isThreat(s) && !isPrey(s)), 'wolf and cougar are threats');
ok(!isGrazer(Sp.Raven) && !isPredator(Sp.Raven) && !isThreat(Sp.Raven) && SPECIES[Sp.Raven].flies, 'raven flies and threatens nobody');
ok(canHunt(Sp.Wolf, Sp.Bison) && canHunt(Sp.Wolf, Sp.Deer) && canHunt(Sp.Cougar, Sp.Deer), 'predators hunt grazers');
ok(!canHunt(Sp.Wolf, Sp.Raven) && !canHunt(Sp.Wolf, Sp.Cougar) && !canHunt(Sp.Bison, Sp.Deer), 'no other hunting');

// contract additions
ok(St.Migrate === 11 && STATE_NAMES[St.Migrate] === 'migrating', 'St.Migrate');
ok(St.Swim === 12 && STATE_NAMES[St.Swim] === 'swimming' && St.Build === 13 && STATE_NAMES[St.Build] === 'building', 'St.Swim and St.Build (S14)');
ok(F_MANGE === 32 && F_MIGRANT === 64 && F_STOT === 128, 'flag bits');
ok(AGENT_STRIDE === 12, 'snapshot stride unchanged');

// new agent fields start at zero, survive pool growth, and reset on respawn
const pool = new Agents(4);
const i0 = pool.spawn();
pool.origin[i0] = 2;
pool.cdv[i0] = 300;
pool.mange[i0] = 0.5;
for (let k = 0; k < 20; k++) pool.spawn(); // grows the pool several times
ok(pool.cap >= 21 && pool.origin[i0] === 2 && pool.cdv[i0] === 300 && Math.abs(pool.mange[i0] - 0.5) < 1e-6, 'new fields copied when the pool grows');
pool.kill(i0);
const i1 = pool.spawn();
ok(i1 === i0 || pool.origin[i1] === 0, 'respawn is reset (slot reuse)');
for (let k = 0; k < 30; k++) {
  const j = pool.spawn();
  ok(pool.origin[j] === 0 && pool.cdv[j] === 0 && pool.mange[j] === 0, 'spawned agent has zeroed new fields');
}

// event serial: total events ever emitted, so consumers survive the sim trimming its array
const sim = createSim({ seed: 1 });
const emit = (sim as unknown as { event(kind: string, sp: number, x: number, y: number, a: number, b: number): void }).event.bind(sim);
const before = sim.eventSerial;
let seen = before;
let collected = 0;
for (let k = 0; k < 9000; k++) {
  emit('record', 0, 0, 0, k, 0);
  if (k % 700 === 699) {
    const base = sim.eventSerial - sim.events.length;
    const fresh = sim.events.slice(Math.max(0, seen - base));
    collected += fresh.length;
    seen = sim.eventSerial;
  }
}
ok(sim.eventSerial === before + 9000, 'eventSerial counts every event');
ok(sim.events.length <= 4000, 'events array is still trimmed');
ok(collected + (sim.eventSerial - seen) === 9000, 'serial cursor loses no events across trims (polled every 700)');

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`species registry: all ${checks} checks passed`);
