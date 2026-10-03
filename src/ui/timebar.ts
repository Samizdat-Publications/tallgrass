// Bottom center: pause, 1x, 10x, 100x, next event, with the sim rate. Plus the overlays dropdown to its right.
import { button, h, setText } from './dom';
import { TICKS_PER_SECOND, YEAR_TICKS } from '../sim/types';
import { icon } from './icons';
import type { OverlayId, UIActions } from './types';

const SPEEDS = [1, 10, 100];

/** Plain-language pace of the valley's calendar: "1 year every 4 min", "1 year every 24 s", "1 year every 2.4 s". */
export function paceText(ticksPerSec: number, speed: number): string {
  let tps = ticksPerSec;
  // within a few percent of the nominal rate, show the nominal one so the text does not flicker
  const nominal = speed * TICKS_PER_SECOND;
  if (nominal > 0 && Math.abs(tps - nominal) / nominal < 0.06) tps = nominal;
  if (!(tps > 0)) return '';
  const sec = YEAR_TICKS / tps;
  if (sec >= 90) {
    const m = sec / 60;
    const t = Math.abs(m - Math.round(m)) < 0.05 || m >= 10 ? String(Math.round(m)) : m.toFixed(1);
    return `1 year every ${t} min`;
  }
  if (sec >= 10) return `1 year every ${Math.round(sec)} s`;
  return `1 year every ${sec.toFixed(1)} s`;
}

const OVERLAYS: { id: OverlayId; label: string; blurb: string }[] = [
  { id: 'none', label: 'No overlay', blurb: 'Just the prairie' },
  { id: 'vegetation', label: 'Vegetation', blurb: 'Where the grass is thick or thin' },
  { id: 'fear', label: 'Landscape of fear', blurb: 'Where the herds feel unsafe' },
  { id: 'territory', label: 'Territories', blurb: 'Pack ranges and dens' },
  { id: 'traits', label: 'Trait heatmap', blurb: 'Where the fastest bodies live' },
];

export class TimeBar {
  readonly el: HTMLElement;
  readonly overlayEl: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private speedBtns = new Map<number, HTMLButtonElement>();
  private nextBtn: HTMLButtonElement;
  private rate: HTMLElement;

  /** -99 = nothing drawn yet, so the very first frame always renders the active state. */
  private shown = -99;
  private lastRunSpeed = 1;
  private optimistic: { v: number; until: number } | null = null;
  private lastRateText = '';

  private overlayBtn: HTMLButtonElement;
  private overlayLabel: HTMLElement;
  private overlayMenu: HTMLElement;
  private overlayItems = new Map<OverlayId, HTMLButtonElement>();
  private overlay: OverlayId = 'none';
  private menuOpen = false;
  private onDocDown: (e: PointerEvent) => void;

