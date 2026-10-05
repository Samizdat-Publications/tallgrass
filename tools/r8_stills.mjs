// R8 behaviour-library stills and strips (JPEG q90): bison wallow, tree rub, snow dig, spar, bellow and calf play; the wolf howl chorus at dusk,
// pup play and scent marking; the pronghorn rump flare; a raptor's preen; a raven's roll.
//   node tools/r8_stills.mjs --out review/wip/R8 [--tag a] [--only wallow,rub,dig,spar,bellow,calf,howl,pup,mark,flare,preen,roll] [--seed 3] [--size 1600x900]
// Runs the real game on the GPU in headless Chromium. Situations that are rare in a live run are staged by editing the latest snapshot in the page
// (render only; the sim never sees it) and by moving the layer's clock to the start of the animal's session (the behaviours are a schedule that is a pure
// function of the animal's id and that clock: see sessionAt in src/render/behaviours.ts, copied below). Reports page errors. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R8'));
const dirArg = arg('dir', ''); // run against another checkout of the project (a before and after)
if (dirArg) process.chdir(resolve(dirArg));
const tag = arg('tag', 'a');
const only = new Set(arg('only', 'wallow,rub,dig,spar,bellow,calf,howl,pup,mark,flare,preen,roll').split(','));
const seed = arg('seed', '3');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const kill = setTimeout(() => { console.error('r8_stills: hard timeout'); process.exit(2); }, 30 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r8s'),
  server: { port: 6400 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**'] } },
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
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('[console.' + m.type() + '] ' + m.text().slice(0, 300)); });
  await page.goto(base + `/index.html?autoscale=0&autocam=0&seed=${seed}&p=coyote.initial:12,cougar.initial:4`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log('GL renderer:', info);
  await page.evaluate(() => { const e = window.__engine; e.setEnv = () => {}; Object.assign(e.env, { dayFrac: 0.42, season: 1.4, weather: 0, rain: 0, windStrength: 0.25 }); e.applyEnvNow(); });
  await page.evaluate(() => { window.__speed(0); window.__step(1500); });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    Object.defineProperty(window.__animals, 'timeScale', { get: () => 1, set: () => {} });
    window.__engine.stop(); // only the frames the stages ask for run: the animation clock moves exactly as far as each stage steps it
    // the schedule of src/render/behaviours.ts (sessionAt), so a stage can move the clock to the start of an animal's session
    const hash01 = (n) => (Math.imul(n | 0, 0x9e3779b1) >>> 8) / 16777216;
    const sessionAt = (id, salt, clock, pMin, pMax, prob, dMin, dMax = dMin, o) => {
      const per = Math.max(dMax + 0.5, pMin + (pMax - pMin) * hash01(id * 7 + salt * 131 + 1));
      const t = clock + hash01(id * 13 + salt * 17 + 5) * per;
      const n = Math.floor(t / per);
      if (hash01(Math.imul(n, 7919) + id * 31 + salt * 977 + 3) >= prob) return -1;
      const len = dMin + (dMax - dMin) * hash01(Math.imul(n, 6007) + id * 5 + salt * 53 + 11);
      const tau = t - n * per - (per - len) * hash01(Math.imul(n, 104729) + id * 3 + salt * 61 + 9);
      if (o) { o.len = len; o.n = n; }
      return tau >= 0 && tau < len ? tau : -1;
    };
    window.__stage = {
      snap: () => window.__animals.curr,
      alone: (sp, st, clear = 28, ok = [7, 4]) => { const s = window.__animals.curr, r = []; for (let k = 0; k < s.count; k++) { const o = k * 12; if (s.agents[o] !== sp || (st !== undefined && s.agents[o + 7] !== st)) continue; let good = true; for (let j = 0; j < s.count && good; j++) { if (j === k) continue; const q = j * 12; if (Math.hypot(s.agents[q + 1] - s.agents[o + 1], s.agents[q + 2] - s.agents[o + 2]) < clear && !ok.includes(s.agents[q])) good = false; } if (good) r.push(k); } return r; },
      idx: (sp, st) => { const s = window.__animals.curr, r = []; for (let k = 0; k < s.count; k++) { const o = k * 12; if (s.agents[o] === sp && (st === undefined || s.agents[o + 7] === st)) r.push(k); } return r; },
      get: (k) => { const s = window.__animals.curr, o = k * 12; return { k, id: s.ids[k], sp: s.agents[o], x: s.agents[o + 1], z: s.agents[o + 2], h: s.agents[o + 3], spd: s.agents[o + 4], sc: s.agents[o + 5], st: s.agents[o + 7], fl: s.agents[o + 8], alt: s.agents[o + 9], en: s.agents[o + 10] }; },
      set: (k, o2) => { const s = window.__animals.curr, o = k * 12; for (const [f, v] of Object.entries(o2)) s.agents[o + { sp: 0, x: 1, z: 2, h: 3, spd: 4, sc: 5, coat: 6, st: 7, fl: 8, alt: 9, en: 10 }[f]] = v; },
      frames: async (n, dt = 0.1) => { for (let i = 0; i < n; i++) { window.__engine.renderOnce(dt); if (i % 20 === 19) await new Promise((r) => setTimeout(r, 5)); } },
      // camera yaw (deg) that puts the camera `rel` degrees round the animal of this id from straight behind it (0 behind, 90 on its left, 180 in front, -90 on its right); the camera sits at target + d (sin yaw, cos yaw)
      yawFor: (id, rel) => { const A = window.__animals, s = A.slots.map.get(id); const h = A.slots.hs[s]; const c = h + Math.PI - (rel * Math.PI) / 180; return Math.atan2(Math.cos(c), Math.sin(c)) * 57.2958; },
      camYaw: (id, v) => (v.rel !== undefined ? window.__stage.yawFor(id, v.rel) : window.__stage.sunYaw() + v.yaw),
      sunYaw: () => { const l = window.__engine.uniforms.lightDir.value; return Math.atan2(l.x, l.z) * 57.3; },
      look: (x, z, d, pitch, yaw, lift) => { const e = window.__engine; e.cam.setView({ x, y: z, distance: d, pitchDeg: pitch, yawDeg: yaw }, true); if (lift !== undefined) e.cam.goal.lift = lift; },
      // move the layer clock to `lead` seconds before the id's next session of this kind starts; returns the session's length
      toSession: (id, salt, p0, p1, prob, d0, d1 = d0, lead = 0.3) => {
        const A = window.__animals, o = { len: 0, n: 0 };
        let c = A.clock;
        for (let i = 0; i < 40000; i++) {
          if (sessionAt(id, salt, c, p0, p1, prob, d0, d1, o) >= 0) {
            // walk back to the start of this session
            let t = c; while (sessionAt(id, salt, t - 0.05, p0, p1, prob, d0, d1) >= 0) t -= 0.05;
            A.clock = t - lead; return { start: t, len: o.len };
          }
          c += 0.25;
        }
        return null;
      },
      sess: sessionAt,
    };
  });
  const hideUi = () => page.addStyleTag({ content: '#ui { display: none !important; }' });
  await hideUi();
  const shot = async (name, wait = 120, clip) => {
    await page.evaluate(() => window.__stage.frames(6, 0.001)); // let the temporal AA settle
    await page.waitForTimeout(wait);
    const p = `${out}/${tag}_${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90, ...(clip ? { clip } : {}) });
    console.log('saved', p);
  };
  const sp = await page.evaluate(() => ({ bison: window.__stage.idx(0).length, wolves: window.__stage.idx(1).length, pronghorn: window.__stage.idx(3).length, ravens: window.__stage.idx(2).length, eagles: window.__stage.idx(8).length, hawks: window.__stage.idx(9).length }));
  console.log('population', JSON.stringify(sp));
  const env = (o) => page.evaluate((o2) => { const e = window.__engine; Object.assign(e.env, o2); e.applyEnvNow(); if (o2.season !== undefined) window.__animals.seasonOverride = o2.season; }, o);
  // a view that follows the animal (by id) for `secs` seconds of layer time, taking a frame at each of the `marks` (seconds into the session)
  const follow = async (name, id, t0, marks, view, opts = {}) => {
    for (const m of marks) {
      await page.evaluate(async ({ id2, t02, m2, view2 }) => {
        const S = window.__stage, A = window.__animals;
        const v = new (window.__engine.camera.position.constructor)();
        let n = 0;
        while (A.clock < t02 + m2 && n++ < 4000) {
          await S.frames(1, 0.05);
          A.getPosition(id2, v); S.look(v.x, v.z, view2.d, view2.pitch, S.camYaw(id2, view2), view2.lift);
        }
        A.getPosition(id2, v); S.look(v.x, v.z, view2.d, view2.pitch, S.camYaw(id2, view2), view2.lift);
        await S.frames(2, 0.001);
      }, { id2: id, t02: t0, m2: m, view2: view });
      const pr = await page.evaluate((id2) => { const A = window.__animals, s = A.slots.map.get(id2), b = A.beh, c = A.cn; const f = (v) => (v === undefined ? null : +v.toFixed(2)); return { clock: f(A.clock), now: b.lastNow?.[s], wal: f(b.wallow?.[s]), rub: f(b.rub?.[s]), spar: f(b.spar?.[s]), dig: f(b.dig?.[s]), bel: f(b.bellow?.[s]), ply: f(b.play?.[s]), ox: f(b.ox?.[s]), oz: f(b.oz?.[s]), rubOk: b.rubOk?.[s], rubSet: b.rubSet?.[s], rubX: f(b.rubX?.[s]), rubWin: b.rubWin?.[s], px: f(A.slots.px[s]), pz: f(A.slots.pz[s]), nTrees: b.trees.n, tn: (() => { const o = { x: 0, z: 0, r: 0 }; return b.trees.nearest(A.slots.px[s], A.slots.pz[s], 2.95, o) ? [f(o.x), f(o.z), f(o.r)] : null; })(), howl: f(c.howl?.[s]), mark: f(c.mark?.[s]), qx: f(c.qx?.[s]), qz: f(c.qz?.[s]), partner: b.pSlot?.[s] >= 0 ? { now: b.lastNow[b.pSlot[s]], spar: f(b.spar[b.pSlot[s]]), ox: f(b.ox[b.pSlot[s]]), oz: f(b.oz[b.pSlot[s]]), px: f(A.slots.px[b.pSlot[s]]), pz: f(A.slots.pz[b.pSlot[s]]), hs: f(A.slots.hs[b.pSlot[s]]) } : null, hs: f(A.slots.hs[s]) }; }, id);
      console.log(' ', name, m, JSON.stringify(pr));
      await shot(`${name}_t${String(Math.round(m * 10)).padStart(3, '0')}`, 60, opts.clip);
      if (opts.view2) {
        await page.evaluate(({ id2, v2 }) => { const S = window.__stage, A = window.__animals; const v = new (window.__engine.camera.position.constructor)(); A.getPosition(id2, v); S.look(v.x, v.z, v2.d, v2.pitch, S.camYaw(id2, v2), v2.lift); }, { id2: id, v2: opts.view2 });
        await page.evaluate(() => window.__stage.frames(2, 0.001));
        await shot(`${name}_t${String(Math.round(m * 10)).padStart(3, '0')}b`, 60, opts.clip);
      }
    }
  };
  const first = (spc, st, clear) => page.evaluate(([a, b, c]) => { const r = window.__stage.alone(a, b, c); const r2 = r.length ? r : window.__stage.idx(a, b); return r2.length ? window.__stage.get(r2[0]) : null; }, [spc, st, clear]);
  const clearSurround = (c, rad = 14, keep = []) => page.evaluate(([c2, r2, keep2]) => {
    // park the other animals of the big species well out of the shot (render only): nothing within r2 m of c2 except `keep2` ids
    const S = window.__stage, s = window.__animals.curr;
    for (let k = 0; k < s.count; k++) { if (k === c2.k || keep2.includes(s.ids[k])) continue; const g = S.get(k); if (g.sp === 2 || g.sp === 8 || g.sp === 9 || g.sp === 4 || g.sp === 7) continue; if (Math.hypot(g.x - c2.x, g.z - c2.z) < r2) { const a = Math.atan2(g.z - c2.z, g.x - c2.x); S.set(k, { x: c2.x + Math.cos(a) * (r2 + 6), z: c2.z + Math.sin(a) * (r2 + 6) }); } }
  }, [c, rad, keep]);

  if (only.has('wallow')) {
    // a bison standing on bare dry ground in summer: it lies down and rolls over onto its side and back, legs kicking, dust rising
    await env({ dayFrac: 0.44, season: 1.4, weather: 0 });
    await page.evaluate(() => { const A = window.__animals; A.bareGrass0 = 5; A.bareGrass1 = 6; A.dryOverride = 1; window.__engine.sm.snow = 0; });
    const c = await first(0, 1, 30);
    if (c) {
      await page.evaluate((c2) => { const S = window.__stage; S.set(c2.k, { st: 1, spd: 0, fl: 0 }); }, c);
      await clearSurround(c);
      const ses = await page.evaluate((c2) => window.__stage.toSession(c2.id, 11, 55, 120, 0.4, 13, 18), c);
      console.log('wallow session', JSON.stringify(ses));
      await follow('01_wallow', c.id, ses.start, [0.5, 2.6, 4.4, 6.2, 8.0, 9.8, 11.6, ses.len - 0.2], { d: 6, pitch: 24, rel: -60, lift: 0.3 }, { view2: { d: 7, pitch: 12, rel: 60, lift: 0.2 } });
    }
    await page.evaluate(() => { const A = window.__animals; A.bareGrass0 = 0.1; A.bareGrass1 = 0.45; A.dryOverride = null; });
  }

  if (only.has('rub')) {
    await env({ dayFrac: 0.44, season: 1.4, weather: 0 });
    const r = await page.evaluate(() => {
      const S = window.__stage, A = window.__animals, w = window.__engine.world;
      const bs = S.idx(0);
      if (!bs.length) return null;
      // the tree nearest the middle of the valley with some open ground round it
      let best = -1, bd = 1e9;
      for (let k = 0; k < w.trees.length; k += 4) { const d = Math.hypot(w.trees[k] - 256, w.trees[k + 1] - 256); if (d < bd && w.trees[k + 2] > 8) { bd = d; best = k; } }
      const tx = w.trees[best], tz = w.trees[best + 1];
      const k = bs[0], g = S.get(k);
      S.set(k, { x: tx + 2.5, z: tz + 0.7, st: 1, spd: 0, fl: 0 });
      return { id: g.id, k, tx, tz, h: w.trees[best + 2] };
    });
    if (r) {
      const c = await page.evaluate((k) => window.__stage.get(k), r.k);
      await clearSurround(c, 16);
      await page.evaluate(() => window.__stage.frames(60, 0.1)); // (the animal was moved: let its drawn position settle before the session looks for the tree)
      const ses = await page.evaluate((id) => window.__stage.toSession(id, 12, 28, 60, 0.6, 12, 16), r.id);
      console.log('rub session', JSON.stringify({ ...r, ...ses }));
      // the tree is found once per window: the session only runs if a trunk is within reach, which it is by construction
      await follow('02_rub', r.id, ses.start, [1.0, 3.4, 5.0, 6.6, 8.2, 9.8, ses.len - 1.0], { d: 7, pitch: 12, rel: 90, lift: 0.8 });
    }
  }

  if (only.has('dig')) {
    // winter: a bison grazing in snow swings its head from side to side
    await page.evaluate(() => { const e = window.__engine; Object.assign(e.env, { dayFrac: 0.42, season: 3.35, weather: 4, rain: 0, windStrength: 0.3 }); e.applyEnvNow(); window.__animals.seasonOverride = 3.35; e.sm.snow = 1; e.snowfallSm = 0; for (let i = 0; i < 6; i++) { e.sm.snow = 1; e.renderOnce(0.016); } });
    const c = await first(0, 1, 30);
    if (c) {
      await page.evaluate((c2) => { window.__stage.set(c2.k, { st: 1, spd: 0, fl: 0 }); }, c);
      await clearSurround(c);
      await page.evaluate(async (c2) => { const S = window.__stage; S.look(c2.x, c2.z, 7.5, 14, S.sunYaw() + 50, 0.5); await S.frames(30, 0.05); window.__engine.sm.snow = 1; }, c);
      const t0 = await page.evaluate(() => window.__animals.clock);
      await follow('03_dig', c.id, t0, [0.0, 0.4, 0.8, 1.2, 1.7, 2.2, 2.7, 3.4], { d: 6.5, pitch: 16, rel: -50, lift: 0.6 });
      console.log('snow uniform', await page.evaluate(() => window.__engine.uniforms.snow.value));
    }
  }

  if (only.has('spar')) {
    await env({ dayFrac: 0.44, season: 1.4, weather: 0 });
    await page.evaluate(() => { window.__engine.sm.snow = 0; });
    const r = await page.evaluate(() => {
      const S = window.__stage, s = window.__animals.curr;
      const bulls = S.idx(0).filter((k) => { const g = S.get(k); return (g.fl & 8) && !(g.fl & 1); });
      if (bulls.length < 2) return null;
      const a = S.get(bulls[0]);
      S.set(bulls[0], { st: 1, spd: 0, h: 0.3 });
      S.set(bulls[1], { x: a.x + 5.0 * Math.cos(0.4), z: a.z + 5.0 * Math.sin(0.4), st: 1, spd: 0, h: 2.6 });
      return { a: S.get(bulls[0]), b: S.get(bulls[1]) };
    });
    if (r) {
      await clearSurround(r.a, 18, [r.b.id]);
      // let the pair be planned (the next snapshot hands them to the planner): re-submit the snapshot
      await page.evaluate(async () => { const A = window.__animals, s = A.curr; A.setSnapshot({ ...s, agents: s.agents.slice(), tick: s.tick + 1 }); await window.__stage.frames(60, 0.1); });
      const key = await page.evaluate((r2) => { const A = window.__animals; const sa = A.slots.map.get(r2.a.id); return { pKey: A.beh.pKey[sa], pSlot: A.beh.pSlot[sa] }; }, r);
      console.log('pair', JSON.stringify(key));
      const ses = await page.evaluate((k) => window.__stage.toSession(k, 13, 22, 48, 0.75, 10, 14), key.pKey);
      console.log('spar session', JSON.stringify(ses));
      await follow('04_spar', r.a.id, ses.start, [1.0, 3.0, 4.2, 5.6, 7.0, 8.4, ses.len - 0.2], { d: 11, pitch: 15, yaw: 70, lift: 0.8 }, { view2: { d: 10, pitch: 55, yaw: 0, lift: 0 } });
    }
  }

  if (only.has('bellow')) {
    await env({ dayFrac: 0.47, season: 1.8, weather: 0 });
    const c = await page.evaluate(() => { const S = window.__stage; const bulls = S.idx(0).filter((k) => { const g = S.get(k); return (g.fl & 8) && !(g.fl & 1); }); if (!bulls.length) return null; S.set(bulls[0], { st: 1, spd: 0 }); return S.get(bulls[0]); });
    if (c) {
      await clearSurround(c);
      await page.evaluate((c2) => { window.__stage.look(c2.x, c2.z, 8, 10, window.__stage.sunYaw() + 55, 0.7); }, c);
      await page.evaluate(() => window.__stage.frames(20, 0.05));
      await shot('05_bellow_0_before', 60);
      const t0 = await page.evaluate((c2) => { const A = window.__animals; A.debugBellow(4.6, c2.x, c2.z); return A.clock; }, c);
      await follow('05_bellow', c.id, t0, [0.6, 1.4, 2.4, 3.6, 4.5, 5.6], { d: 8, pitch: 8, rel: 80, lift: 0.8 });
    }
  }

  if (only.has('calf')) {
    await env({ dayFrac: 0.44, season: 0.9, weather: 0 });
    const c = await page.evaluate(() => { const S = window.__stage; const ks = S.idx(0); if (!ks.length) return null; const k = ks[ks.length - 1]; S.set(k, { st: 1, spd: 0, fl: 1, sc: 0.5 }); return S.get(k); });
    if (c) {
      await clearSurround(c);
      const ses = await page.evaluate((c2) => window.__stage.toSession(c2.id, 15, 11, 26, 0.8, 7.5), c);
      console.log('calf session', JSON.stringify(ses));
      await follow('06_calf', c.id, ses.start, [0.4, 1.4, 2.4, 3.4, 4.4, 5.4, 6.4], { d: 6.5, pitch: 14, rel: -80, lift: 0.3 });
    }
  }

  if (only.has('howl')) {
    // dusk: a pack at rest; a howl begins (the audio's call, here the debug hook) and they sit up and howl together
    await env({ dayFrac: 0.76, season: 1.2, weather: 0 });
    const g = await page.evaluate(() => {
      const S = window.__stage;
      const all = S.idx(1);
      if (!all.length) return null;
      const a = S.get(all[0]);
      const ks = [all[0], ...all.slice(1, 4)];
      let i = 0;
      for (const k of ks) { S.set(k, { x: a.x + (i - 1.5) * 2.6, z: a.z + (i % 2 ? 2.2 : -1.6), st: 8, spd: 0, h: 1.0 + 0.5 * i, fl: 0 }); i++; }
      return { ks, at: S.get(all[0]) };
    });
    if (g) {
      await clearSurround(g.at, 24, await page.evaluate((ks) => ks.map((k) => window.__stage.get(k).id), g.ks));
      await page.evaluate((g2) => { window.__stage.look(g2.at.x, g2.at.z + 0.3, 11, 13, window.__stage.sunYaw() + 40, 1.3); }, g);
      await page.evaluate(() => window.__stage.frames(40, 0.1));
      await shot('07_howl_0_resting', 80);
      await page.evaluate((g2) => { window.__animals.debugWolfChorus(7, g2.at.x, g2.at.z); }, g);
      for (const [name, secs] of [['1_rising', 1.6], ['2_howl', 2.2], ['3_howl_b', 2.0], ['4_end', 3.0]]) {
        await page.evaluate((s2) => window.__stage.frames(Math.round(s2 / 0.05), 0.05), secs);
        await shot('07_howl_' + name, 60);
      }
    }
  }

  if (only.has('pup')) {
    await env({ dayFrac: 0.44, season: 0.9, weather: 0 });
    const c = await page.evaluate(() => { const S = window.__stage; const ws = S.idx(1); if (!ws.length) return null; S.set(ws[0], { st: 0, spd: 0, fl: 1, sc: 0.6 }); return S.get(ws[0]); });
    if (c) {
      await clearSurround(c, 16);
      const ses = await page.evaluate((c2) => window.__stage.toSession(c2.id, 1, 16, 34, 0.7, 8), c);
      console.log('pup session', JSON.stringify(ses));
      await follow('08_pup', c.id, ses.start, [0.6, 1.1, 1.9, 2.8, 3.6, 4.4, 5.2, 6.0, 7.0], { d: 6, pitch: 22, rel: 70, lift: 0.3 }, { view2: { d: 7, pitch: 38, yaw: 30, lift: 0.2 } });
    }
  }

  if (only.has('mark')) {
    await env({ dayFrac: 0.44, season: 1.2, weather: 0 });
    const c = await page.evaluate(() => { const S = window.__stage; const ws = S.idx(1); if (!ws.length) return null; S.set(ws[0], { st: 0, spd: 0, fl: 0 }); return S.get(ws[0]); });
    if (c) {
      await clearSurround(c, 16);
      const ses = await page.evaluate((c2) => window.__stage.toSession(c2.id, 2, 40, 90, 0.5, 4.4), c);
      console.log('mark session', JSON.stringify(ses));
      await follow('09_mark', c.id, ses.start, [0.6, 1.2, 2.0, 2.6, 3.2, 3.8, 4.3], { d: 4.5, pitch: 12, rel: -90, lift: 0.5 }, { view2: { d: 4.5, pitch: 12, rel: 90, lift: 0.5 } });
    }
  }

  if (only.has('flare')) {
    // two pronghorn side by side, one grazing and one on alarm: the rump patch of the one on alarm is bigger and brighter
    await env({ dayFrac: 0.44, season: 1.2, weather: 0 });
    const r = await page.evaluate(() => {
      const S = window.__stage;
      const ps = S.idx(3);
      if (ps.length < 2) return null;
      const a = S.get(ps[0]);
      S.set(ps[0], { st: 1, spd: 0, h: 0.0 });
      S.set(ps[1], { x: a.x, z: a.z + 5.5, st: 4, spd: 0, h: 0.0 });
      return { a, id1: S.get(ps[1]).id };
    });
    if (r) {
      await clearSurround(r.a, 20, [r.id1]);
      await page.evaluate(async () => { await window.__stage.frames(40, 0.05); });
      // from behind (the animals face +x: the camera looks from -x), and from the side-rear
      await page.evaluate((r2) => { const S = window.__stage; S.look(r2.a.x, r2.a.z + 5.5, 3.0, 8, S.yawFor(r2.id1, 0), 0.7); }, r);
      await page.evaluate(() => window.__stage.frames(12, 0.05));
      await shot('10_flare_behind', 60);
      await page.evaluate((r2) => { const S = window.__stage; S.look(r2.a.x, r2.a.z + 5.5, 3.4, 9, S.yawFor(r2.id1, 55), 0.7); }, r);
      await page.evaluate(() => window.__stage.frames(8, 0.05));
      await shot('10_flare_rear_quarter', 60);
      await page.evaluate((r2) => { const S = window.__stage; S.look(r2.a.x, r2.a.z + 2.7, 60, 22, S.yawFor(r2.id1, 0), 0); }, r);
      await page.evaluate(() => window.__stage.frames(8, 0.05));
      await shot('10_flare_far', 60);
    }
  }

  if (only.has('preen')) {
    await env({ dayFrac: 0.44, season: 1.2, weather: 0 });
    const c = await page.evaluate(() => { const S = window.__stage; let es = S.idx(8).concat(S.idx(9)); if (!es.length) { es = S.idx(2); if (!es.length) return null; S.set(es[0], { sp: 9, sc: 1 }); } /* (no raptors in this valley: a raven becomes a hawk on the staged snapshot) */ S.set(es[0], { st: 0, spd: 0, alt: 9 }); return S.get(es[0]); });
    if (c) {
      const ses = await page.evaluate((c2) => window.__stage.toSession(c2.id, 21, 20, 50, 0.8, 5, 8), c);
      console.log('preen session', JSON.stringify(ses));
      await follow('11_preen', c.id, ses.start, [0.0, 1.0, 2.0, 3.0, 4.2], { d: 2.6, pitch: 4, rel: 80, lift: 9.4 }, { view2: { d: 2.6, pitch: 4, rel: 160, lift: 9.4 } });
    } else console.log('no raptor in this valley');
  }

  if (only.has('roll')) {
    await env({ dayFrac: 0.44, season: 1.2, weather: 0 });
    const c = await page.evaluate(() => { const S = window.__stage; const rs = S.idx(2); if (!rs.length) return null; S.set(rs[0], { st: 9, spd: 6, alt: 14 }); return S.get(rs[0]); });
    if (c) {
      const ses = await page.evaluate((c2) => window.__stage.toSession(c2.id, 22, 28, 75, 0.55, 1.5), c);
      console.log('roll session', JSON.stringify(ses));
      await follow('12_roll', c.id, ses.start, [0.15, 0.4, 0.65, 0.9, 1.15, 1.4], { d: 8, pitch: 4, rel: 90, lift: 14 });
    }
  }

  console.log('beh counters', JSON.stringify(await page.evaluate(() => window.__animals.behSeen)));
  console.log('errors:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
} catch (e) {
  console.error('FAILED', e);
  code = 1;
} finally {
  clearTimeout(kill);
  await browser.close();
  await server.close();
}
process.exit(code);
