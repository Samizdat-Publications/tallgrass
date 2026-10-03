// American bison, ~3.3 m nose to rump, 1.85 m at the hump. Built facing +X, +Z is the animal's right.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings } from './builder';
import type { Paint, PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildBison(): ModelDef {
  const b = new MeshBuilder();
  const hornCol = lin(0x17120d);
  const hoofCol = lin(0x0d0a08);
  const beardCol = lin(0x1c140e);

  // Lighter tan wool over the forequarters, hump and head; dark brown hindquarters (multiplies the coat colour).
  const wool: PaintFn = (p, n) => {
    const front = smooth(-0.25, 0.85, p[0]);
    const high = smooth(0.85, 1.75, p[1]);
    const belly = mix(1, 0.6, smooth(-0.1, -0.8, n[1]));
    const w = Math.min(1, front * (0.45 + 0.55 * high));
    const top = smooth(0.2, 0.9, n[1]) * smooth(0.0, 0.5, p[0]) * 0.25;
    return [(1 + (1.7 + top) * w) * belly, (1 + (1.35 + top) * w) * belly, (1 + 0.55 * w) * belly, 1];
  };

  // Torso with the signature shoulder hump: [x, yCenter, up, down, side]
  b.addTube({
    part: PART.BODY,
    sides: 14,
    paint: wool,
    rings: torsoRings([
      [-1.42, 1.02, 0, 0, 0],
      [-1.34, 1.04, 0.17, 0.2, 0.15],
      [-1.15, 1.04, 0.28, 0.28, 0.28],
      [-0.85, 1.03, 0.32, 0.27, 0.33],
      [-0.5, 1.05, 0.36, 0.3, 0.38],
      [-0.15, 1.1, 0.46, 0.36, 0.44],
      [0.15, 1.15, 0.68, 0.44, 0.5],
      [0.45, 1.14, 0.78, 0.48, 0.54],
      [0.75, 1.13, 0.66, 0.5, 0.52],
      [1.05, 1.1, 0.48, 0.5, 0.47],
      [1.3, 1.06, 0.38, 0.44, 0.4],
      [1.46, 1.02, 0.28, 0.34, 0.3],
      [1.56, 1.0, 0, 0, 0],
    ]),
  });

  // Neck, big shaggy head and low-slung muzzle (one rotating part, pivot at the base of the neck).
  const neckPiv: V3 = [0.95, 1.32, 0];
  const headPaint: PaintFn = (p, n) => {
    // pale tan forehead cap and mane, dark muzzle
    const cap = smooth(1.3, 1.75, p[0]) * (1 - smooth(1.95, 2.15, p[0]));
    const mane = 1 - smooth(1.2, 1.5, p[0]);
    const k = Math.max(cap * 0.8, mane);
    const lowSnout = smooth(1.95, 2.15, p[0]);
    return [mix(1.9, 1.15, lowSnout) * (0.6 + 0.4 * k), mix(1.55, 1.0, lowSnout) * (0.6 + 0.4 * k), mix(1.2, 0.95, lowSnout) * (0.6 + 0.4 * k), 1];
  };
  b.addTube({
    part: PART.HEAD,
    piv: neckPiv,
    sides: 12,
    paint: headPaint,
    rings: pathRings(
      [[0.75, 1.3, 0], [1.2, 1.17, 0], [1.68, 1.0, 0], [1.98, 0.85, 0], [2.15, 0.75, 0]],
      [[0.4, 0.4], [0.38, 0.38], [0.35, 0.34], [0.25, 0.22], [0.17, 0.15]],
      { sub: 3, capStart: false },
    ),
  });
  // Beard
  b.addTube({
    part: PART.HEAD,
    piv: neckPiv,
    sides: 8,
    paint: [beardCol[0], beardCol[1], beardCol[2], 0.3],
    rings: pathRings(
      [[1.7, 0.95, 0], [1.9, 0.72, 0], [1.93, 0.5, 0], [1.88, 0.3, 0]],
      [[0.12, 0.1], [0.1, 0.09], [0.07, 0.06], [0.02, 0.02]],
      { sub: 2 },
    ),
  });
  // Short curved horns
  b.addPair({
    part: PART.HEAD,
    piv: neckPiv,
    sides: 8,
    paint: [hornCol[0], hornCol[1], hornCol[2], 0],
    rings: pathRings(
      [[1.7, 1.2, 0.26], [1.68, 1.22, 0.45], [1.64, 1.36, 0.55], [1.68, 1.53, 0.5], [1.76, 1.62, 0.4]],
      [[0.06, 0.06], [0.05, 0.05], [0.04, 0.04], [0.025, 0.025], [0.008, 0.008]],
      { sub: 2, capStart: false },
    ),
  });

  // Front legs: thick woolly chaps down to the knee, pale lower leg, dark hoof.
  const legPaintF: PaintFn = (p) => {
    if (p[1] < 0.1) return [hoofCol[0], hoofCol[1], hoofCol[2], 0];
    const w = smooth(0.35, 0.9, p[1]);
    return [1 + 0.8 * w, 1 + 0.62 * w, 1 + 0.35 * w, 1];
  };
  const fHip: V3 = [0.52, 1.1, 0.26];
  const fKnee: V3 = [0.56, 0.52, 0.25];
  b.addPair(
    {
      part: PART.FR, piv: fHip, piv2: fKnee, sides: 10, paint: legPaintF,
      w1: (p) => smooth(0.64, 0.42, p[1]),
      rings: pathRings(
        [[0.52, 1.1, 0.26], [0.55, 0.85, 0.27], [0.56, 0.52, 0.25], [0.55, 0.3, 0.24], [0.55, 0.17, 0.24], [0.55, 0.09, 0.24]],
        [[0.23, 0.19], [0.21, 0.17], [0.12, 0.105], [0.09, 0.08], [0.085, 0.08], [0.1, 0.09]],
        { ref: [1, 0, 0], sub: 2, capStart: false },
      ),
    },
    PART.FL,
  );
  // Hind legs: leaner, with a hock.
  const legPaintH: PaintFn = (p) => {
    if (p[1] < 0.1) return [hoofCol[0], hoofCol[1], hoofCol[2], 0];
    return [1.05, 1.0, 0.95, 1];
  };
  const hHip: V3 = [-0.95, 1.12, 0.26];
  const hHock: V3 = [-1.0, 0.5, 0.27];
  b.addPair(
    {
      part: PART.HR, piv: hHip, piv2: hHock, sides: 10, paint: legPaintH,
      w1: (p) => smooth(0.64, 0.42, p[1]),
      rings: pathRings(
        [[-0.95, 1.12, 0.26], [-0.8, 0.82, 0.3], [-1.0, 0.5, 0.27], [-0.98, 0.26, 0.25], [-0.97, 0.09, 0.25]],
        [[0.25, 0.2], [0.2, 0.17], [0.11, 0.1], [0.075, 0.07], [0.09, 0.08]],
        { ref: [1, 0, 0], sub: 2, capStart: false },
      ),
    },
    PART.HL,
  );

  // Thin tail with a dark tuft
  const tailPiv: V3 = [-1.34, 1.2, 0];
  const tailCol: Paint = [1.0, 0.9, 0.85, 1];
  b.addTube({
    part: PART.TAIL, piv: tailPiv, sides: 6, paint: tailCol,
    rings: pathRings([[-1.34, 1.2, 0], [-1.43, 0.95, 0], [-1.46, 0.65, 0], [-1.45, 0.45, 0]], [[0.04, 0.04], [0.035, 0.035], [0.03, 0.03], [0.03, 0.03]], { sub: 2 }),
  });
  b.addTube({
    part: PART.TAIL, piv: tailPiv, sides: 8, paint: [beardCol[0], beardCol[1], beardCol[2], 0.4],
    rings: blobRings([-1.45, 0.36, 0], 0.07, 0.17, 0.07, 5),
  });

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0x8a5636),
    coatDark: lin(0x3a2114),
    bone: lin(0xd4cbb0),
    roughness: 0.95,
    fill: 1.6,
    warm: [1.12, 1.0, 0.8],
    neutral: 0.85,
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 1.1,
      trot0: 1.9, trot1: 2.7, gal0: 4.8, gal1: 6.2,
      ampW: 0.42, ampT: 0.52, ampG: 0.8,
      kneeW: 0.45, kneeT: 0.7, kneeG: 1.1,
      bobW: 0.02, bobT: 0.04, bobG: 0.08,
      pitchT: 0.02, pitchG: 0.07,
      nodW: 0.05, nodG: 0.12,
      headDown: 0.95, lookYaw: 0.3,
      tailRest: 0, tailRun: -1.25, tailSway: 0.2,
      lieDrop: 0.62, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      crouchDrop: 0.1,
      deadDrop: 0.55, deadHipF: 0.9, deadHipH: -0.6,
      strideW: 1.8, strideG: 5.2, strideSpeedMax: 13,
      length: 3.3, height: 1.85, ring: 2.3, minPx: 10, boostLen: 3.3,
    },
  };
}
