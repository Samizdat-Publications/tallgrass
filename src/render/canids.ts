// Render-side life of the canids (R3): everything the animal layer needs for coyotes and wolves that is not in the sim snapshot.
//   - mange: severity eased per animal and packed for the shader (a patchy coat, a thin tail and ruff)
//   - the coyote's mousing leap: a 1.2 s arc in Stalk standing still (the sim's "mousing"), forefeet first, then a pin
//   - the dusk chorus: resting coyotes sit up, muzzle to the sky, for the length of a call (audio drives it through startChorus,
//     and the layer makes its own at dusk when no audio has called for a while), a long note then yips
//   - the wary head-up glance of a coyote at a carcass, every 2 to 3 s
//   - migrant columns: F_MIGRANT animals that travel together are drawn in a short file (display offsets only)
//   - R8: wolves howl at dusk and night the same way (a pack at rest sits up together for exactly as long as the audio's howl, with no yips),
//     pups romp near their den (a play bow, then loops of the den with pounces) in spring and summer, and an idle adult now and then sniffs
//     the ground and cocks a hind leg to scent mark
// All of it is display only: nothing here is seen by the sim, and nothing touches the sim's random streams. State is kept per
// animal slot (the animal layer's Slots index), reset when a slot is handed to a new animal.
import { AGENT_STRIDE, F_JUVENILE, F_MANGE, F_MIGRANT, Sp, St } from '../sim/types';
import { sessionAt } from './behaviours';

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash01 = (n: number): number => (Math.imul(n | 0, 0x9e3779b1) >>> 8) / 16777216;

/** R8 pup play: the play bow, then PLAY_LAPS loops of a ring of radius PLAY_R through the spot it stood on, then it settles. */
export const PLAY_DUR = 8;
const PLAY_BOW = 1.4;
const PLAY_ROMP = 6;
const PLAY_LAPS = 3;
/** Radius of the ring a pup romps on (drawn scale 1, m): the ring runs through its spot, so it strays 2 R from it at most. */
const PLAY_R = 1.6;
/** R8 scent marking: sniff the ground, then cock a hind leg. */
export const MARK_DUR = 4.4;
const MARK_SNIFF = 1.5;
/** A wolf chorus takes in resting wolves within this many metres of its site (a pack lies close); a coyote chorus the radius below. */
const CHOIR_R_WOLF = 48;

/** The mousing leap: the crouch before it (s), airborne time, and the pin of the forefeet after it (s). */
export const ANT_TIME = 0.28;
export const LEAP_TIME = 1.2;
export const PIN_TIME = 0.6;
/** How far the haunches settle in the crouch before the spring (m at drawn scale 1) and the nose-up pitch that goes with it (rad). */
const ANT_DROP = 0.09;
const ANT_PITCH = 0.16;
/** Height and reach of the leap in metres at drawn scale 1 (the coyote is drawn at about 1.35). */
const LEAP_HEIGHT = 0.62;
const LEAP_REACH = 0.8;
/** The leaps displace the animal from its sim position by at most this (drawn scale 1, m); the offset melts away once it moves on. */
const LEAP_CAP = 2.0;
/** A chorus takes in resting coyotes within this many metres of its site. */
const CHOIR_R = 55;
/** Real (clock) seconds without a call from the audio before the layer makes its own dusk chorus. */
const AUDIO_QUIET = 150;
/** Column display offset: most a migrant is moved from its sim position (m), and the spacing of the file in body lengths. */
const COLUMN_CAP = 14;
const COLUMN_GAP = 1.7;
/** A column forms from migrants of one species this close together and heading about the same way. */
const COLUMN_R = 26;
const COLUMN_HEADING = 0.9;

export interface CanidIn {
  slot: number;
  id: number;
  sp: number;
  state: number;
  /** Sim speed (m/s). */
  spd: number;
  flags: number;
  energy: number;
  x: number;
  z: number;
  /** Sim heading (rad). */
  h: number;
  /** Real seconds this frame (0 on a redraw), and the same while the sim is running (0 paused). */
  dt: number;
  running: number;
  timeScale: number;
  clock: number;
  /** Drawn scale (model metres to world). */
  vs: number;
  /** Valley season 0..4 (pups romp in spring and summer, 0 to 2). */
  season: number;
}

