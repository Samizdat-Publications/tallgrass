// r-death: staged deaths, takedowns and ice crossings, played through the real animal layer with synthetic snapshots.
// The layer draws what the snapshot says, so a scripted scenario (prey running, wolves chasing, the prey removed and a carcass added at
// the kill tick, the way the sim reports a death) shows exactly what the game would. Real sim snapshots are swallowed; one synthetic
// snapshot is made per real tick (10 Hz at 1x), so the layer's interpolation clock stays right. Frames are timestamped screenshots.
//
// Usage: node tools/r_death_shots.mjs --scene take --out review/wip/r-death/before [--speed 1] [--dur 9] [--size 960x540]
// Scenes: take (pronghorn run down by two wolves), takeclose, raven_die, raven_land, ice (wolves and pronghorn on a frozen pond), cougar
// Output: <out>/<scene>_<ms>.jpg, ms = wall-clock milliseconds since the scene's t=0; tools/r_death_sheet.py tiles them at 8 fps.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/r_death');
const scenes = arg('scene', 'take').split(',');
const speed = Number(arg('speed', 1));
const dur = Number(arg('dur', 9));
const [W, H] = arg('size', '960x540').split('x').map(Number);
const day = Number(arg('day', 0.62));
const winter = argv.includes('--winter');

