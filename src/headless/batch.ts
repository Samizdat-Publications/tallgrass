// Batch stability harness: many seeds x scenarios in parallel worker threads.
//
//   npx tsx src/headless/batch.ts --seeds 20 [--seed-base 1] [--ticks 1000000 | --generations 1000] --sample 500
//       --threads 15 --out review/stability/<name> [--scenario baseline|cull70|drought|wolfwipe|all]
//       [--params '{"k": 1.2}'] [--mock] [--max-minutes 60]
//
// Output layout (see also tools/charts.py):
//   <out>/meta.json                    run arguments, git commit, wall time, ms per tick
//   <out>/<scenario>/seed_<n>.csv      tick + every sample() column, one row per --sample ticks
//   <out>/<scenario>/summary.json      per-seed metrics, aggregate, acceptance verdicts, shock ticks
//   <out>/<scenario>/metrics.md        readable tables of the same

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { setCalendarScale, YEAR_TICKS } from '../sim/types';
import { applyOverrides, defaultParams } from '../sim/params';
import { aggregate, renderMarkdown, verdict, type SeedMetrics } from './metrics';
import { SCENARIOS, argNum, argStr, parseCliArgs, parseParams, resolveScenarios } from './scenarios';
import type { DoneMsg, ProgressMsg, TaskMsg, WorkerInit } from './batchWorker';

const USAGE = `usage: npx tsx src/headless/batch.ts --seeds 20 [--seed-base 1] [--ticks 1000000 | --generations 1000]
         --sample 500 --threads 15 --out review/stability/<name>
         [--scenario baseline|cull70|drought|wolfwipe|all] [--params '{"k":1.2}'] [--mock] [--max-minutes 60]
  --generations G   run each seed until gen_bison >= G (--ticks becomes the safety cap, default 20,000,000);
                    shocks then fire at their fraction of G instead of their fraction of the tick count
  --scenario        one name, a comma list, or "all" (default baseline)
  --params          JSON object, relaxed JSON ({k:1.2}) or @file.json passed to createSim
  --max-minutes M   stop cleanly after M minutes and write partial results
  --progress-sec S  progress line interval (default 15)
  --mock            use src/headless/mocksim.ts instead of src/sim/sim.ts`;

