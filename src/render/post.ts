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
import { NOISE_GLSL, SKY_GLSL, SharedUniforms, clamp, smoothstep } from './common';
import type { Lighting } from './sky';
import type { EnvState } from '../sim/types';
import { Snow, SnowPass, blizzardAmount } from './snow';
import { STORM_SKY_GLSL, type StormUniforms } from './storms';

export type Quality = 'high' | 'medium';

/** God ray gain (additive HDR, scaled by the haze terms), and the dawn pool's extinction per metre at the valley floor. */
const GODRAY_GAIN = 2.4;
const DAWN_DENSITY = 0.07;
const _snowCol = new THREE.Color();

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

  constructor(shared: SharedUniforms, private camera: THREE.PerspectiveCamera, private scenePass: ScenePass, storm: StormUniforms) {
    super();
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uStormOn: storm.on,
        uStormShade: storm.shade,
        uStormSkyA: storm.skyA,
        uStormSkyB: storm.skyB,
        uInvProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uHaze: { value: 0.0007 },
        uMist: { value: 0.0 },
        uMistFalloff: { value: 0.045 },
        uMistBase: { value: 0.0 },
        uFogMax: { value: 0.94 },
        // aerial perspective (R2.2): extinction per metre, in-scatter strength, sun tint, horizon glow, and the dust / summer / night weights
        uAerial: { value: 0.0005 },
        uAerialLum: { value: 1.0 },
        uSunTint: { value: new THREE.Color(1, 0.8, 0.55) },
        uHorGlow: { value: 0.0 },
        uDust: { value: 0.0 },
        uAerialWarm: { value: 0.0 },
        uAerialNight: { value: 0.0 },
        // dawn pool (R2.8): mist density (extinction per metre at the valley floor), height falloff, and the clock and wind that drift it
        uDawn: { value: 0.0 },
        uDawnFall: { value: 0.0 },
        tPool: { value: null },
        uPoolRect: { value: new THREE.Vector4(0, 0, 512, 1 / 512) },
        uPoolTop: { value: -1000.0 },
        uTime: shared.time,
        uWind: shared.wind,
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
        uniform float uAerial;
        uniform float uAerialLum;
        uniform vec3 uSunTint;
        uniform float uHorGlow;
        uniform float uDust;
        uniform float uAerialWarm;
        uniform float uAerialNight;
        uniform float uDawn;
        uniform float uDawnFall;
        uniform sampler2D tPool;
        uniform vec4 uPoolRect;
        uniform float uPoolTop;
        uniform float uTime;
        uniform vec3 uWind;
        uniform float uStormOn;
        uniform vec4 uStormShade[4];
        ${SKY_GLSL}
        ${STORM_SKY_GLSL}
        ${NOISE_GLSL}
        // Henyey-Greenstein phase, divided by its forward peak so the value is 1 straight at the sun and falls off with angle
        float tgHGn(float cosT, float g) {
          float g2 = g * g;
          float peak = (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g, 1e-4), 1.5);
          return ((1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosT, 1.5)) / peak;
        }
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
          float dFar = dist / 3500.0;
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
          // Dawn pool: after a clear, calm night mist lies in the low ground. The pool surface is read from a coarse map of the valley
          // floor (tPool: the local lowest ground a few metres up, built once from the terrain), so it fills creek valleys and swales
          // and leaves hilltops and upper slopes clear above a soft top surface. The ray is marched a few steps through the part of it
          // below the highest pool top; rays that stay above that (sky, hills, a high camera looking out) skip it entirely.
          float dawnOd = 0.0;
          if (uDawn > 0.002) {
            float yc = uCamPos.y;
            float tIn = 0.0, tOut = dist;
            if (yc > uPoolTop) { if (dy >= -1e-4) tOut = 0.0; else tIn = (yc - uPoolTop) / (-dy); }
            else if (dy > 1e-4) tOut = min(tOut, (uPoolTop - yc) / dy);
            tOut = min(tOut, tIn + 700.0);
            if (tOut > tIn + 0.01) {
              float len = tOut - tIn;
              float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
              vec2 drift = uWind.xy * (0.6 + 1.8 * uWind.z) * uTime * 0.35;
              float acc = 0.0;
              for (int i = 0; i < 12; i++) {
                float s0 = (float(i) + 0.25 + 0.5 * jit) / 12.0;
                float t = tIn + len * pow(s0, 1.5);
                float wgt = len * 1.5 * sqrt(s0) / 12.0;
                vec3 p = uCamPos + dir * t;
                vec2 puv = (p.xz - uPoolRect.xy) * uPoolRect.w;
                float top = texture2D(tPool, puv).r - uDawnFall;
                float inside = min(min(puv.x, puv.y), min(1.0 - puv.x, 1.0 - puv.y));
                float occ = (1.0 - smoothstep(top - 2.2, top + 0.8, p.y)) * smoothstep(-0.05, 0.0, inside);
                // banks: slow drifting patches, and a little thicker toward the floor
                float bank = tgNoise2(p.xz * 0.02 - drift * 0.05);
                float body = 0.45 + 1.1 * smoothstep(0.2, 0.8, bank);
                body *= 0.65 + 0.35 * clamp((top - p.y) / 3.0, 0.0, 1.0);
                acc += occ * body * wgt;
              }
              dawnOd = min(uDawn * acc, 2.2);
            }
          }
          // Aerial perspective: Beer-Lambert extinction over the whole view ray (thinning with altitude like the near term), so the
          // mid and far hills visibly lose contrast and take on the colour of the light scattered into the ray.
          float aerOd = max(dist - 90.0, 0.0) * uAerial * alt * (1.0 + 0.9 * uDust);
          float cosS = dot(dir, uSunDir);
          float aerFog = 1.0 - exp(-aerOd);
          float fog0 = min(1.0 - exp(-(od + mistOd + dawnOd)), uFogMax);
          float fog = min(1.0 - (1.0 - fog0) * (1.0 - aerFog), uFogMax);

          vec3 fdir = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.5 + 0.015, dir.z));
          vec3 fc = tgSkyBase(fdir);
          if (uStormOn > 0.5) fc = tgStormTint(fc, tgStormGloom(dir));   // the haze toward a storm cell is as dark as the sky behind it
          float mf = mistOd / (od + mistOd + dawnOd + 1e-5);
          fc = mix(fc, fc * vec3(0.92, 0.97, 1.04) + vec3(0.02, 0.03, 0.04), mf * 0.6);
          // dawn mist is lit by the low sun: pale and soft, warm toward the light
          float dShare = dawnOd / (od + mistOd + dawnOd + 1e-5);
          // (desaturated toward the sky's own brightness, so it reads pale warm white, then lit gold on the sun's side)
          vec3 mc = mix(fc, vec3(dot(fc, vec3(0.3333))), 0.62) * 1.08 + vec3(0.02, 0.022, 0.028);
          mc += uSunTint * (0.04 + 0.24 * tgHGn(cosS, 0.6)) * smoothstep(-0.05, 0.12, uSunDir.y) * (1.0 - uAerialNight);
          fc = mix(fc, mc, dShare * 0.92);
          // forward-scattering lobe toward the sun (HG g 0.75) plus a broad warm floor, tinted by the sun colour, applied in
          // proportion to how much of the fog is aerial haze. Dust (drought) swaps the cool-away-from-sun side for a tan.
          float aerShare = aerFog / (aerFog + fog0 + 1e-4);
          float lobe = 0.8 * tgHGn(cosS, 0.75) + 0.2 * tgHGn(cosS, 0.3);
          float sunUp = smoothstep(-0.05, 0.12, uSunDir.y);
          float inScat = (0.16 + lobe) * uAerialLum * sunUp * (1.0 - uAerialNight);
          fc += uSunTint * inScat * aerShare * (1.0 - fog0 * 0.5);
          // golden light turns the haze itself gold (saturated, not grey): push the fog colour toward amber in proportion to the aerial share
          fc = mix(fc, fc * vec3(1.22, 1.0, 0.68) + uSunTint * 0.02, uAerialWarm * aerShare * (0.4 + 0.6 * lobe));
          fc = mix(fc, fc * vec3(1.18, 0.98, 0.7) + uSunTint * 0.04, uDust * aerShare * 0.6);
          // horizon glow: the far terrain that meets the sky catches a warm band, strongest on the sun's side
          float horBand = exp(-abs(dir.y) * 26.0) * smoothstep(500.0, 3000.0, dist);
          vec2 shd = normalize(uSunDir.xz + vec2(1e-4)), dhd = normalize(dir.xz + vec2(1e-4));
          float az = 0.5 + 0.5 * dot(shd, dhd);
          fc += uSunTint * uHorGlow * horBand * (0.25 + 0.75 * pow(az, 4.0)) * sunUp * (1.0 - uAerialNight);
          // storm cells shade the ground under them (R4): a soft disc that darkens the surface, not the haze in front of it
          vec3 base = c.rgb;
          if (uStormOn > 0.5) {
            vec2 gp = uCamPos.xz + wvec.xz;
            float sh = 0.0;
            for (int i = 0; i < 4; i++) {
              vec4 s = uStormShade[i];
              if (s.w <= 0.001) break;
              sh = max(sh, s.w * (1.0 - smoothstep(0.4 * s.z, s.z, length(gp - s.xy))));
            }
            base *= vec3(1.0 - sh, 1.0 - sh * 0.94, 1.0 - sh * 0.86);
          }
          gl_FragColor = vec4(mix(base, fc, fog), c.a);
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

