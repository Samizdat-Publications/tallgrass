// Ad-hoc probe of the real game on the GPU: node tools/anim_polish_probe.mjs <script.js> [query]
// Loads the game (autoscale/autocam off), then runs the async function body in <script.js> in the page with `page` helpers on window.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const file = process.argv[2];
const query = process.argv[3] ?? '';
const body = readFileSync(file, 'utf8');
const kill = setTimeout(() => { console.error('probe: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 600)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 600)); else if (m.text().startsWith('PROBE')) console.log(m.text()); });
  await page.goto(`${base}/index.html?autoscale=0&autocam=0${query ? '&' + query : ''}`, { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 400000 });
  const fn = new Function('page', 'shot', `return (async () => { ${body} })();`);
  const shot = async (name) => { mkdirSync(dirname(resolve(name)), { recursive: true }); await page.screenshot({ path: name, type: 'jpeg', quality: 88 }); };
  const res = await fn(page, shot);
  if (res !== undefined) console.log(typeof res === 'string' ? res : JSON.stringify(res, null, 1));
} catch (e) {
  console.error('probe failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
