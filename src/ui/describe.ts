// Pure text helpers for the UI: calendar words, event sentences, chapter cards, animal captions.
// No DOM and no CSS imports here, so this file can be unit tested under plain Node (tsx).
import { defaultParams } from '../sim/params';
import { SEASON_TICKS, SPECIES_NAMES, WEATHER_NAMES, YEAR_TICKS } from '../sim/types';
import { START_SEASON } from '../sim/env';
import type { SimEvent } from '../sim/sim';

/** Valley size in metres (DESIGN.md). Used only to turn an x,y into "eastern", "northern" and so on. */
const WORLD_SIZE = 512;

/** The sim opens late in the calendar year, so the calendar is offset exactly like env.ts does it (read at use time:
 *  the calendar scale is set at startup). */
const calendarOffset = () => Math.round(START_SEASON * SEASON_TICKS);

/** What the caller knows that the event itself does not say. */
export interface DescribeContext {
  /** For a pack that broke up: true when the wolf count fell around then, false when it did not, undefined when unknown. */
  wolvesFell?: boolean;
  /** Shifts which phrasing is chosen (0 by default). The chronicle voice raises it to avoid saying the same thing twice in a row. */
  salt?: number;
  /** For an introduction: true when the species was already living in the valley (so the newcomers do not "return"). */
  alreadyHere?: boolean;
}

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

/**
 * What the renderer is actually showing in the sky and on the ground, all eased 0..1 (the engine's own state, so the status
 * line can never say snow over a clear sky). `blizzardPending` is true while a blizzard event is running but its snow has not
 * yet built up on screen (or the sim is paused right after the tool was used).
 */
export interface SkyView {
  snow: number;
  blizzard: number;
  rain: number;
  drought: number;
  dustStorm: number;
  flood: number;
  overcast: number;
  blizzardPending?: boolean;
  /** Climate regimes: the eased wet and dry index as drawn (-1 driest .. 1 wettest; absent or 0 with climate2 off) and whether a megadrought holds. */
  climate?: number;
  megadrought?: boolean;
  /** The light is held on one steady time of day while time flies (about 30x and up), so the slate leaves the time of day out. */
  lapse?: boolean;
}

/** The index past which a run of years earns a word in the header, and the (looser) line it must fall back across before the word goes. */
const CLIMATE_ON = 0.45;
const CLIMATE_OFF = 0.35;

/**
 * The climate word for the header, or '' in ordinary years: "Megadrought" while one holds, "Wet years" past +0.45, "Dry years" past -0.45.
 * `shown` is the word returned last time: it keeps its word until the index falls back past 0.35, so the header never flickers on the line.
 */
export function climateWord(sky: SkyView | undefined, shown = ''): string {
  if (!sky) return '';
  if (sky.megadrought) return 'Megadrought';
  const c = sky.climate ?? 0;
  const wet = shown === 'Wet years' ? CLIMATE_OFF : CLIMATE_ON;
  const dry = shown === 'Dry years' || shown === 'Megadrought' ? CLIMATE_OFF : CLIMATE_ON;
  if (c > wet) return 'Wet years';
  if (c < -dry) return 'Dry years';
  return '';
}

/** An eased amount must pass this before the word is used: below it nothing readable is on screen yet. */
const SKY_SEEN = 0.15;

/**
 * The weather phrase for the status line, from what is on screen. The sim's weather only decides it while the renderer has not
 * caught up (then the sky is called overcast rather than rain or snow that nobody can see).
 */
export function skyWord(env: { weather: number }, sky: SkyView | undefined): string {
  if (!sky) return weatherWord(env.weather);
  let word: string;
  if (sky.dustStorm > SKY_SEEN) word = 'dust storm';
  else if (sky.blizzard > 0.3 && sky.snow > SKY_SEEN) word = 'blizzard';
  else if (sky.blizzardPending && sky.snow <= SKY_SEEN) word = 'blizzard building';
  else if (env.weather === 3 && sky.rain > SKY_SEEN) word = 'storm';
  else if (sky.snow > SKY_SEEN) word = 'snow';
  else if (sky.rain > SKY_SEEN) word = 'rain';
  else if (sky.drought > SKY_SEEN) word = 'drought';
  else if (sky.overcast > 0.3) word = 'overcast';
  else word = 'clear';
  if (sky.flood > SKY_SEEN) word += ', flood';
  return word;
}

/** Calendar year shown to the player. The sim's env.year is zero-based, the player's first year is year 1. */
export function yearOfTick(tick: number): number {
  return Math.floor((tick + calendarOffset()) / YEAR_TICKS) + 1;
}

/** First tick of a player-facing year (inverse of yearOfTick). */
export function yearStartTick(year: number): number {
  return (year - 1) * YEAR_TICKS - calendarOffset();
}

/** Continuous season value (0..4) for a tick. */
export function seasonOfTick(tick: number): number {
  return (((tick + calendarOffset()) % YEAR_TICKS) + YEAR_TICKS) % YEAR_TICKS / SEASON_TICKS;
}

/**
 * The one place a tick becomes a season in words. The header (seasonPhrase of env.season), the chapter cards, the graph tips and the
 * chronicle tags all read the calendar through these, so one moment never carries two names. They agree with the header by
 * construction: env.season at a tick is exactly seasonOfTick(tick), and the coarse name is the phrase without its early / mid / late.
 */
export function seasonPhraseAt(tick: number): string {
  return seasonPhrase(seasonOfTick(tick));
}

/** Coarse season name ("summer") at a tick: the chronicle's tag. */
export function seasonNameAt(tick: number): string {
  return seasonName(seasonOfTick(tick));
}

/** True when two ticks fall in the same year and read the same in the header ("midwinter" and "late winter" do not). */
export function sameSeasonPhrase(a: number, b: number): boolean {
  return yearOfTick(a) === yearOfTick(b) && seasonPhraseAt(a) === seasonPhraseAt(b);
}

