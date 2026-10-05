// Tallgrass audio director (Web Audio). Six looping ambience beds crossfade with time of day, season, weather, wind,
// water and camera height; random spot sounds (wolves, ravens, bison, thunder) and one-shot event sounds ride on top.
// All policy lives in mix.ts (pure, unit tested); this file only owns the audio graph and the clock.
//
// Wiring: const audio = new AudioDirector(); audio.load();  then every frame audio.update(dt, {...});
// and audio.onEvent(e, distanceFromCamera) for each sim event. The context starts on the first click or key press.
import type { EnvState } from '../sim/types';
import type { SimEvent } from '../sim/sim';
import {
  BED_NAMES, SPOT_KEYS, bedMix, clamp01, distanceCutoff, distanceGain, eventAttenuation, eventDistance01, lerp, nextDelay, randomWindow,
  segmentClip, spotPlan,
} from './mix';
import type { BedMix, BedName, Nearby, Segment, SpotKey, SpotRule } from './mix';
import { MusicDirector } from './music';
import type { TensionSample } from './music';
import { WILD_FILES, larkSpot, pickCoyoteClip, placement, thunderPlan, wildPlan } from './wildlife';
import type { WildClip } from './wildlife';

export type { BedMix, BedName, Nearby } from './mix';
export { bedMix } from './mix';

/** Everything update() needs, once per frame. */
export interface AudioFrame {
  env: EnvState;
  /** Camera ground position in sim metres (reserved for positional work; the beds do not need it). */
  camX: number;
  camY: number;
  /** Camera height above ground in metres. Below 60 is "down among the animals", above ~350 is "mostly wind". */
  camHeight: number;
  /** Sim speed multiplier (0 paused, 1, 10, 100...). At >= 10 spot sounds thin out; beds carry on. */
  speed: number;
  /** Animal counts near the camera (the lead decides the radius, a few hundred metres is about right). */
  nearby: Nearby;
  /** 0..1 how close the camera is to water. */
  nearWater: number;
  /** Chases, kills and die-offs around the camera (scanTension in inputs.ts); drives the music tension. Optional. */
  tension?: TensionSample | null;
  /** The direction the camera looks (three coordinates, a unit vector): sounds placed in the world are panned by it. Optional (default: north). */
  camFwd?: readonly [number, number, number];
  /** Coyotes near the camera (Nearby.coyote); they only call while there are some. Optional. */
  coyotes?: number;
}

/**
 * A sandhill crane flyover the audio has scheduled. The V-formation render is not audio's job: set `audio.onFlyover` and
 * draw the birds crossing the sky for `duration` seconds from `startAt` (AudioContext time; real seconds from now are
 * `startAt - audio.now`), entering at pan `panFrom` and leaving at `panTo` (-1 left edge of the view .. +1 right edge).
 */
export interface Flyover {
  startAt: number;
  /** Seconds from the first call to the last (the birds are in earshot a little longer). */
  duration: number;
  panFrom: number;
  panTo: number;
  /** Birds in the flock (about 5 to 12). */
  birds: number;
  /** Height above ground in metres. */
  altitude: number;
  /** 'spring' or 'autumn' (autumn flocks head south, spring flocks north). */
  season: 'spring' | 'autumn';
}

type ClipName = BedName | 'thunder' | 'wolfPack' | 'wolfSingle' | 'bison' | 'stampede' | 'raven' | 'rut' | 'crane' | WildClip;

const FILES: Record<ClipName, string> = {
  wind: 'wind_day',
  birds: 'evening_birds',
  crickets: 'night_crickets',
  rain: 'rain',
  winter: 'wind_winter',
  creek: 'creek',
  thunder: 'thunder',
  wolfPack: 'wolf_pack',
  wolfSingle: 'wolf_single',
  bison: 'bison_grunts',
  stampede: 'stampede',
  raven: 'raven_calls',
  blizzard: 'blizzard',
  grasshopper: 'grasshopper',
  rut: 'bison_rut',
  crane: 'crane_bugle',
  ...WILD_FILES,
};

/** Per-bed loudness trim. The files are levelled to the same RMS, so this is the artistic balance. */
const BED_TRIM: Record<BedName, number> = { wind: 0.72, birds: 0.42, crickets: 0.36, rain: 0.42, winter: 0.62, creek: 0.42, blizzard: 0.55, grasshopper: 0.3 };
/** Seconds for a bed to settle on a new target (time constant). Crossfades take about three of these. */
const BED_TC = 0.7;
const BED_TICK = 0.125;
const MAX_VOICES = 10;
/** Events of the same kind closer together than this (real seconds) are dropped, so 100x speed cannot machine-gun a howl. */
const EVENT_COOLDOWN = 3;

interface PlayOpts {
  gain: number;
  rate?: number;
  /** 0 close .. 1 far */
  distance?: number;
  pan?: number;
  delay?: number;
  segment?: Segment;
  /** Override the low-pass cutoff (Hz). */
  cutoff?: number;
  /** If set, the pan glides from `pan` to this over the sound's length. */
  panEnd?: number;
}

