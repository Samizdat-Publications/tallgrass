// Time from navigation to window.__ready against a local preview server (fresh browser context each run, no cache).
// usage: node tools/loadtime.mjs [url] [runs]   (default http://localhost:5198/?autocam=0, 3 runs)
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5198/?autocam=0';
const runs = Number(process.argv[3] ?? 3);
const launch = () => chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const out = [];
for (let k = 0; k < runs; k++) {
  const browser = await launch(); // a new browser per run: the GPU process shader cache starts empty (a true cold start)
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 240000 });
  const tLoad = Date.now() - t0;
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 }); } catch { console.log('TIMEOUT waiting for __ready'); }
  const tReady = Date.now() - t0;
  const marks = await page.evaluate(() => (window.__marks ?? null));
  console.log(`run ${k + 1}: load event ${(tLoad / 1000).toFixed(1)} s, ready ${(tReady / 1000).toFixed(1)} s`);
  if (marks) console.log(JSON.stringify(marks));
  const pc = await page.evaluate(() => (window.__progCounts ? window.__progCounts() : null));
  if (pc) console.log('programs per frame:', pc.join(' '));
  out.push(tReady);
  await ctx.close();
  await browser.close();
}
console.log('ready times (s):', out.map((v) => (v / 1000).toFixed(1)).join(', '));
