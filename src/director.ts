// Documentary auto-director: in cinematic mode it picks what to film from what is actually happening
// (a hunt, a stampede, ravens over a kill, a herd at golden hour, pronghorn, a vista) and frames it.
//
// R-director3 rules: (1) motion wins: whenever a land animal is running (a chase, a stampede, pronghorn bounding, a mule deer stotting) the
// camera tracks the lead animal from alongside, low and a little ahead, until it stops; (2) a shot shows what it says: a hunt keeps the
// predator and its target in frame (and is dropped when the target is lost), a kill or a raven feeding shot keeps its carcass in frame, and
// a chapter card or caption tied to an event waits until the camera is on that event (eventInView); (3) at 100x, and while skipping,
// animals are a blur, so the camera flies slow, high drone moves over the valley instead and nothing close is filmed.
import * as THREE from 'three';
import type { DroneCamera, FollowFrame } from './render/camera';
import type { CutFx } from './render/cutfx';
import { findChasePrey, followFrameFor } from './render/followframes';
import { AGENT_STRIDE, CARCASS_STRIDE, F_INFECTED, F_MANGE, F_MIGRANT, F_STOT, Sp, St } from './sim/types';
import { SPECIES, isPredator } from './sim/species';

/** A land hunter by the registry (wolf, cougar, later coyote): worth a hunt shot when it is in a chase. Fliers hunt too high and fast to film. */
const isLandHunter = (sp: number): boolean => isPredator(sp) && SPECIES[sp]?.flies === false;

export interface DirectorFrame {
  count: number;
  ids: Uint32Array;
  agents: Float32Array;
  carcassCount: number;
  carcasses: Float32Array;
  dayFrac: number;
  /** The small-prey fields (Snapshot.small: 32 x 32 RGBA, G = prairie dogs, B = town), when the sim sends them. */
  small?: Uint8Array | null;
  /** Sim events since the last frame (the director cuts to immigrants, plague in a town and coyotes taking over). */
  events?: Array<{ tick: number; kind: string; sp: number; x: number; y: number; /** Free-form numbers of the sim event (count, pack age, animal id). */ a?: number; b?: number }>;
  /** The sim speed asked for (0 paused, 1, 10, 100; -1 while skipping to the next event). Absent: 1. */
  speed?: number;
  /** The weather now (Weather enum: 0 clear, 1 rain, 2 drought, 3 storm, 4 snow), so a drone move over a storm lifts its eye to the sky. */
  weather?: number;
}

type ShotKind = 'hunt' | 'run' | 'stampede' | 'ravens' | 'herd' | 'pronghorn' | 'vista' | 'wolves' | 'town' | 'mousing' | 'migration' | 'coyotes' | 'stoop' | 'raptor' | 'kill' | 'moment' | 'drone';

/** How fast the sim runs, as the camera cares: real time, 10x (animals still read), and 100x or a skip (animals are a blur). */
export type SpeedClass = 'real' | 'fast' | 'lapse';
export function speedClass(speed: number | undefined): SpeedClass {
  if (speed === undefined) return 'real';
  if (speed < 0 || speed >= 50) return 'lapse';
  return speed >= 5 ? 'fast' : 'real';
}

/** A raptor in a stoop (St.Chase) this high (m) is worth cutting to: it is a dive of one to six seconds, so the cut has to be quick. */
const STOOP_MIN_ALT = 7;
/** A raptor in flight must be at least this high (m) to be worth the soaring shot (lower, it is landing or taking off). */
const SOAR_MIN_ALT = 14;

/** A prairie dog town seen from the small-prey fields: cells with this much town (B, of 255) and dogs (G) count. */
const TOWN_MIN = 90;
const TOWN_DOGS_MIN = 20;
/** A ground predator this close (m) to a town is a threat worth filming. */
const TOWN_THREAT_R = 70;
/** Migrants of one species within this many metres of each other are a group; this many make a shot. */
const GROUP_R = 32;
const GROUP_MIN = 3;
/** An event cut waits at most this long (s) for the current shot to have run its minimum, then is dropped. */
const CUT_STALE = 25;
const CUT_AFTER = 4;
/** A cut for a field note just earned waits longer (it is rare and it is the point of the moment), and runs sooner. */
const NOTE_STALE = 40;
const NOTE_AFTER = 1.5;
/** The beat between a moment being earned and the camera leaving for it, so the cut lands a second or two after the toast. */
const MOMENT_LEAD = 1;
/** A moment shot holds this long (s): enough to read the subject at 1x. A moment already on screen is not interrupted before it has run this long (notes) or the longer one (events). */
const MOMENT_HOLD = 8.5;
const MOMENT_MIN_NOTE = 5;
const MOMENT_MIN_EVENT = 8;
/** Event moments (not notes) at most this often per kind and in all (s), so the documentary does not become a news ticker. */
const EVENT_KIND_GAP = 45;
const EVENT_ANY_GAP = 14;

/** A land animal is running (worth a tracking shot) in a run state at this speed (m/s) or more. */
const RUN_MIN_SPEED = 4.5;
/** A tracked animal that has dropped under this speed (m/s), or left the run states, for STOP_AFTER seconds has stopped: the shot is over. */
const STOP_SPEED = 2.5;
const STOP_AFTER = 1.3;
/** A tracking shot is not ended for a stop before it has run this long (s). */
const TRACK_MIN_RUN = 2.5;
/** A hunt whose target is gone, or farther than this from the predator (m), for this long (s) is dropped. */
const PREY_LOST_AFTER = 0.4;
const PREY_FAR = 60;
/** A hunt shot widens (m of orbit distance) at most this far past its base to keep both animals in frame, and is dropped if they are still out of frame after OUT_ABANDON seconds. */
const HUNT_MAX_DIST = 56;
const HUNT_MAX_EXTRA = 26;
const OUT_ABANDON = 2.6;
/** A kill or raven shot whose carcass has gone, or is out of frame, for this long (s) is dropped (after a grace second for the camera to arrive). */
const CARCASS_MISS_AFTER = 1.4;
/** Time-lapse drone moves fly this high (m) at 100x and a skip; at 10x they are lower, a mix with the animals. */
const DRONE_ALT_LAPSE: [number, number] = [150, 300];
const DRONE_ALT_FAST: [number, number] = [85, 195];

const DEG = Math.PI / 180;

/** The record at agent offset `o` is a land animal running: in a run state, fast enough that its gait is worth a close look. */
function isRunningRec(a: Float32Array, o: number): boolean {
  const st = a[o + 7];
  if (st !== St.Chase && st !== St.Run && st !== St.Flee) return false;
  if (a[o + 4] < RUN_MIN_SPEED) return false;
  return SPECIES[a[o]]?.flies !== true;
}

/** Orbit distance (m) of a close shot of one animal, by species: small species get 8 to 20 m so they fill the frame. Bison are medium. */
function closeDist(sp: number, r: number): number {
  switch (sp) {
    case Sp.PrairieDog: return 8 + r * 3;
    case Sp.Rabbit: return 9 + r * 3;
    case Sp.Raven: return 10 + r * 4;
    case Sp.Beaver: return 9 + r * 4;
    case Sp.Coyote: return 9 + r * 4;
    case Sp.Eagle:
    case Sp.Hawk: return 16 + r * 8;
    case Sp.Bison: return 30 + r * 14;
    default: return 11 + r * 6; // pronghorn, mule deer, wolf, cougar
  }
}

/** Distance (m) of a tracking shot that runs alongside an animal, by species: 18 to 40 m, so the gait, the spine flex and the dust read. */
export function trackDist(sp: number): number {
  switch (sp) {
    case Sp.Bison: return 30;
    case Sp.Wolf: return 20;
    case Sp.Cougar: return 18;
    case Sp.Coyote: return 18;
    case Sp.Deer: return 22;
    case Sp.MuleDeer: return 22;
    case Sp.Beaver: return 18;
    default: return 24;
  }
}

/** Where something last happened (events, alarm waves), so a field note earned a moment later knows where to look. */
interface Where { x: number; y: number; sp: number; a: number; b: number; at: number }

/** A cut that something asked for. The shot is worked out only when the cut is due, from the freshest frame (the animal may have moved). */
interface Cut {
  /** Dedupe key: a second cut with the same key while one waits is folded into it. */
  key: string;
  resolve: (f: DirectorFrame) => Shot | null;
  at: number;
  due: number;
  /** A field note earned: cuts sooner, waits longer, may cut over a young hunt. */
  urgent: boolean;
}

/** A tracking shot: the framed follow that runs alongside the lead animal (see FollowFrame.side). */
interface Track {
  frame: FollowFrame;
  /** The distance (m) from the camera to the animal at the start; a hunt widens the frame from here. The orbit distance is this times `ratio` (the focus lies beyond the animal). */
  baseDist: number;
  ratio: number;
  /** Seconds the lead animal has been still (not running), the prey out of the frame, and the target gone, and metres added to keep both in frame. */
  stillT: number;
  /** The last separation of the pair (m) and how fast it is changing (m/s, smoothed): the frame is widened for where the pair will be in a moment. */
  sep0: number;
  sepV: number;
  outT: number;
  preyGoneT: number;
  extra: number;
}

/** A drone move (time-lapse): the camera flies from one place to another over the shot, its heading and pitch easing as it goes. */
interface Drone { x0: number; y0: number; x1: number; y1: number; yaw0: number; yaw1: number; pitch0: number; pitch1: number; dist0: number; dist1: number }

interface Shot {
  kind: ShotKind;
  /** Follow this animal id, or film a fixed point. */
  id: number | null;
  x: number;
  y: number;
  dist: number;
  pitch: number;
  yaw: number;
  /** Seconds to hold the shot. */
  hold: number;
  /** The subject is in the air (a raptor): the camera frames it at its own height, not at the ground under it. */
  air?: boolean;
  /** Height (m) above the ground to aim a fixed shot at (a carcass with birds on it is framed a little above the dirt). */
  lift?: number;
  /** A moment (a field note or a headline event): nothing but another moment cuts away from it before its time. */
  moment?: boolean;
  /** A tracking shot of a running animal (`id` is the lead). */
  track?: Track;
  /** A hunt: the animal the predator `id` is after, kept in frame with it. */
  prey?: number;
  /** A fixed shot of a carcass at (x, y): it must stay in frame, or the shot is dropped. */
  carcass?: boolean;
  /** A time-lapse drone move. */
  drone?: Drone;
  /** How good a motion shot is (hunts 100, a stampede or pronghorn about 50): a better one may cut over a worse one. */
  score?: number;
}

