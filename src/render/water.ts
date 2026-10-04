// Water: creek and ponds. One mesh over the water cells at their surface height, dilated a few cells and draped over the banks
// just above the ground. The shader measures true water depth against the height texture and shades the water as a medium:
// - depth and colour: light is absorbed with depth, so clear shallows show the bed (the terrain under the water) and the
//   channel and pond centres deepen to teal and slate; ponds are clearer than the silty creek, so their shelves read as a basin
// - current: each creek vertex carries a travel coordinate along the channel (scaled by the local speed, faster where the
//   channel narrows) and its offset across it, so ripples, silt streaks, foam flecks and the mirrored sky are stretched along
//   the flow and ride downstream through the bends; ponds only take wind ripples and drifting cat's paws
// - banks: the draped skirt darkens the wet ground above the waterline, the creek laps it with a broken foam line and breaks
//   white over riffles, and the reflection marches the height field and a crown map, so banks, tallgrass and cottonwoods
//   are mirrored in the water instead of empty sky
// - light: sky reflection with Fresnel and a soft highlight clamp, sun or moon glitter, a silver sheen under the moon, and in
//   winter still water freezes from the shore inward (the creek's current keeps its channel open longest), dusted by snow.
// Output is premultiplied: colour = reflected and scattered light, alpha = how much of the terrain behind is hidden.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { HEIGHT_GLSL, NOISE_GLSL, SKY_GLSL, SharedUniforms } from './common';

/** Mean surface speed of the creek (m/s) at an average channel width; narrower stretches run faster. */
const V_REF = 0.55;
/** Average channel half-width (m) the speed is referenced to (see shapeCreek in terrain.ts: 3.0 to 5.6 m). */
const HW_REF = 4.3;

export class Water {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private canopyTex: THREE.DataTexture;
  private windOff = new THREE.Vector2();
  private lastT = -1;

