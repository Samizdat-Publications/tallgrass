// Black-tailed prairie dog, ~0.3 m long and 0.25 m tall when it stands up: a plump buff body, a blunt face, tiny ears, a short
// tail with a dark tip. Built like the other models (models/builder.ts) and drawn with the same vertex-shader animation as a
// 'hopper' (kind 1). It is not in the species model table (models/index.ts): the town puppets in render/smallprey.ts build it
// themselves, because prairie dogs are a density field in the sim, not agents.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildPrairieDog(): ModelDef {
  const b = new MeshBuilder();

  // coat influence 1: the colour multiplies the coat (pale buff .. dark cinnamon); the belly and throat lift toward cream
  const bodyPaint: PaintFn = (p, n) => {
    const belly = smooth(-0.1, -0.7, n[1]);
    const back = smooth(0.3, 0.9, n[1]);
    const k = 1 - 0.1 * back;
    return [mix(k, 1.25, belly), mix(k, 1.2, belly), mix(k, 1.05, belly), 1 - belly * 0.35];
  };
  // pear-shaped body: heavy haunches, narrower chest
  b.addTube({
    part: PART.BODY, sides: 10, paint: bodyPaint,
    rings: torsoRings([
      [-0.14, 0.09, 0, 0, 0],
      [-0.12, 0.095, 0.05, 0.046, 0.05],
      [-0.05, 0.10, 0.083, 0.072, 0.088],
      [0.04, 0.105, 0.083, 0.068, 0.082],
      [0.1, 0.108, 0.064, 0.052, 0.062],
      [0.14, 0.108, 0, 0, 0],
    ]),
  });
  // short tail with a dark tip
  b.addTube({
    part: PART.TAIL, piv: [-0.13, 0.1, 0], sides: 6,
    paint: (p) => {
      const tip = smooth(-0.185, -0.205, p[0]);
      return [mix(1.0, 0.1, tip), mix(0.95, 0.08, tip), mix(0.82, 0.07, tip), 1 - tip];
    },
    rings: blobRings([-0.175, 0.1, 0], 0.045, 0.02, 0.018, 5),
  });
  // head: blunt, with a lighter muzzle
  const neckPiv: V3 = [0.11, 0.115, 0];
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 8,
    paint: (p) => {
      const m = smooth(0.2, 0.245, p[0]);
      return [mix(1, 1.18, m), mix(1, 1.12, m), mix(1, 1.0, m), 1 - m * 0.3];
    },
    rings: pathRings([[0.1, 0.112, 0], [0.16, 0.128, 0], [0.205, 0.122, 0], [0.245, 0.108, 0]], [[0.06, 0.055], [0.054, 0.05], [0.042, 0.038], [0.02, 0.018]], { sub: 2, capStart: false, capLen: 0.7 }),
  });
  // tiny round ears and a dark nose
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.55, 0.45, 0.35, 1],
    rings: blobRings([0.15, 0.178, 0.04], 0.012, 0.014, 0.008, 4),
  });
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.06, 0.05, 0.05, 0],
    rings: blobRings([0.243, 0.108, 0], 0.01, 0.009, 0.009, 4),
  });
  // dark eyes: small blobs on the sides of the head (a dark pair reads as a face even from 20 m)
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.04, 0.035, 0.03, 0],
    rings: blobRings([0.185, 0.14, 0.046], 0.008, 0.008, 0.006, 4),
  });
  // legs: stubby forelegs (used as hands when it sits up), longer hind legs with a flat foot
  b.addPair(
    {
      part: PART.FR, piv: [0.085, 0.07, 0.04], piv2: [0.095, 0.038, 0.04], sides: 6, paint: [1.1, 1.0, 0.85, 1],
      w1: (p) => smooth(0.05, 0.03, p[1]),
      rings: pathRings([[0.085, 0.07, 0.04], [0.095, 0.038, 0.04], [0.108, 0.01, 0.04]], [[0.03, 0.026], [0.022, 0.02], [0.02, 0.02]], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
    },
    PART.FL,
  );
  b.addPair(
    {
      part: PART.HR, piv: [-0.07, 0.09, 0.055], piv2: [-0.105, 0.05, 0.055], sides: 6, paint: [1.1, 1.0, 0.85, 1],
      w1: (p) => smooth(0.06, 0.03, p[1]),
      rings: pathRings([[-0.07, 0.09, 0.055], [-0.105, 0.05, 0.058], [-0.085, 0.02, 0.052], [-0.03, 0.01, 0.05], [0.02, 0.01, 0.05]], [[0.056, 0.042], [0.034, 0.028], [0.02, 0.018], [0.016, 0.016], [0.016, 0.016]], { ref: [0, 0, 1], sub: 2, capStart: false, capLen: 0.5 }),
    },
    PART.HL,
  );

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0xd2a971),
    coatDark: lin(0x8f6a3f),
    bone: lin(0xd8d0bc),
    roughness: 0.95,
    fill: 1.45,
    warm: [1.12, 1.0, 0.82],
    neutral: 0.7,
    // from a distance the buff coat pales to the colour of the ground it sits on and is lost, so it keeps a darker back
    far: { gain: 0.9, rim: 0.12, hunt: 0, rimCol: [1.0, 0.85, 0.55], d0: 40, d1: 160, floor: 0.35, tint: lin(0xc09a64), mix: 0.35 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 1,
      comY: 0.1,
      // a scurry, not a bound: it trots at under a metre a second and only hops properly at a run
      trot0: 0.12, trot1: 0.3, gal0: 1.2, gal1: 2.4,
      ampW: 0.7, ampT: 0.8, ampG: 0.9,
      kneeW: 0.6, kneeT: 0.7, kneeG: 0.8,
      bobW: 0.01, bobT: 0.014, bobG: 0.05,
      pitchT: 0.08, pitchG: 0.25,
      nodW: 0.08, nodG: 0.1,
      headDown: 0.7, lookYaw: 0.5,
      tailRest: 0.1, tailRun: 0.2, tailSway: 0.1,
      lieDrop: 0.04, lieHipF: 0.9, lieKneeF: -1.6, lieHipH: -0.5, lieKneeH: 1.0,
      crouchDrop: 0.02,
      deadDrop: 0.05, deadHipF: 0.9, deadHipH: -0.6,
      offW: [0.3, 0.3, 0.0, 0.0],
      offT: [0.3, 0.3, 0.0, 0.0],
      offG: [0.3, 0.3, 0.0, 0.0],
      strideW: 0.16, strideG: 0.55, strideSpeedMax: 3,
      length: 0.3, height: 0.22, ring: 0.3, minPx: 3.2, boostLen: 0.3,
    },
  };
}
