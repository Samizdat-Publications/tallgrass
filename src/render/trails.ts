// Long exposure at speed (r-trails). At 10x and 100x individual animals are flickering dots, so the land keeps a memory of where life
// moved, like a long-exposure photograph: every walking animal paints a soft streak into a small ground-space texture, the texture
// fades with a half-life measured in valley time (so the picture looks the same at 10x and at 100x), and a ground-draped sheet shows it.
//
//   R  grazers (bison, pronghorn, mule deer): trampled, dusty, a little darker than the turf
//   G  predators (wolf, cougar, coyote): a thin cool grey-blue thread
//   B  fire: the cells burning now (the vegetation texture's B = 255), a dull ember edge that cools to a scar as it fades
//
// The streaks come from the snapshot agent list (positions by animal id, one segment per sim step), drawn as instanced capsules into a
// half-float render target. Ink is laid down per metre of path (a runner paints a heavier line than a walker) plus a small amount per
// tick of standing about, so the look does not depend on how often snapshots arrive. Everything is idle, and costs nothing, while the
// layer is faded out (1x, or the setting is off). No allocation per frame: the instance buffers, the id tables and the scratch are fixed.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { AGENT_STRIDE, SEASON_TICKS } from '../sim/types';
import { SPECIES } from '../sim/species';
import type { SharedUniforms } from './common';

/** Render target size: 512 texels over the 512 m valley, 1 m per texel. */
const RES = 512;
/** Height above the ground; clears the grass tops like the map overlays (overlay.ts). */
const LIFT = 1.1;
const SEG = 128;
/** Most capsules drawn per step (the agent pool is far smaller than this). */
const MAX_INST = 6144;
/** Half-life of a grazer streak, as a share of a valley season ("a fifth to a quarter of a season"); predators a little longer-lived relative to their thin width, fire cools faster. */
const HALF_SEASON = 0.25;
const HALF_PRED = 1.0;
const HALF_FIRE = 1.2;
/** The fade is applied once it takes this much off, so a half-float texel never stalls at 1x (a 0.1 percent step would round to nothing). */
const FADE_STEP = 0.97;
/** Ink: per path length in sigmas (a streak peaks at about 2.5 times this), and per tick of loitering. */
const K_LEN = 0.4;
const K_DWELL = 0.001;
/** A step longer than this is a jump (spawn, skip, a long pause), not travel. */
const MAX_STEP_M = 60;
const MAX_DTICKS = 48;
/** Sim speed to layer strength: faint at 10x, full at 100x (the worker reports -1 while it skips flat out, which counts as 100x). */
const FAST_STEPS = { lo: [4, 9, 0.34], hi: [40, 90, 0.66] } as const;

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Per species: channel (0 grazers, 1 predators, -1 not painted), streak sigma (m), ink multiplier. */
const CH = new Int8Array(SPECIES.length).fill(-1);
const SIGMA = new Float32Array(SPECIES.length).fill(2);
const INK = new Float32Array(SPECIES.length).fill(1);
{
  const look: Record<string, [number, number]> = {
    bison: [4.8, 1.0], pronghorn: [2.6, 0.75], muledeer: [2.2, 0.65], wolf: [1.2, 0.85], cougar: [1.2, 0.7], coyote: [1.0, 0.55],
  };
  for (const s of SPECIES) {
    if (s.repr !== 'agent' || s.flies || s.key === 'rabbit') continue;
    const l = look[s.key];
    if (s.guild === 'grazer' || s.guild === 'browser') CH[s.id] = 0;
    else if (s.guild === 'predator' || s.guild === 'mesopredator') CH[s.id] = 1;
    else continue;
    if (l) { SIGMA[s.id] = l[0]; INK[s.id] = l[1]; }
  }
}

