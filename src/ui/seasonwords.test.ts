// One season vocabulary: the header, the chapter cards, the graph tips and the chronicle tags must name the same moment the same way.
// Run: npx tsx src/ui/seasonwords.test.ts
import type { SimEvent } from '../sim/sim';
import { Environment } from '../sim/env';
import { Rng } from '../sim/rng';
import { SEASON_TICKS, YEAR_TICKS, setCalendarScale } from '../sim/types';
import { sameSeasonName, sameSeasonPhrase, seasonName, seasonNameAt, seasonOfTick, seasonPhrase, seasonPhraseAt, whenPhrase, yearOfTick } from './describe';
import { describeEvent } from './describe';
import { whenShort } from './story';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

for (const scale of [1, 2, 4]) {
  setCalendarScale(scale);
  const label = `(calendar x${scale})`;
  const env = new Environment(new Rng(7));
  // every few ticks across three years: the header reads env.season, everything else reads the tick
  for (let tick = 0; tick < YEAR_TICKS * 3; tick += 3) {
    env.update(tick);
    const header = seasonPhrase(env.state.season);
    if (header !== seasonPhraseAt(tick)) {
      ok(false, `tick ${tick} ${label}: header says "${header}", the tick says "${seasonPhraseAt(tick)}"`);
      break;
    }
    // the coarse chronicle tag is the header's phrase with its early / mid / late taken off
    const tag = seasonNameAt(tick);
    const bare = header.replace(/^(early|late) /, '').replace(/^mid-?/, '');
    if (!(bare === tag || header.endsWith(tag) || header === `mid${tag}` || header === `mid-${tag}`)) {
      ok(false, `tick ${tick} ${label}: tag "${tag}" does not belong to header "${header}"`);
      break;
    }
    if (yearOfTick(tick) !== env.state.year + 1) {
      ok(false, `tick ${tick} ${label}: year ${yearOfTick(tick)} vs env.year ${env.state.year}`);
      break;
    }
  }
  ok(true, 'ran');

  // a card's date (whenPhrase) and the graph tip's both come from the header's phrase at the event's tick
  for (const tick of [0, 100, SEASON_TICKS * 2.2, SEASON_TICKS * 3.5, YEAR_TICKS * 2 + 7]) {
    env.update(Math.round(tick));
    const t = Math.round(tick);
    ok(whenPhrase(t) === `Year ${yearOfTick(t)}, ${seasonPhrase(env.state.season)}`, `whenPhrase matches the header at ${t} ${label}`);
    ok(whenShort(t).toLowerCase().startsWith(seasonNameAt(t)), `story date line uses the same coarse name at ${t} ${label}`);
  }

  // a blizzard card's subtitle comes from the same function the slate uses
  const e: SimEvent = { kind: 'blizzard', tick: Math.round(SEASON_TICKS * 3.45), sp: -1, x: 0, y: 0, a: 300, b: 0 };
  const card = describeEvent(e, { salt: 0 }).card;
  env.update(Math.round(SEASON_TICKS * 3.45));
  ok(!!card && card.subtitle === `Year ${yearOfTick(Math.round(SEASON_TICKS * 3.45))}, ${seasonPhrase(env.state.season)}`, `blizzard card reads the header's words ${label}: ${card?.subtitle}`);
}

setCalendarScale(1);
// boundaries: thirds of a season, the same for the phrase and the tag
ok(seasonPhrase(3.0) === 'early winter' && seasonPhrase(3.33) === 'early winter', 'winter opens early');
ok(seasonPhrase(3.4) === 'midwinter' && seasonPhrase(3.66) === 'midwinter', 'midwinter is the middle third');
ok(seasonPhrase(3.7) === 'late winter' && seasonPhrase(3.99) === 'late winter', 'late winter is the last third');
ok(seasonName(3.99) === 'winter' && seasonName(4) === 'spring' && seasonName(-0.1) === 'winter', 'the coarse name wraps the year');
ok(seasonPhrase(2.0) === 'early autumn' && seasonName(2.0) === 'autumn', 'autumn starts at 2');

// the cards' same-moment checks: midwinter and late winter are the same season but not the same phrase
const mid = YEAR_TICKS + Math.round(SEASON_TICKS * 3.5) - Math.round(1.8 * SEASON_TICKS); // season 3.5 on the player calendar
const late = YEAR_TICKS + Math.round(SEASON_TICKS * 3.8) - Math.round(1.8 * SEASON_TICKS);
ok(seasonPhraseAt(mid) === 'midwinter' && seasonPhraseAt(late) === 'late winter', `fixture ticks read midwinter / late winter (${seasonPhraseAt(mid)} / ${seasonPhraseAt(late)})`);
ok(sameSeasonName(mid, late) && !sameSeasonPhrase(mid, late), 'midwinter and late winter: same season, different phrase');
ok(!sameSeasonPhrase(mid, mid + YEAR_TICKS), 'the same phrase a year later is not the same moment');
ok(seasonOfTick(mid) >= 3 && seasonOfTick(mid) < 4, 'season value is in 0..4');

console.log(`seasonwords: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
