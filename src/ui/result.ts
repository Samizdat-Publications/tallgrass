// The result card: shown in the chapter-card style when a challenge is won or lost. The sim is paused behind it.
import { button, h } from './dom';

export interface ResultCopy {
  won: boolean;
  title: string;
  reason: string;
  /** The challenge name, years taken and interventions used, as one line. */
  stat: string;
}

export class ResultCard {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private reason: HTMLElement;
  private stat: HTMLElement;
  private again: HTMLButtonElement;
  private on = false;

  constructor(onTryAgain: () => void, onKeepWatching: () => void) {
    this.title = h('h2', { class: 'tg-result-title' });
    this.reason = h('p', { class: 'tg-result-reason' });
    this.stat = h('p', { class: 'tg-result-stat' });
    this.again = button({ class: 'tg-btn is-primary tg-result-btn', text: 'Try again', onclick: onTryAgain });
    const keep = button({ class: 'tg-btn tg-glass tg-result-btn', text: 'Keep watching', onclick: onKeepWatching });
    this.el = h(
      'div',
      { class: 'tg-result', role: 'dialog', 'aria-label': 'Challenge result' },
      h(
        'div',
        { class: 'tg-result-in' },
        this.title,
        h('div', { class: 'tg-chapter-rule' }),
        this.reason,
        this.stat,
        h('div', { class: 'tg-result-actions' }, this.again, keep),
      ),
    );
  }

  get isOpen(): boolean {
    return this.on;
  }

  show(c: ResultCopy): void {
    this.title.textContent = c.title;
    this.reason.textContent = c.reason;
    this.stat.textContent = c.stat;
    this.el.classList.toggle('is-won', c.won);
    this.el.classList.toggle('is-lost', !c.won);
    this.on = true;
    this.el.classList.add('is-on');
    // the primary choice takes the focus so Enter works at once
    window.setTimeout(() => this.again.focus({ preventScroll: true }), 60);
  }

  hide(): void {
    this.on = false;
    this.el.classList.remove('is-on');
  }
}
