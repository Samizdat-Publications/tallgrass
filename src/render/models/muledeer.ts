// Mule deer (Odocoileus hemionus, registry id 10), ~1.5 m long, 1.07 m to the shoulders. Built from the pronghorn's pattern (same rig, same
// near/far LOD scheme), but a heavier, shorter-legged deer: a grey-brown coat (reddish tan in summer, greyer in winter: the per-instance winter
// weight), a dark forehead and a white throat patch, big mule ears, a white rump patch round a thin white tail with a black tip, and on the
// bucks branched antlers: dichotomous forks, the mule-deer way (aPart.w tags the branch level so the shader can grow them by season).
// R7 convention: `make(false)` is the far LOD, `make(true)` the near LOD (one continuous loft from the rump to the nose, big dark eyes, a short coat
// shell, finer legs and antlers with more rings).
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings, spineRings, spineAt } from './builder';
import type { Paint, PaintFn, SpineRow, TubeOpts, V3 } from './builder';
import { keyCurve } from '../season';
import type { Keys } from '../season';
import { DEFAULT_PARAMS, type ModelDef } from './types';

const SPINE: SpineRow[] = [
  [-0.56, 0.8, 0, 0, 0],
  [-0.5, 0.81, 0.11, 0.1, 0.095],
  [-0.34, 0.82, 0.17, 0.145, 0.13],
  [-0.08, 0.8, 0.165, 0.16, 0.125],
  [0.18, 0.8, 0.185, 0.21, 0.14],
  [0.38, 0.83, 0.195, 0.23, 0.145],
  [0.5, 0.9, 0.16, 0.17, 0.12],
  [0.58, 0.985, 0.13, 0.13, 0.105],
  [0.66, 1.06, 0.115, 0.115, 0.095],
  [0.74, 1.105, 0.103, 0.103, 0.088],
  [0.82, 1.105, 0.095, 0.092, 0.082],
  [0.9, 1.08, 0.08, 0.075, 0.072],
  [0.98, 1.035, 0.058, 0.055, 0.052],
  [1.04, 1.0, 0.045, 0.043, 0.043],
  [1.09, 0.978, 0.038, 0.037, 0.039],
  [1.115, 0.97, 0.02, 0.02, 0.022],
  [1.125, 0.968, 0, 0, 0],
];
const headW = (x: number): number => smooth(0.3, 0.7, x);

/** Where the antlers meet the skull (right side; the left is the mirror image), model space. The shader grows every antler vertex about it. */
export const ANTLER_BASE: V3 = [0.845, 1.15, 0.05];

// ---- the seasons of a deer (shared season curves, render/season.ts: 0 early spring, 1 early summer, 2 early autumn, 3 early winter) -------
/** Antler growth 0..1: bare after the shed (late winter), short buds in early spring, growing through the summer, full by late summer, hard through the autumn. */
export const ANTLER_KEYS: Keys = [[0, 0], [0.25, 0.08], [1.0, 0.55], [1.8, 1.0], [3.5, 1.0], [3.85, 0], [4.0, 0]];
/** Velvet on the antlers 0..1: on through the growth, rubbed off at the start of autumn, back with the buds. */
export const VELVET_KEYS: Keys = [[0, 1], [1.9, 1], [2.2, 0], [3.8, 0], [4.0, 1]];
/** Winter coat 0..1: grown in autumn, grey through the winter, shed in spring and summer. */
export const COAT_KEYS: Keys = [[0, 0.45], [0.5, 0.2], [1.0, 0], [2.0, 0], [2.4, 0.5], [2.9, 1], [3.6, 1], [4.0, 0.45]];

export interface DeerSeason { antler: number; velvet: number; winter: number }
/** The season-only part of a deer's look (the antlers of a particular buck scale this by its age, see antlerOf). */
export function deerSeason(season: number): DeerSeason {
  return { antler: keyCurve(ANTLER_KEYS, season), velvet: keyCurve(VELVET_KEYS, season), winter: keyCurve(COAT_KEYS, season) };
}
/**
 * The antler growth weight of one animal: 0 for a doe or a fawn, otherwise the season's growth (DeerSeason.antler) scaled by the buck's maturity
 * (age as a fraction of the life span, `matureAt` the age fraction of an adult) and a small per-animal jitter, so a young buck carries a spike
 * or a simple fork where an old one carries the full branched rack.
 */
