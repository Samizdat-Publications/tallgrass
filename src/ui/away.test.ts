// Seasonal visitors in the population panel, and the fixed card order. Run: npx tsx src/ui/away.test.ts
import { defaultParams } from '../sim/params';
import { SPECIES } from '../sim/species';
import { EAGLE_ARRIVE, EAGLE_LEAVE, HAWK_LEAVE, HAWK_RETURN } from '../sim/sp/raptor';
import { SPECIES_KEYS } from '../sim/types';
import { arrivingLabel, awayLabel, awayRows, awayState, awayText, holdAway, inAwayWindow, isMigrant } from './away';
import { expectedSpecies } from './slots';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const EAGLE = SPECIES_KEYS.indexOf('eagle');
const HAWK = SPECIES_KEYS.indexOf('hawk');
const PRONGHORN = SPECIES_KEYS.indexOf('pronghorn');

// the schedule here is the sim's: stepping the season through the year, the away window opens at the sim's departure and closes just after its arrival
ok(isMigrant(EAGLE) && isMigrant(HAWK) && !isMigrant(PRONGHORN), 'eagle and hawk are the visitors');
for (let s = 0; s < 4; s += 0.01) {
  const eaglePresent = s >= EAGLE_ARRIVE || s < EAGLE_LEAVE;
  const hawkPresent = s >= HAWK_RETURN && s < HAWK_LEAVE;
  if (eaglePresent && s >= EAGLE_ARRIVE + 0.2 || eaglePresent && s < EAGLE_LEAVE) ok(!inAwayWindow(EAGLE, s), `eagles are not away at season ${s.toFixed(2)}`);
  if (!eaglePresent) ok(inAwayWindow(EAGLE, s), `eagles are away at season ${s.toFixed(2)}`);
  if (hawkPresent && s >= HAWK_RETURN + 0.2) ok(!inAwayWindow(HAWK, s), `hawks are not away at season ${s.toFixed(2)}`);
  if (!hawkPresent && !(s >= HAWK_RETURN && s < HAWK_RETURN + 0.2)) ok(inAwayWindow(HAWK, s), `hawks are away at season ${s.toFixed(2)}`);
}
ok(!inAwayWindow(PRONGHORN, 1), 'pronghorn are never "away" (they never all leave)');

// the words
ok(awayLabel(EAGLE) === 'away for the summer', `eagle label: ${awayLabel(EAGLE)}`);
ok(awayLabel(HAWK) === 'away for the winter', `hawk label: ${awayLabel(HAWK)}`);
ok(arrivingLabel(EAGLE) === 'arriving in mid-autumn', `eagle arrival: ${arrivingLabel(EAGLE)}`);
ok(arrivingLabel(HAWK) === 'arriving in early spring', `hawk arrival: ${arrivingLabel(HAWK)}`);

// a count of zero means "away" in the off season, "arriving" before the first ever visit, and a plain zero otherwise
ok(awayState(HAWK, 3.2, 0, true) === 'away', 'a hawk at zero in winter is away');
ok(awayState(HAWK, 3.2, 0, false) === 'arriving', 'a hawk never seen, at zero in winter, is arriving');
ok(awayState(HAWK, 1.0, 0, true) === null, 'a hawk at zero in the middle of summer really is gone');
ok(awayState(HAWK, 3.2, 4, true) === null, 'a hawk with a count is just a count');
ok(awayState(EAGLE, 1.2, 0, true) === 'away', 'an eagle at zero in summer is away');
ok(awayState(EAGLE, 3.2, 0, true) === null, 'an eagle at zero in winter is gone');
ok(awayState(PRONGHORN, 3.2, 0, true) === null, 'a pronghorn at zero is a zero');
ok(awayText(HAWK, 'away') === 'away for the winter' && awayText(HAWK, null) === '', 'awayText');

// the line: away rows are zeros in the off season, and are held level, never plunged to zero
{
  // one year in 24 rows: hawks 0 until season 0.3, then 3..14, then 0 from season 2.4
  const season = (i: number): number => (i / 24) * 4;
  const vals = Array.from({ length: 24 }, (_, i) => {
    const s = season(i);
    return s >= HAWK_RETURN + 0.2 && s < HAWK_LEAVE ? 12 : 0;
  });
  const away = awayRows(HAWK, vals, season);
  ok(away.some(Boolean) && away.some((a) => !a), 'some rows away and some present');
  ok(away.every((a, i) => a === (vals[i] === 0 && inAwayWindow(HAWK, season(i)))), 'away means zero and in the window');
  const held = holdAway(vals, away);
  ok(held.every((v) => v === 12), `a year of hawks reads as a level line, not a drop (${held.join(',')})`);
  // a real crash inside the season stays a crash
  const crash = vals.slice();
  crash[10] = 0;
  const away2 = awayRows(HAWK, crash, season);
  ok(!away2[10], 'a zero in mid-summer is not hidden');
  ok(holdAway(crash, away2)[10] === 0, 'and it still draws as a zero');
  // nothing ever present: held at the floor
  ok(holdAway([0, 0, 0], [true, true, true], 0, 0).every((v) => v === 0), 'all-away holds at the floor');
  // a series that starts away borrows the first present value (no climb from zero)
  ok(holdAway([0, 0, 7, 8], [true, true, false, false]).join() === '7,7,7,8', 'leading away borrows the first present value');
}

// fixed order: expectedSpecies is in registry order, and names every species a default valley will show
{
  const p = defaultParams();
  const sp = expectedSpecies(p);
  ok(sp.every((v, i) => i === 0 || v > sp[i - 1]), 'slots are in registry order');
  const keys = sp.map((i) => SPECIES[i].key);
  for (const k of ['bison', 'wolf', 'raven', 'pronghorn', 'eagle', 'hawk', 'muledeer', 'cougar', 'coyote', 'rabbit', 'prairiedog']) ok(keys.includes(k), `default valley has a ${k} card`);
  ok(!keys.includes('beaver'), 'no beaver card while beavers are off');
  const noRaptors = expectedSpecies({ ...p, raptors: 0 }).map((i) => SPECIES[i].key);
  ok(!noRaptors.includes('hawk') && !noRaptors.includes('eagle'), 'no raptor cards with raptors off');
  const closed = expectedSpecies({ ...p, openPrairie: 0 }).map((i) => SPECIES[i].key);
  ok(closed.includes('hawk') && !closed.includes('eagle'), 'eagles need the open prairie, hawks do not');
  const beavers = expectedSpecies({ ...p, beavers: 1 }).map((i) => SPECIES[i].key);
  ok(beavers.includes('beaver'), 'beavers on: a beaver card');
}

console.log(`away: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
