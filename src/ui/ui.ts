// Tallgrass game UI: documentary broadcast graphics over the scene. Plain DOM + CSS, Canvas2D for charts.
// Usage: const ui = new GameUI(rootElement, actions); then ui.update(frame) every animation frame.
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/400-italic.css';
import '@fontsource/alegreya/500.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './ui.css';

import type { SimEvent } from '../sim/sim';
import { YEAR_TICKS } from '../sim/types';
import type { Challenge } from '../challenges';
import { ChapterCard, cardDuration } from './chapter';
import { ChallengeRun } from './challenge';
import { GoalCard } from './goal';
import { ResultCard } from './result';
import { Chronicle, type ChronicleEntry } from './chronicle';
import { cardRank, describeEvent, eventWeight, seasonName, seasonOfTick, yearOfTick } from './describe';
import { FeedFilter } from './feed';
import { button, h, unitPx } from './dom';
import { icon } from './icons';
import { Inspector } from './inspector';
import { TopRight } from './menu';
import { PopGraph, type Marker } from './popgraph';
import { Slate } from './slate';
import { TimeBar } from './timebar';
import { ToolRail } from './tools';
import type { ToolId, UIActions, UIFrame } from './types';

export { describeEvent } from './describe';
export type { EventText } from './describe';
export { SCENARIOS } from './types';
export type { OverlayId, ToolId, UIActions, UIFrame } from './types';

/** One chapter card per this many milliseconds of real time. */
const CARD_COOLDOWN_MS = 8000;
/** A high-ranking card held back by the cooldown is still worth showing for this long. */
const CARD_HOLD_MS = 20000;
/** Events the graph marks with a line (the rest would only add noise). */
const MARK_KINDS = new Set(['drought', 'droughtEnd', 'outbreak', 'stampede', 'extinct', 'introduced', 'removed', 'culled', 'fire', 'plague']);
/** A quiet hint about H and C appears once after this long with no input (a second monitor, a lazy afternoon). */
const HINT_IDLE_MS = 60000;
const HINT_KEY = 'tallgrass.hint.v1';
/** Packs that lasted fewer ticks than this are left out of the chronicle altogether. */
const FLASH_PACK_TICKS = 300;
/** Events older than this many ticks when they arrive (a backgrounded tab, a bulk fill) never earn a card. */
const STALE_TICKS = 240;
/** How long the "interface hidden" note stays up after entering ambient view. */
const AMBIENT_NOTE_MS = 4200;

interface QueuedCard {
  title: string;
  subtitle: string;
  rank: number;
  at: number;
  /** Sim tick of the event the card is about. */
  tick: number;
}

export class GameUI {
  private ui: HTMLElement;
  private slate = new Slate();
  private tools: ToolRail;
  private time: TimeBar;
  private pop = new PopGraph();
  private chron: Chronicle;
  private inspector: Inspector;
  private top: TopRight;
  private chapterCard = new ChapterCard();
  private goal: GoalCard;
  private result: ResultCard;
  private run: ChallengeRun | null = null;
  private resultShown = false;
  private goalRo: ResizeObserver;
  private hint: HTMLElement;
  private camChip: HTMLButtonElement;
  private ambientNote: HTMLElement;
  private ambientTimer = 0;
  private dodgeFrame = 0;
  private dodging = false;
  private onAnyDown: (e: PointerEvent) => void;
  private camOn = false;
  private hintDone = false;
  private lastInput = performance.now();
  private hintTimer = 0;
  private onInput: () => void;

  private seed = '';
  private scenario = '';
  private lastTick = -1;
  private selectedId: number | null = null;
  private followingId: number | null = null;
  private hidden = false;
  private cinematic = false;
  private lastCardAt = -1e9;
  /** Latest sim speed from the frame (0 paused, -1 skipping). */
  private speed = 1;
  private queued: QueuedCard | null = null;
  private feed = new FeedFilter();
  private keyDown: (e: KeyboardEvent) => void;
  private keyUp: (e: KeyboardEvent) => void;

