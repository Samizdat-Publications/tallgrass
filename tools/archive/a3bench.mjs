// a3 spike: quick frame-cost check on the dev animal page (ms per frame with a synchronous GPU finish, 90 frames), for a list of ?a3= values.
//   node tools/a3bench.mjs 0 1 bison "bison,wolf"
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
const vals = process.argv.slice(2);
const kill = setTimeout(() => process.exit(2), 20 * 60 * 1000);
const server = await createServer({ root: resolve('.'), configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/_vitecache_a3bench'), server: { port: 5700 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  for (const v of vals) {
    const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    await page.goto(`${base}/dev/animals.html?cam=wide&count=300&a3=${v}&bench=1`, { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => window.__benchMs !== undefined, null, { timeout: 240000 });
    const ms = [];
    for (let k = 0; k < 3; k++) ms.push(await page.evaluate(() => window.__bench(90)));
    console.log('a3=' + v, ms.map((x) => x.toFixed(2)).join(' '), 'ms/frame');
    await page.close();
  }
} finally { await browser.close(); await server.close(); clearTimeout(kill); }
