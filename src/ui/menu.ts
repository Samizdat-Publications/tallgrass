// Top right: the seed chip (click to copy) and the menu (scenarios, new world, keys).
import { button, h, setText } from './dom';
import { CHALLENGES, type Challenge } from '../challenges';
import { BASE_YEAR_TICKS, YEAR_TICKS, setCalendarScale } from '../sim/types';
import { NAMED_SEEDS, type NamedSeed } from '../seeds';
import { icon } from './icons';
import { SCENARIOS, type UIActions } from './types';

const WORDS = [
  'bluestem', 'switchgrass', 'cottonwood', 'sumac', 'meadowlark', 'bison', 'prairie', 'plover', 'larkspur', 'coneflower',
  'fescue', 'sandhill', 'harrier', 'gramma', 'sedge', 'redtail', 'thistle', 'dogwood', 'creekbed', 'wildrye',
];

/** The named world a seed belongs to, if any. */
export function namedSeed(seed: string): NamedSeed | undefined {
  const k = seed.trim();
  return NAMED_SEEDS.find((n) => n.seed === k);
}

/** A readable random seed: a prairie word and four digits. */
export function randomSeed(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${w}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}

const KEYS: [string[], string][] = [
  [['Space'], 'pause or resume'],
  [['1', '2', '3'], '1×, 10×, 100×'],
  [['N'], 'next event'],
  [['F'], 'follow the selected animal'],
  [['G'], 'grow or shrink the graph'],
  [['L'], 'log scale on the graph'],
  [['E'], 'evolution view of the graph'],
  [['C'], 'documentary mode: bars, drifting camera, no panels'],
  [['V'], 'narrator voice-over on or off'],
  [['H'], 'ambient view: hide everything; any key or click brings it back'],
  [['P'], 'save a picture of the view'],
  [['Esc'], 'let go, disarm, close'],
];

/**
 * A challenge pins its own calendar (the classic 2,400-tick year it was tuned in), whatever calendar this page runs.
 * Its blurb and length are written in valley years of that calendar, so the menu reads them under it, not under ours.
 */
function inChallengeCalendar<T>(c: Challenge, read: () => T): T {
  const mine = BASE_YEAR_TICKS / YEAR_TICKS;
  const theirs = c.params?.calendarScale;
  if (theirs === undefined || theirs === mine) return read();
  setCalendarScale(theirs);
  try {
    return read();
  } finally {
    setCalendarScale(mine);
  }
}

/** What a challenge's menu entry (and the title card's) says: its blurb and length, read under its own calendar. */
export function challengeInfo(c: Challenge): { blurb: string; meta: string } {
  const { years, blurb } = inChallengeCalendar(c, () => ({ years: c.years, blurb: c.blurb }));
  const meta = `${years} years, ${c.maxTools === null ? 'any number of interventions' : c.maxTools === 1 ? 'one intervention' : `up to ${c.maxTools} interventions`}`;
  return { blurb, meta };
}

/** The pages the menu and the top row can open (settings, valley setup, field guide) and the share button. */
export interface TopRightPages {
  onSettings(): void;
  onSetup(): void;
  onGuide(): void;
  onShare(): void;
  /** Rare sightings: the journal of rare moments that unlock while the valley runs at 1x. */
  onRare?(): void;
  /** About Tallgrass: the version, the credits and the project links. */
  onAbout?(): void;
}

export class TopRight {
  readonly el: HTMLElement;
  private seedBtn: HTMLButtonElement;
  private shareBtn: HTMLButtonElement;
  private guideCount: HTMLElement;
  private rareCount: HTMLElement;
  private shareTimer = 0;
  private seedText: HTMLElement;
  private ambientBtn: HTMLButtonElement;
  private narratorBtn: HTMLButtonElement;
  private notesBtn: HTMLButtonElement;
  private notesCount: HTMLElement;
  private narratorOn = true;
  private seedName: HTMLElement;
  private namedBtns = new Map<string, HTMLButtonElement>();
  private challengeBtns = new Map<string, HTMLButtonElement>();
  private seedIcon: HTMLElement;
  private menuBtn: HTMLButtonElement;
  private menu: HTMLElement;
  private input: HTMLInputElement;
  private scenarioBtns = new Map<string, HTMLButtonElement>();
  private seed = '';
  private scenario = '';
  private open = false;
  private copiedTimer = 0;
  private onDocDown: (e: PointerEvent) => void;

