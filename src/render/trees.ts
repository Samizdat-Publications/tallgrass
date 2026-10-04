// Cottonwoods and shrubs as instanced meshes. Each tree is a bark mesh (trunk, limbs, twigs) plus a crown of
// noise-displaced lumps whose normals are blended toward the crown's outward direction for soft, billowy
// shading. Foliage uses a procedural leaf cut-out so winter leaves thin out to the branch skeleton.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { NOISE_GLSL, OCCLUDE_GLSL, SharedUniforms, clamp, fbm2, hash2, injectSafeOutput, injectTerrainShadow, smoothstep, vnoise2 } from './common';

const R0 = 6; // nominal crown radius in meters the unit crown is designed for
const H0 = 14; // nominal tree height
const VARIANTS = 4;
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
  lumpCenters: THREE.Vector3[]; // in H units (bark space)
}

/**
 * Crown in unit space: x,z in crown-radius units, y in height units. Many small lumps spread through an oblate shell
 * volume (not a few big balls): the leaf-cluster cut-out in the shader turns them into airy, scalloped foliage with
 * gaps, and interior lumps are darker so the gaps read as depth.
 */
function buildCrown(seed: number, detail: number): CrownBuild {
  const rng = mulberry32(seed * 7919 + 13);
  const lumps: { c: THREE.Vector3; rho: number; sx: number }[] = [];
  const cy0 = 0.58, cyR = 0.3;
  const N = 56 + Math.floor(rng() * 8);
  for (let i = 0; i < N; i++) {
    // random direction, radius biased toward the shell
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = 0.38 + 0.62 * Math.pow(rng(), 0.55);
    const yy = dy < 0 ? dy * 0.72 : dy;
    lumps.push({
      c: new THREE.Vector3(dx * rad * 0.9, cy0 + yy * rad * cyR, dz * rad * 0.9),
      rho: 0.13 + rng() * 0.1,
      sx: 0.85 + rng() * 0.4,
    });
  }
  // a cap of small lumps on top so the crown has a rounded crest
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.3;
    lumps.push({ c: new THREE.Vector3(Math.cos(a) * r, 0.85 + rng() * 0.04, Math.sin(a) * r), rho: 0.2 + rng() * 0.1, sx: 1 });
  }

  const ico = new THREE.IcosahedronGeometry(1, detail);
  const ip = ico.getAttribute('position');
  const pos: number[] = [], nrm: number[] = [], occ: number[] = [], lmp: number[] = [];
  const Cw = new THREE.Vector3(0, cy0 * H0, 0);
  const dir = new THREE.Vector3(), Pw = new THREE.Vector3(), cr = new THREE.Vector3(), nw = new THREE.Vector3();
  lumps.forEach((L, li) => {
    for (let v = 0; v < ip.count; v++) {
      dir.fromBufferAttribute(ip, v).normalize();
      const n1 = vnoise2(dir.x * 2.1 + dir.z * 1.3 + li * 7.1, dir.y * 2.3 - dir.z * 0.9, seed);
      const n2 = vnoise2(dir.x * 5.3 - dir.y * 2.1, dir.z * 5.1 + dir.y * 3.3 + li, seed + 5);
      const r = L.rho * (1 + 0.3 * (n1 - 0.5) + 0.14 * (n2 - 0.5));
      const px = L.c.x + dir.x * r * L.sx, py = L.c.y + dir.y * r * (R0 / H0) * 0.85, pz = L.c.z + dir.z * r / L.sx;
      pos.push(px, py, pz);
      Pw.set(px * R0, py * H0, pz * R0);
      cr.copy(Pw).sub(Cw);
      const dist = cr.length();
      cr.normalize();
      nw.set(dir.x * 0.1 + cr.x * 0.9, dir.y * 0.1 + cr.y * 0.9 + 0.2, dir.z * 0.1 + cr.z * 0.9).normalize();
      const nu = new THREE.Vector3(nw.x * R0, nw.y * H0, nw.z * R0).normalize();
      nrm.push(nu.x, nu.y, nu.z);
      // interior and underside darker, sunlit outer top bright
      const shell = clamp(dist / (R0 * 0.9), 0, 1.15);
      occ.push(clamp(0.06 + 0.78 * Math.pow(shell, 1.5) + 0.3 * cr.y, 0.04, 1));
      lmp.push(((li * 0.6180339) % 1));
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aOcc', new THREE.Float32BufferAttribute(occ, 1));
  geo.setAttribute('aLump', new THREE.Float32BufferAttribute(lmp, 1));
  ico.dispose();
  return { geo, lumpCenters: lumps.map((l) => new THREE.Vector3(l.c.x * (R0 / H0), l.c.y, l.c.z * (R0 / H0))) };
}

/**
 * Tree skeleton in H units (1 = tree height): a tapered trunk, a fork into primary limbs, then three more generations of
 * branches that get thinner and shorter toward the tips (secondary, tertiary, twigs). Every tip is kept inside the crown
 * ellipsoid. Twigs whose tip lies in the outer shell are flagged (aTw) so the vertex shader can grow them out as the leaves
 * drop: with leaves on, branch tips stay hidden inside the foliage; bare, the full fine silhouette shows.
 * maxLevel picks the LOD: 4 all twigs, 3 no outer twigs, 2 only trunk, limbs and secondaries.
 */
const CROWN_C = 0.58, CROWN_A = 0.38, CROWN_B = 0.31;
function shellE(x: number, y: number, z: number): number {
  const dy = (y - CROWN_C) / CROWN_B;
  return (x * x + z * z) / (CROWN_A * CROWN_A) + dy * dy;
}

function buildTreeBark(seed: number, maxLevel: number): THREE.BufferGeometry {
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
    for (let it = 0; it < 6 && shellE(end.x, end.y, end.z) > limit; it++) {
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
    const outer = shellE(tip.x, tip.y, tip.z) > 0.55;
    tube(pts, radii, maxLevel <= 1 ? 3 : maxLevel <= 2 ? Math.min(L.sides, 4) : L.sides, outer && level >= 3 ? 1 : 0);
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
  const bend = V((rng() - 0.5) * 0.05, 0, (rng() - 0.5) * 0.05);
  const forkY = 0.3 + rng() * 0.04;
  const trunk = [V(0, -0.03, 0), V(bend.x * 0.3, 0.08, bend.z * 0.3), V(bend.x * 0.7, 0.19, bend.z * 0.7), V(bend.x, forkY, bend.z)];
  tube(trunk, [0.046, 0.034, 0.028, 0.024], maxLevel >= 3 ? 8 : maxLevel === 2 ? 6 : 5, 0);
  const fork = trunk[trunk.length - 1];
  const nPrim = 4;
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < nPrim; i++) {
    const a = a0 + (i / nPrim) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const tilt = i === 0 ? 0.18 + rng() * 0.12 : 0.55 + rng() * 0.45; // one near-vertical leader, the rest lean out
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

// ---------------------------------------------------------------- shader pieces

function swayChunk(flutter: boolean): string {
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

const WORLDPOS_GLSL = /* glsl */ `
vec3 tgFragWorld(){ return cameraPosition + transpose( mat3( viewMatrix ) ) * ( -vViewPosition ); }
`;

function foliageMaterial(shared: SharedUniforms, shrub: boolean): THREE.MeshStandardMaterial {
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
    u.uOccCam = shared.occCam; u.uOccFocus = shared.occFocus; u.uOccParams = shared.occParams;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float aOcc;\nattribute float aLump;\nvarying float vOcc;\nvarying float vLump;\nvarying vec3 vObj;\nuniform float uTime;\nuniform vec3 uWind;\nvoid main() {`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOcc = aOcc; vLump = aLump; vObj = position;')
      .replace('#include <project_vertex>', swayChunk(true));
    const cell = shrub ? '0.42' : '0.5';
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
          float lod = smoothstep( 60.0, 190.0, fdist );
          float keepRaw = clamp( uLeaf + ( inst.b - 0.5 ) * 0.5 * ( 4.0 * uLeaf * ( 1.0 - uLeaf ) ) ${shrub ? '+ 0.45 * ( 1.0 - uLeaf )' : ''}, 0.0, 1.0 );
          // below about 0.1 a cottonwood is bare; in between leaves thin out one by one, not in whole clusters
          float keep = ${shrub ? 'keepRaw' : 'smoothstep( 0.1, 0.55, keepRaw )'};
          float rim = 1.0 - abs( dot( tgSafeNorm( vNormal ), tgSafeNorm( vViewPosition ) ) );
          float occC = clamp( vOcc, 0.0, 1.0 );

          // leaf puffs: nearest-point 3D cells in world space (about ${cell} m), each a ROUND clump with a ragged edge, not a polygon
          float F1 = 9.0;
          vec3 cid = vec3( 0.0 ), crel = vec3( 0.0 );
          float tone = 0.5, puff = 0.5, puffMask = 1.0;
          if ( lod < 0.999 ) {
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
            float rad = mix( ${shrub ? '0.7, 1.0' : '0.92, 1.18'}, tgHash31( cid + 3.7 ) );
            float pn = ( tgNoise3( wpw * 5.0 ) - 0.5 ) * 0.24 + ( tgNoise3( wpw * 13.0 ) - 0.5 ) * 0.2;
            puffMask = smoothstep( rad, rad - 0.34, F1 + pn );
            gTgPuff = -crel;
          }
          // leaves: speckle at leaf scale, dropped by the season and more often at silhouettes and on the dark underside
          float fine = tgNoise3( wpw * 8.5 ) * 0.5 + tgNoise3( wpw * 19.0 ) * 0.5;
          float edgeBias = rim * rim * 0.5 + ( 1.0 - occC ) * ${shrub ? '0.12' : '0.2'};
          float leafThr = keep * 1.05 - edgeBias;
          float leafMask = smoothstep( leafThr + 0.07, leafThr - 0.07, fine );
          float cover = puffMask * leafMask;
          gTgFine = fine;
          // distance: a solid canopy with a soft ragged silhouette (a flat partial alpha dithers into smoke under MSAA)
          float farN = tgNoise3( wpw * 1.6 + 4.0 );
          float farCover = ${shrub ? '0.78 * ( 0.05 + 0.95 * keep )' : 'smoothstep( 0.06, 0.45, keepRaw ) * ( 1.0 - 0.85 * smoothstep( 0.62, 1.0, rim + ( farN - 0.5 ) * 0.5 ) )'};
          cover = mix( cover, farCover, lod );
          float fade = tgOcclusionFade( wpw );
          diffuseColor.a = cover * fade;

          float mixT = clamp( 0.5 + ( tone - 0.5 ) * 0.6 + ( inst.g - 0.5 ) * 0.5 + ( vLump - 0.5 ) * 0.06, 0.0, 1.0 );
          vec3 leaf = mix( uLeafA, uLeafB, mixT );
          // vOcc is interpolated per MSAA pixel center and can overshoot at silhouette pixels: clamp before any pow
          float occ = clamp( vOcc, 0.0, 1.0 );
          float shade = 0.2 + 0.9 * pow( occ, 1.15 );
          shade *= mix( 0.8 + 0.34 * puff, 1.0, lod );
          // leaf-scale tonal speckle and a slightly lighter, yellower tip on the sunlit shell
          leaf *= shade * ( 0.76 + 0.2 * tgNoise3( wpw * 2.6 ) + 0.85 * ( fine - 0.5 ) + 0.45 * ( tgNoise3( wpw * 26.0 ) - 0.5 ) + 0.14 * tgNoise3( wpw * 9.0 ) ) * inst.r;
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
          if ( pl > 1e-4 ) normal = tgSafeNorm( normal + mat3( viewMatrix ) * ( gTgPuff * ( 0.15 * inversesqrt( pl ) ) ) );
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
          vec3 warm = diffuseColor.rgb * vec3( 1.2, 1.1, 0.62 );
          totalEmissiveRadiance += warm * uLightColor * back * ( 0.16 + 0.55 * rimT * rimT ) * gTgShadow * ( 0.35 + 0.65 * clamp( vOcc, 0.0, 1.0 ) );
          // and a little of the sky seeping through the dark underside so it never goes to flat black
          totalEmissiveRadiance += diffuseColor.rgb * 0.045 * ( 1.0 - clamp( vOcc, 0.0, 1.0 ) );
        }`,
      );
    shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
  };
  mat.customProgramCacheKey = () => (shrub ? 'tg-shrub-v5' : 'tg-foliage-v5');
  return mat;
}

function barkMaterial(shared: SharedUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9a8870'), roughness: 0.96, metalness: 0 });
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    injectTerrainShadow(shader, shared);
    shader.uniforms.uTime = shared.time; shader.uniforms.uWind = shared.wind;
    shader.uniforms.uOccCam = shared.occCam; shader.uniforms.uOccFocus = shared.occFocus; shader.uniforms.uOccParams = shared.occParams;
    shader.uniforms.uLeaf = shared.leafAmount; shader.uniforms.uSnow = shared.snow;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uTime;\nuniform vec3 uWind;\nuniform float uLeaf;\nattribute float aTw;\nattribute vec3 aBase;\nvarying vec3 vBarkPos;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // outer twigs grow out of their base as the leaves drop (hidden inside the foliage while it is thick)
        float tgGrow = aTw > 0.5 ? smoothstep( 0.82, 0.32, uLeaf ) : 1.0;
        transformed = mix( aBase, transformed, tgGrow );
        vBarkPos = transformed;`)
      .replace('#include <project_vertex>', swayChunk(false));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vBarkPos;\nuniform float uSnow;\n${NOISE_GLSL}\n${OCCLUDE_GLSL}\n${WORLDPOS_GLSL}\nvoid main() {`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // furrowed bark: vertical streaks, darker toward the base, pale lichen flecks
          float fur = tgNoise3(vec3(vBarkPos.x * 160.0, vBarkPos.y * 12.0, vBarkPos.z * 160.0));
          float fur2 = tgNoise3(vec3(vBarkPos.x * 420.0, vBarkPos.y * 30.0, vBarkPos.z * 420.0));
          float lichen = smoothstep(0.72, 0.9, tgNoise3(vBarkPos * 90.0 + 3.0));
          diffuseColor.rgb *= (0.55 + 0.7 * fur) * (0.85 + 0.3 * fur2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.55, 0.38), lichen * 0.35);
          diffuseColor.rgb *= 0.75 + 0.25 * smoothstep(0.0, 0.25, vBarkPos.y);
          // twigs and thin branches are paler and warmer toward the tips
          // snow dusting: upward-facing surfaces catch it first (upper sides of limbs, the fork), lightly and unevenly
          vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
          float upk = dot( normalize( vNormal ), upV );
          float dust = smoothstep( 0.04, 0.55, uSnow ) * smoothstep( -0.05, 0.7, upk ) * ( 0.55 + 0.45 * tgNoise3( vBarkPos * 55.0 + 9.0 ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.82, 0.84, 0.88 ), clamp( dust * 1.15, 0.0, 0.92 ) );
          diffuseColor.a = tgOcclusionFade( tgFragWorld() );
        }`,
      );
    shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
  };
  mat.customProgramCacheKey = () => 'tg-bark-v5';
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

/** Distance LOD for one family of instances: copies each instance's matrix into the mesh for its band. */
class LodInstances {
  private lastX = 1e9; private lastY = 1e9; private lastZ = 1e9;
  constructor(
    private count: number,
    private mats: Float32Array,
    private cols: Float32Array | null,
    private pos: Float32Array, // x, y(center height), z per instance
    private meshes: THREE.InstancedMesh[],
    private limits: number[], // upper distance of each mesh's band (last may be Infinity)
  ) {}

  update(cam: THREE.Vector3, force = false): void {
    const m = Math.abs(cam.x - this.lastX) + Math.abs(cam.y - this.lastY) + Math.abs(cam.z - this.lastZ);
    if (!force && m < 2.5 + cam.y * 0.02) return;
    this.lastX = cam.x; this.lastY = cam.y; this.lastZ = cam.z;
    const n = this.meshes.length;
    const fill = new Int32Array(n);
    const lim2 = this.limits.map((l) => l * l);
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3] - cam.x, dy = this.pos[i * 3 + 1] - cam.y, dz = this.pos[i * 3 + 2] - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      let l = 0;
      while (l < n && d2 >= lim2[l]) l++;
      if (l >= n) continue;
      const mesh = this.meshes[l];
      const k = fill[l]++;
      (mesh.instanceMatrix.array as Float32Array).set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
      if (this.cols && mesh.instanceColor) (mesh.instanceColor.array as Float32Array).set(this.cols.subarray(i * 3, i * 3 + 3), k * 3);
    }
    for (let l = 0; l < n; l++) {
      const mesh = this.meshes[l];
      mesh.count = fill[l];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

export class Trees {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
  treeCount = 0;
  shrubCount = 0;
  rockCount = 0;
  private crownsShown = true;
  private disposables: { dispose(): void }[] = [];
  private lods: LodInstances[] = [];

  constructor(world: World, shared: SharedUniforms, heightAt: (x: number, z: number) => number) {
    this.group.name = 'trees';
    const foliageMat = foliageMaterial(shared, false);
    const shrubMat = foliageMaterial(shared, true);
    const bark = barkMaterial(shared);
    const depthMat = swayDepthMaterial(shared);
    this.disposables.push(foliageMat, shrubMat, bark, depthMat);

    // collect tree placements: the valley's own trees, then distant tree lines beyond the rim
    interface P { x: number; z: number; h: number; r: number; far: boolean }
    const places: P[] = [];
    for (let i = 0; i < world.trees.length; i += 4) {
      places.push({ x: world.trees[i], z: world.trees[i + 1], h: world.trees[i + 2], r: world.trees[i + 3], far: false });
    }
    const S = world.size;
    for (let k = 0; k < 9000 && places.length < world.trees.length / 4 + 520; k++) {
      const x = -1100 + hash2(k, 1, 71) * (S + 2200);
      const z = -1100 + hash2(k, 2, 71) * (S + 2200);
      if (x > -30 && x < S + 30 && z > -30 && z < S + 30) continue;
      const g = fbm2(x * 0.011 + 3, z * 0.011 - 9, 3, 5);
      if (g < 0.58 || hash2(k, 3, 71) > smoothstep(0.58, 0.7, g) * 0.9) continue;
      const h = 11 + hash2(k, 4, 71) * 13;
      places.push({ x, z, h, r: h * (0.4 + hash2(k, 5, 71) * 0.1), far: true });
    }
    this.treeCount = places.length;

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const crownDetails = [2, 1, 0];
    const crownLimits = [60, 190, Infinity];
    for (let v = 0; v < VARIANTS; v++) {
      const mine = places.filter((_, i) => i % VARIANTS === v);
      const N = mine.length;
      if (!N) continue;
      const crownMats = new Float32Array(N * 16), barkMats = new Float32Array(N * 16);
      const cols = new Float32Array(N * 3), pos = new Float32Array(N * 3);
      mine.forEach((p, i) => {
        const y = heightAt(p.x, p.z) - 0.2;
        const rot = hash2(i, v, 13) * Math.PI * 2;
        dummy.position.set(p.x, y, p.z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(p.h, p.h, p.h);
        dummy.updateMatrix();
        dummy.matrix.toArray(barkMats, i * 16);
        const sw = (0.92 + hash2(i, v, 17) * 0.2) * 0.8;
        dummy.scale.set(p.r * sw, p.h * 0.94, p.r * sw * (0.92 + hash2(i, v, 19) * 0.16));
        dummy.updateMatrix();
        dummy.matrix.toArray(crownMats, i * 16);
        // (brightness, hue shift, season phase)
        col.setRGB(0.85 + hash2(i, v, 23) * 0.3, hash2(i, v, 29), hash2(i, v, 31));
        cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
        pos[i * 3] = p.x; pos[i * 3 + 1] = y + p.h * 0.6; pos[i * 3 + 2] = p.z;
      });

      const crownMeshes: THREE.InstancedMesh[] = [];
      crownDetails.forEach((detail, li) => {
        const crown = buildCrown(v + 1, detail);
        this.disposables.push(crown.geo);
        const m = new THREE.InstancedMesh(crown.geo, foliageMat, N);
        m.name = `cottonwood-crown-${v}-lod${li}`;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
        crownMeshes.push(m);
      });
      const barkGeos = [buildTreeBark(v + 1, 4), buildTreeBark(v + 1, 2), buildTreeBark(v + 1, 1)];
      this.disposables.push(...barkGeos);
      const barkMeshes = barkGeos.map((g, li) => {
        const m = new THREE.InstancedMesh(g, bark, N);
        m.name = `cottonwood-bark-${v}-lod${li}`;
        return m;
      });
      for (const m of [...crownMeshes, ...barkMeshes]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.customDepthMaterial = depthMat;
        m.count = 0;
        this.group.add(m);
        this.meshes.push(m);
      }
      this.lods.push(new LodInstances(N, crownMats, cols, pos, crownMeshes, crownLimits));
      this.lods.push(new LodInstances(N, barkMats, null, pos, barkMeshes, [48, 140, Infinity]));
    }

    // shrubs: thin the sim's even scatter into thickets (along water, in draws and on rocky slopes), vary size, shape and family,
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
    if (ns > 0) {
      const mats = new Float32Array(ns * 16), cols = new Float32Array(ns * 3), pos = new Float32Array(ns * 3);
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
        dummy.matrix.toArray(mats, q * 16);
        // (brightness, family, season phase): families spread across sage, olive, dark green and dry brown
        col.setRGB(0.75 + hash2(i, 10, 3) * 0.5, hash2(i, 11, 3), hash2(i, 12, 3));
        cols[q * 3] = col.r; cols[q * 3 + 1] = col.g; cols[q * 3 + 2] = col.b;
        pos[q * 3] = x; pos[q * 3 + 1] = y + 0.4; pos[q * 3 + 2] = z;
      }
      const shrubMeshes: THREE.InstancedMesh[] = [];
      [2, 1, 0].forEach((detail, li) => {
        const g = buildShrubGeometry(detail);
        this.disposables.push(g);
        const m = new THREE.InstancedMesh(g, shrubMat, ns);
        m.name = `shrubs-lod${li}`;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ns * 3), 3);
        m.castShadow = li < 2;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.customDepthMaterial = depthMat;
        m.count = 0;
        this.group.add(m);
        this.meshes.push(m);
        shrubMeshes.push(m);
      });
      this.lods.push(new LodInstances(ns, mats, cols, pos, shrubMeshes, [38, 240, 900]));
    }

    // rock outcrops: angular, partly buried stones in clusters on rocky slopes and ridges (a few lone ones on the flats)
    this.buildOutcrops(world, shared, heightAt);
    this.update(new THREE.Vector3(world.size / 2, 100, world.size / 2), true);
  }

  /** Re-bucket instances by distance to the camera (cheap; skips when the camera has barely moved). */
  update(cam: THREE.Vector3, force = false): void {
    for (const l of this.lods) l.update(cam, force);
  }

  /** Bare winter trees: hide the cottonwood crowns entirely so only clean branches remain. */
  setLeafAmount(leaf: number): void {
    const show = leaf > 0.1;
    if (show === this.crownsShown) return;
    this.crownsShown = show;
    for (const m of this.meshes) if (m.name.startsWith('cottonwood-crown')) m.visible = show;
  }

  private buildOutcrops(world: World, shared: SharedUniforms, heightAt: (x: number, z: number) => number): void {
    // geometry: a faceted lump with flat normals, three variants
    const geos: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 3; v++) {
      const ico = new THREE.IcosahedronGeometry(1, 1);
      const pa = ico.getAttribute('position');
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const n = vnoise2(x * 2.2 + v * 7, y * 2.4 + z * 1.7, 31 + v);
        const k = 0.78 + 0.5 * n;
        pa.setXYZ(i, x * k * (1.0 + 0.25 * (v - 1)), y * k * 0.62, z * k);
      }
      // the icosahedron is non-indexed already, so computed normals are per face: a faceted, chipped stone
      ico.computeVertexNormals();
      geos.push(ico);
      this.disposables.push(ico);
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      injectTerrainShadow(shader, shared);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `varying vec3 vRockLocal;
void main() {`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vRockLocal = position;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `varying vec3 vRockLocal;
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
            diffuseColor.rgb *= 0.7 + 0.3 * strata + 0.18 * grit;
            // lichen: yellow-green and orange crusts on the upward faces
            float lich = smoothstep( 0.62, 0.8, tgNoise3( wpr * 3.1 + 7.0 ) ) * smoothstep( 0.2, 0.8, normalize( vNormal ).y );
            float lich2 = smoothstep( 0.66, 0.82, tgNoise3( wpr * 4.7 + 21.0 ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.34, 0.1 ), lich * 0.55 );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.55, 0.26, 0.05 ), lich2 * 0.4 );
            gTgShadow = tgSampleTerrainShadow();
          }`,
        );
      shader.fragmentShader = injectSafeOutput(shader.fragmentShader);
    };
    mat.customProgramCacheKey = () => 'tg-rock-v1';
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
    for (const d of this.disposables) d.dispose();
    for (const m of this.meshes) m.dispose();
  }
}
