// Headless foot-slip gate: `npx tsx dev/footslip.ts [--bumps] [--cam 20,44] [--rest]`
// Prints the before (pre-R1 leg math) and after table for every legged species, gait, time scale and slope, and exits 1 if a gate
// fails (stance slip <= 5% at walk and trot, <= 8% at gallop; foot to ground <= 5 cm on a 20 degree slope; all at 1x).
// The browser version with image strips is dev/footslip.html.
import { allPass, formatTable, restPose, runTable, speciesRig, LEGGED } from './footslip-core';
import { gaitMix, gaitStride } from '../src/render/models/legmath';

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
const rows = runTable(cams, bumps ? 'bumps' : 'plane');
console.log(`terrain: ${bumps ? 'slope plus bumps (14 cm swells, 9 cm ripples)' : 'flat and a plane slope'}`);
console.log(formatTable(rows));
const ok = allPass(rows);
console.log(ok ? '\nGATES PASS (1x rows)' : '\nGATES FAIL (see rows marked FAIL)');
process.exit(ok ? 0 : 1);