const kill = setTimeout(() => { console.error('r_death_shots: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_death') });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); else if (m.text().startsWith('death:')) console.log(m.text()); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => {
    const e = window.__engine, w = e.world, an = window.__animals;
    window.__speed(${speed}); window.__followId(null);
    const sea = ${winter ? 3.15 : 1.8};
    window.__envO = { season: sea, weather: ${winter ? 4 : 0}, warmth: ${winter ? 0.1 : 0.7}, rain: 0, dayFrac: ${day} };
    e.onFrame(() => e.setEnv(window.__envO)); e.setEnv(window.__envO); e.applyEnvNow();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    const SP = { bison: 0, wolf: 1, raven: 2, pron: 3, cougar: 5 };
    // ---- where: the emptiest dry spot (or, for ice, the middle of a pond)
    const emptiest = () => {
      const sn = window.__snap(); let best = -1, bx = 256, bz = 256;
      for (let gx = 60; gx <= 450; gx += 15) for (let gz = 60; gz <= 450; gz += 15) {
        const c = Math.floor(gz / w.cell) * w.n + Math.floor(gx / w.cell);
        if (w.water[c] || w.waterDist[c] < 25) continue;
        let d = 120;
        for (let i = 0; i < sn.count; i++) { const dx = sn.agents[i * 12 + 1] - gx, dz = sn.agents[i * 12 + 2] - gz; const q = Math.sqrt(dx * dx + dz * dz); if (q < d) d = q; }
        if (d > best) { best = d; bx = gx; bz = gz; }
      }
      return [bx, bz];
    };
    const pond = () => {
      // the water cell with the most water round it (a pond, not the creek)
      let best = -1, bx = 256, bz = 256; const n = w.n, R = 6;
      for (let j = R; j < n - R; j += 2) for (let i = R; i < n - R; i += 2) {
        if (!w.water[j * n + i]) continue;
        let k = 0;
        for (let dj = -R; dj <= R; dj += 2) for (let di = -R; di <= R; di += 2) if (w.water[(j + dj) * n + i + di]) k++;
        if (k > best) { best = k; bx = (i + 0.5) * w.cell; bz = (j + 0.5) * w.cell; }
      }
      console.log('death: pond at', Math.round(bx), Math.round(bz), 'water share', best);
      return [bx, bz];
    };
    // ---- the synthetic snapshot stream
    const orig = an.setSnapshot.bind(an);
    let tick = 0, scen = null, t0tick = 0;
    window.__deathT = () => scen ? (tick - t0tick) / 10 : -1;
    an.setSnapshot = (snap) => {
      if (!scen) return orig(snap);
      tick++;
      const t = (tick - t0tick) / 10;
      const st = scen.at(t);
      const ids = new Uint32Array(st.actors.length), A = new Float32Array(st.actors.length * 12);
      st.actors.forEach((a, i) => {
        ids[i] = a.id; const o = i * 12;
        A[o] = a.sp; A[o + 1] = a.x; A[o + 2] = a.z; A[o + 3] = a.h; A[o + 4] = a.v; A[o + 5] = a.sc ?? 1; A[o + 6] = 0.5; A[o + 7] = a.st; A[o + 8] = 0; A[o + 9] = a.alt ?? 0; A[o + 10] = 0.8; A[o + 11] = 0.4;
      });
      const C = new Float32Array(st.carcasses.length * 4);
      st.carcasses.forEach((c, i) => { C[i * 4] = c.x; C[i * 4 + 1] = c.z; C[i * 4 + 2] = c.rem ?? 1; C[i * 4 + 3] = c.sp; });
      orig({ tick: snap.tick, env: snap.env, count: st.actors.length, ids, agents: A, carcassCount: st.carcasses.length, carcasses: C, pop: snap.pop });
    };
    // a runner: position along +x at speed v from x0 (m), with state and heading 0
    const line = (id, sp, ox, oz, x0, v, st, extra) => (t) => ({ id, sp, x: ox + x0 + v * t, z: oz + (extra?.z ?? 0), h: 0, v, st, ...(extra ?? {}) });
    const SC = {};
    // a pronghorn run down by two wolves: the kill at tk (the prey is removed, a carcass appears where it was); the wolves ease to a stop
    SC.take = (ox, oz, cl) => {
      const tk = 5.0, vp = 11, vw = 12;
      const px = (t) => ox + vp * Math.min(t, tk), kx = px(tk);
      return { cam: { x: (t) => Math.min(ox + vp * Math.min(t, tk) - 1.5, kx - 1), z: oz, dist: cl ? 7.5 : 11, pitch: cl ? 10 : 13, yaw: cl ? 25 : 12 }, at: (t) => {
        const actors = [], carcasses = [];
        if (t < tk) actors.push({ id: 9001, sp: SP.pron, x: px(t), z: oz, h: 0, v: vp, st: 4 });
        else carcasses.push({ x: kx, z: oz, sp: SP.pron });
        // wolves: close at 1 m/s on the prey, then stop 2 m short of the carcass after the kill
        const wolf = (id, gap, lat) => {
          // x(t) = ox + vw t - gap (it starts gap m behind the prey's start and gains 1 m/s); after the kill it brakes over 0.7 s
          let x, v, s = 5;
          const xk = ox + vw * tk - gap;
          if (t < tk) { x = ox + vw * t - gap; v = vw; }
          else { const u = Math.min(t - tk, 0.7); x = xk + vw * u - (vw / 1.4) * u * u; v = Math.max(0, vw * (1 - u / 0.7)); s = t - tk > 0.7 ? 6 : 3; }
          const lim = kx - 1.4; if (x > lim) x = lim;
          return { id, sp: SP.wolf, x, z: oz + lat, h: 0, v, st: s };
        };
        actors.push(wolf(9002, 6.0, 0.5), wolf(9003, 8.5, -1.6));
        return { actors, carcasses };
      } };
    };
    SC.takeclose = (ox, oz) => SC.take(ox, oz, true);
    // a raven shot out of the sky at 12 m and one that lands to feed beside a lying carcass
    SC.raven_die = (ox, oz) => {
      const td = 2.4, vr = 5;
      return { cam: { x: () => ox + vr * td + 3, z: oz, dist: 17, pitch: 6, yaw: 0, h: 3 }, at: (t) => {
        const actors = [], carcasses = [];
        if (t < td) actors.push({ id: 9101, sp: SP.raven, x: ox + vr * t, z: oz, h: 0, v: vr, st: 9, alt: 6 });
        else carcasses.push({ x: ox + vr * td, z: oz, sp: SP.raven });
        return { actors, carcasses };
      } };
    };
    // a pronghorn running at 10 m/s drops dead (no predator near: a quiet death), and a bison that was standing
    SC.pron_die = (ox, oz) => {
      const td = 2.0, vp = 10;
      return { cam: { x: (t) => ox + vp * Math.min(t, td) + 3.5 * (1 - Math.exp(-Math.max(t - td, 0) * 1.5)), z: oz, dist: 8, pitch: 10, yaw: 20 }, at: (t) => {
        const actors = [], carcasses = [];
        if (t < td) actors.push({ id: 9301, sp: SP.pron, x: ox + vp * t, z: oz, h: 0, v: vp, st: 4 });
        else carcasses.push({ x: ox + vp * td, z: oz, sp: SP.pron });
        if (t < td) actors.push({ id: 9302, sp: SP.bison, x: ox + 14, z: oz + 5, h: 1.2, v: 0, st: 1 }); else carcasses.push({ x: ox + 14, z: oz + 5, sp: SP.bison });
        return { actors, carcasses };
      } };
    };
    SC.eagle_die = (ox, oz) => {
      const td = 2.4, vr = 8;
      return { cam: { x: () => ox + vr * td + 3, z: oz, dist: 17, pitch: 6, yaw: 0, h: 3 }, at: (t) => {
        const actors = [], carcasses = [];
        if (t < td) actors.push({ id: 9401, sp: 8, x: ox + vr * t, z: oz, h: 0, v: vr, st: 9, alt: 8 });
        else carcasses.push({ x: ox + vr * td, z: oz, sp: 8 });
        return { actors, carcasses };
      } };
    };
    SC.raven_land = (ox, oz) => {
      return { cam: { x: () => ox + 16, z: oz, dist: 9, pitch: 6, yaw: 0, h: 1.5 }, at: (t) => {
        const actors = [], carcasses = [{ x: ox + 19.5, z: oz + 1.2, sp: SP.pron, rem: 0.8 }];
        const u = Math.min(t / 4.0, 1), lx = ox + 10 + 8 * u, lalt = 5 * (1 - u) * (1 - u);
        actors.push({ id: 9102, sp: SP.raven, x: lx, z: oz, h: 0, v: t < 4.0 ? 5 * (1 - 0.7 * u) : 0, st: t < 4.0 ? 9 : 6, alt: t < 4.0 ? lalt : 0 });
        return { actors, carcasses };
      } };
    };
    // wolves chase a pronghorn round the ring of a frozen pond where the water is shallow (the ice margin), no kill. The path is an arc
    // of the pond's own depth contour, so every foot is on ice; the camera sits on the water side and looks across it.
    SC.ice = (ox, oz) => {
      const hAt = (x, z) => {
        const f = Math.min(w.hn - 1.001, Math.max(0, x / w.cell)), g = Math.min(w.hn - 1.001, Math.max(0, z / w.cell));
        const i = Math.floor(f), j = Math.floor(g), tx = f - i, tz = g - j, H = w.height, n = w.hn;
        return (H[j * n + i] * (1 - tx) + H[j * n + i + 1] * tx) * (1 - tz) + (H[(j + 1) * n + i] * (1 - tx) + H[(j + 1) * n + i + 1] * tx) * tz;
      };
      const depthAt = (x, z) => { const c = Math.floor(z / w.cell) * w.n + Math.floor(x / w.cell); return w.water[c] ? w.waterHeight[c] - hAt(x, z) : -1; };
      let bestR = 10, bestE = 1e9;
      for (let r = 3; r < 46; r += 1) {
        let sum = 0, bad = 0;
        for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, d = depthAt(ox + Math.cos(a) * r, oz + Math.sin(a) * r); if (d < 0) bad++; else sum += d; }
        const mean = sum / Math.max(1, 24 - bad), e = Math.abs(mean - 0.4) + bad * 0.1;
        if (e < bestE) { bestE = e; bestR = r; }
      }
      // the arc: the 80 degree stretch of that ring whose depth stays closest to 0.4 m
      let bestA = 0, bestS = 1e9;
      for (let k = 0; k < 36; k++) { const a0 = (k / 36) * Math.PI * 2; let sc = 0; for (let q = 0; q <= 8; q++) { const a = a0 + (q / 8) * 1.2, d = depthAt(ox + Math.cos(a) * bestR, oz + Math.sin(a) * bestR); sc += d < 0.1 ? 3 : Math.abs(d - 0.4); } if (sc < bestS) { bestS = sc; bestA = a0; } }
      console.log('death: ice ring r', bestR, 'arc from', bestA.toFixed(2), 'score', bestS.toFixed(2));
      const r = bestR, vp = 9, vw = 9.3, L = 30, span = L / r, am = bestA + 0.6;
      const pt = (th, lat) => ({ x: ox + Math.cos(th) * (r + lat), z: oz + Math.sin(th) * (r + lat), h: th + Math.PI / 2 });
      const cdx = ox + Math.cos(am) * (r - 13), cdz = oz + Math.sin(am) * (r - 13);
      return { cam: { x: () => ox + Math.cos(am) * r, z: oz + Math.sin(am) * r, dist: 13, pitch: 13, yaw: Math.atan2(-Math.cos(am), -Math.sin(am)) * 180 / Math.PI }, at: (t) => {
        const actors = [];
        const th = (gap, lat) => { const u = ((t * vp - gap) % L + L) % L; return pt(bestA + 0.6 - span / 2 + u / r, lat); };
        const q = th(0, 0); actors.push({ id: 9001, sp: SP.pron, x: q.x, z: q.z, h: q.h, v: vp, st: 4 });
        [[9002, 5, 0.4], [9003, 7.5, -1.2]].forEach(([id, gap, lat]) => { const u = th(gap, lat); actors.push({ id, sp: SP.wolf, x: u.x, z: u.z, h: u.h, v: vw, st: 5 }); });
        return { actors, carcasses: [] };
      } };
    };
    // a cougar pounces on a mule deer standing still
    SC.cougar = (ox, oz) => ({ cam: { x: () => ox + 3, z: oz, dist: 13, pitch: 12, yaw: 20 }, at: (t) => {
      const tk = 2.5, actors = [], carcasses = [];
      if (t < tk) actors.push({ id: 9201, sp: 10, x: ox + 4, z: oz, h: 0.3, v: 0, st: 1 });
      else carcasses.push({ x: ox + 4, z: oz, sp: 10 });
      const cx = ox - 6 + Math.min(t, tk) * 3.2;
      actors.push({ id: 9202, sp: SP.cougar, x: Math.min(cx, ox + 2.2), z: oz, h: 0, v: t < tk ? 12 : 0, st: t < tk ? 5 : 6 });
      return { actors, carcasses };
    } });
    window.__death = {
      start: (name) => {
        const isIce = name === 'ice';
        const [ox, oz] = isIce ? pond() : emptiest();
        const sc = SC[name](ox, oz);
        scen = sc; t0tick = tick;
        window.__deathCam = sc.cam; window.__camLog = ${argv.includes('--camlog')};
        e.onFrame(() => {
          if (!scen || scen !== sc) return;
          const t = (tick - t0tick) / 10, c = sc.cam;
          e.cam.setView({ x: c.x(t), y: c.z, distance: c.dist, pitchDeg: c.pitch, yawDeg: c.yaw, ...(c.h !== undefined ? { h: c.h } : {}) }, true);
          if (window.__camLog && Math.floor(t * 2) !== window.__camLogT) { window.__camLogT = Math.floor(t * 2); const q = e.camera.position; console.log('death: t', t.toFixed(1), 'cam', q.x.toFixed(1), q.y.toFixed(1), q.z.toFixed(1), 'target', c.x(t).toFixed(1), c.z.toFixed(1), 'pitch', (e.cam.cur?.pitch * 57.3)?.toFixed(1), 'dist', e.cam.cur?.dist?.toFixed(1)); }
        });
      },
      stop: () => { scen = null; },
    };
  })()`);
  mkdirSync(out, { recursive: true });
  for (const name of scenes) {
    // warm up (shader compiles and texture uploads at the first sight of a species stall a frame or two), then restart the clock
    await page.evaluate(`window.__death.start('${name}')`);
    await page.screenshot({ path: `${out}/_warm.jpg`, type: 'jpeg', quality: 50, timeout: 150000 });
    await page.screenshot({ path: `${out}/_warm.jpg`, type: 'jpeg', quality: 50, timeout: 150000 });
    await page.evaluate('window.__death.stop()');
    await page.evaluate(`window.__death.start('${name}')`);
    const t0 = Date.now();
    let n = 0;
    while (true) {
      // (names carry wall-clock ms since the scene started: at 10x the scene's own clock runs ten times faster than the layer's falls)
      if (Date.now() - t0 > dur * 1000) break;
      const ms = String(Date.now() - t0).padStart(6, '0');
      await page.screenshot({ path: `${out}/${name}_${ms}.jpg`, type: 'jpeg', quality: 90, timeout: 150000 });
      n++;
      if (Date.now() - t0 > 240000) break;
    }
    console.log(name, 'saved', n, 'frames to', out);
    await page.evaluate('window.__death.stop()');
  }
} catch (e) {
  console.error('r_death_shots failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
