// R4 storm cost: GPU A,B,B,A with the storm cells on and off, many blocks in one page load, fast-clock blocks only. 2560x1440.
//   node tools/r4_featurebench.mjs [views=all] [size=2560x1440]
// views: a comma list of oblique, wide, low, top, strike, clear (clear = no cells in either arm: the cost of the module and the
// shader branches when there is no storm, which should be ~0). Pattern from r2_featurebench.mjs.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const want = (process.argv[2] ?? 'all').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
// optional 4th arg: a part to leave out of the ON arm (clouds, shafts, gust), to see what the cost is made of
const hide = process.argv[4] ?? '';
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r4/.vitecache'), server: { port: 6300 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 1500000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ want, hide }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    e.setStorms = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    const STORM = { dayFrac: 0.4, season: 1.3, weather: 3, rain: 1, windStrength: 0.6, windDir: 0.35, warmth: 0.6 };
    const CLEAR = { dayFrac: 0.4, season: 1.3, weather: 0, rain: 0, windStrength: 0.3, windDir: 0.35, warmth: 0.6 };
    let cells = [];
    const frame = () => {
      e.camera.updateMatrixWorld();
      const fw = e.camera.getWorldDirection(e.camera.position.clone());
      const fl = Math.hypot(fw.x, fw.z) || 1, fx = fw.x / fl, fz = fw.z / fl, rx = -fz, rz = fx;
      const f = e.cam.getFocus(e.camera.position.clone());
      return (a, s, r, I) => ({ x: f.x + fx * a + rx * s, y: f.z + fz * a + rz * s, r, I });
    };
    const mk = (env, camCode, list, strike) => () => {
      Object.assign(e.env, env);
      e.applyEnvNow();
      (0, eval)(`(e) => { ${camCode} }`)(e);
      const at = frame();
      cells = list.map((c) => at(...c));
      window.__strike = strike ? at(strike[0], strike[1], 0, 0) : null;
    };
    const V = {
      oblique: mk(STORM, "e.cam.setView({ distance: 430, pitchDeg: 8 }, true)", [[240, -170, 95, 0.95], [380, 200, 80, 0.8]]),
      wide: mk(STORM, "e.cam.preset('wide', true)", [[190, -150, 95, 0.95], [330, 190, 80, 0.8]]),
      low: mk(STORM, "e.cam.preset('low', true)", [[300, -30, 100, 0.95]]),
      top: mk(STORM, "e.cam.preset('top', true)", [[0, -60, 100, 0.9], [60, 190, 80, 0.7]]),
      strike: mk(STORM, "e.cam.setView({ distance: 430, pitchDeg: 8 }, true)", [[240, -170, 95, 0.95]], [230, -150]),
      clear: mk(CLEAR, "e.cam.preset('wide', true)", []),
    };
    const names = want[0] === 'all' ? Object.keys(V) : want;
    const st = e.storms;
    const oup = st.update.bind(st);
    st.update = (...a) => {
      oup(...a);
      if (hide === 'gust') for (const v of window.__grass.uniforms.uStorm.value) v.w = 0;
    };
    const block = async (on) => {
      e.storms.debugCells(on ? cells : []);
      st.cloudMat.visible = !(on && hide === 'clouds');
      for (const sh of st.shafts) sh.mat.visible = !(on && hide === 'shafts');
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 200));
      const qs = [];
      for (let i = 0; i < 40; i++) {
        // the strike view re-strikes every 25 frames so a bolt and a flash are in a good share of the timed frames
        if (on && window.__strike && i % 25 === 0) e.storms.debugStrike(window.__strike.x, window.__strike.y, false);
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
    for (const vname of names) {
      V[vname]();
      const info = { puffs: 0, cells: 0 };
      e.storms.debugCells(cells); e.renderOnce(0.016);
      info.puffs = e.storms.cloudGeo.instanceCount; info.cells = e.storms.cellCount;
      const A = [], B = [];
      for (let r = 0; r < 6; r++) { A.push(await block(true)); B.push(await block(false)); B.push(await block(false)); A.push(await block(true)); }
      out[vname] = { A, B, info };
    }
    return { rend, out };
  }, { want, hide });
  console.log('renderer', res.rend, W + 'x' + H);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(10), JSON.stringify(v.info), 'fastA(on)', fa.length, med(fa).toFixed(3), 'fastB(off)', fb.length, med(fb).toFixed(3), 'DELTA(on-off)', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
