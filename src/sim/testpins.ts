// Test helper: the checkpoint v7c additions pinned off, for tests written against the v6b default world.
// Params a test passes explicitly still win, so `{ raptors: 1 }` in a test turns raptors back on.
import { applyOverrides, defaultParams as rawDefaultParams, type Params } from './params';
import { createSim as rawCreateSim, type Sim } from './sim';

export const V7C_OFF: Record<string, number> = {
  raptors: 0, stormCells: 0, 'cougar.initial': 0, 'muledeer.initial': 0, herdSpacingGraze: 0, raptorDogPref: 1,
  // checkpoint v8b additions, also pinned off for v6b-era tests
  snowDepth: 0, dynamicTrees: 0, treeCwRecruit: 0.0015, dogRescueYears: 20,
  // checkpoint v9 additions
  ravenNestFood: 0, muledeerCover: 0.25, 'bison.initial': 800,
  // checkpoint v10 additions
  evolution2: 0, climate2: 0, wolfDenMinDist: 200, wolfTerritory: 100,
  // checkpoint v10b additions (wolf.sprintCost 0.3 lives in evolution2's table, so evolution2 0 already removes it)
  'deer.maxLitter': 99, 'raven.initial': 30, 'coyote.initial': 12,
  // checkpoint v13: the wolves' feeding bout, and v13b: wolves that stop at a kill
  feedBout: 0, feedSettle: 0,
  // checkpoint v14: grazers conceive in better condition, and a crowded bison herd raises fewer calves
  conceiveEnergy: 0.6, bisonCrowdCalf: 0,
};

export function createSim(opts: { seed: number; params?: Record<string, number> }): Sim {
  return rawCreateSim({ ...opts, params: { ...V7C_OFF, ...opts.params } });
}

export function defaultParams(): Params {
  return applyOverrides(rawDefaultParams(), V7C_OFF);
}
