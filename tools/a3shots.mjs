// a3 spike: before/after stills of one species at set distances and poses on the dev lineup page (dev/animals.html), a3 off and on.
//
//   node tools/a3shots.mjs --out review/wip/a3-spike/lab [--sp bison,wolf] [--poses idle,walk,run,graze,rest] [--dists 8,20,45] [--modes 0,1]
//                          [--az 100] [--el 8] [--size 1280x720] [--wait 2600]
// Writes <out>/<sp>_<pose>_<d>m_<off|a3>.jpg (JPEG quality 90). Headless Chromium on the GPU; always run under a timeout.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'review/wip/a3-spike/lab'));
const sps = arg('sp', 'bison,wolf').split(',');
const poses = arg('poses', 'idle,graze,rest,walk,run').split(',');
const dists = arg('dists', '8,20,45').split(',').map(Number);
const modes = arg('modes', '0,1').split(',');
const az = Number(arg('az', '100')), el = Number(arg('el', '8'));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const wait = Number(arg('wait', '2600'));
const fov = Number(arg('fov', '30'));
const SPNUM = { bison: 0, wolf: 1 };
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('a3shots: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_a3shots'),
  server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  for (const sp of sps) {
    for (const mode of modes) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 240)); });
      await page.goto(`${base}/dev/animals.html?cam=lineup&only=${sp}&focus=${SPNUM[sp]}&a3=${mode}&az=${az}&el=${el}&dist=20&fov=${fov}`, { waitUntil: 'load', timeout: 240000 });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
      for (const pose of poses) {
        for (const d of dists) {
          const move = pose === 'walk' || pose === 'run';
          await page.evaluate(([p, dd, a, e, f, mv, yoff]) => window.__lab({ pose: p, dist: dd, az: a, el: e, focus: f, move: mv, yoff, reset: true }), [pose, d, az, el, String(SPNUM[sp]), move, 0.6]);
          await page.waitForTimeout(wait);
          const name = `${sp}_${pose}_${String(d).padStart(2, '0')}m_${mode === '0' ? 'off' : 'a3'}.jpg`;
          await page.screenshot({ path: resolve(out, name), type: 'jpeg', quality: 90 });
          console.log('saved', name);
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
