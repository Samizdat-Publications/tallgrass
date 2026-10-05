// Coyote (R3 item 4), built from the wolf's plan: 0.72 x its size, slimmer legs, big ears, a narrow muzzle and the tail held low.
// Tawny grey over the back with a darker saddle, rusty legs and ears, a pale throat and chest, a dark tip on the tail.
// Built facing +X, +Z is the animal's right. The wolf's coordinates are written out in "wolf units" and scaled by K as they are
// emitted, so the proportions can be compared with models/wolf.ts line by line.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

/** Size against the wolf. */
const K = 0.72;
/** Body girth against the wolf's (a coyote is rangier than its size alone says). */
const G = 0.9;

const P = (x: number, y: number, z: number): V3 => [x * K, y * K, z * K];
const R = (a: number, b: number): [number, number] => [a * K, b * K];

export function buildCoyote(): ModelDef {
  const b = new MeshBuilder();
  const nose = lin(0x0a0908);
  const pawCol = lin(0x2a2622);

  // Tawny-grey coat (the coat colour is tawny, the markings multiply it): cream underside and chest, darker saddle on the back.
  const bodyPaint: PaintFn = (p, n) => {
    const x = p[0] / K;
    const belly = smooth(-0.05, -0.55, n[1]);
    const chest = smooth(0.1, 0.5, x) * smooth(0.0, -0.4, n[1]);
    const saddle = smooth(0.2, 0.85, n[1]) * smooth(-0.5, -0.05, x) * (1 - smooth(0.3, 0.55, x));
    // a grizzled grey saddle: it takes more red than blue out of the tawny coat
    const kr = 1 - 0.36 * saddle, kg = 1 - 0.28 * saddle, kb = 1 - 0.16 * saddle;
    const w = Math.max(belly, chest);
    return [mix(kr, 1.3, w), mix(kg, 1.3, w), mix(kb, 1.24, w), 1];
  };

  // Lean torso: [x, yCenter, up, down, side]
  const T = (r: [number, number, number, number, number]): [number, number, number, number, number] => [r[0] * K, r[1] * K, r[2] * K * G, r[3] * K * G, r[4] * K * G];
  b.addTube({
    part: PART.BODY, sides: 12, paint: bodyPaint,
    rings: torsoRings([
      T([-0.64, 0.65, 0, 0, 0]),
      T([-0.58, 0.65, 0.09, 0.08, 0.07]),
      T([-0.4, 0.66, 0.14, 0.12, 0.105]),
      T([-0.14, 0.65, 0.13, 0.11, 0.095]),
      T([0.1, 0.66, 0.18, 0.23, 0.125]),
      T([0.32, 0.68, 0.19, 0.24, 0.135]),
      T([0.48, 0.7, 0.18, 0.2, 0.12]),
      T([0.6, 0.72, 0.15, 0.16, 0.105]),
      T([0.66, 0.7, 0, 0, 0]),
    ]),
  });

  // Neck with a thinner ruff, a smaller skull, a long narrow muzzle (rotating head part). Pale throat and lips.
  const neckPiv = P(0.4, 0.74, 0);
  const headPaint: PaintFn = (p, n) => {
    const x = p[0] / K;
    const ruff = 1 - smooth(0.5, 0.72, x);
    const muzzle = smooth(0.78, 0.9, x);
    const nosePt = smooth(0.94, 0.98, x);
    const under = smooth(0.0, -0.6, n[1]);
    const k = mix(1.0, 1.1, muzzle * 0.5);
    // the throat and the underside of the jaw are pale cream
    const throat = Math.max(under, muzzle * smooth(0.1, -0.5, n[1]) * 0.8);
    const r = mix(k, 1.55, throat), g = mix(k, 1.45, throat), bl = mix(k, 1.25, throat);
    if (nosePt > 0.01) return [mix(r, nose[0], nosePt), mix(g, nose[1], nosePt), mix(bl, nose[2], nosePt), nosePt > 0.7 ? 0 : 1];
    return [r + 0.08 * ruff, g + 0.04 * ruff, bl, 1];
  };
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 10, paint: headPaint,
    rings: pathRings(
      [P(0.34, 0.74, 0), P(0.54, 0.83, 0), P(0.72, 0.85, 0), P(0.87, 0.8, 0), P(0.99, 0.76, 0)],
      [R(0.15, 0.135), R(0.125, 0.1), R(0.095, 0.082), R(0.044, 0.036), R(0.028, 0.022)],
      { sub: 3, capStart: false, capLen: 0.7 },
    ),
  });
  // Big upright ears, rusty on the back with a darker tip
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6,
    paint: (_p, _n, t) => [1.25 - 0.45 * t, 0.78 - 0.34 * t, 0.5 - 0.26 * t, 0.55],
    rings: pathRings([P(0.66, 0.86, 0.065), P(0.645, 0.97, 0.082), P(0.635, 1.09, 0.09)], [R(0.058, 0.022), R(0.05, 0.018), R(0.016, 0.008)], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
  });

  // Slim legs (+z right): rusty above the paws, dark paws.
  const legPaint: PaintFn = (p) => {
    if (p[1] < 0.045 * K) return [pawCol[0], pawCol[1], pawCol[2], 0.3];
    return [1.12, 0.74, 0.52, 1];
  };
  const thin = 0.78;
  b.addPair(
    {
      part: PART.FR, piv: P(0.34, 0.66, 0.1), piv2: P(0.37, 0.27, 0.085), sides: 8, paint: legPaint,
      w1: (p) => smooth(0.36, 0.2, p[1] / K),
      rings: pathRings(
        [P(0.34, 0.66, 0.1), P(0.36, 0.42, 0.095), P(0.37, 0.27, 0.085), P(0.385, 0.12, 0.08), P(0.405, 0.04, 0.08)],
        [R(0.1 * thin, 0.085 * thin), R(0.07 * thin, 0.058 * thin), R(0.046 * thin, 0.04 * thin), R(0.037 * thin, 0.034 * thin), R(0.05 * thin, 0.04 * thin)],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.FL,
  );
  b.addPair(
    {
      part: PART.HR, piv: P(-0.44, 0.66, 0.1), piv2: P(-0.5, 0.27, 0.1), sides: 8, paint: legPaint,
      w1: (p) => smooth(0.36, 0.2, p[1] / K),
      rings: pathRings(
        [P(-0.44, 0.66, 0.1), P(-0.33, 0.46, 0.12), P(-0.5, 0.27, 0.1), P(-0.47, 0.12, 0.085), P(-0.45, 0.04, 0.08)],
        [R(0.13 * thin, 0.095 * thin), R(0.1 * thin, 0.07 * thin), R(0.048 * thin, 0.04 * thin), R(0.036 * thin, 0.034 * thin), R(0.05 * thin, 0.04 * thin)],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.HL,
  );

  // Tail: bushy, carried low, black tip and a dark patch on the top near the root
  b.addTube({
    part: PART.TAIL, piv: P(-0.58, 0.66, 0), sides: 9,
    paint: (p, n, t) => {
      const tip = smooth(0.74, 0.9, t);
      const top = smooth(0.2, 0.8, n[1]) * 0.3 * (1 - smooth(0.4, 0.7, t));
      const k = 1 - top - 0.7 * tip;
      return [k + 0.06, k + 0.03, k, 1];
    },
    rings: pathRings(
      [P(-0.56, 0.66, 0), P(-0.74, 0.58, 0), P(-0.9, 0.42, 0), P(-0.96, 0.24, 0)],
      [R(0.04, 0.04), R(0.07, 0.07), R(0.078, 0.074), R(0.046, 0.04)],
      { sub: 3, capLen: 1.2 },
    ),
  });

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0xd6bd94),
    coatDark: lin(0xa08a6c),
    bone: lin(0xd8d0bc),
    roughness: 0.93,
    fill: 1.2,
    warm: [1.0, 0.98, 0.93],
    neutral: 0.75,
    // from range a coyote is a tan-grey slim form: warmer than the wolf's slate, so the two canids read apart
    far: { gain: 0.85, rim: 0.045, hunt: 0.22, rimCol: [0.95, 0.92, 0.86], d0: 70, d1: 280, tint: [0.27, 0.205, 0.125], mix: 0.65, floor: 0.12, lowFill: 0.5,
      top: [0.46, 0.38, 0.27], topMix: 0.5, side: 0.2, legs: 0.9, calm: 0.6, widen: 0.1 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.66 * K, legL: 0.637 * K,
      // on-screen m/s at 1x: a coyote trots a lot (it is the lope of a dog going somewhere), gallops in a chase
      trot0: 2.1, trot1: 3.0, gal0: 7.0, gal1: 10.0,
      ampW: 0.5, ampT: 0.66, ampG: 1.0,
      dutyW: 0.62, dutyT: 0.5, dutyG: 0.36, dutyGF: 0.25, fast0: 10, fast1: 22,
      kneeW: 0.5, kneeT: 0.8, kneeG: 1.25,
      bobW: 0.01, bobT: 0.02, bobG: 0.055,
      pitchT: 0.025, pitchG: 0.12,
      nodW: 0.05, nodG: 0.09,
      headDown: 1.05, lookYaw: 0.8,
      // the tail hangs low at rest and stays low in a run (a wolf lifts it)
      tailRest: 0.22, tailRun: 0.02, tailSway: 0.14,
      lieDrop: 0.4 * K, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      crouchDrop: 0.18 * K, hunts: true,
      curl: 1, curlAng: 1.6, curlX: 0.14 * K, curlLen: 0.95 * K,
      deadDrop: 0.36 * K, deadHipF: 0.9, deadHipH: -0.6,
      length: 1.5 * K, height: 0.85 * K, ring: 0.85, minPx: 10.5, boostLen: 1.5 * K,
    },
  };
}
