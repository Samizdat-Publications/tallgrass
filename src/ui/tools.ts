// Top left, under the slate: one quiet "Tools" button. It opens a drawer with the god tools, labelled, in three groups; the drawer
// closes again when a tool is used, when the ground is clicked, on Esc, or on the shortcut (I). Nothing of it sits over the scene
// until it is asked for. A challenge keeps the button (with the interventions left on it), and the drawer greys out when none are.
import { Sp } from '../sim/types';
import { button, h, setText } from './dom';
import { icon } from './icons';
import { POSITIONAL_TOOLS, type ToolId, type UIActions } from './types';

interface ToolDef {
  id: ToolId;
  /** The short word that sits in the drawer beside the icon. */
  short: string;
  /** The fuller name (the button's accessible name). */
  label: string;
  /** Species the tool is about: tints its icon so the animal tools are told apart at a glance. */
  species?: number;
  hint: string;
  armedHint: string;
  danger?: boolean;
  /** Visual group: the drawer has one column per group. */
  group: number;
}

/** The three columns of the drawer. */
const GROUP_NAMES = ['Weather', 'Disasters', 'Wildlife and land'];

/** How long a first session's Tools button carries a line saying what it holds: two minutes, long enough to find it. */
const INTRO_MS = 120000;

const RAIL_SEEN_KEY = 'tallgrass.rail.seen.v1';

/** The shortcut that opens and closes the drawer. */
export const TOOLS_KEY = 'i';

/** Has this browser already had its first session with the introduced Tools button? Marks it seen as a side effect (the first call returns false). */
function railSeen(): boolean {
  try {
    if (window.localStorage.getItem(RAIL_SEEN_KEY) === '1') return true;
    window.localStorage.setItem(RAIL_SEEN_KEY, '1');
  } catch {
    /* storage unavailable: treat every visit as the first */
  }
  return false;
}

