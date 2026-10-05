// Bottom right: the inspector. Appears when an animal is selected and reads like a documentary caption.
import type { StoryEntry } from '../sim/sim';
import type { AnimalDetail } from '../sim/worker';
import { button, h, setText } from './dom';
import { activityPhrase, animalCaption, fmtInt, lineageText, packName, plural } from './describe';
import { icon } from './icons';
import { backstory, buildStory, diedEntry, memorialText } from './story';
import { traitIndex } from './traits';
import { COAT_BASE } from '../sim/species';
import type { UIActions } from './types';

interface TraitDef {
  key: string;
  label: string;
  min: number;
  max: number;
  /** Baseline the founders start from: the "species mean" tick on the gauge. */
  base: (sp: number) => number;
  title: string;
}

// Gene ranges follow src/sim/sim.ts clampGene. Founders start near 1 (coat differs per species: COAT_BASE in the registry file).
const TRAITS: TraitDef[] = [
  { key: 'speed', label: 'speed', min: 0.6, max: 1.6, base: () => 1, title: 'Running speed' },
  { key: 'size', label: 'size', min: 0.6, max: 1.6, base: () => 1, title: 'Body size' },
  { key: 'sight', label: 'sight', min: 0.5, max: 2, base: () => 1, title: 'How far it sees' },
  { key: 'boldness', label: 'boldness', min: 0, max: 2, base: () => 1, title: 'How readily it stands its ground' },
  { key: 'herding', label: 'herding', min: 0, max: 2, base: () => 1, title: 'How tightly it keeps to the group' },
  { key: 'coat', label: 'coat', min: 0, max: 1, base: (sp) => COAT_BASE[sp] ?? 0.5, title: 'Coat shade, pale to dark' },
];

const BARS: { key: 'energy' | 'hydration' | 'stamina'; label: string }[] = [
  { key: 'energy', label: 'Energy' },
  { key: 'hydration', label: 'Water' },
  { key: 'stamina', label: 'Stamina' },
];

interface BarRef {
  fill: HTMLElement;
  track: HTMLElement;
  last: number;
}

export class Inspector {
  readonly el: HTMLElement;
  private caption: HTMLElement;
  private lineage: HTMLElement;
  private activity: HTMLElement;
  private chips: HTMLElement;
  private bars = new Map<string, BarRef>();
  private gauges: { dot: HTMLElement; tick: HTMLElement; val: HTMLElement; mean: HTMLElement }[] = [];
  /** Latest mean of each recorded trait across the species (from the newest history row). */
  private means: number[] | null = null;
  private sp = -1;
  private stats: HTMLElement;
  private followBtn: HTMLButtonElement;
  private followLabel: HTMLElement;
  private currentId = -1;
  private following = false;
  private open = false;
  private hideTimer = 0;
  private lastKey = '';

  // life story and memorial
  private storyEl: HTMLElement;
  private storyList: HTMLElement;
  private storyCount: HTMLElement;
  private storyToggle: HTMLButtonElement;
  private storyOpen = typeof window !== 'undefined' ? window.innerHeight >= 800 : true;
  private storySig = '';
  private memorial = false;
  private memorialText: HTMLElement;
  private lastDetail: AnimalDetail | null = null;

