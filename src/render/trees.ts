// Cottonwoods and shrubs as instanced meshes. Each tree is a bark mesh (trunk, limbs, twigs) plus a crown of
// noise-displaced lumps whose normals are blended toward the crown's outward direction for soft, billowy
// shading. Foliage uses a procedural leaf cut-out so winter leaves thin out to the branch skeleton.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, OCCLUDE_GLSL, SharedUniforms, clamp, fbm2, hash2, injectSafeOutput, injectTerrainShadow, smoothstep, vnoise2 } from './common';
import { Trees3, TREES3_RANGE, TREES3_SWAP0 } from './trees3';

/** 1 while trees3 draws the near range: the lump crowns fade in (screen-door through alpha-to-coverage) over TREES3_SWAP0 .. TREES3_RANGE as trees3 fades out. */
const T3_SWAP = { value: 0 };

/** Floats per tree in Snapshot.trees (sim/trees.ts TREE_STRIDE): x, y, height m, crown radius m, kind, stage. */
const TREE_STRIDE = 6;
const R0 = 6; // nominal crown radius in meters the unit crown is designed for
const H0 = 14; // nominal tree height
const VARIANTS = 6;

/**
 * One silhouette per variant, so a row of cottonwoods is not one model stamped down the creek. Crown: centre height, vertical reach,
 * horizontal spread, lump count and size, sideways offset (crown radius units). Bark: the crown ellipsoid the limbs stay inside
 * (centre height, half width, half height, sideways offset), fork height, primary limbs, how far they lean out, trunk bend.
 */
interface TreeShape {
  cy: number; cyR: number; spread: number; lumps: number; rho: number; ox: number;
  A: number; B: number; C: number; bx: number; fork: number; prim: number; tilt: number; bend: number;
}
const SHAPES: TreeShape[] = [
  { cy: 0.58, cyR: 0.30, spread: 1.0, lumps: 58, rho: 1.0, ox: 0, A: 0.38, B: 0.31, C: 0.58, bx: 0, fork: 0.30, prim: 4, tilt: 1.0, bend: 1.0 },       // the classic round crown
  { cy: 0.63, cyR: 0.37, spread: 0.7, lumps: 50, rho: 0.95, ox: 0, A: 0.27, B: 0.37, C: 0.62, bx: 0, fork: 0.34, prim: 3, tilt: 0.65, bend: 0.8 },     // tall and narrow
  { cy: 0.51, cyR: 0.22, spread: 1.25, lumps: 66, rho: 1.1, ox: 0, A: 0.47, B: 0.24, C: 0.51, bx: 0, fork: 0.23, prim: 5, tilt: 1.3, bend: 1.2 },     // wide, low, spreading
  { cy: 0.57, cyR: 0.28, spread: 1.0, lumps: 46, rho: 1.15, ox: 0.2, A: 0.34, B: 0.3, C: 0.57, bx: 0.08, fork: 0.28, prim: 4, tilt: 1.1, bend: 2.2 },   // lopsided, leaning crown
  { cy: 0.55, cyR: 0.26, spread: 0.92, lumps: 74, rho: 0.86, ox: -0.1, A: 0.36, B: 0.28, C: 0.55, bx: -0.04, fork: 0.32, prim: 4, tilt: 0.9, bend: 0.6 }, // dense dome of small clusters
  { cy: 0.61, cyR: 0.33, spread: 1.06, lumps: 34, rho: 1.22, ox: 0.12, A: 0.39, B: 0.33, C: 0.61, bx: 0.05, fork: 0.27, prim: 4, tilt: 1.15, bend: 1.5 }, // open, gappy old tree
];
const CROWN_DETAIL = 1;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CrownBuild {
  geo: THREE.BufferGeometry;
}

/**
 * Crown in unit space: x,z in crown-radius units, y in height units. A crown is a handful of LOBES (a top crest, a ring of side
 * lobes, a low skirt and a core), each a rounded mass of many small lumps. The leaf-cluster cut-out in the shader turns the lumps into
 * scalloped foliage. Normals bend toward the crown centre and toward the lobe centre, so each lobe shades like a soft dome on top of
 * the crown's own sphere; the AO term is dark where lobes meet (and in the core, and under the skirt) and bright on lobe crests,
 * which is what makes a cottonwood read as a billowing mass instead of a pile of balls.
 */
