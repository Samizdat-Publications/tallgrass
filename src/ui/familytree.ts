// Family tree (R12): a docked page opened from the inspector. A pedigree chart with the animal in the middle (parents,
// grandparents and great-grandparents above it, young and grand-young below) and, for a wolf, the pack's alpha pairs over
// time. The sim answers two worker requests (src/sim/lineage.ts): 'lineage' (a LineageTree) and 'dynasty' (DynastyEntry[]).
// The two layout functions are pure (no DOM) so they can be tested under Node; the panel below them only draws their output.
import type { DynastyEntry, LineageDescendant, LineageNode, LineageTree } from '../sim/lineage';
import type { AnimalDetail } from '../sim/worker';
import { COAT_BASE } from '../sim/species';
import { Sp } from '../sim/types';
import { segmented, type Segmented } from './controls';
import { packName, singular, yearOfTick, yearStartTick } from './describe';
import { button, h, setText } from './dom';
import { icon } from './icons';
import { relWord } from './inspector';
import { causePhrase } from './story';
import type { UIActions } from './types';

// ---------------------------------------------------------------------------------------------------------------------
// pedigree layout (pure)
// ---------------------------------------------------------------------------------------------------------------------

/** Rows of the full chart, top to bottom. Empty rows are squeezed out of the result (see PedNode.tier). */
export const ROW_GREAT = 0;
export const ROW_GRAND = 1;
export const ROW_PARENT = 2;
export const ROW_SELF = 3;
export const ROW_KID = 4;
export const ROW_GRANDKID = 5;

/** The widest the young rows may get, in node slots (the pedigree above is 8 wide, so the chart never grows past that). */
export const MAX_SLOTS = 8;
/** Most grandchildren drawn under one child. */
export const MAX_GRAND_PER_KID = 2;

export type HoleReason = 'sire' | 'lost';

export interface PedNode {
  key: string;
  /** The animal, or null for a soft placeholder (see `hole`). */
  node: LineageNode | null;
  hole?: HoleReason;
  /** 'Mother' or 'Father' for a placeholder, so it can say what is missing. */
  role?: string;
  kind: 'self' | 'up' | 'down';
  /** Row in the full chart (ROW_*) and the row after empty ones are squeezed out (0 is the top). */
  row: number;
  tier: number;
  /** Centre of the node in slot units, 0 at the chart's left edge. */
  x: number;
  /** Grandchildren of this child that exist but are not drawn (kind 'down' on the child row only). */
  hiddenKids?: number;
}

export interface PedLink {
  /** Parent (the upper node) and child (the lower one). */
  from: string;
  to: string;
}

export interface PedLayout {
  nodes: PedNode[];
  links: PedLink[];
  /** Chart width in slots, symmetric about the animal. */
  width: number;
  /** Number of rows after squeezing. */
  tiers: number;
  selfKey: string;
  /** Young of the animal that are not drawn (more than fit, or not recorded). */
  hiddenKids: number;
}

const GRID = 8;

/** The grid x (slot units, 0..8) of ancestor i in up-row k (0 parents, 1 grandparents, 2 great-grandparents). */
export function upX(k: number, i: number): number {
  if (k === 2) return i + 0.5;
  const a = upX(k + 1, 2 * i);
  const b = upX(k + 1, 2 * i + 1);
  return (a + b) / 2;
}

/** Lay a lineage tree out. Ancestors sit on a fixed 8 wide grid, each over the middle of its two parents; the young are
 * centred under the animal. Nothing is drawn for the unknown ancestors of an unknown ancestor, and a founder (no parent
 * id at all) gets no placeholder either: its chip says so instead. */
