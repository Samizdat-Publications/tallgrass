// node tools/r11_shots.mjs <outDir> [names|all] [size=1600x900]
// R11 trees v2 stills: one page load, JPEG q90. Views are fixed so before/after pairs line up.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? 'review/wip/R11';
const want = (process.argv[3] ?? 'all').split(',');
const [W, H] = (process.argv[4] ?? '1600x900').split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const CAL = { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.7 };
const SHOTS = {
  concept: { concept: {}, env: { ...CAL, windStrength: 0.45 } },
  concept_close: { concept: { dist: 90, pitch: 14 }, env: { ...CAL, windStrength: 0.3 } },
  low_golden: { concept: { dist: 34, pitch: 5, sunOff: 8, shift: 0, side: 0 }, env: { ...CAL, windStrength: 0.3 } },
  low_golden2: { concept: { dist: 28, pitch: 4, sunOff: 40, shift: -0.1, side: 12 }, env: { ...CAL, windStrength: 0.3 } },
  wide_noon: { env: { ...CAL, dayFrac: 0.5, season: 1.2 }, cam: "e.cam.preset('wide', true)" },
  wide_golden: { env: { ...CAL, dayFrac: 0.3, season: 1.8, windStrength: 0.45 }, cam: "e.cam.preset('wide', true)" },
  autumn: { concept: { season: 2.3, day: 0.32 }, env: { ...CAL, season: 2.3, dayFrac: 0.32, windStrength: 0.35 } },
  autumn_low: { concept: { season: 2.3, day: 0.32, dist: 40, pitch: 6, sunOff: 25 }, env: { ...CAL, season: 2.3, dayFrac: 0.32, windStrength: 0.35 } },
  winter: { env: { ...CAL, dayFrac: 0.4, season: 3.2 }, cam: "e.cam.preset('wide', true)" },
  winter_concept: { concept: { season: 3.2, day: 0.4, dist: 110, pitch: 14 }, env: { ...CAL, season: 3.2, dayFrac: 0.4 } },
  night: { concept: { day: 0.97, season: 1.8, dist: 120, pitch: 15 }, env: { ...CAL, dayFrac: 0.97, season: 1.8 } },
};
const names = want[0] === 'all' ? Object.keys(SHOTS) : want;
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r11/.vitecache'), server: { port: 6600 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 900000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 300)); });
  await page.goto(base + '/index.html?autocam=0&autoscale=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('h');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Interface hidden/.test(el.textContent || '')) { let n = el; while (n.parentElement && n.parentElement !== document.body && n.parentElement.children.length === 1) n = n.parentElement; n.style.display = 'none'; } });
  await page.evaluate(() => { window.__speed(0); const e = window.__engine; window.__origSetEnv = e.setEnv.bind(e); });
  for (const name of names) {
    const s = SHOTS[name];
    if (!s) { console.log('no shot', name); continue; }
    const info = await page.evaluate(async ({ s }) => {
      const e = window.__engine;
      let info = {};
      e.setEnv = window.__origSetEnv;
      if (s.concept) info = window.__concept(s.concept);
      e.setEnv = () => {};
      Object.assign(e.env, s.env ?? {});
      e.applyEnvNow();
      if (s.cam) (0, eval)(`(e) => { ${s.cam} }`)(e);
      for (let i = 0; i < (s.frames ?? 24); i++) e.renderOnce(0.016);
      await new Promise((r) => setTimeout(r, 400));
      for (let i = 0; i < 3; i++) e.renderOnce(0.016);
      return { info, cam: [e.camera.position.x | 0, e.camera.position.y | 0, e.camera.position.z | 0] };
    }, { s });
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, name + '.jpg'), type: 'jpeg', quality: 90 });
    console.log(name, JSON.stringify(info));
  }
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(0);
