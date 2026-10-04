// Web Worker host for the simulation. The main thread only renders and sends commands.
import { NG, GENE_NAMES, G_COAT, G_SIZE, G_SPEED } from './agents';
import type { DynastyEntry, LineageTree } from './lineage';
import type { LoggedIntervention } from './sharecode';
import { Sim, SimEvent, StoryEntry } from './sim';
import { SPECIES as REGISTRY } from './species';
import { Intervention, SPECIES_COUNT, TICKS_PER_SECOND } from './types';

export type ToWorker =
  | {
      type: 'init'; seed: number; params?: Record<string, number>; schedule?: { tick: number; iv: Intervention }[];
      /** Player interventions to replay at their ticks (a share code's log, S16). Applied after the scenario's own schedule at the same tick. */
      replay?: LoggedIntervention[];
    }
  | { type: 'speed'; speed: number }
  | { type: 'apply'; iv: Intervention }
  | { type: 'select'; id: number | null }
  | { type: 'skip' }
  | { type: 'step'; ticks: number }
  /** Ask for the intervention log, to build a share code; answered with a 'log' message. */
  | { type: 'getLog' }
  /** Family tree of one animal (3 generations up, 2 down); answered with a 'lineage' message. */
  | { type: 'lineage'; id: number }
  /** Alpha pairs of one pack serial over time; answered with a 'dynasty' message. */
  | { type: 'dynasty'; pack: number };

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
const SERIES_GENES: [number, string][] = [[G_SPEED, 'speed'], [G_SIZE, 'size'], [G_COAT, 'coat darkness']];
/** Genes recorded per species when they differ from speed, size and coat (pronghorn has no size series). */
const SERIES_OVERRIDE: Record<string, number[]> = { pronghorn: [G_SPEED, G_COAT] };
// one series per recorded gene of each species with traits, in registry order (src/ui/traits.ts indexes into this)
export const TRAIT_SERIES: [number, number, string][] = REGISTRY.filter((d) => d.traits).flatMap((d) =>
  SERIES_GENES.filter(([g]) => (SERIES_OVERRIDE[d.key] ?? [G_SPEED, G_SIZE, G_COAT]).includes(g)).map(([g, label]): [number, number, string] => [d.id, g, `${d.name} ${label}`]),
);

export type FromWorker =
  | { type: 'ready'; seed: number }
  /** Every player intervention so far (replayed ones included), with its tick. */
  | { type: 'log'; tick: number; log: LoggedIntervention[] }
  /** Answer to 'lineage': the tree, or null when the animal is neither alive nor recorded. */
  | { type: 'lineage'; id: number; tree: LineageTree | null }
  /** Answer to 'dynasty': alpha pairs of the pack, oldest first (empty when unknown). */
  | { type: 'dynasty'; pack: number; list: DynastyEntry[] }
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
      /** Small-prey fields (S4), 32 x 32 RGBA bytes: R jackrabbits, G prairie dogs, B town, A plague (scales in Snapshot.small). Sent with veg, only when smallPrey is on. */
      small?: Uint8Array;
      /** Storm cells and the strikes since the last post (only with params.stormCells); layouts in types.ts. */
      storms?: Float32Array;
      strikes?: Float32Array;
      /** Trait heatmap, TRAIT_GRID^2 RGBA bytes: R speed relative to the species mean (128 = average), G animal density. Sent with veg. */
      traitGrid?: Uint8Array;
      pop: number[];
      events: SimEvent[];
      history: HistoryRow[];
      selected: AnimalDetail | null;
      selectedGone: boolean;
      /** Life story of the selected animal (kept after it dies). */
      story: StoryEntry[];
      storyId: number;
      /** Wolf packs: stride 4 (den x, den y, territory radius m, pack size) plus serials for names. */
      packs: Float32Array;
      packSerials: number[];
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
/** Player interventions with the tick they took effect at, for share codes. Scenario schedules are not logged. */
let ivLog: LoggedIntervention[] = [];
let speed = 1;
let selectedId: number | null = null;
/** Serial of the next event the page has not seen (compare Sim.eventSerial). */
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

export const TRAIT_GRID = 32;

