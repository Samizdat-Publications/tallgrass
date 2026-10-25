// Drone camera: orbit around a ground target with smooth damping, never under the terrain.
// Left drag orbits, right/middle drag (or shift+left) pans, wheel zooms, WASD/arrows pan, Q/E rotate, R/F tilt.
// Angles in the public API are degrees; pitch is the camera's elevation above the horizon as seen from the
// target (0 = level with the ground, 90 = straight down). Positions are sim meters: x, y map to three (x, z).
import * as THREE from 'three';
import { clamp, smoothstep } from './common';
import { CameraObstacles, type TreeSource } from './camcollide';

export type CameraPreset = 'wide' | 'low' | 'top';

interface State { tx: number; tz: number; yaw: number; pitch: number; dist: number; lift: number }

const DEG = Math.PI / 180;
const MIN_PITCH = 1.5 * DEG;
const MAX_PITCH = 89.6 * DEG;
const MIN_DIST = 2.5;
// the valley is 512 m across and the map view sits at 690 m: further out it shrinks to a small square in the haze
const MAX_DIST = 900;
/**
 * Clearance (m) the camera keeps from a crown or trunk. The near plane is 0.25 to 0.65 m at tree height, so this keeps leaves out of the lens.
 * It was 1.5 m; a video review found the camera "pushing through the canopy": at 1 to 1.5 m from the leaves a lump of foliage fills the whole
 * frame and the hollow shell shows, so the standoff is wide enough that the canopy reads as a canopy.
 */
const TREE_MARGIN = 2.2;
/** The berth the avoidance decisions use (so the swing round a tree starts before the camera is anywhere near its limit). */
const DECIDE_MARGIN = 4.5;
/** The boom (target to camera) is clear when this much of it is; beyond that it is shortened or swung. */
const CLEAR = 0.97;
/** Below this clear fraction the subject is taken to be deep in a grove (see reachEff). */
const DEEP = 0.5;
/** How fast (rad/s) the camera lets go of a crown it was held against (a critically damped spring, so it eases away). */
const RESID_OMEGA = 3.2;
/** A camera held this far (m) from where it wants to be by a crown it cannot get round is cut to the wanted place instead of left stranded. */
const RESID_CUT = 45;
/** How fast (rad/s) the focus height follows the terrain under it. */
const GROUND_OMEGA = 7;
/** How fast (m/s) a camera held back by a crown may catch up, beyond the speed of the point it is heading for. */
const CATCHUP = 30;
const YAW_STEP = 12 * DEG;
/** The camera swings at most this many steps (72 degrees) round a tree: further is a different shot, and it would have to cross the grove. */
const MAX_SWING_STEPS = 6;
const UP_STEP = 12 * DEG;
const MAX_UP = 60 * DEG;
/** The avoidance never lifts the camera above this pitch (it is a crane over the canopy, not a map view). */
const MAX_AVOID_PITCH = 78 * DEG;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Velocity of a critically damped spring (one per animated value). */
interface Vel { v: number }

/**
 * One step of a critically damped spring toward `target` (omega = 2 / smooth time, in rad/s): no overshoot, and the velocity carried
 * in `s` is continuous whatever the target does, so a new target never makes a pop.
 */
function spring(x: number, target: number, s: Vel, omega: number, dt: number): number {
  const e = omega * dt;
  const ex = 1 / (1 + e + 0.48 * e * e + 0.235 * e * e * e);
  const d = x - target;
  const t = (s.v + omega * d) * dt;
  s.v = (s.v - omega * t) * ex;
  return target + (d + t) * ex;
}

/** Keeps `v` in [lo, hi] with a smooth bend over the last `k` metres at each end (equal to `v` inside, the slope continuous, approaching the limit and never past it). */
function softLimit(v: number, lo: number, hi: number, k = 8): number {
  if (v > hi - k) return hi - k * Math.exp(-(v - hi + k) / k);
  if (v < lo + k) return lo + k * Math.exp(-(lo + k - v) / k);
  return v;
}

/** A dead zone with a smooth edge: 0 well inside `dz`, the excess beyond it well outside, and a quadratic blend between (continuous slope). */
function softExcess(d: number, dz: number): number {
  const w = 0.5 * dz, x = d - dz;
  if (x <= -w) return 0;
  if (x >= w) return x;
  return ((x + w) * (x + w)) / (4 * w);
}

/**
 * The framing of a followed animal (R-readable): the shot the camera settles into so the subject fills a readable share of the frame.
 * Distance, pitch, yaw and the focus offset all move on their own critically damped springs, so a turn, a sprint or a new subject never
 * jerks the picture. The framing yields to the operator: a wheel zoom, an orbit drag or a setView() on a value switches its auto mode off.
 */
export interface FollowFrame {
  /** Orbit distance (m) of the shot at rest. A sprint pulls out by up to `pull` (fraction) so the animal has room to run into. */
  dist: number;
  pull?: number;
  /** Camera elevation above the horizon (degrees): a slightly raised three-quarter view, so the animal is seen against the ground, not the sky. */
  pitchDeg: number;
  /** Height (m) of the look-at point above the ground: the middle of the body. */
  lift: number;
  /** Radians round from straight behind the subject's heading that the camera sits (default 0.6, a three-quarter rear view; about 1.75 is alongside, a little ahead: a tracking shot). */
  side?: number;
  /** Where the subject stands in the frame (normalised device y, default -0.26, the lower middle third): a tracking shot at a rider's eye height wants it nearer the middle. */
  ndcY?: number;
  /** Where the subject stands across the frame (normalised device x, default 0, the middle; negative = left), eased in over about a second: the
   *  animal card on the right sets it so the followed animal stands in the open part of the screen (round 40). */
  ndcX?: number;
  /** How far (rad) the wanted heading may drift from the held one before the camera swings to a new one (default 0.9), and how fast it swings (rad/s of the spring, default 0.55): a tracking shot keeps a tighter, quicker hold. */
  yawBand?: number;
  yawRate?: number;
  /** Rate (rad/s) at which the orbit distance follows a changed `dist` (default 1.3); the director raises it to widen a shot quickly. */
  distRate?: number;
  /** How many times faster than real time the subject is moving (the sim speed): scales the speed limits so a tracking shot can keep up at 10x. Default 1. */
  timeScale?: number;
}

