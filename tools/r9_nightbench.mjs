// GPU A,B,B,A for the R9 night sky: A = the new sky dome shader, B = the pre-R9 dome shader (tools/r9_legacy_sky.mjs), swapped in the same
// page. Same lighting and everything else in both, so the delta is the dome's own cost. 2560x1440, fast-clock blocks only (pattern of
// tools/r2_featurebench.mjs). node tools/r9_nightbench.mjs [views=all] [size=2560x1440]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { LEGACY_FRAG } from './r9_legacy_sky.mjs';
const want = (process.argv[2] ?? 'all').split(',');
const [W, H] = (process.argv[3] ?? '2560x1440').split('x').map(Number);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r9/.vitecache'), server: { port: 7500 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 1500000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  await page.goto(base + '/index.html?autoscale=0&autocam=0&dim=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ want, legacySrc }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    document.getElementById('ui').style.display = 'none';
    const skyMod = await import('/src/render/sky.ts');
    const common = await import('/src/render/common.ts');
    const storms = await import('/src/render/storms.ts');
    const N = skyMod.NIGHT;
    const legacy = legacySrc.replace('@@NOISE_GLSL@@', common.NOISE_GLSL).replace('@@CLOUD_GLSL@@', common.CLOUD_GLSL).replace('@@SKY_GLSL@@', common.SKY_GLSL).replace('@@STORM_SKY_GLSL@@', storms.STORM_SKY_GLSL);
    const mat = e.sky.material;
    const fresh = mat.fragmentShader;
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
    let hook = null;
    e.onFrame(() => { if (hook) hook(); });
    const CLEAR = { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.5 };
    const sky = (env, cyc = NaN, aurora = 0) => { Object.assign(e.env, { ...CLEAR, ...env }); N.debug.moonCycle = cyc; N.debug.aurora = aurora; e.applyEnvNow(); };
    const lookFrom = (az, el, h = 1.7) => {
      hook = () => {
        const c = e.camera, x = 236, z = 297, y = e.groundHeight(x, z) + h;
        c.position.set(x, y, z); c.up.set(0, 1, 0);
        const a = az * Math.PI / 180, l = el * Math.PI / 180;
        c.lookAt(x + Math.sin(a) * Math.cos(l) * 100, y + Math.sin(l) * 100, z + Math.cos(a) * Math.cos(l) * 100);
        c.updateMatrixWorld(true);
      };
    };
    const wide = () => { hook = null; e.cam.preset('wide', true); };
    const V = {
      night_gpubench: () => { hook = null; sky({ dayFrac: 0.97, season: 2.2 }); window.__focusHerd(); },
      night_new_moon_up: () => { sky({ dayFrac: 0.0, season: 1.3 }, 0.0); lookFrom(180, 30); },
      night_new_moon_wide: () => { sky({ dayFrac: 0.0, season: 1.3 }, 0.0); wide(); },
      night_full_moon_up: () => { sky({ dayFrac: 0.0, season: 1.3 }, 0.5); lookFrom(180, 28); },
      night_full_moon_wide: () => { sky({ dayFrac: 0.0, season: 1.3 }, 0.5); wide(); },
      night_aurora_up: () => { sky({ dayFrac: 0.0, season: 3.2 }, 0.0, 1); lookFrom(0, 22); },
      day_wide: () => { sky({ dayFrac: 0.5, season: 1.8 }); wide(); },
      day_up: () => { sky({ dayFrac: 0.5, season: 1.8 }); lookFrom(180, 30); },
      dusk_wide: () => { sky({ dayFrac: 0.77, season: 1.8 }); wide(); },
    };
    const use = (on) => { mat.fragmentShader = on ? fresh : legacy; mat.needsUpdate = true; };
    const block = async (on) => {
      use(on);
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
    for (const [name, setup] of Object.entries(V)) {
      if (want[0] !== 'all' && !want.includes(name)) continue;
      use(true);
      setup();
      for (let i = 0; i < 6; i++) e.renderOnce(0.016);
      const A = [], B = [];
      for (let r = 0; r < 6; r++) { A.push(await block(true)); B.push(await block(false)); B.push(await block(false)); A.push(await block(true)); }
      out[name] = { A, B };
      use(true);
    }
    return { rend, out };
  }, { want, legacySrc: LEGACY_FRAG });
  console.log('renderer', res.rend, W + 'x' + H);
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [k, v] of Object.entries(res.out)) {
    const lo = Math.min(...v.A.filter(Number.isFinite), ...v.B.filter(Number.isFinite));
    const fast = (a) => a.filter((x) => Number.isFinite(x) && x < lo * 1.12);
    const fa = fast(v.A), fb = fast(v.B);
    if (!fa.length || !fb.length) { console.log(k, 'no valid blocks', JSON.stringify(v)); continue; }
    console.log(k.padEnd(22), 'fastA(new)', fa.length, med(fa).toFixed(3), 'fastB(old)', fb.length, med(fb).toFixed(3), 'DELTA(new-old)', (med(fa) - med(fb)).toFixed(3), '| allmed', med(v.A.filter(Number.isFinite)).toFixed(3), med(v.B.filter(Number.isFinite)).toFixed(3));
  }
  console.log(JSON.stringify(res.out));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