/** True when two ticks are in the same year and the same season (the coarse name). */
export function sameSeasonName(a: number, b: number): boolean {
  return yearOfTick(a) === yearOfTick(b) && seasonNameAt(a) === seasonNameAt(b);
}

/** "Year 12, late summer" */
export function whenPhrase(tick: number): string {
  return `Year ${yearOfTick(tick)}, ${seasonPhrase(seasonOfTick(tick))}`;
}

// ---------------------------------------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------------------------------------

// by species id (src/sim/species.ts); ids 6 to 11 arrive with their WPs, the names are ready before them
const SINGULAR = ['bison', 'wolf', 'raven', 'pronghorn', 'jackrabbit', 'cougar', 'coyote', 'prairie dog', 'golden eagle', 'red-tailed hawk', 'mule deer', 'beaver'];
const PLURAL = ['bison', 'wolves', 'ravens', 'pronghorn', 'jackrabbits', 'cougars', 'coyotes', 'prairie dogs', 'golden eagles', 'red-tailed hawks', 'mule deer', 'beavers'];
const GROUP = ['herd', 'packs', 'flocks', 'herd', 'jackrabbits', 'cougars', 'coyotes', 'towns', 'eagles', 'hawks', 'herd', 'colonies'];

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

/** Biological lifespans in years, by species id. Sim time is compressed, so ages are shown on this scale. */
export const LIFESPAN_YEARS = [20, 12, 15, 12, 5, 14, 10, 5, 25, 20, 12, 12];
/** Sim lifespans in ticks, straight from the sim's defaults, used where only a species id is known (the "elder" event). */
export const MAX_AGE_TICKS = defaultParams().species.map((s) => s.maxAge);

/** An age in ticks on the biological scale: age / maxAge * the species' real lifespan. */
export function bioYears(ageTicks: number, sp: number, maxAgeTicks?: number): number {
  const max = maxAgeTicks && maxAgeTicks > 0 ? maxAgeTicks : MAX_AGE_TICKS[sp] ?? 3000;
  return (ageTicks / max) * (LIFESPAN_YEARS[sp] ?? 10);
}

/** "6 years", "1.4 years", "1 year": whole years from 2 up, one decimal below. */
export function yearsText(y: number): string {
  if (y < 2) {
    const t = Math.max(0, y).toFixed(1);
    return t === '1.0' ? '1 year' : `${t} years`;
  }
  return `${Math.round(y)} years`;
}

/** Age in ticks to a biological age string for the species. */
export function ageText(ageTicks: number, sp: number, maxAgeTicks?: number): string {
  return yearsText(bioYears(ageTicks, sp, maxAgeTicks));
}

/** Documentary caption: "Bison cow, 6 years". */
export function animalCaption(sp: number, male: boolean, age: number, matureAge: number, alpha = false, maxAge?: number): string {
  const juvenile = age < matureAge;
  const S = speciesName(sp);
  let name: string;
  switch (sp) {
    case 0: name = juvenile ? 'Bison calf' : male ? 'Bison bull' : 'Bison cow'; break;
    case 1: name = juvenile ? 'Wolf pup' : `${alpha ? 'Alpha ' : ''}${male ? (alpha ? 'male wolf' : 'Male wolf') : (alpha ? 'female wolf' : 'Female wolf')}`; break;
    case 2: name = juvenile ? 'Raven fledgling' : 'Raven'; break;
    case 3: name = juvenile ? 'Pronghorn fawn' : male ? 'Pronghorn buck' : 'Pronghorn doe'; break;
    case 4: name = juvenile ? 'Rabbit kit' : male ? 'Rabbit buck' : 'Rabbit doe'; break;
    case 5: name = juvenile ? 'Cougar kitten' : male ? 'Cougar, male' : 'Cougar, female'; break;
    case 6: name = juvenile ? 'Coyote pup' : male ? 'Male coyote' : 'Female coyote'; break;
    case 8: name = juvenile ? 'Eaglet' : S; break;
    case 9: name = juvenile ? 'Hawk fledgling' : S; break;
    case 10: name = juvenile ? 'Mule deer fawn' : male ? 'Mule deer buck' : 'Mule deer doe'; break;
    case 11: name = juvenile ? 'Beaver kit' : S; break;
    default: name = S;
  }
  return `${name}, ${ageText(age, sp, maxAge)}`;
}

/** "Generation 12, daughter of #18233" (or the founders' line). */
export function lineageText(sp: number, gen: number, male: boolean, parentA: number): string {
  if (gen <= 0 || parentA <= 0) return `Founder: arrived with the first ${plural(sp)}`;
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
  if (sp === 5) {
    if (state === 0) return 'lying up in the grove';
    if (state === 10) return 'stalking from cover';
    if (state === 5) return 'bursting from cover';
    if (state === 8) return 'resting in the shade';
  }
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
    case 'megadrought': return 4;
    case 'climateWet':
    case 'climateDry': return 1;
    case 'fire': return 3;
    case 'outbreak': return 3;
    case 'stampede': return 2;
    case 'packLost': return 2;
    case 'packFounded': return 1;
    case 'recolonized': return 4;
    case 'sylvaticPlague': return 3;
    case 'lightningFire': return 3;
    case 'mesoRelease': return 3;
    case 'distemper': return 2;
    case 'immigrated': return 2;
    case 'hareCrash': return 1;
    case 'townFounded': return 1;
    case 'eaglesArrive': return 1;
    case 'hawksReturn': return 1;
    case 'hardWinter': return 3;
    case 'blizzard': return 2;
    case 'flood': return 3;
    case 'dustStorm': return 3;
    case 'grasshopperOutbreak': return 3;
    case 'springFlood': return 3;
    case 'grovePlanted': return 1;
    case 'encroachment': return 2;
    default: return 0;
  }
}

