// Unit tests for the raven clearance from feeding predators (ravenclear.ts).
// Run: npx tsx src/render/ravenclear.test.ts
import { BODY_STRIDE, ravenClear } from './ravenclear';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// one body at (10, 20) heading +x: half length 1.5, half width 1.0
const B = new Float32Array(BODY_STRIDE);
B.set([10, 20, 1, 0, 1.5, 1.0]);
const out = { x: 0, z: 0 };

// far away: no push
ravenClear(B, 1, 30, 20, 0, true, out);
ok(out.x === 0 && out.z === 0, 'far bird is left alone');

// a standing bird inside the footprint ends on or outside the rim
for (const [dx, dz] of [[0.2, 0.1], [-0.8, 0.3], [0.1, -0.6], [1.2, 0.2], [0.0, 0.4]]) {
  ravenClear(B, 1, 10 + dx, 20 + dz, 0, true, out);
  const u = dx + out.x, v = dz + out.z;
  ok(Math.hypot(u / 1.5, v / 1.0) >= 0.999, `standing bird at (${dx}, ${dz}) is moved to the rim, got (${u.toFixed(2)}, ${v.toFixed(2)})`);
}

// continuous: just inside the rim the push is tiny
ravenClear(B, 1, 10 + 1.49, 20, 0, true, out);
ok(Math.hypot(out.x, out.z) < 0.02, 'the push fades to nothing at the rim');

// a flying bird keeps further clear (its wings), and a high one passes over
ravenClear(B, 1, 10 + 1.8, 20, 1.0, false, out);
ok(out.x > 0.2, 'a low flier whose wings would touch is pushed out');
ravenClear(B, 1, 10, 20, 3.5, false, out);
ok(out.x === 0 && out.z === 0, 'a bird above the back is not pushed');
ravenClear(B, 1, 10, 20, 2.3, false, out);
ok(Math.hypot(out.x, out.z) > 0 && Math.hypot(out.x, out.z) < Math.hypot(1.5, 1.0) + 1.2, 'a mid-height bird is pushed by a share');

// a rotated body: heading +z (h = 90 deg): the long axis is along z
const R = new Float32Array(BODY_STRIDE);
R.set([0, 0, 0, 1, 1.5, 1.0]);
ravenClear(R, 1, 0, 1.2, 0, true, out); // 1.2 m along the long axis: inside (1.5)
ok(out.z > 0.25 && Math.abs(out.x) < 1e-6, 'a bird along the long axis of a rotated body leaves along it');
ravenClear(R, 1, 1.2, 0, 0, true, out); // 1.2 m across: outside (1.0)
ok(out.x === 0 && out.z === 0, 'a bird beside a rotated body, past its half width, is left alone');

if (failures > 0) {
  console.error(failures + ' ravenclear test(s) failed');
  process.exit(1);
}
console.log('ravenclear tests ok');
