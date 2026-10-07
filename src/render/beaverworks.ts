// Beaver works (WP S14, params `beavers` / `beaver.initial`, both off by default), render side: the dams and the lodges. The sim sends
// `dams` (stride 8: x, y, crest m, state 0 building / 1 holding / 2 breached / 3 abandoned, wall angle rad, wall length m, pond level m,
// colony) and `lodges` (stride 4: x, y, size 0..1, active) with the pond field whenever it changed; nothing is drawn until they arrive.
//
// A dam is a long low ridge of mud and sticks across the creek: a six-point cross-section laid along the wall every 0.8 m that follows
// the ground under it (the ends sink into the banks where the ground rises past the crest), with a few hundred loose sticks along the
// top and the upstream face. A breached dam has a gap blown through it; an abandoned one is just the same ridge, lower as the crest falls.
// A lodge is a dome of mud and crossed sticks that stands out of the pond. Both are plain merged geometry (two draw calls in all),
// rebuilt only when the pond version changes (about once a season while colonies work), lit and shadowed like the rocks.
// Pond water itself is drawn by Water.setPonds, the drowned trees by Trees.setDrowned.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { NOISE_GLSL, SharedUniforms, hash2, injectSafeOutput, injectTerrainShadow, vnoise2 } from './common';

const DAM_STRIDE = 8;
const LODGE_STRIDE = 4;
/** Station spacing along a dam wall (m). */
const STEP = 0.8;
/** How far a dam top stands above the pond surface it holds (m). */
const FREEBOARD = 0.17;

/** Merged geometry under construction: positions, vertex colours (linear) and triangles; normals are computed at the end. */
class Soup {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, r: number, g: number, b: number): number {
    this.pos.push(x, y, z);
    this.col.push(r, g, b);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  /** A thin tapering prism (five sides) from `centre - dir * len / 2` to `centre + dir * len / 2`. `dir` is a unit vector. */
  stick(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, len: number, rad: number, r: number, g: number, b: number): void {
    // any vector not parallel to dir gives the ring's basis
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(dy) > 0.9) { ux = 1; uy = 0; }
    let vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;
    ux = vy * dz - vz * dy; uy = vz * dx - vx * dz; uz = vx * dy - vy * dx;
    const h = len / 2, base = this.pos.length / 3;
    for (let end = 0; end < 2; end++) {
      const s = end === 0 ? -1 : 1, rr = end === 0 ? rad : rad * 0.55;
      const k = end === 0 ? 0.8 : 1;
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2, ca = Math.cos(ang) * rr, sa = Math.sin(ang) * rr;
        this.vert(cx + dx * h * s + ux * ca + vx * sa, cy + dy * h * s + uy * ca + vy * sa, cz + dz * h * s + uz * ca + vz * sa, r * k, g * k, b * k);
      }
    }
    for (let a = 0; a < 5; a++) {
      const a1 = (a + 1) % 5;
      this.tri(base + a, base + a1, base + 5 + a);
      this.tri(base + a1, base + 5 + a1, base + 5 + a);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
    return g;
  }
}

export class BeaverWorks {
  readonly group = new THREE.Group();
  /** Dams and lodges drawn now, for the bench and tests. */
  damCount = 0;
  lodgeCount = 0;
  /** The pond version drawn (-1 none yet). */
  version = -1;
  /** The dam and lodge arrays of the last pond frame (Snapshot.dams, lodges), for the bench and capture scripts. */
  lastDams: Float32Array | null = null;
  lastLodges: Float32Array | null = null;
  lastPonds: Uint8Array | null = null;
  private mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private n: number;
  private cell: number;

