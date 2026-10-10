// Ground A/B in ONE page session (the sim is not deterministic across loads, so before/after must share a session).
// Usage: node tools/gdbg.mjs --out dir [--views 02,05,06,07] [--modes off,on] [--set look]
// Each mode is JS run before the shot, e.g. off = "terrain.groundDetail.value=0". Modes: off, on, or name=js pairs via --modejs "name=js;name2=js2".
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/gdbg');
const views = arg('views', '02,05,06,07').split(',');
const modes = {};
for (const m of arg('modes', 'off,on').split(',')) modes[m] = m === 'off' ? 'T.groundDetail.value=0' : m === 'on' ? 'T.groundDetail.value=1' : '';
const mj = arg('modejs', '');
if (mj) for (const kv of mj.split('@@')) { const i = kv.indexOf('='); modes[kv.slice(0, i)] = kv.slice(i + 1); }
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const loadTimeout = 420000;
const SETUP = `(() => {
  const e = window.__engine;
  window.__env = (o) => {
    window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
    if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
    e.setEnv(window.__envO); e.applyEnvNow();
  };
  window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
  const w = e.world;
  window.__wv = (t, dist, pitch, rel) => {
    let x, y;
    if (typeof t === 'string') { const q = Number(t.slice(1)) * 4; x = w.ponds[q]; y = w.ponds[q + 1]; }
    else { const n = w.creek.length / 2, k = Math.min(n - 2, Math.max(0, Math.floor(n * t))); x = w.creek[2 * k]; y = w.creek[2 * k + 1]; }
    const L = e.uniforms.lightDir.value;
    const az = Math.atan2(L.x, L.z) * 180 / Math.PI;
    e.cam.setView({ x, y, distance: dist, pitchDeg: pitch, yawDeg: az + 180 + rel }, true);
    window.__wvXY = [x, y];
  };
  // paint burn (veg blue channel) in a disc round a point, kept up every frame (the sim is paused, but setVeg would scrub it)
  window.__burn = (x, y, r, v) => {
    const n = w.n, cell = w.size / n, d = e.vegTexture.image.data;
    const paint = () => { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const dx = (i + 0.5) * cell - x, dz = (j + 0.5) * cell - y; const q = Math.hypot(dx, dz) / r; if (q < 1) d[(j * n + i) * 4 + 2] = Math.round(v * 255 * Math.min(1, 1.6 * (1 - q))); } e.vegTexture.needsUpdate = true; };
    paint(); if (window.__burnHook) window.__burnHook(); window.__burnHook = e.onFrame(paint);
  };
  window.__lkPick = (sp, st) => { const c = (st !== undefined ? window.__find(sp, st) : []).concat(window.__find(sp)); return c.length ? c[0] : null; };
  window.__lkFollow = (sp, st, dist, pitch) => { const id = window.__lkPick(sp, st); window.__followId(id); e.cam.setView({ distance: dist, pitchDeg: pitch }); };
})()`;
const VIEWS = {
  '01': "window.__concept()",
  '02': "window.__cam('low')",
  '03': "window.__cam('wide')",
  '04': "window.__focusHerd(); window.__engine.cam.setView({ distance: 60, pitchDeg: 16 })",
  '05': "window.__lkFollow(0, 1, 11, 12)",
  '06': "window.__lkFollow(1, undefined, 13, 14)",
  '07': "window.__lkFollow(3, undefined, 12, 12)",
  '08': "window.__followId(null); window.__env({ dayFrac: 0.45 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })",
  '09': "window.__env({ dayFrac: 0.95 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 70, pitchDeg: 22 })",
  '10': "window.__env({ season: 3.4, dayFrac: 0.42, warmth: 0.1 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })",
  // extra close views for the ground work (bare / trampled / wet / burnt / snow)
  'm5': "window.__followId(null); window.__env({ dayFrac: 0.45 }); window.__engine.cam.setView({ distance: 7, pitchDeg: 30 })",
  'probe': "(() => { const d = window.__engine.vegTexture.image.data; let c = 0, m = 0; const hist = {}; for (let i = 2; i < d.length; i += 4) { if (d[i] > 0) { c++; m = Math.max(m, d[i]); const b = Math.floor(d[i] / 32); hist[b] = (hist[b] || 0) + 1; } } console.warn('BURN cells', c, 'max', m, JSON.stringify(hist)); })()",
  'rd': "window.__env({ season: 2.0, dayFrac: 0.45 }); window.__lkFollow(1, 5, 40, 20)",
  'rd2': "window.__env({ season: 2.0, dayFrac: 0.45 }); window.__lkFollow(1, 5, 14, 24)",
  'cr': "window.__env({ dayFrac: 0.6 }); window.__wv(0.45, 12, 26, 70)",
  'cr2': "window.__env({ dayFrac: 0.6 }); window.__wv(0.3, 9, 38, 20)",
  'pd': "window.__env({ dayFrac: 0.6 }); window.__wv('p0', 14, 28, 40)",
  'bn': "window.__followId(null); window.__env({ dayFrac: 0.55 }); window.__burn(190, 250, 16, 0.78); window.__engine.cam.setView({ x: 190, y: 250, distance: 9, pitchDeg: 34, yawDeg: 200 }, true)",
  'bn2': "window.__followId(null); window.__env({ dayFrac: 0.7 }); window.__engine.cam.setView({ x: 190, y: 250, distance: 20, pitchDeg: 14, yawDeg: 200 }, true)",
  'sn': "window.__followId(null); window.__env({ season: 3.5, dayFrac: 0.45, warmth: 0.1, weather: 4 }); window.__wv(0.6, 10, 30, 80)",
  'g1': "window.__env({ dayFrac: 0.7 }); window.__lkFollow(0, 1, 8, 24)",
  'g2': "window.__env({ dayFrac: 0.45 }); window.__lkFollow(0, 1, 8, 40)",
  'w1': "window.__env({ season: 3.4, dayFrac: 0.42, warmth: 0.1, weather: 4 }); window.__lkFollow(0, 1, 12, 20)",
};
const kill = setTimeout(() => { console.error('gdbg: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 400)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page ' + m.type() + ']', m.text().slice(0, 600)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass' + arg('query', ''), { waitUntil: 'load', timeout: loadTimeout });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: loadTimeout });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  await page.evaluate(SETUP);
  await page.waitForTimeout(5000);
  await page.evaluate('window.T = window.__engine.terrain');
  for (const v of views) {
    await page.evaluate("(() => { const c = window.__engine.cloudShadow; if (c.__orig) c.update = c.__orig; })()");
    await page.evaluate(VIEWS[v] ?? v);
    await page.waitForTimeout(Number(arg('settle', 9000)));
    // freeze the drifting cloud shadows so every mode is shot under the same light
    await page.evaluate("(() => { const c = window.__engine.cloudShadow; if (!c.__orig) c.__orig = c.update; c.update = () => {}; })()");
    await page.waitForTimeout(300);
    for (const [mname, js] of Object.entries(modes)) {
      if (js) await page.evaluate(js);
      await page.waitForTimeout(Number(arg('gap', 250)));
      const p = `${out}/v${v}_${mname}.jpg`;
      await page.screenshot({ path: p, type: 'jpeg', quality: 90, timeout: 180000 });
      console.log('saved', p);
    }
  }
} catch (e) { console.error('gdbg failed:', e.message); code = 1; }
finally { await browser.close(); await server.close(); clearTimeout(kill); }
process.exit(code);
