// Sandhill crane flyovers (the render side of V2-PLAN R14). The audio director schedules the calls and tells us when
// (`audio.onFlyover`): we draw a V-formation or loose skein of cranes crossing the sky for the same seconds, so the flock's travel
// across the screen follows the audio pan from `panFrom` to `panTo`.
//
//  - One instanced draw of a low-poly crane (about 500 vertices: body, long straight neck, head with a red crown, dark bill, legs
//    trailing, two segmented wings). The wingbeat is done in the vertex stage (shoulder flap with the outer wing lagging, slow and
//    deep, with now and then a glide), so the CPU only writes position, heading and a few constants per bird per frame.
//  - No draw at all (mesh hidden, zero instances) while no flight is active.
//  - The flock's route is fixed in the world when the flight starts: the screen-space line (NDC x from panFrom to panTo, at a fixed
//    height on screen) is cast through the camera as it was at that moment onto the plane at the flock's altitude, and the flock
//    rides that line. Held still, the camera sees the pan exactly; if it moves, the birds stay where birds would be.
//  - The cranes are drawn larger than life at long range (wingspan grows with distance, clamped), or they would be a dozen pixels.
import * as THREE from 'three';
import type { SharedUniforms } from './common';

export interface CraneFlightSpec {
  /** Seconds from now until the flock is at `panFrom` (the audio's `startAt - audio.now`). */
  delay: number;
  /** Seconds the pass lasts (audio `duration`). */
  duration: number;
  /** Screen-space pan at the start and the end, -1 left edge .. +1 right edge. */
  panFrom: number;
  panTo: number;
  /** Birds in the flock (about 5 to 12). */
  birds: number;
  /** Height above ground in metres. */
  altitude: number;
  season: 'spring' | 'autumn';
}

const MAX_BIRDS = 40;
const MAX_FLIGHTS = 3;
const HALF_SPAN = 1.05; // metres, one wing (a sandhill crane spans about 2.1 m)

interface Flight {
  spec: CraneFlightSpec;
  age: number; // seconds since start()
  seed: number;
  // the camera as it was when the flight started
  camPos: THREE.Vector3;
  world: THREE.Matrix4;
  projInv: THREE.Matrix4;
  planeY: number;
  ndcY: number;
  dist: number; // distance from the camera to the flock's centre when it crosses the middle of the screen
  scale: number;
  // per bird: slot in the formation, constants
  off: Float32Array; // along, across, up, phase, rate, rust (6 floats per bird)
}

// ---- crane mesh -----------------------------------------------------------------------------------------------
type V3 = [number, number, number];

