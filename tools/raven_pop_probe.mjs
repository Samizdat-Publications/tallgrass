// Raven pop probe (r-rvpop): finds a kill with ravens feeding, parks the camera on it, and measures what pops between consecutive frames:
// a raven drawn further than a flier can fly in the frame (a jump), or a raven whose border-fade level jumps by 6 or more levels (of 15) in one frame
// (it appears or vanishes). It alternates the layer's ravenEase hook off (the old behaviour) and on, in the same session, so the two are comparable.
//   node tools/raven_pop_probe.mjs [--root dir] [--dist 40] [--pitch 25] [--secs 8] [--rounds 2] [--seed tallgrass] [--shot dir]
// Prints one JSON line per segment and a summary. Headless Chromium on the real GPU, every browser launch is under a hard timeout.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const dist = Number(arg('dist', '40')), pitch = Number(arg('pitch', '25')), secs = Number(arg('secs', '8')), rounds = Number(arg('rounds', '2'));
const seed = arg('seed', '');
const shot = arg('shot', '');
const kill = setTimeout(() => { console.error('raven_pop_probe: hard timeout'); process.exit(2); }, 10 * 60 * 1000);
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_rvpop'),
  server: { port: 6900 + Math.floor(Math.random() * 300), hmr: false, fs: { strict: false }, watch: { ignored: ['**/*'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let code = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('[exception]', e.message.slice(0, 200)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0' + (seed ? '&seed=' + seed : ''), { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(1000);
  await page.keyboard.press('h');
  // find a kill where at least 3 ravens are feeding within 10 m of each other
  await page.evaluate('window.__speed(10)');
  let site = null;
  for (let i = 0; i < 200 && !site; i++) {
    site = await page.evaluate(() => {
      const s = window.__snap(); if (!s) return null;
      const P = [];
      for (let k = 0; k < s.count; k++) { const o = k * 12; if (s.agents[o] === 2 && s.agents[o + 7] === 6) P.push([s.agents[o + 1], s.agents[o + 2]]); }
      for (const a of P) { let n = 0; for (const b of P) if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 10) n++; if (n >= 4) return a; }
      return null;
    });
    if (!site) await page.waitForTimeout(300);
  }
  if (!site) throw new Error('no raven kill found');
  await page.evaluate(([x, z, d, p]) => { window.__speed(1); const c = window.__engine.cam; c.flyTo(x, z, d, p); c.snap(); }, [site[0], site[1], dist, pitch]);
  await page.waitForTimeout(2500);
  const results = [];
  for (let r = 0; r < rounds; r++) {
    for (const ease of [false, true]) {
      const res = await page.evaluate(async ([ease, secs]) => {
        const L = window.__animals;
        L.ravenEase = ease;
        L.dbgRavens = [];
        const frames = [];
        let t0 = performance.now();
        await new Promise((done) => {
          const tick = () => {
            const now = performance.now();
            frames.push({ t: now, d: L.dbgRavens.splice(0) });
            if (now - t0 < secs * 1000) requestAnimationFrame(tick); else done();
          };
          requestAnimationFrame(tick);
        });
        L.dbgRavens = null;
        let solidSum = 0, totSum = 0, jumps = 0, fadePops = 0, maxJump = 0, maxSpeed = 0, nFrames = 0, visSum = 0, pairs = 0, fadeSteps = 0;
        let prev = null;
        for (const f of frames) {
          if (f.d.length === 0) continue;
          const cur = new Map();
          for (let i = 0; i < f.d.length; i += 5) cur.set(f.d[i], f.d.slice(i + 1, i + 5));
          nFrames++;
          totSum += cur.size; for (const v of cur.values()) { if (v[3] < 15) visSum++; if (v[3] < 4) solidSum++; }
          if (prev) {
            const dt = Math.max(0.005, (f.t - prev.t) / 1000);
            for (const [id, v] of cur) {
              const p = prev.m.get(id); if (!p) continue;
              pairs++;
              const dd = Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]), sp = dd / dt;
              if (v[3] < 15 || p[3] < 15) { maxJump = Math.max(maxJump, dd); maxSpeed = Math.max(maxSpeed, sp); if (sp > 40 && dd > 1.2) jumps++; }
              const df = Math.abs(v[3] - p[3]);
              if (df >= 6) fadePops++;
              if (df >= 1) fadeSteps++;
            }
          }
          prev = { t: f.t, m: cur };
        }
        return { ease, frames: nFrames, ravensTotal: +(totSum / Math.max(1, nFrames)).toFixed(1), solidPerFrame: +(solidSum / Math.max(1, nFrames)).toFixed(1), ravensPerFrame: +(visSum / Math.max(1, nFrames)).toFixed(1), pairs, jumps, fadePops, fadeSteps, maxJumpM: +maxJump.toFixed(2), maxSpeed: +maxSpeed.toFixed(1) };
      }, [ease, secs]);
      results.push(res);
      console.log(JSON.stringify(res));
      if (shot && r === 0) { mkdirSync(resolve(shot), { recursive: true }); await page.screenshot({ path: resolve(shot, `ease_${ease}_d${dist}.png`) }); }
    }
  }
  const sum = (e) => results.filter((x) => x.ease === e).reduce((a, x) => ({ frames: a.frames + x.frames, jumps: a.jumps + x.jumps, fadePops: a.fadePops + x.fadePops, pairs: a.pairs + x.pairs }), { frames: 0, jumps: 0, fadePops: 0, pairs: 0 });
  console.log('SUMMARY old', JSON.stringify(sum(false)), 'new', JSON.stringify(sum(true)));
} catch (e) { console.error('probe failed:', e.message); code = 1; }
finally { await browser.close(); await server.close(); clearTimeout(kill); }
process.exit(code);
