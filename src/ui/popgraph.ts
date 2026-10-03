// Bottom left: population. A strip of sparklines with counts that expands to a full chart over the whole history.
import { SPECIES_COUNT, SPECIES_NAMES, YEAR_TICKS } from '../sim/types';
import type { HistoryRow } from '../sim/worker';
import { button, h, setText, unitPx } from './dom';
import { fmtInt, seasonPhrase, seasonOfTick, yearOfTick, yearStartTick } from './describe';
import { icon } from './icons';
import { GOLD, GRASS_COLOR, PAPER_DIM, SANS, SPECIES_COLORS } from './palette';

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
}

const SPARK_YEARS = 8;
const ALWAYS_SHOWN = 3; // bison, wolf, raven

export class PopGraph {
  readonly el: HTMLElement;

  // history, kept in full; drawing downsamples
  private ticks: number[] = [];
  private pops: number[][] = Array.from({ length: SPECIES_COUNT }, () => []);
  private grass: number[] = [];
  private grassMax = 1;
  private seen: boolean[] = Array.from({ length: SPECIES_COUNT }, (_, i) => i < ALWAYS_SHOWN);
  private markers: Marker[] = [];

  // view state
  private expanded = false;
  /** Log scale by default: predators and ravens are a tenth of the bison and vanish on a linear axis. */
  private log = true;
  private on: boolean[] = Array.from({ length: SPECIES_COUNT }, () => true);
  private visible: number[] = [];
  private cells: Cell[] = [];
  private unit = 0;
  private dirty = true;
  private lastDraw = 0;
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
  private ro: ResizeObserver;

