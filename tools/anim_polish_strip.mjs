// Gallop strip of a chasing wolf (or any dev-page role) on the real GPU: dev/animals.html in manual mode, stepped on a virtual clock.
//   node tools/anim_polish_strip.mjs [--out review/wip/anim-polish/after] [--tag wolf] [--cam wolf] [--frames 8] [--every 2] [--az 90] [--dist 6.5] [--el 8]
// Takes `frames` stills `every` virtual frames (1/60 s) apart after a warm-up, then tiles them into <tag>_strip.jpg (JPEG q88).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/anim-polish/after'));
const tag = arg('tag', 'wolf');
const cam = arg('cam', 'wolf');
const frames = Number(arg('frames', 8));
const every = Number(arg('every', 2));
const az = arg('az', '90'), dist = arg('dist', '6.5'), el = arg('el', '8');
const warm = Number(arg('warm', 90));
const kill = setTimeout(() => { console.error('strip: hard timeout'); process.exit(2); }, 14 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 600)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 600)); });
  await page.goto(`${base}/dev/animals.html?cam=${cam}&manual=1&solo=${arg("solo", "")}&az=${az}&dist=${dist}&el=${el}`, { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction(() => typeof window.__advance === 'function', null, { timeout: 400000 });
  mkdirSync(out, { recursive: true });
  for (let i = 0; i < warm; i++) await page.evaluate(() => window.__advance(1 / 60));
  const files = [];
  for (let k = 0; k < frames; k++) {
    for (let i = 0; i < every; i++) await page.evaluate(() => window.__advance(1 / 60));
    const f = `${out}/${tag}_f${k}.jpg`;
    await page.screenshot({ path: f, type: 'jpeg', quality: 88 });
    files.push(f);
  }
  const cols = Math.min(4, frames);
  const rows = Math.ceil(frames / cols);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', `${out}/${tag}_f%d.jpg`, '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', `${out}/${tag}_strip.jpg`]);
  console.log('saved', `${out}/${tag}_strip.jpg`);
} catch (e) {
  console.error('strip failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
