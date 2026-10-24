// Unit test for the raven's wing weights (raven.ts): the two wings are mirror images, vertex for vertex, in position AND in joint weight (aPart.y).
// A weight function that reads the raw z of the mirrored left wing (negative z) gives the left hand a weight of 0, so it never bends at the elbow and a
// folded left wing stays a long straight blade. Run: npx tsx src/render/models/ravenwings.test.ts
import { buildRaven } from './raven';
import { PART } from './builder';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const g = buildRaven().geometry;
const pos = g.getAttribute('position'), part = g.getAttribute('aPart'), piv2 = g.getAttribute('aPivot2');
const key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

const right = new Map<string, number>();
let nR = 0, nL = 0, handR = 0, handL = 0;
for (let i = 0; i < pos.count; i++) {
  if (part.getX(i) === PART.WINGR) { right.set(key(pos.getX(i), pos.getY(i), pos.getZ(i)), part.getY(i)); nR++; if (part.getY(i) > 0.99) handR++; }
  else if (part.getX(i) === PART.WINGL) { nL++; if (part.getY(i) > 0.99) handL++; }
}
ok(nR > 0 && nR === nL, `the wings have the same vertex count (right ${nR}, left ${nL})`);
ok(handR > 100, `the right hand has fully weighted vertices (${handR})`);
ok(handL === handR, `the left hand has as many fully weighted vertices as the right (left ${handL}, right ${handR})`);

let unmatched = 0, off = 0;
for (let i = 0; i < pos.count; i++) {
  if (part.getX(i) !== PART.WINGL) continue;
  const w = right.get(key(pos.getX(i), pos.getY(i), -pos.getZ(i)));
  if (w === undefined) { unmatched++; continue; }
  if (Math.abs(w - part.getY(i)) > 1e-4) off++;
}
ok(unmatched === 0, `every left wing vertex has a mirrored right one (${unmatched} without)`);
ok(off === 0, `mirrored wing vertices carry the same joint weight (${off} differ)`);

// Rigid bound: posing rotates a wing vertex about the shoulder, after the elbow, so it can never be farther from the shoulder than the
// shoulder-to-elbow distance plus its own distance from the elbow. A weight or pivot slip shows up as a vertex outside that bound only in the shader,
// but the pivots stored per vertex are checked here: every wing vertex must carry the elbow as its second pivot, mirrored for the left wing.
let badPiv = 0;
for (let i = 0; i < pos.count; i++) {
  const p = part.getX(i);
  if (p !== PART.WINGL && p !== PART.WINGR) continue;
  const sgn = p === PART.WINGR ? 1 : -1;
  if (Math.abs(piv2.getZ(i) - sgn * 0.3) > 1e-4) badPiv++;
}
ok(badPiv === 0, `every wing vertex carries its own side's elbow pivot (${badPiv} do not)`);

if (failures > 0) {
  console.error(failures + ' ravenwings test(s) failed');
  process.exit(1);
}
console.log('ravenwings tests ok');
