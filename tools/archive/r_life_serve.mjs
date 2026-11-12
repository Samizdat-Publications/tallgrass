// r-life: keep one game page open and run commands against it, so the (slow, load-dependent) page load is paid once.
// Commands are JSON files dropped in scratch/life_srv/: NAME.cmd.json = { js?: "page expression", wait?: ms, shot?: "path.jpg", reload?: true }.
// The result goes to NAME.out.json ({ value, error }). Create scratch/life_srv/STOP to end. A reload re-reads the source files (hmr is off).
// Usage: node tools/r_life_serve.mjs [--size 1280x720] [--query "seed=tallgrass"]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const dir = resolve('scratch/life_srv');
mkdirSync(dir, { recursive: true });
rmSync(resolve(dir, 'STOP'), { force: true });

const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_life') });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); else if (m.text().startsWith('life:')) console.log(m.text()); });
const load = async () => {
  await page.goto(base + '/index.html?autoscale=0&autocam=0&' + arg('query', 'seed=tallgrass'), { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
};
await load();
console.log('life: ready');
const done = new Set();
for (;;) {
  if (existsSync(resolve(dir, 'STOP'))) break;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.cmd.json')).sort()) {
    if (done.has(f)) continue;
    done.add(f);
    const name = f.replace('.cmd.json', '');
    let out = {};
    try {
      const c = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
      if (c.reload) { server.moduleGraph.invalidateAll(); await load(); }
      if (c.js) out.value = await page.evaluate(c.js);
      if (c.wait) await page.waitForTimeout(c.wait);
      if (c.shot) { mkdirSync(dirname(resolve(c.shot)), { recursive: true }); await page.screenshot({ path: resolve(c.shot), type: 'jpeg', quality: 90, timeout: 150000 }); out.shot = c.shot; }
    } catch (e) { out.error = String(e.message).slice(0, 500); }
    writeFileSync(resolve(dir, name + '.out.json'), JSON.stringify(out));
  }
  await new Promise((r) => setTimeout(r, 300));
}
await browser.close();
await server.close();
process.exit(0);
