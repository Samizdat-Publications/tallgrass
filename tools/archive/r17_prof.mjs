// R17 per-pass GPU profile. One page load, one build, fixed camera per view.
//   node tools/r17_prof.mjs [--views low_golden,night] [--size 2560x1440] [--out file.json] [--mode seg|toggle] [--toggles grass,trees,...]
// seg   : every composer pass and every draw "family" (root object under the scene) gets its own GPU timer-query segment, so one run
//         gives a per-pass and per-family breakdown (the sum slightly exceeds the whole frame: each query has a small fixed cost).
// toggle: hide / disable one thing at a time and report the frame-time delta (the honest cost of removing it), A,B,B,A blocks.
// Uses EXT_disjoint_timer_query_webgl2 (GPU time). Fails if the renderer is software.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
const views = arg('views', 'low_golden,night').split(',');
const mode = arg('mode', 'seg');
const togglesArg = arg('toggles', '');
const outFile = arg('out', null);
const extra = arg('extra', '');
const reps = Number(arg('reps', '4'));
const deep = argv.includes('--deep');

const VIEW_SETUPS = {
  wide_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  low_golden: `() => { e.cam.preset('low', true); }`,
  herd: `() => { window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true); }`,
  top: `() => { e.cam.preset('top', true); }`,
  winter: `() => { Object.assign(e.env, { dayFrac: 0.34, season: 3.2, weather: 4 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  night: `() => { Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__focusHerd(); }`,
};

const server = await createServer({
  configFile: resolve('vite.config.ts'),
  cacheDir: resolve('node_modules/.vite-r17'),
  server: { port: 7500 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**', '**/art/**', '**/journey/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 1500000);
let result;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.text().startsWith('[prof]')) console.error(m.text()); });
  await page.goto(`${base}/index.html?autoscale=0&autocam=0${extra ? '&' + extra : ''}`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  result = await page.evaluate(async ({ setups, views, mode, togglesArg, reps, deepFlag }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    if (/swiftshader|llvmpipe|software|basic render/i.test(rend)) return { error: 'software renderer ' + rend };
    // family of an object: the direct child of the scene it hangs under, named by what it is
    const famCache = new Map();
    const famOf = (o) => {
      if (deepMode) {
        let r2 = o, c2 = o;
        while (r2.parent && r2.parent !== e.scene) { c2 = r2; r2 = r2.parent; }
        if (!r2.parent) return 'Q:' + curPass;
        const inst = o.geometry && o.geometry.isInstancedBufferGeometry ? o.geometry.instanceCount : (o.count ?? '');
        const ri = e.scene.children.indexOf(r2);
        return `${ri}:${r2.name}/${c2 === o ? '' : c2.name + '/'}${o.name || o.type}:${o.geometry ? (o.geometry.index ? o.geometry.index.count / 3 : (o.geometry.attributes.position ? o.geometry.attributes.position.count / 3 : 0)) : 0}tri:inst${inst}:mat${o.material && o.material.name ? o.material.name : ''}`;
      }
      let r = o;
      while (r.parent && r.parent !== e.scene) r = r.parent;
      if (!r.parent) return 'Q:' + curPass;
      let f = famCache.get(r);
      if (!f) {
        const nm = r.name || (r.isMesh ? (r.geometry && r.geometry.type) : r.type);
        const idx = e.scene.children.indexOf(r);
        f = `${idx}:${r.type}:${nm}:${r.children ? r.children.length : 0}`;
        famCache.set(r, f);
      }
      return f;
    };
    // ---- segment timer
    const deepMode = deepFlag;
    const stack = [];
    let frameSegs = null;
    let active = null;
    const startQ = (name) => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); active = { name, q }; };
    const stopQ = () => { if (!active) return; gl.endQuery(ext.TIME_ELAPSED_EXT); frameSegs.push(active); active = null; };
    const segBegin = (name) => { if (!frameSegs) return; if (active) { stopQ(); } stack.push(name); startQ(name); };
    const segEnd = () => { if (!frameSegs) return; stopQ(); stack.pop(); const p = stack[stack.length - 1]; if (p !== undefined) startQ(p); };
    let curPass = 'pre';
    let lastFam = null;
    const wrap = (obj, key, nameFn) => {
      const orig = obj[key].bind(obj);
      obj[key] = (...a) => { const n = nameFn(...a); if (n == null || !frameSegs) return orig(...a); segBegin(n); try { return orig(...a); } finally { segEnd(); } };
    };
    for (const p of e.post.composer.passes) {
      const pn = p.constructor.name + (p === e.post.scenePass ? '' : '');
      wrap(p, 'render', () => { curPass = pn; return 'P:' + pn; });
    }
    // shadow map render nested inside the scene pass
    {
      const o = e.renderer.shadowMap.render.bind(e.renderer.shadowMap);
      e.renderer.shadowMap.render = (...a) => { const prev = curPass; curPass = 'shadow'; try { return o(...a); } finally { curPass = prev; } };
    }
    // per-draw family attribution: switch the segment when the family changes
    const origRBD = e.renderer.renderBufferDirect.bind(e.renderer);
    let famOpen = false;
    e.renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
      if (frameSegs) {
        const f = (curPass === 'shadow' ? 'S/' : curPass === 'GTAOPass' ? 'AO/' : '') + famOf(object);
        if (f !== lastFam) {
          if (famOpen) segEnd();
          segBegin('D:' + f);
          famOpen = true;
          lastFam = f;
        }
      }
      return origRBD(camera, scene, geometry, material, object, group);
    };
    const resetFam = () => { if (famOpen) { segEnd(); famOpen = false; } lastFam = null; };
    // close a family segment whenever a pass/shadow wrapper begins or ends so nesting stays balanced
    for (const p of e.post.composer.passes) {
      const o = p.render;
      p.render = (...a) => { resetFam(); try { return o(...a); } finally { resetFam(); } };
    }
    {
      const o = e.renderer.shadowMap.render;
      e.renderer.shadowMap.render = (...a) => { resetFam(); try { return o(...a); } finally { resetFam(); } };
    }
    const collect = async (n) => {
      const acc = {};
      const frames = [];
      for (let i = 0; i < n; i++) {
        frameSegs = []; stack.length = 0; active = null; lastFam = null; famOpen = false; curPass = 'pre';
        segBegin('total');
        e.renderOnce(0.016);
        resetFam();
        segEnd();
        frames.push(frameSegs);
        frameSegs = null;
        if (i % 4 === 3) await new Promise((r) => setTimeout(r, 40));
      }
      const last = frames[frames.length - 1];
      let tries = 0;
      while (tries++ < 400 && !gl.getQueryParameter(last[last.length - 1].q, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
      const per = {};
      for (const segs of frames) {
        const sum = {};
        for (const s of segs) {
          if (!gl.getQueryParameter(s.q, gl.QUERY_RESULT_AVAILABLE)) continue;
          sum[s.name] = (sum[s.name] || 0) + gl.getQueryParameter(s.q, gl.QUERY_RESULT) / 1e6;
        }
        for (const [k, v] of Object.entries(sum)) (per[k] ||= []).push(v);
      }
      const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
      for (const [k, v] of Object.entries(per)) acc[k] = +med(v).toFixed(3);
      return acc;
    };
    // ---- plain whole-frame timing (no segments), median ms
    const plain = async (n = 40) => {
      for (let i = 0; i < 8; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 150));
      const qs = [];
      for (let i = 0; i < n; i++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 30));
      }
      let tries = 0;
      while (tries++ < 300 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 25));
      const t = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6).sort((a, b) => a - b);
      return t.length < 20 ? NaN : +t[Math.floor(t.length / 2)].toFixed(3);
    };
    const out = { rend, scene: e.scene.children.map((c, i) => `${i}:${c.type}:${c.name}:${c.children ? c.children.length : 0}:vis=${c.visible}`), passes: e.post.composer.passes.map((p) => p.constructor.name + (p.enabled ? '' : '(off)')) };
    const setupFns = {};
    for (const [n, src] of Object.entries(setups)) setupFns[n] = (0, eval)(`(e) => (${src})`)(e);
    // toggles
    const sceneKids = e.scene.children;
    const byIdx = (i) => sceneKids[i];
    const TOGGLES = {
      // each: [apply, undo]
      shadows_off: [() => { e.sun.castShadow = false; }, () => { e.sun.castShadow = true; }],
      ao_off: [() => { e.post.gtao.enabled = false; }, () => { e.post.gtao.enabled = true; }],
      msaa_off: [() => { e.post.scenePass.setSamples(0); }, () => { e.post.scenePass.setSamples(4); }],
      bloom_off: [() => { e.post.bloom.enabled = false; }, () => { e.post.bloom.enabled = true; }],
      fog_off: [() => { e.post.fog.enabled = false; }, () => { e.post.fog.enabled = true; }],
      godrays_off: [() => { e.post.godrays.enabled = false; }, () => { e.post.godrays.enabled = true; }],
      grade_adapt_off: [() => { e.post.setAdapt(0); }, () => { e.post.setAdapt(0.65); }],
      dip_trails: [() => {}, () => {}],
    };
    const gf = e.scene.getObjectByName('GrassField');
    for (let li = 0; li < gf.children.length; li++) TOGGLES['grass_L' + li] = [() => { gf.children[li].visible = false; }, () => { gf.children[li].visible = true; }];
    TOGGLES.grass_allcull = [() => { for (const c of gf.children) c.material.uniforms.uDens.value.x = 1e-4; }, () => { for (const c of gf.children) c.material.uniforms.uDens.value.x = 300; }];
    const al = e.scene.getObjectByName('AnimalLayer');
    TOGGLES.animals_noshadow = [() => { for (const c of al.children) if (c.isInstancedMesh) { c.userData.cs = c.castShadow; c.castShadow = false; } }, () => { for (const c of al.children) if (c.isInstancedMesh) c.castShadow = c.userData.cs ?? c.castShadow; }];
    TOGGLES.trees_noshadow = [() => { e.trees.group.traverse((c) => { if (c.isMesh) { c.userData.cs = c.castShadow; c.castShadow = false; } }); }, () => { e.trees.group.traverse((c) => { if (c.isMesh && c.userData.cs !== undefined) c.castShadow = c.userData.cs; }); }];
    for (let i = 0; i < sceneKids.length; i++) {
      const k = sceneKids[i];
      if (k.isLight) continue;
      TOGGLES['hide_' + i + '_' + (k.name || k.type)] = [() => { k.visible = false; }, () => { k.visible = true; }];
    }
    out.views = {};
    for (const v of views) {
      setupFns[v]();
      for (let i = 0; i < 12; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 300));
      const vo = {};
      if (mode === 'seg') {
        vo.plain = await plain(40);
        const runs = [];
        for (let r = 0; r < 3; r++) runs.push(await collect(30));
        const merged = {};
        for (const k of Object.keys(runs[0])) merged[k] = +(runs.map((x) => x[k] ?? 0).sort((a, b) => a - b)[1]).toFixed(3);
        vo.seg = merged;
      } else {
        const names = togglesArg ? togglesArg.split(',') : Object.keys(TOGGLES);
        vo.base = [];
        vo.t = {};
        for (const n of names) {
          const [ap, un] = TOGGLES[n] || [];
          if (!ap) { vo.t[n] = 'unknown'; continue; }
          const A = [], B = [];
          for (let r = 0; r < reps; r++) {
            B.push(await plain(24));
            ap(); for (let i = 0; i < 4; i++) e.renderOnce(0.016);
            A.push(await plain(30));
            A.push(await plain(30));
            un(); for (let i = 0; i < 4; i++) e.renderOnce(0.016);
            B.push(await plain(30));
          }
          const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
          const mn = (a) => Math.min(...a.filter(Number.isFinite));
          // the machine is shared with other captures: the fastest block of each condition is the one least disturbed (fast-clock blocks)
          vo.t[n] = { baseMin: +mn(B).toFixed(3), offMin: +mn(A).toFixed(3), deltaMin: +(mn(A) - mn(B)).toFixed(3), baseMed: +med(B).toFixed(3), offMed: +med(A).toFixed(3) };
          console.log('[prof] ' + v + ' ' + n + ' ' + JSON.stringify(vo.t[n]));
        }
      }
      out.views[v] = vo;
    }
    return out;
  }, { setups: VIEW_SETUPS, views, mode, togglesArg, reps, deepFlag: deep }).catch((err) => ({ error: String(err) }));
} finally {
  clearTimeout(to);
  await browser.close();
  await server.close();
}
console.log(JSON.stringify(result, null, 1));
if (outFile) { mkdirSync(dirname(resolve(outFile)), { recursive: true }); writeFileSync(resolve(outFile), JSON.stringify(result, null, 2) + '\n'); }
process.exit(0);
