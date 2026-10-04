// Scripted still capture of the real game: one page load, a sequence of steps, a named PNG per step.
// Headless Chromium on the real GPU (same flags as capture.mjs). Never an OS screen grab.
//
// Usage: node tools/stills.mjs --out review/round-01 [--set review] [--query "seed=tallgrass"] [--size 1600x900]
// Steps run in order; each may evaluate JS in the page (hooks from src/main.ts: __cam, __speed, __timeOfDay,
// __find, __followId, __select, __engine, __ui, __focusHerd) and then wait before the shot.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/stills');
const set = arg('set', 'review');
const query = arg('query', '');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const loadTimeout = Number(arg('timeout', 90000));

// St: 1 graze, 3 run, 4 flee, 5 chase, 6 eat, 9 fly, 10 stalk. Sp: 0 bison, 1 wolf, 2 raven, 3 pronghorn.
const SETS = {
  review: [
    { name: '01_opening_herd', eval: 'window.__speed(1); window.__focusHerd()', wait: 3500 },
    { name: '02_wolves_hunting', eval: `(() => { const c = window.__find(1, 5).concat(window.__find(1, 10)).concat(window.__find(1)); const id = c[0]; window.__select(id); window.__followId(id); window.__engine.cam.setView({ distance: 40, pitchDeg: 20 }); })()`, wait: 4000 },
    { name: '03_ravens_kill', eval: `(() => { const r = window.__find(2, 6).concat(window.__find(2)); window.__select(null); window.__followId(r[0]); window.__engine.cam.setView({ distance: 60, pitchDeg: 30 }); })()`, wait: 3500 },
    { name: '04_pronghorn', eval: `(() => { const p = window.__find(3); window.__followId(p[0]); window.__engine.cam.setView({ distance: 70, pitchDeg: 22 }); })()`, wait: 3500 },
    { name: '05_golden_low', eval: "window.__followId(null); window.__timeOfDay(0.7); window.__cam('low')", wait: 4000 },
    { name: '06_evening_wide', eval: "window.__cam('wide')", wait: 3500 },
    { name: '07_night', eval: "window.__timeOfDay(0.95); window.__focusHerd()", wait: 4500 },
    { name: '08_dawn', eval: "window.__timeOfDay(0.27)", wait: 4500 },
    { name: '09_top_map', eval: "window.__cam('top')", wait: 3500 },
    { name: '10_ui_graph_fast', eval: "window.__focusHerd(); window.__speed(100); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))", wait: 9000 },
    { name: '11_overlay_territories', eval: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })); window.__speed(1); window.__timeOfDay(0.62); window.__cam('wide'); window.__overlay.setMode('territory')", wait: 4500 },
  ],
  // herd shape: fast-forward a little, then look down on the biggest herd from two heights
  herd: [
    { name: 'h0_warm', eval: "window.__speed(10)", wait: 20000 },
    { name: 'h1_herd_140', eval: "window.__speed(1); window.__timeOfDay(0.42); window.__focusHerd(); window.__engine.cam.setView({ distance: 140, pitchDeg: 42 })", wait: 4000 },
    { name: 'h2_herd_280', eval: "window.__engine.cam.setView({ distance: 280, pitchDeg: 50 })", wait: 3500 },
  ],
  // map overlays (window.__overlay from src/main.ts), after a fast-forward so packs and grazing patterns exist
  overlays: [
    { name: 'ov_00_warm', eval: "window.__speed(10)", wait: 15000 },
    { name: 'ov_00_midday', eval: "window.__speed(1); window.__timeOfDay(0.45)", wait: 2500 },
    { name: 'ov_01_territory_top', eval: "window.__speed(1); window.__cam('top'); window.__overlay.setMode('territory')", wait: 3500 },
    { name: 'ov_02_territory_wide', eval: "window.__cam('wide')", wait: 3500 },
    { name: 'ov_03_vegetation', eval: "window.__cam('top'); window.__overlay.setMode('vegetation')", wait: 3500 },
    { name: 'ov_04_fear', eval: "window.__overlay.setMode('fear')", wait: 3000 },
    { name: 'ov_05_traits', eval: "window.__overlay.setMode('traits')", wait: 3000 },
    { name: 'ov_06_traits_wide', eval: "window.__cam('wide')", wait: 3000 },
  ],
};

const steps = SETS[set];
if (!steps) { console.error('unknown set', set); process.exit(1); }
const kill = setTimeout(() => { console.error('stills: hard timeout'); process.exit(2); }, 10 * 60 * 1000 + 2 * loadTimeout);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: loadTimeout });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: loadTimeout });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  for (const s of steps) {
    if (s.eval) await page.evaluate(s.eval);
    await page.waitForTimeout(s.wait ?? 2500);
    const p = `${out}/${s.name}.png`;
    await page.screenshot({ path: p });
    console.log('saved', p);
  }
} catch (e) {
  console.error('stills failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
