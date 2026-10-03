// Cottontail rabbit, ~0.4 m long, long ears, white cotton tail. Hops instead of galloping.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildRabbit(): ModelDef {
  const b = new MeshBuilder();
  const cream = 0.9;

  const bodyPaint: PaintFn = (p, n) => {
    const belly = smooth(-0.1, -0.7, n[1]);
    const back = smooth(0.3, 0.9, n[1]);
    const k = 1 - 0.15 * back;
    return [mix(k, cream, belly), mix(k, cream * 0.96, belly), mix(k, cream * 0.88, belly), 1 - belly * 0.6];
  };
  // Hunched body with big haunches
  b.addTube({
    part: PART.BODY, sides: 10, paint: bodyPaint,
    rings: torsoRings([
      [-0.18, 0.13, 0, 0, 0],
      [-0.15, 0.14, 0.055, 0.055, 0.05],
      [-0.08, 0.15, 0.1, 0.085, 0.09],
      [0.02, 0.14, 0.095, 0.075, 0.08],
      [0.1, 0.13, 0.075, 0.06, 0.065],
      [0.16, 0.13, 0, 0, 0],
    ]),
  });
  // Cotton tail
  b.addTube({
    part: PART.TAIL, piv: [-0.17, 0.15, 0], sides: 8, paint: [0.95, 0.94, 0.9, 0],
    rings: blobRings([-0.2, 0.17, 0], 0.04, 0.04, 0.035, 5),
  });
  // Head and ears
  const neckPiv: V3 = [0.12, 0.14, 0];
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 8, paint: (p) => [mix(1, cream, smooth(0.23, 0.27, p[0])), mix(1, cream, smooth(0.23, 0.27, p[0])), mix(1, cream, smooth(0.23, 0.27, p[0])), 1 - smooth(0.23, 0.27, p[0]) * 0.6],
    rings: pathRings([[0.1, 0.13, 0], [0.17, 0.155, 0], [0.23, 0.15, 0], [0.275, 0.13, 0]], [[0.065, 0.055], [0.055, 0.05], [0.045, 0.04], [0.022, 0.02]], { sub: 2, capStart: false, capLen: 0.7 }),
  });
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: (_p, n, t) => [1 - 0.2 * t, 0.9 - 0.15 * t, 0.85 - 0.1 * t, 1],
    rings: pathRings([[0.15, 0.19, 0.03], [0.12, 0.27, 0.04], [0.09, 0.35, 0.05]], [[0.014, 0.026], [0.012, 0.03], [0.004, 0.008]], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
  });
  // Legs: big folded hind feet, short forelegs
  b.addPair(
    {
      part: PART.FR, piv: [0.11, 0.1, 0.035], piv2: [0.12, 0.05, 0.035], sides: 6, paint: [1.05, 0.98, 0.9, 1],
      w1: (p) => smooth(0.07, 0.04, p[1]),
      rings: pathRings([[0.11, 0.1, 0.035], [0.125, 0.05, 0.035], [0.14, 0.015, 0.035]], [[0.03, 0.025], [0.022, 0.02], [0.022, 0.02]], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
    },
    PART.FL,
  );
  b.addPair(
    {
      part: PART.HR, piv: [-0.09, 0.13, 0.05], piv2: [-0.17, 0.04, 0.05], sides: 7, paint: [1.05, 0.98, 0.9, 1],
      w1: (p) => smooth(0.07, 0.04, p[1]),
      rings: pathRings([[-0.09, 0.13, 0.055], [-0.03, 0.07, 0.07], [-0.17, 0.035, 0.055], [-0.05, 0.012, 0.05], [0.04, 0.012, 0.05]], [[0.07, 0.05], [0.05, 0.04], [0.025, 0.02], [0.022, 0.018], [0.022, 0.018]], { ref: [0, 0, 1], sub: 2, capStart: false, capLen: 0.5 }),
    },
    PART.HL,
  );

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0xa48c70),
    coatDark: lin(0x5a4636),
    bone: lin(0xd8d0bc),
    roughness: 0.95,
    fill: 1.5,
    warm: [1.12, 1.0, 0.82],
    neutral: 0.7,
    params: {
      ...DEFAULT_PARAMS,
      kind: 1,
      comY: 0.12,
      trot0: 0.3, trot1: 0.4, gal0: 0.45, gal1: 0.8,
      ampW: 0.9, ampT: 0.9, ampG: 0.9,
      kneeW: 0.8, kneeT: 0.8, kneeG: 0.8,
      bobW: 0.05, bobT: 0.06, bobG: 0.09,
      pitchT: 0.2, pitchG: 0.3,
      nodW: 0.1, nodG: 0.1,
      headDown: 0.75, lookYaw: 0.6,
      tailRest: 0.2, tailRun: 0.3, tailSway: 0.1,
      lieDrop: 0.05, lieHipF: 0.9, lieKneeF: -1.6, lieHipH: -0.5, lieKneeH: 1.0,
      crouchDrop: 0.03,
      deadDrop: 0.06, deadHipF: 0.9, deadHipH: -0.6,
      offW: [0.3, 0.3, 0.0, 0.0],
      offT: [0.3, 0.3, 0.0, 0.0],
      offG: [0.3, 0.3, 0.0, 0.0],
      strideW: 0.5, strideG: 1.3, strideSpeedMax: 5,
      length: 0.4, height: 0.3, ring: 0.4, minPx: 3.5, boostLen: 0.4,
    },
  };
}
