// A centred glass page, the shape the field notes, settings, valley setup and field guide share: a title, a close button,
// a scrolling body. Opens and closes the same way the notebook does, and closes on a click outside it.
import { button, h } from './dom';
import { icon } from './icons';

export interface PanelOptions {
  /** Accessible name and heading. */
  title: string;
  /** One quiet line under the heading. */
  sub?: string;
  /** A wider page (the field guide). */
  wide?: boolean;
  /** Extra class for the page, so each panel can style its own body. */
  cls?: string;
  /** Called when the close button or a click outside asks for the page to close. */
  onClose: () => void;
}

export class ModalPanel {
  readonly el: HTMLElement;
  /** Where subclasses put their content. */
  protected readonly body: HTMLElement;
  /** Right of the title in the header (counts, small buttons). */
  protected readonly headExtra: HTMLElement;
  private open = false;
  private closeTimer = 0;
  private onDocDown: (e: PointerEvent) => void;

  constructor(protected readonly opts: PanelOptions) {
    this.headExtra = h('span', { class: 'tg-pane-extra' });
    this.body = h('div', { class: 'tg-pane-body' });
    this.el = h(
      'section',
      { class: `tg-pane tg-glass tg-leaf${opts.wide ? ' is-wide' : ''}${opts.cls ? ' ' + opts.cls : ''}`, role: 'dialog', 'aria-label': opts.title, hidden: true },
      h(
        'header',
        { class: 'tg-pane-head' },
        h('h2', { class: 'tg-pane-title', text: opts.title }),
        this.headExtra,
        button({ class: 'tg-iconbtn', 'aria-label': `Close ${opts.title.toLowerCase()}`, title: 'Close (Esc)', html: icon('close', 16), onclick: () => opts.onClose() }),
      ),
      opts.sub ? h('p', { class: 'tg-pane-sub', text: opts.sub }) : null,
      this.body,
    );
    this.onDocDown = (e) => {
      if (!this.open) return;
      const t = e.target as HTMLElement | null;
      if (this.el.contains(t)) return;
      // the menu and the buttons that open pages are not "outside": they hand over to the next page themselves
      if (t?.closest?.('.tg-menu, .tg-menubtn, .tg-title, .tg-shutter')) return;
      opts.onClose();
    };
    document.addEventListener('pointerdown', this.onDocDown);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    window.clearTimeout(this.closeTimer);
    this.open = true;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-open');
    this.onShow();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('is-open');
    this.onHide();
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      if (!this.open) this.el.hidden = true;
    }, 200);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocDown);
    window.clearTimeout(this.closeTimer);
  }

  /** Hooks for subclasses. */
  protected onShow(): void {}
  protected onHide(): void {}
}
