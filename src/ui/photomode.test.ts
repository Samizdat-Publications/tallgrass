// Unit tests for the lens controller (R15): what it tells the post stack for the director's close shots, photo mode, cinematic mode
// and the idle case. Run: npx tsx src/ui/photomode.test.ts
import * as THREE from 'three';
import { DIRECTOR_BLUR, LensController, PHOTO_BLUR_MAX, apertureLabel, apertureToBlur, exposureLabel, viewDepth, type LensDeps } from './photomode';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}
const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

// the aperture slider: off at the left, gentle in the first half, the widest at the right
ok(apertureToBlur(0) === 0 && apertureToBlur(0.03) === 0, 'the first stop of the slider is off');
ok(near(apertureToBlur(1), PHOTO_BLUR_MAX, 1e-9), 'the widest aperture is the maximum blur');
ok(apertureToBlur(0.5) < PHOTO_BLUR_MAX / 2, 'the middle of the slider is gentler than half');
ok(apertureToBlur(2) === PHOTO_BLUR_MAX && apertureToBlur(-1) === 0, 'out of range values are clamped');
ok(apertureLabel(0) === 'Off' && apertureLabel(1) === 'f/2.0' && apertureLabel(0.5) === 'f/9.0', 'aperture labels');
ok(exposureLabel(0) === '0 EV' && exposureLabel(1.5) === '+1.5 EV' && exposureLabel(-0.5) === '-0.5 EV', 'exposure labels');

// depth along the view axis, not the straight-line distance
{
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 9000);
  cam.position.set(10, 5, 10);
  cam.lookAt(10, 5, 110); // looking down +z
  cam.updateMatrixWorld(true);
  ok(near(viewDepth(cam, new THREE.Vector3(10, 5, 60)), 50, 1e-6), 'a point straight ahead is its distance away');
  ok(near(viewDepth(cam, new THREE.Vector3(40, 5, 60)), 50, 1e-6), 'sideways offset does not change the depth');
  ok(viewDepth(cam, new THREE.Vector3(10, 5, -50)) === 0.1, 'a point behind the camera is floored');
}

// the controller, with a fake post stack
function rig(): { lens: LensController; calls: { dof: Array<[number, number, number | undefined, boolean | undefined]>; lens: Array<[number, number]>; exposure: number[] }; state: { close: ReturnType<LensDeps['director']['closeShot']>; selected: number | null; animals: Map<number, THREE.Vector3> } } {
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 9000);
  cam.position.set(0, 2, 0);
  cam.lookAt(0, 2, 100);
  cam.updateMatrixWorld(true);
  const calls = { dof: [] as Array<[number, number, number | undefined, boolean | undefined]>, lens: [] as Array<[number, number]>, exposure: [] as number[] };
  const state = { close: null as ReturnType<LensDeps['director']['closeShot']>, selected: null as number | null, animals: new Map<number, THREE.Vector3>() };
  const lens = new LensController({
    camera: cam,
    post: { setDof: (b, f, t, l) => calls.dof.push([b, f, t, l]), setLens: (g, c) => calls.lens.push([g, c]) },
    animalPos: (id, out) => { const p = state.animals.get(id); if (!p) return false; out.copy(p); return true; },
    speciesOf: (id) => (state.animals.has(id) ? 1 : null),
    pivot: (out) => out.set(0, 0, 40),
    selectedId: () => state.selected,
    director: { closeShot: () => state.close },
    setExposure: (m) => calls.exposure.push(m),
  });
  return { lens, calls, state };
}
const step = (lens: LensController, seconds: number): void => { for (let t = 0; t < seconds; t += 1 / 60) lens.update(1 / 60); };

// idle: nothing on, every frame sends zeros
{
  const { lens, calls } = rig();
  step(lens, 2);
  ok(calls.dof.every((c) => c[0] === 0), 'idle: the depth of field is never asked for');
  ok(calls.lens.length === 0, 'idle: the lens look is never touched');
  ok(calls.exposure.length === 0, 'idle: the exposure is never touched');
}

