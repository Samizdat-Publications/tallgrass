// Showcase take: records the documentary camera with the interface hidden (no HUD, no captions or title cards) as a high-quality
// clip for the landing page and the hub. Uses the DevTools screencast (JPEG frames with timestamps) instead of Playwright's
// recordVideo, which encodes at a low bitrate; the frames are then assembled at a constant frame rate with ffmpeg.
// Headless Chromium on the real GPU, never an OS screen grab.
//
// Usage: node tools/showcase_take.mjs --out scratch/take1 [--seconds 120] [--size 1920x1080] [--query "seed=tallgrass"] [--fps 30] [--keys c,h] [--eval js]
// Writes <out>/frames/*.jpg, <out>/take.mp4 (H.264, CRF 18) and <out>/contact.jpg (one frame every 5 s, labelled by time).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/take'));
const seconds = Number(arg('seconds', '120'));
const fps = Number(arg('fps', '30'));
const query = arg('query', '');
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
// --keys "c,h" (default): documentary camera on, interface hidden. --keys "" with --eval "<js>" films a scripted view instead
// (for example following one animal with its card open: --keys "" --eval "...__followId(id); __select(id)").
const keys = arg('keys', 'c,h').split(',').filter(Boolean);
const evalJs = arg('eval', '');
const loadTimeout = 240000;

rmSync(out, { recursive: true, force: true });
mkdirSync(out + '/frames', { recursive: true });
const kill = setTimeout(() => { console.error('showcase_take: hard timeout'); process.exit(2); }, (seconds + 900) * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  // lens=0: no film grain or colour fringe (grain turns to mush in a compressed clip)
  await page.goto(base + '/index.html?autoscale=0&autocam=0&lens=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: loadTimeout });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: loadTimeout });
  await page.waitForTimeout(1500);
  // documentary camera on (cinematic mode), then hide the whole interface, captions and title cards included
  for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(400); }
  if (evalJs) await page.evaluate(evalJs);
  await page.waitForTimeout(3000);

  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const n = frames.length;
    const name = `f${String(n).padStart(6, '0')}.jpg`;
    writeFileSync(`${out}/frames/${name}`, Buffer.from(f.data, 'base64'));
    frames.push({ name, t: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    await page.waitForTimeout(5000);
    console.log(`t=${Math.round((Date.now() - t0) / 1000)} s, ${frames.length} frames`);
  }
  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(500);
  if (frames.length < 10) throw new Error('too few frames: ' + frames.length);

  // constant frame rate: each output frame shows the latest captured frame at that time
  const start = frames[0].t;
  const end = frames[frames.length - 1].t;
  const total = Math.floor((end - start) * fps);
  const lines = ['ffconcat version 1.0'];
  let k = 0;
  for (let i = 0; i < total; i++) {
    const tt = start + i / fps;
    while (k + 1 < frames.length && frames[k + 1].t <= tt) k++;
    lines.push(`file 'frames/${frames[k].name}'`, `duration ${(1 / fps).toFixed(6)}`);
  }
  writeFileSync(`${out}/list.ffconcat`, lines.join('\n') + '\n');
  const realFps = (frames.length / (end - start)).toFixed(1);
  console.log(`captured ${frames.length} frames over ${(end - start).toFixed(1)} s (${realFps} fps), writing ${total} frames at ${fps} fps`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${out}/list.ffconcat`, '-r', String(fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${out}/take.mp4`], { stdio: 'inherit' });
  // contact sheet: one frame every 5 s with its time
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', `${out}/take.mp4`, '-vf', "fps=1/5,scale=384:-1,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5,tile=5x" + Math.ceil(seconds / 25), '-frames:v', '1', `${out}/contact.jpg`], { stdio: 'inherit' });
  console.log('wrote', `${out}/take.mp4`, 'and contact.jpg');
} catch (e) {
  console.error('showcase_take failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
