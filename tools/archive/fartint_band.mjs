// r-fartint-v1: the far band in the lights where the species ran together (clear midday, winter dusk on snow, heavy rain, dawn mist), with a
// per-species crop (bison, wolf, pronghorn, mule deer, coyote: the herd with the most of its kind in the frame, away from trees) per frame.
// The sim is held at a fixed tick, so before and after show the same animals. Same rig and flags as tools/farread_band.mjs.
//
//   node tools/fartint_band.mjs --out scratch/v1-fartint/before [--dist 120,170]
//
// Names: fa_<env>_<dist>.png, fac_<env>_<dist>_<species>.png (a 240x135 crop, enlarge when viewing).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/v1-fartint/shots'));
const dists = arg('dist', '120,170').split(',').map(Number);
const ENVS = {
  clear: { dayFrac: 0.45 },
  dusksnow: { season: 3.4, dayFrac: 0.7, warmth: 0.1 },
  heavyrain: { weather: 3, rain: 1, windStrength: 0.6, dayFrac: 0.45 },
  dawnfog: { dayFrac: 0.27, windStrength: 0.05 },
};
const WAIT = { clear: 4500, dusksnow: 9000, heavyrain: 16000, dawnfog: 12000 };
const lights = arg('envs', 'clear,dusksnow,heavyrain,dawnfog').split(',');
const W = 1600, H = 900;
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('fartint_band: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
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
  const SPP = [[0, 'bison'], [1, 'wolf'], [3, 'pron'], [10, 'deer'], [6, 'coy']];
  for (const L of lights) {
    let first = true;
    for (const d of dists) {
      const pitch = d <= 100 ? 24 : d <= 140 ? 26 : 28;
      const r = await page.evaluate(`window.__env(${JSON.stringify(ENVS[L])}); JSON.stringify(window.__rdRig(${d}, ${pitch}))`);
      await page.waitForTimeout(first ? WAIT[L] : 3500);
      first = false;
      await page.screenshot({ path: `${out}/fa_${L}_${d}.png` });
      // per species: project the herd animal (most of its kind within 40 m, few trees near) that is on screen between 0.8 and 1.5 x the view distance
      const picks = await page.evaluate(`(() => {
        const e = window.__engine, sn = window.__snap(), A = sn.agents, n = sn.count, T = e.world.trees, cp = e.camera.position;
        e.camera.updateMatrixWorld(); const out = {};
        for (const [sp, nm] of ${JSON.stringify(SPP)}) {
          const P = [];
          for (let k = 0; k < n; k++) if (A[k * 12] === sp) P.push([A[k * 12 + 1], A[k * 12 + 2]]);
          let best = null, bs = -1e9;
          for (const p of P) {
            const y = e.terrain.heightAt(p[0], p[1]) + 0.6;
            const v = new cp.constructor(p[0], y, p[1]); const dist = v.distanceTo(cp);
            v.project(e.camera);
            const sx = (v.x * 0.5 + 0.5) * ${W}, sy = (0.5 - v.y * 0.5) * ${H};
            if (v.z > 1 || sx < 130 || sx > ${W} - 130 || sy < 100 || sy > ${H} - 80 || dist < ${d} * 0.8 || dist > ${d} * 1.6) continue;
            let c = 0, tr = 0;
            for (const q of P) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 40) c++;
            for (let i = 0; i < T.length; i += 4) if (Math.hypot(T[i] - p[0], T[i + 1] - p[1]) < 25) tr++;
            const s = Math.min(c, 8) - 2 * tr - Math.abs(dist - ${d}) * 0.02;
            if (s > bs) { bs = s; best = [sx, sy, Math.round(dist)]; }
          }
          out[nm] = best;
        }
        return out;
      })()`);
      for (const [, nm] of SPP) {
        const b = picks[nm];
        if (!b) { console.log('no', nm, L, d); continue; }
        const cw = 240, ch = 135;
        const cx = Math.max(0, Math.min(W - cw, Math.round(b[0] - cw / 2))), cy = Math.max(0, Math.min(H - ch, Math.round(b[1] - ch / 2)));
        await page.screenshot({ path: `${out}/fac_${L}_${d}_${nm}.png`, clip: { x: cx, y: cy, width: cw, height: ch } });
      }
      console.log('saved', L, d, r, JSON.stringify(picks));
    }
  }
} catch (e) { console.error('failed:', e.message); code = 1; }
finally { await browser.close(); await server.close(); clearTimeout(kill); }
process.exit(code);
