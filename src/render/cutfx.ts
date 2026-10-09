// The dip at an edit (r-cuts). A documentary cut goes through a soft dark: the picture falls away over about a tenth of a second, the
// director moves the camera while it is dark, and the new shot rises out of it over about a third. The director owns the timing (it waits
// for `dark` before it moves the camera); the engine ticks this once a frame and hands `level` to the finishing pass. Pure state, no GPU.

import { smoothstep } from './common';

/** Seconds the picture takes to fall to dark, and to come back. Together they are the 0.25 to 0.4 s an editor's dip takes. */
export const DIP_OUT = 0.12;
export const DIP_IN = 0.26;

export class CutFx {
  /** Off: the director cuts at once, as before (the `?cuts=0` switch and the unit tests). */
  enabled = true;
  /** Darkness 0..1 for the finishing pass. */
  level = 0;
  private phase: 'idle' | 'out' | 'in' = 'idle';
  private t = 0;

  /** Fully dark: the moment to move the camera. */
  get dark(): boolean { return this.level >= 0.999; }
  get busy(): boolean { return this.phase !== 'idle'; }

  /** Start falling to dark (from whatever is showing now). */
  fadeOut(): void {
    if (!this.enabled) return;
    this.phase = 'out';
    this.t = this.level > 0 ? DIP_OUT * Math.sqrt(this.level) : 0; // (a fade already under way carries on from its level)
  }

  /** Start rising out of dark. */
  fadeIn(): void {
    if (!this.enabled) return;
    this.phase = 'in';
    this.t = 0;
    this.level = 1;
  }

  /** Back to the plain picture at once (the player took the camera: that cut is instant). */
  cancel(): void {
    this.phase = 'idle';
    this.t = 0;
    this.level = 0;
  }

  update(dt: number): void {
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'out') {
      const k = Math.min(1, this.t / DIP_OUT);
      this.level = smoothstep(0, 1, k);
      // (held at full dark until the director fades back in; the director gives up on a dark that nobody uses)
      if (k >= 1) this.level = 1;
    } else {
      const k = Math.min(1, this.t / DIP_IN);
      this.level = 1 - smoothstep(0, 1, k);
      if (k >= 1) { this.level = 0; this.phase = 'idle'; }
    }
  }
}
