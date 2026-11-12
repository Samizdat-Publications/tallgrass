// R1 close-up stills of the real game (JPEG q90): a herd at 25 to 40 m, a walking bison, a trotting and a galloping wolf, an animal on a
// slope. Runs one page load of a project directory (default: this one), so a before/after pair is two runs with --dir.
//   node tools/r1_closeups.mjs --out review/wip/R1 --tag after [--dir <projectDir>] [--size 1600x900] [--check-only]
// Also reports page exceptions and console errors (the "game loads clean" check). Never an OS screen grab.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R1'));
const tag = arg('tag', 'after');
const dir = resolve(arg('dir', '.'));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const checkOnly = argv.includes('--check-only');
if (!existsSync(resolve(dir, 'index.html'))) throw new Error('no index.html in ' + dir);
const req = createRequire(resolve(dir, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
process.chdir(dir);
const kill = setTimeout(() => { console.error('r1_closeups: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await vite.createServer({
  root: dir, configFile: resolve(dir, 'vite.config.ts'), cacheDir: resolve(dir, 'node_modules/.vite-r1'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let code = 0;
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log('GL renderer:', info);
  if (!checkOnly) {
    mkdirSync(out, { recursive: true });
    const shot = async (name, js, wait = 2500, js2 = null) => {
      if (js) { const r = await page.evaluate(js); if (r !== undefined && r !== null) console.log(name, JSON.stringify(r)); }
      await page.waitForTimeout(wait);
      if (js2) { await page.evaluate(js2); await page.waitForTimeout(250); }
      const p = `${out}/${tag}_${name}.jpg`;
      await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
      console.log('saved', p);
    };
    // pin the light and weather (the sim keeps running underneath) so a before and an after still are lit alike
    await page.evaluate(() => { const e = window.__engine; e.setEnv = () => {}; Object.assign(e.env, { dayFrac: 0.45, season: 1.8, weather: 0, rain: 0 }); e.applyEnvNow(); });
    // let the herds spread and the hunts start
    await page.evaluate(() => { window.__timeOfDay(0.45); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__speed(10); });
    await page.waitForTimeout(9000);
    await page.evaluate(() => { window.__speed(1); window.__timeOfDay(0.45); });
    await page.waitForTimeout(1500);
    await shot('01_herd_30m', `(() => { window.__followId(null); window.__focusHerd(); window.__engine.cam.setView({ distance: 32, pitchDeg: 17 }, true); })()`, 3500);
    await shot('02_herd_40m_high', `(() => { window.__engine.cam.setView({ distance: 40, pitchDeg: 30 }, true); })()`, 2500);
    // a walking bison: the first bison in a Walk state (St.Walk = 2), else the first grazer
    await shot('03_bison_walk', `(() => { const c = window.__find(0, 2).concat(window.__find(0, 1)); const id = c[0]; window.__followId(id); window.__engine.cam.setView({ distance: 12, pitchDeg: 15 }, true); return { n: c.length, id }; })()`, 3500, `window.__engine.cam.setView({ distance: 12, pitchDeg: 15 }, true)`);
    // wolves: a chasing one (gallop), else a walking or any wolf
    await shot('04_wolf_gallop', `(() => { const c = window.__find(1, 5).concat(window.__find(1, 3), window.__find(1, 2), window.__find(1)); const id = c[0]; window.__followId(id); window.__engine.cam.setView({ distance: 12, pitchDeg: 22 }, true); return { n: c.length, id }; })()`, 2500, `window.__engine.cam.setView({ distance: 12, pitchDeg: 22 }, true)`);
    await shot('05_wolf_trot', `(() => { const c = window.__find(1, 2).concat(window.__find(1, 3), window.__find(1)); const id = c[0]; window.__followId(id); window.__engine.cam.setView({ distance: 9, pitchDeg: 20 }, true); return { n: c.length, id }; })()`, 2500, `window.__engine.cam.setView({ distance: 9, pitchDeg: 20 }, true)`);
    // the animal standing or moving on the steepest ground: score by terrain slope under each living bison, wolf, pronghorn
    await shot('06_on_slope', `(() => {
      const e = window.__engine, w = e.world, snap = window.__snap();
      let best = -9, bid = null, bsp = -1;
      for (let k = 0; k < snap.count; k++) {
        const o = k * 12, sp = snap.agents[o];
        if (sp !== 0 && sp !== 1 && sp !== 3) continue;
        const x = snap.agents[o + 1], z = snap.agents[o + 2];
        const ci = Math.min(w.n - 1, Math.max(0, Math.floor(x / (w.size / w.n)))), cj = Math.min(w.n - 1, Math.max(0, Math.floor(z / (w.size / w.n))));
        const sl = w.slope[cj * w.n + ci]; if (sl > 0.5 || sl < 0.2) continue;
        const s = 1 - Math.abs(sl - 0.36) + (snap.agents[o + 4] > 0.5 ? 0.15 : 0);
        if (s > best) { best = s; bid = snap.ids[k]; bsp = sp; }
      }
      window.__followId(bid); e.cam.setView({ distance: 12, pitchDeg: 14, yawDeg: 90 }, true); return { id: bid, sp: bsp, slope: best };
    })()`, 2500, `window.__engine.cam.setView({ distance: 12, pitchDeg: 14, yawDeg: 90 }, true)`);
  }
} catch (e) {
  console.error('r1_closeups failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
process.exit(code || (errors.length ? 3 : 0));
