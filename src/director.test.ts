// Unit tests for the documentary director's moments (a field note earned, a headline event): the cut lands within a couple of seconds, it
// frames the subject by size, it holds long enough to read, and a player who has taken the camera is never pulled away.
// Run: npx tsx src/director.test.ts
import * as THREE from 'three';
import { Director, type DirectorFrame } from './director';
import { AGENT_STRIDE, CARCASS_STRIDE, Sp, St } from './sim/types';
import type { DroneCamera } from './render/camera';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

/** The few DroneCamera members the director touches, recording what it was asked to do. */
class StubCam {
  distance = 400;
  yawDeg = 0;
  followSmoothTime = 0.4;
  followDeadzone = 0.055;
  views: Array<{ x?: number; y?: number; distance?: number; h?: number }> = [];
  following = false;
  focus = new THREE.Vector3(256, 0, 256);
  follow(fn: unknown): void { this.following = fn !== null; }
  setView(o: { x?: number; y?: number; distance?: number; h?: number }): void {
    this.views.push(o);
    if (o.distance !== undefined) this.distance = o.distance;
    if (o.x !== undefined) this.focus.x = o.x;
    if (o.y !== undefined) this.focus.z = o.y;
  }
  setCinematic(): void {}
  easeIn(): void {}
  getFocus(out: THREE.Vector3): THREE.Vector3 { return out.copy(this.focus); }
  groundAt(): number { return 0; }
  headingReach(): number { return 1; }
}

/** A frame with the given agents [species, x, y, state] and carcasses [x, y, fresh, species]. */
function frame(agents: number[][], carcasses: number[][] = [], extra: Partial<DirectorFrame> = {}): DirectorFrame {
  const a = new Float32Array(agents.length * AGENT_STRIDE);
  const ids = new Uint32Array(agents.length);
  agents.forEach((g, k) => {
    a[k * AGENT_STRIDE] = g[0]; a[k * AGENT_STRIDE + 1] = g[1]; a[k * AGENT_STRIDE + 2] = g[2]; a[k * AGENT_STRIDE + 7] = g[3] ?? St.Idle;
    ids[k] = 100 + k;
  });
  const c = new Float32Array(carcasses.length * CARCASS_STRIDE);
  carcasses.forEach((g, k) => g.forEach((v, j) => { c[k * CARCASS_STRIDE + j] = v; }));
  return { count: agents.length, ids, agents: a, carcassCount: carcasses.length, carcasses: c, dayFrac: 0.4, ...extra };
}

function make(agents: number[][]): { d: Director; cam: StubCam; positions: Map<number, [number, number]> } {
  const cam = new StubCam();
  const positions = new Map<number, [number, number]>();
  agents.forEach((g, k) => positions.set(100 + k, [g[1], g[2]]));
  const d = new Director(cam as unknown as DroneCamera, (id, out) => { const p = positions.get(id); if (!p) return false; out.set(p[0], 0, p[1]); return true; }, 512);
  return { d, cam, positions };
}

/** Run the director for `seconds` of 0.1 s frames; returns the seconds until the current shot became a moment (or -1). */
function runUntilMoment(d: Director, f: DirectorFrame, seconds: number): number {
  for (let t = 0; t < seconds; t += 0.1) {
    d.update(0.1, f);
    if (d.current?.moment) return t + 0.1;
  }
  return -1;
}

// a coyote alone (a mousing leap), far from the camera: a close shot of it, within two seconds, 8 to 20 m
{
  const agents = [[Sp.Coyote, 90, 80, St.Stalk], [Sp.Bison, 300, 300, St.Graze], [Sp.Bison, 305, 300, St.Graze]];
  const { d } = make(agents);
  d.setEnabled(true);
  const f = frame(agents);
  d.update(0.1, f); // the first shot, whatever it is
  d.noteEarned('mousingLeap');
  const t = runUntilMoment(d, f, 6);
  ok(t > 0 && t <= 2.6, `a note cuts to the coyote within a couple of seconds (took ${t.toFixed(1)} s)`);
  ok(d.current?.id === 100, 'the shot follows the coyote');
  ok(d.current !== null && d.current.dist >= 8 && d.current.dist <= 20, `a coyote is framed close, 8 to 20 m (got ${d.current?.dist.toFixed(1)})`);
}

