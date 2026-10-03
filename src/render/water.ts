// Water: creek and ponds. One mesh over the water cells at their surface height, dilated a few cells under the
// banks. The shader measures true water depth against the height texture, so the shoreline is a smooth contour
// (no gaps, no hard edges), with fresnel sky reflection, moving ripples, sun glint and a faint foam line.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { HEIGHT_GLSL, NOISE_GLSL, SKY_GLSL, SharedUniforms } from './common';

export class Water {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(world: World, shared: SharedUniforms, creekDist: Float32Array) {
    const { n, hn, cell } = world;

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

    // ---- creek flow direction per vertex (ponds are still)
    const creek = world.creek;
    const nc = creek.length / 2;
    const flow = (x: number, z: number): [number, number] => {
      let best = 1e9, fx = 0, fz = 0;
      for (let k = 0; k < nc - 1; k++) {
        const ax = creek[2 * k], az = creek[2 * k + 1];
        const bx = creek[2 * k + 2], bz = creek[2 * k + 3];
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz;
        let s = ((x - ax) * dx + (z - az) * dz) / l2;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        const d2 = (x - ax - dx * s) ** 2 + (z - az - dz * s) ** 2;
        if (d2 < best) { best = d2; const l = Math.sqrt(l2); fx = dx / l; fz = dz / l; }
      }
      return Math.sqrt(best) < 11 ? [fx, fz] : [0, 0];
    };

    const pos: number[] = [];
    const flw: number[] = [];
    const remap = new Int32Array(hn * hn).fill(-1);
    const idx: number[] = [];
    const vert = (i: number, j: number): number => {
      const v = j * hn + i;
      if (remap[v] >= 0) return remap[v];
      remap[v] = pos.length / 3;
      pos.push(i * cell, wy[v], j * cell);
      const [fx, fz] = flow(i * cell, j * cell);
      flw.push(fx, fz);
      return remap[v];
    };
    for (let j = 0; j < hn - 1; j++) {
      for (let i = 0; i < hn - 1; i++) {
        const a = j * hn + i, b = a + 1, c = a + hn, d = c + 1;
        if (Number.isNaN(wy[a]) || Number.isNaN(wy[b]) || Number.isNaN(wy[c]) || Number.isNaN(wy[d])) continue;
        const va = vert(i, j), vb = vert(i + 1, j), vc = vert(i, j + 1), vd = vert(i + 1, j + 1);
        // winding with +Y normals
        idx.push(va, vc, vb, vb, vc, vd);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flw, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(world.size / 2, 10, world.size / 2), world.size);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.time,
        uLightDir: shared.lightDir,
        uLightColor: shared.lightColor,
        uWind: shared.wind,
        uNight: shared.night,
        uOvercast: shared.overcast,
        uSunDir: shared.sunDir,
        uSkyZenith: shared.skyZenith,
        uSkyMid: shared.skyMid,
        uSkyHorizon: shared.skyHorizon,
        uSunGlow: shared.sunGlow,
        tHeight: shared.heightTex,
        tShadow: shared.terrainShadow,
        uCell: { value: cell },
        uHN: { value: hn },
        uWorld: shared.worldSize,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aFlow;
        varying vec3 vWorld;
        varying vec2 vFlow;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vFlow = aFlow;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorld;
        varying vec2 vFlow;
        uniform float uTime;
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform vec3 uWind;
        uniform float uNight;
        uniform float uOvercast;
        uniform sampler2D tShadow;
        uniform float uWorld;
        ${NOISE_GLSL}
        ${SKY_GLSL}
        ${HEIGHT_GLSL}

        float rippleH(vec2 p, vec2 dir, float spd, float dist) {
          vec2 perp = vec2(-dir.y, dir.x);
          vec2 q = vec2(dot(p, dir) - uTime * spd, dot(p, perp));
          // large swell is always there so distant water still mottles; finer octaves fade before they alias
          float wm = 1.0 - smoothstep(60.0, 260.0, dist);
          float wf = 1.0 - smoothstep(25.0, 110.0, dist);
          return tgNoise2(q * vec2(0.11, 0.34) + 7.0) * 1.1
               + tgNoise2(q * vec2(0.8, 2.4)) * 0.55 * wm + tgNoise2(q * vec2(2.0, 5.5) + 13.0) * 0.3 * wm
               + tgNoise2(q * vec2(4.6, 10.0) + 31.0) * 0.15 * wf;
        }

        void main() {
          float terr = tgHeightAt(vWorld.xz);
          float depth = vWorld.y - terr;
          if (depth < 0.0) discard;

          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;

          float flowLen = length(vFlow);
          vec2 dir = flowLen > 0.05 ? vFlow / flowLen : uWind.xy;
          float spd = flowLen * 0.85 + 0.1 + uWind.z * 0.5;
          vec2 p = vWorld.xz;
          float e = 0.08;
          float h0 = rippleH(p, dir, spd, dist);
          float hx = rippleH(p + vec2(e, 0.0), dir, spd, dist);
          float hz = rippleH(p + vec2(0.0, e), dir, spd, dist);
          float rough = 0.45 + 0.55 * min(1.0, flowLen + uWind.z * 0.8);
          vec3 N = normalize(vec3((h0 - hx) / e * 0.1 * rough, 1.0, (h0 - hz) / e * 0.1 * rough));

          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          float cosT = clamp(dot(N, V), 0.0, 1.0);
          float F = clamp(0.07 + 0.93 * pow(1.0 - cosT, 4.0), 0.0, 1.0);

          vec3 sky = tgSkyBase(normalize(vec3(R.x, max(R.y, 0.22), R.z)));
          float shadow = texture2D(tShadow, vWorld.xz / uWorld).r;

          // sun glint: tight lobe on the rippled surface plus a broad sheen near the sun
          float rd = max(dot(R, uLightDir), 0.0);
          vec3 glint = uLightColor * (pow(rd, 900.0) * 6.0 + pow(rd, 120.0) * 0.5 + pow(rd, 10.0) * 0.06) * shadow;
          glint *= (1.0 - uOvercast * 0.8);

          // body color: bed seen through shallow water fading to deep teal
          vec3 absorb = 1.0 - exp(-depth * vec3(1.9, 0.95, 0.55));
          vec3 bed = vec3(0.13, 0.11, 0.08);
          vec3 deepC = vec3(0.018, 0.085, 0.12);
          float amb = (uSkyMid.r + uSkyMid.g + uSkyMid.b) * 0.3;
          vec3 bodyLight = vec3(amb) * 1.2 + uLightColor * 0.1 * shadow;
          vec3 body = mix(bed, deepC, absorb) * bodyLight;

          vec3 col = mix(body, sky, F) + glint;

          float clearA = 1.0 - exp(-depth * 2.6);
          float alpha = max(clearA * 0.92, F);
          alpha *= smoothstep(0.0, 0.06, depth);

          // faint foam / wet lip at the waterline
          float foam = (1.0 - smoothstep(0.015, 0.14, depth)) * (0.4 + 0.6 * tgNoise2(p * 3.0 + uTime * 0.25));
          col = mix(col, vec3(0.78, 0.83, 0.88) * (amb * 1.6 + 0.25), foam * 0.35);
          alpha = max(alpha, foam * 0.45 * smoothstep(0.0, 0.02, depth));

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        }`,
      transparent: true,
      depthWrite: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
