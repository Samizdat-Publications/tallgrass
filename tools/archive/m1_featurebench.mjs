// M1 GPU bench: A,B,B,A per feature, many blocks in one page load, fast-clock blocks only (pattern of tools/r2_featurebench.mjs). 2560x1440.
//   node tools/m1_featurebench.mjs [rain,soften,bark] [size]
// rain:   the rain streak volume (rain.ts) on vs its pass skipped, in rain and storm views
// soften: the fast-forward softening (engine.simSpeed 100, fully eased in) vs 1x, in a wide and a low view
// bark:   bark kept out of the GTAO G-buffer pass (now) vs in it (before), in a view among trees
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const feats = (process.argv[2] ?? 'rain,soften,bark').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/m1/.vitecache'), server: { port: 6300 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
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
  const res = await page.evaluate(async ({ feats }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    e.setStorms = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    const rp = e.post.rainPass;
    const rpRender = rp.render.bind(rp);
    let rainOn = true;
    rp.render = (...a) => { if (rainOn) rpRender(...a); };
    const barkMeshes = e.trees.meshes.filter((m) => m.name.startsWith('cottonwood-bark'));
    const setBarkAO = (excluded) => {
      const ex = e.post.aoExclude;
      for (const m of barkMeshes) { const i = ex.indexOf(m); if (excluded && i < 0) ex.push(m); if (!excluded && i >= 0) ex.splice(i, 1); }
    };
    const CLEAR = { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7 };
    const view = (env, cam) => () => { Object.assign(e.env, { ...CLEAR, ...env }); e.applyEnvNow(); (0, eval)(`(e) => { ${cam} }`)(e); e.camera.fov = 45; e.camera.updateProjectionMatrix(); };
    const F = {
      rain: {
        set: (on) => { rainOn = on; },
        views: {
          rain_low: view({ dayFrac: 0.42, season: 1.3, weather: 1, rain: 0.9, windStrength: 0.45 }, "e.cam.preset('low', true)"),
          rain_mid: view({ dayFrac: 0.42, season: 1.3, weather: 1, rain: 0.9, windStrength: 0.45 }, "e.cam.setView({ distance: 110, pitchDeg: 20 }, true)"),
          storm_low: view({ dayFrac: 0.42, season: 1.3, weather: 3, rain: 1, windStrength: 0.7 }, "e.cam.preset('low', true)"),
        },
      },
      soften: {
        set: (on) => { e.simSpeed = on ? 100 : 1; e.fastSm = on ? 1 : 0; },
        views: {
          wide_day: view({ dayFrac: 0.4, season: 1.3 }, "e.cam.preset('wide', true)"),
          low_golden: view({ dayFrac: 0.3, season: 1.8 }, "e.cam.preset('low', true)"),
        },
      },
      bark: {
        set: (on) => setBarkAO(on),
        views: {
          among_trees: view({ dayFrac: 0.31, season: 1.3 }, "e.cam.setView({ x: 40 + 432 * 2 / 6, y: 40 + 432 / 6, yawDeg: 101, pitchDeg: 2, distance: 90 }, true)"),
          wide: view({ dayFrac: 0.4, season: 1.3 }, "e.cam.preset('wide', true)"),
        },
      },
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
      for (const [vname, setup] of Object.entries(f.views)) {
        rainOn = true; e.simSpeed = 1; e.fastSm = 0; setBarkAO(true);
        setup();
        for (let i = 0; i < 4; i++) e.renderOnce(0.016);
        const info = { rainDrops: e.post.rain.count, fastSm: +(e.fastSm ?? 0).toFixed(2) };
        const A = [], B = [];
        for (let r = 0; r < 6; r++) { A.push(await block(f.set, true)); B.push(await block(f.set, false)); B.push(await block(f.set, false)); A.push(await block(f.set, true)); }
        out[fname + ':' + vname] = { A, B, info };
        f.set(fname === 'bark');
      }
    }
    return { rend, out };
  }, { feats });
  console.log('renderer', res.rend, W + 'x' + H);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(24), JSON.stringify(v.info), 'fastA(on)', fa.length, med(fa).toFixed(3), 'fastB(off)', fb.length, med(fb).toFixed(3), 'DELTA(on-off)', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
