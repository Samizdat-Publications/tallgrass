// First-run check: drives the real game in headless GPU Chromium and saves stills of what a stranger meets after clicking Play:
// the splash poster at t=0.3 s, the title card over the poster, the valley just after the splash fades, the first-run tips card at
// several screen sizes (with a geometry check that it never overlaps the other panels), the HUD after Watch at three sizes (overlap
// audit), the "no WebGL2" card and the phone card. Exits non-zero when a check fails.
//
// Usage: node tools/firstrun_check.mjs [--out scratch/v1-firstrun] [--only splash,tips,hud,cards]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/v1-firstrun');
const only = new Set(arg('only', 'splash,tips,hud,cards').split(','));
mkdirSync(out, { recursive: true });

const kill = setTimeout(() => { console.error('firstrun_check: hard timeout'); process.exit(2); }, 14 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const problems = [];
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) problems.push(msg); };
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('saved', `${out}/${name}.png`); };

async function newPage(w, h, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  return { ctx, page, errors };
}
const ready = (page) => page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });

/** Boxes of the HUD parts that are on screen (visible, not faded out). */
async function hudBoxes(page) {
  await page.mouse.move(40 + Math.random() * 20, 300);
  await page.waitForTimeout(700); // (the idle dim fades the panels after a quiet spell; a nudge brings them back)
  return page.evaluate(() => {
    const sel = { pop: '.tg-pop', tips: '.tg-tips.is-on', fn: '.tg-fn-toast.is-on', tools: '.tg-tools-btn', chron: '.tg-chron', time: '.tg-time', cam: '.tg-camchip', overlays: '.tg-overlay', slate: '.tg-slate', goal: '.tg-goal', top: '.tg-topright-row', hint: '.tg-hint.is-on', toast: '.tg-toast.is-on', chapter: '.tg-chapter.is-on .tg-chapter-title' };
    const boxes = {};
    for (const [k, s] of Object.entries(sel)) {
      const el = document.querySelector(s);
      if (!el) continue;
      let hidden = false;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) { hidden = true; break; }
      }
      if (hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      boxes[k] = { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) };
    }
    return boxes;
  });
}
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
function overlaps(boxes) {
  const ks = Object.keys(boxes), res = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (overlap(boxes[ks[i]], boxes[ks[j]])) res.push(`${ks[i]}+${ks[j]}`);
  return res;
}

