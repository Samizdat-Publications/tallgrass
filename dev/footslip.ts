// Headless foot-slip gate: `npx tsx dev/footslip.ts [--bumps] [--cam 20,44] [--rest]`
// Prints the before (the build before the grounding work; with --legacy the pre-R1 leg math) and after table for every legged species, gait, time scale and slope, and exits 1 if a gate
// fails (stance slip <= 5% at walk and trot, <= 8% at gallop; foot to ground <= 5 cm on a 20 degree slope; all at 1x).
// The browser version with image strips is dev/footslip.html.
import { allPass, formatTable, paceFor, restPose, runTable, speciesRig, LEGGED, SPECIES_SCALE } from './footslip-core';
import { gaitMix, gaitStride, timelapseGaitSpd, timelapseHz } from '../src/render/models/legmath';

const argv = process.argv.slice(2);
const bumps = argv.includes('--bumps');
const camArg = argv.indexOf('--cam');
const cams = camArg >= 0 ? argv[camArg + 1].split(',').map(Number) : [20, 44];

if (argv.includes('--rest')) {
  for (const { sp, name } of LEGGED) console.log(name.padEnd(10), restPose(sp));
}
// the allocation-free stride the animal layer advances the phase by must equal the stride the foot path uses, at every speed
for (const { sp, name } of LEGGED) {
  const { p } = speciesRig(sp);
  for (let v = 0; v <= 30; v += 0.05) {
    const a = gaitStride(p, v), b = gaitMix(p, v).stride;
    if (Math.abs(a - b) > 1e-9) { console.error(`stride mismatch ${name} at ${v} m/s: ${a} vs ${b}`); process.exit(1); }
  }
}
// time-lapse look (render only, not gated): at 10x and 100x the cadence is the readable bound rate and the stride the long gallop
// stride for the apparent speed, so the legs turn at a few Hz instead of the 12 Hz cap (the feet still cannot keep up with the body)
console.log('time-lapse gait (apparent speed = pace x factor, pose at 0.9 x apparent capped at fast1):');
for (const { sp, name } of LEGGED) {
  const { p } = speciesRig(sp);
  for (const g of ['walk', 'trot', 'gallop'] as const) {
    for (const f of [10, 100]) {
      const v = paceFor(p, g) * f;
      const pose = timelapseGaitSpd(p, paceFor(p, g), v, 1);
      const hz = timelapseHz(p);
      const stride = gaitStride(p, pose) * SPECIES_SCALE[sp];
      const old = Math.min(v / (gaitStride(p, paceFor(p, g)) * SPECIES_SCALE[sp]), 12);
      console.log(`  ${name.padEnd(10)} ${g.padEnd(7)} ${String(f).padStart(3)}x body ${v.toFixed(0).padStart(4)} m/s | before ${old.toFixed(1).padStart(4)} Hz | after ${hz.toFixed(1)} Hz, stride ${stride.toFixed(1)} m, feet ${(stride * hz).toFixed(0)} m/s`);
    }
  }
}
const rows = runTable(cams, bumps ? 'bumps' : 'plane', argv.includes('--legacy') ? 'legacy' : 'main');
console.log(`terrain: ${bumps ? 'slope plus bumps (14 cm swells, 9 cm ripples)' : 'flat and a plane slope'}`);
console.log(formatTable(rows));
const ok = allPass(rows);
console.log(ok ? '\nGATES PASS (1x rows)' : '\nGATES FAIL (see rows marked FAIL)');
process.exit(ok ? 0 : 1);
