// R11 trees v1 vs v2 GPU cost, A,B,B,A in one page load, fast-clock blocks only. 2560x1440.
// Needs src/render/_trees_v1.ts (a copy of the pre-R11 trees.ts, kept untracked). node tools/r11_bench.mjs [views] [size]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
// the pre-R11 trees (the commit R11 branched from), written once to an untracked file the page imports as the A/B reference
if (!existsSync('src/render/_trees_v1.ts')) writeFileSync('src/render/_trees_v1.ts', execSync('git show f55d1f6:src/render/trees.ts', { maxBuffer: 1 << 26 }));
const views = (process.argv[2] ?? 'wide_golden,low_golden,concept').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r11/.vitecache'), server: { port: 6900 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 1500000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ views }) => {
    window.__speed(0);
    const e = window.__engine;
    const origSetEnv = e.setEnv.bind(e);
    e.setEnv = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    // the old trees, built beside the new ones in the same scene; one is visible at a time
    const mod = await import('/src/render/_trees_v1.ts');
    const v1 = new mod.Trees(e.world, e.uniforms, e.terrain.heightAt);
    e.scene.add(v1.group);
    const seen = new Set();
    for (const m of v1.meshes) {
      if (m.name.startsWith('cottonwood-crown') || m.name.startsWith('shrubs')) e.post.aoExclude.push(m);
      if (m.name.startsWith('cottonwood-bark')) { e.post.aoExclude.push(m); if (!seen.has(m.material)) { seen.add(m.material); m.material.color.multiplyScalar(0.34); } }
    }
    const u2 = e.trees.update.bind(e.trees), l2 = e.trees.setLeafAmount.bind(e.trees);
    e.trees.update = (c, f) => { u2(c, f); v1.update(c, f); };
    e.trees.setLeafAmount = (l) => { l2(l); v1.setLeafAmount(l); };
    const info = { v2meshes: e.trees.meshes.length, v1meshes: v1.meshes.length, fillers: e.trees.fillerCount, thickets: e.trees.thicketCount, junipers: e.trees.junipers };
    const set = (v2on) => { e.trees.group.visible = v2on; v1.group.visible = !v2on; };
    const CLEAR = { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7 };
    const wide = (env) => () => { Object.assign(e.env, { ...CLEAR, ...env }); e.applyEnvNow(); e.cam.preset('wide', true); };
    const low = (env) => () => { Object.assign(e.env, { ...CLEAR, ...env }); e.applyEnvNow(); e.cam.preset('low', true); };
    const concept = (o) => () => { e.setEnv = origSetEnv; window.__concept(o); e.setEnv = () => {}; Object.assign(e.env, CLEAR, { windStrength: 0.45 }); e.applyEnvNow(); };
    const V = {
      wide_golden: wide({ dayFrac: 0.3, season: 1.8, windStrength: 0.45 }),
      low_golden: low({ dayFrac: 0.3, season: 1.8, windStrength: 0.45 }),
      concept: concept({}),
      wide_noon: wide({ dayFrac: 0.5, season: 1.2 }),
      grove_low: concept({ dist: 40, pitch: 8, sunOff: 30 }),
    };
    const block = async (on) => {
      set(on);
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 200));
      const qs = [];
      for (let i = 0; i < 40; i++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
      }
      let tries = 0;
      while (tries++ < 200 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
      const t = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (t.length < 20) return NaN;
      return +t[Math.floor(t.length / 2)].toFixed(3);
    };
    const out = {};
    for (const vname of views) {
      V[vname]();
      const A = [], B = [];
      for (let r = 0; r < 6; r++) { A.push(await block(true)); B.push(await block(false)); B.push(await block(false)); A.push(await block(true)); }
      out[vname] = { A, B };
    }
    set(true);
    return { rend, out, info };
  }, { views });
  console.log('renderer', res.rend, W + 'x' + H, JSON.stringify(res.info));
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(14), 'fast v2', fa.length, med(fa).toFixed(3), 'fast v1', fb.length, med(fb).toFixed(3), 'DELTA(v2-v1)', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
