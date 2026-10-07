// S14 beaver stills (R16): a pond behind a dam with a lodge, close, mid and from above, and the same creek with beavers off. JPEG q88.
//   node tools/r_beavers_shots.mjs --mode on  --out review/wip/beavers [--size 1600x900] [--years 10]
//   node tools/r_beavers_shots.mjs --mode off --out review/wip/beavers          (reads targets.json written by the "on" run)
// "on" loads ?p=beavers:1,beaver.initial:6, steps whole valley years until a dam holds a pond, records the camera targets, shoots them, and
// times the frame (renderOnce with a GL finish) with the pond and works drawn and with them taken away at the same camera.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const mode = arg('mode', 'on');
const out = resolve(arg('out', 'review/wip/beavers'));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const maxYears = Number(arg('years', '10'));
const params = arg('p', 'beavers:1,beaver.initial:6');
const kill = setTimeout(() => { console.error('r_beavers_shots: hard timeout'); process.exit(2); }, 14 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/.vitecache-beavers'),
  server: { port: 6100 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[console.' + m.type() + '] ' + m.text().slice(0, 400)); });
  const url = base + '/index.html?autoscale=0&autocam=0' + (mode === 'on' ? '&p=' + params : '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  await page.evaluate(() => { window.__speed(0); });

  let targets;
  if (mode === 'on') {
    // step whole years until a dam holds a pond
    let found = null;
    for (let y = 1; y <= maxYears; y++) {
      const v0 = await page.evaluate(() => window.__engine.beaverWorks.version);
      await page.evaluate(() => window.__step(2400));
      await page.waitForFunction((v) => window.__engine.beaverWorks.version !== v || window.__engine.beaverWorks.version === -1, v0, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(600);
      const st = await page.evaluate(() => {
        const b = window.__engine.beaverWorks;
        return { ver: b.version, dams: b.lastDams ? Array.from(b.lastDams) : [], lodges: b.lastLodges ? Array.from(b.lastLodges) : [], pond: window.__engine.water.pondCells, trees: window.__engine.trees.liveTrees };
      });
      console.log(`year ${y}: version ${st.ver}, dams ${st.dams.length / 8}, lodges ${st.lodges.length / 4}, pond cells ${st.pond}`);
      let best = -1;
      for (let k = 0; k < st.dams.length / 8; k++) if (st.dams[k * 8 + 3] <= 1 && (best < 0 || st.dams[k * 8 + 2] > st.dams[best * 8 + 2])) best = k;
      if (best >= 0 && st.dams[best * 8 + 2] >= 1.0 && st.pond >= 120 && st.dams[best * 8 + 3] === 1) { found = { st, best }; break; }
      found = best >= 0 ? { st, best } : found;
    }
    if (!found) throw new Error('no dam after ' + maxYears + ' years');
    const d = found.st.dams.slice(found.best * 8, found.best * 8 + 8);
    // the nearest lodge to the dam
    let lodge = null, ld = 1e9;
    for (let k = 0; k < found.st.lodges.length / 4; k++) {
      const x = found.st.lodges[k * 4], y = found.st.lodges[k * 4 + 1];
      const dd = Math.hypot(x - d[0], y - d[1]);
      if (dd < ld) { ld = dd; lodge = [x, y, found.st.lodges[k * 4 + 2], found.st.lodges[k * 4 + 3]]; }
    }
    targets = { dam: d, lodge, pondCells: found.st.pond, damCount: found.st.dams.length / 8, lodgeCount: found.st.lodges.length / 4 };
    writeFileSync(`${out}/targets.json`, JSON.stringify(targets, null, 1));
    console.log('targets', JSON.stringify(targets));
  } else {
    targets = JSON.parse(readFileSync(`${out}/targets.json`, 'utf8'));
    // the same valley date as the "on" run: nothing to step (the creek as generated), only the camera and the light
  }

  const [dx, dy, crest, state, ang, len, level] = targets.dam;
  // downstream direction (the dam wall runs at ang; the creek is across it), the view looks upstream
  const fwd = Math.atan2(-Math.sin(ang), Math.cos(ang));
  const up = [-Math.sin(ang) * -1, Math.cos(ang) * -1]; // unit vector pointing downstream is (sin a, -cos a); upstream is its negative
  const upstream = [-Math.sin(ang), Math.cos(ang)];
  void up;
  const lx = targets.lodge ? targets.lodge[0] : dx + upstream[0] * 18, ly = targets.lodge ? targets.lodge[1] : dy + upstream[1] * 18;
  const mid = [(dx + lx) / 2, (dy + ly) / 2];
  const yawDeg = (fwd + Math.PI) * 180 / Math.PI;
  // name, target x, y, yaw offset deg, pitch, distance, lift
  const VIEWS = [
    ['pond_close', mid[0], mid[1], 0, 12, 22, 0.8],
    ['pond_mid', mid[0] + upstream[0] * 8, mid[1] + upstream[1] * 8, 25, 20, 55, 1.5],
    ['pond_top', mid[0] + upstream[0] * 10, mid[1] + upstream[1] * 10, 0, 78, 130, 0],
    ['dam_close', dx, dy, 150, 9, 10, 0.6],
    ['lodge_close', lx, ly, -40, 12, 11, 0.7],
  ];
  if (mode === 'on') {
    // a swimming beaver near the lodge, if the snapshot has one
    const bv = await page.evaluate(({ lx, ly }) => {
      const m = window.__snap();
      let best = null, bd = 1e9;
      for (let k = 0; k < m.count; k++) {
        const o = k * 12;
        if (m.agents[o] !== 11) continue;
        const d = Math.hypot(m.agents[o + 1] - lx, m.agents[o + 2] - ly);
        if (d < bd) { bd = d; best = [m.agents[o + 1], m.agents[o + 2]]; }
      }
      return best;
    }, { lx, ly });
    if (bv) VIEWS.push(['beaver_close', bv[0], bv[1], -60, 14, 6, 0.4]);
  }
  const tag = mode === 'on' ? 'on' : 'off';
  const timing = {};
  for (const [name, tx, ty, yawOff, pitch, dist, lift] of VIEWS) {
    await page.evaluate(({ tx, ty, yaw, pitch, dist, lift }) => {
      const e = window.__engine;
      Object.assign(e.env, { dayFrac: 0.4, season: 1.7, weather: 0, rain: 0, windStrength: 0.25 });
      e.setEnv = () => {};
      e.sm.snow = 0;
      e.applyEnvNow();
      e.cam.setView({ x: tx, y: ty, yawDeg: yaw, pitchDeg: pitch, distance: dist }, true);
      e.cam.goal.lift = lift;
      for (let i = 0; i < 10; i++) e.renderOnce(0.016);
    }, { tx, ty, yaw: yawDeg + yawOff, pitch, dist, lift });
    await page.waitForTimeout(500);
    await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__engine.renderOnce(0.016); });
    const p = `${out}/${tag}_${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 88 });
    console.log('saved', p);
    if (mode === 'on' && (name === 'pond_mid' || name === 'pond_top')) {
      // frame cost at this camera: with the pond water and works, then with the field taken away (creek as generated, works hidden)
      const t = await page.evaluate(() => {
        const e = window.__engine, gl = e.renderer.getContext();
        const run = () => { for (let i = 0; i < 20; i++) e.renderOnce(0.016); gl.finish(); const t0 = performance.now(); for (let i = 0; i < 60; i++) e.renderOnce(0.016); gl.finish(); return (performance.now() - t0) / 60; };
        // alternate three times (the first runs of a new state are slower while the GPU settles), keep the median of each
        const withR = [], withoutR = [];
        for (let r = 0; r < 3; r++) {
          e.water.setPonds(e.beaverWorks.lastPonds ?? undefined); e.beaverWorks.group.visible = true;
          withR.push(run());
          e.water.setPonds(undefined); e.beaverWorks.group.visible = false;
          withoutR.push(run());
        }
        const med = (v) => v.slice().sort((x, y) => x - y)[1];
        const a1 = med(withR), b1 = med(withoutR), b2 = b1;
        e.beaverWorks.group.visible = true;
        e.water.setPonds(e.beaverWorks.lastPonds ?? undefined);
        return { withMs: +a1.toFixed(3), withoutMs: +((b1 + b2) / 2).toFixed(3), restored: !!e.beaverWorks.lastPonds };
      });
      timing[name] = t;
      console.log('timing', name, JSON.stringify(t));
    }
  }
  if (mode === 'on') {
    const info = await page.evaluate(() => {
      const e = window.__engine;
      return { fps: window.__fps, pondCells: e.water.pondCells, dams: e.beaverWorks.damCount, lodges: e.beaverWorks.lodgeCount, beavers: window.__find(11).length, drowned: e.trees.drownedDone, tris: e.renderer.info.render.triangles, calls: e.renderer.info.render.calls };
    });
    console.log('info', JSON.stringify(info));
    writeFileSync(`${out}/timing.json`, JSON.stringify({ timing, info }, null, 1));
  }
} catch (e) {
  console.error('r_beavers_shots failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'CONSOLE/PAGE ERRORS:\n' + uniq.join('\n') : 'no console errors or warnings');
process.exit(code);
