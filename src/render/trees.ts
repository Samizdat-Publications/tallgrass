// Cottonwoods and shrubs as instanced meshes. Each tree is a bark mesh (trunk, limbs, twigs) plus a crown of
// noise-displaced lumps whose normals are blended toward the crown's outward direction for soft, billowy
// shading. Foliage uses a procedural leaf cut-out so winter leaves thin out to the branch skeleton.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  const N = 46 + Math.floor(rng() * 8);
  for (let i = 0; i < N; i++) {
    // random direction, radius biased toward the shell
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = 0.38 + 0.62 * Math.pow(rng(), 0.55);
    const yy = dy < 0 ? dy * 0.72 : dy;
    lumps.push({
      c: new THREE.Vector3(dx * rad * 0.9, cy0 + yy * rad * cyR, dz * rad * 0.9),
      rho: 0.15 + rng() * 0.12,
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
      nw.set(dir.x * 0.35 + cr.x * 0.65, dir.y * 0.35 + cr.y * 0.65 + 0.2, dir.z * 0.35 + cr.z * 0.65).normalize();
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

const _up = new THREE.Vector3(0, 1, 0);
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 5): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  g.deleteAttribute('uv');
  return g;
}

/** Trunk + limbs + twigs in H units (isotropic, 1 = tree height). */
function buildBark(seed: number, lumpCenters: THREE.Vector3[], simple = false): THREE.BufferGeometry {
  const rng = mulberry32(seed * 104729 + 7);
  const parts: THREE.BufferGeometry[] = [];
  const topY = 0.46;
  const bend = new THREE.Vector3((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.03);
  parts.push(limb(new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(bend.x, 0.12, bend.z), 0.04, 0.03, 7));
  parts.push(limb(new THREE.Vector3(bend.x, 0.1, bend.z), new THREE.Vector3(bend.x * 1.6, topY, bend.z * 1.6), 0.03, 0.018, 7));
  const top = new THREE.Vector3(bend.x * 1.6, topY, bend.z * 1.6);
  if (simple) {
    // distant trees: trunk plus a couple of limbs is all that shows through the crown
    for (let i = 0; i < 2; i++) {
      const c = lumpCenters[3 + i * 9] ?? lumpCenters[0];
      parts.push(limb(top, c.clone().lerp(top, 0.3), 0.016, 0.008, 4));
    }
    const m = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return m;
  }
  lumpCenters.forEach((c, i) => {
    if (i % 3 !== 0) return;
    const end = c.clone().lerp(top, 0.22);
    const mid = top.clone().lerp(end, 0.5).add(new THREE.Vector3((rng() - 0.5) * 0.04, 0.02, (rng() - 0.5) * 0.04));
    parts.push(limb(top, mid, 0.017, 0.011));
    parts.push(limb(mid, end, 0.011, 0.005));
    // two twigs forking off the limb tip
    for (let t = 0; t < 2; t++) {
      const tip = end.clone().add(new THREE.Vector3((rng() - 0.5) * 0.2, (rng() - 0.3) * 0.12, (rng() - 0.5) * 0.2));
      parts.push(limb(mid.clone().lerp(end, 0.7), tip, 0.006, 0.0025, 4));
    }
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
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
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
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
    const cell = shrub ? '0.5' : '0.85';
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
          float keep = clamp( uLeaf + ( inst.b - 0.5 ) * 0.5 * ( 4.0 * uLeaf * ( 1.0 - uLeaf ) ) ${shrub ? '+ 0.45 * ( 1.0 - uLeaf )' : ''}, 0.0, 1.0 );
          float rim = 1.0 - abs( dot( tgSafeNorm( vNormal ), tgSafeNorm( vViewPosition ) ) );

          // leaf clusters: 3D cellular pattern in world space (about ${cell} m cells, 8-cell neighborhood)
          float F1 = 9.0, F2 = 9.0;
          vec3 cid = vec3( 0.0 ), crel = vec3( 0.0 );
          float alive = 1.0, tone = 0.5, puff = 0.5, edgeD = 0.5;
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
                  if ( d < F1 ) { F2 = F1; F1 = d; cid = ip + g; crel = rv; }
                  else if ( d < F2 ) { F2 = d; }
                }
              }
            }
            F1 = sqrt( F1 ); F2 = sqrt( F2 );
            edgeD = F2 - F1;
            float cr = tgHash31( cid + 3.7 );
            float cr2 = tgHash31( cid + 17.3 );
            tone = cr2;
            puff = 1.0 - clamp( F1 * 1.25, 0.0, 1.0 );
            // clusters drop out with the season; a few are always bare so the crown is never a solid mass
            alive = step( cr, keep ) * ( 1.0 - step( ${shrub ? '0.8' : '0.9'}, cr2 ) * 0.9 );
            gTgPuff = -crel;
          }
          float nrag = tgNoise3( wpw * 6.5 ) * 0.6 + tgNoise3( wpw * 13.0 ) * 0.4;
          float occC = clamp( vOcc, 0.0, 1.0 );
          // gaps open up in the interior and underside (where it is dark anyway); the sunlit outer shell stays full
          float holeThr = ${shrub ? '0.03' : '0.012'} + 0.1 * rim * rim + ${shrub ? '0.04' : '0.2'} * ( 1.0 - occC );
          float cover = smoothstep( 0.0, 0.06, edgeD + ( nrag - 0.5 ) * 0.16 - holeThr ) * alive;
          // distance: fade the pattern out to the average so far canopies never shimmer
          float avgCover = ${shrub ? '0.78' : '0.84'} * ( 0.1 + 0.9 * keep );
          cover = mix( cover, avgCover, lod );
          float fade = tgOcclusionFade( wpw );
          diffuseColor.a = cover * fade;

          float mixT = clamp( 0.5 + ( tone - 0.5 ) * 1.1 + ( inst.g - 0.5 ) * 0.5 + ( vLump - 0.5 ) * 0.2, 0.0, 1.0 );
          vec3 leaf = mix( uLeafA, uLeafB, mixT );
          // vOcc is interpolated per MSAA pixel center and can overshoot at silhouette pixels: clamp before any pow
          float occ = clamp( vOcc, 0.0, 1.0 );
          float shade = 0.12 + 0.95 * pow( occ, 1.15 );
          shade *= mix( 0.7 + 0.5 * puff, 1.0, lod );
          leaf *= shade * ( 0.84 + 0.2 * tgNoise3( wpw * 2.6 ) + 0.16 * tgNoise3( wpw * 9.0 ) ) * inst.r;
          ${shrub ? 'leaf = mix( leaf, vec3( dot( leaf, vec3( 0.333 ) ) ) * vec3( 1.0, 0.98, 0.86 ) + vec3( 0.02, 0.018, 0.012 ), 0.62 );' : ''}
          diffuseColor.rgb = mix( leaf, vec3( 0.9, 0.93, 1.0 ), uSnow * 0.5 * smoothstep( 0.3, 0.9, occ ) );
        }`,
      )
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
if ( !( dot( normal, normal ) > 0.25 ) ) normal = vec3( 0.0, 1.0, 0.0 );`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // each leaf cluster shades like its own little dome
          float pl = dot( gTgPuff, gTgPuff );
          if ( pl > 1e-4 ) normal = tgSafeNorm( normal + mat3( viewMatrix ) * ( gTgPuff * ( 0.3 * inversesqrt( pl ) ) ) );
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Lv = tgSafeNorm( mat3( viewMatrix ) * uLightDir );
          vec3 Vv = tgSafeNorm( vViewPosition );
          float back = pow( max( dot( -Vv, Lv ), 0.0 ), 2.2 );
          totalEmissiveRadiance += diffuseColor.rgb * uLightColor * back * 0.1 * gTgShadow * ( 0.3 + 0.7 * clamp( vOcc, 0.0, 1.0 ) );
        }`,
      );
    shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
  };
  mat.customProgramCacheKey = () => (shrub ? 'tg-shrub-v3' : 'tg-foliage-v3');
  return mat;
}

function barkMaterial(shared: SharedUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7e6e5c'), roughness: 0.96, metalness: 0 });
  mat.alphaTest = 0.5;
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    injectTerrainShadow(shader, shared);
    shader.uniforms.uTime = shared.time; shader.uniforms.uWind = shared.wind;
    shader.uniforms.uOccCam = shared.occCam; shader.uniforms.uOccFocus = shared.occFocus; shader.uniforms.uOccParams = shared.occParams;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uTime;\nuniform vec3 uWind;\nvarying vec3 vBarkPos;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBarkPos = position;')
      .replace('#include <project_vertex>', swayChunk(false));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vBarkPos;\n${NOISE_GLSL}\n${OCCLUDE_GLSL}\n${WORLDPOS_GLSL}\nvoid main() {`)
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
          diffuseColor.a = tgOcclusionFade( tgFragWorld() );
        }`,
      );
    shader.fragmentShader = injectSafeOutput( shader.fragmentShader );
  };
  mat.customProgramCacheKey = () => 'tg-bark-v4';
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
      let lumpCenters: THREE.Vector3[] = [];
      crownDetails.forEach((detail, li) => {
        const crown = buildCrown(v + 1, detail);
        if (li === 0) lumpCenters = crown.lumpCenters;
        this.disposables.push(crown.geo);
        const m = new THREE.InstancedMesh(crown.geo, foliageMat, N);
        m.name = `cottonwood-crown-${v}-lod${li}`;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
        crownMeshes.push(m);
      });
      const barkGeo = buildBark(v + 1, lumpCenters);
      const barkGeoFar = buildBark(v + 1, lumpCenters, true);
      this.disposables.push(barkGeo, barkGeoFar);
      const barkMesh = new THREE.InstancedMesh(barkGeo, bark, N);
      barkMesh.name = `cottonwood-bark-${v}`;
      const barkFar = new THREE.InstancedMesh(barkGeoFar, bark, N);
      barkFar.name = `cottonwood-bark-far-${v}`;
      for (const m of [...crownMeshes, barkMesh, barkFar]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.customDepthMaterial = depthMat;
        m.count = 0;
        this.group.add(m);
        this.meshes.push(m);
      }
      this.lods.push(new LodInstances(N, crownMats, cols, pos, crownMeshes, crownLimits));
      this.lods.push(new LodInstances(N, barkMats, null, pos, [barkMesh, barkFar], [110, Infinity]));
    }

    // shrubs
    const ns = world.shrubs.length / 3;
    this.shrubCount = ns;
    if (ns > 0) {
      const mats = new Float32Array(ns * 16), cols = new Float32Array(ns * 3), pos = new Float32Array(ns * 3);
      for (let i = 0; i < ns; i++) {
        const x = world.shrubs[i * 3], z = world.shrubs[i * 3 + 1], r = world.shrubs[i * 3 + 2];
        const y = heightAt(x, z) - 0.08;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, hash2(i, 7, 3) * Math.PI * 2, 0);
        const sc = r * (0.9 + hash2(i, 8, 3) * 0.3) * 1.05;
        dummy.scale.set(sc, sc * (0.5 + hash2(i, 9, 3) * 0.25), sc);
        dummy.updateMatrix();
        dummy.matrix.toArray(mats, i * 16);
        col.setRGB(0.8 + hash2(i, 10, 3) * 0.35, hash2(i, 11, 3), hash2(i, 12, 3));
        cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
        pos[i * 3] = x; pos[i * 3 + 1] = y + 0.5; pos[i * 3 + 2] = z;
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
    this.update(new THREE.Vector3(world.size / 2, 100, world.size / 2), true);
  }

  /** Re-bucket instances by distance to the camera (cheap; skips when the camera has barely moved). */
  update(cam: THREE.Vector3, force = false): void {
    for (const l of this.lods) l.update(cam, force);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const m of this.meshes) m.dispose();
  }
}
