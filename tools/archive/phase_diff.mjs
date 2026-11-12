// Leg-animation visibility test (r-regress). Follows one animal of a species at a set camera distance and, right before each render,
// forces the gait phase (and a walking pace) of every instance of that species to a fixed value, then takes a still per phase. The mean
// pixel difference between the stills (inside a crop around the animal, background identical because the camera is held) is how much the
// drawn legs and body change over a stride: ~0 means a static model. Run it on two checkouts (--root) to compare builds.
//
//   node tools/phase_diff.mjs --root <checkout> --species 0 --dist 35 --out scratch/rg/pd_main [--spd 1.6] [--query ...]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'scratch/rg/pd'));
const sp = Number(arg('species', '0')), dist = Number(arg('dist', '35')), spd = Number(arg('spd', '1.6')), query = arg('query', '');
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('phase_diff: hard timeout'); process.exit(2); }, 9 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_pd_' + (root.includes('base') ? 'base' : 'new')),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate('window.__speed(0)');
  await page.waitForTimeout(500);
  const wantId = Number(arg('id', '-1'));
  const id = wantId >= 0 ? wantId : await page.evaluate((sp) => { const c = window.__find(sp); return c.length ? c[0] : null; }, sp);
  console.log('following', id);
  await page.evaluate(([id, dist]) => {
    window.__followId(id); window.__engine.cam.setCinematic(false);
    window.__engine.cam.setView({ distance: dist, pitchDeg: 14, yawDeg: 90 }, true);
    window.__PH = 0; window.__SPD = 1.6;
    const A = window.__animals;
    window.__engine.onFrame(() => {
      const b = A.batches[window.__SP];
      if (!b) return;
      const g = b.gait.array;
      for (let k = 0; k < b.count; k++) { g[k * 4] = window.__PH; g[k * 4 + 1] = window.__SPD; b.gait.needsUpdate = true; }
    });
  }, [id, dist]);
  await page.evaluate(([sp, spd]) => { window.__SP = sp; window.__SPD = spd; }, [sp, spd]);
  await page.waitForTimeout(2500);
  await page.evaluate('window.__speed(0)');
  await page.waitForTimeout(800);
  for (const ph of [0, 0.25, 0.5, 0.75]) {
    await page.evaluate((ph) => { window.__PH = ph; }, ph);
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(out, `ph${String(Math.round(ph * 100)).padStart(2, '0')}.png`) });
  }
  console.log('stills in', out);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(0);
