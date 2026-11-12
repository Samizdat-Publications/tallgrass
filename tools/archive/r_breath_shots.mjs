// r-breath stills: the valley at the climate extremes, same camera and season, JPEG q90.
//   node tools/r_breath_shots.mjs --out scratch/r-breath [--size 1600x900] [--only looks,graph,header]
// looks:  ordinary / wet / dry / megadrought through the ?clim= override (sim untouched), at a summer and an autumn view, wide and low.
// graph:  a real run with ?p=climate2:0.3 stepped through several decades, then the expanded graph (G) with its climate band.
// header: the slate with the climate word, from the override.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/r-breath'));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const only = arg('only', 'looks,graph,header').split(',');
const years = Number(arg('years', '70'));
const kill = setTimeout(() => { console.error('r_breath_shots: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/.vitecache-rbreath'),
  server: { port: 5400 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, fs: { allow: [resolve('.'), resolve('node_modules/..'), 'C:/Users/stewa/Documents/Claude/ecosystem-sim/node_modules'] }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
mkdirSync(out, { recursive: true });
const wantStates = arg('states', '').split(',').filter(Boolean);
const STATES = [['ordinary', '0'], ['wet', '1'], ['dry', '-1'], ['megadrought', 'mega']].filter(([n]) => !wantStates.length || wantStates.includes(n));
// name, season, dayFrac, camera preset, distance, pitch
const VIEWS = [
  ['summer_wide', 1.15, 0.42, 'wide', 230, 24],
  ['summer_low', 1.15, 0.42, 'low', 22, 7],
  ['autumn_wide', 1.95, 0.4, 'wide', 230, 24],
  ['autumn_low', 1.95, 0.4, 'low', 22, 7],
];
async function open(query, hideUi) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  if (hideUi) await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[console.' + m.type() + '] ' + m.text().slice(0, 400)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  return page;
}
try {
  if (only.includes('looks')) {
    for (const [sname, clim] of STATES) {
      const page = await open('clim=' + clim, true);
      await page.evaluate(() => { window.__speed(0); });
      await page.waitForTimeout(500);
      for (const [name, season, day, preset, dist, pitch] of VIEWS) {
        await page.evaluate(({ season, day, preset, dist, pitch }) => {
          const e = window.__engine;
          if (!e.__held) { e.__held = { climate: e.env.climate }; e.setEnv = () => {}; } // hold the env (the override has already put its climate there)
          Object.assign(e.env, { dayFrac: day, season, weather: 0, rain: 0, windStrength: 0.3, climate: e.__held.climate });
          e.applyEnvNow();
          e.cam.preset(preset, true);
          e.cam.setView({ distance: dist, pitchDeg: pitch }, true);
          for (let i = 0; i < 16; i++) e.renderOnce(1.0); // ease the climate look in (about 2.5 s per e-fold)
        }, { season, day, preset, dist, pitch });
        await page.waitForTimeout(300);
        const info = await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 3; i++) e.renderOnce(0.016); return { clim: +e.climSm.toFixed(3), mega: +e.megaSm.toFixed(2), drought: +e.uniforms.drought.value.toFixed(3), wet: +e.wetLook.toFixed(2) }; });
        const p = `${out}/${sname}_${name}.jpg`;
        await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
        console.log('saved', p, JSON.stringify(info));
      }
      await page.close();
    }
  }
  if (only.includes('header')) {
    for (const [sname, clim] of [['wet', '0.8'], ['dry', '-0.8'], ['megadrought', 'mega']]) {
      const page = await open('clim=' + clim, false);
      await page.evaluate(() => { window.__speed(0); const e = window.__engine; for (let i = 0; i < 16; i++) e.renderOnce(1.0); });
      await page.waitForTimeout(800);
      const text = await page.evaluate(() => document.querySelector('.tg-slate')?.textContent ?? '');
      console.log('header', sname, JSON.stringify(text));
      await page.screenshot({ path: `${out}/header_${sname}.jpg`, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: Math.min(W, 760), height: 150 } });
      await page.close();
    }
  }
  if (only.includes('graph')) {
    const page = await open('p=climate2:0.3&seed=tallgrass', false);
    await page.evaluate(() => { window.__speed(0); });
    const YT = 1200;
    for (let y = 0; y < years; y += 5) await page.evaluate((t) => window.__step(t), YT * 5);
    // the worker runs the queued steps one after another; wait for the snapshot at the end of the last one
    await page.waitForFunction((t) => (window.__snap()?.tick ?? 0) >= t, YT * years, { timeout: 15 * 60 * 1000, polling: 1000 });
    await page.waitForTimeout(1500);
    await page.keyboard.press('g');
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => ({ text: document.querySelector('.tg-slate')?.textContent ?? '', clim: window.__engine.climSm }));
    console.log('graph run', JSON.stringify(info));
    await page.screenshot({ path: `${out}/graph_band.jpg`, type: 'jpeg', quality: 90 });
    await page.close();
  }
} catch (e) {
  console.error('r_breath_shots failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'CONSOLE/PAGE ERRORS:\n' + uniq.join('\n') : 'no console errors or warnings');
process.exit(code);
