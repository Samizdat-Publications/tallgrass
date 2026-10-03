// Mock page for the game UI: concept art as the scene, a fake 30 Hz data driver, and ?state= presets for screenshots.
//
// Query: ?state=default|graph|graphhover|inspector|wolf|menu|overlay|tool|cinematic|night|noon|card|hidden
//        story (live life story)|memorial (the animal dies)|evolution|evohover
//        challenge (Knife's edge running; &used=5 spends the budget)|challenge-won (Dry years, wins after a second) (the expanded graph on its Evolution tab)
//        &speed=10  &species=3|6  &day=0.72  &seed=bluestem-4417  &w=1
// Page contract: window.__ready = true after the first render (fonts loaded).
import { GameUI } from '../src/ui/ui';
import { challengeById } from '../src/challenges';
import type { OverlayId, ToolId, UIActions, UIFrame } from '../src/ui/ui';
import { DAY_TICKS, SEASON_TICKS, SPECIES_COUNT, TICKS_PER_SECOND, Weather, YEAR_TICKS } from '../src/sim/types';
import type { EnvState } from '../src/sim/types';
import { START_DAY, START_SEASON } from '../src/sim/env';
import type { SimEvent, StoryEntry } from '../src/sim/sim';
import type { AnimalDetail, HistoryRow } from '../src/sim/worker';

declare global {
  interface Window {
    __ready?: boolean;
    __ui?: GameUI;
    __mock?: { emit(e: Partial<SimEvent> & { kind: SimEvent['kind'] }): void; log: string[] };
  }
}

const q = new URLSearchParams(location.search);
const state = q.get('state') ?? 'default';
const nSpecies = Math.max(3, Math.min(SPECIES_COUNT, Number(q.get('species') ?? 3)));
const fixedDay = q.has('day') ? Number(q.get('day')) : state === 'night' ? 0.93 : state === 'noon' ? 0.5 : 0.72;
if (state === 'night' || state === 'noon') document.body.dataset.look = state;

const root = document.getElementById('ui-root') as HTMLElement;
const log: string[] = [];

// ---- fake world ------------------------------------------------------------------------------------------------

const OFFSET = Math.round(START_SEASON * SEASON_TICKS);
const T0 = 19 * YEAR_TICKS + 2250; // year 21, a few hundred ticks before late summer
let tick = T0;
let speed = Number(q.get('speed') ?? 10);
let lastRunSpeed = speed || 10;
let skipping = false;
let selectedId: number | null = null;
let following: number | null = null;
let deadId = 0;
let seed = q.get('seed') ?? 'bluestem-4417';
let scenario = 'prairie';
let weather: number = Weather.Clear;

const TAU = Math.PI * 2;
function popAt(t: number): number[] {
  const y = t / YEAR_TICKS;
  const wob = (k: number) => Math.sin(t * 0.0137 * k + k * 3.1);
  const bison = 620 + 170 * Math.sin((TAU * y) / 6.5) + 36 * Math.sin((TAU * y) / 2.3 + 1) + 6 * wob(1);
  const wolf = 41 + 17 * Math.sin((TAU * (y - 1.6)) / 6.5) + 4 * Math.sin((TAU * y) / 2.1) + 1.5 * wob(2);
  const raven = 88 + 24 * Math.sin((TAU * y) / 3.1 + 0.7) + 5 * wob(3);
  const out = [bison, wolf, raven, 0, 0, 0];
  if (nSpecies > 3) out[3] = 210 + 60 * Math.sin((TAU * y) / 5 + 0.4) + 6 * wob(4);
  if (nSpecies > 4) out[4] = 480 + 220 * Math.sin((TAU * y) / 1.7 + 2) + 20 * wob(5);
  if (nSpecies > 5) out[5] = 8 + 4 * Math.sin((TAU * y) / 7 + 1.2);
  return out.map((v) => Math.max(0, Math.round(v)));
}
function grassAt(t: number, pop: number[]): number {
  const y = t / YEAR_TICKS;
  return Math.max(0.05, Math.min(0.95, 0.52 + 0.17 * Math.sin(TAU * (y - 0.35)) - 0.00018 * (pop[0] - 620)));
}
// Slow, plausible evolutionary drift, in the order of TRAIT_SERIES in src/sim/worker.ts:
// bison speed, size, coat; wolf speed, size, coat; pronghorn speed, coat. Wolves out-run the bison a little.
function traitsAt(t: number): number[] {
  const y = t / YEAR_TICKS;
  const ease = (k: number) => 1 - Math.exp(-y / k);
  const n = (k: number) => 0.0035 * Math.sin(t * 0.0009 * k + k) + 0.0004 * Math.sin(t * 0.004 * k);
  return [
    1 + 0.05 * ease(9) + 0.012 * Math.sin((TAU * y) / 7) + n(1), // bison speed: +5% and a slow wave
    1 + 0.03 * ease(14) + n(2), // bison size
    0.85 + 0.07 * ease(11) + 0.6 * n(3), // bison coat darkens
    1 + 0.09 * ease(7) + 0.014 * Math.sin((TAU * (y - 1.2)) / 7) + n(4), // wolf speed: the arms race
    1 - 0.02 * ease(12) + n(5), // wolf size
    0.3 - 0.09 * ease(10) + 0.6 * n(6), // wolf coat pales
    nSpecies > 3 ? 1 + 0.07 * ease(8) + 0.01 * Math.sin((TAU * (y - 0.4)) / 5) + n(7) : NaN, // pronghorn speed
    nSpecies > 3 ? 0.5 + 0.06 * ease(9) + 0.6 * n(8) : NaN, // pronghorn coat
  ];
}
function rowAt(t: number): HistoryRow {
  const pop = popAt(t);
  return { tick: t, pop, grass: grassAt(t, pop), traits: traitsAt(t) };
}
const prefill: HistoryRow[] = [];
for (let t = 0; t <= T0; t += 60) prefill.push(rowAt(t));
let lastRowTick = prefill[prefill.length - 1].tick;

