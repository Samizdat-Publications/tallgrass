// Field notes: a naturalist's notebook of eighteen moments the player has witnessed. Each is ticked the first time it
// happens in any session and remembered across visits (localStorage, always inside try/catch: the game works without
// storage). This file holds the notebook (what is earned, when, saved), the detectors that watch sim events and frame
// data, and the plain-text copy. The panel and the toast are drawn by panel code in ui.ts.
import { Weather, YEAR_TICKS } from '../sim/types';
import type { EnvState } from '../sim/types';
import type { SimEvent } from '../sim/sim';
import type { AnimalDetail } from '../sim/worker';

export interface NoteDef {
  id: string;
  /** The title shown once earned, and in the toast. */
  title: string;
  /** What to do, shown dimmed while it is not earned yet. */
  hint: string;
}

export const NOTES: NoteDef[] = [
  { id: 'firstKill', title: 'The first kill', hint: 'Wait for the first wolf to bring down its prey.' },
  { id: 'stampede100', title: 'A stampede of a hundred bison', hint: 'A herd of a hundred or more breaks into a run.' },
  { id: 'packFounded', title: 'A new pack takes a range', hint: 'A pair of wolves strikes out and founds a pack.' },
  { id: 'packLost', title: 'A pack falls apart', hint: 'A pack that held a range breaks up.' },
  { id: 'drought', title: 'A drought settles in', hint: 'The rains fail. Wait for it, or call one.' },
  { id: 'droughtBreaks', title: 'A dry spell breaks', hint: 'Watch a drought run its course.' }, // (not "The drought breaks": a season's dry spell can end inside a megadrought, round 40)
  { id: 'outbreak', title: 'Sickness in the herd', hint: 'Disease takes hold where the animals crowd.' },
  { id: 'fire', title: 'Fire on the prairie', hint: 'Lightning, or a fire of your own.' },
  { id: 'greenUp', title: 'The burn greens up', hint: 'Watch a burned patch regrow, a year after a fire.' },
  { id: 'elder', title: 'An elder of the valley', hint: 'Meet one of the oldest animals in the valley.' },
  { id: 'followHunt', title: 'Ride along on a hunt', hint: 'Follow a wolf while it chases prey.' },
  { id: 'lifeStory', title: 'A whole life', hint: 'Read an animal\'s story all the way to its In memoriam card.' },
  { id: 'wolvesReturn', title: 'Bring the wolves back', hint: 'Use Bring in wolves in a valley without them.' },
  { id: 'century', title: 'A hundred years in the valley', hint: 'Let one valley run to its hundredth year.' },
  { id: 'winter', title: 'Snow on the prairie', hint: 'Watch it snow, at 1x or 10x.' },
  { id: 'documentary', title: 'The documentary camera films a kill', hint: 'Let the documentary camera, or cinematic mode, catch a kill.' },
  { id: 'extinctionAverted', title: 'Pulled back from the brink', hint: 'A species falls below twenty and recovers above a hundred.' },
  { id: 'challenge', title: 'Win a challenge', hint: 'Finish any challenge from the menu.' },
];
export const NOTE_COUNT = NOTES.length;

/** Where a note's moment happened (sim metres), when it has a place: the documentary camera's toast for it waits until the camera is there. */
export interface NotePlace {
  x: number;
  y: number;
}

export interface Earned {
  /** The valley year it was earned in (the number the slate showed). */
  year: number;
  /** When, in real time (epoch ms), for the record. */
  at: number;
}

const STORAGE_KEY = 'tallgrass.fieldnotes.v1';

/** The notebook: which notes are earned, saved as you go. */
export class FieldNotes {
  private earned = new Map<string, Earned>();
  /** The valley year now, kept up to date by the game, for notes ticked from the console. */
  yearNow = 1;
  /** Called each time a note is earned for the first time. */
  onEarn: (def: NoteDef, e: Earned, at?: NotePlace) => void = () => {};
  /** Called whenever the count changes (earned or cleared), for the menu entry. */
  onChange: () => void = () => {};

  constructor() {
    this.load();
  }

  get count(): number {
    return this.earned.size;
  }

  has(id: string): boolean {
    return this.earned.has(id);
  }

  get(id: string): Earned | undefined {
    return this.earned.get(id);
  }

  /** Tick a note. Returns true when it is new. Unknown ids are ignored. `at` is where it happened, if it has a place (the toast waits for the camera). */
  earn(id: string, year: number, at?: NotePlace): boolean {
    const def = NOTES.find((n) => n.id === id);
    if (!def || this.earned.has(id)) return false;
    const e: Earned = { year: Math.max(1, Math.round(year)), at: Date.now() };
    this.earned.set(id, e);
    this.save();
    this.onChange();
    this.onEarn(def, e, at);
    return true;
  }

