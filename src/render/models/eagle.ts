// Golden eagle (R5), 0.85 m long, 2.0 m wingspan. Origin at the feet; the body centre sits at y = 0.31. Dark brown with a golden nape and a golden
// bar across the upper wing; broad wings with six slotted primaries (separate feathers the shader fans), a long rounded tail.
// The wings are separate parts (L = -z, R = +z) that the shader (`#if RAPTOR`) flaps, glides, folds into the stoop or against the flank.
import { MeshBuilder, PART, blobRings, lin, pathRings, smooth, torsoRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { addRaptorWings, fingerFan } from './raptorkit';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildEagle(): ModelDef {
  const b = new MeshBuilder();
  const gold = lin(0xd0a04a);
  const horn = lin(0x2b2a2a);
  const cere = lin(0xd8b030);
  const eye = lin(0x120a05);
  const toe = lin(0xd9b238);

  // the coat: dark brown, a touch of golden-tan on the mantle (the back reads warmer than the flanks)
  const body: PaintFn = (p, n) => {
    const up = Math.max(0, n[1]);
    const mantle = smooth(0.1, 0.5, up) * smooth(-0.1, 0.12, p[0]);
    const k = 1 + 0.25 * up;
    return [k * (1 + 0.5 * mantle), k * (1 + 0.28 * mantle), k * (1 - 0.1 * mantle), 1];
  };
  b.addTube({
    part: PART.BODY, sides: 10, paint: body,
    rings: torsoRings([
      [-0.27, 0.285, 0, 0, 0],
      [-0.23, 0.29, 0.035, 0.03, 0.035],
      [-0.14, 0.3, 0.085, 0.08, 0.085],
      [-0.02, 0.315, 0.12, 0.115, 0.115],
      [0.09, 0.325, 0.125, 0.115, 0.11],
      [0.18, 0.335, 0.105, 0.095, 0.085],
      [0.235, 0.345, 0.05, 0.045, 0.045],
      [0.255, 0.35, 0, 0, 0],
    ]),
  });
  // head and neck: the hackles of the nape and the back of the neck are golden
  const neckPiv: V3 = [0.19, 0.34, 0];
  const head: PaintFn = (p, n) => {
    const nape = smooth(0.0, 0.35, n[1] + 0.15) * (1 - smooth(0.2, 0.245, p[0]));
    return [mix1(1, gold[0] * 1.5, nape), mix1(1, gold[1] * 1.5, nape), mix1(1, gold[2] * 1.5, nape), 1 - 0.6 * nape];
  };
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 10, paint: head,
    rings: pathRings([[0.15, 0.335, 0], [0.205, 0.358, 0], [0.255, 0.382, 0], [0.285, 0.386, 0]], [[0.07, 0.065], [0.064, 0.058], [0.052, 0.046], [0.038, 0.033]], { sub: 2, capStart: false, capLen: 0.6 }),
  });
  // the hooked beak, yellow at the cere, dark horn beyond it
  const beak: PaintFn = (_p, _n, t) => (t < 0.38 ? [cere[0], cere[1], cere[2], 0] : [horn[0], horn[1], horn[2], 0]);
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 8, paint: beak,
    rings: pathRings([[0.275, 0.384, 0], [0.322, 0.381, 0], [0.352, 0.366, 0], [0.362, 0.344, 0]], [[0.034, 0.028], [0.028, 0.021], [0.017, 0.012], [0.005, 0.005]], { sub: 2, capStart: false, capLen: 0.4 }),
  });
  // eyes under a brow
  b.addPair({ part: PART.HEAD, piv: neckPiv, sides: 6, paint: [eye[0], eye[1], eye[2], 0], rings: blobRings([0.262, 0.395, 0.043], 0.014, 0.012, 0.01, 4) });
  b.addPair({ part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.06, 0.04, 0.025, 0.4], rings: blobRings([0.255, 0.408, 0.04], 0.026, 0.008, 0.016, 4) });

  // a long, rounded tail, barred; the shader fans it wide in a soar
  const tail: PaintFn = (p, n, t) => {
    const band = smooth(0.34, 0.37, t) * (1 - smooth(0.42, 0.45, t)) + smooth(0.62, 0.65, t) * (1 - smooth(0.7, 0.73, t));
    const k = 1 + 0.45 * band + (n[1] < -0.3 ? 0.2 : 0);
    return [k, k * 0.97, k * 0.92, 1];
  };
  b.addTube({
    part: PART.TAIL, piv: [-0.2, 0.3, 0], sides: 8, paint: tail,
    rings: pathRings([[-0.2, 0.3, 0], [-0.4, 0.296, 0], [-0.58, 0.288, 0], [-0.645, 0.285, 0]], [[0.013, 0.045], [0.01, 0.088], [0.008, 0.094], [0.004, 0.06]], { sub: 2, capLen: 0.3 }),
  });

  // feathered legs (the thigh "trousers"), yellow feet with dark talons
  const hip: V3 = [0.03, 0.255, 0.065];
  const leg: PaintFn = (_p, _n, t) => (t > 0.62 ? [toe[0], toe[1], toe[2], 0.1] : [1.05, 0.95, 0.8, 1]);
  b.addPair({
    part: PART.FR, piv: hip, piv2: hip, sides: 6, paint: leg,
    rings: pathRings([hip, [0.034, 0.14, 0.065], [0.04, 0.03, 0.065]], [[0.05, 0.052], [0.036, 0.036], [0.022, 0.022]], { ref: [1, 0, 0], sub: 1, capStart: false, capLen: 0.3 }),
  }, PART.FL);
  const toes: PaintFn = (_p, _n, t) => (t > 0.7 ? [0.03, 0.03, 0.03, 0] : [toe[0], toe[1], toe[2], 0.1]);
  for (const [tx, tz] of [[0.125, 0.082], [0.118, 0.05], [-0.045, 0.065]] as Array<[number, number]>) {
    b.addPair({
      part: PART.FR, piv: hip, piv2: hip, sides: 5, paint: toes,
      rings: pathRings([[0.04, 0.03, 0.065], [(0.04 + tx) * 0.5, 0.017, (0.065 + tz) * 0.5], [tx, 0.006, tz]], [[0.013, 0.013], [0.009, 0.009], [0.006, 0.006]], { ref: [0, 1, 0], sub: 1, capStart: false, capLen: 0.5 }),
    }, PART.FL);
  }

  // wings: the blade from the shoulder to the end of the hand (a golden bar across the upper coverts), then six primaries
  const wing: PaintFn = (p, n) => {
    const top = n[1] > 0.25;
    const bar = top ? smooth(0.1, 0.18, p[2]) * (1 - smooth(0.5, 0.6, p[2])) * smooth(-0.07, 0.0, p[0] + 0.02 * p[2]) : 0;
    const under = n[1] < -0.25 ? 1 : 0;
    const k = 1 + 0.15 * under;
    return [k * (1 + 0.95 * bar), k * (1 + 0.5 * bar), k * (1 - 0.1 * bar), 1];
  };
  const prim: PaintFn = (_p, n, t) => {
    const base = 1 - smooth(0.0, 0.5, t);
    const k = 0.78 + 0.35 * base + (n[1] < -0.25 ? 0.18 : 0);
    return [k, k * 0.97, k * 0.94, 1];
  };
  addRaptorWings(b, {
    shoulder: [0.05, 0.335, 0.09], wrist: [0.1, 0.34, 0.42],
    path: [[0.0, 0.335, 0.07], [-0.02, 0.34, 0.25], [-0.01, 0.345, 0.42], [-0.07, 0.345, 0.55], [-0.13, 0.345, 0.66]],
    rad: [[0.02, 0.19], [0.02, 0.215], [0.017, 0.19], [0.012, 0.14], [0.008, 0.09]],
    bend: [0.34, 0.5],
    paint: wing,
    fingers: fingerFan(0.6, 0.345, -0.02, 0.034, [0.3, 0.34, 0.36, 0.35, 0.31, 0.26], 0.034, 0.045),
    fingerPaint: prim,
  });

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0x7d5732),
    coatDark: lin(0x2d1f15),
    bone: lin(0xd8d0bc),
    roughness: 0.55,
    fill: 1.5,
    warm: [1.05, 1.0, 0.92],
    neutral: 0.6,
    far: { gain: 1.1, rim: 0.07, hunt: 0, rimCol: [0.9, 0.78, 0.5], tint: [0.34, 0.24, 0.14], mix: 0.35 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 2,
      comY: 0.31,
      flapHz: 1.5,
      headDown: 0.9, lookYaw: 0.8,
      tailRest: 0, tailRun: 0, tailSway: 0.1,
      lieDrop: 0, deadDrop: 0.12,
      strideW: 0.5, strideG: 1.2, strideSpeedMax: 8,
      length: 0.9, height: 0.6, ring: 1.0, minPx: 12, boostLen: 2.0,
      raptor: {
        handRoot: [-0.08, 0.345, 0.6], fingers: 6, spread: 0.22, curl: 0.2,
        dihIn: 0.06, dihOut: 0.1, flapIn: 0.55, flapOut: 0.45, sweepFast: 0.35,
        stoopDih: -0.05, stoopSweep: 1.15, stoopCmp: 0.3, foldCmp: 0.5, foldDroop: 0.3,
        perchPitch: 0.7, perchHip: [0.03, 0.255], tailFan: 0.35,
      },
    },
  };
}

function mix1(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
