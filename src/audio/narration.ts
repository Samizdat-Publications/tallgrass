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
  // R3: the small-prey web, the canines' troubles, the storms and the valley's comings and goings
  wolvesArrive_1: 'Wolves have come in from beyond the valley. A new pair finds an empty den and settles in.',
  returned_1: 'An animal that had vanished from the valley has found its own way back.',
  pronghornLeave_1: 'Winter is coming, and the pronghorn drift out of the valley toward the open prairie.',
  pronghornReturn_1: 'With the spring, the pronghorn return.',
  distemper_1: 'Distemper moves through the canines. It spreads where they gather, and the young are the first to go.',
  mange_1: 'Mange has taken hold. The coats thin out, and a hard winter will finish what it started.',
  plague_1: 'Plague has reached the prairie dog town. Within a season, almost every one of them will be gone.',
  townBack_1: 'A few survivors start digging again. Slowly, the town comes back.',
  hareBoom_1: 'Jackrabbits are everywhere. A year like this does not last.',
  hareCrash_1: 'The jackrabbits have crashed. The prairie is suddenly much quieter.',
  coyotePups_1: 'Coyote pups at the den. Small, quick, and always hungry.',
  mesoRelease_1: 'With the wolves so few, the coyotes have taken their place. The valley has a new hunter.',
  lightningFire_1: 'Lightning strikes the dry grass, and the prairie catches fire.',
  storm_1: 'A thunderstorm crosses the valley. The air goes still, and then the sky breaks open.',
  // v10: the climate regimes (wet and dry runs of decades)
  climateWet_1: 'The rains have come back. For the next few years the grass will stand tall, and the herds will grow into it.',
  climateWet_2: 'A run of wet years. The valley is as green as it has been in a generation.',
  climateDry_1: 'The wet years are over. Summer after summer the grass will cure early, and the herds will thin.',
  megadrought_1: 'This is no ordinary dry spell. The drought will hold for years, and the valley will not look the same when it ends.',
  climateMild_1: 'The weather settles back into ordinary years, and the valley begins to find its balance again.',
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

/** What the narrator remembers about the valley that a single event cannot say. */
export interface NarrationContext {
  /** Ticks since the last prairie dog plague this page has seen (undefined when none): a town founded after one is "coming back". */
  sincePlague?: number;
}

/** A town founded within this many valley years of a plague is a town coming back. */
export const TOWN_BACK_YEARS = 40;

/** The variant ids of the lines that suit a sim event, or null when it earns no narration. */
export function lineVariants(e: SimEvent, ctx: NarrationContext = {}): string[] | null {
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
    // R3
    case 'immigrated': return e.sp === 1 ? ['wolvesArrive_1'] : e.sp === 3 ? ['pronghornReturn_1'] : null;
    case 'emigrated': return e.sp === 3 && e.a >= 5 ? ['pronghornLeave_1'] : null;
    case 'recolonized': return ['returned_1'];
    case 'distemper': return e.a + e.b > 0 ? ['distemper_1'] : null;
    case 'mange': return ['mange_1'];
    case 'sylvaticPlague': return ['plague_1'];
    case 'townFounded': return ctx.sincePlague !== undefined && ctx.sincePlague >= 0 ? ['townBack_1'] : null;
    case 'hareBoom': return ['hareBoom_1'];
    case 'hareCrash': return ['hareCrash_1'];
    case 'coyotePups': return ['coyotePups_1'];
    case 'mesoRelease': return ['mesoRelease_1'];
    case 'lightningFire': return ['lightningFire_1'];
    case 'storm': return ['storm_1'];
    case 'climateWet': return ['climateWet_1', 'climateWet_2'];
    case 'climateDry': return ['climateDry_1'];
    case 'megadrought': return ['megadrought_1'];
    case 'climateMild': return ['climateMild_1'];
    default: return null;
  }
}

/** Bigger news wins when two lines compete for the one free slot. */
export function priority(kind: string): number {
  switch (kind) {
    case 'extinct': return 9;
    case 'megadrought': return 7.5;
    case 'recolonized': return 8.5;
    case 'introduced': return 8;
    case 'mesoRelease': return 7.8;
    case 'drought': return 7;
    case 'sylvaticPlague': return 6.8;
    case 'immigrated': return 6.5;
    case 'lightningFire': return 6.2;
    case 'fire': return 6;
    case 'distemper': return 5.5;
    case 'outbreak': return 5;
    case 'mange': return 4.5;
    case 'stampede': return 4;
    case 'emigrated': return 3.5;
    case 'hareBoom': return 3.2;
    case 'hareCrash': return 3.2;
    case 'packLost': return 3;
    case 'coyotePups': return 2.5;
    case 'climateWet': return 6.6;
    case 'climateDry': return 6.6;
    case 'climateMild': return 3.4;
    case 'storm': return 2.2;
    case 'townFounded': return 2;
    case 'packFounded': return 2;
    case 'firstKill': return 2;
    default: return 0;
  }
}

/**
 * Kinds that come round again and again get a rest: at most one line per this many valley years for the same kind and species
 * (the pronghorn leave every autumn, a storm crosses every summer). Kinds not listed are limited only by the 40 s between lines.
 */
export const KIND_COOLDOWN_YEARS: Record<string, number> = {
  emigrated: 4, storm: 3, mange: 3, distemper: 2, hareBoom: 5, hareCrash: 5, coyotePups: 3, immigrated: 2, townFounded: 3, lightningFire: 2,
};

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
