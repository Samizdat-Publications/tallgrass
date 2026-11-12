// R11 where does the tree cost go: hide one mesh family at a time (v2 only), A,B pairs, fast-clock. node tools/r11_prof.mjs [view] [size]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
if (!existsSync('src/render/_trees_v1.ts')) writeFileSync('src/render/_trees_v1.ts', execSync('git show f55d1f6:src/render/trees.ts', { maxBuffer: 1 << 26 }));
const view = process.argv[2] ?? 'low_golden';
const ORDER = (process.argv[4] ?? 'none,v1,willow,juniper,crowns,tufts,bark,shadows,simshrubs,none,v1').split(',');
const REPS = Number(process.argv[5] ?? 3);
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r11/.vitecache'), server: { port: 7200 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
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
  const res = await page.evaluate(async ({ view, ORDER, REPS }) => {
    window.__speed(0);
    const e = window.__engine;
    const origSetEnv = e.setEnv.bind(e);
    e.setEnv = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
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
    const CLEAR = { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7 };
    const wide = (env) => () => { Object.assign(e.env, { ...CLEAR, ...env }); e.applyEnvNow(); e.cam.preset('wide', true); };
    const low = (env) => () => { Object.assign(e.env, { ...CLEAR, ...env }); e.applyEnvNow(); e.cam.preset('low', true); };
    const concept = (o) => () => { e.setEnv = origSetEnv; window.__concept(o); e.setEnv = () => {}; Object.assign(e.env, CLEAR, { windStrength: 0.45 }); e.applyEnvNow(); };
    const V = { wide_golden: wide({ dayFrac: 0.3, season: 1.8, windStrength: 0.45 }), low_golden: low({ dayFrac: 0.3, season: 1.8, windStrength: 0.45 }), concept: concept({}) };
    V[view]();
    const fams = {
      willow: (m) => m.name.startsWith('shrubs-willow'),
      juniper: (m) => m.name.startsWith('shrubs-juniper'),
      crowns: (m) => m.name.startsWith('cottonwood-crown') && !m.name.includes('tuft'),
      tufts: (m) => m.name.includes('tuft'),
      bark: (m) => m.name.startsWith('cottonwood-bark'),
      simshrubs: (m) => /^shrubs-lod/.test(m.name),
    };
    const shadowOff = (mode) => { for (const m of e.trees.meshes) { m.userData.cs ??= m.castShadow; const crown = m.name.startsWith('cottonwood-crown'); m.castShadow = mode === 'shadows' ? false : mode === 'crownshadow' && crown ? false : m.userData.cs; } };
    const state = (hide, v2on) => {
      e.trees.group.visible = v2on; v1.group.visible = !v2on;
      for (const m of e.trees.meshes) m.visible = true;
      e.trees.setLeafAmount(e.uniforms.leafAmount.value);
      if (hide && fams[hide]) for (const m of e.trees.meshes) if (fams[hide](m)) m.visible = false;
      shadowOff(hide);
    };
    const block = async () => {
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
      return t.length < 20 ? NaN : +t[Math.floor(t.length / 2)].toFixed(3);
    };
    const out = {};
    const order = ORDER;
    for (let r = 0; r < REPS; r++) {
      for (const k of order) {
        if (k === 'v1') state(null, false); else state(k === 'none' ? null : k, true);
        (out[k] ??= []).push(await block());
      }
    }
    state(null, true);
    return out;
  }, { view, ORDER, REPS });
  const med = (a) => { const f = a.filter(Number.isFinite).sort((x, y) => x - y); return f[Math.floor(f.length / 2)]; };
  const mn = (a) => Math.min(...a.filter(Number.isFinite));
  console.log(view, W + 'x' + H);
  for (const [k, v] of Object.entries(res)) console.log(k.padEnd(10), 'min', mn(v).toFixed(3), 'med', med(v).toFixed(3), JSON.stringify(v));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
