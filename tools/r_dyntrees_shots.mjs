// R dynamic trees (S13) check: stills of the creek groves at year 0 and after many valley years with dynamicTrees on, a fire and its snags,
// and the default world (dynamicTrees 0) for comparison. Reports the drawn tree counts and the cost of a list rebuild.
//   node tools/r_dyntrees_shots.mjs [outDir] [--years 40]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const argv = process.argv.slice(2);
const outDir = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'review/wip/dyntrees';
const yi = argv.indexOf('--years');
const YEARS = yi >= 0 ? Number(argv[yi + 1]) : 40;
mkdirSync(outDir, { recursive: true });
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r11/.vitecache'), server: { port: 7800 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 900000);
let errors = 0;

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => { errors++; console.log('[exc]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[console.error]', m.text().slice(0, 300)); } });
  await page.goto(`${base}/index.html?autocam=0&autoscale=0&grass=1${query}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('h');
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Interface hidden/.test(el.textContent || '')) { let n = el; while (n.parentElement && n.parentElement !== document.body && n.parentElement.children.length === 1) n = n.parentElement; n.style.display = 'none'; }
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    Object.assign(e.env, { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7, dayFrac: 0.3, season: 1.5 });
    e.applyEnvNow();
    // time every list rebuild
    const T = e.trees, orig = T.setDynamic.bind(T);
    window.__dynMs = [];
    T.setDynamic = (l, v) => { const t0 = performance.now(); orig(l, v); if (l) { window.__dynMs.push(+(performance.now() - t0).toFixed(2)); window.__lastTrees = l; window.__lastVer = v; } };
  });
  return page;
}

/** Aim at (x, z) in world coordinates from the given yaw, pitch and distance and let a few frames settle. */
async function look(page, x, z, dist, pitch, yaw, name) {
  await page.evaluate(({ x, z, dist, pitch, yaw }) => {
    const e = window.__engine;
    e.cam.setView({ x, y: z, yawDeg: yaw, pitchDeg: pitch, distance: dist }, true);
    for (let i = 0; i < 30; i++) e.renderOnce(0.016);
  }, { x, z, dist, pitch, yaw });
  await page.waitForTimeout(600);
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__engine.renderOnce(0.016); });
  await page.screenshot({ path: resolve(outDir, name + '.jpg'), type: 'jpeg', quality: 88 });
}

/** Advance the sim by `ticks` (synchronously in the worker) and wait for the next snapshot. */
async function step(page, ticks) {
  const t0 = await page.evaluate(() => window.__snap().tick);
  await page.evaluate((n) => window.__step(n), ticks);
  await page.waitForFunction((t) => window.__snap().tick >= t, t0 + ticks, { timeout: 600000 });
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__engine.renderOnce(0.016); });
}

const counts = (page) => page.evaluate(() => {
  const T = window.__engine.trees, s = window.__snap();
  const o = { live: T.liveTrees, treesVersion: s.treesVersion, tick: s.tick, dynMs: window.__dynMs.slice(-6) };
  const L = window.__lastTrees;
  if (L) {
    const st = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k < L.length; k += 6) st[L[k + 5]]++;
    o.stages = st;
  }
  return o;
});

try {
  // the best grove: the creek-side spot with the most cottonwoods within 40 m
  const probe = await open('');
  const grove = await probe.evaluate(() => {
    const w = window.__engine.world, tr = w.trees, S = w.size, cr = w.creek;
    let best = -1, bx = S / 2, bz = S / 2;
    for (let k = 3; k < cr.length / 2 - 3; k += 2) {
      const x = cr[2 * k], z = cr[2 * k + 1];
      if (x < 60 || z < 60 || x > S - 60 || z > S - 60) continue;
      let n = 0;
      for (let i = 0; i < tr.length; i += 4) if (Math.hypot(tr[i] - x, tr[i + 1] - z) < 40) n++;
      if (n > best) { best = n; bx = x; bz = z; }
    }
    return { x: bx, z: bz, n: best };
  });
  console.log('grove', JSON.stringify(grove));
  await look(probe, grove.x, grove.z, 110, 24, 200, 'default_y0_wide');
  await look(probe, grove.x, grove.z, 45, 14, 200, 'default_y0_close');
  console.log('default', JSON.stringify(await counts(probe)));
  await probe.close();

  const P = '&p=dynamicTrees:1,springFloods:1,stormCells:1,treeCwRecruit:0.003';
  const page = await open(P);
  const c0 = await counts(page);
  console.log('dyn y0', JSON.stringify(c0));
  await look(page, grove.x, grove.z, 110, 24, 200, 'dyn_y0_wide');
  await look(page, grove.x, grove.z, 45, 14, 200, 'dyn_y0_close');

  // many valley years: YEAR_TICKS from the page
  const yt = await page.evaluate(() => window.__snap().env && 0); void yt;
  const YEAR = 4800; // calendarScale 2 x 2400 base ticks per valley year
  const per = 4;
  for (let y = 0; y < YEARS; y += per) await step(page, YEAR * per);
  const cN = await counts(page);
  console.log(`dyn after ${YEARS} years`, JSON.stringify(cN));
  // aim at the densest cluster of young trees (stage 0..2) near water, else the grove
  const young = await page.evaluate(() => {
    const L = window.__lastTrees;
    if (!L) return null;
    const pts = [];
    for (let k = 0; k < L.length; k += 6) if (L[k + 5] <= 2 && L[k + 4] === 0) pts.push([L[k], L[k + 1]]);
    let best = -1, bx = 0, bz = 0;
    for (const [x, z] of pts) {
      let n = 0;
      for (const [a, b] of pts) if (Math.hypot(a - x, b - z) < 18) n++;
      if (n > best) { best = n; bx = x; bz = z; }
    }
    return { x: bx, z: bz, n: best, total: pts.length };
  });
  console.log('young cluster', JSON.stringify(young));
  await look(page, grove.x, grove.z, 110, 24, 200, 'dyn_late_grove_wide');
  await look(page, grove.x, grove.z, 45, 14, 200, 'dyn_late_grove_close');
  if (young && young.n > 0) {
    await look(page, young.x, young.z, 60, 20, 200, 'dyn_late_young_wide');
    await look(page, young.x, young.z, 22, 12, 200, 'dyn_late_young_close');
  }

  // shade follows the living trees: the terrain and grass cover channels against the sim's treeCover, and against the baked static field
  console.log('cover', JSON.stringify(await page.evaluate(() => {
    const e = window.__engine, w = e.world, n = w.n, d = e.terrain.staticTex.image.data, g = window.__grass.stat0.image.data;
    let diffBaked = 0, maxDiffTG = 0, sum = 0, sumBaked = 0;
    for (let k = 0; k < n * n; k++) {
      const baked = Math.round(Math.max(0, Math.min(1, w.cover[k])) * 255);
      if (Math.abs(d[k * 4 + 1] - baked) > 20) diffBaked++;
      maxDiffTG = Math.max(maxDiffTG, Math.abs(d[k * 4 + 1] - g[k * 4 + 2]));
      sum += d[k * 4 + 1]; sumBaked += baked;
    }
    return { cellsChangedOver20: diffBaked, of: n * n, terrainVsGrassMaxDiff: maxDiffTG, meanNow: +(sum / (n * n)).toFixed(2), meanBaked: +(sumBaked / (n * n)).toFixed(2) };
  })));
  // fire in the young stand: the small trees die (gone), the big ones mostly live; then the snags
  if (young && young.n > 0) {
    await page.evaluate(({ x, z }) => window.__apply({ kind: 'fire', x, y: z }), { x: young.x, z: young.z });
    await step(page, 100);
    await look(page, young.x, young.z, 60, 20, 200, 'dyn_fire_young_wide');
    await step(page, 1400);
    console.log('after fire in the young stand', JSON.stringify(await counts(page)));
    await look(page, young.x, young.z, 60, 20, 200, 'dyn_afterfire_young_wide');
  }
  await page.evaluate(({ x, z }) => window.__apply({ kind: 'fire', x, y: z }), { x: grove.x, z: grove.z });
  await step(page, 120);
  await look(page, grove.x, grove.z, 110, 24, 200, 'dyn_fire_wide');
  await step(page, 1200);
  console.log('dyn after fire', JSON.stringify(await counts(page)));
  // the snag nearest the grove (any: the list carries aged-out snags too)
  const snag = await page.evaluate(({ x, z }) => {
    const L = window.__lastTrees;
    let best = 1e9, bx = 0, bz = 0, h = 0;
    for (let k = 0; k < L.length; k += 6) if (L[k + 5] === 4 && L[k + 4] !== 1) { const d = Math.hypot(L[k] - x, L[k + 1] - z); if (d < best) { best = d; bx = L[k]; bz = L[k + 1]; h = L[k + 2]; } }
    return best < 1e9 ? { x: bx, z: bz, h, d: Math.round(best) } : null;
  }, { x: grove.x, z: grove.z });
  console.log('snag', JSON.stringify(snag));
  await look(page, grove.x, grove.z, 110, 24, 200, 'dyn_snags_wide');
  if (snag) {
    await look(page, snag.x, snag.z, 30, 10, 200, 'dyn_snag_close');
    await look(page, snag.x, snag.z, 70, 18, 120, 'dyn_snag_mid');
  }
  // a full diff pass over an unchanged list (every slot compared, nothing re-seated), then a forced full rebuild of every tree
  console.log('full diff, nothing changed (ms)', JSON.stringify(await page.evaluate(() => {
    const T = window.__engine.trees, L = window.__lastTrees, v = window.__lastVer;
    const t0 = performance.now(); T.dynVersion = -1; T.setDynamic(L, v); const a = performance.now() - t0;
    const live = T.liveTrees;
    // force every tree to be re-seated: shrink every recorded height so each slot differs
    for (const rec of T.recs.values()) rec.spec.h *= 0.5;
    const t1 = performance.now(); T.dynVersion = -1; T.setDynamic(L, v); const b = performance.now() - t1;
    return { same: +a.toFixed(2), allReseated: +b.toFixed(2), live, liveAfter: T.liveTrees };
  })));
  console.log('rebuild ms (all)', JSON.stringify(await page.evaluate(() => window.__dynMs)));
  console.log('errors', errors);
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(errors ? 1 : 0);
