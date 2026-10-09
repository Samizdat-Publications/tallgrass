// Post stack: MSAA HDR scene pass (keeps a depth texture) -> GTAO -> aerial-perspective haze (distance + valley
// mist, tinted by the sky so it meets the horizon seamlessly) -> depth of field (optional) -> bloom -> color grade -> tone
// map/sRGB -> AA -> dither (+ optional film grain and colour fringe).
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
import { Rain, RainPass } from './rain';
import { STORM_SKY_GLSL, type StormUniforms } from './storms';

export type Quality = 'high' | 'medium';

/** God ray gain (additive HDR, scaled by the haze terms), and the dawn pool's extinction per metre at the valley floor. */
const GODRAY_GAIN = 2.4;
const DAWN_DENSITY = 0.07;
const _snowCol = new THREE.Color();
const _rainCol = new THREE.Color();

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
        // S12 dust storm: strength at the camera 0..1 (0 = no storm, the extra terms are skipped) and the colour of the dust-laden air
        uDustStorm: { value: 0.0 },
        // blizzard whiteout (r-far-read): amount, the lit snow-white of the air, and the wind's direction on the screen
        uBlizz: { value: 0.0 },
        uBlizzCol: { value: new THREE.Color(0.8, 0.85, 0.95) },
        uBlizzDir: { value: new THREE.Vector2(1, -0.3) },
        uDustCol: { value: new THREE.Color(0.3, 0.2, 0.1) },
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
        uniform float uDustStorm;
        uniform float uBlizz;
        uniform vec3 uBlizzCol;
        uniform vec2 uBlizzDir;
        uniform vec3 uDustCol;
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
        // Wind-driven snow seen as streaks: three layers of noise stretched along the wind's direction on the screen and carried along it at
        // their own speeds (the near ones faster and broader), in screen pixels of a 900 px tall frame. 0..about 1.
        float tgBlizzStreaks(vec2 fc, vec2 dir, float t) {
          vec2 perp = vec2(-dir.y, dir.x);
          float al = dot(fc, dir), ac = dot(fc, perp);
          float s = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float sc = 1.0 + 0.9 * fi;
            vec2 q = vec2((al - t * (430.0 + 270.0 * fi)) / (74.0 * sc), ac / (1.6 * sc) + fi * 31.0);
            s += smoothstep(0.72, 0.97, tgNoise2(q)) * (0.55 - 0.13 * fi);
          }
          return s;
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
          if (d >= 0.999999 && dNear >= 0.999999) {
            gl_FragColor = c;
            if (uBlizz > 0.002) {
              // the sky of a whiteout is the flat white of the air itself, the sun a faint glow in it
              float bs = 0.9 * uBlizz;
              gl_FragColor.rgb = mix(c.rgb, uBlizzCol, bs);
              gl_FragColor.rgb += uBlizzCol * 0.2 * uBlizz * tgBlizzStreaks(gl_FragCoord.xy / (uTexel.y * 900.0), uBlizzDir, uTime);
            }
            return;
          }
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
          // the middle distance (about 150 to 1500 m: the far side of the valley from the wide view) keeps its contrast: this quadratic
          // term is thinned there by up to 55%. Beyond about 2 km it is back at full strength (and the far and aerial terms are untouched),
          // so the rim still melts into the sky, and near the camera it is too small to matter.
          // (A blizzard raises uHaze past 0.003 and keeps its full close-in fog.)
          nearOd *= 1.0 - 0.55 * smoothstep(120.0, 420.0, dist) * (1.0 - smoothstep(900.0, 2300.0, dist)) * (1.0 - smoothstep(0.0012, 0.003, uHaze));
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
          // Dust storm: a ground-hugging haze (density falling off with height, scale about 35 m) added to the extinction, so the valley
          // closes in to a hundred metres or so at ground level and thins with the camera's height. Same analytic form as the mist.
          float dustOd = 0.0;
          if (uDustStorm > 0.002) {
            float kd = 0.03;
            float k0 = 0.032 * pow(uDustStorm, 1.15);
            float ed0 = exp(clamp(-kd * y0, -60.0, 60.0));
            if (abs(dy * kd) > 1e-4) {
              float ed1 = exp(clamp(-kd * (y0 + dy * dist), -60.0, 60.0));
              dustOd = k0 * (ed0 - ed1) / (kd * dy);
            } else dustOd = k0 * ed0 * dist;
            dustOd = min(max(dustOd, 0.0), 8.0);
          }
          // Blizzard whiteout: a ground-hugging snow haze (density falling off with height, scale about 40 m) that closes the valley in to
          // 80 to 150 m at ground level and thins with the camera's height. Drifting banks of it thicken and thin on the wind, so the
          // visibility swells and shrinks. The analytic form of the dust storm and the mist.
          float bzOd = 0.0;
          if (uBlizz > 0.002) {
            float kb = 0.03;
            // (from a high camera the whiteout thins: the drone and map views see the valley through a veil, the ground sees nothing past about a hundred metres)
            float k0b = 0.034 * pow(uBlizz, 1.1) * (0.34 + 0.66 * exp(-max(y0, 0.0) / 75.0));
            vec3 gp = uCamPos + dir * min(dist, 300.0) * 0.5;
            float gust = 0.7 + 0.6 * tgNoise2(gp.xz * 0.02 - uWind.xy * (1.0 + 3.0 * uWind.z) * uTime * 0.6);
            float eb0 = exp(clamp(-kb * y0, -60.0, 60.0));
            if (abs(dy * kb) > 1e-4) {
              float eb1 = exp(clamp(-kb * (y0 + dy * dist), -60.0, 60.0));
              bzOd = k0b * gust * (eb0 - eb1) / (kb * dy);
            } else bzOd = k0b * gust * eb0 * dist;
            bzOd = min(max(bzOd, 0.0), 6.0);
          }
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
          // The middle distance (about 300 m to 2 km, the far side of the valley from the wide views) carries 40% less of it, easing back
          // to the full density by about 2.6 km, so the rim and the far hills keep their aerial perspective but the mid hills keep contrast.
          float aerMid = 0.6 + 0.4 * smoothstep(300.0, 2600.0, dist);
          float aerOd = max(dist - 90.0, 0.0) * uAerial * alt * (1.0 + 0.9 * uDust) * aerMid;
          float cosS = dot(dir, uSunDir);
          float aerFog = 1.0 - exp(-aerOd);
          float fog0 = min(1.0 - exp(-(od + mistOd + dawnOd + dustOd + bzOd)), uFogMax);
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
          // the dust itself: brown-ochre air, a little lighter toward the sun (forward scatter)
          if (dustOd > 0.0) {
            float dsh = dustOd / (od + mistOd + dawnOd + dustOd + 1e-5);
            fc = mix(fc, uDustCol * (0.85 + 0.5 * tgHGn(cosS, 0.5) * sunUp), clamp(dsh * 0.92, 0.0, 1.0));
          }
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
          if (bzOd > 0.0) {
            // the whiteout air is the lit snow-white, not the sky's horizon colour
            float bsh = bzOd / (od + mistOd + dawnOd + dustOd + bzOd + 1e-5);
            fc = mix(fc, uBlizzCol, clamp(bsh * 0.96, 0.0, 1.0));
          }
          vec3 outc = mix(base, fc, fog);
          if (uBlizz > 0.002) {
            // snow streaks across the picture, a little stronger where the air is thick, a little weaker right at the lens
            float st = tgBlizzStreaks(gl_FragCoord.xy / (uTexel.y * 900.0), uBlizzDir, uTime);
            outc += uBlizzCol * st * 0.2 * uBlizz * (0.45 + 0.55 * fog);
          }
          gl_FragColor = vec4(outc, c.a);
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
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uFlash;
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
          // (rain is no longer drawn here: it is a world-space streak volume, see rain.ts)
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