export const TOOL_DEFS: ToolDef[] = [
  { id: 'rain', short: 'Rain', label: 'Call rain', hint: 'Rain falls across the valley', armedHint: '', group: 0 },
  { id: 'drought', short: 'Drought', label: 'Bring drought', hint: 'The rains fail for a time', armedHint: '', group: 0 },
  { id: 'blizzard', short: 'Blizzard', label: 'Call a blizzard', hint: 'Snow and a bitter wind cross the valley', armedHint: '', danger: true, group: 0 },
  { id: 'flood', short: 'Flood', label: 'Flood the creek', hint: 'The creek spills over its banks', armedHint: '', danger: true, group: 0 },
  { id: 'fire', short: 'Fire', label: 'Start a fire', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', danger: true, group: 1 },
  { id: 'lightning', short: 'Lightning', label: 'Strike with lightning', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', danger: true, group: 1 },
  { id: 'plague', short: 'Plague', label: 'Spread plague', hint: 'Sickness runs through the herds', armedHint: '', danger: true, group: 1 },
  { id: 'distemper', short: 'Distemper', label: 'Spread distemper', hint: 'Sickness runs through wolves and coyotes', armedHint: '', danger: true, group: 1 },
  { id: 'cull', short: 'Cull', label: 'Cull the herd', hint: 'Thins out the bison', armedHint: '', danger: true, group: 1 },
  { id: 'addWolves', short: 'Add wolves', species: Sp.Wolf, label: 'Bring in wolves', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', group: 2 },
  { id: 'addBison', short: 'Add bison', species: Sp.Bison, label: 'Bring in bison', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', group: 2 },
  { id: 'addPrairieDogs', short: 'Add prairie dogs', species: Sp.PrairieDog, label: 'Start a prairie dog town', hint: 'Pick a spot on open grass', armedHint: 'Click the ground. Esc cancels', group: 2 },
  { id: 'grove', short: 'Plant grove', label: 'Plant a grove', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', group: 2 },
  { id: 'removeWolves', short: 'Remove wolves', species: Sp.Wolf, label: 'Remove the wolves', hint: 'Every wolf leaves the valley', armedHint: '', group: 2 },
];

const DEFAULT_HINT = 'Pick a tool. Fire, lightning, wolves, bison, prairie dogs and groves then ask for a click on the ground.';

export class ToolRail {
  readonly el: HTMLElement;
  private armed: ToolId | null = null;
  private wraps = new Map<ToolId, { wrap: HTMLElement; btn: HTMLButtonElement; hint: HTMLElement }>();
  private note: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private toggleText: HTMLElement;
  private badge: HTMLElement;
  private drawer: HTMLElement;
  private hintLine: HTMLElement;
  private isOpenNow = false;
  private disabled = false;
  private onDocDown: (e: PointerEvent) => void;
  /** Told when the drawer opens or closes (the UI keeps the idle fade off while it is open). */
  onOpenChange?: (open: boolean) => void;

  constructor(private actions: UIActions) {
    this.el = h('nav', { class: 'tg-rail', 'aria-label': 'God tools' });
    // a first session's button carries a line saying what it holds; every later visit starts as the plain button
    // (a calmer frame, more landscape). Storage may be blocked: then the line just shows each time, as before.
    if (!railSeen()) {
      this.el.classList.add('is-intro');
      window.setTimeout(() => this.el.classList.remove('is-intro'), INTRO_MS);
    }

    this.toggleText = h('span', { class: 'tg-tools-text', text: 'Tools' });
    this.badge = h('span', { class: 'tg-tools-badge', hidden: true, 'aria-hidden': 'true' });
    this.toggleBtn = button(
      {
        class: 'tg-tools-btn tg-glass tg-leaf',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
        'aria-controls': 'tg-tools-drawer',
        title: `Tools: weather, disasters and wildlife (${TOOLS_KEY.toUpperCase()})`,
        onclick: () => this.onToggle(),
      },
      h('span', { class: 'tg-tools-ic', html: icon('wand', 18) }),
      this.toggleText,
      this.badge,
      h('kbd', { class: 'tg-kbd tg-tools-kbd', text: TOOLS_KEY.toUpperCase() }),
      h('span', { class: 'tg-tools-intro', text: 'rain, fire, wolves and more' }),
    );

    this.note = h('p', { class: 'tg-rail-note', role: 'status', hidden: true });
    this.hintLine = h('p', { class: 'tg-rail-hint', text: DEFAULT_HINT });
    const cols = h('div', { class: 'tg-rail-cols' });
    let lastGroup = -1;
    let groupEl: HTMLElement | null = null;
    for (const t of TOOL_DEFS) {
      if (t.group !== lastGroup || !groupEl) {
        groupEl = h('div', { class: 'tg-rail-group', role: 'group', 'aria-label': GROUP_NAMES[t.group] ?? 'Tools' }, h('p', { class: 'tg-rail-gtitle tg-leaf', text: GROUP_NAMES[t.group] ?? '' }));
        cols.append(groupEl);
        lastGroup = t.group;
      }
      const btn = button(
        {
          class: `tg-tool${t.danger ? ' is-danger' : ''}${t.species !== undefined ? ' is-species' : ''}`,
          style: t.species !== undefined ? `--tc:var(--sp-${t.species})` : undefined,
          'aria-label': t.label,
          'aria-pressed': POSITIONAL_TOOLS.has(t.id) ? 'false' : undefined,
          title: `${t.label}. ${t.hint}`,
          dataset: { tool: t.id },
          onclick: () => this.press(t),
        },
        h('span', { class: 'tg-tool-ic', html: icon(t.id, 20) }),
        h('span', { class: 'tg-tool-text', text: t.short }),
      );
      const hint = h('span', { class: 'tg-tool-hint tg-sr', text: t.hint });
      const wrap = h('div', { class: 'tg-toolwrap' }, btn, hint);
      const say = () => { this.hintLine.textContent = `${t.label}. ${this.armed === t.id && t.armedHint ? t.armedHint : t.hint}`; };
      btn.addEventListener('pointerenter', say);
      btn.addEventListener('focus', say);
      btn.addEventListener('pointerleave', () => { this.hintLine.textContent = DEFAULT_HINT; });
      btn.addEventListener('blur', () => { this.hintLine.textContent = DEFAULT_HINT; });
      groupEl.append(wrap);
      this.wraps.set(t.id, { wrap, btn, hint });
    }
    this.drawer = h('div', { class: 'tg-rail-drawer tg-glass', id: 'tg-tools-drawer', role: 'toolbar', 'aria-label': 'God tools' }, cols, this.note, this.hintLine);
    this.el.append(this.toggleBtn, this.drawer);
    this.onDocDown = (e) => {
      if (this.isOpenNow && !this.el.contains(e.target as Node)) this.close();
    };
    document.addEventListener('pointerdown', this.onDocDown);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocDown);
  }

  // ---- the drawer --------------------------------------------------------------------------------------------

  get isOpen(): boolean {
    return this.isOpenNow;
  }

  open(): void {
    if (this.isOpenNow) return;
    this.isOpenNow = true;
    this.el.classList.add('is-open');
    this.toggleBtn.setAttribute('aria-expanded', 'true');
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.isOpenNow) return;
    this.isOpenNow = false;
    this.el.classList.remove('is-open');
    this.toggleBtn.setAttribute('aria-expanded', 'false');
    this.hintLine.textContent = DEFAULT_HINT;
    this.onOpenChange?.(false);
  }

  /** The shortcut: open the drawer, or put it away. */
  toggle(): void {
    if (this.isOpenNow) this.close();
    else this.open();
  }

  private onToggle(): void {
    // while a positional tool is armed the button says so, and a click on it lets the tool go
    if (this.armed) {
      this.setArmed(null);
      this.actions.armTool(null);
      return;
    }
    this.toggle();
  }

  private press(t: ToolDef): void {
    if (POSITIONAL_TOOLS.has(t.id)) {
      const next = this.armed === t.id ? null : t.id;
      this.setArmed(next);
      this.actions.armTool(next);
    } else {
      this.actions.applyTool(t.id);
      this.flash(t.id);
    }
    // the drawer gets out of the way: a positional tool needs the ground, an instant one is done
    this.close();
  }

  /** Visual state only: main calls this when it arms or disarms on its own. */
  setArmed(tool: ToolId | null): void {
    this.armed = tool;
    for (const [id, w] of this.wraps) {
      const on = id === tool;
      w.wrap.classList.toggle('is-armed', on);
      if (POSITIONAL_TOOLS.has(id)) w.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const def = TOOL_DEFS.find((d) => d.id === id);
      if (def) w.hint.textContent = on && def.armedHint ? def.armedHint : def.hint;
    }
    const def = tool ? TOOL_DEFS.find((d) => d.id === tool) : null;
    this.el.classList.toggle('is-armed', !!def);
    setText(this.toggleText, def ? `${def.short}: click the ground` : 'Tools');
    this.toggleBtn.title = def ? `${def.label}. Click the ground to place it, or click here or press Esc to let it go.` : `Tools: weather, disasters and wildlife (${TOOLS_KEY.toUpperCase()})`;
  }

  /** Lock the whole rail (a challenge has spent its interventions) and say why in a short note. */
  setDisabled(on: boolean, note = ''): void {
    if (on === this.disabled) return;
    this.disabled = on;
    this.el.classList.toggle('is-disabled', on);
    for (const w of this.wraps.values()) {
      w.btn.disabled = on;
      w.btn.setAttribute('aria-disabled', String(on));
    }
    this.note.hidden = !on;
    this.note.textContent = on ? note : '';
    if (on && this.armed) this.setArmed(null);
  }

  /** The interventions a challenge still allows, shown on the button (null: no limit, nothing shown). */
  setBudget(left: number | null): void {
    this.badge.hidden = left === null;
    if (left !== null) setText(this.badge, String(left));
    this.el.classList.toggle('has-budget', left !== null);
    this.el.classList.toggle('is-spent', left === 0);
    this.toggleBtn.setAttribute('aria-label', left === null ? 'Tools' : `Tools, ${left} ${left === 1 ? 'intervention' : 'interventions'} left`);
  }

  get armedTool(): ToolId | null {
    return this.armed;
  }

  /** A short confirming pulse on the button after an instant tool (the drawer has already closed). */
  private flash(id: ToolId): void {
    void id;
    this.toggleBtn.classList.remove('is-flash');
    void this.toggleBtn.offsetWidth;
    this.toggleBtn.classList.add('is-flash');
  }
}
