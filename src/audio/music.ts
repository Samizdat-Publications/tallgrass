// Tallgrass music (V2-PLAN R14). Five sparse acoustic cues (dawn, day, night, tension, storm/winter) sit on their own bus
// beneath the ambience. A small state machine picks one cue at a time from the time of day, the season and weather, and a
// smoothed 0..1 tension index (chases, kills, die-offs, storms) pulls the music across to the tension cue and back.
// Cue changes are 4 to 8 second equal-power crossfades. The policy half of this file is pure (unit tested in music.test.ts);
// MusicDirector owns the Web Audio side and is driven by AudioDirector, so it starts only once the context is unlocked.
import { Weather } from '../sim/types';
import { clamp01, lerp, sunHeight, winterWeight } from './mix';
import type { MixEnv } from './mix';

// ---------------------------------------------------------------------------------------------------- policy (pure)

export type CueName = 'dawn' | 'day' | 'tension' | 'night' | 'storm';
export const CUE_NAMES: readonly CueName[] = ['dawn', 'day', 'tension', 'night', 'storm'];

/** What the sim shows right now, counted around the camera (see scanTension in inputs.ts). */
export interface TensionSample {
  /** Animals in the chase state near the camera. */
  chasing: number;
  /** Prey in the flee state near the camera. */
  fleeing: number;
  /** Predators stalking near the camera. */
  stalking: number;
  /** Animals chasing anywhere on the map. */
  chasingWorld: number;
  /** Fresh carcasses near the camera (a kill or a die-off just happened). */
  fresh: number;
  /** Fresh carcasses anywhere on the map. */
  freshWorld: number;
}

/** Everything the music policy needs, once per tick. */
export interface MusicFrame {
  env: MixEnv;
  speed: number;
  tension: TensionSample | null;
}

/** Seconds (real time): tension rises quickly and falls slowly. */
export const T_RISE = 6;
export const T_FALL = 15;
/** Event pulses decay with this time constant (real seconds). */
export const PULSE_TAU = 20;
/** The raw tension is measured against a slow average of itself (real seconds); see MusicPolicy.baseline. */
const BASELINE_TAU = 90;
const BASELINE_WEIGHT = 0.9;
const BASELINE_START = 0.15;
/** Tension above T_ENTER switches to the tension cue (0.8 while a storm cue is playing); below T_EXIT it lets go. */
export const T_ENTER = 0.5;
export const T_EXIT = 0.28;
const T_ENTER_STORM = 0.8;
/** Minimum real seconds in the tension cue, and before tension may re-trigger after any change. */
const TENSION_MIN = 20;
/** Tension fatigue: after this long in the tension cue it hands back, and cannot return for TENSION_COOL seconds. */
const TENSION_MAX = 80;
const TENSION_COOL = 40;
const RETRIGGER_MIN = 12;
/** Minimum real seconds in a cue before time of day or season may move it (a fast clock must not flap it). */
const DWELL = 20;
const DWELL_FAST = 60;
const DWELL_STORM = 8;

const sat = (x: number, k: number): number => 1 - Math.exp(-Math.max(0, x) / k);

/** Instantaneous tension (0..1) for one sample of the world, before smoothing. */
export function tensionTarget(s: TensionSample | null, env: MixEnv, speed: number): number {
  let t = 0;
  if (s) {
    // a hunt is several chasers and a herd on the run; a lone chase or a few stalkers is just the prairie being the prairie
    const near = s.chasing + 0.04 * Math.min(s.fleeing, 100) + 0.2 * s.stalking;
    const fresh = s.fresh + 0.2 * s.freshWorld;
    t = 0.8 * sat(near, 5) + 0.15 * sat(s.chasingWorld, 12) + 0.4 * sat(fresh, 5);
  }
  if (env.weather === Weather.Storm) t += 0.2 + 0.2 * clamp01(env.rain);
  t = clamp01(t);
  // at 10x and faster everything is always happening: the music stays out of the hurry
  return speed >= 10 ? t * 0.6 : t;
}

