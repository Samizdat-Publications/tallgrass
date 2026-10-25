// Tallgrass game UI: documentary broadcast graphics over the scene. Plain DOM + CSS, Canvas2D for charts.
// Usage: const ui = new GameUI(rootElement, actions); then ui.update(frame) every animation frame.
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/400-italic.css';
import '@fontsource/alegreya/500.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './ui.css';
import './familytree.css';

import type { SimEvent } from '../sim/sim';
import type { HistoryRow } from '../sim/worker';
import type { DynastyEntry, LineageTree } from '../sim/lineage';
import { YEAR_TICKS } from '../sim/types';
import type { Challenge } from '../challenges';
import { ChapterCard, cardDuration } from './chapter';
import { ChallengeRun } from './challenge';
import { GoalCard } from './goal';
import { FieldNotes, NoteTracker, type NotePlace } from './fieldnotes';
import { NOTE_TOTAL as NOTE_COUNT, trackR3 } from './fieldnotes_r3';
import { NotesPanel, NoteToast } from './notespanel';
import { ResultCard } from './result';
import { Chronicle, type ChronicleEntry } from './chronicle';
import { CHALLENGES } from '../challenges';
import { FieldGuide, PhotoStore } from './fieldguide';
import { GuidePanel } from './guidepanel';
import { PhotoPanel } from './photomode';
import type { ModalPanel } from './panel';
import { DEFAULT_SETTINGS, SettingsPanel, loadSettings, type Settings } from './settings';
import { SetupPanel } from './setup';
import { FirstRunTips, TitleCard } from './title';
import { Toast } from './toast';
import { RarePanel, RareStore, SIGHTING_COUNT, rareMode } from './rare';
import { cardRank, ChronicleVoice, describeEvent, describeFolded, eventWeight, foldKey, foldWindow, sameSeasonName, sameSeasonPhrase, seasonNameAt, yearOfTick, type DescribeContext } from './describe';
import { FeedFilter } from './feed';
import { DecadeLines, SeasonLines } from './seasonlines';
import { button, h, unitPx } from './dom';
import { icon } from './icons';
import { FamilyPanel } from './familytree';
import { Inspector } from './inspector';
import { AboutPanel } from './about';
import { TopRight, challengeInfo } from './menu';
import { PopGraph, type Marker } from './popgraph';
import { GlyphLegend } from './glyphlegend';
import { Slate } from './slate';
import { applySpeciesVars } from './palette';
import { TimeBar } from './timebar';
import { ToolRail, TOOLS_KEY } from './tools';
import type { ToolId, UIActions, UIFrame } from './types';

export { describeEvent } from './describe';
export type { EventText } from './describe';
export { SCENARIOS } from './types';
export type { OverlayId, ToolId, UIActions, UIFrame } from './types';

/** One chapter card per this many milliseconds of real time. */
const CARD_COOLDOWN_MS = 8000;
/** A high-ranking card held back by the cooldown is still worth showing for this long. */
const CARD_HOLD_MS = 20000;
/** A card held back because the documentary camera is not on its event waits this long for the camera to get there, then is dropped. */
const GATE_HOLD_MS = 14000;
/** A field-notes toast for a place waits this long for the documentary camera to be on it, then is dropped (the note is saved either way). */
const NOTE_GATE_HOLD_MS = 12000;
/** Events the graph marks with a line (the rest would only add noise). */
const MARK_KINDS = new Set(['drought', 'droughtEnd', 'outbreak', 'stampede', 'extinct', 'introduced', 'removed', 'culled', 'fire', 'plague', 'megadrought']);
/** A quiet hint about H and C appears once after this long with no input (a second monitor, a lazy afternoon). */
const HINT_IDLE_MS = 60000;
const HINT_KEY = 'tallgrass.hint.v1';
/** The chrome (tools button, chronicle, population, time bar) fades to a faint outline after this long with no pointer or key input; any input restores it. */
const DIM_IDLE_MS = 8000;
/** Packs that lasted fewer ticks than this are left out of the chronicle altogether. */
const FLASH_PACK_TICKS = 300;
/** Events older than this many ticks when they arrive (a backgrounded tab, a bulk fill) never earn a card. */
const STALE_TICKS = 240;
/** How long the "interface hidden" note stays up after entering ambient view. */
const AMBIENT_NOTE_MS = 3000;

interface QueuedCard {
  title: string;
  subtitle: string;
  rank: number;
  at: number;
  /** Sim tick of the event the card is about. */
  tick: number;
  /** Where (sim metres) and what the event was, for the camera gate (see GameUI.cardGate). */
  x?: number;
  y?: number;
  kind?: string;
  /** Held back because the camera was not on the event: it waits only GATE_HOLD_MS for the camera to get there. */
  gated?: boolean;
}

