// Can this device run Tallgrass? Decided before the heavy engine boots, so a browser that cannot (or a phone) is not made to
// compile shaders first. Pure helpers here (tested in support.test.ts); the DOM cards live in boot.ts.

export type Verdict = 'ok' | 'nowebgl2' | 'phone';

/** The landing page the unsupported cards point to. */
export const LANDING_URL = 'https://tallgrass.pages.dev';

/**
 * A phone or small touch device: a coarse primary pointer and the larger screen side under 900 px. A laptop with a touch
 * screen has a fine pointer as its primary one, and a tablet's larger side is 900 px or more, so neither is caught.
 */
export function isPhoneLike(coarsePointer: boolean, screenW: number, screenH: number): boolean {
  const longSide = Math.max(screenW, screenH);
  return coarsePointer && longSide > 0 && longSide < 900;
}

/** No WebGL2 beats the phone card: nothing here can run without it. */
export function verdictFor(hasWebGL2: boolean, coarsePointer: boolean, screenW: number, screenH: number): Verdict {
  if (!hasWebGL2) return 'nowebgl2';
  return isPhoneLike(coarsePointer, screenW, screenH) ? 'phone' : 'ok';
}

/** Does the browser offer WebGL2? ?nowebgl2=1 forces "no" for tests. The probe context is released straight away. */
export function hasWebGL2(search: string): boolean {
  if (new URLSearchParams(search).get('nowebgl2') === '1') return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function detect(search: string): Verdict {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const sw = window.screen?.width || window.innerWidth;
  const sh = window.screen?.height || window.innerHeight;
  return verdictFor(hasWebGL2(search), coarse, sw, sh);
}
