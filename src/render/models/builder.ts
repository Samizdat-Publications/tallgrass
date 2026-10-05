// Tiny procedural mesh toolkit for the animal models.
// Everything is a lofted "tube" (a stack of elliptical rings) so torsos, necks, legs, tails,
// horns and wings share one code path. Each vertex carries animation data for the vertex shader:
//   aPart  = (part id, joint weight 0..1, coat influence 0..1, spare)
//   aPivot = pivot of the part (hip / neck base / tail root / wing root), model space
//   aPivot2= secondary pivot (knee / hock / elbow)
//   aColor = marking colour (multiplier of the coat colour when coat influence is 1, else absolute)
//   aShade = (baked ambient occlusion darkness 0..1, wool shell flag 0 or the shell layer 0..1, spare). R7: 0 everywhere is "no effect".
//   For a HEAD vertex aPart.y is 1 minus its weight on the head's rotation (0 = a whole head part, up to 1 = still the body), so one
//   continuous loft can run from the shoulders to the nose and bend at the neck without a seam (R7 near LOD).
import * as THREE from 'three';

export type V3 = [number, number, number];
/** r, g, b, coat influence. r/g/b are linear. When influence is 1 they multiply the coat colour. */
export type Paint = [number, number, number, number];
export type PaintFn = (p: V3, n: V3, t: number) => Paint;

export const PART = { BODY: 0, FL: 1, FR: 2, HL: 3, HR: 4, HEAD: 5, TAIL: 6, WINGL: 7, WINGR: 8 } as const;

export interface Ring {
  c: V3;
  /** Unit axis for the up/down extent. */
  u: V3;
  /** Unit axis for the side extent. */
  s: V3;
  up: number;
  down: number;
  side: number;
  /** Superellipse exponent: 2 = ellipse, larger = boxier. */
  sq?: number;
}

export interface TubeOpts {
  rings: Ring[];
  sides?: number;
  part: number;
  piv?: V3;
  piv2?: V3;
  /** Joint weight per vertex (0 = upper bone, 1 = lower bone). */
  w1?: (p: V3, t: number) => number;
  paint: PaintFn | Paint;
  /** Reflect across the XY plane (z -> -z) after construction. */
  mirror?: boolean;
  /** Spare per-vertex tag (aPart.w): the raptor wings number their primary feathers with it. */
  spare?: number;
  /** Part id per vertex instead of a single one (a continuous body, neck and head loft: BODY behind the shoulders, HEAD ahead of them). */
  partOf?: (p: V3, t: number) => number;
  /** Occlusion group: tubes of one group do not occlude each other (a wool shell and the body it covers). Default: a group of its own. */
  group?: number;
  /** Marks a wool shell: its layer 0..1 (the fragment stage cuts it into tufts). Shells neither occlude nor take part in the baked AO. */
  shell?: number;
  /** Pushes each vertex out along its normal by this many metres after the normals are computed (shells). */
  inflate?: (p: V3, n: V3, t: number) => number;
}

export const lin = (hex: number): V3 => {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
};
export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

export interface PathOpts {
  /** Reference vector used to orient the ring's side axis. */
  ref?: V3;
  /** Interpolated samples between control points. */
  sub?: number;
  /** Round the two ends with a small cap (default true). */
  capStart?: boolean;
  capEnd?: boolean;
  /** Cap length as a multiple of the end radius (default 0.9). */
  capLen?: number;
  sq?: number;
}

/**
 * Rings along a Catmull-Rom path. rad[i] = [extent along u, extent along side] at control point i.
 * u = cross(T, s), s = normalize(cross(ref, T)); with ref = (0,1,0) and T along +X, u is up.
 */