const isMotionKind = (k: ShotKind): boolean => k === 'hunt' || k === 'run' || k === 'stampede';

/** What the director measured about itself, for the evidence runs (tools never read it in the game). Off until `stats.on` is set. */
export interface DirectorStats {
  on: boolean;
  /** Seconds filmed, by speed class, and of them the seconds with a running animal on screen within 45 m of the camera. */
  secs: Record<SpeedClass, number>;
  runnerNear: Record<SpeedClass, number>;
  /** Seconds a hunt shot was up, and of them the seconds with both the predator and its target in frame. */
  huntSecs: number;
  huntBoth: number;
  /** Seconds by shot kind, and the shots begun (newest last): when, kind, speed class, orbit distance, lead species. */
  kindSecs: Record<string, number>;
  log: Array<{ at: number; kind: string; cls: SpeedClass; dist: number; sp: number }>;
}

export class Director {
  enabled = false;
  current: Shot | null = null;
  /**
   * The dip at an edit (render/cutfx.ts). When set, a hard cut between two shots goes through a soft dark: the director asks for the fade,
   * keeps the old shot on until the picture is dark, and only then moves the camera. Null (the unit tests, `?cuts=0`) cuts at once.
   */
  cutFx: CutFx | null = null;
  /** A shot chosen but not yet begun: the picture is falling to dark, and the camera moves when it is. */
  private pend: { shot: Shot; wait: number } | null = null;
  readonly stats: DirectorStats = { on: false, secs: { real: 0, fast: 0, lapse: 0 }, runnerNear: { real: 0, fast: 0, lapse: 0 }, huntSecs: 0, huntBoth: 0, kindSecs: {}, log: [] };
  private t = 0;
  private scan = 0;
  private stoopScan = 0;
  private last: ShotKind[] = [];
  private rngState = 12345;
  private tmp = new THREE.Vector3();
  private pa = new THREE.Vector3();
  private pb = new THREE.Vector3();
  private pv = new THREE.Vector3();
  private pv2 = new THREE.Vector3();
  /** Cuts that events asked for (R3): immigrants, plague in a town, coyotes taking over. Newest last, with the clock they were asked at. */
  private cuts: Cut[] = [];
  private clock = 0;
  private lastEvTick = -1;
  /** The newest frame the director saw, for cuts resolved later. */
  private frame: DirectorFrame | null = null;
  /** Where each kind of event last happened, newest per kind. */
  private where = new Map<string, Where>();
  private eventCutAt = new Map<string, number>();
  private anyEventCutAt = -1e9;
  private cls: SpeedClass = 'real';
  /** The shot that follows when the current one is ended early (a kill after a hunt). */
  private chain: Shot | null = null;
  /** The lead animal of the last motion shot and when it ended, so the same animal is not re-cut at once. */
  private lastMotion = { id: -1, at: -1e9 };
  /** Where the last drone move ended, so the next one carries on from there (one long flight, not a string of jumps). */
  private droneTail: { x: number; y: number; yaw: number; pitch: number; dist: number; at: number } | null = null;
  /** The camera's view matrices are fresh (a real camera is attached): shots can be checked against the frame. */
  private viewOk = false;
  private statAcc = 0;
  private statRunner = false;

  constructor(
    private cam: DroneCamera,
    private getPos: (id: number, out: THREE.Vector3) => boolean,
    private worldSize: number,
    /** Tree and shrub cover 0..1 at a sim position, so shots aren't filmed through a grove. */
    private coverAt: (x: number, y: number) => number = () => 0,
  ) {}

  /** How badly the camera ray from the subject at `yaw` is blocked by canopy (lower is clearer). */
  private yawScore(sx: number, sy: number, pitchDeg: number, yaw: number, dist: number, lift: number): number {
    const reach = Math.min(70, 12 / Math.max(0.05, Math.tan((pitchDeg * Math.PI) / 180)));
    const r = (yaw * Math.PI) / 180, dx = Math.sin(r), dy = Math.cos(r);
    let score = 0;
    for (let d = 5; d <= reach; d += 3) score += this.coverAt(sx + dx * d, sy + dy * d) * (1 - d / (reach + 1));
    // and the camera's own collision test: a heading whose whole boom is free of crowns and trunks wins, so a shot begins clear
    // instead of swinging round a tree after it starts (1 when the camera has no tree list)
    score += (1 - this.cam.headingReach(sx, sy, lift, yaw, pitchDeg, dist)) * 6;
    return score;
  }

  /**
   * Of eight headings around the subject, the one with the least canopy between camera and subject. Only the stretch
   * where the camera ray is still below crown height (about 12 m) can be blocked.
   */
  private clearYaw(sx: number, sy: number, pitchDeg: number, baseYaw: number, dist: number, lift: number): number {
    let best = baseYaw, bestScore = Infinity;
    for (let k = 0; k < 8; k++) {
      const yaw = baseYaw + k * 45;
      const score = this.yawScore(sx, sy, pitchDeg, yaw, dist, lift);
      if (score < bestScore - 1e-6) { bestScore = score; best = yaw; }
    }
    return best % 360;
  }

  /**
   * The subject of the shot being filmed, when it is a close one (R15 Lens racks focus on it): the animal id (null for a fixed point),
   * the point (sim x, y) and the orbit distance. Null when the director is off or the shot is wider than `maxDist` metres. Read only.
   */
  closeShot(maxDist = 72): { id: number | null; x: number; y: number; dist: number } | null {
    const s = this.current;
    // (a tracking shot's orbit distance reaches past the animal to the focus: the distance that counts is to the animal)
    const d = s?.track ? s.track.frame.dist / s.track.ratio : s?.dist ?? 0;
    if (!this.enabled || !s || d > maxDist || s.drone) return null;
    return { id: s.id, x: s.x, y: s.y, dist: d };
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.t = 0;
    this.current = null;
    this.chain = null;
    this.pend = null;
    this.cutFx?.cancel(); // (the player taking the camera, or the documentary starting, is an instant cut: no dip is left running)
    this.cuts = []; // a player who takes the camera is never pulled away by a cut that was queued before
    this.cam.cinematicAuto = true;
    if (!on) {
      this.cam.follow(null);
      this.cam.setCinematic(false);
      this.cam.followSmoothTime = 0.4;
      this.cam.followDeadzone = 0.055;
    }
  }

