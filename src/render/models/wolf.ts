// Grey wolf, ~1.5 m nose to rump, 0.85 m at the shoulder, bushy tail. Built facing +X, +Z is the animal's right.
// R7: `make(false)` is the original mesh (the far LOD); `make(true)` is the near LOD: a denser loft with one continuous body, neck and
// head (no part seams), a shaggy ruff and a short pelage as shells, eyes, and finer legs and tail.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings, spineRings, spineAt } from './builder';
import type { PaintFn, SpineRow, TubeOpts, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

/** Near LOD spine rows (wolf units): the torso, neck and head as one loft: [x, yCenter, up, down, side]. Shared with the coyote. */
export const WOLF_SPINE: SpineRow[] = [
  [-0.64, 0.65, 0, 0, 0],
  [-0.58, 0.65, 0.09, 0.08, 0.075],
  [-0.4, 0.66, 0.15, 0.13, 0.12],
  [-0.14, 0.65, 0.14, 0.12, 0.105],
  [0.1, 0.66, 0.2, 0.25, 0.145],
  [0.32, 0.68, 0.21, 0.26, 0.155],
  [0.46, 0.72, 0.2, 0.23, 0.145],
  [0.58, 0.8, 0.155, 0.17, 0.125],
  [0.7, 0.85, 0.115, 0.105, 0.105],
  [0.78, 0.84, 0.1, 0.085, 0.095],
  [0.84, 0.8, 0.058, 0.05, 0.055],
  [0.9, 0.77, 0.04, 0.034, 0.038],
  [0.95, 0.755, 0.02, 0.018, 0.02],
  [0.975, 0.75, 0, 0, 0],
];
/** How much of the head's rotation a point of the spine takes (wolf units). */
export const wolfHeadW = (x: number): number => smooth(0.28, 0.66, x);

function make(near: boolean): MeshBuilder {
  const b = new MeshBuilder();
  const nose = lin(0x0a0908);
  const pawCol = lin(0x2a2622);

  // Pale grey coat, cream underside and legs, darker saddle across the back (multiplies the coat colour).
  const bodyPaint: PaintFn = (p, n) => {
    const belly = smooth(-0.05, -0.55, n[1]);
    const saddle = smooth(0.2, 0.85, n[1]) * smooth(-0.5, -0.05, p[0]) * (1 - smooth(0.3, 0.55, p[0]));
    const k = 1 - 0.55 * saddle;
    return [mix(k, 1.22, belly), mix(k, 1.2, belly), mix(k, 1.16, belly), 1];
  };
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

  if (!near) {
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
    b.addTube({
      part: PART.HEAD, piv: neckPiv, sides: 10, paint: headPaint,
      rings: pathRings(
        [[0.34, 0.74, 0], [0.54, 0.84, 0], [0.72, 0.85, 0], [0.83, 0.8, 0], [0.91, 0.76, 0]],
        [[0.17, 0.15], [0.14, 0.115], [0.108, 0.1], [0.056, 0.05], [0.036, 0.032]],
        { sub: 3, capStart: false, capLen: 0.7 },
      ),
    });
  } else {
    const spinePaint: PaintFn = (p, n, t) => {
      const w = smooth(0.36, 0.52, p[0]);
      const a = bodyPaint(p, n, t), c = headPaint(p, n, t);
      return [mix(a[0], c[0], w), mix(a[1], c[1], w), mix(a[2], c[2], w), w > 0.5 ? c[3] : a[3]];
    };
    const partOf = (p: V3): number => (wolfHeadW(p[0]) > 0.002 ? PART.HEAD : PART.BODY);
    b.addTube({
      part: PART.BODY, piv: neckPiv, sides: 18, paint: spinePaint, group: 1,
      partOf, w1: (p) => 1 - wolfHeadW(p[0]),
      rings: spineRings(WOLF_SPINE, 3),
    });
    // The pelage as two thin shells over the whole body, with a long ruff at the throat, the cheeks and the shoulders
    for (const [layer, h] of [[0.5, 0.012], [1.0, 0.026]] as Array<[number, number]>) {
      b.addTube({
        part: PART.BODY, piv: neckPiv, sides: 14, paint: spinePaint, group: 1, shell: layer,
        partOf, w1: (p) => 1 - wolfHeadW(p[0]),
        rings: spineRings(WOLF_SPINE.slice(1), 2),
        inflate: (p, n) => {
          const x = p[0];
          const zone = smooth(-0.55, -0.3, x) * (1 - smooth(0.8, 0.88, x));
          const ruff = 2.4 * smooth(0.12, 0.42, x) * (1 - smooth(0.66, 0.8, x)) * (0.5 + 0.5 * smooth(0.6, -0.5, n[1]));
          return 0.003 + h * zone * (1 + ruff);
        },
      });
    }
    {
      const [yc, up, , side] = spineAt(WOLF_SPINE, 0.78);
      b.addPair({
        part: PART.HEAD, piv: neckPiv, sides: 8, paint: [0.45, 0.24, 0.04, 0],
        rings: blobRings([0.78, yc + up * 0.28, side * 0.97], 0.017, 0.012, 0.009, 6),
      });
    }
  }
  // Pointed ears
  b.addPair({
    part: PART.HEAD, piv: neckPiv, piv2: [0.69, 0.88, 0.06], spare: 4, sides: near ? 8 : 6, // (tag 4 + piv2: an ear, pivoting at its base: the r-idle flick)
    paint: (_p, _n, t) => [0.7 - 0.25 * t, 0.68 - 0.25 * t, 0.65 - 0.25 * t, 1],
    rings: pathRings([[0.69, 0.87, 0.06], [0.675, 0.95, 0.07], [0.67, 1.03, 0.075]], [[0.04, 0.016], [0.034, 0.013], [0.012, 0.006]], { ref: [1, 0, 0], sub: near ? 3 : 2, capStart: false, capLen: 0.5 }),
  });

  // Long legs (+z right); gloves of lighter fur, dark paws.
  const legPaint: PaintFn = (p) => {
    if (p[1] < 0.045) return [pawCol[0], pawCol[1], pawCol[2], 0.3];
    return [1.1, 1.1, 1.1, 1];
  };
  const legSub = near ? 4 : 2;
  const legSides = near ? 12 : 8;
  const frontLeg: TubeOpts = {
    part: PART.FR, piv: [0.34, 0.66, 0.1], piv2: [0.37, 0.27, 0.085], sides: legSides, paint: legPaint,
    w1: (p) => smooth(0.36, 0.2, p[1]),
    rings: pathRings(
      [[0.34, 0.66, 0.1], [0.36, 0.42, 0.095], [0.37, 0.27, 0.085], [0.385, 0.12, 0.08], [0.405, 0.04, 0.08]],
      [[0.1, 0.085], [0.07, 0.058], [0.046, 0.04], [0.037, 0.034], [0.05, 0.04]],
      { ref: [1, 0, 0], sub: legSub, capStart: false, capLen: 0.5 },
    ),
  };
  const hindLeg: TubeOpts = {
    part: PART.HR, piv: [-0.44, 0.66, 0.1], piv2: [-0.5, 0.27, 0.1], sides: legSides, paint: legPaint,
    w1: (p) => smooth(0.36, 0.2, p[1]),
    rings: pathRings(
      [[-0.44, 0.66, 0.1], [-0.33, 0.46, 0.12], [-0.5, 0.27, 0.1], [-0.47, 0.12, 0.085], [-0.45, 0.04, 0.08]],
      [[0.13, 0.095], [0.1, 0.07], [0.048, 0.04], [0.036, 0.034], [0.05, 0.04]],
      { ref: [1, 0, 0], sub: legSub, capStart: false, capLen: 0.5 },
    ),
  };
  b.addPair(frontLeg, PART.FL);
  b.addPair(hindLeg, PART.HL);
  if (near) {
    // a thin coat on the legs too (heavier at the elbows and the thighs), so they match the body's
    b.addPair({ ...frontLeg, group: 30, shell: 1, inflate: (p) => 0.003 + 0.011 * smooth(0.12, 0.5, p[1]) }, PART.FL);
    b.addPair({ ...hindLeg, group: 31, shell: 1, inflate: (p) => 0.003 + 0.013 * smooth(0.12, 0.55, p[1]) }, PART.HL);
  }

  // Bushy tail with a dark tip
  const tail: TubeOpts = {
    part: PART.TAIL, piv: [-0.58, 0.66, 0], sides: near ? 14 : 9,
    paint: (p, n, t) => {
      const tip = smooth(0.72, 0.9, t);
      const top = smooth(0.2, 0.8, n[1]) * 0.35;
      const k = 1 - top - 0.65 * tip;
      return [k + 0.05, k + 0.03, k, 1];
    },
    rings: pathRings(
      [[-0.56, 0.66, 0], [-0.76, 0.6, 0], [-0.97, 0.47, 0], [-1.08, 0.33, 0]],
      [[0.04, 0.04], [0.075, 0.075], [0.085, 0.082], [0.05, 0.045]],
      { sub: near ? 5 : 3, capLen: 1.2 },
    ),
  };
  b.addTube(tail);
  if (near) {
    for (const [layer, h] of [[0.5, 0.012], [1.0, 0.03]] as Array<[number, number]>) {
      b.addTube({ ...tail, group: 32, shell: layer, inflate: (_p, _n, t) => 0.003 + h * smooth(0.0, 0.25, t) * (1 - 0.6 * smooth(0.8, 1.0, t)) });
    }
  }
  return b;
}

export function buildWolf(): ModelDef {
  const far = make(false);
  const nearB = make(true);
  return {
    geometry: far.build({ ground: 0.64 }),
    nearGeometry: nearB.build({ ground: 0.64 }),
    lod: { d0: 20, d1: 30 },
    fur: { sheen: 0.4, sheenPow: 46, sheenTint: [1.0, 0.98, 0.94], rim: 1.7, dorsal: 0.14, belly: 0.1, mottle: 0.12, mottleScale: 9, streak: 0.16, indiv: 0.06,
      shell: { scale: 70, along: 0.5, sparse: 0.2, d0: 11, d1: 22 } },
    triangles: far.triangleCount,
    coatPale: lin(0x9d9a94),
    coatDark: lin(0x45423d),
    bone: lin(0xd8d0bc),
    roughness: 0.92,
    fill: 1.2,
    warm: [1.0, 0.99, 0.96],
    neutral: 0.75,
    // from the wide view a wolf is a little darker (value contrast with gold grass) and one that stalks, chases or feeds
    // gets a cool rim of light
    // from 70 m out a wolf deepens to a cool slate (a hue the gold grass and brown herds do not have) and gets a cool rim
    // R-readable: guild value separation and edge lift at the default distances (see ModelDef.read)
    read: { dark: [0.74, 0.78, 0.88], rim: [0.72, 0.84, 1.0, 0.7] },
    // r-read: from 50 m out (full by 220 m) a wolf is a clearly lighter, cooler grey than the dark brown bison beside it, with a silvery back
    far: { gain: 0.8, rim: 0.05, hunt: 0.25, rimCol: [0.92, 0.93, 0.95], d0: 40, d1: 135, tint: [0.085, 0.09, 0.105], mix: 0.85, floor: 0.05, edge: 0.4, rimCut: 0.75, nightLift: 0.9,
      // a slim cool-grey form with a paler back; the legs swing less so the outline is not a crumpled scrap
      top: [0.2, 0.21, 0.235], topMix: 0.65, side: 0.3, legs: 0.85, calm: 0.6, widen: 0.1 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.66, legL: 0.637,
      // on-screen m/s at 1x: a wolf "walking" (1.9 to 7) travels at a walk then a trot, a chase (12 to 20) is a full gallop
      trot0: 2.4, trot1: 3.4, gal0: 8.0, gal1: 11.0,
      ampW: 0.5, ampT: 0.68, ampG: 1.0,
      dutyW: 0.62, dutyT: 0.5, dutyG: 0.36, dutyGF: 0.25, fast0: 11, fast1: 24,
      kneeW: 0.5, kneeT: 0.8, kneeG: 1.25,
      bobW: 0.012, bobT: 0.025, bobG: 0.07,
      pitchT: 0.025, pitchG: 0.12,
      nodW: 0.05, nodG: 0.09,
      spine: { flex: 1.5, twist: 0.2, head: 0.8 },
      headDown: 1.05, lookYaw: 0.5,
      tailRest: 0, tailRun: -0.3, tailSway: 0.22,
      lieDrop: 0.4, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      crouchDrop: 0.18, hunts: true,
      curl: 1, curlAng: 1.6, curlX: 0.14, curlLen: 0.95,
      deadDrop: 0.36, deadHipF: 0.9, deadHipH: -0.6,
      length: 1.5, height: 0.85, ring: 1.75, minPx: 13, boostLen: 1.5, // (r-wolf: the marker's arcs lie at 0.57 of this, about 1 m out: clear of a 1.5 m body and its tail, so the ring reads all the way round)
    },
  };
}
