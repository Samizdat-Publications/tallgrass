// Staged balancing screen (work package S1): run a config through cheap-to-dear stages, judge each with
// tools/gates.py, record it in review/stability/sensitivity.jsonl, and stop at the first failed stage.
//
//   node tools/screen.mjs --name <label> [--params '{...}'] [--control <dir>] [--stages filter,full,shocks]
//                         [--threads N] [--keep-going] [--wait] [--stage-max-minutes M] [--dry-run]
//
// Stages (a valley year is 2,400 ticks):
//   filter  8 seeds in canary order (3, 2, 1, 4, 9, 10, 5, 6) for 150 years, baseline
//   full    20 seeds, canaries first, for 400 years, baseline (the rebalance screens: scratch/rb/run1..4.sh)
//   shocks  seeds 1 to 12, canaries first, cull70 + drought + wolfwipe for 300 years, sampled every 1,500 ticks
//           (the shock timing and length of scratch/rb/confirm.sh and confirm2.sh)
// Inside a stage the batch stops early (--abort-extinct) once the persistence gates can no longer pass: more bison
// losses than the bison-persist gate allows, or a wolf, pronghorn or raven absence longer than 10% of the run (that
// seed then fails "present >= 90%" whatever happens next) in more seeds than the presence gate allows.
//
// --control <dir>  a screen to compare means against: a label folder (artifacts/screens/<label>, the matching stage
//                  subfolder is used) or a batch output folder.
// One screen at a time: artifacts/screen.lock. A second invocation exits with a message, or waits with --wait.
// Children run at below-normal priority; default threads = cores minus 4, at most 12.
// Output: artifacts/screens/<label>/<stage>/ (batch output, batch.log, judge.json, stage.json) and
// artifacts/screens/<label>/RESULT.md (one table for every stage run so far).
// Exit code: 0 when every stage run passed, 1 when one failed, 2 for usage or lock errors.

import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YEAR = 2400;
const CANARY = [3, 2, 1, 4, 9, 10];
const MAX_THREADS = 12;
const LOCK = path.join(ROOT, 'artifacts', 'screen.lock');
const ABORT_EXIT = 3; // batch.ts --abort-extinct

function canaryFirst(seeds) {
  return [...CANARY.filter((s) => seeds.includes(s)), ...seeds.filter((s) => !CANARY.includes(s))];
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const STAGES = {
  filter: { seeds: [...CANARY, 5, 6], years: 150, sample: 2000, scenario: 'baseline', judge: 'judge' },
  full: { seeds: canaryFirst(range(1, 20)), years: 400, sample: 2000, scenario: 'baseline', judge: 'judge' },
  shocks: { seeds: canaryFirst(range(1, 12)), years: 300, sample: 1500, scenario: 'cull70,drought,wolfwipe', judge: 'shocks' },
};

/** --abort-extinct limits implied by the persistence gates (tools/gates.py: ceil(n x 30/32), ceil(n x 29/32)). */
function abortArgs(stageName, st) {
  const n = st.seeds.length;
  const ticks = st.years * YEAR;
  if (st.judge === 'shocks') {
    // shocks.py judges seeds 1 to 12 at year 250; the drought and wolfwipe allow one lost valley (gates.py SHOCK_MAX_LOST)
    return ['--abort-extinct', 'bison:1', '--abort-until-tick', String(250 * YEAR)];
  }
  const allowPersist = n - Math.ceil((n * 30) / 32);
  const allowPresent = n - Math.ceil((n * 29) / 32);
  const grace = Math.ceil(0.1 * ticks); // absent this long means absent in more than 10% of the samples
  return ['--abort-extinct', [`bison:${allowPersist}`, ...['wolf', 'pronghorn', 'raven'].map((s) => `${s}:${allowPresent}@${grace}`)].join(',')];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) out[a.slice(2)] = true;
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}

function die(msg, code = 2) {
  console.error(`screen: ${msg}`);
  process.exit(code);
}

