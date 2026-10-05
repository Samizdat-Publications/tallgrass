// The documentary narrator: turns sim events into a short spoken line, but only when it would feel like a nature
// documentary and not a nag. All policy numbers and the event-to-line map live in narration.ts (pure, unit tested);
// this class holds the state (what is waiting, when the last line started) and drives the AudioDirector.
//
// Wiring (src/main.ts): const narrator = new Narrator(audio); narrator.load();
//   every frame:   narrator.update({ filming: autoCam || cinematicOn, speed });
//   sim events:    narrator.onEvents(events)
//   the toggle:    narrator.enabled = true / false (remembered in localStorage)
import type { SimEvent } from '../sim/sim';
import { FeedFilter } from '../ui/feed';
import type { AudioDirector } from './audio';
import {
  DUCK_AMOUNT, DUCK_RAMP_S, KIND_COOLDOWN_YEARS, NARRATION_IDS, NARRATION_TEXT, OPENING_DELAY_MS, TOWN_BACK_YEARS, gapElapsed, gateOpen, isStale,
  lineVariants, pickVariant, priority,
} from './narration';
import { YEAR_TICKS } from '../sim/types';

const STORAGE_KEY = 'tallgrass.narrator.v1';
/** An opening line that could not start within this long of its due time is not worth saying any more. */
const OPENING_EXPIRES_MS = 30000;
/** Packs that lasted less than this many ticks are dispersals that never took; the chronicle skips them and so do we. */
const FLASH_PACK_TICKS = 300;
/** An event this many sim ticks behind the present is history, not news (matches the chapter cards). */
const STALE_TICKS = 240;

export interface NarratorFrame {
  /** The documentary camera or cinematic mode is filming right now. */
  filming: boolean;
  /** Sim speed (-1 while skipping). */
  speed: number;
}

interface Candidate {
  kind: string;
  variants: string[];
  at: number;
  pri: number;
}

export interface NarratorDebug {
  enabled: boolean;
  playing: boolean;
  pending: string | null;
  openingDone: boolean;
  lastStartAgoMs: number | null;
  caption: string | null;
}

export class Narrator {
  private on = true;
  private lastStart = -Infinity;
  private pending: Candidate | null = null;
  private playing = false;
  private current: { id: string; text: string } | null = null;
  private feed = new FeedFilter();
  private lastVariant = new Map<string, string>();
  private openingDone = false;
  private openingAt = -1;
  private wasFilming = false;
  /** The sim tick of the last prairie dog plague seen, and of the last line queued for each kind and species (for KIND_COOLDOWN_YEARS). */
  private plagueTick: number | null = null;
  private lastQueued = new Map<string, number>();

  constructor(
    private audio: AudioDirector,
    private now: () => number = () => performance.now(),
    private rnd: () => number = Math.random,
  ) {
    try {
      this.on = window.localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
      /* storage unavailable: the narrator is simply on for this page load */
    }
  }

  /** Start fetching the lines in the background. Safe to call before any click. */
  load(): Promise<void> {
    return this.audio.loadVoices(NARRATION_IDS);
  }

  get enabled(): boolean {
    return this.on;
  }

