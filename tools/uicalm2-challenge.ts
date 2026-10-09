// Challenge flow with the tools drawer: the Tools button stays, shows the interventions left, applies tools, arms a positional one,
// and greys out when none are left. Real GPU, 1280x720. Prints "check" lines and exits non-zero if one fails.
//   npx tsx tools/uicalm2-challenge.ts [--challenge homecoming] [--out review/wip/ui-calm2]

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const challenge = arg('challenge', 'homecoming');
const out = resolve(arg('out', 'review/wip/ui-calm2'));
const timeout = Number(arg('timeout', '400000'));

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`check ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
};

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  const browser = await chromium.launch({ headless: true, args });
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console ' + m.text()); });
    await page.goto(`http://127.0.0.1:${port}/index.html?challenge=${challenge}&grass=0&q=medium&autocam=0&notitle=1&dim=0`, { timeout });
    await page.waitForFunction(() => (window as unknown as W).__ready === true, null, { timeout });
    await page.waitForTimeout(2500);
    const badge = (): Promise<string> => page.evaluate(() => (document.querySelector('.tg-tools-badge') as HTMLElement | null)?.textContent ?? '');
    const isOpen = (): Promise<boolean> => page.evaluate(() => !!document.querySelector('.tg-rail')?.classList.contains('is-open'));
    const btnText = (): Promise<string> => page.evaluate(() => (document.querySelector('.tg-tools-text') as HTMLElement | null)?.textContent ?? '');
    const total = Number(await badge());
    check('the tools button shows the interventions left', total > 0, `badge ${total}`);
    await page.screenshot({ path: join(out, `challenge-${challenge}-start.jpg`), type: 'jpeg', quality: 88 });

    await page.click('.tg-tools-btn');
    check('a click opens the drawer', await isOpen());
    await page.click('[data-tool="rain"]');
    await page.waitForTimeout(400);
    check('an instant tool applies and the drawer closes', !(await isOpen()));
    check('the budget goes down by one', Number(await badge()) === total - 1, `badge ${await badge()}`);

    await page.keyboard.press('i');
    check('the I key opens the drawer', await isOpen());
    await page.click('[data-tool="fire"]');
    check('a positional tool arms and the button says so', (await btnText()).startsWith('Fire'), `"${await btnText()}"`);
    check('arming does not spend an intervention', Number(await badge()) === total - 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Esc lets the armed tool go', (await btnText()) === 'Tools', `"${await btnText()}"`);
    check('...and costs nothing', Number(await badge()) === total - 1);

    await page.keyboard.press('i');
    await page.click('[data-tool="fire"]');
    await page.mouse.click(640, 400);
    await page.waitForTimeout(500);
    check('a click on the ground places the tool and spends one', Number(await badge()) === total - 2, `badge ${await badge()}`);
    check('the button is back to "Tools"', (await btnText()) === 'Tools');

    // spend the rest
    for (let n = Number(await badge()); n > 0; n--) {
      await page.keyboard.press('i');
      await page.click('[data-tool="drought"]');
      await page.waitForTimeout(300);
    }
    check('the budget runs out', Number(await badge()) === 0, `badge ${await badge()}`);
    await page.keyboard.press('i');
    await page.waitForTimeout(500);
    const disabled = await page.evaluate(() => (document.querySelector('[data-tool="rain"]') as HTMLButtonElement | null)?.disabled ?? false);
    const note = await page.evaluate(() => (document.querySelector('.tg-rail-note') as HTMLElement | null)?.textContent ?? '');
    check('the drawer greys out with a note', disabled && note.includes('No interventions left'), `disabled ${disabled}, note "${note}"`);
    await page.screenshot({ path: join(out, `challenge-${challenge}-spent.jpg`), type: 'jpeg', quality: 88 });
    check('no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

main().then(() => process.exit(failed ? 1 : 0), (e) => { console.log('FAIL', e); process.exit(1); });
