// Round 13 snow-grass stills: low views of the blade layer under patchy snow, deep snow and falling snow, JPEG q90.
//   node tools/r13_snowgrass.mjs --out review/wip/round13/snowgrass --tag after [--size 1600x900] [--only name,name]
// The snow amount is forced through the engine's smoothed snow (e.sm.snow) so each view has a known depth: early winter with the
// seasonal pack only (season 3.35, patchy), deep (sm.snow = 1), and deep with flakes in the air.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/round13/snowgrass'));
const tag = arg('tag', 'now');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const only = arg('only', '').split(',').filter(Boolean);
const kill = setTimeout(() => { console.error('r13_snowgrass: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/.vitecache-r13sg'),
  server: { port: 5900 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
// name, season, dayFrac, weather, forced snow (-1 = seasonal pack only), flakes, camera distance, pitch, lift, yaw offset
const VIEWS = [
  ['patchy_low', 3.35, 0.4, 0, -1, 0, 9, 5, 0.7, 0],
  ['patchy_mid', 3.35, 0.4, 0, -1, 0, 20, 7, 1.4, 40],
  ['deep_low', 3.3, 0.4, 4, 1, 0, 9, 5, 0.7, 0],
  ['deep_mid', 3.3, 0.4, 4, 1, 0, 22, 8, 1.5, 35],
  ['falling_low', 3.2, 0.38, 4, 1, 1, 12, 5, 0.9, 0],
  ['thin_low', 3.2, 0.4, 4, 0.35, 0, 9, 5, 0.7, 0],
  ['dawn_frost_low', 3.2, 0.26, 0, -1, 0, 9, 5, 0.7, 0],
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
  await page.evaluate(() => { window.__speed(0); window.__engine.setEnv = () => {}; });
  for (const [name, season, day, weather, snow, flakes, dist, pitch, lift, yawOff] of VIEWS) {
    await page.evaluate(({ season, day, weather, snow, flakes, dist, pitch, lift, yawOff }) => {
      const e = window.__engine;
      Object.assign(e.env, { dayFrac: day, season, weather, rain: 0, windStrength: 0.3 });
      e.sm.snow = snow < 0 ? 0 : snow;
      if (weather !== 4) e.sm.snow = 0;
      e.snowfallSm = flakes ? 1 : 0;
      e.applyEnvNow();
      e.cam.preset('low', true);
      e.cam.goal.lift = lift;
      e.cam.setView({ distance: dist, pitchDeg: pitch, yawDeg: e.cam.yawDeg + yawOff }, true);
      for (let i = 0; i < 8; i++) { e.sm.snow = weather === 4 ? snow : 0; e.renderOnce(0.016); }
    }, { season, day, weather, snow, flakes, dist, pitch, lift, yawOff });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => { const e = window.__engine; for (let i = 0; i < 4; i++) e.renderOnce(0.016); return { snowU: +e.uniforms.snow.value.toFixed(3), frost: +e.uniforms.frost.value.toFixed(3) }; });
    const p = `${out}/${tag}_${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
    console.log('saved', p, JSON.stringify(info));
  }
} catch (e) {
  console.error('r13_snowgrass failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'CONSOLE/PAGE ERRORS:\n' + uniq.join('\n') : 'no console errors or warnings');
process.exit(code);
