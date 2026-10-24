// Stills of the About page at two viewport sizes (headless GPU Chromium against a Vite server).
// Usage: node tools/about_shot.mjs [--out scratch/v1-about]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const out = resolve(argv.indexOf('--out') >= 0 ? argv[argv.indexOf('--out') + 1] : 'scratch/v1-about');
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('about_shot: hard timeout'); process.exit(2); }, 6 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  for (const [W, H] of [[1366, 768], [1920, 1080]]) {
    const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
    await page.goto(`${base}/index.html?autoscale=0`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.click('.tg-menubtn');
    await page.waitForTimeout(400);
    const row = page.locator('.tg-menurow:has-text("About Tallgrass")');
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/menu_${W}x${H}.jpg`, type: 'jpeg', quality: 90 });
    await row.click();
    await page.waitForTimeout(600);
    const focused = await page.evaluate(() => document.activeElement?.className);
    const info = await page.evaluate(() => { const b = document.querySelector('.tg-about .tg-pane-body'); const r = document.querySelector('.tg-about').getBoundingClientRect(); return { sh: b.scrollHeight, ch: b.clientHeight, top: r.top, bottom: r.bottom, vh: innerHeight }; });
    console.log(W, H, 'focus:', focused, JSON.stringify(info));
    await page.screenshot({ path: `${out}/about_${W}x${H}.jpg`, type: 'jpeg', quality: 90 });
    await page.evaluate(() => { const b = document.querySelector('.tg-about .tg-pane-body'); b.scrollTop = b.scrollHeight; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/about_${W}x${H}_scrolled.jpg`, type: 'jpeg', quality: 90 });
    const links = await page.$$eval('.tg-about a', (as) => as.map((a) => `${a.target}|${a.rel}|${a.href}`));
    console.log(links.length, 'links; all new-tab noopener:', links.every((l) => l.startsWith('_blank|noopener')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('closed by Esc:', await page.evaluate(() => document.querySelector('.tg-about').hidden || !document.querySelector('.tg-about').classList.contains('is-open')));
    await page.context().close();
  }
} catch (e) { console.error(e); code = 1; }
await browser.close(); await server.close(); clearTimeout(kill); process.exit(code);