/**
 * Depth of field (R15): a gather bokeh from the scene depth texture. Off by default: the pass is disabled (the composer skips
 * it, and its render targets are not even allocated) until `blur` is above zero. Five small passes:
 *   1. half resolution: colour (Karis-weighted, so a lone bright pixel cannot flare) and the signed circle of confusion (a = pixels
 *      at half size, positive = behind the focus plane, negative = in front); a texel on a silhouette takes the blurrier side;
 *   2. a tile pass: the largest near-field blur in each 16 x 16 block, so a blurred foreground can spill onto sharp neighbours;
 *   3. the gather: `taps` samples on a golden-angle spiral (rotated per pixel) over the larger of the pixel's own far blur and the
 *      dilated near blur. Far samples may not bleed onto anything nearer than themselves (so the subject stays crisp against a soft
 *      background), near samples spill over everything; the result carries the near coverage in alpha;
 *   4. a 3 x 3 clean-up of the gather's per-pixel noise, weighted by how alike the circles of confusion are (so it never smears
 *      across a silhouette);
 *   5. full resolution: a pixel takes the blurred value in proportion to its own far blur, or to the near coverage, else stays sharp.
 * The circle of confusion is the thin-lens shape blur * (1 - focus / z), with `blur` the far blur as a fraction of the image height.
 */
