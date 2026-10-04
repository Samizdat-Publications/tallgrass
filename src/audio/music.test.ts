// Unit tests for the music policy (pure) and the R14 additions to the ambience mix. Run: npx tsx src/audio/music.test.ts
import { Weather, AGENT_STRIDE, CARCASS_STRIDE, Sp, St } from '../sim/types';
import { bedMix, craneWeight, rutWeight, spotPlan } from './mix';
import type { MixEnv, Nearby } from './mix';
import { scanTension } from './inputs';
import { MusicPolicy, T_ENTER, baseCue, eventPulse, prefetchAfter, tensionTarget } from './music';
import type { MusicFrame, TensionSample } from './music';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const env = (over: Partial<MixEnv> = {}): MixEnv => ({ season: 1.5, dayFrac: 0.5, weather: Weather.Clear, rain: 0, windStrength: 0.4, warmth: 0.8, ...over });
const calm: TensionSample = { chasing: 0, fleeing: 0, stalking: 0, chasingWorld: 0, fresh: 0, freshWorld: 0 };
const hunt: TensionSample = { chasing: 5, fleeing: 30, stalking: 1, chasingWorld: 6, fresh: 3, freshWorld: 4 };
const none: Nearby = { bison: 0, wolf: 0, raven: 0, pronghorn: 0 };
const herd: Nearby = { bison: 20, wolf: 0, raven: 0, pronghorn: 0 };

// ---- base cue by clock, season and weather
ok(baseCue(env({ dayFrac: 0.25 })) === 'dawn', 'sunrise: dawn cue');
ok(baseCue(env({ dayFrac: 0.2 })) === 'dawn' && baseCue(env({ dayFrac: 0.32 })) === 'dawn', 'dawn window 0.20 to 0.33');
ok(baseCue(env({ dayFrac: 0.5 })) === 'day', 'noon: day cue');
ok(baseCue(env({ dayFrac: 0.75 })) === 'day', 'sunset: still the day cue');
ok(baseCue(env({ dayFrac: 0.9 })) === 'night' && baseCue(env({ dayFrac: 0.05 })) === 'night', 'night cue after 0.80 and before 0.20');
ok(baseCue(env({ season: 3.5, dayFrac: 0.5 })) === 'storm', 'winter day: the bleak cue');
ok(baseCue(env({ season: 3.5, dayFrac: 0.0 })) === 'night', 'winter night: night cue');
ok(baseCue(env({ weather: Weather.Storm, rain: 0.7 })) === 'storm', 'storm: storm cue');
ok(baseCue(env({ weather: Weather.Storm, rain: 0.7, dayFrac: 0.0 })) === 'storm', 'storm at night: storm cue');
ok(baseCue(env({ weather: Weather.Snow, windStrength: 0.8, season: 3.2 })) === 'storm', 'blizzard: storm cue');
ok(baseCue(env({ weather: Weather.Rain, rain: 0.6 })) === 'day', 'plain rain keeps the day cue');
ok(baseCue(env({ dayFrac: -0.1 })) === 'night' && baseCue(env({ dayFrac: 2.5 })) === 'day', 'dayFrac wraps');

// ---- tension target
ok(tensionTarget(null, env(), 1) === 0 && tensionTarget(calm, env(), 1) === 0, 'calm world: zero tension');
const th = tensionTarget(hunt, env(), 1);
ok(th > 0.6 && th <= 1, 'a hunt near the camera is high tension (' + th.toFixed(2) + ')');
ok(tensionTarget({ ...calm, chasing: 1 }, env(), 1) < T_ENTER, 'one chaser is not enough to leave the day cue');
ok(tensionTarget(hunt, env(), 100) < th && Math.abs(tensionTarget(hunt, env(), 100) - th * 0.6) < 1e-9, 'fast forward: tension scaled to 0.6');
ok(tensionTarget(calm, env({ weather: Weather.Storm, rain: 1 }), 1) >= 0.3, 'a storm alone is a little tense');
ok(tensionTarget({ ...calm, fresh: 6, freshWorld: 10 }, env(), 1) > 0.3, 'a die-off (fresh carcasses) raises tension');
ok(baseCue(env({ dayFrac: 0.9 }), true) === 'day' && baseCue(env({ weather: Weather.Storm, rain: 0.8 }), true) === 'storm', 'fast forward holds the day cue but still follows a storm');