class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  wing: number[] = []; // per vertex: span weight 0..1, side sign (0 for the body)
  idx: number[] = [];
  vert(p: V3, n: V3, c: V3, w = 0, side = 0): number {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0] / l, n[1] / l, n[2] / l);
    this.col.push(c[0], c[1], c[2]);
    this.wing.push(w, side);
    return this.pos.length / 3 - 1;
  }
  /** A closed tapered tube from a to b along any axis (rings of `sides` vertices). */
  tube(a: V3, b: V3, ra: number, rb: number, sides: number, colA: V3, colB: V3): void {
    const ax = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = ax.length();
    ax.normalize();
    const ref = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(ax, ref).normalize();
    const v = new THREE.Vector3().crossVectors(ax, u).normalize();
    const base = this.pos.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const c = ring ? b : a;
      const r = ring ? rb : ra;
      const col = ring ? colB : colA;
      for (let i = 0; i < sides; i++) {
        const t = (i / sides) * Math.PI * 2;
        const nx = u.x * Math.cos(t) + v.x * Math.sin(t), ny = u.y * Math.cos(t) + v.y * Math.sin(t), nz = u.z * Math.cos(t) + v.z * Math.sin(t);
        this.vert([c[0] + nx * r, c[1] + ny * r, c[2] + nz * r], [nx + ax.x * (ra - rb) / Math.max(len, 1e-6), ny + ax.y * (ra - rb) / Math.max(len, 1e-6), nz + ax.z * (ra - rb) / Math.max(len, 1e-6)], col);
      }
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.idx.push(base + i, base + j, base + sides + i, base + j, base + sides + j, base + sides + i);
    }
  }
  /** An ellipsoid (lat-long) centred at c with radii r. `colorAt` picks the colour from the unit-sphere normal. */
  ellipsoid(c: V3, r: V3, nu: number, nv: number, colorAt: (n: V3) => V3): void {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nv; j++) {
      const phi = (j / nv) * Math.PI; // 0 at the front (+z)
      for (let i = 0; i < nu; i++) {
        const th = (i / nu) * Math.PI * 2;
        const n: V3 = [Math.sin(phi) * Math.cos(th), Math.sin(phi) * Math.sin(th), Math.cos(phi)];
        this.vert([c[0] + n[0] * r[0], c[1] + n[1] * r[1], c[2] + n[2] * r[2]], [n[0] / r[0], n[1] / r[1], n[2] / r[2]], colorAt(n));
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * nu + i, b = base + j * nu + ((i + 1) % nu), c2 = a + nu, d = b + nu;
        this.idx.push(a, c2, b, b, c2, d);
      }
    }
  }
  /** One wing: a strip of columns along the span, leading edge and trailing edge per column. */
  wingStrip(side: number, grey: V3, dark: V3): void {
    const ws = [0, 0.16, 0.34, 0.54, 0.72, 0.88, 1.0];
    const base = this.pos.length / 3;
    for (const w of ws) {
      const x = side * (0.1 + (HALF_SPAN - 0.1) * w);
      const lead = 0.22 - 0.3 * Math.pow(w, 1.5);
      const chord = 0.5 - 0.2 * Math.min(1, w / 0.6) - 0.16 * Math.max(0, (w - 0.6) / 0.4);
      const prim = Math.min(1, Math.max(0, (w - 0.5) / 0.4));
      const cl: V3 = [grey[0] + (dark[0] - grey[0]) * prim * 0.55, grey[1] + (dark[1] - grey[1]) * prim * 0.55, grey[2] + (dark[2] - grey[2]) * prim * 0.55];
      const ct: V3 = [grey[0] + (dark[0] - grey[0]) * (0.25 + 0.7 * prim), grey[1] + (dark[1] - grey[1]) * (0.25 + 0.7 * prim), grey[2] + (dark[2] - grey[2]) * (0.25 + 0.7 * prim)];
      this.vert([x, 0, lead], [0, 1, 0], cl, w, side);
      this.vert([x, 0, lead - chord], [0, 1, 0], ct, w, side);
    }
    for (let k = 0; k < ws.length - 1; k++) {
      const a = base + k * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
}

function buildCraneGeometry(): THREE.BufferGeometry {
  const m = new MeshBuilder();
  const grey: V3 = [0.22, 0.23, 0.26];
  const dark: V3 = [0.05, 0.052, 0.06];
  const pale: V3 = [0.42, 0.42, 0.4];
  const red: V3 = [0.62, 0.07, 0.07];
  // body: a long ellipsoid, a little lighter underneath
  m.ellipsoid([0, 0, -0.05], [0.12, 0.13, 0.42], 8, 6, (n) => [grey[0] * (0.88 + 0.12 * n[1]), grey[1] * (0.88 + 0.12 * n[1]), grey[2] * (0.88 + 0.12 * n[1])]);
  // neck: long, straight, thin
  m.tube([0, 0.05, 0.36], [0, 0.07, 0.96], 0.042, 0.03, 5, grey, pale);
  // head with a red crown, and a dark bill
  m.ellipsoid([0, 0.07, 1.02], [0.045, 0.05, 0.085], 6, 4, (n) => (n[1] > 0.25 ? red : pale));
  m.tube([0, 0.065, 1.09], [0, 0.058, 1.3], 0.024, 0.004, 4, dark, dark);
  // legs trailing behind the tail
  for (const s of [-1, 1]) m.tube([s * 0.05, -0.12, -0.34], [s * 0.065, -0.2, -1.18], 0.017, 0.011, 3, dark, dark);
  m.wingStrip(1, grey, dark);
  m.wingStrip(-1, grey, dark);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(m.wing, 2));
  g.setIndex(m.idx);
  return g;
}

