// Record a gameplay reel from the real game (headless Chromium on the GPU, Playwright video), then mp4 via ffmpeg.
// Usage: node tools/video.mjs --out review/round-02/reel.mp4 [--size 1280x720] [--query "seed=tallgrass"]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PAGE_INSIDE, analyze, fmt } from './camlog.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/reel.mp4');
const query = arg('query', '');
const camlog = arg('camlog', '');
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

// --set v2: a hunt-heavy timeline for the life-and-motion review (R1 gate): close follow of a chasing wolf, a kill, ravens
const V2 = [
  [4, 'window.__speed(1); window.__focusHerd(); window.__engine.cam.setView({ distance: 45, pitchDeg: 18 })'],
  [6, 'window.__speed(10)'],
  [22, "window.__speed(1); (() => { const c = window.__find(1, 5).concat(window.__find(1, 10)).concat(window.__find(1)); if (c.length) { window.__followId(c[0]); window.__engine.cam.setView({ distance: 28, pitchDeg: 16 }); } })()"],
  [20, "(() => { const c = window.__find(1, 6).concat(window.__find(1, 5)); if (c.length) { window.__followId(c[0]); window.__engine.cam.setView({ distance: 22, pitchDeg: 20 }); } })()"],
  [14, "(() => { const r = window.__find(2, 6).concat(window.__find(2)); if (r.length) { window.__followId(r[0]); window.__engine.cam.setView({ distance: 18, pitchDeg: 18 }); } })()"],
  [14, "window.__followId(null); (() => { const p = window.__find(3); if (p.length) { window.__followId(p[0]); window.__engine.cam.setView({ distance: 35, pitchDeg: 14 }); } })()"],
  [16, "window.__followId(null); window.__concept && window.__concept(); window.__speed(1)"],
  [14, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })); window.__speed(10)"],
];
if (arg('set', '') === 'v2') SEGMENTS.splice(0, SEGMENTS.length, ...V2);
// --set breath (v10): the documentary camera at 1x and 10x, then a long 100x stretch with the graph open, so the wet and dry
// decades (climate band, grass colour, herd swells) are on screen; then the wide view at 100x without the graph
const BREATH = [
  [4, 'window.__speed(1); window.__focusHerd()'],
  [30, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))"],
  [20, 'window.__speed(10)'],
  [2, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })); window.__cam('wide')"],
  [45, "window.__speed(100); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))"],
  [16, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })); window.__cam('wide')"],
];
if (arg('set', '') === 'breath') SEGMENTS.splice(0, SEGMENTS.length, ...BREATH);

const kill = setTimeout(() => { console.error('video: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
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
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  const t0 = Date.now();
  // --camlog file.json: log the camera path every frame and, at the end, count the frames inside a tree crown and the jerk (tools/camlog.mjs)
  if (camlog) await page.evaluate('window.__engine.cam.debugLog = []');
  for (const [secs, js] of SEGMENTS) {
    if (js) await page.evaluate(js);
    await page.waitForTimeout(secs * 1000);
  }
  if (camlog) {
    const log = await page.evaluate('window.__engine.cam.debugLog');
    const inside = await page.evaluate(`(${PAGE_INSIDE})(0.9)`);
    mkdirSync(dirname(camlog), { recursive: true });
    writeFileSync(camlog, JSON.stringify({ stride: 11, log, inside }));
    console.log('camera path:\n' + fmt(analyze(log)));
    console.log(`inside a tree crown: ${inside.inside} of ${inside.frames} frames`, JSON.stringify(inside.byKind), 'in a willow thicket:', inside.inThicket ?? 0, 'min height above ground:', inside.minClear.toFixed(2), 'min boom:', inside.minBoom.toFixed(2), 'max swing deg:', inside.maxSwing.toFixed(0), 'last-resort pushes:', inside.pushes, inside.insideFrames.slice(0, 12).join(' '));
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