  set enabled(v: boolean) {
    if (v === this.on) return;
    this.on = v;
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    } catch {
      /* the choice just does not outlast this page */
    }
    if (!v) {
      this.pending = null;
      this.audio.stopVoice();
    }
  }

  /** The line being spoken right now, for the cinematic caption. Null when silent. */
  get caption(): string | null {
    return this.playing && this.current ? this.current.text : null;
  }

  debug(): NarratorDebug {
    return {
      enabled: this.on,
      playing: this.playing,
      pending: this.pending ? this.pending.kind : null,
      openingDone: this.openingDone,
      lastStartAgoMs: Number.isFinite(this.lastStart) ? Math.round(this.now() - this.lastStart) : null,
      caption: this.caption,
    };
  }

  /**
   * Sim events from one frame. Candidates wait for the gate for a few seconds at most, then are forgotten. With
   * `currentTick`, events from far behind it (a stretch that was skipped over) are not narrated as though they were news.
   */
  onEvents(events: SimEvent[], currentTick?: number): void {
    if (!this.on || !events.length) return;
    const t = this.now();
    // a pack founded and lost within a blink is not news (the chronicle skips it too)
    const flash = new Set<number>();
    for (const e of events) if (e.kind === 'packLost' && e.b < FLASH_PACK_TICKS) flash.add(e.a);
    for (const e of events) {
      if ((e.kind === 'packLost' || e.kind === 'packFounded') && flash.has(e.a)) continue;
      if (currentTick !== undefined && currentTick - e.tick > STALE_TICKS) continue;
      if (e.kind === 'sylvaticPlague') this.plagueTick = e.tick;
      const sincePlague = this.plagueTick !== null && e.tick - this.plagueTick < TOWN_BACK_YEARS * YEAR_TICKS ? e.tick - this.plagueTick : undefined;
      const variants = lineVariants(e, { sincePlague });
      if (!variants) continue;
      if (!this.feed.accept(e)) continue; // the same thinning as the chronicle: no stampede after stampede
      const rest = KIND_COOLDOWN_YEARS[e.kind];
      const ckey = `${e.kind}:${e.sp}`;
      const prev = this.lastQueued.get(ckey);
      if (rest !== undefined && prev !== undefined && e.tick >= prev && e.tick - prev < rest * YEAR_TICKS) continue;
      this.lastQueued.set(ckey, e.tick);
      const cand: Candidate = { kind: e.kind, variants, at: t, pri: priority(e.kind) };
      const p = this.pending;
      if (!p || isStale(t, p.at) || cand.pri >= p.pri) this.pending = cand;
    }
  }

  /** Once per frame. Starts a line when everything allows it. */
  update(frame: NarratorFrame): void {
    const t = this.now();
    // the opening line: a few seconds after the documentary camera first takes the wheel (or cinematic mode starts)
    if (frame.filming && !this.wasFilming && !this.openingDone && this.openingAt < 0) this.openingAt = t + OPENING_DELAY_MS;
    if (!frame.filming && this.openingAt >= 0 && !this.openingDone) this.openingAt = -1; // the player took the camera back
    this.wasFilming = frame.filming;

    if (this.pending && isStale(t, this.pending.at)) this.pending = null;
    if (this.playing && this.audio.muted) this.audio.stopVoice();
    if (this.openingAt >= 0 && !this.openingDone && t - this.openingAt > OPENING_EXPIRES_MS) this.openingDone = true;

    const open = gateOpen({
      enabled: this.on,
      filming: frame.filming,
      speed: frame.speed,
      audioReady: this.audio.voiceReady,
      muted: this.audio.muted,
      playing: this.playing,
    });
    if (!open || !gapElapsed(t, this.lastStart)) return;
    if (this.pending) {
      const c = this.pending;
      this.pending = null;
      this.start(c.kind, c.variants);
    } else if (!this.openingDone && this.openingAt >= 0 && t >= this.openingAt) {
      this.start('opening', ['opening_1']);
    }
  }

  /**
   * Speak a line by id right now, bypassing every rule except "the audio is unlocked and nothing else is speaking".
   * For the dev hook and tests only.
   */
  speakNow(id: string): Promise<boolean> {
    return this.begin(id, 'debug', false);
  }

  private start(kind: string, variants: string[]): void {
    // prefer a variant that has actually loaded; a missing file just means "no line"
    const have = variants.filter((v) => this.audio.hasVoice(v));
    if (!have.length) return;
    const id = pickVariant(have, this.lastVariant.get(kind), this.rnd());
    void this.begin(id, kind, true);
  }

  /** `counts` is false for the dev hook, which must not use up the 40 s allowance or the opening. */
  private begin(id: string, kind: string, counts: boolean): Promise<boolean> {
    const text = NARRATION_TEXT[id];
    if (!text || !this.audio.hasVoice(id) || this.playing) return Promise.resolve(false);
    const done = this.audio.speak(id, DUCK_AMOUNT, DUCK_RAMP_S);
    if (!this.audio.voiceNow) return done; // could not start (not unlocked): nothing spent
    this.playing = true;
    this.current = { id, text };
    if (counts) {
      this.lastStart = this.now();
      this.openingDone = true; // any line spoken means the opening is no longer owed
      this.lastVariant.set(kind, id);
    }
    return done.then((v) => {
      this.playing = false;
      this.current = null;
      return v;
    });
  }
}