  constructor(private actions: UIActions) {
    this.caption = h('h2', { class: 'tg-insp-caption' });
    this.lineage = h('p', { class: 'tg-insp-lineage' });
    this.activity = h('p', { class: 'tg-insp-activity' });
    this.chips = h('div', { class: 'tg-insp-chips' });
    this.stats = h('div', { class: 'tg-insp-stats tg-live' });
    this.activity.classList.add('tg-live');
    this.chips.classList.add('tg-live');

    const bars = h('div', { class: 'tg-insp-bars tg-live' });
    for (const b of BARS) {
      const fill = h('span', { class: 'tg-bar-fill' });
      const track = h('span', { class: 'tg-bar-track', role: 'meter', 'aria-label': b.label, 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
      bars.append(h('div', { class: 'tg-bar' }, h('span', { class: 'tg-bar-label', text: b.label }), track));
      this.bars.set(b.key, { fill, track, last: -1 });
    }

    const traits = h('div', { class: 'tg-insp-traits tg-live', role: 'group', 'aria-label': 'Traits against the species average' });
    for (const t of TRAITS) {
      const dot = h('span', { class: 'tg-gauge-fill' });
      const tick = h('span', { class: 'tg-gauge-tick' });
      const val = h('span', { class: 'tg-gauge-val' });
      const mean = h('span', { class: 'tg-gauge-mean' });
      const gauge = h('span', { class: 'tg-gauge-track', role: 'meter', 'aria-label': t.label, 'aria-valuemin': String(t.min), 'aria-valuemax': String(t.max) }, dot, tick, mean);
      traits.append(
        h('div', { class: 'tg-gauge', title: t.title }, h('div', { class: 'tg-gauge-top' }, h('span', { class: 'tg-gauge-label', text: t.label }), val), gauge),
      );
      this.gauges.push({ dot, tick, val, mean });
    }

    this.followLabel = h('span', { text: 'Follow' });
    this.followBtn = button(
      { class: 'tg-btn tg-insp-follow tg-live', title: 'Follow with the camera (F)', 'aria-pressed': 'false', onclick: () => this.onFollow() },
      h('span', { html: icon('follow', 16) }),
      this.followLabel,
      h('kbd', { class: 'tg-kbd', text: 'F' }),
    );
    const closeBtn = button(
      { class: 'tg-btn tg-insp-close', title: 'Close (Esc)', onclick: () => this.close() },
      h('span', { html: icon('close', 16) }),
      h('span', { text: 'Close' }),
      h('kbd', { class: 'tg-kbd', text: 'Esc' }),
    );

    // "In memoriam": replaces the live readout when the animal dies, and stays until the player closes it
    this.memorialText = h('p', { class: 'tg-memorial-text' });
    const memorial = h(
      'div',
      { class: 'tg-memorial' },
      h('p', { class: 'tg-memorial-label', text: 'In memoriam' }),
      this.memorialText,
    );

    // collapsible life story, newest at the bottom
    this.storyCount = h('span', { class: 'tg-story-count' });
    this.storyList = h('ol', { class: 'tg-story-list' });
    this.storyToggle = button(
      { class: 'tg-story-toggle', 'aria-expanded': String(this.storyOpen), onclick: () => this.setStoryOpen(!this.storyOpen) },
      h('span', { class: 'tg-story-title', text: 'Life story' }),
      this.storyCount,
      h('span', { class: 'tg-story-caret', html: icon('chevronDown', 16) }),
    );
    this.storyEl = h('section', { class: 'tg-story', 'aria-label': 'Life story' }, this.storyToggle, this.storyList);
    this.storyList.addEventListener('scroll', () => this.trimStory(), { passive: true });
    this.storyEl.classList.toggle('is-collapsed', !this.storyOpen);

    this.el = h(
      'section',
      { class: 'tg-insp tg-glass tg-leaf', 'aria-label': 'Selected animal', hidden: true },
      h('header', { class: 'tg-insp-head' }, this.caption, this.lineage),
      memorial,
      this.activity,
      this.chips,
      bars,
      traits,
      h('p', { class: 'tg-insp-note tg-live', text: 'Bar: this animal. Grey tick: where the founders started. Bright tick: the species now.' }),
      this.stats,
      this.storyEl,
      h('div', { class: 'tg-insp-actions' }, this.followBtn, closeBtn),
    );
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** True while the "In memoriam" card is showing for an animal that has died. */
  get isMemorial(): boolean {
    return this.memorial;
  }

  /** Close button and Esc: let go of a live animal, or put away a memorial. */
  close(): void {
    if (this.memorial) this.closeMemorial();
    this.actions.select(null);
  }

  closeMemorial(): void {
    this.memorial = false;
    this.lastDetail = null;
    this.el.classList.remove('is-memorial');
    this.hide();
  }

  private setStoryOpen(open: boolean): void {
    this.storyOpen = open;
    this.storyEl.classList.toggle('is-collapsed', !open);
    this.storyToggle.setAttribute('aria-expanded', String(open));
    if (open) this.storyList.scrollTop = this.storyList.scrollHeight;
  }

  private onFollow(): void {
    if (this.currentId < 0) return;
    this.actions.follow(this.following ? null : this.currentId);
  }

  update(sel: AnimalDetail | null, followingId: number | null, story: StoryEntry[] = [], storyId = 0): void {
    if (sel) {
      if (this.memorial) {
        this.memorial = false;
        this.el.classList.remove('is-memorial');
      }
      this.show();
      if (sel.id !== this.currentId) this.rebuild(sel);
      this.currentId = sel.id;
      this.lastDetail = sel;
      this.refresh(sel);
      const f = followingId === sel.id;
      if (f !== this.following) {
        this.following = f;
        this.followBtn.setAttribute('aria-pressed', f ? 'true' : 'false');
        setText(this.followLabel, f ? 'Following' : 'Follow');
      }
      this.renderStory(storyId === sel.id ? story : [], sel);
      return;
    }
    if (this.memorial) return; // stays until the player closes it
    if (!this.open) return;
    // the selection vanished: a death keeps the card open as a memorial, a deselect closes it
    const d = this.lastDetail;
    const died = d && storyId === d.id ? diedEntry(story) : null;
    if (d && died) this.enterMemorial(d, story, died);
    else this.hide();
  }

  private enterMemorial(d: AnimalDetail, story: StoryEntry[], died: StoryEntry): void {
    this.memorial = true;
    this.el.classList.add('is-memorial');
    this.following = false;
    setText(this.caption, animalCaption(d.sp, d.male, d.age, d.matureAge, d.alpha, d.maxAge));
    setText(this.memorialText, memorialText({ sp: d.sp, male: d.male }, story, died, d.age, d.maxAge, d.children));
    this.renderStory(story, d);
    this.setStoryOpen(true);
  }

  /** The life story as documentary captions: valley season and year, then the line. Re-rendered only when it changes. */
  private renderStory(entries: StoryEntry[], d: AnimalDetail): void {
    const last = entries.length ? entries[entries.length - 1] : null;
    const sig = `${d.id}:${entries.length}:${last ? last.tick : 0}:${this.memorial ? 1 : 0}`;
    if (sig === this.storySig) return;
    this.storySig = sig;
    const lines = buildStory(entries, { sp: d.sp, male: d.male });
    // a founder's story opens with where it came from, so it never starts on "nothing to tell"
    const back = backstory({ sp: d.sp, male: d.male, gen: d.gen, bornTick: d.born, pack: d.pack });
    if (back) lines.unshift(back);
    const atBottom = this.storyList.scrollHeight - this.storyList.scrollTop - this.storyList.clientHeight < 12;
    if (!lines.length) {
      this.storyList.replaceChildren(h('li', { class: 'tg-story-empty', text: this.memorial ? 'Nothing was recorded.' : 'Nothing to tell yet. Give it time.' }));
    } else {
      this.storyList.replaceChildren(
        ...lines.map((l) => h('li', { class: 'tg-story-line' }, h('span', { class: 'tg-story-when', text: l.when }), ' ', h('span', { class: 'tg-story-text', text: l.text }))),
      );
    }
    setText(this.storyCount, lines.length ? String(lines.length) : '');
    if (atBottom || this.memorial) this.storyList.scrollTop = this.storyList.scrollHeight;
    this.trimStory();
  }

  /** The story scrolls to its newest line, so its top edge can cut a line in half: mask away any line that is not whole. */
  private trimStory(): void {
    const l = this.storyList;
    const set = (v: string) => {
      l.style.maskImage = v;
      l.style.webkitMaskImage = v;
    };
    if (l.scrollTop <= 1 || l.clientHeight === 0) return set('none');
    const box = l.getBoundingClientRect();
    let firstWhole = -1;
    for (const li of l.querySelectorAll<HTMLElement>('.tg-story-line')) {
      const r = li.getBoundingClientRect();
      if (r.top >= box.top - 0.5) {
        firstWhole = r.top - box.top;
        break;
      }
    }
    if (firstWhole <= 0) return set('none');
    set(`linear-gradient(to bottom, transparent ${Math.max(0, firstWhole - 6).toFixed(1)}px, #000 ${firstWhole.toFixed(1)}px)`);
  }

  private show(): void {
    if (this.open) return;
    this.open = true;
    window.clearTimeout(this.hideTimer);
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-open');
  }

  private hide(): void {
    this.open = false;
    this.el.classList.remove('is-open');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      if (!this.open) {
        this.el.hidden = true;
        this.currentId = -1;
        this.storySig = '';
      }
    }, 220);
  }

  /** The species' current mean traits (from the newest history row). Cheap: moves a few ticks. */
  setMeans(means: number[] | null): void {
    this.means = means;
    if (this.sp >= 0) this.applyMeans();
  }

  private applyMeans(): void {
    TRAITS.forEach((t, i) => {
      const kind = t.key === 'speed' || t.key === 'size' || t.key === 'coat' ? t.key : null;
      const idx = kind ? traitIndex(this.sp, kind) : -1;
      const m = idx >= 0 && this.means ? this.means[idx] : NaN;
      const el = this.gauges[i].mean;
      if (Number.isFinite(m)) {
        const f = Math.max(0, Math.min(1, (m - t.min) / (t.max - t.min)));
        el.style.left = `${(f * 100).toFixed(1)}%`;
        el.classList.add('is-on');
      } else {
        el.classList.remove('is-on');
      }
    });
  }

  /** Parts that only change when a different animal is picked. */
  private rebuild(d: AnimalDetail): void {
    this.sp = d.sp;
    this.el.style.setProperty('--sp', `var(--sp-${d.sp})`);
    setText(this.lineage, lineageText(d.sp, d.gen, d.male, d.parentA));
    TRAITS.forEach((t, i) => {
      const v = d.genes[t.key] ?? t.base(d.sp);
      const f = (x: number) => Math.max(0, Math.min(1, (x - t.min) / (t.max - t.min)));
      const g = this.gauges[i];
      g.dot.style.width = `${(f(v) * 100).toFixed(1)}%`;
      g.dot.parentElement?.setAttribute('aria-valuenow', v.toFixed(2));
      g.tick.style.left = `${(f(t.base(d.sp)) * 100).toFixed(1)}%`;
      // plain words instead of a raw gene value, each against the founders (the tick): coat as paler or darker, the rest in percent
      const dc = v - t.base(d.sp);
      const word = t.key === 'coat' ? (dc < -0.05 ? 'paler' : dc > 0.05 ? 'darker' : 'typical') : relWord(v, t.base(d.sp));
      setText(g.val, word);
      const parent = g.dot.parentElement?.parentElement;
      if (parent) parent.title = `${t.title}: ${v.toFixed(2)} (${word} against the founders). The tick is where the founders started (${t.base(d.sp).toFixed(2)}).`;
    });
    this.lastKey = '';
    this.applyMeans();
  }

  private refresh(d: AnimalDetail): void {
    setText(this.caption, animalCaption(d.sp, d.male, d.age, d.matureAge, d.alpha, d.maxAge));
    setText(this.activity, capFirst(activityPhrase(d.sp, d.state)));

    // chips: pack, alpha, pregnant, infected
    const chips: string[] = [];
    if (d.pack >= 0 && d.sp === 1) chips.push(`${packName(d.pack)} pack, ${d.packSize} ${d.packSize === 1 ? 'wolf' : plural(1)}`);
    if (d.alpha) chips.push('Alpha');
    if (d.pregnant) chips.push('Expecting');
    if (d.infected) chips.push('Sick');
    // R3: a coyote with a mate wears a "Pair" chip, a canid with mange a "Mange" one, once the sim reports them (optional fields of
    // AnimalDetail: paired, mange severity; Track S adds them to worker.ts detail())
    const dx = d as AnimalDetail & { paired?: boolean; mange?: number };
    if (d.sp === 6 && dx.paired) chips.push('Pair');
    if ((dx.mange ?? 0) > 0) chips.push('Mange');
    const key = chips.join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.chips.replaceChildren(...chips.map((c) => h('span', { class: `tg-chip${c === 'Sick' || c === 'Mange' ? ' is-warn' : ''}`, text: c })));
      this.chips.style.display = chips.length ? '' : 'none';
    }

    for (const b of BARS) {
      const ref = this.bars.get(b.key);
      if (!ref) continue;
      const v = Math.max(0, Math.min(1, d[b.key]));
      if (Math.abs(v - ref.last) > 0.004) {
        ref.last = v;
        ref.fill.style.transform = `scaleX(${v.toFixed(3)})`;
        ref.track.classList.toggle('is-low', v < 0.2);
        ref.track.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      }
    }

    // stats: offspring always, kills for hunters or anyone who has some
    // A counter that is still zero says nothing (a founder with no young and no kills reads as a contradiction), so it
    // stays hidden until its first one. A founder's counts run from the day the valley began, and say so.
    const founder = d.gen <= 0 || d.parentA <= 0;
    const statKey = `${d.children}|${d.kills}|${d.sp}|${founder ? 1 : 0}`;
    if (statKey !== this.stats.dataset.k) {
      this.stats.dataset.k = statKey;
      const parts: HTMLElement[] = [];
      if (d.children > 0) parts.push(stat(fmtInt(d.children), d.children === 1 ? 'offspring' : 'offspring'));
      if (d.kills > 0) parts.push(stat(fmtInt(d.kills), d.kills === 1 ? 'kill' : 'kills'));
      if (parts.length && founder) parts.push(h('span', { class: 'tg-stat-since', text: 'since the valley began' }));
      this.stats.replaceChildren(...parts);
      this.stats.classList.toggle('is-empty', parts.length === 0);
    }
  }
}

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'tg-stat' }, h('span', { class: 'tg-stat-v', text: value }), h('span', { class: 'tg-stat-l', text: label }));
}

const capFirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** A gene as a change from the founders' value: "+12%", "-8%", or "0%" when within half a percent. */
const relWord = (v: number, base: number): string => {
  const pct = Math.round((v / (base || 1) - 1) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
};
