// Unit tests for the documentary director's moments (a field note earned, a headline event): the cut lands within a couple of seconds, it
// frames the subject by size, it holds long enough to read, and a player who has taken the camera is never pulled away.
// Run: npx tsx src/director.test.ts
import * as THREE from 'three';
import { Director, type DirectorFrame } from './director';
import { AGENT_STRIDE, CARCASS_STRIDE, F_STOT, Sp, St } from './sim/types';
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
  cinematicAuto = true;
  /** A real three camera, when a test wants the director to check shots against the frame (look() points it). */
  camera: THREE.PerspectiveCamera | undefined;
  frames: unknown[] = [];
  follow(fn: unknown, frame?: unknown): void { this.following = fn !== null; this.frames.push(frame); }
  look(from: [number, number, number], at: [number, number, number]): void {
    const c = new THREE.PerspectiveCamera(50, 16 / 9, 0.25, 3000);
    c.position.set(...from);
    c.lookAt(...at);
    c.updateMatrixWorld();
    this.camera = c;
  }
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

/** A frame with the given agents [species, x, y, state, heading (rad), speed (m/s), flags] and carcasses [x, y, fresh, species]. */
function frame(agents: number[][], carcasses: number[][] = [], extra: Partial<DirectorFrame> = {}): DirectorFrame {
  const a = new Float32Array(agents.length * AGENT_STRIDE);
  const ids = new Uint32Array(agents.length);
  agents.forEach((g, k) => {
    a[k * AGENT_STRIDE] = g[0]; a[k * AGENT_STRIDE + 1] = g[1]; a[k * AGENT_STRIDE + 2] = g[2]; a[k * AGENT_STRIDE + 7] = g[3] ?? St.Idle;
    a[k * AGENT_STRIDE + 3] = g[4] ?? 0; a[k * AGENT_STRIDE + 4] = g[5] ?? 0; a[k * AGENT_STRIDE + 8] = g[6] ?? 0;
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

// ---------------------------------------------------------------------------------------------------------------------
// R-director3: motion shots, show what you say, time-lapse drone moves

/** Run `seconds` of 0.1 s frames of the same frame. */
function run(d: Director, f: DirectorFrame, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) d.update(0.1, f);
}
const angDiff = (a: number, b: number): number => Math.abs(((a - b) % 360 + 540) % 360 - 180);
/** Restart the director until its pick is a hunt (picks are random, 8 in 100 are not motion), at most `n` times. */
function startHunt(d: Director, f: DirectorFrame, n = 30): void {
  for (let i = 0; i < n && d.current?.kind !== 'hunt'; i++) { d.setEnabled(false); d.setEnabled(true); d.update(0.1, f); }
}

// a wolf chasing a pronghorn beside a grazing bison herd: the chase is filmed (not the herd), as a tracking shot alongside the wolf
// that keeps both animals: 18 to 40 m, low, to the side and a little ahead of the heading
{
  const grazers: number[][] = [];
  for (let i = 0; i < 6; i++) grazers.push([Sp.Bison, 360 + i * 4, 380, St.Graze, 0, 0.3]);
  const agents = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 225, 200, St.Flee, 0, 14], ...grazers];
  let hunts = 0, checked = 0;
  const { d, cam } = make(agents);
  d.setEnabled(true);
  const f = frame(agents, [], { speed: 1 });
  for (let i = 0; i < 24; i++) {
    d.setEnabled(false); d.setEnabled(true);
    d.update(0.1, f);
    const s = d.current;
    if (s?.kind === 'hunt') {
      hunts++;
      if (checked++ === 0) {
        ok(s.id === 100 && s.prey === 101, 'the hunt follows the wolf and names the pronghorn it is after');
        ok(s.track !== undefined && s.track.baseDist >= 18 && s.track.baseDist <= 40, `a tracking shot runs 18 to 40 m from the animal (got ${s.track?.baseDist.toFixed(1)})`);
        ok(s.pitch <= 8, `the tracking camera is low, a rider's eye height (pitch ${s.pitch.toFixed(1)})`);
        const behind = (Math.atan2(-Math.cos(0), -Math.sin(0)) * 180) / Math.PI; // the wolf runs along +x: behind it is -90 degrees
        const off = angDiff(s.yaw, behind);
        ok(off >= 90 && off <= 118, `the camera is alongside and a little ahead (${off.toFixed(0)} degrees round from behind)`);
        ok(cam.cinematicAuto === false, 'cinematic sway is off while a tracking shot steers itself');
        ok(cam.frames.length > 0 && cam.frames[cam.frames.length - 1] !== undefined, 'the camera is given a framed follow');
      }
    }
  }
  ok(hunts >= 18, `the chase beats the grazing herd nearly every time (${hunts} of 24)`);
}

