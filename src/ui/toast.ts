// A quiet one-line toast at the bottom centre: "Valley link copied", "Field guide: wolf, stalking". One at a time; a new one
// replaces the old.
import { h } from './dom';

export class Toast {
  readonly el: HTMLElement;
  private label: HTMLElement;
  private text: HTMLElement;
  private timer = 0;

  constructor() {
    this.label = h('span', { class: 'tg-toast-label' });
    this.text = h('span', { class: 'tg-toast-text' });
    this.el = h('div', { class: 'tg-toast tg-glass tg-leaf', role: 'status', 'aria-live': 'polite' }, this.label, this.text);
  }

  /** True while a toast is up (a passing note does not talk over a message that is still being read). */
  get showing(): boolean {
    return this.el.classList.contains('is-on');
  }

  /** Show `text` (with an optional small label before it) for `ms`. */
  show(text: string, label = '', ms = 3200): void {
    this.label.textContent = label;
    this.label.hidden = !label;
    this.text.textContent = text;
    this.el.classList.add('is-on');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.el.classList.remove('is-on');
  }
}
