// Event text checks: every event kind, including the v2 kinds, gives a clean sentence. Run: npx tsx src/ui/describe.test.ts
import type { SimEvent, SimEventKind } from '../sim/sim';
import { ChronicleVoice, climateWord, describeEvent, describeFolded, eventWeight, foldKey, skyWord, yearOfTick, type SkyView } from './describe';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const KINDS: SimEventKind[] = [
  'packFounded', 'packLost', 'drought', 'droughtEnd', 'outbreak', 'stampede', 'extinct', 'introduced', 'removed', 'culled',
  'fire', 'record', 'elder', 'firstKill', 'plague', 'rain',
  'immigrated', 'emigrated', 'recolonized', 'distemper', 'mange', 'townFounded', 'townLost', 'sylvaticPlague',
  'hareBoom', 'hareCrash', 'coyotePups', 'mesoRelease', 'storm', 'lightningFire', 'eaglesArrive', 'hawksReturn',
  'blizzard', 'hardWinter', 'flood', 'grovePlanted', 'dustStorm', 'grasshopperOutbreak', 'springFlood', 'encroachment',
  'damBuilt', 'pondFilled', 'damBreached', 'beaverMeadow', 'colonyLeft',
  'climateWet', 'climateDry', 'climateMild', 'megadrought',
];
const EM_DASH = String.fromCharCode(0x2014);

for (const kind of KINDS) {
  for (const sp of [-2, -1, 0, 1, 3, 5, 6, 7, 10, 11, 40]) {
    for (const [a, b] of [[0, 0], [1, 0], [2, 3], [17, 1]]) {
      for (const tick of [0, 1234, 98765]) {
        const e: SimEvent = { tick, kind, sp, x: tick % 2 ? 50 : 0, y: tick % 2 ? 470 : 0, a, b };
        let s = '';
        try {
          const t = describeEvent(e);
          s = t.sentence + (t.card ? ` | ${t.card.title} | ${t.card.subtitle}` : '');
        } catch (err) {
          ok(false, `${kind} sp=${sp} threw ${String(err)}`);
          continue;
        }
        const tag = `${kind} sp=${sp} a=${a} b=${b}: "${s}"`;
        ok(s.length > 5, `${tag} is empty`);
        ok(!/undefined|NaN|null/.test(s), `${tag} has a missing value`);
        ok(!s.includes(EM_DASH), `${tag} has an em dash`);
        ok(/[.!?]/.test(describeEvent(e).sentence.slice(-1)), `${tag} does not end a sentence`);
        const w = eventWeight(e);
        ok(w >= 1 && w <= 5, `${tag} weight ${w}`);
      }
    }
  }
}

// the new kinds must not fall through to the generic sentence
for (const kind of KINDS) {
  const s = describeEvent({ tick: 500, kind, sp: kind === 'mange' || kind === 'immigrated' ? 1 : 3, x: 0, y: 0, a: 2, b: 1 }).sentence;
  ok(s !== 'Something stirs in the valley.', `${kind} has no text of its own`);
}

// elder dies (it fires at the animal's death)
ok(/dies|dead/.test(describeEvent({ tick: 10, kind: 'elder', sp: 0, x: 0, y: 0, a: 9000, b: 1 }).sentence), 'elder text says the animal died');

// an unknown kind does not crash
ok(describeEvent({ tick: 10, kind: 'nope' as SimEventKind, sp: 0, x: 0, y: 0, a: 0, b: 0 }).sentence.length > 0, 'unknown kind');

// variety: the same kind of event, twice running, never reads word for word the same through the chronicle voice
{
  const voice = new ChronicleVoice();
  for (const [kind, sp, a] of [['immigrated', 6, 2], ['immigrated', 1, 2], ['immigrated', 3, 5], ['outbreak', 0, 40], ['emigrated', 3, 4], ['droughtEnd', -1, 0], ['rain', -1, 0], ['stampede', 0, 80], ['elder', 0, 9000]] as [SimEventKind, number, number][]) {
    voice.reset();
    let prev = '';
    for (let i = 0; i < 40; i++) {
      // identical data each time (as in "Two coyotes arrive" twice, "40 fall ill" twice): only the tick differs
      const e: SimEvent = { tick: 3000 + i * 2400, kind, sp, x: 100, y: 400, a, b: 0 };
      const s = voice.describe(e).sentence;
      ok(s !== prev, `${kind} sp=${sp}: line ${i} repeats the one before it: "${s}"`);
      prev = s;
    }
  }
  voice.reset();
  const first = voice.describe({ tick: 3000, kind: 'immigrated', sp: 6, x: 0, y: 0, a: 2, b: 0 }).sentence;
  const second = voice.describe({ tick: 12000, kind: 'immigrated', sp: 6, x: 0, y: 0, a: 2, b: 0 }).sentence;
  ok(first !== second, `two consecutive coyote arrivals differ: "${first}" vs "${second}"`);
  const o1 = voice.describe({ tick: 3000, kind: 'outbreak', sp: 0, x: 400, y: 256, a: 40, b: 0 }).sentence;
  const o2 = voice.describe({ tick: 9000, kind: 'outbreak', sp: 0, x: 400, y: 256, a: 40, b: 0 }).sentence;
  ok(o1 !== o2 && o1.includes('40') && o2.includes('40'), `two outbreaks with the same count differ: "${o1}" vs "${o2}"`);
  // describeEvent itself stays pure: the same event always reads the same way
  const ev: SimEvent = { tick: 777, kind: 'immigrated', sp: 6, x: 0, y: 0, a: 2, b: 0 };
  ok(describeEvent(ev).sentence === describeEvent(ev).sentence, 'describeEvent is pure');
}

