// Interleaved GPU A/B of the trees3 layer inside ONE page load (so another process using the GPU, thermals and clock changes hit both
// sides alike). The page is built with ?trees3=1, which holds both the lump trees and the branching trees; Trees.setTrees3(false/true)
// switches between them at run time. Per view: ROUNDS rounds of (off, on) or (on, off) alternately, each FRAMES timed frames
// (EXT_disjoint_timer_query_webgl2). Reports the median of each side and the paired deltas (on minus off).
//
//   node tools/trees3bench.mjs [--size 2560x1440] [--out file.json] [--rounds 6] [--frames 30] [--views wide_golden,low_golden]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
const ROUNDS = Number(arg('rounds', 6));
const FRAMES = Number(arg('frames', 30));
const outFile = arg('out', null);
const query = arg('query', '');
const only = arg('views', '').split(',').filter(Boolean);
const variant = arg('variant', ''); // experiments: which part of the layer to leave out of the 'on' side (see the VARIANTS table in the page code)

const VIEW_SETUPS = {
  wide_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  low_golden: `() => { e.cam.preset('low', true); }`,
  herd: `() => { window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true); }`,
  top: `() => { e.cam.preset('top', true); }`,
  winter: `() => { Object.assign(e.env, { dayFrac: 0.34, season: 3.2, weather: 4 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  night: `() => { Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__focusHerd(); }`,
  blizzard: `() => { Object.assign(e.env, { dayFrac: 0.4, season: 3.4, weather: 4, windStrength: 0.95 }); e.applyEnvNow(); e.snowfallSm = 1; if (e.post) e.post.blizzard = 0.95; e.cam.preset('wide', true); }`,
  storm: `() => { Object.assign(e.env, { dayFrac: 0.4, season: 1.3, weather: 3, rain: 1, windStrength: 0.6, windDir: 0.35 }); e.applyEnvNow(); e.cam.setView({ distance: 430, pitchDeg: 8 }, true); }`,
  // trees3 views: the grove close and mid shots of the still set (the densest cluster of valley trees)
  grove_close: `() => { Object.assign(e.env, { dayFrac: 0.7, season: 1.3, weather: 0 }); e.applyEnvNow(); window.__grove(0, 24, 9, 35); }`,
  grove_mid: `() => { Object.assign(e.env, { dayFrac: 0.7, season: 1.3, weather: 0 }); e.applyEnvNow(); window.__grove(0, 62, 16, 35); }`,
  grove_winter: `() => { Object.assign(e.env, { dayFrac: 0.42, season: 3.5, weather: 0 }); e.applyEnvNow(); window.__grove(0, 60, 16, 35); }`,
};
const names = Object.keys(VIEW_SETUPS).filter((n) => !only.length || only.includes(n));

const server = await createServer({
  configFile: resolve('vite.config.ts'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const kill = setTimeout(() => { console.error('trees3bench: hard timeout'); process.exit(2); }, 60 * 60 * 1000);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 200)));
  const url = `${base}/index.html?autoscale=0&autocam=0&trees3=1&seed=tallgrass${query ? '&' + query : ''}`;
  console.log('loading', url, `${W}x${H}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  // the __grove helper (same as tools/stills.mjs set trees3)
  await page.evaluate(`(() => {
    const e = window.__engine, w = e.world, T = w.trees, n = T.length / 4, dens = [];
    for (let i = 0; i < n; i++) { let c = 0; for (let j = 0; j < n; j++) if (j !== i && Math.hypot(T[i * 4] - T[j * 4], T[i * 4 + 1] - T[j * 4 + 1]) < 30) c++; dens.push([c, i]); }
    dens.sort((a, b) => b[0] - a[0]);
    const picks = [dens[0][1]];
    window.__grove = (k, dist, pitch, rel) => { const i = picks[k], L = e.uniforms.lightDir.value; const az = Math.atan2(L.x, L.z) * 180 / Math.PI; e.cam.setView({ x: T[i * 4], y: T[i * 4 + 1], distance: dist, pitchDeg: pitch, yawDeg: az + 180 + rel }, true); };
  })()`);
  const res = await page.evaluate(async ({ setups, names, ROUNDS, FRAMES, variant }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    const gl = e.renderer.getContext();
    let renderer = 'unknown';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return { renderer, error: 'no EXT_disjoint_timer_query_webgl2' };
    if (!e.trees.setTrees3(true)) return { renderer, error: 'build has no trees3 (needs ?trees3=1)' };
    // experiments: cut a part of the new layer from the 'on' side, to see what the +ms is made of
    const t3m = e.trees.meshes.filter((m) => m.name.includes('-t3-') || m.name.includes('willow3'));
    const isLeaf = (m) => m.name.includes('crown-t3') || m.name.includes('willow3-leaf');
    const isCotton = (m) => m.name.includes('cottonwood');
    const isWillow = (m) => m.name.includes('willow3');
    const VARIANTS = {
      '': () => {},
      noShadow: () => { for (const m of t3m) m.castShadow = false; },
      noLeafShadow: () => { for (const m of t3m) if (isLeaf(m)) m.castShadow = false; },
      leavesOnly: () => { for (const m of t3m) if (!isLeaf(m)) m.visible = false; },
      barkOnly: () => { for (const m of t3m) if (isLeaf(m)) m.visible = false; },
      noWillow: () => { for (const m of t3m) if (isWillow(m)) m.visible = false; },
      cottonOnly: () => { for (const m of t3m) if (!isCotton(m)) m.visible = false; },
      noLod1Leaf: () => { for (const m of t3m) if (m.name.endsWith('lod1') && isLeaf(m)) m.visible = false; },
    };
    const reset = () => { for (const m of t3m) { m.visible = !(isLeaf(m) && isCotton(m)) || e.uniforms.leafAmount.value > 0.1; m.castShadow = !m.name.includes('willow3'); } };
    const apply = (on) => { reset(); if (on) (VARIANTS[variant] || VARIANTS[''])(); };
    const timed = async () => {
      for (let i = 0; i < 4; i++) e.renderOnce(0.016);
      const qs = [];
      for (let i = 0; i < FRAMES; i++) {
        const q = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        e.renderOnce(0.016);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        qs.push(q);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 20));
      }
      let tries = 0;
      while (tries++ < 400) { if (gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) break; await new Promise((r) => setTimeout(r, 25)); }
      const t = qs.map((q) => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : NaN)).filter(Number.isFinite).sort((a, b) => a - b);
      return t.length ? t[Math.floor(t.length / 2)] : NaN;
    };
    const out = {};
    for (const name of names) {
      (0, eval)(`(e) => (${setups[name]})`)(e)();
      e.trees.setTrees3(true);
      for (let i = 0; i < 6; i++) e.renderOnce(0.016);
      const off = [], on = [];
      for (let r = 0; r < ROUNDS; r++) {
        const order = r % 2 === 0 ? [false, true] : [true, false];
        for (const mode of order) {
          e.trees.setTrees3(mode);
          apply(mode);
          const m = await timed();
          (mode ? on : off).push(m);
        }
      }
      e.trees.setTrees3(true);
      apply(false);
      out[name] = { off, on };
    }
    return { renderer, views: out };
  }, { setups: VIEW_SETUPS, names, ROUNDS, FRAMES, variant });
  if (res.error) throw new Error(res.error);
  console.log('renderer:', res.renderer);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
  const summary = {};
  console.log('view'.padEnd(14) + 'off ms'.padStart(8) + 'on ms'.padStart(8) + 'delta'.padStart(8) + 'sd'.padStart(7) + '  paired deltas (on minus off)');
  for (const n of names) {
    const { off, on } = res.views[n];
    const d = off.map((v, i) => on[i] - v);
    summary[n] = { offMedian: +med(off).toFixed(3), onMedian: +med(on).toFixed(3), deltaMedian: +med(d).toFixed(3), deltaMean: +mean(d).toFixed(3), deltaSd: +sd(d).toFixed(3), off, on };
    console.log(n.padEnd(14) + med(off).toFixed(2).padStart(8) + med(on).toFixed(2).padStart(8) + ((med(d) >= 0 ? '+' : '') + med(d).toFixed(2)).padStart(8) + sd(d).toFixed(2).padStart(7) + '  ' + d.map((v) => (v >= 0 ? '+' : '') + v.toFixed(2)).join(' '));
  }
  if (outFile) { mkdirSync(dirname(resolve(outFile)), { recursive: true }); writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), size: `${W}x${H}`, rounds: ROUNDS, frames: FRAMES, renderer: res.renderer, views: summary }, null, 1)); console.log('saved', outFile); }
} catch (e) {
  console.error('trees3bench failed:', e.message);
  code = 1;
} finally {
  try { await browser.close(); } catch { /* gone */ }
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
