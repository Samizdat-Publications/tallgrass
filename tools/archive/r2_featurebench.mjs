// GPU A,B,B,A per feature, many blocks in one page load, fast-clock blocks only. 2560x1440.
// node scratch/r2/bench.mjs [godrays,snow,dawn] [size]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const feats = (process.argv[2] ?? 'godrays,snow,dawn').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r2/.vitecache'), server: { port: 6300 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
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
    const origSetEnv = e.setEnv.bind(e);
    e.setEnv = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    const off = { dawn: false, snow: false };
    const oa = e.post.apply.bind(e.post);
    e.post.apply = (L) => { oa(L); if (off.dawn) e.post.fog.material.uniforms.uDawn.value = 0; };
    const so = e.post.snow.update.bind(e.post.snow);
    e.post.snow.update = (dt, cam, p) => { so(dt, cam, off.snow ? { ...p, fall: 0 } : p); };
    let rays = 0;
    { const g = e.post.godrays; const cq = g.compQuad.render.bind(g.compQuad); g.compQuad.render = (r) => { rays++; return cq(r); }; }
    const CLEAR = { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7 };
    const wide = (env) => () => { Object.assign(e.env, { ...CLEAR, ...env }); e.applyEnvNow(); e.cam.preset('wide', true); };
    const low = (env) => () => { Object.assign(e.env, { ...CLEAR, ...env }); e.applyEnvNow(); e.cam.preset('low', true); };
    const concept = (o) => () => { e.setEnv = origSetEnv; window.__concept(o); e.setEnv = () => {}; Object.assign(e.env, CLEAR, { windStrength: 0.45 }); e.applyEnvNow(); };
    const F = {
      godrays: {
        set: (on) => { e.post.godrays.enabled = on; },
        views: {
          sun_front: concept({ dist: 60, pitch: 8, sunOff: 6 }),
          concept: concept({}), wide_golden: wide({ dayFrac: 0.3, season: 1.8, windStrength: 0.45 }), low_golden: low({ dayFrac: 0.3, season: 1.8, windStrength: 0.45 }) },
      },
      snow: {
        set: (on) => { off.snow = !on; },
        pre: () => { e.post.godrays.enabled = false; },
        views: {
          snow_low: low({ dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.4 }),
          blizzard_low: low({ dayFrac: 0.38, season: 3.2, weather: 4, windStrength: 0.88 }),
          snow_wide: wide({ dayFrac: 0.34, season: 3.2, weather: 4, windStrength: 0.4 }),
          blizzard_wide: wide({ dayFrac: 0.34, season: 3.2, weather: 4, windStrength: 0.88 }),
        },
      },
      dawn: {
        set: (on) => { off.dawn = !on; },
        pre: () => { e.post.godrays.enabled = true; },
        views: { wide_dawn: wide({ dayFrac: 0.24, season: 1.8 }), low_dawn: low({ dayFrac: 0.24, season: 1.8 }), wide_dawn_early: wide({ dayFrac: 0.22, season: 1.8 }) },
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
        e.post.godrays.enabled = true; off.dawn = false; off.snow = false;
        setup();
        if (f.pre) f.pre();
        const r0 = rays; e.renderOnce(0.016); const drawn = rays - r0;
        const info = { drawn, godray: +e.post.godrays.strength.toFixed(2), snow: e.post.snow.count, uDawn: +e.post.fog.material.uniforms.uDawn.value.toFixed(4) };
        const A = [], B = [];
        for (let r = 0; r < 6; r++) { A.push(await block(f.set, true)); B.push(await block(f.set, false)); B.push(await block(f.set, false)); A.push(await block(f.set, true)); }
        out[fname + ':' + vname] = { A, B, info };
        f.set(true);
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