// runs of arrivals fold into one line with a running total
{
  const e: SimEvent = { tick: 5000, kind: 'immigrated', sp: 6, x: 0, y: 0, a: 3, b: 0 };
  ok(foldKey(e) === 'immigrated:6', 'arrivals fold by species');
  ok(foldKey({ ...e, kind: 'outbreak' }) === null, 'an outbreak does not fold');
  const line = describeFolded(e, 6, 2);
  ok(/6/.test(line) && /coyotes/.test(line) && !line.includes(EM_DASH), `folded line carries the total: "${line}"`);
  const out = describeFolded({ ...e, kind: 'emigrated', sp: 3 }, 9, 3);
  ok(/9/.test(out) && /pronghorn/i.test(out), `folded departure line: "${out}"`);
}

// the status line says what is on screen: snow only while snow falls, blizzard only in a blizzard
{
  const clear: SkyView = { snow: 0, blizzard: 0, rain: 0, drought: 0, dustStorm: 0, flood: 0, overcast: 0 };
  ok(skyWord({ weather: 0 }, clear) === 'clear', 'clear sky reads clear');
  ok(skyWord({ weather: 4 }, clear) === 'clear', 'sim snow that is not on screen yet reads clear, not snow');
  ok(skyWord({ weather: 4 }, { ...clear, overcast: 0.5 }) === 'overcast', 'clouds gathering before the snow reads overcast');
  ok(skyWord({ weather: 4 }, { ...clear, snow: 0.6, overcast: 0.4 }) === 'snow', 'falling snow reads snow');
  ok(skyWord({ weather: 4 }, { ...clear, snow: 1, blizzard: 0.9 }) === 'blizzard', 'a blizzard reads blizzard');
  ok(skyWord({ weather: 0 }, { ...clear, blizzardPending: true }) === 'blizzard building', 'a blizzard event with no snow yet reads building');
  ok(skyWord({ weather: 3 }, { ...clear, rain: 1 }) === 'storm', 'a storm reads storm');
  ok(skyWord({ weather: 1 }, { ...clear, rain: 0.7 }) === 'rain', 'rain reads rain');
  ok(skyWord({ weather: 0 }, { ...clear, dustStorm: 0.6 }) === 'dust storm', 'a dust storm reads dust storm');
  ok(skyWord({ weather: 0 }, { ...clear, flood: 0.8 }) === 'clear, flood', 'a flood adds flood');
  ok(skyWord({ weather: 4 }, undefined) === 'snow', 'without sky data the sim weather is used');
}

// the climate word: only when it matters, and it does not flicker on the threshold
{
  const sky = (climate: number, megadrought = false): SkyView => ({ snow: 0, blizzard: 0, rain: 0, drought: 0, dustStorm: 0, flood: 0, overcast: 0, climate, megadrought });
  ok(climateWord(undefined) === '', 'no sky data, no climate word');
  ok(climateWord(sky(0)) === '' && climateWord(sky(0.3)) === '' && climateWord(sky(-0.44)) === '', 'ordinary years have no word');
  ok(climateWord({ snow: 0, blizzard: 0, rain: 0, drought: 0, dustStorm: 0, flood: 0, overcast: 0 }) === '', 'climate2 off (no value) has no word');
  ok(climateWord(sky(0.5)) === 'Wet years' && climateWord(sky(-0.5)) === 'Dry years', 'past 0.45 either way names the run');
  ok(climateWord(sky(-0.75, true)) === 'Megadrought', 'a megadrought is named');
  ok(climateWord(sky(0.4), 'Wet years') === 'Wet years' && climateWord(sky(0.4)) === '', 'the wet word holds between 0.35 and 0.45');
  ok(climateWord(sky(-0.4), 'Dry years') === 'Dry years' && climateWord(sky(-0.3), 'Dry years') === '', 'the dry word lets go below 0.35');
  ok(climateWord(sky(-0.6), 'Megadrought') === 'Dry years', 'when a megadrought ends the dry word carries on');
  // the climate events carry the year (megadrought) and weigh as the chronicle expects
  const mega = describeEvent({ tick: 1200 * 14, kind: 'megadrought', sp: -1, x: 0, y: 0, a: -78, b: 4 });
  ok(new RegExp('[Yy]ear ' + yearOfTick(1200 * 14)).test(mega.sentence) && /four years/.test(mega.sentence) && !!mega.card, `megadrought line names the year and length: "${mega.sentence}"`);
  ok(eventWeight({ tick: 0, kind: 'megadrought', sp: -1, x: 0, y: 0, a: -78, b: 4 }) === 4, 'megadrought is heavy');
  ok(eventWeight({ tick: 0, kind: 'climateWet', sp: -1, x: 0, y: 0, a: 60, b: 0 }) === 3 && eventWeight({ tick: 0, kind: 'climateDry', sp: -1, x: 0, y: 0, a: -60, b: 0 }) === 3, 'wet and dry runs are medium');
  ok(eventWeight({ tick: 0, kind: 'climateMild', sp: -1, x: 0, y: 0, a: 5, b: 1 }) === 1, 'the return to ordinary years is light');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
