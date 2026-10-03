// Tiny DOM helpers. No framework: the UI is plain DOM + CSS.

type Child = Node | string | number | null | undefined | false;
type Props = {
  class?: string;
  text?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  [attr: string]: unknown;
};

/** Create an element. Props starting with "on" become listeners; everything else becomes an attribute. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'dataset') Object.assign(el.dataset, v as Record<string, string>);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

/** A button with an icon and/or text. Always type=button so it never submits anything. */
export function button(props: Props, ...children: Child[]): HTMLButtonElement {
  return h('button', { type: 'button', ...props }, ...children);
}

export function setText(el: Node, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Computed pixel size of the UI's scale unit (--u), which is 1 px at 1600 wide and grows on large screens. */
export function unitPx(root: HTMLElement): number {
  const probe = h('div', { style: 'position:absolute;visibility:hidden;width:var(--u);height:0;pointer-events:none' });
  root.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();
  return w > 0 ? w : 1;
}
