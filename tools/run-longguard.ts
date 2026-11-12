// `npm run test:long`: the long guard hash (S6a). Runs src/headless/hash.ts for every seed in tools/longguard.json at its
// tick count, with its params (every optional mechanism switched on), one process per seed in parallel, and fails if any
// hash differs from the recorded one. `npm run test:long -- --record` writes the fresh hashes back into the file instead.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const FILE = join(ROOT, 'tools', 'longguard.json');
const record = process.argv.includes('--record');

interface Guard {
  ticks: number;
  params: Record<string, number>;
  seeds: Record<string, string>;
  [k: string]: unknown;
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

async function main(): Promise<void> {
  const raw = readFileSync(FILE, 'utf8');
  const guard = JSON.parse(raw) as Guard;
  const t0 = Date.now();
  console.log(`long guard: ${Object.keys(guard.seeds).length} seeds x ${guard.ticks} ticks, ${Object.keys(guard.params).length} params on${record ? ' (recording)' : ''}`);
  const results = await Promise.all(
    Object.entries(guard.seeds).map(async ([seed, want]) => {
      const s0 = Date.now();
      const r = await run(['src/headless/hash.ts', '--seed', seed, '--ticks', String(guard.ticks), '--params', JSON.stringify(guard.params)]);
      const got = /hash=([0-9a-f]{8})/.exec(r.out)?.[1] ?? '(none)';
      return { seed, want, got, out: r.out, secs: (Date.now() - s0) / 1000 };
    }),
  );
  let failed = 0;
  for (const { seed, want, got, out, secs } of results) {
    const ok = got !== '(none)' && (record || got === want);
    if (!ok) failed++;
    const detail = record ? `recorded ${got}` : got === want ? got : `want ${want || '(unrecorded)'}, got ${got}`;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  long seed ${seed}  ${detail}  (${secs.toFixed(0)} s)`);
    if (got === '(none)') console.log(out.trim().split('\n').slice(-20).join('\n'));
  }
  if (record && !failed) {
    for (const { seed, got } of results) guard.seeds[seed] = got;
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(FILE, JSON.stringify(guard, null, 1).replace(/\n/g, eol) + eol);
    console.log(`wrote ${results.length} hashes to tools/longguard.json`);
  }
  console.log(`\nwall ${((Date.now() - t0) / 1000).toFixed(0)} s, ${failed ? `${failed} failed` : 'all passed'}`);
  process.exit(failed ? 1 : 0);
}

void main();
