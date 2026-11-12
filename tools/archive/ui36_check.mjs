// Round 36 UI checks: drives the real game in headless GPU Chromium and checks the map legend, the icon tips, the Overlays button when idle,
// the territory overlay near the camera, and the graph's Pair view (and the chronicle under it). Saves a still of each state.
//
// Usage: node tools/ui36_check.mjs [--out scratch/v1-ui36] [--sizes 1366x768,1920x1080] [--only legend,tips,idle,terr,pair]
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/v1-ui36');
const sizes = arg('sizes', '1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
const only = new Set(arg('only', 'legend,tips,idle,terr,pair,chron').split(','));
mkdirSync(out, { recursive: true });

const kill = setTimeout(() => { console.error('ui36_check: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/v1-ui36/.vitecache'), server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const problems = [];
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) problems.push(msg); };

async function newPage(w, h, query = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(`${base}/index.html?${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.evaluate(() => {
    window.__stepWait = async (n) => {
      const prev = window.__snap();
      window.__step(n);
      for (let i = 0; i < 600 && window.__snap() === prev; i++) await new Promise((r) => setTimeout(r, 15));
      return window.__snap();
    };
  });
  return { ctx, page, errors };
}
const shot = async (page, w, name) => { const f = `${out}/${w}_${name}.png`; await page.screenshot({ path: f }); console.log('saved', f); };

/** Boxes of the HUD parts that are on screen (visible, not faded out). */
async function hudBoxes(page) {
  return page.evaluate(() => {
    const sel = { pop: '.tg-pop', tools: '.tg-tools-btn', chron: '.tg-chron', time: '.tg-time', cam: '.tg-camchip.is-on', overlays: '.tg-overlay', slate: '.tg-slate', top: '.tg-topright-row', insp: '.tg-insp', shutter: '.tg-shutter', toast: '.tg-toast.is-on', fn: '.tg-fn-toast.is-on', glegend: '.tg-glegend', maplegend: '.tg-map-legend' };
    const boxes = {};
    for (const [k, s] of Object.entries(sel)) {
      const el = document.querySelector(s);
      if (!el) continue;
      let hidden = false;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || (n !== el && parseFloat(cs.opacity) < 0.05) || (n === el && parseFloat(cs.opacity) < 0.05)) { hidden = true; break; }
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
const noOverlaps = (tag, boxes, only) => {
  const keys = Object.keys(boxes);
  let bad = 0;
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    if (only && keys[i] !== only && keys[j] !== only) continue;
    if (overlap(boxes[keys[i]], boxes[keys[j]])) { bad++; check(false, `${tag}: ${keys[i]} overlaps ${keys[j]} ${JSON.stringify([boxes[keys[i]], boxes[keys[j]]])}`); }
  }
  check(bad === 0, `${tag}: no overlaps among ${keys.join(', ')}`);
};

try {
  for (const [w, h] of sizes) {
    console.log(`\n=== ${w}x${h} ===`);
    // ---- 1. the map legend -------------------------------------------------------------------------------------------------------
    if (only.has('legend')) {
      const { ctx, page, errors } = await newPage(w, h, 'dim=0&autocam=0');
      await page.evaluate(() => { window.__speed(1); window.__followId?.(null); });
      // a few years in, so the species are all about
      for (let k = 0; k < 12; k++) await page.evaluate(() => window.__stepWait(400));
      await page.evaluate(() => { window.__speed(1); window.__cam('wide'); });
      await page.mouse.move(w / 2, h / 2);
      await page.waitForTimeout(2500);
      const low = await page.evaluate(() => ({ fade: window.__animals.glyphFade, hidden: document.querySelector('.tg-glegend').hidden }));
      check(low.fade < 0.02 && low.hidden, `low camera: no glyphs (fade ${low.fade.toFixed(2)}) and the legend is hidden`);
      await shot(page, w, 'legend_0_low');
      await page.evaluate(() => window.__cam('top'));
      await page.waitForTimeout(3500);
      const top = await page.evaluate(() => {
        const el = document.querySelector('.tg-glegend');
        return { fade: window.__animals.glyphFade, hidden: el.hidden, op: parseFloat(getComputedStyle(el).opacity), rows: [...el.querySelectorAll('.tg-gl-row')].map((r) => ({ name: r.textContent, color: getComputedStyle(r.querySelector('.tg-gl-chip')).backgroundColor })) };
      });
      console.log('legend', JSON.stringify(top));
      check(top.fade > 0.95 && !top.hidden && top.op > 0.9, `map view: glyphs at ${top.fade.toFixed(2)}, legend shown at opacity ${top.op.toFixed(2)}`);
      check(top.rows.length >= 4, `the legend lists the species present (${top.rows.length}: ${top.rows.map((r) => r.name).join(', ')})`);
      check(new Set(top.rows.map((r) => r.color)).size === top.rows.length, 'every legend chip has its own colour');
      const boxes = await hudBoxes(page);
      console.log(JSON.stringify(boxes));
      check(!!boxes.glegend, 'the legend is on screen');
      noOverlaps(`${w}x${h} map`, boxes);
      await shot(page, w, 'legend_1_map');
      // halfway: the legend fades with the glyphs
      await page.evaluate(() => window.__cam('wide'));
      await page.waitForTimeout(300);
      // an overlay on top of the map view
      await page.evaluate(() => { window.__cam('top'); window.__overlay.setMode('territory'); });
      await page.waitForTimeout(3500);
      const b2 = await hudBoxes(page);
      noOverlaps(`${w}x${h} map + territory overlay`, b2);
      await shot(page, w, 'legend_2_map_territory');
      await page.evaluate(() => window.__overlay.setMode('none'));
      // the graph open: the legend steps aside
      await page.keyboard.press('g');
      await page.waitForTimeout(1500);
      const b3 = await hudBoxes(page);
      check(!b3.glegend, 'with the graph open the legend steps aside');
      noOverlaps(`${w}x${h} map + graph`, b3);
      await page.keyboard.press('g');
      check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
      await ctx.close();
    }
    // ---- 2. tips on the icon buttons ------------------------------------------------------------------------------------------
    if (only.has('tips')) {
      const { ctx, page, errors } = await newPage(w, h, 'dim=0&autocam=0');
      await page.mouse.move(w / 2, h / 2);
      await page.waitForTimeout(800);
      const sels = ['.tg-sharebtn', '.tg-ambientbtn:not(.tg-sharebtn)', '.tg-menubtn', '.tg-seed', '.tg-shutter'];
      for (const s of sels) {
        const info = await page.evaluate((s) => { const e = document.querySelector(s); return { tip: e.getAttribute('data-tip'), label: e.getAttribute('aria-label'), text: (e.textContent || '').trim() }; }, s);
        check(!!info.tip && (!!info.label || info.text.length > 0), `${s}: tip "${info.tip}", aria-label "${info.label ?? '(its own text)'}"`);
        await page.hover(s);
        await page.waitForTimeout(700);
        const shown = await page.evaluate((s) => { const cs = getComputedStyle(document.querySelector(s), '::after'); const r = document.querySelector(s).getBoundingClientRect(); return { op: parseFloat(cs.opacity), vis: cs.visibility, content: cs.content, w: cs.width, r: Math.round(r.right), l: Math.round(r.left) }; }, s);
        check(shown.op > 0.95 && shown.vis === 'visible', `${s}: the tip shows on hover (${shown.content})`);
        const tw = parseFloat(shown.w);
        check(shown.r - tw >= 0 || s === '.tg-shutter', `${s}: the tip is on screen (right edge ${shown.r}, tip ${Math.round(tw)} wide)`);
        if (s.startsWith('.tg-ambientbtn') || s === '.tg-shutter') await shot(page, w, `tip_${s.slice(4, 14)}`);
        await page.mouse.move(w / 2, h / 2);
        await page.waitForTimeout(250);
      }
      check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
      await ctx.close();
    }
    // ---- 3. the Overlays button when idle ---------------------------------------------------------------------------------------
    if (only.has('idle')) {
      const { ctx, page, errors } = await newPage(w, h, 'autocam=0');
      await page.mouse.move(w / 2, h / 2);
      await page.waitForTimeout(1000);
      const awake = await page.evaluate(() => ({ ov: +getComputedStyle(document.querySelector('.tg-ov-btn')).opacity, time: +getComputedStyle(document.querySelector('.tg-time')).opacity }));
      await shot(page, w, 'idle_0_awake');
      await page.waitForFunction(() => document.querySelector('.tg-ui').classList.contains('is-idle'), null, { timeout: 40000 });
      await page.waitForTimeout(2500);
      const idle = await page.evaluate(() => {
        const o = (s) => +getComputedStyle(document.querySelector(s)).opacity;
        return { ov: o('.tg-ov-btn'), ovKid: o('.tg-ov-btn > .tg-ov-label'), time: o('.tg-time'), timeKid: o('.tg-time > *') };
      });
      console.log('idle', JSON.stringify(idle), 'awake', JSON.stringify(awake));
      check(idle.ov >= 0.75 && Math.abs(idle.ov - idle.time) < 0.06 && Math.abs(idle.ovKid - idle.timeKid) < 0.06, `idle: Overlays ${idle.ov.toFixed(2)}/${idle.ovKid.toFixed(2)} matches the time bar ${idle.time.toFixed(2)}/${idle.timeKid.toFixed(2)}`);
      await shot(page, w, 'idle_1_idle');
      check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
      await ctx.close();
    }
    // ---- 4. the territory overlay near the camera -------------------------------------------------------------------------------
    if (only.has('terr')) {
      const { ctx, page, errors } = await newPage(w, h, 'dim=0&autocam=0');
      await page.evaluate(() => window.__speed(0));
      for (let k = 0; k < 18; k++) await page.evaluate(() => window.__stepWait(400));
      // on to a summer morning, so the ground is green and the animals are about
      for (let k = 0; k < 120; k++) {
        const s = await page.evaluate(async () => (await window.__stepWait(150)).env.season);
        if (s > 1.3 && s < 1.9) break;
      }
      await page.evaluate(() => window.__timeOfDay(0.42));
      await page.waitForTimeout(2500);
      const info = await page.evaluate(() => { const s = window.__snap(); return { packs: Array.from(s.packs), tick: s.tick }; });
      console.log('packs', JSON.stringify(info.packs));
      check(info.packs.length >= 4, `a pack holds a range (${info.packs.length / 4} packs)`);
      const den = info.packs.slice(0, 3);
      await page.evaluate(({ den }) => {
        window.__overlay.setMode('territory');
        // a ground-level view inside the range, looking across it: the foreground is the range's own ground
        window.__engine.cam.setView({ x: den[0] - 40, y: den[1] - 40, distance: 70, pitchDeg: 22, yawDeg: 40 }, true);
      }, { den });
      await page.waitForTimeout(4000);
      await page.mouse.move(w / 2, h / 2);
      await shot(page, w, 'terr_0_near');
      await page.evaluate(({ den }) => { window.__engine.cam.setView({ x: den[0], y: den[1], distance: 160, pitchDeg: 32, yawDeg: 20 }, true); }, { den });
      await page.waitForTimeout(3000);
      await shot(page, w, 'terr_1_mid');
      await page.evaluate(() => window.__cam('top'));
      await page.waitForTimeout(3000);
      await shot(page, w, 'terr_2_map');
      check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
      await ctx.close();
    }
    // ---- 5. the graph's Pair view, and the chronicle under it -------------------------------------------------------------------
    if (only.has('pair')) {
      const { ctx, page, errors } = await newPage(w, h, 'dim=0&autocam=0');
      await page.evaluate(() => window.__speed(0));
      for (let k = 0; k < 40; k++) await page.evaluate(() => window.__stepWait(400));
      await page.evaluate(() => { window.__speed(10); });
      await page.mouse.move(w / 2, h / 3);
      await page.waitForTimeout(2500);
      await page.keyboard.press('g');
      await page.waitForTimeout(1200);
      await shot(page, w, 'pair_0_pop_view');
      await page.click('.tg-tab:has-text("Pair")');
      await page.waitForTimeout(1500);
      const state = await page.evaluate(() => ({ view: document.querySelector('.tg-pop').dataset.view, a: document.querySelectorAll('.tg-pair-sel')[0].selectedOptions[0].textContent, b: document.querySelectorAll('.tg-pair-sel')[1].selectedOptions[0].textContent, pickVisible: getComputedStyle(document.querySelector('.tg-pair-pick')).display, h: Math.round(document.querySelector('.tg-pop').getBoundingClientRect().height) }));
      console.log('pair', JSON.stringify(state));
      check(state.view === 'pair' && state.a === 'Bison' && state.b === 'Wolf', `the Pair view opens on ${state.a} and ${state.b}`);
      check(state.pickVisible !== 'none', 'the two pickers are showing');
      await shot(page, w, 'pair_1_default');
      const box = await page.evaluate(() => { const r = document.querySelector('.tg-chart').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
      await page.mouse.move(box.l + box.w * 0.62, box.t + box.h * 0.5);
      await page.waitForTimeout(500);
      const tip = await page.evaluate(() => ({ on: document.querySelector('.tg-tip').classList.contains('is-on'), text: document.querySelector('.tg-tip').innerText.replace(/\n/g, ' | ') }));
      check(tip.on && /Bison/.test(tip.text) && /Wolf/.test(tip.text), `hover reads both species (${tip.text})`);
      await shot(page, w, 'pair_2_hover');
      // pick two others
      await page.selectOption('.tg-pair-sel >> nth=0', { label: 'Pronghorn' });
      await page.selectOption('.tg-pair-sel >> nth=1', { label: 'Cougar' });
      await page.waitForTimeout(1200);
      const s2 = await page.evaluate(() => [...document.querySelectorAll('.tg-pair-sel')].map((s) => s.selectedOptions[0].textContent));
      check(s2[0] === 'Pronghorn' && s2[1] === 'Cougar', `the pickers take another pair (${s2.join(', ')})`);
      await page.mouse.move(w / 2, h / 4);
      await page.waitForTimeout(500);
      await shot(page, w, 'pair_3_pronghorn_cougar');
      // picking the other axis's species swaps the two
      await page.selectOption('.tg-pair-sel >> nth=0', { label: 'Cougar' });
      const s3 = await page.evaluate(() => [...document.querySelectorAll('.tg-pair-sel')].map((s) => s.selectedOptions[0].textContent));
      check(s3[0] === 'Cougar' && s3[1] === 'Pronghorn', `picking the other axis's species swaps them (${s3.join(', ')})`);
      // the other views still work
      await page.click('.tg-tab:has-text("Evolution")');
      await page.waitForTimeout(1200);
      check(await page.evaluate(() => document.querySelector('.tg-pop').dataset.view) === 'evo', 'Evolution still opens');
      await page.click('.tg-tab:has-text("Population")');
      await page.waitForTimeout(800);
      await shot(page, w, 'pair_4_back_to_pop');
      // the chronicle under the open graph at a time-lapse pace
      await page.evaluate(() => window.__speed(100));
      await page.mouse.move(w / 2, h / 3);
      await page.waitForTimeout(6000);
      await shot(page, w, 'pair_5_chronicle_fast');
      const gap = await page.evaluate(() => {
        const list = document.querySelector('.tg-chron-list');
        const lr = list.getBoundingClientRect();
        const ents = [...list.querySelectorAll('.tg-ent')].map((e) => ({ t: Math.round(e.getBoundingClientRect().top - lr.top), op: +getComputedStyle(e).opacity }));
        const head = list.querySelector('.tg-year-head');
        const hb = head ? Math.round(head.getBoundingClientRect().bottom - lr.top) : -1;
        const first = ents[0];
        return { listH: Math.round(lr.height), head: hb, firstEnt: first ? first.t : -1, firstOp: first ? first.op : -1, mask: list.style.maskImage || list.style.webkitMaskImage };
      });
      console.log('chronicle', JSON.stringify(gap));
      check(gap.firstEnt < 0 || gap.firstEnt - gap.head < 12, `no empty gap under the year header (header ends ${gap.head}, first entry starts ${gap.firstEnt}, opacity ${gap.firstOp})`);
      await page.evaluate(() => window.__speed(1));
      check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
      await ctx.close();
    }
    // ---- 6. the chronicle under the open graph while time runs fast: no blank gap under a year header, no entry cut off at the foot ------------
    if (only.has('chron')) {
      const { ctx, page, errors } = await newPage(w, h, 'dim=0&autocam=0');
      await page.evaluate(() => window.__speed(0));
      for (let k = 0; k < 24; k++) await page.evaluate(() => window.__stepWait(400));
      await page.mouse.move(w / 2, h / 3);
      await page.keyboard.press('g');
      await page.evaluate(() => window.__speed(100));
      let worstGap = -1, minOp = 1, cut = 0, samples = 0, shots = 0;
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(350);
        const m = await page.evaluate(() => {
          const list = document.querySelector('.tg-chron-list');
          if (!list || list.clientHeight === 0) return null;
          const lr = list.getBoundingClientRect();
          const ents = [...list.querySelectorAll('.tg-ent')];
          const head = list.querySelector('.tg-year-head');
          const first = ents[0];
          const hb = head ? head.getBoundingClientRect().bottom : lr.top;
          const gap = first ? Math.round(first.getBoundingClientRect().top - hb) : 0;
          const op = first ? +getComputedStyle(first).opacity : 1;
          const mask = list.style.maskImage || list.style.webkitMaskImage || '';
          // an entry that crosses the list's foot while no mask hides it
          let crossing = 0;
          for (const e of ents) { const r = e.getBoundingClientRect(); if (r.top < lr.bottom - 2 && r.bottom > lr.bottom + 2) crossing++; }
          const m2 = /#?\(?rgb\(0, 0, 0\) ([\d.]+)px/.exec(mask);
          return { gap, op, crossing, masked: !!m2 && mask !== 'none', mask };
        });
        if (!m) continue;
        samples++;
        worstGap = Math.max(worstGap, m.gap);
        minOp = Math.min(minOp, m.op);
        if (m.crossing && !m.masked) cut++;
        if ((m.gap > 14 || (m.crossing && !m.masked)) && shots < 3) { shots++; await shot(page, w, `chron_bad_${shots}`); console.log('bad sample', JSON.stringify(m)); }
      }
      console.log(`chronicle samples ${samples}: worst gap ${worstGap}px, lowest first-entry opacity ${minOp.toFixed(2)}, unmasked cut-offs ${cut}`);
      await shot(page, w, 'chron_fast');
      check(worstGap <= 14 && minOp >= 0.3, `no blank gap under the year header (worst ${worstGap}px, the newest entry never below ${minOp.toFixed(2)} opacity)`);
      check(cut === 0, `no entry cut off at the foot of the list (${cut} samples)`);
      await page.evaluate(() => window.__speed(1));
      check(errors.length === 0, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
      await ctx.close();
    }
  }
} finally {
  clearTimeout(kill);
  await browser.close();
  await server.close();
}
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall checks passed');
process.exit(problems.length ? 1 : 0);
