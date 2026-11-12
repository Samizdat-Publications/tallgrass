// Runs dev/footslip-a3.html on the real GPU (headless Chromium): the slip of the drawn paw on the near meshes.
//   node tools/footslip_a3.mjs [--a3 0] [--slope 0] [--json out.json] [--q '&a3ankle=0']     exit code 0 if every row is within the gate (5% walk and trot, 8% gallop)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const kill = setTimeout(() => { console.error('footslip_a3: hard timeout'); process.exit(2); }, 10 * 60 * 1000);
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
  await page.goto(`${base}/dev/footslip-a3.html?a3=${arg('a3', '1')}&slope=${arg('slope', '0')}&seconds=${arg('seconds', '6')}${arg('q', '')}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__a3Slip !== undefined, null, { timeout: 480000 });
  const r = await page.evaluate(() => window.__a3Slip);
  console.log(r.lines.join('\n'));
  if (arg('json', '')) writeFileSync(arg('json', ''), JSON.stringify(r, null, 1));
  code = r.pass ? 0 : 1;
} catch (e) {
  console.error('footslip_a3 failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
