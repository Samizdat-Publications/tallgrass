// The one-command gate. Runs every check in order, keeps going after a failure, prints a table, exits 1 on any failure.
//
//   node tools/check.mjs [--no-gpu] [--full]
//
// Fast mode (default, a few minutes): preflight, typecheck, lint, tests (golden hashes), shots (gate set) + scorecard.
//   --no-gpu  skips every step that needs the GPU (shots, scorecard, and with --full the perf bench)
//   --full    adds the full shot set with --verify, and the GPU perf bench compared with tools/perf-budget.json
//
// Result of the last run: artifacts/check/last.json. Every child process has a timeout and is killed by PID (a process tree on
// Windows) when it runs out. Nothing here ever kills a process by name.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const NO_GPU = argv.includes('--no-gpu');
const FULL = argv.includes('--full');
const NODE = process.execPath;
const PY = join(ROOT, '.venv', 'Scripts', 'python.exe');
const MIN = 60 * 1000;

const steps = []; // { name, status: 'pass'|'fail'|'skip', seconds, note, tail }
const T0 = Date.now();

function killTree(pid) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    else process.kill(-pid, 'SIGKILL');
  } catch { /* already gone */ }
}

// Run a child to completion or timeout. Output is captured (last ~1 MB), not streamed.
function exec(file, args, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let out = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(file, args, { cwd: ROOT, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: 1, out: String(e.message || e), timedOut: false, seconds: 0 });
      return;
    }
    const take = (d) => { out += d; if (out.length > 1_000_000) out = out.slice(-800_000); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);
    child.on('error', (e) => { out += '\n' + e.message; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, timedOut, seconds: (Date.now() - t0) / 1000 });
    });
  });
}

const tailOf = (s, n) => s.replace(/\r/g, '').trimEnd().split('\n').slice(-n).join('\n');
const fmtSec = (s) => s.toFixed(1) + ' s';

function record(name, status, seconds, note = '', tail = '') {
  const label = status === 'pass' ? 'pass' : status === 'fail' ? 'FAIL' : 'skip';
  console.log(`${label.padEnd(5)} ${fmtSec(seconds).padStart(8)}${note ? '  ' + note : ''}`);
  if (status === 'fail' && tail) console.log(tail.split('\n').map((l) => '        ' + l).join('\n'));
  steps.push({ name, status, seconds: +seconds.toFixed(2), note, tail: tail ? tailOf(tail, 40) : '' });
}

function begin(name) { process.stdout.write(`${name.padEnd(12)} ... `); }

async function step(name, file, args, timeoutMs, okNote = () => '') {
  begin(name);
  const r = await exec(file, args, timeoutMs);
  if (r.timedOut) { record(name, 'fail', r.seconds, `timed out after ${Math.round(timeoutMs / MIN)} min`, tailOf(r.out, 15)); return r; }
  if (r.code !== 0) { record(name, 'fail', r.seconds, `exit ${r.code}`, tailOf(r.out, 25)); return r; }
  record(name, 'pass', r.seconds, okNote(r));
  return r;
}

function skip(name, why) {
  begin(name);
  record(name, 'skip', 0, why);
}

// ------------------------------------------------------------------ 1. preflight
async function preflight() {
  begin('preflight');
  const t0 = Date.now();
  const problems = [];
  const nvm = join(ROOT, '.nvmrc');
  let nodeNote = '';
  if (existsSync(nvm)) {
    const want = readFileSync(nvm, 'utf8').trim();
    const m = /^v?(\d+)/.exec(want);
    if (m) {
      const have = Number(process.versions.node.split('.')[0]);
      if (have !== Number(m[1])) problems.push(`Node ${process.versions.node} does not match .nvmrc (${want}). The golden hash depends on the JS engine. Fix: switch to Node ${m[1]} (nvm use ${m[1]}).`);
      else nodeNote = `node ${process.versions.node}`;
    }
  } else {
    nodeNote = `node ${process.versions.node}, no .nvmrc`;
  }
  try {
    const { chromium } = await import('playwright');
    const p = chromium.executablePath();
    if (!p || !existsSync(p)) problems.push(`Playwright Chromium is not installed (expected at ${p}). Fix: npx playwright install chromium`);
  } catch (e) {
    problems.push(`playwright could not be loaded (${String(e.message || e).split('\n')[0]}). Fix: npm install, then npx playwright install chromium`);
  }
  if (!existsSync(PY)) problems.push(`.venv/Scripts/python.exe is missing (${PY}). Fix: create the venv: python -m venv .venv`);
  const seconds = (Date.now() - t0) / 1000;
  if (problems.length) record('preflight', 'fail', seconds, `${problems.length} problem${problems.length === 1 ? '' : 's'}`, problems.map((p) => '- ' + p).join('\n'));
  else record('preflight', 'pass', seconds, nodeNote);
}