export function pathRings(pts: V3[], rad: Array<[number, number]>, o: PathOpts = {}): Ring[] {
  const ref = o.ref ?? [0, 1, 0];
  const nsub = o.sub ?? 3;
  const samples: V3[] = [];
  const radii: Array<[number, number]> = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < nsub; k++) {
      const t = k / nsub;
      samples.push(catmull(p0, p1, p2, p3, t));
      const ts = t * t * (3 - 2 * t);
      radii.push([mix(rad[i][0], rad[i + 1][0], ts), mix(rad[i][1], rad[i + 1][1], ts)]);
    }
  }
  samples.push(pts[n - 1]);
  radii.push(rad[n - 1]);
  const rings: Ring[] = [];
  const frame = (i: number): { s: V3; u: V3; T: V3 } => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    const T = norm(sub(b, a));
    let sv = cross(ref, T);
    if (len(sv) < 1e-3) sv = cross([0, 0, 1], T);
    const s = norm(sv);
    const u = cross(T, s);
    return { s, u, T };
  };
  for (let i = 0; i < samples.length; i++) {
    const f = frame(i);
    rings.push({ c: samples[i], u: f.u, s: f.s, up: radii[i][0], down: radii[i][0], side: radii[i][1], sq: o.sq });
  }
  const capLen = o.capLen ?? 0.9;
  const capRings = (r: Ring, dir: V3): Ring[] => {
    const rr = (r.up + r.down) * 0.5;
    const out: Ring[] = [];
    for (const [off, sc] of [[0.55, 0.83], [0.93, 0.36], [1.0, 0]] as Array<[number, number]>) {
      out.push({
        c: add(r.c, mul(dir, off * rr * capLen)),
        u: r.u, s: r.s, up: r.up * sc, down: r.down * sc, side: r.side * sc, sq: r.sq,
      });
    }
    return out;
  };
  if (o.capEnd !== false) {
    const f = frame(rings.length - 1);
    rings.push(...capRings(rings[rings.length - 1], f.T));
  }
  if (o.capStart !== false) {
    const f = frame(0);
    const caps = capRings(rings[0], mul(f.T, -1)).reverse();
    rings.unshift(...caps);
  }
  return rings;
}

/** Axis-aligned ellipsoid as rings along X (u = Y, s = Z). */
export function blobRings(c: V3, rx: number, ry: number, rz: number, n = 6): Ring[] {
  const rings: Ring[] = [];
  for (let k = 0; k <= n; k++) {
    const phi = (Math.PI * k) / n;
    const sn = Math.sin(phi);
    const f = k === 0 || k === n ? 0 : sn;
    rings.push({
      c: [c[0] - rx * Math.cos(phi), c[1], c[2]],
      u: [0, 1, 0], s: [0, 0, 1], up: ry * f, down: ry * f, side: rz * f,
    });
  }
  return rings;
}

/**
 * Torso-style rings along X from explicit rows: [x, yCenter, up, down, side, sq?]. u = Y, s = Z.
 * Rows are Catmull-Rom subdivided (`sub` samples per span) so vertex-colour markings blend smoothly.
 */
export function torsoRings(rows: Array<[number, number, number, number, number, number?]>, z = 0, sub = 2): Ring[] {
  const n = rows.length;
  const out: Ring[] = [];
  const at = (i: number) => rows[Math.max(0, Math.min(n - 1, i))];
  const cr = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const emit = (r: [number, number, number, number, number, number?]) =>
    out.push({ c: [r[0], r[1], z], u: [0, 1, 0], s: [0, 0, 1], up: r[2], down: r[3], side: r[4], sq: r[5] });
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      if (k === 0) { emit(p1); continue; }
      const f = (j: number) => {
        const v = cr(p0[j] as number, p1[j] as number, p2[j] as number, p3[j] as number, t);
        return j >= 2 ? Math.max(0, v) : v; // radii stay non-negative; x and y centre may be anything
      };
      // keep the pole rings (zero radius) exact at both ends
      emit([f(0), f(1), f(2), f(3), f(4), p1[5]]);
    }
  }
  emit(rows[n - 1]);
  return out;
}

/**
 * One continuous loft along the body's own centre line, for a near-LOD body, neck and head with no part seams. Rows are
 * [x, yCenter, up, down, side, sq?] (the pole rings have zero radii). Catmull-Rom subdivided like torsoRings, but each ring's frame
 * follows the tangent of the centre line (u is perpendicular to it in the XY plane), so a neck that rises or a head that slopes down
 * keeps round cross-sections.
 */
export type SpineRow = [number, number, number, number, number, number?];
export function spineRings(rows: SpineRow[], sub = 3): Ring[] {
  const n = rows.length;
  const at = (i: number) => rows[Math.max(0, Math.min(n - 1, i))];
  const cr = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const samples: Array<[number, number, number, number, number, number | undefined]> = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      if (k === 0) { samples.push([p1[0], p1[1], p1[2], p1[3], p1[4], p1[5]]); continue; }
      const f = (j: number) => {
        const v = cr(p0[j] as number, p1[j] as number, p2[j] as number, p3[j] as number, t);
        return j >= 2 ? Math.max(0, v) : v;
      };
      samples.push([f(0), f(1), f(2), f(3), f(4), p1[5]]);
    }
  }
  const last = rows[n - 1];
  samples.push([last[0], last[1], last[2], last[3], last[4], last[5]]);
  const out: Ring[] = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const r = samples[i];
    out.push({ c: [r[0], r[1], 0], u: [-ty, tx, 0], s: [0, 0, 1], up: r[2], down: r[3], side: r[4], sq: r[5] });
  }
  return out;
}

