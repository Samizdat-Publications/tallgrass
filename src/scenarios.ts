// Scenarios: starting conditions plus scheduled interventions. Shared by the game and the harness.
import { BASE_YEAR_TICKS as Y, Intervention, Sp, YEAR_TICKS } from './sim/types';

/** Schedules are fixed in ticks (Y = a 2,400-tick year); blurbs give their lengths in the valley's own calendar. */
const yrs = (base: number) => +((base * Y) / YEAR_TICKS).toFixed(1);

export interface Scenario {
  id: string;
  name: string;
  blurb: string;
  params: Record<string, number>;
  schedule: { tick: number; iv: Intervention }[];
}

/**
 * A closed valley (V2-PLAN owner ruling 2): no animals arrive or leave over the rim. Island and Yellowstone stay closed,
 * because their stories are about what the valley does without outside help (bringing the wolves back is the player's
 * job there), and Hungry wolves keeps the closed v5 world its blurb describes.
 */
const CLOSED = { openPrairie: 0, ravenVagrants: 0 };

/** Cougar country (also the Cat country challenge's world). */
export const COUGAR_WORLD: Record<string, number> = {
  'cougar.initial': 6, 'muledeer.initial': 60, cougarKillChance: 0.9, cougarAmbushRadius: 26, 'cougar.metabolism': 0.0007, cougarImmigration: 0.5,
};
/**
 * S17 worlds. Their params are exported because the challenges that use them (src/challenges.ts) pin the same values.
 * Mesopredator release: coyotes that live four valley years instead of two (so a pair raises several litters) and twenty founders;
 * with the wolves trapped out in year 1.5 they multiply until the hares, the prairie dog towns and the pronghorn fawns are gone.
 */
export const MESO_PARAMS: Record<string, number> = {
  smallPrey: 1, smallGameField: 1, 'coyote.initial': 20, 'coyote.maxAge': 9600, openPrairie: 0, ravenVagrants: 0,
};
/** The plague year: the small-prey web with a plague-prone prairie dog town. */
export const PLAGUETOWN_PARAMS: Record<string, number> = { smallPrey: 1, smallGameField: 1, plagueRate: 0.08, openPrairie: 0, ravenVagrants: 0 };
/** Storm season: thunderstorm cells whose own strikes never ignite (the scheduled ones below do), fast-spreading grass fires, and no natural dry spells (so a rain really does stop the fire). */
export const STORM_PARAMS: Record<string, number> = { stormCells: 1, lightningRate: 0.03, lightningIgnite: 0, fireSpread: 3, summerDroughtP: 0, openPrairie: 0, ravenVagrants: 0 };
/** Dry lightning in late summer of years 1 to 5: four strikes across the valley, a few ticks apart (late summer is around tick 2,400 k). */
const LIGHTNING_SPOTS: [number, number][] = [[120, 150], [250, 330], [380, 200], [150, 400]];
const stormSchedule = (): { tick: number; iv: Intervention }[] => {
  const out: { tick: number; iv: Intervention }[] = [];
  for (let k = 1; k <= 5; k++) LIGHTNING_SPOTS.forEach(([x, y], j) => out.push({ tick: Y * k + 40 + 12 * j, iv: { kind: 'lightning', x, y } }));
  return out;
};

/** Checkpoint v10 candidate (2026-10-09): climate regimes, bounded evolution, fewer and bigger wolf packs. */
export const LONG_BREATH: Record<string, number> = { evolution2: 1, climate2: 0.3, wolfDenMinDist: 280, wolfTerritory: 130 };

