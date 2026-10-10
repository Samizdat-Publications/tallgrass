// R17: grass instances launched per level in each view. Run from the project dir to measure: node <path>/tools/r17_grassstats.mjs
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const VIEW = {
  wide_golden: `() => { Object.assign(e.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); e.applyEnvNow(); e.cam.preset('wide', true); }`,
  low_golden: `() => { e.cam.preset('low', true); }`,
  herd: `() => { window.__focusHerd(); e.cam.setView({ distance: 140, pitchDeg: 42 }, true); }`,
  night: `() => { Object.assign(e.env, { dayFrac: 0.97, season: 2.2 }); e.applyEnvNow(); window.__focusHerd(); }`,
};
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r17'), server: { port: 8100 + Math.floor(Math.random() * 90), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**', '**/art/**', '**/journey/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const to = setTimeout(() => process.exit(2), 1200000);
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'domcontentloaded', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async ({ VIEW }) => {
    window.__speed(0);
    const e = window.__engine; e.setEnv = () => {};
    const out = {};
    for (const [v, src] of Object.entries(VIEW)) {
      (0, eval)(`(e) => (${src})`)(e)();
      for (let i = 0; i < 10; i++) e.renderOnce(0.016);
      const st = window.__grass.stats;
      out[v] = { cells: [...st.cells], instances: st.instances, vertices: st.vertices };
    }
    return out;
  }, { VIEW });
  console.log(JSON.stringify(res));
} finally { clearTimeout(to); await browser.close(); await server.close(); }
process.exit(0);
