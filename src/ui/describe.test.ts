// Event text checks: every event kind, including the v2 kinds, gives a clean sentence. Run: npx tsx src/ui/describe.test.ts
import type { SimEvent, SimEventKind } from '../sim/sim';
import { ChronicleVoice, describeEvent, describeFolded, eventWeight, foldKey } from './describe';

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

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
