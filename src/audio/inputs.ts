// Helpers that turn sim data into the numbers AudioDirector.update() wants. Pure, no Web Audio.
import { AGENT_STRIDE, CARCASS_STRIDE, Sp, St } from '../sim/types';
import type { World } from '../sim/world';
import type { TensionSample } from './music';
import type { Nearby } from './mix';
import { clamp01 } from './mix';

/**
 * Count animals within `radius` metres (flat distance on the ground plane) of the camera, from a snapshot's agent array
 * (Float32, AGENT_STRIDE floats per animal: species at 0, x at 1, y at 2). Pass the camera's sim x and y.
 */
export function countNearby(agents: Float32Array, count: number, camX: number, camY: number, radius = 250): Nearby {
  const out: Nearby = { bison: 0, wolf: 0, raven: 0, pronghorn: 0 };
  const r2 = radius * radius;
  for (let i = 0; i < count; i++) {
    const o = i * AGENT_STRIDE;
    const dx = agents[o + 1] - camX;
    const dy = agents[o + 2] - camY;
    if (dx * dx + dy * dy > r2) continue;
    // only the four species the soundscape mixes are counted; any other species id (registry growth) falls through uncounted
    switch (agents[o]) {
      case Sp.Bison: out.bison++; break;
      case Sp.Wolf: out.wolf++; break;
      case Sp.Raven: out.raven++; break;
      case Sp.Deer: out.pronghorn++; break;
    }
  }
  return out;
}

/**
 * Count what is tense in the world, for the music: chasers, fleeing prey and stalkers within `radius` metres of the
 * camera (state at 7 in each agent record), chasers anywhere, and fresh carcasses (remaining fraction above 0.985, a kill or
 * a die-off that just happened), near and anywhere. Carcass records are CARCASS_STRIDE floats: x, y, remaining, species.
 */
export function scanTension(
  agents: Float32Array, count: number, camX: number, camY: number,
  carcasses: Float32Array, carcassCount: number, radius = 250,
): TensionSample {
  const out: TensionSample = { chasing: 0, fleeing: 0, stalking: 0, chasingWorld: 0, fresh: 0, freshWorld: 0 };
  const r2 = radius * radius;
  for (let i = 0; i < count; i++) {
    const o = i * AGENT_STRIDE;
    const st = agents[o + 7];
    if (st !== St.Chase && st !== St.Flee && st !== St.Stalk) continue;
    if (st === St.Chase) out.chasingWorld++;
    const dx = agents[o + 1] - camX;
    const dy = agents[o + 2] - camY;
    if (dx * dx + dy * dy > r2) continue;
    if (st === St.Chase) out.chasing++;
    else if (st === St.Flee) out.fleeing++;
    else out.stalking++;
  }
  for (let k = 0; k < carcassCount; k++) {
    const o = k * CARCASS_STRIDE;
    if (carcasses[o + 2] < 0.985) continue;
    out.freshWorld++;
    const dx = carcasses[o] - camX;
    const dy = carcasses[o + 1] - camY;
    if (dx * dx + dy * dy <= r2) out.fresh++;
  }
  return out;
}

/** 0..1 closeness to water at sim position (x, y): 1 on the bank, falling to 0 at `range` metres from the nearest water cell. */
export function nearWater01(world: Pick<World, 'size' | 'n' | 'cell' | 'waterDist'>, x: number, y: number, range = 60): number {
  const i = Math.min(world.n - 1, Math.max(0, Math.floor(x / world.cell)));
  const j = Math.min(world.n - 1, Math.max(0, Math.floor(y / world.cell)));
  const d = world.waterDist[j * world.n + i];
  if (!Number.isFinite(d)) return 0;
  const t = clamp01(1 - d / range);
  return t * t * (3 - 2 * t);
}