/**
 * God rays (R2.6): crepuscular light shafts when the sun is within 45 degrees of the view centre. Half resolution, three small
 * passes: an occlusion mask from the scene depth (sky = 1, weighted toward the sun), a 64-tap radial blur toward the sun's screen
 * position (jittered per pixel), and an additive composite straight into the frame before bloom. Costs nothing when the sun is
 * out of view, below the horizon, or the strength is zero (render returns before touching the GPU).
 */
class GodRayPass extends Pass {
  /** 0..1 overall strength from haze, dust, sun height and cloud (set by PostFX.apply). */
  strength = 0;
  private maskRT: THREE.WebGLRenderTarget;
  private rayRT: THREE.WebGLRenderTarget;
  private maskMat: THREE.ShaderMaterial;
  private rayMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private maskQuad: FullScreenQuad;
  private rayQuad: FullScreenQuad;
  private compQuad: FullScreenQuad;
  private sunClip = new THREE.Vector4();
  private fwd = new THREE.Vector3();

  constructor(private shared: SharedUniforms, private camera: THREE.PerspectiveCamera, private scenePass: ScenePass, w: number, h: number,
              private tint: THREE.Color) {
    super();
    this.needsSwap = false;
    // the mask is the thing the 64-tap loop reads, so it is as narrow as it can be (two 8-bit channels); the result is one half float
    const mk = (format: THREE.PixelFormat, type: THREE.TextureDataType) => new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), {
      format, type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.maskRT = mk(THREE.RGFormat, THREE.UnsignedByteType);
    this.rayRT = mk(THREE.RedFormat, THREE.HalfFloatType);
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uSunDir: shared.sunDir,
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform mat4 uInvProj;
        uniform mat4 uCamWorld;
        uniform vec3 uSunDir;
        float sky(vec2 uv) { return step(0.999999, texture2D(tDepth, uv).x); }
        void main() {
          vec2 o = uTexel * 0.5;
          float s = 0.25 * (sky(vUv + vec2(-o.x, -o.y)) + sky(vUv + vec2(o.x, -o.y)) + sky(vUv + vec2(-o.x, o.y)) + sky(vUv + vec2(o.x, o.y)));
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 dir = normalize((uCamWorld * vec4(normalize(vp.xyz / vp.w), 0.0)).xyz);
          float c = max(dot(dir, uSunDir), 0.0);
          // sky near the sun carries the light: weight the source toward it so the shafts fan out from the disc
          float w = 0.025 + pow(c, 9.0);
          gl_FragColor = vec4(s * w, s, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.rayMat = new THREE.ShaderMaterial({
      uniforms: { tMask: { value: null }, uSunUv: { value: new THREE.Vector2(0.5, 0.5) } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tMask;
        uniform vec2 uSunUv;
        void main() {
          vec2 d = uSunUv - vUv;
          vec2 stp = d * (0.8 / 64.0);
          float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          vec2 p = vUv + stp * jit;
          float acc = 0.0, wgt = 1.0, sw = 0.0;
          for (int i = 0; i < 64; i++) {
            acc += texture2D(tMask, p).r * wgt;
            sw += wgt;
            wgt *= 0.972;
            p += stp;
          }
          // light seen through the air falls off with the angle from the sun; a pixel that is itself open sky gets much less
          // (the sky is already bright), so the shafts read mostly over the land, the trees and the haze
          float own = texture2D(tMask, vUv).g;
          gl_FragColor = vec4(acc / sw * (1.0 - 0.8 * own), 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tRay: { value: null }, uColor: { value: new THREE.Color() } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tRay;
        uniform vec3 uColor;
        void main() { gl_FragColor = vec4(uColor * texture2D(tRay, vUv).r, 0.0); }`,
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.maskQuad = new FullScreenQuad(this.maskMat);
    this.rayQuad = new FullScreenQuad(this.rayMat);
    this.compQuad = new FullScreenQuad(this.compMat);
  }

  override setSize(w: number, h: number): void {
    this.maskRT.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    this.rayRT.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
  }

  override render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (this.strength < 0.01) return;
    const sd = this.shared.sunDir.value;
    if (sd.y < -0.02) return;
    // only when the sun is within 45 degrees of the view centre (fading in from 45 to 32)
    this.camera.getWorldDirection(this.fwd);
    const cosA = this.fwd.dot(sd);
    const view = smoothstep(Math.cos(Math.PI * 0.25), Math.cos(Math.PI * 0.18), cosA);
    if (view < 0.005) return;
    // sun screen position (a direction, so w = 0: it works at any distance and off screen)
    this.sunClip.set(sd.x, sd.y, sd.z, 0).applyMatrix4(this.camera.matrixWorldInverse).applyMatrix4(this.camera.projectionMatrix);
    if (this.sunClip.w <= 1e-4) return;
    const su = (this.sunClip.x / this.sunClip.w) * 0.5 + 0.5, sv = (this.sunClip.y / this.sunClip.w) * 0.5 + 0.5;

    const sc = this.scenePass;
    const m = this.maskMat.uniforms;
    m.tDepth.value = sc.depthTexture;
    (m.uTexel.value as THREE.Vector2).set(1 / sc.rt.width, 1 / sc.rt.height);
    (m.uInvProj.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
    (m.uCamWorld.value as THREE.Matrix4).copy(this.camera.matrixWorld);
    renderer.setRenderTarget(this.maskRT);
    this.maskQuad.render(renderer);

    const r = this.rayMat.uniforms;
    r.tMask.value = this.maskRT.texture;
    (r.uSunUv.value as THREE.Vector2).set(su, sv);
    renderer.setRenderTarget(this.rayRT);
    this.rayQuad.render(renderer);

    const c = this.compMat.uniforms;
    c.tRay.value = this.rayRT.texture;
    (c.uColor.value as THREE.Color).copy(this.tint).multiplyScalar(this.strength * view);
    // additive, in place: the quad must not clear the frame it is adding onto
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    this.compQuad.render(renderer);
    renderer.autoClear = prevAuto;
  }

  override dispose(): void {
    this.maskRT.dispose(); this.rayRT.dispose();
    this.maskMat.dispose(); this.rayMat.dispose(); this.compMat.dispose();
    this.maskQuad.dispose(); this.rayQuad.dispose(); this.compQuad.dispose();
  }
}

class GradePass extends Pass {
  material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor(storm: StormUniforms) {
    super();
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uFlash: storm.flash,
        uShadowTint: { value: new THREE.Color(1, 1, 1) },
        uHighTint: { value: new THREE.Color(1, 1, 1) },
        uSat: { value: 1.1 },
        uContrast: { value: 1.08 },
        uVignette: { value: 0.28 },
        uAspect: { value: 16 / 9 },
        uLift: { value: new THREE.Color(0, 0, 0) },
        uNight: { value: 0 },
        uRain: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uRain;
        uniform float uFlash;
        uniform float uTime;
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
          // lightning flash (R4): a few frames of exposure and cool light
          col = col * (1.0 + 0.9 * uFlash) + vec3(0.07, 0.085, 0.14) * uFlash;
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
          vec3 teal = vec3(l2) * vec3(0.86, 0.98, 1.08);
          col = mix(col, teal + (col - vec3(l2)) * 0.4, uNight * 0.85);
          // rain: three layers of slanted streaks (near, middle, far), brighter against the dark ground than the bright sky
          #ifdef TG_RAIN
          {
            float rs = 0.0;
            for (int k = 0; k < 3; k++) {
              float fk = float(k);
              float sc = 60.0 + 46.0 * fk;
              vec2 p = vec2((vUv.x * uAspect + vUv.y * (0.22 + 0.05 * fk)) * sc, vUv.y * sc * 0.07 + uTime * (3.3 + 1.7 * fk) * sc * 0.07);
              vec2 id = floor(p);
              vec2 fr = fract(p);
              float h = fract(sin(dot(id + fk * 31.7, vec2(12.9898, 78.233))) * 43758.5453);
              float h2 = fract(h * 7.31 + fk * 0.37);
              float on = step(1.0 - (0.3 + 0.16 * fk) * uRain, h);
              float line = smoothstep(0.14, 0.0, abs(fr.x - 0.15 - 0.7 * h2)) * smoothstep(0.0, 0.25, fr.y) * smoothstep(1.0, 0.45, fr.y);
              rs += on * line * (1.0 - 0.28 * fk);
            }
            float lr = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = mix(col, col * 0.8 + vec3(0.62, 0.7, 0.8) * (0.05 + 0.5 * lr), clamp(rs, 0.0, 1.0) * 0.6 * min(uRain * 1.2, 1.0));
          }
          #endif
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
  readonly godrays: GodRayPass;
  readonly snow = new Snow();
  readonly snowPass: SnowPass;
  readonly bloom: UnrealBloomPass;
  readonly grade: GradePass;
  readonly output: OutputPass;
  readonly fxaa: FXAAPass;
  readonly finish: FinishPass;
  quality: Quality = 'high';
  /** Objects hidden while the AO normal/depth pass renders (sky, water, big instanced grass...). */
  readonly aoExclude: THREE.Object3D[] = [];

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private shared: SharedUniforms, storm: StormUniforms) {
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

    this.fog = new FogPass(shared, camera, this.scenePass, storm);
    this.composer.addPass(this.fog);

    // god rays and falling snow go over the fogged frame and before bloom (so the shafts and the bright flakes glow)
    this.godrays = new GodRayPass(shared, camera, this.scenePass, w, h, this.fog.material.uniforms.uSunTint.value as THREE.Color);
    this.composer.addPass(this.godrays);
    this.snowPass = new SnowPass(this.snow, camera, () => this.scenePass.depthTexture);
    this.composer.addPass(this.snowPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.7, 1.15);
    this.composer.addPass(this.bloom);

    this.grade = new GradePass(storm);
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
    // blizzard: heavier fog (visibility down to about a hundred metres) and a higher fog ceiling
    // (a ground-level whiteout: it thins with the camera's height, so the drone view still sees the valley through it)
    const bz = this.blizzard * (0.22 + 0.78 * Math.exp(-this.camAbove / 55));
    f.uHaze.value = L.hazeDensity + (Math.max(L.hazeDensity, 0.0065) - L.hazeDensity) * bz;
    f.uFogMax.value = 0.94 + 0.035 * bz;
    f.uMist.value = L.mistDensity;
    // dawn pool: density at the valley floor, and a falloff that tightens toward the ground as it burns off
    f.uDawn.value = this.dawnNow * DAWN_DENSITY;
    f.uDawnFall.value = 3.2 * (1 - this.dawnEnv);   // the pool surface sinks as it burns off
    this.applyAerial(f);
    const g = this.grade.material.uniforms;
    (g.uShadowTint.value as THREE.Color).copy(L.gradeShadow);
    (g.uHighTint.value as THREE.Color).copy(L.gradeHighlight);
    g.uSat.value = L.gradeSat;
    g.uContrast.value = L.gradeContrast;
    g.uVignette.value = L.vignette;
    (g.uLift.value as THREE.Color).copy(L.gradeLift);
    g.uNight.value = L.gradeNight;
    g.uRain.value = L.rain;
    // the streak layer is compiled in only while it is raining (a shader branch on a uniform still costs the full-screen pass)
    const defs = this.grade.material.defines as Record<string, string>;
    const hasRain = 'TG_RAIN' in defs;
    const wantRain = hasRain ? L.rain > 0.01 : L.rain > 0.02;
    if (wantRain !== hasRain) {
      if (wantRain) defs.TG_RAIN = '1'; else delete defs.TG_RAIN;
      this.grade.material.needsUpdate = true;
    }
    g.uTime.value = this.shared.time.value;
    this.bloom.strength = (this.quality === 'high' ? 1 : 0.85) * L.bloom * this.hazeBloom;
  }

  /**
   * Drought dust 0..1 for the aerial haze. The renderer's shared uniforms do not carry the weather, so the engine pushes the
   * eased value here (it stays 0 until something calls this).
   */
  dust = 0;
  /** Blizzard amount 0..1 (snowing with wind past 0.6), set by updateSnow. Thickens the fog. */
  blizzard = 0;
  private camAbove = 0;
  /** Dawn pool amount (envelope of the clock x calm clear night x not raining) and the bare clock envelope. */
  private dawnNow = 0;
  private dawnEnv = 0;
  // the previous night, tracked from the env: sim-time-weighted wind and the share of it that was wet
  private nightWind = 0;
  private nightWet = 0;
  private nightW = 0;
  private wasNight = false;
  private nightSeeded = false;
  private nightCalm = 1;
  private rainNow = 0;

  /**
   * Track whether the night just past was clear and calm (no rain or snow, mean wind under 0.35), and set the dawn mist amount from
   * the clock: it pools from dayFrac 0.2 and has burned off by 0.35. Renderer-side only, from the env the engine already has.
   * `simTicks` is the sim time since the last frame (a huge value means the clock jumped, which re-seeds from the present env).
   */
  trackNight(env: EnvState, simTicks: number, rainVisible: number): void {
    const df = env.dayFrac;
    const night = df >= 0.78 || df < 0.2;
    const wet = env.weather === 1 || env.weather === 3 || env.weather === 4 || env.rain > 0.05 ? 1 : 0;
    if (simTicks >= 1e5 || !this.nightSeeded) {
      // no continuity (first frame, or the calendar was set directly): the night is whatever the env says right now
      this.nightWind = env.windStrength * 0.5; this.nightWet = wet * 0.5; this.nightW = 0.5;
      this.nightSeeded = true;
      this.wasNight = night;
    } else if (night) {
      if (!this.wasNight) { this.nightWind = 0; this.nightWet = 0; this.nightW = 0; }
      const w = Math.min(simTicks, 200) + 1e-3;
      this.nightWind += env.windStrength * w; this.nightWet += wet * w; this.nightW += w;
      this.wasNight = true;
    } else {
      this.wasNight = false;
    }
    if (this.nightW > 0) {
      const mean = this.nightWind / this.nightW, wetFrac = this.nightWet / this.nightW;
      this.nightCalm = (1 - smoothstep(0.25, 0.35, mean)) * (1 - smoothstep(0.04, 0.2, wetFrac));
    }
    this.dawnEnv = smoothstep(0.17, 0.215, df) * (1 - smoothstep(0.22, 0.35, df));
    this.rainNow = rainVisible;
    this.dawnNow = this.dawnEnv * this.nightCalm * (1 - clamp(env.rain * 2 + rainVisible, 0, 1));
  }

  /** Falling snow: `fall` is the eased snowfall 0..1 (0 = off, the pass is skipped), `aboveGround` the camera height in metres. */
  updateSnow(dt: number, fall: number, env: EnvState, aboveGround: number, L: Lighting): void {
    const ws = clamp(env.windStrength, 0, 1);
    this.blizzard = blizzardAmount(fall, ws);
    this.camAbove = aboveGround;
    if (fall <= 0.01) { this.snow.update(dt, this.camera, { fall: 0, windStrength: ws, windX: 1, windZ: 0, aboveGround, color: _snowCol }); return; }
    const lc = this.shared.lightColor.value;
    // a flake is lit like the snowpack: albedo/pi times the ambient plus the key light at a half-lit angle
    _snowCol.setRGB(
      L.hemiSky.r * L.hemiIntensity + lc.r * 0.45, L.hemiSky.g * L.hemiIntensity + lc.g * 0.45, L.hemiSky.b * L.hemiIntensity + lc.b * 0.45,
    ).multiplyScalar(0.92 / Math.PI * 1.7);
    this.snow.update(dt, this.camera, { fall, windStrength: ws, windX: Math.cos(env.windDir), windZ: Math.sin(env.windDir), aboveGround, color: _snowCol });
  }

  /** Bloom multiplier from the aerial pass (a little extra glow at low sun, 1 otherwise). */
  private hazeBloom = 1;

  /** Aerial perspective weights from the shared sky state: strongest in summer, in dust and at golden hour, weak at night and under overcast. */
  private applyAerial(f: FogPass['material']['uniforms']): void {
    const sh = this.shared;
    const season = ((sh.season.value % 4) + 4) % 4;
    // summer bell (peaks about 1.3, still 0.78 at 1.8, 0.05 in deep winter)
    const sd = (season - 1.3) / 1.0;
    const summer = Math.exp(-sd * sd);
    const over = sh.overcast.value;
    const night = sh.night.value;
    const el = Math.max(sh.sunDir.value.y, 0);
    // thicker when the sun is low (long path through the haze), thinner at high noon so midday stays crisp
    const low = 1 - smoothstep(0.1, 0.65, el);
    const dust = this.dust;
    // deep winter: thinner, cleaner air
    const winter = smoothstep(2.4, 3.1, season) * (1 - smoothstep(3.55, 3.95, season));
    const clean = 1 - 0.4 * winter;
    f.uAerial.value = 0.00014 * (0.55 + 0.7 * summer + 0.35 * low) * (1 + 0.5 * over) * clean;
    f.uAerialLum.value = (0.8 + 0.6 * summer + 0.5 * dust) * (1 - 0.85 * over) * (0.7 + 0.5 * low) * clean;
    f.uHorGlow.value = (0.35 + 0.35 * summer + 0.3 * dust) * (0.4 + 0.6 * low) * (1 - 0.8 * over);
    f.uDust.value = dust;
    f.uAerialWarm.value = (0.35 + 0.65 * low) * (1 - over) * (1 - 0.5 * winter);
    this.hazeBloom = 1 + 0.3 * low * (1 - over) * (1 - night);
    f.uAerialNight.value = Math.min(1, night * 1.15);
    // god rays: need a sun above the horizon and no cloud; stronger in haze and dust and with the sun low, off at night
    const haze = clamp(f.uAerial.value / 0.00022, 0, 1.6);
    const sunUp = smoothstep(0.0, 0.1, sh.sunDir.value.y);
    this.godrays.strength = GODRAY_GAIN * sunUp * Math.pow(1 - over, 2.5) * (0.3 + 0.55 * haze) * (1 + 0.9 * dust) * (0.55 + 0.45 * low) * (1 - night);
    // tint: the key-light colour normalised to unit peak, nudged warm
    const lc = sh.lightColor.value;
    const m = Math.max(lc.r, lc.g, lc.b, 1e-3);
    (f.uSunTint.value as THREE.Color).setRGB(lc.r / m, lc.g / m * 0.97, lc.b / m * 0.9);
  }

  /**
   * Build the dawn pool map once: for a 64 x 64 grid over the valley, the local lowest ground within about 50 m (the floor the mist
   * settles on), smoothed, plus the pool depth. A pool top that follows the valley floor leaves hills and upper slopes above it.
   */
  setPoolMap(worldSize: number, heightAt: (x: number, z: number) => number, depth = 4.5): void {
    const G = 64, cell = worldSize / G;
    const h = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) h[j * G + i] = heightAt((i + 0.5) * cell, (j + 0.5) * cell);
    const R = 6;
    const m = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      let lo = 1e9;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        if (di * di + dj * dj > R * R) continue;
        const x = Math.min(G - 1, Math.max(0, i + di)), y = Math.min(G - 1, Math.max(0, j + dj));
        lo = Math.min(lo, h[y * G + x]);
      }
      m[j * G + i] = lo;
    }
    // smooth the floor so the pool top is a gentle surface, not a stepped one
    let src = m;
    for (let pass = 0; pass < 3; pass++) {
      const dst = new Float32Array(G * G);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        let sum = 0, n = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const x = Math.min(G - 1, Math.max(0, i + di)), y = Math.min(G - 1, Math.max(0, j + dj));
          sum += src[y * G + x]; n++;
        }
        dst[j * G + i] = sum / n;
      }
      src = dst;
    }
    const data = new Uint16Array(G * G);
    let top = -1e9;
    for (let k = 0; k < G * G; k++) { const t = src[k] + depth; top = Math.max(top, t); data[k] = THREE.DataUtils.toHalfFloat(t); }
    const tex = new THREE.DataTexture(data, G, G, THREE.RedFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const u = this.fog.material.uniforms;
    u.tPool.value = tex;
    (u.uPoolRect.value as THREE.Vector4).set(0, 0, worldSize, 1 / worldSize);
    u.uPoolTop.value = top + 0.8;
  }

  setMistBase(y: number): void { this.fog.material.uniforms.uMistBase.value = y; }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.scenePass.dispose();
    this.fog.dispose();
    this.godrays.dispose();
    this.snow.dispose();
    this.grade.dispose();
    this.finish.dispose();
    this.gtao.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}
