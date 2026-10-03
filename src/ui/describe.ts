// Pure text helpers for the UI: calendar words, event sentences, chapter cards, animal captions.
// No DOM and no CSS imports here, so this file can be unit tested under plain Node (tsx).
import { SEASON_TICKS, SPECIES_NAMES, WEATHER_NAMES, YEAR_TICKS } from '../sim/types';
import { START_SEASON } from '../sim/env';
import type { SimEvent } from '../sim/sim';

/** Valley size in metres (DESIGN.md). Used only to turn an x,y into "eastern", "northern" and so on. */
const WORLD_SIZE = 512;

/** The sim opens late in the calendar year, so the calendar is offset exactly like env.ts does it. */
const CALENDAR_OFFSET = Math.round(START_SEASON * SEASON_TICKS);

export interface EventText {
  sentence: string;
  card?: { title: string; subtitle: string };
}

// ---------------------------------------------------------------------------------------------------------
// calendar words
// ---------------------------------------------------------------------------------------------------------

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
const MID_SEASON = ['mid-spring', 'midsummer', 'mid-autumn', 'midwinter'] as const;

/** env.season is 0..4 continuous (0 = spring start). Returns "late summer", "midwinter", "early spring". */
export function seasonPhrase(season: number): string {
  const s = ((season % 4) + 4) % 4;
  const i = Math.min(3, Math.floor(s));
  const f = s - i;
  if (f < 1 / 3) return `early ${SEASONS[i]}`;
  if (f < 2 / 3) return MID_SEASON[i];
  return `late ${SEASONS[i]}`;
}

/** Plain season name without early/mid/late. */
export function seasonName(season: number): string {
  return SEASONS[Math.min(3, Math.floor((((season % 4) + 4) % 4)))];
}

/** dayFrac: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export function timeOfDay(dayFrac: number): string {
  const d = ((dayFrac % 1) + 1) % 1;
  if (d < 0.18) return 'night';
  if (d < 0.29) return 'dawn';
  if (d < 0.42) return 'morning';
  if (d < 0.58) return 'midday';
  if (d < 0.69) return 'afternoon';
  if (d < 0.75) return 'evening';
  if (d < 0.83) return 'dusk';
  return 'night';
}

const WEATHER_WORDS = ['clear', 'rain', 'drought', 'storm', 'snow'];
export function weatherWord(w: number): string {
  return WEATHER_WORDS[w] ?? WEATHER_NAMES[w] ?? 'clear';
}

/** Calendar year shown to the player. The sim's env.year is zero-based, the player's first year is year 1. */
export function yearOfTick(tick: number): number {
  return Math.floor((tick + CALENDAR_OFFSET) / YEAR_TICKS) + 1;
}

/** First tick of a player-facing year (inverse of yearOfTick). */
export function yearStartTick(year: number): number {
  return (year - 1) * YEAR_TICKS - CALENDAR_OFFSET;
}

/** Continuous season value (0..4) for a tick. */
export function seasonOfTick(tick: number): number {
  return (((tick + CALENDAR_OFFSET) % YEAR_TICKS) + YEAR_TICKS) % YEAR_TICKS / SEASON_TICKS;
}

/** "Year 12, late summer" */
export function whenPhrase(tick: number): string {
  return `Year ${yearOfTick(tick)}, ${seasonPhrase(seasonOfTick(tick))}`;
}

// ---------------------------------------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------------------------------------

const SINGULAR = ['bison', 'wolf', 'raven', 'pronghorn', 'rabbit', 'cougar'];
const PLURAL = ['bison', 'wolves', 'ravens', 'pronghorn', 'rabbits', 'cougars'];
const GROUP = ['herd', 'packs', 'flocks', 'herd', 'warrens', 'cougars'];

export function speciesName(sp: number): string {
  return SPECIES_NAMES[sp] ?? 'Animal';
}
export const singular = (sp: number): string => SINGULAR[sp] ?? 'animal';
export const plural = (sp: number): string => PLURAL[sp] ?? 'animals';
const groupNoun = (sp: number): string => GROUP[sp] ?? 'herd';

