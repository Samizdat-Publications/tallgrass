// Documentary auto-director: in cinematic mode it picks what to film from what is actually happening
// (a hunt, a stampede, ravens over a kill, a herd at golden hour, pronghorn, a vista) and frames it.
import * as THREE from 'three';
import type { DroneCamera } from './render/camera';
import { AGENT_STRIDE, CARCASS_STRIDE, F_INFECTED, F_MANGE, F_MIGRANT, Sp, St } from './sim/types';
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
}

type ShotKind = 'hunt' | 'stampede' | 'ravens' | 'herd' | 'pronghorn' | 'vista' | 'wolves' | 'town' | 'mousing' | 'migration' | 'coyotes' | 'stoop' | 'raptor' | 'kill' | 'moment';

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
}

export class Director {
  enabled = false;
  current: Shot | null = null;
  private t = 0;
  private scan = 0;
  private stoopScan = 0;
  private last: ShotKind[] = [];
  private rngState = 12345;
  private tmp = new THREE.Vector3();
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

  constructor(
    private cam: DroneCamera,
    private getPos: (id: number, out: THREE.Vector3) => boolean,
    private worldSize: number,
    /** Tree and shrub cover 0..1 at a sim position, so shots aren't filmed through a grove. */
    private coverAt: (x: number, y: number) => number = () => 0,
  ) {}