// a paused sim has no running to film (the animals stand still in the snapshot)
{
  const agents = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 235, 200, St.Flee, 0, 14], [Sp.Bison, 360, 380, St.Graze, 0, 0.3]];
  const { d } = make(agents);
  d.setEnabled(true);
  d.update(0.1, frame(agents, [], { speed: 0 }));
  ok(d.current !== null && d.current.kind !== 'hunt' && d.current.kind !== 'run' && d.current.kind !== 'stampede', 'nothing is tracked while the sim is paused');
}

// a stampede: the lead bison (the one farthest along the herd's heading) is the one filmed
{
  const agents: number[][] = [];
  for (let i = 0; i < 12; i++) agents.push([Sp.Bison, 150 + i * 3, 250 + (i % 3) * 2, St.Flee, 0, 10]);
  const { d } = make(agents);
  d.setEnabled(true);
  let kind = '', id = -1;
  for (let i = 0; i < 12 && kind !== 'stampede'; i++) { d.setEnabled(false); d.setEnabled(true); d.update(0.1, frame(agents, [], { speed: 1 })); kind = d.current?.kind ?? ''; id = d.current?.id ?? -1; }
  ok(kind === 'stampede', 'a running herd of bison is a stampede shot');
  ok(id === 111, `the lead bison is filmed (got id ${id})`);
  ok(d.current !== null && d.current.track !== undefined && d.current.track.baseDist >= 26 && d.current.track.baseDist <= 40, 'a bison stampede is tracked from the larger distance, 26 to 40 m');
}

// a mule deer stotting is tracked
{
  const agents = [[Sp.MuleDeer, 200, 200, St.Flee, 1, 9, F_STOT], [Sp.Bison, 360, 380, St.Graze, 0, 0.3]];
  const { d } = make(agents);
  d.setEnabled(true);
  let n = 0;
  for (let i = 0; i < 20; i++) { d.setEnabled(false); d.setEnabled(true); d.update(0.1, frame(agents, [], { speed: 1 })); if (d.current?.kind === 'run' && d.current.id === 100) n++; }
  ok(n >= 16, `a stotting mule deer is tracked (${n} of 20)`);
}

// the tracking shot ends when the animal stops (after its minimum), and not before
{
  const moving = [[Sp.Deer, 200, 200, St.Run, 0, 14], [Sp.Deer, 205, 203, St.Run, 0, 13]];
  const stopped = [[Sp.Deer, 200, 200, St.Graze, 0, 0], [Sp.Deer, 205, 203, St.Graze, 0, 0]];
  const { d } = make(moving);
  d.setEnabled(true);
  const fm = frame(moving, [], { speed: 1 });
  for (let i = 0; i < 20 && d.current?.track === undefined; i++) { d.setEnabled(false); d.setEnabled(true); d.update(0.1, fm); }
  const first = d.current;
  ok(first !== null && first.track !== undefined, 'pronghorn on the run are tracked');
  run(d, fm, 3);
  ok(d.current === first, 'the shot holds while the animal runs');
  run(d, frame(stopped, [], { speed: 1 }), 0.8);
  ok(d.current === first, 'a pause of under a second does not end the shot');
  run(d, frame(stopped, [], { speed: 1 }), 2);
  ok(d.current !== first, 'the shot ends once the animal has stopped');
}

// a hunt whose target is lost is dropped (no hunt shot of a predator with nothing in front of it), and a kill is followed by the carcass
{
  const chase = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 235, 200, St.Flee, 0, 14]];
  const { d } = make(chase);
  d.setEnabled(true);
  startHunt(d, frame(chase, [], { speed: 1 }));
  ok(d.current?.kind === 'hunt', 'the hunt starts');
  run(d, frame(chase, [], { speed: 1 }), 4);
  ok(d.current?.kind === 'hunt', 'and holds while the chase goes on');
  // the pronghorn is gone and no carcass was left: the wolf alone is not a hunt
  const alone = [[Sp.Wolf, 210, 200, St.Chase, 0, 11]];
  run(d, frame(alone, [], { speed: 1 }), 2);
  ok(d.current?.kind !== 'hunt', 'a hunt whose target is lost is given up');
}
{
  const chase = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 235, 200, St.Flee, 0, 14]];
  const { d } = make(chase);
  d.setEnabled(true);
  startHunt(d, frame(chase, [], { speed: 1 }));
  run(d, frame(chase, [], { speed: 1 }), 3);
  // the kill: the pronghorn is a carcass beside the wolf, which is now eating
  const kill = [[Sp.Wolf, 214, 200, St.Eat, 0, 0]];
  run(d, frame(kill, [[216, 200, 1, Sp.Deer]], { speed: 1 }), 3.5);
  ok(d.current?.carcass === true && Math.hypot(d.current.x - 216, d.current.y - 200) < 1, 'after the kill the camera shows the carcass');
}

