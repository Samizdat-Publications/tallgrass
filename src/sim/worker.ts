// Web Worker host for the simulation. The main thread only renders and sends commands.
import { NG, GENE_NAMES, G_COAT, G_SIZE, G_SPEED } from './agents';
import { Sim, SimEvent, StoryEntry } from './sim';
import { Intervention, SPECIES_COUNT, TICKS_PER_SECOND } from './types';

export type ToWorker =
  | { type: 'init'; seed: number; params?: Record<string, number>; schedule?: { tick: number; iv: Intervention }[] }
  | { type: 'speed'; speed: number }
  | { type: 'apply'; iv: Intervention }
  | { type: 'select'; id: number | null }
  | { type: 'skip' }
  | { type: 'step'; ticks: number };

export interface AnimalDetail {
  id: number;
  sp: number;
  x: number;
  y: number;
  age: number;
  maxAge: number;
  matureAge: number;
  energy: number;
  hydration: number;
  stamina: number;
  state: number;
  male: boolean;
  gen: number;
  kills: number;
  children: number;
  pack: number;
  packSize: number;
  alpha: boolean;
  infected: boolean;
  pregnant: boolean;
  born: number;
  parentA: number;
  parentB: number;
  genes: Record<string, number>;
}

export interface HistoryRow {
  tick: number;
  pop: number[];
  grass: number;
  /** Mean heritable traits, see TRAIT_SERIES for the order (NaN when the species is absent). */
  traits?: number[];
}

/** Trait series recorded in history rows: [species, gene index, label]. */
export const TRAIT_SERIES: [number, number, string][] = [
  [0, G_SPEED, 'Bison speed'], [0, G_SIZE, 'Bison size'], [0, G_COAT, 'Bison coat darkness'],
  [1, G_SPEED, 'Wolf speed'], [1, G_SIZE, 'Wolf size'], [1, G_COAT, 'Wolf coat darkness'],
  [3, G_SPEED, 'Pronghorn speed'], [3, G_COAT, 'Pronghorn coat darkness'],
];

export type FromWorker =
  | { type: 'ready'; seed: number }
  | {
      type: 'snap';
      tick: number;
      env: Sim['env']['state'];
      count: number;
      ids: Uint32Array;
      agents: Float32Array;
      carcassCount: number;
      carcasses: Float32Array;
      veg?: Uint8Array;
      pop: number[];
      events: SimEvent[];
      history: HistoryRow[];
      selected: AnimalDetail | null;
      selectedGone: boolean;
      /** Life story of the selected animal (kept after it dies). */
      story: StoryEntry[];
      storyId: number;
      speed: number;
      ticksPerSec: number;
      stepMs: number;
    };

const HISTORY_EVERY = 60;
const VEG_EVERY_MS = 200;
/** Events worth stopping for when the player presses "skip to the next interesting event". */
const SKIP_KINDS = new Set(['stampede', 'packFounded', 'packLost', 'drought', 'outbreak', 'extinct', 'fire', 'elder', 'record']);

let sim: Sim | null = null;
let schedule: { tick: number; iv: Intervention }[] = [];
let speed = 1;
let selectedId: number | null = null;
let eventCursor = 0;
let history: HistoryRow[] = [];
let lastVeg = 0;
let skipping = false;
let acc = 0;
let lastTime = 0;
let ticksDone = 0;
let rateWindowStart = 0;
let ticksPerSec = 0;
let stepMsAvg = 0;
const ctx = self as unknown as Worker;

function detail(id: number): AnimalDetail | null {
  if (!sim) return null;
  const a = sim.a;
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || a.id[i] !== id) continue;
    const P = sim.p.species[a.sp[i]];
    const genes: Record<string, number> = {};
    for (let g = 0; g < NG; g++) genes[GENE_NAMES[g]] = a.genes[i * NG + g];
    const pk = a.pack[i];
    return {
      id, sp: a.sp[i], x: a.x[i], y: a.y[i], age: a.age[i], maxAge: P.maxAge, matureAge: P.matureAge,
      energy: a.energy[i], hydration: a.hydration[i], stamina: a.stamina[i], state: a.state[i], male: a.male[i] === 1,
      gen: a.gen[i], kills: a.kills[i], children: a.children[i], pack: pk >= 0 ? sim.packSerial[pk] : -1,
      packSize: pk >= 0 ? sim.packSize[pk] : 0, alpha: pk >= 0 && (sim.packAlphaF[pk] === i || sim.packAlphaM[pk] === i),
      infected: a.infected[i] > 0, pregnant: a.pregnant[i] > 0, born: a.born[i], parentA: a.parentA[i], parentB: a.parentB[i], genes,
    };
  }
  return null;
}

