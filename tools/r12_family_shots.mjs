// node tools/r12_family_shots.mjs [outDir=review/wip/R12/family] [size=1600x900] [shots=all] [years=20] [seed=family] [suffix=]
// (the small window: node tools/r12_family_shots.mjs review/wip/R12/family 820x620 all 20 family _820x620)
// R12 Family tree stills of the real game, JPEG q90: a bison pedigree, a wolf with its pack dynasty, a deep lineage of another
// species, and (run again at 820x620) a small window. The valley is run `years` valley-years forward with the worker's step
// message first, so the lineages are deep. Also checks behaviour: a click on a living relative selects it, a click on a dead one
// re-centres the chart, Esc closes the page, and the console stays clean. Headless Chromium on the real GPU, never an OS grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? 'review/wip/R12/family';
const [W, H] = (process.argv[3] ?? '1600x900').split('x').map(Number);
const want = (process.argv[4] ?? 'all').split(',');
const years = Number(process.argv[5] ?? 20);
const seed = process.argv[6] ?? 'family';
const suffix = process.argv[7] ?? '';
mkdirSync(outDir, { recursive: true });
const has = (n) => want.includes(n) || want[0] === 'all';
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r12/.vitecache'), server: { port: 7200 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 1500000);
const errors = [];
let failed = 0;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) failed++; };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[exc]', e.message.slice(0, 300)); });
  // the GPU shader compiler's X3595 warnings come from the terrain shaders, not the UI: logged, not counted
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); const noise = /X3595|WebGLProgram|GPU stall|GL Driver Message/.test(t); if (!noise) errors.push(t); if (!noise) console.log('[console.' + m.type() + ']', t.slice(0, 300)); } });
  await page.goto(base + `/index.html?autocam=0&autoscale=0&dim=0&seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1200);
  const shot = async (name) => { await page.screenshot({ path: resolve(outDir, name + suffix + '.jpg'), type: 'jpeg', quality: 90 }); console.log('shot', name + suffix); };
  const settle = (n = 20) => page.evaluate(async (n) => { const e = window.__engine; for (let i = 0; i < n; i++) e.renderOnce(0.016); await new Promise((r) => setTimeout(r, 300)); for (let i = 0; i < 3; i++) e.renderOnce(0.016); }, n);
  const nudge = async () => { await page.evaluate(() => window.__step(1)); await page.waitForTimeout(500); };
  await page.evaluate(() => window.__speed(0));
  if (years > 0) {
    // run until the valley's year counter (env.year + 1, what the slate shows) passes the target
    for (let guard = 0; guard < 600; guard++) {
      const yr = await page.evaluate(() => (window.__snap()?.env.year ?? 0) + 1);
      if (yr > years) break;
      const goal = await page.evaluate(() => { const g = (window.__snap()?.tick ?? 0) + 1200; window.__step(1200); return g; });
      await page.waitForFunction((g) => (window.__snap()?.tick ?? 0) >= g, goal, { timeout: 240000, polling: 200 });
    }
    await page.waitForTimeout(1500);
  }
  console.log('year', await page.evaluate(() => (window.__snap()?.env.year ?? 0) + 1), 'tick', await page.evaluate(() => window.__snap()?.tick));
  console.log('alive by species', JSON.stringify(await page.evaluate(() => { const out = {}; for (let sp = 0; sp <= 10; sp++) out[sp] = window.__find(sp).length; return out; })));

  // find the deepest lineages: every candidate is asked for its tree, and the page keeps the replies
  const best = await page.evaluate(async () => {
    const fam = window.__ui.family;
    const seen = new Map();
    const orig = fam.setTree.bind(fam);
    fam.setTree = (id, tree) => { if (tree) seen.set(id, tree); orig(id, tree); };
    const ids = [];
    for (const sp of [0, 1, 3, 2, 4, 5, 6, 7, 8, 9, 10]) ids.push(...window.__find(sp).slice(0, 120));
    for (const id of ids) fam.actions.requestLineage(id);
    await new Promise((r) => setTimeout(r, 2500));
    const score = (t) => {
      const known = t.up.flat().filter(Boolean).length;
      const grand = t.down.reduce((s, d) => s + d.children.length, 0);
      return known * 3 + Math.min(8, t.down.length) * 2 + Math.min(8, grand);
    };
    const bySp = {};
    for (const [id, t] of seen) {
      if (!t.self.alive) continue;
      const s = score(t);
      const sp = t.self.sp;
      if (!bySp[sp] || s > bySp[sp].s) bySp[sp] = { id, s, up: t.up.flat().filter(Boolean).length, kids: t.down.length, pack: t.self.pack, gen: t.self.gen };
    }
    // wolf: needs a pack
    let wolf = null;
    for (const [id, t] of seen) if (t.self.sp === 1 && t.self.alive && t.self.pack >= 0) { const s = score(t); if (!wolf || s > wolf.s) wolf = { id, s, up: t.up.flat().filter(Boolean).length, kids: t.down.length, pack: t.self.pack, gen: t.self.gen }; }
    fam.setTree = orig;
    return { bySp, wolf, asked: ids.length, replies: seen.size };
  });
  console.log('best lineages', JSON.stringify(best));

  const open = async (id) => {
    await page.keyboard.press('Escape'); // close an open page first
    await page.waitForTimeout(150);
    await page.evaluate((id) => window.__select(id), id);
    await nudge();
    await page.waitForTimeout(400);
    await page.keyboard.press('t');
    await page.waitForTimeout(1200);
    await nudge();
    await settle();
  };
  const panelText = () => page.evaluate(() => document.querySelector('.tg-family')?.innerText ?? '');
  const familyOpen = () => page.evaluate(() => !!document.querySelector('.tg-family.is-open'));

  if (has('bison') && best.bySp[0]) {
    await open(best.bySp[0].id);
    check(await familyOpen(), 'T opens the family page for a selected bison');
    const cards = await page.evaluate(() => document.querySelectorAll('.tg-fam-node').length);
    check(cards >= 3, `bison tree draws cards (${cards})`);
    await shot('01_bison_family');
  }
  if (has('wolf') && best.wolf) {
    await open(best.wolf.id);
    await shot('02_wolf_pedigree');
    await page.evaluate(() => [...document.querySelectorAll('.tg-fam-tabs .tg-seg-btn')].find((b) => /dynasty/i.test(b.textContent))?.click());
    await page.waitForTimeout(1400);
    await settle();
    const segs = await page.evaluate(() => document.querySelectorAll('.tg-fam-seg').length);
    check(segs >= 2, `wolf dynasty draws alpha bars (${segs})`);
    await shot('03_wolf_pack_dynasty');
    // a click on a bar re-centres the pedigree on that wolf
    const before = await page.evaluate(() => document.querySelector('.tg-fam-sub')?.textContent);
    await page.evaluate(() => { const bs = [...document.querySelectorAll('button.tg-fam-seg')]; bs[0]?.click(); });
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => document.querySelector('.tg-fam-sub')?.textContent);
    console.log('dynasty click:', before, '=>', after);
    check(await page.evaluate(() => document.querySelectorAll('.tg-fam-tabs .tg-seg-btn[aria-checked="true"]')[0]?.textContent === 'Pedigree'), 'a click on an alpha bar goes back to the pedigree');
  }
  // the other species the valley has: the deepest of each (pronghorn, then the raven, whose births record no separate sire, so
  // its tree shows the soft "Not recorded" placeholders)
  if (has('other')) {
    const picks = [[3, '04_pronghorn_family'], [2, '06_raven_soft_placeholders'], [4, '07_rabbit_family'], [5, '08_cougar_family'], [6, '09_coyote_family'], [10, '10_muledeer_family']];
    for (const [sp, name] of picks) {
      const o = best.bySp[sp];
      if (!o) continue;
      await open(o.id);
      console.log(name, JSON.stringify(o));
      await shot(name);
    }
  }
  if (has('click') && best.bySp[0]) {
    await open(best.bySp[0].id);
    const sel0 = await page.evaluate(() => window.__snap()?.selected?.id);
    // a living relative: select and follow
    const relId = await page.evaluate(() => { const n = document.querySelector('.tg-fam-node:not(.is-self):not(.is-dead):not(.is-ph)'); return n ? n.getAttribute('aria-label') : null; });
    console.log('living relative card:', relId);
    const clicked = await page.evaluate(() => { const n = document.querySelector('button.tg-fam-node:not(.is-dead)'); if (!n) return false; n.click(); return true; });
    await page.waitForTimeout(500);
    await nudge();
    await page.waitForTimeout(800);
    const sel1 = await page.evaluate(() => window.__snap()?.selected?.id);
    if (clicked) check(sel1 !== undefined && sel1 !== sel0, `a click on a living relative selects it (${sel0} -> ${sel1})`);
    check(await familyOpen(), 'the page stays open after a click on a relative');
    const sub1 = await page.evaluate(() => document.querySelector('.tg-fam-sub')?.textContent);
    console.log('centred on:', sub1);
    // a dead relative: centres the chart without changing the selection
    const deadClicked = await page.evaluate(() => { const n = document.querySelector('button.tg-fam-node.is-dead'); if (!n) return false; n.click(); return true; });
    await page.waitForTimeout(1200);
    const sel2 = await page.evaluate(() => window.__snap()?.selected?.id);
    if (deadClicked) {
      check(sel2 === sel1, 'a click on a dead relative leaves the selection alone');
      check(await page.evaluate(() => !document.querySelector('.tg-fam-back')?.hidden), 'a "back" button appears after wandering to a dead relative');
      await shot('05_dead_relative_centred');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check(!(await familyOpen()), 'Esc closes the family page');
    const inspectorStill = await page.evaluate(() => !document.querySelector('.tg-insp')?.hidden);
    check(inspectorStill, 'the inspector is still there after closing the page');
  }
  if (has('deadsel')) {
    // an animal in memoriam opens its family too
    console.log('panel text sample:', (await panelText()).slice(0, 120).replace(/\n/g, ' | '));
  }
  console.log('console errors', errors.length);
} finally {
  clearTimeout(killer);
  await browser.close();
  await server.close();
}
console.log(errors.length ? 'ERRORS: ' + errors.length : 'no console errors', failed ? `, ${failed} FAILED checks` : ', all checks ok');
process.exit(errors.length || failed ? 1 : 0);
