// Valley setup ("New valley"): choose who lives there, the climate, the winters, an open or closed valley and the calendar,
// then start. The choices become a flat param set (the same keys the harness and ?p= use); main restarts the game with
// that set and a seed. Nothing here touches the sim: the param names are read from src/sim/params.ts and species.ts.
import { defaultParams } from '../sim/params';
import { PARAM_PREFIX, SPECIES, type SpeciesDef } from '../sim/species';
import { segmented, switchRow, type Segmented, type SwitchRow } from './controls';
import { button, h, setText } from './dom';
import { ModalPanel } from './panel';
import { speciesColor } from './palette';
import { randomSeed } from './menu';

export type Climate = 'drier' | 'typical' | 'wetter';
export type Winters = 'milder' | 'typical' | 'harsher';
export type Calendar = 'slow' | 'standard' | 'quick';

export interface SetupState {
  /** Starting count per species id; 0 means the species is left out. */
  counts: Record<number, number>;
  climate: Climate;
  winters: Winters;
  open: boolean;
  /** Golden eagles and red-tailed hawks: they come and go with the seasons (the `raptors` switch), so they are one switch, not a count. */
  raptors: boolean;
  calendar: Calendar;
}

/** Species that never get a starting population (the rabbit waits to become a field species). */
const NOT_SETUP = new Set(['rabbit']);

/** Species the setup page offers: individual-agent species with a starting population param. Later species slot in on their own. */
export function setupSpecies(): SpeciesDef[] {
  return SPECIES.filter((s) => s.repr === 'agent' && !NOT_SETUP.has(s.key));
}

/** The param key for a species' starting count, e.g. "bison.initial" ("deer.initial" for pronghorn). */
export function initialKey(id: number): string {
  return `${PARAM_PREFIX[id]}.initial`;
}

/** How hard each choice leans on the number it moves, relative to the default. */
export const CLIMATE_GROWTH: Record<Climate, number> = { drier: 0.85, typical: 1, wetter: 1.15 };
/** Growth that is left during a drought (default 0.3): drier valleys are hit harder, wetter ones less. */
export const CLIMATE_DROUGHT: Record<Climate, number> = { drier: 0.2, typical: 0.3, wetter: 0.4 };
export const WINTER_DIEBACK: Record<Winters, number> = { milder: 0.5, typical: 1, harsher: 1.6 };
/** calendarScale: valley years get k times shorter (the game default is 2). */
export const CALENDAR_SCALE: Record<Calendar, number> = { slow: 1, standard: 2, quick: 4 };

/** Param names that switch an open valley on, in the order they are looked for (Track S adds `openPrairie`). */
const OPEN_KEYS = ['openPrairie'];

/** The param that makes the valley open, or null while the sim has none. */
export function openKey(): string | null {
  const p = defaultParams() as unknown as Record<string, unknown>;
  return OPEN_KEYS.find((k) => k in p) ?? null;
}

/** Is the standard valley open? (The sim's own default for the open param, false while it has none.) */
function defaultOpen(): boolean {
  const k = openKey();
  return k !== null && Number((defaultParams() as unknown as Record<string, unknown>)[k]) > 0;
}

/** The setup that reproduces the standard valley. */
export function defaultSetup(): SetupState {
  const counts: Record<number, number> = {};
  const d = defaultParams();
  for (const s of setupSpecies()) counts[s.id] = d.species[s.id]?.initial ?? 0;
  // open and raptors start as the standard valley has them (the sim's own defaults), so an untouched page gives no overrides
  return { counts, climate: 'typical', winters: 'typical', open: defaultOpen(), raptors: d.raptors > 0, calendar: 'standard' };
}

/**
 * The flat overrides for a setup: only what differs from the standard valley, so an untouched page gives {} and the
 * same valley every other link opens. Counts are whole animals.
 */
export function buildSetupParams(st: SetupState): Record<string, number> {
  const d = defaultParams();
  const out: Record<string, number> = {};
  for (const s of setupSpecies()) {
    const want = Math.max(0, Math.round(st.counts[s.id] ?? 0));
    if (want !== (d.species[s.id]?.initial ?? 0)) out[initialKey(s.id)] = want;
  }
  if (st.climate !== 'typical') {
    out.grassGrowth = +(d.grassGrowth * CLIMATE_GROWTH[st.climate]).toFixed(6);
    out.droughtGrowth = CLIMATE_DROUGHT[st.climate];
  }
  if (st.winters !== 'typical') out.winterDieback = +(d.winterDieback * WINTER_DIEBACK[st.winters]).toFixed(6);
  const ok = openKey();
  if (ok && st.open !== defaultOpen()) out[ok] = st.open ? 1 : 0;
  if (st.raptors !== d.raptors > 0) out.raptors = st.raptors ? 1 : 0;
  const cal = CALENDAR_SCALE[st.calendar];
  if (cal !== d.calendarScale) out.calendarScale = cal;
  return out;
}

