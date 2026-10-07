// Floodwater (WP S17, god tool "flood", and the natural spring floods of S12), render side. While a flood runs the sim sends
// `flood` = [ticks left, severity 0..1, band width m]: the land within the band of the creek and ponds (world.waterDist) is under
// water. This draws it as a sheet that rides the terrain a few centimetres up (deeper toward the channel), muddy and brown-green
// in the body, mirroring the sky at a glance angle, with a ragged, rippling edge; the band eases out from the water when the
// flood starts and back in when it ends, and the ground it covered stays dark and wet for a while after.
//
// Cost: the mesh holds only the terrain quads within the largest possible band of the water (about 25% of the valley), the height
// comes from the shared terrain height texture, the band edge from a one-byte water-distance texture, and the whole thing is
// hidden (not drawn at all) when no flood and no wet ground is showing. Nothing is allocated per frame.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { HEIGHT_GLSL, NOISE_GLSL, SKY_GLSL, SharedUniforms } from './common';

/** Distances beyond this (m) are not stored: the widest band the sim uses is 12 + 38 = 50 m. */
const WD_MAX = 63.75;
/** Quads farther than this from the water are left out of the mesh. */
const MESH_REACH = 58;
/** Real seconds for the water to rise to the full band, to drain out, and for the wet ground to dry. */
const RISE_S = 4.5;
const DRAIN_S = 7;
const DRY_S = 30;
/** The last ticks of a flood taper the level, so the sheet starts to draw back before the field vanishes. */
const TAPER_TICKS = 60;

export class Flood {
  readonly mesh: THREE.Mesh;
  /** Eased water level 0..1 (scales the band) and wet ground 0..1, for the bench and tests. */
  level = 0;
  wet = 0;
  private band = 30;
  private bandWet = 30;
  private sev = 0.5;
  private target = 0;
  private active = false;
  private seed = 0;
  private uniforms: Record<string, THREE.IUniform>;
  private tex: THREE.DataTexture;
  private material: THREE.ShaderMaterial;

