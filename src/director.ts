// Documentary auto-director: in cinematic mode it picks what to film from what is actually happening
// (a hunt, a stampede, ravens over a kill, a herd at golden hour, pronghorn, a vista) and frames it.
import * as THREE from 'three';
import type { DroneCamera } from './render/camera';
import { AGENT_STRIDE, CARCASS_STRIDE, F_MIGRANT, Sp, St } from './sim/types';
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
  events?: Array<{ tick: number; kind: string; sp: number; x: number; y: number }>;
}

type ShotKind = 'hunt' | 'stampede' | 'ravens' | 'herd' | 'pronghorn' | 'vista' | 'wolves' | 'town' | 'mousing' | 'migration' | 'coyotes' | 'stoop' | 'raptor';

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
  private cuts: Array<{ shot: Shot; at: number }> = [];
  private clock = 0;
  private lastEvTick = -1;

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
  private clearYaw(sx: number, sy: number, pitchDeg: number, baseYaw: number): number {
    const reach = Math.min(70, 12 / Math.max(0.05, Math.tan((pitchDeg * Math.PI) / 180)));
    let best = baseYaw, bestScore = Infinity;
    for (let k = 0; k < 8; k++) {
      const yaw = baseYaw + k * 45;
      const r = (yaw * Math.PI) / 180, dx = Math.sin(r), dy = Math.cos(r);
      let score = 0;
      for (let d = 5; d <= reach; d += 3) score += this.coverAt(sx + dx * d, sy + dy * d) * (1 - d / (reach + 1));
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
    if (f.events && f.events.length) this.takeEvents(f);
    // a hunt in progress is worth cutting to early (checked twice a second, after 5 s of the current shot)
    let huntNow: Shot | null = null;
    if (this.current && this.current.kind !== 'hunt' && this.current.kind !== 'stoop' && this.current.hold - this.t > 5 && this.scan <= 0) {
      this.scan = 0.5;
      huntNow = this.findHunt(f);
    }
    // a raptor beginning a stoop is over in a few seconds (R5): cut to it as soon as the current shot has run 3 s, never over a hunt or another stoop
    if (!huntNow && this.current && this.current.kind !== 'hunt' && this.current.kind !== 'stoop' && this.current.hold - this.t > 3 && this.stoopScan <= 0) {
      this.stoopScan = 0.25;
      huntNow = this.findStoop(f);
    }
    // an event worth a cut (R3): once the current shot has run a few seconds, never over a hunt that is still young
    let evNow: Shot | null = null;
    while (this.cuts.length && this.clock - this.cuts[0].at > CUT_STALE) this.cuts.shift();
    if (this.cuts.length && !huntNow && (!this.current || (this.current.hold - this.t > CUT_AFTER && (this.current.kind !== 'hunt' || this.current.hold - this.t > 10)))) {
      evNow = this.cuts.shift()!.shot;
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
    if (known) shot.yaw = this.clearYaw(sx, sy, shot.pitch, shot.yaw);
    // an editor cuts to a subject across the valley rather than flying the camera through the trees to reach it;
    // near subjects get a glide that eases in and out
    const focus = this.cam.getFocus(this.tmp);
    const far = known && Math.hypot(sx - focus.x, sy - focus.z) > 0.6 * Math.max(this.cam.distance, shot.dist) + 40;
    const turn = Math.abs(((shot.yaw - this.cam.yawDeg) % 360 + 540) % 360 - 180);
    const cut = far || turn > 75 || Math.abs(shot.dist - this.cam.distance) > 0.6 * Math.max(shot.dist, this.cam.distance);
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
      this.cam.setView({ x: shot.x, y: shot.y, distance: shot.dist, pitchDeg: shot.pitch, yawDeg: shot.yaw }, cut);
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
    if (f.carcassCount > 0 && !this.recent('ravens')) {
      const c = Math.floor(r() * f.carcassCount) * CARCASS_STRIDE;
      if (f.carcasses[c + 2] > 0.3) {
        cands.push({ kind: 'ravens', id: null, x: f.carcasses[c], y: f.carcasses[c + 1], dist: 45 + r() * 25, pitch: 24 + r() * 10, yaw: r() * 360, hold: 14 });
      }
    }
    // the biggest herd
    if (!this.recent('herd')) {
      const herd = this.biggestHerd(f, Sp.Bison);
      if (herd) cands.push({ kind: 'herd', id: null, x: herd[0], y: herd[1], dist: 65 + r() * 45, pitch: 16 + r() * 10, yaw: r() * 360, hold: 20 });
    }
    // a wolf pack on the move
    if (!this.recent('wolves')) {
      const ids: number[] = [];
      for (let k = 0; k < f.count; k++) if (f.agents[k * AGENT_STRIDE] === Sp.Wolf) ids.push(f.ids[k]);
      if (ids.length) cands.push({ kind: 'wolves', id: ids[Math.floor(r() * ids.length)], x: 0, y: 0, dist: 45 + r() * 25, pitch: 16 + r() * 8, yaw: r() * 360, hold: 16 });
    }
    // pronghorn, low and close
    if (!this.recent('pronghorn')) {
      const p = this.biggestHerd(f, Sp.Deer);
      if (p) cands.push({ kind: 'pronghorn', id: null, x: p[0], y: p[1], dist: 60 + r() * 30, pitch: 10 + r() * 6, yaw: r() * 360, hold: 16 });
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
    return { kind: 'town', id: null, x: bx + (px - bx) * 0.3, y: by + (py - by) * 0.3, dist: 42 + r * 22, pitch: 20 + this.rand() * 8, yaw: this.rand() * 360, hold: 16 };
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
    return { kind: 'mousing', id: f.ids[pick], x: 0, y: 0, dist: 14 + this.rand() * 9, pitch: 9 + this.rand() * 7, yaw: this.rand() * 360, hold: 14 };
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
    return { kind: 'migration', id: f.ids[best], x: 0, y: 0, dist: 62 + this.rand() * 38, pitch: 14 + this.rand() * 7, yaw: this.rand() * 360, hold: 16 };
  }

  /** Event cuts (R3): immigrants arriving, plague in a town, coyotes taking over after the wolves. */
  private takeEvents(f: DirectorFrame): void {
    for (const e of f.events ?? []) {
      if (e.tick < this.lastEvTick - 2000) this.lastEvTick = -1; // a new world began: ticks start over
      if (e.tick <= this.lastEvTick) continue;
      this.lastEvTick = Math.max(this.lastEvTick, e.tick);
      let shot: Shot | null = null;
      if (e.kind === 'immigrated') {
        if (e.sp === Sp.PrairieDog) shot = { kind: 'town', id: null, x: e.x, y: e.y, dist: 55, pitch: 24, yaw: this.rand() * 360, hold: 14 };
        else if (e.sp === Sp.Rabbit) shot = null; // hares have no bodies to film
        else shot = this.findMigrants(f, e.sp, e.x, e.y) ?? this.followNear(f, e.sp, e.x, e.y, 'migration', 70, 18);
      } else if (e.kind === 'sylvaticPlague') {
        shot = { kind: 'town', id: null, x: e.x, y: e.y, dist: 50 + this.rand() * 15, pitch: 24 + this.rand() * 6, yaw: this.rand() * 360, hold: 16 };
      } else if (e.kind === 'mesoRelease') {
        shot = this.followNear(f, Sp.Coyote, e.x, e.y, 'coyotes', 38 + this.rand() * 14, 15);
      }
      if (shot) {
        this.cuts.push({ shot, at: this.clock });
        if (this.cuts.length > 3) this.cuts.shift();
      }
    }
  }

  /** Follow the animal of a species nearest a place (any distance); null if there is none. */
  private followNear(f: DirectorFrame, sp: number, x: number, y: number, kind: ShotKind, dist: number, pitch: number): Shot | null {
    let best = -1, bd = Infinity;
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] !== sp) continue;
      const d = Math.hypot(f.agents[o + 1] - x, f.agents[o + 2] - y);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return null;
    return { kind, id: f.ids[best], x: 0, y: 0, dist, pitch: pitch + this.rand() * 5, yaw: this.rand() * 360, hold: 15 };
  }

  private biggestHerd(f: DirectorFrame, sp: number): [number, number] | null {
    const B = 16, cs = this.worldSize / B;
    const h = new Int32Array(B * B);
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] !== sp) continue;
      const bx = Math.min(B - 1, Math.max(0, Math.floor(f.agents[o + 1] / cs)));
      const by = Math.min(B - 1, Math.max(0, Math.floor(f.agents[o + 2] / cs)));
      h[by * B + bx]++;
    }
    let best = 0;
    for (let b = 1; b < h.length; b++) if (h[b] > h[best]) best = b;
    if (h[best] === 0) return null;
    return [((best % B) + 0.5) * cs, (Math.floor(best / B) + 0.5) * cs];
  }
}