function python() {
  for (const p of [path.join(ROOT, '.venv', 'Scripts', 'python.exe'), path.join(ROOT, '.venv', 'bin', 'python')]) if (existsSync(p)) return p;
  return 'python';
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function takeLock(label, wait) {
  mkdirSync(path.dirname(LOCK), { recursive: true });
  for (;;) {
    try {
      writeFileSync(LOCK, JSON.stringify({ pid: process.pid, label, started: new Date().toISOString() }), { flag: 'wx' });
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let held = null;
    try {
      held = JSON.parse(readFileSync(LOCK, 'utf8'));
    } catch {
      /* half-written or unreadable lock: treat as stale */
    }
    if (!held || !alive(held.pid)) {
      console.log(`screen: removing a stale lock${held ? ` (pid ${held.pid}, ${held.label}, gone)` : ''}`);
      rmSync(LOCK, { force: true });
      continue;
    }
    const msg = `another screen is running: "${held.label}" (pid ${held.pid}, since ${held.started}); lock ${path.relative(ROOT, LOCK)}`;
    if (!wait) die(`${msg}. Only one screen runs at a time; pass --wait to queue behind it.`);
    console.log(`screen: ${msg}; waiting (--wait)...`);
    while (existsSync(LOCK) && alive(held.pid)) await sleep(30_000);
  }
}

function releaseLock() {
  try {
    const held = JSON.parse(readFileSync(LOCK, 'utf8'));
    if (held.pid === process.pid) unlinkSync(LOCK);
  } catch {
    /* already gone */
  }
}

let child = null;
function run(cmd, args, logFile, lowPriority) {
  return new Promise((resolve) => {
    const log = logFile ? createWriteStream(logFile) : null;
    child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    if (lowPriority) {
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch (e) {
        console.warn(`screen: could not lower the priority of pid ${child.pid}: ${e.message}`);
      }
    }
    let out = '';
    const onData = (d, stream) => {
      const s = d.toString();
      out += s;
      stream.write(s);
      log?.write(s);
    };
    child.stdout.on('data', (d) => onData(d, process.stdout));
    child.stderr.on('data', (d) => onData(d, process.stderr));
    child.on('close', (code) => {
      child = null;
      log?.end();
      resolve({ code: code ?? 1, out });
    });
  });
}

function resolveControl(ctl, stageName) {
  if (!ctl) return null;
  const base = path.resolve(ROOT, ctl);
  for (const d of [path.join(base, stageName), base]) if (existsSync(path.join(d, 'meta.json'))) return d;
  return null;
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const fmt = {
  pct: (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 100)}%`),
  n0: (v) => (v === null || v === undefined ? 'n/a' : Math.round(v).toLocaleString('en-US')),
  n1: (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(1)),
  n2: (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(2)),
  n3: (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(3)),
  wall: (s) => (s === undefined ? 'n/a' : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`),
};

function writeResult(labelDir, label, params) {
  const lines = [`# Screen ${label}`, '', `Params: \`${JSON.stringify(params)}\` (on top of the live defaults)`, '', 'Written by tools/screen.mjs; judged by tools/gates.py.', ''];
  const base = [];
  const shock = [];
  for (const name of Object.keys(STAGES)) {
    const j = readJson(path.join(labelDir, name, 'judge.json'));
    const s = readJson(path.join(labelDir, name, 'stage.json'));
    if (!j || !s) continue;
    if (j.kind === 'judge') {
      const g = Object.fromEntries(j.gates.map((x) => [x.name, x]));
      const gv = (k, f) => `${f(g[k].value)}${g[k].pass ? '' : ' x'}`;
      const m = j.means ?? {};
      base.push(
        `| ${name} | ${j.n} | ${Math.round(j.years)} | ${fmt.wall(s.wallSec)} (${s.threads} threads) | ${g['bison persist'].value}/${j.n}${g['bison persist'].pass ? '' : ' x'} ` +
          `| ${g['presence >= 90%'].value}/${j.n}${g['presence >= 90%'].pass ? '' : ' x'} | ${gv('pronghorn starvation', fmt.pct)} | ${gv('wolf CV', fmt.n2)} | ${gv('wolf-bison corr', fmt.n2)} ` +
          `| ${fmt.n0(m.bison)} | ${fmt.n1(m.wolf)} | ${fmt.n0(m.muledeer)} | ${fmt.n0(m.raven)} | ${fmt.n3(j.grass)} | ${fmt.pct(j.bison_deaths?.wolf)} | ${fmt.pct(j.bison_deaths?.starved)} ` +
          `| ${j.extinct?.length ? j.extinct.map((e) => `${e.seed} ${e.species} y${Math.round(e.year)}`).join('; ') : 'none'} | ${j.verdict}${j.failed?.length ? ` (${j.failed.join(', ')})` : ''}${j.flags?.length ? `; ${j.flags.length} flag(s) vs control` : ''} |`,
      );
    } else {
      const sc = (k) => {
        const x = j.scenarios?.[k];
        if (!x) return 'n/a';
        const lost = x.lost.map((l) => `${l.seed}${l.bison ? 'b' : ''}${l.wolves ? 'w' : ''}`).join(', ');
        return `${x.lost.length} of ${x.judged.length}${lost ? ` (${lost})` : ''}`;
      };
      shock.push(`| ${name} | ${fmt.wall(s.wallSec)} (${s.threads} threads) | ${sc('cull70')} | ${sc('drought')} | ${sc('wolfwipe')} | ${j.verdict}${j.failed?.length ? ` (${j.failed.join(', ')})` : ''} |`);
    }
  }
  if (base.length) {
    lines.push(
      '| Stage | Seeds | Years | Wall | Bison persist | Presence >= 90% | Pronghorn starvation | Wolf CV | Wolf-bison corr | Bison | Wolves | Mule deer | Ravens | Grass | Wolf share of adult bison deaths | Starved share | Extinct at end | Verdict |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...base,
      '',
    );
  }
  if (shock.length) {
    lines.push('Valleys of seeds 1 to 12 that lost bison (b) or wolves (w) by year 250:', '', '| Stage | Wall | cull70 | drought | wolfwipe | Verdict |', '|---|---|---|---|---|---|', ...shock, '');
  }
  lines.push('A value marked x failed its gate. Means, grass and death shares are from 30% of the run on (gates.py MEANS_FROM).', '');
  writeFileSync(path.join(labelDir, 'RESULT.md'), lines.join('\n'));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || !a.name || a.name === true) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    process.exit(a.help ? 0 : 2);
  }
  const label = String(a.name);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) die(`--name must be letters, digits, dot, dash or underscore, got "${label}"`);
  const stages = String(a.stages && a.stages !== true ? a.stages : 'filter,full,shocks').split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of stages) if (!STAGES[s]) die(`unknown stage "${s}" (known: ${Object.keys(STAGES).join(', ')})`);
  let params = {};
  if (a.params && a.params !== true) {
    try {
      params = JSON.parse(a.params);
    } catch {
      try {
        params = JSON.parse(String(a.params).replace(/([{,]\s*)([A-Za-z_][\w.]*)\s*:/g, '$1"$2":'));
      } catch (e) {
        die(`could not parse --params: ${e.message}`);
      }
    }
  }
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const threads = Math.max(1, Math.min(MAX_THREADS, a.threads && a.threads !== true ? Math.floor(Number(a.threads)) : cores - 4));
  if (!Number.isFinite(threads)) die('--threads expects a number');
  const keepGoing = a['keep-going'] === true;
  const maxMin = a['stage-max-minutes'] && a['stage-max-minutes'] !== true ? Number(a['stage-max-minutes']) : 0;
  const control = a.control && a.control !== true ? String(a.control) : null;
  const labelDir = path.join(ROOT, 'artifacts', 'screens', label);
  const py = python();

  // below normal for this process too, so anything it starts inherits it
  try {
    os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    /* not fatal */
  }

  const plan = stages.map((name) => {
    const st = STAGES[name];
    const out = path.join(labelDir, name);
    const args = [
      '--import', 'tsx', 'src/headless/batch.ts',
      '--seed-list', st.seeds.join(','), '--ticks', String(st.years * YEAR), '--sample', String(st.sample),
      '--threads', String(Math.min(threads, st.seeds.length * st.scenario.split(',').length)), '--scenario', st.scenario,
      '--out', path.relative(ROOT, out), '--progress-sec', '60',
      ...(Object.keys(params).length ? ['--params', JSON.stringify(params)] : []),
      ...(maxMin > 0 ? ['--max-minutes', String(maxMin)] : []),
      ...abortArgs(name, st),
    ];
    return { name, st, out, args };
  });
  if (a['dry-run']) {
    for (const p of plan) console.log(`${p.name}: node ${p.args.map((x) => (/[\s{}"]/.test(x) ? `'${x}'` : x)).join(' ')}`);
    return;
  }

  await takeLock(label, a.wait === true);
  const cleanup = () => {
    if (child) child.kill();
    releaseLock();
  };
  process.on('exit', releaseLock);
  process.on('SIGINT', () => {
    console.log('\nscreen: interrupted, stopping the batch');
    cleanup();
    process.exit(130);
  });

  mkdirSync(labelDir, { recursive: true });
  console.log(`screen ${label}: stages ${stages.join(' -> ')}, ${threads} threads at below-normal priority, params ${JSON.stringify(params)}`);
  let failed = false;
  for (const p of plan) {
    console.log(`\n=== ${label} / ${p.name}: ${p.st.seeds.length} seeds (${p.st.seeds.join(', ')}) x ${p.st.years} years, ${p.st.scenario} ===`);
    rmSync(p.out, { recursive: true, force: true });
    mkdirSync(p.out, { recursive: true });
    const t0 = Date.now();
    const b = await run(process.execPath, p.args, path.join(p.out, 'batch.log'), true);
    const wallSec = (Date.now() - t0) / 1000;
    const usedThreads = Number(p.args[p.args.indexOf('--threads') + 1]);
    writeFileSync(path.join(p.out, 'stage.json'), JSON.stringify({ stage: p.name, label, params, wallSec, threads: usedThreads, batchExit: b.code, earlyStop: b.code === ABORT_EXIT }, null, 1));
    if (b.code === ABORT_EXIT) console.log(`\nscreen: ${p.name} stopped early (a persistence gate can no longer pass); judging what ran`);
    else if (b.code !== 0) console.log(`\nscreen: the batch exited with code ${b.code}; judging what ran`);

    if (!existsSync(path.join(p.out, 'meta.json'))) {
      console.log(`FAIL  ${p.name}: the batch wrote no results (exit ${b.code})`);
      failed = true;
      if (!keepGoing) break;
      continue;
    }
    const ctl = resolveControl(control, p.name);
    if (control && !ctl) console.log(`screen: no control results for stage ${p.name} under ${control}; judging without one`);
    const gateArgs = [path.join('tools', 'gates.py'), p.st.judge, path.relative(ROOT, p.out), ...(ctl ? ['--control', path.relative(ROOT, ctl)] : []), '--json', path.relative(ROOT, path.join(p.out, 'judge.json'))];
    console.log('');
    const j = await run(py, gateArgs, path.join(p.out, 'judge.txt'), false);
    const rec = await run(py, [path.join('tools', 'gates.py'), 'record', path.relative(ROOT, p.out), '--name', label, '--stage', p.name, ...(Object.keys(params).length ? ['--params', JSON.stringify(params)] : []), ...(ctl && p.st.judge === 'judge' ? ['--control', path.relative(ROOT, ctl)] : [])], null, false);
    if (rec.code !== 0) console.log(`screen: gates.py record failed (exit ${rec.code})`);
    writeResult(labelDir, label, params);
    console.log(`stage ${p.name}: ${j.code === 0 ? 'PASS' : 'FAIL'} in ${fmt.wall(wallSec)} on ${usedThreads} threads`);
    if (j.code !== 0) {
      failed = true;
      if (!keepGoing) {
        const rest = plan.slice(plan.indexOf(p) + 1).map((x) => x.name);
        if (rest.length) console.log(`screen: stopping at the first failed stage (skipped: ${rest.join(', ')}; --keep-going runs them anyway)`);
        break;
      }
    }
  }
  console.log(`\nscreen ${label}: ${failed ? 'FAIL' : 'PASS'}; table in ${path.relative(ROOT, path.join(labelDir, 'RESULT.md'))}`);
  releaseLock();
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  releaseLock();
  process.exit(1);
});