  constructor(private world: World, shared: SharedUniforms, private heightAt: (x: number, z: number) => number) {
    this.n = world.n;
    this.cell = world.cell;
    this.group.name = 'beaverworks';
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      injectTerrainShadow(shader, shared);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${NOISE_GLSL}
vec3 tgFragWorldB(){ return cameraPosition + transpose( mat3( viewMatrix ) ) * ( -vViewPosition ); }
void main() {`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // packed mud and woven sticks: lumpy at three scales, with crossing streaks of pale wood where the weave shows through
            vec3 wp = tgFragWorldB();
            float g1 = tgNoise3( wp * vec3( 2.4, 4.0, 2.4 ) );
            float g2 = tgNoise3( wp * 9.0 + 3.0 );
            float g3 = tgNoise3( wp * 33.0 );
            diffuseColor.rgb *= ( 0.5 + 0.9 * g1 ) * ( 0.78 + 0.44 * g2 ) * ( 0.86 + 0.28 * g3 );
            float wA = tgNoise3( vec3( wp.x * 5.5 + wp.z * 2.0, wp.y * 2.4, wp.z * 5.5 - wp.x * 2.0 ) );
            float wB = tgNoise3( vec3( wp.x * 2.0 - wp.z * 5.5, wp.y * 2.4 + 7.0, wp.z * 2.0 + wp.x * 5.5 ) );
            float weave = smoothstep( 0.66, 0.9, max( wA, wB ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.075, 0.052, 0.03 ) * ( 0.6 + 0.8 * g2 ), weave * 0.7 );
          }`,
        );
      shader.fragmentShader = injectSafeOutput(shader.fragmentShader);
    };
    mat.customProgramCacheKey = () => 'tg-beaverworks-v2';
    this.material = mat;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.name = 'beaverworks';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  /**
   * A pond frame (Snapshot.ponds, dams, lodges and pondVersion): rebuild the geometry when the version moved. `ponds` is only used to
   * find the water level at a lodge. Returns true when it rebuilt.
   */
  setField(ponds: Uint8Array | undefined, dams: Float32Array | undefined, lodges: Float32Array | undefined, version: number | undefined): boolean {
    if (version === undefined || version === this.version || !dams) return false;
    this.version = version;
    this.lastDams = dams;
    this.lastLodges = lodges ?? null;
    this.lastPonds = ponds ?? null;
    const soup = new Soup();
    const nd = Math.floor(dams.length / DAM_STRIDE), nl = lodges ? Math.floor(lodges.length / LODGE_STRIDE) : 0;
    for (let k = 0; k < nd; k++) this.addDam(soup, dams, k * DAM_STRIDE, k);
    for (let k = 0; k < nl; k++) this.addLodge(soup, lodges!, k * LODGE_STRIDE, ponds, k);
    const old = this.mesh.geometry;
    this.mesh.geometry = soup.build();
    old.dispose();
    this.damCount = nd;
    this.lodgeCount = nl;
    this.mesh.visible = nd + nl > 0;
    return true;
  }

  /** The water surface (m) at a point: a beaver pond if the last pond frame has water there, else the creek or a generated pond; NaN on dry land. */
  surfaceAt(x: number, z: number): number {
    const n = this.n, cell = this.cell;
    const i = Math.min(n - 1, Math.max(0, Math.floor(x / cell))), j = Math.min(n - 1, Math.max(0, Math.floor(z / cell)));
    const c = j * n + i;
    const d = this.lastPonds ? this.lastPonds[c] : 0;
    if (d >= 12) return this.heightAt((i + 0.5) * cell, (j + 0.5) * cell) + d / 100;
    return this.world.water[c] ? this.world.waterHeight[c] : NaN;
  }

  private levelAt(x: number, z: number, ponds: Uint8Array | undefined): number {
    const g = this.heightAt(x, z);
    if (!ponds) return g;
    const i = Math.min(this.n - 1, Math.max(0, Math.floor(x / this.cell))), j = Math.min(this.n - 1, Math.max(0, Math.floor(z / this.cell)));
    const d = ponds[j * this.n + i];
    return d > 0 ? g + d / 100 : g;
  }

