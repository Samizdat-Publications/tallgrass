// In-engine grounding probe and clip (R-grounding). Runs the REAL game in headless Chromium on the GPU and, every rendered frame, reads what
// the animal layer wrote for every wolf (instance matrix, gait phase and speed, body-height offset), then evaluates the CPU mirror of the
// leg shader (src/render/models/legmath.ts) on those real inputs. So the numbers include everything the foot-slip rig leaves out: the
// smoothed drawn path, speed changes, turns, the heading follower and the real terrain.
//
//   node tools/grounding_probe.mjs measure [--root <dir of a checkout>] [--secs 70] [--out file.json]
//       slip, foot-to-ground error and heading-vs-travel angle of every moving wolf, bucketed by camera distance (documentary camera)
//   node tools/grounding_probe.mjs clip [--out review/wip/grounding] [--name grounding]
//       follows a running wolf (follow camera, 28 m) for about 11 s: an mp4 (ffmpeg) and three JPEG stills (q88)
//
// --root points the dev server at another checkout (the main repo for the "before" numbers); the probe feature-detects slopeResponse.
// Always run under a timeout. Never an OS screen grab.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'measure';
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const root = resolve(arg('root', '.'));
const secs = Number(arg('secs', '70'));
const kill = setTimeout(() => { console.error('grounding_probe: hard timeout'); process.exit(2); }, 12 * 60 * 1000);
const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  cacheDir: resolve('scratch/_vitecache_grounding_' + (root.includes('r-grounding') || root === resolve('.') ? 'new' : 'main')),
  server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false, watch: { ignored: ['**/scratch/**', '**/review/**', '**/dist/**', '**/journey/**', '**/art/**', '**/.claude/**', '**/node_modules/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  logLevel: 'error',
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
let code = 0;

// Installed in the page: the probe itself.
const PROBE = `(async () => {
  const L = await import('/src/render/models/legmath.ts');
  const W = await import('/src/sim/world.ts');
  const A = window.__animals, E = window.__engine;
  const b = A.batches[1], p = b.def.params, rig = A.rigs[1];
  const calm = b.def.far?.calm ?? 0;
  const hasSlope = typeof L.slopeResponse === 'function';
  const BUCKETS = [[0, 45], [45, 90], [90, 150], [150, 260]];
  const acc = BUCKETS.map(() => ({ foot: 0, body: 0, n: 0, g: [], ang: [], angS: [], frames: 0, ds: 0 }));
  const hist = new Map();
  let clock = 0;
  const prev = new Map();
  const world = A.world;
  const ground = (x, z) => W.sampleHeight(world.height, world.hn, world.cell, x, z);
  let frames = 0, used = 0;
  window.__probe = { hasSlope, acc, BUCKETS, get frames() { return frames; }, get used() { return used; }, prev };
  E.onFrame((dt) => {
    frames++;
    clock += dt;
    const te = b.mesh.instanceMatrix.array, ga = b.gait.array, fx = b.fx.array;
    const cp = A.shared.uCamPos.value;
    const seen = new Set();
    for (let k = 0; k < b.count; k++) {
      const id = b.ids[k];
      const o = k * 16, g = k * 4;
      const spd = ga[g + 1];
      if (!(spd > 2.0)) { prev.delete(id); hist.delete(id); continue; }
      const s = Math.hypot(te[o], te[o + 1], te[o + 2]);
      const R = [te[o] / s, te[o + 4] / s, te[o + 8] / s, te[o + 1] / s, te[o + 5] / s, te[o + 9] / s, te[o + 2] / s, te[o + 6] / s, te[o + 10] / s];
      const inst = { x: te[o + 12], y: te[o + 13], z: te[o + 14], s, pitch: Math.asin(Math.max(-1, Math.min(1, R[3]))), roll: Math.atan2(-R[5], R[4]), ch: 1, sh: 0 };
      const camD = Math.hypot(cp.x - inst.x, cp.y - inst.y, cp.z - inst.z);
      const bi = BUCKETS.findIndex(([lo, hi]) => camD >= lo && camD < hi);
      if (bi < 0) { prev.delete(id); continue; }
      const sr = hasSlope ? L.slopeResponse(inst.pitch, inst.roll, camD) : { dp: 0, dr: 0, strideK: 1 };
      const gm = L.gaitMix(p, spd, 0, sr.strideK);
      const ph = ga[g], bdy = fx[g + 1];
      const farK = L.sstep(20, 110, camD), ikK = 1 - L.sstep(L.IK_NEAR, L.IK_FAR, camD);
      const calmK = 1 - calm * L.sstep(150, 380, camD);
      const bm = L.bodyMotion(p, gm, ph, farK, bdy, 0, sr.dp, sr.dr);
      const feet = [];
      for (let leg = 0; leg < 4; leg++) {
        const bb = leg < 2 ? rig.front : rig.hind;
        const z = (leg & 1 ? 1 : -1) * bb.z;
        const gy = ikK > 0.001 ? ikK * L.groundUnderFoot(inst, R, ground, bb.foot[0] + L.footPath(gm, ph, leg, calmK).footX, bb.foot[1], z) : 0;
        const aim = L.aimLeg(p, rig, gm, ph, leg, z, gy, bm, calmK);
        const m = L.footModel(p, rig, leg, z, aim, bm);
        const w = L.instanceToWorld(inst, R, m[0], m[1], m[2]);
        feet.push({ w, stance: aim.path.stance });
      }
      const pv = prev.get(id);
      const a = acc[bi];
      if (pv && pv.bi === bi) {
        const db = Math.hypot(inst.x - pv.x, inst.y - pv.y, inst.z - pv.z);
        // only frames where the wolf is really travelling (drawn speed over 3 m/s): a body turning on the spot is not a gait
        if (db > 1e-4 && db < 3 && dt > 1e-4 && db / dt > 3) {
          for (let leg = 0; leg < 4; leg++) {
            if (feet[leg].stance && pv.feet[leg].stance) {
              a.foot += Math.hypot(feet[leg].w[0] - pv.feet[leg].w[0], feet[leg].w[1] - pv.feet[leg].w[1], feet[leg].w[2] - pv.feet[leg].w[2]);
              a.body += db;
              a.n++;
            }
          }
          // heading (the body's +x in the world) against the direction of travel, degrees
          const hx = R[0], hz = R[6];
          const tx = inst.x - pv.x, tz = inst.z - pv.z;
          const th = Math.hypot(tx, tz);
          if (th > 0.003) a.ang.push(Math.acos(Math.max(-1, Math.min(1, (hx * tx + hz * tz) / (Math.hypot(hx, hz) * th)))) * 180 / Math.PI);
          a.ds += db; a.frames++;
        }
      }
      for (let leg = 0; leg < 4; leg++) if (feet[leg].stance && ikK > 0.001) {
        const w = feet[leg].w;
        a.g.push(Math.abs(w[1] - ground(w[0], w[2])) * 100 - 0);
      }
      // centred heading error: the heading 0.1 s ago against the drawn travel over the 0.2 s window around it (no filter lag in either)
      {
        let hs = hist.get(id);
        if (!hs) { hs = []; hist.set(id, hs); }
        hs.push({ t: clock, x: inst.x, z: inst.z, hx: R[0], hz: R[6] });
        while (hs.length > 2 && clock - hs[0].t > 0.5) hs.shift();
        let m = null, o0 = null;
        for (const e of hs) { if (!m || Math.abs(e.t - (clock - 0.1)) < Math.abs(m.t - (clock - 0.1))) m = e; if (!o0 || Math.abs(e.t - (clock - 0.2)) < Math.abs(o0.t - (clock - 0.2))) o0 = e; }
        if (m && o0 && Math.abs(m.t - (clock - 0.1)) < 0.04 && Math.abs(o0.t - (clock - 0.2)) < 0.04) {
          const tx = inst.x - o0.x, tz = inst.z - o0.z, th = Math.hypot(tx, tz);
          if (th > 0.6) acc[bi].angS.push(Math.acos(Math.max(-1, Math.min(1, (m.hx * tx + m.hz * tz) / (Math.hypot(m.hx, m.hz) * th)))) * 180 / Math.PI);
        }
      }
      prev.set(id, { x: inst.x, y: inst.y, z: inst.z, bi, feet });
      used++;
    }
  });
  return hasSlope;
})()`;

async function startPage(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[page exception]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 300)); } });
  return { ctx, page };
}
const pct = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