function buildCrown(seed: number, detail: number, shape: TreeShape, keep = 1, minLumps = 8): CrownBuild {
  const rng = mulberry32(seed * 7919 + 13);
  const cy0 = shape.cy, cyR = shape.cyR;
  interface Lobe { c: THREE.Vector3; r: number; id: number; n: number; core: boolean }
  const lobes: Lobe[] = [];
  const baseN = Math.max(6, Math.round(shape.lumps * 0.165));
  const addLobe = (x: number, yy: number, z: number, r: number, nMul = 1, core = false) => {
    lobes.push({ c: new THREE.Vector3(x + shape.ox, cy0 + yy * cyR, z), r: r * shape.rho, id: lobes.length, n: Math.round(baseN * nMul) + Math.floor(rng() * 3), core });
  };
  const nRing = 4 + Math.floor(rng() * 3);
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < nRing; i++) {
    const a = a0 + (i / nRing) * Math.PI * 2 + (rng() - 0.5) * 0.8;
    const rr = (0.44 + rng() * 0.2) * shape.spread * 0.9;
    addLobe(Math.cos(a) * rr, -0.2 + rng() * 0.55, Math.sin(a) * rr, 0.38 + rng() * 0.16);
  }
  // crest lobes on top
  const nTop = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < nTop; i++) {
    const a = rng() * Math.PI * 2, rr = rng() * 0.26 * shape.spread;
    addLobe(Math.cos(a) * rr, 0.62 + rng() * 0.2, Math.sin(a) * rr, 0.36 + rng() * 0.1, 0.9);
  }
  // low skirt lobes (wide, under the ring), so the crown has a belly and the trunk top is hidden
  const nSkirt = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < nSkirt; i++) {
    const a = rng() * Math.PI * 2, rr = (0.36 + rng() * 0.2) * shape.spread * 0.9;
    addLobe(Math.cos(a) * rr, -0.52 + rng() * 0.12, Math.sin(a) * rr, 0.34 + rng() * 0.1, 0.8);
  }
  // core: dark and dense, so nothing seen through a gap is a bare branch
  addLobe((rng() - 0.5) * 0.2, 0.02, (rng() - 0.5) * 0.2, 0.42, 0.6, true);

  interface Lump { c: THREE.Vector3; rho: number; sx: number; lobe: Lobe; rad: number }
  const lumps: Lump[] = [];
  for (const L of lobes) {
    // lumps on the side of a lobe that faces the crown's centre are buried inside its neighbours: skip most of them (every buried
    // lump is a layer of overdraw for nothing, and the dense crown is the single most expensive thing the tree layer draws)
    const ocx = (L.c.x - shape.ox) * R0, ocy = (L.c.y - cy0) * H0, ocz = L.c.z * R0;
    const ocl = Math.hypot(ocx, ocy, ocz) || 1;
    let made = 0;
    for (let tries = 0; made < L.n && tries < L.n * 5; tries++) {
      let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      if (!L.core && (dx * ocx + dy * ocy + dz * ocz) / ocl < -0.25 && rng() > 0.15) continue;
      made++;
      const rad = (L.core ? 0.2 : 0.42) + (L.core ? 0.7 : 0.58) * Math.pow(rng(), 0.5);
      const stray = rng() < 0.06 ? 1.22 : 1;
      const yy = dy < 0 ? dy * 0.8 : dy;
      lumps.push({
        c: new THREE.Vector3(L.c.x + dx * rad * L.r * stray, L.c.y + yy * rad * L.r * 0.364 * stray, L.c.z + dz * rad * L.r * stray),
        rho: L.r * (0.31 + rng() * 0.14) * (L.core ? 1.2 : 1),
        sx: 0.85 + rng() * 0.4,
        lobe: L,
        rad: L.core ? rad * 0.5 : rad,
      });
    }
  }
  // far LODs keep only the outermost lumps, a little bigger, so a distant crown is a few big bumps (and costs a fraction of the vertices,
  // in the shadow pass too)
  if (keep < 1) {
    lumps.sort((a, b) => b.rad - a.rad);
    lumps.length = Math.max(minLumps, Math.ceil(lumps.length * keep));
    for (const L of lumps) L.rho *= 0.95 / Math.sqrt(keep);
  }

  const ico = new THREE.IcosahedronGeometry(1, detail);
  const ip = ico.getAttribute('position');
  const pos: number[] = [], nrm: number[] = [], occ: number[] = [], lmp: number[] = [];
  const Cw = new THREE.Vector3(shape.ox * R0, cy0 * H0, 0);
  const dir = new THREE.Vector3(), Pw = new THREE.Vector3(), nC = new THREE.Vector3(), nL = new THREE.Vector3(), nw = new THREE.Vector3(), Lw = new THREE.Vector3();
  lumps.forEach((L, li) => {
    Lw.set(L.lobe.c.x * R0, L.lobe.c.y * H0, L.lobe.c.z * R0);
    for (let v = 0; v < ip.count; v++) {
      dir.fromBufferAttribute(ip, v).normalize();
      const n1 = vnoise2(dir.x * 2.1 + dir.z * 1.3 + li * 7.1, dir.y * 2.3 - dir.z * 0.9, seed);
      const n2 = vnoise2(dir.x * 5.3 - dir.y * 2.1, dir.z * 5.1 + dir.y * 3.3 + li, seed + 5);
      const r = L.rho * (1 + 0.42 * (n1 - 0.5) + 0.3 * (n2 - 0.5));
      const px = L.c.x + dir.x * r * L.sx, py = L.c.y + dir.y * r * (R0 / H0) * 0.85, pz = L.c.z + dir.z * r / L.sx;
      pos.push(px, py, pz);
      Pw.set(px * R0, py * H0, pz * R0);
      nC.copy(Pw).sub(Cw);
      const dist = nC.length();
      nC.normalize();
      nL.copy(Pw).sub(Lw).normalize();
      if (L.lobe.core) nL.copy(nC);
      // soft spherical lighting: mostly the crown's own outward direction, a lobe-sized dome on top, a trace of the lump's own
      nw.set(nC.x * 0.42 + nL.x * 0.46 + dir.x * 0.12, nC.y * 0.42 + nL.y * 0.46 + dir.y * 0.12 + 0.2, nC.z * 0.42 + nL.z * 0.46 + dir.z * 0.12).normalize();
      const nu = new THREE.Vector3(nw.x * R0, nw.y * H0, nw.z * R0).normalize();
      nrm.push(nu.x, nu.y, nu.z);
      // inner AO: dark toward the centre and underneath, darker again in the creases where lobes meet, bright on lobe crests
      const shell = clamp(dist / (R0 * 0.95), 0, 1.15);
      const facing = nL.dot(nC);
      const crease = 0.5 + 0.5 * clamp(0.5 + 0.7 * facing, 0, 1);
      const o = (0.05 + 0.8 * Math.pow(shell, 1.45) + 0.3 * nC.y) * crease + 0.15 * nL.y;
      occ.push(clamp(o, 0.04, 1));
      lmp.push((L.lobe.id * 0.6180339) % 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  geo.setAttribute('aLump', new THREE.Float32BufferAttribute(lmp, 1));
  ico.dispose();
  return { geo };
}

/**
 * Juniper (eastern red cedar): a dense, narrow, pointed column of small lumps from the ground up. Unit space as for the crown (x,z in
 * radius units, y in height units 0 to 1), so one instance matrix scales it to a tree; there is no separate bark (the foliage reaches
 * the ground).
 */
function buildJuniperCrown(seed: number, detail: number): THREE.BufferGeometry {
  const rng = mulberry32(seed * 6203 + 29);
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const ip = ico.getAttribute('position');
  const pos: number[] = [], nrm: number[] = [], occ: number[] = [], lmp: number[] = [];
  const dir = new THREE.Vector3(), nw = new THREE.Vector3();
  const N = 50;
  const lumps: { x: number; y: number; z: number; rho: number; t: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = Math.pow(rng(), 0.85);
    const y = 0.05 + 0.9 * t;
    const Rt = 0.92 * Math.pow(1 - t, 0.85) + 0.07;
    const a = rng() * Math.PI * 2, rr = Rt * Math.sqrt(rng()) * 0.86;
    lumps.push({ x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, rho: (0.2 * (1 - t) + 0.1) * (0.8 + 0.5 * rng()), t });
  }
  lumps.push({ x: 0, y: 0.97, z: 0, rho: 0.07, t: 1 }); // a pointed leader
  lumps.forEach((L, li) => {
    for (let v = 0; v < ip.count; v++) {
      dir.fromBufferAttribute(ip, v).normalize();
      const n1 = vnoise2(dir.x * 2.3 + li * 5.3, dir.y * 2.1 + dir.z * 1.1, seed + 3);
      const r = L.rho * (1 + 0.32 * (n1 - 0.5));
      const px = L.x + dir.x * r, py = L.y + dir.y * r * 0.34 * (L.t > 0.9 ? 1.8 : 1), pz = L.z + dir.z * r;
      pos.push(px, py, pz);
      const ox = px * R0, oz = pz * R0;
      const ol = Math.hypot(ox, oz) || 1;
      nw.set((ox / ol) * 0.62 + dir.x * 0.25, 0.28 + dir.y * 0.2, (oz / ol) * 0.62 + dir.z * 0.25).normalize();
      nrm.push(nw.x * R0, nw.y * H0, nw.z * R0);
      const rf = clamp(Math.hypot(px, pz) / (0.92 * Math.pow(1 - L.t, 0.85) + 0.12), 0, 1.1);
      occ.push(clamp(0.12 + 0.85 * Math.pow(rf, 1.1) + 0.12 * L.t, 0.06, 1));
      lmp.push((li * 0.6180339) % 1);
    }
  });
  // the stored normal is in unit space (see crown): rescale to unit length
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  geo.setAttribute('aLump', new THREE.Float32BufferAttribute(lmp, 1));
  ico.dispose();
  return geo;
}


/**
 * Tree skeleton in H units (1 = tree height): a tapered trunk, a fork into primary limbs, then three more generations of
 * branches that get thinner and shorter toward the tips (secondary, tertiary, twigs). Every tip is kept inside the crown
 * ellipsoid. Twigs whose tip lies in the outer shell are flagged (aTw) so the vertex shader can grow them out as the leaves
 * drop: with leaves on, branch tips stay hidden inside the foliage; bare, the full fine silhouette shows.
 * maxLevel picks the LOD: 4 all twigs, 3 no outer twigs, 2 only trunk, limbs and secondaries.
 */
function shellE(x: number, y: number, z: number, s: TreeShape): number {
  const dy = (y - s.C) / s.B;
  const dx = x - s.bx;
  return (dx * dx + z * z) / (s.A * s.A) + dy * dy;
}

function buildTreeBark(seed: number, maxLevel: number, shape: TreeShape, tipsOut?: number[]): THREE.BufferGeometry {
  const rng = mulberry32(seed * 104729 + 7);
  const pos: number[] = [], nrm: number[] = [], tw: number[] = [], bas: number[] = [], idx: number[] = [];
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const randUnit = () => {
    const v = V(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    return v.lengthSq() < 1e-4 ? V(0, 1, 0) : v.normalize();
  };

  // one tapered tube through a polyline; radii per point; flag marks outer twigs that grow with leaf drop
  const tube = (pts: THREE.Vector3[], radii: number[], sides: number, flag: number) => {
    const first = pos.length / 3;
    const n = pts.length;
    let u = V(), v = V();
    for (let i = 0; i < n; i++) {
      const t = (i === 0 ? pts[1].clone().sub(pts[0]) : i === n - 1 ? pts[n - 1].clone().sub(pts[n - 2]) : pts[i + 1].clone().sub(pts[i - 1])).normalize();
      if (i === 0) {
        const ref = Math.abs(t.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
        u = V().crossVectors(t, ref).normalize();
      } else {
        u = u.clone().sub(t.clone().multiplyScalar(u.dot(t))).normalize(); // parallel transport
      }
      v = V().crossVectors(t, u).normalize();
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const c = Math.cos(ang), sn = Math.sin(ang);
        const nx = u.x * c + v.x * sn, ny = u.y * c + v.y * sn, nz = u.z * c + v.z * sn;
        pos.push(pts[i].x + nx * radii[i], pts[i].y + ny * radii[i], pts[i].z + nz * radii[i]);
        nrm.push(nx, ny, nz);
        tw.push(flag);
        bas.push(pts[0].x, pts[0].y, pts[0].z);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a0 = first + i * sides + k, a1 = first + i * sides + ((k + 1) % sides);
        const b0 = a0 + sides, b1 = a1 + sides;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
    }
  };

  // per level: base radius, tip radius, length, radial sides, points
  const LV = [
    null,
    { r0: 0.019, r1: 0.0105, len: 0.3, sides: 5, pts: 3 },
    { r0: 0.0105, r1: 0.0058, len: 0.19, sides: 4, pts: 3 },
    { r0: 0.0058, r1: 0.003, len: 0.115, sides: 4, pts: 2 },
    { r0: 0.003, r1: 0.0008, len: 0.07, sides: 3, pts: 2 },
  ];

  const grow = (p0: THREE.Vector3, dir: THREE.Vector3, level: number, scale: number, rParent: number) => {
    const L = LV[level]!;
    const limit = level >= 3 ? 0.98 : 0.62;
    let len = L.len * scale * (0.8 + rng() * 0.4);
    const r0 = Math.min(L.r0, rParent);
    const r1 = r0 * (L.r1 / L.r0);
    // keep the tip inside the crown (inner generations well inside, so they are hidden behind the foliage)
    let end = p0.clone().addScaledVector(dir, len);
    for (let it = 0; it < 6 && shellE(end.x, end.y, end.z, shape) > limit; it++) {
      len *= 0.78;
      end = p0.clone().addScaledVector(dir, len);
    }
    if (len < L.len * 0.18) return;
    const pts: THREE.Vector3[] = [p0.clone()];
    const radii: number[] = [r0];
    for (let i = 1; i < L.pts; i++) {
      const f = i / (L.pts - 1);
      // gentle sweep: bend upward a little and wander sideways so no limb is a straight stick
      const q = p0.clone().addScaledVector(dir, len * f);
      if (i < L.pts - 1) q.add(randUnit().multiplyScalar(len * 0.07)).y += len * 0.05;
      pts.push(q);
      radii.push(r0 + (r1 - r0) * f);
    }
    const tip = pts[pts.length - 1];
    const outer = shellE(tip.x, tip.y, tip.z, shape) > 0.55;
    tube(pts, radii, maxLevel <= 1 ? 3 : maxLevel <= 2 ? Math.min(L.sides, 4) : L.sides, outer && level >= 3 ? 1 : 0);
    if (tipsOut && outer && level >= 3) tipsOut.push(tip.x, tip.y, tip.z, pts[0].x, pts[0].y, pts[0].z);
    if (level >= maxLevel) return;
    // children: at the tip, and part way along
    const nKids = level === 1 ? 3 : level === 2 ? 2 + (rng() < 0.5 ? 1 : 0) : 2 + (rng() < 0.6 ? 1 : 0);
    const dEnd = tip.clone().sub(pts[pts.length - 2]).normalize();
    for (let c = 0; c < nKids; c++) {
      const t = c === 0 ? 1 : 0.45 + 0.5 * rng();
      const origin = c === 0 ? tip : p0.clone().lerp(tip, t);
      const baseDir = c === 0 ? dEnd : tip.clone().sub(p0).normalize();
      const out = V(origin.x, 0, origin.z);
      if (out.lengthSq() > 1e-6) out.normalize();
      const d = baseDir.clone().multiplyScalar(c === 0 ? 0.55 : 0.4).add(randUnit().multiplyScalar(0.62)).addScaledVector(out, 0.22 + 0.1 * level).add(V(0, 0.1 + 0.03 * level, 0)).normalize();
      grow(origin, d, level + 1, scale * (c === 0 ? 1 : 0.9), radii[Math.min(radii.length - 1, c === 0 ? radii.length - 1 : Math.max(0, radii.length - 2))] * 0.92);
    }
  };

  // trunk: a slight sweep, flaring at the base, forking about a third of the way up
  const bend = V((rng() - 0.5) * 0.05 * shape.bend + shape.bx * 0.25, 0, (rng() - 0.5) * 0.05 * shape.bend);
  const forkY = shape.fork + rng() * 0.04;
  const trunk = [V(0, -0.03, 0), V(bend.x * 0.3, 0.08, bend.z * 0.3), V(bend.x * 0.7, 0.19, bend.z * 0.7), V(bend.x, forkY, bend.z)];
  tube(trunk, [0.046, 0.034, 0.028, 0.024], maxLevel >= 3 ? 8 : maxLevel === 2 ? 6 : 5, 0);
  const fork = trunk[trunk.length - 1];
  const nPrim = shape.prim;
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < nPrim; i++) {
    const a = a0 + (i / nPrim) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const tilt = i === 0 ? 0.18 + rng() * 0.12 : (0.55 + rng() * 0.45) * shape.tilt; // one near-vertical leader, the rest lean out
    const d = V(Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt)).normalize();
    grow(fork, d, 1, i === 0 ? 1.05 : 1, 0.019);
  }
  // a few lower side branches off the trunk for a fuller silhouette when bare
  for (let i = 0; i < 2; i++) {
    const a = rng() * Math.PI * 2;
    const y = 0.2 + rng() * 0.08;
    const o = V(bend.x * (y / forkY), y, bend.z * (y / forkY));
    const d = V(Math.sin(a) * 0.8, 0.55, Math.cos(a) * 0.8).normalize();
    grow(o, d, 2, 1.2, 0.0105);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aTw', new THREE.Float32BufferAttribute(tw, 1));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(bas, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Leaf tufts: one small clump of leaves at the tip of each outer twig (in the bark's own space, so it sits exactly on the twig and
 * sways with it). When the crown is thin, these are the leaves that cling on, as small clusters at the branch tips; the shell lumps of
 * the crown take over from a distance. Each carries its twig's base so it grows out with the twig as the leaves drop.
 */
function buildTufts(tips: number[], seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed * 6151 + 3);
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const ip = ico.getAttribute('position');
  const pos: number[] = [], nrm: number[] = [], occ: number[] = [], lmp: number[] = [], tw: number[] = [], bas: number[] = [];
  const nTips = tips.length / 6;
  const stepK = Math.max(1, Math.floor(nTips / 56));
  const dir = new THREE.Vector3();
  for (let t = 0; t < nTips; t += stepK) {
    const tx = tips[t * 6], ty = tips[t * 6 + 1], tz = tips[t * 6 + 2];
    const bx = tips[t * 6 + 3], by = tips[t * 6 + 4], bz = tips[t * 6 + 5];
    const rnd = rng();
    const rad = 0.02 + rng() * 0.014;
    const ox = (bx - tx) * 0.1, oy = (by - ty) * 0.1 + rad * 0.2, oz = (bz - tz) * 0.1;
    const sx = 0.9 + rng() * 0.4, sy = 0.75 + rng() * 0.35;
    for (let v = 0; v < ip.count; v++) {
      dir.fromBufferAttribute(ip, v).normalize();
      const n = vnoise2(dir.x * 3.1 + t, dir.y * 2.7 - dir.z * 1.3, seed + 9);
      const r = rad * (1 + 0.34 * (n - 0.5));
      pos.push(tx + ox + dir.x * r * sx, ty + oy + dir.y * r * sy, tz + oz + dir.z * r);
      const nx = dir.x * 0.6, ny = dir.y * 0.6 + 0.3, nz = dir.z * 0.6;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / nl, ny / nl, nz / nl);
      occ.push(0.9);
      lmp.push(rnd);
      tw.push(1);
      bas.push(bx, by, bz);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  geo.setAttribute('aLump', new THREE.Float32BufferAttribute(lmp, 1));
  geo.setAttribute('aTw', new THREE.Float32BufferAttribute(tw, 1));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(bas, 3));
  ico.dispose();
  return geo;
}

function buildShrubGeometry(detail: number): THREE.BufferGeometry {
  const rng = mulberry32(991);
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const ip = ico.getAttribute('position');
  const pos: number[] = [], nrm: number[] = [], occ: number[] = [], lmp: number[] = [];
  // a low, irregular tangle: many small lumps spread wide, heights vary, none tall
  const lumps: { c: number[]; r: number; sx: number }[] = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * 0.95;
    const h = 0.16 + 0.34 * (1 - rr) * (0.5 + rng() * 0.7);
    lumps.push({ c: [Math.cos(a) * rr, h, Math.sin(a) * rr * 0.8], r: 0.32 + rng() * 0.26, sx: 0.8 + rng() * 0.6 });
  }
  const dir = new THREE.Vector3(), Pn = new THREE.Vector3();
  lumps.forEach((L, li) => {
    for (let v = 0; v < ip.count; v++) {
      dir.fromBufferAttribute(ip, v).normalize();
      const n1 = vnoise2(dir.x * 2.4 + li * 3.7, dir.y * 2.2 + dir.z * 1.6, 77);
      const n2 = vnoise2(dir.x * 6.3, dir.z * 6.1 + dir.y * 4.0, 78);
      const r = L.r * (1 + 0.3 * (n1 - 0.5) + 0.14 * (n2 - 0.5));
      const px = L.c[0] + dir.x * r * L.sx, py = L.c[1] + dir.y * r * 0.62, pz = L.c[2] + dir.z * r / L.sx;
      pos.push(px, Math.max(py, 0.0), pz);
      Pn.set(px, py - 0.1, pz).normalize();
      nrm.push(dir.x * 0.4 + Pn.x * 0.6, dir.y * 0.4 + Pn.y * 0.6 + 0.2, dir.z * 0.4 + Pn.z * 0.6);
      occ.push(clamp(0.18 + 0.7 * Math.min(1, Math.hypot(px, pz) / 0.85) + 0.3 * Pn.y, 0.1, 1));
      lmp.push((li * 0.618) % 1);
    }
  });
  const nrmN: number[] = [];
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]);
    nrmN.push(nrm[i] / l, nrm[i + 1] / l, nrm[i + 2] / l);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrmN, 3));
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  geo.setAttribute('aLump', new THREE.Float32BufferAttribute(lmp, 1));
  ico.dispose();
  return geo;
}

/**
 * Willow thicket: a tall, dense, vase-shaped mass of many small lumps (3 to 5 m once scaled), narrow at the ground and rounded on top,
 * for the creek banks. Unit space: x,z radius 1, y height 1 (the matrix scales it).
 */
