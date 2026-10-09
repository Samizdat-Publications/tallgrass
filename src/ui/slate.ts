// Top-left location slate: place and year, then season, time of day and weather. Text only, like a documentary slate.
import type { EnvState } from '../sim/types';
import { h, setText } from './dom';
import { climateWord, seasonPhrase, skyWord, timeOfDay, type SkyView } from './describe';

export class Slate {
  readonly el: HTMLElement;
  private year: HTMLElement;
  private line: HTMLElement;
  private text: HTMLElement;
  /** The wet or dry run of years, shown only when it matters (climate regimes); empty in ordinary years and with the param off. */
  private clim: HTMLElement;
  private climShown = '';

  constructor(place = 'Tallgrass Valley') {
    this.year = h('i', { class: 'tg-slate-year' });
    this.text = h('span', { class: 'tg-slate-text' });
    this.clim = h('span', { class: 'tg-slate-clim', hidden: '' });
    this.line = h('div', { class: 'tg-slate-line' }, this.text, this.clim);
    this.el = h(
      'div',
      { class: 'tg-slate tg-leaf', role: 'status', 'aria-live': 'off' },
      h('div', { class: 'tg-slate-place' }, place, ', ', this.year),
      this.line,
    );
  }

  update(env: EnvState, sky?: SkyView): void {
    setText(this.year, `year ${env.year + 1}`);
    setText(this.text, sky?.lapse ? `${seasonPhrase(env.season)}, ${skyWord(env, sky)}` : `${seasonPhrase(env.season)}, ${timeOfDay(env.dayFrac)}, ${skyWord(env, sky)}`);
    const word = climateWord(sky, this.climShown);
    if (word !== this.climShown) {
      this.climShown = word;
      this.clim.hidden = word === '';
      this.clim.className = `tg-slate-clim ${word === 'Wet years' ? 'is-wet' : word === 'Megadrought' ? 'is-mega' : 'is-dry'}`;
      setText(this.clim, word);
    }
  }
}
