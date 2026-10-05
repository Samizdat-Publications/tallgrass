// node tools/r15_shots.mjs [outDir=review/wip/R15] [size=1600x900] [shots=all]
// R15 Lens stills of the real game, JPEG q90, one page load: a director close shot with depth of field, the photo mode panel open,
// a photo saved from the panel's Save button (the real download) with shallow focus on a wolf, cinematic grain (full frame and a 3x crop
// beside the same crop with the lens off). Headless Chromium on the real GPU. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? 'review/wip/R15';
const [W, H] = (process.argv[3] ?? '1600x900').split('x').map(Number);
const want = (process.argv[4] ?? 'all').split(',');
mkdirSync(outDir, { recursive: true });
// 'freeze' and 'click' are checks of behaviour, asked for by name (they move the sim on, which would spoil the stills)
const has = (n) => want.includes(n) || (want[0] === 'all' && n !== 'freeze' && n !== 'click');
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r15/.vitecache'), server: { port: 6900 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 900000);
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[exc]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { errors.push(m.text()); console.log('[console.' + m.type() + ']', m.text().slice(0, 300)); } });
  await page.goto(base + '/index.html?autocam=0&autoscale=0&dim=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  const shot = async (name, opts = {}) => { await page.screenshot({ path: resolve(outDir, name + '.jpg'), type: 'jpeg', quality: 90, ...opts }); console.log('shot', name); };
  const settle = (n = 30) => page.evaluate(async (n) => { const e = window.__engine; for (let i = 0; i < n; i++) e.renderOnce(0.016); await new Promise((r) => setTimeout(r, 300)); for (let i = 0; i < 3; i++) e.renderOnce(0.016); }, n);
  // a golden-hour wolf close-up (the sim has wolves from the start)
  const setup = await page.evaluate(async () => {
    const e = window.__engine;
    window.__speed(0);
    const ids = window.__find(1);
    const id = ids[0];
    Object.assign(e.env, { weather: 0, rain: 0, windStrength: 0.25, warmth: 0.7, dayFrac: 0.31, season: 1.8 });
    e.setEnv = () => {};
    e.applyEnvNow();
    window.__select(null);
    window.__followId(id);
    e.cam.setView({ distance: 14, pitchDeg: 9, yawDeg: 215 }, true);
    return { wolves: ids.length, id };
  });
  console.log('setup', JSON.stringify(setup));
  await page.waitForTimeout(1500);
  await settle();

  if (has('director')) {
    // a director close shot: the lens controller racks focus on the shot's subject (the director's own pick is random, so the shot
    // is declared here; the controller reads exactly this getter)
    await page.evaluate((id) => { window.__director.closeShot = () => ({ id, x: 0, y: 0, dist: 14 }); }, setup.id);
    await page.waitForTimeout(2500);
    await settle(60);
    const st = await page.evaluate(() => window.__lens.current);
    console.log('director lens', JSON.stringify(st));
    await shot('01_director_close_dof');
    await page.evaluate(() => { window.__lens.directorDof = false; });
    await page.waitForTimeout(2500);
    await settle(60);
    await shot('01b_director_close_nodof');
    await page.evaluate((id) => { window.__lens.directorDof = true; delete window.__director.closeShot; }, setup.id);
    await page.waitForTimeout(2500);
    await settle(60);
    console.log('director lens after', JSON.stringify(await page.evaluate(() => window.__lens.current)));
  }

  if (has('freeze')) {
    // freeze time: P pauses the sim, closing it sets the speed back
    await page.evaluate(() => window.__speed(1));
    await page.waitForTimeout(800);
    const sp = async () => page.evaluate(() => window.__snap()?.speed);
    const a = await sp();
    await page.keyboard.press('p');
    await page.waitForTimeout(900);
    const b = await sp();
    await page.keyboard.press('p');
    await page.waitForTimeout(900);
    const c = await sp();
    console.log('freeze speeds (before, open, closed):', a, b, c);
    await page.evaluate(() => window.__speed(0));
    await page.waitForTimeout(500);
  }

  if (has('click')) {
    // click-to-focus: a click on another wolf picks it, a click on bare ground picks that spot
    await page.keyboard.press('p');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__ui.photo.set('aperture', 0.6));
    const pos = await page.evaluate((id) => {
      const e = window.__engine;
      const others = window.__find(1).filter((i) => i !== id);
      const v = new window.__engine.camera.position.constructor();
      let best = null;
      for (const o of others) {
        if (!window.__animals.getPosition(o, v)) continue;
        const p = v.clone().project(e.camera);
        if (Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9 && p.z < 1) { best = { id: o, x: (p.x * 0.5 + 0.5) * innerWidth, y: (0.5 - p.y * 0.5) * innerHeight }; break; }
      }
      return best;
    }, setup.id);
    console.log('click target', JSON.stringify(pos));
    if (pos) {
      await page.mouse.click(pos.x, pos.y - 6);
      await page.waitForTimeout(900);
      console.log('after click on animal', JSON.stringify(await page.evaluate(() => ({ mode: window.__lens.mode, text: document.querySelector('.tg-photo-focustext').textContent }))));
    }
    await page.mouse.click(W * 0.75, H * 0.8);
    await page.waitForTimeout(900);
    console.log('after click on ground', JSON.stringify(await page.evaluate(() => ({ mode: window.__lens.mode, text: document.querySelector('.tg-photo-focustext').textContent }))));
    await settle(30);
    await shot('02b_click_focus_ground');
    await page.keyboard.press('p');
    await page.waitForTimeout(800);
  }

  if (has('panel')) {
    await page.evaluate((id) => { window.__select(id); }, setup.id);
    await page.waitForTimeout(800);
    await page.keyboard.press('p');
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.__ui.photo.set('aperture', 0.7); });
    await page.waitForTimeout(1800);
    await settle(40);
    await shot('02_photo_panel');
    console.log('lens', JSON.stringify(await page.evaluate(() => ({ ...window.__lens.current, mode: window.__lens.mode, speed: window.__snap()?.speed }))));
  }

  if (has('save')) {
    // shallow focus on a wolf, saved with the panel's own Save button (JPEG q90)
    await page.evaluate((id) => {
      if (!window.__ui.photo.isOpen) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })); }
      window.__ui.photo.set('aperture', 0.85);
      window.__ui.photo.set('format', 'jpeg');
      window.__ui.photo.set('hideUi', true);
      window.__lens.focusAnimal(id);
      window.__ui.photo.setFocusMode('picked');
    }, setup.id);
    await page.waitForTimeout(2000);
    await settle(40);
    await shot('03_photo_ui_hidden');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('.tg-photo-save')]);
    await dl.saveAs(resolve(outDir, '03_photo_saved_wolf_shallow.jpg'));
    console.log('saved', dl.suggestedFilename());
    await page.evaluate(() => { window.__ui.photo.set('hideUi', false); });
  }

  if (has('close')) {
    // closing restores everything: the passes are skipped again and time runs again
    const before = await page.evaluate(() => ({ open: window.__ui.photo.isOpen }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    await settle(60);
    console.log('after close', JSON.stringify({ before, lens: await page.evaluate(() => window.__lens.current), dof: await page.evaluate(() => window.__engine.post.dof.enabled), speed: await page.evaluate(() => window.__snap()?.speed) }));
  }

  if (has('grain')) {
    await page.evaluate((id) => { window.__ui.setCinematic(true); window.__director.setEnabled(false); window.__followId(id); window.__engine.cam.setView({ distance: 26, pitchDeg: 11, yawDeg: 215 }, true); }, setup.id);
    await page.waitForTimeout(3000);
    await settle(40);
    console.log('cine lens', JSON.stringify(await page.evaluate(() => window.__lens.current)));
    await shot('04_cinematic_grain');
    // crop pair: the same patch with the lens on and off (clip of the page at device scale 1, then enlarged by the viewer)
    const clip = { x: Math.round(W * 0.58), y: Math.round(H * 0.5), width: 320, height: 200 };
    await page.screenshot({ path: resolve(outDir, '04_crop_lens_on.png'), type: 'png', clip });
    await page.evaluate(() => { window.__lens.cinematic = false; });
    await page.waitForTimeout(3500);
    await settle(40);
    await page.screenshot({ path: resolve(outDir, '04_crop_lens_off.png'), type: 'png', clip });
    await page.evaluate(() => { window.__ui.setCinematic(false); });
  }
  console.log('errors', errors.length);
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(0);