// ---- the state machine
function run(policy: MusicPolicy, seconds: number, f: MusicFrame, dt = 0.25): string[] {
  const seen: string[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const r = policy.step(dt, f);
    if (r.changed) seen.push(r.cue + ':' + r.reason);
  }
  return seen;
}
{
  const p = new MusicPolicy();
  const first = p.step(0.25, { env: env({ dayFrac: 0.25 }), speed: 1, tension: calm });
  ok(first.changed && first.cue === 'dawn' && first.reason === 'start', 'first step starts on the base cue');
  // time of day moves the cue, but only after the dwell time
  let ch = run(p, 15, { env: env({ dayFrac: 0.5 }), speed: 1, tension: calm });
  ok(ch.length === 0, 'no cue change before the 20 s dwell');
  ch = run(p, 10, { env: env({ dayFrac: 0.5 }), speed: 1, tension: calm });
  ok(ch.length === 1 && ch[0].startsWith('day'), 'dawn becomes day after the dwell: ' + ch.join());
  // a hunt: tension rises, the cue goes to tension (4 s crossfade), and returns after it eases
  ch = run(p, 30, { env: env({ dayFrac: 0.5 }), speed: 1, tension: hunt });
  ok(ch.length === 1 && ch[0].startsWith('tension'), 'hunt switches to the tension cue: ' + ch.join());
  ok(p.tension > 0.5, 'smoothed tension is high during the hunt (' + p.tension.toFixed(2) + ')');
  ch = run(p, 10, { env: env({ dayFrac: 0.5 }), speed: 1, tension: calm });
  ok(ch.length === 0, 'tension falls slowly: still the tension cue 10 s after the hunt ends');
  ch = run(p, 60, { env: env({ dayFrac: 0.5 }), speed: 1, tension: calm });
  ok(ch.length === 1 && ch[0].startsWith('day'), 'and it hands back to the base cue: ' + ch.join());
  ok(p.tension < 0.28, 'tension below the exit threshold (' + p.tension.toFixed(2) + ')');
}
{
  // a flapping clock (100x) does not flap the music: at most one change per 60 s
  const p = new MusicPolicy();
  let changes = 0;
  let t = 0;
  for (let i = 0; i < 2400; i++) { // 600 s, the day cycling every 12 s
    const r = p.step(0.25, { env: env({ dayFrac: (t / 12) % 1 }), speed: 100, tension: calm });
    if (r.changed) changes++;
    t += 0.25;
  }
  ok(changes <= 1 + 600 / 60, 'fast clock: at most one change per 60 s (' + changes + ')');
}
{
  // a storm takes over quickly, and tension has to be extreme to override it
  const p = new MusicPolicy();
  p.step(0.25, { env: env(), speed: 1, tension: calm });
  const ch = run(p, 12, { env: env({ weather: Weather.Storm, rain: 0.8 }), speed: 1, tension: calm });
  ok(ch.length === 1 && ch[0].startsWith('storm'), 'storm cue within 12 s of the storm: ' + ch.join());
  const q = new MusicPolicy();
  q.step(0.25, { env: env({ weather: Weather.Storm, rain: 0.8 }), speed: 1, tension: calm });
  const c2 = run(q, 60, { env: env({ weather: Weather.Storm, rain: 0.8 }), speed: 1, tension: { ...calm, chasing: 1, fleeing: 2 } });
  ok(c2.length === 0, 'a modest chase does not break the storm cue');
}
{
  // event pulses: a stampede alone pushes tension over the threshold, then decays
  const p = new MusicPolicy();
  p.step(0.25, { env: env(), speed: 1, tension: calm });
  p.addPulse(eventPulse('stampede', 30));
  p.addPulse(eventPulse('firstKill', 1));
  p.step(0.25, { env: env(), speed: 1, tension: calm });
  ok(p.tension > T_ENTER, 'stampede plus a kill raises tension past the threshold (' + p.tension.toFixed(2) + ')');
  run(p, 120, { env: env(), speed: 1, tension: calm });
  ok(p.tension < 0.1, 'pulse decays within two minutes');
  ok(eventPulse('drought', 0) === 0 && eventPulse('stampede', 30) > eventPulse('stampede', 3), 'eventPulse shape');
  ok(prefetchAfter('dawn') === 'day' && prefetchAfter('day') === 'night' && prefetchAfter('night') === 'dawn' && prefetchAfter('storm') === null, 'prefetch order');
}