/** The slider range for a species' count: twice the standard start, or a modest range for species that start with none. */
export function countRange(def: SpeciesDef): { max: number; step: number } {
  const d = defaultParams().species[def.id]?.initial ?? 0;
  const max = d > 0 ? Math.ceil((d * 2) / 10) * 10 : 20;
  return { max, step: max >= 400 ? 10 : 1 };
}

const CHOICE = {
  climate: [
    { id: 'drier' as const, label: 'Drier', title: 'Slower grass, and droughts bite harder' },
    { id: 'typical' as const, label: 'Typical' },
    { id: 'wetter' as const, label: 'Wetter', title: 'Faster grass, and droughts bite less' },
  ],
  winters: [
    { id: 'milder' as const, label: 'Milder', title: 'Less of the grass dies back in winter' },
    { id: 'typical' as const, label: 'Typical' },
    { id: 'harsher' as const, label: 'Harsher', title: 'More of the grass dies back in winter' },
  ],
  calendar: [
    { id: 'slow' as const, label: 'Long years', title: 'Seasons turn slowly: a valley year is twice the standard length' },
    { id: 'standard' as const, label: 'Standard' },
    { id: 'quick' as const, label: 'Quick years', title: 'Seasons turn fast: many generations in a short watch' },
  ],
};

interface SpeciesRow {
  row: HTMLElement;
  set(n: number): void;
}

export class SetupPanel extends ModalPanel {
  private st = defaultSetup();
  private rows = new Map<number, SpeciesRow>();
  private climate: Segmented<Climate>;
  private winters: Segmented<Winters>;
  private calendar: Segmented<Calendar>;
  private openSwitch: SwitchRow;
  private raptorSwitch: SwitchRow;
  private seed: HTMLInputElement;
  private warn: HTMLElement;

