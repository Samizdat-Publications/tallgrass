// Trees3: branching cottonwoods for the near and mid range (URL toggle ?trees3=1). Real branch skeletons from the ez-tree generator
// (eztree.ts) with leaf-cluster cards at the branch ends instead of noise-displaced lumps. The same variant is built in leaf and bare:
// the leaf cards are a separate mesh that the season turns off (winter shows the branch skeleton), and a burned snag is the same
// skeleton in char. Everything is instanced through the same Pool as the older crowns (distance buckets, slot free list).
//
// Geometry spaces (the instance matrices are built in Trees3.add):
//   leaf cards: x,z in crown-radius units (nominal 6 m), y in height units (nominal 14 m), exactly as the lump crowns;
//   bark:       a uniform 1/14 scale (tree height is 1), like the old bark, so the furrow shader frequencies carry over.
import * as THREE from 'three';
import { NOISE_GLSL, OCCLUDE_GLSL, SharedUniforms, clamp, injectSafeOutput, injectTerrainShadow } from './common';
import { cottonwoodParams, generateEzTree, willowParams, type EzTree } from './eztree';
import { Pool, swayChunk, WORLDPOS_GLSL } from './trees';

const COTTON_CELLS = [0, 1, 2];
const WILLOW_CELLS = [3];
const R0 = 6; // nominal crown radius (m) the generated trees are authored for
const H0 = 14; // nominal tree height (m)
export const VARIANTS3 = 6;
/** Nominal willow thicket size (m): radius and height of the generated shrub; the thicket instance matrix scales its unit space (radius 1, height 1). */
const W0 = 2.2;
const TH0 = 5;
/** Beyond this distance (m) the older lump crowns draw the tree (trees.ts skips them inside it). */
export const TREES3_RANGE = 150;
const LEAF_LIM = [52, TREES3_RANGE];
const BARK_LIM = [46, TREES3_RANGE];
/** Share of the leaf clusters each LOD keeps, and how much larger the survivors are drawn. */
const LEAF_KEEP = [1, 0.5];
const LEAF_GROW = [1, 1.32];

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the leaf atlas

const ATLAS_CELL = 512;
/** Stroke widths below were drawn for a 256 px cell. */
const PX = ATLAS_CELL / 256;
const ATLAS_N = 2;

/**
 * Four clusters of cottonwood leaves in a 2 x 2 atlas (grey leaf, alpha cut-out; the shader tints it). Each cluster is a round clump of
 * small deltoid leaves (pointed tip, flat heart-shaped base, petiole) around the middle of its cell, drawn from the middle outward so the
 * ones deep in the clump are darker and the rim catches the light (the light-catching clumps of the concept art).
 */