/** The interpolated [yCenter, up, down, side] of a spine at x (linear between the rows; for placing eyes and horns on the surface). */
export function spineAt(rows: SpineRow[], x: number): [number, number, number, number] {
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
    if (x >= lo && x <= hi) {
      const t = (x - a[0]) / (b[0] - a[0] || 1);
      return [mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3], b[3], t), mix(a[4], b[4], t)];
    }
  }
  const e = Math.abs(x - rows[0][0]) < Math.abs(x - rows[rows.length - 1][0]) ? rows[0] : rows[rows.length - 1];
  return [e[1], e[2], e[3], e[4]];
}

export class MeshBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private prt: number[] = [];
  private pv: number[] = [];
  private pv2: number[] = [];
  private idx: number[] = [];
  private shd: number[] = [];
  /** Occlusion group per vertex, and the spheres (centre, radius, group) every non-shell tube offers to the baked AO. */
  private vgrp: number[] = [];
  private spheres: Array<{ c: V3; r: number; g: number }> = [];
  private nextGroup = 1;

  get vertexCount(): number {
    return this.pos.length / 3;
  }
  get triangleCount(): number {
    return this.idx.length / 3;
  }

  addTube(o: TubeOpts): void {
    const sides = o.sides ?? 10;
    const R = o.rings;
    const nr = R.length;
    const verts: V3[] = [];
    const ringTs: number[] = [];
    const start: number[] = [];
    const pole: boolean[] = [];
    for (let k = 0; k < nr; k++) {
      const r = R[k];
      const isPole = r.up + r.down + r.side < 1e-5;
      start.push(verts.length);
      pole.push(isPole);
      const t = nr > 1 ? k / (nr - 1) : 0;
      if (isPole) {
        verts.push([r.c[0], r.c[1], r.c[2]]);
        ringTs.push(t);
        continue;
      }
      const e = 2 / (r.sq ?? 2);
      for (let i = 0; i < sides; i++) {
        const th = (i / sides) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        const cx = Math.sign(cs) * Math.pow(Math.abs(cs), e);
        const sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
        const ext = sn >= 0 ? r.up : r.down;
        verts.push([
          r.c[0] + r.s[0] * r.side * cx + r.u[0] * ext * sy,
          r.c[1] + r.s[1] * r.side * cx + r.u[1] * ext * sy,
          r.c[2] + r.s[2] * r.side * cx + r.u[2] * ext * sy,
        ]);
        ringTs.push(t);
      }
    }
    // handedness: (s, u, T) right-handed means outward-facing winding (a_i, a_i+1, b_i+1)
    const T = sub(R[nr - 1].c, R[0].c);
    const handed = dot(cross(R[0].s, R[0].u), T) >= 0 ? 1 : -1;
    const flip = (handed < 0) !== !!o.mirror;
    const tris: number[] = [];
    const push = (a: number, b: number, c: number) => {
      if (flip) tris.push(a, c, b);
      else tris.push(a, b, c);
    };
    for (let k = 0; k < nr - 1; k++) {
      const a0 = start[k], b0 = start[k + 1];
      if (pole[k] && pole[k + 1]) continue;
      for (let i = 0; i < sides; i++) {
        const i1 = (i + 1) % sides;
        if (pole[k]) push(a0, b0 + i1, b0 + i);
        else if (pole[k + 1]) push(a0 + i, a0 + i1, b0);
        else {
          push(a0 + i, a0 + i1, b0 + i1);
          push(a0 + i, b0 + i1, b0 + i);
        }
      }
    }
    // normals from faces, area weighted
    const nv = verts.length;
    const nrm = new Float64Array(nv * 3);
    const mz = o.mirror ? -1 : 1;
    const P = (i: number): V3 => [verts[i][0], verts[i][1], verts[i][2] * mz];
    for (let f = 0; f < tris.length; f += 3) {
      const a = P(tris[f]), b = P(tris[f + 1]), c = P(tris[f + 2]);
      const nn = cross(sub(b, a), sub(c, a));
      for (let q = 0; q < 3; q++) {
        const vi = tris[f + q] * 3;
        nrm[vi] += nn[0];
        nrm[vi + 1] += nn[1];
        nrm[vi + 2] += nn[2];
      }
    }
    const base = this.vertexCount;
    const piv: V3 = o.piv ? [o.piv[0], o.piv[1], o.piv[2] * mz] : [0, 0, 0];
    const piv2: V3 = o.piv2 ? [o.piv2[0], o.piv2[1], o.piv2[2] * mz] : piv;
    const group = o.group ?? this.nextGroup++;
    for (let i = 0; i < nv; i++) {
      let p = P(i);
      let n: V3 = norm([nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]]);
      if (!isFinite(n[0])) n = [0, 1, 0];
      const t = ringTs[i];
      if (o.inflate) {
        const k = o.inflate(p, n, t);
        p = [p[0] + n[0] * k, p[1] + n[1] * k, p[2] + n[2] * k];
      }
      const w1 = o.w1 ? o.w1(p, t) : 0;
      const paint: Paint = typeof o.paint === 'function' ? o.paint(p, n, t) : o.paint;
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(paint[0], paint[1], paint[2]);
      this.prt.push(o.partOf ? o.partOf(p, t) : o.part, w1, paint[3], o.spare ?? 0);
      this.pv.push(piv[0], piv[1], piv[2]);
      this.pv2.push(piv2[0], piv2[1], piv2[2]);
      this.shd.push(0, o.shell ?? 0, 0);
      this.vgrp.push(group);
    }
    if (o.shell === undefined) {
      // an occluder for the baked AO: a sphere per ring (a pole ring has none)
      for (let k = 0; k < nr; k++) {
        const r = R[k];
        const rad = (r.up + r.down + r.side * 2) * 0.25;
        if (rad < 0.02) continue;
        this.spheres.push({ c: [r.c[0], r.c[1], r.c[2] * mz], r: rad * 0.9, g: group });
      }
    }
    for (const t of tris) this.idx.push(base + t);
  }

  /**
   * Add a tube authored on the right (+z) side, then its mirror image on the left (-z).
   * `partLeft` overrides the part id of the mirrored copy (e.g. FL vs FR, wing L vs R).
   */
  addPair(o: TubeOpts, partLeft?: number): void {
    this.addTube({ ...o, mirror: false });
    this.addTube({ ...o, mirror: true, part: partLeft ?? o.part });
  }

  /**
   * Baked ambient occlusion into aShade.x (darkness 0..1): sphere occlusion from the other tubes (leg pits, the chest between the
   * forelegs, under the jaw) plus the ground under the belly. `ground` = the height (m) under which down-facing surfaces are
   * shaded by the ground (about the leg length); 0 for none.
   */
  private bakeAO(ground: number): void {
    const nv = this.vertexCount;
    const sph = this.spheres;
    const skin: number[] = [];
    for (let i = 0; i < nv; i++) {
      if (this.shd[i * 3 + 1] > 0) continue; // a shell takes the AO of the skin below it (below)
      skin.push(i);
      const px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2];
      const nx = this.nrm[i * 3], ny = this.nrm[i * 3 + 1], nz = this.nrm[i * 3 + 2];
      const g = this.vgrp[i];
      let occ = 0;
      for (let j = 0; j < sph.length; j++) {
        const s = sph[j];
        if (s.g === g) continue;
        const dx = s.c[0] - px, dy = s.c[1] - py, dz = s.c[2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 9 * s.r * s.r) continue;
        const dl = Math.sqrt(d2) || 1e-6;
        const facing = (nx * dx + ny * dy + nz * dz) / dl;
        if (facing <= 0) continue;
        occ += Math.min(1, (s.r * s.r) / d2) * facing;
      }
      let dark = Math.min(0.6, occ * 0.75);
      if (ground > 0 && ny < 0) dark += 0.7 * -ny * (1 - smooth(0, ground * 1.1, py)) * (1 - dark);
      this.shd[i * 3] = Math.min(0.7, dark);
    }
    for (let i = 0; i < nv; i++) {
      if (this.shd[i * 3 + 1] === 0) continue;
      let best = 1e9, bi = -1;
      for (const j of skin) {
        const dx = this.pos[j * 3] - this.pos[i * 3], dy = this.pos[j * 3 + 1] - this.pos[i * 3 + 1], dz = this.pos[j * 3 + 2] - this.pos[i * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) { best = d; bi = j; }
      }
      this.shd[i * 3] = bi >= 0 ? this.shd[bi * 3] : 0;
    }
  }

  build(o: { ground?: number } = {}): THREE.BufferGeometry {
    this.bakeAO(o.ground ?? 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.prt, 4));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.pv, 3));
    g.setAttribute('aPivot2', new THREE.Float32BufferAttribute(this.pv2, 3));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(this.shd, 3));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Mirror a ring set across z (used for left/right pairs). Positions only; winding is handled by TubeOpts.mirror. */
export function sideZ(v: V3, side: 1 | -1): V3 {
  return [v[0], v[1], v[2] * side];
}
