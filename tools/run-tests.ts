// `npm test`: every src/**/*.test.ts, the metrics self-test, then the golden-hash check (V2-PLAN.md S0).
// Exits non-zero on any failure. Pass --no-golden to skip the (slow) golden check while iterating.

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const skipGolden = process.argv.includes('--no-golden');

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
  for (const file of findTests(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const r = await run([rel]);
    report(rel, r.code === 0);
    if (r.code !== 0) console.log(r.out.trim().split('\n').slice(-20).join('\n'));
  }

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