const DOF_COMMON = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec4 uCoc;   // x: far blur in full-res pixels, y: focus distance (m along the view axis), z: near plane, w: far plane
  float tgLinZ(float d) { return uCoc.z * uCoc.w / (uCoc.w - d * (uCoc.w - uCoc.z)); }
  uniform vec4 uStyle; // x: 1 = long lens (gentle), 0 = thin lens; y: sharp slab around the focus (m); z: z / focus where the far blur is full; w: z / focus where near blur starts
  float tgCoc(float d) {
    float z = tgLinZ(d);
    if (uStyle.x < 0.5) return clamp(uCoc.x * (1.0 - uCoc.y / z), -uCoc.x, uCoc.x);
    // long lens, for the documentary camera: the subject and the metres around its depth stay sharp, the far background softens
    // slowly out to twice the subject distance, and only something very close to the lens goes soft in front
    float f = uCoc.y;
    float far = smoothstep(0.0, 1.0, max(z - f - uStyle.y, 0.0) / max(f * (uStyle.z - 1.0) - uStyle.y, 1.0));
    float near = 1.0 - smoothstep(uStyle.w * 0.3, uStyle.w, z / f);
    return uCoc.x * (far - near);
  }
`;
const DOF_TILE = 16;

class DofPass extends Pass {
  /** Far blur as a fraction of the image height (0 = off). */
  blur = 0;
  /** Distance to the plane in focus, metres along the view axis. */
  focus = 20;
  /** Gather taps (16 to 32). */
  taps = 24;
  /** The circle of confusion's shape (see DOF_COMMON): x 1 = long lens (the documentary camera), 0 = thin lens (photo mode). Shared with both shaders. */
  readonly style = new THREE.Vector4(0, 4, 2, 0.5);
  private w = 2;
  private h = 2;
  private halfRT: THREE.WebGLRenderTarget | null = null;
  private gatherRT: THREE.WebGLRenderTarget | null = null;
  private cleanRT: THREE.WebGLRenderTarget | null = null;
  private tile1RT: THREE.WebGLRenderTarget | null = null;
  private tileRT: THREE.WebGLRenderTarget | null = null;
  private downMat: THREE.ShaderMaterial;
  private tileMat: THREE.ShaderMaterial;
  private gatherMat: THREE.ShaderMaterial;
  private cleanMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private downQuad: FullScreenQuad;
  private tileQuad: FullScreenQuad;
  private gatherQuad: FullScreenQuad;
  private cleanQuad: FullScreenQuad;
  private compQuad: FullScreenQuad;

  constructor(private camera: THREE.PerspectiveCamera, private scenePass: ScenePass) {
    super();
    this.needsSwap = true;
    this.enabled = false;
    const cocU = () => ({ value: new THREE.Vector4(10, 20, 0.5, 9000) });
    const styleU = { value: this.style };
    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uCoc: cocU(), uStyle: styleU, uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        ${DOF_COMMON}
        void main() {
          vec2 o = uTexel * 0.5;
          vec2 offs[4] = vec2[4](vec2(-o.x, -o.y), vec2(o.x, -o.y), vec2(-o.x, o.y), vec2(o.x, o.y));
          vec3 col[4];
          float coc[4];
          // a texel that straddles a silhouette takes the blurrier side's circle of confusion (a sharp subject keeps its own full
          // resolution pixels in the composite, so what matters here is that the background beside it is blurred, not smeared with it)
          float best = -1.0, cSel = 0.0;
          for (int i = 0; i < 4; i++) {
            vec2 uv = vUv + offs[i];
            col[i] = min(texture2D(tDiffuse, uv).rgb, vec3(24.0));
            coc[i] = tgCoc(texture2D(tDepth, uv).x);
            if (abs(coc[i]) > best) { best = abs(coc[i]); cSel = coc[i]; }
          }
          vec3 sum = vec3(0.0);
          float wsum = 0.0;
          for (int i = 0; i < 4; i++) {
            float w = (1.0 / (1.0 + dot(col[i], vec3(0.2126, 0.7152, 0.0722)))) / (1.0 + 0.5 * abs(coc[i] - cSel));
            sum += col[i] * w;
            wsum += w;
          }
          gl_FragColor = vec4(sum / wsum, cSel * 0.5);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.tileMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uSrcTexel: { value: new THREE.Vector2(1 / 800, 1 / 450) }, uFromCoc: { value: 1 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tSrc;
        uniform vec2 uSrcTexel;
        uniform float uFromCoc;
        // the largest near-field blur over a 4 x 4 block of the source: the circle of confusion's alpha first (negative = near), then
        // the red channel of the first result. Two of these make a 16 x 16 tile, with enough threads to keep the GPU busy.
        void main() {
          vec2 origin = floor(gl_FragCoord.xy) * 4.0;
          float nearest = 0.0;
          for (int y = 0; y < 4; y++) {
            for (int x = 0; x < 4; x++) {
              vec4 s = textureLod(tSrc, (origin + vec2(float(x), float(y)) + 0.5) * uSrcTexel, 0.0);
              nearest = max(nearest, uFromCoc > 0.5 ? -s.a : s.r);
            }
          }
          gl_FragColor = vec4(nearest, 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.gatherMat = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null }, tTile: { value: null },
        uHalfTexel: { value: new THREE.Vector2(1 / 800, 1 / 450) }, uTileSize: { value: new THREE.Vector2(50, 29) },
        uTaps: { value: 24 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tSrc;
        uniform sampler2D tTile;
        uniform vec2 uHalfTexel;
        uniform vec2 uTileSize;
        uniform float uTaps;
        void main() {
          vec4 c0 = textureLod(tSrc, vUv, 0.0);
          float cc = c0.a;
          float ccFar = max(cc, 0.0);
          // the largest near-field blur within a tile of this pixel (3 x 3 tiles, so it spills onto sharp neighbours)
          vec2 tc = floor(gl_FragCoord.xy / ${DOF_TILE}.0) + 0.5;
          float nearR = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) nearR = max(nearR, textureLod(tTile, (tc + vec2(float(i), float(j))) / uTileSize, 0.0).r);
          float R = max(ccFar, nearR);
          if (R < 0.6) { gl_FragColor = vec4(c0.rgb, 0.0); return; }
          float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
          float spacing = R * sqrt(3.14159265 / uTaps);   // the mean gap between taps, in half-resolution pixels
          vec3 farSum = c0.rgb;
          float farW = 1.0;
          vec3 nearSum = vec3(0.0);
          float nearW = 0.0;
          // the golden-angle spiral, turned a step at a time (a rotation each tap, not a cos and a sin each tap)
          vec2 dir = vec2(cos(jit), sin(jit));
          const vec2 golden = vec2(-0.7373688, 0.6754903);   // cos and sin of 2.3999632
          for (int i = 0; i < 32; i++) {
            if (float(i) >= uTaps) break;
            float fi = float(i) + 0.5;
            float r = R * sqrt(fi / uTaps);
            dir = vec2(dir.x * golden.x - dir.y * golden.y, dir.x * golden.y + dir.y * golden.x);
            // wide kernels read the half-resolution image's mip chain: a tap away from the centre stands for the patch of the disc
            // it covers (cheaper in the cache, and it takes the noise out), the taps nearest the pixel stay exact
            float lod = clamp(log2(max(1.0, spacing * (0.3 + 0.7 * r / R))) - 0.5, 0.0, 3.0);
            vec4 s = textureLod(tSrc, vUv + dir * (r * uHalfTexel), lod);
            float cs = s.a;
            // behind the pixel, a sample may not blur it further than the pixel itself is blurred
            float effFar = cs > cc ? min(max(cs, 0.0), ccFar) : max(cs, 0.0);
            float wF = clamp(effFar - r + 1.0, 0.0, 1.0);
            float wN = clamp(max(-cs, 0.0) - r + 1.0, 0.0, 1.0);
            float lum = 1.0 + 0.25 * min(dot(s.rgb, vec3(0.2126, 0.7152, 0.0722)), 6.0);
            farSum += s.rgb * (wF * lum);
            farW += wF * lum;
            nearSum += s.rgb * wN;
            nearW += wN;
          }
          vec3 farC = farSum / farW;
          float cov = clamp(nearW / (uTaps * 0.5), 0.0, 1.0);
          vec3 nearC = nearW > 0.0 ? nearSum / nearW : farC;
          gl_FragColor = vec4(mix(farC, nearC, cov), cov);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.cleanMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, tCoc: { value: null }, uHalfTexel: { value: new THREE.Vector2(1 / 800, 1 / 450) } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tSrc;
        uniform sampler2D tCoc;
        uniform vec2 uHalfTexel;
        void main() {
          // four bilinear taps at the corners of the pixel's own texel: a 3 x 3 tent for the price of four fetches
          float cc = texture2D(tCoc, vUv).a;
          vec4 sum = vec4(0.0);
          float wsum = 0.0;
          for (int k = 0; k < 4; k++) {
            vec2 uv = vUv + vec2(k < 2 ? -0.5 : 0.5, (k & 1) == 0 ? -0.5 : 0.5) * uHalfTexel;
            float w = exp(-abs(texture2D(tCoc, uv).a - cc) * 0.45);
            sum += texture2D(tSrc, uv) * w;
            wsum += w;
          }
          gl_FragColor = sum / wsum;
        }`,
      depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tBlur: { value: null }, uCoc: cocU(), uStyle: styleU },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform sampler2D tBlur;
        ${DOF_COMMON}
        void main() {
          vec4 sharp = texture2D(tDiffuse, vUv);
          float far = max(tgCoc(texture2D(tDepth, vUv).x), 0.0);
          vec4 b = texture2D(tBlur, vUv);
          float k = max(clamp(far * 0.5, 0.0, 1.0), b.a);
          gl_FragColor = vec4(mix(sharp.rgb, b.rgb, k), sharp.a);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.downQuad = new FullScreenQuad(this.downMat);
    this.tileQuad = new FullScreenQuad(this.tileMat);
    this.gatherQuad = new FullScreenQuad(this.gatherMat);
    this.cleanQuad = new FullScreenQuad(this.cleanMat);
    this.compQuad = new FullScreenQuad(this.compMat);
  }

  /** Allocated on first use, so a game that never opens photo mode or a close shot pays nothing, in time or in memory. */
  private ensure(): void {
    if (this.halfRT) return;
    const hw = Math.max(2, this.w >> 1), hh = Math.max(2, this.h >> 1);
    const mk = (w: number, h: number, filter: THREE.MagnificationTextureFilter) => new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, depthBuffer: false, minFilter: filter, magFilter: filter,
    });
    // the half-resolution image keeps a mip chain (three builds it after the pass renders) for the wide taps of the gather
    this.halfRT = new THREE.WebGLRenderTarget(hw, hh, {
      type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapNearestFilter, magFilter: THREE.LinearFilter,
    });
    this.gatherRT = mk(hw, hh, THREE.LinearFilter);
    this.cleanRT = mk(hw, hh, THREE.LinearFilter);
    this.tile1RT = mk(Math.ceil(hw / 4), Math.ceil(hh / 4), THREE.NearestFilter);
    this.tileRT = mk(Math.ceil(hw / DOF_TILE), Math.ceil(hh / DOF_TILE), THREE.NearestFilter);
    this.halfRT.texture.name = 'dof.half';
    this.gatherRT.texture.name = 'dof.gather';
  }

  private freeTargets(): void {
    this.halfRT?.dispose(); this.gatherRT?.dispose(); this.cleanRT?.dispose(); this.tile1RT?.dispose(); this.tileRT?.dispose();
    this.halfRT = this.gatherRT = this.cleanRT = this.tile1RT = this.tileRT = null;
  }

  /** Whether the pass has anything to do (the engine turns `enabled` on and off from this). */
  get active(): boolean { return this.blur > 0.0005; }

  override setSize(w: number, h: number): void {
    this.w = Math.max(2, w); this.h = Math.max(2, h);
    this.freeTargets();
    if (this.enabled) this.ensure();
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.ensure();
    const half = this.halfRT!, gather = this.gatherRT!, clean = this.cleanRT!, tile1 = this.tile1RT!, tile = this.tileRT!;
    const cam = this.camera;
    const coc = new THREE.Vector4(this.blur * this.h, Math.max(cam.near * 2, this.focus), cam.near, cam.far);
    const depth = this.scenePass.depthTexture;

    const dm = this.downMat.uniforms;
    dm.tDiffuse.value = readBuffer.texture; dm.tDepth.value = depth; (dm.uCoc.value as THREE.Vector4).copy(coc);
    (dm.uTexel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
    renderer.setRenderTarget(half);
    this.downQuad.render(renderer);

    const tm = this.tileMat.uniforms;
    tm.tSrc.value = half.texture; (tm.uSrcTexel.value as THREE.Vector2).set(1 / half.width, 1 / half.height); tm.uFromCoc.value = 1;
    renderer.setRenderTarget(tile1);
    this.tileQuad.render(renderer);
    tm.tSrc.value = tile1.texture; (tm.uSrcTexel.value as THREE.Vector2).set(1 / tile1.width, 1 / tile1.height); tm.uFromCoc.value = 0;
    renderer.setRenderTarget(tile);
    this.tileQuad.render(renderer);

    const gm = this.gatherMat.uniforms;
    gm.tSrc.value = half.texture; gm.tTile.value = tile.texture;
    (gm.uHalfTexel.value as THREE.Vector2).set(1 / half.width, 1 / half.height);
    (gm.uTileSize.value as THREE.Vector2).set(tile.width, tile.height);
    gm.uTaps.value = Math.min(32, Math.max(8, this.taps));
    renderer.setRenderTarget(gather);
    this.gatherQuad.render(renderer);

    const km = this.cleanMat.uniforms;
    km.tSrc.value = gather.texture; km.tCoc.value = half.texture;
    (km.uHalfTexel.value as THREE.Vector2).set(1 / half.width, 1 / half.height);
    renderer.setRenderTarget(clean);
    this.cleanQuad.render(renderer);

    const cm = this.compMat.uniforms;
    cm.tDiffuse.value = readBuffer.texture; cm.tDepth.value = depth; cm.tBlur.value = clean.texture;
    (cm.uCoc.value as THREE.Vector4).copy(coc);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compQuad.render(renderer);
  }

  override dispose(): void {
    this.freeTargets();
    this.downMat.dispose(); this.tileMat.dispose(); this.gatherMat.dispose(); this.cleanMat.dispose(); this.compMat.dispose();
    this.downQuad.dispose(); this.tileQuad.dispose(); this.gatherQuad.dispose(); this.cleanQuad.dispose(); this.compQuad.dispose();
  }
}