const PACK_NAMES = [
  'Ridge', 'Creek', 'Bluff', 'Hollow', 'Cottonwood', 'Switchgrass', 'Sandstone', 'Willow',
  'Bluestem', 'Hawthorn', 'Prairie', 'Timber', 'Redcedar', 'Limestone', 'Meadow', 'Thistle',
  'Cutbank', 'Plum', 'Sumac', 'Sedge', 'Fallow', 'Windbreak', 'Larkspur', 'Dogwood',
];
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** Stable, readable name for a pack serial number: "Ridge", "Creek", ... then "Ridge II". */
export function packName(serial: number): string {
  const s = Math.max(1, Math.floor(serial)) - 1;
  const base = PACK_NAMES[s % PACK_NAMES.length];
  const lap = Math.floor(s / PACK_NAMES.length);
  return base + (ROMAN[lap] ?? ` ${lap + 1}`);
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** Small counts as words in running prose, larger as digits with a thousands separator. */
export function countWord(n: number): string {
  const r = Math.round(n);
  return r >= 0 && r < NUMBER_WORDS.length ? NUMBER_WORDS[r] : r.toLocaleString('en-US');
}
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Rough compass word for a position in the valley, or '' when the position is unknown (0,0) or central. */
export function regionWord(x: number, y: number): string {
  if (x === 0 && y === 0) return '';
  const dx = x - WORLD_SIZE / 2, dy = y - WORLD_SIZE / 2;
  const t = WORLD_SIZE * 0.17;
  if (Math.abs(dx) < t && Math.abs(dy) < t) return 'central';
  const ns = dy > t ? 'northern' : dy < -t ? 'southern' : '';
  const ew = dx > t ? 'eastern' : dx < -t ? 'western' : '';
  if (ns && ew) {
    if (Math.abs(dy) > Math.abs(dx) * 1.8) return ns;
    if (Math.abs(dx) > Math.abs(dy) * 1.8) return ew;
    return `${ns.replace('ern', '')}${ew}`; // north + eastern = northeastern
  }
  return ns || ew || 'central';
}

// ---------------------------------------------------------------------------------------------------------
// ages and captions
// ---------------------------------------------------------------------------------------------------------

/** Age in ticks to "6 years" / "1.4 years" (one decimal under 2 years). */
export function ageText(ticks: number): string {
  const y = ticks / YEAR_TICKS;
  if (y < 2) {
    const t = y.toFixed(1);
    return t === '1.0' ? '1 year' : `${t} years`;
  }
  return `${Math.floor(y)} years`;
}

/** Documentary caption: "Bison cow, 6 years". */
export function animalCaption(sp: number, male: boolean, age: number, matureAge: number, alpha = false): string {
  const juvenile = age < matureAge;
  const S = speciesName(sp);
  let name: string;
  switch (sp) {
    case 0: name = juvenile ? 'Bison calf' : male ? 'Bison bull' : 'Bison cow'; break;
    case 1: name = juvenile ? 'Wolf pup' : `${alpha ? 'Alpha ' : ''}${male ? (alpha ? 'male wolf' : 'Male wolf') : (alpha ? 'female wolf' : 'Female wolf')}`; break;
    case 2: name = juvenile ? 'Raven fledgling' : 'Raven'; break;
    case 3: name = juvenile ? 'Pronghorn fawn' : male ? 'Pronghorn buck' : 'Pronghorn doe'; break;
    case 4: name = juvenile ? 'Rabbit kit' : male ? 'Rabbit buck' : 'Rabbit doe'; break;
    case 5: name = juvenile ? 'Cougar cub' : male ? 'Male cougar' : 'Female cougar'; break;
    default: name = S;
  }
  return `${name}, ${ageText(age)}`;
}

/** "Generation 12, daughter of #18233" (or the founders' line). */
export function lineageText(sp: number, gen: number, male: boolean, parentA: number): string {
  if (gen <= 0 || parentA <= 0) return `One of the first ${plural(sp)} in the valley`;
  return `Generation ${gen}, ${male ? 'son' : 'daughter'} of #${parentA}`;
}

const ACTIVITY = [
  'standing quietly', 'grazing', 'walking', 'running', 'fleeing danger', 'chasing prey',
  'feeding', 'drinking at the water', 'resting', 'in flight', 'stalking prey',
];
/** St index to plain words, with a few species-specific tweaks. */
export function activityPhrase(sp: number, state: number): string {
  if (sp === 2) {
    if (state === 0) return 'perched';
    if (state === 2) return 'hopping along the ground';
    if (state === 6) return 'feeding on a carcass';
  }
  if (sp === 1) {
    if (state === 6) return 'feeding on a kill';
    if (state === 4) return 'backing off';
    if (state === 8) return 'resting with the pack';
  }
  if (sp === 4 && state === 4) return 'bolting for cover';
  return ACTIVITY[state] ?? STATE_FALLBACK;
}
const STATE_FALLBACK = 'moving about';

// ---------------------------------------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------------------------------------

/** How much a chapter card matters when two compete or the rate limit is on. Higher wins. */
export function cardRank(kind: string): number {
  switch (kind) {
    case 'extinct': return 5;
    case 'introduced': return 4;
    case 'drought': return 4;
    case 'fire': return 3;
    case 'outbreak': return 3;
    case 'stampede': return 2;
    case 'packLost': return 2;
    case 'packFounded': return 1;
    default: return 0;
  }
}

/**
 * One plain sentence for the chronicle, plus a chapter card for the events that earn one.
 * Pure: depends only on the event.
 */
export function describeEvent(e: SimEvent): EventText {
  const when = whenPhrase(e.tick);
  const year = yearOfTick(e.tick);
  const known = e.sp >= 0 && e.sp < SINGULAR.length;
  const sg = known ? SINGULAR[e.sp] : 'animal';
  const pl = known ? PLURAL[e.sp] : 'animals';
  const region = regionWord(e.x, e.y);

  switch (e.kind) {
    case 'packFounded': {
      const name = packName(e.a);
      return {
        sentence: `The ${name} pack is founded.`,
        card: e.tick > 100 && e.a % 3 === 0 ? { title: 'A new pack takes the ridge', subtitle: `The ${name} pack, year ${year}` } : undefined,
      };
    }
    case 'packLost': {
      const name = packName(e.a);
      return {
        sentence: `The ${name} pack has broken up.`,
        card: { title: 'A pack falls silent', subtitle: `The ${name} pack, year ${year}` },
      };
    }
    case 'drought': {
      const long = e.a >= 1800;
      return {
        sentence: long ? 'A long drought settles over the valley.' : 'A drought settles over the valley.',
        card: { title: long ? 'The long drought' : 'A dry spell', subtitle: when },
      };
    }
    case 'droughtEnd':
      return { sentence: 'The drought breaks.' };
    case 'outbreak': {
      const noun = groupNoun(e.sp);
      const where = `the ${region && region !== 'central' ? `${region} ` : ''}${noun}`;
      const sick = e.a > 0 ? `, and ${countWord(e.a)} fall ill` : '';
      return {
        sentence: `Disease spreads through ${where}${sick}.`,
        card: { title: `Sickness in the ${noun}`, subtitle: when },
      };
    }
    case 'stampede': {
      const where = region && region !== 'central' ? `the ${region} plain` : 'the plain';
      return {
        sentence: `A herd of ${e.a.toLocaleString('en-US')} bison stampedes across ${where}.`,
        card: e.a >= 60 ? { title: 'Stampede on the plain', subtitle: when } : undefined,
      };
    }
    case 'extinct':
      return {
        sentence: `The last ${sg} is gone.`,
        card: { title: `The last ${sg} is gone`, subtitle: when },
      };
    case 'introduced': {
      const n = Math.max(1, Math.round(e.a));
      const few = n <= 12;
      let sentence: string;
      if (e.sp === 1) {
        sentence = few ? `${cap(countWord(n))} ${n === 1 ? 'wolf returns' : 'wolves return'} to the valley.` : `A group of ${countWord(n)} wolves returns to the valley.`;
      } else {
        sentence = few ? `${cap(countWord(n))} ${n === 1 ? sg : pl} ${n === 1 ? 'is' : 'are'} brought into the valley.` : `A group of ${countWord(n)} ${pl} is brought into the valley.`;
      }
      const title = e.sp === 1 ? 'Wolves return' : e.sp === 5 ? 'The cougar returns' : `${cap(pl)} arrive`;
      return { sentence, card: { title, subtitle: when } };
    }
    case 'removed':
      return { sentence: `The ${pl} are removed from the valley.` };
    case 'culled': {
      const n = Math.max(0, Math.round(e.a));
      return { sentence: `A cull takes ${countWord(n)} ${n === 1 ? sg : pl} from the ${groupNoun(e.sp)}.` };
    }
    case 'fire':
      return {
        sentence: region && region !== 'central' ? `A fire sweeps across the ${region} prairie.` : 'A fire breaks out on the prairie.',
        card: { title: 'Fire on the prairie', subtitle: when },
      };
    case 'plague': {
      const n = Math.round(e.a);
      return { sentence: `A plague is loosed among the ${pl}${n > 0 ? `, and ${countWord(n)} fall ill` : ''}.` };
    }
    case 'rain':
      return { sentence: 'Rain falls across the valley.' };
    case 'elder':
      return { sentence: `An elder ${sg}, ${ageText(e.a)} old, still roams the valley.` };
    case 'firstKill': {
      const prey = e.a >= 0 && e.a < SINGULAR.length ? SINGULAR[e.a] : 'animal';
      return { sentence: `The valley sees its first kill: a wolf takes down a ${prey}.` };
    }
    case 'record':
      return { sentence: 'A new record is set in the valley.' };
    default:
      return { sentence: 'Something stirs in the valley.' };
  }
}

/** Whether the event has a position the camera can fly to. */
export function hasPosition(e: SimEvent): boolean {
  return e.x !== 0 || e.y !== 0;
}

/** Format a count for display: 1,234. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
