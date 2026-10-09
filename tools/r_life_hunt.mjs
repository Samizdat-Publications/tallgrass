// r-life: wait (at 10x) for a wolf to start a chase in the real sim, then follow it at 1x and capture a burst of frames across the takedown and the feeding.
// Usage: node tools/r_life_hunt.mjs --out review/wip/r-life/hunt_before [--n 40] [--gap 600] [--rain 0] [--day 0.62] [--dist 20] [--pitch 14]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/r_life_hunt');
const N = Number(arg('n', 40)), GAP = Number(arg('gap', 600));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const day = Number(arg('day', 0.62)), rain = Number(arg('rain', 0));
const dist = Number(arg('dist', 20)), pitch = Number(arg('pitch', 14));

const kill = setTimeout(() => { console.error('r_life_hunt: hard timeout'); process.exit(2); }, 30 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_life') });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => {
    const e = window.__engine;
    window.__envO = { season: 1.8, weather: ${rain > 0 ? 1 : 0}, warmth: 0.7, rain: ${rain}, dayFrac: ${day} };
    e.onFrame(() => e.setEnv(window.__envO)); e.setEnv(window.__envO); e.applyEnvNow();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    window.__followId(null); window.__speed(10);
  })()`);
  // wait for a chase whose wolf is near a grazer (the camera follows the wolf)
  let id = null;
  for (let k = 0; k < 600 && id === null; k++) {
    await page.waitForTimeout(500);
    id = await page.evaluate('(() => { const c = window.__find(1, 5); return c.length ? c[0] : null; })()');
  }
  console.log('chase found, wolf id', id);
  await page.evaluate(`window.__speed(1); window.__followId(${id}); window.__engine.cam.setView({ distance: ${dist}, pitchDeg: ${pitch} });`);
  mkdirSync(out, { recursive: true });
  for (let i = 0; i < N; i++) {
    const p = `${out}/hunt_${String(i).padStart(2, '0')}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90, timeout: 150000 });
    await page.waitForTimeout(GAP);
  }
  console.log('saved', N, 'frames to', out);
} catch (e) {
  console.error('r_life_hunt failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