function ev(back: number, kind: SimEvent['kind'], sp: number, x: number, y: number, a: number, b = 0): SimEvent {
  return { tick: T0 - back, kind, sp, x, y, a, b };
}
const prefillEvents: SimEvent[] = [
  ev(31000, 'introduced', 1, 250, 250, 8),
  ev(26500, 'packFounded', 1, 120, 90, 4),
  ev(19000, 'packFounded', 1, 400, 380, 6),
  ev(15200, 'elder', 0, 210, 160, 3400, 311),
  ev(12000, 'packLost', 1, 300, 60, 3, 5200),
  ev(8800, 'drought', -1, 0, 0, 3000, 0.7),
  ev(6100, 'droughtEnd', -1, 0, 0, 0),
  ev(3900, 'stampede', 0, 150, 330, 61),
  ev(2600, 'outbreak', 0, 405, 300, 23),
  ev(1400, 'packFounded', 1, 380, 120, 7),
];

function envAt(t: number): EnvState {
  return {
    tick: t,
    year: Math.floor((t + OFFSET) / YEAR_TICKS),
    season: ((t + OFFSET) % YEAR_TICKS) / SEASON_TICKS,
    dayFrac: q.has('live') ? ((t + Math.round(START_DAY * DAY_TICKS)) % DAY_TICKS) / DAY_TICKS : fixedDay,
    weather: weather as EnvState['weather'],
    rain: 0, windDir: 0.6, windStrength: 0.4, warmth: 0.7,
  };
}

function bisonDetail(): AnimalDetail {
  if (state === 'cougar') {
    return {
      id: 30511, sp: 5, x: 200, y: 140, age: 2300 + (tick - T0), maxAge: 3000, matureAge: 420, energy: 0.6, hydration: 0.7, stamina: 0.8, state: 10,
      male: false, gen: 2, kills: 6, children: 3, pack: -1, packSize: 0, alpha: false, infected: false, pregnant: false, born: 0,
      parentA: 29901, parentB: 29850,
      genes: { speed: 1.1, size: 1.02, sight: 1.2, boldness: 1.3, herding: 0.2, coat: 0.55, litter: 1 },
    };
  }
  const wolf = state === 'wolf';
  return {
    id: wolf ? 20977 : 18234,
    sp: wolf ? 1 : 0,
    x: 220, y: 180,
    age: wolf ? 4300 + (tick - T0) : 1500 + (tick - T0),
    maxAge: wolf ? 9600 : 3600,
    matureAge: wolf ? 1200 : 600,
    energy: wolf ? 0.74 : 0.68,
    hydration: wolf ? 0.18 : 0.57,
    stamina: wolf ? 0.42 : 0.91,
    state: wolf ? 10 : 1,
    male: wolf,
    gen: wolf ? 9 : 12,
    kills: wolf ? 14 : 0,
    children: wolf ? 11 : 3,
    pack: wolf ? 6 : -1,
    packSize: wolf ? 7 : 0,
    alpha: wolf,
    infected: false,
    pregnant: !wolf,
    born: 0,
    parentA: wolf ? 20112 : 17981,
    parentB: wolf ? 19877 : 17120,
    genes: wolf
      ? { speed: 1.21, size: 1.04, sight: 1.4, boldness: 1.6, herding: 0.9, coat: 0.22, litter: 1.1 }
      : { speed: 1.12, size: 0.94, sight: 1.28, boldness: 0.62, herding: 1.34, coat: 0.84, litter: 1 },
  };
}

