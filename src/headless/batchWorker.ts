// Worker thread for batch.ts. One worker runs one (scenario, seed) task at a time: it creates the sim, steps it in
// chunks, records sample() every `sampleEvery` ticks, applies the scenario's shocks, writes the seed's CSV, computes
// the seed's metrics and posts a DoneMsg back. Spawned by batch.ts; not meant to be run directly.

import { parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SPECIES_KEYS } from '../sim/types';
import { analyzeSeed, type SeedMetrics, type ShockInfo } from './metrics';
import { SCENARIOS, loadCreateSim, type CreateSim } from './scenarios';

export interface WorkerInit {
  stopFlag: SharedArrayBuffer;
  mock: boolean;
}

export interface TaskMsg {
  type: 'task';
  id: number;
  scenario: string;
  seed: number;
  params: Record<string, number>;
  /** tick cap (the run length in ticks mode, the safety cap in generations mode) */
  ticks: number;
  generations: number | null;
  sampleEvery: number;
  /** absolute path of the scenario output directory */
  outDir: string;
  progressMs: number;
}

export interface EventRecord {
  label: string;
  kind: string;
  frac: number;
  /** tick at which it was applied (planned tick in ticks mode until applied); null if never applied */
  tick: number | null;
  applied: boolean;
}

export type EndReason = 'ticks' | 'generations' | 'all_extinct' | 'aborted' | 'error';

export interface ProgressMsg {
  type: 'progress';
  id: number;
  tick: number;
  gen: number | null;
  stepMs: number;
  /** 0..1 */
  fraction: number;
}

export interface DoneMsg {
  type: 'done';
  id: number;
  scenario: string;
  seed: number;
  ok: boolean;
  error?: string;
  /** the error means no seed can ever run (for example the sim module is missing) */
  fatal?: boolean;
  endReason: EndReason;
  endTick: number;
  samples: number;
  stepMs: number;
  wallMs: number;
  /** path of the CSV relative to the scenario directory */
  csv: string | null;
  events: EventRecord[];
  metrics: SeedMetrics | null;
  final: Record<string, number>;
  columns: string[];
  warnings: string[];
}

const MAX_CHUNK = 250;

const init = workerData as WorkerInit;
const stopFlag = new Int32Array(init.stopFlag);
const aborted = () => Atomics.load(stopFlag, 0) === 1;

let createSimPromise: Promise<CreateSim> | null = null;

function fmt(v: number): string {
  if (!Number.isFinite(v)) return 'nan';
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(7)));
}

