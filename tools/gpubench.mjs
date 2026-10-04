// GPU-time benchmark of the real game, using EXT_disjoint_timer_query_webgl2 (GPU time, immune to CPU load).
//
// Measure one build (default size is the 1440p gate):
//   node tools/gpubench.mjs [--size 2560x1440] [--out file.json] [--dir <projectDir>] [--extra "tm=agx&q=medium"]
// A/B two builds (runs A, B, B, A: four page loads, sequential, separate servers):
//   node tools/gpubench.mjs --ab <dirA> <dirB> [--size ...] [--out file.json]
// A/B two URL query strings on the same dir (tone-map or feature toggles), same A, B, B, A order:
//   node tools/gpubench.mjs --ab-query "tm=aces" "tm=agx" [--dir <projectDir>] [--size ...] [--out file.json]
//
// Per view: 6 warmup frames, then the median and p90 of 40 timed frames. The page is loaded with ?autoscale=0&autocam=0 so the
// render scale and camera are pinned. The run fails loudly if the GL renderer is a software rasterizer.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIGIN_CWD = process.cwd();
const argv = process.argv.slice(2);
const has = (k) => argv.includes('--' + k);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
const outFile = arg('out', null);
const extra = arg('extra', '');
const projectDir = resolve(ORIGIN_CWD, arg('dir', '.'));

