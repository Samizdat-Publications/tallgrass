// Branching tree skeletons after @dgreenheck/ez-tree (MIT, Copyright (c) 2024 Daniel Greenheck, see CREDITS.md). This is a geometry-only
// TypeScript port of the deciduous generator in that library (branch sections, gnarliness, growth force, child branches, leaf anchors),
// without its textures and materials (the library's import pulls in 4 MB of embedded textures as a side effect, which a tree-shaken
// bundle could not drop). The generator is deterministic from its seed; nothing here touches the sim.
//
// Output is in generator units (here: metres of a nominal 14 m tree). cottonwoodParams() are the tuned parameter sets.
import * as THREE from 'three';

/** ez-tree's RNG (a small multiply-with-carry), so a seed gives the same tree here as in the library. */
class RNG {
  private w: number; private z: number;
  constructor(seed: number) { this.w = (123456789 + seed) & 0xffffffff; this.z = (987654321 - seed) & 0xffffffff; }
  random(max = 1, min = 0): number {
    this.z = (36969 * (this.z & 65535) + (this.z >> 16)) & 0xffffffff;
    this.w = (18000 * (this.w & 65535) + (this.w >> 16)) & 0xffffffff;
    const r = (((this.z << 16) + (this.w & 65535)) >>> 0) / 4294967296;
    return (max - min) * r + min;
  }
}

/** Parameters, indexed by branch level (0 trunk, 1 limbs, 2 branches, 3 twigs) like the library's options. */
export interface EzParams {
  seed: number;
  levels: number;
  /** Angle of a level's branches off their parent, degrees (index 1..levels). */
  angle: number[];
  /** Children per branch, by parent level (0..levels-1). */
  children: number[];
  forceStrength: number;
  gnarliness: number[]; length: number[]; radius: number[]; sections: number[]; segments: number[]; start: number[]; taper: number[]; twist: number[];
  leaves: { angle: number; count: number; start: number; size: number; sizeVariance: number; fromLevel?: number };
}

export interface EzBranchGeo {
  pos: number[]; nrm: number[]; idx: number[];
  /** Branch level of each vertex (0 trunk .. levels), so a LOD can drop the finest levels. */
  lvl: number[];
}

export interface EzLeafAnchor {
  /** Where the leaf cluster is rooted. */
  o: THREE.Vector3;
  /** Growth direction (unit). */
  a: THREE.Vector3;
  /** A unit vector across the card (perpendicular to a). */
  s: THREE.Vector3;
  /** Card size. */
  size: number;
}

export interface EzTree { bark: EzBranchGeo; anchors: EzLeafAnchor[]; }

interface Branch { origin: THREE.Vector3; orientation: THREE.Euler; length: number; radius: number; level: number; sectionCount: number; segmentCount: number; }
interface Section { origin: THREE.Vector3; orientation: THREE.Euler; radius: number; }