  constructor(root: HTMLElement, private actions: UIActions) {
    this.tools = new ToolRail(actions);
    this.time = new TimeBar(actions);
    this.chron = new Chronicle((x, y) => actions.flyTo(x, y));
    this.inspector = new Inspector(actions);
    this.top = new TopRight(actions, () => this.setHidden(true));

    this.goal = new GoalCard(() => this.tryAgain());
    this.result = new ResultCard(
      () => this.tryAgain(),
      () => this.keepWatching(),
    );
    // the rail makes room under the goal card, whatever height the card is
    this.goalRo = new ResizeObserver(() => this.syncGoalHeight());
    this.goalRo.observe(this.goal.el);

    const right = h('div', { class: 'tg-right' }, this.top.el, this.chron.el, this.inspector.el);
    // a quiet chip beside the time controls while the documentary camera is driving; a click takes the camera back
    this.camChip = button(
      {
        class: 'tg-camchip tg-glass tg-leaf',
        title: 'The camera is following the action. Click, or just move it, to take over.',
        'aria-hidden': 'true',
        tabindex: '-1',
        onclick: () => this.actions.takeCamera?.(),
      },
      h('i', { class: 'tg-camdot', 'aria-hidden': 'true' }),
      h('span', { class: 'tg-cam-ic', html: icon('camera', 16) }),
      h('span', { class: 'tg-cam-name', text: 'Documentary camera' }),
      h('span', { class: 'tg-cam-act', text: 'Take over' }),
    );
    const bottom = h('div', { class: 'tg-bottom' }, h('div', { class: 'tg-camwrap' }, this.camChip), this.time.el, this.time.overlayEl);
    const chrome = h('div', { class: 'tg-chrome' }, this.slate.el, this.goal.el, this.tools.el, right, this.pop.el, bottom);
    const bars = h('div', { class: 'tg-bars', 'aria-hidden': 'true' });
    // shown briefly when the interface goes away, so nobody is left wondering how to get it back
    this.ambientNote = h('div', { class: 'tg-ambient-note', role: 'status', 'aria-live': 'polite', text: 'Interface hidden. Press any key or click to bring it back.' });
    this.hint = h(
      'div',
      { class: 'tg-hint tg-glass tg-leaf', role: 'status', 'aria-live': 'polite' },
      h('span', {}, h('kbd', { class: 'tg-kbd', text: 'H' }), 'ambient view, hides everything'),
      h('span', {}, h('kbd', { class: 'tg-kbd', text: 'C' }), 'documentary mode'),
    );
    try {
      this.hintDone = window.localStorage.getItem(HINT_KEY) === '1';
    } catch {
      /* storage unavailable: the hint just shows once per page load */
    }

    this.ui = h('div', { class: 'tg-ui', dataset: { cinematic: 'false' } }, chrome, this.hint, bars, this.chapterCard.el, this.result.el, this.ambientNote);
    root.append(this.ui);

    this.keyDown = (e) => this.onKeyDown(e);
    this.keyUp = (e) => {
      // A focused button would otherwise click on Space release after Space already paused the game.
      if (e.key === ' ' && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    this.onInput = () => {
      this.lastInput = performance.now();
      if (this.hint.classList.contains('is-on')) this.hideHint();
    };
    for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) window.addEventListener(ev, this.onInput, { passive: true });
    // ambient view: a click anywhere brings the interface back (the click still goes through to the scene)
    this.onAnyDown = (e) => {
      if (this.hidden && e.button === 0) this.setHidden(false);
    };
    window.addEventListener('pointerdown', this.onAnyDown, true);
  }

  // ---- public API --------------------------------------------------------------------------------------------

  /** Called up to 60 times a second. Cheap by construction: text diffs, throttled canvas redraws. */
  update(f: UIFrame): void {
    const now = performance.now();
    if (f.seed !== this.seed || f.scenario !== this.scenario || f.tick + 5 < this.lastTick) this.resetWorld(f);
    this.lastTick = f.tick;
    this.speed = f.speed;
    this.setCamChip(!!f.autoCamera);
    this.selectedId = f.selected ? f.selected.id : null;
    this.followingId = f.following;

    this.slate.update(f.env);
    this.time.update(f.speed, f.ticksPerSec, now);
    if (f.history.length) {
      this.pop.addHistory(f.history);
      this.inspector.setMeans(this.pop.latestTraits());
    }
    if (f.events.length) this.handleEvents(f.events, now, f.tick);
    this.pop.update(now, f.pop);
    this.inspector.update(f.selected, f.following, f.story, f.storyId);
    this.top.setWorld(f.seed, f.scenario);
    this.flushQueuedCard(now);
    if ((this.dodgeFrame++ & 3) === 0) this.dodgeLabels();
    if (this.run) this.stepChallenge(f);
    if (!this.hintDone && now - this.lastInput > HINT_IDLE_MS && !this.hidden && !this.cinematic && !this.result.isOpen) this.showHint();
  }

  /** The quiet hint about H and C. Shown once ever (per browser) after a minute of no input; also callable directly. */
  showHint(): void {
    this.hintDone = true;
    try {
      window.localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
    this.hint.classList.add('is-on');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hideHint(), 11000);
  }

  private hideHint(): void {
    window.clearTimeout(this.hintTimer);
    this.hint.classList.remove('is-on');
  }

  // ---- challenges --------------------------------------------------------------------------------------------

  /** Start (or clear, with null) a challenge attempt. Call once after construction. */
  setChallenge(c: Challenge | null): void {
    this.run = c ? new ChallengeRun(c) : null;
    this.resultShown = false;
    this.result.hide();
    this.goal.setRun(this.run);
    this.top.setChallenge(c ? c.id : null);
    this.ui.classList.toggle('has-challenge', !!c);
    this.syncToolLock();
    this.syncGoalHeight();
  }

  /**
   * Main asks this before it sends any tool to the sim. Counts the tool against the challenge budget and returns
   * false when the budget is spent, in which case the tool must be ignored.
   */
  tryUseTool(): boolean {
    if (!this.run) return true;
    const ok = this.run.tryUse();
    this.goal.update(this.run);
    this.syncToolLock();
    return ok;
  }

  private stepChallenge(f: UIFrame): void {
    const run = this.run;
    if (!run) return;
    const ended = run.evaluate(f.tick / YEAR_TICKS, f.pop, f.packs ?? 0);
    this.goal.update(run);
    if (ended && !this.resultShown) this.showResult(run);
  }

  private showResult(run: ChallengeRun): void {
    const res = run.result;
    if (!res) return;
    this.resultShown = true;
    const won = res.state === 'won';
    const years = Math.max(0, Math.floor(run.endedYear));
    const yearsText = years < 1 ? 'under a year' : `${years} ${years === 1 ? 'year' : 'years'}`;
    const max = run.challenge.maxTools;
    const n = run.toolsUsed;
    const used = max === null ? `${n} ${n === 1 ? 'intervention' : 'interventions'} used` : `${n} of ${max} interventions used`;
    this.chapterCard.clear();
    this.result.show({
      won,
      title: won ? 'Challenge complete' : 'The valley slipped away',
      reason: res.reason ?? res.progress,
      stat: `${run.challenge.name}: ${yearsText}, ${used}.`,
    });
    // stop the clock behind the card so nothing changes while the player reads it
    this.time.setSpeed(0);
  }

  private keepWatching(): void {
    this.result.hide();
    this.time.resume();
  }

  private tryAgain(): void {
    if (this.run) this.actions.startChallenge(this.run.challenge.id);
  }

  private syncToolLock(): void {
    this.tools.setDisabled(!!this.run && this.run.exhausted, 'No interventions left');
  }

  private syncGoalHeight(): void {
    const el = this.goal.el;
    const px = this.run && !el.hidden ? el.offsetHeight + 10 * unitPx(this.ui) : 0;
    this.ui.style.setProperty('--goal-h', `${px}px`);
  }

  private setCamChip(on: boolean): void {
    if (on === this.camOn) return;
    this.camOn = on;
    this.camChip.classList.toggle('is-on', on);
    this.camChip.setAttribute('aria-hidden', String(!on));
    this.camChip.tabIndex = on ? 0 : -1;
  }

  /** Show a chapter card right now (ignores the rate limit). */
  chapter(title: string, subtitle?: string): void {
    this.lastCardAt = performance.now();
    this.queued = null;
    // one card at a time (show() replaces whatever is up), and shorter while years fly by
    this.chapterCard.show(title, subtitle, cardDuration(this.speed < 0 ? 100 : this.speed));
  }

  /** Reflect the armed tool in the rail (main calls this when it arms or disarms by itself). */
  setArmedTool(tool: ToolId | null): void {
    this.tools.setArmed(tool);
  }

  /** H key: hide every panel and card for a clean frame. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.ui.classList.toggle('is-hidden', hidden);
    window.clearTimeout(this.ambientTimer);
    this.ambientNote.classList.toggle('is-on', hidden);
    if (hidden) {
      this.top.close();
      this.time.closeMenu();
      this.chapterCard.clear();
      this.ambientTimer = window.setTimeout(() => this.ambientNote.classList.remove('is-on'), AMBIENT_NOTE_MS);
    }
  }

  setCinematic(on: boolean): void {
    if (on === this.cinematic) return;
    this.cinematic = on;
    this.ui.classList.toggle('is-cinematic', on);
    this.ui.dataset.cinematic = String(on);
    if (on) {
      this.top.close();
      this.time.closeMenu();
    }
    this.actions.setCinematic(on);
  }

  get isHidden(): boolean {
    return this.hidden;
  }

  get isCinematic(): boolean {
    return this.cinematic;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('pointerdown', this.onAnyDown, true);
    window.clearTimeout(this.ambientTimer);
    for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) window.removeEventListener(ev, this.onInput);
    window.clearTimeout(this.hintTimer);
    this.goalRo.disconnect();
    this.chron.destroy();
    this.time.destroy();
    this.top.destroy();
    this.pop.destroy();
    this.ui.remove();
  }

  // ---- internals ---------------------------------------------------------------------------------------------

  private resetWorld(f: UIFrame): void {
    this.seed = f.seed;
    this.scenario = f.scenario;
    this.pop.reset();
    this.inspector.setMeans(null);
    this.chron.clear();
    this.chapterCard.clear();
    this.queued = null;
    this.feed.reset();
    this.lastCardAt = performance.now() - CARD_COOLDOWN_MS + 2500; // let the world settle before the first card
  }

  private handleEvents(events: SimEvent[], now: number, tick: number): void {
    const entries: ChronicleEntry[] = [];
    const markers: Marker[] = [];
    let best: { title: string; subtitle: string; rank: number; tick: number } | null = null;

    // A pack that is founded and lost within a blink is a dispersal that never took: it is not news.
    const flash = new Set<number>();
    for (const e of events) if (e.kind === 'packLost' && e.b < FLASH_PACK_TICKS) flash.add(e.a);

    for (const e of events) {
      if ((e.kind === 'packLost' || e.kind === 'packFounded') && flash.has(e.a)) continue;
      // the sim reports more stampedes and elders than anyone wants to read: thin them out
      if (!this.feed.accept(e)) continue;
      const d = describeEvent(e);
      const major = !!d.card;
      entries.push({ tick: e.tick, year: yearOfTick(e.tick), sentence: d.sentence, x: e.x, y: e.y, sp: e.sp, major, weight: eventWeight(e) });
      if (MARK_KINDS.has(e.kind)) markers.push({ tick: e.tick, sentence: d.sentence, major });
      if (d.card && tick - e.tick <= STALE_TICKS) {
        const rank = cardRank(e.kind);
        if (!best || rank > best.rank) best = { title: d.card.title, subtitle: d.card.subtitle, rank, tick: e.tick };
      }
    }

    this.chron.add(entries, entries.length <= 4);
    this.pop.addMarkers(markers);

    if (best && best.rank >= this.cardMinRank()) {
      if (now - this.lastCardAt >= CARD_COOLDOWN_MS) {
        this.showCard(best);
      } else if (best.rank >= 4 && (!this.queued || best.rank > this.queued.rank)) {
        // an important card held back by the rate limit waits for its turn
        this.queued = { ...best, at: now };
      }
    }
  }

  /** The smallest card rank worth showing at this speed: minor events are skipped while years fly by. */
  private cardMinRank(): number {
    const s = this.speed < 0 ? 100 : this.speed;
    if (s >= 100) return 4; // only extinctions, reintroductions and droughts at 100x
    if (s >= 10) return 2; // a new pack on its own is not worth interrupting a fast run
    return 0;
  }

  /**
   * A card must never contradict the header. If the valley has moved on from the season the card names, a minor card
   * is dropped, and an important one keeps only its year (which cannot be wrong).
   */
  private showCard(c: { title: string; subtitle: string; rank: number; tick: number }): void {
    const cur = this.lastTick;
    const sameSeason = yearOfTick(c.tick) === yearOfTick(cur) && seasonName(seasonOfTick(c.tick)) === seasonName(seasonOfTick(cur));
    let subtitle: string | undefined = c.subtitle;
    if (!sameSeason) {
      this.queued = null;
      if (c.rank < 4) return;
      subtitle = this.degrade(subtitle, c.tick, 10); // keep only the year
    }
    this.chapter(c.title, this.degrade(subtitle, c.tick, this.speed < 0 ? 100 : this.speed));
  }

  /**
   * While time runs fast the header outruns the card (a year goes by in under 3 s at 100x), so the card names less:
   * the year only from 10x, nothing but the title from 100x. A subtitle that is not a date (a pack name) is left alone.
   */
  private degrade(subtitle: string | undefined, tick: number, speed: number): string | undefined {
    if (!subtitle || !/^Year \d+, /.test(subtitle)) return subtitle;
    if (speed >= 100) return undefined;
    if (speed >= 10) return `Year ${yearOfTick(tick)}`;
    return subtitle;
  }

  /** Hide any pack label that sits under the chapter card, so the two never fight over the same pixels. */
  private dodgeLabels(): void {
    const b = this.chapterCard.bounds();
    if (!b) {
      if (this.dodging) {
        this.dodging = false;
        for (const el of this.ui.querySelectorAll('.tg-map-label.is-under-card')) el.classList.remove('is-under-card');
      }
      return;
    }
    this.dodging = true;
    for (const el of this.ui.querySelectorAll<HTMLElement>('.tg-map-label')) {
      const r = el.getBoundingClientRect();
      const hit = r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
      el.classList.toggle('is-under-card', hit);
    }
  }

  private flushQueuedCard(now: number): void {
    const q = this.queued;
    if (!q) return;
    if (now - q.at > CARD_HOLD_MS) {
      this.queued = null;
    } else if (now - this.lastCardAt >= CARD_COOLDOWN_MS) {
      this.showCard(q);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // ambient view: any key brings the interface back and is spent doing so (Space must not also pause).
    // Modifier keys, function keys and P (a photo of the clean view) leave it as it is.
    if (this.hidden && !isTyping(e.target) && !MODIFIER_KEYS.has(e.key) && !/^F\d+$/.test(e.key) && e.key !== 'p' && e.key !== 'P') {
      e.preventDefault();
      if (!e.repeat) this.setHidden(false);
      return;
    }
    if (isTyping(e.target)) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    switch (k) {
      case ' ':
        e.preventDefault();
        if (!e.repeat) this.time.togglePause();
        break;
      case '1':
        this.time.setSpeed(1);
        break;
      case '2':
        this.time.setSpeed(10);
        break;
      case '3':
        this.time.setSpeed(100);
        break;
      case 'n':
        if (!e.repeat) this.time.skip();
        break;
      case 'h':
        if (!e.repeat) this.setHidden(!this.hidden);
        break;
      case 'c':
        if (!e.repeat) this.setCinematic(!this.cinematic);
        break;
      case 'g':
        if (!e.repeat) this.pop.toggleExpanded();
        break;
      case 'l':
        if (!e.repeat) this.pop.toggleLog();
        break;
      case 'e':
        if (!e.repeat) this.pop.toggleEvolution();
        break;
      case 'f':
        if (!e.repeat && this.selectedId !== null) this.actions.follow(this.followingId === this.selectedId ? null : this.selectedId);
        break;
      case 'Escape':
        this.onEscape();
        break;
      default:
        return;
    }
  }

  /** Esc backs out one layer at a time: popovers, then the armed tool, then the selection, then cinematic mode. */
  private onEscape(): void {
    if (this.result.isOpen) {
      this.keepWatching();
    } else if (this.top.isOpen) {
      this.top.close();
    } else if (this.time.isMenuOpen) {
      this.time.closeMenu();
    } else if (this.tools.armedTool) {
      this.tools.setArmed(null);
      this.actions.armTool(null);
    } else if (this.inspector.isMemorial) {
      this.inspector.close();
    } else if (this.selectedId !== null) {
      this.actions.select(null);
    } else if (this.cinematic) {
      this.setCinematic(false);
    } else if (this.hidden) {
      this.setHidden(false);
    } else if (this.pop.isExpanded) {
      this.pop.toggleExpanded();
    }
  }
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'Dead', 'Unidentified']);

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}
