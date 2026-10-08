// Snow depth field (V2-PLAN.md S11), render side. The sim sends a 32 x 32 byte grid (Snapshot.snow, row-major by y then x, byte = depth x 255,
// cells of world size / 32) with the vegetation frames, only when params.snowDepth is on. This keeps the displayed copy: each new frame is
// a target, the displayed field eases toward it over about a second of render time so a few frames a second never pop the cover, and a
// single-channel linear-filtered texture (cell centres at (i + 0.5) / 32, the same indexing as the small-prey grid) is shared with the
// terrain and grass shaders through the common uniforms (snowDepthTex). The CPU copy answers the animals' per-position lookup.
import * as THREE from 'three';

export const SNOW_N = 32;

/**
 * Seconds of render time for the displayed field to cover about 95% of the way to a new frame. A few seconds, so that at 10x and 100x, where the
 * sim's snow grows or melts in a handful of frames, the cover still arrives as a visible fade and never pops.
 */
const EASE_SECONDS = 2.4;

export class SnowDepth {
  /** True once a frame has arrived (the field exists only when the sim runs with snowDepth on). */
  on = false;
  readonly tex: THREE.DataTexture;
  /** Displayed depth 0..1 per cell. */
  readonly field = new Float32Array(SNOW_N * SNOW_N);
  private target = new Float32Array(SNOW_N * SNOW_N);
  private bytes = new Uint8Array(SNOW_N * SNOW_N);
  private dirty = false;
  private settled = true;

  constructor(private worldSize: number) {
    this.tex = new THREE.DataTexture(this.bytes, SNOW_N, SNOW_N, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.generateMipmaps = false;
    this.tex.flipY = false;
    this.tex.needsUpdate = true;
  }

  /** A new sim frame (32 x 32 bytes). The first one is taken at once, later ones are eased toward. */
  setTarget(b: Uint8Array): void {
    if (b.length < SNOW_N * SNOW_N) return;
    const t = this.target;
    for (let i = 0; i < t.length; i++) t[i] = b[i] / 255;
    if (!this.on) {
      this.on = true;
      this.field.set(t);
      this.dirty = true;
      this.settled = true;
    } else this.settled = false;
  }

  /** Ease the displayed field toward the latest frame; call once per render frame with the real dt in seconds. */
  update(dt: number): void {
    if (this.on && !this.settled) {
      const k = 1 - Math.exp(-dt * (3 / EASE_SECONDS));
      const f = this.field, t = this.target;
      let max = 0;
      for (let i = 0; i < f.length; i++) {
        const d = t[i] - f[i];
        f[i] += d * k;
        const a = d < 0 ? -d : d;
        if (a > max) max = a;
      }
      if (max < 0.002) { f.set(t); this.settled = true; }
      this.dirty = true;
    }
    if (this.dirty) {
      const f = this.field, by = this.bytes;
      for (let i = 0; i < f.length; i++) by[i] = Math.max(0, Math.min(255, Math.round(f[i] * 255)));
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
  }

  /** Bilinear depth 0..1 at a world position (metres; sim x, y = three x, z); 0 while the field is off. */
  sample(x: number, z: number): number {
    if (!this.on) return 0;
    const n = SNOW_N, cs = this.worldSize / n;
    let fx = x / cs - 0.5, fz = z / cs - 0.5;
    fx = fx < 0 ? 0 : fx > n - 1 ? n - 1 : fx;
    fz = fz < 0 ? 0 : fz > n - 1 ? n - 1 : fz;
    const x0 = Math.min(n - 2, Math.floor(fx)), z0 = Math.min(n - 2, Math.floor(fz));
    const tx = fx - x0, tz = fz - z0;
    const f = this.field, i = z0 * n + x0;
    const a = f[i] + (f[i + 1] - f[i]) * tx;
    const b = f[i + n] + (f[i + n + 1] - f[i + n]) * tx;
    return a + (b - a) * tz;
  }

  dispose(): void {
    this.tex.dispose();
  }
}
