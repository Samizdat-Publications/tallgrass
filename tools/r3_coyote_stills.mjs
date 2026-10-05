// R3 coyote stills (JPEG q90): a coyote close at a trot, the mousing leap as a strip, the dusk chorus, a mangy canid close, a migrant column,
// and a director "town" shot.
//   node tools/r3_coyote_stills.mjs --out review/wip/R3/coyote [--tag a] [--only trot,leap,chorus,mange,column,town,probe] [--seed 3] [--size 1600x900]
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
const only = new Set(arg('only', 'trot,leap,chorus,mange,column,town').split(','));
const seed = arg('seed', '3');
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const kill = setTimeout(() => { console.error('r3_coyote_stills: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r3c'),
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

  if (only.has('probe')) {
    const c = await first(6);
    console.log('first coyote', JSON.stringify(c));
    if (c) { await page.evaluate((c2) => { window.__stage.look(c2.x, c2.z, 9, 12, 60); }, c); await page.evaluate(() => window.__stage.frames(8)); await shot('00_probe'); }
  }

  if (only.has('trot')) {
    await page.evaluate(() => { const e = window.__engine; Object.assign(e.env, { dayFrac: 0.5, season: 1.2 }); e.applyEnvNow(); });
    // a coyote at a steady trot: speed 2 m/s in the sim = 3 m/s on screen; the staged snapshot is advanced each frame so it really travels
    const c = await first(6);
    if (c) {
      await page.evaluate(async (c2) => {
        const S = window.__stage, A = window.__animals;
        S.set(c2.k, { st: 2, spd: 2.2, h: 0.4 });
        // advance it along its heading, ten snapshots a second, with a camera that follows from the side
        const s0 = A.curr;
        let x = c2.x, z = c2.z;
        for (let i = 0; i < 60; i++) {
          x += Math.cos(0.4) * 0.22; z += Math.sin(0.4) * 0.22;
          const agents = new Float32Array(s0.agents); agents[c2.k * 12 + 1] = x; agents[c2.k * 12 + 2] = z;
          A.setSnapshot({ ...s0, agents, tick: s0.tick + 1 + i });
          S.look(x, z, 5.5, 9, S.sunYaw() + 35);
          await S.frames(3, 0.033);
        }
      }, c);
      await shot('01_trot_close', 100);
      await page.evaluate(() => window.__stage.frames(4, 0.05));
      await shot('01b_trot_close2', 100);
    }
  }

  const cropShot = async (name, wait = 60) => {
    await page.waitForTimeout(wait);
    const p = `${out}/${tag}_${name}.jpg`;
    await page.screenshot({ path: p, type: 'jpeg', quality: 90, clip: { x: W / 2 - 400, y: H / 2 - 360, width: 800, height: 560 } });
    return p;
  };

  if (only.has('leap')) {
    // a coyote standing very still in the stalk (the sim's mousing): the layer springs it after a while. Frames at fixed times into the leap.
    const c = await first(6);
    if (c) {
      await page.evaluate((c2) => { window.__stage.set(c2.k, { st: 10, spd: 0 }); window.__leapC = c2; }, c);
      const t = await page.evaluate(async () => {
        const S = window.__stage, A = window.__animals, c2 = window.__leapC;
        const slot = A.slots.map.get(c2.id);
        const v = new (window.__engine.camera.position.constructor)();
        const focus = () => { A.getPosition(c2.id, v); S.look(v.x, v.z, 6.5, 11, S.sunYaw() + 35); };
        let n = 0;
        while (A.cn.leapT[slot] < 0 && n++ < 400) { await S.frames(1, 0.05); focus(); }
        return { waited: n * 0.05, slot };
      });
      console.log('leap began after', JSON.stringify(t));
      const marks = [0.12, 0.35, 0.6, 0.85, 1.05, 1.25, 1.55];
      for (const m of marks) {
        await page.evaluate(async (target) => {
          const S = window.__stage, A = window.__animals, c2 = window.__leapC;
          const slot = A.slots.map.get(c2.id);
          const v = new (window.__engine.camera.position.constructor)();
          let n = 0;
          while (A.cn.leapT[slot] >= 0 && A.cn.leapT[slot] < target && n++ < 60) { await S.frames(1, 0.02); A.getPosition(c2.id, v); S.look(v.x, v.z, 6.5, 11, S.sunYaw() + 35); }
          A.getPosition(c2.id, v); S.look(v.x, v.z, 6.5, 11, S.sunYaw() + 35);
          await S.frames(8, 0.001);
        }, m);
        const tt = await page.evaluate(() => { const A = window.__animals, c2 = window.__leapC; return A.cn.leapT[A.slots.map.get(c2.id)]; });
        await cropShot(`02_leap_t${String(Math.round(m * 100)).padStart(3, '0')}`);
        console.log('leap frame at', m, 'actual', tt);
      }
    }
  }

  if (only.has('chorus')) {
    // dusk, two or three coyotes at rest side by side; a call begins and they sit up and sing (a long note, then yips)
    await page.evaluate(() => { const e = window.__engine; Object.assign(e.env, { dayFrac: 0.725, season: 1.2 }); e.applyEnvNow(); });
    const g = await page.evaluate(() => {
      const S = window.__stage;
      const all = S.idx(6);
      let best = null;
      for (const a of all) {
        const A = S.get(a);
        const mates = all.filter((b) => b !== a && Math.hypot(S.get(b).x - A.x, S.get(b).z - A.z) < 30);
        // a clean backdrop: nothing but coyotes (and small prey) within 22 m
        const o = a * 12, sn = window.__animals.curr;
        let crowd = 0;
        for (let j = 0; j < sn.count; j++) { const q = j * 12, sp3 = sn.agents[q]; if (sp3 === 6 || sp3 === 7 || sp3 === 4) continue; if (Math.hypot(sn.agents[q + 1] - sn.agents[o + 1], sn.agents[q + 2] - sn.agents[o + 2]) < 22) crowd++; }
        const score = (mates.length ? 10 : 0) - crowd * 5 + mates.length;
        if (!best || score > best.score) best = { a, m: mates, score };
      }
      if (!best) best = { a: all[0], m: [] };
      const ks = [best.a, ...best.m.slice(0, 2)];
      for (const k of ks) S.set(k, { st: 8, spd: 0 });
      return { ks, at: S.get(best.a) };
    });
    console.log('chorus group', JSON.stringify(g));
    await page.evaluate((g2) => { window.__stage.look(g2.at.x, g2.at.z, 5.5, 8, window.__stage.sunYaw() + 30); }, g);
    await page.evaluate(() => window.__stage.frames(30, 0.1)); // settle (lie down)
    await shot('03_chorus_0_resting', 100);
    await page.evaluate((g2) => { window.__animals.debugChorus(9, g2.at.x, g2.at.z); }, g);
    for (const [name, secs] of [['1_rising', 1.5], ['2_howl', 3.0], ['3_howl_b', 2.0], ['4_yips', 2.6]]) {
      await page.evaluate((s2) => window.__stage.frames(Math.round(s2 / 0.05), 0.05), secs);
      await shot('03_chorus_' + name, 60);
    }
  }

  if (only.has('mange')) {
    await page.evaluate(() => { const e = window.__engine; Object.assign(e.env, { dayFrac: 0.4, season: 1.2 }); e.applyEnvNow(); });
    for (const [sp2, nm, d] of [[1, 'wolf', 5.2], [6, 'coyote', 4.2]]) {
      const c = await first(sp2);
      if (!c) continue;
      await page.evaluate((c2) => { window.__stage.set(c2.k, { fl: c2.fl | 32, en: 0.2, st: 1, spd: 0 }); }, c);
      // eased in over a few seconds
      await page.evaluate(async (c2) => { for (let i = 0; i < 6; i++) { window.__stage.look(c2.x, c2.z, 5, 12, window.__stage.sunYaw() + 40); await window.__stage.frames(25, 0.1); } }, c);
      await page.evaluate((a) => { const [c2, d2] = a; window.__stage.look(c2.x, c2.z, d2, 12, window.__stage.sunYaw() + 40); }, [c, d]);
      await page.evaluate(() => window.__stage.frames(6, 0.05));
      await shot(`04_mange_${nm}`, 100);
      await page.evaluate((a) => { const [c2, d2] = a; window.__stage.look(c2.x, c2.z, d2 * 1.1, 10, window.__stage.sunYaw() - 30); }, [c, d]);
      await page.evaluate(() => window.__stage.frames(6, 0.05));
      await shot(`04_mange_${nm}_rear`, 100);
    }
  }

  if (only.has('column')) {
    // six pronghorn that walked in together as a loose line abreast: the layer draws them in a short file
    await page.evaluate(() => { const e = window.__engine; Object.assign(e.env, { dayFrac: 0.42, season: 1.2 }); e.applyEnvNow(); });
    const c = await first(3);
    if (c) {
      const res = await page.evaluate(async (c2) => {
        const S = window.__stage, A = window.__animals;
        const all = S.alone(3, undefined, 8).concat(S.idx(3));
        // the six nearest the middle of the valley (well away from the border fade)
        const dc = (k) => Math.hypot(S.get(k).x - 256, S.get(k).z - 256);
        const picks = [...new Set(all)].sort((a, b) => dc(a) - dc(b)).slice(0, 6);
        c2 = S.get(picks[0]);
        const h = 0.7, hx = Math.cos(h), hz = Math.sin(h), px = -hz, pz = hx;
        const s0 = A.curr;
        const t0 = s0.tick;
        const pos = picks.map((k, i) => ({ k, lat: (i - 2.5) * 5.5, al: Math.sin(i * 2.3) * 2 }));
        const base = { x: c2.x, z: c2.z };
        for (let step = 0; step < 200; step++) {
          const agents = new Float32Array(s0.agents);
          for (const p of pos) {
            const o = p.k * 12;
            agents[o + 1] = base.x + hx * (step * 0.17 + p.al) + px * p.lat;
            agents[o + 2] = base.z + hz * (step * 0.17 + p.al) + pz * p.lat;
            agents[o + 3] = h; agents[o + 4] = 1.7; agents[o + 7] = 11; agents[o + 8] = (agents[o + 8] | 0) | 64;
          }
          A.setSnapshot({ ...s0, agents, tick: t0 + 1 + step });
          S.look(base.x + hx * (step * 0.17), base.z + hz * (step * 0.17), 13, 16, S.sunYaw() + 70);
          await S.frames(3, 0.033);
        }
        // lateral spread (across the heading) of where they are drawn, against where the sim has them
        const V = new (window.__engine.camera.position.constructor)();
        const lat = (get) => { const l = picks.map((k) => { const p = get(k); return (p.x - base.x) * px + (p.z - base.z) * pz; }); const m = l.reduce((a, b) => a + b, 0) / l.length; return Math.sqrt(l.reduce((a, b) => a + (b - m) * (b - m), 0) / l.length); };
        const drawn = lat((k) => { A.getPosition(A.curr ? A.curr.ids[k] : 0, V); return { x: V.x, z: V.z }; });
        const sim = lat((k) => ({ x: A.curr.agents[k * 12 + 1], z: A.curr.agents[k * 12 + 2] }));
        return { picks: picks.length, latSimStd: +sim.toFixed(2), latDrawnStd: +drawn.toFixed(2) };
      }, c);
      console.log('column', JSON.stringify(res));
      await shot('05_column', 100);
      await page.evaluate(() => window.__stage.frames(10, 0.05));
      await shot('05_column_b', 100);
    }
  }

  if (only.has('town')) {
    await page.evaluate(() => { const e = window.__engine; Object.assign(e.env, { dayFrac: 0.42, season: 1.2 }); e.applyEnvNow(); });
    // the documentary director picks a "town" shot: a prairie dog town with a predator near it (the predator is moved there on the snapshot)
    const r = await page.evaluate(async () => {
      const S = window.__stage, A = window.__animals, D = window.__director, SP = window.__smallprey;
      const t = SP.biggestTown();
      if (!t) return { none: true };
      const k = (S.alone(6).length ? S.alone(6) : S.idx(6))[0];
      S.set(k, { x: t.x + 22, z: t.z - 14, st: 2, spd: 1.2, h: 2.6 });
      for (const sn of [A.curr, window.__snap()]) for (let j = 0; j < sn.count; j++) if (sn.agents[j * 12 + 7] === 5) sn.agents[j * 12 + 7] = 2; // (no hunt in progress: a chase would take the camera first)
      const s = A.curr;
      const f = { count: s.count, ids: s.ids, agents: s.agents, carcassCount: 0, carcasses: new Float32Array(0), dayFrac: 0.42, small: window.__lastSmall() };
      return { town: t, shot: D.findTown(f) };
    });
    console.log('director town', JSON.stringify(r));
    if (r.shot) {
      await page.evaluate(async (sh) => {
        const D = window.__director;
        D.setEnabled(true);
        D.cuts.push({ shot: sh, at: D.clock });
        D.current = { kind: 'vista', id: null, x: 0, y: 0, dist: 100, pitch: 20, yaw: 0, hold: 20 };
        D.t = 10; // the vista has run 10 s: the cut may come
        for (let i = 0; i < 70; i++) { window.__engine.renderOnce(0.05); if (i % 20 === 19) await new Promise((r2) => setTimeout(r2, 5)); }
      }, r.shot);
      console.log('chasers left', JSON.stringify(await page.evaluate(() => { const a = window.__snap().agents, n = window.__snap().count; let c = 0; for (let j = 0; j < n; j++) if (a[j * 12 + 7] === 5) c++; return { c, cuts: window.__director.cuts.length, t: window.__director.t, same: window.__snap().agents === window.__animals.curr.agents }; })));
      console.log('director now', JSON.stringify(await page.evaluate(() => { const c = window.__director.current; return c ? { kind: c.kind, dist: c.dist, pitch: c.pitch } : null; })));
      await shot('06_director_town', 200);
      await page.evaluate(() => window.__director.setEnabled(false));
    }
  }
  if (only.has('herd')) {
    // a wide view with coyotes and wolves together (two wolves and two coyotes are walked up to one spot on the snapshot)
    await page.evaluate(() => { const e = window.__engine; Object.assign(e.env, { dayFrac: 0.42, season: 1.2 }); e.applyEnvNow(); });
    const c = await first(6);
    await page.evaluate(async (c2) => {
      const S = window.__stage;
      const ws = S.idx(1), cs2 = S.idx(6).filter((k) => k !== c2.k);
      const put = (k, dx, dz, h) => S.set(k, { x: c2.x + dx, z: c2.z + dz, h, st: 1, spd: 0 });
      S.set(c2.k, { st: 1, spd: 0, h: 0.4 });
      if (ws[0] !== undefined) put(ws[0], 9, 5, 0.9);
      if (ws[1] !== undefined) put(ws[1], 13, -4, 0.2);
      if (ws[2] !== undefined) put(ws[2], 6, -9, 1.6);
      if (cs2[0] !== undefined) put(cs2[0], -8, 4, 0.1);
      if (cs2[1] !== undefined) put(cs2[1], -5, -8, 0.6);
      await S.frames(40, 0.1);
    }, c);
    for (const [nm, yaw] of [['a', 35], ['b', -40], ['c', 110], ['d', -110]]) {
      await page.evaluate(async ([c2, y]) => { const S = window.__stage; S.look(c2.x + 3, c2.z, 24, 17, S.sunYaw() + y); await S.frames(12, 0.1); }, [c, yaw]);
      await shot('07_herd_coyotes_wolves_' + nm, 100);
    }
  }

  console.log('errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  await uiStyle.evaluate((el) => el.remove());
} catch (e) {
  console.error('FAILED', e);
  code = 1;
} finally {
  clearTimeout(kill);
  await browser.close();
  await server.close();
}
process.exit(code);
