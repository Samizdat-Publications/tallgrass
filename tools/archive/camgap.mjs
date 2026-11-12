// Deterministic camera-vs-crown gap test (camera pass R-camera-night): drives the real DroneCamera at 60 Hz with shots whose subject stands
// under or inside the valley's groves (cuts, glides), and measures, against the real crown instances, how close the camera gets to a
// crown surface (gap in m, approximate: the ellipsoid inscribed in the crown's bounding box, 0 = on it, negative = inside).
// Photographs the closest moments (--shots). No sim timing: the same numbers every run.
//   node tools/camgap.mjs [--shots dir --prefix before] [--n 4] [--idx 8,10,6,51]  (--idx: photograph those cut shots instead of the closest)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const shots = arg('shots', '');
const prefix = arg('prefix', 'gap');
const nShots = Number(arg('n', '4'));
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const kill = setTimeout(() => { console.error('camgap: hard timeout'); process.exit(2); }, 7 * 60 * 1000);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.evaluate(() => { window.__speed(0); });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const e = window.__engine, cam = e.cam, tr = e.trees, DT = 1 / 60;
    const M4 = e.camera.matrixWorld.constructor, V3 = e.camera.position.constructor;
    const cols = [];
    const addPool = (pool, kind) => {
      const g = pool.crownMeshes[0].geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox;
      const c = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
      const h = [(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2];
      // every 24th vertex of the rendered crown (LOD 0), to measure the distance to the leaves themselves
      const pos = g.attributes.position, vs = new Float32Array(Math.ceil(pos.count / 24) * 3);
      for (let i = 0, j = 0; i < pos.count; i += 24, j += 3) { vs[j] = pos.getX(i); vs[j + 1] = pos.getY(i); vs[j + 2] = pos.getZ(i); }
      for (let s = 0; s < pool.hi; s++) {
        if (!pool.crownOn[s]) continue;
        const m = new M4().fromArray(pool.crownMats, s * 16);
        const sc = [Math.hypot(m.elements[0], m.elements[1], m.elements[2]), Math.hypot(m.elements[4], m.elements[5], m.elements[6]), Math.hypot(m.elements[8], m.elements[9], m.elements[10])];
        cols.push({ kind, x: m.elements[12], z: m.elements[14], inv: m.clone().invert(), c, h, sc, vs, w: Math.min(h[0] * sc[0], h[1] * sc[1], h[2] * sc[2]) });
      }
    };
    for (const p of tr.cw) addPool(p, 'cottonwood');
    for (const p of tr.jun) addPool(p, 'juniper');
    const v = new V3();
    // the distance (m) from the camera to the nearest leaf vertex of any crown (0 = in the leaves), and the ellipsoid-proxy gap alongside
    let lastEll = 0;
    const gap = () => {
      const p = e.camera.position; let best = 1e9, ell = 1e9;
      for (const k of cols) {
        const dx = k.x - p.x, dz = k.z - p.z; if (dx * dx + dz * dz > 3600) continue;
        v.copy(p).applyMatrix4(k.inv);
        const a = (v.x - k.c[0]) / k.h[0], b = (v.y - k.c[1]) / k.h[1], c = (v.z - k.c[2]) / k.h[2];
        const gp = (Math.sqrt(a * a + b * b + c * c) - 1) * k.w;
        if (gp < ell) ell = gp;
        // only crowns whose proxy is near can hold a leaf closer than 12 m
        if (gp > 12) continue;
        const vs = k.vs, s0 = k.sc[0], s1 = k.sc[1], s2 = k.sc[2];
        for (let i = 0; i < vs.length; i += 3) {
          const ex = (vs[i] - v.x) * s0, ey = (vs[i + 1] - v.y) * s1, ez = (vs[i + 2] - v.z) * s2;
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 < best) best = d2;
        }
      }
      lastEll = ell;
      return best === 1e9 ? 99 : Math.sqrt(best);
    };
    const trees = [];
    for (let id = 0; id < 4000; id++) { const s = e.trees.getTree(id); if (s && !s.far && s.species !== 'juniper') trees.push(s); }
    const dens = trees.map((a) => ({ x: a.x, y: a.z, n: trees.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) < 28).length }));
    dens.sort((a, b) => b.n - a.n);
    const groves = [];
    for (const d of dens) { if (groves.length >= 6) break; if (groves.every((g) => Math.hypot(g.x - d.x, g.y - d.y) > 70)) groves.push(d); }
    // every step of a scenario is a shot description; frames are recorded with their gap, the closest moments are kept for stills
    const sc = { gaps: [], worst: [] };
    const frame = (tag) => {
      cam.update(DT);
      const gp = gap();
      sc.gaps.push(gp);
      const p = e.camera.position;
      sc.worst.push([gp, tag, p.x, p.y, p.z]);
      if (sc.worst.length > 600) { sc.worst.sort((a, b) => a[0] - b[0]); sc.worst.length = 60; }
    };
    const hold = (secs, tag) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) frame(tag); };
    const reset = () => {
      sc.gaps = []; sc.worst = [];
      cam.debugLog = null; cam.follow(null); cam.setCinematic(false); cam.followSmoothTime = 0.4; cam.followDeadzone = 0.055;
      cam.setView({ x: groves[0].x, y: groves[0].y, distance: 24, pitchDeg: 15, yawDeg: 0 }, true);
      for (let i = 0; i < 30; i++) cam.update(DT);
    };
    const summary = () => {
      const gs = [...sc.gaps].sort((a, b) => a - b);
      const q = (p) => gs[Math.min(gs.length - 1, Math.floor(p * gs.length))];
      sc.worst.sort((a, b) => a[0] - b[0]);
      return { n: gs.length, min: gs[0], p01: q(0.01), p05: q(0.05), p25: q(0.25), med: q(0.5), below0: gs.filter((g) => g < 0).length, below1: gs.filter((g) => g < 1).length, below2: gs.filter((g) => g < 2).length, below3: gs.filter((g) => g < 3).length, worst: sc.worst.slice(0, 12) };
    };
    // the shots of a scenario, replayable: a shot list entry is [kind, ...]
    const cutShots = [];
    for (const g of groves) {
      const near = trees.filter((b) => Math.hypot(g.x - b.x, g.y - b.z) < 22);
      let k = 0;
      for (const t of near.slice(0, 10)) {
        cutShots.push({ x: t.x, y: t.z, dist: [14, 22, 30, 45][k % 4], pitch: [12, 18, 24, 32][(k >> 1) % 4], yaw: (t.x * 7 + k * 53) % 360 });
        k++;
      }
    }
    window.__gap = {
      groves,
      cuts: () => {
        reset();
        for (const s of cutShots) { cam.setCinematic(true); cam.setView({ x: s.x, y: s.y, distance: s.dist, pitchDeg: s.pitch, yawDeg: s.yaw }, true); hold(2.0, `cut d${s.dist} p${s.pitch} y${s.yaw | 0} @${s.x | 0},${s.y | 0}`); }
        return summary();
      },
      glide: () => {
        reset();
        const path = [];
        for (const g of groves) { const near = trees.filter((b) => Math.hypot(g.x - b.x, g.y - b.z) < 22).slice(0, 6); for (const t of near) path.push({ x: t.x, y: t.z }); }
        const pos = { x: path[0].x, y: path[0].y };
        cam.setCinematic(true); cam.followSmoothTime = 1.1; cam.followDeadzone = 0.13;
        cam.setView({ x: path[0].x, y: path[0].y, distance: 26, pitchDeg: 16, yawDeg: 30 }, true);
        cam.follow(() => pos); cam.easeIn();
        for (let seg = 0; seg + 1 < path.length && seg < 40; seg++) {
          const a = path[seg], b = path[seg + 1];
          const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.min(Math.round(L / 3 / DT), 600);
          if (seg % 5 === 0) cam.setView({ distance: [18, 28, 40][(seg / 5) % 3], pitchDeg: [14, 20, 28][(seg / 5) % 3], yawDeg: seg * 47 });
          for (let i = 0; i < n; i++) { const u = i / n; pos.x = a.x + (b.x - a.x) * u; pos.y = a.y + (b.y - a.y) * u; frame(`glide seg${seg}`); }
        }
        return summary();
      },
      // photograph the closest cut shots: replay the cut and render at its closest frame
      still: (idx, which) => {
        reset();
        const s = cutShots[idx];
        cam.setCinematic(true); cam.setView({ x: s.x, y: s.y, distance: s.dist, pitchDeg: s.pitch, yawDeg: s.yaw }, true);
        const n = Math.round(2.0 / DT);
        let best = 1e9, bi = 0;
        // first pass: find the closest frame, second pass: stop there
        for (let i = 0; i < n; i++) { cam.update(DT); const gp = gap(); if (gp < best) { best = gp; bi = i; } }
        reset();
        cam.setCinematic(true); cam.setView({ x: s.x, y: s.y, distance: s.dist, pitchDeg: s.pitch, yawDeg: s.yaw }, true);
        for (let i = 0; i <= bi; i++) cam.update(DT);
        e.renderOnce(0); e.renderOnce(0);
        const p = e.camera.position;
        return { gap: best, frame: bi, cam: [p.x, p.y, p.z].map((x) => +x.toFixed(1)), shot: s };
      },
      // which crowns are near the camera at the closest frame of a cut shot: kind, the ellipsoid's normalized radius (1 = on it), nearest leaf
      probe: (idx) => {
        const r0 = window.__gap.still(idx);
        const p = e.camera.position, out = [];
        for (const k of cols) {
          const dx = k.x - p.x, dz = k.z - p.z; if (dx * dx + dz * dz > 900) continue;
          v.copy(p).applyMatrix4(k.inv);
          const a = (v.x - k.c[0]) / k.h[0], b = (v.y - k.c[1]) / k.h[1], c = (v.z - k.c[2]) / k.h[2];
          let best = 1e9;
          for (let i = 0; i < k.vs.length; i += 3) { const ex = (k.vs[i] - v.x) * k.sc[0], ey = (k.vs[i + 1] - v.y) * k.sc[1], ez = (k.vs[i + 2] - v.z) * k.sc[2]; best = Math.min(best, ex * ex + ey * ey + ez * ez); }
          out.push({ kind: k.kind, at: [k.x, k.z].map((x) => +x.toFixed(1)), r: +Math.sqrt(a * a + b * b + c * c).toFixed(3), leaf: +Math.sqrt(best).toFixed(2), half: k.h.map((x, i) => +(x * k.sc[i]).toFixed(1)) });
        }
        out.sort((x, y) => x.leaf - y.leaf);
        return { r0, cam: [p.x, p.y, p.z].map((x) => +x.toFixed(1)), ground: e.groundHeight(p.x, p.z), near: out.slice(0, 5) };
      },
      worstCutShots: () => {
        // gap of each cut shot at its closest frame
        const out = [];
        for (let i = 0; i < cutShots.length; i++) {
          reset();
          const s = cutShots[i];
          cam.setCinematic(true); cam.setView({ x: s.x, y: s.y, distance: s.dist, pitchDeg: s.pitch, yawDeg: s.yaw }, true);
          let best = 1e9;
          for (let f = 0; f < 120; f++) { cam.update(DT); best = Math.min(best, gap()); }
          out.push([i, best]);
        }
        out.sort((a, b) => a[1] - b[1]);
        return out;
      },
    };
  });
  for (const scn of ['cuts', 'glide']) {
    const r = await page.evaluate((s) => window.__gap[s](), scn);
    console.log(`== ${scn}: ${r.n} frames, gap min ${r.min.toFixed(2)} p1 ${r.p01.toFixed(2)} p5 ${r.p05.toFixed(2)} p25 ${r.p25.toFixed(2)} median ${r.med.toFixed(2)} m; inside ${r.below0}, under 1 m ${r.below1}, under 2 m ${r.below2}, under 3 m ${r.below3}`);
    for (const w of r.worst.slice(0, 4)) console.log('   worst', w[0].toFixed(2), w[1], 'cam', [w[2], w[3], w[4]].map((x) => x.toFixed(1)).join(','));
  }
  if (argv.includes('--probe')) {
    for (const i of arg('probe', '8').split(',')) console.log('probe', i, JSON.stringify(await page.evaluate((i) => window.__gap.probe(i), Number(i))));
  }
  if (shots) {
    mkdirSync(shots, { recursive: true });
    const order = await page.evaluate(() => window.__gap.worstCutShots());
    console.log('closest cut shots (index, gap):', order.slice(0, 6).map((o) => `${o[0]}:${o[1].toFixed(2)}`).join(' '));
    const pick = arg('idx', '') ? arg('idx', '').split(',').map((x) => [Number(x)]) : order.slice(0, nShots);
    for (const [idx] of pick) {
      const info = await page.evaluate(([i]) => window.__gap.still(i), [idx]);
      await page.waitForTimeout(400);
      const file = resolve(shots, `${prefix}-cut${idx}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
      console.log('shot', file, 'gap', info.gap.toFixed(2), JSON.stringify(info.cam), JSON.stringify(info.shot));
    }
  }
} catch (e) {
  console.error('camgap failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