  private rand(): number {
    // a tiny LCG: camera choices only, never touches the sim
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  // ------------------------------------------------------------ what the camera shows

  /** Refresh the view matrices of the camera (when it has them), so a world point can be tested against the frame. */
  private beginView(): void {
    const c = (this.cam as unknown as { camera?: THREE.PerspectiveCamera }).camera;
    if (!c || !c.matrixWorldInverse) { this.viewOk = false; return; }
    c.updateMatrixWorld();
    c.matrixWorldInverse.copy(c.matrixWorld).invert();
    this.viewOk = true;
  }

  /**
   * Is the world point (three coordinates: x, height, z = sim y) in front of the camera and inside the frame, `mx` and `my` being the
   * share of the half width and half height that counts? True when the director has no camera to ask (a unit test).
   */
  private inFrame(x: number, y: number, z: number, mx = 0.9, my = 0.86): boolean {
    if (!this.viewOk) return true;
    const c = (this.cam as unknown as { camera: THREE.PerspectiveCamera }).camera;
    const v = this.pv.set(x, y, z).applyMatrix4(c.matrixWorldInverse);
    if (v.z > -c.near) return false;
    v.applyMatrix4(c.projectionMatrix);
    return Math.abs(v.x) <= mx && Math.abs(v.y) <= my;
  }

  /**
   * Is the camera on this event right now? For the chapter cards and the narrator's captions: a title tied to a place should only show
   * while the picture shows that place. True when the director is off (the player has the camera and the cards are plain news). A close
   * shot must be near the event as well as framing it (a long lens on a far hill does not count); a drone or a vista only has to frame it.
   */
  eventInView(x: number, y: number): boolean {
    if (!this.enabled) return true;
    const s = this.current;
    if (!s) return false;
    if (this.viewOk && !this.inFrame(x, this.cam.groundAt(x, y) + 1, y, 0.96, 0.92)) return false;
    if (s.kind === 'drone' || s.kind === 'vista') return true;
    const f = this.cam.getFocus(this.tmp);
    return Math.hypot(f.x - x, f.z - y) <= Math.max(60, s.dist * 1.5 + 25);
  }

  private findIdx(f: DirectorFrame, id: number): number {
    for (let k = 0; k < f.count; k++) if (f.ids[k] === id) return k;
    return -1;
  }

  // ------------------------------------------------------------ the loop

  update(dt: number, f: DirectorFrame | null): void {
    if (!this.enabled || !f) return;
    this.t -= dt;
    this.scan -= dt;
    this.stoopScan -= dt;
    this.clock += dt;
    this.frame = f;
    this.beginView();
    const cls = speedClass(f.speed);
    if (cls !== this.cls) {
      this.cls = cls;
      // years flying by: animals are a blur, the camera goes up; back at a watchable pace a drone move is ended and the animals are filmed again
      if ((cls === 'lapse' && this.current && !this.current.drone) || (cls === 'real' && this.current?.drone)) this.t = Math.min(this.t, 0);
    }
    if (cls === 'lapse') this.cuts.length = 0; // nothing close is filmed at 100x, not even a moment
    if (f.events && f.events.length) this.takeEvents(f);
    this.monitor(f, dt);
    if (this.pend) {
      // the picture is falling to dark for an edit: nothing else is decided until the camera has moved (a dip nobody uses is dropped)
      const p = this.pend;
      p.wait += dt;
      if (!this.cutFx || this.cutFx.dark || p.wait > 0.4) {
        this.pend = null;
        this.beginShot(p.shot, f, true);
        this.cutFx?.fadeIn();
      }
      this.tally(dt, f);
      return;
    }
    // a moment (a field note, a headline event) holds the camera: no hunt or stoop scan cuts away from it
    const inMoment = this.current?.moment === true;
    // an animal running is worth cutting to early (checked twice a second, after 3 s of a static shot), and a better chase over a poorer one
    let huntNow: Shot | null = null;
    const cur0 = this.current;
    if (cls !== 'lapse' && !inMoment && cur0 && cur0.kind !== 'stoop' && cur0.hold - this.t > 3 && this.scan <= 0) {
      this.scan = 0.5;
      const m = this.findMotion(f);
      if (m) {
        const run = cur0.hold - this.t;
        if (!isMotionKind(cur0.kind)) huntNow = m;
        else if (run > 5 && m.id !== cur0.id && (m.score ?? 0) >= (cur0.score ?? 0) + 30) huntNow = m;
      }
    }
    // a raptor beginning a stoop is over in a few seconds (R5): cut to it as soon as the current shot has run 3 s, never over a hunt or another stoop
    if (!huntNow && cls !== 'lapse' && !inMoment && this.current && !isMotionKind(this.current.kind) && this.current.kind !== 'stoop' && this.current.hold - this.t > 3 && this.stoopScan <= 0) {
      this.stoopScan = 0.25;
      huntNow = this.findStoop(f);
    }
    // a cut that something asked for (R3 events, field notes, headline moments): once the current shot has run a few seconds, never over a
    // hunt that is still young (a field note may cut over it), and never over a moment that has not had its time
    let evNow: Shot | null = null;
    while (this.cuts.length && this.clock - this.cuts[0].at > (this.cuts[0].urgent ? NOTE_STALE : CUT_STALE)) this.cuts.shift();
    const due = this.cuts[0];
    if (due && !huntNow && this.clock >= due.due) {
      const run = this.current ? this.current.hold - this.t : Infinity;
      const minRun = inMoment ? (due.urgent ? MOMENT_MIN_NOTE : MOMENT_MIN_EVENT) : due.urgent ? NOTE_AFTER : CUT_AFTER;
      const huntOk = due.urgent || !isMotionKind(this.current?.kind ?? 'vista') || run > 10;
      if (!this.current || (run > minRun && huntOk)) {
        this.cuts.shift();
        evNow = due.resolve(f); // null: the subject is gone, the cut is dropped
        if (evNow && this.alreadyOn(evNow)) {
          // the camera is already close on this subject (a hunt of the same wolf, say): keep it and hold it for reading
          this.t = evNow.hold;
          this.current!.hold = evNow.hold;
          this.current!.moment = true;
          evNow = null;
          return;
        }
      }
    }
    if (this.current?.drone && this.t > 0) this.driveDrone(dt);
    if (this.t > 0 && !huntNow && !evNow) {
      // if the followed animal died, end the shot
      if (this.current?.id != null && !this.getPos(this.current.id, this.tmp)) this.t = 0;
      else { this.tally(dt, f); return; }
    }
    const chained = this.chain;
    this.chain = null;
    const shot = huntNow ?? evNow ?? chained ?? this.pick(f);
    // deep night, any ground shot (a chase and an event included): low, so the dark bodies stand against the moonlit sky instead of the dark grass
    if ((f.dayFrac < 0.2 || f.dayFrac > 0.82) && !shot.air && !shot.drone && shot.pitch > 9) shot.pitch = 5 + this.rand() * 4;
    // golden hour (the low sun either side of the night): a lower camera too, for the long shadows and the backlit grass the valley looks best in
    else if ((f.dayFrac < 0.28 || f.dayFrac > 0.72) && !shot.air && !shot.drone && shot.pitch > 13) shot.pitch = 7 + this.rand() * 6;
    const fx = this.cutFx;
    if (fx && fx.enabled) {
      // (the first shot after the player's camera is an edit too: the picture the player had falls to dark, the camera moves, the shot rises)
      if (!this.current || this.willCut(shot)) {
        // a hard cut is an edit: fall to dark first, move the camera in the dark (above), rise into the new shot
        this.pend = { shot, wait: 0 };
        fx.fadeOut();
        this.tally(dt, f);
        return;
      }
    }
    this.beginShot(shot, f);
    this.tally(dt, f);
  }

  /** Would beginning this shot now be a hard cut (the camera jumps) and not a glide? The same test beginShot makes, without moving anything. */
  private willCut(shot: Shot): boolean {
    if (shot.track && shot.id !== null) return true; // (a tracking shot always begins with a cut)
    const v = this.pv2;
    const ok = shot.id !== null ? this.getPos(shot.id, v) : false;
    const sx = shot.id !== null ? (ok ? v.x : NaN) : shot.x, sy = shot.id !== null ? (ok ? v.z : NaN) : shot.y;
    const known = Number.isFinite(sx) && Number.isFinite(sy);
    let yaw = shot.yaw;
    if (known && !shot.track && !shot.drone) yaw = this.clearYaw(sx, sy, shot.pitch, shot.yaw, shot.dist, shot.air && ok ? Math.max(0, v.y - this.cam.groundAt(sx, sy)) : 0);
    return this.isCut(shot, known, sx, sy, yaw);
  }

  /** The cut test of beginShot: a subject across the valley, off centre in a moment, a big turn or a big change of distance. */
  private isCut(shot: Shot, known: boolean, sx: number, sy: number, yaw: number): boolean {
    const focus = this.cam.getFocus(this.tmp);
    const far = known && Math.hypot(sx - focus.x, sy - focus.z) > 0.6 * Math.max(this.cam.distance, shot.dist) + 40;
    const turn = Math.abs(((yaw - this.cam.yawDeg) % 360 + 540) % 360 - 180);
    // (a moment is a cut unless the subject is already in the middle of the frame: an eased glide takes longer than the couple of seconds it has)
    const offCentre = shot.moment === true && known && Math.hypot(sx - focus.x, sy - focus.z) > 8;
    return far || offCentre || turn > 75 || Math.abs(shot.dist - this.cam.distance) > 0.6 * Math.max(shot.dist, this.cam.distance);
  }

  /** Begin a shot: the camera is told where to stand, what to follow and how fast to move. */
  private beginShot(shot: Shot, f: DirectorFrame, forceCut = false): void {
    if (this.current && isMotionKind(this.current.kind) && this.current.id !== null) this.lastMotion = { id: this.current.id, at: this.clock };
    this.current = shot;
    this.t = shot.hold;
    this.last.push(shot.kind);
    if (this.last.length > 3) this.last.shift();
    if (this.stats.on) {
      const k = shot.id !== null ? this.findIdx(f, shot.id) : -1;
      this.stats.log.push({ at: Math.round(this.clock * 10) / 10, kind: shot.kind, cls: this.cls, dist: Math.round(shot.dist), sp: k >= 0 ? f.agents[k * AGENT_STRIDE] : -1 });
    }
    // a tracking shot and a drone move steer themselves; the rest ride cinematic mode's slow orbit and sway
    this.cam.cinematicAuto = !(shot.track || shot.drone);
    // film from the side with a clear line of sight
    const v = new THREE.Vector3();
    const ok = shot.id !== null ? this.getPos(shot.id, v) : false;
    const sx = shot.id !== null ? (ok ? v.x : NaN) : shot.x, sy = shot.id !== null ? (ok ? v.z : NaN) : shot.y;
    const known = Number.isFinite(sx) && Number.isFinite(sy);
    if (known && !shot.track && !shot.drone) shot.yaw = this.clearYaw(sx, sy, shot.pitch, shot.yaw, shot.dist, shot.air && ok ? Math.max(0, v.y - this.cam.groundAt(sx, sy)) : 0);
    // an editor cuts to a subject across the valley rather than flying the camera through the trees to reach it;
    // near subjects get a glide that eases in and out
    // (a shot that waited for a dip is a cut whatever the camera has drifted to meanwhile)
    const cut = forceCut || this.isCut(shot, known, sx, sy, shot.yaw);
    // a documentary operator lets the subject drift in frame and eases after it, so the background doesn't judder
    // (a stoop is a 30 m/s dive: the operator has to stay with it, so the follow is tight)
    const diving = shot.kind === 'stoop';
    this.cam.followSmoothTime = shot.id !== null ? (diving ? 0.4 : 1.1) : 0.4;
    this.cam.followDeadzone = shot.id !== null ? (diving ? 0.05 : 0.13) : 0.055;
    if (shot.track && shot.id !== null) {
      // alongside the lead animal: the framed follow holds the heading (see FollowFrame.side) and leads the animal, so the gait reads
      const id = shot.id, prey = shot.prey ?? null;
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      this.cam.setView({ yawDeg: shot.yaw, pitchDeg: shot.pitch, distance: shot.dist }, false);
      this.cam.follow(() => {
        if (!this.getPos(id, a)) return null;
        // (a hunt is filmed on the pair: the point between the predator and its target, so neither is the edge of the frame)
        if (prey !== null && this.getPos(prey, b)) return { x: (a.x + b.x) / 2, y: (a.z + b.z) / 2 };
        return { x: a.x, y: a.z };
      }, shot.track.frame, true); // (a tracking shot always begins with a cut: the animal is framed from the first frame, not chased into it)
    } else if (shot.id !== null) {
      const id = shot.id;
      const p = new THREE.Vector3();
      const air = shot.air === true;
      this.cam.follow(() => (this.getPos(id, p) ? { x: p.x, y: p.z, h: air ? p.y : undefined } : null));
      this.cam.setView({ ...(cut && known ? { x: sx, y: sy } : {}), ...(air && ok ? { h: v.y } : {}), distance: shot.dist, pitchDeg: shot.pitch, yawDeg: shot.yaw }, cut && known);
    } else {
      this.cam.follow(null);
      this.cam.setView({ x: shot.x, y: shot.y, ...(shot.lift ? { h: this.cam.groundAt(shot.x, shot.y) + shot.lift } : {}), distance: shot.dist, pitchDeg: shot.pitch, yawDeg: shot.yaw }, cut);
    }
    this.cam.setCinematic(true);
    if (!cut || shot.track) this.cam.easeIn();
  }

  private recent(k: ShotKind): boolean {
    return this.last.includes(k);
  }

  // ------------------------------------------------------------ checking the shot against the picture

  /**
   * Once a frame: does the shot still show what it says? A tracking shot ends when its animal stops; a hunt keeps the predator and its
   * target in frame (widening, and giving up when the target is lost or will not fit); a carcass shot is dropped when the carcass is
   * gone or out of frame. A shot that ends early may chain a follow-up (the kill after a hunt). Also keeps the evidence stats.
   */
  private monitor(f: DirectorFrame, dt: number): void {
    const s = this.current;
    if (!s || this.t <= 0) return;
    const run = s.hold - this.t;
    if (s.track && s.id !== null) {
      const tr = s.track;
      const k = this.findIdx(f, s.id);
      if (k < 0) { this.t = 0; return; } // the lead animal is gone (it died, or left)
      const o = k * AGENT_STRIDE;
      const st = f.agents[o + 7];
      const moving = f.agents[o + 4] >= STOP_SPEED && (st === St.Chase || st === St.Run || st === St.Flee);
      tr.stillT = moving ? 0 : tr.stillT + dt;
      tr.frame.timeScale = Math.max(1, Math.min(12, f.speed ?? 1));
      if (s.prey !== undefined) this.monitorHunt(s, f, dt, run);
      else if (run > TRACK_MIN_RUN && tr.stillT > STOP_AFTER) this.t = 0; // it has stopped: the chase is over
      if (this.t <= 0 && s.prey !== undefined) {
        // the chase is over: if it ended in a kill, stay for the carcass and the feeding
        const after = this.getPos(s.id, this.pa) ? this.aftermath(f, this.pa.x, this.pa.z) : null;
        if (after) this.chain = after;
      }
    } else if (s.carcass) {
      const c = this.carcassAt(f, s.x, s.y);
      const out = c < 0 || !this.inFrame(s.x, this.cam.groundAt(s.x, s.y) + (s.lift ?? 1), s.y, 0.95, 0.9);
      if (run > 1.5) this.missT = out ? this.missT + dt : 0;
      else this.missT = 0;
      if (this.missT > CARCASS_MISS_AFTER) { this.t = 0; this.missT = 0; }
    }
  }
  private missT = 0;

  /** The index of the carcass within 2 m of (x, y) that is not yet eaten away (a carcass shot needs it), or -1. */
  private carcassAt(f: DirectorFrame, x: number, y: number): number {
    for (let k = 0; k < f.carcassCount; k++) {
      const c = k * CARCASS_STRIDE;
      if (f.carcasses[c + 2] > 0.04 && Math.hypot(f.carcasses[c] - x, f.carcasses[c + 1] - y) < 2.5) return k;
    }
    return -1;
  }

  private monitorHunt(s: Shot, f: DirectorFrame, dt: number, run: number): void {
    const tr = s.track!;
    const prey = s.prey!;
    const ok = this.getPos(s.id!, this.pa);
    const pk = this.findIdx(f, prey);
    const okPrey = pk >= 0 && this.getPos(prey, this.pb);
    // (the target is gone when it is not there, or has got away from the predator: farther than PREY_FAR)
    const away = okPrey && ok && Math.hypot(this.pa.x - this.pb.x, this.pa.z - this.pb.z) > PREY_FAR;
    tr.preyGoneT = okPrey && !away ? 0 : tr.preyGoneT + dt;
    let both = false;
    if (ok && okPrey) {
      const sep = Math.hypot(this.pa.x - this.pb.x, this.pa.z - this.pb.z);
      // wide enough for both across the frame, with a margin, from the camera's own field of view
      const cam = (this.cam as unknown as { camera?: THREE.PerspectiveCamera }).camera;
      const th = cam ? Math.tan((cam.fov * DEG) / 2) * cam.aspect : 0.9;
      if (tr.sep0 >= 0 && dt > 1e-4) tr.sepV += ((sep - tr.sep0) / dt - tr.sepV) * (1 - Math.exp(-dt / 0.5));
      tr.sep0 = sep;
      const sepP = sep + Math.max(0, Math.min(30, tr.sepV)) * 1.3;
      const need = (sepP * 0.5 + 5) / (0.85 * Math.max(0.3, th));
      both = this.inFrame(this.pa.x, this.pa.y + 0.6, this.pa.z, 0.96, 0.94) && this.inFrame(this.pb.x, this.pb.y + 0.6, this.pb.z, 0.96, 0.94);
      if (run > 1.2) {
        if (!both) { tr.extra = Math.min(HUNT_MAX_EXTRA, tr.extra + 7 * dt); tr.outT += dt; } else { tr.outT = Math.max(0, tr.outT - dt); if (this.inFrame(this.pa.x, this.pa.y + 0.6, this.pa.z, 0.75, 0.75) && this.inFrame(this.pb.x, this.pb.y + 0.6, this.pb.z, 0.75, 0.75)) tr.extra = Math.max(0, tr.extra - 1.5 * dt); }
      }
      tr.frame.dist = (Math.min(HUNT_MAX_DIST, Math.max(tr.baseDist, need)) + tr.extra) * tr.ratio;
      if (tr.outT > OUT_ABANDON) { this.t = 0; return; } // they will not fit: give the shot up rather than film one of them
    }
    if (this.stats.on) {
      this.stats.huntSecs += dt;
      if (both && ok && okPrey) this.stats.huntBoth += dt;
    }
    if (tr.preyGoneT > PREY_LOST_AFTER) this.t = 0; // the target is gone (taken, or away): no hunt to film
    else if (run > TRACK_MIN_RUN && tr.stillT > STOP_AFTER) this.t = 0; // the predator has given up or made the kill
  }

  /** After a hunt: a fresh carcass within 45 m of where it ended, with a land predator on it, framed to be read (a short follow-up shot). */
  private aftermath(f: DirectorFrame, x: number, y: number): Shot | null {
    const s = this.carcassShot(f, x, y, false, 'kill', 0.55, 45);
    if (!s) return null;
    let predator = false;
    for (let k = 0; k < f.count && !predator; k++) {
      const o = k * AGENT_STRIDE;
      if (isLandHunter(f.agents[o]) && Math.hypot(f.agents[o + 1] - s.x, f.agents[o + 2] - s.y) < 18) predator = true;
    }
    if (!predator) return null;
    s.hold = this.cls === 'real' ? 7 : 3.5; // (at 10x seven seconds is over a minute of feeding)
    return s;
  }

  /** Statistics of the evidence runs: seconds by speed class, with a running animal within 45 m of the camera and in frame. */
  private tally(dt: number, f: DirectorFrame): void {
    const st = this.stats;
    if (!st.on) return;
    dt = Math.min(dt, 0.25);
    st.secs[this.cls] += dt;
    const k = this.current?.kind ?? 'none';
    st.kindSecs[k] = (st.kindSecs[k] ?? 0) + dt;
    this.statAcc -= dt;
    if (this.statAcc <= 0) {
      this.statAcc = 0.2;
      const cam = (this.cam as unknown as { camera?: THREE.PerspectiveCamera }).camera;
      const px = cam ? cam.position.x : this.cam.getFocus(this.tmp).x, pz = cam ? cam.position.z : this.tmp.z;
      let near = false;
      for (let i = 0; i < f.count && !near; i++) {
        const o = i * AGENT_STRIDE;
        if (!isRunningRec(f.agents, o)) continue;
        if (Math.hypot(f.agents[o + 1] - px, f.agents[o + 2] - pz) > 45) continue;
        near = this.inFrame(f.agents[o + 1], this.cam.groundAt(f.agents[o + 1], f.agents[o + 2]) + 0.8, f.agents[o + 2], 0.95, 0.9);
      }
      this.statRunner = near;
    }
    if (this.statRunner) st.runnerNear[this.cls] += dt;
  }

  // ------------------------------------------------------------ choosing a shot

  /** A raptor that has just begun a stoop (St.Chase, still high): follow it from the side, low, to the strike and a few seconds beyond it. */
  private findStoop(f: DirectorFrame): Shot | null {
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (SPECIES[f.agents[o]]?.guild === 'raptor' && f.agents[o + 7] === St.Chase && f.agents[o + 9] > STOOP_MIN_ALT) {
        return { kind: 'stoop', id: f.ids[k], x: 0, y: 0, dist: 24 + this.rand() * 14, pitch: 5 + this.rand() * 9, yaw: this.rand() * 360, hold: 7, air: true };
      }
    }
    return null;
  }