  constructor(
    private actions: UIActions,
    private onAmbient: () => void = () => {},
    private onNotes: () => void = () => {},
    private pages: TopRightPages = { onSettings() {}, onSetup() {}, onGuide() {}, onShare() {} },
  ) {
    this.seedText = h('span', { class: 'tg-seed-text' });
    this.seedName = h('span', { class: 'tg-seed-name' });
    this.seedIcon = h('span', { class: 'tg-seed-ic', html: icon('copy', 14) });
    this.seedBtn = button(
      { class: 'tg-seed tg-glass tg-leaf', 'data-tip': 'Copy the seed so you can share this world', onclick: () => this.copySeed() },
      this.seedName,
      h('span', { class: 'tg-seed-label', text: 'Seed' }),
      this.seedText,
      this.seedIcon,
    );
    this.shareBtn = button({
      class: 'tg-ambientbtn tg-sharebtn tg-glass tg-leaf',
      'aria-label': 'Share: copy a link that reopens this valley, with everything you have done in it',
      'data-tip': 'Share: copy a link to this valley',
      html: icon('share', 20),
      onclick: () => this.pages.onShare(),
    });
    this.ambientBtn = button({
      class: 'tg-ambientbtn tg-glass tg-leaf',
      'aria-label': 'Ambient view: hide the interface (H). Any key or click brings it back.',
      'data-tip': 'Hide the interface (H)',
      html: icon('eyeoff', 20),
      onclick: () => this.onAmbient(),
    });
    this.menuBtn = button({
      class: 'tg-menubtn tg-glass tg-leaf',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': 'Menu: new valley, settings, field guide and more',
      'data-tip': 'Menu',
      html: icon('menu', 20),
      onclick: () => this.toggle(),
    });

    this.input = h('input', {
      class: 'tg-input',
      type: 'text',
      placeholder: 'A seed, or leave blank for a surprise',
      maxlength: '40',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': 'Seed for a new world',
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.begin(null);
    });

    const scenarios = h('div', { class: 'tg-menu-list' });
    for (const s of SCENARIOS) {
      const b = button(
        { class: 'tg-sc', 'aria-pressed': 'false', onclick: () => this.begin(s.id) },
        h('span', { class: 'tg-sc-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tg-sc-text' }, h('span', { class: 'tg-sc-name', text: s.name }), h('span', { class: 'tg-sc-blurb', text: s.blurb })),
      );
      this.scenarioBtns.set(s.id, b);
      scenarios.append(b);
    }

    const challenges = h('div', { class: 'tg-menu-list' });
    for (const c of CHALLENGES) {
      const { blurb, meta } = challengeInfo(c);
      const b = button(
        { class: 'tg-sc', 'aria-pressed': 'false', onclick: () => this.startChallenge(c.id) },
        h('span', { class: 'tg-sc-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tg-sc-text' }, h('span', { class: 'tg-sc-name', text: c.name }), h('span', { class: 'tg-sc-blurb', text: blurb }), h('span', { class: 'tg-sc-meta', text: meta })),
      );
      this.challengeBtns.set(c.id, b);
      challenges.append(b);
    }

    const named = h('div', { class: 'tg-menu-list' });
    for (const n of NAMED_SEEDS) {
      const b = button(
        { class: 'tg-sc', 'aria-pressed': 'false', title: `Seed ${n.seed}`, onclick: () => this.beginNamed(n) },
        h('span', { class: 'tg-sc-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tg-sc-text' }, h('span', { class: 'tg-sc-name', text: n.name }), h('span', { class: 'tg-sc-blurb', text: n.blurb })),
      );
      this.namedBtns.set(n.seed, b);
      named.append(b);
    }

    const keys = h('dl', { class: 'tg-keys' });
    for (const [ks, v] of KEYS) keys.append(h('dt', {}, ...ks.map((k) => h('kbd', { class: 'tg-kbd', text: k }))), h('dd', { text: v }));

    // the narrator switch: a quiet voice-over for the big moments, only while the documentary camera is filming
    this.narratorBtn = button(
      { class: 'tg-switch', role: 'switch', 'aria-checked': 'true', onclick: () => this.actions.setNarrator?.(!this.narratorOn) },
      h('span', { class: 'tg-switch-text' }, h('span', { class: 'tg-sc-name', text: 'Narrator' }), h('span', { class: 'tg-sc-blurb', text: 'A quiet voice-over for the big moments, while the documentary camera is filming. Key V.' })),
      h('span', { class: 'tg-switch-track', 'aria-hidden': 'true' }, h('i', { class: 'tg-switch-knob' })),
    );

    // the notebook of witnessed moments: its count lives on the menu entry, the page opens on a click
    this.notesCount = h('span', { class: 'tg-menurow-count' });
    this.notesBtn = button(
      { class: 'tg-menurow', onclick: () => { this.close(); this.onNotes(); } },
      h('span', { class: 'tg-switch-text' }, h('span', { class: 'tg-sc-name', text: 'Field notes' }), h('span', { class: 'tg-sc-blurb', text: 'A notebook of moments you have witnessed in the valley.' })),
      this.notesCount,
      h('span', { class: 'tg-menurow-ic', html: icon('chevronRight', 14) }),
    );

    // pages the menu opens: each closes the menu and hands over to its own page
    const pageRow = (name: string, blurb: string, ic: string, open: () => void, count?: HTMLElement): HTMLButtonElement =>
      button(
        { class: 'tg-menurow', onclick: () => { this.close(); open(); } },
        h('span', { class: 'tg-switch-text' }, h('span', { class: 'tg-sc-name', text: name }), h('span', { class: 'tg-sc-blurb', text: blurb })),
        count ?? null,
        h('span', { class: 'tg-menurow-ic', html: icon(ic, 14) }),
      );
    this.guideCount = h('span', { class: 'tg-menurow-count' });
    this.rareCount = h('span', { class: 'tg-menurow-count' });

    this.menu = h(
      'div',
      { class: 'tg-menu tg-glass', role: 'dialog', 'aria-label': 'Menu', hidden: true },
      pageRow('New valley', 'Choose who lives here, the weather and the calendar.', 'chevronRight', () => this.pages.onSetup()),
      pageRow('Field guide', 'What each animal does, and the moments to catch.', 'chevronRight', () => this.pages.onGuide(), this.guideCount),
      pageRow('Settings', 'Picture quality, sound, camera and interface size.', 'chevronRight', () => this.pages.onSettings()),
      this.narratorBtn,
      this.notesBtn,
      pageRow('Rare sightings', 'Rare moments the valley gives to the patient, kept as photographs.', 'chevronRight', () => this.pages.onRare?.(), this.rareCount),
      h('h2', { class: 'tg-menu-h', text: 'Scenarios' }),
      scenarios,
      h('h2', { class: 'tg-menu-h', text: 'Challenges' }),
      challenges,
      h('h2', { class: 'tg-menu-h', text: 'Named worlds' }),
      named,
      h('h2', { class: 'tg-menu-h', text: 'New world' }),
      h(
        'div',
        { class: 'tg-menu-new' },
        this.input,
        button({ class: 'tg-btn is-primary', text: 'Begin', onclick: () => this.begin(null) }),
      ),
      h('h2', { class: 'tg-menu-h', text: 'Keys' }),
      keys,
      pageRow('About Tallgrass', 'Version, credits and where to find the project.', 'chevronRight', () => this.pages.onAbout?.()),
    );

    this.el = h('div', { class: 'tg-topright' }, h('div', { class: 'tg-topright-row' }, this.seedBtn, this.shareBtn, this.ambientBtn, this.menuBtn), this.menu);

    this.onDocDown = (e) => {
      if (this.open && !this.el.contains(e.target as Node)) this.close();
    };
    document.addEventListener('pointerdown', this.onDocDown);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocDown);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The count on the Field notes entry: "7 of 18". */
  setNotesCount(n: number, total: number): void {
    setText(this.notesCount, `${n} of ${total}`);
  }

