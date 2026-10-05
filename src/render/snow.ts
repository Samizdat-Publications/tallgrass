// Falling snow (V2-PLAN R2 item 7): a camera-local volume of flakes drawn as one instanced draw, in a post pass after the fog
// (so a flake is fogged by its own distance, not by the terrain behind it). Every flake position is a closed-form function of its
// seed and the clock (no per-flake CPU work): a world-fixed lattice advected by the wind and wrapped around the camera. Flakes
// are depth-tested by hand against the scene depth, stretch into near-horizontal streaks in a blizzard, and the whole pass
// costs nothing (it is skipped) while it is not snowing.
import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { clamp, smoothstep } from './common';

const MAX_FLAKES = 14000;

export interface SnowParams {
  /** 0..1 eased snowfall intensity (0 = not snowing). */
  fall: number;
  /** 0..1 wind strength from the env. */
  windStrength: number;
  /** unit wind direction on the ground plane (x, z). */
  windX: number;
  windZ: number;
  /** Camera height above the ground (m). */
  aboveGround: number;
  /** Linear flake colour (already lit by the current ambient and key light). */
  color: THREE.Color;
}

/** Blizzard amount 0..1: snowing and wind past 0.6. */
export function blizzardAmount(fall: number, windStrength: number): number {
  return fall * smoothstep(0.55, 0.78, windStrength);
}