  constructor(world: World, shared: SharedUniforms, creekDist: Float32Array) {
    const { n, hn, cell, size } = world;

    // ---- per-vertex surface height from the water cells, dilated outward under the banks
    let wy = new Float32Array(hn * hn).fill(NaN);
    const sum = new Float32Array(hn * hn);
    const cnt = new Uint8Array(hn * hn);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = j * n + i;
        if (!world.water[c]) continue;
        const h = world.waterHeight[c];
        for (let dj = 0; dj <= 1; dj++) {
          for (let di = 0; di <= 1; di++) {
            const v = (j + dj) * hn + i + di;
            sum[v] += h; cnt[v]++;
          }
        }
      }
    }
    for (let v = 0; v < hn * hn; v++) if (cnt[v]) wy[v] = sum[v] / cnt[v];
    // a small margin so the plane always extends under the banks past the contour (clipped to the channel below)
    for (let pass = 0; pass < 3; pass++) {
      const next = wy.slice();
      for (let j = 0; j < hn; j++) {
        for (let i = 0; i < hn; i++) {
          const v = j * hn + i;
          if (!Number.isNaN(wy[v])) continue;
          let s = 0, c = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const ii = i + di, jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= hn || jj >= hn) continue;
              const w = wy[jj * hn + ii];
              if (!Number.isNaN(w)) { s += w; c++; }
            }
          }
          if (c) next[v] = s / c;
        }
      }
      wy = next;
    }

    // Keep only the creek channel (the sim's creek can sit above lower ground beside it) and the ponds.
    {
      const ponds = world.ponds;
      for (let j = 0; j < hn; j++) {
        for (let i = 0; i < hn; i++) {
          const v = j * hn + i;
          if (Number.isNaN(wy[v])) continue;
          if (creekDist[v] <= 7.5) continue;
          let keep = false;
          for (let p = 0; p < ponds.length; p += 4) {
            if (Math.hypot(i * cell - ponds[p], j * cell - ponds[p + 1]) < ponds[p + 2] * 1.5 + 4) { keep = true; break; }
          }
          if (!keep) wy[v] = NaN;
        }
      }
    }

    // ---- rendered ground heights (the terrain sets the shared height texture before the water is built; fall back to sim heights)
    const img = (shared.heightTex.value as unknown as { image?: { data?: ArrayLike<number> } } | null)?.image;
    const rh: ArrayLike<number> = img?.data && img.data.length === hn * hn ? img.data : world.height;
    const hAt = (x: number, z: number): number => {
      const fx = Math.min(hn - 1.001, Math.max(0, x / cell)), fz = Math.min(hn - 1.001, Math.max(0, z / cell));
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      const a = rh[j * hn + i], b = rh[j * hn + i + 1], c = rh[(j + 1) * hn + i], d = rh[(j + 1) * hn + i + 1];
      // same triangulation as the terrain mesh
      return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    };

    // ---- the creek's own frame: arc length, tangent, local channel half-width, speed and travel coordinate per centerline point
    const creek = world.creek;
    const nc = creek.length / 2;
    const tanX = new Float32Array(nc), tanZ = new Float32Array(nc);
    for (let k = 0; k < nc; k++) {
      const a = Math.max(0, k - 1), b = Math.min(nc - 1, k + 1);
      const dx = creek[2 * b] - creek[2 * a], dz = creek[2 * b + 1] - creek[2 * a + 1];
      const l = Math.hypot(dx, dz) || 1;
      tanX[k] = dx / l; tanZ[k] = dz / l;
    }
    const levelNear = (x: number, z: number): number => {
      const i0 = Math.round(x / cell), j0 = Math.round(z / cell);
      for (let r = 0; r <= 3; r++) {
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            const i = i0 + di, j = j0 + dj;
            if (i < 0 || j < 0 || i >= hn || j >= hn) continue;
            const w = wy[j * hn + i];
            if (!Number.isNaN(w)) return w;
          }
        }
      }
      return NaN;
    };
    // half-width: walk out from the centerline on both sides until the ground rises above the water
    let hw = new Float32Array(nc);
    for (let k = 0; k < nc; k++) {
      const x = creek[2 * k], z = creek[2 * k + 1];
      const lv = x > 2 && z > 2 && x < size - 2 && z < size - 2 ? levelNear(x, z) : NaN;
      if (Number.isNaN(lv)) { hw[k] = HW_REF; continue; }
      const nx = -tanZ[k], nz = tanX[k];
      let tot = 0;
      for (const s of [-1, 1]) {
        let d = 0.25;
        while (d < 9 && hAt(x + nx * s * d, z + nz * s * d) < lv) d += 0.25;
        tot += d;
      }
      hw[k] = Math.max(1.5, tot / 2);
    }
    for (let pass = 0; pass < 2; pass++) {
      const nx = new Float32Array(nc);
      for (let k = 0; k < nc; k++) {
        let s = 0, c = 0;
        for (let d = -2; d <= 2; d++) { const q = k + d; if (q >= 0 && q < nc) { s += hw[q]; c++; } }
        nx[k] = s / c;
      }
      hw = nx;
    }
    // continuity: the same water runs faster through a narrow channel (depth is about the same everywhere)
    const spd = new Float32Array(nc);
    for (let k = 0; k < nc; k++) spd[k] = Math.min(1.6, Math.max(0.72, HW_REF / hw[k]));
    // travel coordinate: metres of channel weighted by 1 / speed, so a pattern scrolled at a constant rate in it moves faster
    // through the narrows and never shears over time
    const trav = new Float32Array(nc);
    for (let k = 1; k < nc; k++) {
      const seg = Math.hypot(creek[2 * k] - creek[2 * k - 2], creek[2 * k + 1] - creek[2 * k - 1]);
      trav[k] = trav[k - 1] + seg / (0.5 * (spd[k] + spd[k - 1]));
    }

    // creek frame per vertex: travel coordinate, signed offset across, tangent, relative speed, riffle amount (ponds get zeros)
    const frame = (x: number, z: number): [number, number, number, number, number, number] => {
      let best = 1e9, bk = 0, bt = 0;
      for (let k = 0; k < nc - 1; k++) {
        const ax = creek[2 * k], az = creek[2 * k + 1];
        const dx = creek[2 * k + 2] - ax, dz = creek[2 * k + 3] - az;
        const l2 = dx * dx + dz * dz;
        let s = ((x - ax) * dx + (z - az) * dz) / l2;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        const d2 = (x - ax - dx * s) ** 2 + (z - az - dz * s) ** 2;
        if (d2 < best) { best = d2; bk = k; bt = s; }
      }
      if (Math.sqrt(best) >= 11) return [0, 0, 0, 0, 0, 0];
      const k = bk, t = bt;
      const qx = creek[2 * k] + (creek[2 * k + 2] - creek[2 * k]) * t;
      const qz = creek[2 * k + 1] + (creek[2 * k + 3] - creek[2 * k + 1]) * t;
      let tx = tanX[k] + (tanX[k + 1] - tanX[k]) * t, tz = tanZ[k] + (tanZ[k + 1] - tanZ[k]) * t;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const off = tx * (z - qz) - tz * (x - qx);
      const u = trav[k] + (trav[k + 1] - trav[k]) * t;
      const v = spd[k] + (spd[k + 1] - spd[k]) * t;
      const riffle = Math.min(1, Math.max(0, (v - 1.08) / 0.32));
      return [u, off, tx, tz, v, riffle * riffle * (3 - 2 * riffle)];
    };

    // ---- crown map for reflections: over each height-grid vertex, the crown's half-thickness (0 outside any crown) and its centre
    // height (spread outward into the gaps so the filtered map has a sensible centre at crown edges). One ellipsoid per valley
    // tree, roughly the rendered crown; overlapping crowns merge into one span.
    const bot = new Float32Array(hn * hn).fill(1e5), top = new Float32Array(hn * hn).fill(-1e5);
    const trees = world.trees;
    for (let k = 0; k < trees.length; k += 4) {
      const x = trees[k], z = trees[k + 1], h = trees[k + 2], r = trees[k + 3];
      const a = 0.85 * r, b = 0.36 * h, yc = hAt(x, z) + 0.58 * h;
      const i0 = Math.max(0, Math.floor((x - a) / cell)), i1 = Math.min(hn - 1, Math.ceil((x + a) / cell));
      const j0 = Math.max(0, Math.floor((z - a) / cell)), j1 = Math.min(hn - 1, Math.ceil((z + a) / cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const rho = Math.hypot(i * cell - x, j * cell - z) / a;
          if (rho >= 1) continue;
          const half = b * Math.sqrt(1 - rho * rho);
          const v = j * hn + i;
          bot[v] = Math.min(bot[v], yc - half);
          top[v] = Math.max(top[v], yc + half);
        }
      }
    }
    let ctr = new Float32Array(hn * hn).fill(NaN);
    const thick = new Float32Array(hn * hn);
    for (let v = 0; v < hn * hn; v++) if (top[v] > bot[v]) { ctr[v] = 0.5 * (top[v] + bot[v]); thick[v] = 0.5 * (top[v] - bot[v]); }
    for (let pass = 0; pass < 3; pass++) {
      const next = ctr.slice();
      for (let j = 0; j < hn; j++) {
        for (let i = 0; i < hn; i++) {
          const v = j * hn + i;
          if (!Number.isNaN(ctr[v])) continue;
          let s = 0, c = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const ii = i + di, jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= hn || jj >= hn) continue;
              const w = ctr[jj * hn + ii];
              if (!Number.isNaN(w)) { s += w; c++; }
            }
          }
          if (c) next[v] = s / c;
        }
      }
      ctr = next;
    }
    const can = new Uint16Array(hn * hn * 2);
    for (let v = 0; v < hn * hn; v++) {
      can[2 * v] = THREE.DataUtils.toHalfFloat(thick[v]);
      can[2 * v + 1] = THREE.DataUtils.toHalfFloat(Number.isNaN(ctr[v]) ? rh[v] + 6 : ctr[v]);
    }
    // half floats filter in WebGL2 without extensions, so crown silhouettes in the water come out smooth
    this.canopyTex = new THREE.DataTexture(can, hn, hn, THREE.RGFormat, THREE.HalfFloatType);
    this.canopyTex.minFilter = this.canopyTex.magFilter = THREE.LinearFilter;
    this.canopyTex.wrapS = this.canopyTex.wrapT = THREE.ClampToEdgeWrapping;
    this.canopyTex.generateMipmaps = false;
    this.canopyTex.needsUpdate = true;
    this.canopyTex.name = 'water.canopy';

    // ---- mesh: water vertices sit on the surface; vertices on the bank are draped just above the ground so the wet band can
    // be drawn there (the fragment shader always works from the true water level, carried separately)
    const pos: number[] = [];
    const lvl: number[] = [];
    const flw: number[] = [];
    const flw2: number[] = [];
    const remap = new Int32Array(hn * hn).fill(-1);
    const idx: number[] = [];
    const vert = (i: number, j: number): number => {
      const v = j * hn + i;
      if (remap[v] >= 0) return remap[v];
      remap[v] = pos.length / 3;
      pos.push(i * cell, Math.max(wy[v], rh[v] + 0.04), j * cell);
      lvl.push(wy[v]);
      const f = frame(i * cell, j * cell);
      flw.push(f[0], f[1], f[2], f[3]);
      flw2.push(f[4], f[5]);
      return remap[v];
    };
    for (let j = 0; j < hn - 1; j++) {
      for (let i = 0; i < hn - 1; i++) {
        const a = j * hn + i, b = a + 1, c = a + hn, d = c + 1;
        if (Number.isNaN(wy[a]) || Number.isNaN(wy[b]) || Number.isNaN(wy[c]) || Number.isNaN(wy[d])) continue;
        const va = vert(i, j), vb = vert(i + 1, j), vc = vert(i, j + 1), vd = vert(i + 1, j + 1);
        // winding with +Y normals, same diagonal as the terrain so the draped skirt follows the ground exactly
        idx.push(va, vc, vb, vb, vc, vd);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aLevel', new THREE.Float32BufferAttribute(lvl, 1));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flw, 4));
    geo.setAttribute('aFlow2', new THREE.Float32BufferAttribute(flw2, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(world.size / 2, 10, world.size / 2), world.size);

    const windOffU = { value: this.windOff };
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.time,
        uLightDir: shared.lightDir,
        uLightColor: shared.lightColor,
        uWind: shared.wind,
        uWindOff: windOffU,
        uNight: shared.night,
        uOvercast: shared.overcast,
        uSnow: shared.snow,
        uFrost: shared.frost,
        uSeason: shared.season,
        uLeaf: shared.leafAmount,
        uLeafA: shared.leafColorA,
        uGrassGreen: shared.grassGreen,
        uGrassDry: shared.grassDry,
        uCure: shared.cure,
        uSunDir: shared.sunDir,
        uSkyZenith: shared.skyZenith,
        uSkyMid: shared.skyMid,
        uSkyHorizon: shared.skyHorizon,
        uSunGlow: shared.sunGlow,
        tHeight: shared.heightTex,
        tShadow: shared.terrainShadow,
        tCanopy: { value: this.canopyTex },
        uCell: { value: cell },
        uHN: { value: hn },
        uWorld: shared.worldSize,
      },
      vertexShader: /* glsl */ `
        attribute float aLevel;
        attribute vec4 aFlow;
        attribute vec2 aFlow2;
        varying vec3 vWorld;
        varying float vLevel;
        varying vec4 vFlow;
        varying vec2 vFlow2;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vLevel = aLevel;
          vFlow = aFlow;
          vFlow2 = aFlow2;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorld;
        varying float vLevel;
        varying vec4 vFlow;   // travel coordinate along the creek (m), signed offset across it (m), tangent (x, z)
        varying vec2 vFlow2;  // speed relative to the mean, riffle amount
        uniform float uTime;
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform vec3 uWind;
        uniform vec2 uWindOff;
        uniform float uNight;
        uniform float uOvercast;
        uniform float uSnow;
        uniform float uFrost;
        uniform float uSeason;
        uniform float uLeaf;
        uniform vec3 uLeafA;
        uniform vec3 uGrassGreen;
        uniform vec3 uGrassDry;
        uniform float uCure;
        uniform sampler2D tShadow;
        uniform sampler2D tCanopy;
        uniform float uWorld;
        ${NOISE_GLSL}
        ${SKY_GLSL}
        ${HEIGHT_GLSL}

        const float INV_PI = 0.3183099;
        const float V_REF = ${V_REF.toFixed(3)};

        // value noise with its analytic gradient: (value, d/dx, d/dy)
        vec3 wNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          vec2 du = 6.0 * f * (1.0 - f);
          float a = tgHash21(i), b = tgHash21(i + vec2(1.0, 0.0));
          float c = tgHash21(i + vec2(0.0, 1.0)), d = tgHash21(i + vec2(1.0, 1.0));
          float k1 = b - a, k2 = c - a, k3 = a - b - c + d;
          return vec3(a + k1 * u.x + k2 * u.y + k3 * u.x * u.y, du * vec2(k1 + k3 * u.y, k2 + k3 * u.x));
        }

        // Creek surface slope in the channel's frame (x along the current in travel metres, already scrolled; y across): broad
        // boils, streaks about three times longer than wide, and a fine chop that runs a little ahead of the mean flow.
        vec2 creekSlope(vec2 q, float chop, float w2, float w3) {
          vec3 a = wNoise(q * vec2(0.13, 0.36) + vec2(3.1, 7.7));
          vec2 g = a.yz * vec2(0.13, 0.36);
          vec3 b = wNoise(q * vec2(0.42, 1.25) + vec2(a.x * 1.6, a.x * 0.7) + vec2(11.0, 2.0));
          g += b.yz * vec2(0.42, 1.25) * 0.42 * w2;
          vec3 c = wNoise((q - vec2(uTime * 0.22, 0.0)) * vec2(1.3, 2.9) + vec2(5.0, 1.0));
          g += c.yz * vec2(1.3, 2.9) * 0.13 * w3 * chop;
          return g;
        }

        // Wind on the water: small ripples carried downwind (the offset is integrated on the CPU, so a turning wind never makes the
        // pattern jump) and drifting cat's paws, patches where a gust touches the surface and roughens it.
        vec2 windSlope(vec2 p, float w2, float w3, out float gust) {
          float gN = tgNoise2((p - uWindOff * 0.8) * 0.045 + 17.0) * 0.65 + tgNoise2((p - uWindOff * 0.9) * 0.12 + 4.0) * 0.35;
          gust = smoothstep(0.42, 0.78, gN);
          vec3 a = wNoise((p - uWindOff) * 0.9 + 3.0);
          vec3 b = wNoise((p - uWindOff * 1.3) * vec2(2.3, 2.0) + vec2(9.0, 1.0));
          vec2 g = a.yz * 0.9 * 0.45 * w2 + b.yz * vec2(2.3, 2.0) * 0.16 * w3;
          return g * (0.16 + 0.84 * gust) * (0.3 + 0.9 * uWind.z);
        }

        // What the reflected ray meets first: the bank (ground plus standing grass) or a tree crown, marched outward over the
        // height field and the crown map. rgb = that surface's colour, a = how much of the sky it hides.
        vec4 mirrorHit(vec2 p0, vec3 R, float level, vec3 ambC) {
          float hl = length(R.xz);
          if (hl < 0.02) return vec4(0.0);
          vec2 d = R.xz / hl;
          float rise = R.y / hl;
          float grassH = 0.62 * (1.0 - 0.65 * uSnow);
          float treeDen = mix(0.32, 0.9, uLeaf);
          float cov = 0.0, wTree = 0.0;
          vec2 hitP = p0;
          float t = 0.7;
          for (int k = 0; k < 7; k++) {
            vec2 xz = p0 + d * t;
            float ry = level + rise * t;
            float th = tgHeightAt(xz);
            // grass stands only on dry ground, never on the bed under the shallows
            float hg = smoothstep(-0.15, 0.2, th + grassH * smoothstep(level - 0.02, level + 0.3, th) - ry);
            // crown map: r = half-thickness, g = centre height (filtered, so silhouettes are smooth)
            vec2 cn = texture2D(tCanopy, (xz / uCell + 0.5) / uHN).rg;
            float ht = smoothstep(0.0, 0.7, cn.x - abs(ry - cn.y)) * treeDen;
            float h = max(hg, ht);
            float add = (1.0 - cov) * h;
            wTree += add * (ht > hg ? 1.0 : 0.0);
            if (cov < 0.5) hitP = xz;
            cov += add;
            t = t * 1.6 + 0.5;
          }
          if (cov < 0.004) return vec4(0.0);
          // the mirrored face looks back toward the water
          vec3 faceN = normalize(vec3(-d.x, 0.6, -d.y));
          float lit = max(dot(faceN, uLightDir), 0.0) * texture2D(tShadow, clamp(hitP / uWorld, 0.0, 1.0)).r;
          vec3 grassC = mix(mix(uGrassGreen, uGrassDry, uCure), vec3(0.85, 0.87, 0.9), uSnow * 0.8);
          vec3 bankC = grassC * INV_PI * (ambC * 0.75 + uLightColor * lit);
          vec3 leafC = mix(vec3(0.11, 0.09, 0.075), uLeafA, uLeaf);
          vec3 treeC = leafC * INV_PI * (ambC * 0.55 + uLightColor * lit * 0.7);
          return vec4(mix(bankC, treeC, wTree / cov), clamp(cov, 0.0, 1.0));
        }

        void main() {
          vec2 p = vWorld.xz;
          float isCreek = step(0.25, dot(vFlow.zw, vFlow.zw));
          float terr = tgHeightAt(p);
          // Pond shores: the reshaped basin steps up a few centimetres right at the shoreline, which a 2 m height grid turns into
          // a stair-stepped waterline. Around ponds the shore is found on a slightly smoothed ground instead.
          if (isCreek < 0.5) {
            terr = 0.4 * terr + 0.15 * (tgHeightAt(p + vec2(1.1, 0.0)) + tgHeightAt(p - vec2(1.1, 0.0)) + tgHeightAt(p + vec2(0.0, 1.1)) + tgHeightAt(p - vec2(0.0, 1.1)));
          }
          float depth = vLevel - terr;
          if (depth < -0.55) discard;

          vec3 toCam = cameraPosition - vWorld;
          float dist = max(length(toCam), 1e-3);
          vec3 V = toCam / dist;

          vec2 T = isCreek > 0.5 ? normalize(vFlow.zw) : vec2(1.0, 0.0);
          vec2 Nx = vec2(-T.y, T.x);
          float vRel = max(vFlow2.x, 0.3);
          float riffle = vFlow2.y;
          // the pattern rides the current: scrolled at a constant rate in travel metres (faster where the channel narrows)
          vec2 q = vec2(vFlow.x - uTime * V_REF, vFlow.y);
          float w2 = 1.0 - smoothstep(70.0, 280.0, dist);
          float w3 = 1.0 - smoothstep(22.0, 95.0, dist);

          float shadow = texture2D(tShadow, clamp(p / uWorld, 0.0, 1.0)).r;
          // ambient from the sky dome, plus a share of the key light so moonlit nights stay readable
          vec3 ambC = (uSkyMid * 0.6 + uSkyZenith * 0.4) * 1.3 + uLightColor * mix(0.03, 0.08, uNight);
          vec3 irr = ambC + uLightColor * max(uLightDir.y, 0.0) * shadow;

          // winter: still water freezes from the shore inward; the creek's current keeps its channel open longest
          float winterK = smoothstep(2.45, 2.85, uSeason) * (1.0 - smoothstep(3.55, 3.9, uSeason));
          float cold = winterK * (0.45 + 0.55 * max(uSnow, uFrost));
          float dry = max(uSnow * 0.85, cold * 0.7);

          float edgeW = min(min(p.x, uWorld - p.x), min(p.y, uWorld - p.y));
          float worldFade = smoothstep(0.0, 20.0, edgeW);

          // ---- above the waterline: the draped skirt darkens the wet bank, with a thin glossy line right at the edge
          if (depth < 0.0) {
            float hA = -depth;
            float rag = tgNoise2(p * 0.6) * 0.6 + tgNoise2(p * 2.1 + 3.0) * 0.4;
            // the band never reaches the floodplain beside the creek (about 0.3 m up), so it cannot end at the mesh edge
            float reach = mix(0.12 + 0.16 * rag, (0.1 + 0.1 * rag) * (1.0 + 0.5 * riffle), isCreek);
            float band = 1.0 - smoothstep(0.0, reach, hA);
            float a = band * band * 0.42 * (1.0 - dry);
            float film = 1.0 - smoothstep(0.0, 0.012, hA);
            float Fw = 0.03 + 0.97 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
            vec3 src = tgSkyBase(normalize(vec3(-V.x, max(abs(V.y), 0.05), -V.z))) * Fw * film * 0.2 * (1.0 - dry);
            if (isCreek > 0.5) {
              // the current laps the bank: a faint broken line of foam just above the edge
              float lap = wNoise(vec2(q.x * 0.35, q.y * 2.0) + 41.0).x;
              float foam = (1.0 - smoothstep(0.0, 0.015 + 0.03 * riffle, hA)) * smoothstep(0.55, 0.85, lap) * 0.35 * (1.0 - cold);
              src = mix(src, vec3(0.7, 0.68, 0.62) * INV_PI * irr, foam);
              a = mix(a, 1.0, foam);
            }
            gl_FragColor = vec4(min(max(src, vec3(0.0)), vec3(32.0)), clamp(a, 0.0, 1.0)) * worldFade;
            return;
          }

          // ---- surface slope
          float gust = 0.0;
          vec2 gw = windSlope(p, w2, w3, gust);
          vec2 g = gw;
          if (isCreek > 0.5) {
            vec2 gc = creekSlope(q, 0.55 + 0.9 * riffle, w2, w3);
            // the travel coordinate runs 1 / speed times as fast as distance along the channel; the current slows toward the banks
            vec2 gcw = (gc.x / vRel) * T + gc.y * Nx;
            g = gcw * (0.5 + 0.5 * smoothstep(0.0, 0.3, depth)) * (0.8 + 0.7 * riffle) + gw * 0.35;
          }
          vec3 N = normalize(vec3(-g.x * 0.12, 1.0, -g.y * 0.12));

          // ---- ice: from the shore inward on still water; only the shallow margins of the creek
          float ice = 0.0;
          if (cold > 0.02) {
            float iN = tgNoise2(p * 0.23 + 5.0) * 0.6 + tgNoise2(p * 0.9 + 1.0) * 0.4;
            float reach = cold * mix(1.25, 0.17 * (1.2 - 0.8 * riffle), isCreek);
            ice = smoothstep(0.03, -0.03, depth - reach + (iN - 0.5) * mix(0.35, 0.12, isCreek) * cold) * smoothstep(0.02, 0.12, cold);
            N = normalize(mix(N, vec3(0.0, 1.0, 0.0), ice));
          }

          // ---- reflection: sky (soft highlight clamp so a pond never turns into a white disc), banks and crowns where they hide it
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          float cosV = clamp(dot(N, V), 0.0, 1.0);
          float F = 0.03 + 0.97 * pow(1.0 - cosV, 3.4);
          // distant cat's paws scatter the bright sky a little: they read as darker drifting patches
          F *= 1.0 - 0.3 * gust * uWind.z * (1.0 - w3) * (1.0 - ice);
          // the reflected sky, with its bright low-sun glow compressed: water reads as water (darker than the sky it mirrors, the
          // ripples and the dark bed breaking it up), and only the sun's own path glints
          vec3 sky = tgSkyBase(normalize(vec3(R.x, max(R.y * 0.85, 0.02), R.z)));
          float sL = dot(sky, vec3(0.2126, 0.7152, 0.0722));
          sky *= sL > 0.45 ? (0.45 + (sL - 0.45) / (1.0 + 1.8 * (sL - 0.45))) / sL : 1.0;
          // under the moon the mirrored sky is a dark grey-blue, not a bright blue stripe
          sky = mix(sky, vec3(min(sL, 1.0)) * vec3(0.8, 0.9, 1.1), 0.55 * uNight);
          vec4 hit = F > 0.035 ? mirrorHit(p, R, vLevel, ambC) : vec4(0.0);
          vec3 refl = mix(sky, hit.rgb, hit.a);

          // ---- the water body. The bed is drawn here (the terrain under the water is plain mud): wet mud at the waterline, tan
          // silt and gravel in the shallows with olive weed where the water is still, seen through the refracting surface so it
          // wobbles under the ripples, lit by the sun through the water with drifting caustics. Light is absorbed per channel
          // along the path down to the bed and back up (red first, so depth turns teal and slate), and what is lost is replaced by
          // light scattered in the water itself (olive and silty in the creek, clearer teal in the ponds).
          float sinI2 = 1.0 - cosV * cosV;
          float cosT = sqrt(max(1.0 - sinI2 / 1.769, 0.05));
          float Ly = max(uLightDir.y, 0.0);
          float cosL = sqrt(max(1.0 - (1.0 - Ly * Ly) / 1.769, 0.05));
          vec3 sigma = isCreek > 0.5 ? vec3(2.0, 1.45, 1.3) : vec3(1.25, 0.72, 0.62);
          vec3 Tr = exp(-sigma * depth * (1.0 / cosT + 1.0 / cosL));
          vec3 bodyC = vec3(0.0);
          if (w2 > 0.002 || depth < 0.6) {
            // where the refracted view ray meets the bed
            vec3 Rt = refract(-V, N, 0.752);
            vec2 bp = p + Rt.xz * (depth / max(-Rt.y, 0.25));
            float n1 = tgNoise2(bp * 0.45 + 3.0), n2 = tgNoise2(bp * 1.7 + 11.0), n3 = tgNoise2(bp * 7.1 + 7.0);
            vec3 sand = vec3(0.3, 0.25, 0.17) * (0.8 + 0.3 * n2) * (0.9 + 0.18 * n3 * w3);
            // gravel in the creek's current, olive weed on the still pond shelves
            vec3 weed = vec3(0.17, 0.2, 0.09) * (0.8 + 0.4 * n3);
            float weedK = smoothstep(0.5, 0.8, n1 * 0.7 + n2 * 0.3) * mix(0.8, 0.35, isCreek) * smoothstep(0.08, 0.3, depth);
            vec3 bedAlb = mix(sand, weed, weedK);
            float gravel = smoothstep(0.5, 0.9, n3) * smoothstep(0.35, 0.65, n2) * isCreek * w3;
            bedAlb *= 1.0 - 0.22 * gravel;
            // wet mud right at the waterline, so the bed meets the bank without a seam
            bedAlb = mix(vec3(0.17, 0.14, 0.1), bedAlb, smoothstep(0.0, 0.1, depth));
            // caustics: where two drifting noise fields cross, a web of focused light (near the camera, fading as the water deepens)
            float caus = 0.0;
            if (w3 > 0.01) {
              vec2 cp = (isCreek > 0.5 ? (bp - T * (uTime * V_REF * vRel)) : bp) * 1.7;
              float c1 = tgNoise2(cp + vec2(uTime * 0.31, 0.0));
              float c2 = tgNoise2(cp * 1.31 + vec2(5.0, -uTime * 0.27));
              // in patches, not an even swimming-pool web, and only where the water is shallow enough to focus the light
              float patchK = smoothstep(0.35, 0.75, tgNoise2(bp * 0.21 + vec2(uTime * 0.05, 9.0)));
              caus = pow(clamp(1.0 - abs(c1 - c2) * 5.0, 0.0, 1.0), 4.0) * w3 * patchK * smoothstep(0.03, 0.15, depth) * exp(-depth * 2.0);
            }
            vec3 Ebed = ambC * 0.7 + uLightColor * Ly * shadow * (0.85 + 0.75 * caus);
            bodyC = bedAlb * INV_PI * Ebed * Tr;
          }
          vec3 scatC = isCreek > 0.5 ? vec3(0.026, 0.036, 0.032) : vec3(0.02, 0.036, 0.036);
          if (isCreek > 0.5) {
            // silt streaks carried by the current
            float st = wNoise(vec2(q.x * 0.07, q.y * 0.7) + 23.0).x * 0.7 + wNoise(vec2(q.x * 0.22, q.y * 1.6) + 5.0).x * 0.3;
            scatC *= 0.78 + 0.44 * st;
          }
          bodyC += scatC * INV_PI * irr * (1.0 - Tr);

          // the water hides the terrain except in the last few centimetres, where it thins to a wet film over the mud
          float edgeA = smoothstep(0.0, 0.06, depth);
          vec3 src = refl * F + bodyC * (1.0 - F) * edgeA;
          float a = F + (1.0 - F) * edgeA;
          a = max(a, 0.42 * (1.0 - edgeA) * (1.0 - dry));

          // ---- sun and moon glitter, a broad sheen, and a silver path under the moon
          float rd = max(dot(R, uLightDir), 0.0);
          // the broad sheen is kept tight, so far water glints along the sun's path only, not as a long white ribbon; under the moon
          // a faint silver path
          vec3 glint = uLightColor * (pow(rd, 260.0) * 1.2 * (1.0 - 0.5 * uNight) + pow(rd, 60.0) * 0.07 * (1.0 - 0.6 * uNight)) * (0.3 + 0.7 * F);
          glint += uLightColor * pow(rd, 30.0) * 0.006 * uNight;
          // glitter: tiny facets on the ripples flash in the sun's path, re-rolled a few times a second (near the camera, by day;
          // under the moon only a faint few)
          float glitW = w3 * (1.0 - uNight);
          if (glitW > 0.01 && rd > 0.7) {
            vec2 gp = (isCreek > 0.5 ? q : p - uWindOff) * 5.0;
            vec2 gi = floor(gp);
            vec2 gr = tgHash22(gi + floor(uTime * 4.0) * vec2(0.37, 1.13));
            vec3 fN = normalize(N + vec3(gr.x - 0.5, 0.0, gr.y - 0.5) * 0.3);
            float fl = pow(max(dot(reflect(-V, fN), uLightDir), 0.0), 500.0);
            float spot = 1.0 - smoothstep(0.12, 0.42, length(fract(gp) - 0.5));
            glint += uLightColor * fl * spot * 1.6 * glitW;
          }
          glint *= shadow * (1.0 - uOvercast * 0.8) * (1.0 - 0.8 * ice);
          src += min(glint, vec3(3.0));

          // ---- foam: lapping at the edge of the creek, breaking white over riffles, flecks drifting downstream
          if (isCreek > 0.5) {
            float streak = wNoise(vec2(q.x * 0.3, q.y * 2.2) + 41.0).x * 0.65 + wNoise(vec2(q.x * 0.9, q.y * 4.5) + 7.0).x * 0.35;
            float shore = 1.0 - smoothstep(0.0, 0.04 + 0.1 * riffle, depth);
            float foam = shore * smoothstep(0.5, 0.82, streak) * 0.45;
            foam = max(foam, riffle * smoothstep(0.66, 0.9, streak) * smoothstep(0.06, 0.22, depth) * 0.7);
            // flecks: sparse small soft specks, a little longer than wide, carried by the current
            vec2 fc = vec2(q.x / 1.8, q.y / 0.7);
            vec2 fi = floor(fc);
            vec2 fo = tgHash22(fi + 7.0);
            vec2 fd = (fract(fc) - (0.25 + 0.5 * fo)) * vec2(1.8, 0.7);
            float fr = length(fd / vec2(0.2, 0.08));
            // they gather in a few long lanes where the current converges, not spread evenly
            float lane = smoothstep(0.42, 0.72, wNoise(vec2(q.x * 0.045, q.y * 0.85) + 61.0).x);
            float fleck = step(0.86 - 0.14 * riffle, tgHash21(fi + 31.0)) * (1.0 - smoothstep(0.4, 1.0, fr)) * w3 * lane;
            foam = max(foam, fleck * 0.3) * (1.0 - ice);
            vec3 foamC = vec3(0.74, 0.73, 0.68) * INV_PI * irr;
            src = mix(src, foamC, foam);
            a = mix(a, 1.0, foam);
          }

          // ---- ice: dark and glassy where new, frosted grey where old, faint cracks, and white once snow lies on it
          if (ice > 0.001) {
            float frosty = smoothstep(0.3, 0.8, tgNoise2(p * 0.35 + 9.0) * 0.7 + tgNoise2(p * 1.3 + 2.0) * 0.3);
            vec3 iceAlb = mix(vec3(0.07, 0.09, 0.11), vec3(0.3, 0.34, 0.38), clamp(frosty * 0.8 + uFrost * 0.25, 0.0, 1.0));
            // patches of the rim along the shore are frosted paler where it froze first
            iceAlb = mix(iceAlb, vec3(0.4, 0.44, 0.48), (1.0 - smoothstep(0.0, 0.12, depth)) * 0.5 * frosty);
            float cr = abs(tgNoise2(p * 0.55 + 2.0) - 0.5);
            iceAlb *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.018, cr)) * w3;
            float sn = smoothstep(0.08, 0.5, uSnow + (tgNoise2(p * 0.4 + 6.0) - 0.5) * 0.35);
            iceAlb = mix(iceAlb, vec3(0.93, 0.94, 0.96), sn);
            vec3 iceCol = iceAlb * INV_PI * irr + refl * F * 0.6 * (1.0 - sn);
            src = mix(src, iceCol, ice);
            a = mix(a, 0.97, ice * smoothstep(-0.005, 0.03, depth));
          }

          gl_FragColor = vec4(min(max(src, vec3(0.0)), vec3(32.0)), clamp(a, 0.0, 1.0)) * worldFade;
        }`,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // integrate the wind drift once per frame, so the ripples follow a turning wind smoothly at any time of night
    this.mesh.onBeforeRender = () => {
      const t = shared.time.value;
      const dt = this.lastT < 0 ? 0 : Math.min(0.25, Math.max(0, t - this.lastT));
      this.lastT = t;
      const w = shared.wind.value;
      const s = 0.35 + 1.1 * w.z;
      this.windOff.x += w.x * s * dt;
      this.windOff.y += w.y * s * dt;
    };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.canopyTex.dispose();
  }
}