  /** A raptor aloft, soaring or crossing: a long look at it from the side, close enough to see the fingered wing tips. */
  private findRaptor(f: DirectorFrame): Shot | null {
    let pick = -1, n = 0;
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      const st = f.agents[o + 7];
      if (SPECIES[f.agents[o]]?.guild !== 'raptor' || (st !== St.Fly && st !== St.Migrate) || f.agents[o + 9] < SOAR_MIN_ALT) continue;
      n++;
      if (pick < 0 || this.rand() < 1 / n) pick = k;
    }
    if (pick < 0) return null;
    return { kind: 'raptor', id: f.ids[pick], x: 0, y: 0, dist: 15 + this.rand() * 12, pitch: 6 + this.rand() * 14, yaw: this.rand() * 360, hold: 13, air: true };
  }

  /**
   * What a land hunter in a chase is after: the nearest animal it can take (the diet table) within 75 m, ahead of it, and running (or
   * already close). -1 when there is none: a coyote after a hare has no body to film, so it is not a hunt shot.
   */
  private findPrey(f: DirectorFrame, kp: number): number {
    return findChasePrey(f.agents, f.count, kp);
  }

  /**
   * The best running animal to film now, as a tracking shot: a hunt (a land hunter in a chase and the animal it is after, 100), then a
   * stampede, pronghorn bounding, a stotting mule deer, any fleeing group. The lead of the group is the one filmed (the farthest along the
   * group's heading). null when nothing is running, or the sim is paused. `opt` limits the search to a species or to animals near a place.
   */
  private findMotion(f: DirectorFrame, opt: { sp?: number; x?: number; y?: number; r?: number } = {}): Shot | null {
    if (f.speed === 0 || f.count === 0) return null;
    const A = f.agents, S = AGENT_STRIDE;
    const R: number[] = [];
    for (let k = 0; k < f.count && R.length < 500; k++) {
      const o = k * S;
      if (!isRunningRec(A, o)) continue;
      if (opt.sp !== undefined && A[o] !== opt.sp) continue;
      if (opt.x !== undefined && Math.hypot(A[o + 1] - opt.x, A[o + 2] - (opt.y ?? 0)) > (opt.r ?? 120)) continue;
      if (f.ids[k] === this.lastMotion.id && this.clock - this.lastMotion.at < 6) continue;
      R.push(k);
    }
    if (!R.length) return null;
    const cands: Array<{ k: number; kind: ShotKind; prey: number; score: number }> = [];
    for (const k of R) {
      const o = k * S, sp = A[o];
      let score: number, kind: ShotKind = 'run', prey = -1;
      if (isLandHunter(sp) && A[o + 7] === St.Chase) {
        prey = this.findPrey(f, k);
        // (a chase with no body to show is a run shot of the predator, not a hunt. At 10x a chase is over in a second or two and the pair
        // flies apart faster than any frame can hold, so there it is the predator that is tracked, not a hunt with two animals promised)
        if (prey >= 0 && (f.speed ?? 1) < 5) { score = 100; kind = 'hunt'; } else { score = prey >= 0 ? 70 : 38; prey = -1; }
      } else if (isPredator(sp)) {
        score = 26;
      } else {
        // a group of runners of one species within 40 m: only its lead (the farthest along the group's mean heading) is evaluated
        let n = 0, cx = 0, cy = 0, hx = 0, hy = 0;
        for (const j of R) {
          const q = j * S;
          if (A[q] !== sp || Math.hypot(A[q + 1] - A[o + 1], A[q + 2] - A[o + 2]) > 40) continue;
          n++; cx += A[q + 1]; cy += A[q + 2]; hx += Math.cos(A[q + 3]); hy += Math.sin(A[q + 3]);
        }
        cx /= n; cy /= n;
        const hl = Math.hypot(hx, hy) || 1;
        hx /= hl; hy /= hl;
        const proj = (A[o + 1] - cx) * hx + (A[o + 2] - cy) * hy;
        let isLead = true;
        for (const j of R) {
          const q = j * S;
          if (A[q] !== sp || Math.hypot(A[q + 1] - A[o + 1], A[q + 2] - A[o + 2]) > 40) continue;
          if ((A[q + 1] - cx) * hx + (A[q + 2] - cy) * hy > proj + 1e-6) { isLead = false; break; }
        }
        if (!isLead) continue;
        const stot = (((A[o + 8] | 0) & F_STOT) !== 0);
        const base = sp === Sp.Deer ? 46 : sp === Sp.MuleDeer ? (stot ? 56 : 44) : sp === Sp.Bison ? 30 : sp === Sp.Beaver ? 12 : 30;
        score = base + Math.min(n, 40) * 0.7;
        if (n < 2 && !stot) score -= 14; // one frightened animal on its own is not much to follow
        if (sp === Sp.Bison && n >= 8) kind = 'stampede';
      }
      score += this.rand() * 4;
      if (score >= 20) cands.push({ k, kind, prey, score });
    }
    // the best that can be filmed from the open side (a chase against the edge of the world has no room for the camera)
    cands.sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(5, cands.length); i++) {
      const c = cands[i];
      const shot = this.trackShot(f, c.k, c.kind, c.prey, c.score);
      if (shot) return shot;
    }
    return null;
  }

  /** The tracking shot of the animal at index k: alongside, low (a rider's eye height) and a little ahead, on the side with the clearer line. */
  private trackShot(f: DirectorFrame, k: number, kind: ShotKind, prey: number, score: number): Shot | null {
    const A = f.agents, o = k * AGENT_STRIDE, sp = A[o];
    const ff = followFrameFor(sp);
    // (at 10x the animal swerves and surges ten times as fast as the camera can read it: the shot stands farther back and turns more lazily, so it stays in the frame)
    const fastRun = (f.speed ?? 1) >= 5;
    let base = trackDist(sp) * (0.92 + this.rand() * 0.16) * (fastRun ? 1.4 : 1);
    if (prey >= 0) {
      base = Math.max(base, trackDist(A[prey * AGENT_STRIDE]) * 0.82);
      // wide enough for the pair as it stands (the camera's field of view is about 79 degrees across)
      const sep = Math.hypot(A[o + 1] - A[prey * AGENT_STRIDE + 1], A[o + 2] - A[prey * AGENT_STRIDE + 2]);
      base = Math.min(HUNT_MAX_DIST, Math.max(base, (sep * 0.5 + 5) / (0.85 * 0.83)));
    }
    const side = 1.7 + this.rand() * 0.2;
    const pitch = 3 + this.rand() * 1.5;
    const ndcY = -0.12;
    const cam = (this.cam as unknown as { camera?: THREE.PerspectiveCamera }).camera;
    const phi = Math.atan(-ndcY * Math.tan(((cam?.fov ?? 50) * DEG) / 2));
    const ratio = Math.tan(pitch * DEG + phi) / Math.sin(pitch * DEG);
    const frame: FollowFrame = { dist: base * ratio, pull: 0, pitchDeg: pitch, lift: ff.lift, side, ndcY, distRate: 4, yawBand: fastRun ? 1.1 : 0.5, yawRate: fastRun ? 0.8 : 1.4, timeScale: Math.max(1, Math.min(12, f.speed ?? 1)) };
    // behind the heading is yaw atan2(-hx, -hz) (sim y is three z); the camera takes whichever side is clearer of canopy
    const h = A[o + 3];
    const behind = Math.atan2(-Math.cos(h), -Math.sin(h));
    const gx = A[o + 1], gy = A[o + 2];
    const yawA = ((behind + side) / DEG + 360) % 360, yawB = ((behind - side) / DEG + 360) % 360;
    const lift = 0;
    // a side whose camera spot is off the edge of the world (the camera is held inside it) is no side at all
    const W = this.worldSize, inside = (yawDeg: number): boolean => {
      const cx = gx + Math.sin(yawDeg * DEG) * base, cy = gy + Math.cos(yawDeg * DEG) * base;
      return cx > 14 && cy > 14 && cx < W - 14 && cy < W - 14;
    };
    const inA = inside(yawA), inB = inside(yawB);
    if (!inA && !inB) return null;
    const sa = this.yawScore(gx, gy, pitch, yawA, base, lift) + (inA ? 0 : 100), sb = this.yawScore(gx, gy, pitch, yawB, base, lift) + (inB ? 0 : 100);
    // (a tie keeps the side the camera is already on, so a cut does not flip the picture)
    const cur = this.cam.yawDeg;
    const da = Math.abs(((yawA - cur) % 360 + 540) % 360 - 180), db = Math.abs(((yawB - cur) % 360 + 540) % 360 - 180);
    const yaw = sa < sb - 0.25 ? yawA : sb < sa - 0.25 ? yawB : da <= db ? yawA : yawB;
    const shot: Shot = {
      kind, id: f.ids[k], x: 0, y: 0, dist: base * ratio, pitch, yaw,
      hold: kind === 'hunt' ? 18 : kind === 'stampede' ? 16 : 14,
      track: { frame, baseDist: base, ratio, sep0: -1, sepV: 0, stillT: 0, outT: 0, preyGoneT: 0, extra: 0 },
      score,
    };
    if (prey >= 0) shot.prey = f.ids[prey];
    return shot;
  }

  private pick(f: DirectorFrame): Shot {
    const r = () => this.rand();
    const cls = speedClass(f.speed);
    // years flying by: nothing close, a slow high drone move over the valley
    if (cls === 'lapse') return this.droneShot(f, true);
    const cands: Shot[] = [];
    // deep night: the herds are dark shapes on dark grass, so the shots go low and frame them against the moonlit sky (silhouettes read,
    // a close look down at a dark body does not), and the small subjects (a dog town, a mousing coyote, a raptor) are left for daylight
    const night = f.dayFrac < 0.2 || f.dayFrac > 0.82;
    const lowPitch = (p: number): number => (night ? 5 + r() * 4 : p);
    // an animal running beats everything static: a chase, a stampede, pronghorn bounding, a stotting mule deer
    const motion = this.findMotion(f);
    if (motion && r() < 0.92) return motion;
    // ravens over a kill
    // (the carcass with the most birds on it, framed close from the side: not a random one seen from 70 m up)
    if (f.carcassCount > 0 && !this.recent('ravens')) {
      const rv = this.carcassShot(f, NaN, NaN, true, 'ravens');
      if (rv) cands.push(rv, rv);
    }
    // the biggest herd
    if (!this.recent('herd')) {
      const herd = this.herdOf(f, Sp.Bison);
      if (herd) cands.push({ kind: 'herd', id: null, x: herd.x, y: herd.y, dist: 52 + r() * 28, pitch: lowPitch(16 + r() * 10), yaw: r() * 360, hold: 14 });
    }
    // a wolf pack on the move (the wolf that is moving fastest, not one asleep)
    if (!this.recent('wolves')) {
      let wk = -1, ws = -1;
      for (let k = 0; k < f.count; k++) {
        const o = k * AGENT_STRIDE;
        if (f.agents[o] !== Sp.Wolf) continue;
        const sc = f.agents[o + 4] + r() * 0.8;
        if (sc > ws) { ws = sc; wk = k; }
      }
      if (wk >= 0) cands.push({ kind: 'wolves', id: f.ids[wk], x: 0, y: 0, dist: 24 + r() * 14, pitch: lowPitch(12 + r() * 8), yaw: r() * 360, hold: 16 });
    }
    // pronghorn, low and close
    if (!this.recent('pronghorn')) {
      // (follow one of the herd, close: pronghorn are a metre long and were specks from 60 m)
      const p = this.herdOf(f, Sp.Deer);
      if (p) cands.push({ kind: 'pronghorn', id: p.id, x: 0, y: 0, dist: p.n >= 6 ? 26 + r() * 12 : 14 + r() * 8, pitch: lowPitch(10 + r() * 6), yaw: r() * 360, hold: 16 });
    }
    // a prairie dog town with a predator near (R3): the alarm wave sweeps the town
    if (!night && !this.recent('town')) {
      const t = this.findTown(f);
      if (t) cands.push(t, t);
    }
    // a coyote standing very still, mousing: the leap
    if (!night && !this.recent('mousing')) {
      const m = this.findMousing(f);
      if (m) cands.push(m, m);
    }
    // a raptor mid-stoop, or soaring (R5)
    const stoop = night ? null : this.findStoop(f);
    if (stoop) cands.push(stoop, stoop);
    if (!night && !this.recent('raptor')) {
      const rp = this.findRaptor(f);
      if (rp) cands.push(rp);
    }
    // a group on the move through a corridor
    if (!this.recent('migration')) {
      const g = this.findMigrants(f, -1);
      if (g) cands.push(g);
    }
    // at 10x the animals still read but a year is quick, so the valley from the air is part of the mix
    if (cls === 'fast' && !this.recent('drone')) {
      const d = this.droneShot(f, false);
      cands.push(d, d, d);
    }
    // a vista every so often
    if (!this.recent('vista') && cls === 'real') {
      // a vista still has life in it: the valley seen from behind a herd
      const h = this.biggestHerd(f, Sp.Bison) ?? [this.worldSize / 2, this.worldSize / 2];
      cands.push({ kind: 'vista', id: null, x: h[0], y: h[1], dist: 230 + r() * 90, pitch: lowPitch(14 + r() * 8), yaw: r() * 360, hold: 18 });
    }
    if (motion) cands.push(motion);
    return cands[Math.floor(r() * cands.length)] ?? (cls === 'real' ? { kind: 'vista', id: null, x: this.worldSize / 2, y: this.worldSize / 2, dist: 380, pitch: 20, yaw: 0, hold: 20 } : this.droneShot(f, false));
  }

  // ------------------------------------------------------------ drone moves (time-lapse)

  /**
   * A slow, high move over the valley, for years flying by: a pan across it or an orbit round a place, 150 to 300 m up at 100x (85 to 195
   * m at 10x), looking out across the land so the weather, the cloud shadows and the colour of the grass over the seasons show. It carries
   * on from where the last drone move ended, so a run of them reads as one long flight.
   */
  private droneShot(f: DirectorFrame, lapse: boolean): Shot {
    const S = this.worldSize, r = () => this.rand();
    const lo = lapse ? DRONE_ALT_LAPSE : DRONE_ALT_FAST;
    const prev = this.droneTail && this.clock - this.droneTail.at < 4 ? this.droneTail : null;
    const stormy = (f.weather ?? 0) === 1 || (f.weather ?? 0) === 3;
    const alt = lo[0] + r() * (lo[1] - lo[0]);
    const pitch0 = prev ? Math.max(22, Math.min(46, prev.pitch)) : (stormy ? 22 : 27) + r() * 15;
    const pitch1 = Math.max(20, Math.min(48, pitch0 + (r() - 0.5) * 12));
    const dist0 = Math.max(180, Math.min(900, alt / Math.sin(pitch0 * DEG)));
    const dist1 = Math.max(180, Math.min(900, (alt + (r() - 0.5) * 60) / Math.sin(pitch1 * DEG)));
    const lim = (v: number) => Math.max(S * 0.08, Math.min(S * 0.92, v));
    const orbit = r() < 0.45;
    const hold = (lapse ? 26 : 20) + r() * 12;
    // where: the valley's middle third, or over the biggest herd (the place with life in it)
    let cx = S * (0.34 + r() * 0.32), cy = S * (0.34 + r() * 0.32);
    if (r() < 0.35) { const h = this.biggestHerd(f, Sp.Bison); if (h) { cx = lim(h[0]); cy = lim(h[1]); } }
    let x0: number, y0: number, x1: number, y1: number, yaw0: number, yaw1: number;
    if (orbit) {
      // a slow circle: the heading sweeps 45 to 80 degrees round a place that drifts a little
      const drift = (r() - 0.5) * 70, da = r() * Math.PI * 2;
      x0 = prev ? prev.x : cx; y0 = prev ? prev.y : cy;
      x1 = lim(x0 + Math.cos(da) * drift); y1 = lim(y0 + Math.sin(da) * drift);
      yaw0 = prev ? prev.yaw : r() * 360;
      yaw1 = yaw0 + (r() < 0.5 ? -1 : 1) * (45 + r() * 35);
    } else {
      // a pan: 170 to 290 m across the land, the camera looking broadside to the move, the heading easing round a few degrees
      const a = r() * Math.PI * 2, L = 170 + r() * 120;
      x0 = prev ? prev.x : lim(cx - Math.cos(a) * L / 2); y0 = prev ? prev.y : lim(cy - Math.sin(a) * L / 2);
      x1 = lim(x0 + Math.cos(a) * L); y1 = lim(y0 + Math.sin(a) * L);
      const broad = Math.atan2(-(y1 - y0), x1 - x0) / DEG + (r() < 0.5 ? 0 : 180);
      yaw0 = prev ? prev.yaw : broad;
      yaw1 = yaw0 + (r() < 0.5 ? -1 : 1) * (8 + r() * 22);
    }
    return { kind: 'drone', id: null, x: x0, y: y0, dist: dist0, pitch: pitch0, yaw: yaw0, hold, drone: { x0, y0, x1, y1, yaw0, yaw1, pitch0, pitch1, dist0, dist1 } };
  }

  /** Fly the drone move: the goal of the camera is set each frame along the path, and the camera's own springs smooth it. */
  private driveDrone(dt: number): void {
    const s = this.current;
    if (!s || !s.drone) return;
    const d = s.drone;
    const u = Math.max(0, Math.min(1, (s.hold - this.t) / s.hold));
    // (a gentle ease at both ends, so the move starts and finishes at rest)
    const e = u * u * (3 - 2 * u), m = 0.5 * u + 0.5 * e;
    const x = d.x0 + (d.x1 - d.x0) * m, y = d.y0 + (d.y1 - d.y0) * m;
    const yaw = d.yaw0 + (d.yaw1 - d.yaw0) * u, pitch = d.pitch0 + (d.pitch1 - d.pitch0) * e, dist = d.dist0 + (d.dist1 - d.dist0) * e;
    this.cam.setView({ x, y, yawDeg: yaw, pitchDeg: pitch, distance: dist });
    this.droneTail = { x, y, yaw, pitch, dist, at: this.clock };
    void dt;
  }

  /** The densest prairie dog town with a land predator within TOWN_THREAT_R of it: a fixed shot between the two, nearer the town. */
  private findTown(f: DirectorFrame): Shot | null {
    const small = f.small;
    if (!small || small.length < 32 * 32 * 4) return null;
    const cs = this.worldSize / 32;
    let best = -1, bestScore = 0, bx = 0, by = 0, px = 0, py = 0;
    for (let c = 0; c < 1024; c++) {
      const town = small[c * 4 + 2], dogs = small[c * 4 + 1];
      if (town < TOWN_MIN || dogs < TOWN_DOGS_MIN) continue;
      const cx = ((c % 32) + 0.5) * cs, cy = (Math.floor(c / 32) + 0.5) * cs;
      // the nearest ground predator
      let nd = TOWN_THREAT_R * TOWN_THREAT_R, nx = 0, ny = 0, found = false;
      for (let k = 0; k < f.count; k++) {
        const o = k * AGENT_STRIDE;
        if (!isLandHunter(f.agents[o])) continue;
        const dx = f.agents[o + 1] - cx, dy = f.agents[o + 2] - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nd) { nd = d2; nx = f.agents[o + 1]; ny = f.agents[o + 2]; found = true; }
      }
      if (!found) continue;
      const score = town + dogs - Math.sqrt(nd);
      if (score > bestScore || best < 0) { best = c; bestScore = score; bx = cx; by = cy; px = nx; py = ny; }
    }
    if (best < 0) return null;
    const r = this.rand();
    return { kind: 'town', id: null, x: bx + (px - bx) * 0.3, y: by + (py - by) * 0.3, dist: 28 + r * 14, pitch: 22 + this.rand() * 8, yaw: this.rand() * 360, hold: 16, lift: 0.5 };
  }

  /** A coyote standing still in the stalk (the sim's mousing): follow it close and low. */
  private findMousing(f: DirectorFrame): Shot | null {
    let pick = -1, n = 0;
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] !== Sp.Coyote || f.agents[o + 7] !== St.Stalk || f.agents[o + 4] >= 0.3) continue;
      n++;
      if (pick < 0 || this.rand() < 1 / n) pick = k;
    }
    if (pick < 0) return null;
    return { kind: 'mousing', id: f.ids[pick], x: 0, y: 0, dist: 10 + this.rand() * 6, pitch: 9 + this.rand() * 7, yaw: this.rand() * 360, hold: 14 };
  }

  /**
   * A group of GROUP_MIN or more migrants (the F_MIGRANT flag) of one species within GROUP_R of each other: follow one of them from far
   * enough back to see the file. `sp` -1 takes any species, `nearX`/`nearY` prefer the group closest to a place (an immigration event).
   */
  private findMigrants(f: DirectorFrame, sp: number, nearX = NaN, nearY = NaN): Shot | null {
    const idx: number[] = [];
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (!(((f.agents[o + 8] | 0) & F_MIGRANT) !== 0) || SPECIES[f.agents[o]]?.flies) continue;
      if (sp >= 0 && f.agents[o] !== sp) continue;
      idx.push(k);
    }
    let best = -1, bestN = 0, bestD = Infinity;
    for (const a of idx) {
      const oa = a * AGENT_STRIDE;
      let n = 0;
      for (const b of idx) {
        const ob = b * AGENT_STRIDE;
        if (f.agents[oa] !== f.agents[ob]) continue;
        if (Math.hypot(f.agents[oa + 1] - f.agents[ob + 1], f.agents[oa + 2] - f.agents[ob + 2]) < GROUP_R) n++;
      }
      if (n < GROUP_MIN) continue;
      const d = Number.isFinite(nearX) ? Math.hypot(f.agents[oa + 1] - nearX, f.agents[oa + 2] - nearY) : 0;
      if (n > bestN || (Number.isFinite(nearX) && d < bestD)) { best = a; bestN = n; bestD = d; }
    }
    if (best < 0) return null;
    return { kind: 'migration', id: f.ids[best], x: 0, y: 0, dist: f.agents[best * AGENT_STRIDE] === Sp.Bison ? 62 + this.rand() * 38 : 22 + this.rand() * 12, pitch: 14 + this.rand() * 7, yaw: this.rand() * 360, hold: 16 };
  }

  /** Event cuts (R3) and headline moments: immigrants arriving, plague in a town, coyotes taking over, a kill, a stampede, a fire, an outbreak. */
  private takeEvents(f: DirectorFrame): void {
    for (const e of f.events ?? []) {
      if (e.tick < this.lastEvTick - 2000) this.lastEvTick = -1; // a new world began: ticks start over
      if (e.tick <= this.lastEvTick) continue;
      this.lastEvTick = Math.max(this.lastEvTick, e.tick);
      const located = e.x !== 0 || e.y !== 0;
      const ea = e.a ?? 0, eb = e.b ?? 0;
      const w: Where = { x: e.x, y: e.y, sp: e.sp, a: ea, b: eb, at: this.clock };
      if (located) {
        this.where.set(e.kind, w);
        this.where.set(`${e.kind}:${e.sp}`, w);
      }
      let name: string | null = null;
      if (e.kind === 'immigrated') name = e.sp === Sp.PrairieDog ? 'town' : e.sp === Sp.Rabbit ? null : 'migration'; // hares have no bodies to film
      else if (e.kind === 'sylvaticPlague' || e.kind === 'townFounded' || e.kind === 'townLost') name = 'town';
      else if (e.kind === 'mesoRelease') name = 'coyotes';
      else if (e.kind === 'firstKill') name = 'kill';
      else if (e.kind === 'stampede') name = ea >= 100 ? 'stampede' : null;
      else if (e.kind === 'outbreak') name = 'group';
      else if (e.kind === 'fire' || e.kind === 'lightningFire') name = 'fire';
      else if (e.kind === 'coyotePups') name = 'coyotes';
      else if (e.kind === 'eaglesArrive') name = 'group';
      else if (e.kind === 'packLost') name = eb >= 300 ? 'wolves' : null; // a pack that lasted a blink is no news
      else if (e.kind === 'packFounded') name = 'wolves';
      if (!name || !located || !this.eventGap(name)) continue;
      this.queueMoment(name, w, false);
    }
  }

  /** Has this kind of event moment, and any event moment, had its quiet gap? Marks the time when it has. */
  private eventGap(name: string): boolean {
    if (this.clock - (this.eventCutAt.get(name) ?? -1e9) < EVENT_KIND_GAP || this.clock - this.anyEventCutAt < EVENT_ANY_GAP) return false;
    // (the gap runs from the request, not from the cut, so a burst of one kind queues one cut)
    this.eventCutAt.set(name, this.clock);
    this.anyEventCutAt = this.clock;
    return true;
  }

  /**
   * A field note was just earned (main.ts calls this from the notebook's onEarn): if it has a place, the camera cuts to it within a
   * couple of seconds, close for one animal and a small group, medium for a herd or a kill, and holds MOMENT_HOLD seconds. Notes with no
   * place (a drought, the first snow, a hundred years) do nothing. Does nothing while the director is off (the player has the camera).
   */
  noteEarned(id: string): void {
    if (!this.enabled) return;
    const W = (k: string): Where | undefined => this.where.get(k);
    switch (id) {
      case 'firstKill': case 'documentary': this.queueMoment('kill', W('firstKill'), true); break;
      case 'stampede100': this.queueMoment('stampede', W('stampede'), true); break;
      case 'packFounded': this.queueMoment('wolves', W('packFounded'), true); break;
      case 'packLost': this.queueMoment('wolves', W('packLost'), true); break;
      case 'wolvesReturn': this.queueMoment('wolves', W('introduced:1'), true); break;
      case 'wolvesOwn': this.queueMoment('wolves', W('immigrated:1'), true); break;
      case 'outbreak': this.queueMoment('group', W('outbreak'), true); break;
      case 'fire': this.queueMoment('fire', W('lightningFire') ?? W('fire'), true); break;
      case 'greenUp': this.queueMoment('fire', W('fire') ?? W('lightningFire'), true); break;
      case 'elder': this.queueMoment('elder', W('elder'), true); break;
      case 'coyotePups': this.queueMoment('coyotes', W('coyotePups'), true); break;
      case 'mousingLeap': this.queueMoment('mousing', undefined, true); break;
      case 'alarmWave': this.queueMoment('town', W('alarm'), true); break;
      case 'townPlague': this.queueMoment('town', W('sylvaticPlague'), true); break;
      case 'pronghornMigration': this.queueMoment('migration', W('immigrated:3') ?? W('emigrated:3'), true, Sp.Deer); break;
      case 'mangeSeen': this.queueMoment('mange', W('mange'), true); break;
      // (no hareBoom moment: jackrabbits are a density field and rarely show as bodies, so the shot framed empty grass; the field note itself stays)
      default: break;
    }
  }

  /** Remember where something happened that has no sim event (a prairie dog alarm wave): a note earned a moment later looks there. */
  markWhere(kind: string, x: number, y: number): void {
    this.where.set(kind, { x, y, sp: -1, a: 0, b: 0, at: this.clock });
  }

  /** Cut to a named moment (see momentResolver). `urgent` is for a field note; `sp` names the species when `w` has none. */
  queueMoment(name: string, w: Where | undefined, urgent: boolean, sp = -1): void {
    if (!this.enabled || this.cls === 'lapse') return; // (years flying by: no close shots, so no moment to cut to)
    const res = this.momentResolver(name, w, sp);
    if (!res) return;
    const ex = this.cuts.find((c) => c.key === name);
    if (ex) {
      if (urgent) ex.urgent = true;
      return;
    }
    this.cuts.push({ key: name, resolve: (f) => this.asMoment(res(f)), at: this.clock, due: this.clock + MOMENT_LEAD, urgent });
    this.cuts.sort((a, b) => Number(b.urgent) - Number(a.urgent)); // stable: notes first, each group in order
    if (this.cuts.length > 4) this.cuts.pop();
  }

  private asMoment(s: Shot | null): Shot | null {
    if (!s) return null;
    s.moment = true;
    s.hold = MOMENT_HOLD;
    return s;
  }

  /** The camera already sits close on this subject (the same wolf, the same carcass): no cut is needed, only a longer hold. */
  private alreadyOn(s: Shot): boolean {
    const c = this.current;
    if (!c || c.dist > s.dist * 1.6 + 4) return false;
    if (s.id !== null || c.id !== null) return s.id === c.id; // the same animal, and no other pairing counts as the same subject
    return Math.hypot(c.x - s.x, c.y - s.y) < 10 && (c.kind === s.kind || (c.lift !== undefined && s.lift !== undefined)); // the same carcass or town
  }

  /** The shot behind a moment name, worked out from the frame when the cut is due. `w` is where it happened, if known. */
  private momentResolver(name: string, w: Where | undefined, sp: number): ((f: DirectorFrame) => Shot | null) | null {
    const wx = w ? w.x : NaN, wy = w ? w.y : NaN;
    const hasW = !!w && Number.isFinite(wx);
    const species = (fallback: number): number => (sp >= 0 ? sp : w && w.sp >= 0 ? w.sp : fallback);
    switch (name) {
      case 'kill': return (f) => this.carcassShot(f, wx, wy, false, 'kill');
      // (a stampede is filmed running, from alongside, when the herd is still running; a herd that has stopped is the framed group)
      case 'stampede': return (f) => this.stampedeShot(f, wx, wy) ?? this.subjectShot(f, Sp.Bison, wx, wy, 'stampede', St.Flee) ?? this.subjectShot(f, Sp.Bison, wx, wy, 'stampede');
      case 'wolves': return (f) => this.subjectShot(f, Sp.Wolf, wx, wy, 'wolves');
      case 'coyotes': return (f) => this.subjectShot(f, Sp.Coyote, wx, wy, 'coyotes');
      case 'mousing': return (f) => this.findMousing(f) ?? this.subjectShot(f, Sp.Coyote, NaN, NaN, 'mousing');
      case 'migration': return (f) => this.findMigrants(f, species(-1), wx, wy) ?? this.subjectShot(f, species(Sp.Deer), wx, wy, 'migration');
      case 'group': return (f) => this.subjectShot(f, species(Sp.Bison), wx, wy, 'moment') ?? this.flagged(f, F_INFECTED, 'moment');
      case 'mange': return (f) => this.flagged(f, F_MANGE, 'moment') ?? this.subjectShot(f, species(Sp.Wolf), wx, wy, 'moment');
      case 'elder': return (f) => {
        if (w && w.b > 0 && this.getPos(w.b, this.tmp)) return { kind: 'moment', id: w.b, x: 0, y: 0, dist: closeDist(w.sp, this.rand()), pitch: 9 + this.rand() * 6, yaw: this.rand() * 360, hold: MOMENT_HOLD };
        return this.subjectShot(f, species(Sp.Bison), wx, wy, 'moment');
      };
      case 'fire':
        if (!hasW) return null;
        return () => ({ kind: 'moment', id: null, x: wx, y: wy, dist: 62 + this.rand() * 14, pitch: 20 + this.rand() * 6, yaw: this.rand() * 360, hold: MOMENT_HOLD });
      case 'town': return (f) => this.townShot(f, wx, wy);
      case 'hares': return (f) => this.hareShot(f, wx, wy);
      default: return null;
    }
  }

  /** A stampede running now, near a place: the lead bison of the herd, tracked from alongside. */
  private stampedeShot(f: DirectorFrame, x: number, y: number): Shot | null {
    const m = this.findMotion(f, { sp: Sp.Bison, x: Number.isFinite(x) ? x : undefined, y: Number.isFinite(y) ? y : undefined, r: 140 });
    return m && m.track ? m : null;
  }

  /** The first animal with a flag bit (infected, mange), framed close. */
  private flagged(f: DirectorFrame, bit: number, kind: ShotKind): Shot | null {
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (((f.agents[o + 8] | 0) & bit) !== 0 && !SPECIES[f.agents[o]]?.flies) return this.subjectShot(f, f.agents[o], f.agents[o + 1], f.agents[o + 2], kind);
    }
    return null;
  }

  /**
   * Film a species near a place: one animal close (8 to 20 m by size), or, when a group of three or more stands around the nearest one,
   * the group from far enough to hold it (22 to 60 m), following the animal nearest the group's middle. No place: near the camera's focus.
   * `onlyState` limits it to animals in one state (the fleeing bison of a stampede).
   */
  private subjectShot(f: DirectorFrame, sp: number, x: number, y: number, kind: ShotKind, onlyState = -1): Shot | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const fc = this.cam.getFocus(this.tmp);
      x = fc.x; y = fc.z;
    }
    // the nearest animal of the species to the place; a small one is not lost behind a crowd of other species (the pronghorn among the
    // bison), so each other animal within 9 m of it counts as 8 m of distance
    const small = sp !== Sp.Bison && SPECIES[sp]?.flies !== true;
    let best = -1, bd = Infinity;
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] !== sp || (onlyState >= 0 && f.agents[o + 7] !== onlyState)) continue;
      let d = Math.hypot(f.agents[o + 1] - x, f.agents[o + 2] - y);
      if (small && d < bd + 160) {
        let crowd = 0;
        for (let j = 0; j < f.count && crowd < 12; j++) {
          const q = j * AGENT_STRIDE;
          if (f.agents[q] === sp || Math.abs(f.agents[q + 1] - f.agents[o + 1]) > 9 || Math.abs(f.agents[q + 2] - f.agents[o + 2]) > 9) continue;
          crowd++;
        }
        d += crowd * 8;
      }
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return null;
    const ob = best * AGENT_STRIDE, bx = f.agents[ob + 1], by = f.agents[ob + 2];
    // the group around it
    let n = 0, cx = 0, cy = 0;
    const near: number[] = [];
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] !== sp || (onlyState >= 0 && f.agents[o + 7] !== onlyState)) continue;
      if (Math.hypot(f.agents[o + 1] - bx, f.agents[o + 2] - by) > (sp === Sp.Bison ? 45 : 30)) continue;
      n++; cx += f.agents[o + 1]; cy += f.agents[o + 2];
      near.push(k);
    }
    const flies = SPECIES[sp]?.flies === true;
    const r = this.rand();
    if (n < 3 || flies) {
      const air = flies && f.agents[ob + 9] > 3;
      return { kind, id: f.ids[best], x: 0, y: 0, dist: closeDist(sp, r), pitch: air ? 8 + this.rand() * 8 : 9 + this.rand() * 6, yaw: this.rand() * 360, hold: MOMENT_HOLD, air };
    }
    cx /= n; cy /= n;
    let spread = 0, mid = near[0], md = Infinity;
    for (const k of near) {
      const o = k * AGENT_STRIDE;
      const d = Math.hypot(f.agents[o + 1] - cx, f.agents[o + 2] - cy);
      spread += d * d;
      if (d < md) { md = d; mid = k; }
    }
    spread = Math.sqrt(spread / n);
    const big = sp === Sp.Bison;
    // a small species scattered among bison is a handful of specks from afar: follow the one nearest the place, close. Only a tight group
    // (a few metres across) is framed as a group.
    if (!big && spread > 9) return { kind, id: f.ids[best], x: 0, y: 0, dist: closeDist(sp, r), pitch: 9 + this.rand() * 6, yaw: this.rand() * 360, hold: MOMENT_HOLD };
    const dist = Math.min(big ? 62 : 32, Math.max(big ? 34 : 18, closeDist(sp, r) + spread * (big ? 2.4 : 2.2)));
    return { kind, id: f.ids[mid], x: 0, y: 0, dist, pitch: 12 + this.rand() * 8, yaw: this.rand() * 360, hold: MOMENT_HOLD };
  }

  /**
   * A carcass with the animals on it. With a place, the freshest carcass within `reach` (70) m of it; without, the freshest on the map. Scored by
   * the ravens and feeders within 16 m (`needBirds`: no ravens or raptors there, no shot). Framed from the side at 20 to 44 m with the
   * dirt a little below centre, so the birds on and over it are in frame, not the empty sky above. `minFresh` is the least remaining
   * fraction of the carcass that counts (a kill just made is whole). The shot keeps the carcass in frame or is dropped (see monitor).
   */
  private carcassShot(f: DirectorFrame, nx: number, ny: number, needBirds: boolean, kind: ShotKind, minFresh = 0.1, reach = 70): Shot | null {
    let best = -1, bestScore = -Infinity, bestBirds = 0;
    const near = Number.isFinite(nx) && Number.isFinite(ny);
    for (let k = 0; k < f.carcassCount; k++) {
      const c = k * CARCASS_STRIDE;
      const fresh = f.carcasses[c + 2];
      if (fresh <= minFresh) continue;
      const cx = f.carcasses[c], cy = f.carcasses[c + 1];
      const d = near ? Math.hypot(cx - nx, cy - ny) : 0;
      if (near && d > reach) continue;
      let birds = 0, feeders = 0, crowd = 0;
      for (let j = 0; j < f.count; j++) {
        const o = j * AGENT_STRIDE;
        const sp = f.agents[o];
        const dd = Math.hypot(f.agents[o + 1] - cx, f.agents[o + 2] - cy);
        if (dd > 16) continue;
        const isBird = sp === Sp.Raven || SPECIES[sp]?.guild === 'raptor';
        if (isBird) birds++;
        else if (isPredator(sp) || sp === Sp.Coyote) feeders++;
        else if (dd < 10) crowd++; // living grazers standing over it hide it
      }
      if (needBirds && birds === 0) continue;
      const score = birds * 2 + feeders * 2.5 + fresh * 3 - d / 30 - Math.min(crowd, 12) * 0.2;
      if (score > bestScore) { bestScore = score; best = k; bestBirds = birds; }
    }
    if (best < 0) return null;
    const c = best * CARCASS_STRIDE;
    const bigPrey = f.carcasses[c + 3] === Sp.Bison;
    const r = this.rand();
    // a flock over it needs room; a lone bird or none, closer
    const dist = (bigPrey ? 32 + r * 10 : 20 + r * 8) * (bestBirds >= 3 ? 1.15 : 1);
    return { kind, id: null, x: f.carcasses[c], y: f.carcasses[c + 1], dist, pitch: 15 + this.rand() * 7, yaw: this.rand() * 360, hold: kind === 'kill' ? MOMENT_HOLD : 14, lift: 1.2, carcass: true };
  }

  /**
   * The prairie dog town around a place (or, with none, the densest town on the map): the middle of its dogs, framed from 17 to 36 m by how
   * wide it spreads, high enough to see the burrows and the dogs between them.
   */
  private townShot(f: DirectorFrame, x: number, y: number): Shot | null {
    const small = f.small;
    const hasXY = Number.isFinite(x) && Number.isFinite(y);
    const fallback = (): Shot | null => (hasXY ? { kind: 'town', id: null, x, y, dist: 34, pitch: 26, yaw: this.rand() * 360, hold: MOMENT_HOLD, lift: 0.5 } : null);
    if (!small || small.length < 32 * 32 * 4) return fallback();
    const cs = this.worldSize / 32;
    // the cells that are town or have dogs, and the heaviest of them
    const all: Array<[number, number, number]> = [];
    let bestW = 0, bx = 0, by = 0;
    for (let c = 0; c < 1024; c++) {
      const town = small[c * 4 + 2], dogs = small[c * 4 + 1];
      if (town < TOWN_MIN * 0.6 && dogs < TOWN_DOGS_MIN) continue;
      const px = ((c % 32) + 0.5) * cs, py = (Math.floor(c / 32) + 0.5) * cs;
      const w = dogs + town * 0.1; // the dogs, not the burrow mounds, say where to look
      all.push([px, py, w]);
      if (w > bestW) { bestW = w; bx = px; by = py; }
    }
    // the town round the place, or round the densest cell when there is no place
    const ax = hasXY ? x : bx, ay = hasXY ? y : by;
    let wsum = 0, cx = 0, cy = 0;
    const cells = all.filter(([px, py]) => Math.hypot(px - ax, py - ay) <= 80);
    for (const [px, py, w] of cells) { wsum += w; cx += px * w; cy += py * w; }
    if (wsum <= 0) return fallback();
    cx /= wsum; cy /= wsum;
    let extent = 0;
    for (const [px, py] of cells) extent = Math.max(extent, Math.hypot(px - cx, py - cy));
    // a place inside the town (an alarm wave starting) pulls the middle toward it, so the wave's origin is not at the edge of frame
    if (hasXY && Math.hypot(x - cx, y - cy) < extent + cs) { cx = cx * 0.6 + x * 0.4; cy = cy * 0.6 + y * 0.4; }
    return { kind: 'town', id: null, x: cx, y: cy, dist: Math.min(36, 17 + extent * 0.5), pitch: 26 + this.rand() * 6, yaw: this.rand() * 360, hold: MOMENT_HOLD, lift: 0.5 };
  }

  /** The densest jackrabbit cell (R of the small-prey fields), near a place if given: close, since hares are small and fast. */
  private hareShot(f: DirectorFrame, x: number, y: number): Shot | null {
    const small = f.small;
    if (!small || small.length < 32 * 32 * 4) return null;
    const cs = this.worldSize / 32;
    const hasXY = Number.isFinite(x) && Number.isFinite(y);
    let best = -1, bw = 0;
    for (let c = 0; c < 1024; c++) {
      const hares = small[c * 4];
      if (hares < 12) continue;
      const w = hares - (hasXY ? Math.hypot(((c % 32) + 0.5) * cs - x, (Math.floor(c / 32) + 0.5) * cs - y) / 8 : 0);
      if (best < 0 || w > bw) { best = c; bw = w; }
    }
    if (best < 0) return null;
    return { kind: 'moment', id: null, x: ((best % 32) + 0.5) * cs, y: (Math.floor(best / 32) + 0.5) * cs, dist: 15 + this.rand() * 5, pitch: 18 + this.rand() * 6, yaw: this.rand() * 360, hold: MOMENT_HOLD, lift: 0.4 };
  }

  /**
   * The densest herd of a species: the middle of its animals in the busiest block of the 16 x 16 grid (not the block's centre, which can
   * be empty ground), how many there are, and the animal nearest the middle.
   */
  private herdOf(f: DirectorFrame, sp: number): { x: number; y: number; n: number; id: number } | null {
    const B = 16, cs = this.worldSize / B;
    const h = new Int32Array(B * B);
    const cell = (o: number): number => {
      const bx = Math.min(B - 1, Math.max(0, Math.floor(f.agents[o + 1] / cs)));
      const by = Math.min(B - 1, Math.max(0, Math.floor(f.agents[o + 2] / cs)));
      return by * B + bx;
    };
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] === sp) h[cell(o)]++;
    }
    let best = 0;
    for (let b = 1; b < h.length; b++) if (h[b] > h[best]) best = b;
    if (h[best] === 0) return null;
    let sx = 0, sy = 0;
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] === sp && cell(o) === best) { sx += f.agents[o + 1]; sy += f.agents[o + 2]; }
    }
    const x = sx / h[best], y = sy / h[best];
    let id = -1, md = Infinity;
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] !== sp || cell(o) !== best) continue;
      const d = Math.hypot(f.agents[o + 1] - x, f.agents[o + 2] - y);
      if (d < md) { md = d; id = f.ids[k]; }
    }
    return { x, y, n: h[best], id };
  }

  private biggestHerd(f: DirectorFrame, sp: number): [number, number] | null {
    const h = this.herdOf(f, sp);
    return h ? [h.x, h.y] : null;
  }
}
