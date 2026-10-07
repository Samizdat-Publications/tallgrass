// Documentary-camera run in the real game (headless Chromium on the GPU, real time): the director's camera is logged every frame and
// the frames with the camera inside a tree crown are counted against the real crown instances (tools/camlog.mjs), at several crown
// sizes (shrink 0.9 is the proxy the camera avoids; 1.0 and 1.05 are the visible lumps). Short: keep it under a minute or two.
//   node tools/camdoc.mjs [--secs 40] [--query "seed=tallgrass"] [--shots dir] [--world v7c|v6]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { PAGE_INSIDE } from './camlog.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const secs = Number(arg('secs', '40'));
const query = arg('query', '');
const shots = arg('shots', '');
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const kill = setTimeout(() => { console.error('camdoc: hard timeout'); process.exit(2); }, 6 * 60 * 1000);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  await page.evaluate('window.__engine.cam.debugLog = []; window.__speed(1); window.__focusHerd()');
  await page.waitForTimeout(4000);
  await page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))");
  if (shots) mkdirSync(shots, { recursive: true });
  // page side: the gap (m, approximate) between the camera and the nearest solid crown, against the real crown instances
  await page.evaluate(() => {
    const e = window.__engine, tr = e.trees;
    const M4 = e.camera.matrixWorld.constructor, V3 = e.camera.position.constructor;
    const cols = [];
    const addPool = (pool, kind) => {
      const g = pool.crownMeshes[0].geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox;
      const c = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
      const h = [(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2];
      for (let s = 0; s < pool.hi; s++) {
        if (!pool.crownOn[s]) continue;
        const m = new M4().fromArray(pool.crownMats, s * 16);
        const sc = [Math.hypot(m.elements[0], m.elements[1], m.elements[2]), Math.hypot(m.elements[4], m.elements[5], m.elements[6]), Math.hypot(m.elements[8], m.elements[9], m.elements[10])];
        cols.push({ kind, x: m.elements[12], z: m.elements[14], inv: m.clone().invert(), c, h, w: Math.min(h[0] * sc[0], h[1] * sc[1], h[2] * sc[2]) });
      }
    };
    for (const p of tr.cw) addPool(p, 'cottonwood');
    for (const p of tr.jun) addPool(p, 'juniper');
    const v = new V3();
    window.__crownGap = () => {
      const p = e.camera.position; let best = 1e9, bk = '';
      for (const k of cols) {
        const dx = k.x - p.x, dz = k.z - p.z; if (dx * dx + dz * dz > 3600) continue;
        v.copy(p).applyMatrix4(k.inv);
        const a = (v.x - k.c[0]) / k.h[0], b = (v.y - k.c[1]) / k.h[1], c = (v.z - k.c[2]) / k.h[2];
        const gap = (Math.sqrt(a * a + b * b + c * c) - 1) * k.w;
        if (gap < best) { best = gap; bk = k.kind; }
      }
      return [best, bk];
    };
  });
  let shotN = 0, minGap = 1e9; const gaps = [];
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < secs) {
    await page.waitForTimeout(120);
    const [g, kind] = await page.evaluate('window.__crownGap()');
    gaps.push(g); minGap = Math.min(minGap, g);
    if (shots && g < Number(arg('thr', '2.5')) && shotN < 8) {
      const info = await page.evaluate(() => { const p = window.__engine.camera.position; return [p.x, p.y, p.z].map((v) => +v.toFixed(1)); });
      const file = resolve(shots, `${arg('prefix', 'doc')}-${String(shotN).padStart(2, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
      console.log('shot', file, 'gap', g.toFixed(2), kind, JSON.stringify(info));
      shotN++;
      await page.waitForTimeout(1500);
    }
  }
  gaps.sort((a, b) => a - b);
  console.log(`crown gap (m) over ${gaps.length} samples: min ${minGap.toFixed(2)}, p5 ${gaps[Math.floor(gaps.length * 0.05)].toFixed(2)}, p25 ${gaps[Math.floor(gaps.length * 0.25)].toFixed(2)}, median ${gaps[Math.floor(gaps.length * 0.5)].toFixed(2)}, below 3 m: ${(gaps.filter((g) => g < 3).length / gaps.length * 100).toFixed(1)}%`);
  const log = await page.evaluate('window.__engine.cam.debugLog');
  const res = {};
  for (const s of [0.9, 1.0, 1.05]) {
    res[s] = await page.evaluate(`(${PAGE_INSIDE})(${s})`);
    console.log(`shrink ${s}: inside a crown on ${res[s].inside} of ${res[s].frames} frames`, JSON.stringify(res[s].byKind), 'at', res[s].insideFrames.slice(0, 16).join(' '));
  }
  console.log(`min height above ground ${res[0.9].minClear.toFixed(2)} m, min boom ${res[0.9].minBoom.toFixed(2)}, last-resort pushes ${res[0.9].pushes}`);
  // closest approach to a crown surface (in units of the ellipsoid radius): <1 is inside
  console.log('log frames', log.length / 11);
} catch (e) {
  console.error('camdoc failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
