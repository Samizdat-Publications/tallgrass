// Dust storms (V2-PLAN.md S12), render side. The sim sends `dust` while a storm runs (params.dustStorms on):
// [intensity 0..1, direction the dust travels (rad, 0 = +x, CCW toward +y; sim y is three z), ticks left, front 0..1, peak].
//
// This file owns two things: the blowing dust itself (one instanced draw of a few hundred soft streaks and sheets that drift
// downwind near the ground, axial billboards turned toward the camera about the wind axis) and the eased storm level the engine
// reads for the rest of the picture (fog density and colour, sky and sun, shadows; see engine.ts and post.ts). Nothing is drawn
// and nothing is computed while no storm runs: the mesh is invisible and update() returns at once.
//
// `front` is the leading wall crossing the valley along the travel direction. The storm covers the ground behind the wall, so the
// dust arrives at a place when the wall reaches it: the camera's own cover (a smoothstep on how far behind the wall it stands)
// multiplies the eased level that drives the fog, and each streak is gated by its own position, with extra weight at the wall.
import * as THREE from 'three';
import { HEIGHT_GLSL, NOISE_GLSL, SharedUniforms, clamp, smoothstep } from './common';

const COUNT = 640;
/** Side of the square tile the streaks repeat over (m); each streak is drawn at the copy nearest the camera's focus. */
const TILE = 560;

export class DustStorm {
  readonly mesh: THREE.Mesh;
  /** Storm strength at the camera now, 0..1: the sim's intensity eased in render time, times the wall's cover of the camera. */
  amount = 0;
  /** True while the sim reports a storm, or the eased level has not yet faded out. */
  active = false;
  /** Direction the dust travels as a unit vector on the ground plane (three x, z), and the speed it blows at (m/s). */
  readonly dir = new THREE.Vector2(1, 0);
  private level = 0;
  private target = 0;
  private front = 1;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private uniforms: Record<string, THREE.IUniform>;
  private worldSize: number;
  /** Metres the dust has blown since the first frame (the integral of the speed, so a change of speed never jumps the streaks). */
  private drift = 0;

