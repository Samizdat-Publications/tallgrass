// Checks and stills for the god tools v2 buttons (lightning, blizzard, flood, distemper, grove) and the left rail layout.
//   node tools/r_tools_v2.mjs [--out review/wip/tools-v2] [--mode layout|tools|stills|all]   (all = layout + tools)
// layout: every rail button must be on screen and clear of the other panels, at 1280x720, 1920x1080 and 800x600, with and
// without a challenge card, and the 4-row population panel must show its last row. tools: click each new tool through the UI
// (positional ones are armed, then the ground is clicked) and check the chronicle event it should produce.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/tools-v2'));
const mode = arg('mode', 'all');
const kill = setTimeout(() => { console.error('r_tools_v2: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/.vitecache-tv2'),
  server: { port: 6200 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
const problems = [];
mkdirSync(out, { recursive: true });

async function open(w, h, query) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => errors.push(`[exception ${w}x${h}] ` + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error ${w}x${h}] ` + m.text().slice(0, 400)); });
  await page.goto(`${base}/index.html?autocam=0&grass=0&q=medium${query}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(2500);
  return page;
}

/** Rects of every tool button and the panels they must stay clear of. */
async function measure(page) {
  return page.evaluate(() => {
    const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const btns = [...document.querySelectorAll('.tg-tool')].map((el) => ({ id: el.dataset.tool, ...R(el), vis: getComputedStyle(el).visibility !== 'hidden' }));
    const panels = {};
    for (const sel of ['.tg-pop', '.tg-goal', '.tg-chron', '.tg-topright-row', '.tg-insp', '.tg-slate']) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden') panels[sel] = R(el);
    }
    return { btns, panels, vw: innerWidth, vh: innerHeight, pop: document.querySelector('.tg-pop')?.getAttribute('data-rows') };
  });
}

function check(tag, m) {
  const bad = [];
  for (const b of m.btns) {
    if (b.x < 0 || b.y < 0 || b.r > m.vw || b.b > m.vh || b.w < 4 || b.h < 4) bad.push(`${b.id} off screen`);
    for (const [name, p] of Object.entries(m.panels)) {
      const ox = Math.min(b.r, p.r) - Math.max(b.x, p.x), oy = Math.min(b.b, p.b) - Math.max(b.y, p.y);
      if (ox > 1 && oy > 1) bad.push(`${b.id} overlaps ${name}`);
    }
  }
  for (let i = 0; i < m.btns.length; i++) for (let j = i + 1; j < m.btns.length; j++) {
    const a = m.btns[i], b = m.btns[j];
    if (Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1) bad.push(`${a.id} overlaps ${b.id}`);
  }
  const lowest = Math.max(...m.btns.map((b) => b.b));
  const cols = new Set(m.btns.map((b) => Math.round(b.x))).size;
  console.log(`${tag}: ${m.btns.length} buttons, ${cols} column(s), lowest ${Math.round(lowest)} of ${m.vh}, pop rows ${m.pop}, ${bad.length ? 'PROBLEMS ' + bad.join('; ') : 'ok'}`);
  if (bad.length) problems.push(`${tag}: ${bad.join('; ')}`);
}

async function layout() {
  const cases = [
    ['rail-1280x720-town', 1280, 720, '&challenge=town', true],
    ['rail-1920x1080', 1920, 1080, '', true],
    ['rail-1280x720', 1280, 720, '', false],
    ['rail-1920x1080-town', 1920, 1080, '&challenge=town', false],
    ['rail-800x600', 800, 600, '', true],
    ['rail-800x600-town', 800, 600, '&challenge=town', true],
    ['rail-1366x768-town', 1366, 768, '&challenge=town', false],
  ];
  for (const [name, w, h, q, shot] of cases) {
    const page = await open(w, h, q);
    check(name, await measure(page));
    // hover a button to make sure its label slide-out does not matter for the rail itself; screenshot during the intro
    if (shot) await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 88 });
    await page.close();
  }
  // four population rows
  const p = '&p=muledeer.initial:60,cougar.initial:6,raptors:1';
  for (const [name, w, h] of [['pop-4rows-1280x720', 1280, 720], ['pop-4rows-1920x1080', 1920, 1080]]) {
    const page = await open(w, h, p);
    await page.evaluate(() => window.__speed(10));
    await page.waitForTimeout(6000);
    const m = await measure(page);
    const rows = await page.evaluate(() => {
      const pop = document.querySelector('.tg-pop');
      const pr = pop.getBoundingClientRect();
      const kids = [...pop.querySelectorAll('canvas, svg, .tg-cell, .tg-chip')].map((el) => { const r = el.getBoundingClientRect(); return { cls: el.className?.baseVal ?? el.className, b: r.bottom, t: r.top }; });
      return { popBottom: pr.bottom, popTop: pr.top, maxChildBottom: Math.max(...kids.map((k) => k.b)), n: kids.length, scrollH: pop.scrollHeight, clientH: pop.clientHeight };
    });
    console.log(name, 'rows', m.pop, JSON.stringify(rows));
    check(name, m);
    await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 88 });
    await page.close();
  }
}

