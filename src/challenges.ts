// Challenges: a named world, a time limit, a budget of interventions and a goal. The player wins by reaching the
// end of the time limit with the goal met. Pure logic; the UI reads ChallengeStatus each frame.
// Thresholds were tuned on headless runs of each challenge with no interventions (see DECISIONS.md), so that
// leaving the valley alone usually fails and a few well-timed tools can save it.
import { Sp } from './sim/types';

export interface ChallengeState {
  /** Valley years since the start (fractional). */
  year: number;
  /** Population per species, indexed by Sp. */
  pop: number[];
  /** Wolf packs holding a territory right now. */
  packs: number;
  /** Interventions used so far. */
  toolsUsed: number;
}

export interface ChallengeStatus {
  state: 'running' | 'won' | 'lost';
  /** One short line for the goal card, e.g. "Year 12 of 40. All four species alive." */
  progress: string;
  /** Why it ended, in a sentence (won or lost only). */
  reason?: string;
}

export interface Challenge {
  id: string;
  name: string;
  /** Two sentences at most: the situation and what to do. */
  blurb: string;
  /** The goal as the player sees it, one line each. */
  goals: string[];
  seed: string;
  scenario: string;
  years: number;
  /** Interventions allowed; null means unlimited. */
  maxTools: number | null;
  /** Called every UI frame; may keep its own memory between calls (create a fresh one per attempt). */
  makeCheck(): (s: ChallengeState) => ChallengeStatus;
}

const NAMES: Record<number, string> = { [Sp.Bison]: 'bison', [Sp.Wolf]: 'wolves', [Sp.Raven]: 'ravens', [Sp.Deer]: 'pronghorn' };
const CORE = [Sp.Bison, Sp.Wolf, Sp.Raven, Sp.Deer];

const yr = (y: number) => Math.floor(y) + 1;

/** Lost when any of the listed species is gone (after it has been present at least once). */
function extinctionGuard(species: number[]) {
  const seen = new Set<number>();
  return (s: ChallengeState): string | null => {
    for (const sp of species) {
      if (s.pop[sp] > 0) seen.add(sp);
      else if (seen.has(sp)) return `The last of the ${NAMES[sp]} died in year ${yr(s.year)}.`;
    }
    return null;
  };
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'homecoming',
    name: 'The wolves come home',
    blurb: 'The wolves are gone and the herds have grown bold. Bring them back and help them hold the valley.',
    goals: ['Three wolf packs holding territory at once', 'Before year 15', 'At most 3 interventions'],
    seed: '21', scenario: 'island', years: 15, maxTools: 3,
    makeCheck() {
      let introduced = false;
      return (s) => {
        if (s.pop[Sp.Wolf] > 0) introduced = true;
        if (s.packs >= 3) return { state: 'won', progress: 'Three packs hold the valley.', reason: `Three packs held territory in year ${yr(s.year)}.` };
        if (introduced && s.pop[Sp.Wolf] === 0) {
          const r = `The wolves died out in year ${yr(s.year)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= 15) return { state: 'lost', progress: 'Out of time.', reason: `Year 15 came with ${s.packs} ${s.packs === 1 ? 'pack' : 'packs'}.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of 15. ${s.packs} of 3 packs${introduced ? `, ${s.pop[Sp.Wolf]} wolves` : '. Use Add wolves to start'}.` };
      };
    },
  },
  {
    id: 'island',
    name: 'Island of plenty',
    blurb: 'No predators and endless grass, for now. Stop the herd from overrunning the valley.',
    goals: ['Keep the bison under 2,500 from year 4 on', 'Survive 30 years', 'At most 6 interventions'],
    seed: '7', scenario: 'island', years: 30, maxTools: 6,
    makeCheck() {
      return (s) => {
        const b = s.pop[Sp.Bison];
        if (s.year >= 4 && b > 2500) {
          const r = `The herd swelled to ${b.toLocaleString()} in year ${yr(s.year)} and stripped the valley bare.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (b === 0) {
          const r = `The last bison died in year ${yr(s.year)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= 30) return { state: 'won', progress: 'Thirty years, and the grass held.', reason: 'The herd stayed within what the valley could feed for thirty years.' };
        return { state: 'running', progress: `Year ${yr(s.year)} of 30. ${b.toLocaleString()} bison${s.year < 4 ? '; the limit of 2,500 starts in year 5' : ' of 2,500'}.` };
      };
    },
  },
  {
    id: 'herd',
    name: 'Save the herd',
    blurb: 'In this valley the wolves slowly grind the bison down until none are left. Keep every species alive for 40 years.',
    goals: ['Bison, wolves, ravens and pronghorn all alive at year 40', 'At most 5 interventions'],
    seed: '26', scenario: 'prairie', years: 40, maxTools: 5,
    makeCheck() {
      const guard = extinctionGuard(CORE);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        if (s.year >= 40) return { state: 'won', progress: 'Forty years, and the herd is still here.', reason: 'Every species made it through forty years.' };
        return { state: 'running', progress: `Year ${yr(s.year)} of 40. ${s.pop[Sp.Bison].toLocaleString()} bison, all four species alive.` };
      };
    },
  },
  {
    id: 'collapse',
    name: 'Pull it back',
    blurb: 'Fifteen hundred bison and a single small pack. Without more predators the pronghorn boom and then crash. Keep them from collapsing.',
    goals: ['Keep the pronghorn above 100 from year 3 on', 'Nothing goes extinct', 'Survive 30 years', 'At most 4 interventions'],
    seed: '23', scenario: 'collapse', years: 30, maxTools: 4,
    makeCheck() {
      const guard = extinctionGuard(CORE);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        const ph = s.pop[Sp.Deer];
        if (s.year >= 3 && ph < 100) {
          const r = `The pronghorn crashed to ${ph} in year ${yr(s.year)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= 30) return { state: 'won', progress: 'The valley is back in balance.', reason: `Thirty years, and the pronghorn never fell below 100.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of 30. ${ph.toLocaleString()} pronghorn${s.year < 3 ? '; the floor of 100 starts in year 4' : ', floor 100'}.` };
      };
    },
  },
  {
    id: 'dry',
    name: 'The dry years',
    blurb: 'Drought arrives in the second year and returns every four years. Carry every species through twenty years.',
    goals: ['Bison, wolves, ravens and pronghorn all alive at year 20', 'At most 4 interventions'],
    seed: '11', scenario: 'dryyears', years: 20, maxTools: 4,
    makeCheck() {
      const guard = extinctionGuard(CORE);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        if (s.year >= 20) return { state: 'won', progress: 'The rains came back, and so did everyone.', reason: 'Every species outlasted twenty dry years.' };
        return { state: 'running', progress: `Year ${yr(s.year)} of 20. All four species alive.` };
      };
    },
  },
];

export function challengeById(id: string | null): Challenge | null {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}
