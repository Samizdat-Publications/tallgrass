// r-idle: stage animals that stand, lie and feed (puppets edited into the layer's snapshots, as tools/r_life_shots.mjs does), then record the
// real game in a headless Chromium on the real GPU (never an OS screen grab): a webm of the whole run, a still per scene, and a JSON of where each
// animal is on screen in each scene so tools/r_idle_motion.py can measure the motion inside its box frame by frame.
//
// Usage: node tools/r_idle_shots.mjs --out scratch/r_idle/on [--scenes herd,rest,feed,watch] [--secs 6] [--size 1280x720] [--query "idle=0"]
// Scenes (puppet = species, state, speed, lateral m, cross m): herd (bison grazing, pronghorn and mule deer standing), rest (a wolf pack, a coyote
// and a bison bedded), feed (wolves, a coyote and a cougar at a kill, no carcass needed: state 6 is the feeding pose), watch (a cat and wolves standing).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = resolve(arg('out', 'scratch/r_idle'));
const scenes = arg('scenes', 'herd,rest,feed,watch').split(',');
const secs = Number(arg('secs', 6));
const query = arg('query', '');
const day = Number(arg('day', 0.62));
const season = Number(arg('season', 1.8));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const noVideo = argv.includes('--no-video');

// species ids: 0 bison, 1 wolf, 3 pronghorn, 5 cougar, 6 coyote, 10 mule deer. states: 0 idle, 1 graze, 6 eat, 8 rest
const SCENES = {
  herd: { cam: [22, 8], pup: [[0, 1, 0, 0, 8], [0, 1, 0, 1, 14], [0, 1, 0, -1, 20], [3, 0, 0, 0, 25], [3, 1, 0, 1, 29], [10, 0, 0, -1, 33]] },
  rest: { cam: [20, 9], pup: [[1, 8, 0, 0, 10], [1, 8, 0, 1, 15], [1, 8, 0, -1, 20], [6, 8, 0, 0, 24], [0, 8, 0, 1, 30]] },
  feed: { cam: [18, 9], pup: [[1, 6, 0, 0, 12], [1, 6, 0, 1, 17], [6, 6, 0, -1, 22], [5, 6, 0, 0, 27]] },
  // staged kill sites: [x offset, z offset, meat left, species id] (wolf 1: 1.8 m patch, bison 0: 3.8 m)
  kill: { cam: [10, 52], pup: [], kills: [[-5, 0, 1.0, 1], [0, 0, 0.7, 1], [5, 0, 0.35, 1], [-2, 9, 1.0, 0]] },
  killlow: { cam: [9, 14], pup: [], kills: [[-5, 0, 1.0, 1], [0, 0, 0.7, 1], [5, 0, 0.35, 1]] },
  // the selection marker: one wolf and one bison standing, the wolf selected; stills at 0.6 s, 3 s and 8 s after the click, then with the pointer over it
  ring: { cam: [11, 12], pup: [[1, 0, 0, 0, 18], [0, 1, 0, 1, 23]], ring: true },
  watch: { cam: [20, 9], pup: [[1, 0, 0, 0, 10], [1, 0, 0, 1, 15], [5, 0, 0, -1, 20], [6, 0, 0, 0, 24], [3, 0, 0, 1, 29]] },
};
const SIZE = { 0: 3.2, 1: 1.7, 3: 1.6, 5: 2.0, 6: 1.3, 10: 1.8 };

