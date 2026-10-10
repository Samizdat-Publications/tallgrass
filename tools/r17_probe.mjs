// R17: how many animal instances are drawn vs how many are inside the camera frustum, per view. node tools/r17_probe.mjs [views]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const views = (process.argv[2] ?? 'low_golden,wide_golden,herd,night').split(',');
const VIEW = {
  wide_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  low_golden: `() => { e.cam.preset('low', true); }`,
  herd: `() => { window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true); }`,
  top: `() => { e.cam.preset('top', true); }`,
  night: `() => { Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__focusHerd(); }`,
};
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r17'), server: { port: 7800 + Math.floor(Math.random() * 100), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**', '**/art/**', '**/journey/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const to = setTimeout(() => process.exit(2), 600000);
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ VIEW, views }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    const T = e.camera.constructor;
    const out = {};
    for (const v of views) {
      (0, eval)(`(e) => (${VIEW[v]})`)(e)();
      for (let i = 0; i < 10; i++) e.renderOnce(0.016);
      e.camera.updateMatrixWorld();
      const m = e.camera.projectionMatrix.clone().multiply(e.camera.matrixWorldInverse);
      const fr = new (e.camera.matrixWorld.constructor.prototype.constructor === undefined ? Object : Object)();
      const planes = [];
      const me = m.elements;
      const row = (r) => [me[r], me[4 + r], me[8 + r], me[12 + r]];
      const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
      const add = (a, b, s) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]];
      for (const [a, s] of [[r0, 1], [r0, -1], [r1, 1], [r1, -1], [r2, 1], [r2, -1]]) { const p = add(r3, a, s); const l = Math.hypot(p[0], p[1], p[2]); planes.push(p.map((x) => x / l)); }
      const o = {};
      const cp = e.camera.position;
      for (const mesh of e.scene.getObjectByName('AnimalLayer').children) {
        if (!mesh.isInstancedMesh) continue;
        const a = mesh.instanceMatrix.array;
        let inView = 0, within360 = 0;
        for (let k = 0; k < mesh.count; k++) {
          const x = a[k * 16 + 12], y = a[k * 16 + 13], z = a[k * 16 + 14];
          let ok = true;
          for (const p of planes) if (p[0] * x + p[1] * y + p[2] * z + p[3] < -6) { ok = false; break; }
          if (ok) inView++;
          if (Math.hypot(x - cp.x, z - cp.z) < 360) within360++;
        }
        o[mesh.name] = { count: mesh.count, inView, within360 };
      }
      const sm = e.scene.getObjectByName('SmallPreyLayer');
      if (sm) for (const mesh of sm.children) if (mesh.isInstancedMesh) o['sp:' + mesh.name] = { count: mesh.count };
      out[v] = o;
    }
    return out;
  }, { VIEW, views });
  console.log(JSON.stringify(res, null, 1));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
