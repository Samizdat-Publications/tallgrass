// R17: A/B of two builds on a SHARED machine. Both builds are loaded as two pages of one browser; their render loops are stopped and the timed
// blocks are interleaved A,B,B,A,A,B,B,A... (each block: warm-up frames, then 24 timed frames, GPU timer queries), so whatever else is using the
// GPU (other captures and benches) hits both builds alike. Reports, per view, the lowest and the median block of each build and the paired deltas.
//   node tools/r17_ab2.mjs --a <dirA> --b <dirB> [--views low_golden,night] [--rounds 6] [--size 2560x1440] [--out file.json] [--extra "q=1"]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
const dirA = resolve(arg('a', '.')), dirB = resolve(arg('b', '.'));
const rounds = Number(arg('rounds', 6));
const outFile = arg('out', null);
const extraA = arg('extraA', arg('extra', '')), extraB = arg('extraB', arg('extra', ''));

const VIEW_SETUPS = {
  wide_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  low_golden: `() => { e.cam.preset('low', true); }`,
  herd: `() => { window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true); }`,
  top: `() => { e.cam.preset('top', true); }`,
  winter: `() => { Object.assign(e.env, { dayFrac: 0.34, season: 3.2, weather: 4 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  night: `() => { Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__focusHerd(); }`,
  // r-far-read: a blizzard (snow, gale) from the wide view: the whiteout fog, the streaks and the flat light
  blizzard: `() => { Object.assign(e.env, { dayFrac: 0.4, season: 3.4, weather: 4, windStrength: 0.95 }); e.applyEnvNow(); e.snowfallSm = 1; if (e.post) e.post.blizzard = 0.95; e.cam.preset('wide', true); }`,
  // R4: a thunderstorm day seen from a low drone angle, with two cells (cloud masses, rain shafts, ground shade, sky gloom) and a
  // strike mid-flash. A build without the storm module (engine.storms undefined) just renders the stormy weather, so an A/B of
  // an old build against this one shows the cost of the cells.
  storm: `() => {
    Object.assign(e.env, { dayFrac: 0.4, season: 1.3, weather: 3, rain: 1, windStrength: 0.6, windDir: 0.35 });
    e.applyEnvNow();
    e.cam.setView({ distance: 430, pitchDeg: 8 }, true);
    if (!e.storms) return;
    e.camera.updateMatrixWorld();
    const fw = e.camera.getWorldDirection(e.camera.position.clone());
    const fl = Math.hypot(fw.x, fw.z) || 1, fx = fw.x / fl, fz = fw.z / fl, rx = -fz, rz = fx;
    const f = e.cam.getFocus(e.camera.position.clone());
    const at = (a, s, r, I) => ({ x: f.x + fx * a + rx * s, y: f.z + fz * a + rz * s, r, I });
    e.storms.debugCells([at(240, -170, 95, 0.95), at(380, 200, 80, 0.8)]);
    e.storms.debugStrike(f.x + fx * 230 + rx * -150, f.z + fz * 230 + rz * -150, false);
    e.storms.onThunder = null;
  }`,
};

const VIEW_NAMES = Object.keys(VIEW_SETUPS);
const views = arg('views', VIEW_NAMES.join(',')).split(',');

async function loadVite(dir) {
  try { return await import(pathToFileURL(createRequire(resolve(dir, 'package.json')).resolve('vite')).href); } catch { return await import('vite'); }
}
async function serve(dir) {
  const vite = await loadVite(dir);
  const prev = process.cwd();
  process.chdir(dir);
  const server = await vite.createServer({
    root: dir, configFile: resolve(dir, 'vite.config.ts'), cacheDir: resolve(dir, 'node_modules/.vite-ab2'),
    server: { port: 6100 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/art/**', '**/journey/**'] } },
    optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
  });
  await server.listen();
  process.chdir(prev);
  return server;
}
const kill = setTimeout(() => { console.error('r17_ab2: hard timeout'); process.exit(2); }, 120 * 60 * 1000);
const sA = await serve(dirA), sB = await serve(dirB);
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let result;
try {
  const open = async (server, extra, label) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.setDefaultTimeout(1200000);
    page.on('pageerror', (e) => console.log(`[${label} exception]`, e.message.slice(0, 200)));
    const base = server.resolvedUrls.local[0].replace(/\/$/, '');
    await page.goto(`${base}/index.html?autoscale=0&autocam=0${extra ? '&' + extra : ''}`, { waitUntil: 'domcontentloaded', timeout: 1200000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 1200000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__speed(0);
      const e = window.__engine;
      e.setEnv = () => {};
      e.stop(); // only the timed blocks render from now on
      const gl = e.renderer.getContext();
      window.__ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      window.__block = async (frames, warm) => {
        for (let i = 0; i < warm; i++) e.renderOnce(0.016);
        await new Promise((r) => setTimeout(r, 60));
        const qs = [];
        for (let i = 0; i < frames; i++) {
          const q = gl.createQuery(); gl.beginQuery(window.__ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(window.__ext.TIME_ELAPSED_EXT); qs.push(q);
          if (i % 8 === 7) await new Promise((r) => setTimeout(r, 20));
        }
        let tries = 0;
        while (tries++ < 400 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
        const t = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((a, b) => a - b);
        return t.length < 12 ? null : t[Math.floor(t.length / 2)];
      };
    });
    return page;
  };
  const pA = await open(sA, extraA, 'A');
  const pB = await open(sB, extraB, 'B');
  const renderer = await pA.evaluate(() => { const gl = window.__engine.renderer.getContext(); return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); });
  console.log('renderer', renderer);
  const med = (a) => { const s = a.filter((v) => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const lo = (a) => Math.min(...a.filter((v) => v != null));
  const out = {};
  for (const v of views) {
    const src = VIEW_SETUPS[v];
    for (const p of [pA, pB]) await p.evaluate((s) => { const e = window.__engine; (0, eval)(`(e) => (${s})`)(e)(); for (let i = 0; i < 30; i++) e.renderOnce(0.016); }, src);
    const A = [], B = [];
    for (let r = 0; r < rounds; r++) {
      const order = r % 2 === 0 ? [pA, pB, pB, pA] : [pB, pA, pA, pB];
      for (const p of order) {
        const m = await p.evaluate(() => window.__block(24, 6));
        (p === pA ? A : B).push(m);
      }
    }
    out[v] = { A: { min: +lo(A).toFixed(3), med: +med(A).toFixed(3), blocks: A.map((x) => x && +x.toFixed(2)) }, B: { min: +lo(B).toFixed(3), med: +med(B).toFixed(3), blocks: B.map((x) => x && +x.toFixed(2)) } };
    const o = out[v];
    console.log(`${v.padEnd(12)} A min ${o.A.min.toFixed(2)} med ${o.A.med.toFixed(2)} | B min ${o.B.min.toFixed(2)} med ${o.B.med.toFixed(2)} | d(min) ${(o.B.min - o.A.min).toFixed(2)} d(med) ${(o.B.med - o.A.med).toFixed(2)}`);
  }
  result = { date: new Date().toISOString(), size: `${W}x${H}`, renderer, A: dirA, B: dirB, rounds, views: out };
} finally {
  clearTimeout(kill);
  await browser.close();
  await sA.close(); await sB.close();
}
if (outFile) { mkdirSync(dirname(resolve(outFile)), { recursive: true }); writeFileSync(resolve(outFile), JSON.stringify(result, null, 2) + '\n'); }
process.exit(0);