// the director's close shot: gentle blur fades in on the subject's depth, and out again when the shot ends
{
  const { lens, calls, state } = rig();
  state.animals.set(7, new THREE.Vector3(3, 0, 25));
  state.close = { id: 7, x: 0, y: 0, dist: 30 };
  step(lens, 5);
  const last = calls.dof[calls.dof.length - 1];
  ok(near(last[0], DIRECTOR_BLUR, 1e-4), 'a close shot settles at the gentle director blur');
  ok(near(last[1], 25, 0.01), 'and focuses at the subject depth (25 m)');
  ok(last[3] === true, 'the director uses the long lens shape');
  ok(DIRECTOR_BLUR * 900 <= 3.6, 'the director blur is at most 3.5 px at 1600 x 900');
  state.close = null;
  step(lens, 4);
  ok(calls.dof[calls.dof.length - 1][0] === 0, 'when the shot ends the blur fades to exactly zero (the pass can skip)');
  const off = rig();
  off.lens.directorDof = false;
  off.state.close = { id: null, x: 0, y: 0, dist: 20 };
  step(off.lens, 2);
  ok(off.calls.dof.every((c) => c[0] === 0), 'directorDof = false keeps close shots sharp');
  const fixed = rig();
  fixed.state.close = { id: null, x: 0, y: 0, dist: 20 };
  step(fixed.lens, 3);
  ok(near(fixed.calls.dof[fixed.calls.dof.length - 1][1], 40, 0.01), 'a fixed-point shot focuses on the orbit pivot');
}

// photo mode: the aperture sets the blur, the focus follows the picked animal, a picked spot or the centre; exposure comes and goes
{
  const { lens, calls, state } = rig();
  state.animals.set(1, new THREE.Vector3(0, 0, 18));
  state.animals.set(2, new THREE.Vector3(0, 0, 60));
  state.selected = 1;
  lens.photoOpen = true;
  lens.state = { exposure: 1, aperture: 0.8, freeze: true, hideUi: false, grain: true, format: 'png' };
  const labels: string[] = [];
  lens.onLabel = (t) => labels.push(t);
  step(lens, 4);
  let last = calls.dof[calls.dof.length - 1];
  ok(near(last[0], apertureToBlur(0.8), 1e-4), 'photo mode: the blur follows the aperture slider');
  ok(last[3] === false, 'photo mode uses the thin lens shape');
  ok(near(last[1], 18, 0.05), 'photo mode, auto: focus is on the selected animal (18 m)');
  ok(calls.exposure[calls.exposure.length - 1] === 2, 'photo mode: +1 EV doubles the exposure');
  ok(near(calls.lens[calls.lens.length - 1][0], 0.03, 1e-3) && calls.lens[calls.lens.length - 1][1] === 0, 'photo mode: grain switch gives grain and no fringe');
  ok(labels.length > 0 && labels[0].startsWith('Wolf, 18'), 'photo mode: the focus label names the species and the distance');
  lens.focusAnimal(2);
  step(lens, 1.5);
  last = calls.dof[calls.dof.length - 1];
  ok(near(last[1], 60, 0.1), 'a picked animal takes the focus');
  lens.focusPoint(0, 0, 33);
  step(lens, 1.5);
  ok(near(calls.dof[calls.dof.length - 1][1], 33, 0.1), 'a picked spot takes the focus');
  lens.setMode('centre');
  step(lens, 1.5);
  ok(near(calls.dof[calls.dof.length - 1][1], 40, 0.1), 'centre mode focuses on the pivot even with an animal selected');
  lens.setMode('auto');
  state.selected = null;
  step(lens, 1.5);
  ok(near(calls.dof[calls.dof.length - 1][1], 40, 0.1), 'auto with nothing selected falls back to the centre');
  lens.focusAnimal(2);
  state.animals.delete(2);
  step(lens, 1.5);
  ok(lens.mode === 'auto', 'a picked animal that is gone drops back to auto');
  lens.photoOpen = false;
  step(lens, 4);
  ok(calls.dof[calls.dof.length - 1][0] === 0, 'closing photo mode fades the blur to zero');
  ok(calls.exposure[calls.exposure.length - 1] === 1, 'closing photo mode restores the exposure');
  ok(calls.lens[calls.lens.length - 1][0] === 0, 'closing photo mode fades the grain out');
}

// cinematic mode: grain and a faint fringe (under a pixel), nothing else
{
  const { lens, calls } = rig();
  lens.cinematic = true;
  step(lens, 3);
  const l = calls.lens[calls.lens.length - 1];
  ok(l[0] > 0.015 && l[0] <= 0.03, 'cinematic grain is subtle');
  ok(l[1] > 0.3 && l[1] < 1, 'the colour fringe is under one pixel at the corners');
  ok(calls.dof.every((c) => c[0] === 0), 'cinematic mode alone does not blur');
  lens.cinematic = false;
  step(lens, 5);
  const e = calls.lens[calls.lens.length - 1];
  ok(e[0] === 0 && e[1] === 0, 'leaving cinematic mode takes the lens look off (so the finish pass skips it)');
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`photomode.test.ts: ${checks} checks passed`);