/** Deterministic pick from a few phrasings, keyed on the event, so the same event always reads the same way. */
function pick<T>(e: SimEvent, variants: T[], salt = 0): T {
  const h = (Math.imul(Math.round(e.tick), 2654435761) ^ Math.imul(Math.round(e.a) + 7, 40503) ^ Math.imul(salt + 1 + voiceSalt * 7919, 977)) >>> 0;
  return variants[(h >>> 3) % variants.length];
}
/** The salt of the describeEvent call in progress (see DescribeContext.salt). */
let voiceSalt = 0;

/**
 * How big the news is, 1 (small) to 5 (big). A busy year in the chronicle keeps its biggest events and folds the
 * rest into a count line.
 */
export function eventWeight(e: SimEvent): number {
  switch (e.kind) {
    case 'extinct':
    case 'introduced':
      return 5;
    case 'megadrought':
    case 'drought':
    case 'fire':
    case 'firstKill':
    case 'removed':
    case 'culled':
    case 'plague':
    case 'recolonized':
    case 'lightningFire':
    case 'sylvaticPlague':
      return 4;
    case 'outbreak':
    case 'packLost':
    case 'distemper':
    case 'mesoRelease':
    case 'hardWinter':
    case 'flood':
    case 'dustStorm':
    case 'grasshopperOutbreak':
    case 'springFlood':
    case 'encroachment':
    case 'pondFilled':
    case 'damBreached':
    case 'beaverMeadow':
      return 3;
    case 'climateWet':
    case 'climateDry':
      return 3;
    case 'climateMild':
      return 1;
    case 'immigrated':
      return e.sp === 1 ? 3 : 2;
    case 'emigrated':
    case 'mange':
    case 'townFounded':
    case 'townLost':
    case 'hareBoom':
    case 'hareCrash':
    case 'coyotePups':
    case 'storm':
    case 'blizzard':
    case 'eaglesArrive':
    case 'hawksReturn':
    case 'grovePlanted':
    case 'damBuilt':
    case 'colonyLeft':
      return 2;
    case 'stampede':
      return e.a >= 60 ? 3 : 1;
    case 'packFounded':
      return e.tick > 100 && e.a % 3 === 0 ? 3 : 2;
    case 'droughtEnd':
    case 'rain':
    case 'record':
      return 2;
    default:
      return 1; // elder and anything unknown
  }
}

/**
 * One plain sentence for the chronicle, plus a chapter card for the events that earn one.
 * Pure: depends only on the event.
 */
export function describeEvent(e: SimEvent, ctx?: DescribeContext): EventText {
  voiceSalt = ctx?.salt ?? 0;
  try {
    return describeCore(e, ctx);
  } finally {
    voiceSalt = 0;
  }
}

