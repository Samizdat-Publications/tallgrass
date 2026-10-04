// Right column: the chronicle. One plain sentence per event, grouped under a heading for each valley year, newest on
// top. A busy year keeps only its significant events and folds the rest into "and 3 smaller events" (click to open).
import { button, h, setText } from './dom';
import { icon } from './icons';

export interface ChronicleEntry {
  tick: number;
  year: number;
  sentence: string;
  x: number;
  y: number;
  /** Species the event is about (-1 for none); tints the node on the timeline. */
  sp: number;
  /** True for events that earned a chapter card. */
  major: boolean;
  /** How much the event matters (higher is bigger news); decides what a busy year keeps. */
  weight: number;
}

const MAX_ENTRIES = 600;
/** DOM nodes shown at most; older years scroll off the end. */
const MAX_NODES = 170;
/** A year with more entries than this folds its smaller events away. */
export const FOLD_OVER = 4;

export class Chronicle {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private toggle: HTMLButtonElement;
  private badge: HTMLElement;
  private entries: ChronicleEntry[] = [];
  private fresh = new Set<ChronicleEntry>();
  private opened = new Set<number>();
  private collapsed = false;
  private unread = 0;
  private empty: HTMLElement;
  /** The first batch after a (re)start is history, not news: it never counts as unread. */
  private quietNext = true;
  private trimRaf = 0;
  private ro: ResizeObserver;

