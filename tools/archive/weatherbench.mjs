// Weather GPU cost, measured inside ONE page load so GPU clock drift and other processes cancel: for each view, frames of a weather state
// and of the clear control are interleaved in rounds (GPU timer queries), and the median of each is reported with the difference.
// Usage: node tools/weatherbench.mjs --dir <projectDir> [--size 1920x1080]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
const root = resolve(arg('dir', '.'));
const ONLY = arg('views', 'mid,low,wide').split(',');
const ROUNDS = Number(arg('rounds', 8));
const STATES = arg('states', 'rain_heavy,rain_light,blizzard').split(',');
const req = createRequire(resolve(root, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
process.chdir(root);
const server = await vite.createServer({ root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve(root, 'node_modules/.vite-bench'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/node_modules/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const kill = setTimeout(() => process.exit(2), 8 * 60 * 1000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`${base}/index.html?autoscale=0&autocam=0`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ ONLY, ROUNDS, STATES }) => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const states = {
      clear: { dayFrac: 0.45, season: 1.8, weather: 0, rain: 0, windStrength: 0.6, windDir: 0.35 },
      rain_heavy: { dayFrac: 0.45, season: 1.8, weather: 3, rain: 1, windStrength: 0.6, windDir: 0.35 },
      rain_light: { dayFrac: 0.45, season: 1.8, weather: 1, rain: 0, windStrength: 0.25, windDir: 0.35 },
      blizzard: { dayFrac: 0.45, season: 3.4, weather: 4, rain: 0, windStrength: 0.9, windDir: 0.35 },
      clear_winter: { dayFrac: 0.45, season: 3.4, weather: 0, rain: 0, windStrength: 0.9, windDir: 0.35 },
    };
    const views = {
      mid: () => { window.__focusHerd(); e.cam.setView({ distance: 85, pitchDeg: 22 }, true); },
      low: () => { window.__focusHerd(); e.cam.setView({ distance: 22, pitchDeg: 9 }, true); },
      wide: () => { e.cam.preset('wide', true); },
    };
    const set = (s) => { Object.assign(e.env, s); e.applyEnvNow(); };
    // set the state and settle it (post.blizzard and the snow fall ease in real time: pin them)
    const settle = (s) => { set(s); if (s.weather === 4) { e.snowfallSm = 1; e.post.blizzard = 0.95; } for (let i = 0; i < 4; i++) e.renderOnce(0.016); };
    const time = async (n) => {
      const qs = [];
      for (let i = 0; i < n; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); e.renderOnce(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); }
      await new Promise((r) => setTimeout(r, 60));
      let tries = 0; while (tries++ < 200 && !gl.getQueryParameter(qs[qs.length - 1], gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 20));
      return qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
    };
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const out = {};
    for (const [vn, vf] of Object.entries(views)) {
      if (!ONLY.includes(vn)) continue;
      vf();
      for (const [sn, st] of Object.entries(states)) {
        if (!STATES.includes(sn)) continue;
        const ctl = sn === 'blizzard' ? states.clear_winter : states.clear;
        const A = [], B = [];
        for (let r = 0; r < ROUNDS; r++) {
          settle(st); A.push(...await time(10));
          settle(ctl); B.push(...await time(10));
        }
        out[`${vn}/${sn}`] = { weather: +med(A).toFixed(2), control: +med(B).toFixed(2), delta: +(med(A) - med(B)).toFixed(2) };
      }
    }
    return out;
  }, { ONLY, ROUNDS, STATES });
  console.log(JSON.stringify(res, null, 1));
} finally { clearTimeout(kill); await browser.close(); await server.close(); }
process.exit(0);
