// Seeded 2D Perlin noise and fBm. Deterministic, no Math.random.
import { Rng } from './rng';

export class Noise2 {
  private perm = new Uint16Array(512);
  private gx = new Float32Array(256);
  private gy = new Float32Array(256);

  constructor(rng: Rng) {
    const p = new Uint16Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  /** Roughly in [-1, 1]. */
  get(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const pm = this.perm;
    const g00 = pm[X + pm[Y]], g10 = pm[X + 1 + pm[Y]];
    const g01 = pm[X + pm[Y + 1]], g11 = pm[X + 1 + pm[Y + 1]];
    const d00 = this.gx[g00] * xf + this.gy[g00] * yf;
    const d10 = this.gx[g10] * (xf - 1) + this.gy[g10] * yf;
    const d01 = this.gx[g01] * xf + this.gy[g01] * (yf - 1);
    const d11 = this.gx[g11] * (xf - 1) + this.gy[g11] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = d00 + (d10 - d00) * u;
    const b = d01 + (d11 - d01) * u;
    return (a + (b - a) * v) * 1.414;
  }

  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.get(x * freq + o * 17.3, y * freq - o * 9.1);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged fBm in [0, 1], for rocky ridgelines. */
  ridged(x: number, y: number, octaves = 4): number {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.get(x * freq + o * 31.7, y * freq + o * 5.3));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
