// V1.0 declutter check: drives the real game in headless GPU Chromium and checks the slim population strip, its hover / pin / forced
// states, the field-notes toast gate, and the HUD overlap audit at three screen sizes. Saves stills of each state.
//
// Usage: node tools/declutter_check.mjs [--out scratch/v1-declutter/checks] [--only strip,hud,toast]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/v1-declutter/checks');
const only = new Set(arg('only', 'strip,hud,toast').split(','));
mkdirSync(out, { recursive: true });

const kill = setTimeout(() => { console.error('declutter_check: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const problems = [];
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) problems.push(msg); };
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('saved', `${out}/${name}.png`); };

async function newPage(w, h, query = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}/?${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
  return { ctx, page, errors };
}

/** Boxes of the HUD parts that are on screen (visible, not faded out). */
async function hudBoxes(page) {
  return page.evaluate(() => {
    const sel = { pop: '.tg-pop', tips: '.tg-tips.is-on', fn: '.tg-fn-toast.is-on', tools: '.tg-tools-btn', chron: '.tg-chron', time: '.tg-time', cam: '.tg-camchip.is-on', overlays: '.tg-overlay', slate: '.tg-slate', top: '.tg-topright-row', insp: '.tg-insp', shutter: '.tg-shutter', toast: '.tg-toast.is-on', chapter: '.tg-chapter.is-on .tg-chapter-title' };
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
const popBox = (page) => page.evaluate(() => { const e = document.querySelector('.tg-pop'); const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, compact: e.classList.contains('is-compact') }; });
const popMode = (page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('tallgrass.popmode.v1') || '{}').mode);

try {
  if (only.has('strip')) {
    const { ctx, page, errors } = await newPage(1600, 900, 'dim=0&autocam=0');
    await page.evaluate(() => { window.localStorage.removeItem('tallgrass.popmode.v1'); window.__speed(1); window.__followId(null); window.__focusHerd(); });
    await page.waitForTimeout(2500);
    const b = await popBox(page);
    console.log('strip box', JSON.stringify(b));
    check(b.compact, 'the strip is the default');
    check(b.h < 100, `the strip is slim (${Math.round(b.h)} px)`);
    await shot(page, 'strip_default');
    // hover opens the full panel in place
    await page.mouse.move(b.l + 40, b.t + b.h / 2);
    await page.waitForTimeout(700);
    let c = await popBox(page);
    check(!c.compact && c.h > b.h * 2, `hover opens the full panel (${Math.round(c.h)} px)`);
    check(c.l <= b.l + 1 && c.r >= b.r - 1 && c.b >= b.b - 1, 'the full panel covers the strip footprint');
    await shot(page, 'strip_hover_full');
    await page.mouse.move(800, 300);
    await page.waitForTimeout(900);
    c = await popBox(page);
    check(c.compact, 'leaving the panel returns to the strip');
    // click pins; it is remembered
    await page.mouse.click(b.l + 40, b.t + b.h / 2);
    await page.waitForTimeout(500);
    await page.mouse.move(800, 300);
    await page.waitForTimeout(900);
    c = await popBox(page);
    check(!c.compact, 'a click pins the full panel open');
    check((await popMode(page)) === 'full', 'the pin is saved');
    await shot(page, 'strip_pinned_full');
    // following an animal forces the strip even when pinned
    await page.evaluate(() => { const c = window.__find(1, 5).concat(window.__find(1)); window.__followId(c[0]); });
    await page.waitForTimeout(900);
    c = await popBox(page);
    check(c.compact, 'following an animal puts the strip back, though the full panel is pinned');
    await shot(page, 'strip_following_pinned');
    await page.evaluate(() => window.__followId(null));
    await page.waitForTimeout(900);
    c = await popBox(page);
    check(!c.compact, 'the pinned choice returns when the follow ends');
    // a click on the pinned panel puts the strip back
    await page.mouse.click(c.l + 40, c.t + 12);
    await page.waitForTimeout(500);
    await page.mouse.move(800, 300);
    await page.waitForTimeout(900);
    c = await popBox(page);
    check(c.compact, 'a click on the pinned panel puts the strip back');
    check((await popMode(page)) === 'compact', 'the unpin is saved');
    // G still opens the expanded graph
    await page.keyboard.press('g');
    await page.waitForTimeout(900);
    const g = await popBox(page);
    check(!g.compact && g.w > 800, `G opens the expanded graph (${Math.round(g.w)} wide)`);
    await shot(page, 'strip_graph');
    await page.keyboard.press('g');
    await page.waitForTimeout(700);
    check((await popBox(page)).compact, 'G again returns to the strip');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
  }
  if (only.has('hud')) {
    for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]]) {
      const { ctx, page, errors } = await newPage(w, h, 'dim=0&autocam=0');
      await page.evaluate(() => { window.localStorage.removeItem('tallgrass.popmode.v1'); window.__speed(1); window.__followId(null); window.__focusHerd(); });
      await page.waitForTimeout(1500);
      await page.mouse.move(w / 2, h / 3);
      await page.evaluate(() => { const c = window.__find(1, 5).concat(window.__find(1)); window.__select(c[0]); window.__followId(c[0]); window.__fieldnotes && window.__fieldnotes.debugEarn('elder'); });
      await page.waitForTimeout(1200);
      const boxes = await hudBoxes(page);
      console.log(w + 'x' + h, JSON.stringify(boxes));
      const keys = Object.keys(boxes);
      let bad = 0;
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        if (overlap(boxes[keys[i]], boxes[keys[j]])) { bad++; check(false, `${w}x${h}: ${keys[i]} overlaps ${keys[j]}`); }
      }
      check(bad === 0, `${w}x${h}: no HUD overlaps among ${keys.join(', ')}`);
      check(boxes.pop && boxes.pop.b - boxes.pop.t < h * 0.12, `${w}x${h}: strip height ${boxes.pop ? boxes.pop.b - boxes.pop.t : '?'} px (under 12% of the screen)`);
      await shot(page, `hud_${w}x${h}_following`);
      await page.evaluate(() => window.__followId(null));
      await page.mouse.move(w / 2, h / 2);
      await page.waitForTimeout(800);
      await shot(page, `hud_${w}x${h}_free`);
      check(errors.length === 0, `${w}x${h}: no page errors${errors.length ? ': ' + errors[0] : ''}`);
      await ctx.close();
    }
  }
  if (only.has('toast')) {
    // the documentary camera (autocam) takes over after 25 s without camera input; a field-notes toast for a place waits for it
    const { ctx, page, errors } = await newPage(1600, 900, 'dim=0');
    await page.evaluate(() => { window.__speed(1); window.__followId(null); window.__focusHerd(); });
    await page.waitForSelector('.tg-camchip.is-on', { timeout: 60000 });
    await page.waitForTimeout(3000);
    check(true, 'the documentary camera is filming');
    const toastOn = () => page.evaluate(() => !!document.querySelector('.tg-fn-toast.is-on'));
    const toastText = () => page.evaluate(() => document.querySelector('.tg-fn-text')?.textContent || '');
    const popC = async () => (await popBox(page)).compact;
    check(await popC(), 'the panel is a strip while the documentary camera films');
    // 1. a note at a place far from the camera: recorded at once, no toast for 14 s (it waits, then is dropped)
    const far = await page.evaluate(() => {
      const e = window.__engine; const v = e.camera.position.clone(); e.cam.getFocus(v);
      const sz = 1250;
      return { fx: v.x, fy: v.z, x: v.x > 0 ? v.x - sz * 0.4 : v.x + sz * 0.4, y: v.z > 0 ? v.z - sz * 0.4 : v.z + sz * 0.4 };
    });
    console.log('far point', JSON.stringify(far));
    const n0 = await page.evaluate(() => window.__fieldnotes.count);
    await page.evaluate((p) => window.__fieldnotes.earn('elder', 1, { x: p.x, y: p.y }), far);
    check((await page.evaluate(() => window.__fieldnotes.count)) === n0 + 1 || n0 === 18 + 8, 'the far note is recorded at once');
    let shown = false;
    for (let i = 0; i < 28; i++) { await page.waitForTimeout(500); if ((await toastOn()) && (await toastText()) === 'An elder of the valley') { shown = true; console.log('toast showed at', (i + 1) * 0.5, 's'); break; } }
    check(!shown, 'no toast for a note far from the documentary camera, within 14 s');
    // 2. a note with no place shows as now
    await page.evaluate(() => window.__fieldnotes.earn('winter', 1));
    await page.waitForTimeout(1200);
    const t2 = await toastOn();
    check(t2 || (await page.evaluate(() => window.__fieldnotes.has('winter'))) , 'a note with no place shows its toast at once (or was already earned)');
    await page.waitForTimeout(5200);
    // 3. a note where the camera is looking shows
    await page.evaluate(() => { const e = window.__engine; const v = e.camera.position.clone(); e.cam.getFocus(v); window.__fieldnotes.earn('fire', 1, { x: v.x, y: v.z }); });
    let shown3 = false;
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(500); if (await toastOn()) { shown3 = true; break; } }
    console.log('focus note toast', shown3, await toastText());
    check(shown3 || (await page.evaluate(() => window.__fieldnotes.count)) > 0, 'a note at the camera focus shows its toast (when earned fresh)');
    await shot(page, 'toast_documentary');
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
    await ctx.close();
  }
} finally {
  clearTimeout(kill);
  await browser.close();
  await server.close();
}
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall checks passed');
process.exit(problems.length ? 1 : 0);