function buildThicketGeometry(detail: number, seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed * 3301 + 17);
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const ip = ico.getAttribute('position');
  const pos: number[] = [], nrm: number[] = [], occ: number[] = [], lmp: number[] = [];
  const lumps: { c: number[]; r: number }[] = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * 0.78;
    const h = 0.2 + 0.72 * Math.pow(1 - rr, 0.9) * (0.55 + 0.55 * rng());
    lumps.push({ c: [Math.cos(a) * rr * (0.6 + 0.5 * h), h, Math.sin(a) * rr * (0.6 + 0.5 * h)], r: 0.17 + 0.14 * rng() + 0.05 * h });
  }
  const dir = new THREE.Vector3(), Pn = new THREE.Vector3();
  lumps.forEach((L, li) => {
    for (let v = 0; v < ip.count; v++) {
      dir.fromBufferAttribute(ip, v).normalize();
      const n1 = vnoise2(dir.x * 2.4 + li * 3.7, dir.y * 2.2 + dir.z * 1.6, 177);
      const n2 = vnoise2(dir.x * 6.3, dir.z * 6.1 + dir.y * 4.0, 178);
      const r = L.r * (1 + 0.5 * (n1 - 0.5) + 0.3 * (n2 - 0.5));
      const px = L.c[0] + dir.x * r, py = L.c[1] + dir.y * r * 0.82, pz = L.c[2] + dir.z * r;
      pos.push(px, Math.max(py, 0), pz);
      Pn.set(px, (py - 0.35) * 0.9, pz).normalize();
      const nx = dir.x * 0.35 + Pn.x * 0.65, ny = dir.y * 0.35 + Pn.y * 0.65 + 0.25, nz = dir.z * 0.35 + Pn.z * 0.65;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / nl, ny / nl, nz / nl);
      occ.push(clamp(0.14 + 0.62 * Math.min(1, Math.hypot(px, pz) / 0.75) + 0.34 * Pn.y + 0.2 * py, 0.1, 1));
      lmp.push((li * 0.618) % 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  geo.setAttribute('aLump', new THREE.Float32BufferAttribute(lmp, 1));
  ico.dispose();
  return geo;
}

// ---------------------------------------------------------------- shader pieces

export function swayChunk(flutter: boolean): string {
  return /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  {
    vec3 tgBase = vec3( instanceMatrix[3] );
    float tgH = length( vec3( instanceMatrix[1] ) );
    float tgY = clamp( transformed.y, 0.0, 1.0 );
    float tgPh = tgBase.x * 0.071 + tgBase.z * 0.053;
    float tgWs = 0.3 + 0.7 * uWind.z;
    float tgGust = sin( uTime * 0.9 + tgPh ) * 0.55 + sin( uTime * 1.9 + tgPh * 2.3 ) * 0.25 + 0.55;
    vec2 tgSway = uWind.xy * tgGust * tgWs + 0.3 * vec2( sin( uTime * 1.3 + tgPh * 1.7 ), cos( uTime * 1.1 + tgPh * 1.1 ) ) * tgWs;
    mvPosition.xz += tgSway * ( 0.03 * tgH * tgY * tgY );
    ${flutter ? 'mvPosition.xyz += objectNormal * ( sin( uTime * 4.5 + dot( mvPosition.xyz, vec3( 1.7, 2.3, 1.1 ) ) ) * 0.05 * tgWs );' : ''}
  }
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  `;
}

export const WORLDPOS_GLSL = /* glsl */ `
vec3 tgFragWorld(){ return cameraPosition + transpose( mat3( viewMatrix ) ) * ( -vViewPosition ); }
`;

type FoliageKind = 'crown' | 'tuft' | 'shrub' | 'willow' | 'juniper';

function foliageMaterial(shared: SharedUniforms, kind: FoliageKind): THREE.MeshStandardMaterial {
  const shrub = kind === 'shrub' || kind === 'willow';
  const willow = kind === 'willow';
  const tuft = kind === 'tuft';
  const evergreen = kind === 'juniper';
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0 });
  // soft cut-out: alpha-to-coverage gives smooth leaf edges on the MSAA scene target instead of screen-door discard
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    injectTerrainShadow(shader, shared);
    const u = shader.uniforms;
    u.uTime = shared.time; u.uWind = shared.wind;
    u.uLeaf = shared.leafAmount; u.uLeafA = shared.leafColorA; u.uLeafB = shared.leafColorB;
    u.uLightDir = shared.lightDir; u.uLightColor = shared.lightColor;
    u.uSnow = shared.snow;
    u.uT3On = T3_SWAP;
    u.uOccCam = shared.occCam; u.uOccFocus = shared.occFocus; u.uOccParams = shared.occParams;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float aOcc;\nattribute float aLump;\nvarying float vOcc;\nvarying float vLump;\nvarying vec3 vObj;\nuniform float uTime;\nuniform vec3 uWind;\n${tuft ? 'attribute float aTw;\nattribute vec3 aBase;\nuniform float uLeaf;\n' : ''}void main() {`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvOcc = aOcc; vLump = aLump; vObj = position;${tuft ? '\ntransformed = mix( aBase, transformed, smoothstep( 0.82, 0.32, uLeaf ) );' : ''}`)
      .replace('#include <project_vertex>', swayChunk(true));
    const cell = willow ? '0.5' : shrub ? '0.42' : evergreen ? '0.36' : '0.5';
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying float vOcc;
        varying float vLump;
        varying vec3 vObj;
        uniform float uLeaf;
        uniform vec3 uLeafA;
        uniform vec3 uLeafB;
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform float uSnow;
        uniform float uT3On;
        ${NOISE_GLSL}
        ${OCCLUDE_GLSL}
        ${WORLDPOS_GLSL}
        vec3 tgSafeNorm( vec3 v ){ return v * inversesqrt( max( dot( v, v ), 1e-10 ) ); }
        vec3 tgHash33(vec3 p){
          p = fract(p * vec3(.1031, .1030, .0973));
          p += dot(p, p.yxz + 33.33);
          return fract((p.xxy + p.yxx) * p.zyx);
        }
        vec3 gTgPuff = vec3(0.0);
        float gTgFine = 0.0;
        void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          gTgShadow = tgSampleTerrainShadow();
          vec3 inst = diffuseColor.rgb; // instance color encodes (brightness, hue shift, season phase)
          vec3 wpw = tgFragWorld();
          float fdist = length( vViewPosition );
          float lod = smoothstep( 50.0, 150.0, fdist );
          float keepRaw = ${evergreen ? '1.0' : `clamp( uLeaf + ( inst.b - 0.5 ) * 0.5 * ( 4.0 * uLeaf * ( 1.0 - uLeaf ) ) ${shrub ? '+ 0.45 * ( 1.0 - uLeaf )' : ''}, 0.0, 1.0 )`};
          // below about 0.1 a cottonwood is bare; in between leaves thin out one by one, not in whole clusters
          float keep = ${shrub || evergreen ? 'keepRaw' : 'smoothstep( 0.1, 0.55, keepRaw )'};
          float rim = 1.0 - abs( dot( tgSafeNorm( vNormal ), tgSafeNorm( vViewPosition ) ) );
          float occC = clamp( vOcc, 0.0, 1.0 );

          // leaf puffs: nearest-point 3D cells in world space (about ${cell} m), each a ROUND clump with a ragged edge, not a polygon
          float fineA = tgNoise3( wpw * 8.5 ), fineB = tgNoise3( wpw * 19.0 );
          float F1 = 9.0;
          vec3 cid = vec3( 0.0 ), crel = vec3( 0.0 );
          float tone = 0.5, puff = 0.5, puffMask = 1.0;
          // (the dark interior of a crown in full leaf is opaque anyway: it needs no leaf-cluster cells)
          if ( lod < 0.999 ${tuft ? '&& false' : shrub ? '' : '&& ( occC > 0.3 || keepRaw < 0.7 )'} ) {
            vec3 pc = wpw / ${cell} - 0.5;
            vec3 ip = floor( pc );
            vec3 fp = pc - ip;
            for ( int k = 0; k <= 1; k++ ) {
              for ( int j = 0; j <= 1; j++ ) {
                for ( int i = 0; i <= 1; i++ ) {
                  vec3 g = vec3( float( i ), float( j ), float( k ) );
                  vec3 o = 0.15 + 0.7 * tgHash33( ip + g );
                  vec3 rv = g + o - fp;
                  float d = dot( rv, rv );
                  if ( d < F1 ) { F1 = d; cid = ip + g; crel = rv; }
                }
              }
            }
            F1 = sqrt( F1 );
            float cr2 = tgHash31( cid + 17.3 );
            tone = cr2;
            puff = 1.0 - clamp( F1 * 1.25, 0.0, 1.0 );
            float rad = mix( ${willow ? '0.8, 1.1' : shrub ? '0.7, 1.0' : evergreen ? '0.96, 1.22' : '1.0, 1.3'}, tgHash31( cid + 3.7 ) );
            float pn = ${shrub ? '( tgNoise3( wpw * 5.0 ) - 0.5 ) * 0.24 + ( tgNoise3( wpw * 13.0 ) - 0.5 ) * 0.2' : '( fineA - 0.5 ) * 0.3 + ( fineB - 0.5 ) * 0.24'};
            puffMask = smoothstep( rad, rad - 0.34, F1 + pn + ${shrub ? '0.0' : 'rim * rim * 0.4'} );
            gTgPuff = -crel;
          }
          // leaves: speckle at leaf scale, dropped by the season and more often at silhouettes and on the dark underside
          float fine = fineA * 0.5 + fineB * 0.5;
          float edgeBias = rim * rim * ${shrub ? '0.5' : '0.3'} + ( 1.0 - occC ) * ${shrub ? '0.12' : '0.07'};
          ${shrub ? `float leafThr = keep * 1.05 - edgeBias;
          float leafMask = smoothstep( leafThr + 0.07, leafThr - 0.07, fine );
          float cover = puffMask * leafMask;` : `// nearly bare: the last leaves cling in small dense clusters (whole puffs, mostly out at the branch tips) instead of drifting
          // down one by one into floating dots; the fuller the tree, the more puffs carry leaves and the thinner each one gets
          float sparse = 1.0 - smoothstep( 0.12, 0.6, keepRaw );
          float alive = smoothstep( 0.1, 0.17, keepRaw );
          float cellR = tgHash31( cid + 41.0 );
          float surv = 0.06 + smoothstep( 0.1, 0.62, keepRaw );
          float cellOn = 1.0 - smoothstep( surv - 0.08, surv + 0.08, cellR );
          float keepEff = mix( keep, 0.7 + 0.3 * keep, sparse );
          float leafThr = keepEff * 1.05 - edgeBias;
          float leafMask = smoothstep( leafThr + 0.07, leafThr - 0.07, fine );
          // up close the shell lumps leave a thin crown to the tufts at the twig tips; the shell clusters only show from a distance
          float shellK = 1.0 - sparse * ( 1.0 - smoothstep( 55.0, 110.0, fdist ) );
          float cover = puffMask * leafMask * mix( 1.0, cellOn, sparse ) * alive * shellK;
          ${tuft ? '' : `{
            // dense interior: lumps inside the crown stay solid while it is in leaf, so no branch or sky shows through the body of the
            // canopy; the cut-out only ragged-edges the outer shell
            float innerK = ( 1.0 - smoothstep( 0.24, 0.62, occC ) ) * smoothstep( 0.55, 0.9, keepRaw ) * alive;
            cover = max( cover, innerK );
          }`}
          ${tuft ? `{
            float tuftOn = 1.0 - smoothstep( 0.4, 0.62, keepRaw );
            float survT = 0.2 + 0.8 * smoothstep( 0.1, 0.45, keepRaw );
            float tuftAlive = 1.0 - smoothstep( survT - 0.06, survT + 0.06, vLump );
            cover = leafMask * alive * tuftOn * tuftAlive;
          }` : ''}`}
          gTgFine = fine;
          // distance: a solid canopy with a soft ragged silhouette (a flat partial alpha dithers into smoke under MSAA)
          float farN = lod > 0.001 ? tgNoise3( wpw * 1.6 + 4.0 ) : 0.5;
          float farCover = ${shrub ? '0.78 * ( 0.05 + 0.95 * keep )' : 'smoothstep( 0.06, 0.45, keepRaw ) * ( 1.0 - 0.85 * smoothstep( 0.62, 1.0, rim + ( farN - 0.5 ) * 0.5 ) )'};
          cover = mix( cover, farCover, lod );
          float fade = tgOcclusionFade( wpw );
          diffuseColor.a = cover * fade${shrub || evergreen ? '' : `* mix( 1.0, smoothstep( ${TREES3_SWAP0.toFixed(1)}, ${TREES3_RANGE.toFixed(1)}, fdist ), uT3On )`};

          float mixT = clamp( 0.5 + ( tone - 0.5 ) * 0.6 + ( inst.g - 0.5 ) * 0.95 + ( vLump - 0.5 ) * ${shrub ? '0.06' : '0.2'}, 0.0, 1.0 );
          ${evergreen ? 'vec3 leaf = mix( vec3( 0.022, 0.05, 0.036 ), vec3( 0.06, 0.115, 0.07 ), mixT );' : shrub ? 'vec3 leaf = mix( uLeafA, uLeafB, mixT );' : `
          // autumn gold: the season's leaf colour ramps from green toward amber (its red-to-green ratio is the season curve), and each
          // tree turns on its own schedule (inst.b), so a grove in early autumn is green with a few trees gone gold
          float tgRatio = uLeafA.r / ( uLeafA.g + 0.01 );
          float autK = smoothstep( 0.86, 1.22, tgRatio );
          float turnT = smoothstep( inst.b * 0.45, inst.b * 0.45 + 0.4, autK );
          float sumW = smoothstep( 0.76, 0.86, tgRatio );
          vec3 lA = mix( uLeafA, vec3( 0.036, 0.064, 0.022 ), sumW );
          vec3 lB = mix( uLeafB, vec3( 0.105, 0.155, 0.03 ), sumW );
          vec3 gA = mix( vec3( 0.34, 0.185, 0.022 ), uLeafA, 0.35 );
          vec3 gB = mix( vec3( 0.66, 0.42, 0.045 ), uLeafB, 0.3 );
          vec3 leaf = mix( mix( lA, gA, turnT ), mix( lB, gB, turnT ), mixT );`}
          // each tree leans a little cooler (blue-green) or warmer (yellow-green), so a grove is not one colour
          leaf *= mix( vec3( 0.9, 1.0, 1.08 ), vec3( 1.12, 1.0, 0.82 ), clamp( inst.b * 0.5 + inst.g * 0.5, 0.0, 1.0 ) );
          // vOcc is interpolated per MSAA pixel center and can overshoot at silhouette pixels: clamp before any pow
          float occ = clamp( vOcc, 0.0, 1.0 );
          float shade = 0.2 + 0.9 * pow( occ, 1.15 );
          // the porthole to the watched point: the interior seen through it is lit like the crown's shell, not black
          shade = mix( shade, max( shade, 0.74 ), tgOcclusionLift( wpw ) * ( 1.0 - lod ) );
          shade *= mix( ${shrub ? '0.8 + 0.34 * puff' : '0.88 + 0.2 * puff'}, 1.0, lod );
          // leaf-scale tonal speckle and a slightly lighter, yellower tip on the sunlit shell
          leaf *= shade * ( 0.76 + 0.2 * ${shrub ? 'tgNoise3( wpw * 2.6 )' : 'tone'} +${shrub ? '0.85' : '0.6'} * ( fine - 0.5 ) + ${shrub ? '0.45' : '0.32'} * ( ${shrub ? 'tgNoise3( wpw * 26.0 )' : 'fineB'} - 0.5 ) + 0.14 * ${shrub ? 'tgNoise3( wpw * 9.0 )' : 'fineA'} ) * inst.r;
          leaf = mix( leaf, leaf * vec3( 1.12, 1.08, 0.78 ), 0.5 * smoothstep( 0.5, 1.0, occ ) * ( 1.0 - lod ) );
          ${shrub ? `{
            // four shrub families picked per bush (inst.g), warm or sage, with the season pulling them toward russet and straw
            vec3 c0 = vec3( 0.2, 0.21, 0.1 );   // sage olive
            vec3 c1 = vec3( 0.1, 0.115, 0.04 );   // olive green
            vec3 c2 = vec3( 0.05, 0.1, 0.028 );     // dark green
            vec3 c3 = vec3( 0.25, 0.16, 0.065 );    // dry brown
            float hh = clamp( inst.g, 0.0, 0.999 ) * 3.0;
            vec3 sb = mix( c0, c1, smoothstep( 0.8, 1.2, hh ) );
            sb = mix( sb, c2, smoothstep( 1.8, 2.2, hh ) );
            sb = mix( sb, c3, smoothstep( 2.5, 2.9, hh ) );
            float autumnK = smoothstep( 1.0, 1.7, uLeafA.r / ( uLeafA.g + 0.01 ) );
            sb = mix( sb, mix( uLeafB, vec3( 0.28, 0.12, 0.04 ), 0.4 ) * 1.1, 0.5 * autumnK );
            sb = mix( sb, vec3( 0.2, 0.15, 0.1 ), 0.55 * ( 1.0 - uLeaf ) );
            ${willow ? `// willow: yellow-green in leaf, gold in autumn, and the thicket stays dense in winter as orange-red stems
            float wAut = smoothstep( 0.9, 1.2, uLeafA.r / ( uLeafA.g + 0.01 ) );
            sb = mix( vec3( 0.04, 0.07, 0.026 ), vec3( 0.095, 0.135, 0.04 ), clamp( tone * 0.7 + inst.g * 0.4, 0.0, 1.0 ) );
            sb = mix( sb, vec3( 0.36, 0.26, 0.045 ), wAut * 0.9 );
            sb = mix( sb, vec3( 0.34, 0.16, 0.06 ), 0.75 * ( 1.0 - smoothstep( 0.1, 0.5, uLeaf ) ) );` : ''}
            leaf = sb * shade * ( 0.8 + 0.4 * tone ) * inst.r * 0.95;
          }` : ''}
          diffuseColor.rgb = mix( leaf, vec3( 0.9, 0.93, 1.0 ), uSnow * 0.5 * smoothstep( 0.3, 0.9, occ ) );
        }`,
      )
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
if ( !( dot( normal, normal ) > 0.25 ) ) normal = vec3( 0.0, 1.0, 0.0 );`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // each leaf cluster shades like its own little dome, with leaf-scale relief from the screen-space slope of the speckle
          float pl = dot( gTgPuff, gTgPuff );
          if ( pl > 1e-4 ) normal = tgSafeNorm( normal + mat3( viewMatrix ) * ( gTgPuff * ( ${shrub ? '0.15' : '0.09'} * inversesqrt( pl ) ) ) );
          vec3 tgSx = dFdx( -vViewPosition ), tgSy = dFdy( -vViewPosition );
          vec3 tgR1 = cross( tgSy, normal ), tgR2 = cross( normal, tgSx );
          float tgDet = dot( tgSx, tgR1 );
          if ( abs( tgDet ) > 1e-10 ) {
            vec3 tgGrad = sign( tgDet ) * ( dFdx( gTgFine ) * tgR1 + dFdy( gTgFine ) * tgR2 );
            normal = tgSafeNorm( abs( tgDet ) * normal - 0.02 * tgGrad );
          }
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Lv = tgSafeNorm( mat3( viewMatrix ) * uLightDir );
          vec3 Vv = tgSafeNorm( vViewPosition );
          float backD = max( dot( -Vv, Lv ), 0.0 );
          float rimT = 1.0 - abs( dot( tgSafeNorm( vNormal ), Vv ) );
          // light through the leaves: strongest where we look toward the sun, and strongest at thin silhouette edges
          float back = pow( backD, 1.7 );
          float wrapB = pow( backD, 0.9 );
          vec3 warm = diffuseColor.rgb * vec3( 1.2, 1.1, 0.62 );
          // backlit translucency: the whole lit shell glows against a low sun (a broad term), and the thin edges glow most (the rim term)
          totalEmissiveRadiance += warm * uLightColor * ( back * ( 0.2 + 0.6 * rimT * rimT ) + 0.04 * wrapB ) * ${evergreen ? '0.5' : '1.0'} * gTgShadow * ( 0.35 + 0.65 * clamp( vOcc, 0.0, 1.0 ) );
          // and a little of the sky seeping through the dark underside so it never goes to flat black
          totalEmissiveRadiance += diffuseColor.rgb * 0.045 * ( 1.0 - clamp( vOcc, 0.0, 1.0 ) );
        }`,
      );
    shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
  };
  mat.customProgramCacheKey = () => `tg-foliage-${kind}-v10`;
  return mat;
}