function record(): void {
  if (!sim) return;
  while (schedule.length && sim.tick >= schedule[0].tick) sim.apply(schedule.shift()!.iv);
  if (sim.tick % HISTORY_EVERY === 0) {
    const pop = sim.populations();
    const a = sim.a;
    const sums = new Float64Array(TRAIT_SERIES.length);
    const counts = new Int32Array(TRAIT_SERIES.length);
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i]) continue;
      for (let k = 0; k < TRAIT_SERIES.length; k++) {
        if (a.sp[i] !== TRAIT_SERIES[k][0]) continue;
        sums[k] += a.genes[i * NG + TRAIT_SERIES[k][1]];
        counts[k]++;
      }
    }
    const traits = Array.from(sums, (s, k) => (counts[k] ? s / counts[k] : NaN));
    history.push({ tick: sim.tick, pop, grass: sim.veg.meanGrass(), traits });
  }
}

function post(forceVeg: boolean): void {
  if (!sim) return;
  const now = performance.now();
  const withVeg = forceVeg || now - lastVeg > VEG_EVERY_MS;
  if (withVeg) lastVeg = now;
  const s = sim.snapshot(withVeg);
  const events = sim.events.slice(eventCursor);
  eventCursor = sim.events.length;
  const sel = selectedId !== null ? detail(selectedId) : null;
  const msg: FromWorker = {
    type: 'snap', tick: s.tick, env: s.env, count: s.count, ids: s.ids, agents: s.agents, carcassCount: s.carcassCount,
    carcasses: s.carcasses, veg: s.veg, pop: Array.from(s.pop), events, history, selected: sel,
    selectedGone: selectedId !== null && sel === null, story: sim.story.slice(), storyId: sim.trackedId, speed: skipping ? -1 : speed, ticksPerSec, stepMs: stepMsAvg,
  };
  history = [];
  const transfer: Transferable[] = [s.ids.buffer, s.agents.buffer, s.carcasses.buffer];
  if (s.veg) transfer.push(s.veg.buffer);
  ctx.postMessage(msg, transfer);
}

function loop(): void {
  if (!sim) return;
  const now = performance.now();
  const dt = Math.min(250, now - lastTime);
  lastTime = now;
  const t0 = performance.now();
  let n = 0;
  if (skipping) {
    // run flat out until an interesting event shows up (or 3 sim-years pass)
    const startEvents = sim.events.length;
    const limit = sim.tick + 7200;
    while (performance.now() - t0 < 30) {
      sim.step(1);
      record();
      n++;
      let hit = false;
      for (let k = startEvents; k < sim.events.length; k++) if (SKIP_KINDS.has(sim.events[k].kind)) hit = true;
      if (hit || sim.tick >= limit) { skipping = false; break; }
    }
  } else if (speed > 0) {
    acc += (dt / 1000) * TICKS_PER_SECOND * speed;
    // budget ~11 ms per slice so the worker stays responsive at 100x
    while (acc >= 1 && performance.now() - t0 < 11) {
      sim.step(1);
      record();
      acc -= 1;
      n++;
    }
    if (acc > TICKS_PER_SECOND * speed) acc = 0; // fell behind: drop the backlog instead of spiraling
  }
  const spent = performance.now() - t0;
  if (n > 0) stepMsAvg = stepMsAvg * 0.9 + (spent / n) * 0.1;
  ticksDone += n;
  if (now - rateWindowStart > 1000) {
    ticksPerSec = (ticksDone * 1000) / (now - rateWindowStart);
    ticksDone = 0;
    rateWindowStart = now;
  }
  post(false);
  setTimeout(loop, 16);
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      sim = new Sim({ seed: m.seed, params: m.params });
      schedule = (m.schedule ?? []).slice().sort((x, y) => x.tick - y.tick);
      eventCursor = 0;
      history = [];
      for (let k = 0; k < 1; k++) record();
      ctx.postMessage({ type: 'ready', seed: m.seed } satisfies FromWorker);
      lastTime = performance.now();
      rateWindowStart = lastTime;
      post(true);
      setTimeout(loop, 16);
      break;
    case 'speed':
      speed = m.speed;
      skipping = false;
      break;
    case 'apply':
      sim?.apply(m.iv);
      post(true);
      break;
    case 'select':
      selectedId = m.id;
      sim?.setTracked(m.id ?? 0);
      break;
    case 'skip':
      skipping = true;
      break;
    case 'step':
      if (sim) for (let k = 0; k < m.ticks; k++) { sim.step(1); record(); }
      post(true);
      break;
  }
};

export const SPECIES = SPECIES_COUNT;
