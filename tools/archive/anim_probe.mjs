// Animation liveness probe (r-regress). Runs the real game in headless Chromium on the GPU and, every rendered frame, reads what the
// animal layer wrote per species batch: does the gait phase advance when the body travels, how fast, and what is the render frame rate.
//
//   node tools/anim_probe.mjs [--root <checkout>] [--secs 30] [--query "p=snowDepth:0,dynamicTrees:0"] [--shots dir]
//
// Prints, per species: moving instances seen, share of moving frames with the phase advancing, mean cycles per metre travelled
// (a healthy walk is 1 / stride), and the frame time percentiles. Always run under a timeout.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const secs = Number(arg('secs', '30'));
const query = arg('query', '');
const kill = setTimeout(() => { console.error('anim_probe: hard timeout'); process.exit(2); }, 10 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_animprobe'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[page exception]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 300)); } });
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(1000);
  await page.evaluate(`(async () => {
    const A = window.__animals, E = window.__engine;
    const st = { dts: [], sp: {} };
    const prev = new Map();
    window.__ap = st;
    const W = await import('/src/sim/world.ts');
    const world = A.world;
    const ground = (x, z) => W.sampleHeight(world.height, world.hn, world.cell, x, z);
    st.slope = {};
    E.onFrame((dt) => {
      st.dts.push(dt);
      for (let sp = 0; sp < A.batches.length; sp++) {
        const b = A.batches[sp];
        if (!b) continue;
        const te = b.mesh.instanceMatrix.array, ga = b.gait.array;
        const acc = st.sp[sp] || (st.sp[sp] = { moving: 0, advancing: 0, dist: 0, cyc: 0, spdSum: 0, still: 0, stillAdv: 0 });
        for (let k = 0; k < b.count; k++) {
          const id = b.ids[k], o = k * 16, g = k * 4;
          const key = sp * 1e6 + id;
          if (sp !== 2 && sp !== 8 && sp !== 9 && sp !== 11 && ga[g + 1] > 0.8 && k % 3 === 0) {
            const sc = Math.hypot(te[o], te[o + 1], te[o + 2]);
            const hx = te[o] / sc, hy = te[o + 1] / sc, hz = te[o + 2] / sc;
            const hh = Math.hypot(hx, hz);
            if (hh > 0.5) {
              const dx = hx / hh * 0.6 * sc, dz = hz / hh * 0.6 * sc;
              const tp = Math.atan2(ground(te[o + 12] + dx, te[o + 14] + dz) - ground(te[o + 12] - dx, te[o + 14] - dz), 1.2 * sc);
              const ip = Math.asin(Math.max(-1, Math.min(1, hy)));
              const a = st.slope[sp] || (st.slope[sp] = { n: 0, sxy: 0, sxx: 0, syy: 0, steep: 0, steepFlat: 0, absT: 0, absI: 0 });
              a.n++; a.sxy += tp * ip; a.sxx += tp * tp; a.syy += ip * ip; a.absT += Math.abs(tp); a.absI += Math.abs(ip);
              if (Math.abs(tp) > 0.12) { a.steep++; if (Math.abs(ip) < 0.4 * Math.abs(tp)) a.steepFlat++; }
            }
          }
          const x = te[o + 12], z = te[o + 14], ph = ga[g], spd = ga[g + 1];
          const p = prev.get(key);
          if (p && dt > 1e-4) {
            const d = Math.hypot(x - p.x, z - p.z);
            if (d < 3) {
              let dph = ph - p.ph; if (dph < -0.5) dph += 1; if (dph > 0.5) dph -= 1;
              if (d / dt > 0.6) { acc.moving++; acc.dist += d; acc.cyc += Math.abs(dph); acc.spdSum += spd; if (Math.abs(dph) > 1e-5) acc.advancing++; }
              else { acc.still++; if (Math.abs(dph) > 1e-5) acc.stillAdv++; }
            }
          }
          prev.set(key, { x, z, ph });
        }
      }
    });
  })()`);
  // swing the camera among herds so every species is drawn near
  const t0 = Date.now(); let step = 0;
  while ((Date.now() - t0) / 1000 < secs) {
    await page.evaluate((s) => {
      const E = window.__engine; const sp = s % 3;
      const ids = window.__find(sp === 0 ? 0 : sp === 1 ? 1 : 3);
      if (ids.length) window.__followId(ids[s % ids.length]);
      E.cam.setView({ distance: [30, 60, 20][s % 3], pitchDeg: 18 }, true);
    }, step++);
    await page.waitForTimeout(5000);
  }
  const res = await page.evaluate(() => {
    const d = [...window.__ap.dts].sort((a, b) => a - b);
    return { frames: d.length, p50: d[Math.floor(d.length * 0.5)], p95: d[Math.floor(d.length * 0.95)], sp: window.__ap.sp, slope: window.__ap.slope };
  });
  console.log(`frames ${res.frames}  dt p50 ${(res.p50 * 1000).toFixed(1)} ms  p95 ${(res.p95 * 1000).toFixed(1)} ms`);
  const rows = Object.entries(res.sp).map(([sp, a]) => ({ sp, movingFrames: a.moving, advancingPct: a.moving ? +(100 * a.advancing / a.moving).toFixed(1) : null, cyclesPerM: a.dist ? +(a.cyc / a.dist).toFixed(3) : null, meanGaitSpd: a.moving ? +(a.spdSum / a.moving).toFixed(2) : null, stillFrames: a.still, stillAdvancing: a.stillAdv }));
  console.table(rows);
  console.log('instance pitch vs terrain pitch along the heading (moving ground animals): gain = slope of regression, corr, steepFlat = share of steep (>7 deg) samples drawn nearly level');
  console.table(Object.entries(res.slope).map(([sp, a]) => ({ sp, n: a.n, meanAbsTerrainDeg: +(a.absT / a.n * 57.3).toFixed(2), meanAbsDrawnDeg: +(a.absI / a.n * 57.3).toFixed(2), gain: +(a.sxy / a.sxx).toFixed(2), corr: +(a.sxy / Math.sqrt(a.sxx * a.syy)).toFixed(2), steep: a.steep, steepFlatPct: a.steep ? +(100 * a.steepFlat / a.steep).toFixed(1) : null })));
  const snap = await page.evaluate(() => {
    const A = window.__animals, out = {};
    for (let sp = 0; sp < A.batches.length; sp++) {
      const b = A.batches[sp]; if (!b || !b.count) continue;
      const bd = [], lie = [], ys = [];
      for (let k = 0; k < b.count; k++) { bd.push(b.fx.array[k * 4 + 1]); lie.push(b.gait.array[k * 4 + 3]); }
      bd.sort((x, y) => x - y);
      out[sp] = { n: b.count, bdyMin: +bd[0].toFixed(3), bdyMed: +bd[bd.length >> 1].toFixed(3), bdyMax: +bd[bd.length - 1].toFixed(3), lieOver05: lie.filter((v) => v > 0.5).length };
    }
    return out;
  });
  console.log('end snapshot per species (bdy = body height offset m, lie = lying weight)'); console.table(snap);
  const shots = arg('shots', '');
  if (shots) {
    mkdirSync(resolve(shots), { recursive: true });
    await page.screenshot({ path: resolve(shots, 'probe.jpg'), type: 'jpeg', quality: 88 });
  }
  console.log('errors:', errors.length);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(0);