function barkMaterial(shared: SharedUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#aa9c84'), roughness: 0.96, metalness: 0 });
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    injectTerrainShadow(shader, shared);
    shader.uniforms.uLightDir = shared.lightDir; shader.uniforms.uLightColor = shared.lightColor; shader.uniforms.uSkyMid = shared.skyMid; shader.uniforms.uSkyHorizon = shared.skyHorizon;
    shader.uniforms.uTime = shared.time; shader.uniforms.uWind = shared.wind;
    shader.uniforms.uOccCam = shared.occCam; shader.uniforms.uOccFocus = shared.occFocus; shader.uniforms.uOccParams = shared.occParams;
    shader.uniforms.uLeaf = shared.leafAmount; shader.uniforms.uSnow = shared.snow;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uTime;\nuniform vec3 uWind;\nuniform float uLeaf;\nattribute float aTw;\nattribute vec3 aBase;\nvarying vec3 vBarkPos;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // outer twigs grow out of their base as the leaves drop (hidden inside the foliage while it is thick)
        // (a charred snag, marked by its instance colour, is always bare: every twig fully grown)
        float tgSnag = instanceColor.g < 0.4 ? 1.0 : 0.0;
        float tgGrow = aTw > 0.5 ? max( smoothstep( 0.82, 0.32, uLeaf ), tgSnag ) : 1.0;
        transformed = mix( aBase, transformed, tgGrow );
        vBarkPos = transformed;`)
      .replace('#include <project_vertex>', swayChunk(false));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vBarkPos;\nuniform float uSnow;\nuniform float uLeaf;\nuniform vec3 uLightDir;\nuniform vec3 uLightColor;\nuniform vec3 uSkyMid;\nuniform vec3 uSkyHorizon;\n${NOISE_GLSL}\n${OCCLUDE_GLSL}\n${WORLDPOS_GLSL}\nvoid main() {`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // furrowed bark: vertical streaks, darker toward the base, pale lichen flecks
          float fur = tgNoise3(vec3(vBarkPos.x * 160.0, vBarkPos.y * 12.0, vBarkPos.z * 160.0));
          float fur2 = tgNoise3(vec3(vBarkPos.x * 420.0, vBarkPos.y * 30.0, vBarkPos.z * 420.0));
          float lichen = smoothstep(0.72, 0.9, tgNoise3(vBarkPos * 90.0 + 3.0));
          diffuseColor.rgb *= (0.72 + 0.46 * fur) * (0.9 + 0.2 * fur2);
          // (r-polish28: the lichen is the bark's own colour a little paler and greener, not a pale grey-green mixed in: on the darkened cottonwood bark
          // that mix showed as round white paint splats on every trunk, round 28 item 7)
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.3, 1.4, 1.05) + vec3(0.004, 0.008, 0.0), lichen * 0.45);
          diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 0.25, vBarkPos.y);
          // twigs and thin branches are paler and warmer toward the tips
          // snow dusting: upward-facing surfaces catch it first (upper sides of limbs, the fork), lightly and unevenly
          vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
          float upk = dot( normalize( vNormal ), upV );
          float dust = smoothstep( 0.04, 0.55, uSnow ) * smoothstep( -0.05, 0.7, upk ) * ( 0.55 + 0.45 * tgNoise3( vBarkPos * 55.0 + 9.0 ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.84, 0.88 ), clamp( dust * 1.15, 0.0, 0.92 ) );
          diffuseColor.a = tgOcclusionFadeR( tgFragWorld(), 0.0 ); // (bark: a clean soft edge; the ragged foliage rim read as blocks on a trunk)
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // limbs against a low sun keep a grey-brown body (sky and warm ground bounce, so the shaded side is never soot) and a lit rim where the key light grazes past
          vec3 Lv = normalize( mat3( viewMatrix ) * uLightDir );
          vec3 Vv = normalize( vViewPosition );
          float backD = max( dot( -Vv, Lv ), 0.0 );
          float rimB = 1.0 - abs( dot( normalize( vNormal ), Vv ) );
          // trunks in the shade of their own crown (or lit from behind at dusk) get the sky and the warm ground back as fill, so they
          // stay grey-brown wood and never read as charred black; in full leaf the limbs seen through the gaps sit inside the canopy's
          // own shade: no rim light, less bounce
          float leafK = smoothstep( 0.35, 0.8, uLeaf );
          totalEmissiveRadiance += diffuseColor.rgb * ( ( uSkyMid * 0.42 + uSkyHorizon * 0.34 + uLightColor * 0.03 ) * mix( 1.0, 0.85, leafK ) + uLightColor * pow( backD, 2.0 ) * rimB * rimB * 0.35 * gTgShadow * ( 1.0 - leafK ) );
        }`,
      );
    shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
  };
  mat.customProgramCacheKey = () => 'tg-bark-v10';
  return mat;
}

function swayDepthMaterial(shared: SharedUniforms): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.time; shader.uniforms.uWind = shared.wind;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uTime;\nuniform vec3 uWind;\nvoid main() {')
      .replace('#include <project_vertex>', swayChunk(false));
  };
  mat.customProgramCacheKey = () => 'tg-sway-depth-v1';
  return mat;
}

// ---------------------------------------------------------------- the layer

/** What a tree is, as the layer is told about it. Everything is render-only: positions come from the sim (or the renderer's own dressing). */
export interface TreeSpec {
  x: number; z: number;
  /** Height in metres. */
  h: number;
  /** Nominal crown radius in metres (the sim's `world.trees` radius). */
  r: number;
  species?: 'cottonwood' | 'juniper';
  /** A fire killed it: a charred snag (no crown) for a cottonwood, scorched dark needles for a juniper. */
  burned?: boolean;
  /** Beyond the playable rim: no grove merging with the valley, no understory. */
  far?: boolean;
  /** A seedling or sapling (S13): no understory thicket under it. */
  young?: boolean;
}

const BAND_CROWN = [60, 190, Infinity];
/** Cottonwood bands carry a fourth band that does not cast a shadow: trees past the shadow range (see Trees.setShadowRange) are drawn without it. */
const BAND_CROWN_CW = [60, 190, 400, Infinity];
const BAND_BARK_CW = [48, 140, 400, Infinity];
const CROWN_KEEP = [1, 0.7, 0.4]; // share of a crown's lumps each LOD keeps
const BAND_BARK = [48, 140, Infinity];
const BAND_TUFT = [48];
const BAND_SHRUB = [38, 240, 900];
const BAND_THICKET = [45, 160, 520];
const CHAR = [0.3, 0.26, 0.25]; // instance colour of a snag's bark (the bark shader takes g < 0.4 to mean charred)

/**
 * One family of instances (one tree shape): per-slot matrices and colours, distance LOD buckets for its crown, bark and tuft meshes,
 * and a slot free list so trees can be added and removed at any time without rebuilding a mesh. The capacity doubles when it fills
 * (the meshes keep their identity, only their instance attributes are swapped), so nothing that holds a mesh (the AO exclude list)
 * goes stale.
 */
export class Pool {
  cap: number;
  hi = 0;
  readonly free: number[] = [];
  crownMats: Float32Array; barkMats: Float32Array; cols: Float32Array; barkCols: Float32Array; pos: Float32Array;
  crownOn: Uint8Array; barkOn: Uint8Array; tuftOn: Uint8Array;
  readonly crownMeshes: THREE.InstancedMesh[] = [];
  readonly barkMeshes: THREE.InstancedMesh[] = [];
  tuftMesh: THREE.InstancedMesh | null = null;
  private crownLim2: number[]; private barkLim2: number[];
  /** Move the edge of the last band that still casts a shadow (only pools built with a fourth, shadowless band have one). */
  setShadowCut(d: number): void {
    if (this.crownLim.length < 4) return;
    const c = Math.max(d, this.crownLim[1] + 1), b = Math.max(d, this.barkLim[1] + 1);
    if (c * c === this.crownLim2[2] && b * b === this.barkLim2[2]) return;
    this.crownLim2[2] = c * c; this.barkLim2[2] = b * b;
    this.dirty = true;
  }
  private lastX = 1e9; private lastY = 1e9; private lastZ = 1e9;
  dirty = true;
  live = 0;
  /** Instances nearer than this (squared, m) are not drawn by this pool: another layer (Trees3) draws them. */
  nearSkip2 = 0;
  /** A pool that is switched off draws nothing (the ?trees3 A/B toggle, Trees.setTrees3). */
  off = false;

  constructor(cap: number, private crownLim: number[], private barkLim: number[]) {
    this.cap = cap;
    this.crownMats = new Float32Array(cap * 16); this.barkMats = new Float32Array(cap * 16);
    this.cols = new Float32Array(cap * 3); this.barkCols = new Float32Array(cap * 3); this.pos = new Float32Array(cap * 3);
    this.crownOn = new Uint8Array(cap); this.barkOn = new Uint8Array(cap); this.tuftOn = new Uint8Array(cap);
    this.crownLim2 = crownLim.map((l) => l * l);
    this.barkLim2 = barkLim.map((l) => l * l);
  }

  addMesh(kind: 'crown' | 'bark' | 'tuft', geo: THREE.BufferGeometry, mat: THREE.Material, name: string, shadow: boolean, group: THREE.Group, all: THREE.InstancedMesh[], depth?: THREE.Material): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, this.cap);
    m.name = name;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    if (depth) m.customDepthMaterial = depth;
    m.count = 0;
    group.add(m);
    all.push(m);
    if (kind === 'crown') this.crownMeshes.push(m); else if (kind === 'bark') this.barkMeshes.push(m); else this.tuftMesh = m;
    return m;
  }

  alloc(): number {
    this.live++;
    this.dirty = true;
    const f = this.free.pop();
    if (f !== undefined) return f;
    if (this.hi >= this.cap) this.grow();
    return this.hi++;
  }

  release(slot: number): void {
    this.crownOn[slot] = 0; this.barkOn[slot] = 0; this.tuftOn[slot] = 0;
    this.free.push(slot);
    this.live--;
    this.dirty = true;
  }

  private grow(): void {
    const cap = this.cap * 2;
    const ext = <T extends Float32Array | Uint8Array>(a: T, per: number): T => {
      const b = new (a.constructor as { new (n: number): T })(cap * per);
      b.set(a);
      return b;
    };
    this.crownMats = ext(this.crownMats, 16); this.barkMats = ext(this.barkMats, 16);
    this.cols = ext(this.cols, 3); this.barkCols = ext(this.barkCols, 3); this.pos = ext(this.pos, 3);
    this.crownOn = ext(this.crownOn, 1); this.barkOn = ext(this.barkOn, 1); this.tuftOn = ext(this.tuftOn, 1);
    this.cap = cap;
    for (const m of [...this.crownMeshes, ...this.barkMeshes, ...(this.tuftMesh ? [this.tuftMesh] : [])]) {
      m.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.dirty = true;
    this.lastX = 1e9;
  }

  update(cam: THREE.Vector3, force: boolean): void {
    const m = Math.abs(cam.x - this.lastX) + Math.abs(cam.y - this.lastY) + Math.abs(cam.z - this.lastZ);
    if (!force && !this.dirty && m < 2.5 + cam.y * 0.02) return;
    this.dirty = false;
    this.lastX = cam.x; this.lastY = cam.y; this.lastZ = cam.z;
    const nc = this.crownMeshes.length, nb = this.barkMeshes.length;
    const fc = new Int32Array(nc), fb = new Int32Array(nb);
    let ft = 0;
    const cm = this.crownMats, bm = this.barkMats, cols = this.cols, bcols = this.barkCols, pos = this.pos;
    const tm = this.tuftMesh;
    const tuftLim2 = BAND_TUFT[0] * BAND_TUFT[0];
    for (let i = 0; i < this.hi; i++) {
      const co = this.crownOn[i], bo = this.barkOn[i], to = this.tuftOn[i];
      if (!(co | bo | to)) continue;
      const dx = pos[i * 3] - cam.x, dy = pos[i * 3 + 1] - cam.y, dz = pos[i * 3 + 2] - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (this.off || d2 < this.nearSkip2) continue;
      if (co) {
        let l = 0;
        while (l < nc && d2 >= this.crownLim2[l]) l++;
        if (l < nc) {
          const mesh = this.crownMeshes[l], k = fc[l]++;
          (mesh.instanceMatrix.array as Float32Array).set(cm.subarray(i * 16, i * 16 + 16), k * 16);
          (mesh.instanceColor!.array as Float32Array).set(cols.subarray(i * 3, i * 3 + 3), k * 3);
        }
      }
      if (bo) {
        let l = 0;
        while (l < nb && d2 >= this.barkLim2[l]) l++;
        if (l < nb) {
          const mesh = this.barkMeshes[l], k = fb[l]++;
          (mesh.instanceMatrix.array as Float32Array).set(bm.subarray(i * 16, i * 16 + 16), k * 16);
          (mesh.instanceColor!.array as Float32Array).set(bcols.subarray(i * 3, i * 3 + 3), k * 3);
        }
      }
      if (to && tm && d2 < tuftLim2) {
        (tm.instanceMatrix.array as Float32Array).set(bm.subarray(i * 16, i * 16 + 16), ft * 16);
        (tm.instanceColor!.array as Float32Array).set(cols.subarray(i * 3, i * 3 + 3), ft * 3);
        ft++;
      }
    }
    for (let l = 0; l < nc; l++) { const mesh = this.crownMeshes[l]; mesh.count = fc[l]; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; }
    for (let l = 0; l < nb; l++) { const mesh = this.barkMeshes[l]; mesh.count = fb[l]; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; }
    if (tm) { tm.count = ft; tm.instanceMatrix.needsUpdate = true; tm.instanceColor!.needsUpdate = true; }
  }
}

interface Part { pool: Pool; slot: number; /** The trees3 willow twin of an old thicket instance. */ twin?: Part }
interface Rec { id: number; spec: TreeSpec; part: Part; under: Part[]; grove: number }

const ID_FAR = 1_000_000, ID_FAR_JUNIPER = 2_000_000, ID_VALLEY_JUNIPER = 3_000_000, ID_GROVE = 4_000_000, ID_NEW = 5_000_000;

export class Trees {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
  treeCount = 0;
  shrubCount = 0;
  rockCount = 0;
  /** Render-only dressing counts (for the bench and the log): added crowns that fill grove gaps, willow thickets, junipers. */
  fillerCount = 0;
  junipers = 0;
  get thicketCount(): number { return this.thick.reduce((s, p) => s + p.live, 0); }
  private crownsShown = true;
  private tuftsShown = true;
  private disposables: { dispose(): void }[] = [];
  private pools: Pool[] = [];
  /** Branching cottonwoods for the near and mid range (default on, ?trees3=0 for the lump trees; see trees3.ts); null when off. */
  private t3: Trees3 | null = null;
  /** trees3 willow thickets: one pool per variant, each thicket also has an instance here (twin of its lump thicket). */
  private thick3: Pool[] = [];
  private cw: Pool[] = [];
  private jun: Pool[] = [];
  private thick: Pool[] = [];
  private shrubPool: Pool | null = null;
  private recs = new Map<number, Rec>();
  private grid = new Map<number, number[]>();
  private nextId = ID_NEW;
  /** How many of the player's planted-grove trees (S17) are standing, ids ID_GROVE + k. */
  private groveN = 0;
  /** S13 dynamic trees: set once the sim sends its list (then the renderer's own fire hook and the groves field stay out of it), the version drawn, slots seen. */
  private dynamic = false;
  private dynVersion = -1;
  private dynN = 0;
  /** Planted-grove trees standing (S17), for the bench and tests. */
  get groveCount(): number { return this.groveN; }
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private dressing: Part[] = [];
  private world: World;
  private heightAt: (x: number, z: number) => number;

  constructor(world: World, shared: SharedUniforms, heightAt: (x: number, z: number) => number) {
    this.world = world;
    this.heightAt = heightAt;
    this.group.name = 'trees';
    this.dummy.rotation.order = 'YXZ';
    const foliageMat = foliageMaterial(shared, 'crown');
    const tuftMat = foliageMaterial(shared, 'tuft');
    const shrubMat = foliageMaterial(shared, 'shrub');
    const willowMat = foliageMaterial(shared, 'willow');
    const juniperMat = foliageMaterial(shared, 'juniper');
    const bark = barkMaterial(shared);
    const depthMat = swayDepthMaterial(shared);
    this.disposables.push(foliageMat, tuftMat, shrubMat, willowMat, juniperMat, bark, depthMat);

    // ---- tree list: the valley's own trees (ids are the sim's tree indices), then distant groves and lone trees beyond the rim
    const specs: { id: number; spec: TreeSpec }[] = [];
    const sp = (world as { treeSpecies?: ArrayLike<number> }).treeSpecies; // hook: a per-tree species flag from the sim (0 cottonwood, 1 juniper)
    for (let i = 0; i < world.trees.length; i += 4) {
      specs.push({ id: i / 4, spec: { x: world.trees[i], z: world.trees[i + 1], h: world.trees[i + 2], r: world.trees[i + 3], species: sp && sp[i / 4] === 1 ? 'juniper' : 'cottonwood' } });
    }
    const S = world.size;
    // Far trees stand where a real prairie keeps them: in groves along the draws and in the lee of the ridges, a few lone trees on
    // the open ground between, never in a regular scatter. Groves are 2 to 11 trees of mixed height packed within about 20 m; the
    // density thins out toward the horizon and steep bluffs stay bare.
    const R = 1700, FAR_MAX = 500;
    let farCount = 0;
    for (let k = 0; k < 40000 && farCount < FAR_MAX; k++) {
      const x = -R + hash2(k, 1, 71) * (S + 2 * R);
      const z = -R + hash2(k, 2, 71) * (S + 2 * R);
      const ox = Math.max(-x, x - S, 0), oz = Math.max(-z, z - S, 0);
      const d = Math.hypot(ox, oz);
      if (d < 26) continue;
      const draw = 1 - Math.abs(2 * fbm2(x * 0.0046 + 9.1, z * 0.0046 - 4.3, 3, 7) - 1);
      const patch = fbm2(x * 0.0125 + 3, z * 0.0125 - 9, 3, 5);
      const dens = (smoothstep(0.62, 0.9, draw) * 0.85 + smoothstep(0.62, 0.78, patch) * 0.4) * (1 - 0.6 * smoothstep(900, 1700, d));
      if (hash2(k, 3, 71) > dens * 0.55) continue;
      const h0 = heightAt(x, z);
      const sl = Math.hypot(heightAt(x + 14, z) - heightAt(x - 14, z), heightAt(x, z + 14) - heightAt(x, z - 14)) / 28;
      if (sl > 0.42) continue;
      // in the lee: lower than the ground about 40 m around it
      const avg = 0.25 * (heightAt(x + 40, z) + heightAt(x - 40, z) + heightAt(x, z + 40) + heightAt(x, z - 40));
      if (h0 > avg + 3 && hash2(k, 8, 71) < 0.7) continue;
      const lone = hash2(k, 9, 71) < 0.22;
      const nTrees = lone ? 1 : 2 + Math.floor(Math.pow(hash2(k, 6, 71), 1.4) * 10);
      const rad = 5 + hash2(k, 7, 71) * 15;
      for (let m = 0; m < nTrees && farCount < FAR_MAX; m++) {
        const a = hash2(k, 10 + m, 71) * Math.PI * 2, rr = Math.sqrt(hash2(k, 40 + m, 71)) * rad * (lone ? 0 : 1);
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        const h = 8.5 + Math.pow(hash2(k, 70 + m, 71), 1.3) * 15.5;
        specs.push({ id: ID_FAR + farCount, spec: { x: px, z: pz, h, r: h * (0.34 + hash2(k, 90 + m, 71) * 0.26), far: true } });
        farCount++;
      }
    }
    // r-edge-v1: the ring just beyond the square (the land the map view and the wide views look out over) carries its own denser groves along
    // the draws, so the valley's border fades into more prairie with its own wooded low ground instead of into bare ground. The same draw
    // field as above, a lower bar, a firmer pull toward low ground, and a thinning toward the outer edge of the ring (the sparse far scatter
    // above takes over from there). Each tree is the same far tree (lump crown at range, same seasons), so nothing new is drawn.
    {
      const NEAR_R = 460, NEAR_MAX = 650;
      let nearCount = 0;
      for (let k = 0; k < 90000 && nearCount < NEAR_MAX; k++) {
        const x = -NEAR_R + hash2(k, 1, 73) * (S + 2 * NEAR_R);
        const z = -NEAR_R + hash2(k, 2, 73) * (S + 2 * NEAR_R);
        const ox = Math.max(-x, x - S, 0), oz = Math.max(-z, z - S, 0);
        const d = Math.hypot(ox, oz);
        if (d < 30 || d > NEAR_R) continue;
        const draw = 1 - Math.abs(2 * fbm2(x * 0.0046 + 9.1, z * 0.0046 - 4.3, 3, 7) - 1);
        const draw2 = 1 - Math.abs(2 * fbm2(x * 0.0093 - 2.7, z * 0.0093 + 6.6, 3, 19) - 1);
        const patch = fbm2(x * 0.0125 + 3, z * 0.0125 - 9, 3, 5);
        const dens = (smoothstep(0.5, 0.8, draw) * 0.7 + smoothstep(0.62, 0.86, draw2) * 0.5 + smoothstep(0.6, 0.76, patch) * 0.35) * (1 - 0.55 * smoothstep(300, NEAR_R, d)) * smoothstep(30, 60, d);
        if (hash2(k, 3, 73) > dens * 0.85) continue;
        const h0 = heightAt(x, z);
        const sl = Math.hypot(heightAt(x + 14, z) - heightAt(x - 14, z), heightAt(x, z + 14) - heightAt(x, z - 14)) / 28;
        if (sl > 0.46) continue;
        const avg = 0.25 * (heightAt(x + 40, z) + heightAt(x - 40, z) + heightAt(x, z + 40) + heightAt(x, z - 40));
        if (h0 > avg + 2 && hash2(k, 8, 73) < 0.8) continue;
        const lone = hash2(k, 9, 73) < 0.14;
        const nTrees = lone ? 1 : 3 + Math.floor(Math.pow(hash2(k, 6, 73), 1.3) * 8);
        const rad = 6 + hash2(k, 7, 73) * 16;
        for (let m = 0; m < nTrees && nearCount < NEAR_MAX; m++) {
          const a = hash2(k, 10 + m, 73) * Math.PI * 2, rr = Math.sqrt(hash2(k, 40 + m, 73)) * rad * (lone ? 0 : 1);
          const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
          const h = 8 + Math.pow(hash2(k, 70 + m, 73), 1.3) * 15;
          specs.push({ id: ID_FAR + 5000 + nearCount, spec: { x: px, z: pz, h, r: h * (0.34 + hash2(k, 90 + m, 73) * 0.26), far: true } });
          nearCount++;
        }
      }
    }
    // Junipers (eastern red cedar) keep to ridges and uplands: dark conical groups on the bluffs, never in the draws. Far ones beyond
    // the rim, and a few small stands in the valley on dry ridge ground away from water and away from the cottonwoods.
    {
      let jc = 0;
      for (let k = 0; k < 30000 && jc < 190; k++) {
        const x = -R + hash2(k, 1, 83) * (S + 2 * R);
        const z = -R + hash2(k, 2, 83) * (S + 2 * R);
        const ox = Math.max(-x, x - S, 0), oz = Math.max(-z, z - S, 0);
        const d = Math.hypot(ox, oz);
        if (d < 30 || d > 1300) continue;
        const h0 = heightAt(x, z);
        const avg = 0.25 * (heightAt(x + 24, z) + heightAt(x - 24, z) + heightAt(x, z + 24) + heightAt(x, z - 24));
        const sl = Math.hypot(heightAt(x + 8, z) - heightAt(x - 8, z), heightAt(x, z + 8) - heightAt(x, z - 8)) / 16;
        if (h0 < avg + 0.9 || sl > 0.55 || sl < 0.04) continue;
        const dens = smoothstep(0.5, 0.78, fbm2(x * 0.011 + 5, z * 0.011 - 3, 3, 83));
        if (hash2(k, 3, 83) > dens * 0.45) continue;
        const n = 1 + Math.floor(Math.pow(hash2(k, 6, 83), 1.5) * 5);
        for (let m = 0; m < n && jc < 190; m++) {
          const a = hash2(k, 10 + m, 83) * Math.PI * 2, rr = Math.sqrt(hash2(k, 40 + m, 83)) * 7;
          const h = 4.5 + hash2(k, 70 + m, 83) * 5.5;
          specs.push({ id: ID_FAR_JUNIPER + jc, spec: { x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, h, r: h * 0.3, species: 'juniper', far: true } });
          jc++;
        }
      }
      let jv = 0;
      for (let k = 0; k < 20000 && jv < 40; k++) {
        const x = 30 + hash2(k, 1, 85) * (S - 60), z = 30 + hash2(k, 2, 85) * (S - 60);
        const c = Math.min(world.n - 1, Math.floor(z / world.cell)) * world.n + Math.min(world.n - 1, Math.floor(x / world.cell));
        if (world.water[c] || world.waterDist[c] < 60 || world.cover[c] > 0.12) continue;
        const h0 = heightAt(x, z);
        const avg = 0.25 * (heightAt(x + 22, z) + heightAt(x - 22, z) + heightAt(x, z + 22) + heightAt(x, z - 22));
        const sl = world.slope[c];
        if (h0 < avg + 1.0 || sl > 0.5 || sl < 0.05) continue;
        if (hash2(k, 3, 85) > 0.35) continue;
        const n = 1 + Math.floor(hash2(k, 6, 85) * 4);
        for (let m = 0; m < n && jv < 40; m++) {
          const a = hash2(k, 10 + m, 85) * Math.PI * 2, rr = Math.sqrt(hash2(k, 40 + m, 85)) * 5;
          const h = 4 + hash2(k, 70 + m, 85) * 4.5;
          specs.push({ id: ID_VALLEY_JUNIPER + jv, spec: { x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, h, r: h * 0.3, species: 'juniper' } });
          jv++;
        }
      }
      this.junipers = jc + jv;
    }
    this.treeCount = specs.length;

    // ---- pools. Capacity leaves room for dynamic growth (the sim's S13 plants and fells trees at run time)
    const cwCount = new Array(VARIANTS).fill(0);
    specs.forEach((s) => { if (s.spec.species !== 'juniper') cwCount[s.id % VARIANTS]++; });
    // trees3 (on by default; ?trees3=0 turns it off): real branching cottonwoods inside TREES3_RANGE and willow thickets, drawn by their own pools; the lump
    // crowns keep the far range
    if (typeof location !== 'undefined' && !/[?&]trees3=0(&|$)/.test(location.search)) this.t3 = new Trees3(this.group, this.meshes, shared, bark, depthMat, cwCount);
    const crownDetails = [2, 1, 0];
    for (let v = 0; v < VARIANTS; v++) {
      const shape = SHAPES[v % SHAPES.length];
      const pool = new Pool(Math.max(96, Math.ceil(cwCount[v] * 1.6) + 48), BAND_CROWN_CW, BAND_BARK_CW);
      crownDetails.forEach((detail, li) => {
        const crown = buildCrown(v + 1, detail, shape, CROWN_KEEP[li]);
        this.disposables.push(crown.geo);
        pool.addMesh('crown', crown.geo, foliageMat, `cottonwood-crown-${v}-lod${li}`, true, this.group, this.meshes, depthMat);
        if (li === crownDetails.length - 1) {
          // (r-edge-v1: past 400 m a crown is a few big bumps seen from a few pixels away; a fifth of the lumps is enough and there are many more far trees now)
          const farCrown = buildCrown(v + 1, 0, shape, 0.2, 5);
          this.disposables.push(farCrown.geo);
          pool.addMesh('crown', farCrown.geo, foliageMat, `cottonwood-crown-${v}-lod${li}-far`, false, this.group, this.meshes, depthMat);
        }
      });
      const tips: number[] = [];
      const barkGeos = [buildTreeBark(v + 1, 4, shape, tips), buildTreeBark(v + 1, 2, shape), buildTreeBark(v + 1, 1, shape)];
      this.disposables.push(...barkGeos);
      const tuftGeo = buildTufts(tips, v + 1);
      this.disposables.push(tuftGeo);
      pool.addMesh('tuft', tuftGeo, tuftMat, `cottonwood-crown-tuft-${v}`, false, this.group, this.meshes);
      barkGeos.forEach((g, li) => {
        pool.addMesh('bark', g, bark, `cottonwood-bark-${v}-lod${li}`, true, this.group, this.meshes, depthMat);
        if (li === barkGeos.length - 1) pool.addMesh('bark', g, bark, `cottonwood-bark-${v}-lod${li}-far`, false, this.group, this.meshes, depthMat);
      });
      if (this.t3) { pool.nearSkip2 = TREES3_SWAP0 * TREES3_SWAP0; T3_SWAP.value = 1; }
      this.cw.push(pool); this.pools.push(pool);
    }
    for (let v = 0; v < 2; v++) {
      const pool = new Pool(Math.max(64, Math.ceil(this.junipers * 0.7) + 32), BAND_CROWN, BAND_BARK);
      crownDetails.forEach((detail, li) => {
        const g = buildJuniperCrown(v + 3, detail);
        this.disposables.push(g);
        pool.addMesh('crown', g, juniperMat, `shrubs-juniper-${v}-lod${li}`, li < 2, this.group, this.meshes, depthMat);
      });
      this.jun.push(pool); this.pools.push(pool);
    }
    for (let v = 0; v < 2; v++) {
      const pool = new Pool(640, BAND_THICKET, BAND_BARK);
      [2, 1, 0].forEach((detail, li) => {
        const g = buildThicketGeometry(detail, v + 1);
        this.disposables.push(g);
        pool.addMesh('crown', g, willowMat, `shrubs-willow-${v}-lod${li}`, false, this.group, this.meshes, depthMat);
      });
      if (this.t3) {
        const p3 = new Pool(640, BAND_THICKET, [48, 140]);
        this.t3.fillWillowPool(p3, v, this.group, this.meshes);
        this.thick3.push(p3); this.pools.push(p3);
        pool.off = true;
      }
      this.thick.push(pool); this.pools.push(pool);
    }

    // ---- place every tree (understory comes with each valley cottonwood)
    for (const s of specs) this.place(s.id, s.spec);
    this.buildDressing();

    // ---- the sim's own shrubs: thin its even scatter into thickets (along water, in draws and on rocky slopes), vary size, shape and family,
    // and sink them a little so they sit in the grass instead of on it
    const keepIdx: number[] = [];
    for (let i = 0; i < world.shrubs.length / 3; i++) {
      const x = world.shrubs[i * 3], z = world.shrubs[i * 3 + 1];
      const ci = Math.min(world.n - 1, Math.max(0, Math.floor(x / world.cell))), cj = Math.min(world.n - 1, Math.max(0, Math.floor(z / world.cell)));
      const c = cj * world.n + ci;
      const thick = fbm2(x * 0.028 + 5, z * 0.028 - 13, 3, 61);
      let pk = 0.07 + 0.85 * smoothstep(0.5, 0.7, thick);
      if (world.waterDist[c] < 22 && world.waterDist[c] > 3) pk += 0.3;
      if (world.slope[c] > 0.26) pk += 0.2;
      if (hash2(i, 55, 7) < Math.min(0.95, pk)) keepIdx.push(i);
    }
    const ns = keepIdx.length;
    this.shrubCount = ns;
    {
      const pool = new Pool(Math.max(64, ns + 16), BAND_SHRUB, BAND_BARK);
      [2, 1, 0].forEach((detail, li) => {
        const g = buildShrubGeometry(detail);
        this.disposables.push(g);
        pool.addMesh('crown', g, shrubMat, `shrubs-lod${li}`, li < 2, this.group, this.meshes, depthMat);
      });
      this.shrubPool = pool; this.pools.push(pool);
      const { dummy, col } = this;
      for (let q = 0; q < ns; q++) {
        const i = keepIdx[q];
        const x = world.shrubs[i * 3], z = world.shrubs[i * 3 + 1], r = world.shrubs[i * 3 + 2];
        const big = hash2(i, 41, 3) < 0.12 ? 1.5 : 1.0;
        const sc = r * (0.55 + hash2(i, 8, 3) * 0.55) * big;
        const flat = 0.45 + hash2(i, 9, 3) * 0.55;
        const y = heightAt(x, z) - 0.22 * sc * flat;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, hash2(i, 7, 3) * Math.PI * 2, 0);
        dummy.scale.set(sc * (0.8 + hash2(i, 42, 3) * 0.5), sc * flat, sc * (0.8 + hash2(i, 43, 3) * 0.5));
        dummy.updateMatrix();
        const slot = pool.alloc();
        dummy.matrix.toArray(pool.crownMats, slot * 16);
        // (brightness, family, season phase): families spread across sage, olive, dark green and dry brown
        col.setRGB(0.75 + hash2(i, 10, 3) * 0.5, hash2(i, 11, 3), hash2(i, 12, 3));
        pool.cols[slot * 3] = col.r; pool.cols[slot * 3 + 1] = col.g; pool.cols[slot * 3 + 2] = col.b;
        pool.pos[slot * 3] = x; pool.pos[slot * 3 + 1] = y + 0.4; pool.pos[slot * 3 + 2] = z;
        pool.crownOn[slot] = 1;
      }
    }

    // rock outcrops: angular, partly buried stones in clusters on rocky slopes and ridges (a few lone ones on the flats)
    this.buildOutcrops(world, shared, heightAt);
    this.update(new THREE.Vector3(world.size / 2, 100, world.size / 2), true);
  }

  // ------------------------------------------------------------ dynamic trees (R11)

  /** Add a tree at run time (or at build time); returns its id. Pass an id to reuse one (the sim's tree index). */
  addTree(spec: TreeSpec, id?: number): number {
    const i = id ?? this.nextId++;
    if (this.recs.has(i)) this.removeTree(i);
    this.place(i, { species: 'cottonwood', ...spec });
    return i;
  }

  /** Remove a tree and its understory. Returns false if the id is unknown. */
  removeTree(id: number): boolean {
    const rec = this.recs.get(id);
    if (!rec) return false;
    rec.part.pool.release(rec.part.slot);
    this.t3?.remove(id);
    for (const u of rec.under) { u.pool.release(u.slot); if (u.twin) u.twin.pool.release(u.twin.slot); }
    this.recs.delete(id);
    const key = this.gridKey(rec.spec.x, rec.spec.z), cell = this.grid.get(key);
    if (cell) { const k = cell.indexOf(id); if (k >= 0) cell.splice(k, 1); }
    return true;
  }

  /**
   * The player's planted groves (Snapshot.groves, stride 4: x, y, height m, crown radius m): the sim sends the whole list with every
   * veg frame and it only ever grows, so the trees past the ones already standing are added (same models, LOD and understory as the
   * valley's own cottonwoods). A shorter list means a different world: the planted trees are cleared and rebuilt. Cheap when
   * nothing changed (one length compare), and nothing is allocated per frame.
   */
  setGroves(g: Float32Array | undefined): void {
    if (this.dynamic) return; // planted groves ride in the dynamic list
    const n = g ? g.length >> 2 : 0;
    if (n === this.groveN) return;
    if (n < this.groveN) {
      for (let k = 0; k < this.groveN; k++) this.removeTree(ID_GROVE + k);
      this.groveN = 0;
    }
    if (!g) return;
    for (let k = this.groveN; k < n; k++) {
      this.addTree({ x: g[k * 4], z: g[k * 4 + 1], h: g[k * 4 + 2], r: g[k * 4 + 3], species: 'cottonwood' }, ID_GROVE + k);
    }
    this.groveN = n;
  }

  /**
   * Dynamic trees (S13, sim param dynamicTrees): drive the instances from the sim's own list instead of the static one. `list` is
   * Snapshot.trees (stride 6: x, y, height m, crown radius m, kind, stage), slot index = tree id; it is sent only when `version`
   * changed, so this runs on a version change and is a no-op otherwise. Each slot is diffed against what stands: a tree is re-seated only
   * when its size moved by more than a few percent, its kind or its snag state changed; stage 5 (gone) removes it. Height and crown
   * radius already carry the growth stage (a seedling is a metre of twig, a mature tree full size); a snag is the charred trunk with
   * no crown (the R11 look). Nothing is allocated per frame, and a rebuild touches only the trees that changed.
   */
  setDynamic(list: Float32Array | undefined, version: number | undefined): void {
    if (version === undefined) return;
    this.dynamic = true;
    if (!list || version === this.dynVersion) return;
    this.dynVersion = version;
    const n = Math.floor(list.length / TREE_STRIDE);
    for (let s = 0; s < n; s++) {
      const o = s * TREE_STRIDE;
      const stage = list[o + 5];
      const rec = this.recs.get(s);
      if (stage >= 5 || list[o + 2] <= 0) { if (rec) this.removeTree(s); continue; }
      const h = Math.max(0.25, list[o + 2]), r = Math.max(0.1, list[o + 3]);
      const species = list[o + 4] === 1 ? 'juniper' : 'cottonwood';
      const burned = stage === 4;
      if (rec) {
        const p = rec.spec;
        if (p.species === species && !!p.burned === burned && Math.abs(p.x - list[o]) < 0.05 && Math.abs(p.z - list[o + 1]) < 0.05
          && Math.abs(p.h - h) <= 0.03 * h + 0.02 && Math.abs(p.r - r) <= 0.03 * r + 0.02) continue;
      }
      // a young tree has no thicket under it yet: only a standing tree of some size gets the understory (place() skips it for snags)
      this.addTree({ x: list[o], z: list[o + 1], h, r, species, burned, young: h < 4 }, s);
    }
    // slots past the end of this list (a shorter list, a different world): nothing stands there
    for (let s = n; s < this.dynN; s++) this.removeTree(s);
    this.dynN = n;
  }

  /** Change a tree (size, species, burned, even position): it is re-seated in place and keeps its id. */
  updateTree(id: number, patch: Partial<TreeSpec>): boolean {
    const rec = this.recs.get(id);
    if (!rec) return false;
    const spec = { ...rec.spec, ...patch };
    this.removeTree(id);
    this.place(id, spec);
    return true;
  }

  /**
   * Camera collision (R15 camera pass): calls `fn` for every live crown instance, cottonwoods (including the spare crowns that fill
   * grove gaps), junipers, willow thickets and shrubs: the instance matrix (16 floats at `m[o]`, local to world) and the crown
   * geometry's bounding box in local space as [centre x, y, z, half x, y, z]. Read only; nothing is allocated per call.
   */
  forEachCrown(fn: (m: Float32Array, o: number, bounds: readonly number[], kind: 'tree' | 'juniper' | 'thicket' | 'shrub') => void): void {
    const run = (pools: Pool[], kind: 'tree' | 'juniper' | 'thicket' | 'shrub') => {
      for (const p of pools) {
        const g = p.crownMeshes[0]?.geometry;
        if (!g) continue;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox!;
        const bounds = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2, (b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2];
        for (let s = 0; s < p.hi; s++) if (p.crownOn[s]) fn(p.crownMats, s * 16, bounds, kind);
      }
    };
    run(this.cw, 'tree'); run(this.jun, 'juniper'); run(this.thick, 'thicket');
    if (this.shrubPool) run([this.shrubPool], 'shrub');
  }

  /**
   * trees3 on or off at run time (only on a build made with ?trees3=1, which holds both): the same frame can be timed or captured with the
   * lump crowns and thickets, or with the branching trees. Returns false when this build has no trees3.
   */
  setTrees3(on: boolean): boolean {
    const t3 = this.t3;
    if (!t3) return false;
    const skip = on ? TREES3_SWAP0 * TREES3_SWAP0 : 0;
    T3_SWAP.value = on ? 1 : 0;
    for (const p of this.cw) { p.nearSkip2 = skip; p.dirty = true; }
    for (const p of this.thick) { p.off = on; p.dirty = true; }
    for (const p of this.thick3) { p.off = !on; p.dirty = true; }
    t3.setActive(on);
    return true;
  }

  getTree(id: number): Readonly<TreeSpec> | undefined { return this.recs.get(id)?.spec; }
  hasTree(id: number): boolean { return this.recs.has(id); }
  get liveTrees(): number { return this.recs.size; }

  /**
   * Fire hook: pass the engine's veg bytes (RGBA8, n x n; B is burn). A cottonwood standing in ground that is burning or freshly
   * ashed dies about half the time (decided by its id, so it is the same every run) and stands on as a charred snag.
   */
  setBurn(veg: Uint8Array, n: number): void {
    if (this.dynamic) return; // the sim's list carries its own fire deaths (snags)
    const cell = this.world.size / n;
    const hit: number[] = [];
    for (const rec of this.recs.values()) {
      const s = rec.spec;
      if (s.far || s.burned) continue;
      const ci = Math.min(n - 1, Math.max(0, Math.floor(s.x / cell))), cj = Math.min(n - 1, Math.max(0, Math.floor(s.z / cell)));
      if (veg[(cj * n + ci) * 4 + 2] >= 150 && hash2(rec.id, 77, 5) < 0.5) hit.push(rec.id);
    }
    for (const id of hit) this.updateTree(id, { burned: true });
  }

  /** How many entries of the sim's drowned-tree list (S14) are already standing as snags. */
  private drownedDone = 0;

  /**
   * Beaver ponds (S14, Snapshot.drownedTrees, only sent with dynamicTrees off): indices of the valley's static trees (the same ids as
   * `world.trees / 4`) that the water drowned. Each one becomes the standing snag of the fire look, in place. The list only grows, so
   * only the new entries are applied; with dynamic trees the snags arrive in the sim's own tree list and this does nothing.
   */
  setDrowned(list: Uint32Array | undefined): void {
    if (this.dynamic || !list) return;
    if (list.length < this.drownedDone) this.drownedDone = 0; // a shorter list: a different world
    for (let k = this.drownedDone; k < list.length; k++) {
      const rec = this.recs.get(list[k]);
      if (rec && !rec.spec.burned) this.updateTree(list[k], { burned: true });
    }
    this.drownedDone = list.length;
  }

  private gridKey(x: number, z: number): number {
    return (Math.floor(x / 24) + 512) * 2048 + (Math.floor(z / 24) + 512);
  }

  /** How crowded a tree's neighbourhood is, 0 to 1: weighted count of cottonwoods whose crowns would touch or nearly touch. */
  private groveAt(x: number, z: number, r: number, self: number): number {
    const cx = Math.floor(x / 24), cz = Math.floor(z / 24);
    let w = 0;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const cell = this.grid.get((cx + a + 512) * 2048 + (cz + b + 512));
        if (!cell) continue;
        for (const j of cell) {
          if (j === self) continue;
          const o = this.recs.get(j)!.spec;
          const reach = 1.7 * (r + o.r);
          const d = Math.hypot(o.x - x, o.z - z);
          if (d < reach) w += 1 - d / reach;
        }
      }
    }
    return clamp(w / 2.4, 0, 1);
  }

  private waterAt(x: number, z: number): { wet: boolean; wd: number; slope: number } {
    const w = this.world;
    const ci = Math.min(w.n - 1, Math.max(0, Math.floor(x / w.cell))), cj = Math.min(w.n - 1, Math.max(0, Math.floor(z / w.cell)));
    const c = cj * w.n + ci;
    return { wet: w.water[c] > 0, wd: w.waterDist[c], slope: w.slope[c] };
  }

  /** Seat one tree: pick its pool, write its matrices, and give a valley cottonwood its understory. */
  private place(id: number, spec: TreeSpec): void {
    const juniper = spec.species === 'juniper';
    const v = juniper ? id % this.jun.length : id % VARIANTS;
    const pool = juniper ? this.jun[v] : this.cw[v];
    const slot = pool.alloc();
    const rec: Rec = { id, spec, part: { pool, slot }, under: [], grove: 0 };
    this.recs.set(id, rec);
    if (!juniper) {
      const key = this.gridKey(spec.x, spec.z);
      let cell = this.grid.get(key);
      if (!cell) this.grid.set(key, cell = []);
      cell.push(id);
      rec.grove = spec.far ? Math.min(1, this.groveAt(spec.x, spec.z, spec.r, id) * 0.8) : this.groveAt(spec.x, spec.z, spec.r, id);
    }
    const { dummy, col } = this;
    const y = this.heightAt(spec.x, spec.z) - (juniper ? 0.12 : 0.2);
    const rot = hash2(id, v, 13) * Math.PI * 2;
    const lean = 0.03 + 0.07 * hash2(id, v, 37), leanA = hash2(id, v, 41) * Math.PI * 2;
    const grow = 0.9 + 0.22 * hash2(id, v, 43);
    pool.pos[slot * 3] = spec.x; pool.pos[slot * 3 + 1] = y + spec.h * 0.6; pool.pos[slot * 3 + 2] = spec.z;
    // (brightness, hue shift, season phase)
    col.setRGB(0.78 + hash2(id, v, 23) * 0.44, hash2(id, v, 29), hash2(id, v, 31));
    pool.cols[slot * 3] = col.r; pool.cols[slot * 3 + 1] = col.g; pool.cols[slot * 3 + 2] = col.b;
    if (juniper) {
      dummy.position.set(spec.x, y, spec.z);
      dummy.rotation.set(Math.cos(leanA) * lean * 0.5, rot, Math.sin(leanA) * lean * 0.5);
      const rj = spec.h * 0.3 * (0.85 + 0.3 * hash2(id, v, 17)) * grow;
      dummy.scale.set(rj, spec.h * grow, rj * (0.85 + 0.3 * hash2(id, v, 19)));
      dummy.updateMatrix();
      dummy.matrix.toArray(pool.crownMats, slot * 16);
      pool.crownOn[slot] = 1;
      if (spec.burned) pool.cols[slot * 3] = 0.16;
      return;
    }
    // trunk and limbs: a few degrees of lean (about the base, the same for trunk and crown) and a size jitter, so no two trees stand alike
    dummy.position.set(spec.x, y, spec.z);
    dummy.rotation.set(Math.cos(leanA) * lean, rot, Math.sin(leanA) * lean);
    dummy.scale.set(spec.h * grow, spec.h * grow, spec.h * grow);
    dummy.updateMatrix();
    dummy.matrix.toArray(pool.barkMats, slot * 16);
    // crown: wider than v1 and swollen where neighbours stand close, so a grove's crowns touch and overlap into one mass
    const gk = 1 + 0.17 * rec.grove;
    const sw = (0.95 + hash2(id, v, 17) * 0.3) * 0.9 * gk;
    dummy.scale.set(spec.r * sw * grow, spec.h * grow * 0.94 * (1 + 0.06 * rec.grove), spec.r * sw * grow * (0.88 + hash2(id, v, 19) * 0.24));
    dummy.updateMatrix();
    dummy.matrix.toArray(pool.crownMats, slot * 16);
    // bark: lighter or darker, warmer or greyer, per tree
    const bb = 0.8 + 0.4 * hash2(id, v, 47), bw = hash2(id, v, 53) - 0.5;
    if (spec.burned) { pool.barkCols[slot * 3] = CHAR[0]; pool.barkCols[slot * 3 + 1] = CHAR[1]; pool.barkCols[slot * 3 + 2] = CHAR[2]; }
    else { pool.barkCols[slot * 3] = bb * (1 + 0.14 * bw); pool.barkCols[slot * 3 + 1] = bb; pool.barkCols[slot * 3 + 2] = bb * (1 - 0.18 * bw); }
    pool.barkOn[slot] = 1;
    pool.crownOn[slot] = spec.burned ? 0 : 1;
    pool.tuftOn[slot] = spec.burned ? 0 : 1;
    if (this.t3) {
      this.t3.add(id, {
        x: spec.x, y, z: spec.z, h: spec.h, r: spec.r, rot, lean, leanA, grow, sw, swz: 0.88 + hash2(id, v, 19) * 0.24, burned: !!spec.burned,
        col: [pool.cols[slot * 3], pool.cols[slot * 3 + 1], pool.cols[slot * 3 + 2]],
        bark: [pool.barkCols[slot * 3], pool.barkCols[slot * 3 + 1], pool.barkCols[slot * 3 + 2]],
      });
    }
    if (!spec.far && !spec.burned && !spec.young) this.understory(rec);
  }

  /** One willow thicket instance (render-only). */
  private thicket(x: number, z: number, sx: number, sy: number, key: number): Part {
    const pool = this.thick[key % this.thick.length];
    const slot = pool.alloc();
    const { dummy, col } = this;
    const y = this.heightAt(x, z) - 0.15 * sy;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, hash2(key, 7, 21) * Math.PI * 2, 0);
    dummy.scale.set(sx, sy, sx * (0.8 + 0.4 * hash2(key, 8, 21)));
    dummy.updateMatrix();
    dummy.matrix.toArray(pool.crownMats, slot * 16);
    col.setRGB(0.8 + hash2(key, 9, 21) * 0.4, hash2(key, 10, 21), hash2(key, 11, 21));
    pool.cols[slot * 3] = col.r; pool.cols[slot * 3 + 1] = col.g; pool.cols[slot * 3 + 2] = col.b;
    pool.pos[slot * 3] = x; pool.pos[slot * 3 + 1] = y + sy * 0.5; pool.pos[slot * 3 + 2] = z;
    pool.crownOn[slot] = 1;
    const part: Part = { pool, slot };
    if (this.t3) {
      // trees3 willow: the same thicket again in the new pool (leaf clusters on stems), a warm red-brown stem colour
      const p3 = this.thick3[key % this.thick3.length], s3 = p3.alloc();
      p3.crownMats.set(pool.crownMats.subarray(slot * 16, slot * 16 + 16), s3 * 16);
      p3.barkMats.set(pool.crownMats.subarray(slot * 16, slot * 16 + 16), s3 * 16);
      p3.cols.set(pool.cols.subarray(slot * 3, slot * 3 + 3), s3 * 3);
      p3.pos.set(pool.pos.subarray(slot * 3, slot * 3 + 3), s3 * 3);
      const bb = 1.1 + 0.3 * hash2(key, 12, 21);
      p3.barkCols[s3 * 3] = bb * 1.3; p3.barkCols[s3 * 3 + 1] = bb * 0.8; p3.barkCols[s3 * 3 + 2] = bb * 0.5;
      p3.crownOn[s3] = 1; p3.barkOn[s3] = 1;
      part.twin = { pool: p3, slot: s3 };
    }
    return part;
  }

  /** Willow and shrub thickets around a valley cottonwood: more of them near water and where its neighbours crowd it. */
  private understory(rec: Rec): void {
    const s = rec.spec;
    const near = this.waterAt(s.x, s.z);
    const wetK = 1 - smoothstep(18, 44, near.wd);
    const k = Math.min(3, Math.floor(hash2(rec.id, 61, 9) * (0.2 + 1.5 * wetK + 1.0 * rec.grove)));
    for (let q = 0; q < k; q++) {
      const a = hash2(rec.id, 62 + q, 9) * Math.PI * 2, d = s.r * (0.45 + 0.85 * hash2(rec.id, 66 + q, 9));
      const px = s.x + Math.cos(a) * d, pz = s.z + Math.sin(a) * d;
      if (this.waterAt(px, pz).wet) continue;
      const sx = 1.5 + 1.7 * hash2(rec.id, 70 + q, 9);
      rec.under.push(this.thicket(px, pz, sx, sx * (0.95 + 0.6 * hash2(rec.id, 74 + q, 9)), rec.id * 8 + q));
    }
  }

  /**
   * Static dressing that is not owned by one tree: willow thickets lining the creek banks (thicker where trees are near, and in
   * patches), and spare crowns that fill the gaps between valley trees standing a crown or so apart (set low, with thickets under them,
   * so they read as one grove and not as floating balls). Deterministic by hash.
   */
  private buildDressing(): void {
    const w = this.world, cr = w.creek;
    const valley: Rec[] = [];
    for (const rec of this.recs.values()) if (!rec.spec.far && rec.spec.species !== 'juniper') valley.push(rec);
    // creek banks: walk the creek, both sides
    let bank = 0;
    const nc = cr.length / 2;
    let acc = 0;
    for (let k = 1; k < nc - 1 && bank < 320; k++) {
      const x = cr[2 * k], z = cr[2 * k + 1];
      acc += Math.hypot(x - cr[2 * k - 2], z - cr[2 * k - 1]);
      if (acc < 6) continue;
      acc = 0;
      if (x < 6 || z < 6 || x > w.size - 6 || z > w.size - 6) continue;
      const tx = cr[2 * k + 2] - cr[2 * k - 2], tz = cr[2 * k + 3] - cr[2 * k - 1];
      const tl = Math.hypot(tx, tz) || 1;
      let nTrees = 0;
      for (const rec of valley) if (Math.abs(rec.spec.x - x) < 36 && Math.abs(rec.spec.z - z) < 36) nTrees++;
      const patch = fbm2(x * 0.03 + 11, z * 0.03 - 7, 3, 133);
      const p = clamp(0.04 + 0.07 * nTrees + 0.8 * smoothstep(0.5, 0.7, patch) - 0.2, 0.04, 0.9);
      for (const side of [-1, 1]) {
        if (hash2(k, side + 3, 131) > p) continue;
        const nx = (-tz / tl) * side, nz = (tx / tl) * side;
        let d = 1;
        while (d < 14 && this.waterAt(x + nx * d, z + nz * d).wet) d++;
        d += 0.6 + 2.6 * hash2(k, side + 9, 131);
        const px = x + nx * d, pz = z + nz * d;
        if (px < 4 || pz < 4 || px > w.size - 4 || pz > w.size - 4 || this.waterAt(px, pz).wet) continue;
        const sx = 1.3 + 1.6 * hash2(k, side + 12, 131);
        this.dressing.push(this.thicket(px, pz, sx, sx * (1.0 + 0.7 * hash2(k, side + 15, 131)), 40000 + k * 2 + (side > 0 ? 1 : 0)));
        bank++;
      }
    }
    // spare crowns in the gaps between valley trees
    let fill = 0;
    const per = new Map<number, number>();
    for (let a = 0; a < valley.length && fill < 150; a++) {
      for (let b = a + 1; b < valley.length && fill < 150; b++) {
        const A = valley[a].spec, B = valley[b].spec;
        const d = Math.hypot(A.x - B.x, A.z - B.z);
        const sum = 1.1 * (A.r + B.r);
        if (d < 0.8 * sum || d > 1.9 * sum) continue;
        if ((per.get(valley[a].id) ?? 0) >= 2 || (per.get(valley[b].id) ?? 0) >= 2) continue;
        const near = this.waterAt((A.x + B.x) / 2, (A.z + B.z) / 2);
        if (near.wd > 40) continue;
        if (hash2(valley[a].id, valley[b].id, 141) > 0.5) continue;
        const f = 0.4 + 0.2 * hash2(valley[a].id, valley[b].id, 142);
        const mx = A.x + (B.x - A.x) * f + (hash2(a, b, 143) - 0.5) * 2, mz = A.z + (B.z - A.z) * f + (hash2(a, b, 144) - 0.5) * 2;
        if (this.waterAt(mx, mz).wet) continue;
        const rf = clamp(0.36 * d, 3, 7);
        const hf = 0.62 * (A.h + B.h) * 0.5;
        const id = 60000 + fill;
        const v = (valley[a].id + valley[b].id) % VARIANTS;
        const pool = this.cw[v];
        const slot = pool.alloc();
        const y = this.heightAt(mx, mz) - 0.15 * hf;
        const { dummy, col } = this;
        dummy.position.set(mx, y, mz);
        dummy.rotation.set(0, hash2(id, v, 13) * Math.PI * 2, 0);
        dummy.scale.set(rf * (0.95 + 0.2 * hash2(id, v, 17)), hf * 0.94, rf * (0.9 + 0.2 * hash2(id, v, 19)));
        dummy.updateMatrix();
        dummy.matrix.toArray(pool.crownMats, slot * 16);
        col.setRGB(0.78 + hash2(id, v, 23) * 0.44, hash2(id, v, 29), hash2(id, v, 31));
        pool.cols[slot * 3] = col.r; pool.cols[slot * 3 + 1] = col.g; pool.cols[slot * 3 + 2] = col.b;
        pool.pos[slot * 3] = mx; pool.pos[slot * 3 + 1] = y + hf * 0.6; pool.pos[slot * 3 + 2] = mz;
        pool.crownOn[slot] = 1;
        this.dressing.push({ pool, slot });
        // thickets under the spare crown, so the bare ground below it is hidden
        for (let q = 0; q < 2; q++) {
          const aa = hash2(id, 150 + q, 9) * Math.PI * 2, dd = rf * (0.2 + 0.5 * hash2(id, 152 + q, 9));
          const px = mx + Math.cos(aa) * dd, pz = mz + Math.sin(aa) * dd;
          if (this.waterAt(px, pz).wet) continue;
          const sx = 1.8 + 1.4 * hash2(id, 154 + q, 9);
          this.dressing.push(this.thicket(px, pz, sx, sx * 1.1, 50000 + fill * 2 + q));
        }
        per.set(valley[a].id, (per.get(valley[a].id) ?? 0) + 1);
        per.set(valley[b].id, (per.get(valley[b].id) ?? 0) + 1);
        fill++;
      }
    }
    this.fillerCount = fill;
  }

  /** Re-bucket instances by distance to the camera (cheap; skips when the camera has barely moved and nothing was added or removed). */
  update(cam: THREE.Vector3, force = false): void {
    for (const p of this.pools) p.update(cam, force);
    this.t3?.update(cam, force);
  }

  /**
   * The sun-shadow range (metres of view depth, from the engine). Cottonwoods farther from the camera than the range plus a margin for
   * long low-sun shadows are drawn by meshes that do not cast, so they cost nothing in the shadow pass.
   */
  setShadowRange(range: number): void {
    const cut = range + 110;
    for (const p of this.cw) p.setShadowCut(cut);
  }

  /** Bare winter trees: hide the cottonwood crowns entirely so only clean branches remain. */
  setLeafAmount(leaf: number): void {
    const show = leaf > 0.1;
    // the twig-tip tufts only carry leaves while the crown is thin; in full leaf they would be drawn and shaded for nothing
    const tufts = show && leaf < 0.82;
    if (show === this.crownsShown && tufts === this.tuftsShown) return;
    this.crownsShown = show;
    this.tuftsShown = tufts;
    for (const m of this.meshes) if (m.name.startsWith('cottonwood-crown')) m.visible = m.name.includes('tuft') ? tufts : show;
  }


  private buildOutcrops(world: World, shared: SharedUniforms, heightAt: (x: number, z: number) => number): void {
    // geometry: a rounded boulder with smooth shading (a gentle noise on a subdivided sphere), three variants; the grass and ground
    // are painterly, so the stones read as weathered lumps and not as cut gems
    const geos: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 3; v++) {
      const ico = new THREE.IcosahedronGeometry(1, 3);
      const pa = ico.getAttribute('position');
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const n = vnoise2(x * 1.5 + v * 7, y * 1.7 + z * 1.2, 31 + v) * 0.7 + vnoise2(x * 3.6 + v * 3, y * 3.9 + z * 3.1, 47 + v) * 0.3;
        const k = 0.82 + 0.36 * n;
        pa.setXYZ(i, x * k * (1.0 + 0.25 * (v - 1)), y * k * 0.66, z * k);
      }
      // weld the duplicate corners and average the normals across them: one smooth surface
      ico.deleteAttribute('normal');
      ico.deleteAttribute('uv');
      const smooth = mergeVertices(ico, 1e-4);
      smooth.computeVertexNormals();
      ico.dispose();
      geos.push(smooth);
      this.disposables.push(smooth);
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      injectTerrainShadow(shader, shared);
      shader.uniforms.uSoil = shared.soil; shader.uniforms.uGrassDry = shared.grassDry; shader.uniforms.uGrassGreen = shared.grassGreen; shader.uniforms.uSnow = shared.snow;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `varying vec3 vRockLocal;
