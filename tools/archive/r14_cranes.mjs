// R14 stills: a sandhill crane flyover from a mid-height camera and from the ground looking up, JPEG q90. Never an OS screen grab.
//   node tools/r14_cranes.mjs --out review/wip/R14 [--dir <projectDir>] [--size 1600x900]
// It starts a flight directly on the Cranes object (window.__cranes), steps it to a point in the pass, renders, and saves the canvas.
// Also reports page exceptions and console errors, and checks the pan: the flock's screen x at the start, middle and end of the pass.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R14'));
const dir = resolve(arg('dir', '.'));
const [W, H] = arg('size', '1600x900').split('x').map(Number);
if (!existsSync(resolve(dir, 'index.html'))) throw new Error('no index.html in ' + dir);
const req = createRequire(resolve(dir, 'package.json'));
const vite = await import(pathToFileURL(req.resolve('vite')).href);
process.chdir(dir);
const kill = setTimeout(() => { console.error('r14_cranes: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await vite.createServer({
  root: dir, configFile: resolve(dir, 'vite.config.ts'), cacheDir: resolve(dir, 'node_modules/.vite-r14'),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'] });
let code = 0;
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => { const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 400)); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1500);
  mkdirSync(out, { recursive: true });
  await page.evaluate(() => { window.__speed(0); window.__engine.setEnv = () => {}; });

  // set up a view, start a flight, step it to `at` seconds into the pass, render
  const shot = async (name, view, at, flight = {}) => {
    const info = await page.evaluate(({ view, at, flight }) => {
      const e = window.__engine, c = window.__cranes;
      c.flights.length = 0;
      Object.assign(e.env, { dayFrac: view.day, season: view.season, weather: 0, rain: 0 });
      e.applyEnvNow();
      e.cam.update = () => {};
      const cam = e.camera;
      if (view.preset) {
        // orbit camera first (its own update is off now, so run it once by hand)
        e.cam.constructor.prototype.update.call(e.cam, 0);
        e.cam.preset(view.preset, true);
        if (view.setView) e.cam.setView(view.setView, true);
        e.cam.constructor.prototype.update.call(e.cam, 0);
      } else {
        // a person standing on open grass (the 'low' preset's anchor), looking up: azimuth from the sun, elevation in degrees
        e.cam.constructor.prototype.update.call(e.cam, 0);
        e.cam.preset('low', true);
        e.cam.constructor.prototype.update.call(e.cam, 0);
        const f = e.cam.getFocus(new cam.position.constructor());
        const yaw = (e.cam.yawDeg + 180 + view.azOff) * Math.PI / 180, el = view.el * Math.PI / 180;
        cam.position.set(f.x, f.y + 0.5, f.z);
        // the orbit camera sits behind the focus point: look away from where it sits, tilted up
        cam.lookAt(f.x - Math.sin(yaw + Math.PI) * Math.cos(el) * 100, f.y + 0.5 + Math.sin(el) * 100, f.z - Math.cos(yaw + Math.PI) * Math.cos(el) * 100);
      }
      cam.updateMatrixWorld();
      for (let i = 0; i < 4; i++) e.renderOnce(0.016);
      const spec = Object.assign({ delay: 0.1, duration: 30, panFrom: -0.85, panTo: 0.85, birds: 9, altitude: 140, season: 'autumn' }, flight);
      c.start(spec);
      // track the flock centre on screen over the pass (the pan check), stepping the clock by hand
      const pans = [];
      const v3 = new cam.position.constructor();
      c.update(spec.delay);
      for (const frac of [0.0, 0.5, 1.0]) {
        const target = spec.delay + spec.duration * frac;
        const cur = c.flights.length ? c.flights[c.flights.length - 1].age : 0;
        if (target > cur) c.update(target - cur);
        e.renderOnce(0.016);
        // screen x of the first bird (the leader)
        const p = c.aPos;
        v3.set(p.getX(0), p.getY(0), p.getZ(0)).project(cam);
        pans.push([frac, +v3.x.toFixed(3), +v3.y.toFixed(3)]);
      }
      // now rewind to the requested moment: restart with the same camera and step
      c.flights.length = 0;
      c.start(spec);
      c.update(spec.delay + at);
      for (let i = 0; i < 3; i++) e.renderOnce(0.05);
      return { pans, drawn: c.drawn, planeY: c.flights[0]?.planeY, dist: c.flights[0]?.dist, scale: c.flights[0]?.scale, ndcY: c.flights[0]?.ndcY };
    }, { view, at, flight });
    console.log(name, JSON.stringify(info));
    await page.waitForTimeout(250);
    const p = `${out}/${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
    console.log('saved', p);
  };

  await shot('cranes_midheight_autumn', { day: 0.42, season: 2.4, preset: 'wide', setView: { distance: 230, pitchDeg: 32 } }, 14, { altitude: 120, birds: 9 });
  await shot('cranes_midheight_spring', { day: 0.38, season: 0.3, preset: 'wide', setView: { distance: 230, pitchDeg: 32 } }, 18, { altitude: 150, birds: 11, season: 'spring', panFrom: 0.85, panTo: -0.85 });
  await shot('cranes_ground_up', { day: 0.45, season: 2.4, azOff: 0, el: 38 }, 12, { altitude: 130, birds: 8 });
  await shot('cranes_ground_up_golden', { day: 0.7, season: 2.4, azOff: 40, el: 32 }, 15, { altitude: 170, birds: 12, panFrom: 0.85, panTo: -0.85 });
  await shot('cranes_close', { day: 0.45, season: 2.4, azOff: 0, el: 30 }, 12, { altitude: 28, birds: 7, duration: 24 });
  // end to end: unlock the audio with a key press, let the audio director schedule a flyover, and check the flock gets drawn
  await page.keyboard.press('Shift');
  await page.waitForTimeout(2500);
  const e2e = await page.evaluate(async () => {
    const a = window.__audio, c = window.__cranes;
    c.flights.length = 0;
    const f = a.scheduleFlyover(0.45, 2.4);
    if (!f) return { scheduled: false, note: 'audio not running or the crane clip is missing' };
    await new Promise((r) => setTimeout(r, 1500));
    window.__engine.renderOnce(0.016);
    return { scheduled: true, flight: { duration: +f.duration.toFixed(1), panFrom: f.panFrom, panTo: f.panTo, birds: f.birds, altitude: Math.round(f.altitude) }, active: c.active, drawn: c.drawn, visible: c.mesh.visible };
  });
  console.log('audio end to end', JSON.stringify(e2e));
  // draw-call check: nothing drawn when no flight is active
  const idle = await page.evaluate(() => { const c = window.__cranes; c.flights.length = 0; window.__engine.renderOnce(0.016); return { drawn: c.drawn, visible: c.mesh.visible, active: c.active }; });
  console.log('idle', JSON.stringify(idle));
} catch (e) {
  console.error('r14_cranes failed:', e.message);
  code = 1;
} finally {
  clearTimeout(kill);
  try { await browser.close(); } catch { /* gone */ }
  try { await server.close(); } catch { /* gone */ }
}
const uniq = [...new Set(errors)];
console.log(uniq.length ? 'PAGE ERRORS:\n' + uniq.join('\n') : 'no page exceptions or console errors');
process.exit(code);
