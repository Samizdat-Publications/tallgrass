// Field-note camera check: with the documentary director on, earn field notes and fire headline events, and save a still a few seconds
// after each cut, so a reviewer can see the subject (not a grey smudge, not the empty sky). Real GPU on Windows.
//   npx tsx tools/fieldnote-camera.ts [--out review/wip/fieldnote-camera] [--steps 3000] [--seed tallgrass] [--only a,b] [--after 3000]
// Exit code 0 when no console errors, 1 otherwise.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = argv.indexOf('--' + k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const outDir = resolve(arg('out', 'review/wip/fieldnote-camera'));
const steps = Number(arg('steps', '3000'));
const seed = arg('seed', '');
const after = Number(arg('after', '3000'));
const only = arg('only', '').split(',').filter(Boolean);

interface Case {
  name: string;
  /** The field note to earn (window.__fieldnotes.debugEarn). */
  note?: string;
  /** Or a real sim event, set off with an intervention at the first animal of this species (0 bison): the headline-event path. */
  fire?: number;
}

const CASES: Case[] = [
  { name: 'kill-ravens', note: 'firstKill' },
  { name: 'alarm-town', note: 'alarmWave' },
  { name: 'pronghorn', note: 'pronghornMigration' },
  { name: 'coyote', note: 'mousingLeap' },
  { name: 'stampede', note: 'stampede100' },
  { name: 'wolves', note: 'packFounded' },
  { name: 'plague-town', note: 'townPlague' },
  { name: 'hares', note: 'hareBoom' },
  { name: 'event-fire', fire: 0 },
];

async function main(): Promise<number> {
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const background = ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', ...background] });
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/index.html?q=medium&autocam=0&speed=0${seed ? '&seed=' + encodeURIComponent(seed) : ''}`, { timeout: 120000 });
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 120000 });
    await page.evaluate((n) => (window as unknown as { __step: (n: number) => void }).__step(n), steps);
    // the worker steps in the background: wait until the snapshot has caught up, then bring the light to mid-afternoon (the sim is paused)
    await page.waitForFunction((n) => ((window as any).__snap()?.tick ?? 0) >= n, steps, { timeout: 240000 });
    await page.evaluate(() => (window as any).__timeOfDay(0.42));
    await page.waitForTimeout(4000);
    mkdirSync(outDir, { recursive: true });
    const info = await page.evaluate(() => {
      const w = window as any;
      const s = w.__snap();
      const cnt: Record<number, number> = {};
      for (let k = 0; k < s.count; k++) cnt[s.agents[k * 12]] = (cnt[s.agents[k * 12]] ?? 0) + 1;
      const small = w.__lastSmall();
      let towns = 0, hares = 0;
      if (small) for (let c = 0; c < 1024; c++) { if (small[c * 4 + 2] > 90) towns++; if (small[c * 4] > 12) hares++; }
      return { tick: s.tick, species: cnt, carcasses: s.carcassCount, townCells: towns, hareCells: hares };
    });
    console.log('world', JSON.stringify(info));
    await page.evaluate(() => { (window as any).__director.setEnabled(true); });
    await page.waitForTimeout(9000); // let the toasts of the notes earned while the world was stepping clear
    for (const c of CASES) {
      if (only.length && !only.includes(c.name)) continue;
      // start from a wide, neutral shot so the cut is the director's doing
      await page.evaluate(() => { const d = (window as any).__director; d.setEnabled(false); d.setEnabled(true); });
      await page.waitForTimeout(500);
      const t0 = Date.now();
      if (c.note) await page.evaluate((id) => { const fn = (window as any).__fieldnotes; fn.clear(); fn.debugEarn(id); }, c.note);
      else {
        await page.evaluate((sp) => {
          const w = window as any;
          w.__fieldnotes.clear();
          const s = w.__snap();
          for (let k = 0; k < s.count; k++) {
            const o = k * 12;
            if (s.agents[o] === sp) { w.__apply({ kind: 'fire', x: s.agents[o + 1], y: s.agents[o + 2] }); break; }
          }
          w.__step(2);
        }, c.fire ?? 0);
      }
      await page.waitForTimeout(after);
      const st = await page.evaluate(() => {
        const w = window as any, d = w.__director;
        if (!d.current) return null;
        const o = { kind: d.current.kind, id: d.current.id, dist: Math.round(d.current.dist), moment: d.current.moment === true } as Record<string, unknown>;
        // what the camera is on: the followed animal, or the fixed point and the carcasses and birds around it
        const s = w.__snap();
        let x = d.current.x, y = d.current.y;
        if (d.current.id !== null) for (let k = 0; k < s.count; k++) if (s.ids[k] === d.current.id) { x = s.agents[k * 12 + 1]; y = s.agents[k * 12 + 2]; o.sp = s.agents[k * 12]; }
        o.at = [Math.round(x), Math.round(y)];
        let car = 0, rav = 0;
        for (let k = 0; k < s.carcassCount; k++) if (Math.hypot(s.carcasses[k * 4] - x, s.carcasses[k * 4 + 1] - y) < 6 && s.carcasses[k * 4 + 2] > 0.1) car++;
        for (let k = 0; k < s.count; k++) if (s.agents[k * 12] === 2 && Math.hypot(s.agents[k * 12 + 1] - x, s.agents[k * 12 + 2] - y) < 16) rav++;
        o.carcassesWithin6m = car; o.ravensWithin16m = rav;
        return o;
      });
      const file = `${outDir}/${c.name}.jpg`;
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
      // the same frame with the interface hidden, to judge the framing itself
      await page.evaluate(() => { (document.getElementById('ui') as HTMLElement).style.visibility = 'hidden'; });
      await page.screenshot({ path: `${outDir}/${c.name}-clean.jpg`, type: 'jpeg', quality: 88 });
      await page.evaluate(() => { (document.getElementById('ui') as HTMLElement).style.visibility = ''; });
      console.log(`${c.name}: shot=${JSON.stringify(st)} still after ${Date.now() - t0} ms -> ${file}`);
      // let the toast of this note clear, so the next still carries its own caption
      await page.waitForTimeout(7000);
    }
    if (errors.length) {
      console.log(`FAIL: ${errors.length} console error(s)`);
      for (const e of errors.slice(0, 10)) console.log('  ' + e);
      return 1;
    }
    console.log('PASS: no console errors');
    return 0;
  } finally {
    await browser.close();
    await server.close();
  }
}

main().then((c) => process.exit(c), (e) => { console.log('FAIL', e); process.exit(1); });
