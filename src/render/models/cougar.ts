// Cougar, ~1.3 m body plus a long dark-tipped tail (about 2 m overall), 0.8 m at the shoulder. Tawny, low and sleek.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildCougar(): ModelDef {
  const b = new MeshBuilder();
  const dark = lin(0x120e0b);

  const bodyPaint: PaintFn = (p, n) => {
    const belly = smooth(-0.1, -0.6, n[1]);
    const back = smooth(0.2, 0.9, n[1]);
    const k = 1 - 0.1 * back;
    return [mix(k, 1.5, belly), mix(k, 1.5, belly), mix(k, 1.5, belly), 1];
  };
  b.addTube({
    part: PART.BODY, sides: 12, paint: bodyPaint,
    rings: torsoRings([
      [-0.64, 0.62, 0, 0, 0],
      [-0.58, 0.63, 0.1, 0.1, 0.09],
      [-0.38, 0.64, 0.17, 0.15, 0.14],
      [-0.08, 0.62, 0.14, 0.13, 0.125],
      [0.18, 0.62, 0.17, 0.18, 0.14],
      [0.38, 0.63, 0.19, 0.19, 0.145],
      [0.52, 0.64, 0.15, 0.15, 0.115],
      [0.6, 0.65, 0, 0, 0],
    ]),
  });

  const neckPiv: V3 = [0.42, 0.68, 0];
  const headPaint: PaintFn = (p, n) => {
    const muzzle = smooth(0.74, 0.84, p[0]);
    const nose = smooth(0.89, 0.92, p[0]);
    const under = smooth(0.0, -0.6, n[1]);
    const w = Math.max(muzzle * 0.8, under * 0.5);
    if (nose > 0.6) return [0.1, 0.05, 0.05, 0];
    return [mix(1, 1.6, w), mix(1, 1.6, w), mix(1, 1.55, w), 1];
  };
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 10, paint: headPaint,
    rings: pathRings(
      [[0.36, 0.66, 0], [0.52, 0.72, 0], [0.68, 0.74, 0], [0.8, 0.7, 0], [0.89, 0.665, 0]],
      [[0.15, 0.13], [0.12, 0.105], [0.105, 0.1], [0.06, 0.06], [0.04, 0.04]],
      { sub: 3, capStart: false, capLen: 0.7 },
    ),
  });
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: (_p, _n, t) => [mix(1, 0.15, smooth(0.0, 0.7, t)), mix(1, 0.12, smooth(0.0, 0.7, t)), mix(1, 0.1, smooth(0.0, 0.7, t)), 1],
    rings: pathRings([[0.67, 0.79, 0.075], [0.66, 0.85, 0.085], [0.655, 0.89, 0.09]], [[0.035, 0.022], [0.03, 0.02], [0.012, 0.008]], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
  });

  const pawCol = lin(0x2a2018);
  const legPaint: PaintFn = (p, n) => {
    if (p[1] < 0.04) return [pawCol[0], pawCol[1], pawCol[2], 0.4];
    return [1.15, 1.1, 1.0, 1];
  };
  b.addPair(
    {
      part: PART.FR, piv: [0.38, 0.6, 0.1], piv2: [0.41, 0.24, 0.09], sides: 8, paint: legPaint,
      w1: (p) => smooth(0.34, 0.2, p[1]),
      rings: pathRings(
        [[0.38, 0.6, 0.1], [0.4, 0.4, 0.1], [0.41, 0.24, 0.09], [0.42, 0.1, 0.085], [0.44, 0.04, 0.085]],
        [[0.1, 0.085], [0.07, 0.065], [0.05, 0.045], [0.044, 0.04], [0.06, 0.05]],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.FL,
  );
  b.addPair(
    {
      part: PART.HR, piv: [-0.4, 0.62, 0.11], piv2: [-0.47, 0.24, 0.1], sides: 8, paint: legPaint,
      w1: (p) => smooth(0.34, 0.2, p[1]),
      rings: pathRings(
        [[-0.4, 0.62, 0.11], [-0.28, 0.42, 0.125], [-0.47, 0.24, 0.1], [-0.44, 0.1, 0.085], [-0.41, 0.04, 0.085]],
        [[0.14, 0.1], [0.1, 0.075], [0.05, 0.044], [0.04, 0.038], [0.06, 0.05]],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.HL,
  );

  // Long heavy tail with a dark tip
  b.addTube({
    part: PART.TAIL, piv: [-0.58, 0.62, 0], sides: 8,
    paint: (p, n, t) => {
      const tip = smooth(0.75, 0.9, t);
      const k = mix(1, 0.12, tip);
      return [k, k, k, 1];
    },
    rings: pathRings(
      [[-0.56, 0.62, 0], [-0.82, 0.52, 0], [-1.08, 0.36, 0], [-1.3, 0.2, 0], [-1.4, 0.15, 0]],
      [[0.05, 0.05], [0.055, 0.055], [0.052, 0.052], [0.045, 0.045], [0.04, 0.04]],
      { sub: 3, capLen: 1.2 },
    ),
  });

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0xd2a56c),
    coatDark: lin(0x8c6238),
    bone: lin(0xd8d0bc),
    roughness: 0.9,
    fill: 1.5,
    warm: [1.15, 1.0, 0.8],
    neutral: 0.7,
    far: { gain: 0.85, rim: 0.04, hunt: 0.4, rimCol: [1.0, 0.86, 0.62] },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.62, legL: 0.6,
      // on-screen m/s at 1x
      trot0: 2.6, trot1: 3.6, gal0: 8.5, gal1: 11.5,
      ampW: 0.5, ampT: 0.66, ampG: 1.0,
      dutyW: 0.62, dutyT: 0.5, dutyG: 0.36,
      kneeW: 0.55, kneeT: 0.85, kneeG: 1.3,
      bobW: 0.015, bobT: 0.03, bobG: 0.08,
      pitchT: 0.03, pitchG: 0.15,
      nodW: 0.04, nodG: 0.07,
      headDown: 1.0, lookYaw: 0.4,
      tailRest: 0.0, tailRun: -0.3, tailSway: 0.35,
      lieDrop: 0.4, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      crouchDrop: 0.26,
      deadDrop: 0.36, deadHipF: 0.9, deadHipH: -0.6,
      length: 1.3, height: 0.8, ring: 1.3, minPx: 13, boostLen: 1.8,
    },
  };
}