  constructor(private onStart: (seed: string, params: Record<string, number>) => void, onClose: () => void) {
    super({ title: 'New valley', sub: 'Choose who lives here and what the weather is like, then start a fresh valley.', cls: 'tg-setup', onClose });

    const list = h('div', { class: 'tg-setup-species' });
    // (the raptors have no starting count: they arrive with the seasons, so they get a switch below instead of a slider)
    for (const def of setupSpecies().filter((s) => s.guild !== 'raptor')) {
      const row = this.makeRow(def);
      this.rows.set(def.id, row);
      list.append(row.row);
    }

    this.climate = segmented<Climate>('Climate', CHOICE.climate, this.st.climate, (v) => (this.st.climate = v));
    this.winters = segmented<Winters>('Winters', CHOICE.winters, this.st.winters, (v) => (this.st.winters = v));
    this.calendar = segmented<Calendar>('Calendar', CHOICE.calendar, this.st.calendar, (v) => (this.st.calendar = v));
    const hasOpen = openKey() !== null;
    this.openSwitch = switchRow('Open valley', 'Animals can wander in from the hills and out of the valley.', this.st.open, (on) => (this.st.open = on));
    if (!hasOpen) this.openSwitch.setDisabled(true, 'Coming soon. For now the valley is closed.');
    this.raptorSwitch = switchRow('Hawks and eagles', 'Red-tailed hawks nest here in summer. Golden eagles winter here when the valley is open.', this.st.raptors, (on) => (this.st.raptors = on));

    this.seed = h('input', {
      class: 'tg-input',
      type: 'text',
      placeholder: 'A seed, or leave blank for a surprise',
      maxlength: '40',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Seed for the new valley',
    });
    this.seed.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.start();
    });
    this.warn = h('p', { class: 'tg-pane-note tg-setup-warn', hidden: true });

    this.body.append(
      h('h3', { class: 'tg-pane-h', text: 'Who lives here' }),
      list,
      this.warn,
      h('h3', { class: 'tg-pane-h', text: 'The weather' }),
      h('div', { class: 'tg-setup-line' }, h('span', { class: 'tg-setup-label', text: 'Climate' }), this.climate.el),
      h('div', { class: 'tg-setup-line' }, h('span', { class: 'tg-setup-label', text: 'Winters' }), this.winters.el),
      h('h3', { class: 'tg-pane-h', text: 'The valley' }),
      this.openSwitch.el,
      this.raptorSwitch.el,
      h('div', { class: 'tg-setup-line' }, h('span', { class: 'tg-setup-label', text: 'Calendar' }), this.calendar.el),
      h('h3', { class: 'tg-pane-h', text: 'Seed' }),
      h('div', { class: 'tg-menu-new' }, this.seed),
      h(
        'div',
        { class: 'tg-pane-foot tg-setup-foot' },
        button({ class: 'tg-notes-clear', text: 'Standard valley', onclick: () => this.reset() }),
        button({ class: 'tg-btn is-primary', text: 'Start the valley', onclick: () => this.start() }),
      ),
    );
    this.refresh();
  }

  /** The last non-zero count of a species, so switching it off and on again puts the number back. */
  private lastOn = new Map<number, number>();

  /** One species: a switch that carries its name (in its colour) and a slider for how many start. */
  private makeRow(def: SpeciesDef): SpeciesRow {
    const { max, step } = countRange(def);
    const start = this.st.counts[def.id];
    if (start > 0) this.lastOn.set(def.id, start);
    const val = h('span', { class: 'tg-slider-val' });
    const input = h('input', { class: 'tg-range', type: 'range', min: '0', max: String(max), step: String(step), 'aria-label': `${def.plural} at the start` });
    const sw = button(
      { class: 'tg-switch tg-switch-mini', role: 'switch', 'aria-checked': String(start > 0) },
      h('span', { class: 'tg-sc-name has-dot', text: def.plural, style: `--dot:${speciesColor(def.id)}` }),
      h('span', { class: 'tg-switch-track', 'aria-hidden': 'true' }, h('i', { class: 'tg-switch-knob' })),
    );
    const paint = (): void => {
      const n = Number(input.value);
      setText(val, n > 0 ? String(n) : 'none');
      input.style.setProperty('--fill', `${(n / max) * 100}%`);
      sw.setAttribute('aria-checked', String(n > 0));
    };
    const set = (n: number): void => {
      input.value = String(n);
      this.st.counts[def.id] = n;
      if (n > 0) this.lastOn.set(def.id, n);
      paint();
      this.refresh();
    };
    input.value = String(start);
    paint();
    input.addEventListener('input', () => set(Number(input.value)));
    input.addEventListener('change', () => input.blur());
    sw.addEventListener('click', () => {
      const on = this.st.counts[def.id] > 0;
      set(on ? 0 : Math.min(max, this.lastOn.get(def.id) ?? Math.max(step, Math.round(max / 4))));
    });
    return { row: h('div', { class: 'tg-setup-row' }, sw, input, val), set };
  }

  /** The current choices, for tests and for the title card. */
  get state(): SetupState {
    return this.st;
  }

  private reset(): void {
    this.st = defaultSetup();
    const fresh = defaultSetup().counts;
    for (const [id, r] of this.rows) r.set(fresh[id]);
    this.climate.set(this.st.climate);
    this.winters.set(this.st.winters);
    this.calendar.set(this.st.calendar);
    this.openSwitch.set(this.st.open);
    this.raptorSwitch.set(this.st.raptors);
    this.seed.value = '';
    this.refresh();
  }

  /** A valley with no bison or no grazers cannot feed its hunters; say so, but let it be started (it makes a fine story). */
  private refresh(): void {
    const c = this.st.counts;
    const bison = setupSpecies().find((s) => s.key === 'bison');
    const prong = setupSpecies().find((s) => s.key === 'pronghorn');
    const preds = setupSpecies().filter((s) => s.guild === 'predator');
    const grazers = (bison ? c[bison.id] ?? 0 : 0) + (prong ? c[prong.id] ?? 0 : 0);
    const hunters = preds.reduce((n, s) => n + (c[s.id] ?? 0), 0);
    let msg = '';
    if (grazers === 0 && hunters > 0) msg = 'With no bison or pronghorn the hunters will starve before long.';
    else if (grazers === 0) msg = 'Only the grass and the ravens: a quiet valley.';
    else if (hunters === 0) msg = 'With no hunters the herds will grow until the grass gives out.';
    this.warn.hidden = !msg;
    setText(this.warn, msg);
  }

  private start(): void {
    const seed = this.seed.value.trim() || randomSeed();
    this.onStart(seed, buildSetupParams(this.st));
  }
}