export function antlerOf(growth: number, male: boolean, juvenile: boolean, ageFrac: number, seed01: number, matureAt = 0.094): number {
  if (!male || juvenile) return 0;
  const m = Math.min(1, Math.max(0, (ageFrac - matureAt) / 0.25));
  return Math.min(1, growth * (0.68 + 0.3 * m + 0.1 * (seed01 - 0.5)));
}

function make(near: boolean): { b: MeshBuilder; bodyTris: number } {
  const b = new MeshBuilder();
  const white = 0.62;
  const dark = lin(0x14100d);

  /** Blend from the coat (multiplier) to white (absolute) by w. */
  const toWhite = (k: number, w: number): Paint => [mix(k, white, w), mix(k, white * 0.97, w), mix(k, white * 0.9, w), 1 - w];

  const bodyPaint: PaintFn = (p, n) => {
    // pale belly and inner thighs, a cream rump patch round the tail root, a darker grey-brown back and a paler chest and neck
    const belly = smooth(-0.05, -0.5, n[1]);
    const patch = smooth(0.0, 0.55, -n[0]) * smooth(-0.3, -0.42, p[0]) * smooth(0.55, 1.0, p[1]);
    const back = smooth(0.3, 0.95, n[1]);
    const k = 1 - 0.2 * back;
    return toWhite(k, Math.min(1, Math.max(belly * 0.8, patch * 0.95)));
  };
  const neckPiv: V3 = [0.42, 0.9, 0];
  const headPaint: PaintFn = (p, n) => {
    // a dark forehead, the pale muzzle and cheek, a white throat patch under the jaw, a black nose
    const brow = smooth(0.82, 0.88, p[0]) * (1 - smooth(0.95, 1.0, p[0])) * smooth(0.0, 0.6, n[1]);
    const throat = smooth(0.1, -0.5, n[1]) * smooth(0.64, 0.76, p[0]) * (1 - smooth(0.98, 1.04, p[0]));
    const muzzle = smooth(1.0, 1.07, p[0]);
    const cheek = smooth(0.92, 0.98, p[0]) * (1 - smooth(1.02, 1.08, p[0])) * smooth(0.2, -0.3, n[1]);
    if (smooth(1.095, 1.108, p[0]) > 0.5) return [0.025, 0.022, 0.02, 0];
    const k = 1 - 0.34 * brow - 0.06 * smooth(0.2, 0.8, n[1]);
    return toWhite(k, Math.max(throat * 0.9, muzzle * 0.6, cheek * 0.5));
  };

  if (!near) {
    b.addTube({
      part: PART.BODY, sides: 12, paint: bodyPaint,
      rings: torsoRings([
        [-0.56, 0.8, 0, 0, 0],
        [-0.5, 0.81, 0.11, 0.1, 0.095],
        [-0.34, 0.82, 0.17, 0.145, 0.13],
        [-0.08, 0.8, 0.165, 0.16, 0.125],
        [0.18, 0.8, 0.185, 0.21, 0.14],
        [0.38, 0.83, 0.195, 0.23, 0.145],
        [0.52, 0.86, 0.15, 0.16, 0.11],
        [0.6, 0.87, 0, 0, 0],
      ]),
    });
    // The neck and head: a thick neck, a long head sloping down to a black nose
    b.addTube({
      part: PART.HEAD, piv: neckPiv, sides: 10, paint: headPaint,
      rings: pathRings(
        [[0.36, 0.85, 0], [0.52, 0.96, 0], [0.68, 1.07, 0], [0.84, 1.105, 0], [0.98, 1.035, 0], [1.12, 0.969, 0]],
        [[0.16, 0.13], [0.125, 0.105], [0.108, 0.092], [0.095, 0.082], [0.058, 0.052], [0.03, 0.036]],
        { sub: 3, capStart: false, capLen: 0.5 },
      ),
    });
  } else {
    const spinePaint: PaintFn = (p, n, t) => {
      const w = smooth(0.38, 0.48, p[0]);
      const a = bodyPaint(p, n, t), c = headPaint(p, n, t);
      return [mix(a[0], c[0], w), mix(a[1], c[1], w), mix(a[2], c[2], w), w > 0.5 ? c[3] : a[3]];
    };
    b.addTube({
      part: PART.BODY, piv: neckPiv, sides: 22, paint: spinePaint, group: 1,
      partOf: (p) => (headW(p[0]) > 0.002 ? PART.HEAD : PART.BODY),
      w1: (p) => 1 - headW(p[0]),
      rings: spineRings(SPINE, 4),
    });
    // a short coat: one thin shell over the body, neck and head
    b.addTube({
      part: PART.BODY, piv: neckPiv, sides: 16, paint: spinePaint, group: 1, shell: 1,
      partOf: (p) => (headW(p[0]) > 0.002 ? PART.HEAD : PART.BODY),
      w1: (p) => 1 - headW(p[0]),
      rings: spineRings(SPINE.slice(1), 2),
      inflate: (p) => 0.002 + 0.008 * smooth(-0.55, -0.3, p[0]) * (1 - smooth(1.0, 1.1, p[0])),
    });
    {
      const [yc, up, , side] = spineAt(SPINE, 0.9);
      b.addPair({
        part: PART.HEAD, piv: neckPiv, sides: 8, paint: [dark[0], dark[1], dark[2], 0],
        rings: blobRings([0.9, yc + up * 0.2, side * 0.99], 0.026, 0.021, 0.015, 6),
      });
    }
  }

  // The tail: thin and rope-like, white with a black tip
  b.addTube({
    part: PART.TAIL, piv: [-0.56, 0.8, 0], sides: near ? 8 : 6,
    paint: (_p, _n, t) => (t > 0.72 ? [0.035, 0.03, 0.026, 0] : [0.86, 0.82, 0.74, 0]),
    rings: pathRings(
      [[-0.56, 0.8, 0], [-0.61, 0.74, 0], [-0.64, 0.64, 0], [-0.65, 0.54, 0]],
      [[0.034, 0.034], [0.026, 0.026], [0.02, 0.02], [0.014, 0.014]],
      { sub: near ? 3 : 2, capStart: false, capLen: 0.7 },
    ),
  });

  // Big mule ears: long, cupped, broad in the middle, a dark rim at the tip, pale inside
  b.addPair({
    part: PART.HEAD, piv: neckPiv, piv2: [0.81, 1.15, 0.06], spare: 4, sides: near ? 10 : 6, // (tag 4 + piv2: an ear, pivoting at its base: the r-idle flick)
    paint: (_p, _n, t) => {
      const k = 1 - 0.55 * smooth(0.65, 1.0, t);
      return [0.9 * k, 0.84 * k, 0.78 * k, 1];
    },
    rings: pathRings(
      [[0.81, 1.15, 0.06], [0.79, 1.22, 0.115], [0.765, 1.29, 0.17], [0.74, 1.345, 0.22]],
      [[0.036, 0.012], [0.066, 0.013], [0.064, 0.012], [0.016, 0.006]],
      { ref: [1, 0, 0], sub: near ? 3 : 2, capStart: false, capLen: 0.4 },
    ),
  });

  // Sturdy legs: paler inner and lower legs, dark hooves
  const legPaint: PaintFn = (p) => {
    if (p[1] < 0.045) return [0.05, 0.045, 0.04, 0];
    const lowerPale = smooth(0.5, 0.2, p[1]);
    return toWhite(1, lowerPale * 0.45);
  };
  const legSub = near ? 4 : 2;
  const legSides = near ? 12 : 8;
  const frontLeg: TubeOpts = {
    part: PART.FR, piv: [0.36, 0.77, 0.09], piv2: [0.38, 0.34, 0.08], sides: legSides, paint: legPaint,
    w1: (p) => smooth(0.43, 0.27, p[1]),
    rings: pathRings(
      [[0.36, 0.77, 0.09], [0.37, 0.56, 0.085], [0.38, 0.34, 0.08], [0.385, 0.16, 0.066], [0.39, 0.045, 0.06]],
      [[0.066, 0.056], [0.046, 0.04], [0.03, 0.027], [0.024, 0.022], [0.03, 0.026]],
      { ref: [1, 0, 0], sub: legSub, capStart: false, capLen: 0.5 },
    ),
  };
  const hindLeg: TubeOpts = {
    part: PART.HR, piv: [-0.4, 0.79, 0.09], piv2: [-0.5, 0.36, 0.085], sides: legSides, paint: legPaint,
    w1: (p) => smooth(0.43, 0.27, p[1]),
    rings: pathRings(
      [[-0.4, 0.79, 0.09], [-0.32, 0.58, 0.11], [-0.5, 0.36, 0.085], [-0.48, 0.16, 0.07], [-0.47, 0.045, 0.06]],
      [[0.1, 0.075], [0.072, 0.055], [0.032, 0.029], [0.024, 0.022], [0.03, 0.026]],
      { ref: [1, 0, 0], sub: legSub, capStart: false, capLen: 0.5 },
    ),
  };
  b.addPair(frontLeg, PART.FL);
  b.addPair(hindLeg, PART.HL);
  if (near) {
    b.addPair({ ...frontLeg, group: 30, shell: 1, inflate: (p) => 0.0015 + 0.005 * smooth(0.2, 0.6, p[1]) }, PART.FL);
    b.addPair({ ...hindLeg, group: 31, shell: 1, inflate: (p) => 0.0015 + 0.006 * smooth(0.2, 0.65, p[1]) }, PART.HL);
  }
  // (the antlers go last: the ambient-occlusion pre-pass draws the far mesh unanimated and stops short of them, see ModelDef.aoCount)
  const bodyTris = b.triangleCount;
  // Antlers (authored on the right; addPair mirrors them). Three branch levels tagged in aPart.w (the shader grows them by season): the main
  // beam (1), the two forks it divides into (2) and the tines each fork divides into (3).
  {
    const B = ANTLER_BASE;
    const F1: V3 = [0.76, 1.44, 0.185];
    const F2a: V3 = [0.88, 1.595, 0.13];
    const F2b: V3 = [0.62, 1.585, 0.275];
    const bone = (t: number): Paint => {
      const a = lin(0x4a3524), s = lin(0x8c7556), c = lin(0xd8cba8);
      const k1 = smooth(0.0, 0.35, t), k2 = smooth(0.55, 1.0, t);
      return [mix(mix(a[0], s[0], k1), c[0], k2), mix(mix(a[1], s[1], k1), c[1], k2), mix(mix(a[2], s[2], k1), c[2], k2), 0];
    };
    const sides = near ? 8 : 5, sub = near ? 3 : 2;
    const branch = (pts: V3[], rad: Array<[number, number]>, level: number, from: V3, capStart = false): TubeOpts => ({
      part: PART.HEAD, piv: neckPiv, piv2: from, sides, spare: level, paint: (_p, _n, t) => bone(t),
      rings: pathRings(pts, rad, { ref: [1, 0, 0], sub, capStart, capLen: 0.5 }),
    });
    const r = (a: number, c: number): Array<[number, number]> => [[a, a], [(a + c) * 0.5, (a + c) * 0.5], [c, c]];
    b.addPair(branch([B, [0.835, 1.225, 0.085], [0.8, 1.33, 0.14], F1], [[0.02, 0.02], [0.0185, 0.0185], [0.0165, 0.0165], [0.0145, 0.0145]], 1, B));
    // the forks
    b.addPair(branch([F1, [0.82, 1.52, 0.16], F2a], r(0.0145, 0.0115), 2, F1));
    b.addPair(branch([F1, [0.7, 1.52, 0.235], F2b], r(0.0145, 0.0115), 2, F1));
    // and each divides again: the tines
    const tine: Array<[number, number]> = [[0.0115, 0.0115], [0.0085, 0.0085], [0.003, 0.003]];
    b.addPair(branch([F2a, [0.95, 1.65, 0.115], [1.01, 1.69, 0.1]], tine, 3, F2a));
    b.addPair(branch([F2a, [0.89, 1.675, 0.15], [0.885, 1.755, 0.16]], tine, 3, F2a));
    b.addPair(branch([F2b, [0.6, 1.66, 0.285], [0.57, 1.74, 0.29]], tine, 3, F2b));
    b.addPair(branch([F2b, [0.55, 1.62, 0.315], [0.46, 1.66, 0.335]], tine, 3, F2b));
  }

  return { b, bodyTris };
}

