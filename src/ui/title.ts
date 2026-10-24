// The title card: the front door, drawn over the live valley. Watch, Challenges, New valley, Field guide. After Watch,
// three first-run tips appear once. Neither shows when a tool drives the page (see titleWanted).
import { button, h } from './dom';
import { readFlag, writeFlag } from './store';

export const TIPS_KEY = 'tallgrass.tips.v1';

/**
 * Should this page load open on the title card? Only a plain visit. A page opened with a world already chosen (a seed, a
 * scenario, a challenge, a share code, dev parameters), with the documentary camera off, or by an automated browser (the
 * capture tools) goes straight to the valley. ?title=1 forces the card on, ?notitle=1 forces it off.
 */
export function titleWanted(search: string, webdriver: boolean): boolean {
  const q = new URLSearchParams(search);
  if (q.get('notitle') === '1') return false;
  if (q.get('title') === '1') return true;
  if (webdriver) return false;
  for (const k of ['w', 'seed', 'scenario', 'challenge', 'p', 'cam', 'speed', 'autoscale']) if (q.has(k)) return false;
  return q.get('autocam') !== '0';
}

export interface TitleChoice {
  id: string;
  name: string;
  blurb: string;
  meta: string;
}

export interface TitleActions {
  onWatch(): void;
  onChallenge(id: string): void;
  onSetup(): void;
  onGuide(): void;
}

export class TitleCard {
  readonly el: HTMLElement;
  private main: HTMLElement;
  private list: HTMLElement;
  private inner: HTMLElement;
  private scroller: HTMLElement;
  private watchBtn: HTMLButtonElement;
  private open = false;
  private onKey: (e: KeyboardEvent) => void;

  constructor(private actions: TitleActions, challenges: TitleChoice[]) {
    this.watchBtn = button({ class: 'tg-btn is-primary tg-title-btn', text: 'Watch', onclick: () => this.actions.onWatch() });
    this.main = h(
      'div',
      { class: 'tg-title-actions' },
      this.watchBtn,
      button({ class: 'tg-btn tg-title-btn', text: 'Challenges', onclick: () => this.showList(true) }),
      button({ class: 'tg-btn tg-title-btn', text: 'New valley', onclick: () => this.actions.onSetup() }),
      button({ class: 'tg-btn tg-title-btn', text: 'Field guide', onclick: () => this.actions.onGuide() }),
    );
    const items = challenges.map((c) =>
      button(
        { class: 'tg-sc tg-title-sc', onclick: () => this.actions.onChallenge(c.id) },
        h('span', { class: 'tg-sc-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tg-sc-text' }, h('span', { class: 'tg-sc-name', text: c.name }), h('span', { class: 'tg-sc-blurb', text: c.blurb }), h('span', { class: 'tg-sc-meta', text: c.meta })),
      ),
    );
    // the list scrolls inside its own card (the head stays put), so a short screen can still reach every challenge
    this.scroller = h('div', { class: 'tg-title-scroll' }, ...items);
    this.list = h(
      'div',
      { class: 'tg-title-list tg-glass', hidden: true },
      h('div', { class: 'tg-title-listhead' }, h('span', { class: 'tg-menu-h', text: 'Challenges' }), button({ class: 'tg-notes-clear', text: 'Back', onclick: () => this.showList(false) })),
      this.scroller,
    );
    // the wheel over the list scrolls the list; it never reaches the valley's zoom behind the card
    this.list.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.inner = h(
      'div',
      { class: 'tg-title-in' },
      h('h1', { class: 'tg-title-name', text: 'Tallgrass' }),
      h('div', { class: 'tg-title-rule' }),
      h('p', { class: 'tg-title-sub', text: 'A living prairie finds its own balance.' }),
      this.main,
      this.list,
      h('p', { class: 'tg-title-wait', 'aria-hidden': 'true' }, h('span', { text: 'Preparing the valley' }), h('span', { class: 'tg-title-wait-rule' }, h('i'))),
    );
    this.el = h('div', { class: 'tg-title', role: 'dialog', 'aria-label': 'Tallgrass', hidden: true }, this.inner);
    this.onKey = (e) => {
      if (!this.open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') {
        // Enter on a focused button presses that button; Space (which would pause the valley behind the card) means Watch
        if (e.key === 'Enter' && (e.target as HTMLElement | null)?.closest?.('.tg-title button')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.actions.onWatch();
      } else if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (!this.list.hidden) this.showList(false);
        else this.actions.onWatch();
      } else if (!this.list.hidden && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {
        // the list is a column of buttons: the arrow keys walk it (focus scrolls the item into view), Page keys jump a screenful
        e.preventDefault();
        e.stopImmediatePropagation();
        this.walkList(e.key);
      }
    };
    window.addEventListener('keydown', this.onKey, true);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-on');
    this.watchBtn.focus({ preventScroll: true });
    // the splash poster under the card (index.html) hands its "preparing" line over to the card's own
    document.documentElement.classList.add('tg-title-up');
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('is-on');
    document.documentElement.classList.remove('tg-title-up');
    this.showList(false);
    window.setTimeout(() => {
      if (!this.open) this.el.hidden = true;
    }, 700);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey, true);
  }