/** Where the fastest bodies live: each grazer and predator's speed gene against its own species' mean, averaged per cell. */
function traitGrid(): Uint8Array {
  const out = new Uint8Array(TRAIT_GRID * TRAIT_GRID * 4);
  if (!sim) return out;
  const a = sim.a;
  const sum = new Float64Array(SPECIES_COUNT), cnt = new Int32Array(SPECIES_COUNT);
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || REGISTRY[a.sp[i]].flies) continue;
    sum[a.sp[i]] += a.genes[i * NG + G_SPEED];
    cnt[a.sp[i]]++;
  }
  const rel = new Float32Array(TRAIT_GRID * TRAIT_GRID), n = new Int32Array(TRAIT_GRID * TRAIT_GRID);
  const k = TRAIT_GRID / sim.world.size;
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i] || REGISTRY[a.sp[i]].flies) continue;
    const s = a.sp[i];
    const cx = Math.min(TRAIT_GRID - 1, Math.max(0, (a.x[i] * k) | 0)), cy = Math.min(TRAIT_GRID - 1, Math.max(0, (a.y[i] * k) | 0));
    const c = cy * TRAIT_GRID + cx;
    rel[c] += a.genes[i * NG + G_SPEED] / (sum[s] / cnt[s]) - 1;
    n[c]++;
  }
  // a count-weighted 3x3 blur turns lone animals into regions
  const G = TRAIT_GRID;
  for (let cy = 0; cy < G; cy++) {
    for (let cx = 0; cx < G; cx++) {
      let s = 0, w = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= G || y >= G) continue;
          const k = dx === 0 && dy === 0 ? 2 : 1;
          s += rel[y * G + x] * k;
          w += n[y * G + x] * k;
        }
      }
      const c = cy * G + cx;
      const m = w ? s / w : 0;
      out[c * 4] = Math.max(0, Math.min(255, Math.round(128 + m * 1280))); // +/-10% spans the full range
      out[c * 4 + 1] = Math.min(255, n[c] * 50); // density of this cell only, so empty ground stays clear
      out[c * 4 + 3] = 255;
    }
  }
  return out;
}

function packInfo(): { packs: Float32Array; packSerials: number[] } {
  const out: number[] = [];
  const serials: number[] = [];
  if (sim) {
    for (let pk = 0; pk < sim.packAlive.length; pk++) {
      if (!sim.packAlive[pk]) continue;
      out.push(sim.packDenX[pk], sim.packDenY[pk], sim.p.wolfTerritory, sim.packSize[pk]);
      serials.push(sim.packSerial[pk]);
    }
  }
  return { packs: new Float32Array(out), packSerials: serials };
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
  // serials, not array indices: the sim trims its events array
  const base = sim.eventSerial - sim.events.length;
  const events = sim.events.slice(Math.max(0, eventCursor - base));
  eventCursor = sim.eventSerial;
  const sel = selectedId !== null ? detail(selectedId) : null;
  const msg: FromWorker = {
    type: 'snap', tick: s.tick, env: s.env, count: s.count, ids: s.ids, agents: s.agents, carcassCount: s.carcassCount,
    carcasses: s.carcasses, veg: s.veg, small: s.small, storms: s.storms, strikes: s.strikes, traitGrid: withVeg ? traitGrid() : undefined, pop: Array.from(s.pop), events, history, selected: sel,
    selectedGone: selectedId !== null && sel === null, story: sim.story.slice(), storyId: sim.trackedId, ...packInfo(), speed: skipping ? -1 : speed, ticksPerSec, stepMs: stepMsAvg,
  };
  history = [];
  const transfer: Transferable[] = [s.ids.buffer, s.agents.buffer, s.carcasses.buffer];
  if (s.veg) transfer.push(s.veg.buffer);
  if (s.small) transfer.push(s.small.buffer);
  if (s.storms) transfer.push(s.storms.buffer);
  if (s.strikes) transfer.push(s.strikes.buffer);
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
    const startSerial = sim.eventSerial;
    const limit = sim.tick + 7200;
    while (performance.now() - t0 < 30) {
      sim.step(1);
      record();
      n++;
      let hit = false;
      for (let k = Math.max(0, startSerial - (sim.eventSerial - sim.events.length)); k < sim.events.length; k++) if (SKIP_KINDS.has(sim.events[k].kind)) hit = true;
      if (hit || sim.tick >= limit) { skipping = false; break; }
    }
  } else if (speed > 0) {
    acc += (dt / 1000) * TICKS_PER_SECOND * speed;
    // step for most of each 16 ms frame at fast-forward (the worker has its own core), less at 1x and 10x where a
    // slice is only a few ticks anyway; messages from the page are still handled between slices
    const budget = speed >= 50 ? 24 : 11;
    while (acc >= 1 && performance.now() - t0 < budget) {
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
  // aim for a slice every 16 ms of wall time rather than 16 ms of idle after each slice
  setTimeout(loop, Math.max(1, 16 - (performance.now() - now)));
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      sim = new Sim({ seed: m.seed, params: m.params });
      // stable sort: at the same tick the scenario's own interventions run first, then the replayed ones in order,
      // which is where a live 'apply' lands too (after the step that reaches its tick, see record())
      ivLog = (m.replay ?? []).map((e) => ({ tick: e.tick, iv: e.iv }));
      schedule = [...(m.schedule ?? []), ...ivLog].sort((x, y) => x.tick - y.tick);
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
      if (sim) {
        ivLog.push({ tick: sim.tick, iv: m.iv });
        sim.apply(m.iv);
      }
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
    case 'getLog':
      ctx.postMessage({ type: 'log', tick: sim?.tick ?? 0, log: ivLog.map((e) => ({ tick: e.tick, iv: e.iv })) } satisfies FromWorker);
      break;
    case 'lineage':
      ctx.postMessage({ type: 'lineage', id: m.id, tree: sim ? sim.lineage.query(m.id) : null } satisfies FromWorker);
      break;
    case 'dynasty':
      ctx.postMessage({ type: 'dynasty', pack: m.pack, list: sim ? sim.lineage.dynasty(m.pack) : [] } satisfies FromWorker);
      break;
  }
};

export const SPECIES = SPECIES_COUNT;
