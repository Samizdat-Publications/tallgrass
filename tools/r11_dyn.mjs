// R11 dynamic trees check: add / update / remove at run time with no mesh rebuild, burn hook, pool growth, stills.
// node tools/r11_dyn.mjs [outDir]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? 'review/wip/R11/dyn';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r11/.vitecache'), server: { port: 7500 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 600000);
let errors = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => { errors++; console.log('[exc]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[console.error]', m.text().slice(0, 300)); } });
  await page.goto(base + '/index.html?autocam=0&autoscale=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('h');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Interface hidden/.test(el.textContent || '')) { let n = el; while (n.parentElement && n.parentElement !== document.body && n.parentElement.children.length === 1) n = n.parentElement; n.style.display = 'none'; } });
  const res = await page.evaluate(async () => {
    window.__speed(0);
    const e = window.__engine, T = e.trees, out = {};
    const origSetEnv = e.setEnv.bind(e);
    e.setEnv = () => {};
    Object.assign(e.env, { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7, dayFrac: 0.3, season: 1.5 });
    e.applyEnvNow();
    const meshes0 = T.meshes.length, live0 = T.liveTrees, thick0 = T.thicketCount;
    out.start = { meshes: meshes0, live: live0, thickets: thick0, fillers: T.fillerCount, junipers: T.junipers };
    // a grove in the open ground in front of the 'low' camera
    e.cam.preset('low', true);
    for (let i = 0; i < 8; i++) e.renderOnce(0.016);
    const f = e.cam.getFocus(new e.camera.position.constructor());
    const ids = [];
    for (let k = 0; k < 14; k++) {
      const a = k * 2.399, r = 4 + 3.2 * Math.sqrt(k);
      ids.push(T.addTree({ x: f.x + 16 + Math.cos(a) * r, z: f.z + Math.sin(a) * r, h: 9 + (k % 5) * 1.6, r: 3.6 + (k % 4) * 0.5 }));
    }
    ids.push(T.addTree({ x: f.x + 30, z: f.z + 10, h: 7, r: 2.1, species: 'juniper' }));
    out.afterAdd = { live: T.liveTrees, meshes: T.meshes.length, thickets: T.thicketCount };
    for (let i = 0; i < 24; i++) e.renderOnce(0.016);
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 3; i++) e.renderOnce(0.016);
    out.shotGrove = true;
    return { out, ids, f: { x: f.x, z: f.z } };
  });
  console.log(JSON.stringify(res.out));
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, 'dyn_grove.jpg'), type: 'jpeg', quality: 90 });
  const res2 = await page.evaluate(async ({ ids }) => {
    const e = window.__engine, T = e.trees, out = {};
    // growth: two of them grow, one burns, one is felled
    T.updateTree(ids[0], { h: 15, r: 5.2 });
    T.updateTree(ids[1], { burned: true });
    T.updateTree(ids[2], { burned: true });
    T.updateTree(ids[3], { burned: true });
    T.removeTree(ids[4]);
    out.afterEdit = { live: T.liveTrees, has4: T.hasTree(ids[4]), spec1: T.getTree(ids[1]), meshes: T.meshes.length };
    for (let i = 0; i < 24; i++) e.renderOnce(0.016);
    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < 3; i++) e.renderOnce(0.016);
    return out;
  }, { ids: res.ids });
  console.log(JSON.stringify(res2));
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, 'dyn_edit.jpg'), type: 'jpeg', quality: 90 });
  // pool growth: add 1500 trees (past every pool's capacity), render, then remove them all
  const res3 = await page.evaluate(async ({ ids }) => {
    const e = window.__engine, T = e.trees, out = {};
    const m0 = T.meshes.length, live0 = T.liveTrees;
    const more = [];
    for (let k = 0; k < 1500; k++) more.push(T.addTree({ x: 20 + (k * 37) % 470, z: 20 + (k * 91) % 470, h: 8 + (k % 7), r: 3 + (k % 3) }));
    out.grown = { live: T.liveTrees, meshes: T.meshes.length, sameMeshes: T.meshes.length === m0 };
    for (let i = 0; i < 6; i++) e.renderOnce(0.016);
    for (const id of more) T.removeTree(id);
    for (let i = 0; i < 6; i++) e.renderOnce(0.016);
    out.afterRemove = { live: T.liveTrees, expected: live0 };
    // fire hook: veg bytes with a burning patch at a sim tree
    const w = e.world, n = w.n;
    const veg = new Uint8Array(n * n * 4);
    const tx = w.trees[0], tz = w.trees[1];
    const ci = Math.floor(tx / w.cell), cj = Math.floor(tz / w.cell);
    let hit = 0;
    for (let j = Math.max(0, cj - 3); j <= Math.min(n - 1, cj + 3); j++) for (let i = Math.max(0, ci - 3); i <= Math.min(n - 1, ci + 3); i++) veg[(j * n + i) * 4 + 2] = 255;
    T.setBurn(veg, n);
    let burned = 0;
    for (let i = 0; i < w.trees.length / 4; i++) if (T.getTree(i)?.burned) burned++;
    out.burn = { burned, liveAfter: T.liveTrees };
    return out;
  }, { ids: res.ids });
  console.log(JSON.stringify(res3));
  console.log('errors', errors);
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(0);
