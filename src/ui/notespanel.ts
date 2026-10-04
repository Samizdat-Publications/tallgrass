// The field notes panel (a notebook page) and the quiet toast that announces a new note.
import { button, h, setText } from './dom';
import { icon } from './icons';
import { NOTES, NOTE_COUNT, type FieldNotes, type NoteDef } from './fieldnotes';

/** A tick drawn a little unevenly, like a pencil mark, so the notebook does not look stamped. */
const TICK =
  '<svg class="tg-tick" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3.6 12.9c1.9 1.2 3.2 2.9 4.5 5.3 1.7-4.9 5.6-9.5 11.6-13.2"/></svg>';
/** The empty box of a note not yet earned: a loose, open circle. */
const RING =
  '<svg class="tg-ring" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M12.4 4.6c4.1.1 7.2 3.2 7 7.4-.2 4-3.4 7.1-7.5 7.1-4 0-7.2-3.1-7.1-7.2.1-3.8 2.7-6.9 6.8-7.2" stroke-dasharray="2.6 2.2"/></svg>';

export class NotesPanel {
  readonly el: HTMLElement;
  private count: HTMLElement;
  private list: HTMLElement;
  private rows = new Map<string, HTMLElement>();
  private clearBtn: HTMLButtonElement;
  private more: HTMLElement;
  private armed = 0;
  private open = false;
  private onDocDown: (e: PointerEvent) => void;

  constructor(private notes: FieldNotes, private onClose: () => void) {
    this.count = h('span', { class: 'tg-notes-count' });
    this.list = h('ol', { class: 'tg-notes-list' });
    for (const n of NOTES) {
      const row = h('li', { class: 'tg-note' });
      this.rows.set(n.id, row);
      this.list.append(row);
    }
    this.clearBtn = button({ class: 'tg-notes-clear', text: 'Clear field notes', onclick: () => this.clickClear() });
    this.more = h('span', { class: 'tg-notes-more', text: 'More below', hidden: true });
    this.el = h(
      'section',
      { class: 'tg-notes tg-glass tg-leaf', role: 'dialog', 'aria-label': 'Field notes', hidden: true },
      h(
        'header',
        { class: 'tg-notes-head' },
        h('h2', { class: 'tg-notes-title', text: 'Field notes' }),
        this.count,
        button({ class: 'tg-iconbtn', 'aria-label': 'Close the field notes', title: 'Close (Esc)', html: icon('close', 16), onclick: () => this.onClose() }),
      ),
      h('p', { class: 'tg-notes-sub', text: 'Moments of the valley you have witnessed. Each is ticked the first time it happens.' }),
      this.list,
      h('footer', { class: 'tg-notes-foot' }, this.more, this.clearBtn),
    );
    // the page scrolls; whatever is cut by its top or bottom edge fades away, so a row is never half shown
    this.list.addEventListener('scroll', () => this.trim(), { passive: true });
    this.onDocDown = (e) => {
      if (this.open && !this.el.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.tg-menu, .tg-menubtn')) this.onClose();
    };
    document.addEventListener('pointerdown', this.onDocDown);
    this.refresh();
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocDown);
    window.clearTimeout(this.armed);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-open');
    this.refresh();
    window.setTimeout(() => this.trim(), 260);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('is-open');
    this.disarm();
    window.setTimeout(() => {
      if (!this.open) this.el.hidden = true;
    }, 200);
  }

  /** Redraw the list from the notebook. Cheap: eighteen rows. */
  refresh(): void {
    setText(this.count, `${this.notes.count} of ${NOTE_COUNT}`);
    for (const n of NOTES) {
      const row = this.rows.get(n.id);
      if (!row) continue;
      const e = this.notes.get(n.id);
      row.classList.toggle('is-earned', !!e);
      row.replaceChildren(
        h('span', { class: 'tg-note-mark', html: e ? TICK : RING }),
        e
          ? h('span', { class: 'tg-note-body' }, h('span', { class: 'tg-note-title', text: n.title }), h('span', { class: 'tg-note-when', text: `Tallgrass, year ${e.year}` }))
          : h('span', { class: 'tg-note-body' }, h('span', { class: 'tg-note-hint', text: n.hint })),
      );
    }
    this.clearBtn.hidden = this.notes.count === 0;
    requestAnimationFrame(() => this.trim());
  }

  /** Mask away any row that is cut by the list's top or bottom edge. */
  private trim(): void {
    const l = this.list;
    const set = (v: string) => {
      l.style.maskImage = v;
      l.style.webkitMaskImage = v;
    };
    if (!this.open || l.clientHeight === 0) return;
    this.more.hidden = l.scrollTop + l.clientHeight >= l.scrollHeight - 2;
    const box = l.getBoundingClientRect();
    let first = 0;
    let last = l.clientHeight;
    const atTop = l.scrollTop <= 1;
    const atEnd = l.scrollTop + l.clientHeight >= l.scrollHeight - 2;
    let seen = false;
    for (const r of l.querySelectorAll<HTMLElement>('.tg-note')) {
      const b = r.getBoundingClientRect();
      if (b.bottom > box.bottom + 0.5) {
        if (!atEnd) break;
        continue;
      }
      if (!seen && b.top >= box.top - 0.5) {
        first = b.top - box.top;
        seen = true;
      }
      if (b.bottom > box.top) last = b.bottom - box.top;
    }
    if (atTop) first = 0;
    if (atEnd) last = l.clientHeight;
    if (first <= 0 && last >= l.clientHeight) return set('none');
    set(`linear-gradient(to bottom, transparent ${Math.max(0, first - 6).toFixed(1)}px, #000 ${first.toFixed(1)}px, #000 ${last.toFixed(1)}px, transparent ${(last + 7).toFixed(1)}px)`);
  }

  /** "Clear field notes" asks twice, so a stray click cannot wipe the notebook. */
  private clickClear(): void {
    if (this.armed) {
      this.disarm();
      this.notes.clear();
      return;
    }
    setText(this.clearBtn, 'Really clear them all?');
    this.clearBtn.classList.add('is-armed');
    this.armed = window.setTimeout(() => this.disarm(), 3500);
  }

  private disarm(): void {
    window.clearTimeout(this.armed);
    this.armed = 0;
    setText(this.clearBtn, 'Clear field notes');
    this.clearBtn.classList.remove('is-armed');
  }
}

/** The quiet toast in the lower left: "Field note: The first kill". */
export class NoteToast {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private on = false;
  private until = 0;

  constructor() {
    this.text = h('span', { class: 'tg-fn-text' });
    this.el = h(
      'div',
      { class: 'tg-fn-toast tg-glass tg-leaf', role: 'status', 'aria-live': 'polite' },
      h('span', { class: 'tg-fn-mark', html: TICK }),
      h('span', { class: 'tg-fn-label', text: 'Field note' }),
      this.text,
    );
  }

  get showing(): boolean {
    return this.on;
  }

  show(def: NoteDef, now: number, ms = 4200): void {
    this.text.textContent = def.title;
    this.on = true;
    this.until = now + ms;
    this.el.classList.add('is-on');
  }

  /** Call every frame: takes the toast down when its time is up. */
  tick(now: number): void {
    if (this.on && now >= this.until) this.hide();
  }

  hide(): void {
    this.on = false;
    this.el.classList.remove('is-on');
  }
}
