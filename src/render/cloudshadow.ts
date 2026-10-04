// Cloud shadows: a ground-space mask of the sky's cloud layer, rendered into a small texture every few frames and read with one
// texture fetch wherever the sun's direct light is computed (injectTerrainShadow for terrain, trees and animals; the grass
// vertex shader per blade root). The mask is cut from the same fbm as the sky dome (CLOUD_GLSL in common.ts), with the same
// coverage threshold and the same wind drift, projected along the sun direction onto the ground, so the shadows slide across
// the valley in step with the clouds overhead. Weather scales the coverage (through the cloudiness that already thickens the
// sky) and the strength (overcast and night switch it off, see Engine).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CLOUD_GLSL, NOISE_GLSL, SharedUniforms } from './common';

/** Mask resolution over the far-ring square (2048 m): 2 m texels, bilinear. */
const RES = 1024;
/** World metres of ground per unit of the sky's layer coordinate: sets the size of the shadow patches (about 150 to 300 m across). */
const METRES_PER_CP = 60;
/** How fast the shadows travel downwind, m/s: this plus this times the wind strength (0..1). The dome's own drift is far slower than any real wind. */
const SPEED_BASE = 3, SPEED_WIND = 6;
/** Shadow edge width in mask texels (penumbra is about 3x this, bilinear included). */
const PENUMBRA_TEXELS = 1.6;
/** The shadow keeps to the dense core of a cloud: its edge sits this far above the sky's visible-cloud threshold (fbm units). */
const CORE_OFFSET = 0.075;
/** The mask is redrawn every this many frames (the drift is a few metres per second, texels are 2 m). */
const EVERY = 3;

export class CloudShadow {
  readonly rt: THREE.WebGLRenderTarget;
  private mat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private frame = 0;
  private offset = new THREE.Vector2();

  constructor(private shared: SharedUniforms, worldSize: number) {
    this.rt = new THREE.WebGLRenderTarget(RES, RES, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
      format: THREE.RedFormat, type: THREE.UnsignedByteType,
    });
    this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.name = 'cloud.shadow';
    shared.cloudShadow.value = this.rt.texture;
    shared.cloudRect.value.set(-768, -768, 2048);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uRect: shared.cloudRect,
        uCenter: { value: new THREE.Vector2(worldSize / 2, worldSize / 2) },
        uSunDir: shared.sunDir,
        uOffset: { value: new THREE.Vector2() },
        uCloud: shared.cloud,
        uMetres: { value: METRES_PER_CP },
        uPen: { value: PENUMBRA_TEXELS },
        uCore: { value: CORE_OFFSET },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform vec3 uRect;
        uniform vec2 uCenter;
        uniform vec3 uSunDir;
        uniform vec2 uOffset;
        uniform float uCloud;
        uniform float uMetres;
        uniform float uPen;
        uniform float uCore;
        ${NOISE_GLSL}
        ${CLOUD_GLSL}
        void main(){
          vec2 xz = uRect.xy + vUv * uRect.z;
          // the layer coordinate the sun sees through at the middle of the valley (what the dome draws over the sun), plus the
          // ground offset from there: a cloud over the sun in the sky is the one that shades the middle of the valley
          vec2 cp = tgCloudCp(vec3(uSunDir.x, max(uSunDir.y, 0.0), uSunDir.z)) + (xz - uCenter - uOffset) / uMetres;
          float cn = tgFbm2(tgCloudQ(cp, vec2(0.0)));
          float d = (cn - (tgCloudThresh(uCloud, 0.0) + uCore)) / max(fwidth(cn), 1e-4);   // signed distance to the edge in texels
          gl_FragColor = vec4(smoothstep(-uPen, uPen, d), 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  /** Redraw the mask now and then and set the strength. Call once per frame after the atmosphere uniforms are up to date. */
  update(renderer: THREE.WebGLRenderer, dt: number, force = false): void {
    const u = this.shared;
    // the pattern rides the wind: faster in a stronger wind, always the way the grass leans
    const w = u.wind.value;
    const speed = SPEED_BASE + SPEED_WIND * w.z;
    this.offset.x += w.x * speed * dt;
    this.offset.y += w.y * speed * dt;
    // strength: a fair-weather day takes about 55% off the direct sun under a cloud; the sun near the horizon, night and overcast fade it out
    const sunUp = THREE.MathUtils.smoothstep(u.sunDir.value.y, 0.0, 0.1);
    const open = 1 - THREE.MathUtils.smoothstep(u.overcast.value, 0.3, 0.75);
    u.cloudK.value = 0.55 * sunUp * open;
    if (u.cloudK.value < 0.002) { this.frame = 0; return; }
    if (!force && (this.frame++ % EVERY) !== 0) return;
    (this.mat.uniforms.uOffset.value as THREE.Vector2).copy(this.offset);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }

  dispose(): void {
    this.rt.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