async function tools() {
  const page = await open(1600, 900, '&seed=7');
  await page.evaluate(() => {
    window.__speed(10);
    // collect the sim events the UI is handed, so each tool's chronicle event can be named exactly
    window.__evlog = [];
    const ui = window.__ui, orig = ui.update.bind(ui);
    ui.update = (f) => { for (const e of f.events ?? []) window.__evlog.push(`${e.kind}(sp ${e.sp}, a ${Math.round(e.a)}, b ${Math.round(e.b * 100) / 100})`); orig(f); };
  });
  const chron = () => page.evaluate(() => window.__evlog.slice());
  const tick = () => page.evaluate(() => window.__snap()?.tick ?? 0);
  async function groundPoint(fx, fy) {
    return { x: Math.round(1600 * fx), y: Math.round(900 * fy) };
  }
  const click = async (id) => page.click(`.tg-tool[data-tool="${id}"]`);
  const results = [];
  // pick a clean view: a mid-distance top-ish view so the ground is under the pointer
  await page.evaluate(() => { window.__cam('wide'); });
  await page.waitForTimeout(1500);
  const before = await chron();
  for (const [id, positional, wantEvent] of [
    ['blizzard', false, 'blizzard'], ['flood', false, 'flood'], ['distemper', false, 'distemper'],
    ['lightning', true, 'lightning'], ['grove', true, 'grove'],
  ]) {
    const t0 = await tick();
    const seen = (await chron()).length;
    await click(id);
    let armed = null;
    if (positional) {
      armed = await page.evaluate((i) => document.querySelector(`.tg-tool[data-tool="${i}"]`).getAttribute('aria-pressed'), id);
      const pt = await groundPoint(0.62, 0.72);
      await page.mouse.click(pt.x, pt.y);
      const still = await page.evaluate((i) => document.querySelector(`.tg-tool[data-tool="${i}"]`).getAttribute('aria-pressed'), id);
      results.push(`${id}: armed pressed=${armed}, after ground click pressed=${still}`);
    }
    await page.waitForTimeout(4500);
    const lines = await chron();
    results.push(`${id}: ticks ${t0} -> ${await tick()}; events since the click: ${JSON.stringify(lines.slice(seen))}`);
  }
  console.log(results.join('\n'));
  await page.close();
}

/** Stills of a flood and a lightning strike, both started from the rail buttons with the interface showing. */
async function stills() {
  for (const which of ['flood', 'lightning']) await stills1(which);
}

async function stills1(which) {
  const page = await open(1600, 900, '&seed=7');
  const spots = await page.evaluate(() => {
    window.__speed(0);
    const w = window.__engine.world, S = w.size, n = w.n, tr = w.trees;
    let best = null, bs = -1e9;
    for (let j = 8; j < n - 8; j += 2) for (let i = 8; i < n - 8; i += 2) {
      const c = j * n + i, x = (i + 0.5) * w.cell, y = (j + 0.5) * w.cell;
      const wd = w.waterDist[c];
      if (wd < 38 || wd > 55 || w.slope[c] > 0.05 || x < 90 || y < 90 || x > S - 90 || y > S - 90) continue;
      let near = 1e9;
      for (let t = 0; t < tr.length; t += 4) near = Math.min(near, Math.hypot(tr[t] - x, tr[t + 1] - y));
      if (near < 30) continue;
      const sc = -Math.abs(Math.hypot(x - S / 2, y - S / 2) - 70) + near * 0.1;
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    const cr = w.creek;
    let fb = null, fs = -1e9;
    for (let k = 12; k < cr.length / 2 - 12; k += 3) {
      const x = cr[2 * k], y = cr[2 * k + 1];
      if (x < 100 || y < 100 || x > S - 100 || y > S - 100) continue;
      let cnt = 0;
      for (let t = 0; t < tr.length; t += 4) if (Math.hypot(tr[t] - x, tr[t + 1] - y) < 45) cnt++;
      if (-cnt > fs) { fs = -cnt; fb = [x, y, cr[2 * (k + 6)] - cr[2 * (k - 6)], cr[2 * (k + 6) + 1] - cr[2 * (k - 6) + 1]]; }
    }
    return { grove: best, flood: fb };
  });
  const view = (o) => page.evaluate((o) => { const e = window.__engine; e.cam.follow(null); e.cam.setView(o, true); for (let i = 0; i < 6; i++) e.renderOnce(0.016); }, o);
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 90 }); console.log('saved', name); };
  await page.evaluate(() => { window.__ui.setCinematic?.(false); });
  if (which === 'flood') {
  // flood: the button, then a view across the creek
  const [fx, fy, fdx, fdy] = spots.flood;
  await view({ x: fx, y: fy, yawDeg: (Math.atan2(fdx, fdy) * 180) / Math.PI + 90, pitchDeg: 22, distance: 120 });
  await click('flood');
  await page.evaluate(() => window.__step(40));
  await page.evaluate(async () => { const e = window.__engine; for (let i = 0; i < 90; i++) e.renderOnce(0.1); });
  await page.mouse.move(800, 380);
  await page.waitForTimeout(1500);
  await shot('flood-from-button');
  }
  if (which === 'lightning') {
  // lightning: arm from the rail, click the ground at the middle of a clear spot
  const [gx, gy] = spots.grove ?? [256, 256];
  await view({ x: gx, y: gy, yawDeg: 25, pitchDeg: 24, distance: 90 });
  await click('lightning');
  await page.waitForTimeout(300);
  await shot('lightning-armed');
  await page.mouse.click(800, 450);
  await page.evaluate(() => window.__step(3));
  await page.waitForTimeout(350);
  await shot('lightning-from-button');
  }
  await page.close();

  async function click(id) { await page.click(`.tg-tool[data-tool="${id}"]`); }
}

try {
  if (mode === 'stills') await stills();
  if (mode === 'layout' || mode === 'all') await layout();
  if (mode === 'tools' || mode === 'all') await tools();
} catch (e) {
  console.error('FAILED', e);
  errors.push('script: ' + String(e));
}
console.log('layout problems:', problems.length ? problems : 'none');
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
clearTimeout(kill);
process.exit(errors.length || problems.length ? 1 : 0);
