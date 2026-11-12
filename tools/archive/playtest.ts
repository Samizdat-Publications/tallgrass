// Browser playtest (lead's Phase 1 check): start Vite, load the game on the real GPU, play at 1x then 10x in real
// time, fire every god tool v2 through __apply, load each named challenge, and fail on any console or page error.
//   npx tsx tools/playtest.ts [--slow 120] [--fast 300] [--challenges meso,town,storm,cats] [--out scratch/playtest]
// Counts are read from the live frame (__snap) and written with one JPEG per stage.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const slowSec = Number(arg('slow', '120'));
const fastSec = Number(arg('fast', '300'));
const challenges = arg('challenges', 'meso,town,storm,cats').split(',').filter(Boolean);
const out = resolve(arg('out', 'scratch/playtest'));
const loadTimeout = Number(arg('timeout', '120000'));
const NAMES = ['bison', 'wolf', 'raven', 'pronghorn', 'rabbit', 'cougar', 'coyote', 'prairiedog', 'eagle', 'hawk', 'muledeer', 'beaver'];

type W = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function counts(page: Page): Promise<Record<string, number | string>> {
  return page.evaluate((names) => {
    const w = window as unknown as W;
    const f = w.__snap();
    const c: Record<string, number | string> = {};
    if (!f) return c;
    for (let k = 0; k < f.count; k++) {
      const n = names[f.agents[k * 12]] ?? 'sp' + f.agents[k * 12];
      c[n] = ((c[n] as number) ?? 0) + 1;
    }
    c.tick = f.tick;
    c.year = Number(f.env?.year ?? 0).toFixed(1);
    const s = w.__lastSmall?.();
    // 32 x 32 RGBA bytes: R jackrabbits, G prairie dogs, B town, A plague; report the summed channel and the cells used
    if (s) {
      const sum = [0, 0, 0, 0];
      const cells = [0, 0, 0, 0];
      for (let i = 0; i < s.length; i++) { sum[i & 3] += s[i]; if (s[i] > 0) cells[i & 3]++; }
      c.small = `hare ${sum[0]}/${cells[0]}c dogs ${sum[1]}/${cells[1]}c town ${cells[2]}c plague ${cells[3]}c`;
    } else c.small = 'none';
    return c;
  }, NAMES);
}

async function main(): Promise<number> {
  mkdirSync(out, { recursive: true });
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const background = ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', ...background] });
  const errors: string[] = [];
  const report: string[] = [];
  const log = (s: string): void => {
    console.log(s);
    report.push(s);
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${page.url().split('?')[1] ?? ''}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[pageerror ${page.url().split('?')[1] ?? ''}] ${String(e)}`));
    const load = async (query: string): Promise<void> => {
      await page.goto(`http://127.0.0.1:${port}/index.html?${query}`, { timeout: loadTimeout });
      await page.waitForFunction(() => (window as unknown as W).__ready === true, null, { timeout: loadTimeout });
    };
    const shot = (name: string): Promise<Buffer> => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 85 });

    // 1. default world, 1x then 10x, real time
    await load('autocam=1');
    log(`start  ${JSON.stringify(await counts(page))}  gpu? fps=${await page.evaluate(() => (window as unknown as W).__fps)}`);
    await page.evaluate(() => (window as unknown as W).__speed(1));
    for (let t = 0; t < slowSec; t += 30) await page.waitForTimeout(30000);
    log(`1x ${slowSec}s  ${JSON.stringify(await counts(page))}  fps=${await page.evaluate(() => (window as unknown as W).__fps)}`);
    await shot('01-after-1x');
    await page.evaluate(() => (window as unknown as W).__speed(10));
    for (let t = 0; t < fastSec; t += 60) {
      await page.waitForTimeout(60000);
      log(`10x +${t + 60}s  ${JSON.stringify(await counts(page))}`);
    }
    await shot('02-after-10x');

    // 2. god tools v2 (sim-side; the toolbar does not show them yet)
    const tools = [
      { kind: 'lightning', x: 0, y: 0 },
      { kind: 'blizzard', ticks: 1200 },
      { kind: 'flood', ticks: 1200, severity: 0.6 },
      { kind: 'disease', disease: 'fever', fraction: 0.2 },
      { kind: 'disease', disease: 'distemper', fraction: 0.3 },
      { kind: 'disease', disease: 'plague' },
      { kind: 'grove', x: 40, y: 40, radius: 20 },
    ];
    for (const iv of tools) {
      await page.evaluate((v) => (window as unknown as W).__apply(v), iv);
      await page.evaluate(() => (window as unknown as W).__step(600));
      await page.waitForTimeout(3000);
      log(`tool ${iv.kind}${'disease' in iv ? ':' + iv.disease : ''}  ${JSON.stringify(await counts(page))}`);
    }
    await shot('03-after-tools');

    // 3. challenges
    for (const id of challenges) {
      await load(`challenge=${id}&autocam=1`);
      await page.evaluate(() => (window as unknown as W).__speed(10));
      await page.waitForTimeout(45000);
      log(`challenge ${id}  ${JSON.stringify(await counts(page))}`);
      await shot(`04-challenge-${id}`);
    }
  } catch (e) {
    errors.push('[harness] ' + (e as Error).message.split('\n')[0]);
  } finally {
    await browser.close();
    await server.close();
  }
  log(errors.length ? `FAIL: ${errors.length} error(s)\n  ` + errors.slice(0, 30).join('\n  ') : 'PASS: no console or page errors');
  writeFileSync(`${out}/report.txt`, report.join('\n') + '\n');
  return errors.length ? 1 : 0;
}

main().then((code) => process.exit(code));
