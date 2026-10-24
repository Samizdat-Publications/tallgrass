// Cougar, ~1.3 m body plus a long dark-tipped tail (about 2 m overall), 0.8 m at the shoulder. Tawny, low and sleek.
// R7: `make(false)` is the original mesh (the far LOD); `make(true)` is the near LOD: one continuous loft from the rump to the nose, a
// short sleek pelage as a shell, eyes, finer legs and tail.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings, spineRings, spineAt } from './builder';
import type { PaintFn, SpineRow, TubeOpts, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

const SPINE: SpineRow[] = [
  [-0.64, 0.62, 0, 0, 0],
  [-0.58, 0.63, 0.1, 0.1, 0.09],
  [-0.38, 0.64, 0.17, 0.15, 0.14],
  [-0.08, 0.62, 0.14, 0.13, 0.125],
  [0.18, 0.62, 0.17, 0.18, 0.14],
  [0.38, 0.63, 0.19, 0.19, 0.145],
  [0.5, 0.67, 0.155, 0.16, 0.125],
  [0.6, 0.72, 0.12, 0.115, 0.105],
  [0.72, 0.74, 0.105, 0.1, 0.1],
  [0.8, 0.71, 0.07, 0.065, 0.068],
  [0.87, 0.675, 0.045, 0.042, 0.043],
  [0.915, 0.66, 0.02, 0.02, 0.02],
  [0.935, 0.655, 0, 0, 0],
];
const headW = (x: number): number => smooth(0.3, 0.66, x);

function make(near: boolean): MeshBuilder {
  const b = new MeshBuilder();
  const bodyPaint: PaintFn = (p, n) => {
    const belly = smooth(-0.1, -0.6, n[1]);
    const back = smooth(0.2, 0.9, n[1]);
    const k = 1 - 0.1 * back;
    return [mix(k, 1.5, belly), mix(k, 1.5, belly), mix(k, 1.5, belly), 1];
  };
  const neckPiv: V3 = [0.42, 0.68, 0];
  const headPaint: PaintFn = (p, n) => {
    const muzzle = smooth(0.74, 0.84, p[0]);
    const nose = smooth(0.89, 0.92, p[0]);
    const under = smooth(0.0, -0.6, n[1]);
    const w = Math.max(muzzle * 0.8, under * 0.5);
    if (nose > 0.6) return [0.1, 0.05, 0.05, 0];
    return [mix(1, 1.6, w), mix(1, 1.6, w), mix(1, 1.55, w), 1];
  };

  if (!near) {
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
    b.addTube({
      part: PART.HEAD, piv: neckPiv, sides: 10, paint: headPaint,
      rings: pathRings(
        [[0.36, 0.66, 0], [0.52, 0.72, 0], [0.68, 0.74, 0], [0.8, 0.7, 0], [0.89, 0.665, 0]],
        [[0.15, 0.13], [0.12, 0.105], [0.105, 0.1], [0.06, 0.06], [0.04, 0.04]],
        { sub: 3, capStart: false, capLen: 0.7 },
      ),
    });
  } else {
    const spinePaint: PaintFn = (p, n, t) => {
      const w = smooth(0.4, 0.55, p[0]);
      const a = bodyPaint(p, n, t), c = headPaint(p, n, t);
      return [mix(a[0], c[0], w), mix(a[1], c[1], w), mix(a[2], c[2], w), w > 0.5 ? c[3] : a[3]];
    };
    const partOf = (p: V3): number => (headW(p[0]) > 0.002 ? PART.HEAD : PART.BODY);
    b.addTube({
      part: PART.BODY, piv: neckPiv, sides: 22, paint: spinePaint, group: 1,
      partOf, w1: (p) => 1 - headW(p[0]),
      rings: spineRings(SPINE, 4),
    });
    // a short, sleek pelage (one thin shell): it breaks the outline a little and takes the sheen
    for (const [layer, h] of [[0.5, 0.006], [1.0, 0.015]] as Array<[number, number]>) {
      b.addTube({
        part: PART.BODY, piv: neckPiv, sides: 16, paint: spinePaint, group: 1, shell: layer,
        partOf, w1: (p) => 1 - headW(p[0]),
        rings: spineRings(SPINE.slice(1), 2),
        inflate: (p) => 0.003 + h * smooth(-0.55, -0.3, p[0]) * (1 - smooth(0.78, 0.86, p[0])),
      });
    }
    {
      const [yc, up, , side] = spineAt(SPINE, 0.74);
      b.addPair({
        part: PART.HEAD, piv: neckPiv, sides: 8, paint: [0.55, 0.38, 0.06, 0],
        rings: blobRings([0.74, yc + up * 0.3, side * 0.97], 0.018, 0.013, 0.01, 6),
      });
    }
  }
  b.addPair({
    part: PART.HEAD, piv: neckPiv, piv2: [0.67, 0.8, 0.075], spare: 4, sides: near ? 8 : 6, // (tag 4 + piv2: an ear, pivoting at its base: the r-idle flick)
    paint: (_p, _n, t) => [mix(1, 0.15, smooth(0.0, 0.7, t)), mix(1, 0.12, smooth(0.0, 0.7, t)), mix(1, 0.1, smooth(0.0, 0.7, t)), 1],
    rings: pathRings([[0.67, 0.79, 0.075], [0.66, 0.85, 0.085], [0.655, 0.89, 0.09]], [[0.035, 0.022], [0.03, 0.02], [0.012, 0.008]], { ref: [1, 0, 0], sub: near ? 3 : 2, capStart: false, capLen: 0.5 }),
  });

  const pawCol = lin(0x2a2018);
  const legPaint: PaintFn = (p) => {
    if (p[1] < 0.04) return [pawCol[0], pawCol[1], pawCol[2], 0.4];
    return [1.15, 1.1, 1.0, 1];
  };
  const legSub = near ? 4 : 2;
  const legSides = near ? 12 : 8;
  const frontLeg: TubeOpts = {
    part: PART.FR, piv: [0.38, 0.6, 0.1], piv2: [0.41, 0.24, 0.09], sides: legSides, paint: legPaint,
    w1: (p) => smooth(0.34, 0.2, p[1]),
    rings: pathRings(
      [[0.38, 0.6, 0.1], [0.4, 0.4, 0.1], [0.41, 0.24, 0.09], [0.42, 0.1, 0.085], [0.44, 0.04, 0.085]],
      [[0.1, 0.085], [0.07, 0.065], [0.05, 0.045], [0.044, 0.04], [0.06, 0.05]],
      { ref: [1, 0, 0], sub: legSub, capStart: false, capLen: 0.5 },
    ),
  };
  const hindLeg: TubeOpts = {
    part: PART.HR, piv: [-0.4, 0.62, 0.11], piv2: [-0.47, 0.24, 0.1], sides: legSides, paint: legPaint,
    w1: (p) => smooth(0.34, 0.2, p[1]),
    rings: pathRings(
      [[-0.4, 0.62, 0.11], [-0.28, 0.42, 0.125], [-0.47, 0.24, 0.1], [-0.44, 0.1, 0.085], [-0.41, 0.04, 0.085]],
      [[0.14, 0.1], [0.1, 0.075], [0.05, 0.044], [0.04, 0.038], [0.06, 0.05]],
      { ref: [1, 0, 0], sub: legSub, capStart: false, capLen: 0.5 },
    ),
  };
  b.addPair(frontLeg, PART.FL);
  b.addPair(hindLeg, PART.HL);
  if (near) {
    b.addPair({ ...frontLeg, group: 30, shell: 1, inflate: (p) => 0.002 + 0.008 * smooth(0.12, 0.5, p[1]) }, PART.FL);
    b.addPair({ ...hindLeg, group: 31, shell: 1, inflate: (p) => 0.002 + 0.01 * smooth(0.12, 0.55, p[1]) }, PART.HL);
  }

  // Long heavy tail with a dark tip
  b.addTube({
    part: PART.TAIL, piv: [-0.58, 0.62, 0], sides: near ? 12 : 8,
    paint: (p, n, t) => {
      const tip = smooth(0.75, 0.9, t);
      const k = mix(1, 0.12, tip);
      return [k, k, k, 1];
    },
    rings: pathRings(
      [[-0.56, 0.62, 0], [-0.82, 0.52, 0], [-1.08, 0.36, 0], [-1.3, 0.2, 0], [-1.4, 0.15, 0]],
      [[0.05, 0.05], [0.055, 0.055], [0.052, 0.052], [0.045, 0.045], [0.04, 0.04]],
      { sub: near ? 5 : 3, capLen: 1.2 },
    ),
  });
  return b;
}

export function buildCougar(): ModelDef {
  const far = make(false);
  const nearB = make(true);
  return {
    geometry: far.build({ ground: 0.6 }),
    nearGeometry: nearB.build({ ground: 0.6 }),
    lod: { d0: 22, d1: 32 },
    fur: { sheen: 0.8, sheenPow: 55, sheenTint: [1.1, 0.95, 0.75], rim: 1.5, dorsal: 0.24, belly: 0.16, mottle: 0.12, mottleScale: 10, streak: 0.2, indiv: 0.06,
      shell: { scale: 90, along: 0.6, sparse: 0.15, d0: 12, d1: 22, tone: [0.82, 1.06] } },
    triangles: far.triangleCount,
    coatPale: lin(0xd2a56c),
    coatDark: lin(0x8c6238),
    bone: lin(0xd8d0bc),
    roughness: 0.9,
    fill: 1.5,
    warm: [1.15, 1.0, 0.8],
    neutral: 0.7,
    // R-readable: guild value separation and edge lift at the default distances (see ModelDef.read)
    read: { dark: [0.8, 0.77, 0.78], rim: [0.78, 0.86, 1.0, 0.55] },
    far: { gain: 0.85, rim: 0.06, hunt: 0.4, rimCol: [1.0, 0.86, 0.62], d0: 80, d1: 300, tint: [0.2, 0.12, 0.06], mix: 0.4, floor: 0.1,
      top: [0.3, 0.2, 0.11], topMix: 0.35, side: 0.15, legs: 0.85, calm: 0.5, widen: 0.1 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.62, legL: 0.6,
      // on-screen m/s at 1x
      trot0: 2.6, trot1: 3.6, gal0: 8.5, gal1: 11.5,
      ampW: 0.5, ampT: 0.66, ampG: 1.0,
      dutyW: 0.62, dutyT: 0.5, dutyG: 0.36, dutyGF: 0.25, fast0: 11.5, fast1: 24,
      kneeW: 0.55, kneeT: 0.85, kneeG: 1.3,
      bobW: 0.015, bobT: 0.03, bobG: 0.08,
      pitchT: 0.03, pitchG: 0.15,
      nodW: 0.04, nodG: 0.07,
      spine: { flex: 1.6, twist: 0.22, head: 0.8 },
      headDown: 1.0, lookYaw: 0.4,
      tailRest: 0.0, tailRun: -0.3, tailSway: 0.35,
      lieDrop: 0.4, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      // R6: a deep stalk crouch (belly near the ground), the shoulder blades up, a low tail with a twitching tip, a freeze before the rush
      crouchDrop: 0.36, hunts: true, clasp: 1, stalk: 1,
      curl: 0.7, curlAng: 1.2, curlX: 0.05, curlLen: 1.1,
      deadDrop: 0.36, deadHipF: 0.9, deadHipH: -0.6,
      length: 1.3, height: 0.8, ring: 1.8, minPx: 12.5, boostLen: 1.8,
    },
  };
}
