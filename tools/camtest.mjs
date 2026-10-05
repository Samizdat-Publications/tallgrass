// Deterministic camera test (R15 camera pass): drives the real DroneCamera at a fixed 60 Hz through the densest groves of the valley and
// reports, per scenario, the frames with the camera inside a tree crown (measured against the real crown instances) and the jerk of the
// camera path. No rendering and no sim timing: the same numbers every run, so a change can be compared before and after.
//   orbit   : the camera circles a grove at 24 m (what a drag or Q/E does)
//   follow  : a runner crosses the valley through the groves at 9 m/s, followed the way the director follows an animal, cinematic drift on
//   pan     : cinematic glides from grove to grove (a new shot starts, no cut), then holds, as the director does for a far-off shot
//   cuts    : snaps into grove interiors (a cut must also land clear)
// node tools/camtest.mjs [--json out.json] [--logs] [--noobs]   (--noobs: tree avoidance off, to judge the smoothing on its own)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { PAGE_INSIDE, analyze, fmt } from './camlog.mjs';

const argv = process.argv.slice(2);
const jsonOut = argv.indexOf('--json') >= 0 ? argv[argv.indexOf('--json') + 1] : '';
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const kill = setTimeout(() => { console.error('camtest: hard timeout'); process.exit(2); }, 8 * 60 * 1000);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const results = {};
  if (argv.includes('--noobs')) await page.evaluate(() => window.__engine.cam.setObstacles(null)); // the smoothing alone, without the tree avoidance
  for (const scenario of ['orbit', 'follow', 'pan', 'cuts']) {
    const log = await page.evaluate((scenario) => {
      const e = window.__engine, cam = e.cam, DT = 1 / 60;
      // groves: the densest spots among the valley's trees (cottonwoods within 28 m), at least 70 m apart
      const trees = [];
      for (let id = 0; id < 4000; id++) { const s = e.trees.getTree(id); if (s && !s.far && s.species !== 'juniper') trees.push(s); }
      const dens = trees.map((a) => ({ x: a.x, y: a.z, n: trees.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 28).length }));
      dens.sort((a, b) => b.n - a.n);
      const groves = [];
      for (const d of dens) { if (groves.length >= 6) break; if (groves.every((g) => Math.hypot(g.x - d.x, g.y - d.y) > 70)) groves.push(d); }
      cam.debugLog = null; cam.follow(null); cam.setCinematic(false);
      cam.followSmoothTime = 0.4; cam.followDeadzone = 0.055;
      cam.setView({ x: groves[0].x, y: groves[0].y, distance: 24, pitchDeg: 15, yawDeg: 0 }, true);
      for (let i = 0; i < 30; i++) cam.update(DT);
      cam.debugLog = [];
      const tStart = performance.now();
      const run = (secs, each) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { each(i * DT); cam.update(DT); } };
      if (scenario === 'orbit') {
        for (const g of groves.slice(0, 5)) {
          cam.setView({ x: g.x, y: g.y, distance: 24, pitchDeg: 15, yawDeg: 0 }, true);
          run(0.5, () => {});
          run(22, (t) => cam.setView({ yawDeg: t * 0.55 * 180 / Math.PI }));
        }
      } else if (scenario === 'follow') {
        // the runner: a polyline through the groves
        const path = [...groves, groves[0]];
        const segs = []; let L = 0;
        for (let i = 0; i + 1 < path.length; i++) { const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y); segs.push([L, d, path[i], path[i + 1]]); L += d; }
        const at = (s) => { s = Math.min(s, L - 1e-3); for (const [l0, d, a, b] of segs) if (s < l0 + d) { const f = (s - l0) / d; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; } return path[0]; };
        let s = 0;
        cam.setView({ x: groves[0].x, y: groves[0].y, distance: 22, pitchDeg: 16, yawDeg: 40 }, true);
        cam.followSmoothTime = 1.1; cam.followDeadzone = 0.13;
        cam.follow(() => at(s));
        cam.setCinematic(true); cam.easeIn();
        run(Math.min(L / 9, 150), (t) => { s = t * 9; });
      } else if (scenario === 'pan') {
        for (let k = 0; k < groves.length; k++) {
          const g = groves[k];
          cam.follow(null);
          cam.setView({ x: g.x, y: g.y, distance: 40, pitchDeg: 18, yawDeg: 30 * k });
          cam.setCinematic(true); cam.easeIn();
          run(18, () => {});
        }
      } else {
        // cuts: snap to the grove's interior trees from a fixed side, hold a second, move on
        for (const g of groves) {
          const near = trees.filter((b) => Math.hypot(g.x - b.x, g.y - b.z) < 22);
          for (const t of near.slice(0, 8)) {
            cam.setView({ x: t.x, y: t.z, distance: 22, pitchDeg: 14, yawDeg: (t.x * 7) % 360 }, true);
            run(1.0, () => {});
          }
        }
      }
      const ms = performance.now() - tStart;
      return { stride: 11, ms, log: cam.debugLog, groves: groves.map((g) => [Math.round(g.x), Math.round(g.y), g.n]) };
    }, scenario);
    await page.evaluate((log) => { window.__engine.cam.debugLog = log; }, log.log);
    const inside = await page.evaluate(`(${PAGE_INSIDE})(0.9)`);
    const a = analyze(log.log, 11);
    results[scenario] = { analysis: a, inside, groves: log.groves, pushes: inside.pushes };
    if (argv.includes('--logs')) writeFileSync(jsonOut.replace(/\.json$/, '') + '-' + scenario + '-log.json', JSON.stringify({ stride: 11, log: log.log }));
    console.log(`== ${scenario} (groves ${JSON.stringify(log.groves)})`);
    console.log(fmt(a));
    console.log(`  camera update cost: ${(log.ms / (log.log.length / 11)).toFixed(3)} ms per frame (all of it, with the debug log on)`);
    console.log(`  inside a tree crown: ${inside.inside} of ${inside.frames} frames ${JSON.stringify(inside.byKind)}, in a thicket ${inside.inThicket ?? 0}, min height above ground ${inside.minClear.toFixed(2)} m, min boom ${inside.minBoom.toFixed(2)}, max swing ${inside.maxSwing.toFixed(0)} deg, last-resort pushes so far ${inside.pushes}`);
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));
} catch (e) {
  console.error('camtest failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
