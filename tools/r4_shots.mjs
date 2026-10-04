// R4 storm stills. One page load, many shots. JPEG q90, GPU Chromium.
//   node tools/r4_shots.mjs <outDir> <name1,name2,...|all> [size=1600x900]
// Cells are placed with the debug hooks (engine.storms.debugCells / debugStrike) relative to the camera, so a shot is repeatable.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const outDir = process.argv[2] ?? 'review/wip/R4';
const want = (process.argv[3] ?? 'all').split(',');
const [W, H] = (process.argv[4] ?? '1600x900').split('x').map(Number);
mkdirSync(outDir, { recursive: true });

const FIRE_ENV = { dayFrac: 0.5, season: 2.0, weather: 0, rain: 0.05, windStrength: 0.5, warmth: 0.8 };
const STORM_ENV = { dayFrac: 0.42, season: 1.3, weather: 3, rain: 1, windStrength: 0.6, warmth: 0.6 };
// each shot: env, camera code, cells (ahead/side in metres from the camera focus, along the view direction), optional steps
const SHOTS = {
  drone_wide_2cells: {
    env: STORM_ENV, cam: "e.cam.preset('wide', true)", windSide: true,
    cells: [{ ahead: 190, side: -150, r: 95, I: 0.95 }, { ahead: 330, side: 190, r: 80, I: 0.8 }], frames: 12,
  },
  drone_wide_dusk: {
    env: { ...STORM_ENV, dayFrac: 0.7 }, cam: "e.cam.preset('wide', true)", windSide: true,
    cells: [{ ahead: 200, side: -120, r: 100, I: 1 }], frames: 12,
  },
  drone_top: {
    env: STORM_ENV, cam: "e.cam.preset('top', true)", windSide: true,
    cells: [{ ahead: 0, side: -60, r: 100, I: 0.9 }, { ahead: 60, side: 190, r: 80, I: 0.7 }], frames: 12,
  },
  drone_oblique: {
    env: STORM_ENV, cam: "e.cam.setView({ distance: 430, pitchDeg: 8 }, true)", windSide: true,
    cells: [{ ahead: 240, side: -170, r: 95, I: 0.95 }, { ahead: 380, side: 200, r: 80, I: 0.8 }], frames: 12,
  },
  drone_oblique_nocells: {
    env: STORM_ENV, cam: "e.cam.setView({ distance: 430, pitchDeg: 8 }, true)", windSide: true, cells: [], frames: 12,
  },
  drone_oblique_dusk: {
    env: { ...STORM_ENV, dayFrac: 0.7 }, cam: "e.cam.setView({ distance: 430, pitchDeg: 8 }, true)", windSide: true,
    cells: [{ ahead: 240, side: -170, r: 95, I: 0.95 }, { ahead: 380, side: 200, r: 80, I: 0.8 }], frames: 12,
  },
  low_under: {
    env: STORM_ENV, cam: "e.cam.setView({ distance: 40, pitchDeg: 6 }, true)", windSide: true,
    cells: [{ ahead: 40, side: 0, r: 95, I: 0.95 }], frames: 12,
  },
  low_view: {
    env: STORM_ENV, cam: "e.cam.preset('low', true)", windSide: true,
    cells: [{ ahead: 300, side: -30, r: 100, I: 0.95 }], frames: 12,
  },
  low_far: {
    env: { ...STORM_ENV, dayFrac: 0.62 }, cam: "e.cam.preset('low', true)", windSide: true,
    cells: [{ ahead: 460, side: 60, r: 100, I: 0.95 }], frames: 12,
  },
  lightning_wide: {
    env: STORM_ENV, cam: "e.cam.preset('wide', true)", windSide: true,
    cells: [{ ahead: 200, side: -90, r: 100, I: 1 }], strike: { ahead: 190, side: -70 }, strikeFrames: 1, frames: 12,
  },
  lightning_low: {
    env: STORM_ENV, cam: "e.cam.preset('low', true)", windSide: true,
    cells: [{ ahead: 130, side: -20, r: 100, I: 1 }], strike: { ahead: 95, side: -10 }, strikeFrames: 1, frames: 12,
  },
  lightning_dusk: {
    env: { ...STORM_ENV, dayFrac: 0.76 }, cam: "e.cam.preset('wide', true)", windSide: true,
    cells: [{ ahead: 200, side: -90, r: 100, I: 1 }], strike: { ahead: 195, side: -60 }, strikeFrames: 1, frames: 12,
  },
  rainbow: { rainbow: true, env: { dayFrac: 0.31, season: 1.3, weather: 0, rain: 0, windStrength: 0.3, warmth: 0.6 }, frames: 12 },
  fire_1_strike: { fire: 0, env: FIRE_ENV, cam: "e.cam.setView({ distance: 95, pitchDeg: 13 }, true)", windSide: true, cells: [{ ahead: 190, side: -40, r: 100, I: 1 }], strike: { ahead: -25, side: -33, ignite: true }, strikeFrames: 1 },
  fire_2_ember: { fire: 1, env: FIRE_ENV, cam: "e.cam.setView({ distance: 95, pitchDeg: 13 }, true)", windSide: true, cells: [{ ahead: 190, side: -40, r: 100, I: 1 }], strike: { ahead: -25, side: -33, ignite: true }, strikeFrames: 1 },
  fire_3_smoke: { fire: 2, env: FIRE_ENV, cam: "e.cam.setView({ distance: 95, pitchDeg: 13 }, true)", windSide: true, cells: [{ ahead: 190, side: -40, r: 100, I: 1 }], strike: { ahead: -25, side: -33, ignite: true }, strikeFrames: 1 },
  fire_4_column: { fire: 3, env: FIRE_ENV, cam: "e.cam.setView({ distance: 95, pitchDeg: 13 }, true)", windSide: true, cells: [{ ahead: 190, side: -40, r: 100, I: 1 }], strike: { ahead: -25, side: -33, ignite: true }, strikeFrames: 1 },
};
const names = want[0] === 'all' ? Object.keys(SHOTS) : want;