async function runTask(t: TaskMsg): Promise<DoneMsg> {
  const wall0 = performance.now();
  const scn = SCENARIOS[t.scenario];
  const events: EventRecord[] = scn.events.map((e) => ({ label: e.label, kind: e.intervention.kind, frac: e.frac, tick: null, applied: false }));
  const base: Omit<DoneMsg, 'endReason' | 'endTick' | 'samples' | 'stepMs' | 'wallMs' | 'csv' | 'metrics' | 'final' | 'columns'> = {
    type: 'done',
    id: t.id,
    scenario: t.scenario,
    seed: t.seed,
    ok: true,
    events,
    warnings: [],
  };
  const fail = (msg: string, fatal: boolean): DoneMsg => ({
    ...base,
    ok: false,
    error: msg,
    fatal,
    endReason: 'error',
    endTick: 0,
    samples: 0,
    stepMs: 0,
    wallMs: performance.now() - wall0,
    csv: null,
    metrics: null,
    final: {},
    columns: [],
  });

  let createSim: CreateSim;
  try {
    createSimPromise ??= loadCreateSim(init.mock);
    createSim = await createSimPromise;
  } catch (e) {
    createSimPromise = null;
    return fail((e as Error).message, (e as { fatal?: boolean }).fatal === true);
  }

  const genMode = t.generations !== null;
  const cap = t.ticks;
  const sampleEvery = t.sampleEvery;
  const ticks: number[] = [];
  const cols: Record<string, number[]> = {};
  let columns: string[] = [];
  let lastRow: Record<string, number> = {};
  let stepMs = 0;
  let endReason: EndReason = 'ticks';
  let error: string | undefined;
  const warnings = base.warnings;

  // plan event ticks (ticks mode): rounded to the sample grid so the pre-shock sample is exactly at the shock tick
  if (!genMode) {
    scn.events.forEach((e, i) => {
      events[i].tick = Math.max(sampleEvery, Math.round((e.frac * cap) / sampleEvery) * sampleEvery);
    });
  }

  let sim;
  try {
    sim = createSim({ seed: t.seed, params: t.params });
  } catch (e) {
    return fail(`createSim threw: ${(e as Error).message}`, false);
  }

  const record = () => {
    const row = sim.sample();
    if (!columns.length) {
      columns = Object.keys(row);
      for (const c of columns) cols[c] = [];
    }
    ticks.push(sim.tick);
    for (const c of columns) cols[c].push(row[c] ?? NaN);
    lastRow = row;
    return row;
  };
  const popSum = (row: Record<string, number>) => {
    let s = 0;
    for (const k of SPECIES_KEYS) s += row[`pop_${k}`] ?? 0;
    return s;
  };

  let lastProgress = performance.now();
  const post = () => {
    const gen = lastRow.gen_bison ?? null;
    let fraction = sim.tick / cap;
    if (genMode && gen !== null) fraction = Math.max(fraction, gen / t.generations!);
    parentPort!.postMessage({ type: 'progress', id: t.id, tick: sim.tick, gen, stepMs, fraction: Math.min(1, fraction) } satisfies ProgressMsg);
    lastProgress = performance.now();
  };

  try {
    record();
    let nextSample = sampleEvery;
    let haveGen = 'gen_bison' in lastRow;
    if (genMode && !haveGen) {
      warnings.push('sample() has no gen_bison column: --generations ignored, running to the tick cap');
    }
    loop: while (true) {
      if (aborted()) {
        endReason = 'aborted';
        break;
      }
      if (sim.tick >= cap) break;
      let boundary = Math.min(nextSample, cap);
      if (!genMode) {
        for (const e of events) if (!e.applied && e.tick !== null && e.tick > sim.tick) boundary = Math.min(boundary, e.tick);
      }
      while (sim.tick < boundary) {
        const n = Math.min(boundary - sim.tick, MAX_CHUNK);
        const s0 = performance.now();
        sim.step(n);
        stepMs += performance.now() - s0;
        if (performance.now() - lastProgress >= t.progressMs) post();
        if (aborted()) {
          endReason = 'aborted';
          break loop;
        }
      }
      let sampled = false;
      if (sim.tick >= nextSample) {
        record();
        nextSample += sampleEvery;
        sampled = true;
      } else if (sim.tick >= cap && ticks[ticks.length - 1] !== sim.tick) {
        record();
        sampled = true;
      }
      if (sampled) {
        if (popSum(lastRow) === 0) {
          endReason = 'all_extinct';
          break;
        }
        if (genMode && haveGen && lastRow.gen_bison >= t.generations!) {
          endReason = 'generations';
          break;
        }
      }
      // shocks fire after the sample, so the sample at the shock tick is the pre-shock state
      scn.events.forEach((e, i) => {
        const ev = events[i];
        if (ev.applied) return;
        const due = genMode ? sampled && haveGen && lastRow.gen_bison / t.generations! >= e.frac : ev.tick !== null && ev.tick <= sim.tick;
        if (!due) return;
        sim.apply(e.intervention);
        ev.applied = true;
        ev.tick = sim.tick;
      });
    }
    if (endReason !== 'all_extinct' && ticks[ticks.length - 1] !== sim.tick) record();
  } catch (e) {
    error = (e as Error).stack ?? String(e);
    endReason = 'error';
    try {
      if (ticks[ticks.length - 1] !== sim.tick) record();
    } catch {
      /* the sim is broken; keep what we have */
    }
  }

  // events that never fired have no tick
  for (const ev of events) if (!ev.applied) ev.tick = null;

  // CSV
  let csv: string | null = null;
  if (ticks.length) {
    mkdirSync(t.outDir, { recursive: true });
    csv = `seed_${t.seed}.csv`;
    const lines = [['tick', ...columns].join(',')];
    for (let i = 0; i < ticks.length; i++) lines.push([ticks[i], ...columns.map((c) => fmt(cols[c][i]))].join(','));
    writeFileSync(path.join(t.outDir, csv), lines.join('\n') + '\n');
  }

  // metrics
  let metrics: SeedMetrics | null = null;
  if (ticks.length) {
    const lastTick = ticks[ticks.length - 1];
    const totalTicks = genMode || endReason === 'aborted' ? lastTick : cap;
    let shock: ShockInfo | null = null;
    const pe = events[scn.priorEvent];
    const re = events[scn.recoveryEvent];
    if (scn.events.length && pe?.applied && re?.applied && pe.tick !== null && re.tick !== null) {
      shock = { priorEndTick: pe.tick, recoveryStartTick: re.tick, label: scn.events[scn.recoveryEvent].label };
    }
    metrics = analyzeSeed({ seed: t.seed, ticks, cols, totalTicks, shock });
  }

  return {
    ...base,
    ok: error === undefined,
    error,
    endReason,
    endTick: ticks.length ? ticks[ticks.length - 1] : 0,
    samples: ticks.length,
    stepMs,
    wallMs: performance.now() - wall0,
    csv,
    metrics,
    final: lastRow,
    columns,
  };
}

parentPort!.on('message', (msg: TaskMsg) => {
  if (msg.type !== 'task') return;
  runTask(msg)
    .then((res) => parentPort!.postMessage(res))
    .catch((e) => {
      const res: DoneMsg = {
        type: 'done',
        id: msg.id,
        scenario: msg.scenario,
        seed: msg.seed,
        ok: false,
        error: e instanceof Error ? (e.stack ?? e.message) : String(e),
        endReason: 'error',
        endTick: 0,
        samples: 0,
        stepMs: 0,
        wallMs: 0,
        csv: null,
        events: [],
        metrics: null,
        final: {},
        columns: [],
        warnings: [],
      };
      parentPort!.postMessage(res);
    });
});
parentPort!.postMessage({ type: 'ready' });
