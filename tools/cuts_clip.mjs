// r-cuts: record a documentary-mode clip from the real game and log a frame-by-frame luma series with the cuts marked.
// node tools/cuts_clip.mjs --out scratch/cuts/after --query "cuts=1" [--secs 60] [--size 960x540] [--video 1]
// Writes <out>.json ({frames: [t, luma, cutCount, shotId, dip, renderMs]}) and, with --video 1, <out>.webm. Chromium on the GPU, under a timeout.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, renameSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/cuts/clip'));
const query = arg('query', '');
const secs = Number(arg('secs', '60'));
const [W, H] = arg('size', '960x540').split('x').map(Number);
const video = arg('video', '1') === '1';
const cMode = arg('director', '1') === '1';

const kill = setTimeout(() => { console.error('cuts_clip: hard timeout'); process.exit(2); }, (secs + 240) * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache_cuts'), server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const tmpDir = resolve('scratch/_cuts_tmp_' + Math.floor(Math.random() * 1e6));
mkdirSync(tmpDir, { recursive: true });
let code = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(video ? { recordVideo: { dir: tmpDir, size: { width: W, height: H } } } : {}) });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || /shader|GLSL|THREE\.WebGL/i.test(m.text())) console.log('[console ' + m.type() + ']', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0&title=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const eng = window.__engine, dir = window.__director;
    const orig = eng.post.render.bind(eng.post);
    const gl = eng.renderer.getContext();
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const ids = new WeakMap(); let nid = 0;
    window.__frames = [];
    eng.cam.debugLog = [];
    const t0 = performance.now();
    eng.post.render = (dt) => {
      const a = performance.now();
      orig(dt);
      gl.finish();
      const ms = performance.now() - a;
      c2.drawImage(eng.renderer.domElement, 0, 0, 32, 18);
      const d = c2.getImageData(0, 0, 32, 18).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const cur = dir.current;
      if (cur && !ids.has(cur)) ids.set(cur, ++nid);
      window.__frames.push([+((performance.now() - t0) / 1000).toFixed(3), +(s / (d.length / 4) / 255).toFixed(4), eng.cam.cutCount, cur ? ids.get(cur) : 0, +eng.cutFx.level.toFixed(3), +ms.toFixed(2)]);
    };
  });
  if (cMode) await page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))");
  await page.waitForTimeout(secs * 1000);
  const frames = await page.evaluate('window.__frames');
  const camlog = await page.evaluate('window.__engine.cam.debugLog');
  writeFileSync(out + '.cam.json', JSON.stringify({ stride: 11, log: camlog }));
  const kinds = await page.evaluate('(window.__director.stats && window.__director.stats.log) || []');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out + '.json', JSON.stringify({ query, secs, size: [W, H], frames, kinds }));
  await ctx.close();
  if (video) {
    const f = readdirSync(tmpDir).find((n) => n.endsWith('.webm'));
    if (f) renameSync(resolve(tmpDir, f), out + '.webm');
  }
  console.log('frames', frames.length, 'cuts', new Set(frames.map((r) => r[2])).size - 1);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  rmSync(tmpDir, { recursive: true, force: true });
  clearTimeout(kill);
}
process.exit(code);