export function generateEzTree(p: EzParams): EzTree {
  const rng = new RNG(p.seed);
  const bark: EzBranchGeo = { pos: [], nrm: [], idx: [], lvl: [] };
  const anchors: EzLeafAnchor[] = [];
  const queue: Branch[] = [];
  const Y = new THREE.Vector3(0, 1, 0);
  const forceDir = new THREE.Vector3(0, 1, 0);

  const generateLeaf = (origin: THREE.Vector3, orientation: THREE.Euler) => {
    const size = p.leaves.size * (1 + rng.random(p.leaves.sizeVariance, -p.leaves.sizeVariance));
    const q = new THREE.Quaternion().setFromEuler(orientation);
    const a = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const s = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    anchors.push({ o: origin.clone(), a, s, size });
    // the library adds a second quad turned a quarter turn about the card's own axis: a crossed pair
    const s2 = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    anchors.push({ o: origin.clone(), a: a.clone(), s: s2, size });
  };

  const generateLeaves = (sections: Section[]) => {
    const radialOffset = rng.random();
    for (let i = 0; i < p.leaves.count; i++) {
      const leafStart = rng.random(1.0, p.leaves.start);
      const si = Math.floor(leafStart * (sections.length - 1));
      const A = sections[si], B = si === sections.length - 1 ? A : sections[si + 1];
      const alpha = (leafStart - si / (sections.length - 1)) / (1 / (sections.length - 1));
      const origin = new THREE.Vector3().lerpVectors(A.origin, B.origin, alpha);
      const qA = new THREE.Quaternion().setFromEuler(A.orientation), qB = new THREE.Quaternion().setFromEuler(B.orientation);
      const parent = new THREE.Euler().setFromQuaternion(qB.slerp(qA, alpha));
      const radialAngle = 2 * Math.PI * (radialOffset + i / p.leaves.count);
      const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.leaves.angle / (180 / Math.PI));
      const q2 = new THREE.Quaternion().setFromAxisAngle(Y, radialAngle);
      const q3 = new THREE.Quaternion().setFromEuler(parent);
      generateLeaf(origin, new THREE.Euler().setFromQuaternion(q3.multiply(q2.multiply(q1))));
    }
  };

  const generateChildren = (count: number, level: number, sections: Section[]) => {
    const radialOffset = rng.random();
    for (let i = 0; i < count; i++) {
      const start = rng.random(1.0, p.start[level]);
      const si = Math.floor(start * (sections.length - 1));
      const A = sections[si], B = si === sections.length - 1 ? A : sections[si + 1];
      const alpha = (start - si / (sections.length - 1)) / (1 / (sections.length - 1));
      const origin = new THREE.Vector3().lerpVectors(A.origin, B.origin, alpha);
      const radius = p.radius[level] * ((1 - alpha) * A.radius + alpha * B.radius);
      const qA = new THREE.Quaternion().setFromEuler(A.orientation), qB = new THREE.Quaternion().setFromEuler(B.orientation);
      const parent = new THREE.Euler().setFromQuaternion(qB.slerp(qA, alpha));
      const radialAngle = 2 * Math.PI * (radialOffset + i / count);
      const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.angle[level] / (180 / Math.PI));
      const q2 = new THREE.Quaternion().setFromAxisAngle(Y, radialAngle);
      const q3 = new THREE.Quaternion().setFromEuler(parent);
      queue.push({
        origin, orientation: new THREE.Euler().setFromQuaternion(q3.multiply(q2.multiply(q1))), length: p.length[level], radius, level,
        sectionCount: p.sections[level], segmentCount: p.segments[level],
      });
    }
  };

  const generateBranch = (br: Branch) => {
    const indexOffset = bark.pos.length / 3;
    const orient = br.orientation.clone();
    const origin = br.origin.clone();
    // (deciduous: every branch is a chain of levels - 1 parts, the terminal branch carrying on from its tip)
    const sectionLength = br.length / br.sectionCount / (p.levels - 1);
    const sections: Section[] = [];
    for (let i = 0; i <= br.sectionCount; i++) {
      let r = br.radius;
      if (i === br.sectionCount && br.level === p.levels) r = 0.001;
      else r *= 1 - p.taper[br.level] * (i / br.sectionCount);
      let first: { v: THREE.Vector3; n: THREE.Vector3 } | null = null;
      for (let j = 0; j < br.segmentCount; j++) {
        const ang = (2 * Math.PI * j) / br.segmentCount;
        const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        const v = dir.clone().multiplyScalar(r).applyEuler(orient).add(origin);
        const n = dir.clone().applyEuler(orient).normalize();
        bark.pos.push(v.x, v.y, v.z); bark.nrm.push(n.x, n.y, n.z); bark.lvl.push(br.level);
        if (j === 0) first = { v, n };
      }
      // (the library duplicates the first vertex of each ring for UV continuity; the index layout below keeps its stride)
      bark.pos.push(first!.v.x, first!.v.y, first!.v.z); bark.nrm.push(first!.n.x, first!.n.y, first!.n.z); bark.lvl.push(br.level);
      sections.push({ origin: origin.clone(), orientation: orient.clone(), radius: r });
      origin.add(new THREE.Vector3(0, sectionLength, 0).applyEuler(orient));
      const gn = Math.max(1, 1 / Math.sqrt(r)) * p.gnarliness[br.level];
      orient.x += rng.random(gn, -gn);
      orient.z += rng.random(gn, -gn);
      const qSection = new THREE.Quaternion().setFromEuler(orient);
      const qTwist = new THREE.Quaternion().setFromAxisAngle(Y, p.twist[br.level]);
      const qForce = new THREE.Quaternion().setFromUnitVectors(Y, forceDir);
      qSection.multiply(qTwist);
      qSection.rotateTowards(qForce, p.forceStrength / r);
      orient.setFromQuaternion(qSection);
    }
    // indices
    const N = br.segmentCount + 1;
    for (let i = 0; i < br.sectionCount; i++) {
      for (let j = 0; j < br.segmentCount; j++) {
        const v1 = indexOffset + i * N + j, v2 = indexOffset + i * N + (j + 1), v3 = v1 + N, v4 = v2 + N;
        bark.idx.push(v1, v3, v2, v2, v3, v4);
      }
    }
    const last = sections[sections.length - 1];
    if (br.level < p.levels) {
      queue.push({
        origin: last.origin, orientation: last.orientation, length: p.length[br.level + 1], radius: last.radius, level: br.level + 1,
        sectionCount: br.sectionCount, segmentCount: br.segmentCount,
      });
    } else {
      generateLeaf(last.origin, last.orientation);
    }
    // (the library grows leaves on the last level only; fromLevel lets a shrub carry them on its stems too)
    if (br.level >= (p.leaves.fromLevel ?? p.levels)) generateLeaves(sections);
    if (br.level < p.levels) generateChildren(p.children[br.level], br.level + 1, sections);
  };

  queue.push({ origin: new THREE.Vector3(), orientation: new THREE.Euler(), length: p.length[0], radius: p.radius[0], level: 0, sectionCount: p.sections[0], segmentCount: p.segments[0] });
  while (queue.length > 0) generateBranch(queue.shift()!);
  return { bark, anchors };
}

