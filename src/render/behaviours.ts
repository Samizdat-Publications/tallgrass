// R8 behaviour library, bison side: everything the animal layer needs to give the bison their small lives that is not in the sim snapshot.
//   - wallow: on bare, dry ground an animal that is standing about lies down and rolls over onto its side and back, legs kicking, dust rising
//   - rub: an animal near a cottonwood walks up to it, stands side-on, leans in and rocks along the bark
//   - spar: two adult bulls grazing within 6 m in the summer rut walk up to each other, lock foreheads and shove for 6 to 10 s
//   - bellow: a bull in the rut raises its muzzle and bellows (the audio calls startBellow when its bellow clip plays; with no audio running
//     the layer makes its own now and then)
//   - snow dig: a bison grazing under snow swings its head from side to side like a plough and paws at the crust
//   - calf play: a calf romps in a ring through its spot with bucks and hops, tail up
// Display only: nothing here is seen by the sim, and nothing touches the sim's random streams. Every offset from the sim position is at most
// MAX_OFF metres and is a pure function of the animal's id and the layer clock (windows of a hashed length and phase, see sessionAt), so a
// capture of the same moment shows the same thing. State is kept per animal slot (the animal layer's Slots index), reset when a slot is
// handed to a new animal. Poses are weights packed for models/shader.ts (BEHAV).
import { AGENT_STRIDE, F_JUVENILE, F_MALE, Sp, St } from '../sim/types';

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash01 = (n: number): number => (Math.imul(n | 0, 0x9e3779b1) >>> 8) / 16777216;

/**
 * A stateless schedule of sessions for one animal and one kind of behaviour (`salt`): time is cut into windows of `pMin` to `pMax` seconds
 * (its own length and phase, from the id), a window holds a session with probability `prob`, and the session sits at a hashed place inside
 * it, `dMin` to `dMax` seconds long. Returns the seconds into the session now, or -1 for none (`out.len` is the session's length, `out.n` its
 * window number). Deterministic in the id and the layer clock, so nothing needs storing.
 */
export function sessionAt(id: number, salt: number, clock: number, pMin: number, pMax: number, prob: number, dMin: number, dMax = dMin, out?: { len: number; n: number }): number {
  const per = Math.max(dMax + 0.5, pMin + (pMax - pMin) * hash01(id * 7 + salt * 131 + 1));
  const t = clock + hash01(id * 13 + salt * 17 + 5) * per;
  const n = Math.floor(t / per);
  if (hash01(Math.imul(n, 7919) + id * 31 + salt * 977 + 3) >= prob) return -1;
  const len = dMin + (dMax - dMin) * hash01(Math.imul(n, 6007) + id * 5 + salt * 53 + 11);
  const tau = t - n * per - (per - len) * hash01(Math.imul(n, 104729) + id * 3 + salt * 61 + 9);
  if (out) { out.len = len; out.n = n; }
  return tau >= 0 && tau < len ? tau : -1;
}

/** 0..1, how deep into the bison rut the valley is (the audio's rutWeight peaks the same time). season 0..4. */
export function rutK(season: number): number {
  return smoothstep(1.2, 1.6, season) * (1 - smoothstep(2.0, 2.4, season));
}

/** Farthest a behaviour moves an animal from its sim position (m). */
export const MAX_OFF = 2.5;
/** Behaviours are only worked out within this many metres of the camera (beyond it nobody can see them). */
export const BEH_RANGE = 170;
/** Head to head, the centres of two bulls are this far apart (m): the foreheads touch about 1.8 m ahead of each centre. */
export const SPAR_GAP = 4.1;
/** Two bulls this close (m) may spar. */
export const SPAR_R = 6;
/** Seconds a bellow lasts when the layer makes its own (the audio's rut clip is 4.6 s long). */
export const BELLOW_SELF = 4.4;

