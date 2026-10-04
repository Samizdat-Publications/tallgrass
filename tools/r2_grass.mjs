// R2 item 9 stills: grass close-ups from near the ground (3 to 15 m), JPEG q90: late summer and autumn, backlit, noon and sunset.
//   node tools/r2_grass.mjs --out review/wip/R2/grass [--dir <projectDir>] [--size 1600x900] [--only name,name] --single
// --single: one shot per view tagged "now" (the build as it is). Without it the script tries to toggle the TG_DETAIL define on the blade
// materials for a before and after pair; that temporary toggle only existed while the grass detail was being benchmarked (the
// before/after set in review/wip/R2/grass was taken with it), so use --single now.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R2/grass'));
const dir = resolve(arg('dir', '.'));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const only = arg('only', '').split(',').filter(Boolean);
const single = argv.includes('--single');
if (!existsSync(resolve(dir, 'index.html'))) throw new Error('no index.html in ' + dir);
const req = createRequire(resolve(dir, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
process.chdir(dir);
const kill = setTimeout(() => { console.error('r2_grass: hard timeout'); process.exit(2); }, 14 * 60 * 1000);
const server = await vite.createServer({
  root: dir, configFile: resolve(dir, 'vite.config.ts'), cacheDir: resolve(dir, 'node_modules/.vite-r2g'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let code = 0;
const errors = [];
// name, season, dayFrac, camera distance (m), pitch (deg), lift (m), yaw offset from the sun-facing preset (deg)
const VIEWS = [
  ['ls_backlit_3m', 1.8, 0.28, 3, 6, 0.5, 0],
  ['ls_backlit_7m', 1.8, 0.28, 7, 4, 0.5, 0],
  ['ls_backlit_12m', 1.8, 0.28, 12, 5, 0.6, -8],
  ['ls_backlit_15m', 1.8, 0.28, 15, 6, 0.7, 10],
  ['autumn_backlit_7m', 2.6, 0.28, 7, 4, 0.5, 0],
  ['autumn_backlit_12m', 2.6, 0.28, 12, 5, 0.6, 6],
  ['autumn_noon_7m', 2.6, 0.5, 7, 5, 0.6, 180],
  ['winter_dusk_low', 3.1, 0.7, 16, 5, 1.2, 0],
  ['winter_dusk_7m', 3.1, 0.7, 7, 4, 0.5, 0],
  ['autumn_late_dusk_low', 2.8, 0.7, 16, 5, 1.2, 0],
  ['ls_noon_8m', 1.8, 0.5, 8, 5, 0.6, 180],
  ['autumn_sunset_9m', 2.6, 0.7, 9, 4, 0.5, 0],
].filter((v) => !only.length || only.includes(v[0]));
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[console.' + m.type() + '] ' + m.text().slice(0, 400)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  await page.evaluate(() => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    window.__setDetail = (on) => {
      e.scene.traverse((o) => {
        if (o.name !== 'GrassField') return;
        o.traverse((m) => { if (m.isMesh) { if (on) m.material.defines.TG_DETAIL = ''; else delete m.material.defines.TG_DETAIL; m.material.needsUpdate = true; } });
      });
    };
  });
  for (const [name, season, day, dist, pitch, lift, yawOff] of VIEWS) {
    await page.evaluate(({ season, day, dist, pitch, lift, yawOff }) => {
      const e = window.__engine;
      Object.assign(e.env, { dayFrac: day, season, weather: 0, rain: 0 });
      e.applyEnvNow();
      e.cam.preset('low', true);
      e.cam.goal.lift = lift;
      e.cam.setView({ distance: dist, pitchDeg: pitch, yawDeg: e.cam.yawDeg + yawOff }, true);
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
    }, { season, day, dist, pitch, lift, yawOff });
    for (const tag of single ? ['now'] : ['before', 'after']) {
      if (!single) await page.evaluate((on) => { window.__setDetail(on); for (let i = 0; i < 6; i++) window.__engine.renderOnce(0.016); }, tag === 'after');
      await page.waitForTimeout(400);
      await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__engine.renderOnce(0.016); });
      const p = `${out}/${tag}_${name}.jpg`;
      await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
      console.log('saved', p);
    }
  }
} catch (e) {
  console.error('r2_grass failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'CONSOLE/PAGE ERRORS:\n' + uniq.join('\n') : 'no console errors or warnings');
process.exit(code);
