// Post stack: MSAA HDR scene pass (keeps a depth texture) -> GTAO -> aerial-perspective haze (distance + valley
// mist, tinted by the sky so it meets the horizon seamlessly) -> bloom -> color grade -> tone map/sRGB -> AA -> dither.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { SKY_GLSL, SharedUniforms } from './common';
import type { Lighting } from './sky';

export type Quality = 'high' | 'medium';

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/** Renders the scene into a private MSAA half-float target that keeps a depth texture, then copies it on. */
class ScenePass extends Pass {
  rt!: THREE.WebGLRenderTarget;
  samples: number;
  private copy: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, w: number, h: number, samples: number) {
    super();
    this.samples = samples;
    this.needsSwap = true;
    this.copy = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader.replace('gl_FragColor = opacity * texel;', 'gl_FragColor = vec4( min( max( texel.rgb, vec3( 0.0 ) ), vec3( 128.0 ) ), 1.0 );'),
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.copy);
    this.build(w, h);
  }

  get depthTexture(): THREE.DepthTexture { return this.rt.depthTexture!; }

  build(w: number, h: number): void {
    this.rt?.dispose();
    const depth = new THREE.DepthTexture(w, h);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: this.samples, depthTexture: depth, depthBuffer: true,
    });
    this.rt.texture.name = 'scene.hdr';
  }

  setSamples(s: number): void {
    if (s === this.samples) return;
    this.samples = s;
    this.build(this.rt.width, this.rt.height);
  }

  override setSize(w: number, h: number): void { this.build(w, h); }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget): void {
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    this.copy.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.rt.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}

class FogPass extends Pass {
  material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor(shared: SharedUniforms, private camera: THREE.PerspectiveCamera, private scenePass: ScenePass) {
    super();
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uHaze: { value: 0.0007 },
        uMist: { value: 0.0 },
        uMistFalloff: { value: 0.045 },
        uMistBase: { value: 0.0 },
        uFogMax: { value: 0.94 },
        uSunDir: shared.sunDir,
        uSkyZenith: shared.skyZenith,
        uSkyMid: shared.skyMid,
        uSkyHorizon: shared.skyHorizon,
        uSunGlow: shared.sunGlow,
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform mat4 uInvProj;
        uniform vec2 uTexel;
        uniform mat4 uCamWorld;
        uniform vec3 uCamPos;
        uniform float uHaze;
        uniform float uMist;
        uniform float uMistFalloff;
        uniform float uMistBase;
        uniform float uFogMax;
        ${SKY_GLSL}
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float d = texture2D(tDepth, vUv).x;
          // The resolved MSAA depth keeps one sample per pixel. On thin foreground geometry (leaf speckle, blades) a partly covered
          // pixel can carry the depth of the far hill behind it, which fogs the leaf color to a pale smoke. Take the nearest depth of
          // the pixel and its four neighbours so edge pixels are fogged as the foreground object they mostly are.
          float dn = min(min(texture2D(tDepth, vUv + vec2(uTexel.x, 0.0)).x, texture2D(tDepth, vUv - vec2(uTexel.x, 0.0)).x),
                         min(texture2D(tDepth, vUv + vec2(0.0, uTexel.y)).x, texture2D(tDepth, vUv - vec2(0.0, uTexel.y)).x));
          float dNear = min(d, dn);
          if (d >= 0.999999 && dNear >= 0.999999) { gl_FragColor = c; return; }
          if (d >= 0.999999) d = dNear;
          d = dNear;
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vp.xyz /= vp.w;
          vec3 wvec = (uCamWorld * vec4(vp.xyz, 0.0)).xyz;
          float dist = length(wvec);
          vec3 dir = wvec / dist;

          // Near-field haze thins with altitude (a drone looking down through thin air sees a clear valley); a fixed
          // far term still melts the distant rim into the sky so the horizon is seamless at any height.
          float yEnd = uCamPos.y + dir.y * dist;
          float yMid = max(0.5 * (uCamPos.y + yEnd) - uMistBase, 0.0);
          float alt = exp(-yMid / 230.0);
          float sunAlign = max(dot(dir, uSunDir), 0.0);
          float fwd = 1.0 + 1.6 * pow(sunAlign, 6.0) * (1.0 - smoothstep(0.1, 0.5, uSunDir.y));
          float nearOd = (dist * uHaze * alt) * (dist * uHaze * alt) * fwd;
          float dFar = dist / 2800.0;
          float farOd = dFar * dFar * dFar;
          float od = nearOd + farOd;
          float k = uMistFalloff;
          float y0 = uCamPos.y - uMistBase;
          float dy = dir.y;
          float e0 = exp(clamp(-k * y0, -60.0, 60.0));
          float mistOd;
          if (abs(dy * k) > 1e-4) {
            float e1 = exp(clamp(-k * (y0 + dy * dist), -60.0, 60.0));
            mistOd = uMist * (e0 - e1) / (k * dy);
          } else {
            mistOd = uMist * e0 * dist;
          }
          mistOd = min(max(mistOd, 0.0), 0.9);
          float fog = min(1.0 - exp(-(od + mistOd)), uFogMax);

          vec3 fdir = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.5 + 0.015, dir.z));
          vec3 fc = tgSkyBase(fdir);
          float mf = mistOd / (od + mistOd + 1e-5);
          fc = mix(fc, fc * vec3(0.92, 0.97, 1.04) + vec3(0.02, 0.03, 0.04), mf * 0.6);
          gl_FragColor = vec4(mix(c.rgb, fc, fog), c.a);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.scenePass.depthTexture;
    (u.uTexel.value as THREE.Vector2).set(1 / this.scenePass.rt.width, 1 / this.scenePass.rt.height);
    (u.uInvProj.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    (u.uCamWorld.value as THREE.Matrix4).copy(this.camera.matrixWorld);
    (u.uCamPos.value as THREE.Vector3).copy(this.camera.position);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void { this.material.dispose(); this.quad.dispose(); }
}

