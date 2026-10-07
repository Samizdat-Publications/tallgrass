// North American beaver, ~0.65 m of body and a 0.3 m tail. Stocky barrel of a body, short legs, a blunt head with small round ears and
// the orange incisors just showing, big webbed hind feet and the broad flat paddle tail. Built like the other models
// (models/builder.ts), facing +X, +Z is the animal's right, in real metres (the animal layer draws it 1.25 x, speciesScale).
//
// Swimming (AnimParams.swim, see models/shader.ts): the animal layer rides the model with its origin `SWIM_SINK` below the water
// surface, so only the crown of the back, the head and the ears show; the shader tucks the legs, lifts the nose, lays the tail flat
// and draws a small V wake. The wake is geometry too: two thin tapering ribbons tagged 7 in aPart.w, lying on the surface plane
// (y = SWIM_SINK) behind the nose. They are the last thing in the index buffer so the ambient-occlusion pre-pass (`aoCount`) never
// draws them, and the shader collapses them to a point whenever the beaver is on land.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

/** Model metres the origin sits below the water surface while swimming (the back's crown shows about 0.1 m above the water). */
export const BEAVER_SINK = 0.22;
/** x of the snout tip and the length of the wake behind it. */
const NOSE_X = 0.455;
const WAKE_LEN = 0.95;