export interface CanidOut {
  /** Display offset from the sim position this frame (world xz): the leap and the column. */
  ox: number;
  oz: number;
  /** The leap's lift above the ground (m), the body pitch it adds (rad, + nose up) and how far it is off the ground (0..1). */
  lift: number;
  pitch: number;
  air: number;
  /** Seconds-since... a leap ended this frame (a landing puff). */
  landed: boolean;
  /** A leap began this frame. */
  leapStarted: boolean;
  /** r-feet: where the mousing leap is, for the shader (aFx2.z): 0 none, else 2 + segment (0 crouch, 1 arc, 2 pin) + the fraction of that segment (0 .. 0.999). */
  leap: number;
  /** The pin of the forefeet is on: the head goes down into the grass. */
  pin: boolean;
  /** Howl weight eased 0..1 (the shader's sit) and whether it wants to be sitting now. */
  howl: number;
  howlWant: boolean;
  /** The packed aFx2.w (see tgUnpack in models/shader.ts). */
  pack: number;
  /** Gait speed (m/s on screen) to credit while a display offset melts away, so the feet step with the slide. */
  spd: number;
  /** R8: a pup is romping (the layer stands it up, head up), it is sniffing the ground before it marks (head down), the cocked-leg weight 0..1. */
  play: boolean;
  sniff: boolean;
  mark: number;
  /** R8: the heading the pup runs its ring at (rad), valid while `play` and `moving`; and whether it is on the move round the ring. */
  face: number;
  moving: boolean;
  /** R8: a pounce of the play came down this frame (a puff of dust). */
  pounced: boolean;
}

export function newOut(): CanidOut {
  return { ox: 0, oz: 0, lift: 0, pitch: 0, air: 0, landed: false, leapStarted: false, leap: 0, pin: false, howl: 0, howlWant: false, pack: 0, spd: 0, play: false, sniff: false, mark: 0, face: 0, moving: false, pounced: false };
}

export function newIn(): CanidIn {
  return { slot: 0, id: 0, sp: 0, state: 0, spd: 0, flags: 0, energy: 1, x: 0, z: 0, h: 0, dt: 0, running: 0, timeScale: 1, clock: 0, vs: 1, season: 1.2 };
}

/** One chorus: where it is, the clock window it runs in, when the audio last asked for one and when the layer may next make one of its own. */
interface Choir {
  x: number;
  z: number;
  t0: number;
  t1: number;
  lastAudio: number;
  nextSelf: number;
}
const newChoir = (nextSelf: number): Choir => ({ x: 0, z: 0, t0: 0, t1: -1, lastAudio: -1e9, nextSelf });

export class CanidState {
  private cap = 0;
  // leap: seconds since it began (-1 none), time in the mousing stance, cooldown, heading and reach, the offset it has built up and where it started from
  private leapT = new Float32Array(0);
  private stalk = new Float32Array(0);
  private cool = new Float32Array(0);
  private lh = new Float32Array(0);
  private ld = new Float32Array(0);
  private lx = new Float32Array(0);
  private lz = new Float32Array(0);
  private lx0 = new Float32Array(0);
  private lz0 = new Float32Array(0);
  private landedFlag = new Uint8Array(0);
  // howl and mange eased weights
  private howl = new Float32Array(0);
  private mange = new Float32Array(0);
  // migrant column: eased offset, target, and what was applied to the position last frame (leap + column), which the layer's path smoothing takes out
  private cx = new Float32Array(0);
  private cz = new Float32Array(0);
  private tcx = new Float32Array(0);
  private tcz = new Float32Array(0);
  private ax = new Float32Array(0);
  private az = new Float32Array(0);
  /** Slots with a nonzero column target, so they can be cleared at the next plan. */
  private colSlots: number[] = [];

  // R8: play and scent marking, eased: the offset of a pup on its ring (it melts away if the session is cut short), and the cocked-leg weight
  private qx = new Float32Array(0);
  private qz = new Float32Array(0);
  private mark = new Float32Array(0);
  private lastHop = new Float32Array(0);

