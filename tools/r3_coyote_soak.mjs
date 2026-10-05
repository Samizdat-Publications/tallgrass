// (R3 coyote variant of r3_soak.mjs: coyotes, open prairie and mange on, and it reports the director's shot, chorus and field notes each minute.)
// Soak test: the real game on the GPU at 10x with the small-prey params on, for N minutes (default 30), counting console errors and page
// exceptions. Clicks once so the audio context starts (the audio paths run too), pokes the small-prey layer (alarms, the overlay) now and
// then, and samples fps, tick and the layer's counts every minute.
//   node tools/r3_soak.mjs [minutes] [--out scratch/soak_coyote.log]
// Exit code 0 when there were no errors, 1 otherwise. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const minutes = Number(argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 30);
const outIdx = argv.indexOf('--out');
const logPath = resolve(outIdx >= 0 ? argv[outIdx + 1] : 'scratch/soak_coyote.log');
writeFileSync(logPath, `soak ${minutes} min, start ${new Date().toISOString()}\n`);
const log = (s) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(line); appendFileSync(logPath, line + '\n'); };

const kill = setTimeout(() => { log('HARD TIMEOUT'); process.exit(2); }, (minutes + 12) * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r3'),
  server: { port: 6900 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let warnings = 0;
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { errors.push('[exception] ' + e.message.slice(0, 300)); log('PAGE ERROR ' + e.message.slice(0, 200)); });
  page.on('console', (m) => {
    if (m.type() === 'error') { errors.push('[console.error] ' + m.text().slice(0, 300)); log('CONSOLE ERROR ' + m.text().slice(0, 200)); }
    else if (m.type() === 'warning') warnings++;
  });
  await page.goto(base + '/index.html?autoscale=1&seed=3&speed=10&p=coyote.initial:12,smallPrey:1,openPrairie:1,mangeRate:1', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.mouse.click(640, 360); // unlock audio
  log('ready; audio ' + JSON.stringify(await page.evaluate(() => window.__audio.state)));
  const t0 = Date.now();
  let minute = 0;
  while (Date.now() - t0 < minutes * 60 * 1000) {
    await page.waitForTimeout(60000);
    minute++;
    const s = await page.evaluate(() => {
      const L = window.__smallprey, sn = window.__snap();
      const D = window.__director.current; const st = new Set(); if (sn) for (let k = 0; k < sn.count; k++) if (sn.agents[k * 12] === 6) st.add(sn.agents[k * 12 + 7]); return { fps: window.__fps, tick: sn ? sn.tick : -1, shot: D ? D.kind : null, chorusOn: window.__animals.chorusOn, coyoteStates: [...st], notes: window.__fieldnotes.count, leapsT: 0, pop: sn ? Array.from(sn.pop) : [], dbg: L.debug(), audio: window.__audio.state, voices: window.__audio.activeVoices };
    });
    log(`min ${minute}: ${JSON.stringify(s)}`);
    // exercise the layer: an alarm at the biggest town, now and then the Small prey overlay and a camera visit
    if (minute % 3 === 0) {
      await page.evaluate(() => {
        const L = window.__smallprey, t = L.biggestTown();
        if (!t) return;
        window.__engine.cam.setView({ x: t.x, y: t.z, distance: 30, pitchDeg: 25 }, true);
        L.injectThreat(t.x - 20, t.z + 15, 6);
      });
    }
    if (minute % 5 === 0) {
      try {
        await page.locator('.tg-overlay button').first().click({ timeout: 5000 });
        await page.getByText('Small prey', { exact: false }).first().click({ timeout: 5000 });
        await page.waitForTimeout(3000);
        await page.locator('.tg-overlay button').first().click({ timeout: 5000 });
        await page.getByText('No overlay', { exact: false }).first().click({ timeout: 5000 });
      } catch (e) { log('overlay toggle skipped: ' + String(e.message).slice(0, 80)); }
    }
  }
  log(`done: ${errors.length} errors, ${warnings} warnings`);
  if (errors.length) { code = 1; for (const e of errors.slice(0, 20)) log(e); }
} catch (e) {
  log('FAILED ' + e);
  code = 1;
} finally {
  clearTimeout(kill);
  await browser.close();
  await server.close();
}
process.exit(code);