export function layoutPedigree(tree: LineageTree, maxSlots = MAX_SLOTS): PedLayout {
  const nodes: PedNode[] = [];
  const links: PedLink[] = [];
  const self = tree.self;
  const selfKey = 'self';
  nodes.push({ key: selfKey, node: self, kind: 'self', row: ROW_SELF, tier: 0, x: GRID / 2 });

  // ancestors, nearest row first so each row can look at the one below it
  const keyAt = (k: number, i: number): string => `u${k}:${i}`;
  /** Keys of the ancestors drawn as real animals (placeholders have nothing above them). */
  const drawn = new Set<string>();
  for (let k = 0; k < 3; k++) {
    const row = tree.up[k] ?? [];
    for (let i = 0; i < 2 << k; i++) {
      const childKey = k === 0 ? selfKey : keyAt(k - 1, i >> 1);
      const child = k === 0 ? self : (tree.up[k - 1]?.[i >> 1] ?? null);
      // nothing to hang this one on: the unknown ancestors of an unknown ancestor stay off the chart, and so do those under a
      // seat that was blanked as an unknown sire
      if (!child || (k > 0 && !drawn.has(childKey))) continue;
      const node = row[i] ?? null;
      const male = (i & 1) === 1;
      const parentId = male ? child.parentB : child.parentA;
      const rowIdx = ROW_PARENT - k;
      // the sim records the mother in both seats when a birth had no separate sire (ravens do this): the same animal is not
      // its own mate, so that seat is an unknown sire
      const noSire = male && child.parentA !== 0 && child.parentA === child.parentB;
      if (node && !noSire) {
        drawn.add(keyAt(k, i));
        nodes.push({ key: keyAt(k, i), node, kind: 'up', row: rowIdx, tier: 0, x: upX(k, i) });
        links.push({ from: keyAt(k, i), to: childKey });
      } else if (noSire || parentId !== 0 || (male && child.parentA !== 0)) {
        // a recorded id with no record behind it, or a mother is known but the sire is not
        nodes.push({ key: keyAt(k, i), node: null, hole: !noSire && parentId !== 0 ? 'lost' : 'sire', role: male ? 'Father' : 'Mother', kind: 'up', row: rowIdx, tier: 0, x: upX(k, i) });
        links.push({ from: keyAt(k, i), to: childKey });
      }
    }
  }

  // ancestors only as deep as the record goes: a tree with no great-grandparents packs its grandparents one slot apart,
  // one with parents only packs them side by side, instead of leaving the wide grid mostly empty
  let deepest = -1;
  for (const n of nodes) if (n.kind === 'up') deepest = Math.max(deepest, ROW_PARENT - n.row);
  if (deepest >= 0 && deepest < 2) {
    const s = 1 / (1 << (2 - deepest));
    for (const n of nodes) if (n.kind === 'up') n.x = GRID / 2 + (n.x - GRID / 2) * s;
  }

  // the young: a child costs as many slots as the grandchildren drawn under it (at least one)
  const total = Math.max(self.children, tree.down.length);
  const prefer = (a: LineageDescendant, b: LineageDescendant): number =>
    Number(b.node.alive) - Number(a.node.alive) || b.children.length - a.children.length || a.node.born - b.node.born || a.node.id - b.node.id;
  const grandOf = (d: LineageDescendant): LineageNode[] =>
    d.children.slice().sort((a, b) => Number(b.alive) - Number(a.alive) || a.born - b.born || a.id - b.id).slice(0, MAX_GRAND_PER_KID);
  const chosen: { d: LineageDescendant; grand: LineageNode[]; w: number }[] = [];
  let used = 0;
  for (const d of tree.down.slice().sort(prefer)) {
    const grand = grandOf(d);
    const w = Math.max(1, grand.length);
    if (used + w > maxSlots) continue;
    chosen.push({ d, grand, w });
    used += w;
  }
  chosen.sort((a, b) => a.d.node.born - b.d.node.born || a.d.node.id - b.d.node.id);
  let cursor = GRID / 2 - used / 2;
  for (const c of chosen) {
    const cx = cursor + c.w / 2;
    const key = `k:${c.d.node.id}`;
    const hiddenKids = Math.max(0, Math.max(c.d.node.children, c.d.children.length) - c.grand.length);
    nodes.push({ key, node: c.d.node, kind: 'down', row: ROW_KID, tier: 0, x: cx, hiddenKids });
    links.push({ from: selfKey, to: key });
    c.grand.forEach((g, i) => {
      const gk = `g:${c.d.node.id}:${g.id}`;
      nodes.push({ key: gk, node: g, kind: 'down', row: ROW_GRANDKID, tier: 0, x: cursor + i + 0.5 });
      links.push({ from: key, to: gk });
    });
    cursor += c.w;
  }
  const hiddenKids = Math.max(0, total - chosen.length);

  // squeeze out empty rows, then trim the width (kept symmetric about the animal)
  const rows = [...new Set(nodes.map((n) => n.row))].sort((a, b) => a - b);
  for (const n of nodes) n.tier = rows.indexOf(n.row);
  let half = 0.5;
  for (const n of nodes) half = Math.max(half, Math.abs(n.x - GRID / 2) + 0.5);
  const shift = GRID / 2 - half;
  for (const n of nodes) n.x -= shift;
  return { nodes, links, width: half * 2, tiers: rows.length, selfKey, hiddenKids };
}

