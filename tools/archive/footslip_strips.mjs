// Saves the foot-slip rig's image strips (dev/footslip.html) as JPEG q90 into review/wip/R1 (default).
//   node tools/footslip_strips.mjs [--out review/wip/R1] [--only wolf_gallop]
// Pure canvas drawing from the CPU mirror of the leg math, so it needs no GPU; still run with a timeout like everything else.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R1'));
const only = arg('only', '');
const kill = setTimeout(() => { console.error('footslip_strips: hard timeout'); process.exit(2); }, 5 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000 });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 2700, height: 900 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  await page.goto(base + '/dev/footslip.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__done === true, null, { timeout: 240000 });
  console.log(await page.evaluate(() => window.__summary));
  mkdirSync(out, { recursive: true });
  const strips = await page.$$('canvas.strip');
  for (const el of strips) {
    const name = await el.getAttribute('data-name');
    if (only && !name.includes(only)) continue;
    const p = `${out}/${name}.jpg`;
    await el.screenshot({ path: p, type: 'jpeg', quality: 90 });
    console.log('saved', p);
  }
} catch (e) {
  console.error('footslip_strips failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
