// `npm test`: every src/**/*.test.ts, the metrics self-test, then the golden-hash check (V2-PLAN.md S0).
// Exits non-zero on any failure. Pass --no-golden to skip the (slow) golden check while iterating.

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const skipGolden = process.argv.includes('--no-golden');
// Test files are separate processes, so several run at a time (--jobs N; default: cores minus 2, between 2 and 8) and the
// results print in file order. One at a time the suite took over 10 minutes (measured 2026-11-11).
const jobsArg = process.argv.indexOf('--jobs');
const JOBS = Math.max(1, jobsArg >= 0 ? Number(process.argv[jobsArg + 1]) || 1 : Math.min(8, Math.max(2, availableParallelism() - 2)));

function findTests(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findTests(p, out);
    else if (name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

function run(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

let failed = 0;
function report(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}

async function main(): Promise<void> {
  // a small pool: JOBS files at a time, reported in file order as soon as each one's turn comes
  const files = findTests(join(ROOT, 'src')).map((file) => relative(ROOT, file).replace(/\\/g, '/'));
  const done: ({ code: number; out: string } | undefined)[] = new Array(files.length);
  let next = 0, shown = 0;
  const flush = (): void => {
    for (; shown < files.length && done[shown]; shown++) {
      const r = done[shown]!;
      report(files[shown], r.code === 0);
      if (r.code !== 0) console.log(r.out.trim().split('\n').slice(-20).join('\n'));
    }
  };
  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const k = next++;
      done[k] = await run([files[k]]);
      flush();
    }
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, files.length) }, worker));

  const m = await run(['src/headless/metrics.ts', '--selftest']);
  report('metrics --selftest', m.code === 0);
  if (m.code !== 0) console.log(m.out.trim().split('\n').slice(-20).join('\n'));

  if (!skipGolden) {
    const golden = JSON.parse(readFileSync(join(ROOT, 'tools', 'golden.json'), 'utf8')) as { ticks: number; seeds: Record<string, string> };
    const results = await Promise.all(
      Object.entries(golden.seeds).map(async ([seed, want]) => {
        const r = await run(['src/headless/hash.ts', '--seed', seed, '--ticks', String(golden.ticks)]);
        const got = /hash=([0-9a-f]{8})/.exec(r.out)?.[1] ?? '(none)';
        return { seed, want, got, out: r.out };
      }),
    );
    for (const { seed, want, got, out } of results) {
      report(`golden seed ${seed}`, got === want, got === want ? got : `want ${want}, got ${got}`);
      if (got === '(none)') console.log(out.trim().split('\n').slice(-20).join('\n'));
    }
  } else {
    console.log('skip  golden (--no-golden)');
  }

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}

void main();
