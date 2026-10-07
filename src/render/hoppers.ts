// Grasshopper outbreaks (V2-PLAN.md S12), render side. The sim sends `hoppers` with the vegetation frames while params.grasshoppers is on:
// a 32 x 32 byte grid (16 m cells, row-major by y then x), density x 255, 1 = a severe outbreak, 10 to 25 an ordinary summer.
//
// Near the camera only: one Points draw of a few thousand insects over the grass. Each insect keeps a fixed place in a repeating
// world tile (so it does not slide when the camera moves; see LEVELS for the three nested tiles), hops along a slowly wandering path in short arcs, and is shown only
// where the density field at its place says so (its own random gate against the density, so the swarm thickens and thins with
// the field). Beyond about 55 m, and from a high camera, nothing is drawn: the mesh is invisible and costs nothing, and with
// grasshoppers off the field never arrives, so nothing is ever drawn.
//
// The grass itself is not touched here: the sim already strips the grass in heavy cells and the vegetation texture shows it.
import * as THREE from 'three';
import { HEIGHT_GLSL, SharedUniforms, clamp, smoothstep } from './common';
import { SnowDepth, SNOW_N } from './snowdepth';

/**
 * Three nested repeating world tiles, each a square (side in m, insect count) centred under the camera: a small one packed tight so the
 * ground around the camera is alive, a middle one, and a wide sparse one that fades out with distance. Insects fade toward their tile's edge.
 */
const LEVELS: Array<[number, number]> = [[18, 1300], [46, 1300], [100, 1100]];
const COUNT = LEVELS.reduce((a, l) => a + l[1], 0);
/** Camera heights above ground past which nothing is drawn (m): full below the first, gone at the second. */
const H_FULL = 45;
const H_GONE = 120;

export class Hoppers {
  readonly mesh: THREE.Points;
  /** True once the sim has sent a field. */
  get on(): boolean { return this.field.on; }
  /** The eased density field (the same easing and 32 x 32 layout as the snow depth), also the sampler for the CPU checks. */
  private field: SnowDepth;
  private mat: THREE.ShaderMaterial;
  private uniforms: Record<string, THREE.IUniform>;
  private worldSize: number;