const VERT = /* glsl */ `
attribute vec2 aWing;
attribute vec3 aPos;
attribute vec4 aHead;   // heading x, heading z, bank, scale
attribute vec4 aMisc;   // wingbeat phase at time 0, rate (rad/s), seed, rust
uniform float uTime;
varying vec3 vN;
varying vec3 vCol;
varying vec3 vWorld;
varying float vRust;

void main() {
  vec3 p = position;
  vec3 n = normal;
  float w = aWing.x;
  float side = aWing.y;
  float phase = aMisc.x + uTime * aMisc.y;
  // slow and deep, with a glide every now and then (the beat dies away, the wings hold a shallow V)
  float glide = smoothstep(0.62, 0.86, sin(uTime * 0.31 + aMisc.z * 6.2831));
  float amp = mix(0.78, 0.12, glide);
  float bob = sin(phase - 0.5) * 0.07 * (1.0 - glide);
  if (side != 0.0) {
    // the shoulder flaps, the outer wing lags behind it and bends more (angle grows toward the tip)
    float lag = sin(phase - w * 1.25);
    float a = amp * lag * (0.2 + 0.8 * w) + 0.1 * w;
    float span = abs(p.x) - 0.1;
    float sa = sin(a), ca = cos(a);
    p.y += span * sa * 1.0;
    p.x = side * (0.1 + span * ca);
    // the tip trails on the downstroke
    p.z -= w * w * 0.12 * (0.5 - 0.5 * lag) * amp;
    n = vec3(-side * sa, ca, 0.0);
  }
  p.y += bob;
  // a little roll
  float bank = aHead.z;
  float cb = cos(bank), sb = sin(bank);
  p = vec3(p.x * cb - p.y * sb, p.x * sb + p.y * cb, p.z);
  n = vec3(n.x * cb - n.y * sb, n.x * sb + n.y * cb, n.z);
  p *= aHead.w;
  // heading: local +z is forward, local x lies along the right-hand side vector (f.z, 0, -f.x)
  vec3 f = vec3(aHead.x, 0.0, aHead.y);
  vec3 r = vec3(f.z, 0.0, -f.x);
  vec3 wp = aPos + r * p.x + vec3(0.0, p.y, 0.0) + f * p.z;
  vN = r * n.x + vec3(0.0, n.y, 0.0) + f * n.z;
  vCol = color;
  vRust = aMisc.w;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vN;
varying vec3 vCol;
varying vec3 vWorld;
varying float vRust;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform float uNight;

void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(cameraPosition - vWorld);
  // the grey of a crane in autumn is stained rusty with iron-rich mud and the summer's wear
  vec3 alb = vCol * mix(vec3(1.0), vec3(1.16, 0.96, 0.8), vRust);
  float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  // thin feathers pass light: against the sun the wings glow
  float back = clamp(dot(-N, L), 0.0, 1.0);
  float fwd = pow(clamp(dot(-V, L), 0.0, 1.0), 4.0);
  vec3 sky = mix(uSkyHorizon, uSkyMid, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = alb * (sky * 0.4 + uLightColor * (0.1 + 0.55 * wrap * wrap) * 0.12);
  col += alb * vec3(1.2, 0.95, 0.65) * uLightColor * back * (0.2 + 0.8 * fwd) * 0.12;
  col *= mix(1.0, 0.35, uNight);
  gl_FragColor = vec4(min(max(col, vec3(0.0)), vec3(32.0)), 1.0);
}`;

