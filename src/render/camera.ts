// Drone camera: orbit around a ground target with smooth damping, never under the terrain.
// Left drag orbits, right/middle drag (or shift+left) pans, wheel zooms, WASD/arrows pan, Q/E rotate, R/F tilt.
// Angles in the public API are degrees; pitch is the camera's elevation above the horizon as seen from the
// target (0 = level with the ground, 90 = straight down). Positions are sim meters: x, y map to three (x, z).
import * as THREE from 'three';
import { clamp, smoothstep } from './common';

export type CameraPreset = 'wide' | 'low' | 'top';

interface State { tx: number; tz: number; yaw: number; pitch: number; dist: number; lift: number }

const DEG = Math.PI / 180;
const MIN_PITCH = 1.5 * DEG;
const MAX_PITCH = 89.6 * DEG;
const MIN_DIST = 2.5;
const MAX_DIST = 1500;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export interface DroneCameraOptions {
  /** Terrain height at a world position (works outside the playable square). */
  ground: (x: number, z: number) => number;
  /** World edge length in meters. */
  worldSize: number;
  /** Compass angle (atan2(x, z)) of the key light, used to frame presets with the sun to one side. */
  sunAzimuth?: () => number;
  /** Where the 'low' preset sits: a point on the valley floor, usually beside the creek. */
  lowAnchor?: { x: number; z: number };
}

export class DroneCamera {
  readonly camera: THREE.PerspectiveCamera;
  enabled = true;
  /** Fired on any user camera input (so UI can stop cinematic mode or following). */
  onUserInput: (() => void) | null = null;

