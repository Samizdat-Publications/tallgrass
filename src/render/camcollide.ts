// Camera collision: the solid parts of the valley's trees in a spatial hash, so the drone camera can keep out of them.
// Render-only: it reads the Trees layer (crown instance matrices through forEachCrown, trunk positions through getTree) and never
// touches the sim.
//
// Every crown instance (cottonwoods and the spare crowns between them, junipers, willow thickets, shrubs) is the ellipsoid inscribed in
// the bounding box of its geometry, placed by the instance's own matrix and grown a little (K), because lumps and leaf tufts poke past
// the ellipsoid. A trunk is a vertical cylinder from the ground up to where the limbs spread.
import type { TreeSpec } from './trees';

export type CrownKind = 'tree' | 'juniper' | 'thicket' | 'shrub';

export interface TreeSource {
  getTree(id: number): Readonly<TreeSpec> | undefined;
  readonly liveTrees: number;
  forEachCrown(fn: (m: Float32Array, o: number, bounds: readonly number[], kind: CrownKind) => void): void;
}

/**
 * Lumps and leaf tufts poke past the ellipsoid inscribed in the crown's bounding box (shrubs and thickets are lumpier still). Measured on the
 * real crown meshes (tools/camgeo.mjs): the 99th percentile of the vertices lies at 1.07 to 1.2 of the ellipsoid and the farthest at 1.2 to 1.3
 * (junipers 1.33 to 1.4), so 1.2 and 1.3 hold the leaves where 1.1 let the longest lumps through.
 */
const K: Record<CrownKind, number> = { tree: 1.2, juniper: 1.3, thicket: 1.2, shrub: 1.1 };
/** Thickets and shrubs are low, soft and everywhere: they keep the camera a smaller margin away than a tree does. */
const MARGIN_SCALE: Record<CrownKind, number> = { tree: 1, juniper: 1, thicket: 0.55, shrub: 0.4 };
/** Which crowns are solid to the camera. */
const SOLID: Record<CrownKind, boolean> = { tree: true, juniper: true, thicket: false, shrub: false };
/** The id ranges Trees uses: the sim's own trees, far cottonwoods, far junipers, valley junipers, trees planted at run time. */
const ID_RANGES: ReadonlyArray<readonly [number, number]> = [[0, 8192], [1_000_000, 1_000_640], [2_000_000, 2_000_256], [3_000_000, 3_000_064], [5_000_000, 5_002_048]];
const CELL = 16;
/** Where the line test of a boom starts being sampled (the trees are only tested beyond `from`, see ReachOptions). */
const SAMPLE_FROM = 0.3;
/** The lowest the camera goes above the ground (the drone camera clamps to this). */
const CAM_FLOOR = 1.6;

export interface ReachOptions {
  /** Fraction of the boom (from the target) before which crowns and trunks are ignored: the subject may stand under a tree. */
  from?: number;
  /** Clearance (m) kept from a crown or trunk. */
  margin?: number;
}

const cellKey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

export class CameraObstacles {
  // crowns: inverse of the matrix's 3x3 (row major) and translation, local bounds centre and half size (already times K), world scale per local axis
  private n = 0;
  private inv = new Float32Array(0); private fw = new Float32Array(0); private tr3 = new Float32Array(0);
  private bc = new Float32Array(0); private bh = new Float32Array(0); private sc = new Float32Array(0);
  private ms = new Float32Array(0);
  // trunks
  private nt = 0;
  private tx = new Float32Array(0); private tz = new Float32Array(0); private tg = new Float32Array(0); private tt = new Float32Array(0); private tr = new Float32Array(0);
  private cells = new Map<number, number[]>();
  private tcells = new Map<number, number[]>();
  private liveSeen = -1;
  private age = 1e9;
  /** The tallest solid's top above its own ground (m), for the quick "far above any tree" test. */
  maxTop = 30;

  constructor(private src: TreeSource, private ground: (x: number, z: number) => number) {}

  /** Number of solid crowns and trunks in the hash. */
  get count(): number { return this.n + this.nt; }