const kill = setTimeout(() => { console.error('r_idle_shots: hard timeout'); process.exit(2); }, 30 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5400 + Math.floor(Math.random() * 500), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_idle') });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
mkdirSync(out, { recursive: true });
const vtmp = resolve(out, '_vtmp');
rmSync(vtmp, { recursive: true, force: true });
let code = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(noVideo ? {} : { recordVideo: { dir: vtmp, size: { width: W, height: H } } }) });
  const page = await ctx.newPage();
  const t0 = Date.now();
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); else if (m.text().startsWith('arena')) console.log(m.text()); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => {
    const e = window.__engine, w = e.world, an = window.__animals;
    window.__speed(1); window.__followId(null);
    window.__envO = { season: ${season}, weather: 0, warmth: 0.7, rain: 0, dayFrac: ${day} };
    e.onFrame(() => e.setEnv(window.__envO)); e.setEnv(window.__envO); e.applyEnvNow();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    const LEN = 40; let pups = []; let cx = 256, cz = 256; let fake = [];
    window.__scene = (spec, dist, pitch, kills) => {
      fake = (kills || []).map((k) => ({ x: 0, z: 0, off: k }));
      const sn = window.__snap(); let best = -1, bx = 256, bz = 256;
      for (let gx = 60; gx <= 450; gx += 15) for (let gz = 60; gz <= 450; gz += 15) {
        const c = Math.floor(gz / w.cell) * w.n + Math.floor(gx / w.cell);
        if (w.water[c] || w.waterDist[c] < 25) continue;
        let d = 120;
        for (let i = 0; i < sn.count; i++) { const dx = sn.agents[i * 12 + 1] - gx, dz = sn.agents[i * 12 + 2] - gz; const q = Math.sqrt(dx * dx + dz * dz); if (q < d) d = q; }
        if (d > best) { best = d; bx = gx; bz = gz; }
      }
      cx = bx; cz = bz;
      for (const k of fake) { k.x = cx + k.off[0]; k.z = cz + k.off[1]; }
      const used = new Set();
      pups = spec.map((s) => { const c = window.__find(s[0], undefined).filter((i) => !used.has(i)); const id = c.length ? c[Math.floor(c.length / 3)] : null; if (id !== null) used.add(id); return { id, sp: s[0], st: s[1], lat: s[3], cr: s[4] }; }).filter((p) => p.id !== null);
      e.cam.setView({ x: cx + 2, y: cz, distance: dist, pitchDeg: pitch, yawDeg: 0 }, true);
      return pups.length;
    };
    // true once every puppet is drawn within 0.6 m of its place (a puppet that was far away is walked there by the layer's weight follower first)
    window.__settled = () => {
      const v = new e.camera.position.constructor(); let worst = 0;
      for (const p of pups) { if (!an.getPosition(p.id, v)) return false; worst = Math.max(worst, Math.hypot(v.x - (cx + p.cr - LEN / 2), v.z - (cz + p.lat))); }
      return worst < 0.6;
    };
    window.__screenBoxes = (sizes) => {
      const cam = e.camera; cam.updateMatrixWorld(); const P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements;
      const v = new cam.position.constructor(); const res = [];
      for (const p of pups) {
        if (!an.getPosition(p.id, v)) continue;
        const x = v.x, y = v.y + 0.5, z = v.z;
        const vx = V[0] * x + V[4] * y + V[8] * z + V[12], vy = V[1] * x + V[5] * y + V[9] * z + V[13], vz = V[2] * x + V[6] * y + V[10] * z + V[14], vw = V[3] * x + V[7] * y + V[11] * z + V[15];
        const cxn = P[0] * vx + P[4] * vy + P[8] * vz + P[12] * vw, cyn = P[1] * vx + P[5] * vy + P[9] * vz + P[13] * vw, cwn = P[3] * vx + P[7] * vy + P[11] * vz + P[15] * vw;
        const sx = (cxn / cwn * 0.5 + 0.5) * innerWidth, sy = (1 - (cyn / cwn * 0.5 + 0.5)) * innerHeight;
        const pxm = innerHeight * P[5] * 0.5 / Math.abs(vz);
        const half = (sizes[p.sp] || 1.5) * 0.5 * pxm;
        res.push({ id: p.id, sp: p.sp, st: p.st, x: sx, y: sy, half, pxm });
      }
      return res;
    };
    const puppet = (snap) => {
      if (!snap) return;
      const idx = new Map(); for (let i = 0; i < snap.count; i++) idx.set(snap.ids[i], i);
      // every animal that is not a puppet is sent far off to the side, so only the staged ones are in the picture (and in the motion boxes)
      const mine = new Set(pups.map((p) => p.id));
      for (let i = 0; i < snap.count; i++) { if (!mine.has(snap.ids[i])) { snap.agents[i * 12 + 1] = cx + 900; snap.agents[i * 12 + 2] = cz + 900; } }
      for (const p of pups) {
        const i = idx.get(p.id); if (i === undefined) continue;
        const o = i * 12, A = snap.agents;
        A[o + 1] = cx + (p.cr - LEN / 2); A[o + 2] = cz + p.lat;
        A[o + 3] = 0; A[o + 4] = 0; A[o + 7] = p.st; A[o + 8] = 0; A[o + 9] = 0;
      }
    };
    const origUpdate = an.update.bind(an);
    an.update = (...a) => {
      puppet(an.curr); if (an.prev && an.prev !== an.curr) puppet(an.prev); origUpdate(...a);
      // staged kill sites (the stain on the ground only: no carcass body): the layer's own kill-site mesh is fed a snapshot with just these
      if (fake.length) { const c = new Float32Array(fake.length * 4); fake.forEach((k, i) => { c[i * 4] = k.x; c[i * 4 + 1] = k.z; c[i * 4 + 2] = k.off[2]; c[i * 4 + 3] = k.off[3]; }); an.kills.setSnapshot({ carcassCount: fake.length, carcasses: c }); }
    };
  })()`);
  const meta = { size: [W, H], scenes: {} };
  for (const name of scenes) {
    const sc = SCENES[name];
    if (!sc) { console.log('unknown scene', name); continue; }
    const n = await page.evaluate(`window.__scene(${JSON.stringify(sc.pup)}, ${sc.cam[0]}, ${sc.cam[1]}, ${JSON.stringify(sc.kills || [])})`);
    await page.waitForFunction('window.__settled()', null, { timeout: 240000, polling: 500 }).catch(() => console.log('not settled'));
    await page.waitForTimeout(4000); // the poses ease in (lie 0.9 s, head 0.3 s) and the camera settles
    const boxes = await page.evaluate(`window.__screenBoxes(${JSON.stringify(SIZE)})`);
    await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 90, timeout: 150000 });
    if (sc.ring) {
      const id = boxes[0].id;
      await page.evaluate(`window.__select(${id})`);
      for (const [lab, wait] of [['a_0.6s', 600], ['b_3s', 2400], ['c_8s', 5000]]) {
        await page.waitForTimeout(wait);
        await page.screenshot({ path: `${out}/ring_${lab}.jpg`, type: 'jpeg', quality: 90, timeout: 150000 });
      }
      const b = await page.evaluate(`window.__screenBoxes(${JSON.stringify(SIZE)})`);
      await page.mouse.move(b[0].x - 30, b[0].y);
      await page.mouse.move(b[0].x, b[0].y, { steps: 4 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/ring_d_hover.jpg`, type: 'jpeg', quality: 90, timeout: 150000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/ring_e_hover2s.jpg`, type: 'jpeg', quality: 90, timeout: 150000 });
    }
    const tStart = (Date.now() - t0) / 1000;
    await page.waitForTimeout(secs * 1000);
    const tEnd = (Date.now() - t0) / 1000;
    meta.scenes[name] = { tStart, tEnd, boxes, puppets: n };
    console.log(name, 'puppets', n, 'window', tStart.toFixed(1), tEnd.toFixed(1), 'boxes', boxes.length);
  }
  await page.close();
  await ctx.close();
  writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 1));
  if (!noVideo) {
    const f = readdirSync(vtmp).find((x) => x.endsWith('.webm'));
    if (f) renameSync(`${vtmp}/${f}`, `${out}/run.webm`);
    rmSync(vtmp, { recursive: true, force: true });
  }
} catch (e) {
  console.error('r_idle_shots failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