const server = await createServer({ configFile: resolve('vite.config.ts'), cacheDir: resolve('scratch/r4/.vitecache'), server: { port: 6600 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/.venv/**', '**/review/**', '**/dist/**', '**/node_modules/**', '**/journey/**', '**/art/**', '**/.claude/**'] } }, optimizeDeps: { entries: ['index.html'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 60000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const killer = setTimeout(() => { console.log('hard timeout'); process.exit(2); }, 900000);
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[exc]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 400)); });
  await page.goto(base + '/index.html?autocam=0&autoscale=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('h');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Interface hidden/.test(el.textContent || '')) { let n = el; while (n.parentElement && n.parentElement !== document.body && n.parentElement.children.length === 1) n = n.parentElement; n.style.display = 'none'; } });
  await page.evaluate(() => { window.__speed(0); window.__engine.setEnv = () => {}; window.__engine.setStorms = () => {}; });
  for (const name of names) {
    const s = SHOTS[name];
    if (!s) { console.log('no shot', name); continue; }
    const info = await page.evaluate(async ({ s }) => {
      const e = window.__engine;
      e.stop();
      const st = e.storms;
      st.debugCells([]);
      for (const b of st.bolts) { b.active = false; b.mesh.visible = false; }
      for (const m of st.embers) { m.active = false; m.mesh.visible = false; }
      st.bowNow = 0; st.bowCharge = 0;
      // clear any earlier fire
      const veg = e.vegTexture.image.data;
      if (window.__burned) { for (const o of window.__burned) veg[o] = Math.min(veg[o], 0); window.__burned = null; e.smoke.setVeg(veg); }
      Object.assign(e.env, s.env);
      e.applyEnvNow();
      if (s.cam) (0, eval)(`(e) => { ${s.cam} }`)(e);
      // the camera's ground-plane forward and right, for placing cells in view
      e.camera.updateMatrixWorld();
      const fw = e.camera.getWorldDirection(new e.camera.position.constructor());
      let fx = fw.x, fz = fw.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const rx = -fz, rz = fx;
      if (s.windSide) e.env.windDir = Math.atan2(rz, rx);
      const f = e.cam.getFocus(new e.camera.position.constructor());
      const at = (a, sd) => ({ x: f.x + fx * a + rx * sd, y: f.z + fz * a + rz * sd });
      if (s.rainbow) {
        // look away from the sun, low
        const sd = e.uniforms.sunDir.value;
        const el = Math.asin(sd.y) * 180 / Math.PI;
        const az = Math.atan2(sd.x, sd.z) * 180 / Math.PI;
        e.cam.setView({ yawDeg: az, pitchDeg: 2, distance: 90 }, true);
        e.camera.fov = 70; e.camera.updateProjectionMatrix();
        st.bowCharge = 1; st.bowNow = 1;
        for (let i = 0; i < 12; i++) e.renderOnce(0.016);
        window.__s = { el: +el.toFixed(1), az: +az.toFixed(0) };
        return { sunEl: el, rainbow: st.uniforms.rainbow.value };
      }
      e.camera.fov = 45; e.camera.updateProjectionMatrix();
      if (s.cells) st.debugCells(s.cells.map((c) => ({ ...at(c.ahead, c.side), r: c.r, I: c.I })));
      for (let i = 0; i < (s.frames ?? 12); i++) e.renderOnce(0.016);
      const out = { cells: st.cellCount, flash: 0, puffs: st.cloudGeo.instanceCount };
      if (s.strike) {
        const p = at(s.strike.ahead, s.strike.side);
        st.debugStrike(p.x, p.y, !!s.strike.ignite);
        if (s.strike.ignite) {
          // burn a small patch under the strike; the smoke system starts from the burning cells
          const n = e.world.n, cell = e.world.cell, burned = [];
          for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
            if (Math.hypot((cx + 0.5) * cell - p.x, (cy + 0.5) * cell - p.y) < 5) burned.push((cy * n + cx) * 4 + 2);
          }
          window.__burned = burned;
          window.__fireAt = () => { for (const o of burned) veg[o] = 255; e.vegTexture.needsUpdate = true; e.smoke.setVeg(veg); };
        }
        const stage = s.fire ?? 0;
        let simT = 0;
        if (stage === 0) { for (let i = 0; i < (s.strikeFrames ?? 2); i++) e.renderOnce(0.016); }
        else {
          for (let i = 0; i < 3; i++) e.renderOnce(0.016); // the flash and bolt pass
          window.__fireAt();
          const want = [0, 0.8, 4, 14][stage];
          while (simT < want) { e.renderOnce(0.1); simT += 0.1; }
          if (stage >= 1) { for (let i = 0; i < 2; i++) e.renderOnce(0.016); }
        }
        out.flash = +st.flash.toFixed(2);
      }
      out.cam = [e.camera.position.x | 0, e.camera.position.y | 0, e.camera.position.z | 0];
      return out;
    }, { s });
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(outDir, name + '.jpg'), type: 'jpeg', quality: 90 });
    console.log(name, JSON.stringify(info));
  }
} finally { clearTimeout(killer); await browser.close(); await server.close(); }
process.exit(0);
