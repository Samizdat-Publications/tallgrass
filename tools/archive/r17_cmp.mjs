// R17 look-set capture that does not depend on machine load: one build (--dir), the look set's 10 views, but every step waits for the sim to
// finish its paused 900 ticks and for N rendered frames (easing runs per frame, so a starved machine otherwise captures mid-transition).
//   node tools/r17_cmp.mjs --dir <projectDir> --out <outDir> [--frames 150] [--size 1600x900] [--only lk_02,lk_09] [--query "seed=tallgrass"]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('dir', '.'));
const out = resolve(arg('out', 'scratch/cmp'));
const frames = Number(arg('frames', 150));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const only = arg('only', '').split(',').filter(Boolean);
const query = arg('query', 'seed=tallgrass&speed=0'); // (speed=0: the sim starts paused, so every run steps exactly the same 900 ticks)
const cfgFile = arg('cfgs', '');
const aoAB = argv.includes('--aoab'); // also capture each view with the AO at full size (in the same page, so the sim state is identical)

const STEPS = [
  { name: 'lk_01_concept', eval: 'window.__concept()' },
  { name: 'lk_02_golden_low', eval: "window.__cam('low')" },
  { name: 'lk_03_golden_wide', eval: "window.__cam('wide')" },
  { name: 'lk_04_herd_mid', eval: "window.__focusHerd(); window.__engine.cam.setView({ distance: 60, pitchDeg: 16 })" },
  { name: 'lk_05_bison_close', eval: 'window.__lkFollow(0, 1, 11, 12)' },
  { name: 'lk_06_wolves_close', eval: 'window.__lkFollow(1, undefined, 13, 14)' },
  { name: 'lk_07_pronghorn_close', eval: 'window.__lkFollow(3, undefined, 12, 12)' },
  { name: 'lk_08_midday_mid', eval: "window.__followId(null); window.__env({ dayFrac: 0.45 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })" },
  { name: 'lk_09_night', eval: "window.__env({ dayFrac: 0.95 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 70, pitchDeg: 22 })" },
  { name: 'lk_10_winter_mid', eval: "window.__env({ season: 3.4, dayFrac: 0.42, warmth: 0.1 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 90, pitchDeg: 24 })" },
];
const SETUP = `(() => {
  const e = window.__engine;
  window.__env = (o) => {
    window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
    if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
    e.setEnv(window.__envO); e.applyEnvNow();
  };
  window.__fc = 0; e.onFrame(() => { window.__fc++; });
  window.__speed(0); window.__step(900); window.__followId(null); window.__env({});
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
  window.__lkPick = (sp, st) => { const c = (st !== undefined ? window.__find(sp, st) : []).concat(window.__find(sp)); return c.length ? c[0] : null; };
  window.__lkFollow = (sp, st, dist, pitch) => { const id = window.__lkPick(sp, st); window.__followId(id); e.cam.setView({ distance: dist, pitchDeg: pitch }); };
})()`;

async function loadVite(dir) {
  try { return await import(pathToFileURL(createRequire(resolve(dir, 'package.json')).resolve('vite')).href); } catch { return await import('vite'); }
}
const vite = await loadVite(root);
process.chdir(root);
const kill = setTimeout(() => { console.error('r17_cmp: hard timeout'); process.exit(2); }, 60 * 60 * 1000);
const server = await vite.createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve(root, 'node_modules/.vite-cmp'),
  server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/art/**', '**/journey/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(`${base}/index.html?autoscale=0&autocam=0&${query}`, { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  await page.evaluate(SETUP);
  // the paused sim has stepped when the snapshot's tick stops changing for 30 frames
  await page.waitForFunction(() => {
    const s = window.__snap && window.__snap();
    if (!s) return false;
    const w = window;
    if (w.__lastTick !== s.tick) { w.__lastTick = s.tick; w.__lastTickT = Date.now(); return false; }
    // (a starved machine delivers snapshots rarely: the step is done when the tick has not moved for 20 s and is past the 900 asked for)
    return Date.now() - w.__lastTickT > 20000 && s.tick >= 900;
  }, null, { timeout: 900000, polling: 500 });
  console.log('sim tick', await page.evaluate(() => window.__snap().tick));
  for (const s of STEPS) {
    if (only.length && !only.some((o) => s.name.startsWith(o))) continue;
    await page.evaluate(s.eval);
    const f0 = await page.evaluate(() => window.__fc);
    await page.waitForFunction((n) => window.__fc >= n, f0 + frames, { timeout: 900000, polling: 250 });
    // freeze the clock: the wind, clouds and animal idles are all driven by it, so two builds at the same fixed time are comparable
    await page.evaluate(() => { const e = window.__engine; e.stop(); e.time = 100; e.renderOnce(0); });
    const p = `${out}/${s.name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90, timeout: 300000 });
    await page.evaluate(() => window.__engine.start());
    if (cfgFile) {
      for (const cfg of JSON.parse(readFileSync(cfgFile, 'utf8'))) {
        await page.evaluate(cfg.on);
        const f2 = await page.evaluate(() => window.__fc);
        await page.waitForFunction((n) => window.__fc >= n, f2 + 8, { timeout: 900000, polling: 250 });
        await page.evaluate(() => { const e = window.__engine; e.stop(); e.time = 100; e.renderOnce(0); });
        mkdirSync(`${out}_${cfg.name}`, { recursive: true });
        await page.screenshot({ path: `${out}_${cfg.name}/${s.name}.jpg`, type: 'jpeg', quality: 90, timeout: 300000 });
        await page.evaluate(() => window.__engine.start());
        await page.evaluate(cfg.off);
        console.log('saved cfg', cfg.name, s.name);
      }
    }
    console.log('saved', p);
    if (aoAB) {
      await page.evaluate(() => window.__engine.post.setAoScale(1));
      const f1 = await page.evaluate(() => window.__fc);
      await page.waitForFunction((n) => window.__fc >= n, f1 + 12, { timeout: 900000, polling: 250 });
      const p1 = `${out}_ao1/${s.name}.jpg`;
      mkdirSync(`${out}_ao1`, { recursive: true });
      await page.screenshot({ path: p1, type: 'jpeg', quality: 90, timeout: 300000 });
      await page.evaluate(() => window.__engine.post.setAoScale(0.5));
    }
  }
} catch (e) {
  console.error('r17_cmp failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