class GradePass extends Pass {
  material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor() {
    super();
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uShadowTint: { value: new THREE.Color(1, 1, 1) },
        uHighTint: { value: new THREE.Color(1, 1, 1) },
        uSat: { value: 1.1 },
        uContrast: { value: 1.08 },
        uVignette: { value: 0.28 },
        uAspect: { value: 16 / 9 },
        uLift: { value: new THREE.Color(0, 0, 0) },
        uNight: { value: 0 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec3 uShadowTint;
        uniform vec3 uHighTint;
        uniform float uSat;
        uniform float uContrast;
        uniform float uVignette;
        uniform float uAspect;
        uniform vec3 uLift;
        uniform float uNight;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          vec3 col = c.rgb;
          // lift the blacks softly (more where it is darkest) so shadows keep their color
          float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col += uLift * (1.0 - smoothstep(0.0, 0.35, l0) * 0.7);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float sh = 1.0 - smoothstep(0.0, 0.5, l);
          float hi = smoothstep(0.3, 2.2, l);
          col *= mix(vec3(1.0), uShadowTint, sh) * mix(vec3(1.0), uHighTint, hi);
          float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l2), col, uSat);
          // day for night: cool the palette toward blue-teal while keeping luminance and most of the hue, so moonlit grass reads as
          // dark teal-green grass (as in the concept art) and not as silver snow
          vec3 teal = vec3(l2) * vec3(0.7, 1.0, 1.06);
          col = mix(col, teal + (col - vec3(l2)) * 0.26, uNight * 0.85);
          col = pow(max(col / 0.18, vec3(0.0)), vec3(uContrast)) * 0.18;
          vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0) * 0.9;
          float v = smoothstep(0.35, 1.05, length(q));
          col *= 1.0 - uVignette * v * v;
          gl_FragColor = vec4(col, c.a);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void { this.material.dispose(); this.quad.dispose(); }
}

