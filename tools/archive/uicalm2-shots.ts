// UI calm round 2: before/after stills for the round 20 UI items, on the real GPU.
//   npx tsx tools/uicalm2-shots.ts --label after [--root <repo to serve>] [--out review/wip/ui-calm2] [--sizes 1280x720,1920x1080]
// --root serves another checkout (the "before" run points it at main). Writes <out>/<label>-<w>x<h>-<shot>.jpg and prints facts
// (inspector state right after a pick, the speed button text, console errors) as lines starting with "fact".
//   shots: default (dim off), tools (drawer open, "after" only), graph, graphlog, graphhover, speed100, territory, territory-close, select, idle

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const label = arg('label', 'shot');
const out = resolve(arg('out', 'review/wip/ui-calm2'));
const root = resolve(arg('root', '.'));
const sizes = arg('sizes', '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const timeout = Number(arg('timeout', '400000'));
const only = arg('only', '').split(',').filter(Boolean);
const want = (s: string): boolean => only.length === 0 || only.includes(s);

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const errors: string[] = [];

async function open(newPage: () => Promise<Page>, port: number, dim: boolean): Promise<Page> {
  const page = await newPage();
  page.on('pageerror', (e) => { errors.push('pageerror ' + String(e)); console.log('pageerror', String(e)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push('console ' + m.text()); console.log('console error', m.text()); } });
  await page.goto(`http://127.0.0.1:${port}/index.html?grass=0&q=medium&autocam=0&notitle=1${dim ? '' : '&dim=0'}`, { timeout });
  await page.waitForFunction(() => (window as unknown as W).__ready === true, null, { timeout });
  await page.evaluate(() => (window as unknown as W).__step(4800));
  await page.waitForFunction(() => ((window as unknown as W).__snap()?.tick ?? 0) >= 4800, null, { timeout, polling: 500 });
  await page.waitForTimeout(2500);
  return page;
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', fs: { strict: false } }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  const browser = await chromium.launch({ headless: true, args });
  try {
    for (const [w, h] of sizes) {
      const tag = `${label}-${w}x${h}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      let page = await open(() => ctx.newPage(), port, false);
      const shot = (name: string) => page.screenshot({ path: join(out, `${tag}-${name}.jpg`), type: 'jpeg', quality: 88 });

      // 1. the default frame (dim off)
      if (want('default')) {
        await page.waitForTimeout(500);
        await shot('default');
        // a later visit: the first-session line on the Tools button is gone (the old rail's labels were too)
        await page.evaluate(() => document.querySelector('.tg-rail')?.classList.remove('is-intro'));
        await page.waitForTimeout(400);
        await shot('default-later');
      }

      // 1b. the tools drawer (after only: the old rail is always open)
      if (want('tools') && (await page.evaluate(() => !!document.querySelector('.tg-tools-btn')))) {
        await page.keyboard.press('i');
        await page.waitForTimeout(500);
        await shot('tools');
        const hasDrawer = await page.evaluate(() => document.querySelector('.tg-rail')?.classList.contains('is-open'));
        console.log(`fact ${tag} drawer open after I key: ${hasDrawer}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // 2/3. the expanded graph, with the log scale, and a hover tooltip
      if (want('graph')) {
        await page.keyboard.press('g');
        await page.waitForTimeout(1500);
        await shot('graph');
        if (want('graphlog')) {
          await page.keyboard.press('l');
          await page.waitForTimeout(1000);
          await shot('graphlog');
          await page.keyboard.press('l');
        }
        await page.mouse.move(Math.round(w * 0.3), Math.round(h * 0.8));
        await page.waitForTimeout(500);
        await shot('graphhover');
        await page.mouse.move(Math.round(w * 0.74), Math.round(h * 0.8));
        await page.waitForTimeout(500);
        await shot('graphhover2');
        await page.keyboard.press('e');
        await page.waitForTimeout(1200);
        await shot('graphevo');
        await page.keyboard.press('e');
        await page.waitForTimeout(400);
        await page.keyboard.press('g');
        await page.waitForTimeout(600);
      }

      // 4. the speed buttons while the machine runs behind 100x
      if (want('speed100')) {
        await page.keyboard.press('3');
        await page.waitForTimeout(6000);
        await shot('speed100');
        const facts = await page.evaluate(() => ({
          buttons: Array.from(document.querySelectorAll('.tg-tspeed')).map((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ')),
          rate: (document.querySelector('.tg-trate') as HTMLElement | null)?.innerText ?? '',
          tps: (window as unknown as W).__snap()?.ticksPerSec,
        }));
        console.log(`fact ${tag} speed buttons ${JSON.stringify(facts)}`);
        // a pick while the worker is busy with a fast run: the card must still open at once
        const fastId = await page.evaluate(() => { const f = (window as unknown as W).__find(3); return f.length ? f[0] : null; });
        if (fastId !== null) {
          const seen = await page.evaluate(async (pick) => {
            (window as unknown as W).__select(pick);
            const rows: string[] = [];
            const t0 = performance.now();
            for (let i = 0; i < 40; i++) {
              await new Promise((res) => requestAnimationFrame(res));
              const el = document.querySelector('.tg-insp');
              rows.push(`${Math.round(performance.now() - t0)}ms:${el?.classList.contains('is-open') ? (el.classList.contains('is-pending') ? 'pending' : 'open') : 'closed'}`);
            }
            return rows.filter((r, i, a) => i === 0 || r.split(':')[1] !== a[i - 1].split(':')[1]);
          }, fastId);
          console.log(`fact ${tag} inspector after a pick at 100x (state changes): ${seen.join(' ')}`);
          await shot('select100');
          await page.evaluate(() => (window as unknown as W).__select(null));
        }
        await page.keyboard.press('1');
        await page.waitForTimeout(500);
      }

      // 5. territories, wide and close
      if (want('territory')) {
        await page.evaluate(() => (window as unknown as W).__timeOfDay(0.5));
        await page.waitForTimeout(3000);
        await page.click('.tg-ov-btn');
        await page.waitForTimeout(300);
        await page.click('.tg-ov-item:nth-child(4)');
        await page.waitForTimeout(2500);
        await shot('territory');
        const den = await page.evaluate(() => { const p = (window as unknown as W).__snap()?.packs; return p && p.length >= 4 ? [p[0], p[1]] : null; });
        if (den) {
          await page.evaluate(([x, y]) => (window as unknown as W).__engine.cam.flyTo(x, y, 170, 38), den);
          await page.waitForTimeout(4500);
          await shot('territory-close');
        }
        await page.click('.tg-ov-btn');
        await page.waitForTimeout(300);
        await page.click('.tg-ov-item:nth-child(1)');
        await page.waitForTimeout(800);
      }

      // 6. a pick: is the inspector open on the very next frame?
      if (want('select')) {
        const id = await page.evaluate(() => { const f = (window as unknown as W).__find(3); return f.length ? f[Math.floor(f.length / 2)] : null; });
        if (id !== null) {
          const r = await page.evaluate(async (pick) => {
            const win = window as unknown as W;
            win.__select(pick);
            const seen: string[] = [];
            const t0 = performance.now();
            for (let i = 0; i < 8; i++) {
              await new Promise((res) => requestAnimationFrame(res));
              const el = document.querySelector('.tg-insp');
              seen.push(`${Math.round(performance.now() - t0)}ms:${el?.classList.contains('is-open') ? 'open' : 'closed'}${el?.classList.contains('is-pending') ? '/pending' : ''}`);
            }
            return seen;
          }, id);
          console.log(`fact ${tag} inspector after a pick: ${r.join(' ')}`);
          await shot('select');
          await page.waitForTimeout(2500);
          await shot('select-later');
          const later = await page.evaluate(() => document.querySelector('.tg-insp')?.className);
          console.log(`fact ${tag} inspector later: ${later}`);
          await page.evaluate(() => (window as unknown as W).__select(null));
        }
      }

      // 1c. the idle fade: nothing touched for a while, the dim on
      if (want('idle')) {
        await page.close();
        page = await open(() => ctx.newPage(), port, true);
        await page.waitForTimeout(11000);
        await shot('idle');
        const idle = await page.evaluate(() => document.querySelector('.tg-ui')?.classList.contains('is-idle'));
        console.log(`fact ${tag} idle class after 11 s: ${idle}`);
        await page.mouse.move(Math.round(w / 2), Math.round(h / 2));
        await page.waitForTimeout(700);
        const back = await page.evaluate(() => document.querySelector('.tg-ui')?.classList.contains('is-idle'));
        console.log(`fact ${tag} idle class after a pointer move: ${back}`);
      }
      await ctx.close();
    }
    console.log(`fact console errors: ${errors.length}`);
    for (const e of errors) console.log('  ' + e);
    console.log('done', out);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().then(() => process.exit(0), (e) => { console.log('FAIL', e); process.exit(1); });
