// Bottom left: population. A strip of sparklines with counts that expands to a full chart over the whole history.
import { SPECIES_COUNT, SPECIES_KEYS, SPECIES_NAMES, YEAR_TICKS } from '../sim/types';
import type { HistoryRow } from '../sim/worker';
import { button, h, setText, unitPx } from './dom';
import { fmtInt, seasonOfTick, seasonPhraseAt, yearOfTick } from './describe';
import { awayRows, awayState, awayText, holdAway, isMigrant, type AwayState } from './away';
import { icon } from './icons';
import { PAPER_DIM, SANS, SPECIES_COLORS } from './palette';
import { fillSolidRuns, hexA, strokeWithGaps } from './chartutil';
import { drawRows, rowsPlot } from './rows';
import { HERO, drawEvolution, evoTipRows, fmtPct, latest, type EvoData } from './evo';
import { TRAIT_COUNT } from './traits';

export interface Marker {
  tick: number;
  sentence: string;
  /** Events that earned a chapter card get a gold diamond. */
  major: boolean;
}

interface Cell {
  sp: number;
  el: HTMLElement;
  count: HTMLElement;
  canvas: HTMLCanvasElement;
  lastText: string;
  /** Set while a visiting species is out of the valley for its season: the card reads "away for the summer" instead of a zero. */
  away: AwayState;
  /** The count as shown: eases toward the real count while the sim runs fast. */
  shown: number;
  /** The sparkline's vertical range, eased between redraws while the sim runs fast. */
  yMin: number;
  yMax: number;
  hover: boolean;
  tip: string;
}

/** How fast the sim runs, as far as the panel is concerned: 1x and slower are live, 10x is fast, 100x and skipping is a time-lapse. */
type Pace = 'live' | 'fast' | 'lapse';
const paceOf = (speed: number): Pace => (speed < 0 || speed >= 100 ? 'lapse' : speed >= 10 ? 'fast' : 'live');
/**
 * How often the numbers and the sparklines refresh at each pace (milliseconds), how far a number moves toward its real value on each
 * refresh, and how many history rows one sparkline point averages. Live (1x) is the original behaviour: numbers every frame, drawing about 8 Hz.
 */
const PACE = {
  live: { num: 0, draw: 125, ease: 1, bin: 1 },
  fast: { num: 250, draw: 200, ease: 0.45, bin: 4 },
  lapse: { num: 500, draw: 250, ease: 0.35, bin: 6 },
} as const;
/** A sparkline never spans less than this fraction of the window's mean (each side), so a wolf count of 18 to 17 stays a flat line. */
const SPARK_MIN_HALF = 0.25;

const SPARK_YEARS = 8;
/** Ticks to years. */
const toYears = (ticks: number): number => ticks / YEAR_TICKS;
/** Species that always get a graph row (bison, wolf, raven). Every other species, current or future, only gets one once it has been alive. */
const ALWAYS_SHOWN_KEYS = new Set(['bison', 'wolf', 'raven']);
const alwaysShown = (sp: number): boolean => ALWAYS_SHOWN_KEYS.has(SPECIES_KEYS[sp] ?? '');

export class PopGraph {
  readonly el: HTMLElement;

  // history, kept in full; drawing downsamples
  private ticks: number[] = [];
  private pops: number[][] = Array.from({ length: SPECIES_COUNT }, () => []);
  private grass: number[] = [];
  private grassMax = 1;
  /** Climate regime index per history row, 1 where a megadrought holds, and whether any row was non-zero (the graph shows its band only then). */
  private climate: number[] = [];
  private mega: number[] = [];
  private climateAny = false;
  /** Which kinds of year the band has shown so far, for its key in the expanded header. */
  private keySeen = { wet: false, dry: false, mega: false };
  /** Which species have a card (the founders, this valley's slots, and anything that has been alive). Cards keep registry order for good. */
  private seen: boolean[] = Array.from({ length: SPECIES_COUNT }, (_, i) => alwaysShown(i));
  /** Which species have ever had a nonzero count here (a visitor not yet arrived reads "arriving", one that has left reads "away"). */
  private alive: boolean[] = Array.from({ length: SPECIES_COUNT }, () => false);
  /** The species this valley can show (UIFrame.slots), each given its card from the first frame. */
  private slots: number[] = [];
  private markers: Marker[] = [];
  /** Mean heritable traits per history row, one array per trait (see traits.ts). NaN when absent. */
  private traitSeries: number[][] = Array.from({ length: TRAIT_COUNT }, () => []);
  private view: 'pop' | 'evo' = 'pop';