  constructor(worldSize: number, shared: SharedUniforms, hn: number, cell: number) {
    this.worldSize = worldSize;
    // seeded placement so a storm looks the same every time
    let rs = 777013;
    const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
    const a = new Float32Array(COUNT * 4); // tile x, tile z, size class, gate
    const b = new Float32Array(COUNT * 4); // height class, speed class, phase, thickness class
    for (let i = 0; i < COUNT; i++) {
      a[i * 4] = rnd(); a[i * 4 + 1] = rnd(); a[i * 4 + 2] = rnd(); a[i * 4 + 3] = (i + rnd()) / COUNT;
      b[i * 4] = rnd(); b[i * 4 + 1] = rnd(); b[i * 4 + 2] = rnd(); b[i * 4 + 3] = rnd();
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
    this.geo.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
    this.geo.instanceCount = COUNT;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(worldSize / 2, 30, worldSize / 2), worldSize * 4);

    this.uniforms = {
      tHeight: shared.heightTex,
      uCell: { value: cell },
      uHN: { value: hn },
      uWorld: shared.worldSize,
      uLightColor: shared.lightColor,
      uSkyMid: shared.skyMid,
      uSkyHorizon: shared.skyHorizon,
      uCenter: { value: new THREE.Vector2(worldSize / 2, worldSize / 2) },
      uDir: { value: new THREE.Vector2(1, 0) },
      uAmt: { value: 0 },
      uWall: { value: 1.2 },
      uScale: { value: 1 },
      uDrift: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        ${HEIGHT_GLSL}
        attribute vec4 aA;
        attribute vec4 aB;
        uniform float uDrift;
        uniform float uWorld;
        uniform vec2 uCenter;
        uniform vec2 uDir;
        uniform float uAmt;
        uniform float uWall;
        uniform float uScale;
        varying vec2 vUv;
        varying vec4 vData;   // x: alpha weight, y: seed, z: wall weight, w: lengthwise scroll
        varying vec3 vWorld;
        void main() {
          float cls = aA.z;
          // small fast grit near the ground (a third of them) or a long, taller sheet
          bool grit = cls < 0.34;
          float len = (grit ? 6.0 + 12.0 * cls : 20.0 + 44.0 * aA.z) * uScale;
          float hgt = (grit ? 0.8 + 1.2 * aB.w : 2.2 + 5.0 * aB.w) * uScale;
          float sp = grit ? 1.35 : 0.8 + 0.4 * aB.y;   // drift multiplier
          vec2 base = aA.xy * ${TILE.toFixed(1)};
          vec2 rel = base + uDir * sp * uDrift - uCenter;
          rel = mod(rel + ${(TILE / 2).toFixed(1)}, ${TILE.toFixed(1)}) - ${(TILE / 2).toFixed(1)};
          vec2 xz = uCenter + rel;
          float edge = 1.0 - smoothstep(${(TILE * 0.32).toFixed(1)}, ${(TILE * 0.5).toFixed(1)}, max(abs(rel.x), abs(rel.y)));
          // the wall: behind it the storm covers the ground; the weight peaks at its edge
          float s = dot(xz - 0.5 * uWorld, uDir) / uWorld + 0.5;
          float behind = uWall - s;
          float cover = smoothstep(0.0, 0.14, behind);
          float wallW = exp(-pow((behind - 0.05) / 0.07, 2.0)) * step(0.0, behind);
          float gate = smoothstep(aA.w, aA.w + 0.12, uAmt * (0.55 + 0.9 * cover) );
          float gh = tgHeightAt(clamp(xz, vec2(0.0), vec2(uWorld)));
          float lift = grit ? 0.25 + 1.2 * aB.x : 0.5 + 6.0 * aB.x * aB.x;
          vec3 pos = vec3(xz.x, gh + lift + 0.4 * hgt, xz.y);
          vec3 axis = normalize(vec3(uDir.x, 0.0, uDir.y));
          // a streak is a camera-facing quad whose long side follows the wind as the camera sees it: the wind axis with its view-direction
          // part removed. Seen end-on (the camera looking along the wind) that projection vanishes, so it falls back to the camera's right
          // vector and a short, blob-like streak instead of an edge-on quad.
          float camD = length(cameraPosition - pos);
          vec3 tc = (cameraPosition - pos) / max(camD, 1e-3);
          vec3 r = axis - tc * dot(axis, tc);
          float rl = length(r);
          float side = smoothstep(0.0, 0.4, rl);
          vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 rEnd = dot(camR, axis) >= 0.0 ? camR : -camR;
          r = normalize(mix(rEnd, rl > 1e-4 ? r / rl : rEnd, side));
          vec3 up = normalize(cross(tc, r));
          float lenEff = len * mix(0.08, 1.0, smoothstep(0.0, 0.55, rl));
          vec3 wp = pos + r * position.x * lenEff + up * position.y * hgt;
          vUv = position.xy * 2.0;
          vWorld = wp;
          float alpha = gate * edge * cover * (grit ? 0.55 : 0.8) * (0.6 + 0.4 * side) * (1.0 + 0.9 * wallW) * smoothstep(2.5, 16.0, camD);
          vData = vec4(alpha, aB.z + aA.x, wallW, uDrift * sp / max(len, 1.0));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        varying vec4 vData;
        varying vec3 vWorld;
        uniform vec3 uLightColor;
        uniform vec3 uSkyMid;
        uniform vec3 uSkyHorizon;
        ${NOISE_GLSL}
        void main() {
          if (vData.x < 0.01) discard;
          // a soft lozenge, ragged by two octaves of noise that stream along the wind faster than the streak itself
          float ex = 1.0 - smoothstep(0.25, 1.0, abs(vUv.x));
          float ey = 1.0 - abs(vUv.y);
          float n = 0.6 * tgNoise2(vec2(vUv.x * 2.4 - vData.w * 2.4 + vData.y * 31.0, vUv.y * 1.6 + vData.y * 7.0))
                  + 0.4 * tgNoise2(vec2(vUv.x * 6.0 - vData.w * 5.0 + vData.y * 11.0, vUv.y * 3.5 - vData.y * 3.0));
          float body = ex * ey * ey;
          float a = smoothstep(0.18, 0.8, body * (0.45 + 1.1 * n));
          float alpha = a * vData.x * 0.55;
          if (alpha < 0.004) discard;
          // lit like airborne fines: ambient sky plus the key light, brighter toward the sun
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 albedo = vec3(0.38, 0.24, 0.11) * (0.85 + 0.35 * n);
          vec3 amb = uSkyMid * 0.6 + uSkyHorizon * 0.4;
          vec3 col = albedo * (amb * 1.1 + uLightColor * (0.22 + 0.2 * vData.z));
          gl_FragColor = vec4(min(col, vec3(4.0)), alpha);
        }`,
      transparent: true, depthWrite: false, depthTest: true, fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = 'duststorm';
  }

  /** The sim's frame (Snapshot.dust) or undefined when no storm runs. Send every snapshot. */
  setFrame(f: Float32Array | undefined): void {
    if (f && f.length >= 5) {
      this.target = clamp(f[0], 0, 1);
      this.dir.set(Math.cos(f[1]), Math.sin(f[1]));
      this.front = clamp(f[3], 0, 1);
      this.active = true;
    } else {
      this.target = 0;
      this.active = false;
    }
  }

  /** Cover of a ground point by the wall, 0 (the wall has not reached it) .. 1 (well behind it). */
  private cover(x: number, z: number): number {
    const s = ((x - 0.5 * this.worldSize) * this.dir.x + (z - 0.5 * this.worldSize) * this.dir.y) / this.worldSize + 0.5;
    const wall = -0.15 + 1.3 * this.front;
    return smoothstep(0, 0.14, wall - s);
  }

  /**
   * Per render frame. `focusX, focusZ` is the ground point the camera watches (the streak tile is centred on it), `camDist` the camera's
   * distance from it (the streaks grow with it so the wide view still reads), `easeS` the real seconds the level takes to follow the sim.
   */
  update(dt: number, focusX: number, focusZ: number, camDist: number, easeS: number, snap: boolean): void {
    if (!this.active && this.level < 0.002) {
      if (this.level !== 0 || this.mesh.visible) { this.level = 0; this.amount = 0; this.mesh.visible = false; }
      return;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt / Math.max(0.05, this.target > this.level ? easeS : easeS * 1.6));
    this.level += (this.target - this.level) * k;
    if (!this.active && this.level < 0.002) this.level = 0;
    this.drift += (7 + 15 * this.level) * dt;
    this.amount = this.level * this.cover(focusX, focusZ);
    const u = this.uniforms;
    (u.uCenter.value as THREE.Vector2).set(focusX, focusZ);
    (u.uDir.value as THREE.Vector2).copy(this.dir);
    u.uAmt.value = this.level;
    u.uWall.value = -0.15 + 1.3 * this.front;
    u.uScale.value = clamp(camDist / 70, 1, 3.4);
    u.uDrift.value = this.drift;
    this.mesh.visible = this.level > 0.004;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
