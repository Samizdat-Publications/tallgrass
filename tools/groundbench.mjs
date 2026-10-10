// In-session GPU A/B of the scanned ground detail: one page load, and for every view the detail is switched off and on in alternation
// (6 rounds of 20 timed frames each) with EXT_disjoint_timer_query_webgl2, so thermals, clocks and other load hit both sides alike.
// Usage: node tools/groundbench.mjs [--size 2560x1440] [--out file.json] [--views low_golden,close_bison,...]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
const only = arg('views', '').split(',').filter(Boolean);
const out = arg('out', null);
const SETUPS = {
  wide_golden: `Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); e.cam.preset('wide', true);`,
  low_golden: `e.cam.preset('low', true);`,
  herd: `window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true);`,
  top: `e.cam.preset('top', true);`,
  winter: `Object.assign(e.env, { dayFrac: 0.34, season: 3.2, weather: 4 }); e.applyEnvNow(); e.cam.preset('wide', true);`,
  night: `Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__focusHerd();`,
  blizzard: `Object.assign(e.env, { dayFrac: 0.4, season: 3.4, weather: 4, windStrength: 0.95 }); e.applyEnvNow(); e.snowfallSm = 1; if (e.post) e.post.blizzard = 0.95; e.cam.preset('wide', true);`,
  storm: `Object.assign(e.env, { dayFrac: 0.4, season: 1.3, weather: 3, rain: 1, windStrength: 0.6, windDir: 0.35 }); e.applyEnvNow(); e.cam.setView({ distance: 430, pitchDeg: 8 }, true);`,
  // the follow-camera close views the ground work is about
  close_bison: `Object.assign(e.env, { dayFrac: 0.7, season: 1.8, weather: 0 }); e.applyEnvNow(); window.__lkFollow(0, 1, 11, 12);`,
  close_wolves: `window.__lkFollow(1, undefined, 13, 14);`,
  close_pronghorn: `window.__lkFollow(3, undefined, 12, 12);`,
  mid_herd: `window.__followId(null); window.__focusHerd(); e.cam.setView({ distance: 60, pitchDeg: 16 }, true);`,
};
const names = only.length ? only : Object.keys(SETUPS);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 200)));
  await page.goto(`${base}/index.html?autoscale=0&autocam=0&seed=tallgrass`, { waitUntil: 'domcontentloaded', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ setups, names }) => {
    const e = window.__engine;
    window.__speed(0); window.__step(900); window.__followId(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    window.__lkPick = (sp, st) => { const c = (st !== undefined ? window.__find(sp, st) : []).concat(window.__find(sp)); return c.length ? c[0] : null; };
    window.__lkFollow = (sp, st, dist, pitch) => { const id = window.__lkPick(sp, st); window.__followId(id); e.cam.setView({ distance: dist, pitchDeg: pitch }, true); };
    e.setEnv = () => {};
    const T = e.terrain;
    const gl = e.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return { renderer, error: 'no timer query' };
    const timed = async (n) => {
      const qs = [];
      for (let i = 0; i < n; i++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
      }
      let tries = 0;
      while (tries++ < 400 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
      return qs.map((q) => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : NaN)).filter(Number.isFinite);
    };
    const ROUNDS = 12;
    const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * f)] : null; };
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const outv = {};
    for (const n of names) {
      (0, eval)(`(e) => { ${setups[n]} }`)(e);
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
      const off = [], on = [], dl = [];
      for (let r = 0; r < ROUNDS; r++) {
        T.groundDetail.value = 0; for (let i = 0; i < 4; i++) e.renderOnce(0.016); const a = await timed(16);
        T.groundDetail.value = 1; for (let i = 0; i < 4; i++) e.renderOnce(0.016); const b = await timed(16);
        off.push(...a); on.push(...b);
        if (a.length && b.length) dl.push(q(b, 0.25) - q(a, 0.25));   // per-round delta of the lower quartiles (load spikes only ever add time)
      }
      T.groundDetail.value = 1;
      outv[n] = { off: q(off, 0.25), on: q(on, 0.25), offMed: med(off), onMed: med(on), delta: med(dl), n: off.length };
    }
    return { renderer, views: outv };
  }, { setups: SETUPS, names });
  if (res.error) throw new Error(res.error);
  console.log('renderer', res.renderer, W + 'x' + H);
  console.log('view'.padEnd(16) + 'off q25'.padStart(9) + 'on q25'.padStart(9) + 'delta(med of rounds)'.padStart(22) + '  offMed onMed');
  for (const n of names) { const v = res.views[n]; console.log(n.padEnd(16) + v.off.toFixed(2).padStart(9) + v.on.toFixed(2).padStart(9) + ((v.delta >= 0 ? '+' : '') + v.delta.toFixed(2)).padStart(22) + '  ' + v.offMed.toFixed(2) + ' ' + v.onMed.toFixed(2)); }
  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify({ size: W + 'x' + H, ...res }, null, 2)); }
} catch (e) { console.error('groundbench failed:', e.message); code = 1; }
finally { await browser.close(); await server.close(); }
process.exit(code);
