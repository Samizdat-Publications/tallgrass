// A small, quiet legend for the species marks of the map view (render/glyphs.ts): a chip in the mark's own colour and shape, and the
// species' name, for each species that is in the valley now. It fades in and out with the marks themselves (UIFrame.glyphFade), and
// keeps to the bottom of the right-hand column, clear of the population strip, the time bar and the chronicle.
import { SPECIES } from '../sim/species';
import { glyphColor, glyphIsDiamond } from '../render/glyphs';
import { h } from './dom';

/** Short names for the legend, where the full name would crowd it. */
const SHORT: Record<string, string> = { eagle: 'Eagle', hawk: 'Hawk', prairiedog: 'Prairie dog' };

export interface GlyphLegendEntry {
  sp: number;
  name: string;
  color: string;
  diamond: boolean;
}

/** The species that have a mark on the map (individual animals) and are alive now, in registry order. */
export function glyphLegendEntries(pop: ArrayLike<number>): GlyphLegendEntry[] {
  const out: GlyphLegendEntry[] = [];
  for (const s of SPECIES) {
    if (s.repr !== 'agent' || !((pop[s.id] ?? 0) > 0)) continue;
    out.push({ sp: s.id, name: SHORT[s.key] ?? s.name, color: glyphColor(s), diamond: glyphIsDiamond(s.key) });
  }
  return out;
}

export class GlyphLegend {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private sig = '';
  private shown = -1;
  private on = false;

  constructor() {
    this.list = h('div', { class: 'tg-gl-list' });
    this.el = h(
      'aside',
      { class: 'tg-glegend tg-leaf', role: 'group', 'aria-label': 'Map legend: the colour of each species mark', hidden: '' },
      h('div', { class: 'tg-gl-title', text: 'On the map' }),
      this.list,
    );
  }

  /** Called every frame: `fade` is the marks' fade (0..1), `pop` the live counts by species id. */
  update(fade: number, pop: ArrayLike<number>): void {
    const on = fade > 0.02;
    if (on !== this.on) {
      this.on = on;
      this.el.hidden = !on;
      if (!on) this.shown = -1;
    }
    if (!on) return;
    const q = Math.round(fade * 50) / 50;
    if (q !== this.shown) {
      this.shown = q;
      this.el.style.setProperty('--gl', String(q));
    }
    const entries = glyphLegendEntries(pop);
    const sig = entries.map((e) => e.sp).join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.dataset.count = String(entries.length);
    this.list.replaceChildren(
      ...entries.map((e) =>
        h('span', { class: 'tg-gl-row' }, h('i', { class: `tg-gl-chip${e.diamond ? ' is-diamond' : ''}`, style: `--c:${e.color}`, 'aria-hidden': 'true' }), e.name),
      ),
    );
  }
}
