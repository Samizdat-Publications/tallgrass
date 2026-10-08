// Regression stills (r-regress): follow an animal of a species at a given distance and write N consecutive JPEG stills (q88), so leg
// motion and slope pitch can be compared by eye between builds; also a documentary-style first shot (the reel's opening) with --reel.
//
//   node tools/regress_shots.mjs --out review/wip/regress/x --species 1 [--state 5] [--dist 22] [--n 4] [--gap 120] [--query "p=dynamicTrees:0"] [--root dir]
//   node tools/regress_shots.mjs --out dir --reel [--at 4,8,12]     (the first segments of tools/video.mjs, stills at those seconds)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'scratch/rg/shots'));
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('regress_shots: hard timeout'); process.exit(2); }, 9 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_regress'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[page exception]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 300)); } });
  const query = arg('query', '');
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(1000);
  const shot = async (name) => page.screenshot({ path: resolve(out, name + '.jpg'), type: 'jpeg', quality: 88 });
  if (flag('reel')) {
    const at = arg('at', '4,8,12').split(',').map(Number);
    await page.evaluate('window.__speed(1); window.__focusHerd()');
    const t0 = Date.now();
    await page.waitForTimeout(4000);
    await page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))");
    for (const t of at) {
      const wait = t * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      await shot('reel_' + String(t).padStart(2, '0'));
    }
  } else {
    const sp = Number(arg('species', '1')), st = arg('state', '');
    const dist = Number(arg('dist', '22')), n = Number(arg('n', '4')), gap = Number(arg('gap', '120'));
    await page.evaluate('window.__speed(1)');
    let id = null;
    for (let i = 0; i < 90 && id === null; i++) {
      id = await page.evaluate(([sp, st]) => { const c = st === '' ? window.__find(sp) : window.__find(sp, Number(st)); return c.length ? c[0] : null; }, [sp, st]);
      if (id === null) await page.waitForTimeout(1000);
    }
    if (id === null) id = await page.evaluate((sp) => window.__find(sp)[0], sp);
    await page.evaluate(([id, dist]) => { window.__followId(id); window.__engine.cam.setView({ distance: dist, pitchDeg: 13, yawDeg: 40 }, true); }, [id, dist]);
    await page.waitForTimeout(2500);
    for (let k = 0; k < n; k++) { await shot('follow_' + k); await page.waitForTimeout(gap); }
  }
  console.log('shots in', out, 'errors:', errors.length);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(0);
