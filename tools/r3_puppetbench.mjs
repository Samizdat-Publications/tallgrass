// GPU A,B,B,A for the small-prey layer (mounds, prairie dog and jackrabbit puppets, turf): many blocks in one page load, fast-clock
// blocks only (the median of the blocks that ran on the fast GPU clock), 2560x1440, the small-prey params on. Also reports the CPU cost of
// the layer's own update (ms per frame) and what it drew.
//   node tools/r3_puppetbench.mjs [herd,town60,town25] [size] [reps]   (run it with nothing else on the machine: the GPU clock moves with the load)
// The pattern is tools/r2_featurebench.mjs. "off" hides the layer and skips its per-frame work (SmallPreyLayer.enabled).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const views = (process.argv[2] ?? 'herd,town60,town25').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const REPS = Number(process.argv[4] ?? 6);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r3'), server: { port: 6300 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 1500000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=3&p=smallPrey:1', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.evaluate(() => { window.__speed(0); window.__step(3600); });
  await page.waitForTimeout(7000);
  await page.evaluate(() => { window.__speed(1); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__speed(0); });
  await page.waitForTimeout(800);
  const res = await page.evaluate(async ({ views, REPS }) => {
    const e = window.__engine, L = window.__smallprey;
    e.setEnv = () => {};
    Object.assign(e.env, { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7, dayFrac: 0.42, season: 1.2 });
    e.applyEnvNow();
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    // CPU cost of the layer's own update, per frame
    let cpuMs = 0, cpuN = 0;
    const upd = L.update.bind(L);
    L.update = (...a) => { const t0 = performance.now(); upd(...a); cpuMs += performance.now() - t0; cpuN++; };
    const town = L.biggestTown();
    const VIEWS = {
      herd: () => { window.__focusHerd(); },
      town60: () => { e.cam.setView({ x: town.x, y: town.z, distance: 60, pitchDeg: 30, yawDeg: 150 }, true); },
      town25: () => { e.cam.setView({ x: town.x, y: town.z, distance: 25, pitchDeg: 20, yawDeg: 150 }, true); },
    };
    const block = async (on) => {
      L.enabled = on;
      for (let i = 0; i < (on ? 150 : 8); i++) e.renderOnce(0.016); // warm-up: 2.4 s of puppet time, so the town has come up out of its burrows
      await new Promise((r) => setTimeout(r, 150));
      cpuMs = 0; cpuN = 0;
      const qs = [];
      for (let i = 0; i < 40; i++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
      }
      let tries = 0;
      while (tries++ < 200 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
      const t = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (t.length < 20) return { gpu: NaN, cpu: NaN };
      return { gpu: +t[Math.floor(t.length / 2)].toFixed(3), cpu: +(cpuMs / Math.max(1, cpuN)).toFixed(3) };
    };
    const out = {};
    for (const v of views) {
      VIEWS[v]();
      if (v !== 'herd') L.calm(); else L.ignoreThreats = false; // the town views want the dogs up (real wolves and ravens would send them down their holes)
      L.enabled = true;
      for (let i = 0; i < 60; i++) e.renderOnce(0.016);
      const info = L.debug();
      const A = [], B = [], cA = [];
      for (let r = 0; r < REPS; r++) {
        const a1 = await block(true), b1 = await block(false), b2 = await block(false), a2 = await block(true);
        A.push(a1.gpu, a2.gpu); B.push(b1.gpu, b2.gpu); cA.push(a1.cpu, a2.cpu);
      }
      out[v] = { A, B, cpuUpdateMs: cA, info };
      L.enabled = true;
    }
    return { rend, out };
  }, { views, REPS });
  console.log('renderer', res.rend, W + 'x' + H);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    // blocks run on a slow or an unusually fast GPU clock are dropped: keep those within 25% of the overall median
    const all = [...v.A, ...v.B].filter(Number.isFinite);
    const m0 = med(all);
    const keep = (a) => a.filter((x) => Number.isFinite(x) && x > m0 * 0.75 && x < m0 * 1.25);
    const fa = keep(v.A), fb = keep(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(8), JSON.stringify(v.info), 'A(on)', fa.length, med(fa).toFixed(3), 'B(off)', fb.length, med(fb).toFixed(3), 'GPU DELTA(on-off)', (med(fa) - med(fb)).toFixed(3), 'ms | layer update CPU', med(v.cpuUpdateMs.filter(Number.isFinite)).toFixed(3), 'ms/frame');
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