/** Session timing (seconds): windows, probability, lengths. */
const WALLOW = { salt: 11, p0: 55, p1: 120, prob: 0.4, d0: 13, d1: 18 };
const RUB = { salt: 12, p0: 28, p1: 60, prob: 0.6, d0: 12, d1: 16 };
const SPAR = { salt: 13, p0: 22, p1: 48, prob: 0.75, d0: 10, d1: 14 }; // (the shove itself is the session less a walk up and a walk back: 6 to 10 s)
const BELLOW = { salt: 14, p0: 40, p1: 90, prob: 0.3, d0: 3.8, d1: 5.0 };
const PLAY = { salt: 15, p0: 11, p1: 26, prob: 0.8, d0: 7.5, d1: 7.5 };
/** Approach and return times of the walks to a tree and to an opponent (s) and the pace of the walk (m/s on screen). */
const RUB_WALK = 3.0;
const SPAR_WALK = 2.0;
const WALK_RATE = 1.0;
/** The calf's ring (radius m at the calf's drawn scale 1, laps in the romp). */
const PLAY_R = 1.1;
const PLAY_LAPS = 3;
const PLAY_LEAD = 0.5;
const PLAY_ROMP = 6;

export interface BisonIn {
  slot: number;
  id: number;
  state: number;
  /** Sim speed (m/s). */
  spd: number;
  flags: number;
  /** Where the animal is drawn before any display offset (world xz). */
  x: number;
  z: number;
  /** Real seconds this frame (0 on a redraw), and the same while the sim is running (0 paused). */
  dt: number;
  running: number;
  timeScale: number;
  clock: number;
  season: number;
  /** Snow on the ground 0..1 (the engine's snow uniform), dry ground 0..1 (no rain, no snow, not damp), and bare ground 0..1 (the grass grazed short). */
  snow: number;
  dry: number;
  bare: number;
  /** Drawn scale and distance from the camera (m). */
  vs: number;
  camD: number;
  /** The layer may start bellows of its own (no audio has asked for one lately). */
  selfBellow: boolean;
}

export interface BisonOut {
  /** Display offset from where it is drawn (world xz), at most MAX_OFF from the sim position. */
  ox: number;
  oz: number;
  /** Gait speed (m/s on screen) to credit while the offset moves, so the feet step with it. */
  spd: number;
  /** A heading to take (rad) while `faceOn`. */
  faceOn: boolean;
  face: number;
  /** A lift above the ground (m), the pitch it adds (rad, + nose up) and how far it is off the ground (0..1): a calf's hops. */
  lift: number;
  pitch: number;
  air: number;
  /** What the pose wants of lying and of the head: lie -1 no opinion, 0 stand, 1 lie; head -1 no opinion, else the head-down weight. */
  lie: number;
  head: number;
  /** Pose weights for the shader (aFx2 and aFx3, see models/shader.ts). */
  wallow: number;
  rub: number;
  spar: number;
  sparPh: number;
  dig: number;
  bellow: number;
  play: number;
  /** Dust raised by a wallow (puffs per second) and a calf's landing this frame. */
  dust: number;
  pounced: boolean;
  /** Which behaviour is running (0 none, see BEH below), for the field notes and the tests. */
  now: number;
  /** A bellow began this frame, and (any kind, `now`) a session began this frame. */
  bellowStarted: boolean;
  began: boolean;
}

const q6 = (w: number): number => Math.round(clamp(w, 0, 1) * 63);
/**
 * The bison's seven pose weights packed into two floats for the shader (models/shader.ts, BEHAV; a float holds 24 bits exactly), each in 6-bit steps:
 * A = dig + 64 wallow + 4096 rub + 262144 air (0..15, the hop of a calf), B = bellow + 64 play + 4096 spar + 262144 (1 for the bull that shoves half a
 * cycle later, only while it shoves). Both are 0 for an animal with nothing going on, so the shader skips the lot.
 */
export function packBisonA(o: BisonOut): number {
  return q6(o.dig) + 64 * q6(o.wallow) + 4096 * q6(o.rub) + 262144 * Math.round(clamp(o.air, 0, 1) * 15);
}
export function packBisonB(o: BisonOut): number {
  const sp = q6(o.spar);
  return q6(o.bellow) + 64 * q6(o.play) + 4096 * sp + (sp > 0 && o.sparPh > 0.25 ? 262144 : 0);
}

