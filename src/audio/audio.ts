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
}

type ClipName = BedName | 'thunder' | 'wolfPack' | 'wolfSingle' | 'bison' | 'stampede' | 'raven';

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
};

/** Per-bed loudness trim. The files are levelled to the same RMS, so this is the artistic balance. */
const BED_TRIM: Record<BedName, number> = { wind: 0.72, birds: 0.42, crickets: 0.36, rain: 0.42, winter: 0.62, creek: 0.42 };
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
}

export class AudioDirector {
  /** Decoded clip info, filled by load(): name -> seconds, channels, sample rate, detected segments. */
  readonly decoded: Record<string, { seconds: number; channels: number; sampleRate: number; segments: number }> = {};
  /** Files that failed to load (the game runs on without them). */
  readonly missing: string[] = [];
  /** The last bed targets, for debug displays. */
  lastMix: BedMix = { wind: 0, birds: 0, crickets: 0, rain: 0, winter: 0, creek: 0 };

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedBus: GainNode | null = null;
  private spotBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
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
  private armed: Record<SpotKey, boolean> = { wolf: false, raven: false, bison: false, thunder: false };
  private timers: Record<SpotKey, number> = { wolf: 0, raven: 0, bison: 0, thunder: 0 };
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
    }
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
    if (!this._muted) this.updateSpots(dt, s);
  }

  /** A sim event happened `distance` metres from the camera. Plays the matching one-shot, if any. */
  onEvent(e: SimEvent, distance: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.bedsStarted || this._muted) return;
    const kind = e.kind === 'extinct' && e.sp === 1 ? 'wolfExtinct' : e.kind;
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
    for (const bus of [this.bedBus, this.spotBus]) {
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
    bedBus.connect(master);
    spotBus.connect(master);
    voiceBus.connect(master);
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
    this.timers = { wolf: rand(12, 40), raven: rand(6, 16), bison: rand(4, 10), thunder: rand(6, 20) };
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
    }
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
