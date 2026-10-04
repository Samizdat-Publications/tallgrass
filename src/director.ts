// Documentary auto-director: in cinematic mode it picks what to film from what is actually happening
// (a hunt, a stampede, ravens over a kill, a herd at golden hour, pronghorn, a vista) and frames it.
import * as THREE from 'three';
import type { DroneCamera } from './render/camera';
import { AGENT_STRIDE, CARCASS_STRIDE, Sp, St } from './sim/types';

export interface DirectorFrame {
  count: number;
  ids: Uint32Array;
  agents: Float32Array;
  carcassCount: number;
  carcasses: Float32Array;
  dayFrac: number;
}

type ShotKind = 'hunt' | 'stampede' | 'ravens' | 'herd' | 'pronghorn' | 'vista' | 'wolves';

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
}

export class Director {
  enabled = false;
  current: Shot | null = null;
  private t = 0;
  private scan = 0;
  private last: ShotKind[] = [];
  private rngState = 12345;
  private tmp = new THREE.Vector3();

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
    // a hunt in progress is worth cutting to early (checked twice a second, after 5 s of the current shot)
    let huntNow: Shot | null = null;
    if (this.current && this.current.kind !== 'hunt' && this.current.hold - this.t > 5 && this.scan <= 0) {
      this.scan = 0.5;
      huntNow = this.findHunt(f);
    }
    if (this.t > 0 && !huntNow) {
      // if the followed animal died, end the shot
      if (this.current?.id != null && !this.getPos(this.current.id, this.tmp)) this.t = 0;
      else return;
    }
    const shot = huntNow ?? this.pick(f);
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
    this.cam.followSmoothTime = shot.id !== null ? 1.1 : 0.4;
    this.cam.followDeadzone = shot.id !== null ? 0.13 : 0.055;
    if (shot.id !== null) {
      const id = shot.id;
      const p = new THREE.Vector3();
      this.cam.follow(() => (this.getPos(id, p) ? { x: p.x, y: p.z } : null));
      this.cam.setView({ ...(cut && known ? { x: sx, y: sy } : {}), distance: shot.dist, pitchDeg: shot.pitch, yawDeg: shot.yaw }, cut && known);
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

  private findHunt(f: DirectorFrame): Shot | null {
    for (let k = 0; k < f.count; k++) {
      const o = k * AGENT_STRIDE;
      if (f.agents[o] === Sp.Wolf && f.agents[o + 7] === St.Chase) {
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
    // a vista every so often
    if (!this.recent('vista')) {
      // a vista still has life in it: the valley seen from behind a herd
      const h = this.biggestHerd(f, Sp.Bison) ?? [this.worldSize / 2, this.worldSize / 2];
      cands.push({ kind: 'vista', id: null, x: h[0], y: h[1], dist: 230 + r() * 90, pitch: 14 + r() * 8, yaw: r() * 360, hold: 18 });
    }
    return cands[Math.floor(r() * cands.length)] ?? { kind: 'vista', id: null, x: this.worldSize / 2, y: this.worldSize / 2, dist: 380, pitch: 20, yaw: 0, hold: 20 };
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
