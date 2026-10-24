// r-farread-v1: the 60 to 220 m band at several lights. The sim is held at a fixed tick (same animals before and after), the camera is put
// over the wolf with the most bison and pronghorn round it, and one JPEG per (light, distance) is written. UI hidden.
//
//   node tools/farread_band.mjs --out scratch/v1-farread/before [--dist 80,120,160,210] [--lights dawn,mid,gold,dusk]
//
// Names: fb_<light>_<dist>.jpg, plus fb_<light>_<species>_<dist> follow frames with --follow 1.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/v1-farread/shots'));
const dists = arg('dist', '80,120,160,210').split(',').map(Number);
const LIGHTS = { dawn: 0.27, mid: 0.45, gold: 0.62, dusk: 0.7, night: 0.95, winter: 0.42 };
const lights = arg('lights', 'dawn,mid,gold,dusk').split(',');
const follow = arg('follow', '0') === '1';
const W = 1600, H = 900;
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('farread_band: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5900 + Math.floor(Math.random() * 400), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_fb_' + Math.floor(Math.random() * 1e6)) });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(async () => {
    const e = window.__engine;
    window.__env = (o) => {
      window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: 0.7 }, o);
      if (!window.__envHook) window.__envHook = e.onFrame(() => e.setEnv(window.__envO));
      e.setEnv(window.__envO); e.applyEnvNow();
    };
    window.__speed(0); await new Promise((r) => setTimeout(r, 1200)); window.__step(Math.max(0, 1200 - window.__snap().tick)); window.__followId(null); window.__env({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    window.__rdRig = (dist, pitch, R) => {
      const sn = window.__snap(), A = sn.agents, n = sn.count, r = R || 60;
      const P = { 0: [], 1: [], 3: [], 6: [], 10: [] };
      for (let k = 0; k < n; k++) { const o = k * 12, s = A[o]; if (P[s]) P[s].push([A[o + 1], A[o + 2]]); }
      let best = null, bs = -1;
      for (const w of P[1]) {
        const c = (L) => L.reduce((a, q) => a + (Math.hypot(q[0] - w[0], q[1] - w[1]) < r ? 1 : 0), 0);
        const b = c(P[0]), p = c(P[3]);
        const sc = Math.min(b, 12) * Math.min(p, 12) + 0.1 * (b + p);
        if (sc > bs) { bs = sc; best = [w[0], w[1], b, p]; }
      }
      if (!best) return null;
      window.__cam('wide');
      e.cam.setView({ x: best[0], y: best[1], distance: dist, pitchDeg: pitch }, true);
      return best;
    };
    window.__rdFollow = (sp, dist, pitch) => {
      const sn = window.__snap(), A = sn.agents, n = sn.count, P = [], T = e.world.trees;
      for (let k = 0; k < n; k++) if (A[k * 12] === sp) P.push([k, A[k * 12 + 1], A[k * 12 + 2]]);
      let best = -1, bs = -1e9;
      for (const p of P) {
        let c = 0, tr = 0;
        for (const q of P) if (Math.hypot(p[1] - q[1], p[2] - q[2]) < 40) c++;
        for (let i = 0; i < T.length; i += 4) if (Math.hypot(T[i] - p[1], T[i + 1] - p[2]) < 25) tr++;
        const s = Math.min(c, 8) - 2 * tr;
        if (s > bs) { bs = s; best = p[0]; }
      }
      if (best < 0) return null;
      window.__followId(null); window.__cam('wide');
      e.cam.setView({ x: A[best * 12 + 1], y: A[best * 12 + 2], distance: dist, pitchDeg: pitch }, true);
      return [best, bs];
    };
    await new Promise((r) => { let last = -1, same = 0, n = 0; const t = setInterval(() => { const sn = window.__snap && window.__snap(); const k = sn ? sn.tick : -2; if (k === last) same++; else { same = 0; last = k; } if ((same >= 5 && k >= 1200) || ++n > 240) { clearInterval(t); r(); } }, 500); });
  })()`);
  await page.waitForTimeout(3000);
  for (const L of lights) {
    for (const d of dists) {
      const pitch = d <= 100 ? 24 : d <= 140 ? 26 : 28;
      const r = await page.evaluate(`window.__env({ dayFrac: ${LIGHTS[L]} }); JSON.stringify(window.__rdRig(${d}, ${pitch}))`);
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${out}/fb_${L}_${d}.jpg`, type: 'jpeg', quality: 92 });
      // a crop around the rig's wolf (projected to the screen), for the contact sheet
      const sp = await page.evaluate(`(() => { const e = window.__engine, b = JSON.parse('${r}'); const v = new e.camera.position.constructor(b[0], e.terrain.heightAt(b[0], b[1]) + 0.6, b[1]); v.project(e.camera); return [(v.x * 0.5 + 0.5) * ${W}, (0.5 - v.y * 0.5) * ${H}]; })()`);
      const cw = 480, ch = 270;
      const cx = Math.max(0, Math.min(W - cw, Math.round(sp[0] - cw / 2))), cy = Math.max(0, Math.min(H - ch, Math.round(sp[1] - ch / 2)));
      await page.screenshot({ path: `${out}/fbc_${L}_${d}.png`, clip: { x: cx, y: cy, width: cw, height: ch } });
      console.log('saved', L, d, r);
    }
    if (follow) {
      for (const [sp, nm] of [[0, 'bison'], [1, 'wolf'], [3, 'pron'], [10, 'deer'], [6, 'coy']]) {
        for (const d of [90, 130, 190]) {
          const r = await page.evaluate(`window.__env({ dayFrac: ${LIGHTS[L]} }); JSON.stringify(window.__rdFollow(${sp}, ${d}, 26))`);
          await page.waitForTimeout(3000);
          if (r === 'null') { console.log('no animal', nm); continue; }
          const sp2 = await page.evaluate(`(() => { const e = window.__engine, b = ${r}; const A = window.__snap().agents; const o = b[0] * 12; const x = A[o + 1], z = A[o + 2]; const v = new e.camera.position.constructor(x, e.terrain.heightAt(x, z) + 0.6, z); v.project(e.camera); return [(v.x * 0.5 + 0.5) * ${W}, (0.5 - v.y * 0.5) * ${H}]; })()`);
          const cw = 320, ch = 180;
          const cx = Math.max(0, Math.min(W - cw, Math.round(sp2[0] - cw / 2))), cy = Math.max(0, Math.min(H - ch, Math.round(sp2[1] - ch / 2)));
          await page.screenshot({ path: `${out}/fbs_${L}_${nm}_${d}.png`, clip: { x: cx, y: cy, width: cw, height: ch } });
          console.log('saved', L, nm, d);
        }
      }
    }
  }
} catch (e) { console.error('failed:', e.message); code = 1; }
finally { await browser.close(); await server.close(); clearTimeout(kill); }
process.exit(code);