try {
  if (only.has('splash')) {
    // the splash at 0.3 s, the title card over the poster, the valley after the fade (?splash=1 keeps the fade under automation)
    const { ctx, page, errors } = await newPage(1600, 900);
    await page.goto(`${base}/index.html?title=1&splash=1&autoscale=0`, { waitUntil: 'commit' });
    await page.waitForTimeout(300);
    await shot(page, '01_splash_t0.3s');
    check(await page.locator('#splash').count() === 1, 'the splash is in the very first paint');
    await page.waitForSelector('.tg-title.is-on', { timeout: 120000 });
    await page.waitForTimeout(900);
    const stillThere = await page.locator('#splash').count();
    await shot(page, '02_title_over_poster');
    check(stillThere === 1, 'the splash is still up while the title card is showing (the valley is not drawn yet)');
    check(await page.locator('.tg-title-wait').isVisible(), 'the title card shows its "preparing" line while the valley is not ready');
    await page.waitForSelector('#splash.is-done', { timeout: 150000, state: 'attached' }).catch(() => {});
    await page.waitForTimeout(350);
    await shot(page, '03a_fade_midway');
    await page.waitForSelector('#splash', { state: 'detached', timeout: 10000 });
    await page.waitForTimeout(300);
    await shot(page, '03_valley_after_fade');
    check(await page.locator('.tg-title-wait').isHidden(), 'the "preparing" line is gone once the valley is ready');
    check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  if (only.has('tips')) {
    for (const [w, h] of [[1280, 720], [1366, 768], [1600, 900], [1920, 1080], [800, 600]]) {
      const { ctx, page, errors } = await newPage(w, h);
      await page.goto(`${base}/index.html?title=1&autoscale=0`, { waitUntil: 'load', timeout: 120000 });
      await ready(page);
      await page.waitForTimeout(800);
      await page.keyboard.press('Enter'); // Watch
      await page.waitForSelector('.tg-tips.is-on', { timeout: 20000 });
      await page.waitForTimeout(900);
      await shot(page, `04_tips_${w}x${h}`);
      const boxes = await hudBoxes(page);
      const tips = boxes.tips;
      const bad = tips ? Object.entries(boxes).filter(([k, b]) => k !== 'tips' && overlap(tips, b)).map(([k]) => k) : ['no tips box'];
      check(bad.length === 0, `tips card at ${w}x${h} overlaps nothing ${JSON.stringify(tips)} ${bad.join(',')}`);
      check(tips && tips.l >= 0 && tips.r <= w && tips.t >= 0 && tips.b <= h, `tips card at ${w}x${h} is fully on screen`);
      check(errors.length === 0, `no page errors at ${w}x${h} ${errors.join(' | ')}`);
      await ctx.close();
    }
  }

  if (only.has('hud')) {
    for (const [w, h] of [[1280, 720], [1366, 768], [800, 600]]) {
      const { ctx, page } = await newPage(w, h);
      await page.goto(`${base}/index.html?title=1&autoscale=0`, { waitUntil: 'load', timeout: 120000 });
      await ready(page);
      await page.evaluate(() => localStorage.setItem('tallgrass.tips.v1', '1'));
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
      // run a little so the population rows fill, then raise the field-notes toast
      await page.evaluate(() => { window.__speed?.(4); });
      await page.waitForTimeout(6000);
      await shot(page, `05_hud_${w}x${h}`);
      let boxes = await hudBoxes(page);
      check(overlaps(boxes).length === 0, `HUD parts never overlap at ${w}x${h}: ${overlaps(boxes).join(',')} ${JSON.stringify(boxes)}`);
      await page.evaluate(() => window.__ui.noteToast.show({ title: 'The first wolves' }, performance.now(), 30000));
      await page.waitForTimeout(900);
      boxes = await hudBoxes(page);
      await shot(page, `06_hud_toast_${w}x${h}`);
      check(!!boxes.fn, `the field-notes toast is visible at ${w}x${h}`);
      check(overlaps(boxes).length === 0, `HUD parts with the toast never overlap at ${w}x${h}: ${overlaps(boxes).join(',')} ${JSON.stringify(boxes)}`);
      // hover the sparkline rows: the "high N / low N" labels must sit inside the panel (the Raven row once showed "high 2..." clipped)
      const clip = { x: 0, y: Math.max(0, boxes.pop.t - 4), width: Math.min(w, boxes.pop.r + 40), height: boxes.pop.b - boxes.pop.t + 8 };
      const cells = page.locator('.tg-pop .tg-cell');
      const n = await cells.count();
      for (const i of [Math.min(2, n - 1), n - 1]) {
        const cb = await cells.nth(i).boundingBox();
        await page.mouse.move(cb.x + cb.width * 0.6, cb.y + cb.height * 0.75);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${out}/07_pop_hover${i}_${w}x${h}.png`, clip });
      }
      // the open graph (the expand button): its labels and legend at this size
      await page.mouse.move(w / 2, h / 2);
      await page.locator('.tg-pop button[aria-label*="xpand" i], .tg-pop button[title*="xpand" i], .tg-pop button[aria-label*="graph" i]').first().click({ timeout: 3000 }).catch(() => console.log('no expand button found'));
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.__ui.toast.show('3 new behaviours noted', 'Field guide', 30000));
      await page.waitForTimeout(700);
      boxes = await hudBoxes(page);
      await shot(page, `08_pop_open_${w}x${h}`);
      check(!!boxes.toast && overlaps(boxes).length === 0, `open graph, guide toast and field-notes toast never overlap at ${w}x${h}: ${overlaps(boxes).join(',') || 'none'}`);
      await ctx.close();
    }
  }

  if (only.has('cards')) {
    {
      const { ctx, page, errors } = await newPage(1600, 900);
      await page.goto(`${base}/index.html?nowebgl2=1`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('.sp-card.is-on', { timeout: 20000 });
      await page.waitForTimeout(900);
      await shot(page, '07_no_webgl2_card');
      check((await page.locator('.sp-card').innerText()).includes('needs WebGL2'), 'the WebGL2 card reads right');
      check(await page.locator('.sp-card a[href="https://tallgrass.pages.dev"]').count() === 1, 'the WebGL2 card links to the landing page');
      check(await page.locator('canvas').count() === 0, 'no engine was started without WebGL2');
      check(errors.length === 0, `no page errors on the WebGL2 card ${errors.join(' | ')}`);
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await newPage(390, 844, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await page.goto(`${base}/index.html`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('.sp-card.is-on', { timeout: 20000 });
      await page.waitForTimeout(900);
      await shot(page, '08_phone_card_390x844');
      check((await page.locator('.sp-card').innerText()).includes('made for a desktop browser'), 'the phone card reads right');
      check(await page.locator('canvas').count() === 0, 'no engine was started behind the phone card');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the phone card fits the width');
      check(errors.length === 0, `no page errors on the phone card ${errors.join(' | ')}`);
      await page.click('.sp-btn:has-text("Try anyway")');
      await page.waitForSelector('canvas', { timeout: 120000 });
      check(await page.locator('.sp-card').count() === 0, '"Try anyway" removes the card and starts the game');
      await page.waitForTimeout(1500);
      await shot(page, '09_phone_try_anyway_390x844');
      await ctx.close();
    }
  }
} catch (e) {
  console.error('firstrun_check failed:', e);
  problems.push(String(e));
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  clearTimeout(kill);
}
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall checks passed');
process.exit(problems.length ? 1 : 0);
