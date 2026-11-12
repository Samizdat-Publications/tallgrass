// r-grassnear: why does the ground thin out in a follow view? Prints the camera height, the ground biomass round the followed animal
// and the blade counts per LOD level. Usage: node tools/r_grassnear_probe.mjs [dist] [pitch]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const dist = Number(process.argv[2] ?? 40), pitch = Number(process.argv[3] ?? 20);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5900 + Math.floor(Math.random() * 90), hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const to = setTimeout(() => process.exit(2), 300000);
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  const res = await page.evaluate(async ({ dist, pitch }) => {
    const out = {};
    for (const [name, sp, st] of [['wolf', 1, 5], ['bison', 0, 1], ['pronghorn', 3, undefined]]) {
      const c = (st !== undefined ? window.__find(sp, st) : []).concat(window.__find(sp));
      const id = c[0];
      window.__followId(id); window.__engine.cam.setView({ distance: dist, pitchDeg: pitch }, true);
      await new Promise((r) => setTimeout(r, 2500));
      const e = window.__engine, g = window.__grass, cam = e.camera;
      const sn = window.__snap(); const j = sn.ids.indexOf(id); const fx = sn.agents[j * 12 + 1], fz = sn.agents[j * 12 + 2];
      const veg = g.veg.image.data, n = g.world.n, cell = g.world.cell;
      const samp = (r0, r1) => { let s = 0, k = 0, mn = 9; for (let dz = -r1; dz <= r1; dz += 2) for (let dx = -r1; dx <= r1; dx += 2) { const d = Math.hypot(dx, dz); if (d < r0 || d > r1) continue; const i = Math.min(n - 1, Math.max(0, Math.round((fx + dx) / cell))), jj = Math.min(n - 1, Math.max(0, Math.round((fz + dz) / cell))); const v = veg[(jj * n + i) * 4] / 255; s += v; k++; mn = Math.min(mn, v); } return +(s / k).toFixed(3); };
      out[name] = { focus: [fx, fz], camY: +cam.position.y.toFixed(1), groundY: +e.cam.groundAt?.(cam.position.x, cam.position.z)?.toFixed?.(1), camToFocus: +Math.hypot(cam.position.x - fx, cam.position.z - fz).toFixed(1), bio0_10: samp(0, 10), bio10_30: samp(10, 30), bio30_60: samp(30, 60), bio60_100: samp(60, 100), stats: { cells: [...g.stats.cells], inst: g.stats.instances } };
    }
    return out;
  }, { dist, pitch });
  console.log(JSON.stringify(res, null, 1));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
