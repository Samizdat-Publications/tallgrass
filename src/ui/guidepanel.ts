// The field guide page: a tab for each species, its ecology note, the behaviours to witness, and the photographs taken of it.
import { button, h, setText } from './dom';
import { icon } from './icons';
import { RING, TICK } from './notespanel';
import { ModalPanel } from './panel';
import { speciesColor } from './palette';
import { WITNESS_RADIUS, type FieldGuide, type GuidePage, type Photo, type PhotoStore } from './fieldguide';

export class GuidePanel extends ModalPanel {
  private tabs = new Map<string, HTMLButtonElement>();
  private tabCount = new Map<string, HTMLElement>();
  private page: HTMLElement;
  private total: HTMLElement;
  private current: GuidePage;
  private photos: Photo[] = [];
  private urls: string[] = [];
  private lightbox: HTMLElement;
  private lightImg: HTMLImageElement;
  private lightNote: HTMLElement;
  private loadToken = 0;
  private lightUrl = '';

  constructor(
    private guide: FieldGuide,
    private store: PhotoStore,
    private onPhotograph: () => void,
    onClose: () => void,
  ) {
    super({
      title: 'Field guide',
      sub: `Witness each behaviour by keeping the camera within ${WITNESS_RADIUS} metres of it. Press Photograph to keep a picture.`,
      wide: true,
      cls: 'tg-guide',
      onClose,
    });
    this.current = guide.pages[0];
    this.total = h('span', { class: 'tg-notes-count' });
    this.headExtra.append(this.total);

    const tabs = h('div', { class: 'tg-guide-tabs', role: 'tablist', 'aria-label': 'Species' });
    for (const p of guide.pages) {
      const count = h('span', { class: 'tg-guide-tabcount' });
      const b = button(
        { class: 'tg-guide-tab', role: 'tab', 'aria-selected': 'false', style: `--dot:${speciesColor(p.sp.id)}`, onclick: () => this.select(p) },
        h('i', { class: 'tg-guide-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tg-guide-tabname', text: p.sp.plural }),
        count,
      );
      this.tabs.set(p.sp.key, b);
      this.tabCount.set(p.sp.key, count);
      tabs.append(b);
    }
    this.page = h('div', { class: 'tg-guide-page', role: 'tabpanel' });

    this.lightImg = h('img', { class: 'tg-guide-lightimg', alt: 'A photograph from the field guide' });
    this.lightNote = h('div', { class: 'tg-guide-lightnote' });
    this.lightbox = h(
      'div',
      { class: 'tg-guide-light', hidden: true, onclick: () => this.closeLight() },
      this.lightImg,
      this.lightNote,
    );
    this.body.append(tabs, this.page, this.lightbox);
    this.render();
  }

  protected override onShow(): void {
    this.render();
    void this.loadPhotos();
  }

  protected override onHide(): void {
    this.closeLight();
  }

  /** Redraw after progress changes. Cheap: a handful of rows. */
  refresh(): void {
    if (this.isOpen) this.render();
    else this.updateTabs();
  }

  /** Open on a given species page (by key), if the guide has one. */
  openOn(speciesKey: string): void {
    const p = this.guide.pages.find((x) => x.sp.key === speciesKey);
    if (p) this.current = p;
  }

  /** A photograph was just stored: reload the strip. */
  photoAdded(): void {
    void this.loadPhotos();
  }

  private select(p: GuidePage): void {
    this.current = p;
    this.render();
  }

  private updateTabs(): void {
    const t = this.guide.total();
    setText(this.total, `${t.seen} of ${t.total}`);
    for (const p of this.guide.pages) {
      const g = this.guide.progress(p);
      const b = this.tabs.get(p.sp.key);
      const c = this.tabCount.get(p.sp.key);
      if (c) setText(c, `${g.seen}/${g.total}`);
      if (b) {
        b.setAttribute('aria-selected', String(p === this.current));
        b.classList.toggle('is-done', g.seen === g.total);
      }
    }
  }

