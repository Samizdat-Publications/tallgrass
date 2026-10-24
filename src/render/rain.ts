// Falling rain: a camera-local volume of streaks drawn as one instanced draw, in a post pass after the fog, the same approach as the
// snow in snow.ts. Replaces the old screen-space streak layer, which sat on the lens: these streaks are world-fixed drops falling
// through the scene, so they parallax with every camera move, near ones are long and bright, far ones short and faint, they are
// depth-tested by hand against the scene (a drop behind a hill or a tree is hidden), faded by their own distance (the visibility
// range tightens in a storm) and coloured by the ambient sky. The whole pass is skipped, at no GPU cost, while it is not raining.
import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { clamp, smoothstep } from './common';

const MAX_DROPS = 36000;
/** Drops in play at full intensity when the rain is light (the pool the original rain used); a downpour (heavy = 1) fills the whole pool. */
const LIGHT_DROPS = 26000;

export interface RainParams {
  /** 0..1 eased rain intensity (0 = not raining). */
  fall: number;
  /** 0..1 wind strength from the env. */
  windStrength: number;
  /** unit wind direction on the ground plane (x, z). */
  windX: number;
  windZ: number;
  /** Camera height above the ground (m). */
  aboveGround: number;
  /** 0..1 downpour amount (0 = a light rain, which is drawn exactly as before): denser, longer, brighter streaks in a tighter volume. */
  heavy?: number;
  /** Linear streak colour (already lit by the current sky and ambient). */
  color: THREE.Color;
}

