// r-feet: the coyote's mousing leap as an 8 fps film strip (a frame every 0.125 s of the leap timer, from the first frame of the sequence).
//   node tools/rfeet_leap.mjs --out review/wip/r-feet/leap --tag after [--seed 3] [--frames 20]
// (derived from tools/r3_coyote_stills.mjs; run from the checkout whose build you want to see: the current tree has the crouch, a main checkout does not)
// Runs the real game on the GPU in headless Chromium with the coyote and small-prey params on (?p=coyote.initial:12,smallPrey:1). Situations that
// are rare in a live run (a coyote mousing, one at rest at dusk, a mangy one, a group of migrants) are staged by editing the latest snapshot in
// the page (render only; the sim never sees it), then letting the layer run for a while. Reports page errors. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R3/coyote'));
const tag = arg('tag', 'a');
const NF = Number(arg('frames', '20'));
const seed = arg('seed', '3');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const kill = setTimeout(() => { console.error('rfeet_leap: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-rfeet'),
  server: { port: 6100 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
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
  await page.goto(base + `/index.html?autoscale=0&autocam=0&seed=${seed}&p=coyote.initial:12,smallPrey:1`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log('GL renderer:', info);
  // pin the light and weather, let a little valley time pass so the coyotes have settled into dens, then stop the sim: the stages stage things on the frozen snapshot
  await page.evaluate(() => { const e = window.__engine; e.setEnv = () => {}; Object.assign(e.env, { dayFrac: 0.42, season: 1.2, weather: 0, rain: 0, windStrength: 0.25 }); e.applyEnvNow(); });
  await page.evaluate(() => { window.__speed(0); window.__step(1500); });
  await page.waitForTimeout(5000);
  // the layer runs on a constant clock whatever the sim speed, and the snapshot stays put
  await page.evaluate(() => {
    Object.defineProperty(window.__animals, 'timeScale', { get: () => 1, set: () => {} });
    window.__engine.stop(); // only the frames the stages ask for run: the animation clock moves exactly as far as each stage steps it
    window.__stage = {
      snap: () => window.__animals.curr,
      // the animals of a species (and state) that have nothing else within `clear` metres: a clean backdrop for a close-up
      alone: (sp, st, clear = 28) => { const s = window.__animals.curr, r = []; for (let k = 0; k < s.count; k++) { const o = k * 12; if (s.agents[o] !== sp || (st !== undefined && s.agents[o + 7] !== st)) continue; let ok = true; for (let j = 0; j < s.count && ok; j++) { if (j === k) continue; const q = j * 12; if (Math.hypot(s.agents[q + 1] - s.agents[o + 1], s.agents[q + 2] - s.agents[o + 2]) < clear && s.agents[q] !== 7 && s.agents[q] !== 4) ok = false; } if (ok) r.push(k); } return r; },
      idx: (sp, st) => { const s = window.__animals.curr, r = []; for (let k = 0; k < s.count; k++) { const o = k * 12; if (s.agents[o] === sp && (st === undefined || s.agents[o + 7] === st)) r.push(k); } return r; },
      get: (k) => { const s = window.__animals.curr, o = k * 12; return { k, id: s.ids[k], x: s.agents[o + 1], z: s.agents[o + 2], h: s.agents[o + 3], spd: s.agents[o + 4], sc: s.agents[o + 5], st: s.agents[o + 7], fl: s.agents[o + 8], en: s.agents[o + 10] }; },
      set: (k, o2) => { const s = window.__animals.curr, o = k * 12; for (const [f, v] of Object.entries(o2)) s.agents[o + { x: 1, z: 2, h: 3, spd: 4, sc: 5, coat: 6, st: 7, fl: 8, alt: 9, en: 10 }[f]] = v; },
      frames: async (n, dt = 0.1) => { for (let i = 0; i < n; i++) { window.__engine.renderOnce(dt); if (i % 20 === 19) await new Promise((r) => setTimeout(r, 5)); } },
      sunYaw: () => { const l = window.__engine.uniforms.lightDir.value; return Math.atan2(l.x, l.z) * 57.3; },
      look: (x, z, d, pitch, yaw) => window.__engine.cam.setView({ x, y: z, distance: d, pitchDeg: pitch, yawDeg: yaw }, true),
    };
  });
  const sp = await page.evaluate(() => ({ coyotes: window.__stage.idx(6).length, wolves: window.__stage.idx(1).length, pop: Array.from(window.__snap().pop) }));
  console.log('population', JSON.stringify(sp));
  const hideUi = () => page.addStyleTag({ content: '#ui { display: none !important; }' });
  const uiStyle = await hideUi();
  const shot = async (name, wait = 250) => {
    await page.evaluate(() => window.__stage.frames(8, 0.001)); // let the temporal AA settle
    await page.waitForTimeout(wait);
    const p = `${out}/${tag}_${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90 });
    console.log('saved', p);
  };
  const first = async (sp2, st) => page.evaluate(([a, b]) => { const r = window.__stage.alone(a, b); const r2 = r.length ? r : window.__stage.idx(a, b); return r2.length ? window.__stage.get(r2[0]) : null; }, [sp2, st]);


  // the coyote standing highest (so on dry grass, not in the creek) with nothing else near
  const c = await page.evaluate(() => {
    const S = window.__stage, A = window.__animals, v = new (window.__engine.camera.position.constructor)();
    let best = null;
    for (const k of S.idx(6)) {
      const g = S.get(k);
      A.getPosition(g.id, v);
      if (!best || v.y > best.y) best = { ...g, y: v.y };
    }
    return best;
  });
  if (!c) throw new Error('no coyote');
  await page.evaluate((c2) => { window.__stage.set(c2.k, { st: 10, spd: 0 }); window.__leapC = c2; }, c);
  // follow the coyote until the leap starts (the layer only keeps the animals near the camera), then hold a camera at right angles to its heading,
  // aimed at the middle of the leap, so the leap runs across the frame
  const t0 = await page.evaluate(async () => {
    const S = window.__stage, A = window.__animals, c2 = window.__leapC;
    const slot = A.slots.map.get(c2.id);
    const v = new (window.__engine.camera.position.constructor)();
    const h = S.get(c2.k).h, yaw = -h * 57.2958 + 180;
    window.__focus = () => { A.getPosition(c2.id, v); S.look(v.x + Math.cos(h) * 0.5, v.z + Math.sin(h) * 0.5, 6.5, 8, yaw); };
    A.getPosition(c2.id, v);
    const tx = v.x, tz = v.z;
    window.__focus = () => { S.look(tx + Math.cos(h) * 0.5, tz + Math.sin(h) * 0.5, 6.5, 8, yaw); };
    window.__focus();
    let n = 0;
    while (A.cn.leapT[slot] < 0 && n++ < 2000) { await S.frames(1, 0.02); window.__focus(); }
    return A.cn.leapT[slot];
  });
  console.log('leap timer at start', t0);
  for (let k = 0; k < NF; k++) {
    const target = k * 0.125;
    const tt = await page.evaluate(async (tg) => {
      const S = window.__stage, A = window.__animals, c2 = window.__leapC;
      const slot = A.slots.map.get(c2.id);
      let n = 0;
      while (A.cn.leapT[slot] >= 0 && A.cn.leapT[slot] < tg && n++ < 200) { await S.frames(1, 0.005); window.__focus(); }
      window.__focus();
      await S.frames(6, 0.0005);
      return { t: A.cn.leapT[slot], slot, sl: A.slots.map.size, id: c2.id, has: A.slots.map.has(c2.id) };
    }, target);
    await page.waitForTimeout(40);
    await page.screenshot({ path: `${out}/${tag}_leap_${String(k).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 90, clip: { x: W / 2 - 360, y: H / 2 - 300, width: 720, height: 520 } });
    console.log('frame', k, JSON.stringify(tt));
  }
  for (const er of errors) console.log(er);
} catch (e) {
  console.error('rfeet_leap failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
