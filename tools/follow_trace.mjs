// Follow-camera trace (r-readable): follow a moving animal and print where it sits on screen every 250 ms.
//   node tools/follow_trace.mjs [--species 3] [--state 4] [--secs 12] [--root dir]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const sp = Number(arg('species', '3')), st = Number(arg('state', '4')), secs = Number(arg('secs', '12'));
const kill = setTimeout(() => process.exit(2), 8 * 60 * 1000);
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_readable'),
  server: { port: 6500 + Math.floor(Math.random() * 400), hmr: false, fs: { strict: false }, watch: { ignored: ['**/*'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[exception]', e.message.slice(0, 200)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(1000);
  let id = null;
  await page.evaluate('window.__speed(10)');
  for (let i = 0; i < 150 && id === null; i++) { id = await page.evaluate(([sp, st]) => window.__find(sp, st)[0] ?? null, [sp, st]); if (id === null) await page.waitForTimeout(300); }
  await page.evaluate((id) => { window.__speed(1); window.__engine.cam.preset('wide', true); window.__select(id); window.__followId(id); }, id);
  console.log('id', id);
  const t0 = Date.now();
  for (let k = 0; k < secs * 4; k++) {
    const r = await page.evaluate((id) => {
      const e = window.__engine, v = e.camera.position.clone();
      if (!window.__animals.getPosition(id, v)) return null;
      const p = v.clone().project(e.camera), c = e.cam;
      return [+((p.x + 1) / 2).toFixed(2), +((1 - p.y) / 2).toFixed(2), +c.distance.toFixed(1), +c.pitchDeg.toFixed(0), +c.yawDeg.toFixed(0)];
    }, id);
    console.log(((Date.now() - t0) / 1000).toFixed(2), 'sx,sy,dist,pitch,yaw', JSON.stringify(r));
    await page.waitForTimeout(250);
  }
} finally { await browser.close(); await server.close(); clearTimeout(kill); }
process.exit(0);