const SPLAT_VERT = /* glsl */ `
attribute vec4 aSeg;
attribute vec4 aInfo;
uniform float uWorld;
varying vec2 vP;
varying vec4 vSeg;
varying vec3 vInfo;
void main() {
  vec2 a = aSeg.xy, b = aSeg.zw;
  vec2 ab = b - a;
  float len = length(ab);
  vec2 dir = len > 1e-4 ? ab / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float ext = aInfo.x * 3.0;
  vec2 p = (a + b) * 0.5 + dir * position.x * (len * 0.5 + ext) + nrm * position.y * ext;
  vP = p;
  vSeg = aSeg;
  vInfo = aInfo.xyz;
  gl_Position = vec4(p / uWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

const SPLAT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vP;
varying vec4 vSeg;
varying vec3 vInfo;
void main() {
  vec2 pa = vP - vSeg.xy;
  vec2 ba = vSeg.zw - vSeg.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h);
  float s = vInfo.x;
  // a gaussian across the streak, its far tail trimmed so the quad's edge (three sigma) is not a visible step
  float g = max(exp(-0.5 * d * d / (s * s)) - 0.0111, 0.0) * 1.0112;
  float v = vInfo.y * g;
  gl_FragColor = vec4(vInfo.z < 0.5 ? v : 0.0, vInfo.z >= 0.5 ? v : 0.0, 0.0, 0.0);
}`;

const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const DRAPE_VERT = /* glsl */ `
varying vec2 vXZ;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const DRAPE_FRAG = /* glsl */ `
uniform sampler2D tTrail;
uniform sampler2D tStatic;
uniform float uWorld;
uniform float uAlpha;
uniform float uNight;
uniform vec3 uDustLo, uDustHi, uThread, uEmberCold, uEmberHot, uEmberCore;
varying vec2 vXZ;
varying vec3 vWorld;