  // the choruses (coyote and wolf): where, from when to when (clock seconds), and when the audio last asked for one
  private choirC: Choir = newChoir(20);
  private choirW: Choir = newChoir(32);
  /** A chorus is on (clock inside its window), for the audio and the field notes. */
  choirOn(clock: number, wolf = false): boolean {
    const c = wolf ? this.choirW : this.choirC;
    return clock >= c.t0 && clock <= c.t1 + 1;
  }

  private ensure(n: number): void {
    if (n <= this.cap) return;
    let c = Math.max(256, this.cap);
    while (c < n) c *= 2;
    const g = <T extends Float32Array | Uint8Array>(a: T, C: new (n: number) => T, fill = 0): T => {
      const b = new C(c);
      if (fill) (b as unknown as Float32Array).fill(fill);
      b.set(a);
      return b;
    };
    this.leapT = g(this.leapT, Float32Array, -1);
    this.stalk = g(this.stalk, Float32Array);
    this.cool = g(this.cool, Float32Array);
    this.lh = g(this.lh, Float32Array);
    this.ld = g(this.ld, Float32Array);
    this.lx = g(this.lx, Float32Array);
    this.lz = g(this.lz, Float32Array);
    this.lx0 = g(this.lx0, Float32Array);
    this.lz0 = g(this.lz0, Float32Array);
    this.landedFlag = g(this.landedFlag, Uint8Array);
    this.howl = g(this.howl, Float32Array);
    this.mange = g(this.mange, Float32Array);
    this.cx = g(this.cx, Float32Array);
    this.cz = g(this.cz, Float32Array);
    this.tcx = g(this.tcx, Float32Array);
    this.tcz = g(this.tcz, Float32Array);
    this.ax = g(this.ax, Float32Array);
    this.az = g(this.az, Float32Array);
    this.qx = g(this.qx, Float32Array);
    this.qz = g(this.qz, Float32Array);
    this.mark = g(this.mark, Float32Array);
    this.lastHop = g(this.lastHop, Float32Array, -1);
    this.cap = c;
  }

  /** A slot has been handed to a new animal. */
  reset(slot: number): void {
    this.ensure(slot + 1);
    this.leapT[slot] = -1;
    this.stalk[slot] = 0;
    this.cool[slot] = 0;
    this.lx[slot] = this.lz[slot] = 0;
    this.howl[slot] = 0;
    this.mange[slot] = 0;
    this.cx[slot] = this.cz[slot] = 0;
    this.tcx[slot] = this.tcz[slot] = 0;
    this.ax[slot] = this.az[slot] = 0;
    this.landedFlag[slot] = 0;
    this.qx[slot] = this.qz[slot] = 0;
    this.mark[slot] = 0;
    this.lastHop[slot] = -1;
  }

  /** The display offset applied to this animal's position last frame (the layer takes it out of its path smoothing). */
  appliedX(slot: number): number {
    return slot < this.cap ? this.ax[slot] : 0;
  }
  appliedZ(slot: number): number {
    return slot < this.cap ? this.az[slot] : 0;
  }

  // ---------------------------------------------------------------------------------------------------------
  // the chorus

  /** Start a chorus at a site for `seconds` of clock time (the audio calls this when a coyote clip starts; the layer calls it itself at dusk). */
  startChorus(x: number, z: number, seconds: number, clock: number, fromAudio: boolean, wolf = false): void {
    const c = wolf ? this.choirW : this.choirC;
    c.x = x;
    c.z = z;
    c.t0 = clock;
    c.t1 = clock + clamp(seconds, 2.5, 14);
    if (fromAudio) c.lastAudio = clock;
  }

  /** At dusk, with no audio calling for a while, the layer makes a chorus of its own now and then. `pick` finds a resting canid's place. */
  maybeSelfChorus(clock: number, dusk: boolean, timeScale: number, pick: () => { x: number; z: number } | null, wolf = false): boolean {
    const c = wolf ? this.choirW : this.choirC;
    if (!dusk || !(timeScale > 0) || timeScale > 10 || clock < c.nextSelf || this.choirOn(clock, wolf)) return false;
    if (clock - c.lastAudio < AUDIO_QUIET) return false;
    const site = pick();
    c.nextSelf = clock + (wolf ? 40 + 50 * Math.random() : 30 + 40 * Math.random());
    if (!site) return false;
    this.startChorus(site.x, site.z, (wolf ? 5 : 6) + 3 * Math.random(), clock, false, wolf);
    return true;
  }