function describeCore(e: SimEvent, ctx?: DescribeContext): EventText {
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
        sentence: pick(e, [`The ${name} pack is founded.`, `A new pack, the ${name}, stakes out a range.`, `The ${name} pack claims its first territory.`]),
        card: e.tick > 100 && e.a % 3 === 0 ? { title: 'A new pack takes the ridge', subtitle: `The ${name} pack, year ${year}` } : undefined,
      };
    }
    case 'packLost': {
      // A pack that breaks up is not a pack that died: when the wolf count did not fall, its wolves went on elsewhere.
      const name = packName(e.a);
      const joined = ctx?.wolvesFell === false;
      const died = ctx?.wolvesFell === true;
      const sentence = joined
        ? pick(e, [`The ${name} pack breaks apart; its wolves join others.`, `The ${name} pack disbands, and its wolves scatter to other packs.`, `The ${name} pack gives up its range; its wolves go on elsewhere.`])
        : died
          ? pick(e, [`The ${name} pack breaks up, and not every wolf survives the scattering.`, `The ${name} pack falls apart, and the valley has fewer wolves for it.`])
          : pick(e, [`The ${name} pack has broken up.`, `The ${name} pack falls apart.`]);
      return {
        sentence,
        card: { title: joined ? 'A pack breaks apart' : 'A pack falls silent', subtitle: `The ${name} pack, year ${year}` },
      };
    }
    case 'drought': {
      const long = e.a >= 1800;
      return {
        sentence: long
          ? pick(e, ['A long drought settles over the valley.', 'The rains fail, and a long drought begins.', 'The valley dries out under a long drought.'])
          : pick(e, ['A drought settles over the valley.', 'A dry spell parches the valley.']),
        card: { title: long ? 'The long drought' : 'A dry spell', subtitle: when },
      };
    }
    case 'droughtEnd':
      return { sentence: pick(e, ['The drought breaks.', 'The dry spell ends at last.', 'The drought lets go of the valley.', 'The rains come back, and the drought is over.']) };
    case 'climateWet': {
      const afterDry = e.b < 0;
      return {
        sentence: afterDry
          ? pick(e, ['After the dry years the rains return, and the valley begins to green.', 'The long dry spell breaks into a run of wet years, and the grass comes back thick.', 'Rain follows rain, and the dry years are behind the valley at last.'])
          : pick(e, ['The rains settle in, and a run of wet years begins.', 'A string of wet years opens, and the grass stands thick and green.', 'The valley turns green and heavy as a wet decade takes hold.', 'Year after year the rain comes, and the prairie swells with it.']),
      };
    }
    case 'climateDry': {
      const afterWet = e.b > 0;
      return {
        sentence: afterWet
          ? pick(e, ['The wet years end, and the valley begins to dry.', 'The green decade is over: the rains slacken, and the grass starts to thin.', 'The good rains stop coming, and a run of dry years begins.'])
          : pick(e, ['The rains thin out, and a run of dry years begins.', 'A dry decade settles in; the grass grows short and pale.', 'The creek runs low, and the valley slips into a stretch of dry years.', 'Year after year the rain falls short, and the prairie begins to thin.']),
      };
    }
    case 'climateMild': {
      return {
        sentence: e.b > 0
          ? pick(e, ['The wet years ease, and the valley settles back to ordinary rains.', 'The green decade fades into ordinary years.', 'The rains settle back to their usual measure.'])
          : e.b < 0
            ? pick(e, ['The dry years loosen their hold, and ordinary rains return.', 'The long dry stretch ends, and the seasons turn ordinary again.', 'Rain returns to its usual measure, and the grass begins to recover.'])
            : pick(e, ['The seasons settle back into ordinary years.', 'The wet and dry years level out, and the valley breathes evenly again.']),
      };
    }
    case 'megadrought': {
      const n = Math.round(e.b);
      const yrs = n >= 2 ? `${countWord(n)} years` : 'years';
      return {
        sentence: pick(e, [
          `A megadrought grips the valley in year ${year}, and the rain holds off for ${yrs}.`,
          `Year ${year}: the rains fail, and a megadrought bleaches the valley for ${yrs}.`,
          `The grass pales and the ground cracks as a megadrought settles in, year ${year}, and ${yrs} of drought lie ahead.`,
          `A megadrought begins in year ${year}: ${yrs} with scarcely a drop.`,
        ]),
        card: { title: 'The megadrought', subtitle: when },
      };
    }
    case 'outbreak': {
      const noun = groupNoun(e.sp);
      const where = `the ${region && region !== 'central' ? `${region} ` : ''}${noun}`;
      // e.a is the size of the crowd the first case stood in (the sim's neighbour count), not a count of the sick: the line says so
      const n = Math.round(e.a);
      const crowd = n >= 3 ? countWord(n) : '';
      return {
        sentence: crowd
          ? pick(e, [
            `Disease spreads through ${where}, a crowd of ${crowd} packed close.`,
            `Sickness takes hold in ${where}, where ${crowd} animals stand shoulder to shoulder.`,
            `A fever runs through ${where}, and ${crowd} crowded animals are the first to feel it.`,
            `Sickness finds ${where}: ${crowd} animals in one tight crowd, and it spreads.`,
            `Illness breaks out in ${where}, among ${crowd} animals packed close.`,
            `The first cases appear in ${where}, in a crowd of ${crowd}.`,
          ])
          : pick(e, [`Disease spreads through ${where}.`, `Sickness takes hold in ${where}.`, `A fever runs through ${where}.`, `Illness breaks out in ${where}.`]),
        card: { title: `Sickness in the ${noun}`, subtitle: when },
      };
    }
    case 'stampede': {
      const where = region && region !== 'central' ? `the ${region} plain` : 'the plain';
      return {
        sentence: pick(e, [
          `A herd of ${fmtInt(e.a)} bison stampedes across ${where}.`,
          `Some ${fmtInt(e.a)} bison bolt across ${where}.`,
          `Panic takes the herd, and ${fmtInt(e.a)} bison thunder across ${where}.`,
          `Dust rises over ${where} as ${fmtInt(e.a)} bison break into a run.`,
        ]),
        card: e.a >= 60 ? { title: 'Stampede on the plain', subtitle: when } : undefined,
      };
    }
    case 'extinct':
      // cougars are wanderers that come and go over the rim: an empty valley for a season is not the end of them
      if (e.sp === 5) return { sentence: pick(e, ['No cougar is left in the valley for now.', 'The cougars have moved on, for now.']) };
      return {
        sentence: pick(e, [`The last ${sg} is gone.`, `The last ${sg} has left the valley.`]),
        card: { title: `The last ${sg} is gone`, subtitle: when },
      };
    case 'introduced': {
      const n = Math.max(1, Math.round(e.a));
      const few = n <= 12;
      let sentence: string;
      const more = ctx?.alreadyHere === true;
      if (e.sp === 1 && more) {
        sentence = `${cap(countWord(n))} more ${n === 1 ? 'wolf is' : 'wolves are'} brought into the valley${n > 1 ? ' as a new pack' : ''}.`;
      } else if (e.sp === 1) {
        sentence = few ? `${cap(countWord(n))} ${n === 1 ? 'wolf returns' : 'wolves return'} to the valley.` : `A group of ${countWord(n)} wolves returns to the valley.`;
      } else {
        sentence = few ? `${cap(countWord(n))} ${n === 1 ? sg : pl} ${n === 1 ? 'is' : 'are'} brought into the valley.` : `A group of ${countWord(n)} ${pl} is brought into the valley.`;
      }
      const title = more ? (e.sp === 1 ? 'A new pack arrives' : `More ${pl} arrive`) : e.sp === 1 ? 'Wolves return' : e.sp === 5 ? 'The cougar returns' : `${cap(pl)} arrive`;
      return { sentence, card: { title, subtitle: when } };
    }
    case 'removed':
      return { sentence: pick(e, [`The ${pl} are removed from the valley.`, `The ${pl} are taken out of the valley.`, `Every ${sg} is lifted out of the valley.`]) };
    case 'culled': {
      const n = Math.max(0, Math.round(e.a));
      return { sentence: `A cull takes ${countWord(n)} ${n === 1 ? sg : pl} from the ${groupNoun(e.sp)}.` };
    }
    case 'fire':
      return {
        sentence:
          region && region !== 'central'
            ? pick(e, [`A fire sweeps across the ${region} prairie.`, `Flames race through the ${region} grass.`])
            : pick(e, ['A fire breaks out on the prairie.', 'Fire takes the dry grass.']),
        card: { title: 'Fire on the prairie', subtitle: when },
      };
    case 'plague': {
      const n = Math.round(e.a);
      // on the wolves and coyotes the sickness is distemper (the Distemper tool), on the grazers a plague
      const what = e.sp === 1 || e.sp === 6 ? 'Distemper spreads' : 'A plague is loosed';
      return { sentence: `${what} among the ${pl}${n > 0 ? `, and ${countWord(n)} fall ill` : ''}.` };
    }
    case 'rain':
      return { sentence: pick(e, ['Rain falls across the valley.', 'A soaking rain moves over the prairie.', 'Rain sweeps in, and the grass drinks.', 'Clouds gather, and the rain comes down on the valley.']) };
    case 'elder': {
      {
        const age = ageText(e.a, e.sp);
        return {
          sentence: pick(e, [
            `An elder ${sg} dies at ${age}, a great age.`,
            `At ${age}, one old ${sg} dies, having outlived most of its kin.`,
            `A ${sg} of ${age}, among the oldest the valley has known, dies of old age.`,
            `${cap(sg)} elder: dead at ${age}, after a long life.`,
          ]),
        };
      }
    }
    case 'firstKill': {
      const prey = e.a >= 0 && e.a < SINGULAR.length ? SINGULAR[e.a] : 'animal';
      const hunter = e.sp >= 0 && e.sp < SINGULAR.length ? SINGULAR[e.sp] : 'wolf';
      return { sentence: `The valley sees its first kill: a ${hunter} takes down a ${prey}.` };
    }
    case 'record':
      return { sentence: pick(e, ['A new record is set in the valley.', 'The valley breaks one of its own records.', 'A mark is passed that the valley has not seen before.']) };
    // ---- v2 kinds: open prairie (S1), canid disease (S2), small prey (S4), coyotes (S5), storms (S6) ----
    case 'immigrated': {
      const n = Math.max(1, Math.round(e.a));
      const N = cap(countWord(n));
      if (e.sp === 1) {
        return {
          sentence: n === 2
            ? pick(e, ['A pair of wolves comes in over the rim and claims an empty den.', 'Two wolves from the wider prairie settle in the valley.', 'A wandering pair of wolves finds a free range and stays.', 'Two strange wolves cross the rim and do not turn back.'])
            : n === 1
              ? pick(e, ['A lone wolf arrives from the wider prairie.', 'One wolf comes down off the rim, looking for a pack.', 'A single wolf wanders in from the open country.'])
              : pick(e, [`${N} wolves arrive from the wider prairie.`, `${N} wolves come in over the rim and spread out along the creek.`, `A small band of ${countWord(n)} wolves wanders in from the open country.`, `${N} strange wolves cross into the valley and look for a free range.`]),
          card: e.tick > 100 && e.a % 2 === 0 && Math.round(e.tick / 97) % 3 === 0 ? { title: 'Wolves from outside', subtitle: when } : undefined,
        };
      }
      if (e.sp === 3) {
        return { sentence: pick(e, [`${N} pronghorn come back over the rim for spring.`, `The pronghorn return: ${countWord(n)} file in from the open prairie.`, `${N} pronghorn drift in from the plains, fast and wary.`, `A band of ${countWord(n)} pronghorn crosses the rim and spreads over the grass.`]) };
      }
      if (e.sp === 10) {
        return { sentence: pick(e, [`${N} mule deer slip down into the creek draws from the wider prairie.`, `A group of ${countWord(n)} mule deer finds the groves along the creek and stays.`, `${N} mule deer pick their way in from the breaks and take to the cottonwoods.`, `Mule deer arrive from the hills: ${countWord(n)} of them, ears turning at every sound.`]) };
      }
      if (e.sp === 11) {
        return { sentence: pick(e, ['A pair of beavers swims in along the creek, looking for a place to dam it.', 'Beavers come up the creek from the wider country and go looking for a stand of willows.', 'A pair of beavers arrives on the creek and starts looking over the banks.', 'Beavers work their way up the creek, testing the banks for a good dam site.']) };
      }
      if (e.sp === 5) {
        return { sentence: n === 2
          ? pick(e, ['A pair of cougars drifts in from the hills and takes up a range along the creek.', 'Two cougars come down out of the hills and settle along the creek.', 'A pair of cougars slips into the valley by night and claims the broken ground.'])
          : pick(e, [`${N} ${n === 1 ? 'cougar arrives' : 'cougars arrive'} from the wider country.`, `${n === 1 ? 'A cougar' : `${N} cougars`} ${n === 1 ? 'comes' : 'come'} down from the hills and ${n === 1 ? 'tests' : 'test'} the valley.`, `${n === 1 ? 'A lone cougar' : `${N} cougars`} ${n === 1 ? 'slips' : 'slip'} in over the rim.`]) };
      }
      if (e.sp === 6) {
        return { sentence: pick(e, [
          `${N} ${n === 1 ? 'coyote arrives' : 'coyotes arrive'} from the wider prairie.`,
          `${N} ${n === 1 ? 'coyote slips' : 'coyotes slip'} in from the open country and ${n === 1 ? 'starts' : 'start'} looking for a den.`,
          `${n === 1 ? 'A coyote trots' : `${N} coyotes trot`} in from the rim, noses down.`,
          `${n === 1 ? 'A stray coyote turns' : `${N} stray coyotes turn`} up in the valley.`,
          `${N} ${n === 1 ? 'coyote drifts' : 'coyotes drift'} in across the grass and ${n === 1 ? 'stays' : 'stay'}.`,
        ]) };
      }
      return { sentence: pick(e, [
        `${N} ${n === 1 ? sg : pl} ${n === 1 ? 'arrives' : 'arrive'} from the wider prairie.`,
        `${N} ${n === 1 ? sg : pl} ${n === 1 ? 'wanders' : 'wander'} in from the open country.`,
        `${n === 1 ? `A ${sg}` : `${N} ${pl}`} ${n === 1 ? 'turns' : 'turn'} up in the valley from beyond the rim.`,
      ]) };
    }
    case 'emigrated': {
      const n = Math.max(1, Math.round(e.a));
      const N = cap(countWord(n));
      if (e.sp === 3) {
        return { sentence: pick(e, [`${N} pronghorn drift out of the valley ahead of winter.`, `The browse runs short, and ${countWord(n)} pronghorn leave for the open prairie.`, `${N} pronghorn turn their backs on the valley and head for the plains.`, `A band of ${countWord(n)} pronghorn leaves for kinder country.`]) };
      }
      if (e.sp === 1) {
        return { sentence: n === 1
          ? pick(e, ['A lone wolf with no pack leaves the valley.', 'A wolf without a pack slips out over the rim.', 'One packless wolf goes off into the open country.'])
          : pick(e, [`${N} wolves leave the valley.`, `${N} wolves with no range to call their own head out over the rim.`, `${N} wolves quit the valley for the open country.`]) };
      }
      return { sentence: pick(e, [
        `${N} ${n === 1 ? sg : pl} ${n === 1 ? 'leaves' : 'leave'} the valley.`,
        `${N} ${n === 1 ? sg : pl} ${n === 1 ? 'drifts' : 'drift'} off toward the open prairie.`,
        `${n === 1 ? `A ${sg}` : `${N} ${pl}`} ${n === 1 ? 'goes' : 'go'} out over the rim and ${n === 1 ? 'does' : 'do'} not come back.`,
      ]) };
    }
    case 'recolonized':
      return {
        sentence: pick(e, [`${cap(pl)} are back: they find their own way into the valley.`, `After a time without them, ${pl} return to the valley on their own.`]),
        card: e.sp === 5 ? undefined : { title: `The ${pl} return`, subtitle: when },
      };
    case 'distemper': {
      const pups = Math.max(0, Math.round(e.a)), adults = Math.max(0, Math.round(e.b));
      const lost = pups + adults;
      const canid = e.sp === 6 ? 'coyotes' : 'wolves';
      const detail = lost === 0
        ? 'and every animal pulls through'
        : `and it takes ${[pups ? `${countWord(pups)} ${pups === 1 ? 'pup' : 'pups'}` : '', adults ? `${countWord(adults)} ${adults === 1 ? 'adult' : 'adults'}` : ''].filter(Boolean).join(' and ')}`;
      return {
        sentence: `Distemper runs through the ${canid}, ${detail}.`,
        card: lost >= 4 ? { title: 'Distemper', subtitle: when } : undefined,
      };
    }
    case 'mange': {
      const name = e.sp === 1 && e.a > 0 ? `the ${packName(e.a)} pack` : `the ${pl}`;
      return { sentence: pick(e, [`Mange shows up in ${name}: thinning coats, hard winters ahead.`, `${e.sp === 1 ? 'A wolf' : `One of ${name}`} is losing its coat to mange.`, `Mange creeps into ${name}, and the coats go ragged.`]) };
    }
    case 'townFounded':
      return { sentence: region && region !== 'central' ? pick(e, [`Prairie dogs dig a new town on the ${region} flats.`, `A new prairie dog town appears on the ${region} flats, mound by mound.`, `Burrows open across the ${region} flats: a new dog town.`]) : pick(e, ['Prairie dogs dig a new town on the flats.', 'A new prairie dog town appears on the flats, mound by mound.', 'Burrows open across the flats: a new dog town.']) };
    case 'townLost':
      return { sentence: region && region !== 'central' ? pick(e, [`The ${region} prairie dog town falls empty; only the mounds remain.`, `Nothing barks on the ${region} flats any more: the dog town is empty.`, `The ${region} dog town goes quiet, and the burrows stand open.`]) : pick(e, ['A prairie dog town falls empty; only the mounds remain.', 'Nothing barks on the flats any more: a dog town is empty.', 'A dog town goes quiet, and the burrows stand open.']) };
    case 'sylvaticPlague': {
      const n = Math.max(0, Math.round(e.a));
      return {
        sentence: `Plague sweeps the prairie dog towns${n > 0 ? `, and ${countWord(n)} prairie dogs die` : ''}.`,
        card: { title: 'Plague in the towns', subtitle: when },
      };
    }
    case 'hareBoom':
      return { sentence: pick(e, ['Jackrabbits are everywhere this year.', 'A jackrabbit boom: the grass is alive with them.']) };
    case 'hareCrash':
      return { sentence: pick(e, ['The jackrabbits crash, and the prairie goes quiet.', 'Jackrabbits grow scarce after the boom.']) };
    case 'coyotePups': {
      const n = Math.max(0, Math.round(e.a));
      return { sentence: n > 0 ? pick(e, [`Coyote pups tumble out of a den: ${countWord(n)} of them.`, `A coyote den fills with ${countWord(n)} yipping pups.`, `${cap(countWord(n))} coyote pups see daylight for the first time.`]) : pick(e, ['The coyotes have pups.', 'A coyote den stirs with new pups.']) };
    }
    case 'mesoRelease':
      return {
        sentence: pick(e, ['With the wolves few, coyotes take over the valley.', 'The wolves are scarce, and the coyotes move into the space they leave.', 'Coyotes spread across the valley now that the wolves are few.']),
        card: { title: 'The coyotes take over', subtitle: when },
      };
    case 'eaglesArrive': {
      const n = Math.max(1, Math.round(e.a));
      return {
        sentence: n === 1
          ? pick(e, ['A golden eagle drifts in over the open prairie to spend the winter.', 'One golden eagle arrives from the north for the cold months.', 'A lone golden eagle takes a ridge perch for the winter.'])
          : pick(e, [
            `${cap(countWord(n))} golden eagles arrive over the open prairie to winter in the valley.`,
            `Golden eagles are back for the winter: ${countWord(n)} of them, riding the cold air in from the north.`,
            `${cap(countWord(n))} golden eagles settle in for the cold months.`,
            `The first snow brings ${countWord(n)} golden eagles down from the north.`,
            `${cap(countWord(n))} golden eagles take up their winter perches along the ridges.`,
            `Winter sends the valley ${countWord(n)} golden eagles, wide-winged and patient.`,
          ]),
        card: n >= 3 ? { title: 'Eagles for the winter', subtitle: when } : undefined,
      };
    }
    case 'hawksReturn': {
      const n = Math.max(1, Math.round(e.a));
      return {
        sentence: n === 1
          ? pick(e, ['A pair of red-tailed hawks returns to the cottonwoods to nest.', 'Red-tailed hawks come back: one pair, and a nest in the cottonwoods.', 'One pair of red-tails circles the creek and starts a nest.'])
          : pick(e, [
            `${cap(countWord(n))} pairs of red-tailed hawks return to nest in the cottonwoods.`,
            `Red-tailed hawks are back for the summer: ${countWord(n)} pairs, each to a cottonwood.`,
            `The hawks return, ${countWord(n)} pairs of them, and the cottonwood nests fill again.`,
            `${cap(countWord(n))} pairs of red-tails wheel over the creek, and the old nests are mended.`,
            `Spring brings the red-tails back to the cottonwoods: ${countWord(n)} pairs.`,
            `A high thin cry over the creek: ${countWord(n)} pairs of red-tailed hawks are home.`,
          ]),
        card: n >= 3 ? { title: 'The hawks return', subtitle: when } : undefined,
      };
    }
    case 'storm':
      return { sentence: pick(e, ['A thunderstorm rolls across the valley.', 'Thunderheads build over the rim and the storm breaks.', 'A line of storms marches across the prairie.']) };
    case 'blizzard':
      return {
        sentence: pick(e, ['A blizzard blows in, and the valley disappears into white.', 'A blizzard sweeps down from the north, and the snow drives sideways across the prairie.', 'The wind rises and a blizzard closes over the valley.']),
        card: { title: 'Blizzard', subtitle: when },
      };
    case 'hardWinter':
      return {
        sentence: pick(e, ['A hard winter settles on the valley: deep snow, bitter cold, and a long wait for the thaw.', 'The snow comes early and stays. This will be a hard winter.', 'A hard winter grips the prairie, and the grass lies buried under the drifts.']),
        card: { title: 'A hard winter', subtitle: when },
      };
    case 'lightningFire':
      return {
        sentence: region && region !== 'central' ? `Lightning strikes the ${region} prairie, and the grass catches.` : 'Lightning strikes the dry grass, and it catches.',
        card: { title: 'Lightning fire', subtitle: when },
      };
    case 'flood': {
      const big = e.b >= 0.6;
      return {
        sentence: big
          ? pick(e, ['The creek bursts its banks and the floodwater spreads across the bottomland.', 'Floodwater pours over the banks and drowns the grass along the creek.'])
          : pick(e, ['The creek rises and spills over its banks.', 'The creek swells and the low ground by the water goes under.']),
        card: { title: 'The creek floods', subtitle: when },
      };
    }
    case 'springFlood': {
      const big = e.b >= 0.6;
      return {
        sentence: big
          ? pick(e, ['Snowmelt and rain fill the creek to the brim, and the spring flood spreads across the bottomland.', 'The spring flood comes down the creek, brown and fast, and the low ground by the water disappears.'])
          : pick(e, ['The thaw swells the creek and the water creeps over the low ground.', 'Meltwater and rain lift the creek over its banks for a few days.']),
        card: { title: 'Spring flood', subtitle: when },
      };
    }
    case 'dustStorm': {
      const big = e.b >= 0.8;
      return {
        sentence: big
          ? pick(e, ['A wall of dust rolls across the valley, and the sun goes out behind it.', 'The wind lifts the bare ground into a brown wall, and the whole valley vanishes in dust.'])
          : pick(e, ['Dust rises off the dry, bare ground, and the valley goes brown and hazy.', 'A dust storm blows across the thin grass, and nothing can be seen far off.']),
        card: { title: 'Dust storm', subtitle: when },
      };
    }
    case 'grasshopperOutbreak':
      return {
        sentence: pick(e, ['Grasshoppers hatch in their millions, and the dry grass hums and shivers with them.', 'A grasshopper outbreak sweeps the prairie, stripping the grass in the hot, dry weather.', 'Grasshoppers swarm the valley, and the ravens, hawks and coyotes feast.']),
        card: { title: 'Grasshopper outbreak', subtitle: when },
      };
    case 'grovePlanted':
      // sp -2 is a natural grove (S13: cottonwoods rooting on the flood-scoured ground); sp -1 is the one the player planted
      if (e.sp === -2) return { sentence: pick(e, ['The floodwater leaves bare, wet ground, and a stand of cottonwood seedlings springs up along the creek.', 'Cottonwood seedlings crowd the mud the flood left behind, and a new grove begins.']) };
      return { sentence: pick(e, ['A grove of young cottonwoods takes root on the prairie.', 'Saplings are planted, and a grove begins to rise from the grass.']) };
    case 'encroachment':
      return {
        sentence: pick(e, ['Junipers are creeping up the ridges, and the open grassland is giving way to cedar.', 'Without fire, junipers spread across the ridgetops, and the prairie slowly closes in.', 'Dark junipers climb the ridges, a little farther each year.']),
        card: { title: 'Junipers spread', subtitle: when },
      };
    // ---- beavers (S14): a = dam id or area, b = colony id or cause ----
    case 'damBuilt':
      return {
        sentence: region && region !== 'central'
          ? pick(e, [`Beavers wall off the creek in the ${region} reach: a dam of sticks and mud begins to rise.`, `A beaver dam takes shape across the creek on the ${region} side of the valley.`])
          : pick(e, ['Beavers wall off the creek: a dam of sticks and mud begins to rise.', 'A beaver dam takes shape across the creek.']),
        card: { title: 'A beaver dam', subtitle: when },
      };
    case 'pondFilled': {
      const m2 = Math.max(0, Math.round(e.a));
      const size = m2 >= 1200 ? 'a wide pond' : m2 >= 400 ? 'a pond' : 'a small pond';
      return {
        sentence: pick(e, [`Water backs up behind the beaver dam and ${size} spreads over the bottomland, drowning the trees at its edge.`, `The dam holds, and ${size} fills behind it. The drowned cottonwoods stand grey in the water.`, `The beaver pond is full: ${size}, still and bright, where the creek ran thin.`]),
        card: m2 >= 400 ? { title: 'A beaver pond', subtitle: when } : undefined,
      };
    }
    case 'damBreached':
      return {
        sentence: e.b === 0
          ? pick(e, ['The flood tears a hole in the beaver dam, and the pond empties down the creek.', 'Floodwater breaks the beaver dam, and the pond drains away in a rush.'])
          : pick(e, ['The beaver dam gives way, and the pond drains down the creek.', 'A beaver dam fails in the night, and the water behind it runs out.']),
        card: { title: 'The dam breaks', subtitle: when },
      };
    case 'beaverMeadow':
      return {
        sentence: pick(e, ['The pond has drained, and a rich green meadow spreads over the old pond bed.', 'Where the beaver pond stood, only a lush meadow is left, fertile with a few years of silt.', 'The water is gone from behind the old dam, and grass comes up thick and green in the mud.']),
        card: { title: 'A beaver meadow', subtitle: when },
      };
    case 'colonyLeft':
      return {
        sentence: e.b === 0
          ? pick(e, ['With the trees along the creek gnawed down, the beavers leave their lodge, and the dam is left to crumble.', 'The beavers have eaten the bank bare and move on; the dam will not be mended.'])
          : pick(e, ['The last beaver of the lodge is gone, and the dam is left to the creek.', 'The lodge falls quiet. No one is left to mend the dam.']),
      };
    default:
      return { sentence: 'Something stirs in the valley.' };
  }
}

