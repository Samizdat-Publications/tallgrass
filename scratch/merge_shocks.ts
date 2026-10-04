// Merge a shock suite that was cut short with a re-run of its missing seeds: recompute every seed's metrics from the
// CSVs of both folders and write metrics_merged.md + summary_merged.json per scenario into the first folder.
// Usage: npx tsx scratch/merge_shocks.ts <first-run-dir> <rerun-dir> <calendarScale>
import { copyFileSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { aggregate, analyzeSeed, renderMarkdown, verdict, type SeedMetrics } from '../src/headless/metrics';
import { setCalendarScale } from '../src/sim/types';

const [a, b, k] = process.argv.slice(2);
setCalendarScale(Number(k ?? 1));

for (const scenario of ['cull70', 'drought', 'wolfwipe']) {
  const sumB = JSON.parse(readFileSync(path.join(b, scenario, 'summary.json'), 'utf8'));
  const cap: number = sumB.mode.ticks;
  // the schedule is the same for every seed: take the event ticks from a re-run seed where both fired
  const evSeed = sumB.seeds.find((s: any) => s.events.every((e: any) => e.applied));
  const pe = evSeed.events[sumB.priorEvent], re = evSeed.events[sumB.recoveryEvent];
  const seeds: SeedMetrics[] = [];
  const sources: string[] = [];
  for (const dir of [a, b]) {
    const d = path.join(dir, scenario);
    for (const f of readdirSync(d).filter((x) => /^seed_\d+\.csv$/.test(x))) {
      const seed = Number(f.slice(5, -4));
      if (seeds.some((s) => s.seed === seed)) continue;
      const lines = readFileSync(path.join(d, f), 'utf8').trim().split('\n');
      const head = lines[0].split(',');
      const rows = lines.slice(1).map((l) => l.split(',').map(Number));
      const ticks = rows.map((r) => r[0]);
      const last = rows[rows.length - 1];
      const allDead = ['pop_bison', 'pop_wolf', 'pop_raven', 'pop_pronghorn'].every((c) => last[head.indexOf(c)] === 0);
      // a seed from the first run that neither reached the cap nor died out was cut off: the re-run has it
      if (dir === a && ticks[ticks.length - 1] < cap - 1000 && !allDead) continue;
      const cols: Record<string, number[]> = {};
      head.forEach((c, i) => { if (c.startsWith('pop_') || c === 'gen_bison') cols[c] = rows.map((r) => r[i]); });
      const shockApplied = ticks[ticks.length - 1] >= re.tick;
      seeds.push(analyzeSeed({ seed, ticks, cols, totalTicks: cap, shock: shockApplied ? { priorEndTick: pe.tick, recoveryStartTick: re.tick, label: re.label } : null }));
      sources.push(`${seed}:${dir === a ? 'first' : 'rerun'}`);
    }
  }
  seeds.sort((x, y) => x.seed - y.seed);
  const agg = aggregate(seeds);
  const verdicts: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(agg.species)) verdicts[key] = verdict(v);
  const out = path.join(a, scenario);
  writeFileSync(path.join(out, 'summary_merged.json'), JSON.stringify({ scenario, mode: sumB.mode, params: sumB.params, events: sumB.events, sources, aggregate: agg, verdict: verdicts }, null, 1));
  const lines = [
    sumB.description,
    `Seeds: ${seeds.length} (merged: ${sources.filter((s) => s.endsWith('first')).length} from ${a}, ${sources.filter((s) => s.endsWith('rerun')).length} re-run in ${b})`,
    `Run length: ${cap} ticks; params ${JSON.stringify(sumB.params)}`,
  ];
  writeFileSync(path.join(out, 'metrics_merged.md'), renderMarkdown({ title: `Stability metrics: ${scenario} (merged)`, lines, hasShock: true }, seeds, agg));
  console.log(`${scenario}: ${seeds.length} seeds; ` + Object.entries(agg.species).map(([key, v]: [string, any]) => `${key} ${v.persistencePct.toFixed(0)}% persisted, ${v.recoveredPct ?? 'n/a'}% recovered`).join('; '));
  // the charts read every seed CSV in the folder: replace the cut-off ones with the re-run's complete runs
  for (const s of sources.filter((x) => x.endsWith('rerun'))) {
    const f = `seed_${s.split(':')[0]}.csv`;
    copyFileSync(path.join(b, scenario, f), path.join(out, f));
  }
  // a summary the chart tool can read in full: per-seed shock ticks (the schedule is the same for every seed) and metrics
  const seedEntries = seeds.map((m) => ({ seed: m.seed, csv: `seed_${m.seed}.csv`, events: evSeed.events, metrics: m }));
  writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ scenario, description: sumB.description, mode: sumB.mode, params: sumB.params, events: sumB.events, priorEvent: sumB.priorEvent, recoveryEvent: sumB.recoveryEvent, columns: sumB.columns, seeds: seedEntries, aggregate: agg, verdict: verdicts, merged: true }, null, 1));
}