  // ---------------------------------------------------------------------------------------------------------
  /** The wary head-up glance of a coyote at a carcass: 0..1, a short lift of the head every 2 to 3 s (its own period). */
  glance(id: number, clock: number): number {
    const period = 2 + hash01(id * 5 + 1);
    const ph = (clock + hash01(id * 11 + 7) * period * 9) % period;
    return smoothstep(0, 0.14, ph) * (1 - smoothstep(0.68, 0.9, ph));
  }

  // ---------------------------------------------------------------------------------------------------------
  /** One animal, once per frame, before its pose is worked out. Fills `o`. */
  step(i: CanidIn, o: CanidOut): void {
    const s = i.slot;
    this.ensure(s + 1);
    const dt = i.running, ts = i.timeScale;
    o.lift = 0; o.pitch = 0; o.air = 0; o.landed = false; o.leapStarted = false; o.leap = 0; o.pin = false; o.spd = 0; o.howlWant = false;
    o.play = false; o.sniff = false; o.moving = false; o.pounced = false;

    // mange: severity from how run down it is (the snapshot only carries the flag), eased so it never pops
    const mg = i.flags & F_MANGE ? clamp(0.5 + 0.5 * (1 - i.energy), 0.35, 1) : 0;
    this.mange[s] += (mg - this.mange[s]) * (1 - Math.exp(-i.dt / 2.5));
    if (mg === 0 && this.mange[s] < 0.004) this.mange[s] = 0;
    const mangeFrac = Math.min(0.99, this.mange[s]);

    let yip = 0;
    const coyote = i.sp === Sp.Coyote;
    if (coyote) {
      // ---- the mousing leap
      const mousing = i.state === St.Stalk && i.spd < 0.3;
      const lt = this.leapT[s];
      if (lt < 0) {
        if (mousing && ts > 0 && ts <= 3) this.stalk[s] += dt; else if (!mousing) this.stalk[s] = 0;
        this.cool[s] -= dt;
        if (mousing && ts > 0 && ts <= 3 && this.stalk[s] > 1.2 + 1.6 * hash01(i.id * 3 + 1) && this.cool[s] <= 0) {
          // spring: heading fixed now, reach limited by what the offset has already built up
          this.leapT[s] = 0;
          this.lh[s] = i.h;
          const room = Math.max(0.25, LEAP_CAP * i.vs - Math.hypot(this.lx[s], this.lz[s]));
          this.ld[s] = Math.min(LEAP_REACH * i.vs * (0.85 + 0.3 * hash01(i.id * 9 + Math.floor(i.clock))), room);
          this.lx0[s] = this.lx[s];
          this.lz0[s] = this.lz[s];
          o.leapStarted = true;
        }
      }
      if (this.leapT[s] >= 0) {
        this.leapT[s] += dt;
        const t = this.leapT[s];
        const u = (t - ANT_TIME) / LEAP_TIME;
        if (u < 0) {
          // the crouch: the haunches settle and the nose comes up a touch, everything else still (the shader locks the head and ears on the prey)
          const f = t / ANT_TIME;
          const e = f * f * (3 - 2 * f);
          o.lift = -ANT_DROP * i.vs * e;
          o.pitch = ANT_PITCH * e;
          o.leap = 2 + Math.min(0.999, f);
        } else if (u <= 1) {
          this.lx[s] = this.lx0[s] + Math.cos(this.lh[s]) * this.ld[s] * u;
          this.lz[s] = this.lz0[s] + Math.sin(this.lh[s]) * this.ld[s] * u;
          // the spring: the crouch lets go over the first tenth of the arc, so the body rises out of it rather than snapping off the ground
          o.lift = LEAP_HEIGHT * i.vs * 4 * u * (1 - u) - ANT_DROP * i.vs * (1 - smoothstep(0, 0.1, u));
          o.pitch = ANT_PITCH + (0.5 - ANT_PITCH) * smoothstep(0, 0.1, u) - 1.3 * smoothstep(0.1, 1.0, u);
          o.air = smoothstep(0.03, 0.16, u) * (1 - smoothstep(0.86, 0.985, u));
          o.leap = 3 + Math.min(0.999, u);
        } else {
          // the pin: the forefeet are down on the prey, the nose to the ground, then it lifts its head again
          if (!this.landedFlag[s]) { this.landedFlag[s] = 1; o.landed = true; }
          const q = (t - ANT_TIME - LEAP_TIME) / PIN_TIME;
          o.pitch = -0.45 * (1 - smoothstep(0.5, 1, q)) - 0.35 * (1 - smoothstep(0, 0.3, q));
          o.leap = 4 + Math.min(0.999, q);
          o.pin = q < 0.85;
          if (q >= 1) {
            this.leapT[s] = -1;
            this.landedFlag[s] = 0;
            this.cool[s] = 2.2 + 3 * hash01(i.id * 7 + Math.floor(i.clock));
          }
        }
      }
      // the offset melts away once the coyote moves on (or is long gone in a time-lapse); held while it is still mousing
      if (this.leapT[s] < 0) {
        const d = Math.hypot(this.lx[s], this.lz[s]);
        if (d > 1e-4 && (!mousing || ts > 3)) {
          const rate = ts > 3 ? 50 : i.spd > 0.5 ? 1.9 : 0.55;
          const k = Math.min(d, rate * (ts > 3 ? i.dt : dt));
          this.lx[s] -= (this.lx[s] / d) * k;
          this.lz[s] -= (this.lz[s] / d) * k;
          if (ts <= 3) o.spd = rate;
        }
      }

    }
    const wolf = i.sp === Sp.Wolf;
    if (coyote || wolf) {
      // ---- the chorus: a resting coyote or wolf near the site sits up for the length of the call (a wolf pack howls on one long note with
      // no yips, the pack joining over a couple of seconds, the leader first; a coyote chorus is a long note then yips)
      const rest = (i.state === St.Rest || i.state === St.Idle) && i.spd < 0.3;
      const ch = wolf ? this.choirW : this.choirC;
      let want = false;
      let yipping = false;
      if (rest && ch.t1 > ch.t0) {
        const dx = i.x - ch.x, dz = i.z - ch.z;
        const rad = wolf ? CHOIR_R_WOLF : CHOIR_R;
        if (dx * dx + dz * dz < rad * rad) {
          const t0 = ch.t0 + hash01(i.id * 13 + 5) * (wolf ? 2.4 : 1.1);
          const t1 = ch.t1 + (hash01(i.id * 17 + 3) - 0.5) * (wolf ? 1.4 : 0.8);
          if (i.clock >= t0 && i.clock <= t1) {
            want = true;
            yipping = !wolf && i.clock > t0 + 0.62 * (t1 - t0);
          }
        }
      }
      o.howlWant = want;
      this.howl[s] += ((want ? 1 : 0) - this.howl[s]) * (1 - Math.exp(-dt / (wolf ? 0.85 : 0.6)));
      if (this.howl[s] < 0.003) this.howl[s] = 0;
      if (yipping && this.howl[s] > 0.9) yip = 0.6 + 0.4 * hash01(i.id * 19 + 1);
    }

    // ---- R8 pup play and scent marking (both only while the sim has the animal standing about, and not while a chorus has it sitting up)
    let hopAir = 0;
    let markT = 0;
    const standing = (i.state === St.Idle || i.state === St.Rest) && i.spd < 0.3 && ts > 0 && ts <= 3 && !(this.howl[s] > 0.05 || o.howlWant);
    const pup = (i.flags & F_JUVENILE) !== 0;
    let qOn = false;
    if (pup && standing && i.season >= 0 && i.season <= 2.0) {
      const tau = sessionAt(i.id, 1, i.clock, 16, 34, 0.7, PLAY_DUR);
      if (tau >= 0) {
        qOn = true;
        o.play = true;
        const vs = i.vs;
        const rr = Math.min(1.2, PLAY_R * Math.max(0.6, vs / 1.35));
        const bow = smoothstep(0, 0.35, tau) * (1 - smoothstep(PLAY_BOW - 0.4, PLAY_BOW, tau));
        o.pitch += -0.34 * bow;
        // the romp: PLAY_LAPS loops of a ring through the spot, eased in and out, the way round and the side of the ring its own
        const rt = clamp((tau - PLAY_BOW) / PLAY_ROMP, 0, 1);
        const e = rt * rt * (3 - 2 * rt);
        const dir = hash01(i.id * 29 + 7) > 0.5 ? 1 : -1;
        const th0 = hash01(i.id * 41 + Math.floor(i.clock / 40)) * Math.PI * 2;
        const phi = dir * PLAY_LAPS * Math.PI * 2 * e;
        const a = th0 + Math.PI + phi;
        this.qx[s] = rr * (Math.cos(th0) + Math.cos(a));
        this.qz[s] = rr * (Math.sin(th0) + Math.sin(a));
        const running = rt > 0.02 && rt < 0.98;
        if (running) {
          const dphi = dir * PLAY_LAPS * Math.PI * 2 * 6 * rt * (1 - rt) / PLAY_ROMP;
          o.spd = Math.abs(dphi) * rr;
          o.face = a + dir * Math.PI * 0.5;
          o.moving = true;
          // pounces: a hop of 0.4 s every 1.1 s or so, in the air with the feet tucked, nose up at take off and down at the landing
          const hp = (tau - PLAY_BOW) / 1.1 + hash01(i.id * 53 + 3);
          const hu = (hp - Math.floor(hp)) * 1.1 / 0.4;
          if (hu < 1 && rt > 0.08 && rt < 0.9) {
            const lift = 0.3 * vs * Math.sin(Math.PI * hu);
            o.lift += lift;
            o.pitch += 0.3 * Math.cos(Math.PI * hu);
            hopAir = smoothstep(0.1, 0.4, Math.sin(Math.PI * hu));
            this.lastHop[s] = hu;
          } else if (this.lastHop[s] >= 0) { this.lastHop[s] = -1; o.pounced = true; }
        }
      }
    }
    if (!qOn) {
      // a session cut short (it walked off): the ring's offset melts away
      const d = Math.hypot(this.qx[s], this.qz[s]);
      if (d > 1e-4) {
        const rate = ts > 3 ? 50 : 1.8;
        const kq = Math.min(d, rate * (ts > 3 ? i.dt : dt));
        this.qx[s] -= (this.qx[s] / d) * kq;
        this.qz[s] -= (this.qz[s] / d) * kq;
        if (ts <= 3) o.spd = Math.max(o.spd, rate);
      }
      this.lastHop[s] = -1;
    }
    if (!pup && this.leapT[s] < 0 && standing && i.state === St.Idle && (coyote || wolf) && !qOn) {
      const tau = sessionAt(i.id, 2, i.clock, 40, 90, 0.5, MARK_DUR);
      if (tau >= 0) {
        o.sniff = tau < MARK_SNIFF + 0.2;
        markT = smoothstep(MARK_SNIFF - 0.1, MARK_SNIFF + 0.35, tau) * (1 - smoothstep(MARK_DUR - 0.7, MARK_DUR - 0.25, tau));
      }
    }
    this.mark[s] += (markT - this.mark[s]) * (1 - Math.exp(-dt / 0.12));
    if (this.mark[s] < 0.004) this.mark[s] = 0;
    o.mark = this.mark[s];
    if (o.air < hopAir) o.air = hopAir;

    // ---- migrant column (any species the plan gave a target to) and what ends up applied this frame
    const k = 1 - Math.exp(-i.dt / 1.4);
    this.cx[s] += (this.tcx[s] - this.cx[s]) * k;
    this.cz[s] += (this.tcz[s] - this.cz[s]) * k;
    if (Math.abs(this.cx[s]) + Math.abs(this.cz[s]) < 1e-3 && this.tcx[s] === 0 && this.tcz[s] === 0) { this.cx[s] = 0; this.cz[s] = 0; }
    o.ox = this.lx[s] + this.cx[s] + this.qx[s];
    o.oz = this.lz[s] + this.cz[s] + this.qz[s];
    this.ax[s] = o.ox;
    this.az[s] = o.oz;

    // ---- pack for the shader: air + 16 * howl + 256 * mark, and the mange severity in the fraction
    o.howl = coyote || wolf ? this.howl[s] : 0;
    const airQ = Math.round(clamp(o.air, 0, 1) * 15);
    const howlQ = yip > 0 ? 11 + Math.round(4 * yip) : Math.round(clamp(o.howl, 0, 1) * 10);
    const markQ = Math.round(clamp(o.mark, 0, 1) * 15);
    o.pack = airQ + 16 * clamp(howlQ, 0, 15) + 256 * markQ + mangeFrac;
  }

