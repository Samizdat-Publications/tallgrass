// node tools/r9_shots.mjs [outDir=review/wip/R9] [size=1600x900] [shots=all | comma list]
// R9 night sky stills of the real game, JPEG q90, one page load: new moon (drone and low, looking up at the Milky Way), full moon,
// a crescent at dusk, a meteor, the moon's glint on the creek, aurora, the August shower, a daytime moon, and regression stills at noon
// and dusk. Headless Chromium on the real GPU. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? 'review/wip/R9';
const [W, H] = (process.argv[3] ?? '1600x900').split('x').map(Number);
const want = (process.argv[4] ?? 'all').split(',');
mkdirSync(outDir, { recursive: true });
const has = (n) => want[0] === 'all' || want.includes(n);
const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r9/.vitecache'), server: { port: 7200 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 900000);
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[exc]', e.message.slice(0, 400)); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { errors.push(m.text()); console.log('[console.' + m.type() + ']', m.text().slice(0, 600)); } });
  await page.goto(base + '/index.html?autocam=0&autoscale=0&dim=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    window.__speed(0);
    const e = window.__engine;
    e.setEnv = () => {};
    window.__sky = await import('/src/render/sky.ts');
    window.__camHook = null;
    e.onFrame(() => { if (window.__camHook) window.__camHook(); });
    document.getElementById('ui').style.display = 'none';
  });
  const lowPos = await page.evaluate(() => { window.__engine.cam.preset('low', true); const c = window.__engine.camera.position; return { x: c.x, z: c.z }; });
  console.log('low anchor', JSON.stringify(lowPos));
  const shot = async (name, opts = {}) => { await page.screenshot({ path: resolve(outDir, name + '.jpg'), type: 'jpeg', quality: 90, ...opts }); console.log('shot', name); };
  const settle = (n = 40) => page.evaluate(async (n) => { const e = window.__engine; for (let i = 0; i < n; i++) e.renderOnce(0.016); await new Promise((r) => setTimeout(r, 300)); for (let i = 0; i < 3; i++) e.renderOnce(0.016); }, n);
  // set the sky: env fields, plus the night sky's debug overrides (moon cycle 0 new .. 0.5 full, aurora strength, shower strength)
  const sky = (o) => page.evaluate((o) => {
    const e = window.__engine, N = window.__sky.NIGHT;
    const { cyc = NaN, aurora = 0, shower = NaN, meteor = -1, aim = null, ...env } = o;
    Object.assign(e.env, { weather: 0, rain: 0, windStrength: 0.2, warmth: 0.5 }, env);
    N.debug.moonCycle = cyc; N.debug.aurora = aurora; N.debug.shower = shower; N.meteorT.value = meteor;
    if (aim) { const az = aim[0] * Math.PI / 180, el = aim[1] * Math.PI / 180; N.meteorAim.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); }
    window.__camHook = null;
    e.applyEnvNow();
    return { ...N.info, moonK: N.moonK.value, sunEl: e.lighting.sunElDeg, moonDir: e.uniforms.moonDir.value.toArray().map((v) => +v.toFixed(2)) };
  }, o);
  // look from the ground: position (x, z), eye height above ground, compass azimuth (atan2(x, z): 0 north, 0.25 east, 0.5 south) and elevation in degrees
  const lookFrom = (x, z, azDeg, elDeg, h = 1.7) => page.evaluate(({ x, z, azDeg, elDeg, h }) => {
    const e = window.__engine;
    window.__camHook = () => {
      const c = e.camera;
      const y = e.groundHeight(x, z) + h;
      c.position.set(x, y, z);
      const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
      c.up.set(0, 1, 0);
      c.lookAt(x + Math.sin(az) * Math.cos(el) * 100, y + Math.sin(el) * 100, z + Math.cos(az) * Math.cos(el) * 100);
      c.updateMatrixWorld(true);
    };
  }, { x, z, azDeg, elDeg, h });
  const wide = () => page.evaluate(() => { window.__camHook = null; window.__engine.cam.preset('wide', true); });
  const lowPreset = () => page.evaluate(() => { window.__camHook = null; window.__engine.cam.preset('low', true); const c = window.__engine.camera; return c.position.toArray(); });

  const S = 1.3; // summer: the galactic centre rides low in the south at midnight
  if (has('new_wide')) {
    console.log('new moon', JSON.stringify(await sky({ cyc: 0.0, dayFrac: 0.0, season: S })));
    await wide(); await settle(); await shot('01_new_moon_night_wide_drone');
  }
  if (has('new_low')) {
    await sky({ cyc: 0.0, dayFrac: 0.0, season: S });
    await lookFrom(lowPos.x, lowPos.z, 180, 28); await settle(); await shot('02_new_moon_low_looking_up_south');
    await lookFrom(lowPos.x, lowPos.z, 20, 38); await settle(); await shot('02b_new_moon_low_looking_up_north');
  }
  if (has('full_wide')) {
    console.log('full moon', JSON.stringify(await sky({ cyc: 0.5, dayFrac: 0.0, season: S })));
    await wide(); await settle(); await shot('03_full_moon_night_wide_drone');
  }
  if (has('full_low')) {
    await sky({ cyc: 0.5, dayFrac: 0.0, season: S });
    await lookFrom(lowPos.x, lowPos.z, 180, 28); await settle(); await shot('03b_full_moon_low_looking_up_south');
  }
  if (has('crescent')) {
    console.log('crescent', JSON.stringify(await sky({ cyc: 0.17, dayFrac: 0.83, season: 1.8 })));
    await wide(); await settle(); await shot('04_crescent_dusk_wide_drone');
    // from a high point, looking at the moon
    const m = await page.evaluate(() => { const m = window.__engine.uniforms.moonDir.value; return { az: Math.atan2(m.x, m.z) * 180 / Math.PI, el: Math.asin(m.y) * 180 / Math.PI }; });
    await lookFrom(lowPos.x, lowPos.z, m.az, m.el, 60); await settle(); await shot('04b_crescent_dusk_toward_moon');
    await sky({ cyc: 0.17, dayFrac: 0.9, season: 1.8 });
    const m2 = await page.evaluate(() => { const m = window.__engine.uniforms.moonDir.value; return { az: Math.atan2(m.x, m.z) * 180 / Math.PI, el: Math.asin(m.y) * 180 / Math.PI }; });
    await lookFrom(lowPos.x, lowPos.z, m2.az, m2.el + 4, 60); await settle(); await shot('04c_crescent_night_toward_moon');
  }
  if (has('meteor')) {
    await sky({ cyc: 0.0, dayFrac: 0.0, season: S, meteor: 3, shower: 0, aim: [20, 40] });
    await lookFrom(lowPos.x, lowPos.z, 20, 38); await settle(); await shot('05_meteor_sporadic');
    await sky({ cyc: 0.05, dayFrac: 0.02, season: 1.57, meteor: 7, shower: 1, aim: [20, 40] });
    await lookFrom(lowPos.x, lowPos.z, 20, 38); await settle(); await shot('05b_meteor_shower_peak');
  }
  if (has('glint')) {
    const s = await sky({ cyc: 0.5, dayFrac: 0.9, season: 2.0 });
    console.log('glint sky', JSON.stringify(s));
    // a mirror shows the moon's image where the line of sight reflects to it: stand up-moon-azimuth of the water, high enough that
    // the angle down to the water equals the moon's height
    const water = await page.evaluate(() => {
      const e = window.__engine, w = e.world, S = w.size;
      const m = e.uniforms.moonDir.value, az = Math.atan2(m.x, m.z), el = Math.asin(m.y);
      const out = { az, el, ponds: [], creek: [] };
      for (let p = 0; p < w.ponds.length; p += 4) out.ponds.push([w.ponds[p], w.ponds[p + 1], w.ponds[p + 2]]);
      const tr = w.trees;
      for (let k = 8; k < w.creek.length / 2 - 8; k += 3) {
        const x = w.creek[2 * k], z = w.creek[2 * k + 1];
        if (!(x > 120 && z > 120 && x < S - 120 && z < S - 120)) continue;
        let clear = true;
        for (let i = 0; i < tr.length; i += 4) if (Math.hypot(tr[i] - x, tr[i + 1] - z) < 9) { clear = false; break; }
        if (clear) out.creek.push([x, z]);
      }
      return out;
    });
    console.log('moon az/el', (water.az * 180 / Math.PI).toFixed(1), (water.el * 180 / Math.PI).toFixed(1), 'ponds', water.ponds.length, 'creek pts', water.creek.length);
    const mirrorShot = async (nm, tx, tz, hh) => {
      await page.evaluate(({ tx, tz, hh, az, el }) => {
        const e = window.__engine;
        window.__camHook = () => {
          const c = e.camera;
          const gy = e.groundHeight(tx, tz);
          const D = hh / Math.tan(el);
          const cx = tx - Math.sin(az) * D, cz = tz - Math.cos(az) * D;
          c.position.set(cx, Math.max(gy + hh, e.groundHeight(cx, cz) + 8), cz);
          c.up.set(0, 1, 0);
          c.lookAt(tx, gy, tz);
          c.updateMatrixWorld(true);
        };
      }, { tx, tz, hh, az: water.az, el: water.el });
      await settle(); await shot(nm);
    };
    water.ponds.forEach((pd, i) => { /* one shot per pond */ });
    for (const [i, pd] of water.ponds.entries()) await mirrorShot('06_moon_glint_pond' + i, pd[0], pd[1], 70);
    for (const [i, k] of [0.25, 0.6].entries()) { if (!water.creek.length) break; const c = water.creek[Math.floor(water.creek.length * k)]; await mirrorShot('06c_moon_glint_creek' + i, c[0], c[1], 45); }
  }
  if (has('aurora')) {
    await sky({ cyc: 0.0, dayFrac: 0.0, season: 3.2, aurora: 1 });
    await lookFrom(lowPos.x, lowPos.z, 0, 22); await settle(); await shot('07_aurora_north');
  }
  if (has('daymoon')) {
    console.log('day moon', JSON.stringify(await sky({ cyc: 0.3, dayFrac: 0.6, season: 1.8 })));
    const az = await page.evaluate(() => { const m = window.__engine.uniforms.moonDir.value; return Math.atan2(m.x, m.z) * 180 / Math.PI; });
    const del = await page.evaluate(() => Math.asin(window.__engine.uniforms.moonDir.value.y) * 180 / Math.PI);
    await lookFrom(lowPos.x, lowPos.z, az, del + 4, 40); await settle(); await shot('08_daytime_moon');
  }
  if (has('phases')) {
    for (const [i, c] of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85].entries()) {
      // a moon-centred look at each phase, the moon placed at a comfortable height by choosing the hour
      await sky({ cyc: c, dayFrac: 0.0 + 0.5 * c * 0, season: 3.2 });
      const info = await page.evaluate(() => { const m = window.__engine.uniforms.moonDir.value; return { az: Math.atan2(m.x, m.z) * 180 / Math.PI, el: Math.asin(m.y) * 180 / Math.PI }; });
      await lookFrom(lowPos.x, lowPos.z, info.az, Math.max(info.el, 5) ); await settle(12); await shot('09_phase_' + i + '_c' + c.toFixed(2), { clip: { x: W / 2 - 150, y: H / 2 - 150, width: 300, height: 300 } });
    }
  }
  if (has('fireflies')) {
    console.log('fireflies sky', JSON.stringify(await sky({ cyc: 0.12, dayFrac: 0.81, season: 0.9, warmth: 0.8 })));
    const pd = await page.evaluate(() => { const w = window.__engine.world; return [w.ponds[0], w.ponds[1], w.ponds[2]]; });
    await page.evaluate(({ x, z, r }) => {
      const e = window.__engine;
      window.__camHook = () => {
        const c = e.camera, cx = x + 8, cz = z + r + 38, y = Math.max(e.groundHeight(x, z), e.groundHeight(cx, cz)) + 14;
        c.position.set(cx, y, cz); c.up.set(0, 1, 0); c.lookAt(x, e.groundHeight(x, z) + 1.5, z); c.updateMatrixWorld(true);
      };
    }, { x: pd[0], z: pd[1], r: pd[2] });
    await settle(60); await shot('11_fireflies_pond_dusk');
    console.log('firefly count visible', await page.evaluate(() => window.__engine.fireflies.mesh.visible));
  }
  if (has('regress')) {
    await sky({ dayFrac: 0.5, season: 1.8 }); await wide(); await settle(); await shot('10_regression_noon');
    await sky({ dayFrac: 0.77, season: 1.8 }); await wide(); await settle(); await shot('10b_regression_dusk');
  }
  console.log('errors:', errors.length, JSON.stringify(errors.slice(0, 5)));
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(0);