/** The cue the clock and the weather ask for, ignoring tension. Dawn is 0.20 to 0.33 of the day, night 0.80 to 0.20. */
export function baseCue(env: MixEnv, fast = false): CueName {
  const ws = clamp01(env.windStrength);
  if ((env.weather === Weather.Storm && env.rain > 0.2) || (env.weather === Weather.Snow && ws > 0.4)) return 'storm';
  // at 10x and faster the day and the seasons go by in seconds: the clock means nothing, so hold the day cue
  if (fast) return 'day';
  const f = env.dayFrac - Math.floor(env.dayFrac);
  const night = f >= 0.8 || f < 0.2;
  if (winterWeight(env.season) > 0.7 && !night) return 'storm'; // the bleak cue carries the winter days
  if (night) return 'night';
  return f < 0.33 ? 'dawn' : 'day';
}

/** Per-cue loudness trim on top of the shared music level (the files are all levelled to about -20 LUFS). */
export const CUE_TRIM: Record<CueName, number> = { dawn: 1, day: 1, tension: 1.2, night: 0.9, storm: 0.9 };

export interface MusicStep {
  cue: CueName;
  changed: boolean;
  reason: string;
  /** Crossfade length in seconds when `changed`. */
  xfade: number;
}

/** The music state machine: smooths tension and chooses the cue. Pure and deterministic given its inputs. */
export class MusicPolicy {
  /** Smoothed tension plus the live event pulse, 0..1. */
  tension = 0;
  cue: CueName | null = null;
  base: CueName = 'day';
  private smooth = 0;
  private pulse = 0;
  /** Slow average of the raw target: a world that is always busy stops sounding tense, a calm one notices a single hunt. */
  baseline = BASELINE_START;
  private since = 0;
  private cool = 0;
  /** The last instantaneous target and the live pulse, for debug displays. */
  lastTarget = 0;
  get livePulse(): number {
    return this.pulse;
  }

  /** A sim event (a stampede, a first kill) bumps the tension; it decays over about twenty seconds. */
  addPulse(amount: number): void {
    this.pulse = Math.min(0.8, this.pulse + Math.max(0, amount));
  }

  step(dt: number, f: MusicFrame): MusicStep {
    dt = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), 2);
    const raw = tensionTarget(f.tension, f.env, f.speed);
    this.baseline += (raw - this.baseline) * (1 - Math.exp(-dt / BASELINE_TAU));
    // tension is how far the moment rises above what the world has been doing lately
    const target = clamp01((raw - BASELINE_WEIGHT * this.baseline) / (1 - BASELINE_WEIGHT * this.baseline));
    this.lastTarget = target;
    this.smooth += (target - this.smooth) * (1 - Math.exp(-dt / (target > this.smooth ? T_RISE : T_FALL)));
    this.pulse *= Math.exp(-dt / PULSE_TAU);
    this.tension = clamp01(this.smooth + this.pulse);
    this.base = baseCue(f.env, f.speed >= 10);
    this.since += dt;
    this.cool = Math.max(0, this.cool - dt);

    if (this.cue === null) {
      this.cue = this.base;
      this.since = 0;
      return { cue: this.cue, changed: true, reason: 'start', xfade: 3 };
    }
    let want: CueName = this.cue;
    let reason = '';
    if (this.cue === 'tension') {
      if (this.tension < T_EXIT && this.since >= TENSION_MIN) {
        want = this.base;
        reason = 'tension eased';
      } else if (this.since >= TENSION_MAX) {
        want = this.base;
        reason = 'tension fatigue';
        this.cool = TENSION_COOL;
      }
    } else if (this.tension > (this.base === 'storm' ? T_ENTER_STORM : T_ENTER) && this.since >= RETRIGGER_MIN && this.cool <= 0) {
      want = 'tension';
      reason = 'tension rose';
    } else if (this.base !== this.cue) {
      const dwell = this.base === 'storm' ? DWELL_STORM : f.speed >= 10 ? DWELL_FAST : DWELL;
      if (this.since >= dwell) {
        want = this.base;
        reason = 'clock/weather: ' + this.base;
      }
    }
    if (want === this.cue) return { cue: this.cue, changed: false, reason: '', xfade: 0 };
    const xfade = want === 'tension' ? 4 : this.cue === 'tension' ? 8 : f.speed >= 10 ? 5 : 6;
    this.cue = want;
    this.since = 0;
    return { cue: want, changed: true, reason, xfade };
  }
}

