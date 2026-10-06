// Left rail: the god tools. Round icon buttons, labels slide out on hover or focus.
import { Sp } from '../sim/types';
import { button, h } from './dom';
import { icon } from './icons';
import { POSITIONAL_TOOLS, type ToolId, type UIActions } from './types';

interface ToolDef {
  id: ToolId;
  /** The short word that sits in the rail beside the icon. */
  short: string;
  /** The fuller name shown in the slide-out. */
  label: string;
  /** Species the tool is about: tints its icon so the animal tools are told apart at a glance. */
  species?: number;
  hint: string;
  armedHint: string;
  danger?: boolean;
  /** Visual group: a small gap separates groups. */
  group: number;
}

/** How long the rail shows its labels when a session opens: two minutes, long enough to learn what each icon does. */
const INTRO_MS = 120000;

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

export class ToolRail {
  readonly el: HTMLElement;
  private armed: ToolId | null = null;
  private wraps = new Map<ToolId, { wrap: HTMLElement; btn: HTMLButtonElement; hint: HTMLElement }>();
  private note: HTMLElement;
  private groups: HTMLElement[] = [];
  private lastRoom = -1;
  private disabled = false;

  constructor(private actions: UIActions) {
    this.el = h('nav', { class: 'tg-rail', 'aria-label': 'God tools', role: 'toolbar' });
    this.note = h('p', { class: 'tg-rail-note', role: 'status', hidden: true });
    this.el.append(h('p', { class: 'tg-rail-title tg-leaf', text: 'Tools' }), this.note);
    // open for a few seconds at the start so the labels are seen once, then settle to icons
    this.el.classList.add('is-intro');
    window.setTimeout(() => this.el.classList.remove('is-intro'), INTRO_MS);
    // each visual group sits in its own box: when the rail wraps into more columns the groups stay whole
    let lastGroup = -1;
    let groupEl: HTMLElement | null = null;
    for (const t of TOOL_DEFS) {
      if (t.group !== lastGroup || !groupEl) {
        groupEl = h('div', { class: 'tg-rail-group' });
        this.groups.push(groupEl);
        this.el.append(groupEl);
        lastGroup = t.group;
      }
      const btn = button(
        {
          class: `tg-tool tg-glass tg-leaf${t.danger ? ' is-danger' : ''}${t.species !== undefined ? ' is-species' : ''}`,
          style: t.species !== undefined ? `--tc:var(--sp-${t.species})` : undefined,
          'aria-label': t.label,
          'aria-pressed': POSITIONAL_TOOLS.has(t.id) ? 'false' : undefined,
          dataset: { tool: t.id },
          onclick: () => this.press(t),
        },
        h('span', { class: 'tg-tool-ic', html: icon(t.id, 20) }),
        h('span', { class: 'tg-tool-text', text: t.short }),
      );
      const hint = h('span', { class: 'tg-tool-hint', text: t.hint });
      const label = h('span', { class: 'tg-tool-label tg-glass' }, h('span', { class: 'tg-tool-name', text: t.label }), hint);
      const wrap = h('div', { class: 'tg-toolwrap' }, btn, label);
      groupEl.append(wrap);
      this.wraps.set(t.id, { wrap, btn, hint });
    }
    // When even the tallest group is taller than the room the rail has (a short window under a challenge card), drop the
    // groups and let the plain buttons wrap column by column instead, so none runs under the population panel.
    // The room the rail has changes with the window, the challenge card and the population panel, so look again when the window
    // resizes and twice a second (cheap: nothing is measured again unless the height changed). A ResizeObserver on the rail would
    // fire inside the observers that move the card and the panel, and the browser would report a loop.
    window.addEventListener('resize', () => this.fit(true));
    window.setInterval(() => this.fit(false), 500);
    window.requestAnimationFrame(() => this.fit(true));
  }

  private fit(force: boolean): void {
    const el = this.el;
    const room = el.clientHeight;
    if (room < 40 || (room === this.lastRoom && !force)) return;
    this.lastRoom = room;
    el.classList.remove('is-flat');
    const title = el.querySelector<HTMLElement>('.tg-rail-title');
    let need = 0;
    this.groups.forEach((g, i) => { need = Math.max(need, g.offsetHeight + (i === 0 && title ? title.offsetHeight + 8 : 0)); });
    el.classList.toggle('is-flat', need > room);
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

  get armedTool(): ToolId | null {
    return this.armed;
  }

  /** A short confirming pulse on an instant tool. */
  private flash(id: ToolId): void {
    const w = this.wraps.get(id);
    if (!w) return;
    w.wrap.classList.remove('is-flash');
    void w.wrap.offsetWidth;
    w.wrap.classList.add('is-flash');
  }
}