  private addDam(s: Soup, D: Float32Array, o: number, id: number): void {
    const x0 = D[o], z0 = D[o + 1], crest = D[o + 2], state = D[o + 3], ang = D[o + 4], len = Math.max(6, D[o + 5]), level = D[o + 6];
    if (crest < 0.04) return; // not begun: a heap too small to see
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const nx = -dz, nz = dx;
    const top0 = level + FREEBOARD;
    const N = Math.max(3, Math.ceil(len / STEP) + 1);
    // the gap of a breached dam: a notch a fifth of the wall wide, a little off the middle
    const notchAt = (hash2(id, 3, 211) - 0.5) * 0.3 * len;
    const notchW = Math.max(1.8, len * 0.11);
    // cross-section: offsets across the wall as fractions of the base half-width, from the downstream foot to the upstream foot
    const U = [-1, -0.62, -0.3, 0.3, 0.62, 1];
    const rings: number[][] = [];
    for (let k = 0; k < N; k++) {
      const t = -len / 2 + (k * len) / (N - 1);
      // the wall wanders a little off its line, like a built thing
      const wob = (vnoise2(t * 0.21 + id * 7.1, 3.7, 17) - 0.5) * 0.9;
      const px = x0 + dx * t + nx * wob, pz = z0 + dz * t + nz * wob;
      const gc = this.heightAt(px, pz);
      // (the crest always stands above the water it holds: the swell is kept inside the freeboard)
      let top = top0 + (vnoise2(t * 0.55 + id * 3.3, 9.1, 29) - 0.5) * 0.16 + (vnoise2(t * 0.13 + id * 1.7, 2.3, 31) - 0.5) * 0.16;
      if (state === 2) {
        const q = (t - notchAt) / notchW;
        top = Math.min(top, level - crest * 0.5 + (top - level + crest * 0.5) * Math.min(1, q * q));
      }
      const hc = Math.max(0, top - gc);
      const bw = 0.55 + 0.85 * hc;
      const ring: number[] = [];
      for (let m = 0; m < U.length; m++) {
        const u = U[m] * bw;
        const qx = px + nx * u, qz = pz + nz * u;
        const gu = this.heightAt(qx, qz);
        const au = Math.abs(U[m]);
        // height of the wall at this offset: the crest across the middle, sloping to the ground at the foot
        const shoulder = au <= 0.3 ? 1 : 1 - (au - 0.3) / 0.7;
        let y = gu + (top - gu) * Math.max(0, Math.min(1, shoulder));
        if (hc <= 0.02 || au > 0.99) y = gu - 0.1; // the foot sinks into the mud, and where the wall has run into the bank it is gone
        else y = Math.max(y, gu - 0.04);
        // dark mud, drier and paler on the crest, with lumps
        const nz1 = vnoise2(qx * 0.9 + 4, qz * 0.9 - 2, 41), nz2 = vnoise2(qx * 3.1, qz * 3.1, 43);
        const dry = Math.max(0, Math.min(1, (y - level) / 0.4));
        const sh = 0.72 + 0.5 * nz1 + 0.16 * nz2;
        const r = (0.034 + 0.05 * dry) * sh, g = (0.024 + 0.038 * dry) * sh, b = (0.015 + 0.022 * dry) * sh;
        ring.push(s.vert(qx, y + (au < 0.35 ? (nz2 - 0.5) * 0.08 : 0), qz, r, g, b));
      }
      rings.push(ring);
    }
    for (let k = 0; k + 1 < N; k++) {
      const A = rings[k], B = rings[k + 1];
      for (let m = 0; m + 1 < U.length; m++) {
        // wound so the face looks up
        s.tri(A[m], A[m + 1], B[m]);
        s.tri(A[m + 1], B[m + 1], B[m]);
      }
    }
    // sticks: along the crest, laid across and along the wall, with a few poking up out of the upstream face and the notch edges
    const per = Math.max(2, Math.round(len * 6));
    for (let q = 0; q < per; q++) {
      const t = (hash2(id, q, 223) - 0.5) * (len - 1);
      const across = (hash2(id, q, 227) - 0.5) * 1.1;
      const px = x0 + dx * t + nx * across, pz = z0 + dz * t + nz * across;
      const g = this.heightAt(px, pz);
      let top = top0;
      if (state === 2) {
        const qn = (t - notchAt) / notchW;
        top = Math.min(top, level - crest * 0.5 + (top - level + crest * 0.5) * Math.min(1, qn * qn));
      }
      if (top - g < 0.12) continue;
      const slope = Math.abs(across) / 0.55;
      const y = Math.max(g, top - slope * (top - g) * 0.6) + 0.02 + hash2(id, q, 229) * 0.12;
      const yaw = ang + (hash2(id, q, 233) - 0.5) * 2.2 + (hash2(id, q, 239) < 0.3 ? Math.PI / 2 : 0);
      const pitch = (hash2(id, q, 241) - 0.3) * 0.7;
      const L = 0.8 + hash2(id, q, 243) * 1.5;
      const cp = Math.cos(pitch);
      const pale = hash2(id, q, 247) < 0.25;
      const k = 0.6 + 0.8 * hash2(id, q, 249);
      const dryK = 0.7;
      s.stick(px, y, pz, Math.cos(yaw) * cp, Math.sin(pitch), Math.sin(yaw) * cp, L, 0.026 + hash2(id, q, 251) * 0.04,
        (pale ? 0.2 : 0.095) * k * dryK, (pale ? 0.15 : 0.066) * k * dryK, (pale ? 0.09 : 0.04) * k * dryK);
    }
  }