  private showList(on: boolean): void {
    this.list.hidden = !on;
    this.main.hidden = on;
    this.inner.classList.toggle('is-list', on);
    if (on) this.scroller.scrollTop = 0;
    // keyboard focus follows the view: the first challenge when the list opens, the Challenges button when it closes
    if (this.open) {
      if (on) (this.scroller.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
      else (this.main.children[1] as HTMLElement | undefined)?.focus({ preventScroll: true });
    }
  }

  private walkList(key: string): void {
    const items = Array.from(this.scroller.querySelectorAll<HTMLElement>('button'));
    if (!items.length) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const page = Math.max(1, Math.floor(this.scroller.clientHeight / Math.max(1, items[0].offsetHeight)) - 1);
    let i = cur < 0 ? 0 : cur;
    if (key === 'ArrowDown') i = cur < 0 ? 0 : i + 1;
    else if (key === 'ArrowUp') i = cur < 0 ? 0 : i - 1;
    else if (key === 'PageDown') i += page;
    else if (key === 'PageUp') i -= page;
    else if (key === 'Home') i = 0;
    else if (key === 'End') i = items.length - 1;
    items[Math.max(0, Math.min(items.length - 1, i))].focus();
  }
}

/** One tip is a full sentence or two; a `{ k }` part is a key, drawn as a small chip inside the sentence. */
type TipPart = string | { k: string };
const TIPS: TipPart[][] = [
  [{ k: 'Click' }, ' an animal to follow its life. Press ', { k: 'F' }, ' to ride along with it.'],
  [{ k: '1' }, ', ', { k: '2' }, ' and ', { k: '3' }, ' change the speed of time. ', { k: 'Space' }, ' pauses, ', { k: 'N' }, ' skips to the next event.'],
  [{ k: 'C' }, ' starts documentary mode. ', { k: 'H' }, ' hides the interface for a clean view.'],
];

/** Three quiet tips after the first Watch, shown once per browser and dismissed with a click, Esc or Enter. */
export class FirstRunTips {
  readonly el: HTMLElement;
  private open = false;
  private onKey: (e: KeyboardEvent) => void;

  constructor() {
    this.el = h(
      'div',
      { class: 'tg-tips tg-glass tg-leaf', role: 'dialog', 'aria-label': 'Three tips', hidden: true },
      h('h2', { class: 'tg-menu-h', text: 'Three things to try' }),
      h(
        'ol',
        { class: 'tg-tips-list' },
        ...TIPS.map((parts) => h('li', {}, ...parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : h('kbd', { class: 'tg-kbd', text: p.k }))))),
      ),
      button({ class: 'tg-btn is-primary tg-tips-ok', text: 'Got it', onclick: () => this.hide() }),
    );
    this.onKey = (e) => {
      if (this.open && (e.key === 'Escape' || (e.key === 'Enter' && !(e.target as HTMLElement | null)?.closest?.('button')))) {
        e.stopImmediatePropagation();
        this.hide();
      }
    };
    window.addEventListener('keydown', this.onKey, true);
  }

  /** True when this browser has not seen the tips yet. */
  static wanted(): boolean {
    return !readFlag(TIPS_KEY);
  }

  show(): void {
    writeFlag(TIPS_KEY);
    this.open = true;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-on');
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('is-on');
    window.setTimeout(() => {
      if (!this.open) this.el.hidden = true;
    }, 400);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey, true);
  }
}
