// Device verdicts: no WebGL2 wins; a coarse pointer with the longer screen side under 900 px is a phone; tablets and desktops pass.
// Run: npx tsx src/support.test.ts
import { isPhoneLike, verdictFor } from './support';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

ok(verdictFor(true, false, 1920, 1080) === 'ok', 'desktop passes');
ok(verdictFor(true, true, 390, 844) === 'phone', 'a phone is caught, portrait');
ok(verdictFor(true, true, 844, 390) === 'phone', 'a phone is caught, landscape');
ok(verdictFor(true, true, 820, 1180) === 'ok', 'a tablet passes');
ok(verdictFor(true, true, 899, 400) === 'phone', '899 is still small');
ok(verdictFor(true, true, 900, 400) === 'ok', '900 is not');
ok(verdictFor(true, false, 390, 844) === 'ok', 'a small window with a mouse passes');
ok(verdictFor(false, false, 1920, 1080) === 'nowebgl2', 'no WebGL2');
ok(verdictFor(false, true, 390, 844) === 'nowebgl2', 'no WebGL2 beats the phone card');
ok(!isPhoneLike(true, 0, 0), 'unknown screen size is not a phone');

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('support: all checks passed');
