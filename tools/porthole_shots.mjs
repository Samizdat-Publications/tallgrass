// Porthole / canopy stills (r-regress): put the camera 35 to 60 m from a cottonwood crown, look at the tree's foot from several yaws,
// and write JPEG stills (q88). The black "sphere" of the round-18 reel sits at the centre of the frame where the canopy porthole is.
//
//   node tools/porthole_shots.mjs --out dir [--query "p=dynamicTrees:0"] [--fade 0|1] [--dist 40] [--root dir]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'scratch/rg/porthole'));
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('porthole_shots: hard timeout'); process.exit(2); }, 9 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_porthole'),
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
  await page.waitForTimeout(1500);
  const fade = arg('fade', '');
  if (fade !== '') await page.evaluate((f) => { window.__engine.occlusionFade = f === '1'; }, fade);
  const dist = Number(arg('dist', '40'));
  // the middle of the densest cottonwood grove (as tools/camstills.mjs finds it)
  const tree = await page.evaluate(() => {
    const e = window.__engine, trees = [];
    for (let id = 0; id < 4000; id++) { const s = e.trees.getTree(id); if (s && !s.far && s.species !== 'juniper') trees.push(s); }
    const dens = trees.map((a) => ({ x: a.x, z: a.z, n: trees.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 28).length }));
    dens.sort((a, b) => b.n - a.n);
    return dens[0];
  });
  console.log('tree', JSON.stringify(tree));
  if (arg('sweep', '') === '1') {
    // focus at the foot of the grove, camera outside the crowns at --dist, 8 yaws: where does the dark disc show?
    for (let yaw = 0; yaw < 360; yaw += 45) {
      await page.evaluate(([t, yaw, dist]) => { window.__followId(null); window.__engine.cam.setCinematic(false); window.__engine.cam.setView({ x: t.x, y: t.z, yawDeg: yaw, pitchDeg: 17, distance: dist }, true); }, [tree, yaw, dist]);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: resolve(out, `sweep_yaw${yaw}.jpg`), type: 'jpeg', quality: 88 });
    }
    console.log('shots in', out, 'errors:', errors.length);
    await ctx.close(); await browser.close(); await server.close(); clearTimeout(kill); process.exit(0);
  }
  await page.evaluate(() => window.__speed(1));
  for (const yaw of [0, 90, 180, 270]) {
    await page.evaluate(([t, yaw, dist]) => { window.__followId(null); window.__engine.cam.setCinematic(false); window.__engine.cam.setView({ x: t.x, y: t.z, yawDeg: yaw, pitchDeg: 14, distance: dist }, true); }, [tree, yaw, dist]);
    await page.waitForTimeout(1500);
    console.log(yaw, JSON.stringify(await page.evaluate(() => { const c = window.__engine.cam, p = window.__engine.camera.position; return { d: c.distance, yaw: c.yawDeg, f: c.getFocus().toArray(), p: p.toArray(), aut: c.isCinematic?.() }; })));
    await page.screenshot({ path: resolve(out, `yaw${yaw}.jpg`), type: 'jpeg', quality: 88 });
  }
  console.log('shots in', out, 'errors:', errors.length);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(0);
