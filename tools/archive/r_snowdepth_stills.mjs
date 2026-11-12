// S11 snow depth stills: steps the real sim into deep winter (snowDepth 1 or 0) and saves a top and a low view, plus a summer frame.
//   node tools/r_snowdepth_stills.mjs --depth 1 --out review/wip/snowdepth [--size 1600x900] [--season 3.45] [--bench]
// Writes <out>/snowdepth{1|0}_{top|low|mid}_winter.jpg (and, with --depth 1, snowdepth1_top_summer.jpg). The sim runs paused; the
// valley is stepped in chunks until the env season reaches --season, the env is then pinned (clear weather, late morning) so the two
// runs are comparable, and the frames are captured through the real GPU. --bench also prints the mean frame time of the winter top view.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const depth = Number(arg('depth', '1'));
const out = resolve(arg('out', 'review/wip/snowdepth'));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const targetSeason = Number(arg('season', '3.45'));
const bench = argv.includes('--bench');
const tag = arg('tag', 'snowdepth' + depth);
const kill = setTimeout(() => { console.error('r_snowdepth_stills: hard timeout'); process.exit(2); }, 14 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/.vitecache-snowdepth'),
  server: { port: 6200 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[console.' + m.type() + '] ' + m.text().slice(0, 400)); });
  await page.goto(base + `/index.html?autoscale=0&autocam=0${depth ? '&p=snowDepth:1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  await page.evaluate(() => window.__speed(0));
  const shot = async (name, o) => {
    await page.evaluate((o) => {
      const e = window.__engine;
      Object.assign(e.env, { dayFrac: 0.42, weather: 0, rain: 0, windStrength: 0.3, ...o.env });
      e.sm.snow = 0; e.snowfallSm = 0;
      e.applyEnvNow();
      e.cam.preset(o.cam, true);
      if (o.view) e.cam.setView({ ...o.view, ...(o.yawOff !== undefined ? { yawDeg: e.cam.yawDeg + o.yawOff } : {}) }, true);
      for (let i = 0; i < 40; i++) e.renderOnce(0.05); // lets the field ease settle (about 1 s of render time)
    }, o);
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 4; i++) e.renderOnce(0.016); const f = e.snowDepth?.field ?? new Float32Array(1); let s = 0, mx = 0; for (const v of f) { s += v; if (v > mx) mx = v; } return { on: !!e.snowDepth?.on, mean: +(s / f.length).toFixed(3), max: +mx.toFixed(3), snowU: +e.uniforms.snow.value.toFixed(3), season: +e.env.season.toFixed(2) }; });
    const p = `${out}/${tag}_${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
    console.log('saved', p, JSON.stringify(info));
  };
  // summer first (the start of the valley year is spring or summer), before any stepping
  if (depth) await shot('top_summer', { cam: 'top', env: { season: 1.8 } });
  // step to winter
  let guard = 0;
  const hist = [];
  for (;;) {
    const s = await page.evaluate(() => ({ tick: window.__engine.env.tick, season: window.__engine.env.season }));
    if (s.season >= targetSeason - 0.02 && s.season < 3.9) break;
    hist.push(s.tick + '/' + s.season.toFixed(2));
    await page.evaluate(() => window.__step(50));
    await page.waitForFunction((t) => window.__engine.env.tick >= t + 50, s.tick, { timeout: 120000, polling: 50 });
    if (++guard > 200) throw new Error('never reached season ' + targetSeason + ' (history ' + hist.slice(-12).join(' ') + ')');
  }
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ tick: window.__engine.env.tick, season: window.__engine.env.season, on: !!window.__engine.snowDepth?.on }));
  console.log('winter reached', JSON.stringify(st));
  await page.evaluate(() => { window.__engine.setEnv = () => {}; });
  await shot('top_winter', { cam: 'top', env: {} });
  await shot('wide_winter', { cam: 'wide', env: {} });
  await shot('low_winter', { cam: 'low', env: {}, view: { distance: 14, pitchDeg: 6 }, yawOff: 150 });
  await shot('mid_winter', { cam: 'low', env: {}, view: { distance: 60, pitchDeg: 18 }, yawOff: 150 });
  if (bench) {
    const r = await page.evaluate(async () => {
      const e = window.__engine; e.cam.preset('wide', true);
      for (let i = 0; i < 60; i++) e.renderOnce(0.016);
      const times = [];
      for (let k = 0; k < 25; k++) {
        const t0 = performance.now();
        for (let i = 0; i < 40; i++) e.renderOnce(0.016);
        e.renderer.getContext().finish();
        times.push((performance.now() - t0) / 40);
      }
      times.sort((a, b) => a - b);
      return { min: +times[0].toFixed(2), median: +times[12].toFixed(2), p25: +times[6].toFixed(2) };
    });
    console.log('frame ms (25 x 40 frames, wide winter):', JSON.stringify(r));
  }
} catch (e) {
  console.error('r_snowdepth_stills failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'CONSOLE/PAGE ERRORS:\n' + uniq.join('\n') : 'no console errors or warnings');
process.exit(code);
