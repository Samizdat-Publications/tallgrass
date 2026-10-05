// R15 Lens GPU cost: in-page A,B,B,A blocks (fast-clock blocks only), same pattern as r2_featurebench.mjs. 2560x1440.
// node tools/r15_featurebench.mjs [features=dof_gentle,dof_photo,dof_wide,lens] [size=2560x1440] [views=wolf,low,wide]
// A = the feature on, B = off (the pass skipped). The lens controller's own per-frame call is stubbed so the bench drives the post stack directly.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const feats = (process.argv[2] ?? 'dof_gentle,dof_photo,dof_wide,lens').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const viewNames = (process.argv[4] ?? 'wolf,low,wide').split(',');
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r15/.vitecache'), server: { port: 7300 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
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
  const res = await page.evaluate(async ({ feats, viewNames }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    window.__lens.update = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    const CLEAR = { weather: 0, rain: 0, windStrength: 0.25, warmth: 0.7, dayFrac: 0.31, season: 1.8 };
    const wolf = window.__find(1)[0];
    const VIEWS = {
      wolf: () => { Object.assign(e.env, CLEAR); e.applyEnvNow(); window.__followId(wolf); e.cam.setView({ distance: 14, pitchDeg: 9, yawDeg: 215 }, true); },
      low: () => { Object.assign(e.env, CLEAR); e.applyEnvNow(); window.__followId(null); e.cam.preset('low', true); },
      wide: () => { Object.assign(e.env, CLEAR); e.applyEnvNow(); window.__followId(null); e.cam.preset('wide', true); },
    };
    const focusNow = () => e.camera.position.distanceTo(e.cam.getFocus());
    const F = {
      dof_gentle: { set: (on) => e.post.setDof(on ? 0.0039 : 0, focusNow(), 24, true) },
      dof_photo: { set: (on) => e.post.setDof(on ? 0.022 : 0, focusNow(), 24) },
      dof_wide: { set: (on) => e.post.setDof(on ? 0.038 : 0, focusNow(), 24) },
      dof_wide16: { set: (on) => e.post.setDof(on ? 0.038 : 0, focusNow(), 16) },
      lens: { set: (on) => e.post.setLens(on ? 0.022 : 0, on ? 0.45 : 0) },
    };
    const block = async (setOn, on) => {
      setOn(on);
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 200));
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
    for (const fname of feats) {
      const f = F[fname];
      for (const vname of viewNames) {
        VIEWS[vname]();
        for (let i = 0; i < 12; i++) e.renderOnce(0.016);
        f.set(true); e.renderOnce(0.016);
        const dofOn = e.post.dof.enabled;
        f.set(false); e.renderOnce(0.016);
        const dofOff = e.post.dof.enabled;
        const A = [], B = [];
        for (let r = 0; r < 6; r++) { A.push(await block(f.set, true)); B.push(await block(f.set, false)); B.push(await block(f.set, false)); A.push(await block(f.set, true)); }
        out[fname + ':' + vname] = { A, B, info: { dofEnabledWhenOn: dofOn, dofEnabledWhenOff: dofOff, focus: +focusNow().toFixed(1) } };
        f.set(false);
      }
    }
    return { rend, out };
  }, { feats, viewNames });
  console.log('renderer', res.rend, W + 'x' + H);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(22), JSON.stringify(v.info), 'fastA(on)', fa.length, med(fa).toFixed(3), 'fastB(off)', fb.length, med(fb).toFixed(3), 'DELTA(on-off)', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