/** Small music-level shaping from the weather: a little quieter when rain is loud. */
export function musicWeatherGain(env: MixEnv): number {
  return 1 - 0.3 * clamp01(env.rain);
}

/** How likely each cue is to be wanted next, so the loader can decode it ahead of the change. */
export function prefetchAfter(cue: CueName): CueName | null {
  switch (cue) {
    case 'dawn': return 'day';
    case 'day': return 'night';
    case 'night': return 'dawn';
    default: return null;
  }
}

/** Event kinds that raise tension, and by how much (before distance scaling). */
export function eventPulse(kind: string, a: number): number {
  switch (kind) {
    case 'stampede': return 0.2 + 0.35 * clamp01((a || 10) / 30);
    case 'firstKill': return 0.2;
    case 'packFounded': return 0.15;
    case 'fire': case 'lightningFire': return 0.3;
    case 'storm': return 0.2;
    case 'extinct': return 0.2;
    case 'outbreak': case 'plague': case 'distemper': case 'sylvaticPlague': return 0.1;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------------------------------- Web Audio

/** Linear gain of the whole music bus before the per-cue trim: a good 5 dB under the ambience beds. */
const MUSIC_GAIN = 0.17;
const TICK = 0.25;
const MAX_BUFFERS = 3;

interface Layer {
  cue: CueName;
  src: AudioBufferSourceNode;
  gain: GainNode;
  dir: 'in' | 'out' | 'hold';
  /** Gain when the fade began, and the AudioContext time and length of the fade. */
  from: number;
  t0: number;
  dur: number;
}

export interface MusicTransition {
  /** Real seconds since the music started. */
  t: number;
  from: CueName | null;
  to: CueName;
  reason: string;
  tension: number;
  xfade: number;
}

export class MusicDirector {
  readonly policy = new MusicPolicy();
  /** Decoded cue length in seconds. */
  readonly decoded: Partial<Record<CueName, number>> = {};
  readonly failed: string[] = [];
  readonly transitions: MusicTransition[] = [];

  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private layers: Layer[] = [];
  private buffers = new Map<CueName, AudioBuffer>();
  private used = new Map<CueName, number>();
  private lastPulse = new Map<string, number>();
  private loading = new Map<CueName, Promise<void>>();
  private playing: CueName | null = null;
  private wanted: CueName | null = null;
  private wantedReason = '';
  private wantedXfade = 6;
  private clock = 0;
  private acc = 0;
  private sinceStep = 0;
  private _level = 1;
  private _enabled = true;
  private last: MusicFrame | null = null;

  constructor(private readonly base: string = import.meta.env.BASE_URL + 'audio/music/') {}

  get level(): number {
    return this._level;
  }
  get enabled(): boolean {
    return this._enabled;
  }
  get current(): CueName | null {
    return this.playing;
  }

  /** At 10x and faster events pile up, so each one counts for much less. */
  private hurry(): number {
    return this.last && this.last.speed >= 10 ? 0.35 : 1;
  }

  /** Called once the AudioContext exists (after the first gesture). `out` is the music bus's destination (the master gain). */
  attach(ctx: AudioContext, out: AudioNode): GainNode {
    this.ctx = ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(out);
    this.bus = bus;
    return bus;
  }

  /** Master switch for the music alone (there is no UI for it yet). */
  setEnabled(on: boolean): void {
    this._enabled = on;
    this.applyLevel(0.4);
  }

  /** 0..1 multiplier on the music alone, on top of the master volume. */
  setLevel(v: number): void {
    this._level = clamp01(v);
    this.applyLevel(0.4);
  }

  /** A sim event of this kind happened, `proximity` 0..1 (1 = right here). */
  onEvent(kind: string, a: number, proximity: number): void {
    const p = eventPulse(kind, a);
    if (p <= 0) return;
    // the same kind of event is counted at most once every 8 real seconds (the sim can emit them in bursts)
    const prev = this.lastPulse.get(kind);
    if (prev !== undefined && this.clock - prev < 8) return;
    this.lastPulse.set(kind, this.clock);
    this.policy.addPulse(p * (0.4 + 0.6 * clamp01(proximity)) * this.hurry());
  }

  /** A fresh kill or death near the camera. */
  onDeath(proximity: number): void {
    const prev = this.lastPulse.get('death');
    if (prev !== undefined && this.clock - prev < 8) return;
    this.lastPulse.set('death', this.clock);
    this.policy.addPulse(0.07 * (0.3 + 0.7 * clamp01(proximity)) * this.hurry());
  }

  /** Call every frame (cheap: the policy runs at 4 Hz). dt is real seconds. */
  update(dt: number, f: MusicFrame, now: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus || ctx.state !== 'running') return;
    this.last = f;
    this.clock += dt;
    this.sinceStep += dt;
    this.runFades(ctx.currentTime);
    this.acc -= dt;
    if (this.acc > 0) return;
    this.acc = TICK;
    const step = this.policy.step(this.sinceStep, f);
    this.sinceStep = 0;
    if (step.changed) {
      this.wanted = step.cue;
      this.wantedReason = step.reason;
      this.wantedXfade = step.xfade;
    }
    if (this.wanted !== null && this.wanted !== this.playing) {
      if (this.buffers.has(this.wanted)) this.crossfadeTo(this.wanted, now);
      else void this.ensure(this.wanted);
    } else if (this.playing && this.wanted === this.playing) {
      const next = prefetchAfter(this.playing);
      if (next && !this.buffers.has(next)) void this.ensure(next);
    }
    this.applyLevel(1.2, now);
  }

  /** Debug snapshot for window.__audioState and the headless checks. */
  state(): Record<string, unknown> {
    const g = (n: number): number => Math.round(n * 1000) / 1000;
    return {
      enabled: this._enabled,
      level: this._level,
      busGain: this.bus ? g(this.bus.gain.value) : 0,
      playing: this.playing,
      wanted: this.wanted,
      policyCue: this.policy.cue,
      base: this.policy.base,
      tension: g(this.policy.tension),
      tensionTarget: g(this.policy.lastTarget),
      baseline: g(this.policy.baseline),
      pulse: g(this.policy.livePulse),
      sample: this.last ? this.last.tension : null,
      layers: this.layers.map((l) => ({ cue: l.cue, gain: g(l.gain.gain.value), dir: l.dir })),
      loaded: [...this.buffers.keys()],
      decoded: this.decoded,
      failed: this.failed,
      transitions: this.transitions.slice(-30),
    };
  }

  /** Release the sources (hot reload, tests). */
  dispose(): void {
    for (const l of this.layers) this.release(l);
    this.layers = [];
    this.buffers.clear();
  }

  // ------------------------------------------------------------------------------------------------ internals

  private applyLevel(tc: number, now?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const f = this.last;
    const weather = f ? musicWeatherGain(f.env) : 1;
    // the per-cue trim lives on each layer, so crossfades keep their balance
    const target = this._enabled ? MUSIC_GAIN * this._level * weather : 0;
    this.bus.gain.setTargetAtTime(target, now ?? ctx.currentTime, tc);
  }

  /** Fetch and decode one cue. Never rejects. Several callers share one request. */
  private ensure(cue: CueName): Promise<void> {
    const have = this.loading.get(cue);
    if (have) return have;
    const p = this.doLoad(cue).finally(() => this.loading.delete(cue));
    this.loading.set(cue, p);
    return p;
  }

  private async doLoad(cue: CueName): Promise<void> {
    if (this.failed.includes(cue)) return;
    const Offline = (typeof window !== 'undefined' && (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext)) || null;
    if (!Offline) {
      this.failed.push(cue);
      return;
    }
    try {
      const root = typeof document !== 'undefined' ? new URL(this.base, document.baseURI).href : this.base;
      const res = await fetch(root + cue + '.mp3');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if ((res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('not audio');
      const buf = await new Offline(2, 1, 44100).decodeAudioData(await res.arrayBuffer());
      this.buffers.set(cue, buf);
      this.decoded[cue] = Math.round(buf.duration * 10) / 10;
      this.used.set(cue, this.clock);
      this.evict();
    } catch (err) {
      this.failed.push(cue);
      console.warn('[music] could not load ' + cue + ': ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  /** Keep memory bounded: a decoded cue is about 26 MB, so at most MAX_BUFFERS stay, least recently used first. */
  private evict(): void {
    while (this.buffers.size > MAX_BUFFERS) {
      let drop: CueName | null = null;
      let oldest = Infinity;
      for (const name of this.buffers.keys()) {
        if (name === this.playing || name === this.wanted || name === this.policy.cue || this.layers.some((l) => l.cue === name)) continue;
        const u = this.used.get(name) ?? 0;
        if (u < oldest) {
          oldest = u;
          drop = name;
        }
      }
      if (!drop) return;
      this.buffers.delete(drop);
    }
  }

  private crossfadeTo(cue: CueName, now: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const buf = this.buffers.get(cue);
    if (!ctx || !bus || !buf) return;
    const first = this.playing === null;
    const dur = first ? 3 : this.wantedXfade;
    const t0 = ctx.currentTime;
    for (const l of this.layers) {
      l.from = l.gain.gain.value;
      l.t0 = t0;
      l.dur = dur;
      l.dir = 'out';
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    // start somewhere inside the cue so repeat visits are not always the same opening bars
    src.start(t0 + 0.02, first ? 0 : Math.random() * buf.duration);
    this.layers.push({ cue, src, gain, dir: 'in', from: 0, t0, dur });
    this.transitions.push({
      t: Math.round(this.clock * 10) / 10, from: this.playing, to: cue, reason: this.wantedReason || 'start',
      tension: Math.round(this.policy.tension * 1000) / 1000, xfade: dur,
    });
    if (this.transitions.length > 200) this.transitions.splice(0, 100);
    this.playing = cue;
    this.used.set(cue, this.clock);
    this.evict();
    void now;
  }

  /**
   * Drive every layer's gain along its equal-power curve (sin in, cos out), once per frame. Done by hand, not with
   * AudioParam curves, so a fade can be interrupted by the next cue change without a jump.
   */
  private runFades(t: number): void {
    let done = false;
    for (const l of this.layers) {
      if (l.dir === 'hold') continue;
      const u = Math.min(1, Math.max(0, (t - l.t0) / l.dur));
      const trim = CUE_TRIM[l.cue];
      if (l.dir === 'in') {
        l.gain.gain.value = lerp(Math.min(l.from, trim), trim, Math.sin(u * Math.PI * 0.5));
        if (u >= 1) l.dir = 'hold';
      } else {
        l.gain.gain.value = l.from * Math.cos(u * Math.PI * 0.5);
        if (u >= 1) done = true;
      }
    }
    if (!done) return;
    this.layers = this.layers.filter((l) => {
      if (l.dir === 'out' && (t - l.t0) / l.dur >= 1) {
        this.release(l);
        return false;
      }
      return true;
    });
  }

  private release(l: Layer): void {
    try {
      l.src.stop();
    } catch {
      /* already stopped */
    }
    l.src.disconnect();
    l.gain.disconnect();
  }
}