try {
  if (mode === 'measure') {
    const { ctx, page } = await startPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(base + '/index.html?autoscale=0', { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
    await page.waitForTimeout(1000);
    const hasSlope = await page.evaluate(PROBE);
    await page.evaluate("window.__speed(1)");
    // the documentary director films hunts; to put wolves at many distances also swing the camera between the wolf pack and a far view
    const t0 = Date.now();
    let step = 0;
    while ((Date.now() - t0) / 1000 < secs) {
      const ph = step++ % 6;
      await page.evaluate(([ph, step]) => {
        const e = window.__engine;
        const ids = window.__find(1);
        if (ids.length) window.__followId(ids[(step * 7 + ph) % ids.length]);
        e.cam.setView({ distance: [26, 60, 110, 190, 40, 130][ph], pitchDeg: [14, 20, 24, 28, 16, 22][ph] }, true);
      }, [ph, step]);
      await page.waitForTimeout(6000);
    }
    const res = await page.evaluate(() => {
      const P = window.__probe;
      return { hasSlope: P.hasSlope, frames: P.frames, used: P.used, buckets: P.BUCKETS.map((bk, i) => { const a = P.acc[i]; return { bk, foot: a.foot, body: a.body, n: a.n, g: a.g.length, gMean: a.g.length ? a.g.reduce((s, v) => s + v, 0) / a.g.length : NaN, gArr: a.g.slice(0, 20000), ang: a.ang.slice(0, 20000), angS: a.angS.slice(0, 20000), frames: a.frames }; }) };
    });
    const out = res.buckets.map((r) => ({
      camD: `${r.bk[0]}-${r.bk[1]} m`, wolfFrames: r.frames, slipPct: r.body > 0 ? +(100 * r.foot / r.body).toFixed(1) : null,
      groundMeanCm: r.g ? +r.gMean.toFixed(1) : null, groundP95Cm: +pct(r.gArr, 0.95).toFixed(1),
      headingOffMeanDeg: r.ang.length ? +(r.ang.reduce((s, v) => s + v, 0) / r.ang.length).toFixed(1) : null, headingOffP95Deg: +pct(r.ang, 0.95).toFixed(1),
      centredMeanDeg: r.angS.length ? +(r.angS.reduce((s, v) => s + v, 0) / r.angS.length).toFixed(1) : null, centredMedianDeg: +pct(r.angS, 0.5).toFixed(1), centredP95Deg: +pct(r.angS, 0.95).toFixed(1), over30Pct: r.angS.length ? +(100 * r.angS.filter((v) => v > 30).length / r.angS.length).toFixed(1) : null,
    }));
    console.log(`slopeResponse present: ${res.hasSlope}; frames ${res.frames}; wolf samples ${res.used}`);
    console.table(out);
    const file = arg('out', '');
    if (file) { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(resolve(file), JSON.stringify({ root, hasSlope: res.hasSlope, out }, null, 1)); }
    await ctx.close();
  } else if (mode === 'clip') {
    const outDir = resolve(arg('out', 'review/wip/grounding'));
    const name = arg('name', 'grounding');
    mkdirSync(outDir, { recursive: true });
    const tmp = resolve('scratch/_grounding_tmp');
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const { ctx, page } = await startPage({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } });
    await page.goto(base + '/index.html?autoscale=0&autocam=0', { waitUntil: 'load', timeout: 240000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
    await page.waitForTimeout(1500);
    await page.evaluate("window.__speed(1)");
    // wait for a wolf that is actually running (chase or run states), up to 90 s
    let id = null;
    for (let i = 0; i < 90 && id === null; i++) {
      id = await page.evaluate(() => { const c = window.__find(1, 5).concat(window.__find(1, 10)).concat(window.__find(1, 6)); return c.length ? c[0] : null; });
      if (id === null) await page.waitForTimeout(1000);
    }
    if (id === null) id = await page.evaluate(() => window.__find(1)[0]);
    console.log('following wolf', id);
    const t0 = Date.now();
    await page.evaluate((id) => { window.__followId(id); window.__engine.cam.setView({ distance: 24, pitchDeg: 13, yawDeg: 40 }, true); }, id);
    await page.evaluate(() => { window.__ui.photo.set('hideUi', true); });
    // keep the camera on the fastest wolf: every 1.5 s, if the followed one has slowed down, switch to the one that is running hardest
    const pick = () => page.evaluate(() => {
      const A = window.__animals; let best = null, bv = 0;
      for (const id of window.__find(1)) { const sl = A.slots.map.get(id); if (sl === undefined) continue; const v = A.slots.vis[sl]; if (v > bv) { bv = v; best = id; } }
      return { id: best, v: bv };
    });
    const stillAt = new Set([3, 6, 9]);
    let n = 0;
    for (let tick = 1; tick <= 8; tick++) {
      await page.waitForTimeout(1500);
      const pk = await pick();
      if (pk.id !== null && pk.v > 3) { await page.evaluate((id) => { window.__followId(id); }, pk.id); }
      console.log('t', (tick * 1.5).toFixed(1), 'follow', pk.id, 'speed', pk.v.toFixed(1));
      if (stillAt.has(tick)) await page.screenshot({ path: resolve(outDir, `${name}_still${++n}.jpg`), type: 'jpeg', quality: 88 });
    }
    await page.waitForTimeout(500);
    const dur = (Date.now() - t0) / 1000;
    const video = page.video();
    await ctx.close();
    const webm = await video.path();
    const mp4 = resolve(outDir, `${name}_wolf_run.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', `-${Math.min(11.5, dur)}`, '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-r', '30', mp4]);
    console.log('saved', mp4, `(${Math.min(11.5, dur).toFixed(1)} s)`);
  }
  console.log('page errors:', errors.length, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.error('grounding_probe failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
