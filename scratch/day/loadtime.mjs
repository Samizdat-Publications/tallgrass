// Time from navigation to window.__ready on the live site (fresh browser context, no cache), twice.
import { chromium } from 'playwright';
const url = 'https://tallgrass.stewartgregerson.workers.dev/?autocam=0';
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
for (let k = 0; k < 2; k++) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 480000 });
  const tLoad = Date.now() - t0;
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 480000 });
  console.log(`run ${k + 1}: load event ${(tLoad / 1000).toFixed(1)} s, ready ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await ctx.close();
}
await browser.close();