  constructor(world: World, shared: SharedUniforms) {
    const { n, hn, cell, size } = world;

    // water distance as one byte per cell (0.25 m steps up to WD_MAX), linearly filtered: cell centres sit at (i + 0.5) / n
    const bytes = new Uint8Array(n * n);
    for (let c = 0; c < bytes.length; c++) bytes[c] = Math.round(Math.min(WD_MAX, world.waterDist[c]) * 4);
    this.tex = new THREE.DataTexture(bytes, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.generateMipmaps = false;
    this.tex.flipY = false;
    this.tex.needsUpdate = true;
    this.tex.name = 'flood.waterDist';

    // flat grid at the terrain's own vertices (the vertex shader lifts it to the ground), same triangulation as the terrain mesh
    const pos = new Float32Array(hn * hn * 3);
    for (let j = 0; j < hn; j++) for (let i = 0; i < hn; i++) { const o = (j * hn + i) * 3; pos[o] = i * cell; pos[o + 2] = j * cell; }
    const idx: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (world.waterDist[j * n + i] > MESH_REACH) continue;
        const a = j * hn + i, b = a + 1, c = a + hn, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(size / 2, 10, size / 2), size);

    this.uniforms = {
      uTime: shared.time,
      uLightDir: shared.lightDir,
      uLightColor: shared.lightColor,
      uNight: shared.night,
      uOvercast: shared.overcast,
      uSnow: shared.snow,
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
      tWd: { value: this.tex },
      uBand: { value: 0 }, // current water radius from the channel (m)
      uWetBand: { value: 0 }, // how far the wet ground reaches (m)
      uWet: { value: 0 },
      uSev: { value: 0.5 },
      uSeed: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        ${HEIGHT_GLSL}
        varying vec3 vWorld;
        void main() {
          vec3 p = position;
          p.y = tgHeightAt(p.xz) + 0.05;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        ${SKY_GLSL}
        uniform float uTime;
        uniform vec3 uLightDir;
        uniform vec3 uLightColor;
        uniform float uNight;
        uniform float uOvercast;
        uniform float uSnow;
        uniform sampler2D tShadow;
        uniform sampler2D tWd;
        uniform float uWorld;
        uniform float uBand;
        uniform float uWetBand;
        uniform float uWet;
        uniform float uSev;
        uniform float uSeed;
        const float INV_PI = 0.3183099;

        void main() {
          vec2 p = vWorld.xz;
          vec2 uv = p / uWorld;
          float wd = texture2D(tWd, uv).r * ${(255 / 4).toFixed(2)};
          // the edge wanders: eddies and trampled shallows make a ragged shoreline, not a contour line
          float rag = tgNoise2(p * 0.17 + uSeed) * 0.6 + tgNoise2(p * 0.61 + 5.0 + uSeed) * 0.4 - 0.5;
          float d = wd + rag * 5.0 * (0.4 + 0.6 * smoothstep(2.0, 20.0, uBand));
          float water = uBand > 0.01 ? 1.0 - smoothstep(uBand - 2.2, uBand + 0.5, d) : 0.0;
          float mudReach = max(uWetBand, uBand) + 1.5;
          float mud = uWet * (1.0 - smoothstep(mudReach - 5.0, mudReach, d + rag * 2.0));
          if (water < 0.004 && mud < 0.004) discard;

          float edgeW = min(min(p.x, uWorld - p.x), min(p.y, uWorld - p.y));
          float worldFade = smoothstep(0.0, 20.0, edgeW);
          vec3 toCam = cameraPosition - vWorld;
          float dist = max(length(toCam), 1e-3);
          vec3 V = toCam / dist;
          float shadow = texture2D(tShadow, clamp(uv, 0.0, 1.0)).r;
          vec3 ambC = (uSkyMid * 0.6 + uSkyZenith * 0.4) * 1.3 + uLightColor * mix(0.03, 0.08, uNight);
          vec3 irr = ambC + uLightColor * max(uLightDir.y, 0.0) * shadow;

          // ---- wet ground: dark mud, a little glossy, rough with puddled patches
          float puddle = tgNoise2(p * 0.9 + 3.0) * 0.6 + tgNoise2(p * 3.1 + 9.0) * 0.4;
          vec3 mudC = mix(vec3(0.035, 0.026, 0.018), vec3(0.075, 0.056, 0.036), puddle);
          vec3 mudSrc = mudC * INV_PI * irr * (1.0 - 0.3 * uSnow);
          float mudA = mud * mix(0.5, 0.72, smoothstep(0.35, 0.7, puddle));

          // ---- standing water: a slow swell and wind chop for the normal, Fresnel sky, muddy body colour thinning at the edge
          float depth01 = clamp(1.0 - d / max(uBand, 1.0), 0.0, 1.0);
          vec2 q = p - vec2(uTime * 0.35, uTime * 0.2);
          float e = 0.35;
          float h0 = tgNoise2(q * 0.55) * 0.6 + tgNoise2(q * 1.7 + 4.0) * 0.4;
          float hx = tgNoise2((q + vec2(e, 0.0)) * 0.55) * 0.6 + tgNoise2((q + vec2(e, 0.0)) * 1.7 + 4.0) * 0.4;
          float hz = tgNoise2((q + vec2(0.0, e)) * 0.55) * 0.6 + tgNoise2((q + vec2(0.0, e)) * 1.7 + 4.0) * 0.4;
          vec3 N = normalize(vec3(-(hx - h0) / e * 0.05, 1.0, -(hz - h0) / e * 0.05));
          float cosV = clamp(dot(N, V), 0.0, 1.0);
          float F = 0.05 + 0.95 * pow(1.0 - cosV, 5.0);
          vec3 R = reflect(-V, N);
          vec3 sky = tgSkyBase(normalize(vec3(R.x, max(R.y, 0.04), R.z)));
          // silty body: brown where it is shallow and stirred, a slate green-brown where it is deep
          vec3 bodyC = mix(vec3(0.19, 0.122, 0.062), vec3(0.105, 0.072, 0.04), smoothstep(0.1, 0.9, depth01));
          bodyC *= 0.85 + 0.3 * tgNoise2(p * 0.4 + 2.0);
          vec3 body = bodyC * INV_PI * irr * 0.9;
          // turbid floodwater scatters the light in the first centimetres and mirrors little: Fresnel is capped and weak, and what is
          // mirrored is tinted brown, so it reads as muddy water from every angle, never as a pale silver sheet at a glance
          float Fm = min(F, 0.5) * 0.17;
          vec3 src = sky * vec3(0.62, 0.5, 0.36) * Fm + body * (1.0 - Fm);
          // sun glitter on the chop
          float rd = max(dot(R, uLightDir), 0.0);
          src += uLightColor * (pow(rd, 90.0) * 0.3 + pow(rd, 700.0) * 1.4) * shadow * (1.0 - uOvercast * 0.8) * (0.4 + 0.6 * smoothstep(0.0, 0.3, h0));
          // dead grass and debris slick on the surface near the edge
          float scum = smoothstep(0.55, 0.8, tgNoise2(p * 1.3 + 17.0)) * (1.0 - depth01) * 0.4;
          src = mix(src, vec3(0.15, 0.108, 0.058) * INV_PI * irr, scum);
          // a thin pale line of foam and trash where the water meets the bank
          float shore = smoothstep(uBand - 3.0, uBand - 0.8, d) * (1.0 - smoothstep(uBand - 0.8, uBand + 0.4, d));
          src = mix(src, vec3(0.42, 0.36, 0.24) * INV_PI * irr, shore * 0.5 * smoothstep(0.2, 0.7, tgNoise2(p * 1.9 + 7.0)));
          float wA = water * mix(0.74, 0.94, smoothstep(0.0, 0.5, depth01)) * (0.85 + 0.15 * (1.0 - F));

          // water over wet mud: composite the water on the mud, then output premultiplied
          float a = wA + mudA * (1.0 - wA);
          vec3 rgb = src * wA + mudSrc * mudA * (1.0 - wA);
          gl_FragColor = vec4(min(max(rgb, vec3(0.0)), vec3(32.0)), clamp(a, 0.0, 1.0)) * worldFade;
        }`,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'flood';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
  }

  /** A frame's `flood` field ([ticks left, severity, band m]) or undefined when no flood runs. Called with every sim snapshot. */
  setFrame(f: Float32Array | undefined): void {
    if (f && f.length >= 3) {
      if (!this.active) this.seed = (this.seed + 7.31) % 100;
      this.active = true;
      this.sev = f[1];
      this.band = Math.max(1, f[2]);
      this.bandWet = this.band;
      this.target = Math.min(1, f[0] / TAPER_TICKS);
    } else {
      this.active = false;
      this.target = 0;
    }
  }

  /** Ease the level and the wet ground; call once per render frame with the real dt in seconds. */
  update(dt: number): void {
    if (!this.active && this.level <= 0.0005 && this.wet <= 0.0005) {
      if (this.mesh.visible) { this.mesh.visible = false; this.level = 0; this.wet = 0; }
      return;
    }
    const k = (s: number) => 1 - Math.exp(-dt * 3 / s);
    this.level += (this.target - this.level) * k(this.target > this.level ? RISE_S : DRAIN_S);
    // the ground is wet once the water has reached it and stays wet after it leaves
    const wetTarget = this.active ? Math.min(1, this.level * 1.6) : 0;
    this.wet += (wetTarget - this.wet) * k(wetTarget > this.wet ? 3 : DRY_S);
    if (!this.active && this.level < 0.002) this.level = 0;
    if (!this.active && this.wet < 0.01) this.wet = 0;
    const u = this.uniforms;
    // a smoothstep on the level so the front starts slowly, runs, then settles
    const L = this.level * this.level * (3 - 2 * this.level);
    u.uBand.value = this.band * L;
    u.uWetBand.value = this.bandWet;
    u.uWet.value = this.wet * (0.55 + 0.45 * this.sev);
    u.uSev.value = this.sev;
    u.uSeed.value = this.seed;
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}