  private dom: HTMLElement;
  private opt: DroneCameraOptions;
  private goal: State;
  private cur: State;
  private rate = 4;
  private follower: (() => { x: number; y: number; h?: number } | null) | null = null;
  /** The follower reported a height (a bird in the air): the orbit target rides at that height instead of on the ground. */
  private liftFollow = false;
  // critically damped follow: velocity of the focus point (m/s)
  private vx = 0;
  private vz = 0;
  /** Follow dead zone radius as a fraction of orbit distance (the subject can drift this far from frame center before the camera moves). */
  followDeadzone = 0.055;
  /** Follow smoothing time in seconds: higher = lazier, more cinematic catch-up. */
  followSmoothTime = 0.4;
  private cinematic = false;
  private cinPitch = 0.4;
  private cinT = 0;
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private lastCenter = { x: 0, y: 0 };
  private listeners: Array<() => void> = [];

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, opt: DroneCameraOptions) {
    this.camera = camera;
    this.dom = dom;
    this.opt = opt;
    const c = opt.worldSize / 2;
    this.goal = { tx: c, tz: c, yaw: 0.8, pitch: 25 * DEG, dist: 400, lift: 0 };
    this.cur = { ...this.goal };
    this.bind();
    this.preset('wide', true);
  }

  // ------------------------------------------------------------ public API

  /** Smoothly move the focus to sim position (x, y). Optional distance in meters and pitch in degrees. */
  flyTo(x: number, y: number, distance?: number, pitchDeg?: number): void {
    this.goal.tx = clamp(x, 0, this.opt.worldSize);
    this.goal.tz = clamp(y, 0, this.opt.worldSize);
    if (distance !== undefined) this.goal.dist = clamp(distance, MIN_DIST, MAX_DIST);
    if (pitchDeg !== undefined) this.goal.pitch = clamp(pitchDeg * DEG, MIN_PITCH, MAX_PITCH);
    this.goal.lift = this.goal.dist < 60 ? 1.0 : 0;
    this.rate = 2.4;
  }

  /** Keep a moving subject framed. Pass null to stop following. */
  follow(getPos: (() => { x: number; y: number; h?: number } | null) | null): void {
    this.follower = getPos;
    if (getPos) this.rate = 3.5;
    else this.releaseLift();
  }

  /** `h`, when the follower gives it, is the world height of the subject: a bird in the air is framed at its own height, not at the ground under it. */
  private releaseLift(): void {
    if (!this.liftFollow) return;
    this.liftFollow = false;
    this.goal.lift = this.goal.dist < 60 ? 1.0 : 0;
  }

  isFollowing(): boolean { return this.follower !== null; }

  setCinematic(on: boolean): void {
    this.cinematic = on;
    this.cinPitch = this.goal.pitch;
    this.cinT = 0;
  }

  isCinematic(): boolean { return this.cinematic; }

  /** Start the next smooth move slowly and let it build (an operator's ease-in), instead of leaving at full speed. */
  easeIn(): void { this.moveT = 0; this.rate = Math.min(this.rate, 2); }
  private moveT = 1e9;

  /** A slow, steady orbit while time is fast-forwarding and nobody is steering (0 = off), in radians per second. */
  idleDrift = 0;
  private lastInputT = -1e9;
  private clockT = 0;

  preset(name: CameraPreset, snap = false): void {
    const c = this.opt.worldSize / 2;
    const sunAz = this.opt.sunAzimuth ? this.opt.sunAzimuth() : 1.6;
    this.follower = null;
    if (name === 'wide') {
      // high oblique valley overview: camera over the rim, sun about 38 degrees to the left of the view direction
      const fwd = sunAz - 38 * DEG;
      this.goal = { tx: c + 6, tz: c, yaw: fwd + Math.PI, pitch: 21 * DEG, dist: 410, lift: 0 };
    } else if (name === 'low') {
      const a = this.opt.lowAnchor ?? { x: c, z: c };
      const fwd = sunAz - 22 * DEG;
      this.goal = { tx: a.x, tz: a.z, yaw: fwd + Math.PI, pitch: 5 * DEG, dist: 16, lift: 1.2 };
    } else {
      // map view: x runs right, sim y runs down the screen (matches the vegetation texture's row order)
      this.goal = { tx: c, tz: c, yaw: 0, pitch: MAX_PITCH, dist: 690, lift: 0 };
    }
    this.rate = 2.2;
    if (snap) this.snap();
  }

  /** Jump to the goal immediately, no smoothing. */
  snap(): void {
    this.vx = this.vz = 0;
    this.cur = { ...this.goal };
    this.apply();
  }

  /** The point the camera orbits, in three coordinates. */
  getFocus(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.cur.tx, this.opt.ground(this.cur.tx, this.cur.tz) + this.cur.lift, this.cur.tz);
  }

  get distance(): number { return this.cur.dist; }
  get pitchDeg(): number { return this.cur.pitch / DEG; }
  get yawDeg(): number { return this.cur.yaw / DEG; }

  /** Directly set orbit parameters (degrees); smooth unless snap is true. */
  setView(opts: { x?: number; y?: number; yawDeg?: number; pitchDeg?: number; distance?: number; h?: number }, snap = false): void {
    if (opts.x !== undefined) this.goal.tx = opts.x;
    if (opts.y !== undefined) this.goal.tz = opts.y;
    // h: world height of the subject (a bird in the air), so a cut to it starts framed on the bird, not on the ground under it
    if (opts.h !== undefined) { this.liftFollow = true; this.goal.lift = Math.max(0, opts.h - this.opt.ground(this.goal.tx, this.goal.tz)); }
    if (opts.yawDeg !== undefined) this.goal.yaw = opts.yawDeg * DEG;
    if (opts.pitchDeg !== undefined) this.goal.pitch = clamp(opts.pitchDeg * DEG, MIN_PITCH, MAX_PITCH);
    if (opts.distance !== undefined) this.goal.dist = clamp(opts.distance, MIN_DIST, MAX_DIST);
    if (snap) this.snap();
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    const g = this.goal, c = this.cur;

    // keyboard
    if (this.enabled && this.keys.size) {
      const fast = this.keys.has('shift') ? 3 : 1;
      let f = 0, r = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) f += 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) f -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) r += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) r -= 1;
      if (f || r) {
        this.panBy(r * g.dist * 0.7 * fast * dt, f * g.dist * 0.7 * fast * dt);
        this.userInput(true);
      }
      let yaw = 0, tilt = 0;
      if (this.keys.has('q')) yaw += 1;
      if (this.keys.has('e')) yaw -= 1;
      if (this.keys.has('r')) tilt += 1;
      if (this.keys.has('f')) tilt -= 1;
      if (yaw || tilt) {
        g.yaw += yaw * 0.9 * dt;
        g.pitch = clamp(g.pitch + tilt * 0.6 * dt, MIN_PITCH, MAX_PITCH);
        this.userInput(false);
      }
    }

    if (this.follower) {
      const p = this.follower();
      if (p && p.h !== undefined) {
        this.liftFollow = true;
        g.lift = Math.max(0, p.h - this.opt.ground(p.x, p.y));
      } else this.releaseLift();
      if (p) {
        // dead zone: the goal only moves once the subject leaves a small circle around it, and then only just enough
        // to keep the subject on the circle's edge, so small wanders do not jiggle the frame
        const dx = p.x - g.tx, dz = p.y - g.tz;
        const d = Math.hypot(dx, dz);
        const dzr = clamp(c.dist * this.followDeadzone, 0.8, 9);
        if (d > dzr) { const f = 1 - dzr / d; g.tx += dx * f; g.tz += dz * f; }
      }
    }

    this.clockT += dt;
    if (this.idleDrift > 0 && !this.cinematic && !this.follower && this.clockT - this.lastInputT > 6) {
      // ease in over a few seconds so the pan never starts with a jolt
      g.yaw += dt * this.idleDrift * Math.min(1, (this.clockT - this.lastInputT - 6) / 4);
    }
    if (this.cinematic) {
      this.cinT += dt;
      g.yaw += dt * 0.035;
      g.pitch = clamp(this.cinPitch + Math.sin(this.cinT * 0.11) * 0.06, MIN_PITCH, MAX_PITCH);
      if (!this.follower) {
        // a lazy drift across the valley
        g.tx += Math.cos(this.cinT * 0.037 + 1.0) * dt * g.dist * 0.012;
        g.tz += Math.sin(this.cinT * 0.029) * dt * g.dist * 0.012;
      }
    }

    this.moveT += dt;
    const ramp = 0.12 + 0.88 * smoothstep(0, 2.2, this.moveT);
    const k = 1 - Math.exp(-dt * this.rate * ramp);
    if (this.follower) {
      // critically damped spring toward the goal (smooth catch-up, no overshoot), instead of an exponential chase
      const st = Math.max(0.05, this.followSmoothTime);
      const om = 2 / st;
      const x = om * dt;
      const ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      let ox = c.tx - g.tx, oz = c.tz - g.tz;
      const tx = (this.vx + om * ox) * dt, tz = (this.vz + om * oz) * dt;
      this.vx = (this.vx - om * tx) * ex;
      this.vz = (this.vz - om * tz) * ex;
      ox = (ox + tx) * ex; oz = (oz + tz) * ex;
      c.tx = g.tx + ox; c.tz = g.tz + oz;
    } else {
      this.vx = this.vz = 0;
      c.tx += (g.tx - c.tx) * k;
      c.tz += (g.tz - c.tz) * k;
    }
    c.yaw += wrapAngle(g.yaw - c.yaw) * k;
    c.pitch += (g.pitch - c.pitch) * k;
    c.dist += (g.dist - c.dist) * k;
    c.lift += (g.lift - c.lift) * k;
    this.apply();
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
  }

  // ------------------------------------------------------------ internals

  private apply(): void {
    const c = this.cur;
    const ty = this.opt.ground(c.tx, c.tz) + c.lift;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    let px = c.tx + c.dist * cp * Math.sin(c.yaw);
    let pz = c.tz + c.dist * cp * Math.cos(c.yaw);
    let py = ty + c.dist * sp;
    // Near the ground the camera stays inside the world: the grass layer stops at the world edge, and a low camera that
    // peeks over it sees a hard line where blades end. High cameras may leave the square (map view, wide overview).
    const S = this.opt.worldSize;
    const low = 1 - smoothstep(35, 90, py - this.opt.ground(px, pz));
    if (low > 0) {
      const m = 6;
      px = px + (clamp(px, m, S - m) - px) * low;
      pz = pz + (clamp(pz, m, S - m) - pz) * low;
    }
    const floor = this.opt.ground(px, pz) + 1.6;
    if (py < floor) py = floor;
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(c.tx, ty, c.tz);
  }

  private panBy(right: number, forward: number): void {
    const g = this.goal;
    const sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
    // forward on the ground is away from the camera; right is its screen-right
    g.tx += right * cy - forward * sy;
    g.tz += -right * sy - forward * cy;
    g.tx = clamp(g.tx, 0, this.opt.worldSize);
    g.tz = clamp(g.tz, 0, this.opt.worldSize);
  }

  private userInput(cancelFollow: boolean): void {
    this.rate = 11;
    this.moveT = 1e9;
    if (cancelFollow && this.follower) { this.follower = null; this.releaseLift(); }
    this.lastInputT = this.clockT;
    this.onUserInput?.();
  }

  private bind(): void {
    const dom = this.dom;
    const on = (el: HTMLElement | Window, ev: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn, opts);
      this.listeners.push(() => el.removeEventListener(ev, fn, opts));
    };

    on(dom, 'contextmenu', (e: Event) => e.preventDefault());
    on(dom, 'pointerdown', (e: PointerEvent) => {
      if (!this.enabled) return;
      dom.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.lastCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });
    on(dom, 'pointerup', (e: PointerEvent) => { this.pointers.delete(e.pointerId); });
    on(dom, 'pointercancel', (e: PointerEvent) => { this.pointers.delete(e.pointerId); });
    on(dom, 'pointermove', (e: PointerEvent) => {
      if (!this.enabled) return;
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = this.goal;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (this.lastPinch > 0) g.dist = clamp(g.dist * (this.lastPinch / Math.max(d, 1)), MIN_DIST, MAX_DIST);
        const s = g.dist * 0.0012;
        this.panBy(-(cx - this.lastCenter.x) * s, (cy - this.lastCenter.y) * s);
        this.lastPinch = d;
        this.lastCenter = { x: cx, y: cy };
        this.userInput(true);
        return;
      }
      if (this.pointers.size !== 1) return;
      const panDrag = (e.buttons & 2) !== 0 || (e.buttons & 4) !== 0 || ((e.buttons & 1) !== 0 && e.shiftKey);
      if (panDrag) {
        const s = g.dist * 0.0011;
        this.panBy(-dx * s, dy * s);
        this.userInput(true);
      } else if ((e.buttons & 1) !== 0 || e.pointerType === 'touch') {
        g.yaw -= dx * 0.0052;
        g.pitch = clamp(g.pitch + dy * 0.0042, MIN_PITCH, MAX_PITCH);
        this.userInput(false);
      }
    });
    on(dom, 'wheel', (e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      const g = this.goal;
      g.dist = clamp(g.dist * Math.exp(e.deltaY * 0.0011), MIN_DIST, MAX_DIST);
      this.userInput(false);
    }, { passive: false });

    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.key.toLowerCase());
      if (e.shiftKey) this.keys.add('shift');
    });
    on(window, 'keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
      if (!e.shiftKey) this.keys.delete('shift');
    });
    on(window, 'blur', () => { this.keys.clear(); });
  }
}
