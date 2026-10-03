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
          // slow drifting swell plus soft warped ripples; fine octaves fade before they alias, nothing is stretched into streaks
          vec2 q = p - dir * (uTime * spd);
          float wm = 1.0 - smoothstep(50.0, 220.0, dist);
          float wf = 1.0 - smoothstep(20.0, 90.0, dist);
          float a = tgNoise2(q * 0.22 + 7.0);
          float b = tgNoise2(q * 0.8 + vec2(a * 2.0, a * 1.3) + 13.0);
          float c = tgNoise2(q * 2.1 + vec2(b * 1.5) + vec2(uTime * 0.05, 0.0) + 31.0);
          return a * 1.0 + b * 0.5 * wm + c * 0.18 * wf;
        }

        void main() {
          float terr = tgHeightAt(vWorld.xz);
          float depth = vWorld.y - terr;
          if (depth < 0.0) discard;

          vec3 toCam = cameraPosition - vWorld;
          float dist = max(length(toCam), 1e-3);
          vec3 V = toCam / dist;

          float flowLen = length(vFlow);
          vec2 dir = flowLen > 0.05 ? vFlow / flowLen : uWind.xy;
          float spd = flowLen * 0.85 + 0.1 + uWind.z * 0.5;
          vec2 p = vWorld.xz;
          float e = 0.08;
          float h0 = rippleH(p, dir, spd, dist);
          float hx = rippleH(p + vec2(e, 0.0), dir, spd, dist);
          float hz = rippleH(p + vec2(0.0, e), dir, spd, dist);
          float far = smoothstep(140.0, 900.0, dist);
          float rough = (0.45 + 0.55 * min(1.0, flowLen + uWind.z * 0.8)) * (1.0 - 0.75 * far);
          vec3 N = normalize(vec3((h0 - hx) / e * 0.07 * rough, 1.0, (h0 - hz) / e * 0.07 * rough));

          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          float cosT = clamp(dot(N, V), 0.0, 1.0);
          float F = clamp(0.045 + 0.955 * pow(1.0 - cosT, 5.0), 0.0, 1.0);

          float shadow = texture2D(tShadow, clamp(vWorld.xz / uWorld, 0.0, 1.0)).r;
          float edgeDark = smoothstep(0.02, 0.4, depth);
          // the reflected sky, darkened toward the banks where trees and grass crowd the water
          vec3 sky = tgSkyBase(normalize(vec3(R.x, max(R.y, 0.3), R.z)));
          // the reflection carries some of the dark olive of the banks and trees, more toward the edges
          sky = mix(sky * vec3(0.5, 0.58, 0.46), sky * 0.95, edgeDark);

          // sun/moon glitter: a broad continuous sheen plus a soft hot core, never single sparkles
          float rd = max(dot(R, uLightDir), 0.0);
          vec3 glint = uLightColor * (pow(rd, 260.0) * 1.5 + pow(rd, 36.0) * 0.12 + pow(rd, 5.0) * 0.012) * shadow;
          glint *= (1.0 - uOvercast * 0.8) * mix(0.45, 1.0, edgeDark);

          // body: muddy silt in the shallows fading to dark olive-teal where it is deeper
          float silt = 0.5 + 0.5 * tgNoise2(p * 0.33 + vec2(uTime * 0.03, 0.0));
          vec3 siltC = vec3(0.075, 0.085, 0.06);
          vec3 deepC = vec3(0.018, 0.065, 0.075);
          float k = 1.0 - exp(-depth * (1.5 + 1.3 * silt));
          float amb = (uSkyMid.r + uSkyMid.g + uSkyMid.b) * 0.3;
          vec3 body = mix(siltC, deepC, k) * (vec3(amb) * 1.1 + uLightColor * 0.09 * shadow);

          vec3 col = mix(body, sky, F) + glint;

          float alpha = max(1.0 - exp(-depth * 3.0), F * 0.9) * 0.97;
          alpha *= smoothstep(0.0, 0.09, depth);
          // the creek dissolves into mud before the edge of the world instead of stopping at a hard line
          float edgeW = min(min(p.x, uWorld - p.x), min(p.y, uWorld - p.y));
          alpha *= smoothstep(0.0, 20.0, edgeW);

          gl_FragColor = vec4(min(max(col, vec3(0.0)), vec3(64.0)), clamp(alpha, 0.0, 1.0));
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