/** The camera sits this far (rad) round from straight behind the subject's heading: a three-quarter rear view. */
const FRAME_SIDE = 0.6;
/** The camera only swings to a new heading once the wanted yaw is this far (rad) from the one it holds, so a wander never turns the shot. */
const FRAME_YAW_BAND = 0.9;
/** Follow smoothing time (s) of the focus point in a framed follow. Short: the feed-forward below removes the steady lag at speed. */
const FRAME_SMOOTH = 0.3;
/** Where the subject sits on screen in a framed follow (normalised device y, negative = below the middle): the lower middle third. */
const FRAME_NDC_Y = -0.26;
/** Terrain clearance (m) a sight line from the camera to the subject must keep, and the pitch steps (rad) tried to find a clear one. */
const OCC_CLEAR = 0.45;
const OCC_STEPS = [0, 7, 14, 22, 31, 41].map((d) => d * DEG);
const OCC_MAX_PITCH = 64 * DEG;

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
  /** The goal after a first, quick spring: the camera chases this, so a goal that jumps (a new shot) reaches the camera as a smooth start (acceleration from zero) instead of a kick. */
  private sm: State;
  private smV = { tx: { v: 0 }, tz: { v: 0 }, yaw: { v: 0 }, pitch: { v: 0 }, dist: { v: 0 }, lift: { v: 0 } };
  private rate = 4;
  private follower: (() => { x: number; y: number; h?: number } | null) | null = null;
  /** The follower reported a height (a bird in the air): the orbit target rides at that height instead of on the ground. */
  private liftFollow = false;
  // critically damped springs: velocities of the focus point (m/s), yaw, pitch (rad/s), orbit distance and lift (m/s)
  private vx: Vel = { v: 0 };
  private vz: Vel = { v: 0 };
  private vyaw: Vel = { v: 0 };
  private vpitch: Vel = { v: 0 };
  private vdist: Vel = { v: 0 };
  private vlift: Vel = { v: 0 };
  /** The ground height under the focus, smoothed: a pan across bumpy ground would otherwise carry every bump into the frame. */
  private gy = 0;
  private vgy: Vel = { v: 0 };
  /** A follower was just set: its first position is checked against the focus (a far subject is cut to, not whipped to). */
  private followFresh = false;
  /** The follow was asked to start with a cut (see follow()). */
  private forceCut = false;
  // framed follow (see FollowFrame): null = the plain follow the director uses
  private frame: FollowFrame | null = null;
  private frameAuto = { dist: true, yaw: true, pitch: true };
  private frameInit = false;
  /** The eased ndcX of the framed follow (see FollowFrame.ndcX). */
  private fNdcX = 0;
  private fPrev = { x: 0, z: 0, ok: false };
  /** The subject's velocity (m/s, world xz), smoothed over ~0.45 s (look-ahead and lag feed-forward) and over ~1 s (the heading the shot is built on). */
  private fv = { x: 0, z: 0 };
  private fh = { x: 0, z: 0 };
  private fSide = 1;
  private fYawT = 0;
  private fYaw = 0; private vfYaw: Vel = { v: 0 };
  private fDist = 0; private vfDist: Vel = { v: 0 };
  private fPitch = 0; private vfPitch: Vel = { v: 0 };
  /** Rise (rad) added to the pitch so the subject is not hidden behind a rise in the ground, its target and the spring that follows it. */
  private occT = 0; private occ = 0; private vocc: Vel = { v: 0 };
  private occTimer = 0; private occLowFor = 0;
  private fSideSet = false;
  /** How far (in orbit distances) the focus is from where the framed shot wants it: a subject that bursts away tightens the chase. */
  private fErr = 0;
  private fLostT = 0;
  // tree and terrain avoidance (the boom is shortened, or swung round the tree, when a crown or the ground is in the way)
  private obstacles: CameraObstacles | null = null;
  private av = { off: 0, offT: 0, up: 0, upT: 0, boom: 1, boomT: 1, timer: 0 };
  private voff: Vel = { v: 0 };
  private vup: Vel = { v: 0 };
  private vboom: Vel = { v: 0 };
  /** Frames the last-resort displacement out of a crown was in use (zero when the boom logic kept the camera clear by itself). */
  avoidPushes = 0;
  private pushT = { x: 0, y: 0, z: 0 };
  private lastP = { x: 0, y: 0, z: 0 };
  private lastD = { x: 0, y: 0, z: 0 };
  private resid = { x: 0, y: 0, z: 0 };
  private rvx: Vel = { v: 0 }; private rvy: Vel = { v: 0 }; private rvz: Vel = { v: 0 };
  private frameDt = 0;
  private slideSign = 1;
  private stuckT = 0;
  private hasP = false;
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
    this.sm = { ...this.goal };
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

  /**
   * Keep a moving subject framed. Pass null to stop following. `cut` (a framed follow only) goes straight to the framed shot of the
   * subject on the next update, wherever the camera was (an editor's cut), instead of gliding there.
   */
  follow(getPos: (() => { x: number; y: number; h?: number } | null) | null, frame?: FollowFrame, cut = false): void {
    this.follower = getPos;
    this.frame = getPos && frame ? frame : null;
    this.forceCut = cut && !!getPos && !!frame;
    this.frameAuto.dist = this.frameAuto.yaw = this.frameAuto.pitch = true;
    this.frameInit = false;
    this.fPrev.ok = false;
    this.fv.x = this.fv.z = this.fh.x = this.fh.z = 0;
    this.occT = this.occ = this.vocc.v = 0;
    if (getPos) {
      this.rate = 3.5;
      this.followFresh = true;
    } else this.releaseLift();
  }

  /** The framing of the current follow, or null (plain follow, or not following). */
  get followFrame(): FollowFrame | null { return this.follower ? this.frame : null; }

  /** Terrain height at a world position (the camera's own ground function). */
  groundAt(x: number, z: number): number { return this.opt.ground(x, z); }

  /** Make the camera keep out of the trees of this layer (and off the terrain). Pass null to turn it off. */
  setObstacles(src: TreeSource | null): void {
    this.obstacles = src ? new CameraObstacles(src, this.opt.ground) : null;
    this.avoid(0, true);
  }

  /**
   * How much of a boom of `dist` metres at heading `yawDeg` and `pitchDeg` from the ground point (x, y) is free of crowns and trunks,
   * 0..1 (1 without obstacles). For choosing a shot's side: the whole boom is tested, not only the camera end.
   */
  headingReach(x: number, y: number, lift: number, yawDeg: number, pitchDeg: number, dist: number): number {
    if (!this.obstacles) return 1;
    this.obstacles.tick(0);
    return this.obstacles.reach(x, this.opt.ground(x, y) + lift, y, yawDeg * DEG, pitchDeg * DEG, dist, { from: 0.1, margin: TREE_MARGIN + 1 });
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

  /**
   * Cinematic mode's own slow orbit, pitch sway and valley drift (true, the default). The director turns it off for a shot it steers
   * itself: a tracking shot (the framed follow sets the heading and pitch) and a drone move (the director flies the path each frame).
   */
  cinematicAuto = true;

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
    this.frame = null;
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
    this.cutCount++;
    this.hasP = false;
    this.frameDt = 0;
    for (const s of [this.vx, this.vz, this.vyaw, this.vpitch, this.vdist, this.vlift, this.voff, this.vup, this.vboom]) s.v = 0;
    this.cur = { ...this.goal };
    this.sm = { ...this.goal };
    this.gy = this.opt.ground(this.cur.tx, this.cur.tz);
    this.vgy.v = 0;
    this.occ = this.occT = this.vocc.v = 0;
    this.frameInit = false;
    for (const k of Object.values(this.smV)) k.v = 0;
    this.avoid(0, true);
    this.apply();
  }

  /** The point the camera orbits, in three coordinates. */
  getFocus(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.cur.tx, this.gy + this.cur.lift, this.cur.tz);
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
    // (a framed follow hands each value it was steering to whoever sets it)
    if (opts.yawDeg !== undefined) { this.goal.yaw = opts.yawDeg * DEG; this.frameAuto.yaw = false; }
    if (opts.pitchDeg !== undefined) { this.goal.pitch = clamp(opts.pitchDeg * DEG, MIN_PITCH, MAX_PITCH); this.frameAuto.pitch = false; }
    if (opts.distance !== undefined) { this.goal.dist = clamp(opts.distance, MIN_DIST, MAX_DIST); this.frameAuto.dist = false; }
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
        if (yaw) this.frameAuto.yaw = false;
        if (tilt) this.frameAuto.pitch = false;
        this.userInput(false);
      }
    }

    if (this.follower) {
      const p = this.follower();
      const F = this.frame;
      if (p && p.h !== undefined) {
        this.liftFollow = true;
        g.lift = Math.max(0, p.h - this.opt.ground(p.x, p.y));
      } else {
        this.releaseLift();
        if (F) g.lift = F.lift;
      }
      if (p) {
        if (this.followFresh) {
          this.followFresh = false;
          // a subject far from the frame is cut to (an editor's cut), not whipped to across the valley
          if (F && (this.forceCut || Math.hypot(p.x - c.tx, p.y - c.tz) > 120 || c.dist > 90)) {
            this.forceCut = false;
            // a framed follow from the wide view: cut straight to the framed shot (a glide from 400 m down to 15 m is a flight over the terrain)
            this.frameCut(p, F);
            return; // (snap replaced cur and sm: this frame ends here)
          } else if (Math.hypot(p.x - c.tx, p.y - c.tz) > Math.max(c.dist, g.dist) + 80) {
            this.cutCount++;
            g.tx = c.tx = this.sm.tx = clamp(p.x, 0, this.opt.worldSize); g.tz = c.tz = this.sm.tz = clamp(p.y, 0, this.opt.worldSize);
            this.vx.v = this.vz.v = this.smV.tx.v = this.smV.tz.v = 0;
          }
        }
        // dead zone with a soft edge: the goal moves only by the part of the subject's offset beyond a small circle (blended in, not
        // switched on), so small wanders do not jiggle the frame and the pan never starts or stops with a kink
        let sx = p.x, sz = p.y, dzr = clamp(c.dist * this.followDeadzone, 0.8, 9);
        if (F) {
          const t = this.frameTarget(p, F, dt);
          sx = t.x; sz = t.z;
          dzr = clamp(c.dist * 0.03, 0.4, 3);
        }
        if (F) {
          this.fErr = Math.hypot(sx - c.tx, sz - c.tz) / Math.max(c.dist, 1);
          // a subject that has got far out of the frame and stays there (a takedown carries a wolf, a respawn) is cut to, not chased
          this.fLostT = this.fErr > 1.6 ? this.fLostT + dt : 0;
          if (this.fLostT > 0.6) { this.fLostT = 0; this.frameCut(p, F); return; }
        }
        const dx = sx - g.tx, dz = sz - g.tz;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) { const e = softExcess(d, dzr) / d; g.tx += dx * e; g.tz += dz * e; }
        if (F) {
          // the sight line to the subject must clear the ground: a rise between the camera and the animal lifts the camera over it
          this.occTimer -= dt;
          if (this.occTimer <= 0) { this.occTimer = 0.12; this.occlusion(p, F); }
        }
      }
    }
    if (!this.follower || !this.frame) this.occT = 0;
    this.occ = spring(this.occ, this.occT, this.vocc, this.occT > this.occ ? 3 : 1.2, dt);

    this.clockT += dt;
    if (this.idleDrift > 0 && !this.cinematic && !this.follower && this.clockT - this.lastInputT > 6) {
      // ease in over a few seconds so the pan never starts with a jolt
      g.yaw += dt * this.idleDrift * Math.min(1, (this.clockT - this.lastInputT - 6) / 4);
    }
    if (this.cinematic) {
      this.cinT += dt;
      if (this.cinematicAuto) {
        g.yaw += dt * 0.035;
        g.pitch = clamp(this.cinPitch + Math.sin(this.cinT * 0.11) * 0.06, MIN_PITCH, MAX_PITCH);
      }
      if (!this.follower && this.cinematicAuto) {
        // a lazy drift across the valley
        g.tx += Math.cos(this.cinT * 0.037 + 1.0) * dt * g.dist * 0.012;
        g.tz += Math.sin(this.cinT * 0.029) * dt * g.dist * 0.012;
      }
    }

    // Everything that moves toward its goal does it on a critically damped spring, so no value ever changes speed abruptly: not when
    // a shot starts, not when the followed animal changes, not when the goal moves. `ramp` is the operator's ease-in after a move starts.
    this.moveT += dt;
    const ramp = 0.12 + 0.88 * smoothstep(0, 2.2, this.moveT);
    // 1.7 matches the spring's settling time to the old exponential chase of the same rate
    const om = Math.max(0.05, this.rate * ramp * 1.7);
    // the focus point: a follower is chased lazily (and the chase starts slower and tightens over the first few seconds of a shot)
    const stretch = this.follower ? 1 + 1.6 * (1 - smoothstep(0, 3.5, this.moveT)) : 1;
    let omF = this.follower ? 2 / (Math.max(0.05, this.frame ? FRAME_SMOOTH : this.followSmoothTime) * stretch) : om;
    // (a framed subject that bursts away from the shot tightens the chase, up to about 4 times)
    if (this.follower && this.frame) omF *= 1 + 3 * smoothstep(0.25, 0.75, this.fErr);
    // the focus speed is capped, smoothly (see maxD below)
    // (a framed follow of a subject moving faster than real time may chase that much faster)
    const tracking = !!(this.follower && this.frame && this.frame.side !== undefined);
    const vmax = Math.max(tracking ? 48 : 28, (tracking ? 2.2 : 1.2) * c.dist) * (this.follower && this.frame ? Math.max(1, this.frame.timeScale ?? 1) : 1);
    // first stage: the goal through a quick spring (3x the camera's own), so the camera's chase starts with zero acceleration
    const sm = this.sm, sv = this.smV, o1 = Math.min(40, 3 * om), o1F = Math.min(40, 3 * omF);
    sm.tx = spring(sm.tx, g.tx, sv.tx, o1F, dt);
    sm.tz = spring(sm.tz, g.tz, sv.tz, o1F, dt);
    sm.yaw = spring(sm.yaw, sm.yaw + wrapAngle(g.yaw - sm.yaw), sv.yaw, o1, dt);
    sm.pitch = spring(sm.pitch, g.pitch, sv.pitch, o1, dt);
    // (a tracking shot that has to widen to keep two animals in frame does it quickly, not at the pace of a glide)
    const omd = this.follower && this.frame?.distRate ? Math.max(om, this.frame.distRate * 1.6) : om;
    sm.dist = spring(sm.dist, g.dist, sv.dist, Math.min(40, 3 * omd), dt);
    sm.lift = spring(sm.lift, g.lift, sv.lift, o1, dt);
    // second stage: the camera. The focus speed is capped (smoothly: the chase is toward a point at most L away, which gives a cruising
    // speed of omega * L / 2).
    const maxD = (2 * vmax) / omF;
    let ex = c.tx - sm.tx, ez = c.tz - sm.tz;
    const el = Math.hypot(ex, ez);
    if (el > maxD) { ex *= maxD / el; ez *= maxD / el; }
    c.tx = spring(c.tx, c.tx - ex, this.vx, omF, dt);
    c.tz = spring(c.tz, c.tz - ez, this.vz, omF, dt);
    c.yaw = spring(c.yaw, c.yaw + wrapAngle(sm.yaw - c.yaw), this.vyaw, om, dt);
    c.pitch = clamp(spring(c.pitch, sm.pitch, this.vpitch, om, dt), MIN_PITCH, MAX_PITCH);
    c.dist = clamp(spring(c.dist, sm.dist, this.vdist, omd, dt), MIN_DIST, MAX_DIST);
    c.lift = spring(c.lift, sm.lift, this.vlift, om, dt);
    this.gy = spring(this.gy, this.opt.ground(c.tx, c.tz), this.vgy, GROUND_OMEGA, dt);
    this.avoid(dt, false);
    this.frameDt = dt;
    this.apply();
    const log = this.debugLog;
    if (log) {
      const p = this.camera.position, f = this.getFocus(this.logFocus);
      // stride 11: clock, dt, camera xyz, focus xyz, cut counter (snap() calls so far), boom fraction, yaw swing (deg)
      log.push(this.clockT, dt, p.x, p.y, p.z, f.x, f.y, f.z, this.cutCount, this.av.boom, this.av.off / DEG);
    }
  }

  /** An editor's cut to the framed shot of the subject (standing where it belongs in the frame at once), keeping the heading the shot has. */
  private frameCut(p: { x: number; y: number }, F: FollowFrame): void {
    const g = this.goal, D = F.dist, pch = F.pitchDeg * DEG;
    const phi = Math.atan(-(F.ndcY ?? FRAME_NDC_Y) * Math.tan((this.camera.fov * DEG) / 2));
    const a = clamp(D * Math.cos(pch) - (D * Math.sin(pch)) / Math.tan(pch + phi), 0, 0.5 * D);
    g.tx = clamp(p.x - Math.sin(g.yaw) * a, 0, this.opt.worldSize);
    g.tz = clamp(p.y - Math.cos(g.yaw) * a, 0, this.opt.worldSize);
    g.dist = D; g.pitch = pch; g.lift = F.lift;
    this.fLostT = 0;
    this.snap();
  }

  /**
   * The focus point of a framed follow, and (as a side effect) the springs that steer the shot: distance (a sprint pulls out), pitch,
   * and yaw (a three-quarter rear view of the heading, retargeted only when the heading has turned well away). The point is the subject
   * pushed ahead along the camera's view (so the animal stands in the lower middle third of the frame, not dead centre), plus a look-ahead
   * along its travel, plus a feed-forward of its velocity over the chase's lag so a galloping animal is not left behind.
   */
  private frameTarget(p: { x: number; y: number }, F: FollowFrame, dt: number): { x: number; z: number } {
    const g = this.goal, c = this.cur, fv = this.fv, fh = this.fh;
    if (this.fPrev.ok && dt > 1e-4) {
      let vx = (p.x - this.fPrev.x) / dt, vz = (p.y - this.fPrev.z) / dt;
      if (Math.hypot(vx, vz) > 80 * Math.max(1, F.timeScale ?? 1)) vx = vz = 0; // a jump (a respawn, a cut), not a speed
      const k1 = 1 - Math.exp(-dt / 0.4), k2 = 1 - Math.exp(-dt / 1.0);
      fv.x += (vx - fv.x) * k1; fv.z += (vz - fv.z) * k1;
      fh.x += (vx - fh.x) * k2; fh.z += (vz - fh.z) * k2;
    }
    this.fPrev.x = p.x; this.fPrev.z = p.y; this.fPrev.ok = true;
    const speed = Math.hypot(fv.x, fv.z), hs = Math.hypot(fh.x, fh.z);
    if (!this.frameInit) {
      this.frameInit = true;
      this.fDist = g.dist; this.vfDist.v = 0;
      this.fPitch = g.pitch; this.vfPitch.v = 0;
      this.fYaw = this.fYawT = g.yaw; this.vfYaw.v = 0;
      this.fSideSet = false;
    }
    // distance: the shot's own, pulled out a little in a sprint
    const spK = smoothstep(3, 14, Math.min(speed, 30));
    if (this.frameAuto.dist) {
      this.fDist = spring(this.fDist, F.dist * (1 + (F.pull ?? 0.25) * spK), this.vfDist, F.distRate ?? 1.3, dt);
      g.dist = clamp(this.fDist, MIN_DIST, MAX_DIST);
    } else { this.fDist = g.dist; this.vfDist.v = 0; }
    if (this.frameAuto.pitch) {
      this.fPitch = spring(this.fPitch, F.pitchDeg * DEG, this.vfPitch, 1.4, dt);
      g.pitch = clamp(this.fPitch, MIN_PITCH, MAX_PITCH);
    } else { this.fPitch = g.pitch; this.vfPitch.v = 0; }
    // yaw: behind and to one side of where the subject is heading (the side nearest to where the camera already is, kept for the whole follow)
    if (hs > 2.2) { // (a grazer's wander has a smoothed velocity well under this: the shot only turns for a subject that is going somewhere)
      const base = Math.atan2(-fh.x, -fh.z);
      const sd = F.side ?? FRAME_SIDE;
      if (!this.fSideSet) {
        this.fSideSet = true;
        this.fSide = Math.abs(wrapAngle(base + sd - g.yaw)) <= Math.abs(wrapAngle(base - sd - g.yaw)) ? 1 : -1;
        this.fYawT = base + this.fSide * sd;
      } else {
        const want = base + this.fSide * sd;
        if (Math.abs(wrapAngle(want - this.fYawT)) > (F.yawBand ?? FRAME_YAW_BAND)) this.fYawT = want;
      }
    }
    if (this.frameAuto.yaw) {
      this.fYaw = spring(this.fYaw, this.fYaw + wrapAngle(this.fYawT - this.fYaw), this.vfYaw, F.yawRate ?? 0.55, dt);
      g.yaw = this.fYaw;
    } else { this.fYaw = this.fYawT = g.yaw; this.vfYaw.v = 0; }
    // where the focus goes
    const D = c.dist, pch = this.pitchNow();
    const phi = Math.atan(-(F.ndcY ?? FRAME_NDC_Y) * Math.tan((this.camera.fov * DEG) / 2));
    const a = clamp(D * Math.cos(pch) - (D * Math.sin(pch)) / Math.tan(pch + phi), 0, 0.5 * D);
    const yaw = c.yaw + this.av.off;
    let ox = -Math.sin(yaw) * a, oz = -Math.cos(yaw) * a;
    if (speed > 0.6) {
      // (r-cuts: the look-ahead and the lag feed-forward fade in over 0.6 to 1.4 m/s. They used to switch on at 0.6, which moved the target by
      // most of a metre in one frame whenever a wandering animal crossed that speed, and the picture ticked)
      const on = smoothstep(0.6, 1.4, speed);
      const lead = Math.min(speed * 0.3, 0.14 * D) * on;
      ox += (fv.x / speed) * lead; oz += (fv.z / speed) * lead;
      // the chase lags a steady-speed subject by (smoothing time x its stretch) x 4/3 (both springs); feed that distance forward
      const stretch = 1 + 1.6 * (1 - smoothstep(0, 3.5, this.moveT));
      const ff = FRAME_SMOOTH * stretch * (4 / 3) * on;
      ox += fv.x * ff; oz += fv.z * ff;
    }
    // across the frame: the focus slides to the camera's right by the share of the half-width asked for, so the subject stands left of the middle
    this.fNdcX += ((F.ndcX ?? 0) - this.fNdcX) * (1 - Math.exp(-dt / 0.6));
    if (Math.abs(this.fNdcX) > 1e-3) {
      const b = -this.fNdcX * Math.tan((this.camera.fov * DEG) / 2) * this.camera.aspect * D;
      ox += Math.cos(yaw) * b; oz -= Math.sin(yaw) * b;
    }
    const ol = Math.hypot(ox, oz), cap = 0.8 * D * Math.max(1, F.timeScale ?? 1);
    if (ol > cap) { ox *= cap / ol; oz *= cap / ol; }
    return { x: p.x + ox, z: p.y + oz };
  }

  /**
   * Terrain between the camera and a framed subject (a hillside in the way): find the smallest rise of the pitch (rad) whose sight line
   * clears the ground, and make it the target of the rise. It rises at once and comes down only after the way has been clear for a second.
   */
  private occlusion(p: { x: number; y: number }, F: FollowFrame): void {
    const c = this.cur, ground = this.opt.ground;
    const sy = ground(p.x, p.y) + Math.max(0.5, F.lift * 1.1);
    const yaw = c.yaw + this.av.off, fy = this.gy + c.lift, boom = c.dist;
    let rise = OCC_STEPS[OCC_STEPS.length - 1];
    for (const step of OCC_STEPS) {
      const pitch = Math.min(OCC_MAX_PITCH, c.pitch + this.av.up + step);
      const cp = Math.cos(pitch);
      const cx = c.tx + boom * cp * Math.sin(yaw), cz = c.tz + boom * cp * Math.cos(yaw), cy = Math.max(fy + boom * Math.sin(pitch), ground(cx, cz) + 1.6);
      let clear = true;
      for (let i = 1; i <= 14; i++) {
        const t = (i / 14) * 0.92;
        const px = cx + (p.x - cx) * t, pz = cz + (p.y - cz) * t, py = cy + (sy - cy) * t;
        if (py - ground(px, pz) < OCC_CLEAR * (0.35 + 0.65 * (1 - t))) { clear = false; break; }
      }
      if (clear) { rise = step; break; }
      if (c.pitch + this.av.up + step >= OCC_MAX_PITCH) { rise = step; break; }
    }
    if (rise >= this.occT) { this.occT = rise; this.occLowFor = 0; }
    else { this.occLowFor += 0.12; if (this.occLowFor > 1.0) { this.occT = rise; this.occLowFor = 0; } }
  }

  /** Debug: set to an array and every update() appends [clock, dt, px, py, pz, fx, fy, fz, cuts, boom, swingDeg] (stride 11). See tools/camlog.mjs. */
  debugLog: number[] | null = null;
  private logFocus = new THREE.Vector3();
  private cutCount = 0;

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
  }

  // ------------------------------------------------------------ internals

  /** The camera's pitch with the avoidance's rise added (radians). */
  private pitchNow(): number {
    return clamp(this.cur.pitch + this.av.up + this.occ, MIN_PITCH, Math.max(this.cur.pitch + this.occ, MAX_AVOID_PITCH));
  }

  /**
   * Tree avoidance, as a spring arm. Ten times a second the boom (target to camera) is tested against the crowns and
   * trunks around it (only its outer 60%, so a subject standing under a tree is still filmed). If it is blocked the camera takes the
   * cheapest way round: pull the boom in, swing to a clear heading, or rise (a crane up over the canopy when the subject is deep in a
   * grove). The swing, the rise and the boom length are springs, so none of it pops; the boom is quick to pull in and slow to let
   * out again. Whatever the springs lag behind, apply() keeps the camera itself out of every crown (it slides out along the surface).
   * `now` lands on the answer immediately (after a cut).
   */
  private avoid(dt: number, now: boolean): void {
    const ob = this.obstacles, a = this.av, c = this.cur;
    if (!ob) { a.off = a.offT = a.up = a.upT = 0; a.boom = a.boomT = 1; return; }
    ob.tick(dt);
    const ty = this.gy + c.lift;
    a.timer -= dt;
    if (a.timer <= 0 || now) {
      a.timer = 0.1;
      this.avoidDecide(ty);
      if (now) { a.off = a.offT; a.up = a.upT; a.boom = a.boomT; this.voff.v = this.vup.v = this.vboom.v = 0; }
    }
    if (!now && dt > 0) {
      a.off = spring(a.off, a.offT, this.voff, 2 / 1.1, dt);
      a.up = spring(a.up, a.upT, this.vup, 2 / 1.1, dt);
      a.boom = spring(a.boom, a.boomT, this.vboom, a.boomT < a.boom ? 2 / 0.22 : 2 / 1.3, dt);
    }
    a.boom = clamp(a.boom, 0.05, 1);
  }

  /**
   * The clear fraction of a boom (`fl`: the line from the target is free of crowns beyond 40% of its length) and the fraction the camera may
   * use (`eff`). They are the same unless the subject is deep in a grove (`fl` under half): then there is no clear line at any length, so
   * the camera may stand as far out as its own point is clear, looking through the foliage instead of sitting in it.
   */
  private reachEff(tx: number, ty: number, tz: number, yaw: number, pitch: number, len: number, margin: number): { fl: number; eff: number } {
    const ob = this.obstacles!;
    const fl = ob.reach(tx, ty, tz, yaw, pitch, len, { margin });
    return { fl, eff: fl >= DEEP ? fl : Math.max(fl, ob.reachPoint(tx, ty, tz, yaw, pitch, len, { margin })) };
  }

  private avoidDecide(ty: number): void {
    const ob = this.obstacles!, a = this.av, c = this.cur;
    const fmin = Math.min(1, Math.max(0.12, 3 / c.dist));
    // Decisions look further out than the camera must keep (a wider berth, so the swing starts before the hard limit is reached) and,
    // when the focus is moving, a little ahead in time (where it will be in half a second: the subject runs past trees).
    const sx = clamp(this.vx.v * 0.5, -30, 30), sz = clamp(this.vz.v * 0.5, -30, 30);
    const ahead = Math.hypot(sx, sz) > 1.2;
    const px = c.tx + sx, pz = c.tz + sz, pty = this.opt.ground(px, pz) + c.lift;
    // quality of a heading and rise: the clear fraction of the boom, and with it how much of it the camera may use (see reachEff)
    const Q = (off: number, up: number) => {
      const pitch = clamp(c.pitch + up, MIN_PITCH, Math.max(c.pitch, MAX_AVOID_PITCH));
      const q = this.reachEff(c.tx, ty, c.tz, c.yaw + off, pitch, c.dist, DECIDE_MARGIN);
      if (ahead) {
        const q2 = this.reachEff(px, pty, pz, c.yaw + off, pitch, c.dist, DECIDE_MARGIN);
        if (q2.fl < q.fl) q.fl = q2.fl;
        if (q2.eff < q.eff) q.eff = q2.eff;
      }
      return q;
    };
    const R = (off: number, up: number) => Q(off, up).eff;
    const q0 = Q(0, 0), r0 = q0.eff;
    if (q0.fl >= CLEAR) {
      // clear dead ahead: unwind the rise, then the swing, one step at a time and only while each step is clear too
      let o = a.offT, u = a.upT;
      if (u > 0) { const cand = Math.max(0, u - UP_STEP); if (R(o, cand) >= CLEAR) u = cand; }
      else if (o !== 0) { const cand = o > 0 ? Math.max(0, o - YAW_STEP) : Math.min(0, o + YAW_STEP); if (R(cand, u) >= CLEAR) o = cand; }
      a.offT = o; a.upT = u;
      const r = o === 0 && u === 0 ? 1 : R(o, u);
      a.boomT = r >= CLEAR ? 1 : Math.max(fmin, r);
      return;
    }
    // Blocked: the cheapest of "pull in", "swing a little and pull in less", "swing round", "rise over". Swinging and rising cost more
    // than shortening, and changing course costs more than keeping the course already taken, so the camera does not dither.
    const cost = (q: { fl: number; eff: number }, o: number, u: number) => (1 - q.eff) + 0.2 * (1 - Math.min(q.fl, CLEAR)) + (1.8 * Math.abs(o)) / Math.PI + (0.9 * u) / (Math.PI / 2) + (0.35 * Math.abs(o - a.offT)) / Math.PI + (0.35 * Math.abs(u - a.upT)) / (Math.PI / 2);
    let bo = 0, bu = 0, bestR = r0, bestCost = cost(q0, 0, 0);
    for (let k = -MAX_SWING_STEPS; k <= MAX_SWING_STEPS; k++) {
      if (k === 0) continue;
      const o = k * YAW_STEP, q = Q(o, 0), cs = cost(q, o, 0);
      if (cs < bestCost) { bestCost = cs; bo = o; bu = 0; bestR = q.eff; }
    }
    if (bestR < 0.9) {
      // too closed in by sideways moves alone: try rising, at the headings most likely to open up (straight, a little off, well off)
      for (let u = UP_STEP; u <= MAX_UP; u += UP_STEP) {
        for (const o of [0, 2 * YAW_STEP, -2 * YAW_STEP, 4 * YAW_STEP, -4 * YAW_STEP, a.offT]) {
          const q = Q(o, u), cs = cost(q, o, u);
          if (cs < bestCost) { bestCost = cs; bo = o; bu = u; bestR = q.eff; }
        }
      }
    }
    a.offT = bo; a.upT = bu;
    a.boomT = bestR >= CLEAR ? 1 : Math.max(fmin, bestR);
  }

  private apply(): void {
    const c = this.cur;
    const ty = this.gy + c.lift;
    const pitch = this.pitchNow();
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const yaw = c.yaw + this.av.off, boom = c.dist * this.av.boom;
    let px = c.tx + boom * cp * Math.sin(yaw);
    let pz = c.tz + boom * cp * Math.cos(yaw);
    let py = ty + boom * sp;
    // Near the ground the camera stays inside the world: the grass layer stops at the world edge, and a low camera that
    // peeks over it sees a hard line where blades end. High cameras may leave the square (map view, wide overview).
    const S = this.opt.worldSize;
    const low = 1 - smoothstep(35, 90, py - this.opt.ground(px, pz));
    if (low > 0) {
      // (r-cuts: a soft edge, not a wall. The hard clamp stopped a camera that was gliding at 80 m/s dead on the edge, a kick in the picture;
      // now the position eases onto the same limit, with the same slope where it starts to bend)
      const m = 6;
      px = px + (softLimit(px, m, S - m) - px) * low;
      pz = pz + (softLimit(pz, m, S - m) - pz) * low;
    }
    const floor = this.opt.ground(px, pz) + 1.6;
    if (py < floor) py = floor;
    const ob = this.obstacles;
    if (ob) {
      // Last line of defence: wherever the springs have left the camera, it may not be inside a crown or trunk. The camera is the wanted
      // position plus a residual (how far collision has held it from there); the residual relaxes on a critically damped spring, and the
      // camera moves from where it was toward where that puts it, sliding out of whatever it meets (a few short steps, never through a
      // crown). So nothing pops: not when a crown blocks the way, and not when it lets go. The avoidance above, which sees a crown
      // coming, mostly keeps the camera from having to slide at all.
      const o = this.pushT, last = this.lastP, r = this.resid, dt = this.frameDt;
      const r0x = r.x, r0y = r.y, r0z = r.z;
      const dx0 = px, dy0 = py, dz0 = pz;
      const minY = (x: number, z: number) => this.opt.ground(x, z) + 1.6;
      let slid = false;
      if (this.hasP && Math.hypot(r.x, r.y, r.z) < RESID_CUT) {
        if (dt > 0) {
          r.x = spring(r.x, 0, this.rvx, RESID_OMEGA, dt); r.y = spring(r.y, 0, this.rvy, RESID_OMEGA, dt); r.z = spring(r.z, 0, this.rvz, RESID_OMEGA, dt);
        }
        // the camera may not travel faster than the wanted point does, plus a modest catch-up (so a crown that lets go of it does not fling it)
        let tx = px + r.x, ty2 = py + r.y, tz = pz + r.z;
        const cap = Math.hypot(px - this.lastD.x, py - this.lastD.y, pz - this.lastD.z) * 1.05 + CATCHUP * dt;
        const want = Math.hypot(tx - last.x, ty2 - last.y, tz - last.z);
        if (want > cap && want > 1e-6) { const k = cap / want; tx = last.x + (tx - last.x) * k; ty2 = last.y + (ty2 - last.y) * k; tz = last.z + (tz - last.z) * k; }
        const stuck = ob.sweep(last, tx, ty2, tz, TREE_MARGIN * 0.8, minY, this.stuckT > 0.3 ? this.slideSign : 0, o);
        // held against a crown for a while: try going round the other side
        this.stuckT = stuck && Math.hypot(r.x, r.z) > 6 ? this.stuckT + dt : 0;
        if (this.stuckT > 1.4) { this.slideSign = -this.slideSign; this.stuckT = 0.31; }
        slid = true;
      } else {
        // first frame, or held so far from where it wants to be that it will not get there (a crown it cannot get round): a cut
        if (this.hasP) this.cutCount++;
        ob.project(px, py, pz, TREE_MARGIN * 0.8, minY, o);
        this.rvx.v = this.rvy.v = this.rvz.v = 0;
        this.stuckT = 0;
      }
      if (Math.abs(o.x - px) + Math.abs(o.y - py) + Math.abs(o.z - pz) > 1e-4) this.avoidPushes++;
      // the residual's velocity is what it really did (so the spring cannot wind up against a crown that holds the camera)
      const nrx = o.x - px, nry = o.y - py, nrz = o.z - pz;
      if (slid && dt > 0) { this.rvx.v = (nrx - r0x) / dt; this.rvy.v = (nry - r0y) / dt; this.rvz.v = (nrz - r0z) / dt; }
      r.x = nrx; r.y = nry; r.z = nrz;
      this.lastD.x = dx0; this.lastD.y = dy0; this.lastD.z = dz0;
      px = o.x; py = o.y; pz = o.z;
      last.x = px; last.y = py; last.z = pz; this.hasP = true;
    } else this.hasP = false;
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
        this.frameAuto.yaw = this.frameAuto.pitch = false;
        this.userInput(false);
      }
    });
    on(dom, 'wheel', (e: WheelEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      const g = this.goal;
      g.dist = clamp(g.dist * Math.exp(e.deltaY * 0.0011), MIN_DIST, MAX_DIST);
      this.frameAuto.dist = false;
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
