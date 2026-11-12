// Render-side randomness and clock, switchable to a deterministic mode for the shot capture (tools/shots.mjs, ?capture=1).
//
// In normal play fxRandom() is Math.random() and fxNow() is performance.now(): behaviour is unchanged. In capture mode
// (fxCaptureMode(true), set once by main.ts) fxRandom() is a seeded mulberry32 that the capture reseeds at the start of every
// shot (fxSeed), and fxNow() is the capture's fixed frame clock (fxSetClock), so nothing drawn depends on wall time or on
// the order of the shots. The sim never uses this module (it has its own seeded RNG).

let capture = false;
let state = 0x9e3779b9;
let clockMs = 0;

/** Turn the deterministic capture mode on or off (main.ts, from ?capture=1). */
export function fxCaptureMode(on: boolean): void {
  capture = on;
}

/** True in the deterministic capture mode. */
export function fxIsCapture(): boolean {
  return capture;
}

/** Reseed the capture RNG (no effect on normal play, where fxRandom is Math.random). */
export function fxSeed(seed: number): void {
  state = seed >>> 0;
}

/** A uniform number in [0, 1): Math.random() in play, a seeded mulberry32 in capture mode. */
export function fxRandom(): number {
  if (!capture) return Math.random();
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Milliseconds: performance.now() in play, the capture's fixed frame clock in capture mode. */
export function fxNow(): number {
  return capture ? clockMs : performance.now();
}

/** Set the capture frame clock (ms). Only read in capture mode. */
export function fxSetClock(ms: number): void {
  clockMs = ms;
}

/** A 32-bit FNV-1a hash of a string (the capture seeds each shot from its id). */
export function fxHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
