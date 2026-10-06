// Challenges: a named world, a time limit, a budget of interventions and a goal. The player wins by reaching the
// end of the time limit with the goal met. Pure logic; the UI reads ChallengeStatus each frame.
// Thresholds were tuned on headless runs of each challenge with no interventions (see DECISIONS.md), so that
// leaving the valley alone usually fails and a few well-timed tools can save it.
import { BASE_YEAR_TICKS, Sp, YEAR_TICKS } from './sim/types';
import { COUGAR_WORLD, MESO_PARAMS, PLAGUETOWN_PARAMS, STORM_PARAMS } from './scenarios';

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
  /** Sim params on top of the scenario's. Every challenge pins the classic 2,400-tick calendar it was tuned and
   *  validated on (tools/challenge_suite.py), whatever the game's default calendar. */
  params?: Record<string, number>;
  /** Interventions allowed; null means unlimited. */
  maxTools: number | null;
  /** Called every UI frame; may keep its own memory between calls (create a fresh one per attempt). */
  makeCheck(): (s: ChallengeState) => ChallengeStatus;
}

const NAMES: Record<number, string> = {
  [Sp.Bison]: 'bison', [Sp.Wolf]: 'wolves', [Sp.Raven]: 'ravens', [Sp.Deer]: 'pronghorn',
  [Sp.Rabbit]: 'jackrabbits', [Sp.Cougar]: 'cougars', [Sp.Coyote]: 'coyotes', [Sp.PrairieDog]: 'prairie dogs', [Sp.MuleDeer]: 'mule deer',
};
const CORE = [Sp.Bison, Sp.Wolf, Sp.Raven, Sp.Deer];

const yr = (y: number) => Math.floor(y) + 1;
/** The calendar the challenges were tuned on. */
/**
 * Every v2 mechanism off, at its v5 value (V2-PLAN.md S3 step 4), so the challenges stay identical to the valleys they
 * were tuned and validated on whatever the game's defaults become. Literal values, not read from defaultParams(): the
 * point is that they do not move when a checkpoint changes the defaults. Add each new v2 param here when it lands.
 */
export const CHALLENGE_PIN: Record<string, number> = {
  // open prairie (S1)
  openPrairie: 0, ravenVagrants: 0,
  // canid disease (S2)
  cdvRate: 0, mangeRate: 0,
  // hungry-wolves mechanics, at their v5 defaults (candidates for v6)
  wolfPreyRef: 0, wolfRareHalf: 150, leanLitter: 0,
  // small-prey web (S4) and coyotes (S5)
  smallPrey: 0, smallGameField: 0, dogClip: 0, dogGrazeBonus: 0, 'coyote.initial': 0,
  // storms (S6), fire spread and summer dry spells (S17)
  stormCells: 0, fireSpread: 1, summerDroughtP: 0.1,
};
/** The calendar the challenges were tuned on, with every v2 mechanism pinned off. */
const CLASSIC = { calendarScale: 1, ...CHALLENGE_PIN };
/** Challenge times were tuned in 2,400-tick years; this turns a tuned length into the valley's own calendar (calendarScale).
 *  Read at use time, after the game has set the calendar. */