// a hunt keeps both animals in frame: it holds when they are, widens when one slips out of frame, and is given up when they will not fit
{
  const chase = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 245, 200, St.Flee, 0, 14]];
  const f = frame(chase, [], { speed: 1 });
  {
    const { d, cam } = make(chase);
    cam.look([222, 5, 140], [222, 1, 200]); // both animals in view
    d.stats.on = true;
    d.setEnabled(true);
    startHunt(d, f);
    run(d, f, 5);
    ok(d.current?.kind === 'hunt', 'a hunt with both animals in frame holds');
    ok(d.stats.huntSecs > 4 && d.stats.huntBoth / d.stats.huntSecs > 0.95, `both in frame the whole time (${d.stats.huntBoth.toFixed(1)} of ${d.stats.huntSecs.toFixed(1)} s)`);
  }
  {
    const { d, cam } = make(chase);
    cam.look([200, 5, 150], [200, 1, 200]); // the wolf in view, the pronghorn off to the right
    d.stats.on = true;
    d.setEnabled(true);
    startHunt(d, f);
    const shot = d.current;
    const base = shot?.track?.baseDist ?? 0;
    run(d, f, 2.4);
    ok(shot?.track !== undefined && shot.track.frame.dist > (base + 3) * shot.track.ratio, 'a hunt with the target out of frame widens');
    run(d, f, 3);
    ok(d.current !== shot, 'a hunt that cannot keep both in frame is abandoned');
    ok(d.stats.huntSecs > 2 && d.stats.huntBoth / d.stats.huntSecs < 0.5, 'and the stats count the seconds with a missing animal');
  }
}

// a kill shot must show the carcass: dropped when the carcass is gone, or when the camera is not looking at it
{
  const agents = [[Sp.Raven, 200, 200, St.Eat], [Sp.Raven, 203, 201, St.Eat], [Sp.Wolf, 400, 400, St.Idle]];
  const carcasses = [[200, 200, 0.7, Sp.Bison]];
  const { d } = make(agents);
  d.setEnabled(true);
  const f = frame(agents, carcasses, { speed: 1 });
  d.update(0.1, f);
  d.noteEarned('firstKill');
  ok(runUntilMoment(d, f, 6) > 0 && d.current?.carcass === true, 'the kill moment is a carcass shot');
  const shot = d.current;
  run(d, f, 3);
  ok(d.current === shot, 'it holds while the carcass is there');
  run(d, frame(agents, [], { speed: 1 }), 3.2);
  ok(d.current !== shot, 'it is dropped when the carcass is gone');
}
{
  const agents = [[Sp.Raven, 200, 200, St.Eat], [Sp.Raven, 203, 201, St.Eat]];
  const f = frame(agents, [[200, 200, 0.7, Sp.Bison]], { speed: 1 });
  const { d, cam } = make(agents);
  cam.look([200, 6, 160], [200, 1, 200]); // looking at the carcass
  d.setEnabled(true);
  d.update(0.1, f);
  d.noteEarned('firstKill');
  runUntilMoment(d, f, 6);
  const shot = d.current;
  run(d, f, 4);
  ok(d.current === shot && shot?.carcass === true, 'a carcass in frame holds the shot');
  cam.look([200, 6, 160], [400, 1, 100]); // the camera swings away
  run(d, f, 3.5);
  ok(d.current !== shot, 'a carcass shot with the carcass out of frame is dropped');
}

// the cards and captions follow the camera: eventInView is true on the subject of the shot and false elsewhere (and always when the director is off)
{
  const agents = [[Sp.Raven, 200, 200, St.Eat], [Sp.Raven, 203, 201, St.Eat]];
  const f = frame(agents, [[200, 200, 0.7, Sp.Bison]], { speed: 1 });
  const { d, cam } = make(agents);
  ok(d.eventInView(400, 400), 'with the director off the cards are plain news');
  d.setEnabled(true);
  ok(!d.eventInView(200, 200), 'no shot yet: a card waits');
  d.update(0.1, f);
  d.noteEarned('firstKill');
  runUntilMoment(d, f, 6);
  ok(d.eventInView(201, 201), 'an event on the carcass the camera is filming is on screen');
  ok(!d.eventInView(420, 380), 'an event across the valley is not');
  cam.look([200, 6, 160], [200, 1, 200]);
  d.update(0.1, f);
  ok(d.eventInView(201, 201), 'with a real frame, the event inside it is on screen');
  ok(!d.eventInView(200, 100), 'and a point behind the camera is not');
}