  /** Keep the hash current: rebuilt when the number of live trees changes, and every few seconds (a fire can char a crown away). */
  tick(dt: number): void {
    this.age += dt;
    if (this.liveSeen < 0 || this.src.liveTrees !== this.liveSeen || this.age > 5) this.rebuild();
  }

  rebuild(): void {
    this.age = 0;
    this.liveSeen = this.src.liveTrees;
    this.cells.clear();
    this.tcells.clear();
    let maxTop = 12;
    // ---- crowns
    const inv: number[] = [], fw: number[] = [], tr3: number[] = [], bc: number[] = [], bh: number[] = [], sc: number[] = [], ms: number[] = [];
    let n = 0;
    this.src.forEachCrown((m, o, b, kind) => {
      if (!SOLID[kind]) return;
      const a0 = m[o], a1 = m[o + 1], a2 = m[o + 2], b0 = m[o + 4], b1 = m[o + 5], b2 = m[o + 6], c0 = m[o + 8], c1 = m[o + 9], c2 = m[o + 10];
      const t0 = m[o + 12], t1 = m[o + 13], t2 = m[o + 14];
      // inverse of the 3x3 with columns a, b, c (cofactors over the determinant)
      const x0 = b1 * c2 - b2 * c1, x1 = b2 * c0 - b0 * c2, x2 = b0 * c1 - b1 * c0;
      const det = a0 * x0 + a1 * x1 + a2 * x2;
      if (Math.abs(det) < 1e-9) return;
      const id = 1 / det;
      // rows of the inverse: b x c, c x a and a x b over the determinant (row i dotted with a world vector gives local axis i)
      const r00 = x0 * id, r01 = x1 * id, r02 = x2 * id;
      const r10 = (c1 * a2 - c2 * a1) * id, r11 = (c2 * a0 - c0 * a2) * id, r12 = (c0 * a1 - c1 * a0) * id;
      const r20 = (a1 * b2 - a2 * b1) * id, r21 = (a2 * b0 - a0 * b2) * id, r22 = (a0 * b1 - a1 * b0) * id;
      const k = K[kind];
      const sx = Math.hypot(a0, a1, a2), sy = Math.hypot(b0, b1, b2), sz = Math.hypot(c0, c1, c2);
      const hx = b[3] * k, hy = b[4] * k, hz = b[5] * k;
      inv.push(r00, r01, r02, r10, r11, r12, r20, r21, r22);
      fw.push(a0, b0, c0, a1, b1, c1, a2, b2, c2);
      tr3.push(t0, t1, t2);
      bc.push(b[0], b[1], b[2]); bh.push(hx, hy, hz); sc.push(sx, sy, sz); ms.push(MARGIN_SCALE[kind]);
      // world centre of the ellipsoid and a radius that holds it, for the hash
      const wx = t0 + a0 * b[0] + b0 * b[1] + c0 * b[2], wy = t1 + a1 * b[0] + b1 * b[1] + c1 * b[2], wz = t2 + a2 * b[0] + b2 * b[1] + c2 * b[2];
      const R = Math.max(hx * sx, hy * sy, hz * sz) + 3;
      maxTop = Math.max(maxTop, wy + hy * sy - this.ground(wx, wz));
      const i0 = Math.floor((wx - R) / CELL), i1 = Math.floor((wx + R) / CELL), j0 = Math.floor((wz - R) / CELL), j1 = Math.floor((wz + R) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const kk = cellKey(i, j);
        const l = this.cells.get(kk); if (l) l.push(n); else this.cells.set(kk, [n]);
      }
      n++;
    });
    this.n = n;
    this.inv = Float32Array.from(inv); this.fw = Float32Array.from(fw); this.tr3 = Float32Array.from(tr3); this.bc = Float32Array.from(bc);
    this.bh = Float32Array.from(bh); this.sc = Float32Array.from(sc); this.ms = Float32Array.from(ms);
    // ---- trunks (every cottonwood and juniper, burned or not: a snag still stands)
    const tx: number[] = [], tz: number[] = [], tg: number[] = [], tt: number[] = [], tw: number[] = [];
    for (const [a, b] of ID_RANGES) {
      let misses = 0;
      for (let id = a; id < b; id++) {
        const s = this.src.getTree(id);
        if (!s) { if (++misses > 2400 && a === 0) break; continue; }
        misses = 0;
        const g = this.ground(s.x, s.z);
        const k = tx.length;
        tx.push(s.x); tz.push(s.z); tg.push(g - 1);
        tt.push(g + (s.species === 'juniper' ? 0.5 : 0.55) * s.h);
        tw.push(s.species === 'juniper' ? 0.3 + 0.02 * s.h : 0.3 + 0.03 * s.h);
        const R = tw[k] + 3;
        for (let i = Math.floor((s.x - R) / CELL); i <= Math.floor((s.x + R) / CELL); i++) for (let j = Math.floor((s.z - R) / CELL); j <= Math.floor((s.z + R) / CELL); j++) {
          const kk = cellKey(i, j);
          const l = this.tcells.get(kk); if (l) l.push(k); else this.tcells.set(kk, [k]);
        }
      }
    }
    this.nt = tx.length;
    this.tx = Float32Array.from(tx); this.tz = Float32Array.from(tz); this.tg = Float32Array.from(tg); this.tt = Float32Array.from(tt); this.tr = Float32Array.from(tw);
    this.maxTop = maxTop;
  }

