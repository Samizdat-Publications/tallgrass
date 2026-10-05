// Red-tailed hawk (R5), 0.55 m long, 1.2 m wingspan. Origin at the feet; the body centre sits at y = 0.21. Brown back, pale belly with a dark belly
// band, a dark bar along the leading edge of the underwing and a short broad rufous tail; broad wings with five slotted primaries.
// Same rig as the eagle (see eagle.ts): the shader holds the wings in a shallow V in a soar, folds them for the stoop and against the flank.
import { MeshBuilder, PART, blobRings, lin, pathRings, smooth, torsoRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { addRaptorWings, fingerFan } from './raptorkit';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildHawk(): ModelDef {
  const b = new MeshBuilder();
  const cream = lin(0xe8d9bc);
  const band = lin(0x4d3524);
  const rufous = lin(0xb4501f);
  const horn = lin(0x2a2a2c);
  const cere = lin(0xd6b43c);
  const eye = lin(0x1a0d05);
  const toe = lin(0xdcc050);

  // a blend of the coat (brown) toward a fixed colour: the vertex stores the colour and how much the coat shows through
  const toward = (c: V3, w: number, k = 1): [number, number, number, number] => [mx(k, c[0], w), mx(k, c[1], w), mx(k, c[2], w), 1 - w];

  // brown back, cream breast and belly, a streaked dark band across the belly
  const body: PaintFn = (p, n) => {
    const under = smooth(0.15, -0.45, n[1]);
    const bandW = under * smooth(-0.075, -0.035, p[0]) * (1 - smooth(0.035, 0.075, p[0])) * 0.85;
    const w = under * (1 - bandW);
    const c = toward(cream, w, 1 + 0.2 * Math.max(0, n[1]));
    if (bandW > 0) {
      const t2 = toward(band, bandW, 1);
      return [c[0] * (1 - bandW) + t2[0] * bandW, c[1] * (1 - bandW) + t2[1] * bandW, c[2] * (1 - bandW) + t2[2] * bandW, c[3] * (1 - bandW) + t2[3] * bandW];
    }
    return c;
  };
  b.addTube({
    part: PART.BODY, sides: 10, paint: body,
    rings: torsoRings([
      [-0.17, 0.19, 0, 0, 0],
      [-0.14, 0.192, 0.025, 0.022, 0.025],
      [-0.08, 0.2, 0.062, 0.06, 0.062],
      [0.0, 0.21, 0.088, 0.083, 0.082],
      [0.07, 0.217, 0.092, 0.085, 0.08],
      [0.13, 0.225, 0.075, 0.07, 0.062],
      [0.17, 0.232, 0.04, 0.035, 0.035],
      [0.185, 0.235, 0, 0, 0],
    ]),
  });
  const neckPiv: V3 = [0.13, 0.225, 0];
  // the head: brown above, a paler throat
  const head: PaintFn = (_p, n) => toward(cream, smooth(-0.1, -0.7, n[1]) * 0.8, 1);
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 10, paint: head,
    rings: pathRings([[0.1, 0.222, 0], [0.145, 0.24, 0], [0.185, 0.255, 0], [0.208, 0.258, 0]], [[0.052, 0.048], [0.047, 0.043], [0.038, 0.034], [0.028, 0.025]], { sub: 2, capStart: false, capLen: 0.6 }),
  });
  const beak: PaintFn = (_p, _n, t) => (t < 0.36 ? [cere[0], cere[1], cere[2], 0] : [horn[0], horn[1], horn[2], 0]);
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 8, paint: beak,
    rings: pathRings([[0.2, 0.257, 0], [0.232, 0.254, 0], [0.252, 0.243, 0], [0.258, 0.228, 0]], [[0.024, 0.02], [0.02, 0.015], [0.012, 0.009], [0.004, 0.004]], { sub: 2, capStart: false, capLen: 0.4 }),
  });
  b.addPair({ part: PART.HEAD, piv: neckPiv, sides: 6, paint: [eye[0], eye[1], eye[2], 0], rings: blobRings([0.188, 0.265, 0.033], 0.011, 0.01, 0.008, 4) });
  b.addPair({ part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.07, 0.045, 0.03, 0.4], rings: blobRings([0.182, 0.275, 0.03], 0.02, 0.006, 0.012, 4) });

  // the tail: rufous above, pale below, a dark band near the tip and a thin pale edge
  const tail: PaintFn = (_p, n, t) => {
    const sub = smooth(0.7, 0.74, t) * (1 - smooth(0.84, 0.88, t));
    const tip = smooth(0.9, 0.93, t);
    const under = n[1] < -0.3 ? 1 : 0;
    let r = mx(rufous[0], 0.55, under * 0.6), g = mx(rufous[1], 0.38, under * 0.6), bl = mx(rufous[2], 0.3, under * 0.6);
    r = mx(r, band[0], sub); g = mx(g, band[1], sub); bl = mx(bl, band[2], sub);
    r = mx(r, cream[0], tip); g = mx(g, cream[1], tip); bl = mx(bl, cream[2], tip);
    return [r, g, bl, 0];
  };
  b.addTube({
    part: PART.TAIL, piv: [-0.14, 0.2, 0], sides: 8, paint: tail,
    rings: pathRings([[-0.14, 0.2, 0], [-0.26, 0.196, 0], [-0.37, 0.19, 0], [-0.415, 0.188, 0]], [[0.011, 0.035], [0.008, 0.066], [0.006, 0.071], [0.003, 0.045]], { sub: 2, capLen: 0.3 }),
  });

  const hip: V3 = [0.02, 0.17, 0.048];
  const leg: PaintFn = (_p, _n, t) => (t > 0.6 ? [toe[0], toe[1], toe[2], 0] : toward(cream, 0.55, 1));
  b.addPair({
    part: PART.FR, piv: hip, piv2: hip, sides: 6, paint: leg,
    rings: pathRings([hip, [0.024, 0.09, 0.048], [0.028, 0.02, 0.048]], [[0.036, 0.038], [0.026, 0.026], [0.015, 0.015]], { ref: [1, 0, 0], sub: 1, capStart: false, capLen: 0.3 }),
  }, PART.FL);
  const toes: PaintFn = (_p, _n, t) => (t > 0.7 ? [0.03, 0.03, 0.03, 0] : [toe[0], toe[1], toe[2], 0]);
  for (const [tx, tz] of [[0.085, 0.06], [0.08, 0.036], [-0.03, 0.048]] as Array<[number, number]>) {
    b.addPair({
      part: PART.FR, piv: hip, piv2: hip, sides: 5, paint: toes,
      rings: pathRings([[0.028, 0.02, 0.048], [(0.028 + tx) * 0.5, 0.012, (0.048 + tz) * 0.5], [tx, 0.004, tz]], [[0.009, 0.009], [0.006, 0.006], [0.004, 0.004]], { ref: [0, 1, 0], sub: 1, capStart: false, capLen: 0.5 }),
    }, PART.FL);
  }

  // wings: brown above with a paler patch on the scapulars; below, cream with a dark bar along the leading edge near the body and a
  // dark trailing edge
  const wing: PaintFn = (p, n) => {
    if (n[1] < -0.2) {
      const patagium = smooth(0.0, 0.05, p[0]) * (1 - smooth(0.2, 0.28, p[2]));
      const trail = smooth(-0.07, -0.12, p[0]);
      const w = 0.85 * (1 - 0.85 * Math.max(patagium, trail));
      return toward(cream, w, 1);
    }
    const scap = smooth(0.07, 0.14, p[2]) * (1 - smooth(0.2, 0.28, p[2])) * smooth(-0.05, 0.02, p[0]);
    return [1 + 0.5 * scap, 1 + 0.4 * scap, 1 + 0.15 * scap, 1];
  };
  const prim: PaintFn = (_p, n, t) => {
    if (n[1] < -0.2) return toward(cream, 0.55 * (1 - smooth(0.5, 0.9, t)), 1);
    const k = 0.85 + 0.2 * (1 - smooth(0.0, 0.5, t));
    return [k, k * 0.97, k * 0.92, 1];
  };
  addRaptorWings(b, {
    shoulder: [0.035, 0.215, 0.065], wrist: [0.07, 0.22, 0.26],
    path: [[0.0, 0.215, 0.05], [-0.015, 0.218, 0.15], [-0.01, 0.222, 0.26], [-0.05, 0.222, 0.34], [-0.09, 0.222, 0.4]],
    rad: [[0.015, 0.13], [0.015, 0.145], [0.012, 0.128], [0.009, 0.095], [0.006, 0.062]],
    bend: [0.2, 0.32],
    paint: wing,
    fingers: fingerFan(0.37, 0.222, -0.01, 0.03, [0.17, 0.2, 0.2, 0.18, 0.15], 0.027, 0.032),
    fingerPaint: prim,
  });

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0x84603f),
    coatDark: lin(0x3a281b),
    bone: lin(0xd8d0bc),
    roughness: 0.55,
    fill: 1.55,
    warm: [1.05, 1.0, 0.92],
    neutral: 0.6,
    far: { gain: 1.05, rim: 0.06, hunt: 0, rimCol: [0.9, 0.78, 0.55], tint: [0.4, 0.3, 0.2], mix: 0.3 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 2,
      comY: 0.21,
      flapHz: 2.6,
      headDown: 0.9, lookYaw: 0.8,
      tailRest: 0, tailRun: 0, tailSway: 0.1,
      lieDrop: 0, deadDrop: 0.1,
      strideW: 0.5, strideG: 1.2, strideSpeedMax: 8,
      length: 0.55, height: 0.4, ring: 0.7, minPx: 12, boostLen: 1.2,
      raptor: {
        handRoot: [-0.05, 0.222, 0.37], fingers: 5, spread: 0.2, curl: 0.18,
        dihIn: 0.22, dihOut: 0.1, flapIn: 0.6, flapOut: 0.5, sweepFast: 0.3,
        stoopDih: -0.05, stoopSweep: 1.15, stoopCmp: 0.3, foldCmp: 0.5, foldDroop: 0.3,
        perchPitch: 0.75, perchHip: [0.02, 0.17], tailFan: 0.4,
      },
    },
  };
}

function mx(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