export const BEH = { None: 0, Bellow: 1, Spar: 2, Wallow: 3, Rub: 4, Dig: 5, Play: 6 } as const;

export function newBisonOut(): BisonOut {
  return {
    ox: 0, oz: 0, spd: 0, faceOn: false, face: 0, lift: 0, pitch: 0, air: 0, lie: -1, head: -1,
    wallow: 0, rub: 0, spar: 0, sparPh: 0, dig: 0, bellow: 0, play: 0, dust: 0, pounced: false, now: 0, bellowStarted: false, began: false,
  };
}

export function newBisonIn(): BisonIn {
  return {
    slot: 0, id: 0, state: 0, spd: 0, flags: 0, x: 0, z: 0, dt: 0, running: 0, timeScale: 1, clock: 0, season: 1.2, snow: 0, dry: 1, bare: 1, vs: 1, camD: 50, selfBellow: false,
  };
}

/** Cottonwood trunks on a grid, so an animal can find the nearest one without a scan of every tree. */
export class TreeGrid {
  private cell = 12;
  private n = 0;
  private buckets = new Map<number, number[]>();
  private t: Float32Array = new Float32Array(0);

  /** `trees`: the world's cottonwoods, stride 4 (x, z, height m, crown radius m). */
  set(trees: Float32Array): void {
    this.t = trees;
    this.buckets.clear();
    this.n = Math.floor(trees.length / 4);
    for (let k = 0; k < this.n; k++) {
      const key = Math.floor(trees[k * 4] / this.cell) * 4096 + Math.floor(trees[k * 4 + 1] / this.cell);
      const b = this.buckets.get(key);
      if (b) b.push(k); else this.buckets.set(key, [k]);
    }
  }

  /** Trunk radius (m) of a cottonwood of height h: about 3.5% of its height, never thinner than a post or fatter than a barrel. */
  static trunkR(h: number): number {
    return clamp(0.035 * h, 0.22, 0.7);
  }

  /** The tree whose bark is nearest (x, z), if it is within `reach` metres of it. Fills `out` with its trunk centre and radius. */
  nearest(x: number, z: number, reach: number, out: { x: number; z: number; r: number }): boolean {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = reach, found = false;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const bk = this.buckets.get((cx + a) * 4096 + (cz + b));
        if (!bk) continue;
        for (const k of bk) {
          const tx = this.t[k * 4], tz = this.t[k * 4 + 1];
          const r = TreeGrid.trunkR(this.t[k * 4 + 2]);
          const d = Math.hypot(tx - x, tz - z) - r;
          if (d < best) { best = d; found = true; out.x = tx; out.z = tz; out.r = r; }
        }
      }
    }
    return found;
  }
}

export class BisonBehaviour {
  private cap = 0;
  // eased pose weights
  private wallow = new Float32Array(0);
  private rub = new Float32Array(0);
  private spar = new Float32Array(0);
  private dig = new Float32Array(0);
  private bellow = new Float32Array(0);
  private play = new Float32Array(0);
  // the display offset now (what was added to the drawn position last frame), and what was applied (for the layer's path smoothing)
  private ox = new Float32Array(0);
  private oz = new Float32Array(0);
  // the tree an animal is rubbing against in the window it is in: the window number (NaN none chosen yet), the spot it stands at and the way it faces
  private rubWin = new Float32Array(0);
  private rubSet = new Uint8Array(0);
  private rubOk = new Uint8Array(0);
  private rubX = new Float32Array(0);
  private rubZ = new Float32Array(0);
  private rubFace = new Float32Array(0);
  // a bellow asked for by the audio: the clock window it runs in
  private bt0 = new Float32Array(0);
  private bt1 = new Float32Array(0);
  private bellowing = new Uint8Array(0);
  // the opponent of a bull (planPairs): its slot (-1 none), where it stands in the sim, the pair's key and whether this bull is the lower id
  private pSlot = new Int32Array(0);
  private pX = new Float32Array(0);
  private pZ = new Float32Array(0);
  private pKey = new Int32Array(0);
  private pRank = new Uint8Array(0);
  private pairSlots: number[] = [];
  private lastHop = new Float32Array(0);
  private lastNow = new Uint8Array(0);
  private trees = new TreeGrid();
  private tmpTree = { x: 0, z: 0, r: 0 };
  private tmpS = { len: 0, n: 0 };
  /** Bellows started so far (a debug and test counter), and the clock time of the last one the audio asked for. */
  bellows = 0;
  lastAudioBellow = -1e9;