void main() {`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vRockLocal = position;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `varying vec3 vRockLocal;
uniform vec3 uSoil;
uniform vec3 uGrassDry;
uniform vec3 uGrassGreen;
uniform float uSnow;
${NOISE_GLSL}
${WORLDPOS_GLSL}
void main() {`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 wpr = tgFragWorld();
            float strata = tgNoise3( vec3( wpr.x * 1.3, wpr.y * 7.0, wpr.z * 1.3 ) );
            float grit = tgNoise3( wpr * 9.0 );
            diffuseColor.rgb *= 0.78 + 0.2 * strata + 0.1 * grit;
            // tint toward the ground it sits on: a share of soil and cured grass, most at the base where grass and dust climb the stone
            vec3 gtone = mix( uSoil * 1.5, mix( uGrassGreen, uGrassDry, 0.6 ), 0.5 );
            float baseK = 1.0 - smoothstep( -0.3, 0.45, vRockLocal.y );
            diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.45 + gtone * 0.62, 0.3 + 0.35 * baseK );
            // lichen: yellow-green and orange crusts on the upward faces
            float lich = smoothstep( 0.62, 0.8, tgNoise3( wpr * 3.1 + 7.0 ) ) * smoothstep( 0.2, 0.8, normalize( vNormal ).y );
            float lich2 = smoothstep( 0.66, 0.82, tgNoise3( wpr * 4.7 + 21.0 ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.34, 0.12 ), lich * 0.26 );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.5, 0.3, 0.1 ), lich2 * 0.14 );
            // snow settles on the upward faces
            float rsn = smoothstep( 0.04, 0.5, uSnow ) * smoothstep( 0.15, 0.75, normalize( vNormal ).y + 0.25 * ( grit - 0.5 ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.9, 0.94 ), clamp( rsn * 0.62, 0.0, 0.9 ) );
            gTgShadow = tgSampleTerrainShadow();
          }`,
        );
      shader.fragmentShader = injectSafeOutput(shader.fragmentShader);
    };
    mat.customProgramCacheKey = () => 'tg-rock-v3';
    this.disposables.push(mat);

    interface R { x: number; z: number; s: number; sq: number; rot: number; c: number }
    const rocks: R[] = [];
    const S = world.size;
    for (let k = 0; k < 9000 && rocks.length < 230; k++) {
      const x = 46 + hash2(k, 1, 91) * (S - 92), z = 46 + hash2(k, 2, 91) * (S - 92);
      const ci = Math.floor(x / world.cell), cj = Math.floor(z / world.cell), c = cj * world.n + ci;
      if (world.water[c] || world.waterDist[c] < 5) continue;
      const slope = world.slope[c];
      const thick = fbm2(x * 0.035 + 3, z * 0.035 - 5, 3, 91);
      const p = smoothstep(0.2, 0.5, slope) * smoothstep(0.5, 0.68, thick) + 0.0006;
      if (hash2(k, 3, 91) > p) continue;
      const n = 2 + Math.floor(hash2(k, 4, 91) * 5);
      for (let q = 0; q < n && rocks.length < 230; q++) {
        const a = hash2(k, 10 + q, 91) * Math.PI * 2, r = hash2(k, 20 + q, 91) * 4.5;
        const rx = x + Math.cos(a) * r, rz = z + Math.sin(a) * r;
        const sz = 0.28 + Math.pow(hash2(k, 30 + q, 91), 2.6) * 1.35;
        rocks.push({ x: rx, z: rz, s: sz, sq: 0.55 + hash2(k, 40 + q, 91) * 0.6, rot: hash2(k, 50 + q, 91) * 6.28, c: hash2(k, 60 + q, 91) });
      }
    }
    const per: R[][] = [[], [], []];
    rocks.forEach((r, i) => per[i % 3].push(r));
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    // warm sandstone, grey-tan, rusty and a few darker basalt stones
    const palette = ['#a98558', '#94775a', '#9c6842', '#7e6c56', '#b08f60', '#7a5a3e'];
    per.forEach((list, v) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(geos[v], mat, list.length);
      m.name = `outcrop-${v}`;
      list.forEach((r, i) => {
        const y = heightAt(r.x, r.z);
        dummy.position.set(r.x, y + 0.18 * r.s, r.z);
        dummy.rotation.set((hash2(i, v, 5) - 0.5) * 0.35, r.rot, (hash2(i, v, 6) - 0.5) * 0.35);
        dummy.scale.set(r.s * (0.9 + 0.5 * r.sq), r.s * (0.55 + 0.35 * r.sq), r.s * (1.1 - 0.4 * r.sq + 0.2));
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        col.set(palette[Math.min(palette.length - 1, Math.floor(r.c * palette.length))]);
        m.setColorAt(i, col);
      });
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.group.add(m);
      this.meshes.push(m);
    });
    this.rockCount = rocks.length;
  }

  dispose(): void {
    this.t3?.dispose();
    for (const d of this.disposables) d.dispose();
    for (const m of this.meshes) m.dispose();
  }
}