function hms(sec: number): string {
  if (!Number.isFinite(sec)) return '--:--:--';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function gitCommit(): string {
  // runs from scratch/frozen/<hash>/src are that commit, whatever HEAD has moved on to
  const frozen = /frozen[\\/]([0-9a-f]{7,40})[\\/]/.exec(process.argv[1] ?? '');
  if (frozen) return `${frozen[1]} (frozen copy)`;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

interface Task {
  msg: TaskMsg;
  scenario: string;
  seed: number;
  fraction: number;
  tick: number;
  stepMs: number;
  state: 'queued' | 'running' | 'done';
  result?: DoneMsg;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), ['mock', 'help']);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const startedAt = new Date();
  const wall0 = performance.now();
  const seedsN = Math.max(1, Math.floor(argNum(args, 'seeds', 20)));
  const seedBase = Math.floor(argNum(args, 'seed-base', 1));
  const generations = args.generations !== undefined ? argNum(args, 'generations', 1000) : null;
  const ticks = Math.floor(args.ticks !== undefined ? argNum(args, 'ticks', 1_000_000) : generations !== null ? 20_000_000 : 1_000_000);
  const sampleEvery = Math.max(1, Math.floor(argNum(args, 'sample', 500)));
  const mock = args.mock === true;
  const scenarios = resolveScenarios(argStr(args, 'scenario'));
  const params = parseParams(argStr(args, 'params'), (p) => readFileSync(p, 'utf8'));
  // the workers set the calendar when they build each sim; the reports here need the same year length
  setCalendarScale(applyOverrides(defaultParams(), params).calendarScale);
  const maxMinutes = argNum(args, 'max-minutes', 0);
  const progressSec = Math.max(1, argNum(args, 'progress-sec', 15));
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outRoot = path.resolve(process.cwd(), argStr(args, 'out') ?? path.join('review', 'stability', `run_${stamp}`));
  const totalTasks = seedsN * scenarios.length;
  const defaultThreads = Math.max(1, Math.min(15, (os.availableParallelism?.() ?? os.cpus().length) - 1));
  const threads = Math.max(1, Math.min(Math.floor(argNum(args, 'threads', defaultThreads)), totalTasks));

  mkdirSync(outRoot, { recursive: true });
  console.log(
    `batch: ${scenarios.join(',')} x ${seedsN} seeds (${seedBase}..${seedBase + seedsN - 1}), ` +
      (generations !== null ? `until gen_bison >= ${generations} (cap ${ticks} ticks)` : `${ticks} ticks`) +
      `, sample every ${sampleEvery}, ${threads} threads${mock ? ', MOCK sim' : ''}\nout: ${outRoot}`,
  );

  // tasks, seed-major so a --max-minutes cut leaves every scenario with the same seeds
  const tasks: Task[] = [];
  let id = 0;
  for (let i = 0; i < seedsN; i++) {
    for (const scenario of scenarios) {
      const seed = seedBase + i;
      tasks.push({
        msg: { type: 'task', id: id++, scenario, seed, params, ticks, generations, sampleEvery, outDir: path.join(outRoot, scenario), progressMs: 1500 },
        scenario,
        seed,
        fraction: 0,
        tick: 0,
        stepMs: 0,
        state: 'queued',
      });
    }
  }
  const queue = tasks.slice();

  const stopFlag = new Int32Array(new SharedArrayBuffer(4));
  let stopReason = '';
  const requestStop = (why: string) => {
    if (stopReason) return;
    stopReason = why;
    Atomics.store(stopFlag, 0, 1);
    console.log(`\nstopping cleanly (${why}): finishing in-flight seeds and writing partial results...`);
  };
  process.on('SIGINT', () => {
    if (stopReason) process.exit(130);
    requestStop('interrupted');
  });
  let limitTimer: NodeJS.Timeout | null = null;
  if (maxMinutes > 0) limitTimer = setTimeout(() => requestStop(`--max-minutes ${maxMinutes} reached`), maxMinutes * 60_000);

  let fatalError: string | null = null;
  let finished = 0;
  const workers: Worker[] = [];
  const current = new Map<Worker, Task>();

  const timer = setInterval(() => {
    const running = tasks.filter((t) => t.state === 'running');
    const elapsed = (performance.now() - wall0) / 1000;
    const P = tasks.reduce((a, t) => a + t.fraction, 0) / tasks.length;
    const meanTick = tasks.reduce((a, t) => a + t.tick, 0) / tasks.length;
    const rates = (running.some((t) => t.stepMs > 0) ? running : tasks.filter((t) => t.result)).filter((t) => t.stepMs > 0).map((t) => (t.tick / t.stepMs) * 1000);
    const rate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const eta = P > 0.001 ? (elapsed * (1 - P)) / P : NaN;
    console.log(
      `[${hms(elapsed)}] ${finished}/${tasks.length} seeds done, ${running.length} running | mean tick ${Math.round(meanTick).toLocaleString('en-US')} ` +
        `(${(P * 100).toFixed(0)}%) | ${Math.round(rate).toLocaleString('en-US')} ticks/s per worker | ETA ${hms(eta)}`,
    );
  }, progressSec * 1000);

  await new Promise<void>((resolve) => {
    const settle = () => {
      if (tasks.every((t) => t.state !== 'running') && (queue.length === 0 || stopReason || fatalError)) resolve();
    };
    const workerInit: WorkerInit = { stopFlag: stopFlag.buffer as SharedArrayBuffer, mock };
    const dispatch = (w: Worker) => {
      if (stopReason || fatalError) return;
      const t = queue.shift();
      if (!t) return;
      t.state = 'running';
      current.set(w, t);
      w.postMessage(t.msg);
    };
    for (let i = 0; i < threads; i++) {
      const w = new Worker(new URL('./batchWorker.ts', import.meta.url), { workerData: workerInit });
      workers.push(w);
      w.on('message', (m: ProgressMsg | DoneMsg | { type: 'ready' }) => {
        if (m.type === 'ready') {
          dispatch(w);
        } else if (m.type === 'progress') {
          const t = tasks[m.id];
          t.tick = m.tick;
          t.stepMs = m.stepMs;
          t.fraction = m.fraction;
        } else if (m.type === 'done') {
          const t = tasks[m.id];
          t.state = 'done';
          t.result = m;
          t.tick = m.endTick;
          t.stepMs = m.stepMs;
          t.fraction = m.endReason === 'aborted' ? t.fraction : 1;
          finished++;
          if (!m.ok) {
            console.error(`seed ${m.seed} (${m.scenario}) failed: ${(m.error ?? '').split('\n')[0]}`);
            if (m.fatal && !fatalError) {
              fatalError = m.error ?? 'fatal worker error';
              Atomics.store(stopFlag, 0, 1);
            }
          }
          for (const wr of m.warnings) console.warn(`seed ${m.seed} (${m.scenario}): ${wr}`);
          current.delete(w);
          dispatch(w);
          settle();
        }
      });
      w.on('error', (e: Error) => {
        const cur = current.get(w);
        console.error(`worker error${cur ? ` (seed ${cur.seed}, ${cur.scenario})` : ''}: ${e.stack ?? e}`);
        if (cur) {
          cur.state = 'done';
          cur.result = {
            type: 'done', id: cur.msg.id, scenario: cur.scenario, seed: cur.seed, ok: false, error: String(e), endReason: 'error',
            endTick: 0, samples: 0, stepMs: 0, wallMs: 0, csv: null, events: [], metrics: null, final: {}, columns: [], warnings: [],
          };
          finished++;
          current.delete(w);
        }
        fatalError ??= `worker crashed: ${e}`;
        Atomics.store(stopFlag, 0, 1);
        settle();
      });
    }
  });
  clearInterval(timer);

  if (limitTimer) clearTimeout(limitTimer);
  await Promise.all(workers.map((w) => w.terminate()));

  if (fatalError) console.error(`\nFATAL: ${fatalError}`);

  // ---- write per-scenario results -------------------------------------------------------------------------------
  const commit = gitCommit();
  const wallSec = (performance.now() - wall0) / 1000;
  let totalStepMs = 0;
  let totalTicksRun = 0;
  let errors = 0;
  let aborted = 0;
  let skipped = 0;
  const written: string[] = [];
  const scenarioStats: Record<string, unknown> = {};

  for (const scenario of scenarios) {
    const def = SCENARIOS[scenario];
    const sTasks = tasks.filter((t) => t.scenario === scenario);
    const done = sTasks.filter((t) => t.result);
    const skip = sTasks.filter((t) => !t.result).map((t) => t.seed);
    skipped += skip.length;
    const withMetrics = done.filter((t) => t.result!.metrics);
    const seedMetrics: SeedMetrics[] = withMetrics.map((t) => t.result!.metrics!);
    const agg = aggregate(seedMetrics);
    const columns = done.find((t) => t.result!.columns.length)?.result!.columns ?? [];
    for (const t of done) {
      totalStepMs += t.result!.stepMs;
      totalTicksRun += t.result!.endTick;
      if (!t.result!.ok) errors++;
      if (t.result!.endReason === 'aborted') aborted++;
    }
    const verdicts: Record<string, unknown> = {};
    for (const [k, a] of Object.entries(agg.species)) verdicts[k] = verdict(a);
    const summary = {
      scenario,
      description: def.description,
      params,
      mode: { ticks, generations, sampleEvery, yearTicks: YEAR_TICKS },
      events: def.events.map((e) => ({ label: e.label, frac: e.frac, intervention: e.intervention })),
      priorEvent: def.priorEvent,
      recoveryEvent: def.recoveryEvent,
      columns,
      seeds: done
        .map((t) => ({
          seed: t.seed,
          ok: t.result!.ok,
          error: t.result!.error ? t.result!.error.split('\n')[0] : undefined,
          endReason: t.result!.endReason,
          endTick: t.result!.endTick,
          samples: t.result!.samples,
          csv: t.result!.csv,
          wallMs: Math.round(t.result!.wallMs),
          msPerTick: t.result!.endTick ? t.result!.stepMs / t.result!.endTick : null,
          events: t.result!.events.map((e) => ({ label: e.label, kind: e.kind, frac: e.frac, tick: e.tick, applied: e.applied })),
          final: t.result!.final,
          metrics: t.result!.metrics,
        }))
        .sort((a, b) => a.seed - b.seed),
      skippedSeeds: skip,
      aggregate: agg,
      verdict: verdicts,
    };
    const dir = path.join(outRoot, scenario);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 1));

    const shockLine = (() => {
      const first = withMetrics.find((t) => t.result!.events.some((e) => e.applied));
      if (!first || !def.events.length) return null;
      return first.result!.events.map((e) => `${e.label} at tick ${e.tick ?? 'never'}${e.tick ? ` (year ${(e.tick / YEAR_TICKS).toFixed(1)})` : ''}`).join('; ');
    })();
    const lines = [
      `${def.description}`,
      `Seeds: ${seedMetrics.length} (${seedBase}..${seedBase + seedsN - 1})${skip.length ? `, ${skip.length} not started (${stopReason || 'stopped'})` : ''}`,
      generations !== null ? `Run length: until gen_bison >= ${generations} (cap ${ticks} ticks)` : `Run length: ${ticks} ticks (${(ticks / YEAR_TICKS).toFixed(0)} years)`,
      `Sampled every ${sampleEvery} ticks; commit ${commit}; ${mock ? 'MOCK sim (not the real game)' : 'real sim'}`,
      ...(Object.keys(params).length ? [`Params: ${JSON.stringify(params)}`] : []),
      ...(shockLine ? [`Shocks: ${shockLine}`] : []),
      ...(aborted ? [`WARNING: ${aborted} run(s) were stopped early (${stopReason}); their statistics cover a shorter run`] : []),
      ...(done.some((t) => !t.result!.ok) ? [`WARNING: ${done.filter((t) => !t.result!.ok).length} seed(s) failed, see summary.json`] : []),
      ...(def.events.length === 2 ? ['Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.'] : []),
    ];
    writeFileSync(path.join(dir, 'metrics.md'), renderMarkdown({ title: `Stability metrics: ${scenario}`, lines, hasShock: def.events.length > 0 }, seedMetrics, agg));
    written.push(dir);
    scenarioStats[scenario] = {
      seeds: sTasks.length,
      completed: done.filter((t) => t.result!.ok).length,
      persistencePct: Object.fromEntries(Object.entries(agg.species).map(([k, a]) => [k, a.persistencePct])),
      maxGen: agg.maxGen,
    };

    console.log(`\n== ${scenario} ==`);
    for (const [k, a] of Object.entries(agg.species)) {
      const v = verdict(a);
      console.log(
        `  ${k.padEnd(10)} persisted ${a.persistedCount}/${a.seedsStarted} (${a.persistencePct.toFixed(0)}%)  CV ${a.medianCv?.toFixed(2) ?? 'n/a'}  near-zero ${a.medianNearZeroFrac !== null ? (a.medianNearZeroFrac * 100).toFixed(1) + '%' : 'n/a'}` +
          (a.recoveredPct !== null ? `  recovered ${a.recoveredPct.toFixed(0)}% (median ${a.medianRecoveryTicks !== null ? (a.medianRecoveryTicks / YEAR_TICKS).toFixed(1) + ' yr' : 'n/a'})` : '') +
          `  ${v.all ? 'PASS' : 'FAIL'}`,
      );
    }
    console.log(`  max gen_bison ${agg.maxGen?.toFixed(1) ?? 'n/a'}`);
  }

  const meta = {
    args: {
      seeds: seedsN, seedBase, ticks, generations, sampleEvery, threads, scenarios, params, mock, maxMinutes, progressSec,
      out: outRoot, argv: process.argv.slice(2),
    },
    commit,
    node: process.version,
    platform: `${process.platform} ${os.arch()}`,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    wallSeconds: Number(wallSec.toFixed(2)),
    stopReason: stopReason || null,
    tasks: { total: tasks.length, completed: tasks.length - skipped - errors, errors, aborted, skipped },
    /** CPU time spent inside sim.step() divided by ticks run, averaged over every task */
    msPerTick: totalTicksRun ? Number((totalStepMs / totalTicksRun).toFixed(6)) : null,
    ticksRun: totalTicksRun,
    /** aggregate throughput across all workers, wall clock */
    ticksPerSecWall: wallSec > 0 ? Math.round(totalTicksRun / wallSec) : null,
    scenarios: scenarioStats,
  };
  writeFileSync(path.join(outRoot, 'meta.json'), JSON.stringify(meta, null, 1));

  console.log(
    `\ndone in ${hms(wallSec)} (${wallSec.toFixed(1)} s): ${totalTicksRun.toLocaleString('en-US')} ticks total, ${meta.msPerTick ?? 'n/a'} ms/tick per worker, ` +
      `${meta.ticksPerSecWall?.toLocaleString('en-US') ?? 'n/a'} ticks/s overall${errors ? `, ${errors} FAILED` : ''}${skipped ? `, ${skipped} not started` : ''}`,
  );
  console.log(`wrote ${written.join(', ')} and ${path.join(outRoot, 'meta.json')}`);
  if (errors || fatalError) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
