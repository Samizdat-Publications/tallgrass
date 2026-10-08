// How the camera frames a followed animal, by species (R-readable). Distances follow the animal's size so each fills a readable share of the
// frame: small animals close (8 to 14 m), wolf, coyote, cougar and the deer 12 to 20 m, a bison 18 to 28 m (the camera pulls out a little
// more in a sprint, see FollowFrame.pull). The pitch is a slightly raised three-quarter view, so the animal is read against the ground.
import { Sp } from '../sim/types';
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
