// Stills and GPU timing for the planted groves and floodwater render (WP S17 frame fields `groves` and `flood`).
//   node tools/r_groves_flood.mjs [--out review/wip/groves-flood] [--size 1600x900] [--skip-time]
// Everything goes through the real path: window.__apply sends the intervention to the sim worker, the snapshot carries the field,
// main.ts hands it to the engine. Stills: the default world, a grove near and from above right after planting, the flood at its
// peak from a low and a top view, mid-drain, and the same spot after it has drained. Timing: GPU time (EXT_disjoint_timer_query)
// of two views with and without the flood.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/groves-flood'));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const skipTime = argv.includes('--skip-time');
const floodOnly = argv.includes('--flood-only'); // R-marsh: skip the default and grove stills, and stop after the peak stills (with the grazing views)
const kill = setTimeout(() => { console.error('r_groves_flood: hard timeout'); process.exit(2); }, 10 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/.vitecache-gf'),
  server: { port: 5900 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(300000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[console.' + m.type() + '] ' + m.text().slice(0, 400)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  const shot = async (name) => { const p = `${out}/${name}.jpg`; await page.screenshot({ path: p, type: 'jpeg', quality: 90 }); console.log('saved', p); };
  const settle = (ms) => page.waitForTimeout(ms);

  // hold a warm late-morning light, pause the sim, and pick the two spots from the world's own fields
  const spots = await page.evaluate(() => {
    window.__speed(0);
    const e = window.__engine, w = e.world;
    window.__held = { dayFrac: 0.33, season: 1.3, weather: 0, rain: 0, windStrength: 0.25 };
    Object.assign(e.env, window.__held);
    const hold = window.__held;
    e.setEnv = () => {};
    Object.assign(e.env, hold);
    e.applyEnvNow();
    // grove site: open, flat, dry ground 38 to 55 m from the water, no tree within 30 m, away from the rim
    const S = w.size, n = w.n, tr = w.trees;
    let best = null, bs = -1e9;
    for (let j = 8; j < n - 8; j += 2) for (let i = 8; i < n - 8; i += 2) {
      const c = j * n + i, x = (i + 0.5) * w.cell, y = (j + 0.5) * w.cell;
      const wd = w.waterDist[c];
      if (wd < 38 || wd > 55 || w.slope[c] > 0.05 || x < 90 || y < 90 || x > S - 90 || y > S - 90) continue;
      let near = 1e9;
      for (let t = 0; t < tr.length; t += 4) near = Math.min(near, Math.hypot(tr[t] - x, tr[t + 1] - y));
      if (near < 30) continue;
      const sc = -Math.abs(Math.hypot(x - S / 2, y - S / 2) - 70) + near * 0.1;
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    // flood site: the creek point with the most open floodplain on both sides, and its direction
    const cr = w.creek;
    let fb = null, fs = -1e9;
    for (let k = 12; k < cr.length / 2 - 12; k += 3) {
      const x = cr[2 * k], y = cr[2 * k + 1];
      if (x < 100 || y < 100 || x > S - 100 || y > S - 100) continue;
      let cnt = 0;
      for (let t = 0; t < tr.length; t += 4) if (Math.hypot(tr[t] - x, tr[t + 1] - y) < 45) cnt++;
      const sc = -cnt;
      if (sc > fs) { fs = sc; fb = [x, y, cr[2 * (k + 6)] - cr[2 * (k - 6)], cr[2 * (k + 6) + 1] - cr[2 * (k - 6) + 1]]; }
    }
    return { grove: best, flood: fb };
  });
  console.log('spots', JSON.stringify(spots));
  const [gx, gy] = spots.grove ?? [256, 256];
  const [fx, fy, fdx, fdy] = spots.flood;
  const fyaw = (Math.atan2(fdx, fdy) * 180) / Math.PI + 90; // look across the creek

  const view = (o) => page.evaluate((o) => { const e = window.__engine; e.cam.follow(null); e.cam.setView(o, true); for (let i = 0; i < 6; i++) e.renderOnce(0.016); }, o);
  const frames = (k, dt = 0.05) => page.evaluate(({ k, dt }) => { const e = window.__engine; for (let i = 0; i < k; i++) e.renderOnce(dt); }, { k, dt });

  // ---- 0. the default world, no tool used
  if (!floodOnly) {
  await page.evaluate(() => { window.__engine.cam.preset('wide', true); });
  await frames(8); await settle(400);
  await shot('00_default_wide');
  await page.evaluate(() => { window.__engine.cam.preset('low', true); });
  await frames(8); await settle(400);
  await shot('01_default_low');
  }

  // ---- 1. a grove, right after planting
  const t0 = Date.now();
  if (!floodOnly) {
  await page.evaluate(({ gx, gy }) => { window.__apply({ kind: 'grove', x: gx, y: gy, radius: 22 }); window.__step(4); }, { gx, gy });
  // poll until the grove's trees stand (the sim's frame carries them with the next veg frame, within about 200 ms)
  const seen = await page.evaluate(async () => {
    const t = performance.now();
    while (performance.now() - t < 4000) {
      if (window.__engine.trees.groveCount > 0) return Math.round(performance.now() - t);
      await new Promise((r) => setTimeout(r, 20));
    }
    return -1;
  });
  console.log('grove trees standing after (ms from the step):', seen, 'count', await page.evaluate(() => window.__engine.trees.groveCount));
  await view({ x: gx, y: gy, yawDeg: 25, pitchDeg: 9, distance: 52 });
  await frames(6); await settle(300);
  await shot('10_grove_near');
  await view({ x: gx, y: gy, yawDeg: 25, pitchDeg: 80, distance: 150 });
  await frames(6); await settle(300);
  await shot('11_grove_top');
  void t0;
  // persistence: advance the sim a while and look again
  const tk = await page.evaluate(() => window.__snap().tick);
  await page.evaluate(() => window.__step(600));
  await page.waitForFunction((tk) => window.__snap().tick >= tk + 600, tk, { timeout: 120000 });
  await settle(300);
  await view({ x: gx, y: gy, yawDeg: 25, pitchDeg: 9, distance: 52 });
  await frames(6); await settle(300);
  await shot('12_grove_after_600_ticks');
  }

  // ---- 2. a flood: peak (low and top), mid-drain, drained
  await page.evaluate(() => { window.__apply({ kind: 'flood', ticks: 1200, severity: 0.8 }); window.__step(30); });
  await settle(600);
  // let the sheet rise (real time), rendering as the page would
  await page.evaluate(async () => { const e = window.__engine; for (let i = 0; i < 80; i++) { e.renderOnce(0.1); } });
  await view({ x: fx, y: fy, yawDeg: fyaw, pitchDeg: 7, distance: 44 });
  await frames(10); await settle(300);
  await shot('20_flood_peak_low');
  await view({ x: fx, y: fy, yawDeg: fyaw, pitchDeg: 75, distance: 190 });
  await frames(6); await settle(300);
  await shot('21_flood_peak_top');
  await view({ x: fx, y: fy, yawDeg: fyaw, pitchDeg: 20, distance: 110 });
  await frames(6); await settle(300);
  await shot('22_flood_peak_mid');
  for (const [nm, yawOff, pitch, dist] of [['23_flood_peak_grazing_a', 0, 3.5, 70], ['24_flood_peak_grazing_b', 180, 3.5, 70], ['25_flood_peak_grazing_c', 90, 2.5, 110]]) {
    await view({ x: fx, y: fy, yawDeg: fyaw + yawOff, pitchDeg: pitch, distance: dist });
    await frames(6); await settle(300);
    await shot(nm);
  }
  console.log('flood state at peak', JSON.stringify(await page.evaluate(() => { const f = window.__engine.flood; return { level: +f.level.toFixed(3), wet: +f.wet.toFixed(3), visible: f.mesh.visible }; })));

  if (!skipTime && !floodOnly) {
    // GPU time with and without the flood, the same two cameras
    const res = await page.evaluate(async () => {
      const e = window.__engine, gl = e.renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return { error: 'no timer query' };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      const measure = async () => {
        for (let i = 0; i < 6; i++) e.renderOnce(0.016);
        const qs = [];
        for (let i = 0; i < 40; i++) {
          const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
          if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
        }
        for (let t = 0; t < 400 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE); t++) await new Promise((r) => setTimeout(r, 25));
        const v = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
        return +v[Math.floor(v.length / 2)].toFixed(3);
      };
      const setFlood = (on) => {
        e.setFlood(on ? Float32Array.of(1000, 0.8, 42) : undefined);
        e.flood.level = on ? 1 : 0; e.flood.wet = on ? 1 : 0; e.flood.mesh.visible = on;
        if (!on) e.flood.update(1000);
      };
      const out = { renderer };
      const rounds = [];
      for (const [name, o] of [['low', { pitchDeg: 7, distance: 44 }], ['wide', { pitchDeg: 35, distance: 220 }]]) {
        e.cam.setView(o, true);
        const r = { off: [], on: [] };
        for (let k = 0; k < 3; k++) { setFlood(false); r.off.push(await measure()); setFlood(true); r.on.push(await measure()); }
        rounds.push([name, r]);
      }
      out.rounds = rounds;
      setFlood(false);
      return out;
    });
    console.log('GPU timing', JSON.stringify(res));
    // restore the real flood state for the next stills (the sim still has it running)
    await page.evaluate(() => window.__step(2));
    await settle(500);
    await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 80; i++) e.renderOnce(0.1); });
  }

  if (!floodOnly) {
  // drain: run the sim to the end of the flood, then ease out in real time
  await page.evaluate(() => window.__step(1300));
  await page.waitForFunction(() => { const s = window.__snap(); return s && !s.flood; }, null, { timeout: 120000 });
  await settle(300);
  await view({ x: fx, y: fy, yawDeg: fyaw, pitchDeg: 7, distance: 44 });
  await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 14; i++) e.renderOnce(0.25); }); // about 3.5 s of draining
  await settle(300);
  await shot('30_flood_draining_low');
  await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 14; i++) e.renderOnce(0.25); }); // water gone, wet ground left
  await settle(300);
  console.log('after drain', JSON.stringify(await page.evaluate(() => { const f = window.__engine.flood; return { level: +f.level.toFixed(3), wet: +f.wet.toFixed(3), visible: f.mesh.visible }; })));
  await shot('31_flood_drained_wet_low');
  await view({ x: fx, y: fy, yawDeg: fyaw, pitchDeg: 75, distance: 190 });
  await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 10; i++) e.renderOnce(0.1); });
  await settle(300);
  await shot('32_flood_drained_wet_top');
  await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 120; i++) e.renderOnce(0.5); }); // a minute of drying
  await view({ x: fx, y: fy, yawDeg: fyaw, pitchDeg: 7, distance: 44 });
  await settle(300);
  await shot('33_flood_dry_low');
  console.log('dry', JSON.stringify(await page.evaluate(() => { const f = window.__engine.flood; return { level: f.level, wet: f.wet, visible: f.mesh.visible }; })));
  }
} catch (e) {
  console.error('r_groves_flood failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'CONSOLE/PAGE ERRORS:\n' + uniq.join('\n') : 'no console errors or warnings');
process.exit(code);