/** Last pass: tiny dither so smooth skies never band in 8-bit output. */
class FinishPass extends Pass {
  material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor() {
    super();
    this.needsSwap = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          c.rgb += (n - 0.5) / 255.0;
          gl_FragColor = c;
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : _writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void { this.material.dispose(); this.quad.dispose(); }
}

export class PostFX {
  readonly composer: EffectComposer;
  readonly scenePass: ScenePass;
  readonly gtao: GTAOPass;
  readonly fog: FogPass;
  readonly bloom: UnrealBloomPass;
  readonly grade: GradePass;
  readonly output: OutputPass;
  readonly fxaa: FXAAPass;
  readonly finish: FinishPass;
  quality: Quality = 'high';
  /** Objects hidden while the AO normal/depth pass renders (sky, water, big instanced grass...). */
  readonly aoExclude: THREE.Object3D[] = [];

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera, shared: SharedUniforms) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const w = Math.max(2, Math.floor(size.x * pr)), h = Math.max(2, Math.floor(size.y * pr));
    renderer.shadowMap.autoUpdate = false; // ScenePass triggers it once per frame, GTAO's G-buffer pass must not
    this.composer = new EffectComposer(renderer);
    this.scenePass = new ScenePass(scene, camera, w, h, 4);
    this.composer.addPass(this.scenePass);

    this.gtao = new GTAOPass(scene, camera, w, h);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.0, scale: 1.4, samples: 12, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    const origRender = this.gtao.render.bind(this.gtao);
    this.gtao.render = (r: THREE.WebGLRenderer, wb: THREE.WebGLRenderTarget, rb: THREE.WebGLRenderTarget, dt?: number, mask?: boolean) => {
      const hidden: THREE.Object3D[] = [];
      for (const o of this.aoExclude) if (o.visible) { o.visible = false; hidden.push(o); }
      origRender(r, wb, rb, dt as number, mask as boolean);
      for (const o of hidden) o.visible = true;
    };
    this.composer.addPass(this.gtao);

    this.fog = new FogPass(shared, camera, this.scenePass);
    this.composer.addPass(this.fog);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.7, 1.15);
    this.composer.addPass(this.bloom);

    this.grade = new GradePass();
    this.composer.addPass(this.grade);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.fxaa = new FXAAPass();
    this.fxaa.enabled = false;
    this.composer.addPass(this.fxaa);

    this.finish = new FinishPass();
    this.composer.addPass(this.finish);

    this.setSize(size.x, size.y);
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const high = q === 'high';
    this.gtao.enabled = high;
    this.scenePass.setSamples(high ? 4 : 0);
    this.fxaa.enabled = !high;
    this.bloom.strength = high ? 0.3 : 0.25;
  }

  /** Size in CSS pixels; the renderer's pixel ratio is applied by the composer. */
  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.material.uniforms.uAspect.value = w / Math.max(1, h);
  }

  /** Push per-frame lighting state into the passes. */
  apply(L: Lighting): void {
    const f = this.fog.material.uniforms;
    f.uHaze.value = L.hazeDensity;
    f.uMist.value = L.mistDensity;
    const g = this.grade.material.uniforms;
    (g.uShadowTint.value as THREE.Color).copy(L.gradeShadow);
    (g.uHighTint.value as THREE.Color).copy(L.gradeHighlight);
    g.uSat.value = L.gradeSat;
    g.uContrast.value = L.gradeContrast;
    g.uVignette.value = L.vignette;
    (g.uLift.value as THREE.Color).copy(L.gradeLift);
    g.uNight.value = L.gradeNight;
    this.bloom.strength = (this.quality === 'high' ? 1 : 0.85) * L.bloom;
  }

  setMistBase(y: number): void { this.fog.material.uniforms.uMistBase.value = y; }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.scenePass.dispose();
    this.fog.dispose();
    this.grade.dispose();
    this.finish.dispose();
    this.gtao.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}
