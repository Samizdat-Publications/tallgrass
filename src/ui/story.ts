// The documentary "life story" of the selected animal: raw story entries from the sim become short captions with the
// valley's year and season, and a death becomes an "In memoriam" line. Pure text, no DOM, so it can run under Node.
import { SPECIES_COUNT, YEAR_TICKS } from '../sim/types';
import { SPECIES, isPredator as isRegistryPredator } from '../sim/species';
import type { StoryEntry } from '../sim/sim';
import { ageText, countWord, plural, seasonNameAt, seasonPhraseAt, singular, yearOfTick } from './describe';

export interface StoryLine {
  tick: number;
  /** "Spring, year 4" */
  when: string;
  /** "Bolted from wolves twice." */
  text: string;
}

export interface StorySubject {
  sp: number;
  male: boolean;
}

/** What each species calls its young, by registry key. A species with no entry says "young one". */
const YOUNG_BY_KEY: Record<string, [string, string]> = {
  bison: ['calf', 'calves'],
  wolf: ['pup', 'pups'],
  raven: ['chick', 'chicks'],
  pronghorn: ['fawn', 'fawns'],
  rabbit: ['kit', 'kits'],
  cougar: ['kitten', 'kittens'],
  coyote: ['pup', 'pups'],
  prairiedog: ['pup', 'pups'],
  eagle: ['chick', 'chicks'],
  hawk: ['chick', 'chicks'],
  muledeer: ['fawn', 'fawns'],
  beaver: ['kit', 'kits'],
};
export const youngOf = (sp: number, n: number): string => (YOUNG_BY_KEY[SPECIES[sp]?.key ?? ''] ?? ['young one', 'young ones'])[n === 1 ? 0 : 1];

/** Hunters in the story's sense: it gives chase and makes kills (wolf, cougar, and any predator the registry adds). */
const isPredator = (sp: number): boolean => isRegistryPredator(sp);
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
const times = (n: number): string => (n === 2 ? 'twice' : `${countWord(n)} times`);
const validSp = (a: number): boolean => a >= 0 && a < SPECIES_COUNT;

/** "Spring, year 4": the season name and the valley year of a tick. */
export function whenShort(tick: number): string {
  return `${cap(seasonNameAt(tick))}, year ${yearOfTick(tick)}`;
}

interface Group {
  kind: StoryEntry['kind'] | 'illness';
  a: number;
  first: number;
  last: number;
  n: number;
  recovered?: number;
}

/** Merge consecutive repeats ("bolted from wolves twice") and pair an illness with its recovery. */
function group(entries: StoryEntry[]): Group[] {
  const out: Group[] = [];
  const mergeable = new Set(['fled', 'chase', 'kill']);
  for (const e of entries) {
    if (e.kind === 'died') continue;
    const prev = out[out.length - 1];
    if (prev && mergeable.has(e.kind) && prev.kind === e.kind && prev.a === e.a && e.tick - prev.first < YEAR_TICKS) {
      prev.n++;
      prev.last = e.tick;
      continue;
    }
    if (e.kind === 'recovered' && prev && prev.kind === 'illness' && prev.recovered === undefined) {
      prev.recovered = e.tick;
      continue;
    }
    if (e.kind === 'infected') {
      out.push({ kind: 'illness', a: 0, first: e.tick, last: e.tick, n: 1 });
      continue;
    }
    out.push({ kind: e.kind, a: e.a, first: e.tick, last: e.tick, n: 1 });
  }
  return out;
}

