// UI calm check: stills of the left-hand panels at 1x, 10x and 100x, collapsed and expanded, at two window sizes,
// plus an optional short video at 100x. Real GPU (same launch setup as tools/smoke.ts).
//   npx tsx tools/uicalm-shots.ts --label before [--out review/wip/ui-calm] [--video 10] [--sizes 1280x720,1920x1080]
// Writes <out>/<label>-<w>x<h>-<speed>x-<collapsed|open>.jpg, and <out>/<label>-100x.mp4 when --video is set (needs ffmpeg).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const label = arg('label', 'shot');
const out = resolve(arg('out', 'review/wip/ui-calm'));
const videoSec = Number(arg('video', '0'));
/** --nointro drops the rail's opening label intro (it lasts two minutes), to show the steady-state layout. */
const noIntro = argv.includes('--nointro');
const sizes = arg('sizes', '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const SPEEDS = [1, 10, 100];

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function open(browserNew: () => Promise<Page>, port: number): Promise<Page> {
  const page = await browserNew();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?grass=0&q=medium&autocam=0&notitle=1`, { timeout: 120000 });
  await page.waitForFunction(() => (window as unknown as W).__ready === true, null, { timeout: 120000 });
  // a few years of history so every sparkline has a shape
  // (the worker is busy and posts nothing while it steps, so wait for the tick to show up)
  await page.evaluate(() => (window as unknown as W).__step(4800));
  await page.waitForFunction(() => ((window as unknown as W).__snap()?.tick ?? 0) >= 4800, null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(2000);
  if (noIntro) await page.evaluate(() => document.querySelector('.tg-rail')?.classList.remove('is-intro'));
  return page;
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  const browser = await chromium.launch({ headless: true, args });
  try {
    for (const [w, h] of sizes) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await open(() => ctx.newPage(), port);
      for (const s of SPEEDS) {
        await page.evaluate((v) => (window as unknown as W).__speed(v), s);
        for (const state of ['collapsed', 'open'] as const) {
          const isOpen = await page.evaluate(() => !!document.querySelector('.tg-pop.is-open'));
          if ((state === 'open') !== isOpen) await page.click('.tg-pop-expand');
          await page.waitForTimeout(state === 'open' ? 2500 : 3500);
          await page.screenshot({ path: join(out, `${label}-${w}x${h}-${s}x-${state}.jpg`), type: 'jpeg', quality: 88 });
        }
        // back to collapsed for the next speed
        if (await page.evaluate(() => !!document.querySelector('.tg-pop.is-open'))) await page.click('.tg-pop-expand');
      }
      if (w === sizes[0][0]) {
        // how busy the panel is: count changes per second, and sparkline redraws per second, over 4 s at each speed
        await page.evaluate(() => {
          const win = window as unknown as W;
          win.__numChanges = 0;
          win.__sparkDraws = 0;
          new MutationObserver((ms) => { win.__numChanges += ms.length; }).observe(document.querySelector('.tg-cells')!, { childList: true, characterData: true, subtree: true });
          const clear = CanvasRenderingContext2D.prototype.clearRect;
          CanvasRenderingContext2D.prototype.clearRect = function (...a: [number, number, number, number]) {
            if ((this.canvas as HTMLCanvasElement).classList.contains('tg-spark')) win.__sparkDraws++;
            return clear.apply(this, a);
          };
        });
        for (const s of SPEEDS) {
          await page.evaluate((v) => { const win = window as unknown as W; win.__speed(v); }, s);
          await page.waitForTimeout(1500);
          await page.evaluate(() => { const win = window as unknown as W; win.__numChanges = 0; win.__sparkDraws = 0; });
          await page.waitForTimeout(4000);
          const r = await page.evaluate(() => { const win = window as unknown as W; return [win.__numChanges, win.__sparkDraws]; });
          console.log(`${label} ${s}x: number text changes ${(r[0] / 4).toFixed(1)}/s, sparkline redraws ${(r[1] / 4).toFixed(1)}/s`);
        }
      }
      await ctx.close();
    }
    if (videoSec > 0) {
      const dir = join(out, '_vid');
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
      const page = await open(() => ctx.newPage(), port);
      await page.evaluate(() => (window as unknown as W).__speed(100));
      await page.waitForTimeout(1500);
      await page.waitForTimeout(videoSec * 1000);
      await ctx.close();
      const webm = readdirSync(dir).find((f) => f.endsWith('.webm'));
      if (webm) {
        renameSync(join(dir, webm), join(out, `${label}-100x.webm`));
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(out, `${label}-100x.webm`), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', join(out, `${label}-100x.mp4`)]);
        rmSync(join(out, `${label}-100x.webm`), { force: true });
      }
      rmSync(dir, { recursive: true, force: true });
    }
    console.log('done', out);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().then(() => process.exit(0), (e) => { console.log('FAIL', e); process.exit(1); });
