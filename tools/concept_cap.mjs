// node tools/concept_cap.mjs <out.jpg> ['{"dist":190,"pitch":30}'] ["tm=agx&p=..."]  -> one still via window.__concept(opts)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const out = process.argv[2] ?? 'review/wip/R0/concept_baseline.jpg';
const opts = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/b1/.vitecache'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 420000);
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 200)));
  await page.goto(base + '/index.html?autocam=0' + (process.argv[4] ? '&' + process.argv[4] : ''), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate((o) => window.__concept(o), opts);
  console.log(JSON.stringify(info));
  await page.keyboard.press('h');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Interface hidden/.test(el.textContent || '')) { let n = el; while (n.parentElement && n.parentElement !== document.body && n.parentElement.children.length === 1) n = n.parentElement; n.style.display = 'none'; } });
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
  console.log('saved', out);
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(0);