  constructor() {
    this.cellsEl = h('div', { class: 'tg-cells' });
    this.sub = h('span', { class: 'tg-pop-sub', text: 'since the start' });
    this.chipsEl = h('div', { class: 'tg-pop-chips', role: 'group', 'aria-label': 'Species shown on the graph' });
    this.logBtn = button({
      class: 'tg-btn tg-pop-log',
      text: 'Log',
      title: 'Logarithmic scale (L)',
      'aria-pressed': 'true',
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
    const head = h(
      'div',
      { class: 'tg-pop-head' },
      h('span', { class: 'tg-pop-title', text: 'Population' }),
      this.sub,
      this.chipsEl,
      h('span', { class: 'tg-grow' }),
      this.logBtn,
      this.expandBtn,
    );

    this.chart = h('canvas', { class: 'tg-chart', role: 'img', 'aria-label': 'Population of each species over time' });
    this.tip = h('div', { class: 'tg-tip', 'aria-hidden': 'true' });
    this.chartWrap = h('div', { class: 'tg-chart-wrap' }, this.chart, this.tip);
    this.chart.addEventListener('pointermove', (e) => this.onHover(e));
    this.chart.addEventListener('pointerleave', () => this.onHover(null));

    this.el = h('section', { class: 'tg-pop tg-glass tg-leaf', 'aria-label': 'Population', 'data-rows': '1' }, head, this.cellsEl, this.chartWrap);

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
    this.seen = this.seen.map((_, i) => i < ALWAYS_SHOWN);
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

  get isExpanded(): boolean {
    return this.expanded;
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
      this.cells.push({ sp, el, count, canvas, lastText: '' });
      this.cellsEl.append(el);
    }
    // 1 to 3 species sit in one row of three, 4 make a tidy 2 x 2, 5 and 6 make two rows of three
    const cols = vis.length === 4 ? 2 : 3;
    this.el.dataset.cols = String(cols);
    this.el.dataset.rows = String(Math.max(1, Math.ceil(vis.length / cols)));

    // species chips for the expanded chart
    this.chipsEl.replaceChildren();
    for (const sp of vis) {
      const b = button(
        {
          class: 'tg-chip tg-chip-btn',
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

  /** Called every frame. Cheap: counts are text diffs, drawing is throttled to about 8 Hz and only when data changed. */
  update(now: number, pop: number[]): void {
    for (const c of this.cells) {
      const t = fmtInt(pop[c.sp] ?? 0);
      if (t !== c.lastText) {
        c.lastText = t;
        c.count.textContent = t;
        c.el.classList.toggle('is-gone', (pop[c.sp] ?? 0) === 0);
      }
    }
    if (this.dirty && now - this.lastDraw >= 125) {
      this.lastDraw = now;
      this.dirty = false;
      this.draw();
    }
  }

  // ---- drawing -----------------------------------------------------------------------------------------------

  private draw(): void {
    if (!this.unit) this.unit = unitPx(this.el);
    if (this.expanded) {
      this.drawChart(this.hoverX);
    } else {
      const n = this.ticks.length;
      if (n >= 2) {
        const span = (this.ticks[n - 1] - this.ticks[0]) / YEAR_TICKS;
        setText(this.sub, span >= SPARK_YEARS ? `last ${SPARK_YEARS} years` : 'since the start');
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
    let lo = Infinity, hi = 1;
    for (let i = i0; i < n; i++) {
      if (series[i] > hi) hi = series[i];
      if (series[i] < lo) lo = series[i];
    }
    // show the shape, not the baseline: scale from the window's low to its high, but never blow up flat noise
    const range = Math.max(hi - lo, hi * 0.14);
    const yMin = Math.max(0, lo - (range - (hi - lo)) / 2);
    const yMax = yMin + range;
    const padT = 4 * this.unit, padB = 3 * this.unit, padL = 1, padR = 4 * this.unit;
    const pw = w - padL - padR, ph = ht - padT - padB;
    const X = (t: number) => padL + ((t - ts) / (t1 - ts)) * pw;
    const Y = (v: number) => padT + ph - ((v - yMin) / (yMax - yMin)) * ph;
    const step = Math.max(1, Math.floor((n - i0) / (pw * 1.5)));

    g.beginPath();
    let first = true;
    let lastX = 0, lastY = 0;
    for (let i = i0; i < n; i += step) {
      const x = X(this.ticks[i]), y = Y(series[i]);
      if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
      lastX = x; lastY = y;
    }
    const xe = X(this.ticks[n - 1]), ye = Y(series[n - 1]);
    g.lineTo(xe, ye);
    lastX = xe; lastY = ye;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = 1.6 * this.unit;
    g.strokeStyle = color;
    g.stroke();
    // soft area under the line
    g.lineTo(lastX, padT + ph);
    g.lineTo(X(ts), padT + ph);
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
  }

  private plotRect(w: number, ht: number) {
    const u = this.unit;
    return { l: 40 * u, r: w - 38 * u, t: 10 * u, b: ht - 22 * u };
  }

  private drawChart(hoverX: number): void {
    const f = this.fit(this.chart);
    if (!f) return;
    const { g, w, h: ht } = f;
    const u = this.unit;
    const P = this.plotRect(w, ht);
    const pw = P.r - P.l, ph = P.b - P.t;
    const n = this.ticks.length;

    g.font = `500 ${12 * u}px ${SANS}`;
    g.textBaseline = 'middle';

    if (n < 2) {
      g.fillStyle = PAPER_DIM;
      g.textAlign = 'center';
      g.fillText('The graph fills in as time passes.', w / 2, ht / 2);
      return;
    }

    const t0 = this.ticks[0];
    let t1 = this.ticks[n - 1];
    if (t1 - t0 < YEAR_TICKS * 0.5) t1 = t0 + YEAR_TICKS * 0.5;
    const X = (t: number) => P.l + ((t - t0) / (t1 - t0)) * pw;

    // y domain from the visible, enabled species
    let max = 1;
    for (const sp of this.visible) if (this.on[sp]) for (let i = 0; i < n; i++) if (this.pops[sp][i] > max) max = this.pops[sp][i];
    let Y: (v: number) => number;
    const yTicks: { v: number; label: string; minor?: boolean }[] = [];
    if (this.log) {
      // the top of the axis hugs the data instead of jumping to the next power of ten
      const hi = Math.max(1.3, Math.log10(max * 1.15));
      const lo = -0.3;
      Y = (v) => P.b - ((Math.log10(Math.max(v, 0.5)) - lo) / (hi - lo)) * ph;
      for (let k = 0; k <= Math.floor(hi); k++) {
        yTicks.push({ v: Math.pow(10, k), label: fmtInt(Math.pow(10, k)) });
        for (const m of [2, 5]) if (m * Math.pow(10, k) <= Math.pow(10, hi)) yTicks.push({ v: m * Math.pow(10, k), label: '', minor: true });
      }
    } else {
      const step = niceStep(max, 4);
      const top = Math.ceil((max * 1.04) / step) * step;
      Y = (v) => P.b - (v / top) * ph;
      for (let v = 0; v <= top + 1e-9; v += step) yTicks.push({ v, label: fmtInt(v) });
    }

    // grid and left axis
    g.lineWidth = 1;
    g.textAlign = 'right';
    for (const t of yTicks) {
      const y = Math.round(Y(t.v)) + 0.5;
      g.strokeStyle = t.minor ? 'rgba(239,230,208,0.04)' : 'rgba(239,230,208,0.09)';
      g.beginPath();
      g.moveTo(P.l, y);
      g.lineTo(P.r, y);
      g.stroke();
      if (!t.minor) {
        g.fillStyle = PAPER_DIM;
        g.fillText(t.label, P.l - 8 * u, y);
      }
    }
    if (this.log) {
      g.fillStyle = PAPER_DIM;
      g.fillText('0', P.l - 8 * u, P.b);
    }
    // baseline
    g.strokeStyle = 'rgba(239,230,208,0.22)';
    g.beginPath();
    g.moveTo(P.l, Math.round(P.b) + 0.5);
    g.lineTo(P.r, Math.round(P.b) + 0.5);
    g.stroke();

    // x axis: years
    const spanYears = (t1 - t0) / YEAR_TICKS;
    const ystep = niceStepInt(spanYears, 7);
    const y0 = yearOfTick(t0), y1 = yearOfTick(t1);
    g.textAlign = 'center';
    g.fillStyle = PAPER_DIM;
    for (let yr = Math.ceil(y0 / ystep) * ystep; yr <= y1; yr += ystep) {
      const x = X(yearStartTick(yr));
      if (x < P.l + 2 || x > P.r - 6 * u) continue;
      g.strokeStyle = 'rgba(239,230,208,0.22)';
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, P.b);
      g.lineTo(Math.round(x) + 0.5, P.b + 4 * u);
      g.stroke();
      g.fillText(String(yr), x, P.b + 13 * u);
    }
    g.textAlign = 'left';
    g.font = `italic 400 ${13 * u}px 'Alegreya', Georgia, serif`;
    g.fillText('year', 2, P.b + 13 * u);
    g.font = `500 ${12 * u}px ${SANS}`;

    // downsample for drawing
    const step = Math.max(1, Math.floor(n / (pw * 1.2)));

    // grass: faint area on a secondary axis (0 to 100 percent)
    const gTop = this.grassMax > 1.0001 ? this.grassMax : 1;
    const GY = (v: number) => P.b - (Math.min(v, gTop) / gTop) * ph;
    g.beginPath();
    g.moveTo(X(this.ticks[0]), P.b);
    for (let i = 0; i < n; i += step) g.lineTo(X(this.ticks[i]), GY(this.grass[i]));
    g.lineTo(X(this.ticks[n - 1]), GY(this.grass[n - 1]));
    g.lineTo(X(this.ticks[n - 1]), P.b);
    g.closePath();
    g.fillStyle = hexA(GRASS_COLOR, 0.07);
    g.fill();
    g.beginPath();
    for (let i = 0; i < n; i += step) {
      const x = X(this.ticks[i]), y = GY(this.grass[i]);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineTo(X(this.ticks[n - 1]), GY(this.grass[n - 1]));
    g.lineWidth = 1;
    g.strokeStyle = hexA(GRASS_COLOR, 0.32);
    g.stroke();
    g.textAlign = 'left';
    g.fillStyle = hexA(GRASS_COLOR, 0.8);
    g.fillText('0%', P.r + 7 * u, P.b);
    g.fillText('50%', P.r + 7 * u, P.b - 0.5 * ph);
    g.font = `italic 400 ${13 * u}px 'Alegreya', Georgia, serif`;
    g.fillText('grass', P.r + 7 * u, P.t + 2 * u);
    g.font = `500 ${12 * u}px ${SANS}`;

    // event markers
    for (const m of this.markers) {
      if (m.tick < t0 || m.tick > t1) continue;
      const x = Math.round(X(m.tick)) + 0.5;
      g.strokeStyle = m.major ? hexA(GOLD, 0.28) : 'rgba(239,230,208,0.12)';
      g.beginPath();
      g.moveTo(x, P.t);
      g.lineTo(x, P.b);
      g.stroke();
    }

    // species lines
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const sp of this.visible) {
      if (!this.on[sp]) continue;
      const s = this.pops[sp];
      g.beginPath();
      for (let i = 0; i < n; i += step) {
        const x = X(this.ticks[i]), y = Y(s[i]);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.lineTo(X(this.ticks[n - 1]), Y(s[n - 1]));
      g.lineWidth = 1.75 * u;
      g.strokeStyle = SPECIES_COLORS[sp];
      g.stroke();
      g.beginPath();
      g.arc(X(this.ticks[n - 1]), Y(s[n - 1]), 2.8 * u, 0, Math.PI * 2);
      g.fillStyle = SPECIES_COLORS[sp];
      g.fill();
    }

    // marker glyphs on the axis, drawn last so lines never cover them
    for (const m of this.markers) {
      if (m.tick < t0 || m.tick > t1) continue;
      const x = X(m.tick);
      if (m.major) {
        const r = 3.6 * u;
        g.beginPath();
        g.moveTo(x, P.b - r);
        g.lineTo(x + r, P.b);
        g.lineTo(x, P.b + r);
        g.lineTo(x - r, P.b);
        g.closePath();
        g.fillStyle = GOLD;
        g.fill();
      } else {
        g.beginPath();
        g.arc(x, P.b, 2 * u, 0, Math.PI * 2);
        g.fillStyle = 'rgba(239,230,208,0.55)';
        g.fill();
      }
    }

    // hover crosshair
    if (hoverX >= P.l && hoverX <= P.r) {
      const tick = t0 + ((hoverX - P.l) / pw) * (t1 - t0);
      const idx = Math.min(n - 1, Math.max(0, this.nearest(tick)));
      const x = Math.round(X(this.ticks[idx])) + 0.5;
      g.strokeStyle = 'rgba(239,230,208,0.45)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, P.t);
      g.lineTo(x, P.b);
      g.stroke();
      for (const sp of this.visible) {
        if (!this.on[sp]) continue;
        g.beginPath();
        g.arc(x, Y(this.pops[sp][idx]), 3.2 * u, 0, Math.PI * 2);
        g.fillStyle = SPECIES_COLORS[sp];
        g.fill();
        g.strokeStyle = 'rgba(20,16,10,0.8)';
        g.lineWidth = 1.2;
        g.stroke();
      }
      this.showTip(idx, x, w);
    } else {
      this.tip.classList.remove('is-on');
    }
  }

  private nearest(tick: number): number {
    const i = this.lowerBound(tick);
    if (i <= 0) return 0;
    if (i >= this.ticks.length) return this.ticks.length - 1;
    return tick - this.ticks[i - 1] < this.ticks[i] - tick ? i - 1 : i;
  }

  private showTip(idx: number, x: number, w: number): void {
    const t = this.ticks[idx];
    const rows: HTMLElement[] = [h('div', { class: 'tg-tip-h', text: `Year ${yearOfTick(t)}, ${seasonPhrase(seasonOfTick(t))}` })];
    for (const sp of this.visible) {
      if (!this.on[sp]) continue;
      rows.push(
        h('div', { class: 'tg-tip-r', style: `--c:var(--sp-${sp})` }, h('i', { class: 'tg-dot' }), h('span', { text: SPECIES_NAMES[sp] }), h('b', { text: fmtInt(this.pops[sp][idx]) })),
      );
    }
    rows.push(h('div', { class: 'tg-tip-r is-grass' }, h('i', { class: 'tg-dot' }), h('span', { text: 'Grass' }), h('b', { text: `${Math.round((this.grass[idx] / (this.grassMax > 1.0001 ? this.grassMax : 1)) * 100)}%` })));
    // an event within a few pixels of the cursor
    const P = this.plotRect(w, this.chart.clientHeight);
    const t0 = this.ticks[0];
    const t1 = Math.max(this.ticks[this.ticks.length - 1], t0 + YEAR_TICKS * 0.5);
    let best: Marker | null = null, bestD = 7 * this.unit;
    for (const m of this.markers) {
      const mx = P.l + ((m.tick - t0) / (t1 - t0)) * (P.r - P.l);
      const d = Math.abs(mx - x);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) rows.push(h('div', { class: 'tg-tip-ev', text: best.sentence }));
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
      if (this.expanded) this.drawChart(this.hoverX);
    });
  }
}

// ---- helpers -------------------------------------------------------------------------------------------------

function niceStep(max: number, target: number): number {
  const raw = Math.max(max, 1) / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** Whole-year tick spacing: 1, 2, 5, 10, 20, 50, ... */
function niceStepInt(spanYears: number, maxTicks: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  for (const s of steps) if (spanYears / s <= maxTicks) return s;
  return 10000;
}

/** "#RRGGBB" to "rgba(r,g,b,a)". */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
