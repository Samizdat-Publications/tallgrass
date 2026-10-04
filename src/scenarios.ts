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

export const SCENARIOS: Scenario[] = [
  {
    id: 'prairie', name: 'Open prairie',
    blurb: 'Bison, pronghorn, wolves and ravens in balance. Watch it find its own rhythm.',
    params: {}, schedule: [],
  },
  {
    id: 'yellowstone', name: 'Yellowstone return',
    get blurb() { return `No wolves for ${yrs(3)} years, so the herds and the grazing pressure build. Then a few wolves arrive.`; },
    params: { 'wolf.initial': 0 },
    schedule: [{ tick: Y * 3, iv: { kind: 'introduce', species: Sp.Wolf, count: 12 } }],
  },
  {
    id: 'island', name: 'Island of plenty',
    blurb: 'No predators at all. The herds boom until the grass gives out.',
    params: { 'wolf.initial': 0 }, schedule: [],
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
    blurb: 'Six cougars lie in wait in the groves along the creek, ambushing alongside the wolf packs. When the valley empties of cats, a pair wanders in from the hills.',
    // tuned on v5 (screen cgB): surer ambushes, a wider strike zone, a leaner metabolism, and dispersers from outside
    params: { 'cougar.initial': 6, cougarKillChance: 0.9, cougarAmbushRadius: 26, 'cougar.metabolism': 0.0007, cougarImmigration: 0.5 }, schedule: [],
  },
  {
    id: 'hungrywolves', name: 'Hungry wolves',
    blurb: 'Wolf packs grow when prey is plentiful and shrink when it is scarce, so the wolf line chases the herd a couple of years behind. The pronghorn rarely last more than a few centuries here.',
    // the best predator-response screen of Sunday morning (scratch/L1, 32 worlds x 200 valley-years): bison, wolves and
    // ravens 32/32, wolves follow bison at correlation 0.77, pronghorn 25/32. Over 1,000 generations (review/stability/hungrywolves-44a2bfe)
    // the pronghorn die out in all 20 worlds, between years 88 and 585, while bison, wolves and ravens hold in 19
    params: { wolfPreyRef: 1000, wolfRareHalf: 400, leanLitter: 0.8 }, schedule: [],
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
