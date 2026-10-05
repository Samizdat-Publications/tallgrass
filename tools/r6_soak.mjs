// R6 soak: the real game on the GPU at 10x with the mule deer and the cougars on (muledeer.initial, cougar.initial, the open prairie), for N
// minutes (default 10), counting console errors and page exceptions. Every minute the camera visits a deer or a cougar (the near LOD, the
// antlers, the stotting gait and the ambush pose run), and fps, tick and the populations are logged.
//   node tools/r6_soak.mjs [minutes] [--out scratch/r6_soak.log]
// Exit code 0 when there were no errors, 1 otherwise. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const minutes = Number(argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 10);
const outIdx = argv.indexOf('--out');
const logPath = resolve(outIdx >= 0 ? argv[outIdx + 1] : 'scratch/r6_soak.log');
writeFileSync(logPath, `soak ${minutes} min, start ${new Date().toISOString()}\n`);
const log = (s) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(line); appendFileSync(logPath, line + '\n'); };

const kill = setTimeout(() => { log('HARD TIMEOUT'); process.exit(2); }, (minutes + 12) * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r6'),
  server: { port: 6500 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => { errors.push('[exception] ' + e.message.slice(0, 300)); log('PAGE ERROR ' + e.message.slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push('[console.error] ' + m.text().slice(0, 300)); log('CONSOLE ERROR ' + m.text().slice(0, 200)); } });
  await page.goto(base + '/index.html?autoscale=1&seed=3&speed=10&p=smallPrey:1,muledeer.initial:40,cougar.initial:4,openPrairie:1', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.mouse.click(640, 360); // unlock audio
  log('ready');
  const t0 = Date.now();
  let minute = 0;
  while (Date.now() - t0 < minutes * 60 * 1000) {
    await page.waitForTimeout(60000);
    minute++;
    const s = await page.evaluate(() => {
      const sn = window.__snap();
      const pick = (sp) => { const r = []; for (let k = 0; k < sn.count; k++) if (sn.agents[k * 12] === sp) r.push(k); return r; };
      // visit a deer (every other minute one that is fleeing, when there is one) or a cougar
      const sp = (window.__minute ?? 0) % 2 === 0 ? 5 : 10;
      let ks = pick(sp);
      if (sp === 10) { const fl = ks.filter((k) => (sn.agents[k * 12 + 8] & 128) !== 0); if (fl.length) ks = fl; }
      if (ks.length) { const k = ks[Math.floor(Math.random() * ks.length)]; window.__followId(sn.ids[k]); window.__engine.cam.setView({ distance: sp === 5 ? 9 : 10, pitchDeg: 14 }, true); }
      window.__minute = (window.__minute ?? 0) + 1;
      return { fps: window.__fps, tick: sn.tick, season: +sn.env.season.toFixed(2), pop: Array.from(sn.pop), visited: sp + ':' + ks.length };
    });
    log(`min ${minute}: ${JSON.stringify(s)}`);
  }
  log(`done: ${errors.length} errors`);
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