export class Snow {
  readonly scene = new THREE.Scene();
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  /** Seconds on the flake clock (advances with real time while snowing). */
  private clock = 0;
  /** Blizzard amount of the last update (0..1). */
  blizzard = 0;
  /** Whether the pass has anything to draw this frame. */
  active = false;
  /** Flakes in play this frame. */
  get count(): number { return this.geo.instanceCount; }
  private pxScale = 0.0006;

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    const seed = new Float32Array(MAX_FLAKES * 4);
    // a small deterministic PRNG, so every run lays the flakes out the same way
    let s = 0x2545f491;
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
        uBox: { value: 20 },
        uT: { value: 0 },
        uWindV: { value: new THREE.Vector2() },
        uFall: { value: 1.1 },
        uFlutter: { value: 1 },
        uShutter: { value: 0.012 },
        uPx: { value: 0.0006 },
        uFlake: { value: 0.02 },
        uColor: { value: new THREE.Color(1, 1, 1) },
        uExt: { value: 0.0 },
        uAlpha: { value: 0.9 },
        uBlizz: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform vec3 uCam;
        uniform float uBox;
        uniform float uT;
        uniform vec2 uWindV;
        uniform float uFall;
        uniform float uFlutter;
        uniform float uShutter;
        uniform float uPx;
        uniform float uFlake;
        uniform float uExt;
        uniform float uAlpha;
        uniform float uBlizz;
        varying vec2 vQ;
        varying float vK;
        varying float vA;
        varying float vZ;
        void main() {
          float fall = uFall * (0.7 + 0.6 * aSeed.w);
          float gust = 0.85 + 0.3 * aSeed.z;
          vec3 vel = vec3(uWindV.x * gust, -fall, uWindV.y * gust);
          vec3 pw = aSeed.xyz * uBox + vel * uT;
          // slow tumble, calmer the harder the wind blows
          pw.xz += uFlutter * 0.22 * vec2(sin(uT * 1.7 + aSeed.x * 40.0), cos(uT * 1.3 + aSeed.y * 40.0));
          pw.y += uFlutter * 0.08 * sin(uT * 2.3 + aSeed.z * 40.0);
          vec3 rel = mod(pw - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
          float r = length(rel);
          vec3 wp = uCam + rel;
          vec3 pv = (viewMatrix * vec4(wp, 1.0)).xyz;
          float depth = max(-pv.z, 0.05);
          vZ = depth;
          // screen-plane streak axis from the flake's own motion
          vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
          float sp = length(vv.xy);
          vec2 ax = sp > 1e-3 ? vv.xy / sp : vec2(0.0, -1.0);
          vec2 ac = vec2(ax.y, -ax.x);   // handedness chosen so the quad faces the camera (it is back-face culled otherwise)
          // most flakes are small, a few are big (the cube skews the sizes down)
          float world = uFlake * (0.45 + 1.6 * aSeed.w * aSeed.w * aSeed.w);
          float pxW = depth * uPx;                 // metres per pixel at this depth
          float sz = max(world, pxW * 1.6);        // never thinner than about a pixel
          // a streak is thin across (a pixel or two) and long along the motion; a round flake keeps its radius
          float aw = sz * mix(1.0, 0.55, uBlizz);
          float len = sp * uShutter * (0.55 + 0.9 * aSeed.x);
          float L = aw + len * 0.5;
          vec2 q = position.xy;                    // -1..1
          vec3 cv = pv;
          cv.xy += ac * q.x * aw + ax * q.y * L;
          vK = L / aw;                             // half length in radii (1 = round)
          vQ = vec2(q.x, q.y * vK);
          // energy-preserving fade for flakes smaller than a pixel, a soft edge at the box, a soft near clip (fewer big near flakes),
          // and the visibility range; every flake gets its own brightness
          float small = clamp(world / sz, 0.0, 1.0);
          float edge = 1.0 - smoothstep(0.34 * uBox, 0.5 * uBox, r);
          float nearF = smoothstep(0.7, 3.0, depth);
          vA = uAlpha * (0.45 + 0.55 * aSeed.z) * small * edge * nearF * exp(-depth * uExt);
          gl_Position = projectionMatrix * vec4(cv, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDepth;
        uniform mat4 uInvProj;
        uniform vec2 uRes;
        uniform vec3 uColor;
        varying vec2 vQ;
        varying float vK;
        varying float vA;
        varying float vZ;
        void main() {
          // soft round flake: a gaussian blob, stretched along its motion into a streak with a bright core and tapering tails
          float d2 = dot(vec2(vQ.x, max(abs(vQ.y) - (vK - 1.0), 0.0)), vec2(vQ.x, max(abs(vQ.y) - (vK - 1.0), 0.0)));
          float a = exp(-2.0 * d2) * (1.0 - smoothstep(0.0, 1.0, d2));
          float tail = 1.0 - smoothstep(0.05, 1.0, abs(vQ.y) / vK);
          a *= mix(1.0, tail * tail, smoothstep(1.0, 2.0, vK));
          a *= vA;
          if (a < 0.003) discard;
          // hand depth test against the scene (flakes are not in the depth buffer, and the pass runs after the fog)
          vec2 suv = gl_FragCoord.xy / uRes;
          float d = texture2D(tDepth, suv).x;
          vec4 vp = uInvProj * vec4(suv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          float sceneZ = -vp.z / vp.w;
          a *= smoothstep(-0.05, 0.15, sceneZ - vZ);
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
  update(dt: number, camera: THREE.PerspectiveCamera, p: SnowParams): void {
    const fall = clamp(p.fall, 0, 1);
    this.active = fall > 0.01;
    this.blizzard = blizzardAmount(fall, p.windStrength);
    if (!this.active) { this.geo.instanceCount = 0; return; }
    this.clock += dt;
    const u = this.material.uniforms;
    const b = this.blizzard;
    const ws = clamp(p.windStrength, 0, 1);
    // horizontal drift speed (m/s) from the wind, and the fall speed (slower in a blizzard, where the air carries the flakes)
    const vw = 0.3 + 11 * Math.pow(ws, 1.7);
    (u.uWindV.value as THREE.Vector2).set(p.windX * vw, p.windZ * vw);
    u.uFall.value = 1.15 * (1 - 0.45 * b);
    u.uFlutter.value = 1 - 0.8 * smoothstep(0.3, 0.9, ws);
    u.uShutter.value = 0.012 + 0.03 * b;
    // the volume is small near the ground and widens with altitude; a blizzard tightens it (you cannot see far)
    const box = clamp(16 + 0.3 * p.aboveGround, 16, 80) * (1 - 0.2 * b);
    u.uBox.value = box;
    u.uT.value = this.clock;
    (u.uCam.value as THREE.Vector3).copy(camera.position);
    this.pxScale = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) / Math.max(1, (u.uRes.value as THREE.Vector2).y);
    u.uPx.value = this.pxScale;
    u.uFlake.value = 0.013;
    u.uBlizz.value = b;
    // how many flakes of the pool are in play: a steady fall, then a thick one in a blizzard
    const density = fall * (0.7 + 0.3 * b);
    this.geo.instanceCount = Math.round(MAX_FLAKES * clamp(density, 0, 1));
    // the visibility range the flakes themselves fade out over (m)
    u.uExt.value = 0.0015 + 0.02 * b;
    (u.uColor.value as THREE.Color).copy(p.color);
    u.uAlpha.value = 1.0 - 0.1 * b;
  }

  dispose(): void { this.geo.dispose(); this.material.dispose(); }
}

/** Draws the snow over the fogged frame, before bloom. Skipped (no GPU work) when it is not snowing. */
export class SnowPass extends Pass {
  constructor(private snow: Snow, private camera: THREE.PerspectiveCamera, private getDepth: () => THREE.Texture) {
    super();
    this.needsSwap = false;
  }

  override setSize(w: number, h: number): void {
    (this.snow.material.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (!this.snow.active || this.snow.count === 0) return;
    const u = this.snow.material.uniforms;
    u.tDepth.value = this.getDepth();
    (u.uInvProj.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    renderer.render(this.snow.scene, this.camera);
    renderer.autoClear = prevAuto;
  }

  override dispose(): void { /* the Snow object owns the GPU resources */ }
}
