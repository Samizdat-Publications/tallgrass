// Unit tests for the narrator's policy. Run: npx tsx src/audio/narration.test.ts
import type { SimEvent, SimEventKind } from '../sim/sim';
import { KIND_COOLDOWN_YEARS, MAX_AGE_MS, MIN_GAP_MS, NARRATION_IDS, NARRATION_TEXT, OPENING_DELAY_MS, gapElapsed, gateOpen, isStale, lineVariants, pickVariant, priority, speedAllowsNarration } from './narration';
import { Narrator } from './narrator';
import type { AudioDirector } from './audio';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// every event gets its own tick, far from the others, so the chronicle's thinning (FeedFilter) never merges two of them
let seq = 0;
const ev = (kind: SimEventKind, over: Partial<SimEvent> = {}): SimEvent => ({ tick: 5000 + 100000 * seq++, kind, sp: -1, x: 10, y: 10, a: 0, b: 0, ...over });

// ---- event to line
ok(lineVariants(ev('drought', { a: 4800 }))?.[0] === 'droughtLong_1', 'a long drought uses droughtLong_1');
ok(lineVariants(ev('drought', { a: 1799 }))?.[0] === 'drought_1', 'a short drought uses drought_1');
ok(lineVariants(ev('stampede', { a: 59 })) === null, 'a small stampede earns no line');
ok(lineVariants(ev('stampede', { a: 60 }))?.length === 2, 'a big stampede has two variants');
ok(lineVariants(ev('packFounded', { a: 3 }))?.length === 2, 'a pack that earns a card is narrated');
ok(lineVariants(ev('packFounded', { a: 4 })) === null, 'a pack that earns no card is not');
ok(lineVariants(ev('packFounded', { a: 3, tick: 50 })) === null, 'the very first packs (tick <= 100) are not');
ok(lineVariants(ev('extinct', { sp: 0 }))?.[0] === 'extinct_bison', 'bison extinction');
ok(lineVariants(ev('extinct', { sp: 1 }))?.[0] === 'extinct_wolf', 'wolf extinction');
ok(lineVariants(ev('extinct', { sp: 2 }))?.[0] === 'extinct_raven', 'raven extinction');
ok(lineVariants(ev('extinct', { sp: 3 }))?.[0] === 'extinct_pronghorn', 'pronghorn extinction');
ok(lineVariants(ev('extinct', { sp: 4 })) === null && lineVariants(ev('extinct', { sp: 5 })) === null, 'no line for rabbits or cougars');
ok(lineVariants(ev('introduced', { sp: 1 }))?.[0] === 'introducedWolf_1', 'wolves introduced');
ok(lineVariants(ev('introduced', { sp: 0 })) === null, 'bison introduced: no line');
ok(lineVariants(ev('fire'))?.[0] === 'fire_1' && lineVariants(ev('firstKill'))?.[0] === 'firstKill_1', 'fire and first kill');
ok(lineVariants(ev('rain')) === null && lineVariants(ev('elder')) === null && lineVariants(ev('culled')) === null, 'the rest are silent');
ok(lineVariants(ev('outbreak'))?.length === 2 && lineVariants(ev('packLost'))?.length === 2, 'outbreak and packLost have two variants each');
// every id the map can return has text for the caption
for (const k of ['drought', 'outbreak', 'stampede', 'packFounded', 'packLost', 'fire', 'firstKill'] as SimEventKind[]) {
  for (const v of lineVariants(ev(k, { a: 4800 + 3 * 100, tick: 9000 })) ?? []) ok(!!NARRATION_TEXT[v], `text for ${v}`);
}
ok(NARRATION_IDS.length === 32 && NARRATION_IDS.every((i) => NARRATION_TEXT[i].length > 10), '32 lines, each with text');
ok(NARRATION_IDS.every((i) => !/[—–]/.test(NARRATION_TEXT[i])), 'no dashes in the spoken text');