export const SCENARIOS: Scenario[] = [
  {
    id: 'prairie', name: 'Open prairie',
    blurb: 'Bison, pronghorn, wolves and ravens on an open prairie: herds boom, wolves follow a few years behind, pronghorn come and go with the seasons, and distemper and mange keep the packs in check.',
    params: {}, schedule: [],
  },
  {
    id: 'longbreath', name: 'The long breath',
    blurb: 'Wet and dry runs of decades roll over the valley. In the wet years the grass stands tall, the herds swell and the groves spread; in the dry years fires run, the herds thin and the packs go hungry. Set it to 100x and watch the valley breathe.',
    params: LONG_BREATH, schedule: [],
  },
  {
    id: 'sealed', name: 'The sealed valley',
    blurb: 'The valley as an island: nothing comes in over the rim and nothing leaves. Every animal here is all there will ever be.',
    params: CLOSED, schedule: [],
  },
  {
    id: 'yellowstone', name: 'Yellowstone return',
    get blurb() { return `No wolves for ${yrs(3)} years, so the herds and the grazing pressure build. Then a few wolves arrive.`; },
    params: { 'wolf.initial': 0, ...CLOSED },
    schedule: [{ tick: Y * 3, iv: { kind: 'introduce', species: Sp.Wolf, count: 12 } }],
  },
  {
    id: 'island', name: 'Island of plenty',
    blurb: 'No predators at all. The herds boom until the grass gives out.',
    params: { 'wolf.initial': 0, 'coyote.initial': 0, ...CLOSED }, schedule: [],
  },
  {
    id: 'drought', name: 'The long drought',
    get blurb() { return yrs(1) === 1 ? 'A dry spell settles in after the first year and lasts two summers.' : `A dry spell settles in after year ${yrs(1)} and lasts ${yrs(2)} summers.`; },
    params: {},
    schedule: [{ tick: Y, iv: { kind: 'drought', ticks: Y * 2, severity: 0.85 } }],
  },
  {
    id: 'dryyears', name: 'The dry years',
    get blurb() { return `Drought comes in year ${yrs(1) + 1}, then returns every ${yrs(4)} years and lasts ${yrs(1.5)} years.`; },
    params: {},
    schedule: [1, 5, 9, 13, 17, 21, 25, 29].map((y) => ({ tick: Y * y, iv: { kind: 'drought' as const, ticks: Y * 1.5, severity: 0.7 } })),
  },
  {
    id: 'cougars', name: 'Cougar country',
    blurb: 'Six cougars lie in wait in the groves along the creek, ambushing alongside the wolf packs, and sixty mule deer browse the same draws. When the valley empties of cats, a pair wanders in from the hills.',
    // tuned on v5 (screen cgB): surer ambushes, a wider strike zone, a leaner metabolism, and dispersers from outside (S8 made these the
    // cougar defaults and added cougarRange 200 and cougarInRate; they stay explicit here so the scenario does not move if the defaults do).
    // Mule deer (S8) are the cats' first choice of prey; without them the cats live on pronghorn, bison calves and wolf kills.
    params: COUGAR_WORLD, schedule: [],
  },
  {
    id: 'hungrywolves', name: 'Hungry wolves',
    blurb: 'Wolf packs grow when prey is plentiful and shrink when it is scarce, so the wolf line chases the herd a couple of years behind. The pronghorn rarely last more than a few centuries here.',
    // the best predator-response screen of Sunday morning (scratch/L1, 32 worlds x 200 valley-years): bison, wolves and
    // ravens 32/32, wolves follow bison at correlation 0.77, pronghorn 25/32. Over 1,000 generations (review/stability/hungrywolves-44a2bfe)
    // the pronghorn die out in all 20 worlds, between years 88 and 585, while bison, wolves and ravens hold in 19
    params: { wolfPreyRef: 1000, wolfRareHalf: 400, leanLitter: 0.8, ...CLOSED, cdvRate: 0, mangeRate: 0, smallPrey: 0, smallGameField: 0, 'coyote.initial': 0 }, schedule: [],
  },
  {
    id: 'meso', name: 'Wolves trapped out',
    get blurb() { return `A closed valley with wolves, twenty long-lived coyotes and the small-prey web. In year ${yrs(1.5)} the wolves are trapped out, and the coyotes inherit the valley.`; },
    params: MESO_PARAMS, schedule: [{ tick: Y * 1.5, iv: { kind: 'remove', species: Sp.Wolf } }],
  },
  {
    id: 'plaguetown', name: 'The plague year',
    blurb: 'Sylvatic plague has swept the prairie dog towns and the last survivors are gone. The valley is closed: nothing comes back unless it is brought. Another plague is due in year 6.',
    params: PLAGUETOWN_PARAMS,
    schedule: [
      { tick: 20, iv: { kind: 'disease', disease: 'plague', fraction: 1 } },
      { tick: 700, iv: { kind: 'remove', species: Sp.PrairieDog } },
      { tick: Y * 6 + 20, iv: { kind: 'disease', disease: 'plague', fraction: 0.5 } },
    ],
  },
  {
    id: 'stormseason', name: 'Storm season',
    get blurb() { return `Every late summer dry lightning rakes the valley, and the grass fires run fast. Five storm seasons begin in year ${yrs(1) + 1}.`; },
    params: STORM_PARAMS, schedule: stormSchedule(),
  },
  {
    id: 'collapse', name: 'Collapse',
    blurb: 'An overstocked valley with only one small pack. Can it recover on its own?',
    params: { 'bison.initial': 1500, 'deer.initial': 400, 'wolf.initial': 6 }, schedule: [],
  },
];

/** The UI menu uses a few different ids for the same scenarios. */
const ALIASES: Record<string, string> = { baseline: 'prairie', plenty: 'island' };

export function scenarioById(id: string): Scenario {
  const key = ALIASES[id] ?? id;
  return SCENARIOS.find((s) => s.id === key) ?? SCENARIOS[0];
}