function lineText(g: Group, who: StorySubject): string {
  switch (g.kind) {
    case 'fled': {
      if (!validSp(g.a)) return g.n > 1 ? `Bolted for safety ${times(g.n)}.` : 'Bolted for safety.';
      return g.n > 1 ? `Bolted from ${plural(g.a)} ${times(g.n)}.` : `Bolted from a ${singular(g.a)}.`;
    }
    case 'chase': {
      if (who.sp === 5) {
        // a cougar waits in cover and rushes
        if (!validSp(g.a)) return g.n > 1 ? `Burst from cover ${times(g.n)}.` : 'Burst from cover.';
        return g.n > 1 ? `Burst from cover after ${plural(g.a)} ${times(g.n)}.` : `Burst from cover after a ${singular(g.a)}.`;
      }
      if (isPredator(who.sp)) {
        if (!validSp(g.a)) return g.n > 1 ? `Gave chase ${times(g.n)}.` : 'Gave chase.';
        return g.n > 1 ? `Gave chase to ${plural(g.a)} ${times(g.n)}.` : `Gave chase to a ${singular(g.a)}.`;
      }
      if (!validSp(g.a)) return g.n > 1 ? `Was chased ${times(g.n)}.` : 'Was chased.';
      return g.n > 1 ? `Was chased by ${plural(g.a)} ${times(g.n)}.` : `Was chased by a ${singular(g.a)}.`;
    }
    case 'kill': {
      if (who.sp === 5) {
        if (!validSp(g.a)) return g.n > 1 ? `Made ${countWord(g.n)} ambush kills.` : 'Made an ambush kill.';
        return g.n > 1 ? `Ambushed ${countWord(g.n)} ${plural(g.a)}.` : `Ambushed a ${singular(g.a)}.`;
      }
      if (!validSp(g.a)) return g.n > 1 ? `Made ${countWord(g.n)} kills.` : 'Made a kill.';
      return g.n > 1 ? `Took down ${countWord(g.n)} ${plural(g.a)}.` : `Took down a ${singular(g.a)}.`;
    }
    case 'birth': {
      const n = Math.max(1, Math.round(g.a));
      if (n === 1) return `Gave birth to a ${youngOf(who.sp, 1)}.`;
      return `Had a litter of ${countWord(n)} ${youngOf(who.sp, n)}.`;
    }
    case 'illness': {
      if (g.recovered === undefined) return 'Fell ill.';
      const same = seasonNameAt(g.recovered) === seasonNameAt(g.first) && yearOfTick(g.recovered) === yearOfTick(g.first);
      return same ? 'Fell ill and recovered soon after.' : `Fell ill; recovered by ${seasonNameAt(g.recovered)}.`;
    }
    case 'recovered':
      return 'Recovered from an illness.';
    case 'dispersed':
      return 'Left its pack with a mate to found a new one.';
    default:
      return 'Something happened.';
  }
}

/** The story so far as captions, oldest first (newest at the bottom). */
export function buildStory(entries: StoryEntry[], who: StorySubject): StoryLine[] {
  return group(entries).map((g) => ({ tick: g.first, when: whenShort(g.first), text: lineText(g, who) }));
}

/**
 * A one-line backstory for an animal that was there at the start (or was brought in by hand), so a founder's story
 * never opens on "Nothing to tell yet". Null for animals born in the valley later.
 */
export function backstory(who: StorySubject & { gen: number; bornTick: number; pack: number }): StoryLine | null {
  if (who.gen > 0) return null;
  const introduced = who.bornTick > 100;
  let text: string;
  switch (who.sp) {
    case 0: text = introduced ? 'Was brought into the valley to join the herds.' : 'Came into the valley with the first herds.'; break;
    case 1: text = introduced ? 'Was brought into the valley to found a new pack.' : 'One of the founding pack.'; break;
    case 2: text = 'One of the first ravens to settle the valley.'; break;
    case 3: text = introduced ? 'Was brought into the valley to join the pronghorn.' : 'Came into the valley with the first pronghorn bands.'; break;
    case 4: text = 'One of the first rabbits of the valley.'; break;
    case 5: text = 'One of the first cougars to take the groves along the creek.'; break;
    default: text = 'One of the first animals in the valley.';
  }
  return { tick: introduced ? who.bornTick : 0, when: introduced ? whenShort(who.bornTick) : 'At the start', text };
}

export function diedEntry(entries: StoryEntry[]): StoryEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].kind === 'died') return entries[i];
  return null;
}

/** How the animal met its end, from the death cause code and the last thing that was chasing it. */
export function causePhrase(code: number, who: StorySubject, entries: StoryEntry[], diedTick: number): string {
  switch (code) {
    case 0: return 'Starved';
    case 1: return 'Died of thirst';
    case 2: return 'Died of old age';
    case 3: {
      // the species it last fled from is the likeliest killer
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.kind === 'fled' && validSp(e.a) && diedTick - e.tick < 1200) return `Killed by ${plural(e.a)}`;
      }
      return isPredator(who.sp) ? 'Killed in a struggle' : 'Killed by a predator';
    }
    case 4: return 'Taken in a cull';
    case 5: return 'Removed from the valley';
    case 6: return 'Left the valley for the open prairie';
    case 7: return 'Died of distemper';
    default: return 'Died';
  }
}

/** "Killed by wolves in late autumn, year 9, aged 11 bison years. Mother of four calves." */
export function memorialText(
  who: StorySubject,
  entries: StoryEntry[],
  died: StoryEntry,
  ageTicks: number,
  maxAge: number,
  children: number,
): string {
  const cause = causePhrase(died.a, who, entries, died.tick);
  const when = `${seasonPhraseAt(died.tick)}, year ${yearOfTick(died.tick)}`;
  let s = `${cause} in ${when}, aged ${ageText(ageTicks, who.sp, maxAge)}.`;
  if (children > 0) s += ` ${who.male ? 'Father' : 'Mother'} of ${countWord(children)} ${youngOf(who.sp, children)}.`;
  return s;
}