export class Rain {
  readonly scene = new THREE.Scene();
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  /** Seconds on the drop clock (advances with real time while raining). */
  private clock = 0;
  /** Whether the pass has anything to draw this frame. */
  active = false;
  /** Drops in play this frame. */
  get count(): number { return this.geo.instanceCount; }

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    const seed = new Float32Array(MAX_DROPS * 4);
    // a small deterministic PRNG, so every run lays the drops out the same way
    let s = 0x6d2b79f5;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000003) / 1000003; };
    for (let i = 0; i < seed.length; i++) seed[i] = rnd();
    this.geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    this.geo.instanceCount = 0;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2(1600, 900) },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: 24 },
        uT: { value: 0 },
        uWindV: { value: new THREE.Vector2() },
        uFall: { value: 8.5 },
        uShutter: { value: 0.03 },
        uPx: { value: 0.0009 },
        uDrop: { value: 0.0042 },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uExt: { value: 0.012 },
        uAlpha: { value: 0.5 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform vec3 uCam;
        uniform float uBox;
        uniform float uT;
        uniform vec2 uWindV;
        uniform float uFall;
        uniform float uShutter;
        uniform float uPx;
        uniform float uDrop;
        uniform float uExt;
        uniform float uAlpha;
        varying vec2 vQ;
        varying float vA;
        varying float vZ;
        void main() {
          float fall = uFall * (0.82 + 0.36 * aSeed.w);
          float gust = 0.9 + 0.2 * aSeed.z;
          vec3 vel = vec3(uWindV.x * gust, -fall, uWindV.y * gust);
          vec3 pw = aSeed.xyz * uBox + vel * uT;
          vec3 rel = mod(pw - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
          float r = length(rel);
          vec3 wp = uCam + rel;
          vec3 pv = (viewMatrix * vec4(wp, 1.0)).xyz;
          float depth = max(-pv.z, 0.05);
          vZ = depth;
          // the streak lies along the drop's own motion, projected on the screen
          vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
          float sp = length(vv.xy);
          vec2 ax = sp > 1e-3 ? vv.xy / sp : vec2(0.0, -1.0);
          vec2 ac = vec2(ax.y, -ax.x);   // handedness chosen so the quad faces the camera (it is back-face culled otherwise)
          float world = uDrop * (0.7 + 0.9 * aSeed.x);
          float pxW = depth * uPx;                 // metres per pixel at this depth
          float sz = max(world, pxW * 1.1);        // never thinner than about a pixel
          float len = sp * uShutter * (0.6 + 0.8 * aSeed.y);
          float L = sz + len * 0.5;
          vec2 q = position.xy;                    // -1..1
          vec3 cv = pv;
          cv.xy += ac * q.x * sz + ax * q.y * L;
          vQ = q;
          // energy-preserving fade for streaks thinner than a pixel, a soft edge at the box, a soft near clip, and the visibility range
          float small = clamp(world / sz, 0.0, 1.0);
          float edge = 1.0 - smoothstep(0.34 * uBox, 0.5 * uBox, r);
          float nearF = smoothstep(0.8, 4.5, depth);
          vA = uAlpha * (0.5 + 0.5 * aSeed.z) * small * edge * nearF * exp(-depth * uExt);
          gl_Position = projectionMatrix * vec4(cv, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDepth;
        uniform mat4 uInvProj;
        uniform vec2 uRes;
        uniform vec3 uColor;
        varying vec2 vQ;
        varying float vA;
        varying float vZ;
        void main() {
          // soft across, rounded ends along
          float a = exp(-1.8 * vQ.x * vQ.x) * (1.0 - smoothstep(0.25, 1.0, abs(vQ.y)));
          a *= vA;
          if (a < 0.003) discard;
          // hand depth test against the scene (streaks are not in the depth buffer, and the pass runs after the fog)
          vec2 suv = gl_FragCoord.xy / uRes;
          float d = texture2D(tDepth, suv).x;
          vec4 vp = uInvProj * vec4(suv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          float sceneZ = -vp.z / vp.w;
          a *= smoothstep(-0.05, 0.2, sceneZ - vZ);
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Per-frame state. `fall` 0 turns the pass off entirely. */
  update(dt: number, camera: THREE.PerspectiveCamera, p: RainParams): void {
    // high above the valley the camera-local volume would only be a haze of dashes in front of the lens: it thins out with altitude
    const alt = 1 - smoothstep(110, 240, p.aboveGround);
    const fall = clamp(p.fall, 0, 1) * alt;
    this.active = fall > 0.01;
    if (!this.active) { this.geo.instanceCount = 0; return; }
    this.clock += dt;
    const u = this.material.uniforms;
    const ws = clamp(p.windStrength, 0, 1);
    const hv = clamp(p.heavy ?? 0, 0, 1);
    // wind slants the fall: a light rain is nearly vertical, a gale lays it over
    const vw = 0.4 + 8.5 * Math.pow(ws, 1.5);
    (u.uWindV.value as THREE.Vector2).set(p.windX * vw, p.windZ * vw);
    u.uFall.value = 8.2 + 1.2 * fall + 1.6 * hv;
    u.uShutter.value = 0.017 * (1 + 0.3 * hv);
    // the volume is small near the ground and widens with altitude
    // (a downpour packs the same drops, and more of them, into a smaller volume: several times as many streaks near the lens)
    u.uBox.value = clamp(24 + 0.3 * p.aboveGround, 24, 64) * (1 - 0.32 * hv);
    u.uT.value = this.clock;
    (u.uCam.value as THREE.Vector3).copy(camera.position);
    u.uPx.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) / Math.max(1, (u.uRes.value as THREE.Vector2).y);
    u.uDrop.value = 0.0036 * (1 + 0.3 * hv);
    // how many drops of the pool are in play: a drizzle thins the volume, a downpour fills it
    this.geo.instanceCount = Math.round((LIGHT_DROPS + (MAX_DROPS - LIGHT_DROPS) * hv) * clamp(fall, 0, 1));
    // the visibility range: rain in the air dims what is far, more so in a downpour
    u.uExt.value = 0.008 + 0.014 * fall + 0.006 * hv;
    (u.uColor.value as THREE.Color).copy(p.color);
    // (r-life: softer and more transparent: the round 23 and 24 critics read the old streaks as white dashes; the soft falloff is wider and the alpha lower)
    u.uAlpha.value = 0.17 + 0.1 * fall + 0.17 * hv;
  }

  dispose(): void { this.geo.dispose(); this.material.dispose(); }
}

/** Draws the rain over the fogged frame, before bloom. Skipped (no GPU work) when it is not raining. */
export class RainPass extends Pass {
  constructor(private rain: Rain, private camera: THREE.PerspectiveCamera, private getDepth: () => THREE.Texture) {
    super();
    this.needsSwap = false;
  }

  override setSize(w: number, h: number): void {
    (this.rain.material.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (!this.rain.active || this.rain.count === 0) return;
    const u = this.rain.material.uniforms;
    u.tDepth.value = this.getDepth();
    (u.uInvProj.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    renderer.render(this.rain.scene, this.camera);
    renderer.autoClear = prevAuto;
  }

  override dispose(): void { /* the Rain object owns the GPU resources */ }
}