/**
 * Plains cottonwood (Populus deltoides): a straight, heavy trunk that forks high into a few thick ascending limbs, a broad open crown of
 * branches that sweep out and up, and leaves in clusters at the branch ends. About 14 m tall with a 6 m crown radius (variant seed
 * changes the tree, `v` picks one of six character sets: tall, wide, lopsided and so on).
 */
export function cottonwoodParams(v: number): EzParams {
  const ch = [
    // [limbs, branches, twigs, trunkLen, limbAngle, force, leaves/twig, trunkRadius]
    { l1: 5, l2: 5, l3: 4, len0: 9, a1: 36, f: 0.012, lc: 5, r0: 0.42 },
    { l1: 4, l2: 5, l3: 4, len0: 10, a1: 30, f: 0.016, lc: 5, r0: 0.4 },
    { l1: 6, l2: 4, l3: 4, len0: 8, a1: 46, f: 0.006, lc: 5, r0: 0.46 },
    { l1: 5, l2: 5, l3: 3, len0: 9, a1: 40, f: 0.01, lc: 6, r0: 0.43 },
    { l1: 5, l2: 6, l3: 4, len0: 9.5, a1: 34, f: 0.012, lc: 4, r0: 0.41 },
    { l1: 4, l2: 5, l3: 5, len0: 8.5, a1: 42, f: 0.008, lc: 5, r0: 0.44 },
  ][v % 6];
  return {
    seed: 1100 + v * 37,
    levels: 3,
    angle: [0, ch.a1, 48, 40],
    children: [ch.l1, ch.l2, ch.l3],
    forceStrength: ch.f,
    gnarliness: [0.05, 0.16, 0.2, 0.05],
    length: [ch.len0, 11, 6.5, 2.4],
    radius: [ch.r0, 0.62, 0.7, 0.7],
    sections: [10, 8, 6, 4],
    segments: [8, 6, 4, 3],
    start: [0, 0.34, 0.3, 0.2],
    taper: [0.55, 0.62, 0.7, 0.9],
    twist: [0, 0.04, -0.04, 0],
    leaves: { angle: 38, count: ch.lc, start: 0.1, size: 1.5, sizeVariance: 0.35 },
  };
}

/**
 * Creek-bank willow thicket (Salix): a short multi-stemmed vase, many slender stems fanning up and out from a low base, fine twigs, narrow
 * leaves in clusters. About 4 m tall with a 2 m radius.
 */
export function willowParams(v: number): EzParams {
  const ch = [
    { l1: 9, l2: 4, a1: 42, f: 0.012 },
    { l1: 8, l2: 5, a1: 48, f: 0.01 },
    { l1: 10, l2: 4, a1: 38, f: 0.014 },
  ][v % 3];
  return {
    seed: 3300 + v * 29,
    levels: 2,
    angle: [0, ch.a1, 34],
    children: [ch.l1, ch.l2],
    forceStrength: ch.f,
    gnarliness: [0.08, 0.1, 0.12],
    length: [0.7, 2.7, 1.6],
    radius: [0.07, 0.6, 0.7],
    sections: [3, 5, 3],
    segments: [5, 4, 3],
    start: [0, 0.04, 0.3],
    taper: [0.4, 0.55, 0.9],
    twist: [0, 0, 0],
    leaves: { angle: 32, count: 6, start: 0.1, size: 0.85, sizeVariance: 0.3, fromLevel: 1 },
  };
}