/** Format a count for display: 1,234. */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

// ---------------------------------------------------------------------------------------------------------
// repeats: one line for a run of the same news, and a voice that does not say the same thing twice
// ---------------------------------------------------------------------------------------------------------

/**
 * Events that come in runs ("Two coyotes arrive", then "Three coyotes arrive") and read better as one growing line.
 * Returns the key that decides which events fold together (kind and species), or null for an event that stands alone.
 */
export function foldKey(e: SimEvent): string | null {
  if (e.kind === 'immigrated' || e.kind === 'emigrated') return `${e.kind}:${e.sp}`;
  return null;
}

/**
 * The line for a run of `runs` events of one kind adding up to `total` animals within one valley year:
 * "More coyotes drift in from the prairie: 6 this year." Phrasing is chosen from the latest event's data.
 */
export function describeFolded(e: SimEvent, total: number, runs: number): string {
  const known = e.sp >= 0 && e.sp < PLURAL.length;
  const pl = known ? PLURAL[e.sp] : 'animals';
  const t = fmtInt(total);
  if (e.kind === 'emigrated') {
    return pick(e, [
      `More ${pl} leave the valley: ${t} this year.`,
      `${cap(pl)} keep slipping away: ${t} gone this year.`,
      `Still more ${pl} head out over the rim, ${t} in all this year.`,
      `${t} ${pl} have left the valley this year.`,
    ], runs);
  }
  return pick(e, [
    `More ${pl} drift in from the prairie: ${t} this year.`,
    `${cap(pl)} keep arriving from the wider country: ${t} this year.`,
    `Still more ${pl} come in over the rim, ${t} in all this year.`,
    `${t} ${pl} have found their way into the valley this year.`,
  ], runs);
}

