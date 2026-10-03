// Grey wolf, ~1.5 m nose to rump, 0.85 m at the shoulder, bushy tail. Built facing +X, +Z is the animal's right.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildWolf(): ModelDef {
  const b = new MeshBuilder();
  const nose = lin(0x0a0908);
  const pawCol = lin(0x2a2622);

  // Pale grey coat, cream underside and legs, darker saddle across the back (multiplies the coat colour).
  const bodyPaint: PaintFn = (p, n) => {
    const belly = smooth(-0.05, -0.55, n[1]);
    const saddle = smooth(0.2, 0.85, n[1]) * smooth(-0.5, -0.05, p[0]) * (1 - smooth(0.3, 0.55, p[0]));
    const k = 1 - 0.55 * saddle;
    return [mix(k, 1.3, belly), mix(k, 1.32, belly), mix(k, 1.34, belly), 1];
  };

  // Lean torso with a deep chest and tucked waist: [x, yCenter, up, down, side]
  b.addTube({
    part: PART.BODY, sides: 12, paint: bodyPaint,
    rings: torsoRings([
      [-0.64, 0.65, 0, 0, 0],
      [-0.58, 0.65, 0.09, 0.08, 0.075],
      [-0.4, 0.66, 0.15, 0.13, 0.12],
      [-0.14, 0.65, 0.14, 0.12, 0.105],
      [0.1, 0.66, 0.2, 0.25, 0.145],
      [0.32, 0.68, 0.21, 0.26, 0.155],
      [0.48, 0.7, 0.2, 0.22, 0.14],
      [0.6, 0.72, 0.16, 0.17, 0.12],
      [0.66, 0.7, 0, 0, 0],
    ]),
  });

  // Neck with a shaggy ruff, wedge skull, long muzzle (rotating head part).
  const neckPiv: V3 = [0.4, 0.74, 0];
  const headPaint: PaintFn = (p, n) => {
    const ruff = 1 - smooth(0.5, 0.72, p[0]);
    const muzzle = smooth(0.76, 0.86, p[0]);
    const nosePt = smooth(0.87, 0.92, p[0]);
    const under = smooth(0.0, -0.6, n[1]);
    const k = mix(1.0, 1.25 + 0.1 * under, Math.max(muzzle, under * 0.6));
    if (nosePt > 0.01) return [mix(k, nose[0], nosePt), mix(k, nose[1], nosePt), mix(k, nose[2], nosePt), nosePt > 0.7 ? 0 : 1];
    return [k + 0.1 * ruff, k + 0.06 * ruff, k, 1];
  };
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 10, paint: headPaint,
    rings: pathRings(
      [[0.34, 0.74, 0], [0.54, 0.84, 0], [0.72, 0.85, 0], [0.83, 0.8, 0], [0.91, 0.76, 0]],
      [[0.17, 0.15], [0.14, 0.115], [0.108, 0.1], [0.056, 0.05], [0.036, 0.032]],
      { sub: 3, capStart: false, capLen: 0.7 },
    ),
  });
  // Pointed ears
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6,
    paint: (_p, _n, t) => [0.7 - 0.25 * t, 0.68 - 0.25 * t, 0.65 - 0.25 * t, 1],
    rings: pathRings([[0.69, 0.87, 0.06], [0.675, 0.95, 0.07], [0.67, 1.03, 0.075]], [[0.04, 0.016], [0.034, 0.013], [0.012, 0.006]], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
  });

  // Long legs (+z right); gloves of lighter fur, dark paws.
  const legPaint: PaintFn = (p) => {
    if (p[1] < 0.045) return [pawCol[0], pawCol[1], pawCol[2], 0.3];
    return [1.15, 1.15, 1.18, 1];
  };
  b.addPair(
    {
      part: PART.FR, piv: [0.34, 0.66, 0.1], piv2: [0.37, 0.27, 0.085], sides: 8, paint: legPaint,
      w1: (p) => smooth(0.36, 0.2, p[1]),
      rings: pathRings(
        [[0.34, 0.66, 0.1], [0.36, 0.42, 0.095], [0.37, 0.27, 0.085], [0.385, 0.12, 0.08], [0.405, 0.04, 0.08]],
        [[0.1, 0.085], [0.07, 0.058], [0.046, 0.04], [0.037, 0.034], [0.05, 0.04]],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.FL,
  );
  b.addPair(
    {
      part: PART.HR, piv: [-0.44, 0.66, 0.1], piv2: [-0.5, 0.27, 0.1], sides: 8, paint: legPaint,
      w1: (p) => smooth(0.36, 0.2, p[1]),
      rings: pathRings(
        [[-0.44, 0.66, 0.1], [-0.33, 0.46, 0.12], [-0.5, 0.27, 0.1], [-0.47, 0.12, 0.085], [-0.45, 0.04, 0.08]],
        [[0.13, 0.095], [0.1, 0.07], [0.048, 0.04], [0.036, 0.034], [0.05, 0.04]],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.HL,
  );

  // Bushy tail with a dark tip
  b.addTube({
    part: PART.TAIL, piv: [-0.58, 0.66, 0], sides: 9,
    paint: (p, n, t) => {
      const tip = smooth(0.72, 0.9, t);
      const top = smooth(0.2, 0.8, n[1]) * 0.35;
      const k = 1 - top - 0.65 * tip;
      return [k + 0.05, k + 0.03, k, 1];
    },
    rings: pathRings(
      [[-0.56, 0.66, 0], [-0.76, 0.6, 0], [-0.97, 0.47, 0], [-1.08, 0.33, 0]],
      [[0.04, 0.04], [0.075, 0.075], [0.085, 0.082], [0.05, 0.045]],
      { sub: 3, capLen: 1.2 },
    ),
  });

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0xb4bbc6),
    coatDark: lin(0x535965),
    bone: lin(0xd8d0bc),
    roughness: 0.92,
    fill: 1.5,
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.66,
      trot0: 1.5, trot1: 2.3, gal0: 3.9, gal1: 5.2,
      ampW: 0.5, ampT: 0.62, ampG: 0.9,
      kneeW: 0.5, kneeT: 0.8, kneeG: 1.25,
      bobW: 0.012, bobT: 0.025, bobG: 0.07,
      pitchT: 0.025, pitchG: 0.12,
      nodW: 0.05, nodG: 0.09,
      headDown: 1.05, lookYaw: 0.5,
      tailRest: 0, tailRun: -0.3, tailSway: 0.22,
      lieDrop: 0.4, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      crouchDrop: 0.18,
      deadDrop: 0.36, deadHipF: 0.9, deadHipH: -0.6,
      strideW: 1.3, strideG: 4.2, strideSpeedMax: 16,
      length: 1.5, height: 0.85, ring: 1.1, minPx: 9, boostLen: 1.5,
    },
  };
}
