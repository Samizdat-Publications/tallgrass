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
import { ChapterCard } from './chapter';
import { Chronicle, type ChronicleEntry } from './chronicle';
import { cardRank, describeEvent, yearOfTick } from './describe';
import { h } from './dom';
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
/** Packs that lasted fewer ticks than this are left out of the chronicle altogether. */
const FLASH_PACK_TICKS = 300;
/** Events older than this many ticks when they arrive (a backgrounded tab, a bulk fill) never earn a card. */
const STALE_TICKS = 600;

interface QueuedCard {
  title: string;
  subtitle: string;
  rank: number;
  at: number;
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

  private seed = '';
  private scenario = '';
  private lastTick = -1;
  private selectedId: number | null = null;
  private followingId: number | null = null;
  private hidden = false;
  private cinematic = false;
  private lastCardAt = -1e9;
  private queued: QueuedCard | null = null;
  private lastElder = new Map<number, number>();
  private keyDown: (e: KeyboardEvent) => void;
  private keyUp: (e: KeyboardEvent) => void;

  constructor(root: HTMLElement, private actions: UIActions) {
    this.tools = new ToolRail(actions);
    this.time = new TimeBar(actions);
    this.chron = new Chronicle((x, y) => actions.flyTo(x, y));
    this.inspector = new Inspector(actions);
    this.top = new TopRight(actions);

    const right = h('div', { class: 'tg-right' }, this.top.el, this.chron.el, this.inspector.el);
    const bottom = h('div', { class: 'tg-bottom' }, h('span'), this.time.el, this.time.overlayEl);
    const chrome = h('div', { class: 'tg-chrome' }, this.slate.el, this.tools.el, right, this.pop.el, bottom);
    const bars = h('div', { class: 'tg-bars', 'aria-hidden': 'true' });

    this.ui = h('div', { class: 'tg-ui', dataset: { cinematic: 'false' } }, chrome, bars, this.chapterCard.el);
    root.append(this.ui);

    this.keyDown = (e) => this.onKeyDown(e);
    this.keyUp = (e) => {
      // A focused button would otherwise click on Space release after Space already paused the game.
      if (e.key === ' ' && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
  }

  // ---- public API --------------------------------------------------------------------------------------------

  /** Called up to 60 times a second. Cheap by construction: text diffs, throttled canvas redraws. */
  update(f: UIFrame): void {
    const now = performance.now();
    if (f.seed !== this.seed || f.scenario !== this.scenario || f.tick + 5 < this.lastTick) this.resetWorld(f);
    this.lastTick = f.tick;
    this.selectedId = f.selected ? f.selected.id : null;
    this.followingId = f.following;

    this.slate.update(f.env);
    this.time.update(f.speed, f.ticksPerSec, now);
    if (f.history.length) this.pop.addHistory(f.history);
    if (f.events.length) this.handleEvents(f.events, now, f.tick);
    this.pop.update(now, f.pop);
    this.inspector.update(f.selected, f.following);
    this.top.setWorld(f.seed, f.scenario);
    this.flushQueuedCard(now);
  }

  /** Show a chapter card right now (ignores the rate limit). */
  chapter(title: string, subtitle?: string): void {
    this.lastCardAt = performance.now();
    this.queued = null;
    this.chapterCard.show(title, subtitle);
  }

  /** Reflect the armed tool in the rail (main calls this when it arms or disarms by itself). */
  setArmedTool(tool: ToolId | null): void {
    this.tools.setArmed(tool);
  }

  /** H key: hide every panel and card for a clean frame. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.ui.classList.toggle('is-hidden', hidden);
    if (hidden) {
      this.top.close();
      this.time.closeMenu();
      this.chapterCard.clear();
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
    this.chron.clear();
    this.chapterCard.clear();
    this.queued = null;
    this.lastElder.clear();
    this.lastCardAt = performance.now() - CARD_COOLDOWN_MS + 2500; // let the world settle before the first card
  }

  private handleEvents(events: SimEvent[], now: number, tick: number): void {
    const entries: ChronicleEntry[] = [];
    const markers: Marker[] = [];
    let best: { title: string; subtitle: string; rank: number } | null = null;

    // A pack that is founded and lost within a blink is a dispersal that never took: it is not news.
    const flash = new Set<number>();
    for (const e of events) if (e.kind === 'packLost' && e.b < FLASH_PACK_TICKS) flash.add(e.a);

    for (const e of events) {
      if ((e.kind === 'packLost' || e.kind === 'packFounded') && flash.has(e.a)) continue;
      // "elder" fires a lot: one per species per year is plenty for a chronicle
      if (e.kind === 'elder') {
        const y = yearOfTick(e.tick);
        if (this.lastElder.get(e.sp) === y) continue;
        this.lastElder.set(e.sp, y);
      }
      const d = describeEvent(e);
      const major = !!d.card;
      entries.push({ tick: e.tick, year: yearOfTick(e.tick), sentence: d.sentence, x: e.x, y: e.y, sp: e.sp, major });
      if (MARK_KINDS.has(e.kind)) markers.push({ tick: e.tick, sentence: d.sentence, major });
      if (d.card && tick - e.tick <= STALE_TICKS) {
        const rank = cardRank(e.kind);
        if (!best || rank > best.rank) best = { title: d.card.title, subtitle: d.card.subtitle, rank };
      }
    }

    this.chron.add(entries, entries.length <= 4);
    this.pop.addMarkers(markers);

    if (best) {
      if (now - this.lastCardAt >= CARD_COOLDOWN_MS) {
        this.chapter(best.title, best.subtitle);
      } else if (best.rank >= 4 && (!this.queued || best.rank > this.queued.rank)) {
        // an important card held back by the rate limit waits for its turn
        this.queued = { ...best, at: now };
      }
    }
  }

  private flushQueuedCard(now: number): void {
    const q = this.queued;
    if (!q) return;
    if (now - q.at > CARD_HOLD_MS) {
      this.queued = null;
    } else if (now - this.lastCardAt >= CARD_COOLDOWN_MS) {
      this.chapter(q.title, q.subtitle);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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
    if (this.top.isOpen) {
      this.top.close();
    } else if (this.time.isMenuOpen) {
      this.time.closeMenu();
    } else if (this.tools.armedTool) {
      this.tools.setArmed(null);
      this.actions.armTool(null);
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

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}
