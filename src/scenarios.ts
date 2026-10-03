// Scenarios: starting conditions plus scheduled interventions. Shared by the game and the harness.
import { Intervention, Sp, YEAR_TICKS } from './sim/types';

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
    blurb: 'No wolves for three years, so the herds and the grazing pressure build. Then a few wolves arrive.',
    params: { 'wolf.initial': 0 },
    schedule: [{ tick: YEAR_TICKS * 3, iv: { kind: 'introduce', species: Sp.Wolf, count: 12 } }],
  },
  {
    id: 'island', name: 'Island of plenty',
    blurb: 'No predators at all. The herds boom until the grass gives out.',
    params: { 'wolf.initial': 0 }, schedule: [],
  },
  {
    id: 'drought', name: 'The long drought',
    blurb: 'A dry spell settles in after the first year and lasts two summers.',
    params: {},
    schedule: [{ tick: YEAR_TICKS, iv: { kind: 'drought', ticks: YEAR_TICKS * 2, severity: 0.85 } }],
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