// ---- fake life story of the selected animal ---------------------------------------------------------------------

function storyFor(wolf: boolean): StoryEntry[] {
  const e = (back: number, kind: StoryEntry['kind'], a = 0): StoryEntry => ({ tick: T0 - back, kind, a });
  if (state === 'cougar') return [e(8000, 'chase', 3), e(7960, 'kill', 3), e(5200, 'chase', 3), e(5160, 'kill', 3), e(3000, 'birth', 2), e(1400, 'chase', 4), e(1380, 'kill', 4), e(500, 'fled', 1)];
  return wolf
    ? [e(11200, 'dispersed'), e(9800, 'chase', 3), e(9650, 'kill', 3), e(7000, 'chase', 3), e(6900, 'chase', 3), e(5200, 'birth', 5), e(3000, 'chase', 0), e(2900, 'kill', 0), e(1500, 'infected'), e(900, 'recovered')]
    : [e(6900, 'fled', 1), e(6800, 'fled', 1), e(6000, 'fled', 1), e(4400, 'birth', 1), e(3100, 'infected'), e(2500, 'recovered'), e(1200, 'fled', 1), e(900, 'birth', 1)];
}
let storyLive: StoryEntry[] = storyFor(state === 'wolf');
let dyingSoon = state === 'memorial';

// ---- fake event stream -----------------------------------------------------------------------------------------

const t0Wall = performance.now();
interface Scheduled { at: number; e: Omit<SimEvent, 'tick'> }
const schedule: Scheduled[] =
  state === 'card' || state === 'cinematic'
    ? [{ at: 2700, e: { kind: 'drought', sp: -1, x: 0, y: 0, a: 4800, b: 0.8 } }]
    : [
        { at: 5200, e: { kind: 'stampede', sp: 0, x: 140, y: 300, a: 84, b: 0 } },
        { at: 8600, e: { kind: 'drought', sp: -1, x: 0, y: 0, a: 4800, b: 0.8 } },
        { at: 13500, e: { kind: 'packFounded', sp: 1, x: 90, y: 400, a: 9, b: 0 } },
        { at: 17500, e: { kind: 'fire', sp: -1, x: 420, y: 90, a: 0, b: 0 } },
        { at: 22000, e: { kind: 'extinct', sp: 1, x: 0, y: 0, a: 0, b: 0 } },
        { at: 26500, e: { kind: 'introduced', sp: 1, x: 250, y: 250, a: 8, b: 0 } },
        { at: 31000, e: { kind: 'outbreak', sp: 0, x: 300, y: 200, a: 31, b: 0 } },
      ];
if (q.has('quiet')) schedule.length = 0;
let nextSched = 0;
const pending: SimEvent[] = [...prefillEvents];

window.__mock = {
  emit: (e) => pending.push({ tick, sp: -1, x: 0, y: 0, a: 0, b: 0, ...e }),
  log,
};

// ---- actions ----------------------------------------------------------------------------------------------------

let ui: GameUI;
const actions: UIActions = {
  setSpeed: (s) => {
    log.push(`setSpeed ${s}`);
    speed = s;
    skipping = false;
    if (s > 0) lastRunSpeed = s;
  },
  skipToEvent: () => {
    log.push('skipToEvent');
    skipping = true;
  },
  armTool: (t: ToolId | null) => log.push(`armTool ${t}`),
  applyTool: (t: ToolId) => {
    if (!ui.tryUseTool()) return; // challenge budget, as main.ts does it
    log.push(`applyTool ${t}`);
    if (t === 'rain') pending.push({ tick, kind: 'rain', sp: -1, x: 0, y: 0, a: 600, b: 0 });
    if (t === 'drought') pending.push({ tick, kind: 'drought', sp: -1, x: 0, y: 0, a: 2400, b: 0.6 });
    if (t === 'plague') pending.push({ tick, kind: 'plague', sp: 0, x: 0, y: 0, a: 44, b: 0 });
    if (t === 'cull') pending.push({ tick, kind: 'culled', sp: 0, x: 0, y: 0, a: 120, b: 0.3 });
    if (t === 'removeWolves') pending.push({ tick, kind: 'removed', sp: 1, x: 0, y: 0, a: 41, b: 0 });
  },
  follow: (id) => {
    log.push(`follow ${id}`);
    following = id;
  },
  select: (id) => {
    log.push(`select ${id}`);
    selectedId = id;
    if (id === null) following = null;
    if (id === null) deadId = 0;
  },
  flyTo: (x, y) => log.push(`flyTo ${x},${y}`),
  setOverlay: (o: OverlayId) => log.push(`setOverlay ${o}`),
  setCinematic: (on) => log.push(`setCinematic ${on}`),
  startChallenge: (id) => {
    log.push(`startChallenge ${id}`);
  },
  newWorld: (s, sc) => {
    log.push(`newWorld ${s} ${sc}`);
    seed = s;
    scenario = sc;
    tick = 0;
    lastRowTick = -1;
    pending.length = 0;
  },
};

