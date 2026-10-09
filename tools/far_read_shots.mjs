// r-far-read stills: the far-view readability set (herd wide, evening wide, map top, 250 and 500 m, a herd at a pond, a blizzard by day
// and at night, the selection ring), JPEG q88, UI hidden unless --ui 1. One page load; day, season and weather are held by __env.
//
//   node tools/far_read_shots.mjs --out review/wip/far-read/after [--root dir] [--only a01,a06,...] [--ui 0|1]
//
// Names: a01 opening herd wide, a06 evening wide, a09 top map, a10 top map midday, m250 / m500 (herd from 250 and 500 m), wolves_top
// (a pack from the top), pond (bison in a pond, run fast until some stand in deep water), bz_day / bz_night / bz_low (blizzard), ring
// (a selected wolf, then a selected bison on a slope). Writes shots.json with what each shot looked at.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'scratch/far/shots'));
const ui = arg('ui', '0') === '1';
const only = arg('only', '') ? arg('only', '').split(',') : null;
const W = 1600, H = 900;
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('far_read_shots: hard timeout'); process.exit(2); }, 40 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_farread_' + Math.floor(Math.random() * 1e6)),
  server: { port: 6400 + Math.floor(Math.random() * 500), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
const report = {};
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[page exception]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 300)); } });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 480000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 480000 });
  if (!ui) await page.addStyleTag({ content: '#ui { display: none !important; }' });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => {
    const e = window.__engine;
    window.__env = (o) => {
      window.__envO = Object.assign({ season: 1.3, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.4 }, o);
      if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow();
    };
    window.__speed(1);
  })()`);
  const want = (n) => !only || only.includes(n);
  const shot = async (name) => page.screenshot({ path: resolve(out, name + '.jpg'), type: 'jpeg', quality: 88 });
  const run = async (name, code, wait) => { if (!want(name)) return false; await page.evaluate(code); await page.waitForTimeout(wait); await shot(name); return true; };

  await run('a01', "window.__env({ season: 1.8, dayFrac: 0.3 }); window.__followId(null); window.__select(null); window.__focusHerd()", 4500);
  await run('a06', "window.__env({ season: 1.8, dayFrac: 0.7 }); window.__cam('wide')", 4000);
  await run('a09', "window.__env({ season: 1.8, dayFrac: 0.7 }); window.__cam('top')", 4000);
  await run('a10', "window.__env({ season: 1.8, dayFrac: 0.4 }); window.__cam('top')", 4000);
  await run('m250', "window.__env({ season: 1.8, dayFrac: 0.4 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 250, pitchDeg: 30 }, true)", 4000);
  await run('m500', "window.__env({ season: 1.8, dayFrac: 0.4 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 500, pitchDeg: 40 }, true)", 4000);
  await run('m120', "window.__env({ season: 1.8, dayFrac: 0.4 }); window.__focusHerd(); window.__engine.cam.setView({ distance: 120, pitchDeg: 28 }, true)", 4000);

  if (want('wolves_top') || want('wolves_250')) {
    const c = await page.evaluate(() => {
      const w = window.__find(1); if (!w.length) return null;
      const v = window.__engine.camera.position.clone();
      window.__animals.getPosition(w[0], v);
      return { x: v.x, z: v.z, n: w.length };
    });
    report.wolves = c;
    if (c) {
      await run('wolves_top', `window.__env({ season: 1.8, dayFrac: 0.4 }); window.__followId(null); window.__engine.cam.setView({ x: ${c.x}, y: ${c.z}, distance: 420, pitchDeg: 89 }, true)`, 3500);
      await run('wolves_250', `window.__engine.cam.setView({ x: ${c.x}, y: ${c.z}, distance: 220, pitchDeg: 32 }, true)`, 3500);
    }
  }

  if (want('pond')) {
    // run the sim fast until some bison stand in water deeper than 0.7 m (a drawn-in-the-pond herd), then look at them
    let found = null;
    await page.evaluate("window.__env({ season: 1.8, dayFrac: 0.4 }); window.__speed(10)");
    for (let i = 0; i < 40 && !found; i++) {
      found = await page.evaluate(() => {
        const e = window.__engine, w = e.world, ids = window.__find(0);
        const v = e.camera.position.clone();
        const pts = [];
        for (const id of ids) {
          if (!window.__animals.getPosition(id, v)) continue;
          const ci = Math.min(w.n - 1, Math.max(0, Math.floor(v.z / w.cell))) * w.n + Math.min(w.n - 1, Math.max(0, Math.floor(v.x / w.cell)));
          if (w.water[ci] && w.waterHeight[ci] - e.terrain.heightAt(v.x, v.z) > 0.7) pts.push([v.x, v.z]);
        }
        if (pts.length < 3) return null;
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        return { x: cx, z: cz, n: pts.length };
      });
      if (!found) await page.waitForTimeout(1500);
    }
    report.pond = found;
    await page.evaluate('window.__speed(1)');
    if (found) {
      await page.evaluate(`window.__engine.cam.setView({ x: ${found.x}, y: ${found.z}, distance: 90, pitchDeg: 30 }, true)`);
      await page.waitForTimeout(3500);
      // how the layer sees them: the shore-offset weight and the visual speed of the bison that the sim has in deep water
      report.pondDiag = await page.evaluate(() => {
        const e = window.__engine, w = e.world, A = window.__animals, S = A.slots, v = e.camera.position.clone();
        const rows = [];
        for (const id of window.__find(0)) {
          if (!A.getPosition(id, v)) continue;
          const ci = Math.min(w.n - 1, Math.max(0, Math.floor(v.z / w.cell))) * w.n + Math.min(w.n - 1, Math.max(0, Math.floor(v.x / w.cell)));
          const depth = w.water[ci] ? w.waterHeight[ci] - e.terrain.heightAt(v.x, v.z) : -1;
          if (depth > 0.6) { const s = S.map.get(id); rows.push({ depth: +depth.toFixed(2), snw: +S.snw[s].toFixed(2), vis: +S.vis[s].toFixed(2), lie: +S.lie[s].toFixed(2) }); }
        }
        return { n: rows.length, rows: rows.slice(0, 12) };
      });
      await shot('pond_90');
      await page.evaluate(`window.__engine.cam.setView({ x: ${found.x}, y: ${found.z}, distance: 220, pitchDeg: 35 }, true)`);
      await page.waitForTimeout(2500);
      await shot('pond_220');
    } else console.log('no bison in a pond found');
  }

  const bz = (o, extra) => `window.__select(null); window.__followId(null); window.__env(Object.assign({ season: 3.4, weather: 4, windStrength: 0.95, rain: 0, warmth: 0.2 }, ${JSON.stringify(o)})); ${extra}`;
  // a blizzard needs a few real seconds to ease in (snowfall and snow cover)
  if (want('bz_day') || want('bz_night') || want('bz_low') || want('bz_top')) {
    await page.evaluate(bz({ dayFrac: 0.4 }, 'window.__focusHerd()'));
    await page.waitForTimeout(9000);
    await run('bz_day', "window.__engine.cam.setView({ distance: 150, pitchDeg: 30 }, true)", 3000);
    await run('bz_low', "window.__engine.cam.preset('low', true)", 3000);
    await run('bz_top', "window.__cam('top')", 3000);
    await run('bz_night', bz({ dayFrac: 0.95 }, "window.__focusHerd()"), 5000);
  }
  await page.evaluate("window.__env({ season: 1.8, dayFrac: 0.4, weather: 0 }); window.__speed(1)");
  await page.waitForTimeout(6000);

  if (want('ring')) {
    const id = await page.evaluate(() => { const c = window.__find(1, 5).concat(window.__find(1, 10)).concat(window.__find(1)); return c[0] ?? null; });
    if (id !== null) {
      await page.evaluate(`window.__select(${id}); window.__followId(${id}); window.__engine.cam.setView({ distance: 30, pitchDeg: 22 }, true)`);
      await page.waitForTimeout(6000);
      await shot('ring_wolf');
      await page.evaluate(`window.__engine.cam.setView({ distance: 14, pitchDeg: 38 }, true)`);
      await page.waitForTimeout(2500);
      await shot('ring_wolf_close');
    }
    const bid = await page.evaluate(() => { const c = window.__find(0, 1).concat(window.__find(0)); return c[0] ?? null; });
    if (bid !== null) {
      await page.evaluate(`window.__select(${bid}); window.__followId(${bid}); window.__engine.cam.setView({ distance: 24, pitchDeg: 25 }, true)`);
      await page.waitForTimeout(6000);
      await shot('ring_bison');
    }
  }
  writeFileSync(resolve(out, 'shots.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report));
  console.log('shots in', out, 'errors:', errors.length);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(0);