/** Window inside which a run of the same event folds into one line: the rest of the player-facing year it started in. */
export function foldWindow(): number {
  return YEAR_TICKS;
}

/**
 * Wraps describeEvent for the chronicle: it remembers the last few lines it wrote for each kind of event and, when the
 * phrasing the event's data picks was just used, reaches for another (a second "Two coyotes arrive" never reads like the first).
 * Deterministic for the same sequence of events. describeEvent itself stays pure.
 */
export class ChronicleVoice {
  private recent = new Map<string, string[]>();
  private static readonly MEMORY = 12;
  private static readonly TRIES = 12;

  reset(): void {
    this.recent.clear();
  }

  describe(e: SimEvent, ctx?: DescribeContext): EventText {
    const key = `${e.kind}:${e.sp}`;
    const seen = this.recent.get(key) ?? [];
    let best = describeEvent(e, { ...ctx, salt: 0 });
    if (seen.includes(best.sentence)) {
      // prefer a phrasing not used in the last few lines; settle for one that is not the very last
      let fallback: EventText | null = null;
      for (let salt = 1; salt <= ChronicleVoice.TRIES; salt++) {
        const t = describeEvent(e, { ...ctx, salt });
        if (!seen.includes(t.sentence)) { best = t; fallback = null; break; }
        if (!fallback && t.sentence !== seen[seen.length - 1]) fallback = t;
      }
      if (fallback) best = fallback;
    }
    seen.push(best.sentence);
    if (seen.length > ChronicleVoice.MEMORY) seen.shift();
    this.recent.set(key, seen);
    return best;
  }

  /** Note a line written some other way (a folded run), so the next one does not repeat it. */
  note(e: SimEvent, sentence: string): void {
    const key = `${e.kind}:${e.sp}`;
    const seen = this.recent.get(key) ?? [];
    seen.push(sentence);
    if (seen.length > ChronicleVoice.MEMORY) seen.shift();
    this.recent.set(key, seen);
  }
}