{
  // tension fatigue: a world that never stops pulsing cannot hold the tension cue for more than about 80 s at a time
  const p = new MusicPolicy();
  p.step(0.25, { env: env(), speed: 1, tension: calm });
  const log: Array<[number, string]> = [];
  let t = 0;
  for (let i = 0; i < 4 * 400; i++) {
    if (i % 20 === 0) p.addPulse(0.8);
    const r = p.step(0.25, { env: env(), speed: 1, tension: calm });
    t += 0.25;
    if (r.changed) log.push([Math.round(t), r.cue + ':' + r.reason]);
  }
  const enters = log.filter((l) => l[1].startsWith('tension:'));
  const fatigue = log.filter((l) => l[1].includes('fatigue'));
  ok(enters.length >= 2 && fatigue.length >= 1, 'constant pulses: tension cue enters, tires and returns: ' + JSON.stringify(log));
  ok(fatigue.length === 0 || fatigue[0][0] - enters[0][0] <= 85, 'fatigue hands back within about 80 s');
  ok(enters.length < 2 || enters[1][0] - fatigue[0][0] >= 38, 'and stays out for at least 40 s');
}

// ---- scanTension on a synthetic snapshot
{
  const A = new Float32Array(AGENT_STRIDE * 5);
  const put = (i: number, sp: number, x: number, y: number, st: number) => { A[i * AGENT_STRIDE] = sp; A[i * AGENT_STRIDE + 1] = x; A[i * AGENT_STRIDE + 2] = y; A[i * AGENT_STRIDE + 7] = st; };
  put(0, Sp.Wolf, 100, 100, St.Chase);
  put(1, Sp.Bison, 110, 100, St.Flee);
  put(2, Sp.Wolf, 90, 100, St.Stalk);
  put(3, Sp.Wolf, 450, 450, St.Chase); // far chaser
  put(4, Sp.Bison, 100, 100, St.Graze);
  const C = new Float32Array(CARCASS_STRIDE * 3);
  C.set([100, 100, 1, 0, 400, 400, 0.99, 0, 120, 120, 0.4, 0]); // fresh near, fresh far, old near
  const t = scanTension(A, 5, 100, 100, C, 3, 100);
  ok(t.chasing === 1 && t.fleeing === 1 && t.stalking === 1 && t.chasingWorld === 2, 'scanTension counts states: ' + JSON.stringify(t));
  ok(t.fresh === 1 && t.freshWorld === 2, 'scanTension counts fresh carcasses: ' + JSON.stringify(t));
}