  setTrees(trees: Float32Array): void {
    this.trees.set(trees);
  }

  private ensure(n: number): void {
    if (n <= this.cap) return;
    let c = Math.max(256, this.cap);
    while (c < n) c *= 2;
    const g = <T extends Float32Array | Uint8Array | Int32Array>(a: T, C: new (n: number) => T, fill = 0): T => {
      const b = new C(c);
      if (fill) (b as unknown as Float32Array).fill(fill);
      b.set(a);
      return b;
    };
    this.wallow = g(this.wallow, Float32Array);
    this.rub = g(this.rub, Float32Array);
    this.spar = g(this.spar, Float32Array);
    this.dig = g(this.dig, Float32Array);
    this.bellow = g(this.bellow, Float32Array);
    this.play = g(this.play, Float32Array);
    this.ox = g(this.ox, Float32Array);
    this.oz = g(this.oz, Float32Array);
    this.rubWin = g(this.rubWin, Float32Array);
    this.rubSet = g(this.rubSet, Uint8Array);
    this.rubOk = g(this.rubOk, Uint8Array);
    this.rubX = g(this.rubX, Float32Array);
    this.rubZ = g(this.rubZ, Float32Array);
    this.rubFace = g(this.rubFace, Float32Array);
    this.bt0 = g(this.bt0, Float32Array);
    this.bt1 = g(this.bt1, Float32Array, -1);
    this.bellowing = g(this.bellowing, Uint8Array);
    this.pSlot = g(this.pSlot, Int32Array, -1);
    this.pX = g(this.pX, Float32Array);
    this.pZ = g(this.pZ, Float32Array);
    this.pKey = g(this.pKey, Int32Array);
    this.pRank = g(this.pRank, Uint8Array);
    this.lastHop = g(this.lastHop, Float32Array, -1);
    this.lastNow = g(this.lastNow, Uint8Array);
    this.cap = c;
  }

  /** A slot has been handed to a new animal. */
  reset(slot: number): void {
    this.ensure(slot + 1);
    this.wallow[slot] = this.rub[slot] = this.spar[slot] = this.dig[slot] = this.bellow[slot] = this.play[slot] = 0;
    this.ox[slot] = this.oz[slot] = 0;
    this.rubSet[slot] = 0;
    this.rubOk[slot] = 0;
    this.bt0[slot] = 0;
    this.bt1[slot] = -1;
    this.bellowing[slot] = 0;
    this.pSlot[slot] = -1;
    this.lastHop[slot] = -1;
    this.lastNow[slot] = 0;
  }

  /** The display offset applied to this animal last frame (the layer takes it out of its path smoothing). */
  appliedX(slot: number): number {
    return slot < this.cap ? this.ox[slot] : 0;
  }
  appliedZ(slot: number): number {
    return slot < this.cap ? this.oz[slot] : 0;
  }

  /** The audio's bellow plays now: this bull bellows for `seconds` of clock time. */
  startBellow(slot: number, seconds: number, clock: number): void {
    this.ensure(slot + 1);
    this.bt0[slot] = clock;
    this.bt1[slot] = clock + clamp(seconds, 2, 8);
    this.lastAudioBellow = clock;
  }

  /** Seconds since the audio last asked for a bellow (so the layer knows whether to make its own). */
  quietFor(clock: number): number {
    return clock - this.lastAudioBellow;
  }

