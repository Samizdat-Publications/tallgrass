// Right column: the chronicle. One plain sentence per event, newest on top, click to fly the camera there.
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
}

const MAX_ENTRIES = 400;
const MAX_VISIBLE = 80;

export class Chronicle {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private toggle: HTMLButtonElement;
  private badge: HTMLElement;
  private entries: ChronicleEntry[] = [];
  private nodes: HTMLElement[] = [];
  private collapsed = false;
  private unread = 0;
  private empty: HTMLElement;

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
    }
  }

  clear(): void {
    this.entries = [];
    for (const n of this.nodes) n.remove();
    this.nodes = [];
    this.unread = 0;
    this.renderBadge();
    this.empty.style.display = '';
  }

  /** Add entries oldest-first. `animate` is false for a bulk fill. */
  add(items: ChronicleEntry[], animate = true): void {
    if (!items.length) return;
    this.empty.style.display = 'none';
    for (const it of items) {
      this.entries.push(it);
      const node = this.build(it, animate);
      this.nodes.push(node);
      this.list.insertBefore(node, this.list.firstChild);
    }
    // keep memory and DOM bounded
    while (this.entries.length > MAX_ENTRIES) this.entries.shift();
    while (this.nodes.length > MAX_VISIBLE) this.nodes.shift()?.remove();
    this.refreshYears();
    if (this.collapsed) {
      this.unread += items.length;
      this.renderBadge();
    }
  }

  private renderBadge(): void {
    this.badge.classList.toggle('is-on', this.unread > 0);
    setText(this.badge, this.unread > 9 ? '9+' : String(this.unread));
  }

  /** Show the year only on the first (newest) entry of each year, like a timeline. */
  private refreshYears(): void {
    let prev = -1;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const y = Number(n.dataset.year);
      const show = y !== prev;
      prev = y;
      const label = n.querySelector('.tg-ent-y');
      if (label) setText(label, show ? String(y) : '');
      n.classList.toggle('has-year', show);
    }
  }

  private build(it: ChronicleEntry, animate: boolean): HTMLElement {
    const flyable = it.x !== 0 || it.y !== 0;
    const spColor = it.sp >= 0 && it.sp < 6 ? `var(--sp-${it.sp})` : 'var(--paper-dim)';
    const inner = [
      h('span', { class: 'tg-ent-y', 'aria-hidden': 'true' }),
      h('span', { class: 'tg-ent-node', 'aria-hidden': 'true' }),
      h('span', { class: 'tg-ent-t' }, h('span', { class: 'tg-sr', text: `Year ${it.year}: ` }), it.sentence),
    ];
    const cls = `tg-ent${flyable ? ' is-flyable' : ''}${it.major ? ' is-major' : ''}${animate ? ' is-new' : ''}`;
    const body = flyable
      ? button({ class: 'tg-ent-b', title: 'Fly the camera there', onclick: () => this.flyTo(it.x, it.y) }, ...inner)
      : h('div', { class: 'tg-ent-b' }, ...inner);
    return h('div', { class: cls, role: 'listitem', dataset: { year: String(it.year) }, style: `--node:${spColor}` }, body);
  }
}
