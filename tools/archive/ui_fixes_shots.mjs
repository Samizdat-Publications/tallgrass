// UI fixes stills (round 17 items 7 to 10): drives the real game in headless GPU Chromium and saves JPEG q88 stills for
// the title card vs hint pill, the status line during a blizzard, the denser population panel, the territory palette on summer grass
// and the first-visit vs return tool rail. Run it once on the old tree and once on the new, with a different --tag.
//
// Usage (from the tree to test): node tools/ui_fixes_shots.mjs --out review/wip/ui-fixes --tag after
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'review/wip/ui-fixes');
const tag = arg('tag', 'after');
const only = arg('only', '');
mkdirSync(out, { recursive: true });

const kill = setTimeout(() => { console.error('ui_fixes_shots: hard timeout'); process.exit(2); }, 14 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
const log = [];
const say = (s) => { console.log(s); log.push(s); };

async function open(query, W, H, ctx0) {
  const ctx = ctx0 ?? await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}/index.html?${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  return { ctx, page };
}
const shot = async (page, name, clip) => {
  const path = `${out}/${tag}_${name}.jpg`;
  await page.screenshot({ path, type: 'jpeg', quality: 88, clip });
  say('saved ' + path);
};
const slate = (page) => page.evaluate(() => document.querySelector('.tg-slate-line')?.textContent ?? '');
const overlapOf = (page) => page.evaluate(() => {
  // does any visible chapter card text overlap the hint pill or another panel?
  const vis = (el) => el && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.05;
  const r = (el) => el.getBoundingClientRect();
  const card = document.querySelector('.tg-chapter.is-on');
  const parts = card ? [...card.querySelectorAll('.tg-chapter-title, .tg-chapter-sub')] : [];
  const hits = [];
  const others = ['.tg-glass', '.tg-slate', '.tg-rail .tg-tool'];
  for (const sel of others) {
    for (const o of document.querySelectorAll(sel)) {
      if (!vis(o)) continue;
      const b = r(o);
      if (b.width < 2) continue;
      for (const p of parts) {
        if (!(p.textContent ?? '').trim()) continue;
        const a = r(p);
        // text width only: measure the text range, not the full-width block
        const rg = document.createRange(); rg.selectNodeContents(p);
        const t = rg.getBoundingClientRect();
        if (t.right > b.left && t.left < b.right && t.bottom > b.top && t.top < b.bottom) hits.push(`${sel} vs ${p.className}`);
      }
    }
  }
  return { card: !!card, title: card?.querySelector('.tg-chapter-title')?.textContent, sub: card?.querySelector('.tg-chapter-sub')?.textContent, hintOn: !!document.querySelector('.tg-hint.is-on'), hintVisible: vis(document.querySelector('.tg-hint')), hits };
});

try {
  // ---- 1 + 2: blizzard card vs hint pill, and the status line, at two sizes
  if (!only || only === 'blizzard') {
    for (const [W, H, nm] of [[1280, 720, '720'], [1920, 1080, '1080']]) {
      const { ctx, page } = await open('notitle=1&autoscale=0&cam=wide&autocam=0', W, H);
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__ui.showHint());
      await page.waitForTimeout(900);
      say(`[${nm}] status before: ${await slate(page)}`);
      await page.evaluate(() => window.__apply({ kind: 'blizzard', ticks: 600 }));
      for (const [ms, label] of [[700, 't0.7'], [2500, 't3'], [7000, 't10']]) {
        await page.waitForTimeout(ms);
        const o = await overlapOf(page);
        say(`[${nm}] ${label} status: "${await slate(page)}" card=${o.card} "${o.title ?? ''}" / "${o.sub ?? ''}" hintVisible=${o.hintVisible} overlaps=${JSON.stringify(o.hits)}`);
        await shot(page, `blizzard_${nm}_${label}`);
      }
      await ctx.close();
    }
    // the paused case: a blizzard is called while the sim is paused (no tick has run yet)
    {
      const { ctx, page } = await open('notitle=1&autoscale=0&cam=wide&autocam=0', 1600, 900);
      await page.waitForTimeout(1200);
      await page.evaluate(() => { window.__speed(0); });
      await page.waitForTimeout(600);
      await page.evaluate(() => window.__apply({ kind: 'blizzard', ticks: 600 }));
      await page.waitForTimeout(1500);
      say(`[paused] status after calling a blizzard: "${await slate(page)}"`);
      await shot(page, 'blizzard_paused', { x: 0, y: 0, width: 600, height: 120 });
      await ctx.close();
    }
  }

  // ---- 1b: long title cards never run under other panels (1280x720 and 1920x1080, population panel closed and open)
  if (!only || only === 'cards') {
    for (const [W, H, nm] of [[1280, 720, '720'], [1920, 1080, '1080']]) {
      const { ctx, page } = await open('notitle=1&autoscale=0&cam=wide&autocam=0', W, H);
      await page.waitForTimeout(1500);
      for (const open of [false, true]) {
        if (open) { await page.click(".tg-pop-expand"); await page.waitForTimeout(700); }
        for (const [t, s] of [['Blizzard', 'Year 1'], ['A new pack takes the ridge', 'The Cottonwood pack, year 14']]) {
          await page.evaluate(([a, b]) => window.__ui.chapterCard.show(a, b, 6000, false), [t, s]);
          await page.waitForTimeout(2200);
          const o = await overlapOf(page);
          say(`[cards ${nm} pop${open ? 'Open' : 'Closed'}] "${t.slice(0, 20)}" overlaps=${JSON.stringify(o.hits)}`);
          if (t.length > 20) await shot(page, `card_${nm}_${open ? 'open' : 'closed'}`);
          await page.waitForTimeout(4200);
        }
      }
      await ctx.close();
    }
  }

  // ---- 3: the population panel and the chronicle over busy grass (dawn), crops
  if (!only || only === 'panel') {
    const { ctx, page } = await open('notitle=1&autoscale=0&cam=low&autocam=0', 1600, 900);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__speed(10));
    await page.waitForTimeout(9000);
    await page.evaluate(() => { window.__speed(1); window.__timeOfDay(0.27); });
    await page.waitForTimeout(2500);
    await page.mouse.move(800, 400);
    await shot(page, 'panel_full');
    await shot(page, 'panel_pop_crop', { x: 0, y: 540, width: 520, height: 360 });
    await shot(page, 'panel_chron_crop', { x: 1240, y: 40, width: 360, height: 420 });
    await ctx.close();
  }

  // ---- 4: territory overlay on summer grass
  if (!only || only === 'territory') {
    const { ctx, page } = await open('notitle=1&autoscale=0&cam=wide&autocam=0&speed=100', 1600, 900);
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < 90000) {
      n = await page.evaluate(() => (window.__snap()?.packs?.length ?? 0) / 4);
      if (n >= 2) break;
      await page.waitForTimeout(1000);
    }
    say(`[territory] packs after ${Math.round((Date.now() - t0) / 1000)} s: ${n}`);
    await page.evaluate(() => window.__speed(0));
    await page.waitForTimeout(500);
    await page.click('.tg-ov-btn');
    await page.click('.tg-ov-item:has-text("Territories")');
    await page.evaluate(() => window.__concept({ day: 0.42, season: 1.15, dist: 420, pitch: 42, side: 0 }));
    await page.waitForTimeout(2500);
    await page.mouse.move(800, 300);
    await shot(page, 'territory_summer');
    await page.evaluate(() => window.__concept({ day: 0.42, season: 1.9, dist: 420, pitch: 42, side: 0 }));
    await page.waitForTimeout(2500);
    await shot(page, 'territory_autumn');
    await ctx.close();
  }

  // ---- 5: first visit vs return visit (same browser context, so localStorage carries over)
  if (!only || only === 'rail') {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const a = await open('notitle=1&autoscale=0&cam=wide&autocam=0', 1600, 900, ctx);
    await a.page.waitForTimeout(2500);
    say(`[rail] first visit rail intro: ${await a.page.evaluate(() => document.querySelector('.tg-rail')?.classList.contains('is-intro'))}`);
    await shot(a.page, 'rail_first_visit');
    await a.page.close();
    const b = await open('notitle=1&autoscale=0&cam=wide&autocam=0', 1600, 900, ctx);
    await b.page.waitForTimeout(2500);
    say(`[rail] return visit rail intro: ${await b.page.evaluate(() => document.querySelector('.tg-rail')?.classList.contains('is-intro'))}`);
    await shot(b.page, 'rail_return_visit');
    await ctx.close();
  }
} finally {
  say(`console errors: ${errors.length}${errors.length ? ' ' + JSON.stringify(errors.slice(0, 5)) : ''}`);
  writeFileSync(`${out}/${tag}_log${only ? '_' + only : ''}.txt`, log.join('\n') + '\n');
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
