// Bottom right: the inspector. Appears when an animal is selected and reads like a documentary caption.
import type { AnimalDetail } from '../sim/worker';
import { button, h, setText } from './dom';
import { activityPhrase, animalCaption, fmtInt, lineageText, packName, plural } from './describe';
import { icon } from './icons';
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

// Gene ranges follow src/sim/sim.ts clampGene. Founders start near 1 (coat differs per species).
const COAT_BASE = [0.85, 0.3, 0.97, 0.5, 0.5, 0.5];
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
  private gauges: { dot: HTMLElement; tick: HTMLElement; val: HTMLElement }[] = [];
  private stats: HTMLElement;
  private followBtn: HTMLButtonElement;
  private followLabel: HTMLElement;
  private currentId = -1;
  private following = false;
  private open = false;
  private hideTimer = 0;
  private lastKey = '';

  constructor(private actions: UIActions) {
    this.caption = h('h2', { class: 'tg-insp-caption' });
    this.lineage = h('p', { class: 'tg-insp-lineage' });
    this.activity = h('p', { class: 'tg-insp-activity' });
    this.chips = h('div', { class: 'tg-insp-chips' });
    this.stats = h('div', { class: 'tg-insp-stats' });

    const bars = h('div', { class: 'tg-insp-bars' });
    for (const b of BARS) {
      const fill = h('span', { class: 'tg-bar-fill' });
      const track = h('span', { class: 'tg-bar-track', role: 'meter', 'aria-label': b.label, 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
      bars.append(h('div', { class: 'tg-bar' }, h('span', { class: 'tg-bar-label', text: b.label }), track));
      this.bars.set(b.key, { fill, track, last: -1 });
    }

    const traits = h('div', { class: 'tg-insp-traits', role: 'group', 'aria-label': 'Traits against the species average' });
    for (const t of TRAITS) {
      const dot = h('span', { class: 'tg-gauge-dot' });
      const tick = h('span', { class: 'tg-gauge-tick' });
      const val = h('span', { class: 'tg-gauge-val' });
      const gauge = h('span', { class: 'tg-gauge-track' }, tick, dot);
      traits.append(
        h('div', { class: 'tg-gauge', title: t.title }, h('div', { class: 'tg-gauge-top' }, h('span', { class: 'tg-gauge-label', text: t.label }), val), gauge),
      );
      this.gauges.push({ dot, tick, val });
    }

    this.followLabel = h('span', { text: 'Follow' });
    this.followBtn = button(
      { class: 'tg-btn tg-insp-follow', title: 'Follow with the camera (F)', 'aria-pressed': 'false', onclick: () => this.onFollow() },
      h('span', { html: icon('follow', 16) }),
      this.followLabel,
      h('kbd', { class: 'tg-kbd', text: 'F' }),
    );
    const closeBtn = button(
      { class: 'tg-btn tg-insp-close', title: 'Close (Esc)', onclick: () => this.actions.select(null) },
      h('span', { html: icon('close', 16) }),
      h('span', { text: 'Close' }),
      h('kbd', { class: 'tg-kbd', text: 'Esc' }),
    );

    this.el = h(
      'section',
      { class: 'tg-insp tg-glass', 'aria-label': 'Selected animal', hidden: true },
      h('header', { class: 'tg-insp-head' }, this.caption, this.lineage),
      this.activity,
      this.chips,
      bars,
      traits,
      h('p', { class: 'tg-insp-note', text: 'Dot: this animal. Tick: where the founders started.' }),
      this.stats,
      h('div', { class: 'tg-insp-actions' }, this.followBtn, closeBtn),
    );
  }

  get isOpen(): boolean {
    return this.open;
  }

  private onFollow(): void {
    if (this.currentId < 0) return;
    this.actions.follow(this.following ? null : this.currentId);
  }

  update(sel: AnimalDetail | null, followingId: number | null): void {
    if (sel) {
      this.show();
      if (sel.id !== this.currentId) this.rebuild(sel);
      this.currentId = sel.id;
      this.refresh(sel);
      const f = followingId === sel.id;
      if (f !== this.following) {
        this.following = f;
        this.followBtn.setAttribute('aria-pressed', f ? 'true' : 'false');
        setText(this.followLabel, f ? 'Following' : 'Follow');
      }
    } else if (this.open) {
      this.hide();
    }
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
      }
    }, 220);
  }

  /** Parts that only change when a different animal is picked. */
  private rebuild(d: AnimalDetail): void {
    this.el.style.setProperty('--sp', `var(--sp-${d.sp})`);
    setText(this.lineage, lineageText(d.sp, d.gen, d.male, d.parentA));
    TRAITS.forEach((t, i) => {
      const v = d.genes[t.key] ?? t.base(d.sp);
      const f = (x: number) => Math.max(0, Math.min(1, (x - t.min) / (t.max - t.min)));
      const g = this.gauges[i];
      g.dot.style.left = `${(f(v) * 100).toFixed(1)}%`;
      g.tick.style.left = `${(f(t.base(d.sp)) * 100).toFixed(1)}%`;
      setText(g.val, v.toFixed(2));
      const parent = g.dot.parentElement?.parentElement;
      if (parent) parent.title = `${t.title}: ${v.toFixed(2)}. The tick is where the founders started (${t.base(d.sp).toFixed(2)}).`;
    });
    this.lastKey = '';
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
    const key = chips.join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.chips.replaceChildren(...chips.map((c) => h('span', { class: `tg-chip${c === 'Sick' ? ' is-warn' : ''}`, text: c })));
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
    const statKey = `${d.children}|${d.kills}|${d.sp}`;
    if (statKey !== this.stats.dataset.k) {
      this.stats.dataset.k = statKey;
      const parts: HTMLElement[] = [stat(fmtInt(d.children), d.children === 1 ? 'offspring' : 'offspring')];
      if (d.sp === 1 || d.sp === 5 || d.kills > 0) parts.push(stat(fmtInt(d.kills), d.kills === 1 ? 'kill' : 'kills'));
      this.stats.replaceChildren(...parts);
    }
  }
}

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'tg-stat' }, h('span', { class: 'tg-stat-v', text: value }), h('span', { class: 'tg-stat-l', text: label }));
}

const capFirst = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
