// r-life stills: puppet animals through the creek (and other staged scenes) and capture a burst of frames from the real game.
// The sim is left running at 1x; the incoming snapshots are edited in the page so chosen animals walk, trot or run a line across the creek
// (the layer cannot tell: it draws what the snapshot says). Never an OS screen grab.
//
// Usage: node tools/r_life_shots.mjs --scene wade_bison --out review/wip/r-life/before [--n 6] [--gap 700] [--size 1280x720] [--day 0.62] [--rain 0]
// Scenes: wade_bison, wade_wolf, wade_run, wade_pack, wade_front, wade_deer
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const out = arg('out', 'scratch/r_life');
const scene = arg('scene', 'wade_bison');
const N = Number(arg('n', 6)), GAP = Number(arg('gap', 700));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const day = Number(arg('day', 0.62)), rain = Number(arg('rain', 0));
const ck = Number(arg('ck', 0.5)); // creek fraction where the crossing is
const at = arg('at', ''); // arena centre x,z (default: the emptiest dry spot, which differs from run to run)
const ext = 'jpg';

// puppet specs: sp, state, speed (world m/s), lateral offset along the creek (m), cross offset (m)
const SCENES = {
  wade_bison: { cam: [17, 12, 'side'], pup: [[0, 2, 1.5, 0, 0], [0, 2, 1.4, 5, 3], [0, 2, 1.3, -5, 6]] },
  wade_wolf: { cam: [14, 11, 'side'], pup: [[1, 2, 3.2, 0, 0], [1, 2, 3.0, 4, 2]] },
  wade_run: { cam: [16, 11, 'side'], pup: [[1, 5, 8.5, 0, 0], [0, 4, 7.0, 6, 4]] },
  wade_pack: { cam: [18, 14, 'side'], pup: [[1, 2, 3.0, 0, 0], [1, 2, 3.0, 3, 3], [1, 2, 3.1, -3, 5], [0, 2, 1.5, 8, 10]] },
  wade_front: { cam: [18, 14, 'front'], pup: [[0, 2, 1.4, 0, 0], [1, 2, 3.2, 3, 4]] },
  // alert: three grazing bison on the far bank (cr 34 = 14 m across the creek) and a wolf that trots the crossing line past them
  alert: { arena: true, speed: 0.05, cam: [14, 9, 'side', 10], pup: [[0, 1, 0, 0, 30], [0, 1, 0, 5, 32], [0, 1, 0, -5, 29], [1, 2, 4.0, 9, 0]] },
  alert_pg: { arena: true, speed: 0.05, cam: [16, 9, 'side', 10], pup: [[3, 1, 0, 0, 30], [3, 1, 0, 5, 32], [10, 1, 0, -5, 29], [1, 2, 4.0, 9, 0]] },
  // r-alert2: a wolf trots through a herd that is walking, lying or grazing (puppets loop on a 40 m line; the wolf passes 11 to 12 m off the herd on the camera side)
  alert_walk: { arena: true, speed: 0.05, cam: [24, 8, 'side', 2], pup: [[0, 2, 1.3, -7, 4], [0, 2, 1.2, -2, 9], [0, 2, 1.4, 3, 2], [0, 2, 1.3, 8, 12], [0, 2, 1.2, -5, 17], [0, 2, 1.4, 5, 20], [1, 2, 4.5, 11, 0]] },
  alert_lie: { arena: true, speed: 0.05, cam: [24, 8, 'side', 0], pup: [[0, 8, 0, -7, 17], [0, 8, 0, -2, 22], [0, 8, 0, 3, 19], [0, 8, 0, 8, 23], [0, 8, 0, -5, 25], [0, 8, 0, 5, 15], [1, 2, 4.5, 11, 0]] },
  alert_stand: { arena: true, speed: 0.05, cam: [24, 8, 'side', 0], pup: [[0, 1, 0, -7, 17], [0, 1, 0, -2, 22], [0, 1, 0, 3, 19], [0, 1, 0, 8, 23], [0, 1, 0, -5, 25], [0, 1, 0, 5, 15], [1, 2, 4.5, 11, 0]] },
  alert_mix: { arena: true, speed: 0.05, cam: [26, 8, 'side', 2], pup: [[0, 2, 1.3, -7, 4], [0, 2, 1.2, -2, 9], [0, 8, 0, 3, 19], [0, 8, 0, 8, 23], [0, 1, 0, -5, 25], [0, 1, 0, 5, 15], [1, 2, 4.5, 12, 0]] },
  alert_pg2: { arena: true, speed: 0.05, cam: [20, 8, 'side', 2], pup: [[3, 2, 1.3, -4, 4], [3, 2, 1.2, 0, 9], [3, 1, 0, 4, 22], [10, 2, 1.2, -2, 14], [10, 1, 0, 3, 18], [3, 8, 0, 7, 24], [1, 2, 4.5, 9, 0]] },
  // r-alert2 pop check (--trace): the wolf grazes the edge of the alert range (58 m for a standing or walking herd, 33 m for a bedded one), so it enters and leaves
  trace_walk: { arena: true, speed: 0.05, cam: [24, 8, 'side', 0], pup: [[0, 2, 1.3, 0, 4], [0, 2, 1.2, 3, 9], [0, 2, 1.4, -3, 2], [1, 2, 4.5, 58, 0]] },
  trace_stand: { arena: true, speed: 0.05, cam: [24, 8, 'side', 0], pup: [[0, 1, 0, 0, 20], [0, 1, 0, 3, 23], [0, 1, 0, -3, 17], [1, 2, 4.5, 58, 0]] },
  trace_lie: { arena: true, speed: 0.05, cam: [24, 8, 'side', 0], pup: [[0, 8, 0, 0, 20], [0, 8, 0, 3, 23], [0, 8, 0, -3, 17], [1, 2, 4.5, 33, 0]] },
  trace_pg: { arena: true, speed: 0.05, cam: [24, 8, 'side', 0], pup: [[3, 2, 1.3, 0, 4], [3, 1, 0, 3, 23], [10, 2, 1.2, -3, 17], [1, 2, 4.5, 58, 0]] },
  wade_deer: { cam: [14, 11, 'side'], pup: [[3, 2, 2.0, 0, 0], [10, 2, 2.0, 4, 3], [3, 5, 9.0, -4, 6]] },
};