  constructor(private flyTo: (x: number, y: number) => void) {
    this.list = h('div', { class: 'tg-chron-list', role: 'list' });
    this.empty = h('p', { class: 'tg-chron-empty', text: 'Nothing has happened yet. Give the valley time.' });
    this.list.append(this.empty);
    this.badge = h('span', { class: 'tg-chron-badge', 'aria-hidden': 'true' });
    this.toggle = button(
      { class: 'tg-chron-toggle', 'aria-expanded': 'true', 'aria-label': 'Collapse the chronicle', title: 'Collapse the chronicle', onclick: () => this.setCollapsed(!this.collapsed) },
      h('span', { class: 'tg-chron-title', text: 'Chronicle' }),
      this.badge,
      h('span', { class: 'tg-chron-caret', html: icon('chevronDown', 16) }),
    );
    this.el = h('aside', { class: 'tg-chron tg-glass tg-leaf', 'aria-label': 'Chronicle' }, this.toggle, this.list);
    // The list is clipped by its panel (and shrinks when the inspector opens). Whatever the height, the visible part
    // must end on a whole entry, never half a sentence, so the part below the last whole entry is masked away.
    this.list.addEventListener('scroll', () => this.scheduleTrim(), { passive: true });
    this.ro = new ResizeObserver(() => this.scheduleTrim());
    this.ro.observe(this.list);

    // Below 900 px wide the chronicle starts collapsed to a single tab.
    const mq = window.matchMedia('(max-width: 899px)');
    if (mq.matches) this.setCollapsed(true);
    mq.addEventListener('change', (e) => {
      if (e.matches) this.setCollapsed(true);
    });
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  setCollapsed(c: boolean): void {
    this.collapsed = c;
    this.el.classList.toggle('is-collapsed', c);
    this.toggle.setAttribute('aria-expanded', c ? 'false' : 'true');
    const label = c ? 'Open the chronicle' : 'Collapse the chronicle';
    this.toggle.setAttribute('aria-label', label);
    this.toggle.title = label;
    if (!c) {
      this.unread = 0;
      this.renderBadge();
      this.scheduleTrim();
    }
  }

  destroy(): void {
    this.ro.disconnect();
    cancelAnimationFrame(this.trimRaf);
  }

  clear(): void {
    this.entries = [];
    this.fresh.clear();
    this.opened.clear();
    this.unread = 0;
    this.renderBadge();
    this.quietNext = true;
    this.render();
  }

  /** Add entries oldest-first. `animate` is false for a bulk fill. */
  add(items: ChronicleEntry[], animate = true): void {
    if (!items.length) return;
    for (const it of items) {
      this.entries.push(it);
      if (animate) this.fresh.add(it);
    }
    while (this.entries.length > MAX_ENTRIES) {
      const old = this.entries.shift();
      if (old) this.fresh.delete(old);
    }
    this.render();
    if (this.collapsed && !this.quietNext) {
      this.unread += items.length;
      this.renderBadge();
    }
    this.quietNext = false;
  }

  private renderBadge(): void {
    this.badge.classList.toggle('is-on', this.unread > 0);
    setText(this.badge, this.unread > 9 ? '9+' : String(this.unread));
  }

  /** Rebuild the list: a heading per year, the entries that matter, and a fold line for the rest. */
  private render(): void {
    const scroll = this.list.scrollTop;
    const frag = document.createDocumentFragment();
    if (!this.entries.length) {
      this.list.replaceChildren(this.empty);
      return;
    }
    const byYear = new Map<number, ChronicleEntry[]>();
    for (const e of this.entries) {
      const g = byYear.get(e.year);
      if (g) g.push(e);
      else byYear.set(e.year, [e]);
    }
    const years = [...byYear.keys()].sort((a, b) => b - a);
    let nodes = 0;
    for (const year of years) {
      if (nodes > MAX_NODES) break;
      const all = byYear.get(year) as ChronicleEntry[]; // oldest first
      const open = this.opened.has(year);
      let shown = all;
      let hidden = 0;
      const foldable = all.length > FOLD_OVER + 1;
      if (foldable && !open) {
        const keep = new Set([...all].sort((a, b) => b.weight - a.weight || b.tick - a.tick).slice(0, FOLD_OVER));
        shown = all.filter((e) => keep.has(e));
        hidden = all.length - shown.length;
      }
      const group = h('div', { class: 'tg-year', role: 'group', 'aria-label': `Year ${year}` });
      group.append(h('div', { class: 'tg-year-head', text: `Year ${year}` }));
      const ordered = [...shown].reverse(); // newest first
      ordered.forEach((e, i) => {
        group.append(this.build(e, i === 0, i === ordered.length - 1 && hidden === 0 && !(open && foldable)));
        nodes++;
      });
      if (hidden > 0) {
        group.append(
          button(
            { class: 'tg-more', title: 'Show every event of this year', onclick: () => this.toggleYear(year) },
            `and ${hidden} smaller ${hidden === 1 ? 'event' : 'events'}`,
          ),
        );
        nodes++;
      } else if (open && foldable) {
        group.append(button({ class: 'tg-more', onclick: () => this.toggleYear(year), text: 'show fewer' }));
        nodes++;
      }
      frag.append(group);
    }
    this.fresh.clear();
    this.list.replaceChildren(frag);
    this.list.scrollTop = scroll;
    this.scheduleTrim();
  }

  private scheduleTrim(): void {
    if (this.trimRaf) return;
    this.trimRaf = requestAnimationFrame(() => {
      this.trimRaf = 0;
      this.trim();
    });
  }

  /** Mask everything below the last entry that fits whole, so the list never ends mid-sentence. */
  private trim(): void {
    const l = this.list;
    const set = (v: string) => {
      l.style.maskImage = v;
      l.style.webkitMaskImage = v;
    };
    if (this.collapsed || l.clientHeight === 0) return;
    if (l.scrollTop + l.clientHeight >= l.scrollHeight - 2) return set('none'); // everything is on show
    const top = l.getBoundingClientRect().top;
    const limit = l.getBoundingClientRect().bottom + 0.5;
    let lastWhole = -1;
    for (const it of l.querySelectorAll<HTMLElement>('.tg-ent, .tg-more')) {
      const r = it.getBoundingClientRect();
      if (r.bottom > limit) break;
      if (r.bottom > top) lastWhole = r.bottom - top;
    }
    if (lastWhole < 0) return set('none');
    set(`linear-gradient(#000 ${lastWhole.toFixed(1)}px, transparent ${(lastWhole + 7).toFixed(1)}px)`);
  }

  private toggleYear(year: number): void {
    if (this.opened.has(year)) this.opened.delete(year);
    else this.opened.add(year);
    this.render();
  }

  private build(it: ChronicleEntry, first: boolean, last: boolean): HTMLElement {
    const flyable = it.x !== 0 || it.y !== 0;
    const spColor = it.sp >= 0 && it.sp < 6 ? `var(--sp-${it.sp})` : 'var(--paper-dim)';
    const inner = [
      h('span', { class: 'tg-ent-node', 'aria-hidden': 'true' }),
      h('span', { class: 'tg-ent-t' }, h('span', { class: 'tg-sr', text: `Year ${it.year}: ` }), it.sentence),
    ];
    const cls = `tg-ent${flyable ? ' is-flyable' : ''}${it.major ? ' is-major' : ''}${this.fresh.has(it) ? ' is-new' : ''}${first ? ' is-first' : ''}${last ? ' is-last' : ''}`;
    const body = flyable
      ? button({ class: 'tg-ent-b', title: 'Fly the camera there', onclick: () => this.flyTo(it.x, it.y) }, ...inner)
      : h('div', { class: 'tg-ent-b' }, ...inner);
    return h('div', { class: cls, role: 'listitem', dataset: { year: String(it.year) }, style: `--node:${spColor}` }, body);
  }
}