  /**
   * Of eight headings around the subject, the one with the least canopy between camera and subject. Only the stretch
   * where the camera ray is still below crown height (about 12 m) can be blocked.
   */
  private clearYaw(sx: number, sy: number, pitchDeg: number, baseYaw: number, dist: number, lift: number): number {
    const reach = Math.min(70, 12 / Math.max(0.05, Math.tan((pitchDeg * Math.PI) / 180)));
    let best = baseYaw, bestScore = Infinity;
    for (let k = 0; k < 8; k++) {
      const yaw = baseYaw + k * 45;
      const r = (yaw * Math.PI) / 180, dx = Math.sin(r), dy = Math.cos(r);
      let score = 0;
      for (let d = 5; d <= reach; d += 3) score += this.coverAt(sx + dx * d, sy + dy * d) * (1 - d / (reach + 1));
      // and the camera's own collision test: a heading whose whole boom is free of crowns and trunks wins, so a shot begins clear
      // instead of swinging round a tree after it starts (1 when the camera has no tree list)
      score += (1 - this.cam.headingReach(sx, sy, lift, yaw, pitchDeg, dist)) * 6;
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
    if (!this.enabled || !s || s.dist > maxDist) return null;
    return { id: s.id, x: s.x, y: s.y, dist: s.dist };
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.t = 0;
    this.current = null;
    this.cuts = []; // a player who takes the camera is never pulled away by a cut that was queued before
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

  update(dt: number, f: DirectorFrame | null): void {
    if (!this.enabled || !f) return;
    this.t -= dt;
    this.scan -= dt;
    this.stoopScan -= dt;
    this.clock += dt;
    this.frame = f;
    if (f.events && f.events.length) this.takeEvents(f);
    // a moment (a field note, a headline event) holds the camera: no hunt or stoop scan cuts away from it
    const inMoment = this.current?.moment === true;
    // a hunt in progress is worth cutting to early (checked twice a second, after 5 s of the current shot)
    let huntNow: Shot | null = null;
    if (!inMoment && this.current && this.current.kind !== 'hunt' && this.current.kind !== 'stoop' && this.current.hold - this.t > 5 && this.scan <= 0) {
      this.scan = 0.5;
      huntNow = this.findHunt(f);
    }
    // a raptor beginning a stoop is over in a few seconds (R5): cut to it as soon as the current shot has run 3 s, never over a hunt or another stoop
    if (!huntNow && !inMoment && this.current && this.current.kind !== 'hunt' && this.current.kind !== 'stoop' && this.current.hold - this.t > 3 && this.stoopScan <= 0) {
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
      const huntOk = due.urgent || this.current?.kind !== 'hunt' || run > 10;
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
    if (this.t > 0 && !huntNow && !evNow) {
      // if the followed animal died, end the shot
      if (this.current?.id != null && !this.getPos(this.current.id, this.tmp)) this.t = 0;
      else return;
    }
    const shot = huntNow ?? evNow ?? this.pick(f);
    this.current = shot;
    this.t = shot.hold;
    this.last.push(shot.kind);
    if (this.last.length > 3) this.last.shift();
    // film from the side with a clear line of sight
    const v = new THREE.Vector3();
    const ok = shot.id !== null ? this.getPos(shot.id, v) : false;
    const sx = shot.id !== null ? (ok ? v.x : NaN) : shot.x, sy = shot.id !== null ? (ok ? v.z : NaN) : shot.y;
    const known = Number.isFinite(sx) && Number.isFinite(sy);
    if (known) shot.yaw = this.clearYaw(sx, sy, shot.pitch, shot.yaw, shot.dist, shot.air && ok ? Math.max(0, v.y - this.cam.groundAt(sx, sy)) : 0);
    // an editor cuts to a subject across the valley rather than flying the camera through the trees to reach it;
    // near subjects get a glide that eases in and out
    const focus = this.cam.getFocus(this.tmp);
    const far = known && Math.hypot(sx - focus.x, sy - focus.z) > 0.6 * Math.max(this.cam.distance, shot.dist) + 40;
    const turn = Math.abs(((shot.yaw - this.cam.yawDeg) % 360 + 540) % 360 - 180);
    // (a moment is a cut unless the subject is already in the middle of the frame: an eased glide takes longer than the couple of seconds it has)
    const offCentre = shot.moment === true && known && Math.hypot(sx - focus.x, sy - focus.z) > 8;
    const cut = far || offCentre || turn > 75 || Math.abs(shot.dist - this.cam.distance) > 0.6 * Math.max(shot.dist, this.cam.distance);
    // a documentary operator lets the subject drift in frame and eases after it, so the background doesn't judder
    // (a stoop is a 30 m/s dive: the operator has to stay with it, so the follow is tight)
    const diving = shot.kind === 'stoop';
    this.cam.followSmoothTime = shot.id !== null ? (diving ? 0.4 : 1.1) : 0.4;
    this.cam.followDeadzone = shot.id !== null ? (diving ? 0.05 : 0.13) : 0.055;
    if (shot.id !== null) {
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
    if (!cut) this.cam.easeIn();
  }

  private recent(k: ShotKind): boolean {
    return this.last.includes(k);
  }

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

  private findHunt(f: DirectorFrame): Shot | null {
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (isLandHunter(f.agents[o]) && f.agents[o + 7] === St.Chase) {
        return { kind: 'hunt', id: f.ids[k], x: 0, y: 0, dist: 38 + this.rand() * 18, pitch: 14 + this.rand() * 8, yaw: this.rand() * 360, hold: 14 };
      }
    }
    return null;
  }

  private pick(f: DirectorFrame): Shot {
    const r = () => this.rand();
    const cands: Shot[] = [];
    const hunt = this.findHunt(f);
    if (hunt) cands.push(hunt, hunt);
    // stampede: many fleeing bison
    let fleeing = -1, nFlee = 0;
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] === Sp.Bison && f.agents[o + 7] === St.Flee) { nFlee++; if (fleeing < 0 || r() < 0.05) fleeing = k; }
    }
    if (nFlee > 25 && !this.recent('stampede')) {
      cands.push({ kind: 'stampede', id: f.ids[fleeing], x: 0, y: 0, dist: 70 + r() * 40, pitch: 20 + r() * 8, yaw: r() * 360, hold: 16 });
    }
    // ravens over a kill
    // (the carcass with the most birds on it, framed close from the side: not a random one seen from 70 m up)
    if (f.carcassCount > 0 && !this.recent('ravens')) {
      const rv = this.carcassShot(f, NaN, NaN, true, 'ravens');
      if (rv) cands.push(rv, rv);
    }
    // the biggest herd
    if (!this.recent('herd')) {
      const herd = this.herdOf(f, Sp.Bison);
      if (herd) cands.push({ kind: 'herd', id: null, x: herd.x, y: herd.y, dist: 52 + r() * 28, pitch: 16 + r() * 10, yaw: r() * 360, hold: 20 });
    }
    // a wolf pack on the move
    if (!this.recent('wolves')) {
      const ids: number[] = [];
      for (let k = 0; k < f.count; k++) if (f.agents[k * AGENT_STRIDE] === Sp.Wolf) ids.push(f.ids[k]);
      if (ids.length) cands.push({ kind: 'wolves', id: ids[Math.floor(r() * ids.length)], x: 0, y: 0, dist: 24 + r() * 14, pitch: 12 + r() * 8, yaw: r() * 360, hold: 16 });
    }
    // pronghorn, low and close
    if (!this.recent('pronghorn')) {
      // (follow one of the herd, close: pronghorn are a metre long and were specks from 60 m)
      const p = this.herdOf(f, Sp.Deer);
      if (p) cands.push({ kind: 'pronghorn', id: p.id, x: 0, y: 0, dist: p.n >= 6 ? 26 + r() * 12 : 14 + r() * 8, pitch: 10 + r() * 6, yaw: r() * 360, hold: 16 });
    }
    // a prairie dog town with a predator near (R3): the alarm wave sweeps the town
    if (!this.recent('town')) {
      const t = this.findTown(f);
      if (t) cands.push(t, t);
    }
    // a coyote standing very still, mousing: the leap
    if (!this.recent('mousing')) {
      const m = this.findMousing(f);
      if (m) cands.push(m, m);
    }
    // a raptor mid-stoop, or soaring (R5)
    const stoop = this.findStoop(f);
    if (stoop) cands.push(stoop, stoop);
    if (!this.recent('raptor')) {
      const rp = this.findRaptor(f);
      if (rp) cands.push(rp);
    }
    // a group on the move through a corridor
    if (!this.recent('migration')) {
      const g = this.findMigrants(f, -1);
      if (g) cands.push(g);
    }
    // a vista every so often
    if (!this.recent('vista')) {
      // a vista still has life in it: the valley seen from behind a herd
      const h = this.biggestHerd(f, Sp.Bison) ?? [this.worldSize / 2, this.worldSize / 2];
      cands.push({ kind: 'vista', id: null, x: h[0], y: h[1], dist: 230 + r() * 90, pitch: 14 + r() * 8, yaw: r() * 360, hold: 18 });
    }
    return cands[Math.floor(r() * cands.length)] ?? { kind: 'vista', id: null, x: this.worldSize / 2, y: this.worldSize / 2, dist: 380, pitch: 20, yaw: 0, hold: 20 };
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
      case 'hareBoom': this.queueMoment('hares', W('hareBoom'), true); break;
      default: break;
    }
  }

  /** Remember where something happened that has no sim event (a prairie dog alarm wave): a note earned a moment later looks there. */
  markWhere(kind: string, x: number, y: number): void {
    this.where.set(kind, { x, y, sp: -1, a: 0, b: 0, at: this.clock });
  }

  /** Cut to a named moment (see momentResolver). `urgent` is for a field note; `sp` names the species when `w` has none. */
  queueMoment(name: string, w: Where | undefined, urgent: boolean, sp = -1): void {
    if (!this.enabled) return;
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
      case 'stampede': return (f) => this.subjectShot(f, Sp.Bison, wx, wy, 'stampede', St.Flee) ?? this.subjectShot(f, Sp.Bison, wx, wy, 'stampede');
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
   * A carcass with the animals on it. With a place, the freshest carcass within 70 m of it; without, the freshest on the map. Scored by
   * the ravens and feeders within 16 m (`needBirds`: no ravens or raptors there, no shot). Framed from the side at 20 to 44 m with the
   * dirt a little below centre, so the birds on and over it are in frame, not the empty sky above.
   */
  private carcassShot(f: DirectorFrame, nx: number, ny: number, needBirds: boolean, kind: ShotKind): Shot | null {
    let best = -1, bestScore = -Infinity, bestBirds = 0;
    const near = Number.isFinite(nx) && Number.isFinite(ny);
    for (let k = 0; k < f.carcassCount; k++) {
      const c = k * CARCASS_STRIDE;
      const fresh = f.carcasses[c + 2];
      if (fresh <= 0.1) continue;
      const cx = f.carcasses[c], cy = f.carcasses[c + 1];
      const d = near ? Math.hypot(cx - nx, cy - ny) : 0;
      if (near && d > 70) continue;
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
    return { kind, id: null, x: f.carcasses[c], y: f.carcasses[c + 1], dist, pitch: 15 + this.rand() * 7, yaw: this.rand() * 360, hold: kind === 'kill' ? MOMENT_HOLD : 14, lift: 1.2 };
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