  /** Is the point inside a crown or trunk, with `m` metres of clearance (less for low thickets and shrubs)? */
  blocked(x: number, y: number, z: number, m: number): boolean {
    const kk = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    const l = this.cells.get(kk);
    if (l) {
      for (let q = 0; q < l.length; q++) {
        const k = l[q], i9 = k * 9, i3 = k * 3;
        const px = x - this.tr3[i3], py = y - this.tr3[i3 + 1], pz = z - this.tr3[i3 + 2];
        const lx = this.inv[i9] * px + this.inv[i9 + 1] * py + this.inv[i9 + 2] * pz - this.bc[i3];
        const ly = this.inv[i9 + 3] * px + this.inv[i9 + 4] * py + this.inv[i9 + 5] * pz - this.bc[i3 + 1];
        const lz = this.inv[i9 + 6] * px + this.inv[i9 + 7] * py + this.inv[i9 + 8] * pz - this.bc[i3 + 2];
        const mm = m * this.ms[k];
        const a = lx / (this.bh[i3] + mm / this.sc[i3]), b = ly / (this.bh[i3 + 1] + mm / this.sc[i3 + 1]), c = lz / (this.bh[i3 + 2] + mm / this.sc[i3 + 2]);
        if (a * a + b * b + c * c < 1) return true;
      }
    }
    const tl = this.tcells.get(kk);
    if (tl) {
      for (let q = 0; q < tl.length; q++) {
        const k = tl[q];
        if (y > this.tt[k] || y < this.tg[k]) continue;
        const dx = x - this.tx[k], dz = z - this.tz[k], r = this.tr[k] + m;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  /**
   * How much of a boom from the target (tx, ty, tz) at heading `yaw` and elevation `pitch` (radians), `len` metres long, is clear: a
   * fraction 0..1 of the length. Only the stretch beyond `from` (default 0.4) is tested against trees. The boundary of the first
   * obstacle is found by bisection.
   */
  reach(tx: number, ty: number, tz: number, yaw: number, pitch: number, len: number, opt: ReachOptions = {}): number {
    const from = opt.from ?? 0.4, m = opt.margin ?? 1.5;
    const free = this.freeTest(tx, ty, tz, yaw, pitch, len, from, m);
    const t0 = Math.min(from, SAMPLE_FROM);
    const step = Math.max(2, (len * (1 - t0)) / 60);
    const n = Math.max(1, Math.ceil((len * (1 - t0)) / step));
    let prev = t0;
    for (let i = 1; i <= n; i++) {
      const t = t0 + (1 - t0) * (i / n);
      if (!free(t)) {
        let lo = prev, hi = t;
        for (let b = 0; b < 6; b++) { const mid = (lo + hi) / 2; if (free(mid)) lo = mid; else hi = mid; }
        // blocked as soon as the tested stretch begins (the subject is inside a grove): the camera comes in until it is in the clear
        if (lo <= from + 0.02) return this.clearBelow(from, free);
        return lo;
      }
      prev = t;
    }
    return 1;
  }

  /**
   * The farthest boom fraction at or below `start` (default the full boom) whose camera point is clear of crowns and trunks, whatever
   * lies between it and the target: for a subject deep in a grove the camera stands outside it (or over it) and looks through the
   * foliage instead of sitting in it. Walks in from `start` along the boom and refines the edge; 0 when no point along it is clear.
   */
  reachPoint(tx: number, ty: number, tz: number, yaw: number, pitch: number, len: number, opt: ReachOptions & { start?: number } = {}): number {
    const free = this.freeTest(tx, ty, tz, yaw, pitch, len, opt.from ?? 0.4, opt.margin ?? 1.5);
    const start = opt.start ?? 1;
    if (free(start, true)) return start;
    const stepT = Math.max(0.01, 1.5 / Math.max(len, 1));
    for (let s = start - stepT; s > 0.1; s -= stepT) {
      if (free(s, true)) {
        let lo = s, hi = s + stepT;
        for (let b = 0; b < 5; b++) { const mid = (lo + hi) / 2; if (free(mid, true)) lo = mid; else hi = mid; }
        return lo;
      }
    }
    return 0; // nowhere along the boom is clear (the target itself is inside a crown's reach): pulling in cannot help
  }

  private freeTest(tx: number, ty: number, tz: number, yaw: number, pitch: number, len: number, from: number, m: number): (t: number, all?: boolean) => boolean {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dx = cp * Math.sin(yaw), dy = sp, dz = cp * Math.cos(yaw);
    return (t: number, all = false): boolean => {
      const L = t * len;
      const x = tx + dx * L, y = ty + dy * L, z = tz + dz * L;
      const g = this.ground(x, z);
      // (the camera is never lower than 1.6 m over the ground, so that is where it would be)
      const yc = Math.max(y, g + CAM_FLOOR);
      // nothing to hit above the tallest tree
      if ((all || t >= from) && yc - g < this.maxTop + m + 2 && this.blocked(x, yc, z, m)) return false;
      return true;
    };
  }

  /** The largest boom fraction at or below `t` whose camera point is free (walking in toward the subject), down to a tenth of the boom. */
  private clearBelow(t: number, free: (t: number, all?: boolean) => boolean): number {
    for (let s = t; s > 0.1; s -= 0.02) if (free(s, true)) return s;
    return 0.1;
  }

  /**
   * Slide a point out of every crown and trunk it is inside (clearance m) and up to minY. Each crown pushes the point radially out of
   * its ellipsoid (in the ellipsoid's own stretched space, so the way out is continuous as the point moves) and each trunk pushes it
   * out sideways; a few rounds settle overlapping crowns. Writes the result to out, returns the distance moved (0: it was free).
   */
  project(x: number, y: number, z: number, m: number, minY: (x: number, z: number) => number, out: { x: number; y: number; z: number }): number {
    const x0 = x, y0 = y, z0 = z;
    for (let it = 0; it < 8; it++) {
      // every obstacle pushes from the same point and the pushes are averaged (taking them one after another lets two overlapping crowns
      // throw the point back and forth, and which one wins then depends on the order and flickers from frame to frame)
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      const kk = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
      const l = this.cells.get(kk);
      if (l) {
        for (let q = 0; q < l.length; q++) {
          const k = l[q], i9 = k * 9, i3 = k * 3;
          const px = x - this.tr3[i3], py = y - this.tr3[i3 + 1], pz = z - this.tr3[i3 + 2];
          const lx = this.inv[i9] * px + this.inv[i9 + 1] * py + this.inv[i9 + 2] * pz - this.bc[i3];
          const ly = this.inv[i9 + 3] * px + this.inv[i9 + 4] * py + this.inv[i9 + 5] * pz - this.bc[i3 + 1];
          const lz = this.inv[i9 + 6] * px + this.inv[i9 + 7] * py + this.inv[i9 + 8] * pz - this.bc[i3 + 2];
          const mm = m * this.ms[k];
          const hx = this.bh[i3] + mm / this.sc[i3], hy = this.bh[i3 + 1] + mm / this.sc[i3 + 1], hz = this.bh[i3 + 2] + mm / this.sc[i3 + 2];
          const nx = lx / hx, ny = ly / hy, nz = lz / hz;
          const r2 = nx * nx + ny * ny + nz * nz;
          if (r2 >= 1) continue;
          const r = Math.sqrt(r2);
          // out along the normalized direction to the surface (straight up when exactly at the centre)
          const k2 = r > 1e-4 ? 1.002 / r : 0;
          const dx = r > 1e-4 ? (nx * k2 - nx) * hx : 0, dy = r > 1e-4 ? (ny * k2 - ny) * hy : hy * 1.002, dz = r > 1e-4 ? (nz * k2 - nz) * hz : 0;
          sx += this.fw[i9] * dx + this.fw[i9 + 1] * dy + this.fw[i9 + 2] * dz;
          sy += this.fw[i9 + 3] * dx + this.fw[i9 + 4] * dy + this.fw[i9 + 5] * dz;
          sz += this.fw[i9 + 6] * dx + this.fw[i9 + 7] * dy + this.fw[i9 + 8] * dz;
          cnt++;
        }
      }
      const tl = this.tcells.get(kk);
      if (tl) {
        for (let q = 0; q < tl.length; q++) {
          const k = tl[q];
          if (y > this.tt[k] || y < this.tg[k]) continue;
          const dx = x - this.tx[k], dz = z - this.tz[k], r = this.tr[k] + m, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          if (d > 1e-4) { sx += (dx / d) * r * 1.002 - dx; sz += (dz / d) * r * 1.002 - dz; } else sx += r;
          cnt++;
        }
      }
      if (cnt > 0) { x += sx / cnt; y += sy / cnt; z += sz / cnt; }
      let moved = cnt > 0;
      const f = minY(x, z);
      if (y < f) { y = f; moved = true; }
      if (!moved) break;
    }
    out.x = x; out.y = y; out.z = z;
    return Math.hypot(x - x0, y - y0, z - z0);
  }

  /**
   * Move a free point `from` toward (x, y, z) the way a body would: in short steps, sliding out of whatever crown or trunk it meets (see
   * project). Because it always starts from a free point and never takes a step longer than a metre, the result moves continuously
   * from frame to frame: a camera whose wanted position is deep inside a crown stays on the crown's surface and slides, it is never
   * thrown out the far side. A point that would stop dead against a crown (the wanted point is straight through its middle) is nudged
   * sideways, toward `slide` (+1 or -1, the side to go round; 0: never nudge), until it is round. Writes the result to `out`; returns true if the
   * wanted point could not be reached.
   */
  sweep(from: { x: number; y: number; z: number }, x: number, y: number, z: number, m: number, minY: (x: number, z: number) => number, slide: number, out: { x: number; y: number; z: number }): boolean {
    let px = from.x, py = from.y, pz = from.z;
    const n = Math.min(60, Math.max(1, Math.ceil(Math.hypot(x - px, y - py, z - pz) / 0.8)));
    for (let i = 0; i < n; i++) {
      const f = 1 / (n - i);
      const wx = (x - px) * f, wy = (y - py) * f, wz = (z - pz) * f;
      this.project(px + wx, py + wy, pz + wz, m, minY, out);
      const gx = out.x - px, gy = out.y - py, gz = out.z - pz;
      const want = Math.hypot(wx, wy, wz);
      // progress along the wanted direction
      if (slide !== 0 && want > 1e-6 && (gx * wx + gy * wy + gz * wz) / want < 0.3 * want) {
        const hl = Math.hypot(wx, wz);
        if (hl > 1e-6) {
          this.project(px + gx - (wz / hl) * want * slide * 1.5, py + gy, pz + gz + (wx / hl) * want * slide * 1.5, m, minY, out);
        }
      }
      px = out.x; py = out.y; pz = out.z;
    }
    out.x = px; out.y = py; out.z = pz;
    return Math.abs(px - x) + Math.abs(py - y) + Math.abs(pz - z) > 1e-3;
  }
}
