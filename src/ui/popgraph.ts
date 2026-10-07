// Bottom left: population. A strip of sparklines with counts that expands to a full chart over the whole history.
import { SPECIES_COUNT, SPECIES_KEYS, SPECIES_NAMES, YEAR_TICKS } from '../sim/types';
import type { HistoryRow } from '../sim/worker';
import { button, h, setText, unitPx } from './dom';
import { fmtInt, seasonPhrase, seasonOfTick, yearOfTick } from './describe';
import { icon } from './icons';
import { PAPER_DIM, SANS, SPECIES_COLORS } from './palette';
import { hexA } from './chartutil';
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
  private seen: boolean[] = Array.from({ length: SPECIES_COUNT }, (_, i) => alwaysShown(i));
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
  private tabBtns: Record<'pop' | 'evo', HTMLButtonElement>;
  private evoLegend: HTMLElement;
  private evoLegendText: HTMLElement[] = [];
  private ro: ResizeObserver;

  constructor() {
    this.cellsEl = h('div', { class: 'tg-cells' });
    this.sub = h('span', { class: 'tg-pop-sub', text: 'since the start' });
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
    this.markers = [];
    this.traitSeries.forEach((t) => (t.length = 0));
    this.seen = this.seen.map((_, i) => alwaysShown(i));
    this.rebuildCells();
    this.dirty = true;
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
        if (v > 0 && !this.seen[s]) {
          this.seen[s] = true;
          seenChanged = true;
        }
      }
      this.grass.push(r.grass);
      if (r.grass > this.grassMax) this.grassMax = r.grass;
      for (let k = 0; k < TRAIT_COUNT; k++) this.traitSeries[k].push(r.traits?.[k] ?? NaN);
    }
    if (seenChanged) this.rebuildCells();
    this.dirty = true;
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
      const cell: Cell = { sp, el, count, canvas, lastText: '', shown: this.pops[sp][this.pops[sp].length - 1] ?? 0, yMin: 0, yMax: 0, hover: false, tip: '' };
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
      for (const c of this.cells) {
        const target = pop[c.sp] ?? 0;
        if (cfg.ease >= 1) c.shown = target;
        else {
          const d = target - c.shown;
          c.shown = Math.abs(d) < 0.6 ? target : c.shown + d * cfg.ease;
        }
        const v = Math.round(c.shown);
        const t = fmtInt(v);
        if (t !== c.lastText) {
          c.lastText = t;
          c.count.textContent = t;
          c.el.classList.toggle('is-gone', v === 0);
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
    const series = this.pops[cell.sp];
    const calm = this.pace !== 'live';
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let i = i0; i < n; i++) {
      const v = series[i];
      if (v > hi) hi = v;
      if (v < lo) lo = v;
      sum += v;
    }
    const mean = sum / (n - i0);
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
    const tip = `${SPECIES_NAMES[cell.sp]}, ${winText}: low ${fmtInt(lo)}, high ${fmtInt(hi)}`;
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
    const xs: number[] = [], ys: number[] = [];
    if (bin <= 1) {
      const step = Math.max(1, Math.floor((n - i0) / (pw * 1.5)));
      for (let i = i0; i < n; i += step) { xs.push(X(this.ticks[i])); ys.push(Y(series[i])); }
    } else {
      for (let k = Math.ceil(i0 / bin) * bin; k + bin <= n; k += bin) {
        let sv = 0, st = 0;
        for (let i = k; i < k + bin; i++) { sv += series[i]; st += this.ticks[i]; }
        xs.push(X(st / bin)); ys.push(Y(sv / bin));
      }
      if (!xs.length) { xs.push(X(ts)); ys.push(Y(series[i0])); }
    }
    const xe = X(this.ticks[n - 1]), ye = Y(series[n - 1]);
    xs.push(xe); ys.push(ye);
    g.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i === 0) g.moveTo(xs[i], ys[i]);
      else g.lineTo(xs[i], ys[i]);
    }
    const lastX = xe, lastY = ye;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = 1.6 * this.unit;
    g.strokeStyle = color;
    g.stroke();
    // soft area under the line
    g.lineTo(lastX, padT + ph);
    g.lineTo(xs[0], padT + ph);
    g.closePath();
    const grad = g.createLinearGradient(0, padT, 0, padT + ph);
    grad.addColorStop(0, hexA(color, 0.2));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fill();
    // the present moment
    g.beginPath();
    g.arc(lastX, lastY, 2.4 * this.unit, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
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
      const rows: HTMLElement[] = [h('div', { class: 'tg-tip-h', text: `Year ${yearOfTick(t)}, ${seasonPhrase(seasonOfTick(t))}` })];
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
    // the event marker nearest the pointer (within a generous reach), so a diamond can be read without aiming at it
    const P = this.plotRect(w, ht);
    const t0 = this.ticks[0];
    const t1 = Math.max(this.ticks[n - 1], t0 + YEAR_TICKS * 0.5);
    let hit = -1;
    let hitD = 12 * u;
    if (hoverX >= P.l && hoverX <= P.r) {
      this.markers.forEach((m, i) => {
        if (m.tick < t0 || m.tick > t1) return;
        const d = Math.abs(P.l + ((m.tick - t0) / (t1 - t0)) * (P.r - P.l) - hoverX);
        if (d < hitD) { hitD = d; hit = i; }
      });
    }
    const idx = drawRows(
      g, w, ht, u,
      { ticks: this.ticks, pops: this.pops, species, grass: this.grass, grassMax: this.grassMax, markers: this.markers, log: this.log },
      hoverX,
      hit,
    );
    this.chart.style.cursor = hit >= 0 ? 'pointer' : 'crosshair';
    if (idx >= 0) {
      this.showTip(idx, P.l + ((this.ticks[idx] - t0) / (t1 - t0)) * (P.r - P.l), w, hit >= 0 ? this.markers[hit] : null);
    } else {
      this.tip.classList.remove('is-on');
    }
  }

  private showTip(idx: number, x: number, w: number, event: Marker | null = null): void {
    const t = this.ticks[idx];
    const rows: HTMLElement[] = [h('div', { class: 'tg-tip-h', text: `Year ${yearOfTick(t)}, ${seasonPhrase(seasonOfTick(t))}` })];
    for (const sp of this.visible) {
      if (!this.on[sp]) continue;
      rows.push(
        h('div', { class: 'tg-tip-r', style: `--c:var(--sp-${sp})` }, h('i', { class: 'tg-dot' }), h('span', { text: SPECIES_NAMES[sp] }), h('b', { text: fmtInt(this.pops[sp][idx]) })),
      );
    }
    rows.push(h('div', { class: 'tg-tip-r is-grass' }, h('i', { class: 'tg-dot' }), h('span', { text: 'Grass' }), h('b', { text: `${Math.round((this.grass[idx] / (this.grassMax > 1.0001 ? this.grassMax : 1)) * 100)}%` })));
    // an event the pointer is on: its sentence, in the chronicle's own words, with the year it happened
    if (event) {
      rows.length = 0;
      rows.push(h('div', { class: 'tg-tip-h', text: `Year ${yearOfTick(event.tick)}, ${seasonPhrase(seasonOfTick(event.tick))}` }), h('div', { class: 'tg-tip-ev is-solo', text: event.sentence }));
    }
    this.tip.replaceChildren(...rows);
    this.tip.classList.add('is-on');
    const tw = this.tip.offsetWidth;
    const left = x + 14 * this.unit + tw > w ? x - 14 * this.unit - tw : x + 14 * this.unit;
    this.tip.style.left = `${Math.max(0, left)}px`;
    this.tip.style.top = `${10 * this.unit}px`;
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
