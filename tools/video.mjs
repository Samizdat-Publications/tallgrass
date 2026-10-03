// Record a gameplay reel from the real game (headless Chromium on the GPU, Playwright video), then mp4 via ffmpeg.
// Usage: node tools/video.mjs --out review/round-02/reel.mp4 [--size 1280x720] [--query "seed=tallgrass"]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/reel.mp4');
const query = arg('query', '');
const [W, H] = arg('size', '1280x720').split('x').map(Number);

// Timeline: [seconds to hold, js to run at the start of the segment]
const SEGMENTS = [
  [4, 'window.__speed(1); window.__focusHerd()'],
  [36, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))"], // documentary director, 1x
  [2, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })); window.__cam('wide')"],
  [22, 'window.__speed(10)'], // fast-forward, wide
  [3, "window.__focusHerd()"],
  [20, "window.__speed(100); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))"], // years fly by with the graph
  [9, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })); window.__speed(10); window.__cam('wide'); window.__overlay?.setMode('territory')"], // wolf territories shifting
  [12, "window.__overlay?.setMode('none'); window.__speed(1); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))"],
];

const kill = setTimeout(() => { console.error('video: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const tmpDir = resolve('scratch/_video_tmp');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
let code = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: tmpDir, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html' + (query ? '?' + query : ''), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  const t0 = Date.now();
  for (const [secs, js] of SEGMENTS) {
    if (js) await page.evaluate(js);
    await page.waitForTimeout(secs * 1000);
  }
  const lead = (t0 - Date.now()) / 1000; // unused, kept for clarity
  const video = page.video();
  await ctx.close();
  const webm = await video.path();
  mkdirSync(dirname(out), { recursive: true });
  // trim the loading time off the front: keep the last N seconds
  const total = SEGMENTS.reduce((s, [d]) => s + d, 0);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', `-${total}`, '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '30', out]);
  console.log('saved', out, `(${total} s)`, lead ? '' : '');
} catch (e) {
  console.error('video failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