export function buildBeaver(): ModelDef {
  const b = new MeshBuilder();

  // coat influence 1: the colour multiplies the coat (a warm chestnut); the belly and throat lift a little, the back is darker
  const bodyPaint: PaintFn = (p, n) => {
    const belly = smooth(-0.1, -0.75, n[1]);
    const back = smooth(0.3, 0.95, n[1]);
    const k = 1 - 0.16 * back;
    return [mix(k, 1.22, belly), mix(k, 1.14, belly), mix(k, 1.0, belly), 1];
  };
  // barrel of a body: the heaviest part is over the hips, the chest a little narrower
  b.addTube({
    part: PART.BODY, sides: 12, paint: bodyPaint,
    rings: torsoRings([
      [-0.34, 0.15, 0, 0, 0],
      [-0.32, 0.15, 0.05, 0.05, 0.055],
      [-0.24, 0.165, 0.12, 0.1, 0.12],
      [-0.1, 0.175, 0.15, 0.115, 0.145],
      [0.06, 0.175, 0.145, 0.115, 0.14],
      [0.18, 0.17, 0.125, 0.105, 0.115],
      [0.27, 0.17, 0.09, 0.085, 0.08],
      [0.31, 0.17, 0, 0, 0],
    ]),
  });

  // the paddle: a thin flat slab, narrow at the root, broad and rounded at the far end, dark and scaly (a faint diamond pattern)
  b.addTube({
    part: PART.TAIL, piv: [-0.31, 0.15, 0], sides: 8,
    paint: (p) => {
      const sc = 0.85 + 0.15 * Math.sin(p[0] * 170) * Math.sin(p[2] * 170);
      return [0.085 * sc, 0.062 * sc, 0.05 * sc, 0.15];
    },
    rings: pathRings(
      [[-0.3, 0.15, 0], [-0.36, 0.126, 0], [-0.47, 0.1, 0], [-0.6, 0.085, 0], [-0.64, 0.082, 0], [-0.665, 0.08, 0]],
      [[0.03, 0.036], [0.016, 0.062], [0.013, 0.083], [0.012, 0.07], [0.011, 0.045], [0.01, 0.02]],
      { sub: 3, capLen: 0.8 },
    ),
  });

  // head: broad skull, blunt square-ish muzzle, the jaw pale
  const neckPiv: V3 = [0.24, 0.17, 0];
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 10,
    paint: (p, n) => {
      const under = smooth(-0.1, -0.7, n[1]);
      const muzzle = smooth(0.34, 0.42, p[0]);
      const nose = smooth(0.445, 0.455, p[0]);
      const r = mix(1.0, 1.2, under * muzzle * 0.6), g = mix(1.0, 1.1, under * muzzle * 0.6), bl = mix(1.0, 0.95, under * muzzle * 0.6);
      return [mix(r, 0.07, nose), mix(g, 0.055, nose), mix(bl, 0.05, nose), nose > 0.5 ? 0 : 1];
    },
    rings: pathRings(
      [[0.2, 0.17, 0], [0.29, 0.185, 0], [0.36, 0.18, 0], [0.42, 0.158, 0]],
      [[0.095, 0.095], [0.098, 0.092], [0.08, 0.072], [0.052, 0.052]],
      { sub: 3, capStart: false, capLen: 0.7, sq: 2.4 },
    ),
  });
  // incisors (a faint orange line under the nose), small round ears set well back, dark eyes high on the head
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.62, 0.3, 0.07, 0],
    rings: blobRings([0.443, 0.14, 0.013], 0.012, 0.014, 0.006, 4),
  });
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: (_p, _n, t) => [0.5 - 0.15 * t, 0.4 - 0.12 * t, 0.34 - 0.1 * t, 0.5],
    rings: blobRings([0.252, 0.268, 0.066], 0.018, 0.024, 0.012, 5),
  });
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.035, 0.03, 0.03, 0],
    rings: blobRings([0.352, 0.222, 0.066], 0.011, 0.011, 0.008, 4),
  });

  // legs: stubby forelegs with small hands, thick hind legs ending in long flat webbed feet
  const legPaint: PaintFn = (p) => (p[1] < 0.03 ? [0.5, 0.43, 0.4, 0.5] : [0.85, 0.74, 0.62, 1]);
  b.addPair(
    {
      part: PART.FR, piv: [0.2, 0.115, 0.085], piv2: [0.215, 0.058, 0.085], sides: 7, paint: legPaint,
      w1: (p) => smooth(0.07, 0.04, p[1]),
      rings: pathRings([[0.2, 0.115, 0.085], [0.215, 0.058, 0.087], [0.232, 0.014, 0.09]], [[0.042, 0.036], [0.03, 0.026], [0.026, 0.03]], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
    },
    PART.FL,
  );
  b.addPair(
    {
      part: PART.HR, piv: [-0.2, 0.125, 0.105], piv2: [-0.23, 0.064, 0.108], sides: 7, paint: legPaint,
      w1: (p) => smooth(0.075, 0.04, p[1]),
      rings: pathRings([[-0.2, 0.125, 0.105], [-0.23, 0.064, 0.11], [-0.2, 0.016, 0.112], [-0.14, 0.011, 0.112]], [[0.07, 0.056], [0.042, 0.04], [0.022, 0.042], [0.011, 0.05]], { ref: [0, 0, 1], sub: 2, capStart: false, capLen: 0.5 }),
    },
    PART.HL,
  );

  // everything above is animated for land and for swimming; this is the wake: two thin ribbons fanning back from the nose along the
  // surface plane, Kelvin angle (about 19 degrees), tagged 7 for the shader and kept last in the index buffer (aoCount below)
  const aoIndices = b.triangleCount * 3;
  const wy = BEAVER_SINK;
  b.addPair({
    part: PART.BODY, piv: [0, 0, 0], sides: 6, spare: 7, paint: [0.9, 0.97, 0.97, 0],
    rings: pathRings(
      [[NOSE_X - 0.02, wy, 0.03], [NOSE_X - 0.35, wy, 0.15], [NOSE_X - 0.7, wy, 0.27], [NOSE_X - WAKE_LEN, wy, 0.37]],
      [[0.003, 0.04], [0.003, 0.058], [0.003, 0.05], [0.003, 0.024]],
      { sub: 2, capStart: false, capEnd: false },
    ),
  });

  const geometry = b.build();
  return {
    geometry,
    aoCount: aoIndices,
    triangles: b.triangleCount,
    coatPale: lin(0x956438),
    coatDark: lin(0x56391f),
    bone: lin(0xd8d0bc),
    roughness: 0.95,
    fill: 1.45,
    warm: [1.1, 1.0, 0.84],
    neutral: 0.7,
    // a dark brown shape against the grass and the water: from range it keeps a warm brown rather than going black
    far: { gain: 1.0, rim: 0.1, hunt: 0, rimCol: [1.0, 0.82, 0.55], d0: 50, d1: 220, floor: 0.3, tint: lin(0x6a4a2d), mix: 0.4, lowFill: 0.3, calm: 0.4, widen: 0.1 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.13, legL: 0.115,
      // on-screen m/s at 1x: a waddling walk, a bustling trot, and a heavy lumbering gallop when frightened
      trot0: 1.0, trot1: 1.7, gal0: 3.0, gal1: 4.2,
      ampW: 0.62, ampT: 0.7, ampG: 0.9,
      dutyW: 0.66, dutyT: 0.55, dutyG: 0.42,
      kneeW: 0.6, kneeT: 0.8, kneeG: 1.1,
      bobW: 0.006, bobT: 0.012, bobG: 0.03,
      pitchT: 0.04, pitchG: 0.12,
      nodW: 0.04, nodG: 0.06,
      headDown: 0.9, lookYaw: 0.6,
      // the paddle drags low behind it on land
      tailRest: 0.26, tailRun: 0.2, tailSway: 0.05,
      lieDrop: 0.03, lieHipF: 1.2, lieKneeF: -2.0, lieHipH: -0.9, lieKneeH: 1.8,
      crouchDrop: 0.03,
      deadDrop: 0.1, deadHipF: 0.9, deadHipH: -0.6,
      swim: { sink: BEAVER_SINK, nose: NOSE_X, wake: WAKE_LEN },
      length: 0.9, height: 0.34, ring: 0.6, minPx: 4, boostLen: 0.9,
    },
  };
}
