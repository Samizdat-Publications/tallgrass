// In-engine capture: starts a private Vite dev server, opens a page in headless Chromium
// on the real GPU (WebGL2 via ANGLE D3D11), waits for the page to report ready, and saves PNGs.
// Never uses OS screen grabs, so the owner's screensaver doesn't matter.
//
// Usage:
//   node tools/capture.mjs --page /dev/grass.html --out scratch/grass.png
//     [--size 1600x900] [--wait 4000] [--shots 1] [--interval 1000]
//     [--query "seed=3&cam=wide"] [--eval "window.__cam?.('wide')"] [--timeout 60000] [--video out.webm --video-seconds 20]
//
// Page contract (optional): set window.__ready = true when the first good frame is drawn.
// Page console errors are printed so broken builds are visible.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? argv[i + 1] : d;
};
// Git Bash rewrites '/dev/x.html' into 'C:/Program Files/Git/dev/x.html'; undo that and accept 'dev/x.html'.
const page = '/' + arg('page', '/').replace(/^[A-Za-z]:\/Program Files\/Git\//, '').replace(/^\/+/, '');
const out = arg('out', 'scratch/capture.png');
const [w, h] = arg('size', '1600x900').split('x').map(Number);
const wait = Number(arg('wait', 4000));
const shots = Number(arg('shots', 1));
const interval = Number(arg('interval', 1000));
const query = arg('query', '');
const evalJs = arg('eval', '');
const timeout = Number(arg('timeout', 90000));
const video = arg('video', '');
const videoSeconds = Number(arg('video-seconds', 0));

const killTimer = setTimeout(() => {
  console.error('capture: hard timeout, exiting');
  process.exit(2);
}, timeout + 30000);

const GPU_ARGS = [
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--use-angle=d3d11',
  '--enable-unsafe-webgpu',
];

const port = 5300 + Math.floor(Math.random() * 600);
const server = await createServer({
  configFile: resolve('vite.config.ts'),
  server: { port, strictPort: false, hmr: false },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const url = base + page + (query ? (page.includes('?') ? '&' : '?') + query : '');

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
let exitCode = 0;
try {
  const ctxOpts = { viewport: { width: w, height: h }, deviceScaleFactor: 1 };
  if (video) {
    mkdirSync(dirname(video), { recursive: true });
    ctxOpts.recordVideo = { dir: dirname(video), size: { width: w, height: h } };
  }
  const ctx = await browser.newContext(ctxOpts);
  const pg = await ctx.newPage();
  pg.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}] ${m.text().slice(0, 400)}`);
  });
  pg.on('pageerror', (e) => console.log(`[page exception] ${e.message.slice(0, 400)}`));
  await pg.goto(url, { waitUntil: 'load', timeout });
  const gl = await pg.evaluate(() => {
    try {
      const c = document.createElement('canvas').getContext('webgl2');
      const e = c.getExtension('WEBGL_debug_renderer_info');
      return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
    } catch (e) {
      return 'no webgl2';
    }
  });
  if (!/NVIDIA/i.test(gl)) console.log('WARNING: not rendering on the NVIDIA GPU:', gl);
  try {
    await pg.waitForFunction(() => window.__ready === true, null, { timeout: Math.min(timeout, 60000) });
  } catch {
    console.log('note: window.__ready never became true; capturing anyway');
  }
  if (evalJs) await pg.evaluate(evalJs);
  await pg.waitForTimeout(wait);
  mkdirSync(dirname(out), { recursive: true });
  for (let s = 0; s < shots; s++) {
    const p = shots === 1 ? out : out.replace(/(\.\w+)$/, `_${String(s + 1).padStart(2, '0')}$1`);
    await pg.screenshot({ path: p });
    console.log('saved', p);
    if (s < shots - 1) await pg.waitForTimeout(interval);
  }
  if (video && videoSeconds > 0) await pg.waitForTimeout(videoSeconds * 1000);
  const fps = await pg.evaluate(() => window.__fps ?? null);
  if (fps !== null) console.log('page fps:', fps);
  await ctx.close();
  if (video) {
    const vpath = await pg.video()?.path();
    if (vpath) {
      renameSync(vpath, video);
      console.log('saved video', video);
    }
  }
} catch (e) {
  console.error('capture failed:', e.message);
  exitCode = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(killTimer);
}
process.exit(exitCode);
