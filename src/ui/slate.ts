// Top-left location slate: place and year, then season, time of day and weather. Text only, like a documentary slate.
import type { EnvState } from '../sim/types';
import { h, setText } from './dom';
import { seasonPhrase, skyWord, timeOfDay, type SkyView } from './describe';

export class Slate {
  readonly el: HTMLElement;
  private year: HTMLElement;
  private line: HTMLElement;

  constructor(place = 'Tallgrass Valley') {
    this.year = h('i', { class: 'tg-slate-year' });
    this.line = h('div', { class: 'tg-slate-line' });
    this.el = h(
      'div',
      { class: 'tg-slate tg-leaf', role: 'status', 'aria-live': 'off' },
      h('div', { class: 'tg-slate-place' }, place, ', ', this.year),
      this.line,
    );
  }

  update(env: EnvState, sky?: SkyView): void {
    setText(this.year, `year ${env.year + 1}`);
    setText(this.line, `${seasonPhrase(env.season)}, ${timeOfDay(env.dayFrac)}, ${skyWord(env, sky)}`);
  }
}
