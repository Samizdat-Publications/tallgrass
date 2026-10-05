// American bison, ~3.3 m nose to rump, 1.85 m at the hump. Built facing +X, +Z is the animal's right.
// R7: two LODs. `make(false)` is the original mesh (the far LOD); `make(true)` is the near LOD: a denser loft with one continuous
// body, neck and head (no part seams), shaggy wool shells over the cape, beard and chaps, horns on bosses, and eyes.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings, spineRings, spineAt } from './builder';
import type { Paint, PaintFn, SpineRow, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

/** Near LOD spine rows: the torso and the head as one continuous loft from the rump to the nose: [x, yCenter, up, down, side]. */
const SPINE: SpineRow[] = [
  [-1.42, 1.02, 0, 0, 0],
  [-1.34, 1.04, 0.17, 0.2, 0.15],
  [-1.15, 1.04, 0.28, 0.28, 0.28],
  [-0.85, 1.03, 0.32, 0.27, 0.33],
  [-0.5, 1.05, 0.36, 0.3, 0.38],
  [-0.15, 1.1, 0.46, 0.36, 0.44],
  [0.15, 1.15, 0.68, 0.44, 0.5],
  [0.45, 1.14, 0.8, 0.48, 0.54],
  [0.75, 1.13, 0.68, 0.5, 0.53],
  [1.05, 1.15, 0.5, 0.5, 0.47],
  [1.3, 1.12, 0.43, 0.46, 0.43],
  [1.55, 1.04, 0.39, 0.4, 0.38],
  [1.78, 0.97, 0.41, 0.33, 0.33],
  [1.97, 0.86, 0.25, 0.23, 0.23],
  [2.1, 0.78, 0.17, 0.16, 0.15],
  [2.18, 0.74, 0.09, 0.085, 0.075],
  [2.23, 0.72, 0, 0, 0],
];
/** How much of the head's rotation a point of the spine takes: 0 on the body behind the shoulders, 1 from the neck forward. */
const headW = (x: number): number => smooth(0.6, 1.4, x);

function make(near: boolean): MeshBuilder {
  const b = new MeshBuilder();
  const hornCol = lin(0x17120d);
  const hoofCol = lin(0x0d0a08);
  const beardCol = lin(0x1c140e);

  // Lighter brown wool over the forequarters, hump and head; near-black chocolate hindquarters (multiplies the coat colour).
  const wool: PaintFn = (p, n) => {
    const front = smooth(-0.25, 0.85, p[0]);
    const high = smooth(0.85, 1.75, p[1]);
    const belly = mix(1, 0.6, smooth(-0.1, -0.8, n[1]));
    const w = Math.min(1, front * (0.45 + 0.55 * high));
    const top = smooth(0.2, 0.9, n[1]) * smooth(0.0, 0.5, p[0]) * 0.2;
    return [(1 + (1.0 + top) * w) * belly, (1 + (0.8 + top) * w) * belly, (1 + 0.4 * w) * belly, 1];
  };
  const headPaint: PaintFn = (p) => {
    // paler brown forehead cap and mane, dark muzzle
    const cap = smooth(1.3, 1.75, p[0]) * (1 - smooth(1.95, 2.15, p[0]));
    const mane = 1 - smooth(1.2, 1.5, p[0]);
    const k = Math.max(cap * 0.8, mane);
    const lowSnout = smooth(1.95, 2.15, p[0]);
    return [mix(1.5, 1.1, lowSnout) * (0.6 + 0.4 * k), mix(1.3, 1.0, lowSnout) * (0.6 + 0.4 * k), mix(1.1, 0.95, lowSnout) * (0.6 + 0.4 * k), 1];
  };
  const neckPiv: V3 = [0.95, 1.32, 0];

  if (!near) {
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
  } else {
    // One loft: the body, the neck and the head. Behind the shoulders it is the body; ahead of them each vertex takes a growing
    // share of the head's rotation (aPart.y = 1 - weight), so the neck bends smoothly and there is no seam to see.
    const spinePaint: PaintFn = (p, n, t) => {
      const w = smooth(1.0, 1.35, p[0]);
      const a = wool(p, n, t), c = headPaint(p, n, t);
      return [mix(a[0], c[0], w), mix(a[1], c[1], w), mix(a[2], c[2], w), 1];
    };
    b.addTube({
      part: PART.BODY, piv: neckPiv, sides: 22, paint: spinePaint, group: 1,
      partOf: (p) => (headW(p[0]) > 0.002 ? PART.HEAD : PART.BODY),
      w1: (p) => 1 - headW(p[0]),
      rings: spineRings(SPINE, 3),
    });
    // Wool shells: two slightly inflated copies of the forequarters, hump, neck and head. The fragment stage cuts each into tufts, so the
    // cape, the shaggy mane and the beard fringe read as hair and the outline is ragged. Layer 0.5 is the inner (denser), 1 the outer.
    for (const [layer, h] of [[0.5, 0.035], [1.0, 0.085]] as Array<[number, number]>) {
      b.addTube({
        part: PART.BODY, piv: neckPiv, sides: 16, paint: spinePaint, group: 1, shell: layer,
        partOf: (p) => (headW(p[0]) > 0.002 ? PART.HEAD : PART.BODY),
        w1: (p) => 1 - headW(p[0]),
        rings: spineRings(SPINE.slice(1), 2),
        inflate: (p, n) => {
          const x = p[0];
          const zone = smooth(-1.3, -0.6, x) * (1 - smooth(1.9, 2.1, x)) * (0.32 + 0.68 * smooth(-0.6, 0.2, x));
          // the cape: long hair piled over the hump and shoulders, the mane under the chin, less on the belly
          const cape = 1 + 0.9 * smooth(0.0, 0.5, x) * (1 - smooth(0.9, 1.4, x)) * smooth(0.0, 0.7, n[1]);
          const chin = 0.8 * smooth(1.45, 1.85, x) * (1 - smooth(1.95, 2.1, x)) * smooth(0.2, -0.7, n[1]);
          const belly = 0.45 + 0.55 * smooth(-0.6, 0.2, n[1]);
          const fore = 0.9 * smooth(1.5, 1.8, x) * (1 - smooth(1.95, 2.05, x)) * smooth(0.1, 0.8, n[1]);
          return 0.004 + h * zone * (cape + chin + fore) * belly;
        },
      });
    }
    // Eyes: small dark bulges set in the side of the head
    {
      const [yc, up, , side] = spineAt(SPINE, 1.84);
      b.addPair({
        part: PART.HEAD, piv: neckPiv, sides: 8, paint: [0.012, 0.01, 0.009, 0],
        rings: blobRings([1.84, yc + up * 0.3, side * 0.99], 0.05, 0.04, 0.032, 6),
      });
    }
  }
  // Beard
  b.addTube({
    part: PART.HEAD,
    piv: neckPiv,
    sides: near ? 12 : 8,
    paint: [beardCol[0], beardCol[1], beardCol[2], 0.3],
    rings: pathRings(
      near ? [[1.74, 0.93, 0], [1.9, 0.74, 0], [1.95, 0.56, 0], [1.9, 0.42, 0]] : [[1.7, 0.95, 0], [1.9, 0.72, 0], [1.93, 0.5, 0], [1.88, 0.3, 0]],
      near ? [[0.12, 0.11], [0.125, 0.105], [0.1, 0.09], [0.03, 0.03]] : [[0.12, 0.1], [0.1, 0.09], [0.07, 0.06], [0.02, 0.02]],
      { sub: near ? 4 : 2 },
    ),
  });
  // Short curved horns (near: a thicker boss at the base and more rings)
  b.addPair({
    part: PART.HEAD,
    piv: neckPiv,
    sides: near ? 12 : 8,
    paint: [hornCol[0], hornCol[1], hornCol[2], 0],
    rings: pathRings(
      [[1.7, 1.2, 0.26], [1.68, 1.22, 0.45], [1.64, 1.36, 0.55], [1.68, 1.53, 0.5], [1.76, 1.62, 0.4]],
      near ? [[0.075, 0.075], [0.058, 0.058], [0.043, 0.043], [0.026, 0.026], [0.008, 0.008]] : [[0.06, 0.06], [0.05, 0.05], [0.04, 0.04], [0.025, 0.025], [0.008, 0.008]],
      { sub: near ? 4 : 2, capStart: false },
    ),
  });

  // Front legs: thick woolly chaps down to the knee, pale lower leg, dark hoof.
  const legPaintF: PaintFn = (p) => {
    if (p[1] < 0.1) return [hoofCol[0], hoofCol[1], hoofCol[2], 0];
    const w = smooth(0.35, 0.9, p[1]);
    return [1 + 0.32 * w, 1 + 0.26 * w, 1 + 0.16 * w, 1];
  };
  const fHip: V3 = [0.52, 1.1, 0.26];
  const fKnee: V3 = [0.56, 0.52, 0.25];
  const fPts: V3[] = [[0.52, 1.1, 0.26], [0.55, 0.85, 0.27], [0.56, 0.52, 0.25], [0.55, 0.3, 0.24], [0.55, 0.17, 0.24], [0.55, 0.09, 0.24]];
  const fRad: Array<[number, number]> = [[0.23, 0.19], [0.21, 0.17], [0.12, 0.105], [0.09, 0.08], [0.085, 0.08], [0.1, 0.09]];
  const legSub = near ? 4 : 2;
  const legSides = near ? 16 : 10;
  b.addPair(
    {
      part: PART.FR, piv: fHip, piv2: fKnee, sides: legSides, paint: legPaintF,
      w1: (p) => smooth(0.64, 0.42, p[1]),
      rings: pathRings(fPts, fRad, { ref: [1, 0, 0], sub: legSub, capStart: false }),
    },
    PART.FL,
  );
  if (near) {
    // chaps: two shells of long hair over the upper foreleg
    for (const [layer, h] of [[0.5, 0.03], [1.0, 0.07]] as Array<[number, number]>) {
      b.addPair(
        {
          part: PART.FR, piv: fHip, piv2: fKnee, sides: 14, paint: legPaintF, group: 20, shell: layer,
          w1: (p) => smooth(0.64, 0.42, p[1]),
          rings: pathRings(fPts.slice(0, 4), fRad.slice(0, 4), { ref: [1, 0, 0], sub: 3, capStart: false, capEnd: false }),
          inflate: (p) => 0.004 + h * smooth(0.28, 0.7, p[1]),
        },
        PART.FL,
      );
    }
  }
  // Hind legs: leaner, with a hock.
  const legPaintH: PaintFn = (p) => {
    if (p[1] < 0.1) return [hoofCol[0], hoofCol[1], hoofCol[2], 0];
    return [1.05, 1.0, 0.95, 1];
  };
  const hHip: V3 = [-0.95, 1.12, 0.26];
  const hHock: V3 = [-1.0, 0.5, 0.27];
  b.addPair(
    {
      part: PART.HR, piv: hHip, piv2: hHock, sides: legSides, paint: legPaintH,
      w1: (p) => smooth(0.64, 0.42, p[1]),
      rings: pathRings(
        [[-0.95, 1.12, 0.26], [-0.8, 0.82, 0.3], [-1.0, 0.5, 0.27], [-0.98, 0.26, 0.25], [-0.97, 0.09, 0.25]],
        [[0.25, 0.2], [0.2, 0.17], [0.11, 0.1], [0.075, 0.07], [0.09, 0.08]],
        { ref: [1, 0, 0], sub: legSub, capStart: false },
      ),
    },
    PART.HL,
  );

  // Thin tail with a dark tuft
  const tailPiv: V3 = [-1.34, 1.2, 0];
  const tailCol: Paint = [1.0, 0.9, 0.85, 1];
  b.addTube({
    part: PART.TAIL, piv: tailPiv, sides: near ? 8 : 6, paint: tailCol,
    rings: pathRings([[-1.34, 1.2, 0], [-1.43, 0.95, 0], [-1.46, 0.65, 0], [-1.45, 0.45, 0]], [[0.04, 0.04], [0.035, 0.035], [0.03, 0.03], [0.03, 0.03]], { sub: near ? 4 : 2 }),
  });
  b.addTube({
    part: PART.TAIL, piv: tailPiv, sides: near ? 12 : 8, paint: [beardCol[0], beardCol[1], beardCol[2], 0.4],
    rings: blobRings([-1.45, 0.36, 0], 0.07, 0.17, 0.07, near ? 8 : 5),
  });
  return b;
}

export function buildBison(): ModelDef {
  const far = make(false);
  const nearB = make(true);
  const geometry = far.build({ ground: 1.0 });
  const nearGeometry = nearB.build({ ground: 1.0 });
  return {
    geometry,
    nearGeometry,
    lod: { d0: 38, d1: 54 },
    fur: { sheen: 0.4, sheenPow: 40, sheenTint: [1.15, 0.9, 0.7], rim: 2.6, dorsal: 0.34, belly: 0.22, mottle: 0.22, mottleScale: 5, streak: 0.32, indiv: 0.1,
      shell: { scale: 34, along: 0.42, sparse: 0.2, d0: 20, d1: 38, tone: [0.6, 1.12] } },
    triangles: far.triangleCount,
    coatPale: lin(0x5e3a24),
    coatDark: lin(0x2b1a10),
    bone: lin(0xd4cbb0),
    roughness: 0.95,
    fill: 1.6,
    warm: [1.24, 0.98, 0.7],
    neutral: 0.85,
    // at range the near-black chocolate coat is lifted to a readable warm brown (never a stain), with an ambient floor so a
    // herd in shade or at dusk stays a value above the shadows
    far: { gain: 1, rim: 0, hunt: 0, rimCol: [1, 0.8, 0.5], d0: 40, d1: 220, tint: [0.14, 0.095, 0.068], mix: 0.6, floor: 0.2,
    // a dark oval with a pale tawny back, so each animal in a herd is its own shape (a dark carpet otherwise)
    top: [0.25, 0.185, 0.14], topMix: 0.6, side: 0.55, calm: 0.3, widen: 0.3 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      behave: true,
      comY: 1.1,
      // gait bands are in on-screen m/s at 1x (sim speed x 1.5): grazing and walking bison (0.3 to 4) walk, a quickened
      // herd trots, a stampede (flee, 7 to 16) gallops
      trot0: 3.0, trot1: 4.2, gal0: 7.0, gal1: 9.5,
      ampW: 0.5, ampT: 0.6, ampG: 0.8,
      dutyW: 0.64, dutyT: 0.5, dutyG: 0.42, dutyGF: 0.34, fast0: 9.5, fast1: 18,
      kneeW: 0.45, kneeT: 0.7, kneeG: 1.1,
      bobW: 0.02, bobT: 0.04, bobG: 0.08,
      pitchT: 0.02, pitchG: 0.07,
      nodW: 0.05, nodG: 0.12,
      headDown: 0.95, lookYaw: 0.3,
      tailRest: 0, tailRun: -1.25, tailSway: 0.2,
      lieDrop: 0.62, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      crouchDrop: 0.1,
      deadDrop: 0.55, deadHipF: 0.9, deadHipH: -0.6,
      length: 3.3, height: 1.85, ring: 2.3, minPx: 12, boostLen: 3.3,
    },
  };
}
