// Readability stills (r-readable): the follow camera on a wolf (in a hunt if one is on), a pronghorn, a coyote and a bison, plus the
// default wide / golden / herd views, as JPEG q88, with the UI hidden so the frame is judged on the animals alone. One page load.
//
//   node tools/readable_shots.mjs --out review/wip/readable/after [--root dir] [--ui 0|1] [--only wolf,pronghorn,...] [--legacy40 1]
//
// --legacy40 1 sets distance 40 / pitch 20 after the follow call (the way the review rounds' stills did it), so an old build and a
// new one can be compared on the same shot. Writes shots.json (the subject's screen position and size per shot) next to the stills.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const out = resolve(arg('out', 'scratch/rd/shots'));
const ui = arg('ui', '0') === '1';
const legacy40 = arg('legacy40', '0') === '1';
const only = arg('only', '') ? arg('only', '').split(',') : null;
mkdirSync(out, { recursive: true });
const kill = setTimeout(() => { console.error('readable_shots: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve('scratch/_vitecache_readable'),
  server: { port: 5900 + Math.floor(Math.random() * 500), strictPort: false, hmr: false, fs: { strict: false }, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
const report = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[page exception]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 300)); } });
  await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
  if (!ui) await page.addStyleTag({ content: '#ui { display: none !important; }' });
  await page.waitForTimeout(1500);
  const shot = async (name) => page.screenshot({ path: resolve(out, name + '.jpg'), type: 'jpeg', quality: 88 });
  // where the followed animal is on screen (ndc, 0..1 from the top-left), and its apparent length in px
  const probe = (id) => page.evaluate((id) => {
    const e = window.__engine, THREE_V = e.camera.position.clone();
    const ok = window.__animals.getPosition(id, THREE_V);
    if (!ok) return null;
    const p = THREE_V.clone().project(e.camera);
    const W = e.renderer.domElement.width, H = e.renderer.domElement.height;
    const cam = e.cam;
    return { sx: +((p.x + 1) / 2).toFixed(3), sy: +((1 - p.y) / 2).toFixed(3), dist: +cam.distance.toFixed(1), pitch: +cam.pitchDeg.toFixed(1), yaw: +cam.yawDeg.toFixed(1), W, H };
  }, id);

  const want = (n) => !only || only.includes(n);
  // the fixed views (default-distance readability)
  const views = [
    ['wide_golden', "Object.assign(__engine.env, { dayFrac: 0.3, season: 1.8, weather: 0 }); __engine.applyEnvNow(); __engine.cam.preset('wide', true)"],
    ['herd_golden', "__engine.applyEnvNow(); __focusHerd(); __engine.cam.setView({ distance: 90, pitchDeg: 26 }, true)"],
    ['mid_60m', "__engine.applyEnvNow(); __focusHerd(); __engine.cam.setView({ distance: 55, pitchDeg: 18 }, true)"],
    ['low_golden', "__engine.cam.preset('low', true)"],
  ];
  await page.evaluate('window.__speed(1)');
  for (const [name, code] of views) {
    if (!want(name)) continue;
    await page.evaluate(code);
    await page.waitForTimeout(2500);
    await shot(name);
  }

  const findId = (sp, states) => page.evaluate(([sp, states]) => {
    for (const st of states) { const c = st === null ? window.__find(sp) : window.__find(sp, st); if (c.length) return c[0]; }
    return null;
  }, [sp, states]);
  // (the wolf search runs the sim fast and takes a while, so it goes last; the day, season and weather are pinned throughout)
  const follows = [
    ['pronghorn', 3, [3, 4, 2, null], 'pronghorn'],
    ['coyote', 6, [3, 2, null], 'coyote'],
    ['bison', 0, [2, 1, null], 'bison'],
    ['muledeer', 10, [2, 1, null], 'mule deer'],
    ['wolf', 1, [5, 10, 3, null], 'wolf in a hunt'],
  ];
  await page.evaluate("window.__pin = setInterval(() => { Object.assign(__engine.env, { dayFrac: 0.33, season: 1.8, weather: 0 }); __engine.applyEnvNow(); }, 150)");
  for (const [name, sp, states] of follows) {
    if (!want(name)) continue;
    // let the sim run fast until the wanted state exists (a hunt may not be on yet)
    let id = null;
    await page.evaluate('window.__speed(10)');
    for (let i = 0; i < (name === 'wolf' ? 120 : 2) && id === null; i++) {
      id = await findId(sp, name === 'wolf' ? [5, 10] : states.slice(0, -1).length ? states.slice(0, -1) : states);
      if (id === null) await page.waitForTimeout(name === 'wolf' ? 400 : 1500);
    }
    if (id === null) id = await findId(sp, [null]);
    if (id === null) { console.log('no animal for', name); continue; }
    await page.evaluate(([id, legacy40]) => { window.__speed(1); window.__engine.cam.preset('wide', true); window.__select(id); window.__followId(id); if (legacy40) window.__engine.cam.setView({ distance: 40, pitchDeg: 20 }); }, [id, legacy40]);
    const t0 = Date.now();
    const times = [1500, 4500, 8000];
    report[name] = { id, shots: [] };
    for (let k = 0; k < times.length; k++) {
      const wait = times[k] - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      await shot(`follow_${name}_${k}`);
      report[name].shots.push({ t: times[k], ...(await probe(id)) });
    }
  }
  writeFileSync(resolve(out, 'shots.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report));
  console.log('shots in', out, 'errors:', errors.length);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(0);