  constructor(worldSize: number, shared: SharedUniforms, hn: number, cell: number) {
    this.worldSize = worldSize;
    this.field = new SnowDepth(worldSize);
    let rs = 31337;
    const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    const base = new Float32Array(COUNT * 4); // tile x, tile z (0..1), gate, seed
    const tile = new Float32Array(COUNT);
    for (let i = 0, lv = 0, k = 0; i < COUNT; i++, k++) {
      if (k >= LEVELS[lv][1]) { lv++; k = 0; }
      base[i * 4] = rnd(); base[i * 4 + 1] = rnd();
      base[i * 4 + 2] = (k + rnd()) / LEVELS[lv][1];   // stratified within its level, so the count shown follows the density smoothly
      base[i * 4 + 3] = rnd();
      tile[i] = LEVELS[lv][0];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('aBase', new THREE.BufferAttribute(base, 4));
    geo.setAttribute('aTile', new THREE.BufferAttribute(tile, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(worldSize / 2, 5, worldSize / 2), worldSize * 4);

    this.uniforms = {
      uTime: shared.time,
      tHeight: shared.heightTex,
      uCell: { value: cell },
      uHN: { value: hn },
      uWorld: shared.worldSize,
      tHop: { value: this.field.tex },
      uCenter: { value: new THREE.Vector2(worldSize / 2, worldSize / 2) },
      uAmt: { value: 0 },
      uPx: { value: 800 },
      uLightColor: shared.lightColor,
      uSkyMid: shared.skyMid,
      uSkyHorizon: shared.skyHorizon,
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        ${HEIGHT_GLSL}
        attribute vec4 aBase;
        attribute float aTile;
        uniform float uTime;
        uniform float uWorld;
        uniform vec2 uCenter;
        uniform float uAmt;
        uniform float uPx;
        uniform sampler2D tHop;
        varying vec4 vC;   // rgb tint, alpha
        varying float vFly;
        vec2 wander(float seed, float k) {
          // a smooth wandering path sampled once per hop: consecutive points are a metre or two apart
          return 3.4 * vec2(sin(k * 0.83 + seed * 61.0) + 0.5 * sin(k * 1.9 + seed * 17.0), sin(k * 0.67 + seed * 43.0) + 0.5 * cos(k * 1.7 + seed * 29.0));
        }
        void main() {
          float seed = aBase.w;
          float per = 0.55 + 0.95 * fract(seed * 7.31);          // seconds per hop
          float tt = uTime / per + seed * 31.0;
          float k = floor(tt), ph = fract(tt);
          float s = clamp(ph / 0.42, 0.0, 1.0);                  // the hop takes the first 42% of the cycle, then it sits
          float sm = s * s * (3.0 - 2.0 * s);
          vec2 off = mix(wander(seed, k), wander(seed, k + 1.0), sm);
          float arc = 4.0 * s * (1.0 - s) * (0.4 + 0.7 * fract(seed * 3.3));
          vec2 rel = aBase.xy * aTile + off - uCenter;
          rel = mod(rel + 0.5 * aTile, aTile) - 0.5 * aTile;
          vec2 xz = uCenter + rel;
          float d = texture2D(tHop, clamp(xz / uWorld, vec2(0.0), vec2(1.0))).r;
          float dens = smoothstep(0.02, 0.5, d);
          float vis = smoothstep(aBase.z, aBase.z + 0.1, dens * uAmt);
          float gh = tgHeightAt(clamp(xz, vec2(0.0), vec2(uWorld)));
          vec3 pos = vec3(xz.x, gh + 0.45 + 0.5 * fract(seed * 9.1) + arc, xz.y);   // on the blade tops, so the sward does not hide them
          vec4 mv = viewMatrix * vec4(pos, 1.0);
          float dist = -mv.z;
          float edge = 1.0 - smoothstep(0.3 * aTile, 0.5 * aTile, max(abs(rel.x), abs(rel.y)));
          float lod = 1.0 - smoothstep(24.0, 55.0, dist);
          float a = vis * edge * lod;
          if (a < 0.01 || dist < 0.4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vC = vec4(0.0); vFly = 0.0; return; }
          gl_Position = projectionMatrix * mv;
          float fly = step(0.04, s) * step(s, 0.96);
          vFly = fly;
          // a little exaggerated (a swarm reads at a glance), larger in the air with the wings out
          gl_PointSize = clamp(uPx * (0.09 + 0.05 * fly) / dist, 2.2, 14.0);
          float tone = fract(seed * 5.7);
          vC = vec4(mix(vec3(0.04, 0.032, 0.012), vec3(0.09, 0.058, 0.022), tone), a * (0.8 + 0.2 * tone));
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec4 vC;
        varying float vFly;
        uniform vec3 uLightColor;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = clamp(1.0 - r, 0.0, 1.0);
          a = smoothstep(0.0, 0.5, a);
          vec3 amb = uSkyMid * 0.55 + uSkyHorizon * 0.45;
          vec3 col = vC.rgb * (amb * 0.6 + uLightColor * 0.12);
          // wings flash pale as it springs
          col = mix(col, vec3(0.3, 0.22, 0.09) * (amb * 0.6 + uLightColor * 0.2), vFly * 0.3);
          gl_FragColor = vec4(min(col, vec3(2.0)), vC.a * a);
        }`,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    this.mesh.name = 'hoppers';
  }

  /** The sim's field (Snapshot.hoppers, 32 x 32 bytes) or undefined on frames without the vegetation texture (the last field stays). */
  setField(b: Uint8Array | undefined): void {
    if (b && b.length >= SNOW_N * SNOW_N) this.field.setTarget(b);
  }

  /**
   * Per render frame. (focusX, focusZ) is the ground point the camera watches (the tile is centred mostly under the camera, a little toward it), (camX, camY, camZ) the camera
   * and `ground` the terrain height under it; `viewportH` and `fovDeg` give the point-size scale.
   */
  update(dt: number, focusX: number, focusZ: number, camX: number, camY: number, camZ: number, ground: number, viewportH: number, fovDeg: number): void {
    if (!this.field.on) return;
    this.field.update(dt);
    const above = camY - ground;
    const heightK = 1 - smoothstep(H_FULL, H_GONE, above);
    if (heightK <= 0.001) { this.mesh.visible = false; return; }
    // anything to show within reach of the camera? (the field is 16 m cells: look at the nine points around it at 30 m)
    let peak = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const d = this.field.sample(clamp(focusX + i * 30, 0, this.worldSize), clamp(focusZ + j * 30, 0, this.worldSize));
      if (d > peak) peak = d;
      const d2 = this.field.sample(clamp(camX + i * 30, 0, this.worldSize), clamp(camZ + j * 30, 0, this.worldSize));
      if (d2 > peak) peak = d2;
    }
    if (peak < 0.03) { this.mesh.visible = false; return; }
    const u = this.uniforms;
    // the tile sits mostly under the camera, a little toward what it watches
    (u.uCenter.value as THREE.Vector2).set(camX + 0.3 * (focusX - camX), camZ + 0.3 * (focusZ - camZ));
    u.uAmt.value = heightK;
    u.uPx.value = viewportH / (2 * Math.tan(fovDeg * Math.PI / 360));
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.field.dispose();
  }
}
