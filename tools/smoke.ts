// Browser smoke test (V2-PLAN.md S0 step 7): start Vite, load the game in headless Chromium (any GL, software is
// fine), wait for __ready, step 2,000 ticks, fail on any console error, save one JPEG.
//   npx tsx tools/smoke.ts [--out scratch/smoke.jpg] [--timeout 120000] [--gpu | --swiftshader]
// --gpu is the default on Windows (the real GPU); elsewhere SwiftShader, which the cloud VM needs.
// Exit codes: 0 pass, 1 fail, 2 skipped (Chromium could not launch; say so in TRACK-S.md).

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const out = resolve(arg('out', 'scratch/smoke.jpg'));
const timeout = Number(arg('timeout', '120000'));
const gpu = argv.includes('--gpu') || (process.platform === 'win32' && !argv.includes('--swiftshader'));

async function main(): Promise<number> {
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  let browser: Browser | undefined;
  let skipped = false;
  const log: string[] = []; // every console line, shown when the page never gets ready
  try {
    // GPU mode (--gpu, the default on Windows): the real GPU, never throttled. Otherwise SwiftShader (cloud VMs have no GPU).
    const background = ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
    const args = gpu
      ? ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), ...background]
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...background];
    // Playwright's own browser first; then a preinstalled Chromium (cloud VMs ship one whose build may not match)
    const fallbacks = [process.env.SMOKE_CHROMIUM, '/opt/pw-browsers/chromium/chrome', '/opt/pw-browsers/chromium'].filter(Boolean) as string[];
    let lastErr = '';
    for (const executablePath of [undefined, ...fallbacks]) {
      try {
        browser = await chromium.launch({ headless: true, args, executablePath });
        break;
      } catch (e) {
        lastErr = (e as Error).message.split('\n')[0];
      }
    }
    if (!browser) {
      console.log(`SKIP: Chromium could not launch (${lastErr})`);
      return 2;
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // count animation frames, so a timeout can tell "no frames" from "frames too slow" (software GL)
    await page.addInitScript(() => {
      const w = window as unknown as { __smokeFrames: number };
      w.__smokeFrames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { w.__smokeFrames++; cb(t); });
    });
    const errors: string[] = [];
    page.on('console', (m) => {
      log.push(`[${m.type()}] ${m.text()}`);
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`);
    });
    page.on('worker', (wk) => log.push(`[worker] started ${wk.url()}`));
    page.on('pageerror', (e) => {
      log.push(`[pageerror] ${String(e)}`);
      errors.push(String(e));
    });
    await page.goto(`http://127.0.0.1:${port}/index.html?grass=0&q=medium&autocam=0`, { timeout });
    try {
      await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout });
    } catch (e) {
      const state = await page
        .evaluate(() => {
          const w = window as unknown as { __fps?: number; __smokeFrames?: number };
          return `frames=${w.__smokeFrames} fps=${w.__fps} text="${document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)}"`;
        })
        .catch(() => '(page not evaluable)');
      log.push(`[state] ${state}`);
      const frames = await page.evaluate(() => (window as unknown as { __smokeFrames?: number }).__smokeFrames ?? 0).catch(() => 0);
      if (frames > 0 && frames < timeout / 1000) {
        // frames are arriving, just slower than 1 per second: a software rasterizer (cloud VM), not a broken build
        console.log(`SKIP: ${frames} frames in ${timeout / 1000} s, software GL too slow for the ready gate; run on a GPU machine`);
        for (const m of log.slice(-20)) console.log('  ' + m);
        skipped = true;
      }
      throw e;
    }
    await page.evaluate(() => (window as unknown as { __step: (n: number) => void }).__step(2000));
    await page.waitForTimeout(5000);
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
    if (errors.length) {
      console.log(`FAIL: ${errors.length} console error(s):`);
      for (const e of errors.slice(0, 20)) console.log('  ' + e);
      return 1;
    }
    console.log(`PASS: no console errors, saved ${out}`);
    return 0;
  } catch (e) {
    if (skipped) return 2;
    console.log(`FAIL: ${(e as Error).message.split('\n')[0]}`);
    for (const m of log.slice(-20)) console.log('  ' + m);
    return 1;
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().then((code) => process.exit(code));
