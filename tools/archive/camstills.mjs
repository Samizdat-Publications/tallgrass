// Stills of the camera among the groves (R15 camera pass), JPEG q90, from the real game in headless Chromium on the GPU.
// The camera circles one grove at 24 m (the same scenario as tools/camtest.mjs orbit). Pass 1 (--find) records the frames where the camera
// is inside a tree crown; pass 2 (--frames file.json) photographs those same moments, so the same build can be compared with an older one.
//   node tools/camstills.mjs --find review/wip/cam/inside-frames.json              (on the build to compare against: lists its clipping moments)
//   node tools/camstills.mjs --frames review/wip/cam/inside-frames.json --out review/wip/cam/after --prefix after
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PAGE_INSIDE } from './camlog.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const findOut = arg('find', '');
const framesIn = arg('frames', '');
const outDir = arg('out', 'review/wip/cam');
const prefix = arg('prefix', 'cam');
const groveIdx = Number(arg('grove', '4'));
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const kill = setTimeout(() => { console.error('camstills: hard timeout'); process.exit(2); }, 6 * 60 * 1000);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.evaluate(() => { window.__speed(0); });
  await page.waitForTimeout(500);
  // the scenario, step by step in the page: setup() leaves the camera at the start; step(i) advances to frame i (60 Hz)
  await page.evaluate((groveIdx) => {
    const e = window.__engine, cam = e.cam, DT = 1 / 60;
    const trees = [];
    for (let id = 0; id < 4000; id++) { const s = e.trees.getTree(id); if (s && !s.far && s.species !== 'juniper') trees.push(s); }
    const dens = trees.map((a) => ({ x: a.x, y: a.z, n: trees.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 28).length }));
    dens.sort((a, b) => b.n - a.n);
    const groves = [];
    for (const d of dens) { if (groves.length >= 6) break; if (groves.every((g) => Math.hypot(g.x - d.x, g.y - d.y) > 70)) groves.push(d); }
    const g = groves[groveIdx];
    window.__cs = { frame: 0, DT, g };
    cam.follow(null); cam.setCinematic(false);
    cam.setView({ x: g.x, y: g.y, distance: 24, pitchDeg: 15, yawDeg: 0 }, true);
    for (let i = 0; i < 30; i++) cam.update(DT);
    window.__csStep = (n) => { const c = window.__cs; while (c.frame < n) { cam.setView({ yawDeg: c.frame * DT * 0.55 * 180 / Math.PI }); cam.update(DT); c.frame++; } };
  }, groveIdx);
  const total = Math.round(22 / (1 / 60));
  if (findOut) {
    // walk the whole circle, noting the frames inside a crown
    const frames = await page.evaluate(async ({ total, src }) => {
      const e = window.__engine; e.cam.debugLog = [];
      window.__csStep(total);
      const inside = (0, eval)(`(${src})`)(0.9);
      return { insideTimes: inside.insideFrames, n: e.cam.debugLog.length / 11, t0: e.cam.debugLog[0] };
    }, { total, src: PAGE_INSIDE });
    // insideFrames are clock seconds; convert to frame index within the circle
    const idx = frames.insideTimes.map((t) => Math.round((t - frames.t0) * 60));
    writeFileSync(findOut, JSON.stringify({ grove: groveIdx, total, frames: idx }));
    console.log(`inside a crown on ${idx.length} of ${total} frames`, idx.slice(0, 20).join(' '));
  } else {
    const want = JSON.parse(readFileSync(framesIn, 'utf8'));
    // three moments spread over the clipping frames (or, with none, evenly over the circle)
    let pick = [];
    const f = want.frames;
    if (f.length >= 3) pick = [f[Math.floor(f.length * 0.1)], f[Math.floor(f.length * 0.5)], f[Math.floor(f.length * 0.9)]];
    else pick = [Math.floor(total * 0.25), Math.floor(total * 0.5), Math.floor(total * 0.75)];
    mkdirSync(outDir, { recursive: true });
    for (const n of pick) {
      await page.evaluate((n) => { window.__csStep(n); window.__engine.renderOnce(0); window.__engine.renderOnce(0); }, n);
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => { const p = window.__engine.camera.position; return { cam: [p.x, p.y, p.z].map((v) => +v.toFixed(1)) }; });
      const file = resolve(outDir, `${prefix}-orbit-frame${n}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
      console.log('shot', file, JSON.stringify(info));
    }
  }
} catch (e) {
  console.error('camstills failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