export class GameUI {
  private ui: HTMLElement;
  private slate = new Slate();
  private tools: ToolRail;
  private time: TimeBar;
  private pop = new PopGraph();
  private glyphLegend = new GlyphLegend();
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
  /** The notebook of witnessed moments (also reachable from the console as __fieldnotes). */
  readonly fieldNotes = new FieldNotes();
  private tracker: NoteTracker;
  private notesPanel: NotesPanel;
  private noteToast = new NoteToast();
  /** Notes waiting for their toast. A note earned at a place (sim metres) also waits for the documentary camera to be on it (see flushToast). */
  private toastQueue: { id: string; title: string; hint: string; at?: NotePlace; since: number }[] = [];
  private lastToastAt = -1e9;
  private lastYear = 1;
  private popRo: ResizeObserver;
  /** True during the very first frame, whose events are history (a bulk fill), not news: notes tick without a toast. */
  private firstFrame = true;
  private narrCaption: HTMLElement;
  private narratorOn = true;
  /** The graph was expanded when photo mode opened, so it expands again when photo mode closes. */
  private popWasOpenForPhoto = false;
  private captionText = '';
  private ambientNote: HTMLElement;
  private ambientTimer = 0;
  private dodgeFrame = 0;
  private onAnyDown: (e: PointerEvent) => void;
  private camOn = false;
  private hintDone = false;
  /** Sim tick a running blizzard ends (from its event), for the status line while its snow has not yet built up on screen. */
  private blizzardUntil = -1;
  private lastInput = performance.now();
  private dimmed = false;
  private dimAfter = DIM_IDLE_MS;
  private hintTimer = 0;
  private onInput: () => void;
  // the play pages: settings, valley setup, field guide, plus the title card and first-run tips
  private settingsPanel: SettingsPanel;
  private setupPanel: SetupPanel;
  private guidePanel: GuidePanel;
  /** Rare sightings: the journal page (Menu > Rare sightings) and the store main.ts's RareSightings records into. */
  readonly rareStore = new RareStore({ reset: rareMode(location.search) === 'reset' });
  private rarePanel: RarePanel;
  private aboutPanel: AboutPanel;
  /** Family tree (R12): a docked page the inspector opens (T). Not a modal: the world stays clickable around it. */
  private family: FamilyPanel;
  /** Photo mode (R15): the P key opens it. The game wires its callbacks (lens, freeze, save). */
  readonly photo = new PhotoPanel();
  private guide = new FieldGuide();
  private photos = new PhotoStore();
  private toast = new Toast();
  private tips = new FirstRunTips();
  private title: TitleCard | null = null;
  /** A page was opened from the title card: closing it (Esc, its close button, a click outside) brings the title card back. */
  private titleReturn = false;
  private shutter: HTMLButtonElement;
  private dimBase = DIM_IDLE_MS;
  private shooting = false;
  /** Field guide toasts are off for automated browsers, so the capture tools' stills stay clean (the guide still records). */
  private guideToasts = true;
  /** Behaviours witnessed in the current check, announced together once it is done. */
  private witnessed: { species: string; label: string }[] = [];

  private seed = '';
  private scenario = '';
  private lastTick = -1;
  private selectedId: number | null = null;
  private followingId: number | null = null;
  private hidden = false;
  private cinematic = false;
  private lastCardAt = -1e9;
  /** Sim tick of the event the card on screen is about (null for a card shown by hand). */
  private cardTick: number | null = null;
  private cardCheckAt = 0;
  /** Latest sim speed from the frame (0 paused, -1 skipping). */
  private speed = 1;
  private queued: QueuedCard | null = null;
  /**
   * The documentary camera's say in when an event's card may show: asked with the event's place (sim metres) and kind, it answers whether
   * the camera is on that event right now. A card for a located event that gets "no" waits (GATE_HOLD_MS) for the camera, so a title
   * never sits over a scene that does not show it. Null (or an event with no place: a drought, a blizzard) means no gate.
   */
  cardGate: ((x: number, y: number, kind: string) => boolean) | null = null;
  private feed = new FeedFilter();
  /** Writes the chronicle's event lines without repeating itself; and the open runs of arrivals and departures that fold into one line. */
  private voice = new ChronicleVoice();
  private folds = new Map<string, { entry: ChronicleEntry; total: number; runs: number; first: number }>();
  private seasons = new SeasonLines();
  private decades = new DecadeLines();
  private keyDown: (e: KeyboardEvent) => void;
  private keyUp: (e: KeyboardEvent) => void;