/** The fourth atlas cell: a drooping clump of narrow willow leaves (long, thin, pointed at both ends). */
function drawWillowCluster(ctx: CanvasRenderingContext2D, ox: number, oy: number, rng: () => number): void {
  const n = 40;
  const cx0 = ox + ATLAS_CELL / 2, cy0 = oy + ATLAS_CELL / 2;
  const leaves: { ang: number; len: number; bx: number; by: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const th = rng() * Math.PI * 2, rr = 0.06 + 0.26 * Math.sqrt(rng());
    const px = Math.cos(th) * rr * ATLAS_CELL, py = Math.sin(th) * rr * ATLAS_CELL * 0.9;
    const out = Math.atan2(px, -py);
    leaves.push({ ang: out + (rng() - 0.5) * 1.1, len: ATLAS_CELL * (0.24 + 0.1 * rng()), bx: cx0 + px * 0.6, by: cy0 + py * 0.6 + 12 * PX, z: Math.min(1, (rr / 0.32) * 0.7 + rng() * 0.35) });
  }
  leaves.sort((a, b) => a.z - b.z);
  for (const L of leaves) {
    const grey = Math.round(255 * (0.5 + 0.5 * L.z));
    ctx.save();
    ctx.translate(L.bx, L.by);
    ctx.rotate(L.ang);
    ctx.scale(1, -1);
    const l = L.len, w = L.len * 0.17;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-w, l * 0.25, -w * 0.8, l * 0.7, 0, l);
    ctx.bezierCurveTo(w * 0.8, l * 0.7, w, l * 0.25, 0, 0);
    ctx.closePath();
    ctx.fillStyle = `rgb(${grey},${grey},${grey})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = PX;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, l * 0.92); ctx.stroke();
    ctx.restore();
  }
}

export function makeLeafAtlas(): THREE.Texture {
  const size = ATLAS_CELL * ATLAS_N;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(4242);
  for (let cy = 0; cy < ATLAS_N; cy++) {
    for (let cx = 0; cx < ATLAS_N; cx++) {
      const ox = cx * ATLAS_CELL, oy = cy * ATLAS_CELL;
      if (cy === 1 && cx === 1) { drawWillowCluster(ctx, ox, oy, rng); continue; }
      const n = 34 + Math.floor(rng() * 8);
      const cx0 = ox + ATLAS_CELL / 2, cy0 = oy + ATLAS_CELL / 2;
      // a round clump of small leaves, tips mostly outward: the leaves near the middle are deeper (drawn first, darker), the rim ones catch the light
      const leaves: { ang: number; len: number; bx: number; by: number; z: number }[] = [];
      for (let i = 0; i < n; i++) {
        const th = rng() * Math.PI * 2, rr = 0.1 + 0.3 * Math.sqrt(rng());
        const px = Math.cos(th) * rr * ATLAS_CELL, py = Math.sin(th) * rr * ATLAS_CELL * 0.92;
        // leaf axis: outward from the centre (angle from straight up, clockwise), with scatter
        const out = Math.atan2(px, -py);
        const ang = out + (rng() - 0.5) * 1.5;
        const len = ATLAS_CELL * (0.15 + 0.08 * rng());
        leaves.push({ ang, len, bx: cx0 + px * 0.7, by: cy0 + py * 0.7 + len * 0.18, z: Math.min(1, rr / 0.4 * 0.8 + rng() * 0.3) });
      }
      leaves.sort((a, b) => a.z - b.z);
      for (const L of leaves) {
        const grey = Math.round(255 * (0.46 + 0.54 * L.z));
        ctx.save();
        ctx.translate(L.bx, L.by);
        ctx.rotate(L.ang);
        ctx.scale(1, -1);
        const l = L.len, w = L.len * 0.92;
        // petiole
        ctx.strokeStyle = `rgb(${grey * 0.8 | 0},${grey * 0.8 | 0},${grey * 0.8 | 0})`;
        ctx.lineWidth = 2.2 * PX;
        ctx.beginPath(); ctx.moveTo(0, -l * 0.28); ctx.lineTo(0, l * 0.1); ctx.stroke();
        // blade: a flat heart-shaped base, widest about a third of the way up, tapering to a long point
        ctx.beginPath();
        ctx.moveTo(0, l * 0.04);
        ctx.bezierCurveTo(-w * 0.45, -l * 0.04, -w * 0.62, l * 0.3, -w * 0.28, l * 0.52);
        ctx.bezierCurveTo(-w * 0.14, l * 0.7, -w * 0.05, l * 0.86, 0, l);
        ctx.bezierCurveTo(w * 0.05, l * 0.86, w * 0.14, l * 0.7, w * 0.28, l * 0.52);
        ctx.bezierCurveTo(w * 0.62, l * 0.3, w * 0.45, -l * 0.04, 0, l * 0.04);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, l);
        g.addColorStop(0, `rgb(${grey * 0.78 | 0},${grey * 0.78 | 0},${grey * 0.78 | 0})`);
        g.addColorStop(1, `rgb(${Math.min(255, grey * 1.04) | 0},${Math.min(255, grey * 1.04) | 0},${Math.min(255, grey * 1.04) | 0})`);
        ctx.fillStyle = g;
        ctx.fill();
        // midrib and two veins a shade lighter
        ctx.strokeStyle = `rgba(255,255,255,0.35)`;
        ctx.lineWidth = 1.6 * PX;
        ctx.beginPath(); ctx.moveTo(0, l * 0.04); ctx.lineTo(0, l * 0.9); ctx.stroke();
        ctx.lineWidth = PX;
        ctx.beginPath(); ctx.moveTo(0, l * 0.2); ctx.lineTo(-w * 0.3, l * 0.5); ctx.moveTo(0, l * 0.2); ctx.lineTo(w * 0.3, l * 0.5); ctx.stroke();
        ctx.restore();
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- geometry

/** Branch skeleton in unit space (ux, uy: the metres of one unit; cottonwood bark is uniform 1/H0, tree height 1), dropping branch levels above maxLevel (twigs) for a coarser LOD. */
function buildBark(tree: EzTree, maxLevel: number, ux: number, uy: number): THREE.BufferGeometry {
  const { pos, nrm, idx, lvl } = tree.bark;
  const index: number[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    if (lvl[idx[i]] > maxLevel || lvl[idx[i + 1]] > maxLevel || lvl[idx[i + 2]] > maxLevel) continue;
    index.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const p = new Float32Array(pos.length), n = new Float32Array(nrm.length);
  for (let i = 0; i < pos.length; i += 3) {
    p[i] = pos[i] / ux; p[i + 1] = pos[i + 1] / uy; p[i + 2] = pos[i + 2] / ux;
    // (a normal moves with the inverse transpose of the position scale)
    const nx = nrm[i] * ux, ny = nrm[i + 1] * uy, nz = nrm[i + 2] * ux, nl = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / nl; n[i + 1] = ny / nl; n[i + 2] = nz / nl;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setIndex(index.length > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  return g;
}

/**
 * Leaf cards for one tree. Each anchor of the generator becomes a card rooted at its anchor and growing along its axis (the way the
 * library places a leaf), carrying a cluster from the atlas. The stored normal bends strongly toward the crown's own outward direction
 * (the crown shades like one soft dome, each card a facet of it), `aOcc` is dark deep in the crown and under it, `aRnd` decides which
 * cards the season drops first, and `aCenter` is where a dropped card shrinks to.
 * keep < 1 draws a share of the cards (the ones with the lowest aRnd), larger.
 */
function buildLeaves(tree: EzTree, keep: number, grow: number, seed: number, cells: number[], ux: number, uy: number): THREE.BufferGeometry {
  const rng = mulberry32(seed * 7717 + 5);
  const A = tree.anchors;
  // crown ellipsoid from the anchors
  let cx = 0, cz = 0, cyMin = 1e9, cyMax = -1e9;
  for (const a of A) { cx += a.o.x; cz += a.o.z; cyMin = Math.min(cyMin, a.o.y); cyMax = Math.max(cyMax, a.o.y); }
  cx /= A.length; cz /= A.length;
  const rs = A.map((a) => Math.hypot(a.o.x - cx, a.o.z - cz)).sort((a, b) => a - b);
  const rx = Math.max(2.5, rs[Math.floor(rs.length * 0.92)] * 1.2);
  const cy = cyMin + (cyMax - cyMin) * 0.46;
  const ry = Math.max(cyMax - cy, cy - cyMin) * 1.08 + 0.5;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], occ: number[] = [], rnd: number[] = [], cen: number[] = [], idx: number[] = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), C = new THREE.Vector3(), cardN = new THREE.Vector3(), E = new THREE.Vector3();
  let vi = 0;
  // pairs of anchors (the crossed quads of one leaf cluster) share their random numbers
  for (let k = 0; k < A.length; k += 2) {
    const r0 = rng(), cell = cells[Math.floor(rng() * cells.length)], flip = rng() < 0.5 ? -1 : 1, jit = rng();
    if (r0 >= keep) continue;
    const rr = r0 / keep;
    for (let q = 0; q < 2 && k + q < A.length; q++) {
      const a = A[k + q];
      const size = a.size * grow * (0.9 + 0.2 * jit);
      const W = size, L = size;
      cardN.crossVectors(a.a, a.s).normalize();
      // card centre, for the ellipsoid shading and as the point a dropped card shrinks to
      C.copy(a.o).addScaledVector(a.a, L * 0.5);
      const cu = (cell % ATLAS_N) / ATLAS_N, cv = 1 - (Math.floor(cell / ATLAS_N) + 1) / ATLAS_N;
      const corners: [number, number][] = [[-0.5, 1], [-0.5, 0], [0.5, 0], [0.5, 1]];
      const uvs: [number, number][] = [[0, 1], [0, 0], [1, 0], [1, 1]];
      for (let c = 0; c < 4; c++) {
        P.copy(a.o).addScaledVector(a.s, corners[c][0] * W * flip).addScaledVector(a.a, corners[c][1] * L);
        // ellipsoid outward direction at the card (nominal metres), and the shell depth 0 (core) .. 1 (outside)
        E.set((C.x - cx) / rx, (C.y - cy) / ry, (C.z - cz) / rx);
        const shell = clamp(E.length(), 0, 1.15);
        N.set(E.x / rx, E.y / ry, E.z / rx).normalize();
        if (N.lengthSq() < 1e-6) N.set(0, 1, 0);
        // card face turned outward, blended with the dome
        const fl = cardN.dot(N) < 0 ? -1 : 1;
        const nx = N.x * 0.72 + cardN.x * fl * 0.28, ny = N.y * 0.72 + cardN.y * fl * 0.28 + 0.14, nz = N.z * 0.72 + cardN.z * fl * 0.28;
        const nl = Math.hypot(nx * ux, ny * uy, nz * ux) || 1;
        pos.push(P.x / ux, P.y / uy, P.z / ux);
        nrm.push((nx * ux) / nl, (ny * uy) / nl, (nz * ux) / nl);
        uv.push(cu + uvs[c][0] / ATLAS_N, cv + uvs[c][1] / ATLAS_N);
        const o = 0.16 + 0.78 * Math.pow(shell, 1.35) + 0.26 * N.y;
        occ.push(clamp(o + (jit - 0.5) * 0.12, 0.12, 1));
        rnd.push(rr);
        cen.push(C.x / ux, C.y / uy, C.z / ux);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 1));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(cen, 3));
  g.setIndex(vi > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return g;
}

// ---------------------------------------------------------------- materials

/** The shader's leaf keep curve (0 bare .. 1 full) for a tree's season phase, shared by the colour pass and the shadow pass. */
const KEEP_GLSL = /* glsl */ `
float tgLeafKeep( float uLeaf, float phase ) {
  float keepRaw = clamp( uLeaf + ( phase - 0.5 ) * 0.5 * ( 4.0 * uLeaf * ( 1.0 - uLeaf ) ), 0.0, 1.0 );
  return smoothstep( 0.1, 0.55, keepRaw );
}
float tgLeafVis( float keep, float rnd ) {
  return 1.0 - smoothstep( keep * 1.08 - 0.07, keep * 1.08, rnd );
}
`;

function leafMaterial(shared: SharedUniforms, atlas: THREE.Texture, willow = false): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0, side: THREE.DoubleSide });
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    injectTerrainShadow(shader, shared);
    const u = shader.uniforms;
    u.uTime = shared.time; u.uWind = shared.wind;
    u.uLeaf = shared.leafAmount; u.uLeafA = shared.leafColorA; u.uLeafB = shared.leafColorB;
    u.uLightDir = shared.lightDir; u.uLightColor = shared.lightColor;
    u.uSnow = shared.snow;
    u.uOccCam = shared.occCam; u.uOccFocus = shared.occFocus; u.uOccParams = shared.occParams;
    u.tLeaf = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `attribute vec2 aUv;\nattribute float aOcc;\nattribute float aRnd;\nattribute vec3 aCenter;\nvarying vec2 vLeafUv;\nvarying float vOcc;\nvarying float vRnd;\nuniform float uTime;\nuniform vec3 uWind;\nuniform float uLeaf;\n${KEEP_GLSL}\nvoid main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOcc = aOcc; vRnd = aRnd; vLeafUv = aUv;
        { float tgVis = tgLeafVis( tgLeafKeep( uLeaf, instanceColor.b ), aRnd ); transformed = mix( aCenter, transformed, tgVis ); }`)
      .replace('#include <project_vertex>', swayChunk(true));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec2 vLeafUv;
        varying float vOcc;
        varying float vRnd;
        uniform sampler2D tLeaf;
        uniform float uLeaf;
        uniform vec3 uLeafA;
        uniform vec3 uLeafB;
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform float uSnow;
        ${NOISE_GLSL}
        ${OCCLUDE_GLSL}
        ${WORLDPOS_GLSL}
        vec3 tgSafeNorm( vec3 v ){ return v * inversesqrt( max( dot( v, v ), 1e-10 ) ); }
        void main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          gTgShadow = tgSampleTerrainShadow();
          vec4 lt = texture2D( tLeaf, vLeafUv );
          vec3 inst = diffuseColor.rgb; // instance colour: (brightness, hue shift, season phase)
          vec3 wpw = tgFragWorld();
          diffuseColor.a = lt.a * tgOcclusionFade( wpw );
          float occ = clamp( vOcc, 0.0, 1.0 );
          float mixT = clamp( 0.5 + ( vRnd - 0.5 ) * 0.5 + ( inst.g - 0.5 ) * 0.95 + ( lt.r - 0.75 ) * 0.5, 0.0, 1.0 );
          // autumn gold: the season's leaf colour ramps from green toward amber, and each tree turns on its own schedule
          float tgRatio = uLeafA.r / ( uLeafA.g + 0.01 );
          float autK = smoothstep( 0.86, 1.22, tgRatio );
          float turnT = smoothstep( inst.b * 0.45, inst.b * 0.45 + 0.4, autK );
          float sumW = smoothstep( 0.76, 0.86, tgRatio );
          vec3 lA = mix( uLeafA, vec3( 0.046, 0.082, 0.026 ), sumW );
          vec3 lB = mix( uLeafB, vec3( 0.12, 0.17, 0.034 ), sumW );
          vec3 gA = mix( vec3( 0.34, 0.185, 0.022 ), uLeafA, 0.35 );
          vec3 gB = mix( vec3( 0.66, 0.42, 0.045 ), uLeafB, 0.3 );
          vec3 leaf = mix( mix( lA, gA, turnT ), mix( lB, gB, turnT ), mixT );
          leaf *= mix( vec3( 0.9, 1.0, 1.08 ), vec3( 1.12, 1.0, 0.82 ), clamp( inst.b * 0.5 + inst.g * 0.5, 0.0, 1.0 ) );
          float shade = 0.2 + 0.9 * pow( occ, 1.15 );
          shade = mix( shade, max( shade, 0.74 ), tgOcclusionLift( wpw ) );
          // the grey leaf texture is the leaf-scale light and dark (deep leaves darker, veins lighter)
          ${willow ? 'leaf = mix( leaf, leaf * vec3( 0.86, 1.1, 0.72 ), 0.8 ); leaf = mix( leaf, mix( vec3( 0.06, 0.11, 0.03 ), vec3( 0.14, 0.2, 0.05 ), mixT ), 0.45 * ( 1.0 - autK ) );' : ''}
          leaf *= shade * ( 0.42 + 0.9 * lt.r ) * inst.r;
          leaf = mix( leaf, leaf * vec3( 1.12, 1.08, 0.78 ), 0.5 * smoothstep( 0.5, 1.0, occ ) );
          diffuseColor.rgb = mix( leaf, vec3( 0.9, 0.93, 1.0 ), uSnow * 0.5 * smoothstep( 0.3, 0.9, occ ) );
        }`)
      // a card is lit the same from both faces (its stored normal already points out of the crown): no back-face flip
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = tgSafeNorm( vNormal );
        if ( !( dot( normal, normal ) > 0.25 ) ) normal = vec3( 0.0, 1.0, 0.0 );
        nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 Lv = tgSafeNorm( mat3( viewMatrix ) * uLightDir );
          vec3 Vv = tgSafeNorm( vViewPosition );
          float backD = max( dot( -Vv, Lv ), 0.0 );
          float rimT = 1.0 - abs( dot( tgSafeNorm( vNormal ), Vv ) );
          // light through the leaves: strongest looking toward the sun, strongest at thin silhouette edges
          float back = pow( backD, 1.7 );
          float wrapB = pow( backD, 0.9 );
          vec3 warm = diffuseColor.rgb * vec3( 1.2, 1.1, 0.62 );
          totalEmissiveRadiance += warm * uLightColor * ( back * ( 0.2 + 0.6 * rimT * rimT ) + 0.04 * wrapB ) * gTgShadow * ( 0.35 + 0.65 * clamp( vOcc, 0.0, 1.0 ) );
          totalEmissiveRadiance += diffuseColor.rgb * 0.045 * ( 1.0 - clamp( vOcc, 0.0, 1.0 ) );
        }`);
    shader.fragmentShader = injectSafeOutput(shader.fragmentShader);
  };
  mat.customProgramCacheKey = () => (willow ? 'tg-leaf3-willow-v1' : 'tg-leaf3-v1');
  return mat;
}

/** Shadow caster for the leaf cards: the same shrink-to-centre and sway, and the cluster's own alpha cut-out (a card is not a rectangle of shade). */
function leafDepthMaterial(shared: SharedUniforms, atlas: THREE.Texture): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.time; shader.uniforms.uWind = shared.wind; shader.uniforms.uLeaf = shared.leafAmount;
    shader.uniforms.tLeaf = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `attribute vec2 aUv;\nattribute float aRnd;\nattribute vec3 aCenter;\nvarying vec2 vLeafUv;\nuniform float uTime;\nuniform vec3 uWind;\nuniform float uLeaf;\n${KEEP_GLSL}\nvoid main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLeafUv = aUv;
        { float tgVis = tgLeafVis( tgLeafKeep( uLeaf, instanceColor.b ), aRnd ); transformed = mix( aCenter, transformed, tgVis ); }`)
      .replace('#include <project_vertex>', swayChunk(false));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec2 vLeafUv;\nuniform sampler2D tLeaf;\nvoid main() {\n  if ( texture2D( tLeaf, vLeafUv ).a < 0.5 ) discard;');
  };
  mat.customProgramCacheKey = () => 'tg-leaf3-depth-v1';
  return mat;
}

// ---------------------------------------------------------------- the layer

/** What Trees.place() tells the layer about one tree (all numbers it already computed for the lump crowns). */
export interface Tree3Place {
  x: number; y: number; z: number;
  h: number; r: number;
  rot: number; lean: number; leanA: number; grow: number;
  /** Crown width factors (the lump crowns' own `sw` and its z squash). */
  sw: number; swz: number;
  burned: boolean;
  /** Instance colours: leaves (brightness, hue shift, season phase) and bark. */
  col: [number, number, number];
  bark: [number, number, number];
}

export class Trees3 {
  readonly pools: Pool[] = [];
  private slots = new Map<number, { pool: Pool; slot: number }>();
  private dummy = new THREE.Object3D();
  private disposables: { dispose(): void }[] = [];
  /** Build time of the variants in ms, for the log and the bench. */
  readonly buildMs: number;
  verts = 0;
  private willowMat: THREE.MeshStandardMaterial;
  private leafDepth: THREE.Material;
  private bark: THREE.Material;
  private depthMat: THREE.Material;

  constructor(group: THREE.Group, meshes: THREE.InstancedMesh[], shared: SharedUniforms, bark: THREE.Material, depthMat: THREE.Material, capacity: number[]) {
    const t0 = performance.now();
    this.dummy.rotation.order = 'YXZ';
    const atlas = makeLeafAtlas();
    const leafMat = leafMaterial(shared, atlas);
    const leafDepth = leafDepthMaterial(shared, atlas);
    this.willowMat = leafMaterial(shared, atlas, true);
    this.leafDepth = leafDepth;
    this.bark = bark;
    this.depthMat = depthMat;
    this.disposables.push(atlas, leafMat, leafDepth, this.willowMat);
    for (let v = 0; v < VARIANTS3; v++) {
      const tree = generateEzTree(cottonwoodParams(v));
      const pool = new Pool(Math.max(64, Math.ceil(capacity[v] * 1.6) + 32), LEAF_LIM, BARK_LIM);
      LEAF_KEEP.forEach((keep, li) => {
        const g = buildLeaves(tree, keep, LEAF_GROW[li], v + 1, COTTON_CELLS, R0, H0);
        this.disposables.push(g);
        this.verts += g.getAttribute('position').count;
        pool.addMesh('crown', g, leafMat, `cottonwood-crown-t3-${v}-lod${li}`, true, group, meshes, leafDepth);
      });
      [3, 2].forEach((maxLevel, li) => {
        const g = buildBark(tree, maxLevel, H0, H0);
        this.disposables.push(g);
        this.verts += g.getAttribute('position').count;
        pool.addMesh('bark', g, bark, `cottonwood-bark-t3-${v}-lod${li}`, true, group, meshes, depthMat);
      });
      this.pools.push(pool);
    }
    this.buildMs = performance.now() - t0;
  }

  /**
   * Fill one willow thicket pool (trees.ts builds the pool, with the thicket distance bands: three leaf bands and two stem bands): the
   * same instance matrices as the old lump thickets (unit space: radius 1, height 1, scaled per thicket), a branching vase of slender
   * stems carrying narrow-leaf clusters. In winter the leaves go and the stems stay, as a bare orange-red thicket.
   */
  fillWillowPool(pool: Pool, v: number, group: THREE.Group, meshes: THREE.InstancedMesh[]): void {
    const tree = generateEzTree(willowParams(v));
    [1, 0.5, 0.22].forEach((keep, li) => {
      const g = buildLeaves(tree, keep, [1, 1.3, 1.9][li], 50 + v, WILLOW_CELLS, W0, TH0);
      this.disposables.push(g);
      this.verts += g.getAttribute('position').count;
      pool.addMesh('crown', g, this.willowMat, `shrubs-willow3-leaf-${v}-lod${li}`, false, group, meshes, this.leafDepth);
    });
    [2, 1].forEach((maxLevel, li) => {
      const g = buildBark(tree, maxLevel, W0, TH0);
      this.disposables.push(g);
      this.verts += g.getAttribute('position').count;
      pool.addMesh('bark', g, this.bark, `shrubs-willow3-bark-${v}-lod${li}`, false, group, meshes, this.depthMat);
    });
  }

  add(id: number, p: Tree3Place): void {
    this.remove(id);
    const pool = this.pools[id % VARIANTS3];
    const slot = pool.alloc();
    this.slots.set(id, { pool, slot });
    const { dummy } = this;
    pool.pos[slot * 3] = p.x; pool.pos[slot * 3 + 1] = p.y + p.h * 0.6; pool.pos[slot * 3 + 2] = p.z;
    pool.cols[slot * 3] = p.col[0]; pool.cols[slot * 3 + 1] = p.col[1]; pool.cols[slot * 3 + 2] = p.col[2];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(Math.cos(p.leanA) * p.lean, p.rot, Math.sin(p.leanA) * p.lean);
    // leaf cards: x,z in crown radii, y in tree heights
    dummy.scale.set(p.r * p.sw * p.grow, p.h * p.grow, p.r * p.sw * p.grow * p.swz);
    dummy.updateMatrix();
    dummy.matrix.toArray(pool.crownMats, slot * 16);
    // bark: a uniform 1/14 scale, so its horizontal scale carries the same crown width in tree-height units
    const k = H0 / R0;
    dummy.scale.set(p.r * p.sw * p.grow * k, p.h * p.grow, p.r * p.sw * p.grow * p.swz * k);
    dummy.updateMatrix();
    dummy.matrix.toArray(pool.barkMats, slot * 16);
    pool.barkCols[slot * 3] = p.bark[0]; pool.barkCols[slot * 3 + 1] = p.bark[1]; pool.barkCols[slot * 3 + 2] = p.bark[2];
    pool.barkOn[slot] = 1;
    pool.crownOn[slot] = p.burned ? 0 : 1;
  }

  remove(id: number): void {
    const s = this.slots.get(id);
    if (!s) return;
    s.pool.release(s.slot);
    this.slots.delete(id);
  }

  /** Switch every cottonwood pool of the layer on or off (the A/B toggle). */
  setActive(on: boolean): void {
    for (const p of this.pools) { p.off = !on; p.dirty = true; }
  }

  update(cam: THREE.Vector3, force = false): void {
    for (const p of this.pools) p.update(cam, force);
  }

  get count(): number { return this.slots.size; }

  dispose(): void { for (const d of this.disposables) d.dispose(); }
}