export function buildMuleDeer(): ModelDef {
  const { b: far, bodyTris } = make(false);
  const { b: nearB } = make(true);
  return {
    geometry: far.build({ ground: 0.74 }),
    aoCount: bodyTris * 3,
    nearGeometry: nearB.build({ ground: 0.74 }),
    lod: { d0: 20, d1: 30 },
    fur: { sheen: 0.4, sheenPow: 45, sheenTint: [1.0, 0.92, 0.82], rim: 1.5, dorsal: 0.2, belly: 0.06, mottle: 0.05, mottleScale: 10, streak: 0.12, indiv: 0.08,
      shell: { scale: 95, along: 0.6, sparse: 0.14, d0: 12, d1: 22, tone: [0.84, 1.06] } },
    seasonal: {
      winterPale: lin(0x80786b), winterDark: lin(0x58524a),
      antlerBase: ANTLER_BASE, forkAt: 0.42, tineAt: 0.75,
      velvet: lin(0x3a2c22),
    },
    triangles: far.triangleCount,
    // the summer coat: reddish tan (the winter one is in `seasonal`)
    coatPale: lin(0xa77348),
    coatDark: lin(0x784c2e),
    bone: lin(0xd8d0bc),
    roughness: 0.9,
    fill: 1.5,
    warm: [1.1, 1.0, 0.86],
    neutral: 0.7,
    // from the drone view a herd reads as a dull tan and white, not a bright smear
    // R-readable: guild value separation and edge lift at the default distances (see ModelDef.read)
    read: { pale: 0.3, rim: [1.0, 0.92, 0.78, 0.45] },
    // r-read: grey-brown from 45 m out (full by 180 m), the belly and legs fade to a pale grey-tan and the cream rump patch stays
    far: { gain: 0.85, rim: 0, hunt: 0, rimCol: [1, 1, 1], d0: 40, d1: 125, tint: [0.2, 0.18, 0.16], mix: 0.5, lowFill: 0.3, rimCut: 0.6, edge: 0.2, fogDark: 0.5, snowDark: 1.0,
      top: [0.28, 0.22, 0.16], topMix: 0.7, side: 0.2, legs: 0.55, calm: 0.8, widen: 0.4,
      mute: { col: [0.3, 0.24, 0.19], k: 0.7, keepX: -0.3 } },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.8, legL: 0.73,
      // on-screen m/s at 1x: walking groups (1 to 4) walk then trot; a flight (10 to 19) is a stot, and a gallop below that
      trot0: 3.0, trot1: 4.2, gal0: 8.0, gal1: 11.0,
      ampW: 0.52, ampT: 0.63, ampG: 0.95,
      dutyW: 0.62, dutyT: 0.5, dutyG: 0.36, dutyGF: 0.25, fast0: 11, fast1: 24,
      kneeW: 0.5, kneeT: 0.8, kneeG: 1.2,
      bobW: 0.012, bobT: 0.03, bobG: 0.08,
      pitchT: 0.02, pitchG: 0.09,
      nodW: 0.05, nodG: 0.06,
      headDown: 1.15, lookYaw: 0.6,
      tailRest: 0.05, tailRun: 0.1, tailSway: 0.12,
      lieDrop: 0.46, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: 0.55, lieKneeH: 1.7,
      crouchDrop: 0.1,
      deadDrop: 0.4, deadHipF: 0.9, deadHipH: -0.6,
      // R6 stotting: four feet down together for a fifth of the cycle, then a bound with the body rising 0.26 m and the feet tucked up under it
      alertYaw: true,
      stot: { amp: 0.62, duty: 0.2, knee: 1.25, bob: 0.26, sink: 0.05, pitch: 0.1, off: [0, 0, 0, 0] },
      length: 1.5, height: 1.3, ring: 1.1, minPx: 9, boostLen: 1.5,
    },
  };
}
