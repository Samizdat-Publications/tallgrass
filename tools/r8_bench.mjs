// R8 GPU bench: GPU time (EXT_disjoint_timer_query) of the animal views at 2560x1440, in-page A,B,B,A blocks.
//   node tools/r8_bench.mjs [--dir <projectDir>] [--size 2560x1440] [--views herd40,herd25,wide,low,herd90]
// A = the R8 shaders (bison behaviour poses, pronghorn flare: the default), B = the same scene with them compiled out (animals.r8 = false), so the difference is the
// cost of the new shader code alone, in one page on one GPU state. A project without the switch runs both blocks the same (the noise floor).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const dir = resolve(arg('dir', '.'));
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
const extra = arg('q', '');
const parts = arg('parts', 'all'); // all | bison | flare: which R8 shader code the A blocks have (the B blocks have none)
const views = arg('views', 'herd140,herd40,herd25,wide,low,herd90').split(',');
if (!existsSync(resolve(dir, 'index.html'))) throw new Error('no index.html in ' + dir);
const req = createRequire(resolve(dir, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
process.chdir(dir);
const server = await vite.createServer({
  root: dir, configFile: resolve(dir, 'vite.config.ts'), cacheDir: resolve(dir, 'node_modules/.vite-r8b'),
  server: { port: 6700 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 1500000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=3&p=coyote.initial:12,cougar.initial:4' + extra, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ views, parts }) => {
    const e = window.__engine;
    e.setEnv = () => {};
    Object.assign(e.env, { dayFrac: 0.3, season: 1.6, weather: 0, rain: 0, windStrength: 0.25, warmth: 0.7 });
    e.applyEnvNow();
    window.__speed(0); window.__step(1500);
    await new Promise((r) => setTimeout(r, 4000));
    const A = window.__animals;
    const hasToggle = 'r8' in A;
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    const herd = () => {
      const s = A.curr, w = e.world; const pts = [];
      for (let k = 0; k < s.count; k++) if (s.agents[k * 12] === 0) pts.push([s.agents[k * 12 + 1], s.agents[k * 12 + 2]]);
      let best = null;
      for (const [x, z] of pts) {
        let n = 0; for (const [x2, z2] of pts) if (Math.hypot(x2 - x, z2 - z) < 22) n++;
        if (!best || n > best.n) best = { n, x, z };
      }
      return best;
    };
    const sunYaw = () => { const l = e.uniforms.lightDir.value; return Math.atan2(l.x, l.z) * 57.3; };
    const hb = herd();
    const V = {
      herd25: () => e.cam.setView({ x: hb.x, y: hb.z, distance: 25, pitchDeg: 14, yawDeg: sunYaw() + 70 }, true),
      herd40: () => e.cam.setView({ x: hb.x, y: hb.z, distance: 40, pitchDeg: 17, yawDeg: sunYaw() + 70 }, true),
      herd140: () => e.cam.setView({ x: hb.x, y: hb.z, distance: 140, pitchDeg: 42, yawDeg: sunYaw() + 70 }, true),
      herd90: () => e.cam.setView({ x: hb.x, y: hb.z, distance: 90, pitchDeg: 22, yawDeg: sunYaw() + 70 }, true),
      wide: () => e.cam.preset('wide', true),
      low: () => e.cam.preset('low', true),
    };
    const block = async (on) => {
      if (hasToggle) { if (on) A.r8Parts({ on: true, bison: parts !== 'flare', flare: parts !== 'bison' }); else A.r8 = false; }
      for (let i = 0; i < 12; i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 400));
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
    for (const v of views) {
      V[v]();
      for (let i = 0; i < 6; i++) e.renderOnce(0.016);
      const info = { herd: hb.n, near: A.batches ? 0 : 0, tris: A.triangleCount };
      const Aa = [], Bb = [];
      for (let r = 0; r < 6; r++) { Aa.push(await block(true)); Bb.push(await block(false)); Bb.push(await block(false)); Aa.push(await block(true)); }
      out[v] = { A: Aa, B: Bb, info };
    }
    return { rend, hasToggle, out };
  }, { views, parts });
  console.log('renderer', res.rend, W + 'x' + H, 'toggle', res.hasToggle, 'dir', dir);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(8), JSON.stringify(v.info), 'A(R8 on)', fa.length, med(fa).toFixed(3), 'B(R8 off)', fb.length, med(fb).toFixed(3), 'DELTA', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
