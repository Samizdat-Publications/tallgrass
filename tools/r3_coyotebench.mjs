// GPU A,B,B,A for the coyotes (R3 item 4): the herd view with the coyote batch drawn (A) and hidden (B), in one page load, fast-clock blocks
// only, 2560x1440, the coyote and small-prey params on. The pattern is tools/r2_featurebench.mjs.
//   node tools/r3_coyotebench.mjs [herd,coyotes] [size] [reps] [extraParams]   (run it with nothing else on the machine: the GPU clock moves with the load)
// "herd" is the usual herd view (focusHerd); "coyotes" is a close view of the coyote nearest the middle of the valley, where the mange mottling and the
// pose code are on screen. `extraParams` is appended to ?p= (e.g. coyote.initial:0 for the baseline cost with no coyote in the valley).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const views = (process.argv[2] ?? 'herd,coyotes').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const REPS = Number(process.argv[4] ?? 6);
const extra = process.argv[5] ?? 'coyote.initial:12';
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r3c'), server: { port: 6600 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 1500000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.goto(base + `/index.html?autoscale=0&autocam=0&seed=3&p=smallPrey:1,${extra}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.evaluate(() => { window.__speed(0); window.__step(3600); });
  await page.waitForTimeout(7000);
  await page.evaluate(() => { window.__speed(1); });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__speed(0); });
  await page.waitForTimeout(800);
  const res = await page.evaluate(async ({ views, REPS }) => {
    const e = window.__engine, A0 = window.__animals;
    e.setEnv = () => {};
    Object.assign(e.env, { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7, dayFrac: 0.42, season: 1.2 });
    e.applyEnvNow();
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    const cb = A0.batches[6];
    let hide = false;
    const upd = A0.update.bind(A0);
    A0.update = (...a) => { upd(...a); if (cb && hide) cb.mesh.visible = false; };
    const sn = window.__snap();
    let ncoy = 0; for (let k = 0; k < sn.count; k++) if (sn.agents[k * 12] === 6) ncoy++;
    // the coyote nearest the middle of the valley
    let best = null;
    for (let k = 0; k < sn.count; k++) { const o = k * 12; if (sn.agents[o] !== 6) continue; const d = Math.hypot(sn.agents[o + 1] - 256, sn.agents[o + 2] - 256); if (!best || d < best.d) best = { d, x: sn.agents[o + 1], z: sn.agents[o + 2] }; }
    const VIEWS = {
      herd: () => { window.__focusHerd(); },
      coyotes: () => { if (best) e.cam.setView({ x: best.x, y: best.z, distance: 40, pitchDeg: 22, yawDeg: 120 }, true); },
    };
    const block = async (on) => {
      hide = !on;
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 150));
      const qs = [];
      for (let i = 0; i < 40; i++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
      }
      let tries = 0;
      while (tries++ < 200 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
      const t = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (t.length < 20) return NaN;
      return +t[Math.floor(t.length / 2)].toFixed(3);
    };
    const out = {};
    for (const v of views) {
      VIEWS[v]();
      hide = false;
      for (let i = 0; i < 30; i++) e.renderOnce(0.016);
      const A = [], B = [];
      for (let r = 0; r < REPS; r++) { A.push(await block(true)); B.push(await block(false)); B.push(await block(false)); A.push(await block(true)); }
      out[v] = { A, B, coyotes: ncoy, drawn: cb ? cb.count : 0 };
      hide = false;
    }
    return { rend, out };
  }, { views, REPS });
  console.log('renderer', res.rend, W + 'x' + H, 'params', extra);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(8), 'coyotes in valley', v.coyotes, 'drawn', v.drawn, 'fastA(on)', fa.length, med(fa).toFixed(3), 'fastB(off)', fb.length, med(fb).toFixed(3), 'DELTA(on-off)', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