// ---- R3 lines: the events Track S emits
ok(lineVariants(ev('immigrated', { sp: 1, a: 2 }))?.[0] === 'wolvesArrive_1', 'wolves arrive from outside');
ok(lineVariants(ev('immigrated', { sp: 3, a: 12 }))?.[0] === 'pronghornReturn_1', 'pronghorn return');
ok(lineVariants(ev('immigrated', { sp: 4, a: 10 })) === null && lineVariants(ev('immigrated', { sp: 7, a: 4 })) === null, 'the hare and prairie dog rescues are silent');
ok(lineVariants(ev('emigrated', { sp: 3, a: 40 }))?.[0] === 'pronghornLeave_1', 'pronghorn leave');
ok(lineVariants(ev('emigrated', { sp: 3, a: 2 })) === null && lineVariants(ev('emigrated', { sp: 1, a: 1 })) === null, 'a lone leaver is not worth a line');
ok(lineVariants(ev('recolonized', { sp: 1, a: 2 }))?.[0] === 'returned_1', 'a species returns');
ok(lineVariants(ev('distemper', { sp: 1, a: 3, b: 1 }))?.[0] === 'distemper_1' && lineVariants(ev('distemper', { sp: 1, a: 0, b: 0 })) === null, 'distemper, when it kills');
ok(lineVariants(ev('mange', { sp: 1, a: 4 }))?.[0] === 'mange_1', 'mange');
ok(lineVariants(ev('sylvaticPlague', { sp: 7, a: 30 }))?.[0] === 'plague_1', 'plague in the town');
ok(lineVariants(ev('townFounded', { sp: 7 })) === null, 'a town founded with no plague behind it is silent');
ok(lineVariants(ev('townFounded', { sp: 7 }), { sincePlague: 5000 })?.[0] === 'townBack_1', 'a town founded after a plague is a town recovering');
ok(lineVariants(ev('hareBoom', { sp: 4 }))?.[0] === 'hareBoom_1' && lineVariants(ev('hareCrash', { sp: 4 }))?.[0] === 'hareCrash_1', 'hare boom and crash');
ok(lineVariants(ev('coyotePups', { sp: 6, a: 4 }))?.[0] === 'coyotePups_1', 'coyote pups');
ok(lineVariants(ev('mesoRelease', { sp: 6 }))?.[0] === 'mesoRelease_1', 'coyotes take over');
ok(lineVariants(ev('lightningFire'))?.[0] === 'lightningFire_1' && lineVariants(ev('storm'))?.[0] === 'storm_1', 'lightning fire and a storm');
ok(priority('recolonized') > priority('sylvaticPlague') && priority('sylvaticPlague') > priority('storm') && priority('extinct') > priority('mesoRelease'), 'bigger news outranks smaller');
ok(priority('storm') > 0 && priority('townFounded') > 0 && priority('hareBoom') > priority('coyotePups'), 'every new kind has a priority');
ok((KIND_COOLDOWN_YEARS.emigrated ?? 0) >= 3 && (KIND_COOLDOWN_YEARS.storm ?? 0) >= 2, 'the yearly kinds are given a rest');

// ---- variants
ok(pickVariant(['a', 'b'], 'a', 0) === 'b' && pickVariant(['a', 'b'], 'b', 0.99) === 'a', 'a variant never repeats back to back');
ok(pickVariant(['only'], 'only', 0.5) === 'only', 'a lone variant repeats when it must');
const seen = new Set<string>();
for (let i = 0; i < 40; i++) seen.add(pickVariant(['a', 'b', 'c'], undefined, i / 40));
ok(seen.size === 3, 'all variants are reachable');

// ---- gates
const open = { enabled: true, filming: true, speed: 1, audioReady: true, muted: false, playing: false };
ok(gateOpen(open) && gateOpen({ ...open, speed: 10 }), 'open at 1x and 10x');
ok(!gateOpen({ ...open, speed: 100 }) && !gateOpen({ ...open, speed: 0 }) && !gateOpen({ ...open, speed: -1 }), 'closed at 100x, paused and skipping');
ok(!gateOpen({ ...open, enabled: false }), 'closed when the narrator is off');
ok(!gateOpen({ ...open, filming: false }), 'closed when nothing is filming');
ok(!gateOpen({ ...open, audioReady: false }), 'closed until audio is unlocked');
ok(!gateOpen({ ...open, muted: true }), 'closed while muted');
ok(!gateOpen({ ...open, playing: true }), 'closed while a line is playing (no overlap)');
ok(speedAllowsNarration(1) && speedAllowsNarration(10) && !speedAllowsNarration(100), 'speedAllowsNarration');
ok(!gapElapsed(MIN_GAP_MS - 1, 0) && gapElapsed(MIN_GAP_MS, 0) && gapElapsed(5, -Infinity), 'the 40 s gap');
ok(!isStale(MAX_AGE_MS, 0) && isStale(MAX_AGE_MS + 1, 0), 'the 8 s staleness');