  constructor(root: HTMLElement, private actions: UIActions) {
    this.tools = new ToolRail(actions);
    this.time = new TimeBar(actions);
    this.chron = new Chronicle((x, y) => actions.flyTo(x, y));
    this.family = new FamilyPanel(actions);
    this.inspector = new Inspector(actions, () => this.toggleFamily());
    this.tracker = new NoteTracker(this.fieldNotes);
    this.notesPanel = new NotesPanel(this.fieldNotes, () => this.notesPanel.hide());
    this.top = new TopRight(actions, () => this.setHidden(true), () => this.openPane(null, 'notes'), {
      onSettings: () => this.openPane(this.settingsPanel),
      onSetup: () => this.openPane(this.setupPanel),
      onGuide: () => this.openPane(this.guidePanel),
      onShare: () => this.actions.share?.(),
      onRare: () => this.openPane(this.rarePanel),
      onAbout: () => this.openPane(this.aboutPanel),
    });
    this.settingsPanel = new SettingsPanel(
      loadSettings(),
      (s, changed) => this.onSettingsChange(s, changed),
      (on) => this.actions.setNarrator?.(on),
      () => this.settingsPanel.hide(),
    );
    this.setupPanel = new SetupPanel(
      (seed, params) => {
        this.titleReturn = false; // starting a valley is not closing the page: no title card on the way out
        this.setupPanel.hide();
        this.actions.startValley?.(seed, params);
      },
      () => this.setupPanel.hide(),
    );
    this.guidePanel = new GuidePanel(this.guide, this.photos, () => void this.takePhoto(), () => this.guidePanel.hide());
    this.rarePanel = new RarePanel(this.rareStore, () => rareMode(location.search) === 'all', () => this.rarePanel.hide());
    this.aboutPanel = new AboutPanel(() => this.aboutPanel.hide());
    this.top.setRareCount(this.rareStore.count, SIGHTING_COUNT);
    this.rareStore.onChange = () => {
      this.top.setRareCount(this.rareStore.count, SIGHTING_COUNT);
      this.rarePanel.refresh();
    };
    this.guide.onChange = () => {
      this.guidePanel.refresh();
      const t = this.guide.total();
      this.top.setGuideCount(t.seen, t.total);
    };
    this.guide.onWitness = (page, b) => {
      this.witnessed.push({ species: page.sp.name, label: b.label });
    };
    {
      const t = this.guide.total();
      this.top.setGuideCount(t.seen, t.total);
    }
    this.shutter = button(
      {
        class: 'tg-shutter tg-glass tg-leaf',
        'aria-label': 'Photograph this view: keep a picture of it in the field guide',
        'data-tip': 'Photograph this view (for the field guide)',
        'data-tip-at': 'right',
        html: icon('camera', 20),
        onclick: () => void this.takePhoto(),
      },
    );
    this.top.setNotesCount(this.fieldNotes.count, NOTE_COUNT);
    this.fieldNotes.onChange = () => {
      this.top.setNotesCount(this.fieldNotes.count, NOTE_COUNT);
      this.notesPanel.refresh();
    };
    this.fieldNotes.onEarn = (def, _e, at) => this.toastNote(def, at);

    this.goal = new GoalCard(() => this.tryAgain());
    this.result = new ResultCard(
      () => this.tryAgain(),
      () => this.keepWatching(),
    );
    // the rail makes room under the goal card, whatever height the card is
    this.goalRo = new ResizeObserver(() => this.syncGoalHeight());
    this.goalRo.observe(this.goal.el);
    // the field note toast rides above the population strip, whatever height that has
    this.popRo = new ResizeObserver(() => {
      this.unitCache = 0;
      this.ui.style.setProperty('--pop-h', `${this.pop.el.offsetHeight}px`);
    });
    this.popRo.observe(this.pop.el);

    const right = h('div', { class: 'tg-right' }, this.top.el, this.chron.el, this.inspector.el, this.glyphLegend.el);
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
    const bottom = h('div', { class: 'tg-bottom' }, this.shutter, h('div', { class: 'tg-camwrap' }, this.camChip), this.time.el, this.time.overlayEl);
    const chrome = h('div', { class: 'tg-chrome' }, this.slate.el, this.goal.el, this.tools.el, right, this.pop.el, bottom);
    const bars = h('div', { class: 'tg-bars', 'aria-hidden': 'true' });
    // shown briefly when the interface goes away, so nobody is left wondering how to get it back
    // the narrator's words under the chapter card, in cinematic mode only
    this.narrCaption = h('div', { class: 'tg-narr-caption', 'aria-hidden': 'true' });
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

    this.ui = h(
      'div',
      { class: 'tg-ui', dataset: { cinematic: 'false' } },
      chrome,
      this.noteToast.el,
      this.notesPanel.el,
      this.settingsPanel.el,
      this.setupPanel.el,
      this.guidePanel.el,
      this.rarePanel.el,
      this.aboutPanel.el,
      this.family.el,
      this.photo.el,
      this.toast.el,
      this.hint,
      bars,
      this.chapterCard.el,
      this.result.el,
      this.narrCaption,
      this.ambientNote,
      this.tips.el,
    );
    applySpeciesVars(this.ui);
    this.onSettingsChange(this.settingsPanel.value, 'uiScale');
    this.onSettingsChange(this.settingsPanel.value, 'idleDim');
    root.append(this.ui);

    // photo mode: the other pages step aside, the right-hand column gives the panel its room, and "hide the interface" fades the rest
    this.photo.onOpenChange((open) => {
      this.ui.classList.toggle('is-photo', open);
      this.ui.classList.toggle('is-photoclean', open && this.photo.state.hideUi);
      // the expanded graph would sit under the photo page: it shrinks while the page is open, and comes back after
      if (open && this.pop.isExpanded) {
        this.popWasOpenForPhoto = true;
        this.pop.toggleExpanded();
      } else if (!open && this.popWasOpenForPhoto) {
        this.popWasOpenForPhoto = false;
        if (!this.pop.isExpanded) this.pop.toggleExpanded();
      }
      if (open) {
        this.notesPanel.hide();
        this.family.hide();
        this.closePanes();
        this.toast.hide();
        this.top.close();
        this.time.closeMenu();
      }
    });
    this.photo.onChange((s, k) => {
      if (k === 'hideUi') this.ui.classList.toggle('is-photoclean', this.photo.isOpen && s.hideUi);
    });

    this.keyDown = (e) => this.onKeyDown(e);
    this.keyUp = (e) => {
      // A focused button would otherwise click on Space release after Space already paused the game.
      if (e.key === ' ' && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    this.onInput = () => {
      this.lastInput = performance.now();
      if (this.dimmed) this.setDimmed(false);
      if (this.hint.classList.contains('is-on')) this.hideHint();
    };
    // ?dim=0 turns the dimming off (captures), ?dim=<ms> shortens it (tests)
    try {
      const dq = new URLSearchParams(window.location.search).get('dim');
      if (dq !== null) {
        this.dimBase = Number(dq) > 0 ? Number(dq) : Infinity;
        this.dimAfter = this.settingsPanel.value.idleDim ? this.dimBase : Infinity;
      }
    } catch {
      /* no location: keep the default */
    }
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
    this.setNarrator(f.narrator ?? true);
    this.setCaption(f.caption ?? null);
    this.selectedId = f.selected ? f.selected.id : null;
    this.followingId = f.following;

    this.ui.classList.toggle('has-pane', this.paneOpen);
    if (this.titleReturn && this.title && !this.title.isOpen && !this.paneOpen) this.returnToTitle();
    for (const e of f.events) if (e.kind === 'blizzard') this.blizzardUntil = e.tick + e.a;
    if (f.sky) f.sky.blizzardPending = f.tick < this.blizzardUntil;
    this.slate.update(f.env, f.sky);
    // a hint pill never shares the screen with a title card (the card owns the lower third)
    this.ui.classList.toggle('has-chapter', this.chapterCard.isOn);
    this.time.update(f.speed, f.ticksPerSec, now);
    if (f.slots) this.pop.setSlots(f.slots);
    if (f.history.length) {
      this.pop.addHistory(f.history);
      this.addSeasonLines(f.history, f.speed);
      this.inspector.setMeans(this.pop.latestTraits());
    }
    if (f.history.length || f.events.length) this.addDecadeLines(f.history, f.events);
    if (f.events.length) this.handleEvents(f.events, now, f.tick, f.pop);
    // following an animal, or the documentary camera filming: the population panel is a slim strip, whatever the player chose
    this.pop.setForcedCompact(f.following !== null || !!f.autoCamera || this.cinematic);
    this.pop.update(now, f.pop, f.speed);
    this.glyphLegend.update(f.glyphFade ?? 0, f.pop);
    this.inspector.update(f.selected, f.following, f.story, f.storyId, f.selecting ?? null);
    if (f.selected) this.family.noteDetail(f.selected);
    this.family.frame(f.tick, f.selected ? f.selected.id : null);
    this.lastYear = f.env.year + 1;
    this.fieldNotes.yearNow = this.lastYear;
    this.top.setWorld(f.seed, f.scenario);
    this.flushQueuedCard(now);
    this.keepCardInStep(now);
    if ((this.dodgeFrame++ & 1) === 0) this.dodgeLabels(now);
    if (this.run) this.stepChallenge(f);
    this.tracker.update(
      { tick: f.tick, env: f.env, pop: f.pop, events: f.events, selected: f.selected, following: f.following, speed: f.speed },
      { memorial: this.inspector.isMemorial, challengeWon: this.run?.result?.state === 'won' },
    );
    trackR3(this.fieldNotes, f.events, this.lastYear); // the eight R3 notes that come from sim events (fieldnotes_r3.ts)
    this.firstFrame = false;
    this.flushToast(now);
    this.updateDim(now);
    if (!this.hintDone && now - this.lastInput > HINT_IDLE_MS && !this.hidden && !this.cinematic && !this.result.isOpen && !this.titleOpen && !this.chapterCard.isOn) this.showHint();
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

  // ---- play pages: settings, valley setup, field guide, photographs, title card --------------------------------

  /** The settings as saved (main reads them at start to pick the picture quality and the volumes). */
  get settings(): Settings {
    return this.settingsPanel.value;
  }

  /** The engine is still slow at its lowest render scale on High: step down to Medium (saved for next time) and say so. */
  lowerQuality(): void {
    if (this.settingsPanel.value.quality !== 'high') return;
    this.settingsPanel.setQuality('medium');
    this.notify('Picture quality is now Medium, to keep the valley smooth on this machine. Settings can change it back.', 'Picture', 7000);
  }

  /** The audio module has no per-bus volume yet: grey out those sliders and say why (the master volume still works). */
  setBusesAvailable(on: boolean): void {
    if (on) return;
    this.settingsPanel.setUnavailable('ambience');
    this.settingsPanel.setUnavailable('music');
    this.settingsPanel.setUnavailable('narration');
  }

  setGuideToasts(on: boolean): void {
    this.guideToasts = on;
  }

  /** A short line at the bottom of the screen, for confirmations from main ("Valley link copied"). */
  notify(text: string, label = '', ms = 3200): void {
    this.toast.show(text, label, ms);
  }

  /** The share button ticks for a moment (the link is on the clipboard). */
  shared(ok: boolean): void {
    this.top.flashShared(ok);
  }

  /** The field guide's check: the latest snapshot's animals against the camera focus (sim metres). Call a few times a second. */
  observeGuide(agents: Float32Array, count: number, fx: number, fy: number, inView?: (x: number, y: number) => boolean): void {
    this.guide.yearNow = this.lastYear;
    this.witnessed = [];
    this.guide.observe(agents, count, fx, fy, false, inView);
    const w = this.witnessed;
    // a toast only over a plain view: not under the title card or a page, not in ambient or documentary mode
    if (!w.length || this.hidden || this.cinematic || this.firstFrame || this.titleOpen || this.paneOpen || this.toast.showing || !this.guideToasts) return;
    if (w.length === 1) this.toast.show(w[0].label, `Field guide: ${w[0].species}`, 4200);
    else this.toast.show(`${w.length} new behaviours noted`, 'Field guide', 4200);
  }

  /** The worker's answer to a lineage request (the family tree page draws it). */
  setLineage(id: number, tree: LineageTree | null): void {
    this.family.setTree(id, tree);
  }

  /** The worker's answer to a dynasty request (a wolf pack's alpha pairs). */
  setDynasty(pack: number, list: DynastyEntry[]): void {
    this.family.setDynasty(pack, list);
  }

  /** T and the inspector's Family tree button: open the page for the animal on show, or close it. */
  toggleFamily(): void {
    if (this.titleOpen || this.photo.isOpen) return;
    const id = this.inspector.shownId;
    if (!this.family.isOpen && id === null) return;
    if (!this.family.isOpen) {
      this.notesPanel.hide();
      this.closePanes();
    }
    this.family.toggle(id);
  }

  /** Open one page (and close the others). Null with which='notes' opens the field notes. */
  openPane(p: ModalPanel | null, which: 'notes' | null = null): void {
    this.leaveTitle();
    this.family.hide();
    for (const q of [this.settingsPanel, this.setupPanel, this.guidePanel, this.rarePanel, this.aboutPanel]) if (q !== p) q.hide();
    if (which === 'notes') {
      this.notesPanel.show();
    } else {
      this.notesPanel.hide();
      p?.show();
    }
  }

  private get paneOpen(): boolean {
    return this.settingsPanel.isOpen || this.setupPanel.isOpen || this.guidePanel.isOpen || this.rarePanel.isOpen || this.aboutPanel.isOpen;
  }

  private closePanes(): void {
    this.settingsPanel.hide();
    this.setupPanel.hide();
    this.guidePanel.hide();
    this.rarePanel.hide();
    this.aboutPanel.hide();
  }

  private onSettingsChange(s: Settings, changed: keyof Settings): void {
    if (changed === 'uiScale') {
      this.ui.style.setProperty('--ui-scale', String(s.uiScale));
      this.unitCache = 0;
      this.panelRectsAt = -1e9;
    } else if (changed === 'idleDim') {
      this.dimAfter = s.idleDim ? this.dimBase : Infinity;
      if (!s.idleDim && this.dimmed) this.setDimmed(false);
    }
    this.actions.applySettings?.(s, changed);
  }

  /** Take a photograph of the view: the game renders and reads the canvas, the field guide keeps it with what is in frame. */
  async takePhoto(): Promise<void> {
    if (this.shooting || !this.actions.photograph) return;
    this.shooting = true;
    try {
      const blob = await this.actions.photograph();
      if (!blob) {
        this.toast.show('The picture could not be saved.', 'Photograph');
        return;
      }
      this.flash();
      const tags = this.guide.tagsNow();
      const id = await this.photos.add(blob, { at: Date.now(), seed: this.seed, year: this.lastYear, species: tags.species, behaviours: tags.behaviours });
      let msg: string;
      if (id === null) {
        // nowhere to keep it: hand it over as a download instead
        const a = h('a', { href: URL.createObjectURL(blob), download: `tallgrass-${this.seed.replace(/[^\w-]+/g, '_')}-year${this.lastYear}.jpg` });
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        msg = 'Saved to your downloads (this browser will not keep photographs).';
      } else {
        const names = tags.species.map((sp) => this.guide.pages.find((p) => p.sp.id === sp)?.sp.plural).filter((n): n is string => !!n);
        msg = names.length ? `In frame: ${names.join(', ').toLowerCase()}. Kept in the field guide.` : 'Kept in the field guide.';
      }
      this.guide.notePhotograph(tags.behaviours);
      this.guidePanel.photoAdded();
      this.toast.show(msg, 'Photograph', 3800);
    } finally {
      this.shooting = false;
    }
  }

  private flash(): void {
    const f = h('div', { class: 'tg-flash' });
    this.ui.append(f);
    requestAnimationFrame(() => f.classList.add('is-fading'));
    window.setTimeout(() => f.remove(), 600);
  }

  /** Open the title card over the valley (a plain page load; main decides). */
  showTitle(): void {
    if (this.title) return;
    const choices = CHALLENGES.map((c) => ({ id: c.id, name: c.name, ...challengeInfo(c) }));
    this.title = new TitleCard(
      {
        onWatch: () => this.watch(),
        onChallenge: (id) => this.actions.startChallenge(id),
        onSetup: () => this.openFromTitle(this.setupPanel),
        onGuide: () => this.openFromTitle(this.guidePanel),
      },
      choices,
    );
    this.ui.append(this.title.el);
    this.ui.classList.add('has-title');
    this.title.show();
  }

  /** A page opened from the title card: the card steps aside, and comes back when the page is closed. */
  private openFromTitle(p: ModalPanel): void {
    this.openPane(p);
    this.titleReturn = true;
  }

  private returnToTitle(): void {
    this.titleReturn = false;
    this.ui.classList.add('has-title');
    this.title?.show();
  }

  /** The title card's Watch: the card goes, the interface comes in, and on a first visit three tips follow. */
  private watch(): void {
    this.leaveTitle();
    if (FirstRunTips.wanted()) window.setTimeout(() => !this.hidden && this.tips.show(), 900);
  }

  /** Close the title card without the tips (another page is opening in its place). */
  private leaveTitle(): void {
    this.titleReturn = false;
    if (!this.title?.isOpen) return;
    this.title.hide();
    this.ui.classList.remove('has-title');
  }

  get titleOpen(): boolean {
    return !!this.title?.isOpen;
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

  // ---- field notes ----------------------------------------------------------------------------------------------

  /** The game saw the documentary camera (or cinematic mode) catch a kill close to its focus. */
  noteFilmedKill(): void {
    this.fieldNotes.earn('documentary', this.lastYear);
  }

  /**
   * A note was just earned. Show a quiet toast, unless the interface is hidden (earn silently) or time is flying (only
   * the first of a burst gets a toast; the rest are ticked silently).
   */
  private toastNote(def: { id: string; title: string; hint: string }, at?: NotePlace): void {
    if (this.hidden || this.cinematic || this.firstFrame) return;
    const now = performance.now();
    const fast = this.speed >= 100 || this.speed < 0;
    if (fast && (this.noteToast.showing || now - this.lastToastAt < 8000)) return;
    if (this.toastQueue.length < 3) this.toastQueue.push({ ...def, at, since: now });
  }

  /** Shows the next waiting toast when nothing is in the way: not over a chapter card, not in ambient or cinematic view. */
  private flushToast(now: number): void {
    this.noteToast.tick(now);
    if (this.hidden || this.cinematic) {
      this.toastQueue.length = 0;
      this.noteToast.hide();
      return;
    }
    // (a note waits while the tools drawer is open: they share the lower left, and the note is already saved)
    // (a note earned at a place waits while the documentary camera films something else, so the toast never names a moment the screen
    // does not show; it goes after NOTE_GATE_HOLD_MS if the camera never gets there. The note itself was recorded when it was earned.)
    for (let i = this.toastQueue.length - 1; i >= 0; i--) {
      if (now - this.toastQueue[i].since > NOTE_GATE_HOLD_MS && this.noteBlocked(this.toastQueue[i].at)) this.toastQueue.splice(i, 1);
    }
    if (this.noteToast.showing || !this.toastQueue.length || this.chapterCard.isOn || this.tools.isOpen) return;
    const next = this.toastQueue.findIndex((q) => !this.noteBlocked(q.at));
    if (next < 0) return;
    const def = this.toastQueue.splice(next, 1)[0];
    this.noteToast.show(def, now);
    this.lastToastAt = now;
  }

  /** True while the camera gate says the documentary camera is not on this place (a note with no place is never held). */
  private noteBlocked(at?: NotePlace): boolean {
    if (!this.cardGate || !at || (at.x === 0 && at.y === 0)) return false;
    return !this.cardGate(at.x, at.y, 'note');
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
    const max = this.run ? this.run.challenge.maxTools : null;
    this.tools.setBudget(this.run && max !== null ? Math.max(0, max - this.run.toolsUsed) : null);
  }

  private syncGoalHeight(): void {
    const el = this.goal.el;
    const px = this.run && !el.hidden ? el.offsetHeight + 10 * unitPx(this.ui) : 0;
    this.ui.style.setProperty('--goal-h', `${px}px`);
  }

  /**
   * A second monitor does not need a dashboard: after about eight seconds with no pointer or key input the tools button,
   * chronicle, population strip and time bar fade to a faint, low-opacity outline, and any move or key brings them back.
   * Never while something is open that is being used or read (the tools drawer or an armed tool, the menu, the notebook,
   * the expanded graph), and the ambient and cinematic views already handle themselves. The challenge card stays at full
   * strength, and so does a challenge's own tool use (an armed tool keeps its button lit).
   */
  private updateDim(now: number): void {
    const busy = this.tools.isOpen || this.top.isOpen || this.time.isMenuOpen || this.notesPanel.isOpen || this.paneOpen || this.titleOpen || this.pop.isExpanded || this.result.isOpen || this.photo.isOpen;
    const want = !busy && !this.hidden && !this.cinematic && now - this.lastInput > this.dimAfter;
    if (want !== this.dimmed) this.setDimmed(want);
  }

  private setDimmed(on: boolean): void {
    this.dimmed = on;
    this.ui.classList.toggle('is-idle', on);
  }

  private setNarrator(on: boolean): void {
    if (on === this.narratorOn) return;
    this.narratorOn = on;
    this.top.setNarrator(on);
    this.settingsPanel.setNarrator(on);
  }

  /** The spoken line as a quiet caption under the chapter card. Only cinematic mode shows it (CSS). */
  private setCaption(text: string | null): void {
    const t = text ?? '';
    if (t !== this.captionText) {
      this.captionText = t;
      if (t) this.narrCaption.textContent = t;
      this.narrCaption.classList.toggle('is-on', !!t);
      this.ui.classList.toggle('has-caption', !!t);
    }
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
    this.cardTick = null; // a card shown by hand has no event to keep in step with the header
    this.lastCardAt = performance.now();
    this.queued = null;
    // one card at a time (show() replaces whatever is up), and shorter while years fly by
    this.chapterCard.show(title, subtitle, cardDuration(this.speed < 0 ? 100 : this.speed), this.speed > 1 || this.speed < 0);
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
      this.notesPanel.hide();
      this.closePanes();
      this.toast.hide();
      this.tips.hide();
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
      this.notesPanel.hide();
      this.closePanes();
      this.toast.hide();
      this.top.close();
      this.time.closeMenu();
    }
    this.actions.setCinematic(on);
  }

  /** P: open or close the photo mode page (not over the title card). */
  togglePhoto(): void {
    if (this.titleOpen && !this.photo.isOpen) return;
    this.photo.toggle();
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
    this.popRo.disconnect();
    this.notesPanel.destroy();
    this.settingsPanel.destroy();
    this.setupPanel.destroy();
    this.guidePanel.destroy();
    this.aboutPanel.destroy();
    this.family.destroy();
    this.title?.destroy();
    this.tips.destroy();
    this.chron.destroy();
    this.tools.destroy();
    this.time.destroy();
    this.top.destroy();
    this.pop.destroy();
    this.ui.remove();
  }

  // ---- internals ---------------------------------------------------------------------------------------------

  private resetWorld(f: UIFrame): void {
    this.seed = f.seed;
    this.scenario = f.scenario;
    this.blizzardUntil = -1;
    this.pop.reset();
    this.tracker.reset();
    this.seasons.reset();
    this.decades.reset();
    this.inspector.setMeans(null);
    this.chron.clear();
    this.chapterCard.clear();
    this.queued = null;
    this.feed.reset();
    this.voice.reset();
    this.folds.clear();
    this.lastCardAt = performance.now() - CARD_COOLDOWN_MS + 2500; // let the world settle before the first card
  }

  /** The quiet news in the numbers: a season that thinned a herd, pups at the dens, ravens gathering, a record. */
  private addSeasonLines(rows: HistoryRow[], speed: number): void {
    const lines = this.seasons.feed(rows, speed);
    if (!lines.length) return;
    this.chron.add(
      lines.map((l) => ({ tick: l.tick, year: l.year, sentence: l.sentence, x: 0, y: 0, sp: l.sp, major: false, weight: l.weight })),
      lines.length <= 2,
    );
  }

  /** The long view: a decade summed up under a title ("The Wolf Decade"), and a drought told as one thread. */
  private addDecadeLines(rows: HistoryRow[], events: SimEvent[]): void {
    const lines = this.decades.feed(rows, events);
    if (!lines.length) return;
    this.chron.add(
      lines.map((l) => ({
        tick: l.tick, year: l.year, x: 0, y: 0, sp: l.sp, major: l.kind === 'decade', weight: l.weight,
        sentence: l.sentence,
      })),
      true,
    );
  }

  private handleEvents(events: SimEvent[], now: number, tick: number, pop?: number[]): void {
    const entries: ChronicleEntry[] = [];
    const markers: Marker[] = [];
    let best: { title: string; subtitle: string; rank: number; tick: number; x: number; y: number; kind: string } | null = null;
    let refolded = false;

    // A pack that is founded and lost within a blink is a dispersal that never took: it is not news.
    const flash = new Set<number>();
    for (const e of events) if (e.kind === 'packLost' && e.b < FLASH_PACK_TICKS) flash.add(e.a);

    for (const e of events) {
      if ((e.kind === 'packLost' || e.kind === 'packFounded') && flash.has(e.a)) continue;
      // the sim reports more stampedes and elders than anyone wants to read: thin them out
      if (!this.feed.accept(e)) continue;
      // a pack that breaks up is a death only if the wolf count fell around then
      let ctx: DescribeContext | undefined;
      if (e.kind === 'packLost' && pop) {
        const before = this.pop.popAtOrBefore(1, e.tick);
        if (before !== null) ctx = { wolvesFell: before - (pop[1] ?? 0) >= 2 };
      }
      // an introduction into a valley that still has that species adds animals; it is not a return
      if (e.kind === 'introduced' && e.sp >= 0) {
        const before = this.pop.popAtOrBefore(e.sp, e.tick - 1);
        if (before !== null) ctx = { alreadyHere: before > 0 };
      }
      // a season's drought that ends inside a megadrought does not end the drought the header names
      if (e.kind === 'droughtEnd' && this.pop.megaAtOrBefore(e.tick)) ctx = { megaHolds: true };
      // a run of arrivals (or departures) of one species within a year reads as one growing line, not a list of near-copies
      const fk = foldKey(e);
      const open = fk ? this.folds.get(fk) : undefined;
      if (fk && open && e.tick >= open.entry.tick && e.tick - open.first < foldWindow() && yearOfTick(e.tick) === open.entry.year) {
        open.total += Math.max(1, Math.round(e.a));
        open.runs++;
        open.entry.sentence = describeFolded(e, open.total, open.runs);
        open.entry.tick = e.tick;
        open.entry.x = e.x;
        open.entry.y = e.y;
        this.voice.note(e, open.entry.sentence);
        refolded = true;
        continue;
      }
      const d = this.voice.describe(e, ctx);
      const major = !!d.card;
      const entry: ChronicleEntry = { tick: e.tick, year: yearOfTick(e.tick), sentence: d.sentence, x: e.x, y: e.y, sp: e.sp, major, weight: eventWeight(e) };
      entries.push(entry);
      if (fk) this.folds.set(fk, { entry, total: Math.max(1, Math.round(e.a)), runs: 1, first: e.tick });
      if (MARK_KINDS.has(e.kind)) markers.push({ tick: e.tick, sentence: d.sentence, major });
      if (d.card && tick - e.tick <= STALE_TICKS) {
        const rank = cardRank(e.kind);
        if (!best || rank > best.rank) best = { title: d.card.title, subtitle: d.card.subtitle, rank, tick: e.tick, x: e.x, y: e.y, kind: e.kind };
      }
    }

    if (refolded && !entries.length) this.chron.refresh();
    this.chron.add(entries, entries.length <= 4);
    this.pop.addMarkers(markers);

    if (best && best.rank >= this.cardMinRank()) {
      if (this.gateBlocks(best)) {
        // the camera is elsewhere: the card waits for it (the director may cut to the event), and goes if it never does
        if (!this.queued || best.rank > this.queued.rank) this.queued = { ...best, at: now, gated: true };
      } else if (now - this.lastCardAt >= CARD_COOLDOWN_MS) {
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
    let subtitle: string | undefined = c.subtitle;
    // a card more than a valley-year late (held behind others at fast-forward) is history, not news: drop it rather than announce
    // a drought three years after it began, next to a toast that says it has broken (round 36)
    if (cur - c.tick > YEAR_TICKS) { this.queued = null; return; }
    if (!sameSeasonName(c.tick, cur)) {
      this.queued = null;
      if (c.rank < 4) return;
      subtitle = this.degrade(subtitle, c.tick, 10); // keep only the year
    } else if (!sameSeasonPhrase(c.tick, cur)) {
      // still the same season, but the header has moved on from "midwinter" to "late winter": name only the season, which cannot disagree
      subtitle = this.coarsen(subtitle, c.tick);
    }
    this.chapter(c.title, this.degrade(subtitle, c.tick, this.speed < 0 ? 100 : this.speed));
    this.cardTick = c.tick;
  }

  /**
   * While a card is up the valley moves on (a season is 30 s at 1x with the 2x calendar). About once a second, if the
   * season the card names is no longer the header's, its subtitle drops to just the year.
   */
  private keepCardInStep(now: number): void {
    if (this.cardTick === null || !this.chapterCard.isOn || now - this.cardCheckAt < 1000) return;
    this.cardCheckAt = now;
    const t = this.cardTick;
    const cur = this.lastTick;
    if (sameSeasonPhrase(t, cur)) return;
    const coarse = sameSeasonName(t, cur);
    this.chapterCard.setSubtitleIf(/^Year \d+, /, coarse ? `Year ${yearOfTick(t)}, ${seasonNameAt(t)}` : `Year ${yearOfTick(t)}`);
  }

  /** "Year 3, midwinter" becomes "Year 3, winter": the same moment in the coarse word the header's phrase is built from. */
  private coarsen(subtitle: string | undefined, tick: number): string | undefined {
    if (!subtitle || !/^Year \d+, /.test(subtitle)) return subtitle;
    return `Year ${yearOfTick(tick)}, ${seasonNameAt(tick)}`;
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

  /**
   * Keep the territory labels clear of the interface drawn over them. A label that would sit under the tool rail, the
   * chronicle, the inspector or the goal card is nudged just clear of it (a CSS translate that rides on top of the
   * position the overlay gives it), and one that cannot be nudged far enough is hidden. One that sits under the chapter
   * card is hidden while the card is up.
   */
  private dodgeLabels(now: number): void {
    const labels = this.ui.querySelectorAll<HTMLElement>('.tg-map-label');
    const card = this.chapterCard.bounds();
    if (!labels.length) return;
    if (now - this.panelRectsAt > 350) {
      this.panelRectsAt = now;
      this.panelRects = [];
      const pad = 10 * this.unitPx();
      for (const sel of ['.tg-tools-btn', '.tg-rail-drawer', '.tg-chron', '.tg-insp', '.tg-goal', '.tg-topright-row', '.tg-map-legend', '.tg-pop']) {
        const el = this.ui.querySelector<HTMLElement>(sel);
        if (!el || el.hidden) continue;
        if (sel === '.tg-insp' && !el.classList.contains('is-open')) continue;
        if (sel === '.tg-rail-drawer' && !this.tools.isOpen) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        this.panelRects.push({ l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad });
      }
    }
    const W = window.innerWidth, H = window.innerHeight;
    const maxNudge = 120 * this.unitPx();
    for (const el of labels) {
      const prevX = Number(el.dataset.dx ?? 0), prevY = Number(el.dataset.dy ?? 0);
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue; // not shown right now
      // where the overlay put it, without our own nudge
      const w = r.width, h = r.height;
      let x = r.left - prevX, y = r.top - prevY;
      const x0 = x, y0 = y;
      for (let pass = 0; pass < 2; pass++) {
        for (const p of this.panelRects) {
          if (x + w <= p.l || x >= p.r || y + h <= p.t || y >= p.b) continue;
          // the shortest way out that keeps the label on screen
          const opts: [number, number][] = [];
          if (p.l - w >= 4) opts.push([p.l - w - x, 0]);
          if (p.r + w <= W - 4) opts.push([p.r - x, 0]);
          if (p.t - h >= 4) opts.push([0, p.t - h - y]);
          if (p.b + h <= H - 4) opts.push([0, p.b - y]);
          if (!opts.length) continue;
          opts.sort((m, n) => Math.abs(m[0]) + Math.abs(m[1]) - Math.abs(n[0]) - Math.abs(n[1]));
          x += opts[0][0];
          y += opts[0][1];
        }
      }
      // how far the panels pushed it; a label pushed too far from its den is hidden rather than left misleading
      const pushed = Math.hypot(x - x0, y - y0);
      // and never half off the screen: a label whose den is near the edge slides in
      x = Math.max(8, Math.min(W - w - 8, x));
      y = Math.max(8, Math.min(H - h - 8, y));
      const dx = Math.round(x - x0), dy = Math.round(y - y0);
      const stuck = this.panelRects.some((p) => !(x + w <= p.l || x >= p.r || y + h <= p.t || y >= p.b));
      const far = pushed > maxNudge;
      if (dx !== prevX || dy !== prevY) {
        el.dataset.dx = String(dx);
        el.dataset.dy = String(dy);
        el.style.translate = dx || dy ? `${dx}px ${dy}px` : '';
      }
      const underCard = !!card && r.right > card.left && r.left < card.right && r.bottom > card.top && r.top < card.bottom;
      el.classList.toggle('is-under-card', underCard || stuck || far);
    }
  }

  private panelRects: { l: number; t: number; r: number; b: number }[] = [];
  private panelRectsAt = -1e9;
  private unitCache = 0;
  /** One CSS pixel unit in screen pixels (the UI's --u). */
  private unitPx(): number {
    if (!this.unitCache) this.unitCache = unitPx(this.ui);
    return this.unitCache;
  }

  /** Does the camera gate say the camera is not on this card's event? (Only a located event is gated, and only while a gate is set.) */
  private gateBlocks(c: { x?: number; y?: number; kind?: string }): boolean {
    if (!this.cardGate || c.x === undefined || c.y === undefined || (c.x === 0 && c.y === 0)) return false;
    return !this.cardGate(c.x, c.y, c.kind ?? '');
  }

  private flushQueuedCard(now: number): void {
    const q = this.queued;
    if (!q) return;
    const blocked = this.gateBlocks(q);
    if (now - q.at > (q.gated ? GATE_HOLD_MS : CARD_HOLD_MS)) {
      this.queued = null;
    } else if (!blocked && now - this.lastCardAt >= CARD_COOLDOWN_MS) {
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
    if (this.titleOpen) return; // the title card handles its own keys
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
      case TOOLS_KEY:
        if (!e.repeat) this.tools.toggle();
        break;
      case 'g':
        if (!e.repeat && !this.photo.isOpen) this.pop.toggleExpanded();
        break;
      case 'l':
        if (!e.repeat) this.pop.toggleLog();
        break;
      case 'e':
        if (!e.repeat && !this.photo.isOpen) this.pop.toggleEvolution();
        break;
      case 'v':
        if (!e.repeat) {
          const on = !this.narratorOn;
          this.actions.setNarrator?.(on);
          this.notify(on ? 'Narrator on' : 'Narrator off', '', 2200);
        }
        break;
      case 't':
        if (!e.repeat) this.toggleFamily();
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
    if (this.photo.isOpen) {
      this.photo.close();
    } else if (this.family.isOpen) {
      this.family.hide();
    } else if (this.paneOpen) {
      this.closePanes();
    } else if (this.notesPanel.isOpen) {
      this.notesPanel.hide();
    } else if (this.result.isOpen) {
      this.keepWatching();
    } else if (this.top.isOpen) {
      this.top.close();
    } else if (this.time.isMenuOpen) {
      this.time.closeMenu();
    } else if (this.tools.isOpen) {
      this.tools.close();
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
      // a focused lane in the graph comes back to equal lanes first; the next Esc shrinks the graph
      if (!this.pop.clearFocus()) this.pop.toggleExpanded();
    }
  }
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'Dead', 'Unidentified']);

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}
