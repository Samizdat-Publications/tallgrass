// Single-seed quick runner for the balancing loop.
//   npx tsx src/headless/run.ts --seed 1 --ticks 50000 --every 2400 [--params '{"k":1.2}'] [--mock] [--cols a,b]
// Prints one compact row every --every ticks (tick, year, species populations, grass, gen_bison) and ms/tick.

import { readFileSync } from 'node:fs';
import { SPECIES_KEYS, YEAR_TICKS } from '../sim/types';
import { argNum, argStr, loadCreateSim, parseCliArgs, parseParams } from './scenarios';

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2), ['mock', 'help']);
  if (args.help) {
    console.log(
      'usage: npx tsx src/headless/run.ts --seed 1 --ticks 50000 --every 2400 [--params \'{"k":1.2}\'] [--mock] [--cols a,b,c]\n' +
        '  --cols adds extra sample() columns to the table (e.g. trait_bison_speed,kills).',
    );
    return;
  }
  const seed = argNum(args, 'seed', 1);
  const ticks = argNum(args, 'ticks', 50000);
  const every = Math.max(1, argNum(args, 'every', YEAR_TICKS));
  const mock = args.mock === true;
  const params = parseParams(argStr(args, 'params'), (p) => readFileSync(p, 'utf8'));
  const extra = (argStr(args, 'cols') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const createSim = await loadCreateSim(mock);
  const t0 = performance.now();
  const sim = createSim({ seed, params });
  const initMs = performance.now() - t0;

  const first = sim.sample();
  const shown = SPECIES_KEYS.filter((k) => (first[`pop_${k}`] ?? 0) > 0);
  const grassCols = Object.keys(first).filter((k) => k.startsWith('grass')).slice(0, 1);
  const cols = [...shown.map((k) => `pop_${k}`), ...grassCols, ...(`gen_bison` in first ? ['gen_bison'] : []), ...extra.filter((c) => c in first)];
  for (const c of extra) if (!(c in first)) console.warn(`note: column "${c}" is not in sample()`);

  const head = ['tick', 'year', ...cols.map((c) => c.replace(/^pop_/, ''))];
  const widths = head.map((h) => Math.max(h.length, 8));
  const fmt = (v: number, name: string): string => {
    if (name.startsWith('pop_') || name === 'tick') return String(Math.round(v));
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(3);
  };
  const printRow = (cells: string[]) => console.log(cells.map((c, i) => c.padStart(widths[i])).join('  '));
  console.log(`seed ${seed}, ${ticks} ticks, sample every ${every}${mock ? ' (MOCK sim)' : ''}${Object.keys(params).length ? ', params ' + JSON.stringify(params) : ''}`);
  printRow(head);

  const series: Record<string, number[]> = {};
  for (const c of cols) series[c] = [];
  const record = (row: Record<string, number>) => {
    printRow([String(sim.tick), (sim.tick / YEAR_TICKS).toFixed(1), ...cols.map((c) => fmt(row[c], c))]);
    for (const c of cols) series[c].push(row[c]);
  };
  record(first);

  let stepMs = 0;
  let allExtinct = false;
  while (sim.tick < ticks) {
    const n = Math.min(every, ticks - sim.tick);
    const s0 = performance.now();
    sim.step(n);
    stepMs += performance.now() - s0;
    const row = sim.sample();
    record(row);
    if (sim.populations().reduce((a, b) => a + b, 0) === 0) {
      allExtinct = true;
      console.log(`all animals extinct at tick ${sim.tick}`);
      break;
    }
  }

  // footer: min / mean / max per column after the first 15%
  console.log('');
  const skip = Math.floor(series[cols[0]].length * 0.15);
  for (const c of cols.filter((c) => c.startsWith('pop_'))) {
    const v = series[c].slice(skip);
    const mean = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    console.log(`${c.replace(/^pop_/, '').padEnd(10)} min ${Math.min(...v)}  mean ${mean.toFixed(1)}  max ${Math.max(...v)}  final ${series[c][series[c].length - 1]}`);
  }
  const done = sim.tick;
  console.log(`\n${done} ticks in ${(stepMs / 1000).toFixed(2)} s of stepping: ${(stepMs / Math.max(1, done)).toFixed(4)} ms/tick (${Math.round((done / stepMs) * 1000)} ticks/s), init ${initMs.toFixed(0)} ms${allExtinct ? ', ended early (extinct)' : ''}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