const Y = (base: number) => Math.round((base * BASE_YEAR_TICKS) / YEAR_TICKS);

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
    get goals() { return ['Three wolf packs holding territory at once', `Before year ${Y(15)}`, 'At most 3 interventions']; },
    seed: '21', scenario: 'island', get years() { return Y(15); }, maxTools: 3, params: CLASSIC,
    makeCheck() {
      let introduced = false;
      return (s) => {
        if (s.pop[Sp.Wolf] > 0) introduced = true;
        if (s.packs >= 3) return { state: 'won', progress: 'Three packs hold the valley.', reason: `Three packs held territory in year ${yr(s.year)}.` };
        if (introduced && s.pop[Sp.Wolf] === 0) {
          const r = `The wolves died out in year ${yr(s.year)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= Y(15)) return { state: 'lost', progress: 'Out of time.', reason: `Year ${Y(15)} came with ${s.packs} ${s.packs === 1 ? 'pack' : 'packs'}.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(15)}. ${s.packs} of 3 packs${introduced ? `, ${s.pop[Sp.Wolf]} wolves` : '. Use Add wolves to start'}.` };
      };
    },
  },
  {
    id: 'island',
    name: 'Island of plenty',
    blurb: 'No predators and endless grass, for now. Stop the herd from overrunning the valley.',
    get goals() { return [`Keep the bison under 2,500 from year ${Y(4)} on`, `Survive ${Y(30)} years`, 'At most 6 interventions']; },
    seed: '7', scenario: 'island', get years() { return Y(30); }, maxTools: 6, params: CLASSIC,
    makeCheck() {
      return (s) => {
        const b = s.pop[Sp.Bison];
        if (s.year >= Y(4) && b > 2500) {
          const r = `The herd swelled to ${b.toLocaleString()} in year ${yr(s.year)} and stripped the valley bare.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (b === 0) {
          const r = `The last bison died in year ${yr(s.year)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= Y(30)) return { state: 'won', progress: `${Y(30)} years, and the grass held.`, reason: `The herd stayed within what the valley could feed for ${Y(30)} years.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(30)}. ${b.toLocaleString()} bison${s.year < Y(4) ? `; the limit of 2,500 starts in year ${Y(4) + 1}` : ' of 2,500'}.` };
      };
    },
  },
  {
    id: 'herd',
    name: 'Save the herd',
    get blurb() { return `In this valley the wolves slowly grind the bison down until none are left. Keep every species alive for ${Y(40)} years.`; },
    get goals() { return [`Bison, wolves, ravens and pronghorn all alive at year ${Y(40)}`, 'At most 5 interventions']; },
    seed: '26', scenario: 'prairie', get years() { return Y(40); }, maxTools: 5, params: CLASSIC,
    makeCheck() {
      const guard = extinctionGuard(CORE);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        if (s.year >= Y(40)) return { state: 'won', progress: `${Y(40)} years, and the herd is still here.`, reason: `Every species made it through ${Y(40)} years.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(40)}. ${s.pop[Sp.Bison].toLocaleString()} bison, all four species alive.` };
      };
    },
  },
  {
    id: 'collapse',
    name: 'Pull it back',
    blurb: 'Fifteen hundred bison and a single small pack. Without more predators the pronghorn boom and then crash. Keep them from collapsing.',
    get goals() { return [`Keep the pronghorn above 100 from year ${Y(3)} on`, 'Nothing goes extinct', `Survive ${Y(30)} years`, 'At most 4 interventions']; },
    seed: '23', scenario: 'collapse', get years() { return Y(30); }, maxTools: 4, params: CLASSIC,
    makeCheck() {
      const guard = extinctionGuard(CORE);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        const ph = s.pop[Sp.Deer];
        if (s.year >= Y(3) && ph < 100) {
          const r = `The pronghorn crashed to ${ph} in year ${yr(s.year)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= Y(30)) return { state: 'won', progress: 'The valley is back in balance.', reason: `${Y(30)} years, and the pronghorn never fell below 100.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(30)}. ${ph.toLocaleString()} pronghorn${s.year < Y(3) ? `; the floor of 100 starts in year ${Y(3) + 1}` : ', floor 100'}.` };
      };
    },
  },
  {
    id: 'dry',
    name: 'The dry years',
    get blurb() { return `Drought arrives in year ${Y(1) + 1} and returns every ${Y(4)} years. Carry every species through ${Y(20)} years.`; },
    get goals() { return [`Bison, wolves, ravens and pronghorn all alive at year ${Y(20)}`, 'At most 4 interventions']; },
    seed: '11', scenario: 'dryyears', get years() { return Y(20); }, maxTools: 4, params: CLASSIC,
    makeCheck() {
      const guard = extinctionGuard(CORE);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        if (s.year >= Y(20)) return { state: 'won', progress: 'The rains came back, and so did everyone.', reason: `Every species outlasted ${Y(20)} dry years.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(20)}. All four species alive.` };
      };
    },
  },
  // ---- S17 challenges (tuned on tools/challenge_suite.py; worlds in src/scenarios.ts) ----
  {
    id: 'meso',
    name: 'Mesopredator release',
    blurb: 'The wolves are trapped out in year 2 and the coyotes, long-lived and unchecked, multiply. Left alone they will eat the hares, the prairie dogs and the pronghorn fawns. Rebalance the valley.',
    get goals() { return [`Fewer than 100 coyotes from year ${Y(4)} on, and at least 15 prairie dogs from year ${Y(5)}`, `Survive ${Y(12)} years`, 'At most 6 interventions']; },
    seed: '3', scenario: 'meso', get years() { return Y(12); }, maxTools: 6, params: { ...CLASSIC, ...MESO_PARAMS },
    makeCheck() {
      return (s) => {
        const hares = s.pop[Sp.Rabbit], coy = s.pop[Sp.Coyote];
        if (s.year >= Y(4) && coy >= 100) {
          const r = `The coyotes ran away with the valley: ${coy} of them in year ${yr(s.year)}, and ${hares.toLocaleString()} jackrabbits left.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= Y(5) && s.pop[Sp.PrairieDog] < 15) {
          const r = `The prairie dog towns were gone by year ${yr(s.year)}, with ${coy} coyotes in the valley.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= Y(12)) return { state: 'won', progress: 'The coyotes are back in their place.', reason: `${Y(12)} years, with ${coy} coyotes and ${s.pop[Sp.PrairieDog]} prairie dogs.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(12)}. ${coy} coyotes (under 100), ${hares.toLocaleString()} jackrabbits, ${s.pop[Sp.PrairieDog]} prairie dogs.` };
      };
    },
  },
  {
    id: 'town',
    name: 'The town that came back',
    blurb: 'Plague has wiped out the prairie dog towns, and in this closed valley nothing returns on its own. Bring a town back before the next plague, in year 6.',
    get goals() { return [`At least 80 prairie dogs at year ${Y(10)}`, 'Never fewer than 10 once the first are back', 'At most 6 interventions']; },
    seed: '5', scenario: 'plaguetown', get years() { return Y(10); }, maxTools: 6, params: { ...CLASSIC, ...PLAGUETOWN_PARAMS },
    makeCheck() {
      let back = false;
      return (s) => {
        const d = s.pop[Sp.PrairieDog];
        if (d >= 10 && s.year >= Y(1)) back = true;
        if (s.year >= Y(1.5) && !back) {
          const r = 'No prairie dogs came back, and the plains stayed empty.';
          return { state: 'lost', progress: r, reason: r };
        }
        if (back && d < 10) {
          const r = `The town died out again in year ${yr(s.year)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        if (s.year >= Y(10)) {
          if (d >= 80) return { state: 'won', progress: 'The town is back.', reason: `${d} prairie dogs at year ${Y(10)}, after two plagues.` };
          const r = `Only ${d} prairie dogs at year ${Y(10)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(10)}. ${d.toLocaleString()} prairie dogs${s.year < Y(1.5) ? '; use Add prairie dogs to start' : ', 80 needed'}.` };
      };
    },
  },
  {
    id: 'storm',
    name: 'Storm season',
    get blurb() { return `Every late summer from year ${Y(1) + 1}, dry lightning rakes the valley and the grass fires run fast. Five storm seasons in a row. Carry every species through ${Y(10)} years.`; },
    get goals() { return [`Bison, wolves, ravens and pronghorn all alive at year ${Y(10)}`, 'At most 5 interventions']; },
    seed: '4', scenario: 'stormseason', get years() { return Y(10); }, maxTools: 5, params: { ...CLASSIC, ...STORM_PARAMS },
    makeCheck() {
      const guard = extinctionGuard(CORE);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        if (s.year >= Y(10)) return { state: 'won', progress: 'The storms have passed.', reason: `Every species outlasted ${Y(10)} storm seasons.` };
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(10)}. All four species alive.` };
      };
    },
  },
  {
    id: 'cats',
    name: 'Cat country',
    blurb: 'Six cougars hunt the creek groves and sixty mule deer browse them. In a closed valley the cats and the deer take turns dying out. Keep both alive.',
    get goals() { return [`Cougars and mule deer both alive at year ${Y(12)}`, 'At least 3 cougars at the end', 'At most 5 interventions']; },
    seed: '1', scenario: 'cougars', get years() { return Y(12); }, maxTools: 5, params: { ...CLASSIC, ...COUGAR_WORLD },
    makeCheck() {
      const guard = extinctionGuard([Sp.Cougar, Sp.MuleDeer]);
      return (s) => {
        const lost = guard(s);
        if (lost) return { state: 'lost', progress: lost, reason: lost };
        if (s.year >= Y(12)) {
          if (s.pop[Sp.Cougar] >= 3) return { state: 'won', progress: 'Cats and deer, still here.', reason: `${s.pop[Sp.Cougar]} cougars and ${s.pop[Sp.MuleDeer]} mule deer at year ${Y(12)}.` };
          const r = `Only ${s.pop[Sp.Cougar]} cougars were left at year ${Y(12)}.`;
          return { state: 'lost', progress: r, reason: r };
        }
        return { state: 'running', progress: `Year ${yr(s.year)} of ${Y(12)}. ${s.pop[Sp.Cougar]} cougars, ${s.pop[Sp.MuleDeer]} mule deer.` };
      };
    },
  },
];

export function challengeById(id: string | null): Challenge | null {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}