// time-lapse: at 100x the camera flies high, slow drone moves and films nothing close, moments included
{
  const agents = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 235, 200, St.Flee, 0, 14], [Sp.Coyote, 90, 80, St.Stalk]];
  const { d, cam } = make(agents);
  d.setEnabled(true);
  const f100 = frame(agents, [], { speed: 100 });
  let drones = 0, high = 0;
  for (let i = 0; i < 20; i++) {
    d.setEnabled(false); d.setEnabled(true); d.update(0.1, f100);
    const s = d.current;
    if (s?.kind === 'drone' && s.id === null && s.drone) { drones++; const h = s.dist * Math.sin((s.pitch * Math.PI) / 180); if (h >= 145 && h <= 305) high++; }
  }
  ok(drones === 20, `every shot at 100x is a drone move (${drones} of 20)`);
  ok(high === drones, `and 150 to 300 m up (${high} of ${drones})`);
  d.setEnabled(false); d.setEnabled(true);
  d.update(0.1, f100);
  d.noteEarned('mousingLeap');
  cam.views.length = 0;
  run(d, f100, 4);
  ok(d.current?.kind === 'drone' && cam.views.every((v) => v.distance === undefined || v.distance >= 150), 'a field note at 100x does not bring the camera down to the animals');
  const xs = cam.views.map((v) => v.x).filter((x): x is number => x !== undefined);
  ok(xs.length > 10 && xs[xs.length - 1] !== xs[0], 'the drone path is flown frame by frame');
  // back at a watchable pace: the drone move ends and the animals are filmed again
  run(d, frame(agents, [], { speed: 1 }), 0.3);
  ok(d.current?.kind !== 'drone', 'at 1x the drone move ends');
  // and skipping to the next event is time-lapse too
  run(d, frame(agents, [], { speed: -1 }), 0.3);
  ok(d.current?.kind === 'drone', 'a skip is time-lapse');
}

// 10x is a mix: animals tracked when something runs, drone moves and animals otherwise
{
  const calm = [[Sp.Bison, 360, 380, St.Graze, 0, 0.3], [Sp.Bison, 364, 380, St.Graze, 0, 0.3], [Sp.Deer, 100, 100, St.Graze, 0, 0.3], [Sp.Wolf, 300, 100, St.Rest]];
  const { d } = make(calm);
  d.setEnabled(true);
  let drone = 0, other = 0;
  for (let i = 0; i < 40; i++) { d.setEnabled(false); d.setEnabled(true); d.update(0.1, frame(calm, [], { speed: 10 })); if (d.current?.kind === 'drone') drone++; else other++; }
  ok(drone >= 4 && other >= 4, `10x mixes drone moves with the animals (${drone} drone, ${other} other)`);
  const chase = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 235, 200, St.Flee, 0, 14]];
  const { d: d2 } = make(chase);
  d2.setEnabled(true);
  let runs = 0;
  for (let i = 0; i < 20; i++) { d2.setEnabled(false); d2.setEnabled(true); d2.update(0.1, frame(chase, [], { speed: 10 })); if (d2.current?.kind === 'run' && d2.current.id === 100 && d2.current.prey === undefined) runs++; }
  ok(runs >= 16, `a chase at 10x is still tracked, as the predator running (${runs} of 20)`);
}

// the stats count seconds with a running animal on screen within 45 m of the camera
{
  const chase = [[Sp.Wolf, 200, 200, St.Chase, 0, 11], [Sp.Deer, 235, 200, St.Flee, 0, 14]];
  const { d, cam } = make(chase);
  cam.look([215, 5, 160], [215, 1, 200]);
  d.stats.on = true;
  d.setEnabled(true);
  run(d, frame(chase, [], { speed: 1 }), 4);
  ok(d.stats.secs.real > 3.5 && d.stats.runnerNear.real / d.stats.secs.real > 0.8, 'a running animal close to the camera is counted');
}

console.log(failures === 0 ? `ok: ${checks} director checks` : `${failures} of ${checks} director checks FAILED`);
process.exit(failures === 0 ? 0 : 1);