// ---- R14 ambience additions: blizzard, grasshoppers, rut, cranes
{
  const bliz = bedMix(env({ season: 3.5, dayFrac: 0.5, windStrength: 0.95, warmth: 0.05 }), 40, 0);
  const calmWinter = bedMix(env({ season: 3.5, dayFrac: 0.5, windStrength: 0.2, warmth: 0.05 }), 40, 0);
  ok(bliz.blizzard > 0.5, 'winter gale: blizzard bed up (' + bliz.blizzard.toFixed(2) + ')');
  ok(calmWinter.blizzard < 0.05 && calmWinter.winter > 0.2, 'calm winter: no blizzard bed, plain winter wind');
  ok(bliz.winter < bedMix(env({ season: 3.5, dayFrac: 0.5, windStrength: 0.95, warmth: 0.05, weather: Weather.Clear }), 40, 0).winter + 1e-9, 'blizzard bed is sane');
  ok(bedMix(env({ season: 1.5 }), 40, 0).blizzard === 0, 'no blizzard in summer');
  const snow = bedMix(env({ season: 3.2, weather: Weather.Snow, windStrength: 0.7, rain: 0.3, warmth: 0.1 }), 40, 0);
  ok(snow.blizzard > 0.3, 'snow in a good blow: blizzard bed (' + snow.blizzard.toFixed(2) + ')');

  const hop = bedMix(env({ season: 1.5, dayFrac: 0.55, warmth: 0.95, windStrength: 0.1 }), 5, 0);
  ok(hop.grasshopper > 0.5, 'hot dry summer afternoon on the ground: grasshoppers (' + hop.grasshopper.toFixed(2) + ')');
  ok(bedMix(env({ season: 1.5, dayFrac: 0.55, warmth: 0.95, windStrength: 0.1 }), 120, 0).grasshopper === 0, 'camera 120 m up: no grasshoppers');
  ok(bedMix(env({ season: 1.5, dayFrac: 0.0, warmth: 0.95 }), 5, 0).grasshopper === 0, 'no grasshoppers at night');
  ok(bedMix(env({ season: 3.5, dayFrac: 0.55 }), 5, 0).grasshopper === 0, 'no grasshoppers in winter');
  ok(bedMix(env({ season: 1.5, dayFrac: 0.55, rain: 0.8, weather: Weather.Rain }), 5, 0).grasshopper < 0.2 * hop.grasshopper + 0.02, 'rain silences grasshoppers');
  ok(bedMix(env({ season: 1.5, dayFrac: 0.55, warmth: 0.95, weather: Weather.Drought, windStrength: 0.1 }), 5, 0).grasshopper >= hop.grasshopper, 'drought does not quiet them');

  ok(rutWeight(1.8) > 0.9 && rutWeight(0.5) === 0 && rutWeight(3.5) === 0, 'rut weight: late summer only');
  ok(craneWeight(0.2) > 0.9 && craneWeight(2.3) > 0.9 && craneWeight(1.5) === 0 && craneWeight(3.0) === 0, 'crane weight: spring and autumn');
  ok(craneWeight(3.95) > 0 && craneWeight(4.2) === craneWeight(0.2), 'crane weight straddles the year wrap');
  const rutPlan = spotPlan(env({ season: 1.8 }), 20, herd, 1);
  ok(Number.isFinite(rutPlan.rut.mean) && rutPlan.rut.mean < 60, 'rut: bellows when a herd is near in late summer');
  ok(!Number.isFinite(spotPlan(env({ season: 1.8 }), 20, none, 1).rut.mean), 'rut: silent with no bison near');
  ok(!Number.isFinite(spotPlan(env({ season: 0.5 }), 20, herd, 1).rut.mean), 'rut: silent in spring');
  ok(!Number.isFinite(spotPlan(env({ season: 1.8 }), 300, herd, 1).rut.mean), 'rut: silent from high above');
  ok(Number.isFinite(spotPlan(env({ season: 0.2 }), 300, none, 1).crane.mean), 'cranes: spring flyovers anywhere, from any height');
  ok(Number.isFinite(spotPlan(env({ season: 2.3 }), 30, none, 1).crane.mean), 'cranes: autumn flyovers');
  ok(!Number.isFinite(spotPlan(env({ season: 1.5 }), 30, none, 1).crane.mean), 'cranes: none in summer');
  ok(!Number.isFinite(spotPlan(env({ season: 0.2, dayFrac: 0.0 }), 30, none, 1).crane.mean), 'cranes: none at night');
  ok(!Number.isFinite(spotPlan(env({ season: 2.3, weather: Weather.Storm, rain: 0.8 }), 30, none, 1).crane.mean), 'cranes: none in a storm');
  ok(!Number.isFinite(spotPlan(env({ season: 2.3 }), 30, none, 0).crane.mean), 'cranes: silent when paused');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
