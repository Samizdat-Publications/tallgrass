// The documentary narrator's policy, as pure functions (no Web Audio, no DOM) so it can be unit tested.
// Voice-over files live in public/audio/narration/<id>.mp3; tools/narration.py is where the lines are written and
// generated. The text is mirrored here (not parsed from the Python) for the cinematic caption.
import type { SimEvent } from '../sim/sim';
import { describeEvent } from '../ui/describe';

/** id to spoken text. Keep in step with LINES in tools/narration.py. */
export const NARRATION_TEXT: Record<string, string> = {
  opening_1: 'Tallgrass prairie. Bison, pronghorn, wolves and ravens, and the grass that feeds them all.',
  firstKill_1: 'The first kill. From here on, the wolves and the herds will shape each other.',
  packFounded_1: 'A young pair has struck out on its own. A new pack claims the ridge.',
  packFounded_2: 'New wolves, new borders. Another pack carves out its range.',
  packLost_1: 'One of the packs has broken apart. Its territory falls quiet.',
  packLost_2: 'A pack falls silent. Its survivors will scatter, or join another.',
  droughtLong_1: 'The rains have failed. A long drought settles over the valley, and every animal here will feel it.',
  drought_1: 'A dry spell. The grass cures early, and the herds must walk farther to graze.',
  outbreak_1: 'Sickness moves through the herd. The weak and the crowded fall first.',
  outbreak_2: 'Disease spreads where the animals crowd together. It will thin the herd.',
  stampede_1: 'Something has startled the herd. Hundreds of bison break into a run.',
  stampede_2: 'Panic spreads faster than any wolf. The whole herd is on the move.',
  extinct_bison: 'The last bison is gone. The valley will have to find a new balance without them.',
  extinct_wolf: 'The last wolf is gone. Without hunters, the herds will grow, and the grass will pay for it.',
  extinct_pronghorn: 'The last pronghorn has gone from the valley.',
  extinct_raven: 'The ravens have abandoned the valley.',
  introducedWolf_1: 'Wolves return to the valley. The herds have forgotten what it means to be watched.',
  fire_1: 'Fire on the prairie. It looks like ruin, but within a season the burned ground will be the greenest in the valley.',
};

export const NARRATION_IDS = Object.keys(NARRATION_TEXT);

/** Policy numbers. Real seconds unless said otherwise. */
export const MIN_GAP_MS = 40000;
/** A line whose event is older than this when it could play is dropped: no stale backlog. */
export const MAX_AGE_MS = 8000;
/** The opening line comes this long after the documentary camera first takes over. */
export const OPENING_DELAY_MS = 6000;
/** How much the ambient bed and SFX give way while a line plays. */
export const DUCK_AMOUNT = 0.4;
export const DUCK_RAMP_S = 0.3;

const EXTINCT_IDS: Record<number, string> = { 0: 'extinct_bison', 1: 'extinct_wolf', 2: 'extinct_raven', 3: 'extinct_pronghorn' };

/** A chapter card is earned by exactly what describeEvent says it is: one source of truth for "worth a moment". */
function earnsCard(e: SimEvent): boolean {
  return !!describeEvent(e).card;
}

/** The variant ids of the lines that suit a sim event, or null when it earns no narration. */
export function lineVariants(e: SimEvent): string[] | null {
  switch (e.kind) {
    case 'packFounded': return earnsCard(e) ? ['packFounded_1', 'packFounded_2'] : null;
    case 'packLost': return ['packLost_1', 'packLost_2'];
    case 'drought': return [e.a >= 1800 ? 'droughtLong_1' : 'drought_1'];
    case 'outbreak': return ['outbreak_1', 'outbreak_2'];
    case 'stampede': return earnsCard(e) ? ['stampede_1', 'stampede_2'] : null;
    case 'extinct': return EXTINCT_IDS[e.sp] ? [EXTINCT_IDS[e.sp]] : null;
    case 'introduced': return e.sp === 1 ? ['introducedWolf_1'] : null;
    case 'fire': return ['fire_1'];
    case 'firstKill': return ['firstKill_1'];
    default: return null;
  }
}

/** Bigger news wins when two lines compete for the one free slot. */
export function priority(kind: string): number {
  switch (kind) {
    case 'extinct': return 9;
    case 'introduced': return 8;
    case 'drought': return 7;
    case 'fire': return 6;
    case 'outbreak': return 5;
    case 'stampede': return 4;
    case 'packLost': return 3;
    case 'packFounded': return 2;
    case 'firstKill': return 2;
    default: return 0;
  }
}

/** Pick a variant at random, never the one that was used last for this kind when there is a choice. */
export function pickVariant(variants: string[], last: string | undefined, rnd: number): string {
  const pool = variants.length > 1 && last ? variants.filter((v) => v !== last) : variants;
  return pool[Math.min(pool.length - 1, Math.floor(rnd * pool.length))];
}

/** Everything that decides whether a line may start right now. */
export interface Gate {
  /** The narrator switch. */
  enabled: boolean;
  /** The documentary camera or cinematic mode is filming. */
  filming: boolean;
  /** Sim speed multiplier (-1 while skipping to the next event). */
  speed: number;
  /** The audio context has been unlocked by a click and is running. */
  audioReady: boolean;
  /** M has muted the game. */
  muted: boolean;
  /** A line is playing. */
  playing: boolean;
}

/** Only at 1x or 10x: at 100x years fly by and a sentence would describe a different valley by the time it ended. */
export function speedAllowsNarration(speed: number): boolean {
  return speed === 1 || speed === 10;
}

export function gateOpen(g: Gate): boolean {
  return g.enabled && g.filming && g.audioReady && !g.muted && !g.playing && speedAllowsNarration(g.speed);
}

/** True once enough real time has passed since the last line started. */
export function gapElapsed(nowMs: number, lastStartMs: number): boolean {
  return nowMs - lastStartMs >= MIN_GAP_MS;
}

/** True when an event is too old to be worth saying. */
export function isStale(nowMs: number, eventMs: number): boolean {
  return nowMs - eventMs > MAX_AGE_MS;
}
