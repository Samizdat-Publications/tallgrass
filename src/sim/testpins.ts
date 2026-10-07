// Test helper: the checkpoint v7c additions pinned off, for tests written against the v6b default world.
// Params a test passes explicitly still win, so `{ raptors: 1 }` in a test turns raptors back on.
import { applyOverrides, defaultParams as rawDefaultParams, type Params } from './params';
import { createSim as rawCreateSim, type Sim } from './sim';

export const V7C_OFF: Record<string, number> = {
  raptors: 0, stormCells: 0, 'cougar.initial': 0, 'muledeer.initial': 0, herdSpacingGraze: 0, raptorDogPref: 1,
};

export function createSim(opts: { seed: number; params?: Record<string, number> }): Sim {
  return rawCreateSim({ ...opts, params: { ...V7C_OFF, ...opts.params } });
}

export function defaultParams(): Params {
  return applyOverrides(rawDefaultParams(), V7C_OFF);
}