// ---- the Narrator, against a stub audio director and a fake clock
class FakeAudio {
  muted = false;
  voiceReady = true;
  have = new Set(NARRATION_IDS);
  spoken: string[] = [];
  stops = 0;
  now: { id: string } | null = null;
  private resolveNow: ((v: boolean) => void) | null = null;
  loadVoices(): Promise<void> {
    return Promise.resolve();
  }
  hasVoice(id: string): boolean {
    return this.have.has(id);
  }
  get voiceNow(): { id: string; elapsed: number; duration: number } | null {
    return this.now ? { id: this.now.id, elapsed: 0, duration: 5 } : null;
  }
  speak(id: string): Promise<boolean> {
    if (!this.voiceReady || this.now) return Promise.resolve(false);
    this.spoken.push(id);
    this.now = { id };
    return new Promise<boolean>((res) => {
      this.resolveNow = res;
    });
  }
  /** The line ends. */
  finish(): void {
    this.now = null;
    this.resolveNow?.(true);
    this.resolveNow = null;
  }
  stopVoice(): void {
    this.stops++;
    this.finish();
  }
}

async function scenario(): Promise<void> {
  let t = 100000;
  const audio = new FakeAudio();
  const n = new Narrator(audio as unknown as AudioDirector, () => t, () => 0.1);
  const tick = async (ms: number, frame = { filming: true, speed: 1 }): Promise<void> => {
    t += ms;
    n.update(frame);
    await Promise.resolve();
  };

  // nothing is filming: an event waits, then goes stale
  n.onEvents([ev('fire')]);
  await tick(100, { filming: false, speed: 1 });
  ok(audio.spoken.length === 0, 'nothing speaks while nothing is filming');
  await tick(MAX_AGE_MS + 500, { filming: false, speed: 1 });
  await tick(100);
  ok(audio.spoken.length === 0, 'a stale event is dropped, not spoken late');

  // an event from far behind the present tick (a skipped stretch) is history
  n.onEvents([ev('fire', { tick: 1000 })], 5000);
  await tick(50);
  ok(audio.spoken.length === 0, 'an event more than 240 ticks behind the present is not narrated');

  // filming at 1x: a fresh event plays at once
  n.onEvents([ev('fire')]);
  await tick(50);
  ok(audio.spoken.length === 1 && audio.spoken[0] === 'fire_1', 'a fresh event speaks when the gate opens');
  ok(n.caption === NARRATION_TEXT.fire_1, 'the caption carries the spoken text while it plays');
  n.onEvents([ev('extinct', { sp: 1 })]);
  await tick(50);
  ok(audio.spoken.length === 1, 'no overlap: a second line waits for the first');
  audio.finish();
  await tick(50);
  ok(n.caption === null, 'the caption goes when the line ends');
  ok(audio.spoken.length === 1, 'the 40 s gap holds the next line back');
  await tick(MIN_GAP_MS - 2000);
  ok(audio.spoken.length === 1, 'still inside the gap');
  // the wolf extinction was waiting, but it is now stale (more than 8 s old): dropped
  await tick(3000);
  ok(audio.spoken.length === 1, 'a line that waited out the gap past 8 s is dropped');
  n.onEvents([ev('extinct', { sp: 1 })]);
  await tick(50);
  ok(audio.spoken.length === 2 && audio.spoken[1] === 'extinct_wolf', 'after the gap a fresh event speaks');
  audio.finish();
  await tick(50);

  // 100x: nothing plays
  await tick(MIN_GAP_MS + 100);
  n.onEvents([ev('drought', { a: 4800 })]);
  await tick(50, { filming: true, speed: 100 });
  ok(audio.spoken.length === 2, 'nothing speaks at 100x');
  await tick(50, { filming: true, speed: 10 });
  ok(audio.spoken.length === 3 && audio.spoken[2] === 'droughtLong_1', 'the same event speaks at 10x if still fresh');
  audio.finish();
  await tick(50);

  // the narrator off: silent, and switching it off stops a line
  await tick(MIN_GAP_MS + 100);
  n.enabled = false;
  n.onEvents([ev('fire')]);
  await tick(50);
  ok(audio.spoken.length === 3, 'nothing speaks with the narrator off');
  n.enabled = true;

  // muted: no line, and the allowance is not spent
  audio.muted = true;
  n.onEvents([ev('fire')]);
  await tick(50);
  ok(audio.spoken.length === 3, 'nothing speaks while muted');
  audio.muted = false;
  await tick(50);
  ok(audio.spoken.length === 4, 'it speaks once unmuted if the event is still fresh');
  audio.finish();
  await tick(50);

  // a missing file means no line, quietly
  await tick(MIN_GAP_MS + 100);
  audio.have.delete('fire_1');
  n.onEvents([ev('fire')]);
  await tick(50);
  ok(audio.spoken.length === 4, 'a line whose file is missing is skipped');
  audio.have.add('fire_1');

  // variants avoid a repeat
  await tick(MIN_GAP_MS + 100);
  n.onEvents([ev('outbreak')]);
  await tick(50);
  const first = audio.spoken[audio.spoken.length - 1];
  audio.finish();
  await tick(MIN_GAP_MS + 100);
  n.onEvents([ev('outbreak')]);
  await tick(50);
  ok(audio.spoken[audio.spoken.length - 1] !== first, 'an outbreak is not narrated the same way twice running');
  audio.finish();
  await tick(50);

  // the opening: six seconds after the documentary camera first takes over, once
  const a2 = new FakeAudio();
  let t2 = 0;
  const n2 = new Narrator(a2 as unknown as AudioDirector, () => t2, () => 0);
  const step = async (ms: number, filming: boolean): Promise<void> => {
    t2 += ms;
    n2.update({ filming, speed: 1 });
    await Promise.resolve();
  };
  await step(1000, false);
  await step(10, true);
  await step(OPENING_DELAY_MS - 500, true);
  ok(a2.spoken.length === 0, 'the opening waits about six seconds');
  await step(600, true);
  ok(a2.spoken.length === 1 && a2.spoken[0] === 'opening_1', 'the opening plays once the delay has passed');
  a2.finish();
  await step(MIN_GAP_MS + 1000, true);
  await step(10, false);
  await step(10, true);
  await step(OPENING_DELAY_MS + 100, true);
  ok(a2.spoken.length === 1, 'the opening plays only once per page load');

  // the opening yields to an event that came first
  const a3 = new FakeAudio();
  let t3 = 0;
  const n3 = new Narrator(a3 as unknown as AudioDirector, () => t3, () => 0);
  t3 += 10;
  n3.update({ filming: true, speed: 1 });
  n3.onEvents([ev('fire')]);
  t3 += 100;
  n3.update({ filming: true, speed: 1 });
  await Promise.resolve();
  a3.finish();
  t3 += OPENING_DELAY_MS + 100;
  n3.update({ filming: true, speed: 1 });
  await Promise.resolve();
  ok(a3.spoken.length === 1 && a3.spoken[0] === 'fire_1', 'if something else played, the opening is not owed');

  // the player taking the camera back before the opening cancels it, and the next takeover starts it afresh
  const a4 = new FakeAudio();
  let t4 = 0;
  const n4 = new Narrator(a4 as unknown as AudioDirector, () => t4, () => 0);
  n4.update({ filming: true, speed: 1 });
  t4 += 3000;
  n4.update({ filming: false, speed: 1 });
  t4 += 10000;
  n4.update({ filming: false, speed: 1 });
  ok(a4.spoken.length === 0, 'no opening while the player has the camera');
  n4.update({ filming: true, speed: 1 });
  t4 += OPENING_DELAY_MS + 100;
  n4.update({ filming: true, speed: 1 });
  await Promise.resolve();
  ok(a4.spoken[0] === 'opening_1', 'the next takeover starts the opening afresh');
}

await scenario();
if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`narration policy: all ${checks} checks passed`);
