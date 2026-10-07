// How far the real crown geometry reaches past the ellipsoid inscribed in its bounding box (what the camera's collision proxy uses).
// Prints, per pool and LOD mesh, the bounds and the distribution of the vertices' normalized radius (1 = on the ellipsoid), also
// split by height (lower third of the box, where low-hanging lumps sit).  node tools/camgeo.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const kill = setTimeout(() => { console.error('camgeo: hard timeout'); process.exit(2); }, 4 * 60 * 1000);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const out = await page.evaluate(() => {
    const tr = window.__engine.trees;
    const res = [];
    const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    const one = (pool, kind, pi) => {
      pool.crownMeshes.forEach((m, l) => {
        const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox;
        const c = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
        const h = [(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2];
        const pos = g.attributes.position; const all = [], low = [];
        for (let i = 0; i < pos.count; i++) {
          const a = (pos.getX(i) - c[0]) / h[0], bb = (pos.getY(i) - c[1]) / h[1], cc = (pos.getZ(i) - c[2]) / h[2];
          const r = Math.sqrt(a * a + bb * bb + cc * cc);
          all.push(r); if (bb < -0.33) low.push(r);
        }
        all.sort((x, y) => x - y); low.sort((x, y) => x - y);
        res.push({ kind, pool: pi, lod: l, verts: pos.count, count: m.count, size: h.map((x) => +(x * 2).toFixed(2)), min: b.min.y.toFixed(2), centre: c.map((x) => +x.toFixed(2)), all: [0.5, 0.9, 0.99, 1].map((p) => +q(all, p).toFixed(3)), low: low.length ? [0.5, 0.9, 0.99, 1].map((p) => +q(low, p).toFixed(3)) : null });
      });
    };
    tr.cw.forEach((p, i) => one(p, 'cw', i));
    tr.jun.forEach((p, i) => one(p, 'jun', i));
    return res;
  });
  for (const r of out) console.log(JSON.stringify(r));
} catch (e) {
  console.error('camgeo failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
