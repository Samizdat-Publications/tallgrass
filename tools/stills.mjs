// Scripted still capture of the real game: one page load, a sequence of steps, a named JPEG (quality 90) per step.
// Headless Chromium on the real GPU (same flags as capture.mjs). Never an OS screen grab.
//
// Usage: node tools/stills.mjs --out review/round-01 [--set review] [--query "seed=tallgrass"] [--size 1600x900] [--png]
// --png writes lossless .png instead of the default .jpg.
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
const png = argv.includes('--png'); // default is JPEG quality 90 (much smaller, fine for review); --png opts back into lossless
const ext = png ? 'png' : 'jpg';

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
  // R-wideview: deterministic wide, mid and top views (seasons and light held by __env, the sim keeps running underneath) for the
  // landform snow, creek banks, mid-range haze and map-edge checks. Compare the same-named shots before and after a change.
  wideview: [
    { name: 'wv_00_setup', eval: `(() => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.4 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(1); window.__followId(null); window.__env({ season: 1.3, dayFrac: 0.62 }); window.__cam('wide');
    })()`, wait: 3000 },
    { name: 'wv_01_summer_wide', eval: '', wait: 2500 },
    { name: 'wv_02_summer_mid', eval: "window.__engine.cam.setView({ distance: 170, pitchDeg: 26 })", wait: 3000 },
    { name: 'wv_03_summer_top', eval: "window.__cam('top')", wait: 3000 },
    { name: 'wv_04_autumn_wide', eval: "window.__env({ season: 2.4, dayFrac: 0.45 }); window.__cam('wide')", wait: 3000 },
    { name: 'wv_05_winter_wide', eval: "window.__env({ season: 3.5, dayFrac: 0.4 })", wait: 3000 },
    { name: 'wv_06_winter_mid', eval: "window.__engine.cam.setView({ distance: 170, pitchDeg: 26 })", wait: 3000 },
    { name: 'wv_07_winter_top', eval: "window.__cam('top')", wait: 3000 },
    { name: 'wv_08_winter_dusk_wide', eval: "window.__env({ season: 3.3, dayFrac: 0.7 }); window.__cam('wide')", wait: 3000 },
    { name: 'wv_09_winter_night_wide', eval: "window.__env({ season: 3.4, dayFrac: 0.95 })", wait: 3000 },
    { name: 'wv_10_winter_night_top', eval: "window.__cam('top')", wait: 3000 },
  ],
  // snow vs calendar: fast-forward through a winter, then drop to 1x and check the ground matches the header's season
  // herd shape: run a few valley-years, then look at the herds from the drone, mid range and above (compare ?p=herdNearest:6)
  herds: [
    { name: 'h0_run', eval: "window.__speed(100); window.__cam('wide')", wait: 20000 },
    { name: 'h1_wide', eval: "window.__speed(1); window.__timeOfDay(0.64); window.__focusHerd(); window.__cam('wide')", wait: 4500 },
    { name: 'h2_herd', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 160, pitchDeg: 32 })", wait: 4000 },
    { name: 'h3_top', eval: "window.__cam('top')", wait: 4000 },
  ],
  // the same views early on, while the herds are big (year 1): a few seconds at 10x so the herd shape forms, then frozen light
  herdsEarly: [
    { name: 'e0_run', eval: "window.__speed(10); window.__cam('wide')", wait: 12000 },
    { name: 'e1_wide', eval: "window.__speed(1); window.__timeOfDay(0.64); window.__focusHerd(); window.__cam('wide')", wait: 4500 },
    { name: 'e2_herd', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 160, pitchDeg: 32 })", wait: 4000 },
    { name: 'e3_top', eval: "window.__timeOfDay(0.5); window.__cam('top')", wait: 4000 },
  ],
  snow: [
    { name: 's1_fast', eval: "window.__speed(100); window.__cam('wide')", wait: 14000 },
    { name: 's2_fast', eval: '', wait: 6000 },
    { name: 's3_slow', eval: "window.__speed(1); window.__timeOfDay(0.62)", wait: 4500 },
    { name: 's4_slow_later', eval: '', wait: 8000 },
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
  // a summer storm held by the same __env hook as the seasons set: drone, map view and an in-between pitch (rain streaks fade when looking down)
  rain: [
    { name: 'r0_setup', eval: `(() => {
      const e = window.__engine;
      window.__envO = { season: 1.2, weather: 3, warmth: 0.7, rain: 0.6, dayFrac: 0.4 };
      window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow(); window.__speed(1); window.__followId(null); window.__cam('wide');
    })()`, wait: 3500 },
    { name: 'r1_storm_wide', eval: '', wait: 1500 },
    { name: 'r2_storm_45deg', eval: "window.__engine.cam.setView({ pitchDeg: 48, distance: 400 })", wait: 3500 },
    { name: 'r3_storm_top', eval: "window.__cam('top')", wait: 3500 },
  ],
  // seasons and weather held by window.__env (the sim keeps running underneath): the same wide valley through the year (snowpack and
  // leaf-out), a bare-to-leafy tree row, rain early and late, and night. Each shot is lit and dressed as asked.
  seasons: [
    { name: 'se_00_setup', eval: `(() => {
      const e = window.__engine;
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.4 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(1); window.__followId(null); window.__env({ season: 3.05, dayFrac: 0.4 }); window.__cam('wide');
    })()`, wait: 2500 },
    { name: 'se_01_early_winter', eval: "window.__env({ season: 3.2, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_02_mid_winter', eval: "window.__env({ season: 3.5, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_03_late_winter', eval: "window.__env({ season: 3.8, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_04_early_spring', eval: "window.__env({ season: 0.2, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_05_late_spring', eval: "window.__env({ season: 0.8, dayFrac: 0.4 })", wait: 2500 },
    { name: 'se_06_rain_wide', eval: "window.__env({ season: 0.6, dayFrac: 0.4, weather: 1, rain: 0.1 })", wait: 3500 },
    { name: 'se_07_rain_low', eval: "window.__cam('low')", wait: 2500 },
    { name: 'se_08_storm_wide', eval: "window.__cam('wide'); window.__env({ season: 1.2, dayFrac: 0.4, weather: 3, rain: 0.6 })", wait: 3500 },
    { name: 'se_09_night_wide', eval: "window.__env({ season: 1.0, dayFrac: 0.95, weather: 0 })", wait: 3000 },
    { name: 'se_10_night_low', eval: "window.__cam('low')", wait: 2500 },
    { name: 'se_11_winter_night', eval: "window.__cam('wide'); window.__env({ season: 3.5, dayFrac: 0.95, weather: 0 })", wait: 3000 },
  ],
  // water close-ups: the creek and a pond at golden hour, midday from above, dusk, night and in winter.
  // __wv(target, distance, pitchDeg, yawFromLightDeg): orbit a creek point (fraction 0..1 along it) or a pond ('p0'..'p2'), with
  // yaw measured from looking straight into the key light (0 = facing the sun or moon).
  // __env({ dayFrac, season, weather, warmth }): hold the rendered time of day and season (the sim keeps running underneath), so
  // every shot is lit as asked instead of drifting through the valley's short year.
  water: [
    { name: 'wa_00_setup', eval: `(() => {
      const e = window.__engine, w = e.world;
      window.__wv = (t, dist, pitch, rel) => {
        let x, y;
        if (typeof t === 'string') { const q = Number(t.slice(1)) * 4; x = w.ponds[q]; y = w.ponds[q + 1]; }
        else { const n = w.creek.length / 2, k = Math.min(n - 2, Math.max(0, Math.floor(n * t))); x = w.creek[2 * k]; y = w.creek[2 * k + 1]; }
        const L = e.uniforms.lightDir.value;
        const az = Math.atan2(L.x, L.z) * 180 / Math.PI;
        e.cam.setView({ x, y, distance: dist, pitchDeg: pitch, yawDeg: az + 180 + rel }, true);
      };
      window.__env = (o) => {
        window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0 }, o);
        if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
        e.setEnv(window.__envO); e.applyEnvNow();
      };
      window.__speed(1); window.__followId(null); window.__env({ dayFrac: 0.71 });
    })()`, wait: 2500 },
    { name: 'wa_01_golden_creek', eval: 'window.__wv(0.32, 95, 26, 20)', wait: 3000 },
    { name: 'wa_02_golden_creek_low', eval: 'window.__wv(0.62, 45, 13, 30)', wait: 3000 },
    { name: 'wa_03_golden_creek_close', eval: 'window.__wv(0.5, 24, 34, 70)', wait: 3000 },
    { name: 'wa_04_golden_pond', eval: "window.__wv('p0', 60, 24, 30)", wait: 3000 },
    { name: 'wa_05_golden_pond_away', eval: "window.__wv('p1', 55, 32, 160)", wait: 3000 },
    { name: 'wa_06_noon_creek_above', eval: "window.__env({ dayFrac: 0.5 }); window.__wv(0.6, 42, 64, 90)", wait: 3000 },
    { name: 'wa_07_noon_pond_above', eval: "window.__wv('p0', 52, 62, 90)", wait: 3000 },
    { name: 'wa_08_dusk_creek', eval: "window.__env({ dayFrac: 0.772 }); window.__wv(0.32, 80, 16, 15)", wait: 3000 },
    { name: 'wa_09_night_creek', eval: "window.__env({ dayFrac: 0.95 }); window.__wv(0.32, 70, 20, 8)", wait: 3000 },
    { name: 'wa_10_night_pond', eval: "window.__wv('p0', 55, 22, 5)", wait: 3000 },
    { name: 'wa_11_winter_creek', eval: "window.__env({ dayFrac: 0.42, season: 3.05, weather: 0, warmth: 0.1 }); window.__wv(0.5, 50, 30, 40)", wait: 3000 },
    { name: 'wa_12_winter_pond', eval: "window.__wv('p0', 55, 34, 40)", wait: 3000 },
    { name: 'wa_13_winter_snow_creek', eval: "window.__env({ dayFrac: 0.42, season: 3.05, weather: 4, warmth: 0.1 }); window.__wv(0.62, 50, 30, 40)", wait: 3000 },
    { name: 'wa_14_winter_snow_pond', eval: "window.__wv('p1', 55, 34, 40)", wait: 3000 },
  ],
};

const steps = SETS[set];
if (!steps) { console.error('unknown set', set); process.exit(1); }
const kill = setTimeout(() => { console.error('stills: hard timeout'); process.exit(2); }, 10 * 60 * 1000 + 2 * loadTimeout);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: arg('cache', undefined) });
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
    const p = `${out}/${s.name}.${ext}`;
    await page.screenshot(png ? { path: p } : { path: p, type: 'jpeg', quality: 90 });
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