vec4 over(vec4 dst, vec3 c, float a) {
  float oa = a + dst.a * (1.0 - a);
  return vec4((c * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-4), oa);
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 uv = vXZ / uWorld;
  vec3 t = texture2D(tTrail, uv).rgb;
  // ink to cover, on a log scale: a herd's overlapping streaks build a body, and a fading streak loses its strength over many half-lives
  // instead of holding at full and then vanishing
  float g = clamp(log2(1.0 + 4.0 * t.r) / 6.0, 0.0, 1.0);
  float p = clamp(log2(1.0 + 4.0 * t.g) / 5.0, 0.0, 1.0);
  float f = clamp(t.b, 0.0, 1.0);
  // the turf is trampled unevenly: a little breakup, so a streak reads as ground and not as paint
  float mott = 0.78 + 0.44 * vnoise(vXZ * 0.9);
  g *= mott;
  f *= 0.7 + 0.3 * vnoise(vXZ * 0.45 + 7.0);
  vec4 col = vec4(0.0);
  vec3 dust = mix(uDustLo, uDustHi, smoothstep(0.5, 1.0, g));
  col = over(col, dust, g * 0.9);
  // the predator thread is narrower than its ink: only the heart of a streak shows
  col = over(col, uThread, pow(p, 1.6) * 0.5);
  // a fire front: a bright cinder at the edge that dulls, reddens and darkens to a scar as it cools
  vec3 ember = mix(uEmberCold, uEmberHot, smoothstep(0.08, 0.7, f));
  ember = mix(ember, uEmberCore, smoothstep(0.85, 1.0, f) * 0.6);
  col = over(col, ember, smoothstep(0.02, 0.4, f) * 0.72);
  // the night grade lifts everything: keep the tints saturated and a little darker so they hold (as overlay.ts does)
  col.rgb = pow(max(col.rgb, vec3(0.0)), vec3(1.0 + 1.0 * uNight)) * (1.0 - 0.25 * uNight);
  float edge = smoothstep(0.0, 6.0, min(min(vXZ.x, vXZ.y), min(uWorld - vXZ.x, uWorld - vXZ.y)));
  // keep the ponds and the creek clear (static A = distance to water / 64 m)
  edge *= smoothstep(0.004, 0.035, texture2D(tStatic, uv).a);
  // close to the lens the sheet would float over the blades: it thins out inside about 15 to 60 m
  float near = smoothstep(15.0, 60.0, length(vWorld - cameraPosition));
  gl_FragColor = vec4(col.rgb, col.a * uAlpha * edge * near);
}`;

/** What the layer needs from the game each frame. */
export interface TrailFrame {
  /** Sim speed multiplier of the latest snapshot (0 paused, -1 skipping). */
  speed: number;
  /** Tick of the latest snapshot. */
  tick: number;
  count: number;
  ids: Uint32Array;
  agents: Float32Array;
}

export type TrailMode = 'auto' | 'off' | 'on';

export class Trails {
  readonly object3D: THREE.Mesh;
  /** 'auto' follows the sim speed and the setting; 'off' (?trails=0) never draws; 'on' (?trails=1) draws at any speed. */
  mode: TrailMode = 'auto';
  /** The Settings switch "Long exposure at speed". */
  enabled = true;

  private rt: THREE.WebGLRenderTarget;
  private drape: THREE.ShaderMaterial;
  private fadeMat: THREE.ShaderMaterial;
  private fireMat: THREE.ShaderMaterial;
  private fadeQuad: FullScreenQuad;
  private fireQuad: FullScreenQuad;
  private splatScene = new THREE.Scene();
  private splatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private splatGeo: THREE.InstancedBufferGeometry;
  private segAttr: THREE.InstancedBufferAttribute;
  private infoAttr: THREE.InstancedBufferAttribute;
  private splatMesh: THREE.Mesh;
  private splatCount = 0;

  private alpha = 0;
  private wasActive = false;
  private lastTick = -1;
  private tickPool = 0;
  private decayAcc = 0;
  private needClear = true;
  private fireDirty = true;

  // per animal id: where it was at the last step we drew (growable, indexed by id)
  private lastX = new Float32Array(4096);
  private lastZ = new Float32Array(4096);
  private stamp = new Int32Array(4096);
  private gen = 2;
  private procTick = -1;

  private fadeVec = new THREE.Vector4(1, 1, 1, 1);
  private vegUniform: { value: THREE.Texture | null };

  constructor(private worldSize: number, heightAt: (x: number, z: number) => number, shared: SharedUniforms) {
    this.vegUniform = shared.vegTex;
    this.rt = new THREE.WebGLRenderTarget(RES, RES, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType,
    });
    this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.name = 'trails';

    // the ink: additive instanced capsules
    const corner = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    this.splatGeo = new THREE.InstancedBufferGeometry();
    this.splatGeo.setAttribute('position', new THREE.BufferAttribute(corner, 3));
    this.splatGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.segAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 4), 4);
    this.infoAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 4), 4);
    this.segAttr.setUsage(THREE.DynamicDrawUsage);
    this.infoAttr.setUsage(THREE.DynamicDrawUsage);
    this.splatGeo.setAttribute('aSeg', this.segAttr);
    this.splatGeo.setAttribute('aInfo', this.infoAttr);
    this.splatGeo.instanceCount = 0;
    const splatMat = new THREE.ShaderMaterial({
      vertexShader: SPLAT_VERT, fragmentShader: SPLAT_FRAG,
      uniforms: { uWorld: { value: worldSize } },
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    this.splatMesh = new THREE.Mesh(this.splatGeo, splatMat);
    this.splatMesh.frustumCulled = false;
    this.splatScene.add(this.splatMesh);

    // the fade: dst = dst * factor, per channel
    this.fadeMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: 'precision highp float; uniform vec4 uFade; void main(){ gl_FragColor = uFade; }',
      uniforms: { uFade: { value: this.fadeVec } },
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.SrcAlphaFactor,
      depthTest: false, depthWrite: false, transparent: true,
    });
    this.fadeQuad = new FullScreenQuad(this.fadeMat);

    // the fire: max of the burning mask into B, straight from the vegetation texture (no CPU work)
    this.fireMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tVeg;
        varying vec2 vUv;
        void main() {
          float b = texture2D(tVeg, vUv).b;
          gl_FragColor = vec4(0.0, 0.0, smoothstep(0.9, 1.0, b), 0.0);
        }`,
      uniforms: { tVeg: shared.vegTex },
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false, transparent: true,
    });
    this.fireQuad = new FullScreenQuad(this.fireMat);

    // the sheet draped over the valley
    const geo = new THREE.PlaneGeometry(worldSize, worldSize, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.translate(worldSize / 2, 0, worldSize / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)) + LIFT);
    geo.computeBoundingSphere();
    this.drape = new THREE.ShaderMaterial({
      vertexShader: DRAPE_VERT, fragmentShader: DRAPE_FRAG,
      uniforms: {
        tTrail: { value: this.rt.texture },
        tStatic: shared.staticTex,
        uWorld: { value: worldSize },
        uAlpha: { value: 0 },
        uNight: shared.night,
        // authored as sRGB, converted to the linear working space by THREE.Color
        uDustLo: { value: new THREE.Color('#382b19') },
        uDustHi: { value: new THREE.Color('#645232') },
        uThread: { value: new THREE.Color('#7388a2') },
        uEmberCold: { value: new THREE.Color('#26120a') },
        uEmberHot: { value: new THREE.Color('#d4551a') },
        uEmberCore: { value: new THREE.Color('#ffb25a') },
      },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.object3D = new THREE.Mesh(geo, this.drape);
    this.object3D.name = 'trails';
    this.object3D.renderOrder = 4;
    this.object3D.frustumCulled = false;
    this.object3D.visible = false;
  }

  /** The layer's current strength 0..1 (what the sheet is drawn at). */
  get strength(): number { return this.alpha; }

  /** Is the layer doing any work this frame? */
  get active(): boolean { return this.wasActive; }

  /** Target strength for a sim speed: nothing at 1x, faint at 10x, full at 100x. */
  static targetFor(speed: number): number {
    const s = speed < 0 ? 100 : speed;
    return FAST_STEPS.lo[2] * sstep(FAST_STEPS.lo[0], FAST_STEPS.lo[1], s) + FAST_STEPS.hi[2] * sstep(FAST_STEPS.hi[0], FAST_STEPS.hi[1], s);
  }

  update(dt: number, renderer: THREE.WebGLRenderer, f: TrailFrame | null): void {
    const forced = this.mode === 'on';
    const allowed = this.mode !== 'off' && (this.enabled || forced);
    let target = 0;
    if (f && allowed) {
      if (forced) target = 1;
      else if (f.speed === 0) target = this.alpha; // paused: hold the picture as it is
      else target = Trails.targetFor(f.speed);
    }
    // in and out over a couple of seconds
    this.alpha += (target - this.alpha) * (1 - Math.exp(-dt / 0.7));
    if (target === 0 && this.alpha < 0.004) this.alpha = 0;
    if (target === 1 && this.alpha > 0.996) this.alpha = 1;

    const active = !!f && (this.alpha > 0 || target > 0);
    if (!active) {
      if (this.wasActive) {
        this.wasActive = false;
        this.object3D.visible = false;
        this.needClear = true;
        this.lastTick = -1;
        this.tickPool = 0;
        this.decayAcc = 0;
        this.gen += 2; // every remembered position is stale
      }
      return;
    }
    this.wasActive = true;
    this.object3D.visible = this.alpha > 0.002;
    this.drape.uniforms.uAlpha.value = this.alpha;

    // valley time since the last frame, spread over a tenth of a second like the weather easing in engine.ts
    let simTicks = 0;
    let newStep = false;
    if (this.lastTick < 0) { this.lastTick = f.tick; this.procTick = f.tick; }
    else {
      const d = f.tick - this.lastTick;
      if (d >= 5000 || d < 0 || f.speed < 0) { this.tickPool = 0; this.needClear = true; this.lastTick = f.tick; this.procTick = f.tick; this.gen += 2; }
      else {
        this.tickPool += d;
        this.lastTick = f.tick;
        simTicks = this.tickPool * (1 - Math.exp(-dt / 0.1));
        this.tickPool -= simTicks;
      }
    }
    if (f.tick !== this.procTick) newStep = true;
    this.decayAcc += simTicks;

    const half = SEASON_TICKS * HALF_SEASON;
    const kG = Math.pow(2, -this.decayAcc / half);
    const doFade = this.needClear || kG < FADE_STEP;
    const doSplat = newStep && f.speed >= 0;
    const doFire = doFade || simTicks > 0 || this.fireDirty;
    if (newStep) this.stepAgents(f, doSplat);
    else this.splatCount = 0;
    if (!doFade && !doFire && this.splatCount === 0) return;

    const prev = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rt);
    if (this.needClear) {
      this.fadeVec.set(0, 0, 0, 0);
      this.fadeQuad.render(renderer);
      this.needClear = false;
      this.decayAcc = 0;
    } else if (doFade) {
      this.fadeVec.set(kG, Math.pow(2, -this.decayAcc / (half * HALF_PRED)), Math.pow(2, -this.decayAcc / (half * HALF_FIRE)), 1);
      this.fadeQuad.render(renderer);
      this.decayAcc = 0;
    }
    if (doFire && this.vegUniform.value) {
      this.fireQuad.render(renderer);
      this.fireDirty = false;
    }
    if (this.splatCount > 0) {
      this.splatGeo.instanceCount = this.splatCount;
      this.segAttr.needsUpdate = true;
      this.infoAttr.needsUpdate = true;
      renderer.render(this.splatScene, this.splatCam);
    }
    renderer.setRenderTarget(prev);
    renderer.autoClear = autoClear;
  }

  /** Turn one new snapshot into capsules: each painted animal's step from where it was at the last snapshot. */
  private stepAgents(f: TrailFrame, paint: boolean): void {
    const A = f.agents;
    const dTicks = Math.min(MAX_DTICKS, Math.max(1, f.tick - this.procTick));
    const g = this.gen;
    const seg = this.segAttr.array as Float32Array;
    const info = this.infoAttr.array as Float32Array;
    let n = 0;
    for (let i = 0; i < f.count; i++) {
      const o = i * AGENT_STRIDE;
      const sp = A[o] | 0;
      const ch = CH[sp];
      if (ch < 0) continue;
      const id = f.ids[i];
      if (id >= 4194304) continue;
      if (id >= this.stamp.length) this.grow(id);
      const x = A[o + 1], z = A[o + 2];
      const seen = this.stamp[id] === g - 1;
      const px = seen ? this.lastX[id] : x, pz = seen ? this.lastZ[id] : z;
      this.stamp[id] = g;
      this.lastX[id] = x;
      this.lastZ[id] = z;
      if (!paint || n >= MAX_INST) continue;
      const dx = x - px, dz = z - pz;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > MAX_STEP_M) continue;
      const sc = Math.min(1.3, Math.max(0.55, A[o + 5]));
      const sigma = SIGMA[sp] * (0.7 + 0.3 * sc);
      const spd = A[o + 4];
      const run = 0.7 + 0.8 * sstep(1.2, 8, spd);
      const loiter = 1 - sstep(0.5, 2, spd);
      const w = INK[sp] * (K_LEN * (len / sigma) * run + K_DWELL * dTicks * loiter);
      if (w < 1e-4) continue;
      const k = n * 4;
      seg[k] = px; seg[k + 1] = pz; seg[k + 2] = x; seg[k + 3] = z;
      info[k] = sigma; info[k + 1] = w; info[k + 2] = ch; info[k + 3] = 0;
      n++;
    }
    this.gen = g + 1;
    this.procTick = f.tick;
    this.splatCount = n;
  }

  private grow(id: number): void {
    let cap = this.stamp.length;
    while (cap <= id) cap *= 2;
    const lx = new Float32Array(cap), lz = new Float32Array(cap), st = new Int32Array(cap);
    lx.set(this.lastX); lz.set(this.lastZ); st.set(this.stamp);
    this.lastX = lx; this.lastZ = lz; this.stamp = st;
  }

  /** Dev only: the texture as RGBA floats (RES x RES, row 0 = z 0). Allocates; never call per frame. */
  readback(renderer: THREE.WebGLRenderer): Float32Array {
    const raw = new Uint16Array(RES * RES * 4);
    renderer.readRenderTargetPixels(this.rt, 0, 0, RES, RES, raw);
    const out = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = THREE.DataUtils.fromHalfFloat(raw[i]);
    return out;
  }

  /** Dev and capture: wipe the texture on the next frame. */
  clear(): void {
    this.needClear = true;
  }

  dispose(): void {
    this.rt.dispose();
    this.drape.dispose();
    this.object3D.geometry.dispose();
    this.splatGeo.dispose();
    (this.splatMesh.material as THREE.Material).dispose();
    this.fadeMat.dispose();
    this.fireMat.dispose();
    this.fadeQuad.dispose();
    this.fireQuad.dispose();
  }
}