// a kill: the carcass with the ravens on it, medium, not the empty sky or the carcass with nothing on it
{
  const agents = [[Sp.Raven, 200, 200, St.Eat], [Sp.Raven, 203, 201, St.Eat], [Sp.Raven, 198, 199, St.Fly], [Sp.Wolf, 400, 400, St.Idle]];
  const carcasses = [[50, 50, 0.9, Sp.Deer], [200, 200, 0.7, Sp.Bison]];
  const { d } = make(agents);
  d.setEnabled(true);
  const f = frame(agents, carcasses);
  d.update(0.1, f);
  d.noteEarned('firstKill');
  const t = runUntilMoment(d, f, 6);
  ok(t > 0 && t <= 2.6, `a kill note cuts within a couple of seconds (took ${t.toFixed(1)} s)`);
  const s = d.current;
  ok(s !== null && s.id === null && Math.hypot(s.x - 200, s.y - 200) < 1, 'the shot is on the carcass the ravens are on');
  ok(s !== null && s.dist >= 28 && s.dist <= 60, `a bison kill is a medium shot, 30 to 60 m (got ${s?.dist.toFixed(1)})`);
  ok(s !== null && (s.lift ?? 0) > 0, 'the carcass is framed a little above the dirt');
}

// the moment holds for reading (about 6 to 10 s), and is not cut away from by a hunt
{
  const agents = [[Sp.Coyote, 90, 80, St.Stalk], [Sp.Wolf, 300, 300, St.Chase], [Sp.Deer, 310, 300, St.Flee]];
  const { d } = make(agents);
  d.setEnabled(true);
  const f = frame(agents);
  d.update(0.1, f);
  d.noteEarned('coyotePups');
  let t0 = -1;
  for (let t = 0; t < 4; t += 0.1) { d.update(0.1, f); if (d.current?.moment) { t0 = t; break; } }
  ok(t0 >= 0, 'the moment starts');
  let held = 0;
  for (let t = 0; t < 14; t += 0.1) {
    d.update(0.1, f);
    if (!d.current?.moment) break;
    held = t + 0.1;
  }
  ok(held >= 6 && held <= 10, `the moment holds 6 to 10 s (held ${held.toFixed(1)}), hunts included`);
}

// a player who takes the camera: nothing queued pulls it away, and nothing is queued while the director is off
{
  const agents = [[Sp.Coyote, 90, 80, St.Stalk]];
  const { d, cam } = make(agents);
  d.setEnabled(true);
  const f = frame(agents);
  d.update(0.1, f);
  d.noteEarned('mousingLeap');
  d.setEnabled(false); // Take over
  cam.views.length = 0;
  for (let t = 0; t < 6; t += 0.1) d.update(0.1, f);
  ok(cam.views.length === 0, 'a queued cut never moves the camera after the player takes over');
  d.noteEarned('mousingLeap'); // ignored while the player has the camera
  d.setEnabled(true);
  d.update(0.1, f);
  d.noteEarned('mousingLeap');
  ok(runUntilMoment(d, f, 5) > 0, 'once the director is on again, a new note cuts as usual');
}

// a note with no place (a drought) does nothing; an animal that is not there is dropped quietly
{
  const agents = [[Sp.Bison, 300, 300, St.Graze]];
  const { d } = make(agents);
  d.setEnabled(true);
  const f = frame(agents);
  d.update(0.1, f);
  d.noteEarned('drought');
  d.noteEarned('mousingLeap'); // no coyote in the valley
  const t = runUntilMoment(d, f, 5);
  ok(t < 0, 'no moment without a subject');
}

// a prairie dog town: the alarm wave frames the dogs (the town cells), not a point off to the side
{
  const small = new Uint8Array(32 * 32 * 4);
  // a town of 3 x 3 cells around cell (20, 10): 16 m cells, so its middle is near (328, 168)
  for (let cy = 9; cy <= 11; cy++) for (let cx = 19; cx <= 21; cx++) { const c = cy * 32 + cx; small[c * 4 + 1] = 120; small[c * 4 + 2] = 200; }
  const agents = [[Sp.Bison, 60, 60, St.Graze]];
  const { d } = make(agents);
  d.setEnabled(true);
  const f = frame(agents, [], { small });
  d.update(0.1, f);
  d.markWhere('alarm', 330, 170);
  d.noteEarned('alarmWave');
  const t = runUntilMoment(d, f, 6);
  const s = d.current;
  ok(t > 0 && s !== null && Math.hypot(s.x - 330, s.y - 170) < 20, 'the alarm wave shot is on the town');
  ok(s !== null && s.dist >= 17 && s.dist <= 40, `the town is framed close enough to see the dogs (got ${s?.dist.toFixed(1)})`);
}

console.log(failures === 0 ? `ok: ${checks} director checks` : `${failures} of ${checks} director checks FAILED`);
process.exit(failures === 0 ? 0 : 1);