  constructor(private actions: UIActions) {
    this.pauseBtn = button({
      class: 'tg-tbtn',
      title: 'Pause or resume (Space)',
      'aria-label': 'Pause',
      'aria-pressed': 'false',
      html: icon('pause', 18),
      onclick: () => this.togglePause(),
    });
    const group = h('div', { class: 'tg-time tg-glass tg-leaf', role: 'group', 'aria-label': 'Time' }, this.pauseBtn);
    SPEEDS.forEach((s, i) => {
      const b = button({
        class: 'tg-tbtn tg-tspeed',
        title: `${s} times speed (${i + 1})`,
        'aria-label': `${s} times speed`,
        'aria-pressed': 'false',
        text: `${s}×`,
        onclick: () => this.setSpeed(s),
      });
      this.speedBtns.set(s, b);
      group.append(b);
    });
    group.append(h('span', { class: 'tg-tsep', 'aria-hidden': 'true' }));
    this.nextBtn = button(
      { class: 'tg-tbtn tg-tnext', title: 'Skip to the next event (N)', 'aria-pressed': 'false', onclick: () => this.skip() },
      h('span', { class: 'tg-tnext-ic', html: icon('next', 16) }),
      h('span', { class: 'tg-tnext-text', text: 'Next event' }),
    );
    group.append(this.nextBtn);
    this.rate = h('span', { class: 'tg-trate', title: 'How fast the valley calendar is running right now' });
    group.append(this.rate);
    this.el = group;

    // overlays dropdown
    this.overlayLabel = h('span', { class: 'tg-ov-label', text: 'Overlays' });
    this.overlayBtn = button(
      {
        class: 'tg-ov-btn tg-glass tg-leaf',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        title: 'Map overlays',
        onclick: () => this.toggleMenu(),
      },
      h('span', { class: 'tg-ov-ic', html: icon('layers', 18) }),
      this.overlayLabel,
      h('span', { class: 'tg-ov-caret', html: icon('chevronUp', 14) }),
    );
    this.overlayMenu = h('div', { class: 'tg-ov-menu tg-glass', role: 'menu', 'aria-label': 'Overlays' });
    for (const o of OVERLAYS) {
      const item = button(
        { class: 'tg-ov-item', role: 'menuitemradio', 'aria-checked': o.id === 'none' ? 'true' : 'false', onclick: () => this.chooseOverlay(o.id) },
        h('span', { class: 'tg-ov-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tg-ov-text' }, h('span', { class: 'tg-ov-name', text: o.label }), h('span', { class: 'tg-ov-blurb', text: o.blurb })),
      );
      this.overlayItems.set(o.id, item);
      this.overlayMenu.append(item);
    }
    this.overlayEl = h('div', { class: 'tg-overlay' }, this.overlayBtn, this.overlayMenu);
    this.onDocDown = (e) => {
      if (this.menuOpen && !this.overlayEl.contains(e.target as Node)) this.closeMenu();
    };
    document.addEventListener('pointerdown', this.onDocDown);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocDown);
  }

  // ---- speed -------------------------------------------------------------------------------------------------

  setSpeed(v: number): void {
    this.optimistic = { v, until: performance.now() + 700 };
    if (v > 0) this.lastRunSpeed = v;
    this.render(v);
    this.actions.setSpeed(v);
  }

  /** Space: pause when running (or skipping), resume at the last speed when paused. */
  togglePause(): void {
    if (this.shown === 0) this.setSpeed(this.lastRunSpeed || 1);
    else this.setSpeed(0);
  }

  skip(): void {
    this.optimistic = { v: -1, until: performance.now() + 700 };
    this.render(-1);
    this.actions.skipToEvent();
  }

  /** Called every frame with the authoritative speed from the sim. */
  update(speed: number, ticksPerSec: number, now: number): void {
    let v = speed;
    if (this.optimistic) {
      if (this.optimistic.v === speed || now > this.optimistic.until) this.optimistic = null;
      else v = this.optimistic.v;
    }
    if (v !== this.shown) this.render(v);
    if (speed > 0) this.lastRunSpeed = speed;
    let text: string;
    if (v === 0) text = 'paused';
    else if (v < 0) text = 'skipping ahead';
    else {
      text = paceText(ticksPerSec, v);
    }
    if (text !== this.lastRateText) {
      this.lastRateText = text;
      setText(this.rate, text);
    }
  }

  private render(v: number): void {
    this.shown = v;
    this.pauseBtn.setAttribute('aria-pressed', v === 0 ? 'true' : 'false');
    for (const [s, b] of this.speedBtns) b.setAttribute('aria-pressed', v === s ? 'true' : 'false');
    this.nextBtn.setAttribute('aria-pressed', v < 0 ? 'true' : 'false');
  }

  // ---- overlays ----------------------------------------------------------------------------------------------

  private toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  openMenu(): void {
    this.menuOpen = true;
    this.overlayEl.classList.add('is-open');
    this.overlayBtn.setAttribute('aria-expanded', 'true');
  }

  closeMenu(): void {
    this.menuOpen = false;
    this.overlayEl.classList.remove('is-open');
    this.overlayBtn.setAttribute('aria-expanded', 'false');
  }

  get isMenuOpen(): boolean {
    return this.menuOpen;
  }

  private chooseOverlay(o: OverlayId): void {
    this.overlay = o;
    for (const [id, b] of this.overlayItems) b.setAttribute('aria-checked', id === o ? 'true' : 'false');
    const def = OVERLAYS.find((x) => x.id === o);
    setText(this.overlayLabel, o === 'none' || !def ? 'Overlays' : def.label);
    this.overlayBtn.classList.toggle('is-on', o !== 'none');
    this.actions.setOverlay(o);
    this.closeMenu();
    this.overlayBtn.focus();
  }

  get currentOverlay(): OverlayId {
    return this.overlay;
  }
}