  private addLodge(s: Soup, L: Float32Array, o: number, ponds: Uint8Array | undefined, id: number): void {
    const x0 = L[o], z0 = L[o + 1], size = Math.max(0, Math.min(1, L[o + 2])), active = L[o + 3] > 0.5;
    const level = this.levelAt(x0, z0, ponds);
    const R = 1.7 + 1.9 * size, H = 0.85 + 0.9 * size, sink = 0.4;
    const base = level - sink;
    const SIDES = 20, LATS = 6;
    const rot = hash2(id, 1, 257) * Math.PI * 2;
    const tone = active ? 1 : 0.8;
    const rings: number[][] = [];
    for (let j = 0; j <= LATS; j++) {
      const lat = (j / LATS) * (Math.PI / 2) * 0.93;
      const ring: number[] = [];
      for (let a = 0; a < SIDES; a++) {
        const az = rot + (a / SIDES) * Math.PI * 2;
        const wob = 0.8 + 0.42 * vnoise2(Math.cos(az) * 1.3 + id * 5.1, Math.sin(az) * 1.3 + j * 0.37, 53);
        const rr = R * Math.cos(lat) * wob;
        const px = x0 + Math.cos(az) * rr, pz = z0 + Math.sin(az) * rr;
        const y = base + (H + sink) * Math.sin(lat) * (0.9 + 0.2 * wob);
        const nz1 = vnoise2(px * 1.4, pz * 1.4, 59);
        const k = (0.7 + 0.55 * nz1) * tone;
        const wet = Math.max(0, Math.min(1, (y - level) / 0.5));
        ring.push(s.vert(px, y, pz, (0.03 + 0.04 * wet) * k, (0.021 + 0.03 * wet) * k, (0.013 + 0.017 * wet) * k));
      }
      rings.push(ring);
    }
    for (let j = 0; j < LATS; j++) {
      for (let a = 0; a < SIDES; a++) {
        const a1 = (a + 1) % SIDES;
        s.tri(rings[j][a], rings[j + 1][a], rings[j][a1]);
        s.tri(rings[j][a1], rings[j + 1][a], rings[j + 1][a1]);
      }
    }
    // the crown: a closing cap of the top ring
    const topRing = rings[LATS];
    let cx = 0, cy = 0, cz = 0;
    for (const v of topRing) { cx += s.pos[v * 3]; cy += s.pos[v * 3 + 1]; cz += s.pos[v * 3 + 2]; }
    const c = s.vert(cx / SIDES, cy / SIDES + 0.06, cz / SIDES, 0.06 * tone, 0.045 * tone, 0.03 * tone);
    for (let a = 0; a < SIDES; a++) s.tri(topRing[a], c, topRing[(a + 1) % SIDES]);
    // crossed sticks all over the dome, longer and denser low down
    const count = Math.round(110 + 150 * size);
    for (let q = 0; q < count; q++) {
      const az = rot + hash2(id, q, 263) * Math.PI * 2;
      const lat = hash2(id, q, 269) * 1.35;
      const rr = R * Math.cos(lat) * 0.97;
      const px = x0 + Math.cos(az) * rr, pz = z0 + Math.sin(az) * rr;
      const y = base + (H + sink) * Math.sin(lat) * 0.96;
      if (y < level - 0.02) continue;
      // along the surface, tangent to the dome, in a random heading
      const yaw = hash2(id, q, 271) * Math.PI * 2;
      const tilt = Math.max(0, 0.9 - lat) * 0.5 + (hash2(id, q, 277) - 0.5) * 0.5;
      const cp = Math.cos(tilt);
      const Ln = 1.0 + hash2(id, q, 281) * 1.5;
      const pale = hash2(id, q, 283) < 0.3;
      const k = (0.6 + 0.8 * hash2(id, q, 285)) * tone;
      s.stick(px, y + 0.03, pz, Math.cos(yaw) * cp, Math.sin(tilt), Math.sin(yaw) * cp, Ln, 0.03 + hash2(id, q, 287) * 0.04,
        (pale ? 0.19 : 0.09) * k, (pale ? 0.14 : 0.062) * k, (pale ? 0.085 : 0.038) * k);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
