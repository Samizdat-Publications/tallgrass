// R3 stills of the small-prey web (JPEG q90): a prairie dog town up close (mounds, sentinels), an alarm wave sequence, jackrabbits
// grazing and bounding, the town from the wide view, the graph with the new rows and the Small prey overlay.
//   node tools/r3_smallprey_stills.mjs --out review/wip/R3 [--tag a] [--only town,alarm,hares,graph,overlay] [--seed 3] [--size 1600x900]
// Runs the real game on the GPU in headless Chromium with the small-prey params on (?p=smallPrey:1). Reports page errors.
// Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R3'));
const tag = arg('tag', 'a');
const only = new Set(arg('only', 'town,alarm,hares,graph,overlay').split(','));
const seed = arg('seed', '3');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const kill = setTimeout(() => { console.error('r3_smallprey_stills: hard timeout'); process.exit(2); }, 14 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r3'),
  server: { port: 5900 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
  optimizeDeps: { entries: ['index.html'] }, logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, timeout: 120000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const errors = [];
let code = 0;
try {
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', (e) => errors.push('[exception] ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 300)); });
  await page.goto(base + `/index.html?autoscale=0&autocam=0&seed=${seed}&p=smallPrey:1`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log('GL renderer:', info);
  // pin the light and weather, then let a valley year pass so the towns are dug in and the hares have spread
  await page.evaluate(() => { const e = window.__engine; e.setEnv = () => {}; Object.assign(e.env, { dayFrac: 0.42, season: 1.2, weather: 0, rain: 0, windStrength: 0.25 }); e.applyEnvNow(); });
  await page.evaluate(() => { window.__speed(0); window.__step(3600); });
  await page.waitForTimeout(6000);
  await page.evaluate(() => { window.__speed(1); });
  await page.waitForTimeout(1500);
  // the puppets only exist near the camera, so go to the town first
  await page.evaluate(() => { const t = window.__smallprey.biggestTown(); if (t) window.__engine.cam.setView({ x: t.x, y: t.z, distance: 30, pitchDeg: 25 }, true); });
  await page.evaluate(() => { window.__smallprey.calm(); }); // a calm town: only the made-up threats below count
  // the page renders at a few frames a second in headless mode and the puppets' clock never runs faster than real time per frame,
  // so run 30 s of puppet time by hand: the dogs that were down for the real predators come up, then settle into their day
  await page.evaluate(async () => { for (let i = 0; i < 300; i++) { window.__engine.renderOnce(0.1); if (i % 25 === 24) await new Promise((r) => setTimeout(r, 10)); } });
  const town = await page.evaluate(() => window.__smallprey.biggestTown());
  console.log('town', JSON.stringify(town), JSON.stringify(await page.evaluate(() => window.__smallprey.debug())));
  const hideUi = () => page.addStyleTag({ content: '#ui { display: none !important; }' }).then((h) => h);
  const shot = async (name, js, wait = 2000) => {
    if (js) { const r = await page.evaluate(js); if (r !== undefined && r !== null) console.log(name, JSON.stringify(r)); }
    await page.waitForTimeout(wait);
    const p = `${out}/${tag}_${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
    console.log('saved', p, JSON.stringify(await page.evaluate(() => window.__smallprey.debug())));
  };
  const cam = (x, z, d, pitch, yaw) => `window.__engine.cam.setView({ x: ${x}, y: ${z}, distance: ${d}, pitchDeg: ${pitch}, yawDeg: ${yaw} }, true)`;
  const uiStyle = await hideUi();
  if (only.has('town') && town) {
    await shot('01_town_close', cam(town.x, town.z, 11, 16, 200), 2500);
    // the dog nearest the centre that is standing watch: close enough to see the sentinel
    const pick = (pose) => `(() => { const L = window.__smallprey; const ds = L.visibleDogs().filter((d) => (${pose} === -1 || d.pose === ${pose}) && (${pose} !== 0 || (d.u > 0.05 && d.u < 0.42))).sort((a, b) => Math.hypot(a.x - ${town.x}, a.z - ${town.z}) - Math.hypot(b.x - ${town.x}, b.z - ${town.z})); const d = ds[0]; if (!d) return { none: true }; window.__engine.cam.setView({ x: d.x, y: d.z, distance: 3.2, pitchDeg: 6, yawDeg: 50 }, true); return d; })()`;
    await shot('02_town_sentinel', pick(1), 1500);
    await shot('02b_town_forager', pick(0), 700);
    await shot('02c_town_groom_or_yip', pick(3), 1200);
    await shot('03_town_mid', cam(town.x, town.z, 38, 26, 150), 2500);
    await shot('04_town_wide', cam(town.x, town.z, 120, 32, 150), 2500);
  }
  if (only.has('alarm') && town) {
    // a dog standing watch, close up; a wolf walks in 10 m off: the wave sweeps from where it first comes within 40 m of the town
    const d0 = await page.evaluate(`(() => { const L = window.__smallprey; const ds = L.visibleDogs().filter((d) => d.pose === 1 && d.u >= 0).sort((a, b) => Math.hypot(a.x - ${town.x}, a.z - ${town.z}) - Math.hypot(b.x - ${town.x}, b.z - ${town.z})); return ds[0] || { x: ${town.x}, z: ${town.z} }; })()`);
    await page.evaluate(cam(d0.x, d0.z, 7, 11, 200));
    await page.waitForTimeout(1500);
    await page.evaluate(`window.__smallprey.injectThreat(${d0.x - 10}, ${d0.z + 8}, 9)`);
    for (const [i, t] of [[1, 150], [2, 700], [3, 1500], [4, 3500]]) await shot(`05_alarm_${i}_t${t}`, null, t === 150 ? 150 : t - [0, 150, 700, 1500][i - 1]);
    await page.waitForTimeout(12000);
    await shot('05_alarm_5_back', null, 4000);
  }
  if (only.has('hares')) {
    // a hare cell in short grass (they hide in the tall stuff): density against the biomass at its centre
    const hare = await page.evaluate(() => {
      const L = window.__smallprey, data = window.__engine.vegTexture.image.data;
      let best = null;
      for (let c = 0; c < 1024; c++) {
        const x = ((c % 32) + 0.5) * 16, z = (Math.floor(c / 32) + 0.5) * 16;
        const r = data[(Math.floor(z / 2) * 256 + Math.floor(x / 2)) * 4] / 255;
        const d = L.density(4, x, z), score = d * (1.2 - Math.min(1, r * 2));
        // no herd in the way: count the animals within 45 m
        let crowd = 0; const sn = window.__snap();
        for (let k = 0; k < sn.count; k++) { const o = k * 12; if (Math.hypot(sn.agents[o + 1] - x, sn.agents[o + 2] - z) < 45) crowd++; }
        if (L.density(7, x, z) < 0.3 && crowd < 3 && (!best || score > best.score)) best = { x, z, d, r, score, crowd };
      }
      return best;
    });
    console.log('hare cell', JSON.stringify(hare));
    // the hare nearest the cell centre, close up: grazing, then sitting up, then bounding away from a predator that walks in
    await page.evaluate(cam(hare.x, hare.z, 40, 20, 40));
    await page.waitForTimeout(2500);
    const near = (st) => `(() => { const hs = window.__smallprey.visibleHares().filter((h) => ${st} === -1 || h.st === ${st}).sort((a, b) => Math.hypot(a.x - ${hare.x}, a.z - ${hare.z}) - Math.hypot(b.x - ${hare.x}, b.z - ${hare.z})); const h = hs[0]; if (!h) return { none: true }; window.__engine.cam.setView({ x: h.x, y: h.z, distance: 4.5, pitchDeg: 9, yawDeg: 70 }, true); return h; })()`;
    await shot('06_hares_graze', near(0), 900);
    await shot('07_hares_sit', near(1), 900);
    // a hare that is grazing, then a predator 12 m off
    const h0 = await page.evaluate(near(-1));
    await page.evaluate(`window.__smallprey.injectThreat(${h0.x - 12}, ${h0.z + 5}, 6)`);
    await shot('08_hares_bound_1', `window.__engine.cam.setView({ x: ${h0.x}, y: ${h0.z}, distance: 14, pitchDeg: 16, yawDeg: 70 }, true)`, 450);
    await shot('08_hares_bound_2', null, 450);
    await shot('08_hares_bound_3', null, 450);
  }
  await uiStyle.evaluate((el) => el.remove());
  if (only.has('graph')) {
    await page.evaluate(`window.__engine.cam.preset('wide', true)`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${tag}_09_ui_strip.jpg`, type: 'jpeg', quality: 90 });
    await page.keyboard.press('g');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${tag}_10_graph_expanded.jpg`, type: 'jpeg', quality: 90 });
    await page.keyboard.press('g');
    console.log('saved graph shots');
  }
  if (only.has('overlay')) {
    await page.evaluate(`window.__engine.cam.preset('top', true)`);
    await page.waitForTimeout(800);
    await page.locator('.tg-overlay button').first().click();
    await page.waitForTimeout(400);
    await page.getByText('Small prey', { exact: false }).first().click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/${tag}_11_overlay_smallprey.jpg`, type: 'jpeg', quality: 90 });
    console.log('saved overlay shot');
  }
} catch (e) {
  console.error('FAILED', e);
  code = 1;
} finally {
  clearTimeout(kill);
  console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
  await server.close();
}
process.exit(code);
