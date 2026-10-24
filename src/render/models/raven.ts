// Common raven, ~0.6 m long, 1.2 m wingspan. Origin at the feet; the body centre sits at y = 0.15.
// Wings are separate parts (L = -z, R = +z) that the shader flaps, glides or folds.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings } from './builder';
import type { PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildRaven(): ModelDef {
  const b = new MeshBuilder();
  const beak = lin(0x0a0a0a);

  // Black with a blue-black sheen on every upward-facing surface, so a raven seen from above reads as a glossy bird with
  // form (back, wing tops, tail) instead of a flat black cutout. Nothing is grey or white underneath (the shader keeps its specular blue as well).
  const feather: PaintFn = (p, n) => {
    const up = Math.max(0, n[1]);
    const k = 1 + 0.4 * up * up;
    return [k * 0.95, k * 0.98, k * 1.1, 1];
  };
  // Stocky body with a deep chest.
  b.addTube({
    part: PART.BODY, sides: 10, paint: feather,
    rings: torsoRings([
      [-0.15, 0.145, 0, 0, 0],
      [-0.11, 0.148, 0.03, 0.03, 0.03],
      [-0.03, 0.152, 0.06, 0.058, 0.062],
      [0.07, 0.158, 0.068, 0.064, 0.07],
      [0.15, 0.165, 0.058, 0.05, 0.056],
      [0.2, 0.172, 0, 0, 0],
    ]),
  });
  const neckPiv: V3 = [0.16, 0.16, 0];
  // A thick neck and a big, domed head.
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 8, paint: feather,
    rings: pathRings([[0.14, 0.16, 0], [0.2, 0.19, 0], [0.25, 0.2, 0]], [[0.05, 0.05], [0.056, 0.053], [0.05, 0.046]], { sub: 2, capStart: false, capLen: 0.7 }),
  });
  // The shaggy throat: a loose bib under the chin and a few hackles hanging back from it.
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: feather,
    rings: pathRings([[0.19, 0.15, 0], [0.235, 0.145, 0], [0.27, 0.17, 0]], [[0.018, 0.03], [0.02, 0.032], [0.01, 0.018]], { sub: 1, capLen: 0.6 }),
  });
  for (let k = 0; k < 2; k++) {
    b.addPair(
      {
        part: PART.HEAD, piv: neckPiv, sides: 4, paint: feather,
        rings: pathRings([[0.255 - 0.03 * k, 0.165, 0.02 + 0.012 * k], [0.23 - 0.03 * k, 0.135, 0.03 + 0.012 * k], [0.195 - 0.03 * k, 0.1, 0.036 + 0.012 * k]], [[0.006, 0.012], [0.005, 0.01], [0.002, 0.003]], { ref: [0, 0, 1], sub: 1, capStart: false, capLen: 0.3 }),
      },
      PART.HEAD,
    );
  }
  // A heavy bill: deep at the base, arched on top, hooked at the tip, with a thinner lower mandible and bristles over the nostrils.
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 7, paint: [beak[0], beak[1], beak[2], 0],
    rings: pathRings([[0.24, 0.197, 0], [0.3, 0.2, 0], [0.355, 0.19, 0], [0.4, 0.168, 0]], [[0.034, 0.03], [0.034, 0.026], [0.026, 0.017], [0.006, 0.006]], { sub: 2, capStart: false, capLen: 0.5 }),
  });
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: [beak[0], beak[1], beak[2], 0],
    rings: pathRings([[0.25, 0.172, 0], [0.31, 0.168, 0], [0.37, 0.162, 0]], [[0.014, 0.02], [0.012, 0.016], [0.004, 0.005]], { sub: 1, capStart: false, capLen: 0.5 }),
  });
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 5, paint: feather,
    rings: pathRings([[0.235, 0.205, 0], [0.265, 0.218, 0], [0.295, 0.222, 0]], [[0.012, 0.022], [0.01, 0.018], [0.003, 0.006]], { sub: 1, capStart: false, capLen: 0.4 }),
  });
  // Wedge tail: seven feathers fanned from the rump, the middle pair longest, so the tip is pointed (a fan of flat blades, not one plank).
  for (let k = 0; k <= 3; k++) {
    const len = 0.31 - 0.027 * k;
    const y0 = 0.146 - 0.002 * k;
    const spec = {
      part: PART.TAIL, piv: [-0.12, 0.145, 0] as V3, sides: 4, paint: feather,
      rings: pathRings(
        [[-0.1, y0, 0.008 * k], [-0.1 - len * 0.5, y0 - 0.002, 0.017 * k], [-0.1 - len, y0 - 0.006 - 0.003 * k, 0.034 * k]],
        [[0.005, 0.024], [0.004, 0.023], [0.0025, 0.014]],
        { sub: 1, capStart: false, capLen: 0.5 },
      ),
    };
    if (k === 0) b.addTube(spec);
    else b.addPair(spec, PART.TAIL);
  }
  // Legs: thick and black.
  b.addPair({
    part: PART.FR, piv: [0.02, 0.12, 0.03], piv2: [0.02, 0.12, 0.03], sides: 5, paint: [0.05, 0.05, 0.05, 0],
    rings: pathRings([[0.02, 0.12, 0.03], [0.04, 0.05, 0.03], [0.05, 0.0, 0.03]], [[0.016, 0.016], [0.01, 0.01], [0.012, 0.018]], { ref: [1, 0, 0], sub: 1, capStart: false, capLen: 0.3 }),
  }, PART.FL);

  // Wings: a broad arm (the secondaries) lofted from the shoulder, then the hand: seven long primaries fanned apart so the tip is slotted.
  const wPiv: V3 = [0.04, 0.17, 0.05];
  const wElbow: V3 = [0.0, 0.175, 0.3];
  // (the builder hands the weight function the MIRRORED position, so the left wing arrives with z < 0: the weight must read |z|, or the left hand
  // never bends at the elbow and a folded left wing stays a long straight blade while the right one tucks in)
  const wingW1 = (p: V3) => smooth(0.25, 0.4, Math.abs(p[2]));
  b.addPair(
    {
      part: PART.WINGR, piv: wPiv, piv2: wElbow, sides: 8, paint: feather, w1: wingW1,
      rings: pathRings(
        [[0.03, 0.17, 0.04], [0.0, 0.175, 0.18], [-0.03, 0.178, 0.34], [-0.06, 0.18, 0.46]],
        [[0.016, 0.085], [0.012, 0.108], [0.009, 0.1], [0.006, 0.068]],
        { ref: [0, 1, 0], sub: 2, capLen: 0.5 },
      ),
    },
    PART.WINGL,
  );
  // Leading primary first. Tips fan back, the longest in the middle of the hand; each one is a slim blade with a rounded end, and the tips curl up a little.
  const tipZ = [0.66, 0.71, 0.73, 0.72, 0.68, 0.63, 0.56];
  for (let k = 0; k < 7; k++) {
    const rx = -0.015 - 0.019 * k, rz = 0.4 + 0.012 * k;
    const tx = -0.045 - 0.049 * k - 0.004 * k * k * 0.3, tz = tipZ[k];
    const ty = 0.186 + 0.004 * k;
    b.addPair(
      {
        part: PART.WINGR, piv: wPiv, piv2: wElbow, sides: 4, paint: feather, w1: wingW1,
        rings: pathRings(
          [[rx, 0.178, rz], [(rx + tx) * 0.5 - 0.004, 0.18 + 0.001 * k, (rz + tz) * 0.5], [tx, ty, tz]],
          [[0.005, 0.026], [0.004, 0.021], [0.003, 0.011]],
          { ref: [0, 1, 0], sub: 1, capStart: false, capLen: 0.5 },
        ),
      },
      PART.WINGL,
    );
  }

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0x2a2a34),
    coatDark: lin(0x101016),
    bone: lin(0xd8d0bc),
    roughness: 0.5,
    fill: 1.6,
    warm: [1.0, 1.0, 1.0],
    neutral: 0.6,
    far: { gain: 1, rim: 0.05, hunt: 0, rimCol: [0.55, 0.65, 0.95] },
    params: {
      ...DEFAULT_PARAMS,
      kind: 2,
      comY: 0.15,
      flapHz: 3.4,
      headDown: 0.9, lookYaw: 0.7,
      tailRest: 0, tailRun: 0, tailSway: 0.15,
      lieDrop: 0, deadDrop: 0.12,
      strideW: 0.5, strideG: 1.2, strideSpeedMax: 8,
      length: 0.6, height: 0.35, ring: 0.6, minPx: 11, boostLen: 1.2,
    },
  };
}