  /** The count on the Rare sightings entry: "3 of 13". */
  setRareCount(n: number, total: number): void {
    setText(this.rareCount, `${n} of ${total}`);
  }

  /** The count on the Field guide entry: "7 of 24 witnessed". */
  setGuideCount(n: number, total: number): void {
    setText(this.guideCount, `${n} of ${total}`);
  }

  /** The share button shows a tick for a moment once the link is on the clipboard. */
  flashShared(ok: boolean): void {
    this.shareBtn.innerHTML = icon(ok ? 'check' : 'share', 20);
    this.shareBtn.classList.toggle('is-copied', ok);
    window.clearTimeout(this.shareTimer);
    this.shareTimer = window.setTimeout(() => {
      this.shareBtn.innerHTML = icon('share', 20);
      this.shareBtn.classList.remove('is-copied');
    }, 1600);
  }

  /** Reflect the narrator switch in the menu. */
  setNarrator(on: boolean): void {
    if (on === this.narratorOn) return;
    this.narratorOn = on;
    this.narratorBtn.setAttribute('aria-checked', String(on));
  }

  setWorld(seed: string, scenario: string): void {
    if (seed !== this.seed) {
      this.seed = seed;
      // a new world cuts the "Copied" flash short
      window.clearTimeout(this.copiedTimer);
      this.copiedTimer = 0;
      this.seedBtn.classList.remove('is-copied');
      this.seedIcon.innerHTML = icon('copy', 14);
      setText(this.seedText, seed);
      this.seedBtn.setAttribute('data-tip', `Copy the seed (${seed}) so you can share this world`);
      const n = namedSeed(seed);
      setText(this.seedName, n ? n.name : '');
      this.seedBtn.classList.toggle('has-name', !!n);
      for (const [k, b] of this.namedBtns) b.setAttribute('aria-pressed', n && n.seed === k ? 'true' : 'false');
    }
    if (scenario !== this.scenario) {
      this.scenario = scenario;
      for (const [id, b] of this.scenarioBtns) b.setAttribute('aria-pressed', id === scenario ? 'true' : 'false');
    }
  }

