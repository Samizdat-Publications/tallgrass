// Shared parts of the two raptor models (eagle.ts, hawk.ts): the wing, built as a broad blade from the shoulder to the end of the hand plus a fan
// of separate primary feathers ("fingers", the slotted wing tip). Everything is authored on the right (+z) and mirrored; the shader (shader.ts,
// `#if RAPTOR`) bends the hand at the wrist, fans the fingers about the hand root and folds the whole wing.
import { PART, pathRings, smooth } from './builder';
import type { MeshBuilder, PaintFn, V3 } from './builder';

export interface FingerSpec {
  root: V3;
  tip: V3;
  /** Half width of the feather. */
  w: number;
}

export interface WingSpec {
  /** Shoulder and wrist pivots (right wing). */
  shoulder: V3;
  wrist: V3;
  /** Mid-chord path of the blade, and [half thickness, half chord] at each point. */
  path: V3[];
  rad: Array<[number, number]>;
  /** The hand bends against the arm between these two z values (the blend of the joint weight). */
  bend: [number, number];
  paint: PaintFn;
  /** Primaries, leading feather first. At most 7. */
  fingers: FingerSpec[];
  fingerPaint: PaintFn;
}

/** The two wings of a raptor: the blade (arm and hand) and its primaries. */
export function addRaptorWings(b: MeshBuilder, s: WingSpec): void {
  // (the builder hands the weight the MIRRORED position: the left arm has z < 0, so the weight reads |z| or that arm never bends at the wrist)
  const wingW1 = (p: V3): number => smooth(s.bend[0], s.bend[1], Math.abs(p[2]));
  b.addPair(
    {
      part: PART.WINGR, piv: s.shoulder, piv2: s.wrist, sides: 8, paint: s.paint, w1: wingW1,
      rings: pathRings(s.path, s.rad, { ref: [0, 1, 0], sub: 2, capLen: 0.5 }),
    },
    PART.WINGL,
  );
  s.fingers.forEach((fg, k) => {
    const mid: V3 = [(fg.root[0] + fg.tip[0]) * 0.5 + 0.004, (fg.root[1] + fg.tip[1]) * 0.5 + 0.004, (fg.root[2] + fg.tip[2]) * 0.5];
    b.addPair(
      {
        part: PART.WINGR, piv: s.shoulder, piv2: s.wrist, sides: 6, paint: s.fingerPaint, w1: () => 1, spare: (k + 1) / 8,
        rings: pathRings([fg.root, mid, fg.tip], [[0.006, fg.w], [0.005, fg.w * 0.96], [0.003, fg.w * 0.45]], { ref: [0, 1, 0], sub: 1, capStart: false, capLen: 0.35 }),
      },
      PART.WINGL,
    );
  });
}

/** A fan of `n` primaries from a common root region: root x runs from `x0` (leading) down by `dx`, tips reach `lens[k]` further out and sweep back. */
export function fingerFan(rootZ: number, y: number, x0: number, dx: number, lens: number[], w: number, sweep: number, tipDrop = 0): FingerSpec[] {
  return lens.map((len, k) => ({
    root: [x0 - dx * k, y, rootZ],
    tip: [x0 - dx * k - sweep * (0.7 + 0.3 * k), y - tipDrop * (k + 1), rootZ + len],
    w,
  }));
}
