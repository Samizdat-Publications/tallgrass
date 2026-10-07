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
const hide = arg('hide', ''); // debug: --hide water hides the water mesh in every view
const only = arg('views', '').split(',').filter(Boolean); // e.g. --views pond_top,beaver_swim_close (default: all)
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
    // beavers (R-marsh): one swimming in open water and one on land, with their headings (the camera sits at their side)
    const classify = () => page.evaluate(({ lx, ly }) => {
      const m = window.__snap(), e = window.__engine;
      const sw = [], ln = [];
      for (let k = 0; k < m.count; k++) {
        const o = k * 12;
        if (m.agents[o] !== 11) continue;
        const x = m.agents[o + 1], z = m.agents[o + 2], hd = m.agents[o + 3];
        const lw = e.water.levelAt(x, z);
        const lv = lw === lw ? lw : e.beaverWorks.surfaceAt(x, z);
        const g = e.beaverWorks.heightAt(x, z);
        // distance to the nearest dam or lodge (a camera inside their sticks sees nothing)
        let ds = 1e9;
        const D = e.beaverWorks.lastDams, L = e.beaverWorks.lastLodges;
        if (D) for (let q = 0; q < D.length; q += 8) ds = Math.min(ds, Math.hypot(x - D[q], z - D[q + 1]));
        if (L) for (let q = 0; q < L.length; q += 4) ds = Math.min(ds, Math.hypot(x - L[q], z - L[q + 1]));
        // distance to the nearest other animal (a bison next to the camera fills the frame)
        let na = 1e9;
        for (let j = 0; j < m.count; j++) { if (j === k) continue; const q = j * 12; na = Math.min(na, Math.hypot(m.agents[q + 1] - x, m.agents[q + 2] - z)); }
        const rec = { x, z, hd, ds, na, d: Math.hypot(x - lx, z - ly), depth: lv === lv ? lv - g : -1, g, lv, pondCm: e.beaverWorks.lastPonds ? e.beaverWorks.lastPonds[Math.min(e.world.n - 1, Math.floor(z / e.world.cell)) * e.world.n + Math.min(e.world.n - 1, Math.floor(x / e.world.cell))] : -1 };
        if (lv === lv && lv - g > 0.1) sw.push(rec); else if (!(lv === lv)) ln.push(rec);
      }
      // swimmers in open water (a camera next to the lodge sits inside its sticks): 7 m or more from the lodge, nearest first
      const open = sw.slice().sort((a, b) => b.ds - a.ds); // (the one farthest from any dam or lodge first)
      sw.sort((a, b) => a.d - b.d); ln.sort((a, b) => (b.ds > 6 ? 1 : 0) - (a.ds > 6 ? 1 : 0) || a.d - b.d);
      return { sw: (open.length ? open : sw).slice(0, 3), ln: ln.slice(0, 3), n: m.count, swAll: sw.length };
    }, { lx, ly });
    let bv = await classify();
    // a beaver on land: when none is out of the water, step the sim a little at a time until one is (they come ashore to gnaw and to graze)
    for (let k = 0; k < 14 && !bv.ln.length; k++) {
      await page.evaluate(() => window.__step(250));
      await page.waitForTimeout(1500);
      bv = await classify();
    }
    console.log('beavers swimming', JSON.stringify(bv.sw), 'land', JSON.stringify(bv.ln), 'all swimming', bv.swAll);
    // [name, record, side offset deg from the heading, pitch, distance, lift]
    if (bv.sw[0]) VIEWS.push(['beaver_swim_close', bv.sw[0], 'side', 9, 2.4, 0.1]);
    if (bv.sw[0]) VIEWS.push(['beaver_swim_front', bv.sw[0], 'front', 26, 2.6, 0.1]);
    if (bv.sw[0]) VIEWS.push(['beaver_swim_high', bv.sw[0], 'side', 34, 2.2, 0.05]);
    if (bv.sw[0]) VIEWS.push(['beaver_swim_mid', bv.sw[0], 'side', 18, 7, 0.15]);
    if (bv.sw[0]) VIEWS.push(['beaver_swim_top', bv.sw[0], 'side', 68, 4, 0]);
    if (bv.ln[0]) VIEWS.push(['beaver_land_close', bv.ln[0], 'side', 28, 2.4, 0.3]);
    if (bv.ln[0]) VIEWS.push(['beaver_land_walk', bv.ln[0], 'front', 35, 3.2, 0.2]);
    if (bv.ln[0]) VIEWS.push(['beaver_land_bare', bv.ln[0], 'side', 12, 2.6, 0.2]); // (the grass hidden, for the model)
  }
  const tag = mode === 'on' ? 'on' : 'off';
  const timing = {};
  for (const view of VIEWS) {
    if (only.length && !only.includes(view[0])) continue;
    let [name, tx, ty, yawOff, pitch, dist, lift] = view;
    let heading = null;
    if (typeof ty === 'string') { heading = { rec: tx, mode: ty }; [name, , , pitch, dist, lift] = view; tx = heading.rec.x; ty = heading.rec.z; yawOff = 0; }
    const bare = name.endsWith('_bare');
    await page.evaluate(({ tx, ty, yaw, pitch, dist, lift, heading, bare, hide }) => {
      const e = window.__engine;
      Object.assign(e.env, { dayFrac: 0.4, season: 1.7, weather: 0, rain: 0, windStrength: 0.25 });
      e.setEnv = () => {};
      e.sm.snow = 0;
      e.applyEnvNow();
      if (heading) {
        // find the yaw that puts the camera at the beaver's side (or in front of its nose): sample the orbit at two yaws
        const off = (y) => { e.cam.setView({ x: tx, y: ty, yawDeg: y, pitchDeg: 10, distance: 10 }, true); e.renderOnce(0.016); return [e.camera.position.x - tx, e.camera.position.z - ty]; };
        const o0 = off(0), o1 = off(90);
        const want = heading.mode === 'front' ? [Math.cos(heading.rec.hd) * 0.8 - Math.sin(heading.rec.hd) * 0.6, Math.sin(heading.rec.hd) * 0.8 + Math.cos(heading.rec.hd) * 0.6] : [-Math.sin(heading.rec.hd), Math.cos(heading.rec.hd)];
        let best = 0, bd = -2;
        for (let y = 0; y < 360; y += 5) {
          const c = Math.cos(y * Math.PI / 180), s = Math.sin(y * Math.PI / 180);
          // offset(y) is a rotation of o0 by y, whose sense is told by o1
          const sense = Math.sign(o0[0] * o1[1] - o0[1] * o1[0]) || 1;
          const ox = o0[0] * c - sense * o0[1] * s, oz = sense * o0[0] * s + o0[1] * c;
          const dd = (ox * want[0] + oz * want[1]) / Math.hypot(ox, oz);
          if (dd > bd) { bd = dd; best = y; }
        }
        yaw = best;
      }
      e.cam.setView({ x: tx, y: ty, yawDeg: yaw, pitchDeg: pitch, distance: dist }, true);
      // (a swimmer's view looks at the water surface above the bed it is over: the lift is the water depth plus a little)
      e.cam.goal.lift = lift + (heading ? Math.max(0, heading.rec.depth) : 0);
      window.__grass.object3D.visible = !bare;
      e.water.mesh.visible = !hide.includes('water');
      for (let i = 0; i < 40; i++) e.renderOnce(0.016);
    }, { tx, ty, yaw: yawDeg + yawOff, pitch, dist, lift, heading, bare, hide });
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
    if (mode === 'on' && process.argv.includes('--gpu') && (name === 'pond_mid' || name === 'pond_top' || name === 'pond_close' || name === 'beaver_swim_mid')) {
      // GPU time of the whole frame at this camera (EXT_disjoint_timer_query, the median of three rounds of 40 frames): compare two builds
      const g = await page.evaluate(async () => {
        const e = window.__engine, gl = e.renderer.getContext();
        const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!ext) return { error: 'no timer query' };
        const measure = async () => {
          for (let i = 0; i < 8; i++) e.renderOnce(0.016);
          const qs = [];
          for (let i = 0; i < 40; i++) {
            const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
            if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
          }
          for (let t = 0; t < 400 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE); t++) await new Promise((r) => setTimeout(r, 25));
          const v = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
          return v[Math.floor(v.length / 2)];
        };
        const r = [];
        for (let k = 0; k < 3; k++) r.push(await measure());
        r.sort((a, b) => a - b);
        return { gpuMs: +r[1].toFixed(3), all: r.map((x) => +x.toFixed(3)) };
      });
      timing[name + '_gpu'] = g;
      console.log('gpu', name, JSON.stringify(g));
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