// ---------------------------------------------------------------------------------------------------------------------
// dynasty layout (pure)
// ---------------------------------------------------------------------------------------------------------------------

export interface DynSeg {
  /** Animal id of the alpha, 0 for a vacant seat. */
  id: number;
  from: number;
  to: number;
  /** 0..1 along the time axis. */
  x0: number;
  x1: number;
  vacant: boolean;
}

export interface DynLayout {
  f: DynSeg[];
  m: DynSeg[];
  t0: number;
  t1: number;
  /** Year starts inside the span: where to draw an axis tick, and which year it is. */
  ticks: { x: number; year: number }[];
  /** How many times either seat changed hands (the first pair does not count). */
  changes: number;
}

/** One lane of the timeline: consecutive entries with the same animal in the seat are merged into one bar. */
function lane(list: DynastyEntry[], pick: (e: DynastyEntry) => number, t0: number, t1: number): DynSeg[] {
  const out: DynSeg[] = [];
  const span = Math.max(1, t1 - t0);
  const push = (id: number, from: number, to: number): void => {
    if (to <= from) return;
    out.push({ id, from, to, x0: (from - t0) / span, x1: (to - t0) / span, vacant: id === 0 });
  };
  let cur = -1;
  let from = t0;
  for (const e of list) {
    const id = pick(e);
    if (id === cur) continue;
    if (cur >= 0) push(cur, from, e.tick);
    cur = id;
    from = e.tick;
  }
  if (cur >= 0) push(cur, from, t1);
  return out;
}

/** The alpha pairs of one pack over time, oldest first, up to `now` (the latest tick). Empty when nothing was recorded. */
export function layoutDynasty(list: DynastyEntry[], now: number): DynLayout {
  const sorted = list.slice().sort((a, b) => a.tick - b.tick);
  if (!sorted.length) return { f: [], m: [], t0: 0, t1: 1, ticks: [], changes: 0 };
  const t0 = sorted[0].tick;
  const t1 = Math.max(now, sorted[sorted.length - 1].tick + 1);
  const f = lane(sorted, (e) => e.f, t0, t1);
  const m = lane(sorted, (e) => e.m, t0, t1);
  const ticks: DynLayout['ticks'] = [];
  const span = t1 - t0;
  const y0 = yearOfTick(t0);
  const y1 = yearOfTick(t1);
  // every year while it is roomy, then every 2nd, 5th, 10th
  const stride = y1 - y0 > 40 ? 10 : y1 - y0 > 20 ? 5 : y1 - y0 > 10 ? 2 : 1;
  for (let y = y0 + 1; y <= y1; y++) {
    if ((y - y0) % stride !== 0) continue;
    const x = (yearStartTick(y) - t0) / span;
    if (x > 0.02 && x < 0.98) ticks.push({ x, year: y });
  }
  return { f, m, t0, t1, ticks, changes: Math.max(0, f.length - 1) + Math.max(0, m.length - 1) };
}

// ---------------------------------------------------------------------------------------------------------------------
// words
// ---------------------------------------------------------------------------------------------------------------------

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Wolf #1042". */
export function nodeName(n: { sp: number; id: number }): string {
  return `${cap(singular(n.sp))} #${n.id}`;
}

/** "Year 3 to 7", "Year 3 to now", "Year 3" (born and died in the same year). A founder is "From the start". */
export function lifeText(n: LineageNode): string {
  const b = yearOfTick(n.born);
  const founderish = n.gen <= 0 && n.born <= 100;
  const from = founderish ? 'The start' : `Year ${b}`;
  if (n.alive) return founderish ? 'The start to now' : `${from} to now`;
  const d = yearOfTick(n.died);
  if (!founderish && d === b) return from;
  return `${from} to ${d}`;
}

/** How a dead animal met its end, from the story's own phrases. */
export function causeText(n: LineageNode): string {
  return causePhrase(n.cause, { sp: n.sp, male: n.male }, [], n.died);
}

