// Top right: the seed chip (click to copy) and the menu (scenarios, new world, keys).
import { button, h, setText } from './dom';
import { CHALLENGES } from '../challenges';
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
  [['H'], 'hide the interface for a clean screen'],
  [['Esc'], 'let go, disarm, close'],
];

export class TopRight {
  readonly el: HTMLElement;
  private seedBtn: HTMLButtonElement;
  private seedText: HTMLElement;
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

  constructor(private actions: UIActions) {
    this.seedText = h('span', { class: 'tg-seed-text' });
    this.seedName = h('span', { class: 'tg-seed-name' });
    this.seedIcon = h('span', { class: 'tg-seed-ic', html: icon('copy', 14) });
    this.seedBtn = button(
      { class: 'tg-seed tg-glass tg-leaf', title: 'Copy the seed so you can share this world', onclick: () => this.copySeed() },
      this.seedName,
      h('span', { class: 'tg-seed-label', text: 'Seed' }),
      this.seedText,
      this.seedIcon,
    );
    this.menuBtn = button({
      class: 'tg-menubtn tg-glass tg-leaf',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-label': 'Menu',
      title: 'Menu',
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
      const meta = `${c.years} years, ${c.maxTools === null ? 'any number of interventions' : c.maxTools === 1 ? 'one intervention' : `up to ${c.maxTools} interventions`}`;
      const b = button(
        { class: 'tg-sc', 'aria-pressed': 'false', onclick: () => this.startChallenge(c.id) },
        h('span', { class: 'tg-sc-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tg-sc-text' }, h('span', { class: 'tg-sc-name', text: c.name }), h('span', { class: 'tg-sc-blurb', text: c.blurb }), h('span', { class: 'tg-sc-meta', text: meta })),
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

    this.menu = h(
      'div',
      { class: 'tg-menu tg-glass', role: 'dialog', 'aria-label': 'Menu', hidden: true },
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
    );

    this.el = h('div', { class: 'tg-topright' }, h('div', { class: 'tg-topright-row' }, this.seedBtn, this.menuBtn), this.menu);

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

  setWorld(seed: string, scenario: string): void {
    if (seed !== this.seed) {
      this.seed = seed;
      // a new world cuts the "Copied" flash short
      window.clearTimeout(this.copiedTimer);
      this.copiedTimer = 0;
      this.seedBtn.classList.remove('is-copied');
      this.seedIcon.innerHTML = icon('copy', 14);
      setText(this.seedText, seed);
      this.seedBtn.title = `Copy the seed (${seed}) so you can share this world`;
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