  // view state
  private expanded = false;
  /** Linear by default; L puts each row on a log scale. */
  private log = false;
  private on: boolean[] = Array.from({ length: SPECIES_COUNT }, () => true);
  private visible: number[] = [];
  private cells: Cell[] = [];
  private unit = 0;
  private dirty = true;
  private lastDraw = 0;
  private pace: Pace = 'live';
  private numAt = 0;
  private hoverX = -1;
  private hoverRaf = 0;

  // dom
  private cellsEl: HTMLElement;
  private chartWrap: HTMLElement;
  private chart: HTMLCanvasElement;
  private tip: HTMLElement;
  private chipsEl: HTMLElement;
  private logBtn: HTMLButtonElement;
  private expandBtn: HTMLButtonElement;
  private sub: HTMLElement;
  private climKey: HTMLElement;
  private tabBtns: Record<'pop' | 'evo', HTMLButtonElement>;
  private evoLegend: HTMLElement;
  private evoLegendText: HTMLElement[] = [];
  private ro: ResizeObserver;

  constructor() {
    this.cellsEl = h('div', { class: 'tg-cells' });
    this.sub = h('span', { class: 'tg-pop-sub', text: 'since the start' });
    this.climKey = h('span', { class: 'tg-pop-clim', hidden: '', 'aria-label': 'Key to the shaded bands behind the graph: the wet and dry years' });
    this.chipsEl = h('div', { class: 'tg-pop-chips', role: 'group', 'aria-label': 'Species shown on the graph, by name and colour' });
    this.logBtn = button({
      class: 'tg-btn tg-pop-log',
      text: 'Log',
      title: 'Logarithmic scale (L)',
      'aria-pressed': 'false',
      onclick: () => this.toggleLog(),
    });
    this.expandBtn = button({
      class: 'tg-iconbtn tg-pop-expand',
      title: 'Expand the graph (G)',
      'aria-label': 'Expand the graph',
      'aria-expanded': 'false',
      html: icon('expand', 16),
      onclick: () => this.toggleExpanded(),
    });
    const mkTab = (v: 'pop' | 'evo', label: string) =>
      button({
        class: 'tg-tab',
        role: 'tab',
        'aria-selected': String(v === 'pop'),
        tabindex: v === 'pop' ? '0' : '-1',
        text: label,
        onclick: () => this.setView(v),
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = v === 'pop' ? 'evo' : 'pop';
            this.setView(next);
            this.tabBtns[next].focus();
          }
        },
      });
    this.tabBtns = { pop: mkTab('pop', 'Population'), evo: mkTab('evo', 'Evolution') };
    const tabs = h('div', { class: 'tg-tabs', role: 'tablist', 'aria-label': 'Graph view' }, this.tabBtns.pop, this.tabBtns.evo);
    // legend for the evolution view: who is faster than the founders, right now
    this.evoLegend = h('div', { class: 'tg-pop-chips tg-evo-legend', 'aria-label': 'Mean speed against the founders' });
    for (const hh of HERO) {
      const t = h('span', { class: 'tg-evo-val' });
      this.evoLegendText.push(t);
      this.evoLegend.append(h('span', { class: 'tg-chip', style: `--c:var(--sp-${hh.sp})` }, h('i', { class: 'tg-dot' }), hh.name, t));
    }
    const head = h(
      'div',
      { class: 'tg-pop-head' },
      h('span', { class: 'tg-pop-title', text: 'Population' }),
      tabs,
      this.sub,
      this.climKey,
      this.evoLegend,
      h('span', { class: 'tg-grow' }),
      this.logBtn,
      this.expandBtn,
    );

    this.chart = h('canvas', { class: 'tg-chart', role: 'img', 'aria-label': 'Population of each species over time' });
    this.tip = h('div', { class: 'tg-tip', 'aria-hidden': 'true' });
    this.chartWrap = h('div', { class: 'tg-chart-wrap' }, this.chart, this.tip);
    this.chart.addEventListener('pointermove', (e) => this.onHover(e));
    this.chart.addEventListener('pointerleave', () => this.onHover(null));

    this.el = h('section', { class: 'tg-pop tg-glass tg-leaf', 'aria-label': 'Population', 'data-rows': '1', 'data-view': 'pop' }, head, this.chipsEl, this.cellsEl, this.chartWrap);

    this.ro = new ResizeObserver(() => {
      this.unit = unitPx(this.el);
      this.dirty = true;
      this.lastDraw = 0;
    });
    this.ro.observe(this.el);
    this.rebuildCells();
  }

  destroy(): void {
    this.ro.disconnect();
    cancelAnimationFrame(this.hoverRaf);
  }

  // ---- data --------------------------------------------------------------------------------------------------

  reset(): void {
    this.ticks = [];
    this.pops.forEach((p) => (p.length = 0));
    this.grass = [];
    this.grassMax = 1;
    this.climate = [];
    this.mega = [];
    this.climateAny = false;
    this.keySeen = { wet: false, dry: false, mega: false };
    this.setClimKey();
    this.markers = [];
    this.traitSeries.forEach((t) => (t.length = 0));
    this.alive = this.alive.map(() => false);
    this.seen = this.seen.map((_, i) => alwaysShown(i) || this.slots.includes(i));
    this.rebuildCells();
    this.dirty = true;
  }

  /** Give every species this valley can show its card now, in registry order, so no card moves when a species turns up later. */
  setSlots(slots: number[]): void {
    if (slots.length === this.slots.length && slots.every((s, i) => s === this.slots[i])) return;
    this.slots = slots.slice();
    for (const s of slots) if (s >= 0 && s < SPECIES_COUNT) this.seen[s] = true;
    this.rebuildCells();
  }

  addHistory(rows: HistoryRow[]): void {
    if (!rows.length) return;
    let seenChanged = false;
    for (const r of rows) {
      const last = this.ticks.length ? this.ticks[this.ticks.length - 1] : -1;
      if (r.tick <= last) continue; // out of order or duplicate
      this.ticks.push(r.tick);
      for (let s = 0; s < SPECIES_COUNT; s++) {
        const v = r.pop[s] ?? 0;
        this.pops[s].push(v);
        if (v > 0) {
          this.alive[s] = true;
          if (!this.seen[s]) {
            this.seen[s] = true;
            seenChanged = true;
          }
        }
      }
      this.grass.push(r.grass);
      const cl = r.climate ?? 0;
      this.climate.push(cl);
      this.mega.push(r.mega ?? 0);
      if (cl !== 0) this.climateAny = true;
      if (r.mega) this.keySeen.mega = true;
      else if (cl > 0.3) this.keySeen.wet = true;
      else if (cl < -0.3) this.keySeen.dry = true;
      if (r.grass > this.grassMax) this.grassMax = r.grass;
      for (let k = 0; k < TRAIT_COUNT; k++) this.traitSeries[k].push(r.traits?.[k] ?? NaN);
    }
    if (seenChanged) this.rebuildCells();
    this.setClimKey();
    this.dirty = true;
  }

  /** The key to the climate band (expanded graph, header): only the kinds of year it has shown. */
  private setClimKey(): void {
    const k = this.keySeen;
    const sig = `${+k.wet}${+k.dry}${+k.mega}`;
    if (this.climKey.dataset.sig === sig) return;
    this.climKey.dataset.sig = sig;
    this.climKey.hidden = !(k.wet || k.dry || k.mega);
    this.climKey.replaceChildren(
      ...([[k.wet, 'wet', 'wet years'], [k.dry, 'dry', 'dry years'], [k.mega, 'mega', 'megadrought']] as const)
        .filter(([on]) => on)
        .map(([, cls, label]) => h('span', { class: `tg-clim-k is-${cls}` }, h('i', { class: 'tg-clim-sw' }), label)),
    );
  }

  addMarkers(ms: Marker[]): void {
    if (!ms.length) return;
    this.markers.push(...ms);
    if (this.markers.length > 600) this.markers.splice(0, this.markers.length - 600);
    this.dirty = true;
  }

  // ---- view state --------------------------------------------------------------------------------------------

  /** The count of a species in the newest history row at or before `tick`, or null when there is none yet. */
  popAtOrBefore(sp: number, tick: number): number | null {
    const i = this.lowerBound(tick + 1) - 1;
    return i >= 0 ? (this.pops[sp]?.[i] ?? null) : null;
  }

  get isExpanded(): boolean {
    return this.expanded;
  }

  get isEvolution(): boolean {
    return this.view === 'evo';
  }

  /** Switch between the population chart and the evolution view of the expanded graph. */
  setView(v: 'pop' | 'evo'): void {
    this.view = v;
    this.el.dataset.view = v;
    for (const k of ['pop', 'evo'] as const) {
      this.tabBtns[k].setAttribute('aria-selected', String(k === v));
      this.tabBtns[k].tabIndex = k === v ? 0 : -1;
    }
    this.chart.setAttribute('aria-label', v === 'evo' ? 'Mean speed, size and coat of each species over time, against the founders' : 'Population of each species over time');
    this.tip.classList.remove('is-on');
    this.dirty = true;
    this.lastDraw = 0;
  }

  /** E key: open the graph on the evolution view, or flip between the two views when it is already open. */
  toggleEvolution(): void {
    if (!this.expanded) {
      this.toggleExpanded();
      this.setView('evo');
    } else {
      this.setView(this.view === 'evo' ? 'pop' : 'evo');
    }
  }

  /** Latest mean trait values (NaN where unknown), for the inspector's second tick. Null before any history. */
  latestTraits(): number[] | null {
    if (!this.ticks.length) return null;
    const d = this.evoData();
    return this.traitSeries.map((_, k) => latest(d, k));
  }

  private evoData(): EvoData {
    return { ticks: this.ticks, series: this.traitSeries };
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.el.classList.toggle('is-open', this.expanded);
    this.expandBtn.setAttribute('aria-expanded', String(this.expanded));
    const label = this.expanded ? 'Shrink the graph' : 'Expand the graph';
    this.expandBtn.setAttribute('aria-label', label);
    this.expandBtn.title = `${label} (G)`;
    this.expandBtn.innerHTML = icon(this.expanded ? 'shrink' : 'expand', 16);
    this.onHover(null);
    this.dirty = true;
    this.lastDraw = 0;
  }

  toggleLog(): void {
    this.log = !this.log;
    this.logBtn.setAttribute('aria-pressed', String(this.log));
    this.dirty = true;
    this.lastDraw = 0;
  }

  private rebuildCells(): void {
    const vis: number[] = [];
    for (let s = 0; s < SPECIES_COUNT; s++) if (this.seen[s]) vis.push(s);
    if (vis.length === this.visible.length && vis.every((v, i) => v === this.visible[i])) return;
    this.visible = vis;
    this.cells = [];
    this.cellsEl.replaceChildren();
    for (const sp of vis) {
      const count = h('span', { class: 'tg-cell-n' });
      const canvas = h('canvas', { class: 'tg-spark', 'aria-hidden': 'true' });
      const el = h(
        'div',
        { class: 'tg-cell', style: `--c:var(--sp-${sp})` },
        h('div', { class: 'tg-cell-top' }, h('span', { class: 'tg-cell-name' }, h('i', { class: 'tg-dot' }), SPECIES_NAMES[sp]), count),
        canvas,
      );
      const cell: Cell = { sp, el, count, canvas, lastText: '', away: null, shown: this.pops[sp][this.pops[sp].length - 1] ?? 0, yMin: 0, yMax: 0, hover: false, tip: '' };
      el.addEventListener('pointerenter', () => { cell.hover = true; this.dirty = true; this.lastDraw = 0; });
      el.addEventListener('pointerleave', () => { cell.hover = false; this.dirty = true; this.lastDraw = 0; });
      this.cells.push(cell);
      this.cellsEl.append(el);
    }
    // 1 to 3 species sit in one row of three, 4 make a tidy 2 x 2, 5 and more fill rows of three
    const cols = vis.length === 4 ? 2 : 3;
    this.el.dataset.cols = String(cols);
    this.el.dataset.count = String(vis.length);
    this.el.dataset.rows = String(Math.max(1, Math.ceil(vis.length / cols)));

    // species chips for the expanded chart
    this.chipsEl.replaceChildren();
    for (const sp of vis) {
      const b = button(
        {
          class: 'tg-chip tg-chip-btn',
          title: SPECIES_NAMES[sp],
          'aria-pressed': String(this.on[sp]),
          style: `--c:var(--sp-${sp})`,
          onclick: () => {
            this.on[sp] = !this.on[sp];
            b.setAttribute('aria-pressed', String(this.on[sp]));
            this.dirty = true;
            this.lastDraw = 0;
          },
        },
        h('i', { class: 'tg-dot' }),
        SPECIES_NAMES[sp],
      );
      this.chipsEl.append(b);
    }
    this.dirty = true;
  }

  /**
   * Called every frame. Cheap: counts are text diffs, drawing is throttled and only when data changed. At 1x the numbers follow the
   * sim every frame and drawing is about 8 Hz. At 10x and 100x the numbers ease toward their value a few times a second and the
   * sparklines redraw more slowly, so the panel reads as a calm time-lapse rather than a blur of flashing digits.
   */
  update(now: number, pop: number[], speed = 1): void {
    const pace = paceOf(speed);
    if (pace !== this.pace) {
      this.pace = pace;
      this.el.classList.toggle('is-fast', pace === 'fast');
      this.el.classList.toggle('is-lapse', pace === 'lapse');
      this.numAt = 0;
      this.dirty = true;
      this.lastDraw = 0;
    }
    const cfg = PACE[pace];
    if (cfg.num === 0 || now - this.numAt >= cfg.num) {
      this.numAt = now;
      const season = this.ticks.length ? seasonOfTick(this.ticks[this.ticks.length - 1]) : NaN;
      for (const c of this.cells) {
        const target = pop[c.sp] ?? 0;
        if (cfg.ease >= 1) c.shown = target;
        else {
          const d = target - c.shown;
          c.shown = Math.abs(d) < 0.6 ? target : c.shown + d * cfg.ease;
        }
        const v = Math.round(c.shown);
        // a visitor at zero in its away season is not gone: the card says where it is
        const away = Number.isFinite(season) ? awayState(c.sp, season, v, this.alive[c.sp]) : null;
        const t = away ? awayText(c.sp, away) : fmtInt(v);
        if (t !== c.lastText) {
          c.lastText = t;
          c.away = away;
          c.count.textContent = t;
          c.el.classList.toggle('is-gone', v === 0 && !away);
          c.el.classList.toggle('is-away', !!away);
          if (!this.expanded) this.dirty = true;
        }
      }
    }
    if (this.dirty && now - this.lastDraw >= cfg.draw) {
      this.lastDraw = now;
      this.dirty = false;
      this.draw();
    }
  }

  // ---- drawing -----------------------------------------------------------------------------------------------

  private draw(): void {
    if (!this.unit) this.unit = unitPx(this.el);
    if (this.expanded) {
      this.drawExpanded();
    } else {
      const n = this.ticks.length;
      if (n >= 2) {
        const span = (this.ticks[n - 1] - this.ticks[0]) / YEAR_TICKS;
        setText(this.sub, this.pace === 'lapse' ? 'time-lapse' : span >= SPARK_YEARS ? `last ${SPARK_YEARS} years` : 'since the start');
      }
      for (const c of this.cells) this.drawSpark(c);
    }
  }

  private fit(c: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } | null {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, hgt = c.clientHeight;
    if (!w || !hgt) return null;
    const bw = Math.round(w * dpr), bh = Math.round(hgt * dpr);
    if (c.width !== bw || c.height !== bh) {
      c.width = bw;
      c.height = bh;
    }
    const g = c.getContext('2d');
    if (!g) return null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    return { g, w, h: hgt };
  }

  /** First index with ticks[i] >= t. */
  private lowerBound(t: number): number {
    let lo = 0, hi = this.ticks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ticks[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private drawSpark(cell: Cell): void {
    const f = this.fit(cell.canvas);
    if (!f) return;
    const { g, w, h: ht } = f;
    const n = this.ticks.length;
    if (n < 2) return;
    const color = SPECIES_COLORS[cell.sp];
    const t1 = this.ticks[n - 1];
    const i0 = this.lowerBound(t1 - SPARK_YEARS * YEAR_TICKS);
    const ts = this.ticks[i0];
    if (t1 <= ts) return;
    // a visitor's away stretch (zero in its off season) is held at the last level it had, so the line is a quiet dashed gap and the scale
    // is set by the months it was here, not by a drop to nothing
    const raw = this.pops[cell.sp];
    const away = isMigrant(cell.sp) ? awayRows(cell.sp, raw, (i) => seasonOfTick(this.ticks[i]), i0, n) : null;
    const series = away ? holdAway(raw, away, i0) : raw;
    const at = (i: number): number => (away ? series[i - i0] : series[i]);
    const awayAt = (i: number): boolean => (away ? away[i - i0] : false);
    const calm = this.pace !== 'live';
    let lo = Infinity, hi = -Infinity, sum = 0, cnt = 0;
    for (let i = i0; i < n; i++) {
      if (awayAt(i)) continue;
      const v = at(i);
      if (v > hi) hi = v;
      if (v < lo) lo = v;
      sum += v;
      cnt++;
    }
    if (!cnt) { lo = 0; hi = 0; }
    const mean = cnt ? sum / cnt : 0;
    // A scale that cannot exaggerate: the range is at least +/-25% of the window's mean (and a few animals wide), centred on the
    // data, and never reaches below zero. A wolf count of 18 to 17 is a flat line; a real crash still fills the height.
    const half = Math.max((hi - lo) / 2, mean * SPARK_MIN_HALF, 1.5);
    const mid = (hi + lo) / 2;
    let tMin = mid - half, tMax = mid + half;
    if (tMin < 0) { tMax -= tMin; tMin = 0; }
    tMax += (tMax - tMin) * 0.08;
    if (calm && cell.yMax > cell.yMin) {
      // ease the range between redraws, so a new high does not rescale the whole line in one jump
      cell.yMin += (tMin - cell.yMin) * 0.35;
      cell.yMax += (tMax - cell.yMax) * 0.35;
    } else {
      cell.yMin = tMin;
      cell.yMax = tMax;
    }
    const yMin = cell.yMin, yMax = cell.yMax;
    const padT = 4 * this.unit, padB = 3 * this.unit, padL = 1, padR = 4 * this.unit;
    const pw = w - padL - padR, ph = ht - padT - padB;
    const X = (t: number) => padL + ((t - ts) / (t1 - ts)) * pw;
    const Y = (v: number) => padT + ph - ((v - yMin) / (yMax - yMin)) * ph;

    // the visible window's low and high, for the hover tip and the tiny labels
    const winText = toYears(t1 - this.ticks[0]) >= SPARK_YEARS ? `last ${SPARK_YEARS} years` : 'since the start';
    const here = cell.away ? `${SPECIES_NAMES[cell.sp]}, ${awayText(cell.sp, cell.away)}` : SPECIES_NAMES[cell.sp];
    const tip = cnt ? `${here}, ${winText}: low ${fmtInt(lo)}, high ${fmtInt(hi)}` : `${here}`;
    if (tip !== cell.tip) {
      cell.tip = tip;
      cell.el.title = tip;
    }

    // a faint baseline at the foot of the plot, and a dotted line at the window's average
    const avgY = Y(mean);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(239,230,208,0.2)';
    g.beginPath();
    g.moveTo(padL, Math.round(padT + ph) + 0.5);
    g.lineTo(padL + pw, Math.round(padT + ph) + 0.5);
    g.stroke();
    g.setLineDash([2 * this.unit, 3 * this.unit]);
    g.strokeStyle = 'rgba(239,230,208,0.14)';
    g.beginPath();
    g.moveTo(padL, Math.round(avgY) + 0.5);
    g.lineTo(padL + pw, Math.round(avgY) + 0.5);
    g.stroke();
    g.setLineDash([]);

    // the points: at 1x every few rows; when fast, the mean of fixed bins of rows. The bins are aligned to the row index, not to
    // the window, so as the window slides the points stay put and the line scrolls smoothly instead of shimmering.
    const bin = PACE[this.pace].bin;
    const xs: number[] = [], ys: number[] = [], aw: boolean[] = [];
    if (bin <= 1) {
      const step = Math.max(1, Math.floor((n - i0) / (pw * 1.5)));
      for (let i = i0; i < n; i += step) { xs.push(X(this.ticks[i])); ys.push(Y(at(i))); aw.push(awayAt(i)); }
    } else {
      for (let k = Math.ceil(i0 / bin) * bin; k + bin <= n; k += bin) {
        let sv = 0, st = 0, gone = true;
        for (let i = k; i < k + bin; i++) { sv += at(i); st += this.ticks[i]; if (!awayAt(i)) gone = false; }
        xs.push(X(st / bin)); ys.push(Y(sv / bin)); aw.push(gone);
      }
      if (!xs.length) { xs.push(X(ts)); ys.push(Y(at(i0))); aw.push(awayAt(i0)); }
    }
    const xe = X(this.ticks[n - 1]), ye = Y(at(n - 1));
    xs.push(xe); ys.push(ye); aw.push(awayAt(n - 1));
    const lastX = xe, lastY = ye;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // soft area under the line (none under an away stretch), then the line itself: solid, with a faint dashed gap where a visitor is away
    const grad = g.createLinearGradient(0, padT, 0, padT + ph);
    grad.addColorStop(0, hexA(color, 0.2));
    grad.addColorStop(1, hexA(color, 0));
    fillSolidRuns(g, xs, ys, aw, padT + ph, grad);
    strokeWithGaps(g, xs, ys, aw, color, 1.6 * this.unit, [2.5 * this.unit, 3 * this.unit], 0.5);
    // the present moment (a ring, not a dot, while the visitor is away)
    g.beginPath();
    g.arc(lastX, lastY, 2.4 * this.unit, 0, Math.PI * 2);
    if (aw[aw.length - 1]) {
      g.lineWidth = 1.1 * this.unit;
      g.strokeStyle = hexA(color, 0.55);
      g.stroke();
    } else {
      g.fillStyle = color;
      g.fill();
    }
    // tiny labels for the window's high and low while the pointer is over the sparkline
    if (cell.hover) {
      g.font = `600 ${9 * this.unit}px ${SANS}`;
      g.fillStyle = PAPER_DIM;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(`high ${fmtInt(hi)}`, padL + 2, 0);
      g.textBaseline = 'alphabetic';
      g.fillText(`low ${fmtInt(lo)}`, padL + 2, ht - 1);
    }
  }

  private plotRect(w: number, ht: number) {
    return rowsPlot(w, ht, this.unit);
  }

  private drawExpanded(): void {
    if (this.view === 'evo') this.drawEvo();
    else this.drawChart(this.hoverX);
  }

  private drawEvo(): void {
    const f = this.fit(this.chart);
    if (!f) return;
    const u = this.unit || 1;
    const d = this.evoData();
    const idx = drawEvolution(f.g, f.w, f.h, u, d, this.hoverX);
    // legend chips carry the latest value for each line
    HERO.forEach((hh, i) => {
      const v = latest(d, hh.index);
      setText(this.evoLegendText[i], Number.isFinite(v) ? fmtPct((v - 1) * 100) : 'absent');
    });
    if (idx >= 0) {
      const t = this.ticks[idx];
      const rows: HTMLElement[] = [h('div', { class: 'tg-tip-h', text: `Year ${yearOfTick(t)}, ${seasonPhraseAt(t)}` })];
      for (const r of evoTipRows(d, idx)) {
        rows.push(h('div', { class: 'tg-tip-r', style: `--c:${r.color}` }, h('i', { class: 'tg-dot' }), h('span', { text: r.label }), h('b', { text: r.value })));
      }
      this.tip.replaceChildren(...rows);
      this.tip.classList.add('is-on');
      const x = evoX(f.w, u, t, this.ticks);
      const tw = this.tip.offsetWidth;
      const left = x + 14 * u + tw > f.w ? x - 14 * u - tw : x + 14 * u;
      this.tip.style.left = `${Math.max(0, left)}px`;
      this.tip.style.top = `${8 * u}px`;
    } else {
      this.tip.classList.remove('is-on');
    }
  }

  private drawChart(hoverX: number): void {
    const f = this.fit(this.chart);
    if (!f) return;
    const { g, w, h: ht } = f;
    const u = this.unit;
    const n = this.ticks.length;
    if (n < 2) {
      g.font = `500 ${12 * u}px ${SANS}`;
      g.textBaseline = 'middle';
      g.fillStyle = PAPER_DIM;
      g.textAlign = 'center';
      g.fillText('The graph fills in as time passes.', w / 2, ht / 2);
      this.tip.classList.remove('is-on');
      return;
    }
    const species = this.visible.filter((sp) => this.on[sp]);
    // Many species: the rows run in two columns (the grass row closes the second), so each row keeps a readable height on the
    // wide, low dock. Both columns share the time axis and the pointer's crosshair.
    const twoCols = w >= 720 * u && species.length + 1 >= 6;
    const gapX = 22 * u;
    const cw = twoCols ? (w - gapX) / 2 : w;
    const split = twoCols ? Math.ceil((species.length + 1) / 2) : species.length;
    const groups = twoCols ? [species.slice(0, split), species.slice(split)] : [species];
    // the event marker nearest the pointer (within a generous reach), so a diamond can be read without aiming at it
    const P = this.plotRect(cw, ht);
    const t0 = this.ticks[0];
    const t1 = Math.max(this.ticks[n - 1], t0 + YEAR_TICKS * 0.5);
    const hc = twoCols && hoverX >= cw + gapX ? 1 : 0;
    const localX = hoverX >= 0 ? hoverX - hc * (cw + gapX) : -1;
    const inPlot = localX >= P.l && localX <= P.r;
    const frac = inPlot ? (localX - P.l) / (P.r - P.l) : -1;
    let hit = -1;
    let hitD = 12 * u;
    if (inPlot) {
      this.markers.forEach((m, i) => {
        if (m.tick < t0 || m.tick > t1) return;
        const d = Math.abs(P.l + ((m.tick - t0) / (t1 - t0)) * (P.r - P.l) - localX);
        if (d < hitD) { hitD = d; hit = i; }
      });
    }
    let idx = -1;
    groups.forEach((group, c) => {
      g.save();
      g.translate(c * (cw + gapX), 0);
      g.beginPath();
      g.rect(0, 0, cw, ht);
      g.clip();
      const lx = c === hc ? localX : frac >= 0 ? P.l + frac * (P.r - P.l) : -1;
      const got = drawRows(
        g, cw, ht, u,
        { ticks: this.ticks, pops: this.pops, species: group, grass: this.grass, grassMax: this.grassMax, markers: this.markers, log: this.log, grassRow: twoCols ? c === 1 : true, climate: this.climateAny ? this.climate : undefined, mega: this.climateAny ? this.mega : undefined },
        lx,
        c === hc ? hit : -1,
      );
      if (c === hc) idx = got;
      g.restore();
    });
    this.chart.style.cursor = hit >= 0 ? 'pointer' : 'crosshair';
    if (idx >= 0) {
      this.showTip(idx, hc * (cw + gapX) + P.l + ((this.ticks[idx] - t0) / (t1 - t0)) * (P.r - P.l), w, hit >= 0 ? this.markers[hit] : null);
    } else {
      this.tip.classList.remove('is-on');
    }
  }

  private showTip(idx: number, x: number, w: number, event: Marker | null = null): void {
    const t = this.ticks[idx];
    const rows: HTMLElement[] = [h('div', { class: 'tg-tip-h', text: `Year ${yearOfTick(t)}, ${seasonPhraseAt(t)}` })];
    for (const sp of this.visible) {
      if (!this.on[sp]) continue;
      // a visitor at zero in its off season is away, not extinct: the tip says so
      const v = this.pops[sp][idx];
      const gone = v === 0 && awayState(sp, seasonOfTick(t), 0, true) !== null;
      rows.push(
        h('div', { class: 'tg-tip-r', style: `--c:var(--sp-${sp})` }, h('i', { class: 'tg-dot' }), h('span', { text: SPECIES_NAMES[sp] }), gone ? h('b', { class: 'is-away', text: 'away' }) : h('b', { text: fmtInt(v) })),
      );
    }
    rows.push(h('div', { class: 'tg-tip-r is-grass' }, h('i', { class: 'tg-dot' }), h('span', { text: 'Grass' }), h('b', { text: `${Math.round((this.grass[idx] / (this.grassMax > 1.0001 ? this.grassMax : 1)) * 100)}%` })));
    // the wet and dry decades, when the row sits in one
    if (this.climateAny) {
      const cl = this.climate[idx] ?? 0;
      const mega = !!this.mega[idx];
      const cw = mega ? 'Megadrought' : cl > 0.45 ? 'Wet years' : cl < -0.45 ? 'Dry years' : cl > 0.2 ? 'Wetter than usual' : cl < -0.2 ? 'Drier than usual' : '';
      if (cw) rows.push(h('div', { class: 'tg-tip-r', style: `--c:${mega ? '#B2502A' : cl > 0 ? '#7CB054' : '#D6A85C'}` }, h('i', { class: 'tg-dot' }), h('span', { text: 'Climate' }), h('b', { text: cw })));
    }
    // an event the pointer is on: its sentence, in the chronicle's own words, with the year it happened
    if (event) {
      rows.length = 0;
      rows.push(h('div', { class: 'tg-tip-h', text: `Year ${yearOfTick(event.tick)}, ${seasonPhraseAt(event.tick)}` }), h('div', { class: 'tg-tip-ev is-solo', text: event.sentence }));
    }
    // a long list (many species) runs in two columns under the date, so it fits the low dock
    const cols = !event && rows.length > 8;
    if (cols) this.tip.replaceChildren(rows[0], h('div', { class: 'tg-tip-cols' }, ...rows.slice(1)));
    else this.tip.replaceChildren(...rows);
    this.tip.classList.toggle('is-cols', cols);
    this.tip.classList.add('is-on');
    const tw = this.tip.offsetWidth;
    const left = x + 14 * this.unit + tw > w ? x - 14 * this.unit - tw : x + 14 * this.unit;
    this.tip.style.left = `${Math.max(0, left)}px`;
    this.tip.style.top = `${6 * this.unit}px`;
  }

  private onHover(e: PointerEvent | null): void {
    if (!e) {
      this.hoverX = -1;
      this.tip.classList.remove('is-on');
      if (this.expanded) this.scheduleHoverDraw();
      return;
    }
    const r = this.chart.getBoundingClientRect();
    this.hoverX = e.clientX - r.left;
    this.scheduleHoverDraw();
  }

  private scheduleHoverDraw(): void {
    if (this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(() => {
      this.hoverRaf = 0;
      if (this.expanded) this.drawExpanded();
    });
  }
}

/** Pixel x of a tick in the evolution hero chart (same mapping as drawEvolution). */
function evoX(w: number, u: number, tick: number, ticks: number[]): number {
  const L = 40 * u, R = 54 * u;
  const t0 = ticks[0];
  const t1 = Math.max(ticks[ticks.length - 1], t0 + YEAR_TICKS * 0.5);
  return L + ((tick - t0) / (t1 - t0)) * (w - L - R);
}