  /** Dev hook: tick a note as if it had just happened (window.__fieldnotes.debugEarn('fire')). */
  debugEarn(id: string): boolean {
    return this.earn(id, this.yearNow);
  }

  clear(): void {
    this.earned.clear();
    this.save();
    this.onChange();
  }

  private load(): void {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { notes?: Record<string, Earned> };
      for (const n of NOTES) {
        const e = data.notes?.[n.id];
        if (e && Number.isFinite(e.year)) this.earned.set(n.id, { year: e.year, at: Number(e.at) || 0 });
      }
    } catch {
      /* no storage, or a damaged value: start with an empty notebook */
    }
  }

  private save(): void {
    try {
      const notes: Record<string, Earned> = {};
      for (const [k, v] of this.earned) notes[k] = v;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, notes }));
    } catch {
      /* the notes just do not outlast this page */
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// detectors
// ---------------------------------------------------------------------------------------------------------------

/** What the tracker needs to know each frame that the sim frame itself does not carry. */
export interface TrackerContext {
  /** The inspector is showing an In memoriam card. */
  memorial: boolean;
  /** A challenge has been won. */
  challengeWon: boolean;
}

export interface TrackerFrame {
  tick: number;
  env: EnvState;
  pop: number[];
  events: SimEvent[];
  selected: AnimalDetail | null;
  following: number | null;
  speed: number;
}

/** A species is "pulled back from the brink" when it falls below this and then climbs above RECOVER. */
const BRINK = 20;
const RECOVER = 100;
/** It must have been this common first, so a species that simply started small does not count. */
const ESTABLISHED = 30;
/** Packs that lasted fewer ticks than this are dispersals that never took, not a pack falling apart. */
const FLASH_PACK_TICKS = 300;

const ST_CHASE = 5;
const SP_WOLF = 1;

/** Watches the stream of frames and events and ticks notes. State is per world: call reset() on a new one. */
export class NoteTracker {
  private fireTick: number | null = null;
  private peak: number[] = [];
  private fell: boolean[] = [];

  constructor(private notes: FieldNotes) {}

  reset(): void {
    this.fireTick = null;
    this.peak = [];
    this.fell = [];
  }

  update(f: TrackerFrame, ctx: TrackerContext): void {
    const n = this.notes;
    const year = f.env.year + 1; // the number the slate shows
    const earn = (id: string, at?: NotePlace): void => void n.earn(id, year, at);
    const where = (e: SimEvent): NotePlace => ({ x: e.x, y: e.y });

    // a pack founded and lost within a blink is a dispersal that never took (the chronicle skips it too)
    const flash = new Set<number>();
    for (const e of f.events) if (e.kind === 'packLost' && e.b < FLASH_PACK_TICKS) flash.add(e.a);
    for (const e of f.events) {
      switch (e.kind) {
        case 'firstKill': earn('firstKill', where(e)); break;
        case 'stampede': if (e.a >= 100) earn('stampede100', where(e)); break;
        case 'packFounded': if (!flash.has(e.a)) earn('packFounded', where(e)); break;
        case 'packLost': if (!flash.has(e.a)) earn('packLost', where(e)); break;
        case 'drought': earn('drought'); break;
        case 'droughtEnd': earn('droughtBreaks'); break;
        case 'outbreak': earn('outbreak', where(e)); break;
        case 'fire':
          earn('fire', where(e));
          if (this.fireTick === null) this.fireTick = e.tick;
          break;
        case 'elder': earn('elder', where(e)); break;
        case 'introduced': if (e.sp === SP_WOLF) earn('wolvesReturn'); break;
        default: break;
      }
    }

    // the burn greens up a valley year after the fire (read at use time: the calendar can be scaled)
    if (this.fireTick !== null && f.tick - this.fireTick >= YEAR_TICKS) {
      earn('greenUp');
      this.fireTick = null;
    }

    // riding along on a hunt: following a wolf while it is chasing prey
    const s = f.selected;
    if (s && s.sp === SP_WOLF && s.state === ST_CHASE && f.following === s.id) earn('followHunt');

    if (ctx.memorial) earn('lifeStory');
    if (f.env.year + 1 >= 100) earn('century');
    if (f.env.weather === Weather.Snow && (f.speed === 1 || f.speed === 10)) earn('winter');
    if (ctx.challengeWon) earn('challenge');

    // pulled back from the brink: established, then below twenty, then above a hundred
    for (let sp = 0; sp < f.pop.length; sp++) {
      const v = f.pop[sp] ?? 0;
      if ((this.peak[sp] ?? 0) < v) this.peak[sp] = v;
      if ((this.peak[sp] ?? 0) >= ESTABLISHED && v < BRINK) this.fell[sp] = true;
      if (this.fell[sp] && v > RECOVER) {
        earn('extinctionAverted');
        this.fell[sp] = false;
      }
    }
  }
}