/**
 * Last pass: tiny dither so smooth skies never band in 8-bit output. It also carries the lens look (R15): film grain, weighted
 * toward the mid tones, and a faint radial colour fringe (red out, blue in, under a pixel at the corners). Both are zero by
 * default, and then the extra branch is skipped (it is one uniform test).
 */
class FinishPass extends Pass {
  material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor() {
    super();
    this.needsSwap = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uGrain: { value: 0 },
        uCA: { value: 0 },
        uSeed: { value: 0 },
        uRes: { value: new THREE.Vector2(1600, 900) },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uGrain;   // amplitude in display units (0.03 is plain to see up close, quiet at a glance)
        uniform float uCA;      // fringe at the corners, in pixels each way
        uniform float uSeed;
        uniform vec2 uRes;
        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          if (uCA > 0.0) {
            // pixels of shift grow with the distance from the centre and reach uCA at the corners
            vec2 q = (vUv - 0.5) * uRes;
            vec2 sh = q * (uCA / (0.5 * length(uRes))) / uRes;
            c.r = texture2D(tDiffuse, vUv + sh).r;
            c.b = texture2D(tDiffuse, vUv - sh).b;
          }
          if (uGrain > 0.0) {
            // film grain: a touch bigger than a pixel on big screens, re-rolled every frame, triangular so it has no hard peaks,
            // strongest in the mid tones and quiet in deep shadow and in highlights
            vec2 gp = floor(gl_FragCoord.xy / max(1.0, uRes.y / 1100.0));
            float n = hash12(gp + uSeed * 17.0) + hash12(gp + 91.7 + uSeed * 31.0) - 1.0;
            float cn = hash12(gp * 1.7 + 13.1 + uSeed * 5.0) - 0.5;
            float l = clamp(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
            float wgt = 0.3 + 2.8 * l * (1.0 - l);
            c.rgb += (vec3(n) + vec3(cn * 0.5, -cn * 0.3, cn * 0.4)) * uGrain * wgt;
          }
          float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          c.rgb += (n - 0.5) / 255.0;
          gl_FragColor = c;
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  override setSize(w: number, h: number): void { (this.material.uniforms.uRes.value as THREE.Vector2).set(w, h); }

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
  readonly rain = new Rain();
  readonly rainPass: RainPass;
  readonly dof: DofPass;
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
    this.rainPass = new RainPass(this.rain, camera, () => this.scenePass.depthTexture);
    this.composer.addPass(this.rainPass);

    // depth of field (R15) sits before bloom, so a bright out-of-focus highlight still glows; disabled (skipped) until asked for
    this.dof = new DofPass(camera, this.scenePass);
    this.composer.addPass(this.dof);

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

  /**
   * Depth of field (R15). `blur` is the far blur as a fraction of the image height (0 turns the pass off completely: it is skipped
   * and holds no memory), `focus` the distance in metres along the view axis to the plane in focus, `taps` the gather count.
   * `longLens` gives the documentary camera's shape: a sharp slab around the subject, the far background softening out to twice its
   * distance, near blur only for something very close to the lens (photo mode uses the plain thin lens).
   */
  setDof(blur: number, focus: number, taps = 24, longLens = false): void {
    const d = this.dof;
    d.blur = Math.max(0, blur);
    d.focus = focus;
    d.taps = taps;
    d.style.x = longLens ? 1 : 0;
    d.enabled = d.active;
  }

  /** Lens look (R15): film grain amplitude (display units, about 0.03 at most) and the colour fringe at the corners in pixels. Zero is off. */
  setLens(grain: number, fringePx: number): void {
    const u = this.finish.material.uniforms;
    u.uGrain.value = Math.max(0, grain);
    u.uCA.value = Math.max(0, fringePx);
    // film re-rolls its grain 24 times a second
    u.uSeed.value = grain > 0 ? Math.floor(performance.now() / 41.667) % 4096 : 0;
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
    f.uFogMax.value = 0.94 + 0.035 * bz + 0.03 * this.dustStorm;
    f.uDustStorm.value = this.dustStorm;
    f.uBlizz.value = this.blizzard;
    (f.uBlizzCol.value as THREE.Color).copy(this.blizzCol);
    (f.uBlizzDir.value as THREE.Vector2).copy(this.blizzDir);
    if (this.dustStorm > 0.002) {
      // the dust-laden air takes the (already ochre) horizon colour of the sky, a touch browner
      const hc = this.shared.skyHorizon.value;
      (f.uDustCol.value as THREE.Color).setRGB(hc.r * 0.92, hc.g * 0.8, hc.b * 0.64);
    }
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
    this.bloom.strength = (this.quality === 'high' ? 1 : 0.85) * L.bloom * this.hazeBloom;
  }

  /**
   * Drought dust 0..1 for the aerial haze. The renderer's shared uniforms do not carry the weather, so the engine pushes the
   * eased value here (it stays 0 until something calls this).
   */
  dust = 0;
  /** S12 dust storm strength at the camera 0..1 (set by the engine each frame). */
  dustStorm = 0;
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
    // the whiteout comes up over a few seconds and clears over a few more (the snowfall and the wind each ease on their own, this evens out the sum)
    const bzTarget = blizzardAmount(fall, ws);
    this.blizzard += (bzTarget - this.blizzard) * (1 - Math.exp(-Math.min(dt, 0.25) / (bzTarget > this.blizzard ? 3.5 : 6)));
    if (bzTarget === 0 && this.blizzard < 0.004) this.blizzard = 0;
    this.camAbove = aboveGround;
    if (fall <= 0.01) { this.snow.update(dt, this.camera, { fall: 0, windStrength: ws, windX: 1, windZ: 0, aboveGround, color: _snowCol }); return; }
    const lc = this.shared.lightColor.value;
    // a flake is lit like the snowpack: albedo/pi times the ambient plus the key light at a half-lit angle
    _snowCol.setRGB(
      L.hemiSky.r * L.hemiIntensity + lc.r * 0.45, L.hemiSky.g * L.hemiIntensity + lc.g * 0.45, L.hemiSky.b * L.hemiIntensity + lc.b * 0.45,
    ).multiplyScalar(0.92 / Math.PI * 1.7);
    this.snow.update(dt, this.camera, { fall, windStrength: ws, windX: Math.cos(env.windDir), windZ: Math.sin(env.windDir), aboveGround, color: _snowCol });
    // the whiteout air: lit like the snowpack it blows off (so a hillside fades into it without a seam); the streaks run along the wind
    // as it is seen from this camera, with a downward slant
    // (shaded snow: the sky light and only a little of the key, so the air is no brighter than the snow it hides)
    this.blizzCol.setRGB(
      L.hemiSky.r * L.hemiIntensity + lc.r * 0.14, L.hemiSky.g * L.hemiIntensity + lc.g * 0.14, L.hemiSky.b * L.hemiIntensity + lc.b * 0.14,
    ).multiplyScalar(0.92 / Math.PI * 1.7 * 0.92);
    const e = this.camera.matrixWorld.elements;
    const wx = Math.cos(env.windDir) * 0.9, wz = Math.sin(env.windDir) * 0.9, wy = -0.35;
    const sx = wx * e[0] + wy * e[1] + wz * e[2], sy = wx * e[4] + wy * e[5] + wz * e[6];
    const sl = Math.hypot(sx, sy);
    if (sl > 0.05) this.blizzDir.set(sx / sl, sy / sl); else this.blizzDir.set(1, -0.3);
  }
  private blizzCol = new THREE.Color(0.8, 0.85, 0.95);
  private blizzDir = new THREE.Vector2(1, -0.3);

  /**
   * Falling rain (see rain.ts): `rain` is the eased 0..1 visible rain (already faded out when looking steeply down). Streaks are
   * lit like the air they fall through: the sky's horizon colour and the ambient, with a little of the key light catching them.
   */
  updateRain(dt: number, rain: number, env: EnvState, aboveGround: number, L: Lighting): void {
    const ws = clamp(env.windStrength, 0, 1);
    if (rain <= 0.01) { this.rain.update(dt, this.camera, { fall: 0, windStrength: ws, windX: 1, windZ: 0, aboveGround, color: _rainCol }); return; }
    const sh = this.shared;
    const lc = sh.lightColor.value, hz = sh.skyHorizon.value;
    _rainCol.setRGB(
      hz.r * 0.55 + L.hemiSky.r * L.hemiIntensity * 0.45 + lc.r * 0.1,
      hz.g * 0.55 + L.hemiSky.g * L.hemiIntensity * 0.45 + lc.g * 0.1,
      hz.b * 0.55 + L.hemiSky.b * L.hemiIntensity * 0.45 + lc.b * 0.1,
    ).multiplyScalar(0.85);
    this.rain.update(dt, this.camera, { fall: rain, windStrength: ws, windX: Math.cos(env.windDir), windZ: Math.sin(env.windDir), aboveGround, color: _rainCol });
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
    this.rain.dispose();
    this.dof.dispose();
    this.grade.dispose();
    this.finish.dispose();
    this.gtao.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}
