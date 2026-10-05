// Form controls in the game's own style (settings and valley setup): a segmented choice, a slider with its value, a switch row.
import { button, h, setText } from './dom';

export interface Segmented<T extends string> {
  el: HTMLElement;
  set(v: T): void;
  setDisabled(d: boolean): void;
}

/** A row of mutually exclusive choices. */
export function segmented<T extends string>(label: string, options: { id: T; label: string; title?: string }[], value: T, onPick: (v: T) => void): Segmented<T> {
  const btns = new Map<T, HTMLButtonElement>();
  const el = h('div', { class: 'tg-seg', role: 'radiogroup', 'aria-label': label });
  const set = (v: T): void => {
    for (const [id, b] of btns) {
      b.setAttribute('aria-checked', String(id === v));
      b.tabIndex = id === v ? 0 : -1;
    }
  };
  for (const o of options) {
    const b = button({
      class: 'tg-seg-btn',
      role: 'radio',
      title: o.title,
      text: o.label,
      onclick: () => {
        set(o.id);
        onPick(o.id);
      },
    });
    btns.set(o.id, b);
    el.append(b);
  }
  set(value);
  return {
    el,
    set,
    setDisabled(d) {
      el.classList.toggle('is-disabled', d);
      for (const b of btns.values()) b.disabled = d;
    },
  };
}

export interface Slider {
  el: HTMLElement;
  input: HTMLInputElement;
  set(v: number): void;
  setDisabled(d: boolean, note?: string): void;
}

/** A labelled range input with its current value written beside it. */
export function slider(label: string, min: number, max: number, step: number, value: number, format: (v: number) => string, onInput: (v: number) => void, blurb?: string): Slider {
  const val = h('span', { class: 'tg-slider-val' });
  const input = h('input', { class: 'tg-range', type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': label });
  const paint = (): void => {
    const v = Number(input.value);
    setText(val, format(v));
    input.style.setProperty('--fill', `${((v - min) / (max - min || 1)) * 100}%`);
  };
  input.value = String(value);
  paint();
  input.addEventListener('input', () => {
    paint();
    onInput(Number(input.value));
  });
  // a slider left focused would swallow the game's keys (Space, 1 2 3, H, C), so let go once the drag is done
  input.addEventListener('change', () => input.blur());
  const blurbEl = h('span', { class: 'tg-sc-blurb', text: blurb ?? '' });
  blurbEl.hidden = !blurb;
  const el = h(
    'label',
    { class: 'tg-slider' },
    h('span', { class: 'tg-slider-head' }, h('span', { class: 'tg-sc-name', text: label }), val),
    blurbEl,
    input,
  );
  return {
    el,
    input,
    set(v) {
      input.value = String(v);
      paint();
    },
    setDisabled(d, note) {
      input.disabled = d;
      el.classList.toggle('is-disabled', d);
      blurbEl.textContent = d && note ? note : blurb ?? '';
      blurbEl.hidden = !(d && note) && !blurb;
    },
  };
}

export interface SwitchRow {
  el: HTMLButtonElement;
  set(on: boolean): void;
  setDisabled(d: boolean, note?: string): void;
}

/** The menu's switch (name, one line of explanation, a track and knob). */
export function switchRow(name: string, blurb: string, on: boolean, onToggle: (on: boolean) => void): SwitchRow {
  let state = on;
  const blurbEl = h('span', { class: 'tg-sc-blurb', text: blurb });
  const el = button(
    {
      class: 'tg-switch',
      role: 'switch',
      'aria-checked': String(on),
      onclick: () => {
        state = !state;
        el.setAttribute('aria-checked', String(state));
        onToggle(state);
      },
    },
    h('span', { class: 'tg-switch-text' }, h('span', { class: 'tg-sc-name', text: name }), blurbEl),
    h('span', { class: 'tg-switch-track', 'aria-hidden': 'true' }, h('i', { class: 'tg-switch-knob' })),
  );
  return {
    el,
    set(v) {
      state = v;
      el.setAttribute('aria-checked', String(v));
    },
    setDisabled(d, note) {
      el.disabled = d;
      el.classList.toggle('is-disabled', d);
      setText(blurbEl, d && note ? note : blurb);
    },
  };
}
