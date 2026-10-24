// r-herd-v1: display-only separation of the large quadrupeds near the camera. The sim packs a herd closer than the bodies are long (about 1.6 m
// between bison that are 3 m from nose to tail), which only shows from close by: two animals draw through each other. Each near animal is an
// ellipse on the ground (centre, heading, half length, half width); a few relaxation passes push overlapping pairs apart along the line between
// their centres, by the amount the two ellipses overlap along that line. The push of each animal is capped, and the caller fades it with distance
// from the camera and eases it over time, so nothing pops and the sim never sees it. Pure functions of the inputs, no randomness.

/** The most an animal is ever moved from where the sim and the smoothing put it (m). */
export const SEP_MAX = 2.6;
/** A little air between two bodies (m): the ellipses are a rough fit to the hide, and the shoulder hump and horns stand out of them. */
export const SEP_GAP = 0.12;

const CELL = 4.5;
const HASH = 1024;

export class HerdSep {
  readonly cap: number;
  n = 0;
  /** Base position (x, z), heading (cos, sin) and half length and half width of each body. */
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly ch: Float32Array;
  readonly sh: Float32Array;
  readonly a: Float32Array;
  readonly b: Float32Array;
  /** The caller's own index for each body (its slot). */
  readonly tag: Int32Array;
  /** The result: how far each body is moved (m), after solve(). */
  readonly ox: Float32Array;
  readonly oz: Float32Array;
  private readonly fx: Float32Array;
  private readonly fz: Float32Array;
  private readonly head = new Int32Array(HASH);
  private readonly next: Int32Array;

  constructor(cap = 512) {
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.x = f(); this.z = f(); this.ch = f(); this.sh = f(); this.a = f(); this.b = f();
    this.ox = f(); this.oz = f(); this.fx = f(); this.fz = f();
    this.tag = new Int32Array(cap);
    this.next = new Int32Array(cap);
  }

  begin(): void {
    this.n = 0;
  }

  /** Add a body. Returns false once the buffer is full. */
  add(tag: number, x: number, z: number, h: number, a: number, b: number): boolean {
    const i = this.n;
    if (i >= this.cap) return false;
    this.tag[i] = tag;
    this.x[i] = x; this.z[i] = z;
    this.ch[i] = Math.cos(h); this.sh[i] = Math.sin(h);
    this.a[i] = a; this.b[i] = b;
    this.ox[i] = 0; this.oz[i] = 0;
    this.n = i + 1;
    return true;
  }

  /** Relax the overlaps: `iters` passes, each moving every body by 0.6 of the summed half-overlaps with its neighbours. */
  solve(iters = 3): void {
    const n = this.n;
    if (n < 2) return;
    const { x, z, ch, sh, a, b, ox, oz, fx, fz, head, next } = this;
    for (let it = 0; it < iters; it++) {
      head.fill(-1);
      for (let i = 0; i < n; i++) {
        fx[i] = 0; fz[i] = 0;
        const cx = Math.floor((x[i] + ox[i]) / CELL), cz = Math.floor((z[i] + oz[i]) / CELL);
        const h = ((cx * 73856093) ^ (cz * 19349663)) & (HASH - 1);
        next[i] = head[h];
        head[h] = i;
      }
      for (let i = 0; i < n; i++) {
        const xi = x[i] + ox[i], zi = z[i] + oz[i];
        const cx = Math.floor(xi / CELL), cz = Math.floor(zi / CELL);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gz = cz - 1; gz <= cz + 1; gz++) {
            let j = head[((gx * 73856093) ^ (gz * 19349663)) & (HASH - 1)];
            for (; j >= 0; j = next[j]) {
              if (j <= i) continue;
              const dx = x[j] + ox[j] - xi, dz = z[j] + oz[j] - zi;
              const reach = a[i] + a[j] + SEP_GAP;
              const d2 = dx * dx + dz * dz;
              if (d2 >= reach * reach) continue;
              const d = Math.sqrt(d2);
              // the direction from i to j (a pair on the very same spot is set apart along an arbitrary but fixed line)
              let ux: number, uz: number;
              if (d > 1e-3) { ux = dx / d; uz = dz / d; } else { const t = (i * 2.399 + j * 0.618); ux = Math.cos(t); uz = Math.sin(t); }
              const ov = radius(ux, uz, ch[i], sh[i], a[i], b[i]) + radius(-ux, -uz, ch[j], sh[j], a[j], b[j]) + SEP_GAP - d;
              if (ov <= 0) continue;
              const m = ov * 0.5;
              fx[i] -= ux * m; fz[i] -= uz * m;
              fx[j] += ux * m; fz[j] += uz * m;
            }
          }
        }
      }
      for (let i = 0; i < n; i++) {
        ox[i] += fx[i] * 0.6;
        oz[i] += fz[i] * 0.6;
      }
    }
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(ox[i], oz[i]);
      if (m > SEP_MAX) { const s = SEP_MAX / m; ox[i] *= s; oz[i] *= s; }
    }
  }
}

/** The distance from the centre of an ellipse (heading ch, sh; half length a, half width b) to its rim, along the direction (ux, uz). */
export function radius(ux: number, uz: number, ch: number, sh: number, a: number, b: number): number {
  const c = ux * ch + uz * sh, s = -ux * sh + uz * ch;
  return (a * b) / Math.sqrt(b * b * c * c + a * a * s * s);
}
