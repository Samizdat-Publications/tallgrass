// r-grassnear: follow-cam ground check. The sim is paused after a fixed number of stepped ticks (same animals, same places in every run),
// then the camera follows a walking bison at 10, 15 and 20 m and a hunting wolf at 15 and 40 m (pitch 20), one JPEG each, plus a frame-time
// probe of the 15 m bison view (renderOnce with a GPU sync; noisy on a shared machine).
// Usage: node tools/r_grassnear_shots.mjs --out scratch/v1-grassnear/after
// GN_AB=1 (same-state before/after pairs) needs a temporary float uniform uGn in grass.ts that blends the old and new constants; GN_ONLY=a,b picks views.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/v1-grassnear/after');
mkdirSync(out, { recursive: true });
const VIEWS = [
  ['gn_bison_10', 0, 2, 10, 20], ['gn_bison_15', 0, 2, 15, 20], ['gn_bison_20', 0, 2, 20, 20],
  ['gn_wolf_15', 1, 5, 15, 20], ['gn_wolf_40', 1, 5, 40, 20],
  // fixed spots (no animal): the valley's east edge where the review wolves ran (x 481), and 60 m in from it
  ['gn_edge_15', null, null, 15, 20, 481, 200], ['gn_edge_40', null, null, 40, 20, 481, 200], ['gn_in60_15', null, null, 15, 20, 420, 200],
];
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5400 + Math.floor(Math.random() * 400), hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 420000);
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(async () => {
    const e = window.__engine;
    window.__env = (o) => {
      window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.45 }, o);
      if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow();
    };
    window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 900) || ++n > 240) { clearInterval(t); r(); } }, 500); });
  })()`);
  await page.waitForTimeout(3000);
  for (const [name, sp, st, dist, pitch, fx, fz] of VIEWS) {
    if (process.env.GN_ONLY && !process.env.GN_ONLY.split(',').includes(name)) continue;
    const info = await page.evaluate(({ sp, st, dist, pitch, fx, fz }) => {
      if (sp === null) { window.__followId(null); window.__engine.cam.flyTo(fx, fz, dist, pitch); return { fixed: [fx, fz] }; }
      const c = window.__find(sp, st).concat(window.__find(sp)); const id = c[0];
      window.__followId(id); window.__engine.cam.setView({ distance: dist, pitchDeg: pitch }, true);
      const g = window.__grass;
      return { id };
    }, { sp, st, dist, pitch, fx, fz });
    await page.waitForTimeout(sp === null ? 6000 : 3500);
    if (process.env.GN_AB) {
      for (const [tag, v] of [['before', 0], ['after', 1]]) {
        await page.evaluate((v) => { window.__grass.uniforms.uGn.value = v; }, v);
        await page.waitForTimeout(1500);
        mkdirSync(`${out}/${tag}`, { recursive: true });
        await page.screenshot({ path: `${out}/${tag}/${name}.jpg`, type: 'jpeg', quality: 90 });
      }
    } else await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 90 });
    const stats = await page.evaluate(() => { const s = window.__grass.stats; return { cells: [...s.cells], inst: s.instances }; });
    console.log('saved', name, JSON.stringify(info), JSON.stringify(stats));
  }
  // frame time, bison at 15 m and the wolf view, three batches of 60 synced renders; GN_AB toggles the uGn A/B uniform (0 = old look)
  const ft = await page.evaluate(async (ab) => {
    const c = window.__find(0, 2).concat(window.__find(0)); window.__followId(c[0]); window.__engine.cam.setView({ distance: 15, pitchDeg: 20 }, true);
    await new Promise((r) => setTimeout(r, 2500));
    const e = window.__engine, gl = e.renderer.getContext(), px = new Uint8Array(4);
    const res = {};
    for (const v of ab ? [0, 1, 0, 1] : [1]) {
      if (ab) window.__grass.uniforms.uGn.value = v;
      const t = [];
      for (let b = 0; b < 3; b++) {
        const t0 = performance.now();
        for (let i = 0; i < 60; i++) { e.renderOnce(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
        t.push(+((performance.now() - t0) / 60).toFixed(2));
      }
      (res['uGn' + v] ||= []).push(...t);
    }
    return res;
  }, !!process.env.GN_AB);
  console.log('frame ms per batch (bison 15 m):', JSON.stringify(ft));
} catch (e) { console.error('failed', e.message); } finally { clearTimeout(kill); await browser.close(); await server.close(); }
process.exit(0);