  private render(): void {
    this.updateTabs();
    // the strip makes fresh object URLs each time it is drawn
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    const p = this.current;
    const g = this.guide.progress(p);
    const rows = p.behaviours.map((b) => {
      const seen = this.guide.seen(p.sp.key, b.id);
      const shots = this.guide.photographed(p.sp.key, b.id);
      const yr = this.guide.seenYear(p.sp.key, b.id);
      return h(
        'li',
        { class: `tg-note tg-guide-beh${seen ? ' is-earned' : ''}` },
        h('span', { class: 'tg-note-mark', html: seen ? TICK : RING }),
        h(
          'span',
          { class: 'tg-note-body' },
          h('span', { class: seen ? 'tg-note-title' : 'tg-note-hint', text: b.label }),
          seen ? h('span', { class: 'tg-note-when', text: `Witnessed in year ${yr ?? 1}${shots ? `, photographed ${shots > 1 ? shots + ' times' : 'once'}` : ''}` }) : null,
        ),
      );
    });
    const shutter = button({ class: 'tg-btn tg-guide-shoot', onclick: () => this.onPhotograph() }, h('span', { class: 'tg-guide-shootic', html: icon('camera', 16) }), 'Photograph');
    this.page.replaceChildren(
      h(
        'div',
        { class: 'tg-guide-head', style: `--dot:${speciesColor(p.sp.id)}` },
        h('h3', { class: 'tg-guide-name', text: p.sp.name }),
        h('span', { class: 'tg-guide-prog', text: `${g.seen} of ${g.total} witnessed` }),
      ),
      h('p', { class: 'tg-guide-note', text: p.note }),
      h('ol', { class: 'tg-notes-list tg-guide-list' }, ...rows),
      h('div', { class: 'tg-guide-photohead' }, h('h4', { class: 'tg-pane-h', text: 'Photographs' }), shutter),
      this.photoStrip(),
    );
  }

  private photoStrip(): HTMLElement {
    const mine = this.photos.filter((ph) => ph.species.includes(this.current.sp.id));
    if (!this.store.available) {
      return h('p', { class: 'tg-pane-note', text: 'This browser will not keep photographs, so each one is saved to your downloads instead.' });
    }
    if (!mine.length) return h('p', { class: 'tg-pane-note', text: `No photographs of ${this.current.sp.plural.toLowerCase()} yet. Frame one in the view and press Photograph.` });
    const strip = h('div', { class: 'tg-guide-strip' });
    for (const ph of mine.slice(0, 8)) {
      const url = URL.createObjectURL(ph.blob);
      this.urls.push(url);
      strip.append(
        button(
          { class: 'tg-guide-thumb', title: `Year ${ph.year}, seed ${ph.seed}`, onclick: () => this.openLight(ph) },
          h('img', { src: url, alt: `${this.current.sp.name}, year ${ph.year}`, loading: 'lazy' }),
        ),
      );
    }
    return strip;
  }

  private async loadPhotos(): Promise<void> {
    const token = ++this.loadToken;
    const list = await this.store.list();
    if (token !== this.loadToken) return;
    this.photos = list;
    if (this.isOpen) this.render();
  }

  private openLight(ph: Photo): void {
    if (this.lightUrl) URL.revokeObjectURL(this.lightUrl);
    this.lightUrl = URL.createObjectURL(ph.blob);
    this.lightImg.src = this.lightUrl;
    setText(this.lightNote, `Tallgrass, year ${ph.year}. Seed ${ph.seed}. Click to close.`);
    this.lightbox.hidden = false;
  }

  private closeLight(): void {
    this.lightbox.hidden = true;
    this.lightImg.removeAttribute('src');
    if (this.lightUrl) URL.revokeObjectURL(this.lightUrl);
    this.lightUrl = '';
  }

  override destroy(): void {
    for (const u of this.urls) URL.revokeObjectURL(u);
    super.destroy();
  }
}
