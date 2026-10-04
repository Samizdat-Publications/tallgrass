// Play UI check (R12): drives the real game in headless GPU Chromium and saves JPEG q90 stills of the title card, tips,
// settings, valley setup, field guide (with a witnessed behaviour and a photograph), then does the share-link round trip:
// build a valley, apply an intervention, press Share, open the copied link in a fresh page, and compare the populations
// at the same tick (the sim is deterministic, so a faithful replay matches exactly).
//
// Usage: node tools/play_ui_check.mjs [--out review/wip/R12] [--size 1600x900]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'review/wip/R12');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
mkdirSync(out, { recursive: true });

const kill = setTimeout(() => { console.error('play_ui_check: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const problems = [];
let code = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) problems.push(msg); };

async function open(query, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'], ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}/index.html?${query}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  return { ctx, page, errors };
}
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 90 }); console.log('saved', `${out}/${name}.jpg`); };

try {
  // ---- 1. title card, then Watch and the first-run tips (a fresh context: no saved flags)
  {
    const { ctx, page, errors } = await open('title=1&autoscale=0');
    await page.waitForTimeout(2500);
    check(await page.locator('.tg-title.is-on').count() === 1, 'title card shows with ?title=1');
    await shot(page, '01_title_card');
    await page.click('.tg-title-btn:has-text("Challenges")');
    await page.waitForTimeout(400);
    await shot(page, '02_title_challenges');
    await page.click('.tg-title-listhead button');
    await page.click('.tg-title-btn.is-primary');
    await page.waitForTimeout(2600);
    check(await page.locator('.tg-tips.is-on').count() === 1, 'three tips appear after Watch on a first visit');
    await shot(page, '03_first_run_tips');
    await page.click('.tg-tips-ok');
    await page.waitForTimeout(700);
    check(await page.locator('.tg-tips.is-on').count() === 0, 'tips dismiss');
    check(await page.evaluate(() => localStorage.getItem('tallgrass.tips.v1')) === '1', 'tips flag saved');
    // a second visit in the same context: title again, but no tips after Watch
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await page.goto(`${base}/index.html?title=1&autoscale=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2200);
    check(await page.locator('.tg-tips.is-on').count() === 0, 'tips are shown once only');
    check(errors.length === 0, `title page: no page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- 1b. the tool query strings never get a title card
  for (const q of ['autocam=0&autoscale=0', 'notitle=1', 'seed=tallgrass&autocam=0']) {
    const { ctx, page } = await open(q);
    check(await page.locator('.tg-title').count() === 0, `no title card for ?${q}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open('autoscale=0'); // no title param, but headless: webdriver skips it
    check(await page.locator('.tg-title').count() === 0, 'no title card for an automated browser');
    await ctx.close();
  }

  // ---- 2. settings, valley setup, field guide (menu entries)
  {
    const { ctx, page, errors } = await open('autocam=0&autoscale=0&notitle=1');
    await page.waitForTimeout(1500);
    await page.click('.tg-menubtn');
    await page.waitForTimeout(400);
    await shot(page, '04_menu');
    await page.click('.tg-menurow:has-text("Settings")');
    await page.waitForTimeout(500);
    await shot(page, '05_settings');
    // change things and check they stick across a reload
    await page.click('.tg-seg-btn:has-text("Medium")');
    await page.waitForTimeout(500);
    check(await page.evaluate(() => window.__engine.quality) === 'medium', 'Medium preset switches the engine to its lighter tier');
    await page.click('.tg-seg-btn:has-text("Ultra")');
    await page.waitForTimeout(500);
    check(await page.evaluate(() => window.__engine.quality) === 'high' && await page.evaluate(() => window.__engine.autoScale) === false, 'Ultra: high tier, auto scale off');
    await page.click('.tg-seg-btn:has-text("Low")');
    await page.waitForTimeout(500);
    check(await page.evaluate(() => window.__engine.renderer.getPixelRatio()) < 1, 'Low draws below full size');
    await page.click('.tg-seg-btn:has-text("High")');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => window.__engine.quality) === 'high' && await page.evaluate(() => window.__engine.renderer.getPixelRatio()) === 1, 'High is the default look again (full size, high tier)');
    // sliders and switches
    await page.locator('.tg-settings .tg-range').first().fill('0.4');
    check(Math.abs(await page.evaluate(() => window.__audio.volume) - 0.4) < 1e-6, 'master volume slider drives the audio director');
    await page.locator('.tg-settings .tg-range').last().fill('1.25');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.tg-ui')).getPropertyValue('--ui-scale').trim()) === '1.25', 'interface size sets --ui-scale');
    await shot(page, '06_settings_scaled');
    await page.locator('.tg-settings .tg-switch:has-text("After a quiet spell")').click();
    await page.locator('.tg-settings .tg-switch:has-text("Dim the panels")').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tallgrass.settings.v1')));
    check(saved.autoCamera === false && saved.idleDim === false && saved.master === 0.4 && saved.uiScale === 1.25, `settings saved ${JSON.stringify(saved)}`);
    await page.goto(`${base}/index.html?autocam=0&autoscale=0&notitle=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    check(Math.abs(await page.evaluate(() => window.__audio.volume) - 0.4) < 1e-6, 'saved master volume is applied on load');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.tg-ui')).getPropertyValue('--ui-scale').trim()) === '1.25', 'saved interface size is applied on load');
    await page.evaluate(() => localStorage.removeItem('tallgrass.settings.v1'));

    // valley setup
    await page.goto(`${base}/index.html?autocam=0&autoscale=0&notitle=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await page.click('.tg-menubtn');
    await page.click('.tg-menurow:has-text("New valley")');
    await page.waitForTimeout(500);
    await shot(page, '07_new_valley');
    // fewer bison, more cougars, drier, harsher, quick years, no pronghorn
    await page.locator('.tg-setup-row').nth(0).locator('.tg-range').fill('300');
    await page.locator('.tg-setup-row:has-text("Cougars") .tg-range').fill('4');
    await page.locator('.tg-setup-row:has-text("Pronghorn") .tg-switch').click();
    await page.locator('.tg-setup-line:has-text("Climate") .tg-seg-btn:has-text("Drier")').click();
    await page.locator('.tg-setup-line:has-text("Winters") .tg-seg-btn:has-text("Harsher")').click();
    await page.locator('.tg-setup-line:has-text("Calendar") .tg-seg-btn:has-text("Quick")').click();
    await page.locator('.tg-setup .tg-input').fill('r12-check');
    await page.waitForTimeout(300);
    await shot(page, '08_new_valley_edited');
    check(await page.locator('.tg-setup .tg-switch:has-text("Open valley")').isEnabled(), 'open valley toggle is enabled (the sim has openPrairie since S1)');
    await Promise.all([page.waitForURL(/seed=r12-check/, { timeout: 60000 }), page.click('.tg-setup .tg-btn.is-primary')]);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    const url = new URL(page.url());
    const pq = url.searchParams.get('p') ?? '';
    console.log('setup url p =', pq);
    check(/bison\.initial:300/.test(pq) && /cougar\.initial:4/.test(pq) && /deer\.initial:0/.test(pq) && /calendarScale:4/.test(pq) && /grassGrowth:/.test(pq) && /winterDieback:/.test(pq), 'Start restarts with the chosen params in ?p=');
    await page.waitForTimeout(800);
    const pop = await page.evaluate(() => window.__snap().pop);
    check(pop[0] > 250 && pop[0] <= 340 && pop[3] === 0 && pop[5] === 4, `the new valley starts with the chosen animals (pop ${JSON.stringify(pop)})`);
    check(errors.length === 0, `settings and setup: no page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- 3. field guide: witness a behaviour, take a photograph
  {
    const { ctx, page, errors } = await open('autocam=0&autoscale=0&notitle=1');
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const c = window.__find(1, 10).concat(window.__find(1, 5)).concat(window.__find(1));
      window.__followId(c[0]);
      window.__engine.cam.setView({ distance: 45, pitchDeg: 22 });
    });
    await page.waitForTimeout(3500);
    await shot(page, '09_wolf_in_view');
    await page.click('.tg-shutter');
    await page.waitForTimeout(1200);
    await shot(page, '10_photograph_toast');
    await page.evaluate(() => { const b = window.__find(0, 1); window.__followId(b[0]); window.__engine.cam.setView({ distance: 40, pitchDeg: 24 }); });
    await page.waitForTimeout(3500);
    await page.click('.tg-shutter');
    await page.waitForTimeout(1000);
    await page.click('.tg-menubtn');
    await page.click('.tg-menurow:has-text("Field guide")');
    await page.waitForTimeout(800);
    await page.click('.tg-guide-tab:has-text("Wolves")');
    await page.waitForTimeout(400);
    await shot(page, '11_field_guide_wolves');
    const g = await page.evaluate(() => JSON.parse(localStorage.getItem('tallgrass.fieldguide.v1') || '{}'));
    console.log('guide saved', JSON.stringify(g));
    check(Object.keys(g.seen ?? {}).some((k) => k.startsWith('wolf:')), 'a wolf behaviour was witnessed from the camera focus');
    check(Object.keys(g.shot ?? {}).length >= 1, 'a photograph was tagged with the behaviours on screen');
    const photos = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('tallgrass', 1);
      r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').getAll(); q.onsuccess = () => res(q.result.map((p) => ({ size: p.blob.size, type: p.blob.type, species: p.species, behaviours: p.behaviours }))); };
      r.onerror = () => res([]);
    }));
    console.log('photos', JSON.stringify(photos));
    check(photos.length === 2 && photos.every((p) => p.size > 20000 && p.type === 'image/jpeg'), 'two JPEG photographs are in IndexedDB');
    check(await page.locator('.tg-guide-thumb').count() >= 1, 'the wolf page shows a thumbnail');
    await page.click('.tg-guide-tab:has-text("Bison")');
    await page.waitForTimeout(400);
    await shot(page, '12_field_guide_bison');
    await page.click('.tg-guide-tab:has-text("Ravens")');
    await page.waitForTimeout(300);
    await shot(page, '13_field_guide_ravens');
    check(errors.length === 0, `field guide: no page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- 3b. no storage: the guide and photographs still work
  {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
      Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
    await page.goto(`${base}/index.html?autocam=0&autoscale=0&notitle=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.click('.tg-shutter');
    const d = await dl;
    check(!!d, 'with no storage a photograph is handed over as a download');
    await page.click('.tg-menubtn');
    await page.click('.tg-menurow:has-text("Settings")');
    await page.click('.tg-seg-btn:has-text("Medium")');
    await page.waitForTimeout(500);
    check(errors.length === 0, `no storage: no page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- 4. share link round trip
  {
    const A = await open('autocam=0&autoscale=0&notitle=1&speed=0&seed=r12-share');
    await A.page.evaluate(() => { window.__speed(0); window.__step(600); });
    await A.page.waitForFunction(() => window.__snap().tick >= 600, null, { timeout: 60000 });
    await A.page.evaluate(() => window.__apply({ kind: 'cull', species: 0, fraction: 0.5 }));
    await A.page.waitForTimeout(300);
    await A.page.evaluate(() => window.__step(600));
    await A.page.waitForFunction(() => window.__snap().tick >= 1200, null, { timeout: 60000 });
    await A.page.waitForTimeout(300);
    await A.page.click('.tg-sharebtn');
    await A.page.waitForTimeout(800);
    await shot(A.page, '14_share_toast');
    const link = await A.page.evaluate(() => window.__shareUrl);
    const clip = await A.page.evaluate(() => navigator.clipboard.readText());
    check(!!link && link === clip && /[?&]w=/.test(link), 'the copied text is the ?w= link');
    check(await A.page.locator('.tg-toast.is-on:has-text("Valley link copied")').count() === 1, 'toast says Valley link copied');
    const popA = await A.page.evaluate(() => ({ tick: window.__snap().tick, pop: window.__snap().pop }));
    console.log('A', JSON.stringify(popA), link.length, 'chars');
    // fresh page from the link, paused, advanced to the same tick
    const bUrl = new URL(link);
    bUrl.searchParams.set('speed', '0');
    bUrl.searchParams.set('autocam', '0');
    bUrl.searchParams.set('autoscale', '0');
    const B = await open(bUrl.search.slice(1));
    await B.page.evaluate(() => { window.__speed(0); window.__step(1200); });
    await B.page.waitForFunction(() => window.__snap().tick >= 1200, null, { timeout: 60000 });
    await B.page.waitForTimeout(300);
    const popB = await B.page.evaluate(() => ({ tick: window.__snap().tick, pop: window.__snap().pop }));
    console.log('B', JSON.stringify(popB));
    check(popB.tick === popA.tick, `same tick (${popA.tick} vs ${popB.tick})`);
    check(JSON.stringify(popA.pop) === JSON.stringify(popB.pop), 'same populations at the same tick: seed, params and the cull were replayed');
    // the link from B re-shares to the same log
    await B.page.click('.tg-sharebtn');
    await B.page.waitForTimeout(800);
    const link2 = await B.page.evaluate(() => window.__shareUrl);
    const w1 = new URL(link).searchParams.get('w'), w2 = new URL(link2).searchParams.get('w');
    check(w1 === w2, 'sharing the replayed valley gives the same code');
    check(A.errors.length === 0 && B.errors.length === 0, `share: no page errors ${A.errors.concat(B.errors).join(' | ')}`);
    await shot(B.page, '15_share_loaded');
    // a code that cannot be read starts the usual valley and says so
    const C = await open('autocam=0&autoscale=0&w=not-a-valley');
    await C.page.waitForTimeout(1200);
    check(await C.page.locator('.tg-toast.is-on:has-text("could not be read")').count() === 1, 'a bad code shows "could not be read" and the game still starts');
    await shot(C.page, '16_bad_code');
    await A.ctx.close(); await B.ctx.close(); await C.ctx.close();
  }

  // ---- 5. a small window: the title card and the pages still fit
  {
    const { ctx, page, errors } = await open('title=1&autoscale=0', { viewport: { width: 820, height: 620 } });
    await page.waitForTimeout(2000);
    await shot(page, '17_narrow_title');
    await page.click('.tg-title-btn:has-text("Field guide")');
    await page.waitForTimeout(700);
    const box = await page.locator('.tg-guide').boundingBox();
    check(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 820 && box.y + box.height <= 620, `the field guide fits an 820x620 window (${JSON.stringify(box)})`);
    await shot(page, '18_narrow_guide');
    await page.keyboard.press('Escape');
    await page.click('.tg-menubtn');
    await page.click('.tg-menurow:has-text("New valley")');
    await page.waitForTimeout(600);
    const box2 = await page.locator('.tg-setup').boundingBox();
    check(box2 && box2.x >= 0 && box2.y >= 0 && box2.x + box2.width <= 820 && box2.y + box2.height <= 620, 'new valley fits an 820x620 window');
    await shot(page, '19_narrow_setup');
    check(errors.length === 0, `narrow: no page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
} catch (e) {
  console.error('play_ui_check failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
if (problems.length) { console.log(`\n${problems.length} check(s) failed`); code = 1; } else console.log('\nall checks passed');
process.exit(code);
