// Common raven, ~0.6 m long, 1.2 m wingspan. Origin at the feet; the body centre sits at y = 0.15.
// Wings are separate parts (L = -z, R = +z) that the shader flaps, glides or folds.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildRaven(): ModelDef {
  const b = new MeshBuilder();
  const beak = lin(0x0a0a0a);

  // Black with a faint blue-black sheen on the wing tops
  const feather: PaintFn = (p, n) => [1, 1, 1.06 + 0.1 * Math.max(0, n[1]), 1];
  b.addTube({
    part: PART.BODY, sides: 10, paint: feather,
    rings: torsoRings([
      [-0.14, 0.14, 0, 0, 0],
      [-0.1, 0.145, 0.03, 0.03, 0.026],
      [-0.02, 0.15, 0.055, 0.05, 0.055],
      [0.08, 0.155, 0.06, 0.055, 0.06],
      [0.16, 0.16, 0.05, 0.045, 0.048],
      [0.2, 0.165, 0, 0, 0],
    ]),
  });
  const neckPiv: V3 = [0.16, 0.16, 0];
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 8, paint: feather,
    rings: pathRings([[0.14, 0.16, 0], [0.2, 0.185, 0], [0.245, 0.19, 0]], [[0.045, 0.04], [0.048, 0.043], [0.04, 0.035]], { sub: 2, capStart: false, capLen: 0.7 }),
  });
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 7, paint: [beak[0], beak[1], beak[2], 0],
    rings: pathRings([[0.24, 0.19, 0], [0.3, 0.185, 0], [0.36, 0.165, 0]], [[0.026, 0.02], [0.022, 0.016], [0.005, 0.005]], { sub: 2, capStart: false, capLen: 0.5 }),
  });
  // Wedge tail
  b.addTube({
    part: PART.TAIL, piv: [-0.12, 0.145, 0], sides: 8, paint: feather,
    rings: pathRings([[-0.1, 0.145, 0], [-0.26, 0.14, 0], [-0.4, 0.135, 0]], [[0.012, 0.03], [0.008, 0.05], [0.006, 0.055]], { sub: 2, capLen: 0.3 }),
  });
  // Legs
  b.addPair({
    part: PART.FR, piv: [0.02, 0.12, 0.03], piv2: [0.02, 0.12, 0.03], sides: 5, paint: [0.05, 0.05, 0.05, 0],
    rings: pathRings([[0.02, 0.12, 0.03], [0.04, 0.05, 0.03], [0.05, 0.0, 0.03]], [[0.012, 0.012], [0.008, 0.008], [0.01, 0.014]], { ref: [1, 0, 0], sub: 1, capStart: false, capLen: 0.3 }),
  }, PART.FL);

  // Wings: a flat lofted blade root to tip along +z, plus primary "fingers" fanned at the tip.
  const wPiv: V3 = [0.04, 0.17, 0.05];
  const wElbow: V3 = [0.0, 0.175, 0.3];
  const wingW1 = (p: V3) => smooth(0.25, 0.4, p[2]);
  b.addPair(
    {
      part: PART.WINGR, piv: wPiv, piv2: wElbow, sides: 8, paint: feather, w1: wingW1,
      rings: pathRings(
        [[0.03, 0.17, 0.04], [0.0, 0.175, 0.2], [-0.03, 0.178, 0.4], [-0.07, 0.18, 0.55], [-0.1, 0.18, 0.62]],
        [[0.014, 0.1], [0.01, 0.11], [0.008, 0.095], [0.006, 0.06], [0.004, 0.025]],
        { ref: [0, 1, 0], sub: 2, capLen: 0.6 },
      ),
    },
    PART.WINGL,
  );
  for (let k = 0; k < 4; k++) {
    const x0 = -0.05 - k * 0.025;
    b.addPair(
      {
        part: PART.WINGR, piv: wPiv, piv2: wElbow, sides: 6, paint: feather, w1: wingW1,
        rings: pathRings(
          [[x0 + 0.03, 0.179, 0.46], [x0 - 0.02 - k * 0.012, 0.18, 0.56], [x0 - 0.05 - k * 0.028, 0.18, 0.66 - k * 0.01]],
          [[0.005, 0.022], [0.004, 0.017], [0.003, 0.008]],
          { ref: [0, 1, 0], sub: 1, capStart: false, capLen: 0.4 },
        ),
      },
      PART.WINGL,
    );
  }

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0x34343a),
    coatDark: lin(0x0b0b0e),
    bone: lin(0xd8d0bc),
    roughness: 0.5,
    fill: 1.6,
    params: {
      ...DEFAULT_PARAMS,
      kind: 2,
      comY: 0.15,
      flapHz: 3.4,
      headDown: 0.9, lookYaw: 0.7,
      tailRest: 0, tailRun: 0, tailSway: 0.15,
      lieDrop: 0, deadDrop: 0.12,
      strideW: 0.5, strideG: 1.2, strideSpeedMax: 8,
      length: 0.6, height: 0.35, ring: 0.6, minPx: 9, boostLen: 1.2,
    },
  };
}
