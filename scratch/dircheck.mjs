// Documentary director check: log camera focus, distance and yaw twice a second for 60 s of cinematic mode.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const kill = setTimeout(() => { console.error('hard timeout'); process.exit(2); }, 240000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 6700 + Math.floor(Math.random() * 200), hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 200)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 200000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 200000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })));
  let prev = null;
  for (let k = 0; k < 120; k++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => { const c = window.__engine.cam; const f = c.getFocus(); return { x: f.x, z: f.z, d: c.distance, y: c.yawDeg }; });
    const jump = prev ? Math.hypot(s.x - prev.x, s.z - prev.z) : 0;
    const flag = jump > 60 ? ' CUT' : jump > 8 ? ' glide' : '';
    console.log(`${(k / 2).toFixed(1).padStart(5)}s focus ${s.x.toFixed(0).padStart(4)},${s.z.toFixed(0).padStart(4)} dist ${s.d.toFixed(0).padStart(4)} yaw ${s.y.toFixed(0).padStart(5)} moved ${jump.toFixed(1)}${flag}`);
    prev = s;
  }
} catch (e) { console.error('check failed:', e.message); }
finally { await browser.close(); await server.close(); clearTimeout(kill); }