  // ---------------------------------------------------------------------------------------------------------
  /**
   * Plan the migrant columns for a new snapshot. Migrants (F_MIGRANT) of one species that are close together and heading about the
   * same way form a file along their mean heading, centred on where the group is, with `gap` x body length between them; each is
   * given the display offset that takes it from where the sim has it to its place in the file (capped, eased in by `step`).
   */
  planColumns(agents: Float32Array, count: number, slots: Int32Array, bodyLen: (sp: number) => number, flies: (sp: number) => boolean): void {
    for (const s of this.colSlots) { this.tcx[s] = 0; this.tcz[s] = 0; }
    this.colSlots.length = 0;
    const idx: number[] = [];
    for (let i = 0; i < count; i++) {
      const o = i * AGENT_STRIDE;
      if (!((agents[o + 8] | 0) & F_MIGRANT)) continue;
      if (flies(agents[o] | 0) || agents[o + 4] < 0.25) continue;
      this.ensure(slots[i] + 1);
      idx.push(i);
    }
    const m = idx.length;
    if (m < 2) return;
    // group by proximity (union-find)
    const parent = idx.map((_, k) => k);
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (let a = 0; a < m; a++) {
      const oa = idx[a] * AGENT_STRIDE;
      for (let b = a + 1; b < m; b++) {
        const ob = idx[b] * AGENT_STRIDE;
        if (agents[oa] !== agents[ob]) continue;
        const dx = agents[oa + 1] - agents[ob + 1], dz = agents[oa + 2] - agents[ob + 2];
        if (dx * dx + dz * dz > COLUMN_R * COLUMN_R) continue;
        let dh = Math.abs(agents[oa + 3] - agents[ob + 3]) % (Math.PI * 2);
        if (dh > Math.PI) dh = Math.PI * 2 - dh;
        if (dh > COLUMN_HEADING) continue;
        parent[find(a)] = find(b);
      }
    }
    const groups = new Map<number, number[]>();
    for (let a = 0; a < m; a++) {
      const r = find(a);
      const g = groups.get(r);
      if (g) g.push(idx[a]); else groups.set(r, [idx[a]]);
    }
    for (const g of groups.values()) {
      const n = g.length;
      if (n < 2) continue;
      let cx = 0, cz = 0, hx = 0, hz = 0;
      for (const i of g) {
        const o = i * AGENT_STRIDE;
        cx += agents[o + 1]; cz += agents[o + 2];
        hx += Math.cos(agents[o + 3]); hz += Math.sin(agents[o + 3]);
      }
      cx /= n; cz /= n;
      const hl = Math.hypot(hx, hz) || 1;
      hx /= hl; hz /= hl; // along the file, leader first
      const px = -hz, pz = hx;
      const sp = agents[g[0] * AGENT_STRIDE] | 0;
      const gap = Math.max(2.4, COLUMN_GAP * bodyLen(sp));
      const rows = g.map((i) => {
        const o = i * AGENT_STRIDE;
        const dx = agents[o + 1] - cx, dz = agents[o + 2] - cz;
        return { i, along: dx * hx + dz * hz, lat: dx * px + dz * pz };
      });
      rows.sort((p, q) => q.along - p.along);
      const c0 = ((n - 1) * gap) / 2;
      for (let k = 0; k < n; k++) {
        const r = rows[k];
        const jit = (hash01(k * 31 + n * 7 + 1) - 0.5) * 0.7;
        let da = c0 - k * gap - r.along, dl = jit - r.lat;
        const mag = Math.hypot(da, dl);
        if (mag > COLUMN_CAP) { da *= COLUMN_CAP / mag; dl *= COLUMN_CAP / mag; }
        const slot = slots[r.i];
        this.tcx[slot] = hx * da + px * dl;
        this.tcz[slot] = hz * da + pz * dl;
        this.colSlots.push(slot);
      }
    }
  }
}
