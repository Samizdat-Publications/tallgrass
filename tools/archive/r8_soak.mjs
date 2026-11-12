// R8 soak: the real game on the GPU, first a few minutes at 1x (the behaviours run only at up to 3x: wallows, rubs, spars, bellows, play, howls),
// then N minutes at 10x (the default 10), counting console errors and page exceptions. Every minute the camera visits a bison, a wolf, a pronghorn or a
// raven (the near LOD, the new poses), and fps, tick, the populations and the layer's behaviour counters are logged.
//   node tools/r8_soak.mjs [minutes at 10x] [--slow 3] [--out scratch/r8_soak.log] [--dir <projectDir>]
// Exit code 0 when there were no errors, 1 otherwise. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const minutes = Number(argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 10);
const slow = Number(arg('slow', 3));
const logPath = resolve(arg('out', 'scratch/r8_soak.log'));
if (arg('dir', '')) process.chdir(resolve(arg('dir', '')));
writeFileSync(logPath, `soak ${slow} min at 1x then ${minutes} min at 10x, start ${new Date().toISOString()}\n`);
const log = (s) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(line); appendFileSync(logPath, line + '\n'); };

const kill = setTimeout(() => { log('HARD TIMEOUT'); process.exit(2); }, (minutes + slow + 12) * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r8soak'),
  server: { port: 6800 + Math.floor(Math.random() * 300), hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/.venv/**', '**/dist/**', '**/node_modules/**', '**/.claude/**'] } },
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
  await page.goto(base + '/index.html?autoscale=1&seed=3&speed=1&p=smallPrey:1,coyote.initial:12,cougar.initial:4,openPrairie:1,raptors:1,muledeer.initial:20', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.mouse.click(640, 360); // unlock audio
  log('ready');
  const visit = () => page.evaluate(() => {
    const sn = window.__snap();
    const pick = (sp) => { const r = []; for (let k = 0; k < sn.count; k++) if (sn.agents[k * 12] === sp) r.push(k); return r; };
    const order = [0, 1, 3, 2, 6, 0];
    const sp = order[(window.__minute ?? 0) % order.length];
    const ks = pick(sp);
    if (ks.length) { const k = ks[Math.floor(Math.random() * ks.length)]; window.__followId(sn.ids[k]); window.__engine.cam.setView({ distance: sp === 0 ? 14 : 8, pitchDeg: 14 }, true); }
    window.__minute = (window.__minute ?? 0) + 1;
    return { fps: window.__fps, tick: sn.tick, season: +sn.env.season.toFixed(2), pop: Array.from(sn.pop), visited: sp + ':' + ks.length, beh: window.__animals.behSeen };
  });
  let minute = 0;
  let t0 = Date.now();
  while (Date.now() - t0 < slow * 60 * 1000) {
    await page.waitForTimeout(60000);
    log(`1x min ${++minute}: ${JSON.stringify(await visit())}`);
  }
  await page.evaluate(() => window.__speed(10));
  log('speed 10');
  minute = 0;
  t0 = Date.now();
  while (Date.now() - t0 < minutes * 60 * 1000) {
    await page.waitForTimeout(60000);
    log(`10x min ${++minute}: ${JSON.stringify(await visit())}`);
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
