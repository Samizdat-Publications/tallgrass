// Share codes (S16): round trip, bad input, build warning, and that replaying a log rebuilds the same valley.
// Run: npx tsx src/sim/sharecode.test.ts
import { decodeShare, encodeShare, LoggedIntervention, SHARE_VERSION, shareUrl, simBuildId } from './sharecode';
import { createSim, Sim } from './sim';
import type { Intervention } from './types';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// ---- codec ----
const log: LoggedIntervention[] = [
  { tick: 120, iv: { kind: 'introduce', species: 1, count: 6, x: 201.123456, y: 99.5 } },
  { tick: 120, iv: { kind: 'rain', ticks: 300 } },
  { tick: 900, iv: { kind: 'cull', species: 0, fraction: 0.3 } },
  { tick: 1500, iv: { kind: 'fire', x: 300, y: 250 } },
];
const state = { seed: 4242, scenario: 'prairie', params: { calendarScale: 2, openPrairie: 1 }, log };
const code = encodeShare(state);
ok(/^[A-Za-z0-9_-]+$/.test(code), `code is base64url: ${code.slice(0, 40)}`);
const back = decodeShare(code);
ok(back.warning === undefined, 'same build: no warning');
ok(back.state.seed === 4242 && back.state.scenario === 'prairie', 'seed and scenario');
ok(back.state.params.openPrairie === 1 && back.state.params.calendarScale === 2, 'params');
ok(back.state.log.length === 4, 'log length');
ok(back.state.log[0].iv.kind === 'introduce' && back.state.log[1].iv.kind === 'rain', 'same-tick order kept');
ok((back.state.log[0].iv as { x: number }).x === 201.1235, 'floats tidied to 4 decimals');

for (const bad of ['', 'hello', '!!!', btoa('{"x":1}'), btoa('[1,2]')]) {
  let threw = false;
  try {
    decodeShare(bad);
  } catch {
    threw = true;
  }
  ok(threw, `bad code "${bad}" throws`);
}

// junk in the log is dropped, not fatal
const junk = btoa(JSON.stringify({ v: SHARE_VERSION, b: simBuildId(), seed: 1, scenario: 'x', params: { a: 'no', c: 2 }, log: [[5, { kind: 'nuke' }], 'x', [7, { kind: 'rain', ticks: 10 }]] }))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const j = decodeShare(junk);
ok(j.state.log.length === 1 && j.state.log[0].tick === 7, 'unknown interventions dropped');
ok(j.state.params.c === 2 && !('a' in j.state.params), 'non-numeric params dropped');

const other = btoa(JSON.stringify({ v: SHARE_VERSION, b: 'deadbeef', seed: 1, scenario: 'prairie', params: {}, log: [] }));
ok(!!decodeShare(other).warning, 'different build warns');
const newer = btoa(JSON.stringify({ v: SHARE_VERSION + 1, b: simBuildId(), seed: 1, scenario: 'prairie', params: {}, log: [] }));
ok(/newer/.test(decodeShare(newer).warning ?? ''), 'newer format warns');

const url = shareUrl('https://example.org/index.html?seed=9&scenario=foo&q=high', state);
const u = new URL(url);
ok(!u.searchParams.has('seed') && !u.searchParams.has('scenario') && u.searchParams.get('q') === 'high', 'url keeps settings, drops world params');
ok(decodeShare(u.searchParams.get('w')!).state.seed === 4242, 'url round trip');

// ---- replay determinism: live applies vs the worker's schedule (same order as worker.ts record()) ----
function fingerprint(sim: Sim): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => (h = Math.imul(h ^ (v >>> 0), 0x01000193) >>> 0);
  const f = new Float32Array(1), u32 = new Uint32Array(f.buffer);
  for (const p of sim.populations()) mix(p);
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i]) { mix(i); f[0] = sim.a.x[i]; mix(u32[0]); f[0] = sim.a.energy[i]; mix(u32[0]); }
  return h.toString(16);
}
const TICKS = 2400;
const seed = 7;
// live: the player applies between steps, after the step that reaches the tick
const live = createSim({ seed });
const liveLog: LoggedIntervention[] = [];
const plan = new Map<number, Intervention[]>([
  [0, [{ kind: 'rain', ticks: 200 }]],
  [300, [{ kind: 'introduce', species: 1, count: 4, x: 250, y: 250 }, { kind: 'cull', species: 0, fraction: 0.2 }]],
  [1777, [{ kind: 'fire', x: 260, y: 240 }]],
]);
const applyLive = () => {
  for (const iv of plan.get(live.tick) ?? []) {
    liveLog.push({ tick: live.tick, iv });
    live.apply(iv);
  }
};
applyLive();
for (let t = 0; t < TICKS; t++) {
  live.step(1);
  applyLive();
}
// replay: decode the share code and run the worker's schedule loop
const decoded = decodeShare(encodeShare({ seed, scenario: 'prairie', params: {}, log: liveLog })).state;
const replay = createSim({ seed, params: decoded.params });
const schedule = decoded.log.slice();
const record = () => {
  while (schedule.length && replay.tick >= schedule[0].tick) replay.apply(schedule.shift()!.iv);
};
record();
for (let t = 0; t < TICKS; t++) {
  replay.step(1);
  record();
}
ok(fingerprint(live) === fingerprint(replay), `replay matches live (${fingerprint(live)} vs ${fingerprint(replay)})`);
const untouched = createSim({ seed });
untouched.step(TICKS);
ok(fingerprint(untouched) !== fingerprint(live), 'interventions changed the valley (the test can fail)');

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
