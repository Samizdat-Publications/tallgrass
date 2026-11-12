// R7 animal fidelity stills (JPEG q90): bison at 15 m side-lit and backlit at golden hour, a bison herd at 40 m, pronghorn, wolf, coyote and
// cougar close, and a far herd view. Runs the real game on the GPU in headless Chromium; the sim is stepped a little then frozen, and every
// still is staged on the frozen snapshot (render only). A before and an after run use the same seed, so the animals are the same.
//   node tools/r7_stills.mjs --out review/wip/R7 --tag after [--only bison,herd,pronghorn,wolf,coyote,cougar,far,lod] [--seed 3] [--size 1600x900]
// Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R7'));
const tag = arg('tag', 'after');
const only = new Set(arg('only', 'bison,herd,pronghorn,wolf,coyote,cougar,far').split(','));
const seed = arg('seed', '3');
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
// the spot each close-up is staged at is remembered in spots.json (next to the stills) so a before and an after run frame the same ground
const spotsFile = resolve(out, 'spots.json');
const spots = existsSync(spotsFile) ? JSON.parse(readFileSync(spotsFile, 'utf8')) : {};
const kill = setTimeout(() => { console.error('r7_stills: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r7'),
  server: { port: 6400 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
try {
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 300)); });
  await page.goto(base + `/index.html?autoscale=0&autocam=0&seed=${seed}&p=coyote.initial:12,cougar.initial:4,smallPrey:1`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log('GL renderer:', info);
  await page.evaluate(() => { const e = window.__engine; e.setEnv = () => {}; Object.assign(e.env, { dayFrac: 0.3, season: 1.6, weather: 0, rain: 0, windStrength: 0.25 }); e.applyEnvNow(); });
  await page.evaluate(() => { window.__speed(0); window.__step(1500); });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    Object.defineProperty(window.__animals, 'timeScale', { get: () => 1, set: () => {} });
    window.__engine.stop();
    window.__stage = {
      alone: (sp, clear = 28) => { const s = window.__animals.curr, r = []; for (let k = 0; k < s.count; k++) { const o = k * 12; if (s.agents[o] !== sp) continue; let ok = true; for (let j = 0; j < s.count && ok; j++) { if (j === k) continue; const q = j * 12; if (Math.hypot(s.agents[q + 1] - s.agents[o + 1], s.agents[q + 2] - s.agents[o + 2]) < clear && s.agents[q] !== 7 && s.agents[q] !== 4 && s.agents[q] !== sp) ok = false; } if (ok) r.push(k); } return r; },
      idx: (sp) => { const s = window.__animals.curr, r = []; for (let k = 0; k < s.count; k++) if (s.agents[k * 12] === sp) r.push(k); return r; },
      get: (k) => { const s = window.__animals.curr, o = k * 12; return { k, id: s.ids[k], x: s.agents[o + 1], z: s.agents[o + 2], h: s.agents[o + 3], spd: s.agents[o + 4], sc: s.agents[o + 5], st: s.agents[o + 7], fl: s.agents[o + 8] }; },
      set: (k, o2) => { const s = window.__animals.curr, o = k * 12; for (const [f, v] of Object.entries(o2)) s.agents[o + { x: 1, z: 2, h: 3, spd: 4, sc: 5, coat: 6, st: 7, fl: 8, alt: 9, en: 10 }[f]] = v; },
      frames: async (n, dt = 0.1) => { for (let i = 0; i < n; i++) { window.__engine.renderOnce(dt); if (i % 20 === 19) await new Promise((r) => setTimeout(r, 5)); } },
      sunYaw: () => { const l = window.__engine.uniforms.lightDir.value; return Math.atan2(l.x, l.z) * 57.3; },
      // the biggest cluster of bison on open ground (no tree within 25 m): the view target for the herd shots
      herd: () => {
        const s = window.__animals.curr, w = window.__engine.world; const pts = [];
        for (let k = 0; k < s.count; k++) if (s.agents[k * 12] === 0) pts.push([s.agents[k * 12 + 1], s.agents[k * 12 + 2]]);
        let best = null;
        for (const [x, z] of pts) {
          let n = 0; for (const [x2, z2] of pts) if (Math.hypot(x2 - x, z2 - z) < 22) n++;
          let tn = 1e9; for (let i = 0; i < w.trees.length; i += 4) tn = Math.min(tn, Math.hypot(w.trees[i] - x, w.trees[i + 1] - z));
          const sc = n - (tn < 30 ? 40 : 0);
          if (!best || sc > best.sc) best = { sc, x, z, n };
        }
        window.__herdAt = best; window.__engine.cam.setView({ x: best.x, y: best.z }, true);
        return best;
      },
      look: (x, z, d, pitch, yaw) => window.__engine.cam.setView({ x, y: z, distance: d, pitchDeg: pitch, yawDeg: yaw }, true),
    };
  });
  const pops = await page.evaluate(() => ({ pop: Array.from(window.__snap().pop), idx: [0, 1, 3, 5, 6].map((s) => window.__stage.idx(s).length) }));
  console.log('population', JSON.stringify(pops));
  await page.addStyleTag({ content: '#ui { display: none !important; }' });
  const shot = async (name, wait = 250, clipAt = null) => {
    await page.evaluate(() => window.__stage.frames(10, 0.001)); // let the temporal AA settle
    await page.waitForTimeout(wait);
    const p = `${out}/${tag}_${name}.jpg`;
    let clip;
    if (clipAt) {
      const sp3 = await page.evaluate(([x, z, hh]) => { const e = window.__engine; const v = new e.camera.position.constructor(x, hh, z); v.project(e.camera); return { sx: (v.x * 0.5 + 0.5) * window.innerWidth, sy: (-v.y * 0.5 + 0.5) * window.innerHeight }; }, clipAt);
      const cw = Math.round(W * 0.56), ch = Math.round(H * 0.56);
      clip = { x: Math.max(0, Math.min(W - cw, Math.round(sp3.sx - cw / 2))), y: Math.max(0, Math.min(H - ch, Math.round(sp3.sy - ch / 2))), width: cw, height: ch };
    }
    await page.screenshot({ path: p, type: 'jpeg', quality: 90, clip });
    console.log('saved', p);
  };
  // stage one animal: standing (idle, head up), broadside to a camera at yaw sunYaw + yawOff, with the camera at d metres
  const closeup = async (name, sp, d, pitch, yawOff, o = {}) => {
    const c = await page.evaluate(([sp2, st2, hOff, fixed]) => {
      const S = window.__stage;
      const all = S.idx(sp2);
      if (!all.length) return null;
      const k = all[0];
      // move it to the clearest gentle ground within 160 m (a close-up with a clean background: nothing else of any species within ~30 m)
      const s = window.__animals.curr, w = window.__engine.world ?? window.__world;
      const o0 = k * 12, x0 = s.agents[o0 + 1], z0 = s.agents[o0 + 2];
      let best = fixed ? { sc: 0, x: fixed[0], z: fixed[1], md: -1 } : null;
      if (!fixed) for (let gx = -160; gx <= 160; gx += 8) for (let gz = -160; gz <= 160; gz += 8) {
        const x = x0 + gx, z = z0 + gz;
        if (x < 80 || z < 80 || x > w.size - 80 || z > w.size - 80) continue;
        const ci = Math.min(w.n - 1, Math.max(0, Math.floor(x / (w.size / w.n)))), cj = Math.min(w.n - 1, Math.max(0, Math.floor(z / (w.size / w.n))));
        if (w.water[cj * w.n + ci] || w.slope[cj * w.n + ci] > 0.18) continue;
        let tn = 1e9; for (let i = 0; i < w.trees.length; i += 4) tn = Math.min(tn, Math.hypot(w.trees[i] - x, w.trees[i + 1] - z)); if (tn < 45) continue;
        let md = 60;
        for (let j = 0; j < s.count; j++) { if (j === k) continue; const q = j * 12; md = Math.min(md, Math.hypot(s.agents[q + 1] - x, s.agents[q + 2] - z)); }
        const sc = md - Math.hypot(gx, gz) * 0.05;
        if (!best || sc > best.sc) best = { sc, x, z, md };
      }
      if (best) { S.set(k, { x: best.x, z: best.z }); }
      S.set(k, { st: st2, spd: 0 });
      return { ...S.get(k), clear: best ? best.md : -1 };
    }, [sp, o.st ?? 0, o.hOff ?? 0, spots['sp' + sp] ?? null]);
    if (c && !spots['sp' + sp]) { spots['sp' + sp] = [c.x, c.z]; writeFileSync(spotsFile, JSON.stringify(spots)); }
    if (!c) { console.log('no animal of species', sp, 'for', name); return; }
    console.log(name, JSON.stringify(c));
    await page.evaluate(async ([c2, d2, pitch2, yawOff2, hOff]) => {
      const S = window.__stage;
      const yaw = S.sunYaw() + yawOff2;
      S.set(c2.k, { h: -(yaw * Math.PI) / 180 + hOff });
      S.look(c2.x, c2.z, d2, pitch2, yaw);
      await S.frames(30, 0.1);
      S.look(c2.x, c2.z, d2, pitch2, yaw);
    }, [c, d, pitch, yawOff, o.hOff ?? 0.35]);
    const gy = await page.evaluate(([x, z]) => window.__engine.terrain.heightAt(x, z), [c.x, c.z]);
    await shot(name, 150, [c.x, c.z, gy + 0.9 * (c.sc ?? 1)]);
  };

  if (only.has('bisonq')) {
    await closeup('01_bison_15m_side', 0, 15, 9, 55);
    await closeup('02_bison_15m_back', 0, 15, 9, 165, { hOff: 0.5 });
    await closeup('02b_bison_6m_head', 0, 6.5, 6, 40, { hOff: 0.7 });
  }
  if (only.has('bison')) {
    await closeup('01_bison_15m_side', 0, 15, 9, 55);
    await closeup('02_bison_15m_back', 0, 15, 9, 165, { hOff: 0.5 });
    await closeup('02b_bison_6m_head', 0, 6.5, 6, 40, { hOff: 0.7 });
  }
  if (only.has('herd')) {
    await page.evaluate(() => { window.__followId(null); window.__stage.herd(); });
    await page.evaluate(async () => { const S = window.__stage, c = window.__engine.cam; c.setView({ distance: 40, pitchDeg: 17, yawDeg: S.sunYaw() + 70 }, true); await S.frames(40, 0.1); c.setView({ distance: 40, pitchDeg: 17, yawDeg: S.sunYaw() + 70 }, true); });
    await shot('03_herd_40m', 200);
    await page.evaluate(async () => { const S = window.__stage, c = window.__engine.cam; c.setView({ distance: 28, pitchDeg: 11, yawDeg: S.sunYaw() + 150 }, true); await S.frames(10, 0.1); });
    await shot('03b_herd_28m_back', 200);
  }
  if (only.has('pronghorn')) await closeup('04_pronghorn_close', 3, 6.5, 8, 55);
  if (only.has('wolf')) await closeup('05_wolf_close', 1, 5.5, 8, 55);
  if (only.has('coyote')) await closeup('06_coyote_close', 6, 4.5, 8, 55);
  if (only.has('cougar')) await closeup('07_cougar_close', 5, 6, 8, 55);
  if (only.has('far')) {
    await page.evaluate(() => { window.__followId(null); window.__stage.herd(); });
    await page.evaluate(async () => { const S = window.__stage, c = window.__engine.cam; c.setView({ distance: 140, pitchDeg: 24, yawDeg: S.sunYaw() + 40 }, true); await S.frames(40, 0.1); c.setView({ distance: 140, pitchDeg: 24, yawDeg: S.sunYaw() + 40 }, true); });
    await shot('08_herd_far_140m', 200);
  }
  if (only.has('lod')) {
    // a dolly out from a herd: stills at distances straddling the LOD fade, to eyeball a pop (and a number: the biggest frame to frame change)
    await page.evaluate(() => { window.__followId(null); window.__stage.herd(); });
    for (const d of [34, 46, 56, 66, 78, 100]) {
      await page.evaluate(async (d2) => { const S = window.__stage, c = window.__engine.cam; c.setView({ distance: d2, pitchDeg: 17, yawDeg: S.sunYaw() + 70 }, true); await S.frames(6, 0.1); }, d);
      await shot(`09_lod_${String(d).padStart(3, '0')}m`, 100);
    }
  }
} catch (e) {
  console.error('r7_stills failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
process.exit(code || (errors.length ? 3 : 0));
