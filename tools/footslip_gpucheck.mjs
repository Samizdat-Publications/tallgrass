// Runs dev/footslip-gpu.html on the real GPU (headless Chromium): the leg vertex shader against its CPU mirror (legmath.ts).
//   node tools/footslip_gpucheck.mjs        exit code 0 if the worst vertex error is under 2 mm
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const kill = setTimeout(() => { console.error('footslip_gpucheck: hard timeout'); process.exit(2); }, 5 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 1500)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 1500)); });
  await page.goto(base + '/dev/footslip-gpu.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__gpuCheck !== undefined, null, { timeout: 240000 });
  const r = await page.evaluate(() => window.__gpuCheck);
  console.log(r.lines.join('\n'));
  code = r.pass ? 0 : 1;
} catch (e) {
  console.error('footslip_gpucheck failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