/** The plain-words trait chips for an animal whose genes are known: speed and size against the founders, coat shade. */
export function traitChips(sp: number, genes: Record<string, number>): string[] {
  const out: string[] = [];
  if (typeof genes.speed === 'number') out.push(`speed ${relWord(genes.speed, 1)}`);
  if (typeof genes.size === 'number') out.push(`size ${relWord(genes.size, 1)}`);
  if (typeof genes.coat === 'number') {
    const dc = genes.coat - (COAT_BASE[sp] ?? 0.5);
    out.push(`coat ${dc < -0.05 ? 'paler' : dc > 0.05 ? 'darker' : 'typical'}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// the panel
// ---------------------------------------------------------------------------------------------------------------------

/** What the panel asks of the game, on top of the usual select and follow (requestLineage and requestDynasty are in UIActions). */
export type FamilyActions = UIActions;

type Tab = 'tree' | 'dynasty';

/** One slot, in the chart's own abstract units (1 unit = the UI's scale unit --u). */
const SLOT = 100;
const CARD_H = 94;
const ROW_GAP = 22;
const CARD_PAD = 5;
const REFRESH_MS = 3000;
const GENE_CACHE = 400;

export class FamilyPanel {
  readonly el: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly seg: Segmented<Tab>;
  private readonly scroll: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly note: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private open = false;
  private hideTimer = 0;
  private tab: Tab = 'tree';
  private viewId = -1;
  private tree: LineageTree | null = null;
  private treeFor = -1;
  private loaded = false;
  private dyn: { pack: number; list: DynastyEntry[] } | null = null;
  private selectedId = -1;
  private lastSelected = -1;
  private now = 0;
  private lastAsk = 0;
  private sig = '';
  private genes = new Map<number, Record<string, number>>();
  private ro: ResizeObserver | null = null;
  private fitQueued = false;
  private chart: HTMLElement | null = null;
  /** The animal the page was opened for (the inspector's), so the page can offer a way back after a wander through the family. */
  private homeId = -1;

  constructor(private actions: FamilyActions) {
    this.sub = h('p', { class: 'tg-pane-sub tg-fam-sub' });
    this.seg = segmented<Tab>('Family view', [
      { id: 'tree', label: 'Pedigree', title: 'Parents above, young below' },
      { id: 'dynasty', label: 'Pack dynasty', title: 'The alpha pairs of the pack over time' },
    ], 'tree', (t) => this.setTab(t));
    this.seg.el.classList.add('tg-fam-tabs');
    this.backBtn = button({ class: 'tg-btn tg-fam-back', hidden: true, onclick: () => this.goHome() });
    this.note = h('p', { class: 'tg-fam-note', role: 'status', 'aria-live': 'polite' });
    this.hint = h('p', { class: 'tg-fam-hint' });
    this.foot = h('div', { class: 'tg-fam-foot' }, this.note, this.hint);
    this.scroll = h('div', { class: 'tg-fam-scroll' });
    const head = h(
      'header',
      { class: 'tg-pane-head' },
      h('h2', { class: 'tg-pane-title', text: 'Family' }),
      h('span', { class: 'tg-pane-extra' }, this.seg.el),
      button({ class: 'tg-iconbtn', 'aria-label': 'Close family tree', title: 'Close (Esc)', html: icon('close', 16), onclick: () => this.hide() }),
    );
    this.el = h(
      'section',
      { class: 'tg-pane tg-glass tg-leaf tg-family', role: 'dialog', 'aria-label': 'Family tree', hidden: true },
      head,
      h('div', { class: 'tg-fam-subrow' }, this.sub, this.backBtn),
      this.scroll,
      this.foot,
    );
    this.scroll.addEventListener('scroll', () => this.edges(), { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.fitSoon());
      this.ro.observe(this.scroll);
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Open for this animal (the inspector's). Opening again for the same one, or with no animal, closes. */
  toggle(id: number | null): void {
    if (this.open) return this.hide();
    if (id !== null) this.show(id);
  }

  show(id: number): void {
    window.clearTimeout(this.hideTimer);
    this.homeId = id;
    this.lastSelected = this.selectedId = id;
    this.viewFamilyOf(id, true);
    this.open = true;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-open');
    this.fit();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('is-open');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      if (!this.open) this.el.hidden = true;
    }, 200);
  }

  destroy(): void {
    window.clearTimeout(this.hideTimer);
    this.ro?.disconnect();
  }

  /** A picked animal's genes, kept so a later tree can show its trait chips (the sim's lineage record does not hold genes). */
  noteDetail(d: AnimalDetail): void {
    if (this.genes.has(d.id)) return;
    if (this.genes.size >= GENE_CACHE) this.genes.delete(this.genes.keys().next().value as number);
    this.genes.set(d.id, { ...d.genes });
  }

  /** Every frame while the game runs: follows the selection and refreshes the tree now and then. Cheap when closed. */
  frame(tick: number, selectedId: number | null): void {
    this.now = tick;
    if (!this.open) return;
    const sel = selectedId ?? -1;
    this.selectedId = sel;
    if (sel >= 0 && sel !== this.lastSelected) {
      this.lastSelected = sel;
      if (sel !== this.viewId) {
        this.homeId = sel;
        this.viewFamilyOf(sel, false);
      }
    }
    const t = performance.now();
    if (t - this.lastAsk > REFRESH_MS) this.ask();
  }

  /** Answer to the worker's 'lineage' request. */
  setTree(id: number, tree: LineageTree | null): void {
    if (id !== this.viewId) return;
    this.tree = tree;
    this.treeFor = id;
    this.loaded = true;
    // the dynasty view only exists for a wolf with a pack
    if (tree && this.tab === 'dynasty' && !this.hasDynasty(tree)) {
      this.tab = 'tree';
      this.seg.set('tree');
    }
    this.render();
    if (tree && this.hasDynasty(tree) && this.tab === 'dynasty') this.actions.requestDynasty?.(tree.self.pack);
  }

  /** Answer to the worker's 'dynasty' request. */
  setDynasty(pack: number, list: DynastyEntry[]): void {
    this.dyn = { pack, list };
    if (this.tab === 'dynasty') this.render();
  }

  // ---- state ------------------------------------------------------------------------------------------------

  private hasDynasty(tree: LineageTree): boolean {
    return tree.self.sp === Sp.Wolf && tree.self.pack >= 0;
  }

  /** Centre the chart on one animal (a selection, or a click on a dead relative). */
  private viewFamilyOf(id: number, fresh: boolean): void {
    this.viewId = id;
    if (fresh || this.treeFor !== id) {
      this.tree = null;
      this.loaded = false;
      this.treeFor = -1;
      this.sig = '';
    }
    this.dyn = null;
    this.setNote('');
    this.ask();
    this.render();
  }

  private ask(): void {
    this.lastAsk = performance.now();
    if (this.viewId < 0) return;
    this.actions.requestLineage?.(this.viewId);
    const t = this.tree;
    if (this.tab === 'dynasty' && t && this.hasDynasty(t)) this.actions.requestDynasty?.(t.self.pack);
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.seg.set(t);
    this.sig = '';
    if (t === 'dynasty' && this.tree && this.hasDynasty(this.tree)) this.actions.requestDynasty?.(this.tree.self.pack);
    this.render();
  }

  private goHome(): void {
    if (this.homeId >= 0) this.viewFamilyOf(this.homeId, false);
  }

  private setNote(s: string): void {
    setText(this.note, s);
  }

  /** A click on a relative: a living one is selected and followed in the world; a dead one only becomes the centre of the chart. */
  private pick(n: LineageNode): void {
    if (n.alive) {
      this.lastSelected = n.id;
      this.homeId = n.id;
      this.actions.select(n.id);
      this.actions.follow(n.id);
      this.viewFamilyOf(n.id, false);
      this.setNote(`Following ${nodeName(n).toLowerCase()}. Close this page to watch.`);
    } else {
      this.viewFamilyOf(n.id, false);
      this.setNote(`Showing the family of ${nodeName(n).toLowerCase()}, who has died.`);
    }
  }

  // ---- drawing ----------------------------------------------------------------------------------------------

  private render(): void {
    const t = this.tree;
    // heading line
    if (!t) {
      setText(this.sub, this.loaded ? '' : 'Reading the family record.');
    } else {
      const s = t.self;
      const bits = [`${nodeName(s)}, ${s.male ? 'male' : 'female'}`];
      if (s.gen > 0) bits.push(`generation ${s.gen}`);
      else bits.push('one of the first');
      if (s.pack >= 0 && s.sp === Sp.Wolf) bits.push(`${packName(s.pack)} pack`);
      if (!s.alive) bits.push('dead');
      setText(this.sub, bits.join(', '));
    }
    const back = this.homeId >= 0 && this.viewId !== this.homeId;
    this.backBtn.hidden = !back;
    if (back) this.backBtn.textContent = 'Back to the one you picked';
    // the dynasty tab only for a wolf with a pack
    const canDyn = !!t && this.hasDynasty(t);
    this.seg.el.hidden = !canDyn;

    if (!t) {
      this.sig = '';
      this.chart = null;
      this.scroll.replaceChildren(
        this.loaded
          ? h('div', { class: 'tg-fam-empty' },
              h('p', { class: 'tg-fam-empty-h', text: 'No family record for this animal.' }),
              h('p', { text: 'The valley remembers an animal once it has young, leads a pack, or is followed. This one has none of those yet.' }))
          : h('div', { class: 'tg-fam-empty' }, h('p', { text: 'Reading the family record.' })),
      );
      this.setFoot('');
      return;
    }

    if (this.tab === 'dynasty' && canDyn) this.renderDynasty(t);
    else this.renderTree(t);
  }

  private setFoot(text: string): void {
    setText(this.hint, text);
  }

  private renderTree(t: LineageTree): void {
    const lay = layoutPedigree(t);
    const sig = `t|${this.viewId}|${lay.nodes.map((n) => `${n.key}:${n.node ? `${n.node.alive ? 1 : 0}${n.node.children}.${n.node.kills}.${n.node.died}.${this.genes.has(n.node.id) ? 1 : 0}` : 'x'}`).join(',')}|${lay.hiddenKids}`;
    if (sig === this.sig) return;
    this.sig = sig;

    const W = lay.width * SLOT;
    const H = lay.tiers * CARD_H + (lay.tiers - 1) * ROW_GAP;
    const px = (v: number): string => `calc(${v.toFixed(2)} * var(--u))`;
    const byKey = new Map(lay.nodes.map((n) => [n.key, n]));
    const top = (n: PedNode): number => n.tier * (CARD_H + ROW_GAP);
    const left = (n: PedNode): number => n.x * SLOT - SLOT / 2 + CARD_PAD;

    // links first, under the cards: parent bottom to child top, with the bend half way down the gap
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tg-fam-links');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.style.width = px(W);
    svg.style.height = px(H);
    for (const l of lay.links) {
      const a = byKey.get(l.from);
      const b = byKey.get(l.to);
      if (!a || !b) continue;
      const x1 = a.x * SLOT, y1 = top(a) + CARD_H, x2 = b.x * SLOT, y2 = top(b);
      // ancestors are above the child, the young below: always draw the upper end first
      const [ux, uy, lx, ly] = y1 <= y2 ? [x1, y1, x2, y2] : [x2, y2 + CARD_H, x1, y1 - CARD_H];
      const mid = (uy + ly) / 2;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${ux} ${uy}V${mid}H${lx}V${ly}`);
      const ph = !a.node || !b.node;
      p.setAttribute('class', `tg-fam-link${ph ? ' is-soft' : ''}`);
      svg.append(p);
    }

    const cards = lay.nodes.map((n) => this.card(n, lay.selfKey));
    const chart = h('div', { class: 'tg-fam-chart' }, svg, ...cards);
    chart.style.width = px(W);
    chart.style.height = px(H);
    cards.forEach((c, i) => {
      const n = lay.nodes[i];
      c.style.left = px(left(n));
      c.style.top = px(top(n));
      c.style.width = px(SLOT - 2 * CARD_PAD);
      c.style.height = px(CARD_H);
    });
    this.chart = chart;
    this.scroll.replaceChildren(chart);
    this.fit();
    const more = lay.hiddenKids > 0 ? ` ${lay.hiddenKids} more young are not drawn.` : '';
    this.setFoot(`Click a living relative to follow it. Click one who has died to centre the tree on them.${more}`);
  }

  private card(p: PedNode, selfKey: string): HTMLElement {
    const n = p.node;
    if (!n) {
      const why = p.hole === 'sire' ? 'Not recorded' : 'Record lost';
      return h('div', { class: 'tg-fam-node is-ph', title: p.hole === 'sire' ? 'The sire of this animal was not recorded.' : 'The record of this ancestor is gone.' },
        h('span', { class: 'tg-fam-role', text: p.role ?? '' }),
        h('span', { class: 'tg-fam-why', text: why }),
      );
    }
    const self = p.key === selfKey;
    const dead = !n.alive;
    const genes = this.genes.get(n.id);
    const traits = genes ? traitChips(n.sp, genes) : [];
    // the little lines at the foot of a card: a pack alpha says so, then the traits where they are known (animals the player has
    // picked), otherwise what the record holds: young and kills. A dead animal's cause of death takes two lines, so it gets fewer.
    const chips: string[] = [];
    if (n.alpha) chips.push('Alpha');
    if (traits.length) chips.push(...traits);
    else {
      if (n.gen <= 0) chips.push('Founder');
      if (n.children > 0) chips.push(`${n.children} young`);
      if (n.kills > 0) chips.push(`${n.kills} ${n.kills === 1 ? 'kill' : 'kills'}`);
    }
    if (p.hiddenKids) chips.push(`+${p.hiddenKids} below`);
    const maxChips = dead ? 2 : 3;
    const status = dead ? causeText(n) : 'Alive';
    const tip = [
      `${nodeName(n)}, ${n.male ? 'male' : 'female'}${n.alpha ? ', a pack alpha' : ''}.`,
      lifeText(n) + (dead ? `. ${causeText(n)}.` : '.'),
      n.gen > 0 ? `Generation ${n.gen}.` : 'One of the first.',
      n.children > 0 ? `${n.children} young${n.kills > 0 ? `, ${n.kills} kills` : ''}.` : '',
      traits.length ? `Traits against the founders: ${traits.join(', ')}.` : 'Traits are shown for animals you have picked.',
      self ? '' : n.alive ? 'Click to select and follow.' : 'Click to centre the tree on this animal.',
    ].filter(Boolean).join(' ');
    const inner = [
      h('span', { class: 'tg-fam-top' },
        h('span', { class: `tg-fam-sex ${n.male ? 'is-m' : 'is-f'}`, text: n.male ? '♂' : '♀', 'aria-hidden': 'true' }),
        // the species is in the heading and the tooltip: on the card the number is what tells relatives apart
        h('span', { class: 'tg-fam-name', text: `#${n.id}` }),
        n.alive ? h('span', { class: 'tg-fam-live', title: 'Alive', 'aria-hidden': 'true' }) : null),
      h('span', { class: 'tg-fam-life', text: lifeText(n) }),
      h('span', { class: `tg-fam-status${dead ? ' is-dead' : ' is-alive'}`, text: status }),
      h('span', { class: `tg-fam-chips${n.alpha ? ' has-alpha' : ''}` }, ...chips.slice(0, maxChips).map((c) => h('span', { class: `tg-fam-chip${c === 'Alpha' ? ' is-alpha' : ''}`, text: c }))),
    ];
    const cls = `tg-fam-node${self ? ' is-self' : ''}${dead ? ' is-dead' : ''}`;
    const style = `--sp: var(--sp-${n.sp})`;
    if (self) return h('div', { class: cls, style, title: tip, 'aria-label': tip }, ...inner);
    return button({ class: cls, style, title: tip, 'aria-label': tip, onclick: () => this.pick(n) }, ...inner);
  }

  // ---- the pack dynasty -------------------------------------------------------------------------------------

  private renderDynasty(t: LineageTree): void {
    const pack = t.self.pack;
    const list = this.dyn && this.dyn.pack === pack ? this.dyn.list : null;
    const lay = list ? layoutDynasty(list, this.now) : null;
    const sig = `d|${this.viewId}|${pack}|${list ? list.length : -1}|${list && list.length ? list[list.length - 1].tick : 0}|${Math.floor(this.now / 200)}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.chart = null;
    const name = `${packName(pack)} pack`;
    if (!lay || !lay.f.length) {
      this.scroll.replaceChildren(
        h('div', { class: 'tg-fam-empty' },
          h('p', { class: 'tg-fam-empty-h', text: list ? `No alpha pairs are recorded for the ${name}.` : 'Reading the alpha record.' }),
          list ? h('p', { text: 'A pack is only written down once it has an alpha pair.' }) : null),
      );
      this.setFoot('');
      return;
    }
    const pct = (v: number): string => `${(v * 100).toFixed(3)}%`;
    const laneEl = (label: string, glyph: string, segs: DynSeg[], male: boolean): HTMLElement => {
      const track = h('div', { class: 'tg-fam-track' });
      segs.forEach((s, i) => {
        const years = yearOfTick(s.from) === yearOfTick(s.to - 1) ? `Year ${yearOfTick(s.from)}` : `Year ${yearOfTick(s.from)} to ${i === segs.length - 1 ? 'now' : yearOfTick(s.to)}`;
        const wide = s.x1 - s.x0 > 0.09;
        const last = i === segs.length - 1;
        const cls = `tg-fam-seg${s.vacant ? ' is-vacant' : ''}${last ? ' is-last' : ''}${male ? ' is-m' : ' is-f'}`;
        // a bar too thin for its number says nothing on its face (the tooltip has it all)
        const kids = s.vacant ? [] : [s.x1 - s.x0 > 0.045 ? h('span', { class: 'tg-fam-seg-id', text: `#${s.id}` }) : null, wide ? h('span', { class: 'tg-fam-seg-yrs', text: years }) : null];
        const el = s.vacant
          ? h('div', { class: cls, title: `${label}: the seat was empty. ${years}.` }, wide ? h('span', { class: 'tg-fam-seg-yrs', text: 'vacant' }) : null)
          : button({ class: cls, title: `${label} #${s.id}. ${years}. Click to see this animal's family.`, 'aria-label': `${label} number ${s.id}, ${years}. Show its family.`, onclick: () => this.pickId(s.id) }, ...kids);
        el.style.left = pct(s.x0);
        el.style.width = `calc(${pct(s.x1 - s.x0)} - 2px)`;
        track.append(el);
      });
      return h('div', { class: 'tg-fam-lane' }, h('span', { class: `tg-fam-lane-l ${male ? 'is-m' : 'is-f'}`, title: label, text: glyph }), track);
    };
    const axis = h('div', { class: 'tg-fam-axis', 'aria-hidden': 'true' });
    axis.append(h('span', { class: 'tg-fam-tick is-edge', style: 'left:0', text: `Year ${yearOfTick(lay.t0)}` }));
    for (const k of lay.ticks) axis.append(h('span', { class: 'tg-fam-tick', style: `left:${pct(k.x)}`, text: String(k.year) }));
    axis.append(h('span', { class: 'tg-fam-tick is-edge is-end', style: 'left:100%', text: 'now' }));
    const fs = new Set(lay.f.filter((s) => !s.vacant).map((s) => s.id)).size;
    const ms = new Set(lay.m.filter((s) => !s.vacant).map((s) => s.id)).size;
    const dyn = h('div', { class: 'tg-fam-dyn', style: `--sp: var(--sp-${Sp.Wolf})` },
      h('p', { class: 'tg-fam-dyn-h', text: `The ${name}: ${fs} alpha ${fs === 1 ? 'female' : 'females'} and ${ms} alpha ${ms === 1 ? 'male' : 'males'}` + (lay.changes > 0 ? `, ${lay.changes} ${lay.changes === 1 ? 'change' : 'changes'} of the guard.` : ', no change of the guard.') }),
      laneEl('Alpha female', '♀', lay.f, false),
      laneEl('Alpha male', '♂', lay.m, true),
      axis);
    this.scroll.replaceChildren(dyn);
    this.fit();
    this.setFoot(`Each bar is one alpha, from the day it took the seat to the day it lost it. Click one to see its family. Hatched means the seat stood empty.`);
  }

  private pickId(id: number): void {
    this.tab = 'tree';
    this.seg.set('tree');
    this.viewFamilyOf(id, true);
    this.setNote('');
  }

  // ---- fitting ----------------------------------------------------------------------------------------------

  /** A chart wider (or taller) than the page shrinks to fit, down to a floor; past that it scrolls. */
  private fit(): void {
    const c = this.chart;
    if (!c || !this.open) {
      if (this.open) this.edges();
      return;
    }
    const z =c.style as CSSStyleDeclaration & { zoom: string };
    z.zoom = '1';
    const cs = getComputedStyle(this.scroll);
    const availW = this.scroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
    const availH = this.scroll.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2;
    const w = c.offsetWidth;
    const hh = c.offsetHeight;
    if (w <= 0 || hh <= 0 || availW <= 0) return;
    const k = Math.max(0.68, Math.min(1, availW / w, availH > 60 ? availH / hh : 1));
    z.zoom = k >= 0.999 ? '1' : k.toFixed(3);
    this.edges();
  }

  /** When the chart is taller than the page, fade the edge that has more behind it, so a cut-off row reads as "scroll" and not as a bug. */
  private edges(): void {
    const s = this.scroll;
    const top = s.scrollTop > 2;
    const bottom = s.scrollHeight - s.scrollTop - s.clientHeight > 2;
    const key = `${top ? 1 : 0}${bottom ? 1 : 0}`;
    if (s.dataset.edges === key) return;
    s.dataset.edges = key;
    const fade = 'calc(26 * var(--u))';
    const v = !top && !bottom ? 'none' : `linear-gradient(to bottom, ${top ? `transparent, #000 ${fade}` : '#000, #000'}, ${bottom ? `#000 calc(100% - ${fade}), transparent` : '#000, #000'})`;
    s.style.maskImage = v;
    s.style.webkitMaskImage = v;
  }

  /** Re-fit on the next frame: a resize of the page fires this from inside the observer, where changing size again is a loop. */
  private fitSoon(): void {
    if (this.fitQueued) return;
    this.fitQueued = true;
    requestAnimationFrame(() => {
      this.fitQueued = false;
      this.fit();
      this.edges();
    });
  }
}