  toggle(): void {
    if (this.open) this.close();
    else this.openMenu();
  }

  openMenu(): void {
    this.open = true;
    this.menu.hidden = false;
    void this.menu.offsetWidth;
    this.menu.classList.add('is-open');
    this.menuBtn.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.menu.classList.remove('is-open');
    this.menuBtn.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!this.open) this.menu.hidden = true;
    }, 200);
  }

  private startChallenge(id: string): void {
    this.close();
    this.actions.startChallenge(id);
  }

  /** Mark the challenge that is running in the menu. */
  setChallenge(id: string | null): void {
    for (const [k, b] of this.challengeBtns) b.setAttribute('aria-pressed', k === id ? 'true' : 'false');
  }

  /** A named world always starts on the default scenario, which is what it was found on. */
  private beginNamed(n: NamedSeed): void {
    this.close();
    this.actions.newWorld(n.seed, 'prairie');
  }

  private begin(scenarioId: string | null): void {
    const typed = this.input.value.trim();
    const seed = typed || randomSeed();
    const scenario = scenarioId ?? (this.scenario || 'prairie');
    this.close();
    this.input.value = '';
    this.actions.newWorld(seed, scenario);
  }

  private async copySeed(): Promise<void> {
    const text = this.seed;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked (insecure context, no focus): fall back to a hidden textarea
      const ta = h('textarea', { style: 'position:fixed;opacity:0;pointer-events:none', 'aria-hidden': 'true' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* nothing more to try */
      }
      ta.remove();
    }
    this.seedBtn.classList.add('is-copied');
    setText(this.seedText, 'Copied');
    this.seedIcon.innerHTML = icon('check', 14);
    window.clearTimeout(this.copiedTimer);
    this.copiedTimer = window.setTimeout(() => {
      this.copiedTimer = 0;
      this.seedBtn.classList.remove('is-copied');
      setText(this.seedText, this.seed);
      this.seedIcon.innerHTML = icon('copy', 14);
    }, 1400);
  }
}
