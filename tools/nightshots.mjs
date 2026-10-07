// Night readability stills (R-camera-night): the same night shots of the herd, for before/after comparison. JPEG q88, from the real game
// in headless Chromium on the GPU. The sim is paused at the chosen time of day so the animals and the light hold still.
//   node tools/nightshots.mjs --out review/wip/camera-night --prefix before [--day 0.95] [--env '{"dayFrac":0.95}']
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'review/wip/camera-night');
const prefix = arg('prefix', 'night');
const day = Number(arg('day', '0.95'));
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const kill = setTimeout(() => { console.error('nightshots: hard timeout'); process.exit(2); }, 6 * 60 * 1000);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  mkdirSync(out, { recursive: true });
  // the sim is held (speed 0, no ticks pass) and the light is set directly: season 1.8 (late summer, leaves on), clear, the chosen hour
  await page.evaluate('window.__speed(0)');
  await page.waitForTimeout(600);
  await page.evaluate(`(() => {
    const e = window.__engine;
    window.__envO = Object.assign({ season: 1.8, weather: 0, warmth: 0.7, rain: 0, dayFrac: ${day} }, ${arg('env', '{}')});
    e.onFrame(() => e.setEnv(window.__envO));
    e.setEnv(window.__envO); e.applyEnvNow();
    window.__focusHerd();
  })()`);
  await page.waitForTimeout(2500);
  // hide the UI so the stills show the scene
  await page.addStyleTag({ content: '#ui, .ui-root, [data-ui], header, footer { visibility: hidden !important; }' });
  const shots = [
    ['herd30', { distance: 30, pitchDeg: 14, yawDeg: 20 }],
    ['herd60', { distance: 60, pitchDeg: 22, yawDeg: 20 }],
    ['wide140', { distance: 140, pitchDeg: 35, yawDeg: 20 }],
    ['low', { distance: 22, pitchDeg: 6, yawDeg: 200 }],
  ];
  const stats = [];
  for (const [name, view] of shots) {
    await page.evaluate((v) => { const c = window.__engine.cam; c.setView(v, true); for (let i = 0; i < 40; i++) c.update(1 / 60); window.__engine.renderOnce(0); window.__engine.renderOnce(0); }, view);
    await page.waitForTimeout(500);
    const file = resolve(out, `${prefix}-${name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
    // mean luma and the share of near-black pixels, from the canvas
    const s = await page.evaluate(() => {
      const cv = document.querySelector('canvas'); const t = document.createElement('canvas'); t.width = 160; t.height = 90;
      const g = t.getContext('2d'); g.drawImage(cv, 0, 0, 160, 90);
      const d = g.getImageData(0, 0, 160, 90).data; let sum = 0, dark = 0; const ls = [];
      for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; ls.push(l); sum += l; if (l < 12) dark++; }
      ls.sort((a, b) => a - b);
      return { mean: +(sum / ls.length).toFixed(1), p05: ls[Math.floor(ls.length * 0.05)], p50: ls[Math.floor(ls.length * 0.5)], p95: ls[Math.floor(ls.length * 0.95)], dark: +(dark / ls.length).toFixed(3) };
    });
    stats.push([name, s]);
    console.log('shot', file, JSON.stringify(s));
  }
} catch (e) {
  console.error('nightshots failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
