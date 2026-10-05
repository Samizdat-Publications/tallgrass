// Contact shadows: one soft dark ellipse under every ground animal, so a body standing in the grass reads as sitting in it rather
// than hovering over it (R1 follow-up from the round 14 video critique: "wolves running across the plains appear to hover above the
// grass").
//
// Why the animals floated: the sun's shadow map is far too coarse to give a 1.5 m animal a shadow of its own, the grass is a dense
// carpet that hides the ground an animal stands on, and nothing darkened the grass round the feet. The blob therefore lies at about
// knee height (where the canopy is, a shadow thrown on the grass tops rather than on soil below them), is oriented to the terrain
// like the body and fades with distance. It is a plain alpha blend in one instanced draw (a quad per animal), no extra pass.
import * as THREE from 'three';
import type { AnimalShared } from './shader';

const CAP = 4096;
/** Beyond this camera distance (m) the blob is gone entirely (it fades in from FADE_NEAR). */
const FADE_NEAR = 60;
const FADE_FAR = 150;

export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private geo: THREE.BufferGeometry;
  private alpha: THREE.InstancedBufferAttribute;
  private n = 0;
  private uCam: { value: THREE.Vector3 };
  private uLow: { value: number };
  private uNightK: { value: number };
  /** Feature gate for A/B timing and tuning from the console (1 = on). */
  readonly uOn = { value: 1 };

  constructor(shared: AnimalShared) {
    this.uCam = shared.uCamPos;
    this.uLow = shared.uLow;
    this.uNightK = shared.uNightK ?? { value: 1 };
    const quad = new THREE.PlaneGeometry(2, 2);
    quad.rotateX(-Math.PI / 2); // lies in xz, normal +y; unit radius
    this.geo = quad;
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aA', this.alpha);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      uniforms: { uCam: this.uCam, uLow: this.uLow, uNightK: this.uNightK, uOn: this.uOn },
      vertexShader: /* glsl */ `
        attribute float aA;
        uniform vec3 uCam; uniform float uOn;
        varying vec2 vUv; varying float vA;
        void main() {
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          float d = distance(uCam, vec3(instanceMatrix[3]));
          vA = aA * uOn * (1.0 - smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, d));
          vUv = position.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uLow; uniform float uNightK;
        varying vec2 vUv; varying float vA;
        void main() {
          float r = length(vUv);
          // a dense core with a long soft skirt
          float a = pow(1.0 - smoothstep(0.0, 1.0, r), 1.5) * vA;
          if (a < 0.004) discard;
          // darker on a bright day, a little lighter (so it never reads as a hole) in the dark
          vec3 col = vec3(0.012, 0.016, 0.01) + vec3(0.01, 0.014, 0.022) * uLow;
          gl_FragColor = vec4(col, a * (1.0 - 0.35 * uLow));
        }`,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, mat, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 5;
    this.mesh.count = 0;
    this.mesh.name = 'contact-shadows';
    let held = 0;
    // the ambient-occlusion G-buffer pass renders the scene with an override material: keep the blobs out of it
    this.mesh.onBeforeRender = (_r, scene) => {
      if (scene.overrideMaterial) { held = this.mesh.count; this.mesh.count = 0; }
    };
    this.mesh.onAfterRender = () => { if (held) { this.mesh.count = held; held = 0; } };
  }

  /** Start a frame: drop last frame's blobs. */
  begin(): void {
    this.n = 0;
  }

  /**
   * One blob. (x, y, z) is the point on the ground under the animal and `lift` how far above it the blob lies (m); `ch`, `sh` the
   * heading as cos and sin, pitch and roll the terrain tilt of the body; `ra` and `rb` the half length along and across the body (m).
   */
  add(x: number, y: number, z: number, ch: number, sh: number, pitch: number, roll: number, lift: number, ra: number, rb: number, alpha: number): void {
    if (this.n >= CAP) return;
    const k = this.n++;
    const te = this.mesh.instanceMatrix.array as Float32Array;
    const o = k * 16;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const cphi = ch, sphi = -sh;
    // rows of R as in AnimalLayer.writeInstance
    const m00 = cphi * cp, m01 = -cphi * sp * cr + sphi * sr, m02 = cphi * sp * sr + sphi * cr;
    const m10 = sp, m11 = cp * cr, m12 = -cp * sr;
    const m20 = -sphi * cp, m21 = sphi * sp * cr + cphi * sr, m22 = -sphi * sp * sr + cphi * cr;
    te[o] = m00 * ra; te[o + 1] = m10 * ra; te[o + 2] = m20 * ra; te[o + 3] = 0;
    te[o + 4] = m01; te[o + 5] = m11; te[o + 6] = m21; te[o + 7] = 0;
    te[o + 8] = m02 * rb; te[o + 9] = m12 * rb; te[o + 10] = m22 * rb; te[o + 11] = 0;
    te[o + 12] = x + m01 * lift; te[o + 13] = y + m11 * lift; te[o + 14] = z + m21 * lift; te[o + 15] = 1;
    (this.alpha.array as Float32Array)[k] = alpha;
  }

  /** Upload this frame's blobs. */
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