// ------------------------------------------------------------------ perf compare
function perfStep(stamp) {
  return async () => {
    const name = 'perf';
    begin(name);
    const outRel = `artifacts/perf/${stamp}.json`;
    const budgetPath = join(ROOT, 'tools', 'perf-budget.json');
    let args = ['tools/gpubench.mjs', '--out', outRel];
    let budget = null;
    if (existsSync(budgetPath)) {
      try { budget = JSON.parse(readFileSync(budgetPath, 'utf8')); } catch (e) { record(name, 'fail', 0, 'tools/perf-budget.json is not valid JSON', String(e.message)); return; }
      if (budget.size) args = [...args, '--size', budget.size];
    }
    const r = await exec(NODE, args, 30 * MIN);
    if (r.timedOut) { record(name, 'fail', r.seconds, 'gpubench timed out after 30 min', tailOf(r.out, 15)); return; }
    if (r.code !== 0) { record(name, 'fail', r.seconds, `gpubench exit ${r.code}`, tailOf(r.out, 25)); return; }
    let result;
    try { result = JSON.parse(readFileSync(join(ROOT, outRel), 'utf8')); } catch (e) { record(name, 'fail', r.seconds, `could not read ${outRel}`, String(e.message)); return; }
    const views = result.views || {};
    const medians = Object.entries(views).map(([k, v]) => `${k} ${v.median == null ? 'n/a' : v.median.toFixed(2)}`);
    if (!budget || !budget.views) {
      record(name, 'pass', r.seconds, `no budget set (tools/perf-budget.json); medians ms: ${medians.join(', ')}`);
      return;
    }
    if (budget.size && result.size && budget.size !== result.size) {
      record(name, 'fail', r.seconds, `bench ran at ${result.size}, budget is for ${budget.size}`);
      return;
    }
    const over = [];
    for (const [view, limit] of Object.entries(budget.views)) {
      const m = views[view] && views[view].median;
      if (m == null) { over.push(`${view}: no median in the bench output`); continue; }
      const pct = ((m - limit) / limit) * 100;
      if (m > limit * 1.1) over.push(`${view}: ${m.toFixed(2)} ms vs budget ${limit} ms (+${pct.toFixed(1)}%)`);
    }
    if (over.length) record(name, 'fail', r.seconds, `${over.length} view${over.length === 1 ? '' : 's'} over budget by more than 10%`, over.map((o) => '- ' + o).join('\n') + '\nmedians ms: ' + medians.join(', '));
    else record(name, 'pass', r.seconds, `within 10% of budget; medians ms: ${medians.join(', ')}`);
  };
}

// ------------------------------------------------------------------ main
console.log(`tallgrass gate: ${FULL ? 'full' : 'fast'}${NO_GPU ? ', no GPU' : ''}  (node ${process.versions.node})\n`);

await preflight();
await step('typecheck', NODE, [join('node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', '.'], 5 * MIN);
await step('lint', NODE, ['tools/lint.mjs'], 2 * MIN, (r) => (tailOf(r.out, 1).match(/lint: .*/) || [''])[0]);
await step('tests', NODE, ['--import', 'tsx', 'tools/run-tests.ts'], 20 * MIN);

const hasShots = existsSync(join(ROOT, 'tools', 'shots.mjs'));
const hasScore = existsSync(join(ROOT, 'tools', 'scorecard.py'));
let shotsPassed = false;
if (NO_GPU) {
  skip('shots', '--no-gpu');
  skip('scorecard', '--no-gpu');
} else if (!hasShots) {
  skip('shots', 'tools/shots.mjs does not exist yet');
  skip('scorecard', 'needs shots');
} else {
  const r = await step('shots', NODE, ['tools/shots.mjs', '--shots', 'gate', '--out', 'artifacts/shots/check'], 15 * MIN);
  shotsPassed = r.code === 0 && !r.timedOut;
  if (!hasScore) skip('scorecard', 'tools/scorecard.py does not exist yet');
  else if (!shotsPassed) skip('scorecard', 'shots did not pass');
  // scorecard exits 1 only on `drifted`; identical, noise, noise (jpeg) and new all pass. The note shows the status tally.
  else await step('scorecard', PY, ['tools/scorecard.py', 'artifacts/shots/check', '--fail-on-drift', '--no-history'], 5 * MIN,
    (r) => (r.out.match(/^drift: .*$/m) || [''])[0]);
}

if (FULL) {
  if (NO_GPU) {
    skip('shots-all', '--no-gpu');
    skip('perf', '--no-gpu');
  } else {
    if (!hasShots) skip('shots-all', 'tools/shots.mjs does not exist yet');
    // --verify exits 1 only when a shot `differs`; cross-load `noise` passes. The note shows the tally.
    else await step('shots-all', NODE, ['tools/shots.mjs', '--shots', 'all', '--verify'], 30 * MIN,
      (r) => (r.out.match(/^verify passed: .*$/m) || [''])[0]);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await perfStep(stamp)();
  }
}

// ------------------------------------------------------------------ table + last.json
const total = (Date.now() - T0) / 1000;
const failed = steps.filter((s) => s.status === 'fail');
const w = Math.max(...steps.map((s) => s.name.length), 4);
console.log('\n' + 'step'.padEnd(w) + '  result  ' + 'seconds'.padStart(8) + '  note');
console.log('-'.repeat(w) + '  ------  ' + '-'.repeat(8) + '  ----');
for (const s of steps) {
  const label = s.status === 'pass' ? 'pass' : s.status === 'fail' ? 'FAIL' : 'skip';
  console.log(s.name.padEnd(w) + '  ' + label.padEnd(6) + '  ' + s.seconds.toFixed(1).padStart(8) + '  ' + (s.note || '').split('\n')[0]);
}
console.log(`\n${failed.length ? 'GATE FAILED: ' + failed.map((s) => s.name).join(', ') : 'gate passed'} (${fmtSec(total)})`);

try {
  const dir = join(ROOT, 'artifacts', 'check');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'last.json'), JSON.stringify({
    finishedAt: new Date().toISOString(),
    mode: FULL ? 'full' : 'fast',
    noGpu: NO_GPU,
    node: process.versions.node,
    ok: failed.length === 0,
    totalSeconds: +total.toFixed(2),
    steps,
  }, null, 2) + '\n');
} catch (e) {
  console.error('could not write artifacts/check/last.json: ' + e.message);
}
process.exit(failed.length ? 1 : 0);
