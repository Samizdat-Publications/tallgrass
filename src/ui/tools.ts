// Left rail: the god tools. Round icon buttons, labels slide out on hover or focus.
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

export const TOOL_DEFS: ToolDef[] = [
  { id: 'rain', short: 'Rain', label: 'Call rain', hint: 'Rain falls across the valley', armedHint: '', group: 0 },
  { id: 'drought', short: 'Drought', label: 'Bring drought', hint: 'The rains fail for a time', armedHint: '', group: 0 },
  { id: 'fire', short: 'Fire', label: 'Start a fire', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', danger: true, group: 1 },
  { id: 'plague', short: 'Plague', label: 'Spread plague', hint: 'Sickness runs through the herds', armedHint: '', danger: true, group: 1 },
  { id: 'cull', short: 'Cull', label: 'Cull the herd', hint: 'Thins out the bison', armedHint: '', danger: true, group: 1 },
  { id: 'addWolves', short: 'Add wolves', species: 1, label: 'Bring in wolves', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', group: 2 },
  { id: 'addBison', short: 'Add bison', species: 0, label: 'Bring in bison', hint: 'Pick a spot on the ground', armedHint: 'Click the ground. Esc cancels', group: 2 },
  { id: 'removeWolves', short: 'Remove wolves', species: 1, label: 'Remove the wolves', hint: 'Every wolf leaves the valley', armedHint: '', group: 2 },
];

export class ToolRail {
  readonly el: HTMLElement;
  private armed: ToolId | null = null;
  private wraps = new Map<ToolId, { wrap: HTMLElement; btn: HTMLButtonElement; hint: HTMLElement }>();

  constructor(private actions: UIActions) {
    this.el = h('nav', { class: 'tg-rail', 'aria-label': 'God tools', role: 'toolbar' });
    let lastGroup = 0;
    for (const t of TOOL_DEFS) {
      if (t.group !== lastGroup) {
        this.el.append(h('div', { class: 'tg-rail-gap', 'aria-hidden': 'true' }));
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
      this.el.append(wrap);
      this.wraps.set(t.id, { wrap, btn, hint });
    }
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