export class AudioDirector {
  /** Decoded clip info, filled by load(): name -> seconds, channels, sample rate, detected segments. */
  readonly decoded: Record<string, { seconds: number; channels: number; sampleRate: number; segments: number }> = {};
  /** Files that failed to load (the game runs on without them). */
  readonly missing: string[] = [];
  /** The last bed targets, for debug displays. */
  lastMix: BedMix = { wind: 0, birds: 0, crickets: 0, rain: 0, winter: 0, creek: 0, blizzard: 0, grasshopper: 0 };
  /** The music director (sparse acoustic cues under the ambience; see music.ts). Starts with the context, after the first gesture. */
  readonly music = new MusicDirector();
  /** Set this to be told when a crane flyover is scheduled (draw the flock; audio only makes the sound). */
  onFlyover: ((f: Flyover) => void) | null = null;
  /** Flyovers scheduled so far, newest last (capped at 20), for debug and tests. */
  readonly flyovers: Flyover[] = [];

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedBus: GainNode | null = null;
  private spotBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private ambTrim: GainNode | null = null;
  private voiceTrim: GainNode | null = null;
  private _busVol = { ambience: 1, music: 1, voice: 1 };
  private voiceBuffers = new Map<string, AudioBuffer>();
  private voiceLoading: Promise<void> | null = null;
  private voiceSrc: AudioBufferSourceNode | null = null;
  private voiceInfo: { id: string; start: number; duration: number } | null = null;
  private meter: AnalyserNode | null = null;
  private buffers = new Map<ClipName, AudioBuffer>();
  private segs = new Map<ClipName, Segment[]>();
  private beds = new Map<BedName, GainNode>();
  private bedsStarted = false;
  private loaded = false;
  private _muted = false;
  private _volume = 1;
  private clock = 0;
  private bedClock = 0;
  private voices = 0;
  private armed: Record<SpotKey, boolean> = { wolf: false, raven: false, bison: false, thunder: false, rut: false, crane: false };
  private timers: Record<SpotKey, number> = { wolf: 0, raven: 0, bison: 0, thunder: 0, rut: 0, crane: 0 };
  /** The R3 wildlife spots (coyotes at dusk, the meadowlark by day), see wildlife.ts. */
  private wildArmed = { coyote: false, lark: false };
  private wildTimers = { coyote: 0, lark: 0 };
  private musicDuck: GainNode | null = null;
  private lastEvent = new Map<string, number>();
  private last: AudioFrame | null = null;
  private gestureHandler: (() => void) | null = null;
  private loading: Promise<void> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Browsers only let audio start from a user gesture. Resume on the first one, then stop listening.
      const h = () => this.resume();
      this.gestureHandler = h;
      for (const ev of GESTURES) window.addEventListener(ev, h, { capture: true, passive: true });
      // debug: window.__audioState is a live snapshot of the music state machine and the ambience
      Object.defineProperty(window, '__audioState', { configurable: true, get: () => this.debugState() });
    }
  }

  /** The AudioContext clock in seconds (0 before the context exists). */
  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Live debug snapshot: context state, music state machine (cue, tension, crossfades, transition log), ambience targets. */
  debugState(): Record<string, unknown> {
    return {
      context: this.state,
      ready: this.ready,
      muted: this._muted,
      volume: this._volume,
      music: this.music.state(),
      mix: this.lastMix,
      flyovers: this.flyovers.length,
      lastFlyover: this.flyovers.length ? this.flyovers[this.flyovers.length - 1] : null,
      missing: this.missing,
    };
  }

  // ------------------------------------------------------------------------------------------------ public API

  get muted(): boolean {
    return this._muted;
  }
  get volume(): number {
    return this._volume;
  }
  /** 'suspended' until the first gesture, then 'running'. 'unsupported' where Web Audio is missing. */
  get state(): string {
    return this.ctx ? this.ctx.state : typeof window !== 'undefined' && (window.AudioContext ?? webkit()) ? 'idle' : 'unsupported';
  }
  /** Master-bus analyser for level meters (null until the context exists). */
  get analyser(): AnalyserNode | null {
    return this.meter;
  }
  /** Spot voices currently sounding. */
  get activeVoices(): number {
    return this.voices;
  }
  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.bedsStarted;
  }

  /** Fetch and decode every file. Safe to call before any gesture. Never rejects: missing files are listed in `missing`. */
  load(base: string = import.meta.env.BASE_URL + 'audio/'): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.doLoad(base);
    return this.loading;
  }

  /** Call from a user gesture (the constructor already listens for the first click or key). Idempotent. */
  resume(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    void ctx.resume().then(() => {
      if (ctx.state === 'running') this.stopListening();
    }).catch(() => {});
  }

  setMuted(m: boolean): void {
    this._muted = m;
    this.applyMaster();
  }

  /** Player volume for one bus (0..1): 'ambience' (beds and spot sounds), 'music' or 'voice' (narrator). Kept across a context restart. */
  setBusVolume(bus: 'ambience' | 'music' | 'voice', v: number): void {
    const g = clamp01(v);
    this._busVol[bus] = g;
    if (bus === 'music') { this.music.setLevel(g); return; }
    const node = bus === 'ambience' ? this.ambTrim : this.voiceTrim;
    if (node && this.ctx) node.gain.setTargetAtTime(g, this.ctx.currentTime, 0.05);
  }

  setVolume(v: number): void {
    this._volume = clamp01(v);
    this.applyMaster();
  }

  /** Call every frame. dt is real seconds since the last frame. Cheap: beds retarget at 8 Hz, spot sounds are timers. */
  update(dt: number, s: AudioFrame): void {
    this.last = s;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.bedsStarted) return;
    dt = Math.min(Math.max(dt, 0), 0.25);
    this.clock += dt;
    this.bedClock -= dt;
    if (this.bedClock <= 0) {
      this.bedClock = BED_TICK;
      this.updateBeds(s, ctx.currentTime);
    }
    this.music.update(dt, { env: s.env, speed: s.speed, tension: s.tension ?? null }, ctx.currentTime);
    this.updateListener(s);
    if (!this._muted) {
      this.updateSpots(dt, s);
      this.updateWild(dt, s);
    }
  }

  /** A sim event happened `distance` metres from the camera. Plays the matching one-shot, if any. */
  onEvent(e: SimEvent, distance: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.bedsStarted || this._muted) return;
    const kind = e.kind === 'extinct' && e.sp === 1 ? 'wolfExtinct' : e.kind;
    this.music.onEvent(e.kind, e.a, eventAttenuation(Number.isFinite(distance) ? Math.max(0, distance) : 300));
    const now = this.clock;
    const prev = this.lastEvent.get(kind);
    if (prev !== undefined && now - prev < EVENT_COOLDOWN) return;
    const d = Number.isFinite(distance) ? Math.max(0, distance) : 300;
    const d01 = eventDistance01(d);
    const atten = eventAttenuation(d);
    const pan = (Math.random() * 2 - 1) * 0.6;
    let played = 0;
    switch (e.kind) {
      case 'stampede': {
        // e.a = number of animals running. Big herds are louder and a little lower.
        const size = clamp01((e.a || 10) / 30);
        const rate = lerp(1.03, 0.93, size) * (0.98 + Math.random() * 0.04);
        played = this.play('stampede', { gain: (0.25 + 0.75 * size) * atten, rate, distance: Math.min(d01, 0.9), pan });
        break;
      }
      case 'packFounded':
        played = this.play('wolfPack', { gain: (0.5 + 0.2 * Math.random()) * Math.max(atten, 0.3), rate: rand(0.95, 1.05), distance: Math.max(d01, 0.55), pan });
        break;
      case 'firstKill':
        played = this.play('wolfSingle', { gain: (0.45 + 0.2 * Math.random()) * Math.max(atten, 0.3), rate: rand(0.92, 1.08), distance: Math.max(d01, 0.6), pan });
        break;
      case 'packLost':
        played = this.play('wolfSingle', { gain: 0.35 * Math.max(atten, 0.35), rate: rand(0.9, 0.97), distance: Math.max(d01, 0.7), pan });
        break;
      case 'extinct':
        if (e.sp === 1) played = this.play('wolfSingle', { gain: 0.5, rate: rand(0.88, 0.94), distance: 0.75, pan });
        break;
      case 'fire':
        // No fire asset: a slow low swell of wind through a hard low-pass reads as the draught a big fire pulls in.
        played = this.play('wind', {
          gain: 0.5 * atten, rate: rand(0.8, 0.9), cutoff: 420, pan, segment: randomWindow(this.dur('wind'), 3.5, 4.5, Math.random(), Math.random()),
        });
        break;
      default:
        break; // drought, rain, plague and the rest are carried by the env beds or stay silent
    }
    if (played > 0) this.lastEvent.set(kind, now);
  }

  private lastDeath = -1e9;

  /**
   * An animal just fell `distance` metres from the camera (a fresh carcass): a short distressed call, so a kill
   * on screen is heard, not just seen. At most one every four seconds.
   */
  onDeath(sp: number, distance: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.bedsStarted || this._muted) return;
    if (this.clock - this.lastDeath < 4) return;
    const d = Number.isFinite(distance) ? Math.max(0, distance) : 300;
    const atten = eventAttenuation(d);
    if (atten < 0.08) return;
    this.music.onDeath(atten);
    const o = { gain: 0.55 * atten, distance: Math.min(eventDistance01(d), 0.85), pan: (Math.random() * 2 - 1) * 0.5 };
    if (sp === 0) this.playCalls('bison', 2, { ...o, rate: rand(0.78, 0.86) }); // a low bellow
    else if (sp === 3) this.playCalls('bison', 1, { ...o, gain: o.gain * 0.7, rate: rand(1.45, 1.6) }); // a thin, high bleat
    else return;
    this.lastDeath = this.clock;
  }

  // ------------------------------------------------------------------------------------------------ narration

  /**
   * Fetch and decode the narrator's lines. Never rejects. A line that is missing (not generated yet, a failed fetch,
   * or a dev server answering with its index page) is simply not available: no warning, the narrator skips it.
   */
  loadVoices(ids: string[], base: string = import.meta.env.BASE_URL + 'audio/narration/'): Promise<void> {
    if (this.voiceLoading) return this.voiceLoading;
    this.voiceLoading = this.doLoadVoices(ids, base);
    return this.voiceLoading;
  }

  private async doLoadVoices(ids: string[], base: string): Promise<void> {
    const root = typeof document !== 'undefined' ? new URL(base, document.baseURI).href : base;
    const OfflineCtx = (typeof window !== 'undefined' && (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext)) || null;
    if (!OfflineCtx) return;
    const dec = new OfflineCtx(2, 1, 44100);
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(root + id + '.mp3');
          if (!res.ok) return;
          const type = res.headers.get('content-type') ?? '';
          if (type.includes('text/html')) return; // a dev server's fallback page, not audio
          this.voiceBuffers.set(id, await dec.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* no line: the narrator carries on without it */
        }
      }),
    );
  }

  /** True when the line is decoded and ready to speak. */
  hasVoice(id: string): boolean {
    return this.voiceBuffers.has(id);
  }

  /** Ids of the lines that decoded, for debug displays and tests. */
  get voiceIds(): string[] {
    return [...this.voiceBuffers.keys()];
  }

  /** The context is running (the first click has unlocked it), so a line can be heard. */
  get voiceReady(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.voiceBus;
  }

  /** The line now playing: its id, how long it has run and how long it lasts (seconds). Null when silent. */
  get voiceNow(): { id: string; elapsed: number; duration: number } | null {
    const v = this.voiceInfo;
    if (!v || !this.ctx) return null;
    return { id: v.id, elapsed: Math.max(0, this.ctx.currentTime - v.start), duration: v.duration };
  }

  /** The current ducking of the beds and spot sounds (1 = untouched). For debug displays and tests. */
  get duckLevel(): { beds: number; spots: number } {
    return { beds: this.bedBus ? this.bedBus.gain.value : 1, spots: this.spotBus ? this.spotBus.gain.value : 1 };
  }

  /**
   * Speak one line. Resolves true when it has played to the end, false when it could not start (not unlocked, missing,
   * already speaking) or was stopped. While it plays the beds and spot sounds give way by `duck` (0..1) over `ramp`
   * seconds, and come back the same way afterwards.
   */
  speak(id: string, duck = 0.4, ramp = 0.3): Promise<boolean> {
    const ctx = this.ctx;
    const buf = this.voiceBuffers.get(id);
    if (!ctx || ctx.state !== 'running' || !buf || !this.voiceBus || this.voiceSrc) return Promise.resolve(false);
    const t0 = ctx.currentTime + 0.05;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const fade = Math.min(0.12, buf.duration * 0.1);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + fade);
    g.gain.setValueAtTime(1, Math.max(t0 + fade, t0 + buf.duration - fade));
    g.gain.linearRampToValueAtTime(0, t0 + buf.duration);
    src.connect(g);
    g.connect(this.voiceBus);
    this.voiceSrc = src;
    this.voiceInfo = { id, start: t0, duration: buf.duration };
    // the world gets quieter just before the voice comes in
    this.rampDuck(1 - clamp01(duck), ramp, ctx.currentTime);
    return new Promise<boolean>((resolve) => {
      src.onended = () => {
        const wasMine = this.voiceSrc === src;
        src.disconnect();
        g.disconnect();
        if (wasMine) {
          this.voiceSrc = null;
          this.voiceInfo = null;
          if (this.ctx) this.rampDuck(1, ramp, this.ctx.currentTime);
        }
        resolve(wasMine);
      };
      src.start(t0);
    });
  }

  /** Stop the line that is playing, if any (a world change, the narrator switched off). */
  stopVoice(): void {
    const src = this.voiceSrc;
    if (!src || !this.ctx) return;
    this.voiceSrc = null;
    this.voiceInfo = null;
    this.rampDuck(1, 0.3, this.ctx.currentTime);
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  }

  /** Smooth ramp of the beds and spot sounds to `level` (1 = untouched). */
  private rampDuck(level: number, seconds: number, now: number): void {
    for (const bus of [this.bedBus, this.spotBus, this.musicDuck]) {
      if (!bus) continue;
      const p = bus.gain;
      const cur = p.value;
      p.cancelScheduledValues(now);
      p.setValueAtTime(cur, now);
      p.linearRampToValueAtTime(level, now + seconds);
    }
  }

  /** Release the context and listeners (hot reload, tests). */
  dispose(): void {
    this.stopListening();
    const ctx = this.ctx;
    this.ctx = null;
    this.bedsStarted = false;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }

  // ------------------------------------------------------------------------------------------------ loading

  private async doLoad(base: string): Promise<void> {
    const root = typeof document !== 'undefined' ? new URL(base, document.baseURI).href : base;
    // Decode in an offline context so loading never needs a user gesture (and never logs an autoplay warning).
    const OfflineCtx = (typeof window !== 'undefined' && (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext)) || null;
    if (!OfflineCtx) {
      this.missing.push('(Web Audio unavailable)');
      return;
    }
    const dec = new OfflineCtx(2, 1, 44100);
    const names = Object.keys(FILES) as ClipName[];
    await Promise.all(
      names.map(async (name) => {
        const file = FILES[name] + '.mp3';
        try {
          const res = await fetch(root + file);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = await dec.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
          let segments: Segment[] = [{ start: 0, end: buf.duration }];
          if (name === 'raven') segments = segmentClip(buf.getChannelData(0), buf.sampleRate, { relDb: 22 });
          if (name === 'bison') segments = segmentClip(buf.getChannelData(0), buf.sampleRate, { relDb: 12, minGap: 0.04, minLen: 0.12 });
          if (name === 'dogYip') segments = segmentClip(buf.getChannelData(0), buf.sampleRate, { relDb: 16, minGap: 0.05, minLen: 0.06 });
          this.segs.set(name, segments);
          this.decoded[name] = { seconds: buf.duration, channels: buf.numberOfChannels, sampleRate: buf.sampleRate, segments: segments.length };
        } catch (err) {
          this.missing.push(file);
          console.warn('[audio] could not load ' + file + ': ' + (err instanceof Error ? err.message : String(err)));
        }
      }),
    );
    this.loaded = true;
    this.startBeds();
  }

  // ------------------------------------------------------------------------------------------------ graph

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? webkit();
    if (!Ctor) return null;
    const ctx = new Ctor({ latencyHint: 'playback' });
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : this.volumeGain();
    // Gentle bus compressor, then a fast limiter so stacked beds plus a thunderclap can never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.02;
    comp.release.value = 0.35;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    const bedBus = ctx.createGain();
    const spotBus = ctx.createGain();
    // the narrator rides beside the beds and spot sounds, straight into the master (so M and the volume still rule it)
    const voiceBus = ctx.createGain();
    // player volume trims (settings): beds and spot sounds share the ambience trim; the duck stays on the buses
    const ambTrim = ctx.createGain();
    ambTrim.gain.value = this._busVol.ambience;
    const voiceTrim = ctx.createGain();
    voiceTrim.gain.value = this._busVol.voice;
    ambTrim.connect(master);
    voiceTrim.connect(master);
    bedBus.connect(ambTrim);
    spotBus.connect(ambTrim);
    voiceBus.connect(voiceTrim);
    this.ambTrim = ambTrim;
    this.voiceTrim = voiceTrim;
    // music: its own director-controlled bus, then a duck node (the narrator ducks it like the beds), then the master
    const musicDuck = ctx.createGain();
    musicDuck.connect(master);
    this.music.attach(ctx, musicDuck);
    this.musicDuck = musicDuck;
    master.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);
    limiter.connect(meter);
    this.ctx = ctx;
    this.master = master;
    this.bedBus = bedBus;
    this.spotBus = spotBus;
    this.voiceBus = voiceBus;
    this.meter = meter;
    this.startBeds();
    return ctx;
  }

  private startBeds(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bedBus || this.bedsStarted || !this.loaded) return;
    for (const name of BED_NAMES) {
      const buf = this.buffers.get(name);
      if (!buf) continue;
      const g = ctx.createGain();
      g.gain.value = 0; // fades in from silence on the first update
      g.connect(this.bedBus);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g);
      src.start(ctx.currentTime + 0.02, Math.random() * buf.duration);
      this.beds.set(name, g);
    }
    this.bedsStarted = true;
    // First spot sounds come after a plausible wait, not all at once.
    this.timers = { wolf: rand(12, 40), raven: rand(6, 16), bison: rand(4, 10), thunder: rand(6, 20), rut: rand(5, 14), crane: rand(8, 30) };
    this.wildTimers = { coyote: rand(10, 30), lark: rand(3, 9) };
    if (this.last) this.updateBeds(this.last, ctx.currentTime);
  }

  private volumeGain(): number {
    return this._volume * this._volume; // perceptual taper
  }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this._muted ? 0 : this.volumeGain(), this.ctx.currentTime, 0.05);
  }

  private stopListening(): void {
    if (!this.gestureHandler || typeof window === 'undefined') return;
    for (const ev of GESTURES) window.removeEventListener(ev, this.gestureHandler, { capture: true });
    this.gestureHandler = null;
  }

  // ------------------------------------------------------------------------------------------------ beds and spots

  private updateBeds(s: AudioFrame, now: number): void {
    const mix = bedMix(s.env, s.camHeight, s.nearWater);
    this.lastMix = mix;
    const ws = clamp01(s.env.windStrength);
    // slow gusts: two incommensurate sines, deeper when the wind is up
    const gust = 1 + (0.06 + 0.16 * ws) * (0.6 * Math.sin(this.clock * 0.31) + 0.4 * Math.sin(this.clock * 0.83 + 1.3));
    for (const name of BED_NAMES) {
      const g = this.beds.get(name);
      if (!g) continue;
      let target = mix[name] * BED_TRIM[name];
      if (name === 'wind' || name === 'winter') target *= gust;
      g.gain.setTargetAtTime(target, now, BED_TC);
    }
  }

  private updateSpots(dt: number, s: AudioFrame): void {
    const plan = spotPlan(s.env, s.camHeight, s.nearby, s.speed);
    for (const k of SPOT_KEYS) {
      const rule = plan[k];
      if (!Number.isFinite(rule.mean)) {
        this.armed[k] = false;
        continue;
      }
      if (!this.armed[k]) {
        // conditions just became right (dusk fell, the herd came close...): first sound after a natural wait
        this.armed[k] = true;
        this.timers[k] = nextDelay(rule.mean, Math.random()) * 0.6;
      }
      this.timers[k] -= dt;
      if (this.timers[k] > 0) continue;
      this.fireSpot(k, rule, s);
      this.timers[k] = nextDelay(rule.mean, Math.random());
    }
  }

  private fireSpot(k: SpotKey, rule: SpotRule, s: AudioFrame): void {
    const jitter = rand(0.75, 1.1);
    const rate = rand(0.92, 1.08);
    const distance = clamp01(rule.distance + (Math.random() - 0.5) * 0.2);
    const pan = (Math.random() * 2 - 1) * 0.7;
    switch (k) {
      case 'wolf': {
        const pack = Math.random() < (s.nearby.wolf >= 3 ? 0.45 : 0.25);
        this.play(pack ? 'wolfPack' : 'wolfSingle', { gain: rule.gain * jitter, rate, distance, pan });
        break;
      }
      case 'raven':
        this.playCalls('raven', 1 + Math.floor(Math.random() * 3), { gain: rule.gain * jitter, rate, distance, pan });
        break;
      case 'bison':
        this.playCalls('bison', 1 + Math.floor(Math.random() * 2), { gain: rule.gain * jitter, rate, distance, pan });
        break;
      case 'thunder':
        this.play('thunder', { gain: rule.gain * rand(0.6, 1.1), rate: rand(0.9, 1.05), distance: clamp01(rule.distance + (Math.random() - 0.5) * 0.4), pan });
        break;
      case 'rut': {
        // a bull's bellow, now and then answered by a second
        const o = { gain: rule.gain * jitter, distance, pan };
        const d1 = this.play('rut', { ...o, rate: rand(0.88, 1.04) });
        if (d1 > 0 && Math.random() < 0.35) this.play('rut', { ...o, gain: o.gain * 0.6, distance: clamp01(distance + 0.25), pan: -pan, delay: d1 * rand(0.6, 1.1), rate: rand(0.8, 0.95) });
        break;
      }
      case 'crane':
        this.scheduleFlyover(rule.gain * rand(0.8, 1.1), s.env.season);
        break;
    }
  }

  /**
   * Sound of a flock of sandhill cranes crossing the sky: three or four bugle calls spread over 24 to 40 seconds, panning
   * steadily from one side to the other and loudest mid-pass. Calls onFlyover so a renderer can draw the flock.
   * Public so a debug key or a test can trigger one. Returns the schedule (also pushed to `flyovers`), or null if nothing played.
   */
  scheduleFlyover(gain = 0.45, season = 0.3): Flyover | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.bedsStarted || !this.buffers.has('crane')) return null;
    const duration = rand(24, 40);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const panFrom = -0.85 * dir;
    const panTo = 0.85 * dir;
    const calls = 3 + Math.floor(Math.random() * 2);
    const base = ctx.currentTime + 0.1;
    let played = 0;
    for (let i = 0; i < calls; i++) {
      const u0 = i / (calls - 1); // where in the pass this call sits
      const bell = 0.45 + 0.55 * Math.sin(Math.PI * clamp01(0.15 + 0.7 * u0)); // loudest mid-pass
      const at = u0 * Math.max(0, duration - 5);
      const p0 = lerp(panFrom, panTo, clamp01(at / duration));
      const p1 = lerp(panFrom, panTo, clamp01((at + 5) / duration));
      const dur = this.play('crane', {
        gain: gain * bell * rand(0.85, 1.1), rate: rand(0.94, 1.06), distance: clamp01(0.55 - 0.25 * bell + rand(-0.05, 0.05)),
        pan: p0, panEnd: p1, delay: at + rand(0, 1.5),
      });
      if (dur > 0) played++;
    }
    if (played === 0) return null;
    const f: Flyover = {
      startAt: base, duration, panFrom, panTo, birds: 5 + Math.floor(Math.random() * 8), altitude: rand(90, 220),
      season: season > 2 && season < 3.5 ? 'autumn' : 'spring',
    };
    this.flyovers.push(f);
    if (this.flyovers.length > 20) this.flyovers.shift();
    if (this.onFlyover) {
      try {
        this.onFlyover(f);
      } catch (err) {
        console.warn('[audio] onFlyover handler threw: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
    return f;
  }

  // ------------------------------------------------------------------------------------------------ wildlife (R3)

  /**
   * A lightning strike `distance` metres away (the storm layer calls this when a bolt flashes): its thunder arrives `delay` seconds
   * later (the storm layer picks the speed of sound it wants; distance / 340 is the honest value). Close strikes crack, far ones
   * only rumble. `pan` is -1 .. 1 (left to right), random when left out. Returns the sound's length in seconds (0 if nothing played).
   */
  onThunder(distance: number, delay = 0, pan?: number): number {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.bedsStarted || this._muted) return 0;
    const plan = thunderPlan(distance, Math.random());
    const p = pan ?? (Math.random() * 2 - 1) * 0.5;
    const clip: ClipName = plan.clip === 'rumble' ? 'thunder' : plan.clip;
    return this.play(clip, { gain: plan.gain, rate: plan.rate, distance: plan.cutoffD01, pan: p, delay: Math.max(0, delay) });
  }

  /**
   * The small-prey layer's sounds, placed where they happen (three coordinates: x, height above ground, z): 'alarm' is a prairie dog
   * town's alarm chorus (an alarm wave has begun), 'yip' one dog's jump-yip. Positional while the camera is low, a plain sound
   * from up high.
   */
  onSmallPrey(kind: 'alarm' | 'yip', x: number, y: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.bedsStarted || this._muted) return;
    if (kind === 'alarm') {
      this.playAt('dogAlarm', x, y + 0.4, z, { gain: 0.95, rate: rand(0.96, 1.04) });
      return;
    }
    const segs = this.segs.get('dogYip') ?? [];
    const seg = segs.length > 0 ? segs[Math.floor(Math.random() * segs.length)] : undefined;
    // a prairie dog is smaller than the dog the clip sounds like: pitched up
    this.playAt('dogYip', x, y + 0.3, z, { gain: 0.85, rate: rand(1.3, 1.5), segment: seg });
  }

  /** Sync the Web Audio listener to the camera (position and the way it looks), once per frame. */
  private updateListener(s: AudioFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const f = s.camFwd ?? [0, 0, -1];
    if (L.positionX) {
      L.positionX.value = s.camX;
      L.positionY.value = s.camHeight;
      L.positionZ.value = s.camY;
      L.forwardX.value = f[0];
      L.forwardY.value = f[1];
      L.forwardZ.value = f[2];
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      (L as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(s.camX, s.camHeight, s.camY);
      (L as unknown as { setOrientation(...a: number[]): void }).setOrientation(f[0], f[1], f[2], 0, 1, 0);
    }
  }

  private updateWild(dt: number, s: AudioFrame): void {
    const plan = wildPlan(s.env, s.camHeight, s.coyotes ?? 0, s.speed);
    for (const k of ['coyote', 'lark'] as const) {
      const rule = plan[k];
      if (!Number.isFinite(rule.mean)) {
        this.wildArmed[k] = false;
        continue;
      }
      if (!this.wildArmed[k]) {
        this.wildArmed[k] = true;
        this.wildTimers[k] = nextDelay(rule.mean, Math.random()) * 0.6;
      }
      this.wildTimers[k] -= dt;
      if (this.wildTimers[k] > 0) continue;
      this.fireWild(k, rule, s);
      this.wildTimers[k] = nextDelay(rule.mean, Math.random());
    }
  }

  private fireWild(k: 'coyote' | 'lark', rule: SpotRule, s: AudioFrame): void {
    if (k === 'lark') {
      const spot = larkSpot(s.camX, s.camY, Math.random() * Math.PI * 2, Math.random());
      this.playAt('lark', spot.x, 1.6, spot.z, { gain: rule.gain * rand(0.8, 1.1), rate: rand(0.96, 1.05) });
      return;
    }
    // coyotes call from somewhere out in the grass, 80 to 260 m off
    const a = Math.random() * Math.PI * 2;
    const d = lerp(80, 260, clamp01(rule.distance + (Math.random() - 0.5) * 0.3));
    this.playAt(pickCoyoteClip(Math.random()), s.camX + Math.cos(a) * d, 0.8, s.camY + Math.sin(a) * d, { gain: rule.gain * rand(0.8, 1.15), rate: rand(0.95, 1.06) });
  }

  /**
   * Play a clip from a place in the world (three coordinates: x, height above the ground, z). With the camera low it goes through a
   * PannerNode at the source (panned and softened by where it is, the listener follows the camera); from up high it is an ordinary
   * distance-filtered sound with no panning, as every other spot sound is. Returns the audible length in seconds (0 if nothing played).
   */
  private playAt(clip: ClipName, wx: number, wy: number, wz: number, o: { gain: number; rate?: number; segment?: Segment; delay?: number }): number {
    const ctx = this.ctx;
    const buf = this.buffers.get(clip);
    const s = this.last;
    if (!ctx || !buf || !s || !this.spotBus || this.voices >= MAX_VOICES) return 0;
    const gd = Math.hypot(wx - s.camX, wz - s.camY);
    const pl = placement(s.camHeight, gd);
    if (!pl.positional) return this.play(clip, { ...o, distance: Math.max(0.12, pl.distance01), pan: 0 });
    const rate = o.rate ?? 1;
    const seg = o.segment ?? { start: 0, end: buf.duration };
    const len = Math.max(0.05, seg.end - seg.start);
    const dur = len / rate;
    const gain = clamp01(o.gain);
    if (gain < 0.004) return 0;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = distanceCutoff(clamp01(gd / 450));
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower';
    pan.distanceModel = 'inverse';
    pan.refDistance = 15;
    pan.rolloffFactor = 0.7;
    pan.maxDistance = 800;
    if (pan.positionX) {
      pan.positionX.value = wx;
      pan.positionY.value = wy;
      pan.positionZ.value = wz;
    } else {
      (pan as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(wx, wy, wz);
    }
    src.connect(lp);
    lp.connect(g);
    g.connect(pan);
    pan.connect(this.spotBus);
    const fadeIn = Math.min(0.03, dur * 0.25);
    const fadeOut = Math.min(0.12, dur * 0.4);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + fadeIn);
    g.gain.setValueAtTime(gain, Math.max(t0 + fadeIn, t0 + dur - fadeOut));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.start(t0, seg.start, len);
    this.voices++;
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      src.disconnect();
      lp.disconnect();
      g.disconnect();
      pan.disconnect();
    };
    return dur;
  }

  // ------------------------------------------------------------------------------------------------ voices

  private dur(clip: ClipName): number {
    return this.buffers.get(clip)?.duration ?? 1;
  }

  /** Play one clip (or a segment of it) through distance filtering. Returns the audible duration in seconds (0 if nothing played). */
  private play(clip: ClipName, o: PlayOpts): number {
    const ctx = this.ctx;
    const buf = this.buffers.get(clip);
    if (!ctx || !buf || !this.spotBus || this.voices >= MAX_VOICES) return 0;
    const d01 = clamp01(o.distance ?? 0);
    const gain = clamp01(o.gain * distanceGain(d01));
    if (gain < 0.004) return 0;
    const rate = o.rate ?? 1;
    const seg = o.segment ?? { start: 0, end: buf.duration };
    const len = Math.max(0.05, seg.end - seg.start);
    const dur = len / rate;
    const t0 = ctx.currentTime + (o.delay ?? 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.cutoff ?? distanceCutoff(d01);
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
    if (o.panEnd !== undefined) {
      pan.pan.setValueAtTime(pan.pan.value, t0);
      pan.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, o.panEnd)), t0 + dur);
    }
    src.connect(lp);
    lp.connect(g);
    g.connect(pan);
    pan.connect(this.spotBus);

    const fadeIn = Math.min(0.03, dur * 0.25);
    const fadeOut = Math.min(0.12, dur * 0.4);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + fadeIn);
    g.gain.setValueAtTime(gain, Math.max(t0 + fadeIn, t0 + dur - fadeOut));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.start(t0, seg.start, len);
    this.voices++;
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      src.disconnect();
      lp.disconnect();
      g.disconnect();
      pan.disconnect();
    };
    return dur;
  }

  /** A short run of separate calls (raven caws, bison grunts), each a little different. */
  private playCalls(clip: ClipName, count: number, o: PlayOpts): void {
    const total = this.dur(clip);
    const segs = this.segs.get(clip) ?? [];
    let delay = o.delay ?? 0;
    const first = Math.floor(Math.random() * Math.max(1, segs.length));
    for (let i = 0; i < count; i++) {
      // clips with clean gaps (ravens) play real consecutive calls; continuous ones (bison) play a random window
      const seg = segs.length >= 3 ? segs[(first + i) % segs.length] : randomWindow(total, 1.0, 1.8, Math.random(), Math.random() < 0.5 ? Math.random() * 0.25 : Math.random());
      const dur = this.play(clip, {
        ...o, segment: seg, delay, gain: (o.gain ?? 0.5) * rand(0.85, 1.15), rate: (o.rate ?? 1) * rand(0.97, 1.03), pan: (o.pan ?? 0) + rand(-0.1, 0.1),
      });
      if (dur <= 0) return;
      delay += dur + rand(0.1, 0.45);
    }
  }
}

const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function webkit(): typeof AudioContext | undefined {
  return (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}
