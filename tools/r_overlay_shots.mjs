// Territory overlay stills (wide and top, day and night) plus a pack/uniform dump.
//   node tools/r_overlay_shots.mjs [outDir=review/wip/overlay-chronicle] [prefix=after] [years=3] [size=1600x900]
// Short run: private Vite server, headless Chromium on the real GPU, UI left on so labels and legend show.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = resolve(process.argv[2] ?? 'review/wip/overlay-chronicle');
const prefix = process.argv[3] ?? 'after';
const years = Number(process.argv[4] ?? 3);
const [W, H] = (process.argv[5] ?? '1600x900').split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/rov/.vitecache'), server: { port: 7900 + Math.floor(Math.random() * 90), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const to = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000);
const errors = [];
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => { errors.push(e.message.slice(0, 300)); console.log('[exc]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text().slice(0, 300)); console.log('[console.error]', m.text().slice(0, 300)); } });
try {
  await page.goto(`${base}/index.html?autoscale=0&autocam=0`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.evaluate(() => {
    window.__speed(0);
    window.__stepWait = async (n) => {
      const prev = window.__snap();
      window.__step(n);
      for (let i = 0; i < 600 && window.__snap() === prev; i++) await new Promise((r) => setTimeout(r, 15));
      return window.__snap();
    };
  });
  // a few valley years, in chunks so the worker keeps answering
  for (let k = 0; k < years * 6; k++) await page.evaluate(() => window.__stepWait(400));
  const info = await page.evaluate(() => {
    const s = window.__snap();
    const o = window.__overlay;
    return { tick: s.tick, packs: Array.from(s.packs), serials: s.packSerials, uPackN: o.mat.uniforms.uPackN.value, day: s.env.dayFrac, world: window.__engine.uniforms.worldSize.value };
  });
  console.log('packs', JSON.stringify(info));
  const views = { wide: 'wide', top: 'top' };
  for (const [vname, preset] of Object.entries(views)) {
    for (const [tname, day] of [['day', 0.5], ['night', 0.02]]) {
      await page.evaluate(({ preset, day }) => {
        window.__timeOfDay(day);
        window.__cam(preset);
        window.__overlay.setMode('territory');
      }, { preset, day });
      await page.waitForTimeout(3500);
      const st = await page.evaluate(() => ({ alpha: window.__overlay.alpha, shown: window.__overlay.shown, labels: window.__overlay.labels.filter((e) => e.style.display !== 'none').map((e) => e.innerText.replace(/\n/g, ' ')) }));
      console.log(vname, tname, JSON.stringify(st));
      await page.screenshot({ path: `${outDir}/${prefix}_${vname}_${tname}.jpg`, type: 'jpeg', quality: 88 });
    }
  }
  console.log('errors', errors.length);
} finally {
  clearTimeout(to);
  await browser.close();
  await server.close();
}
process.exit(0);