// ---- the flock ------------------------------------------------------------------------------------------------
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function rng32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Cranes {
  readonly object3D = new THREE.Group();
  /** Flights in progress (waiting or flying), for tests and debug. */
  get active(): number { return this.flights.length; }
  /** Birds drawn last frame. */
  drawn = 0;

  private mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private aPos: THREE.InstancedBufferAttribute;
  private aHead: THREE.InstancedBufferAttribute;
  private aMisc: THREE.InstancedBufferAttribute;
  private flights: Flight[] = [];
  private count = 0;

  constructor(
    shared: SharedUniforms,
    private camera: THREE.PerspectiveCamera,
    private ground: (x: number, z: number) => number,
  ) {
    const base = buildCraneGeometry();
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    for (const k of ['position', 'normal', 'color', 'aWing']) this.geo.setAttribute(k, base.getAttribute(k));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BIRDS * 3), 3);
    this.aHead = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BIRDS * 4), 4);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BIRDS * 4), 4);
    for (const a of [this.aPos, this.aHead, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aHead', this.aHead);
    this.geo.setAttribute('aMisc', this.aMisc);
    this.geo.instanceCount = 0;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.time,
        uLightDir: shared.lightDir,
        uLightColor: shared.lightColor,
        uSkyMid: shared.skyMid,
        uSkyHorizon: shared.skyHorizon,
        uNight: shared.night,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      vertexColors: true,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'cranes';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    this.object3D.name = 'Cranes';
    this.object3D.add(this.mesh);
  }

  /**
   * Begin a flyover. The route is fixed now from the camera as it is: the screen-space line (x from panFrom to panTo) is cast onto
   * the plane at the flock's altitude. Several flights can overlap (up to three; an older one is dropped for a new one).
   */
  start(spec: CraneFlightSpec): void {
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const world = cam.matrixWorld.clone();
    const projInv = cam.projectionMatrixInverse.clone();
    const planeY = this.ground(camPos.x, camPos.z) + spec.altitude;
    // pick a height on screen where the ray through the middle of the pass really reaches the flock's plane at a sane range:
    // high in the view when we are looking at the sky, lower down when we are above the flock looking down at it
    let ndcY = 0.45;
    let dist = 300;
    let found = false;
    for (const y of [0.5, 0.3, 0.1, -0.1, -0.3, 0.7, -0.5]) {
      const ray = this.ray(world, projInv, camPos, 0, y, _v);
      const dy = ray.y;
      if (Math.abs(dy) < 0.02) continue;
      const t = (planeY - camPos.y) / dy;
      if (t < 40 || t > 800) continue;
      ndcY = y;
      dist = t;
      found = true;
      break;
    }
    if (!found) {
      // the plane is out of reach along every ray (the camera is level with the flock): put the flock 260 m out, at the camera's height plus a rise
      ndcY = 0.4;
      dist = 260;
    }
    const seed = (Math.random() * 1e9) | 0;
    const rnd = rng32(seed);
    const n = Math.max(2, Math.min(24, Math.round(spec.birds)));
    // the V: the leader at the apex, the rest alternating left and right, each rank a step further back and out; a loose skein jitters it
    const loose = 0.35 + 0.5 * rnd();
    const off = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const rank = Math.ceil(i / 2);
      const sideS = i === 0 ? 0 : (i & 1 ? -1 : 1);
      off[i * 6 + 0] = -rank * 1.7 + (rnd() - 0.5) * 1.3 * loose; // along the track, in wingspans (negative is behind)
      off[i * 6 + 1] = sideS * rank * 1.35 + (rnd() - 0.5) * 1.1 * loose; // across the track, in wingspans
      off[i * 6 + 2] = (rnd() - 0.5) * 0.9 * loose; // up
      off[i * 6 + 3] = rnd() * Math.PI * 2;
      off[i * 6 + 4] = 2 * Math.PI * (1.45 + 0.4 * rnd()); // wingbeat rate, rad/s (about 1.5 to 1.9 Hz)
      off[i * 6 + 5] = spec.season === 'autumn' ? 0.45 + 0.55 * rnd() : 0.45 * rnd();
    }
    const scale = Math.min(4.2, Math.max(1.7, dist / 80));
    this.flights.push({ spec: { ...spec }, age: 0, seed, camPos, world, projInv, planeY, ndcY, dist, scale, off });
    while (this.flights.length > MAX_FLIGHTS) this.flights.shift();
  }

  /** Cast the screen point (x, y in NDC) through the saved camera and return the unit direction in `out`. */
  private ray(world: THREE.Matrix4, projInv: THREE.Matrix4, camPos: THREE.Vector3, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(x, y, 0.5).applyMatrix4(projInv).applyMatrix4(world).sub(camPos);
    return out.normalize();
  }

  /** The centre of flight `f` at `t` seconds after its start time (negative: still approaching the screen edge). */
  private centre(f: Flight, t: number, out: THREE.Vector3): THREE.Vector3 {
    const sp = f.spec;
    const u = t / Math.max(1, sp.duration);
    const x = THREE.MathUtils.clamp(sp.panFrom + (sp.panTo - sp.panFrom) * u, -2.4, 2.4);
    const y = f.ndcY + 0.03 * Math.sin(t * 0.21 + f.seed);
    const d = this.ray(f.world, f.projInv, f.camPos, x, y, _a);
    const k = Math.abs(d.y) > 0.02 ? (f.planeY - f.camPos.y) / d.y : f.dist;
    const range = k > 20 && k < 2000 ? k : f.dist;
    return out.copy(f.camPos).addScaledVector(d, range);
  }

  update(dt: number): void {
    if (!this.flights.length) {
      if (this.mesh.visible) { this.mesh.visible = false; this.geo.instanceCount = 0; this.drawn = 0; }
      return;
    }
    let k = 0;
    for (let fi = this.flights.length - 1; fi >= 0; fi--) {
      const f = this.flights[fi];
      f.age += dt;
      const sp = f.spec;
      const pre = 0.16 * sp.duration;
      const t = f.age - sp.delay; // seconds since the flock was at panFrom
      if (t > sp.duration + pre) { this.flights.splice(fi, 1); continue; }
      if (t < -pre) continue; // still out of sight beyond the edge
      // heading from the path itself, flattened to the ground plane
      this.centre(f, t - 0.6, _b);
      this.centre(f, t + 0.6, _v);
      let hx = _v.x - _b.x, hz = _v.z - _b.z;
      const hl = Math.hypot(hx, hz) || 1;
      hx /= hl; hz /= hl;
      this.centre(f, t, _b);
      const cx = _b.x, cy = _b.y, cz = _b.z;
      const rx = hz, rz = -hx; // right-hand side vector of the flock
      const span = 2 * HALF_SPAN * f.scale;
      const n = f.off.length / 6;
      for (let i = 0; i < n && k < MAX_BIRDS; i++, k++) {
        const o = i * 6;
        const seedB = f.off[o + 3] / (Math.PI * 2);
        const along = (f.off[o] + 0.3 * Math.sin(t * 0.37 + f.off[o + 3])) * span;
        const across = (f.off[o + 1] + 0.12 * Math.sin(t * 0.29 + f.off[o + 3] * 2)) * span;
        const up = (f.off[o + 2] + 0.18 * Math.sin(t * 0.43 + f.off[o + 3] * 3)) * span * 0.5;
        this.aPos.setXYZ(k, cx + hx * along + rx * across, cy + up, cz + hz * along + rz * across);
        this.aHead.setXYZ(k, hx, hz, 0.1 * Math.sin(t * 0.33 + f.off[o + 3]));
        this.aHead.setW(k, f.scale);
        this.aMisc.setXYZW(k, f.off[o + 3], f.off[o + 4], seedB, f.off[o + 5]);
      }
    }
    this.drawn = k;
    this.geo.instanceCount = k;
    this.mesh.visible = k > 0;
    if (k > 0) {
      this.aPos.needsUpdate = true;
      this.aHead.needsUpdate = true;
      this.aMisc.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
