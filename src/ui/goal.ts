// The goal card: a compact glass card under the location slate while a challenge runs.
import { button, h, setText } from './dom';
import { icon } from './icons';
import type { ChallengeRun } from './challenge';

export class GoalCard {
  readonly el: HTMLElement;
  private name: HTMLElement;
  private list: HTMLElement;
  private progress: HTMLElement;
  private toolsText: HTMLElement;
  private pips: HTMLElement;
  private toolsRow: HTMLElement;
  private resultRow: HTMLElement;
  private head: HTMLButtonElement;
  private collapsed = false;
  private built = '';
  private lastProgress = '';
  private lastLeft = -2;
  private lastState = '';

  constructor(private onTryAgain: () => void) {
    this.name = h('span', { class: 'tg-goal-name' });
    this.head = button(
      { class: 'tg-goal-head', 'aria-expanded': 'true', title: 'Show or hide the goals', onclick: () => this.setCollapsed(!this.collapsed) },
      h('span', { class: 'tg-goal-kicker', text: 'Challenge' }),
      this.name,
      h('span', { class: 'tg-goal-caret', html: icon('chevronDown', 16) }),
    );
    this.list = h('ul', { class: 'tg-goal-list' });
    this.progress = h('p', { class: 'tg-goal-progress', 'aria-live': 'polite' });
    this.toolsText = h('span', { class: 'tg-goal-tools-text' });
    this.pips = h('span', { class: 'tg-pips', 'aria-hidden': 'true' });
    this.toolsRow = h('div', { class: 'tg-goal-tools' }, this.toolsText, this.pips);
    this.resultRow = h('div', { class: 'tg-goal-result' }, button({ class: 'tg-btn', text: 'Try again', onclick: () => this.onTryAgain() }));
    this.el = h('aside', { class: 'tg-goal tg-glass tg-leaf', 'aria-label': 'Challenge', hidden: true }, this.head, this.list, this.progress, this.toolsRow, this.resultRow);
  }

  setCollapsed(c: boolean): void {
    this.collapsed = c;
    this.el.classList.toggle('is-collapsed', c);
    this.head.setAttribute('aria-expanded', String(!c));
  }

  /** Show or hide the card for a run (null hides it). */
  setRun(run: ChallengeRun | null): void {
    this.el.hidden = !run;
    this.built = '';
    this.lastLeft = -2;
    this.lastProgress = '';
    this.lastState = '';
    if (run) this.update(run);
  }

  update(run: ChallengeRun): void {
    const c = run.challenge;
    if (this.built !== c.id) {
      this.built = c.id;
      setText(this.name, c.name);
      this.list.replaceChildren(...c.goals.map((g) => h('li', { text: g })));
      // the goal list starts folded on short screens so the rail below keeps its room
      this.setCollapsed(typeof window !== 'undefined' && window.innerHeight < 800);
      this.pips.replaceChildren(...Array.from({ length: c.maxTools ?? 0 }, () => h('i', { class: 'tg-pip' })));
      this.toolsRow.style.display = c.maxTools === null ? 'none' : '';
    }
    const st = run.result ?? run.status;
    const progress = st.state === 'running' ? st.progress : st.reason ?? st.progress;
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      setText(this.progress, progress);
    }
    const state = run.result ? run.result.state : 'running';
    const stateChanged = state !== this.lastState;
    if (stateChanged) {
      this.lastState = state;
      this.el.classList.toggle('is-won', state === 'won');
      this.el.classList.toggle('is-lost', state === 'lost');
      this.el.classList.toggle('is-over', state !== 'running');
    }
    const left = run.left;
    const l = left === null ? -1 : left;
    if (l !== this.lastLeft || stateChanged) {
      this.lastLeft = l;
      if (left !== null) {
        const max = c.maxTools as number;
        const text = run.finished
          ? `${run.toolsUsed} of ${max} interventions used`
          : left === 0
            ? 'No interventions left'
            : `Interventions left: ${left} of ${max}`;
        setText(this.toolsText, text);
        this.toolsRow.classList.toggle('is-empty', left === 0 && !run.finished);
        Array.from(this.pips.children).forEach((p, i) => p.classList.toggle('is-on', i < left));
      }
    }
  }
}
