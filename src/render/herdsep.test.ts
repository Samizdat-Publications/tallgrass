// Unit tests for the display-only herd separation (herdsep.ts).
// Run: npx tsx src/render/herdsep.test.ts
import { HerdSep, SEP_MAX, radius } from './herdsep';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const H = new HerdSep(64);

// the rim distance of an ellipse: half length along the heading, half width across it
ok(Math.abs(radius(1, 0, 1, 0, 1.5, 0.5) - 1.5) < 1e-6, 'rim along the heading is the half length');
ok(Math.abs(radius(0, 1, 1, 0, 1.5, 0.5) - 0.5) < 1e-6, 'rim across the heading is the half width');

// two bodies side by side, closer than their widths: pushed apart along the line between them, no further than they need
H.begin();
H.add(0, 10, 10, 0, 1.4, 0.5);
H.add(1, 10, 10.6, 0, 1.4, 0.5);
H.solve(6);
const gap = Math.hypot((10 + H.ox[1]) - (10 + H.ox[0]), (10.6 + H.oz[1]) - (10 + H.oz[0]));
ok(gap >= 1.0 - 0.02, `side by side pair ends at least a body width apart, got ${gap.toFixed(3)}`);
ok(gap < 1.5, `and not much further apart than that, got ${gap.toFixed(3)}`);
ok(Math.abs(H.ox[0]) < 0.05 && Math.abs(H.ox[1]) < 0.05, 'the push is across the bodies, not along them');
ok(Math.abs(H.oz[0] + H.oz[1]) < 1e-5, 'the push is shared equally');

// nose to tail is a longer way than side by side
H.begin();
H.add(0, 0, 0, 0, 1.4, 0.5);
H.add(1, 1.0, 0, 0, 1.4, 0.5);
H.solve(6);
ok(Math.hypot(1.0 + H.ox[1] - H.ox[0], 0) >= 2.8 - 0.05, 'nose to tail pair ends a body length apart');

// far apart: nothing moves
H.begin();
H.add(0, 0, 0, 0, 1.4, 0.5);
H.add(1, 30, 0, 0.5, 1.4, 0.5);
H.solve();
ok(H.ox[0] === 0 && H.oz[0] === 0 && H.ox[1] === 0 && H.oz[1] === 0, 'bodies that do not touch are left alone');

// on the very same spot: split along a fixed line, and the same twice
H.begin();
H.add(0, 5, 5, 0, 1.4, 0.5);
H.add(1, 5, 5, 0, 1.4, 0.5);
H.solve(4);
const sx = H.ox[1] - H.ox[0], sz = H.oz[1] - H.oz[0];
ok(Math.hypot(sx, sz) > 0.8, 'two bodies on one spot are separated');
H.begin();
H.add(0, 5, 5, 0, 1.4, 0.5);
H.add(1, 5, 5, 0, 1.4, 0.5);
H.solve(4);
ok(H.ox[1] - H.ox[0] === sx && H.oz[1] - H.oz[0] === sz, 'deterministic');

// a packed herd: every push is within the cap, and the overlap shrinks a lot
function lcg(s: number): () => number {
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const r = lcg(7);
const N = 40;
const px: number[] = [], pz: number[] = [], ph: number[] = [];
H.begin();
for (let i = 0; i < N; i++) {
  px.push(20 + r() * 9); pz.push(20 + r() * 9); ph.push(r() * 6.28);
  H.add(i, px[i], pz[i], ph[i], 1.4, 0.5);
}
function overlapSum(dx: Float32Array | null, dz: Float32Array | null): number {
  let s = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const xi = px[i] + (dx ? dx[i] : 0), zi = pz[i] + (dz ? dz[i] : 0), xj = px[j] + (dx ? dx[j] : 0), zj = pz[j] + (dz ? dz[j] : 0);
      const d = Math.hypot(xj - xi, zj - zi);
      if (d > 3) continue;
      const ux = (xj - xi) / d, uz = (zj - zi) / d;
      const ov = radius(ux, uz, Math.cos(ph[i]), Math.sin(ph[i]), 1.4, 0.5) + radius(-ux, -uz, Math.cos(ph[j]), Math.sin(ph[j]), 1.4, 0.5) - d;
      if (ov > 0) s += ov;
    }
  }
  return s;
}
const before = overlapSum(null, null);
H.solve(3);
const after = overlapSum(H.ox, H.oz);
let maxOff = 0;
for (let i = 0; i < N; i++) maxOff = Math.max(maxOff, Math.hypot(H.ox[i], H.oz[i]));
ok(maxOff <= SEP_MAX + 1e-4, `no body moves further than the cap, got ${maxOff.toFixed(3)}`);
ok(after < before * 0.35, `a packed herd loses most of its overlap (${before.toFixed(1)} m to ${after.toFixed(1)} m)`);

// the buffer is bounded
const small = new HerdSep(2);
small.begin();
ok(small.add(0, 0, 0, 0, 1, 1) && small.add(1, 1, 1, 0, 1, 1) && !small.add(2, 2, 2, 0, 1, 1), 'add refuses past the capacity');

if (failures) {
  console.error(`herdsep.test: ${failures} failure(s)`);
  process.exit(1);
}
console.log('herdsep.test: ok');
