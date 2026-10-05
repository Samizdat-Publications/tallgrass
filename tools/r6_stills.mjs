// R6 deer render stills (JPEG q90): a buck in autumn close (near LOD), a doe and fawn, antlers through the year, a stotting strip, a winter
// herd, and a cougar stalk, freeze and rush strip. Runs the real game on the GPU in headless Chromium with the mule deer and the cougars on
// (real param keys: muledeer.initial, cougar.initial). The sim is stepped a little and frozen; each still is staged on the frozen snapshot
// (render only), and the two strips drive the animal layer with snapshots written by hand (the sim never sees them).
//   node tools/r6_stills.mjs --out review/wip/R6 [--only buck,velvet,family,winter,stot,cougar] [--seed 3] [--size 1600x900]
// Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const out = resolve(arg('out', 'review/wip/R6'));
const only = new Set(arg('only', 'buck,velvet,family,winter,stot,cougar').split(','));
const seed = arg('seed', '3');
const [W, H] = arg('size', '2560x1440').split('x').map(Number);
const spotsFile = resolve(out, 'spots.json');
const spots = existsSync(spotsFile) ? JSON.parse(readFileSync(spotsFile, 'utf8')) : {};
const kill = setTimeout(() => { console.error('r6_stills: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({
  configFile: resolve('vite.config.ts'), cacheDir: resolve('node_modules/.vite-r6'),
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
  await page.goto(base + `/index.html?autoscale=0&autocam=0&seed=${seed}&p=muledeer.initial:40,cougar.initial:4,coyote.initial:6,smallPrey:1`, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => { const gl = window.__engine.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  console.log('GL renderer:', info);
  await page.evaluate(() => { const e = window.__engine; e.setEnv = () => {}; Object.assign(e.env, { dayFrac: 0.33, season: 2.5, weather: 0, rain: 0, windStrength: 0.2 }); e.applyEnvNow(); });
  await page.evaluate(() => { window.__speed(0); window.__step(1500); });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    Object.defineProperty(window.__animals, 'timeScale', { get: () => 1, set: () => {} });
    window.__engine.stop();
    const A = window.__animals;
    window.__stage = {
      idx: (sp) => { const s = A.curr, r = []; for (let k = 0; k < s.count; k++) if (s.agents[k * 12] === sp) r.push(k); return r; },
      get: (k) => { const s = A.curr, o = k * 12; return { k, id: s.ids[k], x: s.agents[o + 1], z: s.agents[o + 2], h: s.agents[o + 3], spd: s.agents[o + 4], sc: s.agents[o + 5], st: s.agents[o + 7], fl: s.agents[o + 8], age: s.agents[o + 11] }; },
      set: (k, o2) => { const s = A.curr, o = k * 12; for (const [f, v] of Object.entries(o2)) s.agents[o + { x: 1, z: 2, h: 3, spd: 4, sc: 5, coat: 6, st: 7, fl: 8, alt: 9, en: 10, age: 11 }[f]] = v; },
      frames: async (n, dt = 0.1) => { for (let i = 0; i < n; i++) { window.__engine.renderOnce(dt); if (i % 20 === 19) await new Promise((r) => setTimeout(r, 5)); } },
      sunYaw: () => { const l = window.__engine.uniforms.lightDir.value; return Math.atan2(l.x, l.z) * 57.3; },
      look: (x, z, d, pitch, yaw) => window.__engine.cam.setView({ x, y: z, distance: d, pitchDeg: pitch, yawDeg: yaw }, true),
      season: (s) => { const e = window.__engine; Object.assign(e.env, { season: s }); e.applyEnvNow(); A.seasonOverride = s; },
      // the clearest gentle ground within 160 m of (x0, z0): nothing else within ~30 m, no tree within 45 m, away from water
      clear: (x0, z0, skip) => {
        const s = A.curr, w = window.__engine.world; let best = null;
        for (let gx = -160; gx <= 160; gx += 8) for (let gz = -160; gz <= 160; gz += 8) {
          const x = x0 + gx, z = z0 + gz;
          if (x < 90 || z < 90 || x > w.size - 90 || z > w.size - 90) continue;
          const ci = Math.min(w.n - 1, Math.max(0, Math.floor(x / (w.size / w.n)))), cj = Math.min(w.n - 1, Math.max(0, Math.floor(z / (w.size / w.n))));
          if (w.water[cj * w.n + ci] || w.slope[cj * w.n + ci] > 0.14) continue;
          let tn = 1e9; for (let i = 0; i < w.trees.length; i += 4) tn = Math.min(tn, Math.hypot(w.trees[i] - x, w.trees[i + 1] - z)); if (tn < 45) continue;
          let md = 70;
          for (let j = 0; j < s.count; j++) { if (skip.includes(j)) continue; const q = j * 12; md = Math.min(md, Math.hypot(s.agents[q + 1] - x, s.agents[q + 2] - z)); }
          const sc = md - Math.hypot(gx, gz) * 0.05;
          if (!best || sc > best.sc) best = { sc, x, z, md };
        }
        return best;
      },
    };
  });
  const pops = await page.evaluate(() => ({ pop: Array.from(window.__snap().pop), deer: window.__stage.idx(10).length, cougar: window.__stage.idx(5).length, bucks: window.__stage.idx(10).filter((k) => (window.__stage.get(k).fl & 8) !== 0 && (window.__stage.get(k).fl & 1) === 0).length }));
  console.log('population', JSON.stringify(pops));
  await page.addStyleTag({ content: '#ui { display: none !important; }' });
  const shot = async (name, wait = 150, clipAt = null, frac = 0.56) => {
    await page.evaluate(() => window.__stage.frames(40, 0.001)); // let the temporal AA settle
    await page.waitForTimeout(wait);
    const p = `${out}/${name}.jpg`;
    let clip;
    if (clipAt) {
      // crop round the animal (the still is taken large and cropped, so the animal fills the picture without a long lens)
      const sp3 = await page.evaluate(([x, z, hh]) => { const e = window.__engine; const v = new e.camera.position.constructor(x, hh, z); v.project(e.camera); return { sx: (v.x * 0.5 + 0.5) * window.innerWidth, sy: (-v.y * 0.5 + 0.5) * window.innerHeight }; }, clipAt);
      const cw = Math.round(W * frac), ch = Math.round(H * frac);
      clip = { x: Math.max(0, Math.min(W - cw, Math.round(sp3.sx - cw / 2))), y: Math.max(0, Math.min(H - ch, Math.round(sp3.sy - ch / 2))), width: cw, height: ch };
    }
    await page.screenshot({ path: p, type: 'jpeg', quality: 90, clip });
    console.log('saved', p);
    return p;
  };
  // stage the deer `which` (an index into the list of adult deer of the sex asked) on clear ground; returns its place
  const stageDeer = async (key, male, season, extra = {}) => page.evaluate(([key2, male2, season2, spot, extra2]) => {
    const S = window.__stage;
    S.season(season2);
    const all = S.idx(10).filter((k) => { const g = S.get(k); return (g.fl & 1) === 0 && ((g.fl & 8) !== 0) === male2; });
    if (!all.length) return null;
    const k = all[extra2.nth ?? 0];
    const c = spot ? { x: spot[0], z: spot[1], md: -1 } : S.clear(S.get(k).x, S.get(k).z, [k]);
    S.set(k, { x: c.x, z: c.z, st: extra2.st ?? 0, spd: 0, sc: 1.0, fl: male2 ? 8 : 0, age: extra2.age ?? 0.3, coat: extra2.coat ?? 0.4 });
    return { ...S.get(k), clear: c.md };
  }, [key, male, season, spots[key] ?? null, extra]);
  const clipOf = async (c, up) => { const gy = await page.evaluate(([x, z]) => window.__engine.terrain.heightAt(x, z), [c.x, c.z]); return [c.x, c.z, gy + up * 0.6]; };
  const setSpot = (key, c) => { if (!spots[key]) { spots[key] = [c.x, c.z]; writeFileSync(spotsFile, JSON.stringify(spots)); } };
  const frameOn = async (c, d, pitch, yawOff, h) => page.evaluate(async ([c2, d2, pitch2, yawOff2, h2]) => {
    const S = window.__stage;
    const yaw = S.sunYaw() + yawOff2;
    S.set(c2.k, { h: h2 ?? -(yaw * Math.PI) / 180 + 0.35 });
    S.look(c2.x, c2.z, d2, pitch2, yaw);
    await S.frames(30, 0.1);
    S.look(c2.x, c2.z, d2, pitch2, yaw);
  }, [c, d, pitch, yawOff, h]);

  if (only.has('buck')) {
    // a buck in autumn: hard antlers, the full rack; near LOD
    for (const [name, d, pitch, yawOff] of [['01_buck_autumn_side_7m', 7, 8, 55], ['02_buck_autumn_three_quarter_5m', 5, 7, 20], ['03_buck_autumn_head_3m', 3.6, 5, 35]]) {
      const c = await stageDeer('buck', true, 2.5);
      if (!c) { console.log('no buck for', name); continue; }
      setSpot('buck', c);
      await frameOn(c, d, pitch, yawOff);
      await page.evaluate((k) => window.__stage.set(k, { st: 0 }), c.k);
      if (d < 4) {
        // the head: crop round it (the camera looks at the body, so the head sits off centre)
        const h = await page.evaluate((k) => window.__stage.get(k).h, c.k);
        await shot(name, 150, await clipOf({ x: c.x + Math.cos(h) * 1.0, z: c.z + Math.sin(h) * 1.0 }, 2.0), 0.45);
      } else await shot(name, 150, await clipOf(c, 1.55), 0.55);
    }
  }
  if (only.has('velvet')) {
    // antlers through the year on one buck: bare after the shed, buds in spring, velvet in summer, hard in the autumn, shed again
    for (const [name, season] of [['04_buck_bare_late_winter', 3.9], ['04_buck_buds_spring', 0.35], ['04_buck_velvet_summer', 1.5], ['04_buck_hard_autumn', 2.6]]) {
      const c = await stageDeer('buck', true, season);
      if (!c) continue;
      await frameOn(c, 5.5, 7, 40);
      await shot(name, 150, await clipOf(c, 1.55), 0.5);
    }
  }
  if (only.has('family')) {
    // a doe with her fawn in summer (reddish coat)
    const c = await stageDeer('doe', false, 1.4, { nth: 0 });
    if (c) {
      setSpot('doe', c);
      const f = await page.evaluate(([cd]) => {
        const S = window.__stage;
        const all = S.idx(10).filter((k) => k !== cd.k && (S.get(k).fl & 8) === 0);
        const k = all[0];
        S.set(k, { x: cd.x + 1.3, z: cd.z + 0.9, st: 1, spd: 0, sc: 0.55, fl: 1, age: 0.01, coat: 0.5 });
        return S.get(k);
      }, [c]);
      await page.evaluate(([cd]) => window.__stage.set(cd.k, { st: 1 }), [c]);
      await frameOn(c, 7, 8, 50, undefined);
      await page.evaluate(([cd, ff]) => { const S = window.__stage; S.set(ff.k, { h: S.get(cd.k).h + 0.5 }); }, [c, f]);
      await shot('05_doe_and_fawn_summer', 150, await clipOf(c, 0.8), 0.6);
    }
  }
  if (only.has('winter')) {
    // a winter herd: grey coats, no antlers (shed), snow on the ground
    await page.evaluate(() => { const S = window.__stage; S.season(3.35); });
    // gather eight deer (does, fawns and the odd buck) on clear ground
    const g = await page.evaluate(() => {
      const S = window.__stage, ks = S.idx(10).slice(0, 9);
      const c = S.clear(S.get(ks[0]).x, S.get(ks[0]).z, ks);
      ks.forEach((k, i) => {
        const a = (i / ks.length) * 6.28 + 0.4 * i, r = 2.5 + 1.1 * ((i * 7) % 5);
        S.set(k, { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, st: i % 3 === 0 ? 0 : 1, spd: 0, h: a + 1.2 * ((i % 3) - 1), age: 0.3, fl: i === 2 || i === 6 ? 8 : 0, sc: 1.0, coat: 0.3 + 0.05 * i });
      });
      return { x: c.x, z: c.z, k: ks[0] };
    });
    console.log('winter group', JSON.stringify(g));
    await page.evaluate(async ([gg]) => {
      const S = window.__stage;
      S.look(gg.x, gg.z, 15, 12, S.sunYaw() + 65);
      await S.frames(40, 0.1);
      S.look(gg.x, gg.z, 15, 12, S.sunYaw() + 65);
    }, [g]);
    console.log('winter probe', JSON.stringify(await page.evaluate(([gg]) => { const A = window.__animals, S = window.__stage, v = new window.__engine.camera.position.constructor(); return S.idx(10).slice(0, 3).map((k) => { const ok = A.getPosition(A.curr.ids[k], v); return [ok, v.x - gg.x, v.z - gg.z, v.y]; }); }, [g])));
    await shot('06_winter_herd', 150, await clipOf(g, 0.9), 0.7);
  }
  if (only.has('stot')) {
    // a stotting strip: one deer fleeing at 18 m/s on screen, eight frames across one bound cycle, side on
    const c = await stageDeer('stot', false, 1.4, { st: 4 });
    if (c) {
      setSpot('stot', c);
      await page.evaluate(([cd]) => {
        const S = window.__stage, A = window.__animals;
        const s0 = A.curr;
        window.__drv = {
          t: 0, k: cd.k, x: cd.x, z: cd.z, h: 0,
          step(dt) {
            const sp = 18; // on-screen m/s
            this.x += Math.cos(this.h) * sp * dt;
            this.z += Math.sin(this.h) * sp * dt;
            const s = { ...A.curr, agents: new Float32Array(A.curr.agents), tick: A.curr.tick + 1 };
            const o = this.k * 12;
            s.agents[o + 1] = this.x; s.agents[o + 2] = this.z; s.agents[o + 3] = this.h; s.agents[o + 4] = sp / 1.5; s.agents[o + 7] = 4; s.agents[o + 8] = 128;
            A.setSnapshot(s);
            window.__engine.renderOnce(dt);
            this.t += dt;
          },
        };
      }, [c]);
      // run in a long straight line across the flat ground the staging found (a short run, then the strip)
      const frames = [];
      await page.evaluate(([cd]) => { window.__drv.h = Math.PI * 0.25; window.__drv.x = cd.x - 20; window.__drv.z = cd.z - 20; }, [c]);
      for (let i = 0; i < 70; i++) await page.evaluate(() => window.__drv.step(1 / 30));
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 1; j++) await page.evaluate(() => window.__drv.step(1 / 30));
        const f = await page.evaluate(async () => {
          const S = window.__stage, d = window.__drv;
          const yaw = -(d.h * 180) / Math.PI + 0;
          S.look(d.x, d.z, 8, 5, yaw);
          await S.frames(4, 0.0002);
          S.look(d.x, d.z, 8, 5, yaw);
          return [d.x, d.z, window.__engine.terrain.heightAt(d.x, d.z) + 0.75];
        });
        frames.push(await shot(`_stot_${i}`, 60, f, 0.34));
      }
      writeFileSync(`${out}/_stot_frames.json`, JSON.stringify(frames));
    }
  }
  if (only.has('cougar')) {
    // the cougar ambush: lying in wait, creeping up on a deer that wanders in, the freeze, the rush
    const k = await page.evaluate(() => {
      const S = window.__stage;
      const cg = S.idx(5), dr = S.idx(10).filter((k) => (S.get(k).fl & 1) === 0);
      if (!cg.length || !dr.length) return null;
      const c = S.clear(S.get(cg[0]).x, S.get(cg[0]).z, [cg[0], dr[0]]);
      return { cg: cg[0], dr: dr[0], x: c.x, z: c.z, md: c.md };
    });
    console.log('cougar stage', JSON.stringify(k));
    if (k) {
      await page.evaluate(([kk]) => {
        const S = window.__stage, A = window.__animals;
        const D = {
          t: 0, k: kk, phase: 'wait', cx: kk.x, cz: kk.z, // the cougar's SIM position
          dx: kk.x + 62, dz: kk.z + 6, // the deer, walking in
          ch: 0.1, dh: Math.PI, rushT: 0, shown: [],
          step(dt) {
            const s = { ...A.curr, agents: new Float32Array(A.curr.agents), tick: A.curr.tick + 1 };
            const oc = kk.cg * 12, od = kk.dr * 12;
            let cst = 10, cspd = 0, dst = 1, dspd = 0, dfl = 0;
            const dist = Math.hypot(this.dx - this.cx, this.dz - this.cz);
            if (this.phase === 'wait') {
              // the deer grazes toward it at a walking pace (2.4 on screen); the sim springs when it is within 26 m
              this.dh = Math.atan2(this.cz - this.dz, this.cx - this.dx) + 0.1;
              this.dx += Math.cos(this.dh) * 1.8 * dt; this.dz += Math.sin(this.dh) * 1.8 * dt;
              dst = 2; dspd = 1.2;
              if (dist < 26) { this.phase = 'rush'; this.rushT = 0; }
            } else {
              this.rushT += dt;
              cst = 5; cspd = 18; dst = 4; dspd = 12.5; dfl = 128;
              this.ch = Math.atan2(this.dz - this.cz, this.dx - this.cx);
              this.dh = Math.atan2(this.dz - this.cz, this.dx - this.cx) + 0.15;
              this.cx += Math.cos(this.ch) * 27 * dt; this.cz += Math.sin(this.ch) * 27 * dt;
              this.dx += Math.cos(this.dh) * 18.7 * dt; this.dz += Math.sin(this.dh) * 18.7 * dt;
            }
            s.agents[oc + 1] = this.cx; s.agents[oc + 2] = this.cz; s.agents[oc + 3] = this.ch; s.agents[oc + 4] = cspd; s.agents[oc + 7] = cst; s.agents[oc + 8] = 0; s.agents[oc + 5] = 1; s.agents[oc + 10] = 0.5;
            s.agents[od + 1] = this.dx; s.agents[od + 2] = this.dz; s.agents[od + 3] = this.dh; s.agents[od + 4] = dspd; s.agents[od + 7] = dst; s.agents[od + 8] = dfl; s.agents[od + 5] = 1;
            A.setSnapshot(s);
            window.__engine.renderOnce(dt);
            this.t += dt;
          },
          cam(d, pitch, yawDeg) {
            const v = new window.__engine.camera.position.constructor();
            A.getPosition(s0id, v);
            S.look(v.x, v.z, d, pitch, yawDeg);
          },
        };
        const s0id = A.curr.ids[kk.cg];
        // stage: the rest of the world stays as it is; both animals move onto the clear ground
        S.season(3.0);
        window.__cg = D;
        window.__ckk = kk;
      }, [k]);
      const cfg = JSON.stringify({});
      void cfg;
      const grab = async (name, d, pitch, yawOff, wait = 60) => {
        return page.evaluate(async ([d2, p2, yo]) => {
          const D = window.__cg, S = window.__stage;
          const yaw = -(D.ch * 180) / Math.PI + yo;
          D.cam(d2, p2, yaw);
          await S.frames(4, 0.0002);
          D.cam(d2, p2, yaw);
          const v = new window.__engine.camera.position.constructor();
          window.__animals.getPosition(window.__animals.curr.ids[window.__ckk.cg], v);
          return [v.x, v.z, v.y + 0.35];
        }, [d, pitch, yawOff]).then((f) => shot(name, wait, f, 0.4));
      };
      // lying in wait, then the deer comes in; shots at set script times
      const marks = [];
      const state = async () => page.evaluate(() => ({ t: window.__cg.t, phase: window.__cg.phase, rushT: window.__cg.rushT, dist: Math.hypot(window.__cg.dx - window.__cg.cx, window.__cg.dz - window.__cg.cz) }));
      let st = await state();
      const advance = async (secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) await page.evaluate((d) => window.__cg.step(d), dt); };
      await advance(2.0);
      marks.push(await grab('_ck_0_wait', 6, 16, 75));
      await advance(7.0);
      marks.push(await grab('_ck_1_creep', 6, 16, 75));
      // walk on until the deer is inside 38 m (the freeze), grab, then to just before the spring
      for (let i = 0; i < 400; i++) { st = await state(); if (st.dist < 36 || st.phase !== 'wait') break; await advance(0.1); }
      await advance(1.5);
      marks.push(await grab('_ck_2_freeze', 5.5, 16, 75));
      await advance(0.8);
      marks.push(await grab('_ck_3_freeze_late', 5, 16, 75));
      for (let i = 0; i < 600; i++) { st = await state(); if (st.phase !== 'wait') break; await advance(0.05); }
      // the rush: frames at 0.0, 0.12, 0.3, 0.55, 0.9 s after the spring
      const rushMarks = [0.0, 0.12, 0.3, 0.55, 0.9];
      let prev = 0;
      for (let i = 0; i < rushMarks.length; i++) {
        const dtm = rushMarks[i] - prev;
        if (dtm > 0) await advance(dtm, 1 / 60);
        prev = rushMarks[i];
        marks.push(await grab(`_ck_${4 + i}_rush`, 8 + 2 * i, 11, 0));
      }
      writeFileSync(`${out}/_ck_frames.json`, JSON.stringify(marks));
    }
  }
} catch (e) {
  console.error('r6_stills failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
process.exit(code || (errors.length ? 3 : 0));
