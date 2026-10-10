// Achieved sim rate at 100x on the live site: ticks advanced over 20 s of real time.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('https://tallgrass.stewartgregerson.workers.dev/?autocam=0', { waitUntil: 'load', timeout: 480000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 480000 });
for (const sp of [1, 10, 100]) {
  await page.evaluate((s) => window.__speed(s), sp);
  await page.waitForTimeout(4000);
  const a = await page.evaluate(() => window.__snap()?.tick ?? 0);
  const t0 = Date.now();
  await page.waitForTimeout(20000);
  const b = await page.evaluate(() => window.__snap()?.tick ?? 0);
  const rate = (b - a) / ((Date.now() - t0) / 1000);
  console.log(`speed ${sp}x: ${rate.toFixed(0)} ticks/s`);
}
await browser.close();
