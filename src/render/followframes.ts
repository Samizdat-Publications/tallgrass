// How the camera frames a followed animal, by species (R-readable). Distances follow the animal's size so each fills a readable share of the
// frame: small animals close (8 to 14 m), wolf, coyote, cougar and the deer 12 to 20 m, a bison 18 to 28 m (the camera pulls out a little
// more in a sprint, see FollowFrame.pull). The pitch is a slightly raised three-quarter view, so the animal is read against the ground.
import { AGENT_STRIDE, Sp, St } from '../sim/types';
import { SPECIES, canHunt, isPredator } from '../sim/species';
import type { FollowFrame } from './camera';

const FRAMES: Record<number, FollowFrame> = {
  [Sp.Bison]: { dist: 22, pull: 0.2, pitchDeg: 21, lift: 1.0 },
  [Sp.Wolf]: { dist: 14, pull: 0.3, pitchDeg: 26, lift: 0.5 },
  [Sp.Coyote]: { dist: 12.5, pull: 0.3, pitchDeg: 26, lift: 0.45 },
  [Sp.Cougar]: { dist: 14, pull: 0.3, pitchDeg: 25, lift: 0.5 },
  [Sp.Deer]: { dist: 15, pull: 0.3, pitchDeg: 26, lift: 0.55 }, // (the pronghorn)
  [Sp.MuleDeer]: { dist: 16, pull: 0.3, pitchDeg: 25, lift: 0.65 },
  [Sp.Rabbit]: { dist: 8.5, pull: 0.25, pitchDeg: 28, lift: 0.15 },
  [Sp.PrairieDog]: { dist: 8, pull: 0.2, pitchDeg: 28, lift: 0.12 },
  [Sp.Beaver]: { dist: 10, pull: 0.2, pitchDeg: 26, lift: 0.2 },
  [Sp.Raven]: { dist: 13, pull: 0.25, pitchDeg: 20, lift: 0.1 },
  [Sp.Hawk]: { dist: 18, pull: 0.25, pitchDeg: 20, lift: 0.1 },
  [Sp.Eagle]: { dist: 26, pull: 0.25, pitchDeg: 18, lift: 0.1 },
};
const FALLBACK: FollowFrame = { dist: 15, pull: 0.25, pitchDeg: 25, lift: 0.5 };

/** The framing for species `sp` (an unknown species gets a mid-size default). */
export function followFrameFor(sp: number): FollowFrame {
  return { ...(FRAMES[sp] ?? FALLBACK) };
}

/** Species that spend their time in the air: the camera follows them at their own height, not at the ground under them. */
export function isAirborneSpecies(sp: number): boolean {
  return sp === Sp.Raven || sp === Sp.Hawk || sp === Sp.Eagle;
}

/** A chase is filmed on the pair only while the target is within this many metres of the hunter (past it the prey has got away). */
export const PREY_FAR = 60;

/** A land hunter by the registry (wolf, cougar, coyote): worth framing with its prey when it is in a chase. Fliers hunt too high and fast to film. */
export function isLandHunter(sp: number): boolean {
  return isPredator(sp) && SPECIES[sp]?.flies === false;
}

/**
 * The animal that the predator at agent index `kp` is running at: the nearest land animal it can hunt, ahead of it (within 60 m, a running one
 * preferred over a standing one). -1 when there is none. Shared by the director's hunt shots and the player's follow camera (r-polish28), so a
 * chase is framed on the same pair either way.
 */
export function findChasePrey(A: ArrayLike<number>, count: number, kp: number): number {
  const op = kp * AGENT_STRIDE;
  const sp = A[op], px = A[op + 1], py = A[op + 2], hx = Math.cos(A[op + 3]), hy = Math.sin(A[op + 3]);
  let best = -1, bd = Infinity;
  for (let j = 0; j < count; j++) {
    if (j === kp) continue;
    const o = j * AGENT_STRIDE;
    if (SPECIES[A[o]]?.flies || !canHunt(sp, A[o])) continue;
    const dx = A[o + 1] - px, dy = A[o + 2] - py, d = Math.hypot(dx, dy);
    if (d > PREY_FAR - 5 || d < 0.01) continue;
    if ((dx * hx + dy * hy) / d < 0.3) continue; // behind it or to the side: not what it is running at
    const st = A[o + 7];
    const running = st === St.Flee || st === St.Run || st === St.Chase;
    const dd = d + (running ? 0 : 25);
    if (dd < bd) { bd = dd; best = j; }
  }
  return best;
}

/** True when the agent record at index `k` is a land hunter in a chase. */
export function isChasing(A: ArrayLike<number>, k: number): boolean {
  const o = k * AGENT_STRIDE;
  return isLandHunter(A[o]) && A[o + 7] === St.Chase;
}