const kill = setTimeout(() => { console.error('r_life_shots: hard timeout'); process.exit(2); }, 25 * 60 * 1000);
const server = await createServer({ configFile: resolve('vite.config.ts'), server: { port: 5300 + Math.floor(Math.random() * 600), strictPort: false, hmr: false }, logLevel: 'error', cacheDir: resolve('scratch/_vitecache_life') });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[page exception]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 300)); else if (m.text().startsWith('arena')) console.log(m.text()); });
  await page.goto(base + '/index.html?autoscale=0&autocam=0&seed=tallgrass', { waitUntil: 'load', timeout: 900000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => {
    const e = window.__engine, w = e.world, an = window.__animals;
    window.__speed(1); window.__followId(null);
    window.__envO = { season: 1.8, weather: ${rain > 0 ? 1 : 0}, warmth: 0.7, rain: ${rain}, dayFrac: ${day} };
    e.onFrame(() => e.setEnv(window.__envO)); e.setEnv(window.__envO); e.applyEnvNow();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    const nc = w.creek.length / 2, k = Math.min(nc - 3, Math.max(2, Math.floor(nc * ${ck})));
    let cx = w.creek[2 * k], cz = w.creek[2 * k + 1];
    let tx = w.creek[2 * k + 2] - w.creek[2 * k - 2], tz = w.creek[2 * k + 3] - w.creek[2 * k - 1];
    const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    let nx = -tz, nz = tx;
    const creekFrame = { cx, cz, tx, tz, nx, nz };
    const LEN = 40; let t0 = performance.now(); let pups = []; window.__lifePups = () => pups;
    window.__scene = (spec, mode, dist, pitch, fa, arena) => {
      window.__arenaOn = !!arena;
      if (arena) {
        // the emptiest dry spot of the valley: the animals there are only the puppets
        const sn = window.__snap(); let best = -1, bx = 256, bz = 256;
        for (let gx = 60; gx <= 450; gx += 15) for (let gz = 60; gz <= 450; gz += 15) {
          const c = Math.floor(gz / w.cell) * w.n + Math.floor(gx / w.cell);
          if (w.water[c] || w.waterDist[c] < 25) continue;
          let d = 120;
          for (let i = 0; i < sn.count; i++) { const dx = sn.agents[i * 12 + 1] - gx, dz = sn.agents[i * 12 + 2] - gz; const q = Math.sqrt(dx * dx + dz * dz); if (q < d) d = q; }
          if (d > best) { best = d; bx = gx; bz = gz; }
        }
        const fixed = ${JSON.stringify(at)}; if (fixed) { const q = fixed.split(',').map(Number); bx = q[0]; bz = q[1]; }
        cx = bx; cz = bz; tx = 0; tz = 1; nx = 1; nz = 0;
        console.log('arena', bx, bz, 'clear radius', best);
      } else { cx = creekFrame.cx; cz = creekFrame.cz; tx = creekFrame.tx; tz = creekFrame.tz; nx = creekFrame.nx; nz = creekFrame.nz; }
      const used = new Set();
      pups = spec.map((s) => { const c = window.__find(s[0], undefined).filter((i) => !used.has(i)); const id = c.length ? c[Math.floor(c.length / 3)] : null; if (id !== null) used.add(id); return { id, sp: s[0], st: s[1], v: s[2], lat: s[3], cr: s[4] }; }).filter((p) => p.id !== null);
      t0 = performance.now();
      const yaw = (mode === 'side' ? Math.atan2(tx, tz) : Math.atan2(nx, nz)) * 180 / Math.PI;
      e.cam.setView({ x: cx + tx * 1.5 + nx * (fa || 0), y: cz + tz * 1.5 + nz * (fa || 0), distance: dist, pitchDeg: pitch, yawDeg: yaw }, true);
    };
    const puppet = (snap) => {
      if (!snap) return;
      const idx = new Map(); for (let i = 0; i < snap.count; i++) idx.set(snap.ids[i], i);
      const now = (performance.now() - t0) / 1000;
      // an arena scene: every wolf, cougar and coyote that is not a puppet is moved far away (the sim runs on at a crawl, and a real predator in range would answer the alert)
      if (window.__arenaOn) { const mine = new Set(pups.map((q) => q.id)); for (let i = 0; i < snap.count; i++) { const s = snap.agents[i * 12]; if ((s === 1 || s === 5 || s === 6) && !mine.has(snap.ids[i])) { snap.agents[i * 12 + 1] = -4000; snap.agents[i * 12 + 2] = -4000; } } }
      for (const p of pups) {
        const i = idx.get(p.id); if (i === undefined) continue;
        const o = i * 12, A = snap.agents;
        const u = (((now * p.v + p.cr) % LEN) + LEN) % LEN;
        const along = u - LEN / 2;
        A[o + 1] = cx + nx * along + tx * p.lat; A[o + 2] = cz + nz * along + tz * p.lat;
        A[o + 3] = Math.atan2(nz, nx); A[o + 4] = p.v / 1.5; A[o + 7] = p.st; A[o + 8] = 0; A[o + 9] = 0;
      }
    };
    // the puppets are written into the layer's snapshots every frame (the sim's own snapshots can be seconds apart at a crawl)
    const origUpdate = an.update.bind(an);
    an.update = (...a) => { puppet(an.curr); if (an.prev && an.prev !== an.curr) puppet(an.prev); origUpdate(...a); };
  })()`);
  mkdirSync(out, { recursive: true });
  for (const name of scene.split(',')) {
    const sc = SCENES[name];
    if (!sc) { console.log('unknown scene', name); continue; }
    await page.evaluate(`window.__speed(${sc.speed ?? 1})`);
    await page.evaluate(`window.__scene(${JSON.stringify(sc.pup)}, '${sc.cam[2]}', ${sc.cam[0]}, ${sc.cam[1]}, ${sc.cam[3] || 0}, ${sc.arena ? 'true' : 'false'})`);
    await page.evaluate('window.__animals.alertProfile = true; window.__animals.alertMs = 0; window.__animals.alertFrames = 0');
    await page.waitForTimeout(3500 + Number(arg('wait', 0)));
    for (let i = 0; i < N; i++) {
      const p = `${out}/${name}_${String(i).padStart(2, '0')}.${ext}`;
      await page.screenshot({ path: p, type: 'jpeg', quality: 90, timeout: 150000 });
      console.log('saved', p);
      await page.waitForTimeout(GAP);
    }
    if (argv.includes('--trace')) {
      // per frame: the layer clock, and for each puppet grazer the alert weight, the eased yaw, the head-down weight and the drawn heading (reads the layer's slots)
      const tr = await page.evaluate(`(async () => {
        const an = window.__animals, orig = an.update.bind(an), S = an.slots;
        const ids = window.__lifePups().filter((p) => p.sp !== 1).map((p) => p.id);
        const rows = []; let last = performance.now();
        an.update = (...a) => { orig(...a); const t = performance.now(); const r = { t: (t - last) / 1000, c: an.clock, s: ids.map((id) => { const k = S.map.get(id); return k === undefined ? null : [S.al[k], S.aly[k], S.hdn[k], S.hs[k], S.alD[k], S.lie[k], S.alN[k], an.alX[0], an.alZ[0], an.alSnap === an.curr ? 1 : 0]; }) }; last = t; rows.push(r); };
        await new Promise((r) => setTimeout(r, 10000));
        an.update = orig; return rows;
      })()`);
      if (argv.includes('--dump')) console.log(JSON.stringify(tr.filter((_, i) => i % 40 === 0).map((r) => [r.c.toFixed(2), r.s[0] && r.s[0].map((v) => +v.toFixed(2))])));
      const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
      const nB = tr[0].s.length; const worst = [];
      for (let b = 0; b < nB; b++) {
        let mAl = 0, mYaw = 0, mHd = 0, mHs = 0, inR = 0, outR = 0, maxAl = 0, maxYaw = 0, dMin = 1e9, dMax = 0;
        for (let i = 1; i < tr.length; i++) {
          const a = tr[i - 1].s[b], c = tr[i].s[b]; if (!a || !c) continue;
          const dt = Math.max(tr[i].c - tr[i - 1].c, 1e-3);
          mAl = Math.max(mAl, Math.abs(c[0] - a[0]) / dt); mYaw = Math.max(mYaw, Math.abs(c[1] - a[1]) / dt);
          mHd = Math.max(mHd, Math.abs(c[2] - a[2]) / dt); mHs = Math.max(mHs, Math.abs(wrap(c[3] - a[3])) / dt);
          dMin = Math.min(dMin, c[4]); if (c[4] < 1e8) dMax = Math.max(dMax, c[4]);
          maxAl = Math.max(maxAl, c[0]); maxYaw = Math.max(maxYaw, Math.abs(c[1]));
          if (c[0] > 0.5) inR++; else outR++;
        }
        worst.push({ b, 'max alert': +maxAl.toFixed(2), 'max yaw rad': +maxYaw.toFixed(2), 'alert /s': +mAl.toFixed(2), 'yaw rad/s': +mYaw.toFixed(2), 'headdown /s': +mHd.toFixed(2), 'heading rad/s': +mHs.toFixed(2), 'frames alert>0.5': inR, 'not': outR, 'alD min': +dMin.toFixed(1), 'alD max': +dMax.toFixed(1) });
      }
      console.log(name, 'trace', tr.length, 'frames, clock span', (tr[tr.length - 1].c - tr[0].c).toFixed(2), 's');
      console.table(worst);
    }
    if (argv.includes('--bench')) {
      // A/B of the whole animal update with the alert pass on and off (interleaved, 4 s each), the layer's own cost per frame
      const r = await page.evaluate(`(async () => {
        const an = window.__animals, orig = an.update.bind(an); let acc = 0, n = 0;
        an.update = (...a) => { const t = performance.now(); orig(...a); acc += performance.now() - t; n++; };
        const out = { on: [], off: [] };
        for (const mode of [true, false, true, false]) {
          an.alertEnabled = mode; acc = 0; n = 0;
          await new Promise((r) => setTimeout(r, 4000));
          out[mode ? 'on' : 'off'].push(acc / Math.max(1, n));
        }
        an.update = orig; an.alertEnabled = true;
        return out;
      })()`);
      console.log(name, 'animals.update ms per frame (alert on / off):', JSON.stringify(r), 'agents', await page.evaluate('window.__snap().count'));
    }
  }
} catch (e) {
  console.error('r_life_shots failed:', e.message);
  code = 1;
} finally {
  await browser.close();
  await server.close();
  clearTimeout(kill);
}
process.exit(code);
