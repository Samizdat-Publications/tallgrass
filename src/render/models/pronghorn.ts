// Pronghorn (the "deer" species), ~1.4 m long, 1.15 m to the head. Tan with white belly, rump and throat bars, black horns.
import { MeshBuilder, PART, lin, mix, smooth, pathRings, torsoRings, blobRings } from './builder';
import type { Paint, PaintFn, V3 } from './builder';
import { DEFAULT_PARAMS, type ModelDef } from './types';

export function buildPronghorn(): ModelDef {
  const b = new MeshBuilder();
  const hornCol = lin(0x0c0a08);
  const white = 0.64;

  /** Blend from tan coat (multiplier) to white (absolute) by w. */
  const toWhite = (k: number, w: number): Paint => [mix(k, white, w), mix(k, white * 0.97, w), mix(k, white * 0.9, w), 1 - w];

  const bodyPaint: PaintFn = (p, n) => {
    // bold white: belly, a broad flank band, a big rump patch that wraps over the hips, a white chest
    const belly = smooth(0.1, -0.4, n[1]);
    const lowFlank = smooth(0.8, 0.7, p[1]) * smooth(-0.5, -0.25, p[0]) * (1 - smooth(0.35, 0.55, p[0]) * 0.6);
    const rump = smooth(-0.1, -0.28, p[0]);
    const chest = smooth(0.38, 0.5, p[0]) * smooth(0.1, -0.2, n[1]);
    const flank = smooth(0.25, 0.8, n[1]);
    const saddle = 1 - 0.3 * flank;
    return toWhite(saddle, Math.min(1, Math.max(belly, lowFlank, rump, chest)));
  };
  b.addTube({
    part: PART.BODY, sides: 12, paint: bodyPaint,
    rings: torsoRings([
      [-0.6, 0.78, 0, 0, 0],
      [-0.54, 0.79, 0.11, 0.1, 0.09],
      [-0.35, 0.8, 0.16, 0.14, 0.12],
      [-0.08, 0.79, 0.15, 0.13, 0.115],
      [0.2, 0.8, 0.18, 0.2, 0.13],
      [0.4, 0.81, 0.18, 0.2, 0.125],
      [0.52, 0.82, 0.14, 0.15, 0.1],
      [0.6, 0.84, 0, 0, 0],
    ]),
  });
  // Stubby white tail patch
  b.addTube({
    part: PART.TAIL, piv: [-0.58, 0.82, 0], sides: 6, paint: [0.9, 0.88, 0.8, 0],
    rings: blobRings([-0.6, 0.82, 0], 0.05, 0.05, 0.04, 4),
  });

  // Long neck with a throat patch, small head, big eyes
  const neckPiv: V3 = [0.42, 0.9, 0];
  const headPaint: PaintFn = (p, n) => {
    const throat = smooth(0.0, -0.5, n[1]) * smooth(0.45, 0.6, p[0]);
    // two white bands wrapping the neck, a pale cheek and muzzle
    const band = Math.max(1 - smooth(0.02, 0.05, Math.abs(p[0] - 0.53)), 1 - smooth(0.02, 0.05, Math.abs(p[0] - 0.66)));
    const cheek = smooth(0.74, 0.8, p[0]) * (1 - smooth(0.88, 0.94, p[0])) * smooth(0.1, -0.3, n[1]);
    const muzzle = smooth(0.9, 0.97, p[0]);
    const nose = smooth(1.0, 1.03, p[0]);
    if (nose > 0.5) return [0.03, 0.03, 0.03, 0];
    const k = 1 - 0.1 * smooth(0.2, 0.8, n[1]);
    return toWhite(k, Math.max(throat * 0.9, band * 0.95, cheek * 0.8, muzzle * 0.6));
  };
  b.addTube({
    part: PART.HEAD, piv: neckPiv, sides: 10, paint: headPaint,
    rings: pathRings(
      [[0.36, 0.84, 0], [0.55, 0.98, 0], [0.7, 1.1, 0], [0.82, 1.12, 0], [0.95, 1.06, 0], [1.02, 1.03, 0]],
      [[0.13, 0.1], [0.09, 0.07], [0.075, 0.062], [0.075, 0.07], [0.04, 0.036], [0.03, 0.028]],
      { sub: 3, capStart: false, capLen: 0.6 },
    ),
  });
  // Black horns with a forward prong, leaf ears
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6,
    paint: [hornCol[0], hornCol[1], hornCol[2], 0],
    rings: pathRings([[0.78, 1.17, 0.045], [0.77, 1.27, 0.052], [0.74, 1.37, 0.05], [0.69, 1.43, 0.04]], [[0.022, 0.02], [0.02, 0.018], [0.016, 0.014], [0.004, 0.004]], { sub: 2, capStart: false, capLen: 0.5 }),
  });
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6,
    paint: [hornCol[0], hornCol[1], hornCol[2], 0],
    rings: pathRings([[0.77, 1.27, 0.052], [0.82, 1.32, 0.052], [0.86, 1.36, 0.05]], [[0.014, 0.013], [0.01, 0.01], [0.003, 0.003]], { sub: 2, capStart: false, capLen: 0.4 }),
  });
  b.addPair({
    part: PART.HEAD, piv: neckPiv, sides: 6, paint: [0.9, 0.85, 0.8, 1],
    rings: pathRings([[0.68, 1.1, 0.07], [0.62, 1.16, 0.11], [0.57, 1.2, 0.14]], [[0.03, 0.012], [0.026, 0.012], [0.006, 0.006]], { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 }),
  });

  // Slender legs; paler lower legs and hooves
  const legPaint: PaintFn = (p) => {
    if (p[1] < 0.045) return [0.05, 0.045, 0.04, 0];
    const lowerPale = smooth(0.45, 0.2, p[1]);
    return toWhite(1, lowerPale * 0.55);
  };
  b.addPair(
    {
      part: PART.FR, piv: [0.36, 0.76, 0.09], piv2: [0.38, 0.33, 0.08], sides: 8, paint: legPaint,
      w1: (p) => smooth(0.42, 0.26, p[1]),
      rings: pathRings(
        [[0.36, 0.76, 0.09], [0.37, 0.55, 0.085], [0.38, 0.33, 0.08], [0.385, 0.15, 0.065], [0.39, 0.045, 0.06]],
        [[0.075, 0.065], [0.052, 0.045], [0.034, 0.03], [0.027, 0.025], [0.033, 0.028]],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.FL,
  );
  b.addPair(
    {
      part: PART.HR, piv: [-0.4, 0.78, 0.09], piv2: [-0.5, 0.36, 0.085], sides: 8, paint: legPaint,
      w1: (p) => smooth(0.42, 0.26, p[1]),
      rings: pathRings(
        [[-0.4, 0.78, 0.09], [-0.32, 0.58, 0.11], [-0.5, 0.36, 0.085], [-0.48, 0.16, 0.07], [-0.47, 0.045, 0.06]],
        [[0.11, 0.08], [0.08, 0.06], [0.036, 0.032], [0.027, 0.025], [0.033, 0.028]],
        { ref: [1, 0, 0], sub: 2, capStart: false, capLen: 0.5 },
      ),
    },
    PART.HL,
  );

  const geometry = b.build();
  return {
    geometry,
    triangles: b.triangleCount,
    coatPale: lin(0xb98850),
    coatDark: lin(0x805a32),
    bone: lin(0xd8d0bc),
    roughness: 0.9,
    fill: 1.5,
    warm: [1.1, 1.0, 0.84],
    neutral: 0.7,
    // from the drone view the pale coat is pulled down a little so a herd reads as tan and white, not a bright smear
    far: { gain: 0.9, rim: 0, hunt: 0, rimCol: [1, 1, 1], d0: 100, d1: 340, tint: [0.4, 0.255, 0.13], mix: 0.28, lowFill: 0.3 },
    params: {
      ...DEFAULT_PARAMS,
      kind: 0,
      comY: 0.78, legL: 0.72,
      // on-screen m/s at 1x: walking herds (0.6 to 5) walk then trot, a flight (10 to 24) is a full gallop
      trot0: 3.0, trot1: 4.0, gal0: 8.0, gal1: 11.0,
      ampW: 0.55, ampT: 0.66, ampG: 1.0,
      dutyW: 0.62, dutyT: 0.5, dutyG: 0.36, dutyGF: 0.25, fast0: 11, fast1: 26,
      kneeW: 0.5, kneeT: 0.8, kneeG: 1.2,
      bobW: 0.012, bobT: 0.03, bobG: 0.08,
      pitchT: 0.02, pitchG: 0.09,
      nodW: 0.05, nodG: 0.06,
      headDown: 1.15, lookYaw: 0.6,
      tailRest: 0, tailRun: -0.4, tailSway: 0.2,
      lieDrop: 0.45, lieHipF: 1.25, lieKneeF: -2.3, lieHipH: -0.8, lieKneeH: 1.6,
      crouchDrop: 0.1,
      deadDrop: 0.38, deadHipF: 0.9, deadHipH: -0.6,
      length: 1.4, height: 1.2, ring: 1.0, minPx: 10, boostLen: 1.4,
    },
  };
}