  // ---------------------------------------------------------------------------------------------------------
  /**
   * Pair up the bulls that may spar, for a new snapshot: adult males of the bison species, standing about (grazing or idle), within the
   * camera range, in the sparring season. Each bull takes its nearest free neighbour within SPAR_R. `slots` maps snapshot index to layer slot.
   */
  planPairs(agents: Float32Array, ids: Uint32Array, count: number, slots: Int32Array, camX: number, camZ: number, season: number): void {
    for (const s of this.pairSlots) if (s < this.cap) this.pSlot[s] = -1;
    this.pairSlots.length = 0;
    if (season < 1.0 || season > 1.8) return;
    const cand: number[] = [];
    const grid = new Map<number, number[]>();
    for (let i = 0; i < count; i++) {
      const o = i * AGENT_STRIDE;
      if ((agents[o] | 0) !== Sp.Bison) continue;
      const fl = agents[o + 8] | 0;
      if (!(fl & F_MALE) || (fl & F_JUVENILE)) continue;
      const st = agents[o + 7] | 0;
      if ((st !== St.Graze && st !== St.Idle) || agents[o + 4] > 0.6) continue;
      if (Math.hypot(agents[o + 1] - camX, agents[o + 2] - camZ) > BEH_RANGE + 20) continue;
      cand.push(i);
      const key = Math.floor(agents[o + 1] / SPAR_R) * 4096 + Math.floor(agents[o + 2] / SPAR_R);
      const b = grid.get(key);
      if (b) b.push(i); else grid.set(key, [i]);
    }
    if (cand.length < 2) return;
    const taken = new Set<number>();
    for (const i of cand) {
      if (taken.has(i)) continue;
      const o = i * AGENT_STRIDE;
      const cx = Math.floor(agents[o + 1] / SPAR_R), cz = Math.floor(agents[o + 2] / SPAR_R);
      let best = -1, bd = SPAR_R * SPAR_R;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const bk = grid.get((cx + a) * 4096 + (cz + b));
          if (!bk) continue;
          for (const j of bk) {
            if (j === i || taken.has(j)) continue;
            const q = j * AGENT_STRIDE;
            const dx = agents[q + 1] - agents[o + 1], dz = agents[q + 2] - agents[o + 2];
            const d2 = dx * dx + dz * dz;
            if (d2 < bd && d2 > 0.04) { bd = d2; best = j; }
          }
        }
      }
      if (best < 0) continue;
      taken.add(i);
      taken.add(best);
      const si = slots[i], sj = slots[best];
      this.ensure(Math.max(si, sj) + 1);
      const q = best * AGENT_STRIDE;
      const key = (Math.imul(Math.min(ids[i], ids[best]), 73856093) ^ Math.imul(Math.max(ids[i], ids[best]), 19349663)) | 0;
      this.pSlot[si] = sj; this.pX[si] = agents[q + 1]; this.pZ[si] = agents[q + 2]; this.pKey[si] = key; this.pRank[si] = ids[i] < ids[best] ? 0 : 1;
      this.pSlot[sj] = si; this.pX[sj] = agents[o + 1]; this.pZ[sj] = agents[o + 2]; this.pKey[sj] = key; this.pRank[sj] = ids[best] < ids[i] ? 0 : 1;
      this.pairSlots.push(si, sj);
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  /** One animal, once per frame, before its pose is worked out. Fills `o`. */
  step(i: BisonIn, o: BisonOut): void {
    const s = i.slot;
    this.ensure(s + 1);
    const dt = i.running, ts = i.timeScale;
    o.spd = 0; o.faceOn = false; o.face = 0; o.lift = 0; o.pitch = 0; o.air = 0; o.lie = -1; o.head = -1; o.dust = 0; o.pounced = false; o.now = BEH.None;
    o.bellowStarted = false; o.began = false;
    o.sparPh = this.pRank[s] === 0 ? 0 : 0.5; // (which of the two bulls it is, so the pose keeps its phase while it eases out)

    const juv = (i.flags & F_JUVENILE) !== 0;
    const male = (i.flags & F_MALE) !== 0 && !juv;
    const standing = (i.state === St.Idle || i.state === St.Graze || i.state === St.Rest) && i.spd < 0.5;
    const act = ts > 0 && ts <= 3 && i.camD < BEH_RANGE;
    const free = act && standing;
    const sess = this.tmpS;

    // which one is running (one at a time, in this order of priority) and how far into its session it is
    let now: number = BEH.None;
    let tau = -1, len = 0;
    // bellow: the audio's window, or a bull's own in the rut when no audio is calling
    if (free && male) {
      if (this.bt1[s] > this.bt0[s] && i.clock >= this.bt0[s] && i.clock <= this.bt1[s]) now = BEH.Bellow;
      else if (i.selfBellow) {
        const rk = rutK(i.season);
        if (rk > 0.05 && sessionAt(i.id, BELLOW.salt, i.clock, BELLOW.p0, BELLOW.p1, BELLOW.prob * rk, BELLOW.d0, BELLOW.d1, sess) >= 0) now = BEH.Bellow;
      }
    }
    // spar: the pair's own window, both bulls standing about
    if (now === BEH.None && free && male && this.pSlot[s] >= 0 && i.season >= 1.0 && i.season <= 1.8) {
      const t0 = sessionAt(this.pKey[s], SPAR.salt, i.clock, SPAR.p0, SPAR.p1, SPAR.prob, SPAR.d0, SPAR.d1, sess);
      if (t0 >= 0) { now = BEH.Spar; tau = t0; len = sess.len; }
    }
    // wallow: bare, dry ground, from late spring to early autumn
    if (now === BEH.None && free && i.dry > 0.55 && i.bare > 0.45 && i.snow < 0.05 && i.season >= 0.6 && i.season <= 2.5) {
      const t0 = sessionAt(i.id, WALLOW.salt, i.clock, WALLOW.p0, WALLOW.p1, WALLOW.prob, WALLOW.d0, WALLOW.d1, sess);
      if (t0 >= 0) { now = BEH.Wallow; tau = t0; len = sess.len; }
    }
    // rub: a tree within reach (looked for once per window)
    if (now === BEH.None && free) {
      const t0 = sessionAt(i.id, RUB.salt, i.clock, RUB.p0, RUB.p1, RUB.prob, RUB.d0, RUB.d1, sess);
      if (t0 >= 0) {
        if (!this.rubSet[s] || this.rubWin[s] !== sess.n) this.pickTree(s, i, sess.n);
        if (this.rubOk[s]) { now = BEH.Rub; tau = t0; len = sess.len; }
      }
    }
    // calf play
    if (now === BEH.None && free && juv && i.snow < 0.5) {
      const t0 = sessionAt(i.id, PLAY.salt, i.clock, PLAY.p0, PLAY.p1, PLAY.prob, PLAY.d0, PLAY.d1, sess);
      if (t0 >= 0) { now = BEH.Play; tau = t0; len = sess.len; }
    }
    // snow dig: any bison grazing in snow, all the time
    const digT = act && i.state === St.Graze && i.spd < 0.8 && i.snow > 0.1 && now === BEH.None ? smoothstep(0.1, 0.22, i.snow) : 0;

    // ---- targets: the pose weights and the offset (tx, tz are offsets from where the animal is drawn before it: `walk` goes there at a
    // walking pace, `path` is there at once, neither melts away to none)
    let wallowT = 0, rubT = 0, sparT = 0, bellowT = 0, playT = 0;
    let tx = 0, tz = 0, walk = false, path = false;
    if (now === BEH.Bellow) {
      bellowT = 1;
      o.lie = 0;
      o.head = 0;
      if (this.bellowing[s] === 0) { o.bellowStarted = true; this.bellows++; }
    } else if (now === BEH.Spar) {
      // walk up to the opponent (until the centres are SPAR_GAP apart: each bull goes half the way), lock heads, shove, and back off again
      const dxp = this.pX[s] - i.x, dzp = this.pZ[s] - i.z;
      const d = Math.hypot(dxp, dzp) || 1;
      const ax = dxp / d, az = dzp / d;
      const hold = tau > SPAR_WALK && tau < len - SPAR_WALK;
      const leaving = tau >= len - SPAR_WALK;
      walk = true;
      tx = leaving ? 0 : ax * (d - SPAR_GAP) * 0.5;
      tz = leaving ? 0 : az * (d - SPAR_GAP) * 0.5;
      o.faceOn = !leaving;
      o.face = Math.atan2(az, ax);
      o.lie = 0;
      o.head = leaving ? -1 : 1;
      if (hold && Math.hypot(tx - this.ox[s], tz - this.oz[s]) < 0.3) sparT = 1;
    } else if (now === BEH.Wallow) {
      o.lie = 1;
      wallowT = smoothstep(1.0, 1.6, tau) * (1 - smoothstep(len - 2.0, len - 0.6, tau));
      o.dust = 5 * wallowT;
    } else if (now === BEH.Rub) {
      const hold = tau > RUB_WALK && tau < len - RUB_WALK;
      const leaving = tau >= len - RUB_WALK;
      walk = true;
      tx = leaving ? 0 : this.rubX[s] - i.x;
      tz = leaving ? 0 : this.rubZ[s] - i.z;
      o.lie = 0;
      o.head = 0.45;
      o.faceOn = !leaving;
      o.face = this.rubFace[s];
      if (hold && Math.hypot(tx - this.ox[s], tz - this.oz[s]) < 0.25) rubT = 1;
    } else if (now === BEH.Play) {
      // the ring: through the spot the calf stands on, PLAY_LAPS loops of it, a buck every second or so, tail up
      playT = smoothstep(0, 0.4, tau) * (1 - smoothstep(len - 0.8, len - 0.1, tau));
      o.lie = 0;
      o.head = 0.15;
      path = true;
      const rr = PLAY_R * clamp(i.vs, 0.55, 1.2);
      const rt = clamp((tau - PLAY_LEAD) / PLAY_ROMP, 0, 1);
      const e = rt * rt * (3 - 2 * rt);
      const dir = hash01(i.id * 29 + 7) > 0.5 ? 1 : -1;
      const th0 = hash01(i.id * 41 + Math.floor(i.clock / 37)) * Math.PI * 2;
      const a = th0 + Math.PI + dir * PLAY_LAPS * Math.PI * 2 * e;
      tx = rr * (Math.cos(th0) + Math.cos(a));
      tz = rr * (Math.sin(th0) + Math.sin(a));
      if (rt > 0.02 && rt < 0.98) {
        o.spd = Math.abs((PLAY_LAPS * Math.PI * 2 * 6 * rt * (1 - rt)) / PLAY_ROMP) * rr;
        o.faceOn = true;
        o.face = a + dir * Math.PI * 0.5;
        const hp = (tau - PLAY_LEAD) / 1.2 + hash01(i.id * 53 + 3);
        const hu = ((hp - Math.floor(hp)) * 1.2) / 0.45;
        if (hu < 1 && rt > 0.06 && rt < 0.92) {
          const sn = Math.sin(Math.PI * hu);
          o.lift = 0.32 * i.vs * sn;
          o.pitch = 0.28 * Math.cos(Math.PI * hu);
          o.air = smoothstep(0.1, 0.4, sn);
          this.lastHop[s] = hu;
        } else if (this.lastHop[s] >= 0) { this.lastHop[s] = -1; o.pounced = true; }
      }
    } else if (digT > 0) {
      o.lie = 0;
      o.head = 1;
    }
    this.bellowing[s] = now === BEH.Bellow ? 1 : 0;
    if (now !== BEH.Play) this.lastHop[s] = -1;
    o.now = now !== BEH.None ? now : digT > 0 ? BEH.Dig : BEH.None;
    o.began = o.now !== BEH.None && o.now !== this.lastNow[s];
    this.lastNow[s] = o.now;

    // ---- the offset: a ring (set directly), a walk to a spot, or melting back to nothing
    let ox = this.ox[s], oz = this.oz[s];
    if (path) {
      ox = tx;
      oz = tz;
    } else {
      const dx = (walk ? tx : 0) - ox, dz = (walk ? tz : 0) - oz;
      const dl = Math.hypot(dx, dz);
      const rate = !walk ? (standing ? 1.2 : 2.2) : WALK_RATE;
      const step = ts > 3 || ts <= 0 ? (ts > 3 ? dl : 0) : Math.min(dl, rate * dt);
      if (dl > 1e-5) { ox += (dx / dl) * step; oz += (dz / dl) * step; }
      if (!walk && Math.abs(ox) + Math.abs(oz) < 1e-3) { ox = 0; oz = 0; }
      if (ts <= 3 && dt > 0) o.spd = step / dt;
    }
    // never further from the sim position than MAX_OFF
    const ol = Math.hypot(ox, oz);
    if (ol > MAX_OFF) { ox *= MAX_OFF / ol; oz *= MAX_OFF / ol; }
    this.ox[s] = ox;
    this.oz[s] = oz;
    o.ox = ox;
    o.oz = oz;

    // ---- ease the weights (they run on the layer's own clock: paused, the pose holds)
    const k = (rate: number): number => 1 - Math.exp(-dt / rate);
    this.wallow[s] += (wallowT - this.wallow[s]) * k(wallowT > this.wallow[s] ? 0.5 : 0.7);
    this.rub[s] += (rubT - this.rub[s]) * k(0.5);
    this.spar[s] += (sparT - this.spar[s]) * k(0.35);
    this.dig[s] += (digT - this.dig[s]) * k(0.7);
    this.bellow[s] += (bellowT - this.bellow[s]) * k(bellowT > this.bellow[s] ? 0.3 : 0.6);
    this.play[s] += (playT - this.play[s]) * k(0.3);
    if (this.wallow[s] < 0.004) this.wallow[s] = 0;
    if (this.rub[s] < 0.004) this.rub[s] = 0;
    if (this.spar[s] < 0.004) this.spar[s] = 0;
    if (this.dig[s] < 0.004) this.dig[s] = 0;
    if (this.bellow[s] < 0.004) this.bellow[s] = 0;
    if (this.play[s] < 0.004) this.play[s] = 0;
    o.wallow = this.wallow[s];
    o.rub = this.rub[s];
    o.spar = this.spar[s];
    o.dig = this.dig[s];
    o.bellow = this.bellow[s];
    o.play = this.play[s];
    // a pose that is still easing out keeps the body in charge: lying for the wallow, standing for the rest
    if (o.lie < 0 && this.wallow[s] > 0.05) o.lie = 1;
    if (o.lie < 0 && (this.bellow[s] > 0.05 || this.spar[s] > 0.05 || this.rub[s] > 0.05 || this.play[s] > 0.05)) o.lie = 0;
    if (o.head < 0 && this.dig[s] > 0.05) o.head = 1;
  }