// The views. Each setup runs once, then 6 warmup + 40 timed frames. Names are the JSON keys, keep them stable across runs.
// Setups run inside the page (serialised), so they must be self-contained: `e` is the engine.
const VIEW_SETUPS = {
  wide_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  low_golden: `() => { e.cam.preset('low', true); }`,
  herd: `() => { window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true); }`,
  top: `() => { e.cam.preset('top', true); }`,
  winter: `() => { Object.assign(e.env, { dayFrac: 0.34, season: 3.2, weather: 4 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  night: `() => { Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__focusHerd(); }`,
  // TODO(storm): add a 'storm' view once the storm effects land (V2-PLAN R0), e.g.
  //   storm: `() => { Object.assign(e.env, { dayFrac: 0.4, season: 1.2, weather: 3 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
};
const VIEW_NAMES = Object.keys(VIEW_SETUPS);
const WARMUP = 6;
const FRAMES = 40;

const SOFTWARE_RE = /swiftshader|llvmpipe|software|basic render|softpipe|microsoft basic/i;

// Load vite from the target project's own node_modules when it has one (so a worktree uses its own vite), else ours.
async function loadVite(dir) {
  try {
    const req = createRequire(resolve(dir, 'package.json'));
    return await import(pathToFileURL(req.resolve('vite')).href);
  } catch {
    return await import('vite');
  }
}

function withQuery(q) {
  const parts = ['autoscale=0', 'autocam=0'];
  if (q) parts.push(q.replace(/^[?&]/, ''));
  return parts.join('&');
}

// One page load of one build. Returns { renderer, views: { name: { median, p90, n, disjoint } } }.
async function measureOne({ dir, query, label }) {
  const root = resolve(dir);
  if (!existsSync(resolve(root, 'index.html'))) throw new Error(`no index.html in ${root}`);
  const vite = await loadVite(root);
  const prevCwd = process.cwd();
  process.chdir(root); // vite.config.ts reads process.cwd() for node_modules and the fs allow list
  let server, browser;
  try {
    server = await vite.createServer({
      root,
      configFile: resolve(root, 'vite.config.ts'),
      cacheDir: resolve(root, 'node_modules/.vite-bench'),
      server: {
        port: 5300 + Math.floor(Math.random() * 600),
        strictPort: false,
        hmr: false,
        watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**'] },
      },
      optimizeDeps: { entries: ['index.html'] },
      logLevel: 'error',
    });
    await server.listen();
    const base = server.resolvedUrls.local[0].replace(/\/$/, '');
    browser = await chromium.launch({
      headless: true,
      timeout: 120000,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
    });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.setDefaultTimeout(900000);
    page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 200)));
    const url = `${base}/index.html?${withQuery(query)}`;
    console.log(`[${label}] loading ${url} (${root}) at ${W}x${H}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 900000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
    await page.waitForTimeout(1500);
    const res = await page.evaluate(async ({ setups, WARMUP, FRAMES }) => {
      window.__speed(0);
      const e = window.__engine;
      e.setEnv = () => {}; // hold the environment the view sets, whatever the sim says
      const gl = e.renderer.getContext();
      let renderer = 'unknown';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return { renderer, error: 'no EXT_disjoint_timer_query_webgl2' };
      const views = {};
      for (const [name, src] of Object.entries(setups)) views[name] = (0, eval)(`(e) => (${src})`)(e);
      const out = {};
      for (const [name, setup] of Object.entries(views)) {
        setup();
        for (let i = 0; i < WARMUP; i++) e.renderOnce(0.016);
        const qs = [];
        for (let i = 0; i < FRAMES; i++) {
          const q = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          e.renderOnce(0.016);
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          qs.push(q);
          if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30)); // keep the query queue short
        }
        let tries = 0;
        while (tries++ < 400) {
          if (gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) break;
          await new Promise((r) => setTimeout(r, 25));
        }
        const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
        const t = qs
          .map((q) => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : NaN))
          .filter((v) => Number.isFinite(v))
          .sort((a, b) => a - b);
        const pick = (f) => (t.length ? +t[Math.min(t.length - 1, Math.floor(t.length * f))].toFixed(3) : null);
        out[name] = { median: pick(0.5), p90: pick(0.9), n: t.length, disjoint };
      }
      return { renderer, views: out };
    }, { setups: VIEW_SETUPS, WARMUP, FRAMES });
    if (res.error) throw new Error(res.error);
    console.log(`[${label}] GL renderer: ${res.renderer}`);
    if (SOFTWARE_RE.test(res.renderer) || res.renderer === 'unknown') {
      throw new Error(`software or unknown GL renderer "${res.renderer}": GPU timings would be meaningless`);
    }
    return res;
  } finally {
    try { if (browser) await browser.close(); } catch { /* already gone */ }
    try { if (server) await server.close(); } catch { /* already gone */ }
    process.chdir(prevCwd);
  }
}

// commit and any uncommitted source changes, recorded in the JSON so a baseline can be traced to the tree it measured
function gitInfo(dir) {
  const run = (args) => { try { return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim(); } catch { return null; } };
  const dirty = run(['status', '--porcelain', '--', 'src', 'index.html', 'public']);
  return { head: run(['rev-parse', '--short', 'HEAD']), dirtyFiles: dirty ? dirty.split(/\r?\n/).map((l) => l.trim()) : [] };
}

const fmt = (v, w = 8) => (v == null ? 'n/a' : v.toFixed(2)).padStart(w);
const sgn = (v, w = 8) => (v == null ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(2)).padStart(w);

function printSingle(r) {
  console.log(`renderer: ${r.renderer}  size: ${W}x${H}`);
  console.log('view'.padEnd(14) + 'median ms'.padStart(11) + 'p90 ms'.padStart(9) + '  n  disjoint');
  for (const n of VIEW_NAMES) {
    const v = r.views[n];
    console.log(n.padEnd(14) + fmt(v.median, 11) + fmt(v.p90, 9) + String(v.n).padStart(4) + (v.disjoint ? '  YES' : ''));
  }
}

async function runAB(specA, specB) {
  // A, B, B, A cancels linear drift (thermals, clocks) in the paired deltas
  const order = [['A1', specA], ['B1', specB], ['B2', specB], ['A2', specA]];
  const runs = {};
  for (const [tag, spec] of order) {
    const t0 = Date.now();
    runs[tag] = await measureOne({ ...spec, label: tag });
    console.log(`[${tag}] done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const deltas = {};
  console.log(`\nA = ${specA.desc}\nB = ${specB.desc}\nsize ${W}x${H}, renderer ${runs.A1.renderer}`);
  console.log('\nmedian ms, paired delta (B minus A); negative means B is faster');
  console.log('view'.padEnd(14) + 'A1'.padStart(8) + 'B1'.padStart(8) + 'B2'.padStart(8) + 'A2'.padStart(8) + 'd(A1,B1)'.padStart(10) + 'd(B2,A2)'.padStart(10) + 'mean d'.padStart(9) + 'mean %'.padStart(8) + '  agree');
  for (const n of VIEW_NAMES) {
    const m = (t) => runs[t].views[n].median;
    const p = (t) => runs[t].views[n].p90;
    const d1 = m('B1') - m('A1');
    const d2 = m('B2') - m('A2');
    const mean = (d1 + d2) / 2;
    const meanA = (m('A1') + m('A2')) / 2;
    const agree = Math.abs(d1 - d2) <= Math.max(0.5, 0.1 * meanA);
    const dp1 = p('B1') - p('A1');
    const dp2 = p('B2') - p('A2');
    deltas[n] = {
      medianDeltaMs: +mean.toFixed(3), medianDeltas: [+d1.toFixed(3), +d2.toFixed(3)], medianDeltaPct: +((mean / meanA) * 100).toFixed(2),
      p90DeltaMs: +((dp1 + dp2) / 2).toFixed(3), p90Deltas: [+dp1.toFixed(3), +dp2.toFixed(3)],
    };
    console.log(n.padEnd(14) + fmt(m('A1')) + fmt(m('B1')) + fmt(m('B2')) + fmt(m('A2')) + sgn(d1, 10) + sgn(d2, 10) + sgn(mean, 9) + sgn((mean / meanA) * 100, 8) + (agree ? '  ok' : '  NOISY'));
    deltas[n].agree = agree;
  }
  const noisy = VIEW_NAMES.filter((n) => !deltas[n].agree);
  if (noisy.length) console.log(`\nWARNING: the two paired deltas disagree (gap over max(0.5 ms, 10 percent of A)) for: ${noisy.join(', ')}. Something else is using the GPU or the GPU clocks moved; rerun with the machine idle before trusting these deltas.`);
  console.log('\np90 ms, paired delta (B minus A)');
  console.log('view'.padEnd(14) + 'd(A1,B1)'.padStart(10) + 'd(B2,A2)'.padStart(10) + 'mean d'.padStart(9));
  for (const n of VIEW_NAMES) console.log(n.padEnd(14) + sgn(deltas[n].p90Deltas[0], 10) + sgn(deltas[n].p90Deltas[1], 10) + sgn(deltas[n].p90DeltaMs, 9));
  return { mode: 'ab', date: new Date().toISOString(), size: `${W}x${H}`, renderer: runs.A1.renderer, A: specA.desc, B: specB.desc, order: order.map((o) => o[0]), deltas, raw: runs };
}

let exitCode = 0;
// hard cap so a hung run can never burn the night: 90 minutes for a whole invocation
const killer = setTimeout(() => { console.error('gpubench: hard timeout'); process.exit(2); }, 90 * 60 * 1000);
try {
  let result;
  if (has('ab')) {
    const i = argv.indexOf('--ab');
    const [a, b] = [argv[i + 1], argv[i + 2]];
    if (!a || !b || a.startsWith('--') || b.startsWith('--')) throw new Error('usage: --ab <dirA> <dirB>');
    const mk = (d) => ({ dir: resolve(ORIGIN_CWD, d), query: extra, desc: resolve(ORIGIN_CWD, d) + (extra ? ` ?${extra}` : '') });
    result = await runAB(mk(a), mk(b));
  } else if (has('ab-query')) {
    const i = argv.indexOf('--ab-query');
    const [qa, qb] = [argv[i + 1], argv[i + 2]];
    if (qa === undefined || qb === undefined || qa.startsWith('--') || qb.startsWith('--')) throw new Error('usage: --ab-query "<paramsA>" "<paramsB>"');
    const mk = (q) => ({ dir: projectDir, query: q, desc: `${projectDir} ?${q}` });
    result = await runAB(mk(qa), mk(qb));
  } else {
    const r = await measureOne({ dir: projectDir, query: extra, label: 'run' });
    printSingle(r);
    result = { mode: 'single', date: new Date().toISOString(), size: `${W}x${H}`, renderer: r.renderer, dir: projectDir, extra, git: gitInfo(projectDir), warmupFrames: WARMUP, timedFrames: FRAMES, views: r.views };
  }
  if (outFile) {
    const p = resolve(ORIGIN_CWD, outFile);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(result, null, 2) + '\n');
    console.log('saved', p);
  }
} catch (e) {
  console.error('gpubench failed:', e.message);
  exitCode = 1;
} finally {
  clearTimeout(killer);
}
process.exit(exitCode);