ui = new GameUI(root, actions);
window.__ui = ui;
if (state === 'challenge' || state === 'challenge-won') {
  ui.setChallenge(challengeById(state === 'challenge' ? 'knife' : 'dry'));
  for (let i = 0; i < Number(q.get('used') ?? (state === 'challenge' ? 2 : 1)); i++) ui.tryUseTool();
}
if (state === 'inspector' || state === 'wolf' || state === 'story' || state === 'memorial' || state === 'cougar') selectedId = bisonDetail().id;

// ---- driver -----------------------------------------------------------------------------------------------------

let lastWall = performance.now();
let measured = 0;
let measureAcc = 0;
let measureStart = lastWall;

function frame(first: boolean): void {
  const now = performance.now();
  const dt = Math.min(100, now - lastWall);
  lastWall = now;
  let advance = 0;
  if (skipping) advance = 300;
  else if (speed > 0) advance = (dt / 1000) * TICKS_PER_SECOND * speed;
  const history: HistoryRow[] = [];
  if (first) history.push(...prefill);
  const events: SimEvent[] = [];
  if (first) {
    events.push(...pending.splice(0));
  }
  tick += advance;
  measureAcc += advance;
  if (now - measureStart > 800) {
    measured = (measureAcc * 1000) / (now - measureStart);
    measureAcc = 0;
    measureStart = now;
  }
  while (!first && lastRowTick + 60 <= tick) {
    lastRowTick += 60;
    history.push(rowAt(lastRowTick));
  }
  if (!first) events.push(...pending.splice(0));
  while (nextSched < schedule.length && now - t0Wall >= schedule[nextSched].at) {
    events.push({ tick: Math.round(tick), ...schedule[nextSched].e });
    nextSched++;
    if (skipping) {
      skipping = false;
      speed = lastRunSpeed;
    }
  }
  const t = Math.round(tick);
  if (dyingSoon && now - t0Wall > 1700 && selectedId !== null) {
    // the selected bison is killed by wolves: selected goes null, the story ends with a 'died' entry
    storyLive = [...storyLive, { tick: t, kind: 'fled', a: 1 }, { tick: t + 20, kind: 'died', a: 3 }];
    dyingSoon = false;
    deadId = selectedId;
    selectedId = null;
  }
  const sel = selectedId !== null ? bisonDetail() : null;
  const f: UIFrame = {
    tick: t,
    env: envAt(t),
    pop: popAt(t),
    history,
    events,
    selected: sel,
    speed: skipping ? -1 : speed,
    ticksPerSec: skipping ? 4800 : measured || (speed > 0 ? speed * TICKS_PER_SECOND : 0),
    seed,
    scenario,
    following,
    story: storyLive,
    storyId: selectedId ?? deadId ?? 0,
    packs: 3,
  };
  ui.update(f);
}

frame(true);

// scripted states, driven through the real keyboard and click paths
function key(k: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
}
function hoverChart(frac: number): void {
  const c = document.querySelector('.tg-chart') as HTMLCanvasElement | null;
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * frac, clientY: r.top + r.height * 0.5, bubbles: true }));
}
switch (state) {
  case 'graph':
  case 'graphhover':
    key('g');
    break;
  case 'evolution':
  case 'evohover':
    key('e');
    break;
  case 'menu':
    (document.querySelector('.tg-menubtn') as HTMLButtonElement).click();
    break;
  case 'overlay':
    (document.querySelector('.tg-ov-btn') as HTMLButtonElement).click();
    break;
  case 'tool':
    (document.querySelector('[data-tool="fire"]') as HTMLButtonElement).click();
    break;
  case 'cinematic':
    key('c');
    break;
  case 'hidden':
    key('h');
    break;
}
if (q.has('log')) key('l');
if (q.has('hover')) setTimeout(() => hoverChart(Number(q.get('hover'))), 900);
if (state === 'graphhover' || state === 'evohover') setTimeout(() => hoverChart(0.58), 900);
if (state === 'tool') {
  // hover the armed tool's neighbour so two labels show: the armed one stays out by itself
}

setInterval(() => frame(false), 33);

document.fonts.ready.then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => (window.__ready = true)));
});