  /** Choose the tree this animal rubs against in this window: the nearest trunk within reach, and the spot and heading to stand at. */
  private pickTree(s: number, i: BisonIn, win: number): void {
    this.rubWin[s] = win;
    this.rubSet[s] = 1;
    this.rubOk[s] = 0;
    const reach = MAX_OFF + 0.45;
    const t = this.tmpTree;
    // (measured from where the animal is drawn before its offset, which is about where the sim has it)
    const px = i.x, pz = i.z;
    if (!this.trees.nearest(px, pz, reach, t)) return;
    const dx = px - t.x, dz = pz - t.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    const ux = dx / d, uz = dz / d;
    // side-on to the bark: the centre of the body half a body width and the trunk radius off the trunk, on the side it came from
    const stand = t.r + 0.5 * clamp(i.vs, 0.5, 1.2);
    this.rubX[s] = t.x + ux * stand;
    this.rubZ[s] = t.z + uz * stand;
    // it stands with the tree on its right (the pose leans that way). The model's forward is (cos h, sin h) and its right (-sin h, cos h), and
    // the tree lies along -u from the animal, so -sin h = -ux and cos h = -uz: h = atan2(ux, -uz)
    this.rubFace[s] = Math.atan2(ux, -uz);
    // the spot must be within reach of the sim position
    const off = Math.hypot(this.rubX[s] - px, this.rubZ[s] - pz);
    this.rubOk[s] = off <= MAX_OFF ? 1 : 0;
  }
}
